import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitArcAnswer,renderArcSignalDeck,renderCoachMarkdown} from '../habit-analytics.js';

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
 assert.match(out,/ORIGINAL RESPONSE \/ UNABRIDGED/);
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
 assert.match(out,/ORIGINAL RESPONSE/);
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

test('Responsive view controls, history and exact raw-copy remain wired to existing ARC AI',()=>{
 const html=read('Arc_AI.html');
 assert.match(html,/renderArcSignalDeck\(latest\.answer/);
 assert.match(html,/renderArcSignalDeck\(turn\.answer/);
 assert.match(html,/handleDeckInteraction/);
 assert.match(html,/navigator\.clipboard\.writeText\(latestAnswer\)/);
 assert.match(html,/renderSuggestedAction\(activeAction/);
 const mobileNav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((mobileNav.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
 const css=read('app-ui.css');
 assert.match(css,/\.ha-arc-deck-controls/);
 assert.match(css,/@media\(max-width:359px\)/);
 assert.match(css,/\.ha-arc-deck-read-view\[hidden\]/);
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
