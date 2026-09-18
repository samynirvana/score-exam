// Quiz Document Auto-Import & Intelligent Parser (DOCX, PDF, DOC, TXT)
// Modular component extracted from admin.js

import { escapeHtml } from "../../utils.js";

// ==========================================
// QUIZ DOCUMENT AUTO-IMPORT & PARSER (DOCX, PDF, DOC, TXT)
// ==========================================

let parsedQuizDocumentData = null;

// 1. Trigger File Selection
window.triggerQuizDocUpload = function () {
    const fileInput = document.getElementById('quizDocxFileInput');
    if (fileInput) {
        fileInput.value = ''; // reset so same file can be re-selected if needed
        fileInput.click();
    }
};

// 2. Handle File Input Change
window.handleQuizDocFileSelect = async function (event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const modal = document.getElementById('quizDocImportModal');
    const metaEl = document.getElementById('quizDocImportMeta');
    const previewList = document.getElementById('docQuestionsPreviewList');
    const confirmBtn = document.getElementById('btnConfirmInsertParsedQuiz');

    if (modal) modal.style.display = 'flex';
    if (metaEl) metaEl.textContent = `Reading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
    if (previewList) previewList.innerHTML = `<div style="text-align: center; padding: 25px; color: #64748b;"><i style="display:inline-block; width: 20px; height: 20px; border: 2px solid #cbd5e1; border-top-color: #673ab7; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 8px;"></i><p>Extracting text and analyzing question structures...</p></div>`;
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        let rawText = '';
        const fileNameLower = file.name.toLowerCase();

        if (fileNameLower.endsWith('.docx')) {
            rawText = await extractTextFromDocx(file);
        } else if (fileNameLower.endsWith('.pdf')) {
            rawText = await extractTextFromPdf(file);
        } else if (fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.doc')) {
            // Text or basic doc text fallback
            rawText = await extractTextFromPlainText(file);
        } else {
            throw new Error("Unsupported file format. Please upload a .docx, .pdf, or .txt file.");
        }

        if (!rawText || !rawText.trim()) {
            throw new Error("No readable text could be extracted from this document. It may be scanned or empty.");
        }

        // Analyze and parse text into questions
        parsedQuizDocumentData = analyzeAndParseQuizDocument(rawText, file.name);

        renderParsedQuizPreview(parsedQuizDocumentData, file.name);
        if (confirmBtn) confirmBtn.disabled = false;
    } catch (err) {
        console.error("Quiz Document Import Error:", err);
        if (metaEl) metaEl.textContent = `Error reading file: ${err.message}`;
        if (previewList) {
            previewList.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444; background: #fef2f2; border-radius: 8px; border: 1px solid #fca5a5;"><strong>Analysis Failed</strong><p style="margin: 6px 0 0; font-size: 13px;">${escapeHtml(err.message)}</p></div>`;
        }
    }
};

// 3. Extract text from .docx using Mammoth.js
async function extractTextFromDocx(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error("Mammoth.js library is not loaded. Please ensure you are connected to the internet.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value || '';
}

// 4. Extract text from .pdf using PDF.js
async function extractTextFromPdf(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error("PDF.js library is not loaded. Please ensure you are connected to the internet.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let lastY = null;
        let pageText = '';

        for (const item of textContent.items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += '\n';
            }
            pageText += item.str + ' ';
            lastY = item.transform[5];
        }
        fullText += pageText + '\n\n';
    }
    return fullText;
}

// 5. Extract text from plain text or .doc fallback
function extractTextFromPlainText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => reject(new Error("Failed to read text file"));
        reader.readAsText(file);
    });
}

// 6. Intelligent Quiz Parsing Heuristic Engine
function analyzeAndParseQuizDocument(rawText, fileName) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Heuristic Quiz Title: Check first 3 lines or use file name without extension
    let detectedTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
    if (lines.length > 0) {
        const firstLine = lines[0];
        if (firstLine.length > 3 && firstLine.length < 90 && !firstLine.match(/^\d+[\.\)]/i) && !firstLine.match(/^(name|class|date|student):/i)) {
            detectedTitle = firstLine;
        }
    }

    // Question number pattern: e.g. "1.", "1)", "Question 1:", "Q1.", "[1]"
    const questionNumberRegex = /^(?:Question\s*|Q\s*)?(\d{1,3})[\.\)\:\-]\s*(.*)$/i;

    // MCQ option pattern: e.g. "A.", "A)", "(A)", "[A]", "a."
    const optionRegex = /^(?:\(?([A-Ea-e])[\.\)]|\[([A-Ea-e])\])\s*(.+)$/;

    // Inline option pattern: e.g. "A. Cat B. Dog C. Fish D. Bird"
    const inlineOptionRegex = /(?:^|\s+)([A-Ea-e])[\.\)]\s+([^\n\r]+?)(?=(?:\s+[A-Ea-e][\.\)]\s+|$))/g;

    // Answer Key marker: e.g. "Answer: B", "Ans: B", "Key: B", "Answer Key"
    const answerMarkerRegex = /^(?:Answer|Ans|Key|Correct(?:\s*Answer)?)\s*[:\-\.]\s*([A-Ea-e0-9\w\s,]+)/i;

    // Passage marker: e.g. "Read the following passage...", "Passage 1:", "Reading Comprehension"
    const passageMarkerRegex = /^(?:Read (?:the )?(?:following|text|passage|story)|Passage\s*(?:\d+)?\:|Reading Comprehension)/i;

    const items = [];
    let currentItem = null;
    let globalAnswerKeys = {}; // maps question number (1-based) to answer string

    // Phase 1: Pre-scan for trailing Answer Key section at the bottom (e.g., "Answer Key: 1. A 2. B 3. C")
    let inAnswerKeySection = false;
    const cleanedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^Answer Key/i) || line.match(/^Kunci Jawaban/i)) {
            inAnswerKeySection = true;
            continue;
        }
        if (inAnswerKeySection) {
            // Parse patterns like "1. A", "1:B", "1.A, 2.B"
            const matches = line.matchAll(/(\d{1,3})\s*[\.\:\-]?\s*([A-Ea-e])/g);
            for (const match of matches) {
                globalAnswerKeys[parseInt(match[1], 10)] = match[2].toUpperCase();
            }
        } else {
            cleanedLines.push(line);
        }
    }

    // Phase 2: Process document lines sequentially
    for (let i = 0; i < cleanedLines.length; i++) {
        const line = cleanedLines[i];

        // 1. Check for Passage / Section Header
        if (passageMarkerRegex.test(line) && !currentItem?.isPassageCollecting) {
            if (currentItem) items.push(finalizeParsedItem(currentItem, items.length + 1, globalAnswerKeys));
            currentItem = {
                type: 'passage',
                title: line,
                textLines: [],
                isPassageCollecting: true
            };
            continue;
        }

        // If currently collecting passage text
        if (currentItem?.isPassageCollecting) {
            // Passage ends when a numbered question is encountered
            if (questionNumberRegex.test(line)) {
                currentItem.isPassageCollecting = false;
                items.push(finalizeParsedItem(currentItem, items.length + 1, globalAnswerKeys));
                currentItem = null;
                // fall through to process question
            } else {
                currentItem.textLines.push(line);
                continue;
            }
        }

        // 2. Check for Single Line Inline Answer Key (e.g. "Ans: B" or "Answer: Paris")
        const answerMatch = line.match(answerMarkerRegex);
        if (answerMatch && currentItem) {
            currentItem.explicitAnswer = answerMatch[1].trim();
            continue;
        }

        // 3. Check for New Question Number
        const qMatch = line.match(questionNumberRegex);
        if (qMatch) {
            // Commit previous question
            if (currentItem) {
                items.push(finalizeParsedItem(currentItem, items.length + 1, globalAnswerKeys));
            }
            const qNum = parseInt(qMatch[1], 10);
            const qPrompt = qMatch[2].trim();
            currentItem = {
                num: qNum,
                prompt: qPrompt,
                options: [],
                type: 'mcq', // default candidate, can be converted to fill or essay
                lines: []
            };
            continue;
        }

        // 4. Check for MCQ Options (A, B, C, D)
        const optMatch = line.match(optionRegex);
        if (optMatch && currentItem) {
            const letter = (optMatch[1] || optMatch[2]).toUpperCase();
            const optText = optMatch[3].trim();
            currentItem.options.push({ letter, text: optText });
            continue;
        }

        // 5. Check for Multiple Options on a single line (e.g. "A. Apple   B. Banana   C. Cherry   D. Date")
        if (currentItem && (line.includes('A.') || line.includes('A)') || line.includes('a.'))) {
            const inlineMatches = [...line.matchAll(inlineOptionRegex)];
            if (inlineMatches.length >= 2) {
                inlineMatches.forEach(m => {
                    currentItem.options.push({
                        letter: m[1].toUpperCase(),
                        text: m[2].trim()
                    });
                });
                continue;
            }
        }

        // 6. Otherwise, append line to the active question prompt or description
        if (currentItem) {
            if (currentItem.options.length === 0) {
                currentItem.prompt = (currentItem.prompt ? currentItem.prompt + ' ' : '') + line;
            } else {
                // Continuation of last option
                const lastOpt = currentItem.options[currentItem.options.length - 1];
                lastOpt.text += ' ' + line;
            }
        }
    }

    // Finalize last pending item
    if (currentItem) {
        items.push(finalizeParsedItem(currentItem, items.length + 1, globalAnswerKeys));
    }

    return {
        title: detectedTitle,
        items: items
    };
}

// Helper: Finalize question classification and correct answer
function finalizeParsedItem(rawItem, fallbackIndex, globalAnswerKeys) {
    if (rawItem.type === 'passage') {
        return {
            type: 'passage',
            prompt: rawItem.title || 'Reading Passage',
            description: (rawItem.textLines || []).join('\n\n'),
            points: 0
        };
    }

    const qNum = rawItem.num || fallbackIndex;
    let type = 'mcq';
    let options = (rawItem.options || []).map(o => o.text);
    let correct = 0;
    let answers = [];

    // Determine correct answer from explicitAnswer or globalAnswerKeys
    let foundKeyLetter = '';
    if (rawItem.explicitAnswer) {
        foundKeyLetter = rawItem.explicitAnswer.trim().toUpperCase().charAt(0);
    } else if (globalAnswerKeys[qNum]) {
        foundKeyLetter = globalAnswerKeys[qNum].trim().toUpperCase().charAt(0);
    }

    if (rawItem.options && rawItem.options.length >= 2) {
        type = 'mcq';
        // Map letter (A, B, C, D) to option index (0, 1, 2, 3)
        if (foundKeyLetter) {
            const letterCode = foundKeyLetter.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1
            if (letterCode >= 0 && letterCode < options.length) {
                correct = letterCode;
            }
        }
    } else {
        // No options found: is it Fill-in-the-blank or Essay?
        const prompt = rawItem.prompt || '';
        if (prompt.includes('___') || prompt.includes('....') || prompt.match(/\([_\s]{3,}\)/)) {
            type = 'fill';
            if (rawItem.explicitAnswer) {
                answers = [rawItem.explicitAnswer];
            }
        } else {
            type = 'essay';
        }
    }

    return {
        type: type,
        prompt: rawItem.prompt || `Question ${qNum}`,
        options: options.length > 0 ? options : ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correct: correct,
        answers: answers,
        points: 1
    };
}

// 7. Render Preview inside Modal
function renderParsedQuizPreview(parsedQuiz, fileName) {
    const metaEl = document.getElementById('quizDocImportMeta');
    const titleInput = document.getElementById('docParsedQuizTitle');
    const previewList = document.getElementById('docQuestionsPreviewList');
    const previewCountBadge = document.getElementById('docPreviewCountBadge');

    if (titleInput) titleInput.value = parsedQuiz.title || "Uploaded Quiz";

    let countMcq = 0, countFill = 0, countEssay = 0, countPassage = 0;
    parsedQuiz.items.forEach(item => {
        if (item.type === 'mcq') countMcq++;
        else if (item.type === 'fill') countFill++;
        else if (item.type === 'essay') countEssay++;
        else if (item.type === 'passage') countPassage++;
    });

    const totalQuestions = parsedQuiz.items.length;
    document.getElementById('docStatTotal').textContent = totalQuestions;
    document.getElementById('docStatMcq').textContent = countMcq;
    document.getElementById('docStatFill').textContent = countFill;
    document.getElementById('docStatEssay').textContent = countEssay;
    document.getElementById('docStatPassage').textContent = countPassage;

    if (metaEl) {
        metaEl.textContent = `Analyzed ${fileName} · Found ${totalQuestions} items`;
    }
    if (previewCountBadge) {
        previewCountBadge.textContent = `${totalQuestions} items parsed`;
    }

    if (!previewList) return;
    previewList.innerHTML = '';

    if (parsedQuiz.items.length === 0) {
        previewList.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b;">No questions detected. Please verify your document uses standard numbering (e.g. 1. Question... A. Option).</div>`;
        return;
    }

    parsedQuiz.items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'doc-preview-card';

        let badgeClass = 'badge-mcq';
        let badgeLabel = 'Multiple Choice';
        if (item.type === 'fill') { badgeClass = 'badge-fill'; badgeLabel = 'Fill in Blank'; }
        else if (item.type === 'essay') { badgeClass = 'badge-essay'; badgeLabel = 'Essay'; }
        else if (item.type === 'passage') { badgeClass = 'badge-passage'; badgeLabel = 'Reading Passage'; }

        let detailsHtml = '';
        if (item.type === 'mcq') {
            const letterLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
            detailsHtml = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px; margin-top: 4px; font-size: 12.5px;">
                    ${item.options.map((opt, i) => `
                        <div style="padding: 4px 8px; border-radius: 4px; ${i === item.correct ? 'background: #dcfce7; font-weight: 700; color: #166534; border: 1px solid #86efac;' : 'background: #f8fafc; color: #475569;'}">
                            ${letterLabels[i] || i + 1}. ${escapeHtml(opt)} ${i === item.correct ? '✓ (Correct)' : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (item.type === 'fill') {
            detailsHtml = `<div style="font-size: 12.5px; color: #1e40af; margin-top: 2px;">Accepted Answers: <strong>${escapeHtml(item.answers?.join(', ') || 'Teacher to verify')}</strong></div>`;
        } else if (item.type === 'passage') {
            detailsHtml = `<div style="font-size: 12px; color: #64748b; margin-top: 2px; max-height: 48px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.description || '').substring(0, 150)}...</div>`;
        }

        card.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 800; font-size: 13px; color: #334155;">#${idx + 1}</span>
                    <span class="badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">1 pt</span>
            </div>
            <div style="font-size: 13.5px; font-weight: 600; color: #0f172a; line-height: 1.4;">${escapeHtml(item.prompt)}</div>
            ${detailsHtml}
        `;
        previewList.appendChild(card);
    });
}

// 8. Close Modal
window.closeQuizDocImportModal = function () {
    const modal = document.getElementById('quizDocImportModal');
    if (modal) modal.style.display = 'none';
};

// 9. Confirm and Insert Parsed Quiz into Interactive Builder
window.confirmInsertParsedQuiz = function () {
    if (!parsedQuizDocumentData || !parsedQuizDocumentData.items || parsedQuizDocumentData.items.length === 0) {
        alert("No parsed questions to insert.");
        return;
    }

    const titleInput = document.getElementById('docParsedQuizTitle');
    const defaultPointsInput = document.getElementById('docDefaultPoints');
    const modeRadio = document.querySelector('input[name="docImportMode"]:checked');

    const finalTitle = titleInput?.value.trim() || parsedQuizDocumentData.title || "Imported Quiz";
    const defaultPoints = parseInt(defaultPointsInput?.value, 10) || 1;
    const mode = modeRadio ? modeRadio.value : 'replace';

    // Set Quiz Titles
    const quizTitleInput = document.getElementById('quizTitle');
    const mainTitleDiv = document.getElementById('gform-main-title');
    const displayQuizTitle = document.getElementById('displayQuizTitle');

    if (mode === 'replace' || !quizTitleInput?.value || quizTitleInput.value === 'Untitled Quiz') {
        if (quizTitleInput) quizTitleInput.value = finalTitle;
        if (mainTitleDiv) mainTitleDiv.innerText = finalTitle;
        if (displayQuizTitle) displayQuizTitle.innerText = finalTitle;
    }

    const container = document.getElementById('quizBlocksContainer');
    if (!container) return;

    if (mode === 'replace') {
        container.innerHTML = '';
    }

    let firstCreatedBlock = null;
    const addBlockFn = (typeof addBlock === 'function' ? addBlock : window.addBlock);
    const activateCardFn = (typeof activateCard === 'function' ? activateCard : window.activateCard);
    const notifyFn = (typeof showActionNotification === 'function' ? showActionNotification : window.showActionNotification);

    parsedQuizDocumentData.items.forEach((item, index) => {
        const type = item.type || 'mcq';
        const block = typeof addBlockFn === 'function' ? addBlockFn(type) : null;
        if (!block) return;
        if (!firstCreatedBlock) firstCreatedBlock = block;

        const points = item.points || defaultPoints;

        if (type === 'passage') {
            const promptNode = block.querySelector('.blk-prompt');
            const descNode = block.querySelector('.blk-desc');
            if (promptNode) promptNode.innerText = item.prompt || 'Reading Passage';
            if (descNode) descNode.innerText = item.description || '';

        } else if (type === 'mcq') {
            const promptNode = block.querySelector('.blk-prompt');
            if (promptNode) promptNode.innerText = item.prompt || '';

            const pointsInput = block.querySelector('.blk-points');
            if (pointsInput) pointsInput.value = points;

            // Populate options
            const optionsContainer = block.querySelector('.options-container');
            if (optionsContainer && item.options && item.options.length > 0) {
                optionsContainer.innerHTML = '';
                const blockId = block.dataset.blockId || ('block_' + index);

                item.options.forEach((optText, i) => {
                    const newRow = document.createElement('div');
                    newRow.className = 'gform-opt-row';
                    const isChecked = item.correct === i ? 'checked' : '';
                    newRow.innerHTML = `
                        <input type="radio" name="${blockId}_correct" value="${i}" onchange="this.closest('.quiz-block').querySelector('.blk-correct').value = this.value" ${isChecked} title="Mark as correct answer">
                        <input type="text" class="gform-opt-input blk-opt${i}" placeholder="Option ${i + 1}" value="${escapeHtml(optText)}" required>
                        <button class="icon-btn delete" type="button" title="Remove Option" onclick="this.closest('.gform-opt-row').remove(); window.reindexMCQOptions(this.closest('.quiz-block'))">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    optionsContainer.appendChild(newRow);
                });
            }

            const correctInput = block.querySelector('.blk-correct');
            if (correctInput) correctInput.value = item.correct ?? 0;

        } else if (type === 'fill') {
            const promptNode = block.querySelector('.blk-prompt');
            if (promptNode) promptNode.innerText = item.prompt || '';

            const pointsInput = block.querySelector('.blk-points');
            if (pointsInput) pointsInput.value = points;

            const answerInput = block.querySelector('.blk-answer');
            if (answerInput && item.answers && item.answers.length > 0) {
                answerInput.value = item.answers.join(', ');
            }

        } else if (type === 'essay') {
            const promptNode = block.querySelector('.blk-prompt');
            if (promptNode) promptNode.innerText = item.prompt || '';

            const pointsInput = block.querySelector('.blk-points');
            if (pointsInput) pointsInput.value = points;
        }
    });

    closeQuizDocImportModal();

    if (firstCreatedBlock) {
        if (typeof activateCardFn === 'function') activateCardFn(firstCreatedBlock);
        firstCreatedBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Display subtle toast notification
    if (typeof notifyFn === 'function') {
        notifyFn(`Imported ${parsedQuizDocumentData.items.length} questions successfully!`, 'success');
    } else {
        alert(`Successfully imported ${parsedQuizDocumentData.items.length} questions into the quiz builder!`);
    }
};
