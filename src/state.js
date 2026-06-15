
export const state = {
    odometer: 0.0,
    resources: {
        minerals: 10.0,
        steel: 10.0,
        energy: 5.0,
        water: 5.0
    },
    tokens: 120,
    happiness: 85,
    happinessTrend: 0.0,
    rates: {
        minerals: 0.0,
        steel: 0.0,
        energy: 0.0,
        water: 0.0,
        tokens: 0.0,
        happiness: 0.0
    },
    selectedTile: null, 
    currentTool: 'select', 
    isPainting: false,
    paintedThisDrag: new Set(),
};


export const BUILD_CONFIGS = {
    road: {
        name: 'Rodovia Virtual',
        cost: { minerals: 2.0, steel: 0.0, energy: 0.0, water: 0.0 },
        happinessBonus: 0,
        color: 0x64748b,
        icon: '🛣️'
    },
    hospital: {
        name: 'Hospital',
        cost: { minerals: 1.0, steel: 3.0, energy: 1.0, water: 1.0 },
        happinessBonus: 2,
        color: 0xfbb6ce,
        icon: '🏥'
    },
    floresta: {
        name: 'Área de Floresta',
        cost: { minerals: 1.0, steel: 0.0, energy: 0.0, water: 2.0 },
        happinessBonus: 1,
        color: 0x34d399,
        icon: '🌳'
    },
    usina: {
        name: 'Usina de Energia',
        cost: { minerals: 3.0, steel: 2.0, energy: 0.0, water: 0.0 },
        happinessBonus: 1,
        color: 0xfde68a,
        icon: '⚡'
    },
    fabrica: {
        name: 'Fábrica de Asfalto',
        cost: { minerals: 2.0, steel: 4.0, energy: 1.0, water: 0.0 },
        happinessBonus: 0,
        color: 0xa5b4fc,
        icon: '🏭'
    },
    mina: {
        name: 'Mina de Minerais',
        cost: { minerals: 0.0, steel: 3.0, energy: 1.0, water: 0.0 },
        happinessBonus: 0,
        color: 0xd97706,
        icon: '⛏️'
    },
    agua: {
        name: 'Poço de Água',
        cost: { minerals: 2.0, steel: 2.0, energy: 1.0, water: 0.0 },
        happinessBonus: 2,
        color: 0x7dd3fc,
        icon: '💧'
    },
    predio: {
        name: 'Prédio Urbano',
        cost: { minerals: 2.0, steel: 2.0, energy: 1.0, water: 1.0 },
        happinessBonus: 1,
        color: 0x94a3b8,
        icon: '🏢'
    },
    cinema: {
        name: 'Cinema Cozy',
        cost: { minerals: 3.0, steel: 3.0, energy: 2.0, water: 0.0 },
        happinessBonus: 1,
        color: 0xf43f5e,
        icon: '🎬'
    }
};


export const EVENTS = [
    { text: "Trecho de rodovia recapeado com sucesso! (+3% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 3); } },
    { text: "Acidente leve detectado! Socorro SOS acionado rapidamente.", effect: () => {} },
    { text: "Capivaras avistadas próximas à pista! Risco de atropelamento. (-2% Felicidade)", effect: () => { state.happiness = Math.max(0, state.happiness - 2); } },
    { text: "Motorista elogiou o novo asfalto nas redes sociais! (+2% Felicidade)", effect: () => { state.happiness = Math.min(100, state.happiness + 2); } }
];


export function updateHUD() {
    document.getElementById('odometer-value').textContent = `${state.odometer.toFixed(1)} km`;
    
    const trend = state.happinessTrend || 0.0;
    let trendHTML = '';
    if (trend > 0.005) {
        trendHTML = ` <small style="font-size: 0.7rem; color: #10b981; font-weight: 800;">(+${trend.toFixed(2)}/s)</small>`;
    } else if (trend < -0.005) {
        trendHTML = ` <small style="font-size: 0.7rem; color: #ef4444; font-weight: 800;">(${trend.toFixed(2)}/s)</small>`;
    } else {
        trendHTML = ` <small style="font-size: 0.7rem; color: var(--text-muted); font-weight: 800;">(0.00/s)</small>`;
    }
    const happinessVal = document.getElementById('happiness-value');
    if (happinessVal) {
        happinessVal.innerHTML = `${Math.round(state.happiness)}%${trendHTML}`;
    }

    const happinessBar = document.getElementById('happiness-bar');
    if (happinessBar) {
        happinessBar.style.width = `${state.happiness}%`;
    }

    const tokenVal = document.getElementById('token-value');
    if (tokenVal) {
        tokenVal.textContent = state.tokens;
    }

    
    const getRateHTML = (rate, unitPerSecond = true) => {
        if (rate > 0) {
            return ` <span style="font-size: 0.75rem; color: #10b981; font-weight: 800;">(+${rate.toFixed(1)}${unitPerSecond ? '/s' : ''})</span>`;
        }
        return ` <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">(0.0${unitPerSecond ? '/s' : ''})</span>`;
    };

    const mineralsRate = state.rates?.minerals || 0.0;
    const steelRate = state.rates?.steel || 0.0;
    const energyRate = state.rates?.energy || 0.0;
    const waterRate = state.rates?.water || 0.0;
    const tokensRate = state.rates?.tokens || 0.0;

    document.getElementById('minerals-value').innerHTML = `${state.resources.minerals.toFixed(1)} <small>t</small>${getRateHTML(mineralsRate)}`;
    document.getElementById('steel-value').innerHTML = `${state.resources.steel.toFixed(1)} <small>t</small>${getRateHTML(steelRate)}`;
    document.getElementById('energy-value').innerHTML = `${state.resources.energy.toFixed(1)} <small>MW</small>${getRateHTML(energyRate)}`;
    document.getElementById('water-value').innerHTML = `${state.resources.water.toFixed(1)} <small>m³</small>${getRateHTML(waterRate)}`;

    
    const tokensResVal = document.getElementById('tokens-resource-value');
    if (tokensResVal) {
        tokensResVal.innerHTML = `${state.tokens}${getRateHTML(tokensRate)}`;
    }

    
    const happinessResVal = document.getElementById('happiness-resource-value');
    if (happinessResVal) {
        let hapRateHTML = '';
        if (trend > 0.005) {
            hapRateHTML = ` <span style="font-size: 0.75rem; color: #10b981; font-weight: 800;">(+${trend.toFixed(2)}/s)</span>`;
        } else if (trend < -0.005) {
            hapRateHTML = ` <span style="font-size: 0.75rem; color: #ef4444; font-weight: 800;">(${trend.toFixed(2)}/s)</span>`;
        } else {
            hapRateHTML = ` <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">(0.00/s)</span>`;
        }
        happinessResVal.innerHTML = `${Math.round(state.happiness)}%${hapRateHTML}`;
    }

    
    const happinessItem = document.getElementById('resource-happiness');
    if (happinessItem) {
        const iconEl = happinessItem.querySelector('.res-icon');
        if (iconEl) {
            const interpolateColor = (color1, color2, factor) => {
                const r1 = parseInt(color1.substring(1, 3), 16);
                const g1 = parseInt(color1.substring(3, 5), 16);
                const b1 = parseInt(color1.substring(5, 7), 16);

                const r2 = parseInt(color2.substring(1, 3), 16);
                const g2 = parseInt(color2.substring(3, 5), 16);
                const b2 = parseInt(color2.substring(5, 7), 16);

                const r = Math.round(r1 + factor * (r2 - r1));
                const g = Math.round(g1 + factor * (g2 - g1));
                const b = Math.round(b1 + factor * (b2 - b1));

                return `rgb(${r}, ${g}, ${b})`;
            };

            const factor = Math.max(0, Math.min(100, state.happiness)) / 100;
            const gray = "#cbd5e1"; // Pastel Gray at 0%
            const c1 = interpolateColor(gray, "#ffb7b2", factor); // Red/Pink
            const c2 = interpolateColor(gray, "#ffe596", factor); 
            const c3 = interpolateColor(gray, "#a3f3c8", factor); 
            const c4 = interpolateColor(gray, "#9ad5ff", factor); 
            const c5 = interpolateColor(gray, "#d8b4fe", factor); 

            iconEl.style.background = `linear-gradient(135deg, ${c1}, ${c2}, ${c3}, ${c4}, ${c5})`;
        }
    }

    const happinessCard = document.querySelector('.stat-card.happiness');
    if (happinessCard) {
        if (state.happiness < 80) {
            happinessCard.style.borderColor = 'var(--color-danger)';
            happinessCard.style.background = 'rgba(255, 158, 158, 0.15)';
        } else {
            happinessCard.style.borderColor = '';
            happinessCard.style.background = '';
        }
    }
}


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


export function simulateGPSTravel() {
    state.odometer += 5.0;

    const addMinerals = parseFloat((Math.random() * 2 + 1).toFixed(1));
    const addSteel = parseFloat((Math.random() * 1 + 0.5).toFixed(1));
    const addEnergy = parseFloat((Math.random() * 1.5 + 0.8).toFixed(1));
    const addWater = parseFloat((Math.random() * 1.2 + 0.6).toFixed(1));

    state.resources.minerals += addMinerals;
    state.resources.steel += addSteel;
    state.resources.energy += addEnergy;
    state.resources.water += addWater;

    let toastMessage = `Viagem de +5.0 km concluída! Recursos coletados.`;
    
    if (Math.random() < 0.35) {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        ev.effect();
        toastMessage = `${ev.text} | Insumos adicionados!`;
    }

    updateHUD();
    
    
    if (state.selectedTile && window.refreshSelectedTileInfo) {
        window.refreshSelectedTileInfo();
    }

    showToast(toastMessage, "success");
}
