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

async function searchScore() {
    const codeInput = document.getElementById('studentCode').value.toUpperCase().trim();
    const resultCard = document.getElementById('resultCard');
    const errorMessage = document.getElementById('errorMessage');

    resultCard.classList.add('hidden');
    errorMessage.classList.add('hidden');

    if (!codeInput) return;

    try {
        const q = query(collection(db, "exam_scores"), where("studentCode", "==", codeInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Find container, clear previous rows out cleanly
            let scoreContainer = document.getElementById('scoreContainer');
            if(!scoreContainer) {
                // If container doesn't exist yet, insert a clean template placeholder block element
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
            resultCard.classList.remove('hidden');
        } else {
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Data error: ", error);
        alert("An error occurred during lookups processing.");
    }
}

document.getElementById('searchBtn').addEventListener('click', searchScore);