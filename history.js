// --- This module is now responsible for managing separate history stacks for each layer ---

// Use Maps to store history and redo stacks for each layer, keyed by layer ID.
let historyByLayer = new Map();
let redoStackByLayer = new Map();

/**
 * Creates a new history stack for a new layer.
 * @param {number} layerId - The ID of the new layer.
 * @param {CanvasRenderingContext2D} ctx - The context of the layer's canvas.
 * @param {HTMLCanvasElement} canvas - The layer's canvas element.
 */
export function initializeHistoryForLayer(layerId, ctx, canvas) {
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyByLayer.set(layerId, [initialState]);
    redoStackByLayer.set(layerId, []);
}

/**
 * Deletes the history for a layer that is being removed.
 * @param {number} layerId - The ID of the layer to remove.
 */
export function deleteHistoryForLayer(layerId) {
    historyByLayer.delete(layerId);
    redoStackByLayer.delete(layerId);
}

/**
 * Saves the current state of a specific layer to its history stack.
 * @param {number} layerId - The ID of the layer to save.
 * @param {CanvasRenderingContext2D} ctx - The layer's rendering context.
 * @param {HTMLCanvasElement} canvas - The layer's canvas element.
 */
export function saveState(layerId, ctx, canvas) {
    const history = historyByLayer.get(layerId);
    if (!history) return;

    redoStackByLayer.set(layerId, []); // Clear redo stack for this layer
    if (history.length > 30) {
        history.shift();
    }
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Restores a canvas context to a specific state from an ImageData object.
 * @param {CanvasRenderingContext2D} ctx - The context to restore to.
 * @param {ImageData} imageData - The pixel data to restore.
 */
function restoreState(ctx, imageData) {
    if (!imageData) return;
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Handles the undo action for a specific layer.
 * @param {number} layerId - The ID of the active layer.
 * @param {CanvasRenderingContext2D} ctx - The context of the active layer.
 */
export function undo(layerId, ctx) {
    const history = historyByLayer.get(layerId);
    const redoStack = redoStackByLayer.get(layerId);
    if (history && history.length > 1) {
        redoStack.push(history.pop());
        const prevState = history[history.length - 1];
        restoreState(ctx, prevState);
    }
}

/**
 * Handles the redo action for a specific layer.
 * @param {number} layerId - The ID of the active layer.
 * @param {CanvasRenderingContext2D} ctx - The context of the active layer.
 */
export function redo(layerId, ctx) {
    const history = historyByLayer.get(layerId);
    const redoStack = redoStackByLayer.get(layerId);
    if (redoStack && redoStack.length > 0) {
        const nextState = redoStack.pop();
        history.push(nextState);
        restoreState(ctx, nextState);
    }
}

/**
 * Gets the history length for a specific layer.
 * @param {number} layerId - The ID of the layer to check.
 * @returns {number}
 */
export function getHistoryLength(layerId) {
    return historyByLayer.get(layerId)?.length || 0;
}

/**
 * Gets the redo stack length for a specific layer.
 * @param {number} layerId - The ID of the layer to check.
 * @returns {number}
 */
export function getRedoStackLength(layerId) {
    return redoStackByLayer.get(layerId)?.length || 0;
}

