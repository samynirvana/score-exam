import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { auth, db } from './firebase.js';

const $ = id => document.getElementById(id);
const formatNumber = value => new Intl.NumberFormat().format(value);
const hourName = hour => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2020, 0, 1, hour));
const dateName = date => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'No recorded login';
let people = [];
let events = [];
let summaries = new Map();
let days = 7;
let page = 1;

function showNotice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function userData(snapshot, role) {
  return snapshot.docs.map(item => {
    const data = item.data();
    const id = role === 'student' ? String(data.studentCode || data.code || item.id).toUpperCase() : item.id;
    return {
      key: `${role}:${id}`,
      name: role === 'student' ? (data.studentName || data.name || id) : (data.name || data.displayName || data.email || id),
      detail: role === 'student' ? `${id} · ${data.studentClass || data.class || 'Class not set'}` : (data.email || id),
      role
    };
  });
}

async function loadData() {
  $('refreshButton').disabled = true;
  $('refreshButton').textContent = 'Loading…';
  try {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const [students, staff, activity, activitySummaries] = await Promise.all([
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'user_activity_events'), where('at', '>=', Timestamp.fromDate(start)), orderBy('at', 'desc'), limit(5000))),
      getDocs(collection(db, 'user_activity'))
    ]);
    people = [...userData(students, 'student'), ...userData(staff, 'staff')];
    events = activity.docs.map(item => {
      const value = item.data();
      return { key: value.userKey, role: value.role, type: value.type, at: value.at?.toDate() || null };
    }).filter(event => event.at && event.type === 'login');
    summaries = new Map(activitySummaries.docs.map(item => {
      const value = item.data();
      return [value.userKey, {
        lastLogin: value.lastLogin?.toDate() || null
      }];
    }));
    showNotice(activity.size === 5000 ? 'Showing the newest 5,000 events. Older activity in this period may be omitted.' : '');
    render();
  } catch (error) {
    console.error('Could not load user analytics:', error);
    showNotice('Could not load analytics. Check the Firestore rules and your connection, then refresh.');
  } finally {
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻  Refresh data';
  }
}

function render() {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const selected = events.filter(event => event.at.getTime() >= start);
  const logins = selected.filter(event => event.type === 'login');
  $('registeredCount').textContent = formatNumber(people.length);
  $('activeCount').textContent = formatNumber(new Set(logins.map(event => event.key)).size);
  $('loginCount').textContent = formatNumber(logins.length);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  $('todayLoginCount').textContent = formatNumber(events.filter(event => event.at >= today).length);
  renderHours(logins);
  renderRoles(logins);
  renderRecentLogins(logins);
  renderPeople(selected);
}

function renderRecentLogins(logins) {
  const root = $('recentLogins');
  root.replaceChildren();
  if (!logins.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Sign-ins will appear after tracking starts.';
    root.appendChild(empty);
    return;
  }
  const names = new Map(people.map(person => [person.key, person]));
  for (const event of logins.slice(0, 12)) {
    const person = names.get(event.key);
    const item = document.createElement('div');
    item.className = 'recent-item';
    const name = document.createElement('strong');
    name.textContent = person?.name || event.key;
    const meta = document.createElement('span');
    meta.textContent = `${person?.role === 'staff' ? 'Staff' : 'Student'} · ${dateName(event.at)}`;
    item.append(name, meta);
    root.appendChild(item);
  }
}

function renderHours(logins) {
  const counts = Array(24).fill(0);
  for (const event of logins) counts[event.at.getHours()]++;
  const max = Math.max(...counts);
  const peak = counts.indexOf(max);
  $('hourChart').replaceChildren();
  counts.forEach((count, hour) => {
    const bar = document.createElement('div');
    bar.className = `hour-bar${max && count === max ? ' peak' : ''}`;
    bar.style.height = max ? `${Math.max(2, count / max * 100)}%` : '2px';
    bar.dataset.label = `${hourName(hour)} · ${count} login${count === 1 ? '' : 's'}`;
    $('hourChart').appendChild(bar);
  });
  $('peakLabel').textContent = max ? `Peak ${hourName(peak)}` : 'No logins yet';
  $('busiestHour').textContent = max ? `Busiest: ${hourName(peak)} (${max} logins)` : 'Busiest: —';
  const quiet = max ? counts.indexOf(Math.min(...counts)) : -1;
  $('quietestHour').textContent = quiet >= 0 ? `Quietest: ${hourName(quiet)} (${counts[quiet]} logins)` : 'Quietest: —';
}

function renderRoles(logins) {
  const counts = [['student', logins.filter(event => event.role === 'student').length], ['staff', logins.filter(event => event.role === 'staff').length]];
  const root = $('loginRoles');
  root.replaceChildren();
  if (!logins.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Sign-ins will appear after tracking starts.';
    root.appendChild(empty);
    return;
  }
  for (const [type, count] of counts) {
    const row = document.createElement('div');
    row.className = 'page-row';
    const meta = document.createElement('div');
    meta.className = 'page-meta';
    const name = document.createElement('span');
    name.textContent = type === 'student' ? 'Students' : 'Staff and teachers';
    const total = document.createElement('span');
    total.textContent = `${formatNumber(count)} logins`;
    meta.append(name, total);
    const track = document.createElement('div');
    track.className = 'page-track';
    const fill = document.createElement('div');
    fill.className = 'page-fill';
    fill.style.width = `${count / logins.length * 100}%`;
    track.appendChild(fill);
    row.append(meta, track);
    root.appendChild(row);
  }
}

function cell(row, content, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = content;
  row.appendChild(td);
  return td;
}

function renderPeople(selected) {
  const state = new Map();
  for (const event of selected) {
    if (!state.has(event.key)) state.set(event.key, { logins: 0, lastLogin: null });
    const current = state.get(event.key);
    current.logins++;
    if (!current.lastLogin || event.at > current.lastLogin) current.lastLogin = event.at;
  }
  const search = $('userSearch').value.trim().toLowerCase();
  const role = $('roleFilter').value;
  const filtered = people.filter(person => (role === 'all' || person.role === role)
    && `${person.name} ${person.detail}`.toLowerCase().includes(search));
  filtered.sort((a, b) => (summaries.get(b.key)?.lastLogin?.getTime() || state.get(b.key)?.lastLogin?.getTime() || 0) - (summaries.get(a.key)?.lastLogin?.getTime() || state.get(a.key)?.lastLogin?.getTime() || 0)
    || a.name.localeCompare(b.name));
  const pageSize = Number($('pageSize').value);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, totalPages);
  const startIndex = (page - 1) * pageSize;
  const body = $('userRows');
  body.replaceChildren();
  for (const person of filtered.slice(startIndex, startIndex + pageSize)) {
    const activity = state.get(person.key);
    const latest = summaries.get(person.key) || activity;
    const row = document.createElement('tr');
    const name = cell(row, person.name);
    const detail = document.createElement('span');
    detail.className = 'user-sub';
    detail.textContent = person.detail;
    name.appendChild(detail);
    const roleCell = cell(row, '');
    const badge = document.createElement('span');
    badge.className = `role-badge${person.role === 'staff' ? ' staff' : ''}`;
    badge.textContent = person.role === 'staff' ? 'Staff' : 'Student';
    roleCell.appendChild(badge);
    cell(row, dateName(latest?.lastLogin));
    cell(row, formatNumber(activity?.logins || 0));
    body.appendChild(row);
  }
  if (!filtered.length) {
    const row = document.createElement('tr');
    const empty = cell(row, 'No matching users.');
    empty.colSpan = 4;
    body.appendChild(row);
  }
  const first = filtered.length ? startIndex + 1 : 0;
  const last = Math.min(startIndex + pageSize, filtered.length);
  $('tableCount').textContent = `Showing ${first}–${last} of ${filtered.length} matching users`;
  $('pageIndicator').textContent = `Page ${page} of ${totalPages}`;
  $('previousPage').disabled = page === 1;
  $('nextPage').disabled = page === totalPages;
}

function renderCurrentPeople() {
  renderPeople(events.filter(event => event.at.getTime() >= Date.now() - days * 86400000));
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    $('accessMessage').textContent = 'Sign in with an administrator account to view user analytics.';
    return;
  }
  try {
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    if (snapshot.data()?.role !== 'admin') {
      $('accessMessage').textContent = 'This page is available to administrators only.';
      return;
    }
    const displayName = snapshot.data().name || user.displayName || user.email?.split('@')[0] || 'Admin';
    const initial = displayName.charAt(0).toUpperCase();
    if ($('sidebarUserName')) $('sidebarUserName').textContent = displayName;
    if ($('userAvatarCircle')) $('userAvatarCircle').textContent = initial;
    if ($('mobileSidebarUserName')) $('mobileSidebarUserName').textContent = displayName;
    if ($('mobileUserAvatarCircle')) $('mobileUserAvatarCircle').textContent = initial;
    if ($('analyticsUserName')) $('analyticsUserName').textContent = displayName;
    if ($('analyticsAvatar')) $('analyticsAvatar').textContent = initial;
    $('accessMessage').hidden = true;
    $('dashboard').hidden = false;
    import('./js/userActivity.js').then(({ trackCurrentPage }) => trackCurrentPage());
    await loadData();
  } catch (error) {
    console.error('Could not verify administrator:', error);
    $('accessMessage').textContent = 'Could not verify administrator access. Check your connection and reload.';
  }
});

$('refreshButton').addEventListener('click', loadData);
$('roleFilter').addEventListener('change', () => { page = 1; renderCurrentPeople(); });
$('userSearch').addEventListener('input', () => { page = 1; renderCurrentPeople(); });
$('pageSize').addEventListener('change', () => { page = 1; renderCurrentPeople(); });
$('previousPage').addEventListener('click', () => { if (page > 1) { page--; renderCurrentPeople(); } });
$('nextPage').addEventListener('click', () => { page++; renderCurrentPeople(); });

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-theme', isDark);
  document.body.classList.toggle('dark-mode', isDark);
  const mobileThemeText = $('mobileKebabThemeText');
  if (mobileThemeText) mobileThemeText.innerText = isDark ? 'Light Mode' : 'Dark Mode';
  document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.setProperty('display', isDark ? 'inline-block' : 'none', 'important'));
  document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.setProperty('display', isDark ? 'none' : 'inline-block', 'important'));
}

const savedTheme = localStorage.getItem('appTheme') || localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

const toggleTheme = () => {
  const isDark = !document.body.classList.contains('dark-theme');
  const newTheme = isDark ? 'dark' : 'light';
  localStorage.setItem('appTheme', newTheme);
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
};

$('themeToggleBtn')?.addEventListener('click', toggleTheme);
$('mobileKebabThemeBtn')?.addEventListener('click', toggleTheme);
$('analyticsThemeToggle')?.addEventListener('click', toggleTheme);

const performLogout = async () => {
  localStorage.removeItem('portalSessionMeta');
  sessionStorage.removeItem('analyticsPendingLogin');
  sessionStorage.removeItem('analyticsSessionActive');
  sessionStorage.removeItem('analyticsSessionEnded');
  await signOut(auth);
  location.replace('index.html');
};

$('logoutBtn')?.addEventListener('click', performLogout);
$('mobileKebabLogoutBtn')?.addEventListener('click', performLogout);
$('analyticsLogout')?.addEventListener('click', performLogout);

// Mobile Kebab & Submenu toggle
const kebabBtn = $('mobileTopbarKebabBtn');
const kebabDropdown = $('mobileTopbarDropdown');
if (kebabBtn && kebabDropdown) {
  kebabBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    kebabDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!kebabDropdown.contains(e.target) && !kebabBtn.contains(e.target)) {
      kebabDropdown.classList.add('hidden');
    }
  });

  $('mobileMenuDatabases')?.addEventListener('click', () => {
    const sub = $('mobileDatabasesSubmenu');
    if (sub) {
      sub.hidden = !sub.hidden;
      $('mobileMenuDatabases').setAttribute('aria-expanded', String(!sub.hidden));
    }
  });

  $('mobileMenuTools')?.addEventListener('click', () => {
    const sub = $('mobileToolsSubmenu');
    if (sub) {
      sub.hidden = !sub.hidden;
      $('mobileMenuTools').setAttribute('aria-expanded', String(!sub.hidden));
    }
  });
}
document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => {
  days = Number(button.dataset.days);
  page = 1;
  document.querySelectorAll('[data-days]').forEach(item => item.classList.toggle('selected', item === button));
  render();
}));
