import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

// Monitor Authentication State
onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminDashboard = document.getElementById('adminDashboard');

    if (user) {
        loginScreen.classList.add('hidden');
        adminDashboard.classList.remove('hidden');
        loadAdminTable();
    } else {
        loginScreen.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
        document.querySelector("#adminTable tbody").innerHTML = "";
    }
});

// Login Function
async function loginAdmin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Login Failed: " + error.message);
    }
}

// Logout Function
async function logoutAdmin() {
    await signOut(auth);
}

// Helper: Generate Unique 5-char code
async function generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let isUnique = false;
    
    while (!isUnique) {
        code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const docRef = doc(db, "exam_scores", code);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) isUnique = true; 
    }
    return code;
}

// Input Data & Save
async function addStudentScore() {
    const examName = document.getElementById('examName').value;
    const studentName = document.getElementById('studentName').value;
    const score = parseInt(document.getElementById('score').value);
    const saveBtn = document.getElementById('saveBtn');

    if (!examName || !studentName || isNaN(score)) {
        alert("Please fill out Exam Name, Student Name, and Score!");
        return;
    }

    saveBtn.disabled = true;

    try {
        const uniqueCode = await generateUniqueCode();

        // Save cleanly to Firestore
        await setDoc(doc(db, "exam_scores", uniqueCode), {
            examName,
            studentName,
            score
        });

        alert(`Successfully saved!\nStudent: ${studentName}\nCode: ${uniqueCode}`);
        
        document.getElementById('studentName').value = "";
        document.getElementById('score').value = "";
        loadAdminTable();
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        saveBtn.disabled = false;
    }
}

// Regenerate Code logic
async function regenerateCode(oldCode) {
    const docRef = doc(db, "exam_scores", oldCode);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const currentData = docSnap.data();
        const newCode = await generateUniqueCode();

        try {
            await setDoc(doc(db, "exam_scores", newCode), currentData);
            await deleteDoc(docRef);
            alert(`Code updated from ${oldCode} to ${newCode}`);
            loadAdminTable();
        } catch (e) {
            alert("Error updating code: " + e.message);
        }
    }
}

// Load scores to Admin View
async function loadAdminTable() {
    try {
        const querySnapshot = await getDocs(collection(db, "exam_scores"));
        const tbody = document.querySelector("#adminTable tbody");
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const row = `<tr>
                <td>${data.examName}</td>
                <td>${data.studentName}</td>
                <td>${data.score}</td>
                <td><strong>${doc.id}</strong></td>
                <td><button class="regen-btn" onclick="regenerateCode('${doc.id}')">Regenerate</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error("Error loading table: ", e);
    }
}

// Event Listeners
document.getElementById('loginBtn').addEventListener('click', loginAdmin);
document.getElementById('logoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('saveBtn').addEventListener('click', addStudentScore);

// Keeps regenerateCode accessible to the dynamic table buttons
window.regenerateCode = regenerateCode;