/**
 * Location dropdown UI — toggle, search, recent/saved location management.
 * Extracted from main.js to keep the entry point focused on orchestration.
 */

import store from '../state/store.js';
import { searchAddress } from '../modules/geolocation.js';
import { debounce } from '../utils/timing.js';
import { STORAGE_KEYS, MAX_RECENT_LOCATIONS } from '../config/constants.js';
import { renderLocationList, getStoredLocations } from './locationListRenderer.js';

let els = null;
let onLocationChange = null;

/**
 * Initialize the location dropdown and wire up all event listeners.
 * @param {Object} dropdownElements - DOM elements for the dropdown
 * @param {Object} callbacks
 * @param {Function} callbacks.onLocationChange - (lat, lon, name, options?) => Promise
 */
export function initLocationDropdown(dropdownElements, callbacks) {
    els = dropdownElements;
    onLocationChange = callbacks.onLocationChange;

    els.dropdownBtn.addEventListener('click', toggleDropdown);
    els.locationName.addEventListener('click', toggleDropdown);
    els.locationName.style.cursor = 'pointer';
    els.useCurrentLocation.addEventListener('click', handleUseCurrentLocation);
    els.saveCurrentLocation.addEventListener('click', handleSaveCurrentLocation);
    els.searchInput.addEventListener('input', debounce(handleLocationSearch, 300));
    els.clearRecentLocations.addEventListener('click', handleClearRecentLocations);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!els.dropdown.contains(e.target) &&
            !els.dropdownBtn.contains(e.target) &&
            !els.locationName.contains(e.target)) {
            closeDropdown();
        }
    });
}

function toggleDropdown() {
    const isHidden = els.dropdown.classList.contains('hidden');
    if (isHidden) {
        els.searchInput.value = '';
        els.searchResults.classList.add('hidden');
        els.searchResults.innerHTML = '';
        renderSavedLocations();
        renderRecentLocations();
        els.dropdown.classList.remove('hidden');
        els.dropdownBtn.setAttribute('aria-expanded', 'true');
    } else {
        closeDropdown();
    }
}

function closeDropdown() {
    els.dropdown.classList.add('hidden');
    els.dropdownBtn.setAttribute('aria-expanded', 'false');
}

async function handleUseCurrentLocation() {
    closeDropdown();

    if (!navigator.geolocation) {
        alert('Geolocation not supported by this browser');
        return;
    }

    els.locationName.textContent = 'Getting location...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            await onLocationChange(latitude, longitude, null, {
                loadHotspots: true
            });
        },
        (error) => {
            console.error('Geolocation error:', error);
            alert('Could not get current location. Please check your browser permissions.');
            els.locationName.textContent = store.get('locationName') || 'Location unavailable';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
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

function handleClearRecentLocations(e) {
    e.stopPropagation();
    localStorage.removeItem(STORAGE_KEYS.RECENT_LOCATIONS);
    renderRecentLocations();
}

// --- Recent locations ---

function renderRecentLocations() {
    const recent = getStoredLocations(STORAGE_KEYS.RECENT_LOCATIONS);

    if (recent.length === 0) {
        els.recentDivider.classList.add('hidden');
        els.recentLabel.classList.add('hidden');
        els.recentLocations.innerHTML = '';
        return;
    }

    els.recentDivider.classList.remove('hidden');
    els.recentLabel.classList.remove('hidden');

    renderLocationList(els.recentLocations, recent, {
        onSelect: (lat, lon, name) => {
            closeDropdown();
            onLocationChange(lat, lon, name);
        }
    });
}

export function addRecentLocation(lat, lon, name) {
    if (!name) return;

    let recent = getStoredLocations(STORAGE_KEYS.RECENT_LOCATIONS);
    recent = recent.filter(loc => loc.name !== name);
    recent.unshift({ lat, lon, name });
    recent = recent.slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(STORAGE_KEYS.RECENT_LOCATIONS, JSON.stringify(recent));
}

// --- Saved locations ---

function renderSavedLocations() {
    const saved = getStoredLocations(STORAGE_KEYS.SAVED_LOCATIONS);

    if (saved.length === 0) {
        els.savedDivider.classList.add('hidden');
        els.savedLabel.classList.add('hidden');
        els.savedLocations.innerHTML = '';
        return;
    }

    els.savedDivider.classList.remove('hidden');
    els.savedLabel.classList.remove('hidden');

    renderLocationList(els.savedLocations, saved, {
        showDelete: true,
        onSelect: (lat, lon, name) => {
            closeDropdown();
            onLocationChange(lat, lon, name);
        },
        onDelete: (name) => {
            deleteSavedLocation(name);
            renderSavedLocations();
        }
    });
}

function saveLocation(lat, lon, name) {
    if (!name) return;

    let saved = getStoredLocations(STORAGE_KEYS.SAVED_LOCATIONS);
    if (saved.some(loc => loc.name === name)) return;

    saved.push({ lat, lon, name });
    localStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(saved));
}

function deleteSavedLocation(name) {
    let saved = getStoredLocations(STORAGE_KEYS.SAVED_LOCATIONS);
    saved = saved.filter(loc => loc.name !== name);
    localStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(saved));
}

// --- Location search ---

async function handleLocationSearch(e) {
    const query = e.target.value.trim();

    if (query.length < 3) {
        els.searchResults.classList.add('hidden');
        els.searchResults.innerHTML = '';
        return;
    }

    const results = await searchAddress(query);

    if (results.length === 0) {
        els.searchResults.innerHTML = '<div class="location-dropdown__item" style="color: var(--color-text-muted);">No results found</div>';
        els.searchResults.classList.remove('hidden');
        return;
    }

    renderLocationList(els.searchResults, results, {
        onSelect: (lat, lon, name) => {
            closeDropdown();
            onLocationChange(lat, lon, name, {
                addToRecent: true,
                loadHotspots: true
            });
        }
    });

    els.searchResults.classList.remove('hidden');
}
