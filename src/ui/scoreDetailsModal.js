/**
 * Score details modal — opens when a birding score widget is clicked.
 * Extracted from main.js to keep the entry point focused on orchestration.
 */

import store from '../state/store.js';

const scoreDisplayNames = {
    hawkWatchScore: 'Hawk Watch',
    seabirdScore: 'Seabird/Coastal',
    grasslandScore: 'Grassland Birds',
    songbirdMigrationScore: 'Songbird Migration',
    songbirdActivityScore: 'Songbird Activity',
    shorebirdScore: 'Shorebirds',
    woodlandScore: 'Woodland Birds',
    waterfowlScore: 'Waterfowl',
    owlingScore: 'Owling'
};

const scoreTips = {
    Excellent: "Perfect conditions! Head out now for the best birding.",
    Good: "Favorable conditions - a good day to be in the field.",
    Fair: "Moderate conditions - birding may be hit or miss.",
    Poor: "Challenging conditions - consider waiting for improvement.",
    Unfavorable: "Not ideal for this type of birding today."
};

let els = null;

/**
 * Initialize the score details modal and wire up event listeners.
 * @param {Object} modalElements - DOM elements for the modal
 */
export function initScoreDetailsModal(modalElements) {
    els = modalElements;

    // Click and keyboard handlers for score widgets
    document.querySelectorAll('.widget--score[data-score-type]').forEach(widget => {
        widget.addEventListener('click', () => {
            openScoreDetails(widget.dataset.scoreType);
        });

        widget.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openScoreDetails(widget.dataset.scoreType);
            }
        });
    });

    if (els.closeBtn) {
        els.closeBtn.addEventListener('click', closeModal);
    }

    if (els.modal) {
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.modal && !els.modal.classList.contains('hidden')) {
            closeModal();
        }
    });
}

function openScoreDetails(scoreType) {
    const scoreData = store.get(scoreType);
    if (!scoreData || !els.modal) return;

    els.title.textContent = scoreDisplayNames[scoreType] || 'Score Details';
    els.value.textContent = scoreData.score;
    els.rating.textContent = scoreData.rating;
    els.rating.className = `score-modal__rating gauge-rating--${scoreData.rating.toLowerCase()}`;

    els.factors.innerHTML = scoreData.details
        .map(detail => {
            const isNegative = detail.toLowerCase().includes('too') ||
                              detail.toLowerCase().includes('poor') ||
                              detail.toLowerCase().includes('storm') ||
                              detail.toLowerCase().includes('headwinds') ||
                              detail.toLowerCase().includes('heavy') ||
                              detail.toLowerCase().includes('unfavorable');
            return `<li class="${isNegative ? 'negative' : ''}">${detail}</li>`;
        })
        .join('');

    els.tip.textContent = scoreTips[scoreData.rating] || '';

    els.modal.classList.remove('hidden');
}

function closeModal() {
    if (els.modal) {
        els.modal.classList.add('hidden');
    }
}
