import { handleCanvasClick, draw, stopDrawing } from './canvas.js';
import { saveState, undo, redo, getHistoryLength, getRedoStackLength } from './history.js';

let activeTool = 'brush';

/**
 * Initializes all UI event listeners.
 * @param {object} elements - An object containing all the DOM elements.
 */
export function initializeUI(elements) {
    const { toolButtons, brushSizeSlider, brushSizeValue, clearCanvasBtn, undoBtn, redoBtn, canvas, brushPreview, ctx, colorPicker } = elements;

    // --- Brush Preview Handlers ---
    function updateBrushPreviewSize() {
        brushPreview.style.width = `${brushSizeSlider.value}px`;
        brushPreview.style.height = `${brushSizeSlider.value}px`;
    }

    // --- Canvas Event Listeners ---
    canvas.addEventListener('mouseenter', () => {
        brushPreview.classList.remove('hidden');
        canvas.style.cursor = 'none';
    });
    
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('mousedown', (e) => {
        const state = { ctx, canvas, activeTool, colorPicker, brushSizeSlider };
        handleCanvasClick(e, state, () => onDrawEnd());
    });

    canvas.addEventListener('mousemove', (e) => {
        const state = { ctx, canvas, activeTool, colorPicker, brushSizeSlider };
        draw(e, state);
        const parentRect = canvas.parentElement.getBoundingClientRect();
        brushPreview.style.left = `${e.clientX - parentRect.left}px`;
        brushPreview.style.top = `${e.clientY - parentRect.top}px`;
    });

    canvas.addEventListener('mouseup', () => stopDrawing(() => onDrawEnd()));
    canvas.addEventListener('mouseout', () => stopDrawing(() => onDrawEnd()));

    // --- Toolbar Event Listeners ---
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
        });
    });

    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            onDrawEnd();
        });
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            undo(ctx);
            updateUndoRedoButtons();
        });
    }

    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            redo(ctx);
            updateUndoRedoButtons();
        });
    }

    // --- Helper Functions ---
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = getHistoryLength() <= 1;
        if (redoBtn) redoBtn.disabled = getRedoStackLength() === 0;
    }

    function onDrawEnd() {
        saveState(ctx, canvas);
        updateUndoRedoButtons();
    }
    
    // --- Initial UI Setup ---
    updateBrushPreviewSize();
    updateUndoRedoButtons();
}
