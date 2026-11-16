// Presentation-only bridge: keep existing Tailwind token names and let the
// saved data-theme attribute supply their colors on every application page.
(() => {
    // Restore only the active account's theme before the body paints. Auth and
    // data hydration remain in app.js; this never restores another user's data.
    try {
        const uid = localStorage.getItem('habitarc_active_uid');
        const data = JSON.parse(localStorage.getItem(uid ? `habitarc_data:${uid}` : 'habitarc_data') || '{}');
        const rawTheme = data?.settings?.theme;
        const theme = (!rawTheme || (rawTheme === 'light' && !data?.settings?.rpgThemeChosen)) ? 'dark' : rawTheme;
        if (['light', 'sage', 'dark', 'forest', 'midnight', 'purple', 'ocean', 'sunset'].includes(theme)) {
            const isLight = theme === 'light' || theme === 'sage';
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.classList.toggle('dark', !isLight);
            document.documentElement.classList.toggle('light', isLight);
        }
    } catch { /* Storage can be unavailable or corrupt; Night RPG fallback applies below. */
        document.documentElement?.setAttribute?.('data-theme', 'dark');
        document.documentElement?.classList?.add('dark');
        document.documentElement?.classList?.remove('light');
    }
    const config = window.tailwind?.config;
    const colors = config?.theme?.extend?.colors;
    if (colors) {
        const themedColors = Object.fromEntries(Object.entries(colors).map(([name, value]) => {
            if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return [name, value];
            const rgb = value.slice(1).match(/../g).map(channel => parseInt(channel, 16)).join(' ');
            return [name, `rgb(var(--ha-${name}, ${rgb}) / <alpha-value>)`];
        }));
        window.tailwind.config = {
            ...config,
            theme: { ...config.theme, extend: { ...config.theme.extend, colors: themedColors } },
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const main = document.querySelector('main');
        if (main) {
            main.id ||= 'main-content';
            main.tabIndex = -1;
            const skip = document.createElement('a');
            skip.className = 'ha-skip-link';
            skip.href = `#${main.id}`;
            skip.textContent = 'Skip to content';
            document.body.prepend(skip);
        }
        const page = location.pathname.split('/').pop();
        const appPages = new Set(['Dashboard.html', 'Habits.html', 'Insights.html', 'Arc_AI.html', 'Profile.html', 'Settings.html', 'Add_Habit.html', 'Habit_Detail.html']);
        if (appPages.has(page)) document.documentElement.classList.add('ha-app-navigation');
        const activePage = page === 'Habit_Detail.html' ? 'Habits.html'
            : page === 'Settings.html' ? 'Profile.html' : page;
        document.querySelectorAll('nav').forEach(nav => {
            nav.setAttribute('aria-label', nav.classList.contains('fixed') ? 'Mobile navigation' : 'Main navigation');
            nav.querySelectorAll('a').forEach(link => {
                if (link.getAttribute('href') === activePage) link.setAttribute('aria-current', 'page');
            });
        });
        if (page === 'Profile.html' || page === 'Settings.html') {
            document.querySelectorAll('body > header a[href="Profile.html"]').forEach(link => {
                link.setAttribute('aria-current', 'page');
            });
        }
        const labels = { 'Settings.html': 'Settings', 'Profile.html': 'Profile', 'Add_Habit.html': 'Add habit', 'Arc_AI.html': 'ARC AI' };
        document.querySelectorAll('body > header a, body > nav a').forEach(link => {
            const label = labels[link.getAttribute('href')];
            if (label && !link.hasAttribute('aria-label')) link.setAttribute('aria-label', label);
        });

        // Intent-only prefetch of static app documents, never auth/API/personal
        // data and never prerendering (which would run cloud/auth side effects).
        const prefetched = new Set();
        function navigationLink(event) {
            const link = event.target.closest?.('nav a[href], body > header a[href]');
            if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || url.search || url.hash || !appPages.has(url.pathname.split('/').pop())) return null;
            return { link, url };
        }
        function prefetch(event) {
            if (navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
            const target = navigationLink(event);
            if (!target || target.url.pathname === location.pathname || prefetched.has(target.url.href)) return;
            prefetched.add(target.url.href);
            const hint = document.createElement('link');
            hint.rel = 'prefetch'; hint.href = target.url.href; hint.as = 'document';
            document.head.append(hint);
        }
        document.addEventListener('pointerover', prefetch, { passive: true });
        document.addEventListener('focusin', prefetch);
        document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = navigationLink(event);
            if (!target) return;
            if (target.url.pathname === location.pathname && !location.search) {
                event.preventDefault(); // Re-tapping the current tab must not reload Firebase.
                return;
            }
            target.link.classList.add('ha-nav-pending');
            // Native navigation/back/new-tab semantics are deliberately preserved.
        });
        window.addEventListener('pageshow', () => {
            document.querySelectorAll('.ha-nav-pending').forEach(link => link.classList.remove('ha-nav-pending'));
        });

        const metaColors = {
            dark: '#141212', light: '#f4f2ea', sage: '#e5f0da',
            forest: '#0b1a14', midnight: '#0c131e', ocean: '#091c24',
            purple: '#171026', sunset: '#231116'
        };
        const syncMetaTheme = () => {
            const active = document.documentElement?.getAttribute('data-theme') || 'dark';
            document.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', metaColors[active] || '#141212');
        };
        syncMetaTheme();
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(syncMetaTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }

        if (appPages.has(page) && main && page !== 'Arc_AI.html') {
            const offlinePill = document.createElement('div');
            offlinePill.id = 'ha-offline-pill';
            offlinePill.className = 'ha-offline-pill hidden';
            offlinePill.setAttribute('role', 'status');
            offlinePill.setAttribute('aria-live', 'polite');
            offlinePill.textContent = 'OFFLINE MODE · HABITS SAVED ON DEVICE';
            main.prepend(offlinePill);

            const syncOnlineBadge = () => {
                offlinePill.classList.toggle('hidden', navigator.onLine !== false);
            };
            syncOnlineBadge();
            window.addEventListener?.('online', syncOnlineBadge);
            window.addEventListener?.('offline', syncOnlineBadge);
        }

        window.addEventListener?.('habitarc:sw-update-ready', () => {
            if (document.getElementById('ha-sw-update-toast')) return;
            const toast = document.createElement('div');
            toast.id = 'ha-sw-update-toast';
            toast.className = 'ha-sw-update-toast';
            toast.setAttribute('role', 'status');
            toast.innerHTML = '<span>UPDATE READY</span><button type="button">REFRESH</button>';
            toast.querySelector('button')?.addEventListener('click', () => location.reload());
            document.body?.append?.(toast);
        });

        if ((page === 'Dashboard.html' || page === 'Profile.html') && main) {
            const DISMISS_KEY = 'habitarc_pwa_banner_dismissed_at';
            const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
            function isBannerDismissed() {
                try {
                    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
                    return Number.isFinite(ts) && ts > 0 && (Date.now() - ts) < DISMISS_TTL_MS;
                } catch { return false; }
            }
            function renderInstallBanner() {
                const state = window.HabitArcUI?.getPWAInstallState?.();
                const existing = document.getElementById('ha-pwa-install-banner');
                if (!state || state.installed || (!state.available && !state.isIOS) || isBannerDismissed()) {
                    existing?.remove();
                    return;
                }
                if (existing) return;
                const banner = document.createElement('section');
                banner.id = 'ha-pwa-install-banner';
                banner.className = 'ha-pwa-banner';
                banner.setAttribute('aria-label', 'Install HabitArc app');
                banner.innerHTML = `
                    <div class="ha-pwa-banner-info">
                        <img class="ha-pwa-banner-icon" src="icons/icon-192.png" alt="HabitArc icon" width="34" height="34"/>
                        <div class="min-w-0">
                            <div class="ha-pwa-banner-title">Install HabitArc App</div>
                            <div class="ha-pwa-banner-sub">${state.available ? 'Quick home-screen launch & offline habit check-ins.' : state.instructions}</div>
                        </div>
                    </div>
                    <div class="ha-pwa-banner-actions">
                        ${state.available ? '<button type="button" class="ha-pwa-install-cta">Install</button>' : ''}
                        <button type="button" class="ha-pwa-dismiss-btn" aria-label="Dismiss install prompt">&times;</button>
                    </div>
                `;
                banner.querySelector('.ha-pwa-install-cta')?.addEventListener('click', async () => {
                    await window.HabitArcUI?.promptPWAInstall?.();
                    renderInstallBanner();
                });
                banner.querySelector('.ha-pwa-dismiss-btn')?.addEventListener('click', () => {
                    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
                    banner.remove();
                });
                main.prepend(banner);
            }
            renderInstallBanner();
            window.addEventListener?.('habitarc:pwa-state-changed', renderInstallBanner);
        }
    });
})();
