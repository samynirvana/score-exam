import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyBIUtrjlgHEI7TtOY-nRiXzQ0DIcdkT-W0",
  authDomain: "weekly-teacher.firebaseapp.com",
  projectId: "weekly-teacher",
  storageBucket: "weekly-teacher.firebasestorage.app",
  messagingSenderId: "329063573272",
  appId: "1:329063573272:web:56a43fb16a85ca4c22a06d",
  measurementId: "G-VFRECGLJFK"
};


// Initialize Primary Firebase & Auth
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Secondary Firebase Instance for creating new users without switching current admin session
const secondaryApp = initializeApp(firebaseConfig, "SecondaryRegistrationApp");
const secondaryAuth = getAuth(secondaryApp);

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

const dailyUniforms = {
  MONDAY: "Seragam Putih Biru",
  TUESDAY: "Seragam Kotak-Kotak",
  WEDNESDAY: "Seragam Putih Biru",
  THURSDAY: "Seragam Kotak-Kotak",
  FRIDAY: "Seragam Pramuka/Batik Jumat"
};

// Application State
let appEntities = { teachers: [], classes: [], subjects: [], homeTeachers: {}, teacherEmails: {} };
let classNotesData = {};
let masterSchedules = {};
let materialsData = {};
let academicCalendar = {};

// Firebase Auth State Observer
onAuthStateChanged(auth, (user) => {
  const loginModal = document.getElementById('loginModal');
  const appMain = document.getElementById('appMain');
  const userDisplayEmail = document.getElementById('userDisplayEmail');

  if (user) {
    if (loginModal) loginModal.style.display = 'none';
    if (appMain) appMain.style.display = 'block';
    if (userDisplayEmail) userDisplayEmail.textContent = `Logged in as: ${user.email}`;

    if (appEntities.teacherEmails) {
      const teacherName = Object.keys(appEntities.teacherEmails).find(
        name => appEntities.teacherEmails[name] === user.email
      );
      if (teacherName) {
        const tSelect = document.getElementById('teacherSelectView');
        if (tSelect) {
          tSelect.value = teacherName;
          renderTeacherView();
        }
      }
    }
  } else {
    if (loginModal) loginModal.style.display = 'flex';
    if (appMain) appMain.style.display = 'none';
  }
});

// Firebase User Sign In Handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errDiv = document.getElementById('loginError');
  const submitBtn = document.getElementById('btnLoginSubmit');

  errDiv.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errDiv.textContent = err.message.replace("Firebase: ", "");
    errDiv.style.display = 'block';
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
document.getElementById('btnAdminView')?.addEventListener('click', (e) => switchTab('adminView', e.currentTarget));

function switchTab(tabId, targetBtn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  const btn = targetBtn?.closest ? targetBtn.closest('.tab-btn') : targetBtn;
  btn?.classList.add('active');
}

// Helper to retrieve slot assignments normalized as an array
function getSlotAssignments(className, day, slotId) {
  const entry = masterSchedules[className]?.[day]?.[slotId];
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  return [entry];
}

// Admin Sub-Tab Navigation
document.getElementById('btnSubAdd')?.addEventListener('click', (e) => switchAdminSubTab('subTabAdd', e.target));
document.getElementById('btnSubManage')?.addEventListener('click', (e) => switchAdminSubTab('subTabManage', e.target));
document.getElementById('btnSubCalendar')?.addEventListener('click', (e) => switchAdminSubTab('subTabCalendar', e.target));

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

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d1 = parseInt(p1[2], 10);
  const m1 = months[parseInt(p1[1], 10) - 1];
  const y1 = p1[0];

  const d2 = parseInt(p2[2], 10);
  const m2 = months[parseInt(p2[1], 10) - 1];
  const y2 = p2[0];

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
  const views = ['class', 'teacher'];

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
      if (selectedYear && selectedTheme && selectedWeek && academicCalendar[selectedYear]?.[selectedTheme]?.[selectedWeek]) {
        const info = academicCalendar[selectedYear][selectedTheme][selectedWeek];
        const formattedRange = formatModernDateRange(info.startDate, info.endDate);
        badge.innerHTML = `<span class="badge-icon">📅</span> <span>${formattedRange}</span>`;
      } else {
        badge.innerHTML = `<span class="badge-icon">📅</span> <span>Dates: -</span>`;
      }
    }
  });

  populateAdminCalendarDropdowns();
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
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 6);

    if (currentEnd > finalEnd) {
      currentEnd = new Date(finalEnd);
    }

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
    alert(`Successfully generated and saved ${weekCount} weeks for ${year} > ${theme}!`);
    populateCalendarSelects();
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

function populateAdminSelects() {
  const periodSelect = document.getElementById('adminPeriodSelect');
  if (periodSelect && periodSelect.children.length === 0) {
    periodSelect.innerHTML = timeSlots
      .filter(s => !s.isBreak)
      .map(s => `<option value="${s.id}">Period ${s.period} (${s.time})</option>`).join('');
  }

  const classSelects = [
    document.getElementById('adminClassSelect'), 
    document.getElementById('classSelectView'),
    document.getElementById('manageClassSelect')
  ];
  classSelects.forEach(select => {
    if (select) {
      const currentVal = select.value;
      select.innerHTML = appEntities.classes.map(c => `<option value="${c}">${c}</option>`).join('');
      if (currentVal && appEntities.classes.includes(currentVal)) select.value = currentVal;
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
      const currentVal = select.value;
      select.innerHTML = appEntities.teachers.map(t => `<option value="${t}">${t}</option>`).join('');
      if (currentVal && appEntities.teachers.includes(currentVal)) select.value = currentVal;
    }
  });

  renderEntityTables();
  renderManageScheduleTable();
}

function renderEntityTables() {
  const types = ['teachers', 'classes', 'subjects'];
  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};

  types.forEach(type => {
    const tbodyId = `table${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    appEntities[type].forEach(item => {
      const tr = document.createElement('tr');
      let homeBadge = '';
      const isHomeTeacher = type === 'teachers' && appEntities.homeTeachers[item];

      if (isHomeTeacher) {
        homeBadge = `<br><span class="hometeacher-pill">⭐ Home Teacher: ${appEntities.homeTeachers[item]}</span>`;
      }

      tr.innerHTML = `
        <td style="text-align: left; padding: 10px 14px;">
          <strong style="color: #0f172a; font-weight: 700;">${item}</strong>${homeBadge}
        </td>
        <td style="text-align: center; width: 70px; padding: 8px 14px;">
          <div class="kebab-menu">
            <button class="kebab-btn" title="Actions">⋮</button>
            <div class="kebab-dropdown">
              ${type === 'teachers' ? (
                isHomeTeacher 
                  ? `<button class="remove-hometeacher-opt" data-name="${item}" style="color: #ef4444;">Remove Home Teacher</button>`
                  : `<button class="set-hometeacher-opt" data-name="${item}">Set Home Teacher</button>`
              ) : ''}
              <button class="edit-opt" data-type="${type}" data-name="${item}">Edit</button>
              <button class="delete-opt" data-type="${type}" data-name="${item}">Delete</button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
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

    if (type === 'teachers' && appEntities.teacherEmails) {
      if (oldName !== cleanName && appEntities.teacherEmails[oldName]) {
        appEntities.teacherEmails[cleanName] = appEntities.teacherEmails[oldName];
        delete appEntities.teacherEmails[oldName];
      }
    }

    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Updated entity details successfully.`);
    } catch (err) {
      alert("Error updating database: " + err.message);
    }
  }
}

async function deleteEntity(type, name) {
  if (confirm(`Are you sure you want to delete "${name}" from ${type}?`)) {
    appEntities[type] = appEntities[type].filter(item => item !== name);
    if (type === 'teachers' && appEntities.teacherEmails) {
      delete appEntities.teacherEmails[name];
    }
    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Removed "${name}".`);
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

function getSubjectPastelStyle(subjectName) {
  if (!subjectName) return '';
  const key = subjectName.trim().toLowerCase();
  const groupType = getSubjectGroupType(subjectName);

  // Group Overrides: All Religion subjects get identical Soft Teal color
  if (groupType === 'religion') {
    const p = { bg: "#CCFBF1", border: "#99f6e4", text: "#0f172a" };
    return `background-color: ${p.bg}; border: 1px solid ${p.border}; color: ${p.text};`;
  }

  // Group Overrides: All Art & Music subjects get identical Soft Amber color
  if (groupType === 'art') {
    const p = { bg: "#FEF3C7", border: "#fde68a", text: "#0f172a" };
    return `background-color: ${p.bg}; border: 1px solid ${p.border}; color: ${p.text};`;
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
  
  const p = dynamicSubjectColorMap[key];
  return `background-color: ${p.bg}; border: 1px solid ${p.border}; color: ${p.text};`;
}

function renderClassSchedule() {
  const selectElem = document.getElementById('classSelectView');
  if (!selectElem) return;
  const selectedClass = selectElem.value;
  const tbody = document.getElementById('classScheduleBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const calPrefix = getActiveCalendarPrefix('class');
  const skipCells = { MONDAY: 0, TUESDAY: 0, WEDNESDAY: 0, THURSDAY: 0, FRIDAY: 0 };

  timeSlots.forEach((slot, sIndex) => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
      days.forEach(day => skipCells[day] = 0);
    } else {
      let html = `<td class="time-cell"><div class="time-range">${slot.time}</div><div class="period-badge">Period ${slot.period}</div></td>`;

      days.forEach(day => {
        if (skipCells[day] > 0) {
          skipCells[day]--;
          return;
        }

        const slotEntries = getSlotAssignments(selectedClass, day, slot.id);

        if (slotEntries.length > 0) {
          const primarySubject = slotEntries[0].subject;
          const primaryGroup = getSubjectGroupType(primarySubject);

          let rowspan = 1;
          for (let i = sIndex + 1; i < timeSlots.length; i++) {
            const nextSlot = timeSlots[i];
            if (nextSlot.isBreak) break;

            const nextEntries = getSlotAssignments(selectedClass, day, nextSlot.id);
            if (nextEntries.length > 0) {
              const nextGroup = getSubjectGroupType(nextEntries[0].subject);
              if (isSameSubjectGroup(primarySubject, nextEntries[0].subject) || 
                 (primaryGroup !== 'regular' && primaryGroup === nextGroup)) {
                rowspan++;
              } else {
                break;
              }
            } else {
              break;
            }
          }

          if (rowspan > 1) skipCells[day] = rowspan - 1;

          let cellContent = '';
          let cellStyle = '';

          if (primaryGroup === 'religion' || primaryGroup === 'art') {
            const groupTitle = primaryGroup === 'religion' ? 'RELIGION' : 'ART & MUSIC';
            cellStyle = getSubjectPastelStyle(primaryGroup);

            let itemsHtml = '';
            slotEntries.forEach(entry => {
              const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
              const matInfo = materialsData[matKey] || {};
              const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">🔗 Link</a>` : '';
              const itemPastelStyle = getSubjectPastelStyle(entry.subject);

              itemsHtml += `
                <div class="group-item" style="${itemPastelStyle}">
                  <div class="group-subject"><strong>${entry.subject}</strong></div>
                  ${matInfo.material ? `<div class="material-text">${matInfo.material}</div>` : ''}
                  ${linkHtml}
                </div>`;
            });

            cellContent = `
              <div class="subject-card group-card">
                <span class="group-header-badge">${groupTitle}</span>
                <div class="group-items">
                  ${itemsHtml}
                </div>
              </div>`;
          } else {
            const entry = slotEntries[0];
            const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
            const matInfo = materialsData[matKey] || {};
            const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">🔗 Link</a>` : '';
            cellStyle = getSubjectPastelStyle(entry.subject);

            cellContent = `
              <div class="subject-card">
                <span class="subject-title">${entry.subject}</span>
                ${matInfo.material ? `<div class="material-text">${matInfo.material}</div>` : ''}
                ${linkHtml}
              </div>`;
          }

          const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
          html += `<td${rowspanAttr} class="subject-cell" style="${cellStyle}">${cellContent}</td>`;
        } else {
          html += `<td><span class="empty-dash">-</span></td>`;
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
      <div class="notes-title">📝 NOTES</div>
    </td>
    <td colspan="5" class="notes-content-cell">
      <div class="notes-box">${noteText}</div>
    </td>
  `;
  tbody.appendChild(notesTr);
}

document.getElementById('btnPrintPDF')?.addEventListener('click', () => {
  window.print();
});

document.getElementById('btnDownloadExcel')?.addEventListener('click', exportWeeklyToExcel);

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

  // --- Excel Color Palette & Style Definitions matching Class View ---
  const COLORS = {
    titleBg: "1E293B",     // Slate 800
    titleText: "FFFFFF",
    metaBg: "EFF6FF",      // Blue 50
    metaBorder: "BFDBFE",  // Blue 200
    metaText: "1E40AF",    // Blue 800
    headerBg: "F1F5F9",    // Slate 100
    headerText: "0F172A",  // Slate 900
    breakBg: "E2E8F0",     // Slate 200
    breakText: "1E293B",   // Slate 800
    border: "CBD5E1",      // Slate 300
    cellBg: "FFFFFF",
    cellText: "0F172A",
    notesBg: "F8FAFC",     // Slate 50
    notesText: "334155",   // Slate 700
    mutedText: "94A3B8"    // Slate 400
  };

  const THIN_BORDER = {
    top: { style: "thin", color: { rgb: COLORS.border } },
    bottom: { style: "thin", color: { rgb: COLORS.border } },
    left: { style: "thin", color: { rgb: COLORS.border } },
    right: { style: "thin", color: { rgb: COLORS.border } }
  };

  const STYLES = {
    title: {
      fill: { fgColor: { rgb: COLORS.titleBg } },
      font: { name: "Calibri", sz: 14, bold: true, color: { rgb: COLORS.titleText } },
      alignment: { horizontal: "center", vertical: "center" }
    },
    meta: {
      fill: { fgColor: { rgb: COLORS.metaBg } },
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: COLORS.metaText } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: COLORS.metaBorder } },
        bottom: { style: "thin", color: { rgb: COLORS.metaBorder } },
        left: { style: "thin", color: { rgb: COLORS.metaBorder } },
        right: { style: "thin", color: { rgb: COLORS.metaBorder } }
      }
    },
    tableHeader: {
      fill: { fgColor: { rgb: COLORS.headerBg } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: COLORS.headerText } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: THIN_BORDER
    },
    breakRow: {
      fill: { fgColor: { rgb: COLORS.breakBg } },
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: COLORS.breakText } },
      alignment: { horizontal: "center", vertical: "center" },
      border: THIN_BORDER
    },
    timeCell: {
      fill: { fgColor: { rgb: COLORS.headerBg } },
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: COLORS.headerText } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: THIN_BORDER
    },
    scheduleCell: {
      fill: { fgColor: { rgb: COLORS.cellBg } },
      font: { name: "Calibri", sz: 10, color: { rgb: COLORS.cellText } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: THIN_BORDER
    },
    emptyCell: {
      fill: { fgColor: { rgb: COLORS.cellBg } },
      font: { name: "Calibri", sz: 10, color: { rgb: COLORS.mutedText } },
      alignment: { horizontal: "center", vertical: "center" },
      border: THIN_BORDER
    },
    notesHeader: {
      fill: { fgColor: { rgb: COLORS.headerBg } },
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: COLORS.headerText } },
      alignment: { horizontal: "center", vertical: "center" },
      border: THIN_BORDER
    },
    notesContent: {
      fill: { fgColor: { rgb: COLORS.notesBg } },
      font: { name: "Calibri", sz: 10, italic: true, color: { rgb: COLORS.notesText } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: THIN_BORDER
    }
  };

  // Helper to cleanly extract text from HTML cells
  function parseCellContent(cell) {
    if (cell.tagName.toLowerCase() === 'th') {
      const small = cell.querySelector('small');
      if (small) {
        const main = cell.childNodes[0]?.textContent?.trim() || '';
        return `${main}\n${small.textContent.trim()}`;
      }
      return cell.textContent.trim();
    }

    if (cell.querySelector('strong') && cell.querySelector('small')) {
      const strong = cell.querySelector('strong').textContent.trim();
      const small = cell.querySelector('small').textContent.trim();
      return `${strong}\n${small}`;
    }

    const titleElem = cell.querySelector('.subject-title');
    if (titleElem) {
      const mainTitle = titleElem.textContent.trim();
      if (mainTitle === 'RELIGION' || mainTitle === 'ART & MUSIC') {
        const lines = [mainTitle];
        const subDivs = cell.querySelectorAll('div');
        subDivs.forEach(div => {
          const tTag = div.querySelector('.teacher-tag')?.textContent.trim();
          const mText = div.querySelector('.material-text')?.textContent.trim();
          const link = div.querySelector('.resource-link')?.href;
          if (tTag) lines.push(`• ${tTag}`);
          if (mText && mText !== 'No material entered') lines.push(`  ${mText}`);
          if (link) lines.push(`  Link: ${link}`);
        });
        return lines.join('\n');
      } else {
        const lines = [mainTitle];
        const teacher = cell.querySelector('.teacher-tag')?.textContent.trim();
        const mat = cell.querySelector('.material-text')?.textContent.trim();
        const link = cell.querySelector('.resource-link')?.href;

        if (teacher) lines.push(teacher);
        if (mat && mat !== 'No material entered') lines.push(mat);
        if (link) lines.push(`Link: ${link}`);
        return lines.join('\n');
      }
    }

    return cell.textContent.trim();
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
      const isHeader = cell.tagName.toLowerCase() === 'th';
      const text = parseCellContent(cell);

      grid[rIdx][cIdx] = {
        text,
        rowspan,
        colspan,
        isHeader,
        isBreak,
        isNotes: text === 'NOTES' || (cIdx === 0 && rIdx === tableRows.length - 1)
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

  // 1. Title Row (Row 0)
  const titleText = `SCHOOL WEEKLY SCHEDULE - ${className || 'Class'}`;
  for (let c = 0; c < 6; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    ws[cellRef] = { v: c === 0 ? titleText : '', t: 's', s: STYLES.title };
  }
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  ws['!rows'][0] = { hpt: 30 };

  // 2. Metadata Row (Row 1)
  const metaText = `School Year: ${schoolYear}   |   Theme: ${theme}   |   Week: ${week}   |   ${dates}`;
  for (let c = 0; c < 6; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 1, c });
    ws[cellRef] = { v: c === 0 ? metaText : '', t: 's', s: STYLES.meta };
  }
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
  ws['!rows'][1] = { hpt: 24 };

  // Row 2 Spacer
  ws['!rows'][2] = { hpt: 10 };

  // 3. Grid Rows (Row 3+)
  grid.forEach((row, rIdx) => {
    const excelR = rIdx + rowOffset;
    const isFirstRow = rIdx === 0;
    const isLastRow = rIdx === grid.length - 1;

    // Set custom row height
    if (isFirstRow) ws['!rows'][excelR] = { hpt: 28 };
    else if (row[0]?.isBreak) ws['!rows'][excelR] = { hpt: 22 };
    else if (isLastRow) ws['!rows'][excelR] = { hpt: 40 };
    else ws['!rows'][excelR] = { hpt: 55 };

    row.forEach((cellData, cIdx) => {
      if (!cellData) return;

      // Select cell style
      let style = STYLES.scheduleCell;
      if (isFirstRow) {
        style = STYLES.tableHeader;
      } else if (cellData.isBreak) {
        style = STYLES.breakRow;
      } else if (isLastRow && cIdx === 0) {
        style = STYLES.notesHeader;
      } else if (isLastRow && cIdx > 0) {
        style = STYLES.notesContent;
      } else if (cIdx === 0) {
        style = STYLES.timeCell;
      } else if (cellData.text === '-') {
        style = STYLES.emptyCell;
      }

      // Populate cell and all merged sub-cells for full border & fill coverage
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

  // Column Widths
  ws['!cols'] = [
    { wch: 18 }, // TIME
    { wch: 32 }, // MONDAY
    { wch: 32 }, // TUESDAY
    { wch: 32 }, // WEDNESDAY
    { wch: 32 }, // THURSDAY
    { wch: 32 }  // FRIDAY
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

function renderTeacherView() {
  const selectElem = document.getElementById('teacherSelectView');
  if (!selectElem) return;
  const selectedTeacher = selectElem.value;
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
    }
  } else if (homeSection) {
    homeSection.style.display = 'none';
  }

  const tbodyGrid = document.getElementById('teacherScheduleBody');
  if (tbodyGrid) {
    tbodyGrid.innerHTML = '';
    timeSlots.forEach(slot => {
      const tr = document.createElement('tr');
      if (slot.isBreak) {
        tr.className = 'break-row';
        tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
      } else {
        let html = `<td><strong>${slot.time}</strong></td>`;
        days.forEach(day => {
          let assignedInfo = "";
          Object.keys(masterSchedules).forEach(className => {
            const slotEntries = getSlotAssignments(className, day, slot.id);
            slotEntries.forEach(entry => {
              if (entry.teacher === selectedTeacher) {
                assignedInfo = `<strong>${entry.subject}</strong><br><small>${className}</small>`;
              }
            });
          });
          html += `<td>${assignedInfo}</td>`;
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

  teacherAssignments.forEach(item => {
    const mat = materialsData[item.key]?.material || '';
    const link = materialsData[item.key]?.link || '';
    const dayShort = item.day.substring(0, 3);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.className}</strong><br><small>${item.subject} (${dayShort})</small></td>
      <td><input type="text" class="mat-input" data-key="${item.key}" value="${mat}" placeholder="Enter material..."></td>
      <td>
        <div class="kebab-menu">
          <button class="kebab-btn">⋮</button>
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
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 8px;"><strong>Period ${slot.period}</strong><br><small>${slot.time}</small></td>
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
    } catch (err) {
      alert("Failed to delete assignment: " + err.message);
    }
  }
}

document.getElementById('manageClassSelect')?.addEventListener('change', renderManageScheduleTable);
document.getElementById('manageDaySelect')?.addEventListener('change', renderManageScheduleTable);

const originalPopulateAdminSelects = populateAdminSelects;
populateAdminSelects = function() {
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

      if (groupType !== 'regular') {
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

document.getElementById('classSelectView')?.addEventListener('change', renderClassSchedule);
document.getElementById('teacherSelectView')?.addEventListener('change', renderTeacherView);

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
  } else {
    appEntities = {
      teachers: ["Mr. Syam", "Mr. Jerry"],
      classes: ["Grade 9A", "Grade 9B", "Grade 9C"],
      subjects: ["English", "Pancasila", "ICT", "Math"]
    };
    setDoc(doc(db, "config", "appEntities"), appEntities);
  }
  populateAdminSelects();
  renderClassSchedule();
  renderTeacherView();
});

onSnapshot(doc(db, "schedules", "masterSchedules"), (docSnap) => {
  if (docSnap.exists()) masterSchedules = docSnap.data();
  renderClassSchedule();
  renderTeacherView();
  renderManageScheduleTable();
});

onSnapshot(doc(db, "schedules", "materialsData"), (docSnap) => {
  if (docSnap.exists()) materialsData = docSnap.data();
  renderClassSchedule();
  renderTeacherView();
});

onSnapshot(doc(db, "schedules", "classNotesData"), (docSnap) => {
  if (docSnap.exists()) classNotesData = docSnap.data();
  renderClassSchedule();
  renderTeacherView();
});

document.getElementById('btnSaveClassNotes')?.addEventListener('click', async () => {
  const selectedTeacher = document.getElementById('teacherSelectView')?.value;
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
        <button class="btn btn-print" onclick="window.print()">🖨️ Print Draft Directly</button>
        <button class="btn btn-save" onclick="saveDraft()">💾 Save Draft Locally</button>
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