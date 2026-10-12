// Live Quiz Command Center, Real-Time Monitoring & Past Quiz Cleanup
// Modular component extracted from admin.js

import { collection, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// Hook to reload quizzes table in admin UI
let refreshQuizzesTable = (force) => {
    if (typeof window.loadQuizzesTable === 'function') {
        window.loadQuizzesTable(force);
    }
};

export function setupLiveQuizContext(options = {}) {
    if (typeof options.refreshQuizzesTable === 'function') {
        refreshQuizzesTable = options.refreshQuizzesTable;
    }
    setupLobbiesRealtimeListener();
}

if (typeof window !== 'undefined') {
    setTimeout(() => {
        try { setupLobbiesRealtimeListener(); } catch (e) {}
    }, 800);
}

// ==========================================
// START LIVE QUIZ LOBBY SETUP & CREATION
// ==========================================
let availableQuizzesForLiveMap = {};

async function openStartLiveQuizModal() {
    const modal = document.getElementById("startLiveQuizSetupModal");
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const quizSelect = document.getElementById("liveQuizSelectQuiz");
    const classSelect = document.getElementById("liveQuizSelectClass");
    const previewBox = document.getElementById("liveQuizSelectedPreview");

    if (quizSelect) {
        quizSelect.innerHTML = `<option value="">-- Loading available quizzes... --</option>`;
        quizSelect.disabled = true;
    }
    if (previewBox) previewBox.style.display = 'none';

    try {
        const snap = await getDocs(collection(db, "quizzes"));
        availableQuizzesForLiveMap = {};
        const quizList = [];

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const q = { id: docSnap.id, ...data };
            availableQuizzesForLiveMap[docSnap.id] = q;
            quizList.push(q);
        });

        // Sort quizzes newest first
        quizList.sort((a, b) => {
            const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            if (tB !== tA) return tB - tA;
            return (a.title || '').localeCompare(b.title || '');
        });

        if (quizSelect) {
            if (quizList.length === 0) {
                quizSelect.innerHTML = `<option value="">No quizzes found. Please create a quiz first.</option>`;
                quizSelect.disabled = true;
            } else {
                let optionsHtml = `<option value="">-- Choose Quiz to Host (${quizList.length} Available) --</option>`;
                quizList.forEach(q => {
                    const qCount = (q.items || q.questions || []).length;
                    const sub = q.subject || 'General';
                    const target = q.targetClass || 'All Classes';
                    optionsHtml += `<option value="${escapeHtml(q.id)}">${escapeHtml(q.title || 'Untitled Quiz')} [${escapeHtml(sub)} • ${qCount} Qs • ${escapeHtml(target)}]</option>`;
                });
                quizSelect.innerHTML = optionsHtml;
                quizSelect.disabled = false;
            }
        }

        if (classSelect) {
            const classSet = new Set();
            quizList.forEach(q => {
                const tc = (q.targetClass || '').toLowerCase().trim();
                if (tc && tc !== 'all' && tc !== 'all classes' && tc !== 'no classes' && tc !== 'none') {
                    q.targetClass.split(',').map(s => s.trim()).forEach(c => {
                        const low = c.toLowerCase();
                        if (c && low !== 'all' && low !== 'all classes' && low !== 'no classes' && low !== 'none') {
                            classSet.add(c);
                        }
                    });
                }
                if (Array.isArray(q.targetClassesList)) {
                    q.targetClassesList.forEach(c => {
                        const low = (c || '').toLowerCase().trim();
                        if (c && low !== 'all' && low !== 'all classes' && low !== 'no classes' && low !== 'none') {
                            classSet.add(c.trim());
                        }
                    });
                }
            });

            // Also check class checkboxes from DOM if present
            document.querySelectorAll('#quizClassOptions input[type="checkbox"]').forEach(cb => {
                const val = (cb.value || '').trim();
                const low = val.toLowerCase();
                if (val && low !== 'all classes' && low !== 'all' && low !== 'no classes' && low !== 'none') {
                    classSet.add(val);
                }
            });

            const sortedClasses = Array.from(classSet).sort();

            let classOptionsHtml = `<option value="All Classes">All Classes (Everyone can join)</option>`;
            sortedClasses.forEach(c => {
                classOptionsHtml += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
            });
            classSelect.innerHTML = classOptionsHtml;
        }

    } catch (err) {
        console.error("Error populating start live quiz modal:", err);
        if (quizSelect) {
            quizSelect.innerHTML = `<option value="">Error loading quizzes: ${escapeHtml(err.message)}</option>`;
        }
    }
}
window.openStartLiveQuizModal = openStartLiveQuizModal;

function closeStartLiveQuizModal() {
    const modal = document.getElementById("startLiveQuizSetupModal");
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeStartLiveQuizModal = closeStartLiveQuizModal;

function handleLiveQuizSelectionChange() {
    const quizSelect = document.getElementById("liveQuizSelectQuiz");
    const classSelect = document.getElementById("liveQuizSelectClass");
    const previewBox = document.getElementById("liveQuizSelectedPreview");
    const previewTitle = document.getElementById("livePreviewQuizTitle");
    const previewBadge = document.getElementById("livePreviewQuizSubject");
    const previewCount = document.getElementById("livePreviewQuizCount");
    const previewTarget = document.getElementById("livePreviewQuizTarget");

    const quizId = quizSelect?.value;
    if (!quizId || !availableQuizzesForLiveMap[quizId]) {
        if (previewBox) previewBox.style.display = 'none';
        return;
    }

    const quiz = availableQuizzesForLiveMap[quizId];
    const qCount = (quiz.items || quiz.questions || []).length;
    const subject = quiz.subject || 'General';
    const targetClass = quiz.targetClass || 'All Classes';
    const isNoClasses = targetClass.toLowerCase() === 'no classes' || targetClass.toLowerCase() === 'none';

    if (previewTitle) previewTitle.innerText = quiz.title || 'Untitled Quiz';
    if (previewBadge) previewBadge.innerText = subject;
    if (previewCount) previewCount.innerText = `${qCount} Questions`;
    if (previewTarget) previewTarget.innerText = isNoClasses ? `Assigned: No Classes (Live Only)` : `Assigned: ${targetClass}`;
    if (previewBox) previewBox.style.display = 'block';

    if (classSelect && targetClass) {
        if (isNoClasses) {
            // Keep default/current class dropdown selection so teacher selects which class to host for
        } else {
            let found = false;
            for (let i = 0; i < classSelect.options.length; i++) {
                if (classSelect.options[i].value.toLowerCase() === targetClass.toLowerCase()) {
                    classSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            if (!found && targetClass.toLowerCase() !== 'all' && targetClass.toLowerCase() !== 'all classes') {
                const opt = document.createElement('option');
                opt.value = targetClass;
                opt.text = targetClass;
                opt.selected = true;
                classSelect.appendChild(opt);
            }
        }
    }
}
window.handleLiveQuizSelectionChange = handleLiveQuizSelectionChange;

async function confirmCreateLiveQuizLobby() {
    const quizSelect = document.getElementById("liveQuizSelectQuiz");
    const classSelect = document.getElementById("liveQuizSelectClass");
    const durationInput = document.getElementById("liveQuizSetupDuration");
    const btn = document.getElementById("btnConfirmCreateLiveLobby");

    const quizId = quizSelect?.value;
    if (!quizId) {
        alert("Please select a quiz to host live.");
        return;
    }

    const targetClass = classSelect?.value || 'All Classes';
    const durationMinutes = parseInt(durationInput?.value, 10) || 30;

    const quizObj = availableQuizzesForLiveMap[quizId];
    const quizTitle = quizObj?.title || 'Live Quiz';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Creating Lobby...</span>`;
    }

    try {
        closeStartLiveQuizModal();
        await openLiveQuizMaster(quizId, quizTitle, targetClass, durationMinutes);
    } catch (err) {
        console.error("Error creating live quiz lobby:", err);
        alert("Failed to create live quiz lobby: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Create Quiz Lobby</span>`;
        }
    }
}
window.confirmCreateLiveQuizLobby = confirmCreateLiveQuizLobby;

// ==========================================
// LIVE QUIZ COMMAND CENTER & MONITORING
// ==========================================
let activeLiveQuizSession = null;
let liveQuizUnsubscribeSession = null;
let liveQuizUnsubscribeParticipants = null;
let liveQuizTimerInterval = null;
let liveParticipantsMap = {};

async function openLiveQuizMaster(quizId, quizTitle, customTargetClass = null, customDuration = null) {
    const modal = document.getElementById("liveQuizControlModal");
    if (!modal) return;

    // Reset previous listeners
    if (liveQuizUnsubscribeSession) liveQuizUnsubscribeSession();
    if (liveQuizUnsubscribeParticipants) liveQuizUnsubscribeParticipants();
    if (liveQuizTimerInterval) clearInterval(liveQuizTimerInterval);

    liveParticipantsMap = {};
    activeLiveQuizSession = { quizId, quizTitle, customTargetClass, customDuration };
    window.openLiveQuizMaster = openLiveQuizMaster;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    document.getElementById("liveQuizModalTitle").innerText = quizTitle || "Live Quiz Control Room";
    document.getElementById("liveQuizModalMeta").innerText = "Loading quiz configuration...";
    document.getElementById("liveParticipantsTbody").innerHTML = `
        <tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 36px;">Connecting to Live Session...</td></tr>
    `;
    document.getElementById("liveAntiCheatLog").innerHTML = `
        <div style="text-align: center; color: #991b1b; font-size: 12px; padding: 24px 10px; opacity: 0.8;">
            No suspicious behavior detected yet. Tab switches and window blurs will appear here instantly.
        </div>
    `;
    document.getElementById("liveStatConnectedCount").innerText = "0";
    document.getElementById("liveStatInfractionsCount").innerText = "0";
    document.getElementById("liveStudentCountLabel").innerText = "0";

    try {
        // 1. Fetch Quiz Data
        const qDocSnap = await getDoc(doc(db, "quizzes", quizId));
        if (!qDocSnap.exists()) {
            alert("Quiz not found in database.");
            closeLiveQuizModal();
            return;
        }
        const qData = qDocSnap.data();
        activeLiveQuizSession.quizData = qData;

        // Auto-activate quiz so students can discover it in their dashboard
        if (qData.status !== 'active') {
            await updateDoc(doc(db, "quizzes", quizId), {
                status: 'active',
                updatedAt: new Date().toISOString()
            });
            if (typeof window.cachedQuizzesList !== 'undefined') {
                window.cachedQuizzesList = null;
            }
            refreshQuizzesTable(true);
        }

        const itemsCount = (qData.items || qData.questions || []).length;
        const resolvedTargetClass = customTargetClass || qData.targetClass || 'All Classes';
        const resolvedDuration = customDuration || 30;
        document.getElementById("liveQuizModalMeta").innerText = `Target: ${resolvedTargetClass} | Subject: ${qData.subject || 'General'} | ${itemsCount} Questions`;

        // 2. Initialize or fetch live session document in Firestore: live_quizzes/{quizId}
        const liveDocRef = doc(db, "live_quizzes", quizId);
        const liveSnap = await getDoc(liveDocRef);

        const currentTeacher = auth.currentUser?.email || 'Teacher';

        if (!liveSnap.exists()) {
            await setDoc(liveDocRef, {
                quizId: quizId,
                title: qData.title || quizTitle,
                subject: qData.subject || 'General',
                targetClass: resolvedTargetClass,
                status: 'waiting', // waiting | in_progress | ended
                durationMinutes: resolvedDuration,
                allowSubmit: false, // default OFF until teacher toggles ON
                createdAt: new Date().toISOString(),
                teacherEmail: currentTeacher
            });
        } else {
            // Re-open session into waiting lobby state
            const existingLive = liveSnap.data() || {};
            await updateDoc(liveDocRef, {
                status: 'waiting',
                title: qData.title || quizTitle,
                targetClass: resolvedTargetClass,
                durationMinutes: resolvedDuration,
                allowSubmit: (typeof existingLive.allowSubmit === 'boolean') ? existingLive.allowSubmit : false,
                startedAt: null,
                endsAt: null,
                reopenedAt: new Date().toISOString(),
                teacherEmail: currentTeacher
            });
        }

        // 3. Listen in real-time to the live session state
        liveQuizUnsubscribeSession = onSnapshot(liveDocRef, (docSnap) => {
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            activeLiveQuizSession.liveData = data;
            renderLiveQuizHeaderState(data);
        }, (err) => {
            console.error("Live session state snapshot error:", err);
        });

        // 4. Listen in real-time to participants subcollection: live_quizzes/{quizId}/participants
        const participantsRef = collection(db, "live_quizzes", quizId, "participants");
        liveQuizUnsubscribeParticipants = onSnapshot(participantsRef, (querySnap) => {
            updateParticipantsFromSnapshot(querySnap);
        }, (err) => {
            console.error("Live participants snapshot error:", err);
            const tbody = document.getElementById("liveParticipantsTbody");
            if (tbody) {
                tbody.innerHTML = `
                    <tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 24px;">
                        Unable to connect to participants feed: ${escapeHtml(err.message)}
                    </td></tr>
                `;
            }
        });

    } catch (err) {
        console.error("Error opening live quiz control room:", err);
        alert("Failed to initialize live quiz: " + err.message);
    }
};

function updateParticipantsFromSnapshot(querySnap) {
    liveParticipantsMap = {};
    let totalInfractions = 0;
    let totalConnected = 0;
    const allInfractions = [];

    querySnap.forEach(pDoc => {
        const p = { id: pDoc.id, ...pDoc.data() };
        liveParticipantsMap[pDoc.id] = p;
        if (p.connected !== false) totalConnected++;
        const warns = p.warnings || [];
        totalInfractions += warns.length;
        warns.forEach(w => {
            allInfractions.push({
                studentName: p.studentName || pDoc.id,
                studentClass: p.studentClass || '',
                ...w
            });
        });
    });

    const connEl = document.getElementById("liveStatConnectedCount");
    const infEl = document.getElementById("liveStatInfractionsCount");
    const countEl = document.getElementById("liveStudentCountLabel");
    if (connEl) connEl.innerText = totalConnected;
    if (infEl) infEl.innerText = totalInfractions;
    if (countEl) countEl.innerText = querySnap.size;

    renderLiveParticipantsTable();
    renderLiveAntiCheatLog(allInfractions);
}

async function refreshLiveParticipantsList() {
    if (!activeLiveQuizSession?.quizId) return;
    try {
        const participantsRef = collection(db, "live_quizzes", activeLiveQuizSession.quizId, "participants");
        const snap = await getDocs(participantsRef);
        updateParticipantsFromSnapshot(snap);
    } catch (e) {
        console.error("Manual refresh of participants failed:", e);
        alert("Refresh failed: " + e.message);
    }
}
window.refreshLiveParticipantsList = refreshLiveParticipantsList;

function closeLiveQuizModal() {
    const modal = document.getElementById("liveQuizControlModal");
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    if (liveQuizUnsubscribeSession) liveQuizUnsubscribeSession();
    if (liveQuizUnsubscribeParticipants) liveQuizUnsubscribeParticipants();
    if (liveQuizTimerInterval) clearInterval(liveQuizTimerInterval);
}
window.closeLiveQuizModal = closeLiveQuizModal;

function renderLiveQuizHeaderState(data) {
    const status = data.status || 'waiting';
    const statusBadge = document.getElementById("liveQuizStatusBadge");
    const startBtn = document.getElementById("btnStartLiveQuizMaster");
    const endBtn = document.getElementById("btnEndLiveQuizMaster");
    const durationInput = document.getElementById("liveQuizDurationInput");
    const timerDisplay = document.getElementById("liveQuizCountdownDisplay");

    if (durationInput && data.durationMinutes) {
        durationInput.value = data.durationMinutes;
    }

    if (liveQuizTimerInterval) clearInterval(liveQuizTimerInterval);

    if (status === 'waiting') {
        statusBadge.innerText = "Waiting for Students";
        statusBadge.style.background = "#e0f2fe";
        statusBadge.style.color = "#0284c7";
        startBtn.style.display = "inline-flex";
        startBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Start Live Quiz for All</span>`;
        startBtn.disabled = false;
        endBtn.style.display = "none";
        durationInput.disabled = false;
        timerDisplay.innerText = `${data.durationMinutes || 30}:00`;
    } else if (status === 'in_progress') {
        statusBadge.innerText = "Live In Progress";
        statusBadge.style.background = "#ecfdf5";
        statusBadge.style.color = "#059669";
        startBtn.style.display = "none";
        endBtn.style.display = "inline-flex";
        durationInput.disabled = true;

        // Run synchronized timer
        const endsAt = data.endsAt ? new Date(data.endsAt).getTime() : 0;
        const updateTimer = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((endsAt - now) / 1000));
            const mins = String(Math.floor(diff / 60)).padStart(2, '0');
            const secs = String(diff % 60).padStart(2, '0');
            timerDisplay.innerText = `${mins}:${secs}`;
            if (diff <= 0) {
                timerDisplay.innerText = "Time Expired";
                clearInterval(liveQuizTimerInterval);
            }
        };
        updateTimer();
        liveQuizTimerInterval = setInterval(updateTimer, 1000);

    } else if (status === 'ended') {
        statusBadge.innerText = "Quiz Ended";
        statusBadge.style.background = "#f1f5f9";
        statusBadge.style.color = "#64748b";
        startBtn.style.display = "inline-flex";
        startBtn.innerHTML = `<span>Restart / Re-open</span>`;
        startBtn.disabled = false;
        endBtn.style.display = "none";
        durationInput.disabled = false;
        timerDisplay.innerText = "00:00";
    }

    // Render Allow Submit toggle switch state
    const isAllowSubmit = data.allowSubmit === true;
    const toggleSubmit = document.getElementById("toggleLiveAllowSubmit");
    const labelSubmit = document.getElementById("labelLiveAllowSubmitStatus");
    const iconSubmit = document.getElementById("allowSubmitIcon");

    if (toggleSubmit) toggleSubmit.checked = isAllowSubmit;
    if (labelSubmit) {
        labelSubmit.innerText = isAllowSubmit ? "ON" : "OFF";
        labelSubmit.style.color = isAllowSubmit ? "#10b981" : "#ef4444";
    }
    if (iconSubmit) {
        iconSubmit.innerText = isAllowSubmit ? "🔓" : "🔒";
    }
}

async function handleToggleLiveAllowSubmit(isAllowed) {
    if (!activeLiveQuizSession?.quizId) return;
    try {
        const liveDocRef = doc(db, "live_quizzes", activeLiveQuizSession.quizId);
        await updateDoc(liveDocRef, {
            allowSubmit: Boolean(isAllowed),
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error("Failed to update allow submit toggle:", err);
        alert("Failed to update submission permission: " + err.message);
        const toggle = document.getElementById("toggleLiveAllowSubmit");
        if (toggle) toggle.checked = !isAllowed;
    }
}
window.handleToggleLiveAllowSubmit = handleToggleLiveAllowSubmit;

async function triggerStartLiveQuizMaster() {
    if (!activeLiveQuizSession?.quizId) return;
    const durationInput = document.getElementById("liveQuizDurationInput");
    const durationMinutes = parseInt(durationInput?.value, 10) || 30;

    if (!confirm(`Start the Live Quiz now for ${durationMinutes} minutes?\n\nAll connected students will immediately begin simultaneously.`)) {
        return;
    }

    try {
        const now = Date.now();
        const endsAt = new Date(now + durationMinutes * 60 * 1000).toISOString();

        await updateDoc(doc(db, "live_quizzes", activeLiveQuizSession.quizId), {
            status: 'in_progress',
            durationMinutes: durationMinutes,
            startedAt: new Date(now).toISOString(),
            endsAt: endsAt
        });
    } catch (err) {
        console.error("Error starting live quiz:", err);
        alert("Failed to start live quiz: " + err.message);
    }
}
window.triggerStartLiveQuizMaster = triggerStartLiveQuizMaster;

async function triggerEndLiveQuizMaster() {
    if (!activeLiveQuizSession?.quizId) return;
    if (!confirm("End the Live Quiz session now? All students' quizzes will lock.")) return;

    try {
        await updateDoc(doc(db, "live_quizzes", activeLiveQuizSession.quizId), {
            status: 'ended',
            endedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error("Error ending live quiz:", err);
        alert("Failed to end live quiz: " + err.message);
    }
}
window.triggerEndLiveQuizMaster = triggerEndLiveQuizMaster;

function renderLiveParticipantsTable() {
    const tbody = document.getElementById("liveParticipantsTbody");
    if (!tbody) return;

    const participants = Object.values(liveParticipantsMap);
    if (participants.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 36px;">
                Waiting for students to connect to this live quiz...
            </td></tr>
        `;
        return;
    }

    // Sort by infractions desc, then name
    participants.sort((a, b) => {
        const aWarns = (a.warnings || []).length;
        const bWarns = (b.warnings || []).length;
        if (bWarns !== aWarns) return bWarns - aWarns;
        return (a.studentName || '').localeCompare(b.studentName || '');
    });

    const totalQuestions = (activeLiveQuizSession.quizData?.items || activeLiveQuizSession.quizData?.questions || []).length || 1;

    tbody.innerHTML = participants.map(p => {
        const isOnline = p.connected !== false;
        const statusDot = isOnline 
            ? `<span style="display: inline-flex; align-items: center; gap: 6px; color: #059669; font-weight: 700; font-size: 12px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span> Online</span>`
            : `<span style="display: inline-flex; align-items: center; gap: 6px; color: #94a3b8; font-weight: 600; font-size: 12px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1;"></span> Offline</span>`;

        const answeredCount = Object.keys(p.answers || {}).length;
        const pct = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));

        const warns = (p.warnings || []).length;
        const antiCheatBadge = warns > 0
            ? `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: #fee2e2; color: #dc2626; font-weight: 700; font-size: 11.5px;">⚠️ ${warns} flag${warns === 1 ? '' : 's'}</span>`
            : `<span style="color: #059669; font-size: 12px; font-weight: 600;">✓ Clean</span>`;

        const safeCode = (p.studentCode || p.id || '').replace(/'/g, "\\'");

        return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 14px;">
                    <div style="font-weight: 700; color: #0f172a;">${escapeHtml(p.studentName || 'Student')}</div>
                    <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(p.studentClass || '-')} • ${escapeHtml(p.studentCode || p.id)}</div>
                </td>
                <td style="padding: 12px 14px;">${statusDot}</td>
                <td style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; min-width: 70px; height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: ${p.submitted ? '#10b981' : '#3b82f6'}; border-radius: 999px;"></div>
                        </div>
                        <span style="font-size: 11.5px; font-weight: 700; color: #475569;">${answeredCount}/${totalQuestions}</span>
                    </div>
                </td>
                <td style="padding: 12px 14px;">${antiCheatBadge}</td>
                <td style="padding: 12px 14px; text-align: right;">
                    <button type="button" onclick="inspectStudentLiveAnswers('${safeCode}')" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
                        Inspect
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderLiveAntiCheatLog(allInfractions) {
    const feed = document.getElementById("liveAntiCheatLog");
    if (!feed) return;

    if (!allInfractions || allInfractions.length === 0) {
        feed.innerHTML = `
            <div style="text-align: center; color: #991b1b; font-size: 12px; padding: 24px 10px; opacity: 0.8;">
                No suspicious behavior detected yet. Tab switches and window blurs will appear here instantly.
            </div>
        `;
        return;
    }

    // Sort newest infraction first
    allInfractions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    feed.innerHTML = allInfractions.map(inf => {
        const timeStr = inf.timestamp ? new Date(inf.timestamp).toLocaleTimeString() : '';
        return `
            <div style="background: #ffffff; border-left: 3px solid #ef4444; padding: 8px 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-size: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                    <strong style="color: #991b1b;">${escapeHtml(inf.studentName)}</strong>
                    <span style="color: #64748b; font-size: 11px;">${timeStr}</span>
                </div>
                <div style="color: #475569;">${escapeHtml(inf.details || inf.type || 'Switched tab or lost window focus')}</div>
            </div>
        `;
    }).join('');
}

function inspectStudentLiveAnswers(studentCode) {
    const p = liveParticipantsMap[studentCode];
    if (!p) return alert("Student not found in active session.");

    const modal = document.getElementById("liveQuizAnswersModal");
    if (!modal) return;

    const items = activeLiveQuizSession?.quizData?.items || activeLiveQuizSession?.quizData?.questions || [];
    const studentAnswers = p.answers || {};

    document.getElementById("liveAnswersStudentName").innerText = `${p.studentName || 'Student'} - Live Answers`;
    document.getElementById("liveAnswersStudentMeta").innerText = `Code: ${p.studentCode || studentCode} | Class: ${p.studentClass || '-'} | Answered: ${Object.keys(studentAnswers).length}/${items.length}`;

    const container = document.getElementById("liveAnswersContainer");
    if (items.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#64748b;">No questions in this quiz.</p>`;
    } else {
        container.innerHTML = items.map((item, idx) => {
            const ans = studentAnswers[idx];
            const hasAnswer = ans !== undefined && ans !== null && ans.value !== undefined && ans.value !== '';
            const ansVal = hasAnswer ? (ans.text || ans.value) : '<em style="color:#94a3b8;">No response yet</em>';

            return `
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: ${hasAnswer ? '#f8fafc' : '#ffffff'};">
                    <div style="font-weight: 700; color: #0f172a; font-size: 13.5px; margin-bottom: 6px;">
                        Q${idx + 1}: ${escapeHtml(item.prompt || item.question || item.text || 'Question')}
                    </div>
                    <div style="font-size: 12.5px; padding: 8px 12px; border-radius: 6px; background: #ffffff; border: 1px solid #cbd5e1; color: ${hasAnswer ? '#0f172a' : '#64748b'};">
                        <strong style="font-size: 11px; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Student Live Response:</strong>
                        ${hasAnswer ? escapeHtml(String(ansVal)) : ansVal}
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}
window.inspectStudentLiveAnswers = inspectStudentLiveAnswers;

function closeLiveAnswersModal() {
    const modal = document.getElementById("liveQuizAnswersModal");
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeLiveAnswersModal = closeLiveAnswersModal;

// 6. Delete Past Quiz (Clears quiz_results, exam_scores, and quizzes by title)
async function deletePastQuiz(quizTitle) {
    if (!quizTitle) return;
    const confirmed = confirm(`Are you sure you want to permanently delete the past quiz "${quizTitle}"?\n\nThis will permanently remove the quiz and ALL related student submissions, scores, and records from the database.`);
    if (!confirmed) return;

    try {
        let deletedCount = 0;
        const deletePromises = [];
        const normTitle = quizTitle.trim().toLowerCase();

        // 1. Delete matching submissions from quiz_results
        try {
            const resSnap = await getDocs(collection(db, "quiz_results"));
            resSnap.forEach(d => {
                const data = d.data();
                const rTitle = (data.quizTitle || '').trim().toLowerCase();
                if (rTitle === normTitle || data.quizTitle === quizTitle) {
                    deletedCount++;
                    deletePromises.push(deleteDoc(doc(db, "quiz_results", d.id)));
                }
            });
        } catch (e) {
            console.warn("Error querying quiz_results for past quiz deletion:", e);
        }

        // 2. Also check and delete from quizzes if document exists
        try {
            const qQuizzes = await getDocs(collection(db, "quizzes"));
            qQuizzes.forEach(d => {
                const data = d.data();
                const qTitle = (data.title || '').trim().toLowerCase();
                if (qTitle === normTitle || data.title === quizTitle) {
                    deletePromises.push(deleteDoc(doc(db, "quizzes", d.id)));
                }
            });
        } catch (e) {}

        // 3. Clean up exam_scores and scores
        try {
            const examSnap = await getDocs(collection(db, "exam_scores"));
            examSnap.forEach(d => {
                const data = d.data();
                const eName = (data.examName || data.title || '').trim().toLowerCase();
                if (eName === normTitle) {
                    deletePromises.push(deleteDoc(doc(db, "exam_scores", d.id)));
                }
            });
        } catch (e) {}

        try {
            const scoresSnap = await getDocs(collection(db, "scores"));
            scoresSnap.forEach(d => {
                const data = d.data();
                const sName = (data.examName || data.title || '').trim().toLowerCase();
                if (sName === normTitle) {
                    deletePromises.push(deleteDoc(doc(db, "scores", d.id)));
                }
            });
        } catch (e) {}

        await Promise.all(deletePromises);

        alert(`Successfully deleted "${quizTitle}" and all ${deletedCount} related student score record(s) from the database.`);
        refreshQuizzesTable(false);
    } catch (err) {
        console.error("Error deleting past quiz:", err);
        alert("Error deleting past quiz: " + err.message);
    }
}
window.deletePastQuiz = deletePastQuiz;

// ==========================================
// LIVE QUIZ LOBBIES MANAGER (MULTI-LOBBY CONTROL)
// ==========================================
let currentLobbyFilter = 'all'; // 'all' (active) or 'ended'
let cachedLobbiesList = [];
let lobbiesRealtimeUnsubscribe = null;

async function openLiveQuizLobbyManagerModal() {
    const modal = document.getElementById("liveQuizLobbyManagerModal");
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    currentLobbyFilter = 'all';
    updateLobbyFilterButtons();
    await loadActiveLiveQuizLobbiesList();
}
window.openLiveQuizLobbyManagerModal = openLiveQuizLobbyManagerModal;

function closeLiveQuizLobbyManagerModal() {
    const modal = document.getElementById("liveQuizLobbyManagerModal");
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
}
window.closeLiveQuizLobbyManagerModal = closeLiveQuizLobbyManagerModal;

function filterLobbiesList(filter) {
    currentLobbyFilter = filter;
    updateLobbyFilterButtons();
    renderLobbiesList(cachedLobbiesList);
}
window.filterLobbiesList = filterLobbiesList;

function updateLobbyFilterButtons() {
    const btnAll = document.getElementById("btnFilterLobbyAll");
    const btnEnded = document.getElementById("btnFilterLobbyEnded");
    if (btnAll && btnEnded) {
        if (currentLobbyFilter === 'all') {
            btnAll.style.background = '#4f46e5';
            btnAll.style.color = '#ffffff';
            btnAll.style.border = 'none';

            btnEnded.style.background = 'transparent';
            btnEnded.style.color = '#64748b';
            btnEnded.style.border = '1px solid #cbd5e1';
        } else {
            btnEnded.style.background = '#4f46e5';
            btnEnded.style.color = '#ffffff';
            btnEnded.style.border = 'none';

            btnAll.style.background = 'transparent';
            btnAll.style.color = '#64748b';
            btnAll.style.border = '1px solid #cbd5e1';
        }
    }
}

async function loadActiveLiveQuizLobbiesList() {
    const container = document.getElementById("activeLobbiesListContainer");
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 36px 20px; font-size: 13.5px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; margin-bottom: 8px;">
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                </svg>
                <div>Fetching live quiz sessions...</div>
            </div>
        `;
    }

    try {
        const snap = await getDocs(collection(db, "live_quizzes"));
        const lobbies = [];
        let activeCount = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const lobby = { id: docSnap.id, quizId: docSnap.id, ...data };
            lobbies.push(lobby);
            if (lobby.status === 'waiting' || lobby.status === 'in_progress') {
                activeCount++;
            }
        });

        // Sort newest first
        lobbies.sort((a, b) => {
            const tA = new Date(a.createdAt || 0).getTime();
            const tB = new Date(b.createdAt || 0).getTime();
            return tB - tA;
        });

        cachedLobbiesList = lobbies;
        updateActiveLobbiesBadge(activeCount);
        renderLobbiesList(cachedLobbiesList);
    } catch (err) {
        console.error("Error loading live quiz lobbies:", err);
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 30px;">
                    Failed to load lobbies: ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
}
window.loadActiveLiveQuizLobbiesList = loadActiveLiveQuizLobbiesList;

function updateActiveLobbiesBadge(count) {
    const badge = document.getElementById("activeLobbiesCounterBadge");
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderLobbiesList(lobbies) {
    const container = document.getElementById("activeLobbiesListContainer");
    if (!container) return;

    let filtered = [];
    if (currentLobbyFilter === 'all') {
        filtered = lobbies.filter(l => l.status === 'waiting' || l.status === 'in_progress');
    } else {
        filtered = lobbies.filter(l => l.status === 'ended');
    }

    if (filtered.length === 0) {
        if (currentLobbyFilter === 'all') {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px 20px; background: var(--bg-hover, #f8fafc); border-radius: 16px; border: 1.5px dashed #cbd5e1;">
                    <div style="font-size: 36px; margin-bottom: 10px;">🏛️</div>
                    <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: var(--text-dark, #0f172a);">No Active Live Quizzes Right Now</h3>
                    <p style="margin: 0 0 16px 0; font-size: 13px; color: var(--text-gray, #64748b); max-width: 440px; margin-inline: auto;">
                        Start a live quiz to create an active waiting room. You can run multiple live quizzes across different classes at the same time.
                    </p>
                    <button type="button" onclick="closeLiveQuizLobbyManagerModal(); openStartLiveQuizModal();"
                        style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; border: none; padding: 10px 22px; border-radius: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Start a Live Quiz Lobby</span>
                    </button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #64748b; font-size: 13.5px;">
                    No past/ended live quizzes found.
                </div>
            `;
        }
        return;
    }

    container.innerHTML = filtered.map(l => {
        const isActive = l.status === 'waiting' || l.status === 'in_progress';
        let statusBadge = '';
        if (l.status === 'waiting') {
            statusBadge = `<span class="lobby-badge-waiting"><span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; animation: pulse 1.5s infinite;"></span> Waiting Room</span>`;
        } else if (l.status === 'in_progress') {
            statusBadge = `<span class="lobby-badge-progress"><span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></span> Live In Progress</span>`;
        } else {
            statusBadge = `<span class="lobby-badge-ended">Ended</span>`;
        }

        const dateStr = l.createdAt ? new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const safeTitle = escapeHtml(l.title || 'Live Quiz');
        const safeTarget = escapeHtml(l.targetClass || 'All Classes');
        const safeSubject = escapeHtml(l.subject || 'General');

        return `
            <div class="lobby-card ${isActive ? 'is-active-card' : ''}">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
                        <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--text-dark, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${safeTitle}
                        </h4>
                        ${statusBadge}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--text-gray, #64748b);">
                        <span style="background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 6px; font-weight: 700; border: 1px solid #dbeafe;">
                            📘 ${safeSubject}
                        </span>
                        <span style="background: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 6px; font-weight: 700; border: 1px solid #e2e8f0;">
                            🎯 Target: ${safeTarget}
                        </span>
                        <span style="background: #f8fafc; color: #475569; padding: 2px 8px; border-radius: 6px; font-weight: 600; border: 1px solid #e2e8f0;">
                            ⏱️ ${l.durationMinutes || 30} min
                        </span>
                        <span style="background: ${l.allowSubmit ? '#ecfdf5' : '#fef2f2'}; color: ${l.allowSubmit ? '#059669' : '#dc2626'}; padding: 2px 8px; border-radius: 6px; font-weight: 700; border: 1px solid ${l.allowSubmit ? '#a7f3d0' : '#fecaca'};">
                            ${l.allowSubmit ? '🔓 Submit Allowed' : '🔒 Submit Locked'}
                        </span>
                        ${dateStr ? `<span>• Started at ${dateStr}</span>` : ''}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap;">
                    <button type="button" class="btn-visit-lobby" onclick="visitSpecificLiveLobby('${escapeHtml(l.quizId)}', '${safeTitle.replace(/'/g, "\\'")}', '${safeTarget.replace(/'/g, "\\'")}', ${l.durationMinutes || 30})">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        <span>Visit Lobby</span>
                    </button>
                    ${isActive ? `
                        <button type="button" class="btn-turnoff-lobby" onclick="turnOffSpecificLiveLobby('${escapeHtml(l.quizId)}', '${safeTitle.replace(/'/g, "\\'")}')">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                            </svg>
                            <span>Turn Off Lobby</span>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function visitSpecificLiveLobby(quizId, quizTitle, targetClass, durationMinutes) {
    closeLiveQuizLobbyManagerModal();
    openLiveQuizMaster(quizId, quizTitle, targetClass, durationMinutes);
}
window.visitSpecificLiveLobby = visitSpecificLiveLobby;

async function turnOffSpecificLiveLobby(quizId, quizTitle) {
    if (!confirm(`Turn off the live lobby for "${quizTitle}"?\n\nStudents in this lobby will be stopped.`)) {
        return;
    }

    try {
        await updateDoc(doc(db, "live_quizzes", quizId), {
            status: 'ended',
            endedAt: new Date().toISOString()
        });

        if (activeLiveQuizSession && activeLiveQuizSession.quizId === quizId) {
            activeLiveQuizSession.status = 'ended';
        }

        await loadActiveLiveQuizLobbiesList();
    } catch (err) {
        console.error("Error turning off live quiz lobby:", err);
        alert("Failed to turn off lobby: " + err.message);
    }
}
window.turnOffSpecificLiveLobby = turnOffSpecificLiveLobby;

function setupLobbiesRealtimeListener() {
    if (lobbiesRealtimeUnsubscribe) return;
    try {
        lobbiesRealtimeUnsubscribe = onSnapshot(collection(db, "live_quizzes"), (snapshot) => {
            const lobbies = [];
            let activeCount = 0;

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const lobby = { id: docSnap.id, quizId: docSnap.id, ...data };
                lobbies.push(lobby);
                if (lobby.status === 'waiting' || lobby.status === 'in_progress') {
                    activeCount++;
                }
            });

            lobbies.sort((a, b) => {
                const tA = new Date(a.createdAt || 0).getTime();
                const tB = new Date(b.createdAt || 0).getTime();
                return tB - tA;
            });

            cachedLobbiesList = lobbies;
            updateActiveLobbiesBadge(activeCount);

            const modal = document.getElementById("liveQuizLobbyManagerModal");
            if (modal && modal.style.display === 'flex') {
                renderLobbiesList(cachedLobbiesList);
            }
        }, (err) => {
            console.warn("Lobbies real-time listener error:", err);
        });
    } catch (e) {
        console.warn("Could not attach lobbies listener:", e);
    }
}

// Module Exports
export {
    openStartLiveQuizModal,
    closeStartLiveQuizModal,
    handleLiveQuizSelectionChange,
    confirmCreateLiveQuizLobby,
    openLiveQuizMaster,
    refreshLiveParticipantsList,
    closeLiveQuizModal,
    triggerStartLiveQuizMaster,
    triggerEndLiveQuizMaster,
    inspectStudentLiveAnswers,
    closeLiveAnswersModal,
    deletePastQuiz,
    openLiveQuizLobbyManagerModal,
    closeLiveQuizLobbyManagerModal,
    filterLobbiesList,
    visitSpecificLiveLobby,
    turnOffSpecificLiveLobby,
    loadActiveLiveQuizLobbiesList
};

