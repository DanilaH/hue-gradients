import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/daily';
const base = 'http://127.0.0.1:4187';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4187', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* Vite is still starting. */ }
    if (i === 99) throw new Error('Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const viewport = { width: 390, height: 740 };
  const recording = process.env.RECORD_EPISODE === '1';
  const first = '2026-11-20', second = '2026-11-21';
  const errors = [];
  async function profile(record) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
      ...(record ? { recordVideo: { dir: output, size: viewport } } : {}) });
    await context.route('**/daily-fixture.html', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
      '<!doctype html><html lang="ru" data-host="browser"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="game-root"></main>' }));
    const captureBase = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const boot = async () => {
      await page.evaluate(async () => {
        const { mountGame } = await import('/src/game/mountGame.ts');
        const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
        const { getLevel } = await import('/src/domain/levels.ts');
        const { DAILY_CONTENT_VERSION } = await import('/src/domain/puzzle.ts');
        const activity = { isBlocked: () => false, onBlockedChange: () => () => {}, setGameplayDesired: () => {} };
        await mountGame(document.querySelector('#game-root'), await openIndexedDb(), activity, {
          dailySource: async () => {
            const phase = sessionStorage.getItem('fixture-daily') ?? 'before';
            if (phase === 'offline') throw new Error('Fixture disconnected');
            const before = phase === 'before';
            return {
              source: 'Dated test fixture', version: before ? 'v1' : 'v2', verifiedNowMs: before
                ? Date.UTC(2026, 10, 20, 23, 59, 59) : Date.UTC(2026, 10, 21),
              days: ['2026-11-20', '2026-11-21'].map((date, i) => ({ date, level: {
                ...getLevel(i === 0 && before ? 'gradient-001' : 'gradient-002'), id: `daily-${date}`,
                contentVersion: DAILY_CONTENT_VERSION,
              } })),
            };
          },
        });
      });
    };
    await page.goto(`${base}/daily-fixture.html`);
    await boot();
    return { context, page, boot, captureBase };
  }
  const one = await profile(recording), two = await profile(false);
  const opening = async (page) => {
    await page.locator('#levels').tap();
    await page.getByRole('button', { name: 'Задача дня', exact: true }).tap();
    await page.locator(`[data-daily-date="${first}"]`).waitFor();
  };
  const slot = (page, date) => page.locator(`[data-daily-date="${date}"]`);
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const state = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const snapshot = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    const facts = (await store.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    store.close();
    return { book: snapshot.dailyProgress, completed: snapshot.completed, rights: snapshot.rights,
      distinctWins: facts.filter(fact => fact.firstDailyWin === true).map(fact => fact.dailyDate) };
  });
  const swap = async page => {
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const position of [1, 2]) await page.touchscreen.tap(box.x + (position + .5) * box.width / 4, box.y + box.height / 2);
    await page.waitForSelector('#hue-app[data-layer=result]');
  };
  await opening(one.page);
  assert.equal(await slot(one.page, second).count(), 0);
  const clipStartMillis = Date.now() - one.captureBase;
  await slot(one.page, first).tap();
  await idle(one.page);
  await opening(two.page);
  await slot(two.page, first).tap();
  await idle(two.page);
  const before = await state(one.page), other = await state(two.page);
  await two.context.close();
  assert.deepEqual(before.book.attempts[first].board, other.book.attempts[first].board);
  assert.equal(before.book.slots[first].version, 'v1');
  await one.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'after'));
  await swap(one.page);
  assert.equal((await state(one.page)).book.active, first);
  if (recording) await one.page.waitForTimeout(500);
  await one.page.getByRole('button', { name: 'К календарю' }).tap();
  await slot(one.page, second).waitFor();
  assert.match(await slot(one.page, first).innerText(), /Архив.*Собрано/s);
  assert.match(await slot(one.page, second).innerText(), /Общая задача/);
  const refreshed = await state(one.page);
  assert.equal(refreshed.book.slots[first].version, 'v1');
  assert.equal(refreshed.book.slots[second].version, 'v2');
  if (recording) await one.page.waitForTimeout(700);
  await one.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'offline'));
  await one.page.reload();
  await one.boot();
  await opening(one.page);
  assert(await slot(one.page, second).isVisible());
  await slot(one.page, first).tap();
  await idle(one.page);
  assert.deepEqual((await state(one.page)).book.attempts[first].board, before.book.attempts[first].board);
  await swap(one.page);
  const offline = await state(one.page);
  assert.deepEqual(offline.distinctWins, [first]);
  assert.deepEqual(offline.book.solved, [first]);
  assert.deepEqual(offline.completed, before.completed);
  assert.deepEqual(offline.rights, before.rights);
  assert.deepEqual(errors, []);
  if (recording) await one.page.waitForTimeout(600);
  const clipMillis = Date.now() - one.captureBase - clipStartMillis;
  const video = one.page.video();
  await one.context.close();
  if (video) await video.saveAs(`${output}/daily.webm`);
  const report = { browser: browser.version(), sameDailyStartOnTwoProfiles: true, acrossUtcMidnight: [first, second],
    reusedOldVersion: 'v1', offlineReplay: true, distinctWins: offline.distinctWins, clipStartMillis, clipMillis,
    limits: 'Injected dated feed and trusted clock. No public source, shared rewards or native runtime.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
