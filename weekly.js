import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBIUtrjlgHEI7TtOY-nRiXzQ0DICdkT-W0",
  authDomain: "weekly-teacher.firebaseapp.com",
  projectId: "weekly-teacher",
  storageBucket: "weekly-teacher.firebasestorage.app",
  messagingSenderId: "329063573272",
  appId: "1:329063573272:web:56a43fb16a85ca4c22a06d",
  measurementId: "G-VFRECGLJFK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
let appEntities = { teachers: [], classes: [], subjects: [], homeTeachers: {} };
let classNotesData = {};
let masterSchedules = {};
let materialsData = {};
let academicCalendar = {};

// Main Navigation Event Listeners
document.getElementById('btnClassView')?.addEventListener('click', (e) => switchTab('classView', e.target));
document.getElementById('btnTeacherView')?.addEventListener('click', (e) => switchTab('teacherView', e.target));
document.getElementById('btnAdminView')?.addEventListener('click', (e) => switchTab('adminView', e.target));

function switchTab(tabId, targetBtn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  targetBtn?.classList.add('active');
}

// Helper to retrieve slot assignments normalized as an array
function getSlotAssignments(className, day, slotId) {
  const entry = masterSchedules[className]?.[day]?.[slotId];
  if (!entry) return [];
  if (Array.isArray(entry)) return entry;
  return [entry]; // Convert single legacy object to array format
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

// Populate Calendar Select Boxes for Class, Teacher, and Admin Views
function populateCalendarSelects() {
  const years = Object.keys(academicCalendar);
  const views = ['class', 'teacher'];

  // 1. Populate Student and Teacher View Selectors
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
    const weeks = selectedYear && selectedTheme && academicCalendar[selectedYear][selectedTheme] 
      ? Object.keys(academicCalendar[selectedYear][selectedTheme]) 
      : [];

    const currWeek = weekSel.value;
    weekSel.innerHTML = weeks.map(w => `<option value="${w}">${w}</option>`).join('');
    if (currWeek && weeks.includes(currWeek)) weekSel.value = currWeek;

    const selectedWeek = weekSel.value;
    const badge = document.getElementById(`${prefix}DateBadge`);
    if (badge) {
      if (selectedYear && selectedTheme && selectedWeek && academicCalendar[selectedYear]?.[selectedTheme]?.[selectedWeek]) {
        const info = academicCalendar[selectedYear][selectedTheme][selectedWeek];
        badge.textContent = `Dates: ${info.startDate} to ${info.endDate}`;
      } else {
        badge.textContent = "Dates: -";
      }
    }
  });

  // 2. Populate Admin Calendar Form Selectors
  populateAdminCalendarDropdowns();
}

// Admin Calendar Form Dropdown Handler
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

// Add New School Year Button Handler
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

// Add New Theme Button Handler
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

// Sync Admin Calendar Year Dropdown Change
document.getElementById('adminYearSelect')?.addEventListener('change', () => {
  populateAdminCalendarDropdowns();
});

// Date Formatter Helper (YYYY-MM-DD)
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper Function: Auto-Generate Weeks
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
    currentEnd.setDate(currentEnd.getDate() + 6); // 7 days (e.g., Mon - Sun)

    if (currentEnd > finalEnd) {
      currentEnd = new Date(finalEnd);
    }

    const weekKey = `Week ${weekNum}`;
    weeksObj[weekKey] = {
      startDate: formatDate(currentStart),
      endDate: formatDate(currentEnd)
    };

    // Move to start of next week (+7 days)
    currentStart.setDate(currentStart.getDate() + 7);
    weekNum++;
  }

  return weeksObj;
}

// Submit Academic Calendar Form (Auto-Generate Weeks)
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

// Sync Calendar Filters across Views
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

// Populate Admin Select Pickers & Entity Tables
function populateAdminSelects() {
  const periodSelect = document.getElementById('adminPeriodSelect');
  if (periodSelect && periodSelect.children.length === 0) {
    periodSelect.innerHTML = timeSlots
      .filter(s => !s.isBreak)
      .map(s => `<option value="${s.id}">Period ${s.period} (${s.time})</option>`).join('');
  }

  const classSelects = [document.getElementById('adminClassSelect'), document.getElementById('classSelectView')];
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
}

// Render Entity Tables with Kebab Actions
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
      if (type === 'teachers' && appEntities.homeTeachers[item]) {
        homeBadge = `<br><small style="color: #2563eb;">(Home Teacher: ${appEntities.homeTeachers[item]})</small>`;
      }

      tr.innerHTML = `
        <td style="text-align: left; padding-left: 12px;">
          <strong>${item}</strong>${homeBadge}
        </td>
        <td>
          <div class="kebab-menu">
            <button class="kebab-btn">⋮</button>
            <div class="kebab-dropdown">
              ${type === 'teachers' ? `<button class="set-hometeacher-opt" data-name="${item}">Set Home Teacher</button>` : ''}
              <button class="edit-opt" data-type="${type}" data-name="${item}">Edit</button>
              <button class="delete-opt" data-type="${type}" data-name="${item}">Delete</button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Action listeners
  document.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  // Set Home Teacher Kebab Action
  document.querySelectorAll('.set-hometeacher-opt').forEach(btn => {
    btn.addEventListener('click', (e) => setHomeTeacher(e.target.dataset.name));
  });

  document.querySelectorAll('.edit-opt').forEach(btn => {
    btn.addEventListener('click', (e) => editEntity(e.target.dataset.type, e.target.dataset.name));
  });

  document.querySelectorAll('.delete-opt').forEach(btn => {
    btn.addEventListener('click', (e) => deleteEntity(e.target.dataset.type, e.target.dataset.name));
  });
}

// Set Home Teacher Handler
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

async function editEntity(type, oldName) {
  const newName = prompt(`Enter new name for "${oldName}":`, oldName);
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

  const cleanName = newName.trim();
  const index = appEntities[type].indexOf(oldName);
  if (index !== -1) {
    appEntities[type][index] = cleanName;
    try {
      await setDoc(doc(db, "config", "appEntities"), appEntities);
      alert(`Updated "${oldName}" to "${cleanName}".`);
    } catch (err) {
      alert("Error updating database: " + err.message);
    }
  }
}

async function deleteEntity(type, name) {
  if (confirm(`Are you sure you want to delete "${name}" from ${type}?`)) {
    appEntities[type] = appEntities[type].filter(item => item !== name);
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

// Helper to identify special combined subject groups
function getSubjectGroupType(subjectName) {
  if (!subjectName) return 'regular';
  const name = subjectName.toLowerCase();
  if (name.includes('religion') || name.includes('islam') || name.includes('christian') || 
      name.includes('catholic') || name.includes('buddha') || name.includes('hindu')) {
    return 'religion';
  }
  if (name.includes('art') || name.includes('music')) {
    return 'art';
  }
  return 'regular';
}

// Helper to determine if two slot entries belong to the same consecutive subject block
function isSameSubjectGroup(sub1, sub2) {
  if (sub1 === sub2) return true;
  const type1 = getSubjectGroupType(sub1);
  const type2 = getSubjectGroupType(sub2);
  if (type1 !== 'regular' && type1 === type2) return true;
  return false;
}

// Render Student Class Schedule View with Row Merging & Combined Subject Material Support
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

  // Render Time Slots
  timeSlots.forEach((slot, sIndex) => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
      days.forEach(day => skipCells[day] = 0);
    } else {
      let html = `<td><strong>${slot.time}</strong><br><small>Period ${slot.period}</small></td>`;

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
          if (primaryGroup === 'religion' || primaryGroup === 'art') {
            const groupTitle = primaryGroup === 'religion' ? 'RELIGION' : 'ART & MUSIC';
            cellContent = `<span class="subject-title">${groupTitle}</span>`;

            slotEntries.forEach(entry => {
              const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
              const matInfo = materialsData[matKey] || {};
              const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">🔗 Link</a>` : '';

              cellContent += `
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                  <span class="teacher-tag"><strong>${entry.subject}</strong> (${entry.teacher})</span>
                  <div class="material-text">${matInfo.material || 'No material entered'}</div>
                  ${linkHtml}
                </div>`;
            });
          } else {
            const entry = slotEntries[0];
            const matKey = `${calPrefix}_${selectedClass}_${day}_${entry.subject}`;
            const matInfo = materialsData[matKey] || {};
            const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">🔗 Link</a>` : '';

            cellContent = `
              <span class="subject-title">${entry.subject}</span>
              <span class="teacher-tag">${entry.teacher}</span>
              <div class="material-text">${matInfo.material || ''}</div>
              ${linkHtml}`;
          }

          const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
          html += `<td${rowspanAttr}>${cellContent}</td>`;
        } else {
          html += `<td>-</td>`;
        }
      });

      tr.innerHTML = html;
    }

    tbody.appendChild(tr);
  });

  // APPEND NOTES ROW AT THE BOTTOM (Below CLOSING Slot)
    const notesKey = `${calPrefix}_${selectedClass}_notes`;
    const noteText = classNotesData[notesKey] || 'No notes for this week.';

    const notesTr = document.createElement('tr');
    notesTr.innerHTML = `
      <td style="background-color: #f1f5f9; font-weight: bold; text-align: center;">NOTES</td>
      <td colspan="5" style="text-align: left; padding: 12px; background-color: #f8fafc; font-style: italic; color: #334155; white-space: pre-line;">
        ${noteText}
      </td>
    `;
    tbody.appendChild(notesTr);
}

// Print PDF Button Listener
document.getElementById('btnPrintPDF')?.addEventListener('click', () => {
  window.print();
});

function renderTeacherView() {
  const selectElem = document.getElementById('teacherSelectView');
  if (!selectElem) return;
  const selectedTeacher = selectElem.value;
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const calPrefix = getActiveCalendarPrefix('teacher');

  // DOM Elements for Home Teacher Panel
  const homeSection = document.getElementById('homeTeacherSection');
  const homeClassTitle = document.getElementById('homeClassTitle');
  const noteInput = document.getElementById('weeklyNoteInput');

  // Check if selected teacher is a Home Teacher
  const assignedClass = appEntities.homeTeachers?.[selectedTeacher];
  if (assignedClass && homeSection) {
    homeSection.style.display = 'block';
    if (homeClassTitle) homeClassTitle.textContent = `${assignedClass} (${selectedTeacher})`;

    const notesKey = `${calPrefix}_${assignedClass}_notes`;

    // Load existing weekly note
    if (noteInput) {
      noteInput.value = classNotesData[notesKey] || '';
    }
  } else if (homeSection) {
    homeSection.style.display = 'none';
  }

  // 1. Render Weekly Schedule Grid for Selected Teacher
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
    
  // 2. Render Personal Material Entries
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

  // Material Input Listeners
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

// 1. Render Manage Schedule Table for selected Class & Day
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

  // Bind dropdown toggle listeners
  tbody.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      tbody.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  // Bind Edit action listeners
  tbody.querySelectorAll('.edit-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slotId = parseInt(e.target.dataset.slot);
      const index = parseInt(e.target.dataset.index);
      editSlotAssignment(selectedClass, selectedDay, slotId, index);
    });
  });

  // Bind Delete action listeners
  tbody.querySelectorAll('.delete-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const slotId = parseInt(e.target.dataset.slot);
      const index = parseInt(e.target.dataset.index);
      deleteSlotAssignment(selectedClass, selectedDay, slotId, index);
    });
  });
}

// 2. Edit Slot Assignment (Teacher or Subject Correction)
async function editSlotAssignment(className, day, slotId, index) {
  const currentAssignments = getSlotAssignments(className, day, slotId);
  const target = currentAssignments[index];
  if (!target) return;

  // Prompt for Subject choice
  const availableSubjects = appEntities.subjects.join(', ');
  const newSubject = prompt(`Current Subject: "${target.subject}"\nEnter new Subject (${availableSubjects}):`, target.subject);
  if (newSubject === null) return; // Cancelled

  // Prompt for Teacher choice
  const availableTeachers = appEntities.teachers.join(', ');
  const newTeacher = prompt(`Current Teacher: "${target.teacher}"\nEnter new Teacher (${availableTeachers}):`, target.teacher);
  if (newTeacher === null) return; // Cancelled

  const cleanSubject = newSubject.trim() || target.subject;
  const cleanTeacher = newTeacher.trim() || target.teacher;

  // Update object entry
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

// 3. Delete Slot Assignment Entry
async function deleteSlotAssignment(className, day, slotId, index) {
  const currentAssignments = getSlotAssignments(className, day, slotId);
  const target = currentAssignments[index];
  if (!target) return;

  if (confirm(`Are you sure you want to remove ${target.subject} (${target.teacher}) from Period ${timeSlots[slotId]?.period || slotId}?`)) {
    // Remove the item from array
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

// 4. Attach Sync Listeners for Management Dropdowns
document.getElementById('manageClassSelect')?.addEventListener('change', renderManageScheduleTable);
document.getElementById('manageDaySelect')?.addEventListener('change', renderManageScheduleTable);

// Update populateAdminSelects to sync the management class selector
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

document.getElementById('addResourceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('resourceType').value;
  const name = document.getElementById('resourceName').value.trim();

  if (!name) return;
  if (appEntities[type].includes(name)) {
    alert(`"${name}" already exists in ${type}.`);
    return;
  }

  appEntities[type].push(name);
  try {
    await setDoc(doc(db, "config", "appEntities"), appEntities);
    document.getElementById('resourceName').value = '';
    alert(`Successfully added "${name}" to ${type}!`);
  } catch (err) {
    alert("Error adding resource: " + err.message);
  }
});

// Admin Assignment Handler (Appends Religion & Art Teachers to the Same Slot)
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
        // Multi-teacher group (Religion or Art): Append without duplicates
        const alreadyExists = existingAssignments.some(
          item => item.teacher === teacher && item.subject === subject
        );

        if (!alreadyExists) {
          existingAssignments.push({ subject, teacher });
        }
        masterSchedules[className][day][currentSlotId] = existingAssignments;
      } else {
        // Standard regular subject: Replace slot assignment
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

// Firebase Real-time Synchronization Listeners
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
});

onSnapshot(doc(db, "schedules", "materialsData"), (docSnap) => {
  if (docSnap.exists()) materialsData = docSnap.data();
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

  // Populate table with active class schedule template
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

  // Open Template Draft in a New Tab
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

// Sync Real-Time Class Notes Snapshot
onSnapshot(doc(db, "schedules", "classNotesData"), (docSnap) => {
  if (docSnap.exists()) classNotesData = docSnap.data();
  renderClassSchedule();
  renderTeacherView();
});