/**
 * HabitArc Unified 60fps Live Pixel Companion Renderer (`ai-buddy.js`)
 * Renders the exact same articulated 60fps live buddy markup across Onboarding,
 * Dashboard, ARC AI Studio, Slide-up AI Sheet, and Settings.
 */
(function initHabitArcBuddy(root) {
    const VALID_IDS = new Set(['beam', 'winky', 'shades', 'nova', 'locked', 'zen']);
    const LAYER_ROOT = 'icons/ai-buddies/layers';

    function normaliseId(raw) {
        const clean = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        return VALID_IDS.has(clean) ? clean : 'beam';
    }

    function imgLayer(file, extraClass) {
        return `<img src="${LAYER_ROOT}/${file}" alt="" class="ha-live-buddy-layer ${extraClass || ''}"/>`;
    }

    function renderBuddyInnerHtml(id) {
        const buddy = normaliseId(id);
        if (buddy === 'beam') {
            return `<span class="ha-live-buddy-rig">${imgLayer('beam-base.png', 'is-base')}<span class="ha-live-buddy-beacon"></span>${imgLayer('beam-eyes.png', 'is-eyes')}${imgLayer('beam-mouth.png', 'is-mouth')}</span>`;
        }
        if (buddy === 'winky') {
            return `<span class="ha-live-buddy-rig">${imgLayer('winky-base.png', 'is-base')}${imgLayer('winky-eye-l.png', 'is-eye-l')}${imgLayer('winky-eye-open.png', 'is-eye-open')}${imgLayer('winky-eye-wink.png', 'is-eye-wink')}${imgLayer('winky-mouth.png', 'is-mouth')}${imgLayer('winky-star.png', 'is-star')}</span>`;
        }
        if (buddy === 'shades') {
            return `<span class="ha-live-buddy-rig">${imgLayer('shades-base.png', 'is-base')}<span class="ha-live-buddy-lens-mask" style="--lens-mask-url:url('${LAYER_ROOT}/shades-lens-mask.png')"><span class="ha-live-buddy-lens-sheen"></span></span></span>`;
        }
        if (buddy === 'nova') {
            return `<span class="ha-live-buddy-rig">${imgLayer('nova-base.png', 'is-base')}${imgLayer('nova-eyes.png', 'is-eyes')}${imgLayer('nova-mouth.png', 'is-mouth')}</span>`;
        }
        if (buddy === 'locked') {
            return `<span class="ha-live-buddy-rig">${imgLayer('locked-base.png', 'is-base')}<span class="ha-live-buddy-scanwrap"><span class="ha-live-buddy-scanbar"></span></span>${imgLayer('locked-eyes.png', 'is-eyes')}</span>`;
        }
        return `<span class="ha-live-buddy-rig">${imgLayer('zen-base.png', 'is-base')}${imgLayer('zen-sprout.png', 'is-sprout')}${imgLayer('zen-eyes.png', 'is-eyes')}${imgLayer('zen-mouth.png', 'is-mouth')}<span class="ha-live-buddy-zenorb"></span></span>`;
    }

    function renderBuddyHtml(avatarId, sizePx = 48, extraClass = '') {
        const buddy = normaliseId(avatarId);
        const sz = Number(sizePx) > 0 ? Number(sizePx) : 48;
        const cls = extraClass ? `ha-live-buddy ${extraClass}` : 'ha-live-buddy';
        return `<span class="${cls}" data-buddy="${buddy}" style="--buddy-size:${sz}px" aria-hidden="true">${renderBuddyInnerHtml(buddy)}</span>`;
    }

    function mountBuddy(hostEl, avatarId, sizePx = 48) {
        if (!hostEl) return;
        const buddy = normaliseId(avatarId);
        const sz = Number(sizePx) > 0 ? Number(sizePx) : 48;
        const existing = hostEl.querySelector?.('.ha-live-buddy');
        if (existing && existing.getAttribute?.('data-buddy') === buddy) {
            existing.style?.setProperty?.('--buddy-size', `${sz}px`);
            return;
        }
        hostEl.innerHTML = renderBuddyHtml(buddy, sz);
    }

    root.HabitArcBuddy = Object.freeze({
        normaliseId,
        html: renderBuddyHtml,
        mount: mountBuddy,
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
