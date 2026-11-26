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

    const appPages = new Set(['Dashboard.html', 'Habits.html', 'Notes.html', 'Insights.html', 'Leaderboard.html', 'Arc_AI.html', 'Profile.html', 'Settings.html', 'Add_Habit.html', 'Habit_Detail.html']);
    function hasSavedActiveArcChat() {
        try {
            const storage = typeof localStorage !== 'undefined' ? localStorage : null;
            if (!storage) return false;
            const uid = storage.getItem('habitarc_active_uid') || 'local';
            const activeId = String(storage.getItem('habitarc_arc_active_chat:' + uid) || '').trim();
            if (activeId) {
                const rawChats = storage.getItem('habitarc_arc_chats:' + uid);
                if (rawChats) {
                    const list = JSON.parse(rawChats);
                    if (Array.isArray(list)) {
                        return list.some(c => c && c.id === activeId && !c.deleted && Array.isArray(c.turns) && c.turns.length > 0);
                    }
                }
            } else if (!storage.getItem('habitarc_arc_active_meta:' + uid)) {
                const legacyRaw = storage.getItem('habitarc_arc_thread:' + uid);
                if (legacyRaw) {
                    const legacy = JSON.parse(legacyRaw);
                    if (Array.isArray(legacy?.turns) && legacy.turns.length > 0) return true;
                }
            }
        } catch { /* Ignore corrupt storage */ }
        return false;
    }
    if (typeof location === 'object' && location.pathname?.endsWith?.('/Arc_AI.html') && hasSavedActiveArcChat()) {
        document.documentElement?.classList?.add?.('ha-arc-restoring-thread');
    }
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
        // Never attach pageAbortController to Firebase SDK's internal visibilitychange
        // token-refresh listeners or persistent shell ES modules (app.js, arc-sheet.js, stores).
        const PERSISTENT_MODULE_RE = /(?:firebase|gstatic\.com|\/(?:app|app-ui|arc-sheet|task-store|focus-store|notes-cloud|notes-studio|leaderboard|league-store|productivity-hub|push-subscriptions|native-reminders|treasure-art)\.js)/i;
        const shouldScopeToPage = (type) => {
            if (capturingPageListeners) return true;
            const scriptEl = document.currentScript;
            if (scriptEl) return !scriptEl.src;
            if (document.documentElement?.classList?.contains('ha-spa-navigated')) return false;
            if (!PAGE_SCOPED_EVENTS.has(type)) return false;
            const stack = typeof Error === 'function' ? (new Error().stack || '') : '';
            if (stack && PERSISTENT_MODULE_RE.test(stack)) return false;
            return true;
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

        const pageCache = new Map();
        const inFlightPages = new Map();
        const STYLE_ORDER = [
            'plan-tasks.css',
            'rescue-mode.css',
            'day-workspace.css',
            'consistency-shield.css',
            'leaderboard.css',
            'notes-studio.css',
            'productivity-hub.css',
            'arc-sheet.css',
        ];
        function appendOrderedStyle(link) {
            const href = link.getAttribute('href') || '';
            const idx = STYLE_ORDER.indexOf(href);
            if (idx !== -1 && document.head) {
                for (let i = idx + 1; i < STYLE_ORDER.length; i++) {
                    const anchor = document.head.querySelector(`link[href="${STYLE_ORDER[i]}"]`);
                    if (anchor) {
                        document.head.insertBefore(link, anchor);
                        return;
                    }
                }
            }
            document.head.appendChild(link);
        }
        function ensureOrderedLink(href, errMessage, getCache, setCache) {
            const existing = document.querySelector(`link[href="${href}"]`);
            if (existing) {
                // Keep canonical cascade order when navigating from pages (e.g. Dashboard -> Habits).
                const idx = STYLE_ORDER.indexOf(href);
                if (idx !== -1 && document.head) {
                    for (let i = idx + 1; i < STYLE_ORDER.length; i++) {
                        const anchor = document.head.querySelector(`link[href="${STYLE_ORDER[i]}"]`);
                        if (anchor && (existing.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING)) {
                            document.head.insertBefore(existing, anchor);
                            break;
                        }
                    }
                }
                return Promise.resolve();
            }
            if (getCache()) return getCache();
            const pending = new Promise((resolve, reject) => {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.addEventListener('load', resolve, { once: true });
                link.addEventListener('error', () => {
                    link.remove();
                    setCache(null);
                    reject(new Error(errMessage));
                }, { once: true });
                appendOrderedStyle(link);
            });
            setCache(pending);
            return pending;
        }
        let analyticsModulePromise = null;
        let arcChatStoreModulePromise = null;
        let notesModulePromise = null;
        let notesStylesPromise = null;
        let leaderboardStylesPromise = null;
        let leaderboardModulePromise = null;
        let workspaceStylesPromise = null;
        function ensureWorkspaceStyles() {
            return ensureOrderedLink('day-workspace.css', 'Daily workspace stylesheet failed', () => workspaceStylesPromise, v => { workspaceStylesPromise = v; });
        }
        let shieldStylesPromise = null;
        function ensureShieldStyles() {
            return ensureOrderedLink('consistency-shield.css', 'Shield CSS unavailable', () => shieldStylesPromise, v => { shieldStylesPromise = v; });
        }
        let rescueStylesPromise = null;
        function ensureRescueStyles() {
            return ensureOrderedLink('rescue-mode.css', 'ARC Rescue stylesheet could not load', () => rescueStylesPromise, v => { rescueStylesPromise = v; });
        }

        let plannerStylesPromise = null;
        function ensurePlannerStyles() {
            return ensureOrderedLink('plan-tasks.css', 'Planner styles failed to load', () => plannerStylesPromise, v => { plannerStylesPromise = v; });
        }

        function ensureLeaderboardStyles() {
            return ensureOrderedLink('leaderboard.css', 'Leaderboard stylesheet failed', () => leaderboardStylesPromise, v => { leaderboardStylesPromise = v; });
        }

        function ensureLeaderboardModule() {
            if (window.__haLeaderboardModule) return Promise.resolve(window.__haLeaderboardModule);
            if (!leaderboardModulePromise) {
                leaderboardModulePromise = import('./leaderboard.js')
                    .then(mod => {
                        window.__haLeaderboardModule = mod;
                        return mod;
                    })
                    .catch(error => {
                        leaderboardModulePromise = null;
                        throw error;
                    });
            }
            return leaderboardModulePromise;
        }

        function ensureNotesStyles() {
            return ensureOrderedLink('notes-studio.css', 'Notes stylesheet could not load', () => notesStylesPromise, v => { notesStylesPromise = v; });
        }

        function removeNotesStyles() {
            document.querySelector('link[href="notes-studio.css"]')?.remove();
            notesStylesPromise = null;
        }

        function ensureNotesModule() {
            if (!notesModulePromise) {
                notesModulePromise = import('./notes-studio.js').catch(error => {
                    notesModulePromise = null;
                    throw error;
                });
            }
            return notesModulePromise;
        }
        function syncPageChrome() {
            const page = location.pathname.split('/').pop() || 'Dashboard.html';
            const main = document.querySelector('main');
            if (appPages.has(page)) {
                document.querySelectorAll('body > header nav').forEach(nav => {
                    if (nav.querySelector('a[href="Leaderboard.html"]')) return;
                    const tab = document.createElement('a');
                    tab.href = 'Leaderboard.html';
                    tab.textContent = 'Leaderboard';
                    tab.className = 'px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:text-primary hover:bg-primary/[0.04] transition-colors';
                    nav.insertBefore(tab, nav.querySelector('a[href="Arc_AI.html"]'));
                });
                const profile = document.querySelector('body > header.md\\:hidden a[href="Profile.html"]');
                if (profile && !profile.parentNode.querySelector('a[href="Leaderboard.html"]')) {
                    const trophy = document.createElement('a');
                    trophy.href = 'Leaderboard.html';
                    trophy.className = 'ha-hdr-profile';
                    trophy.setAttribute('aria-label', 'Leaderboard');
                    trophy.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm10 2h4v2a4 4 0 0 1-4 4M7 5H3v2a4 4 0 0 0 4 4m5 3v5m-4 2h8"/></svg>';
                    profile.before(trophy);
                }
                const leagueShortcut = profile?.parentNode.querySelector('a[href="Leaderboard.html"]');
                if (leagueShortcut && page === 'Leaderboard.html') leagueShortcut.setAttribute('aria-current', 'page');
                else leagueShortcut?.removeAttribute('aria-current');
            }
            // Notes belongs to the same app navigation, not a detached dashboard card.
            document.querySelectorAll('body > header nav').forEach(nav => {
                if (nav.querySelector('a[href="Notes.html"]')) return;
                const link = document.createElement('a');
                link.href = 'Notes.html';
                link.textContent = 'Notes';
                link.className = 'px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:text-primary hover:bg-primary/[0.04] transition-colors';
                nav.insertBefore(link, nav.querySelector('a[href="Insights.html"]'));
            });
            // Keep the same Plan destination and label across cached app pages.
            document.querySelectorAll('body > header nav a[href="Habits.html"]').forEach(link => { link.textContent = 'Plan'; });
            document.querySelectorAll('body > nav.fixed').forEach(nav => {
                // Normalize an older cached dock as well as fresh pages to
                // the clean four-tab dock (Today, Plan, Notes, Insights).
                nav.classList.add('ha-bottom-nav');
                nav.style.removeProperty('grid-template-columns');
                nav.querySelector('a[href="Add_Habit.html"]')?.remove();
                nav.querySelector('a[href="Arc_AI.html"]')?.remove();
                if (!nav.querySelector('a[href="Notes.html"]')) {
                    const link = document.createElement('a');
                    link.href = 'Notes.html';
                    link.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg><span class="ha-bottom-nav-label">Notes</span>';
                    nav.insertBefore(link, nav.querySelector('a[href="Insights.html"]'));
                }
                const todayLabel = nav.querySelector('a[href="Dashboard.html"] .ha-bottom-nav-label');
                if (todayLabel) todayLabel.textContent = 'Today';
                const planLabel = nav.querySelector('a[href="Habits.html"] .ha-bottom-nav-label');
                if (planLabel) planLabel.textContent = 'Plan';
                nav.querySelectorAll('a').forEach(link => {
                    link.classList.add('ha-bottom-nav-link');
                    const label = link.querySelector('span:last-child');
                    if (label) label.classList.add('ha-bottom-nav-label');
                });
            });
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
            const activePage = (page === 'Habit_Detail.html' || page === 'Add_Habit.html') ? 'Habits.html'
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
            if (page === 'Leaderboard.html' && main?.classList.contains('ha-leaderboard')) {
                void ensureLeaderboardStyles?.();
                const mountBoard = mod => mod?.mountLeaderboard?.(main);
                if (window.__haLeaderboardModule) {
                    void mountBoard(window.__haLeaderboardModule);
                } else {
                    ensureLeaderboardModule().then(mountBoard).catch(() => {
                        if (main.isConnected) main.querySelector('#announcement').textContent = 'Could not load standings. Please refresh to retry.';
                    });
                }
            }
        }

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

        function ensureArcChatStoreModule() {
            if (window.__haArcChatStoreModule) return Promise.resolve(window.__haArcChatStoreModule);
            if (!arcChatStoreModulePromise && typeof location === 'object') {
                const modUrl = new URL('./arc-chat-store.js', location.href).href;
                arcChatStoreModulePromise = import(modUrl).then(mod => {
                    window.__haArcChatStoreModule = mod;
                    return mod;
                }).catch(() => null);
            }
            return arcChatStoreModulePromise || Promise.resolve(null);
        }

        function fetchPageHtml(pathname) {
            if (pageCache.has(pathname)) return Promise.resolve(pageCache.get(pathname));
            if (inFlightPages.has(pathname)) return inFlightPages.get(pathname);
            if (typeof fetch !== 'function') return Promise.resolve(null);
            const url = new URL(pathname, location.origin).href;
            const request = fetch(url, { credentials: 'same-origin' })
                .then(res => res.ok ? res.text() : null)
                .then(html => {
                    if (html && html.includes('<main')) pageCache.set(pathname, html);
                    return html;
                })
                .catch(() => null)
                .finally(() => inFlightPages.delete(pathname));
            inFlightPages.set(pathname, request);
            return request;
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
            if (target.targetPage === 'Arc_AI.html') {
                void ensureAnalyticsModule();
                void ensureArcChatStoreModule();
            } else if (target.targetPage === 'Insights.html') {
                void ensureAnalyticsModule();
            } else if (target.targetPage === 'Leaderboard.html') {
                void ensureLeaderboardStyles();
                void ensureLeaderboardModule().catch(() => {});
            } else if (target.targetPage === 'Notes.html') {
                void ensureNotesStyles();
                void ensureNotesModule().catch(() => {});
            }
        }

        async function navigateInPlace(targetUrl, { pushState = true } = {}) {
            // A direct visit to the sample league does not require an account.
            // When leaving it without a session (nor a cached active UID), let the destination run its normal entry checks.
            const hasActiveSession = Boolean(
                window.HabitArc?.getAuthUser?.()
                || (() => { try { return localStorage.getItem('habitarc_active_uid'); } catch { return ''; } })()
            );
            if (document.querySelector('main.ha-leaderboard') && !hasActiveSession
                && !targetUrl.pathname.endsWith('/Leaderboard.html')) {
                if (pushState) location.assign(targetUrl.href);
                else location.replace(targetUrl.href);
                return;
            }
            if (typeof DOMParser !== 'undefined') {
                const seq = ++navSequence;
                const targetPage = targetUrl.pathname.split('/').pop();
                const [html] = await Promise.all([
                    fetchPageHtml(targetUrl.pathname),
                    (targetPage === 'Insights.html' || targetPage === 'Arc_AI.html') ? ensureAnalyticsModule() : Promise.resolve(null),
                    targetPage === 'Arc_AI.html' ? ensureArcChatStoreModule() : Promise.resolve(null),
                ]);
                if (seq !== navSequence) return;
                if (!html) {
                    location.href = targetUrl.href;
                    return;
                }
                if (targetPage === 'Notes.html' || targetPage === 'Habits.html' || targetPage === 'Dashboard.html' || targetPage === 'Arc_AI.html' || targetPage === 'Insights.html' || targetPage === 'Leaderboard.html') {
                    try {
                        if (targetPage === 'Notes.html') {
                            const modReady = ensureNotesModule();
                            await ensureNotesStyles();
                            await modReady;
                        }
                        if (targetPage === 'Habits.html') await Promise.all([ensurePlannerStyles(),ensureWorkspaceStyles(),ensureRescueStyles()]);
                        if (targetPage === 'Dashboard.html') await ensureWorkspaceStyles();
                        if (targetPage === 'Arc_AI.html') await ensureRescueStyles();
                        if (targetPage === 'Insights.html') await ensureShieldStyles();
                        if (targetPage === 'Leaderboard.html') await Promise.all([ensureLeaderboardStyles(), ensureLeaderboardModule()]);
                        if (seq !== navSequence) return;
                    } catch {
                        location.href = targetUrl.href;
                        return;
                    }
                }
                try {
                    const nextDoc = new DOMParser().parseFromString(html, 'text/html');
                    const nextMain = nextDoc.querySelector('body > main');
                    if (!nextMain) {
                        location.href = targetUrl.href;
                        return;
                    }
                    if (document.querySelector('#ha-plan-overview') && targetPage !== 'Habits.html') {
                        window.HabitArcPlanner?.unmount?.();
                    }
                    const leavingNotes = document.querySelector('main.notes-shell') && targetPage !== 'Notes.html';
                    if (leavingNotes) window.HabitArcNotesStudio?.unmount?.();
                    if (document.getElementById('ha-shield') && targetPage !== 'Insights.html') window.HabitArcConsistencyShield?.unmount?.();
                    if (targetPage !== 'Leaderboard.html') {
                        document.querySelector('dialog.lb-reveal[open]')?.close?.();
                        document.documentElement?.classList?.remove('lb-reveal-active');
                    }
                    pageAbortController?.abort();
                    pageAbortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

                    if (pushState && (targetUrl.pathname !== location.pathname || targetUrl.search !== location.search)) {
                        history.pushState({ haSpa: true }, '', targetUrl.href);
                    }
                    if (nextDoc.title) document.title = nextDoc.title;

                    // Reset scroll before locking body.ha-arc-body (height: 100dvh; overflow: hidden)
                    // so switching from a scrolled tab never traps an offset viewport.
                    window.scrollTo(0, 0);
                    document.documentElement.classList.add('ha-spa-navigated');
                    document.body.className = nextDoc.body.className;

                    const oldHeaders = [...document.querySelectorAll('body > header')];
                    const nextHeaders = [...nextDoc.querySelectorAll('body > header')].map(h => h.cloneNode(true));
                    const currentMain = document.querySelector('body > main');
                    oldHeaders.forEach(h => h.remove());
                    nextHeaders.forEach(h => document.body.insertBefore(h, currentMain));

                    const preparedMain = nextMain.cloneNode(true);
                    if (targetPage === 'Arc_AI.html') {
                        const restoring = hasSavedActiveArcChat();
                        document.documentElement?.classList?.toggle?.('ha-arc-restoring-thread', restoring);
                        if (restoring) {
                            document.body.classList.add('is-arc-thread-active');
                            preparedMain.querySelector('#arc-zen-home')?.classList.add('hidden');
                            preparedMain.querySelector('#arc-thread-view')?.classList.remove('hidden');
                        }
                    } else {
                        document.documentElement?.classList?.remove?.('ha-arc-restoring-thread');
                    }

                    currentMain.replaceWith(preparedMain);
                    if (leavingNotes) removeNotesStyles();

                    if (!document.querySelector('body > nav.fixed')) {
                        const nextNav = nextDoc.querySelector('body > nav.fixed');
                        if (nextNav) document.body.appendChild(nextNav.cloneNode(true));
                    }

                    window.scrollTo(0, 0);
                    window.HabitArc?.applyTheme?.();
                    syncPageChrome();
                    window.HabitArcCommandHub?.mount?.();
                    window.HabitArcSheet?.sync?.();
                    if (targetPage === 'Notes.html') {
                        await ensureNotesModule();
                        if (seq === navSequence) {
                            window.HabitArcNotesStudio?.mount?.();
                            window.HabitArcSheet?.sync?.();
                        }
                        return;
                    }

                    const inlineScript = [...nextDoc.querySelectorAll('body script:not([src])')].at(-1);
                    if (inlineScript?.textContent) {
                        let code = inlineScript.textContent;
                        if (inlineScript.type === 'module') {
                            if (!window.__haAnalyticsModule) await ensureAnalyticsModule();
                            if (targetPage === 'Arc_AI.html' && !window.__haArcChatStoreModule) await ensureArcChatStoreModule();
                            code = code.replace(
                                /^\s*import\s*\{([^}]+)\}\s*from\s*['"]\.\/habit-analytics\.js['"];?\s*/m,
                                'const {$1} = window.__haAnalyticsModule || {};\n'
                            );
                            code = code.replace(
                                /^\s*import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/arc-chat-store\.js['"];?\s*/m,
                                'const {$1} = window.__haArcChatStoreModule || {};\n'
                            );
                        }
                        capturingPageListeners = true;
                        try {
                            new Function(code)();
                        } finally {
                            capturingPageListeners = false;
                        }
                    }
                    window.HabitArcSheet?.sync?.();
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

        // Preload on tap/hover/focus only. Fetching every page on startup
        // saturates mobile connections and delays the first tab switch.
    });
})();


// Shared command center & Floating Ask ARC Sheet load once; SPA swaps re-sync triggers.
(() => {
    function loadCommandHub(){
        if (!document.body) return;
        if (!document.querySelector('link[href="productivity-hub.css"]')) {
            const css=document.createElement('link');
            css.rel='stylesheet';css.href='productivity-hub.css';
            document.head.append(css);
        }
        import('./productivity-hub.js').then(mod=>mod.mountCommandHub())
            .catch(error=>console.warn('HabitArc Command Center unavailable:',error));
        if (!document.querySelector('link[href="arc-sheet.css"]')) {
            const sheetCss=document.createElement('link');
            sheetCss.rel='stylesheet';sheetCss.href='arc-sheet.css';
            document.head.append(sheetCss);
        }
        import('./arc-sheet.js').then(mod=>mod.mountArcSheet())
            .catch(error=>console.warn('HabitArc ARC Sheet unavailable:',error));
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCommandHub,{once:true});
    else loadCommandHub();
})();
