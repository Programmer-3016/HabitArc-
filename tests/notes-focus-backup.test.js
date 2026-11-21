import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNotesSync } from '../notes-cloud.js';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ remote = [], local = [] } = {}) {
  const kv = new Map(), records = local.map(note => ({ ...note })), writes = [], statuses = [];
  const identity = { uid: 'test-owner' };
  const cloud = {
    getCurrentUser: () => identity,
    subscribe: cb => { queueMicrotask(() => cb(identity)); return () => {}; },
    subscribeNotes: cb => { queueMicrotask(() => cb(remote, { fromCache: false })); return () => {}; },
    saveNoteCloud: async note => { writes.push(['save', note.id, note.title]); },
    deleteNoteCloud: async noteId => { writes.push(['delete', noteId]); }
  };
  const old = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    navigator: globalThis.navigator
  };
  globalThis.window = {
    HabitArc: { whenAuthReady: async () => identity },
    HabitArcAuthReady: Promise.resolve(cloud),
    addEventListener() {}
  };
  globalThis.localStorage = {
    getItem: key => kv.get(key) || null,
    setItem: (key, value) => kv.set(key, String(value))
  };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
  const bridge = createNotesSync({
    list: async () => records.map(r => ({ ...r })),
    get: async id => records.find(r => r.id === id),
    save: async note => {
      const at = records.findIndex(r => r.id === note.id);
      if (at >= 0) records[at] = { ...note };
      else records.push({ ...note });
    },
    remove: async id => {
      const at = records.findIndex(r => r.id === id);
      if (at >= 0) records.splice(at, 1);
    },
    owner: () => identity.uid,
    onUpdate() {},
    onStatus: status => statuses.push(status)
  });
  function restore() {
    bridge.stop();
    globalThis.window = old.window;
    globalThis.localStorage = old.localStorage;
    Object.defineProperty(globalThis, 'navigator', {
      value: old.navigator, writable: true, configurable: true
    });
  }
  return { bridge, records, kv, writes, statuses, restore };
}
const oldNote = {
  id: 'note-1', owner: 'test-owner', title: 'Study notes', body: 'Important',
  date: '2026-11-21', updatedAt: '2026-11-21T07:00:00Z',
  createdAt: '2026-11-21T06:00:00Z'
};

test('Notes migration, offline journal replay, edit and tombstone deletion', async () => {
  const app = harness({ local: [oldNote] });
  try {
    await app.bridge.start();
    for (let i = 0; i < 10; i++) await tick();
    assert.equal(app.writes.filter(w => w[0] === 'save').length, 1);
    app.records[0].title = 'Updated';
    app.records[0].updatedAt = '2026-11-21T08:00:00Z';
    app.bridge.upsert(app.records[0]);
    for (let i = 0; i < 10; i++) await tick();
    assert.ok(app.writes.some(w => w[0] === 'save' && w[2] === 'Updated'));
    app.records.pop();
    app.bridge.delete(oldNote.id);
    for (let i = 0; i < 10; i++) await tick();
    assert.ok(app.writes.some(w => w[0] === 'delete' && w[1] === oldNote.id));
    assert.equal(Object.keys(JSON.parse(app.kv.get('habitarc_notes_pending:test-owner'))).length, 0);
  } finally { app.restore(); }
});

test('A newer remote note wins over a migrated older local copy', async () => {
  const remote = {
    id:oldNote.id,title:'Latest from laptop',body:'Newer',date:'2026-11-21',
    updatedAt:'2026-11-21T09:00:00Z',createdAt:oldNote.createdAt,
    pinned:false,color:'lavender',deleted:false,hasPhoto:false,hasAudio:false
  };
  const app=harness({ local:[oldNote],remote:[remote] });
  try {
    await app.bridge.start();
    for (let i=0;i<10;i++) await tick();
    assert.equal(app.records[0].title,'Latest from laptop');
    assert.equal(app.writes.filter(w=>w[0]==='save').length,0,'must not upload older migration over newer cloud data');
  } finally {app.restore();}
});

test('Private Firestore and Storage rules are owner-scoped with size limits', () => {
  const firestore=source('firestore.rules'),storage=source('storage.rules');
  assert.match(firestore, /match \/users\/\{userId\}\/notes\/\{noteId\}/);
  assert.match(firestore, /match \/users\/\{userId\}\/focusSessions\/\{sessionId\}/);
  assert.match(firestore, /request\.auth\.uid == userId/);
  assert.match(storage, /request\.auth\.uid == userId/);
  assert.match(storage, /5 \* 1024 \* 1024/);
  assert.match(storage, /8 \* 1024 \* 1024/);
});

test('PWA caches sync and export modules and the Settings backup is not a dead link',()=>{
  const worker=source('sw.js'),settings=source('Settings.html');
  for(const asset of ['notes-cloud.js','data-backup.js'])assert.ok(worker.includes("/"+asset));
  assert.match(settings,/id="download-backup-btn"/);
  assert.match(settings,/import\('\.\/data-backup\.js'\)/);
  assert.match(source('firebase-auth.js'),/saveFocusSession/);
  assert.match(source('focus-store.js'),/startFocusCloudSync/);
});
