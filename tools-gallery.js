import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { initWifiDataTransfer } from "./wifi-transfer.js?v=441";

// ==========================================================================
// 0. AUTHENTICATION & ACCESS GUARD
// ==========================================================================
onAuthStateChanged(auth, (user) => {
    // Check if user is joining a Wi-Fi transfer session (?room= or ?tool=wifi)
    const urlParams = new URLSearchParams(window.location.search);
    const isWifiJoin = urlParams.has('room') || urlParams.get('tool') === 'wifi';
    
    // Both teachers/admins and students can access, but if unauthenticated, no student session, and not joining wifi room, redirect to portal
    const hasStudentSession = sessionStorage.getItem('studentLoggedInSession') || localStorage.getItem('portalRememberedStudent');
    if (!user && !hasStudentSession && !isWifiJoin) {
        window.location.replace("index.html");
    }
});

// ==========================================================================
// 1. NAVIGATION TABS (NOTES, CALCULATOR, TIMER, WHEEL, CONVERTER, WIFI)
// ==========================================================================
const navButtons = document.querySelectorAll('.tool-nav-btn');
const toolPanels = {
    notes: document.getElementById('toolPanelNotes'),
    calculator: document.getElementById('toolPanelCalculator'),
    timer: document.getElementById('toolPanelTimer'),
    wheel: document.getElementById('toolPanelWheel'),
    converter: document.getElementById('toolPanelConverter'),
    wifi: document.getElementById('toolPanelWifi')
};

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const toolName = btn.getAttribute('data-tool');
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        Object.keys(toolPanels).forEach(key => {
            if (toolPanels[key]) {
                toolPanels[key].classList.toggle('active', key === toolName);
            }
        });

        // Resize or redraw canvas if switching to wheel
        if (toolName === 'wheel') {
            setTimeout(drawWheel, 50);
        }
    });
});

// Auto-switch tab if requested in URL (e.g. ?tool=wifi or ?room=...)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('tool') === 'wifi' || urlParams.get('room')) {
    const wifiBtn = document.querySelector('.tool-nav-btn[data-tool="wifi"]');
    if (wifiBtn) {
        wifiBtn.click();
    }
}

// Initialize Wi-Fi Data & File Transfer Manager
initWifiDataTransfer();

// ==========================================================================
// 1.5. WHEEL CUSTOMIZATION SETTINGS STATE & PALETTES
// ==========================================================================
const WHEEL_THEMES = {
    vibrant: [
        '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
        '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#e11d48',
        '#84cc16', '#0ea5e9'
    ],
    pastel: [
        '#93c5fd', '#a7f3d0', '#fde68a', '#fbcfe8', '#c4b5fd',
        '#a5f3fc', '#fed7aa', '#99f6e4', '#c7d2fe', '#fecdd3'
    ],
    ocean: [
        '#0284c7', '#0369a1', '#06b6d4', '#0891b2', '#0e7490',
        '#38bdf8', '#0284c7', '#2563eb', '#1d4ed8', '#0ea5e9'
    ],
    warm: [
        '#ef4444', '#f97316', '#f59e0b', '#e11d48', '#d97706',
        '#dc2626', '#ea580c', '#fb923c', '#b45309', '#f43f5e'
    ],
    emerald: [
        '#10b981', '#059669', '#047857', '#14b8a6', '#0d9488',
        '#34d399', '#6ee7b7', '#22c55e', '#16a34a', '#15803d'
    ]
};

let wheelSettings = {
    duration: 5,      // seconds (4, 5, 7, 10)
    theme: 'vibrant', // vibrant, pastel, ocean, warm, emerald
    sound: 'classic'  // classic, arcade, digital, silent
};

try {
    const savedWheelSettings = localStorage.getItem('mks_wheel_settings');
    if (savedWheelSettings) {
        wheelSettings = { ...wheelSettings, ...JSON.parse(savedWheelSettings) };
        if (parseFloat(wheelSettings.duration) < 4) {
            wheelSettings.duration = 5;
        }
    }
} catch (e) {}

// ==========================================================================
// 2. WEB AUDIO API SYNTHESIZER (No external audio files needed!)
// ==========================================================================
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTickSound() {
    if (wheelSettings.sound === 'silent') return;
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (wheelSettings.sound === 'arcade') {
            // Retro 8-bit blip
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.02);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        } else if (wheelSettings.sound === 'digital') {
            // Crisp soft pop
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.03);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
        } else {
            // Classic mechanical tick
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.22, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
}

function playFanfareSound() {
    if (wheelSettings.sound === 'silent') return;
    try {
        const ctx = getAudioContext();

        if (wheelSettings.sound === 'arcade') {
            // Fast 8-bit victory arpeggio
            const arp = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            arp.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
                gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.07);
                osc.stop(ctx.currentTime + idx * 0.07 + 0.18);
            });
        } else if (wheelSettings.sound === 'digital') {
            // Celestial chime bell
            const chimes = [659.25, 830.61, 987.77, 1318.51];
            chimes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);
                gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.09);
                osc.stop(ctx.currentTime + idx * 0.09 + 0.5);
            });
        } else {
            // Classic triumphant fanfare
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
                gain.gain.setValueAtTime(0.25, ctx.currentTime + idx * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.12);
                osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
            });
        }
    } catch (e) {}
}

function playAlarmSound() {
    try {
        const ctx = getAudioContext();
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.25);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.25);
            osc.stop(ctx.currentTime + i * 0.25 + 0.18);
        }
    } catch (e) {}
}

// ==========================================================================
// 3. TOOL: SIMPLE NOTES (LocalStorage backed with auto-save)
// ==========================================================================
const NOTES_STORAGE_KEY = 'mks_teacher_simple_notes';
let notes = [];
let activeNoteId = null;

function loadNotesFromStorage() {
    try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (raw) {
            notes = JSON.parse(raw);
        } else {
            notes = [
                {
                    id: 'note_' + Date.now(),
                    title: 'Welcome to Simple Notes',
                    content: 'This notepad stores your classroom reminders, lesson ideas, and student notes safely in your browser.\n\n• You can create as many notes as you like.\n• Everything saves automatically as you type.\n• Fast and responsive for quick classroom capture.',
                    updatedAt: Date.now()
                }
            ];
            saveNotesToStorage();
        }
    } catch (e) {
        notes = [];
    }
}

function saveNotesToStorage() {
    try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
        console.warn("Notes storage error:", e);
    }
}

function renderNotesList() {
    const listEl = document.getElementById('notesListContainer');
    const search = document.getElementById('noteSearchInput')?.value.trim().toLowerCase() || '';
    if (!listEl) return;

    listEl.innerHTML = '';
    const filtered = notes.filter(n => (n.title || '').toLowerCase().includes(search) || (n.content || '').toLowerCase().includes(search));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">No notes found</div>`;
        return;
    }

    filtered.forEach(note => {
        const item = document.createElement('div');
        item.className = `note-item ${note.id === activeNoteId ? 'active' : ''}`;
        const dateStr = new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `
            <div class="note-item-title">${escapeText(note.title || 'Untitled Note')}</div>
            <div class="note-item-date">${dateStr}</div>
        `;
        item.addEventListener('click', () => selectNote(note.id));
        listEl.appendChild(item);
    });
}

function selectNote(noteId) {
    activeNoteId = noteId;
    const note = notes.find(n => n.id === noteId);
    const titleInput = document.getElementById('noteTitleInput');
    const contentInput = document.getElementById('noteContentInput');
    const charCount = document.getElementById('noteCharCount');

    if (note) {
        if (titleInput) titleInput.value = note.title || '';
        if (contentInput) contentInput.value = note.content || '';
        if (charCount) charCount.innerText = `${(note.content || '').length} characters`;
    }
    renderNotesList();
}

function createNewNote() {
    const newNote = {
        id: 'note_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        title: 'New Note',
        content: '',
        updatedAt: Date.now()
    };
    notes.unshift(newNote);
    saveNotesToStorage();
    selectNote(newNote.id);
    document.getElementById('noteTitleInput')?.focus();
}

function deleteCurrentNote() {
    if (!activeNoteId) return;
    if (confirm("Are you sure you want to delete this note?")) {
        notes = notes.filter(n => n.id !== activeNoteId);
        saveNotesToStorage();
        activeNoteId = notes.length > 0 ? notes[0].id : null;
        if (activeNoteId) {
            selectNote(activeNoteId);
        } else {
            const titleInput = document.getElementById('noteTitleInput');
            const contentInput = document.getElementById('noteContentInput');
            if (titleInput) titleInput.value = '';
            if (contentInput) contentInput.value = '';
            renderNotesList();
        }
    }
}

function saveCurrentNote() {
    if (!activeNoteId) {
        if (!document.getElementById('noteTitleInput')?.value && !document.getElementById('noteContentInput')?.value) return;
        createNewNote();
    }
    const note = notes.find(n => n.id === activeNoteId);
    if (note) {
        note.title = document.getElementById('noteTitleInput')?.value.trim() || 'Untitled Note';
        note.content = document.getElementById('noteContentInput')?.value || '';
        note.updatedAt = Date.now();
        saveNotesToStorage();
        renderNotesList();
        const statusEl = document.getElementById('noteSavedStatus');
        if (statusEl) {
            statusEl.innerText = 'Saved just now';
            setTimeout(() => { if (statusEl) statusEl.innerText = 'All changes saved locally'; }, 2000);
        }
    }
}

// Setup Note Event Listeners
document.getElementById('btnNewNote')?.addEventListener('click', createNewNote);
document.getElementById('btnSaveNote')?.addEventListener('click', saveCurrentNote);
document.getElementById('btnDeleteNote')?.addEventListener('click', deleteCurrentNote);
document.getElementById('noteSearchInput')?.addEventListener('input', renderNotesList);

document.getElementById('noteTitleInput')?.addEventListener('input', () => {
    saveCurrentNote();
});
document.getElementById('noteContentInput')?.addEventListener('input', (e) => {
    const charCount = document.getElementById('noteCharCount');
    if (charCount) charCount.innerText = `${e.target.value.length} characters`;
    saveCurrentNote();
});

// Initialize Notes
loadNotesFromStorage();
if (notes.length > 0) {
    selectNote(notes[0].id);
}

// ==========================================================================
// 4. TOOL: CALCULATOR
// ==========================================================================
let calcCurrVal = '0';
let calcPrevVal = '';
let calcOperation = null;
let calcResetOnNextDigit = false;

const calcCurrentEl = document.getElementById('calcCurrent');
const calcHistoryEl = document.getElementById('calcHistory');

function updateCalcDisplay() {
    if (calcCurrentEl) calcCurrentEl.innerText = calcCurrVal;
    if (calcHistoryEl) {
        if (calcOperation && calcPrevVal) {
            calcHistoryEl.innerText = `${calcPrevVal} ${calcOperation}`;
        } else {
            calcHistoryEl.innerHTML = '&nbsp;';
        }
    }
}

window.calcDigit = function (digit) {
    if (calcCurrVal === '0' || calcResetOnNextDigit) {
        calcCurrVal = digit;
        calcResetOnNextDigit = false;
    } else {
        calcCurrVal += digit;
    }
    updateCalcDisplay();
};

window.calcDot = function () {
    if (calcResetOnNextDigit) {
        calcCurrVal = '0.';
        calcResetOnNextDigit = false;
    } else if (!calcCurrVal.includes('.')) {
        calcCurrVal += '.';
    }
    updateCalcDisplay();
};

window.calcOp = function (op) {
    if (calcOperation && !calcResetOnNextDigit) {
        window.calcEquals();
    }
    calcPrevVal = calcCurrVal;
    calcOperation = op;
    calcResetOnNextDigit = true;
    updateCalcDisplay();
};

window.calcEquals = function () {
    if (!calcOperation || !calcPrevVal) return;
    const prev = parseFloat(calcPrevVal);
    const curr = parseFloat(calcCurrVal);
    let result = 0;

    switch (calcOperation) {
        case '+': result = prev + curr; break;
        case '-': result = prev - curr; break;
        case '*': result = prev * curr; break;
        case '^': result = Math.pow(prev, curr); break;
        case '/':
            if (curr === 0) {
                calcCurrVal = 'Error';
                calcPrevVal = '';
                calcOperation = null;
                calcResetOnNextDigit = true;
                updateCalcDisplay();
                return;
            }
            result = prev / curr;
            break;
    }

    calcCurrVal = String(Math.round(result * 100000000) / 100000000);
    calcPrevVal = '';
    calcOperation = null;
    calcResetOnNextDigit = true;
    updateCalcDisplay();
};

window.calcPercent = function () {
    const val = parseFloat(calcCurrVal);
    if (!isNaN(val)) {
        calcCurrVal = String(val / 100);
        updateCalcDisplay();
    }
};

window.calcClear = function () {
    calcCurrVal = '0';
    calcPrevVal = '';
    calcOperation = null;
    calcResetOnNextDigit = false;
    updateCalcDisplay();
};

window.calcBackspace = function () {
    if (calcCurrVal.length > 1) {
        calcCurrVal = calcCurrVal.slice(0, -1);
    } else {
        calcCurrVal = '0';
    }
    updateCalcDisplay();
};

// --- Calculator Mode State ---
let calcMode = 'standard'; // 'standard' | 'scientific'
let calcAngleMode = 'deg';  // 'deg' | 'rad'

window.setCalcMode = function (mode) {
    calcMode = mode;
    const wrapper = document.getElementById('calculatorWrapper');
    const tabStd = document.getElementById('btnCalcModeStandard');
    const tabSci = document.getElementById('btnCalcModeScientific');

    if (wrapper) wrapper.classList.toggle('scientific-mode', mode === 'scientific');
    if (tabStd) tabStd.classList.toggle('active', mode === 'standard');
    if (tabSci) tabSci.classList.toggle('active', mode === 'scientific');
};

window.calcSci = function (fn) {
    const curr = parseFloat(calcCurrVal);
    if (isNaN(curr) && fn !== 'pi' && fn !== 'e') return;

    let res = 0;
    const toRad = calcAngleMode === 'deg' ? (Math.PI / 180) : 1;

    switch (fn) {
        case 'sin':
            res = Math.sin(curr * toRad);
            calcHistoryEl.innerText = `sin(${curr})`;
            break;
        case 'cos':
            res = Math.cos(curr * toRad);
            calcHistoryEl.innerText = `cos(${curr})`;
            break;
        case 'tan':
            if (calcAngleMode === 'deg' && Math.abs(curr % 180) === 90) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            res = Math.tan(curr * toRad);
            calcHistoryEl.innerText = `tan(${curr})`;
            break;
        case 'deg_rad':
            calcAngleMode = calcAngleMode === 'deg' ? 'rad' : 'deg';
            const btnAngle = document.getElementById('btnAngleMode');
            if (btnAngle) btnAngle.innerText = calcAngleMode;
            return;
        case 'pi':
            res = Math.PI;
            break;
        case 'e':
            res = Math.E;
            break;
        case 'sqrt':
            if (curr < 0) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            res = Math.sqrt(curr);
            calcHistoryEl.innerText = `√(${curr})`;
            break;
        case 'square':
            res = curr * curr;
            calcHistoryEl.innerText = `sqr(${curr})`;
            break;
        case 'cube':
            res = curr * curr * curr;
            calcHistoryEl.innerText = `cube(${curr})`;
            break;
        case 'power':
            window.calcOp('^');
            return;
        case 'log':
            if (curr <= 0) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            res = Math.log10(curr);
            calcHistoryEl.innerText = `log(${curr})`;
            break;
        case 'ln':
            if (curr <= 0) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            res = Math.log(curr);
            calcHistoryEl.innerText = `ln(${curr})`;
            break;
        case 'factorial':
            if (curr < 0 || !Number.isInteger(curr) || curr > 170) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            let f = 1;
            for (let i = 2; i <= curr; i++) f *= i;
            res = f;
            calcHistoryEl.innerText = `fact(${curr})`;
            break;
        case 'inv':
            if (curr === 0) {
                calcCurrVal = 'Error';
                updateCalcDisplay();
                return;
            }
            res = 1 / curr;
            calcHistoryEl.innerText = `1/(${curr})`;
            break;
        case 'neg':
            res = -curr;
            break;
    }

    calcCurrVal = String(Math.round(res * 100000000) / 100000000);
    calcResetOnNextDigit = true;
    updateCalcDisplay();
};

// Keyboard support for calculator
window.addEventListener('keydown', (e) => {
    if (!document.getElementById('toolPanelCalculator')?.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key >= '0' && e.key <= '9') window.calcDigit(e.key);
    else if (e.key === '.') window.calcDot();
    else if (e.key === '+') window.calcOp('+');
    else if (e.key === '-') window.calcOp('-');
    else if (e.key === '*' || e.key === 'x') window.calcOp('*');
    else if (e.key === '/') { e.preventDefault(); window.calcOp('/'); }
    else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); window.calcEquals(); }
    else if (e.key === 'Backspace') window.calcBackspace();
    else if (e.key === 'Escape') window.calcClear();
});

// ==========================================================================
// 5. TOOL: COUNTDOWN TIMER & STOPWATCH
// ==========================================================================
// --- Countdown Timer ---
let timerInterval = null;
let timerTotalSeconds = 300; // 5 mins
let timerRemainingSeconds = 300;
let isTimerRunning = false;

const timerDisplayEl = document.getElementById('timerDisplay');
const btnTimerStart = document.getElementById('btnTimerStart');
const btnTimerPause = document.getElementById('btnTimerPause');
const btnTimerReset = document.getElementById('btnTimerReset');

function formatTimerSeconds(totalSecs) {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimerDisplay() {
    if (timerDisplayEl) timerDisplayEl.innerText = formatTimerSeconds(timerRemainingSeconds);
}

window.setTimerPreset = function (minutes) {
    if (isTimerRunning) pauseTimer();
    const hInput = document.getElementById('timerHours');
    const mInput = document.getElementById('timerMinutes');
    const sInput = document.getElementById('timerSeconds');
    if (hInput) hInput.value = 0;
    if (mInput) mInput.value = minutes;
    if (sInput) sInput.value = 0;

    timerTotalSeconds = minutes * 60;
    timerRemainingSeconds = timerTotalSeconds;
    updateTimerDisplay();
};

function readInputsIntoTimer() {
    const h = parseInt(document.getElementById('timerHours')?.value || 0, 10);
    const m = parseInt(document.getElementById('timerMinutes')?.value || 0, 10);
    const s = parseInt(document.getElementById('timerSeconds')?.value || 0, 10);
    timerTotalSeconds = (h * 3600) + (m * 60) + s;
    if (timerTotalSeconds <= 0) timerTotalSeconds = 60;
    timerRemainingSeconds = timerTotalSeconds;
    updateTimerDisplay();
}

['timerHours', 'timerMinutes', 'timerSeconds'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        if (!isTimerRunning) readInputsIntoTimer();
    });
});

function startTimer() {
    if (timerRemainingSeconds <= 0) {
        readInputsIntoTimer();
    }
    isTimerRunning = true;
    if (btnTimerStart) btnTimerStart.style.display = 'none';
    if (btnTimerPause) btnTimerPause.style.display = 'inline-block';

    timerInterval = setInterval(() => {
        timerRemainingSeconds--;
        updateTimerDisplay();
        if (timerRemainingSeconds <= 0) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            if (btnTimerStart) btnTimerStart.style.display = 'inline-block';
            if (btnTimerPause) btnTimerPause.style.display = 'none';
            playAlarmSound();
            alert("⏰ Time's up!");
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    if (btnTimerStart) btnTimerStart.style.display = 'inline-block';
    if (btnTimerPause) btnTimerPause.style.display = 'none';
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    readInputsIntoTimer();
    if (btnTimerStart) btnTimerStart.style.display = 'inline-block';
    if (btnTimerPause) btnTimerPause.style.display = 'none';
}

btnTimerStart?.addEventListener('click', startTimer);
btnTimerPause?.addEventListener('click', pauseTimer);
btnTimerReset?.addEventListener('click', resetTimer);
updateTimerDisplay();

// --- Stopwatch ---
let swInterval = null;
let swStartTime = 0;
let swElapsedTime = 0;
let isSwRunning = false;
let swLaps = [];

const stopwatchDisplayEl = document.getElementById('stopwatchDisplay');
const btnSwStart = document.getElementById('btnSwStart');
const btnSwPause = document.getElementById('btnSwPause');
const btnSwLap = document.getElementById('btnSwLap');
const btnSwReset = document.getElementById('btnSwReset');
const swLapsContainer = document.getElementById('swLapsContainer');

function formatStopwatchTime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const c = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function updateStopwatchDisplay() {
    if (stopwatchDisplayEl) stopwatchDisplayEl.innerText = formatStopwatchTime(swElapsedTime);
}

btnSwStart?.addEventListener('click', () => {
    isSwRunning = true;
    swStartTime = Date.now() - swElapsedTime;
    btnSwStart.style.display = 'none';
    btnSwPause.style.display = 'inline-block';

    swInterval = setInterval(() => {
        swElapsedTime = Date.now() - swStartTime;
        updateStopwatchDisplay();
    }, 20);
});

btnSwPause?.addEventListener('click', () => {
    clearInterval(swInterval);
    isSwRunning = false;
    btnSwStart.style.display = 'inline-block';
    btnSwPause.style.display = 'none';
});

btnSwReset?.addEventListener('click', () => {
    clearInterval(swInterval);
    isSwRunning = false;
    swElapsedTime = 0;
    swLaps = [];
    updateStopwatchDisplay();
    btnSwStart.style.display = 'inline-block';
    btnSwPause.style.display = 'none';
    if (swLapsContainer) swLapsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 8px;">No laps recorded yet</div>';
});

btnSwLap?.addEventListener('click', () => {
    if (!isSwRunning && swElapsedTime === 0) return;
    swLaps.unshift({
        num: swLaps.length + 1,
        time: formatStopwatchTime(swElapsedTime)
    });
    if (swLapsContainer) {
        swLapsContainer.innerHTML = swLaps.map(lap => `
            <div class="lap-row">
                <span>Lap ${lap.num}</span>
                <strong>${lap.time}</strong>
            </div>
        `).join('');
    }
});

// ==========================================================================
// 6. TOOL: WHEEL SPINNER / RANDOMIZER & PRESENTATION SEQUENCE
// ==========================================================================
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas?.getContext('2d');
let wheelNames = ["Student A", "Student B", "Student C", "Student D", "Student E", "Student F"];
let currentRotation = 0;
let isSpinning = false;
let lastSelectedStudent = '';

// Modern vibrant palette for wheel slices
const WHEEL_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#e11d48',
    '#84cc16', '#0ea5e9'
];

function drawWheel() {
    if (!ctx || !canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = cx - 12;

    ctx.clearRect(0, 0, width, height);

    const total = wheelNames.length;
    if (total === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 20px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Please add student names', cx, cy);
        return;
    }

    const arcSize = (2 * Math.PI) / total;

    // Outer wheel border shadow ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Active color palette based on selected theme
    const activePalette = WHEEL_THEMES[wheelSettings.theme] || WHEEL_THEMES.vibrant;

    // Determine font size adaptively based on total slice count
    let fontSize = 16;
    if (total > 28) fontSize = 11;
    else if (total > 20) fontSize = 12.5;
    else if (total > 14) fontSize = 14;
    else if (total > 8) fontSize = 15;
    else fontSize = 17;

    for (let i = 0; i < total; i++) {
        const angle = i * arcSize;

        // Draw Slice
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, angle, angle + arcSize);
        ctx.fillStyle = activePalette[i % activePalette.length];
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = total > 24 ? 1.5 : 2.5;
        ctx.stroke();

        // Draw Name inside Slice
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + arcSize / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        const fullName = wheelNames[i] || '';
        const words = fullName.trim().split(/\s+/);
        const textDist = radius - 28;

        // If slice angle is large enough and name has multiple words, split into 2 lines
        const canTwoLine = arcSize >= 0.18 && words.length > 1 && fullName.length > 11;

        if (canTwoLine) {
            const mid = Math.ceil(words.length / 2);
            let line1 = words.slice(0, mid).join(' ');
            let line2 = words.slice(mid).join(' ');

            const maxChars = total > 20 ? 15 : 18;
            if (line1.length > maxChars) line1 = line1.substring(0, maxChars - 2) + '…';
            if (line2.length > maxChars) line2 = line2.substring(0, maxChars - 2) + '…';

            const subFont = Math.max(10, fontSize - 2);
            ctx.font = `bold ${subFont}px 'Plus Jakarta Sans', Outfit, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.fillText(line1, textDist, -subFont * 0.65);
            ctx.fillText(line2, textDist, subFont * 0.65);
        } else {
            // Single line formatting
            let text = fullName;
            const maxChars = total > 24 ? 18 : (total > 16 ? 22 : 26);
            if (text.length > maxChars) {
                text = text.substring(0, maxChars - 2) + '…';
            }
            ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', Outfit, sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.fillText(text, textDist, 0);
        }

        ctx.restore();
    }
}

function spinWheel() {
    if (isSpinning || wheelNames.length === 0) return;
    isSpinning = true;

    // Duration from settings in seconds (default 5s, ensures plenty of suspenseful deceleration)
    const durationSecs = Math.max(4, parseFloat(wheelSettings.duration) || 5);
    const durationMs = durationSecs * 1000;

    // Guarantee AT LEAST 10 full 360-degree clockwise rotations on EVERY spin
    const minRounds = 10;
    const extraRounds = minRounds + Math.floor(Math.random() * 4); // 10 to 13 full spins
    const randomDegree = Math.floor(Math.random() * 360);
    // Crucial: Always add to currentRotation so it ALWAYS spins clockwise consistently without jumping or reversing
    const targetRotation = currentRotation + (extraRounds * 360) + randomDegree;

    // Apply dynamic duration and realistic easing to canvas (fast spin that suspensefully slows down)
    if (canvas) {
        canvas.style.transition = `transform ${durationSecs}s cubic-bezier(0.12, 0.95, 0.22, 1)`;
        canvas.style.transform = `rotate(${targetRotation}deg)`;
    }

    // Audio ticking sound with deceleration simulation for suspense
    const startTime = performance.now();
    let tickTimeout = null;

    function scheduleNextTick() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        if (progress >= 0.98) return; // Stop right before completion

        playTickSound();

        // Interval increases as progress increases (fast clicks initially ~45ms, slowing down to ~360ms near the stop)
        const delay = 45 + Math.pow(progress, 3) * 350;
        if (elapsed + delay < durationMs) {
            tickTimeout = setTimeout(scheduleNextTick, delay);
        }
    }

    scheduleNextTick();

    setTimeout(() => {
        if (tickTimeout) clearTimeout(tickTimeout);
        // Retain cumulative rotation so next spin starts from this exact angle and continues clockwise
        currentRotation = targetRotation;
        isSpinning = false;

        // Calculate winner
        // The pointer is at 12 o'clock (270 degrees in canvas coordinates)
        const total = wheelNames.length;
        const arcDeg = 360 / total;
        // Normalize rotation to determine winner
        const normalizedDeg = (targetRotation % 360 + 360) % 360;
        const actualDeg = (360 - normalizedDeg + 270) % 360;
        const winningIndex = Math.floor(actualDeg / arcDeg) % total;
        const winner = wheelNames[winningIndex] || wheelNames[0];
        lastSelectedStudent = winner;

        playFanfareSound();
        showWinnerModal(winner);
    }, durationMs + 100);
}

function showWinnerModal(name) {
    const modal = document.getElementById('winnerModal');
    const nameEl = document.getElementById('winnerNameDisplay');
    if (nameEl) nameEl.innerText = name;
    if (modal) modal.style.display = 'flex';
}

function closeWinnerModal() {
    const modal = document.getElementById('winnerModal');
    if (modal) modal.style.display = 'none';
}

document.getElementById('btnCloseWinner')?.addEventListener('click', closeWinnerModal);
document.getElementById('btnRemoveWinner')?.addEventListener('click', () => {
    if (lastSelectedStudent) {
        wheelNames = wheelNames.filter(n => n !== lastSelectedStudent);
        syncWheelNamesToInput();
        drawWheel();
    }
    closeWinnerModal();
});

document.getElementById('btnSpinWheel')?.addEventListener('click', spinWheel);
document.getElementById('btnCenterSpin')?.addEventListener('click', spinWheel);

// Load Students from Firestore into Class Selector
async function loadStudentsIntoWheel() {
    try {
        const snap = await getDocs(collection(db, "students"));
        const studentsByClass = {};

        snap.forEach(doc => {
            const data = doc.data();
            const sClass = data.studentClass || data.class || 'Unassigned';
            const sName = data.studentName || data.name || doc.id;
            if (!studentsByClass[sClass]) studentsByClass[sClass] = [];
            studentsByClass[sClass].push(sName);
        });

        const selector = document.getElementById('wheelClassSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">-- Choose Class to Load --</option>';
        Object.keys(studentsByClass).sort().forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = `${cls} (${studentsByClass[cls].length} students)`;
            selector.appendChild(opt);
        });

        selector.addEventListener('change', (e) => {
            const cls = e.target.value;
            if (cls && studentsByClass[cls]) {
                wheelNames = [...studentsByClass[cls]];
                syncWheelNamesToInput();
                drawWheel();
            }
        });
    } catch (e) {
        console.warn("Could not load students for wheel:", e);
    }
}

function syncWheelNamesToInput() {
    const textarea = document.getElementById('wheelNamesInput');
    const badge = document.getElementById('namesCountBadge');
    if (textarea) textarea.value = wheelNames.join('\n');
    if (badge) badge.innerText = `${wheelNames.length} items`;
}

function readInputIntoWheelNames() {
    const textarea = document.getElementById('wheelNamesInput');
    if (!textarea) return;
    const lines = textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
    wheelNames = lines;
    const badge = document.getElementById('namesCountBadge');
    if (badge) badge.innerText = `${wheelNames.length} items`;
    drawWheel();
}

document.getElementById('btnApplyNames')?.addEventListener('click', readInputIntoWheelNames);
document.getElementById('btnClearNames')?.addEventListener('click', () => {
    wheelNames = [];
    syncWheelNamesToInput();
    drawWheel();
});

document.getElementById('btnShuffleNames')?.addEventListener('click', () => {
    for (let i = wheelNames.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wheelNames[i], wheelNames[j]] = [wheelNames[j], wheelNames[i]];
    }
    syncWheelNamesToInput();
    drawWheel();
});

// Presentation Sequence Generator
document.getElementById('btnGenerateSequence')?.addEventListener('click', () => {
    readInputIntoWheelNames();
    if (wheelNames.length === 0) {
        alert("Please enter names first!");
        return;
    }

    const shuffled = [...wheelNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const container = document.getElementById('sequenceResultContainer');
    const list = document.getElementById('sequenceList');
    if (list) {
        list.innerHTML = shuffled.map((name, i) => `<li><strong>${name}</strong></li>`).join('');
    }
    if (container) container.style.display = 'block';
});

document.getElementById('btnCopySequence')?.addEventListener('click', () => {
    const list = document.getElementById('sequenceList');
    if (!list) return;
    const items = Array.from(list.querySelectorAll('li')).map((li, i) => `${i + 1}. ${li.innerText}`).join('\n');
    navigator.clipboard.writeText(items).then(() => {
        alert("Sequence copied to clipboard!");
    });
});

// Helper
function escapeText(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

// Wheel Settings Drawer & Controls
const btnToggleWheelSettings = document.getElementById('btnToggleWheelSettings');
const wheelSettingsDrawer = document.getElementById('wheelSettingsDrawer');
const wheelDurationSelect = document.getElementById('wheelDurationSelect');
const wheelThemeSelect = document.getElementById('wheelThemeSelect');
const wheelSoundSelect = document.getElementById('wheelSoundSelect');

if (wheelDurationSelect) wheelDurationSelect.value = String(wheelSettings.duration || 5);
if (wheelThemeSelect) wheelThemeSelect.value = wheelSettings.theme || 'vibrant';
if (wheelSoundSelect) wheelSoundSelect.value = wheelSettings.sound || 'classic';

btnToggleWheelSettings?.addEventListener('click', () => {
    if (!wheelSettingsDrawer) return;
    const isHidden = wheelSettingsDrawer.style.display === 'none';
    wheelSettingsDrawer.style.display = isHidden ? 'flex' : 'none';
});

wheelDurationSelect?.addEventListener('change', (e) => {
    wheelSettings.duration = parseFloat(e.target.value) || 5;
    localStorage.setItem('mks_wheel_settings', JSON.stringify(wheelSettings));
});

wheelThemeSelect?.addEventListener('change', (e) => {
    wheelSettings.theme = e.target.value;
    localStorage.setItem('mks_wheel_settings', JSON.stringify(wheelSettings));
    drawWheel();
});

wheelSoundSelect?.addEventListener('change', (e) => {
    wheelSettings.sound = e.target.value;
    localStorage.setItem('mks_wheel_settings', JSON.stringify(wheelSettings));
    // Play test blip to demonstrate sound effect
    playTickSound();
});

// Initial Wheel setup
syncWheelNamesToInput();
drawWheel();
loadStudentsIntoWheel();

// ==========================================================================
// 7. TOOL 5: UNIT CONVERTER (Length, Temp, Area, Volume, Weight, Time, Money)
// ==========================================================================
const CONVERTER_CONFIG = {
    length: {
        title: "Length Converter",
        subtitle: "Convert between metric and imperial length units",
        units: [
            { id: "km", name: "Kilometer (km)", toBase: 1000 },
            { id: "m", name: "Meter (m)", toBase: 1 },
            { id: "cm", name: "Centimeter (cm)", toBase: 0.01 },
            { id: "mm", name: "Millimeter (mm)", toBase: 0.001 },
            { id: "mi", name: "Mile (mi)", toBase: 1609.344 },
            { id: "yd", name: "Yard (yd)", toBase: 0.9144 },
            { id: "ft", name: "Foot (ft)", toBase: 0.3048 },
            { id: "in", name: "Inch (in)", toBase: 0.0254 }
        ],
        defaultFrom: "m",
        defaultTo: "cm"
    },
    temperature: {
        title: "Temperature Converter",
        subtitle: "Convert Celsius, Fahrenheit, Kelvin, and Rankine",
        units: [
            { id: "C", name: "Celsius (°C)" },
            { id: "F", name: "Fahrenheit (°F)" },
            { id: "K", name: "Kelvin (K)" },
            { id: "R", name: "Rankine (°R)" }
        ],
        defaultFrom: "C",
        defaultTo: "F"
    },
    area: {
        title: "Area Converter",
        subtitle: "Convert square meters, hectares, acres, and square feet",
        units: [
            { id: "sq_km", name: "Square Kilometer (km²)", toBase: 1000000 },
            { id: "sq_m", name: "Square Meter (m²)", toBase: 1 },
            { id: "sq_cm", name: "Square Centimeter (cm²)", toBase: 0.0001 },
            { id: "ha", name: "Hectare (ha)", toBase: 10000 },
            { id: "acre", name: "Acre (ac)", toBase: 4046.8564224 },
            { id: "sq_mi", name: "Square Mile (sq mi)", toBase: 2589988.110336 },
            { id: "sq_yd", name: "Square Yard (sq yd)", toBase: 0.83612736 },
            { id: "sq_ft", name: "Square Foot (sq ft)", toBase: 0.09290304 },
            { id: "sq_in", name: "Square Inch (sq in)", toBase: 0.00064516 }
        ],
        defaultFrom: "sq_m",
        defaultTo: "sq_ft"
    },
    volume: {
        title: "Volume Converter",
        subtitle: "Convert liters, milliliters, cubic meters, gallons, and cups",
        units: [
            { id: "m3", name: "Cubic Meter (m³)", toBase: 1000 },
            { id: "L", name: "Liter (L)", toBase: 1 },
            { id: "mL", name: "Milliliter (mL)", toBase: 0.001 },
            { id: "gal", name: "US Gallon (gal)", toBase: 3.78541 },
            { id: "qt", name: "US Quart (qt)", toBase: 0.946353 },
            { id: "pt", name: "US Pint (pt)", toBase: 0.473176 },
            { id: "cup", name: "US Cup", toBase: 0.236588 },
            { id: "fl_oz", name: "US Fluid Ounce (fl oz)", toBase: 0.0295735 }
        ],
        defaultFrom: "L",
        defaultTo: "mL"
    },
    weight: {
        title: "Weight & Mass Converter",
        subtitle: "Convert kilograms, grams, milligrams, pounds, and ounces",
        units: [
            { id: "ton", name: "Metric Ton (t)", toBase: 1000 },
            { id: "kg", name: "Kilogram (kg)", toBase: 1 },
            { id: "g", name: "Gram (g)", toBase: 0.001 },
            { id: "mg", name: "Milligram (mg)", toBase: 0.000001 },
            { id: "lb", name: "Pound (lb)", toBase: 0.45359237 },
            { id: "oz", name: "Ounce (oz)", toBase: 0.028349523125 }
        ],
        defaultFrom: "kg",
        defaultTo: "lb"
    },
    time: {
        title: "Time Converter",
        subtitle: "Convert seconds, minutes, hours, days, weeks, and years",
        units: [
            { id: "yr", name: "Year (yr / 365d)", toBase: 31536000 },
            { id: "mo", name: "Month (mo / 30d)", toBase: 2592000 },
            { id: "wk", name: "Week (wk)", toBase: 604800 },
            { id: "d", name: "Day (d)", toBase: 86400 },
            { id: "hr", name: "Hour (hr)", toBase: 3600 },
            { id: "min", name: "Minute (min)", toBase: 60 },
            { id: "s", name: "Second (s)", toBase: 1 },
            { id: "ms", name: "Millisecond (ms)", toBase: 0.001 }
        ],
        defaultFrom: "hr",
        defaultTo: "min"
    },
    money: {
        title: "Real-Time Money & Currency Converter",
        subtitle: "Live real-time foreign exchange market rates with USD base",
        units: [
            { id: "USD", name: "United States Dollar (USD $)" },
            { id: "IDR", name: "Indonesian Rupiah (IDR Rp)" },
            { id: "EUR", name: "Euro (EUR €)" },
            { id: "GBP", name: "British Pound (GBP £)" },
            { id: "SGD", name: "Singapore Dollar (SGD S$)" },
            { id: "AUD", name: "Australian Dollar (AUD A$)" },
            { id: "JPY", name: "Japanese Yen (JPY ¥)" },
            { id: "CNY", name: "Chinese Yuan (CNY ¥)" },
            { id: "MYR", name: "Malaysian Ringgit (MYR RM)" },
            { id: "THB", name: "Thai Baht (THB ฿)" },
            { id: "KRW", name: "South Korean Won (KRW ₩)" },
            { id: "CAD", name: "Canadian Dollar (CAD $)" },
            { id: "CHF", name: "Swiss Franc (CHF)" },
            { id: "SAR", name: "Saudi Riyal (SAR ﷼)" }
        ],
        defaultFrom: "USD",
        defaultTo: "IDR"
    }
};

let activeConvCategory = "length";
let currencyRates = {
    USD: 1,
    IDR: 16250,
    EUR: 0.92,
    GBP: 0.78,
    SGD: 1.34,
    AUD: 1.52,
    JPY: 155,
    CNY: 7.24,
    MYR: 4.68,
    THB: 36.5,
    KRW: 1370,
    CAD: 1.37,
    CHF: 0.90,
    SAR: 3.75
};
let isRealTimeCurrencyLoaded = false;

// DOM Elements for converter
const convCatButtons = document.querySelectorAll('.conv-cat-btn');
const convTitleEl = document.getElementById('convTitle');
const convSubtitleEl = document.getElementById('convSubtitle');
const convFromInput = document.getElementById('convFromInput');
const convToInput = document.getElementById('convToInput');
const convFromUnit = document.getElementById('convFromUnit');
const convToUnit = document.getElementById('convToUnit');
const convFormulaText = document.getElementById('convFormulaText');
const convRateInfo = document.getElementById('convRateInfo');
const btnConvSwap = document.getElementById('btnConvSwap');
const convLiveBadgeContainer = document.getElementById('convLiveBadgeContainer');
const convLiveBadgeText = document.getElementById('convLiveBadgeText');

// Fetch real-time currency rates
async function fetchRealTimeExchangeRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error("HTTP error " + res.status);
        const data = await res.json();
        if (data && data.rates) {
            currencyRates = { ...currencyRates, ...data.rates };
            isRealTimeCurrencyLoaded = true;
            if (convLiveBadgeText) {
                const dateStr = data.time_last_update_utc ? new Date(data.time_last_update_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';
                convLiveBadgeText.innerText = `Real-Time Rates (${dateStr})`;
            }
            if (activeConvCategory === 'money') {
                performConversion('from');
            }
        }
    } catch (e) {
        console.warn("Currency fetch fallback to base rates:", e);
        if (convLiveBadgeText) convLiveBadgeText.innerText = 'Offline Reference Rates';
    }
}

function initConverterCategory(catKey) {
    activeConvCategory = catKey;
    const config = CONVERTER_CONFIG[catKey];
    if (!config) return;

    // Update active button
    convCatButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-cat') === catKey);
    });

    if (convTitleEl) convTitleEl.innerText = config.title;
    if (convSubtitleEl) convSubtitleEl.innerText = config.subtitle;

    // Show live rate badge only for money
    if (convLiveBadgeContainer) {
        convLiveBadgeContainer.style.display = catKey === 'money' ? 'block' : 'none';
    }

    // Populate dropdowns
    if (convFromUnit && convToUnit) {
        convFromUnit.innerHTML = '';
        convToUnit.innerHTML = '';

        config.units.forEach(u => {
            const optFrom = document.createElement('option');
            optFrom.value = u.id;
            optFrom.textContent = u.name;
            convFromUnit.appendChild(optFrom);

            const optTo = document.createElement('option');
            optTo.value = u.id;
            optTo.textContent = u.name;
            convToUnit.appendChild(optTo);
        });

        convFromUnit.value = config.defaultFrom;
        convToUnit.value = config.defaultTo;
    }

    if (convFromInput) convFromInput.value = catKey === 'money' ? '100' : '1';
    performConversion('from');
}

function parseConverterNumber(str) {
    if (!str && str !== 0) return 0;
    // Remove all commas from formatted string
    const clean = String(str).replace(/,/g, '').trim();
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
}

function formatWithCommas(numStr) {
    if (!numStr) return "";
    const parts = String(numStr).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
}

function formatInputValue(inputEl) {
    if (!inputEl) return;
    const raw = inputEl.value;
    // Keep cursor position properly
    const cursorPos = inputEl.selectionStart || 0;
    const prevLen = raw.length;

    // Remove any character that is not digit, dot, or minus
    let clean = raw.replace(/,/g, '');
    clean = clean.replace(/[^0-9.-]/g, '');

    // Allow at most one minus at start
    const isNegative = clean.startsWith('-');
    clean = clean.replace(/-/g, '');
    if (isNegative) clean = '-' + clean;

    // Allow at most one dot
    const parts = clean.split('.');
    if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
    }

    if (!clean) {
        inputEl.value = "";
        return;
    }

    const formatted = formatWithCommas(clean);
    inputEl.value = formatted;

    // Adjust cursor position after comma formatting
    const newLen = formatted.length;
    const newCursor = Math.max(0, cursorPos + (newLen - prevLen));
    try {
        inputEl.setSelectionRange(newCursor, newCursor);
    } catch (e) {}
}

function convertValue(val, fromId, toId, catKey) {
    if (isNaN(val)) return 0;
    if (fromId === toId) return val;

    // Temperature requires custom formulas
    if (catKey === 'temperature') {
        let celsius = 0;
        switch (fromId) {
            case 'C': celsius = val; break;
            case 'F': celsius = (val - 32) * (5 / 9); break;
            case 'K': celsius = val - 273.15; break;
            case 'R': celsius = (val - 491.67) * (5 / 9); break;
        }
        switch (toId) {
            case 'C': return celsius;
            case 'F': return (celsius * (9 / 5)) + 32;
            case 'K': return celsius + 273.15;
            case 'R': return (celsius + 273.15) * 1.8;
        }
    }

    // Currency using real time USD rates
    if (catKey === 'money') {
        const rateFromUSD = currencyRates[fromId] || 1;
        const rateToUSD = currencyRates[toId] || 1;
        const inUSD = val / rateFromUSD;
        return inUSD * rateToUSD;
    }

    // Standard linear units
    const config = CONVERTER_CONFIG[catKey];
    const uFrom = config.units.find(u => u.id === fromId);
    const uTo = config.units.find(u => u.id === toId);
    if (!uFrom || !uTo) return val;

    const baseVal = val * uFrom.toBase;
    return baseVal / uTo.toBase;
}

function formatConvertedResult(num, catKey = activeConvCategory) {
    if (num === null || isNaN(num)) return "0";
    if (num === 0) return "0";

    // Handle very tiny numbers near zero
    if (Math.abs(num) < 0.000001 && Math.abs(num) > 0) {
        const tinyStr = num.toFixed(8).replace(/\.?0+$/, '');
        return formatWithCommas(tinyStr);
    }

    // In money converter, format with up to 2 decimal places if it has decimals, or clean decimal
    const maxDigits = catKey === 'money' ? 2 : 6;
    const fixedStr = Number(num.toFixed(maxDigits)).toString();

    // Prevent scientific notation
    let cleanStr = fixedStr;
    if (cleanStr.includes('e') || cleanStr.includes('E')) {
        cleanStr = Number(num).toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: maxDigits });
    }

    return formatWithCommas(cleanStr);
}

function performConversion(source) {
    const fromId = convFromUnit?.value;
    const toId = convToUnit?.value;
    if (!fromId || !toId) return;

    const config = CONVERTER_CONFIG[activeConvCategory];
    const uFromName = config?.units.find(u => u.id === fromId)?.name || fromId;
    const uToName = config?.units.find(u => u.id === toId)?.name || toId;

    if (source === 'from') {
        const fromVal = parseConverterNumber(convFromInput?.value);
        const toVal = convertValue(fromVal, fromId, toId, activeConvCategory);
        if (convToInput) convToInput.value = formatConvertedResult(toVal, activeConvCategory);
    } else {
        const toVal = parseConverterNumber(convToInput?.value);
        const fromVal = convertValue(toVal, toId, fromId, activeConvCategory);
        if (convFromInput) convFromInput.value = formatConvertedResult(fromVal, activeConvCategory);
    }

    // Update Formula / Rate badge
    const oneToResult = convertValue(1, fromId, toId, activeConvCategory);
    if (convFormulaText) {
        convFormulaText.innerText = `1 ${uFromName.split('(')[0].trim()} = ${formatConvertedResult(oneToResult, activeConvCategory)} ${uToName.split('(')[0].trim()}`;
    }
    if (convRateInfo) {
        if (activeConvCategory === 'temperature') {
            convRateInfo.innerText = "Scale Conversion";
        } else if (activeConvCategory === 'money') {
            convRateInfo.innerText = `Exchange Factor: × ${formatConvertedResult(oneToResult, activeConvCategory)}`;
        } else {
            convRateInfo.innerText = `Ratio: × ${formatConvertedResult(oneToResult, activeConvCategory)}`;
        }
    }
}

// Preset button handler
window.applyConvPreset = function (val) {
    if (convFromInput) {
        convFromInput.value = formatWithCommas(val.toString());
        performConversion('from');
    }
};

// Event Listeners for Converter
convCatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        initConverterCategory(cat);
    });
});

convFromInput?.addEventListener('input', () => {
    formatInputValue(convFromInput);
    performConversion('from');
});
convToInput?.addEventListener('input', () => {
    formatInputValue(convToInput);
    performConversion('to');
});
convFromUnit?.addEventListener('change', () => performConversion('from'));
convToUnit?.addEventListener('change', () => performConversion('from'));

btnConvSwap?.addEventListener('click', () => {
    const currentFrom = convFromUnit?.value;
    const currentTo = convToUnit?.value;
    if (convFromUnit) convFromUnit.value = currentTo;
    if (convToUnit) convToUnit.value = currentFrom;
    performConversion('from');
});

// Initialize Converter
initConverterCategory("length");
fetchRealTimeExchangeRates();

