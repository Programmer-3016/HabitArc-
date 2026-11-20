import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Notes mobile header has independent responsive layout and app data', () => {
  const html = source('Notes.html');
  const css = source('notes-studio.css');
  assert.match(html, /class="notes-mobile-header\b/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(css, /header\.notes-mobile-header > div\s*\{\s*display:flex !important/);
  assert.match(css, /header\.notes-topbar\s*\{display:none !important/);
  assert.match(css, /header\.notes-mobile-header\s*\{display:none !important/);
});

test('Mobile PWA add button has no raised notch pseudo-element', () => {
  const css = source('app-ui.css');
  assert.doesNotMatch(css, /clip-path:\s*inset\(0 0 39px 0\)/);
  assert.doesNotMatch(css, /margin:\s*-22px auto 0/);
  assert.match(css, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\) !important/);
  assert.match(css, /content:none !important;display:none !important/);
});

test('Notes assets are part of the installable app shell', () => {
  const sw = source('sw.js');
  assert.match(sw, /'\/Notes\.html'/);
  assert.match(sw, /'\/notes-studio\.css'/);
  assert.match(sw, /'\/notes-studio\.js'/);
});
