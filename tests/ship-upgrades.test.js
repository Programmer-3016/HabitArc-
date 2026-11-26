import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  upsertArcChat,
  togglePinArcChat,
  renameArcChat,
  getLiveArcChats,
  groupArcChatsByRecency,
  sanitizeArcChatsForCloud,
  mergeArcChats,
} from '../arc-chat-store.js';
import accountDeleteHandler, {
  executeAdminAccountDeletion,
  executeRestAccountDeletion,
} from '../api/account-delete.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Precompiled Tailwind CSS replaces runtime CDN scripts and is precached in sw.js', () => {
  assert.ok(fs.existsSync(new URL('../tailwind.generated.css', import.meta.url)), 'tailwind.generated.css must exist');
  const css = read('tailwind.generated.css');
  assert.ok(css.length > 15000, 'compiled CSS bundle should contain full utility set');
  assert.match(css, /--ha-primary/, 'compiled CSS must preserve --ha-* theme variable bridge');

  const htmlPages = [
    'Dashboard.html',
    'Habits.html',
    'Notes.html',
    'Insights.html',
    'Leaderboard.html',
    'Arc_AI.html',
    'Profile.html',
    'Settings.html',
    'Add_Habit.html',
    'Habit_Detail.html',
    'Onboarding.html',
  ];
  for (const page of htmlPages) {
    const html = read(page);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/, `${page} must not load runtime Tailwind CDN script`);
    assert.match(html, /href="tailwind\.generated\.css"/, `${page} must link precompiled tailwind.generated.css`);
    assert.doesNotMatch(html, /theme\(['"]/, `${page} must not leave unprocessed theme() calls in inline styles`);
  }

  const sw = read('sw.js');
  assert.match(sw, /'\/tailwind\.generated\.css'/, 'sw.js must precache /tailwind.generated.css');
});

test('Web App Manifest declares narrow and wide install screenshots backed by real PNG files', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2);
  const narrow = manifest.screenshots.find((s) => s.form_factor === 'narrow');
  const wide = manifest.screenshots.find((s) => s.form_factor === 'wide');
  assert.ok(narrow, 'manifest must include a narrow mobile screenshot');
  assert.ok(wide, 'manifest must include a wide desktop screenshot');

  for (const shot of [narrow, wide]) {
    const rel = shot.src.replace(/^\/+/, '');
    const buf = fs.readFileSync(new URL('../' + rel, import.meta.url));
    // Verify PNG magic signature
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
    assert.ok(buf.length > 10000, `${rel} should be a non-trivial rendered PNG`);
  }
});

test('ARC AI chat store supports pinning, custom renaming, Pinned bucket, and cloud merge fidelity', () => {
  const baseTs = 1_700_000_000_000;
  let chats = [];
  chats = upsertArcChat(chats, {
    id: 'chat_older',
    createdAt: baseTs,
    updatedAt: baseTs + 1000,
    turns: [{ question: 'Older habit question', answer: 'Older answer', timestamp: baseTs + 1000 }],
  }, baseTs + 1000);
  chats = upsertArcChat(chats, {
    id: 'chat_newer',
    createdAt: baseTs + 2000,
    updatedAt: baseTs + 5000,
    turns: [{ question: 'Newer habit question', answer: 'Newer answer', timestamp: baseTs + 5000 }],
  }, baseTs + 5000);

  // Pin older chat -> floats above newer unpinned chat and enters Pinned group
  chats = togglePinArcChat(chats, 'chat_older', baseTs + 6000);
  const live = getLiveArcChats(chats);
  assert.equal(live[0].id, 'chat_older');
  assert.equal(live[0].pinned, true);

  const groups = groupArcChatsByRecency(chats, baseTs + 10000);
  assert.equal(groups[0].label, 'Pinned');
  assert.equal(groups[0].items[0].id, 'chat_older');

  // Rename chat -> preserves customTitle across cloud round-trip
  chats = renameArcChat(chats, 'chat_older', '  Morning Routine Masterplan  ', baseTs + 7000);
  const cloudSafe = sanitizeArcChatsForCloud(chats, baseTs + 7000);
  const merged = mergeArcChats([], cloudSafe, { nowMs: baseTs + 7000 });
  const target = getLiveArcChats(merged).find((c) => c.id === 'chat_older');
  assert.equal(target.title, 'Morning Routine Masterplan');
  assert.equal(target.customTitle, true);
  assert.equal(target.pinned, true);
});

test('ARC AI UI & Command Center wire Pin, Rename, Retry, Follow-up chips, ?chat= & + Ask AI', () => {
  const arc = read('Arc_AI.html');
  assert.match(arc, /id="ai-coach-retry-btn"/);
  assert.match(arc, /id="ai-coach-followups"/);
  assert.match(arc, /data-chat-pin=/);
  assert.match(arc, /data-chat-rename=/);
  assert.match(arc, /urlParams\?\.get\('chat'\)/);
  assert.match(arc, /habitarc_command_capture:/);

  const hub = read('productivity-hub.js');
  assert.match(hub, /habitarc_arc_chats:/);
  assert.match(hub, /Arc_AI\.html\?chat=/);
  assert.match(hub, /data-ha-capture="ai"/);
  assert.match(hub, /Arc_AI\.html\?capture=1/);
});

test('Self-service Account Deletion API enforces auth + DELETE confirmation and cleans Admin & REST records', async () => {
  const makeRes = () => {
    const out = { statusCode: 200, body: null, headers: {} };
    return {
      setHeader(k, v) { out.headers[k] = v; },
      status(code) { out.statusCode = code; return this; },
      json(payload) { out.body = payload; return out; },
      out,
    };
  };

  // 1. Rejects non-POST
  const r405 = makeRes();
  await accountDeleteHandler({ method: 'GET', headers: {} }, r405);
  assert.equal(r405.out.statusCode, 405);

  // 2. Rejects missing Bearer token
  const r401 = makeRes();
  await accountDeleteHandler({ method: 'POST', headers: {}, body: { confirm: 'DELETE' } }, r401);
  assert.equal(r401.out.statusCode, 401);

  // 3. Rejects missing DELETE confirmation
  const r400 = makeRes();
  await accountDeleteHandler({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { confirm: 'yes' },
  }, r400);
  assert.equal(r400.out.statusCode, 400);
  assert.equal(r400.out.body.error.code, 'confirmation-required');

  // 4. executeAdminAccountDeletion removes league member, squad uid, user subcollections, storage & auth user
  const deletedRefs = [];
  let updatedSquad = null;
  let deletedAuthUid = '';
  let deletedPrefix = '';

  const mockDb = {
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push(ref.path); },
        async commit() { deletedRefs.push(...ops); },
      };
    },
    collection(name) {
      if (name === 'leagueMembers') {
        return {
          doc: (uid) => ({
            path: `leagueMembers/${uid}`,
            async get() { return { exists: true, data: () => ({ uid, squadCode: 'AB12CD' }) }; },
            async delete() { deletedRefs.push(`leagueMembers/${uid}`); },
          }),
        };
      }
      if (name === 'leagueRooms') {
        return {
          doc: (code) => ({
            path: `leagueRooms/${code}`,
            async get() { return { exists: true, data: () => ({ code, name: 'Squad', memberUids: ['u_del', 'u_keep'] }) }; },
            async set(data) { updatedSquad = data; },
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: (uid) => ({
            path: `users/${uid}`,
            collection: (sub) => ({
              limit: () => ({
                async get() {
                  if (sub === 'habits') {
                    return { empty: false, size: 1, docs: [{ ref: { path: `users/${uid}/habits/h1` } }] };
                  }
                  return { empty: true, size: 0, docs: [] };
                },
              }),
            }),
            async delete() { deletedRefs.push(`users/${uid}`); },
          }),
        };
      }
      throw new Error('Unexpected collection ' + name);
    },
  };

  const adminOutcome = await executeAdminAccountDeletion({
    uid: 'u_del',
    db: mockDb,
    auth: { async deleteUser(uid) { deletedAuthUid = uid; } },
    storage: { bucket: () => ({ async deleteFiles({ prefix }) { deletedPrefix = prefix; } }) },
    storageBucket: 'habitarc.appspot.com',
  });
  assert.equal(adminOutcome.deleted, true);
  assert.equal(deletedAuthUid, 'u_del');
  assert.equal(deletedPrefix, 'users/u_del/');
  assert.deepEqual(updatedSquad.memberUids, ['u_keep']);
  assert.ok(deletedRefs.includes('leagueMembers/u_del'));
  assert.ok(deletedRefs.includes('users/u_del/habits/h1'));
  assert.ok(deletedRefs.includes('users/u_del'));

  // 5. executeRestAccountDeletion surfaces requires-recent-login cleanly
  await assert.rejects(
    () => executeRestAccountDeletion({
      idToken: 'tok',
      uid: 'u_del',
      deleteAuthOnServer: true,
      fetchImpl: async (url) => {
        if (String(url).includes('accounts:delete')) {
          return {
            ok: false,
            status: 400,
            async json() { return { error: { message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } }; },
          };
        }
        return { ok: true, status: 200, async json() { return { documents: [] }; } };
      },
    }),
    (err) => err?.code === 'auth/requires-recent-login' && err?.status === 409,
  );

  // 6. Settings UI & Privacy Policy expose self-service account deletion
  const settings = read('Settings.html');
  assert.match(settings, /id="delete-account-btn"/);
  assert.match(settings, /id="delete-account-dialog"/);
  assert.match(settings, /id="delete-account-confirm-input"/);

  const privacy = read('privacy.html');
  assert.match(privacy, /Self-Service Account &amp; Cloud Data Deletion/);
  assert.doesNotMatch(privacy, /not built yet|unfinished beta/i);
});

test('Placement B Floating Ask ARC pill and contextual slide-up sheet are wired and precached', async () => {
  const sw = read('sw.js');
  assert.match(sw, /'\/arc-sheet\.js'/);
  assert.match(sw, /'\/arc-sheet\.css'/);

  const appUi = read('app-ui.js');
  assert.match(appUi, /arc-sheet\.css/);
  assert.match(appUi, /import\('\.\/arc-sheet\.js'\)/);
  assert.match(appUi, /HabitArcSheet\?\.sync/);

  const sheetMod = await import('../arc-sheet.js');
  assert.equal(typeof sheetMod.mountArcSheet, 'function');
  assert.equal(typeof sheetMod.openArcSheet, 'function');
  assert.equal(typeof sheetMod.syncArcFab, 'function');

  const sheetJs = read('arc-sheet.js');
  assert.match(sheetJs, /id = 'ha-arc-fab'/);
  assert.match(sheetJs, /id = 'ha-arc-sheet'/);
  assert.match(sheetJs, /id="ha-arc-sheet-history-btn"/, 'History icon must open unified in-sheet Saved Chats drawer');
  assert.match(sheetJs, /id="ha-arc-sheet-hist-drawer"/, 'Ask ARC must include in-sheet Saved Chats drawer (Pin/Rename/Delete/Search)');
  assert.match(sheetJs, /id="ha-arc-sheet-hub-drawer"/, 'Ask ARC must include in-sheet Quests, Powers & AI Tones drawer');
  assert.match(sheetJs, /mountArcContext/, 'Ask ARC must wire real Tasks/Focus/Notes context attachment picker');
  assert.match(sheetJs, /createArcWordReveal/, 'Ask ARC must use progressive word-by-word streaming reveal');
  assert.doesNotMatch(sheetJs, /href="Arc_AI\.html"/, 'Ask ARC sheet must never navigate out to separate legacy Arc_AI.html page');
  assert.match(sheetJs, /<textarea id="ha-arc-sheet-input"/, 'Ask ARC composer must use auto-growing textarea');
  assert.match(sheetJs, /visualViewport/, 'Ask ARC sheet must sync height/top to visualViewport');
  assert.match(sheetJs, /--arc-vvh/, 'Ask ARC sheet must bind --arc-vvh to visible viewport height');
  assert.match(sheetJs, /hydrateSavedSheetSession/, 'Ask ARC sheet must restore active chat session on open');
  assert.match(sheetJs, /id="ha-arc-constellation"/, 'Ask ARC empty home must mount live Constellation canvas');
  assert.match(sheetJs, /readThemeConstellationPalette/, 'Constellation canvas must adapt dynamically to active light/dark theme tokens');
  assert.match(sheetJs, /ha-arc-beam-frame/, 'Ask ARC composer must mount rotating neon border-beam frame');
  assert.match(sheetJs, /TRY ASKING/, 'Ask ARC empty home must render Design 7 TRY ASKING prompt rows');
  assert.match(sheetJs, /id="ha-arc-continue-btn"/, 'Ask ARC empty home must offer 1-tap Continue pill for saved chats');
  assert.match(sheetJs, /id="ha-arc-sheet-retry"/, 'Ask ARC sheet must provide 1-tap Retry on errors');
  assert.doesNotMatch(sheetJs, /inputEl\?\.focus\(/, 'Ask ARC must never auto-focus text input or pop keyboard on open');
  assert.match(sheetJs, /renderContextDividerHtml/, 'Ask ARC thread must render editorial hairline context divider');
  assert.match(sheetJs, /data-sheet-chat-menu/, 'Saved Chats drawer must render floating context menu trigger instead of 3 loose row icons');
  assert.match(sheetJs, /ha-sheet-hist-pop/, 'Saved Chats drawer must render Claude/Linear-style floating context popover menu');
  assert.doesNotMatch(sheetJs, /LIVE SYNC/, 'Ask ARC header/kicker must not render noisy LIVE SYNC dot/label');

  const sheetCss = read('arc-sheet.css');
  assert.match(sheetCss, /font-size:\s*16px/, 'Composer input must use >=16px font-size to prevent mobile focus zoom');
  assert.match(sheetCss, /var\(--arc-vvh,\s*100svh\)/, 'Sheet dialog must use --arc-vvh with 100svh fallback instead of 100dvh');
  assert.match(sheetCss, /\.ha-arc-sheet-panel\.is-thread \.ha-arc-constellation\s*\{\s*display:\s*none/i, 'Active conversation must hide background constellation animation to preserve reading focus');
  assert.match(sheetCss, /\.ha-arc-ctx-line\.is-left\b/, 'Ask ARC thread context divider must style hairline fade lines');
  assert.match(sheetCss, /\.ha-sheet-hist-pop\b/, 'Saved Chats drawer must style floating context popover menu');
  assert.match(sheetCss, /\.ha-sheet-search-field\b/, 'Saved Chats drawer search bar must use HabitArc native bordered field');
  assert.match(sheetCss, /\.ha-sheet-bubble-card\b/, 'Ask ARC replies must render Tactile Paper Bubble Card');
  assert.match(sheetCss, /\.ha-arc-typewrap\b/, 'Ask ARC empty composer must style the typewriter prompt overlay');
  assert.match(sheetCss, /\.ha-arc-sheet-dialog:not\(\.is-kb-open\) \.ha-arc-sheet-panel\.is-empty \.ha-arc-empty-hero\s*\{\s*flex-direction:\s*column/, 'Ask ARC empty hero must center the Buddy greeting');
  assert.match(sheetJs, /syncTypewriter/, 'Ask ARC empty composer must run the typewriter prompt');
  assert.match(sheetCss, /\.ha-arc-sheet-panel\.is-thread \.ha-arc-sheet-plus[\s\S]*?order:\s*1\b/, 'Thread composer must anchor + button on left corner');
  assert.match(sheetCss, /\.ha-arc-sheet-panel\.is-thread \.ha-arc-sheet-send[\s\S]*?order:\s*3\b/, 'Thread composer must anchor send arrow on right corner');

  const shellPages = [
    'Dashboard.html',
    'Habits.html',
    'Notes.html',
    'Insights.html',
    'Leaderboard.html',
    'Arc_AI.html',
    'Profile.html',
    'Settings.html',
    'Add_Habit.html',
    'Habit_Detail.html',
  ];
  for (const page of shellPages) {
    const html = read(page);
    assert.match(
      html,
      /interactive-widget=resizes-content/,
      `${page} viewport meta must set interactive-widget=resizes-content so mobile keyboard never clips Ask ARC composer`,
    );
  }
});
