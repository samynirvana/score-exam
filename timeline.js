import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, getDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// Keep track of the currently logged-in user for this session
let currentUser = null; 
let unsubscribePosts = null; // Used to manage the real-time listener

// --- 1. AUTHENTICATION LOGIC ---

onAuthStateChanged(auth, async (user) => {
    if (user && !currentUser) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            const displayName = data.role === 'admin' ? 'Administrator' : `Teacher (${data.subject || 'Staff'})`;
            
            currentUser = { type: 'staff', name: displayName, code: 'STAFF' };
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

    if (!usernameInput || !passwordInput) {
        return alert("Please enter both fields.");
    }

    if (usernameInput.includes('@')) {
        try {
            await signInWithEmailAndPassword(auth, usernameInput, passwordInput);
        } catch (error) {
            alert("Staff Login Failed: " + error.message);
        }
    } 
    else {
        if (usernameInput.toUpperCase() !== passwordInput.toUpperCase()) {
            return alert("For students, your Username and Password must be your exact 5-character code.");
        }

        const code = usernameInput.toUpperCase();
        try {
            const studentRef = doc(db, "students", code);
            const studentSnap = await getDoc(studentRef);

            if (studentSnap.exists()) {
                currentUser = { 
                    type: 'student', 
                    name: studentSnap.data().studentName, 
                    code: code 
                };
                sessionStorage.setItem('studentTimelineSession', JSON.stringify(currentUser));
                showTimelineApp();
            } else {
                alert("Student code not found in the directory. Please check your spelling.");
            }
        } catch (error) {
            alert("Login Error: " + error.message);
        }
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    sessionStorage.removeItem('studentTimelineSession');
    currentUser = null;
    
    if (unsubscribePosts) {
        unsubscribePosts(); // Stop listening to the database when logged out
    }
    
    if (auth.currentUser) {
        await signOut(auth);
    }
    
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
    
    // Fetch and display posts immediately upon successful login
    loadPosts();
}


// --- 2. POSTING & RENDERING LOGIC ---

// Refresh Button Event
document.getElementById('refreshBtn').addEventListener('click', () => {
    loadPosts();
});

document.getElementById('submitPostBtn').addEventListener('click', async () => {
    if (!currentUser) return; 
    
    const message = document.getElementById('postMessage').value.trim();
    if (!message) return alert("You must write a message first.");

    try {
        await addDoc(collection(db, "timeline_posts"), {
            authorCode: currentUser.code,
            authorName: currentUser.name,
            isStaff: currentUser.type === 'staff',
            message: message,
            timestamp: new Date().toISOString()
        });
        document.getElementById('postMessage').value = '';
    } catch (error) {
        alert("Failed to publish post: " + error.message);
    }
});

function loadPosts() {
    if (!currentUser) return; 

    // Disconnect old listener if the user clicks refresh to prevent duplicates
    if (unsubscribePosts) {
        unsubscribePosts();
    }

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
            
            postElement.innerHTML = `
                <div class="post-header">
                    <div>
                        <strong>${post.authorName} ${badgeHTML}</strong>
                        <span class="time" style="margin-left: 10px;">${dateStr}</span>
                    </div>
                    ${deleteButtonHTML}
                </div>
                <div class="post-body">${post.message}</div>
                
                <div class="comments-section" id="comments-${postId}">
                    <!-- Comments injected here -->
                </div>
                
                <div class="reply-box">
                    <input type="text" id="reply-msg-${postId}" placeholder="Write a reply...">
                    <button onclick="submitReply('${postId}')">Reply</button>
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
                    <div><strong>${comment.authorName} ${badgeHTML}:</strong> ${comment.message}</div>
                    ${deleteCommentHTML}
                </div>
            `;
        });
    });
}

window.submitReply = async function(postId) {
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
        msgInput.value = '';
    } catch (error) {
        alert("Failed to post comment: " + error.message);
    }
};

// --- 3. SECURE DELETE FUNCTIONS ---

window.deletePost = async function(postId) {
    if (!currentUser || currentUser.type !== 'staff') return; 

    if (confirm("Are you sure you want to delete this post and its comments?")) {
        try {
            await deleteDoc(doc(db, "timeline_posts", postId));
        } catch (error) {
            alert("Database Error: Could not delete post. " + error.message);
        }
    }
};

window.deleteComment = async function(commentId) {
    if (!currentUser || currentUser.type !== 'staff') return; 

    if (confirm("Delete this reply?")) {
        try {
            await deleteDoc(doc(db, "timeline_comments", commentId));
        } catch (error) {
            alert("Database Error: Could not delete comment. " + error.message);
        }
    }
};