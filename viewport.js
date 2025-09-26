// --- State Variables ---
// These variables track the "camera" view on the main drawing canvas.
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// --- Core Functions ---

/**
 * Applies the current zoom and pan transformation to the visible canvas context.
 * It clears the visible canvas, applies the transform, and then draws the
 * offscreen drawing canvas onto the visible one.
 * @param {CanvasRenderingContext2D} visibleCtx - The context of the canvas the user sees.
 * @param {HTMLCanvasElement} drawingCanvas - The offscreen canvas that holds the actual drawing.
 */
export function applyTransform(visibleCtx, drawingCanvas) {
    const visibleCanvas = visibleCtx.canvas;
    
    // Reset transform, clear the visible canvas with the background color.
    visibleCtx.save();
    visibleCtx.setTransform(1, 0, 0, 1, 0, 0);
    visibleCtx.fillStyle = '#1f2937'; // bg-slate-800
    visibleCtx.fillRect(0, 0, visibleCanvas.width, visibleCanvas.height);
    visibleCtx.restore();

    // Apply the zoom and offset for the "camera"
    visibleCtx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY);
    
    // Draw the entire offscreen canvas (the drawing) onto the visible one.
    visibleCtx.drawImage(drawingCanvas, 0, 0);
}

/**
 * Converts screen coordinates (like a mouse click) into the coordinate
 * system of the offscreen drawing canvas.
 * @param {number} x - The x-coordinate from the mouse event.
 * @param {number} y - The y-coordinate from the mouse event.
 * @returns {{x: number, y: number}} The transformed point.
 */
export function getTransformedPoint(x, y) {
    const transformedX = (x - offsetX) / zoom;
    const transformedY = (y - offsetY) / zoom;
    return { x: transformedX, y: transformedY };
}

/**
 * Handles the mouse wheel event to zoom in or out.
 * @param {WheelEvent} e - The wheel event.
 * @param {function} onUpdate - Callback function to run after the view changes.
 */
export function zoomOnWheel(e, onUpdate) {
    e.preventDefault();
    const scaleAmount = 1.1;
    const mouseX = e.clientX - e.target.getBoundingClientRect().left;
    const mouseY = e.clientY - e.target.getBoundingClientRect().top;
    
    const worldX = (mouseX - offsetX) / zoom;
    const worldY = (mouseY - offsetY) / zoom;

    if (e.deltaY < 0) { // Zoom in
        zoom *= scaleAmount;
    } else { // Zoom out
        zoom /= scaleAmount;
    }
    
    // Clamp zoom to reasonable limits
    zoom = Math.max(0.1, Math.min(zoom, 20));

    offsetX = mouseX - worldX * zoom;
    offsetY = mouseY - worldY * zoom;
    
    onUpdate();
}

/**
 * Begins a pan operation.
 * @param {MouseEvent} e - The mouse down event.
 */
export function startPan(e) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
}

/**
 * Ends a pan operation.
 */
export function stopPan() {
    isPanning = false;
}

/**
 * Updates the canvas offset during a pan operation.
 * @param {MouseEvent} e - The mouse move event.
 * @param {function} onUpdate - Callback function to run after the view changes.
 */
export function pan(e, onUpdate) {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    
    offsetX += dx;
    offsetY += dy;

    panStartX = e.clientX;
    panStartY = e.clientY;
    
    onUpdate();
}

/**
 * Gets the current zoom level.
 * @returns {number} The current zoom factor.
 */
export function getZoom() {
    return zoom;
}

