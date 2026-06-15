import * as THREE from 'three';
import { state } from './state.js';
import { tiles, flatTiles, buildStructureDirectly, demolishStructureDirectly, updateTileSelectionInfo } from './grid.js';
import { scene, camera, renderer, cameraState, GRID_SIZE, TILE_SPACING, hoveredTile, setHoveredTile, updateCameraPosition } from './scene.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isDragging = false;
let dragMode = null; 
let previousMousePosition = { x: 0, y: 0 };
let initialTouchDistance = 0;
let isTwoFingerTouch = false;
let lastPaintedTile = null; 


const PAINT_TOOLS = new Set(['road', 'demolish']);
const BUILD_TOOLS = new Set(['road', 'hospital', 'floresta', 'usina', 'fabrica', 'mina', 'agua', 'predio', 'cinema', 'demolish']);


export function getGridLine(x1, z1, x2, z2) {
    const points = [];
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    const sx = (x1 < x2) ? 1 : -1;
    const sz = (z1 < z2) ? 1 : -1;
    let err = dx - dz;

    let x = x1;
    let z = z1;

    while (true) {
        points.push({ x, z });
        if (x === x2 && z === z2) break;
        const e2 = 2 * err;
        if (e2 > -dz) {
            err -= dz;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            z += sz;
        }
    }
    return points;
}


export function raycastTile(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    
    if (state.currentTool === 'select') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        for (const intersect of intersects) {
            let obj = intersect.object;
            while (obj) {
                const tile = flatTiles.find(t => t.mesh === obj || t.builtStructure === obj);
                if (tile) {
                    return tile;
                }
                obj = obj.parent;
            }
        }
    }

    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
    const targetVector = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, targetVector)) {
        const x = Math.round(targetVector.x / TILE_SPACING);
        const z = Math.round(targetVector.z / TILE_SPACING);

        if (x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE) {
            return tiles[x][z];
        }
    }

    return null;
}


export function initInput(container) {
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('contextmenu', e => e.preventDefault());
}


function onMouseDown(event) {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };

    
    const tile = raycastTile(event.clientX, event.clientY);
    setHoveredTile(tile);

    
    if (event.button === 0 && !event.shiftKey && PAINT_TOOLS.has(state.currentTool)) {
        state.isPainting = true;
        state.paintedThisDrag = new Set();
        dragMode = null; 
        
        
        if (tile) {
            const key = `${tile.x},${tile.z}`;
            state.paintedThisDrag.add(key);
            lastPaintedTile = tile;
            if (state.currentTool === 'road') {
                buildStructureDirectly(tile, 'road');
            } else if (state.currentTool === 'demolish') {
                demolishStructureDirectly(tile);
            }
        }
        return;
    } else if (event.button === 0 && !event.shiftKey) {
        dragMode = 'rotate';
    } else {
        dragMode = 'pan';
    }
}

function onMouseMove(event) {
    
    const tile = raycastTile(event.clientX, event.clientY);
    setHoveredTile(tile);

    
    if (state.isPainting && tile) {
        if (lastPaintedTile) {
            const line = getGridLine(lastPaintedTile.x, lastPaintedTile.z, tile.x, tile.z);
            for (const pt of line) {
                const currentTile = tiles[pt.x][pt.z];
                const key = `${currentTile.x},${currentTile.z}`;
                if (!state.paintedThisDrag.has(key)) {
                    state.paintedThisDrag.add(key);
                    if (state.currentTool === 'road') {
                        buildStructureDirectly(currentTile, 'road');
                    } else if (state.currentTool === 'demolish') {
                        demolishStructureDirectly(currentTile);
                    }
                }
            }
        } else {
            const key = `${tile.x},${tile.z}`;
            if (!state.paintedThisDrag.has(key)) {
                state.paintedThisDrag.add(key);
                if (state.currentTool === 'road') {
                    buildStructureDirectly(tile, 'road');
                } else if (state.currentTool === 'demolish') {
                    demolishStructureDirectly(tile);
                }
            }
        }
        lastPaintedTile = tile;
        return;
    }

    
    if (!isDragging) return;

    const deltaX = event.clientX - previousMousePosition.x;
    const deltaY = event.clientY - previousMousePosition.y;

    if (dragMode === 'rotate') {
        cameraState.thetaTarget -= deltaX * 0.007;
        cameraState.phiTarget = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraState.phiTarget - deltaY * 0.007));
    } else if (dragMode === 'pan') {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        const panFactor = cameraState.distance * 0.0012;
        
        cameraState.target.addScaledVector(right, -deltaX * panFactor);
        cameraState.target.addScaledVector(forward, deltaY * panFactor);
    }

    previousMousePosition = { x: event.clientX, y: event.clientY };
}

function onMouseUp(event) {
    if (state.isPainting) {
        state.isPainting = false;
        state.paintedThisDrag = new Set();
        window.lastPaintedTile = null;
        isDragging = false;
        dragMode = null;
        return;
    }
    if (isDragging && dragMode === 'rotate' && Math.abs(event.clientX - previousMousePosition.x) < 3 && Math.abs(event.clientY - previousMousePosition.y) < 3) {
        handleGridClick();
    }
    isDragging = false;
    dragMode = null;
}

function onWheel(event) {
    cameraState.distanceTarget = Math.max(10, Math.min(120, cameraState.distanceTarget + event.deltaY * 0.03));
}

// --- Touch Events ---
export function initTouch(container) {
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
}

function onTouchStart(event) {
    isDragging = true;
    if (event.touches.length === 1) {
        isTwoFingerTouch = false;
        previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        
        const tile = raycastTile(event.touches[0].clientX, event.touches[0].clientY);
        setHoveredTile(tile);

        if (state.currentTool === 'road' || state.currentTool === 'demolish') {
            state.isPainting = true;
            state.paintedThisDrag = new Set();
            dragMode = null;
            
            if (tile) {
                const key = `${tile.x},${tile.z}`;
                state.paintedThisDrag.add(key);
                lastPaintedTile = tile;
                if (state.currentTool === 'road') {
                    buildStructureDirectly(tile, 'road');
                } else if (state.currentTool === 'demolish') {
                    demolishStructureDirectly(tile);
                }
            }
            return;
        }
        dragMode = 'rotate';
    } else if (event.touches.length === 2) {
        isTwoFingerTouch = true;
        dragMode = 'pan';
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        initialTouchDistance = Math.sqrt(dx * dx + dy * dy);
        
        previousMousePosition = { 
            x: (event.touches[0].clientX + event.touches[1].clientX) / 2, 
            y: (event.touches[0].clientY + event.touches[1].clientY) / 2 
        };
    }
}

function onTouchMove(event) {
    if (!isDragging) return;

    if (event.touches.length === 1 && !isTwoFingerTouch) {
        const touch = event.touches[0];
        const tile = raycastTile(touch.clientX, touch.clientY);
        setHoveredTile(tile);

        if (state.isPainting && tile) {
            if (lastPaintedTile) {
                const line = getGridLine(lastPaintedTile.x, lastPaintedTile.z, tile.x, tile.z);
                for (const pt of line) {
                    const currentTile = tiles[pt.x][pt.z];
                    const key = `${currentTile.x},${currentTile.z}`;
                    if (!state.paintedThisDrag.has(key)) {
                        state.paintedThisDrag.add(key);
                        if (state.currentTool === 'road') {
                            buildStructureDirectly(currentTile, 'road');
                        } else if (state.currentTool === 'demolish') {
                            demolishStructureDirectly(currentTile);
                        }
                    }
                }
            } else {
                const key = `${tile.x},${tile.z}`;
                if (!state.paintedThisDrag.has(key)) {
                    state.paintedThisDrag.add(key);
                    if (state.currentTool === 'road') {
                        buildStructureDirectly(tile, 'road');
                    } else if (state.currentTool === 'demolish') {
                        demolishStructureDirectly(tile);
                    }
                }
            }
            lastPaintedTile = tile;
            return;
        }

        const deltaX = touch.clientX - previousMousePosition.x;
        const deltaY = touch.clientY - previousMousePosition.y;

        cameraState.thetaTarget -= deltaX * 0.007;
        cameraState.phiTarget = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, cameraState.phiTarget - deltaY * 0.007));

        previousMousePosition = { x: touch.clientX, y: touch.clientY };
    } else if (event.touches.length === 2) {
        event.preventDefault();

        const touch1 = event.touches[0];
        const touch2 = event.touches[1];

        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);
        const distanceDelta = currentDistance - initialTouchDistance;

        cameraState.distanceTarget = Math.max(10, Math.min(120, cameraState.distanceTarget - distanceDelta * 0.15));
        initialTouchDistance = currentDistance;

        const midX = (touch1.clientX + touch2.clientX) / 2;
        const midY = (touch1.clientY + touch2.clientY) / 2;
        
        const deltaX = midX - previousMousePosition.x;
        const deltaY = midY - previousMousePosition.y;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        right.normalize();

        const panFactor = cameraState.distance * 0.0015;
        cameraState.target.addScaledVector(right, -deltaX * panFactor);
        cameraState.target.addScaledVector(forward, deltaY * panFactor);

        previousMousePosition = { x: midX, y: midY };
    }
}

function onTouchEnd(event) {
    if (state.isPainting) {
        state.isPainting = false;
        state.paintedThisDrag = new Set();
        lastPaintedTile = null;
    }
    isDragging = false;
    isTwoFingerTouch = false;
}


function handleGridClick() {
    if (!hoveredTile) {
        state.selectedTile = null;
        updateTileSelectionInfo(null);
        return;
    }

    const tile = hoveredTile;

    if (state.currentTool === 'select') {
        state.selectedTile = { x: tile.x, z: tile.z };
        updateTileSelectionInfo(tile);
        document.getElementById('footer-wrapper').classList.remove('collapsed');
    } 
    else if (BUILD_TOOLS.has(state.currentTool) && state.currentTool !== 'demolish') {
        buildStructureDirectly(tile, state.currentTool);
    } 
    else if (state.currentTool === 'demolish') {
        demolishStructureDirectly(tile);
    }
}
