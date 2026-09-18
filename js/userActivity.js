import { addDoc, collection, doc, getDocs, getFirestore, limit, query, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { auth, db, firebaseConfig } from '../firebase.js';

let rulesCheck;
let loginPromise;

function analyticsRulesReady() {
    if (!rulesCheck) rulesCheck = (async () => {
        // Old public fallback rules expose analytics. Wait for the private rules.
        const name = 'AnalyticsRulesProbe';
        const probeApp = getApps().find(app => app.name === name) || initializeApp(firebaseConfig, name);
        try {
            await getDocs(query(collection(getFirestore(probeApp, 'mrsyamdb'), 'user_activity_events'), limit(1)));
            return false;
        } catch (error) {
            return error.code === 'permission-denied';
        }
    })();
    return rulesCheck;
}

function studentIdentity() {
    try {
        const student = JSON.parse(sessionStorage.getItem('studentLoggedInSession') || 'null');
        if (student?.code) return { role: 'student', id: String(student.code).toUpperCase() };
    } catch {}
    return null;
}

async function recordLogin(person) {
    if (!person?.id || !await analyticsRulesReady()) return false;
    const userKey = `${person.role}:${person.id}`;
    await addDoc(collection(db, 'user_activity_events'), {
        userKey, role: person.role, type: 'login', at: serverTimestamp()
    });
    await setDoc(doc(db, 'user_activity', `${person.role}_${person.id}`), {
        userKey, role: person.role, lastLogin: serverTimestamp()
    }, { merge: true });
    return true;
}

async function recordPendingLogin(person) {
    if (sessionStorage.getItem('analyticsPendingLogin') !== person.role) return;
    if (loginPromise) return loginPromise;
    loginPromise = (async () => {
        try {
            if (await recordLogin(person)) sessionStorage.removeItem('analyticsPendingLogin');
        } catch (error) {
            console.warn('Could not record login analytics:', error);
        } finally {
            loginPromise = undefined;
        }
    })();
    return loginPromise;
}

export function trackCurrentPage() {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (page === 'index.html' || page === 'maintenance.html') return;
    const student = studentIdentity();
    if (student) {
        recordPendingLogin(student);
        return;
    }
    onAuthStateChanged(auth, user => {
        if (user) recordPendingLogin({ role: 'staff', id: user.uid });
    });
}
