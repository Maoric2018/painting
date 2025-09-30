// --- This module now handles drawing operations on a given layer context and compositing layers ---

import { applyTransform } from './viewport.js';
import { compositeLayers, getDrawingDimensions } from './layers.js';
import { getSelectionState, isPointInSelection } from './selection.js';

// --- State Variables for Drawing ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let dashOffset = 0; // For marching ants animation

/**
 * Resizes the main visible canvas to fit its container and handles high-DPI scaling.
 * @param {object} elements - The application's DOM elements.
 */
export function resizeVisibleCanvas(elements) {
    const { canvas, canvasContainer } = elements;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasContainer.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
}

/**
 * The main render loop. It composites layers and draws the floating selection from its temporary canvas.
 * @param {object} elements - The application's DOM elements.
 */
export function redrawCanvas(elements) {
    const { ctx } = elements;
    const drawingDims = getDrawingDimensions();
    const selection = getSelectionState();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#334155'; // 1. Clear with "desk" color.
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    applyTransform(); // 2. Apply pan and zoom.

    if (drawingDims.width > 0 && drawingDims.height > 0) { // 3. Draw "paper" background.
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, drawingDims.width, drawingDims.height);
    }

    compositeLayers(ctx); // 4. Composite all layers.

    // MODIFIED: Draw the floating selection from its own temporary canvas.
    if (selection.isFloating && selection.tempCanvas) { 
        ctx.drawImage(selection.tempCanvas, selection.currentX, selection.currentY);
    }
    
    if (selection.path.length > 1) { // 6. Draw the selection path (marching ants).
        const offsetX = selection.isFloating ? selection.currentX : 0;
        const offsetY = selection.isFloating ? selection.currentY : 0;
        const path = selection.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
        drawMarchingAnts(ctx, path, selection.isFloating || selection.isDrawing);
    }
    
    ctx.restore();
    dashOffset = (dashOffset + 1) % 16;
}

function drawMarchingAnts(ctx, path, shouldClose = false) {
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -dashOffset;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
    }
    if (shouldClose) ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

/**
 * Applies a clipping mask to the context if a selection is active.
 * This is used for tools like the Fill bucket.
 * @param {CanvasRenderingContext2D} ctx - The context to apply the clip to.
 */
function applySelectionClip(ctx) {
    const selection = getSelectionState();
    if (!selection.isFloating) return;
    ctx.beginPath();
    const path = selection.path;
    const offsetX = selection.currentX, offsetY = selection.currentY;
    ctx.moveTo(path[0].x + offsetX, path[0].y + offsetY);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x + offsetX, path[i].y + offsetY);
    }
    ctx.closePath();
    ctx.clip();
}

/**
 * Main handler for mouse clicks on the canvas.
 * @param {number} x - The transformed x-coordinate.
 * @param {number} y - The transformed y-coordinate.
 * @param {object} state - Contains the active layer context and tool info.
 * @param {function} onDrawEnd - Callback to save history.
 */
export function handleCanvasClick(x, y, state, onDrawEnd) {
    const { activeLayer, activeTool } = state;
    if (!activeLayer && !getSelectionState().isFloating) return;
    
    isDrawing = true;
    lastX = x;
    lastY = y;
    
    if (activeTool === 'fill') {
        floodFill(x, y, state);
        onDrawEnd();
        isDrawing = false;
    } else if (['brush', 'eraser'].includes(activeTool)) {
        draw(x, y, state);
    }
}

/** Draws a line on the active layer's context. */
export function draw(x, y, state) {
    if (!isDrawing) return;
    const { activeLayer, activeTool, colorPicker, brushSizeSlider } = state;
    if (!activeLayer) return;

    const ctx = activeLayer.ctx;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : colorPicker.value;
    ctx.lineWidth = brushSizeSlider.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    [lastX, lastY] = [x, y];
}

/** Stops a drawing operation and triggers the history save. */
export function stopDrawing(onDrawEnd) {
    if (isDrawing) {
        isDrawing = false;
        onDrawEnd();
    }
}

function floodFill(startX, startY, state) {
    // This function remains largely the same but could be adapted to
    // draw on the selection's temp canvas if needed in the future.
    const { activeLayer, colorPicker } = state;
    if (!activeLayer) return;
    const ctx = activeLayer.ctx;
    const canvas = activeLayer.canvas;
    ctx.save();
    applySelectionClip(ctx); // Fill respects the selection boundary
    const startX_scaled = Math.floor(startX), startY_scaled = Math.floor(startY);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;
    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    const fillColor = hexToRgba(colorPicker.value);
    if (colorsMatch(targetColor, fillColor)) {
        ctx.restore();
        return;
    }
    const queue = [[startX_scaled, startY_scaled]];
    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (getSelectionState().isFloating && !isPointInSelection(x, y)) continue;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const currentColor = getPixelColor(x, y, width, data);
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data);
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
}

/** Picks the color from a specific coordinate on the main visible canvas. */
export function pickColorAt(mainCtx, screenX, screenY) {
    const pixel = mainCtx.getImageData(screenX, screenY, 1, 1).data;
    const r = pixel[0].toString(16).padStart(2, '0');
    const g = pixel[1].toString(16).padStart(2, '0');
    const b = pixel[2].toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

/** Draws the zoomed-in preview for the eyedropper tool. */
export function drawZoomPreview(previewCtx, mainCtx, screenX, screenY) {
    const previewCanvas = previewCtx.canvas;
    const captureSize = 15;
    const halfCapture = Math.floor(captureSize / 2);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(mainCtx.canvas, screenX - halfCapture, screenY - halfCapture, captureSize, captureSize, 0, 0, previewCanvas.width, previewCanvas.height);
    const gridSize = previewCanvas.width / captureSize;
    previewCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    previewCtx.lineWidth = 1;
    for (let i = 0; i < captureSize; i++) {
        previewCtx.beginPath();
        previewCtx.moveTo(i * gridSize, 0);
        previewCtx.lineTo(i * gridSize, previewCanvas.height);
        previewCtx.stroke();
        previewCtx.beginPath();
        previewCtx.moveTo(0, i * gridSize);
        previewCtx.lineTo(previewCanvas.width, i * gridSize);
        previewCtx.stroke();
    }
    previewCtx.strokeStyle = 'red';
    previewCtx.lineWidth = 2;
    previewCtx.strokeRect(halfCapture * gridSize, halfCapture * gridSize, gridSize, gridSize);
}

// --- Helper Functions ---
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
