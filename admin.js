import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, collection, getDocs, getDoc, deleteDoc, query, where, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminDashboard = document.getElementById('adminDashboard');

    if (user) {
        loginScreen.classList.add('hidden');
        adminDashboard.classList.remove('hidden');
        loadStudentsDirectory();
        loadAdminTable();
    } else {
        loginScreen.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
    }
});

async function loginAdmin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Login Failed: " + error.message);
    }
}

async function logoutAdmin() {
    await signOut(auth);
}

// Generate unique 5-char code for global master registry
async function generateUniqueStudentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let isUnique = false;
    
    while (!isUnique) {
        code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const docRef = doc(db, "students", code);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) isUnique = true; 
    }
    return code;
}

// 1. Create permanent student identity registration
async function registerStudent() {
    const nameInput = document.getElementById('newStudentName').value.trim();
    if (!nameInput) {
        alert("Please provide a student name.");
        return;
    }

    try {
        const uniqueCode = await generateUniqueStudentCode();
        await setDoc(doc(db, "students", uniqueCode), {
            studentName: nameInput
        });
        alert(`Registered successfully!\n${nameInput} Code is: ${uniqueCode}`);
        document.getElementById('newStudentName').value = "";
        loadStudentsDirectory();
    } catch (e) {
        alert("Registration failed: " + e.message);
    }
}

// Load global directory registry list
async function loadStudentsDirectory() {
    try {
        const querySnapshot = await getDocs(collection(db, "students"));
        const tbody = document.querySelector("#studentsTable tbody");
        tbody.innerHTML = "";
        querySnapshot.forEach((doc) => {
            tbody.innerHTML += `<tr>
                <td><strong>${doc.id}</strong></td>
                <td>${doc.data().studentName}</td>
            </tr>`;
        });
    } catch (e) {
        console.error(e);
    }
}

// 2. Add single test performance logs linked to registry items
async function addStudentScore() {
    const code = document.getElementById('scoreStudentCode').value.toUpperCase().trim();
    const examName = document.getElementById('examName').value.trim();
    const subject = document.getElementById('subject').value.trim();
    const score = parseInt(document.getElementById('score').value);

    if (!code || !examName || !subject || isNaN(score)) {
        alert("Please fill out all grade tracking inputs!");
        return;
    }

    try {
        // Validate student directory profile matching presence verification lookup
        const studentDoc = await getDoc(doc(db, "students", code));
        if (!studentDoc.exists()) {
            alert(`Error: Student Code "${code}" does not exist in the database profile registry directory! Please register them first.`);
            return;
        }

        const studentName = studentDoc.data().studentName;

        await addDoc(collection(db, "exam_scores"), {
            studentCode: code,
            studentName: studentName, // Denormalized entry property component optimization
            examName,
            subject,
            score,
            teacherUid: auth.currentUser.uid
        });

        alert("Score added successfully!");
        document.getElementById('score').value = "";
        loadAdminTable();
    } catch (e) {
        alert("Error saving score entry: " + e.message);
    }
}

async function deleteStudentScore(docId) {
    if (confirm("Permanently delete this exam score logging instance item entry row?")) {
        try {
            await deleteDoc(doc(db, "exam_scores", docId));
            loadAdminTable();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }
}

// Load logs to interface layout view safely matching header array rows order index
async function loadAdminTable() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const q = query(collection(db, "exam_scores"), where("teacherUid", "==", user.uid));
        const querySnapshot = await getDocs(q);
        const tbody = document.querySelector("#adminTable tbody");
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Perfectly aligned data cells strings rows layout block output
            tbody.innerHTML += `<tr>
                <td>${data.examName}</td>
                <td>${data.subject || 'N/A'}</td>
                <td>${data.studentName}</td>
                <td><strong>${data.studentCode}</strong></td>
                <td>${data.score}</td>
                <td><button class="delete-btn" onclick="deleteStudentScore('${doc.id}')">Delete</button></td>
            </tr>`;
        });
    } catch (e) {
        console.error(e);
    }
}

async function processExcel() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    if (!file) return alert("Select an Excel file.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            let successCount = 0;
            for (const row of jsonData) {
                const code = String(row["Student Code"] || row["Code"] || "").toUpperCase().trim();
                const examName = row["Exam Name"] || row["Exam"];
                const subject = row["Subject"];
                const score = parseInt(row["Score"] || row["score"]);

                if (code && examName && subject && !isNaN(score)) {
                    const studentDoc = await getDoc(doc(db, "students", code));
                    if (studentDoc.exists()) {
                        await addDoc(collection(db, "exam_scores"), {
                            studentCode: code,
                            studentName: studentDoc.data().studentName,
                            examName: String(examName),
                            subject: String(subject),
                            score: score,
                            teacherUid: auth.currentUser.uid
                        });
                        successCount++;
                    }
                }
            }
            alert(`Successfully imported ${successCount} exam logs lines.`);
            fileInput.value = "";
            loadAdminTable();
        } catch (err) {
            alert("Excel Error: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

document.getElementById('loginBtn').addEventListener('click', loginAdmin);
document.getElementById('logoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('registerStudentBtn').addEventListener('click', registerStudent);
document.getElementById('saveScoreBtn').addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn').addEventListener('click', processExcel);

window.deleteStudentScore = deleteStudentScore;