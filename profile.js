import { collection, query, where, getDocs, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { escapeHtml } from "./utils.js";

let currentStudentCode = "";
let currentStudentName = "";
let currentPhotoUrl = "";

// --- THEME SYNC ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const mainThemeText = document.getElementById('mainThemeText');
const savedTheme = localStorage.getItem('appTheme') || 'light';

if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.add('dark-mode');
    if (mainThemeText) mainThemeText.innerText = 'Light Mode';
}

themeToggleBtn?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('appTheme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (mainThemeText) mainThemeText.innerText = isDark ? 'Light Mode' : 'Dark Mode';
});

// --- LOGOUT HANDLER ---
const logoutBtn = document.getElementById('studentLogoutBtn');
logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem('studentLoggedInSession');
    sessionStorage.removeItem('studentTimelineSession');
    localStorage.removeItem('loggedInStudentCode');
    window.location.href = 'index.html';
});

// --- KEBAB & MODAL CONTROLS ---
window.toggleProfileCardMenu = function(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('profileCardDropdown');
    if (menu) menu.classList.toggle('hidden');
};

window.openPhotoEditModal = function() {
    const menu = document.getElementById('profileCardDropdown');
    if (menu) menu.classList.add('hidden');

    const modal = document.getElementById('photoEditModal');
    const modalName = document.getElementById('modalStudentName');
    const modalCode = document.getElementById('modalStudentCode');
    const modalAvatarImg = document.getElementById('modalAvatarImg');
    const modalAvatarFallback = document.getElementById('modalAvatarFallback');

    if (modalName) modalName.innerText = currentStudentName || 'Student';
    if (modalCode) modalCode.innerText = currentStudentCode || '-----';

    if (currentPhotoUrl) {
        if (modalAvatarImg) {
            modalAvatarImg.src = currentPhotoUrl;
            modalAvatarImg.classList.remove('hidden');
        }
        if (modalAvatarFallback) modalAvatarFallback.classList.add('hidden');
    } else {
        if (modalAvatarImg) modalAvatarImg.classList.add('hidden');
        if (modalAvatarFallback) modalAvatarFallback.classList.remove('hidden');
    }

    if (modal) modal.classList.remove('hidden');
};

window.closePhotoEditModal = function() {
    const modal = document.getElementById('photoEditModal');
    if (modal) modal.classList.add('hidden');
};

window.triggerStudentPhotoInput = function() {
    document.getElementById('studentPhotoInput')?.click();
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('profileCardDropdown');
    const btn = document.getElementById('profileCardKebabBtn');
    if (menu && !menu.classList.contains('hidden')) {
        if (!menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

// --- FORMAT DATE HELPER ---
function formatBirthDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return 'Not Set';
    
    // Handle standard YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(dateObj.getTime())) {
            const formatted = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
            
            // Check if today is birthday
            const today = new Date();
            if (today.getMonth() === dateObj.getMonth() && today.getDate() === dateObj.getDate()) {
                return `${formatted} 🎂 (Happy Birthday!)`;
            }
            return formatted;
        }
    }
    
    return dateStr;
}

// Convert Google Drive share link to high-res embed link if needed
function resolvePhotoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    const trimmed = rawUrl.trim();
    
    if (trimmed.startsWith('https://lh3.googleusercontent.com/d/') || trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    
    const driveMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    
    return trimmed;
}

// Resize image to max 400x400 data URL for optimal speed & storage
function resizeImageToDataUrl(file, maxWidth = 400, maxHeight = 400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        maxHeight = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL(file.type || 'image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Get Google Drive script URL from Firestore or LocalStorage
async function getDriveScriptUrl() {
    let url = localStorage.getItem('googleDriveScriptUrl') || '';
    if (!url) {
        try {
            const snap = await getDoc(doc(db, "system_settings", "googleDrive"));
            if (snap.exists() && snap.data().scriptUrl) {
                url = snap.data().scriptUrl;
                localStorage.setItem('googleDriveScriptUrl', url);
            }
        } catch (e) {
            console.warn("Could not fetch system_settings for Google Drive:", e);
        }
    }
    return url;
}

// Upload photo to Google Drive (replaces existing file named studentCode.jpg)
async function uploadPhotoToDrive(file, dataUrl, scriptUrl, studentCode) {
    if (scriptUrl) {
        try {
            const base64Data = dataUrl.split(',')[1];
            const fileName = `${studentCode}.jpg`;
            const response = await fetch(scriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    fileName: fileName,
                    mimeType: file.type || 'image/jpeg',
                    base64Data: base64Data
                })
            });
            const resJson = await response.json();
            if (resJson.status === 'success' && resJson.photoUrl) {
                return resJson.photoUrl;
            }
        } catch (e) {
            console.warn("Google Drive upload error, falling back to optimized direct data:", e);
        }
    }
    return dataUrl;
}

// Toast notification helper
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('uploadStatusToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast) return;

    if (toastIcon) toastIcon.innerText = isSuccess ? '✅' : '⚠️';
    if (toastMessage) toastMessage.innerText = message;

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3800);
}

// --- STUDENT PHOTO UPLOAD HANDLER ---
const studentPhotoInput = document.getElementById('studentPhotoInput');
studentPhotoInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file (.jpg, .png, .webp)', false);
        return;
    }

    const spinner = document.getElementById('avatarUploadSpinner');
    const avatarImg = document.getElementById('profileAvatarImg');
    const avatarFallback = document.getElementById('avatarFallback');
    const modalAvatarImg = document.getElementById('modalAvatarImg');
    const modalAvatarFallback = document.getElementById('modalAvatarFallback');
    const modalChangeBtn = document.getElementById('modalChangePhotoBtn');

    try {
        if (spinner) spinner.classList.remove('hidden');
        if (modalChangeBtn) {
            modalChangeBtn.disabled = true;
            modalChangeBtn.innerHTML = `<span>⏳ Uploading...</span>`;
        }

        // 1. Resize and optimize image
        const dataUrl = await resizeImageToDataUrl(file);

        // 2. Fetch configured Google Drive Script URL
        const scriptUrl = await getDriveScriptUrl();

        // 3. Upload to Google Drive (replaces file named `${currentStudentCode}.jpg`)
        const finalUrl = await uploadPhotoToDrive(file, dataUrl, scriptUrl, currentStudentCode);
        currentPhotoUrl = finalUrl;

        // 4. Update Firestore Student Record
        const studentRef = doc(db, "students", currentStudentCode);
        await updateDoc(studentRef, {
            photoUrl: finalUrl
        });

        // 5. Update local session storage
        const rawSession = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
        if (rawSession) {
            try {
                const sessionObj = JSON.parse(rawSession);
                sessionObj.photoUrl = finalUrl;
                sessionObj.photo = finalUrl;
                sessionStorage.setItem('studentLoggedInSession', JSON.stringify(sessionObj));
            } catch (err) {
                console.warn(err);
            }
        }

        // 6. Update UI
        if (avatarImg) {
            avatarImg.src = finalUrl;
            avatarImg.classList.remove('hidden');
        }
        if (avatarFallback) avatarFallback.classList.add('hidden');

        if (modalAvatarImg) {
            modalAvatarImg.src = finalUrl;
            modalAvatarImg.classList.remove('hidden');
        }
        if (modalAvatarFallback) modalAvatarFallback.classList.add('hidden');

        showToast('Profile photo updated & synced successfully!', true);

        // Close modal after brief success feedback
        setTimeout(() => {
            closePhotoEditModal();
        }, 700);

    } catch (err) {
        console.error("Error updating student photo:", err);
        showToast('Error uploading photo: ' + err.message, false);
    } finally {
        if (spinner) spinner.classList.add('hidden');
        if (modalChangeBtn) {
            modalChangeBtn.disabled = false;
            modalChangeBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <span>Change Photo</span>
            `;
        }
        studentPhotoInput.value = '';
    }
});

// --- LOAD PROFILE DATA ---
async function loadStudentProfile() {
    const rawSession = sessionStorage.getItem('studentLoggedInSession') || sessionStorage.getItem('studentTimelineSession');
    let studentCode = '';
    let cachedData = null;

    if (rawSession) {
        try {
            cachedData = JSON.parse(rawSession);
            studentCode = cachedData.code || cachedData.studentCode || cachedData.id || '';
        } catch (e) {
            console.error(e);
        }
    }

    if (!studentCode) {
        studentCode = localStorage.getItem('loggedInStudentCode') || '';
    }

    if (!studentCode) {
        window.location.href = 'index.html';
        return;
    }

    currentStudentCode = studentCode;

    try {
        // 1. Fetch Student from Firestore
        const studentRef = doc(db, "students", studentCode);
        const studentSnap = await getDoc(studentRef);

        let studentData = cachedData || {};
        if (studentSnap.exists()) {
            studentData = { ...studentSnap.data(), code: studentCode };
        }

        const name = studentData.studentName || studentData.name || 'Student';
        const sClass = studentData.studentClass || studentData.class || 'Unassigned';
        const birthDate = studentData.birthDate || studentData.dateOfBirth || '';
        const photoUrl = resolvePhotoUrl(studentData.photoUrl || studentData.photo || studentData.avatar || '');

        currentStudentName = name;
        currentPhotoUrl = photoUrl;

        // 2. Render Text Elements
        document.getElementById('profileStudentName').innerText = name;
        document.getElementById('profileClassText').innerText = sClass;
        document.getElementById('profileCodeText').innerText = studentCode;
        document.getElementById('profileBirthDate').innerText = formatBirthDate(birthDate);

        // 3. Render Avatar Photo
        const avatarImg = document.getElementById('profileAvatarImg');
        const avatarFallback = document.getElementById('avatarFallback');

        if (photoUrl) {
            avatarImg.src = photoUrl;
            avatarImg.classList.remove('hidden');
            avatarFallback.classList.add('hidden');

            avatarImg.onerror = () => {
                avatarImg.classList.add('hidden');
                avatarFallback.classList.remove('hidden');
            };
        } else {
            avatarImg.classList.add('hidden');
            avatarFallback.classList.remove('hidden');
        }

        // 4. Fetch Total Behavior Points
        try {
            const pointsQuery = query(collection(db, "student_points"), where("studentCode", "==", studentCode));
            const pointsSnap = await getDocs(pointsQuery);
            let totalPoints = 0;
            pointsSnap.forEach(pDoc => {
                const pData = pDoc.data();
                totalPoints += (parseInt(pData.points, 10) || 0);
            });
            document.getElementById('profilePoints').innerText = `${totalPoints} Pts`;
        } catch (pe) {
            console.warn("Could not load points", pe);
        }

    } catch (err) {
        console.error("Error loading student profile:", err);
        document.getElementById('profileStudentName').innerText = cachedData?.name || 'Student';
    }
}

window.addEventListener('DOMContentLoaded', loadStudentProfile);
