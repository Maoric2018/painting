import { initializeHistoryForLayer } from './history.js';
import { redrawCanvas, resizeVisibleCanvas } from './canvas.js';
import { initializeUI } from './ui.js';
import { setContexts } from './viewport.js';
import { initializeLayers, resizeAllLayers, getActiveLayer } from './layers.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const elements = {
        toolButtons: document.querySelectorAll('.tool-button'),
        brushSizeSlider: document.getElementById('brushSize'),
        brushSizeValue: document.getElementById('brush-size-value'),
        colorPicker: document.getElementById('colorPicker'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        canvas: document.getElementById('sketchCanvas'),
        canvasContainer: document.getElementById('canvas-container'),
        brushPreview: document.getElementById('brush-preview'),
        addLayerBtn: document.getElementById('add-layer-btn'),
        deleteLayerBtn: document.getElementById('delete-layer-btn'),
        layersList: document.getElementById('layers-list'),
    };
    elements.ctx = elements.canvas.getContext('2d');
    
    // --- Initial Setup ---
    resizeVisibleCanvas(elements);
    initializeLayers(elements.canvas.width, elements.canvas.height);
    
    const initialLayer = getActiveLayer();
    setContexts(elements.ctx, initialLayer.ctx); // Set viewport contexts for the first layer

    // Initialize history for the first layer
    initializeHistoryForLayer(initialLayer.id, initialLayer.ctx, initialLayer.canvas);
    
    // The initial layer is now transparent by default. The white background
    // will come from the main canvas element in the HTML.

    redrawCanvas(elements);
    initializeUI(elements);
    
    // --- Global Event Listeners ---
    window.addEventListener('resize', () => {
        const oldWidth = elements.canvas.width;
        const oldHeight = elements.canvas.height;
        resizeVisibleCanvas(elements);
        if (oldWidth !== elements.canvas.width || oldHeight !== elements.canvas.height) {
            resizeAllLayers(elements.canvas.width, elements.canvas.height);
            redrawCanvas(elements);
        }
    });

    // Custom event listener to allow other modules to request a redraw
    document.addEventListener('requestRedraw', () => redrawCanvas(elements));
});

