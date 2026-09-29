import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { escapeHtml } from "../../utils.js";
import {
  db,
  secondaryAuth,
  timeSlots,
  appEntities,
  setAppEntities,
  masterSchedules,
  weeklyOverrides,
  materialsData,
  academicCalendar,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName,
  isMiddleSchoolClass,
  getFridayMiddleSchoolTime,
  sortWeeks,
  formatModernDateRange,
  getActiveCalendarPrefix,
  getSlotAssignments,
  syncClassWeeklyOverrides
} from "./weeklyState.js";
import { renderClassSchedule, getSubjectGroupType } from "./tabClassView.js";
import { renderTeacherView } from "./tabTeacherView.js";
import {
  loadDriveFolderSettings,
  renderActiveTabsControlTable,
  populateCalendarSelects,
  checkUserRoleAccess,
  renderAppUpdateControlPanel
} from "../../weekly.js";

export {
  renderEntityTables,
  renderManageScheduleTable,
  renderManageThemesTable,
  populateAdminSelects,
  populateAdminCalendarDropdowns,
  syncEntitiesFromMasterSchedules,
  updateAdminPeriodSelectOptions
};

// Admin Assignment Select Event Listeners
document.getElementById('adminClassSelect')?.addEventListener('change', updateAdminPeriodSelectOptions);
document.getElementById('adminDaySelect')?.addEventListener('change', updateAdminPeriodSelectOptions);
document.getElementById('manageClassSelect')?.addEventListener('change', renderManageScheduleTable);
document.getElementById('manageDaySelect')?.addEventListener('change', renderManageScheduleTable);

// Close admin kebab dropdowns when clicking outside
if (!window._adminKebabOutsideListener) {
  window._adminKebabOutsideListener = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.kebab-menu')) {
      document.querySelectorAll('.kebab-dropdown.show').forEach(d => d.classList.remove('show'));
    }
  });
}


// Admin Sub-Tab Navigation
document.getElementById('btnSubAdd')?.addEventListener('click', (e) => switchAdminSubTab('subTabAdd', e.target));
document.getElementById('btnSubManage')?.addEventListener('click', (e) => switchAdminSubTab('subTabManage', e.target));
document.getElementById('btnSubCalendar')?.addEventListener('click', (e) => {
  switchAdminSubTab('subTabCalendar', e.target);
  populateAdminCalendarDropdowns();
});
document.getElementById('btnSubTabs')?.addEventListener('click', (e) => {
  switchAdminSubTab('subTabTabs', e.target);
  renderActiveTabsControlTable();
  renderAppUpdateControlPanel();
});
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

async function saveAcademicCalendarToFirestore(calendarData) {
  await setDoc(doc(db, "config", "academicCalendar"), calendarData);
  try {
    localStorage.setItem('mks_academic_calendar_backup', JSON.stringify(calendarData));
  } catch (e) {}
}

function loadSelectedThemeDates() {
  const year = document.getElementById('adminYearSelect')?.value;
  const theme = document.getElementById('adminThemeSelect')?.value;
  const startInput = document.getElementById('calStartDate');
  const endInput = document.getElementById('calEndDate');
  const submitBtn = document.querySelector('#calendarForm button[type="submit"]');

  if (!startInput || !endInput) return;

  if (!year || !theme || !academicCalendar[year]?.[theme]) {
    startInput.value = '';
    endInput.value = '';
    if (submitBtn) submitBtn.textContent = 'Auto-Generate & Save Weeks';
    renderManageThemesTable();
    return;
  }

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
      <td style="padding: 8px 10px; text-align: center; width: 85px;">
        <div class="kebab-menu">
          <button class="kebab-btn" title="Actions">⋮</button>
          <div class="kebab-dropdown">
            <button class="btn-edit-theme" data-year="${year}" data-theme="${theme}">Edit</button>
            <button class="btn-delete-theme" data-year="${year}" data-theme="${theme}" style="color: #ef4444;">Delete</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
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
          await saveAcademicCalendarToFirestore(academicCalendar);
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

  const years = Object.keys(academicCalendar || {});
  if (years.length === 0) {
    adminYearSel.innerHTML = '<option value="">-- No School Years --</option>';
    adminThemeSel.innerHTML = '<option value="">-- No Themes --</option>';
    loadSelectedThemeDates();
    return;
  }

  const currYear = adminYearSel.value;
  adminYearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (currYear && years.includes(currYear)) adminYearSel.value = currYear;

  const selectedYear = adminYearSel.value;
  const themes = selectedYear && academicCalendar[selectedYear] ? Object.keys(academicCalendar[selectedYear]) : [];

  const currTheme = adminThemeSel.value;
  if (themes.length === 0) {
    adminThemeSel.innerHTML = '<option value="">-- No Themes --</option>';
  } else {
    adminThemeSel.innerHTML = themes.map(t => `<option value="${t}">${t}</option>`).join('');
    if (currTheme && themes.includes(currTheme)) adminThemeSel.value = currTheme;
  }

  loadSelectedThemeDates();
}

document.getElementById('btnAddYear')?.addEventListener('click', async () => {
  const newYear = prompt("Enter new Academic School Year (e.g., 2027-2028):");
  if (!newYear || !newYear.trim()) return;

  const cleanYear = newYear.trim();
  if (academicCalendar[cleanYear]) {
    alert("This School Year already exists.");
    return;
  }

  const existingYears = Object.keys(academicCalendar).filter(y => y !== cleanYear);
  academicCalendar[cleanYear] = {};

  if (existingYears.length > 0) {
    const currentYear = document.getElementById('adminYearSelect')?.value || existingYears[0];
    const shouldCopy = confirm(
      `Do you want to copy the Themes and Week structure from "${currentYear}" into "${cleanYear}"?\n\n` +
      `• Click OK to copy all themes from ${currentYear} (you can adjust dates later).\n` +
      `• Click Cancel to start with a completely empty school year.`
    );

    if (shouldCopy && academicCalendar[currentYear]) {
      // Deep clone theme structure
      const sourceThemes = academicCalendar[currentYear];
      Object.keys(sourceThemes).forEach(themeName => {
        academicCalendar[cleanYear][themeName] = JSON.parse(JSON.stringify(sourceThemes[themeName] || {}));
      });
    }
  }

  try {
    await saveAcademicCalendarToFirestore(academicCalendar);
    populateCalendarSelects();
    const adminYearSel = document.getElementById('adminYearSelect');
    if (adminYearSel) adminYearSel.value = cleanYear;
    populateAdminCalendarDropdowns();
    alert(`Successfully created Academic Year "${cleanYear}"!`);
  } catch (err) {
    alert("Error adding School Year: " + err.message);
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
      await saveAcademicCalendarToFirestore(academicCalendar);
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
    await saveAcademicCalendarToFirestore(academicCalendar);
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
  if (!appEntities) setAppEntities({ teachers: [], classes: [], subjects: [], homeTeachers: {}, teacherEmails: {}, teacherLeaders: [] });
  if (!appEntities.classes) appEntities.classes = [];
  if (!appEntities.teachers) appEntities.teachers = [];
  if (!appEntities.subjects) appEntities.subjects = [];
  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
  if (!appEntities.teacherEmails) appEntities.teacherEmails = {};
  if (!appEntities.teacherLeaders) appEntities.teacherLeaders = [];

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

  // 2. Scan weeklyOverrides for any additional classes and subjects
  if (weeklyOverrides && typeof weeklyOverrides === 'object') {
    Object.entries(weeklyOverrides).forEach(([key, overrideData]) => {
      const lastUnderscore = key.lastIndexOf('_');
      if (lastUnderscore !== -1) {
        const potentialClass = key.substring(lastUnderscore + 1).trim();
        if (potentialClass && !classSet.has(potentialClass)) {
          classSet.add(potentialClass);
          appEntities.classes.push(potentialClass);
          changed = true;
        }
      }
      const sched = overrideData?.schedule || overrideData;
      if (sched && typeof sched === 'object') {
        Object.values(sched).forEach(daySlots => {
          if (daySlots && typeof daySlots === 'object') {
            Object.values(daySlots).forEach(entries => {
              const arr = Array.isArray(entries) ? entries : (entries ? [entries] : []);
              arr.forEach(entry => {
                if (entry && entry.subject) {
                  const cleanSub = entry.subject.replace(/\s*\(Section\s*\d+\)$/i, '').trim();
                  if (cleanSub && cleanSub !== '__custom__' && !subjectSet.has(cleanSub)) {
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

  // Always ensure Pramuka is in registered subjects
  if (!subjectSet.has('Pramuka')) {
    subjectSet.add('Pramuka');
    appEntities.subjects.push('Pramuka');
    changed = true;
  }

  // Naturally sort classes (e.g., Grade 7A, Grade 7B, Grade 8A, Grade 9A, Grade 9B, Grade 10, etc.)
  appEntities.classes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return changed;
}

function populateAdminSelects() {
  syncEntitiesFromMasterSchedules();
  updateAdminPeriodSelectOptions();
  populateAdminCalendarDropdowns();

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
  teacherLeaders: 1,
  classes: 1,
  subjects: 1
};
const ENTITY_PAGE_SIZE = 10;

function renderEntityTables() {
  if (!appEntities.homeTeachers) appEntities.homeTeachers = {};
  if (!appEntities.teacherLeaders) appEntities.teacherLeaders = [];
  if (!appEntities.teachers) appEntities.teachers = [];
  if (!appEntities.classes) appEntities.classes = [];
  if (!appEntities.subjects) appEntities.subjects = [];

  const isLeader = (name) => Array.isArray(appEntities.teacherLeaders) && appEntities.teacherLeaders.includes(name);

  const regularTeachers = appEntities.teachers.filter(t => !appEntities.homeTeachers[t]);
  const homeTeachersList = Array.from(new Set([
    ...appEntities.teachers.filter(t => !!appEntities.homeTeachers?.[t]),
    ...Object.keys(appEntities.homeTeachers || {}).filter(t => !!appEntities.homeTeachers[t])
  ]));
  const teacherLeadersList = Array.from(new Set([
    ...appEntities.teachers.filter(t => isLeader(t)),
    ...(Array.isArray(appEntities.teacherLeaders) ? appEntities.teacherLeaders : [])
  ])).filter(Boolean);

  const entityData = {
    teachers: regularTeachers,
    homeTeachers: homeTeachersList,
    teacherLeaders: teacherLeadersList,
    classes: appEntities.classes,
    subjects: appEntities.subjects
  };

  const types = ['teachers', 'homeTeachers', 'teacherLeaders', 'classes', 'subjects'];

  types.forEach(type => {
    let capitalizeType = type.charAt(0).toUpperCase() + type.slice(1);
    if (type === 'homeTeachers') capitalizeType = 'HomeTeachers';
    if (type === 'teacherLeaders') capitalizeType = 'TeacherLeaders';

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
      const colSpan = (type === 'teachers' || type === 'homeTeachers' || type === 'teacherLeaders') ? 3 : 2;
      const emptyLabel = type === 'homeTeachers' 
        ? 'home teachers assigned' 
        : (type === 'teacherLeaders' ? 'Teacher\'s Leaders assigned' : type);
      tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #64748b; padding: 14px;">No ${emptyLabel} found.</td></tr>`;
    }

    pageItems.forEach(item => {
      const tr = document.createElement('tr');

      if (type === 'teachers') {
        const ttp = calculateTeacherTTP(item);
        const leaderBadge = isLeader(item) 
          ? `<span style="display:inline-flex; align-items:center; gap:2px; font-size:9.5px; font-weight:700; background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:4px; padding:0 5px; margin-left:4px;">⭐ Leader</span>` 
          : '';
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>${leaderBadge}
          </td>
          <td style="text-align: center; width: 75px; padding: 8px 10px;">
            <span class="ttl-badge" title="Total Teaching Periods: ${ttp}">${ttp}</span>
          </td>
          <td style="text-align: center; width: 85px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="set-leader-opt" data-name="${item}">${isLeader(item) ? '👤 Remove Leader' : '⭐ Set as Leader'}</button>
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
        const leaderBadge = isLeader(item) 
          ? `<span style="display:inline-flex; align-items:center; gap:2px; font-size:9.5px; font-weight:700; background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:4px; padding:0 5px; margin-left:4px;">⭐ Leader</span>` 
          : '';
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>${leaderBadge}
            <br><span class="hometeacher-pill">Home Teacher: ${assignedClass}</span>
          </td>
          <td style="text-align: center; width: 75px; padding: 8px 10px;">
            <span class="ttl-badge" title="Total Teaching Periods: ${ttp}">${ttp}</span>
          </td>
          <td style="text-align: center; width: 85px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="set-leader-opt" data-name="${item}">${isLeader(item) ? '👤 Remove Leader' : '⭐ Set as Leader'}</button>
                <button class="set-hometeacher-opt" data-name="${item}">Change Class</button>
                <button class="remove-hometeacher-opt" data-name="${item}" style="color: #ef4444;">Remove Home Teacher</button>
                <button class="edit-opt" data-type="teachers" data-name="${item}">Edit</button>
                <button class="delete-opt" data-type="teachers" data-name="${item}">Delete</button>
              </div>
            </div>
          </td>
        `;
      } else if (type === 'teacherLeaders') {
        const ttp = calculateTeacherTTP(item);
        const assignedClass = appEntities.homeTeachers[item];
        const homeTeacherBadge = assignedClass ? `<span class="hometeacher-pill" style="margin-top:2px;">Home Teacher: ${assignedClass}</span>` : '';
        tr.innerHTML = `
          <td style="text-align: left; padding: 10px 14px;">
            <strong style="color: #0f172a; font-weight: 700;">${item}</strong>
            <br><span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:700; background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:4px; padding:1px 6px; margin-top:2px;">⭐ Teacher's Leader (Admin Access)</span>
            ${homeTeacherBadge}
          </td>
          <td style="text-align: center; width: 75px; padding: 8px 10px;">
            <span class="ttl-badge" title="Total Teaching Periods: ${ttp}">${ttp}</span>
          </td>
          <td style="text-align: center; width: 85px; padding: 8px 10px;">
            <div class="kebab-menu">
              <button class="kebab-btn" title="Actions">⋮</button>
              <div class="kebab-dropdown">
                <button class="set-leader-opt" data-name="${item}" style="color: #ef4444;">👤 Remove Leader</button>
                ${assignedClass ? `<button class="set-hometeacher-opt" data-name="${item}">Change Home Class</button><button class="remove-hometeacher-opt" data-name="${item}" style="color: #ef4444;">Remove Home Teacher</button>` : `<button class="set-hometeacher-opt" data-name="${item}">Set Home Teacher</button>`}
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
          <td style="text-align: center; width: 85px; padding: 8px 10px;">
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

  const entityGrid = document.querySelector('.entity-tables-grid');
  if (entityGrid) {
    entityGrid.querySelectorAll('.kebab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.kebab-dropdown').forEach(d => {
          if (d !== btn.nextElementSibling) d.classList.remove('show');
        });
        btn.nextElementSibling?.classList.toggle('show');
      });
    });

    entityGrid.querySelectorAll('.set-leader-opt').forEach(btn => {
      btn.addEventListener('click', (e) => setTeacherLeader(e.target.dataset.name));
    });

    entityGrid.querySelectorAll('.set-hometeacher-opt').forEach(btn => {
      btn.addEventListener('click', (e) => setHomeTeacher(e.target.dataset.name));
    });

    entityGrid.querySelectorAll('.remove-hometeacher-opt').forEach(btn => {
      btn.addEventListener('click', (e) => removeHomeTeacher(e.target.dataset.name));
    });

    entityGrid.querySelectorAll('.edit-opt').forEach(btn => {
      btn.addEventListener('click', (e) => editEntity(e.target.dataset.type, e.target.dataset.name));
    });

    entityGrid.querySelectorAll('.delete-opt').forEach(btn => {
      btn.addEventListener('click', (e) => deleteEntity(e.target.dataset.type, e.target.dataset.name));
    });
  }
}

// Entity Table Pagination Button Listeners
['Teachers', 'HomeTeachers', 'TeacherLeaders', 'Classes', 'Subjects'].forEach(typeKey => {
  let type = typeKey.toLowerCase();
  if (typeKey === 'HomeTeachers') type = 'homeTeachers';
  if (typeKey === 'TeacherLeaders') type = 'teacherLeaders';

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
        ? Array.from(new Set([
            ...(appEntities.teachers || []).filter(t => !!appEntities.homeTeachers?.[t]),
            ...Object.keys(appEntities.homeTeachers || {}).filter(t => !!appEntities.homeTeachers[t])
          ]))
        : type === 'teacherLeaders'
          ? Array.from(new Set([
              ...(appEntities.teachers || []).filter(t => Array.isArray(appEntities.teacherLeaders) && appEntities.teacherLeaders.includes(t)),
              ...(Array.isArray(appEntities.teacherLeaders) ? appEntities.teacherLeaders : [])
            ])).filter(Boolean)
          : (appEntities[type] || []);
    const totalPages = Math.ceil(list.length / ENTITY_PAGE_SIZE) || 1;
    if (entityPageMap[type] < totalPages) {
      entityPageMap[type]++;
      renderEntityTables();
    }
  });
});

async function setTeacherLeader(teacherName) {
  if (!appEntities.teacherLeaders) appEntities.teacherLeaders = [];
  const isCurrentlyLeader = appEntities.teacherLeaders.includes(teacherName);

  if (isCurrentlyLeader) {
    if (confirm(`Remove "${teacherName}" from Teacher's Leader role?\n\nThey will return to regular teacher access in Weekly Schedule.`)) {
      appEntities.teacherLeaders = appEntities.teacherLeaders.filter(t => t !== teacherName);
      try {
        await setDoc(doc(db, "config", "appEntities"), appEntities);
        alert(`Removed ${teacherName} from Teacher's Leader role.`);
        renderEntityTables();
        checkUserRoleAccess();
      } catch (err) {
        alert("Error updating Teacher's Leader: " + err.message);
      }
    }
  } else {
    if (confirm(`Assign "${teacherName}" as Teacher's Leader?\n\nThey will be granted full administrative access across all tabs and features in Weekly Schedule just like an admin.`)) {
      if (!appEntities.teacherLeaders.includes(teacherName)) {
        appEntities.teacherLeaders.push(teacherName);
      }
      try {
        await setDoc(doc(db, "config", "appEntities"), appEntities);
        alert(`Successfully assigned ${teacherName} as Teacher's Leader!`);
        renderEntityTables();
        checkUserRoleAccess();
      } catch (err) {
        alert("Error assigning Teacher's Leader: " + err.message);
      }
    }
  }
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

    if (type === 'teachers') {
      if (appEntities.teacherEmails && oldName !== cleanName && appEntities.teacherEmails[oldName]) {
        appEntities.teacherEmails[cleanName] = appEntities.teacherEmails[oldName];
        delete appEntities.teacherEmails[oldName];
      }
      if (appEntities.homeTeachers && oldName !== cleanName && appEntities.homeTeachers[oldName]) {
        appEntities.homeTeachers[cleanName] = appEntities.homeTeachers[oldName];
        delete appEntities.homeTeachers[oldName];
      }
      if (appEntities.teacherLeaders && appEntities.teacherLeaders.includes(oldName)) {
        const lIdx = appEntities.teacherLeaders.indexOf(oldName);
        if (lIdx !== -1) appEntities.teacherLeaders[lIdx] = cleanName;
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
      if (appEntities.teacherLeaders) {
        appEntities.teacherLeaders = appEntities.teacherLeaders.filter(t => t !== name);
      }
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
      btn.closest('.kebab-dropdown')?.classList.remove('show');
      const slotId = parseInt(e.target.dataset.slot);
      const index = parseInt(e.target.dataset.index);
      editSlotAssignment(selectedClass, selectedDay, slotId, index);
    });
  });

  tbody.querySelectorAll('.delete-slot-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      btn.closest('.kebab-dropdown')?.classList.remove('show');
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

  const year = document.getElementById('classYearSelect')?.value || document.getElementById('adminYearSelect')?.value || '2026-2027';
  syncClassWeeklyOverrides(className, year);

  try {
    await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
    await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides, { merge: true });
    alert("Schedule updated successfully across all themes!");
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

    const year = document.getElementById('classYearSelect')?.value || document.getElementById('adminYearSelect')?.value || '2026-2027';
    syncClassWeeklyOverrides(className, year);

    try {
      await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
      await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides, { merge: true });
      alert("Assignment removed successfully across all themes!");
      renderManageScheduleTable();
      renderClassSchedule();
      renderTeacherView();
      renderEntityTables();
    } catch (err) {
      alert("Failed to delete assignment: " + err.message);
    }
  }
}

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
      let masterAssignments = [];
      const masterEntry = masterSchedules[className]?.[day]?.[currentSlotId];
      if (masterEntry) {
        masterAssignments = Array.isArray(masterEntry)
          ? JSON.parse(JSON.stringify(masterEntry))
          : [JSON.parse(JSON.stringify(masterEntry))];
      }

      if (assignMode === 'append' || groupType !== 'regular') {
        const alreadyInMaster = masterAssignments.some(
          item => item.teacher === teacher && item.subject === subject
        );
        if (!alreadyInMaster) {
          masterAssignments.push({ subject, teacher });
        }
        masterSchedules[className][day][currentSlotId] = masterAssignments;
      } else {
        masterSchedules[className][day][currentSlotId] = [{ subject, teacher }];
      }
      filledCount++;
    }
    currentSlotId++;
  }

  const year = document.getElementById('adminYearSelect')?.value || document.getElementById('classYearSelect')?.value || '2026-2027';
  syncClassWeeklyOverrides(className, year);

  try {
    await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
    await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides, { merge: true });
    renderClassSchedule();
    renderTeacherView();
    renderManageScheduleTable();
    renderEntityTables();
    alert(`Successfully assigned ${subject} (${teacher}) to ${className} on ${day}! (Applied across Theme 1, 2, 3, 4)`);
  } catch (err) {
    alert("Error updating schedule: " + err.message);
  }
});
