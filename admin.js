import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

// --- UTILITY: DEBOUNCE FUNCTION ---
// Prevents functions from firing repeatedly on every single keystroke
function debounce(func, delay = 200) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}
// Secondary background authorization loop configuration context
const secondaryApp = initializeApp(firebaseConfig, "SecondaryAuthApp");
const secondaryAuth = getAuth(secondaryApp);

let userRole = null;
let teacherSubject = null;

// --- DYNAMIC AUTH & PERMISSION LISTENER ---
// --- DYNAMIC AUTH & PERMISSION LISTENER (FAST & PARALLEL) ---
onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('loginScreen');
    const adminDashboard = document.getElementById('adminDashboard');
    const subjectInput = document.getElementById('subject');
    const tableTitle = document.getElementById('tableTitle');
    const welcomeTitle = document.getElementById('welcomeTitle');

    if (user) {
        try {
            // 1. Fetch User Role & Subject FIRST so queries know what permissions to apply
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userRole = userData.role; 
                teacherSubject = userData.subject || ""; 
            } else {
                userRole = "teacher";
                teacherSubject = "Unassigned";
            }

            // 2. Format Display Name & Update Sidebar UI
            const rawEmail = user.email || "user@mks.sch.id";
            const formattedName = rawEmail.split('@')[0]
                .replace(/[._]/g, ' ')
                .replace(/\b\w/g, char => char.toUpperCase());

            const sidebarNameEl = document.getElementById('sidebarUserName');
            const sidebarRoleEl = document.getElementById('sidebarUserRole');
            const avatarCircleEl = document.getElementById('userAvatarCircle');

            if (sidebarNameEl) sidebarNameEl.innerText = formattedName;
            if (sidebarRoleEl) {
                sidebarRoleEl.innerText = userRole === "admin" ? "Super Admin" : `Teacher (${teacherSubject})`;
            }
            if (avatarCircleEl) {
                avatarCircleEl.innerText = formattedName.charAt(0).toUpperCase();
            }

            const welcomeSubEl = document.querySelector('.header-title p');
            if (welcomeSubEl) welcomeSubEl.innerText = `Welcome back, ${formattedName}`;

            loginScreen.classList.add('hidden');
            adminDashboard.classList.remove('hidden');

            // 3. Set UI Views and Role Permissions
            if (userRole === "admin") {
                document.querySelectorAll('.admin-only-view').forEach(el => el.classList.remove('hidden'));
                
                if (subjectInput) {
                    subjectInput.disabled = false;
                    subjectInput.value = "";
                    subjectInput.placeholder = "Subject Name (e.g. English)";
                }
                if (tableTitle) tableTitle.innerText = "Master Registry Ledger - All Subjects & Classes";
                if (welcomeTitle) welcomeTitle.innerText = "Administrator Master System Workspace";

            } else {
                document.querySelectorAll('.admin-only-view').forEach(el => el.classList.add('hidden'));
                document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                
                const scoresBtn = document.querySelector('[data-tab="tab-manage-scores"]');
                const scoresTab = document.getElementById('tab-manage-scores');
                if (scoresBtn) scoresBtn.classList.add('active');
                if (scoresTab) scoresTab.classList.add('active');

                if (subjectInput) {
                    subjectInput.value = teacherSubject;
                    subjectInput.disabled = true; 
                }
                if (tableTitle) tableTitle.innerText = `Departmental Performance Ledger: ${teacherSubject}`;
                if (welcomeTitle) welcomeTitle.innerText = `Teacher Portal Workspace (${teacherSubject})`;

                const directSubSelect = document.getElementById('directSubjectSelect');
                if (directSubSelect && teacherSubject) {
                    directSubSelect.value = teacherSubject;
                }
            }

            // 4. Build array of tasks to fetch concurrently in PARALLEL
            const parallelTasks = [
                loadNewsTable(),
                loadAdminTable(),
                loadPointsTable()
            ];

            if (typeof window.loadSystemDatabases === "function") {
                parallelTasks.push(window.loadSystemDatabases());
            }

            if (userRole === "admin") {
                parallelTasks.push(loadStudentsDirectory());
                parallelTasks.push(loadTeachersDirectory());
            }

            // Execute all queries simultaneously
            await Promise.all(parallelTasks);

            // 5. Update stats after directories are loaded
            if (userRole === "admin") {
                updateDashboardStats();
            }

        } catch (err) {
            console.error("Error querying identity permissions: ", err);
            alert("Error setting up session: " + err.message);
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
    const name = document.getElementById('newTeacherName').value.trim();
    const email = document.getElementById('newTeacherEmail').value.trim();
    const password = document.getElementById('newTeacherPassword').value.trim();
    const subject = document.getElementById('newTeacherSubject').value.trim();

    if (!name || !email || !password || !subject) {
        alert("All fields (Name, Email, Password, Subject) are required to register a teacher.");
        return;
    }

    try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await setDoc(doc(db, "users", credential.user.uid), {
            name: name,
            email: email,
            role: "teacher",
            subject: subject
        });
        alert(`Teacher Registered Successfully!\nName: ${name}\nEmail: ${email}\nSubject: ${subject}`);
        
        document.getElementById('newTeacherName').value = "";
        document.getElementById('newTeacherEmail').value = "";
        document.getElementById('newTeacherPassword').value = "";
        document.getElementById('newTeacherSubject').value = "";
        
        await secondaryAuth.signOut();
        loadTeachersDirectory();
        if (typeof window.loadSystemDatabases === "function") {
            window.loadSystemDatabases();
        }
    } catch (e) {
        alert("Registration operation rejected: " + e.message);
    }
}

window.generateNewUniqueCode = async function(oldCode) {
    if (confirm(`Are you sure you want to generate a new unique code for student ${oldCode}? The old code will be retired.`)) {
        try {
            const studentRef = doc(db, "students", oldCode);
            const studentSnap = await getDoc(studentRef);

            if (!studentSnap.exists()) {
                alert("Student record missing.");
                return;
            }

            const studentData = studentSnap.data();
            const newCode = await generateUniqueStudentCode();

            // Create new record with new code ID
            await setDoc(doc(db, "students", newCode), studentData);

            // Delete old record
            await deleteDoc(studentRef);

            alert(`Code updated successfully!\nOld Code: ${oldCode}\nNew Code: ${newCode}`);

            loadStudentsDirectory();
            renderDbStudentsTable();
            loadPointsTable();
        } catch (e) {
            alert("Error regenerating student code: " + e.message);
        }
    }
};

// --- STUDENT REGISTRATION MODE SWITCHER ---
window.setStudentRegMode = function(mode) {
    const singleForm = document.getElementById('studentRegSingleForm');
    const bulkForm = document.getElementById('studentRegBulkForm');
    const btnSingle = document.getElementById('btnModeSingle');
    const btnBulk = document.getElementById('btnModeBulk');

    if (mode === 'bulk') {
        if (singleForm) singleForm.classList.add('hidden');
        if (bulkForm) bulkForm.classList.remove('hidden');
        if (btnSingle) btnSingle.classList.remove('active');
        if (btnBulk) btnBulk.classList.add('active');
    } else {
        if (bulkForm) bulkForm.classList.add('hidden');
        if (singleForm) singleForm.classList.remove('hidden');
        if (btnBulk) btnBulk.classList.remove('active');
        if (btnSingle) btnSingle.classList.add('active');
    }
};

// --- SCORE INPUT MODE SWITCHER ---
window.setScoreInputMode = function(mode) {
    const singleView = document.getElementById('scoreInputSingleView');
    const bulkView = document.getElementById('scoreInputBulkView');
    const btnSingle = document.getElementById('btnScoreInputSingle');
    const btnBulk = document.getElementById('btnScoreInputBulk');
    const titleEl = document.getElementById('scoreInputHeaderTitle');

    if (mode === 'bulk') {
        if (singleView) singleView.classList.add('hidden');
        if (bulkView) bulkView.classList.remove('hidden');
        if (btnSingle) btnSingle.classList.remove('active');
        if (btnBulk) btnBulk.classList.add('active');
        if (titleEl) titleEl.innerText = 'Multiple Input Score';
    } else {
        if (bulkView) bulkView.classList.add('hidden');
        if (singleView) singleView.classList.remove('hidden');
        if (btnBulk) btnBulk.classList.remove('active');
        if (btnSingle) btnSingle.classList.add('active');
        if (titleEl) titleEl.innerText = 'Input scores';
    }
};

// --- VIEW STUDENT CODE MODAL ---
window.viewStudentCode = function(studentId, studentName, studentClass) {
    const modal = document.getElementById('studentCodeModal');
    const nameEl = document.getElementById('modalStudentCodeName');
    const classEl = document.getElementById('modalStudentCodeClass');
    const codeEl = document.getElementById('modalDisplayStudentCode');
    const copyBtnText = document.getElementById('copyBtnText');

    if (nameEl) nameEl.innerText = studentName || 'Student';
    if (classEl) classEl.innerText = studentClass ? `Class: ${studentClass}` : 'Class: N/A';
    if (codeEl) codeEl.innerText = studentId;
    if (copyBtnText) copyBtnText.innerText = 'Copy Code';

    if (modal) modal.classList.remove('hidden');
};

window.closeStudentCodeModal = function() {
    const modal = document.getElementById('studentCodeModal');
    if (modal) modal.classList.add('hidden');
};

window.copyStudentCodeToClipboard = async function() {
    const codeEl = document.getElementById('modalDisplayStudentCode');
    const copyBtnText = document.getElementById('copyBtnText');
    if (!codeEl) return;

    try {
        await navigator.clipboard.writeText(codeEl.innerText.trim());
        if (copyBtnText) {
            copyBtnText.innerText = 'Copied!';
            setTimeout(() => {
                if (copyBtnText) copyBtnText.innerText = 'Copy Code';
            }, 2000);
        }
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = codeEl.innerText.trim();
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        if (copyBtnText) {
            copyBtnText.innerText = 'Copied!';
            setTimeout(() => {
                if (copyBtnText) copyBtnText.innerText = 'Copy Code';
            }, 2000);
        }
    }
};

// --- NATURAL STUDENT SORTING ---
function compareStudentsByClassAndName(a, b) {
    const classA = (a.studentClass || '').trim();
    const classB = (b.studentClass || '').trim();
    
    // Natural alphanumeric class compare (e.g. Grade 7A < Grade 7B < Grade 10A < Grade 12)
    const classComp = classA.localeCompare(classB, undefined, { numeric: true, sensitivity: 'base' });
    if (classComp !== 0) return classComp;
    
    // Within same class, compare student names alphabetically (A to Z)
    const nameA = (a.studentName || '').trim();
    const nameB = (b.studentName || '').trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
}

// --- STUDENTS MASTER DIRECTORY (DATABASES TAB) ---
let dbStudentsCurrentPage = 1;

window.onDbStudentSearchChange = debounce(() => {
    dbStudentsCurrentPage = 1;
    renderDbStudentsTable();
}, 200);

window.onDbStudentFilterChange = function() {
    dbStudentsCurrentPage = 1;
    renderDbStudentsTable();
};

window.onDbStudentPerPageChange = function() {
    dbStudentsCurrentPage = 1;
    renderDbStudentsTable();
};

window.goToDbStudentsPage = function(pageNum) {
    dbStudentsCurrentPage = pageNum;
    renderDbStudentsTable();
};

window.renderDbStudentsTable = function() {
    const searchInput = document.getElementById('searchDbStudents');
    const classFilter = document.getElementById('filterDbStudentClass');
    const perPageSelect = document.getElementById('dbStudentsPerPage');
    const tbody = document.querySelector("#dbStudentsDirectoryTable tbody");
    const countBadge = document.getElementById('dbStudentsCountBadge');
    const pageInfo = document.getElementById('dbStudentsPageInfo');
    const pageButtons = document.getElementById('dbStudentsPageButtons');
    
    if (!tbody) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedClass = classFilter ? classFilter.value : 'all';
    const perPageVal = perPageSelect ? perPageSelect.value : '10';

    // 1. Filter students
    let filtered = allStudentsData.filter(s => {
        const matchesSearch = !searchTerm ||
               (s.studentName && s.studentName.toLowerCase().includes(searchTerm)) ||
               (s.studentClass && s.studentClass.toLowerCase().includes(searchTerm)) ||
               (s.id && s.id.toLowerCase().includes(searchTerm));
        
        const matchesClass = (selectedClass === 'all') || (s.studentClass === selectedClass);

        return matchesSearch && matchesClass;
    });

    // 2. Sort: lower class first, then student name A-Z
    filtered.sort(compareStudentsByClassAndName);

    // Update total count badge
    if (countBadge) countBadge.innerText = filtered.length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 30px; color: var(--text-gray);">No matching students found.</td></tr>`;
        if (pageInfo) pageInfo.innerText = 'Showing 0 to 0 of 0 students';
        if (pageButtons) pageButtons.innerHTML = '';
        return;
    }

    // 3. Calculate Pagination
    const perPage = perPageVal === 'all' ? filtered.length : parseInt(perPageVal, 10) || 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

    if (dbStudentsCurrentPage > totalPages) {
        dbStudentsCurrentPage = totalPages;
    }
    if (dbStudentsCurrentPage < 1) {
        dbStudentsCurrentPage = 1;
    }

    const startIndex = (dbStudentsCurrentPage - 1) * perPage;
    const endIndex = Math.min(filtered.length, startIndex + perPage);
    const paginatedStudents = filtered.slice(startIndex, endIndex);

    // 4. Render Table Rows (without code column)
    const rowsHtml = paginatedStudents.map(student => {
        const safeName = (student.studentName || 'Student').replace(/'/g, "\\'");
        const safeClass = (student.studentClass || '').replace(/'/g, "\\'");

        return `
        <tr>
            <td><strong style="font-weight: 600; color: var(--text-dark);">${student.studentName || 'N/A'}</strong></td>
            <td><span style="color: var(--primary-blue); font-weight: 600;">${student.studentClass || 'N/A'}</span></td>
            <td style="text-align: center;">
                <div class="kebab-menu">
                    <button class="kebab-btn" onclick="toggleMenu(event, 'dbstudent-${student.id}')">⋮</button>
                    <div id="menu-dbstudent-${student.id}" class="dropdown-menu">
                        <button class="dropdown-item" onclick="viewStudentCode('${student.id}', '${safeName}', '${safeClass}')">👁️ View Student Code</button>
                        <button class="dropdown-item" onclick="editStudentProfile('${student.id}')">✏️ Edit Student Profile</button>
                        <button class="dropdown-item" onclick="generateNewUniqueCode('${student.id}')">🔄 Generate New Code</button>
                        <button class="dropdown-item danger" onclick="deleteStudentProfile('${student.id}')">🗑️ Delete Student</button>
                    </div>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = rowsHtml.join('');

    // 5. Render Pagination Info & Buttons
    if (pageInfo) {
        pageInfo.innerText = `Showing ${startIndex + 1} to ${endIndex} of ${filtered.length} students`;
    }

    if (pageButtons) {
        if (totalPages <= 1) {
            pageButtons.innerHTML = '';
        } else {
            let btnsHtml = `
                <button class="db-page-btn" ${dbStudentsCurrentPage === 1 ? 'disabled' : ''} onclick="goToDbStudentsPage(${dbStudentsCurrentPage - 1})">
                    &larr; Prev
                </button>
            `;

            // Smart page number buttons
            let startP = Math.max(1, dbStudentsCurrentPage - 2);
            let endP = Math.min(totalPages, startP + 4);
            if (endP - startP < 4) {
                startP = Math.max(1, endP - 4);
            }

            if (startP > 1) {
                btnsHtml += `<button class="db-page-btn" onclick="goToDbStudentsPage(1)">1</button>`;
                if (startP > 2) btnsHtml += `<span style="padding: 0 4px; color: var(--text-gray);">...</span>`;
            }

            for (let p = startP; p <= endP; p++) {
                btnsHtml += `
                    <button class="db-page-btn ${p === dbStudentsCurrentPage ? 'active' : ''}" onclick="goToDbStudentsPage(${p})">
                        ${p}
                    </button>
                `;
            }

            if (endP < totalPages) {
                if (endP < totalPages - 1) btnsHtml += `<span style="padding: 0 4px; color: var(--text-gray);">...</span>`;
                btnsHtml += `<button class="db-page-btn" onclick="goToDbStudentsPage(${totalPages})">${totalPages}</button>`;
            }

            btnsHtml += `
                <button class="db-page-btn" ${dbStudentsCurrentPage === totalPages ? 'disabled' : ''} onclick="goToDbStudentsPage(${dbStudentsCurrentPage + 1})">
                    Next &rarr;
                </button>
            `;

            pageButtons.innerHTML = btnsHtml;
        }
    }
};

function generateRandomCode(length = 5) {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

/**
 * Generates a guaranteed unique 5-character student code.
 * Checks Firestore to ensure the code does not already exist.
 */
async function generateUniqueStudentCode() {
    let isUnique = false;
    let newCode = '';

    while (!isUnique) {
        newCode = generateRandomCode(5);
        
        // Check if a student document with this code already exists in Firestore
        const studentRef = doc(db, "students", newCode);
        const studentSnap = await getDoc(studentRef);

        // If the snapshot does not exist, the code is unique and safe to use!
        if (!studentSnap.exists()) {
            isUnique = true;
        }
    }

    return newCode;
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
            
            if (data.studentClass) { 
                classesSet.add(data.studentClass.trim());
            }
        });

        // Naturally sort classes (e.g., Grade 7A, Grade 7B, Grade 10A, Grade 12)
        const sortedClasses = Array.from(classesSet).filter(Boolean).sort((a, b) => 
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );

        // Populate Database Class Filter dropdown
        const dbClassFilter = document.getElementById('filterDbStudentClass');
        if (dbClassFilter) {
            const currentSelected = dbClassFilter.value;
            let optionsHtml = '<option value="all">All Classes</option>';
            sortedClasses.forEach(className => {
                optionsHtml += `<option value="${className}">${className}</option>`;
            });
            dbClassFilter.innerHTML = optionsHtml;
            if (sortedClasses.includes(currentSelected)) {
                dbClassFilter.value = currentSelected;
            }
        }

        // Populate legacy filterClass dropdown if present
        const filterDropdown = document.getElementById('filterClass');
        if (filterDropdown) {
            filterDropdown.innerHTML = '<option value="all">All Classes</option>';
            sortedClasses.forEach(className => {
                filterDropdown.innerHTML += `<option value="${className}">${className}</option>`;
            });
        }

        // Populate Active Classes Table
        const classesTbody = document.querySelector("#classesTable tbody");
        if (classesTbody) {
            if (sortedClasses.length === 0) {
                classesTbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-gray);">No classes found.</td></tr>`;
            } else {
                classesTbody.innerHTML = sortedClasses.map(cls => `
                    <tr>
                        <td><strong>${cls}</strong></td>
                        <td><span style="color: #64748b; font-size: 13px;">Auto-detected from Students</span></td>
                    </tr>
                `).join('');
            }
        }

        if (typeof renderStudentsTable === "function") {
            renderStudentsTable();
        }
        if (typeof renderDbStudentsTable === "function") {
            renderDbStudentsTable();
        }
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

// --- BULK EXCEL PROCESSOR & FIRESTORE SYNCHRONIZER ---
async function processExcel() {
    const fileInput = document.getElementById('excelFile');
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) return alert("Select an Excel (.xlsx) file to upload first.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            let successCount = 0;
            let skippedCount = 0;

            for (const row of jsonData) {
                const code = String(row["Student Code"] || row["Code"] || "").toUpperCase().trim();
                const name = String(row["Student Name"] || row["Name"] || "").trim();
                const sClass = String(row["Class"] || "").trim();
                const examName = String(row["Exam Name"] || row["Exam"] || row["Quiz Name"] || "").trim();
                const fileSubject = String(row["Subject"] || "").trim();
                const subject = userRole === "admin" ? fileSubject : teacherSubject;
                
                const rawScore = row["Score"] !== undefined ? row["Score"] : row["score"];
                const score = parseInt(rawScore);

                // Check authorization for non-admin teachers
                if (userRole !== "admin" && fileSubject.toLowerCase() !== teacherSubject.toLowerCase()) {
                    skippedCount++;
                    continue; 
                }

                if (code && examName && subject && !isNaN(score)) {
                    // Unique Document ID pattern prevents duplicate score documents
                    const customDocId = `${code}_${subject}_${examName}`.replace(/[^a-zA-Z0-9_-]/g, "_");

                    await setDoc(doc(db, "exam_scores", customDocId), {
                        studentCode: code,
                        studentName: name || "Unknown",
                        studentClass: sClass || "N/A",
                        examName: examName,
                        quizName: examName,
                        subject: subject,
                        score: score,
                        updatedAt: new Date()
                    }, { merge: true });

                    successCount++;
                }
            }

            alert(`Excel Process Complete!\nUpdated/Saved: ${successCount} entries${skippedCount > 0 ? `\nSkipped (Unauthorized Subject): ${skippedCount}` : ''}`);
            fileInput.value = "";
            
            // Refresh admin table if active
            if (typeof loadAdminTable === "function") loadAdminTable();

        } catch (err) {
            alert("Error processing Excel file: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Re-bind upload button
document.getElementById('uploadExcelBtn')?.addEventListener('click', processExcel);

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

// --- TAB & SUB-TAB NAVIGATION LOGIC ---
window.switchDbView = function(viewName) {
    const validViews = ['students', 'teachers', 'quizzes', 'all'];
    if (!validViews.includes(viewName)) viewName = 'students';

    // 1. Update Sidebar Submenu Active States
    document.querySelectorAll('.submenu-btn').forEach(btn => btn.classList.remove('active'));
    const subtabMap = {
        'students': 'subtabStudents',
        'teachers': 'subtabTeachers',
        'quizzes': 'subtabQuizzes'
    };
    if (subtabMap[viewName]) {
        const activeSubBtn = document.getElementById(subtabMap[viewName]);
        if (activeSubBtn) activeSubBtn.classList.add('active');
    }

    // 2. Show/Hide Database Section Groups
    const secStudents = document.getElementById('db-section-students');
    const secTeachers = document.getElementById('db-section-teachers');
    const secQuizzes = document.getElementById('db-section-quizzes');

    if (secStudents) {
        secStudents.style.display = (viewName === 'all' || viewName === 'students') ? 'contents' : 'none';
    }
    if (secTeachers) {
        secTeachers.style.display = (viewName === 'all' || viewName === 'teachers') ? 'contents' : 'none';
    }
    if (secQuizzes) {
        secQuizzes.style.display = (viewName === 'all' || viewName === 'quizzes') ? 'contents' : 'none';
    }
};

// Main Menu Button Handlers
document.querySelectorAll('.menu-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const tabId = button.getAttribute('data-tab');
        const dbGroup = document.getElementById('groupDatabases');

        // Check if this is the expandable Databases menu item
        if (button.classList.contains('menu-btn-expandable') || button.id === 'menuAdminOnly') {
            if (dbGroup) {
                // If it's already active and open, toggle close; otherwise open
                if (button.classList.contains('active') && dbGroup.classList.contains('open')) {
                    dbGroup.classList.toggle('open');
                } else {
                    dbGroup.classList.add('open');
                }
            }
            // If no subtab is active, default to students view
            const activeSub = document.querySelector('.submenu-btn.active');
            if (!activeSub) {
                window.switchDbView('students');
            }
        } else {
            // Close database dropdown when navigating to a different main tab
            if (dbGroup) dbGroup.classList.remove('open');
            document.querySelectorAll('.submenu-btn').forEach(btn => btn.classList.remove('active'));
        }

        // Remove active from all main menu buttons and hide tab contents
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

        // Activate clicked button and corresponding tab
        button.classList.add('active');
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.add('active');
    });
});

// Sidebar Sub-menu Button Handlers (Databases -> Students, Teacher, Quiz)
document.querySelectorAll('.submenu-btn').forEach(subBtn => {
    subBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabId = subBtn.getAttribute('data-tab');
        const subtab = subBtn.getAttribute('data-subtab');
        const dbGroup = document.getElementById('groupDatabases');

        // Keep parent group open and parent button active
        if (dbGroup) dbGroup.classList.add('open');
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
        const parentBtn = document.getElementById('menuAdminOnly');
        if (parentBtn) parentBtn.classList.add('active');

        // Activate Databases tab content
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.add('active');

        // Switch to the specific sub-view
        if (subtab && typeof window.switchDbView === 'function') {
            window.switchDbView(subtab);
        }

        // Trigger system load if needed
        if (typeof window.loadSystemDatabases === "function") {
            window.loadSystemDatabases();
        }
    });
});



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
// --- OPTIMIZED DASHBOARD STATS CALCULATOR (PARALLEL FETCH) ---
async function updateDashboardStats() {
    try {
        // 1. Fire all 5 Firestore queries concurrently in a single parallel batch
        const [studentsSnap, usersSnap, pointsSnap, newsSnap, quizSnap] = await Promise.all([
            getDocs(collection(db, "students")),
            getDocs(collection(db, "users")),
            getDocs(collection(db, "student_points")),
            getDocs(collection(db, "news_updates")),
            getDocs(collection(db, "quizzes"))
        ]);

        // 2. Render Total Students Count
        const elTotalStudents = document.getElementById('stat-total-students');
        if (elTotalStudents) elTotalStudents.innerText = studentsSnap.size;

        // 3. Render Total Teachers Count
        let teacherCount = 0;
        usersSnap.forEach(doc => {
            if (doc.data().role === 'teacher') teacherCount++;
        });
        const elTotalTeachers = document.getElementById('stat-total-teachers');
        if (elTotalTeachers) elTotalTeachers.innerText = teacherCount;

        // 4. Calculate & Render Highest and Lowest Behavior Points
        const studentsMap = {};
        studentsSnap.forEach(doc => {
            studentsMap[doc.id] = { name: doc.data().studentName || 'N/A', total: 0 };
        });

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
            if (student.total > highestScore) { 
                highestScore = student.total; 
                highestName = student.name; 
            }
            if (student.total < lowestScore) { 
                lowestScore = student.total; 
                lowestName = student.name; 
            }
        }

        const elHighest = document.getElementById('stat-highest-behavior');
        const elLowest = document.getElementById('stat-lowest-behavior');

        if (hasStudents && highestScore !== -Infinity) {
            if (elHighest) elHighest.innerText = `${highestName} (${highestScore > 0 ? '+' : ''}${highestScore})`;
            if (elLowest) elLowest.innerText = `${lowestName} (${lowestScore > 0 ? '+' : ''}${lowestScore})`;
        } else {
            if (elHighest) elHighest.innerText = "N/A";
            if (elLowest) elLowest.innerText = "N/A";
        }

        // 5. Render Total News Count
        const elTotalNews = document.getElementById('stat-total-news');
        if (elTotalNews) elTotalNews.innerText = newsSnap.size;

        // 6. Render Total Quizzes Count
        const elTotalQuizzes = document.getElementById('stat-total-quizzes');
        if (elTotalQuizzes) elTotalQuizzes.innerText = quizSnap.size;

    } catch (e) {
        console.error("Dashboard stats calculation error:", e);
    }
}

// 2. Function to filter, sort, and render the table with hidden codes
// --- OPTIMIZED STUDENT TABLE RENDER ---
function renderStudentsTable() {
    const searchInput = document.getElementById('searchStudents');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const sortBy = document.getElementById('sortStudents')?.value || 'code';
    const filterByClass = document.getElementById('filterClass')?.value || 'all';
    
    // 1. Filter student array
    const filteredStudents = allStudentsData.filter(s => {
        const matchesSearch = !searchTerm || 
            (s.studentName && s.studentName.toLowerCase().includes(searchTerm)) ||
            (s.studentClass && s.studentClass.toLowerCase().includes(searchTerm)) || 
            (s.id && s.id.toLowerCase().includes(searchTerm));
                              
        const matchesClass = (filterByClass === 'all') || (s.studentClass === filterByClass);

        return matchesSearch && matchesClass;
    });

    // 2. Sort filtered array
    filteredStudents.sort((a, b) => {
        if (sortBy === 'name') return (a.studentName || '').localeCompare(b.studentName || '');
        if (sortBy === 'class') return (a.studentClass || '').localeCompare(b.studentClass || '');
        return (a.id || '').localeCompare(b.id || ''); 
    });

    const tbody = document.querySelector('#studentsTable tbody');
    if (!tbody) return;

    if (filteredStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-gray);">No matching students found.</td></tr>`;
        return;
    }

    // 3. BATCH DOM CREATION: Build HTML array in memory first
    const rowsHtml = filteredStudents.map(student => `
        <tr>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="code-${student.id}" style="font-weight: 600; letter-spacing: 2px;">•••••</span>
                    <button class="eye-btn" onclick="toggleCodeVisibility('${student.id}')" title="Show/Hide Code">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                            <path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/>
                        </svg>
                    </button>
                </div>
            </td>
            <td>${student.studentName}</td>
            <td><span style="color:var(--primary-blue); font-weight:600;">${student.studentClass || 'N/A'}</span></td>
            <td>
                <div class="kebab-menu">
                    <button class="kebab-btn" onclick="toggleMenu(event, '${student.id}')">⋮</button>
                    <div id="menu-${student.id}" class="dropdown-menu">
                        <button class="dropdown-item" onclick="editStudentProfile('${student.id}')">Edit Student</button>
                        <button class="dropdown-item" onclick="generateNewUniqueCode('${student.id}')">Generate New Code</button>
                        <button class="dropdown-item danger" onclick="deleteStudentProfile('${student.id}')">Delete Student</button>
                    </div>
                </div>
            </td>
        </tr>
    `);

    // 4. Inject into DOM ONCE to prevent lag and UI freezing
    tbody.innerHTML = rowsHtml.join('');
}

// Attach debounced event listener (200ms delay)
document.getElementById('searchStudents')?.addEventListener('input', debounce(renderStudentsTable, 200));

// 3. Event Listener for the Class Filter
document.getElementById('filterClass')?.addEventListener('change', renderStudentsTable);

// Search and sort listeners
document.getElementById('searchStudents')?.addEventListener('input', renderStudentsTable);
document.getElementById('sortStudents')?.addEventListener('change', renderStudentsTable);


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
document.getElementById('searchStudents')?.addEventListener('input', renderStudentsTable);
document.getElementById('sortStudents')?.addEventListener('change', renderStudentsTable);

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

// --- BULK UPLOAD STUDENTS LOGIC ---
async function processBulkStudents() {
    const fileInput = document.getElementById('bulkStudentsFile');
    const file = fileInput ? fileInput.files[0] : null;
    
    if (!file) {
        alert("Please select an Excel (.xlsx, .csv) file to upload.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            let successCount = 0;
            let skippedCount = 0;

            for (const row of jsonData) {
                // Support multiple possible header naming variations
                const name = row["Student Name"] || row["Name"] || row["studentName"];
                const sClass = row["Class"] || row["Class Room"] || row["studentClass"] || row["class"];

                if (name && sClass) {
                    const uniqueCode = await generateUniqueStudentCode();
                    
                    await setDoc(doc(db, "students", uniqueCode), {
                        studentName: String(name).trim(),
                        studentClass: String(sClass).trim()
                    });
                    
                    successCount++;
                } else {
                    skippedCount++;
                }
            }

            alert(`Bulk Student Registration Complete!\n• Created: ${successCount} profiles${skippedCount > 0 ? `\n• Skipped (Missing Name/Class): ${skippedCount}` : ''}`);
            
            fileInput.value = "";
            
            // Refresh directories and databases
            if (typeof loadStudentsDirectory === "function") loadStudentsDirectory();
            if (typeof renderDbStudentsTable === "function") renderDbStudentsTable();
            if (typeof loadPointsTable === "function") loadPointsTable();
            if (typeof window.loadSystemDatabases === "function") window.loadSystemDatabases();

        } catch (err) {
            alert("Error processing Excel file: " + err.message);
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Bind button event listener
document.getElementById('uploadBulkStudentsBtn')?.addEventListener('click', processBulkStudents);
// --- SAFE DATABASE LOAD FOR ADMINS & TEACHERS ---
// --- UNIFIED SYSTEM DATABASE LOADER ---
window.loadSystemDatabases = async function() {
    try {
        console.log("--- STARTING DATABASE LOAD ---");
        
        // 1. Fetch Subject Dropdown Elements
        const subjTbody = document.querySelector("#subjectsTable tbody");
        const subjSelect = document.getElementById("directSubjectSelect");
        const ledgerSubjSelect = document.getElementById("ledgerSubjectSelect");
        const quizSubjSelect = document.getElementById("quizSubject");
        const manualQuizSubjSelect = document.getElementById("newManualQuizSubject");
        const bulkSubjSelect = document.getElementById("bulkSubjectSelect"); // Bulk Upload Dropdown

        // Reset Subject Dropdowns
        if(subjTbody) subjTbody.innerHTML = "";
        if(subjSelect) subjSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        if(ledgerSubjSelect) ledgerSubjSelect.innerHTML = '<option value="">-- Choose a Subject --</option>';
        if(quizSubjSelect) quizSubjSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        if(manualQuizSubjSelect) manualQuizSubjSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        if(bulkSubjSelect) bulkSubjSelect.innerHTML = '<option value="">-- Select Subject --</option>';

        // 2. Extract & Populate Unique Subjects
        const uniqueSubjects = new Set();

        if (userRole === 'admin') {
            try {
                const usersSnap = await getDocs(collection(db, "users"));
                usersSnap.forEach(doc => {
                    const data = doc.data();
                    const sub = data.subject || data.Subject || data.course; 
                    if (data.role === 'teacher' && sub && sub !== "Unassigned") {
                        sub.split(',').map(s => s.trim()).filter(Boolean).forEach(s => uniqueSubjects.add(s));
                    }
                });
            } catch (err) {
                console.warn("User collection read restricted:", err.message);
            }
        } else if (teacherSubject && teacherSubject !== "Unassigned") {
            teacherSubject.split(',').map(s => s.trim()).filter(Boolean).forEach(s => uniqueSubjects.add(s));
        }

        // Loop and populate subject options
        Array.from(uniqueSubjects).sort().forEach(name => {
            if(subjTbody) subjTbody.innerHTML += `<tr><td><strong>${name}</strong></td><td><span style="background: #eef2ff; color: var(--primary-blue); padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Teacher Linked</span></td></tr>`;
            if(subjSelect) subjSelect.innerHTML += `<option value="${name}">${name}</option>`;
            if(ledgerSubjSelect) ledgerSubjSelect.innerHTML += `<option value="${name}">${name}</option>`;
            if(quizSubjSelect) quizSubjSelect.innerHTML += `<option value="${name}">${name}</option>`;
            if(manualQuizSubjSelect) manualQuizSubjSelect.innerHTML += `<option value="${name}">${name}</option>`;
            if(bulkSubjSelect) bulkSubjSelect.innerHTML += `<option value="${name}">${name}</option>`;
        });

        // Pre-select assigned subject for teacher accounts
        if (userRole !== 'admin' && teacherSubject) {
            if (subjSelect) subjSelect.value = teacherSubject;
            if (ledgerSubjSelect) ledgerSubjSelect.value = teacherSubject;
            if (bulkSubjSelect) bulkSubjSelect.value = teacherSubject;
        }

        // 3. Fetch Class Dropdown Elements
        const classTbody = document.querySelector("#classesTable tbody");
        const classSelect = document.getElementById("directClassSelect");
        const ledgerClassSelect = document.getElementById("ledgerClassSelect");
        const quizClassSelect = document.getElementById("quizTargetClass");
        const manualQuizClassSelect = document.getElementById("newManualQuizClass");
        const bulkClassSelect = document.getElementById("bulkClassSelect"); // Bulk Upload Dropdown

        // Reset Class Dropdowns
        if(classTbody) classTbody.innerHTML = "";
        if(classSelect) classSelect.innerHTML = '<option value="">-- Select Class --</option>';
        if(ledgerClassSelect) ledgerClassSelect.innerHTML = '<option value="">-- Choose a Class --</option>';
        if(quizClassSelect) quizClassSelect.innerHTML = '<option value="">-- Select Target Class --</option><option value="All Classes">All Classes</option>';
        if(manualQuizClassSelect) manualQuizClassSelect.innerHTML = '<option value="">-- Select Target Class --</option><option value="All Classes">All Classes</option>';
        if(bulkClassSelect) bulkClassSelect.innerHTML = '<option value="">-- Select Class --</option>';

        // 4. Extract & Populate Unique Classes from Student Records
        try {
            const studentsSnap = await getDocs(collection(db, "students"));
            const uniqueClasses = new Set();
            studentsSnap.forEach(doc => {
                const data = doc.data();
                const studentClass = data.studentClass || data.class || data.className || data.Class;
                if (studentClass) uniqueClasses.add(studentClass);
            });

            const sortedClasses = Array.from(uniqueClasses).sort();

            // Populate multi-select checkbox options for Manual Offline Exam
            const manualQuizOptionsContainer = document.getElementById("manualQuizClassOptions");
            if (manualQuizOptionsContainer) {
                let optionsHtml = `
                    <label class="multi-select-option-row">
                        <input type="checkbox" value="All Classes" onchange="onManualQuizClassCheckboxChange()">
                        <span>All Classes</span>
                    </label>
                `;
                sortedClasses.forEach(name => {
                    optionsHtml += `
                        <label class="multi-select-option-row">
                            <input type="checkbox" value="${name}" onchange="onManualQuizClassCheckboxChange()">
                            <span>${name}</span>
                        </label>
                    `;
                });
                manualQuizOptionsContainer.innerHTML = optionsHtml;
                updateManualQuizClassLabel();
            }

            // Loop and populate class options for standard select elements
            sortedClasses.forEach(name => {
                if(classTbody) classTbody.innerHTML += `<tr><td><strong>${name}</strong></td><td><span style="background: #ecfdf5; color: #10b981; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Student Linked</span></td></tr>`;
                if(classSelect) classSelect.innerHTML += `<option value="${name}">${name}</option>`;
                if(ledgerClassSelect) ledgerClassSelect.innerHTML += `<option value="${name}">${name}</option>`;
                if(quizClassSelect) quizClassSelect.innerHTML += `<option value="${name}">${name}</option>`;
                if(manualQuizClassSelect) manualQuizClassSelect.innerHTML += `<option value="${name}">${name}</option>`;
                if(bulkClassSelect) bulkClassSelect.innerHTML += `<option value="${name}">${name}</option>`;
            });
        } catch (err) {
            console.warn("Students collection read restricted:", err.message);
        }

        // 5. Populate Quizzes Table (Digital + Offline)
        const quizTbody = document.querySelector("#quizzesDatabaseTable tbody");
        if (quizTbody) {
            try {
                // Fetch digital and offline quizzes simultaneously
                const [digitalSnap, manualSnap] = await Promise.all([
                    getDocs(collection(db, "quizzes")),
                    getDocs(collection(db, "system_quizzes"))
                ]);

                const quizRows = [];

                // 1. Process Digital Quizzes (from Quiz Builder)
                digitalSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const title = data.title || data.quizName;
                    const sub = data.subject || '-';
                    const cls = data.targetClass || '-';

                    if (title) {
                        quizRows.push(`
                            <tr>
                                <td><strong>${title}</strong></td>
                                <td>${sub}</td>
                                <td>${cls}</td>
                                <td><span style="background: #fffbeb; color: #f59e0b; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Quiz Builder</span></td>
                                <td>-</td>
                            </tr>
                        `);
                    }
                });

                // 2. Process Offline Quizzes (Manual Exams)
                manualSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const title = data.name;
                    const sub = data.subject || '-';
                    const cls = data.targetClass || '-';

                    if (title) {
                        quizRows.push(`
                            <tr>
                                <td><strong>${title}</strong></td>
                                <td>${sub}</td>
                                <td>${cls}</td>
                                <td><span style="background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">Offline Exam</span></td>
                                <td><button class="delete-btn" onclick="deleteSystemRecord('system_quizzes', '${docSnap.id}')">Delete</button></td>
                            </tr>
                        `);
                    }
                });

                // 3. Inject into DOM in a single batch operation
                if (quizRows.length > 0) {
                    quizTbody.innerHTML = quizRows.join('');
                } else {
                    quizTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-gray);">No quizzes or exams found in database.</td></tr>`;
                }

            } catch (err) {
                console.warn("Error loading quiz records:", err.message);
                quizTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Error loading quiz database.</td></tr>`;
            }
        }
        
        if (typeof renderDbStudentsTable === "function") {
            renderDbStudentsTable();
        }
        console.log("--- DATABASE LOAD COMPLETE ---");

    } catch(e) {
        console.error("Error loading linked databases:", e.message);
    }
};

// --- MULTI-SELECT CHECKBOX DROPDOWN LOGIC ---
window.toggleMultiSelectDropdown = function(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.multi-select-dropdown').forEach(d => d.classList.remove('open'));
    if (!isOpen) dropdown.classList.add('open');
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-dropdown')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => d.classList.remove('open'));
    }
});

window.onManualQuizClassCheckboxChange = function() {
    updateManualQuizClassLabel();
};

function getSelectedManualQuizClasses() {
    const checkboxes = document.querySelectorAll('#manualQuizClassOptions input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    return selected;
}

function updateManualQuizClassLabel() {
    const label = document.getElementById('manualQuizClassLabel');
    if (!label) return;
    const selected = getSelectedManualQuizClasses();
    if (selected.length === 0) {
        label.innerText = '-- Select Target Class --';
    } else if (selected.includes('All Classes')) {
        label.innerText = 'All Classes';
    } else if (selected.length === 1) {
        label.innerText = selected[0];
    } else {
        label.innerText = `${selected.length} Classes Selected (${selected.join(', ')})`;
    }
}

// --- ACTIVE CLASSES & SUBJECTS SHOW/HIDE TOGGLE LOGIC ---
window.toggleActiveClassesTable = function() {
    const container = document.getElementById('containerClassesTable');
    const btn = document.getElementById('btnToggleClassesTable');
    if (!container || !btn) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.innerText = 'Hide Table';
        btn.style.background = '#64748b';
    } else {
        container.classList.add('hidden');
        btn.innerText = 'Show Table';
        btn.style.background = 'var(--primary-blue)';
    }
};

window.toggleActiveSubjectsTable = function() {
    const container = document.getElementById('containerSubjectsTable');
    const btn = document.getElementById('btnToggleSubjectsTable');
    if (!container || !btn) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.innerText = 'Hide Table';
        btn.style.background = '#64748b';
    } else {
        container.classList.add('hidden');
        btn.innerText = 'Show Table';
        btn.style.background = 'var(--primary-blue)';
    }
};

// --- DATABASE INITIALIZATION EVENT LISTENERS ---
document.addEventListener("DOMContentLoaded", () => {
    // Initial system load on page boot
    if (typeof window.loadSystemDatabases === "function") {
        window.loadSystemDatabases();
    }

    // FIX: Attach event listener to the sidebar MENU BUTTON instead of the tab content container
    const manageDatabasesBtn = document.querySelector('[data-tab="tab-view-ledgers"]'); 
    if (manageDatabasesBtn) {
        manageDatabasesBtn.addEventListener('click', () => {
            if (typeof window.loadSystemDatabases === "function") {
                window.loadSystemDatabases();
            }
        });
    }
});

async function addManualQuiz() {
    const input = document.getElementById('newManualQuiz');
    const subjectSelect = document.getElementById('newManualQuizSubject');
    const submitBtn = document.querySelector("button[onclick='addManualQuiz()']");

    const examName = input ? input.value.trim() : "";
    const subject = subjectSelect ? subjectSelect.value : "";
    const selectedClasses = getSelectedManualQuizClasses();
    const targetClassStr = selectedClasses.includes("All Classes") ? "All Classes" : selectedClasses.join(", ");

    // 1. Validate Form Inputs
    if (!examName || !subject || selectedClasses.length === 0) {
        alert("Please enter an Exam Name, select a Subject, and check at least one Target Class.");
        return;
    }

    try {
        // 2. Lock UI Button to prevent rapid double-clicks
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Checking & Adding...";
        }

        // 3. Query Firestore for Existing Duplicates
        const dupQuery = query(
            collection(db, "system_quizzes"),
            where("name", "==", examName),
            where("subject", "==", subject),
            where("targetClass", "==", targetClassStr)
        );
        const dupSnap = await getDocs(dupQuery);

        if (!dupSnap.empty) {
            alert(`Duplicate Exam Blocked!\nAn offline exam named "${examName}" already exists for ${subject} (${targetClassStr}).`);
            return;
        }

        // 4. Create New Offline Exam Document
        await addDoc(collection(db, "system_quizzes"), {
            name: examName,
            subject: subject,
            targetClass: targetClassStr,
            targetClassesList: selectedClasses,
            createdAt: new Date().toISOString()
        });
        
        alert(`Offline exam "${examName}" added successfully for target classes: ${targetClassStr}!`);
        
        // Reset Inputs
        input.value = "";
        subjectSelect.value = "";
        document.querySelectorAll('#manualQuizClassOptions input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateManualQuizClassLabel();
        
        // Refresh Table Data
        if (typeof window.loadSystemDatabases === "function") {
            await window.loadSystemDatabases();
        }
    } catch (e) {
        alert("Error adding offline exam: " + e.message);
    } finally {
        // 5. Restore UI Button State
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Add Offline Exam";
        }
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

        // 3. Convert snapshots to array and sort alphabetically by Student Name (A to Z)
        let studentsList = [];
        studentsSnap.forEach(docSnap => {
            studentsList.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        studentsList.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

        // 4. Render sorted table rows and pre-fill input values
        tbody.innerHTML = "";

        studentsList.forEach(data => {
            const studentCode = data.id;
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
    const selectedSubject = document.getElementById('ledgerSubjectSelect')?.value;
    const selectedClass = document.getElementById('ledgerClassSelect')?.value;
    const selectedQuiz = document.getElementById('ledgerQuizSelect')?.value;
    const sortOption = document.getElementById('ledgerSortSelect')?.value || 'name_asc';

    if (!selectedSubject || !selectedClass || !selectedQuiz) {
        alert("Please select Subject, Class, and Quiz/Review to view the ledger.");
        return;
    }

    const viewBtn = document.getElementById('viewLedgerBtn'); 

    try {
        if (viewBtn) {
            viewBtn.innerText = "Loading...";
            viewBtn.disabled = true;
        }

        const tableContainer = document.getElementById('scoreLedgerContainer');
        if (tableContainer) tableContainer.style.display = 'block';

        const tbody = document.getElementById('manageScoreTbody');
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Fetching scores...</td></tr>";

        // Query unified exam_scores collection filtering by Subject, Class, and Exam
        const q = query(collection(db, "exam_scores"), 
            where("subject", "==", selectedSubject),
            where("studentClass", "==", selectedClass),
            where("examName", "==", selectedQuiz)
        );
        
        const snap = await getDocs(q);
        tbody.innerHTML = ""; 

        if (snap.empty) {
            tbody.innerHTML = "<tr><td colspan='7' style='text-align:center; color: red;'>No scores found for this Subject, Class, and Quiz combination.</td></tr>";
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

        // --- Render Full Ledger in Behavior Tab (without student code column) ---
        const ledgerTbody = document.querySelector("#behaviorTabPointsTable tbody");
        if (ledgerTbody) {
            ledgerTbody.innerHTML = "";
            Object.values(studentTotals)
                .sort((a, b) => b.total - a.total)
                .forEach(info => {
                    const color = info.total > 0 ? '#28a745' : (info.total < 0 ? '#dc3545' : '#333');
                    const sign = info.total > 0 ? '+' : '';
                    const safeName = (info.name || '').replace(/'/g, "\\'");

                    ledgerTbody.innerHTML += `<tr>
                        <td><strong>${info.name || 'N/A'}</strong></td>
                        <td><strong>${info.sClass || 'N/A'}</strong></td>
                        <td><strong style="color: ${color};">${sign}${info.total}</strong></td>
                        <td>
                            <div class="kebab-menu">
                                <button class="kebab-btn" onclick="toggleMenu(event, 'bhv-${info.code}')">⋮</button>
                                <div id="menu-bhv-${info.code}" class="dropdown-menu">
                                    <button class="dropdown-item" onclick="openBehaviorHistoryModal('${info.code}', '${safeName}')">View History</button>
                                </div>
                            </div>
                        </td>
                    </tr>`;
                });
        }

        // --- Render Behavior Analytics Bar Charts (Chart.js) ---
        renderBehaviorCharts(reasonStats);

    } catch(e) {
        console.error("Error generating behavior stats: ", e);
    }
}

let posChartInstance = null;
let negChartInstance = null;

function renderBehaviorCharts(reasonStats) {
    if (typeof Chart === 'undefined') return;

    const topPos = Object.values(reasonStats)
        .filter(r => r.posPts > 0)
        .sort((a, b) => b.posPts - a.posPts)
        .slice(0, 10);

    const topNeg = Object.values(reasonStats)
        .filter(r => r.negPts > 0)
        .sort((a, b) => b.negPts - a.negPts)
        .slice(0, 10);

    // 1. Positive Chart
    const posCanvas = document.getElementById('positiveReasonsChart');
    if (posCanvas) {
        if (posChartInstance) posChartInstance.destroy();
        posChartInstance = new Chart(posCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topPos.map(r => r.text),
                datasets: [{
                    label: 'Points Earned (+)',
                    data: topPos.map(r => r.posPts),
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // 2. Negative Chart
    const negCanvas = document.getElementById('negativeReasonsChart');
    if (negCanvas) {
        if (negChartInstance) negChartInstance.destroy();
        negChartInstance = new Chart(negCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: topNeg.map(r => r.text),
                datasets: [{
                    label: 'Points Deducted (-)',
                    data: topNeg.map(r => r.negPts),
                    backgroundColor: 'rgba(224, 45, 45, 0.7)',
                    borderColor: '#e02d2d',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
}

window.toggleBehaviorCharts = function() {
    const container = document.getElementById('containerBehaviorCharts');
    const btn = document.getElementById('btnToggleBehaviorCharts');
    if (!container || !btn) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.innerText = 'Hide Diagram';
        btn.style.background = '#64748b';
        if (typeof refreshBehaviorTabLedgers === 'function') refreshBehaviorTabLedgers();
    } else {
        container.classList.add('hidden');
        btn.innerText = 'Show Diagram';
        btn.style.background = 'var(--primary-blue)';
    }
};

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
const adminThemeIcon = document.getElementById('adminThemeIcon');
const adminThemeText = document.getElementById('adminThemeText');

// Google Drive Image URLs
const DARK_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1N2sZUgBKIQCviZYYm4ibVWCXc4XVhnnh';
const LIGHT_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1_NNJ0sMnU6x1pLW1GiV8FmfL9bPccVhd';

function applyAdminTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (adminThemeIcon) adminThemeIcon.src = LIGHT_MODE_ICON_URL;
        if (adminThemeText) adminThemeText.innerText = 'Light Mode';
    } else {
        document.body.classList.remove('dark-theme');
        if (adminThemeIcon) adminThemeIcon.src = DARK_MODE_ICON_URL;
        if (adminThemeText) adminThemeText.innerText = 'Dark Mode';
    }
}

// Load saved theme state
const savedAdminTheme = localStorage.getItem('appTheme') || 'light';
applyAdminTheme(savedAdminTheme);

// Handle toggle click
themeToggleBtn?.addEventListener('click', () => {
    const isDarkNow = document.body.classList.toggle('dark-theme');
    const newTheme = isDarkNow ? 'dark' : 'light';
    localStorage.setItem('appTheme', newTheme);
    applyAdminTheme(newTheme);
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

// --- TEACHER MASTER DIRECTORY LOGIC ---

async function loadTeachersDirectory() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        const tbody = document.querySelector("#teachersDirectoryTable tbody");
        if (!tbody) return;

        tbody.innerHTML = "";

        let teacherCount = 0;
        usersSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.role === 'teacher') {
                teacherCount++;
                const teacherId = docSnap.id;
                const teacherEmail = data.email || "N/A";
                
                // Safe check: Only run .split() if data.email is defined
                const fallbackName = data.email ? data.email.split('@')[0] : "Teacher";
                const teacherName = data.name || fallbackName;
                const teacherSubject = data.subject || "Unassigned";

                const safeName = teacherName.replace(/'/g, "\\'");
                const safeSubject = teacherSubject.replace(/'/g, "\\'");

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${teacherName}</strong></td>
                        <td>${teacherEmail}</td>
                        <td><span style="background: #eef2ff; color: var(--primary-blue); padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 13px;">${teacherSubject}</span></td>
                        <td>
                            <div class="kebab-menu">
                                <button class="kebab-btn" onclick="toggleMenu(event, 'teacher-${teacherId}')">⋮</button>
                                <div id="menu-teacher-${teacherId}" class="dropdown-menu">
                                    <button class="dropdown-item" onclick="editTeacherSubjectSpecialty('${teacherId}', '${safeName}', '${safeSubject}')">✏️ Edit Subject Specialty</button>
                                    <button class="dropdown-item" onclick="editTeacherProfile('${teacherId}', '${safeName}', '${safeSubject}')">Edit Details</button>
                                    <button class="dropdown-item" onclick="sendTeacherPasswordReset('${teacherEmail}')">Send Password Reset Email</button>
                                    <button class="dropdown-item danger" onclick="deleteTeacherAccount('${teacherId}', '${safeName}')">Delete Account</button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });

        if (teacherCount === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-gray);">No teacher accounts found in database.</td></tr>`;
        }

    } catch (error) {
        console.error("Error loading teachers directory:", error);
    }
}

window.editTeacherSubjectSpecialty = async function(uid, currentName, currentSubject) {
    const promptMsg = `Modify Subject Specialty for ${currentName}:\n(For multiple subjects, separate with commas, e.g., "English G10, English G11, Seni Rupa")`;
    const newSubject = prompt(promptMsg, currentSubject);
    if (newSubject === null) return;

    if (!newSubject.trim()) {
        alert("Subject Specialty cannot be left empty.");
        return;
    }

    try {
        await updateDoc(doc(db, "users", uid), {
            subject: newSubject.trim()
        });

        alert(`Subject specialty updated successfully for ${currentName}!\nAssigned Subjects: ${newSubject.trim()}`);
        loadTeachersDirectory();
        if (typeof window.loadSystemDatabases === "function") {
            window.loadSystemDatabases();
        }
    } catch (e) {
        alert("Error updating subject specialty: " + e.message);
    }
};

window.editTeacherProfile = async function(uid, currentName, currentSubject) {
    const newName = prompt("Modify Teacher Full Name:", currentName);
    if (newName === null) return;

    const newSubject = prompt("Modify Subject Specialty (comma separated for multiple):", currentSubject);
    if (newSubject === null) return;

    if (!newName.trim() || !newSubject.trim()) {
        alert("Teacher Name and Subject cannot be left empty.");
        return;
    }

    try {
        await updateDoc(doc(db, "users", uid), {
            name: newName.trim(),
            subject: newSubject.trim()
        });

        alert("Teacher details updated successfully!");
        loadTeachersDirectory();
        if (typeof window.loadSystemDatabases === "function") {
            window.loadSystemDatabases();
        }
    } catch (e) {
        alert("Error updating teacher record: " + e.message);
    }
};

window.sendTeacherPasswordReset = async function(email) {
    if (!email || email === "N/A") return alert("No valid email address available for this account.");

    if (confirm(`Send a password reset email to ${email}?`)) {
        try {
            await sendPasswordResetEmail(auth, email);
            alert(`Password reset link sent to ${email}. The teacher can follow the link to set a new password.`);
        } catch (e) {
            alert("Error sending reset email: " + e.message);
        }
    }
};

window.deleteTeacherAccount = async function(uid, teacherName) {
    if (confirm(`Are you sure you want to delete teacher account "${teacherName}" from the database?\n(Note: This removes their database record.)`)) {
        try {
            await deleteDoc(doc(db, "users", uid));
            alert("Teacher record deleted successfully.");
            loadTeachersDirectory();
            if (typeof window.loadSystemDatabases === "function") {
                window.loadSystemDatabases();
            }
        } catch (e) {
            alert("Error removing teacher record: " + e.message);
        }
    }
};

// --- SAFE QUIZ FILTERING ---
async function filterDirectQuizzes() {
    const subjectSelect = document.getElementById('directSubjectSelect');
    const classSelect = document.getElementById('directClassSelect');
    const quizSelect = document.getElementById('directQuizSelect');

    if (!quizSelect) return;

    const selectedSubject = subjectSelect ? subjectSelect.value.trim().toLowerCase() : "";
    const selectedClass = classSelect ? classSelect.value.trim().toLowerCase() : "";

    quizSelect.innerHTML = '<option value="">-- Select Quiz --</option>';

    if (!selectedSubject || !selectedClass) return;

    try {
        // 1. Digital Quizzes
        try {
            const digitalSnap = await getDocs(collection(db, "quizzes"));
            digitalSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = data.title || data.quizName || "";
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

                if (title && matchesSubject && matchesClass) {
                    quizSelect.innerHTML += `<option value="${title}">${title} (Digital)</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read digital quizzes:", err.message);
        }

        // 2. Offline Quizzes
        try {
            const manualSnap = await getDocs(collection(db, "system_quizzes"));
            manualSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = data.name || "";
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

                if (title && matchesSubject && matchesClass) {
                    quizSelect.innerHTML += `<option value="${title}">${title} (Offline)</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read offline quizzes:", err.message);
        }

    } catch (e) {
        console.error("Error filtering direct quizzes:", e.message);
    }
}

// --- DYNAMIC QUIZ FILTERING FOR LEDGER ---
async function filterLedgerQuizzes() {
    const subjectSelect = document.getElementById('ledgerSubjectSelect');
    const classSelect = document.getElementById('ledgerClassSelect');
    const quizSelect = document.getElementById('ledgerQuizSelect');

    if (!quizSelect) return;

    const selectedSubject = subjectSelect ? subjectSelect.value.trim().toLowerCase() : "";
    const selectedClass = classSelect ? classSelect.value.trim().toLowerCase() : "";

    quizSelect.innerHTML = '<option value="">-- Choose a Quiz / Review --</option>';

    if (!selectedSubject || !selectedClass) return;

    try {
        // 1. Digital Quizzes
        try {
            const digitalSnap = await getDocs(collection(db, "quizzes"));
            digitalSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = data.title || data.quizName || "";
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

                if (title && matchesSubject && matchesClass) {
                    quizSelect.innerHTML += `<option value="${title}">${title} (Digital)</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read digital quizzes:", err.message);
        }

        // 2. Offline Quizzes
        try {
            const manualSnap = await getDocs(collection(db, "system_quizzes"));
            manualSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = data.name || "";
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

                if (title && matchesSubject && matchesClass) {
                    quizSelect.innerHTML += `<option value="${title}">${title} (Offline)</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read offline quizzes:", err.message);
        }

    } catch (e) {
        console.error("Error filtering ledger quizzes:", e.message);
    }
}

// --- DYNAMIC QUIZ FILTERING FOR BULK TEMPLATE ---
async function filterBulkQuizzes() {
    const subjectSelect = document.getElementById('bulkSubjectSelect');
    const classSelect = document.getElementById('bulkClassSelect');
    const quizSelect = document.getElementById('bulkQuizSelect');

    if (!quizSelect) return;

    const selectedSubject = subjectSelect ? subjectSelect.value.trim().toLowerCase() : "";
    const selectedClass = classSelect ? classSelect.value.trim().toLowerCase() : "";

    quizSelect.innerHTML = '<option value="">-- Select Quiz --</option>';

    if (!selectedSubject || !selectedClass) return;

    try {
        // Fetch Digital Quizzes
        const digitalSnap = await getDocs(collection(db, "quizzes"));
        digitalSnap.forEach(docSnap => {
            const data = docSnap.data();
            const title = data.title || data.quizName || "";
            const qSubject = (data.subject || "").trim().toLowerCase();
            const qClass = (data.targetClass || "").trim().toLowerCase();

            const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject);
            const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

            if (title && matchesSubject && matchesClass) {
                quizSelect.innerHTML += `<option value="${title}">${title} (Digital)</option>`;
            }
        });

        // Fetch Offline Quizzes
        const manualSnap = await getDocs(collection(db, "system_quizzes"));
        manualSnap.forEach(docSnap => {
            const data = docSnap.data();
            const title = data.name || "";
            const qSubject = (data.subject || "").trim().toLowerCase();
            const qClass = (data.targetClass || "").trim().toLowerCase();

            const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject);
            const matchesClass = !qClass || qClass === selectedClass || qClass === "all classes" || qClass === "all";

            if (title && matchesSubject && matchesClass) {
                quizSelect.innerHTML += `<option value="${title}">${title} (Offline)</option>`;
            }
        });
    } catch (e) {
        console.error("Error filtering bulk quizzes:", e.message);
    }
}

// --- AUTOMATED EXCEL TEMPLATE GENERATOR ---
async function downloadScoreTemplate() {
    const subject = document.getElementById('bulkSubjectSelect')?.value;
    const studentClass = document.getElementById('bulkClassSelect')?.value;
    const quiz = document.getElementById('bulkQuizSelect')?.value;

    if (!subject || !studentClass || !quiz) {
        alert("Please select a Subject, Class, and Quiz before downloading the template.");
        return;
    }

    const downloadBtn = document.getElementById('downloadTemplateBtn');

    try {
        if (downloadBtn) {
            downloadBtn.innerText = "Generating...";
            downloadBtn.disabled = true;
        }

        // 1. Fetch students belonging to target class
        const studentsQuery = query(collection(db, "students"), where("studentClass", "==", studentClass));
        const studentsSnap = await getDocs(studentsQuery);

        if (studentsSnap.empty) {
            alert(`No students found registered under class "${studentClass}".`);
            return;
        }

        // 2. Query existing exam scores to pre-fill current grades if available
        const scoresQuery = query(
            collection(db, "exam_scores"),
            where("studentClass", "==", studentClass),
            where("subject", "==", subject),
            where("examName", "==", quiz)
        );
        const scoresSnap = await getDocs(scoresQuery);
        const existingScores = {};
        scoresSnap.forEach(docSnap => {
            const data = docSnap.data();
            existingScores[data.studentCode] = data.score;
        });

        // 3. Construct rows array
        let excelRows = [];
        studentsSnap.forEach(docSnap => {
            const sData = docSnap.data();
            const code = docSnap.id;
            const currentScore = existingScores[code] !== undefined ? existingScores[code] : "";

            excelRows.push({
                "Student Code": code,
                "Student Name": sData.studentName || "",
                "Class": studentClass,
                "Subject": subject,
                "Exam Name": quiz,
                "Score": currentScore
            });
        });

        // Sort alphabetically by Student Name (A-Z)
        excelRows.sort((a, b) => a["Student Name"].localeCompare(b["Student Name"]));

        // 4. Generate worksheet using SheetJS
        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Scores");

        // Format column widths for clarity
        worksheet["!cols"] = [
            { wch: 16 }, // Student Code
            { wch: 28 }, // Student Name
            { wch: 12 }, // Class
            { wch: 18 }, // Subject
            { wch: 24 }, // Exam Name
            { wch: 10 }  // Score
        ];

        // 5. Trigger download file
        const fileName = `ScoreTemplate_${studentClass}_${subject}_${quiz}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        XLSX.writeFile(workbook, `${fileName}.xlsx`);

    } catch (err) {
        console.error("Error generating template:", err);
        alert("Failed to generate Excel template: " + err.message);
    } finally {
        if (downloadBtn) {
            downloadBtn.innerText = "Download Template";
            downloadBtn.disabled = false;
        }
    }
}

window.openBehaviorHistoryModal = async function(studentCode, studentName) {
    const modal = document.getElementById('behaviorHistoryModal');
    const title = document.getElementById('historyModalTitle');
    const tbody = document.getElementById('historyDetailTbody');

    if (!modal || !tbody) return;

    title.innerText = `Behavior History: ${studentName} (${studentCode})`;
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading logs...</td></tr>`;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    try {
        const q = query(collection(db, "student_points"), where("studentCode", "==", studentCode));
        const snap = await getDocs(q);

        tbody.innerHTML = "";

        if (snap.empty) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-gray);">No behavior entries recorded for this student.</td></tr>`;
            return;
        }

        let entries = [];
        snap.forEach(docSnap => {
            entries.push({ docId: docSnap.id, ...docSnap.data() });
        });

        // Sort newest entries first
        entries.sort((a, b) => {
            const tA = a.timestamp ? (a.timestamp.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp).getTime()) : 0;
            const tB = b.timestamp ? (b.timestamp.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp).getTime()) : 0;
            return tB - tA;
        });

        entries.forEach(item => {
            const pts = parseFloat(item.points) || 0;
            const color = pts > 0 ? '#10b981' : (pts < 0 ? '#e02d2d' : 'var(--text-dark)');
            const sign = pts > 0 ? '+' : '';
            
            let dateStr = 'N/A';
            if (item.timestamp) {
                const d = item.timestamp.seconds ? new Date(item.timestamp.seconds * 1000) : new Date(item.timestamp);
                dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const safeReason = (item.reason || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeStudentName = studentName.replace(/'/g, "\\'");

            tbody.innerHTML += `
                <tr>
                    <td style="font-size: 12px; color: var(--text-gray);">${dateStr}</td>
                    <td>${item.reason || 'N/A'}</td>
                    <td><strong style="color: ${color};">${sign}${pts}</strong></td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button class="edit-btn" onclick="editPointEntry('${item.docId}', '${safeReason}', ${pts}, '${studentCode}', '${safeStudentName}')">Edit</button>
                            <button class="delete-btn" onclick="deletePointEntry('${item.docId}', '${studentCode}', '${safeStudentName}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Error fetching behavior history:", err);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading logs.</td></tr>`;
    }
};

window.closeBehaviorHistoryModal = function() {
    const modal = document.getElementById('behaviorHistoryModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.editPointEntry = async function(docId, currentReason, currentPoints, studentCode, studentName) {
    const newReason = prompt("Modify Reason / Event:", currentReason);
    if (newReason === null) return;

    const newPtsStr = prompt("Modify Point Value (+ or -):", currentPoints);
    if (newPtsStr === null) return;

    const newPts = parseFloat(newPtsStr);
    if (isNaN(newPts) || !newReason.trim()) {
        alert("Please provide a valid point number and reason.");
        return;
    }

    try {
        await updateDoc(doc(db, "student_points", docId), {
            reason: newReason.trim(),
            points: newPts
        });

        alert("Behavior entry updated successfully!");

        // Refresh History Modal and Ledgers
        openBehaviorHistoryModal(studentCode, studentName);
        refreshBehaviorTabLedgers();
        if (typeof loadPointsTable === "function") loadPointsTable();
    } catch (e) {
        alert("Error updating behavior entry: " + e.message);
    }
};

window.deletePointEntry = async function(docId, studentCode, studentName) {
    if (confirm("Are you sure you want to permanently delete this behavior entry?")) {
        try {
            await deleteDoc(doc(db, "student_points", docId));
            alert("Entry deleted successfully!");

            // Refresh History Modal and Ledgers
            openBehaviorHistoryModal(studentCode, studentName);
            refreshBehaviorTabLedgers();
            if (typeof loadPointsTable === "function") loadPointsTable();
        } catch (e) {
            alert("Error deleting behavior entry: " + e.message);
        }
    }
};

// Bind button listener
document.getElementById('downloadTemplateBtn')?.addEventListener('click', downloadScoreTemplate);
// Bind change listeners to update quizzes dynamically
document.getElementById('bulkSubjectSelect')?.addEventListener('change', filterBulkQuizzes);
document.getElementById('bulkClassSelect')?.addEventListener('change', filterBulkQuizzes);

// Bind change listeners for ledger dropdowns
document.getElementById('ledgerSubjectSelect')?.addEventListener('change', filterLedgerQuizzes);
document.getElementById('ledgerClassSelect')?.addEventListener('change', filterLedgerQuizzes);

// Bind change listeners to update quiz options dynamically
document.getElementById('directSubjectSelect')?.addEventListener('change', filterDirectQuizzes);
document.getElementById('directClassSelect')?.addEventListener('change', filterDirectQuizzes);

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
document.getElementById('sortStudents')?.addEventListener('change', loadStudentsDirectory);
document.getElementById('sortScores')?.addEventListener('change', loadAdminTable);
document.getElementById('sortPoints')?.addEventListener('change', loadPointsTable);
window.editTeacherSubjectSpecialty = editTeacherSubjectSpecialty;
window.editTeacherProfile = editTeacherProfile;
window.deleteNewsUpdate = deleteNewsUpdate;