import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { escapeHtml, triggerCelebration, attachRippleEffect, initStaggeredReveals } from "./utils.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIUtrjlgHEI7TtOY-nRiXzQ0DIcdkT-W0",
  authDomain: "weekly-teacher.firebaseapp.com",
  projectId: "weekly-teacher",
  storageBucket: "weekly-teacher.firebasestorage.app",
  messagingSenderId: "329063573272",
  appId: "1:329063573272:web:56a43fb16a85ca4c22a06d",
  measurementId: "G-VFRECGLJFK"
};

// Initialize Dedicated Firebase App & Services for Weekly Schedule
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Secondary Firebase Instance for creating new users without switching current admin session
const secondaryApp = initializeApp(firebaseConfig, "SecondaryRegistrationApp");
const secondaryAuth = getAuth(secondaryApp);

// Secondary Firebase App pointing to syamserverlist database for student directory & autocomplete
const syamFirebaseConfig = {
  apiKey: "AIzaSyB3TY9M4oUG7xxCgxR6bSJB0K9ivcP5RQI",
  authDomain: "syamserverlist.firebaseapp.com",
  projectId: "syamserverlist",
  storageBucket: "syamserverlist.firebasestorage.app",
  messagingSenderId: "468852816088",
  appId: "1:468852816088:web:b72bcb0c4fee837d983fad",
  measurementId: "G-2YHY6V3JH1"
};
const syamApp = initializeApp(syamFirebaseConfig, "SyamPortalSecondaryApp");
const syamDb = getFirestore(syamApp, "mrsyamdb");

// 13 Slot Daily Master Schedule Structure
const timeSlots = [
  { id: 0, time: "07.30 - 07.40", isBreak: true, label: "OPENING" },
  { id: 1, time: "07.40 - 08.25", isBreak: false, period: 1 },
  { id: 2, time: "08.25 - 09.10", isBreak: false, period: 2 },
  { id: 3, time: "09.10 - 09.55", isBreak: false, period: 3 },
  { id: 4, time: "09.55 - 10.10", isBreak: true, label: "BREAK" },
  { id: 5, time: "10.10 - 10.55", isBreak: false, period: 4 },
  { id: 6, time: "10.55 - 11.40", isBreak: false, period: 5 },
  { id: 7, time: "11.40 - 12.25", isBreak: false, period: 6 },
  { id: 8, time: "12.25 - 13.00", isBreak: true, label: "LUNCH" },
  { id: 9, time: "13.00 - 13.45", isBreak: false, period: 7 },
  { id: 10, time: "13.45 - 14.30", isBreak: false, period: 8 },
  { id: 11, time: "14.30 - 15.15", isBreak: false, period: 9 },
  { id: 12, time: "15.15 - 15.30", isBreak: true, label: "CLOSING" }
];

// Friday Middle School (Grade 7, Grade 8, Grade 9) Period Schedule Map
const fridayMiddleSchoolSlots = {
  1: { start: "07.40", end: "08.20" },
  2: { start: "08.20", end: "09.00" },
  3: { start: "09.00", end: "09.40" },
  4: { start: "09.40", end: "09.55", isBreak: true },
  5: { start: "09.55", end: "10.35" },
  6: { start: "10.35", end: "11.05" },
  7: { start: "11.05", end: "11.40" }
};

function isMiddleSchoolClass(className) {
  if (!className) return false;
  const match = className.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return num >= 7 && num <= 9;
  }
  return false;
}

function isHighSchoolClass(className) {
  if (!className) return false;
  const lower = className.toLowerCase();
  if (lower.includes('g10') || lower.includes('g11') || lower.includes('g12') || lower.includes('high school') || lower.includes('sma')) return true;
  const match = className.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return num >= 10 && num <= 12;
  }
  return false;
}

function getFridayMiddleSchoolTime(slotId, rowspan = 1) {
  const startSlot = fridayMiddleSchoolSlots[slotId];
  if (!startSlot) return null;
  const endSlotId = slotId + (rowspan - 1);
  const endSlot = fridayMiddleSchoolSlots[endSlotId] || startSlot;
  return `${startSlot.start} - ${endSlot.end}`;
}

function getDefaultUniforms(selectedClass) {
  const isHS = isHighSchoolClass(selectedClass);
  const monWedUniform = isHS ? "Seragam Putih Abu" : "Seragam Putih Biru";
  return {
    MONDAY: monWedUniform,
    TUESDAY: "Seragam Kotak-Kotak",
    WEDNESDAY: monWedUniform,
    THURSDAY: "Seragam Kotak-Kotak",
    FRIDAY: "Seragam Pramuka/Batik Jumat"
  };
}

function updateUniformBadges(selectedClass, calPrefix = null) {
  const prefix = calPrefix || getActiveCalendarPrefix('class');
  const overrideKey = `${prefix}_${selectedClass}`;
  const defaultUniforms = getDefaultUniforms(selectedClass);
  const savedUniforms = weeklyOverrides?.[overrideKey]?.uniforms || {};

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const thHeaders = document.querySelectorAll('#printableArea thead th.col-day');

  thHeaders.forEach((th, idx) => {
    const day = days[idx];
    if (!day) return;

    const currentUniform = (isClassEditMode && draftWeeklyUniforms[day])
      ? draftWeeklyUniforms[day]
      : (savedUniforms[day] || defaultUniforms[day]);

    if (isClassEditMode) {
      th.innerHTML = `
        <span class="day-name">${day}</span>
        <input type="text" class="edit-uniform-input" data-day="${day}" value="${currentUniform}" placeholder="Uniform for ${day}...">
      `;
    } else {
      th.innerHTML = `
        <span class="day-name">${day}</span>
        <span class="uniform-badge">${currentUniform}</span>
      `;
    }
  });
}

// Application State
let appEntities = { teachers: [], classes: [], subjects: [], homeTeachers: {}, teacherEmails: {} };
let classNotesData = {};
let masterSchedules = {};
let weeklyOverrides = {};
let materialsData = {};
let academicCalendar = {};

let isClassEditMode = false;
let draftWeeklySchedule = null;
let draftWeeklyMaterials = {};
let draftWeeklyUniforms = {};
let currentUserRole = null;

async function fetchCurrentUserRole(user) {
  if (!user) {
    currentUserRole = null;
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      currentUserRole = userDoc.data().role || null;
    } else {
      currentUserRole = null;
    }
  } catch (err) {
    console.warn("Could not fetch user role from Firestore:", err);
    currentUserRole = null;
  }
}

function isAdminUser() {
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  if (currentUserRole === 'admin') return true;
  const emailLower = user.email.toLowerCase();
  return (
    emailLower === 'adm@gc.com' ||
    emailLower === 'admin@gc.com' ||
    emailLower.startsWith('admin@') ||
    emailLower.startsWith('adm@')
  );
}

function isTeacherUser() {
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  const emailLower = user.email.toLowerCase();
  if (isAdminUser()) return false;

  if (appEntities && appEntities.teacherEmails) {
    const teacherName = Object.keys(appEntities.teacherEmails).find(
      name => (appEntities.teacherEmails[name] || '').toLowerCase() === emailLower
    );
    if (teacherName) return true;
  }
  return false;
}

function getLoggedInTeacherName() {
  const user = auth.currentUser;
  if (!user || !user.email) return null;
  const emailLower = user.email.toLowerCase();

  if (appEntities && appEntities.teacherEmails) {
    return Object.keys(appEntities.teacherEmails).find(
      name => (appEntities.teacherEmails[name] || '').toLowerCase() === emailLower
    ) || null;
  }
  return null;
}

function canUserEditClass(className) {
  const user = auth.currentUser;
  if (!user) return false;
  if (isAdminUser()) return true; // Super Admin can edit any class weekly schedule

  if (!isTeacherUser()) return false;

  const teacherName = getLoggedInTeacherName();
  if (!teacherName) return false;
  const assignedClass = appEntities.homeTeachers?.[teacherName];
  // Only the assigned Home Teacher for this specific class can edit its weekly schedule
  return !!(assignedClass && assignedClass === className);
}

function updateClassEditButtonState() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  const btnEdit = document.getElementById('btnEditClassWeekly');
  const btnEditText = document.getElementById('btnEditClassWeeklyText');
  const toolbar = document.getElementById('classEditToolbar');
  const container = document.getElementById('printableArea');

  if (!btnEdit) return;

  const canEdit = canUserEditClass(selectedClass);
  btnEdit.style.display = canEdit ? 'inline-flex' : 'none';

  if (!canEdit && isClassEditMode) {
    exitClassEditMode(false);
  }

  if (isClassEditMode) {
    btnEdit.classList.add('active-editing');
    if (btnEditText) btnEditText.textContent = 'Exit Edit Mode';
    if (toolbar) toolbar.style.display = 'flex';
    if (container) container.classList.add('is-editing');
    const subtitle = document.getElementById('editToolbarSubtitle');
    const week = document.getElementById('classWeekSelect')?.value || 'Week';
    if (subtitle) subtitle.textContent = `Editing schedule & materials for ${selectedClass} (${week}) — changes apply only to this week`;
  } else {
    btnEdit.classList.remove('active-editing');
    if (btnEditText) btnEditText.textContent = 'Edit Weekly Schedule';
    if (toolbar) toolbar.style.display = 'none';
    if (container) container.classList.remove('is-editing');
  }
}

function checkUserRoleAccess() {
  const user = auth.currentUser;
  const btnAdminView = document.getElementById('btnAdminView');
  const teacherSelectContainer = document.getElementById('teacherSelectContainer');

  if (!user) return;

  updateClassEditButtonState();

  if (isTeacherUser()) {
    // Hide Admin Dashboard button for Teachers
    if (btnAdminView) btnAdminView.style.display = 'none';

    // Hide Teacher Select dropdown container for Teachers so they cannot view or switch to other teachers
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'none';

    // Lock Teacher Select dropdown strictly to logged-in teacher's name
    const tName = getLoggedInTeacherName();
    const tSelect = document.getElementById('teacherSelectView');
    if (tSelect && tName) {
      tSelect.innerHTML = `<option value="${tName}">${tName}</option>`;
      tSelect.value = tName;
    }
    renderTeacherView();

    // Switch away if currently on Admin View tab
    const adminTab = document.getElementById('adminView');
    if (adminTab && adminTab.classList.contains('active')) {
      switchTab('classView', document.getElementById('btnClassView'));
    }
  } else if (isAdminUser()) {
    // Admin User: Show Admin tab and Teacher dropdown
    if (btnAdminView) btnAdminView.style.display = 'inline-flex';
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'flex';
  } else {
    if (btnAdminView) btnAdminView.style.display = 'none';
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'none';
  }
}

// Firebase Auth State Observer
onAuthStateChanged(auth, async (user) => {
  const loginModal = document.getElementById('loginModal');
  const appMain = document.getElementById('appMain');
  const userDisplayEmail = document.getElementById('userDisplayEmail');
  const userDisplayEmailText = document.getElementById('userDisplayEmailText');

  if (user) {
    if (loginModal) loginModal.style.display = 'none';
    if (appMain) appMain.style.display = 'block';
    if (userDisplayEmailText) userDisplayEmailText.textContent = `Logged in as: ${user.email}`;
    if (userDisplayEmail) userDisplayEmail.textContent = `Logged in as: ${user.email}`;

    await fetchCurrentUserRole(user);
    checkUserRoleAccess();
    triggerCelebration();
    attachRippleEffect('button, .login-btn, .save-btn, .export-btn, .nav-item, .quick-link-card');
    initStaggeredReveals();
  } else {
    currentUserRole = null;
    if (loginModal) loginModal.style.display = 'flex';
    if (appMain) appMain.style.display = 'none';
  }
});

// Change Password Modal Trigger & Submission Handlers
const openChangePasswordModal = () => {
  const user = auth.currentUser;
  if (!user) return;

  const modal = document.getElementById('changePasswordModal');
  const subLabel = document.getElementById('changePasswordSubLabel');
  const msgDiv = document.getElementById('changePasswordMsg');
  const newPass = document.getElementById('newPasswordInput');
  const confirmPass = document.getElementById('confirmPasswordInput');

  if (subLabel) subLabel.textContent = `Update account password for ${user.email}`;
  if (msgDiv) msgDiv.style.display = 'none';
  if (newPass) newPass.value = '';
  if (confirmPass) confirmPass.value = '';

  if (modal) modal.style.display = 'flex';
};

document.getElementById('userDisplayEmailBtn')?.addEventListener('click', openChangePasswordModal);
document.getElementById('userDisplayEmail')?.addEventListener('click', openChangePasswordModal);

document.getElementById('btnCancelChangePassword')?.addEventListener('click', () => {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const newPass = document.getElementById('newPasswordInput')?.value || '';
  const confirmPass = document.getElementById('confirmPasswordInput')?.value || '';
  const msgDiv = document.getElementById('changePasswordMsg');
  const submitBtn = document.getElementById('btnSubmitChangePassword');
  const card = document.querySelector('#changePasswordModal .login-card');

  if (!msgDiv || !submitBtn) return;

  msgDiv.style.display = 'none';

  if (newPass !== confirmPass) {
    msgDiv.textContent = 'Passwords do not match. Please re-enter confirm password.';
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
    return;
  }

  if (newPass.length < 6) {
    msgDiv.textContent = 'Password must be at least 6 characters long.';
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating...';

  try {
    await updatePassword(user, newPass);
    msgDiv.textContent = 'Password updated successfully!';
    msgDiv.style.cssText = 'display: block; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    triggerCelebration();

    setTimeout(() => {
      const modal = document.getElementById('changePasswordModal');
      if (modal) modal.style.display = 'none';
    }, 1500);
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      msgDiv.textContent = 'Security Requirement: Please sign out and sign in again before updating your password.';
    } else {
      msgDiv.textContent = err.message ? err.message.replace('Firebase: ', '') : 'Failed to update password.';
    }
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update Password';
  }
});

// Firebase User Sign In Handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errDiv = document.getElementById('loginError');
  const submitBtn = document.getElementById('btnLoginSubmit');
  const card = document.querySelector('#loginModal .login-card');

  errDiv.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errDiv.textContent = err.message.replace("Firebase: ", "");
    errDiv.style.display = 'block';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});

// Sign Out Handler
document.getElementById('btnLogout')?.addEventListener('click', () => {
  signOut(auth);
});

// Main Navigation Event Listeners
document.getElementById('btnClassView')?.addEventListener('click', (e) => switchTab('classView', e.currentTarget));
document.getElementById('btnTeacherView')?.addEventListener('click', (e) => switchTab('teacherView', e.currentTarget));
document.getElementById('btnRewardView')?.addEventListener('click', (e) => switchTab('rewardView', e.currentTarget));
document.getElementById('btnMeetingView')?.addEventListener('click', (e) => switchTab('meetingView', e.currentTarget));
document.getElementById('btnAdminView')?.addEventListener('click', (e) => switchTab('adminView', e.currentTarget));

// Draggable Navigation Tabs Helper
export function initDraggableNavTabs() {
  const containers = document.querySelectorAll('.nav-tabs');
  containers.forEach(container => {
    if (container._dragAttached) return;
    container._dragAttached = true;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let isDragging = false;

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      isDragging = false;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });

    const stopDragging = () => {
      if (!isDown) return;
      isDown = false;
      setTimeout(() => {
        container.classList.remove('is-dragging');
      }, 50);
    };

    window.addEventListener('mouseup', stopDragging);
    container.addEventListener('mouseleave', stopDragging);

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 5) {
        if (!isDragging) {
          isDragging = true;
          container.classList.add('is-dragging');
        }
        e.preventDefault();
        container.scrollLeft = scrollLeft - walk;
      }
    });

    container.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDraggableNavTabs);
} else {
  initDraggableNavTabs();
}

export function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  if (el.scrollHeight > 0) {
    el.style.height = (el.scrollHeight) + 'px';
  }
}

function initAutoResizeTextareas() {
  document.querySelectorAll('textarea.modern-textarea, textarea.form-control, textarea').forEach(ta => {
    if (ta._autoResizeAttached) return;
    ta._autoResizeAttached = true;
    ta.addEventListener('input', () => autoResizeTextarea(ta));
    autoResizeTextarea(ta);
  });
}

function loadDriveFolderSettings() {
  const inputScript = document.getElementById('inputMeetingDriveScriptUrl');
  const inputFolder = document.getElementById('inputMeetingDriveFolderId');

  if (inputScript) {
    inputScript.value = localStorage.getItem('meetingDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
  }
  if (inputFolder) {
    inputFolder.value = localStorage.getItem('meetingDriveFolderId') || '';
  }
}

function switchTab(tabId, targetBtn) {
  if (tabId === 'adminView' && !isAdminUser()) {
    alert("Access Denied: Only administrators can access the Admin Dashboard.");
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  const btn = targetBtn?.closest ? targetBtn.closest('.tab-btn') : targetBtn;
  btn?.classList.add('active');
  btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  if (tabId === 'classView') {
    updateClassEditButtonState();
  } else if (tabId === 'teacherView') {
    renderTeacherView();
  } else if (tabId === 'rewardView') {
    initRewardView();
  } else if (tabId === 'meetingView') {
    initMeetingView();
  } else if (tabId === 'adminView') {
    renderEntityTables();
    renderManageScheduleTable();
    renderManageThemesTable();
    loadDriveFolderSettings();
  }

  // Adjust all visible textareas to their content height
  setTimeout(() => {
    initAutoResizeTextareas();
    document.querySelectorAll('.tab-content.active textarea').forEach(ta => autoResizeTextarea(ta));
  }, 50);
}

// Helper to retrieve slot assignments normalized as an array, prioritizing weekly overrides
function getSlotAssignments(className, day, slotId, viewCalPrefix = null) {
  const calPrefix = viewCalPrefix || getActiveCalendarPrefix('class');
  const overrideKey = `${calPrefix}_${className}`;

  if (weeklyOverrides && weeklyOverrides[overrideKey]) {
    const overrideObj = weeklyOverrides[overrideKey];
    const scheduleMap = overrideObj.schedule || overrideObj;
    if (scheduleMap && scheduleMap[day]) {
      const overrideVal = scheduleMap[day][slotId];
      if (overrideVal !== undefined) {
        if (!overrideVal || overrideVal.length === 0) return [];
        if (Array.isArray(overrideVal)) return overrideVal;
        return [overrideVal];
      }
    }
  }

  const entry = masterSchedules[className]?.[day]?.[slotId];
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  return [entry];
}

// Admin Sub-Tab Navigation
document.getElementById('btnSubAdd')?.addEventListener('click', (e) => switchAdminSubTab('subTabAdd', e.target));
document.getElementById('btnSubManage')?.addEventListener('click', (e) => switchAdminSubTab('subTabManage', e.target));
document.getElementById('btnSubCalendar')?.addEventListener('click', (e) => switchAdminSubTab('subTabCalendar', e.target));
document.getElementById('btnSubDrive')?.addEventListener('click', (e) => {
  switchAdminSubTab('subTabDrive', e.target);
  loadDriveFolderSettings();
});

function switchAdminSubTab(subTabId, targetBtn) {
  document.querySelectorAll('.subtab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.subtab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(subTabId)?.classList.add('active');
  targetBtn?.classList.add('active');
}

// Resource Type Switcher (Show/Hide Teacher Credentials Inputs)
document.getElementById('resourceType')?.addEventListener('change', (e) => {
  const teacherAuthFields = document.getElementById('teacherAuthFields');
  if (teacherAuthFields) {
    teacherAuthFields.style.display = e.target.value === 'teachers' ? 'block' : 'none';
  }
});

function sortWeeks(weekKeys) {
  return weekKeys.slice().sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function formatModernDateRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 'Dates: -';
  const p1 = startDateStr.split('-');
  const p2 = endDateStr.split('-');

  if (p1.length !== 3 || p2.length !== 3) {
    return `${startDateStr} to ${endDateStr}`;
  }

  let dStart = new Date(startDateStr + "T00:00:00");
  let dEnd = new Date(endDateStr + "T00:00:00");

  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) {
    return `${startDateStr} to ${endDateStr}`;
  }

  // Adjust Saturday (6) and Sunday (0) to Friday (do not show weekends)
  if (dEnd.getDay() === 6) {
    dEnd.setDate(dEnd.getDate() - 1);
  } else if (dEnd.getDay() === 0) {
    dEnd.setDate(dEnd.getDate() - 2);
  }

  if (dEnd < dStart) dEnd = new Date(dStart);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d1 = dStart.getDate();
  const m1 = months[dStart.getMonth()];
  const y1 = dStart.getFullYear();

  const d2 = dEnd.getDate();
  const m2 = months[dEnd.getMonth()];
  const y2 = dEnd.getFullYear();

  if (y1 === y2 && m1 === m2) {
    return `${d1} – ${d2} ${m1} ${y1}`;
  } else if (y1 === y2) {
    return `${d1} ${m1} – ${d2} ${m2} ${y1}`;
  } else {
    return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`;
  }
}

// Populate Calendar Select Boxes
function populateCalendarSelects() {
  const years = Object.keys(academicCalendar);
  const views = ['class', 'teacher', 'meeting'];

  views.forEach(prefix => {
    const yearSel = document.getElementById(`${prefix}YearSelect`);
    const themeSel = document.getElementById(`${prefix}ThemeSelect`);
    const weekSel = document.getElementById(`${prefix}WeekSelect`);

    if (!yearSel || !themeSel || !weekSel) return;

    const currYear = yearSel.value;
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (currYear && years.includes(currYear)) yearSel.value = currYear;

    const selectedYear = yearSel.value;
    const themes = selectedYear && academicCalendar[selectedYear] ? Object.keys(academicCalendar[selectedYear]) : [];

    const currTheme = themeSel.value;
    themeSel.innerHTML = themes.map(t => `<option value="${t}">${t}</option>`).join('');
    if (currTheme && themes.includes(currTheme)) themeSel.value = currTheme;

    const selectedTheme = themeSel.value;
    const rawWeeks = selectedYear && selectedTheme && academicCalendar[selectedYear][selectedTheme]
      ? Object.keys(academicCalendar[selectedYear][selectedTheme])
      : [];

    const weeks = sortWeeks(rawWeeks);

    const currWeek = weekSel.value;
    weekSel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join('');
    if (currWeek && weeks.includes(currWeek)) weekSel.value = currWeek;

    const selectedWeek = weekSel.value;
    const badge = document.getElementById(`${prefix}DateBadge`);
    if (badge) {
      const calSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      if (selectedYear && selectedTheme && selectedWeek && academicCalendar[selectedYear]?.[selectedTheme]?.[selectedWeek]) {
        const info = academicCalendar[selectedYear][selectedTheme][selectedWeek];
        const formattedRange = formatModernDateRange(info.startDate, info.endDate);
        badge.innerHTML = `<span class="badge-icon">${calSvg}</span> <span>${formattedRange}</span>`;
      } else {
        badge.innerHTML = `<span class="badge-icon">${calSvg}</span> <span>Dates: -</span>`;
      }
    }
  });

  populateAdminCalendarDropdowns();
  if (typeof populateRewardSelects === 'function') {
    populateRewardSelects();
  }
}

function loadSelectedThemeDates() {
  const year = document.getElementById('adminYearSelect')?.value;
  const theme = document.getElementById('adminThemeSelect')?.value;
  const startInput = document.getElementById('calStartDate');
  const endInput = document.getElementById('calEndDate');
  const submitBtn = document.querySelector('#calendarForm button[type="submit"]');

  if (!year || !theme || !startInput || !endInput) return;

  const weeks = academicCalendar[year]?.[theme] || {};
  const weekKeys = sortWeeks(Object.keys(weeks));

  if (weekKeys.length > 0) {
    const firstWeek = weeks[weekKeys[0]];
    const lastWeek = weeks[weekKeys[weekKeys.length - 1]];
    if (firstWeek?.startDate) startInput.value = firstWeek.startDate;
    if (lastWeek?.endDate) endInput.value = lastWeek.endDate;
    if (submitBtn) submitBtn.textContent = `Update & Save Theme Dates (${theme})`;
  } else {
    startInput.value = '';
    endInput.value = '';
    if (submitBtn) submitBtn.textContent = 'Auto-Generate & Save Weeks';
  }

  renderManageThemesTable();
}

function renderManageThemesTable() {
  const tbody = document.getElementById('tableThemesManage');
  if (!tbody) return;
  tbody.innerHTML = '';

  const year = document.getElementById('adminYearSelect')?.value;
  if (!year || !academicCalendar[year]) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 14px; color: #64748b;">No themes found for this school year.</td></tr>`;
    return;
  }

  const themes = Object.keys(academicCalendar[year]);
  if (themes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 14px; color: #64748b;">No themes created yet for ${year}.</td></tr>`;
    return;
  }

  themes.forEach(theme => {
    const weeks = academicCalendar[year][theme] || {};
    const weekKeys = sortWeeks(Object.keys(weeks));
    const weekCount = weekKeys.length;
    let rangeText = 'Not generated';
    if (weekCount > 0) {
      const firstWeek = weeks[weekKeys[0]];
      const lastWeek = weeks[weekKeys[weekCount - 1]];
      rangeText = formatModernDateRange(firstWeek.startDate, lastWeek.endDate);
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px 14px;"><strong>${theme}</strong></td>
      <td style="padding: 10px 14px;"><span style="font-weight: 600; color: #1e293b;">${rangeText}</span></td>
      <td style="padding: 10px 14px; text-align: center;"><span class="ttl-badge" style="background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;">${weekCount} Wk${weekCount === 1 ? '' : 's'}</span></td>
      <td style="padding: 10px 14px; text-align: center;">
        <div style="display: inline-flex; gap: 6px;">
          <button type="button" class="btn-edit-theme" data-year="${year}" data-theme="${theme}" style="padding: 4px 10px; font-size: 12px; background: #e0e7ff; color: #4338ca; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">Edit</button>
          <button type="button" class="btn-delete-theme" data-year="${year}" data-theme="${theme}" style="padding: 4px 10px; font-size: 12px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-edit-theme').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTheme = e.target.dataset.theme;
      const themeSel = document.getElementById('adminThemeSelect');
      if (themeSel) {
        themeSel.value = targetTheme;
        loadSelectedThemeDates();
        document.getElementById('calStartDate')?.focus();
      }
    });
  });

  tbody.querySelectorAll('.btn-delete-theme').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const yr = e.target.dataset.year;
      const th = e.target.dataset.theme;
      if (confirm(`Are you sure you want to delete "${th}" from ${yr}? This will remove all generated weeks for this theme.`)) {
        delete academicCalendar[yr][th];
        try {
          await setDoc(doc(db, "config", "academicCalendar"), academicCalendar);
          populateCalendarSelects();
          alert(`Successfully deleted ${th}.`);
        } catch (err) {
          alert("Error deleting theme: " + err.message);
        }
      }
    });
  });
}

function populateAdminCalendarDropdowns() {
  const adminYearSel = document.getElementById('adminYearSelect');
  const adminThemeSel = document.getElementById('adminThemeSelect');
  if (!adminYearSel || !adminThemeSel) return;

  const years = Object.keys(academicCalendar);
  const currYear = adminYearSel.value;
  adminYearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (currYear && years.includes(currYear)) adminYearSel.value = currYear;

  const selectedYear = adminYearSel.value;
  const themes = selectedYear && academicCalendar[selectedYear] ? Object.keys(academicCalendar[selectedYear]) : [];

  const currTheme = adminThemeSel.value;
  adminThemeSel.innerHTML = themes.map(t => `<option value="${t}">${t}</option>`).join('');
  if (currTheme && themes.includes(currTheme)) adminThemeSel.value = currTheme;

  loadSelectedThemeDates();
}

document.getElementById('btnAddYear')?.addEventListener('click', async () => {
  const newYear = prompt("Enter new Academic School Year (e.g., 2026-2027):");
  if (!newYear || !newYear.trim()) return;

  const cleanYear = newYear.trim();
  if (!academicCalendar[cleanYear]) {
    academicCalendar[cleanYear] = {};
    try {
      await setDoc(doc(db, "config", "academicCalendar"), academicCalendar);
      populateCalendarSelects();
      document.getElementById('adminYearSelect').value = cleanYear;
      populateAdminCalendarDropdowns();
    } catch (err) {
      alert("Error adding School Year: " + err.message);
    }
  } else {
    alert("This School Year already exists.");
  }
});

document.getElementById('btnAddTheme')?.addEventListener('click', async () => {
  const selectedYear = document.getElementById('adminYearSelect')?.value;
  if (!selectedYear) {
    alert("Please select or add a School Year first.");
    return;
  }

  const newTheme = prompt(`Enter new Theme name for ${selectedYear} (e.g., Theme 1):`);
  if (!newTheme || !newTheme.trim()) return;

  const cleanTheme = newTheme.trim();
  if (!academicCalendar[selectedYear][cleanTheme]) {
    academicCalendar[selectedYear][cleanTheme] = {};
    try {
      await setDoc(doc(db, "config", "academicCalendar"), academicCalendar);
      populateCalendarSelects();
      document.getElementById('adminThemeSelect').value = cleanTheme;
      loadSelectedThemeDates();
    } catch (err) {
      alert("Error adding Theme: " + err.message);
    }
  } else {
    alert("This Theme already exists under the selected year.");
  }
});

document.getElementById('adminYearSelect')?.addEventListener('change', () => {
  populateAdminCalendarDropdowns();
});

document.getElementById('adminThemeSelect')?.addEventListener('change', () => {
  loadSelectedThemeDates();
});

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateWeeksFromDateRange(startStr, endStr) {
  const weeksObj = {};
  let currentStart = new Date(startStr + "T00:00:00");
  const finalEnd = new Date(endStr + "T00:00:00");
  let weekNum = 1;

  if (currentStart > finalEnd) {
    alert("Start Date must be before or equal to End Date!");
    return null;
  }

  while (currentStart <= finalEnd) {
    // Standard school week ends on Friday (+4 days from Monday)
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 4);

    if (currentEnd > finalEnd) {
      currentEnd = new Date(finalEnd);
    }
    // Snap Saturday/Sunday to Friday
    if (currentEnd.getDay() === 6) currentEnd.setDate(currentEnd.getDate() - 1);
    if (currentEnd.getDay() === 0) currentEnd.setDate(currentEnd.getDate() - 2);

    const weekKey = `Week ${weekNum}`;
    weeksObj[weekKey] = {
      startDate: formatDate(currentStart),
      endDate: formatDate(currentEnd)
    };

    currentStart.setDate(currentStart.getDate() + 7);
    weekNum++;
  }

  return weeksObj;
}

document.getElementById('calendarForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const year = document.getElementById('adminYearSelect').value;
  const theme = document.getElementById('adminThemeSelect').value;
  const startDate = document.getElementById('calStartDate').value;
  const endDate = document.getElementById('calEndDate').value;

  if (!year || !theme) {
    alert("Please select a valid Year and Theme.");
    return;
  }

  const generatedWeeks = generateWeeksFromDateRange(startDate, endDate);
  if (!generatedWeeks) return;

  if (!academicCalendar[year]) academicCalendar[year] = {};
  academicCalendar[year][theme] = generatedWeeks;

  try {
    await setDoc(doc(db, "config", "academicCalendar"), academicCalendar);
    const weekCount = Object.keys(generatedWeeks).length;
    alert(`Successfully saved ${weekCount} weeks (Mon–Fri) for ${year} > ${theme}!`);
    populateCalendarSelects();
    renderClassSchedule();
    renderTeacherView();
  } catch (err) {
    alert("Error saving calendar data: " + err.message);
  }
});

['class', 'teacher'].forEach(prefix => {
  document.getElementById(`${prefix}YearSelect`)?.addEventListener('change', () => {
    populateCalendarSelects();
    renderClassSchedule();
    renderTeacherView();
  });
  document.getElementById(`${prefix}ThemeSelect`)?.addEventListener('change', () => {
    populateCalendarSelects();
    renderClassSchedule();
    renderTeacherView();
  });
  document.getElementById(`${prefix}WeekSelect`)?.addEventListener('change', () => {
    populateCalendarSelects();
    renderClassSchedule();
    renderTeacherView();
  });
});

function updateAdminPeriodSelectOptions() {
  const periodSelect = document.getElementById('adminPeriodSelect');
  const classVal = document.getElementById('adminClassSelect')?.value || '';
  const dayVal = document.getElementById('adminDaySelect')?.value || '';
  if (!periodSelect) return;

  const currentVal = periodSelect.value;
  const isFriMS = dayVal === 'FRIDAY' && isMiddleSchoolClass(classVal);

  periodSelect.innerHTML = timeSlots
    .filter(s => !s.isBreak)
    .map(s => {
      let timeStr = s.time;
      if (isFriMS) {
        const friTime = getFridayMiddleSchoolTime(s.id);
        if (friTime) timeStr = `${friTime} [Fri MS]`;
      }
      return `<option value="${s.id}">Period ${s.period} (${timeStr})</option>`;
    }).join('');

  if (currentVal && Array.from(periodSelect.options).some(o => o.value === currentVal)) {
    periodSelect.value = currentVal;
  }
}

function syncEntitiesFromMasterSchedules() {
  if (!appEntities) appEntities = { teachers: [], classes: [], subjects: [], homeTeachers: {}, teacherEmails: {} };
  if (!appEntities.classes) appEntities.classes = [];
  if (!appEntities.teachers) appEntities.teachers = [];
  if (!appEntities.subjects) appEntities.subjects = [];
  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
  if (!appEntities.teacherEmails) appEntities.teacherEmails = {};

  let changed = false;
  const classSet = new Set(appEntities.classes.map(c => (c || '').trim()).filter(Boolean));
  const teacherSet = new Set(appEntities.teachers.map(t => (t || '').trim()).filter(Boolean));
  const subjectSet = new Set(appEntities.subjects.map(s => (s || '').trim()).filter(Boolean));

  // 1. Scan masterSchedules for all classes, teachers, and subjects
  if (masterSchedules && typeof masterSchedules === 'object') {
    Object.entries(masterSchedules).forEach(([className, classData]) => {
      const trimmedClass = (className || '').trim();
      if (trimmedClass && !classSet.has(trimmedClass)) {
        classSet.add(trimmedClass);
        appEntities.classes.push(trimmedClass);
        changed = true;
      }
      if (classData && typeof classData === 'object') {
        Object.values(classData).forEach(dayData => {
          if (dayData && typeof dayData === 'object') {
            Object.values(dayData).forEach(slotEntries => {
              const entriesArr = Array.isArray(slotEntries) ? slotEntries : (slotEntries ? [slotEntries] : []);
              entriesArr.forEach(entry => {
                if (entry && entry.teacher) {
                  const trimmedTeacher = entry.teacher.trim();
                  if (trimmedTeacher && !teacherSet.has(trimmedTeacher)) {
                    teacherSet.add(trimmedTeacher);
                    appEntities.teachers.push(trimmedTeacher);
                    changed = true;
                  }
                }
                if (entry && entry.subject) {
                  const cleanSub = entry.subject.replace(/\s*\(Section\s*\d+\)$/i, '').trim();
                  if (cleanSub && !subjectSet.has(cleanSub)) {
                    subjectSet.add(cleanSub);
                    appEntities.subjects.push(cleanSub);
                    changed = true;
                  }
                }
              });
            });
          }
        });
      }
    });
  }

  // 2. Scan weeklyOverrides for any additional classes
  if (weeklyOverrides && typeof weeklyOverrides === 'object') {
    Object.keys(weeklyOverrides).forEach(key => {
      const lastUnderscore = key.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const potentialClass = key.substring(lastUnderscore + 1).trim();
        if (potentialClass && !classSet.has(potentialClass)) {
          classSet.add(potentialClass);
          appEntities.classes.push(potentialClass);
          changed = true;
        }
      }
    });
  }

  // Naturally sort classes (e.g., Grade 7A, Grade 7B, Grade 8A, Grade 9A, Grade 9B, Grade 10, etc.)
  appEntities.classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return changed;
}

function populateAdminSelects() {
  syncEntitiesFromMasterSchedules();
  updateAdminPeriodSelectOptions();

  const classSelects = [
    document.getElementById('adminClassSelect'),
    document.getElementById('classSelectView'),
    document.getElementById('manageClassSelect'),
    document.getElementById('rewardClassSelect')
  ];
  classSelects.forEach(select => {
    if (select) {
      const currentVal = select.value;
      select.innerHTML = appEntities.classes.map(c => `<option value="${c}">${c}</option>`).join('');
      if (currentVal && appEntities.classes.includes(currentVal)) {
        select.value = currentVal;
      }
    }
  });

  const adminSub = document.getElementById('adminSubjectSelect');
  if (adminSub) {
    const currentVal = adminSub.value;
    adminSub.innerHTML = appEntities.subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    if (currentVal && appEntities.subjects.includes(currentVal)) adminSub.value = currentVal;
  }

  const teacherSelects = [document.getElementById('adminTeacherSelect'), document.getElementById('teacherSelectView')];
  teacherSelects.forEach(select => {
    if (select) {
      if (select.id === 'teacherSelectView' && isTeacherUser()) {
        const loggedInName = getLoggedInTeacherName();
        if (loggedInName) {
          select.innerHTML = `<option value="${loggedInName}">${loggedInName}</option>`;
          select.value = loggedInName;
          return;
        }
      }
      const currentVal = select.value;
      select.innerHTML = appEntities.teachers.map(t => `<option value="${t}">${t}</option>`).join('');
      if (currentVal && appEntities.teachers.includes(currentVal)) select.value = currentVal;
    }
  });

  renderEntityTables();
  renderManageScheduleTable();
  checkUserRoleAccess();
}

function calculateTeacherTTP(teacherName) {
  if (!teacherName || !masterSchedules) return 0;
  let count = 0;
  const targetTeacher = teacherName.trim().toLowerCase();
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  Object.keys(masterSchedules).forEach(className => {
    const classSchedule = masterSchedules[className];
    if (!classSchedule || typeof classSchedule !== 'object') return;

    days.forEach(day => {
      timeSlots.forEach(slot => {
        if (slot.isBreak) return;
        const entries = getSlotAssignments(className, day, slot.id);
        entries.forEach(entry => {
          if (entry && (entry.teacher || '').trim().toLowerCase() === targetTeacher) {
            count++;
          }
        });
      });
    });
  });
  return count;
}

const entityPageMap = {
  teachers: 1,
  homeTeachers: 1,
  classes: 1,
  subjects: 1
};
const ENTITY_PAGE_SIZE = 10;

function renderEntityTables() {
  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
  if (!appEntities.teachers) appEntities.teachers = [];
  if (!appEntities.classes) appEntities.classes = [];
  if (!appEntities.subjects) appEntities.subjects = [];

  const regularTeachers = appEntities.teachers.filter(t => !appEntities.homeTeachers[t]);
  const homeTeachersList = appEntities.teachers.filter(t => !!appEntities.homeTeachers[t]);

  const entityData = {
    teachers: regularTeachers,
    homeTeachers: homeTeachersList,
    classes: appEntities.classes,
    subjects: appEntities.subjects
  };

  const types = ['teachers', 'homeTeachers', 'classes', 'subjects'];

  types.forEach(type => {
    const capitalizeType = type === 'homeTeachers' ? 'HomeTeachers' : (type.charAt(0).toUpperCase() + type.slice(1));
    const tbodyId = `table${capitalizeType}`;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    const allItems = entityData[type] || [];
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / ENTITY_PAGE_SIZE) || 1;

    if (entityPageMap[type] > totalPages) entityPageMap[type] = totalPages;
    if (entityPageMap[type] < 1) entityPageMap[type] = 1;

    const startIdx = (entityPageMap[type] - 1) * ENTITY_PAGE_SIZE;
    const pageItems = allItems.slice(startIdx, startIdx + ENTITY_PAGE_SIZE);

    if (pageItems.length === 0) {
      const colSpan = (type === 'teachers' || type === 'homeTeachers') ? 3 : 2;
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #64748b; padding: 14px;">No ${type === 'homeTeachers' ? 'home teachers assigned' : type} found.</td></tr>`;
    }

    pageItems.forEach(item => {
      const tr = document.createElement('tr');

      if (type === 'teachers') {
        const ttp = calculateTeacherTTP(item);
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>
          </td>
          <td style="text-align: center; width: 55px; padding: 8px 10px;">
            <span class="ttl-badge" title="Total Teaching Periods: ${ttp}">${ttp}</span>
          </td>
          <td style="text-align: center; width: 60px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="set-hometeacher-opt" data-name="${item}">Set Home Teacher</button>
                <button class="edit-opt" data-type="teachers" data-name="${item}">Edit</button>
                <button class="delete-opt" data-type="teachers" data-name="${item}">Delete</button>
              </div>
            </div>
          </td>
        `;
      } else if (type === 'homeTeachers') {
        const assignedClass = appEntities.homeTeachers[item] || '-';
        const ttp = calculateTeacherTTP(item);
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>
            <br><span class="hometeacher-pill">Home Teacher: ${assignedClass}</span>
          </td>
          <td style="text-align: center; width: 55px; padding: 8px 10px;">
            <span class="ttl-badge" title="Total Teaching Periods: ${ttp}">${ttp}</span>
          </td>
          <td style="text-align: center; width: 60px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="set-hometeacher-opt" data-name="${item}">Change Class</button>
                <button class="remove-hometeacher-opt" data-name="${item}" style="color: #ef4444;">Remove Home Teacher</button>
                <button class="edit-opt" data-type="teachers" data-name="${item}">Edit</button>
                <button class="delete-opt" data-type="teachers" data-name="${item}">Delete</button>
              </div>
            </div>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>
          </td>
          <td style="text-align: center; width: 60px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="edit-opt" data-type="${type}" data-name="${item}">Edit</button>
                <button class="delete-opt" data-type="${type}" data-name="${item}">Delete</button>
              </div>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });

    const pageInfo = document.getElementById(`pageInfo${capitalizeType}`);
    const btnPrev = document.getElementById(`btnPrev${capitalizeType}`);
    const btnNext = document.getElementById(`btnNext${capitalizeType}`);

    if (pageInfo) pageInfo.textContent = `Page ${entityPageMap[type]} of ${totalPages}`;
    if (btnPrev) btnPrev.disabled = entityPageMap[type] <= 1;
    if (btnNext) btnNext.disabled = entityPageMap[type] >= totalPages;
  });

  document.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  document.querySelectorAll('.set-hometeacher-opt').forEach(btn => {
    btn.addEventListener('click', (e) => setHomeTeacher(e.target.dataset.name));
  });

  document.querySelectorAll('.remove-hometeacher-opt').forEach(btn => {
    btn.addEventListener('click', (e) => removeHomeTeacher(e.target.dataset.name));
  });

  document.querySelectorAll('.edit-opt').forEach(btn => {
    btn.addEventListener('click', (e) => editEntity(e.target.dataset.type, e.target.dataset.name));
  });

  document.querySelectorAll('.delete-opt').forEach(btn => {
    btn.addEventListener('click', (e) => deleteEntity(e.target.dataset.type, e.target.dataset.name));
  });
}

// Entity Table Pagination Button Listeners
['Teachers', 'HomeTeachers', 'Classes', 'Subjects'].forEach(typeKey => {
  const type = typeKey === 'HomeTeachers' ? 'homeTeachers' : typeKey.toLowerCase();
  document.getElementById(`btnPrev${typeKey}`)?.addEventListener('click', () => {
    if (entityPageMap[type] > 1) {
      entityPageMap[type]--;
      renderEntityTables();
    }
  });
  document.getElementById(`btnNext${typeKey}`)?.addEventListener('click', () => {
    const list = type === 'teachers'
      ? (appEntities.teachers || []).filter(t => !appEntities.homeTeachers?.[t])
      : type === 'homeTeachers'
        ? (appEntities.teachers || []).filter(t => !!appEntities.homeTeachers?.[t])
        : (appEntities[type] || []);
    const totalPages = Math.ceil(list.length / ENTITY_PAGE_SIZE) || 1;
    if (entityPageMap[type] < totalPages) {
      entityPageMap[type]++;
      renderEntityTables();
    }
  });
});

async function setHomeTeacher(teacherName) {
  const availableClasses = appEntities.classes.join(', ');
  const chosenClass = prompt(`Assign ${teacherName} as Home Teacher to class:\nAvailable Classes: ${availableClasses}`);
  if (!chosenClass) return;

  const cleanClass = chosenClass.trim();
  if (!appEntities.classes.includes(cleanClass)) {
    alert(`Class "${cleanClass}" does not exist in database.`);
    return;
  }

  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
  appEntities.homeTeachers[teacherName] = cleanClass;

  try {
    await setDoc(doc(db, "config", "appEntities"), appEntities);
    alert(`Assigned ${teacherName} as Home Teacher for ${cleanClass}!`);
    renderEntityTables();
    renderTeacherView();
  } catch (err) {
    alert("Error updating Home Teacher assignment: " + err.message);
  }
}

async function removeHomeTeacher(teacherName) {
  if (confirm(`Are you sure you want to remove ${teacherName} as Home Teacher?`)) {
    delete appEntities.homeTeachers[teacherName];
    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Removed ${teacherName} from Home Teacher role.`);
      renderEntityTables();
      renderTeacherView();
    } catch (err) {
      alert("Error updating Home Teacher assignment: " + err.message);
    }
  }
}

async function editEntity(type, oldName) {
  const newName = prompt(`Enter new name for "${oldName}":`, oldName);
  if (newName === null) return;
  const cleanName = newName.trim() || oldName;

  const index = appEntities[type].indexOf(oldName);
  if (index !== -1) {
    appEntities[type][index] = cleanName;

    if (type === 'teachers') {
      if (appEntities.teacherEmails && oldName !== cleanName && appEntities.teacherEmails[oldName]) {
        appEntities.teacherEmails[cleanName] = appEntities.teacherEmails[oldName];
        delete appEntities.teacherEmails[oldName];
      }
      if (appEntities.homeTeachers && oldName !== cleanName && appEntities.homeTeachers[oldName]) {
        appEntities.homeTeachers[cleanName] = appEntities.homeTeachers[oldName];
        delete appEntities.homeTeachers[oldName];
      }
    }

    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Updated entity details successfully.`);
      renderEntityTables();
    } catch (err) {
      alert("Error updating database: " + err.message);
    }
  }
}

async function deleteEntity(type, name) {
  if (confirm(`Are you sure you want to delete "${name}" from ${type}?`)) {
    appEntities[type] = appEntities[type].filter(item => item !== name);
    if (type === 'teachers') {
      if (appEntities.teacherEmails) delete appEntities.teacherEmails[name];
      if (appEntities.homeTeachers) delete appEntities.homeTeachers[name];
    }
    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Removed "${name}".`);
      renderEntityTables();
    } catch (err) {
      alert("Error deleting item: " + err.message);
    }
  }
}

function getActiveCalendarPrefix(viewType = 'class') {
  const year = document.getElementById(`${viewType}YearSelect`)?.value || '2026-2027';
  const theme = document.getElementById(`${viewType}ThemeSelect`)?.value || 'Theme 1';
  const week = document.getElementById(`${viewType}WeekSelect`)?.value || 'Week 1';
  return `${year}_${theme}_${week}`;
}

function getSubjectGroupType(subjectName) {
  if (!subjectName) return 'regular';
  const name = subjectName.toLowerCase();
  if (name.includes('religion') || name.includes('agama') || name.includes('islam') ||
    name.includes('christian') || name.includes('kristen') || name.includes('catholic') ||
    name.includes('katolik') || name.includes('buddha') || name.includes('hindu')) {
    return 'religion';
  }
  if (name.includes('art') || name.includes('music') || name.includes('seni')) {
    return 'art';
  }
  return 'regular';
}

function isSameSubjectGroup(sub1, sub2) {
  if (sub1 === sub2) return true;
  const type1 = getSubjectGroupType(sub1);
  const type2 = getSubjectGroupType(sub2);
  if (type1 !== 'regular' && type1 === type2) return true;
  return false;
}

function areSlotAssignmentsMatching(entries1, entries2) {
  if (!entries1 || !entries2) return false;
  if (entries1.length !== entries2.length) return false;
  if (entries1.length === 0) return false;

  if (entries1.length === 1) {
    const sub1 = entries1[0].subject;
    const sub2 = entries2[0].subject;
    const g1 = getSubjectGroupType(sub1);
    const g2 = getSubjectGroupType(sub2);
    if (isSameSubjectGroup(sub1, sub2)) return true;
    if (g1 !== 'regular' && g1 === g2) return true;
    return false;
  }

  const subjects1 = entries1.map(e => e.subject).sort();
  const subjects2 = entries2.map(e => e.subject).sort();
  return subjects1.every((s, idx) => s === subjects2[idx]);
}

const distinctPastelPalettes = [
  { bg: "#E0F2FE", border: "#bae6fd", text: "#0f172a" }, // 0: Sky Blue
  { bg: "#F3E8FF", border: "#e9d5ff", text: "#0f172a" }, // 1: Soft Purple
  { bg: "#D1FAE5", border: "#a7f3d0", text: "#0f172a" }, // 2: Mint / Emerald
  { bg: "#FFE4E6", border: "#fecdd3", text: "#0f172a" }, // 3: Soft Rose
  { bg: "#E0E7FF", border: "#c7d2fe", text: "#0f172a" }, // 4: Soft Indigo
  { bg: "#FFEDD5", border: "#fed7aa", text: "#0f172a" }, // 5: Soft Orange
  { bg: "#ECFCCB", border: "#d9f99d", text: "#0f172a" }, // 6: Soft Lime
  { bg: "#CFFAFE", border: "#a5f3fc", text: "#0f172a" }, // 7: Soft Cyan
  { bg: "#FCE7F3", border: "#fbcfe8", text: "#0f172a" }, // 8: Soft Pink / Fuchsia
  { bg: "#EDE9FE", border: "#ddd6fe", text: "#0f172a" }, // 9: Soft Violet
  { bg: "#FEF9C3", border: "#fef08a", text: "#0f172a" }, // 10: Soft Yellow
  { bg: "#FFDAD6", border: "#ffb4ab", text: "#0f172a" }, // 11: Soft Coral
  { bg: "#E6E6FA", border: "#d8bfd8", text: "#0f172a" }, // 12: Soft Lavender
  { bg: "#D0F0C0", border: "#a2e8dd", text: "#0f172a" }  // 13: Soft Tea Green
];

const dynamicSubjectColorMap = {};

function getSubjectPastelObject(subjectName) {
  if (!subjectName) return { bg: "#FFFFFF", border: "#CBD5E1", text: "#0F172A" };
  const key = subjectName.trim().toLowerCase();
  const groupType = getSubjectGroupType(subjectName);

  // Group Overrides: All Religion subjects get identical Soft Teal color
  if (groupType === 'religion') {
    return { bg: "#CCFBF1", border: "#99f6e4", text: "#0f172a" };
  }

  // Group Overrides: All Art & Music subjects get identical Soft Amber color
  if (groupType === 'art') {
    return { bg: "#FEF3C7", border: "#fde68a", text: "#0f172a" };
  }

  if (!dynamicSubjectColorMap[key]) {
    const subjectsList = appEntities.subjects || [];
    const registeredIndex = subjectsList.findIndex(
      s => s.trim().toLowerCase() === key
    );

    let assignedIdx;
    if (registeredIndex !== -1) {
      assignedIdx = registeredIndex % distinctPastelPalettes.length;
    } else {
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
      }
      assignedIdx = Math.abs(hash) % distinctPastelPalettes.length;
    }
    dynamicSubjectColorMap[key] = distinctPastelPalettes[assignedIdx];
  }
  return dynamicSubjectColorMap[key];
}

function getSubjectPastelStyle(subjectName) {
  const p = getSubjectPastelObject(subjectName);
  return `background-color: ${p.bg}; border: 1px solid ${p.border}; color: ${p.text};`;
}

function enterClassEditMode() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  if (!selectedClass || !canUserEditClass(selectedClass)) {
    alert("You do not have permission to edit the schedule for this class.");
    return;
  }
  isClassEditMode = true;
  initDraftWeeklyData(selectedClass, getActiveCalendarPrefix('class'));
  updateClassEditButtonState();
  renderClassSchedule();
}

function exitClassEditMode(discardChanges = true) {
  if (discardChanges) {
    draftWeeklySchedule = null;
    draftWeeklyMaterials = {};
  }
  isClassEditMode = false;
  updateClassEditButtonState();
  renderClassSchedule();
}

function initDraftWeeklyData(selectedClass, calPrefix) {
  draftWeeklySchedule = {};
  draftWeeklyMaterials = {};
  const overrideKey = `${calPrefix}_${selectedClass}`;
  const defaultUniforms = getDefaultUniforms(selectedClass);
  const savedUniforms = weeklyOverrides?.[overrideKey]?.uniforms || {};
  draftWeeklyUniforms = { ...defaultUniforms, ...savedUniforms };

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  days.forEach(day => {
    draftWeeklySchedule[day] = {};
    timeSlots.forEach(slot => {
      if (!slot.isBreak) {
        const current = getSlotAssignments(selectedClass, day, slot.id, calPrefix);
        draftWeeklySchedule[day][slot.id] = JSON.parse(JSON.stringify(current));
        current.forEach(entry => {
          if (entry.subject) {
            const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
            if (draftWeeklyMaterials[matKey] === undefined) {
              draftWeeklyMaterials[matKey] = {
                material: materialsData[matKey]?.material || '',
                link: materialsData[matKey]?.link || ''
              };
            }
          }
        });
      }
    });
  });
}

function renderClassEditSchedule(selectedClass, calPrefix) {
  const tbody = document.getElementById('classScheduleBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const skipCells = { MONDAY: 0, TUESDAY: 0, WEDNESDAY: 0, THURSDAY: 0, FRIDAY: 0 };
  const registeredSubjects = appEntities.subjects || [];

  timeSlots.forEach((slot, sIndex) => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      let html = `<td class="time-cell break-time">${slot.time}</td>`;
      if (slot.id === 0) {
        html += `<td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
      } else if (slot.id === 4) {
        html += `<td colspan="4" class="break-label"><span class="break-pill">BREAK</span></td><td class="break-label break-day-cell"><span class="break-pill">BREAK</span></td>`;
      } else if (slot.id === 8) {
        html += `<td colspan="4" class="break-label"><span class="break-pill">LUNCH</span></td><td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
      } else if (slot.id === 12) {
        html += `<td colspan="4" class="break-label"><span class="break-pill">CLOSING</span></td><td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
      } else {
        html += `<td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
      }
      tr.innerHTML = html;
      days.forEach(day => skipCells[day] = 0);
    } else {
      let html = `<td class="time-cell"><div class="time-range">${slot.time}</div><div class="period-badge">Period ${slot.period}</div></td>`;

      days.forEach(day => {
        if (skipCells[day] > 0) {
          skipCells[day]--;
          return;
        }

        const slotEntries = draftWeeklySchedule?.[day]?.[slot.id] || [];

        // Check matching span in draft
        let rowspan = 1;
        if (slotEntries.length > 0) {
          for (let i = sIndex + 1; i < timeSlots.length; i++) {
            const nextSlot = timeSlots[i];
            if (nextSlot.isBreak) break;
            const nextEntries = draftWeeklySchedule?.[day]?.[nextSlot.id] || [];
            if (areSlotAssignmentsMatching(slotEntries, nextEntries)) {
              rowspan++;
            } else {
              break;
            }
          }
        }

        if (rowspan > 1) skipCells[day] = rowspan - 1;

        // Check if merge down is possible (next slot exists and is non-break)
        const nextSlotIndex = sIndex + rowspan;
        const canMergeDown = nextSlotIndex < timeSlots.length && !timeSlots[nextSlotIndex].isBreak;

        const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';

        if (slotEntries.length > 0) {
          const entry = slotEntries[0];
          const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
          const matInfo = draftWeeklyMaterials[matKey] || materialsData[matKey] || { material: '', link: '' };
          const isCustomSubject = !registeredSubjects.includes(entry.subject);

          let subjectOptionsHtml = registeredSubjects.map(sub => `<option value="${sub}" ${sub === entry.subject ? 'selected' : ''}>${sub}</option>`).join('');
          subjectOptionsHtml += `<option value="__custom__" ${isCustomSubject ? 'selected' : ''}>✨ Custom Event / Subject...</option>`;

          const customInputDisplay = isCustomSubject ? 'block' : 'none';

          html += `
            <td${rowspanAttr} class="subject-cell" style="vertical-align: top; padding: 6px;">
              <div class="edit-slot-card">
                <div class="edit-slot-header">
                  <span class="edit-period-label">Period ${slot.period}${rowspan > 1 ? `–${slot.period + rowspan - 1}` : ''}</span>
                  ${rowspan > 1 ? `<span class="merged-badge-indicator">${rowspan} Periods</span>` : ''}
                  <div class="edit-merge-controls">
                    ${rowspan > 1 ? `<button type="button" class="btn-cell-action btn-split" data-day="${day}" data-slot="${slot.id}" data-span="${rowspan}" title="Split merged block into separate periods">➗ Split</button>` : ''}
                    ${canMergeDown ? `<button type="button" class="btn-cell-action btn-merge" data-day="${day}" data-slot="${slot.id}" data-span="${rowspan}" title="Merge with next period below">⬇️ Merge</button>` : ''}
                    <button type="button" class="btn-cell-action btn-clear" data-day="${day}" data-slot="${slot.id}" data-span="${rowspan}" title="Clear slot">🗑️</button>
                  </div>
                </div>

                <div class="edit-field-label">Subject / Urgent Event</div>
                <select class="edit-cell-select edit-subject-select" data-day="${day}" data-slot="${slot.id}" data-span="${rowspan}">
                  ${subjectOptionsHtml}
                </select>
                <input type="text" class="edit-cell-input edit-custom-subject-input" data-day="${day}" data-slot="${slot.id}" data-span="${rowspan}" placeholder="Type custom event title..." value="${isCustomSubject ? entry.subject : ''}" style="display: ${customInputDisplay}; margin-top: 3px;">

                <div class="edit-field-label">Material (This Week)</div>
                <textarea class="edit-cell-textarea edit-mat-input" data-matkey="${matKey}" placeholder="Describe material / topic for this week...">${matInfo.material || ''}</textarea>

                <div class="edit-field-label">Resource Link</div>
                <input type="text" class="edit-cell-input edit-link-input" data-matkey="${matKey}" placeholder="https://..." value="${matInfo.link || ''}">
              </div>
            </td>
          `;
        } else {
          // Empty Slot
          html += `
            <td class="subject-cell" style="vertical-align: top; padding: 6px;">
              <div class="edit-slot-card" style="background:#f8fafc; border:1px dashed #cbd5e1; text-align:center;">
                <div class="edit-slot-header">
                  <span class="edit-period-label">Period ${slot.period}</span>
                </div>
                <div style="font-size:11px; color:#94a3b8; margin: 6px 0;">(Free / Unassigned)</div>
                <button type="button" class="btn-cell-action btn-add-slot" data-day="${day}" data-slot="${slot.id}" style="width:100%; justify-content:center; padding:5px 8px; font-weight:700; background:#eef2ff; color:#4f46e5; border-color:#c7d2fe;">
                  ➕ Assign Subject / Event
                </button>
              </div>
            </td>
          `;
        }
      });

      tr.innerHTML = html;
    }

    tbody.appendChild(tr);
  });

  // Attach interactive listeners for the edit table
  attachClassEditTableListeners(selectedClass, calPrefix);
}

function attachClassEditTableListeners(selectedClass, calPrefix) {
  const tbody = document.getElementById('classScheduleBody');
  if (!tbody) return;

  // 1. Uniform input changes in header
  document.querySelectorAll('.edit-uniform-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const day = inp.dataset.day;
      if (day) {
        draftWeeklyUniforms[day] = e.target.value;
      }
    });
  });

  // 2. Merge Down Button
  tbody.querySelectorAll('.btn-merge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const day = btn.dataset.day;
      const slotId = parseInt(btn.dataset.slot, 10);
      const span = parseInt(btn.dataset.span, 10) || 1;

      const sIndex = timeSlots.findIndex(s => s.id === slotId);
      const nextSlotIndex = sIndex + span;
      if (nextSlotIndex < timeSlots.length && !timeSlots[nextSlotIndex].isBreak) {
        const nextSlot = timeSlots[nextSlotIndex];
        const sourceEntry = draftWeeklySchedule[day][slotId];
        draftWeeklySchedule[day][nextSlot.id] = JSON.parse(JSON.stringify(sourceEntry));
        renderClassSchedule();
      }
    });
  });

  // 3. Split Button
  tbody.querySelectorAll('.btn-split').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const day = btn.dataset.day;
      const slotId = parseInt(btn.dataset.slot, 10);
      const span = parseInt(btn.dataset.span, 10) || 1;

      const sIndex = timeSlots.findIndex(s => s.id === slotId);
      for (let i = 1; i < span; i++) {
        const targetSlot = timeSlots[sIndex + i];
        if (targetSlot && !targetSlot.isBreak) {
          const orig = draftWeeklySchedule[day][slotId]?.[0] || { subject: 'Subject', teacher: '' };
          draftWeeklySchedule[day][targetSlot.id] = [{ subject: `${orig.subject} (Section ${i + 1})`, teacher: orig.teacher || '' }];
        }
      }
      renderClassSchedule();
    });
  });

  // 4. Clear Button
  tbody.querySelectorAll('.btn-clear').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const day = btn.dataset.day;
      const slotId = parseInt(btn.dataset.slot, 10);
      const span = parseInt(btn.dataset.span, 10) || 1;

      const sIndex = timeSlots.findIndex(s => s.id === slotId);
      for (let i = 0; i < span; i++) {
        const targetSlot = timeSlots[sIndex + i];
        if (targetSlot && !targetSlot.isBreak) {
          draftWeeklySchedule[day][targetSlot.id] = [];
        }
      }
      renderClassSchedule();
    });
  });

  // 5. Add Slot Button
  tbody.querySelectorAll('.btn-add-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const day = btn.dataset.day;
      const slotId = parseInt(btn.dataset.slot, 10);
      const defaultSub = appEntities.subjects?.[0] || 'English';
      draftWeeklySchedule[day][slotId] = [{ subject: defaultSub, teacher: '' }];
      renderClassSchedule();
    });
  });

  // 6. Subject Select change
  tbody.querySelectorAll('.edit-subject-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const day = sel.dataset.day;
      const slotId = parseInt(sel.dataset.slot, 10);
      const span = parseInt(sel.dataset.span, 10) || 1;
      const val = e.target.value;

      const sIndex = timeSlots.findIndex(s => s.id === slotId);
      const newSubject = val === '__custom__' ? 'Urgent School Event' : val;

      for (let i = 0; i < span; i++) {
        const targetSlot = timeSlots[sIndex + i];
        if (targetSlot && !targetSlot.isBreak && draftWeeklySchedule[day][targetSlot.id]?.[0]) {
          draftWeeklySchedule[day][targetSlot.id][0].subject = newSubject;
        }
      }
      renderClassSchedule();
    });
  });

  // 7. Custom Subject text input
  tbody.querySelectorAll('.edit-custom-subject-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const day = inp.dataset.day;
      const slotId = parseInt(inp.dataset.slot, 10);
      const span = parseInt(inp.dataset.span, 10) || 1;
      const val = e.target.value;

      const sIndex = timeSlots.findIndex(s => s.id === slotId);
      for (let i = 0; i < span; i++) {
        const targetSlot = timeSlots[sIndex + i];
        if (targetSlot && !targetSlot.isBreak && draftWeeklySchedule[day][targetSlot.id]?.[0]) {
          draftWeeklySchedule[day][targetSlot.id][0].subject = val;
        }
      }
    });
  });

  // 8. Material textarea input
  tbody.querySelectorAll('.edit-mat-input').forEach(ta => {
    ta.addEventListener('input', (e) => {
      const key = ta.dataset.matkey;
      if (key) {
        if (!draftWeeklyMaterials[key]) draftWeeklyMaterials[key] = {};
        draftWeeklyMaterials[key].material = e.target.value;
      }
    });
  });

  // 9. Link input
  tbody.querySelectorAll('.edit-link-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const key = inp.dataset.matkey;
      if (key) {
        if (!draftWeeklyMaterials[key]) draftWeeklyMaterials[key] = {};
        draftWeeklyMaterials[key].link = e.target.value;
      }
    });
  });
}

async function saveClassWeeklySchedule() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  if (!selectedClass || !canUserEditClass(selectedClass)) {
    alert("You do not have permission to modify the schedule for this class.");
    return;
  }
  const calPrefix = getActiveCalendarPrefix('class');
  const overrideKey = `${calPrefix}_${selectedClass}`;
  const week = document.getElementById('classWeekSelect')?.value || 'this week';

  try {
    if (!weeklyOverrides) weeklyOverrides = {};
    weeklyOverrides[overrideKey] = {
      schedule: draftWeeklySchedule,
      uniforms: draftWeeklyUniforms
    };

    // Save weekly overrides
    await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides, { merge: true });

    // Save materials
    if (Object.keys(draftWeeklyMaterials).length > 0) {
      materialsData = { ...materialsData, ...draftWeeklyMaterials };
      await setDoc(doc(db, "schedules", "materialsData"), materialsData, { merge: true });
    }

    alert(`Weekly schedule, uniforms & materials saved successfully for ${selectedClass} (${week})!`);
    isClassEditMode = false;
    draftWeeklySchedule = null;
    draftWeeklyMaterials = {};
    draftWeeklyUniforms = {};
    updateClassEditButtonState();
    renderClassSchedule();
    renderTeacherView();
  } catch (err) {
    alert("Error saving weekly schedule: " + err.message);
  }
}

async function resetClassWeeklySchedule() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  if (!selectedClass || !canUserEditClass(selectedClass)) {
    alert("You do not have permission to reset the schedule for this class.");
    return;
  }
  const calPrefix = getActiveCalendarPrefix('class');
  const overrideKey = `${calPrefix}_${selectedClass}`;
  const week = document.getElementById('classWeekSelect')?.value || 'this week';

  if (!confirm(`Are you sure you want to reset the schedule and uniforms for ${selectedClass} (${week}) back to the Master Template? This will remove all weekly custom events, merges, and custom uniforms for this week.`)) {
    return;
  }

  try {
    if (weeklyOverrides && weeklyOverrides[overrideKey]) {
      delete weeklyOverrides[overrideKey];
      await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides);
    }
    alert(`Schedule for ${selectedClass} (${week}) has been reset to Master Template.`);
    isClassEditMode = false;
    draftWeeklySchedule = null;
    draftWeeklyMaterials = {};
    draftWeeklyUniforms = {};
    updateClassEditButtonState();
    renderClassSchedule();
    renderTeacherView();
  } catch (err) {
    alert("Error resetting schedule: " + err.message);
  }
}

function renderClassSchedule() {
  const selectElem = document.getElementById('classSelectView');
  if (!selectElem) return;
  const selectedClass = selectElem.value;
  const tbody = document.getElementById('classScheduleBody');
  if (!tbody) return;

  const calPrefix = getActiveCalendarPrefix('class');

  updateClassEditButtonState();

  updateUniformBadges(selectedClass, calPrefix);

  updateClassPrintHeader(selectedClass);

  // If in Edit Mode, render the interactive edit table
  if (isClassEditMode) {
    renderClassEditSchedule(selectedClass, calPrefix);
    return;
  }

  tbody.innerHTML = '';

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const skipCells = { MONDAY: 0, TUESDAY: 0, WEDNESDAY: 0, THURSDAY: 0, FRIDAY: 0 };
  const showTeacher = false; // Teacher names removed in class view for both middle school and high school

  const clockSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const linkSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px; vertical-align:middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  const noteSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;

  timeSlots.forEach((slot, sIndex) => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      let html = `<td class="time-cell break-time">${slot.time}</td>`;

      if (slot.id === 0) {
        html += `<td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
      } else if (slot.id === 4) {
        // BREAK: Combine Mon-Thu (colspan=4), Friday separate
        html += `<td colspan="4" class="break-label"><span class="break-pill">BREAK</span></td>`;
        if (isMiddleSchoolClass(selectedClass)) {
          html += `<td class="break-label break-day-cell">
            <span class="break-pill">BREAK</span>
            <div class="friday-break-note" style="margin-top: 4px; font-weight: 700; color: #be123c; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; font-size: 10px; display: inline-block;">09.40 - 09.55</div>
          </td>`;
        } else {
          html += `<td class="break-label break-day-cell"><span class="break-pill">BREAK</span></td>`;
        }
      } else if (slot.id === 8) {
        // LUNCH: Combine Mon-Thu (colspan=4), Friday shows empty dash '-' (CLOSING is now in Period 6)
        html += `<td colspan="4" class="break-label"><span class="break-pill">LUNCH</span></td>`;
        html += `<td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
      } else if (slot.id === 12) {
        // CLOSING: Combine Mon-Thu (colspan=4), Friday closing text removed
        html += `<td colspan="4" class="break-label"><span class="break-pill">CLOSING</span></td>`;
        html += `<td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
      } else {
        html += `<td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
      }

      tr.innerHTML = html;
      days.forEach(day => skipCells[day] = 0);
    } else {
      let html = `<td class="time-cell"><div class="time-range">${slot.time}</div><div class="period-badge">Period ${slot.period}</div></td>`;

      days.forEach(day => {
        if (skipCells[day] > 0) {
          skipCells[day]--;
          return;
        }

        const slotEntries = getSlotAssignments(selectedClass, day, slot.id, calPrefix);

        if (slotEntries.length > 0) {
          const primarySubject = slotEntries[0].subject;
          const primaryGroup = getSubjectGroupType(primarySubject);

          let rowspan = 1;
          for (let i = sIndex + 1; i < timeSlots.length; i++) {
            const nextSlot = timeSlots[i];
            if (nextSlot.isBreak) break;

            const nextEntries = getSlotAssignments(selectedClass, day, nextSlot.id, calPrefix);
            if (areSlotAssignmentsMatching(slotEntries, nextEntries)) {
              rowspan++;
            } else {
              break;
            }
          }

          if (rowspan > 1) skipCells[day] = rowspan - 1;

          let friTimeBadge = '';
          if (day === 'FRIDAY' && isMiddleSchoolClass(selectedClass)) {
            const friTime = getFridayMiddleSchoolTime(slot.id, rowspan);
            if (friTime) {
              friTimeBadge = `<div class="friday-time-pill">${clockSvg}${friTime}</div>`;
            }
          }

          let cellContent = '';
          let cellStyle = '';

          const isMultiOrGroup = slotEntries.length > 1 || primaryGroup === 'religion' || primaryGroup === 'art';

          if (isMultiOrGroup) {
            let groupTitle = 'IPA / IPS MAJOR';
            let badgeClass = 'group-header-badge split-badge';

            if (primaryGroup === 'religion') {
              groupTitle = 'RELIGION';
              badgeClass = 'group-header-badge';
            } else if (primaryGroup === 'art') {
              groupTitle = 'ART & MUSIC';
              badgeClass = 'group-header-badge';
            }

            const groupBadgeHtml = (groupTitle === 'IPA / IPS MAJOR') ? '' : `<span class="${badgeClass}">${groupTitle}</span>`;

            cellStyle = (slotEntries.length > 1 && primaryGroup === 'regular')
              ? 'background-color: #f8fafc; border: 1px solid #cbd5e1; color: #0f172a;'
              : getSubjectPastelStyle(primaryGroup);

            let itemsHtml = '';
            slotEntries.forEach(entry => {
              const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
              const matInfo = materialsData[matKey] || {};
              const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">${linkSvg}Link</a>` : '';
              const itemPastelStyle = getSubjectPastelStyle(entry.subject);
              const teacherHtml = (entry.teacher && showTeacher) ? `<div class="teacher-sub">${entry.teacher}</div>` : '';

              itemsHtml += `
                <div class="group-item" style="${itemPastelStyle}">
                  <div class="group-subject"><strong>${entry.subject}</strong></div>
                  ${teacherHtml}
                  ${matInfo.material ? `<div class="material-text">${matInfo.material}</div>` : ''}
                  ${linkHtml}
                </div>`;
            });

            cellContent = `
              <div class="subject-card group-card">
                ${friTimeBadge}
                ${groupBadgeHtml}
                <div class="group-items">
                  ${itemsHtml}
                </div>
              </div>`;
          } else {
            const entry = slotEntries[0];
            const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
            const matInfo = materialsData[matKey] || {};
            const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">${linkSvg}Link</a>` : '';
            const teacherHtml = (entry.teacher && showTeacher) ? `<div class="teacher-tag">${entry.teacher}</div>` : '';
            cellStyle = getSubjectPastelStyle(entry.subject);

            cellContent = `
              <div class="subject-card">
                ${friTimeBadge}
                <span class="subject-title">${entry.subject}</span>
                ${teacherHtml}
                ${matInfo.material ? `<div class="material-text">${matInfo.material}</div>` : ''}
                ${linkHtml}
              </div>`;
          }

          const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
          html += `<td${rowspanAttr} class="subject-cell" style="${cellStyle}">${cellContent}</td>`;
        } else {
          if (day === 'FRIDAY') {
            if (slot.id === 7) { // Period 6 (11.40 - 12.25)
              html += `<td class="break-label break-day-cell" style="text-align:center; vertical-align:middle;"><span class="break-pill">CLOSING</span></td>`;
            } else if (isMiddleSchoolClass(selectedClass)) {
              const friTime = getFridayMiddleSchoolTime(slot.id, 1);
              if (friTime) {
                html += `<td class="subject-cell"><div class="friday-time-pill" style="opacity:0.85;">${clockSvg}${friTime}</div><br><span class="empty-dash">-</span></td>`;
              } else {
                html += `<td><span class="empty-dash">-</span></td>`;
              }
            } else {
              html += `<td><span class="empty-dash">-</span></td>`;
            }
          } else {
            html += `<td><span class="empty-dash">-</span></td>`;
          }
        }
      });

      tr.innerHTML = html;
    }

    tbody.appendChild(tr);
  });

  const notesKey = `${calPrefix}_${selectedClass}_notes`;
  const noteText = classNotesData[notesKey] || 'No notes for this week.';

  const notesTr = document.createElement('tr');
  notesTr.className = 'notes-row';
  notesTr.innerHTML = `
    <td class="notes-header-cell">
      <div class="notes-title">${noteSvg}NOTES</div>
    </td>
    <td colspan="5" class="notes-content-cell">
      <div class="notes-box">${noteText}</div>
    </td>
  `;
  tbody.appendChild(notesTr);
}

document.getElementById('btnEditClassWeekly')?.addEventListener('click', () => {
  if (isClassEditMode) {
    exitClassEditMode(true);
  } else {
    enterClassEditMode();
  }
});

document.getElementById('btnSaveClassEdit')?.addEventListener('click', saveClassWeeklySchedule);
document.getElementById('btnCancelClassEdit')?.addEventListener('click', () => exitClassEditMode(true));
document.getElementById('btnResetClassMaster')?.addEventListener('click', resetClassWeeklySchedule);

function updateClassPrintHeader(selectedClass) {
  const isHS = isHighSchoolClass(selectedClass);
  const printSchoolName = document.getElementById('printSchoolName');
  if (printSchoolName) {
    printSchoolName.textContent = isHS ? 'MITRA KASIH HIGH SCHOOL' : 'MITRA KASIH MIDDLE SCHOOL';
  }

  const printSubtitle = document.getElementById('printScheduleSubtitle');
  if (printSubtitle) {
    const yr = (document.getElementById('classYearSelect')?.value || '2026/2027').replace('-', '/');
    const th = document.getElementById('classThemeSelect')?.value || '';
    const wk = document.getElementById('classWeekSelect')?.value || '';
    const cls = (selectedClass || 'Class').toUpperCase();

    const parts = [cls, 'WEEKLY SCHEDULE', yr];
    if (th) parts.push(th.toUpperCase());
    if (wk) parts.push(wk.toUpperCase());
    printSubtitle.textContent = parts.join(' ');
  }
}

document.getElementById('btnPrintPDF')?.addEventListener('click', () => {
  const selectedClass = document.getElementById('classSelectView')?.value;
  updateClassPrintHeader(selectedClass);
  window.print();
});

document.getElementById('btnDownloadExcel')?.addEventListener('click', exportWeeklyToExcel);

document.getElementById('btnTeacherPrintPDF')?.addEventListener('click', () => {
  const teacherName = isTeacherUser()
    ? (getLoggedInTeacherName() || '')
    : (document.getElementById('teacherSelectView')?.value || '');
  const yr = (document.getElementById('teacherYearSelect')?.value || '2026/2027').replace('-', '/');
  const th = document.getElementById('teacherThemeSelect')?.value || '';
  const wk = document.getElementById('teacherWeekSelect')?.value || '';

  const printTeacherSchoolName = document.getElementById('printTeacherSchoolName');
  if (printTeacherSchoolName) {
    printTeacherSchoolName.textContent = 'MITRA KASIH SCHOOL';
  }

  const printTeacherSubtitle = document.getElementById('printTeacherScheduleSubtitle');
  if (printTeacherSubtitle) {
    const parts = [teacherName.toUpperCase() || 'TEACHER', 'WEEKLY SCHEDULE', yr];
    if (th) parts.push(th.toUpperCase());
    if (wk) parts.push(wk.toUpperCase());
    printTeacherSubtitle.textContent = parts.join(' ');
  }

  window.print();
});

document.getElementById('btnTeacherDownloadExcel')?.addEventListener('click', exportTeacherToExcel);

function exportWeeklyToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export library is loading or unavailable. Please refresh the page and try again.');
    return;
  }

  const schoolYear = document.getElementById('classYearSelect')?.value || '';
  const theme = document.getElementById('classThemeSelect')?.value || '';
  const week = document.getElementById('classWeekSelect')?.value || '';
  const dates = document.getElementById('classDateBadge')?.textContent || '';
  const className = document.getElementById('classSelectView')?.value || '';

  const table = document.querySelector('#printableArea table');
  if (!table) {
    alert('No schedule table found to export.');
    return;
  }

  function createExcelStyle(bgHex, borderHex, textHex, options = {}) {
    const cleanBg = (bgHex || "FFFFFF").replace('#', '').toUpperCase();
    const cleanBorder = (borderHex || "CBD5E1").replace('#', '').toUpperCase();
    const cleanText = (textHex || "0F172A").replace('#', '').toUpperCase();

    return {
      fill: {
        fgColor: { rgb: cleanBg }
      },
      font: {
        name: "Calibri",
        sz: options.fontSize || 10,
        bold: !!options.bold,
        italic: !!options.italic,
        color: { rgb: cleanText }
      },
      alignment: {
        horizontal: options.align || "center",
        vertical: "center",
        wrapText: true
      },
      border: {
        top: { style: "thin", color: { rgb: cleanBorder } },
        bottom: { style: "thin", color: { rgb: cleanBorder } },
        left: { style: "thin", color: { rgb: cleanBorder } },
        right: { style: "thin", color: { rgb: cleanBorder } }
      }
    };
  }

  // Parse HTML cell content into structured cell descriptor with pastel colors
  function parseCellData(cell) {
    const tagName = cell.tagName.toLowerCase();

    // 1. Table Headers (th)
    if (tagName === 'th') {
      const dayName = cell.querySelector('.day-name')?.textContent.trim();
      const uniform = cell.querySelector('.edit-uniform-input')?.value || cell.querySelector('.uniform-badge')?.textContent.trim();
      const friBadge = cell.querySelector('.friday-header-badge');
      const friMs = friBadge && friBadge.style.display !== 'none' ? friBadge.textContent.trim() : null;

      let text = cell.textContent.trim();
      if (dayName) {
        const parts = [dayName];
        if (uniform) parts.push(uniform);
        if (friMs) parts.push(friMs);
        text = parts.join('\n');
      }
      return {
        text,
        bgHex: "F1F5F9",
        borderHex: "CBD5E1",
        textHex: "0F172A",
        bold: true,
        fontSize: 11,
        align: "center"
      };
    }

    // 2. Time Column Cell (.time-cell)
    if (cell.classList.contains('time-cell')) {
      const timeRange = cell.querySelector('.time-range')?.textContent.trim();
      const periodBadge = cell.querySelector('.period-badge')?.textContent.trim();

      let text = cell.textContent.trim();
      if (timeRange && periodBadge) {
        text = `${timeRange}\n${periodBadge}`;
      }
      return {
        text,
        bgHex: "F8FAFC",
        borderHex: "CBD5E1",
        textHex: "0F172A",
        bold: true,
        fontSize: 10,
        align: "center"
      };
    }

    // 3. Break Rows & Notes Header
    if (cell.classList.contains('break-time') || cell.classList.contains('break-label')) {
      return {
        text: cell.textContent.trim(),
        bgHex: "E2E8F0",
        borderHex: "CBD5E1",
        textHex: "1E293B",
        bold: true,
        fontSize: 10,
        align: "center"
      };
    }

    if (cell.classList.contains('notes-header-cell')) {
      return {
        text: cell.textContent.trim(),
        bgHex: "F1F5F9",
        borderHex: "CBD5E1",
        textHex: "0F172A",
        bold: true,
        fontSize: 10,
        align: "center"
      };
    }

    if (cell.classList.contains('notes-content-cell')) {
      const noteText = cell.querySelector('.notes-box')?.textContent.trim() || cell.textContent.trim();
      return {
        text: noteText,
        bgHex: "F8FAFC",
        borderHex: "CBD5E1",
        textHex: "334155",
        italic: true,
        fontSize: 10,
        align: "left"
      };
    }

    // 4. Group Subject Card (.group-card for Religion / Art & Music)
    const groupCard = cell.querySelector('.group-card');
    if (groupCard) {
      const friTime = cell.querySelector('.friday-time-pill')?.textContent.trim();
      const groupHeader = cell.querySelector('.group-header-badge')?.textContent.trim() || '';
      const items = cell.querySelectorAll('.group-item');

      const lines = [];
      if (friTime) lines.push(friTime);
      if (groupHeader) lines.push(`-- ${groupHeader} --`);

      items.forEach(item => {
        const subj = item.querySelector('.group-subject')?.textContent.trim() || item.querySelector('strong')?.textContent.trim() || '';
        const teacher = item.querySelector('.teacher-sub')?.textContent.trim() || '';
        const mat = item.querySelector('.material-text')?.textContent.trim();
        const link = item.querySelector('.resource-link')?.href;

        let itemLine = `• ${subj}`;
        if (teacher) itemLine += ` (${teacher})`;
        if (mat && mat !== 'No material entered') itemLine += ` (${mat})`;
        if (link) itemLine += ` [Link: ${link}]`;
        lines.push(itemLine);
      });

      const pastel = getSubjectPastelObject(groupHeader);
      return {
        text: lines.join('\n'),
        bgHex: pastel.bg,
        borderHex: pastel.border,
        textHex: pastel.text,
        bold: true,
        fontSize: 10,
        align: "center"
      };
    }

    // 5. Regular Subject Card (.subject-card)
    const subjectCard = cell.querySelector('.subject-card');
    if (subjectCard) {
      const friTime = cell.querySelector('.friday-time-pill')?.textContent.trim();
      const titleElem = cell.querySelector('.subject-title')?.textContent.trim();
      const teacher = cell.querySelector('.teacher-tag')?.textContent.trim();
      const mat = cell.querySelector('.material-text')?.textContent.trim();
      const link = cell.querySelector('.resource-link')?.href;

      const lines = [];
      if (friTime) lines.push(friTime);
      if (titleElem) lines.push(titleElem);
      if (teacher) lines.push(teacher);
      if (mat && mat !== 'No material entered') lines.push(mat);
      if (link) lines.push(`Link: ${link}`);

      const pastel = getSubjectPastelObject(titleElem);
      return {
        text: lines.join('\n'),
        bgHex: pastel.bg,
        borderHex: pastel.border,
        textHex: pastel.text,
        bold: true,
        fontSize: 10,
        align: "center"
      };
    }

    // 6. Empty or Dash Cells
    const friTimeOnly = cell.querySelector('.friday-time-pill')?.textContent.trim();
    if (cell.querySelector('.empty-dash') || cell.textContent.trim() === '-') {
      const lines = [];
      if (friTimeOnly) lines.push(friTimeOnly);
      lines.push('-');
      return {
        text: lines.join('\n'),
        bgHex: "FFFFFF",
        borderHex: "CBD5E1",
        textHex: "94A3B8",
        fontSize: 10,
        align: "center"
      };
    }

    // Fallback
    return {
      text: cell.textContent.trim(),
      bgHex: "FFFFFF",
      borderHex: "CBD5E1",
      textHex: "0F172A",
      fontSize: 10,
      align: "center"
    };
  }

  // Parse table structure handling rowspans & colspans
  const tableRows = Array.from(table.querySelectorAll('tr'));
  const grid = [];
  const merges = [];
  const rowSkip = {};

  tableRows.forEach((tr, rIdx) => {
    grid[rIdx] = grid[rIdx] || [];
    let cIdx = 0;
    const isBreak = tr.classList.contains('break-row');

    Array.from(tr.children).forEach((cell) => {
      while (rowSkip[cIdx] > 0) {
        rowSkip[cIdx]--;
        cIdx++;
      }

      const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
      const parsedData = parseCellData(cell);

      grid[rIdx][cIdx] = {
        ...parsedData,
        rowspan,
        colspan,
        isBreak
      };

      if (rowspan > 1 || colspan > 1) {
        merges.push({
          s: { r: rIdx, c: cIdx },
          e: { r: rIdx + rowspan - 1, c: cIdx + colspan - 1 }
        });
      }

      if (rowspan > 1) {
        for (let c = cIdx; c < cIdx + colspan; c++) {
          rowSkip[c] = (rowSkip[c] || 0) + (rowspan - 1);
        }
      }

      cIdx += colspan;
    });
  });

  // Construct styled worksheet
  const ws = {};
  ws['!merges'] = [];
  ws['!rows'] = [];

  const rowOffset = 3; // Space for Header Title & Metadata

  // 1. Title Banner (Row 0)
  const titleText = `MITRA KASIH SCHOOL - WEEKLY SCHEDULE (${className || 'Class'})`;
  const titleStyle = createExcelStyle("1E293B", "1E293B", "FFFFFF", { fontSize: 14, bold: true, align: "center" });
  for (let c = 0; c < 6; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    ws[cellRef] = { v: c === 0 ? titleText : '', t: 's', s: titleStyle };
  }
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  ws['!rows'][0] = { hpt: 32 };

  // 2. Metadata Banner (Row 1)
  const metaText = `School Year: ${schoolYear}   |   Theme: ${theme}   |   Week: ${week}   |   ${dates}`;
  const metaStyle = createExcelStyle("EFF6FF", "BFDBFE", "1E40AF", { fontSize: 10, bold: true, align: "center" });
  for (let c = 0; c < 6; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 1, c });
    ws[cellRef] = { v: c === 0 ? metaText : '', t: 's', s: metaStyle };
  }
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
  ws['!rows'][1] = { hpt: 26 };

  // Row 2 Spacer
  ws['!rows'][2] = { hpt: 10 };

  // 3. Grid Rows (Row 3+)
  grid.forEach((row, rIdx) => {
    const excelR = rIdx + rowOffset;
    const isFirstRow = rIdx === 0;
    const isLastRow = rIdx === grid.length - 1;

    // Determine row height dynamically based on max line count
    let maxLines = 1;
    row.forEach(cellData => {
      if (cellData && cellData.text) {
        const linesCount = cellData.text.split('\n').length;
        if (linesCount > maxLines) maxLines = linesCount;
      }
    });

    if (isFirstRow) ws['!rows'][excelR] = { hpt: 34 };
    else if (row[0]?.isBreak) ws['!rows'][excelR] = { hpt: 24 };
    else if (isLastRow) ws['!rows'][excelR] = { hpt: 48 };
    else ws['!rows'][excelR] = { hpt: Math.max(52, maxLines * 18) };

    row.forEach((cellData, cIdx) => {
      if (!cellData) return;

      const style = createExcelStyle(cellData.bgHex, cellData.borderHex, cellData.textHex, {
        fontSize: cellData.fontSize || 10,
        bold: cellData.bold,
        italic: cellData.italic,
        align: cellData.align || "center"
      });

      const rSpan = cellData.rowspan || 1;
      const cSpan = cellData.colspan || 1;

      for (let dr = 0; dr < rSpan; dr++) {
        for (let dc = 0; dc < cSpan; dc++) {
          const targetR = excelR + dr;
          const targetC = cIdx + dc;
          const cellRef = XLSX.utils.encode_cell({ r: targetR, c: targetC });
          const val = (dr === 0 && dc === 0) ? cellData.text : '';
          ws[cellRef] = { v: val, t: 's', s: style };
        }
      }
    });
  });

  // Shift grid merges to match rowOffset
  merges.forEach(m => {
    ws['!merges'].push({
      s: { r: m.s.r + rowOffset, c: m.s.c },
      e: { r: m.e.r + rowOffset, c: m.e.c }
    });
  });

  // Column Widths matching web table proportion
  ws['!cols'] = [
    { wch: 20 }, // TIME
    { wch: 30 }, // MONDAY
    { wch: 30 }, // TUESDAY
    { wch: 30 }, // WEDNESDAY
    { wch: 30 }, // THURSDAY
    { wch: 30 }  // FRIDAY
  ];

  // Set !ref range
  const totalRows = grid.length + rowOffset;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: 5 } });

  // Download XLSX
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Weekly Schedule");

  const safeClass = className.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeWeek = week.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Weekly_Schedule_${safeClass || 'Class'}_${safeWeek || 'Export'}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

function exportTeacherToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel export library is loading or unavailable. Please refresh the page and try again.');
    return;
  }

  const schoolYear = document.getElementById('teacherYearSelect')?.value || '';
  const theme = document.getElementById('teacherThemeSelect')?.value || '';
  const week = document.getElementById('teacherWeekSelect')?.value || '';
  const dates = document.getElementById('teacherDateBadge')?.textContent || '';
  const teacherName = isTeacherUser()
    ? (getLoggedInTeacherName() || 'Teacher')
    : (document.getElementById('teacherSelectView')?.value || 'Teacher');

  const table = document.querySelector('#teacherView .schedule-side table');
  if (!table) {
    alert('No teacher schedule table found to export.');
    return;
  }

  function createExcelStyle(bgHex, borderHex, textHex, options = {}) {
    const cleanBg = (bgHex || "FFFFFF").replace('#', '').toUpperCase();
    const cleanBorder = (borderHex || "CBD5E1").replace('#', '').toUpperCase();
    const cleanText = (textHex || "0F172A").replace('#', '').toUpperCase();

    return {
      fill: { fgColor: { rgb: cleanBg } },
      font: {
        name: "Calibri",
        sz: options.fontSize || 10,
        bold: !!options.bold,
        italic: !!options.italic,
        color: { rgb: cleanText }
      },
      alignment: {
        horizontal: options.align || "center",
        vertical: "center",
        wrapText: true
      },
      border: {
        top: { style: "thin", color: { rgb: cleanBorder } },
        bottom: { style: "thin", color: { rgb: cleanBorder } },
        left: { style: "thin", color: { rgb: cleanBorder } },
        right: { style: "thin", color: { rgb: cleanBorder } }
      }
    };
  }

  function parseCellData(cell) {
    if (!cell) return null;
    let text = cell.innerText ? cell.innerText.trim() : '';

    const isBreak = cell.classList.contains('break-label') || cell.classList.contains('break-time') || cell.parentElement?.classList.contains('break-row');
    const isHeader = cell.tagName === 'TH';

    let bgHex = "FFFFFF";
    let borderHex = "CBD5E1";
    let textHex = "0F172A";

    if (isHeader) {
      bgHex = "F8FAFC";
      borderHex = "94A3B8";
      textHex = "0F172A";
    } else if (isBreak) {
      bgHex = "F1F5F9";
      borderHex = "CBD5E1";
      textHex = "475569";
    } else {
      const computedBg = window.getComputedStyle(cell).backgroundColor;
      if (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent') {
        const rgb = computedBg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          bgHex = ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1).toUpperCase();
        }
      }
    }

    const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
    const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);

    return {
      text,
      bgHex,
      borderHex,
      textHex,
      rowspan,
      colspan,
      isHeader,
      isBreak,
      bold: isHeader || isBreak,
      fontSize: isHeader ? 11 : 10
    };
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  const grid = [];
  const merges = [];

  rows.forEach((tr, rIdx) => {
    if (!grid[rIdx]) grid[rIdx] = [];
    let colCursor = 0;

    const cells = Array.from(tr.querySelectorAll('th, td'));
    cells.forEach(cell => {
      while (grid[rIdx][colCursor]) {
        colCursor++;
      }

      const cellData = parseCellData(cell);
      grid[rIdx][colCursor] = cellData;

      if (cellData.rowspan > 1 || cellData.colspan > 1) {
        merges.push({
          s: { r: rIdx, c: colCursor },
          e: { r: rIdx + cellData.rowspan - 1, c: colCursor + cellData.colspan - 1 }
        });
        for (let dr = 0; dr < cellData.rowspan; dr++) {
          for (let dc = 0; dc < cellData.colspan; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (!grid[rIdx + dr]) grid[rIdx + dr] = [];
            grid[rIdx + dr][colCursor + dc] = { placeholder: true, bgHex: cellData.bgHex, borderHex: cellData.borderHex, textHex: cellData.textHex };
          }
        }
      }
      colCursor += cellData.colspan;
    });
  });

  const ws = {};
  ws['!merges'] = [];

  const bannerTitle = `TEACHER SCHEDULE - ${teacherName.toUpperCase()}`;
  const bannerMeta = `${schoolYear} | ${theme} | ${week} | ${dates}`;

  ws['A1'] = {
    v: bannerTitle,
    t: 's',
    s: createExcelStyle("1E293B", "1E293B", "FFFFFF", { fontSize: 14, bold: true, align: "center" })
  };
  ws['A2'] = {
    v: bannerMeta,
    t: 's',
    s: createExcelStyle("F8FAFC", "CBD5E1", "475569", { fontSize: 10, bold: true, italic: true, align: "center" })
  };

  ws['!merges'].push(
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
  );

  const rowOffset = 3;
  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 10 }
  ];

  grid.forEach((row, rIdx) => {
    const excelR = rIdx + rowOffset;

    let maxLines = 1;
    row.forEach(cellData => {
      if (cellData && cellData.text) {
        const linesCount = cellData.text.split('\n').length;
        if (linesCount > maxLines) maxLines = linesCount;
      }
    });

    const isFirstRow = rIdx === 0;
    const isLastRow = rIdx === grid.length - 1;

    if (isFirstRow) ws['!rows'][excelR] = { hpt: 34 };
    else if (row[0]?.isBreak) ws['!rows'][excelR] = { hpt: 24 };
    else if (isLastRow) ws['!rows'][excelR] = { hpt: 48 };
    else ws['!rows'][excelR] = { hpt: Math.max(52, maxLines * 18) };

    row.forEach((cellData, cIdx) => {
      if (!cellData) return;

      const style = createExcelStyle(cellData.bgHex, cellData.borderHex, cellData.textHex, {
        fontSize: cellData.fontSize || 10,
        bold: cellData.bold,
        italic: cellData.italic,
        align: cellData.align || "center"
      });

      const rSpan = cellData.rowspan || 1;
      const cSpan = cellData.colspan || 1;

      for (let dr = 0; dr < rSpan; dr++) {
        for (let dc = 0; dc < cSpan; dc++) {
          const targetR = excelR + dr;
          const targetC = cIdx + dc;
          const cellRef = XLSX.utils.encode_cell({ r: targetR, c: targetC });
          const val = (dr === 0 && dc === 0) ? cellData.text : '';
          ws[cellRef] = { v: val, t: 's', s: style };
        }
      }
    });
  });

  merges.forEach(m => {
    ws['!merges'].push({
      s: { r: m.s.r + rowOffset, c: m.s.c },
      e: { r: m.e.r + rowOffset, c: m.e.c }
    });
  });

  ws['!cols'] = [
    { wch: 20 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 }
  ];

  const totalRows = grid.length + rowOffset;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: 5 } });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teacher Schedule");

  const safeTeacher = teacherName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeWeek = week.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Teacher_Schedule_${safeTeacher || 'Teacher'}_${safeWeek || 'Export'}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

function getTeacherSlotAssignment(teacherName, day, slotId) {
  let result = null;
  Object.keys(masterSchedules).forEach(className => {
    const slotEntries = getSlotAssignments(className, day, slotId);
    slotEntries.forEach(entry => {
      if (entry.teacher === teacherName) {
        result = {
          subject: entry.subject,
          className: className,
          entry: entry
        };
      }
    });
  });
  return result;
}

function renderTeacherView() {
  const selectElem = document.getElementById('teacherSelectView');
  let selectedTeacher = selectElem ? selectElem.value : '';

  if (isTeacherUser()) {
    const loggedInName = getLoggedInTeacherName();
    if (loggedInName) {
      selectedTeacher = loggedInName;
      if (selectElem && selectElem.value !== loggedInName) {
        selectElem.innerHTML = `<option value="${loggedInName}">${loggedInName}</option>`;
        selectElem.value = loggedInName;
      }
    } else {
      selectedTeacher = '';
    }
  }

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const calPrefix = getActiveCalendarPrefix('teacher');

  const homeSection = document.getElementById('homeTeacherSection');
  const homeClassTitle = document.getElementById('homeClassTitle');
  const noteInput = document.getElementById('weeklyNoteInput');

  const assignedClass = appEntities.homeTeachers?.[selectedTeacher];
  if (assignedClass && homeSection) {
    homeSection.style.display = 'block';
    if (homeClassTitle) homeClassTitle.textContent = `${assignedClass} (${selectedTeacher})`;

    const notesKey = `${calPrefix}_${assignedClass}_notes`;

    if (noteInput) {
      noteInput.value = classNotesData[notesKey] || '';
      autoResizeTextarea(noteInput);
    }
  } else if (homeSection) {
    homeSection.style.display = 'none';
  }

  const tbodyGrid = document.getElementById('teacherScheduleBody');
  if (tbodyGrid) {
    tbodyGrid.innerHTML = '';
    const skipCellsTeacher = { MONDAY: 0, TUESDAY: 0, WEDNESDAY: 0, THURSDAY: 0, FRIDAY: 0 };

    timeSlots.forEach((slot, sIndex) => {
      const tr = document.createElement('tr');
      if (slot.isBreak) {
        tr.className = 'break-row';
        if (slot.id === 0) {
          tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
        } else if (slot.id === 4) {
          tr.innerHTML = `<td>${slot.time}</td><td colspan="4">BREAK</td><td>BREAK</td>`;
        } else if (slot.id === 8) {
          tr.innerHTML = `<td>${slot.time}</td><td colspan="4">LUNCH</td><td>CLOSING</td>`;
        } else if (slot.id === 12) {
          tr.innerHTML = `<td>${slot.time}</td><td colspan="4">CLOSING</td><td>-</td>`;
        } else {
          tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
        }
        days.forEach(day => skipCellsTeacher[day] = 0);
      } else {
        let html = `<td><strong>${slot.time}</strong></td>`;

        days.forEach(day => {
          if (skipCellsTeacher[day] > 0) {
            skipCellsTeacher[day]--;
            return;
          }

          const currentAssign = getTeacherSlotAssignment(selectedTeacher, day, slot.id);

          if (currentAssign) {
            const { subject, className } = currentAssign;
            let rowspan = 1;

            for (let i = sIndex + 1; i < timeSlots.length; i++) {
              const nextSlot = timeSlots[i];
              if (nextSlot.isBreak) break;

              const nextAssign = getTeacherSlotAssignment(selectedTeacher, day, nextSlot.id);
              if (nextAssign && nextAssign.subject === subject && nextAssign.className === className) {
                rowspan++;
              } else {
                break;
              }
            }

            if (rowspan > 1) {
              skipCellsTeacher[day] = rowspan - 1;
            }

            let friTag = "";
            if (day === "FRIDAY" && isMiddleSchoolClass(className)) {
              const friTime = getFridayMiddleSchoolTime(slot.id, rowspan);
              if (friTime) {
                const clockIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
                friTag = `<div class="friday-time-pill" style="margin-bottom:3px; font-size:0.68rem; padding:1px 5px;">${clockIcon}${friTime}</div><br>`;
              }
            }

            const matKey = `${calPrefix}_${className}_${day}_${subject}`;
            const matInfo = materialsData[matKey] || {};
            const matText = matInfo.material ? `<div style="font-size:0.75rem; margin-top:3px; font-weight:500;">${matInfo.material}</div>` : '';
            const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link" style="margin-top:3px; display:inline-block; font-size:0.7rem;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>Link</a>` : '';

            const cellStyle = getSubjectPastelStyle(subject);
            const assignedInfo = `${friTag}<div style="font-weight:700; font-size:0.85rem;">${subject}</div><div style="font-size:0.75rem; opacity:0.85; font-weight:600;">${className}</div>${matText}${linkHtml}`;
            const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';

            html += `<td${rowspanAttr} style="${cellStyle}">${assignedInfo}</td>`;
          } else {
            html += `<td></td>`;
          }
        });

        tr.innerHTML = html;
      }
      tbodyGrid.appendChild(tr);
    });
  }

  const tbodyMat = document.getElementById('materialTableBody');
  if (!tbodyMat) return;
  tbodyMat.innerHTML = '';

  let teacherAssignments = [];
  Object.keys(masterSchedules).forEach(className => {
    days.forEach(day => {
      timeSlots.forEach(slot => {
        const slotEntries = getSlotAssignments(className, day, slot.id);
        slotEntries.forEach(entry => {
          if (entry.teacher === selectedTeacher) {
            const key = `${calPrefix}_${className}_${day}_${entry.subject}`;
            if (!teacherAssignments.find(a => a.key === key)) {
              teacherAssignments.push({ key, className, day, subject: entry.subject });
            }
          }
        });
      });
    });
  });

  // Sort alphabetically by class name, then day of week (MON-FRI), then subject
  const dayOrder = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5 };
  teacherAssignments.sort((a, b) => {
    const classComp = (a.className || '').localeCompare(b.className || '', undefined, { numeric: true, sensitivity: 'base' });
    if (classComp !== 0) return classComp;
    const dayComp = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
    if (dayComp !== 0) return dayComp;
    return (a.subject || '').localeCompare(b.subject || '');
  });

  if (teacherAssignments.length === 0) {
    tbodyMat.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #64748b; padding: 18px 8px;">No class periods assigned for ${selectedTeacher || 'this teacher'}.</td></tr>`;
    return;
  }

  teacherAssignments.forEach(item => {
    const mat = materialsData[item.key]?.material || '';
    const link = materialsData[item.key]?.link || '';
    const dayShort = item.day.substring(0, 3);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: left; padding: 12px 14px;">
        <div style="font-weight: 800; font-size: 14px; color: #0f172a; line-height: 1.2;">${item.className}</div>
        <div style="font-size: 12.5px; color: #475569; font-weight: 600; margin-top: 3px;">${item.subject} <span style="color: #64748b; font-weight: 500;">(${dayShort})</span></div>
      </td>
      <td style="padding: 10px 8px;">
        <input type="text" class="mat-input" data-key="${item.key}" value="${mat}" placeholder="Enter material description or topic...">
      </td>
      <td style="padding: 10px 8px; text-align: center;">
        <div class="kebab-menu">
          <button class="kebab-btn" title="Resource Actions">⋮</button>
          <div class="kebab-dropdown">
            <button class="set-link-opt" data-key="${item.key}">${link ? 'Edit Link' : 'Add Link'}</button>
            ${link ? `<button class="remove-link-opt" data-key="${item.key}">Remove Link</button>` : ''}
          </div>
        </div>
      </td>
    `;
    tbodyMat.appendChild(tr);
  });

  document.querySelectorAll('.mat-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (!materialsData[key]) materialsData[key] = {};
      materialsData[key].material = e.target.value;
      renderClassSchedule();
    });
  });

  document.querySelectorAll('#materialTableBody .kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('#materialTableBody .kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  document.querySelectorAll('.set-link-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      const currentLink = materialsData[key]?.link || '';
      const newLink = prompt("Enter web link / resource URL:", currentLink);

      if (newLink !== null) {
        if (!materialsData[key]) materialsData[key] = {};
        materialsData[key].link = newLink.trim();
        renderTeacherView();
        renderClassSchedule();
      }
    });
  });

  document.querySelectorAll('.remove-link-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = e.target.dataset.key;
      if (materialsData[key]) {
        materialsData[key].link = '';
        renderTeacherView();
        renderClassSchedule();
      }
    });
  });
}

function renderManageScheduleTable() {
  const classSelect = document.getElementById('manageClassSelect');
  const daySelect = document.getElementById('manageDaySelect');
  const tbody = document.getElementById('manageScheduleTableBody');

  if (!classSelect || !daySelect || !tbody) return;

  const selectedClass = classSelect.value;
  const selectedDay = daySelect.value;
  tbody.innerHTML = '';

  if (!selectedClass) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 12px;">Select a class to manage.</td></tr>`;
    return;
  }

  let entryCount = 0;

  timeSlots.forEach(slot => {
    if (slot.isBreak) return;

    const slotAssignments = getSlotAssignments(selectedClass, selectedDay, slot.id);

    slotAssignments.forEach((assignment, index) => {
      entryCount++;
      let timeText = slot.time;
      if (selectedDay === 'FRIDAY' && isMiddleSchoolClass(selectedClass)) {
        const friTime = getFridayMiddleSchoolTime(slot.id);
        if (friTime) timeText = `${friTime} <span style="color:#e11d48; font-weight:700;">(Fri MS)</span>`;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 8px;"><strong>Period ${slot.period}</strong><br><small>${timeText}</small></td>
        <td style="padding: 8px;">${assignment.subject}</td>
        <td style="padding: 8px;">${assignment.teacher}</td>
        <td style="padding: 8px; text-align: center;">
          <div class="kebab-menu">
            <button class="kebab-btn">⋮</button>
            <div class="kebab-dropdown">
              <button class="edit-slot-btn" data-slot="${slot.id}" data-index="${index}">Edit</button>
              <button class="delete-slot-btn" data-slot="${slot.id}" data-index="${index}" style="color: #ef4444;">Delete</button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });

  if (entryCount === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 12px; color: #64748b;">No schedules assigned for ${selectedClass} on ${selectedDay}.</td></tr>`;
  }

  tbody.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      tbody.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  tbody.querySelectorAll('.edit-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slotId = parseInt(e.target.dataset.slot);
      const index = parseInt(e.target.dataset.index);
      editSlotAssignment(selectedClass, selectedDay, slotId, index);
    });
  });

  tbody.querySelectorAll('.delete-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slotId = parseInt(e.target.dataset.slot);
      const index = parseInt(e.target.dataset.index);
      deleteSlotAssignment(selectedClass, selectedDay, slotId, index);
    });
  });
}

async function editSlotAssignment(className, day, slotId, index) {
  const currentAssignments = getSlotAssignments(className, day, slotId);
  const target = currentAssignments[index];
  if (!target) return;

  const availableSubjects = appEntities.subjects.join(', ');
  const newSubject = prompt(`Current Subject: "${target.subject}"\nEnter new Subject (${availableSubjects}):`, target.subject);
  if (newSubject === null) return;

  const availableTeachers = appEntities.teachers.join(', ');
  const newTeacher = prompt(`Current Teacher: "${target.teacher}"\nEnter new Teacher (${availableTeachers}):`, target.teacher);
  if (newTeacher === null) return;

  const cleanSubject = newSubject.trim() || target.subject;
  const cleanTeacher = newTeacher.trim() || target.teacher;

  currentAssignments[index] = { subject: cleanSubject, teacher: cleanTeacher };
  masterSchedules[className][day][slotId] = currentAssignments;

  try {
    await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
    alert("Schedule updated successfully!");
    renderManageScheduleTable();
    renderClassSchedule();
    renderTeacherView();
    renderEntityTables();
  } catch (err) {
    alert("Failed to update schedule: " + err.message);
  }
}

async function deleteSlotAssignment(className, day, slotId, index) {
  const currentAssignments = getSlotAssignments(className, day, slotId);
  const target = currentAssignments[index];
  if (!target) return;

  if (confirm(`Are you sure you want to remove ${target.subject} (${target.teacher}) from Period ${timeSlots[slotId]?.period || slotId}?`)) {
    currentAssignments.splice(index, 1);

    if (currentAssignments.length === 0) {
      delete masterSchedules[className][day][slotId];
    } else {
      masterSchedules[className][day][slotId] = currentAssignments;
    }

    try {
      await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
      alert("Assignment removed successfully!");
      renderManageScheduleTable();
      renderClassSchedule();
      renderTeacherView();
      renderEntityTables();
    } catch (err) {
      alert("Failed to delete assignment: " + err.message);
    }
  }
}

document.getElementById('manageClassSelect')?.addEventListener('change', renderManageScheduleTable);
document.getElementById('manageDaySelect')?.addEventListener('change', renderManageScheduleTable);

const originalPopulateAdminSelects = populateAdminSelects;
populateAdminSelects = function () {
  if (typeof originalPopulateAdminSelects === 'function') originalPopulateAdminSelects();

  const manageClassSel = document.getElementById('manageClassSelect');
  if (manageClassSel) {
    const currVal = manageClassSel.value;
    manageClassSel.innerHTML = appEntities.classes.map(c => `<option value="${c}">${c}</option>`).join('');
    if (currVal && appEntities.classes.includes(currVal)) manageClassSel.value = currVal;
    renderManageScheduleTable();
  }
};

// Add Resource & Register Teacher in Firebase Auth
document.getElementById('addResourceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('resourceType').value;
  const name = document.getElementById('resourceName').value.trim();

  if (!name) return;
  if (appEntities[type].includes(name)) {
    alert(`"${name}" already exists in ${type}.`);
    return;
  }

  if (type === 'teachers') {
    const email = document.getElementById('teacherEmail').value.trim();
    const password = document.getElementById('teacherPassword').value.trim();

    if (!email || !password) {
      alert("Please enter both an Email and Password for the teacher account.");
      return;
    }

    try {
      await createUserWithEmailAndPassword(secondaryAuth, email, password);

      if (!appEntities.teacherEmails) appEntities.teacherEmails = {};
      appEntities.teacherEmails[name] = email;
    } catch (err) {
      alert("Error creating Firebase user account: " + err.message);
      return;
    }
  }

  appEntities[type].push(name);

  try {
    await setDoc(doc(db, "config", "appEntities"), appEntities);
    document.getElementById('resourceName').value = '';
    if (document.getElementById('teacherEmail')) document.getElementById('teacherEmail').value = '';
    if (document.getElementById('teacherPassword')) document.getElementById('teacherPassword').value = '';
    alert(`Successfully added "${name}" to ${type}!`);
  } catch (err) {
    alert("Error adding resource: " + err.message);
  }
});

// Admin Assignment Handler
document.getElementById('assignSlotForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const className = document.getElementById('adminClassSelect').value;
  const day = document.getElementById('adminDaySelect').value;
  const startSlotId = parseInt(document.getElementById('adminPeriodSelect').value);
  const duration = parseInt(document.getElementById('adminDurationSelect').value);
  const assignMode = document.getElementById('adminAssignMode')?.value || 'append';
  const subject = document.getElementById('adminSubjectSelect').value;
  const teacher = document.getElementById('adminTeacherSelect').value;

  if (!className || !subject || !teacher || isNaN(startSlotId)) {
    alert("Please select a valid class, start period, subject, and teacher.");
    return;
  }

  if (!masterSchedules[className]) masterSchedules[className] = {};
  if (!masterSchedules[className][day]) masterSchedules[className][day] = {};

  let filledCount = 0;
  let currentSlotId = startSlotId;
  const groupType = getSubjectGroupType(subject);

  while (filledCount < duration && currentSlotId < timeSlots.length) {
    if (!timeSlots[currentSlotId].isBreak) {
      const existingAssignments = getSlotAssignments(className, day, currentSlotId);

      if (assignMode === 'append' || groupType !== 'regular') {
        const alreadyExists = existingAssignments.some(
          item => item.teacher === teacher && item.subject === subject
        );

        if (!alreadyExists) {
          existingAssignments.push({ subject, teacher });
        }
        masterSchedules[className][day][currentSlotId] = existingAssignments;
      } else {
        masterSchedules[className][day][currentSlotId] = [{ subject, teacher }];
      }
      filledCount++;
    }
    currentSlotId++;
  }

  try {
    await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
    renderClassSchedule();
    renderTeacherView();
    renderManageScheduleTable();
    renderEntityTables();
    alert(`Successfully assigned ${subject} (${teacher}) to ${className} on ${day}!`);
  } catch (err) {
    alert("Error updating schedule: " + err.message);
  }
});

document.getElementById('saveMaterialsBtn')?.addEventListener('click', async () => {
  try {
    await setDoc(doc(db, "schedules", "materialsData"), materialsData, { merge: true });
    alert("Materials updated successfully!");
  } catch (err) {
    alert("Error saving materials: " + err.message);
  }
});

// Teacher Material Side Toggle Handler
let isTeacherMaterialVisible = false;

function toggleTeacherMaterialTable(forceState = null) {
  const side = document.getElementById('teacherMaterialSide');
  const btn = document.getElementById('btnToggleTeacherMaterial');
  const btnText = document.getElementById('btnToggleTeacherMaterialText');
  if (!side) return;

  if (forceState !== null) {
    isTeacherMaterialVisible = forceState;
  } else {
    isTeacherMaterialVisible = !isTeacherMaterialVisible;
  }

  if (isTeacherMaterialVisible) {
    side.style.display = 'block';
    if (btn) btn.classList.add('active-editing');
    if (btnText) btnText.textContent = 'Hide Material Editor';
  } else {
    side.style.display = 'none';
    if (btn) btn.classList.remove('active-editing');
    if (btnText) btnText.textContent = 'Input or Edit Material';
  }
}

document.getElementById('btnToggleTeacherMaterial')?.addEventListener('click', () => toggleTeacherMaterialTable());
document.getElementById('btnCloseTeacherMaterial')?.addEventListener('click', () => toggleTeacherMaterialTable(false));

document.getElementById('classSelectView')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});
document.getElementById('classYearSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});
document.getElementById('classThemeSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});
document.getElementById('classWeekSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});
document.getElementById('teacherSelectView')?.addEventListener('change', renderTeacherView);
document.getElementById('adminClassSelect')?.addEventListener('change', updateAdminPeriodSelectOptions);
document.getElementById('adminDaySelect')?.addEventListener('change', updateAdminPeriodSelectOptions);
document.getElementById('manageClassSelect')?.addEventListener('change', renderManageScheduleTable);
document.getElementById('manageDaySelect')?.addEventListener('change', renderManageScheduleTable);

// Firebase Real-time Synchronization Snapshots
onSnapshot(doc(db, "config", "academicCalendar"), (docSnap) => {
  if (docSnap.exists()) {
    academicCalendar = docSnap.data();
  } else {
    academicCalendar = {
      "2026-2027": {
        "Theme 1": {
          "Week 1": { startDate: "2026-07-13", endDate: "2026-07-19" },
          "Week 2": { startDate: "2026-07-20", endDate: "2026-07-26" }
        }
      }
    };
    setDoc(doc(db, "config", "academicCalendar"), academicCalendar);
  }
  populateCalendarSelects();
  renderClassSchedule();
  renderTeacherView();
});

onSnapshot(doc(db, "config", "appEntities"), (docSnap) => {
  if (docSnap.exists()) {
    appEntities = docSnap.data();
    if (!appEntities.classes) appEntities.classes = [];
    if (!appEntities.teachers) appEntities.teachers = [];
    if (!appEntities.subjects) appEntities.subjects = [];
    if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
    if (!appEntities.teacherEmails) appEntities.teacherEmails = {};
  } else {
    appEntities = {
      teachers: ["Mr. Syam", "Mr. Jerry"],
      classes: ["Grade 9A", "Grade 9B", "Grade 9C"],
      subjects: ["English", "Pancasila", "ICT", "Math"],
      homeTeachers: {},
      teacherEmails: {}
    };
  }
  const hadNew = syncEntitiesFromMasterSchedules();
  if (hadNew) {
    setDoc(doc(db, "config", "appEntities"), appEntities, { merge: true }).catch(console.warn);
  }
  populateAdminSelects();
  renderClassSchedule();
  renderTeacherView();
});

onSnapshot(doc(db, "schedules", "masterSchedules"), async (docSnap) => {
  if (docSnap.exists()) {
    masterSchedules = docSnap.data();
  } else {
    masterSchedules = {};
  }
  const hadNew = syncEntitiesFromMasterSchedules();
  if (hadNew) {
    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities, { merge: true });
    } catch (e) {
      console.warn("Could not sync appEntities with masterSchedules:", e);
    }
  }
  populateAdminSelects();
  renderClassSchedule();
  renderTeacherView();
  renderManageScheduleTable();
  renderEntityTables();
});

onSnapshot(doc(db, "schedules", "weeklyOverrides"), (docSnap) => {
  if (docSnap.exists()) weeklyOverrides = docSnap.data();
  else weeklyOverrides = {};
  const hadNew = syncEntitiesFromMasterSchedules();
  if (hadNew) {
    populateAdminSelects();
  }
  if (!isClassEditMode) {
    renderClassSchedule();
    renderTeacherView();
    renderEntityTables();
  }
});

onSnapshot(doc(db, "schedules", "materialsData"), (docSnap) => {
  if (docSnap.exists()) materialsData = docSnap.data();
  if (!isClassEditMode) {
    renderClassSchedule();
  }
  renderTeacherView();
});

onSnapshot(doc(db, "schedules", "classNotesData"), (docSnap) => {
  if (docSnap.exists()) classNotesData = docSnap.data();
  renderClassSchedule();
  renderTeacherView();
});

document.getElementById('btnSaveClassNotes')?.addEventListener('click', async () => {
  const selectedTeacher = isTeacherUser()
    ? (getLoggedInTeacherName() || '')
    : (document.getElementById('teacherSelectView')?.value || '');
  const assignedClass = appEntities.homeTeachers?.[selectedTeacher];
  if (!assignedClass) return;

  const calPrefix = getActiveCalendarPrefix('teacher');
  const notesKey = `${calPrefix}_${assignedClass}_notes`;
  const text = document.getElementById('weeklyNoteInput').value;

  classNotesData[notesKey] = text;

  try {
    await setDoc(doc(db, "schedules", "classNotesData"), classNotesData, { merge: true });
    alert(`Weekly notes updated for ${assignedClass}!`);
    renderClassSchedule();
  } catch (err) {
    alert("Error saving weekly notes: " + err.message);
  }
});

document.getElementById('btnCreateTempWeekly')?.addEventListener('click', () => {
  const selectedTeacher = document.getElementById('teacherSelectView')?.value;
  const assignedClass = appEntities.homeTeachers?.[selectedTeacher];

  if (!assignedClass) {
    alert("Please select a valid Home Teacher assigned to a class first.");
    return;
  }

  const calPrefix = getActiveCalendarPrefix('teacher');
  const container = document.getElementById('tempWeeklyContainer');
  const tbody = document.getElementById('tempWeeklyBody');
  if (!container || !tbody) return;

  tbody.innerHTML = '';
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

  timeSlots.forEach(slot => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
    } else {
      let html = `<td><strong>${slot.time}</strong></td>`;
      days.forEach(day => {
        const slotEntries = getSlotAssignments(assignedClass, day, slot.id);
        let cellText = "-";
        if (slotEntries.length > 0) {
          cellText = slotEntries.map(e => `${e.subject} (${e.teacher})`).join("<br>");
        }
        html += `<td contenteditable="true" style="background-color: #fff; border: 1px dashed #94a3b8; padding: 6px; text-align: center;">${cellText}</td>`;
      });
      tr.innerHTML = html;
    }
    tbody.appendChild(tr);
  });

  container.style.display = 'block';

  const newWin = window.open("", "_blank");
  if (!newWin) {
    alert("Pop-up blocked! Please allow pop-ups for this site to open the template in a new tab.");
    return;
  }

  const weekInfo = document.getElementById('teacherWeekSelect')?.value || 'Weekly Draft';

  const newTabHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Draft Schedule - ${assignedClass} (${weekInfo})</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background-color: #f8fafc; color: #0f172a; }
      .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .btn { padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; border: none; font-size: 13px; }
      .btn-print { background-color: #059669; color: white; }
      .btn-save { background-color: #2563eb; color: white; margin-left: 8px; }
      table { width: 100%; border-collapse: collapse; background: white; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      th { background-color: #f1f5f9; font-weight: bold; }
      .break-row { background-color: #e2e8f0; font-weight: bold; letter-spacing: 1px; }
      [contenteditable="true"] { background-color: #ffffea; outline: 1px dashed #93c5fd; }
      [contenteditable="true"]:focus { background-color: #ffffff; outline: 2px solid #2563eb; }
      @media print {
        .no-print { display: none !important; }
        body { padding: 0; background: white; }
        [contenteditable="true"] { outline: none !important; background: transparent !important; }
        th, td { border: 1px solid #000 !important; }
      }
    </style>
  </head>
  <body>
    <div class="header-bar no-print">
      <div>
        <h2 style="margin: 0;">Offline Draft Weekly Schedule: ${assignedClass}</h2>
        <small style="color: #64748b;">${weekInfo} | Edits here are isolated and will not overwrite live database data.</small>
      </div>
      <div>
        <button class="btn btn-print" onclick="window.print()">Print Draft Directly</button>
        <button class="btn btn-save" onclick="saveDraft()">Save Draft Locally</button>
      </div>
    </div>
    <table id="draftTable">
      <thead>
        <tr>
          <th>TIME</th><th>MONDAY</th><th>TUESDAY</th><th>WEDNESDAY</th><th>THURSDAY</th><th>FRIDAY</th>
        </tr>
      </thead>
      <tbody>
        ${tbody.innerHTML}
      </tbody>
    </table>
    <script>
      function saveDraft() {
        const content = document.getElementById('draftTable').innerHTML;
        localStorage.setItem('tempDraft_${assignedClass}_${calPrefix}', content);
        alert('Draft saved locally for ${assignedClass}!');
      }
    <\/script>
  </body>
  </html>
  `;

  newWin.document.open();
  newWin.document.write(newTabHtml);
  newWin.document.close();
});

// ======================================================
// ASSEMBLY CHARACTER & SKILL REWARDS MODULE
// ======================================================
let assemblyRewardsData = {};
let portalStudentsList = []; // Students loaded from syamserverlist database for autocomplete

const THEME_1_REWARD_CATEGORIES = [
  { id: 'independence', name: 'Independence', type: 'Character', desc: 'Self-reliance, proactive initiative, intrinsic motivation, and taking personal ownership of learning.' },
  { id: 'respect', name: 'Respect', type: 'Character', desc: 'Empathy, courteous communication, listening attentively, valuing diversity, and honoring teachers & peers.' },
  { id: 'responsibility', name: 'Responsibility', type: 'Character', desc: 'Reliability, punctual assignment completion, accountability for choices, and trustworthy conduct.' },
  { id: 'thinking_skill', name: 'Thinking Skill', type: 'Skill', desc: 'Critical inquiry, creative problem solving, insightful questioning, and analytical reasoning in coursework.' },
  { id: 'self_management', name: 'Self Management', type: 'Skill', desc: 'Organized focus, emotional regulation, optimal time discipline, preparedness, and perseverance.' },
  { id: 'fun_literacy', name: 'Fun Literacy', type: 'Skill', desc: 'Enthusiastic reading passion, rich vocabulary expression, creative writing, and book exploration.' }
];

// Fetch students from syamserverlist database for autocomplete
async function loadPortalStudents() {
  try {
    const snap = await getDocs(collection(syamDb, "students"));
    portalStudentsList = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && (data.studentName || data.name)) {
        portalStudentsList.push({
          id: docSnap.id,
          name: (data.studentName || data.name || '').trim(),
          className: (data.studentClass || data.class || '').trim()
        });
      }
    });

    // Naturally sort by name
    portalStudentsList.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    updateStudentsDatalist();
  } catch (err) {
    console.warn("Could not load students from syamserverlist:", err);
  }
}

// Initial fetch
loadPortalStudents();

// Update <datalist id="classStudentsDatalist"> dynamically prioritizing currently selected class
function updateStudentsDatalist() {
  const datalist = document.getElementById('classStudentsDatalist');
  if (!datalist) return;

  const currentClass = (document.getElementById('rewardClassSelect')?.value || '').trim();
  const cleanCurrentClass = currentClass.replace(/^grade\s+/i, '').toLowerCase();

  // Sort students: current class first, then others
  const sorted = [...portalStudentsList].sort((a, b) => {
    const aClean = a.className.replace(/^grade\s+/i, '').toLowerCase();
    const bClean = b.className.replace(/^grade\s+/i, '').toLowerCase();
    const aMatch = aClean === cleanCurrentClass;
    const bMatch = bClean === cleanCurrentClass;

    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return a.name.localeCompare(b.name);
  });

  datalist.innerHTML = sorted.map(s => {
    const label = s.className ? `${s.name} (${s.className})` : s.name;
    return `<option value="${escapeHtml(s.name)}">${escapeHtml(label)}</option>`;
  }).join('');
}

// Real-time Firestore sync for Assembly Rewards
onSnapshot(doc(db, "schedules", "assemblyRewards"), (docSnap) => {
  if (docSnap.exists()) {
    assemblyRewardsData = docSnap.data() || {};
  } else {
    assemblyRewardsData = {};
  }
  const rewardTab = document.getElementById('rewardView');
  if (rewardTab && rewardTab.classList.contains('active')) {
    renderRewardView();
  }
}, (err) => {
  console.warn("Could not listen to assemblyRewards:", err);
});

function initRewardView() {
  populateRewardSelects();
  updateStudentsDatalist();
  renderRewardView();
}

function populateRewardSelects() {
  const years = Object.keys(academicCalendar);
  const yearSel = document.getElementById('rewardYearSelect');
  const themeSel = document.getElementById('rewardThemeSelect');
  const classSel = document.getElementById('rewardClassSelect');

  if (yearSel) {
    const currYear = yearSel.value;
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (currYear && years.includes(currYear)) {
      yearSel.value = currYear;
    }
  }

  const selectedYear = yearSel?.value || (years[0] || '2026/2027');
  const themes = selectedYear && academicCalendar[selectedYear] ? Object.keys(academicCalendar[selectedYear]) : ['Theme 1', 'Theme 2', 'Theme 3', 'Theme 4'];

  if (themeSel) {
    const currTheme = themeSel.value;
    themeSel.innerHTML = themes.map(t => `<option value="${t}">${t}</option>`).join('');
    if (currTheme && themes.includes(currTheme)) {
      themeSel.value = currTheme;
    } else if (themes.includes('Theme 1')) {
      themeSel.value = 'Theme 1';
    }
  }

  if (classSel) {
    const currClass = classSel.value;
    const classes = appEntities.classes || [];
    classSel.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');

    if (isTeacherUser()) {
      const tName = getLoggedInTeacherName();
      const homeClass = appEntities.homeTeachers?.[tName];
      if (homeClass && classes.includes(homeClass) && !currClass) {
        classSel.value = homeClass;
      } else if (currClass && classes.includes(currClass)) {
        classSel.value = currClass;
      }
    } else if (currClass && classes.includes(currClass)) {
      classSel.value = currClass;
    }
  }
}

function getRewardStorageKey(year, theme, className) {
  const cleanYear = (year || '2026/2027').replace(/[\/\\]/g, '-');
  const cleanTheme = (theme || 'Theme 1').replace(/\s+/g, '_');
  const cleanClass = (className || 'Grade 7A').replace(/\s+/g, '_');
  return `${cleanYear}_${cleanTheme}_${cleanClass}`;
}

// Fun Literacy Dynamic Multi-Student Entries Rendering
function renderFunLiteracyEntries(entries) {
  const container = document.getElementById('funLiteracyEntries');
  if (!container) return;

  // Normalize entries into array of { student }
  let list = [];
  if (Array.isArray(entries)) {
    list = entries;
  } else if (entries && typeof entries === 'object') {
    if (Array.isArray(entries.students) && entries.students.length > 0) {
      list = entries.students;
    } else if (entries.student || entries.studentName) {
      list = [{ student: entries.student || entries.studentName || '' }];
    }
  }

  if (list.length === 0) {
    list = [{ student: '' }];
  }

  container.innerHTML = list.map((item, index) => `
    <div class="fun-literacy-entry-row" data-index="${index}">
      <div class="entry-row-header">
        <span class="entry-row-num">Awardee #${index + 1}</span>
        ${list.length > 1 ? `<button type="button" class="btn-remove-recipient" onclick="removeFunLiteracyRow(${index})" title="Remove recipient">✕</button>` : ''}
      </div>
      <div class="reward-form-group" style="margin-bottom: 0;">
        <input type="text" class="reward-input-field fun-student-input" list="classStudentsDatalist" autocomplete="off" placeholder="Type or select student name..." value="${escapeHtml(item.student || '')}">
      </div>
    </div>
  `).join('');
}

window.removeFunLiteracyRow = function (index) {
  const currentEntries = getFunLiteracyCurrentValues();
  currentEntries.splice(index, 1);
  if (currentEntries.length === 0) {
    currentEntries.push({ student: '' });
  }
  renderFunLiteracyEntries(currentEntries);
};

function getFunLiteracyCurrentValues() {
  const entries = [];
  document.querySelectorAll('#funLiteracyEntries .fun-literacy-entry-row').forEach(row => {
    const student = row.querySelector('.fun-student-input')?.value.trim() || '';
    entries.push({ student });
  });
  return entries;
}

document.getElementById('btnAddFunLiteracyStudent')?.addEventListener('click', () => {
  const current = getFunLiteracyCurrentValues();
  current.push({ student: '' });
  renderFunLiteracyEntries(current);
});

function renderRewardView() {
  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  const className = document.getElementById('rewardClassSelect')?.value || (appEntities.classes[0] || 'Grade 7A');

  // Update Section Title & Badges
  const sectionTitle = document.getElementById('rewardSectionTitle');
  if (sectionTitle) {
    sectionTitle.textContent = `Assembly Character & Skill Rewards — ${className} (${theme})`;
  }
  const badgeText = document.getElementById('rewardClassBadgeText');
  if (badgeText) {
    badgeText.textContent = `${className} • ${theme}`;
  }

  const storageKey = getRewardStorageKey(year, theme, className);
  const record = assemblyRewardsData[storageKey] || {};
  const rewards = record.rewards || record;

  // Fill categories 1 to 5 (Single awardee)
  THEME_1_REWARD_CATEGORIES.slice(0, 5).forEach(cat => {
    const studentInput = document.getElementById(`rewardStudent_${cat.id}`);
    const catData = rewards[cat.id] || {};

    if (studentInput) {
      studentInput.value = catData.student || catData.studentName || (typeof catData === 'string' ? catData : '');
    }
  });

  // Fill category 6: Fun Literacy (Multi-student)
  renderFunLiteracyEntries(rewards.fun_literacy || []);

  // Update Save Status text
  const statusPill = document.getElementById('rewardSaveStatus');
  const statusText = document.getElementById('rewardSaveStatusText');
  if (record.updatedAt && statusText) {
    const d = new Date(record.updatedAt);
    const timeStr = isNaN(d.getTime()) ? '' : `Saved (${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    statusText.textContent = timeStr || 'Saved in Database';
    statusPill?.classList.add('saved');
  } else if (statusText) {
    statusText.textContent = 'Ready to nominate';
    statusPill?.classList.remove('saved');
  }

  // Render Printable Sheet Table Body
  renderRewardPrintSheet(year, theme, className, record);

  // Render Master Summary Ledger Table (All classes for this theme)
  renderRewardMasterLedger(year, theme);
}

function renderRewardPrintSheet(year, theme, className, record) {
  const tbody = document.getElementById('rewardPrintTableBody');
  const printSubtitle = document.getElementById('printRewardSubtitle');
  const teacherNameEl = document.getElementById('printRewardTeacherName');

  if (printSubtitle) {
    printSubtitle.textContent = `ASSEMBLY CHARACTER & SKILL AWARDS — ${className.toUpperCase()} — ${theme.toUpperCase()} ${year}`;
  }

  // Teacher signature name
  let teacherName = 'Homeroom Teacher';
  if (appEntities.homeTeachers) {
    const foundTeacher = Object.keys(appEntities.homeTeachers).find(t => appEntities.homeTeachers[t] === className);
    if (foundTeacher) teacherName = foundTeacher;
  }
  if (teacherNameEl) {
    teacherNameEl.textContent = `( ${teacherName} )`;
  }

  if (!tbody) return;

  const rewards = record.rewards || record;
  let rowsHtml = '';

  THEME_1_REWARD_CATEGORIES.forEach((cat, index) => {
    const catData = rewards[cat.id] || {};

    if (cat.id === 'fun_literacy') {
      // Check multi-student entries
      let studentsList = [];
      if (Array.isArray(catData.students) && catData.students.length > 0) {
        studentsList = catData.students.filter(s => s.student && s.student.trim());
      } else if (catData.student && catData.student.trim()) {
        studentsList = [{ student: catData.student }];
      } else if (typeof catData === 'string' && catData.trim()) {
        studentsList = [{ student: catData.trim() }];
      }

      if (studentsList.length > 1) {
        const studentsHtml = studentsList.map((s, idx) => `<div>${idx + 1}. <strong>${escapeHtml(s.student)}</strong></div>`).join('');

        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${index + 1}</td>
            <td><strong>${cat.name}</strong> <small style="display:block; color:#2563eb; font-weight:bold;">(Multiple Recipients)</small></td>
            <td><span style="font-size: 9.5pt; font-weight: bold; color: #2563eb;">Skill Pillar</span></td>
            <td style="font-weight: 700; color: #0f172a;">${studentsHtml}</td>
          </tr>
        `;
        return;
      } else if (studentsList.length === 1) {
        rowsHtml += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${index + 1}</td>
            <td><strong>${cat.name}</strong></td>
            <td><span style="font-size: 9.5pt; font-weight: bold; color: #2563eb;">Skill Pillar</span></td>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(studentsList[0].student)}</td>
          </tr>
        `;
        return;
      }
    }

    const student = catData.student || catData.studentName || (typeof catData === 'string' ? catData : '-');
    const isNominated = student && student !== '-';

    rowsHtml += `
      <tr>
        <td style="text-align: center; font-weight: bold;">${index + 1}</td>
        <td><strong>${cat.name}</strong></td>
        <td><span style="font-size: 9.5pt; font-weight: bold; color: ${cat.type === 'Character' ? '#ea580c' : '#2563eb'};">${cat.type} Pillar</span></td>
        <td style="font-weight: 700; ${isNominated ? 'color: #0f172a;' : 'color: #94a3b8; font-style: italic;'}">${escapeHtml(student)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

// Master Ledger Table State (Edit mode toggle)
let isLedgerEditMode = false;

function renderRewardMasterLedger(year, theme) {
  const tbody = document.getElementById('rewardMasterTableBody');
  const masterTitle = document.getElementById('rewardMasterTitle');
  const btnToggle = document.getElementById('btnToggleLedgerEdit');
  const btnSaveTable = document.getElementById('btnSaveLedgerTable');
  const btnToggleText = document.getElementById('btnToggleLedgerEditText');

  if (masterTitle) {
    masterTitle.textContent = `Assembly Awards Master Ledger — ${theme} (${year})`;
  }

  if (btnToggleText) {
    btnToggleText.textContent = isLedgerEditMode ? 'Exit Table Edit' : 'Edit in Table';
  }
  if (btnToggle) {
    if (isLedgerEditMode) {
      btnToggle.classList.add('cancel-btn');
      btnToggle.classList.remove('edit-btn');
    } else {
      btnToggle.classList.remove('cancel-btn');
      btnToggle.classList.add('edit-btn');
    }
  }
  if (btnSaveTable) {
    btnSaveTable.style.display = isLedgerEditMode ? 'inline-flex' : 'none';
  }

  if (!tbody) return;

  const classes = appEntities.classes || [];
  if (classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">No classes configured in database.</td></tr>`;
    return;
  }

  let html = '';
  classes.forEach(cls => {
    const key = getRewardStorageKey(year, theme, cls);
    const rec = assemblyRewardsData[key] || {};
    const rewards = rec.rewards || rec;

    const cellFor = (catId) => {
      const data = rewards[catId] || {};

      if (catId === 'fun_literacy') {
        let studentsList = [];
        if (Array.isArray(data.students) && data.students.length > 0) {
          studentsList = data.students.filter(s => s.student && s.student.trim());
        } else if (data.student && data.student.trim()) {
          studentsList = [{ student: data.student }];
        } else if (typeof data === 'string' && data.trim()) {
          studentsList = [{ student: data.trim() }];
        }

        const namesJoined = studentsList.map(s => s.student).join(', ');

        if (isLedgerEditMode) {
          return `<input type="text" class="ledger-table-input" data-class="${escapeHtml(cls)}" data-cat="fun_literacy" list="classStudentsDatalist" autocomplete="off" value="${escapeHtml(namesJoined)}" placeholder="Multiple names separated by comma...">`;
        }

        if (studentsList.length > 0) {
          return studentsList.map(s => `
            <div style="margin-bottom: 2px;">
              <span class="reward-cell-pill">${escapeHtml(s.student)}</span>
            </div>
          `).join('');
        }
        return `<span class="reward-cell-empty">-</span>`;
      }

      const name = data.student || data.studentName || (typeof data === 'string' ? data : '');

      if (isLedgerEditMode) {
        return `<input type="text" class="ledger-table-input" data-class="${escapeHtml(cls)}" data-cat="${catId}" list="classStudentsDatalist" autocomplete="off" value="${escapeHtml(name)}" placeholder="Type student name...">`;
      }

      if (name) {
        return `<span class="reward-cell-pill">${escapeHtml(name)}</span>`;
      }
      return `<span class="reward-cell-empty">-</span>`;
    };

    html += `
      <tr class="${isLedgerEditMode ? '' : 'clickable-row'}" data-class="${escapeHtml(cls)}" title="${isLedgerEditMode ? '' : 'Click to select ' + cls + ' in nomination cards above'}">
        <td><strong>${escapeHtml(cls)}</strong></td>
        <td>${cellFor('independence')}</td>
        <td>${cellFor('respect')}</td>
        <td>${cellFor('responsibility')}</td>
        <td>${cellFor('thinking_skill')}</td>
        <td>${cellFor('self_management')}</td>
        <td>${cellFor('fun_literacy')}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Add click listeners to rows in view mode to switch selected class
  if (!isLedgerEditMode) {
    tbody.querySelectorAll('tr.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const cls = row.getAttribute('data-class');
        const classSel = document.getElementById('rewardClassSelect');
        if (classSel && cls) {
          classSel.value = cls;
          updateStudentsDatalist();
          renderRewardView();
          document.querySelector('.reward-main-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }
}

// Toggle Ledger Edit Mode
document.getElementById('btnToggleLedgerEdit')?.addEventListener('click', () => {
  isLedgerEditMode = !isLedgerEditMode;
  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  renderRewardMasterLedger(year, theme);
});

// Save Changes Directly from Master Ledger Table
document.getElementById('btnSaveLedgerTable')?.addEventListener('click', async () => {
  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  const inputs = document.querySelectorAll('.ledger-table-input');
  const btnSaveTable = document.getElementById('btnSaveLedgerTable');

  // Group inputs by class
  const classMap = {};
  inputs.forEach(input => {
    const cls = input.getAttribute('data-class');
    const cat = input.getAttribute('data-cat');
    const val = input.value.trim();

    if (!classMap[cls]) {
      classMap[cls] = {
        independence: { student: '' },
        respect: { student: '' },
        responsibility: { student: '' },
        thinking_skill: { student: '' },
        self_management: { student: '' },
        fun_literacy: { students: [], student: '' }
      };
    }

    if (cat === 'fun_literacy') {
      const studentNames = val.split(',').map(s => s.trim()).filter(Boolean);
      classMap[cls].fun_literacy = {
        students: studentNames.map(name => ({ student: name })),
        student: studentNames.join(', ')
      };
    } else if (cat) {
      classMap[cls][cat] = { student: val };
    }
  });

  try {
    if (btnSaveTable) {
      btnSaveTable.disabled = true;
      btnSaveTable.innerHTML = `<span>Saving Table...</span>`;
    }

    const updatedBy = auth.currentUser ? (auth.currentUser.email || 'Staff') : 'Staff';
    const now = new Date().toISOString();

    Object.keys(classMap).forEach(cls => {
      const storageKey = getRewardStorageKey(year, theme, cls);
      assemblyRewardsData[storageKey] = {
        year: year,
        theme: theme,
        className: cls,
        rewards: classMap[cls],
        updatedAt: now,
        updatedBy: updatedBy
      };
    });

    await setDoc(doc(db, "schedules", "assemblyRewards"), assemblyRewardsData, { merge: true });

    isLedgerEditMode = false;
    renderRewardView();
    alert(`All Assembly Awards in the Master Ledger table were successfully saved!`);
  } catch (err) {
    console.error("Error saving ledger table data:", err);
    alert("Failed to save table changes: " + err.message);
  } finally {
    if (btnSaveTable) {
      btnSaveTable.disabled = false;
      btnSaveTable.innerHTML = `
        <span class="btn-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        </span>
        <span>Save Table Changes</span>
      `;
    }
  }
});

async function saveAssemblyRewards() {
  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  const className = document.getElementById('rewardClassSelect')?.value || 'Grade 7A';

  // Gather Fun Literacy dynamic multi-student entries
  const funEntries = [];
  document.querySelectorAll('#funLiteracyEntries .fun-student-input').forEach(input => {
    const student = input.value.trim();
    if (student) {
      funEntries.push({ student });
    }
  });

  const rewardObj = {
    independence: {
      student: document.getElementById('rewardStudent_independence')?.value.trim() || ''
    },
    respect: {
      student: document.getElementById('rewardStudent_respect')?.value.trim() || ''
    },
    responsibility: {
      student: document.getElementById('rewardStudent_responsibility')?.value.trim() || ''
    },
    thinking_skill: {
      student: document.getElementById('rewardStudent_thinking_skill')?.value.trim() || ''
    },
    self_management: {
      student: document.getElementById('rewardStudent_self_management')?.value.trim() || ''
    },
    fun_literacy: {
      students: funEntries,
      student: funEntries.map(e => e.student).filter(Boolean).join(', ')
    }
  };

  const storageKey = getRewardStorageKey(year, theme, className);
  const recordToSave = {
    year: year,
    theme: theme,
    className: className,
    rewards: rewardObj,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser ? (auth.currentUser.email || 'Staff') : 'Staff'
  };

  assemblyRewardsData[storageKey] = recordToSave;

  const btnSave = document.getElementById('btnSaveRewards');
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span>Saving Awards...</span>`;
    }

    await setDoc(doc(db, "schedules", "assemblyRewards"), assemblyRewardsData, { merge: true });

    renderRewardView();
    alert(`Assembly Rewards successfully saved for ${className} (${theme})!`);
  } catch (err) {
    console.error("Error saving assembly rewards:", err);
    alert("Failed to save assembly rewards: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>Save All Awards for this Class</span>
      `;
    }
  }
}

function clearAssemblyRewardForm() {
  if (confirm("Are you sure you want to clear the inputs for this class?")) {
    THEME_1_REWARD_CATEGORIES.slice(0, 5).forEach(cat => {
      const studentInput = document.getElementById(`rewardStudent_${cat.id}`);
      if (studentInput) studentInput.value = '';
    });
    renderFunLiteracyEntries([{ student: '' }]);
  }
}

function printAssemblyRewardSheet() {
  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  const className = document.getElementById('rewardClassSelect')?.value || 'Grade 7A';
  const storageKey = getRewardStorageKey(year, theme, className);
  const record = assemblyRewardsData[storageKey] || {};

  renderRewardPrintSheet(year, theme, className, record);
  window.print();
}

function exportAssemblyRewardsToExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Export library is loading. Please try again in a moment.");
    return;
  }

  const year = document.getElementById('rewardYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('rewardThemeSelect')?.value || 'Theme 1';
  const classes = appEntities.classes || [];

  const headers = ["Class", "Independence", "Respect", "Responsibility", "Thinking Skill", "Self Management", "Fun Literacy"];
  const rows = [headers];

  classes.forEach(cls => {
    const key = getRewardStorageKey(year, theme, cls);
    const rec = assemblyRewardsData[key] || {};
    const rew = rec.rewards || rec;

    let funLiteracyText = "-";
    if (rew.fun_literacy) {
      if (Array.isArray(rew.fun_literacy.students) && rew.fun_literacy.students.length > 0) {
        funLiteracyText = rew.fun_literacy.students.map(s => s.student).filter(Boolean).join(', ') || "-";
      } else if (rew.fun_literacy.student) {
        funLiteracyText = rew.fun_literacy.student;
      } else if (typeof rew.fun_literacy === 'string') {
        funLiteracyText = rew.fun_literacy;
      }
    }

    const cellVal = (cat) => {
      const v = rew[cat];
      if (!v) return "-";
      if (typeof v === 'string') return v;
      return v.student || v.studentName || "-";
    };

    const row = [
      cls,
      cellVal('independence'),
      cellVal('respect'),
      cellVal('responsibility'),
      cellVal('thinking_skill'),
      cellVal('self_management'),
      funLiteracyText
    ];
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assembly Awards");

  const safeTheme = theme.replace(/\s+/g, '_');
  const safeYear = year.replace(/[\/\\]/g, '-');
  XLSX.writeFile(wb, `Assembly_Rewards_${safeTheme}_${safeYear}.xlsx`);
}

// Attach Reward Tab Event Listeners
document.getElementById('rewardYearSelect')?.addEventListener('change', () => {
  populateRewardSelects();
  updateStudentsDatalist();
  renderRewardView();
});
document.getElementById('rewardThemeSelect')?.addEventListener('change', renderRewardView);
document.getElementById('rewardClassSelect')?.addEventListener('change', () => {
  updateStudentsDatalist();
  renderRewardView();
});
document.getElementById('btnSaveRewards')?.addEventListener('click', saveAssemblyRewards);
document.getElementById('btnClearRewards')?.addEventListener('click', clearAssemblyRewardForm);
document.getElementById('btnPrintRewardSheet')?.addEventListener('click', printAssemblyRewardSheet);
document.getElementById('btnExportRewardExcel')?.addEventListener('click', exportAssemblyRewardsToExcel);

// ======================================================
// MEETING & COORDINATION MODULE
// ======================================================
let meetingCoordinationData = {};
let editingReportId = null;
let currentReportImageData = { file: null, dataUrl: '', finalUrl: '', fileName: '' };
let selectedAttendeesSet = new Set();

// Real-time Firestore sync for Meeting & Coordination
onSnapshot(doc(db, "schedules", "meetingCoordination"), (docSnap) => {
  if (docSnap.exists()) {
    meetingCoordinationData = docSnap.data() || {};
  } else {
    meetingCoordinationData = {};
  }
  const meetingTab = document.getElementById('meetingView');
  if (meetingTab && meetingTab.classList.contains('active')) {
    renderMeetingView();
  }
}, (err) => {
  console.warn("Could not listen to meetingCoordination:", err);
});

function getMeetingStoragePrefix(year, theme, week) {
  const cleanYear = (year || '2026/2027').replace(/[\/\\]/g, '-');
  const cleanTheme = (theme || 'Theme 1').replace(/\s+/g, '_');
  const cleanWeek = (week || 'Week 1').replace(/\s+/g, '_');
  return `${cleanYear}_${cleanTheme}_${cleanWeek}`;
}

function initMeetingView() {
  populateCalendarSelects();
  populateMeetingReportSelects();
  initAttendeesDropdown();
  initReportImageUpload();
  renderMeetingView();
}

function populateMeetingReportSelects() {
  const teacherSel = document.getElementById('reportTeacherSelect');
  const teachers = appEntities.teachers || [];

  if (teacherSel) {
    const currentVal = teacherSel.value;
    teacherSel.innerHTML = teachers.map(t => `<option value="${t}">${t}</option>`).join('');

    if (isTeacherUser()) {
      const loggedTeacher = getLoggedInTeacherName();
      if (loggedTeacher && teachers.includes(loggedTeacher)) {
        teacherSel.value = loggedTeacher;
      }
    } else if (currentVal && teachers.includes(currentVal)) {
      teacherSel.value = currentVal;
    }
  }
}

// ------------------------------------------------------
// ATTENDEES MULTI-SELECT DROPDOWN CHECKLIST
// ------------------------------------------------------
function initAttendeesDropdown() {
  const trigger = document.getElementById('attendeesDropdownTrigger');
  const menu = document.getElementById('attendeesDropdownMenu');
  const searchInput = document.getElementById('searchAttendeesInput');

  if (trigger && menu) {
    trigger.onclick = (e) => {
      e.stopPropagation();
      const isHidden = menu.style.display === 'none';
      menu.style.display = isHidden ? 'flex' : 'none';
      if (isHidden && searchInput) {
        searchInput.value = '';
        renderAttendeesChecklistItems('');
        searchInput.focus();
      }
    };
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (menu && !menu.contains(e.target) && !trigger?.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  searchInput?.addEventListener('input', (e) => {
    renderAttendeesChecklistItems(e.target.value.trim().toLowerCase());
  });

  document.getElementById('btnSelectAllAttendees')?.addEventListener('click', () => {
    (appEntities.teachers || []).forEach(t => selectedAttendeesSet.add(t));
    updateAttendeesUI();
  });

  document.getElementById('btnClearAllAttendees')?.addEventListener('click', () => {
    selectedAttendeesSet.clear();
    updateAttendeesUI();
  });
}

function renderAttendeesChecklistItems(filterText = '') {
  const container = document.getElementById('attendeesChecklistContainer');
  if (!container) return;

  const teachers = appEntities.teachers || [];
  const filtered = filterText ? teachers.filter(t => t.toLowerCase().includes(filterText)) : teachers;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 12px;">No matching teachers found</div>`;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isChecked = selectedAttendeesSet.has(t);
    return `
      <label class="attendee-check-item">
        <input type="checkbox" value="${escapeHtml(t)}" ${isChecked ? 'checked' : ''} onchange="toggleAttendeeCheckbox('${escapeHtml(t)}', this.checked)">
        <span>${escapeHtml(t)}</span>
      </label>
    `;
  }).join('');
}

window.toggleAttendeeCheckbox = function (teacherName, isChecked) {
  if (isChecked) {
    selectedAttendeesSet.add(teacherName);
  } else {
    selectedAttendeesSet.delete(teacherName);
  }
  updateAttendeesUI();
};

window.removeAttendeePill = function (teacherName) {
  selectedAttendeesSet.delete(teacherName);
  updateAttendeesUI();
};

function updateAttendeesUI() {
  const pillsContainer = document.getElementById('attendeesSelectedPills');
  const countEl = document.getElementById('attendeesSelectedCount');
  const teachers = Array.from(selectedAttendeesSet);

  if (countEl) {
    countEl.textContent = teachers.length;
  }

  if (pillsContainer) {
    if (teachers.length === 0) {
      pillsContainer.innerHTML = `<span class="attendees-placeholder">Click to select attending teachers...</span>`;
    } else {
      pillsContainer.innerHTML = teachers.map(t => `
        <span class="attendee-pill">
          ${escapeHtml(t)}
          <span class="attendee-pill-remove" onclick="event.stopPropagation(); removeAttendeePill('${escapeHtml(t)}')" title="Remove">✕</span>
        </span>
      `).join('');
    }
  }

  // Sync checkboxes if menu is open
  const checkboxes = document.querySelectorAll('#attendeesChecklistContainer input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = selectedAttendeesSet.has(cb.value);
  });
}

// ------------------------------------------------------
// GOOGLE DRIVE IMAGE UPLOAD HANDLER
// ------------------------------------------------------
function initReportImageUpload() {
  const fileInput = document.getElementById('reportImageFileInput');
  const dropZone = document.getElementById('reportImageDropZone');
  const removeBtn = document.getElementById('btnRemoveReportImage');

  loadDriveFolderSettings();

  // Google Drive Settings Save Event Listener
  document.getElementById('btnSaveDriveFolderSettings')?.addEventListener('click', () => {
    const scriptUrl = document.getElementById('inputMeetingDriveScriptUrl')?.value.trim() || '';
    const folderId = document.getElementById('inputMeetingDriveFolderId')?.value.trim() || '';

    if (scriptUrl) {
      localStorage.setItem('meetingDriveScriptUrl', scriptUrl);
    } else {
      localStorage.removeItem('meetingDriveScriptUrl');
    }

    if (folderId) {
      localStorage.setItem('meetingDriveFolderId', folderId);
    } else {
      localStorage.removeItem('meetingDriveFolderId');
    }

    alert("Google Drive Folder Settings saved successfully!");
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) handleReportImageFile(file);
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#2563eb';
      dropZone.style.background = '#eff6ff';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        handleReportImageFile(file);
      }
    });
  }

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearReportImage();
  });
}

async function handleReportImageFile(file) {
  const promptContent = document.getElementById('reportImagePromptContent');
  const previewContainer = document.getElementById('reportImagePreviewContainer');
  const previewImg = document.getElementById('reportImagePreviewImg');
  const fileNameEl = document.getElementById('reportImageFileName');
  const badgeEl = document.getElementById('reportImageUploadBadge');

  if (fileNameEl) fileNameEl.textContent = file.name;
  if (badgeEl) {
    badgeEl.textContent = '⏳ Uploading to Google Drive...';
    badgeEl.style.color = '#d97706';
    badgeEl.style.background = '#fef3c7';
    badgeEl.style.borderColor = '#fde68a';
  }

  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    if (previewImg) previewImg.src = dataUrl;
    if (promptContent) promptContent.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'flex';

    currentReportImageData = {
      file: file,
      dataUrl: dataUrl,
      finalUrl: dataUrl,
      fileName: file.name
    };

    // Attempt Google Drive Web App upload if dedicated or general scriptUrl is available
    const scriptUrl = localStorage.getItem('meetingDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
    const folderId = localStorage.getItem('meetingDriveFolderId') || '';

    if (scriptUrl) {
      try {
        const base64Data = dataUrl.split(',')[1];
        const response = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'image/jpeg',
            base64Data: base64Data,
            targetFolder: "Teacher Weekly Reports",
            folderName: "Teacher Weekly Reports",
            folderId: folderId,
            type: "weekly_coordination"
          })
        });

        const resText = await response.text();
        let resJson;
        try {
          resJson = JSON.parse(resText);
        } catch (parseErr) {
          if (resText.includes("Anda memerlukan akses") || resText.includes("need permission") || resText.includes("accounts.google.com")) {
            throw new Error("Permission Denied: Web App must be deployed with 'Who has access: Anyone' (Siapa saja).");
          } else {
            throw new Error("Invalid response from Apps Script: " + resText.substring(0, 100));
          }
        }

        if (resJson && resJson.status === 'success' && resJson.photoUrl) {
          currentReportImageData.finalUrl = resJson.photoUrl;
          if (badgeEl) {
            badgeEl.textContent = '✅ Uploaded to Google Drive';
            badgeEl.style.color = '#15803d';
            badgeEl.style.background = '#f0fdf4';
            badgeEl.style.borderColor = '#bbf7d0';
          }
          return;
        } else {
          throw new Error(resJson?.message || "Google Drive upload failed.");
        }
      } catch (err) {
        console.warn("Google Drive upload bridge error:", err);
        if (badgeEl) {
          badgeEl.textContent = '⚠️ ' + err.message;
          badgeEl.style.color = '#b91c1c';
          badgeEl.style.background = '#fef2f2';
          badgeEl.style.borderColor = '#fca5a5';
        }
        alert("Google Drive Upload Issue:\n\n" + err.message + "\n\nPlease ensure your Apps Script is deployed with:\n1. Execute as: Me\n2. Who has access: Anyone (Siapa saja)");
      }
    } else {
      if (badgeEl) {
        badgeEl.textContent = 'Attached (Local Preview - Set Drive URL to upload)';
        badgeEl.style.color = '#2563eb';
        badgeEl.style.background = '#eff6ff';
        badgeEl.style.borderColor = '#bfdbfe';
      }
    }
  };
  reader.readAsDataURL(file);
}

function clearReportImage() {
  currentReportImageData = { file: null, dataUrl: '', finalUrl: '', fileName: '' };
  const promptContent = document.getElementById('reportImagePromptContent');
  const previewContainer = document.getElementById('reportImagePreviewContainer');
  const fileInput = document.getElementById('reportImageFileInput');
  const previewImg = document.getElementById('reportImagePreviewImg');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (promptContent) promptContent.style.display = 'flex';
  if (previewContainer) previewContainer.style.display = 'none';
}

function renderMeetingView() {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);

  // 1. Render Meeting Minutes & Notes
  const meetingRecord = meetingCoordinationData[`${prefix}_meeting`] || {};
  const dateInput = document.getElementById('meetingDateInput');
  const agendaInput = document.getElementById('meetingAgendaInput');
  const summaryInput = document.getElementById('meetingSummaryInput');

  if (dateInput) {
    dateInput.value = meetingRecord.date || new Date().toISOString().split('T')[0];
  }
  if (agendaInput) {
    agendaInput.value = meetingRecord.agenda || '';
  }
  if (summaryInput) {
    summaryInput.value = meetingRecord.summary || '';
    autoResizeTextarea(summaryInput);
  }

  // Parse attendees
  selectedAttendeesSet.clear();
  if (Array.isArray(meetingRecord.attendeesList)) {
    meetingRecord.attendeesList.forEach(t => selectedAttendeesSet.add(t));
  } else if (meetingRecord.attendees && typeof meetingRecord.attendees === 'string') {
    meetingRecord.attendees.split(',').map(s => s.trim()).filter(Boolean).forEach(t => selectedAttendeesSet.add(t));
  }
  updateAttendeesUI();
  renderAttendeesChecklistItems('');

  // Update Meeting Save Status
  const statusPill = document.getElementById('meetingSaveStatus');
  const statusText = document.getElementById('meetingSaveStatusText');
  if (meetingRecord.updatedAt && statusText) {
    const d = new Date(meetingRecord.updatedAt);
    const timeStr = isNaN(d.getTime()) ? '' : `Saved (${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    statusText.textContent = timeStr || 'Saved';
    statusPill?.classList.add('saved');
  } else if (statusText) {
    statusText.textContent = 'Ready';
    statusPill?.classList.remove('saved');
  }

  // 2. Render Teacher Reports List
  const reportsList = meetingCoordinationData[`${prefix}_reports`] || [];
  renderTeacherReportsCompilation(reportsList, year, theme, week);

  // 3. Render Printable Sheet
  renderPrintableMeetingSheet(year, theme, week, meetingRecord, reportsList);
}

function renderTeacherReportsCompilation(reportsList, year, theme, week) {
  const container = document.getElementById('teacherReportsListContainer');
  const countBadge = document.getElementById('teacherReportsCountBadge');
  const titleEl = document.getElementById('teacherReportsTitle');

  if (titleEl) {
    titleEl.textContent = `Teacher Weekly Reports — ${week} (${theme})`;
  }
  if (countBadge) {
    countBadge.textContent = `${reportsList.length} Report${reportsList.length === 1 ? '' : 's'} Submitted`;
  }

  if (!container) return;

  if (!reportsList || reportsList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 20px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div style="font-weight: 700; font-size: 14px; color: #334155; margin-bottom: 4px;">No Teacher Reports Logged Yet for ${week}</div>
        <p style="margin: 0; font-size: 12.5px;">Teachers can fill and submit their weekly teaching progress and student observations in the form above.</p>
      </div>
    `;
    return;
  }

  const loggedTeacherName = isTeacherUser() ? getLoggedInTeacherName() : null;
  const isSuperAdmin = isAdminUser();

  let html = '';
  reportsList.forEach((rep, index) => {
    const canEdit = isSuperAdmin || (loggedTeacherName && loggedTeacherName.toLowerCase() === (rep.teacher || '').toLowerCase());
    const formattedDate = rep.updatedAt ? new Date(rep.updatedAt).toLocaleDateString() : '';
    const imgUrl = rep.imageUrl || rep.finalUrl || rep.photoUrl || '';

    html += `
      <div class="teacher-report-item" data-id="${escapeHtml(rep.id || String(index))}">
        <div class="report-item-header">
          <div class="report-item-pills">
            <span class="report-pill-teacher">👨‍🏫 ${escapeHtml(rep.teacher || 'Teacher')}</span>
            ${rep.subject ? `<span class="report-pill-subject">📚 ${escapeHtml(rep.subject)}</span>` : ''}
            ${rep.className ? `<span class="report-pill-class">🏫 ${escapeHtml(rep.className)}</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${formattedDate ? `<span class="report-item-time">${formattedDate}</span>` : ''}
            ${canEdit ? `
              <button type="button" class="btn-cell-action" onclick="editTeacherReportByIndex(${index})" title="Edit this report" style="padding: 3px 8px; font-size: 11px; background:#eff6ff; color:#2563eb; border-color:#bfdbfe;">✏️ Edit</button>
              <button type="button" class="btn-cell-action" onclick="deleteTeacherReportByIndex(${index})" title="Delete report" style="padding: 3px 8px; font-size: 11px; background:#fef2f2; color:#ef4444; border-color:#fca5a5;">🗑️</button>
            ` : ''}
          </div>
        </div>

        <div class="report-body-wrapper ${imgUrl ? 'has-image' : ''}">
          <div class="report-text-columns">
            <div class="report-content-block">
              <div class="report-block-title progress-title">1. Weekly Progress & Material</div>
              <div class="report-block-text">${escapeHtml(rep.progress || '-')}</div>
            </div>
            <div class="report-content-block">
              <div class="report-block-title challenges-title">2. Observations & Challenges</div>
              <div class="report-block-text">${escapeHtml(rep.challenges || '-')}</div>
            </div>
          </div>
          ${imgUrl ? `
            <div class="report-image-side-block">
              <div class="report-image-side-label">📸 Photo</div>
              <a href="${escapeHtml(imgUrl)}" target="_blank" class="report-image-side-thumb" title="Click to view full image">
                <img src="${escapeHtml(imgUrl)}" alt="Report Photo">
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderPrintableMeetingSheet(year, theme, week, meetingRecord, reportsList) {
  const subtitle = document.getElementById('printMeetingSubtitle');
  if (subtitle) {
    subtitle.textContent = `WEEKLY TEACHER MEETING & COORDINATION REPORT — ${week.toUpperCase()} — ${theme.toUpperCase()} ${year}`;
  }

  // Meeting Details Print
  const printDate = document.getElementById('printMeetingDate');
  const printAgenda = document.getElementById('printMeetingAgenda');
  const printAttendees = document.getElementById('printMeetingAttendees');
  const printSummary = document.getElementById('printMeetingSummary');

  const attendeesText = Array.isArray(meetingRecord.attendeesList)
    ? meetingRecord.attendeesList.join(', ')
    : (meetingRecord.attendees || '-');

  if (printDate) printDate.textContent = meetingRecord.date || '-';
  if (printAgenda) printAgenda.textContent = meetingRecord.agenda || '-';
  if (printAttendees) printAttendees.textContent = attendeesText || '-';
  if (printSummary) printSummary.textContent = meetingRecord.summary || '-';

  // Teacher Reports Print Table
  const tbody = document.getElementById('printTeacherReportsBody');
  if (!tbody) return;

  if (!reportsList || reportsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 14px; color: #94a3b8; font-style: italic;">No teacher weekly reports logged for this week.</td></tr>`;
    return;
  }

  let rowsHtml = '';
  reportsList.forEach((rep, index) => {
    const imgUrl = rep.imageUrl || rep.finalUrl || rep.photoUrl || '';
    const subjectInfo = rep.subject ? `<div style="font-size: 8.5pt; color: #2563eb; font-weight: 600;">${escapeHtml(rep.subject)}</div>` : '';
    rowsHtml += `
      <tr>
        <td style="text-align: center; font-weight: bold;">${index + 1}</td>
        <td>
          <strong>${escapeHtml(rep.teacher || '-')}</strong>
          ${subjectInfo}
        </td>
        <td style="font-weight: 600;">${escapeHtml(rep.className || '-')}</td>
        <td style="white-space: pre-wrap;">${escapeHtml(rep.progress || '-')}</td>
        <td style="white-space: pre-wrap;">
          <div>${escapeHtml(rep.challenges || '-')}</div>
          ${imgUrl ? `<div style="margin-top: 4px;"><img src="${escapeHtml(imgUrl)}" style="max-width: 90px; max-height: 60px; border-radius: 4px; border: 1px solid #cbd5e1;"></div>` : ''}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

// Save Weekly Meeting Minutes & Notes
async function saveMeetingNotes() {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const dateVal = document.getElementById('meetingDateInput')?.value || '';
  const agendaVal = document.getElementById('meetingAgendaInput')?.value.trim() || '';
  const summaryVal = document.getElementById('meetingSummaryInput')?.value.trim() || '';
  const attendeesList = Array.from(selectedAttendeesSet);

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const updatedBy = auth.currentUser ? (auth.currentUser.email || 'Staff') : 'Staff';

  const meetingObj = {
    date: dateVal,
    agenda: agendaVal,
    attendees: attendeesList.join(', '),
    attendeesList: attendeesList,
    summary: summaryVal,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy
  };

  meetingCoordinationData[`${prefix}_meeting`] = meetingObj;

  const btnSave = document.getElementById('btnSaveMeetingNotes');
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span>Saving Meeting...</span>`;
    }

    await setDoc(doc(db, "schedules", "meetingCoordination"), meetingCoordinationData, { merge: true });

    renderMeetingView();
    alert(`Weekly Meeting Minutes successfully saved for ${week} (${theme})!`);
  } catch (err) {
    console.error("Error saving meeting notes:", err);
    alert("Failed to save meeting notes: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        <span>Save Meeting Summary</span>
      `;
    }
  }
}

// Submit or Update Teacher Weekly Teaching Report
async function submitTeacherReport() {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const teacher = document.getElementById('reportTeacherSelect')?.value || '';
  const progress = document.getElementById('reportProgressInput')?.value.trim() || '';
  const challenges = document.getElementById('reportChallengesInput')?.value.trim() || '';
  const imageUrl = currentReportImageData.finalUrl || currentReportImageData.dataUrl || '';

  if (!progress && !challenges && !imageUrl) {
    alert("Please enter at least some details in the Weekly Progress, Observations, or attach a photo before submitting.");
    return;
  }

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const reportsKey = `${prefix}_reports`;
  const existingReports = Array.isArray(meetingCoordinationData[reportsKey]) ? [...meetingCoordinationData[reportsKey]] : [];

  const updatedBy = auth.currentUser ? (auth.currentUser.email || 'Staff') : 'Staff';
  const now = new Date().toISOString();

  if (editingReportId) {
    // Updating existing report
    const targetIdx = existingReports.findIndex(r => r.id === editingReportId);
    if (targetIdx !== -1) {
      existingReports[targetIdx] = {
        ...existingReports[targetIdx],
        teacher,
        progress,
        challenges,
        imageUrl: imageUrl || existingReports[targetIdx].imageUrl || '',
        updatedAt: now,
        updatedBy: updatedBy
      };
    }
    editingReportId = null;
  } else {
    // Check if teacher already has a report in this week
    const duplicateIdx = existingReports.findIndex(r => r.teacher === teacher);
    if (duplicateIdx !== -1) {
      if (confirm(`A report for ${teacher} already exists for ${week}. Do you want to overwrite it?`)) {
        existingReports[duplicateIdx] = {
          ...existingReports[duplicateIdx],
          id: existingReports[duplicateIdx].id || String(Date.now()),
          teacher,
          progress,
          challenges,
          imageUrl: imageUrl || existingReports[duplicateIdx].imageUrl || '',
          updatedAt: now,
          updatedBy: updatedBy
        };
      } else {
        return;
      }
    } else {
      existingReports.push({
        id: String(Date.now()),
        teacher,
        progress,
        challenges,
        imageUrl: imageUrl,
        updatedAt: now,
        updatedBy: updatedBy
      });
    }
  }

  meetingCoordinationData[reportsKey] = existingReports;

  const submitBtn = document.getElementById('btnSubmitTeacherReport');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Saving Report...</span>`;
    }

    await setDoc(doc(db, "schedules", "meetingCoordination"), meetingCoordinationData, { merge: true });

    // Reset report input fields
    const progEl = document.getElementById('reportProgressInput');
    const chalEl = document.getElementById('reportChallengesInput');
    if (progEl) { progEl.value = ''; autoResizeTextarea(progEl); }
    if (chalEl) { chalEl.value = ''; autoResizeTextarea(chalEl); }
    clearReportImage();

    renderMeetingView();
    alert(`Weekly Teaching Report successfully saved for ${teacher}!`);
  } catch (err) {
    console.error("Error submitting teacher report:", err);
    alert("Failed to submit report: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        <span>Submit / Update Report</span>
      `;
    }
  }
}

window.editTeacherReportByIndex = function (index) {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const reports = meetingCoordinationData[`${prefix}_reports`] || [];
  const rep = reports[index];

  if (!rep) return;

  editingReportId = rep.id || String(index);

  const teacherSel = document.getElementById('reportTeacherSelect');
  if (teacherSel && rep.teacher) teacherSel.value = rep.teacher;

  const progEl = document.getElementById('reportProgressInput');
  const chalEl = document.getElementById('reportChallengesInput');
  if (progEl) { progEl.value = rep.progress || ''; autoResizeTextarea(progEl); }
  if (chalEl) { chalEl.value = rep.challenges || ''; autoResizeTextarea(chalEl); }

  if (rep.imageUrl || rep.finalUrl) {
    const url = rep.imageUrl || rep.finalUrl;
    currentReportImageData = { file: null, dataUrl: url, finalUrl: url, fileName: 'Attached Photo' };
    const promptContent = document.getElementById('reportImagePromptContent');
    const previewContainer = document.getElementById('reportImagePreviewContainer');
    const previewImg = document.getElementById('reportImagePreviewImg');
    const fileNameEl = document.getElementById('reportImageFileName');
    const badgeEl = document.getElementById('reportImageUploadBadge');

    if (previewImg) previewImg.src = url;
    if (fileNameEl) fileNameEl.textContent = 'Attached Documentation';
    if (badgeEl) {
      badgeEl.textContent = 'Existing Photo';
      badgeEl.style.color = '#2563eb';
      badgeEl.style.background = '#eff6ff';
      badgeEl.style.borderColor = '#bfdbfe';
    }
    if (promptContent) promptContent.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'flex';
  } else {
    clearReportImage();
  }

  progEl?.focus();
  document.querySelector('.meeting-layout-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteTeacherReportByIndex = async function (index) {
  if (!confirm("Are you sure you want to delete this teaching report?")) return;

  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const reports = meetingCoordinationData[`${prefix}_reports`] || [];

  reports.splice(index, 1);
  meetingCoordinationData[`${prefix}_reports`] = reports;

  try {
    await setDoc(doc(db, "schedules", "meetingCoordination"), meetingCoordinationData, { merge: true });
    renderMeetingView();
  } catch (err) {
    console.error("Error deleting report:", err);
    alert("Failed to delete report: " + err.message);
  }
};

document.getElementById('btnResetReportForm')?.addEventListener('click', () => {
  editingReportId = null;
  const progEl = document.getElementById('reportProgressInput');
  const chalEl = document.getElementById('reportChallengesInput');
  if (progEl) { progEl.value = ''; autoResizeTextarea(progEl); }
  if (chalEl) { chalEl.value = ''; autoResizeTextarea(chalEl); }
  clearReportImage();
});

function printMeetingReportsSheet() {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const meetingRecord = meetingCoordinationData[`${prefix}_meeting`] || {};
  const reportsList = meetingCoordinationData[`${prefix}_reports`] || [];

  renderPrintableMeetingSheet(year, theme, week, meetingRecord, reportsList);
  window.print();
}

function exportMeetingReportsToExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Export library is loading. Please try again in a moment.");
    return;
  }

  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const meetingRecord = meetingCoordinationData[`${prefix}_meeting`] || {};
  const reportsList = meetingCoordinationData[`${prefix}_reports`] || [];

  const attendeesText = Array.isArray(meetingRecord.attendeesList)
    ? meetingRecord.attendeesList.join(', ')
    : (meetingRecord.attendees || "-");

  const rows = [
    ["WEEKLY TEACHER MEETING & COORDINATION REPORT"],
    [`School Year: ${year}`, `Theme: ${theme}`, `Week: ${week}`],
    [],
    ["I. WEEKLY TEACHER MEETING MINUTES"],
    ["Meeting Date", meetingRecord.date || "-"],
    ["Topic / Agenda", meetingRecord.agenda || "-"],
    ["Attendees", attendeesText],
    ["Summary & Action Items", meetingRecord.summary || "-"],
    [],
    ["II. TEACHER WEEKLY TEACHING REPORTS"],
    ["No", "Teacher", "Subject", "Class", "Learning Progress & Material", "Observations & Challenges", "Photo Documentation", "Updated At"]
  ];

  if (reportsList.length === 0) {
    rows.push(["-", "No teacher reports submitted", "-", "-", "-", "-", "-", "-"]);
  } else {
    reportsList.forEach((rep, idx) => {
      rows.push([
        idx + 1,
        rep.teacher || "-",
        rep.subject || "-",
        rep.className || "-",
        rep.progress || "-",
        rep.challenges || "-",
        rep.imageUrl || "-",
        rep.updatedAt || "-"
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Meeting & Reports");

  const safeTheme = theme.replace(/\s+/g, '_');
  const safeWeek = week.replace(/\s+/g, '_');
  const safeYear = year.replace(/[\/\\]/g, '-');
  XLSX.writeFile(wb, `Meeting_Report_${safeWeek}_${safeTheme}_${safeYear}.xlsx`);
}

// Meeting Tab Event Listeners
document.getElementById('meetingYearSelect')?.addEventListener('change', () => {
  populateCalendarSelects();
  renderMeetingView();
});
document.getElementById('meetingThemeSelect')?.addEventListener('change', () => {
  populateCalendarSelects();
  renderMeetingView();
});
document.getElementById('meetingWeekSelect')?.addEventListener('change', () => {
  populateCalendarSelects();
  renderMeetingView();
});
document.getElementById('btnSaveMeetingNotes')?.addEventListener('click', saveMeetingNotes);
document.getElementById('btnSubmitTeacherReport')?.addEventListener('click', submitTeacherReport);
document.getElementById('btnPrintMeetingReport')?.addEventListener('click', printMeetingReportsSheet);
document.getElementById('btnExportMeetingExcel')?.addEventListener('click', exportMeetingReportsToExcel);