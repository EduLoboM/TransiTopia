// --- Game State & Resources ---
export const state = {
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
    isPainting: false,
    paintedThisDrag: new Set(),
};

// Costs and stats for building
export const BUILD_CONFIGS = {
    road: {
        name: 'Rodovia Virtual',
        cost: { asphalt: 2.0, steel: 0.0, concrete: 0.0 },
        happinessBonus: 1,
        color: 0x64748b,
        icon: '🛣️'
    },
    hospital: {
        name: 'Hospital',
        cost: { asphalt: 0.0, steel: 2.0, concrete: 3.0 },
        happinessBonus: 15,
        color: 0xfbb6ce,
        icon: '🏥'
    },
    floresta: {
        name: 'Área de Floresta',
        cost: { asphalt: 0.0, steel: 0.0, concrete: 1.0 },
        happinessBonus: 10,
        color: 0x34d399,
        icon: '🌳'
    },
    usina: {
        name: 'Usina de Energia',
        cost: { asphalt: 0.0, steel: 3.0, concrete: 2.0 },
        happinessBonus: 8,
        color: 0xfde68a,
        icon: '⚡'
    },
    fabrica: {
        name: 'Fábrica Industrial',
        cost: { asphalt: 1.0, steel: 3.0, concrete: 2.0 },
        happinessBonus: 5,
        color: 0xa5b4fc,
        icon: '🏭'
    },
    mina: {
        name: 'Mina de Recursos',
        cost: { asphalt: 1.0, steel: 2.0, concrete: 1.0 },
        happinessBonus: 3,
        color: 0xd97706,
        icon: '⛏️'
    },
    agua: {
        name: 'Estação de Água',
        cost: { asphalt: 0.0, steel: 1.5, concrete: 2.5 },
        happinessBonus: 12,
        color: 0x7dd3fc,
        icon: '💧'
    },
    predio: {
        name: 'Prédio Urbano',
        cost: { asphalt: 0.0, steel: 2.0, concrete: 2.0 },
        happinessBonus: 6,
        color: 0x94a3b8,
        icon: '🏢'
    }
};

// --- Odometer Simulation Random Events ---
export const EVENTS = [
    { text: "Trecho de rodovia recapeado com sucesso! (+3% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 3); } },
    { text: "Acidente leve detectado! Socorro SOS acionado rapidamente.", effect: () => {} },
    { text: "Capivaras avistadas próximas à pista! Risco de atropelamento. (-2% Felicidade)", effect: () => { state.happiness = Math.max(0, state.happiness - 2); } },
    { text: "Motorista elogiou o novo asfalto nas redes sociais! (+2% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 2); } }
];

// --- HUD Updates ---
export function updateHUD() {
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
export function showToast(message, type = "success") {
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

// --- GPS simulated odometer logic ---
export function simulateGPSTravel() {
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
    
    // Request tile selection refresh dynamically if hook is available (avoid circular imports)
    if (state.selectedTile && window.refreshSelectedTileInfo) {
        window.refreshSelectedTileInfo();
    }

    showToast(toastMessage, "success");
}
