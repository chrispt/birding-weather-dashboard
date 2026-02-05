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
    scoreSongbirdMigration,
    scoreSongbirdActivity,
    scoreShorebirds,
    scoreWaterfowl,
    scoreOwling,
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
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettings: document.getElementById('close-settings'),
    saveSettings: document.getElementById('save-settings'),

    // Current conditions
    currentTemp: document.getElementById('current-temp'),
    currentConditions: document.getElementById('current-conditions'),
    currentHumidity: document.getElementById('current-humidity'),
    weatherIcon: document.getElementById('weather-icon'),

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

    // Location dropdown
    locationDropdownBtn: document.getElementById('location-dropdown-btn'),
    locationDropdown: document.getElementById('location-dropdown'),
    useCurrentLocation: document.getElementById('use-current-location'),
    recentLocations: document.getElementById('recent-locations'),
    recentDivider: document.getElementById('recent-divider'),
    recentLabel: document.getElementById('recent-label'),

    // Settings form
    ebirdApiKey: document.getElementById('ebird-api-key'),
    tempUnit: document.getElementById('temp-unit'),
    speedUnit: document.getElementById('speed-unit'),
    pressureUnit: document.getElementById('pressure-unit'),

    // Score details modal
    scoreModal: document.getElementById('score-details-modal'),
    closeScoreModal: document.getElementById('close-score-modal'),
    scoreModalTitle: document.getElementById('score-modal-title'),
    scoreModalValue: document.getElementById('score-modal-value'),
    scoreModalRating: document.getElementById('score-modal-rating'),
    scoreModalFactors: document.getElementById('score-modal-factors'),
    scoreModalTip: document.getElementById('score-modal-tip')
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

    // Load settings into form
    loadSettingsForm();

    // Initialize location (pass callback to reload data when GPS returns different location)
    const hasLocation = await initializeLocation(async () => {
        await loadWeatherData();
        await loadHotspots();
    });

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

    // Location dropdown
    elements.locationDropdownBtn.addEventListener('click', toggleLocationDropdown);
    elements.locationName.addEventListener('click', toggleLocationDropdown);
    elements.locationName.style.cursor = 'pointer';
    elements.useCurrentLocation.addEventListener('click', handleUseCurrentLocation);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.locationDropdown.contains(e.target) &&
            !elements.locationDropdownBtn.contains(e.target) &&
            !elements.locationName.contains(e.target)) {
            elements.locationDropdown.classList.add('hidden');
        }
    });

    // Subscribe to store changes
    store.subscribe('locationName', (name) => {
        elements.locationName.textContent = name || 'Unknown location';
    });

    // Score details modal - click handlers for score widgets
    document.querySelectorAll('.widget--score[data-score-type]').forEach(widget => {
        widget.addEventListener('click', () => {
            const scoreType = widget.dataset.scoreType;
            openScoreDetails(scoreType);
        });
    });

    // Close score modal
    if (elements.closeScoreModal) {
        elements.closeScoreModal.addEventListener('click', closeScoreModal);
    }

    if (elements.scoreModal) {
        elements.scoreModal.addEventListener('click', (e) => {
            if (e.target === elements.scoreModal) {
                closeScoreModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.scoreModal && !elements.scoreModal.classList.contains('hidden')) {
            closeScoreModal();
        }
    });
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
/**
 * Get current season for migration scoring
 */
function getSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';  // Mar-May
    if (month >= 8 && month <= 10) return 'fall';   // Sep-Nov
    return 'winter';
}

function calculateBirdingConditions(weatherData) {
    const { current, pressureHistory, tempHistory, precipLast6h } = weatherData;

    // Convert wind speed to mph for scoring
    const windSpeedMph = convertWindSpeed(current.windSpeed, 'mph');

    // Pressure trend (needed for several scores)
    const pressure = analyzePressureTrend(pressureHistory);
    store.set('pressureTrend', pressure);

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

    // Songbird Migration score (returns null outside migration season)
    const songbirdMigration = scoreSongbirdMigration(
        current.windDirection,
        pressure.trend,
        getSeason()
    );
    store.set('songbirdMigrationScore', songbirdMigration);

    // Songbird Activity score (year-round)
    const songbirdActivity = scoreSongbirdActivity(
        current.temperature,
        current.weatherCode,
        windSpeedMph
    );
    store.set('songbirdActivityScore', songbirdActivity);

    // Shorebird score
    const shorebird = scoreShorebirds(
        current.windDirection,
        windSpeedMph,
        precipLast6h,
        current.visibility
    );
    store.set('shorebirdScore', shorebird);

    // Waterfowl score
    const waterfowl = scoreWaterfowl(
        current.temperature,
        windSpeedMph,
        current.visibility,
        pressure.trend
    );
    store.set('waterfowlScore', waterfowl);

    // Owling score
    const owling = scoreOwling(
        windSpeedMph,
        current.temperature,
        current.weatherCode,
        current.humidity
    );
    store.set('owlingScore', owling);

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

    // Update weather icon
    updateWeatherIcon(current.weatherCode);

    // Wind
    elements.windSpeed.textContent = formatWindSpeed(current.windSpeed);
    elements.windDirection.textContent = formatWindDirection(current.windDirection);
    elements.windGusts.textContent = formatWindSpeed(current.windGusts);

    // Update wind compass arrow (SVG rotation)
    // Wind direction is where wind comes FROM, arrow should point in that direction
    const rotation = current.windDirection;
    if (elements.windArrow) {
        elements.windArrow.style.transform = `rotate(${rotation}deg)`;
    }

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
 * Render birding scores with animated gauges
 */
function renderScores() {
    // Define all score types and their store keys
    const scoreTypes = [
        { type: 'hawk', storeKey: 'hawkWatchScore', detailsId: 'hawk-details' },
        { type: 'seabird', storeKey: 'seabirdScore', detailsId: 'seabird-details' },
        { type: 'songbird-migration', storeKey: 'songbirdMigrationScore', detailsId: 'songbird-migration-details', widgetId: 'songbird-migration-widget' },
        { type: 'songbird-activity', storeKey: 'songbirdActivityScore', detailsId: 'songbird-activity-details' },
        { type: 'shorebird', storeKey: 'shorebirdScore', detailsId: 'shorebird-details' },
        { type: 'waterfowl', storeKey: 'waterfowlScore', detailsId: 'waterfowl-details' },
        { type: 'owling', storeKey: 'owlingScore', detailsId: 'owling-details' }
    ];

    scoreTypes.forEach(({ type, storeKey, detailsId, widgetId }) => {
        const scoreData = store.get(storeKey);

        // Handle migration widget visibility (hide when not in season)
        if (widgetId) {
            const widget = document.getElementById(widgetId);
            if (widget) {
                widget.style.display = scoreData ? '' : 'none';
            }
        }

        if (scoreData) {
            updateScoreGauge(type, scoreData);
            const detailsEl = document.getElementById(detailsId);
            if (detailsEl) {
                detailsEl.textContent = scoreData.details[0] || '';
            }
        }
    });
}

/**
 * Update weather icon based on weather code
 */
function updateWeatherIcon(weatherCode) {
    if (!elements.weatherIcon) return;

    // Map weather codes to icons and classes
    // WMO Weather interpretation codes
    const iconMap = {
        0: { icon: '☀️', class: 'sunny' },      // Clear sky
        1: { icon: '🌤️', class: 'sunny' },      // Mainly clear
        2: { icon: '⛅', class: 'cloudy' },      // Partly cloudy
        3: { icon: '☁️', class: 'cloudy' },      // Overcast
        45: { icon: '🌫️', class: 'cloudy' },    // Fog
        48: { icon: '🌫️', class: 'cloudy' },    // Depositing rime fog
        51: { icon: '🌧️', class: 'rainy' },     // Light drizzle
        53: { icon: '🌧️', class: 'rainy' },     // Moderate drizzle
        55: { icon: '🌧️', class: 'rainy' },     // Dense drizzle
        61: { icon: '🌧️', class: 'rainy' },     // Slight rain
        63: { icon: '🌧️', class: 'rainy' },     // Moderate rain
        65: { icon: '🌧️', class: 'rainy' },     // Heavy rain
        71: { icon: '🌨️', class: 'rainy' },     // Slight snow
        73: { icon: '🌨️', class: 'rainy' },     // Moderate snow
        75: { icon: '🌨️', class: 'rainy' },     // Heavy snow
        77: { icon: '🌨️', class: 'rainy' },     // Snow grains
        80: { icon: '🌦️', class: 'rainy' },     // Slight rain showers
        81: { icon: '🌦️', class: 'rainy' },     // Moderate rain showers
        82: { icon: '🌦️', class: 'rainy' },     // Violent rain showers
        85: { icon: '🌨️', class: 'rainy' },     // Slight snow showers
        86: { icon: '🌨️', class: 'rainy' },     // Heavy snow showers
        95: { icon: '⛈️', class: 'stormy' },    // Thunderstorm
        96: { icon: '⛈️', class: 'stormy' },    // Thunderstorm with slight hail
        99: { icon: '⛈️', class: 'stormy' }     // Thunderstorm with heavy hail
    };

    const weather = iconMap[weatherCode] || { icon: '🌡️', class: 'cloudy' };

    // Update icon
    const iconSymbol = elements.weatherIcon.querySelector('.weather-icon__symbol');
    if (iconSymbol) {
        iconSymbol.textContent = weather.icon;
    }

    // Update class for glow effect
    elements.weatherIcon.className = `weather-icon weather-icon--${weather.class}`;
}

/**
 * Update a score gauge with animation
 */
function updateScoreGauge(type, scoreData) {
    const gaugeFill = document.getElementById(`${type}-gauge-fill`);
    const gaugeValue = document.getElementById(`${type}-gauge-value`);
    const gaugeRating = document.getElementById(`${type}-gauge-rating`);

    if (!gaugeFill || !gaugeValue || !gaugeRating) return;

    const score = scoreData.score;
    const rating = scoreData.rating.toLowerCase();

    // Update displayed value
    gaugeValue.textContent = score;
    gaugeRating.textContent = scoreData.rating;

    // Set rating color class
    gaugeRating.className = `gauge-rating gauge-rating--${rating}`;

    // Calculate stroke-dashoffset for the score
    // Circumference = 2 * π * 50 ≈ 314
    const circumference = 314;
    const offset = circumference - (score / 100) * circumference;

    // Animate the gauge fill
    requestAnimationFrame(() => {
        gaugeFill.style.strokeDashoffset = offset;
    });
}

/**
 * Render pressure chart as smooth SVG curve
 */
function renderPressureChart() {
    const history = store.get('pressureHistory') || [];
    if (history.length === 0) return;

    const pressures = history.map(h => h.pressure);
    const min = Math.min(...pressures);
    const max = Math.max(...pressures);
    const range = max - min || 1;

    // Build SVG path points
    const points = pressures.map((p, i) => {
        const x = (i / (pressures.length - 1)) * 100;
        const y = 100 - ((p - min) / range) * 80 - 10; // 10-90 range, inverted for SVG
        return `${x},${y}`;
    });

    // Create smooth curve using the points
    const pathPoints = points.join(' ');

    // Get pressure trend for gradient color
    const pressureTrend = store.get('pressureTrend');
    const trendColor = pressureTrend?.trend === 'falling' || pressureTrend?.trend === 'falling_fast'
        ? 'var(--accent-orange)'
        : 'var(--accent-blue)';

    elements.pressureChart.innerHTML = `
        <svg viewBox="0 0 100 100" class="pressure-chart-svg" preserveAspectRatio="none">
            <defs>
                <linearGradient id="pressureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${trendColor}" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="${trendColor}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <!-- Area fill -->
            <polygon points="0,100 ${pathPoints} 100,100" fill="url(#pressureGradient)" class="pressure-area"/>
            <!-- Line -->
            <polyline points="${pathPoints}" class="pressure-line" style="stroke: ${trendColor}"/>
            <!-- End dot -->
            <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" class="pressure-dot" style="fill: ${trendColor}"/>
        </svg>
    `;
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
        card.addEventListener('click', async () => {
            const lat = parseFloat(card.dataset.lat);
            const lon = parseFloat(card.dataset.lon);
            const name = card.dataset.name;

            // Center map on hotspot
            if (map) {
                map.setView([lat, lon], 14);
            }

            // Add to recent locations and fetch weather
            addRecentLocation(lat, lon, name);
            await setLocation(lat, lon, name);
            await loadWeatherData();
        });
    });
}

/**
 * Create custom marker icon
 */
function createMarkerIcon(type = 'hotspot') {
    const colors = {
        user: { bg: '#00d4ff', border: '#00f5d4' },
        hotspot: { bg: '#a855f7', border: '#ff6b9d' }
    };
    const color = colors[type] || colors.hotspot;

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="marker-pin marker-pin--${type}" style="
                width: 24px;
                height: 24px;
                background: ${color.bg};
                border: 2px solid ${color.border};
                border-radius: 50%;
                box-shadow: 0 0 15px ${color.bg}80;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <div style="
                    width: 8px;
                    height: 8px;
                    background: white;
                    border-radius: 50%;
                "></div>
            </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19
    }).addTo(map);

    // Add user marker with custom icon
    userMarker = L.marker([lat, lon], {
        title: 'Your Location',
        icon: createMarkerIcon('user')
    }).addTo(map);

    userMarker.bindPopup('<strong>📍 Your Location</strong>').openPopup();
}

/**
 * Update map with hotspot markers
 */
function updateMapHotspots(hotspots) {
    if (!map) return;

    // Clear existing markers
    hotspotMarkers.forEach(m => map.removeLayer(m));
    hotspotMarkers = [];

    // Add new markers with custom icons
    hotspots.forEach(h => {
        const marker = L.marker([h.lat, h.lon], {
            title: h.name,
            icon: createMarkerIcon('hotspot')
        }).addTo(map);

        const escapedName = h.name.replace(/'/g, "\\'");
        marker.bindPopup(`
            <strong>${h.name}</strong><br>
            ${h.speciesCount || '?'} species<br>
            <button class="btn btn--primary" style="margin-top:8px;padding:4px 8px;font-size:12px;cursor:pointer;"
                    onclick="window.loadHotspotWeather(${h.lat}, ${h.lon}, '${escapedName}')">
                Check Weather
            </button>
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
 * Score Details Modal
 */
const scoreDisplayNames = {
    hawkWatchScore: 'Hawk Watch',
    seabirdScore: 'Seabird/Coastal',
    songbirdMigrationScore: 'Songbird Migration',
    songbirdActivityScore: 'Songbird Activity',
    shorebirdScore: 'Shorebirds',
    waterfowlScore: 'Waterfowl',
    owlingScore: 'Owling'
};

const scoreTips = {
    Excellent: "Perfect conditions! Head out now for the best birding.",
    Good: "Favorable conditions - a good day to be in the field.",
    Fair: "Moderate conditions - birding may be hit or miss.",
    Poor: "Challenging conditions - consider waiting for improvement.",
    Unfavorable: "Not ideal for this type of birding today."
};

function openScoreDetails(scoreType) {
    const scoreData = store.get(scoreType);
    if (!scoreData || !elements.scoreModal) return;

    // Populate modal
    elements.scoreModalTitle.textContent = scoreDisplayNames[scoreType] || 'Score Details';
    elements.scoreModalValue.textContent = scoreData.score;
    elements.scoreModalRating.textContent = scoreData.rating;
    elements.scoreModalRating.className = `score-modal__rating gauge-rating--${scoreData.rating.toLowerCase()}`;

    // Populate factors list
    elements.scoreModalFactors.innerHTML = scoreData.details
        .map(detail => {
            const isNegative = detail.toLowerCase().includes('too') ||
                              detail.toLowerCase().includes('poor') ||
                              detail.toLowerCase().includes('storm') ||
                              detail.toLowerCase().includes('headwinds') ||
                              detail.toLowerCase().includes('heavy') ||
                              detail.toLowerCase().includes('unfavorable');
            return `<li class="${isNegative ? 'negative' : ''}">${detail}</li>`;
        })
        .join('');

    // Add tip
    elements.scoreModalTip.textContent = scoreTips[scoreData.rating] || '';

    // Show modal
    elements.scoreModal.classList.remove('hidden');
}

function closeScoreModal() {
    if (elements.scoreModal) {
        elements.scoreModal.classList.add('hidden');
    }
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

/**
 * Location dropdown management
 */
const RECENT_LOCATIONS_KEY = 'birdingWeather_recentLocations';
const MAX_RECENT_LOCATIONS = 5;

function toggleLocationDropdown() {
    const isHidden = elements.locationDropdown.classList.contains('hidden');
    if (isHidden) {
        renderRecentLocations();
        elements.locationDropdown.classList.remove('hidden');
    } else {
        elements.locationDropdown.classList.add('hidden');
    }
}

async function handleUseCurrentLocation() {
    elements.locationDropdown.classList.add('hidden');

    // Get fresh GPS position
    if (!navigator.geolocation) {
        alert('Geolocation not supported by this browser');
        return;
    }

    elements.locationName.textContent = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            await setLocation(latitude, longitude, null);
            await loadWeatherData();
            await loadHotspots();

            // Center map on new location
            if (map) {
                map.setView([latitude, longitude], 11);
                if (userMarker) {
                    userMarker.setLatLng([latitude, longitude]);
                }
            }
        },
        (error) => {
            console.error('Geolocation error:', error);
            alert('Could not get current location. Please check your browser permissions.');
            elements.locationName.textContent = store.get('locationName') || 'Location unavailable';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function getRecentLocations() {
    try {
        const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addRecentLocation(lat, lon, name) {
    if (!name) return;

    let recent = getRecentLocations();

    // Remove if already exists
    recent = recent.filter(loc => loc.name !== name);

    // Add to beginning
    recent.unshift({ lat, lon, name });

    // Keep only MAX_RECENT_LOCATIONS
    recent = recent.slice(0, MAX_RECENT_LOCATIONS);

    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(recent));
}

function renderRecentLocations() {
    const recent = getRecentLocations();

    if (recent.length === 0) {
        elements.recentDivider.classList.add('hidden');
        elements.recentLabel.classList.add('hidden');
        elements.recentLocations.innerHTML = '';
        return;
    }

    elements.recentDivider.classList.remove('hidden');
    elements.recentLabel.classList.remove('hidden');

    elements.recentLocations.innerHTML = recent.map(loc => `
        <button class="location-dropdown__item" data-lat="${loc.lat}" data-lon="${loc.lon}" data-name="${loc.name}">
            ${loc.name}
        </button>
    `).join('');

    // Add click handlers
    elements.recentLocations.querySelectorAll('.location-dropdown__item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lat = parseFloat(btn.dataset.lat);
            const lon = parseFloat(btn.dataset.lon);
            const name = btn.dataset.name;

            elements.locationDropdown.classList.add('hidden');

            await setLocation(lat, lon, name);
            await loadWeatherData();

            if (map) {
                map.setView([lat, lon], 11);
            }
        });
    });
}

// Expose function for map popup buttons
window.loadHotspotWeather = async (lat, lon, name) => {
    addRecentLocation(lat, lon, name);
    await setLocation(lat, lon, name);
    await loadWeatherData();
};

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
