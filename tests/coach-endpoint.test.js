import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createCoachHandler, createRestFirebaseBackend, decodeFirestoreFields } from '../api/coach.js';

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

test('Coach returns validated suggestedAction and strips machine tags from response prose', async () => {
    let generated = 0;
    const reference = path => ({
        collection: name => reference(`${path}/${name}`), doc: name => reference(`${path}/${name}`),
        select() { return this; }, where() { return this; }, limit() { return this; },
        async get() { return { docs: [] }; }
    });
    const db = {
        collection: name => reference(name),
        runTransaction: fn => fn({ get: async () => ({ exists: false }), set() {} })
    };
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-13T12:00:00Z'),
        timestamp: () => 'test-time',
        logError() {},
        getAdmin: () => ({ db, auth: { verifyIdToken: async () => ({ uid: 'member-a', firebase: { sign_in_provider: 'google.com' } }) } }),
        generate: async () => {
            generated++;
            return {
                text: 'Start with a 5-minute walk.\n<habitarc_action>{"type":"create_habit","name":"5-Min Walk","category":"Health","reminder":"18:00","repeat":["mon","tue","wed","thu","fri"]}</habitarc_action>'
            };
        }
    });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Suggest one easy health habit', timeZone: 'Asia/Kolkata' } }, res);
    assert.equal(generated, 1);
    assert.equal(res.code, 200);
    assert.equal(res.body.answer, 'Start with a 5-minute walk.');
    assert.deepEqual(res.body.suggestedAction, {
        type: 'create_habit',
        name: '5-Min Walk',
        category: 'Health',
        reminder: '18:00',
        repeat: ['mon', 'tue', 'wed', 'thu', 'fri'],
        why: ''
    });
});

test('decodeFirestoreFields decodes nested maps, arrays, ints, booleans and strings cleanly', () => {
    const decoded = decodeFirestoreFields({
        name: { stringValue: 'Morning Walk' },
        goalDuration: { integerValue: '30' },
        repeat: { arrayValue: { values: [{ stringValue: 'mon' }, { stringValue: 'wed' }] } },
        completions: { mapValue: { fields: { '2026-11-15': { booleanValue: true } } } },
        note: { nullValue: null }
    });
    assert.deepEqual(decoded, {
        name: 'Morning Walk',
        goalDuration: 30,
        repeat: ['mon', 'wed'],
        completions: { '2026-11-15': true },
        note: null
    });
});

test('REST Firebase backend verifies RS256 ID tokens, blocks anonymous/wrong-aud tokens, and parses Firestore REST snapshot', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    const nowSec = Math.floor(Date.parse('2026-11-16T18:00:00Z') / 1000);
    const makeJwt = (payload, kid = 'key-1') => {
        const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signer = createSign('RSA-SHA256');
        signer.update(`${hdr}.${body}`);
        const sig = signer.sign(privateKey).toString('base64url');
        return `${hdr}.${body}.${sig}`;
    };

    const validJwt = makeJwt({
        aud: 'habitarc-dfa40',
        iss: 'https://securetoken.google.com/habitarc-dfa40',
        sub: 'user-rest-1',
        iat: nowSec - 60,
        auth_time: nowSec - 60,
        exp: nowSec + 3600,
        firebase: { sign_in_provider: 'google.com' }
    });

    const backend = createRestFirebaseBackend({
        projectId: 'habitarc-dfa40',
        webApiKey: 'test-web-key',
        now: () => new Date(nowSec * 1000),
        fetchImpl: async (url) => {
            const target = String(url);
            if (target.includes('securetoken@system.gserviceaccount.com')) {
                return { ok: true, status: 200, headers: new Headers({ 'cache-control': 'max-age=3600' }), json: async () => ({ 'key-1': pubPem }) };
            }
            if (target.includes('accounts:lookup')) {
                return { ok: true, status: 200, json: async () => ({ users: [{ localId: 'user-rest-1', disabled: false, providerUserInfo: [{ providerId: 'google.com' }] }] }) };
            }
            if (target.endsWith('/users/user-rest-1')) {
                return { ok: true, status: 200, json: async () => ({ fields: { settings: { mapValue: { fields: { goalDuration: { integerValue: '45' } } } } } }) };
            }
            if (target.includes('/habits')) {
                return {
                    ok: true, status: 200,
                    json: async () => ({
                        documents: [{
                            name: 'projects/habitarc-dfa40/databases/(default)/documents/users/user-rest-1/habits/h-rest-1',
                            fields: {
                                name: { stringValue: 'Deep Work' },
                                category: { stringValue: 'Focus' },
                                createdAt: { stringValue: '2026-11-01' },
                                repeat: { arrayValue: { values: [{ stringValue: 'mon' }, { stringValue: 'tue' }] } }
                            }
                        }]
                    })
                };
            }
            if (target.includes(':runQuery')) {
                return {
                    ok: true, status: 200,
                    json: async () => ([
                        { document: { name: '.../habitCompletions/h-rest-1_2026-11-16', fields: { habitId: { stringValue: 'h-rest-1' }, date: { stringValue: '2026-11-16' }, status: { stringValue: 'completed' } } } },
                        { readTime: '2026-11-16T18:00:00Z' }
                    ])
                };
            }
            throw new Error(`Unexpected REST URL: ${target}`);
        }
    });

    const handler = createCoachHandler({
        getAdmin: async () => backend,
        configured: () => true,
        now: () => new Date(nowSec * 1000),
        logError() {},
        generate: async (opts) => {
            const parsedPrompt = JSON.parse(opts.prompt);
            assert.equal(parsedPrompt.habitArcSnapshot.planning.goalDurationDays, 45);
            assert.equal(parsedPrompt.habitArcSnapshot.habits[0].name, 'Deep Work');
            return { text: 'Focus looks solid — keep your Deep Work cue consistent.' };
        }
    });

    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${validJwt}`, 'content-type': 'application/json' }, body: { question: 'How is Deep Work going?', timeZone: 'Asia/Kolkata' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.answer, 'Focus looks solid — keep your Deep Work cue consistent.');
    assert.equal(res.body.usage.remaining, 14);

    // Wrong audience must fail with 401
    const wrongAudJwt = makeJwt({ aud: 'other-project', iss: 'https://securetoken.google.com/other-project', sub: 'user-rest-1', iat: nowSec - 60, auth_time: nowSec - 60, exp: nowSec + 3600 });
    const badRes = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${wrongAudJwt}`, 'content-type': 'application/json' }, body: { question: 'Hello?', timeZone: 'Asia/Kolkata' } }, badRes);
    assert.equal(badRes.code, 401);
});
