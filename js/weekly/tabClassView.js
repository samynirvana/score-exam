import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml } from "../../utils.js";
import {
  db,
  timeSlots,
  appEntities,
  masterSchedules,
  weeklyOverrides,
  materialsData,
  classNotesData,
  academicCalendar,
  isClassEditMode,
  setIsClassEditMode,
  draftWeeklySchedule,
  setDraftWeeklySchedule,
  draftWeeklyMaterials,
  setDraftWeeklyMaterials,
  draftWeeklyUniforms,
  setDraftWeeklyUniforms,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName,
  canUserEditClass,
  isMiddleSchoolClass,
  isHighSchoolClass,
  getFridayMiddleSchoolTime,
  getDefaultUniforms,
  updateUniformBadges,
  sortWeeks,
  formatModernDateRange,
  formatPrintDateRange,
  getActiveCalendarPrefix,
  getSlotAssignments
} from "./weeklyState.js";
import { renderTeacherView } from "./tabTeacherView.js";
import { updateClassEditButtonState, updateClassDaySelectOptions, populateCalendarSelects } from "../../weekly.js";

export {
  getSubjectGroupType,
  isSameSubjectGroup,
  areSlotAssignmentsMatching,
  getSubjectPastelObject,
  getSubjectPastelStyle,
  enterClassEditMode,
  exitClassEditMode,
  renderClassSchedule,
  saveClassWeeklySchedule,
  resetClassWeeklySchedule,
  exportWeeklyToExcel
};

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
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" }, // 0: Vivid Soft Sky Blue (Math / Logic)
  { bg: "#dcfce7", border: "#86efac", text: "#14532d" }, // 1: Crisp Soft Emerald Green (Science / Biology)
  { bg: "#fce7f3", border: "#f472b6", text: "#831843" }, // 2: Distinct Rose Pink (Indonesian / Language)
  { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" }, // 3: Warm Apricot Orange (Social / IPS)
  { bg: "#f3e8ff", border: "#c084fc", text: "#581c87" }, // 4: Rich Lavender Purple (English / Foreign Lang)
  { bg: "#fef9c3", border: "#facc15", text: "#713f12" }, // 5: Sunny Butter Yellow (Civics / PPKn)
  { bg: "#cffafe", border: "#22d3ee", text: "#164e63" }, // 6: Deep Aquamarine / Cyan (Physics / Chemistry)
  { bg: "#ede9fe", border: "#a78bfa", text: "#4c1d95" }, // 7: Royal Indigo / Violet (Counseling / BK)
  { bg: "#fee2e2", border: "#f87171", text: "#7f1d1d" }, // 8: Distinct Soft Coral Crimson (PE / Olahraga)
  { bg: "#ecfccb", border: "#a3e635", text: "#365314" }, // 9: Fresh Bright Lime (ICT / Technology)
  { bg: "#ccfbf1", border: "#2dd4bf", text: "#134e4a" }, // 10: Mint Teal (Religion / Character)
  { bg: "#fae8ff", border: "#e879f9", text: "#701a75" }, // 11: Vibrant Magenta Orchid (Literature)
  { bg: "#e0e7ff", border: "#818cf8", text: "#312e81" }, // 12: Classic Slate Periwinkle (History / Geografi)
  { bg: "#fef3c7", border: "#fbbf24", text: "#78350f" }, // 13: Warm Amber Ochre (Art & Music)
  { bg: "#f1f5f9", border: "#94a3b8", text: "#0f172a" }, // 14: Polished Platinum Gray (Homeroom / General)
  { bg: "#d1fae5", border: "#34d399", text: "#064e3b" }  // 15: Seafoam Sage
];

// Curated high-readability color presets for standard subjects
const PRESET_SUBJECT_COLORS = {
  // Mathematics
  'math': { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  'mathematics': { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  'matematika': { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },

  // English
  'english': { bg: "#f3e8ff", border: "#c084fc", text: "#581c87" },
  'bahasa inggris': { bg: "#f3e8ff", border: "#c084fc", text: "#581c87" },

  // Indonesian
  'indonesian': { bg: "#fce7f3", border: "#f472b6", text: "#831843" },
  'bahasa indonesia': { bg: "#fce7f3", border: "#f472b6", text: "#831843" },

  // Sciences (Science, IPA, Biology, Physics, Chemistry)
  'science': { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  'ipa': { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  'biology': { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  'biologi': { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
  'physics': { bg: "#cffafe", border: "#22d3ee", text: "#164e63" },
  'fisika': { bg: "#cffafe", border: "#22d3ee", text: "#164e63" },
  'chemistry': { bg: "#fae8ff", border: "#e879f9", text: "#701a75" },
  'kimia': { bg: "#fae8ff", border: "#e879f9", text: "#701a75" },

  // Social Studies (Social, IPS, History, Geography, Economics)
  'social': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },
  'ips': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },
  'history': { bg: "#e0e7ff", border: "#818cf8", text: "#312e81" },
  'sejarah': { bg: "#e0e7ff", border: "#818cf8", text: "#312e81" },
  'geography': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },
  'geografi': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },
  'economics': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },
  'ekonomi': { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12" },

  // Physical Education
  'pe': { bg: "#fee2e2", border: "#f87171", text: "#7f1d1d" },
  'pjok': { bg: "#fee2e2", border: "#f87171", text: "#7f1d1d" },
  'olahraga': { bg: "#fee2e2", border: "#f87171", text: "#7f1d1d" },
  'physical education': { bg: "#fee2e2", border: "#f87171", text: "#7f1d1d" },

  // Civics / PPKn
  'ppkn': { bg: "#fef9c3", border: "#facc15", text: "#713f12" },
  'pkn': { bg: "#fef9c3", border: "#facc15", text: "#713f12" },
  'civics': { bg: "#fef9c3", border: "#facc15", text: "#713f12" },

  // ICT / Computer / Technology
  'ict': { bg: "#ecfccb", border: "#a3e635", text: "#365314" },
  'informatika': { bg: "#ecfccb", border: "#a3e635", text: "#365314" },
  'komputer': { bg: "#ecfccb", border: "#a3e635", text: "#365314" },
  'tik': { bg: "#ecfccb", border: "#a3e635", text: "#365314" },

  // Counseling / BK
  'bk': { bg: "#ede9fe", border: "#a78bfa", text: "#4c1d95" },
  'bimbingan konseling': { bg: "#ede9fe", border: "#a78bfa", text: "#4c1d95" },

  // Chinese / Mandarin
  'mandarin': { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
  'chinese': { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" }
};

const dynamicSubjectColorMap = {};

function getSubjectPastelObject(subjectName) {
  if (!subjectName) return { bg: "#FFFFFF", border: "#CBD5E1", text: "#0F172A" };
  const key = subjectName.trim().toLowerCase();
  const groupType = getSubjectGroupType(subjectName);

  // Group Overrides: All Religion subjects get distinct Teal
  if (groupType === 'religion') {
    return { bg: "#ccfbf1", border: "#2dd4bf", text: "#134e4a" };
  }

  // Group Overrides: All Art & Music subjects get distinct Warm Amber
  if (groupType === 'art') {
    return { bg: "#fef3c7", border: "#fbbf24", text: "#78350f" };
  }

  // Check direct preset matches
  if (PRESET_SUBJECT_COLORS[key]) {
    return PRESET_SUBJECT_COLORS[key];
  }
  // Check substring matches for compound subject names (e.g., "Math - Advanced" or "Bahasa Inggris Wajib")
  for (const [presetKey, colorObj] of Object.entries(PRESET_SUBJECT_COLORS)) {
    if (key.includes(presetKey)) {
      return colorObj;
    }
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
  return `background-color: ${p.bg}; border: 1px solid #000000; color: ${p.text};`;
}

function enterClassEditMode() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  if (!selectedClass || !canUserEditClass(selectedClass)) {
    alert("You do not have permission to edit the schedule for this class.");
    return;
  }
  setIsClassEditMode(true);
  initDraftWeeklyData(selectedClass, getActiveCalendarPrefix('class'));
  updateClassEditButtonState();
  renderClassSchedule();
}

function exitClassEditMode(discardChanges = true) {
  if (discardChanges) {
    setDraftWeeklySchedule(null);
    setDraftWeeklyMaterials({});
  }
  setIsClassEditMode(false);
  updateClassEditButtonState();
  renderClassSchedule();
}

function initDraftWeeklyData(selectedClass, calPrefix) {
  setDraftWeeklySchedule({});
  setDraftWeeklyMaterials({});
  const overrideKey = `${calPrefix}_${selectedClass}`;
  const defaultUniforms = getDefaultUniforms(selectedClass);
  const savedUniforms = weeklyOverrides?.[overrideKey]?.uniforms || {};
  setDraftWeeklyUniforms({ ...defaultUniforms, ...savedUniforms });

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
    if (!weeklyOverrides) setWeeklyOverrides({});
    weeklyOverrides[overrideKey] = {
      schedule: draftWeeklySchedule,
      uniforms: draftWeeklyUniforms
    };

    // Save weekly overrides
    await setDoc(doc(db, "schedules", "weeklyOverrides"), weeklyOverrides, { merge: true });

    // Save materials
    if (Object.keys(draftWeeklyMaterials).length > 0) {
      const matDocRef = doc(db, "schedules", "materialsData");
      const latestMatSnap = await getDoc(matDocRef);
      const remoteMaterials = latestMatSnap.exists() ? latestMatSnap.data() : {};
      const mergedMaterials = { ...remoteMaterials, ...draftWeeklyMaterials };
      setMaterialsData(mergedMaterials);
      await setDoc(matDocRef, mergedMaterials, { merge: true });
    }

    alert(`Weekly schedule, uniforms & materials saved successfully for ${selectedClass} (${week})!`);
    setIsClassEditMode(false);
    setDraftWeeklySchedule(null);
    setDraftWeeklyMaterials({});
    setDraftWeeklyUniforms({});
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
    setIsClassEditMode(false);
    setDraftWeeklySchedule(null);
    setDraftWeeklyMaterials({});
    setDraftWeeklyUniforms({});
    updateClassEditButtonState();
    renderClassSchedule();
    renderTeacherView();
  } catch (err) {
    alert("Error resetting schedule: " + err.message);
  }
}


let weeklyResponsiveInitialized = false;

function syncWeeklyWorkspace() {
  const week = document.getElementById('classWeekSelect');
  const day = document.getElementById('classDaySelect');
  if (!week || !day) return;
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  if (!weeklyResponsiveInitialized && week.options.length) {
    weeklyResponsiveInitialized = true;
    if (matchMedia('(max-width: 700px)').matches && !isClassEditMode) day.value = days[Math.min(4, Math.max(0, new Date().getDay() - 1))];
  }
  const year = document.getElementById('classYearSelect').value;
  const theme = document.getElementById('classThemeSelect').value;
  const weeks = academicCalendar[year]?.[theme] || {};
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const currentWeek = [...week.options].find(option => { const dates = weeks[option.value]; return dates?.startDate <= today && dates?.endDate >= today; });
  document.getElementById('weeklyWorkspaceTitle').textContent = `${document.getElementById('classSelectView').value || 'Class'} · Weekly Schedule`;
  document.getElementById('weeklyWorkspaceSubtitle').textContent = [theme, week.value, weeks[week.value]?.startDate ? formatModernDateRange(weeks[week.value].startDate, weeks[week.value].endDate) : ''].filter(Boolean).join(' · ');
  const previous = document.getElementById('weeklyPrevious'), next = document.getElementById('weeklyNext'), todayBtn = document.getElementById('weeklyToday') || document.getElementById('classDateBadge');
  if (previous) previous.disabled = isClassEditMode || week.selectedIndex <= 0;
  if (next) next.disabled = isClassEditMode || week.selectedIndex < 0 || week.selectedIndex >= week.options.length - 1;
  if (todayBtn) {
    if (todayBtn.tagName === 'BUTTON') todayBtn.disabled = isClassEditMode || !currentWeek;
    todayBtn.title = currentWeek ? 'Show this week' : 'This week is outside the selected theme';
  }
  const changeWeek = index => {
    week.selectedIndex = index; week.dispatchEvent(new Event('change', {bubbles:true}));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.getElementById('printableArea').animate([{opacity:.65}, {opacity:1}], {duration:180});
  };
  if (previous) previous.onclick = () => changeWeek(week.selectedIndex - 1);
  if (next) next.onclick = () => changeWeek(week.selectedIndex + 1);
  if (todayBtn) todayBtn.onclick = () => { if (currentWeek && !isClassEditMode) changeWeek(currentWeek.index); };
  ['Day', 'Week'].forEach(mode => {
    const button = document.getElementById(`weekly${mode}View`);
    button.disabled = isClassEditMode;
    button.setAttribute('aria-pressed', String(mode === 'Day' ? day.value !== 'ALL' : day.value === 'ALL'));
    button.onclick = () => { day.value = mode === 'Week' ? 'ALL' : days[Math.min(4, Math.max(0, now.getDay()-1))]; day.dispatchEvent(new Event('change', {bubbles:true})); };
  });
  requestAnimationFrame(() => document.querySelectorAll('#printableArea th.col-day').forEach((header, index) => {
    header.classList.toggle('weekly-is-today', Boolean(currentWeek && currentWeek.value === week.value && days[index] === days[now.getDay()-1]));
  }));
}

function renderClassSchedule() {
  syncWeeklyWorkspace();
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

  const dayFilter = document.getElementById('classDaySelect')?.value || 'ALL';
  const visibleDays = (dayFilter && dayFilter !== 'ALL')
    ? [dayFilter]
    : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const isSingleDay = visibleDays.length === 1;

  // Toggle table compact class
  const tableEl = document.querySelector('#printableArea .schedule-table');
  if (tableEl) {
    tableEl.classList.toggle('day-filtered-table', isSingleDay);
  }

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

      if (isSingleDay) {
        const singleDay = visibleDays[0];
        if (slot.id === 0) {
          html += `<td class="break-label"><span class="break-pill">${slot.label}</span></td>`;
        } else if (slot.id === 4) {
          if (singleDay === 'FRIDAY' && isMiddleSchoolClass(selectedClass)) {
            html += `<td class="break-label break-day-cell">
              <span class="break-pill">BREAK</span>
              <div class="friday-break-note" style="margin-top: 4px; font-weight: 700; color: #be123c; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; font-size: 10px; display: inline-block;">09.40 - 09.55</div>
            </td>`;
          } else {
            html += `<td class="break-label"><span class="break-pill">BREAK</span></td>`;
          }
        } else if (slot.id === 8) {
          if (singleDay === 'FRIDAY') {
            html += `<td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
          } else {
            html += `<td class="break-label"><span class="break-pill">LUNCH</span></td>`;
          }
        } else if (slot.id === 12) {
          if (singleDay === 'FRIDAY') {
            html += `<td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
          } else {
            html += `<td class="break-label"><span class="break-pill">CLOSING</span></td>`;
          }
        } else {
          html += `<td class="break-label"><span class="break-pill">${slot.label}</span></td>`;
        }
      } else {
        // Full week (5 days)
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
      }

      tr.innerHTML = html;
      visibleDays.forEach(day => skipCells[day] = 0);
    } else {
      let html = `<td class="time-cell"><div class="time-range">${slot.time}</div><div class="period-badge">Period ${slot.period}</div></td>`;

      visibleDays.forEach(day => {
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
    <td colspan="${visibleDays.length}" class="notes-content-cell">
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
// Class View Dropdown & Filter Event Listeners
document.getElementById('classSelectView')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});

document.getElementById('classDaySelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});

document.getElementById('classYearSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  populateCalendarSelects();
  updateClassDaySelectOptions();
  renderClassSchedule();
});

document.getElementById('classThemeSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  populateCalendarSelects();
  updateClassDaySelectOptions();
  renderClassSchedule();
});

document.getElementById('classWeekSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  updateClassDaySelectOptions();
  renderClassSchedule();
});


function updateClassPrintHeader(selectedClass) {
  const isHS = isHighSchoolClass(selectedClass);
  const printSchoolName = document.getElementById('printSchoolName');
  if (printSchoolName) {
    printSchoolName.textContent = isHS ? 'MITRA KASIH HIGH SCHOOL' : 'MITRA KASIH MIDDLE SCHOOL';
  }

  const yr = (document.getElementById('classYearSelect')?.value || '2026/2027').replace('-', '/');
  const th = document.getElementById('classThemeSelect')?.value || '';
  const wk = document.getElementById('classWeekSelect')?.value || '';
  const cls = (selectedClass || 'Class').toUpperCase();

  const printSubtitle = document.getElementById('printScheduleSubtitle');
  if (printSubtitle) {
    const parts = [cls, 'WEEKLY SCHEDULE', yr];
    if (th) parts.push(th.toUpperCase());
    if (wk) parts.push(wk.toUpperCase());
    printSubtitle.textContent = parts.join(' ');
  }

  const printDate = document.getElementById('printScheduleDate');
  if (printDate) {
    const rawYr = document.getElementById('classYearSelect')?.value;
    const weekInfo = (rawYr && th && wk && academicCalendar[rawYr]?.[th]?.[wk])
      ? academicCalendar[rawYr][th][wk]
      : null;
    if (weekInfo && weekInfo.startDate && weekInfo.endDate) {
      printDate.textContent = formatPrintDateRange(weekInfo.startDate, weekInfo.endDate);
      printDate.style.display = 'block';
    } else {
      printDate.textContent = '';
      printDate.style.display = 'none';
    }
  }
}

document.getElementById('btnPrintPDF')?.addEventListener('click', async () => {
  if (isClassEditMode) {
    alert('Please save or cancel your schedule edits before printing.');
    return;
  }
  const selectedClass = document.getElementById('classSelectView')?.value;
  const table = document.querySelector('#printableArea .schedule-table');
  if (!selectedClass || !table?.tBodies[0]?.rows.length) {
    alert('Please select a class and wait for its schedule to load before printing.');
    return;
  }
  updateClassPrintHeader(selectedClass);
  const button = document.getElementById('btnPrintPDF');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  document.getElementById('weeklyPrintFrame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'weeklyPrintFrame';
  frame.title = 'Weekly schedule print document';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1120px;height:800px;border:0;';
  const clone = table.cloneNode(true);
  // Preserve the rendered design, including nested subject badges, icons and colors.
  const originals = [table, ...table.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const visualProperties = ['display','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration','white-space','vertical-align','color','background-color','background-image','border-top','border-right','border-bottom','border-left','border-radius','border-collapse','border-spacing','padding','margin','box-sizing','gap','align-items','justify-content','flex-direction'];
  copies.forEach((element, index) => {
    const original = originals[index];
    const style = getComputedStyle(original);
    element.removeAttribute('style');
    visualProperties.forEach(property => element.style.setProperty(property, style.getPropertyValue(property)));
    if (original.matches('th,td')) {
      element.style.width = `${original.getBoundingClientRect().width}px`;
      element.style.height = `${original.getBoundingClientRect().height}px`;
    }
    if (original.matches('svg,img')) {
      element.style.width = style.width; element.style.height = style.height;
    }
  });
  clone.style.width = `${table.getBoundingClientRect().width}px`;
  clone.querySelectorAll('button').forEach(el => el.remove());
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  const header = document.getElementById('printHeaderBanner').cloneNode(true);
  header.querySelectorAll('img').forEach(img => { img.src = new URL(img.getAttribute('src'), document.baseURI).href; });
  const subtitle = document.getElementById('printScheduleSubtitle').textContent;
  const fontLinks = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => link.href.includes('fonts.googleapis.com')).map(link => link.outerHTML).join('');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(subtitle)}</title>${fontLinks}<style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden !important;
    }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: #17233b;
      font: 12px Inter, Arial, sans-serif;
      background: #ffffff;
    }
    #printSheet {
      width: ${table.getBoundingClientRect().width}px;
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    .print-header-banner {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .print-header-logo-side { flex: 0 0 20%; text-align: center; }
    .print-school-logo { width: 100%; max-width: 210px; height: 50px; object-fit: contain; }
    .print-header-center { flex: 1; text-align: center; padding: 0 12px; }
    .print-school-name { font-size: 20px; font-weight: 800; margin-bottom: 2px; color: #0f172a; letter-spacing: 0.5px; line-height: 1.2; }
    .print-schedule-subtitle { font-size: 13px; font-weight: 700; color: #000000; line-height: 1.2; }
    .print-schedule-date { font-size: 13px; font-weight: 700; color: #000000; margin-top: 2px; line-height: 1.2; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse !important; border: 1.5px solid #000000 !important; }
    th, td { position: static !important; border: 1px solid #000000 !important; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    svg { vertical-align: middle; }
  </style></head><body><main id="printSheet">${header.outerHTML}${clone.outerHTML}</main></body></html>`;
  frame.onload = async () => {
    try {
      const printDocument = frame.contentDocument;
      await printDocument.fonts.ready;
      await Promise.all([...printDocument.images].map(img => img.decode().catch(() => {})));
      const sheet = printDocument.getElementById('printSheet');

      // A4 Landscape: 297mm x 210mm.
      // With 6mm margins: Available Width: 285mm, Available Height: 198mm.
      const availWidth = (285 * 96) / 25.4;   // ~1077.17px
      const availHeight = (198 * 96) / 25.4;  // ~748.35px

      const initialRect = sheet.getBoundingClientRect();
      const unscaledWidth = initialRect.width || sheet.scrollWidth || sheet.offsetWidth;
      const unscaledHeight = initialRect.height || sheet.scrollHeight || sheet.offsetHeight;

      if (unscaledWidth > 0 && unscaledHeight > 0) {
        // Calculate scale to maximize paper space while strictly fitting on 1 page (0.97 safety buffer)
        const scaleX = availWidth / unscaledWidth;
        const scaleY = availHeight / unscaledHeight;
        let scale = Math.min(scaleX, scaleY) * 0.97;

        // Cap zoom to 1.45 to prevent oversized cells on small tables
        scale = Math.min(scale, 1.45);
        sheet.style.zoom = String(scale);

        // Verify post-zoom dimensions to guarantee it never exceeds printable height/width (no 2nd page)
        const postZoomRect = sheet.getBoundingClientRect();
        if (postZoomRect.height > availHeight || postZoomRect.width > availWidth) {
          const correction = Math.min(availWidth / postZoomRect.width, availHeight / postZoomRect.height) * 0.98;
          scale = scale * correction;
          sheet.style.zoom = String(scale);
        }
      }

      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (error) {
      console.error('Schedule print failed:', error);
      alert('The print dialog could not open. Please open this page in Chrome or Edge and try again.');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };
  document.body.append(frame);
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

  const printTeacherDate = document.getElementById('printTeacherScheduleDate');
  if (printTeacherDate) {
    const rawYr = document.getElementById('teacherYearSelect')?.value;
    const weekInfo = (rawYr && th && wk && academicCalendar[rawYr]?.[th]?.[wk])
      ? academicCalendar[rawYr][th][wk]
      : null;
    if (weekInfo && weekInfo.startDate && weekInfo.endDate) {
      printTeacherDate.textContent = formatPrintDateRange(weekInfo.startDate, weekInfo.endDate);
      printTeacherDate.style.display = 'block';
    } else {
      printTeacherDate.textContent = '';
      printTeacherDate.style.display = 'none';
    }
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
