import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chestArt} from '../treasure-art.js';
import {CHESTS} from '../runner-treasures.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fakeNode(tag) {
  return {
    tag,children:[],attrs:{},dataset:{},className:'',
    setAttribute(name,value){this.attrs[name]=String(value);},
    append(child){this.children.push(child);return child;}
  };
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
function render(id,opened=false) {
  const old=globalThis.document;
  globalThis.document={
    createElement:fakeNode,
    createElementNS(_ns,name){return fakeNode(name);}
  };
  try{return chestArt({id},opened);}finally{globalThis.document=old;}
}
test('Existing three reward tiers use distinct chunky 16-bit chest sprites',()=>{
  assert.deepEqual(CHESTS.map(c=>c.id),['wood','iron','gold']);
  const colors=new Set();
  for(const id of ['wood','iron','gold']) {
    const art=render(id);
    assert.equal(art.className,'lb-chest-art');
    assert.equal(art.dataset.open,'false');
    assert.equal(art.dataset.style,'pixel-game');
    assert.equal(art.attrs['aria-hidden'],'true');
    const nodes=descendants(art);
    const svg=nodes.find(n=>n.tag==='svg');
    assert.equal(svg.attrs.viewBox,'0 0 88 78');
    assert.equal(svg.attrs['shape-rendering'],'crispEdges');
    const pixels=nodes.filter(n=>n.tag==='rect');
    assert.ok(pixels.length>=70,id+' pixel tiles: '+pixels.length);
    assert.ok(pixels.every(p=>['x','y','width','height'].every(k=>Number.isInteger(Number(p.attrs[k])))),id+' grid pixels');
    for(const cls of ['lb-chest-entry','lb-chest-object','lb-chest-body','lb-chest-lid','lb-chest-clasp','lb-chest-well','lb-chest-lining','lb-chest-relic','lb-loot-sparks','lb-chest-ambient']) {
      assert.ok(nodes.some(n=>n.attrs.class===cls),id+' missing animation hook '+cls);
    }
    const fill=nodes.filter(n=>n.tag==='rect').map(n=>n.attrs.fill).join(',');
    assert.ok(!fill.includes('url('),'no remote art resources');
    colors.add(fill.slice(0,340));
  }
  assert.equal(colors.size,3,'different pixel palettes for each reward tier');
});
test('Open chest state preserves existing reveal contract without changing XP',()=>{
  assert.equal(render('wood',true).dataset.open,'true');
  const js=read('leaderboard.js');
  assert.match(js,/chestArt\(chest, false\)/);
  assert.match(js,/art\.dataset\.open = 'true'/);
  assert.match(js,/lb-chest-relic/);
  assert.match(js,/changeTreasure\(/);
  const rewards=read('runner-treasures.js');
  assert.match(rewards,/days: 1, xp: 30/);
  assert.match(rewards,/days: 7, xp: 70/);
  assert.match(rewards,/days: 14, xp: 140/);
});
test('Both top tab groups remain operable at 320px and 480px',()=>{
  const html=read('Leaderboard.html'),css=read('leaderboard.css');
  for(const id of ['show-league','show-treasures','league-controls']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/data-period="weekly"/);
  assert.match(html,/data-period="allTime"/);
  assert.match(css,/\.lb-view-switch\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.lb-controls\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/@media \(max-width:480px\)/);
  assert.match(css,/@media \(max-width:359px\)/);
  assert.match(css,/\.lb-controls \.lb-filters\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.lb-view-switch button\s*\{[^}]*min-height:46px/);
  assert.match(html,/lb-mobile-topbar/);
  assert.match(html,/lb-desktop-topbar/);
  assert.match(css,/\.lb-desktop-topbar nav\s*\{[^}]*overflow-x:auto/);
  assert.match(css,/\.lb-mobile-topbar\s*\{[^}]*padding-inline:10px/);
});
test('Treasure scope and PWA refresh stay isolated',()=>{
 const html=read('Leaderboard.html'),worker=read('sw.js'),css=read('leaderboard.css');
 assert.equal((html.match(/class="ha-bottom-nav-link"/g)||[]).length,5);
 for(const asset of ['/Leaderboard.html','/leaderboard.css','/leaderboard.js','/treasure-art.js'])
   assert.ok(worker.includes("'"+asset+"'"),asset);
 assert.doesNotMatch(css,/\nbody\s*\{/);
 assert.doesNotMatch(css,/\ntable\s*\{/);
});
