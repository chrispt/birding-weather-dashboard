/**
 * Small timing utilities (debounce, countdown helpers) shared across the app.
 */

/**
 * Debounce a function so it only runs after `wait` ms since the last call.
 */
export function debounce(func, wait) {
    let timeout;
    return function debounced(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

