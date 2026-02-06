/**
 * Hotspot card rendering with event delegation.
 * Extracted from main.js to keep the entry point focused on orchestration.
 */

let container = null;
let onHotspotSelect = null;

/**
 * Initialize the hotspots view with event delegation.
 * @param {HTMLElement} hotspotsContainer - The #hotspots DOM element
 * @param {Object} callbacks
 * @param {Function} callbacks.onHotspotSelect - (lat, lon, name) => Promise
 */
export function initHotspotsView(hotspotsContainer, callbacks) {
    container = hotspotsContainer;
    onHotspotSelect = callbacks.onHotspotSelect;

    // Single delegated click handler for all hotspot cards
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.hotspot-card');
        if (card && onHotspotSelect) {
            const lat = parseFloat(card.dataset.lat);
            const lon = parseFloat(card.dataset.lon);
            const name = card.dataset.name;
            onHotspotSelect(lat, lon, name);
        }
    });
}

/**
 * Render hotspot cards into the container.
 * @param {Array} hotspots
 */
export function renderHotspots(hotspots) {
    const headerEl = document.getElementById('hotspots-header');

    if (!hotspots || hotspots.length === 0) {
        container.innerHTML = '';
        if (headerEl) headerEl.textContent = 'Nearby Hotspots';
        return;
    }

    if (headerEl) {
        headerEl.textContent = `Nearby Hotspots (${hotspots.length})`;
    }

    const top6 = hotspots.slice(0, 6);

    container.innerHTML = top6.map(h => `
        <div class="hotspot-card" data-lat="${h.lat}" data-lon="${h.lon}" data-name="${h.name}">
            <div class="hotspot-card__name">${h.name}</div>
            <div class="hotspot-card__species">${h.speciesCount || '?'} species</div>
        </div>
    `).join('');
}
