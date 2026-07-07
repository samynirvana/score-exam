import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, collection, getDocs, getDoc, deleteDoc, query, where, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3oiOHwHUfMhTPjEp8Ku8-qlbRKlGX0Gg",
    authDomain: "students-score-395b2.firebaseapp.com",
    projectId: "students-score-395b2",
    storageBucket: "students-score-395b2.firebasestorage.app",
    messagingSenderId: "189447167056",
    appId: "1:189447167056:web:4526e218132977bc3f4555",
    measurementId: "G-97WSSH0BNE",
};

// Initialize Primary App Configuration
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Initialize Secondary App Configuration to register new accounts without logging out admin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAuthApp");
const secondaryAuth = getAuth(secondaryApp);

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
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userRole = userData.role; 
                teacherSubject = userData.subject || ""; 
            } else {
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
                adminOnlySection.classList.add('hidden');
                subjectInput.value = teacherSubject;
                subjectInput.disabled = true; 
                tableTitle.innerText = `Exam Scores tracking for: ${teacherSubject}`;
            }

            loadAdminTable();
        } catch (err) {
            alert("Error reading user credentials: " + err.message);
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

// ADMIN FUNCTION: Create a secondary teacher account completely via UI
async function createTeacherAccount() {
    const email = document.getElementById('newTeacherEmail').value.trim();
    const password = document.getElementById('newTeacherPassword').value.trim();
    const subject = document.getElementById('newTeacherSubject').value.trim();

    if (!email || !password || !subject) {
        alert("Please fill out all teacher generation fields.");
        return;
    }

    try {
        // Create user entry against the secondary Auth context pipeline
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newTeacherUid = userCredential.user.uid;

        // Assign access configuration inside Firestore database paths
        await setDoc(doc(db, "users", newTeacherUid), {
            email: email,
            role: "teacher",
            subject: subject
        });

        alert(`Success! Teacher account created for: ${email}\nAssigned Subject: ${subject}`);
        
        document.getElementById('newTeacherEmail').value = "";
        document.getElementById('newTeacherPassword').value = "";
        document.getElementById('newTeacherSubject').value = "";

        // Sign out secondary instance clear memory footprint
        await secondaryAuth.signOut();
    } catch (error) {
        alert("Failed to create teacher account: " + error.message);
    }
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

// Register student profile tracking class data parameters
async function registerStudent() {
    const nameInput = document.getElementById('newStudentName').value.trim();
    const classInput = document.getElementById('newStudentClass').value.trim();

    if (!nameInput || !classInput) {
        alert("Please provide both student name and class designation.");
        return;
    }

    try {
        // Check if a student with the exact same name and class already exists
        const dupQuery = query(collection(db, "students"), where("studentName", "==", nameInput), where("studentClass", "==", classInput));
        const dupSnap = await getDocs(dupQuery);

        if (!dupSnap.empty) {
            alert(`Registration Stopped!\nA student named "${nameInput}" inside "${classInput}" already exists with Code: ${dupSnap.docs[0].id}`);
            return;
        }

        const uniqueCode = await generateUniqueStudentCode();
        await setDoc(doc(db, "students", uniqueCode), {
            studentName: nameInput,
            studentClass: classInput
        });
        
        alert(`Registered successfully!\n${nameInput} (${classInput}) Code is: ${uniqueCode}`);
        document.getElementById('newStudentName').value = "";
        document.getElementById('newStudentClass').value = "";
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
            const data = doc.data();
            tbody.innerHTML += `<tr>
                <td><strong>${doc.id}</strong></td>
                <td>${data.studentName}</td>
                <td>${data.studentClass || 'N/A'}</td>
            </tr>`;
        });
    } catch (e) {
        console.error(e);
    }
}

async function addStudentScore() {
    const code = document.getElementById('scoreStudentCode').value.toUpperCase().trim();
    const examName = document.getElementById('examName').value.trim();
    const subject = userRole === "admin" ? document.getElementById('subject').value.trim() : teacherSubject;
    const score = parseInt(document.getElementById('score').value);

    if (!code || !examName || !subject || isNaN(score)) {
        alert("Please fill out all score entry fields!");
        return;
    }

    try {
        const studentDoc = await getDoc(doc(db, "students", code));
        if (!studentDoc.exists()) {
            alert(`Error: Student Code "${code}" does not exist in the database!`);
            return;
        }

        const studentData = studentDoc.data();

        await addDoc(collection(db, "exam_scores"), {
            studentCode: code,
            studentName: studentData.studentName, 
            studentClass: studentData.studentClass || 'N/A', // Denormalize class data parameters 
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

async function loadAdminTable() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        let q = (userRole === "admin") 
            ? query(collection(db, "exam_scores")) 
            : query(collection(db, "exam_scores"), where("subject", "==", teacherSubject));

        const querySnapshot = await getDocs(q);
        const tbody = document.querySelector("#adminTable tbody");
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            tbody.innerHTML += `<tr>
                <td>${data.examName}</td>
                <td>${data.subject || 'N/A'}</td>
                <td>${data.studentName}</td>
                <td>${data.studentClass || 'N/A'}</td>
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
                const subject = userRole === "admin" ? fileSubject : teacherSubject;
                const score = parseInt(row["Score"] || row["score"]);

                if (userRole !== "admin" && String(fileSubject).toLowerCase() !== teacherSubject.toLowerCase()) {
                    continue; 
                }

                if (code && examName && subject && !isNaN(score)) {
                    const studentDoc = await getDoc(doc(db, "students", code));
                    if (studentDoc.exists()) {
                        const sData = studentDoc.data();
                        await addDoc(collection(db, "exam_scores"), {
                            studentCode: code,
                            studentName: sData.studentName,
                            studentClass: sData.studentClass || 'N/A',
                            examName: String(examName),
                            subject: String(subject),
                            score: score,
                            teacherUid: auth.currentUser.uid
                        });
                        successCount++;
                    }
                }
            }
            alert(`Successfully imported ${successCount} exam logs.`);
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
document.getElementById('createTeacherBtn').addEventListener('click', createTeacherAccount);
document.getElementById('registerStudentBtn').addEventListener('click', registerStudent);
document.getElementById('saveScoreBtn').addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn').addEventListener('click', processExcel);

window.deleteStudentScore = deleteStudentScore;