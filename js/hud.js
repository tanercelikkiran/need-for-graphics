// hud.js — HUD updates: speedometer, turbo gauge, help screen.
// Consumes vehicle state from state.js and speed utility from vehicle.js.

import { vehicle } from "./state.js";
import { getXZSpeed } from "./vehicle.js";

// Cache DOM references (avoid getElementById every frame)
const speedValue = document.getElementById('speed-value');
const speedSliderFill = document.getElementById('speed-slider-fill');
const turboValue = document.getElementById('turbo-value');
const turboSliderFill = document.getElementById('turbo-slider-fill');
const helpScreen = document.getElementById('help-screen');
const helpText = document.getElementById('help-content');

export function updateSpeedometer() {
    const speed = getXZSpeed(vehicle.chassisBody);  // XZ duzlemindeki hiz
    const speedKmH = Math.round(speed * 3.6);  // m/s'den km/h'ye donusum (3.6 ile carp)
    speedValue.textContent = `Speed ${speedKmH}KM`;
}

export function updateSpeedSlider() {
    const speed = getXZSpeed(vehicle.chassisBody);  // XZ duzlemindeki hiz
    const tSpeed = 304 / 3.6;
    const fillPercentage = (speed / tSpeed) * 100;
    speedSliderFill.style.width = `${fillPercentage}%`;
}

export function updateTurbometer(turboLevel) {
    turboValue.textContent = `Turbo ${turboLevel.toFixed(0)}%`;
}

export function updateTurboSlider(turboLevel) {
    turboSliderFill.style.width = `${turboLevel}%`;
}

export function showHelpScreen() {
    helpScreen.style.display = 'flex';
    helpText.style.display = 'flex';
}

export function hideHelpScreen() {
    helpScreen.style.display = 'none';
}

export function setupHelpInput(signal) {
    document.addEventListener('keydown', (h) => {
        if (h.key.toLowerCase() === 'h') {
            if (helpScreen.style.display === 'none') {
                showHelpScreen();
            } else {
                hideHelpScreen();
            }
        }
    }, { signal });
}
