// HabitArc original, chunky 16-bit RPG pixel-game treasure chests.
// Crisp 3/4 front perspective on an 88x78 integer grid: golden/metal border trim,
// distinct wood/armor/royal planks, keyhole lockplate, hinged open-lid assembly,
// glowing coin mound, and pixelated relics above the lid.
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

// Reference-inspired bold contrast palettes (heavy ink outline, gleaming outer
// frame trim, rich shaded horizontal planks, and saturated loot/gem highlights).
const PALETTES = Object.freeze({
  wood: {
    ink: '#160908', dark: '#56210d', shade: '#7b3314',
    face: '#a3481c', lit: '#c45c27', highlight: '#df7b3d',
    metal: '#cc7a12', trim: '#f2ac29', shine: '#fff08a',
    strapDark: '#8c4e08',
    goldDark: '#b45309', goldMid: '#f59e0b', goldLit: '#fef08a',
    inside: '#1c0b0d', lidUnder: '#451a0c', seam: '#3b1508',
    spark: '#fb923c', gem: '#fbbf24'
  },
  iron: {
    ink: '#0c1320', dark: '#1e3047', shade: '#2c4666',
    face: '#3f628a', lit: '#5982ad', highlight: '#85add4',
    metal: '#759cb8', trim: '#bcdcf0', shine: '#f0fbff',
    strapDark: '#3f5f7a',
    goldDark: '#0369a1', goldMid: '#38bdf8', goldLit: '#e0f2fe',
    inside: '#0d1929', lidUnder: '#18283d', seam: '#162436',
    spark: '#38bdf8', gem: '#67e8f9'
  },
  gold: {
    ink: '#1c0913', dark: '#4e1329', shade: '#731c3d',
    face: '#9b2753', lit: '#c23a6c', highlight: '#ea6c97',
    metal: '#ca8a04', trim: '#facc15', shine: '#fef9c3',
    strapDark: '#854d0e',
    goldDark: '#b45309', goldMid: '#facc15', goldLit: '#fef9c3',
    inside: '#1e0b1a', lidUnder: '#3d1022', seam: '#3b0e1e',
    spark: '#fde047', gem: '#c084fc'
  }
});

function rivets(parent, shine, dark, positions) {
  for (const [x, y] of positions) {
    rect(parent, dark, x, y + 1, 2, 2);
    rect(parent, shine, x, y, 2, 2);
  }
}

function sparkle(parent, color, shine, x, y, size = 2) {
  rect(parent, color, x, y - size, size, size);
  rect(parent, color, x - size, y, size, size);
  rect(parent, shine, x, y, size, size);
  rect(parent, color, x + size, y, size, size);
  rect(parent, color, x, y + size, size, size);
}

function drawShadow(parent) {
  rect(parent, 'var(--case-shadow)', 14, 67, 60, 2);
  rect(parent, 'var(--case-shadow)', 18, 69, 52, 2);
  rect(parent, 'var(--case-shadow)', 24, 71, 40, 2);
}

function drawChestBody(parent, c, id) {
  // Chunky squared pixel base silhouette with notched corners.
  rect(parent, c.ink, 12, 40, 64, 27);
  rect(parent, c.ink, 10, 42, 68, 22);
  rect(parent, c.ink, 14, 65, 12, 3);
  rect(parent, c.ink, 62, 65, 12, 3);

  // Side pixel handle loops.
  rect(parent, c.ink, 8, 48, 4, 8);
  rect(parent, c.metal, 9, 49, 2, 6);
  rect(parent, c.shine, 9, 49, 2, 2);
  rect(parent, c.ink, 76, 48, 4, 8);
  rect(parent, c.strapDark, 77, 49, 2, 6);
  rect(parent, c.metal, 77, 49, 2, 2);

  // Crisp gold/metal outer perimeter frame around front chest panel (reference signature).
  rect(parent, c.metal, 13, 41, 62, 24);
  rect(parent, c.trim, 13, 41, 56, 22);
  rect(parent, c.shine, 14, 41, 40, 2);
  rect(parent, c.strapDark, 15, 63, 59, 2);
  rect(parent, c.strapDark, 70, 43, 5, 21);

  // Inner wood / armor front box with 3 thick shaded planks + deep seam grooves.
  rect(parent, c.dark, 18, 44, 52, 18);
  rect(parent, c.shade, 19, 45, 50, 16);
  // Top plank
  rect(parent, c.lit, 19, 45, 48, 4);
  rect(parent, c.highlight, 20, 45, 34, 2);
  // Seam 1
  rect(parent, c.seam, 19, 49, 50, 2);
  // Mid plank
  rect(parent, c.face, 19, 51, 50, 4);
  rect(parent, c.lit, 19, 51, 40, 2);
  // Seam 2
  rect(parent, c.seam, 19, 55, 50, 2);
  // Bottom plank
  rect(parent, c.shade, 19, 57, 50, 4);
  rect(parent, c.face, 19, 57, 36, 2);

  // Vertical brick/grain notches + right shadow wall.
  rect(parent, c.dark, 64, 45, 5, 16);
  rect(parent, c.seam, 31, 45, 2, 4);
  rect(parent, c.seam, 54, 51, 2, 4);

  // Center metallic lockplate cradle on body + corner studs.
  rect(parent, c.ink, 37, 41, 14, 10);
  rect(parent, c.trim, 39, 41, 10, 8);
  rect(parent, c.shine, 40, 42, 4, 2);
  rect(parent, c.ink, 42, 43, 4, 5);
  rivets(parent, c.shine, c.strapDark, [[15, 43], [15, 60], [71, 43], [71, 60]]);

  // Tier signature body inlays.
  if (id === 'iron') {
    rect(parent, c.gem, 24, 52, 4, 2);
    rect(parent, c.gem, 60, 52, 4, 2);
  } else if (id === 'gold') {
    rect(parent, c.gem, 24, 46, 4, 3);
    rect(parent, '#f5d0fe', 25, 46, 2, 1);
    rect(parent, c.gem, 60, 46, 4, 3);
    rect(parent, '#f5d0fe', 61, 46, 2, 1);
  }
}

function drawInnerWell(parent, c, id) {
  // Opened chest state (matching video 00:03-00:07):
  // Hinged lid physically flipped UP and angled back behind the cavity!
  rect(parent, c.ink, 14, 19, 60, 14);
  rect(parent, c.ink, 16, 17, 56, 3);
  // Tilted open lid outer golden/silver rim & dark inner underside planks.
  rect(parent, c.trim, 16, 18, 56, 12);
  rect(parent, c.shine, 18, 18, 38, 2);
  rect(parent, c.strapDark, 68, 20, 4, 10);
  // Shaded lid underside interior planks (foreshortened wood/slate slats).
  rect(parent, c.lidUnder, 19, 20, 50, 8);
  rect(parent, c.seam, 19, 23, 50, 2);
  rect(parent, c.dark, 20, 25, 48, 3);
  // Golden/silver lid lip catching light cleanly at bottom of raised lid (`y = 28..30`).
  rect(parent, c.trim, 16, 28, 56, 3);
  rect(parent, c.shine, 18, 28, 42, 2);
  if (id === 'gold') {
    rect(parent, c.ink, 37, 14, 14, 5);
    rect(parent, c.trim, 39, 15, 10, 3);
    rect(parent, c.gem, 42, 15, 4, 3);
  }

  // Dark hollow coffer interior directly beneath the raised lid (`y = 31..42`).
  rect(parent, c.ink, 12, 31, 64, 11);
  rect(parent, c.metal, 13, 32, 62, 10);
  rect(parent, c.trim, 14, 32, 56, 9);
  rect(parent, c.inside, 18, 33, 52, 8);
  rect(parent, c.dark, 20, 39, 48, 2);
  // Front top rim separating open mouth from lower coffer front.
  rect(parent, c.shine, 15, 40, 44, 2);
}

function drawLining(parent, c) {
  // Glowing coin mound & gems sitting cleanly inside the opened cavity (`y = 32..40`).
  rect(parent, c.goldDark, 21, 36, 46, 5);
  rect(parent, c.goldMid, 24, 34, 40, 6);
  rect(parent, c.goldMid, 29, 32, 30, 6);
  rect(parent, c.goldLit, 32, 33, 14, 2);
  rect(parent, c.goldLit, 47, 35, 9, 2);
  rect(parent, c.shine, 35, 34, 4, 2);
  rect(parent, c.gem, 27, 36, 4, 3);
  rect(parent, c.gem, 54, 35, 4, 3);
  rect(parent, '#ffffff', 42, 33, 2, 2);
}

function drawChestLid(parent, c, id) {
  // Closed barrel-domed pixel lid matching reference 00:00 silhouette (`y = 18..42`).
  rect(parent, c.ink, 21, 18, 46, 24);
  rect(parent, c.ink, 16, 20, 56, 22);
  rect(parent, c.ink, 12, 24, 64, 18);
  rect(parent, c.ink, 10, 29, 68, 13);

  // Outer golden/silver/royal stepped arch border enclosing the lid planks!
  rect(parent, c.metal, 13, 24, 62, 18);
  rect(parent, c.trim, 14, 23, 56, 18);
  rect(parent, c.trim, 18, 20, 50, 19);
  rect(parent, c.shine, 22, 20, 36, 2);
  rect(parent, c.shine, 14, 38, 52, 2);
  rect(parent, c.strapDark, 68, 25, 6, 16);

  // Inner curved wood / armor / royal lid slats (`3` clean stepped horizontal courses).
  rect(parent, c.dark, 18, 23, 50, 15);
  // Top crest plank
  rect(parent, c.lit, 21, 23, 44, 4);
  rect(parent, c.highlight, 23, 23, 28, 2);
  // Seam
  rect(parent, c.seam, 19, 27, 49, 2);
  // Middle arch plank
  rect(parent, c.face, 18, 29, 50, 4);
  rect(parent, c.lit, 19, 29, 36, 2);
  // Seam
  rect(parent, c.seam, 17, 33, 52, 2);
  // Lower arch plank
  rect(parent, c.shade, 17, 35, 52, 3);
  rect(parent, c.face, 18, 35, 34, 2);

  // Center lid vertical frame bridge & side strap accents.
  rect(parent, c.trim, 15, 24, 4, 16);
  rect(parent, c.shine, 15, 25, 2, 8);
  rect(parent, c.metal, 67, 24, 5, 16);
  rect(parent, c.trim, 41, 20, 6, 18);
  rect(parent, c.shine, 42, 21, 2, 10);

  if (id === 'gold') {
    // 3-point royal pixel crown crest perched cleanly atop the gold lid!
    rect(parent, c.ink, 33, 13, 22, 8);
    rect(parent, c.ink, 34, 10, 4, 4);
    rect(parent, c.ink, 42, 9, 4, 5);
    rect(parent, c.ink, 50, 10, 4, 4);
    rect(parent, c.trim, 35, 14, 18, 6);
    rect(parent, c.shine, 35, 11, 2, 5);
    rect(parent, c.shine, 43, 10, 2, 6);
    rect(parent, c.shine, 51, 11, 2, 5);
    rect(parent, c.gem, 41, 15, 6, 3);
  } else if (id === 'iron') {
    rect(parent, c.ink, 35, 16, 18, 5);
    rect(parent, c.trim, 37, 17, 14, 3);
    rect(parent, c.gem, 42, 17, 4, 2);
  }
}

function drawClasp(parent, c, id) {
  // Bold front center lockplate bridging lid rim & chest base (`x = 37..50, y = 34..47`).
  rect(parent, c.ink, 37, 34, 14, 14);
  rect(parent, c.metal, 38, 35, 12, 12);
  rect(parent, c.trim, 39, 35, 10, 10);
  rect(parent, c.shine, 40, 36, 5, 2);

  if (id === 'gold') {
    rect(parent, c.ink, 41, 38, 6, 7);
    rect(parent, c.gem, 42, 39, 4, 5);
    rect(parent, '#f3e8ff', 42, 39, 2, 2);
  } else if (id === 'iron') {
    rect(parent, c.ink, 41, 38, 6, 7);
    rect(parent, c.gem, 42, 39, 4, 4);
    rect(parent, '#ecfeff', 42, 39, 2, 2);
    rect(parent, c.ink, 43, 43, 2, 2);
  } else {
    // Classic deep pixel keyhole slot in golden clasp (reference silhouette).
    rect(parent, c.ink, 42, 38, 4, 4);
    rect(parent, c.ink, 43, 41, 2, 4);
  }
}

function drawRelic(parent, id) {
  // Crisp integer-grid 16-bit loot icon hovering cleanly above the swung-back lid (`y = 2..17`).
  if (id === 'wood') {
    // Ember Flame sprite.
    rect(parent, '#451218', 42, 1, 4, 3);
    rect(parent, '#451218', 38, 4, 12, 5);
    rect(parent, '#451218', 36, 8, 16, 8);
    rect(parent, '#451218', 38, 15, 12, 3);
    rect(parent, '#ea580c', 43, 2, 3, 4);
    rect(parent, '#ea580c', 39, 6, 10, 9);
    rect(parent, '#fb923c', 40, 8, 8, 7);
    rect(parent, '#fde047', 41, 10, 6, 5);
    rect(parent, '#ffffff', 43, 12, 3, 2);
    rect(parent, '#fb923c', 33, 5, 2, 2);
    rect(parent, '#fde047', 53, 4, 2, 2);
  } else if (id === 'iron') {
    // Orbit Shield sprite.
    rect(parent, '#0f1e2e', 36, 2, 16, 9);
    rect(parent, '#0f1e2e', 38, 11, 12, 4);
    rect(parent, '#0f1e2e', 41, 15, 6, 3);
    rect(parent, '#cbd5e1', 38, 4, 12, 7);
    rect(parent, '#cbd5e1', 40, 11, 8, 3);
    rect(parent, '#0284c7', 40, 5, 8, 6);
    rect(parent, '#0284c7', 42, 11, 4, 3);
    rect(parent, '#38bdf8', 40, 5, 4, 5);
    rect(parent, '#e0f2fe', 41, 6, 2, 2);
  } else {
    // Royal Star Crown sprite.
    rect(parent, '#451a03', 34, 5, 20, 12);
    rect(parent, '#451a03', 35, 2, 4, 4);
    rect(parent, '#451a03', 42, 1, 4, 5);
    rect(parent, '#451a03', 49, 2, 4, 4);
    rect(parent, '#f59e0b', 36, 7, 16, 8);
    rect(parent, '#facc15', 36, 4, 2, 10);
    rect(parent, '#facc15', 43, 2, 2, 12);
    rect(parent, '#facc15', 50, 4, 2, 10);
    rect(parent, '#fef08a', 38, 8, 10, 3);
    rect(parent, '#c084fc', 43, 11, 2, 3);
    rect(parent, '#f43f5e', 38, 11, 2, 2);
    rect(parent, '#38bdf8', 48, 11, 2, 2);
  }
}

export function chestArt(chest, opened) {
  const id = PALETTES[chest?.id] ? chest.id : 'wood';
  const c = PALETTES[id];
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art';
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-game';
  stage.setAttribute('aria-hidden', 'true');

  const svg = node(stage, 'svg', {
    viewBox: '0 0 88 78',
    'shape-rendering': 'crispEdges',
    focusable: 'false'
  });

  const glow = group(svg, 'lb-chest-light');
  path(glow, c.spark, 'M44 6L32 34H8L27 42L14 58L40 48L44 72L48 48L74 58L61 42L80 34H56Z');

  const ambient = group(svg, 'lb-chest-ambient');
  const ambientSpots = id === 'gold'
    ? [[8, 15, 2], [79, 13, 2], [6, 44, 2], [81, 50, 2], [44, 3, 1]]
    : id === 'iron'
      ? [[9, 19, 2], [79, 25, 2], [70, 9, 1]]
      : [[9, 23, 2], [78, 28, 1]];
  for (const [x, y, size] of ambientSpots) {
    sparkle(ambient, c.spark, c.shine, x, y, size);
  }

  const shell = group(group(svg, 'lb-chest-entry'), 'lb-chest-object');
  drawShadow(shell);
  const body = group(shell, 'lb-chest-body');
  drawChestBody(body, c, id);
  const well = group(shell, 'lb-chest-well');
  drawInnerWell(well, c, id);
  const lining = group(shell, 'lb-chest-lining');
  drawLining(lining, c);
  const lid = group(shell, 'lb-chest-lid');
  drawChestLid(lid, c, id);
  drawClasp(group(lid, 'lb-chest-clasp'), c, id);

  const relic = group(svg, 'lb-chest-relic');
  drawRelic(relic, id);

  const sparks = group(svg, 'lb-loot-sparks');
  for (const [x, y] of [[17, 12], [70, 9], [26, 5], [64, 21], [35, 3], [55, 7]]) {
    sparkle(sparks, c.spark, c.shine, x, y, 2);
  }

  return stage;
}
