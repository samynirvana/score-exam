import { doc, setDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml, triggerCelebration } from "../../utils.js";
import {
  db,
  syamDb,
  academicCalendar,
  appEntities,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName
} from "./weeklyState.js";

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
    sectionTitle.textContent = `Character and Skill - ${className} (${theme})`;
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
    printSubtitle.textContent = `CHARACTER AND SKILL AWARDS — ${className.toUpperCase()} — ${theme.toUpperCase()} ${year}`;
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
    masterTitle.textContent = `Character and Skill Reward All Classes (${theme})`;
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


export { initRewardView, populateRewardSelects };
