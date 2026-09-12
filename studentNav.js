// --- PORTAL SESSION & AUTO-EXPIRATION MANAGEMENT ---
const APP_SESSION_META_KEY = 'portalSessionMeta';
const SESSION_MAX_IDLE_MS = 60 * 60 * 1000; // 1 hour for non-remembered logins

const getAppSessionMeta = () => {
    try {
        return JSON.parse(localStorage.getItem(APP_SESSION_META_KEY) || 'null');
    } catch {
        return null;
    }
};

const recordAppSessionLogin = (rememberMe, role = 'student') => {
    try {
        localStorage.setItem(APP_SESSION_META_KEY, JSON.stringify({
            rememberMe: Boolean(rememberMe),
            lastActive: Date.now(),
            role: role
        }));
    } catch (e) {
        console.warn('Failed to save session metadata:', e);
    }
};

let lastTouchTime = 0;
const touchAppSession = (force = false) => {
    const now = Date.now();
    if (!force && (now - lastTouchTime < 60 * 1000)) return; // Throttle to once a minute
    lastTouchTime = now;
    const meta = getAppSessionMeta();
    if (meta) {
        meta.lastActive = now;
        try {
            localStorage.setItem(APP_SESSION_META_KEY, JSON.stringify(meta));
        } catch (e) {}
    }
};

const clearAllPortalSessions = async (signOutAuth = true) => {
    try {
        localStorage.removeItem('portalRememberedStudent');
        localStorage.removeItem('loggedInStudentCode');
        localStorage.removeItem('studentLoggedIn');
        localStorage.removeItem('studentCode');
        localStorage.removeItem('studentTimelineSession');
        localStorage.removeItem('studentLoggedInSession');
        localStorage.removeItem(APP_SESSION_META_KEY);
        sessionStorage.removeItem('studentLoggedInSession');
        sessionStorage.removeItem('studentTimelineSession');

        if (signOutAuth) {
            try {
                const { auth } = await import('./firebase.js');
                const { signOut } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
                if (auth && auth.currentUser) {
                    await signOut(auth);
                }
            } catch (e) {}
        }
    } catch (e) {
        console.warn('Error clearing portal sessions:', e);
    }
};

const checkSessionValidity = async () => {
    const meta = getAppSessionMeta();
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const isLoginPage = currentPath === 'index.html' || currentPath === '';

    if (meta && !meta.rememberMe) {
        const elapsed = Date.now() - (Number(meta.lastActive) || 0);
        if (elapsed > SESSION_MAX_IDLE_MS) {
            console.warn(`[Security] Session expired (> 1 hour inactive without Remember Me). Elapsed: ${Math.round(elapsed / 60000)}m. Logging out.`);
            await clearAllPortalSessions(true);
            if (!isLoginPage && currentPath !== 'maintenance.html') {
                window.location.replace('index.html');
            }
            return false;
        }
    }

    // Still valid, update activity
    if (meta) {
        touchAppSession(false);
    }
    return true;
};

// Expose globally for pages needing direct access
window.portalSession = {
    getMeta: getAppSessionMeta,
    recordLogin: recordAppSessionLogin,
    touch: touchAppSession,
    clearSessions: clearAllPortalSessions,
    checkValidity: checkSessionValidity,
    SESSION_MAX_IDLE_MS
};

// Activity listeners to keep session alive during active browsing
['click', 'keydown', 'touchstart', 'scroll'].forEach(evtType => {
    window.addEventListener(evtType, () => touchAppSession(false), { passive: true });
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkSessionValidity();
    }
});

// Clear remembered login & session meta on explicit user logout button clicks
document.addEventListener('click', (event) => {
    if (event.target.closest?.('#studentLogoutBtn, #mobileKebabLogoutBtn, #logoutBtn, #btnLogout')) {
        clearAllPortalSessions(true);
    }
}, true);

// Run session validity check on initial script load
checkSessionValidity();

// studentNav.js - Global Mobile Kebab Menu Navigation Handler
const initMobileNav = () => {
    const kebabBtn = document.getElementById('mobileTopbarKebabBtn');
    const dropdown = document.getElementById('mobileTopbarDropdown');
    const kebabThemeBtn = document.getElementById('mobileKebabThemeBtn');
    const kebabThemeText = document.getElementById('mobileKebabThemeText');
    const kebabLogoutBtn = document.getElementById('mobileKebabLogoutBtn');

    if (!kebabBtn || !dropdown) return;

    // Toggle Dropdown on click/tap
    kebabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !kebabBtn.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Handle clicks inside dropdown (tabs & links)
    dropdown.querySelectorAll('.kebab-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.id === 'mobileMenuDatabases' || item.id === 'mobileMenuTools') {
                const submenu = document.getElementById(item.getAttribute('aria-controls'));
                if (submenu) {
                    submenu.hidden = !submenu.hidden;
                    item.setAttribute('aria-expanded', String(!submenu.hidden));
                }
                return;
            }
            const tabId = item.getAttribute('data-tab');
            if (tabId) {
                // If it's a tab switch button in admin dashboard
                const desktopBtn = document.querySelector(`.menu-bar [data-tab="${tabId}"]`);
                if (desktopBtn) {
                    desktopBtn.click();
                } else {
                    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                    const targetTab = document.getElementById(tabId);
                    if (targetTab) targetTab.classList.add('active');
                    if (tabId === 'tab-manage-quizzes' && typeof window.loadQuizzesTable === 'function') {
                        window.loadQuizzesTable();
                    }
                }

                const subtab = item.getAttribute('data-subtab');
                if (subtab && tabId === 'tab-manage-scores' && typeof window.switchManageScoreSubtab === 'function') {
                    window.switchManageScoreSubtab(subtab);
                } else if (subtab && typeof window.switchDbView === 'function') {
                    window.switchDbView(subtab);
                }

                dropdown.querySelectorAll('.kebab-item[data-tab]').forEach(k => k.classList.remove('active'));
                item.classList.add('active');
                document.getElementById('mobileMenuTools')?.classList.toggle('active', tabId === 'tab-manage-quizzes');
                if (tabId === 'tab-view-ledgers') document.getElementById('mobileMenuDatabases')?.classList.add('active');
            }
            dropdown.classList.add('hidden');
        });
    });

    // Highlight current active tab in mobile kebab menu for student portal
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navDashboard = dropdown.querySelector('.nav-dashboard');
    const navQuiz = dropdown.querySelector('.nav-quiz');
    const navTimeline = dropdown.querySelector('.nav-timeline');
    const navBoard = dropdown.querySelector('.nav-board');
    const navScores = dropdown.querySelector('.nav-scores');
    const navProfile = dropdown.querySelector('.nav-profile');

    const navWeekly = dropdown.querySelector('.nav-weekly');

    if (currentPath === 'index.html' || currentPath === '') {
        navDashboard?.classList.add('active');
    } else if (currentPath === 'quiz.html') {
        navQuiz?.classList.add('active');
    } else if (currentPath === 'timeline.html') {
        navTimeline?.classList.add('active');
    } else if (currentPath === 'board.html') {
        navBoard?.classList.add('active');
    } else if (currentPath === 'scores.html') {
        navScores?.classList.add('active');
    } else if (currentPath === 'profile.html') {
        navProfile?.classList.add('active');
    } else if (currentPath === 'weekly.html') {
        navWeekly?.classList.add('active');
    }

    // Sync active state when desktop menu buttons are clicked (for admin.html)
    document.querySelectorAll('.menu-bar .menu-btn').forEach(dBtn => {
        dBtn.addEventListener('click', () => {
            const tabId = dBtn.getAttribute('data-tab');
            if (tabId) {
                dropdown.querySelectorAll('.kebab-item[data-tab]').forEach(k => {
                    k.classList.toggle('active', k.getAttribute('data-tab') === tabId && !k.classList.contains('mobile-db-subtab')); 
                });
            }
        });
    });

    // Sync Dark Mode Toggle
    const updateThemeText = () => {
        const isDark = document.body.classList.contains('dark-theme') || document.body.classList.contains('dark-mode');
        if (kebabThemeText) {
            kebabThemeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        }
        const desktopThemeText = document.getElementById('mainThemeText') || document.getElementById('adminThemeText');
        if (desktopThemeText) {
            desktopThemeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        }
        document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.setProperty('display', isDark ? 'inline-block' : 'none', 'important'));
        document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.setProperty('display', isDark ? 'none' : 'inline-block', 'important'));
    };
    updateThemeText();

    if (kebabThemeBtn) {
        kebabThemeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const desktopThemeBtn = document.getElementById('themeToggleBtn') || document.getElementById('darkModeToggle');
            if (desktopThemeBtn && desktopThemeBtn !== kebabThemeBtn) {
                desktopThemeBtn.click();
            } else {
                const isDark = document.body.classList.toggle('dark-theme');
                document.body.classList.toggle('dark-mode', isDark);
                localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            }
            updateThemeText();
        });
    }

    // Sync Logout
    if (kebabLogoutBtn) {
        kebabLogoutBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await clearAllPortalSessions(true);
            const adminLogoutBtn = document.getElementById('logoutBtn');
            const studentLogoutBtn = document.getElementById('studentLogoutBtn');
            if (adminLogoutBtn) {
                adminLogoutBtn.click();
            } else if (studentLogoutBtn) {
                studentLogoutBtn.click();
            } else {
                window.location.href = 'index.html';
            }
        });
    }
};

// Global Maintenance Mode Checker across all sub-pages
const checkGlobalMaintenanceMode = async () => {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPath === 'admin.html' || currentPath === 'maintenance.html') {
        return;
    }

    try {
        const { db, auth } = await import('./firebase.js');
        const { doc, getDoc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
        const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');

        const evaluateAccess = (data, user) => {
            if (data && data.enabled && !user) {
                window.location.replace('maintenance.html');
            }
        };

        onAuthStateChanged(auth, (user) => {
            if (user) return; // Authenticated staff is never blocked

            onSnapshot(doc(db, "system_settings", "maintenance"), (snap) => {
                if (snap.exists()) {
                    evaluateAccess(snap.data(), user);
                }
            }, async () => {
                try {
                    const cSnap = await getDoc(doc(db, "config", "maintenance"));
                    if (cSnap.exists()) evaluateAccess(cSnap.data(), user);
                } catch (e) {}
            });
        });
    } catch (err) {
        // Fallback to cache if dynamic imports fail or offline
        if (localStorage.getItem('maintenanceMode') === 'true') {
            window.location.replace('maintenance.html');
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initMobileNav();
        checkGlobalMaintenanceMode();
    });
} else {
    initMobileNav();
    checkGlobalMaintenanceMode();
}
