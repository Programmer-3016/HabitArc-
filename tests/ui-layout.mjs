// Opt-in visual/layout regression check. Synthetic records stay in an isolated
// browser context; Firebase and service workers are disabled for this test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = process.env.UI_SCREENSHOT_DIR;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
    try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
        if (!/^(?:icons\/)?[A-Za-z0-9_-]+\.(html|css|js|png|webmanifest)$/.test(name)) throw new Error('Not found');
        res.writeHead(200, { 'Content-Type': types[extname(name)] });
        res.end(await readFile(resolve(root, name)));
    } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Local UI test: Firebase disabled");' }));
    await context.addInitScript(() => {
        if (localStorage.getItem('habitarc_data')) return;
        const ago = n => {
            const d = new Date(); d.setDate(d.getDate() - n);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const habits = ['Read 20 pages', 'Morning walk', 'Practice coding', 'Evening journal'].map((name, i) => ({
            id: `ui-${i}`, name, icon: ['menu_book', 'directions_walk', 'code', 'edit_note'][i],
            category: ['Learning', 'Health', 'Focus', 'Mindfulness'][i],
            accentColor: ['#3988d4', '#0e8f63', '#d17b2a', '#7c5ce0'][i],
            reminder: ['08:00', '07:00', '17:00', '21:00'][i], repeat: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
            createdAt: ago(27), why: 'Build a sustainable routine.',
            completions: Object.fromEntries(Array.from({ length: 28 }, (_, n) => [ago(n), n === 0 ? i < 3 : (n + i) % 5 !== 0]).filter(([, done]) => done)),
        }));
        localStorage.setItem('habitarc_data', JSON.stringify({ habits, completionHistory: {}, onboardingComplete: true, settings: { userName: 'Sarthak', theme: 'light' } }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    const pages = ['Dashboard', 'Habits', 'Notes', 'Insights', 'Leaderboard', 'Arc_AI', 'Add_Habit', 'Habit_Detail', 'Profile', 'Settings'];
    if (output) await mkdir(output, { recursive: true });
    for (const width of [320, 390, 768, 1024, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of pages) {
            await page.goto(`${base}/${name}.html${name === 'Habit_Detail' ? '?id=ui-0' : ''}`, { waitUntil: 'networkidle' });
            await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: page overflow at ${width}`);
            // Fail if the CDN utility styles or shared CSS did not load.
            assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(246, 244, 239)');
            if (width < 768) {
                const nav = page.locator('body > nav');
                assert.equal(await nav.isVisible(), true);
                const controls = await nav.locator('a').evaluateAll(links => links.map(link => link.getBoundingClientRect().height));
                assert(controls.every(height => height >= 44), `${name}: small navigation target`);
            }
            if (output && [390, 1366].includes(width)) await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: true });
        }
    }
    // Android 320/360/390px: catch clipped ARC top, nested scroll traps and hidden modal actions.
    for (const width of [320,360,390]) {
        const height = width === 320 ? 568 : 780;
        await page.setViewportSize({width,height});
        await page.goto(base + '/Arc_AI.html', { waitUntil:'networkidle' });
        const intro = await page.evaluate(() => {
            const scroller = document.querySelector('.ha-arc-scroll');
            const mascot = document.querySelector('.ha-arc-mascot-sq').getBoundingClientRect();
            const header = document.querySelector('body > header').getBoundingClientRect();
            const composer = document.querySelector('.ha-arc-composer').getBoundingClientRect();
            return {
                overflow: getComputedStyle(scroller).overflowY,
                mascotTop:mascot.top,headerBottom:header.bottom,composerBottom:composer.bottom
            };
        });
        assert.equal(intro.overflow, 'visible','ARC Zen home must use page scroll at '+width);
        assert(intro.mascotTop >= intro.headerBottom-1,'ARC top clipped at '+width);
        assert(intro.composerBottom > intro.mascotTop,'ARC composer is misplaced at '+width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1),false);
        await page.evaluate(() => {
            document.querySelector('#arc-zen-home').classList.add('hidden');
            document.querySelector('#arc-thread-view').classList.remove('hidden');
        });
        assert.equal(await page.locator('.ha-arc-scroll').evaluate(el => getComputedStyle(el).overflowY),
            'auto','ARC conversation scroll should remain contained at '+width);

        await page.goto(base + '/Habits.html', {waitUntil:'networkidle'});
        await page.locator('[data-plan-mode="day"]').click();
        const dayDate=await page.locator('#ha-day-date').boundingBox();
        assert(dayDate && dayDate.width>=108 && dayDate.x>=-1 && dayDate.x+dayDate.width<=width+1,
            'My Day date input clips at '+width);
        await page.locator('[data-plan-mode="tasks"]').click();
        await page.locator('#ha-rescue-open').click();
        const rescue=await page.locator('#ha-rescue-dialog').boundingBox();
        assert(rescue && rescue.x>=-1 && rescue.x+rescue.width<=width+1,
            'Rescue dialog horizontal overflow at '+width);
        assert(rescue.y>=-1 && rescue.y+rescue.height<=height+1,
            'Rescue dialog vertical overflow at '+width);
        assert.equal(await page.locator('.ha-rescue-actions').evaluate(el => getComputedStyle(el).position),
            'sticky','Approval controls should stick inside Rescue dialog');
        await page.locator('#ha-rescue-close').click();

        await page.goto(base + '/Notes.html', {waitUntil:'networkidle'});
        await page.locator('#new-note').click();
        const note=await page.locator('#note-dialog').boundingBox();
        assert(note && note.x>=-1 && note.x+note.width<=width+1,
            'Notes dialog horizontal overflow at '+width);
        assert.equal(await page.locator('.notes-dialog-actions').evaluate(el => getComputedStyle(el).position),
            'sticky','Notes save should stick inside editor');
        await page.locator('#close-note').click();
    }
    await page.setViewportSize({width:1366,height:900});
    await page.goto(`${base}/Settings.html`, { waitUntil: 'networkidle' });
    const backgrounds = new Set();
    for (const theme of ['light', 'dark', 'sage', 'forest', 'midnight', 'ocean', 'purple', 'sunset']) {
        await page.locator(`[data-theme-val="${theme}"]`).click();
        assert.equal(await page.locator(`[data-theme-val="${theme}"]`).getAttribute('aria-pressed'), 'true');
        await page.waitForFunction(expected => document.documentElement.getAttribute('data-theme') === expected, theme);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        backgrounds.add(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor));
        await page.goto(`${base}/Dashboard.html`, { waitUntil: 'networkidle' });
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `${theme}: persistence across navigation`);
        if (output) await page.screenshot({ path: resolve(output, `Dashboard-${theme}.png`), fullPage: true });
        if (theme === 'dark') {
            await page.setViewportSize({ width: 390, height: 900 });
            for (const name of pages) {
                await page.goto(`${base}/${name}.html?id=ui-0`, { waitUntil: 'networkidle' });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: dark mobile overflow`);
                if (output) await page.screenshot({ path: resolve(output, `${name}-dark-mobile.png`), fullPage: true });
            }
            await page.setViewportSize({ width: 1366, height: 900 });
        }
        await page.goto(`${base}/Settings.html`, { waitUntil: 'networkidle' });
    }
    assert.equal(backgrounds.size, 8, 'Every existing theme has a distinct palette');
    await page.locator('[data-theme-val="light"]').click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => HabitArc.updateHabit('ui-0', { name: 'A very long habit name that must wrap without hiding completion controls or pushing anything offscreen' }));
    for (const name of ['Dashboard', 'Habits', 'Habit_Detail', 'Insights']) {
        await page.goto(`${base}/${name}.html?id=ui-0`, { waitUntil: 'networkidle' });
        const clipped = await page.evaluate(() => [...document.querySelectorAll('main .ha-habit-card, main button, #habit-name, #strongest-name, #opportunity-name, #habit-name-title, #delete-btn, #edit-habit-btn')]
            .filter(el => el.getClientRects().length && !el.closest('#category-filters'))
            .some(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }));
        assert.equal(clipped, false, `${name}: long-name content clips at 320px`);
    }
    await page.goto(`${base}/Dashboard.html`, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
    assert.equal(await page.locator('.fade-up').first().evaluate(el => getComputedStyle(el).opacity), '1');
    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('habitarc_data'));
        data.habits = []; data.completionHistory = {};
        localStorage.setItem('habitarc_data', JSON.stringify(data));
    });
    for (const name of ['Dashboard', 'Habits', 'Insights']) {
        await page.goto(`${base}/${name}.html`, { waitUntil: 'networkidle' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: empty-state overflow`);
        if (output) await page.screenshot({ path: resolve(output, `${name}-empty.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 10 pages at 320/390/768/1024/1366px, 8 saved themes, mobile touch targets, long names, keyboard skip link, reduced motion; no page errors or cloud writes.');
} finally {
    await browser?.close();
    server.close();
}
