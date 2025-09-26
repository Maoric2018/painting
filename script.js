document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selections ---
    const toolButtons = document.querySelectorAll('.tool-button');
    const brushSizeSlider = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brush-size-value');
    const colorPicker = document.getElementById('colorPicker');
    const clearCanvasBtn = document.getElementById('clear-canvas');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const canvas = document.getElementById('sketchCanvas');
    const brushPreview = document.getElementById('brush-preview'); // Get the new preview element
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // --- State Variables ---
    const dpr = window.devicePixelRatio || 1;
    let activeTool = 'brush';
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let history = [];
    let redoStack = [];

    // --- History Management ---
    function saveState() {
        redoStack = [];
        if (history.length > 30) {
            history.shift();
        }
        history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        updateUndoRedoButtons();
    }

    function restoreState(imageData) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(imageData, 0, 0);
        ctx.restore();
    }

    function undo() {
        if (history.length > 1) {
            redoStack.push(history.pop());
            const prevState = history[history.length - 1];
            restoreState(prevState);
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            history.push(nextState);
            restoreState(nextState);
            updateUndoRedoButtons();
        }
    }
    
    function updateUndoRedoButtons() {
        if (undoBtn) undoBtn.disabled = history.length <= 1;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }


    // --- Canvas Setup ---
    function resizeCanvas() {
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

        canvas.width = newWidth * dpr;
        canvas.height = newHeight * dpr;
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;

        ctx.scale(dpr, dpr);

        if (tempCanvas.width > 0) {
            ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
        }
    }

    // --- Brush Preview ---
    function updateBrushPreviewSize() {
        const brushSize = brushSizeSlider.value;
        brushPreview.style.width = `${brushSize}px`;
        brushPreview.style.height = `${brushSize}px`;
    }
    
    // --- Coordinate Calculation ---
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    // --- Drawing Functions ---
    function handleCanvasClick(e) {
        if (activeTool === 'fill') {
            const mousePos = getMousePos(e);
            floodFill(Math.floor(mousePos.x), Math.floor(mousePos.y));
            saveState();
        } else {
            startDrawing(e);
        }
    }

    function startDrawing(e) {
        isDrawing = true;
        const mousePos = getMousePos(e);
        [lastX, lastY] = [mousePos.x, mousePos.y];
    }

    function draw(e) {
        if (!isDrawing) return;
        const mousePos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = activeTool === 'eraser' ? 'white' : colorPicker.value;
        ctx.lineWidth = brushSizeSlider.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        [lastX, lastY] = [mousePos.x, mousePos.y];
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        ctx.beginPath();
        saveState();
    }
    
    // --- Bucket Fill (Flood Fill) ---
    function floodFill(startX, startY) {
        const fillColor = hexToRgb(colorPicker.value);
        if (!fillColor) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { width, height, data } = imageData;
        
        const startX_scaled = Math.floor(startX * dpr);
        const startY_scaled = Math.floor(startY * dpr);

        const targetColor = getPixelColor(startX_scaled, startY_scaled);

        if (colorsMatch(targetColor, fillColor)) {
            return;
        }

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
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function colorsMatch(c1, c2) {
        return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
    }
    
    // --- Event Listeners ---
    canvas.addEventListener('mouseenter', () => {
        brushPreview.classList.remove('hidden');
        canvas.style.cursor = 'none';
    });
    
    canvas.addEventListener('mouseleave', () => {
        brushPreview.classList.add('hidden');
        canvas.style.cursor = 'default';
    });

    canvas.addEventListener('mousedown', handleCanvasClick);

    canvas.addEventListener('mousemove', (e) => {
        // This single listener handles both drawing and updating the preview position
        draw(e);
        const mousePos = getMousePos(e);
        brushPreview.style.left = `${mousePos.x}px`;
        brushPreview.style.top = `${mousePos.y}px`;
    });

    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.tool-button.active')?.classList.remove('active');
            button.classList.add('active');
            activeTool = button.id;
        });
    });

    brushSizeSlider.addEventListener('input', (e) => {
        brushSizeValue.textContent = e.target.value;
        updateBrushPreviewSize(); // Update preview size when slider changes
    });
    
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            saveState();
        });
    }

    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);


    // --- Initial Setup ---
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    saveState();
    history = [history[history.length - 1]];
    updateUndoRedoButtons();
    updateBrushPreviewSize(); // Set initial size of the brush preview
});

