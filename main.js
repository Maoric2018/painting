import { initializeHistory, getInitialState } from './history.js';
import { resizeCanvas } from './canvas.js';
import { initializeUI } from './ui.js';

// Wait for the HTML document to be fully loaded before running the script.
document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selections ---
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
        brushPreview: document.getElementById('brush-preview'),
        ctx: document.getElementById('sketchCanvas').getContext('2d', { willReadFrequently: true })
    };
    
    // --- Initial Setup ---
    // Set the initial canvas size and prepare it for drawing.
    resizeCanvas(elements.ctx, elements.canvas);
    
    // Save the initial blank state to the history module.
    initializeHistory(getInitialState(elements.ctx, elements.canvas));

    // Connect all the UI elements (buttons, sliders) to their functions.
    initializeUI(elements);

    // Add a listener to resize the canvas whenever the browser window changes size.
    window.addEventListener('resize', () => resizeCanvas(elements.ctx, elements.canvas));
});
