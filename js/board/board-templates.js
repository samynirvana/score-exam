// ==========================================================================
// BOARD-TEMPLATES.JS - Predefined Whiteboard Template Layouts
// ==========================================================================

/**
 * Generates initial canvas elements for a selected board template
 * @param {string} templateName - Name of the template ('Sticky Brainstorming', 'Cornell Notes', 'Mind Map', etc.)
 * @returns {Array} Array of whiteboard element objects
 */
export function generateTemplateElements(templateName) {
    const timestamp = Date.now();
    switch (templateName) {
        case 'Sticky Brainstorming':
            return [
                { id: `el-${timestamp}-1`, type: 'text', x: 200, y: 80, width: 400, height: 50, text: 'Brainstorming Session', fontSize: 28, fontFamily: 'Outfit, sans-serif', color: '#1e293b', isBold: true },
                { id: `el-${timestamp}-2`, type: 'sticky', x: 100, y: 160, width: 180, height: 160, text: 'Idea 1:\nKey concept or focus point', color: '#fef08a', textColor: '#713f12', rotation: -2 },
                { id: `el-${timestamp}-3`, type: 'sticky', x: 320, y: 160, width: 180, height: 160, text: 'Idea 2:\nSupporting details & examples', color: '#fbcfe8', textColor: '#831843', rotation: 3 },
                { id: `el-${timestamp}-4`, type: 'sticky', x: 540, y: 160, width: 180, height: 160, text: 'Idea 3:\nAction items & next steps', color: '#bbf7d0', textColor: '#14532d', rotation: -1 }
            ];
        case 'Cornell Notes':
            return [
                { id: `el-${timestamp}-1`, type: 'shape', shapeType: 'rectangle', x: 80, y: 80, width: 680, height: 60, fillColor: 'rgba(30, 94, 255, 0.08)', strokeColor: '#1e5eff', strokeWidth: 2, text: 'Topic / Objective:' },
                { id: `el-${timestamp}-2`, type: 'shape', shapeType: 'rectangle', x: 80, y: 160, width: 220, height: 380, fillColor: '#ffffff', strokeColor: '#cbd5e1', strokeWidth: 2, text: 'Key Questions / Cues:\n\n• Point 1\n• Point 2' },
                { id: `el-${timestamp}-3`, type: 'shape', shapeType: 'rectangle', x: 320, y: 160, width: 440, height: 380, fillColor: '#ffffff', strokeColor: '#cbd5e1', strokeWidth: 2, text: 'Notes & Explanations:\n\nDetailed lecture notes, diagrams, and formulas go here.' },
                { id: `el-${timestamp}-4`, type: 'shape', shapeType: 'rectangle', x: 80, y: 560, width: 680, height: 120, fillColor: 'rgba(254, 240, 138, 0.25)', strokeColor: '#fde047', strokeWidth: 2, text: 'Summary:\nBrief synthesis of the main takeaways.' }
            ];
        case 'Mind Map':
            return [
                { id: `el-${timestamp}-1`, type: 'shape', shapeType: 'circle', x: 350, y: 240, width: 160, height: 160, fillColor: '#1e5eff', strokeColor: '#1e40af', strokeWidth: 3, textColor: '#ffffff', text: 'Central Topic' },
                { id: `el-${timestamp}-2`, type: 'shape', shapeType: 'rounded-rect', x: 100, y: 120, width: 140, height: 70, fillColor: '#fbcfe8', strokeColor: '#f472b6', strokeWidth: 2, text: 'Subtopic A' },
                { id: `el-${timestamp}-3`, type: 'shape', shapeType: 'rounded-rect', x: 620, y: 120, width: 140, height: 70, fillColor: '#bbf7d0', strokeColor: '#86efac', strokeWidth: 2, text: 'Subtopic B' },
                { id: `el-${timestamp}-4`, type: 'shape', shapeType: 'rounded-rect', x: 100, y: 380, width: 140, height: 70, fillColor: '#bae6fd', strokeColor: '#7dd3fc', strokeWidth: 2, text: 'Subtopic C' },
                { id: `el-${timestamp}-5`, type: 'shape', shapeType: 'rounded-rect', x: 620, y: 380, width: 140, height: 70, fillColor: '#fed7aa', strokeColor: '#fdba74', strokeWidth: 2, text: 'Subtopic D' }
            ];
        default:
            return [];
    }
}
