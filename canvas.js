import { applyTransform } from './viewport.js';

// --- Module-level State Variables ---
// These variables are private to this module and track the state of a drawing action.
let isDrawing = false; // Flag to check if the mouse is currently down and drawing.
let lastX = 0; // The x-coordinate of the last point drawn.
let lastY = 0; // The y-coordinate of the last point drawn.

// --- Exported Functions ---

/**
 * Redraws the visible canvas. This function is called whenever the view changes (e.g., pan, zoom, or draw).
 * It applies the current viewport transformation (pan/zoom) and then copies the entire
 * offscreen drawing canvas onto the visible canvas.
 * @param {object} elements - The application's DOM elements, including the visible context (ctx) and the offscreen drawingCanvas.
 */
export function redrawCanvas(elements) {
    // applyTransform handles clearing the visible canvas and setting the correct pan/zoom.
    applyTransform(elements.ctx, elements.drawingCanvas);
}

/**
 * Resizes both the visible canvas (what the user sees) and the offscreen canvas (where the drawing is stored).
 * This ensures the drawing area matches the container size and preserves the existing artwork during a resize.
 * @param {object} elements - The application's DOM elements.
 */
export function resizeCanvases(elements) {
    const { canvas, canvasContainer, drawingCanvas, drawingCtx } = elements;
    
    // Temporarily save the current drawing from the offscreen canvas.
    const oldDrawing = drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);

    // Get the new dimensions from the canvas's container element.
    const newWidth = canvasContainer.clientWidth;
    const newHeight = canvasContainer.clientHeight;

    // Resize the visible canvas to match the new dimensions.
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Resize the offscreen drawing canvas only if the dimensions have actually changed.
    if (drawingCanvas.width !== newWidth || drawingCanvas.height !== newHeight) {
        drawingCanvas.width = newWidth;
        drawingCanvas.height = newHeight;
        // If there was a previous drawing, restore it onto the newly resized offscreen canvas.
        if (oldDrawing) {
            drawingCtx.putImageData(oldDrawing, 0, 0);
        }
    }
}

/**
 * Handles the initial mousedown event on the canvas. It sets up the drawing state
 * and determines the action based on the currently active tool.
 * @param {number} x - The transformed x-coordinate on the drawing canvas.
 * @param {number} y - The transformed y-coordinate on the drawing canvas.
 * @param {object} state - The current drawing state (tool, color, etc.).
 * @param {function} onDrawEnd - Callback function to be called when a drawing action is complete to save it to history.
 */
export function handleCanvasClick(x, y, state, onDrawEnd) {
    const { drawingCtx, activeTool } = state;

    // Set the drawing flag to true and record the starting coordinates.
    isDrawing = true;
    lastX = x;
    lastY = y;

    if (activeTool === 'brush' || activeTool === 'eraser') {
        // For brush and eraser, draw a single dot to handle clicks without dragging.
        draw(x, y, state);
    } else if (activeTool === 'fill') {
        // For the fill tool, perform the flood fill algorithm.
        floodFill(x, y, state.colorPicker.value, drawingCtx);
        // Flood fill is an instantaneous action, so stop drawing immediately and save the result.
        stopDrawing(onDrawEnd);
    }
}

/**
 * Draws a line segment on the offscreen canvas from the last known point to the current mouse position.
 * This function is called repeatedly on mousemove events to create smooth strokes.
 * @param {number} x - The current transformed x-coordinate.
 * @param {number} y - The current transformed y-coordinate.
 * @param {object} state - The current drawing state (tool, color, brush size).
 */
export function draw(x, y, state) {
    if (!isDrawing) return; // Only draw if the mouse button is held down.
    const { drawingCtx, activeTool, colorPicker, brushSizeSlider } = state;
    
    // Set drawing properties for smooth, rounded lines.
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.lineWidth = brushSizeSlider.value;
    
    // Configure the context based on the active tool.
    if (activeTool === 'brush') {
        drawingCtx.strokeStyle = colorPicker.value;
        drawingCtx.globalCompositeOperation = 'source-over'; // Default mode, new shapes are drawn over existing ones.
    } else if (activeTool === 'eraser') {
        drawingCtx.strokeStyle = 'white'; // The "eraser" simply paints with the background color.
        drawingCtx.globalCompositeOperation = 'source-over';
    }

    // Draw the line segment.
    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY); // Start from the last point.
    drawingCtx.lineTo(x, y);       // Draw a line to the new point.
    drawingCtx.stroke();           // Render the line.

    // Update the last known coordinates for the next segment.
    lastX = x;
    lastY = y;
}

/**
 * Sets the drawing state to false, effectively stopping the current drawing stroke.
 * It is called on mouseup or mouseleave events.
 * @param {function} onDrawEnd - The callback function to be executed to save the final state to history.
 */
export function stopDrawing(onDrawEnd) {
    // Check if we were drawing to avoid redundant calls.
    if (isDrawing) {
        isDrawing = false;
        // If a callback is provided, call it. This is used to trigger the history save.
        if (onDrawEnd) onDrawEnd();
    }
}

// --- Flood Fill Algorithm ---
// This is a classic queue-based implementation to fill a contiguous area of color.

/**
 * Fills an area of the canvas with a new color, starting from a given point.
 * @param {number} startX - The initial x-coordinate to start the fill from.
 * @param {number} startY - The initial y-coordinate.
 * @param {string} fillColor - The hex code of the color to fill with.
 * @param {CanvasRenderingContext2D} ctx - The context of the offscreen drawing canvas.
 */
function floodFill(startX, startY, fillColor, ctx) {
    // Get the entire pixel data of the canvas. This is a performance-intensive operation.
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const { width, height, data } = imageData; // Destructure for easier access.
    
    // Floor the starting coordinates to ensure they are integer pixel indices.
    const startX_scaled = Math.floor(startX);
    const startY_scaled = Math.floor(startY);

    // Get the color of the pixel where the user clicked. This is the color we need to replace.
    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    // Convert the hex fill color to an RGB object for comparison.
    const fillColorRgb = hexToRgb(fillColor);

    // If the target color is already the fill color, there's nothing to do.
    if (colorsMatch(targetColor, fillColorRgb)) return;

    // The queue stores pixels that we need to check.
    const queue = [[startX_scaled, startY_scaled]];
    // `visited` prevents us from checking the same pixel multiple times.
    const visited = new Set([`${startX_scaled},${startY_scaled}`]);

    // Process the queue until it's empty.
    while (queue.length > 0) {
        const [x, y] = queue.shift(); // Get the next pixel to check.
        
        // Ensure the pixel is within the canvas bounds.
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const currentColor = getPixelColor(x, y, width, data);
        
        // If the current pixel's color matches the target color...
        if (colorsMatch(currentColor, targetColor)) {
            // ...change its color to the fill color.
            setPixelColor(x, y, fillColorRgb, width, data);
            
            // Add its neighbors (up, down, left, right) to the queue to be checked.
            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (const [nx, ny] of neighbors) {
                const key = `${nx},${ny}`;
                // Only add the neighbor if it hasn't been visited yet and is within bounds.
                if (!visited.has(key) && (nx >= 0 && nx < width && ny >= 0 && ny < height)) {
                    queue.push([nx, ny]);
                    visited.add(key);
                }
            }
        }
    }
    // After processing, write the modified pixel data back to the canvas.
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Helper to get the RGBA color of a specific pixel from the image data array.
 * @param {number} x - The x-coordinate of the pixel.
 * @param {number} y - The y-coordinate.
 * @param {number} width - The width of the canvas.
 * @param {Uint8ClampedArray} data - The array of pixel data.
 * @returns {object} An object with r, g, b, a properties.
 */
function getPixelColor(x, y, width, data) {
    const index = (y * width + x) * 4; // Each pixel takes up 4 spots in the array (R, G, B, A).
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}

/**
 * Helper to set the color of a specific pixel in the image data array.
 * @param {number} x - The x-coordinate of the pixel.
 * @param {number} y - The y-coordinate.
 * @param {object} color - An object with r, g, b properties.
 * @param {number} width - The width of the canvas.
 * @param {Uint8ClampedArray} data - The array of pixel data to modify.
 */
function setPixelColor(x, y, color, width, data) {
    const index = (y * width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255; // Set alpha to fully opaque.
}

/**
 * Helper to check if two RGBA color objects are identical.
 * @param {object} c1 - The first color object.
 * @param {object} c2 - The second color object.
 * @returns {boolean} True if the colors match.
 */
function colorsMatch(c1, c2) {
    return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
}

/**
 * Helper to convert a CSS hex color string (e.g., "#FF5733") into an RGBA object.
 * @param {string} hex - The hex color string.
 * @returns {object} An object with r, g, b, a properties.
 */
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b, a: 255 }; // Assume full opacity.
}

