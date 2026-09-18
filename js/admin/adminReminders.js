// Assignment Reminder System (Admin / Teacher)
// Modular component extracted from admin.js

import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// Debounce helper
function debounce(func, delay = 200) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// Current auth/role context accessors
let getAuthUserRole = () => window.currentUserRole || 'admin';
let getTeacherSubject = () => window.currentTeacherSubject || null;

export function setupAssignmentReminderContext(options = {}) {
    if (typeof options.getUserRole === 'function') getAuthUserRole = options.getUserRole;
    if (typeof options.getTeacherSubject === 'function') getTeacherSubject = options.getTeacherSubject;
}

// ==========================================
// --- ASSIGNMENT REMINDER SYSTEM (ADMIN) ---
// ==========================================

let cachedAssignmentReminders = [];
let reminderListenerUnsubscribe = null;
let reminderListenersInitialized = false;

window.switchManageScoreSubtab = function (subtabName) {
    if (!subtabName) subtabName = 'score-input';

    const btnScores = document.getElementById('btnManageScoreScores');
    const btnReminder = document.getElementById('btnManageScoreReminder');
    const subBtnScores = document.getElementById('subtabScoreInput');
    const subBtnReminder = document.getElementById('subtabAssignmentReminder');
    const secScores = document.getElementById('sectionManageScoreInput');
    const secReminder = document.getElementById('sectionAssignmentReminder');

    if (subtabName === 'assignment-reminder') {
        if (btnScores) btnScores.classList.remove('active');
        if (btnReminder) btnReminder.classList.add('active');
        if (subBtnScores) subBtnScores.classList.remove('active');
        if (subBtnReminder) subBtnReminder.classList.add('active');

        if (secScores) {
            secScores.classList.add('hidden');
            secScores.style.display = 'none';
        }
        if (secReminder) {
            secReminder.classList.remove('hidden');
            secReminder.style.display = 'block';
        }

        initAssignmentReminderTab();
    } else {
        if (btnScores) btnScores.classList.add('active');
        if (btnReminder) btnReminder.classList.remove('active');
        if (subBtnScores) subBtnScores.classList.add('active');
        if (subBtnReminder) subBtnReminder.classList.remove('active');

        if (secScores) {
            secScores.classList.remove('hidden');
            secScores.style.display = 'block';
        }
        if (secReminder) {
            secReminder.classList.add('hidden');
            secReminder.style.display = 'none';
        }
    }
};

function initAssignmentReminderTab() {
    // 1. Set default due date to tomorrow if empty
    const dueInput = document.getElementById('reminderDueDateInput');
    if (dueInput && !dueInput.value) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dueInput.value = tomorrow.toISOString().split('T')[0];
    }

    // 2. Populate Dropdowns
    populateAssignmentReminderDropdowns();
    const directSubSelect = document.getElementById('directSubjectSelect');
    if ((!directSubSelect || directSubSelect.options.length <= 1) && typeof window.loadSystemDatabases === 'function') {
        window.loadSystemDatabases();
    }

    // 3. Initialize Event Listeners (once)
    if (!reminderListenersInitialized) {
        reminderListenersInitialized = true;

        const subSelect = document.getElementById('reminderSubjectSelect');
        const classSelect = document.getElementById('reminderClassSelect');
        const assignSelect = document.getElementById('reminderAssignmentSelect');

        subSelect?.addEventListener('change', () => {
            loadReminderAssignments();
        });

        classSelect?.addEventListener('change', () => {
            loadReminderAssignments();
            loadReminderStudents();
        });

        assignSelect?.addEventListener('change', () => {
            const customWrapper = document.getElementById('reminderCustomAssignmentWrapper');
            if (customWrapper) {
                if (assignSelect.value === '__custom__') {
                    customWrapper.classList.remove('hidden');
                    document.getElementById('reminderCustomAssignmentInput')?.focus();
                } else {
                    customWrapper.classList.add('hidden');
                }
            }
        });

        // Select All / Deselect All (Inside Split Button Dropdown Menu)
        document.getElementById('reminderSelectAllBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.reminder-student-cb').forEach(cb => {
                const parent = cb.closest('.reminder-student-item');
                if (!parent || parent.style.display !== 'none') {
                    cb.checked = true;
                }
            });
            updateReminderSelectedCount();
            closeReminderDeployDropdown();
        });

        document.getElementById('reminderDeselectAllBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.reminder-student-cb').forEach(cb => cb.checked = false);
            updateReminderSelectedCount();
            closeReminderDeployDropdown();
        });

        // Deploy Reminders Split Button & Options
        document.getElementById('btnDeployReminders')?.addEventListener('click', deployAssignmentReminders);
        const menuToggleBtn = document.getElementById('btnReminderDeployMenuToggle');
        if (menuToggleBtn) {
            menuToggleBtn.onclick = (e) => {
                toggleReminderDeployDropdown(e);
            };
        }

        document.getElementById('btnMenuDeploySelected')?.addEventListener('click', () => {
            closeReminderDeployDropdown();
            deployAssignmentReminders();
        });

        document.getElementById('btnMenuDeployAllClass')?.addEventListener('click', () => {
            closeReminderDeployDropdown();
            document.querySelectorAll('.reminder-student-cb').forEach(cb => {
                const parent = cb.closest('.reminder-student-item');
                if (!parent || parent.style.display !== 'none') {
                    cb.checked = true;
                }
            });
            updateReminderSelectedCount();
            deployAssignmentReminders();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const wrap = document.querySelector('.reminder-deploy-split-wrap');
            if (wrap && !wrap.contains(e.target)) {
                closeReminderDeployDropdown();
            }
        });

        // Tracker Table Filters & Checkboxes
        document.getElementById('filterReminderClass')?.addEventListener('change', renderAssignmentRemindersTable);
        document.getElementById('filterReminderSubject')?.addEventListener('change', renderAssignmentRemindersTable);
        document.getElementById('filterReminderStatus')?.addEventListener('change', renderAssignmentRemindersTable);
        document.getElementById('filterReminderSearch')?.addEventListener('input', debounce(renderAssignmentRemindersTable, 150));
        
        const reminderTable = document.getElementById('assignmentReminderTable');
        if (reminderTable) {
            ['change', 'click', 'input'].forEach(evt => {
                reminderTable.addEventListener(evt, (e) => {
                    if (e.target && e.target.classList.contains('reminder-table-row-cb')) {
                        window.updateBulkDeleteRemindersUI?.();
                    }
                });
            });
        }
    }

    // 4. Start real-time listener for reminder ledger
    listenAssignmentReminders();
    window.updateBulkDeleteRemindersUI?.();
}

function populateAssignmentReminderDropdowns() {
    const subSelect = document.getElementById('reminderSubjectSelect');
    const classSelect = document.getElementById('reminderClassSelect');
    const filterSub = document.getElementById('filterReminderSubject');
    const filterClass = document.getElementById('filterReminderClass');

    // Populate from directSelect options if available
    const directSubSelect = document.getElementById('directSubjectSelect');
    const directClassSelect = document.getElementById('directClassSelect');

    if (subSelect && directSubSelect && directSubSelect.options.length > 1) {
        subSelect.innerHTML = directSubSelect.innerHTML;
        const currentRole = getAuthUserRole();
        const curSubject = getTeacherSubject();
        if (currentRole !== 'admin' && curSubject) {
            subSelect.value = curSubject;
        }
    }

    if (filterSub && directSubSelect && directSubSelect.options.length > 1) {
        let opts = '<option value="">All Subjects</option>';
        for (let i = 0; i < directSubSelect.options.length; i++) {
            const opt = directSubSelect.options[i];
            if (opt.value) opts += `<option value="${opt.value}">${opt.text}</option>`;
        }
        filterSub.innerHTML = opts;
    }

    if (classSelect && directClassSelect && directClassSelect.options.length > 1) {
        classSelect.innerHTML = directClassSelect.innerHTML;
    }

    if (filterClass && directClassSelect && directClassSelect.options.length > 1) {
        let opts = '<option value="">All Classes</option>';
        for (let i = 0; i < directClassSelect.options.length; i++) {
            const opt = directClassSelect.options[i];
            if (opt.value) opts += `<option value="${opt.value}">${opt.text}</option>`;
        }
        filterClass.innerHTML = opts;
    }
}

async function loadReminderAssignments() {
    const subSelect = document.getElementById('reminderSubjectSelect');
    const classSelect = document.getElementById('reminderClassSelect');
    const assignSelect = document.getElementById('reminderAssignmentSelect');

    if (!assignSelect) return;

    const selectedSubject = subSelect ? subSelect.value.trim().toLowerCase() : "";
    const selectedClass = classSelect ? classSelect.value.trim().toLowerCase() : "";

    assignSelect.innerHTML = '<option value="">-- Select Assignment --</option>';

    if (!selectedSubject || !selectedClass) {
        assignSelect.innerHTML = '<option value="">-- Choose Subject & Class First --</option>';
        return;
    }

    const seenTitles = new Set();

    try {
        // 1. Digital Quizzes
        try {
            const digitalSnap = await getDocs(collection(db, "quizzes"));
            digitalSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = (data.title || data.quizName || "").trim();
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();
                const targetList = Array.isArray(data.targetClassesList) ? data.targetClassesList.map(c => c.toLowerCase()) : [];

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass ||
                    qClass === selectedClass ||
                    qClass === "all classes" ||
                    qClass === "all" ||
                    qClass.includes("all classes") ||
                    qClass.includes("all") ||
                    qClass.includes(selectedClass) ||
                    targetList.includes(selectedClass);

                if (title && matchesSubject && matchesClass && !seenTitles.has(title.toLowerCase())) {
                    seenTitles.add(title.toLowerCase());
                    assignSelect.innerHTML += `<option value="${escapeHtml(title)}">${escapeHtml(title)} (Digital Quiz)</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read digital quizzes for reminder:", err.message);
        }

        // 2. Offline & Classroom Quizzes from system_quizzes
        try {
            const manualSnap = await getDocs(collection(db, "system_quizzes"));
            manualSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = (data.name || "").trim();
                const qSubject = (data.subject || "").trim().toLowerCase();
                const qClass = (data.targetClass || "").trim().toLowerCase();
                const targetList = Array.isArray(data.targetClassesList) ? data.targetClassesList.map(c => c.toLowerCase()) : [];

                const matchesSubject = !qSubject || qSubject === selectedSubject || selectedSubject.includes(qSubject) || qSubject.includes(selectedSubject);
                const matchesClass = !qClass ||
                    qClass === selectedClass ||
                    qClass === "all classes" ||
                    qClass === "all" ||
                    qClass.includes("all classes") ||
                    qClass.includes("all") ||
                    qClass.includes(selectedClass) ||
                    targetList.includes(selectedClass);

                if (title && matchesSubject && matchesClass && !seenTitles.has(title.toLowerCase())) {
                    seenTitles.add(title.toLowerCase());
                    const tag = (data.source === "google_classroom" || data.gclassCourseWorkId) ? "Classroom Assignment" : "Offline Assignment";
                    assignSelect.innerHTML += `<option value="${escapeHtml(title)}">${escapeHtml(title)} (${tag})</option>`;
                }
            });
        } catch (err) {
            console.warn("Could not read system_quizzes for reminder:", err.message);
        }

        // 3. Fallback: Existing exam_scores titles
        try {
            const scoresSnap = await getDocs(collection(db, "exam_scores"));
            scoresSnap.forEach(docSnap => {
                const data = docSnap.data();
                const title = (data.examName || data.quizName || "").trim();
                const docSubj = (data.subject || "").trim().toLowerCase();
                const docClass = (data.studentClass || "").trim().toLowerCase();

                if (title && (docSubj === selectedSubject || !selectedSubject) && (docClass === selectedClass || !selectedClass)) {
                    if (!seenTitles.has(title.toLowerCase())) {
                        seenTitles.add(title.toLowerCase());
                        assignSelect.innerHTML += `<option value="${escapeHtml(title)}">${escapeHtml(title)} (Score Record)</option>`;
                    }
                }
            });
        } catch (err) {
            console.warn("Could not read exam scores for reminder:", err.message);
        }

    } catch (e) {
        console.error("Error loading reminder assignments:", e);
    }

    // Always add Custom Option
    assignSelect.innerHTML += `<option value="__custom__">+ Enter Custom Assignment Name...</option>`;
}

async function loadReminderStudents() {
    const classSelect = document.getElementById('reminderClassSelect');
    const container = document.getElementById('reminderStudentListContainer');
    if (!container) return;

    const selectedClass = classSelect ? classSelect.value.trim() : "";
    if (!selectedClass) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-gray); padding: 20px; font-size: 13px;">Please select a Class above to load students.</div>`;
        updateReminderSelectedCount();
        return;
    }

    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--primary-blue); padding: 20px; font-size: 13px;">Loading students for Class ${escapeHtml(selectedClass)}...</div>`;

    try {
        const q = query(collection(db, "students"), where("studentClass", "==", selectedClass));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">No students found in Class ${escapeHtml(selectedClass)}.</div>`;
            updateReminderSelectedCount();
            return;
        }

        const studentsList = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            studentsList.push({
                code: (d.studentCode || docSnap.id).toString().trim().toUpperCase(),
                name: d.studentName || d.name || "Student",
                studentClass: d.studentClass || selectedClass,
                photoUrl: d.photoUrl || d.photo || null
            });
        });

        // Sort alphabetically by name
        studentsList.sort((a, b) => a.name.localeCompare(b.name));

        let html = '';
        studentsList.forEach(s => {
            const initial = (s.name.charAt(0) || 'S').toUpperCase();
            const avatarHtml = s.photoUrl
                ? `<img src="${s.photoUrl}" alt="${escapeHtml(s.name)}" class="reminder-student-avatar" style="width: 28px; height: 28px; min-width: 28px; max-width: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
                : `<div class="reminder-student-avatar" style="width: 28px; height: 28px; min-width: 28px; max-width: 28px; border-radius: 50%; background: #1e5eff; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${initial}</div>`;

            html += `
                <label class="reminder-student-item" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 9px; cursor: pointer; transition: background 0.15s; user-select: none; box-sizing: border-box; min-width: 0; width: 100%;">
                    <input type="checkbox" class="reminder-student-cb" value="${escapeHtml(s.code)}" data-name="${escapeHtml(s.name)}" data-class="${escapeHtml(s.studentClass)}" onchange="updateReminderSelectedCount()" style="width: 17px !important; height: 17px !important; min-width: 17px !important; max-width: 17px !important; flex-shrink: 0 !important; display: inline-block !important; accent-color: var(--primary-blue, #1e5eff); cursor: pointer; margin: 0 !important; padding: 0 !important;">
                    ${avatarHtml}
                    <div class="reminder-student-info" style="overflow: hidden; line-height: 1.2; flex: 1 1 auto; min-width: 0;">
                        <div class="reminder-student-name" style="font-size: 13px; font-weight: 700; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.name)}</div>
                    </div>
                </label>
            `;
        });

        container.innerHTML = html;
        updateReminderSelectedCount();

    } catch (err) {
        console.error("Error loading students for reminder:", err);
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ef4444; padding: 20px; font-size: 13px;">Error loading students: ${escapeHtml(err.message)}</div>`;
    }
}

function updateReminderSelectedCount() {
    const total = document.querySelectorAll('.reminder-student-cb:checked').length;
    const badge = document.getElementById('reminderStudentCountBadge');
    if (badge) {
        badge.innerText = `${total} Selected`;
    }
    const dropdownCount = document.getElementById('reminderDropdownCount');
    if (dropdownCount) {
        dropdownCount.innerText = total;
    }
}

function toggleReminderDeployDropdown(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const menu = document.getElementById('reminderDeployDropdownMenu');
    const btn = document.getElementById('btnReminderDeployMenuToggle');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
}

function closeReminderDeployDropdown() {
    const menu = document.getElementById('reminderDeployDropdownMenu');
    const btn = document.getElementById('btnReminderDeployMenuToggle');
    if (menu) menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

window.toggleReminderDeployDropdown = toggleReminderDeployDropdown;
window.closeReminderDeployDropdown = closeReminderDeployDropdown;

async function deployAssignmentReminders() {
    const subject = document.getElementById('reminderSubjectSelect')?.value.trim();
    const studentClass = document.getElementById('reminderClassSelect')?.value.trim();
    const assignmentVal = document.getElementById('reminderAssignmentSelect')?.value.trim();
    const customTitle = document.getElementById('reminderCustomAssignmentInput')?.value.trim();
    const dueDate = document.getElementById('reminderDueDateInput')?.value.trim();
    const notes = document.getElementById('reminderNotesInput')?.value.trim() || '';

    const assignmentTitle = assignmentVal === '__custom__' ? customTitle : assignmentVal;

    if (!subject) return alert("Please select a Subject.");
    if (!studentClass) return alert("Please select a Class.");
    if (!assignmentTitle) return alert("Please select or enter an Assignment Name.");
    if (!dueDate) return alert("Please specify a Submission Due Date.");

    // Collect checked students
    const checkedCheckboxes = document.querySelectorAll('.reminder-student-cb:checked');
    if (checkedCheckboxes.length === 0) {
        return alert("Please select at least one student to receive this reminder.");
    }

    const studentsToRemind = [];
    checkedCheckboxes.forEach(cb => {
        studentsToRemind.push({
            code: cb.value,
            name: cb.getAttribute('data-name') || 'Student',
            studentClass: cb.getAttribute('data-class') || studentClass
        });
    });

    if (!confirm(`Deploy reminder for ${studentsToRemind.length} student(s) for "${assignmentTitle}" (Due: ${dueDate})?`)) {
        return;
    }

    const deployBtn = document.getElementById('btnDeployReminders');
    if (deployBtn) {
        deployBtn.disabled = true;
        deployBtn.innerHTML = `<span>Deploying ${studentsToRemind.length} Reminders...</span>`;
    }

    try {
        const createdBy = auth.currentUser?.email || "Teacher";
        const nowIso = new Date().toISOString();

        // Write each reminder document to Firestore
        const writePromises = studentsToRemind.map(s => {
            return addDoc(collection(db, "assignment_reminders"), {
                studentCode: s.code.toUpperCase(),
                studentName: s.name,
                studentClass: s.studentClass,
                subject: subject,
                assignmentTitle: assignmentTitle,
                dueDate: dueDate,
                notes: notes,
                status: "pending",
                createdBy: createdBy,
                createdAt: nowIso,
                completedAt: null
            });
        });

        await Promise.all(writePromises);

        alert(`Successfully deployed ${studentsToRemind.length} reminder(s) for "${assignmentTitle}"!`);

        // Uncheck all students
        document.querySelectorAll('.reminder-student-cb').forEach(cb => cb.checked = false);
        updateReminderSelectedCount();

    } catch (err) {
        console.error("Error deploying reminders:", err);
        alert("Failed to deploy reminders: " + err.message);
    } finally {
        if (deployBtn) {
            deployBtn.disabled = false;
            deployBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 2L11 13"></path>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>Deploy</span>`;
        }
    }
}

function getDaysLate(dueDateStr) {
    if (!dueDateStr) return 0;
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const parts = dueDateStr.split('-');
        if (parts.length !== 3) return 0;
        const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const diffMs = today.getTime() - due.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch (e) {
        return 0;
    }
}

function listenAssignmentReminders() {
    if (reminderListenerUnsubscribe) {
        reminderListenerUnsubscribe();
    }

    try {
        const q = collection(db, "assignment_reminders");
        reminderListenerUnsubscribe = onSnapshot(q, (snapshot) => {
            cachedAssignmentReminders = [];
            snapshot.forEach(docSnap => {
                cachedAssignmentReminders.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            renderAssignmentRemindersTable();
        }, (err) => {
            console.error("Assignment reminders snapshot error:", err);
        });
    } catch (e) {
        console.error("Failed to attach assignment reminders listener:", e);
    }
}

function renderAssignmentRemindersTable() {
    const tbody = document.getElementById('assignmentReminderTbody');
    if (!tbody) return;

    const filterClass = (document.getElementById('filterReminderClass')?.value || "").toLowerCase().trim();
    const filterSubject = (document.getElementById('filterReminderSubject')?.value || "").toLowerCase().trim();
    const filterStatus = document.getElementById('filterReminderStatus')?.value || "pending";
    const filterSearch = (document.getElementById('filterReminderSearch')?.value || "").toLowerCase().trim();

    let filtered = cachedAssignmentReminders.filter(r => {
        if (filterClass && (r.studentClass || "").toLowerCase() !== filterClass) return false;
        if (filterSubject && (r.subject || "").toLowerCase() !== filterSubject) return false;
        if (filterStatus !== 'all') {
            if (filterStatus === 'pending' && r.status !== 'pending') return false;
            if (filterStatus === 'completed' && r.status !== 'completed') return false;
        }
        if (filterSearch) {
            const matchName = (r.studentName || "").toLowerCase().includes(filterSearch);
            const matchCode = (r.studentCode || "").toLowerCase().includes(filterSearch);
            const matchTitle = (r.assignmentTitle || "").toLowerCase().includes(filterSearch);
            if (!matchName && !matchCode && !matchTitle) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-gray);">No assignment reminders match your filters.</td></tr>`;
        window.updateBulkDeleteRemindersUI?.();
        return;
    }

    // Sort by status (pending first), then by days late (most overdue first), then by student name
    filtered.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        const lateA = getDaysLate(a.dueDate);
        const lateB = getDaysLate(b.dueDate);
        if (lateA !== lateB) return lateB - lateA;
        return (a.studentName || "").localeCompare(b.studentName || "");
    });

    let html = '';
    filtered.forEach(item => {
        const daysLate = getDaysLate(item.dueDate);
        let dueDisplay = `<span style="font-weight: 600;">${escapeHtml(item.dueDate || 'No date')}</span>`;

        if (item.status === 'completed') {
            dueDisplay += ` <span style="background: rgba(16, 185, 129, 0.12); color: #10b981; font-weight: 700; font-size: 11px; padding: 2px 7px; border-radius: 4px; margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;">Submitted</span>`;
        } else if (daysLate > 1) {
            dueDisplay += ` <strong style="color: #ef4444; font-size: 11.5px; margin-left: 6px; background: rgba(239, 68, 68, 0.1); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3);">${daysLate}d Overdue</strong>`;
        } else if (daysLate === 1) {
            dueDisplay += ` <strong style="color: #ea580c; font-size: 11.5px; margin-left: 6px; background: rgba(249, 115, 22, 0.1); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(249, 115, 22, 0.3);">1d Overdue</strong>`;
        } else if (daysLate === 0) {
            dueDisplay += ` <strong style="color: #d97706; font-size: 11.5px; margin-left: 6px; background: rgba(245, 158, 11, 0.1); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);">Due Today</strong>`;
        } else {
            const inDays = Math.abs(daysLate);
            dueDisplay += ` <span style="color: var(--primary-blue); font-size: 11.5px; margin-left: 6px;">(in ${inDays}d)</span>`;
        }

        const isCompleted = item.status === 'completed';

        html += `
            <tr style="${isCompleted ? 'opacity: 0.65;' : ''}">
                <td style="text-align: center; padding: 8px 6px;">
                    <input type="checkbox" class="reminder-table-row-cb" value="${escapeHtml(item.id)}" onchange="window.updateBulkDeleteRemindersUI()" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary-blue); margin: 0;">
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(item.studentName || 'Student')}</div>
                </td>
                <td><span style="font-weight: 600;">${escapeHtml(item.studentClass || '')}</span></td>
                <td><span style="background: rgba(30,94,255,0.08); color: var(--primary-blue); padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11.5px;">${escapeHtml(item.subject || '')}</span></td>
                <td>
                    <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(item.assignmentTitle || '')}</div>
                    ${item.notes ? `<div style="font-size: 11px; color: var(--text-gray); font-style: italic;">${escapeHtml(item.notes)}</div>` : ''}
                </td>
                <td>${dueDisplay}</td>
                <td style="text-align: center; position: relative;">
                    <div class="kebab-wrapper" style="position: relative; display: inline-block;">
                        <button type="button" class="kebab-btn" onclick="toggleReminderKebabMenu(event, '${item.id}')" title="Actions">
                            ⋮
                        </button>
                        <div id="reminder-kebab-${item.id}" class="kebab-dropdown">
                            <button type="button" class="kebab-item" onclick="toggleAssignmentReminderStatus('${item.id}', '${isCompleted ? 'pending' : 'completed'}')">
                                <span>${isCompleted ? 'Mark Pending' : 'Mark as Done'}</span>
                            </button>
                            <button type="button" class="kebab-item danger" onclick="deleteAssignmentReminder('${item.id}')">
                                <span>Delete Reminder</span>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    window.updateBulkDeleteRemindersUI?.();
}

window.toggleReminderKebabMenu = function (e, id) {
    e.stopPropagation();
    const targetDropdown = document.getElementById(`reminder-kebab-${id}`);
    const isAlreadyOpen = targetDropdown && targetDropdown.classList.contains('show');

    document.querySelectorAll('.kebab-dropdown.show').forEach(d => {
        d.classList.remove('show');
    });

    if (targetDropdown && !isAlreadyOpen) {
        targetDropdown.classList.add('show');
    }
};

// Global click to dismiss kebab menus
document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-wrapper') && !e.target.closest('.kebab-menu')) {
        document.querySelectorAll('.kebab-dropdown.show').forEach(d => {
            d.classList.remove('show');
        });
    }
});

window.toggleAssignmentReminderStatus = async function (reminderId, newStatus) {
    // Close open kebab dropdowns
    document.querySelectorAll('.kebab-dropdown.show').forEach(d => d.classList.remove('show'));
    try {
        await updateDoc(doc(db, "assignment_reminders", reminderId), {
            status: newStatus,
            completedAt: newStatus === 'completed' ? new Date().toISOString() : null
        });
    } catch (e) {
        alert("Error updating reminder status: " + e.message);
    }
};

window.deleteAssignmentReminder = async function (reminderId) {
    // Close open kebab dropdowns
    document.querySelectorAll('.kebab-dropdown.show').forEach(d => d.classList.remove('show'));
    if (!confirm("Are you sure you want to delete this assignment reminder?")) return;
    try {
        await deleteDoc(doc(db, "assignment_reminders", reminderId));
    } catch (e) {
        alert("Error deleting reminder: " + e.message);
    }
};

window.deleteSelectedReminders = async function () {
    const checkedBoxes = Array.from(document.querySelectorAll('.reminder-table-row-cb:checked'));
    if (checkedBoxes.length === 0) {
        alert("Please select at least one reminder to delete.");
        return;
    }

    const count = checkedBoxes.length;
    if (!confirm(`Are you sure you want to delete ${count} selected assignment reminder(s)? This action cannot be undone.`)) {
        return;
    }

    const bulkBtn = document.getElementById('btnBulkDeleteReminders');
    if (bulkBtn) {
        bulkBtn.disabled = true;
        bulkBtn.innerHTML = `<span>Deleting ${count}...</span>`;
    }

    try {
        const deletePromises = checkedBoxes.map(cb => deleteDoc(doc(db, "assignment_reminders", cb.value)));
        await Promise.all(deletePromises);

        // Reset master checkbox and selected UI
        const masterCb = document.getElementById('selectAllRemindersTableCb');
        if (masterCb) masterCb.checked = false;
        window.updateBulkDeleteRemindersUI?.();

        alert(`Successfully deleted ${count} assignment reminder(s)!`);
    } catch (err) {
        console.error("Error bulk deleting assignment reminders:", err);
        alert("Failed to delete reminders: " + err.message);
    } finally {
        if (bulkBtn) {
            bulkBtn.disabled = false;
            window.updateBulkDeleteRemindersUI?.();
        }
    }
};

window.toggleSelectAllReminders = function (masterCb) {
    const isChecked = !!(masterCb && masterCb.checked);
    document.querySelectorAll('.reminder-table-row-cb').forEach(cb => {
        cb.checked = isChecked;
    });
    window.updateBulkDeleteRemindersUI?.();
};

window.updateBulkDeleteRemindersUI = function () {
    const allRowCbs = document.querySelectorAll('.reminder-table-row-cb');
    const checked = document.querySelectorAll('.reminder-table-row-cb:checked');
    const bulkBtn = document.getElementById('btnBulkDeleteReminders');
    const masterCb = document.getElementById('selectAllRemindersTableCb');

    const count = checked ? checked.length : 0;

    if (bulkBtn) {
        bulkBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete Selected (<span id="bulkDeleteReminderCount">${count}</span>)</span>`;

        if (count > 0) {
            bulkBtn.disabled = false;
            bulkBtn.classList.remove('disabled', 'hidden');
            bulkBtn.removeAttribute('disabled');
        } else {
            bulkBtn.disabled = true;
            bulkBtn.classList.add('disabled');
            bulkBtn.setAttribute('disabled', 'true');
        }
    }

    if (masterCb) {
        if (allRowCbs.length === 0) {
            masterCb.checked = false;
            masterCb.indeterminate = false;
        } else {
            masterCb.checked = (allRowCbs.length === count);
            masterCb.indeterminate = (count > 0 && count < allRowCbs.length);
        }
    }
};

window.updateReminderSelectedCount = updateReminderSelectedCount;
window.populateAssignmentReminderDropdowns = populateAssignmentReminderDropdowns;
window.initAssignmentReminderTab = initAssignmentReminderTab;

export {
    initAssignmentReminderTab,
    populateAssignmentReminderDropdowns,
    updateReminderSelectedCount
};