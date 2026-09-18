// Attendance Data Analysis, Reporting Engine & Student Attendance History Modal
// Modular component extracted from admin.js

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db } from "../../firebase.js";
import { escapeHtml } from "../../utils.js";

// ==========================================================================
// ATTENDANCE DATA ANALYSIS & REPORTING ENGINE
// ==========================================================================

let attAnalyticsAllRecords = [];
let attAnalyticsAllSessions = [];
let attAnalyticsIsLoading = false;
let attAnalyticsLastLoadedTime = 0;

let attClassChartInstance = null;
let attSubjectChartInstance = null;
let attTrendChartInstance = null;

let currentAttAnalyticsView = 'classes';
let currentAttWatchlistSort = 'rate-asc';
let currentAttWatchlistSearch = '';
let cachedWatchlistData = [];
let currentAttWatchlistPage = 1;
const attWatchlistPerPage = 15;

window.switchAttAnalyticsView = function (viewName) {
    currentAttAnalyticsView = viewName;

    // Sync View Dropdown Select
    const viewSelect = document.getElementById('attAnalyticsViewSelect');
    if (viewSelect && viewSelect.value !== viewName) {
        viewSelect.value = viewName;
    }

    // Update Panels
    const panels = ['classes', 'subjects', 'students', 'trends'];
    panels.forEach(p => {
        const el = document.getElementById(`attView_${p}`);
        if (el) {
            if (p === viewName) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    });

    // Re-render specific chart / view
    if (typeof window.renderAttendanceAnalytics === 'function') {
        window.renderAttendanceAnalytics();
    }
};

window.onAttAnalyticsFilterChange = function () {
    currentAttWatchlistPage = 1;
    if (typeof window.renderAttendanceAnalytics === 'function') {
        window.renderAttendanceAnalytics();
    }
};

window.onAttWatchlistSearchChange = function () {
    const input = document.getElementById('attWatchlistSearch');
    currentAttWatchlistSearch = (input ? input.value : '').trim().toLowerCase();
    currentAttWatchlistPage = 1;
    renderAttWatchlistTableOnly();
};

window.onAttWatchlistSortChange = function (val) {
    currentAttWatchlistSort = val || 'rate-asc';
    currentAttWatchlistPage = 1;
    renderAttWatchlistTableOnly();
};

window.changeAttWatchlistPage = function (delta) {
    currentAttWatchlistPage += delta;
    renderAttWatchlistTableOnly();
};

window.goToAttWatchlistPage = function (pageNum) {
    currentAttWatchlistPage = pageNum;
    renderAttWatchlistTableOnly();
};

function renderAttWatchlistTableOnly() {
    const tbody = document.querySelector('#attStudentWatchlistTable tbody');
    const pageInfoEl = document.getElementById('attWatchlistPageInfo');
    const prevBtn = document.getElementById('attWatchlistPrevBtn');
    const nextBtn = document.getElementById('attWatchlistNextBtn');
    const pageNumbersEl = document.getElementById('attWatchlistPageNumbers');
    if (!tbody) return;

    let items = Array.from(cachedWatchlistData || []);

    if (currentAttWatchlistSearch) {
        items = items.filter(s => {
            return (s.studentName || '').toLowerCase().includes(currentAttWatchlistSearch) ||
                   (s.studentCode || '').toLowerCase().includes(currentAttWatchlistSearch) ||
                   (s.studentClass || '').toLowerCase().includes(currentAttWatchlistSearch);
        });
    }

    if (currentAttWatchlistSort === 'rate-asc') {
        items.sort((a, b) => a.rate - b.rate || b.absent - a.absent);
    } else if (currentAttWatchlistSort === 'rate-desc') {
        items.sort((a, b) => b.rate - a.rate || a.absent - b.absent);
    } else if (currentAttWatchlistSort === 'absent-desc') {
        items.sort((a, b) => b.absent - a.absent || a.rate - b.rate);
    } else if (currentAttWatchlistSort === 'name-asc') {
        items.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
    }

    const totalCount = items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / attWatchlistPerPage));

    if (currentAttWatchlistPage > totalPages) {
        currentAttWatchlistPage = totalPages;
    }
    if (currentAttWatchlistPage < 1) {
        currentAttWatchlistPage = 1;
    }

    if (totalCount === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-gray, #64748b); padding: 28px 16px;">No student records found matching the criteria.</td></tr>`;
        if (pageInfoEl) pageInfoEl.innerText = 'Showing 0 of 0 students';
        if (prevBtn) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
            prevBtn.style.cursor = 'not-allowed';
        }
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
            nextBtn.style.cursor = 'not-allowed';
        }
        if (pageNumbersEl) pageNumbersEl.innerHTML = '';
        return;
    }

    const startIndex = (currentAttWatchlistPage - 1) * attWatchlistPerPage;
    const endIndex = Math.min(startIndex + attWatchlistPerPage, totalCount);
    const pageItems = items.slice(startIndex, endIndex);

    const rows = pageItems.map((st, idx) => {
        let riskClass = 'risk-low';
        let riskLabel = 'Good (>85%)';
        let barColor = '#10b981';

        if (st.rate < 75) {
            riskClass = 'risk-high';
            riskLabel = 'At Risk (<75%)';
            barColor = '#ef4444';
        } else if (st.rate < 85) {
            riskClass = 'risk-medium';
            riskLabel = 'Needs Attention';
            barColor = '#f59e0b';
        }

        return `
            <tr>
                <td style="text-align: center; color: var(--text-gray, #64748b); font-weight: 600;">${startIndex + idx + 1}</td>
                <td>
                    <span style="color: var(--text-dark, #0f172a); font-size: 13.5px; font-weight: 700;">${escapeHtml(st.studentName)}</span>
                </td>
                <td style="font-weight: 600; font-size: 13px; color: var(--text-dark, #0f172a);">${escapeHtml(st.studentClass)}</td>
                <td style="text-align: center;"><button type="button" class="att-history-count" data-att-student="${escapeHtml(st.studentCode)}" aria-label="View attendance history for ${escapeHtml(st.studentName)}">${st.total}</button></td>
                <td style="text-align: center; font-weight: 700; color: #10b981;">${st.present}</td>
                <td style="text-align: center; font-weight: 700; color: #ef4444;">${st.absent}</td>
                <td style="text-align: center; font-weight: 700; color: #f59e0b;">${st.other}</td>
                <td>
                    <div class="att-progress-bar-wrap">
                        <div class="att-progress-bar-track">
                            <div class="att-progress-bar-fill" style="width: ${st.rate}%; background: ${barColor};"></div>
                        </div>
                        <span style="font-size: 12.5px; font-weight: 700; min-width: 38px; text-align: right; color: ${barColor};">${st.rate}%</span>
                    </div>
                </td>
                <td style="text-align: center;">
                    <span class="att-risk-badge ${riskClass}">${riskLabel}</span>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = rows.join('');

    // Update Pagination UI
    if (pageInfoEl) {
        pageInfoEl.innerText = `Showing ${startIndex + 1}-${endIndex} of ${totalCount} students`;
    }

    if (prevBtn) {
        prevBtn.disabled = currentAttWatchlistPage <= 1;
        prevBtn.style.opacity = currentAttWatchlistPage <= 1 ? '0.5' : '1';
        prevBtn.style.cursor = currentAttWatchlistPage <= 1 ? 'not-allowed' : 'pointer';
    }

    if (nextBtn) {
        nextBtn.disabled = currentAttWatchlistPage >= totalPages;
        nextBtn.style.opacity = currentAttWatchlistPage >= totalPages ? '0.5' : '1';
        nextBtn.style.cursor = currentAttWatchlistPage >= totalPages ? 'not-allowed' : 'pointer';
    }

    if (pageNumbersEl) {
        let pagesHtml = '';
        const maxVisibleButtons = 5;
        let startPage = Math.max(1, currentAttWatchlistPage - Math.floor(maxVisibleButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

        if (endPage - startPage + 1 < maxVisibleButtons) {
            startPage = Math.max(1, endPage - maxVisibleButtons + 1);
        }

        if (startPage > 1) {
            pagesHtml += `<button type="button" class="att-page-num-btn" onclick="goToAttWatchlistPage(1)">1</button>`;
            if (startPage > 2) {
                pagesHtml += `<span style="font-size: 11px; color: var(--text-gray, #94a3b8); padding: 0 2px;">...</span>`;
            }
        }

        for (let p = startPage; p <= endPage; p++) {
            pagesHtml += `<button type="button" class="att-page-num-btn ${p === currentAttWatchlistPage ? 'active' : ''}" onclick="goToAttWatchlistPage(${p})">${p}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pagesHtml += `<span style="font-size: 11px; color: var(--text-gray, #94a3b8); padding: 0 2px;">...</span>`;
            }
            pagesHtml += `<button type="button" class="att-page-num-btn" onclick="goToAttWatchlistPage(${totalPages})">${totalPages}</button>`;
        }

        pageNumbersEl.innerHTML = pagesHtml;
    }
}

async function loadAttendanceAnalyticsData(forceReload = false) {
    if (attAnalyticsIsLoading) return;
    const now = Date.now();
    // Cache for 15 seconds unless forced
    if (!forceReload && attAnalyticsAllRecords.length > 0 && (now - attAnalyticsLastLoadedTime < 15000)) {
        window.renderAttendanceAnalytics();
        return;
    }

    try {
        attAnalyticsIsLoading = true;
        const [recordsSnap, sessionsSnap, studentsSnap] = await Promise.all([
            getDocs(collection(db, "attendance_records")),
            getDocs(collection(db, "attendance_sessions")),
            getDocs(collection(db, "students"))
        ]);

        const records = [];
        recordsSnap.forEach(docSnap => {
            records.push({ id: docSnap.id, ...docSnap.data() });
        });

        const sessions = [];
        sessionsSnap.forEach(docSnap => {
            sessions.push({ id: docSnap.id, ...docSnap.data() });
        });

        const students = [];
        studentsSnap.forEach(docSnap => {
            students.push({ id: docSnap.id, ...docSnap.data() });
        });

        attAnalyticsAllRecords = records;
        attAnalyticsAllSessions = sessions;
        attAnalyticsLastLoadedTime = Date.now();

        // Populate Class and Subject Filter dropdowns
        const classFilter = document.getElementById('attAnalyticsClassFilter');
        const subjectFilter = document.getElementById('attAnalyticsSubjectFilter');

        const classesSet = new Set();
        const subjectsSet = new Set();

        records.forEach(r => {
            if (r.studentClass) classesSet.add(r.studentClass);
            if (r.subject) subjectsSet.add(r.subject);
        });
        students.forEach(s => {
            if (s.studentClass) classesSet.add(s.studentClass);
        });
        sessions.forEach(s => {
            if (s.targetClass && s.targetClass !== "All Classes") classesSet.add(s.targetClass);
            if (s.subject) subjectsSet.add(s.subject);
        });

        if (classFilter) {
            const currentVal = classFilter.value;
            const sortedClasses = Array.from(classesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            classFilter.innerHTML = '<option value="all">All Classes</option>';
            sortedClasses.forEach(cls => {
                classFilter.innerHTML += `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`;
            });
            if (classesSet.has(currentVal)) classFilter.value = currentVal;
        }

        if (subjectFilter) {
            const currentSubVal = subjectFilter.value;
            const sortedSubjects = Array.from(subjectsSet).sort((a, b) => a.localeCompare(b));
            subjectFilter.innerHTML = '<option value="all">All Subjects</option>';
            sortedSubjects.forEach(sub => {
                subjectFilter.innerHTML += `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`;
            });
            if (subjectsSet.has(currentSubVal)) subjectFilter.value = currentSubVal;
        }

        window.renderAttendanceAnalytics();
    } catch (err) {
        console.error("Error loading attendance analytics data:", err);
    } finally {
        attAnalyticsIsLoading = false;
    }
}
window.loadAttendanceAnalyticsData = loadAttendanceAnalyticsData;

function renderAttendanceAnalytics() {
    const timeRange = document.getElementById('attAnalyticsTimeRange')?.value || 'all';
    const selectedClass = document.getElementById('attAnalyticsClassFilter')?.value || 'all';
    const selectedSubject = document.getElementById('attAnalyticsSubjectFilter')?.value || 'all';

    let filteredRecords = Array.from(attAnalyticsAllRecords || []);

    // Filter by Time Range
    if (timeRange !== 'all') {
        const days = parseInt(timeRange, 10);
        if (!isNaN(days) && days > 0) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            filteredRecords = filteredRecords.filter(r => (r.date || '') >= cutoffStr);
        }
    }

    // Filter by Class
    if (selectedClass !== 'all') {
        filteredRecords = filteredRecords.filter(r => r.studentClass === selectedClass);
    }

    // Filter by Subject
    if (selectedSubject !== 'all') {
        filteredRecords = filteredRecords.filter(r => r.subject === selectedSubject);
    }

    // 1. Compute Metrics & Aggregations
    let totalRecords = filteredRecords.length;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalOther = 0;

    const classStatsMap = {};
    const subjectStatsMap = {};
    const studentStatsMap = {};
    const dateStatsMap = {};
    const reasonsMap = {};

    filteredRecords.forEach(r => {
        const st = (r.status || 'pending').toLowerCase();
        const cls = r.studentClass || 'Unknown';
        const subj = r.subject || 'General';
        const stCode = r.studentCode || r.id;
        const stName = r.studentName || stCode;
        const dt = r.date || 'Unknown';
        const reason = (r.reason || '').trim();

        if (st === 'present') totalPresent++;
        else if (st === 'absent') totalAbsent++;
        else if (st === 'others') totalOther++;

        if (reason && (st === 'absent' || st === 'others')) {
            reasonsMap[reason] = (reasonsMap[reason] || 0) + 1;
        }

        // Class Aggregation
        if (!classStatsMap[cls]) classStatsMap[cls] = { present: 0, absent: 0, other: 0, total: 0 };
        classStatsMap[cls].total++;
        if (st === 'present') classStatsMap[cls].present++;
        else if (st === 'absent') classStatsMap[cls].absent++;
        else if (st === 'others') classStatsMap[cls].other++;

        // Subject Aggregation
        if (!subjectStatsMap[subj]) subjectStatsMap[subj] = { present: 0, absent: 0, other: 0, total: 0, sessionsSet: new Set() };
        subjectStatsMap[subj].total++;
        if (r.sessionId) subjectStatsMap[subj].sessionsSet.add(r.sessionId);
        if (st === 'present') subjectStatsMap[subj].present++;
        else if (st === 'absent') subjectStatsMap[subj].absent++;
        else if (st === 'others') subjectStatsMap[subj].other++;

        // Student Aggregation
        if (!studentStatsMap[stCode]) {
            studentStatsMap[stCode] = {
                studentCode: stCode,
                studentName: stName,
                studentClass: cls,
                present: 0,
                absent: 0,
                other: 0,
                total: 0
            };
        }
        studentStatsMap[stCode].total++;
        if (st === 'present') studentStatsMap[stCode].present++;
        else if (st === 'absent') studentStatsMap[stCode].absent++;
        else if (st === 'others') studentStatsMap[stCode].other++;

        // Date Aggregation
        if (!dateStatsMap[dt]) dateStatsMap[dt] = { date: dt, present: 0, absent: 0, other: 0, total: 0 };
        dateStatsMap[dt].total++;
        if (st === 'present') dateStatsMap[dt].present++;
        else if (st === 'absent') dateStatsMap[dt].absent++;
        else if (st === 'others') dateStatsMap[dt].other++;
    });

    const activeTotal = totalPresent + totalAbsent + totalOther;
    const overallRate = activeTotal > 0 ? Math.round((totalPresent / activeTotal) * 100) : 0;

    // 2. Compute Top Class
    let topClass = '--';
    let maxClassRate = -1;
    Object.keys(classStatsMap).forEach(cls => {
        const c = classStatsMap[cls];
        const cActive = c.present + c.absent + c.other;
        const rate = cActive > 0 ? (c.present / cActive) * 100 : 0;
        c.rate = Math.round(rate);
        if (rate > maxClassRate && cActive >= 3) {
            maxClassRate = rate;
            topClass = `${cls} (${c.rate}%)`;
        }
    });

    // 3. Compute Top Absence Reason
    let topReason = '--';
    let topReasonCount = 0;
    Object.keys(reasonsMap).forEach(rs => {
        if (reasonsMap[rs] > topReasonCount) {
            topReasonCount = reasonsMap[rs];
            topReason = `${rs} (${topReasonCount}x)`;
        }
    });
    if (topReason === '--' && totalAbsent > 0) {
        topReason = 'Unspecified / Alpha';
    }

    // 4. Compute Student Watchlist Array & At Risk Count
    const watchlistArray = [];
    let atRiskCount = 0;
    Object.values(studentStatsMap).forEach(st => {
        const stActive = st.present + st.absent + st.other;
        const rate = stActive > 0 ? Math.round((st.present / stActive) * 100) : 0;
        st.rate = rate;
        if (rate < 80 && stActive > 0) atRiskCount++;
        watchlistArray.push(st);
    });
    cachedWatchlistData = watchlistArray;

    // 5. Update KPI Cards in DOM
    const kpiRateEl = document.getElementById('attKpiRate');
    const kpiTopClassEl = document.getElementById('attKpiTopClass');
    const kpiTopReasonEl = document.getElementById('attKpiTopReason');
    const kpiAtRiskEl = document.getElementById('attKpiAtRiskCount');

    if (kpiRateEl) kpiRateEl.innerText = `${overallRate}%`;
    if (kpiTopClassEl) kpiTopClassEl.innerText = topClass !== '--' ? topClass : 'No data';
    if (kpiTopReasonEl) kpiTopReasonEl.innerText = topReason;
    if (kpiAtRiskEl) kpiAtRiskEl.innerText = atRiskCount;

    // 6. Render View-Specific Components
    if (currentAttAnalyticsView === 'classes') {
        renderAttClassOverview(classStatsMap);
    } else if (currentAttAnalyticsView === 'subjects') {
        renderAttSubjectBreakdown(subjectStatsMap);
    } else if (currentAttAnalyticsView === 'students') {
        renderAttWatchlistTableOnly();
    } else if (currentAttAnalyticsView === 'trends') {
        renderAttTrendsChart(dateStatsMap);
    }
};

function renderAttClassOverview(classStatsMap) {
    const sortedClassNames = Object.keys(classStatsMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const rates = sortedClassNames.map(cls => classStatsMap[cls].rate || 0);

    // Chart
    const canvas = document.getElementById('attClassCompChart');
    if (canvas && typeof Chart !== 'undefined') {
        if (attClassChartInstance) attClassChartInstance.destroy();
        attClassChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedClassNames.length > 0 ? sortedClassNames : ['No Class Data'],
                datasets: [{
                    label: 'Attendance Rate (%)',
                    data: rates.length > 0 ? rates : [0],
                    backgroundColor: rates.map(r => r >= 85 ? 'rgba(16, 185, 129, 0.75)' : (r >= 75 ? 'rgba(245, 158, 11, 0.75)' : 'rgba(239, 68, 68, 0.75)')),
                    borderColor: rates.map(r => r >= 85 ? '#10b981' : (r >= 75 ? '#f59e0b' : '#ef4444')),
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Attendance Rate: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: (v) => `${v}%`, font: { size: 11 } },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '600' } }
                    }
                }
            }
        });
    }

    // Summary Table
    const tbody = document.querySelector('#attClassSummaryTable tbody');
    if (tbody) {
        if (sortedClassNames.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-gray, #64748b); padding: 18px;">No class data available.</td></tr>`;
        } else {
            tbody.innerHTML = sortedClassNames.map(cls => {
                const c = classStatsMap[cls];
                return `
                    <tr>
                        <td style="font-weight: 700; color: var(--text-dark, #0f172a);">${escapeHtml(cls)}</td>
                        <td style="text-align: right; font-weight: 800; color: ${c.rate >= 85 ? '#10b981' : (c.rate >= 75 ? '#f59e0b' : '#ef4444')};">${c.rate}%</td>
                        <td style="text-align: right; color: #10b981; font-weight: 600;">${c.present}</td>
                        <td style="text-align: right; color: #ef4444; font-weight: 600;">${c.absent}</td>
                        <td style="text-align: right; color: #f59e0b; font-weight: 600;">${c.other}</td>
                    </tr>
                `;
            }).join('');
        }
    }
}

function renderAttSubjectBreakdown(subjectStatsMap) {
    const sortedSubjects = Object.keys(subjectStatsMap).sort((a, b) => a.localeCompare(b));
    sortedSubjects.forEach(s => {
        const item = subjectStatsMap[s];
        const active = item.present + item.absent + item.other;
        item.rate = active > 0 ? Math.round((item.present / active) * 100) : 0;
        item.sessionsCount = item.sessionsSet.size;
    });

    const rates = sortedSubjects.map(s => subjectStatsMap[s].rate || 0);

    // Chart
    const canvas = document.getElementById('attSubjectCompChart');
    if (canvas && typeof Chart !== 'undefined') {
        if (attSubjectChartInstance) attSubjectChartInstance.destroy();
        attSubjectChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedSubjects.length > 0 ? sortedSubjects : ['No Subject Data'],
                datasets: [{
                    label: 'Compliance Rate (%)',
                    data: rates.length > 0 ? rates : [0],
                    backgroundColor: 'rgba(30, 94, 255, 0.7)',
                    borderColor: '#1e5eff',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Compliance: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: (v) => `${v}%`, font: { size: 11 } },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '600' } }
                    }
                }
            }
        });
    }

    // Summary Table
    const tbody = document.querySelector('#attSubjectSummaryTable tbody');
    if (tbody) {
        if (sortedSubjects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-gray, #64748b); padding: 18px;">No subject data available.</td></tr>`;
        } else {
            tbody.innerHTML = sortedSubjects.map(subj => {
                const s = subjectStatsMap[subj];
                return `
                    <tr>
                        <td style="font-weight: 700; color: var(--text-dark, #0f172a);">${escapeHtml(subj)}</td>
                        <td style="text-align: right; font-weight: 800; color: #1e5eff;">${s.rate}%</td>
                        <td style="text-align: right; color: var(--text-dark, #0f172a); font-weight: 600;">${s.sessionsCount || 1}</td>
                        <td style="text-align: right; color: #ef4444; font-weight: 600;">${s.absent}</td>
                    </tr>
                `;
            }).join('');
        }
    }
}
window.renderAttendanceAnalytics = renderAttendanceAnalytics;

function renderAttTrendsChart(dateStatsMap) {
    const sortedDates = Object.keys(dateStatsMap).sort();
    const rates = sortedDates.map(d => {
        const item = dateStatsMap[d];
        const active = item.present + item.absent + item.other;
        return active > 0 ? Math.round((item.present / active) * 100) : 0;
    });

    const canvas = document.getElementById('attTrendChart');
    if (canvas && typeof Chart !== 'undefined') {
        if (attTrendChartInstance) attTrendChartInstance.destroy();
        attTrendChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: sortedDates.length > 0 ? sortedDates : ['No Timeline Data'],
                datasets: [{
                    label: 'Daily Attendance Rate (%)',
                    data: rates.length > 0 ? rates : [0],
                    borderColor: '#1e5eff',
                    backgroundColor: 'rgba(30, 94, 255, 0.08)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#1e5eff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Attendance Rate: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: (v) => `${v}%`, font: { size: 11 } },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    }
}


// --- Student Attendance History Dialog ---
// Read-only student history from the same records loaded for attendance analytics.
const studentAttendanceDialog = document.getElementById('studentAttendanceDialog');
document.getElementById('closeStudentAttendance')?.addEventListener('click', () => studentAttendanceDialog.close());
studentAttendanceDialog?.addEventListener('click', event => {
    if (event.target !== studentAttendanceDialog) return;
    const bounds = studentAttendanceDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) studentAttendanceDialog.close();
});
document.getElementById('attStudentWatchlistTable')?.addEventListener('click', event => {
    const button = event.target.closest('[data-att-student]');
    if (!button) return;
    const code = button.dataset.attStudent;
    const records = attAnalyticsAllRecords.filter(record => String(record.studentCode || record.id) === code);
    const savedTime = value => {
        if (!value) return null;
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value.seconds != null ? value.seconds * 1000 : value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
    records.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (savedTime(b.timestamp)?.getTime() || 0) - (savedTime(a.timestamp)?.getTime() || 0));
    const student = cachedWatchlistData.find(item => String(item.studentCode) === code);
    document.getElementById('studentAttendanceIdentity').textContent = (student?.studentName || records[0]?.studentName || code) + ' · ' + (student?.studentClass || records[0]?.studentClass || 'Class not recorded');
    const statusInfo = { present: ['Present', 'present'], absent: ['Absent', 'absent'], others: ['Other', 'other'] };
    const counts = { present: 0, absent: 0, others: 0, pending: 0 };
    records.forEach(record => { const status = String(record.status || '').toLowerCase(); counts[statusInfo[status] ? status : 'pending']++; });
    const summary = [['Total', records.length], ['Present', counts.present], ['Absent', counts.absent], ['Other', counts.others]];
    if (counts.pending) summary.push(['Unspecified', counts.pending]);
    document.getElementById('studentAttendanceSummary').innerHTML = summary.map(([label,count]) => '<div><strong>' + count + '</strong><span>' + label + '</span></div>').join('');
    document.getElementById('studentAttendanceRecords').innerHTML = records.map(record => {
        const session = attAnalyticsAllSessions.find(item => item.id === record.sessionId);
        const status = statusInfo[String(record.status || '').toLowerCase()] || ['Unspecified', 'pending'];
        const dateText = record.date || session?.date || 'Date not recorded';
        const time = savedTime(record.timestamp);
        return '<article class="student-att-record"><div class="student-att-record-top"><strong>' + escapeHtml(dateText) + '</strong><span class="student-att-status ' + status[1] + '">' + status[0] + '</span></div><p class="student-att-class">' + escapeHtml(record.studentClass || session?.studentClass || 'Class not recorded') + ' · ' + escapeHtml(record.subject || session?.subject || 'Subject not recorded') + '</p><p class="student-att-reason">Reason: ' + escapeHtml(String(record.reason || '').trim() || 'Not recorded') + '</p><small>Last recorded: ' + escapeHtml(time ? time.toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}) : 'Not recorded') + '</small></article>';
    }).join('') || '<p>No attendance records available for this student.</p>';
    studentAttendanceDialog.showModal();
});


// Exports
export {
    loadAttendanceAnalyticsData,
    renderAttendanceAnalytics
};
