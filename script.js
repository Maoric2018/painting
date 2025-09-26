document.addEventListener('DOMContentLoaded', () => {

    // --- Element Selections ---
    const toolButtons = document.querySelectorAll('.tool-button');
    const brushSizeSlider = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brush-size-value');
    const gridSizeSlider = document.getElementById('gridSize');
    const gridSizeValue = document.getElementById('grid-size-value');
    const gridToggle = document.getElementById('gridToggle');
    const canvas = document.getElementById('sketchCanvas');
    const ctx = canvas.getContext('2d');

    // --- State Variables ---
    let activeTool = 'brush'; // Default tool
    let isDrawing = false;
    let showGrid = false;
    
    // --- Canvas Setup ---
    // Function to resize canvas to fit its container
    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    // Initial resize and listen for window resizing
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);


    // --- Event Listeners ---

    // 1. Tool selection
    toolButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove 'active' class from any currently active button
            const currentActive = document.querySelector('.tool-button.active');
            if(currentActive) {
                currentActive.classList.remove('active');
            }
            
            // Add 'active' class to the clicked button
            button.classList.add('active');
            
            // Update the active tool
            activeTool = button.id;
            console.log(`Active tool changed to: ${activeTool}`);
        });
    });

    // 2. Brush size slider
    brushSizeSlider.addEventListener('input', (e) => {
        const newSize = e.target.value;
        brushSizeValue.textContent = newSize;
    });

    // 3. Grid size slider
    gridSizeSlider.addEventListener('input', (e) => {
        const newSize = e.target.value;
        gridSizeValue.textContent = newSize;
        // In the future, this will be used by the function that draws the grid
        // If the grid is already visible, we might want to redraw it
        if(showGrid) {
            console.log('Grid size changed, redraw grid here.');
        }
    });

    // 4. Grid visibility toggle
    gridToggle.addEventListener('change', (e) => {
        showGrid = e.target.checked;
        if (showGrid) {
            console.log('Grid is now ON');
            // Future: Call a function to draw the grid on the canvas
        } else {
            console.log('Grid is now OFF');
            // Future: Call a function to clear the grid and redraw the canvas
        }
    });

});

