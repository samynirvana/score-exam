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
 * Strips all HTML tags and returns clean plain text.
 * Useful for attribute titles, tooltips, and logs.
 * @param {string} html 
 * @returns {string}
 */
export function stripHtml(html) {
    if (html === null || html === undefined) return '';
    try {
        const doc = new DOMParser().parseFromString(String(html), 'text/html');
        return (doc.body.textContent || doc.body.innerText || '').trim();
    } catch (e) {
        return String(html).replace(/<[^>]*>/g, '').trim();
    }
}

/**
 * Sanitizes rich text HTML, allowing safe formatting tags
 * (bold, italic, underline, font-size, font-family, colors, lists, etc.)
 * while removing dangerous scripts and event handlers.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeRichHtml(html) {
    if (!html) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html), 'text/html');
        const allowedTags = new Set([
            'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'FONT', 
            'P', 'DIV', 'BR', 'SUB', 'SUP', 'MARK', 'UL', 'OL', 'LI', 
            'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE',
            'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'IMG'
        ]);

        function cleanNode(node) {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tagName = child.tagName.toUpperCase();
                    if (!allowedTags.has(tagName)) {
                        if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'LINK'].includes(tagName)) {
                            child.remove();
                            continue;
                        } else {
                            while (child.firstChild) {
                                node.insertBefore(child.firstChild, child);
                            }
                            child.remove();
                            continue;
                        }
                    }

                    // Clean attributes
                    const attrs = Array.from(child.attributes);
                    for (const attr of attrs) {
                        const name = attr.name.toLowerCase();
                        const val = attr.value;
                        if (name.startsWith('on')) {
                            child.removeAttribute(attr.name);
                            continue;
                        }
                        if ((name === 'href' || name === 'src') && val.toLowerCase().replace(/\s+/g, '').startsWith('javascript:')) {
                            child.removeAttribute(attr.name);
                            continue;
                        }
                        const safeAttrs = ['style', 'class', 'face', 'color', 'size', 'href', 'target', 'src', 'alt', 'title', 'width', 'height'];
                        if (!safeAttrs.includes(name)) {
                            child.removeAttribute(attr.name);
                        }
                    }

                    // Guard against CSS expression attacks
                    if (child.hasAttribute('style')) {
                        const styleVal = child.getAttribute('style');
                        if (/behavior|expression|-moz-binding/i.test(styleVal)) {
                            child.removeAttribute('style');
                        }
                    }

                    cleanNode(child);
                }
            }
        }

        cleanNode(doc.body);
        return doc.body.innerHTML;
    } catch (e) {
        console.warn("HTML sanitization fallback:", e);
        return String(html);
    }
}

/**
 * Renders rich text or plain text into safe HTML for display.
 * If the input contains formatting HTML tags, it is safely sanitized.
 * If the input is plain text, special characters are escaped and newlines are converted to <br>.
 * @param {string} content 
 * @returns {string}
 */
export function renderRichHtml(content) {
    if (content === null || content === undefined) return '';
    const str = String(content).trim();
    if (!str) return '';

    // Check if the content already contains HTML formatting tags
    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(str);
    if (!hasHtmlTags) {
        return escapeHtml(str).replace(/\r?\n/g, '<br>');
    }

    return sanitizeRichHtml(str);
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
 * Formats a Date object or ISO string into YYYY-MM-DD (or friendly date string)
 * @param {Date|string|number} date 
 * @returns {string}
 */
export function formatDate(date) {
    if (!date) return '';
    try {
        const d = (date instanceof Date) ? date : new Date(date);
        if (isNaN(d.getTime())) return String(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return String(date);
    }
}

/**
 * Triggers a vibrant, lightweight particle celebration burst at a specified (x, y) origin or screen center.
 * @param {number} [x] - Origin X coordinate
 * @param {number} [y] - Origin Y coordinate
 * @param {number} [count=24] - Number of sparkle particles
 */
export function triggerCelebration(x, y, count = 24) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }
    const originX = x ?? (window.innerWidth / 2);
    const originY = y ?? (window.innerHeight / 2);
    const colors = ['#2563eb', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#38bdf8'];

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'celebration-sparkle';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.floor(Math.random() * 8) + 6;
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
        const distance = Math.floor(Math.random() * 90) + 50;
        const dx = `${Math.cos(angle) * distance}px`;
        const dy = `${Math.sin(angle) * distance}px`;

        particle.style.left = `${originX}px`;
        particle.style.top = `${originY}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.backgroundColor = color;
        particle.style.setProperty('--dx', dx);
        particle.style.setProperty('--dy', dy);

        document.body.appendChild(particle);

        particle.addEventListener('animationend', () => {
            particle.remove();
        });
    }
}

/**
 * Attaches a dynamic ripple effect to interactive buttons
 * @param {HTMLElement|string} target - Button element or selector
 */
export function attachRippleEffect(target) {
    const elements = typeof target === 'string' ? document.querySelectorAll(target) : [target];
    elements.forEach(el => {
        if (!el || el.dataset.hasRippleAttached) return;
        el.dataset.hasRippleAttached = 'true';
        el.classList.add('has-ripple');

        el.addEventListener('pointerdown', (e) => {
            const rect = el.getBoundingClientRect();
            const circle = document.createElement('span');
            const diameter = Math.max(rect.width, rect.height);
            const radius = diameter / 2;

            circle.style.width = circle.style.height = `${diameter}px`;
            circle.style.left = `${e.clientX - rect.left - radius}px`;
            circle.style.top = `${e.clientY - rect.top - radius}px`;
            circle.classList.add('ripple-effect');

            const existingRipple = el.querySelector('.ripple-effect');
            if (existingRipple) {
                existingRipple.remove();
            }

            el.appendChild(circle);

            circle.addEventListener('animationend', () => {
                circle.remove();
            });
        });
    });
}

/**
 * Initializes IntersectionObserver to stagger reveal elements with .animate-fade-up
 */
export function initStaggeredReveals() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-up');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.stagger-reveal').forEach(el => observer.observe(el));
}

// Make available globally on window for non-module script contexts
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
    window.stripHtml = stripHtml;
    window.sanitizeRichHtml = sanitizeRichHtml;
    window.renderRichHtml = renderRichHtml;
    window.triggerCelebration = triggerCelebration;
    window.attachRippleEffect = attachRippleEffect;
    window.initStaggeredReveals = initStaggeredReveals;
}

