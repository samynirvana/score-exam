// ==========================================================================
// BOARD-SNAPPING.JS - Pure Snapping & Geometry Engine
// ==========================================================================

/**
 * Finds the closest point on line segment (x1, y1) -> (x2, y2) to target point (px, py)
 */
export function getClosestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: x1, y: y1 };
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy };
}

/**
 * Calculates straight line endpoints considering optional shape anchor bindings
 */
export function getLineEndpoints(el, elements = []) {
    let x1 = el.x1 !== undefined ? el.x1 : el.x;
    let y1 = el.y1 !== undefined ? el.y1 : el.y;
    let x2 = el.x2 !== undefined ? el.x2 : (el.x + (el.width || 100));
    let y2 = el.y2 !== undefined ? el.y2 : (el.y + (el.height || 0));

    if (el.startBinding && Array.isArray(elements)) {
        const shape = elements.find(item => item.id === el.startBinding.shapeId);
        if (shape && typeof shape.getAnchorCoord === 'function') {
            const pt = shape.getAnchorCoord(shape, el.startBinding.anchor);
            x1 = pt.x;
            y1 = pt.y;
        }
    }

    if (el.endBinding && Array.isArray(elements)) {
        const shape = elements.find(item => item.id === el.endBinding.shapeId);
        if (shape && typeof shape.getAnchorCoord === 'function') {
            const pt = shape.getAnchorCoord(shape, el.endBinding.anchor);
            x2 = pt.x;
            y2 = pt.y;
        }
    }

    return { x1, y1, x2, y2 };
}

/**
 * Computes magnetic snapping point against elements and background grid
 * @param {number} rawX
 * @param {number} rawY
 * @param {Object} options - Snapping context parameters
 * @returns {{x: number, y: number, isSnapped: boolean, snapType?: string}}
 */
export function calculateMagnetSnapPoint(rawX, rawY, options = {}) {
    const {
        isMagnetSnapping = true,
        camera = { zoom: 1 },
        elements = [],
        selectedElementIds = new Set(),
        isDragging = false,
        activePenPath = null,
        gridStyle = 'dots',
        isometricGridSize = 20,
        isometricGridAngle1 = 30,
        isometricGridAngle2 = -30,
        normalGridSize = 24
    } = options;

    if (!isMagnetSnapping) return { x: rawX, y: rawY, isSnapped: false };

    const snapRadius = 18 / (camera.zoom || 1);
    const candidates = [];

    // 1. Check nearby element vertices, corners, midpoints, and edges
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (selectedElementIds.has(el.id) && isDragging) continue;

        if (el.type === 'path' || el.type === 'draw') {
            if (Array.isArray(el.points)) {
                el.points.forEach(p => {
                    const d = Math.hypot(rawX - p.x, rawY - p.y);
                    if (d <= snapRadius) {
                        candidates.push({ x: p.x, y: p.y, dist: d - 4, snapType: 'vertex' });
                    }
                });
            }
        } else if (el.type === 'line' || el.type === 'arrow') {
            const ep = getLineEndpoints(el, elements);
            const d1 = Math.hypot(rawX - ep.x1, rawY - ep.y1);
            if (d1 <= snapRadius) candidates.push({ x: ep.x1, y: ep.y1, dist: d1 - 4, snapType: 'vertex' });
            const d2 = Math.hypot(rawX - ep.x2, rawY - ep.y2);
            if (d2 <= snapRadius) candidates.push({ x: ep.x2, y: ep.y2, dist: d2 - 4, snapType: 'vertex' });
            const midX = (ep.x1 + ep.x2) / 2;
            const midY = (ep.y1 + ep.y2) / 2;
            const dMid = Math.hypot(rawX - midX, rawY - midY);
            if (dMid <= snapRadius) candidates.push({ x: midX, y: midY, dist: dMid - 2, snapType: 'midpoint' });

            const closest = getClosestPointOnSegment(rawX, rawY, ep.x1, ep.y1, ep.x2, ep.y2);
            const dLine = Math.hypot(rawX - closest.x, rawY - closest.y);
            if (dLine <= snapRadius * 0.75) {
                candidates.push({ x: closest.x, y: closest.y, dist: dLine, snapType: 'edge' });
            }
        } else {
            const ex = el.x || 0;
            const ey = el.y || 0;
            const ew = el.width || 0;
            const eh = el.height || 0;

            const corners = [
                { x: ex, y: ey },
                { x: ex + ew, y: ey },
                { x: ex + ew, y: ey + eh },
                { x: ex, y: ey + eh }
            ];
            const midpoints = [
                { x: ex + ew / 2, y: ey },
                { x: ex + ew, y: ey + eh / 2 },
                { x: ex + ew / 2, y: ey + eh },
                { x: ex, y: ey + eh / 2 },
                { x: ex + ew / 2, y: ey + eh / 2 }
            ];

            if (el.type === 'shape') {
                if (el.shapeType === 'diamond') {
                    corners.push({ x: ex + ew / 2, y: ey }, { x: ex + ew, y: ey + eh / 2 }, { x: ex + ew / 2, y: ey + eh }, { x: ex, y: ey + eh / 2 });
                } else if (el.shapeType === 'triangle') {
                    corners.push({ x: ex + ew / 2, y: ey }, { x: ex, y: ey + eh }, { x: ex + ew, y: ey + eh });
                }
            }

            corners.forEach(c => {
                const d = Math.hypot(rawX - c.x, rawY - c.y);
                if (d <= snapRadius) candidates.push({ x: c.x, y: c.y, dist: d - 4, snapType: 'vertex' });
            });
            midpoints.forEach(m => {
                const d = Math.hypot(rawX - m.x, rawY - m.y);
                if (d <= snapRadius) candidates.push({ x: m.x, y: m.y, dist: d - 2, snapType: 'midpoint' });
            });

            if (rawX >= ex && rawX <= ex + ew) {
                const dTop = Math.abs(rawY - ey);
                if (dTop <= snapRadius * 0.7) candidates.push({ x: rawX, y: ey, dist: dTop, snapType: 'edge' });
                const dBottom = Math.abs(rawY - (ey + eh));
                if (dBottom <= snapRadius * 0.7) candidates.push({ x: rawX, y: ey + eh, dist: dBottom, snapType: 'edge' });
            }
            if (rawY >= ey && rawY <= ey + eh) {
                const dLeft = Math.abs(rawX - ex);
                if (dLeft <= snapRadius * 0.7) candidates.push({ x: ex, y: rawY, dist: dLeft, snapType: 'edge' });
                const dRight = Math.abs(rawX - (ex + ew));
                if (dRight <= snapRadius * 0.7) candidates.push({ x: ex + ew, y: rawY, dist: dRight, snapType: 'edge' });
            }
        }
    }

    // 2. Check active in-progress pen points
    if (activePenPath && Array.isArray(activePenPath.points)) {
        activePenPath.points.forEach(p => {
            const d = Math.hypot(rawX - p.x, rawY - p.y);
            if (d <= snapRadius) {
                candidates.push({ x: p.x, y: p.y, dist: d - 6, snapType: 'vertex' });
            }
        });
    }

    // 3. Check Background Grid Vertices & Intersections
    if (gridStyle === 'isometric') {
        const W = isometricGridSize || 20;
        const spacing = W;
        const a1 = (isometricGridAngle1 || 30) * Math.PI / 180;
        const a2 = (isometricGridAngle2 || -30) * Math.PI / 180;
        const n1 = { x: -Math.sin(a1), y: Math.cos(a1) };
        const n2 = { x: -Math.sin(a2), y: Math.cos(a2) };
        const det = n1.x * n2.y - n1.y * n2.x;
        if (Math.abs(det) > 0.001) {
            const estimate1 = (n1.x * rawX + n1.y * rawY) / spacing;
            const estimate2 = (n2.x * rawX + n2.y * rawY) / spacing;
            const k = Math.round(estimate1);
            const l = Math.round(estimate2);
            for (let dk = -2; dk <= 2; dk++) {
                for (let dl = -2; dl <= 2; dl++) {
                    const c1 = (k + dk) * spacing;
                    const c2 = (l + dl) * spacing;
                    const gx = (c1 * n2.y - n1.y * c2) / det;
                    const gy = (n1.x * c2 - c1 * n2.x) / det;
                    const d = Math.hypot(rawX - gx, rawY - gy);
                    if (d <= snapRadius) candidates.push({ x: gx, y: gy, dist: d, snapType: 'grid' });
                }
            }
        }
    } else if (gridStyle === 'lines' || gridStyle === 'grid') {
        const gridStep = Math.max(10, normalGridSize || 24);
        const gx = Math.round(rawX / gridStep) * gridStep;
        const gy = Math.round(rawY / gridStep) * gridStep;
        const d = Math.hypot(rawX - gx, rawY - gy);
        if (d <= snapRadius) {
            candidates.push({ x: gx, y: gy, dist: d, snapType: 'grid' });
        }
    }

    if (candidates.length === 0) {
        return { x: rawX, y: rawY, isSnapped: false };
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    return {
        x: Math.round(best.x * 10) / 10,
        y: Math.round(best.y * 10) / 10,
        isSnapped: true,
        snapType: best.snapType
    };
}
