/**
 * Settings modal — load/save user preferences.
 * Extracted from main.js to keep the entry point focused on orchestration.
 */

import store from '../state/store.js';
import { switchMapTileLayer, updateMapToggleIcon } from './mapView.js';

let els = null;
let onSettingsSaved = null;

/**
 * Initialize the settings modal and wire up event listeners.
 * @param {Object} settingsElements - DOM elements for the settings form
 * @param {Object} callbacks
 * @param {Function} callbacks.onSettingsSaved - Called after settings are persisted
 */
export function initSettings(settingsElements, callbacks) {
    els = settingsElements;
    onSettingsSaved = callbacks.onSettingsSaved;

    els.settingsBtn.addEventListener('click', () => {
        els.modal.classList.add('visible');
    });

    els.closeBtn.addEventListener('click', () => {
        els.modal.classList.remove('visible');
    });

    els.modal.addEventListener('click', (e) => {
        if (e.target === els.modal) {
            els.modal.classList.remove('visible');
        }
    });

    els.saveBtn.addEventListener('click', saveSettings);

    // Load current values into form
    loadSettingsForm();
}

function loadSettingsForm() {
    els.ebirdApiKey.value = store.get('ebirdApiKey') || '';
    els.tempUnit.value = store.get('tempUnit') || 'F';
    els.speedUnit.value = store.get('speedUnit') || 'mph';
    els.pressureUnit.value = store.get('pressureUnit') || 'inHg';
    const mapMode = store.get('mapTileMode') || 'dark';
    els.mapTileMode.value = mapMode;
    updateMapToggleIcon(mapMode);
}

function saveSettings() {
    const newTileMode = els.mapTileMode.value;

    store.update({
        ebirdApiKey: els.ebirdApiKey.value.trim(),
        tempUnit: els.tempUnit.value,
        speedUnit: els.speedUnit.value,
        pressureUnit: els.pressureUnit.value,
        mapTileMode: newTileMode
    });

    switchMapTileLayer(newTileMode);
    updateMapToggleIcon(newTileMode);

    els.modal.classList.remove('visible');

    if (onSettingsSaved) {
        onSettingsSaved();
    }
}
