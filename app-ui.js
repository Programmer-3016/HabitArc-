// Presentation-only bridge: keep existing Tailwind token names and let the
// saved data-theme attribute supply their colors on every application page.
(() => {
    // Restore only the active account's theme before the body paints. Auth and
    // data hydration remain in app.js; this never restores another user's data.
    try {
        const uid = localStorage.getItem('habitarc_active_uid');
        const data = JSON.parse(localStorage.getItem(uid ? `habitarc_data:${uid}` : 'habitarc_data') || '{}');
        const s = data?.settings || {};
        const rawTheme = s.theme;
        const theme = (rawTheme && (s.cleanThemeChosen || !['light', 'dark'].includes(rawTheme)))
            ? rawTheme
            : (rawTheme === 'dark' && s.cleanThemeChosen ? 'dark' : 'light');
        if (['light', 'sage', 'dark', 'forest', 'midnight', 'purple', 'ocean', 'sunset'].includes(theme)) {
            const isLight = theme === 'light' || theme === 'sage';
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.classList.toggle('dark', !isLight);
            document.documentElement.classList.toggle('light', isLight);
        }
    } catch { /* Storage can be unavailable or corrupt; Paper Light fallback applies below. */
        document.documentElement?.setAttribute?.('data-theme', 'light');
        document.documentElement?.classList?.add('light');
        document.documentElement?.classList?.remove('dark');
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

    const appPages = new Set(['Dashboard.html', 'Habits.html', 'Insights.html', 'Arc_AI.html', 'Profile.html', 'Settings.html', 'Add_Habit.html', 'Habit_Detail.html']);
    let pageAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let capturingPageListeners = false;

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof document?.addEventListener === 'function' && pageAbortController) {
        const origWinAdd = window.addEventListener.bind(window);
        const origDocAdd = document.addEventListener.bind(document);
        const PAGE_SCOPED_EVENTS = new Set([
            'habitarc:data-changed',
            'habitarc-auth-state-changed',
            'habitarc:sync-status-changed',
            'habitarc:cloud-sync-error',
            'pagehide',
            'visibilitychange',
        ]);
        const shouldScopeToPage = (type) => {
            if (capturingPageListeners) return true;
            const scriptEl = document.currentScript;
            if (scriptEl) return !scriptEl.src;
            return PAGE_SCOPED_EVENTS.has(type);
        };
        const withPageSignal = (options) => {
            if (!pageAbortController) return options;
            if (typeof options === 'boolean' || options === undefined) {
                return { capture: Boolean(options), signal: pageAbortController.signal };
            }
            if (typeof options === 'object' && options !== null && !options.signal) {
                return { ...options, signal: pageAbortController.signal };
            }
            return options;
        };
        window.addEventListener = function(type, listener, options) {
            return origWinAdd(type, listener, shouldScopeToPage(type) ? withPageSignal(options) : options);
        };
        document.addEventListener = function(type, listener, options) {
            return origDocAdd(type, listener, shouldScopeToPage(type) ? withPageSignal(options) : options);
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const metaColors = {
            dark: '#121215', light: '#47e393', sage: '#47e393',
            forest: '#0b1a14', midnight: '#0c131e', ocean: '#091c24',
            purple: '#171026', sunset: '#231116'
        };
        const syncMetaTheme = () => {
            const active = document.documentElement?.getAttribute('data-theme') || 'light';
            document.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', metaColors[active] || '#47e393');
        };
        syncMetaTheme();
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(syncMetaTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }

        const DISMISS_KEY = 'habitarc_pwa_banner_dismissed_at';
        const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
        function isBannerDismissed() {
            try {
                const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
                return Number.isFinite(ts) && ts > 0 && (Date.now() - ts) < DISMISS_TTL_MS;
            } catch { return false; }
        }
        function renderInstallBanner() {
            const currentPage = location.pathname.split('/').pop() || 'Dashboard.html';
            const main = document.querySelector('main');
            const existing = document.getElementById('ha-pwa-install-banner');
            if ((currentPage !== 'Dashboard.html' && currentPage !== 'Profile.html') || !main) {
                existing?.remove();
                return;
            }
            const state = window.HabitArcUI?.getPWAInstallState?.();
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

        function syncOnlineBadge() {
            const pill = document.getElementById('ha-offline-pill');
            if (pill) pill.classList.toggle('hidden', navigator.onLine !== false);
        }

        function syncPageChrome() {
            const page = location.pathname.split('/').pop() || 'Dashboard.html';
            const main = document.querySelector('main');
            if (main) {
                main.id ||= 'main-content';
                main.tabIndex = -1;
                let skip = document.querySelector('body > .ha-skip-link');
                if (!skip) {
                    skip = document.createElement('a');
                    skip.className = 'ha-skip-link';
                    skip.textContent = 'Skip to content';
                    document.body.prepend(skip);
                }
                skip.href = `#${main.id}`;
            }
            if (appPages.has(page)) document.documentElement.classList.add('ha-app-navigation');
            const activePage = page === 'Habit_Detail.html' ? 'Habits.html'
                : page === 'Settings.html' ? 'Profile.html' : page;
            document.querySelectorAll('nav').forEach(nav => {
                nav.setAttribute('aria-label', nav.classList.contains('fixed') ? 'Mobile navigation' : 'Main navigation');
                nav.querySelectorAll('a').forEach(link => {
                    const href = link.getAttribute('href');
                    const isActive = href === activePage;
                    link.classList.remove('ha-nav-pending', 'bg-primary/[0.08]', 'bg-primary/[0.06]', 'text-primary', 'shadow-sm');
                    const icon = link.querySelector('.material-symbols-outlined');
                    if (icon && href !== 'Add_Habit.html') {
                        icon.classList.toggle('fill', isActive);
                    }
                    if (isActive) {
                        link.setAttribute('aria-current', 'page');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                });
            });
            document.querySelectorAll('body > header a[href="Profile.html"]').forEach(link => {
                if (page === 'Profile.html' || page === 'Settings.html') {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
            const labels = { 'Settings.html': 'Settings', 'Profile.html': 'Profile', 'Add_Habit.html': 'Add habit', 'Arc_AI.html': 'ARC AI' };
            document.querySelectorAll('body > header a, body > nav a').forEach(link => {
                const label = labels[link.getAttribute('href')];
                if (label && !link.hasAttribute('aria-label')) link.setAttribute('aria-label', label);
            });

            if (appPages.has(page) && main && page !== 'Arc_AI.html') {
                if (!document.getElementById('ha-offline-pill')) {
                    const offlinePill = document.createElement('div');
                    offlinePill.id = 'ha-offline-pill';
                    offlinePill.className = 'ha-offline-pill hidden';
                    offlinePill.setAttribute('role', 'status');
                    offlinePill.setAttribute('aria-live', 'polite');
                    offlinePill.textContent = 'OFFLINE MODE · HABITS SAVED ON DEVICE';
                    main.prepend(offlinePill);
                }
                syncOnlineBadge();
            }
            renderInstallBanner();
            if (typeof _syncHeaderChrome === 'function') _syncHeaderChrome();
        }

        document.head?.querySelectorAll?.('style:not(#habitarc-accessibility-styles)')?.forEach(s => {
            s.setAttribute('data-ha-page-style', 'true');
        });
        syncPageChrome();
        window.addEventListener?.('online', syncOnlineBadge);
        window.addEventListener?.('offline', syncOnlineBadge);
        window.addEventListener?.('habitarc:pwa-state-changed', renderInstallBanner);

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

        // Instant in-place shell router: pre-caches app pages in memory and swaps
        // <header>/<main> without full browser page reloads or top loading bars.
        const pageCache = new Map();
        let analyticsModulePromise = null;
        let navSequence = 0;

        function ensureAnalyticsModule() {
            if (window.__haAnalyticsModule) return Promise.resolve(window.__haAnalyticsModule);
            if (!analyticsModulePromise && typeof location === 'object') {
                const modUrl = new URL('./habit-analytics.js', location.href).href;
                analyticsModulePromise = import(modUrl).then(mod => {
                    window.__haAnalyticsModule = mod;
                    return mod;
                }).catch(() => null);
            }
            return analyticsModulePromise || Promise.resolve(null);
        }

        function fetchPageHtml(pathname) {
            if (pageCache.has(pathname)) return Promise.resolve(pageCache.get(pathname));
            if (typeof fetch !== 'function') return Promise.resolve(null);
            const url = new URL(pathname, location.origin).href;
            return fetch(url, { credentials: 'same-origin' })
                .then(res => res.ok ? res.text() : null)
                .then(html => {
                    if (html && html.includes('<main')) pageCache.set(pathname, html);
                    return html;
                })
                .catch(() => null);
        }

        function navigationLink(event) {
            const link = event.target?.closest?.('a[href]');
            if (!link || link.classList.contains('ha-skip-link') || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
            let url;
            try { url = new URL(link.href, location.href); } catch { return null; }
            const targetPage = url.pathname.split('/').pop();
            if (url.origin !== location.origin || url.hash || !appPages.has(targetPage)) return null;
            return { link, url, targetPage };
        }

        function warmPage(event) {
            const target = navigationLink(event);
            if (!target || target.url.pathname === location.pathname) return;
            void fetchPageHtml(target.url.pathname);
            if (target.targetPage === 'Insights.html' || target.targetPage === 'Arc_AI.html') {
                void ensureAnalyticsModule();
            }
        }

        async function navigateInPlace(targetUrl, { pushState = true } = {}) {
            if (typeof DOMParser !== 'undefined') {
                const seq = ++navSequence;
                const targetPage = targetUrl.pathname.split('/').pop();
                const [html] = await Promise.all([
                    fetchPageHtml(targetUrl.pathname),
                    (targetPage === 'Insights.html' || targetPage === 'Arc_AI.html') ? ensureAnalyticsModule() : Promise.resolve(null),
                ]);
                if (seq !== navSequence) return;
                if (!html) {
                    location.href = targetUrl.href;
                    return;
                }
                try {
                    const nextDoc = new DOMParser().parseFromString(html, 'text/html');
                    const nextMain = nextDoc.querySelector('body > main');
                    if (!nextMain) {
                        location.href = targetUrl.href;
                        return;
                    }
                    pageAbortController?.abort();
                    pageAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

                    if (pushState && (targetUrl.pathname !== location.pathname || targetUrl.search !== location.search)) {
                        history.pushState({ haSpa: true }, '', targetUrl.href);
                    }
                    if (nextDoc.title) document.title = nextDoc.title;

                    document.head.querySelectorAll('style[data-ha-page-style="true"]').forEach(s => s.remove());
                    nextDoc.head.querySelectorAll('style').forEach(styleEl => {
                        const clone = styleEl.cloneNode(true);
                        clone.setAttribute('data-ha-page-style', 'true');
                        document.head.insertBefore(clone, document.head.querySelector('link[href*="app-ui.css"]'));
                    });

                    document.documentElement.classList.add('ha-spa-navigated');
                    document.body.className = nextDoc.body.className;

                    const oldHeaders = [...document.querySelectorAll('body > header')];
                    const nextHeaders = [...nextDoc.querySelectorAll('body > header')].map(h => h.cloneNode(true));
                    const currentMain = document.querySelector('body > main');
                    oldHeaders.forEach(h => h.remove());
                    nextHeaders.forEach(h => document.body.insertBefore(h, currentMain));

                    currentMain.replaceWith(nextMain.cloneNode(true));

                    if (!document.querySelector('body > nav.fixed')) {
                        const nextNav = nextDoc.querySelector('body > nav.fixed');
                        if (nextNav) document.body.appendChild(nextNav.cloneNode(true));
                    }

                    window.scrollTo(0, 0);
                    window.HabitArc?.applyTheme?.();
                    syncPageChrome();

                    const inlineScript = [...nextDoc.querySelectorAll('body script:not([src])')].at(-1);
                    if (inlineScript?.textContent) {
                        let code = inlineScript.textContent;
                        if (inlineScript.type === 'module') {
                            if (!window.__haAnalyticsModule) await ensureAnalyticsModule();
                            code = code.replace(
                                /^\s*import\s*\{([^}]+)\}\s*from\s*['"]\.\/habit-analytics\.js['"];?\s*/m,
                                'const {$1} = window.__haAnalyticsModule || {};\n'
                            );
                        }
                        capturingPageListeners = true;
                        try {
                            new Function(code)();
                        } finally {
                            capturingPageListeners = false;
                        }
                    }
                    return;
                } catch (err) {
                    console.warn('In-place navigation fallback:', err);
                    location.href = targetUrl.href;
                    return;
                }
            }
            location.href = targetUrl.href;
        }

        document.addEventListener('pointerover', warmPage, { passive: true });
        document.addEventListener('touchstart', warmPage, { passive: true });
        document.addEventListener('focusin', warmPage);
        document.addEventListener('click', event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = navigationLink(event);
            if (!target) return;
            event.preventDefault();
            if (target.url.pathname === location.pathname && target.url.search === location.search) return;
            void navigateInPlace(target.url, { pushState: true });
        });
        window.addEventListener('popstate', () => {
            const targetPage = location.pathname.split('/').pop();
            if (appPages.has(targetPage)) {
                void navigateInPlace(new URL(location.href), { pushState: false });
            }
        });
        window.addEventListener('pageshow', () => {
            document.querySelectorAll('.ha-nav-pending').forEach(link => link.classList.remove('ha-nav-pending'));
        });

        const warmAllShellPages = () => {
            void ensureAnalyticsModule();
            for (const name of appPages) {
                if (name !== (location.pathname.split('/').pop() || '')) {
                    void fetchPageHtml(`/${name}`);
                }
            }
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(warmAllShellPages, { timeout: 1200 });
        } else if (typeof setTimeout === 'function') {
            setTimeout(warmAllShellPages, 150);
        }
    });
})();
