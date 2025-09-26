document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selections ---
    // Get all the interactive elements from the HTML file and store them in constants.
    const toolButtons = document.querySelectorAll('.tool-button');
    const brushSizeSlider = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brush-size-value');
    const colorPicker = document.getElementById('colorPicker');
    const clearCanvasBtn = document.getElementById('clear-canvas');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const canvas = document.getElementById('sketchCanvas');
    const brushPreview = document.getElementById('brush-preview');
    // Get the canvas's 2D drawing context. { willReadFrequently: true } is an optimization for getImageData().
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // --- State Variables ---
    // dpr (Device Pixel Ratio) is used to scale the canvas for high-resolution screens.
    const dpr = window.devicePixelRatio || 1;
    let activeTool = 'brush'; // The currently selected tool.
    let isDrawing = false;    // Tracks if the mouse button is held down.
    let lastX = 0;            // Stores the last X coordinate for drawing lines.
    let lastY = 0;            // Stores the last Y coordinate for drawing lines.
    let history = [];         // An array to store snapshots of the canvas for the undo feature.
    let redoStack = [];       // An array to store undone snapshots for the redo feature.

    // --- History Management ---
    // Saves the current state of the canvas to the history array.
    function saveState() {
        redoStack = []; // Clearing redoStack because a new drawing action invalidates the old redo path.
        if (history.length > 30) { // To save memory, we limit the history to 30 states.
            history.shift();
        }
        history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        updateUndoRedoButtons(); // Update the button states after saving.
    }

    // Restores the canvas to a specific state from an ImageData object.
    function restoreState(imageData) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transformations to draw the image correctly.
        ctx.putImageData(imageData, 0, 0);
        ctx.restore(); // Restore the previous transformation (scaling).
    }

    // Handles the undo action.
    function undo() {
        if (history.length > 1) { // We need at least one state to revert to.
            redoStack.push(history.pop()); // Move the current state to the redo stack.
            const prevState = history[history.length - 1]; // Get the previous state.
            restoreState(prevState);
            updateUndoRedoButtons();
        }
    }

    // Handles the redo action.
    function redo() {
        if (redoStack.length > 0) { // Check if there's anything to redo.
            const nextState = redoStack.pop(); // Get the next state from the redo stack.
            history.push(nextState); // Move it back to the history.
            restoreState(nextState);
            updateUndoRedoButtons();
        }
    }
    
    // Enables or disables the undo/redo buttons based on the history state.
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = history.length <= 1; // Disable undo if only the initial state is left.
        if (redoBtn) redoBtn.disabled = redoStack.length === 0; // Disable redo if the stack is empty.
    }


    // --- Canvas Setup ---
    // Resizes the canvas to fit its container and handles high-DPI scaling.
    function resizeCanvas() {
        // Save the current drawing to a temporary canvas before resizing.
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (canvas.width > 0 && canvas.height > 0) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.drawImage(canvas, 0, 0);
        }

        const container = canvas.parentElement;
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;

        // Set the internal resolution of the canvas based on screen density.
        canvas.width = newWidth * dpr;
        canvas.height = newHeight * dpr;
        // Set the display size of the canvas using CSS.
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;

        // Reset and scale the context to prevent cumulative scaling on multiple resizes.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Draw the saved image back onto the resized canvas.
        if (tempCanvas.width > 0) {
            ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
        }
    }

    // --- Brush Preview ---
    // Updates the size of the circular brush preview cursor.
    function updateBrushPreviewSize() {
        const brushSize = brushSizeSlider.value;
        brushPreview.style.width = `${brushSize}px`;
        brushPreview.style.height = `${brushSize}px`;
    }
    
    // --- Coordinate Calculation ---
    // Calculates the mouse's X and Y coordinates relative to the canvas.
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    // --- Drawing Functions ---
    // Main handler for mouse clicks on the canvas. Decides whether to fill or start drawing.
    function handleCanvasClick(e) {
        if (activeTool === 'fill') {
            const mousePos = getMousePos(e);
            floodFill(Math.floor(mousePos.x), Math.floor(mousePos.y));
            saveState();
        } else {
            isDrawing = true;
            const mousePos = getMousePos(e);
            [lastX, lastY] = [mousePos.x, mousePos.y];
            draw(e); // Draw a dot on the initial click.
        }
    }

    // Draws a line from the last known position to the current mouse position.
    function draw(e) {
        if (!isDrawing) return; // Stop the function if the mouse button is not held down.
        const mousePos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = activeTool === 'eraser' ? 'white' : colorPicker.value;
        ctx.lineWidth = brushSizeSlider.value;
        ctx.lineCap = 'round'; // Makes line ends smooth.
        ctx.lineJoin = 'round'; // Makes line corners smooth.
        ctx.stroke();
        [lastX, lastY] = [mousePos.x, mousePos.y]; // Update the last position.
    }

    // Called when the mouse button is released or leaves the canvas.
    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        ctx.beginPath();
        saveState(); // Save the state after the drawing action is complete.
    }
    
    // --- Bucket Fill (Flood Fill) ---
    // Fills an enclosed area with the selected color.
    function floodFill(startX, startY) {
        const fillColor = hexToRgb(colorPicker.value);
        if (!fillColor) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { width, height, data } = imageData;
        
        const startX_scaled = Math.floor(startX * dpr);
        const startY_scaled = Math.floor(startY * dpr);

        const targetColor = getPixelColor(startX_scaled, startY_scaled);

        if (colorsMatch(targetColor, fillColor)) return; // Don't fill if the colors are the same.

        const queue = [[startX_scaled, startY_scaled]];
        const visited = new Set([`${startX_scaled},${startY_scaled}`]);
        
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const currentColor = getPixelColor(x, y);

            if (colorsMatch(currentColor, targetColor)) {
                setPixelColor(x, y, fillColor);
                
                const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
                for (const [nx, ny] of neighbors) {
                    const key = `${nx},${ny}`;
                    if (!visited.has(key)) {
                        queue.push([nx, ny]);
                        visited.add(key);
                    }
                }
            }
        }
        
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(imageData, 0, 0);
        ctx.restore();

        function getPixelColor(x, y) {
            const index = (y * width + x) * 4;
            return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
        }

        function setPixelColor(x, y, color) {
            const index = (y * width + x) * 4;
            data[index] = color.r;
            data[index + 1] = color.g;
            data[index + 2] = color.b;
            data[index + 3] = 255;
        }
    }
    
    // --- Helper Functions ---
    // Converts a hex color string (e.g., #FF0000) to an RGB object.
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // Checks if two RGB color objects are identical.
    function colorsMatch(c1, c2) {
        return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
    }
    
    // --- Event Listeners ---
    // These listeners connect user actions (like clicks and mouse movements) to the functions defined above.

    // Show the custom cursor when the mouse enters the canvas.
    canvas.addEventListener('mouseenter', () => {
        brushPreview.classList.remove('hidden');
        canvas.style.cursor = 'none'; // Hide the default system cursor.
    });
    
    // Hide the custom cursor when the mouse leaves the canvas.
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        canvas.style.cursor = 'default'; // Restore the default system cursor.
    });

    // Handle the initial mouse click.
    canvas.addEventListener('mousedown', handleCanvasClick);

    // This listener handles both drawing while dragging and updating the preview's position.
    canvas.addEventListener('mousemove', (e) => {
        draw(e);
        const parentRect = canvas.parentElement.getBoundingClientRect();
        const previewX = e.clientX - parentRect.left;
        const previewY = e.clientY - parentRect.top;
        brushPreview.style.left = `${previewX}px`;
        brushPreview.style.top = `${previewY}px`;
    });

    // Stop drawing when the mouse button is released or the cursor leaves the canvas.
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Handle tool selection.
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.tool-button.active')?.classList.remove('active'); // De-select the old tool.
            button.classList.add('active'); // Highlight the new tool.
            activeTool = button.id;
        });
    });

    // Update the brush size value display and the preview cursor when the slider changes.
    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize();
    });
    
    // Handle the "Clear Canvas" button click.
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            saveState(); // Save the cleared canvas as a new state in history.
        });
    }

    // Connect the undo and redo buttons to their respective functions.
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);


    // --- Initial Setup ---
    // Code that runs once when the page has finished loading.

    // Set the initial canvas size when the page loads, and resize it if the window size changes.
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Save the initial blank state so the user can undo back to a blank canvas.
    saveState();
    // Clear the history to just this one initial state.
    history = [history[history.length - 1]];
    // Update the undo/redo buttons to their initial disabled state.
    updateUndoRedoButtons();
    // Set the initial size of the brush preview cursor.
    updateBrushPreviewSize();
});

