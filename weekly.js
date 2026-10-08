import {
  doc,
  setDoc,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  escapeHtml,
  triggerCelebration,
  attachRippleEffect,
  initStaggeredReveals
} from "./utils.js";
import { getCurrentLanguage, toggleLanguage, applyTranslations, t } from "./weeklyI18n.js";

// Shared State & Firebase Context
import {
  db,
  auth,
  appEntities,
  setAppEntities,
  classNotesData,
  setClassNotesData,
  masterSchedules,
  setMasterSchedules,
  weeklyOverrides,
  setWeeklyOverrides,
  materialsData,
  setMaterialsData,
  academicCalendar,
  setAcademicCalendar,
  isClassEditMode,
  fetchCurrentUserRole,
  isAdminUser,
  isTeacherUser,
  getLoggedInTeacherName,
  updateUniformBadges,
  sortWeeks,
  formatModernDateRange,
  canAccessRewardView
} from "./js/weekly/weeklyState.js";

// Tab Modules
import {
  renderClassSchedule,
  enterClassEditMode,
  exitClassEditMode,
  exportWeeklyToExcel
} from "./js/weekly/tabClassView.js";
import {
  renderTeacherView,
  exportTeacherToExcel
} from "./js/weekly/tabTeacherView.js";
import {
  renderEntityTables,
  renderManageScheduleTable,
  renderManageThemesTable,
  populateAdminSelects,
  populateAdminCalendarDropdowns,
  syncEntitiesFromMasterSchedules,
  updateAdminPeriodSelectOptions
} from "./js/weekly/tabAdminView.js";
import {
  initTeacherSchedulesView,
  initFloatingRichTextToolbar,
  initTeacherSchedulesFirestoreListener,
  initScheduleExcelImport,
  updateLoginVisualDayNight
} from "./js/weekly/tabTeacherSchedules.js";
import {
  initRewardView,
  populateRewardSelects
} from "./js/weekly/tabRewardView.js";
import {
  initMeetingView,
  populateMeetingReportSelects
} from "./js/weekly/tabMeetingView.js";
import {
  initScheduleBuilderView
} from "./js/weekly/tabScheduleBuilder.js";
import {
  initTeacherAdministrationView,
  exportTeacherAdministrationToExcel
} from "./js/weekly/tabTeacherAdministration.js";

// ===========================================================================
// NAVIGATION & ACCESS CONTROL REGISTRY
// ===========================================================================
export const SYSTEM_WEEKLY_TABS = [
  { id: 'classView', btnId: 'btnClassView', name: 'Class View', description: 'Interactive weekly timetable for students & classes' },
  { id: 'teacherView', btnId: 'btnTeacherView', name: 'Teacher Entry', description: 'Teacher weekly schedule & period materials entry' },
  { id: 'teacherSchedulesView', btnId: 'btnTeacherSchedulesView', name: 'Teacher Schedules', description: 'All-in-one duty, prayer, and administrative teacher schedules' },
  { id: 'adminAdministrationView', btnId: 'btnAdminAdministrationView', name: 'Administration', description: 'Teacher administration submissions and admin verification checklist' },
  { id: 'rewardView', btnId: 'btnRewardView', name: 'Character & Skill Reward', description: 'Character & skill rewards nomination and master ledger' },
  { id: 'meetingView', btnId: 'btnMeetingView', name: 'Meeting & Coordination', description: 'Meeting summary, staff attendance & teacher reports' },
  { id: 'scheduleBuilderView', btnId: 'btnScheduleBuilderView', name: 'Class Schedule Builder', description: 'Automated timetable generator for next academic year', adminOnly: true },
  { id: 'adminView', btnId: 'btnAdminView', name: 'Admin Dashboard', description: 'Full system administration & resource management', adminOnly: true }
];

export let weeklyTabPermissions = {
  classView: true,
  teacherView: true,
  teacherSchedulesView: true,
  adminAdministrationView: true,
  rewardView: true,
  meetingView: true,
  scheduleBuilderView: false,
  adminView: false
};

export function applyTabPermissions() {
  const isSuperAdmin = isAdminUser();
  const visibleTabIds = [];

  SYSTEM_WEEKLY_TABS.forEach(tab => {
    const btn = document.getElementById(tab.btnId);
    if (!btn) return;

    if (isSuperAdmin) {
      btn.style.display = '';
      visibleTabIds.push(tab.id);
    } else {
      if (tab.adminOnly || weeklyTabPermissions[tab.id] === false) {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
        visibleTabIds.push(tab.id);
      }
    }
  });

  const activeBtn = document.querySelector('.nav-tabs .tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const firstVisible = SYSTEM_WEEKLY_TABS.find(t => visibleTabIds.includes(t.id));
    if (firstVisible) {
      document.getElementById(firstVisible.btnId)?.click();
    }
  }
}

export function renderActiveTabsControlTable() {
  const tbody = document.getElementById('tableActiveTabsControl');
  if (!tbody) return;

  let html = '';
  SYSTEM_WEEKLY_TABS.forEach((tab, index) => {
    const isAllowed = tab.adminOnly ? false : (weeklyTabPermissions[tab.id] !== false);
    const isDisabled = tab.adminOnly ? 'disabled' : '';
    const statusBadge = tab.adminOnly
      ? `<span style="font-size: 11px; font-weight: 700; color: #dc2626; background: #fef2f2; padding: 3px 8px; border-radius: 12px; border: 1px solid #fca5a5;">Admin Only</span>`
      : (isAllowed
        ? `<span style="font-size: 11px; font-weight: 700; color: #15803d; background: #f0fdf4; padding: 3px 8px; border-radius: 12px; border: 1px solid #bbf7d0;">Active (Visible)</span>`
        : `<span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; padding: 3px 8px; border-radius: 12px; border: 1px solid #e2e8f0;">Disabled (Hidden)</span>`);

    html += `
      <tr>
        <td style="text-align: center; font-weight: bold;">${index + 1}</td>
        <td>
          <strong style="font-size: 13.5px; color: #0f172a;">${escapeHtml(tab.name)}</strong>
        </td>
        <td style="text-align: center;">
          <label class="toggle-switch">
            <input type="checkbox" data-tab-id="${tab.id}" ${isAllowed ? 'checked' : ''} ${isDisabled} onchange="window.handleTabPermissionToggle('${tab.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td style="text-align: center;">
          ${statusBadge}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.handleTabPermissionToggle = async function(tabId, isChecked) {
  if (!isAdminUser()) {
    alert("Only administrators can configure tab visibility.");
    return;
  }
  weeklyTabPermissions[tabId] = isChecked;
  applyTabPermissions();
  renderActiveTabsControlTable();

  try {
    await setDoc(doc(db, "schedules", "tabPermissions"), { [tabId]: isChecked }, { merge: true });
  } catch (err) {
    console.error("Error saving tab permissions:", err);
    alert("Could not update tab permission: " + err.message);
  }
};

try {
  onSnapshot(doc(db, "schedules", "tabPermissions"), (docSnap) => {
    if (docSnap.exists()) {
      weeklyTabPermissions = { ...weeklyTabPermissions, ...docSnap.data() };
    }
    applyTabPermissions();
    renderActiveTabsControlTable();
  }, (err) => {
    console.warn("Could not listen to tabPermissions:", err);
  });
} catch (e) {
  console.warn("tabPermissions snapshot setup skipped:", e);
}

// ======================================================
// APP UPDATE & DEEP CACHE PURGE SYSTEM
// ======================================================
export let currentAppUpdateConfig = {
  enabled: false,
  updateId: 'v_default',
  title: 'Portal Update Ready',
  message: 'We have updated the portal with important bug fixes and system improvements. Click below to clear stored caches and load the latest version.',
  allowSkip: false
};

export async function executeDeepCachePurge(targetUpdateId = null) {
  const btn = document.getElementById('btnExecuteAppUpdate');
  const btnText = document.getElementById('btnExecuteAppUpdateText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = t('update_modal_loading') || 'Clearing cache & reloading...';

  try {
    // 1. Unregister all Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
  } catch (err) {
    console.warn("SW unregister error:", err);
  }

  try {
    // 2. Delete all CacheStorage caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch (err) {
    console.warn("CacheStorage delete error:", err);
  }

  try {
    // 3. Clear cookies
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      if (name) {
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
        const hostParts = window.location.hostname.split('.');
        if (hostParts.length > 1) {
          document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
        }
      }
    }
  } catch (err) {
    console.warn("Cookies clear error:", err);
  }

  try {
    // 4. Clear sessionStorage
    sessionStorage.clear();
  } catch (err) {
    console.warn("sessionStorage clear error:", err);
  }

  try {
    // 5. Clear IndexedDB databases (resets Firestore offline persistence cache)
    if (window.indexedDB && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const dbInfo of dbs) {
        if (dbInfo.name) {
          indexedDB.deleteDatabase(dbInfo.name);
        }
      }
    }
  } catch (err) {
    console.warn("IndexedDB clear error:", err);
  }

  try {
    // 6. Record applied update ID before clearing, then save only that ID to prevent infinite reload loops
    const idToSave = targetUpdateId || ('manual_' + Date.now());
    localStorage.clear();
    localStorage.setItem('mks_weekly_applied_update_id', idToSave);
  } catch (err) {
    console.warn("localStorage clear error:", err);
  }

  // 7. Force cache-busting hard reload
  const targetUrl = new URL(window.location.origin + window.location.pathname);
  targetUrl.searchParams.set('_v', Date.now().toString());
  window.location.replace(targetUrl.toString());
}

export function initAppUpdateListener() {
  try {
    onSnapshot(doc(db, "config", "weeklyAppUpdate"), (docSnap) => {
      if (docSnap.exists()) {
        currentAppUpdateConfig = { ...currentAppUpdateConfig, ...docSnap.data() };
      } else {
        currentAppUpdateConfig = {
          enabled: false,
          updateId: 'v_default',
          title: 'Portal Update Ready',
          message: 'We have updated the portal with important bug fixes and system improvements. Click below to clear stored caches and load the latest version.',
          allowSkip: false
        };
      }
      checkAndPromptAppUpdate();
      renderAppUpdateControlPanel();
    }, (err) => {
      console.warn("Could not listen to config/weeklyAppUpdate:", err);
    });
  } catch (err) {
    console.warn("App update listener setup skipped:", err);
  }
}

export function checkAndPromptAppUpdate() {
  const modal = document.getElementById('appUpdateModal');
  if (!modal) return;

  if (!currentAppUpdateConfig || !currentAppUpdateConfig.enabled) {
    modal.style.display = 'none';
    return;
  }

  const currentUpdateId = currentAppUpdateConfig.updateId || 'v_default';
  const appliedUpdateId = localStorage.getItem('mks_weekly_applied_update_id');

  // If already applied on this browser, keep it hidden
  if (appliedUpdateId === currentUpdateId) {
    modal.style.display = 'none';
    return;
  }

  // Otherwise, user needs to update! Display update modal
  const titleEl = document.getElementById('appUpdateModalTitle');
  const msgEl = document.getElementById('appUpdateModalMessage');
  const skipBtn = document.getElementById('btnSkipAppUpdate');

  if (titleEl && currentAppUpdateConfig.title) {
    titleEl.textContent = currentAppUpdateConfig.title;
  }
  if (msgEl && currentAppUpdateConfig.message) {
    msgEl.textContent = currentAppUpdateConfig.message;
  }
  if (skipBtn) {
    skipBtn.style.display = currentAppUpdateConfig.allowSkip ? 'inline-block' : 'none';
  }

  modal.style.display = 'flex';
}

export function renderAppUpdateControlPanel() {
  const toggle = document.getElementById('toggleAppUpdateModal');
  const versionInput = document.getElementById('adminUpdateVersionInput');
  const msgInput = document.getElementById('adminUpdateMessageInput');
  const allowSkipToggle = document.getElementById('toggleAllowSkipUpdate');
  const badge = document.getElementById('updateModalStatusBadge');

  if (!toggle) return;

  const isEnabled = !!currentAppUpdateConfig.enabled;
  toggle.checked = isEnabled;
  if (badge) {
    if (isEnabled) {
      badge.textContent = "Active (Prompting Users)";
      badge.style.background = "#dcfce7";
      badge.style.color = "#15803d";
      badge.style.border = "1px solid #86efac";
    } else {
      badge.textContent = "Disabled";
      badge.style.background = "#f1f5f9";
      badge.style.color = "#64748b";
      badge.style.border = "1px solid #cbd5e1";
    }
  }

  if (versionInput && !versionInput.matches(':focus')) {
    versionInput.value = currentAppUpdateConfig.updateId || '';
  }
  if (msgInput && !msgInput.matches(':focus')) {
    msgInput.value = currentAppUpdateConfig.message || '';
  }
  if (allowSkipToggle) {
    allowSkipToggle.checked = !!currentAppUpdateConfig.allowSkip;
  }
}

export async function saveAppUpdateSettings(newSettings = {}) {
  if (!isAdminUser()) {
    alert("Only administrators can configure update settings.");
    return false;
  }

  const feedback = document.getElementById('adminUpdateStatusFeedback');
  const saveBtn = document.getElementById('btnSaveAppUpdateSettings');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const payload = {
      enabled: newSettings.enabled !== undefined ? newSettings.enabled : (document.getElementById('toggleAppUpdateModal')?.checked || false),
      updateId: (newSettings.updateId !== undefined ? newSettings.updateId : document.getElementById('adminUpdateVersionInput')?.value.trim()) || ('v_' + Date.now()),
      message: (newSettings.message !== undefined ? newSettings.message : document.getElementById('adminUpdateMessageInput')?.value.trim()) || 'We have updated the portal with important bug fixes and system improvements. Click below to clear stored caches and load the latest version.',
      allowSkip: newSettings.allowSkip !== undefined ? newSettings.allowSkip : (document.getElementById('toggleAllowSkipUpdate')?.checked || false),
      updatedAt: Date.now(),
      updatedBy: auth.currentUser?.email || 'admin'
    };

    await setDoc(doc(db, "config", "weeklyAppUpdate"), payload, { merge: true });

    currentAppUpdateConfig = { ...currentAppUpdateConfig, ...payload };
    renderAppUpdateControlPanel();
    checkAndPromptAppUpdate();

    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = '#f0fdf4';
      feedback.style.color = '#15803d';
      feedback.style.border = '1px solid #bbf7d0';
      feedback.textContent = '✓ Update settings saved! Users will be prompted according to this configuration.';
      setTimeout(() => { feedback.style.display = 'none'; }, 4000);
    }
    return true;
  } catch (err) {
    console.error("Error saving app update settings:", err);
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = '#fef2f2';
      feedback.style.color = '#dc2626';
      feedback.style.border = '1px solid #fecaca';
      feedback.textContent = 'Failed to save settings: ' + err.message;
    }
    alert("Error saving app update settings: " + err.message);
    return false;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

export function initAppUpdateUIEvents() {
  // 1. User clicks Update on modal
  document.getElementById('btnExecuteAppUpdate')?.addEventListener('click', () => {
    executeDeepCachePurge(currentAppUpdateConfig?.updateId);
  });

  // 2. User skips update if allowed
  document.getElementById('btnSkipAppUpdate')?.addEventListener('click', () => {
    const modal = document.getElementById('appUpdateModal');
    if (modal) modal.style.display = 'none';
  });

  // 3. Fallback manual clear cache on login screen
  document.getElementById('btnManualClearCacheLink')?.addEventListener('click', () => {
    if (confirm("Clear all browser cache, cookies, and temporary site data to reload the newest version of the page?")) {
      executeDeepCachePurge(currentAppUpdateConfig?.updateId);
    }
  });

  // 4. Admin Toggle Switch
  document.getElementById('toggleAppUpdateModal')?.addEventListener('change', (e) => {
    saveAppUpdateSettings({ enabled: e.target.checked });
  });

  // 5. Admin Generate New Update ID
  document.getElementById('btnGenerateUpdateId')?.addEventListener('click', () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const newId = 'v_' + now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes());
    const input = document.getElementById('adminUpdateVersionInput');
    if (input) {
      input.value = newId;
      input.focus();
    }
    const feedback = document.getElementById('adminUpdateStatusFeedback');
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.background = '#eff6ff';
      feedback.style.color = '#1d4ed8';
      feedback.style.border = '1px solid #bfdbfe';
      feedback.textContent = `Generated new ID: ${newId}. Click "Save Update Settings" to push to all users.`;
      setTimeout(() => { feedback.style.display = 'none'; }, 4000);
    }
  });

  // 6. Admin Save Button
  document.getElementById('btnSaveAppUpdateSettings')?.addEventListener('click', () => {
    saveAppUpdateSettings();
  });

  // 7. Admin Test Cache Clear
  document.getElementById('btnAdminTestClearCache')?.addEventListener('click', () => {
    if (confirm("This will clear your local browser cache, service workers, cookies, and reload the latest page. Continue?")) {
      executeDeepCachePurge(currentAppUpdateConfig?.updateId);
    }
  });
}

window.executeDeepCachePurge = executeDeepCachePurge;
window.saveAppUpdateSettings = saveAppUpdateSettings;

export function updateClassEditButtonState() {
  const selectedClass = document.getElementById('classSelectView')?.value;
  const btnEdit = document.getElementById('btnEditClassWeekly');
  const btnEditText = document.getElementById('btnEditClassWeeklyText');
  const toolbar = document.getElementById('classEditToolbar');
  const container = document.getElementById('printableArea');

  if (!btnEdit) return;

  const canEdit = isAdminUser() || (isTeacherUser() && appEntities.homeTeachers?.[getLoggedInTeacherName()] === selectedClass);
  btnEdit.style.display = canEdit ? 'inline-flex' : 'none';

  if (!canEdit && isClassEditMode) {
    exitClassEditMode(false);
  }

  if (isClassEditMode) {
    btnEdit.classList.add('active-editing');
    if (btnEditText) btnEditText.textContent = 'Exit Edit Mode';
    if (toolbar) toolbar.style.display = 'flex';
    if (container) container.classList.add('is-editing');
    const subtitle = document.getElementById('editToolbarSubtitle');
    const week = document.getElementById('classWeekSelect')?.value || 'Week';
    if (subtitle) subtitle.textContent = `Editing schedule & materials for ${selectedClass} (${week}) — changes apply only to this week`;
  } else {
    btnEdit.classList.remove('active-editing');
    if (btnEditText) btnEditText.textContent = 'Edit Weekly Schedule';
    if (toolbar) toolbar.style.display = 'none';
    if (container) container.classList.remove('is-editing');
  }
}

export function checkUserRoleAccess() {
  const user = auth.currentUser;
  const teacherSelectContainer = document.getElementById('teacherSelectContainer');

  if (!user) return;

  updateClassEditButtonState();
  applyTabPermissions();

  if (isTeacherUser()) {
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'none';

    const tName = getLoggedInTeacherName();
    const tSelect = document.getElementById('teacherSelectView');
    if (tSelect && tName) {
      tSelect.innerHTML = `<option value="${tName}">${tName}</option>`;
      tSelect.value = tName;
    }
    renderTeacherView();

    const reportTeacherSel = document.getElementById('reportTeacherSelect');
    if (reportTeacherSel && tName) {
      reportTeacherSel.innerHTML = `<option value="${tName}">${tName}</option>`;
      reportTeacherSel.value = tName;
      reportTeacherSel.disabled = true;
      reportTeacherSel.style.backgroundColor = '#f1f5f9';
      reportTeacherSel.style.cursor = 'not-allowed';
    }

    const adminTab = document.getElementById('adminView');
    if (adminTab && adminTab.classList.contains('active')) {
      switchTab('classView', document.getElementById('btnClassView'));
    }

    const rewardTab = document.getElementById('rewardView');
    if (rewardTab && rewardTab.classList.contains('active') && !canAccessRewardView()) {
      switchTab('classView', document.getElementById('btnClassView'));
    }
  } else if (isAdminUser()) {
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'flex';
    const reportTeacherSel = document.getElementById('reportTeacherSelect');
    if (reportTeacherSel) {
      reportTeacherSel.disabled = false;
      reportTeacherSel.style.backgroundColor = '#ffffff';
      reportTeacherSel.style.cursor = 'pointer';
    }
    renderActiveTabsControlTable();
  } else {
    if (teacherSelectContainer) teacherSelectContainer.style.display = 'none';
  }
}

export async function loadDriveFolderSettings() {
  const inputScript = document.getElementById('inputMeetingDriveScriptUrl');
  const inputFolder = document.getElementById('inputMeetingDriveFolderId');

  let scriptUrl = localStorage.getItem('meetingDriveScriptUrl') || localStorage.getItem('weeklyDriveScriptUrl') || '';
  let folderId = localStorage.getItem('meetingDriveFolderId') || '';

  try {
    let snap = await getDoc(doc(db, "system_settings", "google_drive"));
    if (!snap.exists()) snap = await getDoc(doc(db, "system_settings", "googleDrive"));
    if (snap.exists()) {
      const data = snap.data();
      scriptUrl = data.weeklyScriptUrl || data.scriptUrlWeekly || data.meetingScriptUrl || scriptUrl;
      folderId = data.weeklyFolderId || data.folderIdWeekly || data.meetingFolderId || folderId;
      if (scriptUrl) localStorage.setItem('meetingDriveScriptUrl', scriptUrl);
      if (folderId) localStorage.setItem('meetingDriveFolderId', folderId);
    }
  } catch (e) {
    console.warn("Could not load weekly drive settings from Firestore:", e);
  }

  if (inputScript) inputScript.value = scriptUrl;
  if (inputFolder) inputFolder.value = folderId;
}

export function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  if (el.scrollHeight > 0) {
    el.style.height = (el.scrollHeight) + 'px';
  }
}

function initAutoResizeTextareas() {
  document.querySelectorAll('textarea.modern-textarea, textarea.form-control, textarea').forEach(ta => {
    if (ta._autoResizeAttached) return;
    ta._autoResizeAttached = true;
    ta.addEventListener('input', () => autoResizeTextarea(ta));
    autoResizeTextarea(ta);
  });
}

export function initDraggableNavTabs() {
  const containers = document.querySelectorAll('.nav-tabs');
  containers.forEach(container => {
    if (container._dragAttached) return;
    container._dragAttached = true;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let isDragging = false;

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      isDragging = false;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });

    const stopDragging = () => {
      if (!isDown) return;
      isDown = false;
      setTimeout(() => {
        container.classList.remove('is-dragging');
      }, 50);
    };

    window.addEventListener('mouseup', stopDragging);
    container.addEventListener('mouseleave', stopDragging);

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 5) {
        if (!isDragging) {
          isDragging = true;
          container.classList.add('is-dragging');
        }
        e.preventDefault();
        container.scrollLeft = scrollLeft - walk;
      }
    });

    container.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0 && container.scrollWidth > container.clientWidth) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  });
}

// Tab Switching Engine
export function switchTab(tabId, targetBtn) {
  if (tabId === 'adminView' && !isAdminUser()) {
    alert("Access Denied: Only administrators can access the Admin Dashboard.");
    return;
  }
  if (tabId === 'rewardView' && !canAccessRewardView()) {
    alert("Access Denied: Character and skill reward can only be accessed by admin and home teacher.");
    return;
  }
  if (!isAdminUser() && weeklyTabPermissions[tabId] === false) {
    alert("Access Restricted: This section is currently disabled by administrator.");
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
  const btn = targetBtn?.closest ? targetBtn.closest('.tab-btn') : targetBtn;
  btn?.classList.add('active');
  btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

  if (tabId === 'classView') {
    updateClassEditButtonState();
    renderClassSchedule();
  } else if (tabId === 'teacherView') {
    renderTeacherView();
  } else if (tabId === 'teacherSchedulesView') {
    initTeacherSchedulesView();
  } else if (tabId === 'adminAdministrationView') {
    initTeacherAdministrationView();
  } else if (tabId === 'rewardView') {
    initRewardView();
  } else if (tabId === 'meetingView') {
    initMeetingView();
  } else if (tabId === 'scheduleBuilderView') {
    initScheduleBuilderView();
  } else if (tabId === 'adminView') {
    renderEntityTables();
    renderManageScheduleTable();
    populateAdminCalendarDropdowns();
    renderManageThemesTable();
    renderActiveTabsControlTable();
    loadDriveFolderSettings();
  }

  setTimeout(() => {
    initAutoResizeTextareas();
    document.querySelectorAll('.tab-content.active textarea').forEach(ta => autoResizeTextarea(ta));
  }, 50);
}

// Populate Calendar Select Boxes
export function populateCalendarSelects() {
  const years = Object.keys(academicCalendar);
  const views = ['class', 'teacher', 'meeting', 'teacherSchedule'];

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
      const calSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      if (selectedYear && selectedTheme && selectedWeek && academicCalendar[selectedYear]?.[selectedTheme]?.[selectedWeek]) {
        const info = academicCalendar[selectedYear][selectedTheme][selectedWeek];
        const formattedRange = formatModernDateRange(info.startDate, info.endDate);
        badge.innerHTML = `<span class="badge-icon">${calSvg}</span> <span>${formattedRange}</span>`;
      } else {
        badge.innerHTML = `<span class="badge-icon">${calSvg}</span> <span>Dates: -</span>`;
      }
    }
  });

  updateClassDaySelectOptions();
  updateTeacherDaySelectOptions();
  if (typeof populateAdminCalendarDropdowns === 'function') {
    populateAdminCalendarDropdowns();
  }
  if (typeof populateRewardSelects === 'function') {
    populateRewardSelects();
  }
}

export function updateClassDaySelectOptions() {
  const daySel = document.getElementById('classDaySelect');
  if (!daySel) return;

  const year = document.getElementById('classYearSelect')?.value;
  const theme = document.getElementById('classThemeSelect')?.value;
  const week = document.getElementById('classWeekSelect')?.value;
  const currentVal = daySel.value || 'ALL';

  const days = [
    { key: 'MONDAY', name: 'Monday', offset: 0 },
    { key: 'TUESDAY', name: 'Tuesday', offset: 1 },
    { key: 'WEDNESDAY', name: 'Wednesday', offset: 2 },
    { key: 'THURSDAY', name: 'Thursday', offset: 3 },
    { key: 'FRIDAY', name: 'Friday', offset: 4 }
  ];

  const weekInfo = (year && theme && week && academicCalendar[year]?.[theme]?.[week])
    ? academicCalendar[year][theme][week]
    : null;

  let optionsHtml = `<option value="ALL">Full Week</option>`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  days.forEach(d => {
    let label = d.name;
    if (weekInfo?.startDate) {
      try {
        const dt = new Date(weekInfo.startDate + "T00:00:00");
        dt.setDate(dt.getDate() + d.offset);
        if (!isNaN(dt.getTime())) {
          const dateNum = dt.getDate();
          const monthName = months[dt.getMonth()];
          label = `${d.name} (${dateNum} ${monthName})`;
        }
      } catch (e) {}
    }
    optionsHtml += `<option value="${d.key}">${label}</option>`;
  });

  daySel.innerHTML = optionsHtml;
  const validVals = ['ALL', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  daySel.value = validVals.includes(currentVal) ? currentVal : 'ALL';
}

export function updateTeacherDaySelectOptions() {
  const daySel = document.getElementById('teacherDaySelect');
  if (!daySel) return;

  const year = document.getElementById('teacherYearSelect')?.value;
  const theme = document.getElementById('teacherThemeSelect')?.value;
  const week = document.getElementById('teacherWeekSelect')?.value;
  const currentVal = daySel.value || 'ALL';

  const days = [
    { key: 'MONDAY', name: 'Monday', offset: 0 },
    { key: 'TUESDAY', name: 'Tuesday', offset: 1 },
    { key: 'WEDNESDAY', name: 'Wednesday', offset: 2 },
    { key: 'THURSDAY', name: 'Thursday', offset: 3 },
    { key: 'FRIDAY', name: 'Friday', offset: 4 }
  ];

  const weekInfo = (year && theme && week && academicCalendar[year]?.[theme]?.[week])
    ? academicCalendar[year][theme][week]
    : null;

  let optionsHtml = `<option value="ALL">Full Week</option>`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  days.forEach(d => {
    let label = d.name;
    if (weekInfo?.startDate) {
      try {
        const dt = new Date(weekInfo.startDate + "T00:00:00");
        dt.setDate(dt.getDate() + d.offset);
        if (!isNaN(dt.getTime())) {
          const dateNum = dt.getDate();
          const monthName = months[dt.getMonth()];
          label = `${d.name} (${dateNum} ${monthName})`;
        }
      } catch (e) {}
    }
    optionsHtml += `<option value="${d.key}">${label}</option>`;
  });

  daySel.innerHTML = optionsHtml;
  const validVals = ['ALL', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  daySel.value = validVals.includes(currentVal) ? currentVal : 'ALL';
}

// Real-time Firestore Listeners
onSnapshot(doc(db, "config", "academicCalendar"), (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    setAcademicCalendar(data);
    try {
      localStorage.setItem('mks_academic_calendar_backup', JSON.stringify(data));
    } catch (e) {}
  } else {
    // If not found in Firestore, restore from local backup or use default only in-memory.
    // CRITICAL: DO NOT call setDoc here! An unprovoked setDoc on offline start, cache miss,
    // or reconnect overwrites the entire production academicCalendar with a 2-week default.
    let fallbackCal = null;
    try {
      const cached = localStorage.getItem('mks_academic_calendar_backup');
      if (cached) fallbackCal = JSON.parse(cached);
    } catch (e) {}

    if (!fallbackCal && (!academicCalendar || Object.keys(academicCalendar).length === 0)) {
      fallbackCal = {
        "2026-2027": {
          "Theme 1": {
            "Week 1": { startDate: "2026-07-13", endDate: "2026-07-19" },
            "Week 2": { startDate: "2026-07-20", endDate: "2026-07-26" }
          }
        }
      };
    }

    if (fallbackCal) {
      setAcademicCalendar(fallbackCal);
    }
  }
  populateCalendarSelects();
  renderClassSchedule();
  renderTeacherView();
}, (err) => {
  console.warn("Real-time listener on config/academicCalendar encountered error:", err);
});

onSnapshot(doc(db, "config", "appEntities"), (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (!data.classes) data.classes = [];
    if (!data.teachers) data.teachers = [];
    if (!data.subjects) data.subjects = [];
    if (!data.homeTeachers) data.homeTeachers = {};
    if (!data.teacherEmails) data.teacherEmails = {};
    if (!data.teacherLeaders) data.teacherLeaders = [];
    setAppEntities(data);
  } else {
    setAppEntities({
      teachers: ["Mr. Syam", "Mr. Jerry"],
      classes: ["Grade 9A", "Grade 9B", "Grade 9C"],
      subjects: ["English", "Pancasila", "ICT", "Math"],
      homeTeachers: {},
      teacherEmails: {},
      teacherLeaders: []
    });
  }
  syncEntitiesFromMasterSchedules();
  populateAdminSelects();
  populateMeetingReportSelects();
  renderClassSchedule();
  renderTeacherView();
  renderEntityTables();
  checkUserRoleAccess();
});

onSnapshot(doc(db, "schedules", "masterSchedules"), async (docSnap) => {
  if (docSnap.exists()) {
    setMasterSchedules(docSnap.data());
  } else {
    setMasterSchedules({});
  }
  syncEntitiesFromMasterSchedules();
  populateAdminSelects();
  populateMeetingReportSelects();
  renderClassSchedule();
  renderTeacherView();
  renderManageScheduleTable();
  renderEntityTables();
  checkUserRoleAccess();
});

onSnapshot(doc(db, "schedules", "weeklyOverrides"), (docSnap) => {
  if (docSnap.exists()) setWeeklyOverrides(docSnap.data());
  else setWeeklyOverrides({});
  syncEntitiesFromMasterSchedules();
  if (!isClassEditMode) {
    renderClassSchedule();
    renderTeacherView();
    renderManageScheduleTable();
    renderEntityTables();
  }
});

onSnapshot(doc(db, "schedules", "materialsData"), (docSnap) => {
  if (docSnap.exists()) setMaterialsData(docSnap.data());
  if (!isClassEditMode) {
    renderClassSchedule();
  }
  renderTeacherView();
});

onSnapshot(doc(db, "schedules", "classNotesData"), (docSnap) => {
  if (docSnap.exists()) setClassNotesData(docSnap.data());
  if (!isClassEditMode) {
    renderClassSchedule();
  }
  renderTeacherView();
});

// Session & Inactivity Management (1 hour timeout for weekly schedule)
const WEEKLY_SESSION_KEY = 'weeklyLastActiveTime';
const WEEKLY_SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function isWeeklySessionExpired() {
  const lastActiveStr = localStorage.getItem(WEEKLY_SESSION_KEY);
  if (!lastActiveStr) return true;
  const lastActive = parseInt(lastActiveStr, 10);
  if (isNaN(lastActive) || lastActive <= 0) return true;
  return (Date.now() - lastActive) >= WEEKLY_SESSION_TIMEOUT_MS;
}

let lastWeeklyTouchTime = 0;
function touchWeeklySession(force = false) {
  const now = Date.now();
  if (!force && (now - lastWeeklyTouchTime < 30 * 1000)) return; // Throttle to once every 30s
  lastWeeklyTouchTime = now;
  try {
    localStorage.setItem(WEEKLY_SESSION_KEY, now.toString());
  } catch (e) {
    console.warn('Failed to update weekly session timestamp:', e);
  }
}

function clearWeeklySession() {
  try {
    localStorage.removeItem(WEEKLY_SESSION_KEY);
  } catch (e) {}
}

async function forceWeeklyRelogin(reason = '') {
  clearWeeklySession();
  const loginModal = document.getElementById('loginModal');
  const appMain = document.getElementById('appMain');
  if (loginModal) loginModal.style.display = 'flex';
  if (appMain) appMain.style.display = 'none';

  const passInput = document.getElementById('loginPassword');
  if (passInput) passInput.value = '';

  const errDiv = document.getElementById('loginError');
  if (errDiv) {
    if (reason) {
      errDiv.textContent = reason;
      errDiv.style.display = 'block';
      errDiv.classList.remove('hidden');
    } else {
      errDiv.textContent = '';
      errDiv.style.display = 'none';
      errDiv.classList.add('hidden');
    }
  }

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Error during forced weekly signout:', err);
  }
}

// Authentication State Observer
onAuthStateChanged(auth, async (user) => {
  const loginModal = document.getElementById('loginModal');
  const appMain = document.getElementById('appMain');
  const userDisplayEmail = document.getElementById('userDisplayEmail');
  const userDisplayEmailText = document.getElementById('userDisplayEmailText');

  if (user) {
    // If user hasn't accessed weekly.html for 1 hour or more, require re-login
    if (isWeeklySessionExpired()) {
      console.warn('[Weekly Security] Inactivity >= 1 hour since last access. Requiring re-login.');
      await forceWeeklyRelogin();
      return;
    }

    touchWeeklySession(true);
    if (loginModal) loginModal.style.display = 'none';
    if (appMain) appMain.style.display = 'block';
    updateUserDisplayEmail(user.email);

    await fetchCurrentUserRole(user);
    checkUserRoleAccess();
    triggerCelebration();
    attachRippleEffect('button, .login-btn, .save-btn, .export-btn, .nav-item, .quick-link-card');
    initStaggeredReveals();
  } else {
    clearWeeklySession();
    if (loginModal) loginModal.style.display = 'flex';
    if (appMain) appMain.style.display = 'none';
  }
});

// Change Password Handlers
const openChangePasswordModal = () => {
  const user = auth.currentUser;
  if (!user) return;

  const modal = document.getElementById('changePasswordModal');
  const subLabel = document.getElementById('changePasswordSubLabel');
  const msgDiv = document.getElementById('changePasswordMsg');
  const newPass = document.getElementById('newPasswordInput');
  const confirmPass = document.getElementById('confirmPasswordInput');

  if (subLabel) subLabel.textContent = `Update account password for ${user.email}`;
  if (msgDiv) msgDiv.style.display = 'none';
  if (newPass) newPass.value = '';
  if (confirmPass) confirmPass.value = '';

  if (modal) modal.style.display = 'flex';
};

document.getElementById('userDisplayEmailBtn')?.addEventListener('click', openChangePasswordModal);
document.getElementById('userDisplayEmail')?.addEventListener('click', openChangePasswordModal);

document.getElementById('btnCancelChangePassword')?.addEventListener('click', () => {
  const modal = document.getElementById('changePasswordModal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const newPass = document.getElementById('newPasswordInput')?.value || '';
  const confirmPass = document.getElementById('confirmPasswordInput')?.value || '';
  const msgDiv = document.getElementById('changePasswordMsg');
  const submitBtn = document.getElementById('btnSubmitChangePassword');
  const card = document.querySelector('#changePasswordModal .login-card');

  if (!msgDiv || !submitBtn) return;
  msgDiv.style.display = 'none';

  if (newPass !== confirmPass) {
    msgDiv.textContent = 'Passwords do not match. Please re-enter confirm password.';
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
    return;
  }

  if (newPass.length < 6) {
    msgDiv.textContent = 'Password must be at least 6 characters long.';
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating...';

  try {
    await updatePassword(user, newPass);
    msgDiv.textContent = 'Password updated successfully!';
    msgDiv.style.cssText = 'display: block; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    triggerCelebration();

    setTimeout(() => {
      const modal = document.getElementById('changePasswordModal');
      if (modal) modal.style.display = 'none';
    }, 1500);
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      msgDiv.textContent = 'Security Requirement: Please sign out and sign in again before updating your password.';
    } else {
      msgDiv.textContent = err.message ? err.message.replace('Firebase: ', '') : 'Failed to update password.';
    }
    msgDiv.style.cssText = 'display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 12px;';
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Update Password';
  }
});

// User Sign In & Sign Out
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errDiv = document.getElementById('loginError');
  const submitBtn = document.getElementById('btnLoginSubmit');
  const card = document.querySelector('#loginModal .student-split-login-card') || document.querySelector('#loginModal .login-card');

  if (errDiv) {
    errDiv.style.display = 'none';
    errDiv.classList.add('hidden');
    errDiv.textContent = '';
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    touchWeeklySession(true);
    await signInWithEmailAndPassword(auth, email, password);
    touchWeeklySession(true);
  } catch (err) {
    clearWeeklySession();
    if (errDiv) {
      errDiv.textContent = err.message.replace("Firebase: ", "");
      errDiv.style.display = 'block';
      errDiv.classList.remove('hidden');
    }
    if (card) {
      card.classList.remove('shake-error');
      void card.offsetWidth;
      card.classList.add('shake-error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In to Portal';
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  clearWeeklySession();
  signOut(auth);
});

// Keep weekly session active during user interaction
['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, () => {
    if (auth.currentUser && !isWeeklySessionExpired()) {
      touchWeeklySession(false);
    }
  }, { passive: true });
});

// Check expiration on tab visibility / focus change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && auth.currentUser) {
    if (isWeeklySessionExpired()) {
      forceWeeklyRelogin('Session expired due to inactivity (> 1 hour). Please log in again.');
    } else {
      touchWeeklySession(true);
    }
  }
});

window.addEventListener('focus', () => {
  if (auth.currentUser) {
    if (isWeeklySessionExpired()) {
      forceWeeklyRelogin('Session expired due to inactivity (> 1 hour). Please log in again.');
    } else {
      touchWeeklySession(true);
    }
  }
});

// Periodic idle check every minute
setInterval(() => {
  if (auth.currentUser && isWeeklySessionExpired()) {
    forceWeeklyRelogin('Session expired due to inactivity (> 1 hour). Please log in again.');
  }
}, 60 * 1000);

// Top Navigation Tab Event Listeners
document.getElementById('btnClassView')?.addEventListener('click', (e) => switchTab('classView', e.currentTarget));
document.getElementById('btnTeacherView')?.addEventListener('click', (e) => switchTab('teacherView', e.currentTarget));
document.getElementById('btnTeacherSchedulesView')?.addEventListener('click', (e) => switchTab('teacherSchedulesView', e.currentTarget));
document.getElementById('btnAdminAdministrationView')?.addEventListener('click', (e) => switchTab('adminAdministrationView', e.currentTarget));
document.getElementById('btnRewardView')?.addEventListener('click', (e) => switchTab('rewardView', e.currentTarget));
document.getElementById('btnMeetingView')?.addEventListener('click', (e) => switchTab('meetingView', e.currentTarget));
document.getElementById('btnScheduleBuilderView')?.addEventListener('click', (e) => switchTab('scheduleBuilderView', e.currentTarget));
document.getElementById('btnAdminView')?.addEventListener('click', (e) => switchTab('adminView', e.currentTarget));

// Video Banners & Draggable Shell
document.querySelectorAll('.tab-content > .weekly-workspace-heading, #scheduleBuilderView > .builder-hero-card').forEach(banner => {
  banner.classList.add('weekly-video-banner');
  let weeklyBannerVideo = banner.querySelector('.weekly-banner-video');
  if (!weeklyBannerVideo) {
    weeklyBannerVideo = document.createElement('video');
    weeklyBannerVideo.className = 'weekly-banner-video';
    weeklyBannerVideo.loop = true;
    weeklyBannerVideo.playsInline = true;
    weeklyBannerVideo.preload = 'none';
    weeklyBannerVideo.setAttribute('aria-hidden', 'true');
    weeklyBannerVideo.tabIndex = -1;
    weeklyBannerVideo.append(document.createElement('source'));
    banner.prepend(weeklyBannerVideo);
  }
  const daytime = new Date().getHours() >= 6 && new Date().getHours() < 18;
  const drivePoster = daytime
    ? 'https://lh3.googleusercontent.com/d/1ozoUmpJTsMTSvykTQr-WNQ3K19D1_NGb'
    : 'https://lh3.googleusercontent.com/d/12BaqYdue8roO0CCfwajIEcCkIkTZe5pR';
  const driveDirect = daytime
    ? 'https://drive.usercontent.google.com/download?id=1s8HaspAJnJ4OknN1woyVkHxnR9ZgsUMB'
    : 'https://drive.usercontent.google.com/download?id=1mRP5cbvnYeKA-dAkL6b6W-Ba7H96UDeW';
  const driveUc = daytime
    ? 'https://drive.google.com/uc?id=1s8HaspAJnJ4OknN1woyVkHxnR9ZgsUMB&export=download'
    : 'https://drive.google.com/uc?id=1mRP5cbvnYeKA-dAkL6b6W-Ba7H96UDeW&export=download';
  weeklyBannerVideo.muted = true;
  weeklyBannerVideo.poster = drivePoster;
  weeklyBannerVideo.innerHTML = `
    <source src="${driveDirect}" type="video/mp4">
    <source src="${driveUc}" type="video/mp4">
  `;
  weeklyBannerVideo.load();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const syncBannerPlayback = () => {
    if (motionPreference.matches || document.hidden || !banner.closest('.tab-content').classList.contains('active')) weeklyBannerVideo.pause();
    else weeklyBannerVideo.play().catch(() => {});
  };
  weeklyBannerVideo.autoplay = false;
  motionPreference.addEventListener('change', syncBannerPlayback);
  document.addEventListener('visibilitychange', syncBannerPlayback);
  new MutationObserver(syncBannerPlayback).observe(banner.closest('.tab-content'), {attributes:true, attributeFilter:['class']});
  syncBannerPlayback();
});

// Living weekly timeline: weekday emphasis and restrained pointer parallax.
const classWeeklyBanner = document.querySelector('#classView > .weekly-video-banner');
if (classWeeklyBanner) {
  const currentDay = new Date().getDay();
  classWeeklyBanner.querySelector(`.weekly-day-node[data-day="${currentDay}"]`)?.classList.add('is-today');
  const canParallax = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
  if (canParallax) {
    classWeeklyBanner.addEventListener('pointermove', (event) => {
      const bounds = classWeeklyBanner.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - .5) * 8;
      const y = ((event.clientY - bounds.top) / bounds.height - .5) * 5;
      classWeeklyBanner.style.setProperty('--motion-x', `${x.toFixed(2)}px`);
      classWeeklyBanner.style.setProperty('--motion-y', `${y.toFixed(2)}px`);
    }, { passive: true });
    classWeeklyBanner.addEventListener('pointerleave', () => {
      classWeeklyBanner.style.setProperty('--motion-x', '0px');
      classWeeklyBanner.style.setProperty('--motion-y', '0px');
    });
  }
}

const weeklyNav = document.querySelector('.nav-tabs');
if (weeklyNav) {
  const shortLabels = { btnClassView: 'Classes', btnTeacherView: 'Teacher Entry', btnTeacherSchedulesView: 'Teacher Schedules', btnRewardView: 'Rewards', btnMeetingView: 'Meetings', btnScheduleBuilderView: 'Schedule Builder', btnAdminView: 'Admin' };
  Object.entries(shortLabels).forEach(([id, label]) => {
    const button = document.getElementById(id);
    const caption = button?.querySelector('span:last-child');
    if (caption && !caption.classList.contains('tab-icon')) { button.title = caption.textContent.trim(); caption.textContent = label; }
  });
  if (!weeklyNav.closest('.weekly-nav-shell')) {
    const shell = document.createElement('div'); shell.className = 'weekly-nav-shell';
    weeklyNav.before(shell); shell.append(weeklyNav);
    [-1, 1].forEach(direction => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = direction < 0 ? 'weekly-nav-arrow weekly-nav-arrow-left' : 'weekly-nav-arrow weekly-nav-arrow-right';
      button.textContent = direction < 0 ? '‹' : '›'; button.setAttribute('aria-label', direction < 0 ? 'Scroll navigation left' : 'Scroll navigation right');
      button.onclick = () => weeklyNav.scrollBy({left: direction * 220, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      if (direction < 0) shell.prepend(button); else shell.append(button);
      const sync = () => { button.disabled = direction < 0 ? weeklyNav.scrollLeft <= 1 : weeklyNav.scrollLeft + weeklyNav.clientWidth >= weeklyNav.scrollWidth - 1; };
      weeklyNav.addEventListener('scroll', sync, {passive:true}); new ResizeObserver(sync).observe(weeklyNav); sync();
    });
  }
}

// Mobile user menu dropdown toggle
export function toggleWeeklyMobileMenu(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const dropdown = document.getElementById('topbarUserDropdown');
  const btn = document.getElementById('weeklyMobileMenuBtn');
  if (!dropdown) return;
  const isOpen = dropdown.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', String(isOpen));
}
window.toggleWeeklyMobileMenu = toggleWeeklyMobileMenu;

const weeklyMobileMenuBtn = document.getElementById('weeklyMobileMenuBtn');
const topbarUserDropdown = document.getElementById('topbarUserDropdown');
if (topbarUserDropdown) {
  if (weeklyMobileMenuBtn && !weeklyMobileMenuBtn.getAttribute('onclick')) {
    weeklyMobileMenuBtn.addEventListener('click', toggleWeeklyMobileMenu);
  }

  document.addEventListener('click', (e) => {
    const btn = document.getElementById('weeklyMobileMenuBtn');
    if (!topbarUserDropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
      topbarUserDropdown.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });

  topbarUserDropdown.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      topbarUserDropdown.classList.remove('open');
      const menuBtn = document.getElementById('weeklyMobileMenuBtn');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

// Helper to update user email text according to active language
export function updateUserDisplayEmail(email = null) {
  const currentEmail = email || auth.currentUser?.email;
  const userDisplayEmailText = document.getElementById('userDisplayEmailText');
  const userDisplayEmail = document.getElementById('userDisplayEmail');
  const label = t('logged_in_as') || (getCurrentLanguage() === 'id' ? 'Masuk sebagai:' : 'Logged in as:');
  if (userDisplayEmailText) {
    userDisplayEmailText.textContent = currentEmail ? `${label} ${currentEmail}` : `${label} -`;
  }
  if (userDisplayEmail) {
    userDisplayEmail.textContent = currentEmail ? `${label} ${currentEmail}` : `${label} -`;
  }
}

// i18n & Language Switcher
function initWeeklyI18n() {
  applyTranslations();
  updateUserDisplayEmail();

  const handleLanguageUpdate = () => {
    updateUserDisplayEmail();
    const activeClass = document.getElementById('classSelectView')?.value;
    if (activeClass) {
      updateUniformBadges(activeClass);
    }

    // Re-render active tab content so schedules and views reflect the new language
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
      const tabId = activeTab.id;
      if (tabId === 'classView') {
        renderClassSchedule();
      } else if (tabId === 'teacherView') {
        renderTeacherView();
      } else if (tabId === 'teacherSchedulesView') {
        initTeacherSchedulesView();
      } else if (tabId === 'adminAdministrationView') {
        initTeacherAdministrationView();
      } else if (tabId === 'rewardView') {
        initRewardView();
      } else if (tabId === 'meetingView') {
        initMeetingView();
      } else if (tabId === 'scheduleBuilderView') {
        initScheduleBuilderView();
      } else if (tabId === 'adminView') {
        renderActiveTabsControlTable();
        renderAppUpdateControlPanel();
        renderEntityTables();
        renderManageScheduleTable();
      }
    }
  };

  const langToggleBtn = document.getElementById('btnLanguageToggle');
  if (langToggleBtn && !langToggleBtn.onclick) {
    langToggleBtn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      toggleLanguage();
    };
  }

  window.addEventListener('languageChanged', () => {
    handleLanguageUpdate();
  });
}

// Lifecycle Initializations
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initDraggableNavTabs();
    initWeeklyI18n();
    initFloatingRichTextToolbar();
    initTeacherSchedulesFirestoreListener();
    initScheduleExcelImport();
    updateLoginVisualDayNight();
    initAppUpdateListener();
    initAppUpdateUIEvents();
  });
} else {
  initDraggableNavTabs();
  initWeeklyI18n();
  initFloatingRichTextToolbar();
  initTeacherSchedulesFirestoreListener();
  initScheduleExcelImport();
  updateLoginVisualDayNight();
  initAppUpdateListener();
  initAppUpdateUIEvents();
}
