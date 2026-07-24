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
    // REMOVED: const adminOnlySection = document.getElementById('adminOnlySection');
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
                // NEW: Use the class-based toggle for admin views
                document.querySelectorAll('.admin-only-view').forEach(el => el.classList.remove('hidden'));
                document.getElementById('menuAdminOnly').style.display = "block";
                
                subjectInput.disabled = false;
                subjectInput.value = "";
                subjectInput.placeholder = "Subject Name (e.g. English)";
                tableTitle.innerText = "Master Registry Ledger - All Subjects & Classes";
                welcomeTitle.innerText = "Administrator Master System Workspace";
                loadStudentsDirectory();
            } else {
                // NEW: Hide admin views for teachers
                document.querySelectorAll('.admin-only-view').forEach(el => el.classList.add('hidden'));
                document.getElementById('menuAdminOnly').style.display = "none";
                document.querySelector('[data-tab="tab-manage-scores"]').click(); // Force teacher to scores tab
                
                subjectInput.value = teacherSubject;
                subjectInput.disabled = true; 
                tableTitle.innerText = `Departmental Performance Ledger: ${teacherSubject}`;
                welcomeTitle.innerText = `Teacher Portal Workspace (${teacherSubject})`;
            }

            loadAdminTable();
            loadPointsTable(); 
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
        loadPointsTable(); // Refresh points table to include new student
    } catch (e) {
        alert("System error tracking record: " + e.message);
    }
}

// Render directory collection with Edit and Delete hooks
async function loadStudentsDirectory() {
    try {
        const snap = await getDocs(collection(db, "students"));
        const tbody = document.querySelector("#studentsTable tbody");
        if (!tbody) return;
        
        let studentsList = [];
        snap.forEach((doc) => {
            const data = doc.data();
            studentsList.push({
                id: doc.id,
                name: data.studentName || 'N/A',
                studentClass: data.studentClass || data.Class || data.class || "N/A"
            });
        });

        // Apply Sorting
        const sortVal = document.getElementById('sortStudents')?.value || 'code';
        studentsList.sort((a, b) => {
            if (sortVal === 'name') return a.name.localeCompare(b.name);
            if (sortVal === 'class') return a.studentClass.localeCompare(b.studentClass);
            return a.id.localeCompare(b.id);
        });

        tbody.innerHTML = "";
        studentsList.forEach((s) => {
            tbody.innerHTML += `<tr>
                <td><strong>${s.id}</strong></td>
                <td>${s.name}</td>
                <td><span style="color:#007bff; font-weight:bold;">${s.studentClass}</span></td>
                <td>
                    <button class="edit-btn" onclick="editStudentProfile('${s.id}')">Edit</button>
                    <button class="delete-btn" onclick="deleteStudentProfile('${s.id}')">Delete</button>
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
        if (newName === null) return; 
        
        const newClass = prompt("Modify Student Class (e.g., Grade 7A):", currentClass);
        if (newClass === null) return; 

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
        loadAdminTable(); 
        loadPointsTable(); // Refresh points table with new name
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
            loadPointsTable();
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
        if (!tbody) return;

        let scoresList = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            scoresList.push({
                docId: doc.id,
                exam: data.examName || 'N/A',
                sub: data.subject || 'N/A',
                sName: data.studentName || 'N/A',
                sClass: data.studentClass || data.Class || data.class || 'N/A',
                sCode: data.studentCode || (doc.id.length === 5 ? doc.id : 'N/A'),
                score: data.score !== undefined ? data.score : 0
            });
        });

        // Apply Sorting
        const sortVal = document.getElementById('sortScores')?.value || 'default';
        scoresList.sort((a, b) => {
            if (sortVal === 'name') return a.sName.localeCompare(b.sName);
            if (sortVal === 'class') return a.sClass.localeCompare(b.sClass);
            if (sortVal === 'scoreDesc') return b.score - a.score;
            if (sortVal === 'scoreAsc') return a.score - b.score;
            return 0;
        });

        tbody.innerHTML = "";
        scoresList.forEach((data) => {
            tbody.innerHTML += `<tr>
                <td>${data.exam}</td>
                <td>${data.sub}</td>
                <td>${data.sName}</td>
                <td><strong>${data.sClass}</strong></td>
                <td><strong>${data.sCode}</strong></td>
                <td><strong style="color: #28a745;">${data.score}</strong></td>
                <td><button class="delete-btn" onclick="deleteStudentScore('${data.docId}')">Delete</button></td>
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

// Function to handle saving point transactions
async function processStudentPoint(pointValue) {
    const code = document.getElementById('pointStudentCode').value.toUpperCase().trim();
    const reason = document.getElementById('pointReason').value.trim();

    if (!code || !reason || isNaN(pointValue)) {
        alert("Please ensure Student Code, Reason, and a valid point value are provided.");
        return;
    }

    try {
        const studentSnap = await getDoc(doc(db, "students", code));
        if (!studentSnap.exists()) {
            alert(`Lookup Error: Student code "${code}" does not exist in the directory.`);
            return;
        }

        const sData = studentSnap.data();
        const targetClass = sData.studentClass || sData.Class || sData.class || 'N/A';

        await addDoc(collection(db, "student_points"), {
            studentCode: code,
            studentName: sData.studentName,
            studentClass: targetClass,
            reason: reason,
            points: parseFloat(pointValue),
            timestamp: new Date()
        });

        const sign = pointValue > 0 ? '+' : '';
        alert(`Successfully recorded ${sign}${pointValue} points for ${sData.studentName}.`);
        
        // Reset the form inputs
        document.getElementById('pointReason').value = "";
        document.getElementById('customPointValue').value = "";
        
        // Refresh the ledger automatically
        loadPointsTable(); 
        
    } catch (e) {
        alert("Error logging point transaction: " + e.message);
    }
}

// Function to calculate and render the points ledger
async function loadPointsTable() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        const studentsMap = {};
        
        studentsSnap.forEach(doc => {
            const data = doc.data();
            studentsMap[doc.id] = {
                code: doc.id,
                name: data.studentName || 'N/A',
                sClass: data.studentClass || data.Class || data.class || 'N/A',
                total: 0
            };
        });

        const pointsSnap = await getDocs(collection(db, "student_points"));
        pointsSnap.forEach(doc => {
            const data = doc.data();
            const code = data.studentCode;
            if (studentsMap[code]) {
                studentsMap[code].total += (parseFloat(data.points) || 0);
            }
        });

        let pointsList = Object.values(studentsMap);

        // Apply Sorting
        const sortVal = document.getElementById('sortPoints')?.value || 'default';
        pointsList.sort((a, b) => {
            if (sortVal === 'name') return a.name.localeCompare(b.name);
            if (sortVal === 'class') return a.sClass.localeCompare(b.sClass);
            if (sortVal === 'pointsDesc') return b.total - a.total;
            if (sortVal === 'pointsAsc') return a.total - b.total;
            return 0;
        });

        const tbody = document.querySelector("#pointsTable tbody");
        if(tbody) {
            tbody.innerHTML = "";
            pointsList.forEach(info => {
                const color = info.total > 0 ? '#28a745' : (info.total < 0 ? '#dc3545' : '#333');
                const sign = info.total > 0 ? '+' : '';
                
                // Added the 5th <td> with the reset button
                tbody.innerHTML += `<tr>
                    <td><strong>${info.code}</strong></td>
                    <td>${info.name}</td>
                    <td><strong>${info.sClass}</strong></td>
                    <td><strong style="color: ${color}; font-size: 16px;">${sign}${info.total}</strong></td>
                    <td><button class="delete-btn" style="background: #dc3545;" onclick="resetStudentPoints('${info.code}')">Reset</button></td>
                </tr>`;
            });
        }
    } catch (e) {
        console.error("Error loading points table:", e);
    }
}

// Bind basic events
document.getElementById('loginBtn').addEventListener('click', loginAdmin);
document.getElementById('logoutBtn').addEventListener('click', logoutAdmin);
document.getElementById('createTeacherBtn').addEventListener('click', createTeacherAccount);
document.getElementById('registerStudentBtn').addEventListener('click', registerStudent);
document.getElementById('saveScoreBtn').addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn').addEventListener('click', processExcel);

// Bind quick point buttons
document.querySelectorAll('.quick-point-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const value = parseFloat(e.target.getAttribute('data-val'));
        processStudentPoint(value);
    });
});

// Bind custom point button
document.getElementById('saveCustomPointBtn').addEventListener('click', () => {
    const customValue = parseFloat(document.getElementById('customPointValue').value);
    processStudentPoint(customValue);
});

// Window binding parameters
window.deleteStudentScore = deleteStudentScore;
window.editStudentProfile = editStudentProfile;
window.deleteStudentProfile = deleteStudentProfile;
window.resetStudentPoints = resetStudentPoints;

// --- TAB NAVIGATION LOGIC ---
document.querySelectorAll('.menu-btn').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and hide all tabs
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        
        // Activate clicked button and corresponding tab
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Hide Admin tabs if user is just a teacher
onAuthStateChanged(auth, async (user) => {
    // ... [Inside your existing onAuthStateChanged logic, where it checks userRole === "admin"]
    // Add this to the "admin" check:
    if (userRole === "admin") {
        document.querySelectorAll('.admin-only-view').forEach(el => el.classList.remove('hidden'));
        document.getElementById('menuAdminOnly').style.display = "block";
    } else {
        document.querySelectorAll('.admin-only-view').forEach(el => el.classList.add('hidden'));
        document.getElementById('menuAdminOnly').style.display = "none";
        // Force non-admins to the scores tab default
        document.querySelector('[data-tab="tab-manage-scores"]').click(); 
    }
});


// --- BULK UPLOAD STUDENTS LOGIC ---
async function processBulkStudents() {
    const fileInput = document.getElementById('bulkStudentsFile');
    const file = fileInput.files[0];
    if (!file) return alert("Select an Excel file containing Student Name and Class.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            let successCount = 0;
            for (const row of jsonData) {
                const name = row["Student Name"] || row["Name"];
                const sClass = row["Class"] || row["Class Room"];

                if (name && sClass) {
                    const uniqueCode = await generateUniqueStudentCode(); // Reusing your existing function
                    await setDoc(doc(db, "students", uniqueCode), {
                        studentName: String(name).trim(),
                        studentClass: String(sClass).trim()
                    });
                    successCount++;
                }
            }
            alert(`Bulk Student Upload Complete! Created ${successCount} new profiles.`);
            fileInput.value = "";
            loadStudentsDirectory();
            loadPointsTable();
        } catch (err) {
            alert("Error parsing student document: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- BULK UPLOAD TEACHERS LOGIC ---
async function processBulkTeachers() {
    const fileInput = document.getElementById('bulkTeachersFile');
    const file = fileInput.files[0];
    if (!file) return alert("Select an Excel file containing Email, Password, and Subject.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            let successCount = 0;
            let failCount = 0;

            for (const row of jsonData) {
                const email = String(row["Email"]).trim();
                const password = String(row["Password"]).trim();
                const subject = String(row["Subject"]).trim();

                if (email && password && subject) {
                    try {
                        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                        await setDoc(doc(db, "users", credential.user.uid), {
                            email: email,
                            role: "teacher",
                            subject: subject
                        });
                        await secondaryAuth.signOut();
                        successCount++;
                    } catch (authErr) {
                        console.error(`Failed to create ${email}:`, authErr);
                        failCount++;
                    }
                }
            }
            alert(`Teacher Upload Finished!\nSuccess: ${successCount}\nFailed (Skipped): ${failCount}`);
            fileInput.value = "";
        } catch (err) {
            alert("Error parsing teacher document: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}
async function resetStudentPoints(studentCode) {
    if (confirm(`Are you sure you want to reset all behavior points for student ${studentCode} to 0? This will permanently delete their point history.`)) {
        try {
            // Find all point records for this specific student
            const q = query(collection(db, "student_points"), where("studentCode", "==", studentCode));
            const snap = await getDocs(q);
            
            // Delete them all
            const deletePromises = [];
            snap.forEach(docSnap => {
                deletePromises.push(deleteDoc(doc(db, "student_points", docSnap.id)));
            });
            await Promise.all(deletePromises);
            
            alert("Points successfully reset to 0.");
            loadPointsTable(); // Refresh the ledger immediately
        } catch (e) {
            alert("Error resetting points: " + e.message);
        }
    }
}

// --- NEWS & NOTICE MANAGEMENT LOGIC ---

async function addNewsUpdate() {
    const title = document.getElementById('newsTitle').value.trim();
    const content = document.getElementById('newsContent').value.trim();

    if (!title || !content) {
        alert("Please provide both a title and content for the notice.");
        return;
    }

    try {
        await addDoc(collection(db, "news_updates"), {
            title: title,
            content: content,
            timestamp: new Date().toISOString()
        });
        alert("News notice posted successfully!");
        document.getElementById('newsTitle').value = "";
        document.getElementById('newsContent').value = "";
        loadNewsTable();
    } catch (e) {
        alert("Error posting news: " + e.message);
    }
}

async function loadNewsTable() {
    try {
        const querySnapshot = await getDocs(collection(db, "news_updates"));
        const tbody = document.querySelector("#newsTable tbody");
        if (!tbody) return;

        let newsList = [];
        querySnapshot.forEach((doc) => {
            newsList.push({ id: doc.id, ...doc.data() });
        });

        // Sort by newest first
        newsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        tbody.innerHTML = "";
        newsList.forEach((news) => {
            const dateStr = new Date(news.timestamp).toLocaleDateString();
            tbody.innerHTML += `<tr>
                <td>${dateStr}</td>
                <td><strong>${news.title}</strong></td>
                <td><button class="delete-btn" onclick="deleteNewsUpdate('${news.id}')">Delete</button></td>
            </tr>`;
        });
    } catch (e) {
        console.error("Error loading news table: ", e);
    }
}

async function deleteNewsUpdate(docId) {
    if (confirm("Are you sure you want to permanently delete this notice?")) {
        try {
            await deleteDoc(doc(db, "news_updates", docId));
            loadNewsTable();
        } catch (e) {
            alert("Error deleting notice: " + e.message);
        }
    }
}

// Bind the new bulk upload buttons
document.getElementById('uploadBulkStudentsBtn').addEventListener('click', processBulkStudents);
document.getElementById('uploadBulkTeachersBtn').addEventListener('click', processBulkTeachers);
document.getElementById('sortStudents')?.addEventListener('change', loadStudentsDirectory);
document.getElementById('sortScores')?.addEventListener('change', loadAdminTable);
document.getElementById('sortPoints')?.addEventListener('change', loadPointsTable);
document.getElementById('postNewsBtn').addEventListener('click', addNewsUpdate);
window.deleteNewsUpdate = deleteNewsUpdate;