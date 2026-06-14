import { state, updateHUD, simulateGPSTravel } from './src/state.js';
import { initScene } from './src/scene.js';
import { createGrid, tiles, updateTileSelectionInfo } from './src/grid.js';
import { initInput, initTouch } from './src/input.js';

function init() {
    const mainContainer = document.getElementById('canvas-container');
    
    // Initialize Three.js scene and pass tiles reference to animate loop
    initScene(mainContainer, tiles);

    // Create Grid and populate tiles
    createGrid();

    // Initialize inputs (mouse, wheels, touches)
    initInput(mainContainer);
    initTouch(mainContainer);

    // GPS simulator button
    document.getElementById('simulate-gps-btn').addEventListener('click', simulateGPSTravel);

    // Collapsible Panels Event Handlers
    document.getElementById('header-toggle-btn').addEventListener('click', () => {
        document.getElementById('header-wrapper').classList.toggle('collapsed');
    });
    document.getElementById('left-toggle-btn').addEventListener('click', () => {
        document.getElementById('left-wrapper').classList.toggle('collapsed');
    });
    document.getElementById('footer-toggle-btn').addEventListener('click', () => {
        document.getElementById('footer-wrapper').classList.toggle('collapsed');
    });

    // Build Toolbar buttons interaction
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTool = btn.dataset.tool;
            
            // Update canvas cursor class
            const canvas = document.getElementById('canvas-container');
            canvas.className = '';
            canvas.classList.add(`tool-${state.currentTool}`);
            
            // If tool is not select, clear active selections
            if (state.currentTool !== 'select') {
                state.selectedTile = null;
                updateTileSelectionInfo(null);
            }
        });
    });

    // Initial DOM Update
    updateHUD();
}

window.onload = init;
