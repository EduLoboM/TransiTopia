import * as THREE from 'three';
import { state, BUILD_CONFIGS, updateHUD, showToast } from './state.js';
import { scene, GRID_SIZE, TILE_SPACING } from './scene.js';

export const tiles = [];
export let flatTiles = [];

// Initialize grid structure
export function createGrid() {
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

    // Populate flatTiles for optimized lookup in raycasting
    flatTiles.push(...tiles.flatMap(row => row));
}

// --- Direct Building Actions ---
export function buildStructureDirectly(tile, structureType) {
    try {
        const isFirstAction = !state.isPainting || (state.paintedThisDrag && state.paintedThisDrag.size <= 1);
        console.log(`[Build] Attempting to build '${structureType}' at (${tile.x}, ${tile.z}). isFirstAction: ${isFirstAction}`);

        if (tile.type !== 'grass') {
            console.log(`[Build] Tile already has structure: ${tile.type}`);
            if (isFirstAction) showToast("Lote já possui uma estrutura construída!", "warning");
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
        state.tokens += Math.round(config.happinessBonus * 1.5);

        updateHUD();
        
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
    
    if (state.selectedTile && state.selectedTile.x === tile.x && state.selectedTile.z === tile.z) {
        updateTileSelectionInfo(tile);
    }

    if (isFirstAction) {
        showToast("Estrutura demolida! -5% Felicidade", "danger");
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
        fabrica:  { str: 'Fábrica Industrial',   icon: '🏭', desc: 'Produção industrial e geração de empregos.' },
        mina:     { str: 'Mina de Recursos',     icon: '⛏️', desc: 'Extração de minérios e recursos naturais.' },
        agua:     { str: 'Estação de Água',      icon: '💧', desc: 'Tratamento e distribuição de água potável.' },
        predio:   { str: 'Prédio Urbano',        icon: '🏢', desc: 'Habitação e espaço comercial urbano.' },
    };
    const info = typeMap[tile.type] || { str: 'Lote Baldio', icon: '🌱', desc: 'Passe para o modo de construção para criar estruturas.' };

    let demolishBtnHTML = '';
    if (tile.type !== 'grass') {
        demolishBtnHTML = `<button class="btn-danger bubble-btn" onclick="window.demolishSelectedTile(${tile.x}, ${tile.z})">🧹 Demolir</button>`;
    }

    infoContainer.innerHTML = `
        <div class="card-icon">${info.icon}</div>
        <div class="card-text">
            <h4>Lote (${tile.x}, ${tile.z}) - ${info.str}</h4>
            <p>${info.desc}</p>
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
        const dashGroup = new THREE.Group();
        for (let i = -1; i <= 1; i++) {
            const dashGeo = new THREE.BoxGeometry(0.08, 0.01, 0.18);
            const dash = new THREE.Mesh(dashGeo, lineMat);
            dash.position.set(0, 0.155, i * 0.3);
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
            // Arc in south-east inner quadrant (positive X and Z)
            const dotGeo = new THREE.BoxGeometry(0.05, 0.01, 0.05);
            const dot = new THREE.Mesh(dotGeo, lineMat);
            dot.position.set(
                Math.sin(angle) * 0.14,
                0.155,
                Math.cos(angle) * 0.14
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
        line.position.set(0, 0.155, 0);
        group.add(line);

        const crossGeo = new THREE.BoxGeometry(0.25, 0.01, 0.08);
        const cross = new THREE.Mesh(crossGeo, lineMat);
        cross.position.set(0, 0.155, 0);
        group.add(cross);

        // Default T-junction (missing north): open sides are south, east, west
        // The capped side is south-of-missing = the base of the T cap, which is south in template
        addSidewalk(group, sidewalkMat, 'south');

    } else if (conn.type === 'crossroad') {
        const hGeo = new THREE.BoxGeometry(0.3, 0.01, 0.06);
        const hLine = new THREE.Mesh(hGeo, whiteMat);
        hLine.position.set(0, 0.155, 0);
        group.add(hLine);

        const vGeo = new THREE.BoxGeometry(0.06, 0.01, 0.3);
        const vLine = new THREE.Mesh(vGeo, whiteMat);
        vLine.position.set(0, 0.155, 0);
        group.add(vLine);

    } else if (conn.type === 'deadend') {
        const lineGeo = new THREE.BoxGeometry(0.08, 0.01, 0.35);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, 0.155, -0.1);
        group.add(line);

        const capGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 8);
        const cap = new THREE.Mesh(capGeo, lineMat);
        cap.position.set(0, 0.155, 0.3);
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
        case 'north': curb.position.set(0, 0.16, -offset); break;
        case 'south': curb.position.set(0, 0.16, offset); break;
        case 'east':  curb.position.set(offset, 0.16, 0); break;
        case 'west':  curb.position.set(-offset, 0.16, 0); break;
    }
    group.add(curb);
}

export function buildStructureMesh(tile, type) {
    if (tile.builtStructure) {
        scene.remove(tile.builtStructure);
    }

    const pos = tile.mesh.position;
    let group;

    if (type === 'road') {
        group = buildRoadMesh(tile);
    } else {
        group = new THREE.Group();

        if (type === 'hospital') {
            // White main building
            const bodyGeo = new THREE.BoxGeometry(0.7, 0.55, 0.7);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.set(0, 0.37, 0);
            body.castShadow = true;
            group.add(body);
            // Pink flat roof
            const roofGeo = new THREE.BoxGeometry(0.76, 0.06, 0.76);
            const roofMat = new THREE.MeshStandardMaterial({ color: 0xfbb6ce, roughness: 0.4 });
            const roof = new THREE.Mesh(roofGeo, roofMat);
            roof.position.set(0, 0.68, 0);
            roof.castShadow = true;
            group.add(roof);
            // Red cross horizontal
            const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            crossH.position.set(0, 0.72, 0);
            group.add(crossH);
            // Red cross vertical
            const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.32), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
            crossV.position.set(0, 0.72, 0);
            group.add(crossV);
            // Green beacon
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
            beacon.position.set(0, 0.82, 0);
            group.add(beacon);

        } else if (type === 'floresta') {
            const treeMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.9 });
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 1.0 });
            const positions = [[-0.2, 0, -0.2], [0.2, 0, 0.1], [-0.05, 0, 0.22], [0.25, 0, -0.18]];
            positions.forEach(([tx, , tz]) => {
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 6), trunkMat);
                trunk.position.set(tx, 0.24, tz);
                group.add(trunk);
                // Layered canopy
                [0.26, 0.20, 0.14].forEach((r, li) => {
                    const canopy = new THREE.Mesh(new THREE.ConeGeometry(r, 0.28, 7), treeMat);
                    canopy.position.set(tx, 0.42 + li * 0.18, tz);
                    canopy.castShadow = true;
                    group.add(canopy);
                });
            });

        } else if (type === 'usina') {
            // Solar panel base
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.3, metalness: 0.4 });
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.55), baseMat);
            panel.position.set(0, 0.14, 0);
            panel.castShadow = true;
            group.add(panel);
            // Panel grid lines
            const lineMat2 = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
            [-0.12, 0, 0.12].forEach(offset => {
                const hLine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.005, 0.01), lineMat2);
                hLine.position.set(0, 0.165, offset);
                group.add(hLine);
                const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.55), lineMat2);
                vLine.position.set(offset, 0.165, 0);
                group.add(vLine);
            });
            // Wind turbine pole
            const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5, metalness: 0.6 });
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.65, 8), poleMat);
            pole.position.set(0.22, 0.49, 0.18);
            pole.castShadow = true;
            group.add(pole);
            // Blades
            const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
            for (let b = 0; b < 3; b++) {
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.02), bladeMat);
                blade.position.set(0.22, 0.82, 0.18);
                blade.rotation.z = (b * Math.PI * 2) / 3;
                group.add(blade);
            }
            // Hub
            group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), poleMat), { position: new THREE.Vector3(0.22, 0.82, 0.18) }));

        } else if (type === 'fabrica') {
            // Main factory body
            const factMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.3 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.65), factMat);
            body.position.set(0, 0.3, 0);
            body.castShadow = true;
            group.add(body);
            // Saw-tooth roof
            const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6 });
            [-0.2, 0.05].forEach(xOff => {
                const prism = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.18, 0.22, 3, 1, false), roofMat2);
                prism.position.set(xOff, 0.61, 0);
                prism.rotation.y = Math.PI / 6;
                prism.castShadow = true;
                group.add(prism);
            });
            // Smokestacks
            const stackMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
            const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd1d5db, transparent: true, opacity: 0.6 });
            [[-0.22, 0.3], [0.22, 0.22]].forEach(([sx, sz]) => {
                const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.45, 8), stackMat);
                stack.position.set(sx, 0.72, sz);
                stack.castShadow = true;
                group.add(stack);
                const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), smokeMat);
                smoke.position.set(sx, 0.98, sz);
                group.add(smoke);
            });

        } else if (type === 'mina') {
            // Rocky earth mound
            const earthMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 1.0 });
            const mound = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 8), earthMat);
            mound.position.set(0, 0.25, 0);
            mound.castShadow = true;
            group.add(mound);
            // Mine shaft frame (A-frame)
            const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
            const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), woodMat);
            bar1.position.set(-0.14, 0.46, 0);
            bar1.rotation.z = 0.25;
            bar1.castShadow = true;
            group.add(bar1);
            const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), woodMat);
            bar2.position.set(0.14, 0.46, 0);
            bar2.rotation.z = -0.25;
            bar2.castShadow = true;
            group.add(bar2);
            const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.06), woodMat);
            crossbar.position.set(0, 0.7, 0);
            group.add(crossbar);
            // Orange warning light
            const warnLight = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf97316 }));
            warnLight.position.set(0, 0.82, 0);
            group.add(warnLight);

        } else if (type === 'agua') {
            // Round water tank
            const tankMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3, metalness: 0.5 });
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 12), tankMat);
            tank.position.set(0, 0.42, 0);
            tank.castShadow = true;
            group.add(tank);
            // Conical cap
            const capMat = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.4 });
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.22, 12), capMat);
            cap.position.set(0, 0.76, 0);
            cap.castShadow = true;
            group.add(cap);
            // Support legs
            const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7, metalness: 0.4 });
            [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), legMat);
                leg.position.set(lx, 0.16, lz);
                group.add(leg);
            });
            // Blue water droplet indicator
            const drop = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            drop.position.set(0, 0.9, 0);
            group.add(drop);

        } else if (type === 'predio') {
            // Tall office building
            const buildMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.2 });
            const build = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.55), buildMat);
            build.position.set(0, 0.52, 0);
            build.castShadow = true;
            group.add(build);
            // Glass window grid
            const glassMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.7 });
            for (let wy = 0; wy < 4; wy++) {
                for (let wx = -1; wx <= 1; wx++) {
                    const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), glassMat);
                    win.position.set(wx * 0.15, 0.22 + wy * 0.18, 0.28);
                    group.add(win);
                }
            }
            // Flat rooftop
            const topMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
            const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), topMat);
            top.position.set(0, 0.98, 0);
            group.add(top);
            // Antenna
            const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 }));
            antenna.position.set(0.15, 1.13, 0.15);
            group.add(antenna);
        }
    }

    group.position.set(pos.x, 0, pos.z);
    scene.add(group);
    tile.builtStructure = group;
}
