// --- Import necessary functions from other modules ---
import { handleCanvasClick, draw, stopDrawing, redrawCanvas, pickColorAt, drawZoomPreview } from './canvas.js';
// MODIFIED: Importing getLastState
import { 
    saveState, undo, redo, getHistoryLength, getRedoStackLength, 
    initializeHistoryForLayer, deleteHistoryForLayer, getPenultimateState, 
    getLastState, replaceLastStateWithMultiple 
} from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom, setContexts } from './viewport.js';
import { addNewLayer, deleteActiveLayer, getActiveLayer, updateActiveLayerThumbnail, setActiveLayer, getLayerById } from './layers.js';
import { 
    startSelection, addPointToSelection, endSelection, getSelectionState, 
    clearSelection, startMove, moveSelection, isPointInSelection, 
    deleteSelectionContents, drawOnSelection, saveSelectionState, 
    undoSelectionChange, redoSelectionChange, fillSelection, reconstructSelection
} from './selection.js';

let activeTool = 'brush';
let previousTool = 'brush';
let isInteracting = false;
let interactionLayer = null;
let lastClientX = 0;
let lastClientY = 0;
let lastUndoneSelection = null;

/** Initializes all UI event listeners. */
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

        if (activeTool === 'pan') newCursorClass = isInteracting ? 'panning-cursor' : 'pan-cursor';
        else if (activeTool === 'move' && selection.isFloating && isPointInSelection(transformedPoint.x, transformedPoint.y)) newCursorClass = 'move-cursor';
        else if (['brush', 'eraser'].includes(activeTool)) {
            if (isOverCanvas) brushPreview.classList.remove('hidden');
            newCursorClass = 'no-cursor';
        } else if (activeTool === 'eyedropper') {
            if (isOverCanvas) zoomPreviewContainer.classList.remove('hidden');
            newCursorClass = 'eyedropper-cursor';
        }
        if (!currentClasses.includes(newCursorClass)) canvas.className = 'w-full h-full bg-white rounded-md shadow-inner ' + newCursorClass;
    }

    function updateBrushPreviewSize() {
        const dpr = window.devicePixelRatio || 1;
        const size = (brushSizeSlider.value * getZoom()) / dpr;
        brushPreview.style.width = `${size}px`;
        brushPreview.style.height = `${size}px`;
    }
    
    /**
     * Commits the floating selection, merging its granular history with the main layer's history.
     */
    function commitSelection() {
        const selection = getSelectionState();
        if (!selection.isFloating) { clearSelection(); return; }

        const originLayer = getLayerById(selection.originLayerId);
        if (!originLayer) { clearSelection(); return; }

        if (selection.tempHistory.length <= 1) { 
            originLayer.ctx.drawImage(selection.tempCanvas, selection.currentX, selection.currentY);
            onDrawEnd(originLayer);
            clearSelection();
            updateUndoRedoButtons();
            return;
        }

        // MODIFIED: Use getLastState to get the canvas with the hole.
        const layerWithHoleState = getLastState(originLayer.id);
        if (!layerWithHoleState) {
            originLayer.ctx.drawImage(selection.tempCanvas, selection.currentX, selection.currentY);
            onDrawEnd(originLayer);
            clearSelection();
            return;
        }

        const tempCompositeCanvas = document.createElement('canvas');
        tempCompositeCanvas.width = originLayer.canvas.width;
        tempCompositeCanvas.height = originLayer.canvas.height;
        const tempCompositeCtx = tempCompositeCanvas.getContext('2d');
        const newHistoryStates = [];

        // Replay each step from the selection's history onto the layer with the hole.
        for (let i = 1; i < selection.tempHistory.length; i++) {
            const selectionStep = selection.tempHistory[i];
            
            // 1. Start with the state of the layer with the hole.
            tempCompositeCtx.putImageData(layerWithHoleState, 0, 0);

            const stepCanvas = document.createElement('canvas');
            stepCanvas.width = selectionStep.imageData.width;
            stepCanvas.height = selectionStep.imageData.height;
            stepCanvas.getContext('2d').putImageData(selectionStep.imageData, 0, 0);

            // 2. Draw the selection content into the hole at its correct position for that step.
            tempCompositeCtx.drawImage(stepCanvas, selectionStep.x, selectionStep.y);
            
            newHistoryStates.push(tempCompositeCtx.getImageData(0, 0, tempCompositeCanvas.width, tempCompositeCanvas.height));
        }
        
        replaceLastStateWithMultiple(originLayer.id, newHistoryStates);

        const finalState = newHistoryStates[newHistoryStates.length - 1];
        if (finalState) {
            originLayer.ctx.putImageData(finalState, 0, 0);
        }
        
        clearSelection();
        updateUndoRedoButtons();
    }

    document.addEventListener('keydown', (e) => {
        const selection = getSelectionState();
        if (selection.isFloating) {
            if (e.key === 'Escape' || e.key === 'Enter') {
                commitSelection();
                e.preventDefault();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault(); 
                deleteSelectionContents();
                updateUndoRedoButtons();
            }
        }
    });

    canvas.addEventListener('mouseenter', (e) => updateCursor(e, true));
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        zoomPreviewContainer.classList.add('hidden');
        if (isInteracting) {
            if (activeTool === 'lasso' && getSelectionState().isDrawing) {
                endSelection(interactionLayer);
                onDrawEnd(interactionLayer);
                updateUndoRedoButtons();
            }
            stopDrawing(() => onDrawEnd(interactionLayer));
            isInteracting = false;
            interactionLayer = null;
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        isInteracting = true;
        interactionLayer = getActiveLayer();
        lastClientX = e.clientX;
        lastClientY = e.clientY;

        if (!interactionLayer && activeTool !== 'pan' && !getSelectionState().isFloating) { 
            isInteracting = false; return; 
        }

        if (activeTool === 'eyedropper') {
            const color = pickColorAt(elements.ctx, (e.clientX - canvas.getBoundingClientRect().left) * (window.devicePixelRatio||1), (e.clientY - canvas.getBoundingClientRect().top) * (window.devicePixelRatio||1));
            colorPicker.value = color;
            document.getElementById(previousTool)?.click();
            isInteracting = false;
            return;
        }
        
        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
        const selection = getSelectionState();

        if (activeTool === 'pan') startPan(e);
        else if (activeTool === 'lasso') {
            if (selection.isFloating && !isPointInSelection(transformedPoint.x, transformedPoint.y)) commitSelection();
            else startSelection(transformedPoint.x, transformedPoint.y, commitSelection);
        } else if (activeTool === 'move') {
            if (selection.isFloating) {
                if (isPointInSelection(transformedPoint.x, transformedPoint.y)) startMove(transformedPoint.x, transformedPoint.y);
                else commitSelection();
            }
        } else if (activeTool === 'fill' && selection.isFloating && isPointInSelection(transformedPoint.x, transformedPoint.y)) {
            fillSelection(transformedPoint.x, transformedPoint.y, colorPicker.value);
            saveSelectionState();
            updateUndoRedoButtons();
            isInteracting = false;
        } else {
            const isDrawingInSelection = selection.isFloating && isPointInSelection(transformedPoint.x, transformedPoint.y);
            if (!isDrawingInSelection && !selection.isFloating) {
                const state = { activeLayer: interactionLayer, activeTool, colorPicker, brushSizeSlider };
                handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd(interactionLayer));
            } else if (!isDrawingInSelection && selection.isFloating) {
                commitSelection();
            }
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
            drawZoomPreview(zoomPreviewCanvas.getContext('2d'), elements.ctx, (e.clientX - canvas.getBoundingClientRect().left) * (window.devicePixelRatio||1), (e.clientY - canvas.getBoundingClientRect().top) * (window.devicePixelRatio||1));
        }

        if (!isInteracting) return;
        const transformedPoint = getTransformedPoint(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
        
        if (activeTool === 'pan') { pan(e, fullRedraw); return; }
        
        const selection = getSelectionState();
        if (activeTool === 'lasso') addPointToSelection(transformedPoint.x, transformedPoint.y);
        else if (activeTool === 'move' && selection.isFloating) moveSelection(transformedPoint.x, transformedPoint.y);
        else if (['brush', 'eraser'].includes(activeTool)) {
            const lastTransformedPoint = getTransformedPoint(lastClientX - canvas.getBoundingClientRect().left, lastClientY - canvas.getBoundingClientRect().top);
            if (selection.isFloating && (isPointInSelection(transformedPoint.x, transformedPoint.y) || isPointInSelection(lastTransformedPoint.x, lastTransformedPoint.y))) {
                const state = { activeTool, colorPicker, brushSizeSlider };
                drawOnSelection(lastTransformedPoint.x, lastTransformedPoint.y, transformedPoint.x, transformedPoint.y, state);
            } else if (!selection.isFloating) {
                const state = { activeLayer: interactionLayer, activeTool, colorPicker, brushSizeSlider };
                draw(transformedPoint.x, transformedPoint.y, state);
            }
        }
        lastClientX = e.clientX;
        lastClientY = e.clientY;
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (!isInteracting) return;
        const selection = getSelectionState();
        if (activeTool === 'pan') stopPan();
        else if (activeTool === 'lasso' && selection.isDrawing) {
            endSelection(interactionLayer);
            onDrawEnd(interactionLayer);
            updateUndoRedoButtons();
        } else if (selection.isFloating && ['move', 'brush', 'eraser'].includes(activeTool)) {
            lastUndoneSelection = null;
            saveSelectionState();
            updateUndoRedoButtons();
        } else if (['brush', 'eraser', 'fill'].includes(activeTool) && !selection.isFloating) {
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

    toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const allowedTools = ['move', 'eyedropper', 'pan', 'brush', 'eraser', 'fill'];
            if (getSelectionState().isFloating && !allowedTools.includes(button.id)) {
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
 
    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    undoBtn.addEventListener('click', () => {
        const selection = getSelectionState();
        if (selection.isFloating && selection.tempHistory.length > 1) {
            undoSelectionChange();
        } else {
            const layer = selection.isFloating ? getLayerById(selection.originLayerId) : getActiveLayer();
            if (layer && getHistoryLength(layer.id) > 1) {
                if (selection.isFloating) {
                    const s = getSelectionState();
                    lastUndoneSelection = {
                        path: s.path,
                        originLayerId: s.originLayerId,
                        initialState: s.tempHistory[0],
                        tempHistory: s.tempHistory,
                        tempRedoStack: s.tempRedoStack,
                    };
                }
                undo(layer.id, layer.ctx);
                if (selection.isFloating) {
                    clearSelection();
                }
            }
        }
        updateUndoRedoButtons();
    });

    redoBtn.addEventListener('click', () => {
        const selection = getSelectionState();
        const activeLayer = getActiveLayer() || (selection.isFloating ? getLayerById(selection.originLayerId) : null);

        if (lastUndoneSelection && activeLayer && getRedoStackLength(activeLayer.id) > 0) {
            redo(activeLayer.id, activeLayer.ctx);
            reconstructSelection(lastUndoneSelection);
            lastUndoneSelection = null;
        } else if (selection.isFloating && selection.tempRedoStack.length > 0) {
            redoSelectionChange();
        } else if (!selection.isFloating && activeLayer) {
            redo(activeLayer.id, activeLayer.ctx);
        }
        updateUndoRedoButtons();
    });

    addLayerBtn.addEventListener('click', () => {
        const newLayer = addNewLayer(canvas.width, canvas.height);
        initializeHistoryForLayer(newLayer.id, newLayer.ctx, newLayer.canvas);
        updateUndoRedoButtons();
    });
    deleteLayerBtn.addEventListener('click', () => {
        const layerToDelete = getActiveLayer();
        if (layerToDelete) {
             if (confirm('Are you sure you want to delete this layer?')) {
                deleteHistoryForLayer(layerToDelete.id);
                deleteActiveLayer();
                updateUndoRedoButtons();
            }
        }
    });
    
    document.addEventListener('activelayerchanged', updateUndoRedoButtons);
    document.addEventListener('requestRedraw', fullRedraw);

    function updateUndoRedoButtons() {
        const selection = getSelectionState();
        if (selection.isFloating) {
            const hasSelectionUndo = selection.tempHistory.length > 1;
            const originLayer = getLayerById(selection.originLayerId);
            const hasLayerUndo = originLayer ? getHistoryLength(originLayer.id) > 1 : false;
            
            undoBtn.disabled = !hasSelectionUndo && !hasLayerUndo;
            redoBtn.disabled = selection.tempRedoStack.length === 0 && !lastUndoneSelection;
        } else {
            const activeLayer = getActiveLayer();
            if (activeLayer) {
                undoBtn.disabled = getHistoryLength(activeLayer.id) <= 1;
                redoBtn.disabled = getRedoStackLength(activeLayer.id) === 0 && !lastUndoneSelection;
            } else {
                undoBtn.disabled = true;
                redoBtn.disabled = true;
            }
        }
    }
    
    function onDrawEnd(targetLayer = null) {
        lastUndoneSelection = null;
        const layerToUpdate = targetLayer || getActiveLayer();
        if (layerToUpdate) {
            saveState(layerToUpdate.id, layerToUpdate.ctx, layerToUpdate.canvas);
            updateUndoRedoButtons();
            updateActiveLayerThumbnail(); 
        }
    }
    
    updateUndoRedoButtons();
    updateBrushPreviewSize();
}

