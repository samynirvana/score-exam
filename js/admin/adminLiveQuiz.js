// Live Quiz Command Center, Real-Time Monitoring & Past Quiz Cleanup
// Modular component extracted from admin.js

import { collection, getDocs, doc, deleteDoc, updateDoc, getDoc, setDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../../firebase.js";
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
}

// ==========================================
// LIVE QUIZ COMMAND CENTER & MONITORING
// ==========================================
let activeLiveQuizSession = null;
let liveQuizUnsubscribeSession = null;
let liveQuizUnsubscribeParticipants = null;
let liveQuizTimerInterval = null;
let liveParticipantsMap = {};

async function openLiveQuizMaster(quizId, quizTitle) {
    const modal = document.getElementById("liveQuizControlModal");
    if (!modal) return;

    // Reset previous listeners
    if (liveQuizUnsubscribeSession) liveQuizUnsubscribeSession();
    if (liveQuizUnsubscribeParticipants) liveQuizUnsubscribeParticipants();
    if (liveQuizTimerInterval) clearInterval(liveQuizTimerInterval);

    liveParticipantsMap = {};
    activeLiveQuizSession = { quizId, quizTitle };
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
            cachedQuizzesList = null;
            refreshQuizzesTable(true);
        }

        const itemsCount = (qData.items || qData.questions || []).length;
        document.getElementById("liveQuizModalMeta").innerText = `Target: ${qData.targetClass || 'All Classes'} | Subject: ${qData.subject || 'General'} | ${itemsCount} Questions`;

        // 2. Initialize or fetch live session document in Firestore: live_quizzes/{quizId}
        const liveDocRef = doc(db, "live_quizzes", quizId);
        const liveSnap = await getDoc(liveDocRef);

        if (!liveSnap.exists()) {
            await setDoc(liveDocRef, {
                quizId: quizId,
                title: qData.title || quizTitle,
                subject: qData.subject || 'General',
                targetClass: qData.targetClass || 'All',
                status: 'waiting', // waiting | in_progress | ended
                durationMinutes: 30,
                createdAt: new Date().toISOString(),
                teacherEmail: auth.currentUser?.email || 'teacher'
            });
        } else if (liveSnap.data()?.status === 'ended') {
            // Re-open session into waiting lobby state
            await updateDoc(liveDocRef, {
                status: 'waiting',
                startedAt: null,
                endsAt: null,
                reopenedAt: new Date().toISOString()
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
}

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

// Module Exports
export {
    openLiveQuizMaster,
    refreshLiveParticipantsList,
    closeLiveQuizModal,
    triggerStartLiveQuizMaster,
    triggerEndLiveQuizMaster,
    inspectStudentLiveAnswers,
    closeLiveAnswersModal,
    deletePastQuiz
};
