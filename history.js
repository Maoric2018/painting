// --- This module is now responsible for managing separate history stacks for each layer ---

// Use Maps to store history and redo stacks for each layer, keyed by layer ID.
// A Map is used because it's efficient for associating a unique layer ID with its specific history stack.
let historyByLayer = new Map();
let redoStackByLayer = new Map();

/**
 * Creates a new history stack for a new layer.
 * This should be called every time a new layer is created.
 * @param {number} layerId - The unique ID of the new layer.
 * @param {CanvasRenderingContext2D} ctx - The context of the layer's canvas.
 * @param {HTMLCanvasElement} canvas - The layer's canvas element.
 */
export function initializeHistoryForLayer(layerId, ctx, canvas) {
    // Save the initial blank state of the canvas. This is the first entry in the history.
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyByLayer.set(layerId, [initialState]);
    redoStackByLayer.set(layerId, []); // The redo stack is initially empty.
}

/**
 * Deletes the history for a layer that is being removed.
 * This prevents memory leaks by cleaning up data for deleted layers.
 * @param {number} layerId - The ID of the layer to remove.
 */
export function deleteHistoryForLayer(layerId) {
    historyByLayer.delete(layerId);
    redoStackByLayer.delete(layerId);
}

/**
 * Saves the current state of a specific layer to its history stack.
 * This is called after any drawing operation (brush stroke, fill, etc.) is completed.
 * @param {number} layerId - The ID of the layer to save.
 * @param {CanvasRenderingContext2D} ctx - The layer's rendering context.
 * @param {HTMLCanvasElement} canvas - The layer's canvas element.
 */
export function saveState(layerId, ctx, canvas) {
    // Get the specific history stack for this layer.
    const history = historyByLayer.get(layerId);
    if (!history) return; // Exit if for some reason this layer has no history.

    // When a new action is performed, the redo stack for that layer must be cleared.
    redoStackByLayer.set(layerId, []); 
    
    // To prevent using too much memory, limit the history size.
    if (history.length > 30) {
        history.shift(); // Removes the oldest state from the beginning of the array.
    }
    // Add the current canvas state to the end of the history array.
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Restores a canvas context to a specific state from an ImageData object.
 * A helper function used by both undo and redo.
 * @param {CanvasRenderingContext2D} ctx - The context to restore to.
 * @param {ImageData} imageData - The pixel data to restore.
 */
function restoreState(ctx, imageData) {
    if (!imageData) return;
    // putImageData is a fast way to replace the entire canvas content with raw pixel data.
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
    // There must be more than one state to undo (the initial state cannot be undone).
    if (history && history.length > 1) {
        // Move the current state from the history stack to the redo stack.
        redoStack.push(history.pop());
        // Get the new "current" state, which is now the last item in the history.
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
    // Can only redo if there's something in the redo stack.
    if (redoStack && redoStack.length > 0) {
        // Pop the state to be restored from the redo stack.
        const nextState = redoStack.pop();
        // Push it back onto the history stack.
        history.push(nextState);
        // And apply it to the canvas.
        restoreState(ctx, nextState);
    }
}

/**
 * Gets the history length for a specific layer.
 * Used to enable/disable the undo button.
 * @param {number} layerId - The ID of the layer to check.
 * @returns {number}
 */
export function getHistoryLength(layerId) {
    return historyByLayer.get(layerId)?.length || 0;
}

/**
 * Gets the redo stack length for a specific layer.
 * Used to enable/disable the redo button.
 * @param {number} layerId - The ID of the layer to check.
 * @returns {number}
 */
export function getRedoStackLength(layerId) {
    return redoStackByLayer.get(layerId)?.length || 0;
}