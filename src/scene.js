import * as THREE from 'three';
import { state, BUILD_CONFIGS, showToast } from './state.js';

export let scene, camera, renderer;
export const GRID_SIZE = 30;
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

let activeTiles = []; 

export function initScene(container, tilesReference) {
    activeTiles = tilesReference;

    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe); 
    scene.fog = new THREE.FogExp2(0xdbeafe, 0.012);

    
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    
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


export let hoveredTile = null;
export function setHoveredTile(tile) {
    hoveredTile = tile;
}

function animate() {
    requestAnimationFrame(animate);

    
    cameraState.theta += (cameraState.thetaTarget - cameraState.theta) * 0.12;
    cameraState.phi += (cameraState.phiTarget - cameraState.phi) * 0.12;
    cameraState.distance += (cameraState.distanceTarget - cameraState.distance) * 0.12;
    cameraState.targetLerped.lerp(cameraState.target, 0.12);

    updateCameraPosition();

    
    for (let x = 0; x < GRID_SIZE; x++) {
        if (!activeTiles[x]) continue;
        for (let z = 0; z < GRID_SIZE; z++) {
            const tile = activeTiles[x][z];
            if (!tile) continue;
            
            
            let baseHeight = -0.1;
            if (tile.type === 'water') baseHeight = -0.25;
            else if (tile.type === 'sand') baseHeight = -0.18;
            else if (tile.type === 'mountain') baseHeight = -0.1;

            
            if (hoveredTile && hoveredTile.x === x && hoveredTile.z === z) {
                if (state.selectedTile && state.selectedTile.x === x && state.selectedTile.z === z) {
                    tile.targetY = baseHeight + 0.3;
                    tile.targetColor.setHex(0xffaec1); 
                } else {
                    tile.targetY = baseHeight + 0.2;
                    
                    const buildable = tile.type === 'grass' || tile.type === 'sand';
                    if (buildable && BUILD_CONFIGS[state.currentTool]) {
                        tile.targetColor.setHex(BUILD_CONFIGS[state.currentTool].color);
                    } else if (state.currentTool === 'demolish' && !['grass', 'sand', 'water', 'mountain'].includes(tile.type)) {
                        tile.targetColor.setHex(0xff9e9e); 
                    } else {
                        tile.targetColor.setHex(0x93c5fd); 
                    }
                }
            } else if (state.selectedTile && state.selectedTile.x === x && state.selectedTile.z === z) {
                tile.targetY = baseHeight + 0.3;
                tile.targetColor.setHex(0xffaec1); 
            } else {
                tile.targetY = baseHeight;
                if (['grass', 'water', 'sand', 'mountain'].includes(tile.type)) {
                    tile.targetColor.setHex(tile.baseColor);
                } else if (BUILD_CONFIGS[tile.type]) {
                    tile.targetColor.setHex(BUILD_CONFIGS[tile.type].color);
                }
            }

            
            tile.mesh.position.y += (tile.targetY - tile.mesh.position.y) * 0.18;
            
            
            tile.material.color.lerp(tile.targetColor, 0.18);

            
            if (tile.builtStructure && tile.type === 'usina') {
                const blades = tile.builtStructure.getObjectByName("usina_blades");
                if (blades) {
                    blades.rotation.z += 0.05; 
                }
            }
        }
    }

    
    if (window.swimmingFish && window.swimmingFish.length > 0) {
        window.swimmingFish.forEach(fish => {
            fish.angle += fish.speed;
            
            
            fish.group.position.x = Math.cos(fish.angle) * fish.radius;
            fish.group.position.z = Math.sin(fish.angle) * fish.radius;
            
            
            const dx = -Math.sin(fish.angle) * fish.speed;
            const dz = Math.cos(fish.angle) * fish.speed;
            fish.group.rotation.y = Math.atan2(dx, dz);
            
            
            fish.finAngle += 0.25;
            const fin = fish.group.children[1];
            if (fin) {
                fin.rotation.y = Math.sin(fish.finAngle) * 0.4;
            }
        });
    }

    
    if (window.activeCars && window.activeCars.length > 0) {
        for (let i = window.activeCars.length - 1; i >= 0; i--) {
            const car = window.activeCars[i];
            
            
            if (!car || !car.path || !car.mesh || !car.originalPath) {
                if (car && car.mesh) scene.remove(car.mesh);
                window.activeCars.splice(i, 1);
                continue;
            }
            
            try {
                
                if (car.currentIndex >= car.path.length - 1) {
                    scene.remove(car.mesh);
                    
                    car.mesh.traverse(child => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    window.activeCars.splice(i, 1);
                    continue;
                }
                
                const p1 = car.path[car.currentIndex];
                const p2 = car.path[car.currentIndex + 1];
                
                if (!p1 || !p2) {
                    scene.remove(car.mesh);
                    window.activeCars.splice(i, 1);
                    continue;
                }
                
                const dist = p1.distanceTo(p2);
                
                
                car.progress += car.speed / Math.max(0.01, dist);
                
                // Interpolate position using the current segment, clamping to 1.0
                const progress = Math.min(1.0, car.progress);
                const x = (1 - progress) * p1.x + progress * p2.x;
                const z = (1 - progress) * p1.z + progress * p2.z;
                
                const worldX = x * TILE_SPACING;
                const worldZ = z * TILE_SPACING;
                
                // Find closest tile in the original path for height and road validation
                let targetY = 0.12;
                let pathValid = true;
                let closestTile = null;
                let minDistance = Infinity;
                
                for (const node of car.originalPath) {
                    const tile = activeTiles[node.x]?.[node.z];
                    if (!tile || tile.type !== 'road') {
                        pathValid = false;
                        break;
                    }
                    const distToTile = Math.hypot(x - node.x, z - node.z);
                    if (distToTile < minDistance) {
                        minDistance = distToTile;
                        closestTile = tile;
                    }
                }
                
                if (!pathValid) {
                    scene.remove(car.mesh);
                    car.mesh.traverse(child => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    window.activeCars.splice(i, 1);
                    continue;
                }
                
                if (closestTile) {
                    targetY = closestTile.mesh.position.y + 0.12;
                }
                
                // Smoothly interpolate vertical height (handles hover and selection lift)
                const currentY = car.mesh.position.y;
                const newY = currentY + (targetY - currentY) * 0.2;
                
                car.mesh.position.set(worldX, newY, worldZ);
                
                // Rotate to face movement direction with angle lerping for smooth steering
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                if (dx !== 0 || dz !== 0) {
                    const targetAngle = Math.atan2(dx, dz);
                    let diff = targetAngle - car.mesh.rotation.y;
                    // Normalize angle diff to -PI to PI to prevent spinning 360 degrees
                    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                    car.mesh.rotation.y += diff * 0.2;
                }
                
                // Roll wheels and animate body
                if (car.mesh && car.mesh.children) {
                    for (let w = 3; w < 7; w++) {
                        const wheel = car.mesh.children[w];
                        if (wheel) {
                            wheel.rotation.x += car.speed * 20;
                        }
                    }
                    
                    const bodyMesh = car.mesh.children[0];
                    if (bodyMesh) {
                        bodyMesh.position.y = 0.05 + Math.sin(Date.now() * 0.015) * 0.005;
                        bodyMesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.02;
                    }
                }
                
                // Post-advance index update
                if (car.progress >= 1.0) {
                    car.currentIndex++;
                    car.progress = 0.0;
                }
            } catch (err) {
                console.error("Error in car animation:", err);
                showToast("Erro na animação do carro: " + err.message, "danger");
                scene.remove(car.mesh);
                window.activeCars.splice(i, 1);
            }
        }
    }

    // Animate active furry citizens on sidewalks
    if (window.activeFurries && window.activeFurries.length > 0) {
        for (let i = window.activeFurries.length - 1; i >= 0; i--) {
            const furry = window.activeFurries[i];
            
            if (!furry || !furry.path || !furry.mesh || !furry.originalPath) {
                if (furry && furry.mesh) scene.remove(furry.mesh);
                window.activeFurries.splice(i, 1);
                continue;
            }
            
            try {
                if (furry.currentIndex >= furry.path.length - 1) {
                    scene.remove(furry.mesh);
                    furry.mesh.traverse(child => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    window.activeFurries.splice(i, 1);
                    continue;
                }
                
                const p1 = furry.path[furry.currentIndex];
                const p2 = furry.path[furry.currentIndex + 1];
                
                if (!p1 || !p2) {
                    scene.remove(furry.mesh);
                    window.activeFurries.splice(i, 1);
                    continue;
                }
                
                const dist = p1.distanceTo(p2);
                furry.progress += furry.speed / Math.max(0.01, dist);
                
                const progress = Math.min(1.0, furry.progress);
                const x = (1 - progress) * p1.x + progress * p2.x;
                const z = (1 - progress) * p1.z + progress * p2.z;
                
                const worldX = x * TILE_SPACING;
                const worldZ = z * TILE_SPACING;
                
                let targetY = 0.1;
                let pathValid = true;
                let closestTile = null;
                let minDistance = Infinity;
                
                for (const node of furry.originalPath) {
                    const tile = activeTiles[node.x]?.[node.z];
                    if (!tile || tile.type !== 'road') {
                        pathValid = false;
                        break;
                    }
                    const distToTile = Math.hypot(x - node.x, z - node.z);
                    if (distToTile < minDistance) {
                        minDistance = distToTile;
                        closestTile = tile;
                    }
                }
                
                if (!pathValid) {
                    scene.remove(furry.mesh);
                    furry.mesh.traverse(child => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        }
                    });
                    window.activeFurries.splice(i, 1);
                    continue;
                }
                
                if (closestTile) {
                    targetY = closestTile.mesh.position.y + 0.1;
                }
                
                const currentY = furry.mesh.position.y;
                const newY = currentY + (targetY - currentY) * 0.2;
                
                
                const bobOffset = Math.abs(Math.sin(Date.now() * 0.01 + furry.bobSeed)) * 0.03;
                furry.mesh.position.set(worldX, newY + bobOffset, worldZ);
                
                
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                if (dx !== 0 || dz !== 0) {
                    const targetAngle = Math.atan2(dx, dz);
                    let diff = targetAngle - furry.mesh.rotation.y;
                    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                    furry.mesh.rotation.y += diff * 0.2;
                }
                
                
                if (furry.mesh) {
                    const cycle = Date.now() * 0.015 + furry.bobSeed;
                    
                    
                    const head = furry.mesh.getObjectByName("head");
                    if (head) {
                        head.rotation.z = Math.sin(cycle * 0.5) * 0.04;
                    }
                    
                    
                    const tail = furry.mesh.getObjectByName("tail");
                    if (tail) {
                        const tailSeg1 = tail.getObjectByName("tailSeg1");
                        if (tailSeg1) {
                            
                            tailSeg1.rotation.z = Math.sin(cycle * 0.8) * 0.25;
                            const tailSeg2 = tailSeg1.getObjectByName("tailSeg2");
                            if (tailSeg2) {
                                tailSeg2.rotation.z = Math.sin(cycle * 0.8 - 0.4) * 0.2;
                                const tailSeg3 = tailSeg2.getObjectByName("tailSeg3");
                                if (tailSeg3) {
                                    tailSeg3.rotation.z = Math.sin(cycle * 0.8 - 0.8) * 0.15;
                                }
                            }
                        } else {
                            
                            tail.rotation.z = Math.sin(cycle * 0.8) * 0.25;
                        }
                    }
                    
                    
                    const leftLeg = furry.mesh.getObjectByName("leftLeg");
                    if (leftLeg) {
                        
                        leftLeg.rotation.x = Math.sin(cycle) * 0.45;
                        
                        
                        const leftLowerLeg = leftLeg.getObjectByName("leftLowerLeg");
                        if (leftLowerLeg) {
                            leftLowerLeg.rotation.x = Math.max(0, -Math.sin(cycle)) * 0.5;
                        }
                        
                        
                        const leftFoot = leftLeg.getObjectByName("leftFoot");
                        if (leftFoot) {
                            leftFoot.rotation.x = Math.sin(cycle + 0.5) * 0.1;
                        }
                    }
                    
                    const rightLeg = furry.mesh.getObjectByName("rightLeg");
                    if (rightLeg) {
                        
                        rightLeg.rotation.x = -Math.sin(cycle) * 0.45;
                        
                        
                        const rightLowerLeg = rightLeg.getObjectByName("rightLowerLeg");
                        if (rightLowerLeg) {
                            rightLowerLeg.rotation.x = Math.max(0, Math.sin(cycle)) * 0.5;
                        }
                        
                        
                        const rightFoot = rightLeg.getObjectByName("rightFoot");
                        if (rightFoot) {
                            rightFoot.rotation.x = -Math.sin(cycle + 0.5) * 0.1;
                        }
                    }
                    
                    
                    const leftArm = furry.mesh.getObjectByName("leftArm");
                    if (leftArm) {
                        
                        leftArm.rotation.x = -Math.sin(cycle) * 0.3;
                        
                        leftArm.rotation.z = 0.12 + Math.abs(Math.sin(cycle)) * 0.05;
                        
                        
                        const leftLowerArm = leftArm.getObjectByName("leftLowerArm");
                        if (leftLowerArm) {
                            leftLowerArm.rotation.x = -0.2 - Math.max(0, Math.sin(cycle)) * 0.2;
                        }
                    }
                    
                    const rightArm = furry.mesh.getObjectByName("rightArm");
                    if (rightArm) {
                        
                        rightArm.rotation.x = Math.sin(cycle) * 0.3;
                        
                        rightArm.rotation.z = -0.12 - Math.abs(Math.sin(cycle)) * 0.05;
                        
                        
                        const rightLowerArm = rightArm.getObjectByName("rightLowerArm");
                        if (rightLowerArm) {
                            rightLowerArm.rotation.x = -0.2 - Math.max(0, -Math.sin(cycle)) * 0.2;
                        }
                    }
                }
                
                if (furry.progress >= 1.0) {
                    furry.currentIndex++;
                    furry.progress = 0.0;
                }
            } catch (err) {
                console.error("Error in furry animation:", err);
                scene.remove(furry.mesh);
                window.activeFurries.splice(i, 1);
            }
        }
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}
