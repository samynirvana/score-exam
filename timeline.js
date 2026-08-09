import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, getDoc, getDocs, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3oiOHwHUfMhTPjEp8Ku8-qlbRKlGX0Gg",
    authDomain: "students-score-395b2.firebaseapp.com",
    projectId: "students-score-395b2",
    storageBucket: "students-score-395b2.firebasestorage.app",
    messagingSenderId: "189447167056",
    appId: "1:189447167056:web:4526e218132977bc3f4555",
    measurementId: "G-97WSSH0BNE",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null; 
let unsubscribePosts = null; 
let unsubscribeNotifs = null; 
let allUserNames = [];

// --- 1. DARK MODE & GLOBAL CLICK HANDLER ---
const themeToggleBtn = document.getElementById('darkModeToggle');

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Light';
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggleBtn.innerText = isDark ? '☀️ Light' : '🌙 Dark';
    });
}

// Close open Kebab Menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-wrapper')) {
        document.querySelectorAll('.kebab-dropdown').forEach(menu => menu.classList.add('hidden'));
    }
});

window.toggleKebabMenu = function(event, menuId) {
    event.stopPropagation();
    const targetMenu = document.getElementById(menuId);
    
    // Close all other open kebab dropdowns first
    document.querySelectorAll('.kebab-dropdown').forEach(menu => {
        if (menu.id !== menuId) menu.classList.add('hidden');
    });

    if (targetMenu) {
        targetMenu.classList.toggle('hidden');
    }
};

// --- 2. AUTHENTICATION LOGIC ---

onAuthStateChanged(auth, async (user) => {
    if (user && !currentUser) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            const email = data.email || user.email;
            
            const rawName = email.split('@')[0];
            const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const displayName = data.role === 'admin' ? 'Administrator' : teacherName;
            
            currentUser = { type: 'staff', name: displayName, code: email };
            showTimelineApp();
        }
    }
});

window.onload = () => {
    const savedStudent = sessionStorage.getItem('studentTimelineSession');
    if (savedStudent) {
        currentUser = JSON.parse(savedStudent);
        showTimelineApp();
    }
};

document.getElementById('loginBtn').addEventListener('click', async () => {
    const usernameInput = document.getElementById('loginUsername').value.trim();
    const passwordInput = document.getElementById('loginPassword').value.trim();

    if (!usernameInput || !passwordInput) return alert("Please enter both fields.");

    if (usernameInput.includes('@')) {
        try {
            await signInWithEmailAndPassword(auth, usernameInput, passwordInput);
        } catch (error) { alert("Staff Login Failed: " + error.message); }
    } else {
        if (usernameInput.toUpperCase() !== passwordInput.toUpperCase()) {
            return alert("For students, your Username and Password must be your exact code.");
        }
        const code = usernameInput.toUpperCase();
        try {
            const studentRef = doc(db, "students", code);
            const studentSnap = await getDoc(studentRef);
            if (studentSnap.exists()) {
                currentUser = { type: 'student', name: studentSnap.data().studentName, code: code };
                sessionStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                showTimelineApp();
            } else {
                alert("Student code not found in the directory.");
            }
        } catch (error) { alert("Login Error: " + error.message); }
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    sessionStorage.removeItem('studentTimelineSession');
    currentUser = null;
    if (unsubscribePosts) unsubscribePosts(); 
    if (unsubscribeNotifs) unsubscribeNotifs();
    if (auth.currentUser) await signOut(auth);
    
    document.getElementById('timelineApp').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
});

function showTimelineApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('timelineApp').classList.remove('hidden');
    
    const badgeHTML = currentUser.type === 'staff' ? ` <span class="staff-badge">✓</span>` : '';
    document.getElementById('currentUserDisplay').innerHTML = currentUser.name + badgeHTML;
    
    fetchAllNames(); 
    loadPosts();
    loadNotifications();
}

// --- 3. @MENTION AUTOCOMPLETE ---

async function fetchAllNames() {
    try {
        let names = [];
        
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.email) {
                const rawName = data.email.split('@')[0];
                const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                names.push(data.role === 'admin' ? 'Administrator' : teacherName);
            }
        });
        
        const studentsSnap = await getDocs(collection(db, "students"));
        studentsSnap.forEach(doc => {
            if (doc.data().studentName) names.push(doc.data().studentName);
        });
        
        allUserNames = [...new Set(names)];
    } catch (e) {
        console.warn("Could not load user directory for mentions.", e);
    }
}

const mentionPopup = document.getElementById('mentionPopup');

document.addEventListener('input', (e) => {
    if (e.target.id === 'loginUsername' || e.target.id === 'loginPassword') return; 
    
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastAtSign = textBeforeCursor.lastIndexOf('@');

        if (lastAtSign !== -1) {
            const textAfterAt = textBeforeCursor.substring(lastAtSign + 1);
            if (!textAfterAt.includes(' ')) {
                showMentionPopup(e.target, textAfterAt.toLowerCase());
                return;
            }
        }
        hideMentionPopup();
    }
});

function showMentionPopup(targetEl, searchStr) {
    const matches = allUserNames.filter(n => n.toLowerCase().includes(searchStr)).slice(0, 6); 
    if (matches.length === 0) {
        hideMentionPopup();
        return;
    }
    
    mentionPopup.innerHTML = '';
    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'mention-item';
        div.textContent = match;
        div.onclick = () => {
            const val = targetEl.value;
            const cursorPos = targetEl.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            const lastAtSign = textBeforeCursor.lastIndexOf('@');
            
            const newText = val.substring(0, lastAtSign) + '@' + match + ' ' + val.substring(cursorPos);
            targetEl.value = newText;
            hideMentionPopup();
            targetEl.focus();
        };
        mentionPopup.appendChild(div);
    });
    
    const rect = targetEl.getBoundingClientRect();
    mentionPopup.style.top = (rect.bottom + window.scrollY) + 'px';
    mentionPopup.style.left = (rect.left + window.scrollX) + 'px';
    mentionPopup.style.width = rect.width + 'px';
    mentionPopup.classList.remove('hidden');
}

function hideMentionPopup() {
    mentionPopup.classList.add('hidden');
}

document.addEventListener('click', (e) => { if (!mentionPopup.contains(e.target)) hideMentionPopup(); });

function extractMentions(text) {
    let foundMentions = [];
    allUserNames.forEach(name => {
        if (text.includes('@' + name)) {
            foundMentions.push(name);
        }
    });
    return foundMentions;
}

// --- 4. NOTIFICATIONS LOGIC ---

async function sendNotification(recipientName, messageText, targetPostId) {
    if (!recipientName || recipientName === currentUser.name) return; 
    
    try {
        await addDoc(collection(db, "timeline_notifications"), {
            recipientName: recipientName,
            message: messageText,
            postId: targetPostId,
            read: false,
            timestamp: new Date().toISOString()
        });
    } catch (e) { console.error("Alert delivery failed:", e); }
}

function loadNotifications() {
    if (!currentUser) return;
    if (unsubscribeNotifs) unsubscribeNotifs();

    const notifQuery = query(collection(db, "timeline_notifications"), where("recipientName", "==", currentUser.name), orderBy("timestamp", "desc"));

    unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
        const dropdown = document.getElementById('notifDropdown');
        const badge = document.getElementById('notifBadge');
        let unreadCount = 0;
        dropdown.innerHTML = '';

        if (snapshot.empty) {
            dropdown.innerHTML = `<div style="padding: 12px; text-align: center; font-size: 13px; color: var(--text-muted);">You have no notifications.</div>`;
            badge.style.display = 'none';
            return;
        }

        snapshot.forEach((docSnap) => {
            const notif = docSnap.data();
            if (!notif.read) unreadCount++;
            
            const readClass = notif.read ? '' : 'unread';
            dropdown.innerHTML += `
                <div class="notif-item ${readClass}" onclick="openNotification('${docSnap.id}', '${notif.postId}')">
                    ${notif.message}
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${new Date(notif.timestamp).toLocaleString()}</div>
                </div>
            `;
        });

        if (unreadCount > 0) {
            badge.innerText = unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    });
}

document.getElementById('notifToggleBtn').addEventListener('click', () => {
    const dropdown = document.getElementById('notifDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
});

window.openNotification = async function(notifId, postId) {
    document.getElementById('notifDropdown').style.display = 'none';
    try { await updateDoc(doc(db, "timeline_notifications", notifId), { read: true }); } catch(e) {}
    
    const postEl = document.getElementById('post-' + postId);
    if (postEl) {
        postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        postEl.style.borderColor = '#2563eb';
        setTimeout(() => postEl.style.borderColor = 'var(--border-color)', 2500); 
    } else {
        alert("This post may have been deleted.");
    }
};

// --- 5. POSTING & RENDERING (WITH KEBAB MENU) ---

document.getElementById('submitPostBtn').addEventListener('click', async () => {
    if (!currentUser) return; 
    const message = document.getElementById('postMessage').value.trim();
    if (!message) return alert("You must write a message first.");

    try {
        const postRef = await addDoc(collection(db, "timeline_posts"), {
            authorCode: currentUser.code,
            authorName: currentUser.name,
            isStaff: currentUser.type === 'staff',
            message: message,
            timestamp: new Date().toISOString()
        });
        
        const mentions = extractMentions(message);
        for (let m of mentions) {
            await sendNotification(m, `${currentUser.name} mentioned you in a new post.`, postRef.id);
        }

        document.getElementById('postMessage').value = '';
    } catch (error) {
        alert("Failed to publish post: " + error.message);
    }
});

function loadPosts() {
    if (!currentUser) return; 
    if (unsubscribePosts) unsubscribePosts();

    const postsQuery = query(collection(db, "timeline_posts"), orderBy("timestamp", "desc"));

    unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
        const feed = document.getElementById('timelineFeed');
        feed.innerHTML = ''; 

        snapshot.forEach((docSnap) => {
            const post = docSnap.data();
            const postId = docSnap.id;
            
            // Format timestamp relative to now (e.g. 12m, 2h, 1d)
            const dateStr = formatTimeAgo(post.timestamp);
            const badgeHTML = post.isStaff ? `<span class="staff-badge">✓</span>` : '';
            const initialLetter = post.authorName ? post.authorName.charAt(0) : '?';

            // Kebab Menu for Staff Deletion
            let kebabMenuHTML = '';
            if (currentUser.type === 'staff') {
                kebabMenuHTML = `
                    <div class="kebab-wrapper">
                        <button class="kebab-btn" onclick="toggleKebabMenu(event, 'kebab-post-${postId}')">⋮</button>
                        <div id="kebab-post-${postId}" class="kebab-dropdown hidden">
                            <button class="kebab-item danger" onclick="deletePost('${postId}')">
                                🗑️ Delete Post
                            </button>
                        </div>
                    </div>
                `;
            }

            const postElement = document.createElement('div');
            postElement.className = 'timeline-post';
            postElement.id = 'post-' + postId; 
            
            postElement.innerHTML = `
                <div class="post-sender-row">
                    <div class="sender-info-wrapper">
                        <div class="avatar-circle">${initialLetter}</div>
                        <div class="sender-details">
                            <div class="sender-name-line">
                                <span class="sender-name">${post.authorName}</span>
                                ${badgeHTML}
                            </div>
                            <!-- Store raw ISO timestamp in data-timestamp attribute for auto-updates -->
                            <span class="post-time" data-timestamp="${post.timestamp}">${dateStr}</span>
                        </div>
                    </div>
                    ${kebabMenuHTML}
                </div>

                <div class="post-body">${formatMessageMentions(post.message)}</div>
                
                <div class="post-actions-bar">
                    <button class="action-btn" onclick="toggleComments('${postId}')">
                        💬 <span id="comment-count-${postId}">0</span> Comments
                    </button>
                </div>

                <div class="comments-wrapper hidden" id="comments-wrapper-${postId}">
                    <div class="comments-list" id="comments-list-${postId}">
                        <!-- Comments injected dynamically -->
                    </div>
                    
                    <div class="reply-box">
                        <input type="text" id="reply-msg-${postId}" placeholder="Write a reply... (Type @ to mention)">
                        <button onclick="submitReply('${postId}', '${post.authorName}')">Reply</button>
                    </div>
                </div>
            `;
            
            feed.appendChild(postElement);
            loadCommentsForPost(postId);
        });
    });
}

function loadCommentsForPost(postId) {
    const commentsRef = collection(db, "timeline_comments");
    const q = query(commentsRef, where("postId", "==", postId));

    onSnapshot(q, (snapshot) => {
        const commentListEl = document.getElementById(`comments-list-${postId}`);
        const commentCountEl = document.getElementById(`comment-count-${postId}`);
        if (!commentListEl) return;
        
        let commentsList = [];
        snapshot.forEach(doc => commentsList.push({ id: doc.id, ...doc.data() }));
        commentsList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (commentCountEl) {
            commentCountEl.innerText = commentsList.length;
        }

        commentListEl.innerHTML = '';
        if (commentsList.length === 0) {
            commentListEl.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 6px;">No comments yet. Be the first to reply!</div>`;
            return;
        }

        commentsList.forEach(comment => {
            const badgeHTML = comment.isStaff ? `<span class="staff-badge">✓</span>` : '';
            
            let commentKebabHTML = '';
            if (currentUser.type === 'staff') {
                commentKebabHTML = `
                    <div class="kebab-wrapper">
                        <button class="kebab-btn" style="font-size: 16px; padding: 2px 6px;" onclick="toggleKebabMenu(event, 'kebab-comment-${comment.id}')">⋮</button>
                        <div id="kebab-comment-${comment.id}" class="kebab-dropdown hidden">
                            <button class="kebab-item danger" onclick="deleteComment('${comment.id}')">
                                🗑️ Delete Reply
                            </button>
                        </div>
                    </div>
                `;
            }

            commentListEl.innerHTML += `
                <div class="comment-item">
                    <div class="comment-content">
                        <strong>${comment.authorName} ${badgeHTML}:</strong> 
                        ${formatMessageMentions(comment.message)}
                    </div>
                    ${commentKebabHTML}
                </div>
            `;
        });
    });
}

window.toggleComments = function(postId) {
    const wrapper = document.getElementById(`comments-wrapper-${postId}`);
    if (wrapper) {
        wrapper.classList.toggle('hidden');
    }
};

window.submitReply = async function(postId, postAuthorName) {
    if (!currentUser) return;
    const msgInput = document.getElementById(`reply-msg-${postId}`);
    const message = msgInput.value.trim();

    if (!message) return alert("Reply cannot be empty.");

    try {
        await addDoc(collection(db, "timeline_comments"), {
            postId: postId,
            authorCode: currentUser.code,
            authorName: currentUser.name,
            isStaff: currentUser.type === 'staff',
            message: message,
            timestamp: new Date().toISOString()
        });
        
        await sendNotification(postAuthorName, `${currentUser.name} replied to your post.`, postId);
        
        const mentions = extractMentions(message);
        for (let m of mentions) {
            await sendNotification(m, `${currentUser.name} mentioned you in a comment.`, postId);
        }

        msgInput.value = '';
    } catch (error) {
        alert("Failed to post comment: " + error.message);
    }
};

// --- 6. SECURE DELETE FUNCTIONS ---

window.deletePost = async function(postId) {
    if (!currentUser || currentUser.type !== 'staff') return; 
    if (confirm("Are you sure you want to delete this post and its comments?")) {
        try { await deleteDoc(doc(db, "timeline_posts", postId)); } 
        catch (error) { alert("Database Error: Could not delete post. " + error.message); }
    }
};

window.deleteComment = async function(commentId) {
    if (!currentUser || currentUser.type !== 'staff') return; 
    if (confirm("Delete this reply?")) {
        try { await deleteDoc(doc(db, "timeline_comments", commentId)); } 
        catch (error) { alert("Database Error: Could not delete comment. " + error.message); }
    }
};

function formatMessageMentions(text) {
    let formattedText = text;
    allUserNames.forEach(name => {
        const mention = '@' + name;
        if (formattedText.includes(mention)) {
            formattedText = formattedText.split(mention).join(`<span style="color: var(--primary-color); font-weight: bold;">${mention}</span>`);
        }
    });
    return formattedText;
}

// --- RELATIVE TIME FORMATTER & AUTO-UPDATE ---

/**
 * Converts an ISO timestamp into a short relative time string (e.g., 5m, 2h, 1d)
 */
function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    
    const postDate = new Date(timestamp);
    const now = new Date();
    const secondsPast = Math.floor((now - postDate) / 1000);

    // Handles negative time offsets or immediate posts
    if (secondsPast < 30) {
        return 'just now';
    }
    
    const minutes = Math.floor(secondsPast / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d`;
    }
    
    const weeks = Math.floor(days / 7);
    if (weeks < 52) {
        return `${weeks}w`;
    }
    
    const years = Math.floor(days / 365);
    return `${years}y`;
}

/**
 * Periodically updates all timestamp elements on the page without re-fetching from Firestore
 */
function startLiveTimestampUpdates() {
    setInterval(() => {
        const timeElements = document.querySelectorAll('.post-time[data-timestamp]');
        timeElements.forEach(el => {
            const rawTimestamp = el.getAttribute('data-timestamp');
            if (rawTimestamp) {
                el.innerText = formatTimeAgo(rawTimestamp);
            }
        });
    }, 60000); // Runs every 60 seconds
}

// Start the live update timer when script loads
startLiveTimestampUpdates();