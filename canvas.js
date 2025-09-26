import { applyTransform } from './viewport.js';

// --- State Variables ---
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// --- Exported Functions ---

/**
 * Redraws the visible canvas by applying the current viewport transform
 * and drawing the offscreen canvas onto it.
 * @param {object} elements - The application's DOM elements.
 */
export function redrawCanvas(elements) {
    applyTransform(elements.ctx, elements.drawingCanvas);
}

/**
 * Resizes both the visible and offscreen canvases.
 * @param {object} elements - The application's DOM elements.
 */
export function resizeCanvases(elements) {
    const { canvas, canvasContainer, drawingCanvas, drawingCtx } = elements;
    
    // Store the old drawing to restore it after resize
    const oldDrawing = drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);

    const newWidth = canvasContainer.clientWidth;
    const newHeight = canvasContainer.clientHeight;

    // Resize visible canvas
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Resize offscreen canvas only if it's the first time or dimensions change
    if (drawingCanvas.width !== newWidth || drawingCanvas.height !== newHeight) {
        drawingCanvas.width = newWidth;
        drawingCanvas.height = newHeight;
        // Restore the old drawing onto the resized offscreen canvas
        if (oldDrawing) {
            drawingCtx.putImageData(oldDrawing, 0, 0);
        }
    }
}

/**
 * Handler for a single click on the canvas.
 * @param {number} x - The transformed x-coordinate on the drawing canvas.
 * @param {number} y - The transformed y-coordinate on the drawing canvas.
 * @param {object} state - The current drawing state (tool, color, etc.).
 * @param {function} onDrawEnd - Callback to save history.
 */
export function handleCanvasClick(x, y, state, onDrawEnd) {
    const { drawingCtx, activeTool } = state;

    isDrawing = true;
    lastX = x;
    lastY = y;

    if (activeTool === 'brush' || activeTool === 'eraser') {
        // Draw a single dot for a click
        draw(x, y, state);
    } else if (activeTool === 'fill') {
        floodFill(x, y, state.colorPicker.value, drawingCtx);
        // Flood fill is a single action, so we stop immediately and save.
        stopDrawing(onDrawEnd);
    }
}

/**
 * Draws a line on the offscreen canvas from the last known point to the current one.
 * @param {number} x - The transformed x-coordinate.
 * @param {number} y - The transformed y-coordinate.
 * @param {object} state - The current drawing state.
 */
export function draw(x, y, state) {
    if (!isDrawing) return;
    const { drawingCtx, activeTool, colorPicker, brushSizeSlider } = state;
    
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.lineWidth = brushSizeSlider.value;
    
    if (activeTool === 'brush') {
        drawingCtx.strokeStyle = colorPicker.value;
        drawingCtx.globalCompositeOperation = 'source-over';
    } else if (activeTool === 'eraser') {
        drawingCtx.strokeStyle = 'white'; // Erases to the background color
        drawingCtx.globalCompositeOperation = 'source-over';
    }

    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY);
    drawingCtx.lineTo(x, y);
    drawingCtx.stroke();

    lastX = x;
    lastY = y;
}

/**
 * Sets the drawing state to false and triggers the onDrawEnd callback.
 * @param {function} onDrawEnd - Callback to save history.
 */
export function stopDrawing(onDrawEnd) {
    if (isDrawing) {
        isDrawing = false;
        if (onDrawEnd) onDrawEnd();
    }
}

// --- Flood Fill Algorithm ---
function floodFill(startX, startY, fillColor, ctx) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const { width, height, data } = imageData;
    const startX_scaled = Math.floor(startX);
    const startY_scaled = Math.floor(startY);

    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    const fillColorRgb = hexToRgb(fillColor);

    if (colorsMatch(targetColor, fillColorRgb)) return;

    const queue = [[startX_scaled, startY_scaled]];
    const visited = new Set([`${startX_scaled},${startY_scaled}`]);

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const currentColor = getPixelColor(x, y, width, data);
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColorRgb, width, data);
            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (const [nx, ny] of neighbors) {
                const key = `${nx},${ny}`;
                if (!visited.has(key) && (nx >= 0 && nx < width && ny >= 0 && ny < height)) {
                    queue.push([nx, ny]);
                    visited.add(key);
                }
            }
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
    data[index + 3] = 255;
}

function colorsMatch(c1, c2) {
    return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: 255 };
}

