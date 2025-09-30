// --- Selection Management Module ---
// This module handles the state and logic for the lasso selection and move tools.
// It now manages its own temporary canvas and history stack while a selection is active.

let selectionState = {
    isDrawing: false,       // Is a selection path being drawn?
    isFloating: false,      // Is there a finalized selection floating?
    path: [],               // The array of points defining the lasso path.
    imageData: null,        // A backup of the initial pixel data.
    boundingBox: null,      // The original position and size of the selection.
    currentX: 0,            // The current top-left X position of the floating selection.
    currentY: 0,            // The current top-left Y position of the floating selection.
    moveStartX: 0,          // The starting X position of a move drag.
    moveStartY: 0,          // The starting Y position of a move drag.
    originLayerId: null,    // Stores the ID of the layer the selection was created on.
    
    // --- NEW PROPERTIES FOR SUB-HISTORY ---
    tempCanvas: null,       // An offscreen canvas for the floating selection
    tempCtx: null,          // The context for the tempCanvas
    tempHistory: [],        // Undo stack for the selection
    tempRedoStack: [],      // Redo stack for the selection
};

// --- Helper Functions (copied from canvas.js for module independence) ---
function getPixelColor(x, y, width, data) {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}
function setPixelColor(x, y, color, width, data) {
    const index = (y * width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
}
function colorsMatch(c1, c2) {
    const threshold = 30;
    return Math.abs(c1.r - c2.r) < threshold && Math.abs(c1.g - c2.g) < threshold && Math.abs(c1.b - c2.b) < threshold && Math.abs(c1.a - c2.a) < threshold;
}
function hexToRgba(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length == 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length == 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return { r, g, b, a: 255 };
}

/**
 * MODIFIED: New helper function to apply the lasso path as a clipping mask.
 * This ensures all drawing operations are confined to the original selection shape.
 * @param {CanvasRenderingContext2D} ctx - The context to apply the clip to.
 */
function applySelectionClip(ctx) {
    if (!selectionState.path.length) return;
    ctx.beginPath();
    ctx.moveTo(selectionState.path[0].x, selectionState.path[0].y);
    for (let i = 1; i < selectionState.path.length; i++) {
        ctx.lineTo(selectionState.path[i].x, selectionState.path[i].y);
    }
    ctx.closePath();
    ctx.clip();
}


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
 * Finalizes the selection path, extracts the pixel data, creates a temporary canvas for editing, and clears the original area.
 * @param {object} originLayer - The full layer object from which the selection is being made.
 */
export function endSelection(originLayer) {
    if (selectionState.path.length < 3) {
        clearSelection();
        return;
    }
    
    selectionState.originLayerId = originLayer.id;
    const activeLayerCtx = originLayer.ctx;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectionState.path.forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    if (width <= 0 || height <= 0) {
        clearSelection();
        return;
    }

    selectionState.boundingBox = { x: minX, y: minY, width, height };
    
    // Normalize the path relative to the bounding box's top-left corner
    const normalizedPath = selectionState.path.map(p => ({ x: p.x - minX, y: p.y - minY }));

    const tempCaptureCanvas = document.createElement('canvas');
    tempCaptureCanvas.width = width;
    tempCaptureCanvas.height = height;
    const tempCaptureCtx = tempCaptureCanvas.getContext('2d');
    tempCaptureCtx.beginPath();
    tempCaptureCtx.moveTo(normalizedPath[0].x, normalizedPath[0].y);
    for (let i = 1; i < normalizedPath.length; i++) {
        tempCaptureCtx.lineTo(normalizedPath[i].x, normalizedPath[i].y);
    }
    tempCaptureCtx.closePath();
    tempCaptureCtx.clip();
    tempCaptureCtx.drawImage(activeLayerCtx.canvas, -minX, -minY);
    selectionState.imageData = tempCaptureCtx.getImageData(0, 0, width, height);

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

    selectionState.tempCanvas = document.createElement('canvas');
    selectionState.tempCanvas.width = width;
    selectionState.tempCanvas.height = height;
    selectionState.tempCtx = selectionState.tempCanvas.getContext('2d');
    selectionState.tempCtx.putImageData(selectionState.imageData, 0, 0);
    
    selectionState.currentX = minX;
    selectionState.currentY = minY;

    // From now on, the official path is the one relative to the tempCanvas
    selectionState.path = normalizedPath; 
    
    saveSelectionState();

    selectionState.isDrawing = false;
    selectionState.isFloating = true;
}

/** Resets the selection state completely. */
export function clearSelection() {
    selectionState = {
        isDrawing: false, isFloating: false, path: [], imageData: null,
        boundingBox: null, currentX: 0, currentY: 0, moveStartX: 0,
        moveStartY: 0, originLayerId: null, tempCanvas: null, tempCtx: null,
        tempHistory: [], tempRedoStack: [],
    };
}

/** Erases the content within the current floating selection and saves the state. */
export function deleteSelectionContents() {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;
    const ctx = selectionState.tempCtx;
    ctx.save();
    applySelectionClip(ctx);
    ctx.clearRect(0, 0, selectionState.tempCanvas.width, selectionState.tempCanvas.height);
    ctx.restore();
    saveSelectionState();
}

/** Initializes the start of a move operation. */
export function startMove(x, y) {
    if (!selectionState.isFloating) return;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

/** Updates the position of the selection based on mouse movement. */
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
 * Draws directly onto the floating selection's temporary canvas, respecting the clipping mask.
 * @param {number} startX - The previous transformed x-coordinate.
 * @param {number} startY - The previous transformed y-coordinate.
 * @param {number} endX - The current transformed x-coordinate.
 * @param {number} endY - The current transformed y-coordinate.
 * @param {object} state - Contains tool info like color and size.
 */
export function drawOnSelection(startX, startY, endX, endY, state) {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;

    const { activeTool, colorPicker, brushSizeSlider } = state;
    const ctx = selectionState.tempCtx;

    const localStartX = startX - selectionState.currentX;
    const localStartY = startY - selectionState.currentY;
    const localEndX = endX - selectionState.currentX;
    const localEndY = endY - selectionState.currentY;

    ctx.save(); // Save the context state before applying the clip
    applySelectionClip(ctx); // Apply the clipping mask

    ctx.beginPath();
    ctx.moveTo(localStartX, localStartY);
    ctx.lineTo(localEndX, localEndY);
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : colorPicker.value;
    ctx.lineWidth = brushSizeSlider.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore(); // Restore the context, removing the clip
}

/**
 * Performs a flood fill operation on the selection's temporary canvas, respecting the clipping mask.
 * @param {number} canvasX - The x-coordinate of the click on the main canvas.
 * @param {number} canvasY - The y-coordinate of the click on the main canvas.
 * @param {string} fillColorHex - The hex code of the color to fill with.
 */
export function fillSelection(canvasX, canvasY, fillColorHex) {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;

    const ctx = selectionState.tempCtx;
    const canvas = selectionState.tempCanvas;
    
    const startX = Math.floor(canvasX - selectionState.currentX);
    const startY = Math.floor(canvasY - selectionState.currentY);
    
    // First, check if the click is even inside the clipped area
    ctx.save();
    applySelectionClip(ctx);
    const isInside = ctx.isPointInPath(startX, startY);
    ctx.restore();
    if (!isInside) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;
    
    const targetColor = getPixelColor(startX, startY, width, data);
    const fillColor = hexToRgba(fillColorHex);

    if (colorsMatch(targetColor, fillColor)) return;

    const queue = [[startX, startY]];
    
    ctx.save();
    applySelectionClip(ctx); // Apply clip before getting image data to be 100% sure we only edit inside

    while(queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        // This check is now slightly redundant due to the clip, but it's a good fail-safe
        if (!ctx.isPointInPath(x, y)) continue;

        const currentColor = getPixelColor(x, y, width, data);
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data);
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    ctx.restore(); // Restore before putImageData
    
    ctx.putImageData(imageData, 0, 0);
}

/** Checks if a point is inside the current floating selection's path. */
export function isPointInSelection(checkX, checkY) {
    if (!selectionState.isFloating || !selectionState.path.length) return false;
    const path = selectionState.path;
    const offsetX = selectionState.currentX;
    const offsetY = selectionState.currentY;
    let inside = false;
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const xi = path[i].x + offsetX, yi = path[i].y + offsetY;
        const xj = path[j].x + offsetX, yj = path[j].y + offsetY;
        const intersect = ((yi > checkY) !== (yj > checkY)) && (checkX < (xj - xi) * (checkY - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Saves the current state of the selection's canvas to its temporary history. */
export function saveSelectionState() {
    if (!selectionState.tempCtx) return;
    const stateToSave = {
        imageData: selectionState.tempCtx.getImageData(0, 0, selectionState.tempCanvas.width, selectionState.tempCanvas.height),
        x: selectionState.currentX,
        y: selectionState.currentY,
    };
    selectionState.tempHistory.push(stateToSave);
    selectionState.tempRedoStack = [];
}

/** Undoes the last change made to the floating selection. */
export function undoSelectionChange() {
    if (selectionState.tempHistory.length < 2) return;
    const currentState = selectionState.tempHistory.pop();
    selectionState.tempRedoStack.push(currentState);
    const prevState = selectionState.tempHistory[selectionState.tempHistory.length - 1];
    
    selectionState.tempCtx.putImageData(prevState.imageData, 0, 0);
    selectionState.currentX = prevState.x;
    selectionState.currentY = prevState.y;

    document.dispatchEvent(new CustomEvent('requestRedraw'));
}

/** Redoes the last undone change to the floating selection. */
export function redoSelectionChange() {
    if (selectionState.tempRedoStack.length === 0) return;
    const nextState = selectionState.tempRedoStack.pop();
    selectionState.tempHistory.push(nextState);

    selectionState.tempCtx.putImageData(nextState.imageData, 0, 0);
    selectionState.currentX = nextState.x;
    selectionState.currentY = nextState.y;
    
    document.dispatchEvent(new CustomEvent('requestRedraw'));
}

/** Returns the current selection state. */
export function getSelectionState() {
    return selectionState;
}

