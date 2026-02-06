/**
 * Shared location list rendering with event delegation.
 * Deduplicates the render-innerHTML-then-attach-handlers pattern
 * used by recent locations, saved locations, and search results.
 */

/**
 * Render a list of location items into a container using event delegation.
 * @param {HTMLElement} container - The DOM element to render into
 * @param {Array<{lat: number, lon: number, name: string}>} locations
 * @param {Object} options
 * @param {Function} options.onSelect - Called with (lat, lon, name) when a location is clicked
 * @param {boolean} [options.showDelete=false] - Whether to show delete buttons
 * @param {Function} [options.onDelete] - Called with (name) when delete is clicked
 */
export function renderLocationList(container, locations, options) {
    const { onSelect, showDelete = false, onDelete = null } = options;

    if (!locations || locations.length === 0) {
        container.innerHTML = '';
        removeHandler(container);
        return;
    }

    if (showDelete) {
        container.innerHTML = locations.map(loc => `
            <div class="location-dropdown__item location-dropdown__item--saved" data-lat="${loc.lat}" data-lon="${loc.lon}" data-name="${loc.name}">
                <span>${loc.name}</span>
                <button class="delete-btn" data-name="${loc.name}">\u00d7</button>
            </div>
        `).join('');
    } else {
        container.innerHTML = locations.map(loc => `
            <button class="location-dropdown__item" data-lat="${loc.lat}" data-lon="${loc.lon}" data-name="${loc.name}">
                ${loc.name}
            </button>
        `).join('');
    }

    // Remove previous handler to avoid stacking, then attach new one
    removeHandler(container);

    const handler = (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn && onDelete) {
            e.stopPropagation();
            onDelete(deleteBtn.dataset.name);
            return;
        }

        const item = e.target.closest('[data-lat]');
        if (item && onSelect) {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            const name = item.dataset.name;
            onSelect(lat, lon, name);
        }
    };

    container._locationListHandler = handler;
    container.addEventListener('click', handler);
}

/**
 * Read a JSON array from localStorage with error handling.
 * @param {string} key - localStorage key
 * @returns {Array}
 */
export function getStoredLocations(key) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function removeHandler(container) {
    if (container._locationListHandler) {
        container.removeEventListener('click', container._locationListHandler);
        container._locationListHandler = null;
    }
}
