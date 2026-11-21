/*
 * HabitArc Globe Runner Celebration & Selectable Pixel Companions
 * Self-contained canvas animation module exposing window.HabitArcStreak.
 */
(function () {
    'use strict';

    const VALID_COMPANION_IDS = new Set(['arcy', 'ninja', 'specops', 'astro']);
    const DEFAULT_COMPANION_ID = 'arcy';
    const SOUND_PREF_KEY = 'habitarc_streak_sound';
    const CELEBRATED_PREFIX = 'habitarc_streak_celebrated_';
    const STYLE_ELEMENT_ID = 'habitarc-streak-styles';

    const COMPANIONS = Object.freeze([
        {
            id: 'arcy',
            name: 'Arcy',
            subtitle: 'Classic Spark',
            finale: 'Backflip Finale',
        },
        {
            id: 'ninja',
            name: 'Shinobi',
            subtitle: 'Red Scarf Ninja',
            finale: 'Katana Cleave',
        },
        {
            id: 'specops',
            name: 'Ghost Ops',
            subtitle: 'NVG Tactical',
            finale: '3-Burst Carbine',
        },
        {
            id: 'astro',
            name: 'Astro Nova',
            subtitle: 'Rocket Pilot',
            finale: 'Orbital Laser',
        },
    ]);

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const easeInOutCubic = (t) => {
        const x = clamp(t, 0, 1);
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    };
    const easeOutBack = (t, s = 1.65) => {
        const x = clamp(t, 0, 1) - 1;
        return 1 + x * x * ((s + 1) * x + s);
    };

    function makeRng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function normalizeCompanionId(id) {
        return typeof id === 'string' && VALID_COMPANION_IDS.has(id) ? id : DEFAULT_COMPANION_ID;
    }

    function milestoneTier(n) {
        const day = Number(n) || 0;
        if (day >= 100 && day % 100 === 0) return 100;
        if (day >= 50 && day % 50 === 0) return 50;
        return 0;
    }

    // Shorter punchy sprint on Day 1 (~1.1s), scaling smoothly + 560ms bespoke character finale
    function getTimeline(n) {
        const day = Math.max(1, Number(n) || 1);
        const T_RUN_START = 160;
        let runDur = 4000;
        if (day <= 1) runDur = 1100;
        else if (day <= 6) runDur = Math.round(1400 + ((day - 2) / 4) * 1300);
        else if (day < 50) runDur = Math.round(3100 + ((day - 7) / 42) * 850);
        else runDur = day >= 100 ? 4250 : 3950;

        const T_CROUCH = T_RUN_START + runDur;
        const T_LEAP_START = T_CROUCH + 80;
        const T_IMPACT = T_CROUCH + 560;
        const T_SLAM = T_IMPACT + 140;
        const T_LOWER = T_SLAM + 140;
        const T_MAX = T_LOWER + 1000;
        return { T_RUN_START, T_CROUCH, T_LEAP_START, T_IMPACT, T_SLAM, T_LOWER, T_MAX };
    }

    // ---------------------------------------------------------------------------
    // 1. Clean 16-Bit Pixel Earth Generator (Lazy canvas init for Node safety)
    // ---------------------------------------------------------------------------
    const MAP_W = 144;
    const MAP_H = 72;
    const worldMap = new Uint8Array(MAP_W * MAP_H);
    (function buildWorld() {
        const lobes = [
            [-108, 54, 30, 15], [-98, 38, 25, 14], [-90, 22, 13, 10], [-140, 62, 15, 7],
            [-42, 68, 15, 9],
            [-64, -8, 18, 15], [-56, -24, 13, 14], [-66, -40, 8, 13],
            [14, 52, 22, 11], [16, 18, 27, 16], [22, -4, 17, 15], [24, -22, 11, 11],
            [56, 54, 34, 16], [102, 46, 32, 17], [78, 24, 14, 11], [106, 18, 11, 10],
            [135, -24, 17, 12], [136, 36, 8, 8],
        ];
        for (let y = 0; y < MAP_H; y++) {
            const lat = 90 - ((y + 0.5) / MAP_H) * 180;
            for (let x = 0; x < MAP_W; x++) {
                const lon = -180 + ((x + 0.5) / MAP_W) * 360;
                if (Math.abs(lat) > 74 + Math.sin(lon * 0.14) * 3) {
                    worldMap[y * MAP_W + x] = 5;
                    continue;
                }
                let inside = false;
                for (const [cx, cy, rx, ry] of lobes) {
                    let dl = lon - cx;
                    if (dl > 180) dl -= 360;
                    if (dl < -180) dl += 360;
                    const wob = Math.sin(lon * 0.17 + lat * 0.12) * 0.14 + Math.cos(lon * 0.08 - lat * 0.2) * 0.1;
                    if ((dl / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1 + wob) {
                        inside = true;
                        break;
                    }
                }
                if (inside) {
                    const ridge = Math.sin(lon * 0.13) * Math.cos(lat * 0.16) > 0.36;
                    worldMap[y * MAP_W + x] = ridge ? 3 : 2;
                }
            }
        }
        const cp = new Uint8Array(worldMap);
        for (let y = 1; y < MAP_H - 1; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const idx = y * MAP_W + x;
                const v = cp[idx];
                const xm = (x + MAP_W - 1) % MAP_W;
                const xp = (x + 1) % MAP_W;
                const nb = [cp[y * MAP_W + xm], cp[y * MAP_W + xp], cp[(y - 1) * MAP_W + x], cp[(y + 1) * MAP_W + x]];
                if ((v === 2 || v === 3) && nb.some((n) => n === 0)) worldMap[idx] = 4;
                else if (v === 0 && nb.some((n) => n === 2 || n === 3 || n === 4)) worldMap[idx] = 1;
            }
        }
    })();

    const CLOUD_BANDS = [
        { lon: 0.4, lat: 0.28, w: 0.44, h: 0.09 },
        { lon: 2.3, lat: -0.22, w: 0.52, h: 0.09 },
        { lon: 4.1, lat: 0.12, w: 0.38, h: 0.08 },
        { lon: 5.5, lat: -0.38, w: 0.40, h: 0.08 },
    ];

    const GLOBE_RES = 84;
    let globeBuf = null;
    let gctx = null;
    let globeImg = null;

    function ensureGlobeBuffer() {
        if (globeBuf) return globeBuf;
        globeBuf = document.createElement('canvas');
        globeBuf.width = GLOBE_RES;
        globeBuf.height = GLOBE_RES;
        gctx = globeBuf.getContext('2d');
        globeImg = gctx.createImageData(GLOBE_RES, GLOBE_RES);
        return globeBuf;
    }

    function renderCleanGlobe(spinRad, cloudRad, flashBoost = 0) {
        ensureGlobeBuffer();
        const data = globeImg.data;
        const half = GLOBE_RES / 2;
        const rad = half - 3.0;
        const lx = -0.45;
        const ly = -0.52;
        const lz = 0.72;

        for (let py = 0; py < GLOBE_RES; py++) {
            for (let px = 0; px < GLOBE_RES; px++) {
                const i4 = (py * GLOBE_RES + px) * 4;
                const dx = (px + 0.5 - half) / rad;
                const dy = (py + 0.5 - half) / rad;
                const r2 = dx * dx + dy * dy;

                const sx = (px + 0.5 - (half + 1.8)) / (rad + 0.7);
                const sy = (py + 0.5 - (half + 2.0)) / (rad + 0.7);
                if (r2 > 1.0) {
                    if (r2 <= 1.09 || (sx * sx + sy * sy <= 1.03 && r2 > 1.0)) {
                        data[i4] = 3;
                        data[i4 + 1] = 30;
                        data[i4 + 2] = 19;
                        data[i4 + 3] = 255;
                    } else {
                        data[i4] = 0;
                        data[i4 + 1] = 0;
                        data[i4 + 2] = 0;
                        data[i4 + 3] = 0;
                    }
                    continue;
                }

                const dz = Math.sqrt(Math.max(0, 1 - r2));
                const ndotl = dx * lx + dy * ly + dz * lz;
                const tilt = 0.22;
                const ty = dy * Math.cos(tilt) - dz * Math.sin(tilt);
                const tz = dy * Math.sin(tilt) + dz * Math.cos(tilt);

                const lat = Math.asin(clamp(-ty, -1, 1));
                const lon = Math.atan2(dx, tz) + spinRad;
                const u = ((lon / (Math.PI * 2)) % 1 + 1) % 1;
                const v = clamp(0.5 - lat / Math.PI, 0, 0.999);
                const kind = worldMap[Math.floor(v * MAP_H) * MAP_W + (Math.floor(u * MAP_W) % MAP_W)];

                let inCloud = false;
                const cLon = (((lon + cloudRad) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                for (const cb of CLOUD_BANDS) {
                    let dl = Math.abs(cLon - cb.lon);
                    if (dl > Math.PI) dl = Math.PI * 2 - dl;
                    if ((dl / cb.w) ** 2 + ((lat - cb.lat) / cb.h) ** 2 < 1.0 && ndotl > -0.1) {
                        inCloud = true;
                        break;
                    }
                }

                let r;
                let g;
                let b;
                if (inCloud) {
                    if (ndotl > 0.22) { r = 255; g = 255; b = 255; }
                    else { r = 219; g = 234; b = 254; }
                } else if (kind === 5) {
                    if (ndotl > 0.15) { r = 255; g = 255; b = 255; }
                    else { r = 186; g = 230; b = 253; }
                } else if (kind === 2 || kind === 3 || kind === 4) {
                    if (kind === 4) { r = 21; g = 128; b = 61; }
                    else if (kind === 3) { r = 132; g = 230; b = 85; }
                    else { r = 34; g = 197; b = 94; }
                    if (ndotl < 0.12) {
                        r = Math.round(r * 0.65);
                        g = Math.round(g * 0.68);
                        b = Math.round(b * 0.74);
                    } else if (ndotl > 0.74) {
                        r = Math.min(255, r + 22);
                        g = Math.min(255, g + 18);
                        b = Math.min(255, b + 8);
                    }
                } else if (kind === 1) {
                    if (ndotl > 0.15) { r = 56; g = 189; b = 248; }
                    else { r = 14; g = 165; b = 233; }
                } else {
                    if (ndotl > 0.84) { r = 125; g = 211; b = 252; }
                    else if (ndotl > 0.24) { r = 14; g = 165; b = 233; }
                    else if (ndotl > -0.12) { r = 2; g = 132; b = 199; }
                    else { r = 3; g = 105; b = 161; }
                }

                if (flashBoost > 0) {
                    r = Math.round(lerp(r, 253, flashBoost * 0.45));
                    g = Math.round(lerp(g, 224, flashBoost * 0.45));
                    b = Math.round(lerp(b, 71, flashBoost * 0.45));
                }
                data[i4] = r;
                data[i4 + 1] = g;
                data[i4 + 2] = b;
                data[i4 + 3] = 255;
            }
        }
        gctx.putImageData(globeImg, 0, 0);
    }

    // ---------------------------------------------------------------------------
    // 2. High-Detail 32x30 3/4-Profile SNES/RPG Pixel Companions, Gear & Landmarks
    // ---------------------------------------------------------------------------
    const PAL = {
        K: '#0F172A', // Deep Slate Ink Outline
        W: '#FFFFFF', // Pure White / Eye Sclera / Glint
        Y: '#FDE047', // Gold Highlight
        O: '#F59E0B', // Warm Gold / Amber Midtone
        R: '#C2410C', // Burnt Orange / Leather Accent
        G: '#47E393', // HabitArc Mint Highlight
        E: '#16A34A', // Emerald Midtone
        V: '#14532D', // Deep Forest Shadow
        H: '#F87171', // Crimson Highlight
        C: '#DC2626', // Crimson Midtone
        D: '#7F1D1D', // Crimson Shadow
        1: '#FFE7CE', // Warm Skin Highlight
        2: '#F4B886', // Warm Skin Midtone
        3: '#C47D53', // Warm Skin Shadow
        4: '#B45309', // Warm Chestnut / Leather
        5: '#78350F', // Dark Brown Boots / Grip
        Q: '#6366F1', // Bright Indigo Highlight
        I: '#3730A3', // Indigo Shinobi Suit
        N: '#1E1B4B', // Deep Indigo Shadow
        X: '#84CC16', // Bright Olive Highlight
        T: '#4D7C0F', // Tactical Olive Midtone
        h: '#365314', // Deep Olive Shadow
        L: '#E2E8F0', // White/Silver Alloy
        S: '#94A3B8', // Metallic Steel
        P: '#475569', // Gunmetal Polymer
        U: '#1E293B', // Charcoal Armor
        J: '#A5F3FC', // Ice Cyan Glow
        B: '#38BDF8', // Sky Blue Visor
        Z: '#0284C7', // Deep Cobalt Shadow
        // Legacy keys retained for landmarks / crowns / particles
        M: '#FB7185',
        A: '#334155',
        F: '#FBBF24',
    };

    // 32x30 3/4 Side-Facing RPG Hero Bitmaps (every row strictly 32 chars wide!)
    const RUNNERS = {
        arcy: {
            px: 1.5,
            miniPx: 1,
            run0: [
                '..............KK..KK............',
                '.............KGGKKGVK...........',
                '............KGGGKEEVK...........',
                '...........KKKKKEEEKKK..........',
                '.........KKGGGGGGGGGGGKK........',
                '........KGGEEEEEEEEEEEEGK.......',
                '........KOYYYYYYYYYYYYYOK.......',
                '........K45KKKKK11111KKOK.......',
                '.......K454K1111111122K.........',
                '.......K44K111KWK11KWK2K........',
                '........KK1111KKK11KKK2K........',
                '.........K222222222233K.........',
                '........KKKYYYYYYYYYYKK.........',
                '......KKVVVKRRRRRRRRK55K...KK...',
                '.....KVVEEEKRRRR55YRK12K..KYWK..',
                '....KVVEEEEKOOR5554RK1K...KOYK..',
                '....KVVEEEK454KRRRRKKKKK55KKK...',
                '....KKVVKK.K544RRRRR12KKK45K....',
                '......KK....K555555512K.KKK.....',
                '............KEEEEEEEEK..........',
                '...........KEEEVKKVEEEK.........',
                '..........KEEEVK..KEEEVK........',
                '.........K4444K....K4444K.......',
                '........K5555K......K5555K......',
                '........K55KK........K5555K.....',
                '........KKK...........KKKKK.....',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run1: [
                '.............KK..KK.............',
                '............KGGKKGVK............',
                '...........KGGGKEEVK............',
                '..........KKKKKEEEKKK...........',
                '........KKGGGGGGGGGGGKK.........',
                '.......KGGEEEEEEEEEEEEGK........',
                '.......KOYYYYYYYYYYYYYOK........',
                '.......K45KKKKK11111KKOK........',
                '......K454K1111111122K..........',
                '......K44K111KWK11KWK2K.........',
                '.......KK1111KKK11KKK2K.........',
                '........K222222222233K..........',
                '.......KKKYYYYYYYYYYKK..........',
                '.....KKVVVKRRRRRRRRK55K..KK.....',
                '....KVVEEEKRRRR55YRK12K.KYWK....',
                '....KVVEEEKOOR5554RK1KK.KOYK....',
                '.....KKVKK454KRRRRKKKK55KKK.....',
                '.......KK.K544RRRRR12KK45K......',
                '..........K5555555512K.KK.......',
                '...........KEEEEEEEEK...........',
                '...........KEEVKKVEEK...........',
                '...........KEEK..KEEK...........',
                '..........K444K..K444K..........',
                '..........K555K..K555K..........',
                '..........K55K....K555K.........',
                '..........KKK......KKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run2: [
                '..............KK..KK............',
                '.............KGGKKGVK...........',
                '............KGGGKEEVK...........',
                '...........KKKKKEEEKKK..........',
                '.........KKGGGGGGGGGGGKK........',
                '........KGGEEEEEEEEEEEEGK.......',
                '........KOYYYYYYYYYYYYYOK.......',
                '........K45KKKKK11111KKOK.......',
                '.......K454K1111111122K.........',
                '.......K44K111KWK11KWK2K........',
                '........KK1111KKK11KKK2K........',
                '.........K222222222233K.........',
                '........KKKYYYYYYYYYYKK.........',
                '......KKVVVKRRRRRRRRK55K....KK..',
                '.....KVVEEEKRRRR55YRK12K...KYWK.',
                '.....KKVEEEKOOR5554RK1K....KOYK.',
                '.......KKK454KRRRRKKKKKK55KKK...',
                '..........K544RRRRR12KK45KK.....',
                '..........K5555555512K.KK.......',
                '...........KEEEEEEEEK...........',
                '..........KEEVK..KEEVK..........',
                '.........KEEVK....KEEVK.........',
                '........K444K......K444K........',
                '.......K555K........K555K.......',
                '.......K55K..........K555K......',
                '.......KKK............KKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            crouch: [
                '................................',
                '................................',
                '..............KK..KK............',
                '.............KGGKKGVK...........',
                '............KGGGKEEVK...........',
                '...........KKKKKEEEKKK..........',
                '.........KKGGGGGGGGGGGKK........',
                '........KGGEEEEEEEEEEEEGK.......',
                '........KOYYYYYYYYYYYYYOK.......',
                '........K45KKKKK11111KKOK.......',
                '.......K454K1111111122K.........',
                '.......K44K111KWK11KWK2K........',
                '........KK1111KKK11KKK2K........',
                '.........K222222222233K.........',
                '.......KKKYYYYYYYYYYYYKK........',
                '.....KKVVVKRRRRRRRRRRK55K.......',
                '....KVVEEEKOORRRRRR554RK1K......',
                '.....KKKKK.K555555555KK12K......',
                '...........KEEEEEEEEEKK.........',
                '..........KEEVKKKKKEEVK.........',
                '.........K444K....K4444K........',
                '........K5555K....K5555K........',
                '........KKKKKK....KKKKKK........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            jump: [
                '..............KK..KK............',
                '.............KGGKKGVK...........',
                '............KGGGKEEVK...........',
                '...........KKKKKEEEKKK..........',
                '.........KKGGGGGGGGGGGKK........',
                '........KGGEEEEEEEEEEEEGK.......',
                '........KOYYYYYYYYYYYYYOK.......',
                '........K45KKKKK11111KKOK.......',
                '.......K454K1111111122K.........',
                '.......K44K111KWK11KWK2K........',
                '........KK1111KKK11KKK2K........',
                '.........K222222222233K.........',
                '......KK.KKYYYYYYYYYYKK..KK.....',
                '.....K12KKVVVKRRRRRRRRK.K12K....',
                '......KKKEEEEKRRRR55YRK.KKK.....',
                '........KVVEEKORRR554RK.........',
                '.........KKVKK5555555K..........',
                '...........KKKEEEEEEEKK.........',
                '...........KEEVKKKKVEEK.........',
                '..........K444K....K444K........',
                '.........K555K......K555K.......',
                '.........KKKK........KKKK.......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            cheer: [
                '..............KK..KK........KK..',
                '.............KGGKKGVK......KYWK.',
                '............KGGGKEEVK......KOYK.',
                '...........KKKKKEEEKKK......KKK.',
                '.........KKGGGGGGGGGGGKK....K5K.',
                '........KGGEEEEEEEEEEEEGK...K5K.',
                '........KOYYYYYYYYYYYYYOK...K5K.',
                '........K45KKKKK11111KKOK..K12K.',
                '.......K454K1111111122K....K5K..',
                '.......K44K111KWK11KWK2K...K5K..',
                '........KK1111KKK11KKK2K..K5K...',
                '......KK.K222222222233K..K5K....',
                '.....K12KKKYYYYYYYYYYKK.KKK.....',
                '......KKVVVKRRRRRRRRK55KK.......',
                '.....KVVEEEKRRRR55YRRRK.........',
                '.....KKVEEEKOOR5554RRK..........',
                '.......KKKKK555555555K..........',
                '...........KEEEEEEEEK...........',
                '..........KEEVKKKKVEEK..........',
                '..........KEEK....KEEK..........',
                '.........K444K....K444K.........',
                '.........K555K....K555K.........',
                '.........K555K....K555K.........',
                '.........KKKKK....KKKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
        },
        ninja: {
            px: 1.5,
            miniPx: 1,
            run0: [
                '..............KKKKKKK...........',
                '............KKQQQQQQQKK.........',
                '...........KQQQIIIIIIINK........',
                '..........KQQIIIIIIIIIINK.......',
                '.....KK...KQQSSPPPPPPSSNK.......',
                '....KYK..KQIUUU11111UUUK........',
                '.....KUK.KQUU11KWK1KWK2K........',
                '......KUKKQUUU1KKK1KKK2K........',
                '..HHHHKZK.KUPPPPPPPPPPUK........',
                '.HHCCCCCKK.KHHHHHHHHHHK......WW.',
                'CCDDDDDDHHKCCCCCCCCCCCK....KWWK.',
                '.DD..KKKCDKIIIISQIIIIK....KWWK..',
                '........KKKIIKSQKIIIIK...KWLK...',
                '..........KIUKSSQKIIK...KWLK....',
                '..........KUUUUYYYYYYUKKWLK.....',
                '..........KIIIKKKKIIIIKOOK......',
                '.........KIIIIK..KIIIIKC1K......',
                '........KIIIIK....KIIIIKK.......',
                '.......KIIIK.......KIIIK........',
                '.......KCCCK.......KCCCK........',
                '......KCDCK.........KCDCK.......',
                '......KUNUK.........KUNUK.......',
                '.....KUNUK...........KUNUK......',
                '.....KKKK.............KKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run1: [
                '.............KKKKKKK............',
                '...........KKQQQQQQQKK..........',
                '..........KQQQIIIIIIINK.........',
                '.........KQQIIIIIIIIIINK........',
                '....KK...KQQSSPPPPPPSSNK........',
                '...KYK..KQIUUU11111UUUK.........',
                '....KUK.KQUU11KWK1KWK2K.........',
                '.....KUKKQUUU1KKK1KKK2K.........',
                'HHHHHKZK.KUPPPPPPPPPPUK.........',
                'CCCCDDCCKKKHHHHHHHHHHK.....WW...',
                '.DDDDDDHHKCCCCCCCCCCCK....KWWK..',
                '....KKKCDKIIIISQIIIIK....KWWK...',
                '.......KKKIIKSQKIIIIK...KWLK....',
                '.........KIUKSSQKIIK...KWLK.....',
                '.........KUUUUYYYYYYUKKWLK......',
                '..........KIIIKKKKIIKKOOK.......',
                '..........KIIIK..KIIIKC1K.......',
                '..........KIIIK..KIIIKKK........',
                '..........KCCCK..KCCCK..........',
                '..........KCDCK..KCDCK..........',
                '..........KUNUK..KUNUK..........',
                '.........KUNUK....KUNUK.........',
                '.........KKKK......KKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run2: [
                '..............KKKKKKK...........',
                '............KKQQQQQQQKK.........',
                '...........KQQQIIIIIIINK........',
                '..........KQQIIIIIIIIIINK.......',
                '.....KK...KQQSSPPPPPPSSNK.......',
                '....KYK..KQIUUU11111UUUK........',
                '.....KUK.KQUU11KWK1KWK2K........',
                '......KUKKQUUU1KKK1KKK2K........',
                '.HHHHHKZK.KUPPPPPPPPPPUK........',
                'CCDDDDCCKK.KHHHHHHHHHHK......WW.',
                '.DD..KKKHHKCCCCCCCCCCCK....KWWK.',
                '.......KCDKIIIISQIIIIK....KWWK..',
                '........KKKIIKSQKIIIIK...KWLK...',
                '..........KIUKSSQKIIK...KWLK....',
                '..........KUUUUYYYYYYUKKWLK.....',
                '..........KIIIKKKKIIIIKOOK......',
                '..........KIIIKKKKIIIKC1K.......',
                '.........KIIIIK..KIIIIKK........',
                '........KIIIK......KIIIK........',
                '.......KCCCK........KCCCK.......',
                '.......KCDCK........KCDCK.......',
                '......KUNUK..........KUNUK......',
                '......KUNUK..........KUNUK......',
                '......KKKK............KKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            crouch: [
                '................................',
                '................................',
                '..............KKKKKKK...........',
                '............KKQQQQQQQKK.........',
                '...........KQQQIIIIIIINK........',
                '..........KQQIIIIIIIIIINK.......',
                '.....KK..KKQQSSPPPPPPSSNK.......',
                '....KYK.KQIUUU11111UUUK.........',
                '.....KUKKQUU11KWK1KWK2K.........',
                '....HHHHKUPPPPPPPPPPUK..........',
                '..HHCCCCKKHHHHHHHHHHK...........',
                '.CCDDDDDDKCCCCCCCCCCK...WW......',
                '.....KKKKKIIIISQIIIIK..KWWK.....',
                '.........KUUUUYYYYYYUKKWLK......',
                '.........KIIIKKKKIIIIKOOK.......',
                '........KCCCCK..KCCCCKC1K.......',
                '.......KCDDCK....KCDDCKK........',
                '......KUNNUK......KUNNUK........',
                '......KKKKK........KKKKK........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            jump: [
                '..............KKKKKKK...........',
                '............KKQQQQQQQKK.........',
                '...........KQQQIIIIIIINK........',
                '..........KQQIIIIIIIIIINK.......',
                '.....KK...KQQSSPPPPPPSSNK.......',
                '....KYK..KQIUUU11111UUUK........',
                '.....KUK.KQUU11KWK1KWK2K........',
                '..HHHHKUKKQUUU1KKK1KKK2K........',
                '.HHCCCCCK.KUPPPPPPPPPPUK........',
                'CCDDDDDDKK.KHHHHHHHHHHK.........',
                '.....KKKK..KCCCCCCCCCCK.........',
                '..........KIIIISQIIIIK..........',
                '..........KUUUUYYYYYYUK.........',
                '.........KIIIIKKKKIIIIK.........',
                '........KCCCCK....KCCCCK........',
                '.......KCDDCK......KCDDCK.......',
                '......KUNNUK........KUNNUK......',
                '......KKKKK..........KKKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            slash: [
                '..............KKKKKKK...........',
                '............KKQQQQQQQKK.........',
                '...........KQQQIIIIIIINK........',
                '..........KQQIIIIIIIIIINK.......',
                '.....KK...KQQSSPPPPPPSSNK.......',
                '....KYK..KQIUUU11111UUUK........',
                '.....KUK.KQUU11KWK1KWK2K........',
                '......KUKKQUUU1KKK1KKK2K........',
                '..HHHHKZK.KUPPPPPPPPPPUK........',
                '.HHCCCCCKK.KHHHHHHHHHHK.........',
                'CCDDDDDDHHKCCCCCCCCCCCK.........',
                '.DD..KKKCDKIIIISQIIIIK..........',
                '........KKKIIKSQKIIIIK..........',
                '..........KIUKSSQKIIK...........',
                '..........KUUUUYYYYYYUK.........',
                '..........KIIIKKKKIIIIK.........',
                '.........KIIIIK..KIIIIK.........',
                '........KIIIIK....KIIIIK........',
                '.......KIIIK.......KIIIK........',
                '.......KCCCK.......KCCCK........',
                '......KCDCK.........KCDCK.......',
                '......KUNUK.........KUNUK.......',
                '.....KUNUK...........KUNUK......',
                '.....KKKK.............KKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            cheer: [
                '..............KKKKKKK........WW.',
                '............KKQQQQQQQKK.....KWWK',
                '...........KQQQIIIIIIINK....KWWK',
                '..........KQQIIIIIIIIIINK..KWLK.',
                '.....KK...KQQSSPPPPPPSSNK..KWLK.',
                '....KYK..KQIUUU11111UUUK..KWLK..',
                '.....KUK.KQUU11KWK1KWK2K..KWLK..',
                '......KUKKQUUU1KKK1KKK2K.KOOK...',
                '..HHHHKZK.KUPPPPPPPPPPUK.KC1K...',
                '.HHCCCCCKK.KHHHHHHHHHHK.KKK.....',
                'CCDDDDDDHHKCCCCCCCCCCCK.........',
                '.DD..KKKCDKIIIISQIIIIK..........',
                '........KKKIIKSQKIIIIK..........',
                '..........KIUKSSQKIIK...........',
                '..........KUUUUYYYYYYUK.........',
                '..........KIIIKKKKIIIIK.........',
                '..........KIIIK..KIIIIK.........',
                '.........KIIIIK...KIIIIK........',
                '........KIIIK......KIIIK........',
                '........KCCCK......KCCCK........',
                '.......KCDCK........KCDCK.......',
                '.......KUNUK........KUNUK.......',
                '......KUNUK..........KUNUK......',
                '......KKKK............KKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
        },
        specops: {
            px: 1.5,
            miniPx: 1,
            run0: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '........KUPPPPPPPPPPUK...KKK....',
                '.......KKXXTTTTTTTTXXKK.KPSPK...',
                '......KSSPPPPPSSPPPPPPKKKKKKK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '.....KTTKSUPPPK12KUPKUUUUSPPPPPK',
                '......KKKTTTTTKKKKKKTPKPPKKKKKKK',
                '.........KTTTTTTTTTTTTKPPK......',
                '.........KTTTTKKKKTTTTK.KK......',
                '........KTTTTK....KTTTTK........',
                '........KSSPPK....KSSPPK........',
                '.......KhhhK.......KhhhK........',
                '.......KUUUK.......KUUUK........',
                '......KUUUUK.......KUUUUK.......',
                '......KKKKKK.......KKKKKK.......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run1: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '........KUPPPPPPPPPPUK..KKK.....',
                '.......KKXXTTTTTTTTXXKKKPSPK....',
                '.......KSPPPPPSSPPPPPPKKKKKK....',
                '......KTTKSP4OYSP4OYPKUUUPPSPPKK',
                '......KTTKSUPPPK12KUPKUUUUSPPPPP',
                '.......KKKTTTTTKKKKKKTPKPPKKKKKK',
                '.........KTTTTTTTTTTTTKPPK......',
                '..........KTTTK..KTTTK.KK.......',
                '..........KTTTK..KTTTK..........',
                '..........KSSPK..KSSPK..........',
                '..........KhhK....KhhK..........',
                '.........KUUUK....KUUUK.........',
                '.........KKKKK....KKKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run2: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '........KUPPPPPPPPPPUK...KKK....',
                '.......KKXXTTTTTTTTXXKK.KPSPK...',
                '......KSSPPPPPSSPPPPPPKKKKKKK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '.....KTTKSUPPPK12KUPKUUUUSPPPPPK',
                '......KKKTTTTTKKKKKKTPKPPKKKKKKK',
                '.........KTTTTTTTTTTTTKPPK......',
                '.........KTTTTKKKKTTTTK.KK......',
                '.........KTTTK....KTTTK.........',
                '........KSSPK......KSSPK........',
                '........KhhK........KhhK........',
                '.......KUUUK........KUUUK.......',
                '......KUUUUK........KUUUUK......',
                '......KKKKKK........KKKKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            crouch: [
                '................................',
                '................................',
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '.......KKUPPPPPPPPPPUKK..KKK....',
                '......KSSPPPPPSSPPPPPPKKKPSPK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '......KKKSUPPPKKKKUPKUUUUSPPPPPK',
                '.........KTTTTTTTTTTTTPKPPKKKKKK',
                '........KSSPPKKKKKKSSPPKKK......',
                '.......KhhhK........KhhhK.......',
                '......KUUUUUK......KUUUUUK......',
                '......KKKKKKK......KKKKKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            jump: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '.......KKUPPPPPPPPPPUKK..KKK....',
                '......KXXPPPPPSSPPPPPPKKKPSPK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '......KKKSUPPPK12KUPKUUUUSPPPPPK',
                '.........KTTTTTTTTTTTTPKPPKKKKKK',
                '........KSSPPKKKKKKSSPPK.KK.....',
                '.......KhhhK........KhhhK.......',
                '......KUUUUK........KUUUUK......',
                '......KKKKKK........KKKKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            fire: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '........KUPPPPPPPPPPUK...KKK....',
                '.......KKXXTTTTTTTTXXKK.KPSPK...',
                '......KSSPPPPPSSPPPPPPKKKKKKK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '.....KTTKSUPPPK12KUPKUUUUSPPPPPK',
                '......KKKTTTTTKKKKKKTPKPPKKKKKKK',
                '.........KTTTTTTTTTTTTKPPK......',
                '.........KTTTTKKKKTTTTK.KK......',
                '........KTTTTK....KTTTTK........',
                '........KSSPPK....KSSPPK........',
                '.......KhhhK.......KhhhK........',
                '.......KUUUK.......KUUUK........',
                '......KUUUUK.......KUUUUK.......',
                '......KKKKKK.......KKKKKK.......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            cheer: [
                '........KG......................',
                '........KS..KKKKKKKKK...........',
                '........KSKKXXXXXXXXXKK.........',
                '........KSKXXTTTTTTTTTHK........',
                '.......KKKSSPPPPPTTTTTHK........',
                '.......KSPUUUGJPUUGJPPHK........',
                '.......KSUUUUEEPUUEEPUK.........',
                '........KUUUUUUUUUUUUK..........',
                '........KUPPPPPPPPPPUK...KKK....',
                '.......KKXXTTTTTTTTXXKK.KPSPK...',
                '......KSSPPPPPSSPPPPPPKKKKKKK...',
                '.....KTTKSP4OYSP4OYPKUUUPPSPPKKK',
                '.....KTTKSUPPPK12KUPKUUUUSPPPPPK',
                '......KKKTTTTTKKKKKKTPKPPKKKKKKK',
                '.........KTTTTTTTTTTTTKPPK......',
                '.........KTTTTKKKKTTTTK.KK......',
                '........KTTTTK....KTTTTK........',
                '........KSSPPK....KSSPPK........',
                '.......KhhhK.......KhhhK........',
                '.......KUUUK.......KUUUK........',
                '......KUUUUK.......KUUUUK.......',
                '......KKKKKK.......KKKKKK.......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
        },
        astro: {
            px: 1.5,
            miniPx: 1,
            run0: [
                '.............KKKKKKK............',
                '............KGGGGGGGK...........',
                '.........KKKWWWWWWWWKKK.........',
                '........KWWWWLLLLLLLLWWK........',
                '.......KWWKJJBBBBBBBWLLK........',
                '.......KWKJBBBBBBWBBBLLK........',
                '.......KWKBBBBZZZZZZBLLK........',
                '.......KWKLLKKKKKKKKLLLK........',
                '......KOOOKWWWWWWWWWWWWK........',
                '.....KSSSSKWWOOOOOOWWWWK.KKKKKK.',
                '....KSZZSSKWWOGYCCWWWWWK.KWWJBGK',
                '....KSSPSSKWWWWWWWWWWWWKKKLBWWGK',
                '.....KKKKKKLLLLLLLLLLLLKKWWKKKK.',
                '..........KWWWWOOOOOOWWK.KK.....',
                '.........KWWWWKKKKKWWWWK........',
                '........KWWWK.......KWWWK.......',
                '........KLLLK.......KLLLK.......',
                '.......KOOOK.........KOOOK......',
                '.......KOLLK.........KOLLK......',
                '......KUUUUK.........KUUUUK.....',
                '......KKKKKK.........KKKKKK.....',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run1: [
                '............KKKKKKK.............',
                '...........KGGGGGGGK............',
                '........KKKWWWWWWWWKKK..........',
                '.......KWWWWLLLLLLLLWWK.........',
                '......KWWKJJBBBBBBBWLLK.........',
                '......KWKJBBBBBBWBBBLLK.........',
                '......KWKBBBBZZZZZZBLLK.........',
                '......KWKLLKKKKKKKKLLLK.........',
                '.....KOOOKWWWWWWWWWWWWK.........',
                '....KSSSSKWWOOOOOOWWWWK.KKKKKK..',
                '...KSZZSSKWWOGYCCWWWWWK.KWWJBGK.',
                '...KSSPSSKWWWWWWWWWWWWKKKLBWWGK.',
                '....KKKKKKLLLLLLLLLLLLKKWWKKKK..',
                '.........KWWWWOOOOOOWWK.KK......',
                '..........KWWWK..KWWWK..........',
                '..........KWWWK..KWWWK..........',
                '..........KLLLK..KLLLK..........',
                '..........KOOOK..KOOOK..........',
                '.........KUUUUK..KUUUUK.........',
                '.........KKKKKK..KKKKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            run2: [
                '.............KKKKKKK............',
                '............KGGGGGGGK...........',
                '.........KKKWWWWWWWWKKK.........',
                '........KWWWWLLLLLLLLWWK........',
                '.......KWWKJJBBBBBBBWLLK........',
                '.......KWKJBBBBBBWBBBLLK........',
                '.......KWKBBBBZZZZZZBLLK........',
                '.......KWKLLKKKKKKKKLLLK........',
                '......KOOOKWWWWWWWWWWWWK........',
                '.....KSSSSKWWOOOOOOWWWWK.KKKKKK.',
                '....KSZZSSKWWOGYCCWWWWWK.KWWJBGK',
                '....KSSPSSKWWWWWWWWWWWWKKKLBWWGK',
                '.....KKKKKKLLLLLLLLLLLLKKWWKKKK.',
                '..........KWWWWOOOOOOWWK.KK.....',
                '.........KWWWWKKKKKWWWWK........',
                '.........KWWWK....KWWWK.........',
                '........KLLLK......KLLLK........',
                '........KOOOK......KOOOK........',
                '.......KOLLK........KOLLK.......',
                '......KUUUUK........KUUUUK......',
                '......KKKKKK........KKKKKK......',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            crouch: [
                '................................',
                '................................',
                '.............KKKKKKK............',
                '............KGGGGGGGK...........',
                '.........KKKWWWWWWWWKKK.........',
                '........KWWWWLLLLLLLLWWK........',
                '.......KWWKJJBBBBBBBWLLK........',
                '.......KWKJBBBBBBWBBBLLK........',
                '.......KWKBBBBZZZZZZBLLK........',
                '.......KWKLLKKKKKKKKLLLK........',
                '......KOOOKWWWWWWWWWWWWK........',
                '.....KSSSSKWWOOOOOOWWWWK.KKKKKK.',
                '....KSSPSSKWWOGYCCWWWWWK.KWWJBGK',
                '.....KKKKKKLLLLLLLLLLLLKKKLBWWGK',
                '.........KLLLLKKKKKKKKKKWWKKKK..',
                '........KOOOK..........KOOOK....',
                '.......KUUUUK..........KUUUUK...',
                '.......KKKKKK..........KKKKKK...',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            jump: [
                '.............KKKKKKK............',
                '............KGGGGGGGK...........',
                '.........KKKWWWWWWWWKKK.........',
                '........KWWWWLLLLLLLLWWK........',
                '.......KWWKJJBBBBBBBWLLK........',
                '.......KWKJBBBBBBWBBBLLK........',
                '.......KWKBBBBZZZZZZBLLK........',
                '.......KWKLLKKKKKKKKLLLK........',
                '......KOOOKWWWWWWWWWWWWK........',
                '.....KSSSSKWWOOOOOOWWWWK.KKKKKK.',
                '....KSZZSSKWWOGYCCWWWWWK.KWWJBGK',
                '....KJJJKKWWWWWWWWWWWWKKKLBWWGK.',
                '.....BBB.KLLLLLLLLLLLLKKWWKKKK..',
                '.....OO..KWWWK....KWWWK.........',
                '......Y..KOOOK....KOOOK.........',
                '.........KUUUUK..KUUUUK.........',
                '.........KKKKKK..KKKKKK.........',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
                '................................',
            ],
            cheer: [
                '.............KKKKKKK............',
                '............KGGGGGGGK...........',
                '.........KKKWWWWWWWWKKK.........',
                '........KWWWWLLLLLLLLWWK........',
                '.......KWWKJJBBBBBBBWLLK........',
                '.......KWKJBBBBBBWBBBLLK........',
                '.......KWKBBBBZZZZZZBLLK........',
                '.......KWKLLKKKKKKKKLLLK........',
                '......KOOOKWWWWWWWWWWWWK........',
                '.....KSSSSKWWOOOOOOWWWWK.KKKKKK.',
                '....KSZZSSKWWOGYCCWWWWWK.KWWJBGK',
                '....KSSPSSKWWWWWWWWWWWWKKKLBWWGK',
                '.....KKKKKKLLLLLLLLLLLLKKWWKKKK.',
                '..........KWWWWOOOOOOWWK.KK.....',
                '.........KWWWWKKKKKWWWWK........',
                '........KWWWWK.....KWWWK........',
                '........KLLLK.......KLLLK.......',
                '........KLLLK.......KLLLK.......',
                '.......KOOOK.........KOOOK......',
                '.......KOLLK.........KOLLK......',
                '......KUUUUK.........KUUUUK.....',
                '......KUUUUK.........KUUUUK.....',
                '......KKKKKK.........KKKKKK.....',
            ],
        },
    };

    // Trim trailing empty rows so every sprite's boot sole rests flush on bottomY.
    Object.values(RUNNERS).forEach((spr) => {
        Object.keys(spr).forEach((pose) => {
            if (!Array.isArray(spr[pose])) return;
            while (spr[pose].length > 1 && /^\.+$/.test(spr[pose][spr[pose].length - 1])) {
                spr[pose] = spr[pose].slice(0, -1);
            }
        });
    });

    const GEAR_DRONE = [
        '..KKKKK..',
        'BKWJJJWKB',
        '.KKGGGKK.',
        '..KSSSK..',
    ];
    const CROWN_SPR = [
        '.K...K...K.',
        'KYK.KYK.KYK',
        'KYYKYYYKYYK',
        'KOOOOOOOOOK',
        'KKKKKKKKKKK',
    ];
    const TROPHY_SPR = [
        '.KKKKKKKK.',
        'KKYYYYYYKK',
        'KYYWYYBYYK',
        '.KKOOOOOK.',
        '...KYYK...',
        '..KKKKKK..',
        '.KKKKKKKK.',
    ];
    const GEAR_KUNAI = [
        '....KKK....',
        'KKK.KWSKKK.',
        'KCKKKWWWWSK',
        'KKK.KWSKKK.',
        '....KKK....',
    ];
    const GEAR_KATANA_FLAT = [
        'KKKYYYYKKKKKKKKKKKKKKK',
        'KCKYYYKWWWWWWWWWWWWWSK',
        'KKKYYYYKSSSSSSSSSSSSK.',
        '.......KKKKKKKKKKKKK..',
    ];

    function drawBitmap(ctx, grid, cx, bottomY, px) {
        const h = grid.length;
        const w = grid[0].length;
        const ox = cx - (w * px) / 2;
        const oy = bottomY - h * px;
        for (let r = 0; r < h; r++) {
            const y0 = Math.round(oy + r * px);
            const y1 = Math.round(oy + (r + 1) * px);
            const rh = Math.max(1, y1 - y0);
            for (let c = 0; c < w; c++) {
                const ch = grid[r][c];
                if (ch === '.') continue;
                const x0 = Math.round(ox + c * px);
                const x1 = Math.round(ox + (c + 1) * px);
                ctx.fillStyle = PAL[ch];
                ctx.fillRect(x0, y0, Math.max(1, x1 - x0), rh);
            }
        }
    }

    const SPRITE_REF_H = 105;
    // Approximate head-top height (sprite px above the feet) in each hero's CHEER frame; used to seat the milestone crown.
    const SPRITE_HEAD_TOP = { arcy: 112, ninja: 94, specops: 100, astro: 102 };
    const SPRITE_IMAGES = Object.create(null);

    function getSpriteEntry(id, pose) {
        if (typeof window === 'undefined' || typeof Image === 'undefined') return null;
        const bank = window.HabitArcSprites;
        const def = bank && bank[id] && bank[id][pose];
        if (!def || !def.src) return null;
        let cache = SPRITE_IMAGES[id];
        if (!cache) cache = SPRITE_IMAGES[id] = Object.create(null);
        let entry = cache[pose];
        if (!entry) {
            const img = new Image();
            img.src = def.src;
            entry = {
                img,
                w: def.w || 96,
                h: def.h || SPRITE_REF_H,
                dx: def.ax || 0,
                rt: Array.isArray(def.rt) ? def.rt : [0, 0],
                tp: Array.isArray(def.tp) ? def.tp : [0, 0],
            };
            cache[pose] = entry;
        }
        if (!entry.img.complete || !entry.img.naturalWidth) return null;
        return entry;
    }

    // Uniform per-hero scale: every hero's RUN frame is drawn the same on-screen height.
    function getSpriteScale(id, targetH) {
        const bank = typeof window !== 'undefined' ? window.HabitArcSprites : null;
        const ref = bank && bank[id] && bank[id].run0 && bank[id].run0.h;
        return targetH / (ref || SPRITE_REF_H);
    }

    function warmSprites() {
        if (typeof window === 'undefined' || typeof Image === 'undefined' || !window.HabitArcSprites) return;
        const bank = window.HabitArcSprites;
        for (const id of Object.keys(bank)) {
            const poses = bank[id];
            if (!poses) continue;
            for (const pose of Object.keys(poses)) {
                getSpriteEntry(id, pose);
            }
        }
    }

    function drawSpriteImage(ctx, entry, cx, bottomY, scale, opts) {
        if (!entry || !entry.img) return;
        const sx = (opts && opts.squashX) || 1;
        const sy = (opts && opts.squashY) || 1;
        const dw = entry.w * scale * sx;
        const dh = entry.h * scale * sy;
        const anchorShift = (entry.dx || 0) * scale * sx;
        const dx = cx - dw / 2 - anchorShift;
        const dy = bottomY - dh;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(entry.img, dx, dy, dw, dh);
        ctx.restore();
    }

    warmSprites();

    function drawCharacterBackGear(ctx, id, phase, scale = 1, T = 0) {
        // Integrated directly into 32x30 hero bitmaps and PNG sprites.
        return;
    }

    // `tips` (PNG sprites only) holds the measured weapon tip points in draw px: { rt: [x, y], tp: [x, y] }.
    function drawHeldGear(ctx, id, phase, scale = 1, T = 0, showBeam = true, tips = null) {
        if (!id || id === 'arcy') return;
        const cheer = phase === 'cheer';
        const fire = phase === 'fire';

        if (id === 'ninja' && cheer && Math.sin(T * 0.022) > -0.2) {
            const gx = tips ? tips.tp[0] - 1 : 21 * scale;
            const gy = tips ? tips.tp[1] - 2 : -35 * scale;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(Math.round(gx), Math.round(gy), Math.round(2.5 * scale), Math.round(2.5 * scale));
            ctx.fillStyle = '#A5F3FC';
            ctx.fillRect(Math.round(gx + 2 * scale), Math.round(gy + 3 * scale), Math.round(1.8 * scale), Math.round(1.8 * scale));
            return;
        }

        if (id === 'specops' && showBeam && (phase === 'run' || fire)) {
            const beamLen = (fire ? 26 : 16) * scale;
            const muzzleX = tips ? tips.rt[0] + 1 : 24 * scale;
            const muzzleY = tips ? tips.rt[1] : -14.5 * scale;
            ctx.fillStyle = fire ? 'rgba(239, 68, 68, 0.84)' : 'rgba(220, 38, 38, 0.54)';
            ctx.fillRect(Math.round(muzzleX), Math.round(muzzleY), Math.round(beamLen), Math.max(1, Math.round((fire ? 1.5 : 1.1) * scale)));
            ctx.fillStyle = fire ? '#FFFFFF' : '#EF4444';
            ctx.fillRect(Math.round(muzzleX + beamLen), Math.round(muzzleY - 0.6 * scale), Math.round(2.5 * scale), Math.round(2.5 * scale));
            return;
        }

        if (id === 'astro' && showBeam && (cheer || fire || Math.sin(T * 0.03) > 0.1)) {
            const pulse = (Math.sin(T * 0.04) * 0.5 + 1.6) * scale;
            const emitterX = tips ? (cheer ? tips.tp[0] : tips.rt[0]) : 23 * scale;
            const emitterY = tips ? (cheer ? tips.tp[1] : tips.rt[1]) : -16.5 * scale;
            ctx.fillStyle = '#47E393';
            ctx.fillRect(Math.round(emitterX), Math.round(emitterY), Math.round(pulse * 1.5), Math.round(pulse * 1.5));
            ctx.fillStyle = '#A5F3FC';
            ctx.fillRect(Math.round(emitterX + 0.5 * scale), Math.round(emitterY + 0.5 * scale), Math.round(pulse), Math.round(pulse));
        }
    }

    function drawFlag(ctx, x, y, angle, lit, T, N, scale = 1, tier = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#031E13';
        ctx.fillRect(-1.8, -42, 4.5, 43);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-0.6, -41, 2, 40);
        ctx.fillStyle = lit ? '#FDE047' : '#FFFFFF';
        ctx.strokeStyle = '#031E13';
        ctx.lineWidth = 2;
        ctx.fillRect(-3, -46, 7, 7);
        ctx.strokeRect(-3, -46, 7, 7);

        const wave = Math.sin(T * 0.012) > 0 ? 1 : 0;
        const label = String(N);
        const fw = label.length >= 3 ? 38 : label.length === 2 ? 31 : 25;

        ctx.fillStyle = '#031E13';
        ctx.fillRect(2.5, -43, fw, 21);
        ctx.fillStyle = lit ? (tier === 100 ? '#FDE047' : '#F59E0B') : '#FFFFFF';
        ctx.fillRect(4.5, -41, fw - 4, 17);
        ctx.fillStyle = lit ? (tier === 100 ? '#F59E0B' : '#FDE047') : '#47E393';
        ctx.fillRect(4.5, -26.5 + (wave * 0.5), fw - 4, 2.5);

        ctx.fillStyle = '#031E13';
        ctx.font = '900 10.5px "Geist", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 2.5 + fw / 2, -33.2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    function drawMiniMarker(ctx, cx, cy, R, ang, dayNum) {
        if (ang < -1.06 || ang > 1.06 || !dayNum || dayNum < 1) return;
        ctx.save();
        ctx.translate(cx + Math.sin(ang) * (R - 1), cy - Math.cos(ang) * (R - 1));
        ctx.rotate(ang);
        const label = String(dayNum);
        const mw = label.length >= 3 ? 28 : label.length === 2 ? 22 : 18;

        ctx.fillStyle = '#031E13';
        ctx.fillRect(-1.5, -25, 3, 26);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-0.5, -24, 1, 24);
        ctx.fillStyle = '#47E393';
        ctx.strokeStyle = '#031E13';
        ctx.lineWidth = 1.6;
        ctx.fillRect(-2.4, -28, 4.8, 4.8);
        ctx.strokeRect(-2.4, -28, 4.8, 4.8);

        ctx.fillStyle = '#031E13';
        ctx.fillRect(1.5, -25, mw, 15.5);
        ctx.fillStyle = '#15803D';
        ctx.fillRect(3.2, -23.3, mw - 3.4, 12.1);

        ctx.font = '900 9px "Geist", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#031E13';
        ctx.fillText(label, 1.5 + mw / 2 + 0.8, -16.4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, 1.5 + mw / 2, -17.2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    function drawFireworkBurst(ctx, sparks, cx, cy, T, T0, dur = 1100) {
        if (T < T0) return;
        const age = T - T0;
        if (age > dur) return;
        const p = age / dur;
        for (const sp of sparks) {
            const dist = sp.dist * easeOutCubic(p);
            const sx = cx + Math.cos(sp.a) * dist;
            const sy = cy + Math.sin(sp.a) * dist + p * p * (sp.grav || 20);
            const sz = sp.sz * (1 - p * 0.58);
            ctx.save();
            ctx.globalAlpha = 1 - p;
            ctx.fillStyle = sp.col;
            ctx.strokeStyle = '#031E13';
            ctx.lineWidth = 1.6;
            if (sp.star) {
                ctx.fillRect(sx - sz, sy - 1.8, sz * 2, 3.6);
                ctx.fillRect(sx - 1.8, sy - sz, 3.6, sz * 2);
            } else {
                ctx.beginPath();
                ctx.arc(sx, sy, sz * 0.55, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // ---------------------------------------------------------------------------
    // 2b. Per-hero mini scenes + enemy encounters (drawn around the globe)
    // ---------------------------------------------------------------------------
    const ENEMY_PAL = {
        K: '#0F172A', w: '#FFFFFF', y: '#FDE047',
        R: '#DC2626', d: '#7F1D1D', r: '#EF4444',
        g: '#CBD5E1', s: '#64748B',
        l: '#A3E635', L: '#4D7C0F',
        p: '#C4B5FD', P: '#8B5CF6', D: '#5B21B6',
    };
    // 11x10 chibi grunts, one family per hero (K = outline, '.' = transparent).
    const ENEMY_ART = {
        oni: [
            '..K.....K..',
            '.KwK...KwK.',
            '.KRKKKKKRK.',
            'KRRRRRRRRRK',
            'KRyKRRRKyRK',
            'KRRRRKRRRRK',
            'KRKwKKKwKRK',
            '.KRRRRRRRK.',
            '..KdRRRdK..',
            '..KK...KK..',
        ],
        bot: [
            '....K.K....',
            '..KKKKKKK..',
            '.KgggggggK.',
            '.KgKKKKKgK.',
            '.KgKrrrKgK.',
            '.KgKKKKKgK.',
            '..KgggggK..',
            '.KKsssssKK.',
            '.KgKsssKgK.',
            '..KK...KK..',
        ],
        alien: [
            '...KKKKK...',
            '..KllllllK.',
            '.KlllllllK.',
            'KlllKKKlllK',
            'KllKwwwKllK',
            'KllKwKwKllK',
            'KlllKKKlllK',
            '.KlLLLLLlK.',
            '..KlKKKlK..',
            '..KK...KK..',
        ],
        slime: [
            '....KKK....',
            '..KKpppKK..',
            '.KpppppppK.',
            '.KpwKpwKpK.',
            'KpppppppppK',
            'KpppKKKpppK',
            'KPpppppppPK',
            'KPPPPPPPPPK',
            '.KDDDDDDDK.',
            '..KKKKKKK..',
        ],
    };
    const ENEMY_META = {
        ninja: { art: 'oni', gap: 0.20, melee: true, burst: ['#EF4444', '#FFFFFF', '#A5F3FC'] },
        specops: { art: 'bot', gap: 0.56, melee: false, burst: ['#FDE047', '#94A3B8', '#FFFFFF'] },
        astro: { art: 'alien', gap: 0.50, melee: false, burst: ['#38BDF8', '#A5F3FC', '#FFFFFF'] },
        arcy: { art: 'slime', gap: 0.50, melee: false, burst: ['#FDE047', '#16A34A', '#FFFFFF'] },
    };
    const ENEMY_CLOSING_SPEED = 0.00075; // rad/ms the globe carries enemies towards the hero
    const ENEMY_VISIBLE_ANGLE = 1.3;
    const ENEMY_POP_MS = 300;

    /** Deterministic kill schedule: 3 enemies on short streaks, 4 on long ones, all inside the sprint window. */
    function planEncounters(n, runnerId) {
        const meta = ENEMY_META[runnerId];
        if (!meta) return [];
        const tl = getTimeline(n);
        const runDur = tl.T_CROUCH - tl.T_RUN_START;
        const count = runDur < 2600 ? 3 : 4;
        const first = tl.T_RUN_START + runDur * 0.30;
        const last = tl.T_CROUCH - Math.max(110, runDur * 0.07);
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push({
                i,
                tKill: Math.round(first + ((last - first) * i) / (count - 1)),
                gap: meta.gap,
                melee: meta.melee,
            });
        }
        return out;
    }

    function drawPalGrid(ctx, rows, cx, bottomY, px, opts) {
        const h = rows.length;
        const w = rows[0].length;
        const ox = cx - (w * px) / 2;
        const oy = bottomY - h * px;
        const flash = !!(opts && opts.flash);
        const rFrom = (opts && opts.rowFrom) || 0;
        const rTo = opts && opts.rowTo != null ? opts.rowTo : h;
        for (let r = rFrom; r < rTo; r++) {
            for (let c = 0; c < w; c++) {
                const ch = rows[r][c];
                if (ch === '.') continue;
                ctx.fillStyle = flash ? '#FFFFFF' : (ENEMY_PAL[ch] || '#FF00FF');
                ctx.fillRect(Math.round(ox + c * px), Math.round(oy + r * px), Math.ceil(px), Math.ceil(px));
            }
        }
    }

    /**
     * Draws the encounters in the hero's local frame (origin = hero feet, +y down, rotated with the globe).
     * `o.muzzle` is the weapon tip in that frame (null when the hero has no ranged weapon sprite).
     */
    function drawEncounters(ctx, o) {
        const meta = ENEMY_META[o.runnerId];
        if (!meta) return;
        const rows = ENEMY_ART[meta.art];
        const px = 2;
        const eh = rows.length * px;
        for (const e of o.encounters) {
            const age = o.T - e.tKill;
            if (age > ENEMY_POP_MS + 120) continue;
            const delta = e.gap + (e.tKill - o.T) * ENEMY_CLOSING_SPEED;
            if (delta > ENEMY_VISIBLE_ANGLE || delta < -0.5) continue;
            const fadeIn = clamp((ENEMY_VISIBLE_ANGLE - delta) / 0.16, 0, 1);
            const fx = o.GR * Math.sin(delta);
            const fy = o.GR * (1 - Math.cos(delta)) + o.aLift;
            const up = [Math.sin(delta), -Math.cos(delta)];
            const centre = [fx + up[0] * eh * 0.5, fy + up[1] * eh * 0.5];

            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(delta);
            if (age < 0) {
                const bob = Math.round(Math.sin((o.T + e.i * 90) * 0.02) * 1);
                ctx.globalAlpha = fadeIn;
                drawPalGrid(ctx, rows, 0, 2 + bob, px);
            } else if (meta.melee) {
                // clean diagonal cut: the two halves slide apart and fade
                const p = clamp(age / ENEMY_POP_MS, 0, 1);
                ctx.globalAlpha = 1 - p;
                const mid = rows.length >> 1;
                ctx.save();
                ctx.translate(-p * 7, -p * 4);
                drawPalGrid(ctx, rows, 0, 2, px, { rowTo: mid, flash: age < 70 });
                ctx.restore();
                ctx.save();
                ctx.translate(p * 6, p * 5);
                drawPalGrid(ctx, rows, 0, 2, px, { rowFrom: mid, flash: age < 70 });
                ctx.restore();
            } else {
                const p = clamp((age - 60) / (ENEMY_POP_MS - 60), 0, 1);
                ctx.globalAlpha = 1 - p;
                ctx.translate(Math.min(6, age * 0.05), 0); // hit knock-back
                ctx.scale(1 - p * 0.45, 1 - p * 0.45);
                drawPalGrid(ctx, rows, 0, 2, px, { flash: age < 60 });
            }
            ctx.restore();

            if (age >= 0 && age < ENEMY_POP_MS + 120) {
                const a = clamp(1 - age / (ENEMY_POP_MS + 120), 0, 1);
                ctx.save();
                ctx.globalAlpha = a;
                if (meta.melee && age < 150) {
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(centre[0] - 13, centre[1] + 11);
                    ctx.lineTo(centre[0] + 13, centre[1] - 11);
                    ctx.stroke();
                }
                for (let k = 0; k < 6; k++) {
                    const ang = (k / 6) * Math.PI * 2 + e.i * 0.9;
                    const dist = 4 + age * 0.055;
                    ctx.fillStyle = meta.burst[k % meta.burst.length];
                    ctx.fillRect(Math.round(centre[0] + Math.cos(ang) * dist - 1.5), Math.round(centre[1] + Math.sin(ang) * dist - 1.5), 3, 3);
                }
                ctx.fillStyle = '#031E13';
                ctx.font = "700 9px 'Silkscreen', 'Press Start 2P', monospace";
                ctx.textAlign = 'center';
                ctx.fillText('+1', Math.round(centre[0]), Math.round(centre[1] - eh * 0.6 - age * 0.04));
                ctx.restore();
            }

            // hero-side attack visuals (ranged heroes only)
            if (!o.muzzle || meta.melee) continue;
            const m = o.muzzle;
            const tx = centre[0];
            const ty = centre[1];
            if (o.runnerId === 'specops') {
                const flashAge = o.T - (e.tKill - 190);
                if (flashAge >= 0 && flashAge < 80) {
                    ctx.fillStyle = '#F59E0B';
                    ctx.fillRect(Math.round(m[0]) + 1, Math.round(m[1]) - 3, 7, 6);
                    ctx.fillRect(Math.round(m[0]) + 3, Math.round(m[1]) - 5, 3, 10);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(Math.round(m[0]) + 2, Math.round(m[1]) - 1, 4, 2);
                }
                const p = (o.T - (e.tKill - 150)) / 150;
                if (p >= 0 && p <= 1) {
                    const hx = lerp(m[0], tx, p);
                    const hy = lerp(m[1], ty, p);
                    const tail = Math.max(0, p - 0.35);
                    ctx.strokeStyle = '#FDE047';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(lerp(m[0], tx, tail), lerp(m[1], ty, tail));
                    ctx.lineTo(hx, hy);
                    ctx.stroke();
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 3, 3);
                }
            } else if (o.runnerId === 'astro') {
                const p = (o.T - (e.tKill - 160)) / 160;
                if (p >= 0 && p <= 1.15) {
                    ctx.save();
                    ctx.globalAlpha = p > 1 ? 1 - (p - 1) / 0.15 : 1;
                    ctx.strokeStyle = '#38BDF8';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(m[0], m[1]);
                    ctx.lineTo(lerp(m[0], tx, Math.min(1, p * 1.3)), lerp(m[1], ty, Math.min(1, p * 1.3)));
                    ctx.stroke();
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                    ctx.restore();
                }
            } else if (o.runnerId === 'arcy') {
                const p = (o.T - (e.tKill - 260)) / 260;
                if (p >= 0 && p <= 1) {
                    const bx = lerp(m[0], tx, p);
                    const by = lerp(m[1], ty, p) - Math.sin(p * Math.PI) * 8;
                    ctx.fillStyle = '#031E13';
                    ctx.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 7, 7);
                    ctx.fillStyle = '#FDE047';
                    ctx.fillRect(Math.round(bx) - 2, Math.round(by) - 2, 5, 5);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2);
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = '#FDE047';
                    ctx.fillRect(Math.round(lerp(m[0], tx, Math.max(0, p - 0.12))) - 1, Math.round(lerp(m[1], ty, Math.max(0, p - 0.12)) - Math.sin(Math.max(0, p - 0.12) * Math.PI) * 8) - 1, 3, 3);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    function pxCircle(ctx, cx, cy, r, step = 2) {
        for (let dy = -r; dy <= r; dy += step) {
            const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
            ctx.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, step);
        }
    }

    let sceneCache = null;
    function getSceneData() {
        if (sceneCache) return sceneCache;
        const r = makeRng(7421);
        const stars = Array.from({ length: 30 }, () => ({
            x: Math.floor(r() * 346), y: Math.floor(r() * 190), s: r() > 0.7 ? 3 : 2,
            p: r() * 6, c: r() > 0.5 ? '#FFFFFF' : '#A5F3FC',
        }));
        const buildings = [];
        let bx = -6;
        while (bx < 346) {
            const w = 22 + Math.floor(r() * 18);
            buildings.push({ x: bx, w, h: 54 + Math.floor(r() * 70), seed: Math.floor(r() * 1000) });
            bx += w + 2;
        }
        sceneCache = { stars, buildings };
        return sceneCache;
    }

    /** Hero-specific backdrop around the globe: bamboo/moon, night city, deep space, or forest. */
    function drawScene(ctx, id, T, W, H) {
        const dark = 'rgba(3, 70, 40, 0.30)';
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (id === 'ninja') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
            pxCircle(ctx, 272, 52, 17);
            ctx.fillStyle = 'rgba(71, 227, 147, 0.5)';
            ctx.fillRect(264, 46, 5, 5);
            ctx.fillRect(276, 57, 6, 6);
            ctx.fillRect(271, 40, 3, 3);
            const stalks = [[10, 236], [27, 186], [45, 262], [304, 214], [321, 264], [338, 176]];
            for (const [sx, sh] of stalks) {
                const sway = Math.sin(T * 0.0012 + sx) * 2;
                for (let y = H; y > H - sh; y -= 22) {
                    const k = (H - y) / sh;
                    const x = Math.round(sx + sway * k);
                    ctx.fillStyle = dark;
                    ctx.fillRect(x, y - 20, 5, 20);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                    ctx.fillRect(x - 1, y - 21, 7, 2);
                }
                const topX = Math.round(sx + sway);
                ctx.fillStyle = dark;
                ctx.fillRect(topX + 5, H - sh - 6, 9, 3);
                ctx.fillRect(topX - 9, H - sh + 6, 9, 3);
                ctx.fillRect(topX + 5, H - sh + 18, 8, 3);
            }
            for (let i = 0; i < 5; i++) {
                const x = (i * 71 + T * (0.012 + i * 0.004)) % W;
                const y = (i * 53 + T * (0.03 + i * 0.006)) % H;
                ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
                ctx.fillRect(Math.round(x), Math.round(y), 4, 3);
            }
        } else if (id === 'specops') {
            const { buildings } = getSceneData();
            for (let k = 0; k < 2; k++) {
                const ox = k === 0 ? 30 : 316;
                const ang = -Math.PI / 2 + Math.sin(T * 0.0011 + k * 2.2) * 0.5;
                const spread = 0.085;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
                ctx.beginPath();
                ctx.moveTo(ox, H);
                ctx.lineTo(ox + Math.cos(ang - spread) * 320, H + Math.sin(ang - spread) * 320);
                ctx.lineTo(ox + Math.cos(ang + spread) * 320, H + Math.sin(ang + spread) * 320);
                ctx.closePath();
                ctx.fill();
            }
            for (const b of buildings) {
                ctx.fillStyle = dark;
                ctx.fillRect(b.x, H - b.h, b.w, b.h);
                for (let wy = H - b.h + 6; wy < H - 6; wy += 9) {
                    for (let wx = b.x + 4; wx < b.x + b.w - 5; wx += 7) {
                        const lit = ((wx * 7 + wy * 13 + b.seed + Math.floor(T / 700)) % 5) === 0;
                        if (lit) {
                            ctx.fillStyle = 'rgba(253, 224, 71, 0.6)';
                            ctx.fillRect(wx, wy, 3, 3);
                        }
                    }
                }
            }
        } else if (id === 'astro') {
            const { stars } = getSceneData();
            for (const s of stars) {
                const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(T * 0.004 + s.p));
                ctx.globalAlpha = a;
                ctx.fillStyle = s.c;
                ctx.fillRect(s.x, s.y, s.s, s.s);
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(56, 189, 248, 0.62)';
            pxCircle(ctx, 54, 66, 14);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(46, 58, 6, 4);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(54, 66, 25, 7, -0.35, 0, Math.PI * 2);
            ctx.stroke();
            const ax = 292 + Math.sin(T * 0.0007) * 6;
            const ay = 92 + Math.cos(T * 0.0009) * 4;
            ctx.fillStyle = dark;
            pxCircle(ctx, ax, ay, 9);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(Math.round(ax) - 4, Math.round(ay) - 3, 4, 3);
            ctx.fillStyle = dark;
            pxCircle(ctx, 318 - Math.sin(T * 0.001) * 4, 150, 5);
        } else if (id === 'arcy') {
            for (const side of [0, 1]) {
                const tx = side === 0 ? 26 : W - 26;
                ctx.fillStyle = dark;
                ctx.fillRect(tx - 5, H - 112, 10, 112);
                pxCircle(ctx, tx, H - 124, 28);
                pxCircle(ctx, tx + (side === 0 ? -18 : 18), H - 100, 20);
                pxCircle(ctx, tx + (side === 0 ? 20 : -20), H - 104, 20);
            }
            for (let i = 0; i < 8; i++) {
                const fx = 22 + ((i * 47) % 300) + Math.sin(T * 0.0009 + i) * 8;
                const fy = 40 + ((i * 37) % 170) + Math.cos(T * 0.0011 + i * 2) * 6;
                const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 0.005 + i * 1.7));
                ctx.globalAlpha = blink;
                ctx.fillStyle = '#FDE047';
                ctx.fillRect(Math.round(fx), Math.round(fy), 3, 3);
            }
            ctx.globalAlpha = 1;
            for (let i = 0; i < 4; i++) {
                const lx = (i * 97 + T * (0.014 + i * 0.003)) % W;
                const ly = (i * 61 + T * (0.022 + i * 0.005)) % H;
                ctx.fillStyle = 'rgba(22, 163, 74, 0.7)';
                ctx.fillRect(Math.round(lx), Math.round(ly), 5, 3);
                ctx.fillRect(Math.round(lx) + 1, Math.round(ly) - 1, 3, 1);
            }
        }
        ctx.restore();
    }

    function buildEffects(N, runnerId) {
        const r = makeRng(N * 131 + 29);
        const tl = getTimeline(N);
        const tier = milestoneTier(N);
        let cols = tier === 100
            ? ['#FDE047', '#FFFFFF', '#38BDF8', '#F59E0B', '#FB7185']
            : ['#FDE047', '#F59E0B', '#FFFFFF', '#6FF0AE'];
        if (tier === 0) {
            if (runnerId === 'ninja') cols = ['#EF4444', '#FFFFFF', '#A5F3FC', '#FDE047'];
            else if (runnerId === 'specops') cols = ['#47E393', '#4D7C0F', '#FDE047', '#FFFFFF'];
            else if (runnerId === 'astro') cols = ['#38BDF8', '#A5F3FC', '#FDE047', '#FFFFFF'];
        }
        const count = tier === 100 ? 28 : (tier === 50 ? 22 : 18);
        const sparkles = Array.from({ length: count }, (_, i) => ({
            a: (i / count) * Math.PI * 2 + (r() - 0.5) * 0.25,
            dist: (tier ? 58 : 48) + r() * (tier === 100 ? 105 : 82),
            sz: 4.5 + r() * (tier ? 6 : 4.5),
            col: cols[i % cols.length],
            star: i % 2 === 0,
            grav: tier ? 24 : 16,
        }));

        const mkSide = () => Array.from({ length: 16 }, (_, i) => ({
            a: (i / 16) * Math.PI * 2 + r() * 0.2,
            dist: 36 + r() * 68,
            sz: 4 + r() * 4.5,
            col: cols[i % cols.length],
            star: i % 2 === 1,
            grav: 28,
        }));

        const runDust = [];
        for (let t = tl.T_RUN_START + 60; t < tl.T_CROUCH - 60; t += 145) {
            let col = r() > 0.4 ? '#FFFFFF' : '#EAFBF2';
            let vTan = -(0.28 + r() * 0.25);
            let vRad = 10 + r() * 14;
            const sz = 3 + (r() > 0.5 ? 2 : 0);
            if (runnerId === 'ninja') {
                col = r() > 0.45 ? '#EF4444' : '#CBD5E1';
                vTan = -(0.36 + r() * 0.28);
            } else if (runnerId === 'specops') {
                col = r() > 0.72 ? '#FDE047' : (r() > 0.4 ? '#94A3B8' : '#4D7C0F');
                vRad = 8 + r() * 12;
            } else if (runnerId === 'astro') {
                col = r() > 0.45 ? '#38BDF8' : '#A5F3FC';
                vRad = 12 + r() * 16;
            }
            runDust.push({
                t0: t,
                life: 310 + r() * 90,
                vTan,
                vRad,
                sz,
                col,
            });
        }

        return {
            sparkles,
            specialVolleyL: mkSide(),
            specialVolleyR: mkSide(),
            runDust,
        };
    }

    // ---------------------------------------------------------------------------
    // 3. Scoped Styles Injection (Light-isolated Overlay + Onboarding Picker)
    // ---------------------------------------------------------------------------
    function ensureStyles() {
        if (typeof document === 'undefined' || !document.head) return;
        if (document.getElementById(STYLE_ELEMENT_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        style.textContent = `
            /* Onboarding Companion Picker Grid (Mint Neo-Brutalist cards) */
            .ha-sr-grid--onboarding {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                width: 100%;
            }
            .ha-sr-card--onboarding {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 7px;
                padding: 14px 10px 12px;
                border-radius: 20px;
                background: #FFFFFF;
                border: 2px solid #031E13;
                box-shadow: 0 3px 0 #031E13;
                color: #012D1D;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
                transition: background-color 0.14s ease-out, color 0.12s ease-out;
                min-width: 0;
            }
            .ha-sr-card--onboarding .ha-sr-avatar {
                width: 58px;
                height: 54px;
                border-radius: 14px;
                background: #EAFBF2;
                border: 1.5px solid rgba(3, 30, 19, 0.18);
                display: grid;
                place-items: center;
                flex: none;
            }
            .ha-sr-card--onboarding canvas {
                width: 51px;
                height: 48px;
                display: block;
                image-rendering: pixelated;
            }
            .ha-sr-card--onboarding .ha-sr-name {
                font-family: 'Hanken Grotesk', sans-serif;
                font-size: 14.5px;
                font-weight: 700;
                line-height: 1.15;
                color: #012D1D;
            }
            .ha-sr-card--onboarding .ha-sr-sub {
                font-family: 'Geist', sans-serif;
                font-size: 11px;
                font-weight: 500;
                line-height: 1.2;
                color: rgba(1, 45, 29, 0.72);
            }
            .ha-sr-card--onboarding .ha-sr-check {
                position: absolute;
                top: 9px;
                right: 9px;
                width: 22px;
                height: 22px;
                border-radius: 9999px;
                background: #47E393;
                color: #012D1D;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transform: scale(0.7);
                transition: opacity 0.12s ease-out, transform 0.15s cubic-bezier(0.34, 1.45, 0.64, 1);
            }
            .ha-sr-card--onboarding.is-selected {
                background: #0D1612;
                color: #FFFFFF;
            }
            .ha-sr-card--onboarding.is-selected .ha-sr-avatar {
                background: rgba(71, 227, 147, 0.16);
                border-color: #47E393;
            }
            .ha-sr-card--onboarding.is-selected .ha-sr-name {
                color: #47E393;
            }
            .ha-sr-card--onboarding.is-selected .ha-sr-sub {
                color: rgba(255, 255, 255, 0.78);
            }
            .ha-sr-card--onboarding.is-selected .ha-sr-check {
                opacity: 1;
                transform: scale(1);
            }

            /* Settings Companion Picker Avatar Tile */
            .ha-sr-settings-avatar {
                width: 56px;
                height: 52px;
                border-radius: 12px;
                background: #EAFBF2;
                border: 1.5px solid #031E13;
                display: grid;
                place-items: center;
                flex: none;
            }
            .ha-sr-settings-avatar canvas {
                width: 51px;
                height: 48px;
                display: block;
                image-rendering: pixelated;
            }

            /* Full-Screen Globe Runner Celebration Overlay (Isolated Light-Mint Palette) */
            .ha-sr-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                background: rgba(3, 30, 19, 0.72);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                opacity: 0;
                transition: opacity 0.22s ease;
                color-scheme: light;
            }
            .ha-sr-overlay.is-open {
                opacity: 1;
            }
            .ha-sr-stage {
                position: relative;
                width: 100%;
                max-width: 416px;
                max-height: min(850px, 94dvh);
                border-radius: 34px;
                border: 3px solid #031E13;
                box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
                overflow-x: hidden;
                overflow-y: auto;
                overscroll-behavior: contain;
                background: #47E393;
                color: #012D1D;
                isolation: isolate;
                transform: translateY(12px) scale(0.97);
                transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
            }
            .ha-sr-overlay.is-open .ha-sr-stage {
                transform: translateY(0) scale(1);
            }
            .ha-sr-shell {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                padding: 20px 18px 20px;
                will-change: transform;
            }
            .ha-sr-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                position: relative;
                z-index: 20;
                flex: none;
            }
            .ha-sr-brand {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                font-family: 'Space Grotesk', 'Hanken Grotesk', sans-serif;
                font-size: 18px;
                font-weight: 800;
                line-height: 1;
                letter-spacing: -0.02em;
                color: #012D1D;
            }
            .ha-sr-header-right {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .ha-sr-sound-btn {
                width: 32px;
                height: 32px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.85);
                border: 2px solid #031E13;
                box-shadow: 0 2px 0 #031E13;
                color: #012D1D;
                display: grid;
                place-items: center;
                cursor: pointer;
            }
            .ha-sr-sound-btn.is-on {
                background: #FDE047;
            }
            .ha-sr-streak-pill {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 7px 12px;
                border-radius: 999px;
                background: #FFFFFF;
                border: 2px solid #031E13;
                box-shadow: 0 2.5px 0 #031E13;
                font-family: 'Geist', 'Hanken Grotesk', sans-serif;
                font-size: 12px;
                font-weight: 800;
                line-height: 1;
                color: #012D1D;
                transition: background-color 0.22s ease;
            }
            .ha-sr-streak-pill.is-amber {
                background: #F59E0B;
                color: #031E13;
            }
            .ha-sr-canvas-wrap {
                position: relative;
                width: min(346px, 100%);
                aspect-ratio: 346 / 298;
                margin: 6px auto 0;
                flex: none;
                z-index: 6;
            }
            .ha-sr-canvas {
                width: 100%;
                height: 100%;
                display: block;
                pointer-events: none;
            }
            .ha-sr-counter-block {
                text-align: center;
                position: relative;
                z-index: 15;
                margin-top: 4px;
                flex: none;
            }
            .ha-sr-counter-num-wrap {
                position: relative;
                height: 76px;
            }
            .ha-sr-counter-num {
                position: absolute;
                left: 0;
                right: 0;
                top: 0;
                font-family: 'Space Grotesk', 'Hanken Grotesk', sans-serif;
                font-size: clamp(64px, 14vw, 82px);
                font-weight: 800;
                line-height: 76px;
                letter-spacing: -3px;
            }
            .ha-sr-counter-old {
                color: rgba(1, 45, 29, 0.22);
            }
            .ha-sr-counter-new span {
                display: inline-block;
                color: #012D1D;
                text-shadow: 0 3px 0 rgba(255, 255, 255, 0.35);
                padding: 0 8px;
                transform-origin: 50% 88%;
            }
            .ha-sr-counter-new.milestone-gold span {
                color: #031E13;
                text-shadow: 0 4px 0 #FDE047;
            }
            .ha-sr-counter-label {
                margin-top: 2px;
                font-family: 'Space Grotesk', 'Hanken Grotesk', sans-serif;
                font-size: 21px;
                font-weight: 800;
                line-height: 1.15;
                letter-spacing: -0.3px;
                color: #012D1D;
            }
            .ha-sr-lower {
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                margin-top: 10px;
                position: relative;
                z-index: 15;
            }
            .ha-sr-bento {
                background: #FFFDF7;
                border: 2.5px solid #031E13;
                border-radius: 24px;
                box-shadow: 4px 5px 0 #031E13;
                padding: 13px 14px 14px;
            }
            .ha-sr-bento-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 11px;
            }
            .ha-sr-bento-title-wrap {
                display: inline-flex;
                align-items: center;
                gap: 7px;
            }
            .ha-sr-bento-dot {
                width: 22px;
                height: 22px;
                border-radius: 7px;
                background: #0D1612;
                color: #47E393;
                display: grid;
                place-items: center;
            }
            .ha-sr-bento-title {
                font-family: 'Geist', 'Hanken Grotesk', sans-serif;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.08em;
                color: #012D1D;
            }
            .ha-sr-cap-grid {
                display: grid;
                grid-template-columns: repeat(7, minmax(0, 1fr));
                gap: 6px;
            }
            .ha-sr-cap {
                height: 58px;
                border-radius: 13px;
                background: #EFF6F2;
                border: 1.5px solid rgba(3, 30, 19, 0.09);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                padding: 7px 0 8px;
                color: rgba(1, 45, 29, 0.44);
                transition: transform 0.28s cubic-bezier(.34,1.65,.64,1), background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .ha-sr-cap-day {
                font-family: 'Geist', 'Hanken Grotesk', sans-serif;
                font-size: 10.5px;
                font-weight: 800;
                line-height: 1;
            }
            .ha-sr-cap-ico {
                width: 22px;
                height: 22px;
                border-radius: 7px;
                display: grid;
                place-items: center;
            }
            .ha-sr-cap.done {
                background: #47E393;
                border: 2px solid #031E13;
                box-shadow: 0 2.5px 0 #031E13;
                color: #012D1D;
            }
            .ha-sr-cap.done .ha-sr-cap-ico {
                background: #0D1612;
                color: #47E393;
            }
            .ha-sr-cap.today-wait {
                background: #FFFDF7;
                border: 2px dashed #031E13;
                color: #012D1D;
            }
            .ha-sr-cap.today-wait .ha-sr-cap-ico {
                border: 1.5px dashed rgba(3, 30, 19, 0.3);
                color: transparent;
            }
            .ha-sr-cap.today-lit {
                background: linear-gradient(180deg, #FDE047 0%, #F59E0B 100%);
                border: 2.2px solid #031E13;
                box-shadow: 0 4px 0 #031E13;
                color: #031E13;
                transform: translateY(-3px);
            }
            .ha-sr-cap.today-lit .ha-sr-cap-ico {
                background: #0D1612;
                color: #FDE047;
            }
            .ha-sr-cap.future .ha-sr-cap-ico {
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: rgba(1, 45, 29, 0.16);
                margin-bottom: 7px;
            }
            .ha-sr-cta {
                width: 100%;
                height: 54px;
                flex: none;
                margin-top: 12px;
                padding: 0 8px 0 20px;
                border: 2.5px solid #031E13;
                border-radius: 17px;
                background: #0D1612;
                color: #FFFFFF;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-family: 'Geist', 'Hanken Grotesk', sans-serif;
                font-size: 15.5px;
                font-weight: 800;
                line-height: 1;
                letter-spacing: 0.02em;
                box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.14), 0 4.5px 0 #031E13;
                cursor: pointer;
                z-index: 20;
                transition: transform 0.09s ease, box-shadow 0.09s ease;
            }
            .ha-sr-cta-arrow {
                width: 38px;
                height: 38px;
                border-radius: 11px;
                background: #47E393;
                color: #031E13;
                display: grid;
                place-items: center;
            }
            .ha-sr-cta.royal .ha-sr-cta-arrow {
                background: #FDE047;
            }
            .ha-sr-cta:active {
                transform: translateY(3px);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 1px 0 #031E13;
            }

            @media (max-height: 740px) {
                .ha-sr-shell {
                    height: auto;
                    min-height: 100%;
                    padding: 14px 16px 16px;
                }
                .ha-sr-canvas-wrap {
                    width: min(270px, 36dvh, 100%);
                    margin-top: 4px;
                }
                .ha-sr-counter-num-wrap {
                    height: 58px;
                }
                .ha-sr-counter-num {
                    font-size: clamp(46px, 11vw, 64px);
                    line-height: 58px;
                }
                .ha-sr-counter-label {
                    font-size: 18px;
                }
                .ha-sr-cap {
                    height: 48px;
                    padding: 6px 0;
                }
                .ha-sr-cta {
                    height: 48px;
                    margin-top: 10px;
                }
            }
            @media (max-width: 520px) {
                .ha-sr-overlay {
                    padding: 0;
                    background: #47E393;
                    backdrop-filter: none;
                }
                .ha-sr-stage {
                    max-width: none;
                    height: 100dvh;
                    max-height: none;
                    border-radius: 0;
                    border: 0;
                    box-shadow: none;
                }
                .ha-sr-shell {
                    max-width: 420px;
                    margin: 0 auto;
                    padding: max(18px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom));
                    justify-content: space-between;
                }
            }
            @media (max-width: 359px) {
                .ha-sr-shell {
                    padding-inline: 12px;
                }
                .ha-sr-brand {
                    font-size: 16px;
                }
                .ha-sr-streak-pill {
                    padding: 6px 9px;
                    font-size: 11px;
                }
                .ha-sr-bento {
                    padding: 11px 10px 12px;
                }
                .ha-sr-cap-grid {
                    gap: 4px;
                }
                .ha-sr-cap-day {
                    font-size: 9.5px;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .ha-sr-overlay,
                .ha-sr-stage,
                .ha-sr-cap {
                    transition-duration: 0.01ms !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------------
    // 4. Shared Live Mini Companion Picker Engine
    // ---------------------------------------------------------------------------
    const pickerInstances = new Set();
    let pickerRafId = null;

    function drawMiniSprite(cv, id, now) {
        const spr = RUNNERS[id];
        if (!spr) return;
        const cx = cv.getContext('2d');
        if (!cx) return;
        const reduced = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cx.imageSmoothingEnabled = false;
        cx.clearRect(0, 0, cv.width, cv.height);
        const phase = reduced ? 0 : (now / 145) % 2;
        const step = Math.floor(phase) % 2;
        const pngPose = step === 0 ? 'run0' : 'run1';
        const pngEntry = getSpriteEntry(id, pngPose);
        if (pngEntry) {
            const bob = reduced ? 0 : Math.round(Math.abs(Math.sin(phase * Math.PI)) * (cv.height * 0.04));
            const targetH = cv.height * 0.84;
            const scale = getSpriteScale(id, targetH);
            const strideSq = reduced ? 0 : Math.sin(phase * Math.PI);
            drawSpriteImage(cx, pngEntry, Math.floor(cv.width / 2), (cv.height - 4) - bob, scale, {
                squashX: 1 - strideSq * 0.03,
                squashY: 1 + strideSq * 0.03,
            });
            return;
        }
        const st = reduced ? 0 : Math.floor(now / 95) % 4;
        const frame = [spr.run0, spr.run1, spr.run2, spr.run1][st];
        const ratio = Math.max(1, cv.height / 32);
        const bob = reduced ? 0 : (st % 2 === 0 ? -ratio : 0);
        const mPx = (spr.miniPx || 1) * ratio;
        const mCx = Math.floor(cv.width / 2);
        const mBy = (cv.height - 2 * ratio) + bob;
        drawBitmap(cx, frame, mCx, mBy, mPx);
    }

    function tickPickers(now) {
        let activeCount = 0;
        for (const container of Array.from(pickerInstances)) {
            if (!container || !container.isConnected) {
                pickerInstances.delete(container);
                continue;
            }
            activeCount += 1;
            container.querySelectorAll('canvas[data-ha-mini]').forEach((cv) => {
                drawMiniSprite(cv, cv.dataset.haMini, now);
            });
        }
        if (activeCount > 0) {
            pickerRafId = window.requestAnimationFrame(tickPickers);
        } else {
            pickerRafId = null;
        }
    }

    function syncPickerSelection(container, selectedId) {
        if (!container) return;
        const activeId = normalizeCompanionId(selectedId);
        const variant = container.dataset.haPickerVariant || 'onboarding';
        container.querySelectorAll('[data-companion-id]').forEach((btn) => {
            const isMatch = btn.dataset.companionId === activeId;
            btn.setAttribute('aria-pressed', String(isMatch));
            if (variant === 'settings') {
                btn.classList.toggle('border-primary', isMatch);
                btn.classList.toggle('bg-primary/[0.06]', isMatch);
                btn.classList.toggle('border-outline-variant/30', !isMatch);
                btn.classList.toggle('bg-surface-container-low', !isMatch);
            } else {
                btn.classList.toggle('is-selected', isMatch);
            }
        });
    }

    function mountPicker(container, options = {}) {
        if (!container || typeof document === 'undefined') return null;
        ensureStyles();
        warmSprites();

        const variant = options.variant === 'settings' ? 'settings' : 'onboarding';
        let selected = normalizeCompanionId(options.selected);
        const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;

        container.dataset.haPickerVariant = variant;
        if (variant === 'settings') {
            container.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    ${COMPANIONS.map((c) => `
                        <button type="button" data-companion-id="${c.id}" aria-pressed="${c.id === selected}"
                            class="btn-press p-3.5 rounded-2xl border-2 text-center flex flex-col items-center gap-2 cursor-pointer transition-all ${c.id === selected ? 'border-primary bg-primary/[0.06]' : 'border-outline-variant/30 bg-surface-container-low'}">
                            <span class="ha-sr-settings-avatar" aria-hidden="true">
                                <canvas width="102" height="96" data-ha-mini="${c.id}"></canvas>
                            </span>
                            <span>
                                <strong class="block font-headline-md text-xs sm:text-sm font-bold text-on-surface">${c.name}</strong>
                                <span class="block text-[11px] font-medium text-on-surface-variant mt-0.5">${c.finale}</span>
                            </span>
                        </button>
                    `).join('')}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="ha-sr-grid--onboarding">
                    ${COMPANIONS.map((c) => `
                        <button type="button" data-companion-id="${c.id}" aria-pressed="${c.id === selected}"
                            class="ha-sr-card--onboarding btn-press${c.id === selected ? ' is-selected' : ''}">
                            <span class="ha-sr-check" aria-hidden="true">
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                    <path d="M3.2 8.5 L6.5 11.8 L12.8 4.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                            <span class="ha-sr-avatar" aria-hidden="true">
                                <canvas width="102" height="96" data-ha-mini="${c.id}"></canvas>
                            </span>
                            <span class="ha-sr-name">${c.name}</span>
                            <span class="ha-sr-sub">${c.finale}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }

        container.querySelectorAll('[data-companion-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selected = normalizeCompanionId(btn.dataset.companionId);
                syncPickerSelection(container, selected);
                if (onSelect) onSelect(selected);
            });
        });

        pickerInstances.add(container);
        container.querySelectorAll('canvas[data-ha-mini]').forEach((cv) => drawMiniSprite(cv, cv.dataset.haMini, 0));
        if (pickerRafId === null && typeof window.requestAnimationFrame === 'function') {
            pickerRafId = window.requestAnimationFrame(tickPickers);
        }

        return {
            setSelected(nextId) {
                selected = normalizeCompanionId(nextId);
                syncPickerSelection(container, selected);
            },
            getSelected() {
                return selected;
            },
        };
    }

    function stopPickers() {
        pickerInstances.clear();
        if (pickerRafId !== null && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(pickerRafId);
            pickerRafId = null;
        }
    }

    // ---------------------------------------------------------------------------
    // 5. Full-Screen Globe Runner Celebration Overlay
    // ---------------------------------------------------------------------------
    let activeOverlay = null;
    let activeAudioCtx = null;

    function getSoundEnabled() {
        try {
            return window.localStorage?.getItem(SOUND_PREF_KEY) === '1';
        } catch {
            return false;
        }
    }

    function setSoundEnabled(next) {
        try {
            window.localStorage?.setItem(SOUND_PREF_KEY, next ? '1' : '0');
        } catch {
            // Optional preference storage.
        }
    }

    function playCelebrationAudio(N, tier) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return () => {};
        if (!activeAudioCtx) activeAudioCtx = new AudioCtor();
        if (activeAudioCtx.state === 'suspended') {
            void activeAudioCtx.resume().catch(() => {});
        }
        const master = activeAudioCtx.createGain();
        master.gain.value = 0.72;
        master.connect(activeAudioCtx.destination);

        const note = (at, freq, dur, type = 'triangle', gain = 0.07, to = null) => {
            const o = activeAudioCtx.createOscillator();
            const g = activeAudioCtx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, at);
            if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
            g.gain.setValueAtTime(0.001, at);
            g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
            g.gain.exponentialRampToValueAtTime(0.001, at + dur);
            o.connect(g);
            g.connect(master);
            o.start(at);
            o.stop(at + dur + 0.02);
        };

        const base = activeAudioCtx.currentTime + 0.02;
        const s = (ms) => base + ms / 1000;
        const tl = getTimeline(N);
        for (let t = tl.T_RUN_START + 80; t < tl.T_CROUCH - 80; t += 145) {
            note(s(t), 185, 0.04, 'triangle', 0.036, 120);
        }
        note(s(tl.T_LEAP_START), 340, 0.14, 'square', 0.035, 760);
        note(s(tl.T_IMPACT), 125, 0.24, 'sine', 0.24, 52);
        const fanfare = tier === 100
            ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
            : tier === 50
                ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
                : [523.25, 659.25, 783.99, 1046.5];
        fanfare.forEach((f, i) => note(s(tl.T_IMPACT + i * 50), f, 0.28, 'triangle', 0.075));
        note(s(tl.T_SLAM), 205, 0.12, 'triangle', 0.14, 75);

        return () => {
            try {
                master.disconnect();
            } catch {
                // Already disconnected.
            }
        };
    }

    function getHabitArcStore() {
        if (typeof window !== 'undefined' && window.HabitArc) return window.HabitArc;
        if (typeof HabitArc !== 'undefined') return HabitArc;
        return null;
    }

    function computeWeekDoneMask(streak) {
        const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const now = new Date();
        const todayIdx = (now.getDay() + 6) % 7;
        const habits = getHabitArcStore()?.getHabits?.();

        if (!Array.isArray(habits) || habits.length === 0) {
            const startIdx = Math.max(0, todayIdx - Math.max(0, (streak || 1) - 1));
            return dayNames.map((_, i) => i >= startIdx && i < todayIdx);
        }

        return dayNames.map((dayName, idx) => {
            if (idx >= todayIdx) return false;
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (todayIdx - idx));
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const scheduled = habits.filter((h) => dateStr >= h.createdAt && (!h.repeat || h.repeat.includes(dayName)));
            if (scheduled.length > 0) {
                return scheduled.every((h) => h.completions && h.completions[dateStr]);
            }
            const daysBack = todayIdx - idx;
            return (streak || 0) > daysBack;
        });
    }

    function closeActiveCelebration() {
        if (!activeOverlay) return;
        const current = activeOverlay;
        activeOverlay = null;
        if (current.rafId !== null) window.cancelAnimationFrame(current.rafId);
        if (typeof current.stopSound === 'function') current.stopSound();
        document.removeEventListener('keydown', current.onKeyDown);
        current.overlay.classList.remove('is-open');
        const finalize = () => {
            current.overlay.remove();
            if (current.restoreFocus && typeof current.restoreFocus.focus === 'function' && current.restoreFocus.isConnected) {
                current.restoreFocus.focus({ preventScroll: true });
            }
            if (typeof current.onClose === 'function') current.onClose();
        };
        window.setTimeout(finalize, 180);
    }

    function celebrate(options = {}) {
        if (typeof document === 'undefined' || !document.body) return null;
        warmSprites();
        ensureStyles();
        if (activeOverlay) closeActiveCelebration();

        const N = clamp(Math.round(Number(options.streak) || 1), 1, 999);
        const runnerId = normalizeCompanionId(
            options.runnerId || getHabitArcStore()?.getSettings?.()?.companion
        );
        const loot = getHabitArcStore()?.getSettings?.()?.treasureRoom;
        const equipped = loot?.runnerId === runnerId && Array.isArray(loot.opened) && loot.opened.includes(loot.equipped)
            ? loot.equipped : null;
        const tier = milestoneTier(N);
        const tl = getTimeline(N);
        const fx = buildEffects(N, runnerId);
        const encounters = planEncounters(N, runnerId);
        const weekDoneMask = Array.isArray(options.weekDoneMask) && options.weekDoneMask.length === 7
            ? options.weekDoneMask
            : computeWeekDoneMask(N);
        const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        const todayIdx = (new Date().getDay() + 6) % 7;
        const reducedMotion = !options.forceAnimate
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const overlay = document.createElement('div');
        overlay.className = 'ha-sr-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'ha-sr-counter-lbl');

        overlay.innerHTML = `
            <div class="ha-sr-stage">
                <div class="ha-sr-shell" id="haSrShell">
                    <div class="ha-sr-header">
                        <div class="ha-sr-brand">
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M3.5 17L9.2 11.4L13 14.2L19.5 6.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M15.4 6.5H19.5V10.6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span>HabitArc</span>
                        </div>
                        <div class="ha-sr-header-right">
                            <button type="button" class="ha-sr-sound-btn" id="haSrSoundBtn" aria-label="Toggle celebration sound" title="Toggle sound">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                </svg>
                            </button>
                            <div class="ha-sr-streak-pill" id="haSrPill">DAY COMPLETE ✓</div>
                        </div>
                    </div>

                    <div class="ha-sr-canvas-wrap">
                        <canvas class="ha-sr-canvas" id="haSrCanvas"></canvas>
                    </div>

                    <div class="ha-sr-counter-block">
                        <div class="ha-sr-counter-num-wrap">
                            <div class="ha-sr-counter-num ha-sr-counter-old" id="haSrNumOld">${Math.max(0, N - 1)}</div>
                            <div class="ha-sr-counter-num ha-sr-counter-new${tier > 0 ? ' milestone-gold' : ''}" id="haSrNumNewWrap"><span id="haSrNumNew">${N}</span></div>
                        </div>
                        <div class="ha-sr-counter-label" id="ha-sr-counter-lbl">${N === 1 ? 'Day 1 Started' : 'Day Streak'}</div>
                    </div>

                    <div class="ha-sr-lower">
                        <div class="ha-sr-bento" id="haSrBento">
                            <div class="ha-sr-bento-head">
                                <span class="ha-sr-bento-title-wrap">
                                    <span class="ha-sr-bento-dot" aria-hidden="true">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                            <path d="M4 17l5.5-5.5 3.5 3.5L20 7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </span>
                                    <span class="ha-sr-bento-title">THIS WEEK</span>
                                </span>
                            </div>
                            <div class="ha-sr-cap-grid">
                                ${days.map((d, i) => {
                                    const isPastDone = i < todayIdx && Boolean(weekDoneMask[i]);
                                    const isToday = i === todayIdx;
                                    const cls = isPastDone ? 'done' : (isToday ? 'today-wait' : 'future');
                                    return `
                                        <div class="ha-sr-cap ${cls}" id="haSrDay-${i}">
                                            <span class="ha-sr-cap-day">${d}</span>
                                            <span class="ha-sr-cap-ico" aria-hidden="true">
                                                ${(isPastDone || isToday)
                                                    ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.2 8.5 L6.5 11.8 L12.8 4.5" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                                                    : ''}
                                            </span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <button type="button" class="ha-sr-cta${tier > 0 ? ' royal' : ''}" id="haSrCtaBtn">
                            <span>Continue</span>
                            <span class="ha-sr-cta-arrow" aria-hidden="true">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const CW = 346;
        const CH = 298;
        const heroCanvas = overlay.querySelector('#haSrCanvas');
        const hctx = heroCanvas.getContext('2d');
        const shell = overlay.querySelector('#haSrShell');
        const pill = overlay.querySelector('#haSrPill');
        const oldEl = overlay.querySelector('#haSrNumOld');
        const newEl = overlay.querySelector('#haSrNumNew');
        const todayEl = overlay.querySelector(`#haSrDay-${todayIdx}`);
        const card = overlay.querySelector('#haSrBento');
        const ctaBtn = overlay.querySelector('#haSrCtaBtn');
        const soundBtn = overlay.querySelector('#haSrSoundBtn');

        const dpr = Math.min(3, window.devicePixelRatio || 1);
        heroCanvas.width = Math.round(CW * dpr);
        heroCanvas.height = Math.round(CH * dpr);
        hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        hctx.imageSmoothingEnabled = false;

        let soundOn = typeof options.soundOn === 'boolean' ? options.soundOn : getSoundEnabled();
        let stopSound = () => {};
        const syncSoundUI = () => {
            soundBtn.classList.toggle('is-on', soundOn);
            soundBtn.setAttribute('aria-pressed', String(soundOn));
        };
        syncSoundUI();

        const startTime = performance.now();
        if (soundOn && !reducedMotion) {
            stopSound = playCelebrationAudio(N, tier);
        }

        function renderAt(T) {
            const { T_RUN_START, T_CROUCH, T_LEAP_START, T_IMPACT, T_SLAM, T_LOWER } = tl;

            if (!reducedMotion && T >= T_IMPACT && T < T_IMPACT + (tier ? 340 : 230)) {
                const dur = tier ? 340 : 230;
                const p = (T - T_IMPACT) / dur;
                const amp = (tier === 100 ? 8 : tier === 50 ? 6.5 : 5) * (1 - p) * (1 - p);
                shell.style.transform = `translate(${(Math.sin(T * 0.16) * amp).toFixed(1)}px, ${(Math.cos(T * 0.21) * amp).toFixed(1)}px)`;
            } else {
                shell.style.transform = 'translate(0px, 0px)';
            }

            pill.classList.remove('is-amber');
            if (T >= T_IMPACT) {
                pill.textContent = `🔥 ${N}D STREAK`;
                pill.classList.add('is-amber');
            } else {
                pill.textContent = 'DAY COMPLETE ✓';
            }

            hctx.clearRect(0, 0, CW, CH);
            hctx.imageSmoothingEnabled = false;

            const GX = CW / 2;
            const GY = 180;
            const GR = 84;
            drawScene(hctx, runnerId, T, CW, CH);
            const runDur = Math.max(1, T_CROUCH - T_RUN_START);
            const runFrac = clamp((T - T_RUN_START) / runDur, 0, 1);
            const totalRunFrac = clamp((T - T_RUN_START) / Math.max(1, T_IMPACT - T_RUN_START), 0, 1);

            if (tier > 0 && T >= T_IMPACT) {
                const rayA = clamp((T - T_IMPACT) / 420, 0, 1);
                const numRays = tier === 100 ? 14 : 10;
                hctx.save();
                hctx.translate(GX, GY);
                hctx.rotate(T * (tier === 100 ? 0.0005 : 0.0003));
                hctx.globalAlpha = rayA * (tier === 100 ? 0.42 : 0.30);
                hctx.fillStyle = '#FDE047';
                for (let i = 0; i < numRays; i++) {
                    hctx.rotate((Math.PI * 2) / numRays);
                    hctx.beginPath();
                    hctx.moveTo(0, 0);
                    hctx.lineTo(-14, -142);
                    hctx.lineTo(14, -142);
                    hctx.closePath();
                    hctx.fill();
                }
                hctx.restore();

                if (tier === 100) {
                    hctx.save();
                    hctx.globalAlpha = rayA;
                    hctx.strokeStyle = '#031E13';
                    hctx.lineWidth = 6.5;
                    hctx.beginPath();
                    hctx.arc(GX, GY, GR + 11, 0, Math.PI * 2);
                    hctx.stroke();
                    hctx.strokeStyle = '#FDE047';
                    hctx.lineWidth = 3.2;
                    hctx.beginPath();
                    hctx.arc(GX, GY, GR + 11, 0, Math.PI * 2);
                    hctx.stroke();
                    for (let s = 0; s < 3; s++) {
                        const sa = T * 0.002 + (s * Math.PI * 2) / 3;
                        const sx = GX + Math.cos(sa) * (GR + 11);
                        const sy = GY + Math.sin(sa) * (GR + 11);
                        hctx.fillStyle = '#FFFFFF';
                        hctx.strokeStyle = '#031E13';
                        hctx.lineWidth = 2;
                        hctx.beginPath();
                        hctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
                        hctx.fill();
                        hctx.stroke();
                    }
                    hctx.restore();
                }
            }

            const spinCycles = N <= 1 ? 1.15 : (N <= 6 ? 1.8 : 3.5);
            let spin = (N * 0.5) + easeInOutCubic(totalRunFrac) * (Math.PI * spinCycles);
            if (T > T_IMPACT) spin += (T - T_IMPACT) * 0.00022;
            else spin += T * 0.00018;

            const flash = T >= T_IMPACT ? Math.max(0, 1 - (T - T_IMPACT) / 260) : 0;
            renderCleanGlobe(spin, T * 0.00038, flash);
            hctx.drawImage(globeBuf, Math.round(GX - GLOBE_RES), Math.round(GY - GLOBE_RES), GLOBE_RES * 2, GLOBE_RES * 2);

            const clearedCount = Math.min(2, Math.max(0, N - 1));
            for (let m = 0; m < clearedCount; m++) {
                const dayNum = (N - clearedCount) + m;
                const startF = clearedCount === 1 ? 0.16 : (m === 0 ? 0.0 : 0.34);
                const frac = (runFrac - startF) / 0.62;
                if (frac >= 0 && frac <= 1) {
                    drawMiniMarker(hctx, GX, GY, GR, lerp(1.02, -1.02, frac), dayNum);
                }
            }

            const spr = RUNNERS[runnerId] || RUNNERS.arcy;
            const sPx = spr.px || 1.5;
            const gearScale = sPx / 1.5;
            const hasPng = !!getSpriteEntry(runnerId, 'run0');
            const pngScale = hasPng ? getSpriteScale(runnerId, 36) : 0;
            const encOn = hasPng && !reducedMotion && encounters.length > 0;
            let poseName = 'run0';
            let squashX = 1;
            let squashY = 1;
            let aAng = -0.46;
            let aLift = 0;
            let aGrid = spr.run0;
            let aSpin = 0;
            let aTilt = 0;
            let bodyAlpha = 1;
            let recoilX = 0;
            let phaseNow = 'run';
            let showJet = false;
            let superJet = false;
            let ninjaSmokeP = -1;
            let ninjaShurikenP = -1;
            let ninjaBlink = false;
            let ninjaSlashP = -1;
            let specopsFireBurst = -1;
            let astroBeamP = -1;
            let showDrone = false;

            if (T < T_RUN_START) {
                aAng = -0.46;
                aLift = Math.abs(Math.sin(T * 0.015)) * 2.5;
                poseName = 'run0';
            } else if (T < T_CROUCH) {
                aAng = lerp(-0.46, -0.18, easeInOutCubic(runFrac));
                if (hasPng) {
                    const cadence = runnerId === 'ninja' ? 82 : (runnerId === 'specops' ? 104 : (runnerId === 'astro' ? 115 : 94));
                    const rawStep = (T - T_RUN_START) / cadence;
                    const stepIdx = Math.floor(rawStep) % 2;
                    const strideArc = Math.sin((rawStep % 1) * Math.PI);
                    poseName = stepIdx === 0 ? 'run0' : 'run1';
                    aGrid = stepIdx === 0 ? spr.run0 : spr.run1;
                    if (runnerId === 'ninja') {
                        aTilt = 0.16 + 0.04 * strideArc;
                        aLift = strideArc * 3.8;
                    } else if (runnerId === 'astro') {
                        const bound = Math.abs(Math.sin(runFrac * Math.PI * (N <= 2 ? 3 : 5)));
                        aLift = bound * 12;
                        aTilt = 0.08;
                        showJet = bound > 0.35;
                        poseName = bound > 0.42 ? 'run1' : 'run0';
                    } else if (runnerId === 'specops') {
                        aTilt = 0.09 + 0.05 * strideArc;
                        aLift = strideArc * 4.5;
                        squashX = strideArc < 0.2 ? 1.04 : 0.98;
                        squashY = strideArc < 0.2 ? 0.96 : 1.02;
                    } else {
                        aTilt = 0.08 + 0.04 * strideArc;
                        aLift = strideArc * 4.2;
                        squashX = strideArc < 0.2 ? 1.04 : 0.98;
                        squashY = strideArc < 0.2 ? 0.96 : 1.02;
                    }
                } else {
                    const cadence = runnerId === 'specops' ? 105 : (runnerId === 'ninja' ? 58 : 74);
                    const st = Math.floor((T - T_RUN_START) / cadence) % 4;
                    aGrid = [spr.run0, spr.run1, spr.run2, spr.run1][st];
                    if (runnerId === 'ninja') {
                        aTilt = 0.16;
                        aLift = st % 2 === 0 ? 1.5 : 0;
                    } else if (runnerId === 'astro') {
                        const bound = Math.abs(Math.sin(runFrac * Math.PI * (N <= 2 ? 3 : 5)));
                        aLift = bound * 12;
                        showJet = bound > 0.35;
                    } else if (runnerId === 'specops') {
                        aLift = st % 2 === 0 ? 3 : 0;
                    } else {
                        aLift = st % 2 === 0 ? 2 : 0;
                    }
                }
            } else if (T < T_IMPACT) {
                const fp = (T - T_CROUCH) / Math.max(1, T_IMPACT - T_CROUCH);

                if (runnerId === 'arcy') {
                    if (T < T_LEAP_START) {
                        aAng = -0.18;
                        poseName = 'run0';
                        aGrid = spr.crouch;
                        phaseNow = 'jump';
                        squashX = 1.12;
                        squashY = 0.84;
                        aTilt = -0.09;
                    } else {
                        const jp = (T - T_LEAP_START) / Math.max(1, T_IMPACT - T_LEAP_START);
                        aAng = lerp(-0.18, -0.13, jp);
                        poseName = 'flip';
                        aGrid = spr.jump;
                        phaseNow = 'jump';
                        aLift = (tier ? 48 : 38) * Math.sin(jp * Math.PI);
                        aSpin = -jp * Math.PI * 2;
                    }
                } else if (runnerId === 'ninja') {
                    aLift = 0;
                    if (fp < 0.28) {
                        aAng = -0.20;
                        poseName = 'run0';
                        aGrid = spr.run0;
                        phaseNow = 'run';
                        ninjaShurikenP = fp / 0.28;
                        aTilt = 0.20;
                    } else if (fp < 0.56) {
                        const dp = (fp - 0.28) / 0.28;
                        ninjaBlink = true;
                        ninjaSmokeP = dp;
                        aAng = lerp(-0.20, -0.14, easeInOutCubic(dp));
                        poseName = 'run1';
                        aGrid = spr.run2;
                        phaseNow = 'run';
                        aTilt = 0.28;
                        bodyAlpha = dp < 0.45 ? 0.30 : 0.88;
                    } else {
                        aAng = -0.13;
                        poseName = 'act';
                        aGrid = spr.slash || spr.cheer;
                        phaseNow = 'slash';
                        ninjaSlashP = (fp - 0.56) / 0.44;
                        aTilt = lerp(-0.10, 0.22, easeOutCubic(ninjaSlashP));
                    }
                } else if (runnerId === 'specops') {
                    aLift = 0;
                    aAng = lerp(-0.20, -0.13, easeOutCubic(fp));
                    poseName = 'act';
                    aGrid = spr.fire || spr.run0;
                    phaseNow = 'fire';
                    for (const [bStart, bEnd] of [[0.10, 0.32], [0.38, 0.60], [0.66, 0.88]]) {
                        if (fp >= bStart && fp <= bEnd) {
                            specopsFireBurst = (fp - bStart) / (bEnd - bStart);
                            recoilX = -2.2 * Math.sin(specopsFireBurst * Math.PI);
                            break;
                        }
                    }
                } else {
                    aAng = lerp(-0.18, -0.13, fp);
                    poseName = hasPng ? 'act' : 'cheer';
                    aGrid = spr.cheer;
                    phaseNow = 'fire';
                    aLift = 8 + Math.sin(fp * Math.PI) * 8;
                    showJet = !hasPng;
                    superJet = fp > 0.35;
                    showDrone = true;
                    if (fp > 0.28) astroBeamP = (fp - 0.28) / 0.72;
                }
            } else {
                aAng = -0.13;
                poseName = 'cheer';
                aGrid = spr.cheer;
                phaseNow = 'cheer';
                const post = T - T_IMPACT;
                if (runnerId === 'astro') {
                    aLift = 8 + Math.sin(post * 0.005) * 4;
                    showJet = Math.sin(post * 0.012) > 0.1;
                    showDrone = true;
                    if (post < 320) astroBeamP = 1;
                } else if (runnerId === 'ninja') {
                    aLift = 0;
                    if (post < 260) ninjaSlashP = 1;
                } else if (runnerId === 'specops') {
                    aLift = 0;
                } else {
                    if (post < 120) {
                        const lp = post / 120;
                        squashX = 1 + 0.09 * Math.sin(lp * Math.PI);
                        squashY = 1 - 0.09 * Math.sin(lp * Math.PI);
                    }
                    const hp = (post % 1300) / 1300;
                    aLift = hp < 0.25 ? (tier ? 12 : 8) * Math.sin((hp / 0.25) * Math.PI) : 0;
                }
            }

            for (const d of fx.runDust) {
                const age = T - d.t0;
                if (age < 0 || age > d.life) continue;
                const p = age / d.life;
                const bootFrac = clamp((d.t0 - T_RUN_START) / runDur, 0, 1);
                const bootAng = lerp(-0.46, -0.18, easeInOutCubic(bootFrac)) - 0.06;
                const a = bootAng + d.vTan * p;
                const rr = GR + 2 + d.vRad * easeOutCubic(p);
                const dx = GX + Math.sin(a) * rr;
                const dy = GY - Math.cos(a) * rr;
                hctx.save();
                hctx.globalAlpha = 1 - p;
                hctx.fillStyle = '#031E13';
                hctx.fillRect(Math.round(dx - d.sz / 2) - 1, Math.round(dy - d.sz / 2) - 1, d.sz + 2, d.sz + 2);
                hctx.fillStyle = d.col;
                hctx.fillRect(Math.round(dx - d.sz / 2), Math.round(dy - d.sz / 2), d.sz, d.sz);
                hctx.restore();
            }

            const flagEnterStart = Math.round(lerp(T_RUN_START, T_CROUCH, N <= 1 ? 0.25 : 0.48));
            if (T >= flagEnterStart) {
                const fp = clamp((T - flagEnterStart) / Math.max(1, T_IMPACT - flagEnterStart), 0, 1);
                const fAng = lerp(1.02, 0.0, easeInOutCubic(fp));
                const fPop = T >= T_IMPACT && T < T_IMPACT + 300 ? 1 + 0.34 * Math.sin(((T - T_IMPACT) / 300) * Math.PI) : 1;
                const flagX = GX + Math.sin(fAng) * (GR - 2);
                const flagY = GY - Math.cos(fAng) * (GR - 2);

                if (runnerId === 'astro' && astroBeamP >= 0) {
                    const beamW = astroBeamP < 1 ? (4 + 4 * Math.sin(astroBeamP * Math.PI)) : Math.max(0, 6 * (1 - (T - T_IMPACT) / 320));
                    if (beamW > 0.3) {
                        hctx.save();
                        hctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
                        hctx.fillRect(Math.round(flagX - beamW * 1.4), 0, Math.round(beamW * 2.8), Math.round(flagY));
                        hctx.fillStyle = '#A5F3FC';
                        hctx.fillRect(Math.round(flagX - beamW * 0.55), 0, Math.round(beamW * 1.1), Math.round(flagY));
                        hctx.fillStyle = '#FFFFFF';
                        hctx.fillRect(Math.round(flagX - 1), 0, 2, Math.round(flagY));
                        hctx.restore();
                    }
                }

                drawFlag(hctx, flagX, flagY, fAng, T >= T_IMPACT, T, N, fPop, tier);

                if (runnerId === 'specops' && specopsFireBurst > 0.52) {
                    hctx.save();
                    hctx.fillStyle = '#FDE047';
                    hctx.fillRect(Math.round(flagX - 4), Math.round(flagY - 22), 5, 5);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(Math.round(flagX - 2), Math.round(flagY - 24), 3, 3);
                    hctx.restore();
                }
            }

            if (T >= T_IMPACT && T < T_IMPACT + 620) {
                const sp = (T - T_IMPACT) / 620;
                hctx.save();
                hctx.globalAlpha = 1 - sp;
                hctx.strokeStyle = tier ? '#FDE047' : '#FFFFFF';
                hctx.lineWidth = (tier ? 6.5 : 5) * (1 - sp);
                hctx.beginPath();
                hctx.arc(GX, GY - GR - 12, lerp(10, tier ? 132 : 112, easeOutCubic(sp)), 0, Math.PI * 2);
                hctx.stroke();
                if (tier > 0 && sp > 0.14) {
                    const sp2 = (sp - 0.14) / 0.86;
                    hctx.strokeStyle = '#FFFFFF';
                    hctx.lineWidth = 4 * (1 - sp2);
                    hctx.beginPath();
                    hctx.arc(GX, GY - GR - 12, lerp(12, 102, easeOutCubic(sp2)), 0, Math.PI * 2);
                    hctx.stroke();
                }
                hctx.restore();
            }
            drawFireworkBurst(hctx, fx.sparkles, GX, GY - GR - 14, T, T_IMPACT, tier ? 1200 : 900);
            if (tier === 50) {
                drawFireworkBurst(hctx, fx.specialVolleyL, 62, 110, T, T_IMPACT + 120, 1100);
                drawFireworkBurst(hctx, fx.specialVolleyR, CW - 62, 110, T, T_IMPACT + 240, 1100);
            } else if (tier === 100) {
                drawFireworkBurst(hctx, fx.specialVolleyL, 58, 96, T, T_IMPACT + 80, 1200);
                drawFireworkBurst(hctx, fx.specialVolleyR, CW - 58, 96, T, T_IMPACT + 180, 1200);
                drawFireworkBurst(hctx, fx.specialVolleyL, CW - 74, 210, T, T_IMPACT + 380, 1100);
                drawFireworkBurst(hctx, fx.specialVolleyR, 74, 210, T, T_IMPACT + 480, 1100);
            }

            // Combat windows: melee / ranged heroes drop into their action pose while an enemy is in reach.
            if (encOn && T >= T_RUN_START && T < T_CROUCH && runnerId !== 'arcy') {
                const pre = runnerId === 'ninja' ? 170 : (runnerId === 'specops' ? 230 : 210);
                const post = runnerId === 'ninja' ? 130 : (runnerId === 'specops' ? 90 : 110);
                if (encounters.some((e) => T >= e.tKill - pre && T <= e.tKill + post)) {
                    poseName = 'act';
                    phaseNow = 'act';
                    showJet = false;
                    aTilt = runnerId === 'ninja' ? 0.14 : (runnerId === 'astro' ? 0.05 : 0.03);
                    squashX = 1;
                    squashY = 1;
                }
            }

            const activePng = hasPng ? getSpriteEntry(runnerId, poseName) : null;
            const actPng = hasPng ? getSpriteEntry(runnerId, 'act') : null;
            const gearTips = activePng ? {
                rt: [activePng.rt[0] * pngScale, activePng.rt[1] * pngScale + 2],
                tp: [activePng.tp[0] * pngScale, activePng.tp[1] * pngScale + 2],
            } : null;
            const actTip = actPng ? [actPng.rt[0] * pngScale, actPng.rt[1] * pngScale + 2] : null;

            if (runnerId === 'ninja' && ((T >= T_RUN_START && T < T_CROUCH) || ninjaBlink)) {
                const lags = ninjaBlink ? [[-0.05, 0.42], [-0.11, 0.28], [-0.17, 0.14]] : [[-0.075, 0.28], [-0.15, 0.14]];
                for (const [lagAng, alpha] of lags) {
                    hctx.save();
                    hctx.globalAlpha = alpha;
                    hctx.translate(GX + Math.sin(aAng + lagAng) * (GR + aLift), GY - Math.cos(aAng + lagAng) * (GR + aLift));
                    hctx.rotate(aAng + lagAng + aTilt);
                    if (activePng) {
                        drawSpriteImage(hctx, activePng, 0, 2, pngScale, { squashX, squashY });
                    } else {
                        drawCharacterBackGear(hctx, runnerId, 'run', gearScale, T);
                        drawBitmap(hctx, aGrid, 0, 2, sPx);
                        drawHeldGear(hctx, runnerId, 'run', gearScale, T, false);
                    }
                    hctx.restore();
                }
            }

            if (runnerId === 'ninja' && ninjaShurikenP >= 0) {
                for (const [lag, lift] of [[0, 15], [-0.26, 20]]) {
                    const tp = clamp(ninjaShurikenP + lag, 0, 1);
                    if (tp <= 0) continue;
                    const sAng = lerp(-0.18, 0.01, tp);
                    hctx.save();
                    hctx.translate(GX + Math.sin(sAng) * (GR + lift), GY - Math.cos(sAng) * (GR + lift));
                    hctx.rotate(sAng);
                    drawBitmap(hctx, GEAR_KUNAI, 0, 4, 1.5);
                    hctx.restore();
                }
            }

            const sprRenderedH = activePng ? ((SPRITE_HEAD_TOP[runnerId] || SPRITE_REF_H) * pngScale) : (aGrid.length * sPx);
            const crownY = -sprRenderedH - 2;
            hctx.save();
            hctx.translate(GX + Math.sin(aAng) * (GR + aLift), GY - Math.cos(aAng) * (GR + aLift));
            hctx.rotate(aAng);
            if (equipped === 'wood' || equipped === 'iron' || equipped === 'gold') {
                hctx.save();
                hctx.fillStyle = equipped === 'wood' ? '#F4A658' : equipped === 'iron' ? '#88DFF6' : '#FFDC74';
                for (let i = 0; i < 6; i++) {
                    const phase = T * .002 + i * Math.PI / 3;
                    const x = equipped === 'wood' ? -10 - i * 3 : Math.cos(phase) * (equipped === 'iron' ? 19 : 9);
                    const y = equipped === 'wood' ? -7 + Math.sin(phase) * 2 : equipped === 'iron'
                        ? -sprRenderedH / 2 + Math.sin(phase) * 16 : crownY - 6 + Math.sin(phase) * 3;
                    hctx.fillRect(Math.round(x), Math.round(y), i % 2 ? 2 : 3, i % 2 ? 2 : 3);
                }
                hctx.restore();
            }

            if (runnerId === 'ninja' && ninjaSmokeP >= 0 && ninjaSmokeP < 0.75) {
                const sp = ninjaSmokeP / 0.75;
                hctx.save();
                hctx.globalAlpha = 1 - sp;
                for (const [ox, oy] of [[-14, -8], [-6, -15], [-20, -14]]) {
                    const sz = Math.round(lerp(5, 11, sp));
                    hctx.fillStyle = '#031E13';
                    hctx.fillRect(ox - 1, oy - 1, sz + 2, sz + 2);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(ox, oy, sz, sz);
                }
                hctx.restore();
            }

            if (T >= T_IMPACT && T < T_IMPACT + 580) {
                const impP = (T - T_IMPACT) / 580;
                if (runnerId === 'ninja') {
                    hctx.save();
                    hctx.globalAlpha = (1 - impP) * 0.85;
                    for (let k = -1; k <= 1; k += 2) {
                        const sx = k * lerp(4, 24, easeOutCubic(impP));
                        const sy = -4 - lerp(0, 12, impP);
                        hctx.fillStyle = '#031E13';
                        hctx.fillRect(Math.round(sx - 5), Math.round(sy - 5), 10, 10);
                        hctx.fillStyle = '#FFFFFF';
                        hctx.fillRect(Math.round(sx - 3.5), Math.round(sy - 3.5), 7, 7);
                    }
                    hctx.restore();
                } else if (runnerId === 'specops') {
                    hctx.save();
                    hctx.globalAlpha = 1 - impP;
                    hctx.fillStyle = '#47E393';
                    hctx.fillRect(-16, Math.round(-6 - impP * 26), 5, 5);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(-15, Math.round(-12 - impP * 22), 3, 3);
                    hctx.restore();
                }
            }

            if (runnerId === 'ninja' && ninjaSlashP >= 0) {
                const sp = clamp(ninjaSlashP, 0, 1);
                const isSwinging = ninjaSlashP < 1;
                const swingAng = lerp(-2.15, 0.45, easeOutCubic(sp));
                const trailStart = Math.max(-2.35, swingAng - 1.35);
                const slashX = actTip ? actTip[0] - 24 * pngScale : 7;
                const slashY = actTip ? actTip[1] + 30 * pngScale : -14;
                const outerR = activePng ? 62 * pngScale : 31;
                const innerR = activePng ? 36 * pngScale : 17;
                hctx.save();
                hctx.translate(slashX, slashY);
                hctx.save();
                hctx.globalAlpha = isSwinging ? 0.78 : Math.max(0, 0.6 * (1 - (T - T_IMPACT) / 260));
                hctx.fillStyle = '#A5F3FC';
                hctx.beginPath();
                hctx.arc(0, 0, outerR, trailStart, swingAng, false);
                hctx.arc(0, 0, innerR, swingAng, trailStart, true);
                hctx.closePath();
                hctx.fill();
                hctx.strokeStyle = '#FFFFFF';
                hctx.lineWidth = 3;
                hctx.beginPath();
                hctx.arc(0, 0, outerR - 1, Math.max(trailStart, swingAng - 0.9), swingAng);
                hctx.stroke();
                hctx.restore();
                if (isSwinging && !activePng) {
                    hctx.save();
                    hctx.rotate(swingAng);
                    drawBitmap(hctx, GEAR_KATANA_FLAT, 15, 3, 1.48);
                    hctx.restore();
                }
                if (sp > 0.35 && isSwinging) {
                    hctx.fillStyle = '#FDE047';
                    hctx.fillRect(21, -8, 5, 5);
                    hctx.fillRect(25, 2, 4, 4);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(22, -7, 3, 3);
                }
                hctx.restore();
            }

            if (runnerId === 'specops' && specopsFireBurst >= 0) {
                const fxX = actTip ? actTip[0] + 1 : 24;
                const fxY = actTip ? actTip[1] : -15;
                if (specopsFireBurst < 0.45) {
                    hctx.save();
                    hctx.fillStyle = '#F59E0B';
                    hctx.fillRect(fxX, fxY - 3, 10, 6);
                    hctx.fillRect(fxX + 2, fxY - 5, 5, 10);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(fxX + 1, fxY - 1.5, 6, 3);
                    hctx.restore();
                }
                const tx = Math.round(lerp(fxX + 3, fxX + 33, specopsFireBurst));
                hctx.fillStyle = '#F59E0B';
                hctx.fillRect(tx - 10, fxY - 1, 11, 2.5);
                hctx.fillStyle = '#FFFFFF';
                hctx.fillRect(tx - 4, fxY - 1, 5, 2.5);
                const sx = Math.round(lerp(actTip ? fxX - 22 : 8, actTip ? fxX - 38 : -11, specopsFireBurst));
                const sy = Math.round((actTip ? fxY + 4 : -15) - Math.sin(specopsFireBurst * Math.PI) * 14 + specopsFireBurst * 10);
                hctx.fillStyle = '#0F172A';
                hctx.fillRect(sx - 1, sy - 1, 5, 4);
                hctx.fillStyle = '#FDE047';
                hctx.fillRect(sx, sy, 3, 2);
            }

            if (runnerId === 'astro' && showDrone) {
                const dx = (activePng ? -(activePng.w * 0.5 + 10) * pngScale : -24) + Math.cos(T * 0.005) * 3;
                const dy = (activePng ? -(activePng.h * 0.72) * pngScale : -26) + Math.sin(T * 0.008) * 3;
                drawBitmap(hctx, GEAR_DRONE, dx, dy, 1.5);
            }

            if (encOn) {
                let muzzle = null;
                if (gearTips) {
                    const tc = Math.cos(aTilt);
                    const ts = Math.sin(aTilt);
                    muzzle = [gearTips.rt[0] * tc - gearTips.rt[1] * ts, gearTips.rt[0] * ts + gearTips.rt[1] * tc];
                }
                drawEncounters(hctx, { runnerId, encounters, T, GR, aLift, muzzle });
            }

            hctx.save();
            hctx.globalAlpha = bodyAlpha;
            if (recoilX) hctx.translate(recoilX, 0);
            if (aTilt) hctx.rotate(aTilt);
            if (aSpin) {
                const spinCy = activePng ? -Math.round(sprRenderedH * 0.48) : -14;
                hctx.translate(0, spinCy);
                hctx.rotate(aSpin);
                hctx.translate(0, -spinCy);
            }
            if (showJet) {
                const fl = (superJet ? 9 : 5) + (Math.sin(T * 0.08) > 0 ? 4 : 1);
                if (runnerId === 'astro') {
                    const jx = activePng ? (-activePng.w / 2 - activePng.dx) * pngScale + 4 : -16;
                    const jy = activePng ? -(activePng.h * 0.38) * pngScale + 2 : -6;
                    hctx.fillStyle = '#031E13';
                    hctx.fillRect(jx, jy, 8, fl + 6);
                    hctx.fillStyle = '#38BDF8';
                    hctx.fillRect(jx + 1, jy + 1, 6, fl + 4);
                    hctx.fillStyle = '#A5F3FC';
                    hctx.fillRect(jx + 2, jy + 1, 4, fl + 1);
                    hctx.fillStyle = '#FFFFFF';
                    hctx.fillRect(jx + 3, jy + 1, 2, fl - 2);
                } else {
                    hctx.fillStyle = '#031E13';
                    hctx.fillRect(-15, -6, 7, fl + 4);
                    hctx.fillStyle = '#F59E0B';
                    hctx.fillRect(-14, -5, 5, fl + 2);
                    hctx.fillStyle = '#FDE047';
                    hctx.fillRect(-13, -5, 3, fl);
                }
            }
            if (activePng) {
                drawSpriteImage(hctx, activePng, 0, 2, pngScale, { squashX, squashY });
                drawHeldGear(hctx, runnerId, phaseNow, gearScale, T, true, gearTips);
            } else {
                drawCharacterBackGear(hctx, runnerId, phaseNow, gearScale, T);
                drawBitmap(hctx, aGrid, 0, 2, sPx);
                drawHeldGear(hctx, runnerId, phaseNow, gearScale, T, true, false);
            }
            hctx.restore();

            if (T >= T_IMPACT) {
                const crownPx = activePng ? 1.7 : 2.1;
                if (tier === 50) {
                    drawBitmap(hctx, CROWN_SPR, 0, crownY, crownPx);
                } else if (tier === 100) {
                    drawBitmap(hctx, CROWN_SPR, 0, crownY, crownPx);
                    drawBitmap(hctx, TROPHY_SPR, activePng ? -27 : -29, -4, crownPx);
                }
            }
            hctx.restore();

            if (T < T_IMPACT) {
                oldEl.style.opacity = '1';
                oldEl.style.transform = 'translateY(0px) scale(1)';
                newEl.style.opacity = '0';
            } else if (T < T_SLAM) {
                const p = (T - T_IMPACT) / (T_SLAM - T_IMPACT);
                oldEl.style.opacity = String(1 - p);
                oldEl.style.transform = `translateY(${(-48 * p).toFixed(1)}px) scale(0.75)`;
                newEl.style.opacity = String(clamp(p * 1.4, 0, 1));
                newEl.style.transform = `translateY(${lerp(-95, 0, easeInOutCubic(p)).toFixed(1)}px) scale(${lerp(1.32, 1.12, p).toFixed(3)}, ${lerp(1.32, 0.84, p).toFixed(3)})`;
            } else {
                oldEl.style.opacity = '0';
                const sp = clamp((T - T_SLAM) / 320, 0, 1);
                const osc = Math.exp(-5 * sp) * Math.cos(sp * Math.PI * 2.4);
                newEl.style.opacity = '1';
                newEl.style.transform = `scale(${(1 + 0.18 * osc).toFixed(3)}, ${(1 - 0.18 * osc).toFixed(3)})`;
            }

            if (todayEl) {
                const isLit = T >= T_LOWER;
                todayEl.classList.toggle('today-lit', isLit);
                todayEl.classList.toggle('today-wait', !isLit);
            }

            if (card) {
                const cp = reducedMotion ? 1 : easeOutBack(clamp((T - 120) / 420, 0, 1), 1.15);
                card.style.opacity = reducedMotion ? '1' : String(clamp((T - 120) / 200, 0, 1));
                card.style.transform = `translateY(${((1 - cp) * 24).toFixed(1)}px)`;
            }

            const ctaP = reducedMotion ? 1 : easeOutBack(clamp((T - T_IMPACT) / 420, 0, 1), 1.25);
            ctaBtn.style.opacity = reducedMotion ? '1' : String(clamp((T - T_IMPACT) / 180, 0, 1));
            ctaBtn.style.transform = `translateY(${((1 - ctaP) * 26).toFixed(1)}px)`;
        }

        const state = {
            overlay,
            rafId: null,
            stopSound: () => stopSound(),
            restoreFocus: document.activeElement,
            onClose: options.onClose,
            onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeActiveCelebration();
                }
            },
        };
        activeOverlay = state;

        ctaBtn.addEventListener('click', closeActiveCelebration);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeActiveCelebration();
        });
        soundBtn.addEventListener('click', () => {
            soundOn = !soundOn;
            setSoundEnabled(soundOn);
            syncSoundUI();
            if (typeof stopSound === 'function') stopSound();
            if (soundOn) {
                stopSound = playCelebrationAudio(N, tier);
                state.stopSound = () => stopSound();
            }
        });
        document.addEventListener('keydown', state.onKeyDown);

        window.requestAnimationFrame(() => {
            overlay.classList.add('is-open');
            ctaBtn.focus({ preventScroll: true });
        });

        if (reducedMotion) {
            renderAt(tl.T_LOWER + 200);
        } else {
            renderAt(0);
            const tick = (now) => {
                if (activeOverlay !== state) return;
                renderAt(now - startTime);
                state.rafId = window.requestAnimationFrame(tick);
            };
            state.rafId = window.requestAnimationFrame(tick);
        }

        return {
            close: closeActiveCelebration,
            streak: N,
            runnerId,
        };
    }

    function maybeCelebrate(options = {}) {
        const HA = getHabitArcStore();
        if (!HA) return null;

        const progress = HA.getTodayProgress?.();
        if (!progress || progress.total === 0 || progress.percentage < 100) return null;

        const streak = HA.getOverallCurrentStreak?.() || 0;
        if (streak <= 0) return null;

        const todayStr = typeof HA.today === 'function' ? HA.today() : new Date().toISOString().slice(0, 10);
        const uidKey = HA.getAuthUser?.()?.uid || 'local';
        const storageKey = `${CELEBRATED_PREFIX}${uidKey}`;

        if (!options.force) {
            try {
                if (window.localStorage?.getItem(storageKey) === todayStr) return null;
            } catch {
                // Storage unavailable.
            }
        }

        try {
            window.localStorage?.setItem(storageKey, todayStr);
        } catch {
            // Optional persistence.
        }

        return celebrate({
            streak,
            runnerId: options.runnerId || HA.getSettings?.()?.companion || DEFAULT_COMPANION_ID,
            forceAnimate: options.forceAnimate,
            onClose: options.onClose,
        });
    }

    const api = {
        COMPANIONS,
        DEFAULT_COMPANION_ID,
        normalizeCompanionId,
        milestoneTier,
        getTimeline,
        planEncounters,
        ENEMY_ART,
        ENEMY_PAL,
        mountPicker,
        stopPickers,
        celebrate,
        maybeCelebrate,
        close: closeActiveCelebration,
    };

    if (typeof window !== 'undefined') {
        window.HabitArcStreak = api;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.HabitArcStreak = api;
    }
})();
