// learning.js - Gamified Learning Module Logic & Access Control
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";
import { ENGLISH_G9_MODULES, GRADE_CLASS_CATALOG } from "./learningData.js";
import { TENSES_DATA } from "./tensesData.js";
import { UNIT_SUBMATERIALS } from "./curriculumData.js";
import { escapeHtml } from "./utils.js";

// Session & State variables
let currentUserRole = "student"; // "student" | "teacher" | "admin"
let studentProfile = null;
let currentSelectedClass = "Grade 9A";
let currentSelectedSubject = "English";
let moduleLockMap = {}; // { [moduleId]: boolean } true = unlocked, false = locked
let submaterialLockMap = {}; // { [submaterialId]: boolean } true = unlocked, false = locked
let customQuestionMap = {}; // { [unitId or submaterialId]: Question[] }
let unsubModulesLock = null;
let unsubSubmaterialsLock = null;
let unsubCustomQuestions = null;
let userProgress = {
  xp: 0,
  completedUnits: {}
};

let activeModalUnit = null;
let activeQuizState = {
  questions: [],
  currentIndex: 0,
  score: 0,
  userAnswers: []
};

// 16 Tenses Hub State
let activeTense = null;
let activeTenseFilter = "all";
let activeTenseMcqState = {
  questions: [],
  currentIndex: 0,
  score: 0
};

// DOM references
const $ = id => document.getElementById(id);

// --- COLORFUL SVG ICON SYSTEM (REPLACING EMOJIS) ---
function getUnitSvgIcon(unitId) {
  switch (unitId) {
    case "unit-1":
      // Clock / Time
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case "unit-2":
      // Refresh / Passive Voice
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    case "unit-3":
      // Git branch / Conditionals
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;
    case "unit-4":
      // Hourglass / Reported Speech
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14m-2 2v5l-5 5 5 5v5M7 2v5l5 5-5 5v5"/></svg>`;
    case "unit-5":
      // Link / Relative Clauses
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case "unit-6":
      // Handshake / Modals
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`;
    case "unit-7":
      // Message bubble / Discussion
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    case "unit-8":
      // Search / Cause & Effect
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    case "unit-9":
      // Briefcase / Professional
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
    case "unit-10":
      // Theater / Narrative
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    case "unit-11":
      // Volcano / Persuasive
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    case "unit-12":
      // Rocket / Phrasal Verbs
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`;
    default:
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
  }
}

function getTenseSvgIcon(tenseGroup) {
  switch (tenseGroup) {
    case "Present":
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>`;
    case "Past":
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 8 14"/></svg>`;
    case "Future":
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>`;
    case "Past Future":
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
    default:
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  }
}

// --- 1. INITIALIZATION & AUTH DETECTION ---
window.addEventListener("DOMContentLoaded", async () => {
  setupThemeToggle();
  initMobileMenu();
  loadLocalProgress();

  // Check student session
  const studentSessionRaw = sessionStorage.getItem("studentLoggedInSession") || sessionStorage.getItem("studentTimelineSession");
  if (studentSessionRaw) {
    try {
      studentProfile = JSON.parse(studentSessionRaw);
    } catch (e) {
      console.warn("Could not parse student session:", e);
    }
  }

  // Auth state listener for teachers/admins
  onAuthStateChanged(auth, async user => {
    if (user) {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          currentUserRole = (uData.role === "admin") ? "admin" : "teacher";
        } else {
          currentUserRole = "teacher";
        }
      } catch (e) {
        currentUserRole = "teacher";
      }
    } else if (studentProfile) {
      currentUserRole = "student";
    }

    applyRoleUI();
    populateClassSelector();
    initFirestoreListeners();
    renderQuestMap();
  });

  setupEventListeners();
});

// --- 2. THEME & UI HELPERS ---
function setupThemeToggle() {
  const themeToggleBtn = $("themeToggleBtn");
  const applyTheme = isDark => {
    document.body.classList.toggle("dark-theme", isDark);
    document.body.classList.toggle("dark-mode", isDark);
    document.querySelectorAll(".theme-icon-sun").forEach(el => el.style.setProperty("display", isDark ? "inline-block" : "none", "important"));
    document.querySelectorAll(".theme-icon-moon").forEach(el => el.style.setProperty("display", isDark ? "none" : "inline-block", "important"));
  };

  const savedTheme = localStorage.getItem("appTheme") || localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme === "dark");

  themeToggleBtn?.addEventListener("click", () => {
    const isDarkNow = !document.body.classList.contains("dark-theme");
    const newTheme = isDarkNow ? "dark" : "light";
    localStorage.setItem("appTheme", newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(isDarkNow);
  });
}

function initMobileMenu() {
  const kebabBtn = $("mobileTopbarKebabBtn");
  const dropdown = $("mobileTopbarDropdown");
  kebabBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!dropdown?.contains(e.target) && !kebabBtn?.contains(e.target)) {
      dropdown?.classList.add("hidden");
    }
  });

  const logoutHandler = async () => {
    localStorage.removeItem("portalSessionMeta");
    localStorage.removeItem("portalRememberedStudent");
    sessionStorage.clear();
    await signOut(auth);
    window.location.href = "index.html";
  };
  $("appLogoutBtn")?.addEventListener("click", logoutHandler);
  $("mobileLogoutBtn")?.addEventListener("click", logoutHandler);
}

// --- 3. ROLE RESTRICTION & CLASS GATING ---
function applyRoleUI() {
  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";
  const teacherControls = $("teacherControlsGroup");
  const teacherNotice = $("teacherActionNotice");
  const btnEditQuestions = $("btnEditQuestionsModal");
  const userRoleInd = $("userRoleIndicator");
  const backToAdminBtn = $("backToAdminBtn");
  const portalRoleSub = $("portalRoleSubtitle");

  if (isTeacherOrAdmin) {
    const teacherSublockControls = $("teacherSublockControls");
    if (teacherControls) teacherControls.style.display = "flex";
    if (teacherNotice) teacherNotice.style.display = "block";
    if (btnEditQuestions) btnEditQuestions.style.display = "inline-flex";
    if (teacherSublockControls) teacherSublockControls.style.display = "inline-flex";
    if (userRoleInd) userRoleInd.innerText = currentUserRole === "admin" ? "· Super Admin Mode" : "· Teacher Mode";
    if (backToAdminBtn) backToAdminBtn.style.display = "flex";
    if (portalRoleSub) portalRoleSub.innerText = "Teacher Workspace";

    // Strictly hide ALL student-only navigation menus for teacher & admin
    document.querySelectorAll(".student-only-nav").forEach(el => el.style.setProperty("display", "none", "important"));
  } else {
    const teacherSublockControls = $("teacherSublockControls");
    if (teacherControls) teacherControls.style.display = "none";
    if (teacherNotice) teacherNotice.style.display = "none";
    if (btnEditQuestions) btnEditQuestions.style.display = "none";
    if (teacherSublockControls) teacherSublockControls.style.display = "none";
    if (userRoleInd) userRoleInd.innerText = "· Student Mode";
    if (portalRoleSub) portalRoleSub.innerText = "Student Learning Quest";
    if (backToAdminBtn) backToAdminBtn.style.display = "flex";

    // Show student links for student
    document.querySelectorAll(".student-only-nav").forEach(el => el.style.removeProperty("display"));

    // Detect student's registered class
    if (studentProfile) {
      const detected = studentProfile.studentClass || studentProfile.class || "";
      const match = GRADE_CLASS_CATALOG.find(c => c.name.toLowerCase() === detected.toLowerCase() || c.id.toLowerCase() === detected.toLowerCase());
      if (match) {
        currentSelectedClass = match.name;
      }
    }
  }
}

function populateClassSelector() {
  const classSelect = $("classSelect");
  if (!classSelect) return;
  classSelect.innerHTML = "";

  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";

  GRADE_CLASS_CATALOG.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls.name;
    opt.textContent = cls.label;
    if (cls.name === currentSelectedClass) opt.selected = true;
    classSelect.appendChild(opt);
  });

  // GATING LOGIC: If user is a student, freeze the class select so they cannot browse other classes!
  if (!isTeacherOrAdmin && studentProfile) {
    classSelect.disabled = true;
    const restrictionBanner = $("classRestrictionBanner");
    const enrolledClassTag = $("enrolledClassTag");
    if (restrictionBanner && enrolledClassTag) {
      restrictionBanner.style.display = "block";
      enrolledClassTag.textContent = currentSelectedClass;
    }
  } else {
    classSelect.disabled = false;
  }

  updateHeroTitle();
}

function updateHeroTitle() {
  const heroClassTitle = $("heroClassTitle");
  if (heroClassTitle) {
    heroClassTitle.textContent = `${currentSelectedClass} ${currentSelectedSubject}`;
  }
}

// --- 4. FIRESTORE REAL-TIME LOCKS & CUSTOM QUESTIONS ---
function initFirestoreListeners() {
  // Clean up any existing listeners before attaching new ones for the selected class
  if (unsubModulesLock) {
    unsubModulesLock();
    unsubModulesLock = null;
  }
  if (unsubSubmaterialsLock) {
    unsubSubmaterialsLock();
    unsubSubmaterialsLock = null;
  }
  if (unsubCustomQuestions) {
    unsubCustomQuestions();
    unsubCustomQuestions = null;
  }

  // Listen to module lock status for the selected class
  const classDocId = currentSelectedClass.replace(/\s+/g, "_");
  
  unsubModulesLock = onSnapshot(doc(db, "learning_modules_config", classDocId), snap => {
    if (snap.exists()) {
      moduleLockMap = snap.data().locks || {};
    } else {
      // Default: All 12 units unlocked
      moduleLockMap = {};
      ENGLISH_G9_MODULES.forEach(m => moduleLockMap[m.id] = true);
    }
    renderQuestMap();
  }, err => {
    console.warn("Firestore lock sync:", err);
    ENGLISH_G9_MODULES.forEach(m => moduleLockMap[m.id] = true);
    renderQuestMap();
  });

  // Listen to granular sub-material lock status for the selected class
  unsubSubmaterialsLock = onSnapshot(doc(db, "learning_sublocks_config", classDocId), snap => {
    if (snap.exists()) {
      submaterialLockMap = snap.data().sublocks || {};
    } else {
      submaterialLockMap = {};
    }
    if (activeModalUnit) {
      renderUnifiedSubmaterialsGrid(activeModalUnit);
    }
  }, err => {
    console.warn("Firestore sublocks sync:", err);
  });

  // Listen to teacher customized questions
  unsubCustomQuestions = onSnapshot(doc(db, "learning_custom_questions", "English_G9"), snap => {
    if (snap.exists()) {
      customQuestionMap = snap.data().questionsByUnit || {};
    }
  });
}

async function saveSubmaterialLocks() {
  const classDocId = currentSelectedClass.replace(/\s+/g, "_");
  try {
    await setDoc(doc(db, "learning_sublocks_config", classDocId), {
      sublocks: submaterialLockMap,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to save sublocks to Firestore:", err);
  }
}

// --- 5. PROGRESS & XP MANAGEMENT (LOCAL STORAGE + STATS HUD) ---
function loadLocalProgress() {
  const code = studentProfile?.code || "DEFAULT_USER";
  const raw = localStorage.getItem(`lm_progress_${code}`);
  if (raw) {
    try {
      userProgress = JSON.parse(raw);
    } catch (e) {}
  }
  updateHudStats();
}

function saveLocalProgress() {
  const code = studentProfile?.code || "DEFAULT_USER";
  localStorage.setItem(`lm_progress_${code}`, JSON.stringify(userProgress));
  updateHudStats();
}

function updateHudStats() {
  const xpEl = $("hudXpDisplay");
  const rankEl = $("hudRankDisplay");
  const compEl = $("hudCompletedCount");

  const xp = userProgress.xp || 0;
  if (xpEl) xpEl.textContent = xp.toLocaleString();

  // Determine Rank without raw emojis
  let rank = "Novice Scholar";
  if (xp >= 3000) rank = "Polyglot Legend";
  else if (xp >= 2000) rank = "Syntax Sorcerer";
  else if (xp >= 1000) rank = "Grammar Knight";
  else if (xp >= 400) rank = "Tense Master";
  if (rankEl) rankEl.textContent = rank;

  const completedCount = Object.keys(userProgress.completedUnits || {}).length;
  if (compEl) compEl.textContent = `${completedCount} / ${ENGLISH_G9_MODULES.length}`;
}

// --- 6. RENDER QUEST MAP ---
function renderQuestMap() {
  const container = $("questGridContainer");
  if (!container) return;
  container.innerHTML = "";

  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";
  const isGrade9 = ["Grade 9A", "Grade 9B", "Grade 9C"].includes(currentSelectedClass);
  const isEnglish = currentSelectedSubject === "English";
  const isMaterialAvailable = isGrade9 && isEnglish;

  if (!isMaterialAvailable) {
    const isIct = currentSelectedSubject === "ICT";
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(30, 41, 59, 0.2); border-radius: 20px; border: 1px dashed #cbd5e1;">
        <div style="margin-bottom: 10px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></svg>
        </div>
        <h3 style="font-size: 20px; font-weight: 800; color: var(--lm-text-main); margin: 0 0 6px 0;">Curriculum in Preparation</h3>
        <p style="font-size: 14px; color: var(--lm-text-muted); margin: 0; max-width: 540px; margin-inline: auto; line-height: 1.6;">
          ${isIct 
            ? `The ICT learning material for <strong>${escapeHtml(currentSelectedClass)}</strong> is still being built.` 
            : `The English learning material for <strong>${escapeHtml(currentSelectedClass)}</strong> is still being built.`}
        </p>
      </div>
    `;
    return;
  }

  ENGLISH_G9_MODULES.forEach(mod => {
    // Determine lock state (Default unlocked if undefined)
    const isUnlocked = moduleLockMap[mod.id] !== false;
    const isCompleted = Boolean(userProgress.completedUnits?.[mod.id]);

    const card = document.createElement("article");
    card.className = `lm-quest-card ${!isUnlocked ? "locked" : ""} ${isCompleted ? "completed" : ""}`;
    card.setAttribute("data-unit-id", mod.id);

    const lockSvg = isUnlocked 
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

    const statusIconSvg = isUnlocked
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

    card.innerHTML = `
      <div class="lm-card-top">
        <div class="lm-level-circle">${getUnitSvgIcon(mod.id)}</div>
        <div class="lm-card-pills">
          <span class="lm-card-cat">${escapeHtml(mod.category)}</span>
          ${isTeacherOrAdmin ? `
            <button type="button" class="lm-lock-indicator lm-btn-toggle-lock" data-unit-id="${mod.id}" title="${isUnlocked ? 'Click to Lock from Students' : 'Click to Unlock for Students'}" style="background: none; border: 0; cursor: pointer; padding: 2px;">
              ${lockSvg}
            </button>
          ` : `
            <span class="lm-lock-indicator">${statusIconSvg}</span>
          `}
        </div>
      </div>

      <div class="lm-card-mid">
        <div style="font-size: 11px; font-weight: 800; color: #2563eb; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">Level ${mod.level} Quest</div>
        <h3 class="lm-card-title">${escapeHtml(mod.title)}</h3>
        <p class="lm-card-sub">${escapeHtml(mod.subtitle)}</p>
      </div>

      <div class="lm-card-bottom">
        <div class="lm-card-xp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#fbbf24"/></svg>
          <span>+${mod.xpReward} XP</span>
        </div>
        <div class="lm-card-status">
          ${isCompleted ? '<span>✓ Mastered</span>' : (isUnlocked ? '<span>Enter Quest →</span>' : '<span>Locked</span>')}
        </div>
      </div>
    `;

    // Click handler to open quest modal
    card.addEventListener("click", e => {
      // Don't open if clicked the teacher lock button directly
      if (e.target.closest(".lm-btn-toggle-lock")) return;

      if (!isUnlocked && !isTeacherOrAdmin) {
        alert("This module is currently locked by your teacher. Please check back when it's assigned!");
        return;
      }
      openLessonModal(mod);
    });

    container.appendChild(card);
  });

  // Setup Teacher lock button click events
  if (isTeacherOrAdmin) {
    document.querySelectorAll(".lm-btn-toggle-lock").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const unitId = btn.getAttribute("data-unit-id");
        const current = moduleLockMap[unitId] !== false;
        moduleLockMap[unitId] = !current;
        await saveModuleLocks();
        renderQuestMap();
      });
    });
  }
}

// --- 7. TEACHER ACTIONS: LOCK / UNLOCK ALL & SAVE ---
async function saveModuleLocks() {
  const classDocId = currentSelectedClass.replace(/\s+/g, "_");
  try {
    await setDoc(doc(db, "learning_modules_config", classDocId), {
      locks: moduleLockMap,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to save locks to Firestore:", err);
  }
}

// --- 8. LESSON & PRACTICE MODAL ---
function openLessonModal(unit) {
  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";
  const isUnlocked = moduleLockMap[unit.id] !== false;

  // Strict Security Check: Block student access even if called via console / inspect element
  if (!isUnlocked && !isTeacherOrAdmin) {
    alert("Access Denied: This module is currently locked by your teacher.");
    return;
  }

  activeModalUnit = unit;
  const overlay = $("lessonModalOverlay");
  if (!overlay) return;

  $("modalUnitIcon").innerHTML = getUnitSvgIcon(unit.id);
  $("modalUnitTitle").textContent = unit.title;
  $("modalUnitBadge").textContent = unit.badge;
  $("modalUnitSub").textContent = unit.subtitle;

  const tensesHub = $("tensesHubContainer");
  const standardLesson = $("standardLessonContainer");

  // All Units (Unit 1 to Unit 12) now enjoy deep-dive interactive sub-material hubs
  if (tensesHub) tensesHub.style.display = "block";
  if (standardLesson) standardLesson.style.display = "none";
  initUnitSubmaterialsHub(unit);

  overlay.classList.add("active");
}

function switchModalTab(tabKey) {
  document.querySelectorAll(".lm-modal-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabKey);
  });

  $("tabTheory").style.display = tabKey === "theory" ? "block" : "none";
  $("tabContexts").style.display = tabKey === "contexts" ? "block" : "none";
  $("tabArena").style.display = tabKey === "arena" ? "block" : "none";
}

// --- 9. GAMIFIED PRACTICE ARENA LOGIC ---
function initPracticeArena(unit) {
  // Check if teacher provided custom questions for this unit
  const questions = customQuestionMap[unit.id] && customQuestionMap[unit.id].length > 0 
    ? customQuestionMap[unit.id] 
    : unit.practiceQuestions;

  activeQuizState = {
    questions: questions,
    currentIndex: 0,
    score: 0,
    userAnswers: []
  };

  $("arenaQuizContainer").style.display = "block";
  $("arenaCelebrationView").style.display = "none";
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const { questions, currentIndex } = activeQuizState;
  const currentQ = questions[currentIndex];
  if (!currentQ) return;

  const total = questions.length;
  $("quizQuestionCount").textContent = `Question ${currentIndex + 1} of ${total}`;
  $("quizProgressBar").style.width = `${((currentIndex + 1) / total) * 100}%`;
  $("quizQuestionText").innerHTML = currentQ.question;

  const optionsContainer = $("quizOptionsList");
  optionsContainer.innerHTML = "";

  const letters = ["A", "B", "C", "D"];
  currentQ.options.forEach((optText, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lm-quiz-option-btn";
    btn.innerHTML = `
      <span class="lm-option-letter">${letters[idx]}</span>
      <span>${escapeHtml(optText)}</span>
    `;

    btn.addEventListener("click", () => handleOptionSelection(idx, currentQ));
    optionsContainer.appendChild(btn);
  });

  $("quizFeedbackPanel").style.display = "none";
  $("btnNextQuestion").style.display = "none";
}

function handleOptionSelection(selectedIdx, question) {
  const isCorrect = selectedIdx === question.correctIndex;
  const optionButtons = document.querySelectorAll(".lm-quiz-option-btn");

  // Disable all options once answered
  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === question.correctIndex) {
      btn.classList.add("correct");
    } else if (idx === selectedIdx && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  if (isCorrect) activeQuizState.score++;

  // Feedback Panel
  const feedbackPanel = $("quizFeedbackPanel");
  const feedbackTitle = $("quizFeedbackTitle");
  const feedbackText = $("quizFeedbackText");

  feedbackPanel.className = `lm-feedback-panel ${isCorrect ? 'correct' : 'incorrect'}`;
  feedbackTitle.innerHTML = isCorrect
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Brilliant! Correct Answer`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Not Quite Right`;
  feedbackText.innerHTML = question.explanation;
  feedbackPanel.style.display = "block";

  const nextBtn = $("btnNextQuestion");
  nextBtn.style.display = "inline-block";
  const isLast = activeQuizState.currentIndex >= activeQuizState.questions.length - 1;
  nextBtn.textContent = isLast ? "Finish Quest →" : "Next Question →";
}

function handleNextQuestion() {
  activeQuizState.currentIndex++;
  if (activeQuizState.currentIndex < activeQuizState.questions.length) {
    renderCurrentQuestion();
  } else {
    showCelebrationView();
  }
}

function showCelebrationView() {
  $("arenaQuizContainer").style.display = "none";
  const celebrationView = $("arenaCelebrationView");
  celebrationView.style.display = "block";

  const total = activeQuizState.questions.length;
  const score = activeQuizState.score;
  const percentage = Math.round((score / total) * 100);

  const scoreText = $("celebrationScoreText");
  const xpText = $("celebrationXpText");

  scoreText.textContent = `You scored ${score} out of ${total} (${percentage}%) on this quest!`;

  // Award XP based on score
  const earnedXp = Math.round(activeModalUnit.xpReward * (score / total));
  xpText.textContent = `+${earnedXp} XP Awarded!`;

  // Record completion if passed (> 60%)
  if (percentage >= 60) {
    userProgress.completedUnits[activeModalUnit.id] = true;
    userProgress.xp = (userProgress.xp || 0) + earnedXp;
    saveLocalProgress();
    renderQuestMap();
  }
}

// --- 9.5 ALGORITHMIC QUESTION GENERATOR ---
function generateFreshQuestionSet(target) {
  const baseQuestions = target.multipleChoice || target.practiceQuestions || [];
  const subjects = [
    "Dr. Martinez", "The laboratory team", "Maya and her classmates", "The flight controller",
    "The youth robotics delegation", "Professor Higgins", "The environmental rangers", "The software engineers",
    "Elena and Sophia", "The astronomical observatory crew", "The architectural designer", "The marine biologists",
    "Our student council", "The debate squad", "The senior surgeon"
  ];
  const timeContexts = [
    "promptly at dawn", "during the regional symposium", "in accordance with protocol", "after rigorous deliberation",
    "under strict supervision", "before the final deadline", "throughout the championship season", "without hesitation",
    "across the global network", "at the international summit", "following the safety drill", "prior to the keynote address",
    "in the advanced simulation", "with remarkable precision", "during the field exploration"
  ];

  const freshList = [];
  for (let i = 0; i < 15; i++) {
    const subj = subjects[i % subjects.length];
    const ctx = timeContexts[i % timeContexts.length];
    const baseQ = baseQuestions[i % baseQuestions.length];

    if (!baseQ) continue;

    // Craft varied prompt
    const promptText = baseQ.question
      ? `${subj}: ${baseQ.question.replace(/^[^_]+/, subj)} (${ctx})`
      : `${subj} _______ the requirements ${ctx}.`;

    const options = baseQ.options ? [...baseQ.options] : ["Option A", "Option B", "Option C", "Option D"];
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    const correctOpt = baseQ.options ? baseQ.options[baseQ.correctIndex || 0] : shuffled[0];
    const newCorrectIdx = shuffled.indexOf(correctOpt);

    freshList.push({
      id: `fresh-${target.id}-${i + 1}-${Date.now().toString().slice(-4)}`,
      question: promptText,
      options: shuffled,
      correctIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
      explanation: baseQ.explanation || `Correct answer is '${correctOpt}'.`
    });
  }

  return freshList;
}

// --- 10. TEACHER QUESTION EDITOR MODAL ---
function openTeacherEditorModal() {
  const currentTarget = activeTense || activeModalUnit;
  if (!currentTarget) return;
  $("editorUnitTitle").textContent = currentTarget.title;
  renderTeacherQuestionsEditor();
  $("teacherEditorOverlay").classList.add("active");
}

function renderTeacherQuestionsEditor() {
  const container = $("teacherQuestionsList");
  if (!container) return;
  container.innerHTML = "";

  const currentTarget = activeTense || activeModalUnit;
  if (!currentTarget) return;

  const targetKey = currentTarget.id;
  const questions = customQuestionMap[targetKey] && customQuestionMap[targetKey].length > 0
    ? customQuestionMap[targetKey]
    : (currentTarget.multipleChoice || currentTarget.practiceQuestions || []);

  questions.forEach((q, qIdx) => {
    const card = document.createElement("div");
    card.className = "lm-editor-q-card";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 800; font-size: 13px; color: #93c5fd;">Question ${qIdx + 1}</span>
        <button type="button" class="lm-modal-close-btn lm-btn-delete-q" data-idx="${qIdx}" style="width: 26px; height: 26px; font-size: 13px;">✕</button>
      </div>
      <label style="font-size: 11.5px; color: #94a3b8; font-weight: 700;">Question Prompt:</label>
      <input type="text" class="lm-editor-input q-prompt" value="${escapeHtml(q.question)}" data-idx="${qIdx}">
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        ${q.options.map((opt, oIdx) => `
          <div>
            <label style="font-size: 11px; color: ${oIdx === q.correctIndex ? '#10b981' : '#94a3b8'}; font-weight: 700;">
              Option ${String.fromCharCode(65 + oIdx)} ${oIdx === q.correctIndex ? '(Correct)' : ''}:
            </label>
            <input type="text" class="lm-editor-input q-opt" value="${escapeHtml(opt)}" data-qidx="${qIdx}" data-oidx="${oIdx}">
          </div>
        `).join("")}
      </div>

      <div style="display: flex; gap: 12px; align-items: center; margin-top: 6px;">
        <label style="font-size: 11.5px; color: #94a3b8; font-weight: 700;">Correct Option Index (0-3):</label>
        <select class="lm-select q-correct" data-idx="${qIdx}" style="min-width: 80px; padding: 4px 8px;">
          <option value="0" ${q.correctIndex === 0 ? 'selected' : ''}>A (0)</option>
          <option value="1" ${q.correctIndex === 1 ? 'selected' : ''}>B (1)</option>
          <option value="2" ${q.correctIndex === 2 ? 'selected' : ''}>C (2)</option>
          <option value="3" ${q.correctIndex === 3 ? 'selected' : ''}>D (3)</option>
        </select>
      </div>

      <label style="font-size: 11.5px; color: #94a3b8; font-weight: 700; margin-top: 8px; display: block;">Explanation:</label>
      <input type="text" class="lm-editor-input q-explanation" value="${escapeHtml(q.explanation)}" data-idx="${qIdx}">
    `;
    container.appendChild(card);
  });

  // Delete handler
  container.querySelectorAll(".lm-btn-delete-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      questions.splice(idx, 1);
      renderTeacherQuestionsEditor();
    });
  });
}

// --- 11. SETUP EVENT LISTENERS ---
function setupEventListeners() {
  // Class selection change
  $("classSelect")?.addEventListener("change", e => {
    currentSelectedClass = e.target.value;
    updateHeroTitle();
    initFirestoreListeners();
  });

  // Subject tabs
  document.querySelectorAll(".lm-subject-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".lm-subject-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentSelectedSubject = pill.getAttribute("data-subject");
      updateHeroTitle();
      renderQuestMap();
    });
  });

  // Modal tabs
  document.querySelectorAll(".lm-modal-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchModalTab(btn.getAttribute("data-tab"));
    });
  });

  // Close Lesson modal
  $("modalCloseBtn")?.addEventListener("click", () => {
    $("lessonModalOverlay")?.classList.remove("active");
  });

  // Practice arena Next & Finish buttons
  $("btnNextQuestion")?.addEventListener("click", handleNextQuestion);
  $("btnFinishQuest")?.addEventListener("click", () => {
    $("lessonModalOverlay")?.classList.remove("active");
  });

  // Teacher Controls: Unlock All & Lock All
  $("btnUnlockAll")?.addEventListener("click", async () => {
    ENGLISH_G9_MODULES.forEach(m => moduleLockMap[m.id] = true);
    await saveModuleLocks();
    renderQuestMap();
  });

  // Teacher Sublock Controls inside Modal (Unlock All / Lock All sub-materials in current unit)
  $("btnUnlockAllSubmaterials")?.addEventListener("click", async () => {
    if (!activeModalUnit) return;
    const subs = getActiveSubmaterials(activeModalUnit);
    subs.forEach(s => submaterialLockMap[s.id] = true);
    await saveSubmaterialLocks();
    renderUnifiedSubmaterialsGrid(activeModalUnit);
  });

  $("btnLockAllSubmaterials")?.addEventListener("click", async () => {
    if (!activeModalUnit) return;
    const subs = getActiveSubmaterials(activeModalUnit);
    subs.forEach(s => submaterialLockMap[s.id] = false);
    await saveSubmaterialLocks();
    renderUnifiedSubmaterialsGrid(activeModalUnit);
  });

  // Teacher Question Editor open/close
  $("btnEditQuestionsModal")?.addEventListener("click", openTeacherEditorModal);
  $("teacherEditorCloseBtn")?.addEventListener("click", () => {
    $("teacherEditorOverlay")?.classList.remove("active");
  });

  // Generate Fresh Questions
  $("btnGenerateFreshQuestions")?.addEventListener("click", async () => {
    const targetKey = activeTense ? activeTense.id : activeModalUnit?.id;
    if (!targetKey) return;

    if (!confirm(`Generate a fresh randomized set of 15 Multiple Choice and 15 Fill-in-the-Blank questions for "${activeTense ? activeTense.title : activeModalUnit.title}"?`)) {
      return;
    }

    const freshQs = generateFreshQuestionSet(activeTense || activeModalUnit);
    customQuestionMap[targetKey] = freshQs;

    try {
      await setDoc(doc(db, "learning_custom_questions", "English_G9"), {
        questionsByUnit: customQuestionMap
      }, { merge: true });
      alert("Fresh 15-question set successfully generated and published to class!");
      renderTeacherQuestionsEditor();
      if (activeTense) {
        activeTense.multipleChoice = freshQs;
        initTenseMcq(activeTense);
      }
    } catch (e) {
      alert("Failed to save fresh questions: " + e.message);
    }
  });

  // Add new question
  $("btnAddCustomQuestion")?.addEventListener("click", () => {
    const targetKey = activeTense ? activeTense.id : activeModalUnit?.id;
    if (!targetKey) return;

    if (!customQuestionMap[targetKey]) {
      const existing = activeTense ? (activeTense.multipleChoice || []) : (activeModalUnit.practiceQuestions || []);
      customQuestionMap[targetKey] = [...existing];
    }
    customQuestionMap[targetKey].push({
      id: `custom-q-${Date.now()}`,
      question: "Enter your custom question prompt here...",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctIndex: 0,
      explanation: "Explanation of why Option A is correct."
    });
    renderTeacherQuestionsEditor();
  });

  // Reset questions to defaults
  $("btnResetQuestions")?.addEventListener("click", async () => {
    if (confirm("Reset all questions for this unit back to default curriculum questions?")) {
      delete customQuestionMap[activeModalUnit.id];
      await setDoc(doc(db, "learning_custom_questions", "English_G9"), {
        questionsByUnit: customQuestionMap
      }, { merge: true });
      initPracticeArena(activeModalUnit);
      $("teacherEditorOverlay")?.classList.remove("active");
    }
  });

  // Save custom questions
  $("btnSaveQuestions")?.addEventListener("click", async () => {
    const questionsContainer = $("teacherQuestionsList");
    const cards = questionsContainer.querySelectorAll(".lm-editor-q-card");
    const updatedList = [];

    cards.forEach((card, idx) => {
      const questionText = card.querySelector(".q-prompt")?.value || "";
      const explanation = card.querySelector(".q-explanation")?.value || "";
      const correctIndex = Number(card.querySelector(".q-correct")?.value || 0);

      const opts = [];
      card.querySelectorAll(".q-opt").forEach(optIn => opts.push(optIn.value));

      updatedList.push({
        id: `custom-q-${idx + 1}`,
        question: questionText,
        options: opts,
        correctIndex: correctIndex,
        explanation: explanation
      });
    });

    customQuestionMap[activeModalUnit.id] = updatedList;

    try {
      await setDoc(doc(db, "learning_custom_questions", "English_G9"), {
        questionsByUnit: customQuestionMap
      }, { merge: true });
      alert("Questions successfully published to classroom!");
      initPracticeArena(activeModalUnit);
      $("teacherEditorOverlay")?.classList.remove("active");
    } catch (e) {
      alert("Failed to save questions: " + e.message);
    }
  });

  // 16 Tenses Hub Event Listeners
  setupTensesHubEventListeners();
}

// ============================================================
// --- 12. UNIFIED DEEP-DIVE SUB-MATERIALS HUB (UNITS 1 - 12) ---
// ============================================================

function getActiveSubmaterials(unit) {
  if (unit.id === "unit-1") {
    return TENSES_DATA;
  }
  return UNIT_SUBMATERIALS[unit.id] || [];
}

function initUnitSubmaterialsHub(unit) {
  activeTenseFilter = "all";
  $("tensesGridView").style.display = "grid";
  $("tenseDetailView").style.display = "none";

  const filterBar = document.querySelector(".tenses-filter-bar");
  const backBtnText = $("btnBackToTensesText");

  if (unit.id === "unit-1") {
    if (filterBar) filterBar.style.display = "flex";
    if (backBtnText) backBtnText.textContent = "Back to All 16 Tenses";

    // Reset filter buttons
    document.querySelectorAll(".tense-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-filter") === "all");
    });
  } else {
    // Hide tense-specific filter bar for other units
    if (filterBar) filterBar.style.display = "none";
    if (backBtnText) backBtnText.textContent = `Back to ${unit.title} Topics`;
  }

  renderUnifiedSubmaterialsGrid(unit);
}

function renderUnifiedSubmaterialsGrid(unit) {
  const container = $("tensesGridView");
  if (!container || !unit) return;
  container.innerHTML = "";

  const allSubmaterials = getActiveSubmaterials(unit);

  const filtered = (unit.id === "unit-1" && activeTenseFilter !== "all")
    ? allSubmaterials.filter(t => t.group.toLowerCase() === activeTenseFilter.toLowerCase())
    : allSubmaterials;

  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";

  filtered.forEach(item => {
    // Check granular sub-material lock state
    // Default unlocked (true) if not set to false
    const isSubUnlocked = submaterialLockMap[item.id] !== false;

    const card = document.createElement("div");
    card.className = `tense-card ${!isSubUnlocked ? "sub-locked" : ""}`;
    card.setAttribute("data-sub-id", item.id);

    const groupClass = "tense-pill-" + (item.group || "present").toLowerCase().replace(/\s+/g, "");

    const lockIconSvg = isSubUnlocked
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

    const customQs = customQuestionMap[item.id];
    const mcCount = customQs ? customQs.length : (item.multipleChoice?.length || 15);
    const fibCount = item.fillInBlank?.length || 15;

    card.innerHTML = `
      <div class="tense-card-top">
        <div class="tense-card-icon">${getTenseSvgIcon(item.group || "Present")}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="tense-pill-group ${groupClass}">${escapeHtml(item.group || item.badge || "Topic")}</span>
          ${isTeacherOrAdmin ? `
            <button type="button" class="lm-sublock-btn lm-btn-toggle-sublock" data-sub-id="${item.id}" title="${isSubUnlocked ? 'Lock this topic from students' : 'Unlock this topic for students'}">
              ${lockIconSvg}
            </button>
          ` : `
            ${!isSubUnlocked ? `<span title="Locked by Teacher" style="display: flex;">${lockIconSvg}</span>` : ''}
          `}
        </div>
      </div>
      <div>
        <h4 class="tense-card-title">${escapeHtml(item.title)}</h4>
        <p class="tense-card-summary">${escapeHtml(item.summary)}</p>
      </div>
      <div class="tense-card-foot">
        <span>${fibCount} Blank · ${mcCount} Quiz</span>
        <span>${isSubUnlocked || isTeacherOrAdmin ? 'Study & Practice →' : '🔒 Locked'}</span>
      </div>
    `;

    card.addEventListener("click", e => {
      if (e.target.closest(".lm-btn-toggle-sublock")) return;

      if (!isSubUnlocked && !isTeacherOrAdmin) {
        alert("This topic is currently locked by your teacher. Please explore the unlocked topics first!");
        return;
      }
      openTenseDetail(item);
    });

    container.appendChild(card);
  });

  // Attach teacher sublock button listeners
  if (isTeacherOrAdmin) {
    container.querySelectorAll(".lm-btn-toggle-sublock").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const subId = btn.getAttribute("data-sub-id");
        const current = submaterialLockMap[subId] !== false;
        submaterialLockMap[subId] = !current;
        await saveSubmaterialLocks();
        renderUnifiedSubmaterialsGrid(unit);
      });
    });
  }
}

function openTenseDetail(item) {
  const isTeacherOrAdmin = currentUserRole === "teacher" || currentUserRole === "admin";
  const isSubUnlocked = submaterialLockMap[item.id] !== false;

  // Strict Security Check: Block student access even if called via console / inspect element
  if (!isSubUnlocked && !isTeacherOrAdmin) {
    alert("Access Denied: This topic is currently locked by your teacher.");
    return;
  }

  activeTense = item;
  $("tensesGridView").style.display = "none";
  const detailView = $("tenseDetailView");
  detailView.style.display = "block";
  $("tensesHubContainer")?.scrollTo({ top: 0, behavior: "smooth" });

  // Header info
  $("tenseDetailBadge").textContent = item.group || item.badge || "Topic";
  $("tenseDetailIcon").innerHTML = getTenseSvgIcon(item.group || "Present");
  $("tenseDetailTitle").textContent = item.title;
  $("tenseDetailSummary").textContent = item.summary;

  // Formula & Theory
  $("tenseFormulaAff").textContent = item.formula?.affirmative || "N/A";
  $("tenseFormulaNeg").textContent = item.formula?.negative || "N/A";
  $("tenseFormulaInt").textContent = item.formula?.interrogative || "N/A";
  $("tenseFormulaNotes").innerHTML = `<strong>💡 Key Grammar Note:</strong> ${escapeHtml(item.formula?.notes || "Pay attention to correct syntactic markers.")}`;

  // Uses
  const usesContainer = $("tenseUsesList");
  usesContainer.innerHTML = (item.uses || []).map(u => `
    <div class="tense-use-item">
      <div class="tense-use-sit">${escapeHtml(u.situation)}</div>
      <div class="tense-use-ex">"${escapeHtml(u.example)}"</div>
    </div>
  `).join("");

  // Signals
  const signalsContainer = $("tenseSignalsList");
  signalsContainer.innerHTML = (item.timeSignals || []).map(s => `
    <span class="tense-signal-pill">${escapeHtml(s)}</span>
  `).join("");

  // Reset to Theory tab
  switchTenseSubtab("theory");

  // Init Practices
  initTenseFillInBlank(item);
  initTenseMcq(item);
}

function switchTenseSubtab(tabKey) {
  document.querySelectorAll(".tense-subtab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-subtab") === tabKey);
  });

  $("tenseSubtabTheory").style.display = tabKey === "theory" ? "block" : "none";
  $("tenseSubtabFillBlank").style.display = tabKey === "fillblank" ? "block" : "none";
  $("tenseSubtabMcq").style.display = tabKey === "mcq" ? "block" : "none";
}

// --- FILL IN THE BLANK PRACTICE ---
function initTenseFillInBlank(tense) {
  const container = $("fibQuestionsList");
  const summaryCard = $("fibSummaryCard");
  if (!container) return;

  container.innerHTML = "";
  if (summaryCard) summaryCard.style.display = "none";

  tense.fillInBlank.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "fib-card";
    card.id = `fibCard_${idx}`;

    card.innerHTML = `
      <div class="fib-prompt">
        <span style="color: #60a5fa; font-weight: 800; margin-right: 6px;">#${idx + 1}</span>
        ${escapeHtml(item.sentence)}
      </div>
      <div class="fib-input-row">
        <input type="text" class="fib-input" id="fibInput_${idx}" placeholder="Type verb form here..." autocomplete="off" spellcheck="false">
        <button type="button" class="fib-btn-check" id="fibBtnCheck_${idx}">Check Answer</button>
      </div>
      <div class="fib-feedback" id="fibFeedback_${idx}"></div>
    `;

    const input = card.querySelector(`#fibInput_${idx}`);
    const btnCheck = card.querySelector(`#fibBtnCheck_${idx}`);

    const verifyAnswer = () => {
      const val = (input.value || "").trim().toLowerCase();
      if (!val) {
        input.focus();
        return;
      }

      const feedback = card.querySelector(`#fibFeedback_${idx}`);
      const isCorrect = item.acceptableAnswers.some(ans => ans.trim().toLowerCase() === val);

      if (isCorrect) {
        card.classList.remove("state-incorrect");
        card.classList.add("state-correct");
        feedback.className = "fib-feedback correct";
        feedback.innerHTML = `✓ <strong>Correct!</strong> ${escapeHtml(item.explanation)}`;
        btnCheck.disabled = true;
        btnCheck.textContent = "Solved ✓";
        input.disabled = true;

        // Award micro XP
        userProgress.xp = (userProgress.xp || 0) + 15;
        saveLocalProgress();
      } else {
        card.classList.add("state-incorrect");
        feedback.className = "fib-feedback incorrect";
        feedback.innerHTML = `✕ <strong>Not quite.</strong> Accepted: <em>${item.acceptableAnswers.join(" / ")}</em>. ${escapeHtml(item.explanation)}`;
      }

      checkAllFibFinished(tense);
    };

    btnCheck.addEventListener("click", verifyAnswer);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") verifyAnswer();
    });

    container.appendChild(card);
  });
}

function checkAllFibFinished(tense) {
  const cards = document.querySelectorAll(".fib-card");
  const solvedCards = document.querySelectorAll(".fib-card.state-correct");
  if (cards.length > 0 && solvedCards.length === cards.length) {
    const summaryCard = $("fibSummaryCard");
    const summaryScore = $("fibSummaryScore");
    if (summaryCard && summaryScore) {
      summaryScore.textContent = `Magnificent! You correctly solved all ${cards.length} blank exercises for ${tense.title}! (+${cards.length * 15} XP)`;
      summaryCard.style.display = "block";
    }
  }
}

// --- MULTIPLE CHOICE PRACTICE FOR TENSE ---
function initTenseMcq(tense) {
  activeTenseMcqState = {
    questions: tense.multipleChoice || [],
    currentIndex: 0,
    score: 0
  };

  $("tenseMcqContainer").style.display = "block";
  $("tenseMcqCelebration").style.display = "none";
  renderTenseMcqQuestion();
}

function renderTenseMcqQuestion() {
  const { questions, currentIndex } = activeTenseMcqState;
  const currentQ = questions[currentIndex];
  if (!currentQ) return;

  const total = questions.length;
  $("tenseMcqCount").textContent = `Question ${currentIndex + 1} of ${total}`;
  $("tenseMcqProgressBar").style.width = `${((currentIndex + 1) / total) * 100}%`;
  $("tenseMcqQuestionText").innerHTML = currentQ.question;

  const optionsContainer = $("tenseMcqOptionsList");
  optionsContainer.innerHTML = "";

  const letters = ["A", "B", "C", "D"];
  currentQ.options.forEach((optText, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lm-quiz-option-btn";
    btn.innerHTML = `
      <span class="lm-option-letter">${letters[idx]}</span>
      <span>${escapeHtml(optText)}</span>
    `;

    btn.addEventListener("click", () => handleTenseMcqSelection(idx, currentQ));
    optionsContainer.appendChild(btn);
  });

  $("tenseMcqFeedbackPanel").style.display = "none";
  $("btnTenseMcqNext").style.display = "none";
}

function handleTenseMcqSelection(selectedIdx, question) {
  const isCorrect = selectedIdx === question.correctIndex;
  const optionButtons = document.querySelectorAll("#tenseMcqOptionsList .lm-quiz-option-btn");

  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === question.correctIndex) {
      btn.classList.add("correct");
    } else if (idx === selectedIdx && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  if (isCorrect) activeTenseMcqState.score++;

  const feedbackPanel = $("tenseMcqFeedbackPanel");
  const feedbackTitle = $("tenseMcqFeedbackTitle");
  const feedbackText = $("tenseMcqFeedbackText");

  feedbackPanel.className = `lm-feedback-panel ${isCorrect ? 'correct' : 'incorrect'}`;
  feedbackTitle.innerHTML = isCorrect
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Correct!`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Incorrect`;
  feedbackText.innerHTML = question.explanation;
  feedbackPanel.style.display = "block";

  const nextBtn = $("btnTenseMcqNext");
  nextBtn.style.display = "inline-block";
  const isLast = activeTenseMcqState.currentIndex >= activeTenseMcqState.questions.length - 1;
  nextBtn.textContent = isLast ? "Complete Quiz →" : "Next Question →";
}

function handleTenseMcqNext() {
  activeTenseMcqState.currentIndex++;
  if (activeTenseMcqState.currentIndex < activeTenseMcqState.questions.length) {
    renderTenseMcqQuestion();
  } else {
    // Show Tense MCQ Celebration
    $("tenseMcqContainer").style.display = "none";
    const celeb = $("tenseMcqCelebration");
    celeb.style.display = "block";

    const total = activeTenseMcqState.questions.length;
    const score = activeTenseMcqState.score;
    const percent = Math.round((score / total) * 100);

    $("tenseMcqCelebrationScore").textContent = `You scored ${score}/${total} (${percent}%) on ${activeTense.title}!`;
    userProgress.xp = (userProgress.xp || 0) + (score * 25);
    saveLocalProgress();
  }
}

function setupTensesHubEventListeners() {
  // Filter pills
  document.querySelectorAll(".tense-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tense-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTenseFilter = btn.getAttribute("data-filter");
      renderUnifiedSubmaterialsGrid(activeModalUnit);
    });
  });

  // Back to Topics / Submaterials button
  $("btnBackToTenses")?.addEventListener("click", () => {
    $("tensesGridView").style.display = "grid";
    $("tenseDetailView").style.display = "none";
    if (activeModalUnit) {
      renderUnifiedSubmaterialsGrid(activeModalUnit);
    }
    $("tensesHubContainer")?.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Subtab switching
  document.querySelectorAll(".tense-subtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTenseSubtab(btn.getAttribute("data-subtab"));
    });
  });

  // FIB Reset button
  $("btnResetFib")?.addEventListener("click", () => {
    if (activeTense) initTenseFillInBlank(activeTense);
  });

  // Tense MCQ Next & Retry buttons
  $("btnTenseMcqNext")?.addEventListener("click", handleTenseMcqNext);
  $("btnTenseMcqRetry")?.addEventListener("click", () => {
    if (activeTense) initTenseMcq(activeTense);
  });
}

