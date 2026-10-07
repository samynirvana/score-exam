import { 
    collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, orderBy, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// Days of the school week
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// State
let selectedWeekMonday = getMonday(new Date());
let selectedDay = 'Monday';
let selectedTaskType = 'photo';
let editingMissionId = null;
let currentWeekMissions = [];
let currentWeekSubmissions = [];
let activeAdminSubtab = 'planner'; // 'planner' or 'submissions'
let submissionFilterDay = 'all';
let submissionFilterStatus = 'all';
let submissionFilterClass = 'all';
let dmSubmissionsCurrentPage = 1;
const DM_SUBMISSIONS_PER_PAGE = 10;

// Helper: Calculate Monday of a given date
export function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(date.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon;
}

// Helper: Format date as YYYY-MM-DD
export function getWeekKey(monday) {
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Helper: Format week range label (e.g., Oct 5 - Oct 9, 2026)
export function formatWeekLabel(monday) {
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);

    const mOpts = { month: 'short', day: 'numeric' };
    const fOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${monday.toLocaleDateString(undefined, mOpts)} – ${friday.toLocaleDateString(undefined, fOpts)}`;
}

// Helper: Get specific date for a day of week based on Monday
export function getDayDate(monday, dayName) {
    const idx = DAYS_OF_WEEK.indexOf(dayName);
    if (idx === -1) return monday;
    const target = new Date(monday);
    target.setDate(target.getDate() + idx);
    return target;
}

// Initialize Admin Daily Mission Tab
export function initAdminDailyMission() {
    setupSubtabButtons();
    setupWeekControls();
    setupDayPills();
    setupTaskTypeSelector();
    setupAccessControlSelector();
    setupFormButtons();
    setupFilterListeners();
    setupLightbox();
    document.addEventListener('click', (event) => {
        if (event.target.closest('.dm-mission-menu')) return;
        document.querySelectorAll('#dmWeeklyOverviewCards .dm-mission-menu[open]').forEach(menu => {
            menu.open = false;
        });
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('#dmWeeklyOverviewCards .dm-mission-menu[open]').forEach(menu => {
            menu.open = false;
            menu.querySelector('summary')?.focus();
        });
    });
}

// Called when admin switches to 'tab-daily-mission'
export async function loadDailyMissionTab() {
    renderWeekHeader();
    await populateClassDropdowns();
    await refreshMissionData();
}

function setupSubtabButtons() {
    const btnPlanner = document.getElementById('dmSubtabPlannerBtn');
    const btnSubmissions = document.getElementById('dmSubtabSubmissionsBtn');
    const viewPlanner = document.getElementById('dmPlannerView');
    const viewSubmissions = document.getElementById('dmSubmissionsView');

    if (btnPlanner && btnSubmissions) {
        btnPlanner.addEventListener('click', () => {
            activeAdminSubtab = 'planner';
            btnPlanner.classList.add('active');
            btnSubmissions.classList.remove('active');
            if (viewPlanner) viewPlanner.style.display = 'block';
            if (viewSubmissions) viewSubmissions.style.display = 'none';
        });

        btnSubmissions.addEventListener('click', async () => {
            activeAdminSubtab = 'submissions';
            btnSubmissions.classList.add('active');
            btnPlanner.classList.remove('active');
            if (viewPlanner) viewPlanner.style.display = 'none';
            if (viewSubmissions) viewSubmissions.style.display = 'block';
            await loadSubmissions();
        });
    }
}

function setupWeekControls() {
    document.getElementById('dmPrevWeekBtn')?.addEventListener('click', async () => {
        selectedWeekMonday.setDate(selectedWeekMonday.getDate() - 7);
        renderWeekHeader();
        await refreshMissionData();
    });

    document.getElementById('dmNextWeekBtn')?.addEventListener('click', async () => {
        selectedWeekMonday.setDate(selectedWeekMonday.getDate() + 7);
        renderWeekHeader();
        await refreshMissionData();
    });

    document.getElementById('dmThisWeekBtn')?.addEventListener('click', async () => {
        selectedWeekMonday = getMonday(new Date());
        renderWeekHeader();
        await refreshMissionData();
    });
}

function renderWeekHeader() {
    const label = document.getElementById('dmCurrentWeekLabel');
    if (label) {
        label.innerText = `Week of ${formatWeekLabel(selectedWeekMonday)}`;
    }
}

function setupDayPills() {
    const dayPillContainer = document.getElementById('dmAdminDayPills');
    if (!dayPillContainer) return;

    dayPillContainer.querySelectorAll('.dm-day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const day = pill.getAttribute('data-day');
            if (!day) return;
            selectAdminDay(day);
        });
    });
}

function selectAdminDay(day) {
    selectedDay = day;
    document.querySelectorAll('#dmAdminDayPills .dm-day-pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-day') === day);
    });
}

function showMissionForm(day, mission = null) {
    selectAdminDay(day);
    if (mission) populateFormForEdit(mission);
    else resetMissionForm();
    const wrapper = document.getElementById('dmMissionFormWrapper');
    if (wrapper) {
        wrapper.hidden = false;
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function hideMissionForm() {
    const wrapper = document.getElementById('dmMissionFormWrapper');
    if (wrapper) wrapper.hidden = true;
    editingMissionId = null;
}

// Access Control Selector Setup & Helpers
function setupAccessControlSelector() {
    const container = document.getElementById('dmAccessOptionsGrid');
    if (!container) return;

    container.querySelectorAll('.dm-access-card-label').forEach(label => {
        label.addEventListener('click', () => {
            const radio = label.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                updateAccessControlUI(radio.value);
            }
        });
    });
}

function updateAccessControlUI(status) {
    const val = status || 'auto';
    document.querySelectorAll('#dmAccessOptionsGrid .dm-access-choice-box').forEach(box => {
        box.classList.toggle('selected', box.getAttribute('data-value') === val);
    });

    const badge = document.getElementById('dmFormAccessStatusBadge');
    if (badge) {
        if (val === 'open') {
            badge.className = 'dm-access-badge dm-access-badge-unlocked';
            badge.innerHTML = `${accessIcon('open')} Turn ON (Open)`;
        } else if (val === 'closed') {
            badge.className = 'dm-access-badge dm-access-badge-closed';
            badge.innerHTML = `${accessIcon('closed')} Turn OFF (Closed)`;
        } else {
            badge.className = 'dm-access-badge dm-access-badge-scheduled';
            badge.innerHTML = `${accessIcon('auto')} Auto (Default)`;
        }
    }

}

function accessIcon(kind) {
    if (kind === 'auto') return '<svg class="dm-access-icon dm-icon-auto" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 2-9 11h7l-1 9 10-12h-7V2Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/></svg>';
    const open = kind === 'open';
    return `<svg class="dm-access-icon dm-icon-${kind}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="${open ? 'M8 10V7a4 4 0 0 1 7.5-2' : 'M8 10V7a4 4 0 0 1 8 0v3'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`;
}

export function getMissionAccessState(mission, day, monday) {
    const accessStatus = mission?.accessStatus || 'auto';
    const dayDate = getDayDate(monday, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = dayDate < today;
    const isToday = dayDate.getTime() === today.getTime();

    if (accessStatus === 'open') {
        return {
            status: 'open',
            isAccessible: true,
            label: isPast ? 'Manually Unlocked (Open)' : 'Open (Accessible)',
            badgeClass: 'dm-access-badge-unlocked',
            icon: '🔓',
            isPast: isPast,
            isOverride: true
        };
    } else if (accessStatus === 'closed') {
        return {
            status: 'closed',
            isAccessible: false,
            label: 'Force Closed (Locked)',
            badgeClass: 'dm-access-badge-closed',
            icon: '🔒',
            isPast: isPast,
            isOverride: true
        };
    } else {
        // 'auto'
        if (isPast) {
            return {
                status: 'auto',
                isAccessible: false,
                label: 'Auto-Closed (Past Day)',
                badgeClass: 'dm-access-badge-closed',
                icon: '🔒',
                isPast: true,
                isOverride: false
            };
        } else if (isToday) {
            return {
                status: 'auto',
                isAccessible: true,
                label: 'Auto-Open (Today)',
                badgeClass: 'dm-access-badge-open',
                icon: '🟢',
                isPast: false,
                isOverride: false
            };
        } else {
            return {
                status: 'auto',
                isAccessible: true,
                label: 'Scheduled (Upcoming)',
                badgeClass: 'dm-access-badge-scheduled',
                icon: '📅',
                isPast: false,
                isOverride: false
            };
        }
    }
}

function setupTaskTypeSelector() {
    const typeCards = document.querySelectorAll('.dm-type-card');
    typeCards.forEach(card => {
        card.addEventListener('click', () => {
            typeCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedTaskType = card.getAttribute('data-type') || 'photo';
            updateTaskTypeFields();
        });
    });
}

function updateTaskTypeFields() {
    const qSection = document.getElementById('dmQuestionPromptSection');
    if (!qSection) return;
    if (selectedTaskType === 'question') {
        qSection.style.display = 'block';
    } else {
        qSection.style.display = 'none';
    }
}

function setupFormButtons() {
    document.getElementById('dmSaveMissionBtn')?.addEventListener('click', saveDailyMission);
    document.getElementById('dmResetMissionBtn')?.addEventListener('click', resetMissionForm);
    document.getElementById('dmCloseMissionFormBtn')?.addEventListener('click', hideMissionForm);
}

function setupFilterListeners() {
    document.getElementById('dmFilterDay')?.addEventListener('change', (e) => {
        submissionFilterDay = e.target.value;
        dmSubmissionsCurrentPage = 1;
        renderSubmissions();
    });

    document.getElementById('dmFilterStatus')?.addEventListener('change', (e) => {
        submissionFilterStatus = e.target.value;
        dmSubmissionsCurrentPage = 1;
        renderSubmissions();
    });

    document.getElementById('dmFilterClass')?.addEventListener('change', (e) => {
        submissionFilterClass = e.target.value;
        dmSubmissionsCurrentPage = 1;
        renderSubmissions();
    });
}

// Populate classes from Firestore students
async function populateClassDropdowns() {
    const classSelect = document.getElementById('dmMissionTargetClass');
    const filterClassSelect = document.getElementById('dmFilterClass');
    if (!classSelect) return;

    try {
        const snap = await getDocs(collection(db, "students"));
        const classes = new Set();
        snap.forEach(d => {
            const data = d.data();
            const cls = data.studentClass || data.class;
            if (cls) classes.add(cls.trim());
        });

        const sorted = Array.from(classes).sort((a, b) => 
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );

        let optsHtml = `<option value="all">All Classes</option>`;
        sorted.forEach(cls => {
            optsHtml += `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`;
        });

        classSelect.innerHTML = optsHtml;
        if (filterClassSelect) {
            filterClassSelect.innerHTML = `<option value="all">All Classes</option>` + sorted.map(cls => `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`).join('');
        }
    } catch (err) {
        console.error("Error populating mission classes:", err);
    }
}

// Refresh missions and update day badges
export async function refreshMissionData() {
    const weekKey = getWeekKey(selectedWeekMonday);

    try {
        const q = query(collection(db, "daily_missions"), where("weekKey", "==", weekKey));
        const snap = await getDocs(q);
        currentWeekMissions = [];
        snap.forEach(docSnap => {
            currentWeekMissions.push({ id: docSnap.id, ...docSnap.data() });
        });

        updateAdminDayPillBadges();
        renderWeeklyOverviewList();
        selectAdminDay(selectedDay);
        hideMissionForm();

        if (activeAdminSubtab === 'submissions') {
            await loadSubmissions();
        }
    } catch (err) {
        console.error("Error loading daily missions:", err);
    }
}

function updateAdminDayPillBadges() {
    DAYS_OF_WEEK.forEach(day => {
        const pill = document.querySelector(`#dmAdminDayPills .dm-day-pill[data-day="${day}"]`);
        if (!pill) return;

        const dayDate = getDayDate(selectedWeekMonday, day);
        const dateSpan = pill.querySelector('.dm-day-date');
        if (dateSpan) {
            dateSpan.innerText = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }

        const statusDot = pill.querySelector('.dm-day-status-dot');
        const mission = currentWeekMissions.find(m => m.day === day);
        if (statusDot) {
            if (mission) {
                const accessState = getMissionAccessState(mission, day, selectedWeekMonday);
                if (accessState.status === 'open' && accessState.isPast) {
                    statusDot.className = 'dm-day-status-dot dm-status-unlocked';
                    statusDot.innerHTML = '🔓 Unlocked';
                    statusDot.title = 'Manually open for students to access';
                } else if (!accessState.isAccessible) {
                    statusDot.className = 'dm-day-status-dot dm-status-closed';
                    statusDot.innerHTML = '🔒 Closed';
                    statusDot.title = 'Locked for students (past day)';
                } else {
                    statusDot.className = 'dm-day-status-dot dm-status-completed';
                    statusDot.innerText = 'Configured';
                    statusDot.title = 'Configured & active';
                }
            } else {
                statusDot.className = 'dm-day-status-dot dm-status-empty';
                statusDot.innerText = 'Empty';
            }
        }
    });
}

function renderWeeklyOverviewList() {
    const container = document.getElementById('dmWeeklyOverviewCards');
    if (!container) return;

    let html = '';
    DAYS_OF_WEEK.forEach(day => {
        const mission = currentWeekMissions.find(m => m.day === day);
        const dayDate = getDayDate(selectedWeekMonday, day);
        const dateStr = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        if (mission) {
            const iconMap = {
                photo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
                opinion: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
                question: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                general: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>'
            };
            const typeLabel = iconMap[mission.taskType] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const typeName = { photo: 'Photo mission', opinion: 'Opinion or reflection', question: 'Questions and answers', general: 'General task' }[mission.taskType] || 'Mission';
            const accessState = getMissionAccessState(mission, day, selectedWeekMonday);

            const accessAction = !accessState.isAccessible
                ? `<button type="button" class="dm-menu-item" onclick="window.toggleAdminDailyMissionAccess('${mission.id}', 'open')">Turn on access</button>`
                : `<button type="button" class="dm-menu-item" onclick="window.toggleAdminDailyMissionAccess('${mission.id}', '${accessState.status === 'open' ? 'auto' : 'closed'}')">Turn off access</button>`;

            html += `
                <div class="box dm-schedule-card">
                    <div class="dm-schedule-content">
                        <div class="dm-schedule-meta">
                            <strong style="font-size: 14.5px; color: var(--text-dark);">${day}, ${dateStr}</strong>
                            <span class="dm-task-type-badge dm-icon-only" title="${typeName}" aria-label="${typeName}">${typeLabel}</span>
                            <span style="font-size: 12px; color: var(--text-gray); font-weight: 600;">Target: ${escapeHtml(mission.targetClass === 'all' ? 'All Classes' : mission.targetClass)}</span>
                            <span class="dm-access-badge dm-icon-only ${accessState.badgeClass}" title="${escapeHtml(accessState.label)}" aria-label="${escapeHtml(accessState.label)}">${accessIcon(accessState.isAccessible ? 'open' : 'closed')}</span>
                        </div>
                        <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text-dark);">${escapeHtml(mission.title)}</h4>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-gray); max-width: 540px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(mission.description || '')}</p>
                    </div>
                    <details class="dm-mission-menu">
                        <summary aria-label="Settings for ${escapeHtml(day)} mission">Settings</summary>
                        <div class="dm-mission-menu-panel">
                            ${accessAction}
                            <button type="button" class="dm-menu-item" onclick="window.editAdminDailyMission('${mission.id}')">Edit mission</button>
                            <button type="button" class="dm-menu-item dm-menu-danger" onclick="window.deleteAdminDailyMission('${mission.id}')">Delete mission</button>
                        </div>
                    </details>
                </div>
            `;
        } else {
            html += `
                <div class="box dm-schedule-card dm-schedule-empty">
                    <div style="color: var(--text-gray);">
                        <strong>${day}, ${dateStr}</strong> — No mission configured yet.
                    </div>
                    <button type="button" class="btn-primary" style="padding: 6px 14px; font-size: 12px; background: var(--dm-primary-light); color: var(--dm-primary); border: 1px solid var(--dm-primary-border);" onclick="window.selectAdminDayTab('${day}')">+ Add Mission</button>
                </div>
            `;
        }
    });

    container.innerHTML = html;
    container.querySelectorAll('.dm-mission-menu').forEach(menu => {
        menu.addEventListener('toggle', () => {
            menu.closest('.dm-schedule-card')?.classList.toggle('dm-menu-open', menu.open);
            if (menu.open) container.querySelectorAll('.dm-mission-menu').forEach(other => {
                if (other !== menu) other.open = false;
            });
        });
    });
}

window.selectAdminDayTab = function(day) {
    showMissionForm(day);
};

window.editAdminDailyMission = function(missionId) {
    const mission = currentWeekMissions.find(m => m.id === missionId);
    if (!mission) return;
    showMissionForm(mission.day, mission);
};

window.toggleAdminDailyMissionAccess = async function(missionId, targetStatus) {
    const mission = currentWeekMissions.find(m => m.id === missionId);
    if (!mission) return;

    try {
        let newStatus = targetStatus;
        if (!newStatus) {
            newStatus = (mission.accessStatus === 'open') ? 'auto' : 'open';
        }

        await updateDoc(doc(db, "daily_missions", missionId), {
            accessStatus: newStatus,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'Teacher'
        });

        mission.accessStatus = newStatus;

        updateAdminDayPillBadges();
        renderWeeklyOverviewList();
        if (editingMissionId === missionId) {
            populateFormForEdit(mission);
        }

        const msg = newStatus === 'open' 
            ? `🔓 ${mission.day}'s mission is now OPEN!\n\nStudents can now click and submit on their studentdash.`
            : `🔒 ${mission.day}'s mission access has been turned OFF.\n\nStudents can no longer submit on studentdash.`;
        alert(msg);
    } catch (err) {
        console.error("Error toggling mission access:", err);
        alert("Failed to toggle access: " + err.message);
    }
};

function populateFormForEdit(mission) {
    editingMissionId = mission.id;
    const titleInput = document.getElementById('dmMissionTitle');
    const descInput = document.getElementById('dmMissionDesc');
    const classSelect = document.getElementById('dmMissionTargetClass');
    const qInput = document.getElementById('dmQuestionPromptInput');
    const formHeading = document.getElementById('dmFormHeading');
    const saveBtn = document.getElementById('dmSaveMissionBtn');

    if (titleInput) titleInput.value = mission.title || '';
    if (descInput) descInput.value = mission.description || '';
    if (classSelect) {
        const tc = (mission.targetClass || 'all').toLowerCase();
        classSelect.value = (tc === 'all' || tc === 'all classes') ? 'all' : mission.targetClass;
    }
    if (qInput) qInput.value = mission.questionPrompt || '';

    // Task Type
    selectedTaskType = mission.taskType || 'photo';
    document.querySelectorAll('.dm-type-card').forEach(card => {
        card.classList.toggle('selected', card.getAttribute('data-type') === selectedTaskType);
    });
    updateTaskTypeFields();

    // Access Status Option
    const accessStatus = mission.accessStatus || 'auto';
    const radio = document.querySelector(`input[name="dmAccessOption"][value="${accessStatus}"]`);
    if (radio) radio.checked = true;
    updateAccessControlUI(accessStatus);

    if (formHeading) formHeading.innerText = `Edit Mission for ${mission.day}`;
    if (saveBtn) saveBtn.innerText = `Update ${mission.day} Mission`;
}

function resetMissionForm() {
    editingMissionId = null;
    const titleInput = document.getElementById('dmMissionTitle');
    const descInput = document.getElementById('dmMissionDesc');
    const classSelect = document.getElementById('dmMissionTargetClass');
    const qInput = document.getElementById('dmQuestionPromptInput');
    const formHeading = document.getElementById('dmFormHeading');
    const saveBtn = document.getElementById('dmSaveMissionBtn');

    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (classSelect) classSelect.value = 'all';
    if (qInput) qInput.value = '';

    selectedTaskType = 'photo';
    document.querySelectorAll('.dm-type-card').forEach(card => {
        card.classList.toggle('selected', card.getAttribute('data-type') === 'photo');
    });
    updateTaskTypeFields();

    // Reset access option to 'auto'
    const radio = document.querySelector('input[name="dmAccessOption"][value="auto"]');
    if (radio) radio.checked = true;
    updateAccessControlUI('auto');

    if (formHeading) formHeading.innerText = `Configure Mission for ${selectedDay}`;
    if (saveBtn) saveBtn.innerText = `Save ${selectedDay} Mission`;
}

async function saveDailyMission() {
    const title = document.getElementById('dmMissionTitle')?.value.trim();
    const description = document.getElementById('dmMissionDesc')?.value.trim();
    const rawTargetClass = document.getElementById('dmMissionTargetClass')?.value || 'all';
    const targetClass = (!rawTargetClass || rawTargetClass.toLowerCase() === 'all' || rawTargetClass.toLowerCase() === 'all classes') ? 'all' : rawTargetClass.trim();
    const questionPrompt = document.getElementById('dmQuestionPromptInput')?.value.trim() || '';
    const accessStatus = document.querySelector('input[name="dmAccessOption"]:checked')?.value || 'auto';
    const saveBtn = document.getElementById('dmSaveMissionBtn');

    if (!title) {
        alert("Please enter a mission title.");
        return;
    }

    if (selectedTaskType === 'question' && !questionPrompt && !description) {
        alert("Please enter the question prompt.");
        return;
    }

    const weekKey = getWeekKey(selectedWeekMonday);
    const dayIndex = DAYS_OF_WEEK.indexOf(selectedDay) + 1;

    try {
        if (saveBtn) saveBtn.disabled = true;

        const payload = {
            weekKey: weekKey,
            day: selectedDay.trim(),
            dayIndex: dayIndex,
            title: title,
            description: description,
            taskType: selectedTaskType,
            questionPrompt: questionPrompt,
            targetClass: targetClass,
            accessStatus: accessStatus,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'Teacher'
        };

        if (editingMissionId) {
            await updateDoc(doc(db, "daily_missions", editingMissionId), payload);
            alert(`Daily mission for ${selectedDay} updated successfully!`);
        } else {
            payload.createdAt = new Date();
            // Check if one already exists for this day/week
            const existing = currentWeekMissions.find(m => m.day === selectedDay);
            if (existing) {
                await updateDoc(doc(db, "daily_missions", existing.id), payload);
                alert(`Existing mission for ${selectedDay} updated successfully!`);
            } else {
                await addDoc(collection(db, "daily_missions"), payload);
                alert(`Daily mission for ${selectedDay} published successfully!`);
            }
        }

        await refreshMissionData();
    } catch (err) {
        console.error("Error saving daily mission:", err);
        alert("Failed to save daily mission: " + err.message);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

window.deleteAdminDailyMission = async function(missionId) {
    if (!confirm("Are you sure you want to delete this daily mission?")) return;
    try {
        await deleteDoc(doc(db, "daily_missions", missionId));
        alert("Daily mission deleted.");
        await refreshMissionData();
    } catch (err) {
        console.error("Error deleting daily mission:", err);
        alert("Failed to delete mission: " + err.message);
    }
};

// --- SUBMISSIONS REVIEW & COMPLETION CHECKER ---

export async function loadSubmissions(resetPage = true) {
    if (resetPage) {
        dmSubmissionsCurrentPage = 1;
    }
    const weekKey = getWeekKey(selectedWeekMonday);
    const container = document.getElementById('dmSubmissionsListContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-gray);">Loading student submissions...</div>`;

    try {
        const q = query(
            collection(db, "daily_mission_submissions"), 
            where("weekKey", "==", weekKey)
        );
        const snap = await getDocs(q);
        currentWeekSubmissions = [];
        snap.forEach(d => {
            currentWeekSubmissions.push({ id: d.id, ...d.data() });
        });

        // Sort descending by submittedAt
        currentWeekSubmissions.sort((a, b) => {
            const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : new Date(a.submittedAt || 0).getTime());
            const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : new Date(b.submittedAt || 0).getTime());
            return timeB - timeA;
        });

        updateSubmissionStats();
        renderSubmissions();
    } catch (err) {
        console.error("Error loading submissions:", err);
        container.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px;">Failed to load submissions: ${err.message}</div>`;
    }
}

function updateSubmissionStats() {
    const totalCount = currentWeekSubmissions.length;
    const pendingCount = currentWeekSubmissions.filter(s => (s.status || 'pending') === 'pending').length;
    const completedCount = currentWeekSubmissions.filter(s => s.status === 'completed').length;

    const elTotal = document.getElementById('dmStatTotalSubmissions');
    const elPending = document.getElementById('dmStatPendingSubmissions');
    const elCompleted = document.getElementById('dmStatCompletedSubmissions');

    if (elTotal) elTotal.innerText = totalCount;
    if (elPending) elPending.innerText = pendingCount;
    if (elCompleted) elCompleted.innerText = completedCount;
}

function renderSubmissions() {
    const container = document.getElementById('dmSubmissionsListContainer');
    if (!container) return;

    const paginationWrapper = document.getElementById('dmSubmissionsPagination');
    const pageInfo = document.getElementById('dmSubmissionsPageInfo');
    const pageButtons = document.getElementById('dmSubmissionsPageButtons');

    let filtered = currentWeekSubmissions.filter(s => {
        if (submissionFilterDay !== 'all' && s.day !== submissionFilterDay) return false;
        if (submissionFilterStatus !== 'all' && (s.status || 'pending') !== submissionFilterStatus) return false;
        if (submissionFilterClass !== 'all' && s.studentClass !== submissionFilterClass) return false;
        return true;
    });

    if (filtered.length === 0) {
        if (paginationWrapper) paginationWrapper.style.display = 'none';
        container.innerHTML = `
            <div style="text-align: center; padding: 48px 20px; color: var(--text-gray); background: var(--bg-main); border-radius: 14px; border: 1.5px dashed var(--border-color);">
                <div style="margin-bottom: 10px; display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 14px; background: rgba(99, 102, 241, 0.1); color: var(--dm-primary);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h4 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: var(--text-dark);">No Submissions Found</h4>
                <p style="margin: 0; font-size: 13px;">No student submissions match your current filters for this week.</p>
            </div>
        `;
        return;
    }

    // Pagination Calculation (10 items per page)
    const totalSubmissions = filtered.length;
    const totalPages = Math.ceil(totalSubmissions / DM_SUBMISSIONS_PER_PAGE) || 1;

    if (dmSubmissionsCurrentPage > totalPages) {
        dmSubmissionsCurrentPage = totalPages;
    }
    if (dmSubmissionsCurrentPage < 1) {
        dmSubmissionsCurrentPage = 1;
    }

    const startIndex = (dmSubmissionsCurrentPage - 1) * DM_SUBMISSIONS_PER_PAGE;
    const endIndex = Math.min(startIndex + DM_SUBMISSIONS_PER_PAGE, totalSubmissions);
    const pageItems = filtered.slice(startIndex, endIndex);

    let html = '';
    pageItems.forEach(sub => {
        const status = sub.status || 'pending';
        let badgeHtml = '';
        if (status === 'completed') {
            badgeHtml = `<span class="dm-day-status-dot dm-status-completed"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1.5px; margin-right: 3px;"><polyline points="20 6 9 17 4 12"/></svg>Completed</span>`;
        } else if (status === 'revision') {
            badgeHtml = `<span class="dm-day-status-dot dm-status-revision"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1.5px; margin-right: 3px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Needs Revision</span>`;
        } else {
            badgeHtml = `<span class="dm-day-status-dot dm-status-pending"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1.5px; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Pending Review</span>`;
        }

        const dateStr = sub.submittedAt ? formatTimestamp(sub.submittedAt) : 'Recently';
        const initial = (sub.studentName || 'S').charAt(0).toUpperCase();

        // Render response content
        let contentHtml = '';
        if (sub.photoUrl) {
            contentHtml += `
                <div style="margin-bottom: 8px;">
                    <img src="${sub.photoUrl}" alt="Submission Photo" class="dm-sub-thumb" onclick="window.openDmPhotoLightbox('${sub.photoUrl}')">
                    <span style="display: block; font-size: 11px; color: var(--text-gray); margin-top: 4px;">Click photo to enlarge</span>
                </div>
            `;
        }
        if (sub.textResponse) {
            contentHtml += `
                <div style="white-space: pre-wrap; font-size: 13.5px; line-height: 1.5; color: var(--text-dark);">
                    ${escapeHtml(sub.textResponse)}
                </div>
            `;
        }
        if (sub.teacherFeedback) {
            contentHtml += `
                <div style="margin-top: 8px; padding: 8px 12px; background: rgba(245, 158, 11, 0.12); border-left: 3px solid #f59e0b; border-radius: 6px; font-size: 12.5px; color: #92400e;">
                    <strong>Teacher Feedback:</strong> ${escapeHtml(sub.teacherFeedback)}
                </div>
            `;
        }

        html += `
            <div class="dm-submission-item">
                <div class="dm-submission-header">
                    <div class="dm-student-info">
                        <div class="dm-student-avatar">${initial}</div>
                        <div>
                            <h4 class="dm-student-name">${escapeHtml(sub.studentName || 'Student')} <span style="font-weight: 500; font-size: 12px; color: var(--text-gray);">(${escapeHtml(sub.studentCode || '')})</span></h4>
                            <p class="dm-submission-meta">Class: <strong>${escapeHtml(sub.studentClass || 'N/A')}</strong> · <strong>${escapeHtml(sub.day || '')}</strong> · ${dateStr}</p>
                        </div>
                    </div>
                    <div>${badgeHtml}</div>
                </div>

                <div class="dm-submission-body">
                    ${contentHtml}
                </div>

                <div class="dm-actions-row">
                    <button type="button" class="dm-approve-btn" onclick="window.approveDmSubmission('${sub.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ${status === 'completed' ? 'Re-Approve' : 'Give Completion'}
                    </button>
                    <button type="button" class="dm-revision-btn" onclick="window.requestDmRevision('${sub.id}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Request Revision
                    </button>
                    <button type="button" class="dm-delete-sub-btn" onclick="window.deleteDmSubmission('${sub.id}')">Delete</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Render Pagination Bar
    if (paginationWrapper) {
        paginationWrapper.style.display = 'flex';
    }

    if (pageInfo) {
        pageInfo.innerHTML = `Showing <strong>${startIndex + 1}–${endIndex}</strong> of <strong>${totalSubmissions}</strong> submissions (Page ${dmSubmissionsCurrentPage} of ${totalPages})`;
    }

    if (pageButtons) {
        if (totalPages <= 1) {
            pageButtons.innerHTML = '';
        } else {
            let btnsHtml = `
                <button type="button" class="dm-page-btn" ${dmSubmissionsCurrentPage === 1 ? 'disabled' : ''} onclick="window.goToDmSubmissionsPage(${dmSubmissionsCurrentPage - 1})" title="Previous Page">
                    &larr; Prev
                </button>
            `;

            let startP = Math.max(1, dmSubmissionsCurrentPage - 2);
            let endP = Math.min(totalPages, startP + 4);
            if (endP - startP < 4) {
                startP = Math.max(1, endP - 4);
            }

            if (startP > 1) {
                btnsHtml += `<button type="button" class="dm-page-btn" onclick="window.goToDmSubmissionsPage(1)">1</button>`;
                if (startP > 2) {
                    btnsHtml += `<span style="padding: 0 4px; color: var(--text-gray); font-size: 12px;">...</span>`;
                }
            }

            for (let p = startP; p <= endP; p++) {
                btnsHtml += `
                    <button type="button" class="dm-page-btn ${p === dmSubmissionsCurrentPage ? 'active' : ''}" onclick="window.goToDmSubmissionsPage(${p})">
                        ${p}
                    </button>
                `;
            }

            if (endP < totalPages) {
                if (endP < totalPages - 1) {
                    btnsHtml += `<span style="padding: 0 4px; color: var(--text-gray); font-size: 12px;">...</span>`;
                }
                btnsHtml += `<button type="button" class="dm-page-btn" onclick="window.goToDmSubmissionsPage(${totalPages})">${totalPages}</button>`;
            }

            btnsHtml += `
                <button type="button" class="dm-page-btn" ${dmSubmissionsCurrentPage === totalPages ? 'disabled' : ''} onclick="window.goToDmSubmissionsPage(${dmSubmissionsCurrentPage + 1})" title="Next Page">
                    Next &rarr;
                </button>
            `;

            pageButtons.innerHTML = btnsHtml;
        }
    }
}

// Navigation between submission pages
window.goToDmSubmissionsPage = function(page) {
    dmSubmissionsCurrentPage = page;
    renderSubmissions();
    const container = document.getElementById('dmSubmissionsListContainer');
    if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// Give Completion (Approve)
window.approveDmSubmission = async function(subId) {
    try {
        await updateDoc(doc(db, "daily_mission_submissions", subId), {
            status: "completed",
            reviewedAt: new Date(),
            reviewedBy: auth.currentUser?.email || 'Teacher'
        });

        // Update local cache
        const sub = currentWeekSubmissions.find(s => s.id === subId);
        if (sub) {
            sub.status = "completed";
            sub.reviewedAt = new Date();
        }

        updateSubmissionStats();
        renderSubmissions();
    } catch (err) {
        console.error("Error approving submission:", err);
        alert("Failed to give completion: " + err.message);
    }
};

// Request Revision
window.requestDmRevision = async function(subId) {
    const feedback = prompt("Enter feedback or revision instructions for the student:");
    if (feedback === null) return;

    try {
        await updateDoc(doc(db, "daily_mission_submissions", subId), {
            status: "revision",
            teacherFeedback: feedback.trim(),
            reviewedAt: new Date(),
            reviewedBy: auth.currentUser?.email || 'Teacher'
        });

        const sub = currentWeekSubmissions.find(s => s.id === subId);
        if (sub) {
            sub.status = "revision";
            sub.teacherFeedback = feedback.trim();
        }

        updateSubmissionStats();
        renderSubmissions();
    } catch (err) {
        console.error("Error requesting revision:", err);
        alert("Failed to request revision: " + err.message);
    }
};

window.deleteDmSubmission = async function(subId) {
    if (!confirm("Are you sure you want to delete this student submission?")) return;
    try {
        await deleteDoc(doc(db, "daily_mission_submissions", subId));
        currentWeekSubmissions = currentWeekSubmissions.filter(s => s.id !== subId);
        updateSubmissionStats();
        renderSubmissions();
    } catch (err) {
        console.error("Error deleting submission:", err);
        alert("Failed to delete submission: " + err.message);
    }
};

// Photo Lightbox
function setupLightbox() {
    window.openDmPhotoLightbox = function(url) {
        const overlay = document.createElement('div');
        overlay.className = 'dm-lightbox-overlay';
        overlay.innerHTML = `<img src="${url}" class="dm-lightbox-img" alt="Enlarged photo">`;
        overlay.onclick = () => document.body.removeChild(overlay);
        document.body.appendChild(overlay);
    };
}

function formatTimestamp(raw) {
    if (!raw) return 'Recently';
    try {
        let d;
        if (typeof raw.toDate === 'function') d = raw.toDate();
        else if (raw.seconds) d = new Date(raw.seconds * 1000);
        else d = new Date(raw);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return 'Recently';
    }
}
