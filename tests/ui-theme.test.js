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
