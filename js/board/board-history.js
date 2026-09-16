// ==========================================================================
// BOARD-HISTORY.JS - Undo / Redo Manager
// ==========================================================================

export class HistoryManager {
    constructor(maxDepth = 30) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxDepth = maxDepth;
    }

    pushState(elements) {
        this.undoStack.push(JSON.stringify(elements));
        this.redoStack = [];
        if (this.undoStack.length > this.maxDepth) {
            this.undoStack.shift();
        }
    }

    undo(currentElements) {
        if (this.undoStack.length === 0) return null;
        this.redoStack.push(JSON.stringify(currentElements));
        const previousStateJson = this.undoStack.pop();
        return JSON.parse(previousStateJson);
    }

    redo(currentElements) {
        if (this.redoStack.length === 0) return null;
        this.undoStack.push(JSON.stringify(currentElements));
        const nextStateJson = this.redoStack.pop();
        return JSON.parse(nextStateJson);
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }
}
