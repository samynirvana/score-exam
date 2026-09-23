import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml, triggerCelebration } from "../../utils.js";
import {
  db,
  auth,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName
} from "./weeklyState.js";
import { getDailyQuote } from "../../dailyQuotes.js";


// ==========================================================================
// FLOATING RICH-TEXT TOOLBAR ENGINE (ONLY SHOWS WHEN EDITING TEXT)
// ==========================================================================
let currentRichEditorTarget = null;

function initFloatingRichTextToolbar() {
  const floatingToolbar = document.getElementById('floatingRichTextToolbar');
  if (!floatingToolbar) return;

  // Prevent toolbar buttons/inputs from stealing focus or losing selection
  floatingToolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  // Handle all command buttons on floating toolbar
  floatingToolbar.querySelectorAll('[data-command]').forEach(btn => {
    if (btn._rtAttached) return;
    btn._rtAttached = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-command');
      const val = btn.getAttribute('data-value') || null;

      if (currentRichEditorTarget) {
        currentRichEditorTarget.focus();
      }

      document.execCommand(cmd, false, val);
      updateToolbarState();
    });
  });

  // Color input
  const colorInput = document.getElementById('rtTextColorInput');
  if (colorInput && !colorInput._rtAttached) {
    colorInput._rtAttached = true;
    colorInput.addEventListener('input', (e) => {
      if (currentRichEditorTarget) currentRichEditorTarget.focus();
      document.execCommand('foreColor', false, e.target.value);
      updateToolbarState();
    });
  }

  // Font family dropdown
  const fontFamilySel = document.getElementById('rtFontFamily');
  if (fontFamilySel && !fontFamilySel._rtAttached) {
    fontFamilySel._rtAttached = true;
    fontFamilySel.addEventListener('change', (e) => {
      if (e.target.value) {
        if (currentRichEditorTarget) currentRichEditorTarget.focus();
        document.execCommand('fontName', false, e.target.value);
        fontFamilySel.value = '';
      }
    });
  }

  // Font size dropdown
  const fontSizeSel = document.getElementById('rtFontSize');
  if (fontSizeSel && !fontSizeSel._rtAttached) {
    fontSizeSel._rtAttached = true;
    fontSizeSel.addEventListener('change', (e) => {
      if (e.target.value) {
        if (currentRichEditorTarget) currentRichEditorTarget.focus();
        document.execCommand('fontSize', false, e.target.value);
        fontSizeSel.value = '';
      }
    });
  }

  function updateToolbarState() {
    floatingToolbar.querySelectorAll('[data-command]').forEach(btn => {
      const cmd = btn.getAttribute('data-command');
      try {
        if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(cmd)) {
          if (document.queryCommandState(cmd)) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        }
      } catch (err) {}
    });
  }

  function positionFloatingToolbar(targetEl) {
    if (!floatingToolbar || !targetEl) {
      if (floatingToolbar) floatingToolbar.style.display = 'none';
      return;
    }

    const selection = window.getSelection();
    let rect = null;

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    }

    if (!rect || rect.width === 0 || rect.height === 0) {
      rect = targetEl.getBoundingClientRect();
    }

    if (!rect || (rect.top === 0 && rect.bottom === 0 && rect.width === 0)) {
      floatingToolbar.style.display = 'none';
      return;
    }

    floatingToolbar.style.display = 'flex';
    updateToolbarState();

    const toolbarWidth = floatingToolbar.offsetWidth || 340;
    const toolbarHeight = floatingToolbar.offsetHeight || 42;

    let top = rect.top - toolbarHeight - 8;
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2);

    if (top < 10) {
      top = rect.bottom + 8;
    }

    const maxLeft = window.innerWidth - toolbarWidth - 12;
    if (left < 12) left = 12;
    if (left > maxLeft) left = maxLeft;

    floatingToolbar.style.top = `${Math.max(10, top)}px`;
    floatingToolbar.style.left = `${left}px`;
  }

  // Detect selection or focus in rich-text areas
  document.addEventListener('selectionchange', () => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.classList.contains('rich-text-editor') || activeEl.classList.contains('ts-cell-content') || activeEl.isContentEditable)) {
      currentRichEditorTarget = activeEl;
      positionFloatingToolbar(activeEl);
    } else if (floatingToolbar && !floatingToolbar.contains(document.activeElement)) {
      floatingToolbar.style.display = 'none';
    }
  });

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target && (target.classList.contains('rich-text-editor') || target.classList.contains('ts-cell-content') || target.isContentEditable)) {
      currentRichEditorTarget = target;
      positionFloatingToolbar(target);
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.classList.contains('rich-text-editor') || target.classList.contains('ts-cell-content') || target.isContentEditable)) {
      currentRichEditorTarget = target;
      positionFloatingToolbar(target);
    } else if (floatingToolbar && !floatingToolbar.contains(e.target)) {
      floatingToolbar.style.display = 'none';
    }
  });
}

// Enable horizontal drag-to-scroll on the pill tabs bar
function enablePillsDragScroll() {
  const slider = document.getElementById('teacherScheduleTabsList') || document.getElementById('scheduleTablePillTabs');
  if (!slider || slider._dragAttached) return;
  slider._dragAttached = true;

  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    slider.classList.add('dragging');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('dragging');
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('dragging');
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 4) {
      e.preventDefault();
      slider.scrollLeft = scrollLeft - walk;
    }
  });

  slider.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      slider.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

// ==========================================================================
// ALL-IN-ONE TEACHER SCHEDULES MANAGEMENT (MASTER SCHEDULES HUB)
// ==========================================================================
let customTeacherSchedulesData = {};
let activeScheduleTableId = 'table_prayer';
let activeScheduleCell = null; // { rowIdx, colIdx, colId, td }
let selectedScheduleRange = null; // { startRow, endRow, startCol, endCol }
let isTeacherScheduleEditMode = false; // Controls visibility of column & row delete buttons

const DEFAULT_SCHEDULE_TEMPLATES = [
  {
    id: "table_prayer",
    title: "Daily Prayer Leader & Morning Motivation",
    description: "Weekly rotation for staff morning prayer leading and motivational speech",
    columns: [
      { id: "col_day", name: "Day & Date" },
      { id: "col_prayer", name: "Prayer Leader" },
      { id: "col_motivation", name: "Morning Motivation Speaker" },
      { id: "col_notes", name: "Venue / Remarks" }
    ],
    rows: [
      { id: "r1", col_day: "Monday", col_prayer: "Mr. Syam", col_motivation: "Ms. Sarah", col_notes: "School Hall (07:15 - 07:30)" },
      { id: "r2", col_day: "Tuesday", col_prayer: "Mr. Budi", col_motivation: "Ms. Maria", col_notes: "School Hall (07:15 - 07:30)" },
      { id: "r3", col_day: "Wednesday", col_prayer: "Ms. Linda", col_motivation: "Mr. Anton", col_notes: "School Hall (07:15 - 07:30)" },
      { id: "r4", col_day: "Thursday", col_prayer: "Mr. David", col_motivation: "Ms. Anita", col_notes: "School Hall (07:15 - 07:30)" },
      { id: "r5", col_day: "Friday", col_prayer: "Ms. Cindy", col_motivation: "Mr. Hendra", col_notes: "School Hall (07:15 - 07:30)" }
    ]
  },
  {
    id: "table_duty",
    title: "Teacher Duty Schedule (Jadwal Piket Guru)",
    description: "Daily gate duty, student morning greeting, recess monitoring & dismissal coordination",
    columns: [
      { id: "col_day", name: "Day" },
      { id: "col_gate", name: "Morning Gate / Lobby Duty (06:45 - 07:30)" },
      { id: "col_recess", name: "Break & Cafeteria Supervision (09:40 - 10:00)" },
      { id: "col_dismissal", name: "Dismissal Coordination (14:30 - 15:00)" }
    ],
    rows: [
      { id: "r1", col_day: "Monday", col_gate: "Mr. Syam, Ms. Sarah", col_recess: "Mr. Budi, Ms. Linda", col_dismissal: "Mr. Anton" },
      { id: "r2", col_day: "Tuesday", col_gate: "Mr. Anton, Ms. Maria", col_recess: "Mr. David, Ms. Cindy", col_dismissal: "Mr. Budi" },
      { id: "r3", col_day: "Wednesday", col_gate: "Mr. David, Ms. Anita", col_recess: "Mr. Hendra, Ms. Sarah", col_dismissal: "Mr. Syam" },
      { id: "r4", col_day: "Thursday", col_gate: "Mr. Hendra, Ms. Cindy", col_recess: "Mr. Syam, Ms. Anita", col_dismissal: "Mr. David" },
      { id: "r5", col_day: "Friday", col_gate: "Mr. Budi, Ms. Linda", col_recess: "Mr. Anton, Ms. Maria", col_dismissal: "Mr. Hendra" }
    ]
  },
  {
    id: "table_admin",
    title: "Teacher Administration & Meeting Schedule",
    description: "Lesson plan submissions, module preparation, and department coordination meetings",
    columns: [
      { id: "col_day", name: "Day / Period" },
      { id: "col_agenda", name: "Administrative Agenda / Task" },
      { id: "col_department", name: "Department / Target Staff" },
      { id: "col_deadline", name: "Deadline / Venue" }
    ],
    rows: [
      { id: "r1", col_day: "Every Monday 15:00", col_agenda: "Weekly Evaluation & Subject Coordination Meeting", col_department: "All Teachers & Staff", col_deadline: "Conference Room" },
      { id: "r2", col_day: "Every Wednesday 14:00", col_agenda: "Lesson Plan (RPP) & Assessment Material Submission", col_department: "Subject Teachers", col_deadline: "Curriculum Portal" },
      { id: "r3", col_day: "Every Friday 13:00", col_agenda: "Homeroom Student Mentoring & Reward Nominations", col_department: "Homeroom Teachers", col_deadline: "Homeroom Panel" }
    ]
  }
];

function getTeacherScheduleTables() {
  if (Array.isArray(customTeacherSchedulesData.tables) && customTeacherSchedulesData.tables.length > 0) {
    return customTeacherSchedulesData.tables;
  }
  // Backward compatibility check for older data structures
  const keys = Object.keys(customTeacherSchedulesData);
  for (const k of keys) {
    if (Array.isArray(customTeacherSchedulesData[k]) && customTeacherSchedulesData[k].length > 0) {
      return customTeacherSchedulesData[k];
    }
  }
  return DEFAULT_SCHEDULE_TEMPLATES;
}

// Initialize Firestore Listener for Custom Teacher Schedules
function initTeacherSchedulesFirestoreListener() {
  onSnapshot(doc(db, "schedules", "customTeacherSchedules"), (snapshot) => {
    if (snapshot.exists()) {
      customTeacherSchedulesData = snapshot.data() || {};
    } else {
      customTeacherSchedulesData = {};
    }
    const currentTab = document.querySelector('.tab-content.active')?.id;
    if (currentTab === 'teacherSchedulesView') {
      renderTeacherSchedulesView();
    }
  }, (err) => {
    console.error("Error listening to customTeacherSchedules:", err);
  });
}

function initTeacherSchedulesView() {
  renderTeacherSchedulesView();
}

function renderTeacherSchedulesView() {
  const tables = getTeacherScheduleTables();
  const isSuperAdmin = isAdminUser();

  const adminTabActions = document.getElementById('teacherScheduleAdminTabActions');
  const tableFooterActions = document.getElementById('tsTableFooterActions');

  if (adminTabActions) adminTabActions.style.display = isSuperAdmin ? 'flex' : 'none';
  if (tableFooterActions) tableFooterActions.style.display = isSuperAdmin ? 'flex' : 'none';

  // Ensure valid activeScheduleTableId
  if (!tables.some(t => t.id === activeScheduleTableId)) {
    activeScheduleTableId = tables[0]?.id || 'table_prayer';
  }

  // 1. Render Table Selector Pills
  renderTeacherScheduleTabs(tables);

  // 2. Render Active Table Content
  const activeTable = tables.find(t => t.id === activeScheduleTableId) || tables[0];
  if (activeTable) {
    renderTeacherScheduleTable(activeTable, isSuperAdmin);
  }
}

function renderTeacherScheduleTabs(tables) {
  const container = document.getElementById('teacherScheduleTabsList') || document.getElementById('scheduleTablePillTabs');
  if (!container) return;

  let html = '';
  tables.forEach(table => {
    const isActive = table.id === activeScheduleTableId;
    html += `
      <button type="button" class="schedule-table-pill ${isActive ? 'active' : ''}" onclick="selectTeacherScheduleTable('${table.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
        <span>${escapeHtml(table.title || 'Schedule Table')}</span>
      </button>
    `;
  });

  container.innerHTML = html;
  enablePillsDragScroll();
}

window.selectTeacherScheduleTable = function (tableId) {
  activeScheduleTableId = tableId;
  const tables = getTeacherScheduleTables();
  renderTeacherScheduleTabs(tables);
  const activeTable = tables.find(t => t.id === tableId);
  if (activeTable) {
    renderTeacherScheduleTable(activeTable, isAdminUser());
  }
};

// Toggle Table Edit Mode (Shows/Hides delete buttons on columns & rows)
window.toggleTeacherScheduleEditMode = function () {
  isTeacherScheduleEditMode = !isTeacherScheduleEditMode;
  updateScheduleEditModeUI();
};

function updateScheduleEditModeUI() {
  const tableEl = document.getElementById('teacherScheduleDataTable');
  const btn = document.getElementById('btnToggleEditScheduleTable');
  const btnText = document.getElementById('btnToggleEditScheduleTableText');

  if (tableEl) {
    if (isTeacherScheduleEditMode) {
      tableEl.classList.add('ts-editing-mode');
    } else {
      tableEl.classList.remove('ts-editing-mode');
    }
  }

  if (btn) {
    if (isTeacherScheduleEditMode) {
      btn.classList.add('active');
      if (btnText) btnText.textContent = 'Done Editing';
    } else {
      btn.classList.remove('active');
      if (btnText) btnText.textContent = 'Edit Table';
    }
  }
}

function renderTeacherScheduleTable(table, isSuperAdmin) {
  const titleEl = document.getElementById('tsActiveTableTitle');
  const descEl = document.getElementById('tsActiveTableDescription');
  const tableEl = document.getElementById('teacherScheduleDataTable');

  if (titleEl) {
    titleEl.textContent = table.title || 'Teacher Schedule';
    titleEl.contentEditable = isSuperAdmin ? "true" : "false";
  }
  if (descEl) {
    descEl.textContent = table.description || '';
    descEl.contentEditable = isSuperAdmin ? "true" : "false";
  }

  if (!tableEl) return;

  const cols = table.columns || [];
  const rows = table.rows || [];

  // Render THEAD
  let theadHtml = `<tr><th style="width: 54px; text-align: center;">#</th>`;
  cols.forEach((col, cIdx) => {
    theadHtml += `
      <th>
        <div class="ts-col-header-content">
          <span class="ts-col-title" ${isSuperAdmin ? 'contenteditable="true"' : ''} data-col-idx="${cIdx}" title="${isSuperAdmin ? 'Click to edit column header name' : ''}">${escapeHtml(col.name || 'Column')}</span>
          ${isSuperAdmin ? `
            <button type="button" class="ts-col-del-btn" onclick="deleteScheduleColumn(${cIdx})" title="Delete column '${escapeHtml(col.name)}'">✕</button>
          ` : ''}
        </div>
      </th>
    `;
  });
  if (isSuperAdmin) {
    theadHtml += `
      <th class="ts-col-add-btn-cell" style="width: 38px; text-align: center; background: #f1f5f9;">
        <button type="button" class="action-btn ts-btn-secondary" onclick="addScheduleColumn()" title="Add Column" style="padding: 2px 6px; font-size: 11px; min-width: 24px; border: 1px dashed #cbd5e1;">+</button>
      </th>
    `;
  }
  theadHtml += `</tr>`;

  // Render TBODY (supporting cell merge / colspan / rowspan)
  let tbodyHtml = '';
  if (rows.length === 0) {
    const colSpan = cols.length + (isSuperAdmin ? 2 : 1);
    tbodyHtml = `<tr><td colspan="${colSpan}" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic;">No rows added yet. ${isSuperAdmin ? 'Click "+ Add Row" to start adding schedule entries.' : ''}</td></tr>`;
  } else {
    rows.forEach((row, rIdx) => {
      tbodyHtml += `<tr data-row-idx="${rIdx}" data-row-id="${escapeHtml(row.id || String(rIdx))}">`;
      tbodyHtml += `
        <td class="ts-row-handle-cell">
          <div class="ts-row-handle-content">
            <span>${rIdx + 1}</span>
            ${isSuperAdmin ? `
              <button type="button" class="ts-row-del-btn" onclick="deleteScheduleRow(${rIdx})" title="Delete row #${rIdx + 1}">✕</button>
            ` : ''}
          </div>
        </td>
      `;

      cols.forEach((col, cIdx) => {
        const cellProps = row._cellProps?.[col.id] || {};
        if (cellProps.hidden) {
          return; // Skip rendering hidden cell because it is subsumed by a merged cell
        }

        const colspan = cellProps.colspan || 1;
        const rowspan = cellProps.rowspan || 1;
        const isMerged = colspan > 1 || rowspan > 1;
        const cellVal = row[col.id] || '';

        tbodyHtml += `
          <td class="ts-cell-td ${isMerged ? 'ts-merged-cell' : ''}" data-row-idx="${rIdx}" data-col-idx="${cIdx}" data-col-id="${escapeHtml(col.id)}" colspan="${colspan}" rowspan="${rowspan}">
            <div class="ts-cell-content rich-text-editor" contenteditable="true" data-col-id="${escapeHtml(col.id)}" data-placeholder="Enter details...">${cellVal}</div>
          </td>
        `;
      });

      if (isSuperAdmin) {
        tbodyHtml += `<td class="ts-col-add-btn-cell" style="text-align: center; background: #fafafa;"></td>`;
      }
      tbodyHtml += `</tr>`;
    });
  }

  tableEl.innerHTML = `<thead>${theadHtml}</thead><tbody>${tbodyHtml}</tbody>`;

  // Attach selection, merge listeners, and edit mode state
  setupScheduleCellInteractions();
  initFloatingRichTextToolbar();
  updateScheduleEditModeUI();
}

// Setup cell selection for click & drag merge
function setupScheduleCellInteractions() {
  const tableEl = document.getElementById('teacherScheduleDataTable');
  if (!tableEl) return;

  let isMouseDown = false;
  let anchorCell = null;

  tableEl.querySelectorAll('tbody td.ts-cell-td').forEach(td => {
    td.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('ts-row-del-btn')) return;
      isMouseDown = true;
      const rIdx = parseInt(td.getAttribute('data-row-idx'), 10);
      const cIdx = parseInt(td.getAttribute('data-col-idx'), 10);
      const colId = td.getAttribute('data-col-id');
      anchorCell = { rIdx, cIdx, colId, td };
      activeScheduleCell = anchorCell;
      selectedScheduleRange = { startRow: rIdx, endRow: rIdx, startCol: cIdx, endCol: cIdx };
      updateCellSelectionHighlight();
    });

    td.addEventListener('mouseenter', () => {
      if (!isMouseDown || !anchorCell) return;
      const rIdx = parseInt(td.getAttribute('data-row-idx'), 10);
      const cIdx = parseInt(td.getAttribute('data-col-idx'), 10);
      selectedScheduleRange = {
        startRow: Math.min(anchorCell.rIdx, rIdx),
        endRow: Math.max(anchorCell.rIdx, rIdx),
        startCol: Math.min(anchorCell.cIdx, cIdx),
        endCol: Math.max(anchorCell.cIdx, cIdx)
      };
      updateCellSelectionHighlight();
    });

    td.addEventListener('focusin', () => {
      const rIdx = parseInt(td.getAttribute('data-row-idx'), 10);
      const cIdx = parseInt(td.getAttribute('data-col-idx'), 10);
      const colId = td.getAttribute('data-col-id');
      activeScheduleCell = { rIdx, cIdx, colId, td };
    });
  });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
  });
}

function updateCellSelectionHighlight() {
  document.querySelectorAll('#teacherScheduleDataTable tbody td.ts-cell-td').forEach(td => {
    const rIdx = parseInt(td.getAttribute('data-row-idx'), 10);
    const cIdx = parseInt(td.getAttribute('data-col-idx'), 10);
    if (selectedScheduleRange &&
        rIdx >= selectedScheduleRange.startRow && rIdx <= selectedScheduleRange.endRow &&
        cIdx >= selectedScheduleRange.startCol && cIdx <= selectedScheduleRange.endCol &&
        (selectedScheduleRange.startRow !== selectedScheduleRange.endRow || selectedScheduleRange.startCol !== selectedScheduleRange.endCol)) {
      td.classList.add('ts-cell-selected');
    } else {
      td.classList.remove('ts-cell-selected');
    }
  });
}

// Merge Cells Functionality
window.mergeSelectedCells = async function () {
  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table) return;

  const cols = table.columns || [];
  const rows = table.rows || [];

  let r1, r2, c1, c2;
  if (selectedScheduleRange && (selectedScheduleRange.startRow !== selectedScheduleRange.endRow || selectedScheduleRange.startCol !== selectedScheduleRange.endCol)) {
    r1 = selectedScheduleRange.startRow;
    r2 = selectedScheduleRange.endRow;
    c1 = selectedScheduleRange.startCol;
    c2 = selectedScheduleRange.endCol;
  } else if (activeScheduleCell) {
    r1 = activeScheduleCell.rIdx;
    c1 = activeScheduleCell.cIdx;
    const direction = prompt("Merge options:\n1. Merge with cell to the Right (type 'right' or '1')\n2. Merge with cell Below (type 'down' or '2')", "1");
    if (!direction) return;
    if (direction.trim() === '2' || direction.toLowerCase().includes('down')) {
      if (r1 + 1 >= rows.length) {
        alert("No cell below to merge with.");
        return;
      }
      r2 = r1 + 1;
      c2 = c1;
    } else {
      if (c1 + 1 >= cols.length) {
        alert("No cell to the right to merge with.");
        return;
      }
      r2 = r1;
      c2 = c1 + 1;
    }
  } else {
    alert("Please click or drag to select cells to merge.");
    return;
  }

  const masterCol = cols[c1];
  if (!masterCol) return;

  // Collect text contents from all cells in rectangle
  const mergedTextParts = [];
  for (let r = r1; r <= r2; r++) {
    const row = rows[r];
    if (!row) continue;
    if (!row._cellProps) row._cellProps = {};
    for (let c = c1; c <= c2; c++) {
      const col = cols[c];
      if (!col) continue;
      if (r === r1 && c === c1) {
        if (row[col.id] && row[col.id].trim()) mergedTextParts.push(row[col.id].trim());
      } else {
        if (row[col.id] && row[col.id].trim()) mergedTextParts.push(row[col.id].trim());
        row._cellProps[col.id] = { hidden: true, masterRow: r1, masterCol: c1 };
      }
    }
  }

  const masterRow = rows[r1];
  masterRow._cellProps[masterCol.id] = {
    colspan: c2 - c1 + 1,
    rowspan: r2 - r1 + 1
  };
  masterRow[masterCol.id] = mergedTextParts.join('<br>');

  selectedScheduleRange = null;
  await saveTeacherScheduleTables(tables);
};

// Unmerge Active Cell Functionality
window.unmergeActiveCell = async function () {
  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table) return;

  const cols = table.columns || [];
  const rows = table.rows || [];

  let targetRowIdx = activeScheduleCell?.rIdx;
  let targetColId = activeScheduleCell?.colId;

  if (targetRowIdx === undefined || !targetColId) {
    alert("Please click on a merged cell to unmerge it.");
    return;
  }

  const row = rows[targetRowIdx];
  if (!row || !row._cellProps) {
    alert("Selected cell is not merged.");
    return;
  }

  let cellProp = row._cellProps[targetColId];
  let masterRowIdx = targetRowIdx;
  let masterColId = targetColId;

  // If clicked on a hidden cell referencing master
  if (cellProp?.hidden && cellProp.masterRow !== undefined) {
    masterRowIdx = cellProp.masterRow;
    masterColId = cols[cellProp.masterCol]?.id || targetColId;
    cellProp = rows[masterRowIdx]?._cellProps?.[masterColId];
  }

  if (!cellProp || (!cellProp.colspan && !cellProp.rowspan && cellProp.colspan <= 1 && cellProp.rowspan <= 1)) {
    alert("Selected cell is not merged.");
    return;
  }

  const colspan = cellProp.colspan || 1;
  const rowspan = cellProp.rowspan || 1;
  const masterColIdx = cols.findIndex(c => c.id === masterColId);

  // Clear merge properties on master and all subsumed cells
  for (let r = masterRowIdx; r < masterRowIdx + rowspan && r < rows.length; r++) {
    const rObj = rows[r];
    if (!rObj || !rObj._cellProps) continue;
    for (let c = masterColIdx; c < masterColIdx + colspan && c < cols.length; c++) {
      const cObj = cols[c];
      if (!cObj) continue;
      delete rObj._cellProps[cObj.id];
    }
  }

  selectedScheduleRange = null;
  await saveTeacherScheduleTables(tables);
};

// Add New Column
window.addScheduleColumn = function () {
  if (!isAdminUser()) return;
  const colName = prompt("Enter new column header name:", "Remarks / Notes");
  if (!colName || !colName.trim()) return;

  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table) return;

  const newColId = 'col_' + Date.now();
  if (!Array.isArray(table.columns)) table.columns = [];
  table.columns.push({ id: newColId, name: colName.trim() });

  saveTeacherScheduleTables(tables);
};

// Delete Column
window.deleteScheduleColumn = function (colIndex) {
  if (!isAdminUser()) return;

  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table || !Array.isArray(table.columns) || !table.columns[colIndex]) return;

  const colName = table.columns[colIndex].name || `Column ${colIndex + 1}`;
  if (!confirm(`Are you sure you want to delete column "${colName}"? Any data in this column will be removed.`)) return;

  const colId = table.columns[colIndex].id;
  table.columns.splice(colIndex, 1);

  // Clean cell data from rows
  if (Array.isArray(table.rows)) {
    table.rows.forEach(r => {
      delete r[colId];
      if (r._cellProps) delete r._cellProps[colId];
    });
  }

  saveTeacherScheduleTables(tables);
};

// Add New Row
window.addScheduleRow = function () {
  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table) return;

  if (!Array.isArray(table.rows)) table.rows = [];
  const newRow = { id: 'r_' + Date.now() };
  if (Array.isArray(table.columns)) {
    table.columns.forEach(c => {
      newRow[c.id] = '';
    });
  }
  table.rows.push(newRow);

  saveTeacherScheduleTables(tables);
};

// Delete Row
window.deleteScheduleRow = function (rowIndex) {
  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table || !Array.isArray(table.rows) || !table.rows[rowIndex]) return;

  if (!confirm(`Are you sure you want to delete Row #${rowIndex + 1}?`)) return;

  table.rows.splice(rowIndex, 1);
  saveTeacherScheduleTables(tables);
};

// Delete Entire Schedule Table
window.deleteScheduleTable = function () {
  if (!isAdminUser()) return;

  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const targetIdx = tables.findIndex(t => t.id === activeScheduleTableId);
  if (targetIdx === -1) return;

  const tableTitle = tables[targetIdx].title || 'this table';
  if (!confirm(`Are you sure you want to delete the schedule table "${tableTitle}"? This cannot be undone.`)) return;

  tables.splice(targetIdx, 1);
  activeScheduleTableId = tables[0]?.id || 'table_prayer';

  saveTeacherScheduleTables(tables);
};

// Harvest Current Table DOM Data & Save to Firestore
async function saveActiveScheduleTable() {
  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  const table = tables.find(t => t.id === activeScheduleTableId);
  if (!table) return;

  // Title and Description
  const titleEl = document.getElementById('tsActiveTableTitle');
  const descEl = document.getElementById('tsActiveTableDescription');
  if (titleEl && titleEl.textContent) table.title = titleEl.textContent.trim();
  if (descEl && descEl.textContent) table.description = descEl.textContent.trim();

  // Column titles
  document.querySelectorAll('#teacherScheduleDataTable th .ts-col-title').forEach(colEl => {
    const idx = parseInt(colEl.getAttribute('data-col-idx'), 10);
    if (!isNaN(idx) && table.columns && table.columns[idx]) {
      table.columns[idx].name = colEl.textContent.trim();
    }
  });

  // Row cell contents and preserved _cellProps
  const rows = [];
  document.querySelectorAll('#teacherScheduleDataTable tbody tr').forEach((tr, rIdx) => {
    const rowId = tr.getAttribute('data-row-id') || `r_${rIdx + 1}`;
    const origRow = table.rows?.[rIdx] || {};
    const rowData = { id: rowId, _cellProps: origRow._cellProps || {} };

    tr.querySelectorAll('.ts-cell-td').forEach(td => {
      const colId = td.getAttribute('data-col-id');
      const cellContent = td.querySelector('.ts-cell-content');
      if (colId && cellContent) {
        rowData[colId] = cellContent.innerHTML.trim();
      }
    });

    // Preserve any hidden cells in origRow that were not directly rendered as separate cells
    if (table.columns) {
      table.columns.forEach(col => {
        if (rowData[col.id] === undefined && origRow[col.id] !== undefined) {
          rowData[col.id] = origRow[col.id];
        }
      });
    }

    rows.push(rowData);
  });
  table.rows = rows;

  const btnSave = document.getElementById('btnSaveActiveScheduleTable');
  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span>Saving Schedule...</span>`;
    }

    await saveTeacherScheduleTables(tables);
    alert("Teacher Schedule successfully saved!");
  } catch (err) {
    console.error("Error saving schedule table:", err);
    alert("Failed to save schedule table: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        <span>Save Changes</span>
      `;
    }
  }
}

async function saveTeacherScheduleTables(tables) {
  customTeacherSchedulesData.tables = tables;
  await setDoc(doc(db, "schedules", "customTeacherSchedules"), { tables: tables }, { merge: true });
  renderTeacherSchedulesView();
}

// Excel Import Handler
function initScheduleExcelImport() {
  const fileInput = document.getElementById('scheduleExcelFileInput');
  const importBtn = document.getElementById('btnImportScheduleExcel');

  if (importBtn && fileInput && !importBtn._importAttached) {
    importBtn._importAttached = true;
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rowsAoA = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rowsAoA || rowsAoA.length === 0) {
          alert("The uploaded Excel file contains no data.");
          return;
        }

        // Find first non-empty row as header
        let headerIdx = 0;
        while (headerIdx < rowsAoA.length && (!rowsAoA[headerIdx] || rowsAoA[headerIdx].filter(x => String(x).trim()).length === 0)) {
          headerIdx++;
        }
        if (headerIdx >= rowsAoA.length) {
          alert("No valid rows found in Excel sheet.");
          return;
        }

        const headerRow = rowsAoA[headerIdx];
        const columns = [];
        headerRow.forEach((colVal, colI) => {
          const name = String(colVal).trim() || `Column ${colI + 1}`;
          columns.push({
            id: `col_${colI + 1}`,
            name: name
          });
        });

        if (columns.length === 0) {
          alert("No columns detected in the Excel sheet.");
          return;
        }

        const rows = [];
        for (let i = headerIdx + 1; i < rowsAoA.length; i++) {
          const rowData = rowsAoA[i];
          if (!rowData || rowData.every(cell => String(cell).trim() === '')) continue;
          const newRow = { id: `r_${i}` };
          columns.forEach((col, cIdx) => {
            newRow[col.id] = String(rowData[cIdx] || '').replace(/\r\n|\n/g, '<br>');
          });
          rows.push(newRow);
        }

        if (rows.length === 0) {
          rows.push({ id: 'r1' }, { id: 'r2' }, { id: 'r3' });
        }

        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        const replaceCurrent = confirm(`Import "${fileNameWithoutExt}" (${columns.length} columns, ${rows.length} rows)?\n\n- Click OK to replace the CURRENT schedule table\n- Click Cancel to create as a NEW schedule table`);

        const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));

        if (replaceCurrent) {
          const activeTable = tables.find(t => t.id === activeScheduleTableId);
          if (activeTable) {
            activeTable.columns = columns;
            activeTable.rows = rows;
          } else {
            tables.push({
              id: 'table_' + Date.now(),
              title: fileNameWithoutExt,
              description: 'Imported from Excel',
              columns,
              rows
            });
          }
        } else {
          const newId = 'table_' + Date.now();
          tables.push({
            id: newId,
            title: fileNameWithoutExt,
            description: 'Imported from Excel',
            columns,
            rows
          });
          activeScheduleTableId = newId;
        }

        await saveTeacherScheduleTables(tables);
        alert(`Excel schedule "${fileNameWithoutExt}" successfully imported!`);
      } catch (err) {
        console.error("Error importing Excel:", err);
        alert("Failed to import Excel: " + err.message);
      } finally {
        fileInput.value = '';
      }
    });
  }
}

// Create New Schedule Table Modal Handlers
function openCreateScheduleTableModal() {
  const modal = document.getElementById('createScheduleTableModal');
  if (modal) modal.style.display = 'flex';
}

function closeCreateScheduleTableModal() {
  const modal = document.getElementById('createScheduleTableModal');
  if (modal) modal.style.display = 'none';
}

document.getElementById('btnAddNewCustomScheduleTable')?.addEventListener('click', openCreateScheduleTableModal);
document.getElementById('btnCancelCreateScheduleTable')?.addEventListener('click', closeCreateScheduleTableModal);

document.getElementById('createScheduleTableForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('newScheduleTitleInput')?.value.trim() || '';
  const desc = document.getElementById('newScheduleDescInput')?.value.trim() || '';
  const colsInput = document.getElementById('newScheduleColumnsInput')?.value.trim() || '';

  if (!title) {
    alert("Please enter a schedule table title.");
    return;
  }

  const cols = colsInput.split(',').map((c, i) => ({
    id: 'col_' + (i + 1),
    name: c.trim()
  })).filter(c => c.name);

  if (cols.length === 0) {
    alert("Please enter at least one column header.");
    return;
  }

  const newTableId = 'table_' + Date.now();
  const newTable = {
    id: newTableId,
    title,
    description: desc,
    columns: cols,
    rows: [
      { id: 'r1' },
      { id: 'r2' },
      { id: 'r3' },
      { id: 'r4' },
      { id: 'r5' }
    ]
  };

  const tables = JSON.parse(JSON.stringify(getTeacherScheduleTables()));
  tables.push(newTable);
  activeScheduleTableId = newTableId;

  try {
    await saveTeacherScheduleTables(tables);
    closeCreateScheduleTableModal();
    document.getElementById('createScheduleTableForm').reset();
    alert(`New Schedule Table "${title}" created successfully!`);
  } catch (err) {
    console.error("Error creating schedule table:", err);
    alert("Failed to create table: " + err.message);
  }
});

// Printable Teacher Schedule Sheet (with merge support)
function printTeacherScheduleSheet() {
  const tables = getTeacherScheduleTables();
  const activeTable = tables.find(t => t.id === activeScheduleTableId) || tables[0];

  if (!activeTable) {
    alert("No active schedule table to print.");
    return;
  }

  const container = document.getElementById('printableTeacherScheduleArea');
  if (!container) return;

  const cols = activeTable.columns || [];
  const rows = activeTable.rows || [];

  let thHtml = `<tr><th style="width: 44px; text-align: center; border: 1px solid #cbd5e1; padding: 6px 8px; background: #f1f5f9; font-size: 9.5pt;">#</th>`;
  cols.forEach(col => {
    thHtml += `<th style="border: 1px solid #cbd5e1; padding: 6px 8px; background: #f1f5f9; text-align: left; font-size: 9.5pt;">${escapeHtml(col.name)}</th>`;
  });
  thHtml += `</tr>`;

  let tbHtml = '';
  if (rows.length === 0) {
    tbHtml = `<tr><td colspan="${cols.length + 1}" style="text-align: center; padding: 12px; color: #94a3b8; font-style: italic;">No entries recorded.</td></tr>`;
  } else {
    rows.forEach((row, idx) => {
      tbHtml += `<tr>`;
      tbHtml += `<td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 9pt; font-weight: bold;">${idx + 1}</td>`;
      cols.forEach(col => {
        const cellProps = row._cellProps?.[col.id] || {};
        if (cellProps.hidden) return; // Skip merged cell
        const colspan = cellProps.colspan || 1;
        const rowspan = cellProps.rowspan || 1;
        tbHtml += `<td colspan="${colspan}" rowspan="${rowspan}" style="border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 9pt; vertical-align: top;">${row[col.id] || '-'}</td>`;
      });
      tbHtml += `</tr>`;
    });
  }

  container.innerHTML = `
    <div style="padding: 10px; font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #0f172a;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <h1 style="font-size: 16pt; font-weight: 800; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.02em;">${escapeHtml(activeTable.title || 'TEACHER SCHEDULE')}</h1>
          <p style="font-size: 9.5pt; color: #475569; margin: 0;">${escapeHtml(activeTable.description || '')}</p>
        </div>
        <div style="text-align: right; font-size: 9pt; color: #334155; line-height: 1.4;">
          <div style="font-size: 8.5pt; color: #64748b;">Printed on: ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>${thHtml}</thead>
        <tbody>${tbHtml}</tbody>
      </table>

      <div style="display: flex; justify-content: space-between; margin-top: 36px; padding: 0 20px; font-size: 9pt;">
        <div style="text-align: center;">
          <div>Prepared by,</div>
          <div style="margin-top: 50px; border-bottom: 1px solid #0f172a; width: 160px;"></div>
          <div style="margin-top: 4px; font-weight: bold;">Teacher Coordinator</div>
        </div>
        <div style="text-align: center;">
          <div>Acknowledged by,</div>
          <div style="margin-top: 50px; border-bottom: 1px solid #0f172a; width: 160px;"></div>
          <div style="margin-top: 4px; font-weight: bold;">School Principal</div>
        </div>
      </div>
    </div>
  `;

  // Set landscape orientation dynamically for printing schedule
  let styleEl = document.getElementById('dynamicPrintPageStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamicPrintPageStyle';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = `@page { size: landscape; margin: 12mm; }`;

  window.print();
}

// Export Teacher Schedule to Excel
function exportTeacherScheduleToExcel() {
  const tables = getTeacherScheduleTables();
  const activeTable = tables.find(t => t.id === activeScheduleTableId) || tables[0];

  if (!activeTable) {
    alert("No schedule table to export.");
    return;
  }

  const cols = activeTable.columns || [];
  const rows = activeTable.rows || [];

  const aoa = [
    [activeTable.title ? activeTable.title.toUpperCase() : "TEACHER SCHEDULE"],
    [activeTable.description || ""],
    [],
    ["No", ...cols.map(c => c.name || "Column")]
  ];

  if (rows.length === 0) {
    aoa.push(["-", ...cols.map(() => "No entries")]);
  } else {
    rows.forEach((r, idx) => {
      const rowValues = cols.map(c => {
        const val = r[c.id] || "";
        const tmp = document.createElement("div");
        tmp.innerHTML = val;
        return tmp.textContent || tmp.innerText || "";
      });
      aoa.push([idx + 1, ...rowValues]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const safeSheetName = (activeTable.title || "Schedule").substring(0, 30);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const safeTitle = (activeTable.title || "Schedule").replace(/\s+/g, '_').substring(0, 25);
  XLSX.writeFile(wb, `${safeTitle}.xlsx`);
}

// Teacher Schedules Event Listeners
document.getElementById('btnQuickAddScheduleColumn')?.addEventListener('click', addScheduleColumn);
document.getElementById('btnQuickAddScheduleRow')?.addEventListener('click', addScheduleRow);
document.getElementById('btnMergeCells')?.addEventListener('click', mergeSelectedCells);
document.getElementById('btnUnmergeCells')?.addEventListener('click', unmergeActiveCell);
document.getElementById('btnToggleEditScheduleTable')?.addEventListener('click', toggleTeacherScheduleEditMode);
document.getElementById('btnDeleteActiveScheduleTable')?.addEventListener('click', deleteScheduleTable);
document.getElementById('btnSaveActiveScheduleTable')?.addEventListener('click', saveActiveScheduleTable);
document.getElementById('btnPrintTeacherSchedule')?.addEventListener('click', printTeacherScheduleSheet);
document.getElementById('btnExportTeacherScheduleExcel')?.addEventListener('click', exportTeacherScheduleToExcel);

// Dynamic Split Login Screen Campus Visual Video & Daily Quote
function updateLoginVisualDayNight() {
  const videoEl = document.getElementById('loginVisualCampusVideo');
  if (videoEl) {
    const hour = new Date().getHours();
    const isDay = (hour >= 6 && hour < 18);
    const drivePoster = isDay
      ? 'https://lh3.googleusercontent.com/d/1ozoUmpJTsMTSvykTQr-WNQ3K19D1_NGb'
      : 'https://lh3.googleusercontent.com/d/12BaqYdue8roO0CCfwajIEcCkIkTZe5pR';
    const driveDirect = isDay
      ? 'https://drive.usercontent.google.com/download?id=1s8HaspAJnJ4OknN1woyVkHxnR9ZgsUMB'
      : 'https://drive.usercontent.google.com/download?id=1mRP5cbvnYeKA-dAkL6b6W-Ba7H96UDeW';
    const driveUc = isDay
      ? 'https://drive.google.com/uc?id=1s8HaspAJnJ4OknN1woyVkHxnR9ZgsUMB&export=download'
      : 'https://drive.google.com/uc?id=1mRP5cbvnYeKA-dAkL6b6W-Ba7H96UDeW&export=download';

    videoEl.poster = drivePoster;
    const currentSources = Array.from(videoEl.querySelectorAll('source')).map(s => s.getAttribute('src'));
    if (!currentSources.length || currentSources[0] !== driveDirect) {
      videoEl.innerHTML = `
        <source src="${driveDirect}" type="video/mp4">
        <source src="${driveUc}" type="video/mp4">
      `;
      videoEl.load();
      videoEl.play().catch(() => {});
    }
  }

  const visualImg = document.getElementById('loginVisualCampusImg');
  if (visualImg) {
    const hour = new Date().getHours();
    const isDay = (hour >= 6 && hour < 18);
    const localImg = isDay ? 'day_building.jpg' : 'night_building.jpg';
    const driveImg = isDay
      ? 'https://lh3.googleusercontent.com/d/1ozoUmpJTsMTSvykTQr-WNQ3K19D1_NGb'
      : 'https://lh3.googleusercontent.com/d/12BaqYdue8roO0CCfwajIEcCkIkTZe5pR';

    visualImg.src = localImg;
    visualImg.onerror = () => {
      visualImg.onerror = null;
      visualImg.src = driveImg;
    };
  }

  const quoteTextEl = document.getElementById('loginDailyQuoteText');
  const quoteAuthorEl = document.getElementById('loginDailyQuoteAuthor');
  if (quoteTextEl || quoteAuthorEl) {
    try {
      const todayQuote = getDailyQuote();
      if (quoteTextEl && todayQuote?.quote) {
        quoteTextEl.textContent = `"${todayQuote.quote}"`;
      }
      if (quoteAuthorEl && todayQuote?.author) {
        quoteAuthorEl.textContent = `— ${todayQuote.author}`;
      }
    } catch (err) {
      console.warn("Could not load daily quote:", err);
    }
  }
}

// Initialize Components on Load
initFloatingRichTextToolbar();
initTeacherSchedulesFirestoreListener();
initScheduleExcelImport();
updateLoginVisualDayNight();


export { initTeacherSchedulesView, initFloatingRichTextToolbar, initTeacherSchedulesFirestoreListener, initScheduleExcelImport, updateLoginVisualDayNight };
