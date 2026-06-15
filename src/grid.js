import * as THREE from 'three';
import { state, BUILD_CONFIGS, updateHUD, showToast } from './state.js';
import { scene, GRID_SIZE, TILE_SPACING } from './scene.js';

export const tiles = [];
export let flatTiles = [];

// Simple 2D Value Noise for smooth coherent terrain generation
function createNoise2D() {
    const size = 32;
    const grid = [];
    for (let i = 0; i < size; i++) {
        grid[i] = [];
        for (let j = 0; j < size; j++) {
            grid[i][j] = Math.random();
        }
    }
    
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    
    return function(x, y) {
        const x0 = Math.floor(x) % size;
        const x1 = (x0 + 1) % size;
        const y0 = Math.floor(y) % size;
        const y1 = (y0 + 1) % size;
        
        const tx = x - Math.floor(x);
        const ty = y - Math.floor(y);
        
        const u = fade(tx);
        const v = fade(ty);
        
        const a = grid[x0][y0];
        const b = grid[x1][y0];
        const c = grid[x0][y1];
        const d = grid[x1][y1];
        
        return lerp(lerp(a, b, u), lerp(c, d, u), v);
    };
}

// Initialize grid structure
export function createGrid() {
    const tileGeometry = new THREE.BoxGeometry(1.0, 0.2, 1.0);
    const centerOffset = (GRID_SIZE * TILE_SPACING) / 2;
    
    const noise = createNoise2D();
    const seedX = Math.random() * 100;
    const seedZ = Math.random() * 100;
    
    for (let x = 0; x < GRID_SIZE; x++) {
        tiles[x] = [];
        for (let z = 0; z < GRID_SIZE; z++) {
            const val = noise(seedX + x * 0.22, seedZ + z * 0.22);
            
            const minDistToEdge = Math.min(x, z, GRID_SIZE - 1 - x, GRID_SIZE - 1 - z);
            const isNearBorder = minDistToEdge <= 2;
            
            let terrainType = 'grass';
            let baseColor = (x + z) % 2 === 0 ? 0xecfdf5 : 0xd1fae5;
            let targetY = -0.1;
            
            if (isNearBorder && val < 0.08) {
                terrainType = 'water';
                baseColor = (x + z) % 2 === 0 ? 0x60a5fa : 0x3b82f6; // Lake blue
                targetY = -0.25;
            } else if (isNearBorder && val < 0.15) {
                terrainType = 'sand';
                baseColor = 0xfef08a; // Sand beach
                targetY = -0.18;
            } else if (!isNearBorder && val < 0.07) {
                terrainType = 'water';
                baseColor = (x + z) % 2 === 0 ? 0x60a5fa : 0x3b82f6; // Lake blue
                targetY = -0.25;
            } else if (val < 0.80) {
                terrainType = 'grass';
                baseColor = (x + z) % 2 === 0 ? 0xecfdf5 : 0xd1fae5;
                targetY = -0.1;
            } else if (val < 0.88) {
                terrainType = 'floresta'; // Pre-spawn forest
                baseColor = (x + z) % 2 === 0 ? 0xecfdf5 : 0xd1fae5;
                targetY = -0.1;
            } else if (val < 0.91) {
                terrainType = 'grass';
                baseColor = (x + z) % 2 === 0 ? 0xecfdf5 : 0xd1fae5;
                targetY = -0.1;
            } else {
                terrainType = 'mountain'; // Mountain rocks
                baseColor = (x + z) % 2 === 0 ? 0x64748b : 0x475569;
                targetY = -0.1;
            }
            
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.7,
                metalness: 0.05,
                flatShading: true
            });
            
            const mesh = new THREE.Mesh(tileGeometry, material);
            mesh.position.set(x * TILE_SPACING, targetY, z * TILE_SPACING);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            // Add simple dark grid outline for visual definition
            const wireframeGeo = new THREE.EdgesGeometry(tileGeometry);
            const wireframeMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1 });
            const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
            mesh.add(wireframe);

            tiles[x][z] = {
                x,
                z,
                mesh,
                material,
                baseColor,
                targetY,
                targetColor: new THREE.Color(baseColor),
                type: terrainType,
                originalType: terrainType === 'floresta' ? 'grass' : terrainType,
                builtStructure: null
            };
        }
    }

    window.swimmingFish = [];

    // Pre-spawn scenery structures (forests, mountains, and swimming fish in water)
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const tile = tiles[x][z];
            if (tile.type === 'floresta') {
                buildStructureMesh(tile, 'floresta');
            } else if (tile.type === 'mountain') {
                buildStructureMesh(tile, 'mountain');
            } else if (tile.type === 'water') {
                // Spawn a cute low-poly swimming fish with 60% probability
                if (Math.random() < 0.6) {
                    const fishGroup = new THREE.Group();
                    const bodyColor = Math.random() < 0.5 ? 0xf97316 : 0x06b6d4; // Goldfish orange or neon cyan
                    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3, metalness: 0.1 });
                    
                    const body = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), bodyMat);
                    body.rotation.x = Math.PI / 2; // Lie flat along Z
                    fishGroup.add(body);
                    
                    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.05), bodyMat);
                    fin.position.set(0, 0, -0.09);
                    fishGroup.add(fin);
                    
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 0.16 + Math.random() * 0.12;
                    const speed = (0.012 + Math.random() * 0.02) * (Math.random() < 0.5 ? 1 : -1);
                    
                    fishGroup.position.set(Math.cos(angle) * radius, 0.12, Math.sin(angle) * radius);
                    
                    tile.mesh.add(fishGroup);
                    
                    window.swimmingFish.push({
                        group: fishGroup,
                        angle: angle,
                        radius: radius,
                        speed: speed,
                        finAngle: Math.random() * 10
                    });
                }
            }
        }
    }

    // Grid base platform (slate gray)
    const baseGeo = new THREE.BoxGeometry(GRID_SIZE * TILE_SPACING + 1.0, 0.4, GRID_SIZE * TILE_SPACING + 1.0);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, metalness: 0.1 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(centerOffset - 0.5, -0.4, centerOffset - 0.5);
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);

    // Populate flatTiles for optimized lookup in raycasting
    flatTiles.push(...tiles.flatMap(row => row));
}

// --- Direct Building Actions ---
export function buildStructureDirectly(tile, structureType) {
    try {
        const isFirstAction = !state.isPainting || (state.paintedThisDrag && state.paintedThisDrag.size <= 1);
        console.log(`[Build] Attempting to build '${structureType}' at (${tile.x}, ${tile.z}). isFirstAction: ${isFirstAction}`);

        const buildableTypes = new Set(['grass']);
        if (!buildableTypes.has(tile.type)) {
            console.log(`[Build] Tile is not buildable: ${tile.type}`);
            if (isFirstAction) {
                if (tile.type === 'water') showToast("Não é possível construir na água!", "warning");
                else if (tile.type === 'sand') showToast("Não é possível construir na areia!", "warning");
                else if (tile.type === 'mountain') showToast("Não é possível construir em montanhas!", "warning");
                else if (tile.type === 'floresta') showToast("Limpe a floresta natural usando a ferramenta Demolir primeiro!", "warning");
                else showToast("Lote indisponível para construção!", "warning");
            }
            return;
        }

        const config = BUILD_CONFIGS[structureType];
        const meetsCost = Object.keys(config.cost).every(res => {
            const available = Math.round(state.resources[res] * 10) / 10;
            return available >= config.cost[res];
        });
        
        if (!meetsCost) {
            console.warn(`[Build] Insufficient resources for ${structureType}.`);
            if (isFirstAction) showToast("Insumos insuficientes! Viaje na rodovia real para acumular recursos.", "warning");
            return;
        }

        // Deduct cost
        Object.keys(config.cost).forEach(res => {
            state.resources[res] -= config.cost[res];
        });

        // Build structure
        tile.type = structureType;
        buildStructureMesh(tile, structureType);

        // If road, update neighboring road meshes for connectivity
        if (structureType === 'road') {
            updateNeighborRoadMeshes(tile.x, tile.z);
        }

        // Apply bonuses
        state.happiness = Math.min(100, state.happiness + config.happinessBonus);
        state.tokens += Math.round(config.happinessBonus * 0.2);

        updateHUD();
        if (window.saveGameToServer) window.saveGameToServer();
        
        if (state.selectedTile && state.selectedTile.x === tile.x && state.selectedTile.z === tile.z) {
            updateTileSelectionInfo(tile);
        }

        if (isFirstAction) {
            showToast(`Construído: ${config.name}! +${config.happinessBonus}% Felicidade`, "success");
        }
    } catch (error) {
        showToast(`Erro interno: ${error.message}`, "danger");
        console.error("[Build] Error:", error);
    }
}

export function demolishStructureDirectly(tile) {
    const isFirstAction = !state.isPainting || (state.paintedThisDrag && state.paintedThisDrag.size <= 1);
    if (tile.type === 'water') {
        if (isFirstAction) showToast("Não é possível demolir a água!", "warning");
        return;
    }
    const emptyTypes = new Set(['grass', 'sand']);
    if (emptyTypes.has(tile.type)) {
        if (isFirstAction) showToast("Este lote já está vazio!", "warning");
        return;
    }

    const wasRoad = tile.type === 'road';
    const wasForest = tile.type === 'floresta';
    const wasMountain = tile.type === 'mountain';

    if (tile.builtStructure) {
        tile.mesh.remove(tile.builtStructure);
        tile.builtStructure = null;
    }

    tile.type = 'grass';
    
    let penalty = 5;
    let toastMessage = "Estrutura demolida! -5% Felicidade";
    
    if (wasForest) {
        penalty = 30;
        toastMessage = "Floresta natural derrubada! Cidadãos protestam. -30% Felicidade";
    } else if (wasMountain) {
        penalty = 50;
        toastMessage = "Montanha destruída! Impacto ambiental grave. -50% Felicidade";
    }

    state.happiness = Math.max(0, state.happiness - penalty);

    // If road was demolished, update neighboring road meshes
    if (wasRoad) {
        updateNeighborRoadMeshes(tile.x, tile.z);
    }

    updateHUD();
    if (window.saveGameToServer) window.saveGameToServer();
    
    if (state.selectedTile && state.selectedTile.x === tile.x && state.selectedTile.z === tile.z) {
        updateTileSelectionInfo(tile);
    }

    if (isFirstAction) {
        showToast(toastMessage, "danger");
    }
}

// Bind demolition callback globally for selection pill
window.demolishSelectedTile = function(x, z) {
    const tile = tiles[x][z];
    demolishStructureDirectly(tile);
};

// Refresh select info logic
window.refreshSelectedTileInfo = function() {
    if (state.selectedTile) {
        const tile = tiles[state.selectedTile.x][state.selectedTile.z];
        updateTileSelectionInfo(tile);
    }
};

export function isTileConnectedToRoad(x, z) {
    const directions = [
        [0, -1], // north
        [0, 1],  // south
        [1, 0],  // east
        [-1, 0]  // west
    ];
    for (const [dx, dz] of directions) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
            if (tiles[nx] && tiles[nx][nz] && tiles[nx][nz].type === 'road') {
                return true;
            }
        }
    }
    return false;
}

export function updateTileSelectionInfo(tile) {
    const infoContainer = document.getElementById('selected-tile-info');
    
    if (!tile) {
        infoContainer.classList.add('hidden');
        return;
    }

    const typeMap = {
        road:     { str: 'Rodovia Virtual',     icon: '🛣️', desc: 'Garante tráfego fluido de veículos.' },
        hospital: { str: 'Hospital',             icon: '🏥', desc: 'Atendimento de saúde para todos os cidadãos.' },
        floresta: { str: 'Área de Floresta',     icon: '🌳', desc: 'Preservação ambiental e biodiversidade.' },
        usina:    { str: 'Usina de Energia',     icon: '⚡', desc: 'Energia solar e eólica para a cidade.' },
        fabrica:  { str: 'Fábrica de Asfalto',   icon: '🏭', desc: 'Produção industrial e geração de empregos.' },
        mina:     { str: 'Mina de Minerais',     icon: '⛏️', desc: 'Extração de minérios e recursos naturais.' },
        agua:     { str: 'Poço de Água',         icon: '💧', desc: 'Tratamento e distribuição de água potável.' },
        predio:   { str: 'Prédio Urbano',        icon: '🏢', desc: 'Habitação e espaço comercial urbano.' },
        cinema:   { str: 'Cinema Cozy',          icon: '🎬', desc: 'Lazer e cultura. Aumenta a felicidade de prédios no raio.' },
        mountain: { str: 'Montanhas',            icon: '🏔️', desc: 'Montanhas rochosas naturais. Cidadãos protestam se você as destruir!' },
    };
    const info = typeMap[tile.type] || { str: 'Lote Baldio', icon: '🌱', desc: 'Passe para o modo de construção para criar estruturas.' };

    let demolishBtnHTML = '';
    let statusHTML = '';

    if (tile.type !== 'grass') {
        demolishBtnHTML = `<button class="btn-danger bubble-btn" onclick="window.demolishSelectedTile(${tile.x}, ${tile.z})">🧹 Demolir</button>`;
        
        if (['mina', 'fabrica', 'usina', 'agua', 'predio', 'hospital', 'floresta', 'cinema'].includes(tile.type)) {
            const connected = isTileConnectedToRoad(tile.x, tile.z);
            if (tile.type === 'predio') {
                if (connected) {
                    statusHTML = `<p class="status-connected">🟢 <strong>Conectado:</strong> Gerando tokens (+1/s) e tristeza</p>`;
                } else {
                    statusHTML = `<p class="status-disconnected">🔴 <strong>Desconectado:</strong> Conecte a uma rodovia para habitar e gerar tokens!</p>`;
                }
            } else if (['hospital', 'floresta', 'cinema'].includes(tile.type)) {
                if (connected) {
                    statusHTML = `<p class="status-connected">🟢 <strong>Conectado:</strong> Irradiando felicidade no raio</p>`;
                } else {
                    statusHTML = `<p class="status-disconnected">🔴 <strong>Desconectado:</strong> Conecte a uma rodovia para irradiar felicidade!</p>`;
                }
            } else {
                if (connected) {
                    statusHTML = `<p class="status-connected">🟢 <strong>Conectado:</strong> Gerando recurso (+0.2/s)</p>`;
                } else {
                    statusHTML = `<p class="status-disconnected">🔴 <strong>Desconectado:</strong> Conecte a uma rodovia adjacente!</p>`;
                }
            }
        }
    }

    infoContainer.innerHTML = `
        <div class="card-icon">${info.icon}</div>
        <div class="card-text">
            <h4>Lote (${tile.x}, ${tile.z}) - ${info.str}</h4>
            <p>${info.desc}</p>
            ${statusHTML}
        </div>
        ${demolishBtnHTML}
    `;
    infoContainer.classList.remove('hidden');
}

// --- Road Connectivity Helpers ---
function getNeighborRoads(x, z) {
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
        if (!east)  return { type: 'tjunction', rotation: -Math.PI / 2 };
        if (!south) return { type: 'tjunction', rotation: Math.PI };
        if (!west)  return { type: 'tjunction', rotation: Math.PI / 2 };
    }

    if (count === 2) {
        // Straight roads
        if (north && south) return { type: 'straight', rotation: 0 };
        if (east && west)   return { type: 'straight', rotation: Math.PI / 2 };
        // Curves
        if (south && east)  return { type: 'curve', rotation: 0 };
        if (south && west)  return { type: 'curve', rotation: -Math.PI / 2 };
        if (north && west)  return { type: 'curve', rotation: Math.PI };
        if (north && east)  return { type: 'curve', rotation: Math.PI / 2 };
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

export function updateNeighborRoadMeshes(cx, cz) {
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
    baseMesh.position.set(0, 0.02, 0);
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    if (conn.type === 'single') {
        // Isolated road — small circle marking
        const circleGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.01, 12);
        const circle = new THREE.Mesh(circleGeo, lineMat);
        circle.position.set(0, 0.05, 0);
        group.add(circle);

        // Sidewalks on all 4 sides
        addSidewalk(group, sidewalkMat, 'north');
        addSidewalk(group, sidewalkMat, 'south');
        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');
     
    } else if (conn.type === 'straight') {
        const dashGroup = new THREE.Group();
        for (let i = -1; i <= 1; i++) {
            const dashGeo = new THREE.BoxGeometry(0.08, 0.01, 0.18);
            const dash = new THREE.Mesh(dashGeo, lineMat);
            dash.position.set(0, 0.055, i * 0.3);
            dashGroup.add(dash);
        }
        group.add(dashGroup);

        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');

    } else if (conn.type === 'curve') {
        // Default curve: south && east connections (rotation 0)
        // Arc goes from south (+Z) to east (+X) through the inner south-east corner
        const curveGroup = new THREE.Group();
        const segments = 8;
        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI / 2) * (i / (segments - 1));
            // Arc coordinates that bend around the inner south-east corner (0.3, 0.3)
            // bulging towards the outer north-west corner (0, 0)
            const dotGeo = new THREE.BoxGeometry(0.05, 0.01, 0.05);
            const dot = new THREE.Mesh(dotGeo, lineMat);
            dot.position.set(
                0.3 - 0.3 * Math.cos(angle),
                0.055,
                0.3 - 0.3 * Math.sin(angle)
            );
            curveGroup.add(dot);
        }
        group.add(curveGroup);

        // Default curve (south && east): open corners are north and west
        addSidewalk(group, sidewalkMat, 'north');
        addSidewalk(group, sidewalkMat, 'west');

    } else if (conn.type === 'tjunction') {
        const lineGeo = new THREE.BoxGeometry(0.08, 0.01, 0.25);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.055, 0);
        group.add(line);

        const crossGeo = new THREE.BoxGeometry(0.25, 0.01, 0.08);
        const cross = new THREE.Mesh(crossGeo, lineMat);
        cross.position.set(0, 0.055, 0);
        group.add(cross);

        // Default T-junction (missing north): open sides are south, east, west
        // The capped side is north, where there is no road connection
        addSidewalk(group, sidewalkMat, 'north');

    } else if (conn.type === 'crossroad') {
        const hGeo = new THREE.BoxGeometry(0.3, 0.01, 0.06);
        const hLine = new THREE.Mesh(hGeo, whiteMat);
        hLine.position.set(0, 0.055, 0);
        group.add(hLine);

        const vGeo = new THREE.BoxGeometry(0.06, 0.01, 0.3);
        const vLine = new THREE.Mesh(vGeo, whiteMat);
        vLine.position.set(0, 0.055, 0);
        group.add(vLine);

    } else if (conn.type === 'deadend') {
        const lineGeo = new THREE.BoxGeometry(0.08, 0.01, 0.35);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.055, -0.1);
        group.add(line);

        const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 8);
        const cap = new THREE.Mesh(capGeo, lineMat);
        cap.position.set(0, 0.055, 0.3);
        group.add(cap);

        addSidewalk(group, sidewalkMat, 'east');
        addSidewalk(group, sidewalkMat, 'west');
        addSidewalk(group, sidewalkMat, 'south');
    }

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
        case 'north': curb.position.set(0, 0.06, -offset); break;
        case 'south': curb.position.set(0, 0.06, offset); break;
        case 'east':  curb.position.set(offset, 0.06, 0); break;
        case 'west':  curb.position.set(-offset, 0.06, 0); break;
    }
    group.add(curb);
}

export function buildStructureMesh(tile, type) {
    if (tile.builtStructure) {
        tile.mesh.remove(tile.builtStructure);
    }
    let group;

    if (type === 'road') {
        group = buildRoadMesh(tile);
    } else {
        group = new THREE.Group();

        if (type === 'hospital') {
            // White main building (thinner central wing)
            const bodyGeo = new THREE.BoxGeometry(0.35, 0.55, 0.6);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.set(0.1, 0.275, 0);
            body.castShadow = true;
            group.add(body);

            // Side wing (L-shape layout)
            const sideGeo = new THREE.BoxGeometry(0.45, 0.45, 0.35);
            const side = new THREE.Mesh(sideGeo, bodyMat);
            side.position.set(-0.15, 0.225, 0.125);
            side.castShadow = true;
            group.add(side);

            // Rooftop Helipad
            const heliGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
            const heliMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
            const helipad = new THREE.Mesh(heliGeo, heliMat);
            helipad.position.set(0.1, 0.56, 0);
            helipad.castShadow = true;
            group.add(helipad);

            // Helipad 'H' letter
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const hBarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.14), lineMat);
            hBarLeft.position.set(0.05, 0.575, 0);
            group.add(hBarLeft);
            const hBarRight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.14), lineMat);
            hBarRight.position.set(0.15, 0.575, 0);
            group.add(hBarRight);
            const hBarCross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 0.03), lineMat);
            hBarCross.position.set(0.1, 0.575, 0);
            group.add(hBarCross);

            // Red cross horizontal & vertical on front walls
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            crossH.position.set(-0.15, 0.3, 0.31);
            group.add(crossH);
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.02), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            crossV.position.set(-0.15, 0.3, 0.31);
            group.add(crossV);

            // Flashing Green beacon
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
            beacon.position.set(0.1, 0.65, 0);
            group.add(beacon);

            // Ambulância Estacionada
            const ambGroup = new THREE.Group();
            ambGroup.position.set(0.25, 0.06, 0.32);
            ambGroup.rotation.y = -Math.PI / 4;

            const ambBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.11), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
            ambBody.castShadow = true;
            ambGroup.add(ambBody);

            const ambCabin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.11), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
            ambCabin.position.set(0.07, 0.03, 0);
            ambGroup.add(ambCabin);

            // Flashing Blue Light on Ambulance
            const blueLight = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
 blueLight.position.set(0.02, 0.08, 0);
            ambGroup.add(blueLight);

            // Wheels
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
            const wheelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8);
            [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]].forEach(([wx, wz]) => {
                const wh = new THREE.Mesh(wheelGeo, wheelMat);
                wh.rotation.x = Math.PI / 2;
                wh.position.set(wx, -0.05, wz * 0.95);
                ambGroup.add(wh);
            });
            group.add(ambGroup);

        } else if (type === 'floresta') {
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 1.0 });
            // 4 different trees with different shapes, sizes and green colors
            const treeConfigs = [
                { x: -0.22, z: -0.2, height: 0.6, color: 0x15803d, type: 'cone' },
                { x: 0.22, z: 0.15, height: 0.45, color: 0x166534, type: 'sphere' },
                { x: -0.05, z: 0.22, height: 0.52, color: 0x064e3b, type: 'cone' },
                { x: 0.25, z: -0.18, height: 0.58, color: 0x16a34a, type: 'sphere' }
            ];

            treeConfigs.forEach(({ x: tx, z: tz, height: h, color: c, type: treeShape }) => {
                // Trunk
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h * 0.4, 6), trunkMat);
                trunk.position.set(tx, h * 0.2, tz);
                trunk.castShadow = true;
                group.add(trunk);

                // Canopy
                if (treeShape === 'cone') {
                    const leafMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
                    [0.24, 0.18, 0.12].forEach((r, li) => {
                        const canopy = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.5, 7), leafMat);
                        canopy.position.set(tx, h * 0.35 + li * h * 0.25, tz);
                        canopy.castShadow = true;
                        group.add(canopy);
                    });
                } else {
                    const leafMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
                    const canopy = new THREE.Mesh(new THREE.SphereGeometry(h * 0.35, 8, 8), leafMat);
                    canopy.position.set(tx, h * 0.5, tz);
                    canopy.castShadow = true;
                    group.add(canopy);
                }
            });

            // Add low-poly boulders/rocks on the ground
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });
            const rockGeo = new THREE.DodecahedronGeometry(0.08);
            [[-0.2, 0.22], [0.1, -0.25]].forEach(([rx, rz]) => {
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(rx, 0.04, rz);
                rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
                rock.scale.set(1, 0.6 + Math.random() * 0.5, 1);
                rock.castShadow = true;
                group.add(rock);
            });

            // Tiny cozy wooden bench
            const benchGroup = new THREE.Group();
            benchGroup.position.set(0, 0.04, 0);
            benchGroup.rotation.y = Math.PI / 4;
            const benchMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.07), benchMat);
            seat.position.set(0, 0.04, 0);
            seat.castShadow = true;
            benchGroup.add(seat);
            [[-0.09, -0.02], [0.09, -0.02], [-0.09, 0.02], [0.09, 0.02]].forEach(([bx, bz]) => {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.015), benchMat);
                leg.position.set(bx, 0.02, bz);
                benchGroup.add(leg);
            });
            group.add(benchGroup);

        } else if (type === 'usina') {
            const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.7 });
            const solarBlueMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.5 });
            const lineMat2 = new THREE.MeshBasicMaterial({ color: 0x60a5fa });

            // 1. Draw 1 Tilted Solar Panel in front right
            const px = 0.22, pz = 0.2;
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), darkMetalMat);
            leg.position.set(px, 0.08, pz);
            leg.castShadow = true;
            group.add(leg);

            const panelGroup = new THREE.Group();
            panelGroup.position.set(px, 0.14, pz);
            panelGroup.rotation.x = 0.25;
            panelGroup.rotation.y = -0.1;

            const surface = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.26), solarBlueMat);
            surface.castShadow = true;
            surface.receiveShadow = true;
            panelGroup.add(surface);

            [-0.1, 0, 0.1].forEach(gx => {
                const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.26), lineMat2);
                vLine.position.set(gx, 0.001, 0);
                panelGroup.add(vLine);
            });
            [-0.07, 0.07].forEach(gz => {
                const hLine = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.022, 0.006), lineMat2);
                hLine.position.set(0, 0.001, gz);
                panelGroup.add(hLine);
            });
            group.add(panelGroup);

            // 2. Sleek Wind Turbine (Left)
            const tx = -0.22, tz = 0.15;
            const poleMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.2 });
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.72, 8), poleMat);
            pole.position.set(tx, 0.36, tz);
            pole.castShadow = true;
            group.add(pole);

            const bladesGroup = new THREE.Group();
            bladesGroup.name = "usina_blades";
            bladesGroup.position.set(tx, 0.72, tz);
            const hub = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), poleMat);
            hub.position.set(0, 0, 0.04);
            hub.rotation.x = Math.PI / 2;
            bladesGroup.add(hub);

            const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
            for (let b = 0; b < 3; b++) {
                const bladeGroup = new THREE.Group();
                bladeGroup.rotation.z = (b * Math.PI * 2) / 3;
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.28, 0.008), bladeMat);
                blade.position.set(0, 0.14, 0.03);
                blade.castShadow = true;
                bladeGroup.add(blade);
                bladesGroup.add(bladeGroup);
            }
            group.add(bladesGroup);

            // 3. Upgrade: Concrete Cooling Tower (Back Left)
            const towerGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.35, 12);
            const towerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(-0.15, 0.175, -0.22);
            tower.castShadow = true;
            group.add(tower);

            // Fluffy white steam cloud on top of tower
            const steamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, roughness: 0.9 });
            const steam = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), steamMat);
            steam.position.set(-0.15, 0.38, -0.22);
            group.add(steam);

            // 4. Upgrade: Substation Transformer boxes (Back Right)
            const boxGeo = new THREE.BoxGeometry(0.15, 0.14, 0.15);
            const boxMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
            const transformer = new THREE.Mesh(boxGeo, boxMat);
            transformer.position.set(0.2, 0.07, -0.2);
            transformer.castShadow = true;
            group.add(transformer);

            // Red warning dot
            const warnDot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            warnDot.position.set(0.2, 0.11, -0.12);
            group.add(warnDot);

        } else if (type === 'fabrica') {
            const factMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.4 });
            // Main factory body
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.48), factMat);
            body.position.set(-0.1, 0.2, 0.05);
            body.castShadow = true;
            group.add(body);

            // Saw-tooth roof
            const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
            [-0.24, -0.06].forEach(xOff => {
                const prism = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.14, 0.45, 3, 1, false), roofMat2);
                prism.position.set(xOff, 0.44, 0.05);
                prism.rotation.x = Math.PI / 2;
                prism.rotation.y = Math.PI / 6;
                prism.castShadow = true;
                group.add(prism);
            });

            // Smokestacks
            const stackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
            const smokeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.6 });
            const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.38, 8), stackMat);
            stack.position.set(-0.25, 0.58, -0.08);
            stack.castShadow = true;
            group.add(stack);

            const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), smokeMat);
            smoke.position.set(-0.25, 0.8, -0.08);
            group.add(smoke);

            // Upgrade: Tall silver storage silo (Right side)
            const siloGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.52, 10);
            const metalMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 });
            const silo = new THREE.Mesh(siloGeo, metalMat);
            silo.position.set(0.24, 0.26, 0.15);
            silo.castShadow = true;
            group.add(silo);

            const siloCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4 }));
            siloCap.position.set(0.24, 0.57, 0.15);
            group.add(siloCap);

            // Upgrade: Pipes running along walls
            const pipeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6);
            const pipeMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });
            const pipe = new THREE.Mesh(pipeGeo, pipeMat);
            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(-0.1, 0.28, 0.3);
            group.add(pipe);

            // Upgrade: Loading bay platform and mini cargo truck
            const truckGroup = new THREE.Group();
            truckGroup.position.set(0.22, 0.06, -0.22);
            truckGroup.rotation.y = -Math.PI / 2;

            const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
            cab.position.set(0.09, 0.02, 0);
            truckGroup.add(cab);

            const container = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.09), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));
            container.position.set(-0.04, 0.03, 0);
            container.castShadow = true;
            truckGroup.add(container);

            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
            [[-0.08, -0.05], [0.06, -0.05], [-0.08, 0.05], [0.06, 0.05]].forEach(([wx, wz]) => {
                const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 8), wheelMat);
                wh.rotation.x = Math.PI / 2;
                wh.position.set(wx, -0.04, wz);
                truckGroup.add(wh);
            });
            group.add(truckGroup);

        } else if (type === 'mina') {
            // Earth mound
            const earthMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 1.0 });
            const mound = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 8), earthMat);
            mound.position.set(0, 0.175, 0.05);
            mound.castShadow = true;
            group.add(mound);

            // Wooden scaffold frame
            const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
            const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.54, 0.04), woodMat);
            bar1.position.set(-0.14, 0.27, 0.05);
            bar1.rotation.z = 0.2;
            group.add(bar1);
            const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.54, 0.04), woodMat);
            bar2.position.set(0.14, 0.27, 0.05);
            bar2.rotation.z = -0.2;
            group.add(bar2);
            const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), woodMat);
            crossbar.position.set(0, 0.52, 0.05);
            group.add(crossbar);

            // Orange warning light
            const warnLight = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
            warnLight.position.set(0, 0.6, 0.05);
            group.add(warnLight);

            // Upgrade: Dark tunnel opening plane in the earth mound
            const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
            const tunnelEntrance = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.01), tunnelMat);
            tunnelEntrance.position.set(0, 0.1, 0.38);
            group.add(tunnelEntrance);

            // Upgrade: Mine tracks leading out
            const trackMat = new THREE.MeshStandardMaterial({ color: 0x78716c, metalness: 0.7 });
            const track1 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.35), trackMat);
            track1.position.set(-0.05, 0.003, 0.32);
            group.add(track1);
            const track2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.35), trackMat);
            track2.position.set(0.05, 0.003, 0.32);
            group.add(track2);

            for (let i = 0; i < 4; i++) {
                const plank = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.025), woodMat);
                plank.position.set(0, 0.001, 0.18 + i * 0.09);
                group.add(plank);
            }

            // Upgrade: Tiny mine cart
            const cartGroup = new THREE.Group();
            cartGroup.position.set(0, 0.05, 0.35);
            const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.12), new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.8 }));
            cartBody.castShadow = true;
            cartGroup.add(cartBody);
            // Wheels
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
            [[-0.04, -0.05], [0.04, -0.05], [-0.04, 0.05], [0.04, 0.05]].forEach(([wx, wz]) => {
                const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 6), wheelMat);
                wh.rotation.x = Math.PI / 2;
                wh.position.set(wx, -0.04, wz);
                cartGroup.add(wh);
            });
            group.add(cartGroup);

            // Upgrade: Glowing crystals scattered on the side
            const crystalGeo = new THREE.OctahedronGeometry(0.04);
            const crystalColors = [0x06b6d4, 0xec4899, 0xeab308];
            [[-0.22, 0.22, 0], [0.22, 0.25, 1], [-0.25, -0.15, 2]].forEach(([cx, cz, colorIdx]) => {
                const crystMat = new THREE.MeshBasicMaterial({ color: crystalColors[colorIdx] });
                const crystal = new THREE.Mesh(crystalGeo, crystMat);
                crystal.position.set(cx, 0.05, cz);
                crystal.scale.set(1, 1.8, 1);
                crystal.castShadow = true;
                group.add(crystal);
            });

        } else if (type === 'agua') {
            const tankMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.5 });
            // Modern water tank tower (shifted to back left)
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 12), tankMat);
            tank.position.set(-0.16, 0.42, -0.16);
            tank.castShadow = true;
            group.add(tank);

            const capMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), capMat);
            cap.position.set(-0.16, 0.68, -0.16);
            cap.castShadow = true;
            group.add(cap);

            // Modern tower support legs
            const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.4 });
            [[-0.26, -0.26], [-0.06, -0.26], [-0.26, -0.06], [-0.06, -0.06]].forEach(([lx, lz]) => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), legMat);
                leg.position.set(lx, 0.16, lz);
                leg.castShadow = true;
                group.add(leg);
            });

            // Droplet indicator on modern tank
            const drop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            drop.position.set(-0.16, 0.78, -0.16);
            group.add(drop);

            // Upgrade: Cozy traditional brick water well (Front Right)
            const wellGroup = new THREE.Group();
            wellGroup.position.set(0.18, 0, 0.18);

            const brickMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.9 });
            const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10), brickMat);
            wellBase.position.set(0, 0.06, 0);
            wellBase.castShadow = true;
            wellGroup.add(wellBase);

            const wellWaterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1 });
            const waterPlane = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 8), wellWaterMat);
            waterPlane.position.set(0, 0.11, 0);
            wellGroup.add(waterPlane);

            const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
            const postL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.02), woodMat);
            postL.position.set(-0.1, 0.2, 0);
            wellGroup.add(postL);
            const postR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.02), woodMat);
            postR.position.set(0.1, 0.2, 0);
            wellGroup.add(postR);

            const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
            const wellRoof = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.22), roofMat);
            wellRoof.position.set(0, 0.34, 0);
            wellRoof.rotation.x = 0.35;
            wellGroup.add(wellRoof);

            group.add(wellGroup);

            // Upgrade: Silver pipe connecting the traditional well to the modern tank
            const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.45), legMat);
            pipe.rotation.y = -Math.PI / 4;
            pipe.position.set(0, 0.04, 0);
            group.add(pipe);

        } else if (type === 'predio') {
            const windowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

            // Overhaul: Stepped low-poly skyscraper design
            // Tower 1: Tall main core
            const buildMat1 = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.3 });
            const tower1 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.15, 0.32), buildMat1);
            tower1.position.set(-0.12, 0.575, -0.12);
            tower1.castShadow = true;
            group.add(tower1);

            // Tower 2: Medium step
            const buildMat2 = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.3 });
            const tower2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.82, 0.28), buildMat2);
            tower2.position.set(0.14, 0.41, 0.06);
            tower2.castShadow = true;
            group.add(tower2);

            // Tower 3: Low lobby base
            const buildMat3 = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.2 });
            const tower3 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.24), buildMat3);
            tower3.position.set(-0.12, 0.225, 0.22);
            tower3.castShadow = true;
            group.add(tower3);

            // Glowing yellow window boxes on towers
            // Tower 1 Windows
            for (let wy = 0; wy < 4; wy++) {
                const winZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.01), windowMat);
                winZ.position.set(-0.12, 0.22 + wy * 0.22, 0.045);
                group.add(winZ);

                const winX = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.06), windowMat);
                winX.position.set(0.045, 0.22 + wy * 0.22, -0.12);
                group.add(winX);
            }

            // Tower 2 Windows
            for (let wy = 0; wy < 3; wy++) {
                const winZ = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.01), windowMat);
                winZ.position.set(0.14, 0.18 + wy * 0.2, 0.205);
                group.add(winZ);
            }

            // Upgrade: Rooftop garden on the medium step tower (Tower 2)
            const gardenMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 });
            const garden = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.24), gardenMat);
            garden.position.set(0.14, 0.825, 0.06);
            group.add(garden);

            const shrubMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
            const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), shrubMat);
            shrub.position.set(0.14, 0.87, 0.06);
            shrub.scale.set(1.5, 1, 1);
            shrub.castShadow = true;
            group.add(shrub);

            // Antenna on tall tower (Tower 1)
            const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), buildMat1);
            antBase.position.set(-0.12, 1.17, -0.12);
            group.add(antBase);

            const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 }));
            antenna.position.set(-0.12, 1.33, -0.12);
            group.add(antenna);

            const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            antTip.position.set(-0.12, 1.49, -0.12);
            group.add(antTip);

        } else if (type === 'cinema') {
            // New: Retro Art-Deco Cinema Cozy
            const wallMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
            const facadeMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 });
            const blackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

            // Main Building Block
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.68), wallMat);
            body.position.set(0, 0.21, -0.05);
            body.castShadow = true;
            group.add(body);

            // Front Sign Facade Slab (stands tall in the center front)
            const marqueeSlab = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 0.08), facadeMat);
            marqueeSlab.position.set(0, 0.32, 0.31);
            marqueeSlab.castShadow = true;
            group.add(marqueeSlab);

            // Yellow glowing neon text billboard on the vertical slab
            const neonBulbMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
            const signMark = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.09), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
            signMark.position.set(0, 0.42, 0.31);
            group.add(signMark);

            // Neon sign glowing dot pattern
            for (let i = -1; i <= 1; i++) {
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), neonBulbMat);
                bulb.position.set(0, 0.42 + i * 0.09, 0.36);
                group.add(bulb);
            }

            // Hanging Marquee Roof over the entrance
            const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.24), blackMat);
            canopy.position.set(0, 0.22, 0.32);
            canopy.castShadow = true;
            group.add(canopy);

            // Tiny yellow marquee light bulbs around the bottom edge of canopy
            [[-0.22, 0.41], [0.22, 0.41], [0, 0.42]].forEach(([bx, bz]) => {
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 5), neonBulbMat);
                bulb.position.set(bx, 0.19, bz);
                group.add(bulb);
            });

            // Red Carpet leading into the cinema
            const carpet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.005, 0.28), new THREE.MeshBasicMaterial({ color: 0xbe123c }));
            carpet.position.set(0, 0.002, 0.36);
            group.add(carpet);

            // Side wall poster billboards
            const posterMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
            const posterBorder = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16, 0.12), blackMat);
            posterBorder.position.set(0.345, 0.22, -0.05);
            group.add(posterBorder);

            const poster = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.09), posterMat);
            poster.position.set(0.346, 0.22, -0.05);
            group.add(poster);
        } else if (type === 'mountain') {
            // Low-poly Mountain Peak
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
            const mountainBase = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 5), rockMat);
            mountainBase.position.set(0, 0.275, 0);
            mountainBase.castShadow = true;
            group.add(mountainBase);
            
            // Snowy peak cap
            const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
            const snowCap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 5), snowMat);
            snowCap.position.set(0, 0.44, 0);
            snowCap.castShadow = true;
            group.add(snowCap);
        }
    }

    group.position.set(0, 0.1, 0);
    tile.mesh.add(group);
    tile.builtStructure = group;
}

// --- Pathfinder & Spawner for Cars ---
function getAdjacentRoadTile(x, z) {
    const directions = [[0, -1], [0, 1], [1, 0], [-1, 0]];
    for (const [dx, dz] of directions) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
            const tile = tiles[nx][nz];
            if (tile && tile.type === 'road') {
                return tile;
            }
        }
    }
    return null;
}

export function getRoadConnectedStructures() {
    const list = [];
    const structureTypes = ['hospital', 'floresta', 'cinema', 'mina', 'fabrica', 'usina', 'agua', 'predio'];
    for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
            const tile = tiles[x][z];
            if (tile && structureTypes.includes(tile.type)) {
                const roadTile = getAdjacentRoadTile(x, z);
                if (roadTile) {
                    list.push({ structure: tile, road: roadTile });
                }
            }
        }
    }
    return list;
}

export function findRoadPath(startX, startZ, endX, endZ) {
    // Simple BFS on road network
    const queue = [[startX, startZ, []]];
    const visited = new Set();
    visited.add(`${startX},${startZ}`);
    
    while (queue.length > 0) {
        const [cx, cz, path] = queue.shift();
        const currentPath = [...path, { x: cx, z: cz }];
        
        if (cx === endX && cz === endZ) {
            return currentPath;
        }
        
        const directions = [[0, -1], [0, 1], [1, 0], [-1, 0]];
        for (const [dx, dz] of directions) {
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
                const tile = tiles[nx][nz];
                if (tile && tile.type === 'road') {
                    const key = `${nx},${nz}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push([nx, nz, currentPath]);
                    }
                }
            }
        }
    }
    return null;
}

export function createCarMesh() {
    const group = new THREE.Group();
    const carColors = [0xf43f5e, 0x06b6d4, 0x10b981, 0xf59e0b, 0x8b5cf6];
    const bodyColor = carColors[Math.floor(Math.random() * carColors.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.1 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    
    // Chassis Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.22), bodyMat);
    body.position.set(0, 0.05, 0);
    body.castShadow = true;
    group.add(body);
    
    // Cabin Top
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.11), bodyMat);
    cabin.position.set(0, 0.09, -0.02);
    cabin.castShadow = true;
    group.add(cabin);
    
    // Glass Windows
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.035, 0.09), windowMat);
    glass.position.set(0, 0.09, -0.02);
    group.add(glass);
    
    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    
    [
        [-0.065, 0.02, 0.07],
        [0.065, 0.02, 0.07],
        [-0.065, 0.02, -0.07],
        [0.065, 0.02, -0.07]
    ].forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(wx, wy, wz);
        wheel.castShadow = true;
        group.add(wheel);
    });
    
    return group;
}

export function getSmoothPathPoints(path) {
    if (!path || path.length < 2) return [];
    
    const points = [];
    const offset = 0.18; // Lane offset to the right of the direction of travel
    
    // Convert tile coords to Vector3 objects (using y = 0 initially)
    const T = path.map(node => new THREE.Vector3(node.x, 0, node.z));
    const n = T.length;
    
    // Precompute directions and right vectors for each segment
    const dirs = [];
    const rights = [];
    for (let k = 0; k < n - 1; k++) {
        const d = new THREE.Vector3().subVectors(T[k+1], T[k]).normalize();
        dirs.push(d);
        const r = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(offset);
        rights.push(r);
    }
    
    // Add start point
    points.push(new THREE.Vector3().addVectors(T[0], rights[0]));
    
    for (let k = 1; k < n - 1; k++) {
        const d_prev = dirs[k-1];
        const d_next = dirs[k];
        const r_prev = rights[k-1];
        const r_next = rights[k];
        
        // Check if there is a turn (direction changes)
        const dot = d_prev.dot(d_next);
        if (Math.abs(dot) < 0.9) {
            // It's a turn! Generate quadratic Bezier curve
            // Entry point to turn
            const p0 = new THREE.Vector3().addVectors(T[k], r_prev).addScaledVector(d_prev, -0.35);
            // Control point of turn
            const p1 = new THREE.Vector3().addVectors(T[k], r_prev).add(r_next);
            // Exit point from turn
            const p2 = new THREE.Vector3().addVectors(T[k], r_next).addScaledVector(d_next, 0.35);
            
            // Add entry point to the smooth path
            points.push(p0);
            
            // Sample quadratic Bezier curve for a smooth round turn
            const samples = 6;
            for (let s = 1; s <= samples; s++) {
                const t = s / samples;
                const oneMinusT = 1 - t;
                const pt = new THREE.Vector3()
                    .addScaledVector(p0, oneMinusT * oneMinusT)
                    .addScaledVector(p1, 2 * oneMinusT * t)
                    .addScaledVector(p2, t * t);
                points.push(pt);
            }
        } else {
            // Going straight: just add the offset point at T[k]
            points.push(new THREE.Vector3().addVectors(T[k], r_prev));
        }
    }
    
    // Add end point
    points.push(new THREE.Vector3().addVectors(T[n-1], rights[n-2]));
    
    return points;
}

export function updateCarSpawning() {
    if (!scene) return;
    
    try {
        if (!window.activeCars) {
            window.activeCars = [];
        }
        
        if (window.activeCars.length >= 6) return; // Cap at 6 cars
        
        const structs = getRoadConnectedStructures();
        if (structs.length < 2) return;
        
        const i = Math.floor(Math.random() * structs.length);
        let j = Math.floor(Math.random() * structs.length);
        while (i === j && structs.length > 1) {
            j = Math.floor(Math.random() * structs.length);
        }
        if (i === j) return;
        
        const startStruct = structs[i];
        const endStruct = structs[j];
        
        const path = findRoadPath(startStruct.road.x, startStruct.road.z, endStruct.road.x, endStruct.road.z);
        if (path && path.length >= 2) {
            const smoothPath = getSmoothPathPoints(path);
            if (smoothPath && smoothPath.length >= 2) {
                const carMesh = createCarMesh();
                const p0 = smoothPath[0];
                const p1 = smoothPath[1];
                
                const startTile = tiles[Math.round(p0.x)]?.[Math.round(p0.z)];
                const startY = startTile ? startTile.mesh.position.y + 0.12 : 0.12;
                
                carMesh.position.set(p0.x * TILE_SPACING, startY, p0.z * TILE_SPACING);
                carMesh.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
                scene.add(carMesh);
                
                window.activeCars.push({
                    mesh: carMesh,
                    path: smoothPath,
                    originalPath: path,
                    currentIndex: 0,
                    progress: 0.0,
                    speed: 0.03 + Math.random() * 0.015
                });
            }
        }
    } catch (err) {
        console.error("Error in updateCarSpawning:", err);
        showToast("Erro ao spawnar carro: " + err.message, "danger");
    }
}

export function createFurryMesh() {
    const group = new THREE.Group();
    
    // Randomize species/fur color
    const furColors = [0xf97316, 0xe2e8f0, 0xfbb6ce, 0xfcd34d, 0xa78bfa];
    const furColor = furColors[Math.floor(Math.random() * furColors.length)];
    const furMat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.8 });
    
    // Randomize outfit color (revealing/lewd style: hot pink, black, purple)
    const outfitColors = [0xff4f7b, 0x1e1b4b, 0x9333ea, 0x06b6d4, 0x10b981];
    const outfitColor = outfitColors[Math.floor(Math.random() * outfitColors.length)];
    const outfitMat = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.5 });
    
    // 1. Curvy Hips
    const hipsGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const hips = new THREE.Mesh(hipsGeo, furMat);
    hips.scale.set(1.25, 0.9, 1.25); // extra curvy/wide hips
    hips.position.set(0, 0.08, 0);
    hips.castShadow = true;
    group.add(hips);
    
    // Revealing outfit bottom (belt/shorts)
    const shortsGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8);
    const shorts = new THREE.Mesh(shortsGeo, outfitMat);
    shorts.position.set(0, 0.09, 0);
    shorts.scale.set(1.26, 1.0, 1.26);
    group.add(shorts);

    // 2. Slender Waist
    const waistGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.06, 8);
    const waist = new THREE.Mesh(waistGeo, furMat);
    waist.position.set(0, 0.14, 0);
    waist.castShadow = true;
    group.add(waist);

    // Revealing top (crop top)
    const topGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.035, 8);
    const cropTop = new THREE.Mesh(topGeo, outfitMat);
    cropTop.position.set(0, 0.18, 0);
    group.add(cropTop);

    // 3. Curvy Chest (Busty / Curvy representation)
    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.19, 0.02);
    const breastGeo = new THREE.SphereGeometry(0.032, 6, 6);
    const leftBreast = new THREE.Mesh(breastGeo, furMat);
    leftBreast.position.set(-0.03, 0, 0.02);
    leftBreast.scale.set(1.0, 1.0, 1.3);
    chestGroup.add(leftBreast);
    const rightBreast = new THREE.Mesh(breastGeo, furMat);
    rightBreast.position.set(0.03, 0, 0.02);
    rightBreast.scale.set(1.0, 1.0, 1.3);
    chestGroup.add(rightBreast);
    group.add(chestGroup);

    // 4. Head
    const headGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const head = new THREE.Mesh(headGeo, furMat);
    head.position.set(0, 0.26, 0);
    head.castShadow = true;
    group.add(head);

    // Cute animal ears (Cones) - Fox or Bunny style
    const earGeo = new THREE.ConeGeometry(0.018, 0.055, 4);
    const leftEar = new THREE.Mesh(earGeo, furMat);
    leftEar.position.set(-0.035, 0.32, -0.01);
    leftEar.rotation.set(0.1, 0, 0.25);
    leftEar.castShadow = true;
    group.add(leftEar);
    
    const rightEar = new THREE.Mesh(earGeo, furMat);
    rightEar.position.set(0.035, 0.32, -0.01);
    rightEar.rotation.set(0.1, 0, -0.25);
    rightEar.castShadow = true;
    group.add(rightEar);

    // 5. Fluffy animal tail
    const tailGeo = new THREE.ConeGeometry(0.03, 0.12, 6);
    const tail = new THREE.Mesh(tailGeo, furMat);
    tail.position.set(0, 0.09, -0.08);
    tail.rotation.set(-Math.PI / 3, 0, 0);
    tail.castShadow = true;
    group.add(tail);

    return group;
}

export function getSidewalkPathPoints(path, offsetLeft = false) {
    if (!path || path.length < 2) return [];
    
    const points = [];
    const offset = offsetLeft ? -0.42 : 0.42; // Sidewalk lane offset
    
    // Convert tile coords to Vector3 objects (using y = 0 initially)
    const T = path.map(node => new THREE.Vector3(node.x, 0, node.z));
    const n = T.length;
    
    // Precompute directions and right vectors for each segment
    const dirs = [];
    const rights = [];
    for (let k = 0; k < n - 1; k++) {
        const d = new THREE.Vector3().subVectors(T[k+1], T[k]).normalize();
        dirs.push(d);
        const r = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(offset);
        rights.push(r);
    }
    
    // Add start point
    points.push(new THREE.Vector3().addVectors(T[0], rights[0]));
    
    for (let k = 1; k < n - 1; k++) {
        const d_prev = dirs[k-1];
        const d_next = dirs[k];
        const r_prev = rights[k-1];
        const r_next = rights[k];
        
        // Check if there is a turn (direction changes)
        const dot = d_prev.dot(d_next);
        if (Math.abs(dot) < 0.9) {
            // It's a turn! Generate quadratic Bezier curve
            // Entry point to turn
            const p0 = new THREE.Vector3().addVectors(T[k], r_prev).addScaledVector(d_prev, -0.35);
            // Control point of turn
            const p1 = new THREE.Vector3().addVectors(T[k], r_prev).add(r_next);
            // Exit point from turn
            const p2 = new THREE.Vector3().addVectors(T[k], r_next).addScaledVector(d_next, 0.35);
            
            // Add entry point to the smooth path
            points.push(p0);
            
            // Sample quadratic Bezier curve for a smooth round turn
            const samples = 6;
            for (let s = 1; s <= samples; s++) {
                const t = s / samples;
                const oneMinusT = 1 - t;
                const pt = new THREE.Vector3()
                    .addScaledVector(p0, oneMinusT * oneMinusT)
                    .addScaledVector(p1, 2 * oneMinusT * t)
                    .addScaledVector(p2, t * t);
                points.push(pt);
            }
        } else {
            // Going straight: just add the offset point at T[k]
            points.push(new THREE.Vector3().addVectors(T[k], r_prev));
        }
    }
    
    // Add end point
    points.push(new THREE.Vector3().addVectors(T[n-1], rights[n-2]));
    
    return points;
}

export function updateFurrySpawning() {
    if (!scene) return;
    
    try {
        if (!window.activeFurries) {
            window.activeFurries = [];
        }
        
        if (window.activeFurries.length >= 10) return; // Cap at 10 citizens
        
        const structs = getRoadConnectedStructures();
        if (structs.length < 2) return;
        
        const i = Math.floor(Math.random() * structs.length);
        let j = Math.floor(Math.random() * structs.length);
        while (i === j && structs.length > 1) {
            j = Math.floor(Math.random() * structs.length);
        }
        if (i === j) return;
        
        const startStruct = structs[i];
        const endStruct = structs[j];
        
        const path = findRoadPath(startStruct.road.x, startStruct.road.z, endStruct.road.x, endStruct.road.z);
        if (path && path.length >= 2) {
            const offsetLeft = Math.random() < 0.5;
            const sidewalkPath = getSidewalkPathPoints(path, offsetLeft);
            if (sidewalkPath && sidewalkPath.length >= 2) {
                const furryMesh = createFurryMesh();
                const p0 = sidewalkPath[0];
                const p1 = sidewalkPath[1];
                
                const startTile = tiles[Math.round(p0.x)]?.[Math.round(p0.z)];
                const startY = startTile ? startTile.mesh.position.y + 0.1 : 0.1;
                
                furryMesh.position.set(p0.x * TILE_SPACING, startY, p0.z * TILE_SPACING);
                furryMesh.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
                scene.add(furryMesh);
                
                window.activeFurries.push({
                    mesh: furryMesh,
                    path: sidewalkPath,
                    originalPath: path,
                    currentIndex: 0,
                    progress: 0.0,
                    speed: 0.006 + Math.random() * 0.005, // Walking speed
                    bobSeed: Math.random() * 100
                });
            }
        }
    } catch (err) {
        console.error("Error in updateFurrySpawning:", err);
    }
}

