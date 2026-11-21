// HabitArc original, front-facing 16-bit-style treasure sprites.
// Visual layer only: preserve the existing tier IDs, unlock flow, modal
// animation hooks and reward relics. No canvas, external assets or new rewards.
const NS = 'http://www.w3.org/2000/svg';
function node(parent, tag, attrs = {}) {
  const item = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) item.setAttribute(name, value);
  parent.append(item);
  return item;
}
const group = (parent, cls) => node(parent, 'g', { class: cls });
const rect = (parent, fill, x, y, width, height) =>
  node(parent, 'rect', { x, y, width, height, fill });
const path = (parent, fill, d) => node(parent, 'path', { fill, d });

// All visible corners snap to an even-pixel grid in an 88×78 SVG.
// Hardware, highlights and keyholes are deliberately chunky, never smoothed.
const PALETTES = Object.freeze({
  wood: {
    ink:'#211716', dark:'#56321d', shade:'#834b26',
    face:'#ad6730', lit:'#cc8740', highlight:'#f4b660',
    metal:'#b98b52', trim:'#e9b876', shine:'#fff0aa',
    inside:'#2b1a27', seam:'#6a3926', spark:'#e59a3a',gem:'#3d291c'
  },
  iron: {
    ink:'#1d2638', dark:'#263b57', shade:'#385376',
    face:'#5e81ab', lit:'#87a8d0', highlight:'#aecde7',
    metal:'#91b3c8', trim:'#c9e1ed', shine:'#edfcff',
    inside:'#172b42', seam:'#324b6c', spark:'#96a2ff',gem:'#70dbe8'
  },
  gold: {
    ink:'#2d1930', dark:'#5d2545', shade:'#8c345c',
    face:'#b04466', lit:'#d65a7c', highlight:'#fa9190',
    metal:'#d28a20', trim:'#ffca4b', shine:'#fff19b',
    inside:'#361737', seam:'#742746', spark:'#c66aff',gem:'#ab4ce0'
  }
});

function studs(parent, tint, positions) {
  for (const [x, y] of positions) rect(parent,tint,x,y,2,2);
}
function sparkle(parent, color, x, y, size = 2) {
  // Four-point retro sparkle built out of integer-aligned square pixels.
  rect(parent,color,x,y-size,size,size);
  rect(parent,color,x-size,y,size,size);
  rect(parent,color,x,y,size,size);
  rect(parent,color,x+size,y,size,size);
  rect(parent,color,x,y+size,size,size);
}
function drawShadow(parent, c) {
  rect(parent,'var(--case-shadow)',14,65,60,3);
  rect(parent,'var(--case-shadow)',21,68,46,2);
  rect(parent,'var(--case-shadow)',27,70,34,2);
}
function drawChestBody(parent, c, id) {
  // Solid squared chest profile, dark pixel outline and side-wall depth.
  rect(parent,c.ink,12,35,64,29);
  rect(parent,c.ink,10,40,68,20);
  rect(parent,c.dark,14,39,60,22);
  rect(parent,c.shade,16,40,56,21);
  rect(parent,c.face,19,43,49,15);
  rect(parent,c.lit,20,44,42,3);
  rect(parent,c.dark,68,42,5,17);
  rect(parent,c.seam,25,49,37,2);
  rect(parent,c.shade,25,51,39,3);
  rect(parent,c.highlight,27,44,20,2);
  // Lower bevel and brass/silver/champagne binding strip.
  rect(parent,c.ink,12,58,64,7);
  rect(parent,c.metal,14,58,60,5);
  rect(parent,c.trim,16,58,54,2);
  rect(parent,c.shade,17,62,52,2);
  rect(parent,c.ink,14,64,61,2);
  // Two thick vertical pixelated metal straps.
  for (const x of [18,62]) {
    rect(parent,c.ink,x-2,38,10,26);
    rect(parent,c.metal,x,39,6,23);
    rect(parent,c.trim,x,39,4,20);
    rect(parent,c.shine,x+1,41,2,6);
    rect(parent,c.dark,x+5,42,2,17);
  }
  studs(parent,c.shine,[[20,49],[64,49],[20,58],[64,58]]);
  // Front-facing plank/rune marks distinguish tiers without adding items.
  if(id==='wood'){
    rect(parent,c.seam,30,54,13,2);
    rect(parent,c.highlight,47,47,11,2);
    rect(parent,c.dark,52,54,4,2);
  } else if(id==='iron'){
    rect(parent,c.metal,31,51,25,3);
    rect(parent,c.shine,34,52,8,2);
    rect(parent,c.seam,43,55,14,2);
  } else {
    rect(parent,c.trim,31,51,25,2);
    rect(parent,c.shine,36,51,10,2);
    rect(parent,c.metal,34,55,20,2);
    studs(parent,c.shine,[[31,45],[58,45]]);
  }
}
function drawInnerWell(parent, c) {
  // Under the independent lid; visible after the existing opening animation.
  rect(parent,c.ink,14,32,60,14);
  rect(parent,c.inside,17,34,54,10);
  rect(parent,c.dark,20,37,48,6);
  rect(parent,c.trim,15,33,58,2);
  rect(parent,c.highlight,19,35,47,2);
}
function drawLining(parent, c) {
  // Glittering loot inside the chest appears only once the lid lifts.
  rect(parent,c.trim,24,36,40,6);
  rect(parent,c.shine,30,37,27,3);
  rect(parent,c.metal,20,41,47,3);
  studs(parent,c.highlight,[[26,34],[45,32],[59,35]]);
}
function drawChestLid(parent, c, id) {
  // Stepped roof silhouette (no vector curves): classic pixel-game coffer.
  rect(parent,c.ink,10,29,68,12);
  rect(parent,c.ink,12,23,64,17);
  rect(parent,c.ink,16,19,56,21);
  rect(parent,c.ink,20,17,48,23);
  rect(parent,c.ink,24,15,40,25);
  rect(parent,c.dark,14,27,60,10);
  rect(parent,c.shade,16,23,56,14);
  rect(parent,c.face,20,21,48,16);
  rect(parent,c.lit,23,19,42,12);
  rect(parent,c.highlight,26,18,33,4);
  rect(parent,c.shine,28,18,19,2);
  rect(parent,c.shade,21,29,47,4);
  rect(parent,c.seam,26,23,33,2);
  rect(parent,c.face,27,26,27,3);
  // Stepped side rim, matching the hand-drawn reference chest silhouette.
  rect(parent,c.metal,12,29,64,10);
  rect(parent,c.trim,14,31,60,6);
  rect(parent,c.shine,16,31,48,2);
  rect(parent,c.dark,15,37,59,4);
  // Distinct top-cover straps that follow the roof.
  for (const x of [19,61]) {
    rect(parent,c.ink,x-2,19,10,22);
    rect(parent,c.metal,x,21,6,18);
    rect(parent,c.trim,x,21,4,15);
    rect(parent,c.shine,x+1,22,2,6);
  }
  studs(parent,c.shine,[[20,32],[64,32]]);
  if(id==='gold'){
    // Tiny royal inlay, separate from the lock emblem.
    rect(parent,c.trim,37,20,14,3);
    rect(parent,c.gem,41,18,6,5);
    rect(parent,c.shine,43,19,2,2);
  } else if(id==='iron'){
    rect(parent,c.highlight,34,20,20,2);
  } else {
    rect(parent,c.shine,33,20,12,2);
  }
}
function drawClasp(parent, c, id) {
  // The clasp belongs to the lid so it disappears naturally when opened.
  rect(parent,c.ink,37,34,16,16);
  rect(parent,c.metal,39,35,12,13);
  rect(parent,c.trim,40,35,10,11);
  rect(parent,c.shine,41,36,5,2);
  if(id==='gold'){
    // Faceted purple gem in the grand chest lock.
    rect(parent,c.ink,42,38,6,8);
    rect(parent,c.gem,42,39,6,5);
    rect(parent,'#e7adfa',44,39,2,3);
    rect(parent,c.dark,44,44,2,2);
  }else{
    rect(parent,c.ink,43,39,4,5);
    rect(parent,c.ink,42,43,6,3);
    if(id==='iron')rect(parent,c.gem,44,40,2,2);
  }
  studs(parent,c.shine,[[40,45],[49,45]]);
}
function drawRelic(parent,id) {
  // Existing chest rewards are unchanged: Ember Trail, Orbit Shield, Crown.
  if(id==='wood'){
    path(parent,'#6b2730','M43 5H47V10H50V14H52V20H50V24H46V26H41V23H38V20H36V16H39V12H42Z');
    path(parent,'#ff9b36','M44 9H46V14H49V17H50V20H48V23H41V21H39V18H42V15H44Z');
    rect(parent,'#fff4a7',43,16,3,5);
  }else if(id==='iron'){
    path(parent,'#162735','M42 6H47V8H52V16H50V20H48V23H43V21H40V19H38V16H36V9H42Z');
    path(parent,'#34b9cf','M43 9H46V10H50V17H48V20H45V21H42V18H39V10H43Z');
    rect(parent,'#dcffff',42,11,3,5);
    rect(parent,'#167caa',45,15,3,4);
  }else{
    path(parent,'#95521d','M42 5H46V10H49V12H54V16H50V19H48V24H45V21H42V24H39V20H38V18H35V12H40V10H42Z');
    path(parent,'#ffe76c','M43 8H45V12H48V14H51V16H48V18H46V21H44V19H42V21H41V17H38V14H42V12H43Z');
    rect(parent,'#fff9c7',43,12,3,5);
  }
}
export function chestArt(chest, opened) {
  const id = PALETTES[chest?.id] ? chest.id : 'wood';
  const c = PALETTES[id];
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art';
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-game';
  stage.setAttribute('aria-hidden','true');

  const svg = node(stage,'svg',{
    viewBox:'0 0 88 78',
    'shape-rendering':'crispEdges',
    focusable:'false'
  });
  const glow = group(svg,'lb-chest-light');
  path(glow,c.spark,'M43 10L29 36H5L27 42L14 58L40 48L44 72L49 48L74 58L60 42L83 36H55Z');
  const ambient = group(svg,'lb-chest-ambient');
  for(const [x,y,size] of id==='gold' ? [[10,17,2],[76,13,2],[7,44,2],[79,51,2],[34,8,1]]:
    id==='iron' ? [[10,21,2],[79,28,2],[68,10,1]]:
    [[9,25,2],[78,30,1]]) sparkle(ambient,c.spark,x,y,size);
  const shell=group(group(svg,'lb-chest-entry'),'lb-chest-object');
  drawShadow(shell,c);
  const body=group(shell,'lb-chest-body');
  drawChestBody(body,c,id);
  const well=group(shell,'lb-chest-well');
  drawInnerWell(well,c);
  const lining=group(shell,'lb-chest-lining');
  drawLining(lining,c);
  const lid=group(shell,'lb-chest-lid');
  drawChestLid(lid,c,id);
  drawClasp(group(lid,'lb-chest-clasp'),c,id);
  const relic=group(svg,'lb-chest-relic');
  drawRelic(relic,id);
  const sparks=group(svg,'lb-loot-sparks');
  for(const [x,y] of [[18,14],[68,9],[28,7],[63,22],[37,4],[53,8]]){
    sparkle(sparks,c.spark,x,y,2);
  }
  return stage;
}
