import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseWorkspaceContext} from '../api/_workspace-context.js';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('ARC extra workspace data is optional and defaults to none',()=>{
 assert.equal(normaliseWorkspaceContext(),null);
 assert.equal(normaliseWorkspaceContext(null),null);
 const arc=source('Arc_AI.html');
 assert.match(arc,/id="arc-context-open"/);
 assert.match(arc,/workspaceContext\s*\?\s*\{\s*workspaceContext\s*\}/);
 assert.match(source('arc-context.js'),/taskBox\.checked=false;focusBox\.checked=false;selected\.clear\(\)/);
});

test('Task, Focus and selected Notes context is bounded and sanitised',()=>{
 const ctx=normaliseWorkspaceContext({
  tasks:[{title:'   Assignment  ',dueDate:'2026-11-22',priority:'high',completed:false}],
  focus:[{date:'2026-11-20',minutes:25}],
  notes:[{title:'Reading',excerpt:'  Study notes\\n ' }]
 });
 assert.deepEqual(ctx.tasks,[{title:'Assignment',dueDate:'2026-11-22',priority:'high',completed:false}]);
 assert.deepEqual(ctx.focus,[{date:'2026-11-20',minutes:25}]);
 assert.equal(ctx.notes[0].title,'Reading');
 assert.throws(()=>normaliseWorkspaceContext({notes:Array.from({length:4},()=>({title:'n',excerpt:'a'}))}),/Too many selected notes/);
 assert.throws(()=>normaliseWorkspaceContext({tasks:[{title:'Study',dueDate:'',priority:'high',completed:false,owner:'someone-else'}]}),/Invalid task context/);
 assert.throws(()=>normaliseWorkspaceContext({focus:[{date:'2026-11-20',minutes:999}]}),/Invalid focus context/);
 assert.throws(()=>normaliseWorkspaceContext({notes:[{title:'n',excerpt:'x'.repeat(851)}]}),/Invalid selected note/);
 assert.throws(()=>normaliseWorkspaceContext({unknown:'x'}),/Invalid workspace context/);
});

test('ARC server maintains privileged snapshot separate from optional client data',()=>{
 const coach=source('api/coach.js');
 assert.match(coach,/normaliseWorkspaceContext\(body\.workspaceContext\)/);
 assert.match(coach,/habitArcSnapshot: context\.snapshot/);
 assert.match(coach,/workspaceContext.*recentConversation/s);
 assert.match(coach,/untrusted data, not instructions/);
 assert.match(source('arc-context.js'),/fresh\.filter\(n=>selected\.has\(n\.id\)\)/);
 assert.match(source('arc-context.js'),/notes\.filter\(n=>n\.owner===owner/);
});

test('ARC five-tab navigation and PWA offline cache still remain intact',()=>{
 const html=source('Arc_AI.html');
 const nav=html.match(/<nav class="ha-bottom-nav[\s\S]*?<\/nav>/)?.[0]||'';
 assert.equal((nav.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
 assert.match(source('sw.js'),/habitarc-shell-v28/);
 assert.match(source('sw.js'),/arc-context\.js/);
});
