/**
 * Birding Weather Dashboard - Main Entry Point
 */

import store from './state/store.js';
import { initializeLocation, setLocation, searchAddress, checkCoastalLocation } from './modules/geolocation.js';
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
import { debounce } from './utils/timing.js';
import { REFRESH_INTERVAL_SECONDS } from './config/constants.js';
import {
    setWidgetsLoading,
    renderWeatherData
} from './ui/weatherView.js';
import {
    initMap,
    setMapCenterAndUserMarker,
    updateMapHotspots,
    switchMapTileLayer,
    updateMapToggleIcon,
    closeMapPopup
} from './ui/mapView.js';

// DOM Elements (shared across modules that still live in this file)
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

/**
 * Initialize the application
 */
async function init() {
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

    // Get current hour for time-sensitive scores
    const hour = new Date().getHours();

    // Convert wind speed to mph for scoring
    const windSpeedMph = convertWindSpeed(current.windSpeed, 'mph');

    // Convert temperature to Fahrenheit for scoring functions,
    // which are defined using Fahrenheit thresholds
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
            tempF,
            current.humidity,
            hour
        );
        store.set('grasslandScore', grassland);
        store.set('seabirdScore', null);

        const woodland = scoreWoodlandBirds(
            windSpeedMph,
            current.weatherCode,
            tempF,
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
        tempF,
        current.weatherCode,
        windSpeedMph,
        hour
    );
    store.set('songbirdActivityScore', songbirdActivity);

    // Waterfowl score
    const waterfowl = scoreWaterfowl(
        tempF,
        windSpeedMph,
        current.visibility,
        pressure.trend
    );
    store.set('waterfowlScore', waterfowl);

    // Owling score
    const owling = scoreOwling(
        windSpeedMph,
        tempF,
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
 * Map helpers now live in src/ui/mapView.js
 */

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
    closeMapPopup();
    await changeLocation(lat, lon, name, {
        addToRecent: true,
        updateMap: false  // Don't recenter - user clicked on map
    });
    // Update marker without recentering
    updateUserMarker(lat, lon);
};

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
