// --- Selection Management Module ---
// This module handles the state and logic for the lasso selection and move tools.

// A single object to hold the entire state of the selection.
// This makes it easy to manage and reset.
let selectionState = {
    isDrawing: false,       // Is a selection path currently being drawn by the user?
    isFloating: false,      // Is there a finalized selection that has been "lifted" from the canvas?
    path: [],               // An array of {x, y} points defining the lasso path.
    imageData: null,        // The raw pixel data of the selected area, once it's lifted.
    boundingBox: null,      // The original {x, y, width, height} of where the selection was lifted from.
    currentX: 0,            // The current top-left X position of the floating selection.
    currentY: 0,            // The current top-left Y position of the floating selection.
    moveStartX: 0,          // The starting X position of a mouse drag when moving the selection.
    moveStartY: 0,          // The starting Y position of a mouse drag when moving the selection.
};

/**
 * Starts a new selection process.
 * If a selection is already floating, it first commits (pastes) it down.
 * @param {number} x - The starting x-coordinate.
 * @param {number} y - The starting y-coordinate.
 * @param {function} onSelectionCommitted - A callback function to paste the old selection and save history.
 */
export function startSelection(x, y, onSelectionCommitted) {
    // If there's an existing floating selection, paste it before starting a new one.
    if (selectionState.isFloating) {
        onSelectionCommitted();
    }

    // Reset everything and start a new selection path.
    clearSelection();
    selectionState.isDrawing = true;
    selectionState.path = [{ x, y }];
}

/**
 * Adds a new point to the current lasso path as the user drags the mouse.
 * @param {number} x - The x-coordinate of the new point.
 * @param {number} y - The y-coordinate of the new point.
 */
export function addPointToSelection(x, y) {
    if (!selectionState.isDrawing || selectionState.isFloating) return;
    selectionState.path.push({ x, y });
}

/**
 * Finalizes the selection path when the user releases the mouse.
 * This function performs the "lift" operation.
 * @param {CanvasRenderingContext2D} activeLayerCtx - The context of the currently active layer.
 */
export function endSelection(activeLayerCtx) {
    // A selection needs at least 3 points to form a shape.
    if (selectionState.path.length < 3) {
        clearSelection();
        return;
    }
    
    // 1. Calculate the bounding box of the selection path.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectionState.path.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    if (width <= 0 || height <= 0) {
        clearSelection(); // Invalid selection.
        return;
    }

    selectionState.boundingBox = { x: minX, y: minY, width, height };

    // 2. Create a temporary, off-screen canvas to isolate the selected pixels.
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // 3. Copy the selected part of the active layer to the temp canvas.
    tempCtx.save();
    tempCtx.beginPath();
    // Translate the path coordinates to be relative to the temp canvas (top-left is 0,0).
    tempCtx.moveTo(selectionState.path[0].x - minX, selectionState.path[0].y - minY);
    for (let i = 1; i < selectionState.path.length; i++) {
        tempCtx.lineTo(selectionState.path[i].x - minX, selectionState.path[i].y - minY);
    }
    tempCtx.closePath();
    tempCtx.clip(); // Use the path as a clipping mask.
    // Draw the entire active layer, but only the part within the clip will be visible.
    // The negative offsets align the active layer with the temp canvas.
    tempCtx.drawImage(activeLayerCtx.canvas, -minX, -minY);
    tempCtx.restore();
    
    // 4. Grab the pixel data from the temp canvas. This is our floating selection.
    selectionState.imageData = tempCtx.getImageData(0, 0, width, height);

    // 5. Erase the selected area from the original active layer.
    activeLayerCtx.save();
    activeLayerCtx.beginPath();
    // Use the original path coordinates here.
    activeLayerCtx.moveTo(selectionState.path[0].x, selectionState.path[0].y);
    for (let i = 1; i < selectionState.path.length; i++) {
        activeLayerCtx.lineTo(selectionState.path[i].x, selectionState.path[i].y);
    }
    activeLayerCtx.closePath();
    // 'destination-out' acts like an eraser, keeping pixels outside the shape.
    activeLayerCtx.globalCompositeOperation = 'destination-out';
    activeLayerCtx.fill();
    activeLayerCtx.restore();

    // 6. Finalize the state for floating.
    // The path is now stored relative to the selection's top-left corner.
    selectionState.path = selectionState.path.map(p => ({ x: p.x - minX, y: p.y - minY }));
    selectionState.currentX = minX;
    selectionState.currentY = minY;
    selectionState.isDrawing = false;
    selectionState.isFloating = true;
}

/**
 * Pastes the currently floating selection data onto a layer.
 * @param {CanvasRenderingContext2D} activeLayerCtx - The context of the active layer.
 */
export function pasteSelection(activeLayerCtx) {
    if (!selectionState.isFloating || !selectionState.imageData) return;
    
    // Use another temporary canvas to turn the imageData back into a drawable source.
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selectionState.imageData.width;
    tempCanvas.height = selectionState.imageData.height;
    tempCanvas.getContext('2d').putImageData(selectionState.imageData, 0, 0);

    // Draw the temporary canvas (which holds the selection) onto the active layer.
    activeLayerCtx.drawImage(tempCanvas, selectionState.currentX, selectionState.currentY);
}

/**
 * Resets the selection state completely to its initial values.
 */
export function clearSelection() {
    selectionState = {
        isDrawing: false,
        isFloating: false,
        path: [],
        imageData: null,
        boundingBox: null,
        currentX: 0,
        currentY: 0,
        moveStartX: 0,
        moveStartY: 0,
    };
}

/**
 * Initializes the start of a move operation for a floating selection.
 * @param {number} x - The starting x-coordinate of the drag.
 * @param {number} y - The starting y-coordinate of the drag.
 */
export function startMove(x, y) {
    if (!selectionState.isFloating) return;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

/**
 * Updates the position of the selection based on mouse movement during a drag.
 * @param {number} x - The current x-coordinate of the drag.
 * @param {number} y - The current y-coordinate of the drag.
 */
export function moveSelection(x, y) {
    if (!selectionState.isFloating) return;
    const dx = x - selectionState.moveStartX; // Change in X
    const dy = y - selectionState.moveStartY; // Change in Y
    selectionState.currentX += dx;
    selectionState.currentY += dy;
    // Update the start position for the next move event.
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

/**
 * Checks if a point is inside the current floating selection's path using the ray-casting algorithm.
 * This is used to determine if the user is clicking inside the selection to move it.
 * @param {number} checkX - The x-coordinate to check.
 * @param {number} checkY - The y-coordinate to check.
 * @returns {boolean}
 */
export function isPointInSelection(checkX, checkY) {
    if (!selectionState.isFloating || !selectionState.path.length) return false;

    // The path points are relative to the selection's top-left corner, so we need to add the current position.
    const path = selectionState.path;
    const offsetX = selectionState.currentX;
    const offsetY = selectionState.currentY;
    let inside = false;

    // Standard Ray-Casting algorithm.
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const xi = path[i].x + offsetX;
        const yi = path[i].y + offsetY;
        const xj = path[j].x + offsetX;
        const yj = path[j].y + offsetY;

        const intersect = ((yi > checkY) !== (yj > checkY))
            && (checkX < (xj - xi) * (checkY - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Returns the current selection state for rendering purposes (e.g., drawing the marching ants).
 * @returns {object}
 */
export function getSelectionState() {
    return selectionState;
}