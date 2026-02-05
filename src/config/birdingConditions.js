/**
 * Birding-specific weather condition scoring and thresholds
 * Based on birding literature and field experience
 */

/**
 * Hawk Watch Scoring
 * Ideal conditions: NW winds 10-25 mph, clear visibility
 * @param {number} windDir - Wind direction in degrees (0-360)
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} visibility - Visibility in meters
 * @returns {object} Score (0-100) and rating
 */
export function scoreHawkWatch(windDir, windSpeed, visibility) {
    let score = 50; // baseline

    // Wind direction scoring (NW winds ideal for eastern ridges)
    // W (270) through NE (45) are favorable
    const favorableDir = isWindInRange(windDir, 250, 70);
    const idealDir = isWindInRange(windDir, 290, 360) || isWindInRange(windDir, 0, 45);

    if (idealDir) {
        score += 20;
    } else if (favorableDir) {
        score += 10;
    } else {
        score -= 15; // SE-SW winds not great for hawk watching
    }

    // Wind speed scoring (10-25 mph ideal)
    if (windSpeed >= 10 && windSpeed <= 25) {
        score += 20;
    } else if (windSpeed >= 5 && windSpeed < 10) {
        score += 10;
    } else if (windSpeed > 25 && windSpeed <= 35) {
        score += 5;
    } else if (windSpeed > 35) {
        score -= 20; // too windy, birds may not fly
    } else if (windSpeed < 5) {
        score -= 10; // too calm, less lift
    }

    // Visibility scoring (need good visibility to spot birds)
    const visibilityMiles = visibility / 1609.34;
    if (visibilityMiles > 10) {
        score += 10;
    } else if (visibilityMiles >= 5) {
        score += 5;
    } else if (visibilityMiles < 2) {
        score -= 20;
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details: getHawkWatchDetails(windDir, windSpeed, visibilityMiles)
    };
}

/**
 * Seabird/Coastal Scoring
 * Ideal: Onshore winds 15+ mph, recent storms
 * @param {number} windDir - Wind direction in degrees
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} precipitation - Recent precipitation in mm
 * @param {string} coastOrientation - 'east', 'west', 'gulf' - determines onshore direction
 * @returns {object} Score and rating
 */
export function scoreSeabirding(windDir, windSpeed, precipitation, coastOrientation = 'east') {
    let score = 40;

    // Determine onshore wind range based on coast
    const onshoreRanges = {
        east: { min: 45, max: 180 },    // NE to S winds push birds to East Coast
        west: { min: 225, max: 360 },   // SW to N winds push birds to West Coast
        gulf: { min: 135, max: 270 }    // SE to W winds push birds to Gulf Coast
    };

    const range = onshoreRanges[coastOrientation] || onshoreRanges.east;
    const isOnshore = isWindInRange(windDir, range.min, range.max);

    if (isOnshore) {
        score += 25;
    } else {
        score -= 10; // offshore winds push birds away
    }

    // Wind speed (stronger = more birds pushed in)
    if (windSpeed >= 25) {
        score += 25; // storm-driven birds
    } else if (windSpeed >= 20) {
        score += 20;
    } else if (windSpeed >= 15) {
        score += 15;
    } else if (windSpeed >= 10) {
        score += 5;
    } else {
        score -= 10; // calm conditions = birds stay offshore
    }

    // Recent precipitation bonus (storms push pelagics closer)
    if (precipitation > 5) {
        score += 10;
    } else if (precipitation > 0) {
        score += 5;
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details: getSeabirdDetails(windDir, windSpeed, isOnshore)
    };
}

/**
 * Songbird Migration Score (Spring/Fall only)
 * Factors that affect whether migrants are arriving/present
 * @param {number} windDir - Wind direction in degrees
 * @param {string} pressureTrend - 'rising', 'falling', 'steady', etc.
 * @param {string} season - 'spring', 'fall', or 'winter'
 * @returns {object|null} Score and rating, or null if not migration season
 */
export function scoreSongbirdMigration(windDir, pressureTrend, season) {
    // Return null if not in migration season
    if (season !== 'spring' && season !== 'fall') {
        return null;
    }

    let score = 40;
    const details = [];

    // Wind direction (seasonal) - 20 pts max
    const favorableDir = season === 'spring'
        ? isWindInRange(windDir, 135, 270)  // S/SW winds in spring
        : isWindInRange(windDir, 270, 45);   // NW/N winds in fall

    if (favorableDir) {
        score += 20;
        details.push('Favorable winds for migration');
    } else {
        score -= 5;
        details.push('Headwinds slowing migration');
    }

    // Pressure trend - 20 pts max
    // Rising-fast = post-front = birds concentrated (best!)
    if (pressureTrend === 'rising-fast') {
        score += 20;
        details.push('Post-front - migrants concentrated');
    } else if (pressureTrend === 'rising') {
        score += 15;
        details.push('Rising pressure - birds moving');
    } else if (pressureTrend === 'falling') {
        score += 5;
        details.push('Pre-front conditions');
    } else if (pressureTrend === 'falling-fast') {
        score -= 5;
        details.push('Storm approaching - birds grounded');
    } else {
        score += 10;
        details.push('Steady conditions');
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details
    };
}

/**
 * Songbird Activity Score (Year-round)
 * Factors that affect whether birds are visible/active
 * @param {number} temp - Temperature in Fahrenheit
 * @param {number} weatherCode - WMO weather code
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} hour - Hour of day (0-23)
 * @returns {object} Score and rating
 */
export function scoreSongbirdActivity(temp, weatherCode, windSpeed, hour = 7) {
    let score = 40;
    const details = [];

    // Time of day - songbirds most active at dawn and dusk
    const isDawn = hour >= 5 && hour < 9;
    const isDusk = hour >= 17 && hour < 20;
    const isMidday = hour >= 12 && hour < 15;

    if (isDawn) {
        score += 15;
        details.push('Dawn chorus - peak activity');
    } else if (isDusk) {
        score += 10;
        details.push('Evening activity');
    } else if (isMidday) {
        score -= 10;
        details.push('Midday lull');
    }

    // Weather conditions - 25 pts max
    if (weatherCode <= 2) {
        score += 25;
        details.push('Clear skies - birds active');
    } else if (weatherCode === 3) {
        score += 20;
        details.push('Overcast - extended activity');
    } else if (weatherCode >= 45 && weatherCode < 50) {
        score += 10;
        details.push('Foggy - check sheltered areas');
    } else if (weatherCode >= 50 && weatherCode < 80) {
        score -= 5;
        details.push('Light precip - reduced activity');
    } else if (weatherCode >= 80) {
        score -= 15;
        details.push('Heavy precip - birds sheltering');
    }

    // Temperature - 15 pts max
    if (temp >= 50 && temp <= 75) {
        score += 15;
        details.push('Ideal temps for activity');
    } else if (temp >= 40 && temp < 50) {
        score += 10;
        details.push('Cool - morning activity best');
    } else if (temp < 40) {
        score += 5;
        details.push('Cold - check feeders');
    } else if (temp > 85) {
        score -= 10;
        details.push('Hot - early morning only');
    } else if (temp > 75) {
        score += 5;
        details.push('Warm - avoid midday');
    }

    // Wind speed - 15 pts max
    if (windSpeed < 8) {
        score += 15;
        details.push('Calm winds - easy spotting');
    } else if (windSpeed < 15) {
        score += 10;
        details.push('Light winds - good conditions');
    } else if (windSpeed > 25) {
        score -= 15;
        details.push('Very windy - birds hunkered down');
    } else if (windSpeed > 18) {
        score -= 5;
        details.push('Breezy - check sheltered spots');
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details
    };
}

/**
 * Shorebird Scoring
 * Ideal: Onshore winds, recent rain, good visibility, calm conditions
 * @param {number} windDir - Wind direction in degrees
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} precipLast6h - Precipitation in last 6 hours (mm)
 * @param {number} visibility - Visibility in meters
 * @returns {object} Score and rating
 */
export function scoreShorebirds(windDir, windSpeed, precipLast6h, visibility) {
    let score = 40;
    const details = [];

    // Onshore winds (NE through S)
    if (isWindInRange(windDir, 45, 180)) {
        score += 25;
        details.push('Onshore winds');
    } else {
        score -= 5;
        details.push('Offshore winds');
    }

    // Recent rain exposes mudflats
    if (precipLast6h > 2) {
        score += 15;
        details.push('Recent rain - exposed mudflats');
    } else if (precipLast6h > 0) {
        score += 10;
        details.push('Light recent rain');
    }

    // Visibility for spotting
    const visibilityMiles = visibility / 1609.34;
    if (visibilityMiles > 8) {
        score += 15;
        details.push('Good visibility');
    } else if (visibilityMiles < 2) {
        score -= 10;
        details.push('Poor visibility');
    }

    // Light winds best for feeding
    if (windSpeed < 15) {
        score += 10;
        details.push('Calm conditions for feeding');
    } else if (windSpeed > 25) {
        score -= 10;
        details.push('Too windy');
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details
    };
}

/**
 * Waterfowl Scoring
 * Ideal: Cold temps, moderate wind, clear conditions, falling pressure
 * @param {number} temp - Temperature in Fahrenheit
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} visibility - Visibility in meters
 * @param {string} pressureTrend - Pressure trend
 * @returns {object} Score and rating
 */
export function scoreWaterfowl(temp, windSpeed, visibility, pressureTrend) {
    let score = 40;
    const details = [];

    // Cold temps push birds south
    if (temp < 35) {
        score += 25;
        details.push('Prime waterfowl weather');
    } else if (temp < 50) {
        score += 20;
        details.push('Cold temps moving ducks');
    } else if (temp > 60) {
        score -= 10;
        details.push('Too warm for waterfowl activity');
    }

    // Moderate winds
    if (windSpeed >= 10 && windSpeed <= 20) {
        score += 15;
        details.push('Good flight conditions');
    } else if (windSpeed > 30) {
        score -= 10;
        details.push('Winds too strong');
    } else if (windSpeed < 5) {
        score += 5;
        details.push('Calm - birds rafting');
    }

    // Visibility
    const visibilityMiles = visibility / 1609.34;
    if (visibilityMiles > 8) {
        score += 15;
        details.push('Clear skies');
    } else if (visibilityMiles < 2) {
        score -= 5;
    }

    // Falling pressure (approaching storm)
    if (pressureTrend === 'falling' || pressureTrend === 'falling-fast') {
        score += 10;
        details.push('Storm pushing birds');
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details
    };
}

/**
 * Owling/Nocturnal Scoring
 * Ideal: Calm winds, cool temps, clear skies, low humidity, NIGHTTIME
 * @param {number} windSpeed - Wind speed in mph
 * @param {number} temp - Temperature in Fahrenheit
 * @param {number} weatherCode - WMO weather code
 * @param {number} humidity - Relative humidity percentage
 * @param {number} hour - Hour of day (0-23)
 * @returns {object} Score and rating
 */
export function scoreOwling(windSpeed, temp, weatherCode, humidity, hour = 21) {
    let score = 45;
    const details = [];

    // Time of day - critical for owling
    const isNight = hour >= 20 || hour < 6;
    const isTwilight = (hour >= 6 && hour < 10) || (hour >= 18 && hour < 20);
    const isDaytime = hour >= 10 && hour < 18;

    if (isNight) {
        score += 30;
        details.push('Prime owling hours');
    } else if (isTwilight) {
        score += 10;
        details.push('Twilight - some owl activity');
    } else if (isDaytime) {
        score -= 40;
        details.push('Daytime - owls roosting');
    }

    // Calm winds essential
    if (windSpeed < 8) {
        score += 20;
        details.push('Calm winds - owls active');
    } else if (windSpeed > 15) {
        score -= 20;
        details.push('Too windy for owling');
    } else {
        score += 5;
    }

    // Cool temps (40-50°F ideal)
    if (temp >= 35 && temp <= 55) {
        score += 15;
        details.push('Ideal temps for owling');
    } else if (temp < 25) {
        score -= 10;
        details.push('Very cold - reduced activity');
    } else if (temp > 65) {
        score -= 5;
    }

    // Clear or partly cloudy (weather codes 0-2)
    if (weatherCode <= 1) {
        score += 20;
        details.push('Clear skies');
    } else if (weatherCode <= 3) {
        score += 10;
        details.push('Partly cloudy');
    } else if (weatherCode >= 50) {
        score -= 15;
        details.push('Precipitation - owls less active');
    }

    // Low humidity (sound carries better)
    if (humidity < 70) {
        score += 10;
        details.push('Low humidity - good acoustics');
    } else if (humidity > 90) {
        score -= 5;
        details.push('High humidity');
    }

    score = Math.max(0, Math.min(100, score));

    return {
        score,
        rating: getScoreRating(score),
        details
    };
}

/**
 * Fallout Risk Assessment
 * High risk when migrants forced down by weather
 * @param {number} visibility - Visibility in meters
 * @param {number} humidity - Relative humidity percentage
 * @param {number} precipLast6h - Precipitation in last 6 hours (mm)
 * @param {string} pressureTrend - 'rising', 'falling', 'steady', 'falling-fast'
 * @returns {object} Risk level and message
 */
export function assessFalloutRisk(visibility, humidity, precipLast6h, pressureTrend) {
    let riskScore = 0;

    // Low visibility forces migrants down
    if (visibility < 2000) {
        riskScore += 4;
    } else if (visibility < 5000) {
        riskScore += 3;
    } else if (visibility < 8000) {
        riskScore += 1;
    }

    // High humidity often indicates fog/low clouds
    if (humidity > 90) {
        riskScore += 3;
    } else if (humidity > 85) {
        riskScore += 2;
    } else if (humidity > 75) {
        riskScore += 1;
    }

    // Recent precipitation
    if (precipLast6h > 5) {
        riskScore += 3;
    } else if (precipLast6h > 0) {
        riskScore += 2;
    }

    // Falling pressure = incoming weather system
    if (pressureTrend === 'falling-fast') {
        riskScore += 2;
    } else if (pressureTrend === 'falling') {
        riskScore += 1;
    }

    if (riskScore >= 7) {
        return { level: 'high', message: 'Strong fallout potential - check local hotspots!' };
    } else if (riskScore >= 4) {
        return { level: 'moderate', message: 'Moderate fallout conditions - migrants may be grounded' };
    }
    return { level: 'low', message: 'Normal conditions - migrants likely moving through' };
}

/**
 * Analyze pressure trend from historical data
 * @param {Array} pressureHistory - Array of {time: Date, pressure: number} in hPa/mb
 * @returns {object} Trend info
 */
export function analyzePressureTrend(pressureHistory) {
    if (!pressureHistory || pressureHistory.length < 2) {
        return { trend: 'unknown', change: 0, description: 'Insufficient data' };
    }

    const oldest = pressureHistory[0];
    const newest = pressureHistory[pressureHistory.length - 1];

    const hoursDiff = (new Date(newest.time) - new Date(oldest.time)) / 3600000;
    if (hoursDiff < 1) {
        return { trend: 'unknown', change: 0, description: 'Insufficient time span' };
    }

    const totalChange = newest.pressure - oldest.pressure;
    const changePer3Hr = (totalChange / hoursDiff) * 3;

    let trend, description;
    if (changePer3Hr >= 2.0) {
        trend = 'rising-fast';
        description = 'Rising rapidly';
    } else if (changePer3Hr >= 0.5) {
        trend = 'rising';
        description = 'Rising';
    } else if (changePer3Hr <= -2.0) {
        trend = 'falling-fast';
        description = 'Falling rapidly';
    } else if (changePer3Hr <= -0.5) {
        trend = 'falling';
        description = 'Falling';
    } else {
        trend = 'steady';
        description = 'Steady';
    }

    return {
        trend,
        change: changePer3Hr,
        description,
        oldValue: oldest.pressure,
        newValue: newest.pressure
    };
}

/**
 * Detect front passage from weather data
 * @param {Array} pressureHistory - Pressure readings
 * @param {Array} tempHistory - Temperature readings
 * @returns {object} Front detection info
 */
export function detectFrontPassage(pressureHistory, tempHistory) {
    const pressureTrend = analyzePressureTrend(pressureHistory);

    if (!tempHistory || tempHistory.length < 2) {
        return { detected: false };
    }

    // Calculate temperature change over last 6 hours
    const recentTemps = tempHistory.slice(-7); // ~6 hours of hourly data
    if (recentTemps.length < 2) {
        return { detected: false };
    }

    const tempChange = recentTemps[recentTemps.length - 1].temp - recentTemps[0].temp;

    // Cold front: pressure falling/fallen + significant temp drop
    if ((pressureTrend.trend === 'falling' || pressureTrend.trend === 'falling-fast') && tempChange < -5) {
        return {
            detected: true,
            type: 'cold',
            message: 'Cold front approaching - great conditions for hawk watching!',
            birdingImpact: 'positive',
            tempChange
        };
    }

    // Warm front: pressure falling + temp rise
    if ((pressureTrend.trend === 'falling' || pressureTrend.trend === 'falling-fast') && tempChange > 5) {
        return {
            detected: true,
            type: 'warm',
            message: 'Warm front approaching - watch for fog and low clouds',
            birdingImpact: 'mixed',
            tempChange
        };
    }

    // Post-frontal (pressure rising after drop, clearing conditions)
    if (pressureTrend.trend === 'rising-fast' && tempChange < -3) {
        return {
            detected: true,
            type: 'post-cold',
            message: 'Cold front passed - clear skies, good visibility expected',
            birdingImpact: 'positive',
            tempChange
        };
    }

    return { detected: false };
}

// Helper functions

function isWindInRange(dir, min, max) {
    if (min <= max) {
        return dir >= min && dir <= max;
    }
    // Handle wrap-around (e.g., 350-30)
    return dir >= min || dir <= max;
}

function getScoreRating(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 35) return 'Poor';
    return 'Unfavorable';
}

function getHawkWatchDetails(windDir, windSpeed, visibilityMiles) {
    const details = [];

    if (isWindInRange(windDir, 290, 360) || isWindInRange(windDir, 0, 45)) {
        details.push('Ideal NW-NE wind direction');
    } else if (isWindInRange(windDir, 250, 70)) {
        details.push('Favorable wind direction');
    } else {
        details.push('Wind direction not optimal');
    }

    if (windSpeed >= 10 && windSpeed <= 25) {
        details.push(`Good wind speed (${windSpeed} mph)`);
    } else if (windSpeed > 35) {
        details.push('Winds may be too strong');
    } else if (windSpeed < 5) {
        details.push('Winds too light for good lift');
    }

    if (visibilityMiles > 10) {
        details.push('Excellent visibility');
    } else if (visibilityMiles < 2) {
        details.push('Poor visibility');
    }

    return details;
}

function getSeabirdDetails(windDir, windSpeed, isOnshore) {
    const details = [];

    if (isOnshore) {
        details.push('Onshore winds pushing birds closer');
    } else {
        details.push('Offshore winds - birds staying out');
    }

    if (windSpeed >= 25) {
        details.push('Storm-force winds excellent for pelagics');
    } else if (windSpeed >= 15) {
        details.push('Good wind speed for seabirding');
    } else if (windSpeed < 10) {
        details.push('Light winds - birds likely offshore');
    }

    return details;
}
