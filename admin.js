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
                
                if (subjectInput) {
                    subjectInput.disabled = false;
                    subjectInput.value = "";
                    subjectInput.placeholder = "Subject Name (e.g. English)";
                }
                if (tableTitle) {
                    tableTitle.innerText = "Master Registry Ledger - All Subjects & Classes";
                }
                if (welcomeTitle) {
                    welcomeTitle.innerText = "Administrator Master System Workspace";
                }
                loadStudentsDirectory();
                loadNewsTable();
                updateDashboardStats();

                if (typeof window.loadSystemDatabases === "function") {
                    window.loadSystemDatabases();
                }

            } else {
                // NEW: Hide admin views for teachers
                document.querySelectorAll('.admin-only-view').forEach(el => el.classList.add('hidden'));
                document.getElementById('menuAdminOnly').style.display = "none";
                document.querySelector('[data-tab="tab-manage-scores"]').click(); // Force teacher to scores tab
                
                if (subjectInput) {
                        subjectInput.value = teacherSubject;
                        subjectInput.disabled = true; 
                    }
                if (tableTitle) {
                    tableTitle.innerText = `Departmental Performance Ledger: ${teacherSubject}`;
                }
                if (welcomeTitle) {
                    welcomeTitle.innerText = `Teacher Portal Workspace (${teacherSubject})`;
                }
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
    const studentNameInput = document.getElementById('pointStudentName').value.trim();
    const reason = document.getElementById('pointReason').value.trim();

    if (!studentNameInput || !reason || isNaN(pointValue)) {
        alert("Please ensure Student Name, Reason, and a valid point value are provided.");
        return;
    }

    try {
        // Find the student code based on the typed name
        const studentMatch = allStudentsData.find(s => s.studentName.toLowerCase() === studentNameInput.toLowerCase());
        
        if (!studentMatch) {
            alert(`Lookup Error: Student "${studentNameInput}" does not exist in the directory. Please use the autocomplete dropdown.`);
            return;
        }

        const code = studentMatch.id;
        const targetClass = studentMatch.studentClass || studentMatch.Class || studentMatch.class || 'N/A';

        await addDoc(collection(db, "student_points"), {
            studentCode: code,
            studentName: studentMatch.studentName,
            studentClass: targetClass,
            reason: reason,
            points: parseFloat(pointValue),
            timestamp: new Date()
        });

        const sign = pointValue > 0 ? '+' : '';
        alert(`Successfully recorded ${sign}${pointValue} points for ${studentMatch.studentName}.`);
        
        // Reset the form inputs
        document.getElementById('pointStudentName').value = "";
        document.getElementById('pointReason').value = "";
        document.getElementById('customPointValue').value = "";
        
        // Refresh ledgers
        loadPointsTable(); 
        refreshBehaviorTabLedgers();
        
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
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span id="pt-code-${info.code}" style="font-weight: 600; letter-spacing: 2px;">•••••</span>
                            <button class="eye-btn" onclick="togglePtCodeVisibility('${info.code}')" title="Show/Hide Code">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                                    <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                    <td>${info.name}</td>
                    <td><strong>${info.sClass}</strong></td>
                    <td><strong style="color: ${color}; font-size: 16px;">${sign}${info.total}</strong></td>
                    <td>
                        <div class="kebab-menu">
                            <button class="kebab-btn" onclick="toggleMenu(event, 'pt-${info.code}')">⋮</button>
                            <div id="menu-pt-${info.code}" class="dropdown-menu">
                                <button class="dropdown-item" onclick="openPointModal('${info.code}', '${info.name.replace(/'/g, "\\'")}')">Add / Subtract Point</button>
                                <button class="dropdown-item danger" onclick="resetStudentPoints('${info.code}')">Reset Points</button>
                            </div>
                        </div>
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
document.getElementById('saveScoreBtn')?.addEventListener('click', addStudentScore);
document.getElementById('uploadExcelBtn')?.addEventListener('click', processExcel);


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
let currentEditNewsId = null;

async function addNewsUpdate() {
    const title = document.getElementById('newsTitle').value.trim();
    const content = document.getElementById('newsContent').value.trim();

    if (!title || !content) {
        alert("Please provide both a title and content for the notice.");
        return;
    }

    try {
        if (currentEditNewsId) {
            // Update existing notice
            await updateDoc(doc(db, "news_updates", currentEditNewsId), {
                title: title,
                content: content
            });
            alert("Notice updated successfully!");
            
            // Reset form UI
            currentEditNewsId = null;
            document.getElementById('postNewsBtn').innerText = "Post Notice";
            document.getElementById('postNewsBtn').style.background = "var(--primary-blue)";
            document.getElementById('newsFormTitle').innerText = "Post News / Notice";
        } else {
            // Create new notice
            await addDoc(collection(db, "news_updates"), {
                title: title,
                content: content,
                status: 'active', // Added status tracker
                timestamp: new Date().toISOString()
            });
            alert("News notice posted successfully!");
        }
        
        document.getElementById('newsTitle').value = "";
        document.getElementById('newsContent').value = "";
        loadNewsTable();
        updateDashboardStats();
    } catch (e) {
        alert("Error saving news: " + e.message);
    }
}

async function loadNewsTable() {
    try {
        const querySnapshot = await getDocs(collection(db, "news_updates"));
        
        const dashboardContainer = document.getElementById("dashboard-news-container");
        const manageTbody = document.querySelector("#manageNewsTable tbody");
        
        if (dashboardContainer) dashboardContainer.innerHTML = "";
        if (manageTbody) manageTbody.innerHTML = "";

        let newsList = [];
        querySnapshot.forEach((doc) => {
            newsList.push({ id: doc.id, ...doc.data() });
        });

        // Sort by newest first
        newsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        let activeCount = 0;

        newsList.forEach((news) => {
            const dateObj = new Date(news.timestamp);
            const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
            const day = dateObj.getDate();
            const dateStr = dateObj.toLocaleDateString();
            const status = news.status || 'active';

            // Escape single and double quotes safely for inline HTML handlers
            const safeTitle = (news.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeContent = (news.content || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // 1. Populate Manage News Table (Shows kebab menu)
            if (manageTbody) {
                const badgeBg = status === 'active' ? '#ecfdf5' : '#f1f5f9';
                const badgeText = status === 'active' ? '#10b981' : '#64748b';
                
                manageTbody.innerHTML += `<tr>
                    <td>${dateStr}</td>
                    <td><strong>${news.title}</strong></td>
                    <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; background: ${badgeBg}; color: ${badgeText};">${status.toUpperCase()}</span></td>
                    <td>
                        <div class="kebab-menu">
                            <button class="kebab-btn" onclick="toggleMenu(event, 'news-${news.id}')">⋮</button>
                            <div id="menu-news-${news.id}" class="dropdown-menu">
                                <button class="dropdown-item" onclick="editNewsUpdate('${news.id}', '${safeTitle}', '${safeContent}')">Edit Notice</button>
                                <button class="dropdown-item" onclick="toggleArchiveNews('${news.id}', '${status}')">${status === 'active' ? 'Archive' : 'Unarchive'}</button>
                                <button class="dropdown-item danger" onclick="deleteNewsUpdate('${news.id}')">Delete Notice</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }

            // 2. Populate Dashboard (Shows active notices)
            if (dashboardContainer && status === 'active' && activeCount < 3) {
                dashboardContainer.innerHTML += `
                    <div class="notice-item">
                        <div class="notice-date">${month}<br>${day}</div>
                        <div class="notice-content">
                            <h4>${news.title}</h4>
                            <p>${news.content}</p>
                        </div>
                    </div>
                `;
                activeCount++;
            }
        });
        
        if (dashboardContainer && dashboardContainer.innerHTML === "") {
            dashboardContainer.innerHTML = "<p style='color: var(--text-gray); font-size: 13px; text-align: center; padding: 20px 0;'>No active notices at the moment.</p>";
        }

    } catch (e) {
        console.error("Error loading news: ", e);
    }
}

async function deleteNewsUpdate(docId) {
    if (confirm("Are you sure you want to permanently delete this notice?")) {
        try {
            await deleteDoc(doc(db, "news_updates", docId));
            loadNewsTable();
            updateDashboardStats(); 
        } catch (e) {
            alert("Error deleting notice: " + e.message);
        }
    }
}

async function toggleArchiveNews(docId, currentStatus) {
    try {
        const newStatus = currentStatus === 'active' ? 'archived' : 'active';
        await updateDoc(doc(db, "news_updates", docId), {
            status: newStatus
        });
        loadNewsTable();
    } catch (e) {
        alert("Error updating status: " + e.message);
    }
}

// Window bindings for inline HTML clicks
window.editNewsUpdate = function(id, title, content) {
    currentEditNewsId = id;
    document.getElementById('newsTitle').value = title;
    document.getElementById('newsContent').value = content;
    
    document.getElementById('newsFormTitle').innerText = "Edit Notice";
    const btn = document.getElementById('postNewsBtn');
    btn.innerText = "Update Notice";
    btn.style.background = "#f59e0b"; 
};

window.toggleArchiveNews = toggleArchiveNews;
window.deleteNewsUpdate = deleteNewsUpdate;

// --- QUIZ BUILDER & MANAGEMENT SYSTEM ---

// Helper: Convert Google Drive URLs
function convertDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? `https://lh3.googleusercontent.com/d/${match[1]}` : url;
}

let currentEditQuizId = null;

document.getElementById('gform-main-title')?.addEventListener('input', function(e) {
    document.getElementById('quizTitle').value = e.target.value;
});
document.getElementById('quizTitle')?.addEventListener('input', function(e) {
    document.getElementById('gform-main-title').value = e.target.value;
});

// Global card activation function for inline HTML clicks and module calls
window.activateCard = function(element) {
    if (!element) return;
    
    // Remove active state from all cards
    document.querySelectorAll('.gform-card').forEach(c => c.classList.remove('active-card'));
    
    // Add active state to selected card
    element.classList.add('active-card');
    
    // Move floating sidebar toolbar next to active card
    const toolbar = document.getElementById('floatingToolbar');
    if (toolbar) toolbar.style.top = element.offsetTop + 'px';

    // Relocate the Rich Text formatting toolbar inside the active card container
    const rtContainer = element.querySelector('.rt-toolbar-container');
    const rtToolbar = document.getElementById('globalRichTextToolbar');
    if (rtContainer && rtToolbar) {
        rtContainer.appendChild(rtToolbar);
    }
};

// Internal reference for admin.js function calls
const activateCard = window.activateCard;
// Main function to create new blocks
function addBlock(type) {
    const container = document.getElementById('quizBlocksContainer');
    if (!container) return;

    blockCounter++;
    const blockId = 'block_' + blockCounter;

    const blockDiv = document.createElement('div');
    blockDiv.className = 'gform-card quiz-block'; 
    blockDiv.dataset.type = type;
    blockDiv.dataset.blockId = blockId;
    blockDiv.setAttribute('onclick', 'activateCard(this)');

    blockDiv.innerHTML = getBlockInnerHtml(type, blockId);
    container.appendChild(blockDiv);
    activateCard(blockDiv);
    return blockDiv;
}

let blockCounter = 0; // Tracks unique IDs for radio buttons

// Helper to generate the dynamic type select menu
function getTypeSelectHtml(currentType) {
    return `
        <select class="gform-type-select" onchange="switchBlockType(this)">
            <option value="mcq" ${currentType === 'mcq' ? 'selected' : ''}>🔘 Multiple choice</option>
            <option value="fill" ${currentType === 'fill' ? 'selected' : ''}>📝 Fill in the blank</option>
            <option value="essay" ${currentType === 'essay' ? 'selected' : ''}>📄 Essay / Paragraph</option>
        </select>
    `;
}

// Generates the inner HTML template for a given block type
function getBlockInnerHtml(type, blockId) {
    const mediaAndPointsHtml = `
        <div style="display: flex; gap: 10px; margin-top: 15px; margin-bottom: 15px;">
            <input type="text" class="gform-opt-input blk-img" placeholder="Optional: Google Drive Image URL" style="flex: 1; border: 1px solid #dadce0; padding: 8px; border-radius: 4px; font-size: 13px;">
            <div style="display: flex; align-items: center; gap: 8px; background: #f8fafc; padding: 0 10px; border-radius: 4px; border: 1px solid #dadce0;">
                <label style="font-size: 13px; font-weight: bold; color: #5f6368; margin: 0;">Points:</label>
                <input type="number" class="blk-points" value="1" min="0" style="width: 50px; border: none; background: transparent; font-size: 14px; text-align: center; outline: none;">
            </div>
        </div>
    `;

    if (type === 'mcq') {
        return `
            <div style="text-align: center; color: #dadce0; cursor: grab; margin-top: -15px; margin-bottom: 5px;">⋮⋮</div>
            <div class="rt-toolbar-container"></div>
            
            <div class="gform-question-header">
                <div class="gform-q-input blk-prompt" contenteditable="true" data-placeholder="Question"></div>
                ${getTypeSelectHtml('mcq')}
            </div>
            
            ${mediaAndPointsHtml}
            
            <div class="options-container">
                ${[1, 2, 3, 4].map((num, i) => `
                    <div class="gform-opt-row">
                        <input type="radio" name="${blockId}_correct" value="${i}" onchange="this.closest('.quiz-block').querySelector('.blk-correct').value = this.value" ${i === 0 ? 'checked' : ''} title="Mark as correct answer">
                        <input type="text" class="gform-opt-input blk-opt${i}" placeholder="Option ${num}" required>
                        <button class="icon-btn delete" onclick="this.closest('.gform-opt-row').remove()">✖</button>
                    </div>
                `).join('')}
            </div>
            
            <input type="hidden" class="blk-correct" value="0">
            
            <div class="gform-opt-row" style="margin-top: 8px;">
                <input type="radio" disabled>
                <span class="gform-add-opt" onclick="addOptionToMCQ(this, '${blockId}')" style="color: #1a73e8; cursor:pointer; font-weight: 500;">Add option</span>
            </div>

            <div class="gform-card-footer">
                <button class="icon-btn delete" title="Delete" onclick="this.closest('.gform-card').remove()">🗑️</button>
            </div>
        `;
    } else if (type === 'fill') {
        return `
            <div style="text-align: center; color: #dadce0; cursor: grab; margin-top: -15px; margin-bottom: 5px;">⋮⋮</div>
            <div class="rt-toolbar-container"></div>
            
            <div class="gform-question-header">
                <div class="gform-q-input blk-prompt" contenteditable="true" data-placeholder="Question (e.g., The capital of France is ___)"></div>
                ${getTypeSelectHtml('fill')}
            </div>
            
            ${mediaAndPointsHtml}
            
            <div style="margin-top: 15px;">
                <input type="text" class="gform-opt-input blk-answer" placeholder="Correct Answer(s) separated by commas" style="width: 100%; border: 1px solid #dadce0; padding: 10px; border-radius: 4px; box-sizing: border-box;">
                <small style="color: #70757a; display: block; margin-top: 5px;">Separate multiple acceptable variations with commas (e.g., Paris, paris)</small>
            </div>
            
            <div class="gform-card-footer">
                <button class="icon-btn delete" title="Delete" onclick="this.closest('.gform-card').remove()">🗑️</button>
            </div>
        `;
    } else if (type === 'essay') {
        return `
            <div style="text-align: center; color: #dadce0; cursor: grab; margin-top: -15px; margin-bottom: 5px;">⋮⋮</div>
            <div class="rt-toolbar-container"></div>
            
            <div class="gform-question-header">
                <div class="gform-q-input blk-prompt" contenteditable="true" data-placeholder="Essay Question Prompt"></div>
                ${getTypeSelectHtml('essay')}
            </div>
            
            ${mediaAndPointsHtml}
            
            <div style="margin-top: 15px;">
                <textarea disabled placeholder="Long answer text will be written here by the student" style="width: 100%; border: 1px dotted #dadce0; padding: 10px; border-radius: 4px; background: #f8fafc; resize: none; box-sizing: border-box;"></textarea>
            </div>
            
            <div class="gform-card-footer">
                <button class="icon-btn delete" title="Delete" onclick="this.closest('.gform-card').remove()">🗑️</button>
            </div>
        `;
    } else if (type === 'header') {
        return `
            <div style="text-align: center; color: #dadce0; cursor: grab; margin-top: -15px; margin-bottom: 5px;">⋮⋮</div>
            <div class="rt-toolbar-container"></div>
            <div class="gform-question-header">
                <div class="gform-q-input blk-prompt" contenteditable="true" data-placeholder="Header / Section Title" style="font-size: 20px; font-weight: 500; background: transparent; border-bottom: 2px solid #673ab7;"></div>
            </div>
            <div class="gform-question-header">
                <div class="gform-desc-input blk-desc" contenteditable="true" data-placeholder="Description (Optional)" style="font-size: 14px; width: 100%;"></div>
            </div>
            <div class="gform-card-footer">
                <button class="icon-btn delete" title="Delete" onclick="this.closest('.gform-card').remove()">🗑️</button>
            </div>
        `;
    }
}

// Function triggered when changing the dropdown option on a card
window.switchBlockType = function(selectElement) {
    const newType = selectElement.value;
    const blockDiv = selectElement.closest('.quiz-block');
    if (!blockDiv) return;

    // Save current user-typed values before switching layout
    const promptNode = blockDiv.querySelector('.blk-prompt');
    const savedPrompt = promptNode ? promptNode.innerText : '';
    
    const imgNode = blockDiv.querySelector('.blk-img');
    const savedImg = imgNode ? imgNode.value : '';

    const pointsNode = blockDiv.querySelector('.blk-points');
    const savedPoints = pointsNode ? pointsNode.value : '1';

    let blockId = blockDiv.dataset.blockId;
    if (!blockId) {
        blockCounter++;
        blockId = 'block_' + blockCounter;
        blockDiv.dataset.blockId = blockId;
    }

    // Update block type metadata
    blockDiv.dataset.type = newType;

    // Re-render block internal HTML
    blockDiv.innerHTML = getBlockInnerHtml(newType, blockId);

    // Restore saved question text, image URL, and points
    const newPromptNode = blockDiv.querySelector('.blk-prompt');
    if (newPromptNode) newPromptNode.innerText = savedPrompt;

    const newImgNode = blockDiv.querySelector('.blk-img');
    if (newImgNode) newImgNode.value = savedImg;

    const newPointsNode = blockDiv.querySelector('.blk-points');
    if (newPointsNode) newPointsNode.value = savedPoints;

    // Re-attach rich text toolbar
    activateCard(blockDiv);
};

// Sync Title logic (updated for innerText instead of value)
document.getElementById('gform-main-title')?.addEventListener('input', function(e) {
    document.getElementById('quizTitle').value = e.target.innerText;
});
document.getElementById('quizTitle')?.addEventListener('input', function(e) {
    document.getElementById('gform-main-title').innerText = e.target.value;
});

// --- Quiz UI Toggles (Landing vs Builder) ---
window.openQuizBuilder = function(isNew = true) {
    document.getElementById('quiz-landing-view').classList.add('hidden');
    document.getElementById('quiz-builder-view').classList.remove('hidden');
    
    if (isNew) {
        currentEditQuizId = null; 
        document.getElementById('quizTitle').value = "Untitled Quiz";
        document.getElementById('quizTargetClass').value = "";
        document.getElementById('quizSubject').value = "";
        document.getElementById('quizBlocksContainer').innerHTML = "";
        addBlock('mcq');
        
        const mainTitle = document.getElementById('gform-main-title');
        if (mainTitle) mainTitle.innerText = "Untitled Quiz";
        
        const saveBtn = document.getElementById('saveQuizBtn');
        if (saveBtn) {
            saveBtn.innerText = "Publish";
        }

        // Initialize toolbar position
        const titleCard = document.querySelector('.title-card');
        if(titleCard) activateCard(titleCard);
    }
}

window.closeQuizBuilder = function() {
    document.getElementById('quiz-builder-view').classList.add('hidden');
    document.getElementById('quiz-landing-view').classList.remove('hidden');
    loadQuizzesTable(); // Refresh the table when going back
}

// Dynamically update the header title as you type the quiz name
document.getElementById('quizTitle')?.addEventListener('input', function(e) {
    const display = document.getElementById('displayQuizTitle');
    if(display) {
        display.innerText = e.target.value || "New Untitled Quiz";
    }
});

window.addBlock = addBlock;

// --- 2. UPDATED QUIZ TABLE RENDERING WITH STATUS BADGE & MENU ---
// --- TOGGLE QUIZ STATUS (ACTIVE / DEACTIVE) ---
async function toggleQuizStatus(id, currentStatus) {
    try {
        const newStatus = currentStatus === 'active' ? 'deactive' : 'active';
        await updateDoc(doc(db, "quizzes", id), {
            status: newStatus
        });
        loadQuizzesTable();
    } catch (e) {
        alert("Error toggling quiz status: " + e.message);
    }
}
window.toggleQuizStatus = toggleQuizStatus;

// --- LOAD QUIZZES TABLE WITH FULL KEBAB MENU OPTIONS ---
async function loadQuizzesTable() {
    try {
        const snap = await getDocs(collection(db, "quizzes"));
        const tbody = document.querySelector("#quizTable tbody");
        if (!tbody) return;
        tbody.innerHTML = "";

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const safeTitle = (data.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const status = data.status || 'active';

            const badgeBg = status === 'active' ? '#ecfdf5' : '#f1f5f9';
            const badgeText = status === 'active' ? '#10b981' : '#64748b';
            const toggleLabel = status === 'active' ? 'Deactivate Quiz' : 'Activate Quiz';

            tbody.innerHTML += `<tr>
                <td><strong>${data.title}</strong></td>
                <td>${data.subject || '-'}</td>
                <td>${data.targetClass || '-'}</td>
                <td>
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; background: ${badgeBg}; color: ${badgeText};">
                        ${status.toUpperCase()}
                    </span>
                </td>
                <td>
                    <div class="kebab-menu">
                        <button class="kebab-btn" onclick="toggleMenu(event, 'quiz-${docSnap.id}')">⋮</button>
                        <div id="menu-quiz-${docSnap.id}" class="dropdown-menu">
                            <button class="dropdown-item" onclick="viewQuizResults('${safeTitle}')">View Results</button>
                            <button class="dropdown-item" onclick="toggleQuizStatus('${docSnap.id}', '${status}')">${toggleLabel}</button>
                            <button class="dropdown-item" onclick="editQuiz('${docSnap.id}')">Edit Quiz</button>
                            <button class="dropdown-item danger" onclick="deleteQuiz('${docSnap.id}')">Delete Quiz</button>
                        </div>
                    </div>
                </td>
            </tr>`;
        });
    } catch (e) { 
        console.error("Error loading quizzes:", e); 
    }
}
window.loadQuizzesTable = loadQuizzesTable;


// --- UPDATED EDIT QUIZ ---
async function editQuiz(id) {
    try {
        const snap = await getDoc(doc(db, "quizzes", id));
        if (!snap.exists()) return alert("Quiz missing.");
        const quiz = snap.data();

        openQuizBuilder(false); 
        
        const displayQuizTitle = document.getElementById('displayQuizTitle');
        if (displayQuizTitle) displayQuizTitle.innerText = quiz.title || "Untitled";
        
        const mainTitle = document.getElementById('gform-main-title');
        if (mainTitle) mainTitle.innerText = quiz.title || "Untitled";

        currentEditQuizId = id;
        document.getElementById('quizTitle').value = quiz.title || "";
        document.getElementById('quizTargetClass').value = quiz.targetClass || "";
        document.getElementById('quizSubject').value = quiz.subject || "";

        const container = document.getElementById('quizBlocksContainer');
        container.innerHTML = "";

        (quiz.items || quiz.questions || []).forEach((item, index) => {
            const type = item.type || 'mcq';
            const block = addBlock(type); // addBlock now returns the block element

            if (type === 'header') {
                const promptNode = block.querySelector('.blk-prompt');
                const descNode = block.querySelector('.blk-desc');
                if (promptNode) promptNode.innerText = item.text || '';
                if (descNode) descNode.innerText = item.description || '';
                
            } else if (type === 'mcq') {
                const promptNode = block.querySelector('.blk-prompt');
                if (promptNode) promptNode.innerText = item.prompt || item.question || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
                if (block.querySelector('.blk-points')) block.querySelector('.blk-points').value = item.points || 1;
                
                // Clear the default options and rebuild based on saved data
                const optionsContainer = block.querySelector('.options-container');
                if (optionsContainer) {
                    optionsContainer.innerHTML = '';
                    (item.options || []).forEach((optText, i) => {
                        const newRow = document.createElement('div');
                        newRow.className = 'gform-opt-row';
                        const isChecked = item.correct == i ? 'checked' : '';
                        newRow.innerHTML = `
                            <input type="radio" name="edit_block_${index}_correct" value="${i}" onchange="this.closest('.quiz-block').querySelector('.blk-correct').value = this.value" ${isChecked}>
                            <input type="text" class="gform-opt-input" value="${optText}" required>
                            <button class="icon-btn delete" onclick="this.closest('.gform-opt-row').remove()">✖</button>
                        `;
                        optionsContainer.appendChild(newRow);
                    });
                }
                if (block.querySelector('.blk-correct')) block.querySelector('.blk-correct').value = item.correct ?? 0;
                
            } else if (type === 'fill') {
                const promptNode = block.querySelector('.blk-prompt');
                if (promptNode) promptNode.innerText = item.prompt || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
                if (block.querySelector('.blk-points')) block.querySelector('.blk-points').value = item.points || 1;
                if (item.answers && block.querySelector('.blk-answer')) block.querySelector('.blk-answer').value = item.answers.join(', ');
                
            } else if (type === 'essay') {
                const promptNode = block.querySelector('.blk-prompt');
                if (promptNode) promptNode.innerText = item.prompt || '';
                if (block.querySelector('.blk-img')) block.querySelector('.blk-img').value = item.imageUrl || '';
                if (block.querySelector('.blk-points')) block.querySelector('.blk-points').value = item.points || 1;
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

// 1. Updated viewQuizResults with "Check" button added in the Action column
window.viewQuizResults = async function(quizTitle) {
    const modal = document.getElementById("quizResultsModal") || createQuizResultsModal();
    
    modal.classList.remove('hidden');
    modal.style.display = "flex";

    const tbody = modal.querySelector("#quizResultsTable tbody");
    const modalTitle = modal.querySelector("#quizResultsTitle");
    
    if (modalTitle) modalTitle.innerText = `Results & Score Submission: ${quizTitle}`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading student records...</td></tr>`;

    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        
        const scoresQuery = query(collection(db, "scores"), where("quizTitle", "==", quizTitle));
        const scoresSnap = await getDocs(scoresQuery);
        
        const existingScores = {};
        scoresSnap.forEach(docSnap => {
            const data = docSnap.data();
            existingScores[data.studentCode || docSnap.id] = data.score;
        });

        if (tbody) tbody.innerHTML = "";

        if (studentsSnap.empty) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No students found in database.</td></tr>`;
            return;
        }

        studentsSnap.forEach(docSnap => {
            const student = docSnap.data();
            const studentCode = student.code || docSnap.id;
            const studentName = student.studentName || student.name || "Unknown Student";
            const studentClass = student.studentClass || student.class || "N/A";
            const currentScore = existingScores[studentCode] !== undefined ? existingScores[studentCode] : "";

            tbody.innerHTML += `
                <tr>
                    <td><strong>${studentName}</strong> <br><small style="color: #64748b;">${studentCode}</small></td>
                    <td>${studentClass}</td>
                    <td>
                        <input 
                            type="number" 
                            id="score-input-${studentCode}" 
                            class="direct-score-input" 
                            value="${currentScore}" 
                            placeholder="0 - 100" 
                            min="0" 
                            max="100"
                            style="width: 80px; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px;"
                        >
                    </td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button 
                                class="btn-secondary" 
                                onclick="viewStudentAnswers('${studentCode}', '${studentName.replace(/'/g, "\\'")}', '${quizTitle.replace(/'/g, "\\'")}')"
                                style="padding: 6px 10px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;"
                            >
                                Check
                            </button>
                            <button 
                                class="btn-primary" 
                                onclick="saveDirectScore('${studentCode}', '${studentName.replace(/'/g, "\\'")}', '${studentClass}', '${quizTitle.replace(/'/g, "\\'")}')"
                                style="padding: 6px 10px; font-size: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer;"
                            >
                                Save
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error loading quiz results:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading data.</td></tr>`;
    }
};

window.viewStudentAnswers = async function(studentCode, studentName, quizTitle) {
    const modal = document.getElementById("studentAnswersModal");
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = "flex";

    const titleEl = document.getElementById("studentAnswersTitle");
    const autoScoreEl = document.getElementById("autoScoreReference");
    const container = document.getElementById("answersDetailContainer");

    titleEl.innerText = `${studentName}'s Submission`;
    autoScoreEl.innerHTML = `<em>Loading submission details...</em>`;
    container.innerHTML = "";

    try {
        // Query the 'quiz_results' collection matching quizTitle and studentCode
        const q = query(
            collection(db, "quiz_results"), 
            where("quizTitle", "==", quizTitle),
            where("studentCode", "==", studentCode)
        );
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
            autoScoreEl.innerHTML = `<span style="color: #ef4444; font-weight:600;">No digital submission found for this student.</span>`;
            container.innerHTML = `
                <p style="color: #64748b; text-align: center;">
                    The student has not submitted this quiz online yet.
                </p>
            `;
            return;
        }

        const subData = querySnap.docs[0].data();
        const score = subData.score !== undefined ? subData.score : 0;
        const totalMax = subData.totalAutoGradable !== undefined ? subData.totalAutoGradable : 0;
        const percentage = totalMax > 0 ? Math.round((score / totalMax) * 100) : 0;
        const responses = subData.responses || [];

        autoScoreEl.innerHTML = `
            <span style="color: #475569; font-size: 13px;">Auto-Graded Reference Score:</span><br>
            <strong style="font-size: 18px; color: #1e293b;">${score} / ${totalMax} points (${percentage}%)</strong> 
            <small style="color: #64748b; margin-left: 8px;">(For reference only — does not affect official grade)</small>
        `;

        if (!responses.length) {
            container.innerHTML = `<p style="color: #64748b; text-align: center;">No detailed item responses logged for this submission.</p>`;
            return;
        }

        // Render each prompt and student response
        container.innerHTML = responses.map((item, index) => {
            return `
                <div style="border: 1px solid #e2e8f0; padding: 12px 16px; margin-bottom: 12px; border-radius: 8px; background: #f8fafc; border-left: 4px solid #2563eb;">
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e293b;">Q${index + 1}: ${item.prompt || 'Question'}</p>
                    <p style="margin: 4px 0; font-size: 14px; color: #334155;">
                        <strong>Student Answer:</strong> <span style="color: #0f172a; font-weight: 500;">${item.response || 'No answer'}</span>
                    </p>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Error fetching student submission details:", err);
        autoScoreEl.innerHTML = `<span style="color: #ef4444;">Error retrieving submission details from database.</span>`;
    }
};
// 3. Function to close the inspection modal
window.closeAnswersModal = function() {
    const modal = document.getElementById("studentAnswersModal");
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = "none";
    }
};

// Auto-load table on initial script boot
loadQuizzesTable();

// --- 2. SAVE INDIVIDUAL STUDENT SCORE TO FIRESTORE ---
window.saveDirectScore = async function(studentCode, studentName, studentClass, quizTitle) {
    const input = document.getElementById(`score-input-${studentCode}`);
    if (!input) return;

    const scoreValue = parseFloat(input.value);
    if (isNaN(scoreValue)) {
        alert("Please enter a valid numeric score.");
        return;
    }

    try {
        // Document ID pattern: STUDENTCODE_QUIZTITLE (ensures upsert/overwrite behavior)
        const scoreDocId = `${studentCode}_${quizTitle.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const scoreRef = doc(db, "scores", scoreDocId);

        await setDoc(scoreRef, {
            studentCode: studentCode,
            studentName: studentName,
            targetClass: studentClass,
            quizTitle: quizTitle,
            score: scoreValue,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        alert(`Score of ${scoreValue} saved for ${studentName}!`);

        // Refresh Manage Scores table if function exists
        if (typeof window.loadScoresTable === "function") {
            window.loadScoresTable();
        }
    } catch (error) {
        console.error("Error saving score:", error);
        alert("Failed to save score. Check console for details.");
    }
};
async function loadScoresTable() {
    const tbody = document.querySelector("#scoresTable tbody");
    if (!tbody) return;

    const snap = await getDocs(collection(db, "scores"));
    tbody.innerHTML = "";

    snap.forEach(docSnap => {
        const data = docSnap.data();
        tbody.innerHTML += `
            <tr>
                <td>${data.studentName || '-'}</td>
                <td>${data.targetClass || '-'}</td>
                <td>${data.quizTitle || '-'}</td>
                <td><strong>${data.score}</strong></td>
                <td>
                    <button class="btn-secondary" onclick="editScore('${docSnap.id}', ${data.score})">Edit</button>
                </td>
            </tr>
        `;
    });
}
window.loadScoresTable = loadScoresTable;
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
};

// --- MANAGE SCORE LEDGER LOGIC ---

function showScoreLedger() {
    const selectedQuiz = document.getElementById('ledgerQuizSelect').value;
    const ledgerContainer = document.getElementById('scoreLedgerContainer');
    const ledgerTitle = document.getElementById('activeLedgerTitle');
    const tbody = document.getElementById('manageScoreTbody');

    // 1. Validation check
    if (!selectedQuiz) {
        alert("Please select a Quiz or Review from the dropdown first.");
        ledgerContainer.style.display = "none"; // Keep hidden
        return;
    }

    // 2. Unhide the table container
    ledgerContainer.style.display = "block";
    
    // 3. Update the title based on selection
    const selectedText = document.getElementById('ledgerQuizSelect').options[document.getElementById('ledgerQuizSelect').selectedIndex].text;
    ledgerTitle.innerText = `Ledger Results: ${selectedText}`;

    // 4. Fetch the data (Replace this with your actual Firebase/Database fetch function)
    fetchAndRenderScores(selectedQuiz, tbody);
}

// Dummy function to represent your data fetching
async function fetchAndRenderScores(quizId, tbodyElement) {
    // Clear previous rows
    tbodyElement.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Loading scores...</td></tr>";

    try {
        // TODO: Replace with your actual database query for the selected quizId
        /* 
        const q = query(collection(db, "scores"), where("examId", "==", quizId));
        const querySnapshot = await getDocs(q);
        */
       
        // Simulated rendering after data fetch:
        tbodyElement.innerHTML = ""; // Clear loading text
        
        // Example Row Injection (You will loop through your querySnapshot here)
        tbodyElement.innerHTML += `
            <tr>
                <td>${quizId}</td>
                <td>Sample Subject</td>
                <td>John Doe</td>
                <td>Class A</td>
                <td>STU-001</td>
                <td><strong>85/100</strong></td>
                <td>
                    <button class="edit-btn">Edit</button>
                </td>
            </tr>
        `;
    } catch (e) {
        console.error("Error fetching ledger: ", e);
        tbodyElement.innerHTML = "<tr><td colspan='7' style='text-align:center; color: red;'>Error loading data.</td></tr>";
    }
}

// Placeholder function for your bulk upload tool
function processBulkScoreUpload() {
    const fileInput = document.getElementById('bulkScoreUpload');
    if (!fileInput.files.length) {
        alert("Please select a file to upload.");
        return;
    }
    
    // Add your Excel/CSV parsing logic here (e.g., using SheetJS / PapaParse)
    alert(`Processing file: ${fileInput.files[0].name}. Please wait...`);
}

window.loadSystemDatabases = async function() {
    try {
        console.log("--- STARTING DATABASE LOAD ---");
        
        // --- A. Extract Subjects from Teachers ---
        const usersSnap = await getDocs(collection(db, "users"));
        const uniqueSubjects = new Set();
        
        usersSnap.forEach(doc => {
            const data = doc.data();
            const teacherSubject = data.subject || data.Subject || data.course; 
            if (data.role === 'teacher' && teacherSubject && teacherSubject !== "Unassigned") {
                uniqueSubjects.add(teacherSubject);
            
            }
        

            
        });

        const subjTbody = document.querySelector("#subjectsTable tbody");
        const subjSelect = document.getElementById("directSubjectSelect");
        const quizSubjSelect = document.getElementById("quizSubject"); // ADD THIS

        if(subjTbody) subjTbody.innerHTML = "";
        if(subjSelect) subjSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        if(subjSelect) subjSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        if(quizSubjSelect) quizSubjSelect.innerHTML = '<option value="">-- Select Subject --</option>'; // ADD THIS

        Array.from(uniqueSubjects).sort().forEach(name => {
            if(subjTbody) subjTbody.innerHTML += `<tr><td><strong>${name}</strong></td><td><span style="background: #eef2ff; color: var(--primary-blue); padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Teacher Linked</span></td></tr>`;
            if(subjSelect) subjSelect.innerHTML += `<option value="${name}">${name}</option>`;
            if(quizSubjSelect) quizSubjSelect.innerHTML += `<option value="${name}">${name}</option>`; // ADD THIS
        });


            // --- B. Extract Classes from Students ---
            const studentsSnap = await getDocs(collection(db, "students"));
            const uniqueClasses = new Set();
            studentsSnap.forEach(doc => {
                const data = doc.data();
                const studentClass = data.studentClass || data.class || data.className || data.Class;
                if (studentClass) uniqueClasses.add(studentClass);
                
            });

            const classTbody = document.querySelector("#classesTable tbody");
            const classSelect = document.getElementById("directClassSelect");
            const ledgerClassSelect = document.getElementById("ledgerClassSelect"); // NEW
            const quizClassSelect = document.getElementById("quizTargetClass"); // ADD THIS

            if(classTbody) classTbody.innerHTML = "";
            if(classSelect) classSelect.innerHTML = '<option value="">-- Select Class --</option>';
            if(ledgerClassSelect) ledgerClassSelect.innerHTML = '<option value="">-- Choose a Class --</option>'; // NEW
            if(quizClassSelect) quizClassSelect.innerHTML = '<option value="">-- Select Target Class --</option><option value="All Classes">All Classes</option>';

            Array.from(uniqueClasses).sort().forEach(name => {
                if(classTbody) classTbody.innerHTML += `<tr><td><strong>${name}</strong></td><td><span style="background: #ecfdf5; color: #10b981; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Student Linked</span></td></tr>`;
                if(classSelect) classSelect.innerHTML += `<option value="${name}">${name}</option>`;
                if(ledgerClassSelect) ledgerClassSelect.innerHTML += `<option value="${name}">${name}</option>`; // NEW
                if(quizClassSelect) quizClassSelect.innerHTML = '<option value="">-- Select Target Class --</option><option value="All Classes">All Classes</option>';
            });


            // --- C. Extract Quizzes (Digital + Offline) ---
            const quizSelect = document.getElementById("directQuizSelect");
            const ledgerQuizSelect = document.getElementById("ledgerQuizSelect"); // NEW
            const quizTbody = document.querySelector("#quizzesDatabaseTable tbody");

            if(quizSelect) quizSelect.innerHTML = '<option value="">-- Select Quiz --</option>';
            if(ledgerQuizSelect) ledgerQuizSelect.innerHTML = '<option value="">-- Choose a Quiz / Review --</option>'; // NEW
            if(quizTbody) quizTbody.innerHTML = "";

            // 1. Get Digital Quizzes
            const digitalSnap = await getDocs(collection(db, "quizzes"));
            digitalSnap.forEach(docSnap => {
                const title = docSnap.data().title || docSnap.data().quizName;
                if(quizTbody && title) quizTbody.innerHTML += `<tr><td><strong>${title}</strong></td><td><span style="background: #fffbeb; color: #f59e0b; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Quiz Builder</span></td><td>-</td></tr>`;
                if(quizSelect && title) quizSelect.innerHTML += `<option value="${title}">${title} (Digital)</option>`;
                if(ledgerQuizSelect && title) ledgerQuizSelect.innerHTML += `<option value="${title}">${title} (Digital)</option>`; // NEW
            });

            // 2. Get Manual/Offline Quizzes
            const manualSnap = await getDocs(collection(db, "system_quizzes"));
            manualSnap.forEach(docSnap => {
                const title = docSnap.data().name;
                if(quizTbody && title) quizTbody.innerHTML += `<tr><td><strong>${title}</strong></td><td><span style="background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Offline Exam</span></td><td><button class="delete-btn" onclick="deleteSystemRecord('system_quizzes', '${docSnap.id}')">Delete</button></td></tr>`;
                if(quizSelect && title) quizSelect.innerHTML += `<option value="${title}">${title} (Offline)</option>`;
                if(ledgerQuizSelect && title) ledgerQuizSelect.innerHTML += `<option value="${title}">${title} (Offline)</option>`; // NEW
            });
        
        console.log("--- DATABASE LOAD COMPLETE ---");

    } catch(e) {
        console.error("Error loading linked databases:", e);
    }
};

// 2. Safely call the function when the page loads
document.addEventListener("DOMContentLoaded", () => {
    if (typeof window.loadSystemDatabases === "function") {
        window.loadSystemDatabases();
    }
    const manageDatabasesTab = document.getElementById('tab-view-ledgers'); 
    if (manageDatabasesTab) {
        manageDatabasesTab.addEventListener('click', () => {
            if (typeof window.loadSystemDatabases === "function") {
                window.loadSystemDatabases();
            }
        });
    }
});

async function addManualQuiz() {
    const input = document.getElementById('newManualQuiz');
    const examName = input.value.trim();

    if (!examName) {
        alert("Please enter an exam or quiz name.");
        return;
    }

    try {
        await addDoc(collection(db, "system_quizzes"), {
            name: examName,
            createdAt: new Date().toISOString()
        });
        alert(`Offline exam "${examName}" added successfully!`);
        input.value = "";
        
        // Refresh active databases list
        if (typeof window.loadSystemDatabases === "function") {
            window.loadSystemDatabases();
        }
    } catch (e) {
        alert("Error adding offline exam: " + e.message);
    }
}

async function deleteSystemRecord(collectionName, docId) {
    if (confirm("Are you sure you want to delete this record?")) {
        try {
            await deleteDoc(doc(db, collectionName, docId));
            alert("Record deleted successfully.");
            
            if (typeof window.loadSystemDatabases === "function") {
                window.loadSystemDatabases();
            }
        } catch (e) {
            alert("Error deleting record: " + e.message);
        }
    }
}

async function loadClassRoster() {
    const subject = document.getElementById('directSubjectSelect').value;
    const selectedClass = document.getElementById('directClassSelect').value;
    const quiz = document.getElementById('directQuizSelect').value;

    if (!subject || !selectedClass || !quiz) {
        alert("Please select Subject, Class, and Quiz first.");
        return;
    }

    try {
        document.getElementById('directScoreContainer').classList.remove('hidden');
        const tbody = document.querySelector('#directScoreTable tbody');
        tbody.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Loading students and scores...</td></tr>";

        // 1. Fetch all students in the class
        const studentsQuery = query(collection(db, "students"), where("studentClass", "==", selectedClass));
        const studentsSnap = await getDocs(studentsQuery);

        if (studentsSnap.empty) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color: red;'>No students found in this class.</td></tr>";
            return;
        }

        // 2. Query exam_scores collection for existing entries
        const scoresQuery = query(
            collection(db, "exam_scores"),
            where("studentClass", "==", selectedClass),
            where("subject", "==", subject),
            where("examName", "==", quiz)
        );
        const scoresSnap = await getDocs(scoresQuery);

        // Map existing scores by student code for quick lookup
        const existingScores = {};
        scoresSnap.forEach(docSnap => {
            const data = docSnap.data();
            existingScores[data.studentCode] = data.score;
        });

        tbody.innerHTML = "";

        // 3. Render table and pre-fill input values if a score exists
        studentsSnap.forEach(docSnap => {
            const data = docSnap.data();
            const studentCode = docSnap.id;
            const currentScore = existingScores[studentCode] !== undefined ? existingScores[studentCode] : "";

            tbody.innerHTML += `
                <tr>
                    <td><strong>${studentCode}</strong></td>
                    <td>${data.studentName}</td>
                    <td>
                        <input type="number" 
                               class="direct-score-input" 
                               data-code="${studentCode}" 
                               data-name="${data.studentName}" 
                               value="${currentScore}" 
                               placeholder="Score" 
                               style="width: 100px; margin: 0; padding: 6px;">
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Error loading roster:", e);
        alert("Error loading class roster: " + e.message);
    }
}

async function saveDirectScores() {
    const subject = document.getElementById('directSubjectSelect').value; 
    const studentClass = document.getElementById('directClassSelect').value;
    const quiz = document.getElementById('directQuizSelect').value;

    if (!subject || !studentClass || !quiz) {
        alert("Please select a Subject, Class, and Quiz before saving.");
        return;
    }

    const scoreInputs = document.querySelectorAll('.direct-score-input');
    const saveBtn = document.getElementById('saveDirectScoresBtn');
    const originalText = saveBtn ? saveBtn.innerText : "Save All Scores to Ledger";
    let savedCount = 0;

    try {
        if (saveBtn) {
            saveBtn.innerText = "Saving to Ledger...";
            saveBtn.disabled = true;
        }

        for (const input of scoreInputs) {
            const scoreValue = input.value;
            
            if (scoreValue !== "") {
                const studentCode = input.getAttribute('data-code');
                const studentName = input.getAttribute('data-name');

                const customDocId = `${studentCode}_${subject}_${quiz}`.replace(/[^a-zA-Z0-9_-]/g, "_");

                // Save directly to the unified "exam_scores" collection
                await setDoc(doc(db, "exam_scores", customDocId), {
                    studentCode: studentCode,
                    studentName: studentName,
                    subject: subject,
                    studentClass: studentClass,
                    examName: quiz,     // Key used across exam_scores
                    quizName: quiz,     // Key kept for compatibility
                    score: Number(scoreValue),
                    updatedAt: new Date()
                }, { merge: true });

                savedCount++;
            }
        }

        alert(`Successfully saved/updated ${savedCount} score(s)!`);

    } catch (error) {
        console.error("Error saving scores: ", error);
        alert("An error occurred while saving: " + error.message);
    } finally {
        if (saveBtn) {
            saveBtn.innerText = originalText;
            saveBtn.disabled = false;
        }
    }
}

async function viewScoreLedger() {
    const selectedClass = document.getElementById('ledgerClassSelect')?.value || document.getElementById('directClassSelect').value;
    const selectedQuiz = document.getElementById('ledgerQuizSelect').value;
    const sortOption = document.getElementById('ledgerSortSelect')?.value || 'name_asc';

    if (!selectedClass || !selectedQuiz) {
        alert("Please select both a Class and a Quiz/Review to view the ledger.");
        return;
    }

    const viewBtn = document.getElementById('viewLedgerBtn'); 

    try {
        viewBtn.innerText = "Loading...";
        viewBtn.disabled = true;

        const tableContainer = document.getElementById('scoreLedgerContainer');
        if (tableContainer) tableContainer.style.display = 'block';

        const tbody = document.getElementById('manageScoreTbody');
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Fetching scores...</td></tr>";

        // Query unified exam_scores collection
        const q = query(collection(db, "exam_scores"), 
            where("studentClass", "==", selectedClass),
            where("examName", "==", selectedQuiz)
        );
        
        const snap = await getDocs(q);
        tbody.innerHTML = ""; 

        if (snap.empty) {
            tbody.innerHTML = "<tr><td colspan='7' style='text-align:center; color: red;'>No scores found for this Class and Quiz combination.</td></tr>";
            return;
        }

        let ledgerResults = [];
        snap.forEach(docSnap => {
            ledgerResults.push({ id: docSnap.id, ...docSnap.data() });
        });

        ledgerResults.sort((a, b) => {
            if (sortOption === 'score_desc') return (b.score || 0) - (a.score || 0);
            if (sortOption === 'score_asc') return (a.score || 0) - (b.score || 0);
            return (a.studentName || '').localeCompare(b.studentName || '');
        });

        ledgerResults.forEach(data => {
            tbody.innerHTML += `
                <tr>
                    <td>${data.examName || data.quizName || selectedQuiz}</td>
                    <td>${data.subject || '-'}</td>
                    <td>${data.studentName}</td>
                    <td><strong>${data.studentClass}</strong></td>
                    <td><strong>${data.studentCode}</strong></td>
                    <td><strong style="color: #28a745;">${data.score}</strong></td>
                    <td>
                        <button class="delete-btn" onclick="deleteStudentScore('${data.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error loading ledger: ", error);
        alert("An error occurred while loading the ledger: " + error.message);
    } finally {
        if (viewBtn) {
            viewBtn.innerText = "View Table";
            viewBtn.disabled = false;
        }
    }
}

// --- POINTS MODAL LOGIC ---
window.openPointModal = function(code, name) {
    document.getElementById('modalStudentCode').value = code;
    document.getElementById('pointModalStudent').innerText = `Student: ${name} (${code})`;
    document.getElementById('modalPointValue').value = '';
    document.getElementById('modalPointReason').value = '';
    
    const modal = document.getElementById('pointModal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; 
};

window.closePointModal = function() {
    const modal = document.getElementById('pointModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.submitModalPoint = async function() {
    const code = document.getElementById('modalStudentCode').value;
    const amount = parseFloat(document.getElementById('modalPointValue').value);
    const reason = document.getElementById('modalPointReason').value.trim();

    if (!code || isNaN(amount) || !reason) {
        alert("Please provide both a point amount and a reason.");
        return;
    }

    try {
        const studentSnap = await getDoc(doc(db, "students", code));
        let targetClass = 'N/A';
        let studentName = code;
        
        if (studentSnap.exists()) {
            const sData = studentSnap.data();
            targetClass = sData.studentClass || sData.Class || sData.class || 'N/A';
            studentName = sData.studentName || code;
        }

        await addDoc(collection(db, "student_points"), {
            studentCode: code,
            studentName: studentName,
            studentClass: targetClass,
            reason: reason,
            points: amount,
            timestamp: new Date()
        });
        
        const sign = amount > 0 ? '+' : '';
        alert(`Successfully recorded ${sign}${amount} points.`);
        
        closePointModal();
        loadPointsTable(); // Refresh the ledger immediately
    } catch (e) {
        alert("Error adjusting points: " + e.message);
    }
};


// Function to toggle code visibility in the Points Ledger
window.togglePtCodeVisibility = function(studentId) {
    const span = document.getElementById(`pt-code-${studentId}`);
    if (!span) return;

    if (span.innerText === '•••••') {
        span.innerText = studentId; // Show real code
        span.style.letterSpacing = 'normal'; // Reset spacing
    } else {
        span.innerText = '•••••'; // Hide code
        span.style.letterSpacing = '2px'; // Add spacing for dots
    }
};

let uniquePastReasons = [];

// 1. Core Data Aggregator for Behavior Tab
async function refreshBehaviorTabLedgers() {
    try {
        const pointsSnap = await getDocs(collection(db, "student_points"));
        
        // Variables for tables
        const studentTotals = {};
        const reasonStats = {};
        const reasonsSet = new Set();

        pointsSnap.forEach(doc => {
            const data = doc.data();
            const pt = parseFloat(data.points) || 0;
            const reasonRaw = (data.reason || "Unknown").trim();
            const rKey = reasonRaw.toLowerCase();
            
            // Build student totals for the full ledger
            if(!studentTotals[data.studentCode]) {
                studentTotals[data.studentCode] = { 
                    code: data.studentCode, 
                    name: data.studentName, 
                    sClass: data.studentClass, 
                    total: 0 
                };
            }
            studentTotals[data.studentCode].total += pt;

            // Build reason statistics
            if(reasonRaw) {
                reasonsSet.add(reasonRaw); // For autocomplete
                if(!reasonStats[rKey]) {
                    reasonStats[rKey] = { text: reasonRaw, posPts: 0, negPts: 0, count: 0 };
                }
                reasonStats[rKey].count++;
                if (pt > 0) reasonStats[rKey].posPts += pt;
                if (pt < 0) reasonStats[rKey].negPts += Math.abs(pt);
            }
        });

        uniquePastReasons = Array.from(reasonsSet);

        // --- Render Full Ledger in Behavior Tab ---
        const ledgerTbody = document.querySelector("#behaviorTabPointsTable tbody");
        if(ledgerTbody) {
            ledgerTbody.innerHTML = "";
            Object.values(studentTotals)
                .sort((a,b) => b.total - a.total)
                .forEach(info => {
                    const color = info.total > 0 ? '#28a745' : (info.total < 0 ? '#dc3545' : '#333');
                    const sign = info.total > 0 ? '+' : '';
                    ledgerTbody.innerHTML += `<tr>
                        <td><strong>${info.code}</strong></td>
                        <td>${info.name}</td>
                        <td>${info.sClass}</td>
                        <td><strong style="color: ${color};">${sign}${info.total}</strong></td>
                    </tr>`;
                });
        }

        // --- Render Top 10 Positive Reasons ---
        const posTbody = document.querySelector("#topPositiveTable tbody");
        if (posTbody) {
            const topPos = Object.values(reasonStats)
                .filter(r => r.posPts > 0)
                .sort((a, b) => b.posPts - a.posPts)
                .slice(0, 10);
            
            posTbody.innerHTML = topPos.length === 0 ? "<tr><td colspan='3'>No data</td></tr>" : "";
            topPos.forEach(r => {
                posTbody.innerHTML += `<tr><td>${r.text}</td><td>${r.count}x</td><td style="color:#10b981; font-weight:bold;">+${r.posPts}</td></tr>`;
            });
        }

        // --- Render Top 10 Negative Reasons ---
        const negTbody = document.querySelector("#topNegativeTable tbody");
        if (negTbody) {
            const topNeg = Object.values(reasonStats)
                .filter(r => r.negPts > 0)
                .sort((a, b) => b.negPts - a.negPts)
                .slice(0, 10);
                
            negTbody.innerHTML = topNeg.length === 0 ? "<tr><td colspan='3'>No data</td></tr>" : "";
            topNeg.forEach(r => {
                negTbody.innerHTML += `<tr><td>${r.text}</td><td>${r.count}x</td><td style="color:#e02d2d; font-weight:bold;">-${r.negPts}</td></tr>`;
            });
        }

    } catch(e) {
        console.error("Error generating behavior stats: ", e);
    }
}

// 2. Autocomplete Filter Logic
function setupAutocomplete(inputElement, listElement, dataProvider) {
    inputElement.addEventListener("input", function() {
        const val = this.value;
        listElement.innerHTML = "";
        if (!val) {
            listElement.classList.add("hidden");
            return;
        }
        
        // dataProvider is a function that returns the array we want to search through
        const dataArray = dataProvider(); 
        const matches = dataArray.filter(item => item.toLowerCase().includes(val.toLowerCase())).slice(0, 8); // Max 8 results
        
        if (matches.length > 0) {
            listElement.classList.remove("hidden");
            matches.forEach(match => {
                const div = document.createElement("DIV");
                div.innerHTML = match;
                div.addEventListener("click", function() {
                    inputElement.value = match;
                    listElement.innerHTML = "";
                    listElement.classList.add("hidden");
                });
                listElement.appendChild(div);
            });
        } else {
            listElement.classList.add("hidden");
        }
    });
}

// 3. Initialize the Listeners
document.addEventListener("DOMContentLoaded", () => {
    // Setup Name Autocomplete (Pulling from allStudentsData loaded globally)
    const nameInput = document.getElementById("pointStudentName");
    const nameList = document.getElementById("nameAutocompleteList");
    if(nameInput) {
        setupAutocomplete(nameInput, nameList, () => allStudentsData.map(s => s.studentName));
    }

    // Setup Reason Autocomplete
    const reasonInput = document.getElementById("pointReason");
    const reasonList = document.getElementById("reasonAutocompleteList");
    if(reasonInput) {
        setupAutocomplete(reasonInput, reasonList, () => uniquePastReasons);
    }

    // Close dropdowns when clicking outside
    document.addEventListener("click", function (e) {
        if(nameInput && e.target !== nameInput) nameList.classList.add("hidden");
        if(reasonInput && e.target !== reasonInput) reasonList.classList.add("hidden");
    });

    // Hook into tab click to refresh data
    document.querySelector('[data-tab="tab-manage-behavior"]')?.addEventListener("click", refreshBehaviorTabLedgers);
});

const themeToggleBtn = document.getElementById('themeToggleBtn');
const savedTheme = localStorage.getItem('appTheme') || 'light';

// Apply saved theme preference on page load
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Light Mode';
}

// Toggle theme on button click
themeToggleBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    
    localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
    themeToggleBtn.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
});


// --- 4. FIX CLOSE QUIZ RESULTS MODAL ---
function closeResultsModal() {
    const modal = document.getElementById('quizResultsModal');
    // FIX: Add hidden class back when closing
    modal.classList.add('hidden');
    modal.style.display = 'none';
}
window.viewQuizResults = viewQuizResults;
window.closeResultsModal = closeResultsModal;

// --- 5. PRESERVE STATUS DURING SAVE ---
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
        
        const imgNode = el.querySelector('.blk-img');
        const imgRaw = imgNode ? imgNode.value.trim() : '';
        const imgUrl = convertDriveUrl(imgRaw);
        
        const pointsNode = el.querySelector('.blk-points');
        const points = pointsNode ? parseInt(pointsNode.value) || 1 : 0;

        if (type === 'header') {
            const titleText = el.querySelector('.blk-prompt') ? el.querySelector('.blk-prompt').innerText.trim() : '';
            const descText = el.querySelector('.blk-desc') ? el.querySelector('.blk-desc').innerText.trim() : '';
            items.push({ type, text: titleText, description: descText });
            
        } else if (type === 'mcq') {
            const options = [];
            let selectedCorrectIndex = 0;

            const optionRows = el.querySelectorAll('.options-container .gform-opt-row');
            optionRows.forEach((row) => {
                const input = row.querySelector('.gform-opt-input');
                const radio = row.querySelector('input[type="radio"]');
                
                if (input && input.value.trim() !== '') {
                    options.push(input.value.trim());
                    // Directly verify if this radio option is selected
                    if (radio && radio.checked) {
                        selectedCorrectIndex = options.length - 1;
                    }
                }
            });
            
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').innerText.trim(),
                imageUrl: imgUrl,
                points: points,
                options: options,
                correct: selectedCorrectIndex
            });
        
            
        } else if (type === 'fill') {
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').innerText.trim(),
                imageUrl: imgUrl,
                points: points,
                answers: el.querySelector('.blk-answer').value.trim().toLowerCase().split(',').map(a => a.trim())
            });
            
        } else if (type === 'essay') {
            items.push({
                type,
                prompt: el.querySelector('.blk-prompt').innerText.trim(),
                imageUrl: imgUrl,
                points: points
            });
        }
    });

    try {
        if (currentEditQuizId) {
            await updateDoc(doc(db, "quizzes", currentEditQuizId), {
                title, targetClass, subject, items, updatedAt: new Date().toISOString()
            });
            alert("Quiz updated successfully!");
            currentEditQuizId = null;
        } else {
            // New quizzes are published with status: 'active' by default
            await addDoc(collection(db, "quizzes"), {
                title, targetClass, subject, items, status: 'active', createdAt: new Date().toISOString()
            });
            alert("Quiz published successfully!");
        }

        closeQuizBuilder();
        document.getElementById('quizBlocksContainer').innerHTML = "";
        document.getElementById('quizTitle').value = "";
        loadQuizzesTable();
    } catch (e) { 
        alert("Error saving quiz: " + e.message); 
    }
}

// --- MCQ DYNAMIC OPTION MANAGEMENT ---
window.addOptionToMCQ = function(btnElement, blockId) {
    const block = btnElement.closest('.quiz-block');
    const optionsContainer = block.querySelector('.options-container');
    if (!optionsContainer) return;

    const currentRows = optionsContainer.querySelectorAll('.gform-opt-row');
    const newIdx = currentRows.length;

    const newRow = document.createElement('div');
    newRow.className = 'gform-opt-row';
    newRow.innerHTML = `
        <input type="radio" name="${blockId}_correct" value="${newIdx}" title="Mark as correct answer" ${newIdx === 0 ? 'checked' : ''}>
        <input type="text" class="gform-opt-input blk-opt${newIdx}" placeholder="Option ${newIdx + 1}" required>
        <button class="icon-btn delete" type="button" onclick="this.closest('.gform-opt-row').remove(); window.reindexMCQOptions(this.closest('.quiz-block'))">✖</button>
    `;
    optionsContainer.appendChild(newRow);
};

window.reindexMCQOptions = function(block) {
    if (!block) return;
    const rows = block.querySelectorAll('.options-container .gform-opt-row');
    const blockId = block.dataset.blockId || 'block';
    
    rows.forEach((row, i) => {
        const radio = row.querySelector('input[type="radio"]');
        if (radio) {
            radio.value = i;
            radio.name = `${blockId}_correct`;
        }
    });
};

// --- 3. HELPER TO CREATE MODAL IF NOT PRESENT IN HTML ---
function createQuizResultsModal() {
    let modal = document.getElementById("quizResultsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "quizResultsModal";
    modal.className = "modal";
    modal.style.cssText = "display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); overflow:auto;";

    modal.innerHTML = `
        <div class="modal-content" style="background:var(--card-bg, #fff); margin:5% auto; padding:24px; border-radius:12px; max-width:700px; width:90%; position:relative;">
            <span onclick="document.getElementById('quizResultsModal').style.display='none'" style="position:absolute; right:20px; top:16px; cursor:pointer; font-size:24px; font-weight:bold;">&times;</span>
            <h3 id="quizResultsTitle" style="margin-top:0;">Quiz Results</h3>
            <div style="max-height: 400px; overflow-y: auto; margin-top: 16px;">
                <table id="quizResultsTable" style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left; border-bottom:2px solid var(--border-color, #e2e8f0);">
                            <th style="padding:8px;">Student</th>
                            <th style="padding:8px;">Class</th>
                            <th style="padding:8px;">Score</th>
                            <th style="padding:8px;">Action</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}
window.toggleQuizStatus = toggleQuizStatus;


// Expose functions globally for HTML button clicks
window.addManualQuiz = addManualQuiz;
window.deleteSystemRecord = deleteSystemRecord;
// Expose to window object for HTML onclick inline events
window.deleteQuiz = deleteQuiz;
window.viewQuizResults = viewQuizResults;
window.closeResultsModal = closeResultsModal;
window.editQuiz = editQuiz;


window.deleteQuiz = deleteQuiz;
document.getElementById('saveQuizBtn')?.addEventListener('click', saveQuiz);
document.getElementById('loadDirectStudentsBtn')?.addEventListener('click', loadClassRoster);
document.getElementById('saveDirectScoresBtn')?.addEventListener('click', saveDirectScores);
document.getElementById('viewLedgerBtn')?.addEventListener('click', viewScoreLedger);
window.viewScoreLedger = viewScoreLedger;

// Bind the new function to the window so the HTML buttons can trigger it
window.inlineAdjustPoint = inlineAdjustPoint;

// Bind the new bulk upload buttons
document.getElementById('uploadBulkStudentsBtn')?.addEventListener('click', processBulkStudents);
document.getElementById('uploadBulkTeachersBtn')?.addEventListener('click', processBulkTeachers);
document.getElementById('sortStudents')?.addEventListener('change', loadStudentsDirectory);
document.getElementById('sortScores')?.addEventListener('change', loadAdminTable);
document.getElementById('sortPoints')?.addEventListener('change', loadPointsTable);
document.getElementById('postNewsBtn')?.addEventListener('click', addNewsUpdate);
window.deleteNewsUpdate = deleteNewsUpdate;