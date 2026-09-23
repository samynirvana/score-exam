import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml, triggerCelebration } from "../../utils.js";
import {
  db,
  timeSlots,
  appEntities,
  masterSchedules,
  setMasterSchedules,
  isAdminUser
} from "./weeklyState.js";

// =========================================================
// Class Schedule Builder Logic & Timetable Solver
// =========================================================

let builderGeneratedMaster = null;
let builderMatrixClasses = []; // Array of class names displayed as columns
let builderTeacherAllocations = {}; // teacherName -> { className: { subject: string, periods: number } }
let builderCustomRules = [
  {
    id: 'rule_teacher_collision',
    title: 'No Teacher Collision (Strict)',
    desc: 'A teacher cannot be scheduled in two different classes at the same period.',
    icon: '🛡️',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_ms_friday_fixed',
    title: 'Middle School Friday Period 1 Fixed: Library / Pramuka',
    desc: 'Library and Pramuka are strictly locked into Friday Period 1 for all middle school classes (Grade 7, 8, 9).',
    icon: '📚',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_hs_friday_fixed',
    title: 'High School Friday Periods 1 & 2 Fixed: BTA / Pramuka / PL Academy',
    desc: 'BTA, Pramuka, and PL Academy are strictly locked into Friday Periods 1 & 2 for all high school classes (Grade 10, 11, 12).',
    icon: '⚜️',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_hs_tandem_subjects',
    title: 'High School Tandem Electives (Synchronized Slots)',
    desc: 'Tandem elective subject pairs (e.g. Ekonomi & Informatika, English Lit & Korean, Math & Accounting, Physics & Geography, Biology & Sociology, Sastra Indonesia & Muatan Lokal) share the exact same periods for each class.',
    icon: '👥',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_middle_religion_parallel',
    title: 'Middle School Religion Parallel Block (3 Periods)',
    desc: 'All religion teachers are synchronized to the exact same 3 continuous periods for parallel classes (Grade 7A, 7B, 7C, etc.).',
    icon: '🕌',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_middle_art_music_parallel',
    title: 'Middle School Music & Art Parallel Block (3 Periods)',
    desc: 'Music and Art occupy the exact same 3 continuous periods across parallel classes (Grade 7A, 7B, 7C, etc.).',
    icon: '🎨',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_high_arts_parallel',
    title: 'High School Seni Musik, Seni Tari, Seni Rupa Parallel Block (3 Periods)',
    desc: 'Seni Musik, Seni Tari, and Seni Rupa occupy the exact same 3 continuous periods across parallel classes (Grade 10A, 10B, 10C, etc.).',
    icon: '🎭',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_high_religion',
    title: 'High School Religion (2 Periods)',
    desc: 'Religion in High School classes takes exactly 2 continuous periods.',
    icon: '📖',
    status: 'Strict',
    active: true
  },
  {
    id: 'rule_bridge_breaks_lunch',
    title: 'Cross-Break & Lunch Subject Continuation',
    desc: 'Multi-period subjects are permitted to span across Break or Lunch (e.g. 1 period before break & 1 after, or 2 periods before lunch & 1 after).',
    icon: '🥪',
    status: 'Active',
    active: true
  },
  {
    id: 'rule_period_splitting',
    title: 'Period Chunking: 5 Periods [2+2+1] & 4 Periods [2+2]',
    desc: '5 periods divide into 2, 2, and 1 across separate days. 4 periods divide into 2 and 2 across separate days.',
    icon: '⚖️',
    status: 'Active',
    active: true
  },
  {
    id: 'rule_three_period_chunking',
    title: '3-Period Placement [3 or 2+1]',
    desc: 'Try to place 3 periods in one day block. If not possible, divide into 2 and 1 periods (Middle School Religion & Arts strictly 3).',
    icon: '⏱️',
    status: 'Active',
    active: true
  }
];

function initScheduleBuilderView() {
  populateBuilderYearSelect();
  initBuilderMatrixData();
  renderBuilderRulesList();
  renderBuilderAllocationMatrix();
  populateBuilderPreviewClassSelect();
  bindBuilderEvents();
}

function populateBuilderYearSelect() {
  const sel = document.getElementById('builderTargetYearSelect');
  if (!sel) return;

  const currentCalYears = Object.keys(academicCalendar || {});
  const nextYears = ['2026-2027', '2027-2028', '2028-2029'];
  const allYears = Array.from(new Set([...currentCalYears, ...nextYears])).sort();

  const currentVal = sel.value;
  sel.innerHTML = allYears.map(yr => `<option value="${yr}">${yr.replace('-', '/')}</option>`).join('');

  if (currentVal && allYears.includes(currentVal)) {
    sel.value = currentVal;
  } else if (allYears.includes('2027-2028')) {
    sel.value = '2027-2028';
  }
}

function initBuilderMatrixData(forceReSync = false) {
  const defaultClasses = appEntities?.classes && appEntities.classes.length > 0
    ? [...appEntities.classes]
    : ['Grade 7A', 'Grade 7B', 'Grade 8A', 'Grade 8B', 'Grade 9A', 'Grade 9B'];

  if (!builderMatrixClasses || builderMatrixClasses.length === 0 || forceReSync) {
    builderMatrixClasses = [...defaultClasses];
  }

  const teachers = appEntities?.teachers && appEntities.teachers.length > 0
    ? [...appEntities.teachers]
    : [];

  if (forceReSync || Object.keys(builderTeacherAllocations).length === 0) {
    builderTeacherAllocations = {};

    // Analyze existing masterSchedules to pre-fill active assignments
    const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

    teachers.forEach(teacher => {
      builderTeacherAllocations[teacher] = {};
      const tLower = teacher.trim().toLowerCase();

      builderMatrixClasses.forEach(className => {
        let subjectFound = null;
        let count = 0;

        days.forEach(day => {
          timeSlots.forEach(slot => {
            if (slot.isBreak) return;
            const entries = getSlotAssignments(className, day, slot.id);
            entries.forEach(e => {
              if (e && e.teacher && e.teacher.trim().toLowerCase() === tLower) {
                if (!subjectFound) subjectFound = e.subject;
                count++;
              }
            });
          });
        });

        if (subjectFound && count > 0) {
          builderTeacherAllocations[teacher][className] = {
            subject: subjectFound,
            periods: count
          };
        } else {
          // Default: No Teaching Period
          builderTeacherAllocations[teacher][className] = {
            subject: '__none__',
            periods: 0
          };
        }
      });
    });
  } else {
    teachers.forEach(teacher => {
      if (!builderTeacherAllocations[teacher]) {
        builderTeacherAllocations[teacher] = {};
      }
      builderMatrixClasses.forEach(className => {
        if (!builderTeacherAllocations[teacher][className]) {
          builderTeacherAllocations[teacher][className] = {
            subject: '__none__',
            periods: 0
          };
        }
      });
    });
  }
}

function renderBuilderRulesList() {
  const listEl = document.getElementById('builderRulesList');
  if (!listEl) return;

  let html = '';
  builderCustomRules.forEach(rule => {
    const isStrict = rule.status === 'Strict';
    const isConfigurable = rule.status === 'Configurable';
    const badgeClass = isStrict || rule.status === 'Active' ? 'active' : 'draft';

    html += `
      <div class="rule-item ${isConfigurable ? 'custom-rule-placeholder' : ''}">
        <div class="rule-icon-box">${rule.icon || '📌'}</div>
        <div class="rule-info">
          <div class="rule-title">${escapeHtml(rule.title)}</div>
          <div class="rule-sub">${escapeHtml(rule.desc)}</div>
        </div>
        <span class="rule-status-badge ${badgeClass}">${escapeHtml(rule.status)}</span>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function renderBuilderAllocationMatrix() {
  const thead = document.getElementById('builderMatrixThead');
  const tbody = document.getElementById('builderMatrixTbody');
  if (!thead || !tbody) return;

  const subjects = appEntities?.subjects || [];
  const teachers = appEntities?.teachers && appEntities.teachers.length > 0
    ? [...appEntities.teachers]
    : Object.keys(builderTeacherAllocations);

  let headerHtml = '<tr>';
  headerHtml += `<th class="teacher-col-header">Teacher Name</th>`;
  builderMatrixClasses.forEach(cls => {
    headerHtml += `<th style="text-align: center;">${escapeHtml(cls)}</th>`;
  });
  headerHtml += `
    <th style="width: 110px; text-align: center;">
      <button type="button" class="matrix-add-class-btn" onclick="window.openBuilderAddClassModal()">
        + Add Class
      </button>
    </th>
  `;
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;

  if (teachers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${builderMatrixClasses.length + 2}" style="text-align: center; color: #94a3b8; padding: 24px;">No teachers found. Add teachers in Teacher's Database first.</td></tr>`;
    return;
  }

  let bodyHtml = '';
  teachers.forEach(teacher => {
    bodyHtml += '<tr>';
    bodyHtml += `<td class="teacher-name-cell">${escapeHtml(teacher)}</td>`;

    builderMatrixClasses.forEach(cls => {
      const alloc = builderTeacherAllocations[teacher]?.[cls] || { subject: '__none__', periods: 0 };
      const isNone = alloc.subject === '__none__' || alloc.periods === 0;

      let subOptions = `<option value="__none__" ${isNone ? 'selected' : ''}>No Teaching Period</option>`;
      subjects.forEach(s => {
        subOptions += `<option value="${escapeHtml(s)}" ${(!isNone && alloc.subject === s) ? 'selected' : ''}>${escapeHtml(s)}</option>`;
      });

      bodyHtml += `
        <td class="builder-matrix-cell">
          <div class="matrix-cell-box ${isNone ? 'no-teaching' : ''}" id="box_${cleanDomId(teacher)}_${cleanDomId(cls)}">
            <select class="matrix-subject-select"
                    onchange="window.handleMatrixSubjectChange('${escapeAttr(teacher)}', '${escapeAttr(cls)}', this.value)">
              ${subOptions}
            </select>
            <input type="number" min="0" max="15"
                   class="matrix-period-input"
                   id="inp_${cleanDomId(teacher)}_${cleanDomId(cls)}"
                   value="${isNone ? 0 : alloc.periods}"
                   ${isNone ? 'disabled' : ''}
                   title="Weekly periods"
                   onchange="window.handleMatrixPeriodChange('${escapeAttr(teacher)}', '${escapeAttr(cls)}', parseInt(this.value) || 0)">
          </div>
        </td>
      `;
    });

    bodyHtml += `<td style="text-align: center; color: #cbd5e1;">-</td>`;
    bodyHtml += '</tr>';
  });

  tbody.innerHTML = bodyHtml;
}

function cleanDomId(str) {
  return (str || '').replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.openBuilderAddClassModal = function() {
  const modal = document.getElementById('builderAddClassModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('builderNewClassNameInput')?.focus();
  }
};

window.handleMatrixSubjectChange = function(teacher, className, subject) {
  if (!builderTeacherAllocations[teacher]) builderTeacherAllocations[teacher] = {};
  if (!builderTeacherAllocations[teacher][className]) {
    builderTeacherAllocations[teacher][className] = { subject: '__none__', periods: 0 };
  }

  const alloc = builderTeacherAllocations[teacher][className];
  const box = document.getElementById(`box_${cleanDomId(teacher)}_${cleanDomId(className)}`);
  const input = document.getElementById(`inp_${cleanDomId(teacher)}_${cleanDomId(className)}`);

  if (subject === '__none__') {
    alloc.subject = '__none__';
    alloc.periods = 0;
    if (box) box.classList.add('no-teaching');
    if (input) {
      input.value = 0;
      input.disabled = true;
    }
  } else {
    alloc.subject = subject;
    // Auto default periods based on rules if previously 0
    if (alloc.periods === 0) {
      const isHS = isHighSchoolClass(className);
      const isRel = isReligionSubject(subject);
      const isArts = isArtOrMusicSubject(subject);
      if (isRel) {
        alloc.periods = isHS ? 2 : 3;
      } else if (isArts) {
        alloc.periods = 3;
      } else {
        alloc.periods = 4;
      }
    }
    if (box) box.classList.remove('no-teaching');
    if (input) {
      input.disabled = false;
      input.value = alloc.periods;
    }
  }
};

window.handleMatrixPeriodChange = function(teacher, className, periods) {
  if (!builderTeacherAllocations[teacher]) builderTeacherAllocations[teacher] = {};
  if (!builderTeacherAllocations[teacher][className]) {
    builderTeacherAllocations[teacher][className] = { subject: '__none__', periods: 0 };
  }

  const alloc = builderTeacherAllocations[teacher][className];
  alloc.periods = Math.max(0, periods);

  if (alloc.periods === 0 && alloc.subject !== '__none__') {
    alloc.subject = '__none__';
    const box = document.getElementById(`box_${cleanDomId(teacher)}_${cleanDomId(className)}`);
    const input = document.getElementById(`inp_${cleanDomId(teacher)}_${cleanDomId(className)}`);
    if (box) box.classList.add('no-teaching');
    if (input) input.disabled = true;
  }
};

function populateBuilderPreviewClassSelect() {
  const sel = document.getElementById('builderPreviewClassSelect');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = builderMatrixClasses.map(c => `<option value="${c}">${c}</option>`).join('');

  if (currentVal && builderMatrixClasses.includes(currentVal)) {
    sel.value = currentVal;
  } else if (builderMatrixClasses.length > 0) {
    sel.value = builderMatrixClasses[0];
  }
}

let builderEventsBound = false;
function bindBuilderEvents() {
  if (builderEventsBound) return;
  builderEventsBound = true;

  document.getElementById('builderPreviewClassSelect')?.addEventListener('change', () => {
    if (builderGeneratedMaster) {
      renderBuilderPreview(builderGeneratedMaster, document.getElementById('builderPreviewClassSelect')?.value);
    }
  });

  document.getElementById('btnRunScheduleGenerator')?.addEventListener('click', runClassScheduleGenerator);
  document.getElementById('btnApplyGeneratedSchedule')?.addEventListener('click', applyGeneratedScheduleToMaster);

  document.getElementById('btnBuilderAddClass')?.addEventListener('click', () => {
    window.openBuilderAddClassModal();
  });

  document.getElementById('btnCancelBuilderAddClass')?.addEventListener('click', () => {
    const modal = document.getElementById('builderAddClassModal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('builderAddClassForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newClass = document.getElementById('builderNewClassNameInput')?.value.trim();
    if (!newClass) return;

    if (builderMatrixClasses.includes(newClass)) {
      alert(`Class "${newClass}" already exists in the allocation table.`);
      return;
    }

    builderMatrixClasses.push(newClass);

    Object.keys(builderTeacherAllocations).forEach(t => {
      builderTeacherAllocations[t][newClass] = {
        subject: '__none__',
        periods: 0
      };
    });

    renderBuilderAllocationMatrix();
    populateBuilderPreviewClassSelect();

    const modal = document.getElementById('builderAddClassModal');
    if (modal) modal.style.display = 'none';
    e.target.reset();

    triggerCelebration();
    alert(`Class "${newClass}" added to the timetable allocation matrix!`);
  });

  document.getElementById('btnBuilderResetQuotas')?.addEventListener('click', () => {
    if (confirm("Re-sync all allocations from the current Master Timetable? Any unsaved edits in the matrix will be overwritten.")) {
      initBuilderMatrixData(true);
      renderBuilderAllocationMatrix();
      populateBuilderPreviewClassSelect();
      triggerCelebration();
    }
  });

  document.getElementById('btnAddSchedulingRule')?.addEventListener('click', () => {
    const modal = document.getElementById('addSchedulingRuleModal');
    if (modal) modal.style.display = 'flex';
  });

  document.getElementById('btnCancelAddRule')?.addEventListener('click', () => {
    const modal = document.getElementById('addSchedulingRuleModal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('addSchedulingRuleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('ruleTitleInput')?.value.trim();
    const cat = document.getElementById('ruleCategorySelect')?.value;
    const desc = document.getElementById('ruleDescInput')?.value.trim();

    if (!title || !desc) return;

    const iconMap = {
      teacher: '🧑‍🏫',
      subject: '📖',
      room: '🧪',
      curriculum: '🎯'
    };

    builderCustomRules.splice(builderCustomRules.length - 1, 0, {
      id: `rule_custom_${Date.now()}`,
      title,
      desc,
      icon: iconMap[cat] || '📌',
      status: 'Active',
      active: true
    });

    renderBuilderRulesList();

    const modal = document.getElementById('addSchedulingRuleModal');
    if (modal) modal.style.display = 'none';
    e.target.reset();

    triggerCelebration();
    alert(`Rule "${title}" added successfully! The generator will enforce this rule in current and future runs.`);
  });
}

// High School Tandem Subject Pairs (Rule 3)
// Pairs of subjects that share the exact same scheduled periods in high school classes
const HS_TANDEM_PAIRS = [
  ['ekonomi', 'informatika'],
  ['economy', 'informatika'],
  ['ekonomi', 'it'],
  ['english literature', 'korean language'],
  ['english literature', 'bahasa korea'],
  ['sastra inggris', 'bahasa korea'],
  ['math for science', 'accounting'],
  ['matematika peminatan', 'accounting'],
  ['matematika peminatan', 'akuntansi'],
  ['math for science', 'akuntansi'],
  ['physics', 'geography'],
  ['fisika', 'geografi'],
  ['biology', 'sociology'],
  ['biologi', 'sosiologi'],
  ['sastra indonesia', 'muatan lokal'],
  ['indonesian literature', 'muatan lokal']
];

function normalizeSubjectKey(name) {
  return (name || '').trim().toLowerCase();
}

function areSubjectsTandem(subA, subB) {
  if (!subA || !subB) return false;
  const a = normalizeSubjectKey(subA);
  const b = normalizeSubjectKey(subB);
  if (a === b) return false;

  return HS_TANDEM_PAIRS.some(([p1, p2]) => {
    return (a.includes(p1) && b.includes(p2)) || (a.includes(p2) && b.includes(p1));
  });
}

function isMSFridayFixedSubject(subName) {
  if (!subName) return false;
  const s = normalizeSubjectKey(subName);
  return s.includes('library') || s.includes('perpustakaan') || s.includes('pramuka') || s.includes('scout');
}

function isHSFridayFixedSubject(subName) {
  if (!subName) return false;
  const s = normalizeSubjectKey(subName);
  return s.includes('bta') || s.includes('pl academy') || s.includes('academy') || s.includes('pramuka') || s.includes('scout');
}

// Subject Rule Classifier Helpers
function isReligionSubject(subName) {
  if (!subName) return false;
  const s = subName.toLowerCase();
  return s.includes('religion') || s.includes('agama') || s.includes('islam') ||
    s.includes('christian') || s.includes('kristen') || s.includes('catholic') ||
    s.includes('katolik') || s.includes('buddha') || s.includes('hindu');
}

function isArtOrMusicSubject(subName) {
  if (!subName) return false;
  const s = subName.toLowerCase();
  return s.includes('art') || s.includes('music') || s.includes('seni') || s.includes('tari') || s.includes('rupa');
}

function getGradeLevel(className) {
  const match = (className || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Period Chunking Engine according to School Rules:
 * - 5 periods -> [2, 2, 1] on separate days
 * - 4 periods -> [2, 2] on separate days
 * - 3 periods -> [3] in one day; fallback [2, 1] (except MS religion & arts which must be 3)
 * - 2 periods -> [2] in one day
 * - 1 period  -> [1]
 */
function decomposeSubjectPeriods(subject, totalPeriods, className) {
  const isHS = isHighSchoolClass(className);
  const isMS = isMiddleSchoolClass(className);
  const isRel = isReligionSubject(subject);
  const isArt = isArtOrMusicSubject(subject);

  // Middle school religion & arts strictly 3
  if (isMS && (isRel || isArt)) {
    return [3];
  }
  // High school religion is 2 periods
  if (isHS && isRel) {
    return [2];
  }

  if (totalPeriods === 5) return [2, 2, 1];
  if (totalPeriods === 4) return [2, 2];
  if (totalPeriods === 3) return [3]; // default attempt 3 periods
  if (totalPeriods === 2) return [2];
  if (totalPeriods === 1) return [1];

  // For periods > 5, break down into pairs and singles
  const chunks = [];
  let rem = totalPeriods;
  while (rem >= 2) {
    chunks.push(2);
    rem -= 2;
  }
  if (rem > 0) chunks.push(rem);
  return chunks;
}

/**
 * Automated Schedule Generator & Constraint Solver
 */
function runClassScheduleGenerator() {
  const targetYear = document.getElementById('builderTargetYearSelect')?.value || '2027-2028';
  const classes = builderMatrixClasses || [];

  if (classes.length === 0) {
    alert("No classes found. Please add classes in the allocation table first.");
    return;
  }

  const btn = document.getElementById('btnRunScheduleGenerator');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block; animation: spin 1s infinite linear;">⚙️</span> Solving Timetable...`;
  }

  setTimeout(() => {
    try {
      const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
      const periodsPerDay = timeSlots.filter(s => !s.isBreak); // Period 1 to 9 (Slot IDs: 1,2,3, 5,6,7, 9,10,11)

      // Available continuous block intervals per day (avoid crossing BREAK or LUNCH)
      // Morning block 1: periods 1..3 (slots 1, 2, 3)
      // Midday block 2:  periods 4..6 (slots 5, 6, 7)
      // Afternoon block: periods 7..9 (slots 9, 10, 11)
      const continuousBlocks = [
        [1, 2, 3],
        [5, 6, 7],
        [9, 10, 11]
      ];

      const generated = {};
      classes.forEach(c => {
        generated[c] = {};
        days.forEach(d => {
          generated[c][d] = {};
        });
      });

      // teacherOccupancy[day][slotId] = Set(teacherNames)
      const teacherOccupancy = {};
      days.forEach(d => {
        teacherOccupancy[d] = {};
        periodsPerDay.forEach(slot => {
          teacherOccupancy[d][slot.id] = new Set();
        });
      });

      const errorAlerts = [];
      let totalAssignedPeriods = 0;
      let totalExpectedPeriods = 0;

      // Group classes by Grade Level for parallel block scheduling (Rule 1, 2, 3)
      const gradeGroups = {};
      classes.forEach(cls => {
        const grade = getGradeLevel(cls);
        if (!gradeGroups[grade]) gradeGroups[grade] = [];
        gradeGroups[grade].push(cls);
      });

      // Track occupied slots per class: classOccupied[className][day][slotId] = boolean
      const classOccupied = {};
      classes.forEach(cls => {
        classOccupied[cls] = {};
        days.forEach(d => {
          classOccupied[cls][d] = {};
        });
      });

      // -------------------------------------------------------------
      // PRE-PHASE 0: Fixed Friday Slots (Rules 1 & 2)
      // Rule 1: Library / Pramuka strictly Friday Period 1 (slot 1) for Middle School (Grades 7, 8, 9)
      // Rule 2: BTA / Pramuka / PL Academy strictly Friday Periods 1 & 2 (slots 1 & 2) for High School (Grades 10, 11, 12)
      // -------------------------------------------------------------
      classes.forEach(className => {
        const grade = getGradeLevel(className);
        const isMS = grade >= 7 && grade <= 9;
        const isHS = grade >= 10 && grade <= 12;

        if (isMS) {
          // Find any allocated teacher for Library or Pramuka
          Object.keys(builderTeacherAllocations).forEach(teacherName => {
            const alloc = builderTeacherAllocations[teacherName]?.[className];
            if (alloc && isMSFridayFixedSubject(alloc.subject) && alloc.periods > 0) {
              const tLower = teacherName.trim().toLowerCase();
              // Slot 1 is Friday Period 1
              if (!classOccupied[className]['FRIDAY'][1] && !teacherOccupancy['FRIDAY'][1].has(tLower)) {
                classOccupied[className]['FRIDAY'][1] = true;
                generated[className]['FRIDAY'][1] = [{
                  subject: alloc.subject,
                  teacher: teacherName
                }];
                teacherOccupancy['FRIDAY'][1].add(tLower);
              } else {
                errorAlerts.push(`${className}: Friday Period 1 conflict placing fixed subject ${alloc.subject} (${teacherName}).`);
              }
            }
          });
        }

        if (isHS) {
          // Find any allocated teacher for BTA / Pramuka / PL Academy
          Object.keys(builderTeacherAllocations).forEach(teacherName => {
            const alloc = builderTeacherAllocations[teacherName]?.[className];
            if (alloc && isHSFridayFixedSubject(alloc.subject) && alloc.periods > 0) {
              const tLower = teacherName.trim().toLowerCase();
              // Slots 1 and 2 are Friday Periods 1 and 2
              const canPlaceSlot1 = !classOccupied[className]['FRIDAY'][1] && !teacherOccupancy['FRIDAY'][1].has(tLower);
              const canPlaceSlot2 = !classOccupied[className]['FRIDAY'][2] && !teacherOccupancy['FRIDAY'][2].has(tLower);

              if (canPlaceSlot1 && canPlaceSlot2) {
                [1, 2].forEach(sId => {
                  classOccupied[className]['FRIDAY'][sId] = true;
                  if (!generated[className]['FRIDAY'][sId]) generated[className]['FRIDAY'][sId] = [];
                  generated[className]['FRIDAY'][sId].push({
                    subject: alloc.subject,
                    teacher: teacherName
                  });
                  teacherOccupancy['FRIDAY'][sId].add(tLower);
                });
              } else {
                errorAlerts.push(`${className}: Friday Periods 1 & 2 conflict placing fixed subject ${alloc.subject} (${teacherName}).`);
              }
            }
          });
        }
      });

      // -------------------------------------------------------------
      // PHASE 1: Synchronized Parallel Blocks (Religion & Arts)
      // -------------------------------------------------------------
      Object.keys(gradeGroups).forEach(gradeKey => {
        const grade = parseInt(gradeKey, 10);
        const parallelClasses = gradeGroups[grade];
        const isMS = grade >= 7 && grade <= 9;
        const isHS = grade >= 10 && grade <= 12;

        // 1A. Synchronize Middle School Religion (Rule 1: 3 periods, exact same period across 7A, 7B, 7C, etc.)
        if (isMS) {
          scheduleSynchronizedElectiveGroup({
            grade,
            classes: parallelClasses,
            blockLength: 3,
            isSubjectMatch: (sub) => isReligionSubject(sub),
            groupName: `Grade ${grade} Religion Combined Block`,
            days,
            continuousBlocks,
            generated,
            classOccupied,
            teacherOccupancy,
            errorAlerts
          });

          // 1B. Synchronize Middle School Music & Art (Rule 2: 3 periods, exact same period across parallel classes)
          scheduleSynchronizedElectiveGroup({
            grade,
            classes: parallelClasses,
            blockLength: 3,
            isSubjectMatch: (sub) => isArtOrMusicSubject(sub),
            groupName: `Grade ${grade} Music & Art Parallel Block`,
            days,
            continuousBlocks,
            generated,
            classOccupied,
            teacherOccupancy,
            errorAlerts
          });
        }

        // 1C. Synchronize High School Seni Musik, Seni Tari, Seni Rupa (Rule 3: 3 periods, exact same period)
        if (isHS) {
          scheduleSynchronizedElectiveGroup({
            grade,
            classes: parallelClasses,
            blockLength: 3,
            isSubjectMatch: (sub) => isArtOrMusicSubject(sub),
            groupName: `Grade ${grade} Seni Musik/Tari/Rupa Parallel Block`,
            days,
            continuousBlocks,
            generated,
            classOccupied,
            teacherOccupancy,
            errorAlerts
          });

          // High School Religion (Rule 7: 2 periods)
          scheduleSynchronizedElectiveGroup({
            grade,
            classes: parallelClasses,
            blockLength: 2,
            isSubjectMatch: (sub) => isReligionSubject(sub),
            groupName: `Grade ${grade} Religion Parallel Block`,
            days,
            continuousBlocks,
            generated,
            classOccupied,
            teacherOccupancy,
            errorAlerts
          });
        }
      });

      // -------------------------------------------------------------
      // PHASE 1D: High School Tandem Subject Pairs (Rule 3)
      // Tandem electives take the SAME schedule slots for each class
      // -------------------------------------------------------------
      classes.forEach(className => {
        const grade = getGradeLevel(className);
        const isHS = grade >= 10 && grade <= 12;
        if (!isHS) return;

        // Gather all assigned subjects and teachers for this HS class
        const classAllocs = [];
        Object.keys(builderTeacherAllocations).forEach(teacherName => {
          const alloc = builderTeacherAllocations[teacherName]?.[className];
          if (alloc && alloc.subject !== '__none__' && alloc.periods > 0) {
            classAllocs.push({
              teacher: teacherName,
              subject: alloc.subject,
              periods: alloc.periods
            });
          }
        });

        // Find pairs in this class that match tandem definitions
        const pairedIndices = new Set();
        const tandemPairsForClass = [];

        for (let i = 0; i < classAllocs.length; i++) {
          if (pairedIndices.has(i)) continue;
          for (let j = i + 1; j < classAllocs.length; j++) {
            if (pairedIndices.has(j)) continue;
            if (areSubjectsTandem(classAllocs[i].subject, classAllocs[j].subject)) {
              tandemPairsForClass.push({
                itemA: classAllocs[i],
                itemB: classAllocs[j],
                periods: Math.min(classAllocs[i].periods, classAllocs[j].periods)
              });
              pairedIndices.add(i);
              pairedIndices.add(j);
              break;
            }
          }
        }

        // Schedule tandem pair blocks simultaneously in identical time slots
        tandemPairsForClass.forEach(pair => {
          const chunks = decomposeSubjectPeriods(pair.itemA.subject, pair.periods, className);
          const tALower = pair.itemA.teacher.trim().toLowerCase();
          const tBLower = pair.itemB.teacher.trim().toLowerCase();
          const subjectDaysUsed = new Set();

          chunks.forEach(chunkLen => {
            let placed = false;
            const prioritizedDays = [...days].sort((a, b) => {
              const aUsed = subjectDaysUsed.has(a) ? 1 : 0;
              const bUsed = subjectDaysUsed.has(b) ? 1 : 0;
              return aUsed - bUsed;
            });

            for (const day of prioritizedDays) {
              if (chunkLen > 1) {
                for (const block of continuousBlocks) {
                  for (let startIdx = 0; startIdx <= block.length - chunkLen; startIdx++) {
                    const candidateSlots = block.slice(startIdx, startIdx + chunkLen);
                    let valid = true;
                    for (const slotId of candidateSlots) {
                      if (classOccupied[className][day][slotId]) {
                        valid = false;
                        break;
                      }
                      if (teacherOccupancy[day][slotId].has(tALower) || teacherOccupancy[day][slotId].has(tBLower)) {
                        valid = false;
                        break;
                      }
                    }
                    if (valid) {
                      candidateSlots.forEach(slotId => {
                        classOccupied[className][day][slotId] = true;
                        generated[className][day][slotId] = [
                          { subject: pair.itemA.subject, teacher: pair.itemA.teacher },
                          { subject: pair.itemB.subject, teacher: pair.itemB.teacher }
                        ];
                        teacherOccupancy[day][slotId].add(tALower);
                        teacherOccupancy[day][slotId].add(tBLower);
                      });
                      subjectDaysUsed.add(day);
                      placed = true;
                      break;
                    }
                  }
                  if (placed) break;
                }
              } else {
                for (const slot of periodsPerDay) {
                  if (!classOccupied[className][day][slot.id] &&
                      !teacherOccupancy[day][slot.id].has(tALower) &&
                      !teacherOccupancy[day][slot.id].has(tBLower)) {
                    classOccupied[className][day][slot.id] = true;
                    generated[className][day][slot.id] = [
                      { subject: pair.itemA.subject, teacher: pair.itemA.teacher },
                      { subject: pair.itemB.subject, teacher: pair.itemB.teacher }
                    ];
                    teacherOccupancy[day][slot.id].add(tALower);
                    teacherOccupancy[day][slot.id].add(tBLower);
                    subjectDaysUsed.add(day);
                    placed = true;
                    break;
                  }
                }
              }
              if (placed) break;
            }

            if (!placed) {
              errorAlerts.push(`${className}: Could not find simultaneous ${chunkLen}-period slot for tandem pair [${pair.itemA.subject} & ${pair.itemB.subject}].`);
            }
          });
        });
      });

      // -------------------------------------------------------------
      // PHASE 2: General Subjects Chunking & Allocation
      // Rules 4, 5, 6: 5->[2,2,1], 4->[2,2], 3->[3] or [2,1]
      // -------------------------------------------------------------
      classes.forEach(className => {
        // Collect remaining unassigned subjects from matrix
        const chunksToPlace = [];

        Object.keys(builderTeacherAllocations).forEach(teacherName => {
          const alloc = builderTeacherAllocations[teacherName]?.[className];
          if (!alloc || alloc.subject === '__none__' || alloc.periods <= 0) return;

          totalExpectedPeriods += alloc.periods;

          // Check if already allocated in prior phases (Pre-Phase 0, Phase 1, Phase 1D Tandem)
          let alreadyAssigned = 0;
          days.forEach(d => {
            periodsPerDay.forEach(slot => {
              const assigned = generated[className]?.[d]?.[slot.id];
              if (assigned && assigned.some(e => e.subject === alloc.subject && e.teacher === teacherName)) {
                alreadyAssigned++;
              }
            });
          });

          const remainingPeriods = alloc.periods - alreadyAssigned;
          if (remainingPeriods > 0) {
            const chunks = decomposeSubjectPeriods(alloc.subject, remainingPeriods, className);
            chunks.forEach(chunkLen => {
              chunksToPlace.push({
                subject: alloc.subject,
                teacher: teacherName,
                length: chunkLen
              });
            });
          }
        });

        // Sort chunks: place longer chunks (3, 2) before single periods (1)
        chunksToPlace.sort((a, b) => b.length - a.length);

        // Map to keep track of which days this subject has already been scheduled on (Rule: separate days)
        const subjectDaysUsed = {};

        chunksToPlace.forEach(chunk => {
          if (!subjectDaysUsed[chunk.subject]) subjectDaysUsed[chunk.subject] = new Set();

          const placed = attemptPlaceChunk({
            className,
            chunk,
            subjectDaysUsed: subjectDaysUsed[chunk.subject],
            days,
            continuousBlocks,
            periodsPerDay,
            generated,
            classOccupied,
            teacherOccupancy
          });

          if (!placed) {
            // Fallback for 3-period block: if 3 consecutive fails, try 2 + 1 (Rule 6)
            if (chunk.length === 3 && !isReligionSubject(chunk.subject) && !isArtOrMusicSubject(chunk.subject)) {
              const placedPart1 = attemptPlaceChunk({
                className,
                chunk: { ...chunk, length: 2 },
                subjectDaysUsed: subjectDaysUsed[chunk.subject],
                days,
                continuousBlocks,
                periodsPerDay,
                generated,
                classOccupied,
                teacherOccupancy
              });
              const placedPart2 = attemptPlaceChunk({
                className,
                chunk: { ...chunk, length: 1 },
                subjectDaysUsed: subjectDaysUsed[chunk.subject],
                days,
                continuousBlocks,
                periodsPerDay,
                generated,
                classOccupied,
                teacherOccupancy
              });

              if (!placedPart1 || !placedPart2) {
                errorAlerts.push(`${className}: Could not fully schedule ${chunk.subject} (${chunk.teacher}) - timetable slots congested.`);
              }
            } else {
              errorAlerts.push(`${className}: Could not schedule ${chunk.length}-period block for ${chunk.subject} (${chunk.teacher}) without conflict.`);
            }
          }
        });
      });

      // Count total assigned slots
      classes.forEach(c => {
        days.forEach(d => {
          periodsPerDay.forEach(slot => {
            const entries = generated[c]?.[d]?.[slot.id];
            if (entries && entries.length > 0) totalAssignedPeriods++;
          });
        });
      });

      builderGeneratedMaster = generated;

      // Update UI state & Audit Display
      const emptyState = document.getElementById('builderEmptyState');
      const matrixWrapper = document.getElementById('builderPreviewMatrixWrapper');
      const btnApply = document.getElementById('btnApplyGeneratedSchedule');
      const auditBar = document.getElementById('builderAuditBar');
      const errorNotesContainer = document.getElementById('builderErrorNotesContainer');
      const errorNotesList = document.getElementById('builderErrorNotesList');

      if (emptyState) emptyState.style.display = 'none';
      if (matrixWrapper) matrixWrapper.style.display = 'flex';
      if (btnApply) btnApply.style.display = 'inline-flex';

      if (auditBar) {
        if (errorAlerts.length === 0) {
          auditBar.innerHTML = `
            <span class="audit-badge success">✓ 0 Conflicts Detected</span>
            <span class="audit-summary-text">100% of subject periods and parallel rules fulfilled with 0 collisions for ${targetYear}.</span>
          `;
          if (errorNotesContainer) errorNotesContainer.style.display = 'none';
        } else {
          auditBar.innerHTML = `
            <span class="audit-badge warning">⚠️ ${errorAlerts.length} Allocation Alert(s)</span>
            <span class="audit-summary-text" style="color: #c2410c;">Some subjects could not be fully placed due to period limit constraints.</span>
          `;
          if (errorNotesContainer && errorNotesList) {
            errorNotesContainer.style.display = 'block';
            errorNotesList.innerHTML = errorAlerts.map(err => `<li>${escapeHtml(err)}</li>`).join('');
          }
        }
      }

      const activeClass = document.getElementById('builderPreviewClassSelect')?.value || classes[0];
      renderBuilderPreview(generated, activeClass);
      triggerCelebration();

    } catch (err) {
      console.error("Generator error:", err);
      alert("Error generating schedule: " + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Generate Schedule</span>
        `;
      }
    }
  }, 400);
}

/**
 * Phase 1 Helper: Find and schedule a synchronized slot window across parallel classes
 */
function scheduleSynchronizedElectiveGroup(options) {
  const {
    grade,
    classes,
    blockLength,
    isSubjectMatch,
    groupName,
    days,
    continuousBlocks,
    generated,
    classOccupied,
    teacherOccupancy,
    errorAlerts
  } = options;

  // Gather all parallel class teachers for this subject category
  const classAssignments = {};
  let anyClassNeeds = false;

  classes.forEach(cls => {
    classAssignments[cls] = [];
    Object.keys(builderTeacherAllocations).forEach(t => {
      const alloc = builderTeacherAllocations[t]?.[cls];
      if (alloc && isSubjectMatch(alloc.subject) && alloc.periods > 0) {
        classAssignments[cls].push({
          teacher: t,
          subject: alloc.subject,
          periods: alloc.periods
        });
        anyClassNeeds = true;
      }
    });
  });

  if (!anyClassNeeds) return;

  // Search for a day and continuous block where ALL parallel classes and their teachers are completely free
  let foundDay = null;
  let foundSlots = null;

  for (const day of days) {
    for (const block of continuousBlocks) {
      for (let startIdx = 0; startIdx <= block.length - blockLength; startIdx++) {
        const candidateSlots = block.slice(startIdx, startIdx + blockLength);

        // Verify if all classes are free and teachers have no collisions
        let valid = true;
        for (const cls of classes) {
          // Check class availability
          for (const slotId of candidateSlots) {
            if (classOccupied[cls][day][slotId]) {
              valid = false;
              break;
            }
          }
          if (!valid) break;

          // Check teacher availability
          const teachers = classAssignments[cls];
          for (const tItem of teachers) {
            const tLower = tItem.teacher.trim().toLowerCase();
            for (const slotId of candidateSlots) {
              if (teacherOccupancy[day][slotId].has(tLower)) {
                valid = false;
                break;
              }
            }
            if (!valid) break;
          }
          if (!valid) break;
        }

        if (valid) {
          foundDay = day;
          foundSlots = candidateSlots;
          break;
        }
      }
      if (foundDay) break;
    }
    if (foundDay) break;
  }

  if (foundDay && foundSlots) {
    // Commit synchronized assignment across all parallel classes
    classes.forEach(cls => {
      const assignList = classAssignments[cls];
      foundSlots.forEach(slotId => {
        classOccupied[cls][foundDay][slotId] = true;

        if (assignList.length > 0) {
          generated[cls][foundDay][slotId] = assignList.map(a => ({
            subject: a.subject,
            teacher: a.teacher
          }));

          assignList.forEach(a => {
            teacherOccupancy[foundDay][slotId].add(a.teacher.trim().toLowerCase());
          });
        }
      });
    });
  } else {
    errorAlerts.push(`Parallel Block: Could not find synchronized ${blockLength}-period window for ${groupName} across ${classes.join(', ')}.`);
  }
}

/**
 * Phase 2 Helper: Attempt to place a chunk [length 1, 2, or 3] on an unused day
 */
function attemptPlaceChunk(options) {
  const {
    className,
    chunk,
    subjectDaysUsed,
    days,
    continuousBlocks,
    periodsPerDay,
    generated,
    classOccupied,
    teacherOccupancy
  } = options;

  const tLower = (chunk.teacher || '').trim().toLowerCase();
  const chunkLen = chunk.length;

  // Prefer days that haven't hosted this subject yet
  const prioritizedDays = [...days].sort((a, b) => {
    const aUsed = subjectDaysUsed.has(a) ? 1 : 0;
    const bUsed = subjectDaysUsed.has(b) ? 1 : 0;
    return aUsed - bUsed;
  });

  for (const day of prioritizedDays) {
    if (chunkLen > 1) {
      // Must fit in a continuous block (avoiding lunch and breaks)
      for (const block of continuousBlocks) {
        for (let startIdx = 0; startIdx <= block.length - chunkLen; startIdx++) {
          const candidateSlots = block.slice(startIdx, startIdx + chunkLen);

          let valid = true;
          for (const slotId of candidateSlots) {
            if (classOccupied[className][day][slotId]) {
              valid = false;
              break;
            }
            if (tLower && teacherOccupancy[day][slotId].has(tLower)) {
              valid = false;
              break;
            }
          }

          if (valid) {
            // Commit chunk placement
            candidateSlots.forEach(slotId => {
              classOccupied[className][day][slotId] = true;
              generated[className][day][slotId] = [{
                subject: chunk.subject,
                teacher: chunk.teacher
              }];
              if (tLower) teacherOccupancy[day][slotId].add(tLower);
            });
            subjectDaysUsed.add(day);
            return true;
          }
        }
      }
    } else {
      // Single period placement (any free period)
      for (const slot of periodsPerDay) {
        if (!classOccupied[className][day][slot.id] && (!tLower || !teacherOccupancy[day][slot.id].has(tLower))) {
          classOccupied[className][day][slot.id] = true;
          generated[className][day][slot.id] = [{
            subject: chunk.subject,
            teacher: chunk.teacher
          }];
          if (tLower) teacherOccupancy[day][slot.id].add(tLower);
          subjectDaysUsed.add(day);
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Preview Renderer with Consecutive Cell Merging (Rowspan)
 * Merges consecutive periods having the exact same subject
 */
function renderBuilderPreview(generatedData, className) {
  const tbody = document.getElementById('builderPreviewTableBody');
  const subtitle = document.getElementById('builderPreviewSubtitle');
  if (!tbody) return;

  if (subtitle) {
    subtitle.textContent = `Previewing generated timetable for ${className}`;
  }

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  tbody.innerHTML = '';

  const skipCells = {
    MONDAY: 0,
    TUESDAY: 0,
    WEDNESDAY: 0,
    THURSDAY: 0,
    FRIDAY: 0
  };

  timeSlots.forEach((slot, sIndex) => {
    const tr = document.createElement('tr');

    if (slot.isBreak) {
      tr.className = 'break-row';
      let html = `<td class="time-cell break-time">${slot.time}</td>`;
      html += `<td colspan="5" class="break-label"><span class="break-pill">${slot.label || 'BREAK'}</span></td>`;
      tr.innerHTML = html;
      tbody.appendChild(tr);
      return;
    }

    let rowHtml = `<td class="time-cell"><div class="period-num">P${slot.period}</div><div class="time-range">${slot.time}</div></td>`;

    days.forEach(day => {
      if (skipCells[day] > 0) {
        skipCells[day]--;
        return; // Cell merged from above row
      }

      const entries = generatedData?.[className]?.[day]?.[slot.id] || [];

      if (entries.length > 0) {
        // Calculate consecutive matching rowspan (merge consecutive periods with exact same subjects & teachers)
        let rowspan = 1;
        const entryKey = entries.map(e => `${e.subject}__${e.teacher}`).sort().join('||');

        for (let i = sIndex + 1; i < timeSlots.length; i++) {
          const nextSlot = timeSlots[i];
          if (nextSlot.isBreak) break;

          const nextEntries = generatedData?.[className]?.[day]?.[nextSlot.id] || [];
          const nextKey = nextEntries.map(e => `${e.subject}__${e.teacher}`).sort().join('||');

          if (nextKey && nextKey === entryKey) {
            rowspan++;
          } else {
            break;
          }
        }

        if (rowspan > 1) {
          skipCells[day] = rowspan - 1;
        }

        const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}" class="slot-cell builder-merged-cell"` : ` class="slot-cell"`;
        const periodSpanBadge = rowspan > 1 ? `<span class="builder-period-badge">${rowspan} Periods</span>` : '';

        if (entries.length === 1) {
          const item = entries[0];
          rowHtml += `
            <td${rowspanAttr}>
              <div class="builder-cell-content">
                <span class="builder-cell-subject">${escapeHtml(item.subject || '-')}</span>
                <span class="builder-cell-teacher">${escapeHtml(item.teacher || '')}</span>
                ${periodSpanBadge}
              </div>
            </td>
          `;
        } else {
          // Parallel split group (e.g. combined elective / religion track)
          let subListHtml = entries.map(e => `
            <div style="margin-bottom: 2px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px;">
              <span class="builder-cell-subject" style="font-size: 11px;">${escapeHtml(e.subject)}</span>
              <span class="builder-cell-teacher" style="font-size: 10px; display: block;">${escapeHtml(e.teacher)}</span>
            </div>
          `).join('');

          rowHtml += `
            <td${rowspanAttr}>
              <div class="builder-cell-content">
                ${subListHtml}
                ${periodSpanBadge}
              </div>
            </td>
          `;
        }
      } else {
        rowHtml += `<td class="slot-cell empty-slot"><span class="empty-dash">-</span></td>`;
      }
    });

    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
}

async function applyGeneratedScheduleToMaster() {
  if (!builderGeneratedMaster) {
    alert("Please generate a schedule first before applying.");
    return;
  }

  const targetYear = document.getElementById('builderTargetYearSelect')?.value || 'Upcoming Year';
  const confirmMsg = `Are you sure you want to apply the generated schedule to the Master Timetable for ${targetYear}?\n\nThis will update class and teacher schedules in the system.`;

  if (!confirm(confirmMsg)) return;

  try {
    const btn = document.getElementById('btnApplyGeneratedSchedule');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving to Master...';
    }

    Object.keys(builderGeneratedMaster).forEach(cls => {
      masterSchedules[cls] = builderGeneratedMaster[cls];
    });

    await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);

    renderClassSchedule();
    renderTeacherView();
    renderEntityTables();
    renderManageScheduleTable();

    triggerCelebration();
    alert(`Success! Generated schedule has been applied to the Master Timetable for ${targetYear}.`);
  } catch (err) {
    console.error("Apply schedule error:", err);
    alert("Failed to apply schedule: " + err.message);
  } finally {
    const btn = document.getElementById('btnApplyGeneratedSchedule');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Apply to Master Timetable';
    }
  }
}


export { initScheduleBuilderView };
