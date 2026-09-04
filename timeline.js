import { collection, addDoc, query, where, orderBy, onSnapshot, getDoc, getDocs, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { escapeHtml, formatTimeAgo } from "./utils.js";

let currentUser = null; 
let unsubscribePosts = null; 
let unsubscribeNotifs = null; 
let allUserNames = [];
let unsubscribeStudents = null;
const userPhotoMap = new Map();

// Helper to convert Google Drive share link to direct high-res image link
export function resolvePhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('https://lh3.googleusercontent.com/d/') || trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    const driveMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    return trimmed;
}

// Look up photo URL by student code or full name or explicit url
export function getUserPhotoUrl(code, name, explicitUrl) {
    if (explicitUrl) {
        const resolved = resolvePhotoUrl(explicitUrl);
        if (resolved) return resolved;
    }
    if (code) {
        const byCode = userPhotoMap.get(code.toUpperCase());
        if (byCode) return byCode;
    }
    if (name) {
        const byName = userPhotoMap.get(name.trim().toLowerCase());
        if (byName) return byName;
    }
    return '';
}

// Generate unified avatar HTML (profile photo if available, or fallback initial letter)
export function renderAvatarHTML(name, code, explicitPhotoUrl, isStaff, extraClass = '') {
    const photoUrl = getUserPhotoUrl(code, name, explicitPhotoUrl);
    const initial = escapeHtml(name ? name.trim().charAt(0).toUpperCase() : 'U');
    const staffStyle = isStaff ? 'background: #1e5eff !important; color: #ffffff !important;' : '';

    if (photoUrl) {
        return `
            <div class="avatar-circle ${extraClass}">
                <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name || 'Avatar')}" class="avatar-circle-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="avatar-fallback" style="display:none; ${staffStyle}">${initial}</span>
            </div>
        `;
    }
    return `
        <div class="avatar-circle ${extraClass}" style="${staffStyle}">
            <span class="avatar-fallback">${initial}</span>
        </div>
    `;
}

// Helper function to extract user nickname (first name) if full name is too long
export function formatNickname(name) {
    if (!name || typeof name !== 'string') return 'User';
    const trimmed = name.trim();
    if (!trimmed) return 'User';
    if (trimmed.toLowerCase() === 'administrator') return 'Administrator';
    const parts = trimmed.split(/\s+/);
    return parts[0] || trimmed;
}

// --- 1. DARK MODE & GLOBAL CLICK HANDLER ---
// --- 1. DARK MODE TOGGLE SYSTEM ---
const themeToggleBtn = document.getElementById('darkModeToggle');
const themeToggleIcon = document.getElementById('themeToggleIcon');
const themeToggleText = document.getElementById('themeToggleText');

// Store your custom Google Drive image URLs here
const DARK_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1N2sZUgBKIQCviZYYm4ibVWCXc4XVhnnh';
const LIGHT_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1_NNJ0sMnU6x1pLW1GiV8FmfL9bPccVhd';

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode', 'dark-theme');
        if (themeToggleIcon) themeToggleIcon.src = LIGHT_MODE_ICON_URL;
        if (themeToggleText) themeToggleText.innerText = 'Light Mode';
    } else {
        document.body.classList.remove('dark-mode', 'dark-theme');
        if (themeToggleIcon) themeToggleIcon.src = DARK_MODE_ICON_URL;
        if (themeToggleText) themeToggleText.innerText = 'Dark Mode';
    }
}

// Load saved theme on initial page load
const savedTheme = localStorage.getItem('appTheme') || localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

// Toggle theme on button click
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isDarkNow = document.body.classList.toggle('dark-theme');
        document.body.classList.toggle('dark-mode', isDarkNow);
        const newTheme = isDarkNow ? 'dark' : 'light';
        localStorage.setItem('appTheme', newTheme);
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });
}

// --- GLOBAL KEBAB & ACTIONS DELEGATED EVENT LISTENER ---
document.addEventListener('click', async (e) => {
    // 1. Check if user clicked Delete Post button
    const delPostBtn = e.target.closest('.btn-delete-post');
    if (delPostBtn) {
        e.stopPropagation();
        e.preventDefault();
        const postId = delPostBtn.getAttribute('data-post-id');
        if (postId) {
            await window.deletePost(postId);
        }
        return;
    }

    // 2. Check if user clicked Delete Comment/Reply button
    const delCommentBtn = e.target.closest('.btn-delete-comment');
    if (delCommentBtn) {
        e.stopPropagation();
        e.preventDefault();
        const commentId = delCommentBtn.getAttribute('data-comment-id');
        if (commentId) {
            await window.deleteComment(commentId);
        }
        return;
    }

    // 3. Check if user clicked a Kebab button
    const kebabBtn = e.target.closest('.kebab-btn');
    if (kebabBtn) {
        e.stopPropagation();
        e.preventDefault();
        const wrapper = kebabBtn.closest('.kebab-wrapper');
        const dropdown = wrapper ? wrapper.querySelector('.kebab-dropdown') : null;
        if (dropdown) {
            const isCurrentlyHidden = dropdown.classList.contains('hidden');
            // Close all other dropdowns
            document.querySelectorAll('.kebab-dropdown').forEach(menu => {
                menu.classList.add('hidden');
            });
            if (isCurrentlyHidden) {
                dropdown.classList.remove('hidden');
            }
        }
        return;
    }

    // 4. Clicking anywhere else outside kebab-wrapper closes all dropdowns
    if (!e.target.closest('.kebab-wrapper')) {
        document.querySelectorAll('.kebab-dropdown').forEach(menu => {
            menu.classList.add('hidden');
        });
    }
});

window.toggleKebabMenu = function(event, menuId) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const targetMenu = document.getElementById(menuId);
    
    // Close all other open kebab dropdowns first
    document.querySelectorAll('.kebab-dropdown').forEach(menu => {
        if (menu.id !== menuId) menu.classList.add('hidden');
    });

    if (targetMenu) {
        targetMenu.classList.toggle('hidden');
    }
};

window.deletePost = async function(postId) {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
        return;
    }
    try {
        await deleteDoc(doc(db, "timeline_posts", postId));
        
        // Clean up associated comments in background
        try {
            const commentsSnap = await getDocs(query(collection(db, "timeline_comments"), where("postId", "==", postId)));
            commentsSnap.forEach(async (cDoc) => {
                await deleteDoc(doc(db, "timeline_comments", cDoc.id));
            });
        } catch (cErr) {
            console.warn("Error cleaning up comments:", cErr);
        }

        const postEl = document.getElementById('post-' + postId);
        if (postEl) postEl.remove();
    } catch (err) {
        alert("Failed to delete post: " + err.message);
    }
};

window.deleteComment = async function(commentId) {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this reply?")) {
        return;
    }
    try {
        await deleteDoc(doc(db, "timeline_comments", commentId));
    } catch (err) {
        alert("Failed to delete reply: " + err.message);
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
            const staffPhoto = resolvePhotoUrl(data.photoUrl || data.photo || data.avatar || '');
            
            currentUser = { type: 'staff', name: displayName, code: email, photoUrl: staffPhoto };
            if (staffPhoto) {
                userPhotoMap.set(email.toUpperCase(), staffPhoto);
                userPhotoMap.set(email.toLowerCase(), staffPhoto);
                userPhotoMap.set(displayName.trim().toLowerCase(), staffPhoto);
            }
            showTimelineApp();
        }
    }
});

async function initTimelineSession() {
    const savedSession = sessionStorage.getItem('studentLoggedInSession') 
        || sessionStorage.getItem('studentTimelineSession')
        || localStorage.getItem('studentLoggedInSession')
        || localStorage.getItem('studentTimelineSession');

    if (savedSession) {
        try {
            const parsed = JSON.parse(savedSession);
            if (parsed && (parsed.code || parsed.studentName || parsed.name)) {
                const sCode = (parsed.code || '').toUpperCase();
                currentUser = {
                    type: parsed.type || 'student',
                    name: parsed.name || parsed.studentName || 'Student',
                    code: sCode,
                    studentClass: parsed.studentClass || parsed.class || 'Unassigned',
                    photoUrl: resolvePhotoUrl(parsed.photoUrl || parsed.photo || parsed.avatar || '')
                };
                if (currentUser.photoUrl && sCode) {
                    userPhotoMap.set(sCode, currentUser.photoUrl);
                    userPhotoMap.set((currentUser.name || '').trim().toLowerCase(), currentUser.photoUrl);
                }
                if (sCode) {
                    getDoc(doc(db, "students", sCode)).then(snap => {
                        if (snap.exists()) {
                            const freshPhoto = resolvePhotoUrl(snap.data().photoUrl || snap.data().photo || snap.data().avatar || '');
                            if (freshPhoto) {
                                currentUser.photoUrl = freshPhoto;
                                userPhotoMap.set(sCode, freshPhoto);
                                userPhotoMap.set((currentUser.name || '').trim().toLowerCase(), freshPhoto);
                                updateComposerAvatar();
                            }
                        }
                    }).catch(() => {});
                }
                await showTimelineApp();
                return;
            }
        } catch (e) {
            console.error("Timeline session parse error:", e);
        }
    }

    const localCode = localStorage.getItem('loggedInStudentCode');
    if (localCode) {
        try {
            const studentRef = doc(db, "students", localCode.toUpperCase());
            const studentSnap = await getDoc(studentRef);
            if (studentSnap.exists()) {
                const sData = studentSnap.data();
                const sPhoto = resolvePhotoUrl(sData.photoUrl || sData.photo || sData.avatar || '');
                currentUser = { 
                    type: 'student', 
                    name: sData.studentName || 'Student', 
                    code: localCode.toUpperCase(),
                    studentClass: sData.studentClass || sData.class || 'Unassigned',
                    photoUrl: sPhoto
                };
                if (sPhoto) {
                    userPhotoMap.set(localCode.toUpperCase(), sPhoto);
                    userPhotoMap.set((sData.studentName || '').trim().toLowerCase(), sPhoto);
                }
                sessionStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                sessionStorage.setItem('studentLoggedInSession', JSON.stringify(currentUser));
                localStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                localStorage.setItem('studentLoggedInSession', JSON.stringify(currentUser));
                await showTimelineApp();
                return;
            }
        } catch (err) {
            console.error("Auto login error from student code:", err);
        }
    }

    // Grace period for Firebase onAuthStateChanged to resolve for Staff/Teachers
    setTimeout(() => {
        if (!currentUser && !auth.currentUser) {
            if (!currentUser && !auth.currentUser) {
                window.location.href = 'index.html';
            }
        }
    }, 1500);
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initTimelineSession);
} else {
    initTimelineSession();
}

document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const uIn = document.getElementById('loginUsername');
    const pIn = document.getElementById('loginPassword');
    if (!uIn || !pIn) return;
    const usernameInput = uIn.value.trim();
    const passwordInput = pIn.value.trim();

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
                const sData = studentSnap.data();
                const sPhoto = resolvePhotoUrl(sData.photoUrl || sData.photo || sData.avatar || '');
                currentUser = { 
                    type: 'student', 
                    name: sData.studentName || 'Student', 
                    code: code,
                    studentClass: sData.studentClass || sData.class || 'Unassigned',
                    photoUrl: sPhoto
                };
                if (sPhoto) {
                    userPhotoMap.set(code.toUpperCase(), sPhoto);
                    userPhotoMap.set((sData.studentName || '').trim().toLowerCase(), sPhoto);
                }
                sessionStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                sessionStorage.setItem('studentLoggedInSession', JSON.stringify(currentUser));
                localStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                localStorage.setItem('studentLoggedInSession', JSON.stringify(currentUser));
                localStorage.setItem('loggedInStudentCode', code);
                showTimelineApp();
            } else {
                alert("Student code not found in the directory.");
            }
        } catch (error) { alert("Login Error: " + error.message); }
    }
});

async function showTimelineApp() {
    const loginOverlay = document.getElementById('loginScreen');
    if (loginOverlay) loginOverlay.style.display = 'none';

    const appEl = document.getElementById('timelineApp');
    if (appEl) appEl.classList.remove('hidden');

    const nameDisp = document.getElementById('currentUserDisplay');
    const roleBadge = document.getElementById('currentUserRoleBadge');
    const composerAvatar = document.getElementById('composerAvatarCircle');

    let roleText = 'Student';
    let isVerified = false;

    if (currentUser.type === 'staff') {
        const rawCode = (currentUser.code || '').toLowerCase();
        const rawName = (currentUser.name || '').toLowerCase();
        if (rawName.includes('admin') || rawCode.includes('admin')) {
            roleText = 'Admin';
        } else {
            roleText = 'Teacher';
        }
        isVerified = true;
    } else {
        roleText = currentUser.studentClass && currentUser.studentClass !== 'Unassigned' 
            ? `Student (${currentUser.studentClass})` 
            : 'Student';
    }

    const badgeHTML = isVerified ? ` <span class="staff-badge" title="Verified Staff">✓</span>` : '';
    const displayName = formatNickname(currentUser.name || 'User');

    if (nameDisp) {
        nameDisp.innerHTML = displayName + badgeHTML;
        nameDisp.title = currentUser.name || '';
    }
    if (roleBadge) roleBadge.innerText = roleText;
    updateComposerAvatar();

    const sidebarName = document.getElementById('sidebarStudentName');
    const sidebarClass = document.getElementById('sidebarStudentClass');
    if (sidebarName) {
        sidebarName.innerText = displayName;
        sidebarName.title = currentUser.name || '';
    }
    if (sidebarClass) sidebarClass.innerText = currentUser.studentClass ? `Class: ${currentUser.studentClass}` : 'Logged in';

function isTimelineAdmin() {
    if (!currentUser) return false;
    if (currentUser.type === 'staff') {
        const nameLower = (currentUser.name || '').toLowerCase();
        const codeLower = (currentUser.code || '').toLowerCase();
        const emailLower = (auth.currentUser?.email || '').toLowerCase();
        return (
            currentUser.role === 'admin' ||
            nameLower.includes('admin') ||
            codeLower.includes('admin') ||
            emailLower.includes('admin') ||
            emailLower.includes('adm@') ||
            nameLower === 'administrator'
        );
    }
    return false;
}

    // Hide student-only navigation tabs (Dashboard, Online Quiz, Profile, Scores) for Staff (Teacher / Admin)
    const isStaff = currentUser.type === 'staff';
    const isAdmin = isTimelineAdmin();
    document.querySelectorAll('.student-only-nav').forEach(el => {
        el.classList.toggle('hidden', isStaff);
    });
    document.querySelectorAll('.admin-only-view').forEach(el => {
        el.classList.toggle('hidden', !isAdmin);
    });

    await fetchAllNames();
    listenStudentsDirectory();
    await populateClassDropdown();
    initTimelineImageUpload();
    loadPosts();
    loadNotifications();
    initDMSystem();
}

function updateComposerAvatar() {
    const composerAvatar = document.getElementById('composerAvatarCircle');
    if (!composerAvatar || !currentUser) return;
    const displayName = formatNickname(currentUser.name || 'User');
    const myPhoto = getUserPhotoUrl(currentUser.code, currentUser.name, currentUser.photoUrl);
    if (myPhoto) {
        composerAvatar.innerHTML = `
            <img src="${escapeHtml(myPhoto)}" alt="Avatar" class="avatar-circle-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <span class="avatar-fallback" style="display:none; ${(currentUser.type === 'staff') ? 'background: #1e5eff !important; color: #fff !important;' : 'background: #10b981 !important; color: #fff !important;'}">${displayName.charAt(0).toUpperCase()}</span>
        `;
        composerAvatar.style.background = 'transparent';
    } else {
        composerAvatar.innerHTML = `<span class="avatar-fallback">${displayName.charAt(0).toUpperCase()}</span>`;
        composerAvatar.style.background = (currentUser.type === 'staff') ? '#1e5eff' : '#10b981';
    }
}

// Live real-time listener to keep student photos synced with Firestore picture database
function listenStudentsDirectory() {
    if (unsubscribeStudents) unsubscribeStudents();
    try {
        unsubscribeStudents = onSnapshot(collection(db, "students"), (snapshot) => {
            snapshot.forEach(docSnap => {
                const sData = docSnap.data();
                const pUrl = resolvePhotoUrl(sData.photoUrl || sData.photo || sData.avatar || '');
                if (pUrl) {
                    userPhotoMap.set(docSnap.id.toUpperCase(), pUrl);
                    if (sData.studentName) {
                        userPhotoMap.set(sData.studentName.trim().toLowerCase(), pUrl);
                    }
                }
                if (currentUser && currentUser.code && currentUser.code.toUpperCase() === docSnap.id.toUpperCase()) {
                    if (pUrl && currentUser.photoUrl !== pUrl) {
                        currentUser.photoUrl = pUrl;
                        updateComposerAvatar();
                    }
                }
            });
        }, (err) => {
            console.warn("Real-time students photo sync error:", err);
        });
    } catch (e) {
        console.warn("Could not listen to students collection:", e);
    }
}

function handleTimelineLogout() {
    sessionStorage.removeItem('studentTimelineSession');
    sessionStorage.removeItem('studentLoggedInSession');
    localStorage.removeItem('studentTimelineSession');
    localStorage.removeItem('studentLoggedInSession');
    localStorage.removeItem('loggedInStudentCode');
    localStorage.removeItem('studentLoggedIn');
    currentUser = null;
    if (unsubscribeStudents) unsubscribeStudents();
    if (unsubscribePosts) unsubscribePosts(); 
    if (unsubscribeNotifs) unsubscribeNotifs();
    if (auth.currentUser) signOut(auth);
    window.location.href = 'index.html';
}

document.getElementById('logoutBtn')?.addEventListener('click', handleTimelineLogout);
document.getElementById('studentLogoutBtn')?.addEventListener('click', handleTimelineLogout);

// --- 3. @MENTION AUTOCOMPLETE ---

async function fetchAllNames() {
    let names = [];
    let directory = [];
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.email) {
                const rawName = data.email.split('@')[0];
                const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const name = data.role === 'admin' ? 'Administrator' : teacherName;
                const pUrl = resolvePhotoUrl(data.photoUrl || data.photo || data.avatar || '');
                names.push(name);
                directory.push({
                    name: name,
                    code: data.email,
                    role: data.role === 'admin' ? 'Super Admin' : 'Teacher',
                    studentClass: 'Staff',
                    photoUrl: pUrl
                });
                if (pUrl) {
                    userPhotoMap.set(data.email.toLowerCase(), pUrl);
                    userPhotoMap.set(data.email.toUpperCase(), pUrl);
                    userPhotoMap.set(name.trim().toLowerCase(), pUrl);
                }
            }
        });
    } catch (e) {
        console.warn("Could not load users directory.", e);
    }
    
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        studentsSnap.forEach(docSnap => {
            const sData = docSnap.data();
            if (sData.studentName) {
                const pUrl = resolvePhotoUrl(sData.photoUrl || sData.photo || sData.avatar || '');
                names.push(sData.studentName);
                directory.push({
                    name: sData.studentName,
                    code: docSnap.id,
                    role: 'Student',
                    studentClass: sData.studentClass || sData.class || 'Student',
                    photoUrl: pUrl
                });
                if (pUrl) {
                    userPhotoMap.set(docSnap.id.toUpperCase(), pUrl);
                    userPhotoMap.set(sData.studentName.trim().toLowerCase(), pUrl);
                }
            }
        });
    } catch (e) {
        console.warn("Could not load students directory.", e);
    }
    
    allUserNames = [...new Set(names)];
    allUserDirectory = directory;
}

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
    const mentionPopup = document.getElementById('mentionPopup');
    if (!mentionPopup) return;
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
        div.onclick = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
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
    mentionPopup.style.width = Math.max(rect.width, 200) + 'px';
    mentionPopup.classList.remove('hidden');
}

function hideMentionPopup() {
    const mentionPopup = document.getElementById('mentionPopup');
    if (mentionPopup) mentionPopup.classList.add('hidden');
}

document.addEventListener('click', (e) => { 
    const mentionPopup = document.getElementById('mentionPopup');
    if (mentionPopup && !mentionPopup.contains(e.target)) hideMentionPopup(); 
});

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
            const safeMsg = escapeHtml(notif.message);
            dropdown.innerHTML += `
                <div class="notif-item ${readClass}" onclick="openNotification('${docSnap.id}', '${notif.postId}')">
                    ${safeMsg}
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

document.getElementById('notifToggleBtn')?.addEventListener('click', () => {
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
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

// Auto-resize timeline post textarea dynamically to fit text without scrollbar
const initPostTextareaAutoResize = () => {
    const postMsgEl = document.getElementById('postMessage');
    if (!postMsgEl) return;
    const resize = () => {
        postMsgEl.style.height = 'auto';
        postMsgEl.style.height = Math.max(80, postMsgEl.scrollHeight) + 'px';
    };
    postMsgEl.addEventListener('input', resize);
    postMsgEl.addEventListener('change', resize);
    postMsgEl.addEventListener('focus', resize);
};
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPostTextareaAutoResize);
} else {
    initPostTextareaAutoResize();
}

// --- GOOGLE DRIVE IMAGE ATTACHMENT SYSTEM FOR TIMELINE ---
let currentTimelineImageData = null;
let timelineDriveConfig = {
    scriptUrl: '',
    folderId: ''
};

async function syncDriveConfigFromFirestore() {
    try {
        let snap = await getDoc(doc(db, "system_settings", "google_drive"));
        if (!snap.exists()) {
            snap = await getDoc(doc(db, "system_settings", "googleDrive"));
        }
        if (snap.exists()) {
            const data = snap.data();
            timelineDriveConfig.scriptUrl = data.timelineScriptUrl || data.scriptUrlTimeline || data.scriptUrl || '';
            timelineDriveConfig.folderId = data.timelineFolderId || data.folderIdTimeline || data.folderId || '';
            if (timelineDriveConfig.scriptUrl) {
                localStorage.setItem('timelineDriveScriptUrl', timelineDriveConfig.scriptUrl);
            }
            if (timelineDriveConfig.folderId) {
                localStorage.setItem('timelineDriveFolderId', timelineDriveConfig.folderId);
            }
        } else {
            timelineDriveConfig.scriptUrl = localStorage.getItem('timelineDriveScriptUrl') || '';
            timelineDriveConfig.folderId = localStorage.getItem('timelineDriveFolderId') || '';
        }
    } catch (err) {
        console.warn("Could not sync Drive config from Firestore:", err);
        timelineDriveConfig.scriptUrl = localStorage.getItem('timelineDriveScriptUrl') || '';
        timelineDriveConfig.folderId = localStorage.getItem('timelineDriveFolderId') || '';
    }
}

function initTimelineImageUpload() {
    const attachBtn = document.getElementById('btnAttachImage');
    const fileInput = document.getElementById('timelineImageInput');
    const removeBtn = document.getElementById('btnRemoveComposerImage');

    // Sync configuration from Firestore
    syncDriveConfigFromFirestore();

    // File selection
    attachBtn?.addEventListener('click', () => {
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) handleTimelineImageFile(file);
    });

    removeBtn?.addEventListener('click', () => {
        clearTimelineComposerImage();
    });
}

function clearTimelineComposerImage() {
    currentTimelineImageData = null;
    const fileInput = document.getElementById('timelineImageInput');
    const previewContainer = document.getElementById('composerImagePreviewContainer');
    const previewImg = document.getElementById('composerPreviewImg');
    const statusEl = document.getElementById('composerImageUploadStatus');
    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.src = '';
    if (statusEl) {
        statusEl.innerText = 'Ready to post';
        statusEl.style.color = '#2563eb';
    }
    if (previewContainer) previewContainer.classList.add('hidden');
}

async function handleTimelineImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert("Please select a valid image file.");
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        alert("Image is too large. Please select an image under 15MB.");
        return;
    }

    const previewContainer = document.getElementById('composerImagePreviewContainer');
    const previewImg = document.getElementById('composerPreviewImg');
    const fileNameEl = document.getElementById('composerImageFileName');
    const statusEl = document.getElementById('composerImageUploadStatus');

    if (fileNameEl) fileNameEl.innerText = file.name;
    if (previewContainer) previewContainer.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = async (event) => {
        const dataUrl = event.target.result;
        if (previewImg) previewImg.src = dataUrl;

        currentTimelineImageData = {
            file: file,
            dataUrl: dataUrl,
            finalUrl: dataUrl,
            fileName: file.name,
            uploading: false
        };

        const scriptUrl = timelineDriveConfig.scriptUrl || localStorage.getItem('timelineDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
        const folderId = timelineDriveConfig.folderId || localStorage.getItem('timelineDriveFolderId') || '';

        if (scriptUrl) {
            if (statusEl) {
                statusEl.innerText = "⏳ Uploading to Google Drive...";
                statusEl.style.color = "#d97706";
            }
            currentTimelineImageData.uploading = true;

            try {
                const base64Data = dataUrl.split(',')[1];
                const response = await fetch(scriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        fileName: file.name,
                        mimeType: file.type || 'image/jpeg',
                        base64Data: base64Data,
                        folderName: "TimelineDB",
                        folderId: folderId,
                        type: "timeline_post"
                    })
                });

                const resText = await response.text();
                let resJson;
                try {
                    resJson = JSON.parse(resText);
                } catch(pErr) {
                    console.warn("Raw Google Drive script response:", resText);
                }

                if (resJson && (resJson.url || resJson.directUrl || resJson.viewUrl)) {
                    currentTimelineImageData.finalUrl = resJson.url || resJson.directUrl || resJson.viewUrl;
                    if (statusEl) {
                        statusEl.innerText = "✓ Uploaded to Google Drive (" + (folderId ? "Folder ID" : "TimelineDB") + ")";
                        statusEl.style.color = "#16a34a";
                    }
                } else if (resJson && resJson.status === 'success' && resJson.fileId) {
                    currentTimelineImageData.finalUrl = "https://lh3.googleusercontent.com/d/" + resJson.fileId;
                    if (statusEl) {
                        statusEl.innerText = "✓ Uploaded to Google Drive (" + (folderId ? "Folder ID" : "TimelineDB") + ")";
                        statusEl.style.color = "#16a34a";
                    }
                } else if (resJson && resJson.status === 'error') {
                    console.error("Google Drive Apps Script Error:", resJson.message);
                    if (statusEl) {
                        statusEl.innerText = "⚠️ Drive Error: " + resJson.message;
                        statusEl.style.color = "#ef4444";
                    }
                } else {
                    if (statusEl) {
                        statusEl.innerText = "⚠️ Drive upload response unverified";
                        statusEl.style.color = "#d97706";
                    }
                }
            } catch (uploadErr) {
                console.warn("Google Drive upload error:", uploadErr);
                if (statusEl) {
                    statusEl.innerText = "⚠️ Upload error (saved locally)";
                    statusEl.style.color = "#d97706";
                }
            } finally {
                if (currentTimelineImageData) currentTimelineImageData.uploading = false;
            }
        } else {
            if (statusEl) {
                statusEl.innerText = "✓ Ready to post (Configure Drive ⚙️ for Drive upload)";
                statusEl.style.color = "#2563eb";
            }
        }
    };
    reader.readAsDataURL(file);
}

document.getElementById('submitPostBtn')?.addEventListener('click', async () => {
    if (!currentUser) return alert("Please log in first to submit a post.");
    const postMsgEl = document.getElementById('postMessage');
    if (!postMsgEl) return;
    const message = postMsgEl.value.trim();
    const targetClass = document.getElementById('postTargetClass') ? document.getElementById('postTargetClass').value : 'All';

    if (!message && !currentTimelineImageData) return alert("You must write a message or attach a photo.");

    if (currentTimelineImageData && currentTimelineImageData.uploading) {
        alert("Photo is still uploading to Google Drive. Please wait a moment.");
        return;
    }

    try {
        const photoUrl = getUserPhotoUrl(currentUser.code, currentUser.name, currentUser.photoUrl);
        const postData = {
            authorCode: currentUser.code || '',
            authorName: currentUser.name || 'Student',
            authorPhotoUrl: photoUrl || '',
            isStaff: currentUser.type === 'staff',
            message: message,
            targetClass: targetClass, // Saved class target
            timestamp: new Date().toISOString()
        };

        if (currentTimelineImageData && currentTimelineImageData.finalUrl) {
            postData.imageUrl = currentTimelineImageData.finalUrl;
        }

        const postRef = await addDoc(collection(db, "timeline_posts"), postData);
        
        const mentions = extractMentions(message);
        for (let m of mentions) {
            await sendNotification(m, `${currentUser.name} mentioned you in a new post.`, postRef.id);
        }

        postMsgEl.value = '';
        postMsgEl.style.height = '80px';
        clearTimelineComposerImage();
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
            const postTarget = post.targetClass || 'All';

            // SECURITY & PRIVACY FILTER FOR STUDENTS
            if (currentUser.type === 'student') {
                const userClass = currentUser.studentClass || '';
                if (postTarget !== 'All' && postTarget !== userClass) {
                    return; // Skip rendering post if not intended for student's class
                }
            }
            
            const dateStr = formatTimeAgo(post.timestamp);
            const badgeHTML = post.isStaff ? `<img src="https://lh3.googleusercontent.com/d/1F9iWlab0M6Hlc1L5NR_HP4vsQDJJpd3d" alt="Verified" class="staff-badge-img">` : '';
            const safeClass = escapeHtml(postTarget);
            const classBadgeHTML = `<span class="target-class-badge">${safeClass}</span>`;
            const fullAuthorName = post.authorName || 'Student';
            const nickname = formatNickname(fullAuthorName);
            const safeAuthor = escapeHtml(nickname);
            const safeFullName = escapeHtml(fullAuthorName);
            const authorAvatarHTML = renderAvatarHTML(nickname, post.authorCode, post.authorPhotoUrl, post.isStaff);

            const canDeletePost = (currentUser.type === 'staff') || (currentUser.code && post.authorCode === currentUser.code);
            let kebabMenuHTML = '';
            if (canDeletePost) {
                kebabMenuHTML = `
                    <div class="kebab-wrapper">
                        <button type="button" class="kebab-btn" title="Options" data-post-id="${postId}">⋮</button>
                        <div id="kebab-post-${postId}" class="kebab-dropdown hidden">
                            <button type="button" class="kebab-item danger btn-delete-post" data-post-id="${postId}">
                                Delete Post
                            </button>
                        </div>
                    </div>
                `;
            }

            let imageHTML = '';
            if (post.imageUrl) {
                const safeImgUrl = escapeHtml(post.imageUrl);
                imageHTML = `
                    <div class="post-image-container" style="margin-top: 10px;">
                        <img src="${safeImgUrl}" class="post-attached-image" alt="Post Photo" loading="lazy" onclick="window.open('${safeImgUrl}', '_blank')">
                    </div>
                `;
            }

            const postElement = document.createElement('div');
            postElement.className = 'timeline-post';
            postElement.id = 'post-' + postId; 
            
            postElement.innerHTML = `
                <div class="post-sender-row">
                    <div class="sender-info-wrapper">
                        ${authorAvatarHTML}
                        <div class="sender-details">
                            <div class="sender-name-line">
                                <span class="sender-name" title="${safeFullName}">${safeAuthor}</span>
                                ${badgeHTML}
                                ${classBadgeHTML}
                            </div>
                            <span class="post-time" data-timestamp="${post.timestamp}">${dateStr}</span>
                        </div>
                    </div>
                    ${kebabMenuHTML}
                </div>

                ${post.message ? `<div class="post-body">${formatMessageMentions(post.message)}</div>` : ''}
                ${imageHTML}
                
                <div class="post-actions-bar">
                    <button class="action-btn" onclick="toggleComments('${postId}')">
                        <img src="https://lh3.googleusercontent.com/d/1mG_1QIzF-9Y1_wnSONpFkIMmqaIj7pgZ" alt="Comment" class="action-icon"> <span id="comment-count-${postId}">0</span> Comments
                    </button>
                </div>

                <div class="comments-wrapper hidden" id="comments-wrapper-${postId}">
                    <div class="comments-list" id="comments-list-${postId}"></div>
                    
                    <div class="reply-box">
                        <input type="text" id="reply-msg-${postId}" class="reply-input" placeholder="Write a reply... (Type @ to mention)">
                        <button class="reply-submit-btn" onclick="submitReply('${postId}', '${safeAuthor.replace(/'/g, "\\'")}')">Reply</button>
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
            const badgeHTML = comment.isStaff ? `<img src="https://lh3.googleusercontent.com/d/1F9iWlab0M6Hlc1L5NR_HP4vsQDJJpd3d" alt="Verified" class="staff-badge-img">` : '';
            const fullCommentAuthor = comment.authorName || 'Student';
            const nickname = formatNickname(fullCommentAuthor);
            const safeCommentAuthor = escapeHtml(nickname);
            const safeFullAuthor = escapeHtml(fullCommentAuthor);
            const commentTimeStr = formatTimeAgo(comment.timestamp);
            const commentAvatarHTML = renderAvatarHTML(nickname, comment.authorCode, comment.authorPhotoUrl, comment.isStaff, 'comment-avatar');
            
            const canDeleteComment = (currentUser.type === 'staff') || (currentUser.code && comment.authorCode === currentUser.code);
            let commentKebabHTML = '';
            if (canDeleteComment) {
                commentKebabHTML = `
                    <div class="kebab-wrapper">
                        <button type="button" class="kebab-btn" style="font-size: 16px; padding: 2px 6px;" title="Options" data-comment-id="${comment.id}">⋮</button>
                        <div id="kebab-comment-${comment.id}" class="kebab-dropdown hidden">
                            <button type="button" class="kebab-item danger btn-delete-comment" data-comment-id="${comment.id}">
                                Delete Reply
                            </button>
                        </div>
                    </div>
                `;
            }

            commentListEl.innerHTML += `
                <div class="comment-item" id="comment-${comment.id}">
                    <div class="comment-sender-row">
                        <div class="sender-info-wrapper">
                            ${commentAvatarHTML}
                            <div class="sender-details">
                                <div class="sender-name-line">
                                    <span class="sender-name comment-sender-name" title="${safeFullAuthor}">${safeCommentAuthor}</span>
                                    ${badgeHTML}
                                </div>
                                <span class="post-time comment-time" data-timestamp="${comment.timestamp}">${commentTimeStr}</span>
                            </div>
                        </div>
                        ${commentKebabHTML}
                    </div>
                    <div class="comment-body">
                        ${formatMessageMentions(comment.message)}
                    </div>
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
        const photoUrl = getUserPhotoUrl(currentUser.code, currentUser.name, currentUser.photoUrl);
        await addDoc(collection(db, "timeline_comments"), {
            postId: postId,
            authorCode: currentUser.code || '',
            authorName: currentUser.name || 'Student',
            authorPhotoUrl: photoUrl || '',
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
    let safeText = escapeHtml(text);
    allUserNames.forEach(name => {
        const rawMention = '@' + name;
        const safeMention = escapeHtml(rawMention);
        if (safeText.includes(safeMention)) {
            safeText = safeText.split(safeMention).join(`<span style="color: var(--primary-color); font-weight: bold;">${safeMention}</span>`);
        }
    });
    return safeText;
}

// --- AUTO-UPDATE RELATIVE TIMESTAMPS ---

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

async function populateClassDropdown() {
    const classSelect = document.getElementById('postTargetClass');
    if (!classSelect || !currentUser) return;

    // Use plain text inside option tags so browsers render correctly
    classSelect.innerHTML = '<option value="All">All Classes</option>';

    if (currentUser.type === 'student') {
        const userClass = currentUser.studentClass || 'Unassigned';
        if (userClass !== 'Unassigned') {
            classSelect.innerHTML += `<option value="${userClass}">${userClass} (My Class)</option>`;
        }
    } 
    else if (currentUser.type === 'staff') {
        try {
            const studentsSnap = await getDocs(collection(db, "students"));
            const uniqueClasses = new Set();

            studentsSnap.forEach(docSnap => {
                const data = docSnap.data();
                const cName = data.studentClass || data.class || data.className;
                if (cName) uniqueClasses.add(cName);
            });

            Array.from(uniqueClasses).sort().forEach(className => {
                classSelect.innerHTML += `<option value="${className}">${className}</option>`;
            });
        } catch (e) {
            console.warn("Could not load classes dropdown list:", e);
        }
    }
}

// --- 7. REAL-TIME DIRECT MESSAGING (DM) SYSTEM ---

let allUserDirectory = []; 
let currentChatPartner = null; 
let unsubscribeDMMessages = null;
let unsubscribeDMThreads = null;

function initDMSystem() {
    if (!currentUser) return;

    const nameEl = document.getElementById('dmHeaderUserName');
    if (nameEl) nameEl.innerText = currentUser.name;

    const floatBtn = document.getElementById('dmFloatingBtn');
    const widget = document.getElementById('dmPopupWidget');
    const closeBtn = document.getElementById('dmCloseWidgetBtn');
    const newChatBtn = document.getElementById('dmNewChatBtn');
    const backBtn = document.getElementById('dmBackToThreadsBtn');
    const leaveBtn = document.getElementById('dmLeaveChatroomBtn');
    const searchInput = document.getElementById('dmContactSearchInput');
    const msgForm = document.getElementById('dmMessageForm');

    floatBtn?.addEventListener('click', () => {
        widget?.classList.toggle('hidden');
        if (!widget?.classList.contains('hidden')) {
            showDMView('threads');
        }
    });

    closeBtn?.addEventListener('click', () => {
        widget?.classList.add('hidden');
    });

    newChatBtn?.addEventListener('click', () => {
        showDMView('contacts');
        renderDMContactsList('');
    });

    backBtn?.addEventListener('click', () => {
        showDMView('threads');
    });

    leaveBtn?.addEventListener('click', () => {
        if (unsubscribeDMMessages) unsubscribeDMMessages();
        currentChatPartner = null;
        showDMView('threads');
    });

    searchInput?.addEventListener('input', (e) => {
        renderDMContactsList(e.target.value.trim().toLowerCase());
    });

    msgForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('dmMessageInput');
        const text = input ? input.value.trim() : '';
        if (!text || !currentChatPartner || !currentUser) return;

        const newMsgDoc = {
            participants: [currentUser.code, currentChatPartner.code].sort(),
            senderCode: currentUser.code,
            senderName: currentUser.name,
            receiverCode: currentChatPartner.code,
            receiverName: currentChatPartner.name,
            message: text,
            timestamp: new Date().toISOString(),
            read: false
        };

        try {
            await addDoc(collection(db, "direct_messages"), newMsgDoc);
        } catch (err) {
            // Fallback to local session storage if Firestore rules restrict direct_messages collection
            saveLocalDM(newMsgDoc);
            renderLocalDMMessagesStream();
            renderLocalDMThreads();
        }

        if (input) input.value = '';
    });

    window.deleteDMChatroom = async function(partnerCode, partnerName) {
        const targetCode = partnerCode || currentChatPartner?.code;
        const targetName = partnerName || currentChatPartner?.name || 'this chatroom';
        if (!currentUser || !targetCode) return;

        const ok = confirm(`Delete chatroom with ${targetName}? It will be removed from your chat list.`);
        if (!ok) return;

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
            console.warn("Firestore delete chat notice:", err);
        }

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
            if (unsubscribeDMMessages) unsubscribeDMMessages();
            currentChatPartner = null;
            showDMView('threads');
        }

        subscribeDMThreads();
    };

    const deleteChatBtn = document.getElementById('dmDeleteChatroomBtn');
    deleteChatBtn?.addEventListener('click', () => {
        if (currentChatPartner) window.deleteDMChatroom(currentChatPartner.code, currentChatPartner.name);
    });

    subscribeDMThreads();
}

// In-Memory & Local Session Storage Fallback for DM
function getLocalDMMessages() {
    try {
        const stored = sessionStorage.getItem('local_direct_messages');
        return stored ? JSON.parse(stored) : [];
    } catch(e) { return []; }
}

function saveLocalDM(msgDoc) {
    const list = getLocalDMMessages();
    list.push(msgDoc);
    sessionStorage.setItem('local_direct_messages', JSON.stringify(list));
}

function showDMView(viewName) {
    const threadsView = document.getElementById('dmThreadsView');
    const contactsView = document.getElementById('dmContactsView');
    const chatroomView = document.getElementById('dmChatroomView');

    threadsView?.classList.add('hidden');
    contactsView?.classList.add('hidden');
    chatroomView?.classList.add('hidden');

    if (viewName === 'threads') {
        threadsView?.classList.remove('hidden');
    } else if (viewName === 'contacts') {
        contactsView?.classList.remove('hidden');
    } else if (viewName === 'chatroom') {
        chatroomView?.classList.remove('hidden');
    }
}

function subscribeDMThreads() {
    if (!currentUser) return;
    if (unsubscribeDMThreads) unsubscribeDMThreads();

    try {
        const q = query(
            collection(db, "direct_messages"),
            where("participants", "array-contains", currentUser.code)
        );

        unsubscribeDMThreads = onSnapshot(q, (snapshot) => {
            const threadsListEl = document.getElementById('dmThreadsList');
            const totalBadgeEl = document.getElementById('dmUnreadTotalBadge');
            if (!threadsListEl) return;

            let messagesList = [];
            snapshot.forEach(docSnap => messagesList.push({ id: docSnap.id, ...docSnap.data() }));

            // Merge local fallback messages if any exist
            const localMsgs = getLocalDMMessages().filter(m => m.participants.includes(currentUser.code));
            messagesList = [...messagesList, ...localMsgs];

            // Filter out messages hidden for currentUser
            messagesList = messagesList.filter(data => !(data.hiddenFor && data.hiddenFor.includes(currentUser.code)));

            messagesList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            let threadsMap = new Map();
            let totalUnread = 0;

            messagesList.forEach(data => {
                const partnerCode = data.senderCode === currentUser.code ? data.receiverCode : data.senderCode;
                const partnerName = data.senderCode === currentUser.code ? data.receiverName : data.senderName;

                if (!threadsMap.has(partnerCode)) {
                    threadsMap.set(partnerCode, {
                        partnerCode: partnerCode,
                        partnerName: partnerName,
                        lastMessage: data.message,
                        timestamp: data.timestamp,
                        unread: (!data.read && data.receiverCode === currentUser.code) ? 1 : 0
                    });
                } else if (!data.read && data.receiverCode === currentUser.code) {
                    threadsMap.get(partnerCode).unread += 1;
                }

                if (!data.read && data.receiverCode === currentUser.code) {
                    totalUnread++;
                }
            });

            if (totalBadgeEl) {
                if (totalUnread > 0) {
                    totalBadgeEl.innerText = totalUnread;
                    totalBadgeEl.classList.remove('hidden');
                } else {
                    totalBadgeEl.classList.add('hidden');
                }
            }

            if (threadsMap.size === 0) {
                threadsListEl.innerHTML = `<div class="dm-empty-state">No conversations yet. Click "+ Add Chat" to start a direct message!</div>`;
                return;
            }

            threadsListEl.innerHTML = '';
            threadsMap.forEach(thread => {
                const fullPartnerName = thread.partnerName || 'User';
                const nickName = formatNickname(fullPartnerName);
                const initial = escapeHtml(nickName ? nickName.charAt(0).toUpperCase() : '?');
                const dateStr = formatTimeAgo(thread.timestamp);
                const unreadHTML = thread.unread > 0 ? `<span class="dm-unread-badge">${thread.unread}</span>` : '';
                const safeCode = (thread.partnerCode || 'user').replace(/[^a-zA-Z0-9]/g, '_');
                const safePartnerName = escapeHtml(nickName);
                const safeFullName = escapeHtml(fullPartnerName);
                const safeLastMsg = escapeHtml(thread.lastMessage || '');

                const dmPhoto = getUserPhotoUrl(thread.partnerCode, fullPartnerName);
                const dmAvatarHTML = dmPhoto 
                    ? `<div class="dm-contact-avatar"><img src="${escapeHtml(dmPhoto)}" alt="Avatar" class="avatar-circle-img" onerror="this.parentElement.innerHTML='${initial}'"></div>`
                    : `<div class="dm-contact-avatar">${initial}</div>`;

                const item = document.createElement('div');
                item.className = 'dm-thread-item';
                item.innerHTML = `
                    ${dmAvatarHTML}
                    <div class="dm-contact-info">
                        <div class="dm-contact-name" title="${safeFullName}">${safePartnerName}</div>
                        <div class="dm-preview-text">${safeLastMsg}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <div style="text-align: right;">
                            <div style="font-size: 10px; color: var(--text-muted);">${dateStr}</div>
                            ${unreadHTML}
                        </div>
                        <div class="kebab-wrapper" style="position: relative;" onclick="event.stopPropagation();">
                            <button class="dm-icon-btn thread-kebab-btn" onclick="toggleKebabMenu(event, 'dmThreadKebab_${safeCode}')" title="Options" style="color: var(--text-muted) !important; font-size: 16px !important; padding: 2px 6px !important;">&#8942;</button>
                            <div class="kebab-dropdown hidden" id="dmThreadKebab_${safeCode}">
                                <button class="kebab-item delete-item" onclick="deleteDMChatroom('${thread.partnerCode}', '${safePartnerName.replace(/'/g, "\\'")}')" style="color: #ef4444 !important;">Delete Chat</button>
                            </div>
                        </div>
                    </div>
                `;

                item.onclick = () => {
                    const found = allUserDirectory.find(u => u.code === thread.partnerCode) || {
                        name: thread.partnerName,
                        code: thread.partnerCode,
                        role: 'User'
                    };
                    openDMChatroom(found);
                };

                threadsListEl.appendChild(item);
            });
        }, (err) => {
            renderLocalDMThreads();
        });
    } catch (e) {
        renderLocalDMThreads();
    }
}

function renderLocalDMThreads() {
    if (!currentUser) return;
    const threadsListEl = document.getElementById('dmThreadsList');
    if (!threadsListEl) return;

    let localMsgs = getLocalDMMessages().filter(m => m.participants.includes(currentUser.code));
    localMsgs = localMsgs.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));
    localMsgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let threadsMap = new Map();
    localMsgs.forEach(data => {
        const partnerCode = data.senderCode === currentUser.code ? data.receiverCode : data.senderCode;
        const partnerName = data.senderCode === currentUser.code ? data.receiverName : data.senderName;
        if (!threadsMap.has(partnerCode)) {
            threadsMap.set(partnerCode, {
                partnerCode: partnerCode,
                partnerName: partnerName,
                lastMessage: data.message,
                timestamp: data.timestamp,
                unread: 0
            });
        }
    });

    if (threadsMap.size === 0) {
        threadsListEl.innerHTML = `<div class="dm-empty-state">No conversations yet. Click "+ Add Chat" to start a direct message!</div>`;
        return;
    }

    threadsListEl.innerHTML = '';
    threadsMap.forEach(thread => {
        const fullPartnerName = thread.partnerName || 'User';
        const nickName = formatNickname(fullPartnerName);
        const initial = escapeHtml(nickName ? nickName.charAt(0).toUpperCase() : '?');
        const dateStr = formatTimeAgo(thread.timestamp);
        const safeCode = (thread.partnerCode || 'user').replace(/[^a-zA-Z0-9]/g, '_');
        const safePartnerName = escapeHtml(nickName);
        const safeFullName = escapeHtml(fullPartnerName);
        const safeLastMsg = escapeHtml(thread.lastMessage || '');
        const dmPhoto = getUserPhotoUrl(thread.partnerCode, fullPartnerName);
        const dmAvatarHTML = dmPhoto 
            ? `<div class="dm-contact-avatar"><img src="${escapeHtml(dmPhoto)}" alt="Avatar" class="avatar-circle-img" onerror="this.parentElement.innerHTML='${initial}'"></div>`
            : `<div class="dm-contact-avatar">${initial}</div>`;

        const item = document.createElement('div');
        item.className = 'dm-thread-item';
        item.innerHTML = `
            ${dmAvatarHTML}
            <div class="dm-contact-info">
                <div class="dm-contact-name" title="${safeFullName}">${safePartnerName}</div>
                <div class="dm-preview-text">${safeLastMsg}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <div style="text-align: right;">
                    <div style="font-size: 10px; color: var(--text-muted);">${dateStr}</div>
                </div>
                <div class="kebab-wrapper" style="position: relative;" onclick="event.stopPropagation();">
                    <button class="dm-icon-btn thread-kebab-btn" onclick="toggleKebabMenu(event, 'dmThreadKebab_${safeCode}')" title="Options" style="color: var(--text-muted) !important; font-size: 16px !important; padding: 2px 6px !important;">&#8942;</button>
                    <div class="kebab-dropdown hidden" id="dmThreadKebab_${safeCode}">
                        <button class="kebab-item delete-item" onclick="deleteDMChatroom('${thread.partnerCode}', '${safePartnerName.replace(/'/g, "\\'")}')" style="color: #ef4444 !important;">Delete Chat</button>
                    </div>
                </div>
            </div>
        `;

        item.onclick = () => {
            const found = allUserDirectory.find(u => u.code === thread.partnerCode) || {
                name: thread.partnerName,
                code: thread.partnerCode,
                role: 'User'
            };
            openDMChatroom(found);
        };

        threadsListEl.appendChild(item);
    });
}

function renderDMContactsList(filterStr) {
    const listEl = document.getElementById('dmContactsList');
    if (!listEl) return;

    const filtered = allUserDirectory.filter(u => {
        if (u.code === currentUser.code) return false; 
        if (!filterStr) return true;
        return u.name.toLowerCase().includes(filterStr) || u.role.toLowerCase().includes(filterStr);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="dm-empty-state">No contacts found matching "${filterStr}".</div>`;
        return;
    }

    listEl.innerHTML = '';
    filtered.forEach(contact => {
        const fullContactName = contact.name || 'User';
        const nickName = formatNickname(fullContactName);
        const initial = escapeHtml(nickName ? nickName.charAt(0).toUpperCase() : '?');
        const safeContactName = escapeHtml(nickName);
        const safeFullName = escapeHtml(fullContactName);
        const safeRole = escapeHtml(contact.role || 'User');
        const safeClass = contact.studentClass ? ' • ' + escapeHtml(contact.studentClass) : '';
        const dmPhoto = getUserPhotoUrl(contact.code, fullContactName, contact.photoUrl);
        const dmAvatarHTML = dmPhoto 
            ? `<div class="dm-contact-avatar"><img src="${escapeHtml(dmPhoto)}" alt="Avatar" class="avatar-circle-img" onerror="this.parentElement.innerHTML='${initial}'"></div>`
            : `<div class="dm-contact-avatar">${initial}</div>`;

        const item = document.createElement('div');
        item.className = 'dm-contact-item';
        item.innerHTML = `
            ${dmAvatarHTML}
            <div class="dm-contact-info">
                <div class="dm-contact-name" title="${safeFullName}">${safeContactName}</div>
                <div class="dm-preview-text">${safeRole}${safeClass}</div>
            </div>
            <button class="dm-new-chat-btn">Chat</button>
        `;

        item.onclick = () => openDMChatroom(contact);
        listEl.appendChild(item);
    });
}

function openDMChatroom(partner) {
    if (!partner || !currentUser) return;
    currentChatPartner = partner;

    const nameEl = document.getElementById('dmChatPartnerName');
    const roleEl = document.getElementById('dmChatPartnerRole');
    if (nameEl) {
        nameEl.innerText = formatNickname(partner.name || 'User');
        nameEl.title = partner.name || '';
    }
    if (roleEl) roleEl.innerText = partner.role || 'User';

    showDMView('chatroom');
    subscribeDMMessagesStream();
}

function subscribeDMMessagesStream() {
    if (!currentUser || !currentChatPartner) return;
    if (unsubscribeDMMessages) unsubscribeDMMessages();

    const pair = [currentUser.code, currentChatPartner.code].sort();

    try {
        const q = query(
            collection(db, "direct_messages"),
            where("participants", "==", pair)
        );

        unsubscribeDMMessages = onSnapshot(q, (snapshot) => {
            const streamEl = document.getElementById('dmMessagesStream');
            if (!streamEl) return;

            let messages = [];
            snapshot.forEach(docSnap => messages.push({ docId: docSnap.id, ...docSnap.data() }));

            // Merge local fallback messages
            const localMsgs = getLocalDMMessages().filter(m => 
                (m.senderCode === currentUser.code && m.receiverCode === currentChatPartner.code) ||
                (m.senderCode === currentChatPartner.code && m.receiverCode === currentUser.code)
            );
            messages = [...messages, ...localMsgs];

            // Filter out messages hidden for currentUser
            messages = messages.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));

            if (messages.length === 0) {
                streamEl.innerHTML = `<div class="dm-empty-state">No messages yet. Send a message to start chatting with ${escapeHtml(currentChatPartner.name)}!</div>`;
                return;
            }

            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            streamEl.innerHTML = '';
            messages.forEach(data => {
                if (data.docId && !data.read && data.receiverCode === currentUser.code) {
                    updateDoc(doc(db, "direct_messages", data.docId), { read: true }).catch(() => {});
                }

                const isSent = data.senderCode === currentUser.code;
                const msgClass = isSent ? 'dm-msg-sent' : 'dm-msg-received';
                const timeStr = formatTimeAgo(data.timestamp);
                const safeMessage = escapeHtml(data.message || '');

                const div = document.createElement('div');
                div.className = `dm-message-bubble ${msgClass}`;
                div.innerHTML = `
                    <div>${safeMessage}</div>
                    <div class="dm-msg-time">${timeStr}</div>
                `;
                streamEl.appendChild(div);
            });

            streamEl.scrollTop = streamEl.scrollHeight;
        }, (err) => {
            renderLocalDMMessagesStream();
        });
    } catch (e) {
        renderLocalDMMessagesStream();
    }
}

function renderLocalDMMessagesStream() {
    if (!currentUser || !currentChatPartner) return;
    const streamEl = document.getElementById('dmMessagesStream');
    if (!streamEl) return;

    let localMsgs = getLocalDMMessages().filter(m => 
        (m.senderCode === currentUser.code && m.receiverCode === currentChatPartner.code) ||
        (m.senderCode === currentChatPartner.code && m.receiverCode === currentUser.code)
    );
    localMsgs = localMsgs.filter(m => !(m.hiddenFor && m.hiddenFor.includes(currentUser.code)));

    if (localMsgs.length === 0) {
        streamEl.innerHTML = `<div class="dm-empty-state">No messages yet. Send a message to start chatting with ${escapeHtml(currentChatPartner.name)}!</div>`;
        return;
    }

    localMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    streamEl.innerHTML = '';
    localMsgs.forEach(data => {
        const isSent = data.senderCode === currentUser.code;
        const msgClass = isSent ? 'dm-msg-sent' : 'dm-msg-received';
        const timeStr = formatTimeAgo(data.timestamp);
        const safeMessage = escapeHtml(data.message || '');

        const div = document.createElement('div');
        div.className = `dm-message-bubble ${msgClass}`;
        div.innerHTML = `
            <div>${safeMessage}</div>
            <div class="dm-msg-time">${timeStr}</div>
        `;
        streamEl.appendChild(div);
    });

    streamEl.scrollTop = streamEl.scrollHeight;
}