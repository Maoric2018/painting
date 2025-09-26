import { handleCanvasClick, draw, stopDrawing, redrawCanvas } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength } from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom } from './viewport.js';

let activeTool = 'brush';

/**
 * Initializes all UI event listeners.
 * @param {object} elements - An object containing all the DOM elements.
 */
export function initializeUI(elements) {
    const { toolButtons, brushSizeSlider, brushSizeValue, clearCanvasBtn, undoBtn, redoBtn, canvas, brushPreview, drawingCtx, drawingCanvas, colorPicker } = elements;

    const fullRedraw = () => redrawCanvas(elements);
    
    // --- Canvas Cursor and Preview Handlers ---
    function updateCursor() {
        canvas.classList.remove('pan-cursor', 'panning-cursor', 'no-cursor', 'default-cursor');
        if (activeTool === 'pan') {
            canvas.classList.add('pan-cursor');
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            canvas.classList.add('no-cursor');
        } else {
            canvas.classList.add('default-cursor');
        }
    }

    function updateBrushPreviewSize() {
        const size = brushSizeSlider.value * getZoom();
        brushPreview.style.width = `${size}px`;
        brushPreview.style.height = `${size}px`;
    }
    
    // --- Canvas Event Listeners ---
    canvas.addEventListener('mouseenter', () => {
        if (activeTool !== 'pan') {
            brushPreview.classList.remove('hidden');
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        stopDrawing(() => onDrawEnd());
    });

    canvas.addEventListener('mousedown', (e) => {
        if (activeTool === 'pan') {
            startPan(e);
            canvas.classList.replace('pan-cursor', 'panning-cursor');
            return;
        }
        const state = { drawingCtx, drawingCanvas, activeTool, colorPicker, brushSizeSlider };
        
        const canvasRect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;
        
        const transformedPoint = getTransformedPoint(canvasX, canvasY);
        handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd());
        fullRedraw();
    });

    canvas.addEventListener('mousemove', (e) => {
        const canvasRect = canvas.getBoundingClientRect();

        // Update brush preview position relative to the visible canvas
        const previewX = e.clientX - canvasRect.left;
        const previewY = e.clientY - canvasRect.top;
        const previewSize = parseFloat(brushPreview.style.width) || (brushSizeSlider.value * getZoom());
        brushPreview.style.left = `${previewX - (previewSize / 2)}px`;
        brushPreview.style.top = `${previewY - (previewSize / 2)}px`;

        // Handle panning
        if (activeTool === 'pan') {
            pan(e, fullRedraw);
            return;
        }

        // Handle drawing
        const state = { drawingCtx, activeTool, colorPicker, brushSizeSlider };
        const transformedPoint = getTransformedPoint(previewX, previewY);
        draw(transformedPoint.x, transformedPoint.y, state);
        fullRedraw();
    });
    
    canvas.addEventListener('mouseup', () => {
        if (activeTool === 'pan') {
            stopPan();
            canvas.classList.replace('panning-cursor', 'pan-cursor');
            return;
        }
        stopDrawing(() => onDrawEnd());
    });

    canvas.addEventListener('wheel', (e) => {
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize(); // Update preview size on zoom
    }, { passive: false });

    // --- Toolbar Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
            updateCursor();
            if (activeTool === 'pan') {
                brushPreview.classList.add('hidden');
            }
        });
    });

    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            drawingCtx.fillStyle = 'white';
            drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            onDrawEnd();
            fullRedraw();
        });
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            undo(drawingCtx);
            updateUndoRedoButtons();
            fullRedraw();
        });
    }

    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            redo(drawingCtx);
            updateUndoRedoButtons();
            fullRedraw();
        });
    }

    // --- Helper Functions ---
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = getHistoryLength() <= 1;
        if (redoBtn) redoBtn.disabled = getRedoStackLength() === 0;
    }

    function onDrawEnd() {
        saveState(drawingCtx, drawingCanvas);
        updateUndoRedoButtons();
    }
    
    // --- Initial State Calls ---
    updateCursor();
    updateBrushPreviewSize();
    updateUndoRedoButtons();
}

