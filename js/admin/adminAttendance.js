// Students Attendance & Present List System (Admin & Teacher)
// Modular component extracted from admin.js

import { collection, getDocs, doc, deleteDoc, updateDoc, query, where, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// Utility debounce
function debounce(func, delay = 200) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// Auth / permission hooks
let getUserRole = () => window.currentUserRole || 'teacher';
let getTeacherSubject = () => window.currentTeacherSubject || 'Unassigned';

export function setupAttendanceContext(options = {}) {
    if (typeof options.getUserRole === 'function') getUserRole = options.getUserRole;
    if (typeof options.getTeacherSubject === 'function') getTeacherSubject = options.getTeacherSubject;
}

// ======================================================
// STUDENTS ATTENDANCE & PRESENT LIST SYSTEM (ADMIN/TEACHER)
// ======================================================

window.escapeHtml = escapeHtml;

let activeAttendanceSession = null;
let attendanceEnrolledStudents = [];
let attendanceRecordsMap = {}; // keyed by studentCode
let currentAttStatusFilter = 'all';
let attSearchQuery = '';
let attendanceRecordsUnsubscribe = null;

async function initAttendanceTab() {
    try {
        const dateInput = document.getElementById('attSessionDate');
        const subjectSelect = document.getElementById('attSessionSubject');
        const classSelect = document.getElementById('attSessionClass');

        // Set default date to today in YYYY-MM-DD
        if (dateInput && !dateInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }

        // Populate Subjects
        await populateAttendanceSubjects();

        // Populate Classes
        await populateAttendanceClasses();

        // Attach change events
        dateInput?.addEventListener('change', () => checkAndLoadAttendance());
        subjectSelect?.addEventListener('change', () => checkAndLoadAttendance());
        classSelect?.addEventListener('change', () => checkAndLoadAttendance());

        // Buttons
        document.getElementById('btnDeployAttendanceSession')?.addEventListener('click', deployAttendanceSession);
        document.getElementById('btnCloseAttendanceSession')?.addEventListener('click', closeAttendanceSession);
        document.getElementById('btnRefreshAttendance')?.addEventListener('click', () => checkAndLoadAttendance());
        document.getElementById('btnExportAttendanceExcel')?.addEventListener('click', exportAttendanceToExcel);
        document.getElementById('btnPrintAttendance')?.addEventListener('click', () => window.print());

        // Close dropdown when any action item is clicked
        document.getElementById('attActionDropdownMenu')?.addEventListener('click', (e) => {
            if (e.target.closest('.att-action-dropdown-item')) {
                closeAllAttDropdowns();
            }
        });

        // Search Input
        const searchInput = document.getElementById('attSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                attSearchQuery = e.target.value.trim().toLowerCase();
                renderAttendanceTable();
            }, 200));
        }

        // Initial check if values are ready
        if (subjectSelect?.value && classSelect?.value) {
            await checkAndLoadAttendance();
        }

        // Load Attendance Analytics Dashboard Data
        if (typeof window.loadAttendanceAnalyticsData === 'function') {
            window.loadAttendanceAnalyticsData();
        }
    } catch (err) {
        console.error("Error initializing attendance tab:", err);
    }
}

async function populateAttendanceSubjects() {
    const subjectSelect = document.getElementById('attSessionSubject');
    if (!subjectSelect) return;

    const previousVal = subjectSelect.value;
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';

    const uniqueSubjects = new Set();
    const currentRole = getUserRole();
    if (currentRole === 'admin') {
        try {
            const usersSnap = await getDocs(collection(db, "users"));
            usersSnap.forEach(docSnap => {
                const data = docSnap.data();
                const sub = data.subject || data.Subject || data.course;
                if (data.role === 'teacher' && sub && sub !== "Unassigned") {
                    sub.split(',').map(s => s.trim()).filter(Boolean).forEach(s => uniqueSubjects.add(s));
                }
            });
        } catch (e) {
            console.warn("Could not query teacher subjects from users collection:", e);
        }
    } else if (teacherSubject && teacherSubject !== "Unassigned") {
        curSub.split(',').map(s => s.trim()).filter(Boolean).forEach(s => uniqueSubjects.add(s));
    }

    // Populate dropdown with database-synced teacher subjects
    Array.from(uniqueSubjects).sort().forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        subjectSelect.appendChild(opt);
    });

    if (userRole === 'teacher' && teacherSubject && teacherSubject !== "Unassigned") {
        const teacherSubs = teacherSubject.split(',').map(s => s.trim()).filter(Boolean);
        if (teacherSubs.length > 0) {
            subjectSelect.value = teacherSubs[0];
            if (teacherSubs.length === 1) {
                subjectSelect.disabled = true;
            } else {
                subjectSelect.disabled = false;
            }
        }
    } else if (previousVal && uniqueSubjects.has(previousVal)) {
        subjectSelect.value = previousVal;
    } else if (subjectSelect.options.length > 1) {
        subjectSelect.selectedIndex = 1;
    }
}

async function populateAttendanceClasses() {
    const classSelect = document.getElementById('attSessionClass');
    if (!classSelect) return;

    const previousVal = classSelect.value;
    classSelect.innerHTML = '<option value="">-- Select Class --</option>';

    const uniqueClasses = new Set();
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        studentsSnap.forEach(docSnap => {
            const d = docSnap.data();
            const c = (d.studentClass || d.class || '').trim();
            if (c) uniqueClasses.add(c);
        });
    } catch (e) {
        console.warn("Could not query classes for attendance:", e);
    }

    if (uniqueClasses.size === 0) {
        ["7A", "7B", "8A", "8B", "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"].forEach(c => uniqueClasses.add(c));
    }

    Array.from(uniqueClasses).sort().forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = `Class ${cls}`;
        classSelect.appendChild(opt);
    });

    if (previousVal && uniqueClasses.has(previousVal)) {
        classSelect.value = previousVal;
    } else if (classSelect.options.length > 1) {
        classSelect.selectedIndex = 1;
    }
}

async function checkAndLoadAttendance() {
    const date = document.getElementById('attSessionDate')?.value;
    const subject = document.getElementById('attSessionSubject')?.value;
    const selectedClass = document.getElementById('attSessionClass')?.value;

    const statusBadge = document.getElementById('attSessionStatusBadge');
    const statusText = document.getElementById('attStatusText');
    const activeInfo = document.getElementById('attActiveSessionInfo');
    const deployBtn = document.getElementById('btnDeployAttendanceSession');
    const closeBtn = document.getElementById('btnCloseAttendanceSession');
    const titleInput = document.getElementById('attSessionTitle');

    if (!date || !subject || !selectedClass) {
        if (statusBadge) {
            statusBadge.className = 'att-status-pill pill-inactive';
            if (statusText) statusText.innerText = 'Select Date, Subject & Class';
        }
        return;
    }

    // 1. Check for Session in Firestore
    try {
        const sessionQuery = query(
            collection(db, "attendance_sessions"),
            where("date", "==", date),
            where("subject", "==", subject)
        );
        const sessionSnap = await getDocs(sessionQuery);

        let foundSession = null;
        sessionSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.targetClass === selectedClass || data.targetClass === "All Classes" || data.targetClass === "all") {
                foundSession = { id: docSnap.id, ...data };
            }
        });

        activeAttendanceSession = foundSession;

        if (foundSession && foundSession.status === 'active') {
            if (statusBadge) {
                statusBadge.className = 'att-status-pill pill-active';
                if (statusText) statusText.innerText = `Live Attendance Open (${foundSession.sessionTitle || 'Active'})`;
            }
            if (activeInfo) activeInfo.innerText = `Live session deployed on ${foundSession.date} for ${foundSession.subject} - Class ${foundSession.targetClass}. Real-time student responses streaming below.`;
            if (closeBtn) closeBtn.classList.remove('hidden');
            document.getElementById('attCloseSessionDivider')?.classList.remove('hidden');
            if (deployBtn) deployBtn.innerHTML = `<span>Update Session Title</span>`;
            if (titleInput && foundSession.sessionTitle) titleInput.value = foundSession.sessionTitle;
        } else if (foundSession && foundSession.status === 'closed') {
            if (statusBadge) {
                statusBadge.className = 'att-status-pill pill-inactive';
                if (statusText) statusText.innerText = `Session Closed (${foundSession.sessionTitle || 'Ended'})`;
            }
            if (activeInfo) activeInfo.innerText = `This attendance session was closed on ${foundSession.date}. You can re-open/deploy it anytime.`;
            if (closeBtn) closeBtn.classList.add('hidden');
            document.getElementById('attCloseSessionDivider')?.classList.add('hidden');
            if (deployBtn) deployBtn.innerHTML = `<span>Re-Open</span>`;
            if (titleInput && foundSession.sessionTitle) titleInput.value = foundSession.sessionTitle;
        } else {
            if (statusBadge) {
                statusBadge.className = 'att-status-pill pill-inactive';
                if (statusText) statusText.innerText = 'No Active Session Deployed';
            }
            if (activeInfo) activeInfo.innerText = '';
            if (closeBtn) closeBtn.classList.add('hidden');
            document.getElementById('attCloseSessionDivider')?.classList.add('hidden');
            if (deployBtn) deployBtn.innerHTML = `<span>Deploy</span>`;
        }

        // 2. Fetch Enrolled Students for this Class
        const studentsQuery = query(collection(db, "students"), where("studentClass", "==", selectedClass));
        const studentsSnap = await getDocs(studentsQuery);
        attendanceEnrolledStudents = [];
        studentsSnap.forEach(docSnap => {
            attendanceEnrolledStudents.push({
                code: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort students alphabetically by name
        attendanceEnrolledStudents.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

        // 3. Listen to Attendance Records in Real Time
        if (attendanceRecordsUnsubscribe) {
            attendanceRecordsUnsubscribe();
            attendanceRecordsUnsubscribe = null;
        }

        const recordsQuery = query(
            collection(db, "attendance_records"),
            where("date", "==", date),
            where("subject", "==", subject)
        );

        attendanceRecordsUnsubscribe = onSnapshot(recordsQuery, (snapshot) => {
            attendanceRecordsMap = {};
            snapshot.forEach(docSnap => {
                const rec = docSnap.data();
                if (rec.studentCode) {
                    attendanceRecordsMap[rec.studentCode] = { id: docSnap.id, ...rec };
                }
            });
            renderAttendanceTable();
        }, (err) => {
            console.error("Attendance real-time snapshot error:", err);
        });

    } catch (err) {
        console.error("Error checking and loading attendance:", err);
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceRecordsTbody');
    if (!tbody) return;

    let presentCount = 0;
    let absentCount = 0;
    let othersCount = 0;
    let pendingCount = 0;

    const totalStudents = attendanceEnrolledStudents.length;

    // Process all enrolled students and compute metrics
    const studentRows = attendanceEnrolledStudents.map(student => {
        const rec = attendanceRecordsMap[student.code];
        const status = rec ? rec.status : 'pending';
        const reason = rec ? (rec.reason || '') : '';
        const timestamp = rec ? (rec.timestamp || '') : '';
        const markedBy = rec ? (rec.markedBy || 'student') : '';

        if (status === 'present') presentCount++;
        else if (status === 'absent') absentCount++;
        else if (status === 'others') othersCount++;
        else pendingCount++;

        return {
            student,
            record: rec,
            status,
            reason,
            timestamp,
            markedBy
        };
    });

    // Update Counter Badges & Percentages
    const calcPct = (count) => totalStudents > 0 ? Math.round((count / totalStudents) * 100) + '%' : '0%';

    const countTotalEl = document.getElementById('attCountTotal');
    const countPresentEl = document.getElementById('attCountPresent');
    const countAbsentEl = document.getElementById('attCountAbsent');
    const countOthersEl = document.getElementById('attCountOthers');
    const countPendingEl = document.getElementById('attCountPending');

    if (countTotalEl) countTotalEl.innerText = totalStudents;
    if (countPresentEl) countPresentEl.innerText = presentCount;
    if (countAbsentEl) countAbsentEl.innerText = absentCount;
    if (countOthersEl) countOthersEl.innerText = othersCount;
    if (countPendingEl) countPendingEl.innerText = pendingCount;

    const pctPresentEl = document.getElementById('attPctPresent');
    const pctAbsentEl = document.getElementById('attPctAbsent');
    const pctOthersEl = document.getElementById('attPctOthers');
    const pctPendingEl = document.getElementById('attPctPending');

    if (pctPresentEl) pctPresentEl.innerText = calcPct(presentCount);
    if (pctAbsentEl) pctAbsentEl.innerText = calcPct(absentCount);
    if (pctOthersEl) pctOthersEl.innerText = calcPct(othersCount);
    if (pctPendingEl) pctPendingEl.innerText = calcPct(pendingCount);

    // Update Filter Select Options with live counts
    const statusSelect = document.getElementById('attStatusFilterSelect');
    if (statusSelect) {
        const optAll = statusSelect.querySelector('option[value="all"]');
        const optPresent = statusSelect.querySelector('option[value="present"]');
        const optAbsent = statusSelect.querySelector('option[value="absent"]');
        const optOthers = statusSelect.querySelector('option[value="others"]');
        const optPending = statusSelect.querySelector('option[value="pending"]');

        if (optAll) optAll.innerText = `All (${totalStudents})`;
        if (optPresent) optPresent.innerText = `Present (${presentCount})`;
        if (optAbsent) optAbsent.innerText = `Absent (${absentCount})`;
        if (optOthers) optOthers.innerText = `Others (${othersCount})`;
        if (optPending) optPending.innerText = `Pending (${pendingCount})`;
    }

    // Filter list
    let filtered = studentRows;
    if (currentAttStatusFilter !== 'all') {
        filtered = filtered.filter(item => item.status === currentAttStatusFilter);
    }
    if (attSearchQuery) {
        filtered = filtered.filter(item => {
            const name = (item.student.studentName || '').toLowerCase();
            const code = (item.student.code || '').toLowerCase();
            return name.includes(attSearchQuery) || code.includes(attSearchQuery);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-gray); padding: 32px 16px;">
                    ${totalStudents === 0 ? 'No students enrolled in this class.' : 'No students match the current status filter or search query.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = "";
    filtered.forEach((item, index) => {
        const s = item.student;
        const status = item.status;
        const reason = item.reason;
        const timeStr = item.timestamp ? formatTimeDisplay(item.timestamp) : '-';

        let badgeHtml = '';
        if (status === 'present') {
            badgeHtml = `<span class="att-badge att-badge-present"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Present (Hadir)</span>`;
        } else if (status === 'absent') {
            badgeHtml = `<span class="att-badge att-badge-absent"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Absent (Tidak Hadir)</span>`;
        } else if (status === 'others') {
            badgeHtml = `<span class="att-badge att-badge-others" title="${escapeHtml(reason)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Others${reason ? ` (${escapeHtml(reason)})` : ''}</span>`;
        } else {
            badgeHtml = `<span class="att-badge att-badge-pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Not Marked</span>`;
        }

        const reasonDisplay = reason ? `<span style="font-size: 13px; font-weight: 500; color: var(--text-dark);">${escapeHtml(reason)}</span>` : `<span style="color: var(--text-gray); font-size: 12px; font-style: italic;">None</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600; color: var(--text-gray); font-size: 13px;">${index + 1}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">
                        ${(s.studentName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <strong style="color: var(--text-dark); font-size: 13.5px; display: block;">${escapeHtml(s.studentName || 'Student')}</strong>
                        <span style="font-size: 11.5px; color: var(--text-gray);">${s.gender ? escapeHtml(s.gender) : ''}</span>
                    </div>
                </div>
            </td>
            <td style="font-weight: 600; font-size: 13px; color: var(--text-dark);">${escapeHtml(s.studentClass || '')}</td>
            <td>${badgeHtml}</td>
            <td>${reasonDisplay}</td>
            <td style="font-size: 12px; color: var(--text-gray); white-space: nowrap;">${timeStr}</td>
            <td style="text-align: center; position: relative;">
                <div class="att-kebab-menu">
                    <button type="button" class="att-kebab-trigger" title="Actions" aria-label="Actions" onclick="toggleAttendanceRowMenu(event, '${escapeHtml(s.code)}')">⋮</button>
                    <div id="att-menu-${escapeHtml(s.code)}" class="att-row-dropdown hidden">
                        <button type="button" class="att-row-item opt-present" onclick="quickMarkAttendance('${escapeHtml(s.code)}', '${escapeHtml(s.studentName || '')}', '${escapeHtml(s.studentClass || '')}', 'present'); closeAllAttDropdowns();">
                            <span>Present</span>
                        </button>
                        <button type="button" class="att-row-item opt-absent" onclick="quickMarkAttendance('${escapeHtml(s.code)}', '${escapeHtml(s.studentName || '')}', '${escapeHtml(s.studentClass || '')}', 'absent'); closeAllAttDropdowns();">
                            <span>Absent</span>
                        </button>
                        <button type="button" class="att-row-item opt-note" onclick="openAttManualModal('${escapeHtml(s.code)}', '${escapeHtml(s.studentName || '')}', '${escapeHtml(s.studentClass || '')}', '${status}', '${escapeHtml(reason)}'); closeAllAttDropdowns();">
                            <span>Note</span>
                        </button>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function formatTimeDisplay(raw) {
    if (!raw) return '-';
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '-';
    }
}

window.filterAttendanceStatus = function(status) {
    currentAttStatusFilter = status;
    const select = document.getElementById('attStatusFilterSelect');
    if (select && select.value !== status) {
        select.value = status;
    }
    renderAttendanceTable();
};

async function deployAttendanceSession() {
    const date = document.getElementById('attSessionDate')?.value;
    const subject = document.getElementById('attSessionSubject')?.value;
    const selectedClass = document.getElementById('attSessionClass')?.value;
    const title = document.getElementById('attSessionTitle')?.value.trim() || 'Regular Class';

    if (!date || !subject || !selectedClass) {
        alert("Please select Session Date, Subject, and Target Class.");
        return;
    }

    const deployBtn = document.getElementById('btnDeployAttendanceSession');
    try {
        if (deployBtn) {
            deployBtn.disabled = true;
            deployBtn.innerText = "Deploying...";
        }

        const sessionId = `${date}_${subject.replace(/\s+/g, '_')}_${selectedClass.replace(/\s+/g, '_')}`;
        
        await setDoc(doc(db, "attendance_sessions", sessionId), {
            date: date,
            subject: subject,
            targetClass: selectedClass,
            sessionTitle: title,
            status: 'active',
            teacherName: document.getElementById('sidebarUserName')?.innerText || 'Teacher',
            teacherEmail: auth.currentUser ? auth.currentUser.email : 'teacher@mks.sch.id',
            updatedAt: new Date().toISOString()
        }, { merge: true });

        alert(`Attendance Session Deployed Successfully!\nSubject: ${subject}\nClass: ${selectedClass}\nDate: ${date}\n\nStudents visiting the portal will now see the attendance call.`);
        await checkAndLoadAttendance();

    } catch (err) {
        console.error("Error deploying attendance session:", err);
        alert("Failed to deploy attendance session: " + err.message);
    } finally {
        if (deployBtn) {
            deployBtn.disabled = false;
            deployBtn.innerHTML = `<span>Deploy</span>`;
        }
    }
}

async function closeAttendanceSession() {
    if (!activeAttendanceSession) {
        alert("No active session found.");
        return;
    }

    if (confirm(`Are you sure you want to CLOSE the attendance session for ${activeAttendanceSession.subject} - Class ${activeAttendanceSession.targetClass}? Students will no longer see the attendance prompt.`)) {
        try {
            await updateDoc(doc(db, "attendance_sessions", activeAttendanceSession.id), {
                status: 'closed',
                closedAt: new Date().toISOString()
            });

            alert("Attendance session has been closed.");
            await checkAndLoadAttendance();

        } catch (err) {
            console.error("Error closing attendance session:", err);
            alert("Failed to close session: " + err.message);
        }
    }
}

window.quickMarkAttendance = async function(studentCode, studentName, studentClass, newStatus) {
    const date = document.getElementById('attSessionDate')?.value;
    const subject = document.getElementById('attSessionSubject')?.value;

    if (!date || !subject) {
        alert("Please ensure Session Date and Subject are selected.");
        return;
    }

    try {
        const recordId = `${date}_${subject.replace(/\s+/g, '_')}_${studentCode}`;
        await setDoc(doc(db, "attendance_records", recordId), {
            sessionId: activeAttendanceSession ? activeAttendanceSession.id : `${date}_${subject}_${studentClass}`,
            date: date,
            subject: subject,
            studentCode: studentCode,
            studentName: studentName,
            studentClass: studentClass,
            status: newStatus,
            reason: '',
            timestamp: new Date().toISOString(),
            markedBy: 'teacher'
        }, { merge: true });

    } catch (err) {
        console.error("Error updating attendance:", err);
        alert("Failed to update attendance: " + err.message);
    }
};

window.openAttManualModal = function(studentCode, studentName, studentClass, currentStatus, currentReason) {
    const modal = document.getElementById('attManualModal');
    if (!modal) return;

    document.getElementById('attManualStudentCode').value = studentCode;
    document.getElementById('attManualStudentName').value = studentName;
    document.getElementById('attManualStudentClass').value = studentClass;
    document.getElementById('attManualStudentInfo').innerText = `${studentName} (Class ${studentClass} • Code: ${studentCode})`;

    const statusSelect = document.getElementById('attManualStatusSelect');
    if (statusSelect) {
        statusSelect.value = (currentStatus === 'present' || currentStatus === 'absent' || currentStatus === 'others') ? currentStatus : 'present';
    }

    const reasonInput = document.getElementById('attManualReasonInput');
    if (reasonInput) {
        reasonInput.value = currentReason || '';
    }

    onAttManualStatusChange();
    modal.classList.remove('hidden');
};

window.closeAttManualModal = function() {
    document.getElementById('attManualModal')?.classList.add('hidden');
};

window.toggleAttendanceRowMenu = function(event, code) {
    if (event) event.stopPropagation();
    const menuId = `att-menu-${code}`;
    const targetMenu = document.getElementById(menuId);
    
    // Close other row menus
    document.querySelectorAll('.att-row-dropdown').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });
    // Close split dropdown
    const actionDropdown = document.getElementById('attActionDropdownMenu');
    if (actionDropdown) actionDropdown.classList.add('hidden');
    const toggleBtn = document.getElementById('btnAttendanceMenuToggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

    if (targetMenu) {
        targetMenu.classList.toggle('hidden');
    }
};

window.toggleAttendanceActionsDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('attActionDropdownMenu');
    const toggleBtn = document.getElementById('btnAttendanceMenuToggle');
    if (!dropdown) return;
    
    // Close any open row menus
    document.querySelectorAll('.att-row-dropdown').forEach(m => m.classList.add('hidden'));

    const isHidden = dropdown.classList.toggle('hidden');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!isHidden));
};

window.closeAllAttDropdowns = function() {
    document.querySelectorAll('.att-row-dropdown').forEach(m => m.classList.add('hidden'));
    const dropdown = document.getElementById('attActionDropdownMenu');
    if (dropdown) dropdown.classList.add('hidden');
    const toggleBtn = document.getElementById('btnAttendanceMenuToggle');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
};

// Global click listener to close attendance and score dropdowns when clicking outside
window.addEventListener('click', (e) => {
    if (!e.target.closest('.att-kebab-menu') && !e.target.closest('.att-split-btn-wrapper')) {
        closeAllAttDropdowns();
    }
    if (!e.target.closest('.score-mode-dropdown-wrap')) {
        closeScoreModeDropdown();
        closeStudentRegModeDropdown();
    }
    if (!e.target.closest('.score-ledger-split-wrap') && !e.target.closest('.score-ledger-split-btn-wrap')) {
        closeScoreLedgerDropdown();
    }
});

window.onAttManualStatusChange = function() {
    const status = document.getElementById('attManualStatusSelect')?.value;
    const reasonBox = document.getElementById('attManualReasonBox');
    if (reasonBox) {
        // Show reason input for others or as optional note
        reasonBox.style.display = (status === 'others' || status === 'absent' || status === 'present') ? 'block' : 'none';
        const label = reasonBox.querySelector('label');
        if (label) {
            label.innerText = status === 'others' ? 'Reason / Explanation (Required for Others)' : 'Optional Teacher Note';
        }
    }
};

window.saveManualAttendanceRecord = async function() {
    const studentCode = document.getElementById('attManualStudentCode')?.value;
    const studentName = document.getElementById('attManualStudentName')?.value;
    const studentClass = document.getElementById('attManualStudentClass')?.value;
    const status = document.getElementById('attManualStatusSelect')?.value;
    const reason = document.getElementById('attManualReasonInput')?.value.trim();

    const date = document.getElementById('attSessionDate')?.value;
    const subject = document.getElementById('attSessionSubject')?.value;

    if (!studentCode || !date || !subject) {
        alert("Missing student code, date, or subject.");
        return;
    }

    if (status === 'others' && !reason) {
        alert("Please provide a reason for 'Others' (e.g. Sakit Demam, Izin Dokter, dll).");
        return;
    }

    const recordId = `${date}_${subject.replace(/\s+/g, '_')}_${studentCode}`;

    try {
        if (status === 'pending') {
            // Delete record to reset to unmarked
            await deleteDoc(doc(db, "attendance_records", recordId));
        } else {
            await setDoc(doc(db, "attendance_records", recordId), {
                sessionId: activeAttendanceSession ? activeAttendanceSession.id : `${date}_${subject}_${studentClass}`,
                date: date,
                subject: subject,
                studentCode: studentCode,
                studentName: studentName,
                studentClass: studentClass,
                status: status,
                reason: reason,
                timestamp: new Date().toISOString(),
                markedBy: 'teacher'
            }, { merge: true });
        }

        closeAttManualModal();
    } catch (err) {
        console.error("Error saving manual attendance:", err);
        alert("Failed to save attendance: " + err.message);
    }
};

function exportAttendanceToExcel() {
    if (typeof XLSX === 'undefined') {
        alert("Excel export library is loading, please try again in a moment.");
        return;
    }

    const date = document.getElementById('attSessionDate')?.value || 'Today';
    const subject = document.getElementById('attSessionSubject')?.value || 'Subject';
    const selectedClass = document.getElementById('attSessionClass')?.value || 'Class';

    if (attendanceEnrolledStudents.length === 0) {
        alert("No student attendance data to export.");
        return;
    }

    const rows = [
        ["MITRA KASIH SCHOOL - ATTENDANCE REPORT"],
        [`Date: ${date}`, `Subject: ${subject}`, `Class: ${selectedClass}`],
        [""],
        ["No", "Student Name", "Student Code", "Class", "Attendance Status", "Reason / Note", "Time Logged", "Marked By"]
    ];

    attendanceEnrolledStudents.forEach((student, i) => {
        const rec = attendanceRecordsMap[student.code];
        const status = rec ? rec.status.toUpperCase() : 'PENDING (NOT MARKED)';
        const reason = rec ? (rec.reason || '') : '';
        const time = rec && rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : '-';
        const markedBy = rec ? (rec.markedBy || 'Student') : '-';

        rows.push([
            i + 1,
            student.studentName || '',
            student.code,
            student.studentClass || '',
            status,
            reason,
            time,
            markedBy
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    const fileName = `Attendance_${subject}_${selectedClass}_${date}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// Module Exports
export {
    initAttendanceTab,
    populateAttendanceSubjects,
    populateAttendanceClasses,
    checkAndLoadAttendance,
    renderAttendanceTable,
    deployAttendanceSession,
    closeAttendanceSession,
    exportAttendanceToExcel
};

// Expose functions globally on window for inline handlers & cross-module calls
window.initAttendanceTab = initAttendanceTab;
window.populateAttendanceSubjects = populateAttendanceSubjects;
window.populateAttendanceClasses = populateAttendanceClasses;
window.checkAndLoadAttendance = checkAndLoadAttendance;
window.renderAttendanceTable = renderAttendanceTable;
window.deployAttendanceSession = deployAttendanceSession;
window.closeAttendanceSession = closeAttendanceSession;
window.exportAttendanceToExcel = exportAttendanceToExcel;
