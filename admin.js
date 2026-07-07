import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, collection, getDocs, deleteDoc, query, where, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
        loadAdminTable();
    } else {
        loginScreen.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
        document.querySelector("#adminTable tbody").innerHTML = "";
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

// Generates a random 5-character string
function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Click listener to fill the input box with a brand new code
document.getElementById('genCodeBtn').addEventListener('click', () => {
    document.getElementById('studentCode').value = generateRandomCode();
});

async function addStudentScore() {
    const examName = document.getElementById('examName').value;
    const subject = document.getElementById('subject').value;
    const studentName = document.getElementById('studentName').value;
    const studentCode = document.getElementById('studentCode').value.toUpperCase().trim();
    const score = parseInt(document.getElementById('score').value);
    const saveBtn = document.getElementById('saveBtn');

    if (!examName || !subject || !studentName || !studentCode || isNaN(score)) {
        alert("Please fill out all fields including the Student Code!");
        return;
    }

    saveBtn.disabled = true;

    try {
        // Save to collection with an auto-generated row ID
        await addDoc(collection(db, "exam_scores"), {
            examName,
            subject,
            studentName,
            studentCode,
            score,
            teacherUid: auth.currentUser.uid
        });

        alert(`Successfully saved score for ${studentName}!`);
        document.getElementById('studentName').value = "";
        document.getElementById('score').value = "";
        loadAdminTable();
    } catch (e) {
        alert("Error saving: " + e.message);
    } finally {
        saveBtn.disabled = false;
    }
}

async function deleteStudentScore(docId) {
    if (confirm("Are you sure you want to permanently delete this score record?")) {
        try {
            await deleteDoc(doc(db, "exam_scores", docId));
            alert("Record successfully deleted.");
            loadAdminTable();
        } catch (e) {
            alert("Error deleting record: " + e.message);
        }
    }
}

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
            const row = `<tr>
                <td>${data.examName}</td>
                <td>${data.subject || 'N/A'}</td>
                <td>${data.studentName}</td>
                <td><strong>${data.studentCode || 'N/A'}</strong></td>
                <td>${data.score}</td>
                <td>
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
                alert("The uploaded file is empty.");
                uploadBtn.disabled = false;
                uploadBtn.innerText = "Upload & Process Excel";
                return;
            }

            let successCount = 0;

            for (const row of jsonData) {
                const examName = row["Exam Name"] || row["Exam"] || row["examName"];
                const subject = row["Subject"] || row["subject"] || row["Subject Name"];
                const studentName = row["Student Name"] || row["Student"] || row["studentName"];
                const studentCode = row["Student Code"] || row["Code"] || row["studentCode"];
                const score = parseInt(row["Score"] || row["score"]);

                if (examName && subject && studentName && studentCode && !isNaN(score)) {
                    await addDoc(collection(db, "exam_scores"), {
                        examName: String(examName),
                        subject: String(subject),
                        studentName: String(studentName),
                        studentCode: String(studentCode).toUpperCase().trim(),
                        score: score,
                        teacherUid: auth.currentUser.uid
                    });
                    successCount++;
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

document.getElementById('loginBtn').addEventListener('click', loginAdmin);
document.getElementById('logoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('saveBtn').addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn').addEventListener('click', processExcel);

window.deleteStudentScore = deleteStudentScore;