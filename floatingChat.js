// floatingChat.js - Standalone Native Floating Chat Room & Real-time Notifications
import { db, auth } from "./firebase.js";
import { 
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy 
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

// Emoji only detection for large emoji rendering
function isEmojiOnly(str) {
    if (!str) return false;
    const trimmed = str.trim();
    if (!trimmed) return false;
    try {
        const clean = trimmed.replace(/[\s\uFE0F\u200D]/g, '');
        if (!clean) return false;
        const emojiRegex = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u;
        return emojiRegex.test(clean) && clean.length <= 12;
    } catch (_) {
        return false;
    }
}

// Resolve user photo from directory
function getUserPhoto(code, name) {
    if (currentUser && currentUser.code === code && currentUser.photoUrl) {
        return currentUser.photoUrl;
    }
    const found = allUserDirectory.find(u => u.code === code || (u.name && u.name.toLowerCase() === (name || '').toLowerCase()));
    return found ? (found.photoUrl || '') : '';
}

// Resolve user avatar HTML
function getAvatarHTML(name, photoUrl, extraClass = '') {
    const initial = escapeHtml(name ? name.trim().charAt(0).toUpperCase() : '?');
    if (photoUrl && photoUrl.trim()) {
        return `<div class="portal-avatar-circle ${extraClass}"><img src="${escapeHtml(photoUrl)}" alt="Avatar" onerror="this.parentElement.innerHTML='${initial}'"></div>`;
    }
    return `<div class="portal-avatar-circle ${extraClass}">${initial}</div>`;
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

function deleteLocalDMMessage(id) {
    if (!id) return;
    const list = getLocalDMMessages().filter(m => m.docId !== id && m.timestamp !== id);
    try {
        sessionStorage.setItem('local_direct_messages', JSON.stringify(list));
    } catch(e) {}
}

window.portalDeleteSingleMsg = async function(docId) {
    if (!docId) return;
    const ok = confirm("Delete this message?");
    if (!ok) return;

    try {
        await deleteDoc(doc(db, "direct_messages", docId));
    } catch (err) {
        console.warn("Could not delete message from Firestore:", err);
    }
    deleteLocalDMMessage(docId);

    const el = document.querySelector(`.portal-message-row[data-msg-id="${docId}"]`);
    if (el) {
        el.style.transition = 'all 0.22s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.85)';
        setTimeout(() => el.remove(), 220);
    }
};

function clearPortalAttachmentPreview() {
    pendingAttachment = null;
    const previewBar = document.getElementById('portalAttachmentPreviewBar');
    const attachmentInput = document.getElementById('portalAttachmentInput');
    const thumbWrap = document.getElementById('portalAttachmentThumbWrap');
    const nameEl = document.getElementById('portalAttachmentPreviewName');
    const statusEl = document.getElementById('portalAttachmentPreviewStatus');
    const btn = document.getElementById('portalAttachmentBtn');
    if (previewBar) {
        previewBar.classList.add('hidden');
        previewBar.style.display = 'none';
    }
    if (attachmentInput) attachmentInput.value = '';
    if (thumbWrap) thumbWrap.innerHTML = '';
    if (nameEl) nameEl.textContent = '';
    if (statusEl) statusEl.textContent = '';
    if (btn) {
        btn.classList.remove('has-attachment');
        btn.disabled = false;
        btn.title = 'Attach file or photo';
        btn.style.color = '';
    }
}

window.openChatImagePreview = window.openChatImagePreview || function(url, alt) {
    let modal = document.getElementById('chatImageLightboxModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'chatImageLightboxModal';
        modal.className = 'chat-lightbox-modal';
        modal.innerHTML = `
            <div class="chat-lightbox-backdrop" onclick="window.closeChatImagePreview()"></div>
            <div class="chat-lightbox-dialog">
                <button type="button" class="chat-lightbox-close-btn" onclick="window.closeChatImagePreview()" title="Close">&times;</button>
                <img id="chatLightboxImg" src="" alt="Preview">
            </div>
        `;
        document.body.appendChild(modal);
    }
    const img = modal.querySelector('#chatLightboxImg');
    if (img) {
        img.src = url;
        img.alt = alt || 'Preview';
    }
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeChatImagePreview = window.closeChatImagePreview || function() {
    const modal = document.getElementById('chatImageLightboxModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeChatImagePreview?.();
    }
});

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
    loadUserDirectory().catch(() => {});

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
                <button type="button" id="portalBackToThreadsBtn" class="portal-back-btn" title="Back" aria-label="Back">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back</span>
                </button>
            </div>
            <div id="portalChatContactsList" class="portal-contacts-list">
                <div class="portal-empty-state">Loading directory...</div>
            </div>
        </div>

        <!-- VIEW 3: ACTIVE CHAT STREAM -->
        <div id="portalChatStreamView" class="portal-chat-view hidden">
            <div class="portal-chatroom-bar">
                <button type="button" id="portalLeaveChatBtn" class="portal-back-btn" title="Back to chats" aria-label="Back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
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

            <!-- ATTACHMENT PREVIEW BAR -->
            <div id="portalAttachmentPreviewBar" class="portal-attachment-preview-bar hidden" style="display: none;">
                <div class="portal-attachment-preview-content">
                    <div class="portal-attachment-thumb-wrap" id="portalAttachmentThumbWrap"></div>
                    <div class="portal-attachment-details">
                        <span class="portal-attachment-name" id="portalAttachmentPreviewName"></span>
                        <span class="portal-attachment-status" id="portalAttachmentPreviewStatus"></span>
                    </div>
                </div>
                <button type="button" id="portalCancelAttachmentBtn" class="portal-attachment-cancel-btn" title="Remove attachment" aria-label="Remove attachment">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            <form id="portalChatMsgForm" class="portal-msg-compose-bar">
                <input type="file" id="portalAttachmentInput" hidden>
                <button type="button" id="portalAttachmentBtn" class="portal-compose-tool-btn" title="Attach file or photo">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48"></path>
                    </svg>
                </button>
                <button type="button" id="portalEmojiBtn" class="portal-compose-tool-btn" title="Add emoji">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
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
    clearPortalAttachmentPreview();

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
        clearPortalAttachmentPreview();
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
        clearPortalAttachmentPreview();
        showChatView('threads');
    });

    document.getElementById('portalCancelAttachmentBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearPortalAttachmentPreview();
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
    if (viewName !== 'stream') {
        clearPortalAttachmentPreview();
    }
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
            directory.push({ 
                name, 
                code, 
                role: cls ? `Student (${cls})` : 'Student', 
                studentClass: cls || 'Other Students',
                photoUrl: data.photoUrl || '' 
            });
        });

        // 2. Teachers
        try {
            const teaSnap = await getDocs(collection(db, "teachers"));
            teaSnap.forEach(d => {
                const data = d.data();
                const name = data.name || data.teacherName || 'Teacher';
                const code = data.email || data.code || d.id;
                directory.push({ name, code, role: 'Teacher', studentClass: 'Teachers & Staff', photoUrl: data.photoUrl || '' });
            });
        } catch {}

        try {
            const usersSnap = await getDocs(collection(db, "users"));
            usersSnap.forEach(d => {
                const data = d.data();
                if (data.email) {
                    const existing = directory.find(u => u.code === data.email);
                    if (!existing) {
                        const rawName = data.email.split('@')[0];
                        const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        const name = data.role === 'admin' ? 'Administrator' : teacherName;
                        directory.push({
                            name,
                            code: data.email,
                            role: data.role === 'admin' ? 'Super Admin' : 'Teacher',
                            studentClass: 'Teachers & Staff',
                            photoUrl: data.photoUrl || data.photo || data.avatar || ''
                        });
                    }
                }
            });
        } catch {}

        allUserDirectory = directory;
    } catch (e) {
        console.warn("Could not load user directory:", e);
    }
}

function getContactGroupName(contact) {
    if (!contact) return 'Other Students';
    if (contact.role === 'Teacher' || contact.role === 'Super Admin' || contact.role === 'Admin' || contact.studentClass === 'Staff' || contact.studentClass === 'Teachers & Staff') {
        return 'Teachers & Staff';
    }
    const c = (contact.studentClass || '').trim();
    if (!c || c.toLowerCase() === 'student' || c.toLowerCase() === 'unassigned') {
        return 'Other Students';
    }
    return c;
}

function sortClassGroups(a, b) {
    if (a === 'Teachers & Staff') return -1;
    if (b === 'Teachers & Staff') return 1;
    if (a === 'Other Students') return 1;
    if (b === 'Other Students') return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function renderContactsList(filterStr) {
    const listEl = document.getElementById('portalChatContactsList');
    if (!listEl) return;

    const query = (filterStr || '').trim().toLowerCase();
    const filtered = allUserDirectory.filter(u => {
        if (currentUser && u.code === currentUser.code) return false;
        if (!query) return true;
        const nameMatch = (u.name || '').toLowerCase().includes(query);
        const roleMatch = (u.role || '').toLowerCase().includes(query);
        const classMatch = (u.studentClass || '').toLowerCase().includes(query);
        return nameMatch || roleMatch || classMatch;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="portal-empty-state">No contacts found matching "${escapeHtml(filterStr)}".</div>`;
        return;
    }

    // Group contacts by class
    const groupsMap = new Map();
    filtered.forEach(contact => {
        const grp = getContactGroupName(contact);
        if (!groupsMap.has(grp)) {
            groupsMap.set(grp, []);
        }
        groupsMap.get(grp).push(contact);
    });

    const sortedGroupNames = Array.from(groupsMap.keys()).sort(sortClassGroups);

    listEl.innerHTML = '';
    const isSearching = !!query;

    sortedGroupNames.forEach((groupName) => {
        const members = groupsMap.get(groupName);
        members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const groupWrapper = document.createElement('div');
        groupWrapper.className = `portal-class-group ${isSearching ? 'is-expanded' : ''}`;
        groupWrapper.setAttribute('data-group-name', groupName);

        const isStaffGroup = groupName === 'Teachers & Staff';
        const groupIconSvg = isStaffGroup 
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;

        const headerBtn = document.createElement('button');
        headerBtn.type = 'button';
        headerBtn.className = 'portal-class-group-header';
        headerBtn.setAttribute('aria-expanded', isSearching ? 'true' : 'false');
        headerBtn.innerHTML = `
            <div class="portal-class-group-title-wrap">
                <span class="portal-class-group-icon ${isStaffGroup ? 'staff-icon' : ''}">${groupIconSvg}</span>
                <span class="portal-class-group-name">${escapeHtml(groupName)}</span>
                <span class="portal-class-group-badge">${members.length}</span>
            </div>
            <span class="portal-class-group-arrow-wrap">
                <svg class="portal-group-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 18 6-6-6-6"/>
                </svg>
            </span>
        `;

        const contentEl = document.createElement('div');
        contentEl.className = `portal-class-group-content ${isSearching ? '' : 'hidden'}`;

        members.forEach(contact => {
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
            item.onclick = (e) => {
                e.stopPropagation();
                openChatroom(contact);
            };
            contentEl.appendChild(item);
        });

        // Click to toggle accordion
        headerBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const willBeExpanded = contentEl.classList.contains('hidden');
            if (willBeExpanded) {
                contentEl.classList.remove('hidden');
                groupWrapper.classList.add('is-expanded');
                headerBtn.setAttribute('aria-expanded', 'true');
            } else {
                contentEl.classList.add('hidden');
                groupWrapper.classList.remove('is-expanded');
                headerBtn.setAttribute('aria-expanded', 'false');
            }
        };

        groupWrapper.appendChild(headerBtn);
        groupWrapper.appendChild(contentEl);
        listEl.appendChild(groupWrapper);
    });
}

// Active Chatroom
function openChatroom(partner) {
    if (!partner || !currentUser) return;
    currentChatPartner = partner;
    clearPortalAttachmentPreview();

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

function renderSingleMessageHTML(data) {
    const isSent = data.senderCode === currentUser.code;
    const msgClass = isSent ? 'sent' : 'received';
    const timeStr = formatTimeAgo(data.timestamp);
    const rawMsg = data.message || '';
    const safeMessage = escapeHtml(rawMsg);
    const isEmoji = isEmojiOnly(rawMsg);
    const isImageOnly = data.attachment?.url && String(data.attachment?.mimeType || '').startsWith('image/') && !safeMessage;

    // Sender Name: if sent by me, write "Me", else senderName
    const senderName = isSent ? 'Me' : escapeHtml(formatNickname(data.senderName || currentChatPartner.name));

    // Profile photo & initials avatar
    const senderCode = isSent ? currentUser.code : (data.senderCode || currentChatPartner.code);
    const senderExplicitName = isSent ? currentUser.name : (data.senderName || currentChatPartner.name);
    const senderPhoto = getUserPhoto(senderCode, senderExplicitName);
    const avatarHtml = getAvatarHTML(senderExplicitName, senderPhoto, 'portal-chat-msg-avatar');

    // Read status for outgoing messages: two blue checkmarks if read, two grey checkmarks if sent
    const isRead = !!data.read;
    const checkmarkColor = isRead ? '#38bdf8' : '#94a3b8';
    const checkmarkTitle = isRead ? 'Read' : 'Sent';
    const readStatusHtml = isSent ? `
        <span class="portal-read-status" title="${checkmarkTitle}" aria-label="${checkmarkTitle}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${checkmarkColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L7 17l-5-5"/>
                <path d="M22 10l-7.5 7.5-1.5-1.5"/>
            </svg>
        </span>
    ` : '';

    // Delete message button (only for messages sent by me)
    const deleteBtnHtml = (isSent && data.docId) ? `
        <button type="button" class="portal-msg-delete-btn" title="Delete message" aria-label="Delete message" onclick="window.portalDeleteSingleMsg('${escapeHtml(data.docId)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
        </button>
    ` : '';

    let attachmentHtml = '';
    if (data.attachment && data.attachment.url) {
        const attUrl = escapeHtml(data.attachment.url);
        const attName = escapeHtml(data.attachment.fileName || 'Attachment');
        const isImg = (data.attachment.mimeType || '').startsWith('image/');
        if (isImg) {
            attachmentHtml = `
                <div class="portal-attachment-image-container" onclick="window.openChatImagePreview('${attUrl}', '${attName}')">
                    <img src="${attUrl}" alt="${attName}" class="portal-attachment-img portal-clickable-img" loading="lazy">
                </div>
            `;
        } else {
            attachmentHtml = `
                <div class="portal-attachment">
                    <a href="${attUrl}" target="_blank" rel="noopener" download="${attName}" class="portal-attachment-link">📎 ${attName}</a>
                </div>
            `;
        }
    }

    return `
        <div class="portal-message-row ${msgClass}" data-msg-id="${escapeHtml(data.docId || '')}">
            ${!isSent ? `<div class="portal-msg-avatar-col">${avatarHtml}</div>` : ''}

            <div class="portal-msg-content-col">
                <div class="portal-msg-sender-name ${isSent ? 'me' : ''}">
                    ${senderName}
                </div>

                <div class="portal-msg-bubble-wrap">
                    ${isSent ? deleteBtnHtml : ''}
                    <div class="portal-msg-bubble ${isSent ? 'portal-msg-sent' : 'portal-msg-received'} ${isEmoji ? 'portal-msg-emoji-only' : ''} ${isImageOnly ? 'portal-msg-bubble-image-only' : ''}">
                        ${safeMessage ? `<div>${safeMessage}</div>` : ''}
                        ${attachmentHtml}
                    </div>
                </div>

                <div class="portal-msg-meta">
                    <span class="portal-msg-time">${timeStr}</span>
                    ${readStatusHtml}
                </div>
            </div>

            ${isSent ? `<div class="portal-msg-avatar-col">${avatarHtml}</div>` : ''}
        </div>
    `;
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
                streamEl.innerHTML = `<div class="portal-empty-state">No messages yet. Send a message to start chatting with ${escapeHtml(currentChatPartner.name)}!</div>`;
                return;
            }

            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            let html = '';
            messages.forEach(data => {
                if (data.docId && !data.read && data.receiverCode === currentUser.code) {
                    updateDoc(doc(db, "direct_messages", data.docId), { read: true }).catch(() => {});
                }
                html += renderSingleMessageHTML(data);
            });
            streamEl.innerHTML = html;
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

    let html = '';
    localMsgs.forEach(data => {
        html += renderSingleMessageHTML(data);
    });
    streamEl.innerHTML = html;
    streamEl.scrollTop = streamEl.scrollHeight;
}

// Send Message
async function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('portalChatMsgInput');
    const text = input ? input.value.trim() : '';
    const attToSend = pendingAttachment;
    if ((!text && !attToSend) || !currentChatPartner || !currentUser) return;

    // Instant clear of input and attachment preview so it NEVER stays stuck
    if (input) {
        input.value = '';
        input.focus();
    }
    clearPortalAttachmentPreview();

    const newMsgDoc = {
        participants: [currentUser.code, currentChatPartner.code].sort(),
        senderCode: currentUser.code,
        senderName: currentUser.name,
        receiverCode: currentChatPartner.code,
        receiverName: currentChatPartner.name,
        message: text,
        attachment: attToSend || null,
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
}

// Attachment Selection
function handleAttachmentSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
        alert("File size exceeds 25MB limit.");
        return;
    }

    const previewBar = document.getElementById('portalAttachmentPreviewBar');
    const thumbWrap = document.getElementById('portalAttachmentThumbWrap');
    const nameEl = document.getElementById('portalAttachmentPreviewName');
    const statusEl = document.getElementById('portalAttachmentPreviewStatus');
    const btn = document.getElementById('portalAttachmentBtn');

    if (previewBar && thumbWrap && nameEl && statusEl) {
        nameEl.innerText = file.name;
        statusEl.innerHTML = `<span class="portal-uploading-spinner"></span> Attaching...`;
        if (file.type && file.type.startsWith('image/')) {
            const tempUrl = URL.createObjectURL(file);
            thumbWrap.innerHTML = `<img src="${tempUrl}" class="portal-attached-thumb-img" alt="preview">`;
        } else {
            thumbWrap.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }
        previewBar.style.display = 'flex';
        previewBar.classList.remove('hidden');
    }

    if (btn) btn.disabled = true;

    const reader = new FileReader();
    reader.onload = () => {
        pendingAttachment = {
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            url: reader.result
        };
        if (btn) {
            btn.classList.add('has-attachment');
            btn.title = `Attached: ${file.name}`;
            btn.disabled = false;
        }
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #10b981; font-weight: 700;">✓ Ready to send</span>`;
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
