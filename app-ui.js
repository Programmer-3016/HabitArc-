// Presentation-only bridge: keep existing Tailwind token names and let the
// saved data-theme attribute supply their colors on every application page.
(() => {
    // Restore only the active account's theme before the body paints. Auth and
    // data hydration remain in app.js; this never restores another user's data.
    try {
        const uid = localStorage.getItem('habitarc_active_uid');
        const data = JSON.parse(localStorage.getItem(uid ? `habitarc_data:${uid}` : 'habitarc_data') || '{}');
        const theme = data?.settings?.theme;
        if (['light', 'dark', 'forest', 'midnight'].includes(theme)) {
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.classList.toggle('dark', theme !== 'light');
            document.documentElement.classList.toggle('light', theme === 'light');
        }
    } catch { /* Storage can be unavailable or corrupt; the normal light fallback remains. */ }
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
        const appPages = new Set(['Dashboard.html', 'Habits.html', 'Insights.html', 'Profile.html', 'Settings.html', 'Add_Habit.html', 'Habit_Detail.html']);
        if (appPages.has(page)) document.documentElement.classList.add('ha-app-navigation');
        const activePage = page === 'Habit_Detail.html' ? 'Habits.html'
            : page === 'Settings.html' ? 'Profile.html' : page;
        document.querySelectorAll('nav').forEach(nav => {
            nav.setAttribute('aria-label', nav.classList.contains('fixed') ? 'Mobile navigation' : 'Main navigation');
            nav.querySelectorAll('a').forEach(link => {
                if (link.getAttribute('href') === activePage) link.setAttribute('aria-current', 'page');
            });
        });
        const labels = { 'Settings.html': 'Settings', 'Profile.html': 'Profile', 'Add_Habit.html': 'Add habit' };
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
    });
})();
