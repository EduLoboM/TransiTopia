import * as THREE from 'three';
import { state, BUILD_CONFIGS } from './state.js';

export let scene, camera, renderer;
export const GRID_SIZE = 20;
export const TILE_SPACING = 1.0;

export const cameraState = {
    target: new THREE.Vector3((GRID_SIZE * TILE_SPACING) / 2, 0, (GRID_SIZE * TILE_SPACING) / 2),
    targetLerped: new THREE.Vector3((GRID_SIZE * TILE_SPACING) / 2, 0, (GRID_SIZE * TILE_SPACING) / 2),
    distance: 30,
    distanceTarget: 30,
    theta: Math.PI / 4,
    thetaTarget: Math.PI / 4,
    phi: Math.PI / 3,
    phiTarget: Math.PI / 3,
};

let activeTiles = []; // Reference to the active tiles array to avoid circular dependency

export function initScene(container, tilesReference) {
    activeTiles = tilesReference;

    // Scene setup - Brightsky Light Mode
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe); // Soft sky blue
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.012);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Camera setup
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    updateCameraPosition(true);

    // Lighting setup - Bright afternoon sun
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Bright white light
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(30, 40, 20);
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
    scene.add(sunLight);

    // Subtle cozy warm skylight accent
    const accentLight = new THREE.DirectionalLight(0xffedd5, 0.4);
    accentLight.position.set(-20, -10, -20);
    scene.add(accentLight);

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    animate();
}

export function updateCameraPosition(immediate = false) {
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

// Global variable for hovering (updated by input module)
export let hoveredTile = null;
export function setHoveredTile(tile) {
    hoveredTile = tile;
}

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
        if (!activeTiles[x]) continue;
        for (let z = 0; z < GRID_SIZE; z++) {
            const tile = activeTiles[x][z];
            if (!tile) continue;
            
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

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
