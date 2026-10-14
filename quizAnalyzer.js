// quizAnalyzer.js - Deep Quiz Analysis & Response Evaluation Controller
import { db } from "./firebase.js";
import { renderRichHtml, stripHtml } from "./utils.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global State
const state = {
    quizId: '',
    quizTitle: '',
    selectedClasses: [],
    quizData: null,
    questions: [], // Array of question objects: { id, index, prompt, type, answerKey, points, originalItem }
    maxScore: 100,
    classData: {}, // { "Grade 9A": [ { student, submission, grades: { [qIdx]: true/false/null }, responsesText: {}, totalCorrect, totalIncorrect, totalPoints, finalScore } ] }
    savedOverrides: {},
    analysisDone: false
};

// Modal State for Viewing Full Student Answer
window.activeModalState = {
    clsName: '',
    studentCode: '',
    qIndex: 1
};

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
state.quizId = urlParams.get('quizId') || '';
state.quizTitle = urlParams.get('title') || '';
const rawClasses = urlParams.get('classes') || '';
state.selectedClasses = rawClasses ? rawClasses.split(',').map(c => c.trim()).filter(Boolean) : [];

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initQuizAnalyzer();
    } catch (err) {
        console.error("Initialization error:", err);
        showErrorState("Failed to load quiz data: " + err.message);
    }
});

/**
 * Main Initialization Flow
 */
async function initQuizAnalyzer() {
    updateHeaderLoading("Loading quiz details...");

    // 1. Fetch Quiz Document
    let quizDocData = null;
    if (state.quizId) {
        try {
            const snap = await getDoc(doc(db, "quizzes", state.quizId));
            if (snap.exists()) {
                quizDocData = snap.data();
            }
        } catch (e) {
            console.warn("Could not fetch quiz by id:", e);
        }
    }

    if (!quizDocData && state.quizTitle) {
        try {
            const snap = await getDocs(query(collection(db, "quizzes"), where("title", "==", state.quizTitle)));
            if (!snap.empty) {
                quizDocData = snap.docs[0].data();
                if (!state.quizId) state.quizId = snap.docs[0].id;
            }
        } catch (e) {
            console.warn("Could not query quiz by title:", e);
        }
    }

    state.quizData = quizDocData || {};
    if (!state.quizTitle && quizDocData && quizDocData.title) {
        state.quizTitle = quizDocData.title;
    }

    // 2. Fallback for classes if none provided in URL
    if (state.selectedClasses.length === 0) {
        if (Array.isArray(quizDocData?.targetClassesList) && quizDocData.targetClassesList.length > 0) {
            state.selectedClasses = quizDocData.targetClassesList;
        } else if (quizDocData?.targetClass && !quizDocData.targetClass.toLowerCase().includes('all')) {
            state.selectedClasses = quizDocData.targetClass.split(',').map(c => c.trim()).filter(Boolean);
        } else {
            state.selectedClasses = ["Grade 9A", "Grade 9B"];
        }
    }

    // 3. Extract & Normalize Questions
    const rawItems = state.quizData.items || state.quizData.questions || [];
    const validQuestions = [];
    let qCounter = 1;

    rawItems.forEach((item, idx) => {
        // Skip informational layout blocks
        if (item.type === 'header' || item.type === 'passage' || item.type === 'image') return;

        let expectedAnswer = '';
        if (item.type === 'mcq' || (!item.type && item.question)) {
            if (Array.isArray(item.options) && item.correct !== undefined && item.options[item.correct]) {
                expectedAnswer = item.options[item.correct];
            } else {
                expectedAnswer = `Option ${item.correct !== undefined ? item.correct + 1 : '1'}`;
            }
        } else if (item.type === 'fill') {
            expectedAnswer = (item.answers || []).join(' / ') || 'Expected word';
        } else if (item.type === 'matching') {
            expectedAnswer = (item.lefts || []).map((l, i) => `${l} → ${(item.rights || [])[i]}`).join(', ');
        } else if (item.type === 'essay') {
            expectedAnswer = 'Open response / Teacher evaluated';
        } else {
            expectedAnswer = item.answer || item.correct || 'Expected Answer';
        }

        const pointWeight = Number(item.score || item.points || 1);

        validQuestions.push({
            id: `q_${qCounter}`,
            index: qCounter,
            prompt: item.prompt || item.question || `Question ${qCounter}`,
            type: item.type || 'mcq',
            answerKey: expectedAnswer,
            points: pointWeight > 0 ? pointWeight : 1,
            originalItem: item
        });
        qCounter++;
    });

    state.questions = validQuestions;

    // 4. Fetch Saved Overrides from Firestore (or localStorage fallback)
    await loadSavedOverrides();

    // 5. Fetch Submissions from quiz_results
    const submissionsMap = {};
    try {
        let subQuery;
        if (state.quizTitle) {
            subQuery = query(collection(db, "quiz_results"), where("quizTitle", "==", state.quizTitle));
        } else if (state.quizId) {
            subQuery = query(collection(db, "quiz_results"), where("quizId", "==", state.quizId));
        }

        if (subQuery) {
            const subSnap = await getDocs(subQuery);
            subSnap.forEach(d => {
                const data = d.data();
                const codeKey = (data.studentCode || '').toString().trim().toUpperCase();
                const nameKey = (data.studentName || '').toString().trim().toLowerCase();
                if (codeKey) submissionsMap[codeKey] = data;
                if (nameKey) submissionsMap[`name_${nameKey}`] = data;
            });
        }
    } catch (e) {
        console.warn("Could not query quiz_results:", e);
    }

    // Fallback: If no questions were found in quiz doc, try reconstructing from a student's responses
    if (state.questions.length === 0) {
        const sampleSub = Object.values(submissionsMap)[0];
        if (sampleSub && Array.isArray(sampleSub.responses)) {
            sampleSub.responses.forEach((resp, rIdx) => {
                state.questions.push({
                    id: `q_${rIdx + 1}`,
                    index: rIdx + 1,
                    prompt: resp.prompt || `Question ${rIdx + 1}`,
                    type: resp.isEssay ? 'essay' : 'mcq',
                    answerKey: resp.expected || 'Answer Key',
                    points: 1,
                    originalItem: null
                });
            });
        }
    }

    // 6. Fetch Students from students collection
    let studentsList = [];
    try {
        const studSnap = await getDocs(collection(db, "students"));
        studSnap.forEach(d => {
            studentsList.push({ id: d.id, ...d.data() });
        });
    } catch (e) {
        console.warn("Could not fetch students collection:", e);
    }

    // 7. Group Students by Selected Classes
    state.classData = {};
    state.selectedClasses.forEach(cls => {
        state.classData[cls] = [];
    });

    studentsList.forEach(s => {
        const sClass = (s.studentClass || s.class || s.Class || '').trim();
        const matchedClass = state.selectedClasses.find(c => c.toLowerCase() === sClass.toLowerCase());
        if (matchedClass) {
            const sCode = (s.code || s.studentCode || s.id || '').toString().trim().toUpperCase();
            const sName = s.studentName || s.name || 'Unknown Student';

            // Find matching submission
            const submission = submissionsMap[sCode] || submissionsMap[`name_${sName.toLowerCase()}`] || null;

            // Build student evaluation record
            const studentRecord = {
                id: s.id,
                code: sCode,
                name: sName,
                studentClass: matchedClass,
                submission: submission,
                grades: {}, // { 1: true/false/null, 2: ... }
                responsesText: {}, // { 1: "Student answer", 2: ... }
                totalCorrect: 0,
                totalIncorrect: 0,
                totalPoints: 0,
                finalScore: 0
            };

            // Pre-populate question responses & evaluate against Answer Key
            state.questions.forEach((q, idx) => {
                const qNum = q.index;
                let ansText = "No answer";
                let isCorr = null;

                if (submission && Array.isArray(submission.responses) && submission.responses[idx]) {
                    const r = submission.responses[idx];
                    ansText = r.response || "No answer";
                    
                    // If submission already has explicit boolean grade, start with it
                    if (r.isCorrect === true || r.isCorrect === false) {
                        isCorr = r.isCorrect;
                    } else {
                        // Automatically evaluate against answer key!
                        isCorr = evaluateAnswer(ansText, q);
                    }
                }

                // If isCorr is still null and ansText is valid, auto-check against answer key!
                if (isCorr === null && ansText && ansText !== "No answer") {
                    isCorr = evaluateAnswer(ansText, q);
                }

                // Saved manual overrides from teacher take precedence
                if (state.savedOverrides.students && state.savedOverrides.students[sCode] && state.savedOverrides.students[sCode][qNum] !== undefined) {
                    isCorr = state.savedOverrides.students[sCode][qNum];
                }

                studentRecord.responsesText[qNum] = ansText;
                studentRecord.grades[qNum] = isCorr;
            });

            state.classData[matchedClass].push(studentRecord);
        }
    });

    // If a class has zero students from the DB, populate from submission records if any
    Object.keys(state.classData).forEach(cls => {
        if (state.classData[cls].length === 0) {
            Object.values(submissionsMap).forEach(sub => {
                const subClass = (sub.studentClass || sub.class || '').trim();
                if (subClass && subClass.toLowerCase() === cls.toLowerCase()) {
                    const sCode = (sub.studentCode || '').toString().trim().toUpperCase();
                    const sName = sub.studentName || 'Student';
                    const rec = {
                        id: sCode,
                        code: sCode,
                        name: sName,
                        studentClass: cls,
                        submission: sub,
                        grades: {},
                        responsesText: {},
                        totalCorrect: 0,
                        totalIncorrect: 0,
                        totalPoints: 0,
                        finalScore: 0
                    };
                    state.questions.forEach((q, idx) => {
                        const qNum = q.index;
                        const r = sub.responses ? sub.responses[idx] : null;
                        const ans = r?.response || "No answer";
                        rec.responsesText[qNum] = ans;
                        
                        let isCorr = (r?.isCorrect === true || r?.isCorrect === false) ? r.isCorrect : evaluateAnswer(ans, q);
                        if (state.savedOverrides.students && state.savedOverrides.students[sCode] && state.savedOverrides.students[sCode][qNum] !== undefined) {
                            isCorr = state.savedOverrides.students[sCode][qNum];
                        }
                        rec.grades[qNum] = isCorr;
                    });
                    state.classData[cls].push(rec);
                }
            });
        }
        // Sort students alphabetically
        state.classData[cls].sort((a, b) => a.name.localeCompare(b.name));
    });

    // 8. Calculate Initial Scores
    recalculateAllScores();

    // 9. Render Page Elements
    renderPageHeader();
    renderQuestionConfig();
    renderClassTables();

    // Attach listeners
    setupEventListeners();
}

/**
 * Intelligent Answer Auto-Checker
 * Compares student response against question answer key, acceptable variants, and quiz item definition.
 */
function evaluateAnswer(studentAns, question) {
    if (!studentAns || studentAns === "No answer" || studentAns.toString().trim() === "") {
        return null;
    }

    const normAns = studentAns.toString().trim().toLowerCase();
    if (!normAns) return null;

    const orig = question.originalItem || {};

    // 1. If Fill in the blanks: check original answers list
    if (Array.isArray(orig.answers) && orig.answers.length > 0) {
        const acceptable = orig.answers.map(a => (a || '').toString().trim().toLowerCase());
        if (acceptable.includes(normAns)) return true;
    }

    // 2. Check question.answerKey (allows multiple acceptable variants split by '/', ',', ';', '|')
    const key = (question.answerKey || '').toString().trim();
    if (key && key.toLowerCase() !== 'open response / teacher evaluated' && key.toLowerCase() !== 'expected answer') {
        // Split variants: e.g. "led / lead" -> ["led", "lead"]
        const keyVariants = key.split(/[\/,;|]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
        if (keyVariants.includes(normAns)) {
            return true;
        }
    }

    // 3. For Multiple Choice (MCQ)
    if (orig.type === 'mcq' || question.type === 'mcq') {
        // Match against correct option string
        if (Array.isArray(orig.options) && orig.correct !== undefined) {
            const correctOpt = (orig.options[orig.correct] || '').toString().trim().toLowerCase();
            if (correctOpt && normAns === correctOpt) return true;
        }
        // Match against option index letter: 0 = 'a', 1 = 'b', etc.
        const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
        if (orig.correct !== undefined && normAns === letters[orig.correct]) return true;
    }

    // 4. For Matching items
    if (orig.type === 'matching') {
        const totalPairs = (orig.lefts || []).length;
        if (totalPairs > 0 && normAns.startsWith(`${totalPairs}/${totalPairs}`)) return true;
    }

    // 5. Essay questions require manual teacher grading
    if (orig.type === 'essay' || question.type === 'essay') {
        return null;
    }

    // If an answer was given and it doesn't match the key, it's incorrect
    return false;
}

/**
 * Auto-Check All Students With Current Answer Keys
 */
window.autoCheckAllWithAnswerKey = function(showNotice = true) {
    let evaluatedCount = 0;

    Object.keys(state.classData).forEach(cls => {
        state.classData[cls].forEach(student => {
            state.questions.forEach(q => {
                const ansText = student.responsesText[q.index];
                const autoGrade = evaluateAnswer(ansText, q);
                if (autoGrade !== null) {
                    student.grades[q.index] = autoGrade;
                    evaluatedCount++;
                }
            });
        });
    });

    recalculateAllScores();
    renderClassTables();

    if (showNotice) {
        showToast(`Auto-checked all student responses against current answer keys!`);
    }
    if (state.analysisDone) window.triggerAnalysis(false);
};

/**
 * Score Recalculation Engine
 * Formula: (Total Score Correct / Maximum Score) * 100
 */
function recalculateAllScores() {
    // 1. Calculate Maximum Score (sum of all question score weights)
    let maxPts = 0;
    state.questions.forEach(q => {
        maxPts += Number(q.points) || 1;
    });
    state.maxScore = maxPts > 0 ? maxPts : 1;

    const maxScoreEl = document.getElementById('statMaxScore');
    if (maxScoreEl) maxScoreEl.innerText = `${state.maxScore}`;

    const formulaMaxEl = document.getElementById('formulaMaxScore');
    if (formulaMaxEl) formulaMaxEl.innerText = `${state.maxScore}`;

    // 2. Calculate for each student in each class
    let allFinalScores = [];

    Object.keys(state.classData).forEach(cls => {
        state.classData[cls].forEach(student => {
            let correctCount = 0;
            let incorrectCount = 0;
            let earnedPoints = 0;

            state.questions.forEach(q => {
                const status = student.grades[q.index];
                const pts = Number(q.points) || 1;

                if (status === true) {
                    correctCount++;
                    earnedPoints += pts;
                } else if (status === false) {
                    incorrectCount++;
                }
            });

            student.totalCorrect = correctCount;
            student.totalIncorrect = incorrectCount;
            student.totalPoints = earnedPoints;

            // Apply Formula: (Total Score Correct / Maximum Score) * 100
            const rawScore = (earnedPoints / state.maxScore) * 100;
            student.finalScore = Math.min(100, Math.max(0, Math.round(rawScore * 10) / 10)); // 1 decimal place

            allFinalScores.push(student.finalScore);
        });
    });

    // Overall Average
    const overallAvgEl = document.getElementById('statOverallAvg');
    if (overallAvgEl) {
        if (allFinalScores.length > 0) {
            const avg = allFinalScores.reduce((a, b) => a + b, 0) / allFinalScores.length;
            overallAvgEl.innerText = `${avg.toFixed(1)}`;
        } else {
            overallAvgEl.innerText = '-';
        }
    }
}

/**
 * Page Header & Hero Banner
 */
function renderPageHeader() {
    const title = state.quizTitle || state.quizData?.title || 'Quiz Analyzer';
    const subject = state.quizData?.subject || 'English / General';

    document.title = `${title} - Quiz Analyzer`;

    const bannerTitle = document.getElementById('bannerQuizTitle');
    if (bannerTitle) bannerTitle.innerText = title;

    const headerSub = document.getElementById('headerSubjectBadge');
    if (headerSub) headerSub.innerText = subject;

    const bannerSub = document.getElementById('bannerSubject');
    if (bannerSub) bannerSub.innerText = `Subject: ${subject}`;

    const bannerClasses = document.getElementById('bannerClassesText');
    if (bannerClasses) bannerClasses.innerText = `Classes: ${state.selectedClasses.join(', ')}`;

    const statQuestions = document.getElementById('statTotalQuestions');
    if (statQuestions) statQuestions.innerText = `${state.questions.length}`;

    let totalStudentsCount = 0;
    Object.values(state.classData).forEach(arr => totalStudentsCount += arr.length);
    const statStudents = document.getElementById('statTotalStudents');
    if (statStudents) statStudents.innerText = `${totalStudentsCount}`;
}

/**
 * Question Configuration Grid
 */
function renderQuestionConfig() {
    const container = document.getElementById('questionConfigGrid');
    if (!container) return;

    if (state.questions.length === 0) {
        container.innerHTML = `<div style="color:#64748b; font-size:13px; grid-column:1/-1;">No questions found for this quiz.</div>`;
        return;
    }

    container.innerHTML = state.questions.map(q => `
        <div class="q-config-card">
            <div class="q-config-header">
                <span class="q-config-label">Question ${q.index}</span>
                <span style="font-size: 11px; color:#64748b; font-weight:700; text-transform:uppercase;">${q.type}</span>
            </div>
            <div class="q-config-prompt" title="${escapeHtml(stripHtml(q.prompt))}">
                ${renderRichHtml(q.prompt)}
            </div>
            <div class="q-config-fields">
                <div>
                    <label class="q-field-label">Answer Key</label>
                    <input type="text" class="q-input" value="${escapeHtml(q.answerKey)}" 
                        onchange="window.updateAnswerKey(${q.index}, this.value)" 
                        placeholder="Expected answer key">
                </div>
                <div>
                    <label class="q-field-label">Score Weight</label>
                    <input type="number" class="q-input" value="${q.points}" min="0.5" step="0.5" 
                        onchange="window.updateQuestionWeight(${q.index}, this.value)" 
                        style="text-align:center;">
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Render Per-Class Tables
 * Exact format requested:
 * Class Name
 * | No | Name | Question 1 | Question 2 | ... | Total Correct | Total Incorrect | Final Score |
 */
function renderClassTables() {
    const container = document.getElementById('classesTablesContainer');
    if (!container) return;

    if (state.selectedClasses.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;">No classes selected.</div>`;
        return;
    }

    container.innerHTML = state.selectedClasses.map(clsName => {
        const students = state.classData[clsName] || [];
        const studentCount = students.length;
        const submittedCount = students.filter(s => s.submission !== null).length;

        // Class average
        const avg = studentCount > 0 ? (students.reduce((acc, s) => acc + s.finalScore, 0) / studentCount).toFixed(1) : '0.0';

        return `
            <div class="class-table-card" id="card-class-${escapeId(clsName)}">
                <!-- Class Card Header -->
                <div class="class-header-bar">
                    <div class="class-header-title">
                        <span class="class-name-badge">${escapeHtml(clsName)}</span>
                        <span class="class-stats-pill">${studentCount} Students</span>
                        <span class="class-stats-pill" style="background:#eff6ff; color:#1e5eff; border-color:#bfdbfe;">${submittedCount} Submitted</span>
                        <span class="class-stats-pill" id="class-avg-pill-${escapeId(clsName)}" style="background:#ecfdf5; color:#065f46; border-color:#a7f3d0; font-weight:800;">Class Avg: ${avg}</span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button type="button" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;" onclick="window.bulkMarkClass('${escapeJs(clsName)}', true)">
                            ✓ Mark All Correct
                        </button>
                        <div class="class-search-box">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" placeholder="Search student in ${escapeHtml(clsName)}..." oninput="window.filterClassTable('${escapeJs(clsName)}', this.value)">
                        </div>
                    </div>
                </div>

                <!-- Responsive Table -->
                <div class="table-responsive">
                    <table class="analyzer-table" id="table-class-${escapeId(clsName)}">
                        <thead>
                            <tr>
                                <th class="col-no">No</th>
                                <th class="col-name">Name</th>
                                ${state.questions.map(q => `
                                    <th class="col-q" title="${escapeHtml(stripHtml(q.prompt))}">
                                        <div>Question ${q.index}</div>
                                        <div style="font-size:10px; font-weight:600; color:#94a3b8; text-transform:none;">(${q.points} pt)</div>
                                    </th>
                                `).join('')}
                                <th class="col-summary">Total Correct</th>
                                <th class="col-summary">Total Incorrect</th>
                                <th class="col-score">Final Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderClassTableRows(clsName, students)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Render individual rows for a class table
 */
function renderClassTableRows(clsName, students) {
    if (students.length === 0) {
        return `<tr><td colspan="${state.questions.length + 5}" style="padding: 30px; color:#64748b;">No students found enrolled in ${escapeHtml(clsName)}.</td></tr>`;
    }

    return students.map((s, idx) => {
        const scoreClass = s.finalScore >= 80 ? 'score-high' : (s.finalScore >= 60 ? 'score-mid' : 'score-low');

        return `
            <tr id="row-${escapeId(s.code)}" data-student-name="${escapeHtml(s.name.toLowerCase())}" data-student-code="${escapeHtml(s.code.toLowerCase())}">
                <td class="col-no" style="font-weight:700; color:#64748b;">${idx + 1}</td>
                <td class="col-name">
                    <div class="student-name-box">
                        <span class="student-fullname">${escapeHtml(s.name)}</span>
                        <span class="student-code-tag">${escapeHtml(s.code)}</span>
                    </div>
                </td>
                ${state.questions.map(q => {
                    const qNum = q.index;
                    const ansText = s.responsesText[qNum] || "No answer";
                    const isCorr = s.grades[qNum];
                    
                    let btnClass = 'unanswered';
                    let btnLabel = '- Blank';
                    if (isCorr === true) {
                        btnClass = 'correct';
                        btnLabel = '✓ Correct';
                    } else if (isCorr === false) {
                        btnClass = 'incorrect';
                        btnLabel = '✗ Incorrect';
                    }

                    return `
                        <td>
                            <div class="q-cell-content">
                                <span class="student-answer-text" 
                                    title="Click to view full answer & grade details"
                                    onclick="window.openAnswerModal('${escapeJs(clsName)}', '${escapeJs(s.code)}', ${qNum})">
                                    ${escapeHtml(ansText)}
                                </span>
                                <button type="button" 
                                    class="toggle-grade-btn ${btnClass}" 
                                    id="btn-grade-${escapeId(s.code)}-${qNum}"
                                    onclick="window.toggleStudentGrade('${escapeJs(clsName)}', '${escapeJs(s.code)}', ${qNum})"
                                    title="Click to toggle Correct / Incorrect">
                                    ${btnLabel}
                                </button>
                            </div>
                        </td>
                    `;
                }).join('')}
                <td class="col-summary">
                    <span class="summary-count-badge badge-correct-count" id="correct-count-${escapeId(s.code)}">${s.totalCorrect}</span>
                </td>
                <td class="col-summary">
                    <span class="summary-count-badge badge-incorrect-count" id="incorrect-count-${escapeId(s.code)}">${s.totalIncorrect}</span>
                </td>
                <td class="col-score">
                    <span class="final-score-pill ${scoreClass}" id="final-score-${escapeId(s.code)}">${s.finalScore.toFixed(1)}</span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Interactive Grade Toggle
 * Teacher clicks a button in student row -> toggles between Correct (true) and Incorrect (false)
 */
window.toggleStudentGrade = function(clsName, studentCode, qIndex) {
    const classStudents = state.classData[clsName];
    if (!classStudents) return;

    const student = classStudents.find(s => s.code === studentCode);
    if (!student) return;

    const currentGrade = student.grades[qIndex];
    let nextGrade = true;

    // Cycle: true -> false -> true
    if (currentGrade === true) {
        nextGrade = false;
    } else if (currentGrade === false) {
        nextGrade = true;
    } else {
        nextGrade = true;
    }

    setStudentGradeValue(clsName, student, qIndex, nextGrade);
};

/**
 * Set a student's grade value and recalculate UI & scores
 */
function setStudentGradeValue(clsName, student, qIndex, newGrade) {
    student.grades[qIndex] = newGrade;

    // Update state overrides
    if (!state.savedOverrides.students) state.savedOverrides.students = {};
    if (!state.savedOverrides.students[student.code]) state.savedOverrides.students[student.code] = {};
    state.savedOverrides.students[student.code][qIndex] = newGrade;

    // Update UI button immediately
    const btn = document.getElementById(`btn-grade-${escapeId(student.code)}-${qIndex}`);
    if (btn) {
        if (newGrade === true) {
            btn.className = `toggle-grade-btn correct`;
            btn.innerHTML = `✓ Correct`;
        } else if (newGrade === false) {
            btn.className = `toggle-grade-btn incorrect`;
            btn.innerHTML = `✗ Incorrect`;
        } else {
            btn.className = `toggle-grade-btn unanswered`;
            btn.innerHTML = `- Blank`;
        }
    }

    // Recalculate Student Row Scores
    let correctCount = 0;
    let incorrectCount = 0;
    let earnedPts = 0;

    state.questions.forEach(q => {
        const st = student.grades[q.index];
        const pts = Number(q.points) || 1;
        if (st === true) {
            correctCount++;
            earnedPts += pts;
        } else if (st === false) {
            incorrectCount++;
        }
    });

    student.totalCorrect = correctCount;
    student.totalIncorrect = incorrectCount;
    student.totalPoints = earnedPts;

    // Formula: (Total Score Correct / Maximum Score) * 100
    const rawScore = (earnedPts / state.maxScore) * 100;
    student.finalScore = Math.min(100, Math.max(0, Math.round(rawScore * 10) / 10));

    // Update Row cells
    const corrBadge = document.getElementById(`correct-count-${escapeId(student.code)}`);
    if (corrBadge) corrBadge.innerText = `${correctCount}`;

    const incorrBadge = document.getElementById(`incorrect-count-${escapeId(student.code)}`);
    if (incorrBadge) incorrBadge.innerText = `${incorrectCount}`;

    const scorePill = document.getElementById(`final-score-${escapeId(student.code)}`);
    if (scorePill) {
        scorePill.innerText = student.finalScore.toFixed(1);
        scorePill.className = `final-score-pill ${student.finalScore >= 80 ? 'score-high' : (student.finalScore >= 60 ? 'score-mid' : 'score-low')}`;
    }

    // Update Class Average pill
    const classStudents = state.classData[clsName] || [];
    const avg = classStudents.length > 0 ? (classStudents.reduce((a, s) => a + s.finalScore, 0) / classStudents.length).toFixed(1) : '0.0';
    const classAvgPill = document.getElementById(`class-avg-pill-${escapeId(clsName)}`);
    if (classAvgPill) classAvgPill.innerText = `Class Avg: ${avg}`;

    // Update overall average in hero banner
    let allFinal = [];
    Object.values(state.classData).forEach(arr => arr.forEach(s => allFinal.push(s.finalScore)));
    const overallAvgEl = document.getElementById('statOverallAvg');
    if (overallAvgEl && allFinal.length > 0) {
        overallAvgEl.innerText = (allFinal.reduce((a, b) => a + b, 0) / allFinal.length).toFixed(1);
    }

    // If modal is open for this student & question, refresh modal UI
    if (window.activeModalState.studentCode === student.code && window.activeModalState.qIndex === qIndex) {
        updateModalGradeButtons(newGrade);
    }

    // If analysis section is visible, update it dynamically!
    if (state.analysisDone) {
        window.triggerAnalysis(false);
    }
}

/**
 * Bulk Mark Class All Correct
 */
window.bulkMarkClass = function(clsName, makeCorrect = true) {
    const classStudents = state.classData[clsName];
    if (!classStudents) return;

    classStudents.forEach(student => {
        state.questions.forEach(q => {
            student.grades[q.index] = makeCorrect;
            if (!state.savedOverrides.students) state.savedOverrides.students = {};
            if (!state.savedOverrides.students[student.code]) state.savedOverrides.students[student.code] = {};
            state.savedOverrides.students[student.code][q.index] = makeCorrect;
        });
    });

    recalculateAllScores();
    renderClassTables();
    showToast(`Marked all answers in ${clsName} as ${makeCorrect ? 'Correct' : 'Incorrect'}.`);
    if (state.analysisDone) window.triggerAnalysis(false);
};

/**
 * Filter Class Table by student name/code
 */
window.filterClassTable = function(clsName, searchVal) {
    const table = document.getElementById(`table-class-${escapeId(clsName)}`);
    if (!table) return;

    const term = (searchVal || '').toLowerCase().trim();
    const rows = table.querySelectorAll('tbody tr[data-student-name]');

    rows.forEach(r => {
        const name = r.getAttribute('data-student-name') || '';
        const code = r.getAttribute('data-student-code') || '';
        if (name.includes(term) || code.includes(term)) {
            r.style.display = '';
        } else {
            r.style.display = 'none';
        }
    });
};

/**
 * Update Answer Key Text & Auto Re-Check Question
 */
window.updateAnswerKey = function(qIndex, newKey) {
    const q = state.questions.find(item => item.index === qIndex);
    if (!q) return;

    q.answerKey = newKey.trim();
    if (!state.savedOverrides.questions) state.savedOverrides.questions = {};
    if (!state.savedOverrides.questions[qIndex]) state.savedOverrides.questions[qIndex] = {};
    state.savedOverrides.questions[qIndex].answerKey = q.answerKey;

    // Automatically re-evaluate all students for this question against the updated key
    Object.keys(state.classData).forEach(cls => {
        state.classData[cls].forEach(student => {
            const ansText = student.responsesText[q.index];
            const autoGrade = evaluateAnswer(ansText, q);
            if (autoGrade !== null) {
                student.grades[q.index] = autoGrade;
            }
        });
    });

    recalculateAllScores();
    renderClassTables();

    showToast(`Question ${qIndex} answer key updated & student answers re-checked!`);
    if (state.analysisDone) window.triggerAnalysis(false);
};

/**
 * Update Question Score Weight
 */
window.updateQuestionWeight = function(qIndex, newPoints) {
    const q = state.questions.find(item => item.index === qIndex);
    if (!q) return;

    const parsed = parseFloat(newPoints);
    q.points = (!isNaN(parsed) && parsed > 0) ? parsed : 1;

    if (!state.savedOverrides.questions) state.savedOverrides.questions = {};
    if (!state.savedOverrides.questions[qIndex]) state.savedOverrides.questions[qIndex] = {};
    state.savedOverrides.questions[qIndex].points = q.points;

    recalculateAllScores();
    renderClassTables();

    showToast(`Question ${qIndex} score weight updated to ${q.points} pt. Scores recalculated!`);
    if (state.analysisDone) window.triggerAnalysis(false);
};

/**
 * Toggle Answer Key Setup Panel
 */
window.toggleAnswerKeyPanel = function() {
    const panel = document.getElementById('answerKeyPanel');
    if (!panel) return;

    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';

    if (isHidden) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

/**
 * ==========================================================================
 * STUDENT ANSWER DETAILS POPUP MODAL
 * ==========================================================================
 */
window.openAnswerModal = function(clsName, studentCode, qIndex) {
    window.activeModalState = {
        clsName: clsName,
        studentCode: studentCode,
        qIndex: qIndex
    };

    renderModalContent();

    const modal = document.getElementById('answerDetailModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.closeAnswerModal = function() {
    const modal = document.getElementById('answerDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.handleModalOverlayClick = function(event) {
    if (event.target && event.target.id === 'answerDetailModal') {
        window.closeAnswerModal();
    }
};

/**
 * Populate Content Inside Answer Detail Modal
 */
function renderModalContent() {
    const { clsName, studentCode, qIndex } = window.activeModalState;
    const classStudents = state.classData[clsName] || [];
    const student = classStudents.find(s => s.code === studentCode);
    const question = state.questions.find(q => q.index === qIndex);

    if (!student || !question) return;

    const tagEl = document.getElementById('modalStudentClassTag');
    const nameEl = document.getElementById('modalStudentNameTitle');
    const qLabelEl = document.getElementById('modalQuestionLabel');
    const qTypeEl = document.getElementById('modalQuestionType');
    const qPromptEl = document.getElementById('modalQuestionPrompt');
    const keyBoxEl = document.getElementById('modalAnswerKeyBox');
    const respBoxEl = document.getElementById('modalStudentResponseBox');
    const prevBtn = document.getElementById('modalPrevBtn');
    const nextBtn = document.getElementById('modalNextBtn');

    if (tagEl) tagEl.innerText = `${clsName} • Student ID: ${student.code}`;
    if (nameEl) nameEl.innerText = student.name;
    if (qLabelEl) qLabelEl.innerText = `QUESTION ${question.index} (${question.points} pt${question.points > 1 ? 's' : ''})`;
    if (qTypeEl) qTypeEl.innerText = question.type.toUpperCase();
    if (qPromptEl) qPromptEl.innerText = question.prompt;
    if (keyBoxEl) keyBoxEl.innerText = question.answerKey || 'Expected answer';

    const currentResp = student.responsesText[qIndex] || "No answer submitted";
    if (respBoxEl) {
        respBoxEl.innerText = currentResp;
        if (!currentResp || currentResp === "No answer" || currentResp === "No answer submitted") {
            respBoxEl.style.color = '#94a3b8';
            respBoxEl.style.fontStyle = 'italic';
        } else {
            respBoxEl.style.color = '#0f172a';
            respBoxEl.style.fontStyle = 'normal';
        }
    }

    // Prev / Next button state
    if (prevBtn) {
        prevBtn.disabled = qIndex <= 1;
        prevBtn.style.opacity = qIndex <= 1 ? '0.45' : '1';
    }
    if (nextBtn) {
        nextBtn.disabled = qIndex >= state.questions.length;
        nextBtn.style.opacity = qIndex >= state.questions.length ? '0.45' : '1';
    }

    // Update grade choice buttons
    updateModalGradeButtons(student.grades[qIndex]);
}

function updateModalGradeButtons(currentGrade) {
    const btnCorrect = document.getElementById('btnModalChoiceCorrect');
    const btnIncorrect = document.getElementById('btnModalChoiceIncorrect');
    const badgeEl = document.getElementById('modalResponseStatusBadge');

    if (btnCorrect) {
        btnCorrect.classList.toggle('active', currentGrade === true);
    }
    if (btnIncorrect) {
        btnIncorrect.classList.toggle('active', currentGrade === false);
    }

    if (badgeEl) {
        if (currentGrade === true) {
            badgeEl.innerHTML = `<span style="padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:800; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">✓ CORRECT</span>`;
        } else if (currentGrade === false) {
            badgeEl.innerHTML = `<span style="padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:800; background:#fef2f2; color:#991b1b; border:1px solid #fecaca;">✗ INCORRECT</span>`;
        } else {
            badgeEl.innerHTML = `<span style="padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:800; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;">UNGRADED / BLANK</span>`;
        }
    }
}

/**
 * Set Grade Directly From Inside Answer Detail Modal
 */
window.setModalResponseGrade = function(isCorrect) {
    const { clsName, studentCode, qIndex } = window.activeModalState;
    const classStudents = state.classData[clsName] || [];
    const student = classStudents.find(s => s.code === studentCode);

    if (!student) return;

    setStudentGradeValue(clsName, student, qIndex, isCorrect);
};

/**
 * Navigate to Prev / Next Question in Modal
 */
window.navigateModalQuestion = function(delta) {
    const newIdx = window.activeModalState.qIndex + delta;
    if (newIdx >= 1 && newIdx <= state.questions.length) {
        window.activeModalState.qIndex = newIdx;
        renderModalContent();
    }
};

/**
 * DEEP ANALYTICS ENGINE ("Analyze" Button)
 * Computes:
 * 1. Highest score for each class (and top students)
 * 2. Average score for each class
 * 3. Lowest score for each class
 * 4. Question with total correct answers the most
 * 5. Question with total incorrect answers the most
 * 6. Item analysis accuracy breakdown
 */
window.triggerAnalysis = function(scrollToSection = true) {
    const analysisSection = document.getElementById('analysisSection');
    const cardsGrid = document.getElementById('analyticsCardsGrid');
    const breakdownBody = document.getElementById('breakdownTableBody');

    if (!analysisSection || !cardsGrid || !breakdownBody) return;

    state.analysisDone = true;
    analysisSection.style.display = 'block';

    // 1. Calculate Per-Class Metrics
    const classMetrics = {};
    let allEvaluatedStudents = [];

    state.selectedClasses.forEach(cls => {
        const students = state.classData[cls] || [];
        allEvaluatedStudents = allEvaluatedStudents.concat(students);

        if (students.length === 0) {
            classMetrics[cls] = { highest: 0, topStudents: [], average: 0, lowest: 0 };
            return;
        }

        let maxScore = -1;
        let minScore = 999;
        let totalScore = 0;

        students.forEach(s => {
            if (s.finalScore > maxScore) maxScore = s.finalScore;
            if (s.finalScore < minScore) minScore = s.finalScore;
            totalScore += s.finalScore;
        });

        const topStudents = students.filter(s => s.finalScore === maxScore).map(s => s.name);
        const avg = totalScore / students.length;

        classMetrics[cls] = {
            highest: maxScore >= 0 ? maxScore : 0,
            topStudents: topStudents,
            average: avg,
            lowest: minScore < 999 ? minScore : 0
        };
    });

    // 2. Question-by-Question Statistics
    const questionStats = [];
    const totalStudentsCount = allEvaluatedStudents.length;

    state.questions.forEach(q => {
        const qNum = q.index;
        let correctCount = 0;
        let incorrectCount = 0;
        let blankCount = 0;

        allEvaluatedStudents.forEach(s => {
            const st = s.grades[qNum];
            if (st === true) correctCount++;
            else if (st === false) incorrectCount++;
            else blankCount++;
        });

        const correctPct = totalStudentsCount > 0 ? (correctCount / totalStudentsCount) * 100 : 0;
        const incorrectPct = totalStudentsCount > 0 ? (incorrectCount / totalStudentsCount) * 100 : 0;

        questionStats.push({
            question: q,
            correctCount,
            incorrectCount,
            blankCount,
            correctPct,
            incorrectPct
        });
    });

    // 3. Find Question with Most Correct & Most Incorrect
    let mostCorrectQ = null;
    let mostIncorrectQ = null;

    if (questionStats.length > 0) {
        mostCorrectQ = [...questionStats].sort((a, b) => b.correctCount - a.correctCount)[0];
        mostIncorrectQ = [...questionStats].sort((a, b) => b.incorrectCount - a.incorrectCount)[0];
    }

    // 4. Generate Metric Cards HTML
    let cardsHtml = '';

    // Class Performance Cards
    state.selectedClasses.forEach(cls => {
        const m = classMetrics[cls];
        const topNamesStr = m.topStudents.length > 0 ? m.topStudents.slice(0, 2).join(', ') + (m.topStudents.length > 2 ? ` +${m.topStudents.length - 2}` : '') : 'None';

        cardsHtml += `
            <div class="metric-card gold">
                <div class="metric-top">
                    <div>
                        <div class="metric-label">${escapeHtml(cls)} • Highest Score</div>
                        <div class="metric-value" style="color: #d97706;">${m.highest.toFixed(1)}</div>
                    </div>
                    <div class="metric-icon-wrap">🏆</div>
                </div>
                <div class="metric-detail">
                    Top Student: <strong>${escapeHtml(topNamesStr)}</strong>
                </div>
            </div>

            <div class="metric-card blue">
                <div class="metric-top">
                    <div>
                        <div class="metric-label">${escapeHtml(cls)} • Class Average</div>
                        <div class="metric-value" style="color: var(--primary);">${m.average.toFixed(1)}</div>
                    </div>
                    <div class="metric-icon-wrap">📊</div>
                </div>
                <div class="metric-detail">
                    Lowest: <strong>${m.lowest.toFixed(1)}</strong> • Total: <strong>${state.classData[cls].length} students</strong>
                </div>
            </div>
        `;
    });

    // Most Correct Question Card
    if (mostCorrectQ) {
        cardsHtml += `
            <div class="metric-card green">
                <div class="metric-top">
                    <div>
                        <div class="metric-label">Most Mastered Question</div>
                        <div class="metric-value" style="color: var(--success);">Q${mostCorrectQ.question.index}</div>
                    </div>
                    <div class="metric-icon-wrap">🎯</div>
                </div>
                <div class="metric-detail">
                    <strong>${mostCorrectQ.correctCount} / ${totalStudentsCount}</strong> students answered correctly 
                    (<strong>${mostCorrectQ.correctPct.toFixed(1)}%</strong> accuracy).
                </div>
            </div>
        `;
    }

    // Most Incorrect Question Card
    if (mostIncorrectQ) {
        cardsHtml += `
            <div class="metric-card red">
                <div class="metric-top">
                    <div>
                        <div class="metric-label">Most Challenging Question</div>
                        <div class="metric-value" style="color: var(--danger);">Q${mostIncorrectQ.question.index}</div>
                    </div>
                    <div class="metric-icon-wrap">⚠️</div>
                </div>
                <div class="metric-detail">
                    <strong>${mostIncorrectQ.incorrectCount} / ${totalStudentsCount}</strong> students missed this 
                    (<strong>${mostIncorrectQ.incorrectPct.toFixed(1)}%</strong> incorrect).
                </div>
            </div>
        `;
    }

    cardsGrid.innerHTML = cardsHtml;

    // 5. Generate Question Item Analysis Table Rows
    breakdownBody.innerHTML = questionStats.map(stat => {
        const q = stat.question;
        const accuracy = stat.correctPct;

        let diffBadge = '';
        if (accuracy >= 80) {
            diffBadge = `<span style="padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;">EASY</span>`;
        } else if (accuracy >= 50) {
            diffBadge = `<span style="padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; background: #fffbeb; color: #b45309; border: 1px solid #fde68a;">MODERATE</span>`;
        } else {
            diffBadge = `<span style="padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;">HARD</span>`;
        }

        return `
            <tr>
                <td style="font-weight: 800; color: var(--primary);">Q${q.index}</td>
                <td>
                    <div style="font-weight: 600; color: var(--slate-800); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(stripHtml(q.prompt))}">
                        ${renderRichHtml(q.prompt)}
                    </div>
                    <div style="font-size: 11px; color: var(--slate-500);">${q.type.toUpperCase()} • ${q.points} pt</div>
                </td>
                <td>
                    <span style="font-size: 12px; font-weight: 600; color: #047857; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; display: inline-block; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(q.answerKey)}">
                        ${escapeHtml(q.answerKey)}
                    </span>
                </td>
                <td style="text-align: center; font-weight: 700; color: #065f46;">
                    ${stat.correctCount} <span style="font-size:11px; color:#64748b;">(${stat.correctPct.toFixed(0)}%)</span>
                </td>
                <td style="text-align: center; font-weight: 700; color: #991b1b;">
                    ${stat.incorrectCount} <span style="font-size:11px; color:#64748b;">(${stat.incorrectPct.toFixed(0)}%)</span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="progress-bar-wrap" style="flex: 1;">
                            <div class="progress-bar-fill" style="width: ${accuracy}%;"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: 800; min-width: 42px; text-align: right; color: var(--slate-700);">
                            ${accuracy.toFixed(1)}%
                        </span>
                    </div>
                </td>
                <td style="text-align: center;">
                    ${diffBadge}
                </td>
            </tr>
        `;
    }).join('');

    // Smooth scroll down to analysis dashboard if requested
    if (scrollToSection) {
        analysisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

/**
 * Save Corrections & Overrides to Firestore & LocalStorage
 */
window.saveCorrections = async function() {
    const btn = document.getElementById('saveCorrectionsBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Saving...";
    }

    try {
        const payload = {
            quizId: state.quizId,
            quizTitle: state.quizTitle,
            questions: state.questions.map(q => ({
                index: q.index,
                answerKey: q.answerKey,
                points: q.points
            })),
            studentOverrides: state.savedOverrides.students || {},
            updatedAt: new Date().toISOString()
        };

        // Save to Firestore
        const docKey = state.quizId || encodeURIComponent(state.quizTitle || 'default');
        await setDoc(doc(db, "quiz_analyzer_evaluations", docKey), payload, { merge: true });

        // Save to LocalStorage fallback
        localStorage.setItem(`quiz_analyzer_${docKey}`, JSON.stringify(payload));

        showToast("Grading overrides & score weights saved successfully!");
    } catch (err) {
        console.warn("Could not save to Firestore, stored in local storage:", err);
        const docKey = state.quizId || encodeURIComponent(state.quizTitle || 'default');
        localStorage.setItem(`quiz_analyzer_${docKey}`, JSON.stringify({
            studentOverrides: state.savedOverrides.students || {},
            updatedAt: new Date().toISOString()
        }));
        showToast("Changes saved locally.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Save Changes</span>`;
        }
    }
};

/**
 * Load Saved Overrides from Firestore / localStorage
 */
async function loadSavedOverrides() {
    state.savedOverrides = { students: {}, questions: {} };
    const docKey = state.quizId || encodeURIComponent(state.quizTitle || 'default');

    try {
        const snap = await getDoc(doc(db, "quiz_analyzer_evaluations", docKey));
        if (snap.exists()) {
            const data = snap.data();
            if (data.studentOverrides) state.savedOverrides.students = data.studentOverrides;
            if (Array.isArray(data.questions)) {
                data.questions.forEach(savedQ => {
                    const match = state.questions.find(q => q.index === savedQ.index);
                    if (match) {
                        if (savedQ.answerKey !== undefined) match.answerKey = savedQ.answerKey;
                        if (savedQ.points !== undefined) match.points = Number(savedQ.points) || 1;
                    }
                });
            }
            return;
        }
    } catch (e) {
        console.warn("Could not read quiz_analyzer_evaluations:", e);
    }

    // Try localStorage fallback
    const local = localStorage.getItem(`quiz_analyzer_${docKey}`);
    if (local) {
        try {
            const parsed = JSON.parse(local);
            if (parsed.studentOverrides) state.savedOverrides.students = parsed.studentOverrides;
        } catch (e) {}
    }
}

/**
 * UI Helpers
 */
function updateHeaderLoading(msg) {
    const banner = document.getElementById('bannerQuizTitle');
    if (banner) banner.innerText = msg;
}

function showErrorState(msg) {
    const container = document.getElementById('classesTablesContainer');
    if (container) {
        container.innerHTML = `
            <div style="background:#ffffff; padding: 40px; border-radius: 16px; text-align: center; border: 1px solid #fecaca;">
                <div style="font-size: 18px; font-weight: 700; color: #b91c1c; margin-bottom: 8px;">Error Loading Quiz Analyzer</div>
                <div style="font-size: 13.5px; color: #64748b;">${escapeHtml(msg)}</div>
                <div style="margin-top: 18px;">
                    <a href="admin.html" class="btn btn-primary" style="text-decoration:none;">Return to Dashboard</a>
                </div>
            </div>
        `;
    }
}

function showToast(msg) {
    const toast = document.getElementById('toastNotice');
    const toastText = document.getElementById('toastMessage');
    if (!toast || !toastText) return;

    toastText.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
}

function setupEventListeners() {
    // Keyboard navigation in modal (Escape to close, Left/Right arrow to navigate)
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('answerDetailModal');
        if (!modal || modal.style.display !== 'flex') return;

        if (e.key === 'Escape') {
            window.closeAnswerModal();
        } else if (e.key === 'ArrowLeft') {
            window.navigateModalQuestion(-1);
        } else if (e.key === 'ArrowRight') {
            window.navigateModalQuestion(1);
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeId(str) {
    if (!str) return 'id';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}
