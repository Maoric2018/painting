// --- Import necessary functions from other modules ---
import { handleCanvasClick, draw, stopDrawing, redrawCanvas } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength, initializeHistoryForLayer, deleteHistoryForLayer } from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom, setContexts } from './viewport.js';
import { addNewLayer, deleteActiveLayer, getActiveLayer, updateActiveLayerThumbnail } from './layers.js';
import { startSelection, addPointToSelection, endSelection, getSelectionState, clearSelection, pasteSelection, startMove, moveSelection, isPointInSelection } from './selection.js';

let activeTool = 'brush';
let isInteracting = false; // A general flag for mouse down on canvas

/**
 * Initializes all UI event listeners.
 * @param {object} elements - An object containing all the DOM elements.
 */
export function initializeUI(elements) {
    const { toolButtons, brushSizeSlider, brushSizeValue, undoBtn, redoBtn, canvas, brushPreview, colorPicker, addLayerBtn, deleteLayerBtn } = elements;
    
    function animationLoop() {
        redrawCanvas(elements);
        requestAnimationFrame(animationLoop);
    }
    animationLoop();

    const fullRedraw = () => redrawCanvas(elements);
    
    /**
     * Updates the cursor style and brush preview based on the active tool and mouse position.
     * @param {MouseEvent} e - The mouse event.
     * @param {boolean} isOverCanvas - Whether the mouse is currently over the canvas.
     */
    function updateCursor(e, isOverCanvas = false) { // MODIFIED: Added isOverCanvas parameter
        const currentClasses = canvas.className;
        let newCursorClass = 'default-cursor';
        // MODIFIED: Do not hide the preview by default here, to prevent flickering on mousemove.
        // The mouseleave event is now solely responsible for hiding it.

        const selection = getSelectionState();
        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);

        if (activeTool === 'pan') {
            newCursorClass = isInteracting ? 'panning-cursor' : 'pan-cursor';
        } else if (activeTool === 'move' && selection.isFloating) {
            if (isPointInSelection(transformedPoint.x, transformedPoint.y)) {
                newCursorClass = 'move-cursor';
            }
        } else if (['brush', 'eraser'].includes(activeTool)) {
            // MODIFIED: Only show the preview if the cursor is over the canvas.
            if (isOverCanvas) {
                brushPreview.classList.remove('hidden');
            }
            newCursorClass = 'no-cursor';
        }
        
        if (!currentClasses.includes(newCursorClass)) {
            canvas.className = 'w-full h-full bg-white rounded-md shadow-inner ' + newCursorClass;
        }
    }

    function updateBrushPreviewSize() {
        const dpr = window.devicePixelRatio || 1;
        const size = (brushSizeSlider.value * getZoom()) / dpr;
        brushPreview.style.width = `${size}px`;
        brushPreview.style.height = `${size}px`;
    }
    
    /**
     * Commits the current floating selection to the active layer, saves history, and clears the selection state.
     */
    function commitSelection() {
        const selection = getSelectionState();
        if (!selection.isFloating) {
            clearSelection();
            return;
        }

        const activeLayer = getActiveLayer();
        if (activeLayer) {
            pasteSelection(activeLayer.ctx);
            clearSelection();
            onDrawEnd();
        } else {
            clearSelection();
        }
    }

    // --- Global Event Listener for Keys ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
            if (getSelectionState().isFloating) {
                commitSelection();
                e.preventDefault();
            }
        }
    });

    // --- Canvas Event Listeners ---
    canvas.addEventListener('mouseenter', (e) => updateCursor(e, true)); // MODIFIED: Pass true
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        if (isInteracting) {
            if (activeTool === 'lasso' && getSelectionState().isDrawing) {
                const activeLayer = getActiveLayer();
                if (activeLayer) endSelection(activeLayer.ctx);
            }
            stopDrawing(() => onDrawEnd());
            isInteracting = false;
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        isInteracting = true;
        const activeLayer = getActiveLayer();
        if (!activeLayer) { isInteracting = false; return; }

        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
        const selection = getSelectionState();

        if (activeTool === 'pan') {
            startPan(e);
        } else if (activeTool === 'lasso') {
            if (selection.isFloating && !isPointInSelection(transformedPoint.x, transformedPoint.y)) {
                commitSelection();
            }
            startSelection(transformedPoint.x, transformedPoint.y, commitSelection);
        } else if (activeTool === 'move') {
            if (selection.isFloating) {
                if (isPointInSelection(transformedPoint.x, transformedPoint.y)) {
                    startMove(transformedPoint.x, transformedPoint.y);
                } else {
                    commitSelection();
                }
            }
        } else { // Brush, Eraser, Fill
            const state = { activeLayer, activeTool, colorPicker, brushSizeSlider };
            handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd());
        }
        updateCursor(e, true); // MODIFIED: Pass true
    });

    canvas.addEventListener('mousemove', (e) => {
        const parentRect = canvas.parentElement.getBoundingClientRect();
        brushPreview.style.left = `${e.clientX - parentRect.left}px`;
        brushPreview.style.top = `${e.clientY - parentRect.top}px`;
        updateCursor(e, true); // MODIFIED: Pass true

        if (!isInteracting) return;
        
        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);

        if (activeTool === 'pan') {
            pan(e, fullRedraw);
            return;
        }
        
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;

        if (activeTool === 'lasso') {
            addPointToSelection(transformedPoint.x, transformedPoint.y);
        } else if (activeTool === 'move') {
            moveSelection(transformedPoint.x, transformedPoint.y);
        } else {
            const state = { activeLayer, activeTool, colorPicker, brushSizeSlider };
            draw(transformedPoint.x, transformedPoint.y, state);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!isInteracting) return;
        isInteracting = false;

        const activeLayer = getActiveLayer();
        if (activeTool === 'pan') {
            stopPan();
        } else if (activeTool === 'lasso') {
            if (activeLayer) {
                endSelection(activeLayer.ctx);
                onDrawEnd(); // Save history for the clear action
            }
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            stopDrawing(() => onDrawEnd());
        }
        updateCursor(e, true); // MODIFIED: Pass true
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize();
    }, { passive: false });

    // --- Toolbar & Layer Panel Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
            updateCursor(e, false); // MODIFIED: Pass false
        });
    });

    // ADDED: Call this once on startup to fix the initial visibility glitch.
    updateBrushPreviewSize(); 

    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    undoBtn.addEventListener('click', () => {
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;
        undo(activeLayer.id, activeLayer.ctx);
        updateUndoRedoButtons();
        updateActiveLayerThumbnail();
    });

    redoBtn.addEventListener('click', () => {
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;
        redo(activeLayer.id, activeLayer.ctx);
        updateUndoRedoButtons();
        updateActiveLayerThumbnail();
    });

    addLayerBtn.addEventListener('click', () => {
        const newLayer = addNewLayer(canvas.width, canvas.height);
        initializeHistoryForLayer(newLayer.id, newLayer.ctx, newLayer.canvas);
    });

    deleteLayerBtn.addEventListener('click', () => {
        const layerToDelete = getActiveLayer();
        if (layerToDelete) {
            // Using a custom modal or alert would be better, but confirm is simple for now.
            if (confirm('Are you sure you want to delete this layer? This action cannot be undone.')) {
                deleteHistoryForLayer(layerToDelete.id);
                deleteActiveLayer();
            }
        }
    });
    
    document.addEventListener('activelayerchanged', () => {
        const newActiveLayer = getActiveLayer();
        if (newActiveLayer) {
            setContexts(elements.ctx, newActiveLayer.ctx);
        }
        updateUndoRedoButtons();
    });

    document.addEventListener('requestRedraw', fullRedraw);

    function updateUndoRedoButtons() {
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            undoBtn.disabled = getHistoryLength(activeLayer.id) <= 1;
            redoBtn.disabled = getRedoStackLength(activeLayer.id) === 0;
        } else {
            undoBtn.disabled = true;
            redoBtn.disabled = true;
        }
    }

    function onDrawEnd() {
        const activeLayer = getActiveLayer();
        if (activeLayer) {
            saveState(activeLayer.id, activeLayer.ctx, activeLayer.canvas);
            updateUndoRedoButtons();
            updateActiveLayerThumbnail();
        }
    }
    
    updateUndoRedoButtons(); // Initial State Call
}