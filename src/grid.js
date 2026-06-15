import * as THREE from 'three';
import { state, BUILD_CONFIGS, updateHUD, showToast } from './state.js';
import { scene, GRID_SIZE, TILE_SPACING } from './scene.js';

export const tiles = [];
export let flatTiles = [];


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
                    body.rotation.x = Math.PI / 2; 
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

    
    const baseGeo = new THREE.BoxGeometry(GRID_SIZE * TILE_SPACING + 1.0, 0.4, GRID_SIZE * TILE_SPACING + 1.0);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9, metalness: 0.1 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(centerOffset - 0.5, -0.4, centerOffset - 0.5);
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);

    
    flatTiles.push(...tiles.flatMap(row => row));
}


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
    
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.22), bodyMat);
    body.position.set(0, 0.05, 0);
    body.castShadow = true;
    group.add(body);
    
    
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.11), bodyMat);
    cabin.position.set(0, 0.09, -0.02);
    cabin.castShadow = true;
    group.add(cabin);
    
    
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.035, 0.09), windowMat);
    glass.position.set(0, 0.09, -0.02);
    group.add(glass);
    
    
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
            
            points.push(new THREE.Vector3().addVectors(T[k], r_prev));
        }
    }
    
    
    points.push(new THREE.Vector3().addVectors(T[n-1], rights[n-2]));
    
    return points;
}

export function updateCarSpawning() {
    if (!scene) return;
    
    try {
        if (!window.activeCars) {
            window.activeCars = [];
        }
        
        if (window.activeCars.length >= 6) return; 
        
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
    
    
    const genders = ['female', 'male'];
    const gender = genders[Math.floor(Math.random() * genders.length)];
    
    
    const speciesList = ['coelho', 'onca', 'macaca', 'jacare', 'arara', 'capivara'];
    const species = speciesList[Math.floor(Math.random() * speciesList.length)];
    
    
    let variant = 'default';
    if (species === 'onca') {
        const oncaVariants = ['onca_pintada', 'pantera_preta', 'pantera_rosa', 'tigre', 'leoa'];
        variant = oncaVariants[Math.floor(Math.random() * oncaVariants.length)];
    } else if (species === 'macaca') {
        variant = 'macaco';
    } else if (species === 'coelho') {
        const coelhoColors = ['branco', 'cinza', 'marrom', 'malhado'];
        variant = coelhoColors[Math.floor(Math.random() * coelhoColors.length)];
    } else if (species === 'jacare') {
        variant = Math.random() < 0.5 ? 'jacare_verde' : 'jacare_papo_amarelo';
    }
    
    
    let furColor = 0x78350f;
    let bellyColor = 0xfef9c3;
    let eyeColor = 0x111111; 
    
    if (species === 'coelho') {
        if (variant === 'branco') {
            furColor = 0xffffff;
            bellyColor = 0xfff7ed;
            eyeColor = 0xef4444; 
        } else if (variant === 'cinza') {
            furColor = 0x94a3b8;
            bellyColor = 0xe2e8f0;
            eyeColor = 0x1e293b;
        } else if (variant === 'marrom') {
            furColor = 0x854d0e;
            bellyColor = 0xfef08a;
            eyeColor = 0x27272a;
        } else if (variant === 'malhado') {
            furColor = 0xffffff;
            bellyColor = 0xfff7ed;
            eyeColor = 0x1e293b;
        }
    } else if (species === 'onca') {
        if (variant === 'onca_pintada') {
            furColor = 0xf59e0b; 
            bellyColor = 0xfef08a;
            eyeColor = 0xd97706; 
        } else if (variant === 'pantera_preta') {
            furColor = 0x0f172a; 
            bellyColor = 0x1e293b;
            eyeColor = 0xfacc15; 
        } else if (variant === 'pantera_rosa') {
            furColor = 0xfb7185; 
            bellyColor = 0xffe4e6;
            eyeColor = 0x06b6d4; 
        } else if (variant === 'tigre') {
            furColor = 0xea580c; 
            bellyColor = 0xffffff;
            eyeColor = 0xd97706; 
        } else if (variant === 'leoa') {
            furColor = 0xddc397; 
            bellyColor = 0xfef3c7; 
            eyeColor = 0x854d0e; 
        }
    } else if (species === 'macaca') {
        furColor = 0x78350f; 
        bellyColor = 0xfef9c3;
        eyeColor = 0x111111;
    } else if (species === 'jacare') {
        if (variant === 'jacare_verde') {
            furColor = 0x166534; 
            bellyColor = 0xa3e635; 
            eyeColor = 0x84cc16; 
        } else {
            furColor = 0x3f6212; 
            bellyColor = 0xfacc15; 
            eyeColor = 0xeab308; 
        }
    } else if (species === 'arara') {
        const macawColors = [0x0284c7, 0xdc2626, 0x16a34a]; 
        furColor = macawColors[Math.floor(Math.random() * macawColors.length)];
        bellyColor = 0xfacc15; 
        eyeColor = 0x111111;
    } else if (species === 'capivara') {
        furColor = 0x5c4033; 
        bellyColor = 0xd97706; 
        eyeColor = 0x1c1917;
    }
    
    
    const furMat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.7, metalness: 0.05, flatShading: true });
    const bellyMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.7, flatShading: true });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.8, flatShading: true }); 
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    
    
    function addSpot(parent, x, y, z, rx = 0, ry = 0, rz = 0, size = 0.016, color = 0x111111) {
        const spotMat = new THREE.MeshBasicMaterial({ color: color });
        const spotGeo = new THREE.BoxGeometry(size, size, 0.002);
        const spot = new THREE.Mesh(spotGeo, spotMat);
        spot.position.set(x, y, z);
        spot.rotation.set(rx, ry, rz);
        parent.add(spot);
    }
    
    function addStripe(parent, x, y, z, w, h, rx = 0, ry = 0, rz = 0, color = 0x111111) {
        const stripeMat = new THREE.MeshBasicMaterial({ color: color });
        const stripeGeo = new THREE.BoxGeometry(w, h, 0.002);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(x, y, z);
        stripe.rotation.set(rx, ry, rz);
        parent.add(stripe);
    }

    
    function addSphereSpot(parent, radius, theta, phi, size = 0.016, spotColor = 0x111111) {
        const spotMat = new THREE.MeshBasicMaterial({ color: spotColor });
        const spotGeo = new THREE.BoxGeometry(size, size, 0.0035); 
        const spot = new THREE.Mesh(spotGeo, spotMat);
        
        const x = radius * Math.cos(phi) * Math.sin(theta);
        const y = radius * Math.sin(phi);
        const z = radius * Math.cos(phi) * Math.cos(theta);
        spot.position.set(x, y, z);
        spot.rotation.set(-phi, theta, 0);
        parent.add(spot);
    }

    function addSphereRosette(parent, radius, theta, phi, size = 0.018, spotColor = 0x111111, centerColor = 0xd97706) {
        const rosetteGroup = new THREE.Group();
        
        const x = radius * Math.cos(phi) * Math.sin(theta);
        const y = radius * Math.sin(phi);
        const z = radius * Math.cos(phi) * Math.cos(theta);
        rosetteGroup.position.set(x, y, z);
        rosetteGroup.rotation.set(-phi, theta, 0);
        
        const spotMat = new THREE.MeshBasicMaterial({ color: spotColor });
        const spotGeo = new THREE.BoxGeometry(size, size, 0.0035);
        const blackMesh = new THREE.Mesh(spotGeo, spotMat);
        rosetteGroup.add(blackMesh);
        
        const amberMat = new THREE.MeshBasicMaterial({ color: centerColor });
        const amberGeo = new THREE.BoxGeometry(size * 0.65, size * 0.65, 0.004);
        const amberMesh = new THREE.Mesh(amberGeo, amberMat);
        amberMesh.position.set(0, 0, 0.0008);
        rosetteGroup.add(amberMesh);
        
        parent.add(rosetteGroup);
    }

    function addSphereStripe(parent, radius, theta, phi, w, h, color = 0x111111) {
        const stripeMat = new THREE.MeshBasicMaterial({ color: color });
        const stripeGeo = new THREE.BoxGeometry(w, h, 0.0035);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        
        const x = radius * Math.cos(phi) * Math.sin(theta);
        const y = radius * Math.sin(phi);
        const z = radius * Math.cos(phi) * Math.cos(theta);
        stripe.position.set(x, y, z);
        stripe.rotation.set(-phi, theta, 0);
        parent.add(stripe);
    }

    function addCylinderStripe(parent, radius, y, theta, w, h, color = 0x111111) {
        const stripeMat = new THREE.MeshBasicMaterial({ color: color });
        const stripeGeo = new THREE.BoxGeometry(w, h, 0.0035);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        
        const x = radius * Math.sin(theta);
        const z = radius * Math.cos(theta);
        stripe.position.set(x, y, z);
        stripe.rotation.set(0, theta, 0);
        parent.add(stripe);
    }

    function addRidge(parent, x, y, z, rx = 0.3) {
        const ridgeColor = (variant === 'jacare_verde') ? 0x064e3b : 0x14532d;
        const ridgeMat = new THREE.MeshStandardMaterial({ color: ridgeColor, roughness: 0.8, flatShading: true });
        const ridgeGeo = new THREE.ConeGeometry(0.015, 0.02, 4);
        ridgeGeo.rotateX(Math.PI / 2); // point up/back
        const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
        ridge.position.set(x, y, z);
        ridge.rotation.x = rx;
        parent.add(ridge);
    }
    
    
    
    
    
    
    const thighHeight = 0.07;
    const calfHeight = 0.07;
    const jointGeo = new THREE.SphereGeometry(0.016, 5, 5);
    
    
    const leftThighGeo = new THREE.CylinderGeometry(0.022, 0.018, thighHeight, 6);
    leftThighGeo.translate(0, -thighHeight / 2, 0); // pivot at hip joint Y = 0
    const leftLeg = new THREE.Mesh(leftThighGeo, furMat);
    leftLeg.name = "leftLeg";
    leftLeg.position.set(-0.03, 0.14, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    
    // Left Knee joint sphere
    const leftKnee = new THREE.Mesh(jointGeo, furMat);
    leftKnee.position.set(0, -thighHeight, 0);
    leftLeg.add(leftKnee);
    
    // Left Lower Leg (Calf)
    const leftCalfGeo = new THREE.CylinderGeometry(0.018, 0.014, calfHeight, 6);
    leftCalfGeo.translate(0, -calfHeight / 2, 0); 
    const leftLowerLeg = new THREE.Mesh(leftCalfGeo, furMat);
    leftLowerLeg.name = "leftLowerLeg";
    leftLowerLeg.position.set(0, -thighHeight, 0);
    leftLowerLeg.castShadow = true;
    leftLeg.add(leftLowerLeg);
    
    
    const leftAnkle = new THREE.Mesh(jointGeo, furMat);
    leftAnkle.position.set(0, -calfHeight, 0);
    leftLowerLeg.add(leftAnkle);
    
    
    const footGeo = new THREE.BoxGeometry(0.024, 0.012, 0.045);
    footGeo.translate(0, -0.006, 0.012); 
    const leftFoot = new THREE.Mesh(footGeo, furMat);
    leftFoot.name = "leftFoot";
    leftFoot.position.set(0, -calfHeight, 0);
    leftFoot.castShadow = true;
    leftLowerLeg.add(leftFoot);
    
    
    const rightThighGeo = new THREE.CylinderGeometry(0.022, 0.018, thighHeight, 6);
    rightThighGeo.translate(0, -thighHeight / 2, 0); // pivot at hip joint Y = 0
    const rightLeg = new THREE.Mesh(rightThighGeo, furMat);
    rightLeg.name = "rightLeg";
    rightLeg.position.set(0.03, 0.14, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    
    // Right Knee joint sphere
    const rightKnee = new THREE.Mesh(jointGeo, furMat);
    rightKnee.position.set(0, -thighHeight, 0);
    rightLeg.add(rightKnee);
    
    // Right Lower Leg (Calf)
    const rightCalfGeo = new THREE.CylinderGeometry(0.018, 0.014, calfHeight, 6);
    rightCalfGeo.translate(0, -calfHeight / 2, 0); 
    const rightLowerLeg = new THREE.Mesh(rightCalfGeo, furMat);
    rightLowerLeg.name = "rightLowerLeg";
    rightLowerLeg.position.set(0, -thighHeight, 0);
    rightLowerLeg.castShadow = true;
    rightLeg.add(rightLowerLeg);
    
    
    const rightAnkle = new THREE.Mesh(jointGeo, furMat);
    rightAnkle.position.set(0, -calfHeight, 0);
    rightLowerLeg.add(rightAnkle);
    
    
    const rightFoot = new THREE.Mesh(footGeo, furMat);
    rightFoot.name = "rightFoot";
    rightFoot.position.set(0, -calfHeight, 0);
    rightFoot.castShadow = true;
    rightLowerLeg.add(rightFoot);
    
    
    const hipsGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const hips = new THREE.Mesh(hipsGeo, furMat);
    hips.castShadow = true;
    hips.receiveShadow = true;
    hips.position.set(0, 0.14, 0);
    hips.scale.set(1.12, 0.9, 1.12); 
    group.add(hips);
    
    
    const waistGeo = new THREE.CylinderGeometry(0.042, 0.048, 0.08, 8);
    const waist = new THREE.Mesh(waistGeo, furMat);
    waist.castShadow = true;
    waist.receiveShadow = true;
    waist.position.set(0, 0.18, 0);
    group.add(waist);
    
    
    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.22, 0);
    
    const chestGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const chestMesh = new THREE.Mesh(chestGeo, furMat);
    chestMesh.scale.set(1.0, 0.85, 0.95); 
    chestGroup.add(chestMesh);
    group.add(chestGroup);
    
    
    if (bellyColor !== null) {
        const bellyMatDynamic = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.7, flatShading: true });
        const bellyGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const belly = new THREE.Mesh(bellyGeo, bellyMatDynamic);
        belly.scale.set(1.0, 1.3, 0.35);
        belly.position.set(0, -0.04, 0.048);
        chestGroup.add(belly);
    }
    
    
    if (species === 'arara') {
        
        function createMacawWing(isLeft, mainColor) {
            const wingGroup = new THREE.Group();
            wingGroup.name = isLeft ? "leftArm" : "rightArm";
            wingGroup.position.set(isLeft ? -0.06 : 0.06, 0.23, 0);
            wingGroup.rotation.z = isLeft ? 0.2 : -0.2;
            
            
            const wingGeo1 = new THREE.BoxGeometry(0.014, 0.12, 0.05);
            wingGeo1.translate(0, -0.06, 0.015);
            const w1 = new THREE.Mesh(wingGeo1, furMat);
            w1.castShadow = true;
            wingGroup.add(w1);
            
            
            let featherColor2 = 0xfacc15; 
            if (mainColor === 0x0284c7) featherColor2 = 0xfacc15; 
            else if (mainColor === 0xdc2626) featherColor2 = 0x0284c7; 
            else if (mainColor === 0x16a34a) featherColor2 = 0xdc2626; 
            
            const featherMat2 = new THREE.MeshStandardMaterial({ color: featherColor2, roughness: 0.7, flatShading: true });
            const wingGeo2 = new THREE.BoxGeometry(0.012, 0.09, 0.04);
            wingGeo2.translate(0, -0.045, 0.005);
            const w2 = new THREE.Mesh(wingGeo2, featherMat2);
            w2.position.set(isLeft ? -0.006 : 0.006, -0.025, 0.005);
            w2.rotation.y = isLeft ? 0.15 : -0.15;
            wingGroup.add(w2);
            
            
            let featherColor3 = 0x16a34a; 
            if (mainColor === 0x0284c7) featherColor3 = 0x16a34a;
            else if (mainColor === 0xdc2626) featherColor3 = 0xfacc15;
            else if (mainColor === 0x16a34a) featherColor3 = 0xfacc15;
            
            const featherMat3 = new THREE.MeshStandardMaterial({ color: featherColor3, roughness: 0.7, flatShading: true });
            const wingGeo3 = new THREE.BoxGeometry(0.01, 0.06, 0.03);
            wingGeo3.translate(0, -0.03, 0.002);
            const w3 = new THREE.Mesh(wingGeo3, featherMat3);
            w3.position.set(isLeft ? -0.01 : 0.01, -0.045, 0.002);
            w3.rotation.y = isLeft ? 0.3 : -0.3;
            wingGroup.add(w3);
            
            return wingGroup;
        }
        
        const leftArm = createMacawWing(true, furColor);
        group.add(leftArm);
        const rightArm = createMacawWing(false, furColor);
        group.add(rightArm);
    } else {
        
        const armSegmentHeight = 0.06;
        
        
        const leftArmUpperGeo = new THREE.CylinderGeometry(0.016, 0.013, armSegmentHeight, 6);
        leftArmUpperGeo.translate(0, -armSegmentHeight / 2, 0); // pivot at shoulder Y = 0
        const leftArm = new THREE.Mesh(leftArmUpperGeo, furMat);
        leftArm.name = "leftArm";
        leftArm.position.set(-0.055, 0.23, 0);
        leftArm.rotation.z = 0.1;
        leftArm.castShadow = true;
        group.add(leftArm);
        
        // Left Elbow joint sphere
        const leftElbow = new THREE.Mesh(jointGeo, furMat);
        leftElbow.position.set(0, -armSegmentHeight, 0);
        leftArm.add(leftElbow);
        
        // Left Forearm
        const leftForearmGeo = new THREE.CylinderGeometry(0.013, 0.011, armSegmentHeight, 6);
        leftForearmGeo.translate(0, -armSegmentHeight / 2, 0); 
        const leftLowerArm = new THREE.Mesh(leftForearmGeo, furMat);
        leftLowerArm.name = "leftLowerArm";
        leftLowerArm.position.set(0, -armSegmentHeight, 0);
        leftLowerArm.castShadow = true;
        leftArm.add(leftLowerArm);
        
        
        const pawGeo = new THREE.BoxGeometry(0.018, 0.012, 0.025);
        pawGeo.translate(0, -0.006, 0.006);
        const leftPaw = new THREE.Mesh(pawGeo, furMat);
        leftPaw.name = "leftPaw";
        leftPaw.position.set(0, -armSegmentHeight, 0);
        leftLowerArm.add(leftPaw);
        
        
        const rightArmUpperGeo = new THREE.CylinderGeometry(0.016, 0.013, armSegmentHeight, 6);
        rightArmUpperGeo.translate(0, -armSegmentHeight / 2, 0); // pivot Y = 0
        const rightArm = new THREE.Mesh(rightArmUpperGeo, furMat);
        rightArm.name = "rightArm";
        rightArm.position.set(0.055, 0.23, 0);
        rightArm.rotation.z = -0.1;
        rightArm.castShadow = true;
        group.add(rightArm);
        
        // Right Elbow joint sphere
        const rightElbow = new THREE.Mesh(jointGeo, furMat);
        rightElbow.position.set(0, -armSegmentHeight, 0);
        rightArm.add(rightElbow);
        
        // Right Forearm
        const rightForearmGeo = new THREE.CylinderGeometry(0.013, 0.011, armSegmentHeight, 6);
        rightForearmGeo.translate(0, -armSegmentHeight / 2, 0);
        const rightLowerArm = new THREE.Mesh(rightForearmGeo, furMat);
        rightLowerArm.name = "rightLowerArm";
        rightLowerArm.position.set(0, -armSegmentHeight, 0);
        rightLowerArm.castShadow = true;
        rightArm.add(rightLowerArm);
        
        
        const rightPaw = new THREE.Mesh(pawGeo, furMat);
        rightPaw.name = "rightPaw";
        rightPaw.position.set(0, -armSegmentHeight, 0);
        rightLowerArm.add(rightPaw);
    }
    
    
    const neckGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.03, 6);
    const neck = new THREE.Mesh(neckGeo, furMat);
    neck.position.set(0, 0.27, 0);
    group.add(neck);
    
    const headGeo = new THREE.SphereGeometry(0.072, 8, 8);
    const head = new THREE.Mesh(headGeo, furMat);
    head.position.set(0, 0.31, 0);
    head.name = "head";
    head.castShadow = true;
    group.add(head);
    
    
    const eyeWhiteGeo = new THREE.SphereGeometry(0.016, 8, 8);
    const eyeIrisGeo = new THREE.SphereGeometry(0.012, 6, 6);
    const eyePupilGeo = new THREE.SphereGeometry(0.008, 6, 6);
    const eyeHighlightGeo = new THREE.SphereGeometry(0.0035, 4, 4);
    
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: (species === 'jacare') ? 0xeab308 : 0xffffff, roughness: 0.2, flatShading: true });
    const eyeIrisMat = new THREE.MeshStandardMaterial({ color: eyeColor, roughness: 0.4, flatShading: true });
    
    let pupilMatColor = 0x09090b; 
    if (species === 'onca' && variant === 'pantera_preta') pupilMatColor = 0xfacc15; 
    else if (species === 'onca' && variant === 'pantera_rosa') pupilMatColor = 0x06b6d4; 
    else if (species === 'coelho' && variant === 'branco') pupilMatColor = 0xfc2525; 
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: pupilMatColor });
    const eyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    
    const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.024, 0.01, 0.052);
    leftEyeWhite.scale.set(1.0, 1.0, 0.5);
    head.add(leftEyeWhite);
    
    const leftEyeIris = new THREE.Mesh(eyeIrisGeo, eyeIrisMat);
    leftEyeIris.position.set(-0.024, 0.01, 0.056);
    leftEyeIris.scale.set(1.0, 1.0, 0.3);
    head.add(leftEyeIris);
    
    const leftEyePupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    leftEyePupil.position.set(-0.024, 0.01, 0.059);
    if (species === 'jacare') {
        leftEyePupil.scale.set(0.3, 1.0, 0.35); 
    } else {
        leftEyePupil.scale.set(1.0, 1.0, 0.3);
    }
    head.add(leftEyePupil);
    
    const leftEyeHighlight = new THREE.Mesh(eyeHighlightGeo, eyeHighlightMat);
    leftEyeHighlight.position.set(-0.020, 0.015, 0.061); 
    head.add(leftEyeHighlight);
    
    
    const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.024, 0.01, 0.052);
    rightEyeWhite.scale.set(1.0, 1.0, 0.5);
    head.add(rightEyeWhite);
    
    const rightEyeIris = new THREE.Mesh(eyeIrisGeo, eyeIrisMat);
    rightEyeIris.position.set(0.024, 0.01, 0.056);
    rightEyeIris.scale.set(1.0, 1.0, 0.3);
    head.add(rightEyeIris);
    
    const rightEyePupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    rightEyePupil.position.set(0.024, 0.01, 0.059);
    if (species === 'jacare') {
        rightEyePupil.scale.set(0.3, 1.0, 0.35);
    } else {
        rightEyePupil.scale.set(1.0, 1.0, 0.3);
    }
    head.add(rightEyePupil);
    
    const rightEyeHighlight = new THREE.Mesh(eyeHighlightGeo, eyeHighlightMat);
    rightEyeHighlight.position.set(0.028, 0.015, 0.061);
    head.add(rightEyeHighlight);

    
    const topHair = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.03, 4), furMat);
    topHair.position.set(0, 0.075, 0.005);
    topHair.rotation.x = -0.15;
    head.add(topHair);
    
    const leftTuft = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.025, 4), furMat);
    leftTuft.position.set(-0.072, -0.015, 0.01);
    leftTuft.rotation.z = 0.55;
    head.add(leftTuft);
    
    const rightTuft = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.025, 4), furMat);
    rightTuft.position.set(0.072, -0.015, 0.01);
    rightTuft.rotation.z = -0.55;
    head.add(rightTuft);

    
    const chestTuft = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.025, 4), furMat);
    chestTuft.position.set(0, 0.02, 0.062);
    chestTuft.rotation.x = 0.7;
    chestGroup.add(chestTuft);
    
    
    if (species === 'coelho') {
        
        const earBaseGeo = new THREE.BoxGeometry(0.018, 0.05, 0.008);
        earBaseGeo.translate(0, 0.025, 0); 
        const leftEar = new THREE.Mesh(earBaseGeo, furMat);
        leftEar.position.set(-0.025, 0.065, -0.01);
        leftEar.rotation.set(0.1, 0, 0.12);
        leftEar.castShadow = true;
        head.add(leftEar);
        
        const rightEar = new THREE.Mesh(earBaseGeo, furMat);
        rightEar.position.set(0.025, 0.065, -0.01);
        rightEar.rotation.set(0.1, 0, -0.12);
        rightEar.castShadow = true;
        head.add(rightEar);
        
        
        const earTipGeo = new THREE.BoxGeometry(0.016, 0.04, 0.008);
        earTipGeo.translate(0, 0.02, 0);
        const leftEarTip = new THREE.Mesh(earTipGeo, furMat);
        leftEarTip.position.set(0, 0.048, 0);
        leftEarTip.rotation.z = -0.25; 
        leftEar.add(leftEarTip);
        
        const rightEarTip = new THREE.Mesh(earTipGeo, furMat);
        rightEarTip.position.set(0, 0.048, 0);
        rightEarTip.rotation.z = 0.25; 
        rightEar.add(rightEarTip);
        
        
        const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xffb6c1, roughness: 0.8, flatShading: true });
        const innerEarGeo1 = new THREE.BoxGeometry(0.008, 0.04, 0.002);
        const leftInner = new THREE.Mesh(innerEarGeo1, innerEarMat);
        leftInner.position.set(0, 0.022, 0.005);
        leftEar.add(leftInner);
        
        const rightInner = new THREE.Mesh(innerEarGeo1, innerEarMat);
        rightInner.position.set(0, 0.022, 0.005);
        rightEar.add(rightInner);

        const innerEarGeo2 = new THREE.BoxGeometry(0.007, 0.03, 0.002);
        const leftInnerTip = new THREE.Mesh(innerEarGeo2, innerEarMat);
        leftInnerTip.position.set(0, 0.018, 0.005);
        leftEarTip.add(leftInnerTip);
        
        const rightInnerTip = new THREE.Mesh(innerEarGeo2, innerEarMat);
        rightInnerTip.position.set(0, 0.018, 0.005);
        rightEarTip.add(rightInnerTip);

        
        const upperSnout = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), bellyMat);
        upperSnout.scale.set(1.2, 0.8, 1.0);
        upperSnout.position.set(0, -0.012, 0.054);
        head.add(upperSnout);

        const lowerSnout = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.024), bellyMat);
        lowerSnout.position.set(0, -0.025, 0.048);
        head.add(lowerSnout);

        const mouthInterior = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.02), mouthMat);
        mouthInterior.position.set(0, -0.019, 0.05);
        head.add(mouthInterior);

        
        const buckTeeth = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.002), whiteMat);
        buckTeeth.position.set(0, -0.01, 0.012);
        upperSnout.add(buckTeeth);

        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 4), new THREE.MeshBasicMaterial({ color: 0xfb7185 }));
        nose.position.set(0, 0.008, 0.015);
        upperSnout.add(nose);
        
        
        const whiskerGeo = new THREE.BoxGeometry(0.05, 0.0015, 0.0015);
        const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        const wL1 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wL1.position.set(-0.02, -0.015, 0.06);
        wL1.rotation.set(0, 0.25, 0.05);
        head.add(wL1);
        const wL2 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wL2.position.set(-0.02, -0.020, 0.06);
        wL2.rotation.set(0, 0.25, -0.05);
        head.add(wL2);
        
        const wR1 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wR1.position.set(0.02, -0.015, 0.06);
        wR1.rotation.set(0, -0.25, -0.05);
        head.add(wR1);
        const wR2 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wR2.position.set(0.02, -0.020, 0.06);
        wR2.rotation.set(0, -0.25, 0.05);
        head.add(wR2);

        
        const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
        const collarGeo = new THREE.SphereGeometry(0.015, 5, 5);
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const cx = Math.cos(angle) * 0.038;
            const cz = Math.sin(angle) * 0.038;
            const fluff = new THREE.Mesh(collarGeo, collarMat);
            fluff.position.set(cx, 0.26, cz);
            fluff.scale.set(1.0, 0.6, 1.0);
            group.add(fluff);
        }
        
        if (variant === 'malhado') {
            addSpot(chestGroup, -0.04, 0.01, 0.03, 0, 0, 0, 0.02, 0x1e293b);
            addSpot(waist, 0.03, -0.01, 0.04, 0, 0, 0, 0.025, 0x1e293b);
            addSpot(hips, -0.05, 0.01, -0.03, 0, 0, 0, 0.03, 0x1e293b);
            addSpot(head, 0.03, 0.03, 0.03, 0, 0, 0, 0.02, 0x1e293b);
        }

    } else if (species === 'onca') {
        // Beautifully sculpted feline ears group
        const earGroupL = new THREE.Group();
        earGroupL.position.set(-0.038, 0.055, -0.01);
        earGroupL.rotation.set(0.1, 0.1, 0.22);
        
        const earOuterGeo = new THREE.BoxGeometry(0.018, 0.035, 0.015);
        const earOuterL = new THREE.Mesh(earOuterGeo, furMat);
        earOuterL.castShadow = true;
        earGroupL.add(earOuterL);
        
        const earInnerMat = new THREE.MeshStandardMaterial({ color: 0xffb6c1, roughness: 0.8, flatShading: true });
        const earInnerGeo = new THREE.BoxGeometry(0.012, 0.028, 0.006);
        const earInnerL = new THREE.Mesh(earInnerGeo, earInnerMat);
        earInnerL.position.set(0.002, 0.002, 0.006); // facing forward/outward
        earGroupL.add(earInnerL);
        
        head.add(earGroupL);
        
        const earGroupR = new THREE.Group();
        earGroupR.position.set(0.038, 0.055, -0.01);
        earGroupR.rotation.set(0.1, -0.1, -0.22);
        
        const earOuterR = new THREE.Mesh(earOuterGeo, furMat);
        earOuterR.castShadow = true;
        earGroupR.add(earOuterR);
        
        const earInnerR = new THREE.Mesh(earInnerGeo, earInnerMat);
        earInnerR.position.set(-0.002, 0.002, 0.006);
        earGroupR.add(earInnerR);
        
        head.add(earGroupR);

        
        const bridgeGeo = new THREE.BoxGeometry(0.018, 0.024, 0.032);
        const bridge = new THREE.Mesh(bridgeGeo, furMat);
        bridge.position.set(0, -0.005, 0.048);
        bridge.rotation.x = 0.15;
        head.add(bridge);

        
        const muzzleL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 5), bellyMat);
        muzzleL.position.set(-0.012, -0.015, 0.058);
        head.add(muzzleL);

        const muzzleR = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 5), bellyMat);
        muzzleR.position.set(0.012, -0.015, 0.058);
        head.add(muzzleR);

        const lowerSnout = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.025), bellyMat);
        lowerSnout.position.set(0, -0.028, 0.054);
        head.add(lowerSnout);

        const mouthInterior = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.02), mouthMat);
        mouthInterior.position.set(0, -0.021, 0.056);
        head.add(mouthInterior);

        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.01), blackMat);
        nose.position.set(0, -0.008, 0.068);
        head.add(nose);
        
        
        const whiskerGeo = new THREE.BoxGeometry(0.07, 0.002, 0.002);
        const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xd1d5db });
        
        const wL1 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wL1.position.set(-0.035, -0.012, 0.058);
        wL1.rotation.set(0, 0.2, 0.05);
        head.add(wL1);
        
        const wL2 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wL2.position.set(-0.035, -0.018, 0.058);
        wL2.rotation.set(0, 0.2, -0.05);
        head.add(wL2);

        const wR1 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wR1.position.set(0.035, -0.012, 0.058);
        wR1.rotation.set(0, -0.2, -0.05);
        head.add(wR1);
        
        const wR2 = new THREE.Mesh(whiskerGeo, whiskerMat);
        wR2.position.set(0.035, -0.018, 0.058);
        wR2.rotation.set(0, -0.2, 0.05);
        head.add(wR2);

        
        if (variant === 'onca_pintada') {
            const spotColor = 0x111111;
            const centerColor = 0xd97706;
            
            
            addSphereRosette(head, 0.072, 0.4, 0.5, 0.015, spotColor, centerColor); 
            addSphereRosette(head, 0.072, -0.4, 0.5, 0.015, spotColor, centerColor); 
            addSphereRosette(head, 0.072, 1.2, -0.2, 0.014, spotColor, centerColor); 
            addSphereRosette(head, 0.072, -1.2, -0.2, 0.014, spotColor, centerColor); 
            addSphereRosette(head, 0.072, 2.2, 0.3, 0.014, spotColor, centerColor); 
            addSphereRosette(head, 0.072, -2.2, 0.3, 0.014, spotColor, centerColor); 
            
            
            addSphereRosette(chestGroup, 0.06, 0.6, 0.2, 0.016, spotColor, centerColor);
            addSphereRosette(chestGroup, 0.06, -0.6, 0.2, 0.016, spotColor, centerColor);
            addSphereRosette(chestGroup, 0.06, 2.5, 0.1, 0.016, spotColor, centerColor);
            addSphereRosette(chestGroup, 0.06, -2.5, 0.1, 0.016, spotColor, centerColor);
            
            
            addCylinderStripe(waist, 0.046, 0.015, Math.PI / 2.3, 0.016, 0.016, centerColor); // spot
            addCylinderStripe(waist, 0.046, 0.015, -Math.PI / 2.3, 0.016, 0.016, centerColor);
            addCylinderStripe(waist, 0.046, -0.015, Math.PI, 0.016, 0.016, centerColor);
            
            
            addSphereRosette(hips, 0.065, Math.PI / 2, 0.1, 0.02, spotColor, centerColor);
            addSphereRosette(hips, 0.065, -Math.PI / 2, 0.1, 0.02, spotColor, centerColor);
            addSphereRosette(hips, 0.065, 2.4, -0.2, 0.018, spotColor, centerColor);
            addSphereRosette(hips, 0.065, -2.4, -0.2, 0.018, spotColor, centerColor);
            
            
            addCylinderStripe(leftLeg, 0.022, -0.03, 0, 0.014, 0.014, centerColor);
            addCylinderStripe(leftLeg, 0.022, -0.05, -Math.PI / 2, 0.014, 0.014, centerColor);
            addCylinderStripe(rightLeg, 0.022, -0.03, 0, 0.014, 0.014, centerColor);
            addCylinderStripe(rightLeg, 0.022, -0.05, Math.PI / 2, 0.014, 0.014, centerColor);
        } else if (variant === 'tigre') {
            
            
            addSphereStripe(head, 0.072, 0.4, 0.5, 0.025, 0.005);
            addSphereStripe(head, 0.072, -0.4, 0.5, 0.025, 0.005);
            addSphereStripe(head, 0.072, 1.2, -0.1, 0.025, 0.005);
            addSphereStripe(head, 0.072, -1.2, -0.1, 0.025, 0.005);
            
            
            addSphereStripe(chestGroup, 0.06, 0.6, 0.2, 0.035, 0.006);
            addSphereStripe(chestGroup, 0.06, -0.6, 0.2, 0.035, 0.006);
            
            
            addCylinderStripe(waist, 0.046, 0.01, Math.PI / 2, 0.035, 0.006);
            addCylinderStripe(waist, 0.046, 0.01, -Math.PI / 2, 0.035, 0.006);
            
            
            addSphereStripe(hips, 0.065, Math.PI / 2, 0.1, 0.04, 0.008);
            addSphereStripe(hips, 0.065, -Math.PI / 2, 0.1, 0.04, 0.008);
            
            
            addCylinderStripe(leftLeg, 0.022, -0.03, 0, 0.025, 0.005);
            addCylinderStripe(leftLeg, 0.022, -0.06, -Math.PI / 2, 0.025, 0.005);
            addCylinderStripe(rightLeg, 0.022, -0.03, 0, 0.025, 0.005);
            addCylinderStripe(rightLeg, 0.022, -0.06, Math.PI / 2, 0.025, 0.005);

            
            addCylinderStripe(leftArm, 0.018, -0.03, -Math.PI / 2, 0.02, 0.005);
            addCylinderStripe(rightArm, 0.018, -0.03, Math.PI / 2, 0.02, 0.005);
        }

    } else if (species === 'macaca') {
        
        const faceplateMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.8, flatShading: true });
        const faceplate = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), faceplateMat);
        faceplate.position.set(0, -0.01, 0.052);
        faceplate.scale.set(1.1, 0.8, 0.5);
        head.add(faceplate);

        const upperSnout = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 5), faceplateMat);
        upperSnout.position.set(0, -0.015, 0.072);
        upperSnout.scale.set(1.2, 0.7, 1.0);
        head.add(upperSnout);

        const lowerSnout = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.02), faceplateMat);
        lowerSnout.position.set(0, -0.028, 0.068);
        head.add(lowerSnout);

        const mouthInterior = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.015), mouthMat);
        mouthInterior.position.set(0, -0.021, 0.07);
        head.add(mouthInterior);

        
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.005, 4, 4), blackMat);
        nose.position.set(0, 0.004, 0.018); 
        upperSnout.add(nose);

        
        const earGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 6);
        earGeo.rotateZ(Math.PI / 2);
        const leftEar = new THREE.Mesh(earGeo, furMat);
        leftEar.position.set(-0.068, -0.01, 0);
        head.add(leftEar);
        
        const rightEar = new THREE.Mesh(earGeo, furMat);
        rightEar.position.set(0.068, -0.01, 0);
        head.add(rightEar);
        
        const innerEarMat = new THREE.MeshBasicMaterial({ color: bellyColor });
        const innerEarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.004, 6);
        innerEarGeo.rotateZ(Math.PI / 2);
        
        const leftInner = new THREE.Mesh(innerEarGeo, innerEarMat);
        leftInner.position.set(-0.005, 0, 0);
        leftEar.add(leftInner);
        
        const rightInner = new THREE.Mesh(innerEarGeo, innerEarMat);
        rightInner.position.set(0.005, 0, 0);
        rightEar.add(rightInner);

        
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8, flatShading: true }); 
        const mohawkGroup = new THREE.Group();
        mohawkGroup.position.set(0, 0.075, -0.015);
        for (let j = 0; j < 3; j++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035 - j * 0.005, 4), hairMat);
            spike.position.set(0, 0, -j * 0.02);
            spike.rotation.x = -0.3 + j * 0.15;
            mohawkGroup.add(spike);
        }
        head.add(mohawkGroup);

    } else if (species === 'jacare') {
        
        const snoutGeo = new THREE.BoxGeometry(0.05, 0.02, 0.11);
        snoutGeo.translate(0, 0, 0.05); 
        const snout = new THREE.Mesh(snoutGeo, furMat);
        snout.position.set(0, -0.01, 0.02);
        head.add(snout);
        
        const lowerSnout = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.10), furMat);
        lowerSnout.position.set(0, -0.03, 0.06);
        head.add(lowerSnout);

        const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.08), mouthMat);
        tongue.position.set(0, -0.02, 0.06);
        head.add(tongue);
        
        
        const toothMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const toothGeoDown = new THREE.ConeGeometry(0.004, 0.012, 4);
        toothGeoDown.rotateX(Math.PI); 
        
        const toothGeoUp = new THREE.ConeGeometry(0.004, 0.012, 4); 
        
        
        const teethOffsets = [0.02, 0.035, 0.05, 0.065, 0.08, 0.095];
        teethOffsets.forEach(zVal => {
            
            const tUL = new THREE.Mesh(toothGeoDown, toothMat);
            tUL.position.set(-0.023, -0.012, zVal);
            snout.add(tUL);
            const tUR = new THREE.Mesh(toothGeoDown, toothMat);
            tUR.position.set(0.023, -0.012, zVal);
            snout.add(tUR);
            
            
            const tLL = new THREE.Mesh(toothGeoUp, toothMat);
            tLL.position.set(-0.021, 0.007, zVal - 0.01);
            lowerSnout.add(tLL);
            const tLR = new THREE.Mesh(toothGeoUp, toothMat);
            tLR.position.set(0.021, 0.007, zVal - 0.01);
            lowerSnout.add(tLR);
        });

        
        addRidge(head, -0.015, 0.05, -0.03, 0.3);
        addRidge(head, 0.015, 0.05, -0.03, 0.3);
        
        addRidge(chestGroup, -0.015, 0.05, -0.05, 0.3);
        addRidge(chestGroup, 0.015, 0.05, -0.05, 0.3);
        
        addRidge(waist, -0.015, 0.05, -0.05, 0.3);
        addRidge(waist, 0.015, 0.05, -0.05, 0.3);
        
        addRidge(hips, -0.015, 0.05, -0.06, 0.3);
        addRidge(hips, 0.015, 0.05, -0.06, 0.3);

        
        const bellyPlateMat = new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.7, flatShading: true });
        for (let bp = 0; bp < 3; bp++) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.005), bellyPlateMat);
            plate.position.set(0, -0.03 + bp * 0.025, 0.078);
            chestGroup.add(plate);
        }

    } else if (species === 'arara') {
        
        const beakMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, flatShading: true });
        const beakGeo = new THREE.ConeGeometry(0.02, 0.05, 5);
        const beak = new THREE.Mesh(beakGeo, beakMat);
        beak.position.set(0, -0.015, 0.075);
        beak.rotation.set(Math.PI / 2.2, 0, 0); // Rotate 81 degrees so it curves out
        head.add(beak);
        
        const beakLowerGeo = new THREE.ConeGeometry(0.015, 0.028, 5);
        const beakLower = new THREE.Mesh(beakLowerGeo, beakMat);
        beakLower.position.set(0, -0.03, 0.070);
        beakLower.rotation.set(Math.PI / 2.6, 0, 0);
        head.add(beakLower);
        
        
        const crestMat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.8, flatShading: true });
        const crestGeo = new THREE.ConeGeometry(0.01, 0.035, 4);
        for (let i = 0; i < 3; i++) {
            const crestFeather = new THREE.Mesh(crestGeo, crestMat);
            crestFeather.position.set(0, 0.078, -0.015 - i * 0.015);
            crestFeather.rotation.x = -0.5 - i * 0.2;
            head.add(crestFeather);
        }
        
        
        const patchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const patchGeo = new THREE.SphereGeometry(0.016, 6, 6);
        
        const leftPatch = new THREE.Mesh(patchGeo, patchMat);
        leftPatch.position.set(-0.024, 0.01, 0.04);
        leftPatch.scale.set(1.0, 1.3, 0.3);
        head.add(leftPatch);
        
        const rightPatch = new THREE.Mesh(patchGeo, patchMat);
        rightPatch.position.set(0.024, 0.01, 0.04);
        rightPatch.scale.set(1.0, 1.3, 0.3);
        head.add(rightPatch);

        
        addSpot(leftPatch, -0.005, 0.008, 0.012, 0, 0, 0.1, 0.004, 0x111111);
        addSpot(leftPatch, -0.005, -0.008, 0.012, 0, 0, -0.1, 0.004, 0x111111);
        addSpot(rightPatch, 0.005, 0.008, 0.012, 0, 0, -0.1, 0.004, 0x111111);
        addSpot(rightPatch, 0.005, -0.008, 0.012, 0, 0, 0.1, 0.004, 0x111111);

    } else if (species === 'capivara') {
        
        const snoutGeo = new THREE.BoxGeometry(0.06, 0.042, 0.065);
        const snout = new THREE.Mesh(snoutGeo, furMat);
        snout.position.set(0, -0.01, 0.058);
        head.add(snout);
        
        const lowerSnout = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.055), furMat);
        lowerSnout.position.set(0, -0.032, 0.052);
        head.add(lowerSnout);

        const mouthInterior = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.01, 0.04), mouthMat);
        mouthInterior.position.set(0, -0.022, 0.054);
        head.add(mouthInterior);

        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.01), new THREE.MeshBasicMaterial({ color: 0x1c1917 }));
        nose.position.set(0, 0.015, 0.033);
        snout.add(nose);
        
        
        const stemMat = new THREE.MeshBasicMaterial({ color: 0x22c55e }); 
        const stemGeo = new THREE.BoxGeometry(0.04, 0.003, 0.003);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(0.02, -0.02, 0.082); 
        stem.rotation.set(0.1, 0.4, 0.2); 
        head.add(stem);
        
        const flowerGroup = new THREE.Group();
        flowerGroup.position.set(0.02, 0, 0); 
        
        
        const centerGeo = new THREE.BoxGeometry(0.005, 0.005, 0.002);
        const centerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 }); 
        const fCenter = new THREE.Mesh(centerGeo, centerMat);
        flowerGroup.add(fCenter);
        
        
        const petalMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); 
        const petalGeo = new THREE.BoxGeometry(0.004, 0.004, 0.001);
        for (let p = 0; p < 4; p++) {
            const petal = new THREE.Mesh(petalGeo, petalMat);
            const pAngle = (p * Math.PI) / 2;
            petal.position.set(Math.cos(pAngle) * 0.004, Math.sin(pAngle) * 0.004, 0);
            flowerGroup.add(petal);
        }
        stem.add(flowerGroup);
        
        // Small capybara ears (attached to head)
        const earGeo = new THREE.SphereGeometry(0.018, 5, 5);
        const leftEar = new THREE.Mesh(earGeo, furMat);
        leftEar.position.set(-0.045, 0.04, -0.01);
        leftEar.scale.set(0.8, 1.0, 1.0);
        head.add(leftEar);
        
        const rightEar = new THREE.Mesh(earGeo, furMat);
        rightEar.position.set(0.045, 0.04, -0.01);
        rightEar.scale.set(0.8, 1.0, 1.0);
        head.add(rightEar);

        // Sleepy Eyelids
        const lidGeo = new THREE.BoxGeometry(0.022, 0.006, 0.01);
        const leftLid = new THREE.Mesh(lidGeo, furMat);
        leftLid.position.set(-0.024, 0.023, 0.052);
        leftLid.rotation.z = -0.05;
        head.add(leftLid);
        
        const rightLid = new THREE.Mesh(lidGeo, furMat);
        rightLid.position.set(0.024, 0.023, 0.052);
        rightLid.rotation.z = 0.05;
        head.add(rightLid);
    }
    
    // 9. Species-Specific Tails (attached to hips)
    if (species !== 'capivara') {
        let tailMesh;
        
        if (species === 'macaca') {
            // Curly 4-segment monkey tail
            const tailGroup = new THREE.Group();
            tailGroup.name = "tail";
            tailGroup.position.set(0, -0.02, -0.07);
            
            // Segment 1 (Base)
            const tailGeo1 = new THREE.CylinderGeometry(0.01, 0.008, 0.05, 5);
            tailGeo1.translate(0, -0.025, 0);
            const tailSeg1 = new THREE.Mesh(tailGeo1, furMat);
            tailSeg1.name = "tailSeg1";
            tailSeg1.rotation.set(Math.PI / 3, 0, 0);
            tailGroup.add(tailSeg1);
            
            
            const tailGeo2 = new THREE.CylinderGeometry(0.008, 0.007, 0.05, 5);
            tailGeo2.translate(0, -0.025, 0);
            const tailSeg2 = new THREE.Mesh(tailGeo2, furMat);
            tailSeg2.name = "tailSeg2";
            tailSeg2.position.set(0, -0.05, 0);
            tailSeg2.rotation.set(0.25, 0, 0);
            tailSeg1.add(tailSeg2);
            
            
            const tailGeo3 = new THREE.CylinderGeometry(0.007, 0.006, 0.05, 5);
            tailGeo3.translate(0, -0.025, 0);
            const tailSeg3 = new THREE.Mesh(tailGeo3, furMat);
            tailSeg3.name = "tailSeg3";
            tailSeg3.position.set(0, -0.05, 0);
            tailSeg3.rotation.set(0.35, 0, 0);
            tailSeg2.add(tailSeg3);
            
            
            const tailGeo4 = new THREE.CylinderGeometry(0.006, 0.004, 0.05, 5);
            tailGeo4.translate(0, -0.025, 0);
            const tailSeg4 = new THREE.Mesh(tailGeo4, furMat);
            tailSeg4.name = "tailSeg4";
            tailSeg4.position.set(0, -0.05, 0);
            tailSeg4.rotation.set(0.45, 0, 0);
            tailSeg3.add(tailSeg4);
            
            tailMesh = tailGroup;
        } else if (species === 'onca') {
            
            const tailGroup = new THREE.Group();
            tailGroup.name = "tail";
            tailGroup.position.set(0, -0.02, -0.07);
            
            
            const tailGeo1 = new THREE.CylinderGeometry(0.012, 0.01, 0.06, 5);
            tailGeo1.translate(0, -0.03, 0); 
            const tailSeg1 = new THREE.Mesh(tailGeo1, furMat);
            tailSeg1.name = "tailSeg1";
            tailSeg1.rotation.set(Math.PI / 2.8, 0, 0);
            tailGroup.add(tailSeg1);
            
            // Segment 2
            const tailGeo2 = new THREE.CylinderGeometry(0.01, 0.008, 0.06, 5);
            tailGeo2.translate(0, -0.03, 0);
            const tailSeg2 = new THREE.Mesh(tailGeo2, furMat);
            tailSeg2.name = "tailSeg2";
            tailSeg2.position.set(0, -0.06, 0);
            tailSeg2.rotation.set(0.1, 0, 0);
            tailSeg1.add(tailSeg2);
            
            // Segment 3 (Tip - styled black for leoa)
            const tailGeo3 = new THREE.CylinderGeometry(0.008, 0.005, 0.06, 5);
            tailGeo3.translate(0, -0.03, 0);
            
            let tipMat = furMat;
            if (variant === 'leoa') {
                tipMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.7, flatShading: true }); // dark slate tip for lioness
            }
            const tailSeg3 = new THREE.Mesh(tailGeo3, tipMat);
            tailSeg3.name = "tailSeg3";
            tailSeg3.position.set(0, -0.06, 0);
            tailSeg3.rotation.set(0.15, 0, 0);
            tailSeg2.add(tailSeg3);
            
            if (variant === 'onca_pintada') {
                const sColor = 0x111111;
                // Tail rosettes/spots
                addSpot(tailSeg1, 0, -0.03, 0.012, 0, 0, 0, 0.01, sColor);
                addSpot(tailSeg2, 0, -0.03, 0.01, 0, 0, 0, 0.01, sColor);
                addSpot(tailSeg3, 0, -0.03, 0.008, 0, 0, 0, 0.008, sColor);
            } else if (variant === 'tigre') {
                
                addStripe(tailSeg1, 0, -0.03, 0.012, 0.016, 0.005, 0, 0, 0);
                addStripe(tailSeg2, 0, -0.03, 0.01, 0.014, 0.005, 0, 0, 0);
                addStripe(tailSeg3, 0, -0.03, 0.008, 0.012, 0.005, 0, 0, 0);
            }
            
            tailMesh = tailGroup;
        } else if (species === 'arara') {
            
            const tailGroup = new THREE.Group();
            tailGroup.name = "tail";
            tailGroup.position.set(0, -0.02, -0.065);
            tailGroup.rotation.set(Math.PI / 3.5, 0, 0);
            
            const tailColors = furColor === 0x0284c7 ? 0xdc2626 : 0xfacc15;
            const tailMat = new THREE.MeshStandardMaterial({ color: tailColors, roughness: 0.8, flatShading: true });
            
            // Center feather
            const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.01), tailMat);
            t1.geometry.translate(0, -0.075, 0);
            tailGroup.add(t1);
            
            // Left feather (shorter, offset)
            const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.11, 0.008), tailMat);
            t2.geometry.translate(0, -0.055, 0);
            t2.position.set(-0.015, -0.02, 0.002);
            t2.rotation.z = 0.15;
            tailGroup.add(t2);
            
            // Right feather (shorter, offset)
            const t3 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.11, 0.008), tailMat);
            t3.geometry.translate(0, -0.055, 0);
            t3.position.set(0.015, -0.02, 0.002);
            t3.rotation.z = -0.15;
            tailGroup.add(t3);
            
            tailMesh = tailGroup;
        } else if (species === 'coelho') {
            // Bunny cloud-like cotton tail (4 clustered spheres)
            const tailGroup = new THREE.Group();
            tailGroup.name = "tail";
            tailGroup.position.set(0, -0.02, -0.075);
            
            const cottonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
            const sphereGeo = new THREE.SphereGeometry(0.018, 5, 5);
            
            const c1 = new THREE.Mesh(sphereGeo, cottonMat);
            c1.position.set(0, 0, 0);
            tailGroup.add(c1);
            
            const c2 = new THREE.Mesh(sphereGeo, cottonMat);
            c2.position.set(-0.01, -0.008, 0.005);
            tailGroup.add(c2);
            
            const c3 = new THREE.Mesh(sphereGeo, cottonMat);
            c3.position.set(0.01, -0.008, 0.005);
            tailGroup.add(c3);
            
            const c4 = new THREE.Mesh(sphereGeo, cottonMat);
            c4.position.set(0, 0.01, 0.005);
            tailGroup.add(c4);
            
            tailMesh = tailGroup;
        } else if (species === 'jacare') {
            // crocodile thick flat segmented tail
            const tailGroup = new THREE.Group();
            tailGroup.name = "tail";
            tailGroup.position.set(0, -0.02, -0.07);
            tailGroup.rotation.set(-Math.PI / 3.5, 0, 0);
            
            
            const tailBaseGeo = new THREE.BoxGeometry(0.04, 0.024, 0.09);
            tailBaseGeo.translate(0, 0, -0.045); 
            const tailBase = new THREE.Mesh(tailBaseGeo, furMat);
            tailBase.castShadow = true;
            tailGroup.add(tailBase);
            
            
            const tailSeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.08), furMat);
            tailSeg2.geometry.translate(0, 0, -0.04);
            tailSeg2.position.set(0, -0.003, -0.08);
            tailBase.add(tailSeg2);
            
            
            const tailRidgeMat = new THREE.MeshStandardMaterial({ color: (variant === 'jacare_verde') ? 0x064e3b : 0x14532d, roughness: 0.8, flatShading: true });
            const tailRidgeGeo = new THREE.ConeGeometry(0.01, 0.014, 4);
            tailRidgeGeo.rotateX(Math.PI / 2);
            
            // ridges on segment 1
            const r1 = new THREE.Mesh(tailRidgeGeo, tailRidgeMat);
            r1.position.set(0, 0.014, -0.025);
            tailBase.add(r1);
            const r2 = new THREE.Mesh(tailRidgeGeo, tailRidgeMat);
            r2.position.set(0, 0.014, -0.065);
            tailBase.add(r2);
            
            // ridges on segment 2
            const r3 = new THREE.Mesh(tailRidgeGeo, tailRidgeMat);
            r3.position.set(0, 0.011, -0.035);
            tailSeg2.add(r3);
            
            tailMesh = tailGroup;
        }
        
        if (tailMesh) {
            hips.add(tailMesh); // Attached to hips!
        }
    }

    // Set model scale to make them very small and cute (50% of original size)
    group.scale.set(0.5, 0.5, 0.5);

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
            
            points.push(new THREE.Vector3().addVectors(T[k], r_prev));
        }
    }
    
    
    points.push(new THREE.Vector3().addVectors(T[n-1], rights[n-2]));
    
    return points;
}

export function updateFurrySpawning() {
    if (!scene) return;
    if (Math.random() > 0.15) return;
    
    try {
        if (!window.activeFurries) {
            window.activeFurries = [];
        }
        
        if (window.activeFurries.length >= 3) return; 
        
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
                    speed: 0.002 + Math.random() * 0.002, 
                    bobSeed: Math.random() * 100
                });
            }
        }
    } catch (err) {
        console.error("Error in updateFurrySpawning:", err);
    }
}

