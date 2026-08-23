// firebase.js - Centralized Firebase Initializations
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const firebaseConfig = {
    apiKey: "AIzaSyB3TY9M4oUG7xxCgxR6bSJB0K9ivcP5RQI",
    authDomain: "syamserverlist.firebaseapp.com",
    projectId: "syamserverlist",
    storageBucket: "syamserverlist.firebasestorage.app",
    messagingSenderId: "468852816088",
    appId: "1:468852816088:web:b72bcb0c4fee837d983fad",
    measurementId: "G-2YHY6V3JH1"
};

// Initialize or reuse main Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Main portal & student database ("mrsyamdb")
export const db = getFirestore(app, "mrsyamdb");

// Default database instance (used for weekly schedule / academicCalendar)
export const defaultDb = getFirestore(app);

// Authentication service
export const auth = getAuth(app);

// Secondary Auth instance for creating teacher credentials without signing out admin
export const secondaryApp = getApps().some(a => a.name === "SecondaryAuthApp")
    ? getApp("SecondaryAuthApp")
    : initializeApp(firebaseConfig, "SecondaryAuthApp");
export const secondaryAuth = getAuth(secondaryApp);
