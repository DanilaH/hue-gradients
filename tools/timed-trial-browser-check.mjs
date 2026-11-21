import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/timed-trial';
const base = 'http://127.0.0.1:4182';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4182', '--strictPort'], { stdio: 'ignore' });
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
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
    ...(recording ? { recordVideo: { dir: output, size: viewport } } : {}) });
  await context.addInitScript(() => {
    const actual = Date.now;
    Date.now = () => Number(sessionStorage.getItem('poluson-test-clock')) || actual();
  });
  const captureBase = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const clock = (time, event) => page.evaluate(({ time, event }) => {
    sessionStorage.setItem('poluson-test-clock', String(time));
    if (event) window.dispatchEvent(new Event(event));
  }, { time, event });
  const ready = () => page.waitForSelector('html[data-state=ready]');
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const button = name => page.getByRole('button', { name });
  const store = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const row = await db.load('guest-local-v1');
    const facts = (await db.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    db.close();
    return { save: JSON.parse(row.snapshotJson), finishFacts: facts.filter(fact => fact.timedFinished === true).length };
  });
  const timer = () => page.locator('#guidance').innerText();
  await page.goto(base);
  await ready();
  await clock(1_000_000);
  await page.locator('#levels').tap();
  await button(/^Испытания$/).tap();
  const clipStartMillis = Date.now() - captureBase;
  if (recording) await page.waitForTimeout(350);
  await button(/^Заезд на время/).tap();
  await idle();
  assert.equal(await timer(), '10:00 · Собрано 0');
  const start = (await store()).save;
  const first = start.timedProgress.run.attempt;
  for (const to of [1, 2, 5, 6]) {
    const before = (await store()).save.timedProgress.run.attempt;
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const position of [before.board.indexOf(to), to]) {
      await page.touchscreen.tap(box.x + (position % 4 + .5) * box.width / 4,
        box.y + 4 + (Math.floor(position / 4) + .5) * (box.height - 8) / 4);
    }
    await idle();
  }
  assert.deepEqual((await store()).save.timedProgress.run.attempt.levelId, 'timed-v1-2');
  assert.equal(await timer(), '10:00 · Собрано 1');
  if (recording) await page.waitForTimeout(550);

  await clock(1_011_000, 'blur');
  await page.waitForTimeout(250);
  await idle();
  const paused = (await store()).save.timedProgress.run;
  assert.equal(paused.startedAt, null);
  assert.equal(paused.remainingMs, 589_000);
  await clock(1_071_000);
  assert.equal(await timer(), '9:49 · Собрано 1');
  await clock(1_071_000, 'focus');
  await page.waitForTimeout(250);
  await idle();
  assert.equal((await store()).save.timedProgress.run.startedAt, 1_071_000);
  assert.equal(await timer(), '9:49 · Собрано 1');
  if (recording) await page.waitForTimeout(500);
  await clock(1_660_000);
  await page.waitForSelector('#hue-app[data-layer=result]');
  await idle();
  assert.equal(await page.locator('#dialog-title').textContent(), 'Время вышло');
  assert.match(await page.locator('#dialog-copy').innerText(), /Собрано · 1 · Рекорд · 1/);
  const finished = await store();
  assert.equal(finished.finishFacts, 1);
  assert.equal(finished.save.timedProgress.finished, 1);
  if (recording) await page.waitForTimeout(850);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await page.reload();
  await ready();
  await page.waitForSelector('#hue-app[data-layer=result]');
  assert.deepEqual(await store(), finished);
  await button(/^К испытаниям$/).tap();
  await idle();
  await button(/^Заезд на время/).tap();
  await idle();
  assert.equal(await timer(), '10:00 · Собрано 0');
  const replay = await store();
  assert.equal(replay.finishFacts, 1);
  assert.equal(replay.save.timedProgress.best, 1);
  assert.deepEqual(replay.save.timedProgress.run.attempt.board, first.board);
  assert.notEqual(replay.save.timedProgress.run.attempt.attemptId, first.attemptId);
  assert.deepEqual(replay.save.attempts, start.attempts);
  assert.deepEqual(replay.save.completed, start.completed);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/timed.webm`);
  const report = { browser: browser.version(), roundsViaTouch: 1, pausedRemainingMs: paused.remainingMs,
    backgroundSimulatedMs: 60_000, timedFinishFactsAfterReloadAndReplay: 1, score: 1,
    clipStartMillis, clipMillis, limits: 'Real browser touch and IndexedDB. Test clock and blur/focus injected. Native app suspension not run.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
