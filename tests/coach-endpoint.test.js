import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createCoachHandler, createRestFirebaseBackend, decodeFirestoreFields, createCoachStreamCollector, streamWithGemini, isExplicitHabitCreateRequest, isExplicitHabitUpdateRequest, isExplicitHabitDeleteRequest, isExplicitHabitCompleteRequest, isExplicitTaskCreateRequest, isExplicitBatchRebalanceRequest } from '../api/coach.js';

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


test('Real SSE Coach path keeps auth, quotas, server snapshots and private action tags', async () => {
    const auth = { verifyIdToken: async () => ({ uid: 'stream-member', firebase: { sign_in_provider: 'google.com' } }) };
    let quotaCalls = 0;
    let releases = 0;
    let generatorCalls = 0;
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T09:00:00Z'),
        getAdmin: async () => ({
            auth,
            reserveQuota: async () => { quotaCalls++; return { leaseId: 'lease', remaining: 7, limit: 15, resetAt: '2026-11-24T00:00:00.000Z' }; },
            releaseQuota: async () => { releases++; },
            loadSnapshot: async () => ({ habits: [], completionHistory: [], settings: {} })
        }),
        streamGenerate: async ({ onDelta, prompt }) => {
            generatorCalls++;
            assert.match(prompt, /streaming question/);
            onDelta('Start with a **small check-in**.\n');
            onDelta('<habitarc_ac');
            onDelta('tion>{"type":"create_habit","name":"Check In","category":"Mindfulness","reminder":"08:30","repeat":["mon"]}</habitarc_action>');
        },
        generate: async () => { throw new Error('Non-streaming endpoint must not generate here.'); }
    });
    const response = {
        headers: {}, statusCode: 0, output: '', ended: false,
        setHeader(k, v) { this.headers[k] = v; },
        flushHeaders() {},
        once() {},
        write(data) { this.output += data; },
        end() { this.ended = true; }
    };
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer test', 'content-type': 'application/json', accept: 'text/event-stream' },
        body: { question: 'streaming question', timeZone: 'Asia/Kolkata' }
    }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['Content-Type'], /text\/event-stream/);
    assert.equal(response.ended, true);
    assert.equal(quotaCalls, 1);
    assert.equal(releases, 1);
    assert.equal(generatorCalls, 1);
    const blocks = response.output.trim().split(/\n\n/);
    const events = blocks.map(block => ({
        name: block.match(/^event: (.+)$/m)?.[1],
        data: JSON.parse(block.match(/^data: (.+)$/m)?.[1])
    }));
    assert.equal(events[0].name, 'start');
    assert.equal(events.at(-1).name, 'done');
    const visible = events.filter(e => e.name === 'delta').map(e => e.data.text).join('');
    assert.equal(visible.trim(), 'Start with a **small check-in**.');
    assert.doesNotMatch(visible, /habitarc_action|create_habit/);
    const complete = events.at(-1).data;
    assert.equal(complete.answer, 'Start with a **small check-in**.');
    assert.equal(complete.snapshot.habitCount, 0);
    assert.equal(complete.suggestedAction?.name, 'Check In');
});

test('Collector handles split private action marker and flushes short non-action text', () => {
    let displayed = '';
    const collector = createCoachStreamCollector(delta => { displayed += delta; });
    for (const delta of ['Hello ', '<habitarc', '_action>', '{"type":"create_habit"}', '</habitarc_action>']) collector.push(delta);
    collector.flush();
    assert.equal(displayed, 'Hello ');
    assert.match(collector.raw, /habitarc_action/);
    displayed = '';
    const ordinary = createCoachStreamCollector(delta => { displayed += delta; });
    ordinary.push('Hi');
    ordinary.flush();
    assert.equal(displayed, 'Hi');
});

test('Gemini SSE parser processes genuine streamed fragments across CRLF/UTF-8 chunk splits', async () => {
    const old = process.env.HABITARC_GEMINI_API_KEY;
    process.env.HABITARC_GEMINI_API_KEY = 'mock-provider-key';
    try {
        const fixture = [
            'data: {"candidates":[{"content":{"parts":[{"text":"Hi "}]}}]}\r\n\r\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"🌟 day!"}]}, "finishReason":"STOP"}]}\r\n\r\n'
        ].join('');
        const bytes = new TextEncoder().encode(fixture);
        let index = 0;
        const body = new ReadableStream({
            pull(controller) {
                if (index >= bytes.length) { controller.close(); return; }
                controller.enqueue(bytes.slice(index, index + 7));
                index += 7;
            }
        });
        const deltas = [];
        await streamWithGemini({
            model: 'gemini-test', system: 'Test', prompt: '{}', maxOutputTokens: 32,
            abortSignal: AbortSignal.timeout(5000),
            fetchImpl: async (url, options) => {
                assert.match(url, /:streamGenerateContent\?alt=sse$/);
                assert.equal(options.headers['x-goog-api-key'], 'mock-provider-key');
                return { status: 200, ok: true, body };
            },
            onDelta: delta => deltas.push(delta)
        });
        assert.deepEqual(deltas, ['Hi ', '🌟 day!']);
    } finally {
        if (old === undefined) delete process.env.HABITARC_GEMINI_API_KEY;
        else process.env.HABITARC_GEMINI_API_KEY = old;
    }
});

test('Streaming failures after headers send an error frame and release the user lease', async () => {
    let releases = 0;
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T09:00:00Z'),
        logError() {},
        getAdmin: async () => ({
            auth: { verifyIdToken: async () => ({ uid: 'stream-member', firebase: { sign_in_provider: 'google.com' } }) },
            reserveQuota: async () => ({ leaseId: 'lease', remaining: 7, limit: 15 }),
            releaseQuota: async () => { releases++; },
            loadSnapshot: async () => ({ habits: [], completionHistory: [], settings: {} })
        }),
        streamGenerate: async ({ onDelta }) => { onDelta('Partial reply'); throw new Error('provider disconnected'); }
    });
    const response = {
        headers: {}, output: '', ended: false,
        setHeader(k,v) { this.headers[k] = v; }, flushHeaders() {}, once() {},
        write(text) { this.output += text; }, end() { this.ended = true; }
    };
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer test', 'content-type': 'application/json', accept: 'text/event-stream' },
        body: { question: 'Check my habits?', timeZone: 'Asia/Kolkata' }
    }, response);
    assert.equal(releases, 1);
    assert.equal(response.ended, true);
    assert.match(response.output, /event: error/);
    assert.doesNotMatch(response.output, /event: done/);
    assert.doesNotMatch(response.output, /provider disconnected/);
});


test('Streaming provider failure resets partial UI and falls back to JSON without counting an extra request', async () => {
    let quotaCalls = 0;
    let leaseReleases = 0;
    let fallbackCalls = 0;
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T09:00:00Z'),
        logError() {},
        getAdmin: async () => ({
            auth: { verifyIdToken: async () => ({ uid: 'stream-member', firebase: { sign_in_provider: 'google.com' } }) },
            reserveQuota: async () => {
                quotaCalls++;
                return { leaseId: 'once', remaining: 5, limit: 15 };
            },
            releaseQuota: async () => { leaseReleases++; },
            loadSnapshot: async () => ({ habits: [], completionHistory: [], settings: {} })
        }),
        streamGenerate: async ({ onDelta }) => {
            onDelta('Unfinished streamed text…');
            throw Object.assign(new Error('Gemini SSE unavailable'), { status: 502 });
        },
        generate: async () => {
            fallbackCalls++;
            return { text: 'Stable answer from the ordinary Gemini endpoint.' };
        }
    });
    const res = {
        headers: {}, chunks: [], writableEnded: false,
        setHeader(k,v) { this.headers[k] = v; }, flushHeaders() {}, once() {},
        write(text) { this.chunks.push(text); }, end() { this.writableEnded = true; }
    };
    await handler({
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json', accept: 'text/event-stream' },
        body: { question: 'Please summarize my routine', timeZone: 'Asia/Kolkata' }
    }, res);
    const streamed = res.chunks.join('');
    assert.equal(quotaCalls, 1);
    assert.equal(leaseReleases, 1);
    assert.equal(fallbackCalls, 1);
    assert.equal(res.writableEnded, true);
    assert.match(streamed, /event: reset/);
    assert.match(streamed, /event: done/);
    assert.match(streamed, /Stable answer from the ordinary Gemini endpoint/);
    assert.doesNotMatch(streamed, /event: error/);
});

test('Browser actually connects the SSE reader; it must not parse event-stream as JSON', () => {
    const html = readFileSync(new URL('../Arc_AI.html', import.meta.url), 'utf8');
    assert.match(html, /await consumeArcCoachStream\(response,/);
    assert.match(html, /event === 'delta'/);
    assert.match(html, /event === 'reset'/);
    assert.match(html, /event === 'done'/);
    assert.match(html, /response\.headers\?\.get\?\.\('content-type'\)/);
});

test('Casual check-ins route to greeting prompt without routine-audit bloat', async () => {
    const systems = [];
    const prompts = [];
    let usage;
    const ref = path => ({
        collection: n => ref(`${path}/${n}`), doc: n => ref(`${path}/${n}`),
        select() { return this; }, where() { return this; }, limit() { return this; },
        async get() { return { docs: [] }; }
    });
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T12:00:00Z'),
        timestamp: () => 't',
        logError() {},
        getAdmin: () => ({
            db: {
                collection: n => ref(n),
                runTransaction: fn => fn({
                    get: async () => ({ exists: !!usage, data: () => usage }),
                    set: (_, v) => { usage = { ...usage, ...v }; }
                })
            },
            auth: { verifyIdToken: async () => ({ uid: 'u1', firebase: { sign_in_provider: 'google.com' } }) }
        }),
        generate: async ({ system, prompt }) => {
            systems.push(system);
            prompts.push(JSON.parse(prompt));
            return { text: 'Main badhiya hoon! Aaj kis routine par focus karein?' };
        }
    });
    for (const q of ['Heelo ji', 'Sonion you fine ??']) {
        const res = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
        await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: q, timeZone: 'Asia/Kolkata', conversation: [{ question: 'old', answer: 'old' }] } }, res);
        assert.equal(res.code, 200);
        assert.equal(res.body.casualGreeting, true);
        assert.equal(res.body.routineDataUsed, false);
        usage.lastRequestAtMs = 0;
    }
    assert.match(systems[0], /Never write the word "snapshot", recite habit counts/);
    assert.equal(prompts[0].habitArcSnapshot, undefined);
    assert.equal(prompts[1].recentConversation.length, 0);

    usage.lastRequestAtMs = 0;
    const resMeta = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'What powers do you have here?', timeZone: 'Asia/Kolkata' } }, resMeta);
    assert.equal(resMeta.body.casualGreeting, false);
    assert.equal(resMeta.body.routineDataUsed, false);

    usage.lastRequestAtMs = 0;
    const resHabit = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Why did my meditation streak drop?', timeZone: 'Asia/Kolkata' } }, resHabit);
    assert.equal(resHabit.body.casualGreeting, false);
    assert.equal(resHabit.body.routineDataUsed, true);
    assert.match(systems[3], /when analyzing habits/);
    assert.match(systems[3], /NEVER write the word "snapshot"/);
});

test('Level 1 autoExecute triggers only on explicit habit-creation requests, never passive suggestions or negations', async () => {
    assert.equal(isExplicitHabitCreateRequest('Mere liye subah 7 baje Morning Walk habit bana do'), true);
    assert.equal(isExplicitHabitCreateRequest('Create a 10-min meditation habit at 21:00'), true);
    assert.equal(isExplicitHabitCreateRequest('Haan bana do', [{ question: 'Propose one', answer: 'How about Reading?' }]), true);
    assert.equal(isExplicitHabitCreateRequest('Suggest one easy health habit'), false);
    assert.equal(isExplicitHabitCreateRequest("Don't create a habit yet"), false);
    assert.equal(isExplicitHabitCreateRequest('Habit add mat karna abhi'), false);

    let usage;
    const ref = path => ({
        collection: n => ref(`${path}/${n}`), doc: n => ref(`${path}/${n}`),
        select() { return this; }, where() { return this; }, limit() { return this; },
        async get() { return { docs: [] }; }
    });
    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T12:00:00Z'),
        timestamp: () => 't',
        logError() {},
        getAdmin: () => ({
            db: {
                collection: n => ref(n),
                runTransaction: fn => fn({
                    get: async () => ({ exists: !!usage, data: () => usage }),
                    set: (_, v) => { usage = { ...usage, ...v }; }
                })
            },
            auth: { verifyIdToken: async () => ({ uid: 'u1', firebase: { sign_in_provider: 'google.com' } }) }
        }),
        generate: async () => ({
            text: 'Added **Morning Walk** at 07:00.\n<habitarc_action>{"type":"create_habit","name":"Morning Walk","category":"Fitness","reminder":"07:00","repeat":["mon","tue","wed","thu","fri","sat","sun"]}</habitarc_action>'
        })
    });

    const resExplicit = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Create a Morning Walk habit at 7am', timeZone: 'Asia/Kolkata' } }, resExplicit);
    assert.equal(resExplicit.code, 200);
    assert.equal(resExplicit.body.autoExecute, true);
    assert.equal(resExplicit.body.suggestedAction?.category, 'Fitness');

    usage.lastRequestAtMs = 0;
    const resSuggest = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Suggest an easy morning routine', timeZone: 'Asia/Kolkata' } }, resSuggest);
    assert.equal(resSuggest.code, 200);
    assert.equal(resSuggest.body.autoExecute, false);
});

test('quest progression gates Level 2 delete/edit/complete/task powers and Level 4 batch rebalance', async () => {
    assert.equal(isExplicitHabitUpdateRequest('Change Walk reminder to 06:45', [{ name: 'Walk' }]), true);
    assert.equal(isExplicitHabitUpdateRequest('Walk update mat karna', [{ name: 'Walk' }]), false);
    assert.equal(isExplicitHabitDeleteRequest('Delete my Walk habit', [{ name: 'Walk' }]), true);
    assert.equal(isExplicitHabitDeleteRequest("Don't delete Walk habit", [{ name: 'Walk' }]), false);
    assert.equal(isExplicitHabitCompleteRequest('Mark Walk done for today', [{ name: 'Walk' }]), true);
    assert.equal(isExplicitHabitCompleteRequest('Walk mat tick karna abhi', [{ name: 'Walk' }]), false);
    assert.equal(isExplicitTaskCreateRequest('Add a task to buy groceries'), true);
    assert.equal(isExplicitTaskCreateRequest("Don't add a task now"), false);
    assert.equal(isExplicitBatchRebalanceRequest('Rebalance all my habit times'), true);

    let usage;
    let completionDocs = [];
    let aiStats = {};
    let nextReply = 'Updated **Walk** reminder to 06:45.\n<habitarc_action>{"type":"update_habit","habitId":"h1","reminder":"06:45"}</habitarc_action>';
    const capturedPrompts = [];
    const ref = path => ({
        collection: n => ref(`${path}/${n}`),
        doc: n => ref(`${path}/${n}`),
        select() { return this; },
        where() { return this; },
        limit() { return this; },
        async get() {
            if (path === 'users/u1') {
                return { exists: true, data: () => ({ settings: { aiName: 'Nova', aiQuestStats: aiStats, aiTone: 'hinglish' } }) };
            }
            if (path.endsWith('/habits')) {
                return {
                    docs: [{
                        id: 'h1',
                        data: () => ({
                            name: 'Walk',
                            category: 'Fitness',
                            reminder: '08:00',
                            repeat: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
                            createdAt: '2026-11-01',
                            completions: {}
                        })
                    }]
                };
            }
            if (path.endsWith('/habitCompletions')) {
                return { docs: completionDocs };
            }
            return { docs: [] };
        }
    });

    const handler = createCoachHandler({
        configured: () => true,
        now: () => new Date('2026-11-23T12:00:00Z'),
        timestamp: () => 't',
        logError() {},
        getAdmin: () => ({
            db: {
                collection: n => ref(n),
                runTransaction: fn => fn({
                    get: async () => ({ exists: !!usage, data: () => usage }),
                    set: (_, v) => { usage = { ...usage, ...v }; }
                })
            },
            auth: { verifyIdToken: async () => ({ uid: 'u1', firebase: { sign_in_provider: 'google.com' } }) }
        }),
        generate: async (options) => {
            capturedPrompts.push(JSON.parse(options.prompt));
            return { text: nextReply };
        }
    });

    // At LVL 1 (0 quests), update_habit & delete_habit stay autoExecute: false
    const resL1 = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Change Walk reminder to 06:45', timeZone: 'Asia/Kolkata' } }, resL1);
    assert.equal(resL1.code, 200);
    assert.equal(capturedPrompts[0].assistantProfile.name, 'Nova');
    assert.equal(capturedPrompts[0].assistantProfile.level, 1);
    assert.equal(capturedPrompts[0].assistantProfile.tone, 'default');
    assert.equal(capturedPrompts[0].assistantProfile.quests.length, 3);
    assert.equal(resL1.body.aiProgression?.level, 1);
    assert.equal(resL1.body.autoExecute, false);

    // Unlock LVL 2 by finishing all 3 quests (1 AI habit + 3 check-ins + 1 clear day)
    usage.lastRequestAtMs = 0;
    aiStats = { createdViaAi: 1 };
    completionDocs = ['2026-11-20', '2026-11-21', '2026-11-22'].map((d, i) => ({
        id: `c${i}`,
        data: () => ({ habitId: 'h1', date: d, status: 'completed', updatedAt: `${d}T10:00:00Z` })
    }));
    nextReply = 'Deleted **Walk**.\n<habitarc_action>{"type":"delete_habit","habitId":"h1"}</habitarc_action>';
    const resL2Delete = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Delete my Walk habit', timeZone: 'Asia/Kolkata' } }, resL2Delete);
    assert.equal(resL2Delete.code, 200);
    assert.equal(resL2Delete.body.aiProgression?.level, 2);
    assert.equal(resL2Delete.body.autoExecute, true);
    assert.equal(resL2Delete.body.suggestedAction?.type, 'delete_habit');
    assert.equal(resL2Delete.body.suggestedAction?.habitId, 'h1');

    // Batch rebalance stays locked (autoExecute: false) at LVL 2 and unlocks at LVL 4
    usage.lastRequestAtMs = 0;
    nextReply = 'Rebalanced.\n<habitarc_action>{"type":"batch_update_habits","updates":[{"habitId":"h1","reminder":"07:00"}]}</habitarc_action>';
    const resBatchLocked = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Rebalance all my habit times', timeZone: 'Asia/Kolkata' } }, resBatchLocked);
    assert.equal(resBatchLocked.body.aiProgression?.level, 2);
    assert.equal(resBatchLocked.body.autoExecute, false);

    usage.lastRequestAtMs = 0;
    aiStats = { createdViaAi: 2, managedViaAi: 2, highestUnlockedLevel: 4 };
    const resL4Batch = { headers: {}, setHeader() {}, status(n) { this.code = n; return this; }, json(d) { this.body = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: { question: 'Rebalance all my habit times', timeZone: 'Asia/Kolkata' } }, resL4Batch);
    assert.equal(resL4Batch.body.aiProgression?.level, 4);
    assert.equal(resL4Batch.body.aiProgression?.tone, 'hinglish');
    assert.equal(resL4Batch.body.autoExecute, true);
    assert.equal(resL4Batch.body.suggestedAction?.type, 'batch_update_habits');
});
