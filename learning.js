// learning.js - Gamified Learning Module Logic & Access Control
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";
import { ENGLISH_G9_MODULES, GRADE_CLASS_CATALOG } from "./learningData.js";
import { escapeHtml } from "./utils.js";

// Session & State variables
let currentUserRole = "student"; // "student" | "teacher" | "admin"
let studentProfile = null;
let currentSelectedClass = "Grade 9A";
let currentSelectedSubject = "English";
let moduleLockMap = {}; // { [moduleId]: boolean } true = unlocked, false = locked
let customQuestionMap = {}; // { [unitId]: Question[] }
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

// DOM references
const $ = id => document.getElementById(id);

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
    if (teacherControls) teacherControls.style.display = "flex";
    if (teacherNotice) teacherNotice.style.display = "block";
    if (btnEditQuestions) btnEditQuestions.style.display = "inline-flex";
    if (userRoleInd) userRoleInd.innerText = currentUserRole === "admin" ? "· Super Admin Mode" : "· Teacher Mode";
    if (backToAdminBtn) backToAdminBtn.style.display = "flex";
    if (portalRoleSub) portalRoleSub.innerText = "Teacher Workspace";

    // Hide student-only links for staff
    document.querySelectorAll(".student-only-nav").forEach(el => el.style.display = "none");
  } else {
    if (teacherControls) teacherControls.style.display = "none";
    if (teacherNotice) teacherNotice.style.display = "none";
    if (btnEditQuestions) btnEditQuestions.style.display = "none";
    if (userRoleInd) userRoleInd.innerText = "· Student Mode";
    if (portalRoleSub) portalRoleSub.innerText = "Student Learning Quest";

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
  // Listen to module lock status for the selected class
  const classDocId = currentSelectedClass.replace(/\s+/g, "_");
  
  onSnapshot(doc(db, "learning_modules_config", classDocId), snap => {
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

  // Listen to teacher customized questions
  onSnapshot(doc(db, "learning_custom_questions", "English_G9"), snap => {
    if (snap.exists()) {
      customQuestionMap = snap.data().questionsByUnit || {};
    }
  });
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

  // Determine Rank
  let rank = "Novice Scholar";
  if (xp >= 3000) rank = "Polyglot Legend 👑";
  else if (xp >= 2000) rank = "Syntax Sorcerer 🔮";
  else if (xp >= 1000) rank = "Grammar Knight ⚔️";
  else if (xp >= 400) rank = "Tense Master ⏱️";
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
  const isEnglishG9 = currentSelectedClass.startsWith("Grade 9") && currentSelectedSubject === "English";

  if (!isEnglishG9) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(30, 41, 59, 0.4); border-radius: 20px; border: 1px dashed rgba(255, 255, 255, 0.15);">
        <div style="font-size: 40px; margin-bottom: 10px;">🚧</div>
        <h3 style="font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 6px 0;">Curriculum in Preparation</h3>
        <p style="font-size: 14px; color: #94a3b8; margin: 0;">
          The deep learning curriculum for <strong>${escapeHtml(currentSelectedClass)} · ${escapeHtml(currentSelectedSubject)}</strong> is currently being assembled. Grade 9 English is fully available!
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

    card.innerHTML = `
      <div class="lm-card-top">
        <div class="lm-level-circle">${escapeHtml(mod.icon)}</div>
        <div class="lm-card-pills">
          <span class="lm-card-cat">${escapeHtml(mod.category)}</span>
          ${isTeacherOrAdmin ? `
            <button type="button" class="lm-lock-indicator lm-btn-toggle-lock" data-unit-id="${mod.id}" title="${isUnlocked ? 'Click to Lock from Students' : 'Click to Unlock for Students'}" style="background: none; border: 0; cursor: pointer; padding: 2px;">
              ${isUnlocked ? '🔓' : '🔒'}
            </button>
          ` : `
            <span class="lm-lock-indicator">${isUnlocked ? '✨' : '🔒'}</span>
          `}
        </div>
      </div>

      <div class="lm-card-mid">
        <div style="font-size: 11px; font-weight: 800; color: #60a5fa; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">Level ${mod.level} Quest</div>
        <h3 class="lm-card-title">${escapeHtml(mod.title)}</h3>
        <p class="lm-card-sub">${escapeHtml(mod.subtitle)}</p>
      </div>

      <div class="lm-card-bottom">
        <div class="lm-card-xp">
          <span>⚡</span>
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
  activeModalUnit = unit;
  const overlay = $("lessonModalOverlay");
  if (!overlay) return;

  $("modalUnitIcon").textContent = unit.icon;
  $("modalUnitTitle").textContent = unit.title;
  $("modalUnitBadge").textContent = unit.badge;
  $("modalUnitSub").textContent = unit.subtitle;

  // Formula & Theory tab
  $("modalFormulaText").textContent = unit.formula;
  $("modalTheoryBody").innerHTML = unit.deepExplanation;

  // Pop culture Contexts tab
  $("contextMovieTitle").textContent = unit.contexts.movie.title;
  $("contextMovieQuote").textContent = unit.contexts.movie.quote;
  $("contextMovieDesc").textContent = unit.contexts.movie.breakdown;

  $("contextMusicTitle").textContent = unit.contexts.music.title;
  $("contextMusicQuote").textContent = unit.contexts.music.quote;
  $("contextMusicDesc").textContent = unit.contexts.music.breakdown;

  $("contextBookTitle").textContent = unit.contexts.book.title;
  $("contextBookQuote").textContent = unit.contexts.book.quote;
  $("contextBookDesc").textContent = unit.contexts.book.breakdown;

  // Reset to default tab
  switchModalTab("theory");

  // Init Practice Arena
  initPracticeArena(unit);

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
  feedbackTitle.innerHTML = isCorrect ? "🎉 Brilliant! Correct Answer" : "❌ Not Quite Right";
  feedbackText.innerHTML = question.explanation;
  feedbackPanel.style.display = "block";

  const nextBtn = $("btnNextQuestion");
  nextBtn.style.display = "inline-block";
  const isLast = activeQuizState.currentIndex >= activeQuizState.questions.length - 1;
  nextBtn.textContent = isLast ? "Finish Quest 🏁" : "Next Question →";
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

// --- 10. TEACHER QUESTION EDITOR MODAL ---
function openTeacherEditorModal() {
  if (!activeModalUnit) return;
  $("editorUnitTitle").textContent = activeModalUnit.title;
  renderTeacherQuestionsEditor();
  $("teacherEditorOverlay").classList.add("active");
}

function renderTeacherQuestionsEditor() {
  const container = $("teacherQuestionsList");
  if (!container) return;
  container.innerHTML = "";

  const questions = customQuestionMap[activeModalUnit.id] && customQuestionMap[activeModalUnit.id].length > 0
    ? customQuestionMap[activeModalUnit.id]
    : activeModalUnit.practiceQuestions;

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

  $("btnLockAll")?.addEventListener("click", async () => {
    ENGLISH_G9_MODULES.forEach(m => moduleLockMap[m.id] = false);
    await saveModuleLocks();
    renderQuestMap();
  });

  // Teacher Question Editor open/close
  $("btnEditQuestionsModal")?.addEventListener("click", openTeacherEditorModal);
  $("teacherEditorCloseBtn")?.addEventListener("click", () => {
    $("teacherEditorOverlay")?.classList.remove("active");
  });

  // Add new question
  $("btnAddCustomQuestion")?.addEventListener("click", () => {
    if (!customQuestionMap[activeModalUnit.id]) {
      customQuestionMap[activeModalUnit.id] = [...activeModalUnit.practiceQuestions];
    }
    customQuestionMap[activeModalUnit.id].push({
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
}
