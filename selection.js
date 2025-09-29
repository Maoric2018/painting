// --- Selection Management Module ---
// This module handles the state and logic for the lasso selection and move tools.

let selectionState = {
    isDrawing: false,       // Is a selection path being drawn?
    isFloating: false,      // Is there a finalized selection floating?
    path: [],               // The array of points defining the lasso path.
    imageData: null,        // The pixel data of the selection.
    boundingBox: null,      // The original position and size of the selection.
    currentX: 0,            // The current top-left X position of the floating selection.
    currentY: 0,            // The current top-left Y position of the floating selection.
    moveStartX: 0,          // The starting X position of a move drag.
    moveStartY: 0,          // The starting Y position of a move drag.
};

/**
 * Commits a floating selection if one exists, then clears the state and starts a new path.
 * @param {number} x - The starting x-coordinate.
 * @param {number} y - The starting y-coordinate.
 * @param {function} onSelectionCommitted - A callback to paste the old selection and save history.
 */
export function startSelection(x, y, onSelectionCommitted) {
    if (selectionState.isFloating) {
        onSelectionCommitted();
    }

    clearSelection();
    selectionState.isDrawing = true;
    selectionState.path = [{ x, y }];
}

/**
 * Adds a new point to the current lasso path.
 * @param {number} x - The x-coordinate of the new point.
 * @param {number} y - The y-coordinate of the new point.
 */
export function addPointToSelection(x, y) {
    if (!selectionState.isDrawing || selectionState.isFloating) return;
    selectionState.path.push({ x, y });
}

/**
 * Finalizes the selection path, extracts the pixel data from the layer, and clears the original area.
 * @param {CanvasRenderingContext2D} activeLayerCtx - The context of the currently active layer.
 */
export function endSelection(activeLayerCtx) {
    if (selectionState.path.length < 3) {
        clearSelection();
        return;
    }
    
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
        clearSelection();
        return;
    }

    selectionState.boundingBox = { x: minX, y: minY, width, height };

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.save();
    tempCtx.beginPath();
    tempCtx.moveTo(selectionState.path[0].x - minX, selectionState.path[0].y - minY);
    for (let i = 1; i < selectionState.path.length; i++) {
        tempCtx.lineTo(selectionState.path[i].x - minX, selectionState.path[i].y - minY);
    }
    tempCtx.closePath();
    tempCtx.clip();
    tempCtx.drawImage(activeLayerCtx.canvas, -minX, -minY);
    tempCtx.restore();
    
    selectionState.imageData = tempCtx.getImageData(0, 0, width, height);

    activeLayerCtx.save();
    activeLayerCtx.beginPath();
    activeLayerCtx.moveTo(selectionState.path[0].x, selectionState.path[0].y);
    for (let i = 1; i < selectionState.path.length; i++) {
        activeLayerCtx.lineTo(selectionState.path[i].x, selectionState.path[i].y);
    }
    activeLayerCtx.closePath();
    activeLayerCtx.globalCompositeOperation = 'destination-out';
    activeLayerCtx.fill();
    activeLayerCtx.restore();

    const normalizedPath = selectionState.path.map(p => ({ x: p.x - minX, y: p.y - minY }));
    selectionState.path = normalizedPath; 
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
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = selectionState.imageData.width;
    tempCanvas.height = selectionState.imageData.height;
    tempCanvas.getContext('2d').putImageData(selectionState.imageData, 0, 0);

    activeLayerCtx.drawImage(tempCanvas, selectionState.currentX, selectionState.currentY);
}

/**
 * Resets the selection state completely.
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
 * ADDED: Erases the content within the current floating selection on the active layer.
 * @param {CanvasRenderingContext2D} activeLayerCtx - The context of the active layer.
 */
export function deleteSelectionContents(activeLayerCtx) {
    if (!selectionState.isFloating) return;

    const path = selectionState.path;
    const offsetX = selectionState.currentX;
    const offsetY = selectionState.currentY;

    // Use the same erase technique as the endSelection function
    activeLayerCtx.save();
    activeLayerCtx.beginPath();
    activeLayerCtx.moveTo(path[0].x + offsetX, path[0].y + offsetY);
    for (let i = 1; i < path.length; i++) {
        activeLayerCtx.lineTo(path[i].x + offsetX, path[i].y + offsetY);
    }
    activeLayerCtx.closePath();
    activeLayerCtx.globalCompositeOperation = 'destination-out';
    activeLayerCtx.fill();
    activeLayerCtx.restore();

    // After deleting the content, clear the selection "marching ants"
    clearSelection();
}

/**
 * Initializes the start of a move operation.
 * @param {number} x - The starting x-coordinate of the drag.
 * @param {number} y - The starting y-coordinate of the drag.
 */
export function startMove(x, y) {
    if (!selectionState.isFloating) return;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

/**
 * Updates the position of the selection based on mouse movement.
 * @param {number} x - The current x-coordinate of the drag.
 * @param {number} y - The current y-coordinate of the drag.
 */
export function moveSelection(x, y) {
    if (!selectionState.isFloating) return;
    const dx = x - selectionState.moveStartX;
    const dy = y - selectionState.moveStartY;
    selectionState.currentX += dx;
    selectionState.currentY += dy;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

/**
 * Checks if a point is inside the current floating selection's path using the ray-casting algorithm.
 * @param {number} checkX - The x-coordinate to check.
 * @param {number} checkY - The y-coordinate to check.
 * @returns {boolean}
 */
export function isPointInSelection(checkX, checkY) {
    if (!selectionState.isFloating || !selectionState.path.length) return false;

    const path = selectionState.path;
    const offsetX = selectionState.currentX;
    const offsetY = selectionState.currentY;
    let inside = false;

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
 * Returns the current selection state for rendering purposes.
 * @returns {object}
 */
export function getSelectionState() {
    return selectionState;
}