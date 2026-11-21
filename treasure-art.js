// HabitArc original, front-facing 16-bit pixel-game treasure chests.
// Integer-aligned SVG rects in an 88x78 canvas with layered open-chest rim,
// overflowing loot pile, and pixelated relic emblems (Ember Trail, Orbit Shield, Star Crown).
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

// Distinct 16-bit palettes per chest tier on an 88x78 integer pixel grid.
const PALETTES = Object.freeze({
  wood: {
    ink: '#1f1312', dark: '#4f2b19', shade: '#7a4221',
    face: '#a85f2b', lit: '#cc7f3a', highlight: '#f0ab57',
    metal: '#858d99', trim: '#c4cdd9', shine: '#f1f5f9',
    strapDark: '#475569',
    goldDark: '#b45309', goldMid: '#f59e0b', goldLit: '#fef08a',
    inside: '#24141e', seam: '#3d1f12', spark: '#fb923c', gem: '#fbbf24'
  },
  iron: {
    ink: '#131d2e', dark: '#22354f', shade: '#334e70',
    face: '#4c6d94', lit: '#7297be', highlight: '#a5c8e8',
    metal: '#94b8d0', trim: '#cfe8f5', shine: '#f2fcff',
    strapDark: '#29435c',
    goldDark: '#0369a1', goldMid: '#38bdf8', goldLit: '#e0f2fe',
    inside: '#102033', seam: '#1d2f45', spark: '#38bdf8', gem: '#67e8f9'
  },
  gold: {
    ink: '#29121e', dark: '#611d38', shade: '#8a294d',
    face: '#b0365e', lit: '#d45279', highlight: '#f78ca7',
    metal: '#cc8214', trim: '#fbbf24', shine: '#fef9c3',
    strapDark: '#854d0e',
    goldDark: '#b45309', goldMid: '#facc15', goldLit: '#fef9c3',
    inside: '#2b1024', seam: '#4c162b', spark: '#fde047', gem: '#c084fc'
  }
});

function rivets(parent, highlight, shadow, positions) {
  for (const [x, y] of positions) {
    rect(parent, shadow, x, y + 1, 2, 2);
    rect(parent, highlight, x, y, 2, 2);
  }
}

function sparkle(parent, color, coreColor, x, y, size = 2) {
  rect(parent, color, x, y - size, size, size);
  rect(parent, color, x - size, y, size, size);
  rect(parent, coreColor, x, y, size, size);
  rect(parent, color, x + size, y, size, size);
  rect(parent, color, x, y + size, size, size);
}

function drawShadow(parent) {
  rect(parent, 'var(--case-shadow)', 14, 66, 60, 2);
  rect(parent, 'var(--case-shadow)', 18, 68, 52, 2);
  rect(parent, 'var(--case-shadow)', 24, 70, 40, 2);
}

function drawChestBody(parent, c, id) {
  // Stepped RPG coffer base with notched bottom feet & 2.5D right-wall bevel.
  rect(parent, c.ink, 12, 36, 64, 28);
  rect(parent, c.ink, 10, 40, 68, 22);
  rect(parent, c.ink, 12, 62, 14, 5);
  rect(parent, c.ink, 62, 62, 14, 5);

  // Side ring handles (pixel iron rings sticking cleanly from left/right walls).
  rect(parent, c.ink, 8, 45, 4, 8);
  rect(parent, c.metal, 9, 46, 2, 6);
  rect(parent, c.shine, 9, 46, 2, 2);
  rect(parent, c.ink, 76, 45, 4, 8);
  rect(parent, c.dark, 77, 46, 2, 6);
  rect(parent, c.metal, 77, 46, 2, 2);

  // Inner wood / plate wall + horizontal plank courses + grain seams.
  rect(parent, c.dark, 14, 38, 60, 24);
  rect(parent, c.shade, 16, 40, 56, 20);
  rect(parent, c.face, 18, 40, 46, 17);
  rect(parent, c.lit, 18, 41, 40, 3);
  rect(parent, c.lit, 18, 48, 34, 2);
  rect(parent, c.lit, 18, 55, 28, 2);

  // Plank horizontal shadows for layered tactile pixel boards.
  rect(parent, c.seam, 16, 46, 56, 2);
  rect(parent, c.seam, 16, 53, 56, 2);
  // Offset vertical wood/plate joints.
  rect(parent, c.seam, 34, 40, 2, 6);
  rect(parent, c.seam, 54, 48, 2, 5);
  rect(parent, c.highlight, 28, 42, 10, 1);
  rect(parent, c.highlight, 41, 49, 11, 1);

  // Bottom binding rail + corner feet bevels.
  rect(parent, c.ink, 12, 58, 64, 6);
  rect(parent, c.metal, 14, 59, 60, 4);
  rect(parent, c.trim, 16, 59, 50, 2);
  rect(parent, c.strapDark, 14, 62, 60, 2);
  // Corner chest legs.
  rect(parent, c.metal, 14, 62, 10, 3);
  rect(parent, c.trim, 14, 62, 7, 2);
  rect(parent, c.metal, 64, 62, 10, 3);
  rect(parent, c.strapDark, 68, 62, 6, 3);

  // Two chunky vertical metal corner straps with 3D specular highlight.
  for (const x of [17, 63]) {
    rect(parent, c.ink, x - 2, 37, 10, 27);
    rect(parent, c.strapDark, x, 38, 8, 24);
    rect(parent, c.metal, x, 38, 6, 23);
    rect(parent, c.trim, x + 1, 39, 4, 18);
    rect(parent, c.shine, x + 1, 40, 2, 7);
    rect(parent, c.strapDark, x + 6, 40, 2, 20);
  }
  rivets(parent, c.shine, c.ink, [[19, 43], [19, 51], [19, 59], [65, 43], [65, 51], [65, 59]]);

  // Tier-specific front ornament details.
  if (id === 'wood') {
    rect(parent, c.highlight, 25, 41, 7, 2);
    rect(parent, c.highlight, 48, 55, 9, 2);
    rect(parent, c.dark, 68, 42, 4, 16);
  } else if (id === 'iron') {
    // Mid-chest armor belt & cyan runic pips.
    rect(parent, c.ink, 26, 48, 36, 7);
    rect(parent, c.metal, 27, 49, 34, 5);
    rect(parent, c.trim, 28, 49, 30, 2);
    rect(parent, c.gem, 31, 50, 4, 3);
    rect(parent, c.gem, 53, 50, 4, 3);
    rivets(parent, c.shine, c.strapDark, [[28, 42], [58, 42]]);
  } else {
    // Royal hammered-gold belly filigree + twin amethyst accents.
    rect(parent, c.ink, 27, 49, 34, 6);
    rect(parent, c.trim, 28, 50, 32, 4);
    rect(parent, c.shine, 30, 50, 22, 2);
    rect(parent, c.ink, 31, 43, 6, 5);
    rect(parent, c.gem, 32, 44, 4, 3);
    rect(parent, '#f5d0fe', 33, 44, 2, 1);
    rect(parent, c.ink, 51, 43, 6, 5);
    rect(parent, c.gem, 52, 44, 4, 3);
    rect(parent, '#f5d0fe', 53, 44, 2, 1);
  }
}

function drawInnerWell(parent, c, id) {
  // Hinged flipped-open lid silhouette peeking behind + deep inner cavity.
  rect(parent, c.ink, 14, 18, 60, 17);
  rect(parent, c.dark, 16, 20, 56, 13);
  rect(parent, c.inside, 18, 22, 52, 10);
  // Top metal rim of the swung-back lid.
  rect(parent, c.ink, 16, 17, 56, 4);
  rect(parent, c.metal, 18, 18, 52, 2);
  rect(parent, c.trim, 20, 18, 36, 2);
  if (id === 'gold') {
    rect(parent, c.trim, 38, 15, 12, 3);
    rect(parent, c.gem, 42, 15, 4, 3);
  }

  // Lower coffer opening cavity & beveled wooden/metal front lip.
  rect(parent, c.ink, 14, 32, 60, 12);
  rect(parent, c.inside, 17, 34, 54, 8);
  rect(parent, c.trim, 14, 38, 60, 3);
  rect(parent, c.shine, 16, 38, 44, 2);
  rect(parent, c.dark, 16, 41, 56, 2);
}

function drawLining(parent, c) {
  // Stepped mound of pixel gold coins + shimmering loot inside the cavity.
  rect(parent, c.goldDark, 21, 35, 46, 5);
  rect(parent, c.goldMid, 24, 32, 40, 7);
  rect(parent, c.goldMid, 29, 29, 30, 8);
  rect(parent, c.goldLit, 32, 30, 14, 3);
  rect(parent, c.goldLit, 47, 32, 8, 2);
  rect(parent, c.goldLit, 25, 35, 10, 2);
  // Highlighted individual coin rims & gems tucked in loot pile.
  rect(parent, c.shine, 35, 31, 4, 2);
  rect(parent, c.shine, 50, 35, 4, 2);
  rect(parent, c.gem, 28, 35, 4, 3);
  rect(parent, c.gem, 54, 33, 4, 3);
  rect(parent, '#ffffff', 42, 30, 2, 2);
}

function drawChestLid(parent, c, id) {
  // Classic barrel-arched stepped RPG pixel lid with 2px side overhang over body.
  rect(parent, c.ink, 24, 13, 40, 25);
  rect(parent, c.ink, 18, 16, 52, 22);
  rect(parent, c.ink, 13, 20, 62, 18);
  rect(parent, c.ink, 9, 27, 70, 13);

  // Curved top shading courses.
  rect(parent, c.dark, 11, 28, 66, 9);
  rect(parent, c.shade, 15, 22, 58, 15);
  rect(parent, c.face, 19, 18, 48, 15);
  rect(parent, c.lit, 24, 15, 36, 9);
  rect(parent, c.highlight, 27, 15, 24, 3);
  rect(parent, c.shine, 30, 15, 12, 2);

  // Lid plank / steel rib seams.
  rect(parent, c.seam, 17, 24, 52, 2);
  rect(parent, c.seam, 15, 29, 58, 2);
  rect(parent, c.lit, 25, 26, 26, 2);

  // Heavy overhanging lid lip band (`y = 31..38`).
  rect(parent, c.ink, 10, 31, 68, 8);
  rect(parent, c.metal, 12, 32, 64, 5);
  rect(parent, c.trim, 14, 32, 52, 3);
  rect(parent, c.shine, 16, 32, 24, 2);
  rect(parent, c.strapDark, 12, 36, 64, 2);

  // Two continuous vertical roof straps aligned directly above body straps.
  for (const x of [17, 63]) {
    rect(parent, c.ink, x - 2, 17, 10, 21);
    rect(parent, c.strapDark, x, 18, 8, 19);
    rect(parent, c.metal, x, 18, 6, 18);
    rect(parent, c.trim, x + 1, 19, 4, 15);
    rect(parent, c.shine, x + 1, 19, 2, 6);
    rect(parent, c.strapDark, x + 6, 19, 2, 17);
  }
  rivets(parent, c.shine, c.ink, [[19, 22], [19, 32], [65, 22], [65, 32]]);

  // Tier-distinct lid top crown / crest hardware.
  if (id === 'gold') {
    // Stepped royal pixel crown crest atop lid arch!
    rect(parent, c.ink, 33, 9, 22, 8);
    rect(parent, c.ink, 35, 7, 4, 3);
    rect(parent, c.ink, 42, 6, 4, 4);
    rect(parent, c.ink, 49, 7, 4, 3);
    rect(parent, c.trim, 35, 10, 18, 6);
    rect(parent, c.shine, 36, 8, 2, 5);
    rect(parent, c.shine, 43, 7, 2, 6);
    rect(parent, c.shine, 50, 8, 2, 5);
    rect(parent, c.gem, 41, 11, 6, 4);
    rect(parent, '#f5d0fe', 42, 11, 2, 2);
  } else if (id === 'iron') {
    // Reinforced central steel spine ridge with twin cyan studs.
    rect(parent, c.ink, 34, 12, 20, 6);
    rect(parent, c.metal, 36, 13, 16, 4);
    rect(parent, c.trim, 37, 13, 12, 2);
    rect(parent, c.gem, 42, 14, 4, 2);
  } else {
    // Oak plank metal center reinforcement tab.
    rect(parent, c.ink, 38, 14, 12, 4);
    rect(parent, c.trim, 39, 15, 10, 2);
    rect(parent, c.shine, 40, 15, 4, 2);
  }
}

function drawClasp(parent, c, id) {
  // Heavy chunky front latch overlapping lid lip & chest body.
  rect(parent, c.ink, 35, 31, 18, 18);
  rect(parent, c.ink, 37, 48, 14, 3);
  rect(parent, c.strapDark, 37, 32, 14, 16);
  rect(parent, c.metal, 37, 32, 12, 15);
  rect(parent, c.trim, 38, 33, 10, 12);
  rect(parent, c.shine, 39, 34, 6, 2);

  if (id === 'gold') {
    // Jeweled royal amethyst lock with facet highlight.
    rect(parent, c.ink, 40, 36, 8, 9);
    rect(parent, c.gem, 41, 37, 6, 7);
    rect(parent, '#f3e8ff', 42, 38, 2, 3);
    rect(parent, '#7e22ce', 44, 41, 3, 3);
  } else if (id === 'iron') {
    // Forged steel padlock with glowing cyan core + key recess.
    rect(parent, c.ink, 40, 36, 8, 9);
    rect(parent, c.gem, 41, 37, 6, 5);
    rect(parent, '#ecfeff', 42, 37, 2, 3);
    rect(parent, c.dark, 43, 42, 2, 3);
  } else {
    // Classic golden-rimmed keyhole escutcheon.
    rect(parent, c.ink, 41, 36, 6, 5);
    rect(parent, c.ink, 42, 40, 4, 5);
    rect(parent, c.goldMid, 42, 37, 4, 3);
    rect(parent, c.ink, 43, 38, 2, 4);
  }
  rivets(parent, c.shine, c.ink, [[38, 44], [48, 44]]);
}

function drawRelic(parent, id) {
  // 16-bit integer-grid relics hovering proudly above the opened chest.
  if (id === 'wood') {
    // Ember Flame icon: dark ember outline + orange flame + yellow/white hot core.
    rect(parent, '#451218', 42, 4, 4, 4);
    rect(parent, '#451218', 38, 8, 12, 6);
    rect(parent, '#451218', 35, 13, 18, 10);
    rect(parent, '#451218', 37, 22, 14, 4);
    rect(parent, '#ea580c', 43, 6, 3, 4);
    rect(parent, '#ea580c', 39, 10, 10, 12);
    rect(parent, '#ea580c', 37, 15, 14, 7);
    rect(parent, '#fb923c', 41, 11, 6, 11);
    rect(parent, '#fde047', 41, 15, 6, 7);
    rect(parent, '#ffffff', 43, 18, 3, 3);
    // Floating ember pixels.
    rect(parent, '#fb923c', 34, 8, 2, 2);
    rect(parent, '#fde047', 52, 6, 2, 2);
  } else if (id === 'iron') {
    // Orbit Shield icon: classic pixel heater shield with frosty cyan glint.
    rect(parent, '#0f1e2e', 35, 7, 18, 12);
    rect(parent, '#0f1e2e', 37, 19, 14, 4);
    rect(parent, '#0f1e2e', 40, 23, 8, 3);
    rect(parent, '#0f1e2e', 42, 26, 4, 2);
    rect(parent, '#cbd5e1', 37, 9, 14, 10);
    rect(parent, '#cbd5e1', 39, 19, 10, 3);
    rect(parent, '#cbd5e1', 41, 22, 6, 3);
    rect(parent, '#0284c7', 39, 11, 10, 8);
    rect(parent, '#0284c7', 41, 19, 6, 3);
    rect(parent, '#38bdf8', 39, 11, 5, 7);
    rect(parent, '#e0f2fe', 40, 12, 3, 3);
    rect(parent, '#ffffff', 41, 12, 2, 2);
  } else {
    // Royal 3-spired Gold Pixel Crown with jewel accents.
    rect(parent, '#451a03', 33, 9, 22, 15);
    rect(parent, '#451a03', 34, 6, 4, 4);
    rect(parent, '#451a03', 42, 4, 4, 6);
    rect(parent, '#451a03', 50, 6, 4, 4);
    rect(parent, '#f59e0b', 35, 11, 18, 11);
    rect(parent, '#facc15', 35, 8, 2, 12);
    rect(parent, '#facc15', 43, 6, 2, 14);
    rect(parent, '#facc15', 51, 8, 2, 12);
    rect(parent, '#facc15', 36, 13, 16, 7);
    rect(parent, '#fef08a', 37, 13, 10, 3);
    rect(parent, '#fef9c3', 43, 7, 2, 4);
    rect(parent, '#b45309', 36, 20, 16, 2);
    rect(parent, '#c084fc', 43, 16, 2, 3);
    rect(parent, '#f43f5e', 37, 16, 2, 2);
    rect(parent, '#38bdf8', 49, 16, 2, 2);
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
  path(glow, c.spark, 'M44 8L31 35H7L27 42L14 58L40 48L44 72L48 48L74 58L61 42L81 35H57Z');

  const ambient = group(svg, 'lb-chest-ambient');
  const ambientSpots = id === 'gold'
    ? [[9, 16, 2], [77, 12, 2], [7, 43, 2], [79, 50, 2], [44, 4, 1]]
    : id === 'iron'
      ? [[10, 20, 2], [78, 26, 2], [69, 9, 1]]
      : [[9, 24, 2], [77, 29, 1]];
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
  for (const [x, y] of [[18, 13], [69, 10], [27, 6], [64, 21], [36, 4], [54, 7]]) {
    sparkle(sparks, c.spark, c.shine, x, y, 2);
  }

  return stage;
}
