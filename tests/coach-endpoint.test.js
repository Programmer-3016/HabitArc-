import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachHandler } from '../api/coach.js';

function fixture({ anonymous = false, authCode, configured = true, limit = 15 } = {}) {
    let usage;
    let generated = 0;
    const reads = [];
    const reference = path => ({
        collection: name => reference(`${path}/${name}`), doc: name => reference(`${path}/${name}`),
        select() { return this; }, where() { return this; }, limit() { return this; },
        async get() { reads.push(path); return { docs: [] }; }
    });
    const db = {
        collection: name => reference(name),
        runTransaction: fn => fn({
            get: async () => ({ exists: !!usage, data: () => usage }),
            set: (_, value) => { usage = { ...usage, ...value }; }
        })
    };
    const handler = createCoachHandler({
        configured: () => configured, now: () => new Date('2026-11-13T12:00:00Z'),
        timestamp: () => 'test-time', dailyLimit: () => limit, logError() {},
        getAdmin: () => ({ db, auth: { verifyIdToken: async () => {
            if (authCode) throw Object.assign(new Error('private detail'), { code: authCode });
            return { uid: 'member-a', firebase: { sign_in_provider: anonymous ? 'anonymous' : 'google.com' } };
        } } }),
        generate: async options => {
            generated++;
            const data = JSON.parse(options.prompt);
            assert.equal(data.habitArcSnapshot.insufficientData, true);
            assert.equal(options.maxRetries, 0);
            return { text: 'Track a few days before drawing conclusions.' };
        }
    });
    async function request(overrides = {}) {
        const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(data) { this.body = data; return this; } };
        await handler({ method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: { question: 'What should I focus on?', timeZone: 'Asia/Kolkata', uid: 'other-member' }, ...overrides }, response);
        return response;
    }
    return { request, reads, generated: () => generated };
}

test('Coach method/auth/JSON/body validation fails before model use', async () => {
    const app = fixture();
    assert.equal((await app.request({ method: 'GET' })).code, 405);
    assert.equal((await app.request({ headers: {} })).code, 401);
    assert.equal((await app.request({ body: '{' })).code, 400);
    assert.equal((await app.request({ body: { question: 'x'.repeat(700) } })).code, 400);
    assert.equal((await app.request({ body: { question: 'x'.repeat(21000) } })).code, 413);
    assert.equal((await app.request({ body: { question: 'Hello', timeZone: 'No/SuchZone' } })).code, 400);
    assert.equal(app.generated(), 0);
});

test('Coach rejects guest, expired token and missing configuration safely', async () => {
    assert.equal((await fixture({ anonymous: true }).request()).code, 403);
    const expired = await fixture({ authCode: 'auth/id-token-expired' }).request();
    assert.equal(expired.code, 401);
    assert.ok(!JSON.stringify(expired.body).includes('private detail'));
    assert.equal((await fixture({ configured: false }).request()).code, 503);
});

test('Coach reads only verified UID and enforces per-user request limit', async () => {
    const app = fixture({ limit: 1 });
    const response = await app.request();
    assert.equal(response.code, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
    assert.equal(response.body.usage.remaining, 0);
    assert.equal(response.body.snapshot.insufficientData, true);
    assert.deepEqual(app.reads, ['users/member-a/habits', 'users/member-a/habitCompletions', 'users/member-a']);
    assert.equal((await app.request()).code, 429);
    assert.equal(app.generated(), 1);
});

test('Coach cooldown prevents rapid duplicate requests', async () => {
    const app = fixture();
    assert.equal((await app.request()).code, 200);
    const response = await app.request();
    assert.equal(response.code, 429);
    assert.equal(response.body.error.code, 'request-too-soon');
    assert.equal(app.generated(), 1);
});
