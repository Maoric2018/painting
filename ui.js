// --- Import necessary functions from other modules ---
// canvas.js: Core drawing logic (handling clicks, drawing lines, stopping).
import { handleCanvasClick, draw, stopDrawing, redrawCanvas } from './canvas.js';
// history.js: Undo/redo functionality.
import { saveState, undo, redo, getHistoryLength, getRedoStackLength } from './history.js';
// viewport.js: Panning and zooming logic.
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom } from './viewport.js';

// --- Module-level State ---
// This variable tracks the currently selected tool (e.g., 'brush', 'eraser', 'pan').
let activeTool = 'brush';

/**
 * Initializes all user interface event listeners and connects them to the application's logic.
 * This function acts as the central hub for all user interactions.
 * @param {object} elements - An object containing references to all necessary DOM elements.
 */
export function initializeUI(elements) {
    // Destructure the elements object for easier access to individual DOM nodes.
    const { toolButtons, brushSizeSlider, brushSizeValue, clearCanvasBtn, undoBtn, redoBtn, canvas, brushPreview, drawingCtx, drawingCanvas, colorPicker } = elements;

    // A helper function to trigger a full redraw of the canvas.
    // This is passed as a callback to viewport functions so they can trigger a repaint after a pan or zoom.
    const fullRedraw = () => redrawCanvas(elements);
    
    // --- Canvas Cursor and Preview Handlers ---

    /**
     * Updates the CSS cursor style based on the active tool.
     * For drawing tools, it hides the default cursor to show the custom preview circle.
     * For the pan tool, it shows a grab/grabbing hand cursor.
     */
    function updateCursor() {
        // Reset all cursor-related classes first.
        canvas.classList.remove('pan-cursor', 'panning-cursor', 'no-cursor', 'default-cursor');
        if (activeTool === 'pan') {
            canvas.classList.add('pan-cursor');
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            // Hide the system cursor to allow the custom div-based preview to be the only cursor.
            canvas.classList.add('no-cursor');
        } else {
            canvas.classList.add('default-cursor');
        }
    }

    /**
     * Updates the size of the brush preview circle.
     * The visual size is a combination of the selected brush size and the current canvas zoom level.
     */
    function updateBrushPreviewSize() {
        const size = brushSizeSlider.value * getZoom();
        brushPreview.style.width = `${size}px`;
        brushPreview.style.height = `${size}px`;
    }
    
    // --- Canvas Event Listeners ---
    // These listeners handle all direct interactions with the canvas element.

    // When the mouse enters the canvas area, show the custom brush preview (if not panning).
    canvas.addEventListener('mouseenter', () => {
        if (activeTool !== 'pan') {
            brushPreview.classList.remove('hidden');
        }
    });
    
    // When the mouse leaves the canvas, hide the preview and stop any ongoing drawing action.
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        stopDrawing(() => onDrawEnd()); // Stop drawing and save the state if needed.
    });

    // Handles the start of an action when the mouse button is pressed down.
    canvas.addEventListener('mousedown', (e) => {
        if (activeTool === 'pan') {
            startPan(e); // Begin a pan operation.
            canvas.classList.replace('pan-cursor', 'panning-cursor');
            return; // Stop further execution for the pan tool.
        }
        
        // For drawing tools, prepare the state object to be passed to the drawing logic.
        const state = { drawingCtx, drawingCanvas, activeTool, colorPicker, brushSizeSlider };
        
        // Calculate the mouse position relative to the canvas element.
        const canvasRect = canvas.getBoundingClientRect();
        const mouseXInCanvas = e.clientX - canvasRect.left;
        const mouseYInCanvas = e.clientY - canvasRect.top;
        
        // Convert the on-screen coordinates to the potentially zoomed/panned "world" coordinates of the drawing.
        const transformedPoint = getTransformedPoint(mouseXInCanvas, mouseYInCanvas);
        
        // Call the main click handler in canvas.js to start the drawing or fill action.
        handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd());
        fullRedraw();
    });

    // Handles continuous actions as the mouse moves across the canvas.
    canvas.addEventListener('mousemove', (e) => {
        if (activeTool === 'pan') {
            pan(e, fullRedraw); // If panning, update the canvas view.
            return;
        }

        // --- Brush Preview and Drawing Coordinate Calculation ---
        // This section is critical for ensuring the preview circle and the actual paint stroke are perfectly aligned.
        
        // 1. Get the parent container's position. The preview circle is a DOM element positioned relative to this parent.
        const parentRect = canvas.parentElement.getBoundingClientRect();

        // 2. Calculate the mouse's position relative to the PARENT container.
        const mouseXInParent = e.clientX - parentRect.left;
        const mouseYInParent = e.clientY - parentRect.top;

        // 3. Position the center of the preview circle directly under the mouse cursor.
        const previewSize = parseFloat(brushPreview.style.width) || (brushSizeSlider.value * getZoom());
        //console.log(parseFloat(brushPreview.style.width));
        brushPreview.style.left = `${mouseXInParent}px`;
        brushPreview.style.top = `${mouseYInParent}px`;

        // 4. For the actual drawing logic, calculate the mouse's position relative to the CANVAS element itself.
        const canvasRect = canvas.getBoundingClientRect();
        const mouseXInCanvas = e.clientX - canvasRect.left;
        const mouseYInCanvas = e.clientY - canvasRect.top;
        
        // 5. Transform these canvas-relative coordinates into the "world" space and pass them to the draw function.
        const state = { drawingCtx, activeTool, colorPicker, brushSizeSlider };
        const transformedPoint = getTransformedPoint(mouseXInCanvas, mouseYInCanvas);
        draw(transformedPoint.x, transformedPoint.y, state);
        fullRedraw(); // Redraw the canvas to show the new stroke.
    });
    
    // Handles the end of an action when the mouse button is released.
    canvas.addEventListener('mouseup', () => {
        if (activeTool === 'pan') {
            stopPan(); // End the pan operation.
            canvas.classList.replace('panning-cursor', 'pan-cursor');
            return;
        }
        stopDrawing(() => onDrawEnd()); // Stop the drawing stroke and save it to history.
    });

    // Handles zooming in and out using the mouse wheel.
    canvas.addEventListener('wheel', (e) => {
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize(); // The preview circle's visual size changes with zoom.
    }, { passive: false }); // `passive: false` is needed to allow preventDefault() inside zoomOnWheel.

    // --- Toolbar Event Listeners ---
    // These listeners handle interactions with the buttons and sliders in the sidebar.

    // Set up click handlers for all tool selection buttons.
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Manage the "active" class for visual feedback.
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            // Update the global activeTool variable.
            activeTool = button.id;
            updateCursor(); // Change the cursor to match the new tool.
            // Hide the brush preview if the pan tool is selected.
            if (activeTool === 'pan') {
                brushPreview.classList.add('hidden');
            }
        });
    });

    // Update the brush size value display and preview circle when the slider is moved.
    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    // Clear the entire drawing canvas.
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            // Fill the offscreen drawing canvas with white.
            drawingCtx.fillStyle = 'white';
            drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            onDrawEnd(); // Save this cleared state to history.
            fullRedraw();
        });
    }

    // Trigger the undo action.
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            undo(drawingCtx);
            updateUndoRedoButtons();
            fullRedraw();
        });
    }

    // Trigger the redo action.
    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            redo(drawingCtx);
            updateUndoRedoButtons();
            fullRedraw();
        });
    }

    // --- Helper Functions ---

    /**
     * Enables or disables the undo/redo buttons based on the history state.
     * This prevents users from trying to undo or redo when there's nothing to change.
     */
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = getHistoryLength() <= 1;
        if (redoBtn) redoBtn.disabled = getRedoStackLength() === 0;
    }

    /**
     * A callback function that is called whenever a drawing action is completed.
     * It saves the new canvas state to history and updates the UI buttons.
     */
    function onDrawEnd() {
        saveState(drawingCtx, drawingCanvas);
        updateUndoRedoButtons();
    }
    
    // --- Initial State Calls ---
    // These functions are run once at startup to ensure the UI is in the correct initial state.
    updateCursor();
    updateBrushPreviewSize();
    updateUndoRedoButtons();
}

