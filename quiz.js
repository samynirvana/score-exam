import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3oiOHwHUfMhTPjEp8Ku8-qlbRKlGX0Gg",
    authDomain: "students-score-395b2.firebaseapp.com",
    projectId: "students-score-395b2",
    storageBucket: "students-score-395b2.firebasestorage.app",
    messagingSenderId: "189447167056",
    appId: "1:189447167056:web:4526e218132977bc3f4555",
    measurementId: "G-97WSSH0BNE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentStudent = null;
let activeQuiz = null;

document.getElementById('verifyBtn').addEventListener('click', async () => {
    const code = document.getElementById('studentCodeInput').value.toUpperCase().trim();
    if (!code) return alert("Enter your code.");

    const snap = await getDoc(doc(db, "students", code));
    if (!snap.exists()) return alert("Invalid Student Code.");

    currentStudent = { code, ...snap.data() };
    document.getElementById('authSection').classList.add('hidden');
    loadAvailableQuizzes();
});

async function loadAvailableQuizzes() {
    const snap = await getDocs(collection(db, "quizzes"));
    const container = document.getElementById('quizList');
    container.innerHTML = "";

    snap.forEach(docSnap => {
        const q = docSnap.data();
        if (q.targetClass.toLowerCase() === 'all' || q.targetClass.toLowerCase() === currentStudent.studentClass.toLowerCase()) {
            const btn = document.createElement('button');
            btn.className = "quiz-card";
            btn.style.width = "100%";
            btn.innerHTML = `<strong>${q.title}</strong><br><small>Subject: ${q.subject}</small>`;
            btn.onclick = () => startQuiz({ id: docSnap.id, ...q });
            container.appendChild(btn);
        }
    });
    document.getElementById('quizListSection').classList.remove('hidden');
}

function startQuiz(quiz) {
    activeQuiz = quiz;
    document.getElementById('quizListSection').classList.add('hidden');
    document.getElementById('activeQuizTitle').innerText = quiz.title;
    
    const form = document.getElementById('quizForm');
    form.innerHTML = "";

    const items = quiz.items || quiz.questions; // Fallback for older quiz formats

    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = "quiz-card";

        // 1. Header / Section Instructions
        if (item.type === 'header') {
            div.style.background = "#e9ecef";
            div.innerHTML = `<h3 style="margin:0; color:#495057;">${item.text}</h3>`;
        } 
        // 2. Reading Article / Text Passage
        else if (item.type === 'passage') {
            div.style.borderLeft = "4px solid #17a2b8";
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:6px; margin:10px 0;">` : '';
            div.innerHTML = `<h4>${item.title || 'Reading Passage'}</h4><p style="white-space: pre-line; background:#f8f9fa; padding:10px; border-radius:6px;">${item.text}</p>${imgHtml}`;
        } 
        // 3. Multiple Choice Question
        else if (item.type === 'mcq' || (!item.type && item.question)) {
            const prompt = item.prompt || item.question;
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:6px; margin:10px 0;">` : '';
            div.innerHTML = `<p><strong>Item ${idx + 1}: ${prompt}</strong></p>${imgHtml}` + 
                item.options.map((opt, oIdx) => `
                    <label class="option-label">
                        <input type="radio" name="item_${idx}" value="${oIdx}"> ${opt}
                    </label>
                `).join('');
        } 
        // 4. Fill in the Blank
        else if (item.type === 'fill') {
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:6px; margin:10px 0;">` : '';
            div.innerHTML = `<p><strong>Item ${idx + 1}: ${item.prompt}</strong></p>${imgHtml}
                <input type="text" name="item_${idx}" class="fill-input" placeholder="Type your answer here..." style="width:100%; padding:8px;">`;
        } 
        // 5. Essay Question
        else if (item.type === 'essay') {
            let imgHtml = item.imageUrl ? `<img src="${item.imageUrl}" style="max-width:100%; border-radius:6px; margin:10px 0;">` : '';
            div.innerHTML = `<p><strong>Item ${idx + 1}: ${item.prompt}</strong></p>${imgHtml}
                <textarea name="item_${idx}" rows="4" style="width:100%; padding:8px;" placeholder="Write your response..."></textarea>`;
        } 
        // 6. Matching Question
        else if (item.type === 'matching') {
            let optionsHtml = item.rights.map(r => `<option value="${r}">${r}</option>`).join('');
            div.innerHTML = `<p><strong>Item ${idx + 1}: ${item.prompt}</strong></p>` +
                item.lefts.map((left, lIdx) => `
                    <div style="display:flex; align-items:center; justify-content:space-between; margin:8px 0;">
                        <span>${left}</span>
                        <select name="item_${idx}_${lIdx}">
                            <option value="">-- Choose Match --</option>
                            ${optionsHtml}
                        </select>
                    </div>
                `).join('');
        }

        form.appendChild(div);
    });

    document.getElementById('takeQuizSection').classList.remove('hidden');
}

document.getElementById('submitQuizBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const form = document.getElementById('quizForm');
    
    // Fallback to activeQuiz.items or activeQuiz.questions safely
    const items = activeQuiz.items || activeQuiz.questions || [];
    
    let score = 0;
    let autoGradableCount = 0;
    const studentResponses = [];

    items.forEach((item, idx) => {
        // Skip display-only blocks from scoring
        if (item.type === 'header' || item.type === 'passage') return;

        // 1. Multiple Choice Question
        if (item.type === 'mcq' || (!item.type && item.question)) {
            autoGradableCount++;
            const selected = form.querySelector(`input[name="item_${idx}"]:checked`);
            const val = selected ? parseInt(selected.value) : null;
            if (val === item.correct) score++;
            studentResponses.push({ prompt: item.prompt || item.question, response: val !== null ? item.options[val] : "No answer" });
        } 
        // 2. Fill in the Blank
        else if (item.type === 'fill') {
            autoGradableCount++;
            const input = form.querySelector(`input[name="item_${idx}"]`);
            const val = input ? input.value.trim().toLowerCase() : "";
            if (item.answers && item.answers.includes(val)) score++;
            studentResponses.push({ prompt: item.prompt, response: val || "No answer" });
        } 
        // 3. Essay Question (Saved for teacher review)
        else if (item.type === 'essay') {
            const textarea = form.querySelector(`textarea[name="item_${idx}"]`);
            studentResponses.push({ prompt: item.prompt, response: textarea ? textarea.value.trim() : "" });
        } 
        // 4. Matching Question
        else if (item.type === 'matching') {
            autoGradableCount++;
            let correctMatches = 0;
            item.lefts.forEach((left, lIdx) => {
                const select = form.querySelector(`select[name="item_${idx}_${lIdx}"]`);
                if (select && select.value === item.rights[lIdx]) {
                    correctMatches++;
                }
            });
            if (correctMatches === item.lefts.length) score++;
            studentResponses.push({ prompt: item.prompt, response: `${correctMatches}/${item.lefts.length} pairs matched` });
        }
    });

    try {
        // Save complete submission to Firestore
        await addDoc(collection(db, "quiz_results"), {
            studentCode: currentStudent.code,
            studentName: currentStudent.studentName,
            quizTitle: activeQuiz.title,
            subject: activeQuiz.subject,
            score: score,
            totalAutoGradable: autoGradableCount,
            responses: studentResponses,
            submittedAt: new Date().toISOString()
        });

        document.getElementById('takeQuizSection').classList.add('hidden');
        document.getElementById('scoreSummary').innerText = `You scored ${score} out of ${autoGradableCount} auto-graded points!`;
        document.getElementById('resultSection').classList.remove('hidden');
    } catch (err) {
        alert("Error submitting answers: " + err.message);
    }
});