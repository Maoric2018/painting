// --- State Variables ---
let history = [];
let redoStack = [];

// --- Exported Functions ---

/**
 * Saves the current state of the canvas to the history array.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 */
export function saveState(ctx, canvas) {
    redoStack = [];
    if (history.length > 30) {
        history.shift();
    }
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Restores the canvas to a specific state from an ImageData object.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {ImageData} imageData - The pixel data to restore.
 */
export function restoreState(ctx, imageData) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
}

/**
 * Handles the undo action.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 */
export function undo(ctx) {
    if (history.length > 1) {
        redoStack.push(history.pop());
        const prevState = history[history.length - 1];
        restoreState(ctx, prevState);
    }
}

/**
 * Handles the redo action.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 */
export function redo(ctx) {
    if (redoStack.length > 0) {
        const nextState = redoStack.pop();
        history.push(nextState);
        restoreState(ctx, nextState);
    }
}

/**
 * Initializes the history with the first blank state.
 * @param {ImageData} initialState - The initial blank canvas data.
 */
export function initializeHistory(initialState) {
    history = [initialState];
    redoStack = [];
}

/**
 * Gets the initial blank state of the canvas.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 * @returns {ImageData}
 */
export function getInitialState(ctx, canvas) {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// --- Getters for UI updates ---
export function getHistoryLength() {
    return history.length;
}

export function getRedoStackLength() {
    return redoStack.length;
}
