import { state, updateHUD, simulateGPSTravel, showToast } from './src/state.js';
import { initScene } from './src/scene.js';
import { createGrid, tiles, updateTileSelectionInfo, isTileConnectedToRoad, updateCarSpawning, buildStructureMesh, updateNeighborRoadMeshes, updateFurrySpawning } from './src/grid.js';
import { initInput, initTouch } from './src/input.js';

function saveGameToServer() {
    if (!tiles || tiles.length === 0) return;
    const tilesData = [];
    for (let x = 0; x < tiles.length; x++) {
        const row = [];
        for (let z = 0; z < tiles[x].length; z++) {
            const t = tiles[x][z];
            row.push({
                x: t.x,
                z: t.z,
                type: t.type,
                originalType: t.originalType
            });
        }
        tilesData.push(row);
    }

    const payload = {
        odometer: state.odometer,
        resources: state.resources,
        tokens: state.tokens,
        happiness: state.happiness,
        happinessTrend: state.happinessTrend,
        tiles: tilesData
    };

    try {
        localStorage.setItem('transitopia_state', JSON.stringify(payload));
    } catch (e) {
        console.error("Erro ao salvar progresso localmente:", e);
    }

    fetch('/api/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .catch(err => console.error("Erro ao salvar progresso no servidor:", err));
}

function applyLoadedState(s) {
    if (!s) return;
    state.odometer = s.odometer;
    state.resources = s.resources;
    state.tokens = s.tokens;
    state.happiness = s.happiness;
    state.happinessTrend = s.happinessTrend;

    if (s.tiles) {
        for (let x = 0; x < s.tiles.length; x++) {
            for (let z = 0; z < s.tiles[x].length; z++) {
                const loadedTile = s.tiles[x][z];
                const localTile = tiles[x]?.[z];
                if (localTile) {
                    if (localTile.builtStructure) {
                        localTile.mesh.remove(localTile.builtStructure);
                        localTile.builtStructure = null;
                    }
                    localTile.type = loadedTile.type;
                    localTile.originalType = loadedTile.originalType;

                    if (['road', 'hospital', 'floresta', 'usina', 'fabrica', 'mina', 'agua', 'predio', 'cinema', 'mountain'].includes(localTile.type)) {
                        buildStructureMesh(localTile, localTile.type);
                    }
                }
            }
        }
        
        for (let x = 0; x < tiles.length; x++) {
            for (let z = 0; z < tiles[x].length; z++) {
                if (tiles[x][z].type === 'road') {
                    buildStructureMesh(tiles[x][z], 'road');
                }
            }
        }
    }

    updateHUD();
}

function loadGameFromServer() {
    fetch('/api/load')
    .then(res => res.json())
    .then(data => {
        if (data.state) {
            applyLoadedState(data.state);
            showToast("Progresso carregado do servidor!", "success");
        } else {
            const localData = localStorage.getItem('transitopia_state');
            if (localData) {
                try {
                    const localState = JSON.parse(localData);
                    applyLoadedState(localState);
                    showToast("Progresso carregado localmente!", "success");
                } catch (e) {
                    console.error("Erro ao analisar localStorage:", e);
                }
            }
        }
    })
    .catch(err => {
        console.error("Erro ao carregar progresso do servidor:", err);
        const localData = localStorage.getItem('transitopia_state');
        if (localData) {
            try {
                const localState = JSON.parse(localData);
                applyLoadedState(localState);
                showToast("Progresso carregado localmente (Offline)!", "success");
            } catch (e) {
                console.error("Erro ao analisar localStorage:", e);
            }
        }
    });
}

window.saveGameToServer = saveGameToServer;

function init() {
    const mainContainer = document.getElementById('canvas-container');
    
    
    initScene(mainContainer, tiles);

    
    createGrid();

    
    loadGameFromServer();

    
    initInput(mainContainer);
    initTouch(mainContainer);

    
    document.getElementById('simulate-gps-btn').addEventListener('click', () => {
        simulateGPSTravel();
        saveGameToServer();
    });

    
    const shopModal = document.getElementById('shop-modal');
    const openShopBtn = document.getElementById('open-shop-btn');
    const closeShopBtn = document.getElementById('close-shop-btn');
    
    function updateShopStatus() {
        const statusBar = document.getElementById('shop-status-bar');
        const redeemBtns = document.querySelectorAll('.shop-redeem-btn');
        const currentHappiness = Math.round(state.happiness);
        
        if (currentHappiness >= 80) {
            statusBar.className = 'shop-status-bar status-success';
            statusBar.innerHTML = `<span>🟢 Resgate Concedido! Cidadãos felizes (${currentHappiness}%).</span> <span>Saldo: ${state.tokens} Tokens</span>`;
        } else {
            statusBar.className = 'shop-status-bar status-blocked';
            statusBar.innerHTML = `<span>🔴 Resgate Bloqueado! A felicidade dos cidadãos deve ser ≥ 80% (atual: ${currentHappiness}%).</span> <span>Saldo: ${state.tokens} Tokens</span>`;
        }
        
        redeemBtns.forEach(btn => {
            const cost = parseInt(btn.dataset.cost);
            if (currentHappiness < 80 || state.tokens < cost) {
                btn.disabled = true;
            } else {
                btn.disabled = false;
            }
        });
    }

    openShopBtn.addEventListener('click', () => {
        shopModal.classList.remove('hidden');
        updateShopStatus();
    });

    closeShopBtn.addEventListener('click', () => {
        shopModal.classList.add('hidden');
    });

    shopModal.addEventListener('click', (e) => {
        if (e.target === shopModal) {
            shopModal.classList.add('hidden');
        }
    });

    const redeemBtns = document.querySelectorAll('.shop-redeem-btn');
    redeemBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cost = parseInt(btn.dataset.cost);
            const rewardName = btn.dataset.reward;
            const currentHappiness = Math.round(state.happiness);
            
            if (currentHappiness < 80) {
                showToast("Resgate bloqueado! Cidadãos infelizes. Aumente a felicidade para pelo menos 80%.", "danger");
                return;
            }
            if (state.tokens < cost) {
                showToast("Tokens insuficientes! Ganhe mais tokens gerenciando a rodovia.", "warning");
                return;
            }
            
            state.tokens -= cost;
            const couponCode = `ABCR-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            
            updateHUD();
            updateShopStatus();
            
            const rewardLabels = {
                semparar: "R$ 10 Crédito Sem Parar",
                conectcar: "R$ 10 Crédito ConectCar",
                combustivel: "R$ 15 Desconto Combustível",
                cafe: "Combo Café & Pão de Queijo"
            };
            const label = rewardLabels[rewardName] || "Recompensa";
            showToast(`Resgate efetuado: '${label}'! Cupom: ${couponCode}`, "success");
        });
    });

    
    document.getElementById('header-toggle-btn').addEventListener('click', () => {
        document.getElementById('header-wrapper').classList.toggle('collapsed');
    });
    document.getElementById('left-toggle-btn').addEventListener('click', () => {
        document.getElementById('left-wrapper').classList.toggle('collapsed');
    });
    document.getElementById('footer-toggle-btn').addEventListener('click', () => {
        document.getElementById('footer-wrapper').classList.toggle('collapsed');
    });

    
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTool = btn.dataset.tool;
            
            
            const canvas = document.getElementById('canvas-container');
            canvas.className = '';
            canvas.classList.add(`tool-${state.currentTool}`);
            
            
            if (state.currentTool !== 'select') {
                state.selectedTile = null;
                updateTileSelectionInfo(null);
            }
        });
    });

    
    updateHUD();

    let ticks = 0;
    
    setInterval(() => {
        ticks++;
        let produced = false;
        
        let mineralsCount = 0;
        let steelCount = 0;
        let energyCount = 0;
        let waterCount = 0;
        let tokensCount = 0;
        
        
        for (let x = 0; x < tiles.length; x++) {
            for (let z = 0; z < tiles[x].length; z++) {
                const tile = tiles[x][z];
                if (['mina', 'fabrica', 'usina', 'agua', 'predio'].includes(tile.type)) {
                    if (isTileConnectedToRoad(x, z)) {
                        produced = true;
                        
                        if (tile.type === 'mina') {
                            state.resources.minerals += 0.2;
                            mineralsCount++;
                        } else if (tile.type === 'fabrica') {
                            state.resources.steel += 0.2;
                            steelCount++;
                        } else if (tile.type === 'usina') {
                            state.resources.energy += 0.2;
                            energyCount++;
                        } else if (tile.type === 'agua') {
                            state.resources.water += 0.2;
                            waterCount++;
                        } else if (tile.type === 'predio') {
                            state.tokens += 1;
                            tokensCount++;
                        }
                    }
                }
            }
        }

        
        state.rates.minerals = mineralsCount * 0.2;
        state.rates.steel = steelCount * 0.2;
        state.rates.energy = energyCount * 0.2;
        state.rates.water = waterCount * 0.2;
        state.rates.tokens = tokensCount * 1.0;

        
        const predios = [];
        const amenities = [];
        
        for (let x = 0; x < tiles.length; x++) {
            for (let z = 0; z < tiles[x].length; z++) {
                const tile = tiles[x][z];
                if (tile.type === 'predio') {
                    if (isTileConnectedToRoad(x, z)) {
                        predios.push(tile);
                    }
                } else if (['hospital', 'floresta', 'cinema'].includes(tile.type)) {
                    if (isTileConnectedToRoad(x, z)) {
                        amenities.push(tile);
                    }
                }
            }
        }

        let totalHappinessDelta = 0.0;

        if (predios.length > 0) {
            predios.forEach(p => {
                let hDelta = -0.05; 

                
                predios.forEach(other => {
                    if (other.x === p.x && other.z === p.z) return;
                    const d = Math.sqrt((p.x - other.x) ** 2 + (p.z - other.z) ** 2);
                    if (d <= 6) {
                        hDelta -= 0.10 / d;
                    }
                });

                // Amenities benefits within radius 8
                amenities.forEach(a => {
                    const d = Math.sqrt((p.x - a.x) ** 2 + (p.z - a.z) ** 2);
                    if (d <= 8) {
                        const clampedD = Math.max(1.0, d);
                        if (a.type === 'hospital') {
                            hDelta += 0.30 / clampedD;
                        } else if (a.type === 'floresta') {
                            hDelta += 0.20 / clampedD;
                        } else if (a.type === 'cinema') {
                            hDelta += 0.25 / clampedD;
                        }
                    }
                });

                totalHappinessDelta += hDelta;
            });
            
            state.happinessTrend = totalHappinessDelta;
            state.rates.happiness = totalHappinessDelta;
            state.happiness = Math.max(0, Math.min(100, state.happiness + totalHappinessDelta));
        } else {
            state.happinessTrend = 0.0;
            state.rates.happiness = 0.0;
        }

        
        updateHUD();
        
        if (state.selectedTile) {
            const selTile = tiles[state.selectedTile.x][state.selectedTile.z];
            updateTileSelectionInfo(selTile);
        }

        if (shopModal && !shopModal.classList.contains('hidden')) {
            updateShopStatus();
        }

        
        if (ticks % 10 === 0) {
            saveGameToServer();
        }

        
        updateCarSpawning();
        
        updateFurrySpawning();
    }, 1000);
}

window.onload = init;
