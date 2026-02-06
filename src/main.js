/**
 * Birding Weather Dashboard - Main Entry Point
 * Orchestration only: wires modules together, loads data, manages refresh.
 */

import store from './state/store.js';
import { initializeLocation, setLocation, checkCoastalLocation } from './modules/geolocation.js';
import { fetchWeatherForecast } from './api/openMeteo.js';
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
    formatCountdown,
    convertWindSpeed,
    convertTemperature
} from './utils/formatting.js';
import { REFRESH_INTERVAL_SECONDS } from './config/constants.js';
import {
    setWidgetsLoading,
    renderWeatherData
} from './ui/weatherView.js';
import {
    initMap,
    setMapCenterAndUserMarker,
    updateMapHotspots,
    updateUserMarker,
    onHotspotWeatherClick,
    closeMapPopup
} from './ui/mapView.js';
import { initLocationDropdown, addRecentLocation } from './ui/locationDropdown.js';
import { initScoreDetailsModal } from './ui/scoreDetailsModal.js';
import { initSettings } from './ui/settings.js';
import { initHotspotsView, renderHotspots } from './ui/hotspotsView.js';

// Minimal DOM cache — only elements needed for orchestration
const elements = {
    locationName: document.getElementById('location-name'),
    countdown: document.getElementById('countdown'),
    refreshBtn: document.getElementById('refresh-btn'),
    hotspots: document.getElementById('hotspots')
};

/**
 * Initialize the application
 */
async function init() {
    setupEventListeners();
    initUIModules();

    // Initialize location (pass callback to reload data when GPS returns different location)
    const hasLocation = await initializeLocation(async () => {
        await loadWeatherData();
        await loadHotspots();
    });

    if (hasLocation) {
        await loadWeatherData();
        await loadHotspots();
        initMap();
        registerMapCallbacks();
    } else {
        elements.locationName.textContent = 'Location unavailable - please enable location services';
    }

    // Start refresh timer
    startRefreshTimer();
}

/**
 * Wire up extracted UI modules with their DOM elements and callbacks.
 */
function initUIModules() {
    initLocationDropdown(
        {
            dropdownBtn: document.getElementById('location-dropdown-btn'),
            dropdown: document.getElementById('location-dropdown'),
            locationName: elements.locationName,
            searchInput: document.getElementById('location-search'),
            searchResults: document.getElementById('search-results'),
            useCurrentLocation: document.getElementById('use-current-location'),
            saveCurrentLocation: document.getElementById('save-current-location'),
            savedLocations: document.getElementById('saved-locations'),
            savedDivider: document.getElementById('saved-divider'),
            savedLabel: document.getElementById('saved-label'),
            recentLocations: document.getElementById('recent-locations'),
            recentDivider: document.getElementById('recent-divider'),
            recentLabel: document.getElementById('recent-label'),
            clearRecentLocations: document.getElementById('clear-recent-locations')
        },
        { onLocationChange: changeLocation }
    );

    initScoreDetailsModal({
        modal: document.getElementById('score-details-modal'),
        closeBtn: document.getElementById('close-score-modal'),
        title: document.getElementById('score-modal-title'),
        value: document.getElementById('score-modal-value'),
        rating: document.getElementById('score-modal-rating'),
        factors: document.getElementById('score-modal-factors'),
        tip: document.getElementById('score-modal-tip')
    });

    initSettings(
        {
            settingsBtn: document.getElementById('settings-btn'),
            modal: document.getElementById('settings-modal'),
            closeBtn: document.getElementById('close-settings'),
            saveBtn: document.getElementById('save-settings'),
            ebirdApiKey: document.getElementById('ebird-api-key'),
            tempUnit: document.getElementById('temp-unit'),
            speedUnit: document.getElementById('speed-unit'),
            pressureUnit: document.getElementById('pressure-unit'),
            mapTileMode: document.getElementById('map-tile-mode')
        },
        { onSettingsSaved: handleRefresh }
    );

    initHotspotsView(
        elements.hotspots,
        {
            onHotspotSelect: (lat, lon, name) =>
                changeLocation(lat, lon, name, { addToRecent: true, zoomLevel: 14 })
        }
    );
}

/**
 * Register map popup callbacks after the map is initialized.
 */
function registerMapCallbacks() {
    onHotspotWeatherClick(async (lat, lon, name) => {
        await changeLocation(lat, lon, name, {
            addToRecent: true,
            updateMap: false
        });
        updateUserMarker(lat, lon);
    });
}

/**
 * Set up minimal event listeners that remain in main.js.
 */
function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', handleRefresh);

    store.subscribe('locationName', (name) => {
        elements.locationName.textContent = name || 'Unknown location';
    });

    // Initialize location text from store (subscription doesn't fire for existing values)
    const currentLocationName = store.get('locationName');
    if (currentLocationName) {
        elements.locationName.textContent = currentLocationName;
    }
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

    // Update map if requested
    if (updateMap) {
        setMapCenterAndUserMarker(lat, lon, zoomLevel);
    }
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

    // Update UI via weather view module
    renderWeatherData(data);
}

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

    const hour = new Date().getHours();
    const windSpeedMph = convertWindSpeed(current.windSpeed, 'mph');
    const tempF = convertTemperature(current.temperature, 'F');

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

    // Pressure trend
    const pressure = analyzePressureTrend(pressureHistory);
    store.set('pressureTrend', pressure);

    // Hawk watch
    store.set('hawkWatchScore', scoreHawkWatch(
        current.windDirection, windSpeedMph, current.visibility
    ));

    // Conditional scores based on coastal vs inland
    if (isCoastal) {
        store.set('seabirdScore', scoreSeabirding(
            current.windDirection, windSpeedMph, precipLast6h, coastType
        ));
        store.set('grasslandScore', null);

        store.set('shorebirdScore', scoreShorebirds(
            current.windDirection, windSpeedMph, precipLast6h, current.visibility
        ));
        store.set('woodlandScore', null);
    } else {
        store.set('grasslandScore', scoreGrasslandBirds(
            windSpeedMph, current.visibility, tempF, current.humidity, hour
        ));
        store.set('seabirdScore', null);

        store.set('woodlandScore', scoreWoodlandBirds(
            windSpeedMph, current.weatherCode, tempF, current.humidity, hour
        ));
        store.set('shorebirdScore', null);
    }

    // Songbird Migration (returns null outside migration season)
    store.set('songbirdMigrationScore', scoreSongbirdMigration(
        current.windDirection, pressure.trend, getSeason()
    ));

    // Songbird Activity (year-round)
    store.set('songbirdActivityScore', scoreSongbirdActivity(
        tempF, current.weatherCode, windSpeedMph, hour
    ));

    // Waterfowl
    store.set('waterfowlScore', scoreWaterfowl(
        tempF, windSpeedMph, current.visibility, pressure.trend
    ));

    // Owling
    store.set('owlingScore', scoreOwling(
        windSpeedMph, tempF, current.weatherCode, current.humidity, hour
    ));

    // Fallout risk
    store.set('falloutRisk', assessFalloutRisk(
        current.visibility, current.humidity, precipLast6h, pressure.trend
    ));

    // Front passage
    store.set('frontPassageAlert', detectFrontPassage(pressureHistory, tempHistory));
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

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
