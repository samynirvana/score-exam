import { doc, getDoc, getDocs, collection, addDoc, deleteDoc, updateDoc, setDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeHtml, triggerCelebration, attachRippleEffect } from "./utils.js";

let currentStudent = null;
let activeQuiz = null;
let availableQuizzesMap = {};
let recentQuizResults = [];
let currentReviewedQuiz = null;

// --- THEME TOGGLE SYSTEM ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const savedTheme = localStorage.getItem('appTheme') || 'light';

function applyQuizTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    document.body.classList.toggle('dark-mode', isDark);
    document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.setProperty('display', isDark ? 'inline-block' : 'none', 'important'));
    document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.setProperty('display', isDark ? 'none' : 'inline-block', 'important'));
}

applyQuizTheme(savedTheme);

themeToggleBtn?.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'dark' : 'light';
    localStorage.setItem('appTheme', newTheme);
    localStorage.setItem('theme', newTheme);
    applyQuizTheme(newTheme);
});

document.getElementById('studentLogoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('portalSessionMeta'); localStorage.removeItem('portalRememberedStudent'); sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    window.location.href = 'index.html';
});

// --- HELPER: RESOLVE SUBJECT ---
function resolveSubject(rawSubject, title) {
    const s = (rawSubject || '').toString().trim();
    if (s && s.toLowerCase() !== 'general' && s.toLowerCase() !== 'n/a' && s.toLowerCase() !== 'unknown') {
        return s;
    }
    const t = (title || '').toLowerCase();
    if (t.includes('ict') || t.includes('computer') || t.includes('tech') || t.includes('code') || t.includes('python')) return 'ICT';
    if (t.includes('math') || t.includes('algebra') || t.includes('calc')) return 'Mathematics';
    if (t.includes('bio') || t.includes('science') || t.includes('chem') || t.includes('physic')) return 'Science';
    if (t.includes('eng') || t.includes('read') || t.includes('gram') || t.includes('vocab')) return 'English';
    return 'General';
}

function getSubjectClass(subject) {
    const s = (subject || '').toLowerCase();
    if (s.includes('math')) return 'math';
    if (s.includes('sci') || s.includes('bio') || s.includes('chem')) return 'science';
    if (s.includes('eng')) return 'english';
    if (s.includes('ict') || s.includes('comp')) return 'ict';
    return 'general';
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Recently';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) + ' • ' + d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Recently';
    }
}

// --- INITIALIZE ON PAGE LOAD ---
window.addEventListener('DOMContentLoaded', async () => {
    const savedLoggedIn = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
    let code = '';

    if (savedLoggedIn) {
        try {
            const session = JSON.parse(savedLoggedIn);
            code = (session.code || session.studentCode || session.id || '').trim().toUpperCase();
        } catch (e) {
            console.error("Session parse error:", e);
        }
    }

    if (!code) {
        code = (localStorage.getItem('loggedInStudentCode') || '').trim().toUpperCase();
    }

    // Students must be logged in to access quizzes and can only take quizzes for themselves
    if (!code) {
        window.location.href = "index.html";
        return;
    }

    await initStudentQuizDashboard(code);
});

// --- HELPER FUNCTIONS FOR STUDENT PROFILE ---
// Convert Google Drive share link to high-res direct embed URL
function resolvePhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('https://lh3.googleusercontent.com/d/') || trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    const driveMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    return trimmed;
}

// Extract student nickname (checks nickname field or uses first name)
function getStudentNickname(studentObj) {
    if (!studentObj) return 'Student';
    const explicit = (studentObj.nickname || studentObj.nickName || studentObj.shortName || '').trim();
    if (explicit) return explicit;

    const full = (studentObj.studentName || studentObj.name || '').trim();
    if (!full) return 'Student';
    if (full.toLowerCase() === 'administrator') return 'Administrator';
    const parts = full.split(/\s+/);
    return parts[0] || full;
}

// --- INIT STUDENT DASHBOARD ---
async function initStudentQuizDashboard(code) {
    try {
        const snap = await getDoc(doc(db, "students", code));
        if (!snap.exists()) {
            console.warn(`Student Code "${code}" not found.`);
            window.location.href = "index.html";
            return;
        }

        const data = snap.data() || {};
        const normalizedCode = String(code || data.studentCode || data.code || '').trim().toUpperCase();
        currentStudent = { 
            ...data,
            code: normalizedCode,
            studentCode: normalizedCode,
            studentName: data.studentName || data.name || 'Student',
            studentClass: data.studentClass || data.class || 'Unassigned'
        };

        // Check sessionStorage cache for photo if not in current doc
        let cachedPhoto = '';
        const rawSession = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
        if (rawSession) {
            try {
                const sess = JSON.parse(rawSession);
                cachedPhoto = sess.photoUrl || sess.photo || sess.avatar || '';
            } catch (e) { }
        }

        // Render Student Identity Banner with nickname only
        const studentName = currentStudent.studentName || currentStudent.name || 'Student';
        const nickname = getStudentNickname(currentStudent);
        const studentClass = currentStudent.studentClass || currentStudent.class || 'Unassigned';
        const initial = (nickname || studentName).charAt(0).toUpperCase() || 'S';

        // Synchronize photo with database
        const rawPhoto = currentStudent.photoUrl || currentStudent.photo || currentStudent.avatar || cachedPhoto || '';
        const photoUrl = resolvePhotoUrl(rawPhoto);

        const dashPhoto = document.getElementById('dashStudentPhoto');
        const dashInitial = document.getElementById('dashStudentInitial');

        if (photoUrl && dashPhoto) {
            dashPhoto.src = photoUrl;
            dashPhoto.classList.remove('hidden');
            if (dashInitial) dashInitial.classList.add('hidden');
            dashPhoto.onerror = () => {
                dashPhoto.classList.add('hidden');
                if (dashInitial) {
                    dashInitial.innerText = initial;
                    dashInitial.classList.remove('hidden');
                }
            };
        } else {
            if (dashPhoto) dashPhoto.classList.add('hidden');
            if (dashInitial) {
                dashInitial.innerText = initial;
                dashInitial.classList.remove('hidden');
            }
        }

        // Set nickname in greeting
        const dashName = document.getElementById('dashStudentName');
        if (dashName) dashName.innerText = nickname;

        const modalClass = document.getElementById('modalStudentClass');
        if (modalClass) modalClass.innerText = studentClass;

        // Display dashboard
        document.getElementById('quizDashboardSection')?.classList.remove('hidden');
        document.getElementById('takeQuizSection')?.classList.add('hidden');
        document.getElementById('resultSection')?.classList.add('hidden');

        // Sequentially load recent quizzes first so recentQuizResults is ready for completion checks
        await loadRecentQuizzes(code);
        await loadAvailableQuizzes(studentClass);
        setupLiveQuizLobbyListener(studentClass);

    } catch (err) {
        console.error("Dashboard initialization error:", err);
    }
}

// --- LOAD RECENT QUIZZES (ONLINE QUIZZES CREATED ON WEBSITE ONLY) ---
async function loadRecentQuizzes(studentCode) {
    const container = document.getElementById('recentQuizzesContainer');
    const badge = document.getElementById('recentQuizCountBadge');
    if (!container) return;

    container.innerHTML = `
        <div class="quiz-empty-box">
            <div class="quiz-empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
            </div>
            <p style="margin:0; font-size:14px; font-weight:600; color:var(--text-gray);">Loading your recent online quizzes...</p>
        </div>
    `;

    try {
        const resultsMap = new Map();

        // Query only online quiz results submitted via the website (quiz_results collection)
        // Does NOT query exam_scores (offline or classroom exams)
        try {
            const qSnap = await getDocs(query(collection(db, "quiz_results"), where("studentCode", "==", studentCode)));
            qSnap.forEach(docSnap => {
                const d = docSnap.data();
                const key = (d.quizId || d.quizTitle || docSnap.id).trim().toLowerCase();
                resultsMap.set(key, {
                    id: docSnap.id,
                    quizId: d.quizId || null,
                    quizTitle: d.quizTitle || "Online Quiz",
                    subject: resolveSubject(d.subject, d.quizTitle),
                    score: d.score !== undefined ? d.score : 0,
                    totalAutoGradable: d.totalAutoGradable || d.totalPoints || 0,
                    responses: d.responses || [],
                    submittedAt: d.submittedAt || null,
                    source: 'quiz_results'
                });
            });
        } catch (e) {
            console.warn("quiz_results query error:", e);
        }

        recentQuizResults = Array.from(resultsMap.values());

        // Sort chronologically descending (newest first)
        recentQuizResults.sort((a, b) => {
            const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
            return tB - tA;
        });

        if (badge) badge.innerText = recentQuizResults.length;

        if (recentQuizResults.length === 0) {
            container.innerHTML = `
                <div class="quiz-empty-box">
                    <div class="quiz-empty-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                    <h4 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--text-dark);">No Quizzes Completed Yet</h4>
                    <p style="margin: 0; font-size: 13px; color: var(--text-gray); max-width: 400px; line-height: 1.5;">
                        You haven't completed any online quizzes so far. Click the <strong>Start Quiz</strong> button below to take your first test!
                    </p>
                </div>
            `;
            return;
        }

        // Render Recent Quiz Cards
        container.innerHTML = "";
        recentQuizResults.forEach((quiz, idx) => {
            const card = document.createElement('div');
            card.className = 'recent-quiz-card';

            const subClass = getSubjectClass(quiz.subject);
            const total = quiz.totalAutoGradable || 10;
            const scoreNum = parseFloat(quiz.score) || 0;
            const percentage = total > 0 ? Math.round((scoreNum / total) * 100) : scoreNum;

            let scoreClass = 'score-good';
            if (percentage < 60) scoreClass = 'score-low';
            else if (percentage < 80) scoreClass = 'score-medium';

            const hasResponses = quiz.responses && quiz.responses.length > 0;

            card.innerHTML = `
                <div class="recent-quiz-info">
                    <div class="recent-quiz-header-row">
                        <span class="subject-badge ${subClass}">${escapeHtml(quiz.subject)}</span>
                        <span class="recent-quiz-date">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${formatDateDisplay(quiz.submittedAt)}
                        </span>
                    </div>
                    <h3 class="recent-quiz-title">${escapeHtml(quiz.quizTitle)}</h3>
                </div>

                <div class="recent-quiz-stats">
                    <div class="recent-quiz-score-pill">
                        <div class="score-number-highlight ${scoreClass}">
                            ${scoreNum} <span style="font-size: 13px; font-weight: 600; opacity: 0.7;">/ ${total}</span>
                        </div>
                        <span class="score-percentage-label">${percentage}% Score</span>
                    </div>

                    <div>
                        ${hasResponses ? `
                            <button class="review-quiz-btn" data-index="${idx}" title="Review your quiz answers">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <span>Review</span>
                            </button>
                        ` : `
                            <span style="font-size: 11.5px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 8px;">
                                ✓ Recorded
                            </span>
                        `}
                    </div>
                </div>
            `;

            container.appendChild(card);
        });

        // Attach review button listeners
        container.querySelectorAll('.review-quiz-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                openQuizReviewModal(recentQuizResults[idx]);
            });
        });

    } catch (err) {
        console.error("Error loading recent quizzes:", err);
        container.innerHTML = `
            <div class="quiz-empty-box">
                <p style="margin:0; font-size:14px; color:#ef4444;">Failed to load recent quizzes. Please check your connection.</p>
            </div>
        `;
    }
}

// --- REVIEW MODAL HANDLER ---
function openQuizReviewModal(resultItem) {
    if (!resultItem) return;
    currentReviewedQuiz = resultItem;

    const modal = document.getElementById('quizReviewModal');
    const titleEl = document.getElementById('reviewQuizTitle');
    const badgeEl = document.getElementById('reviewScoreBadge');
    const listEl = document.getElementById('quizReviewQuestionsList');

    if (!modal || !listEl) return;

    if (titleEl) titleEl.innerText = resultItem.quizTitle || 'Quiz Review';
    if (badgeEl) {
        const total = resultItem.totalAutoGradable || (resultItem.responses ? resultItem.responses.length : 10);
        badgeEl.innerText = `Score: ${resultItem.score} / ${total}`;
    }

    listEl.innerHTML = '';
    const responses = resultItem.responses || [];

    if (responses.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-gray); padding: 20px;">Detailed question responses are not available for this record.</p>';
    } else {
        responses.forEach((resp, qIdx) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'review-question-item';

            let statusTag = '';
            if (resp.isEssay) {
                statusTag = `<span class="review-status-tag review-status-essay">✎ Written Response</span>`;
            } else if (resp.isCorrect) {
                statusTag = `<span class="review-status-tag review-status-correct">✓ Correct (+1)</span>`;
            } else {
                statusTag = `<span class="review-status-tag review-status-incorrect">✗ Incorrect</span>`;
            }

            itemDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span style="font-size: 13px; font-weight: 800; color: var(--primary-blue);">Question ${qIdx + 1}</span>
                    ${statusTag}
                </div>
                <div style="font-size: 14.5px; font-weight: 600; color: var(--text-dark); line-height: 1.5;">${escapeHtml(resp.prompt || '')}</div>
                <div style="font-size: 13.5px; margin-top: 4px; padding: 10px 12px; border-radius: 8px; background: rgba(15, 23, 42, 0.03); border: 1px solid var(--border-color);">
                    <span style="font-weight: 700; color: var(--text-gray);">Your Answer:</span>
                    <span style="font-weight: 600; color: ${resp.isCorrect ? '#10b981' : (resp.isEssay ? 'var(--text-dark)' : '#ef4444')}; margin-left: 6px;">
                        ${escapeHtml(resp.response || 'No answer')}
                    </span>
                </div>
                ${(!resp.isCorrect && !resp.isEssay && resp.expected) ? `
                    <div style="font-size: 12.5px; color: #10b981; font-weight: 600; padding: 4px 6px;">
                        Expected Answer: ${escapeHtml(resp.expected)}
                    </div>
                ` : ''}
            `;
            listEl.appendChild(itemDiv);
        });
    }

    modal.classList.remove('hidden');
}


// Close Review Modal Handlers
document.getElementById('closeReviewModalIconBtn')?.addEventListener('click', () => {
    document.getElementById('quizReviewModal')?.classList.add('hidden');
});
document.getElementById('closeReviewModalBtn')?.addEventListener('click', () => {
    document.getElementById('quizReviewModal')?.classList.add('hidden');
});
document.getElementById('quizReviewModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'quizReviewModal') {
        document.getElementById('quizReviewModal')?.classList.add('hidden');
    }
});

// Check if a student has already completed a specific quiz
function isQuizAlreadyCompleted(quiz) {
    if (!quiz || !Array.isArray(recentQuizResults) || recentQuizResults.length === 0) return false;
    const targetTitle = (quiz.title || '').trim().toLowerCase();
    const targetId = quiz.id ? String(quiz.id).trim() : '';

    return recentQuizResults.some(r => {
        if (targetId && r.quizId && String(r.quizId).trim() === targetId) return true;
        if (targetTitle && (r.quizTitle || '').trim().toLowerCase() === targetTitle) return true;
        return false;
    });
}

// --- LOAD AVAILABLE QUIZZES FOR CLASS ---
async function loadAvailableQuizzes(studentClass) {
    const listContainer = document.getElementById('availableQuizzesList');
    const ctaCount = document.getElementById('ctaAvailableQuizzesCount');
    if (!listContainer) return;

    availableQuizzesMap = {};

    try {
        const snap = await getDocs(collection(db, "quizzes"));
        let count = 0;
        const normalizedStudentClass = (studentClass || '').toLowerCase().trim();

        snap.forEach(docSnap => {
            const q = docSnap.data();
            const status = (q.status || 'active').toLowerCase().trim();

            if (status !== 'active') return;

            const targetClass = (q.targetClass || '').toLowerCase().trim();
            const targetClassesList = Array.isArray(q.targetClassesList) ? q.targetClassesList.map(c => c.toLowerCase().trim()) : [];

            // Quizzes marked as "No Classes" / "none" are reserved for live sessions only and must not show in any class list
            if (targetClass === 'no classes' || targetClass === 'none' || 
                targetClassesList.includes('no classes') || targetClassesList.includes('none')) {
                return;
            }

            const isMatch = targetClass === 'all' || 
                            targetClass === 'all classes' || 
                            targetClass === normalizedStudentClass ||
                            targetClassesList.includes('all') ||
                            targetClassesList.includes('all classes') ||
                            targetClassesList.includes(normalizedStudentClass) ||
                            targetClass.split(',').map(s => s.trim()).includes(normalizedStudentClass);

            if (isMatch) {
                const quizObj = { id: docSnap.id, ...q };
                availableQuizzesMap[docSnap.id] = quizObj;
                count++;
            }
        });

        // Calculate pending (not completed) vs completed quizzes
        const quizList = Object.values(availableQuizzesMap);
        const pendingQuizzes = quizList.filter(q => !isQuizAlreadyCompleted(q));
        const pendingCount = pendingQuizzes.length;
        const totalCount = quizList.length;

        if (ctaCount) {
            if (totalCount === 0) {
                ctaCount.innerText = "0 Quizzes Available";
            } else if (pendingCount === 0) {
                ctaCount.innerText = "All Quizzes Completed";
            } else {
                ctaCount.innerText = `${pendingCount} Active Quiz${pendingCount === 1 ? '' : 'zes'} Available`;
            }
        }

        const ctaCard = document.getElementById('startQuizCtaCard');
        if (ctaCard) {
            const headingEl = ctaCard.querySelector('.cta-heading');
            const btnEl = ctaCard.querySelector('.start-quiz-big-btn span');
            if (headingEl) {
                if (totalCount > 0 && pendingCount === 0) {
                    headingEl.innerText = "You're All Caught Up!";
                    if (btnEl) btnEl.innerText = "View Quizzes";
                } else if (totalCount === 0) {
                    headingEl.innerText = "No Quizzes Available";
                    if (btnEl) btnEl.innerText = "Check Quizzes";
                } else {
                    headingEl.innerText = "Ready for a Quiz?";
                    if (btnEl) btnEl.innerText = "Start Quiz";
                }
            }
        }

        // Render Cards inside the Available Quizzes Modal
        if (quizList.length === 0) {
            listContainer.innerHTML = `
                <div class="quiz-empty-box" style="padding: 30px 16px;">
                    <div class="quiz-empty-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 10"></polyline></svg>
                    </div>
                    <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-dark);">No Quizzes Available</h4>
                    <p style="margin:0; font-size:13px; color:var(--text-gray);">There are currently no active quizzes assigned for class "${escapeHtml(studentClass)}". Please check back soon!</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        quizList.forEach(quiz => {
            const card = document.createElement('div');
            const isCompleted = isQuizAlreadyCompleted(quiz);

            card.className = 'available-quiz-card' + (isCompleted ? ' is-completed' : '');
            card.setAttribute('data-id', quiz.id);

            const resolvedSub = resolveSubject(quiz.subject, quiz.title);
            const subClass = getSubjectClass(resolvedSub);
            const questions = quiz.items || quiz.questions || [];
            const qCount = questions.length;

            // Types preview
            const typesSet = new Set();
            questions.forEach(q => {
                if (q.type === 'mcq' || (!q.type && q.question)) typesSet.add('Multiple Choice');
                else if (q.type === 'fill') typesSet.add('Fill in Blank');
                else if (q.type === 'essay') typesSet.add('Essay');
                else if (q.type === 'matching') typesSet.add('Matching');
            });
            const typesText = typesSet.size > 0 ? Array.from(typesSet).slice(0, 2).join(' • ') : 'Standard Assessment';

            card.innerHTML = `
                <div class="avail-quiz-info">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span class="subject-badge ${subClass}">${escapeHtml(resolvedSub)}</span>
                        ${isCompleted ? `
                            <span style="font-size: 11.5px; font-weight: 700; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Completed
                            </span>
                        ` : `
                            <span style="font-size: 12px; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 2px 7px; border-radius: 5px;">Active</span>
                        `}
                    </div>
                    <h3 class="avail-quiz-title">${escapeHtml(quiz.title || 'Untitled Quiz')}</h3>
                    <div class="avail-quiz-meta">
                        <span>📝 ${qCount} Questions</span>
                        <span>•</span>
                        <span>${escapeHtml(typesText)}</span>
                    </div>
                    ${isCompleted ? `
                        <div class="completed-quiz-notice">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            <span>You've already did the quiz</span>
                        </div>
                    ` : ''}
                </div>

                ${isCompleted ? `
                    <button class="take-quiz-arrow-btn completed-btn" disabled title="You have already completed this quiz">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Done</span>
                    </button>
                ` : `
                    <button class="take-quiz-arrow-btn">
                        <span>Start</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                        </svg>
                    </button>
                `}
            `;

            // Click card to start quiz only if not completed
            card.addEventListener('click', (e) => {
                if (isCompleted) {
                    e.preventDefault();
                    e.stopPropagation();
                    alert("You've already did the quiz. Each quiz can only be completed once.");
                    return;
                }
                startQuizById(quiz.id);
            });

            listContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading available quizzes:", err);
        listContainer.innerHTML = '<p style="color:#ef4444; padding:20px; text-align:center;">Failed to load available quizzes.</p>';
    }
}

// --- OPEN AVAILABLE QUIZZES POP-UP MODAL ---
document.getElementById('openAvailableQuizzesBtn')?.addEventListener('click', () => {
    document.getElementById('studentQuizModal')?.classList.remove('hidden');
});

// Close Modal Handlers
document.getElementById('closeModalIconBtn')?.addEventListener('click', () => {
    document.getElementById('studentQuizModal')?.classList.add('hidden');
});
document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('studentQuizModal')?.classList.add('hidden');
});
document.getElementById('studentQuizModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'studentQuizModal') {
        document.getElementById('studentQuizModal')?.classList.add('hidden');
    }
});

// ==========================================
// LIVE QUIZ STUDENT ENGINE & ANTI-CHEAT
// ==========================================
let activeLiveSessionUnsubscribe = null;
let activeLiveQuizData = null;
let liveStudentAnswers = {};
let liveAnswerSyncTimeout = null;
let liveWarningCount = 0;
let liveStudentTimerInterval = null;
let livePresenceInterval = null;
let activeLiveParticipantsUnsubscribe = null;
let isForcedSubmit = false;

let liveQuizLobbyUnsubscribe = null;

function isClassEligibleForLive(targetClassStr, studentClassStr) {
    if (!targetClassStr) return true;
    const target = targetClassStr.trim().toLowerCase();
    if (target === 'all' || target === 'all classes' || target === '') return true;
    if (!studentClassStr) return false;
    const student = studentClassStr.trim().toLowerCase();
    if (target === student) return true;

    // Check comma-separated lists (e.g. "Primary 1, Primary 2")
    const parts = target.split(',').map(s => s.trim().toLowerCase());
    return parts.includes(student) || parts.includes('all') || parts.includes('all classes');
}

function setupLiveQuizLobbyListener(studentClass) {
    if (liveQuizLobbyUnsubscribe) {
        liveQuizLobbyUnsubscribe();
        liveQuizLobbyUnsubscribe = null;
    }

    const bannerContainer = document.getElementById('liveLobbyBannerSection');
    if (!bannerContainer) return;

    // Listen to collection live_quizzes in real-time
    liveQuizLobbyUnsubscribe = onSnapshot(collection(db, "live_quizzes"), (snapshot) => {
        let activeLobby = null;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const status = (data.status || '').toLowerCase().trim();

            if (status === 'waiting' || status === 'in_progress') {
                if (isClassEligibleForLive(data.targetClass, studentClass)) {
                    activeLobby = { quizId: docSnap.id, ...data };
                }
            }
        });

        if (activeLobby) {
            renderLiveLobbyBanner(activeLobby);
        } else {
            bannerContainer.innerHTML = '';
            bannerContainer.classList.add('hidden');
        }
    }, (err) => {
        console.warn("Live lobby real-time listener error:", err);
    });
}

function renderLiveLobbyBanner(liveQuiz) {
    const bannerContainer = document.getElementById('liveLobbyBannerSection');
    if (!bannerContainer) return;

    const isWaiting = (liveQuiz.status === 'waiting');
    const statusText = isWaiting ? 'LIVE QUIZ LOBBY OPEN' : 'LIVE ASSESSMENT IN PROGRESS';
    const statusBadgeBg = isWaiting ? '#ef4444' : '#10b981';
    const btnText = isWaiting ? 'Join Live Quiz Lobby' : 'Enter Live Quiz Now';
    const btnBg = isWaiting
        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    const subText = isWaiting
        ? 'Your teacher has created the live lobby! Click below to enter the waiting room before the test begins.'
        : 'The live quiz is currently in progress! Enter immediately to submit your answers before time runs out.';

    bannerContainer.innerHTML = `
        <div class="live-lobby-hero-card" style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%); border: 1.5px solid rgba(139, 92, 246, 0.45); border-radius: 20px; padding: 22px 26px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 18px; box-shadow: 0 12px 32px rgba(49, 46, 129, 0.35); position: relative; overflow: hidden;">
            <div style="position: absolute; top: -40px; right: -40px; width: 140px; height: 140px; background: rgba(168, 85, 247, 0.25); filter: blur(40px); border-radius: 50%; pointer-events: none;"></div>
            
            <div style="display: flex; align-items: center; gap: 16px; flex: 1; min-width: 280px; z-index: 1;">
                <div style="width: 52px; height: 52px; border-radius: 16px; background: rgba(239, 68, 68, 0.2); border: 1.5px solid rgba(239, 68, 68, 0.5); display: flex; align-items: center; justify-content: center; color: #f87171; position: relative; flex-shrink: 0;">
                    <span style="position: absolute; top: 6px; right: 6px; width: 9px; height: 9px; border-radius: 50%; background: #ef4444; animation: pulse 1.5s infinite;"></span>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path>
                        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path>
                        <circle cx="12" cy="12" r="2"></circle>
                        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path>
                        <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"></path>
                    </svg>
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                        <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: ${statusBadgeBg}; color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
                            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ffffff; animation: pulse 1s infinite;"></span>
                            ${statusText}
                        </span>
                        <span style="font-size: 12px; color: #cbd5e1; font-weight: 600;">• Class: ${escapeHtml(liveQuiz.targetClass || 'All Classes')}</span>
                        <span style="font-size: 12px; color: #a5b4fc; font-weight: 600;">• ${liveQuiz.durationMinutes || 30} Mins</span>
                    </div>
                    <h3 style="margin: 0 0 4px 0; font-size: 19px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px;">
                        ${escapeHtml(liveQuiz.title || 'Live Quiz')}
                    </h3>
                    <p style="margin: 0; font-size: 13px; color: #c7d2fe; line-height: 1.4;">
                        ${subText}
                    </p>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px; z-index: 1;">
                <button type="button" onclick="joinLiveLobbyDirect('${escapeHtml(liveQuiz.quizId)}')"
                    style="background: ${btnBg}; color: #ffffff; border: none; padding: 13px 26px; border-radius: 12px; font-size: 15px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4); transition: transform 0.2s, box-shadow 0.2s;">
                    <span>${btnText}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </button>
            </div>
        </div>
    `;

    bannerContainer.classList.remove('hidden');
}

window.joinLiveLobbyDirect = async function(quizId) {
    if (!quizId) return;

    let targetQuiz = availableQuizzesMap[quizId];
    if (!targetQuiz) {
        try {
            const qDocSnap = await getDoc(doc(db, "quizzes", quizId));
            if (qDocSnap.exists()) {
                targetQuiz = { id: qDocSnap.id, ...qDocSnap.data() };
                availableQuizzesMap[quizId] = targetQuiz;
            } else {
                alert("Quiz details not found in database.");
                return;
            }
        } catch (e) {
            console.error("Error fetching quiz for live lobby:", e);
            alert("Failed to load quiz details: " + e.message);
            return;
        }
    }

    if (isQuizAlreadyCompleted(targetQuiz)) {
        alert("You've already did the quiz. Each quiz can only be completed once.");
        return;
    }

    activeQuiz = targetQuiz;

    try {
        const liveDocRef = doc(db, "live_quizzes", quizId);
        const liveSnap = await getDoc(liveDocRef);
        if (liveSnap.exists()) {
            const liveData = liveSnap.data();
            joinLiveQuizSession(quizId, targetQuiz, liveData);
        } else {
            alert("The live session is no longer active.");
        }
    } catch (e) {
        console.error("Error joining live quiz lobby:", e);
        alert("Failed to join live session: " + e.message);
    }
};

// --- START SELECTED QUIZ (SUPPORTS LIVE QUIZ & REGULAR QUIZ) ---
async function startQuizById(quizId) {
    if (!quizId || !availableQuizzesMap[quizId]) {
        alert("Please choose a valid quiz.");
        return;
    }

    const targetQuiz = availableQuizzesMap[quizId];
    if (isQuizAlreadyCompleted(targetQuiz)) {
        alert("You've already did the quiz. Each quiz can only be completed once.");
        return;
    }

    activeQuiz = targetQuiz;

    // Check if there is an active Live Quiz session for this quiz
    try {
        const liveDocRef = doc(db, "live_quizzes", quizId);
        const liveSnap = await getDoc(liveDocRef);

        if (liveSnap.exists()) {
            const liveData = liveSnap.data();
            // If live session is waiting or in progress, join live flow
            if (liveData.status === 'waiting' || liveData.status === 'in_progress') {
                joinLiveQuizSession(quizId, targetQuiz, liveData);
                return;
            }
        }
    } catch (err) {
        console.warn("Error checking live quiz session, defaulting to normal quiz:", err);
    }

    // Standard Non-Live Quiz Flow
    activeLiveQuizData = null;
    isForcedSubmit = false;
    document.getElementById('studentQuizModal')?.classList.add('hidden');
    document.getElementById('quizDashboardSection')?.classList.add('hidden');
    document.getElementById('liveQuizStudentHeaderBar')?.classList.add('hidden');
    document.getElementById('takeQuizSection')?.classList.remove('hidden');

    // Reset submit button state for standard quiz
    const stdSubmitBtn = document.getElementById('submitQuizBtn');
    if (stdSubmitBtn) {
        stdSubmitBtn.disabled = false;
        stdSubmitBtn.style.opacity = '1';
        stdSubmitBtn.style.cursor = 'pointer';
        stdSubmitBtn.style.background = '#10b981';
        stdSubmitBtn.innerHTML = 'Submit Assessment';
    }
    document.getElementById('liveSubmitLockedNotice')?.classList.add('hidden');
    const statusBadge = document.getElementById('studentSubmitStatusBadge');
    if (statusBadge) statusBadge.style.display = 'none';

    renderQuizForm(activeQuiz);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Join Live Quiz Waiting Room or In-Progress Live Quiz
async function joinLiveQuizSession(quizId, targetQuiz, initialLiveData) {
    document.getElementById('studentQuizModal')?.classList.add('hidden');
    document.getElementById('quizDashboardSection')?.classList.add('hidden');

    activeLiveQuizData = initialLiveData;
    liveStudentAnswers = {};
    liveWarningCount = 0;

    // Register presence in live_quizzes/{quizId}/participants/{studentCode}
    const resolvedStudentCode = String(currentStudent?.code || currentStudent?.studentCode || currentStudent?.id || '').trim().toUpperCase();
    if (!resolvedStudentCode) {
        console.error("No valid studentCode found on currentStudent:", currentStudent);
        return;
    }

    const participantRef = doc(db, "live_quizzes", quizId, "participants", resolvedStudentCode);
    const studentDisplayName = currentStudent.studentName || currentStudent.name || 'Student';
    const studentDisplayClass = currentStudent.studentClass || currentStudent.class || '-';
    
    // Check if resuming existing answers
    try {
        const pSnap = await getDoc(participantRef);
        if (pSnap.exists()) {
            const existingData = pSnap.data();
            liveStudentAnswers = existingData.answers || {};
            liveWarningCount = (existingData.warnings || []).length;
        }

        await setDoc(participantRef, {
            studentCode: resolvedStudentCode,
            studentName: studentDisplayName,
            studentClass: studentDisplayClass,
            connected: true,
            lastPing: Date.now(),
            answers: liveStudentAnswers,
            warnings: pSnap.exists() ? (pSnap.data().warnings || []) : [],
            submitted: false
        }, { merge: true });
        console.log(`[LiveQuiz] Successfully registered presence for student: ${resolvedStudentCode} in quiz: ${quizId}`);
    } catch (e) {
        console.error("Error setting participant presence:", e);
        showAntiCheatToast("⚠️ Live presence note: " + (e.message || "Failed to register presence with teacher."));
    }

    // Heartbeat presence every 20 seconds with full identity so connection stays alive with minimal writes
    if (livePresenceInterval) clearInterval(livePresenceInterval);
    livePresenceInterval = setInterval(async () => {
        try {
            await setDoc(participantRef, {
                studentCode: resolvedStudentCode,
                studentName: studentDisplayName,
                studentClass: studentDisplayClass,
                connected: true,
                answers: liveStudentAnswers || {},
                lastPing: Date.now()
            }, { merge: true });
        } catch (e) {
            console.warn("[LiveQuiz] Heartbeat failed:", e);
        }
    }, 20000);

    // Update connection status when closing or hiding window
    const handleExitPresence = () => {
        try {
            setDoc(participantRef, {
                connected: false,
                lastPing: Date.now()
            }, { merge: true });
        } catch (e) {}
    };
    window.addEventListener('beforeunload', handleExitPresence, { once: true });

    // If waiting, show Waiting Room
    if (initialLiveData.status === 'waiting') {
        const waitingModal = document.getElementById('liveQuizWaitingModal');
        const titleEl = document.getElementById('liveWaitingTitle');
        if (titleEl) titleEl.innerText = targetQuiz.title || "Live Assessment";
        const subjectEl = document.getElementById('liveWaitingSubject');
        if (subjectEl) subjectEl.innerText = `Subject: ${targetQuiz.subject || 'General'}`;
        document.getElementById('liveStartingCountdownBox')?.classList.add('hidden');
        if (waitingModal) waitingModal.classList.remove('hidden');

        // Real-time listener for participant count in waiting room
        const countEl = document.getElementById('liveWaitingParticipantsCount');
        if (activeLiveParticipantsUnsubscribe) activeLiveParticipantsUnsubscribe();
        activeLiveParticipantsUnsubscribe = onSnapshot(collection(db, "live_quizzes", quizId, "participants"), (snap) => {
            let count = 0;
            snap.forEach(docSnap => {
                const p = docSnap.data();
                if (p && p.connected !== false) {
                    count++;
                }
            });
            if (countEl) {
                countEl.innerText = count === 1 ? '1 student joined' : `${count} students joined`;
            }
        });
    } else if (initialLiveData.status === 'in_progress') {
        startLiveQuizTaking(targetQuiz, initialLiveData);
    }

    // Subscribe to real-time changes of live_quizzes/{quizId}
    if (activeLiveSessionUnsubscribe) activeLiveSessionUnsubscribe();
    activeLiveSessionUnsubscribe = onSnapshot(doc(db, "live_quizzes", quizId), (docSnap) => {
        if (!docSnap.exists()) return;
        const liveState = docSnap.data();
        activeLiveQuizData = liveState;

        // Synchronize student submit permission in real-time
        updateStudentSubmitPermissionUI(liveState.allowSubmit);

        if (liveState.status === 'in_progress') {
            const waitingModal = document.getElementById('liveQuizWaitingModal');
            if (waitingModal && !waitingModal.classList.contains('hidden')) {
                // Play countdown animation then unlock
                const countdownBox = document.getElementById('liveStartingCountdownBox');
                const countdownNum = document.getElementById('liveStartingCountdownNumber');
                if (countdownBox && countdownNum) {
                    countdownBox.classList.remove('hidden');
                    let count = 3;
                    countdownNum.innerText = count;
                    const cInterval = setInterval(() => {
                        count--;
                        if (count > 0) {
                            countdownNum.innerText = count;
                        } else {
                            clearInterval(cInterval);
                            waitingModal.classList.add('hidden');
                            startLiveQuizTaking(targetQuiz, liveState);
                        }
                    }, 800);
                } else {
                    waitingModal.classList.add('hidden');
                    startLiveQuizTaking(targetQuiz, liveState);
                }
            } else {
                updateStudentLiveTimer(liveState.endsAt);
            }
        } else if (liveState.status === 'ended') {
            alert("The teacher has ended this Live Quiz session. Your assessment will now submit.");
            isForcedSubmit = true;
            document.getElementById('submitQuizBtn')?.click();
        }
    });
}

function updateStudentSubmitPermissionUI(allowSubmit) {
    const isAllowed = (allowSubmit === true);
    const submitBtn = document.getElementById('submitQuizBtn');
    const lockedNotice = document.getElementById('liveSubmitLockedNotice');
    const badge = document.getElementById('studentSubmitStatusBadge');
    const badgeText = document.getElementById('studentSubmitStatusBadgeText');

    if (badge) {
        badge.style.display = 'inline-flex';
        if (isAllowed) {
            badge.style.background = '#ecfdf5';
            badge.style.color = '#059669';
            if (badgeText) badgeText.innerText = '🔓 Submissions Open';
        } else {
            badge.style.background = '#fee2e2';
            badge.style.color = '#ef4444';
            if (badgeText) badgeText.innerText = '🔒 Submissions Locked';
        }
    }

    if (lockedNotice) {
        if (isAllowed) {
            lockedNotice.classList.add('hidden');
        } else {
            lockedNotice.classList.remove('hidden');
        }
    }

    if (submitBtn) {
        if (isAllowed) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
            submitBtn.style.background = '#10b981';
            submitBtn.innerHTML = 'Submit Assessment';
        } else {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.65';
            submitBtn.style.cursor = 'not-allowed';
            submitBtn.style.background = '#64748b';
            submitBtn.innerHTML = '🔒 Submissions Locked by Teacher';
        }
    }
}

function startLiveQuizTaking(quiz, liveState) {
    if (activeLiveParticipantsUnsubscribe) {
        activeLiveParticipantsUnsubscribe();
        activeLiveParticipantsUnsubscribe = null;
    }
    document.getElementById('takeQuizSection')?.classList.remove('hidden');
    const headerBar = document.getElementById('liveQuizStudentHeaderBar');
    if (headerBar) headerBar.classList.remove('hidden');

    // Anti-cheat warning badge
    const badge = document.getElementById('studentWarningBadge');
    const countEl = document.getElementById('studentWarningCount');
    if (badge && countEl) {
        countEl.innerText = liveWarningCount;
        badge.style.display = liveWarningCount > 0 ? 'inline-flex' : 'none';
    }

    // Initialize Submit Permission UI
    updateStudentSubmitPermissionUI(liveState.allowSubmit);

    // Setup Timer
    updateStudentLiveTimer(liveState.endsAt);

    // Render questions and restore any saved draft answers
    renderQuizForm(quiz);
    restoreLiveDraftAnswers();

    // Attach Anti-Cheat listeners
    setupAntiCheatEngine(quiz.id);

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStudentLiveTimer(endsAtStr) {
    const timerDisplay = document.getElementById('studentLiveTimerDisplay');
    if (!timerDisplay) return;

    if (liveStudentTimerInterval) clearInterval(liveStudentTimerInterval);

    const endsAt = endsAtStr ? new Date(endsAtStr).getTime() : 0;
    const tick = () => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((endsAt - now) / 1000));
        const mins = String(Math.floor(diff / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        timerDisplay.innerText = `${mins}:${secs}`;
        if (diff <= 0) {
            timerDisplay.innerText = "00:00";
            clearInterval(liveStudentTimerInterval);
            alert("Time is up! Submitting your answers now.");
            isForcedSubmit = true;
            document.getElementById('submitQuizBtn')?.click();
        }
    };
    tick();
    liveStudentTimerInterval = setInterval(tick, 1000);
}

// Restore Draft Answers from liveStudentAnswers or localStorage
function restoreLiveDraftAnswers() {
    const form = document.getElementById('quizForm');
    if (!form || !liveStudentAnswers) return;

    Object.keys(liveStudentAnswers).forEach(idx => {
        const itemAns = liveStudentAnswers[idx];
        if (!itemAns) return;

        // MCQ radio
        const radio = form.querySelector(`input[name="item_${idx}"][value="${itemAns.value}"]`);
        if (radio) radio.checked = true;

        // Fill / Essay
        const textInput = form.querySelector(`textarea[name="item_${idx}"], input[name="item_${idx}"]`);
        if (textInput && itemAns.value !== undefined) {
            textInput.value = itemAns.value;
            if (window.autoResizeInput) window.autoResizeInput(textInput);
        }

        // Matching dropdowns
        if (itemAns.matches && typeof itemAns.matches === 'object') {
            Object.keys(itemAns.matches).forEach(lIdx => {
                const select = form.querySelector(`select[name="item_${idx}_${lIdx}"]`);
                if (select) select.value = itemAns.matches[lIdx];
            });
        }
    });
}

// Debounced autosave for live answers to optimize Firestore writes
async function syncLiveAnswer(itemIdx, answerObj, immediate = false) {
    if (!activeQuiz || !currentStudent || !activeLiveQuizData) return;
    liveStudentAnswers[itemIdx] = answerObj;

    if (liveAnswerSyncTimeout) {
        clearTimeout(liveAnswerSyncTimeout);
        liveAnswerSyncTimeout = null;
    }

    if (immediate) {
        await flushPendingLiveAnswerSync();
    } else {
        // Debounce live answer writes by 1.5 seconds so rapid clicks/typing don't spam Firestore
        liveAnswerSyncTimeout = setTimeout(async () => {
            await flushPendingLiveAnswerSync();
        }, 1500);
    }
}

async function flushPendingLiveAnswerSync() {
    if (liveAnswerSyncTimeout) {
        clearTimeout(liveAnswerSyncTimeout);
        liveAnswerSyncTimeout = null;
    }
    if (!activeQuiz || !currentStudent || !activeLiveQuizData) return;

    try {
        const studentCode = String(currentStudent.code || currentStudent.studentCode || currentStudent.id || '').trim().toUpperCase();
        if (!studentCode) return;
        const pRef = doc(db, "live_quizzes", activeQuiz.id, "participants", studentCode);
        await updateDoc(pRef, {
            answers: liveStudentAnswers || {},
            lastUpdated: Date.now()
        });
    } catch (e) {
        console.warn("Could not sync live answer:", e);
    }
}

// --- ANTI-CHEAT MONITORING ENGINE ---
let antiCheatAttached = false;
function setupAntiCheatEngine(quizId) {
    if (antiCheatAttached) return;
    antiCheatAttached = true;

    const recordInfraction = async (type, details) => {
        if (!activeQuiz || !currentStudent) return;
        liveWarningCount++;

        const badge = document.getElementById('studentWarningBadge');
        const countEl = document.getElementById('studentWarningCount');
        if (badge && countEl) {
            countEl.innerText = liveWarningCount;
            badge.style.display = 'inline-flex';
        }

        // Alert student
        showAntiCheatToast(`⚠️ Warning: Leaving the quiz tab is recorded and visible to your teacher!`);

        // Send to Firestore
        try {
            const studentCode = String(currentStudent.code || currentStudent.studentCode || currentStudent.id || '').trim().toUpperCase();
            if (!studentCode) return;
            const pRef = doc(db, "live_quizzes", quizId, "participants", studentCode);
            const snap = await getDoc(pRef);
            const currentWarns = snap.exists() ? (snap.data().warnings || []) : [];
            currentWarns.push({
                type: type,
                details: details,
                timestamp: Date.now()
            });

            await updateDoc(pRef, {
                warnings: currentWarns
            });
        } catch (e) {
            console.warn("Error logging anti-cheat event:", e);
        }
    };

    // 1. Tab switch or window minimized
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && activeQuiz && document.getElementById('takeQuizSection') && !document.getElementById('takeQuizSection').classList.contains('hidden')) {
            recordInfraction('tab_switch', 'Switched to another tab or minimized window');
        }
    });

    // 2. Window blur (click outside browser / split screen)
    window.addEventListener('blur', () => {
        if (activeQuiz && document.getElementById('takeQuizSection') && !document.getElementById('takeQuizSection').classList.contains('hidden')) {
            recordInfraction('window_blur', 'Window lost focus (clicked outside browser)');
        }
    });
}

function showAntiCheatToast(msg) {
    let toast = document.getElementById('antiCheatStudentToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'antiCheatStudentToast';
        toast.style.cssText = 'position:fixed; top:20px; right:20px; background:#ef4444; color:#fff; padding:12px 20px; border-radius:10px; font-weight:700; font-size:13px; z-index:9999; box-shadow:0 10px 25px rgba(239,68,68,0.4); display:none; transition:all 0.3s ease;';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => {
        if (toast) toast.style.display = 'none';
    }, 4000);
}

// Exit Waiting Room Handler
document.getElementById('exitLiveWaitingBtn')?.addEventListener('click', async () => {
    document.getElementById('liveQuizWaitingModal')?.classList.add('hidden');
    document.getElementById('quizDashboardSection')?.classList.remove('hidden');

    if (activeLiveParticipantsUnsubscribe) {
        activeLiveParticipantsUnsubscribe();
        activeLiveParticipantsUnsubscribe = null;
    }

    if (activeQuiz && currentStudent) {
        const studentCode = String(currentStudent.code || currentStudent.studentCode || currentStudent.id || '').trim().toUpperCase();
        if (studentCode) {
            try {
                await setDoc(doc(db, "live_quizzes", activeQuiz.id, "participants", studentCode), {
                    connected: false
                }, { merge: true });
            } catch (e) {}
        }
    }

    if (activeLiveSessionUnsubscribe) activeLiveSessionUnsubscribe();
    if (livePresenceInterval) clearInterval(livePresenceInterval);
    if (liveAnswerSyncTimeout) clearTimeout(liveAnswerSyncTimeout);
    activeQuiz = null;
});

// Cancel / Exit Active Quiz
document.getElementById('cancelQuizBtn')?.addEventListener('click', async () => {
    if (confirm("Are you sure you want to exit? Your answers will be submitted.")) {
        if (activeQuiz && currentStudent && activeLiveQuizData) {
            const studentCode = String(currentStudent.code || currentStudent.studentCode || currentStudent.id || '').trim().toUpperCase();
            if (studentCode) {
                try {
                    await setDoc(doc(db, "live_quizzes", activeQuiz.id, "participants", studentCode), {
                        connected: false
                    }, { merge: true });
                } catch (e) {}
            }
        }
        if (activeLiveSessionUnsubscribe) activeLiveSessionUnsubscribe();
        if (livePresenceInterval) clearInterval(livePresenceInterval);
        if (liveStudentTimerInterval) clearInterval(liveStudentTimerInterval);
        if (liveAnswerSyncTimeout) clearTimeout(liveAnswerSyncTimeout);

        activeLiveQuizData = null;
        isForcedSubmit = false;
        document.getElementById('liveQuizStudentHeaderBar')?.classList.add('hidden');
        document.getElementById('takeQuizSection')?.classList.add('hidden');
        document.getElementById('quizDashboardSection')?.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// Return to Dashboard from Result Screen
document.getElementById('returnToDashboardBtn')?.addEventListener('click', async () => {
    activeLiveQuizData = null;
    isForcedSubmit = false;
    document.getElementById('resultSection')?.classList.add('hidden');
    document.getElementById('quizDashboardSection')?.classList.remove('hidden');
    if (currentStudent && currentStudent.code) {
        await loadRecentQuizzes(currentStudent.code);
        await loadAvailableQuizzes(currentStudent.studentClass || currentStudent.class);
        setupLiveQuizLobbyListener(currentStudent.studentClass || currentStudent.class);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Auto-resize input textareas to fit content without scrollbars
window.autoResizeInput = function(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(48, el.scrollHeight) + 'px';
};

// --- HELPER: CONVERT DRIVE URL & RENDER QUESTION IMAGES ---
function convertDriveUrl(url) {
    if (!url) return '';
    url = url.trim();
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
}

function renderQuestionImage(imageUrl, imageTitle) {
    if (!imageUrl) return '';
    const convertedUrl = convertDriveUrl(imageUrl);
    return `
        <div class="quiz-q-image-wrap" style="margin: 12px 0; text-align: center; background: var(--bg-body, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 12px;">
            ${imageTitle ? `<div class="quiz-q-image-title" style="font-size: 13.5px; font-weight: 700; color: var(--text-dark, #0f172a); margin-bottom: 8px;">${escapeHtml(imageTitle)}</div>` : ''}
            <img src="${escapeHtml(convertedUrl)}" alt="${escapeHtml(imageTitle || 'Question illustration')}" style="max-width: 100%; max-height: 380px; object-fit: contain; border-radius: 8px; border: 1px solid rgba(0,0,0,0.06); display: inline-block;">
        </div>
    `;
}

// --- STUDENT FILE UPLOAD HANDLER FOR GOOGLE DRIVE REVIEW SYNC ---
window.handleStudentFileUpload = async function (fileInput, idx) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const statusEl = document.getElementById(`file_status_${idx}`);
    const fileUrlHidden = document.getElementById(`item_${idx}_fileUrl`);
    const fileNameHidden = document.getElementById(`item_${idx}_fileName`);

    if (file.size > 25 * 1024 * 1024) {
        alert("File size exceeds 25MB limit. Please upload a smaller file or paste a Google Drive/Docs share link.");
        fileInput.value = '';
        return;
    }

    if (statusEl) {
        statusEl.innerHTML = `
            <div style="display: inline-flex; align-items: center; gap: 8px; background: #eff6ff; color: #1d4ed8; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; border: 1px solid #bfdbfe;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                <span>Uploading "${escapeHtml(file.name)}" to Google Drive Review folder...</span>
            </div>
        `;
    }

    try {
        let scriptUrl = localStorage.getItem('reviewDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
        if (!scriptUrl) {
            try {
                let snap = await getDoc(doc(db, "system_settings", "google_drive"));
                if (!snap.exists()) {
                    snap = await getDoc(doc(db, "system_settings", "googleDrive"));
                }
                if (snap.exists()) {
                    const data = snap.data();
                    scriptUrl = data.reviewScriptUrl || data.scriptUrlReview || data.scriptUrl || data.profileScriptUrl || '';
                    if (scriptUrl) {
                        localStorage.setItem('reviewDriveScriptUrl', scriptUrl);
                        localStorage.setItem('googleDriveScriptUrl', scriptUrl);
                    }
                }
            } catch (e) {
                console.warn(e);
            }
        }

        if (!scriptUrl) {
            throw new Error("Google Drive Upload Script is not configured by teacher yet. You can paste a shared link in the box below.");
        }

        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result;
                const base64 = res.split(',')[1] || res;
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const quizTitle = (activeQuiz?.title || 'Quiz').trim();
        const studentClass = (currentStudent?.class || currentStudent?.className || 'Class').trim();
        const studentName = (currentStudent?.studentName || currentStudent?.name || 'Student').trim();
        const studentCode = (currentStudent?.code || 'STU').trim();
        const targetFolderId = (localStorage.getItem('reviewDriveFolderId') || '').trim();

        const payload = {
            action: "uploadQuizFile",
            folderId: targetFolderId,
            rootFolder: targetFolderId || "Review",
            quizTitle: quizTitle,
            className: studentClass,
            studentName: studentName,
            studentCode: studentCode,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data: base64Data
        };

        const res = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (json.status === 'success' && json.fileUrl) {
            if (fileUrlHidden) fileUrlHidden.value = json.fileUrl;
            if (fileNameHidden) fileNameHidden.value = json.fileName || file.name;

            if (statusEl) {
                statusEl.innerHTML = `
                    <div style="background: #ecfdf5; border: 1.5px solid #a7f3d0; padding: 10px 14px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            <span style="color: #065f46; font-size: 13px; font-weight: 700;">Uploaded: ${escapeHtml(json.fileName || file.name)}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <a href="${escapeHtml(json.fileUrl)}" target="_blank" rel="noopener noreferrer" style="color: #047857; font-weight: 700; text-decoration: underline; font-size: 12.5px;">View in Drive ↗</a>
                            <button type="button" onclick="window.clearStudentUploadedFile(${idx})" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700; cursor: pointer;">Replace</button>
                        </div>
                    </div>
                `;
            }

            syncLiveAnswer(idx, { value: json.fileUrl, text: json.fileName || file.name }, false);
        } else {
            throw new Error(json.error || "Upload failed");
        }
    } catch (err) {
        console.error("Student file upload error:", err);
        if (statusEl) {
            statusEl.innerHTML = `
                <div style="background: #fef2f2; border: 1.5px solid #fecaca; padding: 8px 12px; border-radius: 8px; color: #b91c1c; font-size: 12.5px;">
                    <strong>Upload failed:</strong> ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
};

window.clearStudentUploadedFile = function (idx) {
    const fileInput = document.getElementById(`file_input_${idx}`);
    const statusEl = document.getElementById(`file_status_${idx}`);
    const fileUrlHidden = document.getElementById(`item_${idx}_fileUrl`);
    const fileNameHidden = document.getElementById(`item_${idx}_fileName`);
    if (fileInput) fileInput.value = '';
    if (fileUrlHidden) fileUrlHidden.value = '';
    if (fileNameHidden) fileNameHidden.value = '';
    if (statusEl) statusEl.innerHTML = '';
};

// --- RENDER ASSESSMENT FORM ---
function renderQuizForm(quiz) {
    document.getElementById('activeQuizTitle').innerText = quiz.title;
    document.getElementById('activeQuizSubject').innerText = `Subject: ${quiz.subject || 'General'}`;

    const form = document.getElementById('quizForm');
    form.innerHTML = "";

    const items = quiz.items || quiz.questions || [];
    let questionCounter = 0;

    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = "question-card";

        // 1. Header / Section Instructions
        if (item.type === 'header') {
            div.style.background = "var(--bg-body, #f8fafc)";
            div.style.borderLeft = "5px solid var(--primary-blue, #1e5eff)";
            div.innerHTML = `
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: var(--text-dark);">${escapeHtml(item.text || item.title || 'Section')}</h3>
                ${item.description ? `<p style="margin:0; font-size:14px; line-height: 1.5; color:var(--text-gray);">${escapeHtml(item.description)}</p>` : ''}
            `;
        } 
        // 2. Reading Passage
        else if (item.type === 'passage') {
            div.style.borderLeft = "5px solid #10b981";

            // Robust resolution of Passage Title vs Article Body
            let passageTitle = item.title || item.prompt || '';
            let passageBody = '';

            if (item.description && item.text) {
                // If text was used to store title and description contains the longer article
                if (item.text === item.title || item.text === item.prompt || item.description.length > item.text.length) {
                    passageTitle = item.title || item.prompt || item.text || 'Reading Passage';
                    passageBody = item.description;
                } else {
                    passageTitle = item.title || item.prompt || 'Reading Passage';
                    passageBody = item.text;
                }
            } else if (item.description) {
                passageTitle = item.title || item.prompt || (item.text && item.text !== item.description ? item.text : 'Reading Passage');
                passageBody = item.description;
            } else if (item.passage) {
                passageTitle = item.title || item.prompt || 'Reading Passage';
                passageBody = item.passage;
            } else if (item.text) {
                if (item.title && item.title !== item.text) {
                    passageTitle = item.title;
                    passageBody = item.text;
                } else {
                    passageTitle = item.title || item.prompt || 'Reading Passage';
                    passageBody = item.text;
                }
            } else if (item.content) {
                passageTitle = item.title || item.prompt || 'Reading Passage';
                passageBody = item.content;
            }

            if (!passageTitle || passageTitle === passageBody) {
                passageTitle = 'Reading Passage';
            }

            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <span style="background: rgba(16, 185, 129, 0.1); color: #10b981; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">Reading Passage</span>
                </div>
                <h4 style="margin: 0 0 10px 0; font-size: 16.5px; font-weight: 700; color:var(--text-dark);">${escapeHtml(passageTitle)}</h4>
                <div style="white-space: pre-line; background: var(--bg-body, #f8fafc); padding: 16px; border-radius: 10px; font-size: 14.5px; line-height: 1.65; border: 1px solid var(--border-color); color: var(--text-dark);">${escapeHtml(passageBody)}</div>
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}
            `;
        } 
        // 3. Standalone Image Block
        else if (item.type === 'image') {
            div.style.borderLeft = "5px solid #6366f1";
            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span style="background: rgba(99, 102, 241, 0.1); color: #6366f1; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase;">Image Resource</span>
                </div>
                ${item.prompt ? `<h4 style="margin: 0 0 10px 0; font-size: 16.5px; font-weight: 700; color:var(--text-dark);">${escapeHtml(item.prompt)}</h4>` : ''}
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}
            `;
        }
        // 4. File Upload / Link Question
        else if (item.type === 'fileupload') {
            questionCounter++;
            const prompt = item.prompt || '';
            const pointsHtml = item.points ? `<span class="q-points-badge">${item.points} pt${item.points > 1 ? 's' : ''}</span>` : '';
            const uploadMode = item.uploadMode || 'both';
            const showFileInput = uploadMode !== 'link_only';
            const showLinkInput = uploadMode !== 'file_only';

            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="q-num-badge">No. ${questionCounter}</span>
                    ${pointsHtml}
                </div>
                <div class="quiz-question-text">${escapeHtml(prompt)}</div>
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}

                <div class="quiz-fileupload-box" style="margin-top: 14px; background: var(--bg-body, #f8fafc); border: 1.5px dashed var(--border-color, #cbd5e1); border-radius: 12px; padding: 16px;">
                    ${showFileInput ? `
                    <div class="quiz-file-dropzone" style="text-align: center; margin-bottom: ${showLinkInput ? '14px' : '0'};">
                        <input type="file" id="file_input_${idx}" class="quiz-file-native-input" style="display: none;" onchange="window.handleStudentFileUpload(this, ${idx})">
                        <input type="hidden" name="item_${idx}_fileUrl" id="item_${idx}_fileUrl" value="">
                        <input type="hidden" name="item_${idx}_fileName" id="item_${idx}_fileName" value="">

                        <label for="file_input_${idx}" style="cursor: pointer; display: inline-flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 20px; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 10px; width: 100%; box-sizing: border-box; transition: all 0.2s ease;">
                            <div style="width: 42px; height: 42px; border-radius: 50%; background: #e0e7ff; display: flex; align-items: center; justify-content: center; color: #4f46e5;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                            </div>
                            <div>
                                <strong style="color: #1e1b4b; font-size: 13.5px; display: block;">Click to choose file to upload</strong>
                                <span style="color: #64748b; font-size: 11.5px;">Auto-organizes in Google Drive: Review / Quiz / Class</span>
                            </div>
                        </label>

                        <div id="file_status_${idx}" class="fileupload-status-${idx}" style="margin-top: 10px;"></div>
                    </div>
                    ` : ''}

                    ${(showFileInput && showLinkInput) ? `
                    <div style="display: flex; align-items: center; gap: 10px; margin: 12px 0;">
                        <div style="flex: 1; height: 1px; background: #e2e8f0;"></div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">OR PASTE LINK</span>
                        <div style="flex: 1; height: 1px; background: #e2e8f0;"></div>
                    </div>
                    ` : ''}

                    ${showLinkInput ? `
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 5px;">Online Project Link (Google Docs, Canva, Figma, etc.):</label>
                        <input type="url" name="item_${idx}_link" placeholder="https://..." style="width: 100%; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 9px 12px; font-size: 13px; box-sizing: border-box; background: #ffffff;">
                    </div>
                    ` : ''}
                </div>
            `;
        }
        // 5. Multiple Choice Question
        else if (item.type === 'mcq' || (!item.type && item.question)) {
            questionCounter++;
            const prompt = item.prompt || item.question || '';
            const pointsHtml = item.points ? `<span class="q-points-badge">${item.points} pt${item.points > 1 ? 's' : ''}</span>` : '';

            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="q-num-badge">No. ${questionCounter}</span>
                    ${pointsHtml}
                </div>
                <div class="quiz-question-text">${escapeHtml(prompt)}</div>
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}
                <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
                    ${(item.options || []).map((opt, oIdx) => `
                        <label class="quiz-option-label">
                            <input type="radio" name="item_${idx}" value="${oIdx}">
                            <span>${escapeHtml(opt)}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        } 
        // 6. Fill in the Blank
        else if (item.type === 'fill') {
            questionCounter++;
            const prompt = item.prompt || '';
            const pointsHtml = item.points ? `<span class="q-points-badge">${item.points} pt${item.points > 1 ? 's' : ''}</span>` : '';

            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="q-num-badge">No. ${questionCounter}</span>
                    ${pointsHtml}
                </div>
                <div class="quiz-question-text">${escapeHtml(prompt)}</div>
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}
                <textarea name="item_${idx}" class="auto-expand-input" rows="1" placeholder="Type your answer here..." oninput="autoResizeInput(this)"></textarea>
            `;
        } 
        // 7. Essay Question
        else if (item.type === 'essay') {
            questionCounter++;
            const prompt = item.prompt || '';
            const pointsHtml = item.points ? `<span class="q-points-badge">${item.points} pt${item.points > 1 ? 's' : ''}</span>` : '';

            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="q-num-badge">No. ${questionCounter}</span>
                    ${pointsHtml}
                </div>
                <div class="quiz-question-text">${escapeHtml(prompt)}</div>
                ${renderQuestionImage(item.imageUrl, item.imageTitle)}
                <textarea name="item_${idx}" class="auto-expand-input" rows="3" placeholder="Write your full response here..." oninput="autoResizeInput(this)" style="min-height: 85px;"></textarea>
            `;
        } 
        // 8. Matching Question
        else if (item.type === 'matching') {
            questionCounter++;
            const prompt = item.prompt || '';
            let optionsHtml = (item.rights || []).map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="q-num-badge">No. ${questionCounter}</span>
                </div>
                <div class="quiz-question-text">${escapeHtml(prompt)}</div>
                ${(item.lefts || []).map((left, lIdx) => `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin:10px 0; background: var(--bg-body, #f8fafc); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border-color);">
                        <span style="font-size:14.5px; font-weight: 600; color: var(--text-dark);">${escapeHtml(left)}</span>
                        <select name="item_${idx}_${lIdx}" style="width:auto; margin:0; padding:8px 14px; font-size: 13.5px; font-weight: 600; border-radius: 8px;">
                            <option value="">-- Choose Match --</option>
                            ${optionsHtml}
                        </select>
                    </div>
                `).join('')}
            `;
        }

        form.appendChild(div);

        // Attach Real-Time Answer Autosync Listeners
        if (item.type === 'mcq' || (!item.type && item.question)) {
            div.querySelectorAll(`input[name="item_${idx}"]`).forEach(radio => {
                radio.addEventListener('change', () => {
                    const chosenIdx = parseInt(radio.value, 10);
                    const chosenText = (item.options && item.options[chosenIdx]) || '';
                    syncLiveAnswer(idx, { value: chosenIdx, text: chosenText }, false);
                });
            });
        } else if (item.type === 'fill' || item.type === 'essay') {
            const input = div.querySelector(`[name="item_${idx}"]`);
            if (input) {
                input.addEventListener('input', () => {
                    syncLiveAnswer(idx, { value: input.value.trim(), text: input.value.trim() }, false);
                });
                input.addEventListener('blur', () => {
                    if (liveAnswerSyncTimeout) {
                        flushPendingLiveAnswerSync();
                    }
                });
            }
        } else if (item.type === 'fileupload') {
            const linkInput = div.querySelector(`input[name="item_${idx}_link"]`);
            if (linkInput) {
                linkInput.addEventListener('input', () => {
                    syncLiveAnswer(idx, { value: linkInput.value.trim(), text: linkInput.value.trim() }, false);
                });
                linkInput.addEventListener('blur', () => {
                    if (liveAnswerSyncTimeout) {
                        flushPendingLiveAnswerSync();
                    }
                });
            }
        } else if (item.type === 'matching') {
            div.querySelectorAll(`select[name^="item_${idx}_"]`).forEach(select => {
                select.addEventListener('change', () => {
                    const matches = {};
                    (item.lefts || []).forEach((left, lIdx) => {
                        const sel = form.querySelector(`select[name="item_${idx}_${lIdx}"]`);
                        if (sel && sel.value) matches[lIdx] = sel.value;
                    });
                    const summary = Object.keys(matches).map(k => `${(item.lefts || [])[k]} → ${matches[k]}`).join(', ');
                    syncLiveAnswer(idx, { matches: matches, text: summary }, false);
                });
                select.addEventListener('blur', () => {
                    if (liveAnswerSyncTimeout) {
                        flushPendingLiveAnswerSync();
                    }
                });
            });
        }
    });

    document.getElementById('takeQuizSection').classList.remove('hidden');
}

// --- SUBMIT ASSESSMENT ---
document.getElementById('submitQuizBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!activeQuiz || !currentStudent) return;

    // Guard: Prevent early submissions if teacher has locked submissions
    if (activeLiveQuizData && activeLiveQuizData.status === 'in_progress' && activeLiveQuizData.allowSubmit === false && !isForcedSubmit) {
        alert("Submissions are currently locked by the teacher. Please continue reviewing your answers until the teacher enables submissions.");
        return;
    }

    const form = document.getElementById('quizForm');
    const items = activeQuiz.items || activeQuiz.questions || [];
    
    let score = 0;
    let autoGradableCount = 0;
    const studentResponses = [];

    items.forEach((item, idx) => {
        if (item.type === 'header' || item.type === 'passage' || item.type === 'image') return;

        // Multiple Choice
        if (item.type === 'mcq' || (!item.type && item.question)) {
            autoGradableCount++;
            const selected = form.querySelector(`input[name="item_${idx}"]:checked`);
            const val = selected ? parseInt(selected.value, 10) : null;
            const isCorrect = (val === item.correct);
            if (isCorrect) score++;
            const expectedOption = (item.options && item.correct !== undefined) ? item.options[item.correct] : "";
            studentResponses.push({ 
                prompt: item.prompt || item.question, 
                response: val !== null && item.options ? item.options[val] : "No answer",
                isCorrect: isCorrect,
                expected: expectedOption
            });
        } 
        // Fill in Blank
        else if (item.type === 'fill') {
            autoGradableCount++;
            const input = form.querySelector(`[name="item_${idx}"]`);
            const rawVal = input ? input.value.trim() : "";
            const val = rawVal.toLowerCase();
            const isCorrect = (item.answers && item.answers.map(a => a.toLowerCase().trim()).includes(val));
            if (isCorrect) score++;
            studentResponses.push({ 
                prompt: item.prompt, 
                response: rawVal || "No answer",
                isCorrect: isCorrect,
                expected: (item.answers || []).join(' / ')
            });
        } 
        // Essay
        else if (item.type === 'essay') {
            const textarea = form.querySelector(`textarea[name="item_${idx}"]`);
            studentResponses.push({ 
                prompt: item.prompt, 
                response: textarea ? textarea.value.trim() : "No answer",
                isEssay: true
            });
        }
        // File Upload
        else if (item.type === 'fileupload') {
            const fileUrlInput = form.querySelector(`input[name="item_${idx}_fileUrl"]`);
            const fileNameInput = form.querySelector(`input[name="item_${idx}_fileName"]`);
            const linkInput = form.querySelector(`input[name="item_${idx}_link"]`);
            const fileUrl = fileUrlInput ? fileUrlInput.value.trim() : "";
            const fileName = fileNameInput ? fileNameInput.value.trim() : "";
            const linkVal = linkInput ? linkInput.value.trim() : "";
            const finalAnswer = fileUrl || linkVal || "No file or link submitted";

            studentResponses.push({ 
                prompt: item.prompt, 
                response: finalAnswer,
                fileUrl: fileUrl || (linkVal && (linkVal.startsWith('http://') || linkVal.startsWith('https://')) ? linkVal : ''),
                fileName: fileName || (fileUrl ? 'Student File' : (linkVal ? 'Link' : '')),
                link: linkVal,
                isFileUpload: true
            });
        }
        // Matching
        else if (item.type === 'matching') {
            autoGradableCount++;
            let correctMatches = 0;
            (item.lefts || []).forEach((left, lIdx) => {
                const select = form.querySelector(`select[name="item_${idx}_${lIdx}"]`);
                if (select && item.rights && select.value === item.rights[lIdx]) {
                    correctMatches++;
                }
            });
            const isCorrect = (item.lefts && correctMatches === item.lefts.length);
            if (isCorrect) score++;
            studentResponses.push({ 
                prompt: item.prompt, 
                response: `${correctMatches}/${(item.lefts || []).length} pairs matched`,
                isCorrect: isCorrect,
                expected: (item.lefts || []).map((l, i) => `${l} → ${(item.rights || [])[i]}`).join(', ')
            });
        }
    });

    try {
        const submitBtn = document.getElementById('submitQuizBtn');
        submitBtn.innerText = "Submitting Assessment...";
        submitBtn.disabled = true;

        // Save complete submission payload to Firestore quiz_results
        await addDoc(collection(db, "quiz_results"), {
            studentCode: currentStudent.code,
            studentName: currentStudent.studentName || 'Student',
            quizId: activeQuiz.id || null,
            quizTitle: activeQuiz.title || 'Online Quiz',
            subject: activeQuiz.subject || "General",
            score: score,
            totalAutoGradable: autoGradableCount,
            responses: studentResponses,
            submittedAt: new Date().toISOString()
        });

        // If this was a live quiz session, update the participant doc in Firestore
        if (activeLiveQuizData && activeQuiz.id) {
            try {
                const studentCode = String(currentStudent.code || currentStudent.studentCode || currentStudent.id || '').trim().toUpperCase();
                if (studentCode) {
                    await setDoc(doc(db, "live_quizzes", activeQuiz.id, "participants", studentCode), {
                        submitted: true,
                        score: score,
                        submittedAt: new Date().toISOString()
                    }, { merge: true });
                }
            } catch (e) {
                console.warn("Could not update live participant submitted state:", e);
            }
        }

        if (activeLiveSessionUnsubscribe) activeLiveSessionUnsubscribe();
        if (livePresenceInterval) clearInterval(livePresenceInterval);
        if (liveStudentTimerInterval) clearInterval(liveStudentTimerInterval);
        if (liveAnswerSyncTimeout) clearTimeout(liveAnswerSyncTimeout);
        activeLiveQuizData = null;
        isForcedSubmit = false;
        document.getElementById('liveQuizStudentHeaderBar')?.classList.add('hidden');

        document.getElementById('takeQuizSection').classList.add('hidden');
        document.getElementById('scoreSummary').innerText = `You scored ${score} out of ${autoGradableCount} points!`;
        document.getElementById('resultSection').classList.remove('hidden');
        triggerCelebration();
        attachRippleEffect('button, .action-btn');

    } catch (err) {
        alert("Error submitting quiz: " + err.message);
        const submitBtn = document.getElementById('submitQuizBtn');
        submitBtn.innerText = "Submit Assessment";
        submitBtn.disabled = false;
    }
});

// Enforce Chat Room disabled on quiz.html
function enforceQuizChatDisabled() {
    const chatBtn = document.getElementById('portalFloatingChatBtn');
    if (chatBtn) {
        chatBtn.classList.add('disabled-quiz-chat');
        chatBtn.disabled = true;
        chatBtn.setAttribute('disabled', 'true');
        chatBtn.setAttribute('aria-disabled', 'true');
        chatBtn.style.pointerEvents = 'none';
        chatBtn.style.cursor = 'not-allowed';
        chatBtn.style.background = '#64748b';
        chatBtn.style.boxShadow = 'none';
        chatBtn.style.opacity = '0.75';
        chatBtn.title = 'Chat is disabled';
        const span = chatBtn.querySelector('span:not(.portal-unread-badge)');
        if (span) span.innerText = 'Chat is disabled';
        const badge = chatBtn.querySelector('#portalChatUnreadBadge');
        if (badge) badge.classList.add('hidden');
    }
}
enforceQuizChatDisabled();
setTimeout(enforceQuizChatDisabled, 300);
setTimeout(enforceQuizChatDisabled, 1200);