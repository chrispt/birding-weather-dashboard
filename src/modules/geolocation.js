/**
 * Geolocation module for getting user's location
 */

import store from '../state/store.js';
import { STORAGE_KEYS } from '../config/constants.js';

/**
 * Check if a location is coastal (within ~50 miles of ocean)
 * Uses coordinate-based heuristics for fast, reliable detection
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{isCoastal: boolean, coastType: string|null}>}
 */
export async function checkCoastalLocation(lat, lon) {
    // Use coordinate-based heuristic (fast and reliable for US)
    return checkCoastalByCoordinates(lat, lon);
}

/**
 * Fallback: Check coastal status using coordinate-based heuristics
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {{isCoastal: boolean, coastType: string|null}}
 */
function checkCoastalByCoordinates(lat, lon) {
    // US-centric coastal boundaries (simplified)
    // East Coast: roughly east of -77 longitude and south of 45 lat
    const isEastCoast = lon > -82 && lon < -66 && lat > 25 && lat < 45;

    // West Coast: roughly west of -117 longitude
    const isWestCoast = lon < -117 && lat > 32 && lat < 49;

    // Gulf Coast: southern US between -97 and -80 longitude, below 31 lat
    const isGulfCoast = lon > -97 && lon < -80 && lat < 31 && lat > 25;

    // Florida (special case - most of it is coastal)
    const isFlorida = lat > 24.5 && lat < 31 && lon > -87.6 && lon < -80;

    // Great Lakes (treat as inland)
    const isGreatLakes = lat > 41 && lat < 49 && lon > -92 && lon < -76;

    if (isGreatLakes) {
        return { isCoastal: false, coastType: null };
    }

    if (isFlorida || isEastCoast) {
        return { isCoastal: true, coastType: 'east' };
    }

    if (isWestCoast) {
        return { isCoastal: true, coastType: 'west' };
    }

    if (isGulfCoast) {
        return { isCoastal: true, coastType: 'gulf' };
    }

    return { isCoastal: false, coastType: null };
}

/**
 * Determine which coast type based on coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} 'east', 'west', or 'gulf'
 */
function determineCoastType(lat, lon) {
    // West Coast
    if (lon < -115) return 'west';

    // Gulf Coast
    if (lat < 31 && lon > -97 && lon < -80) return 'gulf';

    // Default to East Coast
    return 'east';
}

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
 * Search for addresses and POIs using forward geocoding
 * @param {string} query - Search query (address, place name, POI, etc.)
 * @returns {Promise<Array<{lat: number, lon: number, name: string}>}
 */
export async function searchAddress(query) {
    if (!query || query.trim().length < 3) {
        return [];
    }

    try {
        // Build search URL with location bias if user location is available
        const userLat = store.get('userLat');
        const userLon = store.get('userLon');

        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&addressdetails=1&extratags=1`;

        // Add location bias - creates a viewbox around user's location (~100 miles)
        // This prioritizes results near the user without excluding distant results
        if (userLat && userLon) {
            const bias = 1.5; // ~100 miles in degrees
            const viewbox = `${userLon - bias},${userLat + bias},${userLon + bias},${userLat - bias}`;
            url += `&viewbox=${viewbox}&bounded=0`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'BirdingWeatherDashboard/1.0'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) return [];

        const data = await response.json();

        return data.map(item => {
            // Build a cleaner display name - handle POIs (parks, businesses, etc.)
            const addr = item.address || {};
            const parts = [];

            // Check for POI name first (parks, nature reserves, businesses, etc.)
            // Nominatim returns these in various address fields
            const poiName = addr.leisure || addr.tourism || addr.amenity || addr.natural ||
                           addr.park || addr.nature_reserve || addr.building ||
                           item.name; // item.name contains the matched POI name

            // If this is a POI (not just an address), show the POI name first
            const isPoi = item.class === 'leisure' || item.class === 'tourism' ||
                         item.class === 'amenity' || item.class === 'natural' ||
                         item.type === 'park' || item.type === 'nature_reserve' ||
                         item.type === 'protected_area';

            if (isPoi && item.name) {
                parts.push(item.name);
            } else if (addr.house_number && addr.road) {
                // Include street address if present
                parts.push(`${addr.house_number} ${addr.road}`);
            } else if (addr.road) {
                parts.push(addr.road);
            }

            // Include city/town (check multiple fields for rural areas)
            const specificLocality = addr.city || addr.town || addr.village || addr.hamlet ||
                                     addr.place || addr.locality || addr.neighbourhood || addr.suburb;
            const broaderLocality = addr.municipality || addr.county;

            // If no specific locality found, try to extract from display_name
            let locality = specificLocality;
            if (!locality && item.display_name) {
                const displayParts = item.display_name.split(', ');
                for (let i = 1; i < displayParts.length - 2; i++) {
                    const part = displayParts[i];
                    if (part.includes('County') || part === addr.state || part === addr.country) {
                        continue;
                    }
                    if (addr.road && part.includes(addr.road)) {
                        continue;
                    }
                    // Skip if it's the same as the POI name we already added
                    if (item.name && part === item.name) {
                        continue;
                    }
                    locality = part;
                    break;
                }
            }

            // Add locality
            if (locality) {
                parts.push(locality);
            } else if (broaderLocality) {
                parts.push(broaderLocality);
            }

            // Include state
            if (addr.state) {
                parts.push(addr.state);
            }

            // Include country if not US
            if (addr.country_code && addr.country_code !== 'us') {
                parts.push(addr.country);
            }

            // Fallback to display_name if we couldn't build a name
            const name = parts.length > 0 ? parts.join(', ') : item.display_name;

            return {
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                name: name
            };
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Address search timed out');
        } else {
            console.warn('Address search failed:', error);
        }
        return [];
    }
}

/**
 * Get approximate location from IP address (fast, city-level accuracy)
 * @returns {Promise<{lat: number, lon: number, name: string}|null>}
 */
async function getIpLocation() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // Use ipapi.co for approximate IP-based geolocation over HTTPS
        // Docs: https://ipapi.co/api/
        const response = await fetch('https://ipapi.co/json/', {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.latitude && data.longitude) {
            const lat = data.latitude;
            const lon = data.longitude;

            // Build a friendly location name; keep US vs non-US handling
            const city = data.city;
            const region = data.region;
            const countryName = data.country_name || data.country || '';

            let name;
            if (data.country_code === 'US' && city && region) {
                name = `${city}, ${region}`;
            } else if (city && countryName) {
                name = `${city}, ${countryName}`;
            } else if (city) {
                name = city;
            } else {
                name = countryName || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
            }

            return { lat, lon, name };
        }
    } catch (error) {
        console.warn('IP geolocation failed:', error);
    }
    return null;
}

/**
 * Initialize location - uses stored location immediately, then fetches GPS in background
 * @param {Function} onLocationUpdate - Optional callback when GPS returns different location
 * @returns {Promise<boolean>} True if location was obtained (from stored or GPS)
 */
export async function initializeLocation(onLocationUpdate = null) {
    store.set('isLoading', true);

    // Use stored location immediately for fast startup
    const lastLocation = getLastLocation();
    if (lastLocation) {
        store.update({
            userLat: lastLocation.lat,
            userLon: lastLocation.lon,
            locationName: lastLocation.name
        });
        store.set('isLoading', false);

        // Fetch GPS in background and update if location changed
        fetchGpsInBackground(lastLocation, onLocationUpdate);
        return true;
    }

    // No stored location - try IP geolocation first (fast)
    const ipLocation = await getIpLocation();
    if (ipLocation) {
        store.update({
            userLat: ipLocation.lat,
            userLon: ipLocation.lon,
            locationName: ipLocation.name
        });
        store.set('isLoading', false);
        saveLastLocation(ipLocation.lat, ipLocation.lon, ipLocation.name);

        // Still fetch GPS in background for accuracy
        fetchGpsInBackground(ipLocation, onLocationUpdate);
        return true;
    }

    // IP failed - fall back to GPS (slow)
    const position = await getCurrentPosition();
    if (position) {
        store.update({
            userLat: position.lat,
            userLon: position.lon,
            locationName: `${position.lat.toFixed(2)}, ${position.lon.toFixed(2)}`
        });
        store.set('isLoading', false);

        // Fetch location name in background
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
 * Fetch GPS position in background and update if significantly different
 * @param {Object} lastLocation - Previous location to compare against
 * @param {Function} onLocationUpdate - Callback when location changes significantly
 */
async function fetchGpsInBackground(lastLocation, onLocationUpdate) {
    const position = await getCurrentPosition();
    if (!position) return;

    // Check if position changed significantly (>100m)
    const distance = getDistanceKm(
        lastLocation.lat, lastLocation.lon,
        position.lat, position.lon
    );

    if (distance < 0.1) {
        // Position hasn't changed significantly, skip update
        return;
    }

    // Position changed, update store
    store.update({
        userLat: position.lat,
        userLon: position.lon,
        locationName: `${position.lat.toFixed(2)}, ${position.lon.toFixed(2)}`
    });

    // Fetch location name
    const name = await reverseGeocode(position.lat, position.lon);
    if (name) {
        store.set('locationName', name);
        saveLastLocation(position.lat, position.lon, name);
    }

    // Call the update callback to reload weather/hotspots
    if (onLocationUpdate) {
        onLocationUpdate();
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
