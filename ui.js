// --- Import necessary functions from other modules ---
import { handleCanvasClick, draw, stopDrawing, redrawCanvas, pickColorAt, drawZoomPreview } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength, initializeHistoryForLayer, deleteHistoryForLayer } from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom, setContexts } from './viewport.js';
import { addNewLayer, deleteActiveLayer, getActiveLayer, updateActiveLayerThumbnail } from './layers.js';
// MODIFIED: Added deleteSelectionContents
import { startSelection, addPointToSelection, endSelection, getSelectionState, clearSelection, pasteSelection, startMove, moveSelection, isPointInSelection, deleteSelectionContents } from './selection.js';

let activeTool = 'brush';
let previousTool = 'brush'; 
let isInteracting = false; 

/**
 * Initializes all UI event listeners.
 * @param {object} elements - An object containing all the DOM elements.
 */
export function initializeUI(elements) {
    const { toolButtons, brushSizeSlider, brushSizeValue, undoBtn, redoBtn, canvas, brushPreview, colorPicker, addLayerBtn, deleteLayerBtn, zoomPreviewContainer, zoomPreviewCanvas } = elements;
    
    function animationLoop() {
        redrawCanvas(elements);
        requestAnimationFrame(animationLoop);
    }
    animationLoop();

    const fullRedraw = () => redrawCanvas(elements);
    
    function updateCursor(e, isOverCanvas = false) {
        const currentClasses = canvas.className;
        let newCursorClass = 'default-cursor';
        
        brushPreview.classList.add('hidden');
        zoomPreviewContainer.classList.add('hidden');

        const selection = getSelectionState();
        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);

        if (activeTool === 'pan') {
            newCursorClass = isInteracting ? 'panning-cursor' : 'pan-cursor';
        } else if (activeTool === 'move' && selection.isFloating) {
            if (isPointInSelection(transformedPoint.x, transformedPoint.y)) {
                newCursorClass = 'move-cursor';
            }
        } else if (['brush', 'eraser'].includes(activeTool)) {
            if (isOverCanvas) {
                brushPreview.classList.remove('hidden');
            }
            newCursorClass = 'no-cursor';
        } else if (activeTool === 'eyedropper') {
            if (isOverCanvas) {
                zoomPreviewContainer.classList.remove('hidden');
            }
            newCursorClass = 'eyedropper-cursor';
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
        const selection = getSelectionState();
        if (selection.isFloating) {
            if (e.key === 'Escape' || e.key === 'Enter') {
                commitSelection();
                e.preventDefault();
            } 
            // MODIFIED: Added handler for Delete and Backspace keys
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault(); // Prevent browser back navigation on backspace
                const activeLayer = getActiveLayer();
                if (activeLayer) {
                    deleteSelectionContents(activeLayer.ctx);
                    onDrawEnd(); // Save the deletion to history
                }
            }
        }
    });

    // --- Canvas Event Listeners ---
    canvas.addEventListener('mouseenter', (e) => updateCursor(e, true));
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        zoomPreviewContainer.classList.add('hidden');
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
        const activeLayer = getActiveLayer();
        if (!activeLayer && activeTool !== 'pan') { return; }

        if (activeTool === 'eyedropper') {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const screenX = (e.clientX - rect.left) * dpr;
            const screenY = (e.clientY - rect.top) * dpr;
            
            const color = pickColorAt(elements.ctx, screenX, screenY);
            colorPicker.value = color;
            
            const prevToolButton = document.getElementById(previousTool);
            if (prevToolButton) {
                prevToolButton.click();
            }
            return;
        }
        
        isInteracting = true;
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
        updateCursor(e, true);
    });

    canvas.addEventListener('mousemove', (e) => {
        const parentRect = canvas.parentElement.getBoundingClientRect();
        const previewLeft = `${e.clientX - parentRect.left}px`;
        const previewTop = `${e.clientY - parentRect.top}px`;
        brushPreview.style.left = previewLeft;
        brushPreview.style.top = previewTop;
        zoomPreviewContainer.style.left = previewLeft;
        zoomPreviewContainer.style.top = previewTop;
        zoomPreviewContainer.style.transform = 'translate(10px, -100%)';

        updateCursor(e, true);

        if (activeTool === 'eyedropper') {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const screenX = (e.clientX - rect.left) * dpr;
            const screenY = (e.clientY - rect.top) * dpr;
            drawZoomPreview(zoomPreviewCanvas.getContext('2d'), elements.ctx, screenX, screenY);
        }

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
                onDrawEnd();
            }
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            stopDrawing(() => onDrawEnd());
        }
        updateCursor(e, true);
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize();
    }, { passive: false });

    // --- Toolbar & Layer Panel Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            if (button.id === 'eyedropper' && activeTool !== 'eyedropper') {
                previousTool = activeTool;
            }
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
            updateCursor(e, false);
        });
    });

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