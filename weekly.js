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

// Complete 13 Slot Daily Master Schedule Structure
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

// App State
let appEntities = { teachers: [], classes: [], subjects: [] };
let masterSchedules = {};
let materialsData = {};

// Main Navigation Event Listeners
document.getElementById('btnClassView').addEventListener('click', (e) => switchTab('classView', e.target));
document.getElementById('btnTeacherView').addEventListener('click', (e) => switchTab('teacherView', e.target));
document.getElementById('btnAdminView').addEventListener('click', (e) => switchTab('adminView', e.target));

function switchTab(tabId, targetBtn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  targetBtn.classList.add('active');
}

// Admin Sub-Tab Navigation
document.getElementById('btnSubAdd')?.addEventListener('click', (e) => switchAdminSubTab('subTabAdd', e.target));
document.getElementById('btnSubManage')?.addEventListener('click', (e) => switchAdminSubTab('subTabManage', e.target));

function switchAdminSubTab(subTabId, targetBtn) {
  document.querySelectorAll('.subtab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.subtab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(subTabId)?.classList.add('active');
  targetBtn.classList.add('active');
}

// Populate Admin Select Pickers & Entity Tables
function populateAdminSelects() {
  const periodSelect = document.getElementById('adminPeriodSelect');
  if (periodSelect) {
    periodSelect.innerHTML = timeSlots
      .filter(s => !s.isBreak)
      .map(s => `<option value="${s.id}">Period ${s.period} (${s.time})</option>`).join('');
  }

  const classSelects = [document.getElementById('adminClassSelect'), document.getElementById('classSelectView')];
  classSelects.forEach(select => {
    if (select) select.innerHTML = appEntities.classes.map(c => `<option value="${c}">${c}</option>`).join('');
  });

  const adminSub = document.getElementById('adminSubjectSelect');
  if (adminSub) adminSub.innerHTML = appEntities.subjects.map(s => `<option value="${s}">${s}</option>`).join('');
  
  const teacherSelects = [document.getElementById('adminTeacherSelect'), document.getElementById('teacherSelectView')];
  teacherSelects.forEach(select => {
    if (select) select.innerHTML = appEntities.teachers.map(t => `<option value="${t}">${t}</option>`).join('');
  });

  renderEntityTables();
}

// Render Entity Tables with Kebab Actions
function renderEntityTables() {
  const types = ['teachers', 'classes', 'subjects'];
  
  types.forEach(type => {
    const tbodyId = `table${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    appEntities[type].forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: left; padding-left: 12px;"><strong>${item}</strong></td>
        <td>
          <div class="kebab-menu">
            <button class="kebab-btn">⋮</button>
            <div class="kebab-dropdown">
              <button class="edit-opt" data-type="${type}" data-name="${item}">Edit</button>
              <button class="delete-opt" data-type="${type}" data-name="${item}">Delete</button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Kebab Toggle Logic
  document.querySelectorAll('.kebab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.kebab-dropdown').forEach(d => {
        if (d !== btn.nextElementSibling) d.classList.remove('show');
      });
      btn.nextElementSibling.classList.toggle('show');
    });
  });

  // Attach Edit Listeners
  document.querySelectorAll('.edit-opt').forEach(btn => {
    btn.addEventListener('click', (e) => editEntity(e.target.dataset.type, e.target.dataset.name));
  });

  // Attach Delete Listeners
  document.querySelectorAll('.delete-opt').forEach(btn => {
    btn.addEventListener('click', (e) => deleteEntity(e.target.dataset.type, e.target.dataset.name));
  });
}

// Close Dropdowns when Clicking Outside
window.addEventListener('click', () => {
  document.querySelectorAll('.kebab-dropdown').forEach(d => d.classList.remove('show'));
});

// Edit Entity in Firestore
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

// Delete Entity from Firestore
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

// Render Student Class Schedule View
function renderClassSchedule() {
  const selectElem = document.getElementById('classSelectView');
  if (!selectElem) return;
  const selectedClass = selectElem.value;
  const tbody = document.getElementById('classScheduleBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const classData = masterSchedules[selectedClass] || {};

  timeSlots.forEach(slot => {
    const tr = document.createElement('tr');
    if (slot.isBreak) {
      tr.className = 'break-row';
      tr.innerHTML = `<td>${slot.time}</td><td colspan="5">${slot.label}</td>`;
    } else {
      let html = `<td><strong>${slot.time}</strong><br><small>Period ${slot.period}</small></td>`;
      days.forEach(day => {
        const slotEntry = classData[day]?.[slot.id];
        if (slotEntry) {
          const matKey = `${selectedClass}_${slotEntry.subject}`;
          const matInfo = materialsData[matKey] || {};
          const linkHtml = matInfo.link ? `<a href="${matInfo.link}" target="_blank" class="resource-link">🔗 Link</a>` : '';
          html += `
            <td>
              <span class="subject-title">${slotEntry.subject}</span>
              <span class="teacher-tag">${slotEntry.teacher}</span>
              <div class="material-text">${matInfo.material || ''}</div>
              ${linkHtml}
            </td>`;
        } else {
          html += `<td>-</td>`;
        }
      });
      tr.innerHTML = html;
    }
    tbody.appendChild(tr);
  });
}

// Render Teacher Schedule & Materials Entry
function renderTeacherView() {
  const selectElem = document.getElementById('teacherSelectView');
  if (!selectElem) return;
  const selectedTeacher = selectElem.value;
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  
  const tbodyGrid = document.getElementById('teacherScheduleBody');
  if (!tbodyGrid) return;
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
          const entry = masterSchedules[className]?.[day]?.[slot.id];
          if (entry && entry.teacher === selectedTeacher) {
            assignedInfo = `<strong>${entry.subject}</strong><br><small>${className}</small>`;
          }
        });
        html += `<td>${assignedInfo}</td>`;
      });
      tr.innerHTML = html;
    }
    tbodyGrid.appendChild(tr);
  });

  const tbodyMat = document.getElementById('materialTableBody');
  if (!tbodyMat) return;
  tbodyMat.innerHTML = '';
  
  let teacherAssignments = [];
  Object.keys(masterSchedules).forEach(className => {
    days.forEach(day => {
      timeSlots.forEach(slot => {
        const entry = masterSchedules[className]?.[day]?.[slot.id];
        if (entry && entry.teacher === selectedTeacher) {
          const key = `${className}_${entry.subject}`;
          if (!teacherAssignments.find(a => a.key === key)) {
            teacherAssignments.push({ key, className, subject: entry.subject });
          }
        }
      });
    });
  });

  teacherAssignments.forEach(item => {
    const mat = materialsData[item.key]?.material || '';
    const link = materialsData[item.key]?.link || '';
    const combine = mat ? `${item.className} - ${item.subject}\n${mat}` : `${item.className} - ${item.subject}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.className}</strong><br><small>${item.subject}</small></td>
      <td><input type="text" class="mat-input" data-key="${item.key}" value="${mat}" placeholder="Enter material..."></td>
      <td style="white-space: pre-line;">${combine}</td>
      <td><input type="text" class="link-input" data-key="${item.key}" value="${link}" placeholder="https://..."></td>
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

  document.querySelectorAll('.link-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (!materialsData[key]) materialsData[key] = {};
      materialsData[key].link = e.target.value;
      renderClassSchedule();
    });
  });
}

// Helper & Wrapper Functions for Database Addition
async function addEntity(type, name) {
  const cleanName = name ? name.trim() : '';
  if (!cleanName) throw new Error("Name field cannot be blank.");
  if (!['teachers', 'classes', 'subjects'].includes(type)) throw new Error(`Invalid entity type: ${type}`);
  if (appEntities[type].includes(cleanName)) throw new Error(`"${cleanName}" already exists in ${type}.`);

  appEntities[type].push(cleanName);
  await setDoc(doc(db, "config", "appEntities"), appEntities);
  return cleanName;
}

async function addTeacher(teacherName) { return await addEntity('teachers', teacherName); }
async function addClass(className) { return await addEntity('classes', className); }
async function addSubject(subjectName) { return await addEntity('subjects', subjectName); }

// Resource Form Listener
document.getElementById('addResourceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('resourceType').value;
  const name = document.getElementById('resourceName').value;

  try {
    let addedName = '';
    if (type === 'teachers') addedName = await addTeacher(name);
    else if (type === 'classes') addedName = await addClass(name);
    else if (type === 'subjects') addedName = await addSubject(name);

    document.getElementById('resourceName').value = '';
    alert(`Successfully added "${addedName}" to ${type}!`);
  } catch (error) {
    alert(`Error adding resource: ${error.message}`);
  }
});

// Assign Slot Form Handler
document.getElementById('assignSlotForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const className = document.getElementById('adminClassSelect').value;
  const day = document.getElementById('adminDaySelect').value;
  const startSlotId = parseInt(document.getElementById('adminPeriodSelect').value);
  const duration = parseInt(document.getElementById('adminDurationSelect').value);
  const subject = document.getElementById('adminSubjectSelect').value;
  const teacher = document.getElementById('adminTeacherSelect').value;

  if (!masterSchedules[className]) masterSchedules[className] = {};
  if (!masterSchedules[className][day]) masterSchedules[className][day] = {};

  let filledCount = 0;
  let currentSlotId = startSlotId;

  while (filledCount < duration && currentSlotId < timeSlots.length) {
    if (!timeSlots[currentSlotId].isBreak) {
      masterSchedules[className][day][currentSlotId] = { subject, teacher };
      filledCount++;
    }
    currentSlotId++;
  }

  await setDoc(doc(db, "schedules", "masterSchedules"), masterSchedules);
  alert(`Assigned ${subject} (${duration} period/s) to ${className} on ${day}`);
});

// Save Materials Listener
document.getElementById('saveMaterialsBtn')?.addEventListener('click', async () => {
  try {
    await setDoc(doc(db, "schedules", "materialsData"), materialsData, { merge: true });
    alert("Materials updated successfully!");
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// Dropdown Change Listeners
document.getElementById('classSelectView')?.addEventListener('change', renderClassSchedule);
document.getElementById('teacherSelectView')?.addEventListener('change', renderTeacherView);

// Firebase Real-time Synchronization
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