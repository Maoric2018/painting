// --- This module now handles drawing operations on a given layer context and compositing layers ---

import { applyTransform } from './viewport.js';
import { compositeLayers, getDrawingDimensions } from './layers.js';

// --- State Variables for Drawing ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;

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
 * The main render loop. It now creates a "desk" and "paper" effect.
 * @param {object} elements - The application's DOM elements.
 */
export function redrawCanvas(elements) {
    const { ctx } = elements;
    const drawingDims = getDrawingDimensions();

    ctx.save();
    // Ensure transformations from the previous frame are cleared.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1. Clear the entire visible canvas with a dark "desk" color.
    // This color (Tailwind's slate-700) will be visible around the paper when zoomed out.
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // 2. Apply the current pan and zoom transformation.
    applyTransform();

    // 3. Draw the white "paper" background for the artwork.
    // This rectangle exists in the "world" space and will be scaled and moved by the transform.
    if (drawingDims.width > 0 && drawingDims.height > 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, drawingDims.width, drawingDims.height);
    }

    // 4. Composite all visible layers on top of the paper.
    compositeLayers(ctx);
    
    ctx.restore();
}


/**
 * Main handler for mouse clicks on the canvas. Decides whether to fill or start drawing.
 * @param {number} x - The transformed x-coordinate.
 * @param {number} y - The transformed y-coordinate.
 * @param {object} state - Contains the active layer context and tool info.
 * @param {function} onDrawEnd - Callback to save history.
 */
export function handleCanvasClick(x, y, state, onDrawEnd) {
    const { activeLayer, activeTool } = state;
    if (!activeLayer) return;
    
    const ctx = activeLayer.ctx;

    isDrawing = true;
    lastX = x;
    lastY = y;
    
    if (activeTool === 'fill') {
        floodFill(x, y, state);
        onDrawEnd();
        isDrawing = false;
    } else {
        // For single-click dots with brush/eraser
        draw(x, y, state);
    }
}

/**
 * Draws a line from the last known position to the current position.
 * @param {number} x - The current transformed x-coordinate.
 * @param {number} y - The current transformed y-coordinate.
 * @param {object} state - The current drawing state (layer, tool, color, brush size).
 */
export function draw(x, y, state) {
    if (!isDrawing) return;
    const { activeLayer, activeTool, colorPicker, brushSizeSlider } = state;
    if (!activeLayer) return;

    const ctx = activeLayer.ctx;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);

    // Eraser now uses destination-out to "erase" to transparency
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : colorPicker.value;
    ctx.lineWidth = brushSizeSlider.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.stroke();
    
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
    [lastX, lastY] = [x, y];
}

/**
 * Sets the isDrawing flag to false and triggers the onDrawEnd callback.
 * @param {function} onDrawEnd - The callback to execute when drawing stops.
 */
export function stopDrawing(onDrawEnd) {
    if (isDrawing) {
        isDrawing = false;
        onDrawEnd();
    }
}

// --- Flood Fill Algorithm (Pixel-level manipulation) ---
function floodFill(startX, startY, state) {
    const { activeLayer, colorPicker } = state;
    const ctx = activeLayer.ctx;
    const canvas = activeLayer.canvas;

    const startX_scaled = Math.floor(startX);
    const startY_scaled = Math.floor(startY);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height } = imageData;
    const data = imageData.data;
    
    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    const fillColor = hexToRgba(colorPicker.value);

    if (colorsMatch(targetColor, fillColor)) return;

    const queue = [[startX_scaled, startY_scaled]];

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const currentColor = getPixelColor(x, y, width, data);

        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data);
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

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
    // Tolerance for anti-aliased edges
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
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[1] + hex[1], 16);
    } else if (hex.length == 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return { r, g, b, a: 255 };
}

