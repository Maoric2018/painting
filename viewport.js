// --- Viewport Management Module ---
// This module handles all the logic for panning, zooming, and coordinate transformation.

// --- Private Module State ---
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

let visibleCtx = null;
let drawingCtx = null;

/**
 * Sets or updates the canvas contexts that the viewport will operate on.
 * @param {CanvasRenderingContext2D} mainCtx - The context of the main, on-screen canvas.
 * @param {CanvasRenderingContext2D} activeLayerCtx - The context of the currently active layer.
 */
export function setContexts(mainCtx, activeLayerCtx) {
    visibleCtx = mainCtx;
    drawingCtx = activeLayerCtx;
}

/**
 * Applies the current zoom and pan transformation to the main visible canvas context.
 */
export function applyTransform() {
    if (!visibleCtx) return;
    visibleCtx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY);
}

/**
 * Converts screen coordinates (CSS pixels) to the transformed "world" coordinates on the drawing canvas.
 * This function is the key to fixing the drawing offset.
 * @param {number} x - The x-coordinate on the screen/visible canvas (in CSS pixels).
 * @param {number} y - The y-coordinate on the screen/visible canvas (in CSS pixels).
 * @returns {{x: number, y: number}} The transformed coordinates.
 */
export function getTransformedPoint(x, y) {
    if (!visibleCtx) return { x, y };
    const dpr = window.devicePixelRatio || 1;
    
    // 1. Scale the incoming CSS pixel coordinates to match the canvas's high-resolution backing store.
    const scaledX = x * dpr;
    const scaledY = y * dpr;
    
    // 2. Reverse the pan and zoom transformations to find the point on the abstract drawing surface.
    const invX = (scaledX - offsetX) / zoom;
    const invY = (scaledY - offsetY) / zoom;
    return { x: invX, y: invY };
}

/**
 * Handles the zoom logic based on a mouse wheel event, now correctly handling devicePixelRatio.
 * @param {WheelEvent} e - The mouse wheel event.
 * @param {function} onUpdate - A callback function to trigger a redraw.
 */
export function zoomOnWheel(e, onUpdate) {
    const zoomFactor = 1.1;
    if (!visibleCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = visibleCtx.canvas.getBoundingClientRect();
    
    // Use CSS pixels for mouse position relative to the element
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Get the canvas point before zoom. We pass the CSS pixels; getTransformedPoint will handle scaling.
    const point = getTransformedPoint(mouseX, mouseY);

    if (e.deltaY < 0) {
        zoom *= zoomFactor;
    } else {
        zoom /= zoomFactor;
    }
    zoom = Math.max(0.1, Math.min(zoom, 10)); // Clamp zoom level

    // Get the new screen point of the original canvas point.
    const newScreenX = point.x * zoom + offsetX;
    const newScreenY = point.y * zoom + offsetY;

    // Adjust offset to keep the point under the mouse.
    // The adjustment is between the SCALED mouse position and the new projected screen position.
    offsetX += (mouseX * dpr) - newScreenX;
    offsetY += (mouseY * dpr) - newScreenY;

    onUpdate();
}

/**
 * Starts a pan operation.
 * @param {MouseEvent} e - The mousedown event.
 */
export function startPan(e) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
}

/**
 * Stops the pan operation.
 */
export function stopPan() {
    isPanning = false;
}

/**
 * Updates the offset based on mouse movement during a pan, now correctly handling devicePixelRatio.
 * @param {MouseEvent} e - The mousemove event.
 * @param {function} onUpdate - A callback to trigger a redraw.
 */
export function pan(e, onUpdate) {
    if (!isPanning) return;
    const dpr = window.devicePixelRatio || 1;
    
    // The change in mouse position (dx, dy) is in CSS pixels.
    // We must scale it by DPR to match the canvas's high-resolution coordinate system.
    const dx = (e.clientX - panStartX) * dpr;
    const dy = (e.clientY - panStartY) * dpr;

    offsetX += dx;
    offsetY += dy;

    panStartX = e.clientX;
    panStartY = e.clientY;

    onUpdate();
}

/**
 * Gets the current zoom level.
 * @returns {number}
 */
export function getZoom() {
    return zoom;
}

