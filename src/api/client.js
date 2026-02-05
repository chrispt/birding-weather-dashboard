/**
 * API client with error handling
 * Adapted from BirdPage pattern
 */

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    constructor(message, status = 0, response = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.response = response;
    }
}

/**
 * Fetch wrapper with consistent error handling
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<{data: any, error: ApiError|null}>}
 */
export async function fetchWithErrorHandling(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Accept': 'application/json'
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, mergedOptions);

        if (!response.ok) {
            throw new ApiError(
                `API error: ${response.status} ${response.statusText}`,
                response.status,
                response
            );
        }

        const data = await response.json();
        return { data, error: null };

    } catch (error) {
        if (error instanceof ApiError) {
            console.error('API Error:', error.message);
            return { data: null, error };
        }

        // Network error or other failure
        console.error('Network Error:', error.message);
        return {
            data: null,
            error: new ApiError(error.message, 0, null)
        };
    }
}

/**
 * Sanitize error message for display
 * Prevents potential XSS from error messages
 */
export function sanitizeErrorMessage(message) {
    if (typeof message !== 'string') {
        return 'An unknown error occurred';
    }
    // Basic HTML entity encoding
    return message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
