/**
 * Leaflet map view and hotspot markers
 * Extracted from main.js to keep the entry focused on orchestration.
 */

import store from '../state/store.js';

let map = null;
let userMarker = null;
let hotspotMarkers = [];
let currentTileLayer = null;
let mapStyleControl = null;
let _onHotspotWeatherRequest = null;

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
 * Initialize Leaflet map centered on the current user location.
 */
export function initMap() {
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

    // Delegated click handler for hotspot popup "Check Weather" buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hotspot-lat]');
        if (btn && _onHotspotWeatherRequest) {
            const lat = parseFloat(btn.dataset.hotspotLat);
            const lon = parseFloat(btn.dataset.hotspotLon);
            const name = btn.dataset.hotspotName;
            closeMapPopup();
            _onHotspotWeatherRequest(lat, lon, name);
        }
    });
}

/**
 * Create custom marker icon
 */
export function createMarkerIcon(type = 'hotspot') {
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
 * Switch map tile layer to specified style
 */
export function switchMapTileLayer(mode) {
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
export function handleMapStyleToggle() {
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

    // Sync with settings form select if present
    const mapTileModeSelect = document.getElementById('map-tile-mode');
    if (mapTileModeSelect) {
        mapTileModeSelect.value = newMode;
    }
}

/**
 * Update the map toggle button icon based on current style
 */
export function updateMapToggleIcon(mode) {
    if (mapStyleControl) {
        mapStyleControl.updateIcon(mode);
    }
}

/**
 * Update user marker position on the map and optionally recenter.
 */
export function setMapCenterAndUserMarker(lat, lon, zoomLevel = 11) {
    if (!map) return;

    map.setView([lat, lon], zoomLevel);
    updateUserMarker(lat, lon);
}

export function updateUserMarker(lat, lon) {
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
export function updateMapHotspots(hotspots) {
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

        const escapedName = h.name.replace(/"/g, '&quot;');
        marker.bindPopup(`
            <strong>${h.name}</strong><br>
            ${h.speciesCount || '?'} species<br>
            <button class="btn btn--primary" style="margin-top:8px;padding:4px 8px;font-size:12px;cursor:pointer;"
                    data-hotspot-lat="${h.lat}" data-hotspot-lon="${h.lon}" data-hotspot-name="${escapedName}">
                Check Weather
            </button>
        `);

        hotspotMarkers.push(marker);
    });
}

/**
 * Close any open popups on the map.
 */
export function closeMapPopup() {
    if (map) {
        map.closePopup();
    }
}

/**
 * Register a callback for when a map popup "Check Weather" button is clicked.
 * @param {Function} callback - (lat, lon, name) => void
 */
export function onHotspotWeatherClick(callback) {
    _onHotspotWeatherRequest = callback;
}

