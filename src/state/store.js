import { STORAGE_KEYS, REFRESH_INTERVAL_SECONDS } from '../config/constants.js';

/**
 * Centralized state management store
 * Adapted from BirdPage pattern
 */

const initialState = {
    // Location
    userLat: null,
    userLon: null,
    locationName: null,
    selectedHotspot: null,
    isCoastalLocation: null,
    coastType: null,

    // Weather Data
    currentWeather: null,
    hourlyForecast: [],
    pressureHistory: [],
    lastFetchTime: null,

    // eBird Data
    nearbyHotspots: [],

    // Computed Birding Conditions
    hawkWatchScore: null,
    seabirdScore: null,
    falloutRisk: null,
    frontPassageAlert: null,
    pressureTrend: null,

    // Timer State
    countdownSeconds: REFRESH_INTERVAL_SECONDS,
    countdownInterval: null,

    // UI State
    isLoading: false,
    error: null,
    activeWidget: null,

    // User Preferences (synced to localStorage)
    nightModeEnabled: false,
    ebirdApiKey: '',
    tempUnit: 'F',
    speedUnit: 'mph',
    pressureUnit: 'inHg',
    mapTileMode: 'dark'
};

// Keys that should be persisted to localStorage
const PERSISTED_KEYS = [
    'nightModeEnabled',
    'ebirdApiKey',
    'tempUnit',
    'speedUnit',
    'pressureUnit',
    'mapTileMode'
];

class Store {
    constructor() {
        this._state = { ...initialState };
        this._listeners = new Map();
        this._hydrateFromStorage();
    }

    /**
     * Get the entire state object (read-only snapshot)
     */
    getState() {
        return { ...this._state };
    }

    /**
     * Get a specific state value
     */
    get(key) {
        return this._state[key];
    }

    /**
     * Set a specific state value
     */
    set(key, value) {
        const oldValue = this._state[key];

        // Skip if value hasn't changed (for primitives)
        if (oldValue === value) return;

        this._state[key] = value;
        this._notifyListeners(key, value, oldValue);

        // Persist to localStorage if applicable
        if (PERSISTED_KEYS.includes(key)) {
            this._persistToStorage(key, value);
        }
    }

    /**
     * Update multiple state values at once
     */
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.set(key, value);
        });
    }

    /**
     * Subscribe to changes on a specific key
     * Returns an unsubscribe function
     */
    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);

        // Return unsubscribe function
        return () => {
            const listeners = this._listeners.get(key);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }

    /**
     * Subscribe to any state change
     */
    subscribeAll(callback) {
        const key = '*';
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);

        return () => {
            const listeners = this._listeners.get(key);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }

    /**
     * Reset a key to its initial value
     */
    reset(key) {
        if (key in initialState) {
            this.set(key, initialState[key]);
        }
    }

    /**
     * Reset all state to initial values
     */
    resetAll() {
        Object.keys(initialState).forEach(key => {
            this._state[key] = initialState[key];
        });
    }

    // Private methods

    _notifyListeners(key, newValue, oldValue) {
        // Notify specific key listeners
        if (this._listeners.has(key)) {
            this._listeners.get(key).forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in state listener for "${key}":`, error);
                }
            });
        }

        // Notify global listeners
        if (this._listeners.has('*')) {
            this._listeners.get('*').forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error('Error in global state listener:', error);
                }
            });
        }
    }

    _hydrateFromStorage() {
        // Load boolean preferences
        const booleanKeys = ['nightModeEnabled'];
        booleanKeys.forEach(key => {
            const storageKey = STORAGE_KEYS[this._toStorageKeyName(key)];
            const stored = localStorage.getItem(storageKey || key);
            if (stored !== null) {
                this._state[key] = stored === 'true';
            }
        });

        // Load string preferences
        const stringKeys = ['ebirdApiKey', 'tempUnit', 'speedUnit', 'pressureUnit', 'mapTileMode'];
        stringKeys.forEach(key => {
            const storageKey = STORAGE_KEYS[this._toStorageKeyName(key)];
            const stored = localStorage.getItem(storageKey || key);
            if (stored !== null) {
                this._state[key] = stored;
            }
        });

        // Load last known location
        try {
            const lastLocation = localStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
            if (lastLocation) {
                const { lat, lon, name } = JSON.parse(lastLocation);
                this._state.userLat = lat;
                this._state.userLon = lon;
                this._state.locationName = name;
            }
        } catch (error) {
            console.error('Failed to parse last location from localStorage:', error);
        }
    }

    _persistToStorage(key, value) {
        const storageKey = STORAGE_KEYS[this._toStorageKeyName(key)] || key;

        try {
            if (typeof value === 'boolean') {
                localStorage.setItem(storageKey, String(value));
            } else if (typeof value === 'string') {
                localStorage.setItem(storageKey, value);
            } else {
                localStorage.setItem(storageKey, JSON.stringify(value));
            }
        } catch (error) {
            console.error(`Failed to persist "${key}" to localStorage:`, error);
        }
    }

    _toStorageKeyName(camelCaseKey) {
        // Convert camelCase to SCREAMING_SNAKE_CASE for STORAGE_KEYS lookup
        return camelCaseKey
            .replace(/([A-Z])/g, '_$1')
            .toUpperCase();
    }
}

// Create singleton instance
export const store = new Store();

// Export default for convenience
export default store;
