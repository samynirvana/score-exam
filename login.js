import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { getDailyQuote } from "./dailyQuotes.js";

// Session keys
const rememberedStudentKey = 'portalRememberedStudent';
const sessionMetaKey = 'portalSessionMeta';
const SESSION_MAX_IDLE_MS = 60 * 60 * 1000;

// Theme Toggle
const themeToggleBtn = document.getElementById('themeToggleBtn');
const mainThemeIcon = document.getElementById('mainThemeIcon');
const mainThemeText = document.getElementById('mainThemeText');

const DARK_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1N2sZUgBKIQCviZYYm4ibVWCXc4XVhnnh';
const LIGHT_MODE_ICON_URL = 'https://lh3.googleusercontent.com/d/1_NNJ0sMnU6x1pLW1GiV8FmfL9bPccVhd';

function applyTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-theme', 'dark-mode');
        if (mainThemeIcon) mainThemeIcon.src = LIGHT_MODE_ICON_URL;
        if (mainThemeText) mainThemeText.innerText = 'Light Mode';
    } else {
        document.body.classList.remove('dark-theme', 'dark-mode');
        if (mainThemeIcon) mainThemeIcon.src = DARK_MODE_ICON_URL;
        if (mainThemeText) mainThemeText.innerText = 'Dark Mode';
    }
    document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.setProperty('display', isDark ? 'inline-block' : 'none', 'important'));
    document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.setProperty('display', isDark ? 'none' : 'inline-block', 'important'));
}

const savedTheme = localStorage.getItem('appTheme') || localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

themeToggleBtn?.addEventListener('click', () => {
    const isDarkNow = !document.body.classList.contains('dark-theme');
    const newTheme = isDarkNow ? 'dark' : 'light';
    localStorage.setItem('appTheme', newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
});

// Check if local session has expired
const checkLocalSessionExpired = () => {
    try {
        const meta = JSON.parse(localStorage.getItem(sessionMetaKey) || 'null');
        if (meta && !meta.rememberMe) {
            const elapsed = Date.now() - (Number(meta.lastActive) || 0);
            if (elapsed > SESSION_MAX_IDLE_MS) {
                localStorage.removeItem(rememberedStudentKey);
                localStorage.removeItem(sessionMetaKey);
                localStorage.removeItem('loggedInStudentCode');
                localStorage.removeItem('studentLoggedIn');
                localStorage.removeItem('studentTimelineSession');
                localStorage.removeItem('studentLoggedInSession');
                sessionStorage.removeItem('studentLoggedInSession');
                sessionStorage.removeItem('studentTimelineSession');
                return true;
            }
        }
    } catch {}
    return false;
};

// Check maintenance status
async function checkMaintenanceStatus() {
    try {
        let snap = await getDoc(doc(db, "system_settings", "maintenance"));
        if (!snap.exists()) {
            snap = await getDoc(doc(db, "config", "maintenance"));
        }
        if (snap.exists()) {
            const data = snap.data();
            return !!data.enabled;
        }
    } catch (e) {
        console.warn("Could not check maintenance status:", e);
    }
    return localStorage.getItem('maintenanceMode') === 'true';
}

// Maintenance live listener
try {
    onSnapshot(doc(db, "system_settings", "maintenance"), (snap) => {
        if (snap.exists() && snap.data().enabled && !auth.currentUser) {
            window.location.replace("maintenance.html");
        }
    });
} catch (e) {
    console.warn("Live maintenance listener error:", e);
}

// Daily quote update
export function updateLoginDailyQuote() {
    const quoteTextEl = document.getElementById('loginDailyQuoteText');
    const quoteAuthorEl = document.getElementById('loginDailyQuoteAuthor');
    if (!quoteTextEl && !quoteAuthorEl) return;

    const todayQuote = getDailyQuote();
    if (quoteTextEl && todayQuote.quote) {
        quoteTextEl.textContent = `"${todayQuote.quote}"`;
    }
    if (quoteAuthorEl && todayQuote.author) {
        quoteAuthorEl.textContent = `— ${todayQuote.author}`;
    }
}

// Day / Night campus image
export function updateLoginVisualDayNight() {
    const visualImg = document.getElementById('loginVisualCampusImg');
    if (visualImg) {
        const hour = new Date().getHours();
        const isDay = (hour >= 6 && hour < 18);
        const localImg = isDay ? 'day_building.jpg' : 'night_building.jpg';
        const driveImg = isDay
            ? 'https://lh3.googleusercontent.com/d/1ozoUmpJTsMTSvykTQr-WNQ3K19D1_NGb'
            : 'https://lh3.googleusercontent.com/d/12BaqYdue8roO0CCfwajIEcCkIkTZe5pR';

        visualImg.src = localImg;
        visualImg.onerror = () => {
            visualImg.onerror = null;
            visualImg.src = driveImg;
        };
    }

    updateLoginDailyQuote();
}

// Auto-redirect if student or staff is already logged in
async function checkExistingLogin() {
    const isMaintenance = await checkMaintenanceStatus();
    if (isMaintenance && !auth.currentUser) {
        window.location.replace("maintenance.html");
        return;
    }

    const isExpired = checkLocalSessionExpired();
    if (!isExpired) {
        try {
            const remembered = JSON.parse(localStorage.getItem(rememberedStudentKey) || 'null');
            if (remembered && typeof remembered.code === 'string' && remembered.code) {
                if (!sessionStorage.getItem('studentLoggedInSession')) {
                    sessionStorage.setItem('studentLoggedInSession', JSON.stringify(remembered));
                    sessionStorage.setItem('studentTimelineSession', JSON.stringify({ ...remembered, type: 'student' }));
                }
            }
        } catch {
            localStorage.removeItem(rememberedStudentKey);
        }

        const savedStudent = sessionStorage.getItem('studentLoggedInSession');
        if (savedStudent) {
            window.location.replace("studentdash.html");
            return;
        }
    }
}

// Auto-route authenticated staff (teachers/admins) to admin dashboard
onAuthStateChanged(auth, async (user) => {
    if (user && !sessionStorage.getItem('studentLoggedInSession')) {
        if (checkLocalSessionExpired()) {
            const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
            await signOut(auth);
            return;
        }
        window.location.replace("admin.html");
    }
});

// Event Listeners for Login Form
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
    const rememberMe = document.getElementById('loginRememberMe').checked;
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
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
            sessionStorage.setItem('analyticsPendingLogin', 'staff');
            await signInWithEmailAndPassword(auth, rawUser, rawPass);
            sessionStorage.removeItem('studentLoggedInSession');
            localStorage.removeItem(rememberedStudentKey);
            if (window.portalSession?.recordLogin) {
                window.portalSession.recordLogin(rememberMe, 'staff');
            } else {
                localStorage.setItem('portalSessionMeta', JSON.stringify({
                    rememberMe: Boolean(rememberMe),
                    lastActive: Date.now(),
                    role: 'staff'
                }));
            }
            window.location.href = "admin.html";
            return;
        } catch (err) {
            sessionStorage.removeItem('analyticsPendingLogin');
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

    // Check maintenance mode before student logs in
    const isMaintenance = await checkMaintenanceStatus();
    if (isMaintenance) {
        window.location.replace("maintenance.html");
        return;
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
        const studentBirthDate = sData.birthDate || sData.dateOfBirth || '';
        const loggedInStudent = {
            code: userIn,
            name: sData.studentName || sData.name || 'Student',
            studentClass: sData.studentClass || sData.class || 'Unassigned',
            birthDate: studentBirthDate
        };

        if (rememberMe) {
            localStorage.setItem(rememberedStudentKey, JSON.stringify(loggedInStudent));
        } else {
            localStorage.removeItem(rememberedStudentKey);
        }

        if (window.portalSession?.recordLogin) {
            window.portalSession.recordLogin(rememberMe, 'student');
        } else {
            localStorage.setItem('portalSessionMeta', JSON.stringify({
                rememberMe: Boolean(rememberMe),
                lastActive: Date.now(),
                role: 'student'
            }));
        }

        // Save session in sessionStorage
        sessionStorage.setItem('studentLoggedInSession', JSON.stringify(loggedInStudent));
        sessionStorage.setItem('analyticsPendingLogin', 'student');
        sessionStorage.setItem('studentTimelineSession', JSON.stringify({
            type: 'student',
            name: loggedInStudent.name,
            code: loggedInStudent.code,
            studentClass: loggedInStudent.studentClass,
            birthDate: studentBirthDate
        }));

        // Redirect to student dashboard
        window.location.href = "studentdash.html";

    } catch (err) {
        console.error("Student login error:", err);
        if (errBox) {
            errBox.innerText = "Connection error. Please try logging in again.";
            errBox.classList.remove('hidden');
        }
    }
}

// Run visual and session checks on startup
updateLoginVisualDayNight();
checkExistingLogin();
