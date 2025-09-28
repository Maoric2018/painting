// --- Layer Management Module ---
// This module is responsible for creating, managing, and rendering the layer stack.

let layers = []; // The array that holds all layer objects. The order matters: index 0 is the top layer.
let activeLayerId = null; // The ID of the currently selected layer for drawing.
let counter = 1; // A simple counter for naming new layers.
let dragSrcElement = null; // Stores the HTML element of the layer being dragged.

// --- Main API ---

/**
 * Initializes the layer stack, clearing any existing layers and creating the first one.
 * @param {number} width - The initial width of the layers.
 * @param {number} height - The initial height of the layers.
 */
export function initializeLayers(width, height) {
    layers = [];
    counter = 1;
    addNewLayer(width, height);
}

/**
 * Creates a new layer and adds it to the top of the stack.
 * @param {number} width - The width of the new layer's canvas.
 * @param {number} height - The height of the new layer's canvas.
 * @returns {object} The newly created layer object.
 */
export function addNewLayer(width, height) {
    const id = Date.now(); // Use a timestamp for a simple unique ID.
    const newCanvas = document.createElement('canvas'); // Each layer has its own off-screen canvas.
    newCanvas.width = width;
    newCanvas.height = height;

    const layer = {
        id,
        name: `Layer ${counter++}`,
        canvas: newCanvas,
        ctx: newCanvas.getContext('2d', { willReadFrequently: true }), // `willReadFrequently` can optimize getImageData.
        isVisible: true,
        opacity: 1.0
    };
    
    layers.unshift(layer); // Add the new layer to the beginning of the array (top of the stack).
    renderLayerList(); // Update the UI to show the new layer.
    setActiveLayer(id); // Automatically make the new layer active.
    return layer;
}

/**
 * Deletes the currently active layer.
 * @returns {object|null} The deleted layer object or null if no layer was deleted.
 */
export function deleteActiveLayer() {
    // Prevent deleting the very last layer.
    if (layers.length <= 1) {
        alert("You cannot delete the last layer.");
        return null;
    }
    const index = layers.findIndex(l => l.id === activeLayerId);
    if (index > -1) {
        const deletedLayer = layers.splice(index, 1)[0];
        // After deleting, try to select the layer that was below the deleted one.
        const newActiveIndex = Math.max(0, index - 1);
        let newActiveId = null;
        if (layers[newActiveIndex]) {
           newActiveId = layers[newActiveIndex].id
        }
        renderLayerList();
        setActiveLayer(newActiveId);
        return deletedLayer;
    }
    return null;
}

/**
 * Sets a layer as the active one for drawing and UI feedback.
 * @param {number} id - The ID of the layer to make active.
 */
export function setActiveLayer(id) {
    if (activeLayerId === id) return; // No change needed.

    const listElement = document.getElementById('layers-list');
    if (!listElement) return;

    // Remove active styling from the previously active layer item.
    const oldActiveItem = listElement.querySelector(`[data-layer-id="${activeLayerId}"]`);
    if (oldActiveItem) {
        oldActiveItem.classList.remove('bg-indigo-600', 'border-indigo-400');
        oldActiveItem.classList.add('bg-gray-700', 'border-transparent', 'hover:bg-gray-600');
    }

    activeLayerId = id;

    // Add active styling to the new active layer item.
    const newActiveItem = listElement.querySelector(`[data-layer-id="${id}"]`);
    if (newActiveItem) {
        newActiveItem.classList.remove('bg-gray-700', 'border-transparent', 'hover:bg-gray-600');
        newActiveItem.classList.add('bg-indigo-600', 'border-indigo-400');
    }
    
    // Dispatch a custom event to notify other parts of the app (like ui.js and viewport.js) that the active layer has changed.
    document.dispatchEvent(new CustomEvent('activelayerchanged'));
}

/**
 * Toggles the visibility of a layer.
 * @param {number} id - The ID of the layer to toggle.
 */
export function toggleLayerVisibility(id) {
    const layer = layers.find(l => l.id === id);
    if (layer) {
        layer.isVisible = !layer.isVisible;
        renderLayerList(); // Re-render the list to update the eye icon.
    }
}

/**
 * Renames a layer.
 * @param {number} id - The ID of the layer to rename.
 * @param {string} newName - The new name for the layer.
 */
export function renameLayer(id, newName) {
    const layer = layers.find(l => l.id === id);
    if (layer && newName.trim() !== '') {
        layer.name = newName.trim();
    }
    renderLayerList(); // Re-render to show the new name.
}

/**
 * Renders all visible layers onto a target context in the correct order.
 * @param {CanvasRenderingContext2D} targetCtx - The context to draw the composite image onto (usually the main visible canvas).
 */
export function compositeLayers(targetCtx) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    // We reverse a copy of the layers array because we draw from bottom-up (last in array to first).
    [...layers].reverse().forEach(layer => {
        if (layer.isVisible) {
            targetCtx.globalAlpha = layer.opacity; // Set layer opacity.
            targetCtx.drawImage(layer.canvas, 0, 0);
        }
    });
    // Reset global alpha to default.
    targetCtx.globalAlpha = 1.0;
}

/**
 * Resizes all layer canvases when the main canvas size changes.
 * @param {number} width - The new width.
 * @param {number} height - The new height.
 */
export function resizeAllLayers(width, height) {
    layers.forEach(layer => {
        // Create a temporary canvas to hold the old content.
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = layer.canvas.width;
        tempCanvas.height = layer.canvas.height;
        tempCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);

        // Resize the actual layer canvas.
        layer.canvas.width = width;
        layer.canvas.height = height;
        // Draw the old content back onto the resized canvas.
        layer.ctx.drawImage(tempCanvas, 0, 0);
    });
    renderLayerList(); // Update thumbnails.
}

/**
 * Gets the full object for the currently active layer.
 * @returns {object|null}
 */
export function getActiveLayer() {
    return layers.find(l => l.id === activeLayerId) || null;
}

/**
 * Gets the dimensions of the off-screen drawing canvases.
 * Assumes all layers have the same dimensions.
 * @returns {{width: number, height: number}}
 */
export function getDrawingDimensions() {
    if (layers.length > 0) {
        const firstLayerCanvas = layers[0].canvas;
        return { width: firstLayerCanvas.width, height: firstLayerCanvas.height };
    }
    return { width: 0, height: 0 };
}

/**
 * Updates the small preview thumbnail for the active layer in the UI.
 * This is called after a drawing operation is finished.
 */
export function updateActiveLayerThumbnail() {
    const activeLayer = getActiveLayer();
    if (!activeLayer) return;

    const listElement = document.getElementById('layers-list');
    const layerItem = listElement.querySelector(`[data-layer-id="${activeLayer.id}"]`);

    if (layerItem) {
        const previewCanvas = layerItem.querySelector('.layer-preview');
        if (previewCanvas) {
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            // Draw the full-size layer canvas onto the small preview canvas.
            previewCtx.drawImage(activeLayer.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
    }
}

// --- UI Rendering and Drag & Drop ---

/**
 * Completely rebuilds the layer list in the DOM based on the current `layers` array.
 */
function renderLayerList() {
    const listElement = document.getElementById('layers-list');
    if (!listElement) return;
    const scrollPosition = listElement.scrollTop; // Save scroll position.
    listElement.innerHTML = ''; // Clear the list.
    
    // Create and append an element for each layer.
    layers.forEach(layer => {
        const item = createLayerItemElement(layer);
        listElement.appendChild(item);
        // Update the thumbnail preview for each layer.
        const previewCanvas = item.querySelector('.layer-preview');
        if (previewCanvas) {
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.clearRect(0,0, previewCanvas.width, previewCanvas.height);
            previewCtx.drawImage(layer.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
    });
    listElement.scrollTop = scrollPosition; // Restore scroll position.
}

/**
 * Creates the HTML element for a single layer item.
 * @param {object} layer - The layer object to create an element for.
 * @returns {HTMLElement}
 */
function createLayerItemElement(layer) {
    const item = document.createElement('div');
    // Set classes for styling, including active state.
    item.className = `layer-item p-2 rounded-md border-y-2 border-transparent flex items-center space-x-3 ${layer.id === activeLayerId ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`;
    item.dataset.layerId = layer.id; // Store the layer ID in a data attribute for easy access.
    item.setAttribute('draggable', true); // Make the item draggable.

    // Use a template literal for clean HTML creation.
    item.innerHTML = `
        <canvas class="layer-preview flex-shrink-0 bg-white" width="40" height="40"></canvas>
        <div class="layer-name-container flex-grow overflow-hidden">
            <span class="layer-name truncate text-sm">${layer.name}</span>
        </div>
        <div class="visibility-toggle flex-shrink-0 ${!layer.isVisible ? 'hidden-layer' : ''}" data-layer-id="${layer.id}">
            <svg class="eye-open" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <svg class="eye-closed" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9 9 0 0 1 12 3a9.9 9.9 0 0 1 8.8 5.2c.4.8.4 1.7 0 2.5A9.9 9.9 0 0 1 12 21a9 9 0 0 1-8.8-5.2c-.5-.8-.5-1.7 0-2.5l1-1.75"/><path d="m2.5 2.5 19 19"/></svg>
        </div>
    `;

    // --- Event Listeners for the layer item ---
    item.addEventListener('click', () => setActiveLayer(layer.id));
    
    const layerNameContainer = item.querySelector('.layer-name-container');
    // Double-click to rename.
    layerNameContainer.addEventListener('dblclick', (e) => {
        e.stopPropagation(); // Prevent the click from also firing the 'setActiveLayer' listener.
        const layerNameSpan = item.querySelector('.layer-name');
        layerNameSpan.style.display = 'none';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = layer.name;
        input.className = 'layer-name-input';
        layerNameContainer.appendChild(input);
        input.focus();
        input.select();

        const finishRename = () => {
            renameLayer(layer.id, input.value);
            // The list will be re-rendered, so the input field will be automatically removed.
        };
        
        input.addEventListener('blur', finishRename); // Finish when focus is lost.
        input.addEventListener('keydown', (keyEvent) => {
            if (keyEvent.key === 'Enter') finishRename(); // Finish on Enter.
            else if (keyEvent.key === 'Escape') renderLayerList(); // Cancel on Escape.
        });
    });

    item.querySelector('.visibility-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerVisibility(layer.id);
        // Request a redraw of the main canvas to reflect the visibility change.
        document.dispatchEvent(new CustomEvent('requestRedraw'));
    });

    // Drag and drop listeners.
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);

    return item;
}

// --- Drag and Drop Handler Functions ---

function handleDragStart(e) {
    dragSrcElement = this; // 'this' is the element the drag started on.
    e.dataTransfer.effectAllowed = 'move';
    // Use a timeout to apply the 'dragging' class after the browser has taken its "screenshot" of the element.
    setTimeout(() => {
        this.classList.add('dragging');
    }, 0);
}

function handleDragOver(e) {
    e.preventDefault(); // This is necessary to allow a drop.
    if (this === dragSrcElement) return;

    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    
    // Remove indicators from all other items.
    document.querySelectorAll('.layer-item').forEach(item => {
        if (item !== this) {
            item.classList.remove('drop-above', 'drop-below');
        }
    });

    // Add a 'drop-above' or 'drop-below' class to show a visual indicator.
    if (e.clientY < midpoint) {
        this.classList.add('drop-above');
        this.classList.remove('drop-below');
    } else {
        this.classList.add('drop-below');
        this.classList.remove('drop-above');
    }
}

function handleDragLeave(e) {
    // Clean up drop indicators when the dragged item leaves a potential target.
    this.classList.remove('drop-above', 'drop-below');
}

function handleDrop(e) {
    e.stopPropagation(); // Prevents unwanted side effects.
    if (dragSrcElement && dragSrcElement !== this) {
        // Get the IDs and find the original indices in the `layers` array.
        const srcId = Number(dragSrcElement.dataset.layerId);
        const targetId = Number(this.dataset.layerId);
        
        let srcIndex = layers.findIndex(l => l.id === srcId);
        let targetIndex = layers.findIndex(l => l.id === targetId);

        // Determine if the drop was in the bottom half of the target item.
        const dropBelow = this.classList.contains('drop-below');
        // Remove the source layer from the array.
        const [removed] = layers.splice(srcIndex, 1);
        
        // Adjust the target index if the source was moved from a position before the target.
        if (srcIndex < targetIndex) {
            targetIndex--;
        }
        
        // Calculate the correct insertion index.
        const insertIndex = dropBelow ? targetIndex + 1 : targetIndex;
        // Re-insert the removed layer at the new position.
        layers.splice(insertIndex, 0, removed);
        
        // Trigger a redraw of the main canvas to show the new layer order.
        document.dispatchEvent(new CustomEvent('requestRedraw'));
    }
}

function handleDragEnd(e) {
    // Cleanup: remove all dragging-related classes from all items.
    document.querySelectorAll('.layer-item').forEach(item => {
        item.classList.remove('dragging', 'drop-above', 'drop-below');
    });
    // Re-render the entire list to ensure a consistent state.
    renderLayerList();
}