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
let currentMode = 'scores';

// Tab Switching Logic
document.getElementById('scoreTab').addEventListener('click', (e) => {
    currentMode = 'scores';
    e.target.style.background = '#007bff';
    e.target.style.color = 'white';
    document.getElementById('pointTab').style.background = '#ddd';
    document.getElementById('pointTab').style.color = '#333';
});

document.getElementById('pointTab').addEventListener('click', (e) => {
    currentMode = 'points';
    e.target.style.background = '#007bff';
    e.target.style.color = 'white';
    document.getElementById('scoreTab').style.background = '#ddd';
    document.getElementById('scoreTab').style.color = '#333';
});

async function searchData() {
    const codeInput = document.getElementById('studentCode').value.toUpperCase().trim();
    const resultCard = document.getElementById('resultCard');
    const errorMessage = document.getElementById('errorMessage');

    resultCard.classList.add('hidden');
    errorMessage.classList.add('hidden');

    if (!codeInput) return;

    try {
        if (currentMode === 'scores') {
            // Existing Exam Scores Query
            const q = query(collection(db, "exam_scores"), where("studentCode", "==", codeInput));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                renderScoreResults(querySnapshot);
            } else {
                errorMessage.classList.remove('hidden');
            }
        } else {
            // New Behavior Points Query
            const q = query(collection(db, "student_points"), where("studentCode", "==", codeInput));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                renderPointResults(querySnapshot);
            } else {
                errorMessage.innerText = "No point records found for this student.";
                errorMessage.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error("Data error: ", error);
        alert("An error occurred during lookup processing.");
    }
}

function renderScoreResults(querySnapshot) {
    let scoreContainer = document.getElementById('scoreContainer');
    if(!scoreContainer) {
        const infoBox = document.querySelector('.result-info');
        infoBox.innerHTML = `<h3 id="studentName"></h3><p id="studentClassInfo" style="color:#666; font-weight:bold; margin-top:-10px;"></p><div id="scoreContainer"></div>`;
        scoreContainer = document.getElementById('scoreContainer');
    }
    
    scoreContainer.innerHTML = "";
    let dataSample = null;

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        dataSample = data;
        scoreContainer.innerHTML += `
            <div style="padding:10px 0; border-bottom:1px solid #eee; text-align:left;">
                <strong>${data.examName}</strong> (${data.subject || 'N/A'}): 
                <span style="float:right; font-weight:bold; color:#28a745;">${data.score}</span>
            </div>`;
    });

    document.getElementById('studentName').innerText = dataSample.studentName;
    document.getElementById('studentClassInfo').innerText = `Classroom Assignment: ${dataSample.studentClass || 'N/A'}`;
    document.getElementById('resultCard').classList.remove('hidden');
}

function renderPointResults(querySnapshot) {
    let scoreContainer = document.getElementById('scoreContainer');
    if(!scoreContainer) {
        const infoBox = document.querySelector('.result-info');
        infoBox.innerHTML = `<h3 id="studentName"></h3><p id="studentClassInfo" style="color:#666; font-weight:bold; margin-top:-10px;"></p><h2 id="totalPointsDisplay" style="color:#6f42c1;"></h2><div id="scoreContainer"></div>`;
        scoreContainer = document.getElementById('scoreContainer');
    }
    
    scoreContainer.innerHTML = "<h4 style='margin-bottom: 5px;'>Point History:</h4>";
    let dataSample = null;
    let totalPoints = 0;

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        dataSample = data;
        totalPoints += data.points;
        const color = data.points > 0 ? '#28a745' : '#dc3545';
        const sign = data.points > 0 ? '+' : '';
        
        scoreContainer.innerHTML += `
            <div style="padding:10px 0; border-bottom:1px solid #eee; text-align:left;">
                <strong>${data.reason}</strong>: 
                <span style="float:right; font-weight:bold; color:${color};">${sign}${data.points}</span>
            </div>`;
    });

    document.getElementById('studentName').innerText = dataSample.studentName;
    document.getElementById('studentClassInfo').innerText = `Classroom Assignment: ${dataSample.studentClass || 'N/A'}`;
    
    // Create or update the total points header
    let totalHeader = document.getElementById('totalPointsDisplay');
    if(!totalHeader) {
        totalHeader = document.createElement('h2');
        totalHeader.id = 'totalPointsDisplay';
        totalHeader.style.color = '#6f42c1';
        scoreContainer.parentNode.insertBefore(totalHeader, scoreContainer);
    }
    totalHeader.innerText = `Total Points: ${totalPoints}`;
    
    document.getElementById('resultCard').classList.remove('hidden');
}

document.getElementById('searchBtn').addEventListener('click', searchData);

// --- NEWS TICKER LOGIC ---
async function loadNewsTicker() {
    try {
        const querySnapshot = await getDocs(collection(db, "news_updates"));
        const newsTicker = document.getElementById('newsTicker');
        const newsListContainer = document.getElementById('newsListContainer');
        
        // If there is no news, keep the ticker hidden and stop running
        if (querySnapshot.empty) {
            newsTicker.style.display = 'none';
            return;
        }

        let newsItems = [];
        querySnapshot.forEach((doc) => {
            newsItems.push(doc.data());
        });

        // Sort by newest first
        newsItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Inject the HTML
        newsListContainer.innerHTML = "";
        newsItems.forEach(news => {
            const dateStr = new Date(news.timestamp).toLocaleDateString();
            newsListContainer.innerHTML += `
                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #ccc;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${dateStr}</div>
                    <strong style="color: #333; font-size: 15px;">${news.title}</strong>
                    <div style="margin-top: 4px; font-size: 14px; color: #555; white-space: pre-wrap;">${news.content}</div>
                </div>
            `;
        });

        // Unhide the news block now that it has data
        newsTicker.style.display = 'block'; 
        
    } catch (error) {
        console.error("Error pulling news ticker data:", error);
    }
}

// Execute the function immediately when the script loads
loadNewsTicker();