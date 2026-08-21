import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB3TY9M4oUG7xxCgxR6bSJB0K9ivcP5RQI",
    authDomain: "syamserverlist.firebaseapp.com",
    projectId: "syamserverlist",
    storageBucket: "syamserverlist.firebasestorage.app",
    messagingSenderId: "468852816088",
    appId: "1:468852816088:web:b72bcb0c4fee837d983fad",
    measurementId: "G-2YHY6V3JH1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "mrsyamdb");

let cachedExamScores = [];

// --- THEME TOGGLE ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const savedTheme = localStorage.getItem('appTheme') || 'light';

if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.innerText = 'Light Mode';
}

themeToggleBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
    if (themeToggleBtn) themeToggleBtn.innerText = isDark ? 'Light Mode' : 'Dark Mode';
});

// --- SESSION & SCORES LOADING ---
window.addEventListener('DOMContentLoaded', async () => {
    const savedLoggedIn = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
    if (!savedLoggedIn) {
        window.location.href = "index.html";
        return;
    }

    try {
        const session = JSON.parse(savedLoggedIn);
        const code = session.code;

        const sidebarName = document.getElementById('sidebarStudentName');
        const sidebarClass = document.getElementById('sidebarStudentClass');
        if (sidebarName) sidebarName.innerText = session.name || 'Student Portal';
        if (sidebarClass) sidebarClass.innerText = `Class: ${session.studentClass || 'Unassigned'}`;

        await loadStudentScores(code);

    } catch (e) {
        console.error("Scores page load error:", e);
    }
});

// Logout Button
document.getElementById('studentLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    window.location.href = "index.html";
});

async function loadStudentScores(studentCode) {
    const filterDropdown = document.getElementById('examScoreDropdown');
    const gridContainer = document.getElementById('scoreCardsGrid');

    try {
        const scoreQuery = query(collection(db, "exam_scores"), where("studentCode", "==", studentCode));
        const scoreSnap = await getDocs(scoreQuery);

        cachedExamScores = [];
        const optionsSet = new Set();
        let highest = 0;
        let totalSum = 0;

        if (!scoreSnap.empty) {
            scoreSnap.forEach((docSnap) => {
                const data = docSnap.data();
                cachedExamScores.push(data);
                const title = data.examName || data.quizName;
                if (title) optionsSet.add(title);

                const numScore = parseFloat(data.score) || 0;
                if (numScore > highest) highest = numScore;
                totalSum += numScore;
            });

            // Update Summary Stats
            const totalCount = cachedExamScores.length;
            const avg = totalCount > 0 ? (totalSum / totalCount).toFixed(1) : '-';

            document.getElementById('statTotalTests').innerText = totalCount;
            document.getElementById('statHighestScore').innerText = highest > 0 ? highest : '-';
            document.getElementById('statAverageScore').innerText = avg;

            // Populate Dropdown
            filterDropdown.innerHTML = '<option value="ALL">All Subjects / Exams</option>';
            Array.from(optionsSet).sort().forEach(item => {
                filterDropdown.innerHTML += `<option value="${item}">${item}</option>`;
            });

            // Spotlight the most recent score by default
            if (cachedExamScores.length > 0) {
                spotlightScore(cachedExamScores[0]);
            }

            renderScoreCards("ALL");
        } else {
            filterDropdown.innerHTML = '<option value="ALL">All Subjects / Exams</option>';
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-gray); padding: 48px; background: var(--card-bg); border-radius: 16px; border: 1px dashed var(--border-color);">No exam or test scores logged for your account yet.</div>`;
        }

    } catch (err) {
        console.error("Error loading student scores:", err);
    }
}

function spotlightScore(data) {
    const title = data.examName || data.quizName || 'Assessment Result';
    const subject = data.subject || 'General Assessment';
    const scoreVal = data.score !== undefined ? data.score : '--';

    document.getElementById('spotlightTitle').innerText = title;
    document.getElementById('spotlightSubject').innerText = `Subject: ${subject}`;
    document.getElementById('spotlightScoreValue').innerText = scoreVal;
}

function renderScoreCards(filterValue) {
    const gridContainer = document.getElementById('scoreCardsGrid');
    gridContainer.innerHTML = "";

    const filtered = filterValue === "ALL" || !filterValue
        ? cachedExamScores
        : cachedExamScores.filter(s => (s.examName === filterValue || s.quizName === filterValue));

    if (filtered.length === 0) {
        gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-gray); padding: 40px; background: var(--card-bg); border-radius: 16px; border: 1px dashed var(--border-color);">No score record found for the selected filter.</div>`;
        return;
    }

    filtered.forEach((data, index) => {
        const title = data.examName || data.quizName || 'N/A';
        const subject = data.subject || 'N/A';
        const score = data.score;
        const numScore = parseFloat(score) || 0;

        // Color badge determination based on performance
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
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-gray); font-weight: 700;">${subject}</span>
                    <span style="font-size: 12px; color: #1e5eff; font-weight: 700; background: #eff6ff; padding: 2px 8px; border-radius: 6px;">Test</span>
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

        // Hover animation & click handler to update spotlight
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

document.getElementById('examScoreDropdown')?.addEventListener('change', (e) => {
    renderScoreCards(e.target.value);
});
