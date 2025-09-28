// --- This module now handles drawing operations on a given layer context and compositing layers ---

import { applyTransform } from './viewport.js';
import { compositeLayers, getDrawingDimensions } from './layers.js';
import { getSelectionState } from './selection.js';

// --- State Variables for Drawing ---
let isDrawing = false; // Flag to track if the mouse button is down and drawing.
let lastX = 0; // Last X coordinate for smooth line drawing.
let lastY = 0; // Last Y coordinate for smooth line drawing.
let dashOffset = 0; // Used to animate the "marching ants" selection border.
const tempSelectionCanvas = document.createElement('canvas'); // A helper canvas for efficiently drawing the moving selection image.

/**
 * Resizes the main visible canvas to fit its container and handles high-DPI scaling.
 * @param {object} elements - The application's DOM elements.
 */
export function resizeVisibleCanvas(elements) {
    const { canvas, canvasContainer } = elements;
    const dpr = window.devicePixelRatio || 1; // Get the device pixel ratio for high-res displays.
    const rect = canvasContainer.getBoundingClientRect();
    
    // Set the internal resolution of the canvas.
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    // Set the display size of the canvas using CSS.
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
}

/**
 * The main render loop, called by requestAnimationFrame. It draws everything the user sees.
 * @param {object} elements - The application's DOM elements.
 */
export function redrawCanvas(elements) {
    const { ctx } = elements; // This is the context of the main VISIBLE canvas.
    const drawingDims = getDrawingDimensions(); // The size of our off-screen layer canvases.
    const selection = getSelectionState(); // The current state of the selection tool.

    ctx.save();
    // Reset any transformations to draw the background.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1. Clear the entire visible canvas with a "desk" color (the area outside the paper).
    ctx.fillStyle = '#334155'; 
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // 2. Apply the current pan and zoom from the viewport module.
    applyTransform();

    // 3. Draw the "paper" background for the drawing area.
    if (drawingDims.width > 0 && drawingDims.height > 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, drawingDims.width, drawingDims.height);
    }

    // 4. Composite (draw) all visible layers onto the main canvas.
    compositeLayers(ctx);

    // 5. If a selection is floating, draw its image data on top of everything else.
    if (selection.isFloating && selection.imageData) {
        // Optimization: Only update the temp canvas if the selection data has changed.
        if (tempSelectionCanvas.width !== selection.imageData.width || tempSelectionCanvas.height !== selection.imageData.height) {
            tempSelectionCanvas.width = selection.imageData.width;
            tempSelectionCanvas.height = selection.imageData.height;
            tempSelectionCanvas.getContext('2d').putImageData(selection.imageData, 0, 0);
        }
        ctx.drawImage(tempSelectionCanvas, selection.currentX, selection.currentY);
    }
    
    // 6. If there is any selection path (drawing or floating), draw the "marching ants" border.
    if (selection.path.length > 1) {
        const offsetX = selection.isFloating ? selection.currentX : 0;
        const offsetY = selection.isFloating ? selection.currentY : 0;
        // Adjust the path points by the selection's current position.
        const path = selection.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
        drawMarchingAnts(ctx, path, selection.isFloating || selection.isDrawing);
    }
    
    ctx.restore();

    // Animate the marching ants for the next frame.
    dashOffset = (dashOffset + 1) % 16;
}

/**
 * Helper function to draw the dashed "marching ants" selection outline.
 * @param {CanvasRenderingContext2D} ctx - The context to draw on.
 * @param {Array} path - An array of {x, y} points.
 * @param {boolean} shouldClose - Whether to close the path to form a complete shape.
 */
function drawMarchingAnts(ctx, path, shouldClose = false) {
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // 4 pixels on, 4 pixels off.
    ctx.lineDashOffset = -dashOffset; // Animate the dash position.
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
    }
    if (shouldClose) {
        ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * Applies a clipping mask to the given context if a selection is active.
 * This affects all subsequent drawing operations like `stroke()` or `fill()`.
 * @param {CanvasRenderingContext2D} ctx - The context to apply the clip to.
 */
function applySelectionClip(ctx) {
    const selection = getSelectionState();
    // Only apply a clip if a selection is finalized and floating.
    if (!selection.isFloating) return;

    ctx.beginPath();
    const path = selection.path;
    const offsetX = selection.currentX;
    const offsetY = selection.currentY;

    // Build the path using the floating selection's current position.
    ctx.moveTo(path[0].x + offsetX, path[0].y + offsetY);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x + offsetX, path[i].y + offsetY);
    }
    ctx.closePath();
    ctx.clip(); // Activate the clipping region.
}

/**
 * Main handler for mouse clicks on the canvas for tools that act instantly (like Fill).
 * @param {number} x - The transformed x-coordinate.
 * @param {number} y - The transformed y-coordinate.
 * @param {object} state - Contains the active layer context and tool info.
 * @param {function} onDrawEnd - Callback to save history.
 */
export function handleCanvasClick(x, y, state, onDrawEnd) {
    const { activeLayer, activeTool } = state;
    if (!activeLayer) return;
    
    isDrawing = true;
    lastX = x;
    lastY = y;
    
    if (activeTool === 'fill') {
        floodFill(x, y, state);
        onDrawEnd(); // Fill is a single action, so save history immediately.
        isDrawing = false;
    } else if (['brush', 'eraser'].includes(activeTool)) {
        // For brush/eraser, we just start the drawing process.
        draw(x, y, state);
    }
}

/**
 * Draws a line segment from the last point to the current point.
 * Respects any active selection as a clipping mask.
 * @param {number} x - The current transformed x-coordinate.
 * @param {number} y - The current transformed y-coordinate.
 * @param {object} state - The current drawing state.
 */
export function draw(x, y, state) {
    if (!isDrawing) return;
    const { activeLayer, activeTool, colorPicker, brushSizeSlider } = state;
    if (!activeLayer) return;

    const ctx = activeLayer.ctx; // We are drawing on the OFF-SCREEN layer canvas.
    
    ctx.save();
    applySelectionClip(ctx); // Apply clipping mask if a selection exists.

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);

    // 'destination-out' erases, 'source-over' draws normally.
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : colorPicker.value;
    ctx.lineWidth = brushSizeSlider.value;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.stroke();
    ctx.restore();

    // Update the last position for the next segment.
    [lastX, lastY] = [x, y];
}

/**
 * Stops a drawing action (e.g., on mouseup) and triggers a history save.
 * @param {function} onDrawEnd - The callback to save the state.
 */
export function stopDrawing(onDrawEnd) {
    if (isDrawing) {
        isDrawing = false;
        onDrawEnd();
    }
}

/**
 * Performs a flood fill operation on the active layer.
 * @param {number} startX - The starting x-coordinate.
 * @param {number} startY - The starting y-coordinate.
 * @param {object} state - The current drawing state.
 */
function floodFill(startX, startY, state) {
    const { activeLayer, colorPicker } = state;
    const ctx = activeLayer.ctx;
    const canvas = activeLayer.canvas;

    ctx.save();
    applySelectionClip(ctx); // Apply the clipping mask.

    const startX_scaled = Math.floor(startX);
    const startY_scaled = Math.floor(startY);

    // *** THE CORE PROBLEM IS HERE ***
    // `getImageData` reads the raw pixel data from the canvas and is NOT AFFECTED by the clipping region set by `ctx.clip()`.
    // The algorithm will therefore read and write pixels outside the intended selection area.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height } = imageData;
    const data = imageData.data; // This is a flat array of [R, G, B, A, R, G, B, A, ...] values.
    
    // Get the color of the pixel that was clicked. This is the color to be replaced.
    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    const fillColor = hexToRgba(colorPicker.value);

    // If the target color is the same as the fill color, do nothing.
    if (colorsMatch(targetColor, fillColor)) {
        ctx.restore();
        return;
    }

    // A queue-based (Breadth-First Search) flood fill algorithm.
    const queue = [[startX_scaled, startY_scaled]];

    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue; // Boundary check.
        
        const currentColor = getPixelColor(x, y, width, data);

        // If the current pixel's color matches the target color...
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data); // ...change its color...
            // ...and add its neighbors to the queue to be checked.
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    // After modifying the imageData array, put it back onto the canvas.
    ctx.putImageData(imageData, 0, 0);
    ctx.restore(); // Restore context state, removing the clipping path.
}

// --- Flood Fill Helper Functions ---

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
    // Uses a tolerance threshold to account for anti-aliasing and slight color variations.
    const threshold = 30; 
    return Math.abs(c1.r - c2.r) < threshold &&
           Math.abs(c1.g - c2.g) < threshold &&
           Math.abs(c1.b - c2.b) < threshold &&
           Math.abs(c1.a - c2.a) < threshold;
}

function hexToRgba(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length == 4) { // Handle shorthand hex like #FFF
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length == 7) { // Handle full hex like #FFFFFF
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return { r, g, b, a: 255 }; // Assume full alpha.
}