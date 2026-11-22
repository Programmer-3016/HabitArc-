// Opt-in local browser check. Set PLAYWRIGHT_MODULE to a Playwright module path
// or install Playwright separately. No real Firebase account or cloud writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
    try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
        if (!/^(?:icons\/)?[A-Za-z0-9_-]+\.(html|css|js|png|webmanifest)$/.test(name)) throw new Error('Not found');
        const data = await readFile(resolve(root, name));
        res.writeHead(200, { 'Content-Type': types[extname(name)] }); res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/firebase-auth.js', route => route.fulfill({
        contentType: 'text/javascript', body: 'throw new Error("Offline browser test: Firebase intentionally disabled");'
    }));
    await context.addInitScript(() => {
        if (!localStorage.getItem('habitarc_data')) localStorage.setItem('habitarc_data', JSON.stringify({
            habits: [], completionHistory: {}, onboardingComplete: true,
            settings: { userName: 'Test Student', theme: 'light' }
        }));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(`${page.url()}: ${error.stack || error.message}`));
    await page.goto(`${base}/Add_Habit.html`, { waitUntil: 'networkidle' });
    await page.locator('#habit-name-input').fill('Read "notes" <daily>');
    await page.locator('#reminder-time-input').fill('20:00');
    await page.locator('#repeat-select').selectOption('daily');
    await page.locator('#habit-form-submit').click();
    await page.waitForURL('**/Habits.html');
    assert.equal(await page.getByText('Read "notes" <daily>', { exact: true }).count(), 1);
    const id = await page.evaluate(() => HabitArc.getHabits()[0].id);
    await page.goto(`${base}/Habit_Detail.html?id=${id}`, { waitUntil: 'networkidle' });
    await page.locator('#complete-today-btn').click();
    assert.equal(await page.evaluate(id => HabitArc.isCompletedToday(id), id), true);
    const celebrationOverlay = page.locator('.ha-sr-overlay');
    if (await celebrationOverlay.count()) {
        await page.locator('.ha-sr-overlay #haSrCtaBtn').click();
        await celebrationOverlay.waitFor({ state: 'detached' });
    }
    await page.locator('#edit-habit-btn').click();
    await page.waitForURL('**/Add_Habit.html?edit=*');
    await page.locator('#habit-name-input').fill('Read 20 pages');
    await page.locator('#habit-form-submit').click();
    await page.waitForURL('**/Habit_Detail.html?id=*');
    assert.equal(await page.evaluate(id => HabitArc.getCompletionHistory(id).length, id), 1);
    assert.equal(await page.evaluate(id => HabitArc.isCompletedToday(id), id), true);
    await page.locator('#complete-today-btn').click();
    assert.equal(await page.evaluate(id => HabitArc.getCompletionHistory(id)[0].status, id), 'not_completed');
    for (const width of [390, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of ['Dashboard', 'Habits', 'Habit_Detail', 'Add_Habit', 'Insights', 'Arc_AI', 'Settings', 'Profile']) {
            await page.goto(`${base}/${name}.html${name === 'Habit_Detail' ? `?id=${id}` : ''}`, { waitUntil: 'networkidle' });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
            assert.equal(overflow, false, `${name} horizontal overflow at ${width}px`);
        }
    }
    await page.goto(`${base}/Arc_AI.html`, { waitUntil: 'networkidle' });
    await page.locator('#ai-coach-question').fill('Where can I improve?');
    await page.locator('#ai-coach-submit').click();
    await page.waitForFunction(() => document.querySelector('#ai-coach-status').textContent.includes('sign in'));
    assert.deepEqual(errors, []);
    console.log('PASS: create, complete, edit/history, undo, escaped names, guest Coach guard, 7 pages at 390px and 1366px; no page errors. Firebase stubbed; no cloud/LLM requests.');
} finally {
    await browser?.close();
    server.close();
}
