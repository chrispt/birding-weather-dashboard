/**
 * Application constants and configuration
 */

// API endpoints
export const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
export const EBIRD_API_BASE = 'https://api.ebird.org/v2';

// Weather parameters to fetch from Open-Meteo
export const WEATHER_PARAMS = [
    'temperature_2m',
    'relative_humidity_2m',
    'precipitation',
    'precipitation_probability',
    'weather_code',
    'surface_pressure',
    'visibility',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m'
].join(',');

// Refresh intervals
export const REFRESH_INTERVAL_SECONDS = 30 * 60; // 30 minutes

// Thresholds
export const STALE_THRESHOLD_MINUTES = 45;

// localStorage keys
export const STORAGE_KEYS = {
    NIGHT_MODE: 'birdingWeather_nightMode',
    EBIRD_API_KEY: 'birdingWeather_ebirdApiKey',
    TEMP_UNIT: 'birdingWeather_tempUnit',
    SPEED_UNIT: 'birdingWeather_speedUnit',
    PRESSURE_UNIT: 'birdingWeather_pressureUnit',
    MAP_TILE_MODE: 'birdingWeather_mapTileMode',
    LAST_LOCATION: 'birdingWeather_lastLocation'
};

// Default settings
export const DEFAULTS = {
    TEMP_UNIT: 'F',
    SPEED_UNIT: 'mph',
    PRESSURE_UNIT: 'inHg',
    HOTSPOT_RADIUS_KM: 25,
    FORECAST_DAYS: 3,
    PAST_DAYS: 1
};

// Weather code descriptions (WMO codes)
export const WEATHER_CODES = {
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
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
};

// Wind direction labels
export const WIND_DIRECTIONS = [
    { min: 348.75, max: 360, label: 'N' },
    { min: 0, max: 11.25, label: 'N' },
    { min: 11.25, max: 33.75, label: 'NNE' },
    { min: 33.75, max: 56.25, label: 'NE' },
    { min: 56.25, max: 78.75, label: 'ENE' },
    { min: 78.75, max: 101.25, label: 'E' },
    { min: 101.25, max: 123.75, label: 'ESE' },
    { min: 123.75, max: 146.25, label: 'SE' },
    { min: 146.25, max: 168.75, label: 'SSE' },
    { min: 168.75, max: 191.25, label: 'S' },
    { min: 191.25, max: 213.75, label: 'SSW' },
    { min: 213.75, max: 236.25, label: 'SW' },
    { min: 236.25, max: 258.75, label: 'WSW' },
    { min: 258.75, max: 281.25, label: 'W' },
    { min: 281.25, max: 303.75, label: 'WNW' },
    { min: 303.75, max: 326.25, label: 'NW' },
    { min: 326.25, max: 348.75, label: 'NNW' }
];
