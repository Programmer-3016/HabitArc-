import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app-ui.js', import.meta.url), 'utf8');
function run(tailwind) {
    const listeners = [];
    const window = { tailwind };
    vm.runInNewContext(source, { window, document: { addEventListener: (...args) => listeners.push(args) } });
    return { window, listeners };
}

test('UI theme bridge preserves token names, opacity support, and non-color configuration', () => {
    const { window } = run({ config: { darkMode: 'class', theme: { extend: { colors: { primary: '#012d1d', surface: '#FFFFFF' }, spacing: { 'card-padding': '20px' } } } } });
    const { config } = window.tailwind;
    assert.equal(config.theme.extend.colors.primary, 'rgb(var(--ha-primary, 1 45 29) / <alpha-value>)');
    assert.equal(config.theme.extend.colors.surface, 'rgb(var(--ha-surface, 255 255 255) / <alpha-value>)');
    assert.equal(config.theme.extend.spacing['card-padding'], '20px');
    assert.equal(config.darkMode, 'class');
});

test('UI theme bridge leaves non-hex custom values untouched', () => {
    const { window } = run({ config: { theme: { extend: { colors: { inherited: 'currentColor' } } } } });
    assert.equal(window.tailwind.config.theme.extend.colors.inherited, 'currentColor');
});

test('UI helper does not crash when the CDN is unavailable', () => {
    const { listeners } = run(undefined);
    assert.equal(listeners[0][0], 'DOMContentLoaded');
});

test('all 8 themes define complete surface, text, hero, header, and dock tokens in app-ui.css', () => {
    const css = readFileSync(new URL('../app-ui.css', import.meta.url), 'utf8');
    const openBraces = (css.match(/\{/g) || []).length;
    const closeBraces = (css.match(/\}/g) || []).length;
    assert.equal(openBraces, closeBraces, 'app-ui.css must have balanced CSS braces');

    for (const theme of ['light', 'dark', 'sage', 'forest', 'midnight', 'ocean', 'purple', 'sunset']) {
        const marker = `:root[data-theme="${theme}"]`;
        const start = css.indexOf(marker);
        assert.ok(start !== -1, `missing theme block for ${theme}`);
        const blockEnd = css.indexOf('}', start);
        const block = css.slice(start, blockEnd);
        for (const requiredVar of [
            '--ha-background:',
            '--ha-surface:',
            '--ha-on-surface:',
            '--ha-on-surface-variant:',
            '--ha-outline-variant:',
            '--ha-primary:',
            '--rpg-hdr-bg:',
            '--ha-hero-bg:',
            '--ha-hero-fg:',
            '--rpg-dock-bg:',
            '--rpg-dock-active-bg:',
            '--rpg-dock-active-fg:',
        ]) {
            assert.ok(block.includes(requiredVar), `${theme} is missing ${requiredVar}`);
        }
    }
});

test('PWA splash index.html paints Pixel Buddy Run animation with synchronous theme resolution and reduced-motion guard', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /class="ha-splash"/);
    assert.match(html, /class="ha-splash-buddy"/);
    assert.match(html, /class="ha-splash-track"/);
    assert.match(html, /prefers-reduced-motion:\s*reduce/);
    assert.match(html, /HabitArc\.whenAuthReady\(\)/);
    for (const theme of ['light', 'sage', 'dark', 'forest', 'midnight', 'purple', 'ocean', 'sunset']) {
        assert.match(html, new RegExp(`\\b${theme}:`), `index.html splash missing theme palette for ${theme}`);
    }
});
