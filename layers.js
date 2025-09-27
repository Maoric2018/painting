// --- Layer Management Module ---
// This module is responsible for creating, managing, and rendering the layer stack.

let layers = []; // The array that holds all layer objects
let activeLayerId = null;
let counter = 1;
let dragSrcElement = null; // For drag and drop reordering

// --- Main API ---

export function initializeLayers(width, height) {
    layers = [];
    counter = 1;
    addNewLayer(width, height);
}

export function addNewLayer(width, height) {
    const id = Date.now();
    const newCanvas = document.createElement('canvas');
    newCanvas.width = width;
    newCanvas.height = height;

    const layer = {
        id,
        name: `Layer ${counter++}`,
        canvas: newCanvas,
        ctx: newCanvas.getContext('2d', { willReadFrequently: true }),
        isVisible: true,
        opacity: 1.0
    };
    
    layers.unshift(layer); // Add to top of the stack (top of the list)
    renderLayerList(); // Full render for a new layer
    setActiveLayer(id); // Set it as active after rendering
    return layer;
}

export function deleteActiveLayer() {
    if (layers.length <= 1) {
        alert("You cannot delete the last layer.");
        return null;
    }
    const index = layers.findIndex(l => l.id === activeLayerId);
    if (index > -1) {
        const deletedLayer = layers.splice(index, 1)[0];
        const newActiveIndex = Math.max(0, index - 1);
        let newActiveId = null;
        if (layers[newActiveIndex]) {
           newActiveId = layers[newActiveIndex].id
        }
        renderLayerList(); // Full render after deletion
        setActiveLayer(newActiveId); // Set new active layer
        return deletedLayer;
    }
    return null;
}

/**
 * Sets the active layer and efficiently updates the UI without a full re-render.
 * This is the core fix for the double-click issue.
 * @param {number} id The ID of the layer to make active.
 */
export function setActiveLayer(id) {
    if (activeLayerId === id) return;

    const listElement = document.getElementById('layers-list');
    if (!listElement) return;

    // Un-style the previously active item
    const oldActiveItem = listElement.querySelector(`[data-layer-id="${activeLayerId}"]`);
    if (oldActiveItem) {
        oldActiveItem.classList.remove('bg-indigo-600', 'border-indigo-400');
        oldActiveItem.classList.add('bg-gray-700', 'border-transparent', 'hover:bg-gray-600');
    }

    // Update the state
    activeLayerId = id;

    // Style the new active item
    const newActiveItem = listElement.querySelector(`[data-layer-id="${id}"]`);
    if (newActiveItem) {
        newActiveItem.classList.remove('bg-gray-700', 'border-transparent', 'hover:bg-gray-600');
        newActiveItem.classList.add('bg-indigo-600', 'border-indigo-400');
    }
    
    // Dispatch a custom event so other modules can react to the change.
    document.dispatchEvent(new CustomEvent('activelayerchanged'));
}


export function toggleLayerVisibility(id) {
    const layer = layers.find(l => l.id === id);
    if (layer) {
        layer.isVisible = !layer.isVisible;
        renderLayerList();
    }
}

export function renameLayer(id, newName) {
    const layer = layers.find(l => l.id === id);
    if (layer && newName.trim() !== '') {
        layer.name = newName.trim();
    }
    renderLayerList();
}


export function compositeLayers(targetCtx) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    [...layers].reverse().forEach(layer => {
        if (layer.isVisible) {
            targetCtx.globalAlpha = layer.opacity;
            targetCtx.drawImage(layer.canvas, 0, 0);
        }
    });
    targetCtx.globalAlpha = 1.0;
}

export function resizeAllLayers(width, height) {
    layers.forEach(layer => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = layer.canvas.width;
        tempCanvas.height = layer.canvas.height;
        tempCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);

        layer.canvas.width = width;
        layer.canvas.height = height;
        layer.ctx.drawImage(tempCanvas, 0, 0);
    });
    renderLayerList();
}

export function getActiveLayer() {
    return layers.find(l => l.id === activeLayerId) || null;
}

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
            previewCtx.drawImage(activeLayer.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
    }
}

// --- UI Rendering and Drag & Drop ---

function renderLayerList() {
    const listElement = document.getElementById('layers-list');
    if (!listElement) return;
    const scrollPosition = listElement.scrollTop;
    listElement.innerHTML = '';
    
    layers.forEach(layer => {
        const item = createLayerItemElement(layer);
        listElement.appendChild(item);
        const previewCanvas = item.querySelector('.layer-preview');
        if (previewCanvas) {
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.clearRect(0,0, previewCanvas.width, previewCanvas.height);
            previewCtx.drawImage(layer.canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        }
    });
    listElement.scrollTop = scrollPosition;
}

function createLayerItemElement(layer) {
    const item = document.createElement('div');
    item.className = `layer-item p-2 rounded-md border-2 flex items-center space-x-3 ${layer.id === activeLayerId ? 'bg-indigo-600 border-indigo-400' : 'bg-gray-700 border-transparent hover:bg-gray-600'}`;
    item.dataset.layerId = layer.id;
    item.setAttribute('draggable', true);

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

    // Event Listeners
    item.addEventListener('click', () => setActiveLayer(layer.id));
    
    const layerNameContainer = item.querySelector('.layer-name-container');
    layerNameContainer.addEventListener('dblclick', (e) => {
        e.stopPropagation(); // Prevent click from firing on the item
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
        };
        
        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (keyEvent) => {
            if (keyEvent.key === 'Enter') {
                finishRename();
            } else if (keyEvent.key === 'Escape') {
                renderLayerList(); // Cancel rename and re-render
            }
        });
    });

    item.querySelector('.visibility-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerVisibility(layer.id);
        document.dispatchEvent(new CustomEvent('requestRedraw'));
    });

    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);

    return item;
}

function handleDragStart(e) {
    dragSrcElement = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    return false;
}

function handleDrop(e) {
    e.stopPropagation();
    if (dragSrcElement !== this) {
        const srcId = Number(dragSrcElement.dataset.layerId);
        const targetId = Number(this.dataset.layerId);
        const srcIndex = layers.findIndex(l => l.id === srcId);
        const targetIndex = layers.findIndex(l => l.id === targetId);

        const [removed] = layers.splice(srcIndex, 1);
        layers.splice(targetIndex, 0, removed);
        
        renderLayerList();
        document.dispatchEvent(new CustomEvent('requestRedraw'));
    }
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
}

