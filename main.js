import { initializeHistory } from './history.js';
import { resizeCanvases, redrawCanvas } from './canvas.js';
import { initializeUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // A single place to gather all the HTML elements the application needs.
    const elements = {
        toolButtons: document.querySelectorAll('.tool-button'),
        brushSizeSlider: document.getElementById('brushSize'),
        brushSizeValue: document.getElementById('brush-size-value'),
        colorPicker: document.getElementById('colorPicker'),
        clearCanvasBtn: document.getElementById('clear-canvas'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        canvas: document.getElementById('sketchCanvas'),
        canvasContainer: document.getElementById('canvas-container'),
        brushPreview: document.getElementById('brush-preview'),
        ctx: document.getElementById('sketchCanvas').getContext('2d'),
        
        // Offscreen canvas for actual drawing data.
        drawingCanvas: document.createElement('canvas'),
    };
    elements.drawingCtx = elements.drawingCanvas.getContext('2d', { willReadFrequently: true });
    
    // --- Initial Setup ---
    
    // Set the initial canvas sizes.
    resizeCanvases(elements);
    
    // Fill the background of the offscreen drawing canvas with white.
    elements.drawingCtx.fillStyle = 'white';
    elements.drawingCtx.fillRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
    
    // Save the initial blank state to the history module.
    initializeHistory(elements.drawingCtx, elements.drawingCanvas);
    
    // Perform the first draw to show the initial state on the visible canvas.
    redrawCanvas(elements);
    
    // Connect all the UI elements (buttons, sliders) to their functions.
    initializeUI(elements);
    
    // Add a listener to resize and redraw the canvas when the window changes.
    window.addEventListener('resize', () => {
        resizeCanvases(elements);
        redrawCanvas(elements);
    });
});

