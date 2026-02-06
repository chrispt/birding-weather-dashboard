/**
 * Weather and birding-conditions view rendering
 * Extracted from main.js to keep the entry point focused on orchestration.
 */

import store from '../state/store.js';
import {
    formatTemperature,
    formatWindSpeed,
    formatWindDirection,
    formatPressure,
    formatVisibility,
    formatTime,
    formatRelativeTime,
    formatCountdown // kept for potential future use in this module
} from '../utils/formatting.js';
import { getWeatherDescription, getWeatherIcon } from '../config/weatherCodes.js';

// Cache frequently used DOM elements for this view
const elements = {
    // Current conditions
    currentTemp: document.getElementById('current-temp'),
    currentConditions: document.getElementById('current-conditions'),
    currentHumidity: document.getElementById('current-humidity'),
    weatherIcon: document.getElementById('weather-icon'),

    // Wind
    windSpeed: document.getElementById('wind-speed'),
    windDirection: document.getElementById('wind-direction'),
    windGusts: document.getElementById('wind-gusts'),
    windArrow: document.getElementById('wind-arrow'),

    // Visibility & fallout
    visibilityValue: document.getElementById('visibility-value'),
    visibilityFog: document.getElementById('visibility-fog'),
    falloutRisk: document.getElementById('fallout-risk'),

    // Pressure
    pressureValue: document.getElementById('pressure-value'),
    pressureTrend: document.getElementById('pressure-trend'),
    pressureChart: document.getElementById('pressure-chart'),

    // Precipitation
    precipTimeline: document.getElementById('precip-timeline'),

    // Alerts
    frontAlert: document.getElementById('front-alert'),
    frontAlertMessage: document.getElementById('front-alert-message'),

    // Meta
    lastUpdate: document.getElementById('last-update')
};

/**
 * Toggle loading state on weather widgets
 */
export function setWidgetsLoading(isLoading) {
    const widgetIds = ['current-widget', 'wind-widget', 'visibility-widget', 'precip-widget', 'pressure-widget'];
    widgetIds.forEach(id => {
        const widget = document.getElementById(id);
        if (widget) {
            widget.classList.toggle('widget--loading', isLoading);
        }
    });
}

/**
 * Render weather data to UI
 */
export function renderWeatherData(weatherData) {
    const { current, hourlyForecast } = weatherData;

    // Remove loading state from widgets
    setWidgetsLoading(false);

    // Current conditions
    if (elements.currentTemp) {
        elements.currentTemp.textContent = formatTemperature(current.temperature);
    }
    if (elements.currentConditions) {
        elements.currentConditions.textContent = getWeatherDescription(current.weatherCode);
    }
    if (elements.currentHumidity) {
        elements.currentHumidity.textContent = `Humidity: ${current.humidity}%`;
    }

    // Update weather icon
    updateWeatherIcon(current.weatherCode);

    // Wind
    if (elements.windSpeed) {
        elements.windSpeed.textContent = formatWindSpeed(current.windSpeed);
    }
    if (elements.windDirection) {
        elements.windDirection.textContent = formatWindDirection(current.windDirection);
    }
    if (elements.windGusts) {
        elements.windGusts.textContent = formatWindSpeed(current.windGusts);
    }

    // Update wind compass arrow (SVG rotation)
    // Wind direction is where wind comes FROM, arrow should point in that direction
    const rotation = current.windDirection;
    if (elements.windArrow) {
        elements.windArrow.style.transform = `rotate(${rotation}deg)`;
    }

    // Visibility
    if (elements.visibilityValue) {
        elements.visibilityValue.textContent = formatVisibility(current.visibility);
    }
    const isFoggy = current.weatherCode === 45 || current.weatherCode === 48;
    if (elements.visibilityFog) {
        elements.visibilityFog.textContent = isFoggy ? 'Foggy conditions' : '';
    }

    // Fallout risk
    const fallout = store.get('falloutRisk');
    if (fallout && elements.falloutRisk) {
        const riskClass = `fallout-${fallout.level}`;
        elements.falloutRisk.innerHTML = `Fallout risk: <span class="${riskClass}">${fallout.level}</span>`;
    }

    // Pressure
    if (elements.pressureValue) {
        elements.pressureValue.textContent = formatPressure(current.pressure);
    }
    const pressureTrend = store.get('pressureTrend');
    if (pressureTrend && elements.pressureTrend) {
        elements.pressureTrend.textContent = pressureTrend.description;
    }

    // Render pressure chart
    renderPressureChart();

    // Render precipitation timeline
    renderPrecipTimeline(hourlyForecast);

    // Render scores
    renderScores();

    // Front alert
    renderFrontAlert();

    // Last update with refresh indicator
    if (elements.lastUpdate) {
        elements.lastUpdate.textContent = `Updated ${formatRelativeTime(new Date())}`;
        elements.lastUpdate.classList.remove('refresh-flash');
        // Trigger reflow to restart animation
        void elements.lastUpdate.offsetWidth;
        elements.lastUpdate.classList.add('refresh-flash');
    }
}

/**
 * Render birding scores with animated gauges
 */
export function renderScores() {
    const isCoastal = store.get('isCoastalLocation');

    // Update widget titles and visibility based on coastal vs inland
    updateLocationBasedWidgets(isCoastal);

    // Define all score types and their store keys
    const scoreTypes = [
        { type: 'hawk', storeKey: 'hawkWatchScore', detailsId: 'hawk-details' },
        { type: 'seabird', storeKey: isCoastal ? 'seabirdScore' : 'grasslandScore', detailsId: 'seabird-details' },
        { type: 'songbird-migration', storeKey: 'songbirdMigrationScore', detailsId: 'songbird-migration-details', widgetId: 'songbird-migration-widget' },
        { type: 'songbird-activity', storeKey: 'songbirdActivityScore', detailsId: 'songbird-activity-details' },
        { type: 'shorebird', storeKey: isCoastal ? 'shorebirdScore' : 'woodlandScore', detailsId: 'shorebird-details' },
        { type: 'waterfowl', storeKey: 'waterfowlScore', detailsId: 'waterfowl-details' },
        { type: 'owling', storeKey: 'owlingScore', detailsId: 'owling-details' }
    ];

    scoreTypes.forEach(({ type, storeKey, detailsId, widgetId }) => {
        const scoreData = store.get(storeKey);

        // Handle migration widget visibility (hide when not in season)
        if (widgetId) {
            const widget = document.getElementById(widgetId);
            if (widget) {
                widget.style.display = scoreData ? '' : 'none';
            }
        }

        if (scoreData) {
            updateScoreGauge(type, scoreData);
            const detailsEl = document.getElementById(detailsId);
            if (detailsEl) {
                detailsEl.textContent = scoreData.details[0] || '';
            }
        }
    });
}

/**
 * Update widget titles based on coastal vs inland location
 */
export function updateLocationBasedWidgets(isCoastal) {
    // Seabird/Grassland widget
    const seabirdWidget = document.getElementById('seabird-widget');
    if (seabirdWidget) {
        const titleEl = seabirdWidget.querySelector('.widget__title');
        if (titleEl) {
            titleEl.textContent = isCoastal ? 'Seabird/Coastal' : 'Grassland Birds';
        }
        // Update the data-score-type for the modal
        seabirdWidget.dataset.scoreType = isCoastal ? 'seabirdScore' : 'grasslandScore';
    }

    // Shorebird/Woodland widget
    const shorebirdWidget = document.getElementById('shorebird-widget');
    if (shorebirdWidget) {
        const titleEl = shorebirdWidget.querySelector('.widget__title');
        if (titleEl) {
            titleEl.textContent = isCoastal ? 'Shorebirds' : 'Woodland Birds';
        }
        // Update the data-score-type for the modal
        shorebirdWidget.dataset.scoreType = isCoastal ? 'shorebirdScore' : 'woodlandScore';
    }
}

/**
 * Update weather icon based on weather code
 */
export function updateWeatherIcon(weatherCode) {
    if (!elements.weatherIcon) return;

    const weather = getWeatherIcon(weatherCode);

    // Update icon
    const iconSymbol = elements.weatherIcon.querySelector('.weather-icon__symbol');
    if (iconSymbol) {
        iconSymbol.textContent = weather.icon;
    }

    // Update class for glow effect
    elements.weatherIcon.className = `weather-icon weather-icon--${weather.class}`;
}

/**
 * Update a score gauge with animation
 */
export function updateScoreGauge(type, scoreData) {
    const gaugeFill = document.getElementById(`${type}-gauge-fill`);
    const gaugeValue = document.getElementById(`${type}-gauge-value`);
    const gaugeRating = document.getElementById(`${type}-gauge-rating`);

    if (!gaugeFill || !gaugeValue || !gaugeRating) return;

    const score = scoreData.score;
    const rating = scoreData.rating.toLowerCase();

    // Update displayed value
    gaugeValue.textContent = score;
    gaugeRating.textContent = scoreData.rating;

    // Set rating color class
    gaugeRating.className = `gauge-rating gauge-rating--${rating}`;

    // Calculate stroke-dashoffset for the score
    // Circumference = 2 * π * 50 ≈ 314
    const circumference = 314;
    const offset = circumference - (score / 100) * circumference;

    // Animate the gauge fill
    requestAnimationFrame(() => {
        gaugeFill.style.strokeDashoffset = offset;
    });
}

/**
 * Render pressure chart as smooth SVG curve
 */
export function renderPressureChart() {
    const history = store.get('pressureHistory') || [];
    if (history.length === 0 || !elements.pressureChart) return;

    const pressures = history.map(h => h.pressure);
    const min = Math.min(...pressures);
    const max = Math.max(...pressures);
    const range = max - min || 1;

    // Build SVG path points
    const points = pressures.map((p, i) => {
        const x = (i / (pressures.length - 1)) * 100;
        const y = 100 - ((p - min) / range) * 80 - 10; // 10-90 range, inverted for SVG
        return `${x},${y}`;
    });

    // Create smooth curve using the points
    const pathPoints = points.join(' ');

    // Get pressure trend for gradient color
    const pressureTrend = store.get('pressureTrend');
    const trendColor = pressureTrend?.trend === 'falling' || pressureTrend?.trend === 'falling_fast'
        ? 'var(--accent-orange)'
        : 'var(--accent-blue)';

    elements.pressureChart.innerHTML = `
        <svg viewBox="0 0 100 100" class="pressure-chart-svg" preserveAspectRatio="none">
            <defs>
                <linearGradient id="pressureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${trendColor}" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="${trendColor}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <!-- Area fill -->
            <polygon points="0,100 ${pathPoints} 100,100" fill="url(#pressureGradient)" class="pressure-area"/>
            <!-- Line -->
            <polyline points="${pathPoints}" class="pressure-line" style="stroke: ${trendColor}"/>
            <!-- End dot -->
            <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" class="pressure-dot" style="fill: ${trendColor}"/>
        </svg>
    `;
}

/**
 * Render precipitation timeline
 */
export function renderPrecipTimeline(forecast) {
    if (!elements.precipTimeline || !forecast || forecast.length === 0) return;

    const next12 = forecast.slice(0, 12);

    elements.precipTimeline.innerHTML = next12.map((hour, i) => {
        const prob = hour.precipProbability || 0;
        const height = Math.max(prob * 0.5, 2); // 2-50px based on probability
        const time = new Date(hour.time);
        const label = i % 3 === 0 ? formatTime(time) : '';

        return `
            <div class="precip-timeline__hour">
                <div class="precip-timeline__bar" style="height: ${height}px;" title="${prob}%"></div>
                <span class="precip-timeline__label">${label}</span>
            </div>
        `;
    }).join('');
}

/**
 * Render front passage alert
 */
export function renderFrontAlert() {
    const front = store.get('frontPassageAlert');
    if (!elements.frontAlert || !elements.frontAlertMessage) return;

    if (front && front.detected) {
        elements.frontAlertMessage.textContent = front.message;
        elements.frontAlert.classList.remove('hidden');
        elements.frontAlert.className = `alert alert--${front.birdingImpact === 'positive' ? 'success' : 'warning'}`;
    } else {
        elements.frontAlert.classList.add('hidden');
    }
}

