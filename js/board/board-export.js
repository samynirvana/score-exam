// ==========================================================================
// BOARD-EXPORT.JS - Export & Canvas Rendering Utilities
// ==========================================================================

/**
 * Exports the current whiteboard canvas element as a PNG download
 * @param {string} boardTitle - Title of the current board
 * @param {HTMLCanvasElement} canvasElement - Canvas DOM node
 */
export function exportCanvasAsPNG(boardTitle, canvasElement) {
    const canvas = canvasElement || document.getElementById('whiteboardCanvas');
    if (!canvas) return;
    const sanitizedTitle = (boardTitle || 'board').replace(/[^a-z0-9]/gi, '_');
    const link = document.createElement('a');
    link.download = `${sanitizedTitle}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}
