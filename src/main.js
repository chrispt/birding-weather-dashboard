/**
 * Birding Weather Dashboard - Main Entry Point
 */

import store from './state/store.js';
import { initializeLocation, setLocation, searchAddress, checkCoastalLocation } from './modules/geolocation.js';
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
    scoreGrasslandBirds,
    scoreWoodlandBirds,
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
    locationSearch: document.getElementById('location-search'),
    searchResults: document.getElementById('search-results'),
    useCurrentLocation: document.getElementById('use-current-location'),
    saveCurrentLocation: document.getElementById('save-current-location'),
    savedLocations: document.getElementById('saved-locations'),
    savedDivider: document.getElementById('saved-divider'),
    savedLabel: document.getElementById('saved-label'),
    recentLocations: document.getElementById('recent-locations'),
    recentDivider: document.getElementById('recent-divider'),
    recentLabel: document.getElementById('recent-label'),
    clearRecentLocations: document.getElementById('clear-recent-locations'),

    // Settings form
    ebirdApiKey: document.getElementById('ebird-api-key'),
    tempUnit: document.getElementById('temp-unit'),
    speedUnit: document.getElementById('speed-unit'),
    pressureUnit: document.getElementById('pressure-unit'),
    mapTileMode: document.getElementById('map-tile-mode'),

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
let currentTileLayer = null;

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
    elements.saveCurrentLocation.addEventListener('click', handleSaveCurrentLocation);
    elements.locationSearch.addEventListener('input', debounce(handleLocationSearch, 300));
    elements.clearRecentLocations.addEventListener('click', handleClearRecentLocations);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.locationDropdown.contains(e.target) &&
            !elements.locationDropdownBtn.contains(e.target) &&
            !elements.locationName.contains(e.target)) {
            elements.locationDropdown.classList.add('hidden');
            elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Subscribe to store changes
    store.subscribe('locationName', (name) => {
        elements.locationName.textContent = name || 'Unknown location';
    });

    // Initialize location text from store (subscription doesn't fire for existing values)
    const currentLocationName = store.get('locationName');
    if (currentLocationName) {
        elements.locationName.textContent = currentLocationName;
    }

    // Score details modal - click and keyboard handlers for score widgets
    document.querySelectorAll('.widget--score[data-score-type]').forEach(widget => {
        widget.addEventListener('click', () => {
            const scoreType = widget.dataset.scoreType;
            openScoreDetails(scoreType);
        });

        // Keyboard support for accessibility
        widget.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const scoreType = widget.dataset.scoreType;
                openScoreDetails(scoreType);
            }
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
 * Change to a new location - unified function to reduce code duplication
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string|null} name - Location name (null to reverse geocode)
 * @param {object} options - Optional settings
 * @param {boolean} options.updateMap - Update map center (default: true)
 * @param {boolean} options.loadHotspots - Reload hotspots (default: false)
 * @param {boolean} options.addToRecent - Add to recent locations (default: false)
 * @param {number} options.zoomLevel - Map zoom level (default: 11)
 */
async function changeLocation(lat, lon, name, options = {}) {
    const {
        updateMap = true,
        loadHotspots: shouldLoadHotspots = false,
        addToRecent = false,
        zoomLevel = 11
    } = options;

    // Reset coastal status for new location
    store.update({ isCoastalLocation: null, coastType: null });

    // Update location in store
    await setLocation(lat, lon, name);

    // Add to recent locations if requested
    if (addToRecent && name) {
        addRecentLocation(lat, lon, name);
    }

    // Load weather data
    await loadWeatherData();

    // Optionally load hotspots
    if (shouldLoadHotspots) {
        await loadHotspots();
    }

    // Update map if requested and map exists
    if (updateMap && map) {
        map.setView([lat, lon], zoomLevel);
        updateUserMarker(lat, lon);
    }
}

/**
 * Toggle loading state on weather widgets
 */
function setWidgetsLoading(isLoading) {
    const widgetIds = ['current-widget', 'wind-widget', 'visibility-widget', 'precip-widget', 'pressure-widget'];
    widgetIds.forEach(id => {
        const widget = document.getElementById(id);
        if (widget) {
            widget.classList.toggle('widget--loading', isLoading);
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
    setWidgetsLoading(true);

    const { data, error } = await fetchWeatherForecast(lat, lon);

    if (error) {
        console.error('Failed to fetch weather:', error);
        store.set('error', error.message);
        store.set('isLoading', false);
        setWidgetsLoading(false);
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

    // Calculate birding conditions (async for coastal check)
    await calculateBirdingConditions(data);

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

async function calculateBirdingConditions(weatherData) {
    const { current, pressureHistory, tempHistory, precipLast6h } = weatherData;

    // Get current hour for time-sensitive scores
    const hour = new Date().getHours();

    // Convert wind speed to mph for scoring
    const windSpeedMph = convertWindSpeed(current.windSpeed, 'mph');

    // Check if location is coastal (if not already checked)
    const lat = store.get('userLat');
    const lon = store.get('userLon');
    let isCoastal = store.get('isCoastalLocation');
    let coastType = store.get('coastType');

    if (isCoastal === null && lat && lon) {
        const coastalInfo = await checkCoastalLocation(lat, lon);
        isCoastal = coastalInfo.isCoastal;
        coastType = coastalInfo.coastType;
        store.update({
            isCoastalLocation: isCoastal,
            coastType: coastType
        });
    }

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

    // Conditional scores based on coastal vs inland location
    if (isCoastal) {
        // Coastal location - use seabird and shorebird scores
        const seabird = scoreSeabirding(
            current.windDirection,
            windSpeedMph,
            precipLast6h,
            coastType
        );
        store.set('seabirdScore', seabird);
        store.set('grasslandScore', null);

        const shorebird = scoreShorebirds(
            current.windDirection,
            windSpeedMph,
            precipLast6h,
            current.visibility
        );
        store.set('shorebirdScore', shorebird);
        store.set('woodlandScore', null);
    } else {
        // Inland location - use grassland and woodland scores
        const grassland = scoreGrasslandBirds(
            windSpeedMph,
            current.visibility,
            current.temperature,
            current.humidity,
            hour
        );
        store.set('grasslandScore', grassland);
        store.set('seabirdScore', null);

        const woodland = scoreWoodlandBirds(
            windSpeedMph,
            current.weatherCode,
            current.temperature,
            current.humidity,
            hour
        );
        store.set('woodlandScore', woodland);
        store.set('shorebirdScore', null);
    }

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
        windSpeedMph,
        hour
    );
    store.set('songbirdActivityScore', songbirdActivity);

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
        current.humidity,
        hour
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

    // Remove loading state from widgets
    setWidgetsLoading(false);

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

    // Last update with refresh indicator
    elements.lastUpdate.textContent = `Updated ${formatRelativeTime(new Date())}`;
    elements.lastUpdate.classList.remove('refresh-flash');
    // Trigger reflow to restart animation
    void elements.lastUpdate.offsetWidth;
    elements.lastUpdate.classList.add('refresh-flash');
}

/**
 * Render birding scores with animated gauges
 */
function renderScores() {
    const isCoastal = store.get('isCoastalLocation');

    // Update widget titles and visibility based on coastal vs inland
    updateLocationBasedWidgets(isCoastal);

    // Define all score types and their store keys
    const scoreTypes = [
        { type: 'hawk', storeKey: 'hawkWatchScore', detailsId: 'hawk-details' },
        { type: 'seabird', storeKey: isCoastal ? 'seabirdScore' : 'grasslandScore', detailsId: 'seabird-details' },
        { type: 'songbird-migration', storeKey: 'songbirdMigrationScore', detailsId: 'songbird-migration-details', widgetId: 'songbird-migration-widget' },
        { type: 'songbird-activity', storeKey: 'songbirdActivityScore', detailsId: 'songbird-activity-details' },
        { type: 'shorebird', storeKey: isCoastal ? 'shorebirdScore' : 'woodlandScore', detailsId: 'shorebird-details' },
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
 * Update widget titles based on coastal vs inland location
 */
function updateLocationBasedWidgets(isCoastal) {
    // Seabird/Grassland widget
    const seabirdWidget = document.getElementById('seabird-widget');
    if (seabirdWidget) {
        const titleEl = seabirdWidget.querySelector('.widget__title');
        if (titleEl) {
            titleEl.textContent = isCoastal ? 'Seabird/Coastal' : 'Grassland Birds';
        }
        // Update the data-score-type for the modal
        seabirdWidget.dataset.scoreType = isCoastal ? 'seabirdScore' : 'grasslandScore';
    }

    // Shorebird/Woodland widget
    const shorebirdWidget = document.getElementById('shorebird-widget');
    if (shorebirdWidget) {
        const titleEl = shorebirdWidget.querySelector('.widget__title');
        if (titleEl) {
            titleEl.textContent = isCoastal ? 'Shorebirds' : 'Woodland Birds';
        }
        // Update the data-score-type for the modal
        shorebirdWidget.dataset.scoreType = isCoastal ? 'shorebirdScore' : 'woodlandScore';
    }
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
        elements.hotspots.innerHTML = `<p style="color: var(--color-text-secondary);">${error.message || 'Failed to load hotspots'}</p>`;
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
    const headerEl = document.getElementById('hotspots-header');

    if (!hotspots || hotspots.length === 0) {
        elements.hotspots.innerHTML = '';
        if (headerEl) headerEl.textContent = 'Nearby Hotspots';
        return;
    }

    // Update header with count
    if (headerEl) {
        headerEl.textContent = `Nearby Hotspots (${hotspots.length})`;
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

            await changeLocation(lat, lon, name, {
                addToRecent: true,
                zoomLevel: 14
            });
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

    // Add tile layer based on stored preference
    const tileMode = store.get('mapTileMode') || 'dark';
    switchMapTileLayer(tileMode);

    // Add map style toggle control
    addMapStyleControl(tileMode);

    // Add user marker with custom icon
    userMarker = L.marker([lat, lon], {
        title: 'Your Location',
        icon: createMarkerIcon('user')
    }).addTo(map);

    userMarker.bindPopup('<strong>📍 Your Location</strong>').openPopup();
}

let mapStyleControl = null;

/**
 * Add map style toggle as a Leaflet control
 */
function addMapStyleControl(initialMode) {
    const MapStyleControl = L.Control.extend({
        options: { position: 'topright' },

        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-style-control');
            const button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = 'Change map style';
            button.innerHTML = `<span class="map-style-icon">${MAP_TILES[initialMode]?.icon || '🌙'}</span>`;
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', 'Change map style');

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(button, 'click', function(e) {
                L.DomEvent.preventDefault(e);
                handleMapStyleToggle();
            });

            this._button = button;
            return container;
        },

        updateIcon: function(mode) {
            if (this._button) {
                const icon = MAP_TILES[mode]?.icon || '🌙';
                this._button.innerHTML = `<span class="map-style-icon">${icon}</span>`;
                this._button.title = `Map: ${mode.charAt(0).toUpperCase() + mode.slice(1)} (click to change)`;
            }
        }
    });

    mapStyleControl = new MapStyleControl();
    map.addControl(mapStyleControl);
}

/**
 * Available map tile configurations
 */
const MAP_TILES = {
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        icon: '🌙'
    },
    light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
        icon: '☀️'
    },
    osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        icon: '🗺️'
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri, Maxar, Earthstar Geographics',
        maxZoom: 18,
        icon: '🛰️'
    },
    terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        maxZoom: 17,
        icon: '⛰️'
    }
};

const MAP_STYLE_ORDER = ['dark', 'light', 'osm', 'satellite', 'terrain'];

/**
 * Switch map tile layer to specified style
 */
function switchMapTileLayer(mode) {
    if (!map) return;

    const tileConfig = MAP_TILES[mode] || MAP_TILES.dark;

    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        maxZoom: tileConfig.maxZoom
    }).addTo(map);
}

/**
 * Handle map style toggle button click - cycles through all styles
 */
function handleMapStyleToggle() {
    const currentMode = store.get('mapTileMode') || 'dark';
    const currentIndex = MAP_STYLE_ORDER.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % MAP_STYLE_ORDER.length;
    const newMode = MAP_STYLE_ORDER[nextIndex];

    // Update store (persists to localStorage)
    store.set('mapTileMode', newMode);

    // Switch map tiles
    switchMapTileLayer(newMode);

    // Update toggle icon
    updateMapToggleIcon(newMode);

    // Sync with settings form
    if (elements.mapTileMode) {
        elements.mapTileMode.value = newMode;
    }
}

/**
 * Update the map toggle button icon based on current style
 */
function updateMapToggleIcon(mode) {
    if (mapStyleControl) {
        mapStyleControl.updateIcon(mode);
    }
}

/**
 * Update user marker position on the map
 */
function updateUserMarker(lat, lon) {
    if (!map) return;

    if (userMarker) {
        userMarker.setLatLng([lat, lon]);
    } else {
        userMarker = L.marker([lat, lon], {
            title: 'Your Location',
            icon: createMarkerIcon('user')
        }).addTo(map);
        userMarker.bindPopup('<strong>📍 Your Location</strong>');
    }
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
    grasslandScore: 'Grassland Birds',
    songbirdMigrationScore: 'Songbird Migration',
    songbirdActivityScore: 'Songbird Activity',
    shorebirdScore: 'Shorebirds',
    woodlandScore: 'Woodland Birds',
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
    const mapMode = store.get('mapTileMode') || 'dark';
    elements.mapTileMode.value = mapMode;
    updateMapToggleIcon(mapMode);
}

function saveSettings() {
    const newTileMode = elements.mapTileMode.value;

    store.update({
        ebirdApiKey: elements.ebirdApiKey.value.trim(),
        tempUnit: elements.tempUnit.value,
        speedUnit: elements.speedUnit.value,
        pressureUnit: elements.pressureUnit.value,
        mapTileMode: newTileMode
    });

    // Update map tile layer if changed
    switchMapTileLayer(newTileMode);
    updateMapToggleIcon(newTileMode);

    elements.settingsModal.classList.remove('visible');

    // Reload data with new settings
    handleRefresh();
}

/**
 * Location dropdown management
 */
const RECENT_LOCATIONS_KEY = 'birdingWeather_recentLocations';
const SAVED_LOCATIONS_KEY = 'birdingWeather_savedLocations';
const MAX_RECENT_LOCATIONS = 5;

// Debounce helper for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function toggleLocationDropdown() {
    const isHidden = elements.locationDropdown.classList.contains('hidden');
    if (isHidden) {
        elements.locationSearch.value = '';
        elements.searchResults.classList.add('hidden');
        elements.searchResults.innerHTML = '';
        renderSavedLocations();
        renderRecentLocations();
        elements.locationDropdown.classList.remove('hidden');
        elements.locationDropdownBtn.setAttribute('aria-expanded', 'true');
    } else {
        elements.locationDropdown.classList.add('hidden');
        elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');
    }
}

async function handleUseCurrentLocation() {
    elements.locationDropdown.classList.add('hidden');
    elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');

    // Get fresh GPS position
    if (!navigator.geolocation) {
        alert('Geolocation not supported by this browser');
        return;
    }

    elements.locationName.textContent = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            await changeLocation(latitude, longitude, null, {
                loadHotspots: true
            });
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

function handleClearRecentLocations(e) {
    e.stopPropagation();
    localStorage.removeItem(RECENT_LOCATIONS_KEY);
    renderRecentLocations();
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
            elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');

            await changeLocation(lat, lon, name);
        });
    });
}

/**
 * Saved locations management
 */
function getSavedLocations() {
    try {
        const stored = localStorage.getItem(SAVED_LOCATIONS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveLocation(lat, lon, name) {
    if (!name) return;

    let saved = getSavedLocations();

    // Don't add if already exists
    if (saved.some(loc => loc.name === name)) return;

    saved.push({ lat, lon, name });
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(saved));
}

function deleteSavedLocation(name) {
    let saved = getSavedLocations();
    saved = saved.filter(loc => loc.name !== name);
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(saved));
}

function handleSaveCurrentLocation() {
    const lat = store.get('userLat');
    const lon = store.get('userLon');
    const name = store.get('locationName');

    if (!lat || !lon || !name) {
        alert('No location to save');
        return;
    }

    saveLocation(lat, lon, name);
    renderSavedLocations();
}

function renderSavedLocations() {
    const saved = getSavedLocations();

    if (saved.length === 0) {
        elements.savedDivider.classList.add('hidden');
        elements.savedLabel.classList.add('hidden');
        elements.savedLocations.innerHTML = '';
        return;
    }

    elements.savedDivider.classList.remove('hidden');
    elements.savedLabel.classList.remove('hidden');

    elements.savedLocations.innerHTML = saved.map(loc => `
        <div class="location-dropdown__item location-dropdown__item--saved" data-lat="${loc.lat}" data-lon="${loc.lon}" data-name="${loc.name}">
            <span>${loc.name}</span>
            <button class="delete-btn" data-name="${loc.name}">×</button>
        </div>
    `).join('');

    // Add click handlers for location selection
    elements.savedLocations.querySelectorAll('.location-dropdown__item--saved').forEach(item => {
        item.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-btn')) return;

            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            const name = item.dataset.name;

            elements.locationDropdown.classList.add('hidden');
            elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');

            await changeLocation(lat, lon, name);
        });
    });

    // Add click handlers for delete buttons
    elements.savedLocations.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = btn.dataset.name;
            deleteSavedLocation(name);
            renderSavedLocations();
        });
    });
}

/**
 * Location search
 */
async function handleLocationSearch(e) {
    const query = e.target.value.trim();

    if (query.length < 3) {
        elements.searchResults.classList.add('hidden');
        elements.searchResults.innerHTML = '';
        return;
    }

    const results = await searchAddress(query);

    if (results.length === 0) {
        elements.searchResults.innerHTML = '<div class="location-dropdown__item" style="color: var(--color-text-muted);">No results found</div>';
        elements.searchResults.classList.remove('hidden');
        return;
    }

    elements.searchResults.innerHTML = results.map(loc => `
        <button class="location-dropdown__item" data-lat="${loc.lat}" data-lon="${loc.lon}" data-name="${loc.name}">
            ${loc.name}
        </button>
    `).join('');

    elements.searchResults.classList.remove('hidden');

    // Add click handlers
    elements.searchResults.querySelectorAll('.location-dropdown__item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lat = parseFloat(btn.dataset.lat);
            const lon = parseFloat(btn.dataset.lon);
            const name = btn.dataset.name;

            elements.locationDropdown.classList.add('hidden');
            elements.locationDropdownBtn.setAttribute('aria-expanded', 'false');

            await changeLocation(lat, lon, name, {
                addToRecent: true,
                loadHotspots: true
            });
        });
    });
}

// Expose function for map popup buttons
window.loadHotspotWeather = async (lat, lon, name) => {
    if (map) {
        map.closePopup();
    }
    await changeLocation(lat, lon, name, {
        addToRecent: true,
        updateMap: false  // Don't recenter - user clicked on map
    });
    // Update marker without recentering
    updateUserMarker(lat, lon);
};

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
