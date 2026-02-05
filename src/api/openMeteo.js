/**
 * Open-Meteo Weather API client
 * Free API, no key required
 * https://open-meteo.com/
 */

import { fetchWithErrorHandling } from './client.js';
import { OPEN_METEO_BASE, WEATHER_PARAMS, DEFAULTS } from '../config/constants.js';

/**
 * Fetch weather forecast from Open-Meteo
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {object} options - Optional settings
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function fetchWeatherForecast(lat, lon, options = {}) {
    const {
        forecastDays = DEFAULTS.FORECAST_DAYS,
        pastDays = DEFAULTS.PAST_DAYS
    } = options;

    const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        hourly: WEATHER_PARAMS,
        past_days: pastDays,
        forecast_days: forecastDays,
        timezone: 'auto'
    });

    const url = `${OPEN_METEO_BASE}?${params.toString()}`;
    const { data, error } = await fetchWithErrorHandling(url);

    if (error) {
        return { data: null, error };
    }

    // Transform the data into a more usable format
    const transformed = transformWeatherData(data);
    return { data: transformed, error: null };
}

/**
 * Transform Open-Meteo response into application format
 */
function transformWeatherData(apiData) {
    const { hourly, hourly_units } = apiData;

    if (!hourly || !hourly.time) {
        return null;
    }

    // Find current hour index
    const now = new Date();
    const currentHourIndex = findCurrentHourIndex(hourly.time, now);

    // Build hourly forecast array
    const hourlyForecast = hourly.time.map((time, i) => ({
        time: new Date(time),
        temperature: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        precipitation: hourly.precipitation[i],
        precipProbability: hourly.precipitation_probability[i],
        weatherCode: hourly.weather_code[i],
        pressure: hourly.surface_pressure[i],
        visibility: hourly.visibility[i],
        windSpeed: hourly.wind_speed_10m[i],
        windDirection: hourly.wind_direction_10m[i],
        windGusts: hourly.wind_gusts_10m[i]
    }));

    // Current weather (closest hour)
    const current = currentHourIndex >= 0 ? hourlyForecast[currentHourIndex] : hourlyForecast[0];

    // Pressure history (past hours for trend analysis)
    const pressureHistory = hourlyForecast
        .filter((h, i) => i <= currentHourIndex)
        .slice(-12) // Last 12 hours
        .map(h => ({
            time: h.time,
            pressure: h.pressure
        }));

    // Temperature history for front detection
    const tempHistory = hourlyForecast
        .filter((h, i) => i <= currentHourIndex)
        .slice(-12)
        .map(h => ({
            time: h.time,
            temp: h.temperature
        }));

    // Precipitation in last 6 hours
    const precipLast6h = hourlyForecast
        .filter((h, i) => i <= currentHourIndex)
        .slice(-6)
        .reduce((sum, h) => sum + (h.precipitation || 0), 0);

    return {
        current,
        hourlyForecast: hourlyForecast.filter((h, i) => i >= currentHourIndex).slice(0, 48),
        pressureHistory,
        tempHistory,
        precipLast6h,
        units: hourly_units,
        fetchedAt: new Date()
    };
}

/**
 * Find the index of the current hour in the time array
 */
function findCurrentHourIndex(times, now) {
    const nowHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    for (let i = 0; i < times.length; i++) {
        const time = new Date(times[i]);
        if (time >= nowHour) {
            return i;
        }
    }
    return times.length - 1;
}

/**
 * Get weather description from WMO code
 */
export function getWeatherDescription(code) {
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with hail',
        99: 'Thunderstorm with heavy hail'
    };
    return descriptions[code] || 'Unknown';
}
