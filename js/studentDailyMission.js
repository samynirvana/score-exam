import { 
    collection, addDoc, getDocs, doc, query, where, setDoc, getDoc, updateDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { escapeHtml } from "../utils.js";

// Days of the school week
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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

// Helper: Format week range label (e.g., Oct 5 – Oct 9, 2026)
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

// State
let currentStudent = null;
let currentWeekMonday = getMonday(new Date());
let selectedDay = null;
let weekMissions = [];
let studentSubmissions = [];
let capturedPhotoData = null;
let bonusAwardedCallback = null;
let isUiSetup = false;
let missionUnsubscribe = null;
let submissionUnsubscribe = null;

// Expose modal handlers to window immediately so buttons work at any time
window.closeSaturdayBonusModal = () => {
    const modal = document.getElementById('saturdayBonusModal');
    if (modal) modal.style.display = 'none';
};

window.previewSaturdayBonusPopup = () => {
    showSaturdayBonusModal(currentStudent?.name || 'Student');
};

function isPastMissionDay(day) {
    const missionDate = getDayDate(currentWeekMonday, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return missionDate < today;
}

// Helper: Check whether a day's mission is accessible for the student (respecting teacher manual toggle)
export function isDayAccessible(day) {
    if (!day) return false;
    const mission = weekMissions.find(m => (m.day || '').trim().toLowerCase() === day.trim().toLowerCase());
    const isPast = isPastMissionDay(day);

    // If teacher set an explicit access status override on this mission
    if (mission && mission.accessStatus) {
        if (mission.accessStatus === 'open') {
            return true; // Explicitly unlocked by teacher
        }
        if (mission.accessStatus === 'closed') {
            return false; // Explicitly locked by teacher
        }
    }

    // Default behavior ("Auto"):
    // Students cannot access the mission once it already moved to the next day
    if (isPast) {
        return false;
    }

    return true;
}

// Helper: Check if a mission document belongs to the active week
function isMissionForCurrentWeek(data, weekKey, mondayDate) {
    const docWeekKey = (data.weekKey || '').trim();
    if (docWeekKey === weekKey) return true;

    // Fallback: check if createdAt or updatedAt falls within Monday-Sunday of this week
    if (data.createdAt || data.updatedAt) {
        const rawDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || data.updatedAt);
        if (!isNaN(rawDate.getTime())) {
            const startMon = new Date(mondayDate);
            startMon.setHours(0, 0, 0, 0);
            const endSun = new Date(startMon);
            endSun.setDate(endSun.getDate() + 7);
            if (rawDate >= startMon && rawDate <= endSun) return true;
        }
    }
    return false;
}

// Helper: Tolerant check if mission targetClass matches current student
function isClassMatchForStudent(data, student) {
    const rawTarget = (data.targetClass || 'all').trim().toLowerCase();
    if (!rawTarget || rawTarget === 'all' || rawTarget === 'all classes' || rawTarget === 'everyone' || rawTarget === 'all students') {
        return true;
    }
    const studentClass = (student?.studentClass || student?.class || student?.className || '').trim().toLowerCase();
    if (!studentClass || studentClass === 'unassigned') {
        return true; // Allow unassigned students to view all missions
    }
    return rawTarget === studentClass || 
           studentClass.includes(rawTarget) || 
           rawTarget.includes(studentClass) || 
           studentClass.replace(/\s+/g, '') === rawTarget.replace(/\s+/g, '');
}

// Initialize Student Daily Mission Component
export async function initStudentDailyMission(studentData, onBonusAwardedCallback) {
    if (!studentData || !studentData.code) return;
    const isFirstTime = !currentStudent || (currentStudent.code !== studentData.code);
    currentStudent = studentData;
    bonusAwardedCallback = onBonusAwardedCallback;

    if (!isUiSetup) {
        setupStudentDayPills();
        setupSaturdayModal(onBonusAwardedCallback);
        isUiSetup = true;
    }

    if (isFirstTime || !missionUnsubscribe) {
        startRealtimeMissionListeners();
    }
}

// Start real-time sync for missions and submissions
export function startRealtimeMissionListeners() {
    if (!currentStudent || !currentStudent.code) return;

    if (missionUnsubscribe) {
        missionUnsubscribe();
        missionUnsubscribe = null;
    }
    if (submissionUnsubscribe) {
        submissionUnsubscribe();
        submissionUnsubscribe = null;
    }

    const weekKey = getWeekKey(currentWeekMonday);
    const studentCode = currentStudent.code.toUpperCase().trim();

    console.log(`[DailyMission] Setting up real-time listener for weekKey: "${weekKey}", student: "${studentCode}"`);

    // 1. Listen for daily_missions changes in real time (scoped to current week to prevent full collection reads)
    try {
        const missionQuery = query(
            collection(db, "daily_missions"),
            where("weekKey", "==", weekKey)
        );
        missionUnsubscribe = onSnapshot(missionQuery, (snap) => {
            weekMissions = [];
            snap.forEach(d => {
                const data = d.data();
                if (isClassMatchForStudent(data, currentStudent)) {
                    weekMissions.push({ id: d.id, ...data });
                }
            });
            console.log(`[DailyMission] Real-time synced ${weekMissions.length} active mission(s):`, weekMissions);
            renderDayPills();
            renderStreakProgress();
            renderActiveMissionWorkspace();
            updateClaimBonusButtonState();
        }, (err) => {
            console.warn("[DailyMission] Scoped missions listener fallback:", err);
            loadStudentWeekMissionsOnce();
        });
    } catch (err) {
        console.error("[DailyMission] Error creating missions listener:", err);
        loadStudentWeekMissionsOnce();
    }

    // 2. Listen for current student's submissions in real time
    try {
        const subQuery = query(
            collection(db, "daily_mission_submissions"), 
            where("studentCode", "==", studentCode)
        );
        submissionUnsubscribe = onSnapshot(subQuery, (snap) => {
            studentSubmissions = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.weekKey === weekKey || !data.weekKey) {
                    studentSubmissions.push({ id: d.id, ...data });
                }
            });
            console.log(`[DailyMission] Real-time synced ${studentSubmissions.length} submission(s):`, studentSubmissions);
            renderDayPills();
            renderStreakProgress();
            renderActiveMissionWorkspace();
            updateClaimBonusButtonState();
            checkAndAwardSaturdayBonus(bonusAwardedCallback);
        }, (err) => {
            console.error("[DailyMission] Realtime listener error for submissions:", err);
        });
    } catch (err) {
        console.error("[DailyMission] Error creating submissions listener:", err);
    }
}

// Fallback: one-time load if onSnapshot fails
export async function loadStudentWeekMissions() {
    startRealtimeMissionListeners();
}

async function loadStudentWeekMissionsOnce() {
    const weekKey = getWeekKey(currentWeekMonday);
    const studentCode = currentStudent?.code?.toUpperCase()?.trim() || '';

    try {
        const snap = await getDocs(collection(db, "daily_missions"));
        weekMissions = [];
        snap.forEach(d => {
            const data = d.data();
            if (isMissionForCurrentWeek(data, weekKey, currentWeekMonday) && isClassMatchForStudent(data, currentStudent)) {
                weekMissions.push({ id: d.id, ...data });
            }
        });

        if (studentCode) {
            const subQuery = query(
                collection(db, "daily_mission_submissions"), 
                where("studentCode", "==", studentCode)
            );
            const subSnap = await getDocs(subQuery);
            studentSubmissions = [];
            subSnap.forEach(d => {
                const data = d.data();
                if (data.weekKey === weekKey || !data.weekKey) {
                    studentSubmissions.push({ id: d.id, ...data });
                }
            });
        }

        renderDayPills();
        renderStreakProgress();
        renderActiveMissionWorkspace();
        await updateClaimBonusButtonState();
    } catch (err) {
        console.error("[DailyMission] Error in fallback loader:", err);
    }
}

// Setup day pill click events
function setupStudentDayPills() {
    const container = document.getElementById('dmStudentDayPills');
    if (!container) return;

    container.querySelectorAll('.dm-day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const day = pill.getAttribute('data-day');
            if (!day || !isDayAccessible(day)) return;
            selectedDay = selectedDay === day ? null : day;
            capturedPhotoData = null;
            renderDayPills();
            renderActiveMissionWorkspace();
        });
    });
}

// Update the 5 day pills visual states
function renderDayPills() {
    const todayIndex = new Date().getDay(); // 1 = Mon ... 5 = Fri
    const todayName = (todayIndex >= 1 && todayIndex <= 5) ? DAYS_OF_WEEK[todayIndex - 1] : null;
    if (selectedDay && !isDayAccessible(selectedDay)) selectedDay = null;

    DAYS_OF_WEEK.forEach(day => {
        const pill = document.querySelector(`#dmStudentDayPills .dm-day-pill[data-day="${day}"]`);
        if (!pill) return;

        const isAccessible = isDayAccessible(day);
        const isPast = isPastMissionDay(day);
        const isLocked = !isAccessible;
        const isReopened = isPast && isAccessible;
        const isExpanded = day === selectedDay && isAccessible;

        pill.classList.toggle('active', isExpanded);
        pill.classList.toggle('is-today', day === todayName);
        pill.classList.toggle('is-past', isLocked);
        pill.classList.toggle('is-reopened', isReopened);
        pill.setAttribute('aria-disabled', String(isLocked));
        pill.setAttribute('aria-expanded', String(isExpanded));
        pill.disabled = isLocked;

        const dayDate = getDayDate(currentWeekMonday, day);
        const dateSpan = pill.querySelector('.dm-day-date');
        if (dateSpan) {
            dateSpan.innerText = dayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }

        const mission = weekMissions.find(m => (m.day || '').trim().toLowerCase() === day.trim().toLowerCase());
        const sub = studentSubmissions.find(s => (s.day || '').trim().toLowerCase() === day.trim().toLowerCase());
        const state = sub?.status === 'completed' ? 'complete'
            : mission && isLocked && !sub ? 'missed'
            : mission ? 'waiting' : 'empty';
        pill.classList.remove('dm-day-complete', 'dm-day-missed', 'dm-day-waiting');
        if (state !== 'empty') pill.classList.add(`dm-day-${state}`);
        const stateLabel = state === 'complete' ? 'approved by teacher'
            : state === 'missed' ? 'mission missed'
            : isReopened ? 'mission reopened by teacher - open for submission'
            : state === 'waiting' ? (sub ? 'awaiting teacher approval or revision' : 'mission to complete')
            : 'no mission assigned';
        pill.setAttribute('aria-label', `${day}, ${dayDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}: ${stateLabel}`);
        if (isReopened) {
            pill.setAttribute('title', 'Reopened by Teacher: Open for submission!');
        } else {
            pill.removeAttribute('title');
        }
    });
}

// Render the 5-day streak progress
function renderStreakProgress() {
    let completedCount = 0;
    DAYS_OF_WEEK.forEach(day => {
        const sub = studentSubmissions.find(s => (s.day || '').trim().toLowerCase() === day.trim().toLowerCase());
        if (sub && sub.status === 'completed') {
            completedCount++;
        }
    });

    const streakCountEl = document.getElementById('dmStreakCompletedCount');
    const streakProgressFill = document.getElementById('dmStreakProgressFill');

    if (streakCountEl) streakCountEl.innerText = `${completedCount} / 5`;
    if (streakProgressFill) {
        const pct = (completedCount / 5) * 100;
        streakProgressFill.style.width = `${pct}%`;
    }

}

// Render active day's mission workspace
function renderActiveMissionWorkspace() {
    const workspace = document.getElementById('dmActiveMissionWorkspace');
    if (!workspace) return;

    if (!selectedDay || !isDayAccessible(selectedDay)) {
        workspace.hidden = true;
        workspace.innerHTML = '';
        return;
    }

    workspace.hidden = false;

    const mission = weekMissions.find(m => (m.day || '').trim().toLowerCase() === selectedDay.trim().toLowerCase());
    const sub = studentSubmissions.find(s => (s.day || '').trim().toLowerCase() === selectedDay.trim().toLowerCase());

    if (!mission) {
        workspace.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                <div style="margin-bottom: 12px; display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(99, 102, 241, 0.1); color: var(--dm-primary);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
                <h4 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: var(--text-dark);">No Mission for ${selectedDay}</h4>
                <p style="margin: 0; font-size: 13.5px;">Your teacher hasn't assigned a mission for this day yet. Check back soon!</p>
            </div>
        `;
        return;
    }

    const typeIcons = {
        photo: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Taking a Picture',
        opinion: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Giving an Opinion / Reflection',
        question: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Answering Questions',
        general: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>Task Submission'
    };
    const typeLabel = typeIcons[mission.taskType] || '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Daily Task';

    let statusBannerHtml = '';
    let formDisabled = false;

    if (sub) {
        if (sub.status === 'completed') {
            statusBannerHtml = `
                <div class="dm-status-banner completed">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <div>
                        <strong>Mission Completed & Approved!</strong> Your teacher checked your submission and gave completion.
                        ${sub.teacherFeedback ? `<div style="font-size: 12.5px; margin-top: 4px; font-weight: 500;">Note: ${escapeHtml(sub.teacherFeedback)}</div>` : ''}
                    </div>
                </div>
            `;
            formDisabled = true;
        } else if (sub.status === 'revision') {
            statusBannerHtml = `
                <div class="dm-status-banner revision">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    <div>
                        <strong>Revision Requested by Teacher:</strong> "${escapeHtml(sub.teacherFeedback || 'Please update your response.')}"
                        <div style="font-size: 12.5px; margin-top: 3px;">Please make the changes below and resubmit!</div>
                    </div>
                </div>
            `;
        } else {
            statusBannerHtml = `
                <div class="dm-status-banner pending">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <div>
                        <strong>Submitted & Under Review!</strong> Your submission is waiting for your teacher to check and give completion.
                    </div>
                </div>
            `;
        }
    }

    // Input fields based on task type
    let inputFieldsHtml = '';

    if (mission.taskType === 'photo') {
        const currentPhoto = capturedPhotoData || (sub ? sub.photoUrl : null);
        inputFieldsHtml = `
            <div style="margin-bottom: 16px;">
                <label class="dm-input-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Take or Upload Photo:
                </label>
                
                <div id="dmDropzoneArea" class="dm-dropzone" style="${currentPhoto ? 'display:none;' : ''}">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--dm-primary)" stroke-width="2" style="margin-bottom: 8px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    <div style="font-weight: 700; font-size: 14px; color: var(--text-dark);">Click to upload or take a picture</div>
                    <div style="font-size: 12px; color: var(--text-gray); margin-top: 3px;">Supports PNG, JPG, or device camera (Saved to Drive picsdb)</div>
                    <input type="file" id="dmPhotoFileInput" accept="image/*" capture="environment" style="display: none;">
                </div>

                <div id="dmPhotoPreviewArea" class="dm-preview-container" style="${currentPhoto ? '' : 'display:none;'}">
                    <img id="dmPhotoPreviewImg" class="dm-preview-img" src="${currentPhoto || ''}" alt="Photo submission">
                    ${!formDisabled ? `
                        <button type="button" class="dm-remove-img-btn" id="dmRemovePhotoBtn" title="Remove photo">✕</button>
                    ` : ''}
                </div>

                <label class="dm-input-label" style="margin-top: 12px;">Notes or Caption (Optional):</label>
                <textarea id="dmStudentTextResponse" class="dm-textarea" placeholder="Describe your picture or add thoughts..." ${formDisabled ? 'disabled' : ''}>${escapeHtml(sub?.textResponse || '')}</textarea>
            </div>
        `;
    } else if (mission.taskType === 'opinion') {
        inputFieldsHtml = `
            <div style="margin-bottom: 16px;">
                <label class="dm-input-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Your Opinion / Thoughts:
                </label>
                <textarea id="dmStudentTextResponse" class="dm-textarea" style="min-height: 140px;" placeholder="Write your opinion or reflection here..." ${formDisabled ? 'disabled' : ''}>${escapeHtml(sub?.textResponse || '')}</textarea>
            </div>
        `;
    } else if (mission.taskType === 'question') {
        inputFieldsHtml = `
            <div style="margin-bottom: 16px;">
                ${mission.questionPrompt ? `
                    <div style="background: rgba(99, 102, 241, 0.08); border-left: 3px solid var(--dm-primary); padding: 12px 14px; border-radius: 8px; margin-bottom: 14px;">
                        <span style="font-size: 12px; font-weight: 800; color: var(--dm-primary); text-transform: uppercase;">Question:</span>
                        <div style="font-size: 14.5px; font-weight: 700; color: var(--text-dark); margin-top: 4px;">${escapeHtml(mission.questionPrompt)}</div>
                    </div>
                ` : ''}
                <label class="dm-input-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Your Answer:
                </label>
                <textarea id="dmStudentTextResponse" class="dm-textarea" placeholder="Type your answer here..." ${formDisabled ? 'disabled' : ''}>${escapeHtml(sub?.textResponse || '')}</textarea>
            </div>
        `;
    } else {
        inputFieldsHtml = `
            <div style="margin-bottom: 16px;">
                <label class="dm-input-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; margin-right: 4px;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                    Your Response:
                </label>
                <textarea id="dmStudentTextResponse" class="dm-textarea" placeholder="Enter your response here..." ${formDisabled ? 'disabled' : ''}>${escapeHtml(sub?.textResponse || '')}</textarea>
            </div>
        `;
    }

    const isReopenedToday = isPastMissionDay(selectedDay) && isDayAccessible(selectedDay);
    const reopenedBannerHtml = isReopenedToday ? `
        <div class="dm-reopened-banner" style="background: rgba(16, 185, 129, 0.1); border: 1.5px solid #10b981; color: #065f46; padding: 11px 16px; border-radius: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
            <div>
                <strong>Mission Reopened:</strong> Your teacher has temporarily unlocked access for ${selectedDay}. You can submit your mission now!
            </div>
        </div>
    ` : '';

    workspace.innerHTML = `
        <div class="dm-mission-box">
            <div class="dm-mission-header">
                <div>
                    <span class="dm-task-type-badge">${typeLabel}</span>
                    <h3 class="dm-mission-title" style="margin-top: 8px;">${escapeHtml(mission.title)}</h3>
                </div>
                <div style="font-size: 13px; font-weight: 700; color: var(--text-gray);">
                    ${selectedDay}
                </div>
            </div>

            ${reopenedBannerHtml}

            ${mission.description ? `
                <div class="dm-mission-desc">${escapeHtml(mission.description)}</div>
            ` : ''}

            ${statusBannerHtml}

            ${inputFieldsHtml}

            ${!formDisabled ? `
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" id="dmSubmitMissionBtn" class="dm-submit-btn">
                        <span style="display: inline-flex; align-items: center; gap: 6px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            ${sub ? 'Update Submission' : 'Submit ' + selectedDay + "'s Mission"}
                        </span>
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    // Re-bind dynamic elements
    bindActiveWorkspaceEvents();
}

function bindActiveWorkspaceEvents() {
    const dropzone = document.getElementById('dmDropzoneArea');
    const fileInput = document.getElementById('dmPhotoFileInput');
    const removeBtn = document.getElementById('dmRemovePhotoBtn');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handlePhotoSelected(file);
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            capturedPhotoData = null;
            renderActiveMissionWorkspace();
        });
    }

    const submitBtn = document.getElementById('dmSubmitMissionBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitStudentMission);
    }
}

// Compress and store photo as Data URL
function handlePhotoSelected(file) {
    if (!file.type.startsWith('image/')) {
        alert("Please select a valid image file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Compress with Canvas to keep Firestore document size small and fast (< 400KB)
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 960;
            const MAX_HEIGHT = 960;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = Math.round((width * MAX_HEIGHT) / height);
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            capturedPhotoData = canvas.toDataURL('image/jpeg', 0.82);
            renderActiveMissionWorkspace();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupDropzone() {
    // Handled in bindActiveWorkspaceEvents
}

// Upload photo to Google Drive folder 'picsdb' via Google Apps Script Web App
async function uploadPhotoToPicsdbDrive(dataUrl, customFileName) {
    if (!dataUrl) return null;

    // If it's already an HTTP / Google Drive link, no need to re-upload
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
        return dataUrl;
    }

    let scriptUrl = localStorage.getItem('timelineDriveScriptUrl') || 
                    localStorage.getItem('profileDriveScriptUrl') || 
                    localStorage.getItem('googleDriveScriptUrl') || 
                    'https://script.google.com/macros/s/AKfycbzxuNo00ECJPS8ISWd8tepkMXGX5_EKnVBBujd1WtxZcsEp4tsJkfmJF3UEEgzahvTsiQ/exec';
    let folderId = localStorage.getItem('picsdbDriveFolderId') || '';

    try {
        const snap = await getDoc(doc(db, "system_settings", "google_drive"));
        if (snap.exists()) {
            const d = snap.data();
            scriptUrl = d.timelineScriptUrl || d.scriptUrlTimeline || d.profileScriptUrl || d.scriptUrlProfile || d.scriptUrl || scriptUrl;
            if (d.picsdbFolderId || d.folderIdPicsdb) {
                folderId = d.picsdbFolderId || d.folderIdPicsdb;
            }
        }
    } catch (e) {
        console.warn("Could not check system_settings for Google Drive:", e);
    }

    if (!scriptUrl) {
        console.warn("No Google Drive script URL configured, returning data URL.");
        return dataUrl;
    }

    try {
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const studentCode = currentStudent?.code ? currentStudent.code.toUpperCase().trim() : 'student';
        const fileName = customFileName || `mission_${studentCode}_${selectedDay}_${Date.now()}.jpg`;

        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                fileName: fileName,
                mimeType: 'image/jpeg',
                base64Data: base64Data,
                folderName: "picsdb",
                folderId: folderId,
                type: "daily_mission_photo"
            })
        });

        const resText = await response.text();
        let resJson;
        try {
            resJson = JSON.parse(resText);
        } catch (pe) {
            console.warn("Raw Google Drive script response:", resText);
        }

        if (resJson) {
            if (resJson.url || resJson.directUrl || resJson.viewUrl) {
                return resJson.url || resJson.directUrl || resJson.viewUrl;
            } else if (resJson.fileId) {
                return "https://lh3.googleusercontent.com/d/" + resJson.fileId;
            }
        }
    } catch (uploadErr) {
        console.warn("Google Drive upload to picsdb failed, falling back to local base64:", uploadErr);
    }

    return dataUrl;
}

// Submit or Update student's mission
async function submitStudentMission() {
    if (!selectedDay || !isDayAccessible(selectedDay)) {
        alert('This daily mission is closed. Submissions are currently locked.');
        return;
    }
    const mission = weekMissions.find(m => (m.day || '').trim().toLowerCase() === selectedDay.trim().toLowerCase());
    if (!mission) return;

    const textResponse = document.getElementById('dmStudentTextResponse')?.value.trim() || '';
    const submitBtn = document.getElementById('dmSubmitMissionBtn');

    if (mission.taskType === 'photo') {
        const photo = capturedPhotoData || studentSubmissions.find(s => (s.day || '').trim().toLowerCase() === selectedDay.trim().toLowerCase())?.photoUrl;
        if (!photo) {
            alert("Please take or upload a photo for this mission.");
            return;
        }
    } else if (mission.taskType === 'opinion') {
        if (!textResponse) {
            alert("Please write your opinion before submitting.");
            return;
        }
    } else if (mission.taskType === 'question') {
        if (!textResponse) {
            alert("Please enter your answer before submitting.");
            return;
        }
    } else {
        if (!textResponse && !capturedPhotoData) {
            alert("Please provide a response before submitting.");
            return;
        }
    }

    try {
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Saving mission...";
        }

        const weekKey = getWeekKey(currentWeekMonday);
        const dayIndex = DAYS_OF_WEEK.indexOf(selectedDay) + 1;
        const existingSub = studentSubmissions.find(s => (s.day || '').trim().toLowerCase() === selectedDay.trim().toLowerCase());

        let finalPhotoUrl = null;
        if (capturedPhotoData) {
            if (submitBtn) submitBtn.innerText = "Uploading to Drive (picsdb)...";
            finalPhotoUrl = await uploadPhotoToPicsdbDrive(capturedPhotoData);
        } else if (existingSub && existingSub.photoUrl) {
            finalPhotoUrl = existingSub.photoUrl;
        }

        if (!isDayAccessible(selectedDay)) {
            alert('This daily mission is closed. Submissions are currently locked.');
            renderDayPills();
            renderActiveMissionWorkspace();
            return;
        }

        const payload = {
            missionId: mission.id,
            weekKey: weekKey,
            day: selectedDay,
            dayIndex: dayIndex,
            studentCode: currentStudent.code.toUpperCase().trim(),
            studentName: currentStudent.name || currentStudent.code,
            studentClass: currentStudent.studentClass || '',
            taskType: mission.taskType,
            textResponse: textResponse,
            status: "pending", // Waiting for teacher to give completion
            submittedAt: new Date()
        };

        if (finalPhotoUrl) {
            payload.photoUrl = finalPhotoUrl;
            payload.driveFolder = "picsdb";
        }

        if (existingSub) {
            await updateDoc(doc(db, "daily_mission_submissions", existingSub.id), payload);
            alert(`Your mission for ${selectedDay} has been updated! Waiting for your teacher's review.`);
        } else {
            await addDoc(collection(db, "daily_mission_submissions"), payload);
            alert(`Awesome! Your mission for ${selectedDay} has been submitted! Your teacher will check it soon.`);
        }

        capturedPhotoData = null;
        await loadStudentWeekMissions();
    } catch (err) {
        console.error("Error submitting daily mission:", err);
        alert("Failed to submit mission: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    }
}

// --- WEEKLY STREAK BONUS LOGIC ---

// Update the "Claim the Bonus" button state based on 5-day completion and reward claim status
export async function updateClaimBonusButtonState() {
    const claimBtn = document.getElementById('dmClaimBonusBtn');
    const hintEl = document.getElementById('dmClaimStatusHint');
    if (!claimBtn || !currentStudent || !currentStudent.code) return;

    const completedDays = DAYS_OF_WEEK.filter(day => {
        const sub = studentSubmissions.find(s => s.day === day);
        return sub && sub.status === 'completed';
    });
    const completedCount = completedDays.length;
    const isAllFiveDone = completedCount === 5;
    document.querySelectorAll('#dmModalProgress [data-day]').forEach(star => {
        const complete = completedDays.includes(star.dataset.day);
        star.classList.toggle('complete', complete);
        star.setAttribute('aria-label', `${star.dataset.day}: ${complete ? 'completed' : 'not completed'}`);
    });

    const weekKey = getWeekKey(currentWeekMonday);
    const studentCode = currentStudent.code.toUpperCase().trim();
    let alreadyClaimed = false;

    if (isAllFiveDone) {
        try {
            const rewardRef = doc(db, "daily_mission_rewards", `${studentCode}_${weekKey}`);
            const rewardSnap = await getDoc(rewardRef);
            alreadyClaimed = rewardSnap.exists();
        } catch (e) {
            console.warn("Could not check daily_mission_rewards:", e);
        }
    }

    if (alreadyClaimed) {
        claimBtn.disabled = true;
        claimBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> Bonus Claimed';
        claimBtn.style.background = "#10b981";
        claimBtn.style.cursor = "default";
        claimBtn.style.opacity = "0.9";
        claimBtn.onclick = null;
        if (hintEl) {
            hintEl.innerText = "Reward collected! Great work this week.";
            hintEl.style.color = "#10b981";
        }
    } else if (isAllFiveDone) {
        claimBtn.disabled = false;
        claimBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M12 8v13M3 13h18"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5c1.5 0 4.5 5 4.5 5s3-5 4.5-5a2.5 2.5 0 0 1 0 5"></path></svg> Claim the Bonus';
        claimBtn.style.background = "var(--dm-purple-gradient)";
        claimBtn.style.cursor = "pointer";
        claimBtn.style.opacity = "1";
        if (hintEl) {
            hintEl.innerText = 'All 5 stars earned. Your reward is ready!';
            hintEl.style.color = '#059669';
        }
        claimBtn.onclick = async () => {
            claimBtn.disabled = true;
            claimBtn.innerText = "Claiming...";
            await executeClaimWeeklyBonus(weekKey);
            await updateClaimBonusButtonState();
        };
    } else {
        // Not completed all 5 days: grey and unclickable
        claimBtn.disabled = true;
        claimBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Claim the Bonus';
        claimBtn.style.background = "#94a3b8";
        claimBtn.style.cursor = "not-allowed";
        claimBtn.style.opacity = "0.65";
        claimBtn.onclick = null;
        if (hintEl) {
            hintEl.innerText = `${completedCount} of 5 stars earned. Keep going!`;
            hintEl.style.color = "var(--text-gray, #64748b)";
        }
    }
}

// Award weekly streak bonus (+1.5 points) when claimed by student
async function executeClaimWeeklyBonus(weekKey) {
    if (!currentStudent || !currentStudent.code) return;
    const studentCode = currentStudent.code.toUpperCase().trim();
    const studentName = currentStudent.name || studentCode;
    const studentClass = currentStudent.studentClass || '';

    try {
        // 1. Record reward claim in daily_mission_rewards
        await setDoc(doc(db, "daily_mission_rewards", `${studentCode}_${weekKey}`), {
            studentCode: studentCode,
            studentName: studentName,
            studentClass: studentClass,
            weekKey: weekKey,
            awardedAt: new Date(),
            points: 1.5,
            type: "weekly_streak_bonus"
        });

        // 2. Automatically add 1.5 behavior points into student_points
        await addDoc(collection(db, "student_points"), {
            studentCode: studentCode,
            studentName: studentName,
            studentClass: studentClass,
            reason: `Daily Mission 5-Day Streak Bonus (Mon-Fri 5/5) - Weekly Bonus`,
            points: 1.5,
            timestamp: new Date()
        });

        alert("Congratulations! 1.5 Behavior Points have been added to your profile! 🌟");

        // 3. Trigger profile / behavior point update in main dashboard
        if (typeof bonusAwardedCallback === 'function') {
            bonusAwardedCallback();
        }
    } catch (err) {
        console.error("Error claiming weekly bonus:", err);
        alert("Failed to claim bonus: " + err.message);
    }
}

export async function checkAndAwardSaturdayBonus(onBonusAwardedCallback) {
    if (!currentStudent || !currentStudent.code) return;
    if (onBonusAwardedCallback) bonusAwardedCallback = onBonusAwardedCallback;

    const weekKey = getWeekKey(currentWeekMonday);
    const studentCode = currentStudent.code.toUpperCase().trim();

    const completedDays = DAYS_OF_WEEK.filter(day => {
        const sub = studentSubmissions.find(s => s.day === day);
        return sub && sub.status === 'completed';
    });
    const isAllFiveDone = completedDays.length === 5;

    let alreadyAwarded = false;
    try {
        const rewardRef = doc(db, "daily_mission_rewards", `${studentCode}_${weekKey}`);
        const rewardSnap = await getDoc(rewardRef);
        alreadyAwarded = rewardSnap.exists();
    } catch (e) {
        console.warn("Could not check reward status:", e);
    }

    // If 5/5 complete and not yet claimed, show modal prompting student to Claim the Bonus!
    if (isAllFiveDone && !alreadyAwarded) {
        await showSaturdayBonusModal(currentStudent.name);
    }
}

// Setup Saturday / Weekly Modal & Preview function
function setupSaturdayModal(onBonusAwardedCallback) {
    if (onBonusAwardedCallback) bonusAwardedCallback = onBonusAwardedCallback;

    window.previewSaturdayBonusPopup = () => {
        showSaturdayBonusModal(currentStudent?.name || 'Student');
    };

    window.closeSaturdayBonusModal = () => {
        const modal = document.getElementById('saturdayBonusModal');
        if (modal) modal.style.display = 'none';
    };

    const modal = document.getElementById('saturdayBonusModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

export async function showSaturdayBonusModal(studentName) {
    const modal = document.getElementById('saturdayBonusModal');
    if (!modal) return;

    const nameEl = document.getElementById('dmSatModalStudentName');
    if (nameEl) nameEl.innerText = studentName;

    await updateClaimBonusButtonState();
    modal.style.display = 'flex';
}
