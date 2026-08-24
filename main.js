import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { escapeHtml } from "./utils.js";

let cachedExamScores = [];

// --- THEME TOGGLE SYSTEM ---
// --- THEME TOGGLE SYSTEM ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const mainThemeIcon = document.getElementById('mainThemeIcon');
const mainThemeText = document.getElementById('mainThemeText');

// Replace these with your Google Drive image URLs
const DARK_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1N2sZUgBKIQCviZYYm4ibVWCXc4XVhnnh';
const LIGHT_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1_NNJ0sMnU6x1pLW1GiV8FmfL9bPccVhd';

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (mainThemeIcon) mainThemeIcon.src = LIGHT_MODE_ICON_URL;
        if (mainThemeText) mainThemeText.innerText = 'Light Mode';
    } else {
        document.body.classList.remove('dark-theme');
        if (mainThemeIcon) mainThemeIcon.src = DARK_MODE_ICON_URL;
        if (mainThemeText) mainThemeText.innerText = 'Dark Mode';
    }
}

// Load saved theme on startup
const savedTheme = localStorage.getItem('appTheme') || 'light';
applyTheme(savedTheme);

// Handle click event
themeToggleBtn?.addEventListener('click', () => {
    const isDarkNow = document.body.classList.toggle('dark-theme');
    const newTheme = isDarkNow ? 'dark' : 'light';
    localStorage.setItem('appTheme', newTheme);
    applyTheme(newTheme);
});

// --- STUDENT LOGIN & SESSION SYSTEM ---
let currentLoggedInStudent = null;

async function checkStudentSession() {
    const saved = sessionStorage.getItem('studentLoggedInSession');
    const overlay = document.getElementById('studentLoginOverlay');
    
    if (saved) {
        currentLoggedInStudent = JSON.parse(saved);
        if (overlay) overlay.style.display = 'none';
        fetchStudentUnifiedData(currentLoggedInStudent.code);
        loadNewsTicker();
    } else {
        if (overlay) overlay.style.display = 'flex';
    }
}

// Student Login Button Click Handler
document.getElementById('studentLoginBtn')?.addEventListener('click', handleStudentLogin);
document.getElementById('loginStudentPassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleStudentLogin();
});
document.getElementById('loginStudentUsername')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleStudentLogin();
});

async function handleStudentLogin() {
    const rawUser = document.getElementById('loginStudentUsername').value.trim();
    const rawPass = document.getElementById('loginStudentPassword').value.trim();
    const errBox = document.getElementById('loginErrorMessage');

    if (errBox) errBox.classList.add('hidden');

    if (!rawUser || !rawPass) {
        if (errBox) {
            errBox.innerText = "Please fill out both username and password fields.";
            errBox.classList.remove('hidden');
        }
        return;
    }

    // 1. TEACHER / ADMIN LOGIN (If email address entered)
    if (rawUser.includes('@')) {
        try {
            await signInWithEmailAndPassword(auth, rawUser, rawPass);
            window.location.href = "admin.html";
            return;
        } catch (err) {
            console.error("Staff Login Error:", err);
            if (errBox) {
                let msg = "Staff Login Failed: Invalid email or password.";
                if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                    msg = "Invalid email or password. Please check your credentials.";
                } else if (err.code === 'auth/too-many-requests') {
                    msg = "Too many failed attempts. Please wait a moment and try again.";
                }
                errBox.innerText = msg;
                errBox.classList.remove('hidden');
            }
            return;
        }
    }

    // 2. STUDENT LOGIN (Unique code)
    const userIn = rawUser.toUpperCase();
    const passIn = rawPass.toUpperCase();

    if (userIn !== passIn) {
        if (errBox) {
            errBox.innerText = "For students, your Username and Password must both be your 5-character student code.";
            errBox.classList.remove('hidden');
        }
        return;
    }

    try {
        const studentRef = doc(db, "students", userIn);
        const studentSnap = await getDoc(studentRef);

        if (!studentSnap.exists()) {
            if (errBox) {
                errBox.innerText = `Student code "${userIn}" not found in database.`;
                errBox.classList.remove('hidden');
            }
            return;
        }

        const sData = studentSnap.data();
        currentLoggedInStudent = {
            code: userIn,
            name: sData.studentName || 'Student',
            studentClass: sData.studentClass || sData.class || 'Unassigned'
        };

        // Save session in sessionStorage so it persists across page navigation (Quiz, Timeline, etc.)
        sessionStorage.setItem('studentLoggedInSession', JSON.stringify(currentLoggedInStudent));
        sessionStorage.setItem('studentTimelineSession', JSON.stringify({
            type: 'student',
            name: currentLoggedInStudent.name,
            code: currentLoggedInStudent.code,
            studentClass: currentLoggedInStudent.studentClass
        }));

        const overlay = document.getElementById('studentLoginOverlay');
        if (overlay) overlay.style.display = 'none';

        fetchStudentUnifiedData(userIn);
        loadNewsTicker();

    } catch (err) {
        console.error("Student login error:", err);
        if (errBox) {
            errBox.innerText = "Connection error. Please try logging in again.";
            errBox.classList.remove('hidden');
        }
    }
}

// Student Logout Handler
document.getElementById('studentLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    location.reload();
});

// Auto-fetch profile for logged in code
async function fetchStudentUnifiedData(codeInput) {
    const profileCard = document.getElementById('profileResultCard');
    if (profileCard) profileCard.classList.add('hidden');

    if (!codeInput) return;

    try {
        const scoreQuery = query(collection(db, "exam_scores"), where("studentCode", "==", codeInput));
        const pointQuery = query(collection(db, "student_points"), where("studentCode", "==", codeInput));

        const [scoreSnap, pointSnap] = await Promise.all([
            getDocs(scoreQuery),
            getDocs(pointQuery)
        ]);

        renderUnifiedProfile(scoreSnap, pointSnap, codeInput);

    } catch (error) {
        console.error("Profile lookup error:", error);
    }
}
// --- UPDATED STUDENT PROFILE & DROPDOWN SCORE FILTER LOGIC ---
function renderUnifiedProfile(scoreSnap, pointSnap) {
    let studentName = "";
    let studentClass = "";
    let totalBehaviorPoints = 0;

    // 1. Process Behavior Points into Modern Activity Cards
    const behaviorFeed = document.getElementById('behaviorActivityFeed');
    if (behaviorFeed) behaviorFeed.innerHTML = "";

    const formatTimestamp = (raw) => {
        if (!raw) return 'Recent Event';
        try {
            let d;
            if (typeof raw.toDate === 'function') {
                d = raw.toDate();
            } else if (raw.seconds) {
                d = new Date(raw.seconds * 1000);
            } else if (typeof raw === 'string' || typeof raw === 'number') {
                d = new Date(raw);
            } else {
                d = new Date(raw);
            }
            if (isNaN(d.getTime())) return 'Recent Event';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return 'Recent Event';
        }
    };

    if (!pointSnap.empty) {
        pointSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if (!studentName && data.studentName) studentName = data.studentName;
            if (!studentClass && data.studentClass) studentClass = data.studentClass;

            const pts = parseFloat(data.points) || 0;
            totalBehaviorPoints += pts;

            const isPositive = pts > 0;
            const isNeutral = pts === 0;

            const badgeBg = isPositive ? 'rgba(16, 185, 129, 0.12)' : (isNeutral ? 'rgba(100, 116, 139, 0.12)' : 'rgba(239, 68, 68, 0.12)');
            const badgeColor = isPositive ? '#10b981' : (isNeutral ? '#64748b' : '#ef4444');
            const badgeBorder = isPositive ? 'rgba(16, 185, 129, 0.3)' : (isNeutral ? 'rgba(100, 116, 139, 0.3)' : 'rgba(239, 68, 68, 0.3)');
            const sign = isPositive ? '+' : '';

            // Icon SVG based on Merit vs Demerit
            const iconSvg = isPositive
                ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`
                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;

            if (behaviorFeed) {
                behaviorFeed.innerHTML += `
                    <div class="behavior-activity-item">
                        <div class="behavior-item-left">
                            <div class="behavior-item-icon" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">
                                ${iconSvg}
                            </div>
                            <div class="behavior-item-details">
                                <h4 class="behavior-item-title">${data.reason || 'Point Adjustment'}</h4>
                                <p class="behavior-item-date">${formatTimestamp(data.timestamp)}</p>
                            </div>
                        </div>

                        <div class="behavior-item-badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">
                            ${sign}${pts} pts
                        </div>
                    </div>
                `;
            }
        });
    } else {
        if (behaviorFeed) {
            behaviorFeed.innerHTML = `<div style="text-align:center; color:var(--text-gray); padding: 32px 16px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border-color); font-size: 13.5px;">No behavior point records logged yet.</div>`;
        }
    }

    // 2. Process student name & class and cache exam scores
    cachedExamScores = [];
    if (!scoreSnap.empty) {
        scoreSnap.forEach((doc) => {
            const data = doc.data();
            cachedExamScores.push({ id: doc.id, ...data });
            if (!studentName && data.studentName) studentName = data.studentName;
            if (!studentClass && data.studentClass) studentClass = data.studentClass;
        });
    }

    // 3. Update Banner Headers & Behavior Badge
    const displayName = studentName || (currentLoggedInStudent ? currentLoggedInStudent.name : "Student Profile");
    const displayClass = studentClass || (currentLoggedInStudent ? currentLoggedInStudent.studentClass : 'Unassigned');

    const nameDisp = document.getElementById('studentNameDisplay');
    if (nameDisp) nameDisp.innerText = displayName;
    
    const classDisp = document.getElementById('studentClassDisplay');
    if (classDisp) classDisp.innerText = `Class: ${displayClass}`;

    // Update Greeting Banner & Sidebar Profile
    updateGreetingBanner(displayName);

    const sidebarNameEl = document.getElementById('sidebarStudentName');
    if (sidebarNameEl) sidebarNameEl.innerText = displayName;

    const sidebarClassEl = document.getElementById('sidebarStudentClass');
    if (sidebarClassEl) sidebarClassEl.innerText = `Class: ${displayClass}`;

    const heroBadge = document.getElementById('heroTotalPoints');
    if (heroBadge) {
        heroBadge.innerText = (totalBehaviorPoints > 0 ? '+' : '') + totalBehaviorPoints;
        heroBadge.style.color = totalBehaviorPoints >= 0 ? '#10b981' : '#f87171';
    }

    const profileCard = document.getElementById('profileResultCard');
    if (profileCard) profileCard.classList.remove('hidden');
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
            <td style="vertical-align: middle; color: var(--text-gray); white-space: nowrap;">${data.subject || 'N/A'}</td>
            <td style="text-align: right; vertical-align: middle;">
                <span style="display: inline-block; white-space: nowrap; background: #ecfdf5; color: #10b981; font-size: 24px; font-weight: 800; padding: 4px 16px; border-radius: 8px; border: 1px solid #a7f3d0;">
                    ${data.score}
                </span>
            </td>
        </tr>
    `;
});
}

// Dropdown change listener
document.getElementById('examScoreDropdown')?.addEventListener('change', (e) => {
    renderExamScoresTable(e.target.value);
});

// --- UPDATED REAL-TIME SCHOOL NOTICES LISTENER ---
function loadNewsTicker() {
    try {
        const newsRef = collection(db, "news_updates");

        onSnapshot(newsRef, (querySnapshot) => {
            const newsListContainer = document.getElementById('newsListContainer');
            if (!newsListContainer) return;

            let studentClass = '';
            if (currentLoggedInStudent && currentLoggedInStudent.studentClass) {
                studentClass = currentLoggedInStudent.studentClass.trim();
            }

            if (querySnapshot.empty) {
                newsListContainer.innerHTML = "<p style='color: var(--text-gray); font-size: 13px; text-align: center; padding: 20px 0;'>No active school notices available.</p>";
                return;
            }

            let newsItems = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.status || data.status === 'active') {
                    const target = data.targetClasses;
                    const isTargeted = !target || 
                                       !Array.isArray(target) || 
                                       target.length === 0 || 
                                       target.includes('all') || 
                                       (studentClass && target.includes(studentClass));

                    if (isTargeted) {
                        newsItems.push(data);
                    }
                }
            });

            newsItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            newsListContainer.innerHTML = "";
            if (newsItems.length === 0) {
                newsListContainer.innerHTML = "<p style='color: var(--text-gray); font-size: 13px; text-align: center; padding: 20px 0;'>No active school notices available for your class.</p>";
                return;
            }

            newsItems.forEach(news => {
                const dateObj = new Date(news.timestamp);
                const month = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
                const day = dateObj.getDate();
                const dateTag = `${month} ${day}`;

                const targetBadge = (news.targetClasses && !news.targetClasses.includes('all')) 
                    ? `<span style="font-size: 11px; background: rgba(30, 94, 255, 0.1); color: var(--primary-blue); padding: 2px 8px; border-radius: 6px; font-weight: 600; margin-left: 8px;">Class: ${news.targetClasses.join(', ')}</span>`
                    : '';

                newsListContainer.innerHTML += `
                    <div class="notice-card">
                        <div class="notice-header">
                            <h4 class="notice-title">${news.title} ${targetBadge}</h4>
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

function getTimeBasedGreeting(displayName) {
    const hour = new Date().getHours();
    let timeGreeting = "Good morning";
    if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon";
    } else if (hour >= 17 || hour < 5) {
        timeGreeting = "Good evening";
    }
    const namePart = displayName ? displayName.split(' ')[0] : 'Student';
    return `${timeGreeting}, ${namePart} 👋`;
}

function updateGreetingBanner(displayName) {
    const greetingEl = document.querySelector('.greeting-title');
    if (greetingEl) {
        greetingEl.innerText = getTimeBasedGreeting(displayName);
    }
}

// Initialize on load
updateGreetingBanner();
checkStudentSession();
loadNewsTicker();