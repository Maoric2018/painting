// --- Selection Management Module ---

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
    originLayerId: null,    // Stores the ID of the layer the selection was created on.
    
    // --- Properties for Sub-History ---
    tempCanvas: null,       // An offscreen canvas for the floating selection
    tempCtx: null,          // The context for the tempCanvas
    tempHistory: [],        // Undo stack for the selection
    tempRedoStack: [],      // Redo stack for the selection
};

// --- Helper Functions ---

function getPixelColor(x, y, width, data) {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}

function setPixelColor(x, y, color, width, data) {
    const index = (y * width + x) * 4;
    data[index] = color.r; data[index + 1] = color.g;
    data[index + 2] = color.b; data[index + 3] = color.a;
}

function colorsMatch(c1, c2) {
    const threshold = 30;
    return Math.abs(c1.r - c2.r) < threshold &&
           Math.abs(c1.g - c2.g) < threshold &&
           Math.abs(c1.b - c2.b) < threshold &&
           Math.abs(c1.a - c2.a) < threshold;
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

/** Applies the lasso path as a clipping mask. */
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

// --- Exported Functions ---

export function startSelection(x, y, onSelectionCommitted) {
    if (selectionState.isFloating) {
        onSelectionCommitted();
    }
    clearSelection();
    selectionState.isDrawing = true;
    selectionState.path = [{ x, y }];
}

export function addPointToSelection(x, y) {
    if (!selectionState.isDrawing || selectionState.isFloating) return;
    selectionState.path.push({ x, y });
}

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

    selectionState.path = normalizedPath; 
    
    saveSelectionState();

    selectionState.isDrawing = false;
    selectionState.isFloating = true;
}

export function clearSelection() {
    selectionState = {
        isDrawing: false, isFloating: false, path: [], imageData: null,
        boundingBox: null, currentX: 0, currentY: 0, moveStartX: 0,
        moveStartY: 0, originLayerId: null, tempCanvas: null, tempCtx: null,
        tempHistory: [], tempRedoStack: [],
    };
}

export function deleteSelectionContents() {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;
    const ctx = selectionState.tempCtx;
    ctx.save();
    applySelectionClip(ctx);
    ctx.clearRect(0, 0, selectionState.tempCanvas.width, selectionState.tempCanvas.height);
    ctx.restore();
    saveSelectionState();
}

export function startMove(x, y) {
    if (!selectionState.isFloating) return;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

export function moveSelection(x, y) {
    if (!selectionState.isFloating) return;
    const dx = x - selectionState.moveStartX;
    const dy = y - selectionState.moveStartY;
    selectionState.currentX += dx;
    selectionState.currentY += dy;
    selectionState.moveStartX = x;
    selectionState.moveStartY = y;
}

export function drawOnSelection(startX, startY, endX, endY, state) {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;

    const { activeTool, colorPicker, brushSizeSlider } = state;
    const ctx = selectionState.tempCtx;

    const localStartX = startX - selectionState.currentX;
    const localStartY = startY - selectionState.currentY;
    const localEndX = endX - selectionState.currentX;
    const localEndY = endY - selectionState.currentY;

    ctx.save(); 
    applySelectionClip(ctx); 

    ctx.beginPath();
    ctx.moveTo(localStartX, localStartY);
    ctx.lineTo(localEndX, localEndY);
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : colorPicker.value;
    ctx.lineWidth = brushSizeSlider.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore(); 
}

export function fillSelection(canvasX, canvasY, fillColorHex) {
    if (!selectionState.isFloating || !selectionState.tempCtx) return;

    const ctx = selectionState.tempCtx;
    const canvas = selectionState.tempCanvas;
    
    const startX = Math.floor(canvasX - selectionState.currentX);
    const startY = Math.floor(canvasY - selectionState.currentY);
    
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
    applySelectionClip(ctx);

    while(queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        if (!ctx.isPointInPath(x, y)) continue;

        const currentColor = getPixelColor(x, y, width, data);
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data);
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    ctx.restore(); 
    
    ctx.putImageData(imageData, 0, 0);
}

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

export function redoSelectionChange() {
    if (selectionState.tempRedoStack.length === 0) return;
    const nextState = selectionState.tempRedoStack.pop();
    selectionState.tempHistory.push(nextState);

    selectionState.tempCtx.putImageData(nextState.imageData, 0, 0);
    selectionState.currentX = nextState.x;
    selectionState.currentY = nextState.y;
    
    document.dispatchEvent(new CustomEvent('requestRedraw'));
}

export function reconstructSelection(data) {
    if (!data) return;

    selectionState.isFloating = true;
    selectionState.isDrawing = false;
    selectionState.path = data.path;
    selectionState.originLayerId = data.originLayerId;

    const initialState = data.initialState;
    selectionState.currentX = initialState.x;
    selectionState.currentY = initialState.y;
    
    const imageData = initialState.imageData;
    selectionState.tempCanvas = document.createElement('canvas');
    selectionState.tempCanvas.width = imageData.width;
    selectionState.tempCanvas.height = imageData.height;
    selectionState.tempCtx = selectionState.tempCanvas.getContext('2d');
    selectionState.tempCtx.putImageData(imageData, 0, 0);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectionState.path.forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    selectionState.boundingBox = { x: minX, y: minY, width: maxX-minX, height: maxY-minY };

    selectionState.tempHistory = data.tempHistory;
    selectionState.tempRedoStack = data.tempRedoStack;
}

export function getSelectionState() {
    return selectionState;
}

