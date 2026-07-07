import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
    const subject = document.getElementById('subject').value;
    const studentName = document.getElementById('studentName').value;
    const score = parseInt(document.getElementById('score').value);
    const saveBtn = document.getElementById('saveBtn');

    if (!examName || !subject || !studentName || isNaN(score)) {
        alert("Please fill out Exam Name, Subject, Student Name, and Score!");
        return;
    }

    saveBtn.disabled = true;

    try {
        const uniqueCode = await generateUniqueCode();

        // Save cleanly to Firestore with teacherUid
        await setDoc(doc(db, "exam_scores", uniqueCode), {
            examName,
            subject,
            studentName,
            score,
            teacherUid: auth.currentUser.uid
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

// New Delete Score Function
async function deleteStudentScore(code) {
    if (confirm(`Are you sure you want to permanently delete the score record for code: ${code}?`)) {
        try {
            await deleteDoc(doc(db, "exam_scores", code));
            alert(`Record ${code} successfully deleted.`);
            loadAdminTable(); // Refresh UI layout
        } catch (e) {
            alert("Error deleting record: " + e.message);
        }
    }
}

// Load scores to Admin View (Filtered by Logged-in Teacher)
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
            // Appended the Delete button alongside Regenerate inside the action column
            const row = `<tr>
                <td>${data.examName}</td>
                <td>${data.subject || 'N/A'}</td>
                <td>${data.studentName}</td>
                <td>${data.score}</td>
                <td><strong>${doc.id}</strong></td>
                <td>
                    <button class="regen-btn" onclick="regenerateCode('${doc.id}')">Regenerate</button>
                    <button class="delete-btn" onclick="deleteStudentScore('${doc.id}')">Delete</button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    } catch (e) {
        console.error("Error loading table: ", e);
    }
}

async function processExcel() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select an Excel file first!");
        return;
    }

    const uploadBtn = document.getElementById('uploadExcelBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerText = "Processing...";

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("The uploaded file is empty or formatted incorrectly.");
                uploadBtn.disabled = false;
                uploadBtn.innerText = "Upload & Process Excel";
                return;
            }

            let successCount = 0;

            for (const row of jsonData) {
                const examName = row["Exam Name"] || row["Exam"] || row["examName"];
                const subject = row["Subject"] || row["subject"] || row["Subject Name"];
                const studentName = row["Student Name"] || row["Student"] || row["studentName"];
                const score = parseInt(row["Score"] || row["score"]);

                if (examName && subject && studentName && !isNaN(score)) {
                    const uniqueCode = await generateUniqueCode();
                    
                    await setDoc(doc(db, "exam_scores", uniqueCode), {
                        examName: String(examName),
                        subject: String(subject),
                        studentName: String(studentName),
                        score: score,
                        teacherUid: auth.currentUser.uid
                    });
                    successCount++;
                } else {
                    console.warn("Skipping invalid row, missing data:", row);
                }
            }

            alert(`Successfully imported ${successCount} student records!`);
            fileInput.value = ""; 
            loadAdminTable();     
            
        } catch (error) {
            alert("Error processing file: " + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerText = "Upload & Process Excel";
        }
    };

    reader.readAsArrayBuffer(file);
}

// Event Listeners
document.getElementById('loginBtn').addEventListener('click', loginAdmin);
document.getElementById('logoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('saveBtn').addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn').addEventListener('click', processExcel);

// Make functions globally accessible to the dynamic table buttons
window.regenerateCode = regenerateCode;
window.deleteStudentScore = deleteStudentScore;