import { doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml, triggerCelebration } from "../../utils.js";
import { populateCalendarSelects } from "../../weekly.js";
import {
  db,
  auth,
  academicCalendar,
  appEntities,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName,
  sortWeeks
} from "./weeklyState.js";

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
    if (isTeacherUser()) {
      const loggedTeacher = getLoggedInTeacherName();
      if (loggedTeacher) {
        teacherSel.innerHTML = `<option value="${loggedTeacher}">${loggedTeacher}</option>`;
        teacherSel.value = loggedTeacher;
        teacherSel.disabled = true;
        teacherSel.style.backgroundColor = '#f1f5f9';
        teacherSel.style.cursor = 'not-allowed';
        return;
      }
    }

    teacherSel.disabled = false;
    teacherSel.style.backgroundColor = '#ffffff';
    teacherSel.style.cursor = 'pointer';
    const currentVal = teacherSel.value;
    teacherSel.innerHTML = teachers.map(t => `<option value="${t}">${t}</option>`).join('');
    if (currentVal && teachers.includes(currentVal)) {
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
// GOOGLE DRIVE MULTI-PHOTO UPLOAD HANDLER
// ------------------------------------------------------
let currentReportImages = [];

function initReportImageUpload() {
  const fileInput = document.getElementById('reportImageFileInput');
  const dropZone = document.getElementById('reportImageDropZone');

  loadDriveFolderSettings();

  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleReportImageFile(file);
    }
    fileInput.value = '';
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
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
      for (const file of files) {
        await handleReportImageFile(file);
      }
    });
  }
}

async function handleReportImageFile(file) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    const imgItem = {
      id: String(Date.now() + Math.random()),
      file: file,
      dataUrl: dataUrl,
      finalUrl: dataUrl,
      fileName: file.name,
      status: 'uploading'
    };

    currentReportImages.push(imgItem);
    renderReportImagesGallery();

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
            targetFolder: "Meeting Coordination",
            folderName: "Meeting Coordination",
            folderId: folderId,
            type: "weekly_coordination"
          })
        });

        const resText = await response.text();
        let resJson;
        try {
          resJson = JSON.parse(resText);
        } catch (parseErr) {
          throw new Error("Invalid response from Drive Web App: " + resText.substring(0, 100));
        }

        if (resJson && resJson.status === 'success' && resJson.photoUrl) {
          imgItem.finalUrl = resJson.photoUrl;
          imgItem.status = 'uploaded';
        } else {
          imgItem.status = 'local';
        }
      } catch (err) {
        console.warn("Drive upload error for", file.name, err);
        imgItem.status = 'local';
      }
    } else {
      imgItem.status = 'local';
    }
    renderReportImagesGallery();
  };
  reader.readAsDataURL(file);
}

function renderReportImagesGallery() {
  const promptContent = document.getElementById('reportImagePromptContent');
  const gallery = document.getElementById('reportImagesGallery');
  if (!gallery) return;

  if (currentReportImages.length === 0) {
    if (promptContent) promptContent.style.display = 'flex';
    gallery.style.display = 'none';
    gallery.innerHTML = '';
    return;
  }

  if (promptContent) promptContent.style.display = 'none';
  gallery.style.display = 'grid';

  let html = '';
  currentReportImages.forEach((img, idx) => {
    const badgeInfo = img.status === 'uploaded'
      ? `<span class="report-image-chip-badge" style="color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;">✅ Drive</span>`
      : (img.status === 'uploading'
        ? `<span class="report-image-chip-badge" style="color:#d97706;background:#fef3c7;border:1px solid #fde68a;">⏳ Uploading</span>`
        : `<span class="report-image-chip-badge" style="color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;">Attached</span>`);

    html += `
      <div class="report-image-chip">
        <img src="${escapeHtml(img.finalUrl || img.dataUrl)}" alt="${escapeHtml(img.fileName)}" class="report-image-chip-thumb" onclick="window.open('${escapeHtml(img.finalUrl || img.dataUrl)}', '_blank')">
        <div class="report-image-chip-meta">
          <span class="report-image-chip-name" title="${escapeHtml(img.fileName)}">${escapeHtml(img.fileName)}</span>
          ${badgeInfo}
        </div>
        <button type="button" class="report-image-chip-remove" onclick="event.stopPropagation(); window.removeReportImageByIndex(${idx})" title="Remove photo">✕</button>
      </div>
    `;
  });

  html += `
    <div class="report-gallery-add-more" onclick="document.getElementById('reportImageFileInput').click()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>+ Add Photo</span>
    </div>
  `;

  gallery.innerHTML = html;
}

window.removeReportImageByIndex = function(idx) {
  currentReportImages.splice(idx, 1);
  renderReportImagesGallery();
};

function clearReportImage() {
  currentReportImages = [];
  const fileInput = document.getElementById('reportImageFileInput');
  if (fileInput) fileInput.value = '';
  renderReportImagesGallery();
}

function sanitizeRichHtml(html) {
  if (!html) return '';
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll('script, iframe, object, embed, form, input, button').forEach(el => el.remove());
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return temp.innerHTML;
}

function formatRichTextForDisplay(content, fallback = '-') {
  if (!content || !content.trim()) return fallback;
  const str = content.trim();
  if (/<[a-z][\s\S]*>/i.test(str)) {
    return sanitizeRichHtml(str);
  }
  return escapeHtml(str);
}

function getRichEditorHtml(elOrId) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return '';
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return el.value.trim();
  }
  const html = el.innerHTML.trim();
  if (html === '<br>' || html === '<p><br></p>' || html === '<div><br></div>') return '';
  return html;
}

function setRichEditorHtml(elOrId, content) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.value = content || '';
  } else {
    el.innerHTML = content || '';
  }
}

function renderMeetingView() {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  populateMeetingReportSelects();

  const prefix = getMeetingStoragePrefix(year, theme, week);

  // 1. Render Meeting Minutes & Notes
  const meetingRecord = meetingCoordinationData[`${prefix}_meeting`] || {};
  const dateInput = document.getElementById('meetingDateInput');
  const agendaInput = document.getElementById('meetingAgendaInput');

  if (dateInput) {
    dateInput.value = meetingRecord.date || new Date().toISOString().split('T')[0];
  }
  if (agendaInput) {
    agendaInput.value = meetingRecord.agenda || '';
  }
  setRichEditorHtml('meetingSummaryInput', meetingRecord.summary || '');

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
    const allUrls = (Array.isArray(rep.imageUrls) && rep.imageUrls.length > 0)
      ? rep.imageUrls
      : (rep.imageUrl || rep.finalUrl || rep.photoUrl ? [rep.imageUrl || rep.finalUrl || rep.photoUrl] : []);

    html += `
      <div class="teacher-report-item" data-id="${escapeHtml(rep.id || String(index))}">
        <div class="report-item-header">
          <div class="report-item-pills">
            <span class="report-pill-teacher" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>${escapeHtml(rep.teacher || 'Teacher')}</span>
            </span>
            ${rep.subject ? `
              <span class="report-pill-subject" style="display: inline-flex; align-items: center; gap: 4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <span>${escapeHtml(rep.subject)}</span>
              </span>
            ` : ''}
            ${rep.className ? `
              <span class="report-pill-class" style="display: inline-flex; align-items: center; gap: 4px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 21h18M3 7v14M21 7v14M6 3h12l3 4H3zM9 11h2v3H9zm4 0h2v3h-2z"/>
                </svg>
                <span>${escapeHtml(rep.className)}</span>
              </span>
            ` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${formattedDate ? `<span class="report-item-time">${formattedDate}</span>` : ''}
            ${canEdit ? `
              <button type="button" class="btn-cell-action" onclick="editTeacherReportByIndex(${index})" title="Edit this report" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; background:#eff6ff; color:#2563eb; border-color:#bfdbfe;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span>Edit</span>
              </button>
              <button type="button" class="btn-cell-action" onclick="deleteTeacherReportByIndex(${index})" title="Delete report" style="display: inline-flex; align-items: center; justify-content: center; padding: 3px 8px; font-size: 11px; background:#fef2f2; color:#ef4444; border-color:#fca5a5;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="report-body-wrapper ${allUrls.length > 0 ? 'has-image' : ''}">
          <div class="report-text-columns">
            <div class="report-content-block">
              <div class="report-block-title progress-title">1. Weekly Progress & Material</div>
              <div class="report-block-text">${formatRichTextForDisplay(rep.progress, '-')}</div>
            </div>
            <div class="report-content-block">
              <div class="report-block-title challenges-title">2. Observations & Challenges</div>
              <div class="report-block-text">${formatRichTextForDisplay(rep.challenges, '-')}</div>
            </div>
          </div>
          ${allUrls.length > 0 ? `
            <div class="report-image-side-block">
              <div class="report-image-side-label" style="display: flex; align-items: center; gap: 5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Photo Documentation (${allUrls.length})</span>
              </div>
              <div class="report-photos-grid">
                ${allUrls.map((u, i) => `
                  <a href="${escapeHtml(u)}" target="_blank" class="report-photo-thumb-link" title="Click to view photo #${i + 1}">
                    <img src="${escapeHtml(u)}" alt="Report Photo" class="report-photo-item">
                  </a>
                `).join('')}
              </div>
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
  const printSummary = document.getElementById('printMeetingSummary');

  const attendeesList = Array.isArray(meetingRecord.attendeesList)
    ? meetingRecord.attendeesList
    : (meetingRecord.attendees ? meetingRecord.attendees.split(',').map(s => s.trim()).filter(Boolean) : []);
  const attendeesSet = new Set(attendeesList.map(n => n.trim().toLowerCase()));

  if (printDate) printDate.textContent = meetingRecord.date || '-';
  if (printAgenda) printAgenda.textContent = meetingRecord.agenda || '-';
  if (printSummary) printSummary.innerHTML = formatRichTextForDisplay(meetingRecord.summary, '-');

  // Populate Attendees Presence table
  const presenceTbody = document.getElementById('printAttendeesPresenceBody');
  if (presenceTbody) {
    const allTeachers = (appEntities && Array.isArray(appEntities.teachers) && appEntities.teachers.length > 0)
      ? appEntities.teachers
      : (attendeesList.length > 0 ? attendeesList : []);

    if (allTeachers.length === 0) {
      presenceTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:8px 10px;color:#94a3b8;font-style:italic;border:1px solid #cbd5e1;">No teacher data available.</td></tr>`;
    } else {
      let presenceRows = '';
      allTeachers.forEach((teacher, idx) => {
        const isPresent = attendeesSet.has((teacher || '').trim().toLowerCase());
        const statusStyle = isPresent
          ? 'color:#15803d;font-weight:700;'
          : 'color:#dc2626;font-weight:700;';
        const statusLabel = isPresent ? '✔ Present' : '✘ Absent';
        presenceRows += `
          <tr>
            <td style="text-align:center;border:1px solid #cbd5e1;padding:4px 8px;font-size:9pt;">${idx + 1}</td>
            <td style="border:1px solid #cbd5e1;padding:4px 8px;font-size:9pt;">${escapeHtml(teacher)}</td>
            <td style="text-align:center;border:1px solid #cbd5e1;padding:4px 8px;font-size:9pt;${statusStyle}">${statusLabel}</td>
          </tr>`;
      });
      presenceTbody.innerHTML = presenceRows;
    }
  }

  // Teacher Reports Print Table
  const tbody = document.getElementById('printTeacherReportsBody');
  if (!tbody) return;

  if (!reportsList || reportsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 14px; color: #94a3b8; font-style: italic;">No teacher weekly reports logged for this week.</td></tr>`;
    return;
  }

  let rowsHtml = '';
  reportsList.forEach((rep, index) => {
    const allUrls = (Array.isArray(rep.imageUrls) && rep.imageUrls.length > 0)
      ? rep.imageUrls
      : (rep.imageUrl || rep.finalUrl || rep.photoUrl ? [rep.imageUrl || rep.finalUrl || rep.photoUrl] : []);
    const subjectInfo = rep.subject ? `<div style="font-size: 8.5pt; color: #2563eb; font-weight: 600; margin-top: 2px;">${escapeHtml(rep.subject)}</div>` : '';

    const photosHtml = allUrls.length > 0 ? `
      <div class="print-photos-gallery">
        ${allUrls.map(u => `
          <a href="${escapeHtml(u)}" target="_blank" class="print-photo-thumb-link">
            <img src="${escapeHtml(u)}" alt="Report Photo" class="print-photo-item">
          </a>
        `).join('')}
      </div>
    ` : `<span style="color: #94a3b8; font-style: italic; font-size: 8.5pt;">-</span>`;

    const hasProgress = Boolean(rep.progress && rep.progress.trim());
    const hasChallenges = Boolean(rep.challenges && rep.challenges.trim());

    let detailsHtml = '';
    if (!hasProgress && !hasChallenges) {
      detailsHtml = `<span style="color: #94a3b8; font-style: italic;">-</span>`;
    } else {
      detailsHtml = `
        <div class="print-report-details">
          ${hasProgress ? `
            <div class="print-section-item">
              <div class="print-section-label print-label-progress">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: -1px; margin-right: 4px; flex-shrink: 0;">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <span>Progress & Material:</span>
              </div>
              <div class="print-section-text">${formatRichTextForDisplay(rep.progress)}</div>
            </div>
          ` : ''}
          ${hasChallenges ? `
            <div class="print-section-item ${hasProgress ? 'has-top-divider' : ''}">
              <div class="print-section-label print-label-challenges">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: -1px; margin-right: 4px; flex-shrink: 0;">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span>Challenges / Observations:</span>
              </div>
              <div class="print-section-text">${formatRichTextForDisplay(rep.challenges)}</div>
            </div>
          ` : ''}
        </div>
      `;
    }

    rowsHtml += `
      <tr>
        <td style="text-align: center; font-weight: bold; vertical-align: top;">${index + 1}</td>
        <td style="vertical-align: top;">
          <strong style="color: #0f172a; font-size: 9.5pt;">${escapeHtml(rep.teacher || '-')}</strong>
          ${subjectInfo}
        </td>
        <td style="vertical-align: top;">
          ${detailsHtml}
        </td>
        <td style="text-align: center; vertical-align: top;">
          ${photosHtml}
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
  const summaryVal = getRichEditorHtml('meetingSummaryInput');
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

  let teacher = document.getElementById('reportTeacherSelect')?.value || '';
  if (isTeacherUser()) {
    const loggedTeacher = getLoggedInTeacherName();
    if (loggedTeacher) {
      teacher = loggedTeacher;
    }
  }

  if (!teacher) {
    alert("Teacher name is required to submit a report.");
    return;
  }

  const progress = getRichEditorHtml('reportProgressInput');
  const challenges = getRichEditorHtml('reportChallengesInput');
  const imageUrls = currentReportImages.map(img => img.finalUrl || img.dataUrl).filter(Boolean);

  if (!progress && !challenges && imageUrls.length === 0) {
    alert("Please enter at least some details in the Weekly Progress, Observations, or attach photo(s) before submitting.");
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
      if (isTeacherUser()) {
        const loggedTeacher = getLoggedInTeacherName();
        if (loggedTeacher && existingReports[targetIdx].teacher && existingReports[targetIdx].teacher.toLowerCase() !== loggedTeacher.toLowerCase()) {
          alert("You can only fill and edit your own weekly report.");
          return;
        }
      }
      existingReports[targetIdx] = {
        ...existingReports[targetIdx],
        teacher,
        progress,
        challenges,
        imageUrl: imageUrls[0] || existingReports[targetIdx].imageUrl || '',
        imageUrls: imageUrls.length > 0 ? imageUrls : (existingReports[targetIdx].imageUrls || []),
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
          imageUrl: imageUrls[0] || existingReports[duplicateIdx].imageUrl || '',
          imageUrls: imageUrls.length > 0 ? imageUrls : (existingReports[duplicateIdx].imageUrls || []),
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
        imageUrl: imageUrls[0] || '',
        imageUrls: imageUrls,
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
    setRichEditorHtml('reportProgressInput', '');
    setRichEditorHtml('reportChallengesInput', '');
    clearReportImage();
    populateMeetingReportSelects();

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

  if (isTeacherUser()) {
    const loggedTeacher = getLoggedInTeacherName();
    if (loggedTeacher && rep.teacher && rep.teacher.toLowerCase() !== loggedTeacher.toLowerCase()) {
      alert("You can only fill and edit your own weekly report.");
      return;
    }
  }

  editingReportId = rep.id || String(index);

  const teacherSel = document.getElementById('reportTeacherSelect');
  if (teacherSel && rep.teacher) {
    if (!isTeacherUser()) {
      teacherSel.value = rep.teacher;
    }
  }

  setRichEditorHtml('reportProgressInput', rep.progress || '');
  setRichEditorHtml('reportChallengesInput', rep.challenges || '');

  const allUrls = (Array.isArray(rep.imageUrls) && rep.imageUrls.length > 0)
    ? rep.imageUrls
    : (rep.imageUrl || rep.finalUrl || rep.photoUrl ? [rep.imageUrl || rep.finalUrl || rep.photoUrl] : []);

  if (allUrls.length > 0) {
    currentReportImages = allUrls.map((url, i) => ({
      id: String(i) + '-' + Date.now(),
      file: null,
      dataUrl: url,
      finalUrl: url,
      fileName: `Attached Photo #${i + 1}`,
      status: 'uploaded'
    }));
    renderReportImagesGallery();
  } else {
    clearReportImage();
  }

  const progEl = document.getElementById('reportProgressInput');
  progEl?.focus();
  document.querySelector('.meeting-layout-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteTeacherReportByIndex = async function (index) {
  const year = document.getElementById('meetingYearSelect')?.value || '2026/2027';
  const theme = document.getElementById('meetingThemeSelect')?.value || 'Theme 1';
  const week = document.getElementById('meetingWeekSelect')?.value || 'Week 1';

  const prefix = getMeetingStoragePrefix(year, theme, week);
  const reports = meetingCoordinationData[`${prefix}_reports`] || [];
  const rep = reports[index];

  if (!rep) return;

  if (isTeacherUser()) {
    const loggedTeacher = getLoggedInTeacherName();
    if (loggedTeacher && rep.teacher && rep.teacher.toLowerCase() !== loggedTeacher.toLowerCase()) {
      alert("You can only delete your own weekly report.");
      return;
    }
  }

  if (!confirm("Are you sure you want to delete this teaching report?")) return;

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
  populateMeetingReportSelects();
  setRichEditorHtml('reportProgressInput', '');
  setRichEditorHtml('reportChallengesInput', '');
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

  // Set portrait orientation dynamically for printing meeting report
  let portraitStyle = document.getElementById('dynamicPrintPortraitStyle');
  if (!portraitStyle) {
    portraitStyle = document.createElement('style');
    portraitStyle.id = 'dynamicPrintPortraitStyle';
    document.head.appendChild(portraitStyle);
  }
  portraitStyle.innerHTML = '@media print { @page { size: portrait !important; margin: 8mm !important; } }';
  document.body.classList.add('printing-meeting');

  window.print();

  setTimeout(() => {
    document.body.classList.remove('printing-meeting');
    if (portraitStyle) portraitStyle.innerHTML = '';
  }, 1500);
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
    ["No", "Teacher", "Learning Progress & Material", "Observations & Challenges", "Photo Documentation", "Updated At"]
  ];

  if (reportsList.length === 0) {
    rows.push(["-", "No teacher reports submitted", "-", "-", "-", "-"]);
  } else {
    reportsList.forEach((rep, idx) => {
      const allUrls = (Array.isArray(rep.imageUrls) && rep.imageUrls.length > 0)
        ? rep.imageUrls
        : (rep.imageUrl || rep.finalUrl || rep.photoUrl ? [rep.imageUrl || rep.finalUrl || rep.photoUrl] : []);
      rows.push([
        idx + 1,
        rep.teacher || "-",
        rep.progress || "-",
        rep.challenges || "-",
        (allUrls.length > 0 ? allUrls.join(', ') : (rep.imageUrl || "-")),
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


export { initMeetingView, populateMeetingReportSelects };
