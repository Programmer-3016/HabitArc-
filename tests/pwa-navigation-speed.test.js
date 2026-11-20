import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('router deduplicates in-flight page requests without eager fetching all pages', () => {
  const source = read('app-ui.js');
  assert.match(source, /inFlightPages\.has\(pathname\)/);
  assert.match(source, /inFlightPages\.set\(pathname, request\)/);
  assert.doesNotMatch(source, /warmAllShellPages/);
  assert.match(source, /await ensureNotesModule\(\)/);
});

test('Notes can be mounted repeatedly in-place and retains its editor', () => {
  const html = read('Notes.html');
  const notes = read('notes-studio.js');
  const mainEnd = html.indexOf('</main>');
  const dialogAt = html.indexOf('<dialog id="note-dialog"');
  assert.ok(dialogAt > 0 && dialogAt < mainEnd);
  assert.match(notes, /window\.HabitArcNotesStudio/);
  assert.match(notes, /unmount\(\)/);
  assert.match(notes, /lifecycle\.abort\(\)/);
  new Function(notes);
});

test('service worker serves pre-cached shell immediately when network hangs', async () => {
  const handlers = {};
  let networkCalls = 0;
  let backgroundRefreshes = 0;
  const cachedPage = new Response('<main>Notes</main>', { status: 200 });
  const context = {
    URL,
    Response,
    Set,
    caches: {
      open: async () => ({
        match: async (key) => key === '/Notes.html' ? cachedPage.clone() : null,
        put: async () => {},
      }),
    },
    fetch: () => {
      networkCalls += 1;
      return new Promise(() => {});
    },
    self: {
      location: { origin: 'https://habit-arc.vercel.app' },
      addEventListener(type, handler) { handlers[type] = handler; },
    },
  };
  vm.runInNewContext(read('sw.js'), context);
  let reply;
  handlers.fetch({
    request: new Request('https://habit-arc.vercel.app/Notes.html'),
    respondWith(promise) { reply = promise; },
    waitUntil() { backgroundRefreshes += 1; },
  });
  const response = await Promise.race([
    reply,
    new Promise((_, reject) => setTimeout(() => reject(new Error('cache response waited on network')), 250)),
  ]);
  assert.equal(await response.text(), '<main>Notes</main>');
  assert.equal(networkCalls, 1);
  assert.equal(backgroundRefreshes, 1);
});
