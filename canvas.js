// --- State Variables ---
// These are private to this module and track the drawing state.
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// --- Exported Functions ---

/**
 * Resizes the canvas to fit its container and handles high-DPI scaling.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 */
export function resizeCanvas(ctx, canvas) {
    const dpr = window.devicePixelRatio || 1;
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

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (tempCanvas.width > 0) {
        ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
    }
}

/**
 * Main handler for mouse clicks on the canvas. Decides whether to fill or start drawing.
 * @param {MouseEvent} e - The mouse event.
 * @param {object} state - An object containing the current tool and color.
 * @param {function} onDrawEnd - A callback function to save the state.
 */
export function handleCanvasClick(e, state, onDrawEnd) {
    const { ctx, canvas, activeTool, colorPicker } = state;
    if (activeTool === 'fill') {
        const mousePos = getMousePos(e, canvas);
        floodFill(Math.floor(mousePos.x), Math.floor(mousePos.y), ctx, canvas, colorPicker);
        onDrawEnd();
    } else {
        isDrawing = true;
        const mousePos = getMousePos(e, canvas);
        [lastX, lastY] = [mousePos.x, mousePos.y];
        draw(e, state);
    }
}

/**
 * Draws a line from the last known position to the current mouse position.
 * @param {MouseEvent} e - The mouse event.
 * @param {object} state - An object containing all necessary drawing properties.
 */
export function draw(e, state) {
    if (!isDrawing) return;
    const { ctx, canvas, activeTool, colorPicker, brushSizeSlider } = state;
    const mousePos = getMousePos(e, canvas);
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

/**
 * Called when the mouse button is released or leaves the canvas.
 * @param {function} onDrawEnd - A callback function to save the state.
 */
export function stopDrawing(onDrawEnd) {
    if (!isDrawing) return;
    isDrawing = false;
    onDrawEnd();
}

// --- Internal Helper Functions ---

function getMousePos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function floodFill(startX, startY, ctx, canvas, colorPicker) {
    const dpr = window.devicePixelRatio || 1;
    const fillColor = hexToRgb(colorPicker.value);
    if (!fillColor) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;
    const startX_scaled = Math.floor(startX * dpr);
    const startY_scaled = Math.floor(startY * dpr);
    const targetColor = getPixelColor(startX_scaled, startY_scaled, width, data);
    if (colorsMatch(targetColor, fillColor)) return;
    const queue = [[startX_scaled, startY_scaled]];
    const visited = new Set([`${startX_scaled},${startY_scaled}`]);
    while (queue.length > 0) {
        const [x, y] = queue.shift();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const currentColor = getPixelColor(x, y, width, data);
        if (colorsMatch(currentColor, targetColor)) {
            setPixelColor(x, y, fillColor, width, data);
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
}

function getPixelColor(x, y, width, data) {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}

function setPixelColor(x, y, color, width, data) {
    const index = (y * width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function colorsMatch(c1, c2) {
    return c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && c1.a === c2.a;
}
