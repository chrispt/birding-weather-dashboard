/**
 * Shared weather-code descriptions and icon metadata.
 * Centralizes WMO code handling so API and UI stay in sync.
 */

import { WEATHER_CODES } from './constants.js';

// Icon + style for each weather code used by the UI
const WEATHER_ICONS = {
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

/**
 * Get human-readable description for a WMO weather code.
 */
export function getWeatherDescription(code) {
    return WEATHER_CODES[code] || 'Unknown';
}

/**
 * Get icon + CSS class metadata for a WMO weather code.
 */
export function getWeatherIcon(code) {
    return WEATHER_ICONS[code] || { icon: '🌡️', class: 'cloudy' };
}

