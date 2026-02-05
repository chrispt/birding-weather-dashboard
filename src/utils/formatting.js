/**
 * Formatting utilities for display
 */

import { WIND_DIRECTIONS } from '../config/constants.js';
import store from '../state/store.js';

/**
 * Convert temperature between units
 * @param {number} celsius - Temperature in Celsius
 * @param {string} unit - Target unit ('F' or 'C')
 * @returns {number}
 */
export function convertTemperature(celsius, unit = null) {
    const targetUnit = unit || store.get('tempUnit') || 'F';

    if (targetUnit === 'C') {
        return Math.round(celsius);
    }
    // Convert to Fahrenheit
    return Math.round((celsius * 9 / 5) + 32);
}

/**
 * Format temperature with unit symbol
 * @param {number} celsius - Temperature in Celsius
 * @param {string} unit - Target unit
 * @returns {string}
 */
export function formatTemperature(celsius, unit = null) {
    const targetUnit = unit || store.get('tempUnit') || 'F';
    const value = convertTemperature(celsius, targetUnit);
    return `${value}°${targetUnit}`;
}

/**
 * Convert wind speed between units
 * Open-Meteo returns km/h
 * @param {number} kmh - Speed in km/h
 * @param {string} unit - Target unit ('mph' or 'kph')
 * @returns {number}
 */
export function convertWindSpeed(kmh, unit = null) {
    const targetUnit = unit || store.get('speedUnit') || 'mph';

    if (targetUnit === 'kph') {
        return Math.round(kmh);
    }
    // Convert to mph
    return Math.round(kmh * 0.621371);
}

/**
 * Format wind speed with unit
 * @param {number} kmh - Speed in km/h
 * @param {string} unit - Target unit
 * @returns {string}
 */
export function formatWindSpeed(kmh, unit = null) {
    const targetUnit = unit || store.get('speedUnit') || 'mph';
    const value = convertWindSpeed(kmh, targetUnit);
    return `${value} ${targetUnit}`;
}

/**
 * Convert pressure between units
 * Open-Meteo returns hPa (mb)
 * @param {number} hpa - Pressure in hPa/mb
 * @param {string} unit - Target unit ('inHg' or 'mb')
 * @returns {number}
 */
export function convertPressure(hpa, unit = null) {
    const targetUnit = unit || store.get('pressureUnit') || 'inHg';

    if (targetUnit === 'mb') {
        return Math.round(hpa * 10) / 10;
    }
    // Convert to inches of mercury
    return Math.round((hpa * 0.02953) * 100) / 100;
}

/**
 * Format pressure with unit
 * @param {number} hpa - Pressure in hPa/mb
 * @param {string} unit - Target unit
 * @returns {string}
 */
export function formatPressure(hpa, unit = null) {
    const targetUnit = unit || store.get('pressureUnit') || 'inHg';
    const value = convertPressure(hpa, targetUnit);
    return `${value} ${targetUnit}`;
}

/**
 * Convert visibility to miles
 * Open-Meteo returns meters
 * @param {number} meters - Visibility in meters
 * @returns {number} Visibility in miles
 */
export function convertVisibilityToMiles(meters) {
    return Math.round((meters / 1609.34) * 10) / 10;
}

/**
 * Format visibility
 * @param {number} meters - Visibility in meters
 * @returns {string}
 */
export function formatVisibility(meters) {
    const miles = convertVisibilityToMiles(meters);
    if (miles >= 10) {
        return '10+ miles';
    }
    return `${miles} mi`;
}

/**
 * Get wind direction label from degrees
 * @param {number} degrees - Wind direction in degrees (0-360)
 * @returns {string} Cardinal direction (N, NE, E, etc.)
 */
export function getWindDirectionLabel(degrees) {
    // Normalize to 0-360
    const normalized = ((degrees % 360) + 360) % 360;

    for (const dir of WIND_DIRECTIONS) {
        if (normalized >= dir.min && normalized < dir.max) {
            return dir.label;
        }
    }
    // Handle N (crosses 0)
    if (normalized >= 348.75 || normalized < 11.25) {
        return 'N';
    }
    return 'N';
}

/**
 * Format wind direction with label and degrees
 * @param {number} degrees - Wind direction in degrees
 * @returns {string}
 */
export function formatWindDirection(degrees) {
    const label = getWindDirectionLabel(degrees);
    return `${label} (${Math.round(degrees)}°)`;
}

/**
 * Format time for display
 * @param {Date} date - Date object
 * @param {boolean} includeDate - Whether to include the date
 * @returns {string}
 */
export function formatTime(date, includeDate = false) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    const timeOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    if (includeDate) {
        return date.toLocaleString('en-US', {
            ...timeOptions,
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    return date.toLocaleTimeString('en-US', timeOptions);
}

/**
 * Format relative time (e.g., "5 minutes ago")
 * @param {Date} date - Date object
 * @returns {string}
 */
export function formatRelativeTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) {
        return 'just now';
    }
    if (diffMins < 60) {
        return `${diffMins} min ago`;
    }
    if (diffHours < 24) {
        return `${diffHours} hr ago`;
    }

    return formatTime(date, true);
}

/**
 * Format countdown timer
 * @param {number} seconds - Seconds remaining
 * @returns {string}
 */
export function formatCountdown(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
