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
let allUserNames = []; // Stores everyone's names for the @ mentions

// --- 1. AUTHENTICATION LOGIC ---

onAuthStateChanged(auth, async (user) => {
    if (user && !currentUser) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            const email = data.email || user.email;
            
            const rawName = email.split('@')[0];
            const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const displayName = data.role === 'admin' ? 'Administrator' : `${teacherName} (${data.subject || 'Staff'})`;
            
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
    
    const badgeHTML = currentUser.type === 'staff' ? ` <span class="staff-badge">✓ Staff</span>` : '';
    document.getElementById('currentUserDisplay').innerHTML = currentUser.name + badgeHTML;
    
    fetchAllNames(); // Download names for mentions
    loadPosts();
    loadNotifications();
}

// --- 2. @MENTION AUTOCOMPLETE SYSTEM ---

async function fetchAllNames() {
    try {
        let names = [];
        
        // 1. Fetch Teachers
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.email) {
                const rawName = data.email.split('@')[0];
                const teacherName = rawName.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                names.push(data.role === 'admin' ? 'Administrator' : `${teacherName} (${data.subject || 'Staff'})`);
            }
        });
        
        // 2. Fetch Students
        const studentsSnap = await getDocs(collection(db, "students"));
        studentsSnap.forEach(doc => {
            if (doc.data().studentName) names.push(doc.data().studentName);
        });
        
        allUserNames = [...new Set(names)]; // Remove duplicates
    } catch (e) {
        console.warn("Could not load user directory for mentions. Ensure Firestore rules allow read access.", e);
    }
}

const mentionPopup = document.getElementById('mentionPopup');
let activeMentionTarget = null;

// Listen to all typing in TextAreas and Inputs for the "@" symbol
document.addEventListener('input', (e) => {
    if (e.target.id === 'loginUsername' || e.target.id === 'loginPassword') {
        return; 
    }
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastAtSign = textBeforeCursor.lastIndexOf('@');

        // If we found an @ and there are no spaces after it yet
        if (lastAtSign !== -1) {
            const textAfterAt = textBeforeCursor.substring(lastAtSign + 1);
            if (!textAfterAt.includes(' ')) {
                activeMentionTarget = e.target;
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
            
            // Replace the partial name with the full clicked name
            const newText = val.substring(0, lastAtSign) + '@' + match + ' ' + val.substring(cursorPos);
            targetEl.value = newText;
            hideMentionPopup();
            targetEl.focus(); // Return cursor to typing area
        };
        mentionPopup.appendChild(div);
    });
    
    // Position the popup exactly under the input box
    const rect = targetEl.getBoundingClientRect();
    mentionPopup.style.top = (rect.bottom + window.scrollY) + 'px';
    mentionPopup.style.left = (rect.left + window.scrollX) + 'px';
    mentionPopup.style.width = rect.width + 'px';
    mentionPopup.classList.remove('hidden');
}

function hideMentionPopup() {
    mentionPopup.classList.add('hidden');
    activeMentionTarget = null;
}

document.addEventListener('click', (e) => { if (!mentionPopup.contains(e.target)) hideMentionPopup(); });

// Search the final message to see if anyone's exact name was mentioned
function extractMentions(text) {
    let foundMentions = [];
    allUserNames.forEach(name => {
        if (text.includes('@' + name)) {
            foundMentions.push(name);
        }
    });
    return foundMentions;
}

// --- 3. NOTIFICATIONS LOGIC ---

async function sendNotification(recipientName, messageText, targetPostId) {
    if (!recipientName || recipientName === currentUser.name) return; // Don't notify self
    
    try {
        await addDoc(collection(db, "timeline_notifications"), {
            recipientName: recipientName, // Routes using the user's name, not their secret code!
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

    // Now queries based on the person's name
    const notifQuery = query(collection(db, "timeline_notifications"), where("recipientName", "==", currentUser.name), orderBy("timestamp", "desc"));

    unsubscribeNotifs = onSnapshot(notifQuery, (snapshot) => {
        const dropdown = document.getElementById('notifDropdown');
        const badge = document.getElementById('notifBadge');
        let unreadCount = 0;
        dropdown.innerHTML = '';

        if (snapshot.empty) {
            dropdown.innerHTML = `<div style="padding: 10px; text-align: center; font-size: 12px; color: #666;">You have no notifications.</div>`;
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
                    <div style="font-size: 10px; color: #888; margin-top: 4px;">${new Date(notif.timestamp).toLocaleString()}</div>
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
        postEl.style.border = '2px solid #007bff';
        setTimeout(() => postEl.style.border = '1px solid #eee', 2500); 
    } else {
        alert("This post may have been deleted.");
    }
};

// --- 4. POSTING & RENDERING LOGIC ---

document.getElementById('refreshBtn').addEventListener('click', () => { loadPosts(); });

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
        
        // Scan for mentions and send notifications by Name
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
            const dateStr = new Date(post.timestamp).toLocaleString();
            const badgeHTML = post.isStaff ? `<span class="staff-badge">✓ Staff</span>` : '';

            let deleteButtonHTML = '';
            if (currentUser.type === 'staff') {
                deleteButtonHTML = `<button class="delete-btn" onclick="deletePost('${postId}')">🗑️ Delete</button>`;
            }

            const postElement = document.createElement('div');
            postElement.className = 'timeline-post';
            postElement.id = 'post-' + postId; 
            
            postElement.innerHTML = `
                <div class="post-header">
                    <div>
                        <strong>${post.authorName} ${badgeHTML}</strong>
                        <span class="time" style="margin-left: 10px;">${dateStr}</span>
                    </div>
                    ${deleteButtonHTML}
                </div>
                <div class="post-body">${formatMessageMentions(post.message)}</div>
                
                <div class="comments-section" id="comments-${postId}">
                    <!-- Comments injected here -->
                </div>
                
                <div class="reply-box">
                    <input type="text" id="reply-msg-${postId}" placeholder="Write a reply...">
                    <button onclick="submitReply('${postId}', '${post.authorName}')">Reply</button>
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
        const commentContainer = document.getElementById(`comments-${postId}`);
        if (!commentContainer) return;
        
        let commentsList = [];
        snapshot.forEach(doc => commentsList.push({ id: doc.id, ...doc.data() }));
        commentsList.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        commentContainer.innerHTML = '';
        commentsList.forEach(comment => {
            const badgeHTML = comment.isStaff ? `<span class="staff-badge">✓</span>` : '';
            
            let deleteCommentHTML = '';
            if (currentUser.type === 'staff') {
                deleteCommentHTML = `<button class="delete-comment-btn" onclick="deleteComment('${comment.id}')">X</button>`;
            }

            commentContainer.innerHTML += `
                <div class="comment">
                    <div><strong>${comment.authorName} ${badgeHTML}:</strong> ${formatMessageMentions(comment.message)}</div>
                    ${deleteCommentHTML}
                </div>
            `;
        });
    });
}

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
        
        // Notify original poster by their Name
        await sendNotification(postAuthorName, `${currentUser.name} replied to your post.`, postId);
        
        // Notify anyone explicitly mentioned in the comment by their Name
        const mentions = extractMentions(message);
        for (let m of mentions) {
            await sendNotification(m, `${currentUser.name} mentioned you in a comment.`, postId);
        }

        msgInput.value = '';
    } catch (error) {
        alert("Failed to post comment: " + error.message);
    }
};

// --- 5. SECURE DELETE FUNCTIONS ---

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
    // allUserNames is already populated by your fetchAllNames() function
    allUserNames.forEach(name => {
        const mention = '@' + name;
        if (formattedText.includes(mention)) {
            // Replace the plain text mention with a styled span
            // We use split/join to replace all instances without needing complex regex escaping
            formattedText = formattedText.split(mention).join(`<span style="color: #007bff; font-weight: bold;">${mention}</span>`);
        }
    });
    return formattedText;
}