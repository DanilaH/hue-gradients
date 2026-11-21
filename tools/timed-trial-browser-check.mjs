import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
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
  const configure = context => context.addInitScript(() => {
    const civil = Date.now, elapsed = performance.now.bind(performance);
    Date.now = () => Number(sessionStorage.getItem('trial-civil')) || civil();
    Object.defineProperty(performance, 'now', { value: () => Number(sessionStorage.getItem('trial-elapsed')) || elapsed() });
  });
  await configure(context);
  const captureBase = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const clock = (page, values, event) => page.evaluate(({ values, event }) => {
    for (const [key, time] of Object.entries(values)) sessionStorage.setItem('trial-' + key, String(time));
    if (event) window.dispatchEvent(new Event(event));
  }, { values, event });
  const ready = page => page.waitForSelector('html[data-state=ready]');
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const button = (page, name) => page.getByRole('button', { name });
  const timer = page => page.locator('#guidance').innerText();
  const store = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const row = await db.load('guest-local-v1');
    const facts = (await db.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    db.close();
    return { save: JSON.parse(row.snapshotJson), finishFacts: facts.filter(fact => fact.timedFinished === true).length };
  });
  async function open(page) {
    await page.locator('#levels').tap();
    await button(page, /^Испытания$/).tap();
    await button(page, /^Заезд на время/).tap();
    await idle(page);
  }
  async function swap(page, from, to, width, height) {
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const position of [from, to]) {
      await page.touchscreen.tap(box.x + (position % width + .5) * box.width / width,
        box.y + 4 + (Math.floor(position / width) + .5) * (box.height - 8) / height);
    }
    await idle(page);
  }
  async function solve(page, width, height) {
    const { attempt } = (await store(page)).save.timedProgress.run;
    const order = [...attempt.board];
    for (const [position, tile] of order.entries()) {
      if (position === tile) continue;
      const other = order.indexOf(position);
      await swap(page, other, position, width, height);
      [order[other], order[position]] = [order[position], order[other]];
    }
  }
  const hold = ms => recording ? page.waitForTimeout(ms) : Promise.resolve();
  await page.goto(base);
  await ready(page);
  await clock(page, { elapsed: 1_000, civil: 1_000_000 });
  const clipStartMillis = Date.now() - captureBase;
  await open(page);
  const start = (await store(page)).save;
  const first = start.timedProgress.run.field;
  assert.equal(await timer(page), '10:00 · Собрано 0');
  assert.deepEqual([first.width, first.height], [7, 7]);
  await hold(400);
  await clock(page, { elapsed: 301_000 });
  await page.waitForFunction(() => document.querySelector('#guidance').textContent === '5:00 · Собрано 0');
  const clockLabels = [await timer(page)];
  for (const civil of [100_000, 9_000_000]) {
    await clock(page, { civil });
    await page.waitForTimeout(240);
    clockLabels.push(await timer(page));
  }
  assert.deepEqual(clockLabels, Array(3).fill('5:00 · Собрано 0'));
  await hold(420);
  const rounds = [];
  for (let cleared = 0; cleared < 7; cleared++) {
    const { field } = (await store(page)).save.timedProgress.run;
    assert.deepEqual([field.width, field.height], [7, 7]);
    rounds.push({ field: field.id, pins: field.pinnedPositions.length, palette: field.solvedTileColors, moves: field.minimumSwaps });
    await solve(page, 7, 7);
    assert.equal((await store(page)).save.timedProgress.run.cleared, cleared + 1);
    if ([0, 5, 6].includes(cleared)) await hold(350);
  }
  assert.equal(new Set(rounds.map(round => round.palette.join())).size, 7);
  assert(rounds[0].pins > rounds.at(-1).pins);

  await clock(page, { elapsed: 312_000 }, 'blur');
  await page.waitForTimeout(250);
  await idle(page);
  const paused = (await store(page)).save.timedProgress.run;
  assert.equal(paused.startedAt, null);
  assert.equal(paused.remainingMs, 289_000);
  await clock(page, { elapsed: 372_000 });
  assert.equal(await timer(page), '4:49 · Собрано 7');
  await page.reload();
  await ready(page);
  await idle(page);
  const resumed = (await store(page)).save.timedProgress.run;
  assert.deepEqual(resumed.attempt, paused.attempt);
  assert.deepEqual(resumed.field, paused.field);
  assert.equal(resumed.remainingMs, 289_000);
  assert.equal(await timer(page), '4:49 · Собрано 7');
  await hold(550);
  await clock(page, { elapsed: 661_000 });
  await page.waitForSelector('#hue-app[data-layer=result]');
  await idle(page);
  assert.match(await page.locator('#dialog-copy').innerText(), /Собрано · 7 · Рекорд · 7/);
  const finished = await store(page);
  assert.equal(finished.finishFacts, 1);
  await hold(750);
  await page.reload();
  await ready(page);
  assert.deepEqual(await store(page), finished);
  await button(page, /^К испытаниям$/).tap();
  await idle(page);
  await button(page, /^Заезд на время/).tap();
  await idle(page);
  const replay = await store(page);
  assert.equal(replay.finishFacts, 1);
  assert.equal(replay.save.timedProgress.best, 7);
  assert.notDeepEqual(replay.save.timedProgress.run.field.startTileAtPosition, first.startTileAtPosition);
  assert.notEqual(replay.save.timedProgress.run.attempt.attemptId, start.timedProgress.run.attempt.attemptId);
  assert.deepEqual(replay.save.attempts, start.attempts);
  assert.deepEqual(replay.save.completed, start.completed);
  await hold(550);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/timed.webm`);

  const legacyApk = process.argv[2];
  let legacy = null;
  if (legacyApk) {
    const legacyContext = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    await configure(legacyContext);
    const files = new Set(execFileSync('unzip', ['-Z1', legacyApk], { encoding: 'utf8' }).split('\n'));
    const type = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json' };
    await legacyContext.route(`${base}/**`, route => {
      const { pathname } = new URL(route.request().url());
      const file = 'assets/public' + (pathname === '/legacy-timed.html' ? '/index.html' : pathname);
      if (!files.has(file)) return route.fallback();
      return route.fulfill({ body: execFileSync('unzip', ['-p', legacyApk, file], { maxBuffer: 8 * 1024 * 1024 }), contentType: type[file.split('.').at(-1)] });
    });
    const old = await legacyContext.newPage();
    old.on('pageerror', error => errors.push(error.message));
    await old.goto(`${base}/legacy-timed.html`);
    await ready(old);
    await clock(old, { civil: 1_000_000, elapsed: 1_000 });
    await open(old);
    const { attempt } = (await store(old)).save.timedProgress.run;
    const target = attempt.board.findIndex((tile, index) => tile !== index);
    await swap(old, attempt.board.indexOf(target), target, 4, 4);
    await clock(old, { civil: 1_011_000 }, 'blur');
    await old.waitForTimeout(250);
    const checkpoint = (await store(old)).save.timedProgress.run;
    assert.equal(checkpoint.startedAt, null);
    assert.equal(checkpoint.remainingMs, 589_000);
    assert.equal(checkpoint.attempt.moves, 1);
    await old.goto(base);
    await ready(old);
    await idle(old);
    const restored = (await store(old)).save.timedProgress.run;
    assert.deepEqual(restored.attempt, checkpoint.attempt);
    assert.equal(restored.remainingMs, checkpoint.remainingMs);
    await solve(old, 4, 4);
    const next = (await store(old)).save.timedProgress.run;
    assert.equal(next.attempt.levelId, 'timed-v1-2');
    assert.equal(next.cleared, 1);
    await clock(old, { elapsed: 590_000 });
    await old.waitForSelector('#hue-app[data-layer=result]');
    assert.equal((await store(old)).finishFacts, 1);
    legacy = { stagedFrom: 'exact signed APK 0.4.25', restoredMoves: 1, remainingMs: 589_000,
      nextRound: next.attempt.levelId, finishedOnce: true };
    await legacyContext.close();
  }
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), roundSize: [7, 7], roundsViaTouch: 7, clockLabels,
    rounds: rounds.map(({ field, pins, moves }) => ({ field, pins, moves })), pausedRemainingMs: 289_000,
    backgroundSimulatedMs: 60_000, timedFinishFactsAfterReloadAndReplay: 1, score: 7,
    secondRunDifferent: true, legacy, clipStartMillis, clipMillis,
    limits: 'Real Chromium touch and IndexedDB. Civil/monotonic clocks and blur controlled. Physical Android not run.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
