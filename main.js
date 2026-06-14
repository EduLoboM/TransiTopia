import * as THREE from 'three';

// --- Game State & Resources ---
const state = {
    odometer: 0.0,
    resources: {
        asphalt: 0.0,
        steel: 0.0,
        concrete: 0.0
    },
    tokens: 120,
    happiness: 85,
    selectedTile: null, // { x, z }
    currentTool: 'select', // 'select', 'road', 'sos', 'fauna', 'demolish'
};

// Costs and stats for building
const BUILD_CONFIGS = {
    road: {
        name: 'Rodovia Virtual',
        cost: { asphalt: 2.0, steel: 0.0, concrete: 0.0 },
        happinessBonus: 1,
        color: 0x64748b, // Pastel gray-slate road
        icon: '🛣️'
    },
    sos: {
        name: 'Posto SOS Médico',
        cost: { asphalt: 0.0, steel: 1.0, concrete: 1.5 },
        happinessBonus: 8,
        color: 0xffaec1, // Pastel red/pink cross cabin
        icon: '🚑'
    },
    fauna: {
        name: 'Ecoduto de Fauna',
        cost: { asphalt: 0.0, steel: 2.0, concrete: 2.0 },
        happinessBonus: 12,
        color: 0xa3f3c8, // Pastel green bridge
        icon: '🦊'
    }
};

// --- Odometer Simulation Random Events ---
const EVENTS = [
    { text: "Trecho de rodovia recapeado com sucesso! (+3% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 3); } },
    { text: "Acidente leve detectado! Socorro SOS acionado rapidamente.", effect: () => {} },
    { text: "Capivaras avistadas próximas à pista! Risco de atropelamento. (-2% Felicidade)", effect: () => { state.happiness = Math.max(0, state.happiness - 2); } },
    { text: "Motorista elogiou o novo asfalto nas redes sociais! (+2% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 2); } }
];

// --- 3D Scene Configurations ---
const GRID_SIZE = 20;
const TILE_SPACING = 1.0;
const tiles = []; // 2D array: { x, z, mesh, defaultColor, targetY, targetColor, type }

let scene, camera, renderer;
let mainContainer;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredTile = null;
let isPainting = false; // For drag-to-paint road mode
let paintedThisDrag = new Set(); // Track tiles painted during one drag

// --- Smooth Camera Setup ---
const cameraState = {
    target: new THREE.Vector3((GRID_SIZE * TILE_SPACING) / 2, 0, (GRID_SIZE * TILE_SPACING) / 2),
    targetLerped: new THREE.Vector3((GRID_SIZE * TILE_SPACING) / 2, 0, (GRID_SIZE * TILE_SPACING) / 2),
    distance: 30,
    distanceTarget: 30,
    theta: Math.PI / 4,
    thetaTarget: Math.PI / 4,
    phi: Math.PI / 3,
    phiTarget: Math.PI / 3,
};

let isDragging = false;
let dragMode = null; // 'rotate' or 'pan'
let previousMousePosition = { x: 0, y: 0 };

// --- Initialize Application ---
function init() {
    mainContainer = document.getElementById('canvas-container');
    
    // Scene setup - Brightsky Light Mode
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe); // Soft sky blue
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.012);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mainContainer.appendChild(renderer.domElement);

    // Camera setup
    camera = new THREE.PerspectiveCamera(45, mainContainer.clientWidth / mainContainer.clientHeight, 0.1, 1000);
    updateCameraPosition(true);

    // Lighting setup - Bright afternoon sun
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Bright white light
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(30, 40, 20);
    sunLight.castShadow = SunLightShadowConfig();
    scene.add(sunLight);

    // Subtle cozy warm skylight accent
    const accentLight = new THREE.DirectionalLight(0xffedd5, 0.4);
    accentLight.position.set(-20, -10, -20);
    scene.add(accentLight);

    // Create World Grid
    createGrid();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    
    // Pointer interaction setup
    mainContainer.addEventListener('mousedown', onMouseDown);
    mainContainer.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    mainContainer.addEventListener('wheel', onWheel, { passive: true });
    mainContainer.addEventListener('contextmenu', e => e.preventDefault());

    // Touch events for mobile compatibility
    mainContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    mainContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    mainContainer.addEventListener('touchend', onTouchEnd, { passive: true });

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

    // Start Game Loop
    animate();
}

function SunLightShadowConfig() {
    const sunLight = new THREE.DirectionalLight();
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 40;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    return sunLight.shadow;
}

// --- Grid Construction ---
function createGrid() {
    const tileGeometry = new THREE.BoxGeometry(1.0, 0.2, 1.0);
    const centerOffset = (GRID_SIZE * TILE_SPACING) / 2;
    
    for (let x = 0; x < GRID_SIZE; x++) {
        tiles[x] = [];
        for (let z = 0; z < GRID_SIZE; z++) {
            // Cozy grass pastel tiles
            const baseColor = (x + z) % 2 === 0 ? 0xecfdf5 : 0xd1fae5; // Tailwind emerald-50 and emerald-100
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.6,
                metalness: 0.1,
                flatShading: true
            });
            
            const mesh = new THREE.Mesh(tileGeometry, material);
            mesh.position.set(x * TILE_SPACING, -0.1, z * TILE_SPACING);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            // Add simple dark grid outline for visual definition
            const wireframeGeo = new THREE.EdgesGeometry(tileGeometry);
            const wireframeMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1 }); // Soft gray outline
            const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
            mesh.add(wireframe);

            tiles[x][z] = {
                x,
                z,
                mesh,
                material,
                baseColor,
                targetY: -0.1,
                targetColor: new THREE.Color(baseColor),
                type: 'grass',
                builtStructure: null
            };
        }
    }

    // Grid base platform (slate gray)
    const baseGeo = new THREE.BoxGeometry(GRID_SIZE * TILE_SPACING + 1.0, 0.4, GRID_SIZE * TILE_SPACING + 1.0);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, metalness: 0.1 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(centerOffset - 0.5, -0.4, centerOffset - 0.5);
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);
}

// --- Camera math ---
function updateCameraPosition(immediate = false) {
    const phi = cameraState.phi;
    const theta = cameraState.theta;
    const dist = cameraState.distance;

    const target = immediate ? cameraState.target : cameraState.targetLerped;

    const x = target.x + dist * Math.sin(phi) * Math.cos(theta);
    const y = target.y + dist * Math.cos(phi);
    const z = target.z + dist * Math.sin(phi) * Math.sin(theta);

    camera.position.set(x, y, z);
    camera.lookAt(target);
}

// --- Render / Update Loop ---
function animate() {
    requestAnimationFrame(animate);

    // 1. Smoothly interpolate camera state (damping)
    cameraState.theta += (cameraState.thetaTarget - cameraState.theta) * 0.12;
    cameraState.phi += (cameraState.phiTarget - cameraState.phi) * 0.12;
    cameraState.distance += (cameraState.distanceTarget - cameraState.distance) * 0.12;
    cameraState.targetLerped.lerp(cameraState.target, 0.12);

    updateCameraPosition();

    // 2. Smoothly animate tiles (hover lift and color transitions)
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const tile = tiles[x][z];
            
            // Hover logic
            if (hoveredTile && hoveredTile.x === x && hoveredTile.z === z) {
                if (state.selectedTile && state.selectedTile.x === x && state.selectedTile.z === z) {
                    tile.targetY = 0.2;
                    tile.targetColor.setHex(0xffaec1); // Selected color (Cotton-Candy Pink)
                } else {
                    tile.targetY = 0.1;
                    // Show tool-specific preview colors
                    if (state.currentTool === 'road' && tile.type === 'grass') {
                        tile.targetColor.setHex(0x64748b); // Slate road preview
                    } else if (state.currentTool === 'sos' && tile.type === 'grass') {
                        tile.targetColor.setHex(0xffaec1); // Pink SOS preview
                    } else if (state.currentTool === 'fauna' && tile.type === 'grass') {
                        tile.targetColor.setHex(0xa3f3c8); // Mint fauna preview
                    } else if (state.currentTool === 'demolish' && tile.type !== 'grass') {
                        tile.targetColor.setHex(0xff9e9e); // Red demolish preview
                    } else {
                        tile.targetColor.setHex(0x93c5fd); // Default hover (Sky Blue)
                    }
                }
            } else if (state.selectedTile && state.selectedTile.x === x && state.selectedTile.z === z) {
                tile.targetY = 0.2;
                tile.targetColor.setHex(0xffaec1); // Selected color (Cotton-Candy Pink)
            } else {
                tile.targetY = -0.1;
                if (tile.type === 'grass') {
                    tile.targetColor.setHex(tile.baseColor);
                } else {
                    tile.targetColor.setHex(BUILD_CONFIGS[tile.type].color);
                }
            }

            // Lerp physical height
            tile.mesh.position.y += (tile.targetY - tile.mesh.position.y) * 0.18;
            
            // Lerp color
            tile.material.color.lerp(tile.targetColor, 0.18);
        }
    }

    renderer.render(scene, camera);
}

// --- Input Handling & Drag Controls ---
function onMouseDown(event) {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };

    // Explicitly raycast on click to ensure we have the most accurate tile
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    // Check intersection with all meshes in the scene, recursive=true
    const intersects = raycaster.intersectObjects(scene.children, true);

    let clickedTile = null;
    if (intersects.length > 0) {
        // Find the first intersected object that belongs to a tile
        for (const intersect of intersects) {
            let obj = intersect.object;
            // Traverse up the parent chain to see if this object or any parent is a tile.mesh
            while (obj) {
                const tile = tiles.flatMap(r => r).find(t => t.mesh === obj);
                if (tile) {
                    clickedTile = tile;
                    break;
                }
                obj = obj.parent;
            }
            if (clickedTile) break;
        }
    }

    if (clickedTile) {
        hoveredTile = clickedTile;
    } else {
        hoveredTile = null;
    }

    // Debug log to trace interaction
    console.log(`[Mouse] Click at x:${event.clientX}, y:${event.clientY}. Intersects: ${intersects.length}. Tile found:`, hoveredTile);

    // If we're in a building tool mode (road, demolish), start painting instead of rotating
    if (event.button === 0 && !event.shiftKey && (state.currentTool === 'road' || state.currentTool === 'demolish')) {
        isPainting = true;
        paintedThisDrag = new Set();
        dragMode = null; // Don't rotate camera while painting
        
        // Immediately paint the tile under cursor
        if (hoveredTile) {
            const key = `${hoveredTile.x},${hoveredTile.z}`;
            if (!paintedThisDrag.has(key)) {
                paintedThisDrag.add(key);
                console.log(`[Mouse] Painting first tile at ${key} with ${state.currentTool}`);
                if (state.currentTool === 'road') {
                    buildStructureDirectly(hoveredTile, 'road');
                } else if (state.currentTool === 'demolish') {
                    demolishStructureDirectly(hoveredTile);
                }
            }
        } else {
            console.warn(`[Mouse] Clicked, but hoveredTile is null. Cannot build. Intersects list:`, intersects.map(i => i.object.type));
        }
        return;
    } else if (event.button === 0 && !event.shiftKey) {
        dragMode = 'rotate';
    } else {
        dragMode = 'pan';
    }
}

function onMouseMove(event) {
    // 1. Raycast for grid hover mapping
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(tiles.flatMap(row => row.map(t => t.mesh)));

    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const tile = tiles.flatMap(r => r).find(t => t.mesh === mesh);
        if (tile) {
            hoveredTile = tile;
        }
    } else {
        hoveredTile = null;
    }

    // 2. Drag-to-paint: if painting roads/demolishing, build on each new hovered tile
    if (isPainting && hoveredTile) {
        const key = `${hoveredTile.x},${hoveredTile.z}`;
        if (!paintedThisDrag.has(key)) {
            paintedThisDrag.add(key);
            if (state.currentTool === 'road') {
                buildStructureDirectly(hoveredTile, 'road');
            } else if (state.currentTool === 'demolish') {
                demolishStructureDirectly(hoveredTile);
            }
        }
        return; // Don't do camera drag while painting
    }

    // 3. Camera Drag manipulation
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
    if (isPainting) {
        isPainting = false;
        paintedThisDrag = new Set();
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

// --- Touch Screen Event Handlers ---
let initialTouchDistance = 0;
let isTwoFingerTouch = false;

function onTouchStart(event) {
    isDragging = true;
    if (event.touches.length === 1) {
        isTwoFingerTouch = false;
        
        // Setup initial mouse position
        previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        
        // Raycast for touch to find hovered tile instantly
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(tiles.flatMap(row => row.map(t => t.mesh)));
        
        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            hoveredTile = tiles.flatMap(r => r).find(t => t.mesh === mesh);
        } else {
            hoveredTile = null;
        }

        console.log(`[Touch] Tap detected. Tool: ${state.currentTool}, Tile:`, hoveredTile);

        // If we're in a building tool mode, paint on tap
        if (state.currentTool === 'road' || state.currentTool === 'demolish') {
            isPainting = true;
            paintedThisDrag = new Set();
            dragMode = null; 
            
            if (hoveredTile) {
                const key = `${hoveredTile.x},${hoveredTile.z}`;
                paintedThisDrag.add(key);
                console.log(`[Touch] Painting first tile at ${key} with ${state.currentTool}`);
                if (state.currentTool === 'road') {
                    buildStructureDirectly(hoveredTile, 'road');
                } else if (state.currentTool === 'demolish') {
                    demolishStructureDirectly(hoveredTile);
                }
            } else {
                console.warn(`[Touch] Tapped, but hoveredTile is null.`);
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
    isDragging = false;
    isTwoFingerTouch = false;
}

// --- Window resizing ---
function onWindowResize() {
    camera.aspect = mainContainer.clientWidth / mainContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mainContainer.clientWidth, mainContainer.clientHeight);
}

// --- Grid Interactions & Tool Selection Logic ---
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
    else if (state.currentTool === 'road' || state.currentTool === 'sos' || state.currentTool === 'fauna') {
        buildStructureDirectly(tile, state.currentTool);
    } 
    else if (state.currentTool === 'demolish') {
        demolishStructureDirectly(tile);
    }
}

function updateTileSelectionInfo(tile) {
    const infoContainer = document.getElementById('selected-tile-info');
    
    if (!tile) {
        infoContainer.classList.add('hidden');
        return;
    }

    let typeStr = "Lote Baldio";
    let icon = "🌱";
    let desc = "Passe para o modo de construção para criar estruturas.";
    if (tile.type === 'road') { typeStr = "Rodovia Virtual"; icon = "🛣️"; desc = "Garante tráfego fluido de veículos."; }
    else if (tile.type === 'sos') { typeStr = "Posto SOS Médico"; icon = "🚑"; desc = "Atendimento rápido em emergências."; }
    else if (tile.type === 'fauna') { typeStr = "Ecoduto de Fauna"; icon = "🦊"; desc = "Preserva vidas de animais silvestres."; }

    let demolishBtnHTML = '';
    if (tile.type !== 'grass') {
        demolishBtnHTML = `<button class="btn-danger bubble-btn" onclick="window.demolishSelectedTile(${tile.x}, ${tile.z})">🧹 Demolir</button>`;
    }

    infoContainer.innerHTML = `
        <div class="card-icon">${icon}</div>
        <div class="card-text">
            <h4>Lote (${tile.x}, ${tile.z}) - ${typeStr}</h4>
            <p>${desc}</p>
        </div>
        ${demolishBtnHTML}
    `;
    infoContainer.classList.remove('hidden');
}

// --- Direct Building Actions ---
function buildStructureDirectly(tile, structureType) {
    try {
        const isFirstAction = !isPainting || (paintedThisDrag && paintedThisDrag.size <= 1);
        console.log(`[Build] Attempting to build '${structureType}' at (${tile.x}, ${tile.z}). isFirstAction: ${isFirstAction}`);

        if (tile.type !== 'grass') {
            console.log(`[Build] Tile already has structure: ${tile.type}`);
            if (isFirstAction) showToast("Lote já possui uma estrutura construída!", "warning");
            return;
        }

        const config = BUILD_CONFIGS[structureType];
        const meetsCost = Object.keys(config.cost).every(res => {
            const available = Math.round(state.resources[res] * 10) / 10;
            console.log(`[Build] Cost check for ${res}: available ${available} >= cost ${config.cost[res]}`);
            return available >= config.cost[res];
        });
        
        if (!meetsCost) {
            console.warn(`[Build] Insufficient resources for ${structureType}.`);
            if (isFirstAction) showToast("Insumos insuficientes! Viaje na rodovia real para acumular recursos.", "warning");
            return;
        }

        // Deduct cost
        console.log(`[Build] Deducting costs...`);
        Object.keys(config.cost).forEach(res => {
            state.resources[res] -= config.cost[res];
        });

        // Build structure
        console.log(`[Build] Creating meshes...`);
        tile.type = structureType;
        buildStructureMesh(tile, structureType);

        // If road, update neighboring road meshes for connectivity
        if (structureType === 'road') {
            updateNeighborRoadMeshes(tile.x, tile.z);
        }

        // Apply bonuses
        state.happiness = Math.min(100, state.happiness + config.happinessBonus);
        state.tokens += Math.round(config.happinessBonus * 1.5);

        updateHUD();
        console.log(`[Build] Successfully built ${structureType}. Showing toast if first action.`);
        if (isFirstAction) {
            showToast(`Construído: ${config.name}! +${config.happinessBonus}% Felicidade`, "success");
        }
    } catch (error) {
        showToast(`Erro interno: ${error.message}`, "danger");
        console.error("[Build] Error:", error);
    }
}

function demolishStructureDirectly(tile) {
    const isFirstAction = !isPainting || (paintedThisDrag && paintedThisDrag.size <= 1);

    if (tile.type === 'grass') {
        if (isFirstAction) showToast("Este lote já está vazio!", "warning");
        return;
    }

    const wasRoad = tile.type === 'road';

    if (tile.builtStructure) {
        scene.remove(tile.builtStructure);
        tile.builtStructure = null;
    }

    tile.type = 'grass';
    state.happiness = Math.max(0, state.happiness - 5);

    // If road was demolished, update neighboring road meshes
    if (wasRoad) {
        updateNeighborRoadMeshes(tile.x, tile.z);
    }

    updateHUD();
    if (isFirstAction) {
        showToast("Estrutura demolida! -5% Felicidade", "danger");
    }
}

// Bind demolition callback globally for selection pill
window.demolishSelectedTile = function(x, z) {
    const tile = tiles[x][z];
    demolishStructureDirectly(tile);
    updateTileSelectionInfo(tile);
};

// --- Road Connectivity Helpers ---
function getNeighborRoads(x, z) {
    // Returns { north, south, east, west } boolean flags
    return {
        north: z > 0 && tiles[x][z - 1].type === 'road',
        south: z < GRID_SIZE - 1 && tiles[x][z + 1].type === 'road',
        east:  x < GRID_SIZE - 1 && tiles[x + 1][z].type === 'road',
        west:  x > 0 && tiles[x - 1][z].type === 'road',
    };
}

function getRoadConnectionType(neighbors) {
    const { north, south, east, west } = neighbors;
    const count = [north, south, east, west].filter(Boolean).length;

    if (count === 0) return { type: 'single', rotation: 0 };
    if (count === 4) return { type: 'crossroad', rotation: 0 };

    if (count === 3) {
        // T-junction — rotation points to the missing arm
        if (!north) return { type: 'tjunction', rotation: 0 };
        if (!east)  return { type: 'tjunction', rotation: Math.PI / 2 };
        if (!south) return { type: 'tjunction', rotation: Math.PI };
        if (!west)  return { type: 'tjunction', rotation: -Math.PI / 2 };
    }

    if (count === 2) {
        // Straight roads
        if (north && south) return { type: 'straight', rotation: 0 };
        if (east && west)   return { type: 'straight', rotation: Math.PI / 2 };
        // Curves
        if (south && east)  return { type: 'curve', rotation: 0 };
        if (south && west)  return { type: 'curve', rotation: Math.PI / 2 };
        if (north && west)  return { type: 'curve', rotation: Math.PI };
        if (north && east)  return { type: 'curve', rotation: -Math.PI / 2 };
    }

    if (count === 1) {
        // Dead-end
        if (north) return { type: 'deadend', rotation: 0 };
        if (east)  return { type: 'deadend', rotation: -Math.PI / 2 };
        if (south) return { type: 'deadend', rotation: Math.PI };
        if (west)  return { type: 'deadend', rotation: Math.PI / 2 };
    }

    return { type: 'single', rotation: 0 };
}

function updateNeighborRoadMeshes(cx, cz) {
    // Update all 4 neighbors if they are roads
    const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]];
    for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
            const neighbor = tiles[nx][nz];
            if (neighbor.type === 'road') {
                buildStructureMesh(neighbor, 'road');
            }
        }
    }
}

// --- Road mesh builder (smart connectivity) ---
function buildRoadMesh(tile) {
    const group = new THREE.Group();
    const neighbors = getNeighborRoads(tile.x, tile.z);
    const conn = getRoadConnectionType(neighbors);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.05 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7, metalness: 0.05 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Base road surface (always present)
    const baseGeo = new THREE.BoxGeometry(1.0, 0.05, 1.0);
    const baseMesh = new THREE.Mesh(baseGeo, roadMat);
    baseMesh.position.set(0, 0.12, 0);
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    if (conn.type === 'single') {
        // Isolated road — small circle marking
        const circleGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.01, 12);
        const circle = new THREE.Mesh(circleGeo, lineMat);
        circle.position.set(0, 0.15, 0);
        group.add(circle);

        // Sidewalks on all 4 sides
        addSidewalk(group, sidewalkMat, 'north');
        addSidewalk(group, sidewalkMat, 'south');
        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');
     
    } else if (conn.type === 'straight') {
        // Center dashed yellow line along the road direction
        const dashGroup = new THREE.Group();
        for (let i = -1; i <= 1; i++) {
            const dashGeo = new THREE.BoxGeometry(0.08, 0.01, 0.18);
            const dash = new THREE.Mesh(dashGeo, lineMat);
            dash.position.set(0, 0.155, i * 0.3);
            dashGroup.add(dash);
        }
        group.add(dashGroup);

        // Sidewalks on the sides (perpendicular to road direction)
        // Straight road: default is N-S, so sidewalks on E and W
        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');

    } else if (conn.type === 'curve') {
        // Curved road corner — arc marking
        // Default curve: connects south and east
        const curveGroup = new THREE.Group();
        const segments = 6;
        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI / 2) * (i / (segments - 1));
            const cx = -0.5 + Math.cos(angle) * 0.0;
            const cz = 0.5 - Math.sin(angle) * 0.0;
            // Just a small dot pattern along the curve
            const dotGeo = new THREE.BoxGeometry(0.06, 0.01, 0.06);
            const dot = new THREE.Mesh(dotGeo, lineMat);
            const radius = 0.0;
            dot.position.set(
                Math.cos(angle) * 0.15,
                0.155,
                Math.sin(angle) * 0.15
            );
            curveGroup.add(dot);
        }
        group.add(curveGroup);

        // Sidewalks on the outer corner edges
        // Default curve (south+east): sidewalks on north and west
        addSidewalk(group, sidewalkMat, 'north');
        addSidewalk(group, sidewalkMat, 'west');

    } else if (conn.type === 'tjunction') {
        // T-junction — short center line
        const lineGeo = new THREE.BoxGeometry(0.08, 0.01, 0.25);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.155, 0);
        group.add(line);

        // Small crossbar
        const crossGeo = new THREE.BoxGeometry(0.25, 0.01, 0.08);
        const cross = new THREE.Mesh(crossGeo, lineMat);
        cross.position.set(0, 0.155, 0);
        group.add(cross);

        // Sidewalk on the missing side
        // Default T (missing north): sidewalk on north
        addSidewalk(group, sidewalkMat, 'south');

    } else if (conn.type === 'crossroad') {
        // Crossroad — cross pattern center marking
        const hGeo = new THREE.BoxGeometry(0.3, 0.01, 0.06);
        const hLine = new THREE.Mesh(hGeo, whiteMat);
        hLine.position.set(0, 0.155, 0);
        group.add(hLine);

        const vGeo = new THREE.BoxGeometry(0.06, 0.01, 0.3);
        const vLine = new THREE.Mesh(vGeo, whiteMat);
        vLine.position.set(0, 0.155, 0);
        group.add(vLine);

        // No sidewalks on crossroads

    } else if (conn.type === 'deadend') {
        // Dead-end — line pointing to connection, cap on other end
        const lineGeo = new THREE.BoxGeometry(0.08, 0.01, 0.35);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.155, -0.1);
        group.add(line);

        // Round cap at end
        const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 8);
        const cap = new THREE.Mesh(capGeo, lineMat);
        cap.position.set(0, 0.155, 0.3);
        group.add(cap);

        // Sidewalks on 3 sides (not the connected side)
        // Default deadend (connected to north): sidewalks on east, west, south
        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');
        addSidewalk(group, sidewalkMat, 'south');
    }

    // Apply rotation for the connection type
    // We need to rotate all children except the base road surface
    const rotationGroup = new THREE.Group();
    const childrenToMove = [];
    group.children.forEach(child => {
        if (child !== baseMesh) {
            childrenToMove.push(child);
        }
    });
    childrenToMove.forEach(child => {
        group.remove(child);
        rotationGroup.add(child);
    });
    rotationGroup.rotation.y = conn.rotation;
    group.add(rotationGroup);

    return group;
}

// Helper: add a raised sidewalk/curb on a specific side
function addSidewalk(group, mat, side) {
    const curbGeo = new THREE.BoxGeometry(
        side === 'north' || side === 'south' ? 0.92 : 0.08,
        0.06,
        side === 'east' || side === 'west' ? 0.92 : 0.08
    );
    const curb = new THREE.Mesh(curbGeo, mat);
    curb.castShadow = true;
    curb.receiveShadow = true;

    const offset = 0.46;
    switch (side) {
        case 'north': curb.position.set(0, 0.16, -offset); break;
        case 'south': curb.position.set(0, 0.16, offset); break;
        case 'east':  curb.position.set(offset, 0.16, 0); break;
        case 'west':  curb.position.set(-offset, 0.16, 0); break;
    }
    group.add(curb);
}

function buildStructureMesh(tile, type) {
    if (tile.builtStructure) {
        scene.remove(tile.builtStructure);
    }

    const pos = tile.mesh.position;
    let group;

    if (type === 'road') {
        group = buildRoadMesh(tile);
    } else {
        group = new THREE.Group();

        if (type === 'sos') {
            // Red base
            const baseGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            const baseMat = new THREE.MeshStandardMaterial({ color: 0xff8ca3, roughness: 0.5 }); // Pastel red
            const baseMesh = new THREE.Mesh(baseGeo, baseMat);
            baseMesh.position.set(0, 0.35, 0);
            baseMesh.castShadow = true;
            group.add(baseMesh);

            // White roof
            const roofGeo = new THREE.ConeGeometry(0.4, 0.3, 4);
            const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
            const roofMesh = new THREE.Mesh(roofGeo, roofMat);
            roofMesh.rotation.y = Math.PI / 4;
            roofMesh.position.set(0, 0.7, 0);
            roofMesh.castShadow = true;
            group.add(roofMesh);
            
            // Neon green light beacon
            const lightGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
            const lightMesh = new THREE.Mesh(lightGeo, lightMat);
            lightMesh.position.set(0, 0.85, 0);
            group.add(lightMesh);
        } 
        else if (type === 'fauna') {
            const archMat = new THREE.MeshStandardMaterial({ color: 0xa3f3c8, roughness: 0.7 }); // Pastel mint arch
            
            const p1Geo = new THREE.BoxGeometry(0.15, 0.6, 0.8);
            const p1 = new THREE.Mesh(p1Geo, archMat);
            p1.position.set(-0.35, 0.4, 0);
            p1.castShadow = true;
            group.add(p1);

            const p2 = p1.clone();
            p2.position.x = 0.35;
            group.add(p2);

            const deckGeo = new THREE.BoxGeometry(0.85, 0.12, 0.85);
            const deck = new THREE.Mesh(deckGeo, archMat);
            deck.position.set(0, 0.7, 0);
            deck.castShadow = true;
            group.add(deck);

            // Little green vegetation bushes
            const bushGeo = new THREE.DodecahedronGeometry(0.18);
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.9 });
            
            const bush1 = new THREE.Mesh(bushGeo, bushMat);
            bush1.position.set(-0.1, 0.85, 0.1);
            group.add(bush1);

            const bush2 = bush1.clone();
            bush2.position.set(0.15, 0.82, -0.1);
            group.add(bush2);
        }
    }

    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
    tile.builtStructure = group;
}

// --- GPS simulated odometer logic ---
function simulateGPSTravel() {
    state.odometer += 5.0;

    const addAsphalt = parseFloat((Math.random() * 2 + 1).toFixed(1));
    const addSteel = parseFloat((Math.random() * 1 + 0.5).toFixed(1));
    const addConcrete = parseFloat((Math.random() * 1.5 + 0.8).toFixed(1));

    state.resources.asphalt += addAsphalt;
    state.resources.steel += addSteel;
    state.resources.concrete += addConcrete;

    if (state.happiness >= 80) {
        state.tokens += Math.round(5 + Math.random() * 10);
    }

    let toastMessage = `Viagem de +5.0 km concluída! Recursos coletados.`;
    
    if (Math.random() < 0.35) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        ev.effect();
        toastMessage = `${ev.text} | Insumos adicionados!`;
    }

    updateHUD();
    
    if (state.selectedTile) {
        updateTileSelectionInfo(tiles[state.selectedTile.x][state.selectedTile.z]);
    }

    showToast(toastMessage, "success");
}

// --- HUD Updates ---
function updateHUD() {
    document.getElementById('odometer-value').textContent = `${state.odometer.toFixed(1)} km`;
    
    document.getElementById('happiness-value').textContent = `${state.happiness}%`;
    document.getElementById('happiness-bar').style.width = `${state.happiness}%`;
    document.getElementById('token-value').textContent = state.tokens;

    document.getElementById('asphalt-value').innerHTML = `${state.resources.asphalt.toFixed(1)} <small>t</small>`;
    document.getElementById('steel-value').innerHTML = `${state.resources.steel.toFixed(1)} <small>t</small>`;
    document.getElementById('concrete-value').innerHTML = `${state.resources.concrete.toFixed(1)} <small>t</small>`;

    const happinessCard = document.querySelector('.stat-card.happiness');
    if (state.happiness < 80) {
        happinessCard.style.borderColor = 'var(--color-danger)';
        happinessCard.style.background = 'rgba(255, 158, 158, 0.15)';
    } else {
        happinessCard.style.borderColor = '';
        happinessCard.style.background = '';
    }
}

// --- Toasts ---
let toastTimeout;
function showToast(message, type = "success") {
    const toast = document.getElementById('toast-notification');
    
    if (type === "success") {
        toast.style.backgroundColor = "var(--color-mint)";
    } else if (type === "warning") {
        toast.style.backgroundColor = "var(--color-yellow)";
    } else if (type === "danger") {
        toast.style.backgroundColor = "var(--color-danger)";
    }

    toast.innerHTML = `<span>🔔</span> ${message}`;
    toast.classList.remove('hidden');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 4500);
}

// --- Run Application ---
window.onload = init;
