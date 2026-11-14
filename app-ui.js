// Presentation-only bridge: keep existing Tailwind token names and let the
// saved data-theme attribute supply their colors on every application page.
(() => {
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
    });
})();
