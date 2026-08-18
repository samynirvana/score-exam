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

    // Close when selecting any link inside
    dropdown.querySelectorAll('.kebab-item').forEach(item => {
        item.addEventListener('click', () => {
            dropdown.classList.add('hidden');
        });
    });

    // Highlight current active tab in mobile kebab menu
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navDashboard = dropdown.querySelector('.nav-dashboard');
    const navQuiz = dropdown.querySelector('.nav-quiz');
    const navTimeline = dropdown.querySelector('.nav-timeline');
    const navScores = dropdown.querySelector('.nav-scores');

    if (currentPath === 'index.html' || currentPath === '') {
        navDashboard?.classList.add('active');
    } else if (currentPath === 'quiz.html') {
        navQuiz?.classList.add('active');
    } else if (currentPath === 'timeline.html') {
        navTimeline?.classList.add('active');
    } else if (currentPath === 'scores.html') {
        navScores?.classList.add('active');
    }

    // Sync Dark Mode Toggle
    const updateThemeText = () => {
        const isDark = document.body.classList.contains('dark-theme') || document.body.classList.contains('dark-mode');
        if (kebabThemeText) {
            kebabThemeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
        }
    };
    updateThemeText();

    if (kebabThemeBtn) {
        kebabThemeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const desktopThemeBtn = document.getElementById('themeToggleBtn') || document.getElementById('darkModeToggle');
            if (desktopThemeBtn) {
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
        kebabLogoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const desktopLogoutBtn = document.getElementById('studentLogoutBtn');
            if (desktopLogoutBtn) {
                desktopLogoutBtn.click();
            } else {
                localStorage.removeItem('loggedInStudentCode');
                localStorage.removeItem('studentLoggedIn');
                window.location.href = 'index.html';
            }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
} else {
    initMobileNav();
}
