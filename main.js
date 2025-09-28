// --- Main Entry Point for the Application ---

// Import functions from other modules to keep code organized.
import { initializeHistoryForLayer } from './history.js';
import { redrawCanvas, resizeVisibleCanvas } from './canvas.js';
import { initializeUI } from './ui.js';
import { setContexts } from './viewport.js';
import { initializeLayers, resizeAllLayers, getActiveLayer } from './layers.js';

// Wait for the entire HTML document to be loaded and parsed before running the script.
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    // A single object to hold references to all important DOM elements for easy access.
    const elements = {
        toolButtons: document.querySelectorAll('.tool-button'),
        brushSizeSlider: document.getElementById('brushSize'),
        brushSizeValue: document.getElementById('brush-size-value'),
        colorPicker: document.getElementById('colorPicker'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        canvas: document.getElementById('sketchCanvas'), // The main, visible canvas.
        canvasContainer: document.getElementById('canvas-container'),
        brushPreview: document.getElementById('brush-preview'),
        addLayerBtn: document.getElementById('add-layer-btn'),
        deleteLayerBtn: document.getElementById('delete-layer-btn'),
        layersList: document.getElementById('layers-list'),
    };
    // Get the 2D rendering context for the visible canvas.
    elements.ctx = elements.canvas.getContext('2d');
    
    // --- Initial Setup ---
    // 1. Resize the visible canvas to fit its container.
    resizeVisibleCanvas(elements);
    // 2. Create the initial layer stack with one default layer.
    initializeLayers(elements.canvas.width, elements.canvas.height);
    
    // 3. Get the first layer to set it as active.
    const initialLayer = getActiveLayer();
    // 4. Tell the viewport module which contexts to use (the visible one and the active drawing one).
    setContexts(elements.ctx, initialLayer.ctx);

    // 5. Initialize the history stack for this first layer.
    initializeHistoryForLayer(initialLayer.id, initialLayer.ctx, initialLayer.canvas);
    
    // The initial layer is now transparent by default. The white background
    // will come from the main canvas element's style or a fill in the redraw function.

    // 6. Perform the first render of the canvas.
    redrawCanvas(elements);
    // 7. Set up all event listeners (clicks, mouse moves, etc.).
    initializeUI(elements);
    
    // --- Global Event Listeners ---
    // Listen for the browser window being resized.
    window.addEventListener('resize', () => {
        const oldWidth = elements.canvas.width;
        const oldHeight = elements.canvas.height;
        // Resize the visible canvas first.
        resizeVisibleCanvas(elements);
        // Only resize the backing layers if the dimensions actually changed, to avoid unnecessary work.
        if (oldWidth !== elements.canvas.width || oldHeight !== elements.canvas.height) {
            resizeAllLayers(elements.canvas.width, elements.canvas.height);
            redrawCanvas(elements); // Redraw everything after resizing.
        }
    });

    // This is a custom event that allows any part of the application to request a redraw
    // without having a direct reference to the redraw function or elements.
    document.addEventListener('requestRedraw', () => redrawCanvas(elements));
});