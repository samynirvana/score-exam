import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB3TY9M4oUG7xxCgxR6bSJB0K9ivcP5RQI",
    authDomain: "syamserverlist.firebaseapp.com",
    projectId: "syamserverlist",
    storageBucket: "syamserverlist.firebasestorage.app",
    messagingSenderId: "468852816088",
    appId: "1:468852816088:web:b72bcb0c4fee837d983fad",
    measurementId: "G-2YHY6V3JH1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "mrsyamdb");

let currentStudent = null;
let activeQuiz = null;
let availableQuizzesMap = {};

// --- THEME TOGGLE SYSTEM ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const savedTheme = localStorage.getItem('appTheme') || 'light';

if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.innerText = 'Light Mode';
}

themeToggleBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
    themeToggleBtn.innerText = isDark ? 'Light Mode' : 'Dark Mode';
});

document.getElementById('studentLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    window.location.href = 'index.html';
});

// Auto-fill and verify if logged in via Student Portal Session
window.addEventListener('DOMContentLoaded', async () => {
    const savedLoggedIn = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
    if (savedLoggedIn) {
        try {
            const session = JSON.parse(savedLoggedIn);
            const code = session.code;
            if (code) {
                const codeInput = document.getElementById('studentCodeInput');
                if (codeInput) codeInput.value = code;
                await verifyStudentCodeByCode(code);
            }
        } catch (e) { console.error("Session auto-verify error:", e); }
    }
});

// --- STEP 1: VERIFY CODE & OPEN POPUP ---
document.getElementById('verifyBtn')?.addEventListener('click', verifyStudentCode);
document.getElementById('studentCodeInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyStudentCode();
});

async function verifyStudentCode() {
    const codeInput = document.getElementById('studentCodeInput');
    const code = codeInput ? codeInput.value.toUpperCase().trim() : '';
    await verifyStudentCodeByCode(code);
}

async function verifyStudentCodeByCode(code) {
    const authError = document.getElementById('authErrorMessage');
    if (authError) authError.classList.add('hidden');

    if (!code) {
        if (authError) {
            authError.innerText = "Please enter your 5-character student code.";
            authError.classList.remove('hidden');
        }
        return;
    }

    try {
        const snap = await getDoc(doc(db, "students", code));
        if (!snap.exists()) {
            if (authError) {
                authError.innerText = `Invalid Student Code "${code}". Please try again.`;
                authError.classList.remove('hidden');
            }
            return;
        }

        currentStudent = { code, ...snap.data() };
        
        // Show Name & Class in Modal Header
        document.getElementById('modalStudentName').innerText = currentStudent.studentName || 'Student Profile';
        document.getElementById('modalStudentClass').innerText = currentStudent.studentClass || 'Unassigned';

        // Load quizzes for student class and open pop-up
        await loadAvailableQuizzesDropdown();
        document.getElementById('studentQuizModal').classList.remove('hidden');

    } catch (err) {
        console.error("Authentication error:", err);
        if (authError) {
            authError.innerText = "Connection error. Please try again.";
            authError.classList.remove('hidden');
        }
    }
}

// Close Modal Handler
document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('studentQuizModal').classList.add('hidden');
});

// --- STEP 2: LOAD MATCHING QUIZZES INTO DROPDOWN ---
async function loadAvailableQuizzesDropdown() {
    const dropdown = document.getElementById('quizSelectDropdown');
    dropdown.innerHTML = '<option value="">-- Choose a Quiz --</option>';
    availableQuizzesMap = {};

    try {
        const snap = await getDocs(collection(db, "quizzes"));
        let count = 0;

        snap.forEach(docSnap => {
            const q = docSnap.data();
            const targetClass = (q.targetClass || '').toLowerCase().trim();
            const studentClass = (currentStudent.studentClass || '').toLowerCase().trim();

            if (targetClass === 'all' || targetClass === 'all classes' || targetClass === studentClass) {
                const quizObj = { id: docSnap.id, ...q };
                availableQuizzesMap[docSnap.id] = quizObj;

                const option = document.createElement('option');
                option.value = docSnap.id;
                option.innerText = `${q.title} (${q.subject || 'General'})`;
                dropdown.appendChild(option);
                count++;
            }
        });

        if (count === 0) {
            dropdown.innerHTML = '<option value="">No quizzes available for your class.</option>';
        }
    } catch (err) {
        console.error("Error loading quizzes:", err);
        dropdown.innerHTML = '<option value="">Failed to load quizzes.</option>';
    }
}

// --- STEP 3: START QUIZ ---
document.getElementById('startSelectedQuizBtn').addEventListener('click', () => {
    const selectedId = document.getElementById('quizSelectDropdown').value;
    if (!selectedId || !availableQuizzesMap[selectedId]) {
        alert("Please select a valid quiz from the drop-down menu.");
        return;
    }

    activeQuiz = availableQuizzesMap[selectedId];
    document.getElementById('studentQuizModal').classList.add('hidden');
    document.getElementById('authSection').classList.add('hidden');
    
    renderQuizForm(activeQuiz);
});

function renderQuizForm(quiz) {
    document.getElementById('activeQuizTitle').innerText = quiz.title;
    document.getElementById('activeQuizSubject').innerText = `Subject: ${quiz.subject || 'General'}`;

    const form = document.getElementById('quizForm');
    form.innerHTML = "";

    const items = quiz.items || quiz.questions || [];

    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = "question-card";

        // 1. Header / Section Instructions
        if (item.type === 'header') {
            div.style.background = "var(--bg-body)";
            div.style.borderLeft = "4px solid var(--primary-blue)";
            div.innerHTML = `
                <h3 style="margin: 0 0 4px 0; color: var(--text-dark);">${item.text}</h3>
                ${item.description ? `<p style="margin:0; font-size:13px; color:var(--text-gray);">${item.description}</p>` : ''}
            `;
        } 
        // 2. Reading Passage
        else if (item.type === 'passage') {
            div.style.borderLeft = "4px solid #10b981";
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:8px; margin:12px 0;">` : '';
            div.innerHTML = `
                <h4 style="margin-top:0; color:var(--text-dark);">${item.title || 'Reading Passage'}</h4>
                <div style="white-space: pre-line; background: var(--bg-body); padding: 14px; border-radius: 8px; font-size: 14px; line-height: 1.6;">${item.text || item.prompt}</div>
                ${imgHtml}
            `;
        } 
        // 3. Multiple Choice Question
        else if (item.type === 'mcq' || (!item.type && item.question)) {
            const prompt = item.prompt || item.question;
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:8px; margin:12px 0;">` : '';
            
            div.innerHTML = `
                <p style="margin-top:0; font-size:15px;"><strong>Question ${idx + 1}: ${prompt}</strong></p>
                ${imgHtml}
                ${(item.options || []).map((opt, oIdx) => `
                    <label class="quiz-option-label">
                        <input type="radio" name="item_${idx}" value="${oIdx}">
                        <span>${opt}</span>
                    </label>
                `).join('')}
            `;
        } 
        // 4. Fill in the Blank
        else if (item.type === 'fill') {
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:8px; margin:12px 0;">` : '';
            div.innerHTML = `
                <p style="margin-top:0; font-size:15px;"><strong>Question ${idx + 1}: ${item.prompt}</strong></p>
                ${imgHtml}
                <input type="text" name="item_${idx}" placeholder="Type your answer here..." style="width:100%; margin-top:8px;">
            `;
        } 
        // 5. Essay Question
        else if (item.type === 'essay') {
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:8px; margin:12px 0;">` : '';
            div.innerHTML = `
                <p style="margin-top:0; font-size:15px;"><strong>Question ${idx + 1}: ${item.prompt}</strong></p>
                ${imgHtml}
                <textarea name="item_${idx}" rows="4" placeholder="Write your full response here..." style="width:100%; margin-top:8px;"></textarea>
            `;
        } 
        // 6. Matching Question
        else if (item.type === 'matching') {
            let optionsHtml = (item.rights || []).map(r => `<option value="${r}">${r}</option>`).join('');
            div.innerHTML = `
                <p style="margin-top:0; font-size:15px;"><strong>Question ${idx + 1}: ${item.prompt}</strong></p>
                ${(item.lefts || []).map((left, lIdx) => `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin:10px 0;">
                        <span style="font-size:14px;">${left}</span>
                        <select name="item_${idx}_${lIdx}" style="width:auto; margin:0; padding:8px 12px;">
                            <option value="">-- Choose Match --</option>
                            ${optionsHtml}
                        </select>
                    </div>
                `).join('')}
            `;
        }

        form.appendChild(div);
    });

    document.getElementById('takeQuizSection').classList.remove('hidden');
}

// --- STEP 4: SUBMIT QUIZ & SAVE TO FIRESTORE ---
document.getElementById('submitQuizBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const form = document.getElementById('quizForm');
    const items = activeQuiz.items || activeQuiz.questions || [];
    
    let score = 0;
    let autoGradableCount = 0;
    const studentResponses = [];

    items.forEach((item, idx) => {
        if (item.type === 'header' || item.type === 'passage') return;

        // Multiple Choice
        if (item.type === 'mcq' || (!item.type && item.question)) {
            autoGradableCount++;
            const selected = form.querySelector(`input[name="item_${idx}"]:checked`);
            const val = selected ? parseInt(selected.value) : null;
            if (val === item.correct) score++;
            studentResponses.push({ 
                prompt: item.prompt || item.question, 
                response: val !== null && item.options ? item.options[val] : "No answer" 
            });
        } 
        // Fill in Blank
        else if (item.type === 'fill') {
            autoGradableCount++;
            const input = form.querySelector(`input[name="item_${idx}"]`);
            const val = input ? input.value.trim().toLowerCase() : "";
            if (item.answers && item.answers.map(a => a.toLowerCase()).includes(val)) score++;
            studentResponses.push({ prompt: item.prompt, response: val || "No answer" });
        } 
        // Essay
        else if (item.type === 'essay') {
            const textarea = form.querySelector(`textarea[name="item_${idx}"]`);
            studentResponses.push({ prompt: item.prompt, response: textarea ? textarea.value.trim() : "No answer" });
        } 
        // Matching
        else if (item.type === 'matching') {
            autoGradableCount++;
            let correctMatches = 0;
            (item.lefts || []).forEach((left, lIdx) => {
                const select = form.querySelector(`select[name="item_${idx}_${lIdx}"]`);
                if (select && item.rights && select.value === item.rights[lIdx]) {
                    correctMatches++;
                }
            });
            if (item.lefts && correctMatches === item.lefts.length) score++;
            studentResponses.push({ 
                prompt: item.prompt, 
                response: `${correctMatches}/${(item.lefts || []).length} pairs matched` 
            });
        }
    });

    try {
        const submitBtn = document.getElementById('submitQuizBtn');
        submitBtn.innerText = "Submitting...";
        submitBtn.disabled = true;

        // Save complete submission payload to Firestore quiz_results
        await addDoc(collection(db, "quiz_results"), {
            studentCode: currentStudent.code,
            studentName: currentStudent.studentName,
            quizTitle: activeQuiz.title,
            subject: activeQuiz.subject || "General",
            score: score,
            totalAutoGradable: autoGradableCount,
            responses: studentResponses,
            submittedAt: new Date().toISOString()
        });

        document.getElementById('takeQuizSection').classList.add('hidden');
        document.getElementById('scoreSummary').innerText = `You scored ${score} out of ${autoGradableCount} auto-graded points!`;
        document.getElementById('resultSection').classList.remove('hidden');

    } catch (err) {
        alert("Error submitting quiz: " + err.message);
        const submitBtn = document.getElementById('submitQuizBtn');
        submitBtn.innerText = "Submit Assessment";
        submitBtn.disabled = false;
    }
});