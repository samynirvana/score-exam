import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
        const docRef = doc(db, "exam_scores", codeInput);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const studentData = docSnap.data();
            
            document.getElementById('studentName').innerText = studentData.studentName;
            document.getElementById('examName').innerText = studentData.examName;
            document.getElementById('examScore').innerText = studentData.score;
            
            resultCard.classList.remove('hidden');
        } else {
            errorMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error fetching data: ", error);
        alert("An error occurred. Please try again later.");
    }
}

// Attach event listener to search button
document.getElementById('searchBtn').addEventListener('click', searchScore);