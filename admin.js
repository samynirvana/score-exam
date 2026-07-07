import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, collection, getDocs, getDoc, deleteDoc, query, where, addDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Secondary background authorization loop configuration context
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
    const welcomeTitle = document.getElementById('welcomeTitle');

    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userRole = userData.role; 
                teacherSubject = userData.subject || ""; 
            } else {
                userRole = "teacher";
                teacherSubject = "Unassigned";
            }

            loginScreen.classList.add('hidden');
            adminDashboard.classList.remove('hidden');

            if (userRole === "admin") {
                adminOnlySection.classList.remove('hidden');
                subjectInput.disabled = false;
                subjectInput.value = "";
                subjectInput.placeholder = "Subject Name (e.g. English)";
                tableTitle.innerText = "Master Registry Ledger - All Subjects & Classes";
                welcomeTitle.innerText = "Administrator Master System Workspace";
                loadStudentsDirectory();
            } else {
                adminOnlySection.classList.add('hidden');
                subjectInput.value = teacherSubject;
                subjectInput.disabled = true; 
                tableTitle.innerText = `Departmental Performance Ledger: ${teacherSubject}`;
                welcomeTitle.innerText = `Teacher Portal Workspace (${teacherSubject})`;
            }

            loadAdminTable();
        } catch (err) {
            alert("Error querying identity permissions: " + err.message);
        }
    } else {
        loginScreen.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
    }
});

async function loginAdmin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Authentication Failed: " + error.message);
    }
}

async function logoutAdmin() {
    await signOut(auth);
}

async function createTeacherAccount() {
    const email = document.getElementById('newTeacherEmail').value.trim();
    const password = document.getElementById('newTeacherPassword').value.trim();
    const subject = document.getElementById('newTeacherSubject').value.trim();

    if (!email || !password || !subject) {
        alert("All fields are required to register a teacher.");
        return;
    }

    try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await setDoc(doc(db, "users", credential.user.uid), {
            email: email,
            role: "teacher",
            subject: subject
        });
        alert(`Teacher Registered Successfully!\nEmail: ${email}\nSubject: ${subject}`);
        document.getElementById('newTeacherEmail').value = "";
        document.getElementById('newTeacherPassword').value = "";
        document.getElementById('newTeacherSubject').value = "";
        await secondaryAuth.signOut();
    } catch (e) {
        alert("Registration operation rejected: " + e.message);
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

async function registerStudent() {
    const name = document.getElementById('newStudentName').value.trim();
    const studentClass = document.getElementById('newStudentClass').value.trim();

    if (!name || !studentClass) {
        alert("Please provide both Student Name and Class assignment.");
        return;
    }

    try {
        const dupQuery = query(collection(db, "students"), where("studentName", "==", name), where("studentClass", "==", studentClass));
        const dupSnap = await getDocs(dupQuery);

        if (!dupSnap.empty) {
            alert(`Profile collision! This student is already registered with code: ${dupSnap.docs[0].id}`);
            return;
        }

        const uniqueCode = await generateUniqueStudentCode();
        await setDoc(doc(db, "students", uniqueCode), {
            studentName: name,
            studentClass: studentClass
        });
        
        alert(`Profile Confirmed!\nName: ${name}\nClass: ${studentClass}\nCode: ${uniqueCode}`);
        document.getElementById('newStudentName').value = "";
        document.getElementById('newStudentClass').value = "";
        loadStudentsDirectory();
    } catch (e) {
        alert("System error tracking record: " + e.message);
    }
}

// Render directory collection with Edit and Delete hooks
async function loadStudentsDirectory() {
    try {
        const snap = await getDocs(collection(db, "students"));
        const tbody = document.querySelector("#studentsTable tbody");
        tbody.innerHTML = "";
        snap.forEach((doc) => {
            const data = doc.data();
            const retrievedClass = data.studentClass || data.Class || data.class || "N/A";
            tbody.innerHTML += `<tr>
                <td><strong>${doc.id}</strong></td>
                <td>${data.studentName || 'N/A'}</td>
                <td><span style="color:#007bff; font-weight:bold;">${retrievedClass}</span></td>
                <td>
                    <button class="edit-btn" onclick="editStudentProfile('${doc.id}')">Edit</button>
                    <button class="delete-btn" onclick="deleteStudentProfile('${doc.id}')">Delete</button>
                </td>
            </tr>`;
        });
    } catch (e) {
        console.error(e);
    }
}

// Inline Student Directory Modification Handler
async function editStudentProfile(studentCode) {
    try {
        const docRef = doc(db, "students", studentCode);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return alert("Student record missing.");

        const currentData = docSnap.data();
        const currentClass = currentData.studentClass || currentData.Class || currentData.class || "";

        const newName = prompt("Modify Student Full Name:", currentData.studentName || "");
        if (newName === null) return; // User cancelled
        
        const newClass = prompt("Modify Student Class (e.g., Grade 7A):", currentClass);
        if (newClass === null) return; // User cancelled

        if (!newName.trim() || !newClass.trim()) {
            alert("Values cannot be saved empty.");
            return;
        }

        await updateDoc(docRef, {
            studentName: newName.trim(),
            studentClass: newClass.trim()
        });

        alert("Profile updated successfully!");
        loadStudentsDirectory();
        loadAdminTable(); // Refresh the performance table to cascade naming visual updates
    } catch (e) {
        alert("Error modifying dataset: " + e.message);
    }
}

// Student Directory Wiping Handler
async function deleteStudentProfile(studentCode) {
    if (confirm(`Are you sure you want to permanently delete student registration code ${studentCode} from the directory?\n(This actions does not clear recorded exam score blocks).`)) {
        try {
            await deleteDoc(doc(db, "students", studentCode));
            alert("Directory signature removed.");
            loadStudentsDirectory();
        } catch (e) {
            alert("Error removing directory entry: " + e.message);
        }
    }
}

async function addStudentScore() {
    const code = document.getElementById('scoreStudentCode').value.toUpperCase().trim();
    const examName = document.getElementById('examName').value.trim();
    const subject = userRole === "admin" ? document.getElementById('subject').value.trim() : teacherSubject;
    const score = parseInt(document.getElementById('score').value);

    if (!code || !examName || !subject || isNaN(score)) {
        alert("Please complete all entry fields.");
        return;
    }

    try {
        const studentSnap = await getDoc(doc(db, "students", code));
        if (!studentSnap.exists()) {
            alert(`Lookup Error: Student code "${code}" does not exist in the active directory registration system.`);
            return;
        }

        const sData = studentSnap.data();
        const targetClass = sData.studentClass || sData.Class || sData.class || 'N/A';

        await addDoc(collection(db, "exam_scores"), {
            studentCode: code,
            studentName: sData.studentName,
            studentClass: targetClass,
            examName: examName,
            subject: subject,
            score: score
        });

        alert("Score logged successfully!");
        document.getElementById('scoreStudentCode').value = "";
        document.getElementById('score').value = "";
        loadAdminTable();
    } catch (e) {
        alert("Error logging exam document transaction: " + e.message);
    }
}

async function deleteStudentScore(docId) {
    if (confirm("Permanently wipe this score entry from the ledger?")) {
        try {
            await deleteDoc(doc(db, "exam_scores", docId));
            loadAdminTable();
        } catch (e) {
            alert("Transaction error: " + e.message);
        }
    }
}

// CORRECTED TABLE RENDERING METHOD WITH NO-SHIFT FAILSAFE CELL DESIGNATIONS
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
            
            // Extract attributes with sequential fallbacks to keep columns completely uniform
            const exam = data.examName || 'N/A';
            const sub = data.subject || 'N/A';
            const sName = data.studentName || 'N/A';
            const sClass = data.studentClass || data.Class || data.class || 'N/A';
            
            // If the document data doesn't have an explicit studentCode attribute, 
            // check if the document ID is a 5-char user-defined alphanumeric string
            const sCode = data.studentCode || (doc.id.length === 5 ? doc.id : 'N/A');
            const numScore = data.score !== undefined ? data.score : 'N/A';

            // EXACTLY 7 <td> PAIRS MAPS LINE-BY-LINE PER ROW
            tbody.innerHTML += `<tr>
                <td>${exam}</td>
                <td>${sub}</td>
                <td>${sName}</td>
                <td><strong>${sClass}</strong></td>
                <td><strong>${sCode}</strong></td>
                <td><strong style="color: #28a745;">${numScore}</strong></td>
                <td><button class="delete-btn" onclick="deleteStudentScore('${doc.id}')">Delete</button></td>
            </tr>`;
        });
    } catch (e) {
        console.error("Table processing crash encountered: ", e);
    }
}

async function processExcel() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput.files[0];
    if (!file) return alert("Select an Excel workbook document first.");

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
                        const sClass = sData.studentClass || sData.Class || sData.class || 'N/A';
                        await addDoc(collection(db, "exam_scores"), {
                            studentCode: code,
                            studentName: sData.studentName,
                            studentClass: sClass,
                            examName: String(examName),
                            subject: String(subject),
                            score: score
                        });
                        successCount++;
                    }
                }
            }
            alert(`Excel execution complete! Processed ${successCount} entries into records.`);
            fileInput.value = "";
            loadAdminTable();
        } catch (err) {
            alert("Error parsing document mapping properties: " + err.message);
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

// Window binding parameters
window.deleteStudentScore = deleteStudentScore;
window.editStudentProfile = editStudentProfile;
window.deleteStudentProfile = deleteStudentProfile;