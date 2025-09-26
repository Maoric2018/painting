// --- State Variables ---
let history = [];
let redoStack = [];
const HISTORY_LIMIT = 30;

// --- Exported Functions ---

/**
 * Initializes the history with the first blank state.
 * @param {CanvasRenderingContext2D} ctx - The context of the drawing canvas.
 * @param {HTMLCanvasElement} canvas - The drawing canvas.
 */
export function initializeHistory(ctx, canvas) {
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history = [initialState];
    redoStack = [];
}

/**
 * Saves the current state of the drawing canvas to the history array.
 * @param {CanvasRenderingContext2D} ctx - The context of the drawing canvas.
 * @param {HTMLCanvasElement} canvas - The drawing canvas.
 */
export function saveState(ctx, canvas) {
    redoStack = []; // A new action clears the redo stack.
    if (history.length > HISTORY_LIMIT) {
        history.shift();
    }
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Restores the canvas to a specific state from an ImageData object.
 * @param {CanvasRenderingContext2D} ctx - The drawing canvas context.
 * @param {ImageData} imageData - The pixel data to restore.
 */
function restoreState(ctx, imageData) {
    if (imageData) {
        ctx.putImageData(imageData, 0, 0);
    }
}

/**
 * Handles the undo action.
 * @param {CanvasRenderingContext2D} ctx - The drawing canvas context.
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
 * @param {CanvasRenderingContext2D} ctx - The drawing canvas context.
 */
export function redo(ctx) {
    if (redoStack.length > 0) {
        const nextState = redoStack.pop();
        history.push(nextState);
        restoreState(ctx, nextState);
    }
}

/**
 * Returns the current length of the history stack.
 * @returns {number}
 */
export function getHistoryLength() {
    return history.length;
}

/**
 * Returns the current length of the redo stack.
 * @returns {number}
 */
export function getRedoStackLength() {
    return redoStack.length;
}

