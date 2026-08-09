import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3oiOHwHUfMhTPjEp8Ku8-qlbRKlGX0Gg",
    authDomain: "students-score-395b2.firebaseapp.com",
    projectId: "students-score-395b2",
    storageBucket: "students-score-395b2.firebasestorage.app",
    messagingSenderId: "189447167056",
    appId: "1:189447167056:web:4526e218132977bc3f4555",
    measurementId: "G-97WSSH0BNE",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let cachedExamScores = [];

// --- THEME TOGGLE SYSTEM ---
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
    themeToggleBtn.innerText = isDark ? 'Light Mode' : 'Dark Mode';
});

// --- UNIFIED SEARCH FUNCTIONALITY ---
async function searchUnifiedStudentData() {
    const codeInput = document.getElementById('studentCode').value.toUpperCase().trim();
    const profileCard = document.getElementById('profileResultCard');
    const errorMessage = document.getElementById('errorMessage');

    profileCard.classList.add('hidden');
    errorMessage.classList.add('hidden');

    if (!codeInput) return;

    try {
        // Query both Exam Scores and Behavior Points simultaneously
        const scoreQuery = query(collection(db, "exam_scores"), where("studentCode", "==", codeInput));
        const pointQuery = query(collection(db, "student_points"), where("studentCode", "==", codeInput));

        const [scoreSnap, pointSnap] = await Promise.all([
            getDocs(scoreQuery),
            getDocs(pointQuery)
        ]);

        if (scoreSnap.empty && pointSnap.empty) {
            errorMessage.innerText = `No records found for student code "${codeInput}".`;
            errorMessage.classList.remove('hidden');
            return;
        }

        renderUnifiedProfile(scoreSnap, pointSnap);

    } catch (error) {
        console.error("Profile lookup error:", error);
        errorMessage.innerText = "An error occurred during lookup processing.";
        errorMessage.classList.remove('hidden');
    }
}
// --- UPDATED STUDENT PROFILE & DROPDOWN SCORE FILTER LOGIC ---
function renderUnifiedProfile(scoreSnap, pointSnap) {
    let studentName = "";
    let studentClass = "";
    let totalBehaviorPoints = 0;

    // 1. Process Behavior Points
    const behaviorTbody = document.getElementById('behaviorTbody');
    behaviorTbody.innerHTML = "";

    if (!pointSnap.empty) {
        pointSnap.forEach((doc) => {
            const data = doc.data();
            if (!studentName && data.studentName) studentName = data.studentName;
            if (!studentClass && data.studentClass) studentClass = data.studentClass;

            const pts = parseFloat(data.points) || 0;
            totalBehaviorPoints += pts;

            const color = pts > 0 ? '#10b981' : (pts < 0 ? '#e02d2d' : 'var(--text-dark)');
            const sign = pts > 0 ? '+' : '';

            behaviorTbody.innerHTML += `
                <tr>
                    <td><strong>${data.reason || 'Point Adjustment'}</strong></td>
                    <td style="text-align: right;"><strong style="color: ${color}; font-size: 14px;">${sign}${pts}</strong></td>
                </tr>
            `;
        });
    } else {
        behaviorTbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:var(--text-gray);">No behavior points logged.</td></tr>`;
    }

    // 2. Process Exam Scores & Build Dropdown Filter Options
    cachedExamScores = [];
    const filterDropdown = document.getElementById('examScoreDropdown');
    const optionsSet = new Set();

    if (!scoreSnap.empty) {
        scoreSnap.forEach((doc) => {
            const data = doc.data();
            if (!studentName && data.studentName) studentName = data.studentName;
            if (!studentClass && data.studentClass) studentClass = data.studentClass;

            cachedExamScores.push(data);

            const title = data.examName || data.quizName;
            if (title) optionsSet.add(title);
        });

        // Set default dropdown prompt (No quiz chosen yet)
        filterDropdown.innerHTML = '<option value="">-- Choose a Quiz / Exam --</option>';
        Array.from(optionsSet).sort().forEach(item => {
            filterDropdown.innerHTML += `<option value="${item}">${item}</option>`;
        });

        // Load empty prompt state by default
        renderExamScoresTable("");
    } else {
        filterDropdown.innerHTML = '<option value="">-- Choose a Quiz / Exam --</option>';
        document.getElementById('scoresTbody').innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-gray); padding: 20px;">No exam scores logged for this student.</td></tr>`;
    }

    // 3. Update Banner Headers & Behavior Badge
    document.getElementById('studentNameDisplay').innerText = studentName || "Student Profile";
    document.getElementById('studentClassDisplay').innerText = `Class: ${studentClass || 'Unassigned'}`;

    const heroBadge = document.getElementById('heroTotalPoints');
    heroBadge.innerText = (totalBehaviorPoints > 0 ? '+' : '') + totalBehaviorPoints;
    heroBadge.style.color = totalBehaviorPoints >= 0 ? '#10b981' : '#f87171';

    document.getElementById('profileResultCard').classList.remove('hidden');
}

function renderExamScoresTable(filterValue) {
    const scoresTbody = document.getElementById('scoresTbody');
    scoresTbody.innerHTML = "";

    // 1. Default State: Prompt student to choose a quiz first
    if (!filterValue) {
        scoresTbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; color:var(--text-gray); padding: 24px 12px; font-style: italic;">
                    Please select a quiz from the dropdown menu above to view your score.
                </td>
            </tr>`;
        return;
    }

    // 2. Filter scores by selected quiz title
    const filtered = cachedExamScores.filter(s => 
        s.examName === filterValue || 
        s.quizName === filterValue
    );

    if (filtered.length === 0) {
        scoresTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-gray); padding: 20px;">No score recorded for the selected quiz.</td></tr>`;
        return;
    }

    // 3. Render row with enlarged, highlighted score badge
    filtered.forEach(data => {
        scoresTbody.innerHTML += `
            <tr>
                <td style="vertical-align: middle;"><strong>${data.examName || data.quizName || 'N/A'}</strong></td>
                <td style="vertical-align: middle; color: var(--text-gray);">${data.subject || 'N/A'}</td>
                <td style="text-align: right; vertical-align: middle;">
                    <span style="display: inline-block; background: #ecfdf5; color: #10b981; font-size: 24px; font-weight: 800; padding: 4px 16px; border-radius: 8px; border: 1px solid #a7f3d0;">
                        ${data.score}
                    </span>
                </td>
            </tr>
        `;
    });
}

// Dropdown change listener
document.getElementById('examScoreDropdown').addEventListener('change', (e) => {
    renderExamScoresTable(e.target.value);
});

// Search listeners
document.getElementById('searchBtn').addEventListener('click', searchUnifiedStudentData);
document.getElementById('studentCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchUnifiedStudentData();
});

// --- UPDATED REAL-TIME SCHOOL NOTICES LISTENER ---
function loadNewsTicker() {
    try {
        const newsRef = collection(db, "news_updates");

        onSnapshot(newsRef, (querySnapshot) => {
            const newsListContainer = document.getElementById('newsListContainer');
            if (!newsListContainer) return;

            if (querySnapshot.empty) {
                newsListContainer.innerHTML = "<p style='color: var(--text-gray); font-size: 13px; text-align: center; padding: 20px 0;'>No active school notices available.</p>";
                return;
            }

            let newsItems = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.status || data.status === 'active') {
                    newsItems.push(data);
                }
            });

            newsItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            newsListContainer.innerHTML = "";
            newsItems.forEach(news => {
                const dateObj = new Date(news.timestamp);
                const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
                const day = dateObj.getDate();
                const dateTag = `${month} ${day}`;

                newsListContainer.innerHTML += `
                    <div class="notice-card">
                        <div class="notice-header">
                            <h4 class="notice-title">${news.title}</h4>
                            <span class="notice-date-tag">${dateTag}</span>
                        </div>
                        <div class="notice-body">${news.content}</div>
                    </div>
                `;
            });
        });

    } catch (error) {
        console.error("Error pulling news ticker data:", error);
    }
}

// Initialize real-time news on load
loadNewsTicker();