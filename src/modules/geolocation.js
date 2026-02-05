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
 * Uses free Nominatim API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'BirdingWeatherDashboard/1.0'
            }
        });

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
        console.warn('Reverse geocoding failed:', error);
        return null;
    }
}

/**
 * Initialize location - try geolocation, fall back to stored location
 * @returns {Promise<boolean>} True if location was obtained
 */
export async function initializeLocation() {
    store.set('isLoading', true);

    // Try browser geolocation
    const position = await getCurrentPosition();

    if (position) {
        store.update({
            userLat: position.lat,
            userLon: position.lon
        });

        // Get location name in background
        const name = await reverseGeocode(position.lat, position.lon);
        if (name) {
            store.set('locationName', name);

            // Save to localStorage
            saveLastLocation(position.lat, position.lon, name);
        }

        store.set('isLoading', false);
        return true;
    }

    // Check for stored location
    const lastLocation = getLastLocation();
    if (lastLocation) {
        store.update({
            userLat: lastLocation.lat,
            userLon: lastLocation.lon,
            locationName: lastLocation.name
        });
        store.set('isLoading', false);
        return true;
    }

    store.set('isLoading', false);
    return false;
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
