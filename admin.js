import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
                loadNewsTable();
                updateDashboardStats();
                
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

// Global variable to store student data for fast searching/sorting
let allStudentsData = [];

// 1. Function to fetch data and build the filter dropdown
async function loadStudentsDirectory() {
    try {
        const querySnapshot = await getDocs(collection(db, "students"));
        allStudentsData = [];
        const classesSet = new Set(); // To collect unique class names automatically

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            allStudentsData.push({ id: doc.id, ...data });
            
            // IMPORTANT: Make sure 'data.studentClass' matches your exact Firebase field!
            if (data.studentClass) { 
                classesSet.add(data.studentClass);
            }
        });

        // Populate the filter dropdown with unique classes
        const filterDropdown = document.getElementById('filterClass');
        filterDropdown.innerHTML = '<option value="all">All Classes</option>';
        
        Array.from(classesSet).sort().forEach(className => {
            filterDropdown.innerHTML += `<option value="${className}">${className}</option>`;
        });

        renderStudentsTable();
    } catch (error) {
        console.error("Error loading students:", error);
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
        const filterDropdown = document.getElementById('filterScoreClass');
        if (filterDropdown) {
            const currentFilter = filterDropdown.value;
            const uniqueClasses = [...new Set(scoresList.map(item => item.sClass))].filter(c => c !== 'N/A').sort();
            
            // Rebuild dropdown options dynamically
            filterDropdown.innerHTML = '<option value="all">All Classes</option>';
            uniqueClasses.forEach(c => {
                filterDropdown.innerHTML += `<option value="${c}">${c}</option>`;
            });
            
            // Restore selection and apply filter
            if (uniqueClasses.includes(currentFilter)) {
                filterDropdown.value = currentFilter;
                scoresList = scoresList.filter(item => item.sClass === currentFilter);
            } else {
                filterDropdown.value = 'all';
            }
        }
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
        const filterDropdown = document.getElementById('filterPointsClass');
        if (filterDropdown) {
            const currentFilter = filterDropdown.value;
            const uniqueClasses = [...new Set(pointsList.map(item => item.sClass))].filter(c => c !== 'N/A').sort();
            
            filterDropdown.innerHTML = '<option value="all">All Classes</option>';
            uniqueClasses.forEach(c => {
                filterDropdown.innerHTML += `<option value="${c}">${c}</option>`;
            });
            
            if (uniqueClasses.includes(currentFilter)) {
                filterDropdown.value = currentFilter;
                pointsList = pointsList.filter(item => item.sClass === currentFilter);
            } else {
                filterDropdown.value = 'all';
            }
        }
        const tbody = document.querySelector("#pointsTable tbody");
        if(tbody) {
            tbody.innerHTML = "";
            pointsList.forEach(info => {
                const color = info.total > 0 ? '#28a745' : (info.total < 0 ? '#dc3545' : '#333');
                const sign = info.total > 0 ? '+' : '';
                
                tbody.innerHTML += `<tr>
                    <td><strong>${info.code}</strong></td>
                    <td>${info.name}</td>
                    <td><strong>${info.sClass}</strong></td>
                    <td><strong style="color: ${color}; font-size: 16px;">${sign}${info.total}</strong></td>
                    <td style="white-space: nowrap;">
                        <button class="edit-btn" style="background: #28a745; margin-right: 4px;" onclick="inlineAdjustPoint('${info.code}', 0.5)">+0.5</button>
                        <button class="edit-btn" style="background: #ffc107; color: black; margin-right: 4px;" onclick="inlineAdjustPoint('${info.code}', -0.5)">-0.5</button>
                        <button class="delete-btn" style="background: #dc3545;" onclick="resetStudentPoints('${info.code}')">Reset</button>
                    </td>
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

async function inlineAdjustPoint(studentCode, amount) {
    try {
        const studentSnap = await getDoc(doc(db, "students", studentCode));
        if (!studentSnap.exists()) return alert("Student not found.");
        
        const sData = studentSnap.data();
        const targetClass = sData.studentClass || sData.Class || sData.class || 'N/A';

        await addDoc(collection(db, "student_points"), {
            studentCode: studentCode,
            studentName: sData.studentName,
            studentClass: targetClass,
            reason: "Quick Ledger Adjustment",
            points: parseFloat(amount),
            timestamp: new Date()
        });
        
        // Refresh the table immediately to show the new total
        loadPointsTable(); 
    } catch (e) {
        alert("Error adjusting points: " + e.message);
    }
}

// Bind new function to window
window.inlineAdjustPoint = inlineAdjustPoint;

// Bind event listeners for the new Class Dropdowns
document.getElementById('filterScoreClass')?.addEventListener('change', loadAdminTable);
document.getElementById('filterPointsClass')?.addEventListener('change', loadPointsTable);

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

// --- QUIZ BUILDER & MANAGEMENT SYSTEM ---

// Helper: Convert Google Drive URLs
function convertDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? `https://lh3.googleusercontent.com/d/${match[1]}` : url;
}

let currentEditQuizId = null;

// 1. Dynamic Block Add Function (Exposed Immediately)
function addBlock(type) {
    const container = document.getElementById('quizBlocksContainer');
    if (!container) return;

    const blockDiv = document.createElement('div');
    blockDiv.className = 'quiz-block';
    blockDiv.dataset.type = type;
    blockDiv.style.cssText = "background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #ddd; position: relative;";

    let contentHtml = `<button type="button" onclick="this.parentElement.remove()" style="position: absolute; right: 8px; top: 8px; background:#dc3545; color:white; border:none; padding: 2px 6px; border-radius:4px; cursor:pointer;">X</button>`;

    if (type === 'header') {
        contentHtml += `
            <label style="color:#6c757d; font-weight:bold;">📌 Section Instruction / Header</label>
            <input type="text" class="blk-title" placeholder="e.g. Part A: Reading Comprehension">
        `;
    } else if (type === 'passage') {
        contentHtml += `
            <label style="color:#17a2b8; font-weight:bold;">📖 Reading Text / Article</label>
            <input type="text" class="blk-title" placeholder="Article Title (Optional)">
            <textarea class="blk-body" rows="4" placeholder="Paste full article here..." style="width:100%; margin: 5px 0;"></textarea>
            <input type="text" class="blk-img" placeholder="Google Drive Image URL (Optional)">
        `;
    } else if (type === 'mcq') {
        contentHtml += `
            <label style="color:#007bff; font-weight:bold;">❓ Multiple Choice Question</label>
            <input type="text" class="blk-prompt" placeholder="Question prompt..." required>
            <input type="text" class="blk-img" placeholder="Google Drive Image URL (Optional)">
            <input type="text" class="blk-opt0" placeholder="Option A" required>
            <input type="text" class="blk-opt1" placeholder="Option B" required>
            <input type="text" class="blk-opt2" placeholder="Option C" required>
            <input type="text" class="blk-opt3" placeholder="Option D" required>
            <select class="blk-correct">
                <option value="0">Correct: Option A</option>
                <option value="1">Correct: Option B</option>
                <option value="2">Correct: Option C</option>
                <option value="3">Correct: Option D</option>
            </select>
        `;
    } else if (type === 'fill') {
        contentHtml += `
            <label style="color:#e0a800; font-weight:bold;">✏️ Fill in the Blank</label>
            <input type="text" class="blk-prompt" placeholder="Prompt (use ___ for blank)..." required>
            <input type="text" class="blk-img" placeholder="Google Drive Image URL (Optional)">
            <input type="text" class="blk-answer" placeholder="Accepted answer(s) (comma-separated)" required>
        `;
    } else if (type === 'essay') {
        contentHtml += `
            <label style="color:#fd7e14; font-weight:bold;">📝 Essay Question</label>
            <input type="text" class="blk-prompt" placeholder="Essay Prompt..." required>
            <input type="text" class="blk-img" placeholder="Google Drive Image URL (Optional)">
        `;
    } else if (type === 'matching') {
        contentHtml += `
            <label style="color:#20c997; font-weight:bold;">🔗 Matching Question</label>
            <input type="text" class="blk-prompt" placeholder="Instructions..." required>
            <div class="pairs-container">
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" class="m-left" placeholder="Item (e.g. Paris)">
                    <input type="text" class="m-right" placeholder="Match (e.g. France)">
                </div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <input type="text" class="m-left" placeholder="Item (e.g. Tokyo)">
                    <input type="text" class="m-right" placeholder="Match (e.g. Japan)">
                </div>
            </div>
        `;
    }

    blockDiv.innerHTML = contentHtml;
    container.appendChild(blockDiv);
}
window.addBlock = addBlock;

// 2. Load Quizzes Table
async function loadQuizzesTable() {
    try {
        const snap = await getDocs(collection(db, "quizzes"));
        const tbody = document.querySelector("#quizTable tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const safeTitle = (data.title || '').replace(/'/g, "\\'");
            tbody.innerHTML += `<tr>
                <td><strong>${data.title}</strong></td>
                <td>${data.subject}</td>
                <td>${data.targetClass}</td>
                <td>
                    <button style="background:#17a2b8; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="viewQuizResults('${safeTitle}')">Results</button>
                    <button style="background:#ffc107; color:black; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="editQuiz('${docSnap.id}')">Edit</button>
                    <button class="delete-btn" onclick="deleteQuiz('${docSnap.id}')">Delete</button>
                </td>
            </tr>`;
        });
    } catch (e) { console.error("Error loading quizzes:", e); }
}
window.loadQuizzesTable = loadQuizzesTable;

// 3. Save or Update Quiz
async function saveQuiz() {
    const title = document.getElementById('quizTitle').value.trim();
    const targetClass = document.getElementById('quizTargetClass').value.trim();
    const subject = document.getElementById('quizSubject').value.trim();
    const blocksElements = document.querySelectorAll('.quiz-block');

    if (!title || !targetClass || blocksElements.length === 0) {
        return alert("Please fill in quiz title, class, and add at least one block.");
    }

    const items = [];
    blocksElements.forEach(el => {
        const type = el.dataset.type;
        const imgRaw = el.querySelector('.blk-img')?.value.trim() || '';
        const imgUrl = convertDriveUrl(imgRaw);

        if (type === 'header') {
            items.push({ type, text: el.querySelector('.blk-title').value.trim() });
        } else if (type === 'passage') {
            items.push({ 
                type, 
                title: el.querySelector('.blk-title').value.trim(), 
                text: el.querySelector('.blk-body').value.trim(),
                imageUrl: imgUrl
            });
        } else if (type === 'mcq') {
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').value.trim(),
                imageUrl: imgUrl,
                options: [
                    el.querySelector('.blk-opt0').value.trim(),
                    el.querySelector('.blk-opt1').value.trim(),
                    el.querySelector('.blk-opt2').value.trim(),
                    el.querySelector('.blk-opt3').value.trim()
                ],
                correct: parseInt(el.querySelector('.blk-correct').value)
            });
        } else if (type === 'fill') {
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').value.trim(),
                imageUrl: imgUrl,
                answers: el.querySelector('.blk-answer').value.trim().toLowerCase().split(',').map(a => a.trim())
            });
        } else if (type === 'essay') {
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').value.trim(),
                imageUrl: imgUrl
            });
        } else if (type === 'matching') {
            const lefts = Array.from(el.querySelectorAll('.m-left')).map(i => i.value.trim());
            const rights = Array.from(el.querySelectorAll('.m-right')).map(i => i.value.trim());
            items.push({ type, prompt: el.querySelector('.blk-prompt').value.trim(), lefts, rights });
        }
    });

    try {
        if (currentEditQuizId) {
            await updateDoc(doc(db, "quizzes", currentEditQuizId), {
                title, targetClass, subject, items, updatedAt: new Date().toISOString()
            });
            alert("Quiz updated successfully!");
            currentEditQuizId = null;
            const saveBtn = document.getElementById('saveQuizBtn');
            if (saveBtn) {
                saveBtn.innerText = "Publish Quiz";
                saveBtn.style.background = "#28a745";
            }
        } else {
            await addDoc(collection(db, "quizzes"), {
                title, targetClass, subject, items, createdAt: new Date().toISOString()
            });
            alert("Quiz published successfully!");
        }

        document.getElementById('quizBlocksContainer').innerHTML = "";
        document.getElementById('quizTitle').value = "";
        loadQuizzesTable();
    } catch (e) { alert("Error saving quiz: " + e.message); }
}

// 4. Edit Quiz
async function editQuiz(id) {
    try {
        const snap = await getDoc(doc(db, "quizzes", id));
        if (!snap.exists()) return alert("Quiz missing.");
        const quiz = snap.data();

        currentEditQuizId = id;
        document.getElementById('quizTitle').value = quiz.title;
        document.getElementById('quizTargetClass').value = quiz.targetClass;
        document.getElementById('quizSubject').value = quiz.subject;

        const container = document.getElementById('quizBlocksContainer');
        container.innerHTML = "";

        (quiz.items || quiz.questions || []).forEach(item => {
            const type = item.type || 'mcq';
            addBlock(type);
            const block = container.lastElementChild;

            if (type === 'header') {
                block.querySelector('.blk-title').value = item.text || '';
            } else if (type === 'passage') {
                block.querySelector('.blk-title').value = item.title || '';
                block.querySelector('.blk-body').value = item.text || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
            } else if (type === 'mcq') {
                block.querySelector('.blk-prompt').value = item.prompt || item.question || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
                if (item.options) {
                    block.querySelector('.blk-opt0').value = item.options[0] || '';
                    block.querySelector('.blk-opt1').value = item.options[1] || '';
                    block.querySelector('.blk-opt2').value = item.options[2] || '';
                    block.querySelector('.blk-opt3').value = item.options[3] || '';
                }
                if (block.querySelector('.blk-correct')) block.querySelector('.blk-correct').value = item.correct ?? 0;
            } else if (type === 'fill') {
                block.querySelector('.blk-prompt').value = item.prompt || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
                if (item.answers) block.querySelector('.blk-answer').value = item.answers.join(', ');
            } else if (type === 'essay') {
                block.querySelector('.blk-prompt').value = item.prompt || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
            } else if (type === 'matching') {
                block.querySelector('.blk-prompt').value = item.prompt || '';
                const leftInputs = block.querySelectorAll('.m-left');
                const rightInputs = block.querySelectorAll('.m-right');
                item.lefts?.forEach((l, i) => { if (leftInputs[i]) leftInputs[i].value = l; });
                item.rights?.forEach((r, i) => { if (rightInputs[i]) rightInputs[i].value = r; });
            }
        });

        const saveBtn = document.getElementById('saveQuizBtn');
        if (saveBtn) {
            saveBtn.innerText = "Update Quiz";
            saveBtn.style.background = "#ffc107";
        }
        document.getElementById('quizTitle').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { alert("Error loading quiz: " + e.message); }
}
window.editQuiz = editQuiz;

// 5. Delete Quiz
async function deleteQuiz(id) {
    if (confirm("Are you sure you want to delete this quiz?")) {
        try {
            await deleteDoc(doc(db, "quizzes", id));
            alert("Quiz deleted successfully!");
            loadQuizzesTable();
        } catch (e) { alert("Error deleting quiz: " + e.message); }
    }
}
window.deleteQuiz = deleteQuiz;

// 6. View Results Modal
async function viewQuizResults(quizTitle) {
    const modal = document.getElementById('quizResultsModal');
    const container = document.getElementById('resultsListContainer');
    document.getElementById('modalQuizTitle').innerText = `Results: ${quizTitle}`;
    modal.style.display = 'flex';
    container.innerHTML = "Loading student submissions...";

    try {
        const q = query(collection(db, "quiz_results"), where("quizTitle", "==", quizTitle));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = "<p style='color:#6c757d;'>No students have submitted answers for this quiz yet.</p>";
            return;
        }

        let html = "";
        snap.forEach(docSnap => {
            const res = docSnap.data();
            const dateStr = res.submittedAt ? new Date(res.submittedAt).toLocaleString() : 'N/A';

            html += `
                <div style="background:#f8f9fa; border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:6px; margin-bottom:8px;">
                        <strong>${res.studentName} (${res.studentCode})</strong>
                        <span style="background:#28a745; color:white; padding:3px 8px; border-radius:12px; font-weight:bold; font-size:14px;">
                            Score: ${res.score} / ${res.totalAutoGradable || '?'}
                        </span>
                    </div>
                    <small style="color:#6c757d;">Submitted: ${dateStr}</small>
                    <details style="margin-top:8px;">
                        <summary style="cursor:pointer; font-weight:bold; color:#007bff;">View Submitted Answers</summary>
                        <div style="margin-top:8px; padding-left:10px;">
            `;

            if (res.responses && res.responses.length > 0) {
                res.responses.forEach((r, idx) => {
                    html += `
                        <div style="margin-bottom:8px;">
                            <small style="color:#495057;"><strong>Q${idx + 1}:</strong> ${r.prompt}</small><br>
                            <span style="color:#155724; background:#d4edda; padding:2px 8px; border-radius:4px; font-size:13px; display:inline-block; margin-top:2px;">
                                Answer: ${r.response || 'No answer provided'}
                            </span>
                        </div>
                    `;
                });
            } else {
                html += `<small>No detailed response data found.</small>`;
            }

            html += `</div></details></div>`;
        });

        container.innerHTML = html;
    } catch (e) { container.innerHTML = "Error loading submissions: " + e.message; }
}
function closeResultsModal() {
    document.getElementById('quizResultsModal').style.display = 'none';
}
window.viewQuizResults = viewQuizResults;
window.closeResultsModal = closeResultsModal;

// Save Button Listener
document.getElementById('saveQuizBtn')?.addEventListener('click', saveQuiz);

// Auto-load table on initial script boot
loadQuizzesTable();


// --- DASHBOARD STATISTICS CALCULATOR ---
async function updateDashboardStats() {
    try {
        // 1. Total Students
        const studentsSnap = await getDocs(collection(db, "students"));
        document.getElementById('stat-total-students').innerText = studentsSnap.size;

        // 2. Total Teachers
        const usersSnap = await getDocs(collection(db, "users"));
        let teacherCount = 0;
        usersSnap.forEach(doc => {
            if(doc.data().role === 'teacher') teacherCount++;
        });
        document.getElementById('stat-total-teachers').innerText = teacherCount;

        // 3 & 4. Highest and Lowest Behavior Points
        const studentsMap = {};
        studentsSnap.forEach(doc => {
            studentsMap[doc.id] = { name: doc.data().studentName || 'N/A', total: 0 };
        });
        
        const pointsSnap = await getDocs(collection(db, "student_points"));
        pointsSnap.forEach(doc => {
            const data = doc.data();
            if (studentsMap[data.studentCode]) {
                studentsMap[data.studentCode].total += (parseFloat(data.points) || 0);
            }
        });

        let highestName = "N/A", highestScore = -Infinity;
        let lowestName = "N/A", lowestScore = Infinity;
        let hasStudents = false;

        for (const code in studentsMap) {
            hasStudents = true;
            const student = studentsMap[code];
            if (student.total > highestScore) { highestScore = student.total; highestName = student.name; }
            if (student.total < lowestScore) { lowestScore = student.total; lowestName = student.name; }
        }

        if (hasStudents && highestScore !== -Infinity) {
            document.getElementById('stat-highest-behavior').innerText = `${highestName} (${highestScore > 0 ? '+' : ''}${highestScore})`;
            document.getElementById('stat-lowest-behavior').innerText = `${lowestName} (${lowestScore > 0 ? '+' : ''}${lowestScore})`;
        } else {
            document.getElementById('stat-highest-behavior').innerText = "N/A";
            document.getElementById('stat-lowest-behavior').innerText = "N/A";
        }

        // 5. Total News
        const newsSnap = await getDocs(collection(db, "news_updates"));
        document.getElementById('stat-total-news').innerText = newsSnap.size;

        // 6. Total Quizzes
        const quizSnap = await getDocs(collection(db, "quizzes"));
        document.getElementById('stat-total-quizzes').innerText = quizSnap.size;

    } catch (e) {
        console.error("Dashboard stats calculation error:", e);
    }
}

// 2. Function to filter, sort, and render the table with hidden codes
function renderStudentsTable() {
    const searchTerm = document.getElementById('searchStudents').value.toLowerCase();
    const sortBy = document.getElementById('sortStudents').value;
    const filterByClass = document.getElementById('filterClass').value; // Get filter value
    
    // Filter data based on search input AND class filter
    let filteredStudents = allStudentsData.filter(s => {
        // IMPORTANT: Make sure 's.class' matches your exact Firebase field!
        const matchesSearch = (s.studentName && s.studentName.toLowerCase().includes(searchTerm)) ||
                              (s.studentClass && s.studentClass.toLowerCase().includes(searchTerm)) || 
                              (s.id && s.id.toLowerCase().includes(searchTerm));
                              
        const matchesClass = (filterByClass === 'all') || (s.studentClass === filterByClass);

        return matchesSearch && matchesClass;
    });

    // Sort data
    filteredStudents.sort((a, b) => {
        // IMPORTANT: Make sure 'a.studentClass' and 'b.studentClass' match your exact Firebase field!
        if (sortBy === 'name') return (a.studentName || '').localeCompare(b.studentName || '');
        if (sortBy === 'class') return (a.studentClass || '').localeCompare(b.studentClass || '');
        return (a.id || '').localeCompare(b.id || ''); 
    });

    // Render HTML
    const tbody = document.querySelector('#studentsTable tbody');
    tbody.innerHTML = '';
    
    filteredStudents.forEach(student => {
        tbody.innerHTML += `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <!-- Code masked by default with letter-spacing for styling -->
                        <span id="code-${student.id}" style="font-weight: 600; letter-spacing: 2px;">•••••</span>
                        
                        <!-- Eye Button SVG -->
                        <button class="eye-btn" onclick="toggleCodeVisibility('${student.id}')" title="Show/Hide Code">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                                <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td>${student.studentName}</td>
                
                <!-- IMPORTANT: Make sure 'student.studentClass' matches your exact Firebase field! -->
                <td><span style="color:var(--primary-blue); font-weight:600;">${student.studentClass || 'N/A'}</span></td>
                
                <td>
                    <div class="kebab-menu">
                        <button class="kebab-btn" onclick="toggleMenu(event, '${student.id}')">⋮</button>
                        <div id="menu-${student.id}" class="dropdown-menu">
                            <button class="dropdown-item" onclick="editStudent('${student.id}')">Edit Student</button>
                            <button class="dropdown-item" onclick="generateNewUniqueCode('${student.id}')">Generate New Code</button>
                            <button class="dropdown-item danger" onclick="deleteStudent('${student.id}')">Delete Student</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
}

// 3. New Event Listener for the Class Filter
document.getElementById('filterClass').addEventListener('change', renderStudentsTable);

// (Keep your existing search and sort listeners here)
document.getElementById('searchStudents').addEventListener('input', renderStudentsTable);
document.getElementById('sortStudents').addEventListener('change', renderStudentsTable);


// 4. Function to toggle the code visibility
window.toggleCodeVisibility = function(studentId) {
    const span = document.getElementById(`code-${studentId}`);
    if (!span) return;

    if (span.innerText === '•••••') {
        span.innerText = studentId; // Show real code
        span.style.letterSpacing = 'normal'; // Reset spacing
    } else {
        span.innerText = '•••••'; // Hide code
        span.style.letterSpacing = '2px'; // Add spacing for dots
    }
};

// 3. Event Listeners for Search and Sort
document.getElementById('searchStudents').addEventListener('input', renderStudentsTable);
document.getElementById('sortStudents').addEventListener('change', renderStudentsTable);

// 4. Menu Toggle Logic (Attach to window so inline HTML onclick works)
window.toggleMenu = function(event, id) {
    event.stopPropagation(); // Prevents the click from closing the menu immediately
    
    // Close all other open menus first
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu.id !== `menu-${id}`) menu.classList.remove('show');
    });
    
    // Toggle the clicked menu
    document.getElementById(`menu-${id}`).classList.toggle('show');
}

// Close dropdowns when clicking anywhere outside of them
window.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
});

// 5. Action Functions (Make sure these exist and are attached to window)
window.generateNewUniqueCode = async function(oldCode) {
    if(confirm(`Are you sure you want to generate a new code for student ${oldCode}? The old code will be disabled.`)) {
        // Add your logic here to generate a code, update the Firebase document ID/data, 
        // and delete the old document if necessary.
        // After updating Firebase:
        // loadStudentsDirectory(); 
    }

// Expose to window object for HTML onclick inline events
window.deleteQuiz = deleteQuiz;
window.viewQuizResults = viewQuizResults;
window.closeResultsModal = closeResultsModal;
window.editQuiz = editQuiz;

document.getElementById('saveQuizBtn')?.addEventListener('click', saveQuiz);
window.deleteQuiz = deleteQuiz;
document.getElementById('addQuestionBtn')?.addEventListener('click', addQuestionField);
document.getElementById('saveQuizBtn')?.addEventListener('click', saveQuiz);

// Bind the new function to the window so the HTML buttons can trigger it
window.inlineAdjustPoint = inlineAdjustPoint;

// Bind the new bulk upload buttons
document.getElementById('uploadBulkStudentsBtn').addEventListener('click', processBulkStudents);
document.getElementById('uploadBulkTeachersBtn').addEventListener('click', processBulkTeachers);
document.getElementById('sortStudents')?.addEventListener('change', loadStudentsDirectory);
document.getElementById('sortScores')?.addEventListener('change', loadAdminTable);
document.getElementById('sortPoints')?.addEventListener('change', loadPointsTable);
document.getElementById('postNewsBtn').addEventListener('click', addNewsUpdate);
window.deleteNewsUpdate = deleteNewsUpdate;
}