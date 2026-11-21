// HabitArc 3/4 isometric 16-bit dungeon treasure chests on an 88x78 integer pixel grid.
// Styled with smooth colored panels, thick beveled gold/metal rims, right-side
// shaded depth walls, side hinge pin, and a 45-deg swung-open arched lid.
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
    ink: '#1f0f17',
    face: '#a9552a', lit: '#c96f3b', shade: '#80391b',
    side: '#5e2318', sideShade: '#421612',
    metal: '#d97706', trim: '#f59e0b', shine: '#fde047', rimDark: '#92400e',
    inside: '#28192c', lidUnder: '#36223a',
    goldMid: '#facc15', goldLit: '#fef9c3', spark: '#fb923c', gem: '#fbbf24'
  },
  iron: {
    ink: '#161124',
    face: '#4ea1aa', lit: '#72c5cc', shade: '#367d87',
    side: '#145c53', sideShade: '#0d4039',
    metal: '#d97706', trim: '#f59e0b', shine: '#fde047', rimDark: '#92400e',
    inside: '#28192c', lidUnder: '#36223a',
    goldMid: '#38bdf8', goldLit: '#e0f2fe', spark: '#38bdf8', gem: '#67e8f9'
  },
  gold: {
    ink: '#210c1b',
    face: '#b6355e', lit: '#d9557e', shade: '#8a2243',
    side: '#631632', sideShade: '#450d23',
    metal: '#ca8a04', trim: '#facc15', shine: '#fef9c3', rimDark: '#854d0e',
    inside: '#28192c', lidUnder: '#36223a',
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
  rect(parent, 'var(--case-shadow)', 14, 62, 36, 3);
  rect(parent, 'var(--case-shadow)', 44, 60, 22, 3);
  rect(parent, 'var(--case-shadow)', 18, 64, 42, 2);
}

function drawChestBody(parent, c, id) {
  // Subtle dark ambient shadow base (clean pixel silhouette without harsh cartoon outline).
  rect(parent, c.ink, 15, 62, 34, 2);
  rect(parent, c.ink, 48, 60, 12, 2);
  rect(parent, c.ink, 58, 58, 12, 2);

  // Front box frame (`x = 16..48, y = 43..62`): bright golden rim + smooth colored panel.
  rect(parent, c.rimDark, 15, 42, 34, 20);
  rect(parent, c.trim, 16, 42, 32, 19);
  rect(parent, c.shine, 16, 42, 30, 3);
  rect(parent, c.shine, 16, 44, 2, 16);
  rect(parent, c.metal, 18, 59, 30, 2);

  // Clean front panel with soft top shadow under the lip & bottom trim bevel.
  rect(parent, c.face, 19, 46, 26, 13);
  rect(parent, c.shade, 19, 46, 26, 2);
  rect(parent, c.lit, 20, 56, 24, 2);
  rect(parent, c.lit, 20, 48, 3, 9);

  // 3/4 Isometric right side wall (`x = 48..69`), rising in crisp 2px pixel steps.
  rect(parent, c.metal, 48, 42, 7, 19);
  rect(parent, c.metal, 55, 40, 7, 19);
  rect(parent, c.metal, 62, 38, 7, 19);
  rect(parent, c.rimDark, 67, 38, 2, 19);
  rect(parent, c.rimDark, 48, 59, 8, 2);
  rect(parent, c.rimDark, 55, 57, 8, 2);
  rect(parent, c.rimDark, 62, 55, 7, 2);

  // Shaded right side panel (smooth darker face).
  rect(parent, c.side, 50, 44, 6, 13);
  rect(parent, c.side, 56, 42, 6, 13);
  rect(parent, c.side, 62, 41, 4, 13);
  rect(parent, c.sideShade, 50, 44, 15, 3);
  rect(parent, c.sideShade, 64, 42, 2, 12);

  // Round golden side hinge pin at back right corner (`x = 64..69, y = 39..44`).
  rect(parent, c.ink, 63, 39, 6, 6);
  rect(parent, c.trim, 64, 40, 4, 4);
  rect(parent, c.shine, 64, 40, 2, 2);
  rect(parent, c.ink, 65, 41, 2, 2);

  // Tier-distinct corner gem or steel stud highlights.
  if (id === 'iron') {
    rect(parent, c.goldLit, 21, 51, 3, 3);
    rect(parent, c.goldMid, 40, 51, 3, 3);
  } else if (id === 'gold') {
    rect(parent, c.gem, 30, 51, 4, 4);
    rect(parent, '#f5d0fe', 31, 51, 2, 2);
  }
}

function drawInnerWell(parent, c, id) {
  // Open chest interior + 45-deg swung-back arched lid matching cf7c6816.png geometry!
  // 1. Open lower chest rim & deep dark-plum hollow cavity (`y = 37..43`).
  rect(parent, c.rimDark, 24, 37, 43, 4);
  rect(parent, c.trim, 25, 37, 41, 3);
  rect(parent, c.shine, 26, 37, 36, 2);
  rect(parent, c.trim, 21, 38, 6, 4);
  rect(parent, c.trim, 18, 40, 6, 3);
  rect(parent, c.inside, 20, 39, 44, 4);
  rect(parent, c.ink, 23, 39, 38, 2);

  // 2. Curved back-right arched lid side cap (`x = 50..69, y = 17..40`) pivoting at hinge.
  rect(parent, c.ink, 52, 16, 10, 4);
  rect(parent, c.ink, 60, 19, 7, 6);
  rect(parent, c.ink, 65, 24, 5, 16);
  rect(parent, c.trim, 52, 17, 9, 3);
  rect(parent, c.trim, 59, 19, 6, 5);
  rect(parent, c.trim, 63, 23, 5, 17);
  rect(parent, c.shine, 53, 17, 7, 2);
  rect(parent, c.shine, 60, 20, 3, 3);
  rect(parent, c.side, 53, 20, 7, 17);
  rect(parent, c.side, 60, 23, 5, 14);
  rect(parent, c.sideShade, 58, 24, 6, 13);

  // 3. Top angled roof strip (`y = 14..19`) + dark tilted lid interior underside (`y = 20..37`).
  rect(parent, c.trim, 24, 15, 30, 4);
  rect(parent, c.shine, 25, 15, 24, 2);
  rect(parent, c.face, 28, 17, 24, 3);
  rect(parent, c.lit, 30, 17, 16, 2);

  // Angled lid frame framing the dark ceiling underside (`x = 24..56, y = 19..38`).
  rect(parent, c.trim, 24, 19, 30, 3);
  rect(parent, c.shine, 25, 19, 22, 2);
  rect(parent, c.trim, 25, 21, 4, 6);
  rect(parent, c.trim, 28, 26, 4, 6);
  rect(parent, c.trim, 31, 31, 4, 6);
  rect(parent, c.metal, 52, 20, 4, 7);
  rect(parent, c.metal, 54, 26, 4, 6);
  rect(parent, c.metal, 56, 31, 4, 6);

  // Dark tilted cavity underside inside swung-open lid.
  rect(parent, c.lidUnder, 29, 22, 23, 5);
  rect(parent, c.lidUnder, 32, 27, 22, 5);
  rect(parent, c.inside, 35, 32, 21, 5);
  rect(parent, c.trim, 34, 36, 25, 2);

  // Front clasp buckle hanging cleanly off the raised upper lip (`x = 30..38, y = 14..23`)!
  rect(parent, c.ink, 30, 14, 9, 10);
  rect(parent, c.trim, 31, 15, 7, 8);
  rect(parent, c.shine, 32, 15, 4, 2);
  rect(parent, c.ink, 33, 17, 3, 4);

  if (id === 'gold') {
    rect(parent, c.gem, 41, 16, 4, 3);
  }
}

function drawLining(parent, c) {
  // Warm pile of coins/gems tucked neatly inside open box mouth (`x = 24..58, y = 37..42`).
  rect(parent, c.goldMid, 25, 38, 30, 4);
  rect(parent, c.goldLit, 28, 38, 12, 2);
  rect(parent, c.goldLit, 44, 39, 8, 2);
  rect(parent, c.gem, 36, 37, 4, 3);
  rect(parent, '#ffffff', 41, 38, 2, 2);
}

function drawChestLid(parent, c, id) {
  // Closed 3/4 curved isometric hood (`y = 22..45`) snapping cleanly onto box frame.
  rect(parent, c.ink, 21, 21, 39, 4);
  rect(parent, c.ink, 17, 24, 48, 5);
  rect(parent, c.ink, 15, 28, 54, 15);

  // Front domed hood (`x = 16..48`) with curved golden arch border.
  rect(parent, c.rimDark, 15, 26, 34, 18);
  rect(parent, c.trim, 16, 25, 33, 18);
  rect(parent, c.trim, 20, 22, 29, 18);
  rect(parent, c.shine, 22, 22, 24, 3);
  rect(parent, c.shine, 16, 27, 3, 14);
  rect(parent, c.shine, 16, 40, 31, 3);

  // Smooth front curved panel face (`x = 19..46, y = 25..40`).
  rect(parent, c.lit, 21, 25, 25, 6);
  rect(parent, c.face, 19, 29, 27, 11);
  rect(parent, c.shade, 19, 37, 27, 3);

  // Center corner gold pillar extending from arch down to seam.
  rect(parent, c.trim, 46, 23, 3, 20);
  rect(parent, c.shine, 46, 24, 2, 12);

  // Shaded 3/4 right curved end-cap (`x = 49..68, y = 22..41`).
  rect(parent, c.metal, 49, 22, 12, 19);
  rect(parent, c.metal, 58, 24, 7, 16);
  rect(parent, c.metal, 63, 28, 5, 12);
  rect(parent, c.rimDark, 66, 28, 3, 12);
  rect(parent, c.side, 50, 25, 9, 14);
  rect(parent, c.side, 57, 27, 7, 11);
  rect(parent, c.sideShade, 59, 31, 6, 7);

  // Subtle tier crest accents on roof.
  if (id === 'gold') {
    rect(parent, c.trim, 31, 18, 14, 5);
    rect(parent, c.shine, 32, 16, 2, 4);
    rect(parent, c.shine, 37, 15, 2, 5);
    rect(parent, c.shine, 42, 16, 2, 4);
    rect(parent, c.gem, 36, 19, 4, 3);
  } else if (id === 'iron') {
    rect(parent, c.shine, 31, 21, 14, 3);
    rect(parent, c.gem, 36, 21, 4, 2);
  }
}

function drawClasp(parent, c, id) {
  // Perspective-centered front gold lockplate overlapping lid & box (`x = 27..36, y = 38..49`).
  rect(parent, c.ink, 27, 38, 10, 12);
  rect(parent, c.metal, 28, 39, 8, 10);
  rect(parent, c.trim, 28, 39, 7, 9);
  rect(parent, c.shine, 29, 39, 4, 2);
  if (id === 'gold') {
    rect(parent, c.gem, 30, 41, 4, 5);
    rect(parent, '#f3e8ff', 31, 41, 2, 2);
  } else if (id === 'iron') {
    rect(parent, c.gem, 30, 41, 4, 4);
    rect(parent, c.ink, 31, 45, 2, 2);
  } else {
    rect(parent, c.ink, 30, 41, 4, 3);
    rect(parent, c.ink, 31, 43, 2, 4);
  }
}

function drawRelic(parent, id) {
  // Floating 16-bit integer-grid relic emblems hovering cleanly above the open lid (`y = 1..14`).
  if (id === 'wood') {
    rect(parent, '#451218', 38, 1, 4, 3);
    rect(parent, '#451218', 34, 4, 12, 4);
    rect(parent, '#451218', 32, 7, 16, 6);
    rect(parent, '#451218', 35, 12, 10, 2);
    rect(parent, '#ea580c', 39, 2, 3, 4);
    rect(parent, '#ea580c', 35, 5, 10, 7);
    rect(parent, '#fb923c', 36, 7, 8, 5);
    rect(parent, '#fde047', 37, 8, 6, 4);
    rect(parent, '#ffffff', 39, 9, 3, 2);
  } else if (id === 'iron') {
    rect(parent, '#0f1e2e', 33, 1, 14, 8);
    rect(parent, '#0f1e2e', 35, 9, 10, 3);
    rect(parent, '#0f1e2e', 38, 12, 4, 2);
    rect(parent, '#cbd5e1', 34, 2, 12, 6);
    rect(parent, '#cbd5e1', 36, 8, 8, 3);
    rect(parent, '#0284c7', 36, 4, 8, 5);
    rect(parent, '#38bdf8', 36, 4, 4, 4);
    rect(parent, '#e0f2fe', 37, 5, 2, 2);
  } else {
    rect(parent, '#451a03', 31, 4, 18, 10);
    rect(parent, '#451a03', 32, 1, 4, 4);
    rect(parent, '#451a03', 38, 0, 4, 5);
    rect(parent, '#451a03', 44, 1, 4, 4);
    rect(parent, '#f59e0b', 33, 6, 14, 6);
    rect(parent, '#facc15', 33, 3, 2, 8);
    rect(parent, '#facc15', 39, 1, 2, 10);
    rect(parent, '#facc15', 45, 3, 2, 8);
    rect(parent, '#fef08a', 35, 6, 8, 3);
    rect(parent, '#c084fc', 39, 8, 2, 3);
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
    ? [[8, 17, 2], [77, 15, 2], [7, 45, 2], [79, 49, 2], [43, 5, 1]]
    : id === 'iron'
      ? [[9, 21, 2], [77, 26, 2], [68, 11, 1]]
      : [[9, 24, 2], [76, 27, 1]];
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
  for (const [x, y] of [[16, 13], [67, 10], [26, 6], [62, 22], [35, 3], [53, 8]]) {
    sparkle(sparks, c.spark, c.shine, x, y, 2);
  }

  return stage;
}
