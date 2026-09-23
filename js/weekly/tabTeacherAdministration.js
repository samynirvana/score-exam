import { doc, setDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escapeHtml, triggerCelebration } from "../../utils.js";
import {
  db,
  auth,
  academicCalendar,
  appEntities,
  isAdminUser,
  getLoggedInTeacherName
} from "./weeklyState.js";

// ===========================================================================
// TEACHER ADMINISTRATION MODULE IMPLEMENTATION
// 9 Categories:
// Part A (Themes 1-4): 1. Learning Module, 2. Learning Focus, 3. Teaching Material, 4. Review Analysis
// Part B (Semesters 1-2): 5. Students Mapping, 6. Assessment Score, 7. Score Rubric, 8. Achievement
// Part C (Flexible Bank): 9. Review Questions
// ===========================================================================

const TADMIN_THEME_CATEGORIES = [
  { key: 'learning_module', num: 1, title: 'Learning Module', subtitle: 'Detailed module plans & syllabus breakdowns' },
  { key: 'learning_focus', num: 2, title: 'Learning Focus', subtitle: 'Target competencies, goals & weekly focus' },
  { key: 'teaching_material', num: 3, title: 'Teaching Material', subtitle: 'Slide decks, worksheets & handouts' },
  { key: 'review_analysis', num: 4, title: 'Review Analysis', subtitle: 'Evaluation analysis, remediation & reflections' }
];

const TADMIN_SEMESTER_CATEGORIES = [
  { key: 'students_mapping', num: 5, title: 'Students Mapping', subtitle: 'Student abilities, diagnostics & grouping' },
  { key: 'assessment_score', num: 6, title: 'Assessment Score', subtitle: 'Formative & summative gradebooks' },
  { key: 'score_rubric', num: 7, title: 'Score Rubric', subtitle: 'Scoring guides, standards & criteria' },
  { key: 'achievement', num: 8, title: 'Achievement', subtitle: 'Academic records, progress & commendations' }
];

let teacherAdministrationData = {};
let tadminActiveTheme = 'Theme 1';
let tadminActiveSemester = 'Semester 1';
let tadminActiveMode = 'teacher'; // 'teacher' or 'admin'
let isTadminInitialized = false;

// Realtime snapshot listener for Teacher Administration
try {
  onSnapshot(doc(db, "schedules", "teacherAdministration"), (docSnap) => {
    if (docSnap.exists()) {
      teacherAdministrationData = docSnap.data() || {};
    } else {
      teacherAdministrationData = {};
    }
    if (isTadminInitialized) {
      renderTeacherAdministrationView();
      renderTeacherAdminOverviewTable();
    }
  }, (err) => {
    console.warn("Could not listen to teacherAdministration collection:", err);
  });
} catch (err) {
  console.warn("Error setting up teacherAdministration snapshot:", err);
}

export function initTeacherAdministrationView() {
  isTadminInitialized = true;
  setupTeacherAdminControls();
  renderTeacherAdministrationView();
  renderTeacherAdminOverviewTable();
}

function setupTeacherAdminControls() {
  const yearSelect = document.getElementById('tadminYearSelect');
  const teacherSelect = document.getElementById('tadminTeacherSelect');
  const catFilter = document.getElementById('tadminCategoryFilter');
  const statusFilter = document.getElementById('tadminStatusFilter');

  // Populate Year Select
  if (yearSelect && yearSelect.options.length === 0) {
    const years = Object.keys(academicCalendar || {});
    if (years.length === 0) {
      years.push('2024 - 2025', '2025 - 2026', '2026 - 2027');
    }
    yearSelect.innerHTML = years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
    // Default to active year or first
    const activeCalYear = document.getElementById('classYearSelect')?.value;
    if (activeCalYear && years.includes(activeCalYear)) {
      yearSelect.value = activeCalYear;
    }
    yearSelect.addEventListener('change', () => {
      renderTeacherAdministrationView();
      renderTeacherAdminOverviewTable();
    });
  }

  // Populate Teacher Select
  if (teacherSelect) {
    const isSuperAdmin = isAdminUser();
    const loggedInTeacher = getLoggedInTeacherName();

    let teachers = (appEntities && Array.isArray(appEntities.teachers)) ? [...appEntities.teachers] : [];
    if (teachers.length === 0) {
      teachers = ['Mr. Syam', 'Teacher Sample'];
    }
    teachers.sort((a, b) => a.localeCompare(b));

    teacherSelect.innerHTML = teachers.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    if (isSuperAdmin) {
      teacherSelect.disabled = false;
      const group = document.getElementById('tadminTeacherFilterGroup');
      if (group) group.style.display = 'flex';
    } else {
      if (loggedInTeacher) {
        teacherSelect.value = loggedInTeacher;
      }
      teacherSelect.disabled = true;
    }

    teacherSelect.addEventListener('change', () => {
      renderTeacherAdministrationView();
    });
  }

  if (catFilter && !catFilter._hasListener) {
    catFilter._hasListener = true;
    catFilter.addEventListener('change', renderTeacherAdministrationView);
  }

  if (statusFilter && !statusFilter._hasListener) {
    statusFilter._hasListener = true;
    statusFilter.addEventListener('change', renderTeacherAdminOverviewTable);
  }

  // Switch between Teacher View and Admin Master Checklist
  const btnModeTeacher = document.getElementById('btnTadminModeTeacher');
  const btnModeAdmin = document.getElementById('btnTadminModeAdmin');
  if (btnModeTeacher && !btnModeTeacher._hasListener) {
    btnModeTeacher._hasListener = true;
    btnModeTeacher.addEventListener('click', () => setTadminMode('teacher'));
  }
  if (btnModeAdmin && !btnModeAdmin._hasListener) {
    btnModeAdmin._hasListener = true;
    btnModeAdmin.addEventListener('click', () => setTadminMode('admin'));
  }

  // Export to Excel button
  const btnExport = document.getElementById('btnExportTadminExcel');
  if (btnExport && !btnExport._hasListener) {
    btnExport._hasListener = true;
    btnExport.addEventListener('click', exportTeacherAdministrationToExcel);
  }

  // Add Review Questions item button
  const btnAddRQ = document.getElementById('btnTadminAddNewReviewQuestion');
  if (btnAddRQ && !btnAddRQ._hasListener) {
    btnAddRQ._hasListener = true;
    btnAddRQ.addEventListener('click', () => window.openAddReviewQuestionModal());
  }

  setupTadminUploadModal();
  setupTadminReviewQuestionModal();
  setupTadminDocPreviewModal();
}

function setTadminMode(mode) {
  tadminActiveMode = mode;
  const btnTeacher = document.getElementById('btnTadminModeTeacher');
  const btnAdmin = document.getElementById('btnTadminModeAdmin');
  const teacherPanel = document.getElementById('tadminTeacherViewContainer');
  const adminPanel = document.getElementById('tadminAdminViewContainer');

  if (mode === 'teacher') {
    btnTeacher?.setAttribute('aria-pressed', 'true');
    btnAdmin?.setAttribute('aria-pressed', 'false');
    if (teacherPanel) teacherPanel.style.display = 'block';
    if (adminPanel) adminPanel.style.display = 'none';
    renderTeacherAdministrationView();
  } else {
    btnTeacher?.setAttribute('aria-pressed', 'false');
    btnAdmin?.setAttribute('aria-pressed', 'true');
    if (teacherPanel) teacherPanel.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'block';
    renderTeacherAdminOverviewTable();
  }
}

window.setTadminActiveTheme = function(themeName) {
  tadminActiveTheme = themeName;
  document.querySelectorAll('#tadminThemePillsNav .tadmin-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === themeName);
  });
  renderTeacherAdministrationView();
};

window.setTadminActiveSemester = function(semName) {
  tadminActiveSemester = semName;
  document.querySelectorAll('#tadminSemesterPillsNav .tadmin-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-semester') === semName);
  });
  renderTeacherAdministrationView();
};

function getTadminRecordKey(year, teacher) {
  const cleanYear = (year || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
  const cleanTeacher = (teacher || '').trim();
  return `${cleanYear}_${cleanTeacher}`;
}

function getTeacherRecord(year, teacher) {
  const key = getTadminRecordKey(year, teacher);
  return teacherAdministrationData[key] || {
    themeSubmissions: {},
    semesterSubmissions: {},
    reviewQuestions: []
  };
}

export function renderTeacherAdministrationView() {
  const year = document.getElementById('tadminYearSelect')?.value || '';
  const teacher = document.getElementById('tadminTeacherSelect')?.value || '';
  const categoryFilter = document.getElementById('tadminCategoryFilter')?.value || 'ALL';
  const isSuperAdmin = isAdminUser();

  const record = getTeacherRecord(year, teacher);
  const themeSub = record.themeSubmissions || {};
  const semSub = record.semesterSubmissions || {};
  const reviewQuestions = Array.isArray(record.reviewQuestions) ? record.reviewQuestions : [];

  // Update KPI counters across this teacher's administration
  updateTeacherAdministrationKPIs(record);

  // Section 1: Themes Grid (Items 1 - 4)
  const themeCardsGrid = document.getElementById('tadminThemeCardsGrid');
  const themeBlock = themeCardsGrid?.closest('.tadmin-section-block');
  if (themeBlock) {
    themeBlock.style.display = (categoryFilter === 'ALL' || categoryFilter === 'cat_theme') ? 'block' : 'none';
  }

  if (themeCardsGrid) {
    const activeThemeData = themeSub[tadminActiveTheme] || {};
    let html = '';

    TADMIN_THEME_CATEGORIES.forEach(cat => {
      const item = activeThemeData[cat.key] || null;
      const hasFile = !!(item && (item.fileUrl || item.fileName));
      const isVerified = item && item.verified === true;
      const statusBadge = hasFile
        ? (isVerified
          ? `<span class="tadmin-status-badge verified">✅ Verified</span>`
          : `<span class="tadmin-status-badge pending">⏳ Pending Check</span>`)
        : `<span class="tadmin-status-badge missing">⚠️ Missing</span>`;

      let fileInfoHtml = '';
      if (hasFile) {
        fileInfoHtml = `
          <div class="tadmin-file-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div class="tadmin-file-info">
              <p class="tadmin-file-name" title="${escapeHtml(item.fileName || 'Attached Document')}">${escapeHtml(item.fileName || 'Attached Document')}</p>
              <p class="tadmin-file-date">Uploaded: ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : '-'}</p>
            </div>
          </div>
        `;
      } else {
        fileInfoHtml = `
          <div class="tadmin-file-box" style="justify-content: center; color: #94a3b8; font-size: 12px;">
            <span>No file uploaded yet for ${tadminActiveTheme}</span>
          </div>
        `;
      }

      // Actions
      let actionsHtml = '';
      if (hasFile) {
        actionsHtml += `
          <button type="button" class="tadmin-btn-preview" onclick="window.openAdminDocPreview('${escapeHtml(item.fileUrl)}', '${escapeHtml(item.fileName || cat.title)}', '${escapeHtml(cat.title)} (${tadminActiveTheme})', '${escapeHtml(teacher)}')">
            👁️ Preview
          </button>
        `;
      }
      actionsHtml += `
        <button type="button" class="tadmin-btn-upload" onclick="window.openAdminUploadModal('${cat.key}', 'theme', '${tadminActiveTheme}', '${escapeHtml(cat.title)} (${tadminActiveTheme})')">
          ${hasFile ? 'Replace File' : '⬆ Upload File'}
        </button>
      `;

      // Admin verification checklist button
      if (isSuperAdmin && hasFile) {
        actionsHtml += `
          <button type="button" class="tadmin-btn-verify-toggle ${isVerified ? 'verified' : ''}" 
            title="${isVerified ? 'Unmark verification' : 'Checklist & Verify this document'}"
            onclick="window.toggleAdminChecklistStatus('${cat.key}', 'theme', '${tadminActiveTheme}', ${!isVerified})">
            ${isVerified ? '✓ Verified' : 'Checklist'}
          </button>
        `;
      }

      html += `
        <div class="tadmin-card ${isVerified ? 'is-verified' : (hasFile ? 'is-pending' : '')}">
          <div>
            <div class="tadmin-card-head">
              <div class="tadmin-card-num-title">
                <h4 class="tadmin-card-title">${cat.num}. ${escapeHtml(cat.title)}</h4>
                <p class="tadmin-card-subtitle">${escapeHtml(cat.subtitle)}</p>
              </div>
              ${statusBadge}
            </div>
            ${fileInfoHtml}
          </div>
          <div class="tadmin-card-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    });

    themeCardsGrid.innerHTML = html;
  }

  // Section 2: Semesters Grid (Items 5 - 8)
  const semesterCardsGrid = document.getElementById('tadminSemesterCardsGrid');
  const semesterBlock = semesterCardsGrid?.closest('.tadmin-section-block');
  if (semesterBlock) {
    semesterBlock.style.display = (categoryFilter === 'ALL' || categoryFilter === 'cat_semester') ? 'block' : 'none';
  }

  if (semesterCardsGrid) {
    const activeSemData = semSub[tadminActiveSemester] || {};
    let html = '';

    TADMIN_SEMESTER_CATEGORIES.forEach(cat => {
      const item = activeSemData[cat.key] || null;
      const hasFile = !!(item && (item.fileUrl || item.fileName));
      const isVerified = item && item.verified === true;
      const statusBadge = hasFile
        ? (isVerified
          ? `<span class="tadmin-status-badge verified">✅ Verified</span>`
          : `<span class="tadmin-status-badge pending">⏳ Pending Check</span>`)
        : `<span class="tadmin-status-badge missing">⚠️ Missing</span>`;

      let fileInfoHtml = '';
      if (hasFile) {
        fileInfoHtml = `
          <div class="tadmin-file-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div class="tadmin-file-info">
              <p class="tadmin-file-name" title="${escapeHtml(item.fileName || 'Attached Document')}">${escapeHtml(item.fileName || 'Attached Document')}</p>
              <p class="tadmin-file-date">Uploaded: ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : '-'}</p>
            </div>
          </div>
        `;
      } else {
        fileInfoHtml = `
          <div class="tadmin-file-box" style="justify-content: center; color: #94a3b8; font-size: 12px;">
            <span>No file uploaded yet for ${tadminActiveSemester}</span>
          </div>
        `;
      }

      // Actions
      let actionsHtml = '';
      if (hasFile) {
        actionsHtml += `
          <button type="button" class="tadmin-btn-preview" onclick="window.openAdminDocPreview('${escapeHtml(item.fileUrl)}', '${escapeHtml(item.fileName || cat.title)}', '${escapeHtml(cat.title)} (${tadminActiveSemester})', '${escapeHtml(teacher)}')">
            👁️ Preview
          </button>
        `;
      }
      actionsHtml += `
        <button type="button" class="tadmin-btn-upload" onclick="window.openAdminUploadModal('${cat.key}', 'semester', '${tadminActiveSemester}', '${escapeHtml(cat.title)} (${tadminActiveSemester})')">
          ${hasFile ? 'Replace File' : '⬆ Upload File'}
        </button>
      `;

      // Admin verification checklist button
      if (isSuperAdmin && hasFile) {
        actionsHtml += `
          <button type="button" class="tadmin-btn-verify-toggle ${isVerified ? 'verified' : ''}" 
            title="${isVerified ? 'Unmark verification' : 'Checklist & Verify this document'}"
            onclick="window.toggleAdminChecklistStatus('${cat.key}', 'semester', '${tadminActiveSemester}', ${!isVerified})">
            ${isVerified ? '✓ Verified' : 'Checklist'}
          </button>
        `;
      }

      html += `
        <div class="tadmin-card ${isVerified ? 'is-verified' : (hasFile ? 'is-pending' : '')}">
          <div>
            <div class="tadmin-card-head">
              <div class="tadmin-card-num-title">
                <h4 class="tadmin-card-title">${cat.num}. ${escapeHtml(cat.title)}</h4>
                <p class="tadmin-card-subtitle">${escapeHtml(cat.subtitle)}</p>
              </div>
              ${statusBadge}
            </div>
            ${fileInfoHtml}
          </div>
          <div class="tadmin-card-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    });

    semesterCardsGrid.innerHTML = html;
  }

  // Section 3: Review Questions (Item 9 - Flexible Bank)
  const rqList = document.getElementById('tadminReviewQuestionsList');
  const rqBlock = rqList?.closest('.tadmin-section-block');
  if (rqBlock) {
    rqBlock.style.display = (categoryFilter === 'ALL' || categoryFilter === 'cat_review') ? 'block' : 'none';
  }

  if (rqList) {
    if (reviewQuestions.length === 0) {
      rqList.innerHTML = `
        <div style="grid-column: 1/-1; padding: 24px; text-align: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; color: #64748b;">
          <p style="margin: 0 0 6px 0; font-weight: 600;">No review questions added yet.</p>
          <span style="font-size: 12px;">Teachers can upload whatever quizzes, practice sheets, or review packages needed using the "Upload File" button above.</span>
        </div>
      `;
    } else {
      let html = '';
      reviewQuestions.forEach((rq, idx) => {
        const isVerified = rq.verified === true;
        const hasFile = !!(rq.fileUrl || rq.fileName);
        const statusBadge = hasFile
          ? (isVerified
            ? `<span class="tadmin-status-badge verified">✅ Verified</span>`
            : `<span class="tadmin-status-badge pending">⏳ Pending Check</span>`)
          : `<span class="tadmin-status-badge missing">⚠️ Missing</span>`;

        let fileMeta = '';
        if (hasFile) {
          fileMeta = `
            <div class="tadmin-file-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div class="tadmin-file-info">
                <p class="tadmin-file-name" title="${escapeHtml(rq.fileName || rq.title)}">${escapeHtml(rq.fileName || rq.title)}</p>
                <p class="tadmin-file-date">${rq.uploadedAt ? new Date(rq.uploadedAt).toLocaleDateString() : '-'}</p>
              </div>
            </div>
          `;
        }

        let actionsHtml = '';
        if (hasFile) {
          actionsHtml += `
            <button type="button" class="tadmin-btn-preview" onclick="window.openAdminDocPreview('${escapeHtml(rq.fileUrl)}', '${escapeHtml(rq.fileName || rq.title)}', '${escapeHtml(rq.title)}', '${escapeHtml(teacher)}')">
              👁️ Preview
            </button>
          `;
        }
        if (isSuperAdmin && hasFile) {
          actionsHtml += `
            <button type="button" class="tadmin-btn-verify-toggle ${isVerified ? 'verified' : ''}" 
              onclick="window.toggleAdminRQChecklistStatus('${rq.id || idx}', ${!isVerified})">
              ${isVerified ? '✓ Verified' : 'Checklist'}
            </button>
          `;
        }
        actionsHtml += `
          <button type="button" class="tadmin-btn-upload" style="color: #dc2626; border-color: #fca5a5;" onclick="window.deleteAdminReviewQuestionItem('${rq.id || idx}')" title="Delete this review question item">
            🗑️
          </button>
        `;

        html += `
          <div class="tadmin-rq-card ${isVerified ? 'is-verified' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
              <div>
                <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">${escapeHtml(rq.title)}</h4>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                  ${rq.grade ? `<span>Class: <strong>${escapeHtml(rq.grade)}</strong></span> &bull; ` : ''}
                  ${rq.subject ? `<span>Subject: <strong>${escapeHtml(rq.subject)}</strong></span>` : ''}
                </div>
              </div>
              ${statusBadge}
            </div>
            ${fileMeta}
            <div class="tadmin-card-actions" style="margin-top: 8px;">
              ${actionsHtml}
            </div>
          </div>
        `;
      });
      rqList.innerHTML = html;
    }
  }
}

function updateTeacherAdministrationKPIs(record) {
  let totalRequired = 16 + 8; // 4 themes * 4 items = 16, 2 semesters * 4 items = 8
  let submitted = 0;
  let verified = 0;

  const themes = ['Theme 1', 'Theme 2', 'Theme 3', 'Theme 4'];
  const semesters = ['Semester 1', 'Semester 2'];

  const themeSub = record.themeSubmissions || {};
  themes.forEach(th => {
    const tData = themeSub[th] || {};
    TADMIN_THEME_CATEGORIES.forEach(cat => {
      const item = tData[cat.key];
      if (item && (item.fileUrl || item.fileName)) {
        submitted++;
        if (item.verified === true) verified++;
      }
    });
  });

  const semSub = record.semesterSubmissions || {};
  semesters.forEach(sem => {
    const sData = semSub[sem] || {};
    TADMIN_SEMESTER_CATEGORIES.forEach(cat => {
      const item = sData[cat.key];
      if (item && (item.fileUrl || item.fileName)) {
        submitted++;
        if (item.verified === true) verified++;
      }
    });
  });

  const rq = Array.isArray(record.reviewQuestions) ? record.reviewQuestions : [];
  rq.forEach(item => {
    if (item && (item.fileUrl || item.fileName)) {
      submitted++;
      if (item.verified === true) verified++;
    }
  });

  const pending = submitted - verified;
  const missing = Math.max(0, totalRequired - (submitted - rq.length));

  const elTotal = document.getElementById('statTadminTotal');
  const elVer = document.getElementById('statTadminVerified');
  const elPen = document.getElementById('statTadminPending');
  const elMis = document.getElementById('statTadminMissing');

  if (elTotal) elTotal.textContent = submitted;
  if (elVer) elVer.textContent = verified;
  if (elPen) elPen.textContent = pending;
  if (elMis) elMis.textContent = missing;
}

// Master Overview Table for Admin
export function renderTeacherAdminOverviewTable() {
  const tbody = document.getElementById('tadminMasterTableBody');
  if (!tbody) return;

  const year = document.getElementById('tadminYearSelect')?.value || '';
  const statusFilter = document.getElementById('tadminStatusFilter')?.value || 'ALL';
  const teachers = (appEntities && Array.isArray(appEntities.teachers)) ? [...appEntities.teachers] : [];
  teachers.sort((a, b) => a.localeCompare(b));

  if (teachers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px; color: #94a3b8;">No teachers found in directory.</td></tr>`;
    return;
  }

  const themes = ['Theme 1', 'Theme 2', 'Theme 3', 'Theme 4'];
  const semesters = ['Semester 1', 'Semester 2'];

  let rowsHtml = '';
  let counter = 1;

  teachers.forEach(teacher => {
    const record = getTeacherRecord(year, teacher);
    const themeSub = record.themeSubmissions || {};
    const semSub = record.semesterSubmissions || {};
    const rq = Array.isArray(record.reviewQuestions) ? record.reviewQuestions : [];

    // Part A Themes Count (Max 16)
    let partASubmitted = 0;
    let partAVerified = 0;
    themes.forEach(th => {
      const tData = themeSub[th] || {};
      TADMIN_THEME_CATEGORIES.forEach(cat => {
        const item = tData[cat.key];
        if (item && (item.fileUrl || item.fileName)) {
          partASubmitted++;
          if (item.verified === true) partAVerified++;
        }
      });
    });

    // Part B Semesters Count (Max 8)
    let partBSubmitted = 0;
    let partBVerified = 0;
    semesters.forEach(sem => {
      const sData = semSub[sem] || {};
      TADMIN_SEMESTER_CATEGORIES.forEach(cat => {
        const item = sData[cat.key];
        if (item && (item.fileUrl || item.fileName)) {
          partBSubmitted++;
          if (item.verified === true) partBVerified++;
        }
      });
    });

    // Part C Reviews Count (Flexible)
    let partCSubmitted = 0;
    let partCVerified = 0;
    rq.forEach(item => {
      if (item && (item.fileUrl || item.fileName)) {
        partCSubmitted++;
        if (item.verified === true) partCVerified++;
      }
    });

    const totalCoreSubmitted = partASubmitted + partBSubmitted;
    const totalCoreVerified = partAVerified + partBVerified;
    const totalCoreRequired = 24; // 16 + 8
    const progressPct = Math.round((totalCoreSubmitted / totalCoreRequired) * 100);

    // Status Filter Matching
    let statusCategory = 'MISSING';
    if (totalCoreVerified === totalCoreRequired && totalCoreSubmitted === totalCoreRequired) {
      statusCategory = 'VERIFIED';
    } else if (totalCoreSubmitted > totalCoreVerified) {
      statusCategory = 'PENDING';
    } else if (totalCoreSubmitted === 0) {
      statusCategory = 'MISSING';
    }

    if (statusFilter !== 'ALL' && statusCategory !== statusFilter) {
      return;
    }

    let statusPill = '';
    if (totalCoreVerified === totalCoreRequired) {
      statusPill = `<span class="tadmin-status-badge verified">✅ All Verified (${totalCoreVerified}/${totalCoreRequired})</span>`;
    } else if (totalCoreSubmitted > totalCoreVerified) {
      statusPill = `<span class="tadmin-status-badge pending">⏳ ${totalCoreSubmitted - totalCoreVerified} Pending Review</span>`;
    } else {
      statusPill = `<span class="tadmin-status-badge missing">⚠️ ${totalCoreRequired - totalCoreSubmitted} Incomplete</span>`;
    }

    rowsHtml += `
      <tr>
        <td style="text-align: center; font-weight: bold; color: #64748b;">${counter++}</td>
        <td>
          <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">${escapeHtml(teacher)}</div>
          <div style="font-size: 11px; color: #64748b;">Academic Year: ${escapeHtml(year)}</div>
        </td>
        <td style="text-align: center;">
          <strong style="color: ${partASubmitted === 16 ? '#15803d' : '#334155'}; font-size: 13px;">${partASubmitted}/16</strong>
          <div style="font-size: 10.5px; color: #94a3b8;">${partAVerified} verified</div>
        </td>
        <td style="text-align: center;">
          <strong style="color: ${partBSubmitted === 8 ? '#15803d' : '#334155'}; font-size: 13px;">${partBSubmitted}/8</strong>
          <div style="font-size: 10.5px; color: #94a3b8;">${partBVerified} verified</div>
        </td>
        <td style="text-align: center;">
          <strong style="color: #2563eb; font-size: 13px;">${partCSubmitted} items</strong>
          <div style="font-size: 10.5px; color: #94a3b8;">${partCVerified} verified</div>
        </td>
        <td style="min-width: 140px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #334155;">
            <span>${totalCoreSubmitted}/${totalCoreRequired}</span>
            <span>${progressPct}%</span>
          </div>
          <div class="tadmin-progress-bar-bg">
            <div class="tadmin-progress-bar-fill" style="width: ${progressPct}%;"></div>
          </div>
        </td>
        <td style="text-align: center;">
          ${statusPill}
        </td>
        <td style="text-align: center;">
          <button type="button" class="action-btn" style="padding: 5px 12px; font-size: 11.5px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 6px;"
            onclick="window.inspectTeacherAdministration('${escapeHtml(teacher)}')">
            Inspect &amp; Checklist &rarr;
          </button>
        </td>
      </tr>
    `;
  });

  if (!rowsHtml) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: #64748b;">No records match the filter '${statusFilter}'.</td></tr>`;
  } else {
    tbody.innerHTML = rowsHtml;
  }
}

window.inspectTeacherAdministration = function(teacherName) {
  const teacherSelect = document.getElementById('tadminTeacherSelect');
  if (teacherSelect) {
    teacherSelect.value = teacherName;
  }
  setTadminMode('teacher');
};

// ===========================================================================
// File Upload to Google Drive (Target folder: "Meeting Koordinasi")
// ===========================================================================
function setupTadminUploadModal() {
  const modal = document.getElementById('tadminUploadModal');
  const form = document.getElementById('tadminUploadForm');
  const btnCancel = document.getElementById('btnCancelTadminUpload');

  btnCancel?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const categoryKey = document.getElementById('tadminUploadCategoryKey').value;
    const scopeType = document.getElementById('tadminUploadScopeType').value;
    const scopeValue = document.getElementById('tadminUploadScopeValue').value;
    const fileInput = document.getElementById('tadminFileInput');
    const driveLink = document.getElementById('tadminDriveLinkInput').value.trim();
    const progress = document.getElementById('tadminUploadProgress');
    const progressText = document.getElementById('tadminUploadProgressText');
    const submitBtn = document.getElementById('btnSubmitTadminUpload');

    const year = document.getElementById('tadminYearSelect')?.value || '';
    const teacher = document.getElementById('tadminTeacherSelect')?.value || '';

    if (!year || !teacher) {
      alert("Missing school year or teacher name.");
      return;
    }

    let fileUrl = driveLink;
    let fileName = '';

    const file = fileInput?.files?.[0];
    if (!file && !driveLink) {
      alert("Please select a file to upload or paste a direct Google Drive link.");
      return;
    }

    if (file) {
      fileName = file.name;
      if (progress) progress.style.display = 'block';
      if (progressText) progressText.textContent = `Reading ${file.name}...`;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const base64Data = await readFileAsBase64(file);
        if (progressText) progressText.textContent = `Uploading to Google Drive (Folder: Meeting Koordinasi)...`;

        const scriptUrl = localStorage.getItem('meetingDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
        const folderId = localStorage.getItem('meetingDriveFolderId') || '';

        if (scriptUrl) {
          const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              base64Data: base64Data,
              targetFolder: "Meeting Koordinasi",
              folderName: "Meeting Koordinasi",
              folderId: folderId,
              type: "teacher_administration"
            })
          });

          const resText = await response.text();
          let resJson;
          try {
            resJson = JSON.parse(resText);
          } catch (pe) {
            console.warn("Raw script response:", resText);
          }

          if (resJson && resJson.status === 'success' && (resJson.photoUrl || resJson.fileUrl)) {
            fileUrl = resJson.photoUrl || resJson.fileUrl;
          } else {
            console.warn("Drive webhook returned non-success, using data URL fallback:", resJson);
            if (file.size < 800000) {
              fileUrl = `data:${file.type};base64,${base64Data}`;
            } else {
              throw new Error(resJson?.message || "Google Drive upload script did not return a valid file URL.");
            }
          }
        } else {
          if (file.size < 800000) {
            fileUrl = `data:${file.type};base64,${base64Data}`;
          } else {
            throw new Error("Google Drive Webhook script is not configured in Admin Dashboard > Google Drive. Please configure it or enter a direct link.");
          }
        }
      } catch (uploadErr) {
        console.error("Upload error:", uploadErr);
        alert("Upload Error: " + uploadErr.message);
        if (progress) progress.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    } else {
      fileName = driveLink.split('/').pop().split('?')[0] || 'Cloud Document';
    }

    // Save to Firestore
    try {
      const recordKey = getTadminRecordKey(year, teacher);
      const record = getTeacherRecord(year, teacher);

      const submissionPayload = {
        fileName: fileName,
        fileUrl: fileUrl,
        uploadedAt: new Date().toISOString(),
        verified: false,
        verifiedBy: null,
        verifiedAt: null
      };

      if (scopeType === 'theme') {
        if (!record.themeSubmissions) record.themeSubmissions = {};
        if (!record.themeSubmissions[scopeValue]) record.themeSubmissions[scopeValue] = {};
        record.themeSubmissions[scopeValue][categoryKey] = submissionPayload;
      } else if (scopeType === 'semester') {
        if (!record.semesterSubmissions) record.semesterSubmissions = {};
        if (!record.semesterSubmissions[scopeValue]) record.semesterSubmissions[scopeValue] = {};
        record.semesterSubmissions[scopeValue][categoryKey] = submissionPayload;
      }

      teacherAdministrationData[recordKey] = record;
      await setDoc(doc(db, "schedules", "teacherAdministration"), { [recordKey]: record }, { merge: true });

      triggerCelebration();
      if (modal) modal.style.display = 'none';
      renderTeacherAdministrationView();
      renderTeacherAdminOverviewTable();
      alert("Administration document uploaded successfully!");
    } catch (saveErr) {
      console.error("Save error:", saveErr);
      alert("Error saving document to database: " + saveErr.message);
    } finally {
      if (progress) progress.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

window.openAdminUploadModal = function(categoryKey, scopeType, scopeValue, displayTitle) {
  const modal = document.getElementById('tadminUploadModal');
  const catInput = document.getElementById('tadminUploadCategoryKey');
  const scopeTypeInput = document.getElementById('tadminUploadScopeType');
  const scopeValInput = document.getElementById('tadminUploadScopeValue');
  const badge = document.getElementById('tadminUploadTargetBadge');
  const fileInput = document.getElementById('tadminFileInput');
  const linkInput = document.getElementById('tadminDriveLinkInput');
  const progress = document.getElementById('tadminUploadProgress');

  if (catInput) catInput.value = categoryKey;
  if (scopeTypeInput) scopeTypeInput.value = scopeType;
  if (scopeValInput) scopeValInput.value = scopeValue;
  if (badge) badge.textContent = `${displayTitle} — Meeting Koordinasi`;
  if (fileInput) fileInput.value = '';
  if (linkInput) linkInput.value = '';
  if (progress) progress.style.display = 'none';

  if (modal) modal.style.display = 'flex';
};

// ===========================================================================
// Review Questions Modal & Logic
// ===========================================================================
function setupTadminReviewQuestionModal() {
  const modal = document.getElementById('tadminAddReviewQuestionModal');
  const form = document.getElementById('tadminAddReviewQuestionForm');
  const btnCancel = document.getElementById('btnCancelTadminAddRQ');

  btnCancel?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('tadminRQTitleInput').value.trim();
    const grade = document.getElementById('tadminRQGradeInput').value.trim();
    const subject = document.getElementById('tadminRQSubjectInput').value.trim();
    const fileInput = document.getElementById('tadminRQFileInput');
    const driveLink = document.getElementById('tadminRQDriveLinkInput').value.trim();
    const progress = document.getElementById('tadminRQProgress');
    const submitBtn = document.getElementById('btnSubmitTadminAddRQ');

    const year = document.getElementById('tadminYearSelect')?.value || '';
    const teacher = document.getElementById('tadminTeacherSelect')?.value || '';

    if (!title) {
      alert("Please enter a title for this review questions item.");
      return;
    }

    let fileUrl = driveLink;
    let fileName = '';

    const file = fileInput?.files?.[0];
    if (file) {
      fileName = file.name;
      if (progress) progress.style.display = 'block';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const base64Data = await readFileAsBase64(file);
        const scriptUrl = localStorage.getItem('meetingDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
        const folderId = localStorage.getItem('meetingDriveFolderId') || '';

        if (scriptUrl) {
          const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              base64Data: base64Data,
              targetFolder: "Meeting Koordinasi",
              folderName: "Meeting Koordinasi",
              folderId: folderId,
              type: "teacher_administration"
            })
          });

          const resText = await response.text();
          let resJson;
          try { resJson = JSON.parse(resText); } catch (e) {}

          if (resJson && resJson.status === 'success' && (resJson.photoUrl || resJson.fileUrl)) {
            fileUrl = resJson.photoUrl || resJson.fileUrl;
          } else if (file.size < 800000) {
            fileUrl = `data:${file.type};base64,${base64Data}`;
          }
        } else if (file.size < 800000) {
          fileUrl = `data:${file.type};base64,${base64Data}`;
        }
      } catch (err) {
        console.warn("RQ file upload error:", err);
      } finally {
        if (progress) progress.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    try {
      const recordKey = getTadminRecordKey(year, teacher);
      const record = getTeacherRecord(year, teacher);
      if (!Array.isArray(record.reviewQuestions)) record.reviewQuestions = [];

      const newItem = {
        id: 'rq_' + Date.now(),
        title: title,
        grade: grade,
        subject: subject,
        fileName: fileName,
        fileUrl: fileUrl,
        uploadedAt: new Date().toISOString(),
        verified: false,
        verifiedBy: null,
        verifiedAt: null
      };

      record.reviewQuestions.push(newItem);
      teacherAdministrationData[recordKey] = record;
      await setDoc(doc(db, "schedules", "teacherAdministration"), { [recordKey]: record }, { merge: true });

      triggerCelebration();
      if (modal) modal.style.display = 'none';
      form.reset();
      renderTeacherAdministrationView();
      renderTeacherAdminOverviewTable();
      alert("Review Questions item added successfully!");
    } catch (err) {
      console.error("Save RQ error:", err);
      alert("Error adding review question item: " + err.message);
    }
  });
}

window.openAddReviewQuestionModal = function() {
  const modal = document.getElementById('tadminAddReviewQuestionModal');
  const form = document.getElementById('tadminAddReviewQuestionForm');
  if (form) form.reset();
  if (modal) modal.style.display = 'flex';
};

window.deleteAdminReviewQuestionItem = async function(itemId) {
  if (!confirm("Are you sure you want to delete this review questions item?")) return;

  const year = document.getElementById('tadminYearSelect')?.value || '';
  const teacher = document.getElementById('tadminTeacherSelect')?.value || '';
  const recordKey = getTadminRecordKey(year, teacher);
  const record = getTeacherRecord(year, teacher);

  if (Array.isArray(record.reviewQuestions)) {
    record.reviewQuestions = record.reviewQuestions.filter((item, idx) => item.id !== itemId && String(idx) !== String(itemId));
    teacherAdministrationData[recordKey] = record;
    await setDoc(doc(db, "schedules", "teacherAdministration"), { [recordKey]: record }, { merge: true });
    renderTeacherAdministrationView();
    renderTeacherAdminOverviewTable();
  }
};

// ===========================================================================
// Admin Checklist Verification Toggle
// ===========================================================================
window.toggleAdminChecklistStatus = async function(categoryKey, scopeType, scopeValue, newVerifiedState) {
  if (!isAdminUser()) {
    alert("Only administrators can checklist or verify documents.");
    return;
  }

  const year = document.getElementById('tadminYearSelect')?.value || '';
  const teacher = document.getElementById('tadminTeacherSelect')?.value || '';
  const recordKey = getTadminRecordKey(year, teacher);
  const record = getTeacherRecord(year, teacher);
  const adminEmail = auth.currentUser?.email || 'admin';

  let targetItem = null;
  if (scopeType === 'theme') {
    targetItem = record.themeSubmissions?.[scopeValue]?.[categoryKey];
  } else if (scopeType === 'semester') {
    targetItem = record.semesterSubmissions?.[scopeValue]?.[categoryKey];
  }

  if (!targetItem) return;

  targetItem.verified = newVerifiedState;
  targetItem.verifiedBy = newVerifiedState ? adminEmail : null;
  targetItem.verifiedAt = newVerifiedState ? new Date().toISOString() : null;

  try {
    teacherAdministrationData[recordKey] = record;
    await setDoc(doc(db, "schedules", "teacherAdministration"), { [recordKey]: record }, { merge: true });
    if (newVerifiedState) triggerCelebration();
    renderTeacherAdministrationView();
    renderTeacherAdminOverviewTable();
  } catch (err) {
    console.error("Checklist toggle error:", err);
    alert("Could not update checklist mark: " + err.message);
  }
};

window.toggleAdminRQChecklistStatus = async function(itemId, newVerifiedState) {
  if (!isAdminUser()) {
    alert("Only administrators can checklist or verify documents.");
    return;
  }

  const year = document.getElementById('tadminYearSelect')?.value || '';
  const teacher = document.getElementById('tadminTeacherSelect')?.value || '';
  const recordKey = getTadminRecordKey(year, teacher);
  const record = getTeacherRecord(year, teacher);
  const adminEmail = auth.currentUser?.email || 'admin';

  if (Array.isArray(record.reviewQuestions)) {
    const item = record.reviewQuestions.find((rq, idx) => rq.id === itemId || String(idx) === String(itemId));
    if (item) {
      item.verified = newVerifiedState;
      item.verifiedBy = newVerifiedState ? adminEmail : null;
      item.verifiedAt = newVerifiedState ? new Date().toISOString() : null;

      teacherAdministrationData[recordKey] = record;
      await setDoc(doc(db, "schedules", "teacherAdministration"), { [recordKey]: record }, { merge: true });
      if (newVerifiedState) triggerCelebration();
      renderTeacherAdministrationView();
      renderTeacherAdminOverviewTable();
    }
  }
};

// ===========================================================================
// In-App Document Viewer / Previewer Modal
// ===========================================================================
function setupTadminDocPreviewModal() {
  const modal = document.getElementById('tadminDocPreviewModal');
  const btnClose = document.getElementById('btnTadminClosePreview');

  btnClose?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
    const iframe = document.getElementById('tadminPreviewIframe');
    if (iframe) iframe.src = 'about:blank';
  });
}

window.openAdminDocPreview = function(fileUrl, fileName, categoryTitle, teacherName) {
  const modal = document.getElementById('tadminDocPreviewModal');
  const titleEl = document.getElementById('tadminPreviewDocTitle');
  const metaEl = document.getElementById('tadminPreviewDocMeta');
  const openExternal = document.getElementById('tadminPreviewOpenExternalBtn');
  const iframe = document.getElementById('tadminPreviewIframe');
  const img = document.getElementById('tadminPreviewImg');
  const loading = document.getElementById('tadminPreviewLoading');

  if (!fileUrl) {
    alert("No document URL available to preview.");
    return;
  }

  if (titleEl) titleEl.textContent = fileName || categoryTitle || 'Document Preview';
  if (metaEl) metaEl.textContent = `${categoryTitle} • Teacher: ${teacherName}`;
  if (openExternal) openExternal.href = fileUrl;

  if (loading) loading.style.display = 'block';
  if (iframe) { iframe.style.display = 'none'; iframe.src = ''; }
  if (img) { img.style.display = 'none'; img.src = ''; }

  const urlLower = (fileUrl || '').toLowerCase();
  const isImage = urlLower.endsWith('.png') || urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg') || urlLower.endsWith('.webp') || fileUrl.startsWith('data:image/');

  if (isImage) {
    if (img) {
      img.src = fileUrl;
      img.onload = () => {
        if (loading) loading.style.display = 'none';
        img.style.display = 'block';
      };
      img.onerror = () => {
        if (loading) loading.textContent = 'Could not load image preview.';
      };
    }
  } else {
    let embedUrl = fileUrl;
    const driveMatch = fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    } else if (fileUrl.includes('docs.google.com/document/d/')) {
      embedUrl = fileUrl.replace(/\/edit.*$/, '/preview');
    } else if (fileUrl.includes('docs.google.com/spreadsheets/d/')) {
      embedUrl = fileUrl.replace(/\/edit.*$/, '/preview');
    } else if (fileUrl.includes('docs.google.com/presentation/d/')) {
      embedUrl = fileUrl.replace(/\/edit.*$/, '/preview');
    } else if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      embedUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
    }

    if (iframe) {
      iframe.src = embedUrl;
      iframe.onload = () => {
        if (loading) loading.style.display = 'none';
        iframe.style.display = 'block';
      };
      iframe.style.display = 'block';
    }
  }

  if (modal) modal.style.display = 'flex';
};

// ===========================================================================
// Export Teacher Administration to Excel
// ===========================================================================
function exportTeacherAdministrationToExcel() {
  if (typeof XLSX === 'undefined') {
    alert("XLSX export library is loading. Please try again in a moment.");
    return;
  }

  const year = document.getElementById('tadminYearSelect')?.value || 'Academic Year';
  const teachers = (appEntities && Array.isArray(appEntities.teachers)) ? [...appEntities.teachers] : [];
  teachers.sort((a, b) => a.localeCompare(b));

  const themes = ['Theme 1', 'Theme 2', 'Theme 3', 'Theme 4'];
  const semesters = ['Semester 1', 'Semester 2'];

  const rows = [];
  rows.push([`MITRA KASIH SCHOOL - TEACHER ADMINISTRATION AUDIT REPORT`]);
  rows.push([`School Year: ${year}`, `Export Date: ${new Date().toLocaleDateString()}`]);
  rows.push([]);

  // Table Headers
  const headerRow = [
    'No',
    'Teacher Name',
    ...themes.flatMap(th => TADMIN_THEME_CATEGORIES.map(cat => `${th} - ${cat.title}`)),
    ...semesters.flatMap(sem => TADMIN_SEMESTER_CATEGORIES.map(cat => `${sem} - ${cat.title}`)),
    'Review Questions Count',
    'Total Submitted (out of 24)',
    'Total Verified (out of 24)',
    'Completion %',
    'Status'
  ];
  rows.push(headerRow);

  teachers.forEach((teacher, idx) => {
    const record = getTeacherRecord(year, teacher);
    const themeSub = record.themeSubmissions || {};
    const semSub = record.semesterSubmissions || {};
    const rq = Array.isArray(record.reviewQuestions) ? record.reviewQuestions : [];

    let submittedCount = 0;
    let verifiedCount = 0;

    const rowData = [idx + 1, teacher];

    // Part A
    themes.forEach(th => {
      const tData = themeSub[th] || {};
      TADMIN_THEME_CATEGORIES.forEach(cat => {
        const item = tData[cat.key];
        if (item && (item.fileUrl || item.fileName)) {
          submittedCount++;
          if (item.verified === true) {
            verifiedCount++;
            rowData.push('Verified');
          } else {
            rowData.push('Submitted');
          }
        } else {
          rowData.push('Missing');
        }
      });
    });

    // Part B
    semesters.forEach(sem => {
      const sData = semSub[sem] || {};
      TADMIN_SEMESTER_CATEGORIES.forEach(cat => {
        const item = sData[cat.key];
        if (item && (item.fileUrl || item.fileName)) {
          submittedCount++;
          if (item.verified === true) {
            verifiedCount++;
            rowData.push('Verified');
          } else {
            rowData.push('Submitted');
          }
        } else {
          rowData.push('Missing');
        }
      });
    });

    // Part C
    rowData.push(rq.length);

    // Summary
    const pct = Math.round((submittedCount / 24) * 100);
    rowData.push(`${submittedCount}/24`);
    rowData.push(`${verifiedCount}/24`);
    rowData.push(`${pct}%`);
    rowData.push(verifiedCount === 24 ? 'All Verified' : (submittedCount > verifiedCount ? 'Pending Review' : 'Incomplete'));

    rows.push(rowData);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teacher Administration");

  const cleanYear = year.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Teacher_Administration_Report_${cleanYear}.xlsx`);
}



export { exportTeacherAdministrationToExcel };
