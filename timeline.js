import { collection, addDoc, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { escapeHtml, formatTimeAgo } from "./utils.js";

function formatNotificationAge(timestamp) {
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

let currentUser = null; 
const embeddedPanel = new URLSearchParams(window.location.search).get('embed') === '1';
if (embeddedPanel && new URLSearchParams(window.location.search).get('panel') === 'notifications') {
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) document.body.appendChild(dropdown);
}
let unsubscribePosts = null; 
let unsubscribeAllPosts = null;
let unsubscribeNotifs = null; 
let allUserNames = [];
let unsubscribeStudents = null;
const userPhotoMap = new Map();
const activeCommentUnsubs = new Map();

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
    const isDark = theme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode', 'dark-theme');
        if (themeToggleIcon) themeToggleIcon.src = LIGHT_MODE_ICON_URL;
        if (themeToggleText) themeToggleText.innerText = 'Light Mode';
    } else {
        document.body.classList.remove('dark-mode', 'dark-theme');
        if (themeToggleIcon) themeToggleIcon.src = DARK_MODE_ICON_URL;
        if (themeToggleText) themeToggleText.innerText = 'Dark Mode';
    }
    document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.setProperty('display', isDark ? 'inline-block' : 'none', 'important'));
    document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.setProperty('display', isDark ? 'none' : 'inline-block', 'important'));
}

// Load saved theme on initial page load
const savedTheme = localStorage.getItem('appTheme') || localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

// Toggle theme on button click
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isDarkNow = !document.body.classList.contains('dark-theme');
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
        const postSnap = await getDoc(doc(db, "timeline_posts", postId));
        if (postSnap.exists()) {
            const post = postSnap.data();
            const isOwner = (currentUser.code && post.authorCode && post.authorCode === currentUser.code) ||
                            (currentUser.name && post.authorName && post.authorName === currentUser.name);
            if (currentUser.type !== 'staff' && !isOwner) {
                alert("You can only delete your own posts.");
                return;
            }
        }

        await deleteDoc(doc(db, "timeline_posts", postId));
        
        // Clean up associated comments in background
        try {
            const commentsSnap = await getDocs(query(collection(db, "timeline_comments"), where("postId", "==", postId)));
            const deletePromises = [];
            commentsSnap.forEach((cDoc) => {
                deletePromises.push(deleteDoc(doc(db, "timeline_comments", cDoc.id)));
            });
            await Promise.all(deletePromises);
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
        const commentSnap = await getDoc(doc(db, "timeline_comments", commentId));
        if (commentSnap.exists()) {
            const comment = commentSnap.data();
            const isOwner = (currentUser.code && comment.authorCode && comment.authorCode === currentUser.code) ||
                            (currentUser.name && comment.authorName && comment.authorName === currentUser.name);
            if (currentUser.type !== 'staff' && !isOwner) {
                alert("You can only delete your own comments.");
                return;
            }
        }

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
        || sessionStorage.getItem('studentTimelineSession');

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

    const requestedPanel = new URLSearchParams(window.location.search).get('panel');
    // Session setup can begin before this module finishes declaring feed and chat state.
    await Promise.resolve();
    if (embeddedPanel) {
        if (requestedPanel === 'chat') initDMSystem();
        if (requestedPanel === 'notifications') {
            loadNotifications();
            const dropdown = document.getElementById('notifDropdown');
            if (dropdown) dropdown.style.display = 'block';
        } else {
            document.getElementById('dmFloatingBtn')?.click();
        }
        return;
    }

    listenStudentsDirectory();
    await renderTimelineTabs();
    initTimelineImageUpload();
    loadPosts();
    loadNotifications();
    initDMSystem();
    fetchAllNames().catch(error => console.warn('Could not load user directory:', error));
    populateClassDropdown().catch(error => console.warn('Could not load class options:', error));
    if (requestedPanel === 'chat' || requestedPanel === 'notifications') {
        const buttonId = requestedPanel === 'chat' ? 'dmFloatingBtn' : 'notifToggleBtn';
        document.getElementById(buttonId)?.click();
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('panel');
        window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
    const requestedNotification = new URLSearchParams(window.location.search).get('notification');
    if (requestedNotification) {
        try {
            const notificationSnap = await getDoc(doc(db, 'timeline_notifications', requestedNotification));
            if (notificationSnap.exists()) await window.openNotification(requestedNotification, notificationSnap.data().postId);
        } catch (error) {
            console.warn('Could not open notification post:', error);
        }
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('notification');
        window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
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

// Live real-time listener to keep CURRENT user student photo synced (targeted 1-doc listener instead of entire collection)
function listenStudentsDirectory() {
    if (unsubscribeStudents) unsubscribeStudents();
    if (!currentUser || !currentUser.code) return;
    try {
        const studentDocRef = doc(db, "students", currentUser.code.toUpperCase());
        unsubscribeStudents = onSnapshot(studentDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const sData = docSnap.data();
                const pUrl = resolvePhotoUrl(sData.photoUrl || sData.photo || sData.avatar || '');
                if (pUrl && currentUser.photoUrl !== pUrl) {
                    currentUser.photoUrl = pUrl;
                    userPhotoMap.set(currentUser.code.toUpperCase(), pUrl);
                    updateComposerAvatar();
                }
            }
        }, (err) => {
            console.warn("Real-time student photo sync error:", err);
        });
    } catch (e) {
        console.warn("Could not listen to student doc:", e);
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
    activeCommentUnsubs.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    activeCommentUnsubs.clear();
    if (auth.currentUser) signOut(auth);
    window.location.href = 'index.html';
}

document.getElementById('logoutBtn')?.addEventListener('click', handleTimelineLogout);
document.getElementById('studentLogoutBtn')?.addEventListener('click', handleTimelineLogout);

// --- 3. @MENTION AUTOCOMPLETE ---

async function fetchAllNames() {
    const cacheKey = 'timeline_users_directory_cache';
    const cacheTimeKey = 'timeline_users_directory_cache_time';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cachedTime = sessionStorage.getItem(cacheTimeKey);
    const now = Date.now();

    if (cachedData && cachedTime && (now - Number(cachedTime) < 20 * 60 * 1000)) {
        try {
            const parsed = JSON.parse(cachedData);
            allUserNames = parsed.names || [];
            allUserDirectory = parsed.directory || [];
            (parsed.photos || []).forEach(([k, v]) => userPhotoMap.set(k, v));
            return;
        } catch (e) {}
    }

    let names = [];
    let directory = [];
    let photosList = [];
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
                    photosList.push([data.email.toLowerCase(), pUrl], [data.email.toUpperCase(), pUrl], [name.trim().toLowerCase(), pUrl]);
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
                    photosList.push([docSnap.id.toUpperCase(), pUrl], [sData.studentName.trim().toLowerCase(), pUrl]);
                }
            }
        });
    } catch (e) {
        console.warn("Could not load students directory.", e);
    }
    
    allUserNames = [...new Set(names)];
    allUserDirectory = directory;

    try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ names: allUserNames, directory: allUserDirectory, photos: photosList }));
        sessionStorage.setItem(cacheTimeKey, now.toString());
    } catch (e) {}
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
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${formatNotificationAge(notif.timestamp)}</div>
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
    const notifDropdown = document.getElementById('notifDropdown');
    if (notifDropdown && !embeddedPanel) notifDropdown.style.display = 'none';
    try { await updateDoc(doc(db, "timeline_notifications", notifId), { read: true }); } catch(e) {}

    if (embeddedPanel) {
        const detail = document.createElement('div');
        detail.className = 'embedded-notification-detail';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'embedded-notification-back-btn';
        back.textContent = '← All notifications';
        back.addEventListener('click', () => detail.remove());
        detail.appendChild(back);
        try {
            const snap = await getDoc(doc(db, 'timeline_notifications', notifId));
            if (snap.exists()) {
                const message = document.createElement('p');
                message.textContent = snap.data().message || 'Notification';
                detail.appendChild(message);
                const date = document.createElement('small');
                date.textContent = formatNotificationAge(snap.data().timestamp);
                detail.appendChild(date);
            }
        } catch (error) {
            console.warn('Could not load notification detail:', error);
        }
        if (postId) {
            const viewPost = document.createElement('button');
            viewPost.type = 'button';
            viewPost.className = 'embedded-notification-post-btn';
            viewPost.textContent = 'View post';
            viewPost.addEventListener('click', () => window.parent.postMessage({ type: 'portal-comms-view-post', notifId }, window.location.origin));
            detail.appendChild(viewPost);
        }
        document.body.appendChild(detail);
        return;
    }
    
    // 1. Locate the post in allCachedPosts, or fetch directly from Firestore
    let post = allCachedPosts.find(p => p.id === postId);
    if (!post) {
        try {
            const docSnap = await getDoc(doc(db, "timeline_posts", postId));
            if (docSnap.exists()) {
                post = { id: docSnap.id, ...docSnap.data() };
                allCachedPosts.unshift(post);
            }
        } catch (err) {
            console.warn("Could not fetch post for notification:", err);
        }
    }

    if (!post) {
        alert("This post may have been deleted.");
        return;
    }

    const isStaff = currentUser?.type === 'staff';
    const postTarget = (post.targetClass || 'All').trim();
    const isAll = postTarget === 'All' || postTarget.toLowerCase() === 'all classes';

    // 2. Automatically select the corresponding tab and class filter
    if (isAll) {
        currentTimelineTab = 'all';
    } else {
        currentTimelineTab = 'class';
        if (isStaff) {
            currentStaffSelectedClass = postTarget;
            const tabSelect = document.getElementById('tabClassSelect');
            if (tabSelect) {
                let matchFound = false;
                for (let i = 0; i < tabSelect.options.length; i++) {
                    if (tabSelect.options[i].value.toLowerCase() === postTarget.toLowerCase()) {
                        tabSelect.selectedIndex = i;
                        currentStaffSelectedClass = tabSelect.options[i].value;
                        matchFound = true;
                        break;
                    }
                }
                if (!matchFound) {
                    const opt = document.createElement('option');
                    opt.value = postTarget;
                    opt.textContent = postTarget;
                    opt.selected = true;
                    tabSelect.appendChild(opt);
                }
            }
        }
    }

    updateActiveTabUI();

    // 3. Check post index in filtered list and expand pagination limit if needed
    const filtered = getFilteredTimelinePosts();
    const targetIndex = filtered.findIndex(p => p.id === postId);

    if (targetIndex !== -1 && targetIndex >= currentRenderedLimit) {
        currentRenderedLimit = Math.ceil((targetIndex + 1) / TIMELINE_PAGE_SIZE) * TIMELINE_PAGE_SIZE;
    }

    // Re-render feed retaining rendered count
    renderTimelineFeed(false);

    // 4. Scroll to target post and apply focus animation
    setTimeout(() => {
        const postEl = document.getElementById('post-' + postId);
        if (postEl) {
            postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            postEl.style.transition = 'border-color 0.3s ease, box-shadow 0.3s ease';
            postEl.style.borderColor = '#2563eb';
            postEl.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.2)';
            setTimeout(() => {
                postEl.style.borderColor = '';
                postEl.style.boxShadow = '';
            }, 2500);
        } else {
            alert("This post may have been deleted.");
        }
    }, 150);
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

// --- MULTI-PHOTO & POLL COMPOSER MANAGEMENT ---
let currentComposerImages = [];
let isPollComposerOpen = false;

function initTimelineImageUpload() {
    const attachBtn = document.getElementById('btnAttachImage');
    const fileInput = document.getElementById('timelineImageInput');
    const pollToggleBtn = document.getElementById('btnTogglePollComposer');
    const discardPollBtn = document.getElementById('btnDiscardPoll');
    const addPollOptBtn = document.getElementById('btnAddPollOption');

    // Sync configuration from Firestore
    syncDriveConfigFromFirestore();

    // File selection (supports up to 5 photos)
    attachBtn?.addEventListener('click', () => {
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (currentComposerImages.length + files.length > 5) {
            alert("You can attach a maximum of 5 photos per post.");
        }

        const remainingSlots = 5 - currentComposerImages.length;
        const toAdd = files.slice(0, remainingSlots);

        for (const file of toAdd) {
            await handleComposerImageFile(file);
        }
        fileInput.value = '';
    });

    // Poll controls
    pollToggleBtn?.addEventListener('click', () => {
        const box = document.getElementById('composerPollBox');
        if (!box) return;
        isPollComposerOpen = !isPollComposerOpen;
        if (isPollComposerOpen) {
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
    });

    discardPollBtn?.addEventListener('click', () => {
        isPollComposerOpen = false;
        const box = document.getElementById('composerPollBox');
        if (box) box.classList.add('hidden');
        resetPollComposer();
    });

    addPollOptBtn?.addEventListener('click', () => {
        const list = document.getElementById('pollOptionsList');
        if (!list) return;
        const count = list.querySelectorAll('.poll-option-row').length;
        if (count >= 5) {
            alert("Maximum of 5 options allowed for a poll.");
            return;
        }
        const row = document.createElement('div');
        row.className = 'poll-option-row';
        row.innerHTML = `
            <input type="text" class="poll-option-input" placeholder="Option ${count + 1}">
            <button type="button" class="poll-remove-opt-btn" onclick="this.parentElement.remove()" title="Remove Option">✕</button>
        `;
        list.appendChild(row);
    });
}

function resetPollComposer() {
    const qInput = document.getElementById('pollQuestionInput');
    if (qInput) qInput.value = '';
    const list = document.getElementById('pollOptionsList');
    if (list) {
        list.innerHTML = `
            <div class="poll-option-row">
                <input type="text" class="poll-option-input" placeholder="Option 1">
            </div>
            <div class="poll-option-row">
                <input type="text" class="poll-option-input" placeholder="Option 2">
            </div>
        `;
    }
}

function clearTimelineComposerImages() {
    currentComposerImages = [];
    const container = document.getElementById('composerImagesContainer');
    const strip = document.getElementById('composerImagesStrip');
    if (strip) strip.innerHTML = '';
    if (container) container.classList.add('hidden');
}

window.removeComposerImage = function(id) {
    currentComposerImages = currentComposerImages.filter(img => img.id !== id);
    renderComposerImagesStrip();
};

function renderComposerImagesStrip() {
    const container = document.getElementById('composerImagesContainer');
    const strip = document.getElementById('composerImagesStrip');
    if (!container || !strip) return;

    if (currentComposerImages.length === 0) {
        container.classList.add('hidden');
        strip.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    strip.innerHTML = '';

    currentComposerImages.forEach((item) => {
        const chip = document.createElement('div');
        chip.className = 'composer-image-chip';
        chip.innerHTML = `
            <img src="${item.dataUrl}" alt="${escapeHtml(item.fileName)}">
            <button type="button" class="chip-remove-btn" onclick="window.removeComposerImage('${item.id}')" title="Remove Photo">&times;</button>
            ${item.uploading ? `<span class="chip-uploading-badge">Uploading...</span>` : ''}
        `;
        strip.appendChild(chip);
    });
}

async function handleComposerImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert(`"${file.name}" is not a valid image file.`);
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        alert(`"${file.name}" is too large (max 15MB).`);
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        const dataUrl = event.target.result;
        const imgItem = {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            file: file,
            dataUrl: dataUrl,
            finalUrl: dataUrl,
            fileName: file.name,
            uploading: false
        };

        currentComposerImages.push(imgItem);
        renderComposerImagesStrip();

        const scriptUrl = timelineDriveConfig.scriptUrl || localStorage.getItem('timelineDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
        const folderId = timelineDriveConfig.folderId || localStorage.getItem('timelineDriveFolderId') || '';

        if (scriptUrl) {
            imgItem.uploading = true;
            renderComposerImagesStrip();

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
                    imgItem.finalUrl = resJson.url || resJson.directUrl || resJson.viewUrl;
                } else if (resJson && resJson.status === 'success' && resJson.fileId) {
                    imgItem.finalUrl = "https://lh3.googleusercontent.com/d/" + resJson.fileId;
                }
            } catch (uploadErr) {
                console.warn("Google Drive upload error:", uploadErr);
            } finally {
                imgItem.uploading = false;
                renderComposerImagesStrip();
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
    
    // Detect target class automatically from active tab
    let targetClass = 'All';
    if (currentTimelineTab === 'class') {
        if (currentUser.type === 'staff') {
            const tabSelect = document.getElementById('tabClassSelect');
            targetClass = (tabSelect && tabSelect.value) ? tabSelect.value : (currentStaffSelectedClass || 'All');
        } else {
            targetClass = (currentUser.studentClass && currentUser.studentClass !== 'Unassigned') ? currentUser.studentClass : 'All';
        }
    } else {
        targetClass = 'All';
    }

    // Poll Validation
    let pollData = null;
    if (isPollComposerOpen) {
        const qInput = document.getElementById('pollQuestionInput');
        const pollQ = (qInput?.value.trim()) || message;
        const optInputs = Array.from(document.querySelectorAll('#pollOptionsList .poll-option-input'));
        const options = optInputs.map((inp, idx) => ({
            id: 'opt_' + idx,
            text: inp.value.trim(),
            voters: []
        })).filter(o => o.text.length > 0);

        if (options.length < 2) {
            alert("A poll must have at least 2 valid options.");
            return;
        }

        pollData = {
            question: pollQ || "Poll",
            options: options,
            createdAt: new Date().toISOString()
        };
    }

    if (!message && currentComposerImages.length === 0 && !pollData) {
        return alert("You must write a message, attach a photo, or create a poll.");
    }

    const isUploading = currentComposerImages.some(img => img.uploading);
    if (isUploading) {
        alert("Photos are still uploading to Google Drive. Please wait a moment.");
        return;
    }

    try {
        const photoUrl = getUserPhotoUrl(currentUser.code, currentUser.name, currentUser.photoUrl);
        const imageUrls = currentComposerImages.map(img => img.finalUrl).filter(Boolean);

        const postData = {
            authorCode: currentUser.code || '',
            authorName: currentUser.name || 'Student',
            authorPhotoUrl: photoUrl || '',
            isStaff: currentUser.type === 'staff',
            message: message,
            targetClass: targetClass,
            timestamp: new Date().toISOString(),
            likes: [],
            likeCount: 0
        };

        if (imageUrls.length > 0) {
            postData.imageUrls = imageUrls;
            postData.imageUrl = imageUrls[0]; // backward compatibility
        }

        if (pollData) {
            postData.poll = pollData;
        }

        const postRef = await addDoc(collection(db, "timeline_posts"), postData);
        
        const mentions = extractMentions(message);
        for (let m of mentions) {
            await sendNotification(m, `${currentUser.name} mentioned you in a new post.`, postRef.id);
        }

        postMsgEl.value = '';
        postMsgEl.style.height = '80px';
        clearTimelineComposerImages();
        if (isPollComposerOpen) {
            document.getElementById('btnDiscardPoll')?.click();
        }
    } catch (error) {
        alert("Failed to publish post: " + error.message);
    }
});

function renderPostPollHTML(postId, poll) {
    if (!poll || !Array.isArray(poll.options)) return '';
    const myId = currentUser ? (currentUser.code || currentUser.name) : '';
    const totalVotes = poll.options.reduce((sum, opt) => sum + (Array.isArray(opt.votes) ? opt.votes.length : 0), 0);
    let userVotedOptId = null;
    poll.options.forEach(opt => {
        if (Array.isArray(opt.votes) && myId && opt.votes.includes(myId)) {
            userVotedOptId = opt.id;
        }
    });
    const hasVoted = Boolean(userVotedOptId);

    const optionsHTML = poll.options.map(opt => {
        const optVotes = Array.isArray(opt.votes) ? opt.votes.length : 0;
        const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
        const isSelected = (opt.id === userVotedOptId);

        return `
            <button type="button" class="poll-option-button ${isSelected ? 'selected' : ''}" 
                onclick="window.voteOnPoll('${postId}', '${opt.id}')"
                ${!currentUser ? 'disabled title="Sign in to vote"' : `title="Vote for ${escapeHtml(opt.text)}"`}>
                ${hasVoted ? `<div class="poll-progress-fill" style="width: ${pct}%;"></div>` : ''}
                <div class="poll-option-content">
                    <span class="poll-option-text">
                        ${isSelected ? '<span class="poll-check-mark">✓ </span>' : ''}${escapeHtml(opt.text)}
                    </span>
                    ${hasVoted ? `<span class="poll-option-pct">${pct}% (${optVotes})</span>` : ''}
                </div>
            </button>
        `;
    }).join('');

    const statusNote = hasVoted ? 'You voted • Click another option to change' : 'Select an option to vote';

    return `
        <div class="timeline-poll-card" id="poll-${postId}">
            <div class="poll-question-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color, #2563eb)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
                <span>${escapeHtml(poll.question)}</span>
            </div>
            <div class="poll-options-list">
                ${optionsHTML}
            </div>
            <div class="poll-meta-footer">
                <span>${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}</span>
                <span>•</span>
                <span>${statusNote}</span>
            </div>
        </div>
    `;
}

window.voteOnPoll = async function(postId, optionId) {
    if (!currentUser) return alert("Please sign in to vote.");
    const myId = currentUser.code || currentUser.name;
    if (!myId) return alert("User identifier not found.");

    try {
        const postRef = doc(db, "timeline_posts", postId);
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) return;
        const postData = postSnap.data();
        if (!postData.poll || !Array.isArray(postData.poll.options)) return;

        const poll = { ...postData.poll };
        let changed = false;
        poll.options = poll.options.map(opt => {
            let votes = Array.isArray(opt.votes) ? [...opt.votes] : [];
            const hadVote = votes.includes(myId);
            if (opt.id === optionId) {
                if (!hadVote) {
                    votes.push(myId);
                    changed = true;
                }
            } else {
                if (hadVote) {
                    votes = votes.filter(v => v !== myId);
                    changed = true;
                }
            }
            return { ...opt, votes };
        });

        if (changed) {
            await updateDoc(postRef, { poll: poll });
        }
    } catch (err) {
        console.error("Error voting on poll:", err);
        alert("Failed to submit vote: " + err.message);
    }
};

window.toggleLikePost = async function(postId) {
    if (!currentUser) return alert("Please sign in to like posts.");
    const myId = currentUser.code || currentUser.name;
    if (!myId) return;

    try {
        const postRef = doc(db, "timeline_posts", postId);
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) return;
        const postData = postSnap.data();
        let likes = Array.isArray(postData.likes) ? [...postData.likes] : [];
        const index = likes.indexOf(myId);
        let notify = false;
        if (index >= 0) {
            likes.splice(index, 1);
        } else {
            likes.push(myId);
            notify = true;
        }
        await updateDoc(postRef, {
            likes: likes,
            likeCount: likes.length
        });

        if (notify && postData.authorName && postData.authorName !== currentUser.name) {
            await sendNotification(postData.authorName, `${currentUser.name} liked your post.`, postId);
        }
    } catch (err) {
        console.error("Error toggling like:", err);
    }
};

// --- TIMELINE FILTER TABS (CLASS vs ALL POSTS) & PAGINATION ---
const TIMELINE_PAGE_SIZE = 15;
let currentRenderedLimit = TIMELINE_PAGE_SIZE;
let isLoadingMoreTimelinePosts = false;
let currentTimelineTab = 'all'; // 'class' or 'all'
let currentStaffSelectedClass = '';
let allCachedPosts = [];
let allClassPosts = [];
let allPostsLoaded = false;
let currentFirestoreLimit = 60;
let hasMoreFirestorePosts = true;

async function renderTimelineTabs() {
    const tabsWrapper = document.getElementById('timelineTabsWrapper');
    if (!tabsWrapper || !currentUser) return;

    const isStaff = currentUser.type === 'staff';
    const studentClass = currentUser.studentClass || 'Unassigned';

    if (!isStaff) {
        if (!studentClass || studentClass === 'Unassigned') {
            currentTimelineTab = 'all';
        }
        // Student View: "My Class" and "All Posts"
        const classLabel = (studentClass && studentClass !== 'Unassigned') ? `My Class (${studentClass})` : 'My Class';
        tabsWrapper.innerHTML = `
            <div class="timeline-tabs-nav" role="tablist">
                <button type="button" class="timeline-tab-item ${currentTimelineTab === 'class' ? 'active' : ''}" id="tabBtnMyClass" data-tab="class">
                    <span>${escapeHtml(classLabel)}</span>
                </button>
                <button type="button" class="timeline-tab-item ${currentTimelineTab === 'all' ? 'active' : ''}" id="tabBtnAllPosts" data-tab="all">
                    <span>All Posts</span>
                </button>
            </div>
        `;

        document.getElementById('tabBtnMyClass')?.addEventListener('click', () => {
            currentTimelineTab = 'class';
            updateActiveTabUI();
            renderTimelineFeed(true);
        });

        document.getElementById('tabBtnAllPosts')?.addEventListener('click', () => {
            currentTimelineTab = 'all';
            updateActiveTabUI();
            renderTimelineFeed(true);
        });
    } else {
        // Teacher / Admin View: "Class: [Select Class ▾]" and "All Posts"
        tabsWrapper.innerHTML = `
            <div class="timeline-tabs-nav" role="tablist">
                <div class="timeline-tab-item tab-with-select ${currentTimelineTab === 'class' ? 'active' : ''}" id="tabBtnClassWrapper" data-tab="class">
                    <span>Class:</span>
                    <select id="tabClassSelect" class="timeline-tab-select" aria-label="Choose Class">
                        <!-- Populated by populateClassDropdown() -->
                    </select>
                </div>
                <button type="button" class="timeline-tab-item ${currentTimelineTab === 'all' ? 'active' : ''}" id="tabBtnAllPosts" data-tab="all">
                    <span>All Posts</span>
                </button>
            </div>
        `;

        const classWrapper = document.getElementById('tabBtnClassWrapper');
        const classSelect = document.getElementById('tabClassSelect');
        const allPostsBtn = document.getElementById('tabBtnAllPosts');

        classWrapper?.addEventListener('click', (e) => {
            if (e.target !== classSelect) {
                currentTimelineTab = 'class';
                updateActiveTabUI();
                renderTimelineFeed(true);
            }
        });

        classSelect?.addEventListener('change', (e) => {
            currentStaffSelectedClass = e.target.value;
            currentTimelineTab = 'class';
            updateActiveTabUI();
            renderTimelineFeed(true);
        });

        allPostsBtn?.addEventListener('click', () => {
            currentTimelineTab = 'all';
            updateActiveTabUI();
            renderTimelineFeed(true);
        });
    }
}

function updateActiveTabUI() {
    const classTab = document.getElementById('tabBtnMyClass') || document.getElementById('tabBtnClassWrapper');
    const allTab = document.getElementById('tabBtnAllPosts');

    if (currentTimelineTab === 'class') {
        classTab?.classList.add('active');
        allTab?.classList.remove('active');
    } else {
        allTab?.classList.add('active');
        classTab?.classList.remove('active');
    }
}

function loadPosts(requestedLimit = currentFirestoreLimit) {
    if (!currentUser) return; 
    if (unsubscribePosts) unsubscribePosts();

    currentFirestoreLimit = requestedLimit;
    const postsQuery = query(collection(db, "timeline_posts"), orderBy("timestamp", "desc"), limit(currentFirestoreLimit));

    unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
        allCachedPosts = [];
        snapshot.forEach((docSnap) => {
            allCachedPosts.push({ id: docSnap.id, ...docSnap.data() });
        });
        hasMoreFirestorePosts = snapshot.docs.length >= currentFirestoreLimit;
        if (currentTimelineTab === 'class') renderTimelineFeed(false);
    }, (err) => {
        console.error("Error loading timeline posts:", err);
    });

    if (!unsubscribeAllPosts) {
        const allPostsQuery = query(collection(db, "timeline_posts"), where("targetClass", "==", "All"));
        unsubscribeAllPosts = onSnapshot(allPostsQuery, (snapshot) => {
            allClassPosts = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            allClassPosts.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
            allPostsLoaded = true;
            if (currentTimelineTab === 'all') renderTimelineFeed(false);
        }, (err) => {
            allPostsLoaded = true;
            console.error("Error loading all-class timeline posts:", err);
            if (currentTimelineTab === 'all') renderTimelineFeed(false);
        });
    }
}

function getFilteredTimelinePosts() {
    if (currentTimelineTab === 'all') return allClassPosts;
    const isStaff = currentUser?.type === 'staff';
    const studentClass = (currentUser?.studentClass || '').trim();

    return allCachedPosts.filter(post => {
        const postTarget = (post.targetClass || 'All').trim();
        const isAll = postTarget === 'All' || postTarget.toLowerCase() === 'all classes';

        // Class posts stay within their specific class tab.
        const norm = s => (s || '').toLowerCase().replace(/^(grade|class)\s*/i, '').trim();
        if (!isStaff) {
            if (!studentClass || studentClass === 'Unassigned') return false;
            return !isAll && (postTarget.toLowerCase() === studentClass.toLowerCase() || norm(postTarget) === norm(studentClass));
        } else {
            if (!currentStaffSelectedClass) return false;
            return !isAll && (postTarget.toLowerCase() === currentStaffSelectedClass.toLowerCase() || norm(postTarget) === norm(currentStaffSelectedClass));
        }
    });
}

function renderTimelineFeed(resetPagination = true) {
    const feed = document.getElementById('timelineFeed');
    if (!feed) return;

    if (resetPagination) {
        currentRenderedLimit = TIMELINE_PAGE_SIZE;
    }

    feed.innerHTML = '';

    const isStaff = currentUser?.type === 'staff';
    const studentClass = (currentUser?.studentClass || '').trim();
    const filtered = getFilteredTimelinePosts();

    if (currentTimelineTab === 'all' && !allPostsLoaded) {
        feed.innerHTML = '<div class="timeline-feed-loading">Loading posts...</div>';
        return;
    }

    if (filtered.length === 0) {
        const tabTitle = currentTimelineTab === 'all' 
            ? 'All Posts' 
            : (isStaff ? (currentStaffSelectedClass || 'this class') : (studentClass || 'My Class'));
        feed.innerHTML = `
            <div style="padding: 48px 20px; text-align: center; color: var(--text-muted, #94a3b8);">
                <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
                <div style="font-weight: 700; font-size: 15px; color: var(--text-main, #0f172a);">No posts in ${escapeHtml(tabTitle)} yet</div>
                <div style="font-size: 13px; margin-top: 4px;">Be the first to share something above!</div>
            </div>
        `;
        return;
    }

    const postsToRender = filtered.slice(0, currentRenderedLimit);
    postsToRender.forEach(post => {
        renderSinglePostElement(post, feed);
    });

    renderTimelineLoadMoreControl(feed, filtered);
}

function renderTimelineLoadMoreControl(feed, filtered) {
    const existingContainer = document.getElementById('timelineLoadMoreContainer');
    if (existingContainer) existingContainer.remove();

    const existingEndMsg = document.getElementById('timelineEndMessage');
    if (existingEndMsg) existingEndMsg.remove();

    const hasMoreLocalPosts = filtered.length > currentRenderedLimit;
    const canFetchMoreFromDb = currentTimelineTab === 'class' && hasMoreFirestorePosts;

    if (hasMoreLocalPosts || canFetchMoreFromDb) {
        const container = document.createElement('div');
        container.id = 'timelineLoadMoreContainer';
        container.className = 'timeline-load-more-container';

        container.innerHTML = `
            <button type="button" id="btnTimelineLoadMore" class="btn-timeline-load-more" onclick="window.loadMoreTimelinePosts()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span>Load More Posts</span>
            </button>
        `;
        feed.appendChild(container);
    } else if (filtered.length > 0) {
        const endMsg = document.createElement('div');
        endMsg.id = 'timelineEndMessage';
        endMsg.className = 'timeline-end-message';
        endMsg.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
            <span>You've reached the end of the posts</span>
        `;
        feed.appendChild(endMsg);
    }
}

window.loadMoreTimelinePosts = async function () {
    if (isLoadingMoreTimelinePosts) return;
    isLoadingMoreTimelinePosts = true;

    const btn = document.getElementById('btnTimelineLoadMore');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#1e5eff"></path>
            </svg>
            <span>Loading...</span>
        `;
    }

    const filtered = getFilteredTimelinePosts();

    // If we don't have enough posts in memory for the next batch and DB may have more, expand Firestore query
    if (currentTimelineTab === 'class' && filtered.length <= currentRenderedLimit && hasMoreFirestorePosts) {
        const nextLimit = currentFirestoreLimit + 30;
        await new Promise((resolve) => {
            currentFirestoreLimit = nextLimit;
            if (unsubscribePosts) unsubscribePosts();

            const postsQuery = query(collection(db, "timeline_posts"), orderBy("timestamp", "desc"), limit(currentFirestoreLimit));

            let resolved = false;
            unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
                allCachedPosts = [];
                snapshot.forEach((docSnap) => {
                    allCachedPosts.push({ id: docSnap.id, ...docSnap.data() });
                });
                hasMoreFirestorePosts = snapshot.docs.length >= currentFirestoreLimit;
                if (!resolved) {
                    resolved = true;
                    resolve();
                } else {
                    renderTimelineFeed(false);
                }
            }, (err) => {
                console.error("Error expanding timeline query:", err);
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            });
        });
    }

    currentRenderedLimit += TIMELINE_PAGE_SIZE;
    renderTimelineFeed(false);

    isLoadingMoreTimelinePosts = false;
};

function renderSinglePostElement(post, feed, insertBeforeElement = null) {
    const postId = post.id;
    const postTarget = post.targetClass || 'All';
    const dateStr = formatTimeAgo(post.timestamp);
    const badgeHTML = post.isStaff ? `<img src="https://lh3.googleusercontent.com/d/1F9iWlab0M6Hlc1L5NR_HP4vsQDJJpd3d" alt="Verified" class="staff-badge-img">` : '';
    const safeClass = escapeHtml(postTarget);
    const classBadgeHTML = `<span class="target-class-badge">${safeClass}</span>`;
    const fullAuthorName = post.authorName || 'Student';
    const nickname = formatNickname(fullAuthorName);
    const safeAuthor = escapeHtml(nickname);
    const safeFullName = escapeHtml(fullAuthorName);
    const authorAvatarHTML = renderAvatarHTML(nickname, post.authorCode, post.authorPhotoUrl, post.isStaff);

    const canDeletePost = (currentUser.type === 'staff') || 
        (currentUser.code && post.authorCode && post.authorCode === currentUser.code) ||
        (currentUser.name && post.authorName && post.authorName === currentUser.name);

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

    // Multi-photo layout (max 5 photos)
    const allImages = Array.isArray(post.imageUrls) && post.imageUrls.length > 0 
        ? post.imageUrls 
        : (post.imageUrl ? [post.imageUrl] : []);

    let imageHTML = '';
    if (allImages.length > 0) {
        const gridClass = `grid-${Math.min(allImages.length, 5)}`;
        const itemsHtml = allImages.map((u, i) => `
            <div class="photo-item" onclick="window.open('${escapeHtml(u)}', '_blank')" title="Click to view full photo">
                <img src="${escapeHtml(u)}" alt="Photo ${i + 1}" loading="lazy">
            </div>
        `).join('');
        imageHTML = `<div class="timeline-photo-grid ${gridClass}">${itemsHtml}</div>`;
    }

    // Poll / Voting layout
    let pollHTML = '';
    if (post.poll && Array.isArray(post.poll.options) && post.poll.options.length >= 2) {
        pollHTML = renderPostPollHTML(postId, post.poll);
    }

    // Like / Heart status
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const myIdentifier = currentUser ? (currentUser.code || currentUser.name) : '';
    const isLiked = Boolean(myIdentifier && likes.includes(myIdentifier));
    const likeCount = likes.length;

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
        ${pollHTML}
        
        <div class="post-actions-bar">
            <button type="button" class="action-btn like-btn ${isLiked ? 'liked' : ''}" onclick="window.toggleLikePost('${postId}')" title="${isLiked ? 'Unlike' : 'Like'}">
                <svg class="action-icon heart-icon" width="15" height="15" viewBox="0 0 24 24" fill="${isLiked ? '#ef4444' : 'none'}" stroke="${isLiked ? '#ef4444' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                <span id="like-count-${postId}">${likeCount > 0 ? likeCount : '0'}</span>
            </button>
            <button type="button" class="action-btn comment-btn" onclick="toggleComments('${postId}')" title="Comments">
                <svg class="action-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span id="comment-count-${postId}">0</span>
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
    
    if (insertBeforeElement && insertBeforeElement.parentNode === feed) {
        feed.insertBefore(postElement, insertBeforeElement);
    } else {
        feed.appendChild(postElement);
    }
    loadCommentsForPost(postId);
}

function loadCommentsForPost(postId) {
    if (activeCommentUnsubs.has(postId)) {
        try { activeCommentUnsubs.get(postId)(); } catch (e) {}
        activeCommentUnsubs.delete(postId);
    }

    const commentsRef = collection(db, "timeline_comments");
    const q = query(commentsRef, where("postId", "==", postId));

    const unsub = onSnapshot(q, (snapshot) => {
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
            
            const canDeleteComment = (currentUser.type === 'staff') || 
                (currentUser.code && comment.authorCode && comment.authorCode === currentUser.code) ||
                (currentUser.name && comment.authorName && comment.authorName === currentUser.name);

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
    activeCommentUnsubs.set(postId, unsub);
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
    if (!currentUser) return;

    if (classSelect) {
        classSelect.innerHTML = '<option value="All">All Classes</option>';
    }

    if (currentUser.type === 'student') {
        const userClass = currentUser.studentClass || 'Unassigned';
        if (userClass !== 'Unassigned' && classSelect) {
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

            const sortedClasses = Array.from(uniqueClasses).sort();
            if (sortedClasses.length > 0 && !currentStaffSelectedClass) {
                currentStaffSelectedClass = sortedClasses[0];
            }

            sortedClasses.forEach(className => {
                if (classSelect) {
                    classSelect.innerHTML += `<option value="${className}">${className}</option>`;
                }
            });

            const tabSelect = document.getElementById('tabClassSelect');
            if (tabSelect) {
                tabSelect.innerHTML = sortedClasses.map(c => `<option value="${c}" ${c === currentStaffSelectedClass ? 'selected' : ''}>${c}</option>`).join('');
                if (currentStaffSelectedClass) {
                    tabSelect.value = currentStaffSelectedClass;
                }
            }
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

let pendingDMAttachment = null;

function clearDMAttachmentPreview() {
    pendingDMAttachment = null;
    const previewBar = document.getElementById('dmAttachmentPreviewBar');
    const attachmentInput = document.getElementById('dmAttachmentInput');
    const thumbWrap = document.getElementById('dmAttachmentThumbWrap');
    const nameEl = document.getElementById('dmAttachmentPreviewName');
    const statusEl = document.getElementById('dmAttachmentPreviewStatus');
    const btn = document.getElementById('dmAttachmentBtn');
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
        btn.title = 'Attach a file';
    }
}

async function uploadDMAttachment(file) {
    if (!file || !currentUser) return;
    if (file.size > 25 * 1024 * 1024) return alert('Files must be 25MB or smaller.');

    const previewBar = document.getElementById('dmAttachmentPreviewBar');
    const thumbWrap = document.getElementById('dmAttachmentThumbWrap');
    const nameEl = document.getElementById('dmAttachmentPreviewName');
    const statusEl = document.getElementById('dmAttachmentPreviewStatus');
    const btn = document.getElementById('dmAttachmentBtn');

    if (previewBar && thumbWrap && nameEl && statusEl) {
        nameEl.innerText = file.name;
        statusEl.innerHTML = `<span class="dm-uploading-spinner"></span> Attaching...`;
        if (file.type && file.type.startsWith('image/')) {
            const tempUrl = URL.createObjectURL(file);
            thumbWrap.innerHTML = `<img src="${tempUrl}" class="dm-attached-thumb-img" alt="preview">`;
        } else {
            thumbWrap.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }
        previewBar.style.display = 'flex';
        previewBar.classList.remove('hidden');
    }

    const scriptUrl = timelineDriveConfig.scriptUrl || localStorage.getItem('timelineDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
    if (btn) btn.disabled = true;

    const reader = new FileReader();
    reader.onload = async event => {
        const base64Data = String(event.target.result).split(',')[1];
        const dataUrl = event.target.result;
        let finalUrl = '';

        if (scriptUrl) {
            try {
                const folderId = timelineDriveConfig.folderId || localStorage.getItem('timelineDriveFolderId') || '';
                const response = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', base64Data, folderName: 'TimelineDB', folderId, type: 'direct_message' }) });
                const body = await response.text();
                let result = {};
                try { result = JSON.parse(body); } catch (_) {}
                finalUrl = result.url || result.directUrl || result.viewUrl || (result.fileId ? `https://drive.google.com/uc?export=download&id=${result.fileId}` : '');
            } catch (err) {
                console.warn("Drive upload failed, using data URL fallback for preview:", err);
            }
        }

        if (!finalUrl && file.size <= 2 * 1024 * 1024) {
            finalUrl = dataUrl;
        }

        if (finalUrl) {
            pendingDMAttachment = { url: finalUrl, fileName: file.name, mimeType: file.type || 'application/octet-stream' };
            if (btn) btn.title = `Attached: ${file.name}`;
            btn?.classList.add('has-attachment');
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #10b981; font-weight: 700;">✓ Ready to send</span>`;
            }
        } else {
            alert('Could not attach this file. Please ensure the file is under 2MB or cloud upload is configured.');
            clearDMAttachmentPreview();
        }
        if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(file);
}

function renderDMAttachment(attachment) {
    if (!attachment?.url) return '';
    const url = escapeHtml(attachment.url);
    const name = escapeHtml(attachment.fileName || 'Attachment');
    const type = String(attachment.mimeType || '');
    if (type.startsWith('image/')) {
        return `
            <div class="dm-attachment-image-container" onclick="window.openChatImagePreview('${url}', '${name}')">
                <img class="dm-attachment-preview dm-clickable-img" src="${url}" alt="${name}" loading="lazy">
            </div>
        `;
    }
    let preview = '';
    if (type.startsWith('audio/')) preview = `<audio class="dm-attachment-media" controls src="${url}"></audio>`;
    else if (type.startsWith('video/')) preview = `<video class="dm-attachment-media" controls src="${url}"></video>`;
    return `<div class="dm-attachment">${preview}<a href="${url}" target="_blank" rel="noopener" download="${name}">📎 ${name}</a><button type="button" class="dm-download-btn" data-download-url="${url}" data-download-name="${name}" title="Download">⇩</button></div>`;
}

window.openChatImagePreview = function(url, alt) {
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

window.closeChatImagePreview = function() {
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

document.addEventListener('click', event => {
    const button = event.target.closest('.dm-download-btn');
    if (!button) return;
    const link = document.createElement('a');
    link.href = button.dataset.downloadUrl;
    link.download = button.dataset.downloadName || 'attachment';
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
});

function initDMSystem() {
    if (!currentUser) return;

    const nameEl = document.getElementById('dmHeaderUserName');
    if (nameEl) nameEl.innerText = currentUser.name;
    clearDMAttachmentPreview();

    const floatBtn = document.getElementById('dmFloatingBtn');
    const widget = document.getElementById('dmPopupWidget');
    const closeBtn = document.getElementById('dmCloseWidgetBtn');
    const newChatBtn = document.getElementById('dmNewChatBtn');
    const backBtn = document.getElementById('dmBackToThreadsBtn');
    const leaveBtn = document.getElementById('dmLeaveChatroomBtn');
    const searchInput = document.getElementById('dmContactSearchInput');
    const msgForm = document.getElementById('dmMessageForm');
    const attachmentBtn = document.getElementById('dmAttachmentBtn');
    const attachmentInput = document.getElementById('dmAttachmentInput');
    const emojiBtn = document.getElementById('dmEmojiBtn');
    const emojiPicker = document.getElementById('dmEmojiPicker');

    attachmentBtn?.addEventListener('click', () => attachmentInput?.click());
    attachmentInput?.addEventListener('change', event => { uploadDMAttachment(event.target.files?.[0]); event.target.value = ''; });
    document.getElementById('dmCancelAttachmentBtn')?.addEventListener('click', () => {
        clearDMAttachmentPreview();
    });

    emojiBtn?.addEventListener('click', event => { event.stopPropagation(); emojiPicker?.classList.toggle('hidden'); });
    emojiPicker?.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { const input = document.getElementById('dmMessageInput'); if (input) { input.value += button.textContent; input.focus(); } emojiPicker.classList.add('hidden'); }));

    floatBtn?.addEventListener('click', () => {
        widget?.classList.toggle('hidden');
        if (!widget?.classList.contains('hidden')) {
            showDMView('threads');
        }
    });

    closeBtn?.addEventListener('click', () => {
        widget?.classList.add('hidden');
        if (embeddedPanel) window.parent.postMessage({ type: 'portal-comms-close' }, window.location.origin);
    });

    newChatBtn?.addEventListener('click', async () => {
        showDMView('contacts');
        if (!allUserDirectory.length) {
            const list = document.getElementById('dmContactsList');
            if (list) list.innerHTML = '<div class="dm-empty-state">Loading contacts...</div>';
            await fetchAllNames();
        }
        renderDMContactsList('');
    });

    backBtn?.addEventListener('click', () => {
        showDMView('threads');
    });

    leaveBtn?.addEventListener('click', () => {
        if (unsubscribeDMMessages) unsubscribeDMMessages();
        currentChatPartner = null;
        clearDMAttachmentPreview();
        showDMView('threads');
    });

    searchInput?.addEventListener('input', (e) => {
        renderDMContactsList(e.target.value.trim().toLowerCase());
    });

    msgForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('dmMessageInput');
        const text = input ? input.value.trim() : '';
        const attachment = pendingDMAttachment;
        if ((!text && !attachment) || !currentChatPartner || !currentUser) return;

        // Immediately clear input and attachment preview so it never stays or hangs!
        if (input) {
            input.value = '';
            input.focus();
        }
        clearDMAttachmentPreview();

        const newMsgDoc = {
            participants: [currentUser.code, currentChatPartner.code].sort(),
            senderCode: currentUser.code,
            senderName: currentUser.name,
            receiverCode: currentChatPartner.code,
            receiverName: currentChatPartner.name,
            message: text,
            attachment: attachment || null,
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

function deleteLocalDMMessage(id) {
    if (!id) return;
    const list = getLocalDMMessages().filter(m => m.docId !== id && m.timestamp !== id);
    try {
        sessionStorage.setItem('local_direct_messages', JSON.stringify(list));
    } catch(e) {}
}

window.deleteSingleDMMessage = async function(docId) {
    if (!docId) return;
    const ok = confirm("Delete this message?");
    if (!ok) return;

    try {
        await deleteDoc(doc(db, "direct_messages", docId));
    } catch (err) {
        console.warn("Could not delete message from Firestore, trying local storage:", err);
    }
    deleteLocalDMMessage(docId);

    const el = document.querySelector(`.dm-message-row[data-msg-id="${docId}"]`);
    if (el) {
        el.style.transition = 'all 0.22s ease';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.85)';
        setTimeout(() => el.remove(), 220);
    }
};

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
                threadsListEl.innerHTML = `<div class="dm-empty-state">No chats yet. Click "+ Add Chat" to start a chat room!</div>`;
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
        threadsListEl.innerHTML = `<div class="dm-empty-state">No chats yet. Click "+ Add Chat" to start a chat room!</div>`;
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

function renderDMContactsList(filterStr) {
    const listEl = document.getElementById('dmContactsList');
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
        listEl.innerHTML = `<div class="dm-empty-state">No contacts found matching "${escapeHtml(filterStr)}".</div>`;
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
        groupWrapper.className = `dm-class-group ${isSearching ? 'is-expanded' : ''}`;
        groupWrapper.setAttribute('data-group-name', groupName);

        const isStaffGroup = groupName === 'Teachers & Staff';
        const groupIconSvg = isStaffGroup 
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;

        const headerBtn = document.createElement('button');
        headerBtn.type = 'button';
        headerBtn.className = 'dm-class-group-header';
        headerBtn.setAttribute('aria-expanded', isSearching ? 'true' : 'false');
        headerBtn.innerHTML = `
            <div class="dm-class-group-title-wrap">
                <span class="dm-class-group-icon ${isStaffGroup ? 'staff-icon' : ''}">${groupIconSvg}</span>
                <span class="dm-class-group-name">${escapeHtml(groupName)}</span>
                <span class="dm-class-group-badge">${members.length}</span>
            </div>
            <span class="dm-class-group-arrow-wrap">
                <svg class="dm-group-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 18 6-6-6-6"/>
                </svg>
            </span>
        `;

        const contentEl = document.createElement('div');
        contentEl.className = `dm-class-group-content ${isSearching ? '' : 'hidden'}`;

        members.forEach(contact => {
            const fullContactName = contact.name || 'User';
            const nickName = formatNickname(fullContactName);
            const initial = escapeHtml(nickName ? nickName.charAt(0).toUpperCase() : '?');
            const safeContactName = escapeHtml(nickName);
            const safeFullName = escapeHtml(fullContactName);
            const safeRole = escapeHtml(contact.role || 'User');
            const safeClass = contact.studentClass && contact.studentClass !== 'Staff' && contact.studentClass !== 'Teachers & Staff' 
                ? ' • ' + escapeHtml(contact.studentClass) 
                : '';
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
                <button type="button" class="dm-new-chat-btn">Chat</button>
            `;

            item.onclick = (e) => {
                e.stopPropagation();
                openDMChatroom(contact);
            };
            contentEl.appendChild(item);
        });

        // Click to toggle accordion (minimize or expand)
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

function openDMChatroom(partner) {
    if (!partner || !currentUser) return;
    currentChatPartner = partner;
    clearDMAttachmentPreview();

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

function isEmojiOnly(str) {
    if (!str) return false;
    const trimmed = str.trim();
    if (!trimmed) return false;
    try {
        const clean = trimmed.replace(/[\s\uFE0F\u200D]/g, '');
        if (!clean) return false;
        const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier})+$/u;
        return emojiRegex.test(clean) && Array.from(clean).length <= 6;
    } catch (e) {
        return /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\s]+$/u.test(trimmed);
    }
}

function renderSingleDMMessageHTML(data) {
    const isSent = data.senderCode === currentUser.code;
    const msgClass = isSent ? 'sent' : 'received';
    const timeStr = formatTimeAgo(data.timestamp);
    const rawMsg = data.message || '';
    const safeMessage = escapeHtml(rawMsg);
    const isEmoji = isEmojiOnly(rawMsg);
    const isImageOnly = data.attachment?.url && String(data.attachment?.mimeType || '').startsWith('image/') && !safeMessage;

    // Sender Name: if sent by me, write "Me", else senderName
    const senderName = isSent ? 'Me' : escapeHtml(data.senderName || currentChatPartner.name);

    // Profile photo & initials avatar
    const senderCode = isSent ? currentUser.code : (data.senderCode || currentChatPartner.code);
    const senderExplicitName = isSent ? currentUser.name : (data.senderName || currentChatPartner.name);
    const avatarHtml = renderAvatarHTML(senderExplicitName, senderCode, null, false, 'dm-chat-avatar');

    // Read status for outgoing messages: two blue checkmarks if read, two grey checkmarks if sent
    const isRead = !!data.read;
    const checkmarkColor = isRead ? '#38bdf8' : '#94a3b8';
    const checkmarkTitle = isRead ? 'Read' : 'Sent';
    const readStatusHtml = isSent ? `
        <span class="dm-read-status" title="${checkmarkTitle}" aria-label="${checkmarkTitle}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${checkmarkColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L7 17l-5-5"/>
                <path d="M22 10l-7.5 7.5-1.5-1.5"/>
            </svg>
        </span>
    ` : '';

    // Delete message button (only for messages sent by me)
    const deleteBtnHtml = (isSent && data.docId) ? `
        <button type="button" class="dm-msg-delete-btn" title="Delete message" aria-label="Delete message" onclick="window.deleteSingleDMMessage('${escapeHtml(data.docId)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
        </button>
    ` : '';

    return `
        <div class="dm-message-row ${msgClass}" data-msg-id="${escapeHtml(data.docId || '')}">
            ${!isSent ? `<div class="dm-msg-avatar-col">${avatarHtml}</div>` : ''}

            <div class="dm-msg-content-col">
                <div class="dm-msg-sender-name ${isSent ? 'me' : ''}">
                    ${senderName}
                </div>

                <div class="dm-msg-bubble-wrap">
                    ${isSent ? deleteBtnHtml : ''}
                    <div class="dm-message-bubble ${isSent ? 'dm-msg-sent' : 'dm-msg-received'} ${isEmoji ? 'dm-msg-emoji-only' : ''} ${isImageOnly ? 'dm-msg-bubble-image-only' : ''}">
                        ${safeMessage ? `<div>${safeMessage}</div>` : ''}
                        ${renderDMAttachment(data.attachment)}
                    </div>
                </div>

                <div class="dm-msg-meta">
                    <span class="dm-msg-time">${timeStr}</span>
                    ${readStatusHtml}
                </div>
            </div>

            ${isSent ? `<div class="dm-msg-avatar-col">${avatarHtml}</div>` : ''}
        </div>
    `;
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

            let html = '';
            messages.forEach(data => {
                if (data.docId && !data.read && data.receiverCode === currentUser.code) {
                    updateDoc(doc(db, "direct_messages", data.docId), { read: true }).catch(() => {});
                }
                html += renderSingleDMMessageHTML(data);
            });
            streamEl.innerHTML = html;
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

    let html = '';
    localMsgs.forEach(data => {
        html += renderSingleDMMessageHTML(data);
    });
    streamEl.innerHTML = html;
    streamEl.scrollTop = streamEl.scrollHeight;
}
