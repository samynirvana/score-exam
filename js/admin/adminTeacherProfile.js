// Teacher & Admin Profile Management Modal (Photo, Email, Password, Name)
// Modular component extracted from admin.js

import { updateProfile, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// State accessors & hooks
let currentTeacherProfileData = null;
let pendingTeacherPhotoFile = null;
let teacherPhotoRemoved = false;
let getUserRole = () => window.currentUserRole || 'teacher';
let getTeacherSubject = () => window.currentTeacherSubject || 'Unassigned';

export function setupProfileContext(options = {}) {
    if (options.profileData) currentTeacherProfileData = options.profileData;
    if (typeof options.getUserRole === 'function') getUserRole = options.getUserRole;
    if (typeof options.getTeacherSubject === 'function') getTeacherSubject = options.getTeacherSubject;
}

export function setCurrentTeacherProfileData(data) {
    currentTeacherProfileData = data;
}

// Helper image resize utility
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

// ==========================================================================
// TEACHER / ADMIN PROFILE MANAGEMENT & MODAL (PHOTO, EMAIL, PASSWORD, NAME)
// ==========================================================================

const EYE_OPEN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const EYE_OFF_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

function showTeacherModalAlert(msg, type = 'info') {
    const alertEl = document.getElementById('teacherProfileAlert');
    if (!alertEl) return;
    alertEl.classList.remove('hidden');
    alertEl.style.display = 'flex';
    alertEl.style.alignItems = 'center';
    alertEl.style.gap = '8px';

    if (type === 'error') {
        alertEl.style.background = '#fef2f2';
        alertEl.style.border = '1px solid #fecaca';
        alertEl.style.color = '#b91c1c';
        alertEl.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div><strong>Error:</strong> ${escapeHtml(msg)}</div>
        `;
    } else if (type === 'success') {
        alertEl.style.background = '#f0fdf4';
        alertEl.style.border = '1px solid #bbf7d0';
        alertEl.style.color = '#15803d';
        alertEl.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div><strong>Success:</strong> ${escapeHtml(msg)}</div>
        `;
    } else {
        alertEl.style.background = '#eff6ff';
        alertEl.style.border = '1px solid #bfdbfe';
        alertEl.style.color = '#1d4ed8';
        alertEl.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div>${escapeHtml(msg)}</div>
        `;
    }
}

function hideTeacherModalAlert() {
    const alertEl = document.getElementById('teacherProfileAlert');
    if (alertEl) {
        alertEl.classList.add('hidden');
        alertEl.style.display = 'none';
        alertEl.innerHTML = '';
    }
}

window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = EYE_OFF_SVG;
        btn.title = 'Hide password';
    } else {
        input.type = 'password';
        btn.innerHTML = EYE_OPEN_SVG;
        btn.title = 'Show password';
    }
};

window.openTeacherProfileModal = async function() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        alert("Please log in to edit your profile.");
        return;
    }

    // Close mobile dropdown if open
    document.getElementById('mobileTopbarDropdown')?.classList.add('hidden');

    hideTeacherModalAlert();
    pendingTeacherPhotoFile = null;
    teacherPhotoRemoved = false;

    const photoInput = document.getElementById('teacherPhotoFileInput');
    if (photoInput) photoInput.value = '';

    // Fetch fresh user record from Firestore
    let freshUserData = currentTeacherProfileData || {};
    try {
        const uSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (uSnap.exists()) {
            freshUserData = uSnap.data();
            currentTeacherProfileData = { ...freshUserData, uid: currentUser.uid };
        }
    } catch (e) {
        console.warn("Could not fetch fresh user data for profile modal:", e);
    }

    const currentEmail = currentUser.email || freshUserData.email || "";
    const rawFallbackName = currentEmail.split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
    const currentName = freshUserData.name || currentUser.displayName || rawFallbackName || "Teacher";
    const currentPhotoUrl = freshUserData.photoUrl || currentUser.photoURL || null;
    const currentRole = freshUserData.role || getUserRole() || "teacher";
    const currentSub = freshUserData.subject || getTeacherSubject() || "Unassigned";

    // Populate input fields
    const nameInput = document.getElementById('teacherEditName');
    const emailInput = document.getElementById('teacherEditEmail');
    const passInput = document.getElementById('teacherEditPassword');
    const passConfirmInput = document.getElementById('teacherEditPasswordConfirm');
    const hintEl = document.getElementById('teacherPhotoDriveFilenameHint');

    if (nameInput) nameInput.value = currentName;
    if (emailInput) emailInput.value = currentEmail;
    if (passInput) {
        passInput.value = '';
        passInput.type = 'password';
    }
    if (passConfirmInput) {
        passConfirmInput.value = '';
        passConfirmInput.type = 'password';
    }
    document.querySelectorAll('#teacherProfileModal .password-eye-btn').forEach(btn => {
        btn.innerHTML = EYE_OPEN_SVG;
        btn.title = 'Show password';
    });
    if (hintEl) hintEl.innerText = `${currentEmail ? currentEmail.trim().toLowerCase() : 'teacher@mks.sch.id'}.jpg`;

    // Role & Subject badges
    const roleBadge = document.getElementById('teacherModalRoleBadge');
    const subBadge = document.getElementById('teacherModalSubjectBadge');
    if (roleBadge) roleBadge.innerText = currentRole === 'admin' ? 'Super Admin' : 'Teacher';
    if (subBadge) subBadge.innerText = currentSub || 'General';

    // Modal Avatar Preview
    const avatarPreview = document.getElementById('teacherModalAvatarPreview');
    const removeBtn = document.getElementById('teacherPhotoRemoveBtn');
    const initial = currentName.charAt(0).toUpperCase();

    if (avatarPreview) {
        if (currentPhotoUrl) {
            avatarPreview.innerHTML = `<img src="${currentPhotoUrl}" alt="${escapeHtml(currentName)}" onerror="this.onerror=null; this.parentElement.innerText='${initial}';">`;
            if (removeBtn) removeBtn.style.display = 'inline';
        } else {
            avatarPreview.innerHTML = '';
            avatarPreview.innerText = initial;
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    // Display modal
    const modal = document.getElementById('teacherProfileModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeTeacherProfileModal = function() {
    const modal = document.getElementById('teacherProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    pendingTeacherPhotoFile = null;
    teacherPhotoRemoved = false;
    hideTeacherModalAlert();
};

window.removeTeacherPhotoPreview = function() {
    pendingTeacherPhotoFile = null;
    teacherPhotoRemoved = true;

    const photoInput = document.getElementById('teacherPhotoFileInput');
    if (photoInput) photoInput.value = '';

    const nameInput = document.getElementById('teacherEditName');
    const initial = (nameInput?.value.trim() || 'U').charAt(0).toUpperCase();

    const avatarPreview = document.getElementById('teacherModalAvatarPreview');
    if (avatarPreview) {
        avatarPreview.innerHTML = '';
        avatarPreview.innerText = initial;
    }

    const removeBtn = document.getElementById('teacherPhotoRemoveBtn');
    if (removeBtn) removeBtn.style.display = 'none';
};

// Handle file input change and dynamic filename hint
function initTeacherProfileModalEvents() {
    const photoInput = document.getElementById('teacherPhotoFileInput');
    if (photoInput) {
        photoInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showTeacherModalAlert("Please choose an image file (JPG, PNG, or WebP).", "error");
                photoInput.value = '';
                return;
            }

            if (file.size > 15 * 1024 * 1024) {
                showTeacherModalAlert("Photo is too large (maximum 15MB).", "error");
                photoInput.value = '';
                return;
            }

            pendingTeacherPhotoFile = file;
            teacherPhotoRemoved = false;
            hideTeacherModalAlert();

            try {
                const previewDataUrl = await resizeImageToDataUrl(file, 400, 400, 0.85);
                const avatarPreview = document.getElementById('teacherModalAvatarPreview');
                if (avatarPreview) {
                    avatarPreview.innerHTML = `<img src="${previewDataUrl}" alt="Preview">`;
                }
                const removeBtn = document.getElementById('teacherPhotoRemoveBtn');
                if (removeBtn) removeBtn.style.display = 'inline';
            } catch (err) {
                console.error("Error previewing teacher photo:", err);
            }
        });
    }

    // Dynamic filename hint update on email change
    const emailInput = document.getElementById('teacherEditEmail');
    if (emailInput) {
        emailInput.addEventListener('input', () => {
            const hintEl = document.getElementById('teacherPhotoDriveFilenameHint');
            const clean = emailInput.value.trim().toLowerCase();
            if (hintEl) hintEl.innerText = `${clean || 'teacher@mks.sch.id'}.jpg`;
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('teacherProfileModal');
            if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
                window.closeTeacherProfileModal();
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherProfileModalEvents);
} else {
    initTeacherProfileModalEvents();
}

window.saveTeacherProfile = async function() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showTeacherModalAlert("You must be logged in to save profile changes.", "error");
        return;
    }

    const saveBtn = document.getElementById('btnSaveTeacherProfile');
    const nameInput = document.getElementById('teacherEditName');
    const emailInput = document.getElementById('teacherEditEmail');
    const passInput = document.getElementById('teacherEditPassword');
    const passConfirmInput = document.getElementById('teacherEditPasswordConfirm');

    const newName = nameInput ? nameInput.value.trim() : '';
    const newEmail = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const newPassword = passInput ? passInput.value : '';
    const confirmPassword = passConfirmInput ? passConfirmInput.value : '';

    if (!newName) {
        showTeacherModalAlert("Please enter your name.", "error");
        nameInput?.focus();
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail || !emailRegex.test(newEmail)) {
        showTeacherModalAlert("Please enter a valid email address.", "error");
        emailInput?.focus();
        return;
    }

    if (newPassword) {
        if (newPassword.length < 6) {
            showTeacherModalAlert("New password must be at least 6 characters long.", "error");
            passInput?.focus();
            return;
        }
        if (newPassword !== confirmPassword) {
            showTeacherModalAlert("Passwords do not match. Please re-enter.", "error");
            passConfirmInput?.focus();
            return;
        }
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <svg style="animation: spin 1s linear infinite; width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10"></path>
            </svg>
            <span>Saving Changes...</span>
        `;
    }
    hideTeacherModalAlert();

    try {
        let finalPhotoUrl = currentTeacherProfileData?.photoUrl || currentUser.photoURL || null;

        // 1. Process & Upload Photo to Google Drive in same folder as students (picdb), identified by teacher email
        if (pendingTeacherPhotoFile) {
            if (saveBtn) saveBtn.innerHTML = `<span>Uploading photo to picdb...</span>`;

            // Resize & optimize photo
            const optimizedDataUrl = await resizeImageToDataUrl(pendingTeacherPhotoFile, 500, 500, 0.85);

            // Fetch Google Drive settings from localStorage or Firestore system_settings/google_drive
            let driveScriptUrl = localStorage.getItem('profileDriveScriptUrl') || localStorage.getItem('googleDriveScriptUrl') || '';
            let profileFolderId = localStorage.getItem('profileDriveFolderId') || '';

            if (!driveScriptUrl) {
                try {
                    let snap = await getDoc(doc(db, "system_settings", "google_drive"));
                    if (!snap.exists()) snap = await getDoc(doc(db, "system_settings", "googleDrive"));
                    if (snap.exists()) {
                        const sData = snap.data();
                        driveScriptUrl = sData.profileScriptUrl || sData.scriptUrlProfile || sData.scriptUrl || '';
                        profileFolderId = sData.profileFolderId || sData.folderIdProfile || profileFolderId;
                        if (driveScriptUrl) {
                            localStorage.setItem('profileDriveScriptUrl', driveScriptUrl);
                            localStorage.setItem('googleDriveScriptUrl', driveScriptUrl);
                        }
                        if (profileFolderId) {
                            localStorage.setItem('profileDriveFolderId', profileFolderId);
                        }
                    }
                } catch (dErr) {
                    console.warn("Could not fetch Google Drive settings from Firestore:", dErr);
                }
            }

            // Filename identifying teacher by email in the exact same folder as student photos (picdb)
            const targetFileName = `${newEmail}.jpg`;

            if (driveScriptUrl) {
                try {
                    const base64Data = optimizedDataUrl.split(',')[1];
                    const response = await fetch(driveScriptUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            fileName: targetFileName,
                            studentCode: newEmail,
                            mimeType: 'image/jpeg',
                            base64Data: base64Data,
                            folderName: "picdb",
                            folderId: profileFolderId || '',
                            replaceExisting: true
                        })
                    });

                    const resText = await response.text();
                    let resJson = null;
                    try {
                        resJson = JSON.parse(resText);
                    } catch (_) {}

                    if (resJson && resJson.status === 'success') {
                        finalPhotoUrl = resJson.photoUrl || resJson.url || resJson.directUrl || (resJson.fileId ? `https://lh3.googleusercontent.com/d/${resJson.fileId}` : optimizedDataUrl);
                    } else {
                        console.warn("Apps Script upload did not return success, using optimized data URL:", resJson);
                        finalPhotoUrl = optimizedDataUrl;
                    }
                } catch (upErr) {
                    console.warn("Error uploading photo to Drive Apps Script, fallback to data URL:", upErr);
                    finalPhotoUrl = optimizedDataUrl;
                }
            } else {
                console.info("No Google Drive script configured, storing optimized photo directly.");
                finalPhotoUrl = optimizedDataUrl;
            }
        } else if (teacherPhotoRemoved) {
            finalPhotoUrl = null;
        }

        // 2. Update Firebase Auth Password (if provided)
        if (newPassword) {
            if (saveBtn) saveBtn.innerHTML = `<span>Updating password...</span>`;
            await updatePassword(currentUser, newPassword);
        }

        // 3. Update Firebase Auth Email (if changed)
        const currentAuthEmail = (currentUser.email || '').toLowerCase();
        if (newEmail !== currentAuthEmail) {
            if (saveBtn) saveBtn.innerHTML = `<span>Updating email...</span>`;
            await updateEmail(currentUser, newEmail);
        }

        // 4. Update Firebase Auth Profile (displayName & photoURL)
        if (saveBtn) saveBtn.innerHTML = `<span>Updating account profile...</span>`;
        await updateProfile(currentUser, {
            displayName: newName,
            photoURL: finalPhotoUrl || ''
        });

        // 5. Update Firestore users/{uid} document
        const userDocRef = doc(db, "users", currentUser.uid);
        const updatePayload = {
            name: newName,
            email: newEmail,
            photoUrl: finalPhotoUrl,
            updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, updatePayload, { merge: true });

        // 6. Update local in-memory profile state
        currentTeacherProfileData = {
            ...currentTeacherProfileData,
            ...updatePayload,
            uid: currentUser.uid
        };

        // 7. Update UI Topbar and Mobile elements dynamically
        const sidebarNameEl = document.getElementById('sidebarUserName');
        const mobileSidebarNameEl = document.getElementById('mobileSidebarUserName');
        if (sidebarNameEl) sidebarNameEl.innerText = newName;
        if (mobileSidebarNameEl) mobileSidebarNameEl.innerText = newName;

        const renderAvatarEl = (el) => {
            if (!el) return;
            const initial = newName.charAt(0).toUpperCase();
            if (finalPhotoUrl) {
                el.innerHTML = `<img src="${finalPhotoUrl}" alt="${escapeHtml(newName)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" onerror="this.onerror=null; this.parentElement.innerText='${initial}';">`;
            } else {
                el.innerHTML = '';
                el.innerText = initial;
            }
        };

        renderAvatarEl(document.getElementById('userAvatarCircle'));
        renderAvatarEl(document.getElementById('mobileUserAvatarCircle'));

        // Update welcome greeting banner
        const firstName = newName.split(' ')[0];
        const welcomeTitleEl = document.getElementById('welcomeTitle') || document.querySelector('.greeting-title');
        if (welcomeTitleEl) {
            const hour = new Date().getHours();
            let greeting = "Good morning";
            if (hour >= 12 && hour < 18) greeting = "Good afternoon";
            else if (hour >= 18 || hour < 6) greeting = "Good evening";
            welcomeTitleEl.innerText = `${greeting}, ${firstName} 👋`;
        }

        showTeacherModalAlert("Profile updated successfully!", "success");

        // Close modal after brief success display
        setTimeout(() => {
            window.closeTeacherProfileModal();
        }, 1200);

    } catch (err) {
        console.error("Error saving teacher profile:", err);

        if (err.code === 'auth/requires-recent-login') {
            showTeacherModalAlert("For security reasons, changing your email or password requires a recent login. Please log out, sign in again, and retry.", "error");
        } else if (err.code === 'auth/email-already-in-use') {
            showTeacherModalAlert("This email address is already in use by another account.", "error");
        } else if (err.code === 'auth/invalid-email') {
            showTeacherModalAlert("The email address is invalid.", "error");
        } else if (err.code === 'auth/weak-password') {
            showTeacherModalAlert("Password is too weak. Please use at least 6 characters.", "error");
        } else {
            showTeacherModalAlert(err.message || "Failed to save profile changes. Please try again.", "error");
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span>Save Changes</span>`;
        }
    }
};

// Module Exports
export {
    initTeacherProfileModalEvents
};
