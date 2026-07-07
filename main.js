import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD3oiOHwHUfMhTPjEp8Ku8-qlbRKlGX0Gg",
    authDomain: "students-score-395b2.firebaseapp.com",
    projectId: "students-score-395b2",
    storageBucket: "students-score-395b2.firebasestorage.app",
    messagingSenderId: "189447167056",
    appId: "1:189447167056:web:4526e218132977bc3f4555",
    measurementId: "G-97WSSH0BNE",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global array memory storage cache to prevent duplicate Firestore network calls on filter change
let loadedScores = [];

async function searchScore() {
    const codeInput = document.getElementById('studentCode').value.toUpperCase().trim();
    const resultCard = document.getElementById('resultCard');
    const errorMessage = document.getElementById('errorMessage');

    resultCard.classList.add('hidden');
    errorMessage.classList.add('hidden');
    loadedScores = []; 

    if (!codeInput) return;

    try {
        // Query database looking for entries matching this code value
        const q = query(collection(db, "exam_scores"), where("studentCode", "==", codeInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
                loadedScores.push(doc.data());
            });

            // Set student display text name safely from the first record found
            document.getElementById('studentNameDisplay').innerText = loadedScores[0].studentName;

            // Render dropdown menu subjects items list dynamically
            buildSubjectDropdown();

            // Populate table views
            renderScoresTable("all");

            resultCard.classList.remove('hidden');
        } else {
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error fetching data: ", error);
        alert("An error occurred. Please try again later.");
    }
}

function buildSubjectDropdown() {
    const dropdown = document.getElementById('subjectFilter');
    dropdown.innerHTML = '<option value="all">-- All Subjects --</option>';

    // Find and isolate unique names of available subjects
    const uniqueSubjects = [...new Set(loadedScores.map(item => item.subject))];

    uniqueSubjects.forEach(subject => {
        if (subject) {
            const option = document.createElement('option');
            option.value = subject;
            option.innerText = subject;
            dropdown.appendChild(option);
        }
    });
}

function renderScoresTable(selectedSubject) {
    const tbody = document.querySelector("#scoresTable tbody");
    tbody.innerHTML = "";

    // Filter array memory lists based on selected subject dropdown option
    const filteredScores = selectedSubject === "all" 
        ? loadedScores 
        : loadedScores.filter(item => item.subject === selectedSubject);

    filteredScores.forEach(item => {
        const row = `<tr>
            <td>${item.examName}</td>
            <td>${item.subject || 'N/A'}</td>
            <td><span class="score-badge">${item.score}</span></td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

// Watch dropdown changes to apply selection filters
document.getElementById('subjectFilter').addEventListener('change', (e) => {
    renderScoresTable(e.target.value);
});

document.getElementById('searchBtn').addEventListener('click', searchScore);