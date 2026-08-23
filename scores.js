import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeHtml } from "./utils.js";

let cachedExamScores = [];
let subjectComparisonChartInstance = null;
let subjectProgressChartInstance = null;
let activeProgressSubject = "ALL";
let unsubscribeScoresListener = null;

// --- THEME TOGGLE ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const mainThemeText = document.getElementById('mainThemeText');
const savedTheme = localStorage.getItem('appTheme') || 'light';

if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.add('dark-mode');
    if (mainThemeText) mainThemeText.innerText = 'Light Mode';
}

themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (mainThemeText) mainThemeText.innerText = isDark ? 'Light Mode' : 'Dark Mode';
    
    // Refresh charts with updated theme colors
    renderCharts();
});

// --- LOGOUT HANDLER ---
document.getElementById('studentLogoutBtn')?.addEventListener('click', () => {
    if (unsubscribeScoresListener) unsubscribeScoresListener();
    sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    localStorage.removeItem('loggedInStudentCode');
    window.location.href = "index.html";
});

// --- INITIALIZE REAL-TIME LISTENER ---
window.addEventListener('DOMContentLoaded', () => {
    const savedLoggedIn = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
    let studentCode = '';

    if (savedLoggedIn) {
        try {
            const session = JSON.parse(savedLoggedIn);
            studentCode = session.code || session.studentCode || session.id || '';
        } catch (e) {
            console.error(e);
        }
    }

    if (!studentCode) {
        studentCode = localStorage.getItem('loggedInStudentCode') || '';
    }

    if (!studentCode) {
        window.location.href = "index.html";
        return;
    }

    initRealTimeScoresListener(studentCode);
});

// --- REAL-TIME FIRESTORE LISTENER ---
function initRealTimeScoresListener(studentCode) {
    const scoreQuery = query(collection(db, "exam_scores"), where("studentCode", "==", studentCode));

    unsubscribeScoresListener = onSnapshot(scoreQuery, (snapshot) => {
        cachedExamScores = [];
        const optionsSet = new Set();
        const subjectsSet = new Set();

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            cachedExamScores.push({ id: docSnap.id, ...data });

            const title = data.examName || data.quizName;
            if (title) optionsSet.add(title);

            const subject = data.subject || 'General';
            if (subject) subjectsSet.add(subject);
        });

        // Populate Dropdowns
        updateDropdowns(optionsSet, subjectsSet);

        // Update Top 4 Metric Summaries & Subject Highlights
        updateSummaryMetrics();

        // Render Performance & Comparison Diagrams
        renderCharts();

        // Spotlight most recent or keep selected
        if (cachedExamScores.length > 0) {
            spotlightScore(cachedExamScores[0]);
        }

        // Render All Cards Grid
        const filterDropdown = document.getElementById('examScoreDropdown');
        renderScoreCards(filterDropdown?.value || "ALL");

    }, (error) => {
        console.error("Real-time exam scores error:", error);
    });
}

// --- POPULATE DROPDOWNS ---
function updateDropdowns(optionsSet, subjectsSet) {
    const filterDropdown = document.getElementById('examScoreDropdown');
    const currentFilterVal = filterDropdown?.value || "ALL";

    if (filterDropdown) {
        filterDropdown.innerHTML = '<option value="ALL">All Subjects / Exams</option>';
        Array.from(optionsSet).sort().forEach(item => {
            filterDropdown.innerHTML += `<option value="${item}">${item}</option>`;
        });
        if (Array.from(optionsSet).includes(currentFilterVal)) {
            filterDropdown.value = currentFilterVal;
        }
    }

    const progressFilter = document.getElementById('progressSubjectFilter');
    const currentProgressVal = progressFilter?.value || activeProgressSubject;

    if (progressFilter) {
        progressFilter.innerHTML = '<option value="ALL">All Subjects</option>';
        Array.from(subjectsSet).sort().forEach(subj => {
            progressFilter.innerHTML += `<option value="${subj}">${subj}</option>`;
        });
        if (Array.from(subjectsSet).includes(currentProgressVal) || currentProgressVal === "ALL") {
            progressFilter.value = currentProgressVal;
            activeProgressSubject = currentProgressVal;
        }
    }
}

// --- UPDATE SUMMARY STATS ---
function updateSummaryMetrics() {
    const totalCount = cachedExamScores.length;
    let totalSum = 0;
    const subjectMap = {};

    cachedExamScores.forEach(item => {
        const score = parseFloat(item.score) || 0;
        totalSum += score;

        const subject = item.subject || 'General';
        if (!subjectMap[subject]) {
            subjectMap[subject] = { sum: 0, count: 0, highest: 0 };
        }
        subjectMap[subject].sum += score;
        subjectMap[subject].count += 1;
        if (score > subjectMap[subject].highest) {
            subjectMap[subject].highest = score;
        }
    });

    const avg = totalCount > 0 ? (totalSum / totalCount).toFixed(1) : '-';
    document.getElementById('statTotalTests').innerText = totalCount;
    document.getElementById('statAverageScore').innerText = avg;

    // Determine Strongest & Focus Subject
    let bestSubjectName = '-';
    let bestSubjectAvg = -1;
    let worstSubjectName = '-';
    let worstSubjectAvg = 999;

    const subjectKeys = Object.keys(subjectMap);
    if (subjectKeys.length > 0) {
        subjectKeys.forEach(subj => {
            const sAvg = subjectMap[subj].sum / subjectMap[subj].count;
            if (sAvg > bestSubjectAvg) {
                bestSubjectAvg = sAvg;
                bestSubjectName = subj;
            }
            if (sAvg < worstSubjectAvg) {
                worstSubjectAvg = sAvg;
                worstSubjectName = subj;
            }
        });

        document.getElementById('statBestSubject').innerText = `${bestSubjectName} (${bestSubjectAvg.toFixed(1)})`;
        document.getElementById('statFocusSubject').innerText = `${worstSubjectName} (${worstSubjectAvg.toFixed(1)})`;
    } else {
        document.getElementById('statBestSubject').innerText = '-';
        document.getElementById('statFocusSubject').innerText = '-';
    }
}

// --- CHART RENDERING ENGINE (CHART.JS) ---
function renderCharts() {
    if (typeof Chart === 'undefined') return;

    const isDark = document.body.classList.contains('dark-theme') || document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    renderSubjectComparisonChart(isDark, textColor, gridColor);
    renderSubjectProgressChart(isDark, textColor, gridColor);
}

// Diagram 1: Subject Average & Mastery Comparison
function renderSubjectComparisonChart(isDark, textColor, gridColor) {
    const canvas = document.getElementById('subjectComparisonChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (subjectComparisonChartInstance) {
        subjectComparisonChartInstance.destroy();
    }

    if (cachedExamScores.length === 0) {
        return;
    }

    // Aggregate by Subject
    const subjectMap = {};
    cachedExamScores.forEach(item => {
        const subject = item.subject || 'General';
        const score = parseFloat(item.score) || 0;
        if (!subjectMap[subject]) {
            subjectMap[subject] = { sum: 0, count: 0 };
        }
        subjectMap[subject].sum += score;
        subjectMap[subject].count += 1;
    });

    const subjects = Object.keys(subjectMap).sort();
    const averages = subjects.map(s => (subjectMap[s].sum / subjectMap[s].count).toFixed(1));

    // Dynamic Color Coding based on score tier
    const bgColors = averages.map(val => {
        const num = parseFloat(val);
        if (num >= 85) return 'rgba(16, 185, 129, 0.85)'; // Emerald Green
        if (num >= 70) return 'rgba(245, 158, 11, 0.85)';  // Amber Gold
        return 'rgba(239, 68, 68, 0.85)';                 // Coral Red
    });

    const borderColors = averages.map(val => {
        const num = parseFloat(val);
        if (num >= 85) return '#10b981';
        if (num >= 70) return '#f59e0b';
        return '#ef4444';
    });

    subjectComparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subjects,
            datasets: [{
                label: 'Average Score',
                data: averages,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: subjects.length > 4 ? 22 : 32
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const subj = ctx.label;
                            const count = subjectMap[subj]?.count || 0;
                            return ` Avg Score: ${ctx.parsed.y} pts (${count} test${count > 1 ? 's' : ''})`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 11, weight: '600' },
                        stepSize: 20
                    },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 11.5, weight: '700' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// Diagram 2: Score Progress Timeline Chart
function renderSubjectProgressChart(isDark, textColor, gridColor) {
    const canvas = document.getElementById('subjectProgressChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (subjectProgressChartInstance) {
        subjectProgressChartInstance.destroy();
    }

    if (cachedExamScores.length === 0) {
        return;
    }

    // Filter tests by selected subject
    let filteredScores = [...cachedExamScores];
    if (activeProgressSubject && activeProgressSubject !== "ALL") {
        filteredScores = filteredScores.filter(s => s.subject === activeProgressSubject);
    }

    // Reverse for chronological order (oldest to newest)
    const chronologicalScores = [...filteredScores].reverse();

    const labels = chronologicalScores.map((s, idx) => {
        const name = s.examName || s.quizName || `Test ${idx + 1}`;
        return name.length > 14 ? name.substring(0, 12) + '…' : name;
    });

    const dataPoints = chronologicalScores.map(s => parseFloat(s.score) || 0);

    // Calculate Trend & Summary
    if (dataPoints.length > 0) {
        const latest = dataPoints[dataPoints.length - 1];
        const highest = Math.max(...dataPoints);
        document.getElementById('progressLatestScore').innerText = `${latest} pts`;
        document.getElementById('progressHighestScore').innerText = `${highest} pts`;

        const trendEl = document.getElementById('progressTrendStatus');
        if (dataPoints.length > 1) {
            const first = dataPoints[0];
            const diff = latest - first;
            if (diff > 0) {
                trendEl.innerHTML = `<span style="color: #10b981;">+${diff.toFixed(0)} pts ↗</span>`;
            } else if (diff < 0) {
                trendEl.innerHTML = `<span style="color: #ef4444;">${diff.toFixed(0)} pts ↘</span>`;
            } else {
                trendEl.innerHTML = `<span style="color: #3b82f6;">Steady ➔</span>`;
            }
        } else {
            trendEl.innerText = "Baseline";
        }
    } else {
        document.getElementById('progressLatestScore').innerText = '-';
        document.getElementById('progressHighestScore').innerText = '-';
        document.getElementById('progressTrendStatus').innerText = '-';
    }

    // Create Gradient Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

    subjectProgressChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Score',
                data: dataPoints,
                borderColor: '#a855f7',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: isDark ? '#1e293b' : '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        title: (items) => {
                            const idx = items[0]?.dataIndex;
                            return chronologicalScores[idx]?.examName || chronologicalScores[idx]?.quizName || 'Test';
                        },
                        label: (ctx) => {
                            const idx = ctx.dataIndex;
                            const subj = chronologicalScores[idx]?.subject || '';
                            return ` Score: ${ctx.parsed.y} pts (${subj})`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 11, weight: '600' },
                        stepSize: 20
                    },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 11, weight: '600' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// Progress Subject Dropdown Event Listener
document.getElementById('progressSubjectFilter')?.addEventListener('change', (e) => {
    activeProgressSubject = e.target.value;
    const isDark = document.body.classList.contains('dark-theme') || document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    renderSubjectProgressChart(isDark, textColor, gridColor);
});

// --- QUIZ TYPE RESOLVER & BADGE HELPER ---
function resolveScoreType(data) {
    if (data.type) return data.type;
    const name = (data.examName || data.quizName || '').toLowerCase();
    if (name.includes('review')) return 'Review';
    if (name.includes('final') || name.includes('exam') || name.includes('midterm')) return 'Final Test';
    if (name.includes('homework') || name.includes('hw')) return 'Homework';
    if (name.includes('exercise')) return 'Exercise';
    if (name.includes('project')) return 'Project';
    if (name.includes('skill')) return 'Skill';
    return 'Quiz';
}

function getTypeBadgeHtml(type) {
    const t = type || 'Quiz';
    let bg = 'rgba(37, 99, 235, 0.08)';
    let color = '#2563eb';
    let border = 'rgba(37, 99, 235, 0.2)';

    if (t === 'Final Test') {
        bg = 'rgba(220, 38, 38, 0.08)';
        color = '#dc2626';
        border = 'rgba(220, 38, 38, 0.2)';
    } else if (t === 'Review') {
        bg = 'rgba(147, 51, 234, 0.08)';
        color = '#9333ea';
        border = 'rgba(147, 51, 234, 0.2)';
    } else if (t === 'Homework') {
        bg = 'rgba(234, 88, 12, 0.08)';
        color = '#ea580c';
        border = 'rgba(234, 88, 12, 0.2)';
    } else if (t === 'Exercise') {
        bg = 'rgba(22, 163, 74, 0.08)';
        color = '#16a34a';
        border = 'rgba(22, 163, 74, 0.2)';
    } else if (t === 'Project') {
        bg = 'rgba(13, 148, 136, 0.08)';
        color = '#0d9488';
        border = 'rgba(13, 148, 136, 0.2)';
    } else if (t === 'Skill') {
        bg = 'rgba(79, 70, 229, 0.08)';
        color = '#4f46e5';
        border = 'rgba(79, 70, 229, 0.2)';
    }

    return `<span style="background: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px;">${t}</span>`;
}

// --- SPOTLIGHT HANDLER ---
function spotlightScore(data) {
    const title = data.examName || data.quizName || 'Assessment Result';
    const subject = data.subject || 'General Assessment';
    const scoreVal = data.score !== undefined ? data.score : '--';
    const type = resolveScoreType(data);

    document.getElementById('spotlightTitle').innerText = title;
    document.getElementById('spotlightSubject').innerHTML = `<span style="display: inline-flex; align-items: center; gap: 8px;"><span>Subject: <strong>${subject}</strong></span> <span style="background: rgba(255,255,255,0.18); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3);">${type}</span></span>`;
    document.getElementById('spotlightScoreValue').innerText = scoreVal;
}

// --- RENDER SCORE CARDS GRID ---
function renderScoreCards(filterValue) {
    const gridContainer = document.getElementById('scoreCardsGrid');
    if (!gridContainer) return;
    gridContainer.innerHTML = "";

    const filtered = filterValue === "ALL" || !filterValue
        ? cachedExamScores
        : cachedExamScores.filter(s => (s.examName === filterValue || s.quizName === filterValue));

    if (filtered.length === 0) {
        gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-gray); padding: 40px; background: var(--card-bg); border-radius: 16px; border: 1px dashed var(--border-color);">No score record found for the selected filter.</div>`;
        return;
    }

    filtered.forEach((data) => {
        const title = data.examName || data.quizName || 'N/A';
        const subject = data.subject || 'N/A';
        const score = data.score;
        const numScore = parseFloat(score) || 0;
        const type = resolveScoreType(data);
        const typeBadge = getTypeBadgeHtml(type);

        let scoreBg = '#ecfdf5';
        let scoreColor = '#10b981';
        let scoreBorder = '#a7f3d0';

        if (numScore < 70 && numScore > 0) {
            scoreBg = '#fef2f2';
            scoreColor = '#ef4444';
            scoreBorder = '#fca5a5';
        } else if (numScore < 85 && numScore >= 70) {
            scoreBg = '#fffbe5';
            scoreColor = '#d97706';
            scoreBorder = '#fde68a';
        }

        const card = document.createElement('div');
        card.className = 'interactive-score-card';
        card.style.cssText = `
            background: var(--card-bg, #ffffff);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        `;

        card.innerHTML = `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px;">
                    <span style="font-size: 11.5px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-gray); font-weight: 700;">${subject}</span>
                    ${typeBadge}
                </div>
                <h4 style="margin: 0 0 16px 0; font-size: 17px; font-weight: 800; color: var(--text-dark); line-height: 1.3;">${title}</h4>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid var(--border-color, #f1f5f9);">
                <span style="font-size: 12.5px; font-weight: 600; color: var(--text-gray);">Score:</span>
                <span style="background: ${scoreBg}; color: ${scoreColor}; border: 1px solid ${scoreBorder}; font-size: 26px; font-weight: 900; padding: 4px 16px; border-radius: 12px; line-height: 1;">
                    ${score}
                </span>
            </div>
        `;

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = '0 12px 24px rgba(30, 94, 255, 0.12)';
            card.style.borderColor = '#1e5eff';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
            card.style.borderColor = 'var(--border-color, #e2e8f0)';
        });

        card.addEventListener('click', () => {
            spotlightScore(data);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        gridContainer.appendChild(card);
    });
}

// Exam Filter Dropdown Event Listener
document.getElementById('examScoreDropdown')?.addEventListener('change', (e) => {
    renderScoreCards(e.target.value);
});
