### Birding Weather Dashboard Architecture

This document summarizes the current high–level structure of the app after the refactor.

#### Runtime flow

1. **Entry point**: `src/main.js`
   - Wires together the centralized `store`, geolocation, weather APIs, eBird APIs, and UI modules.
   - On `DOMContentLoaded`, it:
     - Initializes settings + location.
     - Loads weather and hotspot data.
     - Initializes the Leaflet map view.
     - Starts the automatic refresh timer.

2. **State management**: `src/state/store.js`
   - Singleton store holding:
     - Location (`userLat`, `userLon`, `locationName`, coastal flags).
     - Weather + derived birding conditions.
     - Nearby hotspots.
     - User preferences (units, map style, eBird API key).
   - Persists selected keys to `localStorage` using `STORAGE_KEYS` from `src/config/constants.js`.
   - Provides `get`, `set`, `update`, and subscription APIs for reactive UI updates.

3. **Configuration & constants**: `src/config`
   - `constants.js`: API endpoints, refresh intervals, thresholds, storage keys, wind direction lookup, and shared weather–code metadata.
   - `birdingConditions.[js|ts]`: Pure scoring functions for hawk watch, seabirds/shorebirds vs grassland/woodland, songbird migration/activity, waterfowl, owling, fallout risk, and pressure/front analysis.

4. **APIs**: `src/api`
   - `client.js`: Thin `fetchWithErrorHandling` wrapper with a typed `ApiError` and safe message sanitization for display.
   - `openMeteo.js`: Calls Open‑Meteo, then normalizes the hourly response into:
     - `current` (current hour snapshot).
     - `hourlyForecast` (future hours).
     - `pressureHistory`, `tempHistory`, `precipLast6h`.
   - `ebird.js`: Uses the configured eBird API key to fetch:
     - Nearby hotspots around a point.
     - Recent observations for a hotspot.

5. **Geolocation & location utilities**: `src/modules/geolocation.js`
   - Multi‑stage location strategy:
     - Uses last stored location from `localStorage` for fast startup.
     - Falls back to IP–based coarse location (`ipapi.co`) if needed.
     - Optionally refines with browser GPS.
   - Exposes helpers to:
     - Check whether a location is coastal and which coast type it is.
     - Reverse–geocode coordinates to a human‑friendly label.
     - Search for addresses/POIs for the location dropdown.
     - Save and restore the last location.

6. **Formatting utilities**: `src/utils/formatting.[js|ts]`
   - Unit conversions (temperature, wind speed, pressure, visibility).
   - Presentation helpers for wind direction, human‑readable times, relative times, and countdown formatting.
   - Read unit preferences from the `store` so the rest of the app can stay unit‑agnostic.

7. **UI modules**
   - **Weather view** (`src/ui/weatherView.js`):
     - Renders current conditions, pressure chart, precipitation timeline, and birding scores based on data in the store.
     - Controls loading states for weather widgets.
   - **Map view** (`src/ui/mapView.js`):
     - Owns the Leaflet map instance, tile layers, and user/hotspot markers.
     - Reads the preferred map tile style from the store and syncs the settings UI.
   - **Modals & score details** (`src/ui/modals.js`):
     - Handles opening/closing the settings modal and the score‑details modal.
   - **Location selector** (`src/ui/locationSelector.js`):
     - Manages the location dropdown, saved/recent locations, and search results.

8. **Styles**
   - `styles/variables.css`: Design tokens (colors, spacing, typography, radii, shadows, z‑index).
   - `styles/main.css`: Layout and component styles for the dashboard (header, location bar, widgets, map, hotspots, modals, gauges).
   - An optional `styles/base.css` (introduced by this refactor) holds reset + global utility classes (`.hidden`, `.sr-only`, button base styles).

