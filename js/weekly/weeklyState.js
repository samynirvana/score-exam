import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getCurrentLanguage, t } from "../../weeklyI18n.js";
import { escapeHtml } from "../../utils.js";

// Firebase Configurations
export const firebaseConfig = {
  apiKey: "AIzaSyBIUtrjlgHEI7TtOY-nRiXzQ0DIcdkT-W0",
  authDomain: "weekly-teacher.firebaseapp.com",
  projectId: "weekly-teacher",
  storageBucket: "weekly-teacher.firebasestorage.app",
  messagingSenderId: "329063573272",
  appId: "1:329063573272:web:56a43fb16a85ca4c22a06d",
  measurementId: "G-VFRECGLJFK"
};

// Initialize Dedicated Firebase App & Services for Weekly Schedule
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Secondary Firebase Instance for creating new users without switching current admin session
export const secondaryApp = initializeApp(firebaseConfig, "SecondaryRegistrationApp");
export const secondaryAuth = getAuth(secondaryApp);

// Secondary Firebase App pointing to syamserverlist database for student directory & autocomplete
export const syamFirebaseConfig = {
  apiKey: "AIzaSyB3TY9M4oUG7xxCgxR6bSJB0K9ivcP5RQI",
  authDomain: "syamserverlist.firebaseapp.com",
  projectId: "syamserverlist",
  storageBucket: "syamserverlist.firebasestorage.app",
  messagingSenderId: "468852816088",
  appId: "1:468852816088:web:b72bcb0c4fee837d983fad",
  measurementId: "G-2YHY6V3JH1"
};
export const syamApp = initializeApp(syamFirebaseConfig, "SyamPortalSecondaryApp");
export const syamDb = getFirestore(syamApp, "mrsyamdb");

// 13 Slot Daily Master Schedule Structure
export const timeSlots = [
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
export const fridayMiddleSchoolSlots = {
  1: { start: "07.40", end: "08.20" },
  2: { start: "08.20", end: "09.00" },
  3: { start: "09.00", end: "09.40" },
  4: { start: "09.40", end: "09.55", isBreak: true },
  5: { start: "09.55", end: "10.35" },
  6: { start: "10.35", end: "11.05" },
  7: { start: "11.05", end: "11.40" }
};

export function isMiddleSchoolClass(className) {
  if (!className) return false;
  const match = className.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return num >= 7 && num <= 9;
  }
  return false;
}

export function isHighSchoolClass(className) {
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

export function getFridayMiddleSchoolTime(slotId, rowspan = 1) {
  const startSlot = fridayMiddleSchoolSlots[slotId];
  if (!startSlot) return null;
  const endSlotId = slotId + (rowspan - 1);
  const endSlot = fridayMiddleSchoolSlots[endSlotId] || startSlot;
  return `${startSlot.start} - ${endSlot.end}`;
}

export function getDefaultUniforms(selectedClass) {
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

export function sortWeeks(weekKeys) {
  return [...weekKeys].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });
}

export function formatModernDateRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  const dStart = new Date(startDateStr);
  const dEnd = new Date(endDateStr);

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m1 = months[dStart.getMonth()];
  const m2 = months[dEnd.getMonth()];
  const day1 = dStart.getDate();
  const day2 = dEnd.getDate();
  const y1 = dStart.getFullYear();
  const y2 = dEnd.getFullYear();

  if (y1 === y2) {
    if (m1 === m2) {
      return `${m1} ${day1} - ${day2}, ${y1}`;
    }
    return `${m1} ${day1} - ${m2} ${day2}, ${y1}`;
  }
  return `${m1} ${day1}, ${y1} - ${m2} ${day2}, ${y2}`;
}

export function formatPrintDateRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  try {
    const sStr = String(startDateStr).includes('T') ? String(startDateStr) : String(startDateStr) + 'T00:00:00';
    const eStr = String(endDateStr).includes('T') ? String(endDateStr) : String(endDateStr) + 'T00:00:00';
    const dStart = new Date(sStr);
    const dEnd = new Date(eStr);
    if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) return '';

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const m1 = months[dStart.getMonth()];
    const m2 = months[dEnd.getMonth()];
    const day1 = dStart.getDate();
    const day2 = dEnd.getDate();
    const y1 = dStart.getFullYear();
    const y2 = dEnd.getFullYear();

    if (y1 === y2) {
      if (m1 === m2) {
        return `${day1} - ${day2} ${m1} ${y1}`;
      }
      return `${day1} ${m1} - ${day2} ${m2} ${y1}`;
    }
    return `${day1} ${m1} ${y1} - ${day2} ${m2} ${y2}`;
  } catch (e) {
    return '';
  }
}


export function getActiveCalendarPrefix(viewType = 'class') {
  const year = document.getElementById(`${viewType}YearSelect`)?.value || '2026-2027';
  const theme = document.getElementById(`${viewType}ThemeSelect`)?.value || 'Theme 1';
  const week = document.getElementById(`${viewType}WeekSelect`)?.value || 'Week 1';
  return `${year}_${theme}_${week}`;
}

// Application State
export let appEntities = { teachers: [], classes: [], subjects: ['Pramuka'], homeTeachers: {}, teacherEmails: {} };
export function setAppEntities(val) {
  if (val && Array.isArray(val.subjects)) {
    if (!val.subjects.includes('Pramuka')) {
      val.subjects.push('Pramuka');
    }
  }
  appEntities = val;
}

export let classNotesData = {};
export function setClassNotesData(val) { classNotesData = val; }

export let masterSchedules = {};
export function setMasterSchedules(val) { masterSchedules = val; }

export let weeklyOverrides = {};
export function setWeeklyOverrides(val) { weeklyOverrides = val; }

export let materialsData = {};
export function setMaterialsData(val) { materialsData = val; }

export let academicCalendar = {};
export function setAcademicCalendar(val) { academicCalendar = val; }

export let isClassEditMode = false;
export function setIsClassEditMode(val) { isClassEditMode = val; }

export let draftWeeklySchedule = null;
export function setDraftWeeklySchedule(val) { draftWeeklySchedule = val; }

export let draftWeeklyMaterials = {};
export function setDraftWeeklyMaterials(val) { draftWeeklyMaterials = val; }

export let draftWeeklyUniforms = {};
export function setDraftWeeklyUniforms(val) { draftWeeklyUniforms = val; }

export let currentUserRole = null;
export function setCurrentUserRole(val) { currentUserRole = val; }

export async function fetchCurrentUserRole(user) {
  if (!user) {
    currentUserRole = null;
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      currentUserRole = data.role || (data.isLeader ? 'teacher_leader' : null);
    } else {
      currentUserRole = null;
    }
  } catch (err) {
    console.warn("Could not fetch user role from Firestore:", err);
    currentUserRole = null;
  }
}

export function isAdminUser() {
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  if (currentUserRole === 'admin' || currentUserRole === 'teacher_leader') return true;

  const emailLower = user.email.toLowerCase();
  const isGenericAdmin = (
    emailLower === 'adm@gc.com' ||
    emailLower === 'admin@gc.com' ||
    emailLower.startsWith('admin@') ||
    emailLower.startsWith('adm@')
  );
  if (isGenericAdmin) return true;

  // Check if current logged-in teacher is designated as a Teacher's Leader in appEntities
  if (appEntities?.teacherLeaders && Array.isArray(appEntities.teacherLeaders) && appEntities.teacherLeaders.length > 0) {
    if (appEntities.teacherEmails) {
      for (const [tName, tEmail] of Object.entries(appEntities.teacherEmails)) {
        if (tEmail && tEmail.toLowerCase() === emailLower && appEntities.teacherLeaders.includes(tName)) {
          return true;
        }
      }
    }

    const teacherName = resolveTeacherNameFromEmail(user.email);
    if (teacherName && appEntities.teacherLeaders.includes(teacherName)) {
      return true;
    }
  }

  return false;
}

export function isTeacherUser() {
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  if (isAdminUser()) return false;
  if (currentUserRole === 'teacher') return true;

  return !!getLoggedInTeacherName();
}

export function resolveTeacherNameFromEmail(email) {
  if (!email) return null;
  const emailLower = email.toLowerCase();

  // 1. Direct match in appEntities.teacherEmails
  if (appEntities && appEntities.teacherEmails) {
    const directMatch = Object.keys(appEntities.teacherEmails).find(
      name => (appEntities.teacherEmails[name] || '').toLowerCase() === emailLower
    );
    if (directMatch) return directMatch;
  }

  const isGenericAdmin = (
    emailLower === 'adm@gc.com' ||
    emailLower === 'admin@gc.com' ||
    emailLower.startsWith('admin@') ||
    emailLower.startsWith('adm@')
  );

  // 2. Fuzzy match against all teachers in appEntities.teachers
  const username = emailLower.split('@')[0].replace(/[^a-z0-9]/g, '');
  if (appEntities && Array.isArray(appEntities.teachers) && appEntities.teachers.length > 0) {
    const exactTeacher = appEntities.teachers.find(name => {
      const clean = name.toLowerCase().replace(/^(mr|ms|mrs|miss|dr|ustadz|ustadzah)\.?\s*/i, '').replace(/[^a-z0-9]/g, '');
      return clean === username;
    });
    if (exactTeacher) return exactTeacher;

    const subTeacher = appEntities.teachers.find(name => {
      const clean = name.toLowerCase().replace(/^(mr|ms|mrs|miss|dr|ustadz|ustadzah)\.?\s*/i, '').replace(/[^a-z0-9]/g, '');
      return (username.length >= 3 && clean.includes(username)) || (clean.length >= 3 && username.includes(clean));
    });
    if (subTeacher) return subTeacher;
  }

  // 3. Fallback for non-generic admin user
  if (!isGenericAdmin && appEntities && Array.isArray(appEntities.teachers) && appEntities.teachers.length > 0) {
    const fallback = appEntities.teachers.find(name => {
      const clean = name.toLowerCase().replace(/^(mr|ms|mrs|miss|dr|ustadz|ustadzah)\.?\s*/i, '').replace(/[^a-z0-9]/g, '');
      return emailLower.includes(clean) || (username.length >= 3 && clean.includes(username));
    });
    if (fallback) return fallback;
  }

  return null;
}

export function getLoggedInTeacherName() {
  const user = auth.currentUser;
  if (!user || !user.email) return null;
  return resolveTeacherNameFromEmail(user.email);
}

export function canUserEditClass(className) {
  const user = auth.currentUser;
  if (!user) return false;
  if (isAdminUser()) return true;

  if (!isTeacherUser()) return false;

  const teacherName = getLoggedInTeacherName();
  if (!teacherName) return false;
  const assignedClass = appEntities.homeTeachers?.[teacherName];
  return !!(assignedClass && assignedClass === className);
}

export function isHomeTeacherUser() {
  const teacherName = getLoggedInTeacherName();
  if (!teacherName) return false;
  return !!(appEntities.homeTeachers && appEntities.homeTeachers[teacherName]);
}

export function isUserAdminOrTeacherLeader() {
  if (isAdminUser()) return true;
  const tName = getLoggedInTeacherName();
  if (tName && Array.isArray(appEntities.teacherLeaders) && appEntities.teacherLeaders.includes(tName)) return true;
  if (currentUserRole === 'teacher_leader' || currentUserRole === 'admin') return true;
  return false;
}

export function canAccessRewardView() {
  if (isUserAdminOrTeacherLeader()) return true;
  if (isHomeTeacherUser()) return true;
  return false;
}

// Helper to retrieve slot assignments normalized as an array, prioritizing weekly overrides
export function getSlotAssignments(className, day, slotId, viewCalPrefix = null) {
  const calPrefix = viewCalPrefix || getActiveCalendarPrefix('class');
  const overrideKey = `${calPrefix}_${className}`;

  let result = null;

  if (weeklyOverrides && weeklyOverrides[overrideKey]) {
    const overrideObj = weeklyOverrides[overrideKey];
    const scheduleMap = (overrideObj && typeof overrideObj.schedule === 'object' && Object.keys(overrideObj.schedule).length > 0)
      ? overrideObj.schedule
      : overrideObj;
    if (scheduleMap && scheduleMap[day]) {
      const overrideVal = scheduleMap[day][slotId];
      if (overrideVal !== undefined) {
        if (!overrideVal || overrideVal.length === 0) result = [];
        else if (Array.isArray(overrideVal)) result = overrideVal;
        else result = [overrideVal];
      }
    }
  }

  if (result === null) {
    const entry = masterSchedules[className]?.[day]?.[slotId];
    if (!entry) result = [];
    else if (Array.isArray(entry)) result = entry;
    else result = [entry];
  }

  // Universal normalization: "Library/Pramuka" is permanently modernized to "Pramuka"
  return result.map(item => {
    if (item && item.subject === 'Library/Pramuka') {
      return { ...item, subject: 'Pramuka' };
    }
    return item;
  });
}


export function updateUniformBadges(selectedClass, calPrefix = null) {
  const prefix = calPrefix || getActiveCalendarPrefix('class');
  const overrideKey = `${prefix}_${selectedClass}`;
  const defaultUniforms = getDefaultUniforms(selectedClass);
  const savedUniforms = weeklyOverrides?.[overrideKey]?.uniforms || {};

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const thHeaders = document.querySelectorAll('#printableArea thead th.col-day');
  const dayFilter = document.getElementById('classDaySelect')?.value || 'ALL';

  // In edit mode, first harvest any existing typed values from the DOM to avoid intermediate re-renders wiping them
  if (isClassEditMode) {
    thHeaders.forEach(th => {
      const inp = th.querySelector('.edit-uniform-input');
      if (inp && inp.dataset.day) {
        draftWeeklyUniforms[inp.dataset.day] = inp.value;
      }
    });
  }

  thHeaders.forEach((th, idx) => {
    const day = days[idx];
    if (!day) return;

    if (dayFilter !== 'ALL' && day !== dayFilter) {
      th.style.display = 'none';
      th.classList.remove('col-day-active');
    } else {
      th.style.display = '';
      if (dayFilter !== 'ALL') {
        th.classList.add('col-day-active');
      } else {
        th.classList.remove('col-day-active');
      }
    }

    const currentUniform = (isClassEditMode && draftWeeklyUniforms[day] !== undefined)
      ? draftWeeklyUniforms[day]
      : ((savedUniforms[day] !== undefined && savedUniforms[day] !== '') ? savedUniforms[day] : defaultUniforms[day]);

    const dayKey = `day_${day.toLowerCase()}`;
    const displayDay = (getCurrentLanguage() === 'id' ? t(dayKey) : day).toUpperCase();

    if (isClassEditMode) {
      th.innerHTML = `
        <span class="day-name">${displayDay}</span>
        <input type="text" class="edit-uniform-input" data-day="${day}" value="${escapeHtml(currentUniform)}" placeholder="Uniform for ${day}...">
      `;
    } else {
      th.innerHTML = `
        <span class="day-name">${displayDay}</span>
        <span class="uniform-badge">${escapeHtml(currentUniform)}</span>
      `;
    }
  });
}

// Synchronize helper (preserved for backwards-compatibility with callers; does not overwrite manual weekly edits)
export function syncClassWeeklyOverrides(className, academicYear = '2026-2027') {
  return false;
}

// Automatically sync all classes' weekly overrides for the active academic year
export async function syncAllClassesWeeklyOverrides(academicYear = '2026-2027') {
  return;
}

// Generate material key distinguishing teacher when multiple teachers instruct the same subject
export function getMaterialKey(calPrefix, className, day, subject, teacher = null) {
  const cleanTeacher = (teacher || '').trim();
  if (cleanTeacher) {
    return `${calPrefix}_${className}_${day}_${subject}_${cleanTeacher}`;
  }
  return `${calPrefix}_${className}_${day}_${subject}`;
}

// Retrieve material info prioritizing teacher-specific key with fallback to legacy generic key
export function getMaterialInfo(materials, calPrefix, className, day, subject, teacher = null) {
  if (!materials) return { material: '', link: '' };
  const cleanTeacher = (teacher || '').trim();
  if (cleanTeacher) {
    const teacherKey = `${calPrefix}_${className}_${day}_${subject}_${cleanTeacher}`;
    if (materials[teacherKey] !== undefined) {
      return materials[teacherKey];
    }
  }
  const genericKey = `${calPrefix}_${className}_${day}_${subject}`;
  return materials[genericKey] || { material: '', link: '' };
}


