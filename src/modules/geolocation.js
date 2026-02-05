/**
 * Geolocation module for getting user's location
 */

import store from '../state/store.js';
import { STORAGE_KEYS } from '../config/constants.js';

/**
 * Get user's current position
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
export async function getCurrentPosition() {
    if (!navigator.geolocation) {
        console.warn('Geolocation not supported by this browser');
        return null;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                resolve({ lat: latitude, lon: longitude });
            },
            (error) => {
                console.warn('Geolocation error:', error.message);
                resolve(null);
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    });
}

/**
 * Get location name from coordinates using reverse geocoding
 * Uses free Nominatim API with 5 second timeout
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

        // Add 5 second timeout to prevent indefinite hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'BirdingWeatherDashboard/1.0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const address = data.address;

        // Build location string
        const parts = [];
        if (address.city || address.town || address.village) {
            parts.push(address.city || address.town || address.village);
        }
        if (address.state) {
            parts.push(address.state);
        }
        if (address.country_code && address.country_code !== 'us') {
            parts.push(address.country);
        }

        return parts.length > 0 ? parts.join(', ') : null;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Reverse geocoding timed out');
        } else {
            console.warn('Reverse geocoding failed:', error);
        }
        return null;
    }
}

/**
 * Initialize location - uses stored location immediately, then refreshes in background
 * @returns {Promise<boolean>} True if location was obtained
 */
export async function initializeLocation() {
    store.set('isLoading', true);

    // Check for stored location FIRST - use it immediately for fast startup
    const lastLocation = getLastLocation();
    if (lastLocation) {
        store.update({
            userLat: lastLocation.lat,
            userLon: lastLocation.lon,
            locationName: lastLocation.name
        });
        store.set('isLoading', false);

        // Refresh location in background (user may have moved)
        refreshLocationInBackground();
        return true;
    }

    // No stored location - must wait for geolocation
    const position = await getCurrentPosition();

    if (position) {
        // Update immediately with coordinates (shows "40.71, -74.01" format)
        store.update({
            userLat: position.lat,
            userLon: position.lon,
            locationName: `${position.lat.toFixed(2)}, ${position.lon.toFixed(2)}`
        });
        store.set('isLoading', false);

        // Fetch location name in background (non-blocking)
        reverseGeocode(position.lat, position.lon).then(name => {
            if (name) {
                store.set('locationName', name);
                saveLastLocation(position.lat, position.lon, name);
            }
        });

        return true;
    }

    store.set('isLoading', false);
    return false;
}

/**
 * Refresh location in background without blocking UI
 * Used after initial load to update if user has moved
 */
async function refreshLocationInBackground() {
    const position = await getCurrentPosition();
    if (position) {
        const lastLocation = getLastLocation();

        // Only update if position changed significantly (>100m)
        if (lastLocation) {
            const distance = getDistanceKm(
                lastLocation.lat, lastLocation.lon,
                position.lat, position.lon
            );
            if (distance < 0.1) {
                // Position hasn't changed significantly, skip update
                return;
            }
        }

        // Position changed, update store and get new name
        store.update({
            userLat: position.lat,
            userLon: position.lon
        });

        const name = await reverseGeocode(position.lat, position.lon);
        if (name) {
            store.set('locationName', name);
            saveLastLocation(position.lat, position.lon, name);
        }
    }
}

/**
 * Calculate distance between two coordinates in km (Haversine formula)
 */
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Save location to localStorage
 * @param {number} lat
 * @param {number} lon
 * @param {string} name
 */
export function saveLastLocation(lat, lon, name) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_LOCATION, JSON.stringify({
            lat,
            lon,
            name
        }));
    } catch (error) {
        console.warn('Failed to save location:', error);
    }
}

/**
 * Get last saved location from localStorage
 * @returns {{lat: number, lon: number, name: string}|null}
 */
export function getLastLocation() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.warn('Failed to load last location:', error);
    }
    return null;
}

/**
 * Set location manually (from user input or hotspot selection)
 * @param {number} lat
 * @param {number} lon
 * @param {string} name
 */
export async function setLocation(lat, lon, name = null) {
    store.update({
        userLat: lat,
        userLon: lon,
        locationName: name
    });

    // Get name if not provided
    if (!name) {
        const geocodedName = await reverseGeocode(lat, lon);
        if (geocodedName) {
            store.set('locationName', geocodedName);
            saveLastLocation(lat, lon, geocodedName);
        }
    } else {
        saveLastLocation(lat, lon, name);
    }
}
