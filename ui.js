// --- Import necessary functions from other modules ---
import { handleCanvasClick, draw, stopDrawing, redrawCanvas } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength, initializeHistoryForLayer, deleteHistoryForLayer } from './history.js';
import { getTransformedPoint, zoomOnWheel, startPan, stopPan, pan, getZoom, setContexts } from './viewport.js';
import { addNewLayer, deleteActiveLayer, getActiveLayer } from './layers.js';

let activeTool = 'brush';

/**
 * Initializes all UI event listeners.
 * @param {object} elements - An object containing all the DOM elements.
 */
export function initializeUI(elements) {
    const { toolButtons, brushSizeSlider, brushSizeValue, undoBtn, redoBtn, canvas, brushPreview, colorPicker, addLayerBtn, deleteLayerBtn } = elements;

    const fullRedraw = () => redrawCanvas(elements);
    
    function updateCursor() {
        canvas.classList.remove('pan-cursor', 'panning-cursor', 'no-cursor', 'default-cursor');
        if (activeTool === 'pan') {
            brushPreview.classList.add('hidden');
            canvas.classList.add('pan-cursor');
        } else if (['brush', 'eraser', 'fill'].includes(activeTool)) {
            brushPreview.classList.remove('hidden');
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
    canvas.addEventListener('mouseenter', () => updateCursor());
    
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
        
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;

        const state = { activeLayer, activeTool, colorPicker, brushSizeSlider };
        
        const canvasRect = canvas.getBoundingClientRect();
        const mouseXInCanvas = e.clientX - canvasRect.left;
        const mouseYInCanvas = e.clientY - canvasRect.top;
        
        const transformedPoint = getTransformedPoint(mouseXInCanvas, mouseYInCanvas);
        handleCanvasClick(transformedPoint.x, transformedPoint.y, state, () => onDrawEnd());
        fullRedraw();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (activeTool === 'pan') {
            pan(e, fullRedraw);
            return;
        }

        const parentRect = canvas.parentElement.getBoundingClientRect();
        const mouseXInParent = e.clientX - parentRect.left;
        const mouseYInParent = e.clientY - parentRect.top;
        const previewSize = parseFloat(brushPreview.style.width) || (brushSizeSlider.value * getZoom());
        brushPreview.style.left = `${mouseXInParent}px`;
        brushPreview.style.top = `${mouseYInParent}px`;

        const canvasRect = canvas.getBoundingClientRect();
        const mouseXInCanvas = e.clientX - canvasRect.left;
        const mouseYInCanvas = e.clientY - canvasRect.top;
        
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;
        
        const state = { activeLayer, activeTool, colorPicker, brushSizeSlider };
        const transformedPoint = getTransformedPoint(mouseXInCanvas, mouseYInCanvas);
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
        e.preventDefault();
        zoomOnWheel(e, fullRedraw);
        updateBrushPreviewSize();
    }, { passive: false });

    // --- Toolbar & Layer Panel Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
            updateCursor();
        });
    });

    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    undoBtn.addEventListener('click', () => {
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;
        undo(activeLayer.id, activeLayer.ctx);
        updateUndoRedoButtons();
        fullRedraw();
    });

    redoBtn.addEventListener('click', () => {
        const activeLayer = getActiveLayer();
        if (!activeLayer) return;
        redo(activeLayer.id, activeLayer.ctx);
        updateUndoRedoButtons();
        fullRedraw();
    });

    addLayerBtn.addEventListener('click', () => {
        const newLayer = addNewLayer(canvas.width, canvas.height);
        initializeHistoryForLayer(newLayer.id, newLayer.ctx, newLayer.canvas);
        setContexts(elements.ctx, newLayer.ctx);
        updateUndoRedoButtons();
        fullRedraw();
    });

    deleteLayerBtn.addEventListener('click', () => {
        const layerToDelete = getActiveLayer();
        if (layerToDelete) {
            if (confirm('Are you sure you want to delete this layer? This action cannot be undone.')) {
                deleteHistoryForLayer(layerToDelete.id);
                deleteActiveLayer();
                const newActiveLayer = getActiveLayer();
                if (newActiveLayer) {
                    setContexts(elements.ctx, newActiveLayer.ctx);
                }
                updateUndoRedoButtons();
                fullRedraw();
            }
        }
    });
    
    // Listen for layer changes to update contexts and buttons
    document.getElementById('layers-list').addEventListener('click', () => {
        const newActiveLayer = getActiveLayer();
        if (newActiveLayer) {
            setContexts(elements.ctx, newActiveLayer.ctx);
            updateUndoRedoButtons();
        }
    });

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
        }
    }
    
    // --- Initial State Calls ---
    updateCursor();
    updateBrushPreviewSize();
    updateUndoRedoButtons();
}

