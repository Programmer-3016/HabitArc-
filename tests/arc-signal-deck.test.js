import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitArcAnswer,renderArcSignalDeck,renderArcChatAnswer,consumeArcCoachStream,createArcWordReveal,renderCoachMarkdown,cleanArcDisplayText,buildHabitCoachContext} from '../habit-analytics.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Signal Deck maps the original answer into lead, readouts and action route',()=>{
 const sample=[
   'You logged **9 of 14** reading days. The missing entries are not proof of a missed habit.',
   '',
   '### What the log says',
   'Your **Monday** entries were consistent.',
   '',
   '### Next moves',
   '1. **Anchor** — Try at 20:30.',
   '2. **Fallback** — Read 2 pages.',
   '',
   '### One-week experiment',
   'Track completion for 7 days.'
 ].join('\n');
 const parsed=splitArcAnswer(sample);
 assert.match(parsed.lead,/9 of 14/);
 assert.deepEqual(parsed.sections.map(x=>x.title),['What the log says','Next moves','One-week experiment']);
 const out=renderArcSignalDeck(sample);
 assert.match(out,/01 \/ THE SIGNAL/);
 assert.match(out,/data-arc-jump="2"/);
 assert.match(out,/data-arc-mode="signal" aria-pressed="true"/);
 assert.match(out,/data-arc-mode="read" aria-pressed="false"/);
 assert.match(out,/FULL RESPONSE \/ CLEAR READING/);
 assert.match(out,/<ol class="ha-md-ol">/);
 assert.match(out,/THE QUICK READ/);
 assert.match(out,/Track completion for 7 days/);
 assert.match(out,/ha-arc-deck-sections/);
});

test('Code fences do not spawn false sections, and original Markdown stays complete',()=>{
 const answer=[
   'Use a gentle experiment.',
   '',
   '### A short example',
   'Here is the rule:',
   '',
   '\x60\x60\x60js',
   '### doNotTreatAsHeading',
   'const x = 1;',
   '\x60\x60\x60',
   '',
   '| Day | Action |',
   '| --- | --- |',
   '| Mon | Read |'
 ].join('\n');
 const parsed=splitArcAnswer(answer);
 assert.equal(parsed.sections.length,1);
 assert.ok(parsed.sections[0].body.includes('### doNotTreatAsHeading'));
 const out=renderArcSignalDeck(answer);
 assert.match(out,/data-arc-copy-code/);
 assert.match(out,/ha-md-table/);
 assert.match(out,/doNotTreatAsHeading/);
 assert.match(out,/const x = 1/);
 assert.match(out,/FULL RESPONSE/);
});

test('Short greetings and heading-led answers do not become invented advice',()=>{
 assert.equal(renderArcSignalDeck(''),'');
 const greeting=renderArcSignalDeck('Hi! Ask about your habit routine.');
 assert.match(greeting,/Hi! Ask about your habit routine/);
 assert.doesNotMatch(greeting,/data-arc-panel="0"/);
 const heading=splitArcAnswer('### Plan\n\n- Start small');
 assert.equal(heading.lead,'');
 assert.equal(heading.sections[0].title,'Plan');
 assert.match(renderArcSignalDeck('### Plan\n\n- Start small'),/Start small/);
});

test('Safe Markdown links and strikethrough work without clickable script schemes',()=>{
 const unsafe='[bad](javascript:alert(1)) <img src=x onerror=alert(1)> [source](https://example.org/?a=1&b=2) ~~old~~';
 const out=renderArcSignalDeck(unsafe);
 assert.doesNotMatch(out,/<img\b/i);
 assert.doesNotMatch(out,/href="javascript:/i);
 assert.match(out,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(out,/href="https:\/\/example\.org\/\?a=1&amp;b=2"/);
 assert.match(out,/rel="noopener noreferrer"/);
 assert.match(out,/<del>old<\/del>/);
});

test('Single-chat UI, archived messages and raw-copy remain wired to existing ARC AI',()=>{
 const html=read('Arc_AI.html');
 assert.match(html,/renderArcChatAnswer\(latest\.answer/);
 assert.match(html,/renderArcChatAnswer\(turn\.answer/);
 assert.match(html,/handleAnswerInteraction/);
 assert.doesNotMatch(html,/SIGNAL \/ READ/);
 assert.match(html,/navigator\.clipboard\.writeText\(cleanArcDisplayText\(latestAnswer\)\)/);
 assert.match(html,/renderSuggestedAction\(activeAction/);
 const mobileNav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((mobileNav.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
 const css=read('app-ui.css');
 assert.match(css,/\.ha-arc-chat-answer/);
 assert.match(css,/@media \(max-width: 359px\)/);
 assert.match(css,/body\.ha-arc-body\.is-arc-thread-active \.ha-arc-answer-card/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(read('sw.js'),/habit-analytics\.js/);
});

test('Deck Markdown includes ordinary AI basics and does not rewrite the response',()=>{
 const answer='### Check\n\n- **Habit**: walk\n- *Today*: log\n\n> A note\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
 const out=renderArcSignalDeck(answer);
 for(const token of ['<strong>Habit</strong>','<em>Today</em>','ha-md-ul','ha-md-quote','ha-md-table'])
   assert.ok(out.includes(token),token);
 assert.match(renderCoachMarkdown('**bold** and \x60time\x60'),/<strong>bold<\/strong>/);
});


test('Server-backed metric tiles appear only for consistent verified snapshot counts',()=>{
 const answer='You have **0 logged entries**. Activity outside HabitArc is unknown.';
 const accurate=renderArcSignalDeck(answer,undefined,{
   habitCount:11,totalScheduled:216,totalLogged:0
 });
 assert.match(accurate,/11<\/strong>/);
 assert.match(accurate,/216<\/strong>/);
 assert.match(accurate,/LOGGED \/ 28D/);
 assert.match(accurate,/does not prove the activities were not performed/);
 assert.match(accurate,/SYNCED RECORDS/);
 assert.doesNotMatch(renderArcSignalDeck(answer),/ha-arc-metric-card/);
 assert.doesNotMatch(renderArcSignalDeck(answer,undefined,{
   habitCount:11,totalScheduled:10,totalLogged:12
 }),/ha-arc-metric-card/);
});

test('Six-column comparisons have safe data-labels so mobile can stack table rows',()=>{
 const answer='### Comparing habits\n\n| Habit | Category | Schedule | Days | Rate | Focus |\n| --- | --- | --- | --- | --- | --- |\n| Hydrate | Health | Mon-Sun | 28 | 0% | Rebuild tracking |';
 const out=renderArcSignalDeck(answer);
 for(const label of ['Habit','Category','Schedule','Days','Rate','Focus'])
    assert.ok(out.includes('data-label="'+label+'"'),label);
 assert.match(out,/ha-arc-responsive-table/);
 assert.match(read('app-ui.css'),/content:attr\(data-label\)/);
});

test('Legacy habit identifiers are hidden from the reading layout but code fences stay byte-identical',()=>{
 const response=[
   '- **Duplicates** — Including IDs \x60h_mv1e1f7c_n1r16\x60, \x60h_mwqg0ifs_sjwgv\x60, and \x60h_mwqg1eu1_zawnr\x60.',
   '- **Hydrate** (\x60h_mv1e1f75_3gwox\x60, \x600%\x60 over 28 days).',
   '',
   '\x60\x60\x60js',
   '  const spaced =  3;',
   '\x60\x60\x60'
 ].join('\n');
 const cleaned=cleanArcDisplayText(response);
 assert.doesNotMatch(cleaned,/h_mv1|h_mwq/);
 assert.match(cleaned,/multiple matching habit entries/);
 assert.match(cleaned,/Hydrate/);
 assert.match(cleaned,/0%/);
 assert.match(cleaned,/  const spaced =  3;/);
 assert.doesNotMatch(renderArcSignalDeck(response),/h_mv1|h_mwq/);
 assert.equal(cleanArcDisplayText('Multiple entries sharing Daily Meditation & Mindful Reflection (such as IDs `h_abc123`, `h_def456`, `h_ghi789`, and `h_jkl012`) today.'), 'Multiple entries sharing Daily Meditation & Mindful Reflection today.');
 assert.equal(cleanArcDisplayText('Multiple entries sharing Daily Meditation (such as IDs , , , and).'), 'Multiple entries sharing Daily Meditation.');
});

test('Actual analytics determine completion statistics, not generated text',()=>{
 const {metrics}=buildHabitCoachContext({
   now:new Date('2026-11-21T12:00:00Z'),timeZone:'Asia/Kolkata',
   habits:[{id:'habit-a',name:'Hydrate',repeat:['mon','tue','wed','thu','fri','sat','sun'],createdAt:'2026-01-01'}]
 });
 assert.equal(metrics.habitCount,1);
 assert.equal(metrics.totalScheduled,28);
 assert.equal(metrics.totalLogged,0);
});


test('Conversation layout renders one complete Markdown answer without duplicate hero or modes', () => {
 const answer = [
  'You have **0 recorded completions**. That does not prove you skipped the routines.',
  '',
  '### One small next step',
  '- **Today:** Log one habit you complete.',
  '- **Tomorrow:** Try again.',
  '',
  'A short closing thought.'
 ].join('\n');
 const html = renderArcChatAnswer(answer, undefined, {habitCount:12,totalScheduled:220,totalLogged:0});
 assert.match(html,/class="ha-arc-chat-answer ha-md-prose"/);
 assert.match(html,/<strong>0 recorded completions<\/strong>/);
 assert.match(html,/<h4 class="ha-md-h">One small next step<\/h4>/);
 assert.match(html,/<ul class="ha-md-ul">/);
 assert.match(html,/A short closing thought/);
 assert.match(html,/SYNCED ACCOUNT SNAPSHOT/);
 assert.match(html,/12 habits · 0\/220 logged checks/);
 assert.equal((html.match(/One small next step/g)||[]).length,1);
 assert.doesNotMatch(html,/SIGNAL|READOUT|data-arc-mode|ha-arc-signal-hero/);
});

test('Chat renderer safely escapes injected markup and keeps formatted tables and code copy', () => {
 const input = '### Compare\n\n| Habit | Rate |\n| --- | --- |\n| Read | 25% |\n\n' +
  '\x60\x60\x60js\nconst ok = 1;\n\x60\x60\x60\n\n' +
  '<img src=x onerror=alert(1)> [safe](https://example.org/?x=1&y=2)';
 const out = renderArcChatAnswer(input);
 assert.match(out,/ha-arc-responsive-table/);
 assert.match(out,/data-label="Habit"/);
 assert.match(out,/data-arc-copy-code/);
 assert.match(out,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(out,/<img\b/i);
 assert.match(out,/https:\/\/example.org\/\?x=1&amp;y=2/);
 assert.doesNotMatch(out,/ha-arc-chat-source/);
});


test('Mobile SSE reader renders real chunks in order and accepts only a final done event', async () => {
    const frames = [
        'event: start\r\ndata: {"ready":true}\r\n\r\n',
        'event: delta\r\ndata: {"text":"First "}\r\n\r\n',
        'event: delta\r\ndata: {"text":"🌟 then second"}\r\n\r\n',
        'event: done\r\ndata: {"answer":"First 🌟 then second","suggestedAction":null}\r\n\r\n'
    ].join('');
    const bytes = new TextEncoder().encode(frames);
    let cursor = 0;
    const body = new ReadableStream({
        pull(controller) {
            if (cursor >= bytes.length) { controller.close(); return; }
            controller.enqueue(bytes.slice(cursor, cursor + 9));
            cursor += 9;
        }
    });
    let collected = '';
    let final;
    await consumeArcCoachStream({ body }, (event, value) => {
        if (event === 'delta') collected += value.text;
        if (event === 'done') final = value;
    });
    assert.equal(collected, 'First 🌟 then second');
    assert.equal(final.answer, 'First 🌟 then second');
});

test('Mobile SSE reader rejects truncated responses and provider error frames', async () => {
    const bodyFrom = text => {
        const bytes = new TextEncoder().encode(text);
        return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    };
    await assert.rejects(
        consumeArcCoachStream({ body: bodyFrom('event: delta\ndata: {"text":"Unfinished"}\n\n') }, () => {}),
        /connection closed before/
    );
    await assert.rejects(
        consumeArcCoachStream({ body: bodyFrom('event: error\ndata: {"message":"Retry later"}\n\n') }, () => {}),
        /Retry later/
    );
});


test('Word reveal uses received SSE text only and visibly advances before completion', async () => {
    const frames = [];
    const reveal = createArcWordReveal(text => frames.push(text), { intervalMs: 2 });
    reveal.push('Hel');
    assert.equal(frames.length, 0, 'incomplete upstream word must not render');
    reveal.push('lo world');
    reveal.push(', this is live!');
    const final = await reveal.finish();
    assert.equal(final, 'Hello world, this is live!');
    assert.deepEqual(frames, [
        'Hello ', 'Hello world, ', 'Hello world, this ',
        'Hello world, this is ', 'Hello world, this is live!'
    ]);
});

test('Word reveal reset discards old stream and cancellation terminates pending animation', async () => {
    const frames = [];
    const reveal = createArcWordReveal(text => frames.push(text), { intervalMs: 1 });
    reveal.push('Old partial data ');
    reveal.reset();
    reveal.push('New response');
    assert.equal(await reveal.finish(), 'New response');
    assert.deepEqual(frames, ['New ', 'New response']);
    const next = createArcWordReveal(text => frames.push(text), { intervalMs: 20 });
    next.push('Never paint this text ');
    const pending = next.finish();
    next.cancel();
    assert.equal(await pending, '');
    assert.doesNotMatch(frames.join(''), /Never paint/);
});

test('Visible word streaming is bound to real deltas; full fallback remains instant', () => {
    const html = read('Arc_AI.html');
    assert.match(html, /wordReveal\.push\(value\.text\)/);
    assert.match(html, /await wordReveal\.finish\(\)/);
    assert.match(html, /streamFellBack = true;\s*wordReveal\.reset\(\)/);
    assert.doesNotMatch(html, /scheduleDraft\(\)/);
});
