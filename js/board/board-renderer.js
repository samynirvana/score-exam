// ==========================================================================
// BOARD-RENDERER.JS - 2D Canvas Rendering Engine for Whiteboard Elements
// ==========================================================================

const loadedFonts = new Set([
    'Caveat', 'Inter', 'Merriweather', 'Roboto Mono', 'Outfit', 'sans-serif', 'serif', 'monospace', 'cursive'
]);

export function ensureFontLoaded(fontFamily) {
    if (!fontFamily || loadedFonts.has(fontFamily)) return;
    const cleanFamily = fontFamily.replace(/['",]/g, '').trim().split(' ')[0];
    if (!cleanFamily || loadedFonts.has(cleanFamily)) return;
    loadedFonts.add(fontFamily);
    loadedFonts.add(cleanFamily);
    if ('fonts' in document) {
        document.fonts.load(`16px "${cleanFamily}"`).catch(() => { });
    }
}

export function roundRect(ctx, x, y, width, height, radius = 8, fill = true, stroke = false) {
    radius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

export function drawStarPath(ctx, cx, cy, spikes = 5, outerRadius = 30, innerRadius = 15) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

export function drawSpeechBubblePath(ctx, x, y, w, h) {
    const r = 12;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + 40, y + h);
    ctx.lineTo(x + 20, y + h + 16);
    ctx.lineTo(x + 26, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

export function drawArrowHead(ctx, fromX, fromY, toX, toY, headLength = 10) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
}

export function drawCloudPath(ctx, x, y, w, h) {
    ctx.moveTo(x + w * 0.2, y + h * 0.7);
    ctx.bezierCurveTo(x, y + h * 0.7, x, y + h * 0.35, x + w * 0.2, y + h * 0.35);
    ctx.bezierCurveTo(x + w * 0.15, y + h * 0.1, x + w * 0.45, y + h * 0.05, x + w * 0.5, y + h * 0.25);
    ctx.bezierCurveTo(x + w * 0.65, y + h * 0.05, x + w * 0.85, y + h * 0.15, x + w * 0.8, y + h * 0.4);
    ctx.bezierCurveTo(x + w * 1.05, y + h * 0.45, x + w * 1.02, y + h * 0.75, x + w * 0.8, y + h * 0.75);
    ctx.closePath();
}

export function renderElementText(ctx, text, boxX, boxY, boxW, boxH, fontSize, lineHeight, textAlign = 'left', textVAlign = 'top', padding = { top: 0, right: 0, bottom: 0, left: 0 }, isUnderline = false) {
    if (!text) return;
    const padTop = padding.top !== undefined ? padding.top : 0;
    const padBottom = padding.bottom !== undefined ? padding.bottom : 0;
    const padLeft = padding.left !== undefined ? padding.left : 0;
    const padRight = padding.right !== undefined ? padding.right : 0;

    const availW = Math.max(10, boxW - padLeft - padRight);
    const availH = Math.max(10, boxH - padTop - padBottom);

    const wrappedLines = [];
    const paragraphs = (text || '').split('\n');
    for (let p = 0; p < paragraphs.length; p++) {
        const words = paragraphs[p].split(' ');
        let currentLine = '';
        for (let n = 0; n < words.length; n++) {
            const word = words[n];
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > availW && currentLine) {
                wrappedLines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        wrappedLines.push(currentLine);
    }

    if (wrappedLines.length === 0) return;

    const totalTextHeight = wrappedLines.length * lineHeight;

    let startY;
    if (textVAlign === 'middle' || textVAlign === 'center') {
        startY = boxY + padTop + Math.max(0, (availH - totalTextHeight) / 2) + fontSize * 0.88;
    } else if (textVAlign === 'bottom') {
        startY = boxY + boxH - padBottom - totalTextHeight + fontSize * 0.88;
    } else { // 'top'
        startY = boxY + padTop + fontSize * 0.88;
    }

    ctx.save();
    ctx.textAlign = 'left';
    for (let i = 0; i < wrappedLines.length; i++) {
        const line = wrappedLines[i];
        const lineMetrics = ctx.measureText(line);
        let drawX;
        if (textAlign === 'center') {
            drawX = boxX + padLeft + Math.max(0, (availW - lineMetrics.width) / 2);
        } else if (textAlign === 'right') {
            drawX = boxX + boxW - padRight - lineMetrics.width;
        } else { // 'left'
            drawX = boxX + padLeft;
        }

        const baselineY = startY + i * lineHeight;
        ctx.fillText(line, drawX, baselineY);

        if (isUnderline && line.trim().length > 0) {
            ctx.save();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = Math.max(1, Math.round(fontSize / 14));
            const underlineY = baselineY + Math.max(2, Math.round(fontSize * 0.12));
            ctx.beginPath();
            ctx.moveTo(drawX, underlineY);
            ctx.lineTo(drawX + lineMetrics.width, underlineY);
            ctx.stroke();
            ctx.restore();
        }
    }
    ctx.restore();
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight, center = false) {
    const align = center ? 'center' : 'left';
    renderElementText(ctx, text, x, y - 16 * 0.88, maxWidth, 1000, 16, lineHeight, align, 'top', { top: 0, right: 0, bottom: 0, left: 0 });
}

export function roundedVectorPoints(points, radius, closed) {
    if (!closed || !(radius > 0) || points.length < 3) return points;
    return points.flatMap((p, i) => {
        const prev = points[(i + points.length - 1) % points.length];
        const next = points[(i + 1) % points.length];
        if (p.handleIn || p.handleOut || prev.handleOut || next.handleIn) return [p];
        const a = Math.hypot(prev.x - p.x, prev.y - p.y);
        const b = Math.hypot(next.x - p.x, next.y - p.y);
        if (!a || !b) return [p];
        const d = Math.min(radius, a / 2, b / 2);
        const entry = { x: p.x + (prev.x - p.x) * d / a, y: p.y + (prev.y - p.y) * d / a };
        const exit = { x: p.x + (next.x - p.x) * d / b, y: p.y + (next.y - p.y) * d / b };
        entry.handleOut = { x: entry.x + (p.x - entry.x) * 2 / 3, y: entry.y + (p.y - entry.y) * 2 / 3 };
        exit.handleIn = { x: exit.x + (p.x - exit.x) * 2 / 3, y: exit.y + (p.y - exit.y) * 2 / 3 };
        return [entry, exit];
    });
}

export function drawPathShape(ctx, points, closed, radius = 0) {
    if (!points || points.length === 0) return;
    points = roundedVectorPoints(points, radius, closed);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cp1 = prev.handleOut || { x: prev.x, y: prev.y };
        const cp2 = curr.handleIn || { x: curr.x, y: curr.y };

        if (prev.handleOut || curr.handleIn) {
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y);
        } else {
            ctx.lineTo(curr.x, curr.y);
        }
    }

    if (closed && points.length > 2) {
        const last = points[points.length - 1];
        const first = points[0];
        const cp1 = last.handleOut || { x: last.x, y: last.y };
        const cp2 = first.handleIn || { x: first.x, y: first.y };
        if (last.handleOut || first.handleIn) {
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, first.x, first.y);
        } else {
            ctx.lineTo(first.x, first.y);
        }
        ctx.closePath();
    }
}

export function applyBorderDash(ctx, el) {
    const length = el.dashLength ?? Math.max(6, (el.strokeWidth || 2) * 3);
    const gap = el.borderSpacing ?? 6;
    ctx.setLineDash([length, gap]);
    ctx.lineDashOffset = (el.dashRotation || 0) / 360 * (length + gap);
}

export function renderStrokePoints(ctx, points, color, size, isHighlighter) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        const midX = (points[i - 1].x + points[i].x) / 2;
        const midY = (points[i - 1].y + points[i].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    if (isHighlighter) {
        ctx.strokeStyle = color || '#fef08a';
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = (size || 14) * 2;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'bevel';
    } else {
        ctx.strokeStyle = color || '#1e293b';
        ctx.lineWidth = size || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
    ctx.stroke();
    ctx.restore();
}

export function updateTextElementBounds(el) {
    if (!el || el.type !== 'text') return;
    const lines = (el.text || ' ').split('\n');
    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');
    if (mCtx) {
        const isBold = el.isBold ? 'bold ' : '';
        const isItalic = el.isItalic ? 'italic ' : '';
        const fSize = el.fontSize || 20;
        const fFam = el.fontFamily || "'Outfit', sans-serif";
        mCtx.font = `${isBold}${isItalic}${fSize}px ${fFam}`;
        let maxW = 40;
        lines.forEach(l => {
            const tw = mCtx.measureText(l || ' ').width;
            if (tw > maxW) maxW = tw;
        });
        el.width = Math.max(60, Math.round(maxW + 16));
        el.height = Math.max(36, Math.round(lines.length * (fSize * 1.35) + 8));
    }
}
