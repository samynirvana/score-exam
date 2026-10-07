// floatingChat.js - Standalone Native Floating Chat Room & Real-time Notifications
import { db, auth } from "./firebase.js";
import { 
    collection, addDoc, getDocs, doc, updateDoc, query, where, onSnapshot, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { escapeHtml, formatTimeAgo } from "./utils.js";

// Global State
let currentUser = null;
let currentChatPartner = null;
let allUserDirectory = [];
let pendingAttachment = null;
let unsubscribeThreads = null;
let unsubscribeStream = null;
let unsubscribeNotifs = null;

// Format nickname (first name)
function formatNickname(name) {
    if (!name || typeof name !== 'string') return 'User';
    const trimmed = name.trim();
    if (!trimmed) return 'User';
    if (trimmed.toLowerCase() === 'administrator') return 'Administrator';
    const parts = trimmed.split(/\s+/);
    return parts[0] || trimmed;
}

// Resolve user avatar
function getAvatarHTML(name, photoUrl) {
    const initial = escapeHtml(name ? name.trim().charAt(0).toUpperCase() : '?');
    if (photoUrl && photoUrl.trim()) {
        return `<div class="portal-avatar-circle"><img src="${escapeHtml(photoUrl)}" alt="Avatar" onerror="this.parentElement.innerHTML='${initial}'"></div>`;
    }
    return `<div class="portal-avatar-circle">${initial}</div>`;
}

// Local Session Storage Fallback for DMs
function getLocalDMMessages() {
    try {
        const stored = sessionStorage.getItem('local_direct_messages');
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function saveLocalDM(msgDoc) {
    const list = getLocalDMMessages();
    list.push(msgDoc);
    sessionStorage.setItem('local_direct_messages', JSON.stringify(list));
}

// Determine Current User
function resolveCurrentUser() {
    // 1. Check student logged-in session
    const rawStudent = sessionStorage.getItem('studentLoggedInSession') 
        || sessionStorage.getItem('studentTimelineSession') 
        || localStorage.getItem('portalRememberedStudent');
    
    if (rawStudent) {
        try {
            const s = JSON.parse(rawStudent);
            if (s && (s.name || s.studentName)) {
                return {
                    type: 'student',
                    name: s.studentName || s.name,
                    code: s.studentCode || s.code || '',
                    studentClass: s.studentClass || s.class || '',
                    photoUrl: s.photoUrl || ''
                };
            }
        } catch {}
    }

    // 2. Check Teacher / Admin Firebase Auth
    if (auth.currentUser) {
        const email = auth.currentUser.email || 'teacher@mitrakasih.sch.id';
        const name = auth.currentUser.displayName || email.split('@')[0];
        return {
            type: 'staff',
            name: name,
            code: email,
            photoUrl: ''
        };
    }

    return null;
}

// Initialize Floating Chat System
export function initFloatingChat() {
    const page = window.location.pathname.split('/').pop().toLowerCase();
    if (page === 'weekly.html' || page === 'weekly') return;

    // Avoid double initialization or collision with timeline.html's own built-in dmFloatingBtn
    if (document.getElementById('portalFloatingChatBtn') || document.getElementById('dmFloatingBtn')) return;

    // Attach listener for Auth state changes
    onAuthStateChanged(auth, () => {
        currentUser = resolveCurrentUser();
        if (currentUser) {
            setupUserUI();
            subscribeThreads();
            subscribeNotifications();
        }
    });

    currentUser = resolveCurrentUser();
    buildChatDOM();

    if (currentUser) {
        setupUserUI();
        subscribeThreads();
        subscribeNotifications();
    }
}

// Construct Native DOM
function buildChatDOM() {
    // 1. Floating Chat Button
    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.id = 'portalFloatingChatBtn';
    chatBtn.className = 'portal-chat-link';
    chatBtn.setAttribute('aria-label', 'Open Chat Room');
    chatBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Chat Room</span>
        <span id="portalChatUnreadBadge" class="portal-unread-badge hidden">0</span>
    `;
    document.body.appendChild(chatBtn);

    // 2. Notification Button
    const makeNotifBtn = (isMobile = false) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'portal-notification-link' + (isMobile ? ' portal-notification-mobile' : '');
        btn.id = isMobile ? 'portalMobileNotifBtn' : 'portalDesktopNotifBtn';
        btn.title = 'Alerts & Notifications';
        btn.setAttribute('aria-label', 'Notifications');
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M10 21h4"></path>
            </svg>
            <span class="portal-notif-badge hidden">0</span>
        `;
        btn.addEventListener('click', toggleNotifPanel);
        return btn;
    };

    const actionsContainer = document.querySelector('.desktop-user-actions') || document.querySelector('.user-profile-bottom');
    if (actionsContainer && !document.getElementById('portalDesktopNotifBtn') && !document.getElementById('notifToggleBtn')) {
        actionsContainer.prepend(makeNotifBtn(false));
    }
    const mobileNotif = makeNotifBtn(true);
    document.body.appendChild(mobileNotif);

    // 3. Floating Chat Popup Widget
    const widget = document.createElement('div');
    widget.id = 'portalChatWidget';
    widget.className = 'portal-chat-widget hidden';
    widget.innerHTML = `
        <!-- HEADER -->
        <div class="portal-chat-header">
            <div class="portal-chat-user-info">
                <div class="portal-chat-status-dot"></div>
                <div>
                    <div class="portal-chat-user-name" id="portalHeaderUserName">Loading...</div>
                    <div class="portal-chat-subtitle">Chat Room</div>
                </div>
            </div>
            <div class="portal-chat-header-actions">
                <button type="button" id="portalNewChatBtn" class="portal-new-chat-btn" title="Start New Chat">+ Add Chat</button>
                <button type="button" id="portalCloseChatBtn" class="portal-chat-close-btn" title="Minimize">&times;</button>
            </div>
        </div>

        <!-- VIEW 1: THREADS LIST -->
        <div id="portalChatThreadsView" class="portal-chat-view">
            <div id="portalChatThreadsList" class="portal-threads-list">
                <div class="portal-empty-state">Loading messages...</div>
            </div>
        </div>

        <!-- VIEW 2: CONTACTS PICKER -->
        <div id="portalChatContactsView" class="portal-chat-view hidden">
            <div class="portal-search-bar">
                <input type="text" id="portalContactSearchInput" placeholder="Search student or teacher name..." autocomplete="off">
                <button type="button" id="portalBackToThreadsBtn" class="portal-back-btn">&larr; Back</button>
            </div>
            <div id="portalChatContactsList" class="portal-contacts-list">
                <div class="portal-empty-state">Loading directory...</div>
            </div>
        </div>

        <!-- VIEW 3: ACTIVE CHAT STREAM -->
        <div id="portalChatStreamView" class="portal-chat-view hidden">
            <div class="portal-chatroom-bar">
                <button type="button" id="portalLeaveChatBtn" class="portal-back-btn">&larr;</button>
                <div class="portal-partner-info">
                    <div class="portal-partner-name" id="portalChatPartnerName">Chat Partner</div>
                    <div class="portal-partner-role" id="portalChatPartnerRole">Student</div>
                </div>
                <div style="position: relative;">
                    <button type="button" id="portalChatKebabBtn" class="portal-compose-tool-btn" style="border:none;" title="Options">&#8942;</button>
                    <div id="portalChatKebabMenu" class="portal-kebab-menu hidden">
                        <button type="button" id="portalDeleteChatBtn" class="portal-kebab-item">Delete Chat</button>
                    </div>
                </div>
            </div>
            <div id="portalChatMessagesStream" class="portal-messages-stream">
                <div class="portal-empty-state">No messages yet. Send a message to start chatting!</div>
            </div>
            <form id="portalChatMsgForm" class="portal-msg-compose-bar">
                <input type="file" id="portalAttachmentInput" hidden>
                <button type="button" id="portalAttachmentBtn" class="portal-compose-tool-btn" title="Attach file or photo">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"></path>
                    </svg>
                </button>
                <button type="button" id="portalEmojiBtn" class="portal-compose-tool-btn" title="Add emoji">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="9"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><path d="M9 9h.01M15 9h.01"></path>
                    </svg>
                </button>
                <div id="portalEmojiPicker" class="portal-emoji-picker hidden">
                    <button type="button">😀</button><button type="button">😃</button><button type="button">😄</button><button type="button">😁</button>
                    <button type="button">😅</button><button type="button">😂</button><button type="button">🤣</button><button type="button">😊</button>
                    <button type="button">😇</button><button type="button">🙂</button><button type="button">😉</button><button type="button">😍</button>
                    <button type="button">🥰</button><button type="button">😎</button><button type="button">🤔</button><button type="button">😮</button>
                    <button type="button">😢</button><button type="button">😭</button><button type="button">😴</button><button type="button">🤝</button>
                    <button type="button">👍</button><button type="button">👎</button><button type="button">👏</button><button type="button">🙌</button>
                    <button type="button">🙏</button><button type="button">💪</button><button type="button">❤️</button><button type="button">🔥</button>
                    <button type="button">✨</button><button type="button">🎉</button><button type="button">✅</button><button type="button">⭐</button>
                    <button type="button">💡</button><button type="button">📚</button><button type="button">🎓</button><button type="button">🚀</button>
                </div>
                <input type="text" id="portalChatMsgInput" placeholder="Write a message..." autocomplete="off">
                <button type="submit" id="portalSendBtn" class="portal-send-btn">Send</button>
            </form>
        </div>
    `;
    document.body.appendChild(widget);

    // 4. Native Notifications Panel
    const notifPanel = document.createElement('div');
    notifPanel.id = 'portalNotifPanel';
    notifPanel.className = 'portal-notif-panel hidden';
    notifPanel.innerHTML = `
        <div class="portal-notif-header">
            <span>Notifications</span>
            <button type="button" id="portalCloseNotifBtn" class="portal-chat-close-btn">&times;</button>
        </div>
        <div id="portalNotifList" class="portal-notif-list">
            <div class="portal-empty-state">Loading notifications...</div>
        </div>
    `;
    document.body.appendChild(notifPanel);

    // Attach UI Event Listeners
    setupWidgetEvents();
}

function setupUserUI() {
    const nameEl = document.getElementById('portalHeaderUserName');
    if (nameEl && currentUser) {
        nameEl.innerText = formatNickname(currentUser.name);
        nameEl.title = currentUser.name;
    }
}

function setupWidgetEvents() {
    const chatBtn = document.getElementById('portalFloatingChatBtn');
    const widget = document.getElementById('portalChatWidget');
    const closeBtn = document.getElementById('portalCloseChatBtn');
    const newChatBtn = document.getElementById('portalNewChatBtn');
    const backBtn = document.getElementById('portalBackToThreadsBtn');
    const leaveBtn = document.getElementById('portalLeaveChatBtn');
    const searchInput = document.getElementById('portalContactSearchInput');
    const msgForm = document.getElementById('portalChatMsgForm');
    const attachmentBtn = document.getElementById('portalAttachmentBtn');
    const attachmentInput = document.getElementById('portalAttachmentInput');
    const emojiBtn = document.getElementById('portalEmojiBtn');
    const emojiPicker = document.getElementById('portalEmojiPicker');
    const kebabBtn = document.getElementById('portalChatKebabBtn');
    const kebabMenu = document.getElementById('portalChatKebabMenu');
    const deleteBtn = document.getElementById('portalDeleteChatBtn');
    const closeNotifBtn = document.getElementById('portalCloseNotifBtn');

    // Toggle Chat Widget
    chatBtn?.addEventListener('click', () => {
        const isHidden = widget.classList.contains('hidden');
        if (isHidden) {
            widget.classList.remove('hidden');
            document.getElementById('portalNotifPanel')?.classList.add('hidden');
            showChatView('threads');
        } else {
            widget.classList.add('hidden');
        }
    });

    closeBtn?.addEventListener('click', () => {
        widget?.classList.add('hidden');
    });

    closeNotifBtn?.addEventListener('click', () => {
        document.getElementById('portalNotifPanel')?.classList.add('hidden');
    });

    newChatBtn?.addEventListener('click', async () => {
        showChatView('contacts');
        await loadUserDirectory();
        renderContactsList('');
    });

    backBtn?.addEventListener('click', () => {
        showChatView('threads');
    });

    leaveBtn?.addEventListener('click', () => {
        if (unsubscribeStream) unsubscribeStream();
        currentChatPartner = null;
        showChatView('threads');
    });

    searchInput?.addEventListener('input', (e) => {
        renderContactsList(e.target.value.trim().toLowerCase());
    });

    // Attachments
    attachmentBtn?.addEventListener('click', () => attachmentInput?.click());
    attachmentInput?.addEventListener('change', handleAttachmentSelect);

    // Emojis
    emojiBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker?.classList.toggle('hidden');
    });
    emojiPicker?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('portalChatMsgInput');
            if (input) {
                input.value += btn.textContent;
                input.focus();
            }
            emojiPicker.classList.add('hidden');
        });
    });

    // Kebab Menu
    kebabBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        kebabMenu?.classList.toggle('hidden');
    });

    deleteBtn?.addEventListener('click', () => {
        kebabMenu?.classList.add('hidden');
        if (currentChatPartner) deleteChatroom(currentChatPartner.code, currentChatPartner.name);
    });

    // Send Message
    msgForm?.addEventListener('submit', sendMessage);

    // Close on click outside & Escape
    document.addEventListener('click', (e) => {
        if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add('hidden');
        }
        if (kebabMenu && !kebabMenu.contains(e.target) && e.target !== kebabBtn) {
            kebabMenu.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            widget?.classList.add('hidden');
            document.getElementById('portalNotifPanel')?.classList.add('hidden');
        }
    });
}

function showChatView(viewName) {
    const threadsView = document.getElementById('portalChatThreadsView');
    const contactsView = document.getElementById('portalChatContactsView');
    const streamView = document.getElementById('portalChatStreamView');

    threadsView?.classList.toggle('hidden', viewName !== 'threads');
    contactsView?.classList.toggle('hidden', viewName !== 'contacts');
    streamView?.classList.toggle('hidden', viewName !== 'stream');
}

function toggleNotifPanel() {
    const notifPanel = document.getElementById('portalNotifPanel');
    if (!notifPanel) return;
    const isHidden = notifPanel.classList.contains('hidden');
    if (isHidden) {
        notifPanel.classList.remove('hidden');
        document.getElementById('portalChatWidget')?.classList.add('hidden');
    } else {
        notifPanel.classList.add('hidden');
    }
}

// Subscribe to Message Threads
function subscribeThreads() {
    if (!currentUser || !currentUser.code) return;
    if (unsubscribeThreads) unsubscribeThreads();

    try {
        const q = query(
            collection(db, "direct_messages"),
            where("participants", "array-contains", currentUser.code)
        );

        unsubscribeThreads = onSnapshot(q, (snapshot) => {
            const listEl = document.getElementById('portalChatThreadsList');
            const totalBadgeEl = document.getElementById('portalChatUnreadBadge');
            if (!listEl) return;

            let messages = [];
            snapshot.forEach(docSnap => messages.push({ id: docSnap.id, ...docSnap.data() }));

            // Merge local fallback messages
            const localMsgs = getLocalDMMessages().filter(m => m.participants.includes(currentUser.code));
            messages = [...messages, ...localMsgs];

            // Filter out hidden
            messages = messages.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));
            messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            const threadsMap = new Map();
            let totalUnread = 0;

            messages.forEach(m => {
                const partnerCode = m.senderCode === currentUser.code ? m.receiverCode : m.senderCode;
                const partnerName = m.senderCode === currentUser.code ? m.receiverName : m.senderName;

                if (!threadsMap.has(partnerCode)) {
                    threadsMap.set(partnerCode, {
                        partnerCode,
                        partnerName,
                        lastMessage: m.message,
                        timestamp: m.timestamp,
                        unread: (!m.read && m.receiverCode === currentUser.code) ? 1 : 0
                    });
                } else if (!m.read && m.receiverCode === currentUser.code) {
                    threadsMap.get(partnerCode).unread += 1;
                }

                if (!m.read && m.receiverCode === currentUser.code) {
                    totalUnread++;
                }
            });

            // Update floating badge
            if (totalBadgeEl) {
                if (totalUnread > 0) {
                    totalBadgeEl.innerText = totalUnread;
                    totalBadgeEl.classList.remove('hidden');
                } else {
                    totalBadgeEl.classList.add('hidden');
                }
            }

            if (threadsMap.size === 0) {
                listEl.innerHTML = `<div class="portal-empty-state">No chats yet. Click "+ Add Chat" to start a chat room!</div>`;
                return;
            }

            listEl.innerHTML = '';
            threadsMap.forEach(thread => {
                const fullPartnerName = thread.partnerName || 'User';
                const nickName = formatNickname(fullPartnerName);
                const dateStr = formatTimeAgo(thread.timestamp);
                const unreadHTML = thread.unread > 0 ? `<span class="portal-unread-badge">${thread.unread}</span>` : '';
                const avatarHTML = getAvatarHTML(fullPartnerName);

                const item = document.createElement('div');
                item.className = 'portal-thread-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                        ${avatarHTML}
                        <div class="portal-contact-details">
                            <div class="portal-contact-name" title="${escapeHtml(fullPartnerName)}">${escapeHtml(nickName)}</div>
                            <div class="portal-preview-msg">${escapeHtml(thread.lastMessage || '')}</div>
                        </div>
                    </div>
                    <div class="portal-thread-meta">
                        <div class="portal-thread-time">${dateStr}</div>
                        ${unreadHTML}
                    </div>
                `;

                item.onclick = () => {
                    const found = allUserDirectory.find(u => u.code === thread.partnerCode) || {
                        name: thread.partnerName,
                        code: thread.partnerCode,
                        role: 'User'
                    };
                    openChatroom(found);
                };

                listEl.appendChild(item);
            });
        }, () => {
            renderLocalThreads();
        });
    } catch {
        renderLocalThreads();
    }
}

function renderLocalThreads() {
    const listEl = document.getElementById('portalChatThreadsList');
    if (!listEl || !currentUser) return;

    let localMsgs = getLocalDMMessages().filter(m => m.participants.includes(currentUser.code));
    localMsgs = localMsgs.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));
    localMsgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const threadsMap = new Map();
    localMsgs.forEach(m => {
        const partnerCode = m.senderCode === currentUser.code ? m.receiverCode : m.senderCode;
        const partnerName = m.senderCode === currentUser.code ? m.receiverName : m.senderName;
        if (!threadsMap.has(partnerCode)) {
            threadsMap.set(partnerCode, {
                partnerCode,
                partnerName,
                lastMessage: m.message,
                timestamp: m.timestamp,
                unread: 0
            });
        }
    });

    if (threadsMap.size === 0) {
        listEl.innerHTML = `<div class="portal-empty-state">No chats yet. Click "+ Add Chat" to start a chat room!</div>`;
        return;
    }

    listEl.innerHTML = '';
    threadsMap.forEach(thread => {
        const fullPartnerName = thread.partnerName || 'User';
        const nickName = formatNickname(fullPartnerName);
        const dateStr = formatTimeAgo(thread.timestamp);
        const avatarHTML = getAvatarHTML(fullPartnerName);

        const item = document.createElement('div');
        item.className = 'portal-thread-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                ${avatarHTML}
                <div class="portal-contact-details">
                    <div class="portal-contact-name" title="${escapeHtml(fullPartnerName)}">${escapeHtml(nickName)}</div>
                    <div class="portal-preview-msg">${escapeHtml(thread.lastMessage || '')}</div>
                </div>
            </div>
            <div class="portal-thread-meta">
                <div class="portal-thread-time">${dateStr}</div>
            </div>
        `;
        item.onclick = () => openChatroom({ name: thread.partnerName, code: thread.partnerCode, role: 'User' });
        listEl.appendChild(item);
    });
}

// Contacts Directory
async function loadUserDirectory() {
    if (allUserDirectory.length > 0) return;

    try {
        const directory = [];
        // 1. Students
        const stuSnap = await getDocs(collection(db, "students"));
        stuSnap.forEach(d => {
            const data = d.data();
            const name = data.studentName || data.name || 'Student';
            const code = data.studentCode || data.code || d.id;
            const cls = data.studentClass || data.class || '';
            directory.push({ name, code, role: cls ? `Student (${cls})` : 'Student', photoUrl: data.photoUrl || '' });
        });

        // 2. Teachers
        const teaSnap = await getDocs(collection(db, "teachers"));
        teaSnap.forEach(d => {
            const data = d.data();
            const name = data.name || data.teacherName || 'Teacher';
            const code = data.email || data.code || d.id;
            directory.push({ name, code, role: 'Teacher', photoUrl: data.photoUrl || '' });
        });

        allUserDirectory = directory;
    } catch (e) {
        console.warn("Could not load user directory:", e);
    }
}

function renderContactsList(filterStr) {
    const listEl = document.getElementById('portalChatContactsList');
    if (!listEl) return;

    const filtered = allUserDirectory.filter(u => {
        if (currentUser && u.code === currentUser.code) return false;
        if (!filterStr) return true;
        return u.name.toLowerCase().includes(filterStr) || (u.role && u.role.toLowerCase().includes(filterStr));
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="portal-empty-state">No contacts found matching "${escapeHtml(filterStr)}".</div>`;
        return;
    }

    listEl.innerHTML = '';
    filtered.forEach(contact => {
        const avatarHTML = getAvatarHTML(contact.name, contact.photoUrl);
        const item = document.createElement('div');
        item.className = 'portal-contact-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                ${avatarHTML}
                <div class="portal-contact-details">
                    <div class="portal-contact-name">${escapeHtml(contact.name)}</div>
                    <div class="portal-preview-msg">${escapeHtml(contact.role || 'User')}</div>
                </div>
            </div>
            <button type="button" class="portal-new-chat-btn">Chat</button>
        `;
        item.onclick = () => openChatroom(contact);
        listEl.appendChild(item);
    });
}

// Active Chatroom
function openChatroom(partner) {
    if (!partner || !currentUser) return;
    currentChatPartner = partner;

    const nameEl = document.getElementById('portalChatPartnerName');
    const roleEl = document.getElementById('portalChatPartnerRole');
    if (nameEl) {
        nameEl.innerText = formatNickname(partner.name);
        nameEl.title = partner.name || '';
    }
    if (roleEl) roleEl.innerText = partner.role || 'User';

    showChatView('stream');
    subscribeMessagesStream();
}

function subscribeMessagesStream() {
    if (!currentUser || !currentChatPartner) return;
    if (unsubscribeStream) unsubscribeStream();

    const pair = [currentUser.code, currentChatPartner.code].sort();

    try {
        const q = query(
            collection(db, "direct_messages"),
            where("participants", "==", pair)
        );

        unsubscribeStream = onSnapshot(q, (snapshot) => {
            const streamEl = document.getElementById('portalChatMessagesStream');
            if (!streamEl) return;

            let messages = [];
            snapshot.forEach(docSnap => messages.push({ docId: docSnap.id, ...docSnap.data() }));

            // Merge local fallback
            const localMsgs = getLocalDMMessages().filter(m => 
                (m.senderCode === currentUser.code && m.receiverCode === currentChatPartner.code) ||
                (m.senderCode === currentChatPartner.code && m.receiverCode === currentUser.code)
            );
            messages = [...messages, ...localMsgs];
            messages = messages.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));

            if (messages.length === 0) {
                streamEl.innerHTML = `<div class="portal-empty-state">No messages yet. Send a message to start chatting!</div>`;
                return;
            }

            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            streamEl.innerHTML = '';
            messages.forEach(data => {
                if (data.docId && !data.read && data.receiverCode === currentUser.code) {
                    updateDoc(doc(db, "direct_messages", data.docId), { read: true }).catch(() => {});
                }

                const isSent = data.senderCode === currentUser.code;
                const msgClass = isSent ? 'portal-msg-sent' : 'portal-msg-received';
                const timeStr = formatTimeAgo(data.timestamp);
                const safeMessage = escapeHtml(data.message || '');

                let attachmentHtml = '';
                if (data.attachment && data.attachment.url) {
                    const attUrl = escapeHtml(data.attachment.url);
                    const attName = escapeHtml(data.attachment.fileName || 'Attachment');
                    const isImg = (data.attachment.mimeType || '').startsWith('image/');
                    attachmentHtml = `
                        <div class="portal-attachment">
                            ${isImg ? `<img src="${attUrl}" alt="${attName}" class="portal-attachment-img" onclick="window.open('${attUrl}', '_blank')">` : ''}
                            <a href="${attUrl}" target="_blank" rel="noopener" download="${attName}" class="portal-attachment-link">📎 ${attName}</a>
                        </div>
                    `;
                }

                const div = document.createElement('div');
                div.className = `portal-msg-bubble ${msgClass}`;
                div.innerHTML = `
                    ${safeMessage ? `<div>${safeMessage}</div>` : ''}
                    ${attachmentHtml}
                    <div class="portal-msg-time">${timeStr}</div>
                `;
                streamEl.appendChild(div);
            });

            streamEl.scrollTop = streamEl.scrollHeight;
        }, () => {
            renderLocalStream();
        });
    } catch {
        renderLocalStream();
    }
}

function renderLocalStream() {
    const streamEl = document.getElementById('portalChatMessagesStream');
    if (!streamEl || !currentUser || !currentChatPartner) return;

    let localMsgs = getLocalDMMessages().filter(m => 
        (m.senderCode === currentUser.code && m.receiverCode === currentChatPartner.code) ||
        (m.senderCode === currentChatPartner.code && m.receiverCode === currentUser.code)
    );
    localMsgs = localMsgs.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));

    if (localMsgs.length === 0) {
        streamEl.innerHTML = `<div class="portal-empty-state">No messages yet. Send a message to start chatting!</div>`;
        return;
    }

    localMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    streamEl.innerHTML = '';
    localMsgs.forEach(data => {
        const isSent = data.senderCode === currentUser.code;
        const msgClass = isSent ? 'portal-msg-sent' : 'portal-msg-received';
        const timeStr = formatTimeAgo(data.timestamp);
        const safeMessage = escapeHtml(data.message || '');

        const div = document.createElement('div');
        div.className = `portal-msg-bubble ${msgClass}`;
        div.innerHTML = `
            ${safeMessage ? `<div>${safeMessage}</div>` : ''}
            <div class="portal-msg-time">${timeStr}</div>
        `;
        streamEl.appendChild(div);
    });

    streamEl.scrollTop = streamEl.scrollHeight;
}

// Send Message
async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('portalChatMsgInput');
    const text = input ? input.value.trim() : '';
    if ((!text && !pendingAttachment) || !currentChatPartner || !currentUser) return;

    const newMsgDoc = {
        participants: [currentUser.code, currentChatPartner.code].sort(),
        senderCode: currentUser.code,
        senderName: currentUser.name,
        receiverCode: currentChatPartner.code,
        receiverName: currentChatPartner.name,
        message: text,
        attachment: pendingAttachment || null,
        timestamp: new Date().toISOString(),
        read: false
    };

    try {
        await addDoc(collection(db, "direct_messages"), newMsgDoc);
    } catch {
        saveLocalDM(newMsgDoc);
        renderLocalStream();
        renderLocalThreads();
    }

    if (input) input.value = '';
    pendingAttachment = null;
    const attBtn = document.getElementById('portalAttachmentBtn');
    if (attBtn) {
        attBtn.style.color = '';
        attBtn.title = 'Attach file or photo';
    }
}

// Attachment Selection
function handleAttachmentSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
        alert("File size exceeds 10MB limit.");
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        pendingAttachment = {
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            url: reader.result
        };
        const attBtn = document.getElementById('portalAttachmentBtn');
        if (attBtn) {
            attBtn.style.color = '#10b981';
            attBtn.title = `Attached: ${file.name}`;
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// Delete Chatroom
async function deleteChatroom(targetCode, targetName) {
    if (!currentUser || !targetCode) return;
    if (!confirm(`Delete chatroom with ${targetName}? It will be removed from your chat list.`)) return;

    const pair = [currentUser.code, targetCode].sort();

    try {
        const q = query(collection(db, "direct_messages"), where("participants", "==", pair));
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const existingHidden = data.hiddenFor || [];
            if (!existingHidden.includes(currentUser.code)) {
                updateDoc(doc(db, "direct_messages", docSnap.id), {
                    hiddenFor: [...existingHidden, currentUser.code]
                }).catch(() => {});
            }
        });
    } catch (err) {
        console.warn("Delete chat warning:", err);
    }

    // Local fallback update
    const localList = getLocalDMMessages();
    localList.forEach(m => {
        if ((m.senderCode === currentUser.code && m.receiverCode === targetCode) ||
            (m.senderCode === targetCode && m.receiverCode === currentUser.code)) {
            if (!m.hiddenFor) m.hiddenFor = [];
            if (!m.hiddenFor.includes(currentUser.code)) m.hiddenFor.push(currentUser.code);
        }
    });
    sessionStorage.setItem('local_direct_messages', JSON.stringify(localList));

    if (currentChatPartner && currentChatPartner.code === targetCode) {
        if (unsubscribeStream) unsubscribeStream();
        currentChatPartner = null;
        showChatView('threads');
    }
}

// Notifications Real-time Subscription
function subscribeNotifications() {
    if (!currentUser || !currentUser.name) return;
    if (unsubscribeNotifs) unsubscribeNotifs();

    try {
        const notifQuery = query(
            collection(db, "timeline_notifications"),
            where("recipientName", "==", currentUser.name),
            orderBy("timestamp", "desc")
        );

        unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
            const listEl = document.getElementById('portalNotifList');
            const badges = document.querySelectorAll('.portal-notif-badge');
            if (!listEl) return;

            let unreadCount = 0;
            let itemsHtml = '';

            snapshot.forEach(docSnap => {
                const notif = docSnap.data();
                if (!notif.read) unreadCount++;
                const readClass = notif.read ? '' : 'unread';
                const timeStr = formatTimeAgo(notif.timestamp);
                const safeMsg = escapeHtml(notif.message || 'New notification');

                itemsHtml += `
                    <div class="portal-notif-item ${readClass}" data-notif-id="${docSnap.id}" data-post-id="${notif.postId || ''}">
                        <div>${safeMsg}</div>
                        <div class="portal-notif-time">${timeStr}</div>
                    </div>
                `;
            });

            badges.forEach(badge => {
                if (unreadCount > 0) {
                    badge.innerText = unreadCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            });

            if (snapshot.empty) {
                listEl.innerHTML = `<div class="portal-empty-state">You have no notifications.</div>`;
            } else {
                listEl.innerHTML = itemsHtml;
                listEl.querySelectorAll('.portal-notif-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const notifId = item.dataset.notifId;
                        try {
                            await updateDoc(doc(db, "timeline_notifications", notifId), { read: true });
                        } catch {}
                        window.location.href = `timeline.html?notification=${encodeURIComponent(notifId)}`;
                    });
                });
            }
        });
    } catch (e) {
        console.warn("Notifications subscription note:", e);
    }
}
