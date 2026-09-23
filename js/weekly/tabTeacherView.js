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
  isTeacherUser,
  getLoggedInTeacherName,
  isMiddleSchoolClass,
  getFridayMiddleSchoolTime,
  formatModernDateRange,
  getActiveCalendarPrefix,
  getSlotAssignments
} from "./weeklyState.js";
import { renderClassSchedule, getSubjectPastelObject, getSubjectPastelStyle } from "./tabClassView.js";
import { autoResizeTextarea, updateClassDaySelectOptions, updateTeacherDaySelectOptions } from "../../weekly.js";

export {
  renderTeacherView,
  exportTeacherToExcel,
  getTeacherSlotAssignment
};

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

  const dayFilter = document.getElementById('teacherDaySelect')?.value || 'ALL';
  const visibleDays = (dayFilter && dayFilter !== 'ALL')
    ? [dayFilter]
    : ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const isSingleDay = visibleDays.length === 1;

  // Update Teacher Table thead headers
  const teacherTableEl = document.querySelector('#teacherView .schedule-side .schedule-table');
  if (teacherTableEl) {
    teacherTableEl.classList.toggle('day-filtered-table', isSingleDay);
    const thHeaders = teacherTableEl.querySelectorAll('thead th.col-day');
    thHeaders.forEach(th => {
      const day = th.dataset.day;
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
    });
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
        if (isSingleDay) {
          const singleDay = visibleDays[0];
          if (slot.id === 0) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label"><span class="break-pill">${slot.label}</span></td>`;
          } else if (slot.id === 4) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label"><span class="break-pill">BREAK</span></td>`;
          } else if (slot.id === 8) {
            if (singleDay === 'FRIDAY') {
              tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label break-day-cell"><span class="break-pill">CLOSING</span></td>`;
            } else {
              tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label"><span class="break-pill">LUNCH</span></td>`;
            }
          } else if (slot.id === 12) {
            if (singleDay === 'FRIDAY') {
              tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
            } else {
              tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label"><span class="break-pill">CLOSING</span></td>`;
            }
          } else {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td class="break-label"><span class="break-pill">${slot.label}</span></td>`;
          }
        } else {
          // Full week (5 days)
          if (slot.id === 0) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
          } else if (slot.id === 4) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="4" class="break-label"><span class="break-pill">BREAK</span></td><td class="break-label break-day-cell"><span class="break-pill">BREAK</span></td>`;
          } else if (slot.id === 8) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="4" class="break-label"><span class="break-pill">LUNCH</span></td><td class="break-label break-day-cell"><span class="break-pill">CLOSING</span></td>`;
          } else if (slot.id === 12) {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="4" class="break-label"><span class="break-pill">CLOSING</span></td><td class="break-label break-day-cell"><span class="empty-dash">-</span></td>`;
          } else {
            tr.innerHTML = `<td class="time-cell break-time">${slot.time}</td><td colspan="5" class="break-label"><span class="break-pill">${slot.label}</span></td>`;
          }
        }
        visibleDays.forEach(day => skipCellsTeacher[day] = 0);
      } else {
        let html = `<td class="time-cell"><strong>${slot.time}</strong></td>`;

        visibleDays.forEach(day => {
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

  // Preserve any in-progress unsaved input values and active focus
  const activeEl = document.activeElement;
  const activeKey = (activeEl && activeEl.classList?.contains('mat-input')) ? activeEl.dataset.key : null;
  const activeSelectionStart = (activeEl && activeEl.selectionStart !== undefined) ? activeEl.selectionStart : null;
  const activeSelectionEnd = (activeEl && activeEl.selectionEnd !== undefined) ? activeEl.selectionEnd : null;

  const currentInputsMap = {};
  tbodyMat.querySelectorAll('.mat-input').forEach(inp => {
    if (inp.dataset.key) {
      currentInputsMap[inp.dataset.key] = inp.value;
    }
  });

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
    // If the user already had text in this input, prioritize it so concurrent snapshots don't erase typing
    const mat = (currentInputsMap[item.key] !== undefined)
      ? currentInputsMap[item.key]
      : (materialsData[item.key]?.material || '');
    const link = materialsData[item.key]?.link || '';
    const dayShort = item.day.substring(0, 3);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: left; padding: 12px 14px;">
        <div style="font-weight: 800; font-size: 14px; color: #0f172a; line-height: 1.2;">${item.className}</div>
        <div style="font-size: 12.5px; color: #475569; font-weight: 600; margin-top: 3px;">${item.subject} <span style="color: #64748b; font-weight: 500;">(${dayShort})</span></div>
      </td>
      <td style="padding: 10px 8px;">
        <input type="text" class="mat-input" data-key="${item.key}" value="${escapeHtml(mat)}" placeholder="Enter material description or topic...">
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

  // Restore focus and cursor position if the active element was an input in this table
  if (activeKey) {
    const restoredInput = tbodyMat.querySelector(`.mat-input[data-key="${activeKey}"]`);
    if (restoredInput) {
      restoredInput.focus();
      if (activeSelectionStart !== null && activeSelectionEnd !== null) {
        try {
          restoredInput.setSelectionRange(activeSelectionStart, activeSelectionEnd);
        } catch (_) {}
      }
    }
  }

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


document.getElementById('saveMaterialsBtn')?.addEventListener('click', async () => {
  const saveBtn = document.getElementById('saveMaterialsBtn');
  const originalText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    // 1. Collect all material inputs currently displayed in the Teacher Material table
    const currentTableInputs = document.querySelectorAll('#materialTableBody .mat-input');
    const updatesToSave = {};

    currentTableInputs.forEach(inp => {
      const key = inp.dataset.key;
      if (key) {
        if (!materialsData[key]) materialsData[key] = {};
        materialsData[key].material = inp.value;
        updatesToSave[key] = {
          ...(materialsData[key] || {}),
          material: inp.value
        };
      }
    });

    // 2. Fetch the latest server copy of materialsData to prevent overwriting keys saved by other teachers concurrently
    const docRef = doc(db, "schedules", "materialsData");
    const latestDocSnap = await getDoc(docRef);
    const remoteData = latestDocSnap.exists() ? latestDocSnap.data() : {};

    // 3. Merge: remote server data + only this teacher's current updates
    const mergedData = { ...remoteData, ...updatesToSave };

    // 4. Save merged data
    await setDoc(docRef, mergedData, { merge: true });
    materialsData = mergedData;

    renderClassSchedule();
    alert("Materials updated successfully!");
  } catch (err) {
    alert("Error saving materials: " + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
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
document.getElementById('classDaySelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  renderClassSchedule();
});
document.getElementById('classYearSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  updateClassDaySelectOptions();
  renderClassSchedule();
});
document.getElementById('classThemeSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  updateClassDaySelectOptions();
  renderClassSchedule();
});
document.getElementById('classWeekSelect')?.addEventListener('change', () => {
  if (isClassEditMode) exitClassEditMode(true);
  updateClassDaySelectOptions();
  renderClassSchedule();
});
document.getElementById('teacherSelectView')?.addEventListener('change', renderTeacherView);
document.getElementById('teacherDaySelect')?.addEventListener('change', renderTeacherView);
document.getElementById('teacherYearSelect')?.addEventListener('change', () => {
  updateTeacherDaySelectOptions();
  renderTeacherView();
});
document.getElementById('teacherThemeSelect')?.addEventListener('change', () => {
  updateTeacherDaySelectOptions();
  renderTeacherView();
});
document.getElementById('teacherWeekSelect')?.addEventListener('change', () => {
  updateTeacherDaySelectOptions();
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
