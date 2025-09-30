// --- This module is now responsible for managing separate history stacks for each layer ---

let historyByLayer = new Map();
let redoStackByLayer = new Map();

/** Creates a new history stack for a new layer. */
export function initializeHistoryForLayer(layerId, ctx, canvas) {
    const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyByLayer.set(layerId, [initialState]);
    redoStackByLayer.set(layerId, []);
}

/** Deletes the history for a layer that is being removed. */
export function deleteHistoryForLayer(layerId) {
    historyByLayer.delete(layerId);
    redoStackByLayer.delete(layerId);
}

/** Saves the current state of a specific layer to its history stack. */
export function saveState(layerId, ctx, canvas) {
    const history = historyByLayer.get(layerId);
    if (!history) return; 

    redoStackByLayer.set(layerId, []); 
    
    if (history.length > 30) {
        history.shift(); 
    }
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function restoreState(ctx, imageData) {
    if (!imageData) return;
    ctx.putImageData(imageData, 0, 0);
}

/** Handles the undo action for a specific layer. */
export function undo(layerId, ctx) {
    const history = historyByLayer.get(layerId);
    const redoStack = redoStackByLayer.get(layerId);
    if (history && history.length > 1) {
        redoStack.push(history.pop());
        const prevState = history[history.length - 1];
        restoreState(ctx, prevState);
    }
}

/** Handles the redo action for a specific layer. */
export function redo(layerId, ctx) {
    const history = historyByLayer.get(layerId);
    const redoStack = redoStackByLayer.get(layerId);
    if (redoStack && redoStack.length > 0) {
        const nextState = redoStack.pop();
        history.push(nextState);
        restoreState(ctx, nextState);
    }
}

/** Gets the history length for a specific layer. */
export function getHistoryLength(layerId) {
    return historyByLayer.get(layerId)?.length || 0;
}

/** Gets the redo stack length for a specific layer. */
export function getRedoStackLength(layerId) {
    return redoStackByLayer.get(layerId)?.length || 0;
}

/**
 * Gets the second-to-last state from a layer's history.
 * Used to get the state before the selection "cut" was made.
 */
export function getPenultimateState(layerId) {
    const history = historyByLayer.get(layerId);
    if (!history || history.length < 2) return null;
    return history[history.length - 2];
}

/**
 * MODIFIED: Gets the most recent state from a layer's history.
 * Used to get the state with the "hole" after a selection cut.
 */
export function getLastState(layerId) {
    const history = historyByLayer.get(layerId);
    if (!history || history.length < 1) return null;
    return history[history.length - 1];
}


/**
 * Replaces the last history state with a new array of states.
 * This is used to "inject" the granular selection history into the main history.
 */
export function replaceLastStateWithMultiple(layerId, newStates) {
    const history = historyByLayer.get(layerId);
    if (!history || newStates.length === 0) return;
    history.pop(); // Remove the single "cut" state
    history.push(...newStates); // Add the new granular states
}

