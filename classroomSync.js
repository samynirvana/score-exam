/**
 * Google Classroom Score Synchronization Module
 * Connects to Google Classroom API, retrieves courses, coursework, and graded submissions,
 * matches students via their registered email in Firestore, and upserts scores into `exam_scores`.
 */

import { db } from "./firebase.js";
import { 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Storage key for OAuth Client ID
const STORAGE_CLIENT_ID_KEY = "gclass_oauth_client_id";

let cachedClientId = localStorage.getItem(STORAGE_CLIENT_ID_KEY) || "";

let accessToken = null;
let tokenClient = null;
let isGsiLoaded = false;

/**
 * Load Google Identity Services SDK script dynamically
 */
export function loadGsiScript() {
    return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
            isGsiLoaded = true;
            return resolve();
        }
        const existing = document.getElementById("gsi-client-script");
        if (existing) {
            existing.addEventListener("load", () => {
                isGsiLoaded = true;
                resolve();
            });
            existing.addEventListener("error", reject);
            return;
        }
        const script = document.createElement("script");
        script.id = "gsi-client-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => {
            isGsiLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error("Failed to load Google Identity Services SDK"));
        document.head.appendChild(script);
    });
}

/**
 * Fetch Google OAuth Client ID from Firestore database
 */
export async function fetchGoogleClientIdFromFirestore() {
    try {
        const configSnap = await getDoc(doc(db, "config", "google_classroom"));
        if (configSnap.exists() && configSnap.data().clientId) {
            cachedClientId = configSnap.data().clientId.trim();
            localStorage.setItem(STORAGE_CLIENT_ID_KEY, cachedClientId);
            return cachedClientId;
        }
    } catch (err) {
        console.warn("Could not fetch Google Classroom Client ID from Firestore:", err.message);
    }
    return cachedClientId || localStorage.getItem(STORAGE_CLIENT_ID_KEY) || "";
}

/**
 * Get configured Google OAuth Client ID
 */
export function getGoogleClientId() {
    return cachedClientId || localStorage.getItem(STORAGE_CLIENT_ID_KEY) || "";
}

/**
 * Set Google OAuth Client ID in both localStorage and Firestore database
 */
export async function setGoogleClientId(clientId) {
    const trimmed = (clientId || "").trim();
    cachedClientId = trimmed;

    if (trimmed) {
        localStorage.setItem(STORAGE_CLIENT_ID_KEY, trimmed);
    } else {
        localStorage.removeItem(STORAGE_CLIENT_ID_KEY);
    }

    try {
        await setDoc(doc(db, "config", "google_classroom"), {
            clientId: trimmed,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (err) {
        console.warn("Could not persist Google Classroom Client ID to Firestore:", err.message);
    }
}

/**
 * Authenticate with Google Classroom OAuth 2.0 Token Client
 */
export async function authenticateGoogleClassroom() {
    await loadGsiScript();

    let clientId = getGoogleClientId();
    if (!clientId) {
        clientId = await fetchGoogleClientIdFromFirestore();
    }
    if (!clientId) {
        throw new Error("CLIENT_ID_REQUIRED");
    }

    return new Promise((resolve, reject) => {
        try {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: [
                    "https://www.googleapis.com/auth/classroom.courses.readonly",
                    "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
                    "https://www.googleapis.com/auth/classroom.rosters.readonly",
                    "https://www.googleapis.com/auth/classroom.profile.emails"
                ].join(" "),
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        resolve(accessToken);
                    } else {
                        reject(new Error(tokenResponse?.error_description || tokenResponse?.error || "Authentication cancelled"));
                    }
                },
                error_callback: (err) => {
                    reject(new Error(err?.message || "Google OAuth initialization error"));
                }
            });

            // Request Access Token via GIS popup
            tokenClient.requestAccessToken({ prompt: "consent" });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Helper to call Google Classroom REST API with auth token
 */
async function callClassroomApi(endpoint) {
    if (!accessToken) {
        throw new Error("No active Google Classroom session. Please sign in.");
    }
    const url = endpoint.startsWith("https://") ? endpoint : `https://classroom.googleapis.com/v1/${endpoint}`;
    const res = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json"
        }
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.error?.message || `Classroom API Error (${res.status} ${res.statusText})`;
        if (res.status === 401) {
            accessToken = null; // Reset expired token
            throw new Error("Session expired. Please reconnect Google Classroom.");
        }
        throw new Error(msg);
    }
    return await res.json();
}

/**
 * Fetch all active courses where user is a teacher
 */
export async function fetchCourses() {
    const data = await callClassroomApi("courses?teacherId=me&courseStates=ACTIVE");
    return (data.courses || []).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/**
 * Fetch all published classwork assignments for a course
 */
export async function fetchCourseWork(courseId) {
    const data = await callClassroomApi(`courses/${courseId}/courseWork?courseWorkStates=PUBLISHED`);
    return (data.courseWork || []).sort((a, b) => {
        return new Date(b.creationTime || 0) - new Date(a.creationTime || 0);
    });
}

/**
 * Fetch all students in a course with their email addresses
 */
export async function fetchCourseStudents(courseId) {
    const data = await callClassroomApi(`courses/${courseId}/students`);
    const students = data.students || [];
    const studentMap = {};

    students.forEach(st => {
        const userId = st.userId;
        const profile = st.profile || {};
        const email = (profile.emailAddress || "").trim().toLowerCase();
        const name = profile.name?.fullName || profile.name?.givenName || "Student";
        studentMap[userId] = {
            userId,
            name,
            email
        };
    });

    return studentMap;
}

/**
 * Fetch all student submissions (grades) for a specific coursework
 */
export async function fetchCourseWorkSubmissions(courseId, courseWorkId) {
    const data = await callClassroomApi(`courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions`);
    return data.studentSubmissions || [];
}

/**
 * Auto-detect Subject and Grade from Course Name (e.g. "English G9A 2026-2027" -> Subject: "English", Class: "Grade 9A")
 */
export function detectSubjectAndClass(courseName = "", section = "") {
    const combined = `${courseName} ${section}`.toLowerCase();
    
    // Detect Class
    let detectedClass = "";
    if (combined.includes("9a") || combined.includes("grade 9a") || combined.includes("g9a")) {
        detectedClass = "Grade 9A";
    } else if (combined.includes("9b") || combined.includes("grade 9b") || combined.includes("g9b")) {
        detectedClass = "Grade 9B";
    } else if (combined.includes("9c") || combined.includes("grade 9c") || combined.includes("g9c")) {
        detectedClass = "Grade 9C";
    } else if (combined.includes("7a") || combined.includes("g7a")) {
        detectedClass = "Grade 7A";
    } else if (combined.includes("7b") || combined.includes("g7b")) {
        detectedClass = "Grade 7B";
    } else if (combined.includes("8a") || combined.includes("g8a")) {
        detectedClass = "Grade 8A";
    } else if (combined.includes("8b") || combined.includes("g8b")) {
        detectedClass = "Grade 8B";
    } else if (combined.includes("10a") || combined.includes("g10a")) {
        detectedClass = "Grade 10A";
    } else if (combined.includes("10b") || combined.includes("g10b")) {
        detectedClass = "Grade 10B";
    } else if (combined.includes("11a") || combined.includes("g11a")) {
        detectedClass = "Grade 11A";
    } else if (combined.includes("12") || combined.includes("g12")) {
        detectedClass = "Grade 12";
    }

    // Detect Subject
    let detectedSubject = "";
    if (combined.includes("english")) {
        detectedSubject = "English";
    } else if (combined.includes("ict") || combined.includes("computer") || combined.includes("informatics")) {
        detectedSubject = "ICT";
    } else if (combined.includes("math")) {
        detectedSubject = "Math";
    } else if (combined.includes("science")) {
        detectedSubject = "Science";
    } else if (combined.includes("art")) {
        detectedSubject = "Art";
    } else if (combined.includes("music")) {
        detectedSubject = "Music";
    } else if (combined.includes("bahasa") || combined.includes("indonesia")) {
        detectedSubject = "Bahasa Indonesia";
    }

    return { detectedSubject, detectedClass };
}

/**
 * Preview sync data: Matches Google Classroom students by email to Firestore students
 * and compares grades with current `exam_scores`
 */
export async function buildSyncPreview({ courseId, selectedCourseWorks, targetSubject, targetClass }) {
    // 1. Fetch Google Classroom Students & Submissions
    const classroomStudents = await fetchCourseStudents(courseId);
    
    // 2. Fetch Firestore Students
    const studentsSnap = await getDocs(collection(db, "students"));
    const firestoreStudentsByEmail = new Map();
    const allFirestoreStudents = [];

    studentsSnap.forEach(docSnap => {
        const data = docSnap.data();
        const studentObj = {
            id: docSnap.id,
            studentCode: docSnap.id,
            studentName: data.studentName || docSnap.id,
            studentClass: data.studentClass || "Grade 9A",
            studentEmail: (data.studentEmail || "").trim().toLowerCase()
        };
        allFirestoreStudents.push(studentObj);
        if (studentObj.studentEmail) {
            firestoreStudentsByEmail.set(studentObj.studentEmail, studentObj);
        }
    });

    // 3. Fetch existing exam scores to identify new vs updated scores
    const existingScoresSnap = await getDocs(collection(db, "exam_scores"));
    const existingScoresMap = new Map();
    existingScoresSnap.forEach(docSnap => {
        const d = docSnap.data();
        const key = `${(d.studentCode || '').toUpperCase()}_${(d.examName || '').trim().toLowerCase()}_${(d.subject || '').trim().toLowerCase()}`;
        existingScoresMap.set(key, { docId: docSnap.id, ...d });
    });

    // 4. Build preview items
    const previewList = [];

    for (const cw of selectedCourseWorks) {
        const submissions = await fetchCourseWorkSubmissions(courseId, cw.id);
        const maxPoints = cw.maxPoints !== undefined ? cw.maxPoints : 100;
        const examName = (cw.title || "Classwork").trim();

        for (const sub of submissions) {
            const gStudent = classroomStudents[sub.userId] || {
                name: "Unknown Student",
                email: ""
            };

            const gEmail = gStudent.email;
            const matchedDbStudent = gEmail ? firestoreStudentsByEmail.get(gEmail) : null;

            // Check grade status in Google Classroom
            const hasAssignedGrade = sub.assignedGrade !== undefined && sub.assignedGrade !== null;
            const hasDraftGrade = sub.draftGrade !== undefined && sub.draftGrade !== null;
            const classroomGrade = hasAssignedGrade ? sub.assignedGrade : (hasDraftGrade ? sub.draftGrade : null);

            let syncStatus = "READY_NEW";
            let statusText = "Ready to Add";
            let existingScoreVal = null;
            let existingDocId = null;

            if (!matchedDbStudent) {
                syncStatus = "UNMATCHED_EMAIL";
                statusText = "Email Not Matched";
            } else if (classroomGrade === null) {
                syncStatus = "NO_GRADE";
                statusText = "No Grade in Classroom";
            } else {
                const lookupKey = `${matchedDbStudent.id.toUpperCase()}_${examName.toLowerCase()}_${targetSubject.trim().toLowerCase()}`;
                const existing = existingScoresMap.get(lookupKey);

                if (existing) {
                    existingDocId = existing.docId;
                    existingScoreVal = existing.score;
                    if (Number(existing.score) === Number(classroomGrade)) {
                        syncStatus = "IDENTICAL";
                        statusText = "Already Up to Date";
                    } else {
                        syncStatus = "READY_UPDATE";
                        statusText = `Update (${existingScoreVal} → ${classroomGrade})`;
                    }
                } else {
                    syncStatus = "READY_NEW";
                    statusText = `New Score (${classroomGrade})`;
                }
            }

            previewList.push({
                selected: syncStatus === "READY_NEW" || syncStatus === "READY_UPDATE",
                syncStatus,
                statusText,
                courseWorkId: cw.id,
                courseWorkTitle: examName,
                courseWorkMaxPoints: maxPoints,
                submissionId: sub.id,
                userId: sub.userId,
                classroomStudentName: gStudent.name,
                classroomEmail: gEmail,
                classroomGrade: classroomGrade,
                matchedStudent: matchedDbStudent,
                studentCode: matchedDbStudent?.id || "",
                studentName: matchedDbStudent?.studentName || gStudent.name,
                targetClass: matchedDbStudent?.studentClass || targetClass,
                targetSubject: targetSubject,
                existingDocId: existingDocId,
                existingScoreVal: existingScoreVal
            });
        }
    }

    return {
        previewList,
        allFirestoreStudents
    };
}

function resolveScoreTypeFromTitle(title = "") {
    const lower = title.toLowerCase();
    if (lower.includes("review")) return "Review";
    if (lower.includes("homework") || lower.includes("hw")) return "Homework";
    if (lower.includes("final") || lower.includes("exam") || lower.includes("midterm")) return "Final Exam";
    if (lower.includes("practical") || lower.includes("skill") || lower.includes("project")) return "Practical Test";
    if (lower.includes("quiz") || lower.includes("test")) return "Quiz";
    return "Exercise"; // Default for classroom assignments
}

/**
 * Commit selected items from preview to Firestore
 */
export async function commitSyncToFirestore(itemsToSync) {
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];
    const registeredAssignments = new Set();

    for (const item of itemsToSync) {
        if (!item.selected || item.classroomGrade === null || !item.studentCode) {
            continue;
        }

        try {
            const detectedType = resolveScoreTypeFromTitle(item.courseWorkTitle);

            const scorePayload = {
                studentCode: item.studentCode.trim().toUpperCase(),
                studentName: item.studentName || item.classroomStudentName,
                studentClass: item.targetClass || "Grade 9A",
                examName: item.courseWorkTitle,
                quizName: item.courseWorkTitle,
                subject: item.targetSubject,
                type: detectedType,
                score: Number(item.classroomGrade),
                maxScore: Number(item.courseWorkMaxPoints || 100),
                source: "google_classroom",
                gclassCourseWorkId: item.courseWorkId || "",
                gclassSubmissionId: item.submissionId || "",
                syncedAt: new Date().toISOString()
            };

            if (item.existingDocId) {
                await updateDoc(doc(db, "exam_scores", item.existingDocId), scorePayload);
                updatedCount++;
            } else {
                await addDoc(collection(db, "exam_scores"), scorePayload);
                insertedCount++;
            }

            // Also register in system_quizzes catalog so it shows in all dropdowns & views
            const assignKey = `${item.courseWorkTitle}_${item.targetSubject}_${item.targetClass}`;
            if (!registeredAssignments.has(assignKey)) {
                registeredAssignments.add(assignKey);
                const customQuizId = `gclass_${item.courseWorkId || item.courseWorkTitle}`.replace(/[^a-zA-Z0-9_-]/g, "_");
                await setDoc(doc(db, "system_quizzes", customQuizId), {
                    name: item.courseWorkTitle,
                    type: detectedType,
                    subject: item.targetSubject,
                    targetClass: item.targetClass || "Grade 9A",
                    targetClassesList: [item.targetClass || "Grade 9A"],
                    source: "google_classroom",
                    gclassCourseWorkId: item.courseWorkId || "",
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        } catch (err) {
            console.error(`Error saving score for ${item.studentName}:`, err);
            errors.push(`${item.studentName} (${item.courseWorkTitle}): ${err.message}`);
        }
    }

    return {
        insertedCount,
        updatedCount,
        totalSynced: insertedCount + updatedCount,
        errors
    };
}

