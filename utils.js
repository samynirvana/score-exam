// utils.js - Shared Security & Formatting Utilities

/**
 * Sanitizes an untrusted string to prevent Cross-Site Scripting (XSS) attacks.
 * Replaces HTML special characters with their safe HTML entity representations.
 * @param {string} str - Raw untrusted input string
 * @returns {string} - Escaped safe string
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Converts an ISO timestamp string into a clean relative time string (e.g. 5m, 2h, 3d)
 * @param {string|Date} timestamp 
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const postDate = new Date(timestamp);
    const now = new Date();
    const secondsPast = Math.floor((now - postDate) / 1000);

    if (secondsPast < 0) return 'just now';
    if (secondsPast < 60) return `${Math.max(1, secondsPast)}s`;
    
    const minutesPast = Math.floor(secondsPast / 60);
    if (minutesPast < 60) return `${minutesPast}m`;
    
    const hoursPast = Math.floor(minutesPast / 60);
    if (hoursPast < 24) return `${hoursPast}h`;
    
    const daysPast = Math.floor(hoursPast / 24);
    if (daysPast < 7) return `${daysPast}d`;
    
    const weeksPast = Math.floor(daysPast / 7);
    if (weeksPast < 4) return `${weeksPast}w`;
    
    return postDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Formats a Date object into YYYY-MM-DD
 * @param {Date} date 
 * @returns {string}
 */
export function formatDate(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
