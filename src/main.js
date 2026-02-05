/**
 * Birding Weather Dashboard - Main Entry Point
 */

import store from './state/store.js';
import { initializeLocation, setLocation } from './modules/geolocation.js';
import { fetchWeatherForecast, getWeatherDescription } from './api/openMeteo.js';
import { fetchNearbyHotspots } from './api/ebird.js';
import {
    scoreHawkWatch,
    scoreSeabirding,
    assessFalloutRisk,
    analyzePressureTrend,
    detectFrontPassage
} from './config/birdingConditions.js';
import {
    formatTemperature,
    formatWindSpeed,
    formatWindDirection,
    formatPressure,
    formatVisibility,
    formatTime,
    formatRelativeTime,
    formatCountdown,
    convertWindSpeed
} from './utils/formatting.js';
import { REFRESH_INTERVAL_SECONDS } from './config/constants.js';

// DOM Elements
const elements = {
    locationName: document.getElementById('location-name'),
    lastUpdate: document.getElementById('last-update'),
    countdown: document.getElementById('countdown'),
    refreshBtn: document.getElementById('refresh-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettings: document.getElementById('close-settings'),
    saveSettings: document.getElementById('save-settings'),

    // Current conditions
    currentTemp: document.getElementById('current-temp'),
    currentConditions: document.getElementById('current-conditions'),
    currentHumidity: document.getElementById('current-humidity'),

    // Scores
    hawkScore: document.getElementById('hawk-score'),
    hawkDetails: document.getElementById('hawk-details'),
    seabirdScore: document.getElementById('seabird-score'),
    seabirdDetails: document.getElementById('seabird-details'),

    // Wind
    windSpeed: document.getElementById('wind-speed'),
    windDirection: document.getElementById('wind-direction'),
    windGusts: document.getElementById('wind-gusts'),
    windArrow: document.getElementById('wind-arrow'),

    // Visibility
    visibilityValue: document.getElementById('visibility-value'),
    visibilityFog: document.getElementById('visibility-fog'),
    falloutRisk: document.getElementById('fallout-risk'),

    // Pressure
    pressureValue: document.getElementById('pressure-value'),
    pressureTrend: document.getElementById('pressure-trend'),
    pressureChart: document.getElementById('pressure-chart'),

    // Precipitation
    precipTimeline: document.getElementById('precip-timeline'),

    // Alerts
    frontAlert: document.getElementById('front-alert'),
    frontAlertMessage: document.getElementById('front-alert-message'),

    // Map & Hotspots
    map: document.getElementById('map'),
    hotspots: document.getElementById('hotspots'),

    // Settings form
    ebirdApiKey: document.getElementById('ebird-api-key'),
    tempUnit: document.getElementById('temp-unit'),
    speedUnit: document.getElementById('speed-unit'),
    pressureUnit: document.getElementById('pressure-unit')
};

let map = null;
let userMarker = null;
let hotspotMarkers = [];

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing Birding Weather Dashboard...');

    // Set up event listeners
    setupEventListeners();

    // Apply saved theme
    applyTheme();

    // Load settings into form
    loadSettingsForm();

    // Initialize location
    const hasLocation = await initializeLocation();

    if (hasLocation) {
        await loadWeatherData();
        await loadHotspots();
        initMap();
    } else {
        elements.locationName.textContent = 'Location unavailable - please enable location services';
    }

    // Start refresh timer
    startRefreshTimer();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Refresh button
    elements.refreshBtn.addEventListener('click', handleRefresh);

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Settings modal
    elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.add('visible');
    });

    elements.closeSettings.addEventListener('click', () => {
        elements.settingsModal.classList.remove('visible');
    });

    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            elements.settingsModal.classList.remove('visible');
        }
    });

    elements.saveSettings.addEventListener('click', saveSettings);

    // Subscribe to store changes
    store.subscribe('locationName', (name) => {
        elements.locationName.textContent = name || 'Unknown location';
    });

    store.subscribe('nightModeEnabled', applyTheme);
}

/**
 * Load weather data from API
 */
async function loadWeatherData() {
    const lat = store.get('userLat');
    const lon = store.get('userLon');

    if (!lat || !lon) return;

    store.set('isLoading', true);

    const { data, error } = await fetchWeatherForecast(lat, lon);

    if (error) {
        console.error('Failed to fetch weather:', error);
        store.set('error', error.message);
        store.set('isLoading', false);
        return;
    }

    // Store data
    store.update({
        currentWeather: data.current,
        hourlyForecast: data.hourlyForecast,
        pressureHistory: data.pressureHistory,
        lastFetchTime: new Date(),
        isLoading: false,
        error: null
    });

    // Calculate birding conditions
    calculateBirdingConditions(data);

    // Update UI
    renderWeatherData(data);
}

/**
 * Calculate birding-specific scores
 */
function calculateBirdingConditions(weatherData) {
    const { current, pressureHistory, tempHistory, precipLast6h } = weatherData;

    // Convert wind speed to mph for scoring
    const windSpeedMph = convertWindSpeed(current.windSpeed, 'mph');

    // Hawk watch score
    const hawkWatch = scoreHawkWatch(
        current.windDirection,
        windSpeedMph,
        current.visibility
    );
    store.set('hawkWatchScore', hawkWatch);

    // Seabird score
    const seabird = scoreSeabirding(
        current.windDirection,
        windSpeedMph,
        precipLast6h
    );
    store.set('seabirdScore', seabird);

    // Pressure trend
    const pressure = analyzePressureTrend(pressureHistory);
    store.set('pressureTrend', pressure);

    // Fallout risk
    const fallout = assessFalloutRisk(
        current.visibility,
        current.humidity,
        precipLast6h,
        pressure.trend
    );
    store.set('falloutRisk', fallout);

    // Front passage
    const front = detectFrontPassage(pressureHistory, tempHistory);
    store.set('frontPassageAlert', front);
}

/**
 * Render weather data to UI
 */
function renderWeatherData(weatherData) {
    const { current, hourlyForecast } = weatherData;

    // Current conditions
    elements.currentTemp.textContent = formatTemperature(current.temperature);
    elements.currentConditions.textContent = getWeatherDescription(current.weatherCode);
    elements.currentHumidity.textContent = `Humidity: ${current.humidity}%`;

    // Wind
    elements.windSpeed.textContent = formatWindSpeed(current.windSpeed);
    elements.windDirection.textContent = `Direction: ${formatWindDirection(current.windDirection)}`;
    elements.windGusts.textContent = `Gusts: ${formatWindSpeed(current.windGusts)}`;

    // Wind arrow rotation (point in direction wind is coming FROM)
    const rotation = current.windDirection + 180;
    elements.windArrow.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;

    // Visibility
    elements.visibilityValue.textContent = formatVisibility(current.visibility);
    const isFoggy = current.weatherCode === 45 || current.weatherCode === 48;
    elements.visibilityFog.textContent = isFoggy ? 'Foggy conditions' : '';

    // Fallout risk
    const fallout = store.get('falloutRisk');
    if (fallout) {
        const riskClass = `fallout-${fallout.level}`;
        elements.falloutRisk.innerHTML = `Fallout risk: <span class="${riskClass}">${fallout.level}</span>`;
    }

    // Pressure
    elements.pressureValue.textContent = formatPressure(current.pressure);
    const pressureTrend = store.get('pressureTrend');
    if (pressureTrend) {
        elements.pressureTrend.textContent = pressureTrend.description;
    }

    // Render pressure chart
    renderPressureChart();

    // Render precipitation timeline
    renderPrecipTimeline(hourlyForecast);

    // Render scores
    renderScores();

    // Front alert
    renderFrontAlert();

    // Last update
    elements.lastUpdate.textContent = `Updated ${formatRelativeTime(new Date())}`;
}

/**
 * Render birding scores
 */
function renderScores() {
    const hawkWatch = store.get('hawkWatchScore');
    const seabird = store.get('seabirdScore');

    if (hawkWatch) {
        const scoreEl = elements.hawkScore;
        scoreEl.querySelector('.score__value').textContent = hawkWatch.score;
        scoreEl.querySelector('.score__rating').textContent = hawkWatch.rating;
        scoreEl.className = `score score--${hawkWatch.rating.toLowerCase()}`;
        elements.hawkDetails.textContent = hawkWatch.details[0] || '';
    }

    if (seabird) {
        const scoreEl = elements.seabirdScore;
        scoreEl.querySelector('.score__value').textContent = seabird.score;
        scoreEl.querySelector('.score__rating').textContent = seabird.rating;
        scoreEl.className = `score score--${seabird.rating.toLowerCase()}`;
        elements.seabirdDetails.textContent = seabird.details[0] || '';
    }
}

/**
 * Render pressure chart
 */
function renderPressureChart() {
    const history = store.get('pressureHistory') || [];
    if (history.length === 0) return;

    const pressures = history.map(h => h.pressure);
    const min = Math.min(...pressures);
    const max = Math.max(...pressures);
    const range = max - min || 1;

    elements.pressureChart.innerHTML = pressures.map(p => {
        const height = ((p - min) / range) * 50 + 10; // 10-60px height
        return `<div class="pressure-chart__bar" style="height: ${height}px;"></div>`;
    }).join('');
}

/**
 * Render precipitation timeline
 */
function renderPrecipTimeline(forecast) {
    const next12 = forecast.slice(0, 12);

    elements.precipTimeline.innerHTML = next12.map((hour, i) => {
        const prob = hour.precipProbability || 0;
        const height = Math.max(prob * 0.5, 2); // 2-50px based on probability
        const time = new Date(hour.time);
        const label = i % 3 === 0 ? formatTime(time) : '';

        return `
            <div class="precip-timeline__hour">
                <div class="precip-timeline__bar" style="height: ${height}px;" title="${prob}%"></div>
                <span class="precip-timeline__label">${label}</span>
            </div>
        `;
    }).join('');
}

/**
 * Render front passage alert
 */
function renderFrontAlert() {
    const front = store.get('frontPassageAlert');

    if (front && front.detected) {
        elements.frontAlertMessage.textContent = front.message;
        elements.frontAlert.classList.remove('hidden');
        elements.frontAlert.className = `alert alert--${front.birdingImpact === 'positive' ? 'success' : 'warning'}`;
    } else {
        elements.frontAlert.classList.add('hidden');
    }
}

/**
 * Load nearby hotspots
 */
async function loadHotspots() {
    const lat = store.get('userLat');
    const lon = store.get('userLon');
    const apiKey = store.get('ebirdApiKey');

    if (!lat || !lon || !apiKey) {
        elements.hotspots.innerHTML = apiKey
            ? ''
            : '<p style="color: var(--color-text-secondary);">Add your eBird API key in settings to see nearby hotspots</p>';
        return;
    }

    const { data, error } = await fetchNearbyHotspots(lat, lon);

    if (error) {
        console.warn('Failed to fetch hotspots:', error);
        return;
    }

    store.set('nearbyHotspots', data);
    renderHotspots(data);
    updateMapHotspots(data);
}

/**
 * Render hotspot cards
 */
function renderHotspots(hotspots) {
    if (!hotspots || hotspots.length === 0) {
        elements.hotspots.innerHTML = '';
        return;
    }

    const top6 = hotspots.slice(0, 6);

    elements.hotspots.innerHTML = top6.map(h => `
        <div class="hotspot-card" data-lat="${h.lat}" data-lon="${h.lon}" data-name="${h.name}">
            <div class="hotspot-card__name">${h.name}</div>
            <div class="hotspot-card__species">${h.speciesCount || '?'} species</div>
        </div>
    `).join('');

    // Add click handlers
    elements.hotspots.querySelectorAll('.hotspot-card').forEach(card => {
        card.addEventListener('click', () => {
            const lat = parseFloat(card.dataset.lat);
            const lon = parseFloat(card.dataset.lon);
            const name = card.dataset.name;

            // Center map on hotspot
            if (map) {
                map.setView([lat, lon], 14);
            }

            // Could also fetch weather for this location
            // setLocation(lat, lon, name);
            // loadWeatherData();
        });
    });
}

/**
 * Initialize Leaflet map
 */
function initMap() {
    const lat = store.get('userLat');
    const lon = store.get('userLon');

    if (!lat || !lon) return;

    map = L.map('map').setView([lat, lon], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Add user marker
    userMarker = L.marker([lat, lon], {
        title: 'Your Location'
    }).addTo(map);

    userMarker.bindPopup('Your Location').openPopup();
}

/**
 * Update map with hotspot markers
 */
function updateMapHotspots(hotspots) {
    if (!map) return;

    // Clear existing markers
    hotspotMarkers.forEach(m => map.removeLayer(m));
    hotspotMarkers = [];

    // Add new markers
    hotspots.forEach(h => {
        const marker = L.marker([h.lat, h.lon], {
            title: h.name
        }).addTo(map);

        marker.bindPopup(`
            <strong>${h.name}</strong><br>
            ${h.speciesCount || '?'} species
        `);

        hotspotMarkers.push(marker);
    });
}

/**
 * Refresh timer
 */
let countdownInterval = null;
let countdownSeconds = REFRESH_INTERVAL_SECONDS;

function startRefreshTimer() {
    countdownSeconds = REFRESH_INTERVAL_SECONDS;
    updateCountdownDisplay();

    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        countdownSeconds--;
        updateCountdownDisplay();

        if (countdownSeconds <= 0) {
            handleRefresh();
        }
    }, 1000);
}

function updateCountdownDisplay() {
    elements.countdown.textContent = `Refresh in ${formatCountdown(countdownSeconds)}`;
}

/**
 * Handle refresh
 */
async function handleRefresh() {
    countdownSeconds = REFRESH_INTERVAL_SECONDS;
    await loadWeatherData();
    await loadHotspots();
}

/**
 * Theme management
 */
function applyTheme() {
    const nightMode = store.get('nightModeEnabled');
    document.body.classList.toggle('night-mode', nightMode);
    elements.themeToggle.querySelector('.theme-icon').textContent = nightMode ? '☀️' : '🌙';
}

function toggleTheme() {
    const current = store.get('nightModeEnabled');
    store.set('nightModeEnabled', !current);
}

/**
 * Settings management
 */
function loadSettingsForm() {
    elements.ebirdApiKey.value = store.get('ebirdApiKey') || '';
    elements.tempUnit.value = store.get('tempUnit') || 'F';
    elements.speedUnit.value = store.get('speedUnit') || 'mph';
    elements.pressureUnit.value = store.get('pressureUnit') || 'inHg';
}

function saveSettings() {
    store.update({
        ebirdApiKey: elements.ebirdApiKey.value.trim(),
        tempUnit: elements.tempUnit.value,
        speedUnit: elements.speedUnit.value,
        pressureUnit: elements.pressureUnit.value
    });

    elements.settingsModal.classList.remove('visible');

    // Reload data with new settings
    handleRefresh();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
