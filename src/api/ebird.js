/**
 * eBird API client for hotspot data
 * Requires free API key from Cornell Lab
 * https://ebird.org/api/keygen
 */

import { fetchWithErrorHandling } from './client.js';
import { EBIRD_API_BASE, DEFAULTS } from '../config/constants.js';
import store from '../state/store.js';

/**
 * Fetch nearby hotspots from eBird
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusKm - Search radius in kilometers (max 50)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function fetchNearbyHotspots(lat, lon, radiusKm = DEFAULTS.HOTSPOT_RADIUS_KM) {
    const apiKey = store.get('ebirdApiKey');

    if (!apiKey) {
        return {
            data: null,
            error: new Error('eBird API key not configured. Please add your key in settings.')
        };
    }

    const params = new URLSearchParams({
        lat: lat.toFixed(4),
        lng: lon.toFixed(4),
        dist: Math.min(radiusKm, 50), // Max 50km
        fmt: 'json'
    });

    const url = `${EBIRD_API_BASE}/ref/hotspot/geo?${params.toString()}`;

    const { data, error } = await fetchWithErrorHandling(url, {
        headers: {
            'X-eBirdApiToken': apiKey
        }
    });

    if (error) {
        // Check for auth errors
        if (error.status === 403 || error.status === 401) {
            return {
                data: null,
                error: new Error('Invalid eBird API key. Please check your key in settings.')
            };
        }
        return { data: null, error };
    }

    // Transform to our format
    const hotspots = data.map(h => ({
        id: h.locId,
        name: h.locName,
        lat: h.lat,
        lon: h.lng,
        countryCode: h.countryCode,
        subnational1: h.subnational1Code,
        subnational2: h.subnational2Code,
        speciesCount: h.numSpeciesAllTime,
        latestObsDate: h.latestObsDt
    }));

    // Sort by species count (most diverse first)
    hotspots.sort((a, b) => (b.speciesCount || 0) - (a.speciesCount || 0));

    return { data: hotspots, error: null };
}

/**
 * Fetch recent observations at a hotspot
 * @param {string} locId - eBird location ID
 * @param {number} days - Number of days back to search (max 30)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function fetchHotspotObservations(locId, days = 7) {
    const apiKey = store.get('ebirdApiKey');

    if (!apiKey) {
        return {
            data: null,
            error: new Error('eBird API key not configured')
        };
    }

    const params = new URLSearchParams({
        back: Math.min(days, 30)
    });

    const url = `${EBIRD_API_BASE}/data/obs/${locId}/recent?${params.toString()}`;

    const { data, error } = await fetchWithErrorHandling(url, {
        headers: {
            'X-eBirdApiToken': apiKey
        }
    });

    if (error) {
        return { data: null, error };
    }

    return { data, error: null };
}

/**
 * Check if eBird API key is valid
 * @param {string} apiKey - API key to test
 * @returns {Promise<boolean>}
 */
export async function validateApiKey(apiKey) {
    if (!apiKey || apiKey.trim().length === 0) {
        return false;
    }

    // Try a simple API call to verify the key
    const url = `${EBIRD_API_BASE}/ref/hotspot/geo?lat=40.7128&lng=-74.0060&dist=1&fmt=json`;

    const { error } = await fetchWithErrorHandling(url, {
        headers: {
            'X-eBirdApiToken': apiKey.trim()
        }
    });

    return !error;
}
