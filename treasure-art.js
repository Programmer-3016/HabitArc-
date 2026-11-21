// HabitArc 2.5D pixel-art dungeon treasure chests on an 88x78 integer grid.
// Matches the 16-bit dungeon reference: horizontal plinth base sitting flush at y=64,
// smooth colored panels framed by thick beveled gold trim, 3px overhanging drop shadow,
// rear corner hinge pin, compact clasp buckle, and 45-deg swung-open arched D-lid.
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

const PALETTES = Object.freeze({
  wood: {
    contour: '#2c1f2e',
    face: '#a8522b', lit: '#cc6d3c', shade: '#7c3419',
    side: '#581f1b', sideDeep: '#361015',
    shine: '#fdd14d', trim: '#fdcb35', metal: '#e9700c', rimDark: '#a54209',
    inside: '#2c1f2e', lidMid: '#332334', lidEdge: '#5e4162',
    goldMid: '#fdcb35', goldLit: '#fef9c3', spark: '#fb923c', gem: '#fbbf24'
  },
  iron: {
    contour: '#2c1f2e',
    face: '#5a9ba4', lit: '#73cab2', shade: '#3a7f82',
    side: '#13574d', sideDeep: '#004424',
    shine: '#fdd14d', trim: '#fdcb35', metal: '#e9700c', rimDark: '#a54209',
    inside: '#2c1f2e', lidMid: '#332334', lidEdge: '#5e4162',
    goldMid: '#73cab2', goldLit: '#e0f2fe', spark: '#38bdf8', gem: '#67e8f9'
  },
  gold: {
    contour: '#2c1f2e',
    face: '#b0305a', lit: '#d84f79', shade: '#821d41',
    side: '#5c1230', sideDeep: '#36081c',
    shine: '#fef08a', trim: '#facc15', metal: '#d97706', rimDark: '#92400e',
    inside: '#2c1f2e', lidMid: '#332334', lidEdge: '#5e4162',
    goldMid: '#facc15', goldLit: '#fef9c3', spark: '#fde047', gem: '#c084fc'
  }
});

function sparkle(parent, color, core, x, y, size = 2) {
  rect(parent, color, x, y - size, size, size);
  rect(parent, color, x - size, y, size, size);
  rect(parent, core, x, y, size, size);
  rect(parent, color, x + size, y, size, size);
  rect(parent, color, x, y + size, size, size);
}

function drawShadow(parent) {
  // Subtle contact shadow tucked under plinth (`y = 63..65`) flush with dungeon cobbles.
  rect(parent, 'var(--case-shadow)', 19, 63, 44, 2);
}

function drawChestBody(parent, c) {
  // Common lower base (`x = 18..63, y = 52..63`), sitting completely level on floor y=64.
  rect(parent, c.contour, 19, 52, 1, 10);
  rect(parent, c.contour, 62, 52, 1, 10);
  rect(parent, c.contour, 18, 62, 1, 2);
  rect(parent, c.contour, 63, 62, 1, 2);

  // 3px drop shadow directly beneath the overhanging top lip (`y = 52..54`).
  rect(parent, c.metal, 20, 52, 3, 3);
  rect(parent, c.side, 23, 52, 19, 3);
  rect(parent, c.metal, 42, 52, 3, 3);
  rect(parent, c.rimDark, 45, 52, 2, 3);
  rect(parent, c.sideDeep, 47, 52, 14, 3);
  rect(parent, c.rimDark, 61, 52, 1, 3);

  // Smooth colored panels & crisp corner pillars (`y = 55..61`).
  rect(parent, c.trim, 20, 55, 3, 7);
  rect(parent, c.face, 23, 55, 19, 7);
  rect(parent, c.shade, 23, 55, 1, 1);
  rect(parent, c.shade, 41, 55, 1, 1);
  rect(parent, c.shade, 23, 61, 1, 1);
  rect(parent, c.shade, 41, 61, 1, 1);
  rect(parent, c.trim, 42, 55, 3, 7);

  // Shaded right flank (`x = 45..61, y = 55..61`).
  rect(parent, c.metal, 45, 55, 2, 7);
  rect(parent, c.side, 47, 55, 13, 7);
  rect(parent, c.rimDark, 47, 61, 1, 1);
  rect(parent, c.rimDark, 59, 61, 1, 1);
  rect(parent, c.metal, 60, 55, 2, 7);

  // Horizontal 2px molded plinth foot (`y = 62..63`), stepped +1px outward left & right.
  rect(parent, c.trim, 19, 62, 26, 2);
  rect(parent, c.metal, 23, 62, 1, 2);
  rect(parent, c.metal, 45, 62, 18, 2);
}

function drawInnerWell(parent, c) {
  // Swung-open lid & open top box rim matching cf7c6816.png exact geometry (`y = 31..51`).
  // Outer 1px plum contour around top & diagonal swung lid.
  rect(parent, c.contour, 34, 31, 27, 1);
  rect(parent, c.contour, 30, 32, 4, 1);
  rect(parent, c.contour, 29, 33, 2, 5);
  rect(parent, c.contour, 30, 38, 1, 3);
  rect(parent, c.contour, 31, 41, 1, 3);
  rect(parent, c.contour, 32, 44, 1, 4);
  rect(parent, c.contour, 18, 48, 42, 1);
  rect(parent, c.contour, 18, 49, 1, 3);

  // Overhanging open lower box top rim (`y = 49..51`).
  rect(parent, c.shine, 19, 49, 25, 3);
  rect(parent, c.metal, 19, 49, 1, 1);
  rect(parent, c.metal, 43, 49, 1, 1);
  rect(parent, c.metal, 19, 51, 1, 1);
  rect(parent, c.metal, 43, 51, 1, 1);
  rect(parent, c.metal, 44, 49, 16, 3);
  rect(parent, c.rimDark, 59, 49, 2, 3);

  // Right rear corner golden hinge pin (`x = 59..64, y = 47..52`).
  rect(parent, c.contour, 60, 47, 5, 5);
  rect(parent, c.metal, 61, 48, 3, 3);
  rect(parent, c.shine, 62, 48, 2, 1);
  rect(parent, c.shine, 63, 49, 1, 2);
  rect(parent, c.contour, 62, 49, 1, 1);

  // Open interior dark plum mouth (`y = 48`) & angled lid cavity underside (`y = 37..47`).
  rect(parent, c.inside, 20, 48, 39, 1);
  rect(parent, c.lidMid, 33, 37, 25, 3);
  rect(parent, c.lidMid, 34, 40, 24, 3);
  rect(parent, c.lidMid, 35, 43, 23, 3);
  rect(parent, c.lidMid, 36, 46, 22, 2);

  // Left angled gold frame + smooth #5e4162 interior rim highlight.
  rect(parent, c.metal, 31, 34, 2, 4);
  rect(parent, c.metal, 32, 38, 2, 3);
  rect(parent, c.metal, 33, 41, 2, 3);
  rect(parent, c.metal, 34, 44, 2, 4);
  rect(parent, c.lidEdge, 33, 37, 22, 1);
  rect(parent, c.lidEdge, 33, 38, 1, 2);
  rect(parent, c.lidEdge, 34, 40, 1, 3);
  rect(parent, c.lidEdge, 35, 43, 1, 3);
  rect(parent, c.lidEdge, 36, 46, 1, 2);

  // Right underside orange frame border leading down to hinge.
  rect(parent, c.rimDark, 55, 37, 2, 11);
  rect(parent, c.metal, 57, 36, 2, 12);
  rect(parent, c.contour, 60, 31, 5, 1);
  rect(parent, c.contour, 65, 32, 3, 1);
  rect(parent, c.contour, 68, 33, 2, 2);
  rect(parent, c.contour, 70, 35, 1, 5);
  rect(parent, c.contour, 69, 40, 1, 3);
  rect(parent, c.contour, 68, 43, 1, 2);
  rect(parent, c.contour, 66, 45, 2, 2);

  // Curved D-shaped dark side cap of swung-open lid (`x = 57..69, y = 32..46`).
  rect(parent, c.metal, 57, 33, 11, 13);
  rect(parent, c.metal, 68, 35, 2, 5);
  rect(parent, c.metal, 67, 40, 2, 3);
  rect(parent, c.rimDark, 64, 44, 3, 3);
  rect(parent, c.sideDeep, 58, 35, 9, 2);
  rect(parent, c.side, 59, 37, 9, 3);
  rect(parent, c.side, 59, 40, 7, 3);
  rect(parent, c.side, 59, 43, 6, 2);
  rect(parent, c.side, 60, 45, 3, 2);
  rect(parent, c.trim, 59, 38, 1, 5);

  // Swung-back curved top lid roof strip & sunlit gold front lip (`y = 32..36`).
  rect(parent, c.shine, 35, 32, 3, 1);
  rect(parent, c.lit, 38, 32, 16, 1);
  rect(parent, c.shine, 54, 32, 6, 1);
  rect(parent, c.shine, 32, 33, 4, 2);
  rect(parent, c.lit, 36, 33, 18, 2);
  rect(parent, c.shine, 54, 33, 4, 2);
  rect(parent, c.metal, 58, 33, 8, 2);
  rect(parent, c.metal, 31, 35, 25, 2);
  rect(parent, c.rimDark, 54, 36, 4, 1);

  // Compact hanging golden clasp loop (`x = 40..45, y = 33..37`).
  rect(parent, c.shine, 40, 33, 6, 1);
  rect(parent, c.shine, 40, 34, 2, 3);
  rect(parent, c.shine, 44, 34, 2, 3);
  rect(parent, c.contour, 42, 34, 2, 3);
}

function drawLining(parent, c) {
  // Warm gold coins revealed inside the chest mouth during reveal modal.
  rect(parent, c.goldMid, 24, 47, 31, 2);
  rect(parent, c.goldLit, 28, 46, 14, 2);
  rect(parent, c.goldLit, 45, 47, 8, 1);
  rect(parent, c.gem, 36, 46, 4, 2);
}

function drawChestLid(parent, c) {
  // Closed arched 2.5D barrel lid (`y = 35..51`) matching exact `cf7c6816.png` proportions.
  // Outer 1px plum contour along arched top & edges.
  rect(parent, c.contour, 23, 35, 34, 1);
  rect(parent, c.contour, 21, 36, 2, 1);
  rect(parent, c.contour, 19, 37, 2, 2);
  rect(parent, c.contour, 18, 39, 1, 10);
  rect(parent, c.contour, 18, 49, 1, 3);
  rect(parent, c.contour, 57, 36, 3, 1);
  rect(parent, c.contour, 60, 37, 2, 3);
  rect(parent, c.contour, 62, 40, 1, 8);

  // Bright gold front dome frame + warm orange right arch frame.
  rect(parent, c.shine, 23, 36, 22, 13);
  rect(parent, c.shine, 21, 37, 2, 12);
  rect(parent, c.shine, 19, 39, 2, 10);
  rect(parent, c.metal, 45, 36, 12, 13);
  rect(parent, c.metal, 57, 37, 3, 12);
  rect(parent, c.metal, 60, 40, 2, 9);

  // Smooth front curved barrel face (`x = 22..41, y = 38..48`).
  rect(parent, c.lit, 24, 38, 17, 2);
  rect(parent, c.lit, 22, 39, 2, 2);
  rect(parent, c.face, 22, 40, 20, 7);
  rect(parent, c.shade, 22, 47, 20, 2);

  // Front corner pillar seam (`x = 42..44` bright gold, `x = 45..46` orange).
  rect(parent, c.shine, 42, 36, 3, 13);
  rect(parent, c.metal, 45, 36, 2, 13);

  // Shaded D-curved right side cap (`x = 47..60, y = 38..48`).
  rect(parent, c.side, 47, 38, 8, 11);
  rect(parent, c.side, 55, 39, 3, 10);
  rect(parent, c.side, 58, 41, 2, 8);
  rect(parent, c.sideDeep, 47, 46, 12, 3);
  rect(parent, c.rimDark, 59, 47, 2, 2);

  // Overhanging bottom rim of lid (`y = 49..51`) aligned cleanly above `y = 52..54` shadow!
  rect(parent, c.shine, 19, 49, 25, 3);
  rect(parent, c.metal, 19, 51, 1, 1);
  rect(parent, c.metal, 43, 51, 1, 1);
  rect(parent, c.metal, 44, 49, 16, 3);
  rect(parent, c.rimDark, 59, 49, 2, 3);

  // Matching rear golden corner hinge pin (`x = 60..64, y = 47..52`).
  rect(parent, c.contour, 60, 47, 5, 5);
  rect(parent, c.metal, 61, 48, 3, 3);
  rect(parent, c.shine, 62, 48, 2, 1);
  rect(parent, c.shine, 63, 49, 1, 2);
  rect(parent, c.contour, 62, 49, 1, 1);
}

function drawClasp(parent, c, id) {
  // Compact golden clasp buckle centered cleanly on front rim (`x = 29..34, y = 47..52`).
  rect(parent, c.contour, 29, 47, 6, 6);
  rect(parent, c.metal, 30, 47, 4, 5);
  rect(parent, c.trim, 30, 47, 4, 4);
  rect(parent, c.shine, 30, 47, 3, 2);
  if (id === 'gold') {
    rect(parent, c.gem, 31, 49, 2, 2);
  } else {
    rect(parent, c.contour, 31, 49, 2, 2);
  }
}

function drawRelic(parent, id) {
  // 16-bit integer-grid relic emblems rising above open chest inside reveal modal (`y = 2..15`).
  if (id === 'wood') {
    rect(parent, '#451218', 38, 2, 4, 3);
    rect(parent, '#451218', 34, 5, 12, 4);
    rect(parent, '#451218', 32, 8, 16, 6);
    rect(parent, '#451218', 35, 13, 10, 2);
    rect(parent, '#ea580c', 39, 3, 3, 4);
    rect(parent, '#ea580c', 35, 6, 10, 7);
    rect(parent, '#fb923c', 36, 8, 8, 5);
    rect(parent, '#fde047', 37, 9, 6, 4);
    rect(parent, '#ffffff', 39, 10, 3, 2);
  } else if (id === 'iron') {
    rect(parent, '#0f1e2e', 33, 2, 14, 8);
    rect(parent, '#0f1e2e', 35, 10, 10, 3);
    rect(parent, '#0f1e2e', 38, 13, 4, 2);
    rect(parent, '#cbd5e1', 34, 3, 12, 6);
    rect(parent, '#cbd5e1', 36, 9, 8, 3);
    rect(parent, '#0284c7', 36, 5, 8, 5);
    rect(parent, '#38bdf8', 36, 5, 4, 4);
    rect(parent, '#e0f2fe', 37, 6, 2, 2);
  } else {
    rect(parent, '#451a03', 31, 5, 18, 10);
    rect(parent, '#451a03', 32, 2, 4, 4);
    rect(parent, '#451a03', 38, 1, 4, 5);
    rect(parent, '#451a03', 44, 2, 4, 4);
    rect(parent, '#f59e0b', 33, 7, 14, 6);
    rect(parent, '#facc15', 33, 4, 2, 8);
    rect(parent, '#facc15', 39, 2, 2, 10);
    rect(parent, '#facc15', 45, 4, 2, 8);
    rect(parent, '#fef08a', 35, 7, 8, 3);
    rect(parent, '#c084fc', 39, 9, 2, 3);
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
  path(glow, c.spark, 'M41 5L30 33H6L25 41L13 57L38 47L42 70L46 47L71 57L59 41L78 33H54Z');

  const ambient = group(svg, 'lb-chest-ambient');
  const ambientSpots = id === 'gold'
    ? [[8, 17, 2], [77, 15, 2], [7, 45, 2], [79, 49, 2]]
    : id === 'iron'
      ? [[9, 21, 2], [77, 26, 2]]
      : [[9, 24, 2], [76, 27, 1]];
  for (const [x, y, size] of ambientSpots) {
    sparkle(ambient, c.spark, c.shine, x, y, size);
  }

  const shell = group(group(svg, 'lb-chest-entry'), 'lb-chest-object');
  drawShadow(shell);
  const body = group(shell, 'lb-chest-body');
  drawChestBody(body, c);
  const well = group(shell, 'lb-chest-well');
  drawInnerWell(well, c);
  const lining = group(shell, 'lb-chest-lining');
  drawLining(lining, c);
  const lid = group(shell, 'lb-chest-lid');
  drawChestLid(lid, c);
  drawClasp(group(lid, 'lb-chest-clasp'), c, id);

  const relic = group(svg, 'lb-chest-relic');
  drawRelic(relic, id);

  const sparks = group(svg, 'lb-loot-sparks');
  for (const [x, y] of [[15, 13], [70, 11], [23, 5], [64, 21], [12, 27], [73, 28]]) {
    sparkle(sparks, c.spark, c.shine, x, y, 2);
  }

  return stage;
}
