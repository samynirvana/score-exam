// ==========================================================================
// BOARD-PROPERTIES.JS - Whiteboard Properties Panel & Contextual Inspector
// ==========================================================================

let boardContext = null;

/**
 * Connect the properties panel engine to whiteboard state and actions
 * @param {Object} ctx - Whiteboard context
 */
export function setPropertiesContext(ctx) {
    boardContext = ctx;
}

// ==========================================================================
// 8. PROPERTIES PANEL ENGINE & DYNAMIC CONTEXTUAL BINDINGS
// ==========================================================================

let isPropPanelInitialized = false;

export function initPropertiesPanel() {
    if (isPropPanelInitialized) return;
    isPropPanelInitialized = true;

    const panel = document.getElementById('boardPropertiesPanel');
    const handle = document.getElementById('boardPropertiesResizeHandle');
    const workspace = document.getElementById('boardWorkspaceView');
    const btnToggle = document.getElementById('btnToggleProperties');
    const btnMin = document.getElementById('btnMinimizeProperties');
    const btnClose = document.getElementById('btnCloseProperties');

    // 1. Restore persistent width preference
    const savedWidth = localStorage.getItem('board_prop_width');
    if (savedWidth && panel) {
        const parsedW = Math.max(260, Math.min(520, parseInt(savedWidth, 10)));
        panel.style.width = `${parsedW}px`;
        workspace?.style.setProperty('--board-prop-width', `${parsedW}px`);
    } else if (workspace) {
        workspace.style.setProperty('--board-prop-width', '310px');
    }

    // Default: workspace has property panel open
    if (panel && !panel.classList.contains('hidden')) {
        workspace?.classList.add('has-prop-panel');
        btnToggle?.classList.add('active');
    }

    // 2. Toggle Button in topbar
    btnToggle?.addEventListener('click', () => {
        if (!panel) return;
        const isHidden = panel.classList.toggle('hidden');
        btnToggle.classList.toggle('active', !isHidden);
        workspace?.classList.toggle('has-prop-panel', !isHidden && !panel.classList.contains('minimized'));
        if (!isHidden) {
            updatePropertiesPanel();
        }
    });

    // 3. Minimize / Expand Button on panel header
    btnMin?.addEventListener('click', () => {
        if (!panel) return;
        const isMin = panel.classList.toggle('minimized');
        const minIcon = document.getElementById('propMinimizeIcon');
        if (minIcon) {
            minIcon.innerHTML = isMin
                ? '<polyline points="15 18 9 12 15 6"></polyline>'
                : '<polyline points="9 18 15 12 9 6"></polyline>';
        }
        workspace?.classList.toggle('has-prop-panel', !isMin && !panel.classList.contains('hidden'));
    });

    // 4. Close Button on panel header
    btnClose?.addEventListener('click', () => {
        if (!panel) return;
        panel.classList.add('hidden');
        btnToggle?.classList.remove('active');
        workspace?.classList.remove('has-prop-panel');
    });

    // 5. Left Drag Resize Handle
    if (handle && panel) {
        let startX = 0;
        let startWidth = 0;

        const onResizeMove = (e) => {
            const dx = startX - e.clientX;
            const newW = Math.max(260, Math.min(520, startWidth + dx));
            panel.style.width = `${newW}px`;
            workspace?.style.setProperty('--board-prop-width', `${newW}px`);
        };

        const onResizeUp = () => {
            handle.classList.remove('is-resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onResizeMove);
            window.removeEventListener('pointerup', onResizeUp);
            localStorage.setItem('board_prop_width', panel.offsetWidth);
        };

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('is-resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('pointermove', onResizeMove);
            window.addEventListener('pointerup', onResizeUp);
        });
    }

    // 6. Setup Swatches and Event Handlers
    setupPropertiesPanelInputs();
    updatePropertiesPanel();
}

function getSelectedElementsList() {
    return boardContext.elements.filter(el => boardContext.selectedElementIds.has(el.id));
}

function supportsMultiFill(el) {
    return el.type === 'shape' || (el.type === 'path' && el.closed) || el.type === 'sticky';
}

function supportsMultiTextColor(el) {
    return el.type === 'shape' || (el.type === 'path' && el.closed) || el.type === 'text' || el.type === 'sticky';
}

function supportsMultiBorder(el) {
    return el.type === 'shape' || el.type === 'path' || el.type === 'line' || el.type === 'arrow';
}

function sharedSelectionValue(list, readValue) {
    if (!list.length) return null;
    const first = readValue(list[0]);
    return list.every(el => readValue(el) === first) ? first : null;
}

function applyMultiProperty(predicate, update, isLive = false) {
    if (boardContext?.currentBoard?.isReadOnly) return;
    const list = getSelectedElementsList().filter(predicate);
    if (boardContext.selectedElementIds.size < 2 || !list.length) return;
    if (!isLive) {
        boardContext.pushUndoState();
    }
    list.forEach(update);
    boardContext.renderCanvas();
    boardContext.scheduleAutoSave();
    if (!isLive) {
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    }
}

export function getSingleSelectedElement() {
    if (!boardContext || boardContext.selectedElementIds.size !== 1) return null;
    const id = Array.from(boardContext.selectedElementIds)[0];
    return boardContext.elements.find(el => el.id === id) || null;
}

function renderColorSwatches(containerId, palette, currentColor, onColorSelected) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    palette.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'prop-color-swatch';
        if (c === 'transparent') {
            swatch.classList.add('prop-color-none');
            swatch.title = 'No Color (Transparent)';
            swatch.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" style="pointer-events: none;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
        } else {
            swatch.style.background = c;
            swatch.title = c;
        }

        if (currentColor && (currentColor.toLowerCase() === c.toLowerCase() || (c === 'transparent' && currentColor === 'transparent'))) {
            swatch.classList.add('active');
        }

        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            onColorSelected(c);
        });

        container.appendChild(swatch);
    });

    // Add native color picker wrapper
    const customWrapper = document.createElement('div');
    customWrapper.className = 'prop-custom-color-wrapper';
    customWrapper.title = 'Choose custom color';

    const customDot = document.createElement('div');
    customDot.className = 'prop-custom-color-dot';

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.className = 'prop-native-picker';
    nativeInput.value = (currentColor && currentColor !== 'transparent') ? currentColor : '#1e5eff';

    // Live dragging inside color picker: update canvas without tearing down DOM
    nativeInput.addEventListener('input', (e) => {
        const val = e.target.value;
        customDot.style.background = val;
        // Mark swatches inactive while custom color is chosen
        container.querySelectorAll('.prop-color-swatch').forEach(s => s.classList.remove('active'));
        onColorSelected(val, true);
    });

    // Finished color selection (dialog closed / mouse release): commit change
    nativeInput.addEventListener('change', (e) => {
        const val = e.target.value;
        customDot.style.background = val;
        onColorSelected(val, false);
    });

    customWrapper.appendChild(customDot);
    customWrapper.appendChild(nativeInput);
    container.appendChild(customWrapper);
}

function setupInspectorCategories() {
    const content = document.getElementById('boardPropertiesContent');
    if (!content || document.getElementById('propSectionAppearance')) return;
    const transform = document.getElementById('propSectionTransform');
    const shape = document.getElementById('propSectionShape');
    const text = document.getElementById('propSectionShapeText');
    const makeSection = (id, title) => {
        const section = document.createElement('div');
        section.id = id;
        section.className = 'prop-section hidden';
        const heading = document.createElement('div');
        heading.className = 'prop-section-label inspector-category-title';
        heading.textContent = title;
        section.append(heading);
        return section;
    };
    const heading = document.createElement('div');
    heading.className = 'prop-section-label inspector-category-title';
    heading.textContent = 'Properties';
    transform.prepend(heading);
    const appearance = makeSection('propSectionAppearance', 'Appearance');
    const border = makeSection('propSectionBorder', 'Border');
    transform.after(appearance);
    appearance.after(border);
    shape.querySelector('.prop-section-label').remove();
    border.append(document.getElementById('propShapeBorderSwatches').parentElement);
    border.append(document.getElementById('propSliderShapeBorder').closest('.prop-field-group'));
    border.querySelectorAll('[data-shape-stroke-style]').forEach(btn => { btn.textContent = btn.dataset.shapeStrokeStyle === 'dashed' ? 'Dash' : 'Line'; });
    const spacingLabel = document.createElement('label');
    spacingLabel.className = 'prop-field-label';
    spacingLabel.textContent = 'Border Spacing (px)';
    const spacing = document.createElement('input');
    spacing.id = 'propBorderSpacing';
    spacing.type = 'number'; spacing.min = '0'; spacing.max = '100'; spacing.step = '1';
    spacing.className = 'prop-input';
    spacingLabel.append(spacing); border.append(spacingLabel);
    [
        { id: 'propDashLength', key: 'dashLength', label: 'Dash Length (px)', min: 1, max: 200 },
        { id: 'propDashRotation', key: 'dashRotation', label: 'Dash Rotation (°)', min: 0, max: 360 }
    ].forEach(control => {
        const label = document.createElement('label');
        label.className = 'prop-field-label';
        label.textContent = control.label;
        const input = document.createElement('input');
        input.id = control.id; input.type = 'number'; input.className = 'prop-input';
        input.min = control.min; input.max = control.max; input.step = 1;
        if (control.key === 'dashRotation') input.title = 'Shift the dash pattern around the border; 360° is one full dash cycle.';
        label.append(input); border.append(label);
        input.addEventListener('change', () => {
            const el = getSingleSelectedElement();
            if (!el || boardContext.currentBoard?.isReadOnly || !Number.isFinite(Number(input.value))) return;
            boardContext.pushUndoState();
            el[control.key] = Math.max(control.min, Math.min(control.max, Number(input.value)));
            input.value = el[control.key];
            boardContext.renderCanvas(); boardContext.scheduleAutoSave();
        });
    });
    spacing.addEventListener('change', () => {
        const el = getSingleSelectedElement();
        if (!el || boardContext.currentBoard?.isReadOnly || !Number.isFinite(Number(spacing.value))) return;
        boardContext.pushUndoState();
        el.borderSpacing = Math.max(0, Math.min(100, Number(spacing.value)));
        spacing.value = el.borderSpacing;
        boardContext.renderCanvas(); boardContext.scheduleAutoSave();
    });
    appearance.append(shape, document.getElementById('propGroupOpacity'));
    text.querySelector('.prop-section-label').textContent = 'Text';
    text.querySelector('.prop-section-label').classList.add('inspector-category-title');
    const fontLabel = document.createElement('label');
    fontLabel.className = 'prop-field-label'; fontLabel.textContent = 'Text Font';
    const font = document.getElementById('propSelectFontFamily').cloneNode(true);
    font.id = 'propShapeFontFamily';
    fontLabel.append(font);
    text.querySelector('textarea').after(fontLabel);
    font.addEventListener('change', () => {
        const el = getSingleSelectedElement();
        if (!el || boardContext.currentBoard?.isReadOnly) return;
        boardContext.pushUndoState(); el.fontFamily = font.value;
        boardContext.ensureFontLoaded(font.value); boardContext.renderCanvas(); boardContext.scheduleAutoSave(); boardContext.updateFormattingBar();
    });
}

function setupPropertiesPanelInputs() {
    setupInspectorCategories();
    // 1. Transform / Position & Dimensions (X, Y, W, H)
    const inpX = document.getElementById('propInputX');
    const inpY = document.getElementById('propInputY');
    const inpW = document.getElementById('propInputW');
    const inpH = document.getElementById('propInputH');

    const updateGeometry = () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        const nextX = inpX && inpX.value !== '' ? parseFloat(inpX.value) || 0 : el.x;
        const nextY = inpY && inpY.value !== '' ? parseFloat(inpY.value) || 0 : el.y;
        const nextW = inpW && inpW.value !== '' ? Math.max(5, parseFloat(inpW.value) || 10) : el.width;
        const nextH = inpH && inpH.value !== '' ? Math.max(5, parseFloat(inpH.value) || 10) : el.height;

        // Path geometry is drawn from points, so numeric transform edits must
        // scale the points, their Bezier handles, and any custom pivot as well.
        if (el.type === 'path' && Array.isArray(el.points) && el.points.length) {
            const bounds = boardContext.getElementBoundingBox(el);
            const scaleX = nextW / Math.max(bounds.width, 1);
            const scaleY = nextH / Math.max(bounds.height, 1);
            const mapPoint = (point) => ({
                x: Math.round(nextX + (point.x - bounds.x) * scaleX),
                y: Math.round(nextY + (point.y - bounds.y) * scaleY)
            });
            el.points = el.points.map(point => ({
                ...point,
                ...mapPoint(point),
                handleIn: point.handleIn ? mapPoint(point.handleIn) : null,
                handleOut: point.handleOut ? mapPoint(point.handleOut) : null
            }));
            if (el.origin) el.origin = mapPoint(el.origin);
        }

        el.x = nextX;
        el.y = nextY;
        el.width = nextW;
        el.height = nextH;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    [inpX, inpY, inpW, inpH].forEach(inp => {
        inp?.addEventListener('change', updateGeometry);
        inp?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateGeometry();
                inp.blur();
            }
        });
    });

    // 2. Rotation slider, number input, 90deg button, presets
    const rotSlider = document.getElementById('propSliderRotation');
    const rotInput = document.getElementById('propInputRotation');
    const btnRot90 = document.getElementById('btnPropRotate90');

    const setRotation = (deg, pushState = true) => {
        const el = getSingleSelectedElement();
        if (!el) return;
        if (pushState) boardContext.pushUndoState();
        el.rotation = deg;
        if (rotSlider) rotSlider.value = deg;
        if (rotInput) rotInput.value = deg;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
    };

    rotSlider?.addEventListener('input', (e) => {
        setRotation(parseFloat(e.target.value) || 0, false);
    });
    rotSlider?.addEventListener('change', (e) => {
        setRotation(parseFloat(e.target.value) || 0, true);
    });
    rotInput?.addEventListener('change', (e) => {
        setRotation(parseFloat(e.target.value) || 0, true);
    });

    btnRot90?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        const nextRot = (((el.rotation || 0) + 90) % 360);
        setRotation(nextRot, true);
    });

    document.querySelectorAll('.prop-pill-btn[data-rot]').forEach(btn => {
        btn.addEventListener('click', () => {
            const rot = parseFloat(btn.getAttribute('data-rot')) || 0;
            setRotation(rot, true);
        });
    });

    // 2b. Origin Point (Pivot) inputs
    const inpOriginX = document.getElementById('propInputOriginX');
    const inpOriginY = document.getElementById('propInputOriginY');
    const btnResetOrigin = document.getElementById('btnPropResetOrigin');

    const updateOriginFromInput = () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        const ox = parseFloat(inpOriginX?.value);
        const oy = parseFloat(inpOriginY?.value);
        if (!isNaN(ox) && !isNaN(oy)) {
            boardContext.pushUndoState();
            el.origin = { x: ox, y: oy };
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    };

    inpOriginX?.addEventListener('change', updateOriginFromInput);
    inpOriginY?.addEventListener('change', updateOriginFromInput);

    btnResetOrigin?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        delete el.origin;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
    });

    // 3. Opacity slider
    const opSlider = document.getElementById('propSliderOpacity');
    const opBadge = document.getElementById('propLabelOpacity');

    opSlider?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) / 100;
        if (opBadge) opBadge.innerText = `${e.target.value}%`;
        const list = getSelectedElementsList();
        list.forEach(el => {
            el.opacity = val;
        });
        boardContext.renderCanvas();
    });
    opSlider?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
    });

    // 4. Shape Type Switcher
    document.getElementById('btnPropGroup')?.addEventListener('click', () => boardContext.setSelectionGroup());
    document.getElementById('btnPropUngroup')?.addEventListener('click', () => boardContext.setSelectionGroup(true));
    document.getElementById('propMultiBorderWidth')?.addEventListener('change', (event) => {
        const width = Number(event.target.value);
        if (!Number.isFinite(width) || event.target.value === '') return;
        const clampedWidth = Math.max(0, Math.min(24, width));
        event.target.value = clampedWidth;
        applyMultiProperty(supportsMultiBorder, el => { el.strokeWidth = clampedWidth; });
    });
    document.querySelectorAll('[data-multi-stroke-style]').forEach(button => {
        button.addEventListener('click', () => {
            applyMultiProperty(supportsMultiBorder, el => { el.strokeStyle = button.dataset.multiStrokeStyle; });
        });
    });
    document.getElementById('btnConvertPathToShape')?.addEventListener('click', () => boardContext.convertSelectedPathToShape?.());
    document.getElementById('btnPropConvertPathToShape')?.addEventListener('click', () => boardContext.convertSelectedPathToShape?.());
    document.getElementById('propCornerRadius')?.addEventListener('change', (event) => {
        const el = getSingleSelectedElement();
        if (boardContext.currentBoard?.isReadOnly || !el || !((el.type === 'shape' && ['rectangle', 'rounded-rect'].includes(el.shapeType)) || (el.type === 'path' && el.closed))) return;
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        boardContext.pushUndoState();
        el.cornerRadius = Math.max(0, Math.min(value, (el.width || 120) / 2, (el.height || 80) / 2));
        event.target.value = el.cornerRadius;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
    });
    const shapeTypeSelect = document.getElementById('propSelectShapeType');
    shapeTypeSelect?.addEventListener('change', (e) => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'shape') {
            boardContext.pushUndoState();
            el.shapeType = e.target.value;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
        }
    });

    // 5. Shape Fill Transparent button
    document.getElementById('btnPropFillTransparent')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.fillColor = 'transparent';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });

    // 6. Shape Border Transparent button
    document.getElementById('btnPropBorderTransparent')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.strokeColor = 'transparent';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });

    // 7. Shape Border Thickness (Slider + Steppers)
    const shapeBorderSlider = document.getElementById('propSliderShapeBorder');
    const shapeBorderVal = document.getElementById('propShapeThicknessVal');

    const setShapeBorderWidth = (w) => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.strokeWidth = Math.max(0, Math.min(24, w));
        if (shapeBorderSlider) shapeBorderSlider.value = el.strokeWidth;
        if (shapeBorderVal) shapeBorderVal.innerText = `${el.strokeWidth}px`;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    shapeBorderSlider?.addEventListener('input', (e) => {
        const w = parseInt(e.target.value, 10);
        if (shapeBorderVal) shapeBorderVal.innerText = `${w}px`;
        const el = getSingleSelectedElement();
        if (el) {
            el.strokeWidth = w;
            boardContext.renderCanvas();
        }
    });
    shapeBorderSlider?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    });

    document.getElementById('btnPropShapeBorderDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setShapeBorderWidth((el.strokeWidth !== undefined ? el.strokeWidth : 2) - 1);
    });
    document.getElementById('btnPropShapeBorderUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setShapeBorderWidth((el.strokeWidth !== undefined ? el.strokeWidth : 2) + 1);
    });

    // Shape Border Style (Solid / Dashed)
    document.querySelectorAll('.prop-style-toggle[data-shape-stroke-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-shape-stroke-style');
            const el = getSingleSelectedElement();
            if (el) {
                boardContext.pushUndoState();
                el.strokeStyle = style;
                boardContext.renderCanvas();
                boardContext.scheduleAutoSave();
                updatePropertiesPanel();
            }
        });
    });

    // 8. Text Inside Shape
    const shapeTextInput = document.getElementById('propShapeTextInput');
    shapeTextInput?.addEventListener('input', (e) => {
        const el = getSingleSelectedElement();
        if (el && (el.type === 'shape' || (el.type === 'path' && el.sourceShapeType === 'custom'))) {
            el.text = e.target.value;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });
    shapeTextInput?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
    });

    // Shape Text Font Size
    const shapeFontSizeInput = document.getElementById('propShapeFontSize');
    const setShapeFontSize = (sz) => {
        const el = getSingleSelectedElement();
        if (!el || (el.type !== 'shape' && !(el.type === 'path' && el.sourceShapeType === 'custom'))) return;
        boardContext.pushUndoState();
        el.fontSize = Math.max(10, Math.min(200, sz));
        if (shapeFontSizeInput) shapeFontSizeInput.value = el.fontSize;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    shapeFontSizeInput?.addEventListener('change', (e) => {
        setShapeFontSize(parseInt(e.target.value, 10) || 15);
    });
    document.getElementById('btnPropShapeFontDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setShapeFontSize((el.fontSize || 15) - 2);
    });
    document.getElementById('btnPropShapeFontUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setShapeFontSize((el.fontSize || 15) + 2);
    });

    // Shape Text Bold & Italic
    document.getElementById('btnPropShapeBold')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isBold = !el.isBold;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });
    document.getElementById('btnPropShapeItalic')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isItalic = !el.isItalic;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });
    document.getElementById('btnPropShapeUnderline')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isUnderline = !el.isUnderline;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });

    // Shape Text Alignment
    document.getElementById('btnPropShapeAlignLeft')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'left';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropShapeAlignCenter')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'center';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropShapeAlignRight')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'right';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropShapeAlignTop')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textVAlign = 'top';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropShapeAlignMiddle')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textVAlign = 'middle';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropShapeAlignBottom')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textVAlign = 'bottom';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });

    // 9. Standalone Text Element
    const textElemInput = document.getElementById('propTextInput');
    textElemInput?.addEventListener('input', (e) => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'text') {
            el.text = e.target.value;
            boardContext.updateTextElementBounds(el);
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });
    textElemInput?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
    });

    const textFontSelect = document.getElementById('propSelectFontFamily');
    textFontSelect?.addEventListener('change', (e) => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.fontFamily = e.target.value;
            if (el.type === 'text') boardContext.updateTextElementBounds(el);
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });

    const textFontSizeInput = document.getElementById('propTextFontSize');
    const setTextFontSize = (sz) => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.fontSize = Math.max(10, Math.min(250, sz));
        if (textFontSizeInput) textFontSizeInput.value = el.fontSize;
        if (el.type === 'text') boardContext.updateTextElementBounds(el);
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    textFontSizeInput?.addEventListener('change', (e) => {
        setTextFontSize(parseInt(e.target.value, 10) || 20);
    });
    document.getElementById('btnPropTextFontDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setTextFontSize((el.fontSize || 20) - 2);
    });
    document.getElementById('btnPropTextFontUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setTextFontSize((el.fontSize || 20) + 2);
    });

    document.getElementById('btnPropTextBold')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isBold = !el.isBold;
        if (el.type === 'text') boardContext.updateTextElementBounds(el);
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });
    document.getElementById('btnPropTextItalic')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isItalic = !el.isItalic;
        if (el.type === 'text') boardContext.updateTextElementBounds(el);
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });
    document.getElementById('btnPropTextUnderline')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.isUnderline = !el.isUnderline;
        if (el.type === 'text') boardContext.updateTextElementBounds(el);
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        updatePropertiesPanel();
        boardContext.updateFormattingBar();
    });

    document.getElementById('btnPropTextAlignLeft')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'left';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropTextAlignCenter')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'center';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });
    document.getElementById('btnPropTextAlignRight')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) {
            boardContext.pushUndoState();
            el.textAlign = 'right';
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
            boardContext.updateFormattingBar();
        }
    });

    // Text Size Preset Pills (Header: 100, Title: 70, Subtitle: 50)
    document.querySelectorAll('.btn-text-size-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const sz = parseInt(btn.dataset.size, 10);
            if (sz) {
                setTextFontSize(sz);
                updatePropertiesPanel();
            }
        });
    });

    // 10. Sticky Note Inputs
    const stickyTextInput = document.getElementById('propStickyTextInput');
    stickyTextInput?.addEventListener('input', (e) => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'sticky') {
            el.text = e.target.value;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });
    stickyTextInput?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
    });

    const stickyFontSizeInput = document.getElementById('propStickyFontSize');
    stickyFontSizeInput?.addEventListener('change', (e) => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'sticky') {
            boardContext.pushUndoState();
            el.fontSize = Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 16));
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });
    document.getElementById('btnPropStickyFontDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'sticky') {
            boardContext.pushUndoState();
            el.fontSize = Math.max(10, (el.fontSize || 16) - 2);
            if (stickyFontSizeInput) stickyFontSizeInput.value = el.fontSize;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });
    document.getElementById('btnPropStickyFontUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'sticky') {
            boardContext.pushUndoState();
            el.fontSize = Math.min(100, (el.fontSize || 16) + 2);
            if (stickyFontSizeInput) stickyFontSizeInput.value = el.fontSize;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
        }
    });

    document.getElementById('btnPropStickyAlignLeft')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) { el.textAlign = 'left'; boardContext.renderCanvas(); boardContext.scheduleAutoSave(); updatePropertiesPanel(); }
    });
    document.getElementById('btnPropStickyAlignCenter')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) { el.textAlign = 'center'; boardContext.renderCanvas(); boardContext.scheduleAutoSave(); updatePropertiesPanel(); }
    });
    document.getElementById('btnPropStickyAlignRight')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) { el.textAlign = 'right'; boardContext.renderCanvas(); boardContext.scheduleAutoSave(); updatePropertiesPanel(); }
    });

    // 11. Line & Connector
    const lineThicknessSlider = document.getElementById('propSliderLineThickness');
    const lineThicknessVal = document.getElementById('propLineThicknessVal');
    const setLineThickness = (w) => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        el.strokeWidth = Math.max(1, Math.min(24, w));
        if (lineThicknessSlider) lineThicknessSlider.value = el.strokeWidth;
        if (lineThicknessVal) lineThicknessVal.innerText = `${el.strokeWidth}px`;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    lineThicknessSlider?.addEventListener('input', (e) => {
        const w = parseFloat(e.target.value) || 2.5;
        if (lineThicknessVal) lineThicknessVal.innerText = `${w}px`;
        const el = getSingleSelectedElement();
        if (el) { el.strokeWidth = w; boardContext.renderCanvas(); }
    });
    lineThicknessSlider?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    });

    document.getElementById('btnPropLineThicknessDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setLineThickness((el.strokeWidth !== undefined ? el.strokeWidth : 2.5) - 1);
    });
    document.getElementById('btnPropLineThicknessUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setLineThickness((el.strokeWidth !== undefined ? el.strokeWidth : 2.5) + 1);
    });

    document.querySelectorAll('.prop-style-toggle[data-line-stroke-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-line-stroke-style');
            const el = getSingleSelectedElement();
            if (el) {
                boardContext.pushUndoState();
                el.strokeStyle = style;
                boardContext.renderCanvas();
                boardContext.scheduleAutoSave();
                updatePropertiesPanel();
            }
        });
    });

    document.querySelectorAll('.prop-style-toggle[data-arrow-end-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            const arrowType = btn.getAttribute('data-arrow-end-type');
            const el = getSingleSelectedElement();
            if (el) {
                boardContext.pushUndoState();
                if (arrowType === 'end') {
                    el.type = 'arrow';
                    el.arrowHead = 'end';
                } else {
                    el.type = 'line';
                    el.arrowHead = 'none';
                }
                boardContext.renderCanvas();
                boardContext.scheduleAutoSave();
                updatePropertiesPanel();
            }
        });
    });

    // 12. Draw / Pen Stroke Size
    const drawSizeSlider = document.getElementById('propSliderDrawSize');
    const drawSizeVal = document.getElementById('propDrawSizeVal');
    const setDrawSize = (sz) => {
        const el = getSingleSelectedElement();
        if (!el) return;
        boardContext.pushUndoState();
        const finalSz = Math.max(1, Math.min(30, sz));
        if (el.type === 'draw') el.size = finalSz;
        else if (el.type === 'path') el.strokeWidth = finalSz;
        if (drawSizeSlider) drawSizeSlider.value = finalSz;
        if (drawSizeVal) drawSizeVal.innerText = `${finalSz}px`;
        boardContext.renderCanvas();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    };

    drawSizeSlider?.addEventListener('input', (e) => {
        const sz = parseInt(e.target.value, 10);
        if (drawSizeVal) drawSizeVal.innerText = `${sz}px`;
        const el = getSingleSelectedElement();
        if (el) {
            if (el.type === 'draw') el.size = sz;
            else if (el.type === 'path') el.strokeWidth = sz;
            boardContext.renderCanvas();
        }
    });
    drawSizeSlider?.addEventListener('change', () => {
        boardContext.pushUndoState();
        boardContext.scheduleAutoSave();
        boardContext.updateFormattingBar();
    });

    document.getElementById('btnPropDrawSizeDown')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setDrawSize((el.size || el.strokeWidth || 4) - 1);
    });
    document.getElementById('btnPropDrawSizeUp')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el) setDrawSize((el.size || el.strokeWidth || 4) + 1);
    });

    // 13. Image Aspect Ratio Reset
    document.getElementById('btnPropResetImageAspect')?.addEventListener('click', () => {
        const el = getSingleSelectedElement();
        if (el && el.type === 'image' && el.originalWidth && el.originalHeight) {
            boardContext.pushUndoState();
            el.height = Math.round(el.width * (el.originalHeight / el.originalWidth));
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            updatePropertiesPanel();
        }
    });

    // 14. Multi Selection Alignment Grid
    document.querySelectorAll('.prop-align-action-btn[data-align-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-align-action');
            alignSelectedElements(action);
        });
    });

    // 15. Magnet Snapping Button on Empty State
    document.getElementById('btnPropToggleMagnet')?.addEventListener('click', () => {
        boardContext.isMagnetSnapping = !boardContext.isMagnetSnapping;
        const topbarMagnet = document.getElementById('btnSnapMagnet');
        topbarMagnet?.classList.toggle('is-magnet-active', boardContext.isMagnetSnapping);
        const magnetBtn = document.getElementById('btnPropToggleMagnet');
        magnetBtn?.classList.toggle('active', boardContext.isMagnetSnapping);
        const magnetLabel = document.getElementById('propMagnetStatusLabel');
        if (magnetLabel) magnetLabel.innerText = boardContext.isMagnetSnapping ? 'Magnet Snapping On' : 'Magnet Snapping Off';
    });

    // 16. Arrange & Actions
    document.getElementById('btnPropBringFront')?.addEventListener('click', () => {
        window.bringSelectedToFront();
    });
    document.getElementById('btnPropSendBack')?.addEventListener('click', () => {
        window.sendSelectedToBack();
    });
    document.getElementById('btnPropDuplicate')?.addEventListener('click', () => {
        window.duplicateSelectedElements();
    });
    document.getElementById('btnPropDelete')?.addEventListener('click', () => {
        window.deleteSelectedElements();
    });
}

function alignSelectedElements(action) {
    if (boardContext.selectedElementIds.size < 2) return;
    const selected = getSelectedElementsList();
    if (selected.length < 2) return;

    boardContext.pushUndoState();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    selected.forEach(el => {
        const w = el.width || 0;
        const h = el.height || 0;
        minX = Math.min(minX, el.x);
        maxX = Math.max(maxX, el.x + w);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + h);
    });

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    selected.forEach(el => {
        const w = el.width || 0;
        const h = el.height || 0;
        switch (action) {
            case 'left':
                el.x = minX;
                break;
            case 'center':
                el.x = midX - w / 2;
                break;
            case 'right':
                el.x = maxX - w;
                break;
            case 'top':
                el.y = minY;
                break;
            case 'middle':
                el.y = midY - h / 2;
                break;
            case 'bottom':
                el.y = maxY - h;
                break;
        }
    });

    boardContext.renderCanvas();
    boardContext.scheduleAutoSave();
    updatePropertiesPanel();
}

export function updatePropertiesPanel() {
    const inspectorSelection = boardContext.elements.filter(el => boardContext.selectedElementIds.has(el.id));
    const inspectorElement = inspectorSelection.length === 1 ? inspectorSelection[0] : null;
    const inspectorShape = inspectorElement && (inspectorElement.type === 'shape' || (inspectorElement.type === 'path' && inspectorElement.closed && inspectorElement.sourceShapeType === 'custom'));
    document.getElementById('propSectionAppearance')?.classList.toggle('hidden', !inspectorSelection.length);
    document.getElementById('propSectionBorder')?.classList.toggle('hidden', !inspectorShape);
    const spacingInput = document.getElementById('propBorderSpacing');
    ['propDashLength', 'propDashRotation'].forEach(id => {
        const input = document.getElementById(id);
        if (!input || !inspectorElement) return;
        input.disabled = inspectorElement.strokeStyle !== 'dashed';
        if (document.activeElement !== input) input.value = id === 'propDashLength'
            ? inspectorElement.dashLength ?? Math.max(6, (inspectorElement.strokeWidth || 2) * 3)
            : inspectorElement.dashRotation || 0;
    });
    if (spacingInput && inspectorElement) {
        if (document.activeElement !== spacingInput) spacingInput.value = inspectorElement.borderSpacing ?? 6;
        spacingInput.disabled = inspectorElement.strokeStyle !== 'dashed';
    }
    const shapeFontInput = document.getElementById('propShapeFontFamily');
    if (shapeFontInput && inspectorShape) shapeFontInput.value = inspectorElement.fontFamily || "'Inter', sans-serif";
    const groupSelection = boardContext.elements.filter(el => boardContext.selectedElementIds.has(el.id));
    const sameGroup = groupSelection.length > 1 && groupSelection[0].groupId && groupSelection.every(el => el.groupId === groupSelection[0].groupId);
    const groupButton = document.getElementById('btnPropGroup');
    const ungroupButton = document.getElementById('btnPropUngroup');
    if (groupButton) groupButton.disabled = Boolean(boardContext.currentBoard?.isReadOnly || groupSelection.length < 2 || sameGroup);
    if (ungroupButton) ungroupButton.disabled = Boolean(boardContext.currentBoard?.isReadOnly || !groupSelection.some(el => el.groupId));
    const selectedPath = getSingleSelectedElement();
    const canConvert = !boardContext.currentBoard?.isReadOnly && selectedPath?.type === 'path' && selectedPath.points?.length >= 3 && !(selectedPath.closed && selectedPath.sourceShapeType === 'custom');
    ['btnConvertPathToShape', 'btnPropConvertPathToShape'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', !canConvert);
    });
    const panel = document.getElementById('boardPropertiesPanel');
    if (!panel || panel.classList.contains('hidden')) return;

    const count = boardContext.selectedElementIds.size;
    const headerTitle = document.getElementById('propHeaderTitle');
    const headerBadge = document.getElementById('propHeaderBadge');
    const headerIcon = document.getElementById('propHeaderIcon');

    const secTransform = document.getElementById('propSectionTransform');
    const secShape = document.getElementById('propSectionShape');
    const secShapeText = document.getElementById('propSectionShapeText');
    const secText = document.getElementById('propSectionText');
    const secSticky = document.getElementById('propSectionSticky');
    const secLine = document.getElementById('propSectionLine');
    const secDraw = document.getElementById('propSectionDraw');
    const secImage = document.getElementById('propSectionImage');
    const secMulti = document.getElementById('propSectionMulti');
    const secCanvas = document.getElementById('propSectionCanvas');
    const secActions = document.getElementById('propSectionActions');

    // Case 0: Empty Selection -> Canvas Settings
    if (count === 0) {
        if (headerTitle) headerTitle.innerText = 'Properties';
        if (headerBadge) headerBadge.innerText = 'Canvas';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';
        }

        secTransform?.classList.add('hidden');
        secShape?.classList.add('hidden');
        secShapeText?.classList.add('hidden');
        secText?.classList.add('hidden');
        secSticky?.classList.add('hidden');
        secLine?.classList.add('hidden');
        secDraw?.classList.add('hidden');
        secImage?.classList.add('hidden');
        secMulti?.classList.add('hidden');
        secActions?.classList.add('hidden');
        secCanvas?.classList.remove('hidden');

        // Update canvas statistics
        const countBadge = document.getElementById('propCanvasElementCount');
        if (countBadge) countBadge.innerText = String(boardContext.elements.length);

        const magnetBtn = document.getElementById('btnPropToggleMagnet');
        magnetBtn?.classList.toggle('active', Boolean(boardContext.isMagnetSnapping));
        const magnetLabel = document.getElementById('propMagnetStatusLabel');
        if (magnetLabel) magnetLabel.innerText = boardContext.isMagnetSnapping ? 'Magnet Snapping On' : 'Magnet Snapping Off';
        return;
    }

    // Case > 1: Multi Selection
    if (count > 1) {
        if (headerTitle) headerTitle.innerText = sameGroup ? 'Group' : 'Selection';
        if (headerBadge) headerBadge.innerText = `${count} Items`;
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
        }

        secCanvas?.classList.add('hidden');
        secShape?.classList.add('hidden');
        secShapeText?.classList.add('hidden');
        secText?.classList.add('hidden');
        secSticky?.classList.add('hidden');
        secLine?.classList.add('hidden');
        secDraw?.classList.add('hidden');
        secImage?.classList.add('hidden');

        secTransform?.classList.remove('hidden');
        secMulti?.classList.remove('hidden');
        secActions?.classList.remove('hidden');

        const multiText = document.getElementById('propMultiCountText');
        if (multiText) multiText.innerText = `${count} boardContext.elements currently selected`;

        const fillElements = groupSelection.filter(supportsMultiFill);
        const textElements = groupSelection.filter(supportsMultiTextColor);
        const borderElements = groupSelection.filter(supportsMultiBorder);
        document.getElementById('propMultiFillGroup')?.classList.toggle('hidden', !fillElements.length);
        document.getElementById('propMultiTextGroup')?.classList.toggle('hidden', !textElements.length);
        document.getElementById('propMultiBorderGroup')?.classList.toggle('hidden', !borderElements.length);

        if (fillElements.length) {
            const fillColor = sharedSelectionValue(fillElements, el => el.type === 'sticky' ? el.color : el.fillColor);
            renderColorSwatches('propMultiFillSwatches', ['transparent', '#ffffff', '#fef08a', '#fbcfe8', '#bbf7d0', '#bae6fd', '#e9d5ff', '#fed7aa', '#cbd5e1', '#1e293b'], fillColor, (color, isLive = false) => {
                applyMultiProperty(supportsMultiFill, el => {
                    if (el.type === 'sticky') el.color = color;
                    else el.fillColor = color;
                }, isLive);
            });
        }
        if (textElements.length) {
            const textColor = sharedSelectionValue(textElements, el => el.type === 'text' ? (el.color || el.textColor || '#0f172a') : (el.textColor || '#0f172a'));
            renderColorSwatches('propMultiTextSwatches', ['#0f172a', '#1e5eff', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ffffff'], textColor, (color, isLive = false) => {
                applyMultiProperty(supportsMultiTextColor, el => {
                    el.textColor = color;
                    if (el.type === 'text') el.color = color;
                }, isLive);
            });
        }
        if (borderElements.length) {
            const borderColor = sharedSelectionValue(borderElements, el => el.strokeColor);
            renderColorSwatches('propMultiBorderSwatches', ['transparent', '#0f172a', '#1e5eff', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#64748b', '#ffffff'], borderColor, (color, isLive = false) => {
                applyMultiProperty(supportsMultiBorder, el => { el.strokeColor = color; }, isLive);
            });
            const borderWidth = document.getElementById('propMultiBorderWidth');
            if (borderWidth && document.activeElement !== borderWidth) {
                borderWidth.value = sharedSelectionValue(borderElements, el => el.strokeWidth ?? 2) ?? '';
            }
            const strokeStyle = sharedSelectionValue(borderElements, el => el.strokeStyle || 'solid');
            document.querySelectorAll('[data-multi-stroke-style]').forEach(button => {
                button.classList.toggle('active', button.dataset.multiStrokeStyle === strokeStyle);
            });
        }

        // Hide rotation and coordinates for heterogeneous multi-selection
        const groupRot = document.getElementById('propGroupRotation');
        if (groupRot) groupRot.style.display = 'none';
        return;
    }

    // Case 1: Single Element Selected
    const el = getSingleSelectedElement();
    if (!el) return;

    secCanvas?.classList.add('hidden');
    secMulti?.classList.add('hidden');
    secTransform?.classList.remove('hidden');
    secActions?.classList.remove('hidden');

    const groupRot = document.getElementById('propGroupRotation');
    if (groupRot) groupRot.style.display = (el.type === 'line' || el.type === 'arrow') ? 'none' : '';

    // 1. Sync Geometry Inputs (if not actively being typed by user)
    const activeElem = document.activeElement;
    const inpX = document.getElementById('propInputX');
    const inpY = document.getElementById('propInputY');
    const inpW = document.getElementById('propInputW');
    const inpH = document.getElementById('propInputH');

    if (inpX && activeElem !== inpX) inpX.value = Math.round(el.x || 0);
    if (inpY && activeElem !== inpY) inpY.value = Math.round(el.y || 0);
    if (inpW && activeElem !== inpW) inpW.value = Math.round(el.width || 0);
    if (inpH && activeElem !== inpH) inpH.value = Math.round(el.height || 0);

    // 2. Sync Rotation
    const rotSlider = document.getElementById('propSliderRotation');
    const rotInput = document.getElementById('propInputRotation');
    const currentRot = Math.round(el.rotation || 0);
    if (rotSlider && activeElem !== rotSlider) rotSlider.value = currentRot;
    if (rotInput && activeElem !== rotInput) rotInput.value = currentRot;

    // 2b. Sync Origin Point (Pivot)
    const groupOrigin = document.getElementById('propGroupOrigin');
    if (groupOrigin) groupOrigin.style.display = (el.type === 'line' || el.type === 'arrow' || el.type === 'draw') ? 'none' : '';

    const origPt = boardContext.getElementOrigin(el);
    const inpOX = document.getElementById('propInputOriginX');
    const inpOY = document.getElementById('propInputOriginY');
    if (inpOX && activeElem !== inpOX) inpOX.value = Math.round(origPt.x);
    if (inpOY && activeElem !== inpOY) inpOY.value = Math.round(origPt.y);

    // 3. Sync Opacity
    const opSlider = document.getElementById('propSliderOpacity');
    const opBadge = document.getElementById('propLabelOpacity');
    const currentOp = Math.round((el.opacity !== undefined ? el.opacity : 1) * 100);
    if (opSlider && activeElem !== opSlider) opSlider.value = currentOp;
    if (opBadge) opBadge.innerText = `${currentOp}%`;

    // 4. Element Specific Sections
    const isCustomShape = el.type === 'path' && el.closed && el.sourceShapeType === 'custom';
    secShape?.classList.toggle('hidden', el.type !== 'shape' && !isCustomShape);
    secShapeText?.classList.toggle('hidden', el.type !== 'shape' && !isCustomShape);
    secText?.classList.toggle('hidden', el.type !== 'text');
    secSticky?.classList.toggle('hidden', el.type !== 'sticky');
    secLine?.classList.toggle('hidden', el.type !== 'line' && el.type !== 'arrow');
    secDraw?.classList.toggle('hidden', isCustomShape || (el.type !== 'draw' && el.type !== 'path'));
    secImage?.classList.toggle('hidden', el.type !== 'image');

    // --- TYPE: SHAPE ---
    if (el.type === 'shape' || isCustomShape) {
        if (headerTitle) headerTitle.innerText = 'Shape';
        if (headerBadge) headerBadge.innerText = isCustomShape ? 'Custom Vector' : el.shapeType || 'Rectangle';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>';
        }

        // Shape Type
        const shapeSelect = document.getElementById('propSelectShapeType');
        shapeSelect?.parentElement.classList.toggle('hidden', isCustomShape);
        if (shapeSelect) shapeSelect.value = el.shapeType || 'rectangle';
        const supportsRadius = isCustomShape || ['rectangle', 'rounded-rect'].includes(el.shapeType);
        document.getElementById('propGroupCornerRadius')?.classList.toggle('hidden', !supportsRadius);
        const radiusInput = document.getElementById('propCornerRadius');
        if (radiusInput && activeElem !== radiusInput) {
            radiusInput.max = Math.min(el.width || 120, el.height || 80) / 2;
            radiusInput.value = Math.min(el.cornerRadius ?? (el.shapeType === 'rounded-rect' ? 14 : 0), Number(radiusInput.max));
        }

        // Fill Swatches
        const fillPalette = ['transparent', '#ffffff', '#fef08a', '#fbcfe8', '#bbf7d0', '#bae6fd', '#e9d5ff', '#fed7aa', '#cbd5e1', '#1e293b'];
        renderColorSwatches('propShapeFillSwatches', fillPalette, el.fillColor, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.fillColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        // Border Swatches
        const borderPalette = ['transparent', '#0f172a', '#1e5eff', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#64748b', '#ffffff'];
        renderColorSwatches('propShapeBorderSwatches', borderPalette, el.strokeColor, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.strokeColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        // Border Thickness & Style
        const borderSlider = document.getElementById('propSliderShapeBorder');
        const borderVal = document.getElementById('propShapeThicknessVal');
        const strokeW = el.strokeWidth !== undefined ? el.strokeWidth : 2;
        if (borderSlider && activeElem !== borderSlider) borderSlider.value = strokeW;
        if (borderVal) borderVal.innerText = `${strokeW}px`;

        document.querySelectorAll('.prop-style-toggle[data-shape-stroke-style]').forEach(btn => {
            const st = btn.getAttribute('data-shape-stroke-style');
            btn.classList.toggle('active', (el.strokeStyle || 'solid') === st);
        });

        // Text Inside Shape
        const shapeTextInput = document.getElementById('propShapeTextInput');
        if (shapeTextInput && activeElem !== shapeTextInput) {
            shapeTextInput.value = el.text || '';
        }

        const textColorPalette = ['#0f172a', '#1e5eff', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ffffff'];
        renderColorSwatches('propShapeTextSwatches', textColorPalette, el.textColor || '#0f172a', (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.textColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const shapeFontSize = document.getElementById('propShapeFontSize');
        if (shapeFontSize && activeElem !== shapeFontSize) {
            shapeFontSize.value = el.fontSize || 15;
        }

        document.getElementById('btnPropShapeBold')?.classList.toggle('active', Boolean(el.isBold));
        document.getElementById('btnPropShapeItalic')?.classList.toggle('active', Boolean(el.isItalic));
        document.getElementById('btnPropShapeUnderline')?.classList.toggle('active', Boolean(el.isUnderline));

        const hAlign = el.textAlign || 'center';
        document.getElementById('btnPropShapeAlignLeft')?.classList.toggle('active', hAlign === 'left');
        document.getElementById('btnPropShapeAlignCenter')?.classList.toggle('active', hAlign === 'center');
        document.getElementById('btnPropShapeAlignRight')?.classList.toggle('active', hAlign === 'right');

        const vAlign = el.textVAlign || 'middle';
        document.getElementById('btnPropShapeAlignTop')?.classList.toggle('active', vAlign === 'top');
        document.getElementById('btnPropShapeAlignMiddle')?.classList.toggle('active', vAlign === 'middle' || vAlign === 'center');
        document.getElementById('btnPropShapeAlignBottom')?.classList.toggle('active', vAlign === 'bottom');
    }

    // --- TYPE: STANDALONE TEXT ---
    else if (el.type === 'text') {
        if (headerTitle) headerTitle.innerText = 'Text';
        if (headerBadge) headerBadge.innerText = 'Typography';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="12" y1="4" x2="12" y2="20"></line><line x1="8" y1="20" x2="16" y2="20"></line></svg>';
        }

        const textInput = document.getElementById('propTextInput');
        if (textInput && activeElem !== textInput) {
            textInput.value = el.text || '';
        }

        const fontSelect = document.getElementById('propSelectFontFamily');
        if (fontSelect && el.fontFamily) {
            fontSelect.value = el.fontFamily;
        }

        const textColorPalette = ['#0f172a', '#1e5eff', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ffffff'];
        renderColorSwatches('propTextColorSwatches', textColorPalette, el.color || el.textColor || '#0f172a', (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.color = newColor;
            el.textColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const textFontSize = document.getElementById('propTextFontSize');
        if (textFontSize && activeElem !== textFontSize) {
            textFontSize.value = el.fontSize || 20;
        }

        document.getElementById('btnPropTextBold')?.classList.toggle('active', Boolean(el.isBold));
        document.getElementById('btnPropTextItalic')?.classList.toggle('active', Boolean(el.isItalic));
        document.getElementById('btnPropTextUnderline')?.classList.toggle('active', Boolean(el.isUnderline));

        const align = el.textAlign || 'left';
        document.getElementById('btnPropTextAlignLeft')?.classList.toggle('active', align === 'left');
        document.getElementById('btnPropTextAlignCenter')?.classList.toggle('active', align === 'center');
        document.getElementById('btnPropTextAlignRight')?.classList.toggle('active', align === 'right');

        // Text Size Preset Pills active state
        const currentFontSize = el.fontSize || 20;
        document.querySelectorAll('.btn-text-size-preset').forEach(btn => {
            const sz = parseInt(btn.dataset.size, 10);
            btn.classList.toggle('active', sz === currentFontSize);
        });
    }

    // --- TYPE: STICKY NOTE ---
    else if (el.type === 'sticky') {
        if (headerTitle) headerTitle.innerText = 'Sticky Note';
        if (headerBadge) headerBadge.innerText = 'Note';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
        }

        const stickyTextInput = document.getElementById('propStickyTextInput');
        if (stickyTextInput && activeElem !== stickyTextInput) {
            stickyTextInput.value = el.text || '';
        }

        const stickyBgPalette = boardContext.STICKY_COLORS.map(s => s.bg);
        renderColorSwatches('propStickyColorSwatches', stickyBgPalette, el.color, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.color = newColor;
            const match = boardContext.STICKY_COLORS.find(s => s.bg.toLowerCase() === newColor.toLowerCase());
            if (match) el.textColor = match.text;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const textColorPalette = ['#0f172a', '#713f12', '#831843', '#14532d', '#0c4a6e', '#581c87', '#f8fafc'];
        renderColorSwatches('propStickyTextColorSwatches', textColorPalette, el.textColor, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.textColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const stickyFontSize = document.getElementById('propStickyFontSize');
        if (stickyFontSize && activeElem !== stickyFontSize) {
            stickyFontSize.value = el.fontSize || 16;
        }

        const align = el.textAlign || 'left';
        document.getElementById('btnPropStickyAlignLeft')?.classList.toggle('active', align === 'left');
        document.getElementById('btnPropStickyAlignCenter')?.classList.toggle('active', align === 'center');
        document.getElementById('btnPropStickyAlignRight')?.classList.toggle('active', align === 'right');
    }

    // --- TYPE: LINE & ARROW ---
    else if (el.type === 'line' || el.type === 'arrow') {
        if (headerTitle) headerTitle.innerText = el.type === 'arrow' ? 'Arrow' : 'Line';
        if (headerBadge) headerBadge.innerText = 'Vector';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"></line><polyline points="9 5 19 5 19 15"></polyline></svg>';
        }

        const linePalette = ['#1e5eff', '#0f172a', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#ffffff'];
        renderColorSwatches('propLineColorSwatches', linePalette, el.strokeColor, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            el.strokeColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const lineSlider = document.getElementById('propSliderLineThickness');
        const lineVal = document.getElementById('propLineThicknessVal');
        const strokeW = el.strokeWidth !== undefined ? el.strokeWidth : 2.5;
        if (lineSlider && activeElem !== lineSlider) lineSlider.value = strokeW;
        if (lineVal) lineVal.innerText = `${strokeW}px`;

        document.querySelectorAll('.prop-style-toggle[data-line-stroke-style]').forEach(btn => {
            const st = btn.getAttribute('data-line-stroke-style');
            btn.classList.toggle('active', (el.strokeStyle || 'solid') === st);
        });

        document.querySelectorAll('.prop-style-toggle[data-arrow-end-type]').forEach(btn => {
            const at = btn.getAttribute('data-arrow-end-type');
            const isArrow = el.type === 'arrow' || el.arrowHead === 'end';
            btn.classList.toggle('active', (at === 'end' && isArrow) || (at === 'none' && !isArrow));
        });
    }

    // --- TYPE: FREEHAND DRAW / PEN / PATH ---
    else if (el.type === 'draw' || el.type === 'path') {
        const isHighlighter = Boolean(el.isHighlighter);
        if (headerTitle) headerTitle.innerText = isHighlighter ? 'Highlighter' : 'Pen Drawing';
        if (headerBadge) headerBadge.innerText = el.type === 'path' ? 'Path' : 'Freehand';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path></svg>';
        }

        const drawPalette = ['#1e293b', '#1e5eff', '#ef4444', '#10b981', '#8b5cf6', '#facc15', '#ffffff'];
        renderColorSwatches('propDrawColorSwatches', drawPalette, el.color || el.strokeColor, (newColor, isLive = false) => {
            if (!isLive) boardContext.pushUndoState();
            if (el.type === 'draw') el.color = newColor;
            else if (el.type === 'path') el.strokeColor = newColor;
            boardContext.renderCanvas();
            boardContext.scheduleAutoSave();
            if (!isLive) {
                updatePropertiesPanel();
                boardContext.updateFormattingBar();
            }
        });

        const drawSlider = document.getElementById('propSliderDrawSize');
        const drawVal = document.getElementById('propDrawSizeVal');
        const strokeW = el.size || el.strokeWidth || 4;
        if (drawSlider && activeElem !== drawSlider) drawSlider.value = strokeW;
        if (drawVal) drawVal.innerText = `${strokeW}px`;
    }

    // --- TYPE: IMAGE ---
    else if (el.type === 'image') {
        if (headerTitle) headerTitle.innerText = 'Image';
        if (headerBadge) headerBadge.innerText = 'Bitmap';
        if (headerIcon) {
            headerIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        }
    }
}

