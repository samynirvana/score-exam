// ==========================================================================
// BOARD-FIRESTORE.JS - Whiteboard Cloud Persistence, Permissions & Sharing
// ==========================================================================

import {
    collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
    query, where, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../../firebase.js";

/**
 * Checks if a user has ownership or admin privileges over a board data record
 * @param {Object} data - Board document data
 * @param {Object} user - Current user object
 * @returns {boolean}
 */
export function checkIsBoardOwner(data, user) {
    if (!user || !data) return false;
    const isStaff = user.type === 'staff';
    const isAdmin = isStaff && user.role === 'admin';
    if (isAdmin) return true; // Admins have full management access to all boards

    if (isStaff) {
        if (data.authorUid && user.uid && data.authorUid === user.uid) return true;
        if (data.authorEmail && user.email && data.authorEmail.toLowerCase().trim() === user.email.toLowerCase().trim()) return true;
        if (data.authorCode && user.code && data.authorCode === user.code) return true;
        if (!data.authorUid && data.authorName && user.name && data.authorName.trim().toLowerCase() === user.name.trim().toLowerCase()) return true;
        return false;
    } else {
        if (data.authorCode && user.code && data.authorCode === user.code) return true;
        if (data.authorUid && user.uid && data.authorUid === user.uid) return true;
        return false;
    }
}

/**
 * Loads boards from Firestore categorized by personal, teacher-shared, and student-shared
 * @param {Object} currentUser
 * @returns {Promise<{myBoards: Array, teacherBoards: Array, studentSharedBoards: Array}>}
 */
export async function fetchBoardsFromFirestore(currentUser) {
    if (!currentUser) return { myBoards: [], teacherBoards: [], studentSharedBoards: [] };

    let myBoardsList = [];
    let teacherBoardsList = [];
    let studentSharedBoardsList = [];

    // 1. Fetch My Personal Boards
    if (currentUser.type === 'staff') {
        const uidSnap = await getDocs(query(collection(db, "boards"), where("authorUid", "==", currentUser.uid)));
        const map = new Map();
        uidSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        if (currentUser.email) {
            try {
                const emailSnap = await getDocs(query(collection(db, "boards"), where("authorEmail", "==", currentUser.email)));
                emailSnap.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            } catch (_) { }
        }
        myBoardsList = Array.from(map.values());
    } else {
        const myQuery = query(collection(db, "boards"), where("authorCode", "==", currentUser.code));
        const mySnap = await getDocs(myQuery);
        myBoardsList = [];
        mySnap.forEach(docSnap => myBoardsList.push({ id: docSnap.id, ...docSnap.data() }));
    }

    // 2. Fetch Teacher Shared Boards
    const teacherQuery = query(collection(db, "boards"), where("isShared", "==", true));
    const teacherSnap = await getDocs(teacherQuery);
    teacherBoardsList = [];
    teacherSnap.forEach(docSnap => {
        const data = docSnap.data();
        const targets = Array.isArray(data.targetClasses) && data.targetClasses.length > 0
            ? data.targetClasses
            : (data.targetClass ? data.targetClass.split(',').map(s => s.trim()) : ['All']);
        const studentClass = (currentUser.studentClass || '').trim();
        const isMatch = currentUser.type === 'staff' || targets.includes('All') || targets.some(t => t.toLowerCase() === studentClass.toLowerCase());
        if (isMatch) {
            teacherBoardsList.push({ id: docSnap.id, ...data });
        }
    });

    // 3. If teacher/staff, fetch boards shared by students for review
    if (currentUser.type === 'staff') {
        try {
            const studentQuery = query(collection(db, "boards"), where("isSharedWithTeacher", "==", true));
            const studentSnap = await getDocs(studentQuery);
            studentSharedBoardsList = [];
            const teacherEmail = (currentUser.email || '').toLowerCase().trim();
            const teacherUid = (currentUser.uid || '').toLowerCase().trim();
            const isAdmin = currentUser.role === 'admin';

            studentSnap.forEach(docSnap => {
                const data = docSnap.data();
                const sharedList = Array.isArray(data.sharedWithTeachers)
                    ? data.sharedWithTeachers.map(x => String(x).toLowerCase().trim())
                    : [];
                const isForMe = isAdmin || (
                    (teacherEmail && sharedList.includes(teacherEmail)) ||
                    (teacherUid && sharedList.includes(teacherUid))
                );
                if (isForMe) {
                    studentSharedBoardsList.push({ id: docSnap.id, ...data });
                }
            });

            studentSharedBoardsList.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
        } catch (err) {
            console.warn("Student shared boards fetch error:", err);
        }
    }

    myBoardsList.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    teacherBoardsList.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    return {
        myBoards: myBoardsList,
        teacherBoards: teacherBoardsList,
        studentSharedBoards: studentSharedBoardsList
    };
}

/**
 * Saves current board modifications to Firestore
 */
export async function saveBoardDirectlyToFirestore({
    boardId,
    currentUser,
    currentBoard,
    elements,
    settings
}) {
    if (!boardId || !currentUser || currentBoard?.isReadOnly) return false;

    await updateDoc(doc(db, "boards", boardId), {
        title: (currentBoard && currentBoard.title) || 'Untitled Board',
        elements: elements,
        settings: settings,
        updatedAt: new Date().toISOString()
    });

    return true;
}

/**
 * Creates a brand new board in Firestore
 */
export async function createBoardInFirestore({
    title,
    currentUser,
    elements,
    settings
}) {
    if (!currentUser) throw new Error("User not authenticated");
    const isStaff = currentUser.type === 'staff';

    const newBoardData = {
        title: title || 'Untitled Board',
        authorUid: currentUser.uid || '',
        authorCode: currentUser.code || '',
        authorEmail: currentUser.email || '',
        authorName: currentUser.name || (isStaff ? 'Teacher' : 'Student'),
        authorRole: currentUser.role || (isStaff ? 'teacher' : 'student'),
        studentClass: currentUser.studentClass || 'Unassigned',
        targetClass: 'All',
        isShared: false,
        elements: elements || [],
        settings: settings || { gridStyle: 'dots', normalGridSize: 24, isometricGridSize: 20, isometricGridAngle1: 30, isometricGridAngle2: -30, isMagnetSnapping: true, zoom: 1, panX: 0, panY: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "boards"), newBoardData);
    return { id: docRef.id, ...newBoardData };
}

/**
 * Duplicates an existing board in Firestore
 */
export async function duplicateBoardInFirestore(boardId, currentUser) {
    const snap = await getDoc(doc(db, "boards", boardId));
    if (!snap.exists()) throw new Error("Board not found");

    const data = snap.data();
    const isStaff = currentUser?.type === 'staff';
    const copyData = {
        ...data,
        title: `${data.title || 'Untitled Board'} (Copy)`,
        authorUid: currentUser.uid || '',
        authorCode: currentUser.code || '',
        authorEmail: currentUser.email || '',
        authorName: currentUser.name || (isStaff ? 'Teacher' : 'Student'),
        authorRole: currentUser.role || (isStaff ? 'teacher' : 'student'),
        isShared: false,
        isSharedWithTeacher: false,
        sharedWithTeachers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, "boards"), copyData);
    return { id: docRef.id, ...copyData };
}

/**
 * Duplicates a teacher lesson board to student's personal boards
 */
export async function copyTeacherBoardToStudentInFirestore(boardId, currentUser) {
    const snap = await getDoc(doc(db, "boards", boardId));
    if (!snap.exists()) throw new Error("Board not found");

    const data = snap.data();
    const myCopy = {
        ...data,
        title: `My Copy - ${data.title || 'Teacher Board'}`,
        authorUid: currentUser.uid || '',
        authorCode: currentUser.code || '',
        authorEmail: currentUser.email || '',
        authorName: currentUser.name || 'Student',
        authorRole: 'student',
        studentClass: currentUser.studentClass || 'Unassigned',
        isShared: false,
        isSharedWithTeacher: false,
        sharedWithTeachers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const newDoc = await addDoc(collection(db, "boards"), myCopy);
    return { id: newDoc.id, ...myCopy };
}

/**
 * Deletes a board from Firestore with permission verification
 */
export async function deleteBoardFromFirestore(boardId, currentUser) {
    const snap = await getDoc(doc(db, "boards", boardId));
    if (!snap.exists()) throw new Error("Board not found");

    const data = snap.data();
    const isAdmin = currentUser?.type === 'staff' && currentUser?.role === 'admin';
    const isOwner = checkIsBoardOwner(data, currentUser);

    if (!isAdmin && !isOwner) {
        throw new Error("You can only delete boards that you own.");
    }

    await deleteDoc(doc(db, "boards", boardId));
    return true;
}
