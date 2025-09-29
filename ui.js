// --- Import necessary functions from other modules ---
import { handleCanvasClick, draw, stopDrawing, redrawCanvas, pickColorAt, drawZoomPreview } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength, initializeHistoryForLayer, deleteHistoryForLayer } from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom, setContexts } from './viewport.js';
// MODIFIED: Added getLayerById
import { addNewLayer, deleteActiveLayer, getActiveLayer, updateActiveLayerThumbnail, setActiveLayer, getLayerById } from './layers.js';
import { startSelection, addPointToSelection, endSelection, getSelectionState, clearSelection, pasteSelection, startMove, moveSelection, isPointInSelection, deleteSelectionContents } from './selection.js';

let activeTool = 'brush';
let previousTool = 'brush';
let isInteracting = false;
let interactionLayer = null;

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
    
    /**
     * Commits the current floating selection to the active layer, saves history, and clears the selection state.
     */
    function commitSelection() {
        const selection = getSelectionState();
        if (!selection.isFloating) {
            clearSelection();
            return;
        }

        // MODIFIED: Find the layer the selection originally came from using its stored ID
        const originLayer = getLayerById(selection.originLayerId);

        if (originLayer) {
            // Paste the selection onto its original layer
            pasteSelection(originLayer.ctx);
            clearSelection();
            onDrawEnd(originLayer); // Save history for the correct layer
        } else {
            // Failsafe in case the original layer was deleted, then just clear selection
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
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault(); 
                const activeLayer = getActiveLayer();
                if (activeLayer) {
                    deleteSelectionContents(activeLayer.ctx);
                    onDrawEnd(); 
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
                if (interactionLayer) endSelection(interactionLayer);
            }
            stopDrawing(() => onDrawEnd(interactionLayer));
            isInteracting = false;
            interactionLayer = null;
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        isInteracting = true;
        interactionLayer = getActiveLayer(); 

        if (!interactionLayer && activeTool !== 'pan') { 
            isInteracting = false;
            interactionLayer = null;
            return; 
        }

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
            isInteracting = false;
            interactionLayer = null;
            return;
        }
        
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
            const state = { activeLayer: interactionLayer, activeTool, colorPicker, brushSizeSlider };
            handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd(interactionLayer));
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
        
        if (!interactionLayer) return;

        if (activeTool === 'lasso') {
            addPointToSelection(transformedPoint.x, transformedPoint.y);
        } else if (activeTool === 'move') {
            moveSelection(transformedPoint.x, transformedPoint.y);
        } else {
            const state = { activeLayer: interactionLayer, activeTool, colorPicker, brushSizeSlider };
            draw(transformedPoint.x, transformedPoint.y, state);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!isInteracting) return;

        if (activeTool === 'pan') {
            stopPan();
        } else if (activeTool === 'lasso') {
            if (interactionLayer) {
                // MODIFIED: Pass the full layer object to record its ID
                endSelection(interactionLayer); 
                onDrawEnd(interactionLayer);
                setActiveLayer(interactionLayer.id);
            }
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            stopDrawing(() => onDrawEnd(interactionLayer));
        }
        updateCursor(e, true);
        
        isInteracting = false;
        interactionLayer = null;
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize();
    }, { passive: false });

    // --- Toolbar & Layer Panel Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            if (getSelectionState().isFloating && !['move', 'eyedropper'].includes(button.id)) {
                commitSelection();
            }
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
    
    function onDrawEnd(targetLayer = null) {
        const layerToUpdate = targetLayer || getActiveLayer();
        if (layerToUpdate) {
            saveState(layerToUpdate.id, layerToUpdate.ctx, layerToUpdate.canvas);
            updateUndoRedoButtons();
            updateActiveLayerThumbnail(); 
        }
    }
    
    updateUndoRedoButtons();
}