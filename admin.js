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

// Role Memory Cache Storage
let userRole = null;
let teacherSubject = null;

onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminDashboard = document.getElementById('adminDashboard');
    const adminOnlySection = document.getElementById('adminOnlySection');
    const subjectInput = document.getElementById('subject');
    const tableTitle = document.getElementById('tableTitle');

    if (user) {
        try {
            // Fetch system authorization clearance profile assignment
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userRole = userData.role; // "admin" or "teacher"
                teacherSubject = userData.subject || ""; 
            } else {
                // Default fallback protocol safety
                userRole = "teacher";
                teacherSubject = "Unknown";
            }

            loginScreen.classList.add('hidden');
            adminDashboard.classList.remove('hidden');

            if (userRole === "admin") {
                adminOnlySection.classList.remove('hidden');
                subjectInput.disabled = false;
                subjectInput.placeholder = "Subject (e.g., English)";
                tableTitle.innerText = "Master Registry - All Exam Scores";
                loadStudentsDirectory();
            } else {
                // Restricted Teacher Setup Profile
                adminOnlySection.classList.add('hidden');
                subjectInput.value = teacherSubject;
                subjectInput.disabled = true; // Lock field input modifications
                tableTitle.innerText = `Exam Scores tracking for: ${teacherSubject}`;
            }

            loadAdminTable();
        } catch (err) {
            alert("Error parsing identity authorization profile permissions: " + err.message);
        }
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

// 1. Create permanent student identity registration WITH DUPLICATE PROTECTION
async function registerStudent() {
    const nameInput = document.getElementById('newStudentName').value.trim();
    if (!nameInput) {
        alert("Please provide a student name.");
        return;
    }

    try {
        // Query to check if this exact student name is already registered
        const dupQuery = query(collection(db, "students"), where("studentName", "==", nameInput));
        const dupSnap = await getDocs(dupQuery);

        if (!dupSnap.empty) {
            alert(`Registration Stopped!\nA student named "${nameInput}" already exists with Code: ${dupSnap.docs[0].id}`);
            return;
        }

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
    // Use forced user memory field value properties if teacher role criteria is active
    const subject = userRole === "admin" ? document.getElementById('subject').value.trim() : teacherSubject;
    const score = parseInt(document.getElementById('score').value);

    if (!code || !examName || !subject || isNaN(score)) {
        alert("Please fill out all fields!");
        return;
    }

    try {
        const studentDoc = await getDoc(doc(db, "students", code));
        if (!studentDoc.exists()) {
            alert(`Error: Student Code "${code}" does not exist in the database directory registry!`);
            return;
        }

        await addDoc(collection(db, "exam_scores"), {
            studentCode: code,
            studentName: studentDoc.data().studentName, 
            examName,
            subject,
            score,
            teacherUid: auth.currentUser.uid
        });

        alert("Score added successfully!");
        document.getElementById('score').value = "";
        document.getElementById('scoreStudentCode').value = "";
        loadAdminTable();
    } catch (e) {
        alert("Error saving score entry: " + e.message);
    }
}

async function deleteStudentScore(docId) {
    if (confirm("Permanently delete this exam score instance?")) {
        try {
            await deleteDoc(doc(db, "exam_scores", docId));
            loadAdminTable();
        } catch (e) {
            alert("Error: " + e.message);
        }
    }
}

// Load logs to interface layout view filtering based on role structure variables
async function loadAdminTable() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        let q;
        if (userRole === "admin") {
            // Admins can pull everything unconditionally
            q = query(collection(db, "exam_scores"));
        } else {
            // Teachers can only view matching subject records
            q = query(collection(db, "exam_scores"), where("subject", "==", teacherSubject));
        }

        const querySnapshot = await getDocs(q);
        const tbody = document.querySelector("#adminTable tbody");
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const data = doc.data();
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
                const fileSubject = row["Subject"];
                // Enforce teacher subject lock during processing
                const subject = userRole === "admin" ? fileSubject : teacherSubject;
                const score = parseInt(row["Score"] || row["score"]);

                // Skip entries if a teacher uploads rows matching another subject
                if (userRole !== "admin" && String(fileSubject).toLowerCase() !== teacherSubject.toLowerCase()) {
                    continue; 
                }

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