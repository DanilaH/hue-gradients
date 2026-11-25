import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');

const base = 'http://127.0.0.1:4189';
const out = '.test-output/pilot-geometry';
const record = process.env.RECORD_EPISODE === '1';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { stdio: 'ignore' });
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const errors = [];
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* Server starting. */ }
    if (i >= 99) throw Error('Vite did not start');
    await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const app = page => page.locator('#hue-app');
  const canvas = page => page.locator('#board-region canvas');
  const ready = page => page.waitForSelector('html[data-state=ready]');
  const playable = page => page.locator('#hue-app[data-layer=none][data-busy=false]').waitFor();
  const snapshot = page => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('hue-workspace-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const load = db.transaction('workspaces').objectStore('workspaces').get('guest-local-v1');
      load.onerror = () => { db.close(); reject(load.error); };
      load.onsuccess = () => { db.close(); resolve(JSON.parse(load.result.snapshotJson)); };
    };
  }));
  async function profile(viewport, reducedMotion, film = false) {
    const context = await browser.newContext({ viewport, screen: viewport, hasTouch: true, isMobile: true,
      deviceScaleFactor: 1, reducedMotion, acceptDownloads: true, ...(film ? { recordVideo: { dir: out, size: viewport } } : {}) });
    // Keep the test on the real browser download fallback; there is no desktop file picker here.
    await context.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));
    const start = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return { context, start, page };
  }
  const modeList = async page => {
    await page.locator('#levels').tap();
    await button(page, 'Режимы').tap();
    await button(page, 'Испытания').tap();
    await button(page, 'Проба').tap();
    assert.equal(await page.locator('[data-palette-tier=Lo]').count(), 8);
    assert.equal(await page.locator('[data-palette-tier=Hi]').count(), 8);
  };
  const select = async (page, id) => {
    await page.locator(`[data-challenge-id="${id}"]`).tap();
    await playable(page);
    assert.equal(await app(page).getAttribute('data-level'), id);
  };
  const levelFor = (page, id) => page.evaluate(async id => (await import('/src/domain/geometryPilot.ts')).pilotLevel(id), id);
  const attemptFor = async (page, id) => (await snapshot(page)).challengeProgress.attempts[id];
  const center = async (page, level, index) => {
    const box = await canvas(page).boundingBox();
    const [u,v] = level.positions[index].center;
    return { x: box.x + u * box.width, y: box.y + 4 + v * (box.height - 8) };
  };
  async function drag(page, level, from, to) {
    const a = await center(page, level, from), b = await center(page, level, to);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      for (let step = 1; step <= 12; step++) {
        const t = step / 12;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  }
  async function tapPair(page, level, from, to) {
    for (const i of [from,to]) {
      const { x,y } = await center(page, level, i);
      await page.touchscreen.tap(x,y);
    }
  }
  const swapToSolve = board => {
    const to = board.findIndex((tile, i) => tile !== i);
    return [board.indexOf(to), to];
  };
  const restart = async page => {
    await page.getByRole('button', { name: 'Пауза', exact: true }).tap();
    await page.locator('#restart').tap();
    await button(page, 'Начать заново').tap();
    await playable(page);
  };

  const normal = await profile({ width: 390, height: 844 }, 'no-preference', record);
  const { page, context } = normal;
  const legacyRoot = process.env.LEGACY_WEB_ROOT;
  let old;
  if (legacyRoot) {
    const legacyPath = resolve(legacyRoot);
    await context.route(base + '/legacy/**', async route => {
      const file = resolve(legacyPath, new URL(route.request().url()).pathname.slice('/legacy/'.length));
      assert(file.startsWith(legacyPath + '/'));
      await route.fulfill({ path: file });
    });
    await page.goto(base + '/legacy/index.html');
    await ready(page);
    const legacyTap = async width => {
      const box = await canvas(page).boundingBox();
      for (const i of [1,2]) await page.touchscreen.tap(box.x + (i + .5) * box.width / width, box.y + box.height / 2);
    };
    await legacyTap(4);
    await button(page, 'Дальше').tap();
    await playable(page);
    await legacyTap(5);
    await page.waitForSelector('#hue-app[data-moves="1"][data-busy=false]');
    old = await snapshot(page);
  }
  await page.goto(base);
  await ready(page);
  if (old) assert.deepEqual(await snapshot(page), old);
  const start = Date.now() - normal.start;
  const hold = ms => record ? sleep(ms) : Promise.resolve();
  await modeList(page);
  await hold(650);

  const mixed = 'pilot-v1-rift-lo';
  await select(page, mixed);
  const mixedLevel = await levelFor(page, mixed);
  const initial = await attemptFor(page, mixed);
  const [from, to] = swapToSolve(initial.board);
  const fixed = mixedLevel.pinnedPositions.find(index => mixedLevel.positions[index].family === mixedLevel.positions[from].family);
  assert.notEqual(fixed, undefined);
  await drag(page, mixedLevel, from, 5);
  await playable(page);
  assert.deepEqual(await attemptFor(page, mixed), initial);
  await drag(page, mixedLevel, from, fixed);
  await playable(page);
  assert.deepEqual(await attemptFor(page, mixed), initial);
  await hold(250);
  await drag(page, mixedLevel, from, to);
  await page.waitForSelector('#hue-app[data-moves="1"][data-busy=false]');
  const saved = await attemptFor(page, mixed);
  await page.reload();
  await ready(page);
  assert.deepEqual(await attemptFor(page, mixed), saved);
  await hold(350);
  await restart(page);
  const fresh = await attemptFor(page, mixed);
  assert.equal(fresh.moves, 0);
  assert.notEqual(fresh.generatedStart.seed, saved.generatedStart.seed);
  assert.equal(fresh.generatedStart.work, saved.generatedStart.work);
  await page.locator('#levels').tap();
  assert.equal(await button(page, 'Проба').getAttribute('aria-pressed'), 'true');

  const lo = 'pilot-v1-fold-lo';
  await select(page, lo);
  const loLevel = await levelFor(page, lo);
  const rotation = page.waitForFunction(() => Number(document.querySelector('#board-region canvas')?.dataset.settleTurn) !== 0
    && Number.isFinite(Number(document.querySelector('#board-region canvas')?.dataset.settleTurn)));
  let move = await attemptFor(page, lo);
  await hold(400);
  await drag(page, loLevel, ...swapToSolve(move.board));
  await rotation;
  await playable(page);
  await hold(350);
  move = await attemptFor(page, lo);
  assert.equal(move.moves, 1);
  await drag(page, loLevel, ...swapToSolve(move.board));
  await page.waitForSelector('#hue-app[data-layer=result][data-victory-phase=still]');
  assert.equal(await page.locator('#dialog-title').textContent(), 'Испытание пройдено');
  await hold(550);
  await button(page, 'Обои').tap();
  const image = page.locator('.work-card-preview');
  await image.waitFor();
  await page.waitForFunction(() => document.querySelector('.work-card-preview')?.naturalWidth === 390);
  const preview = await image.evaluate(async image => Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer())));
  const received = page.waitForEvent('download');
  await button(page, 'Сохранить PNG').tap();
  const png = await received;
  const pngPath = out + '/pilot-lo-wallpaper.png';
  await png.saveAs(pngPath);
  const bytes = await readFile(pngPath);
  assert.deepEqual(bytes, Buffer.from(preview));
  assert.equal(bytes.readUInt32BE(16),390);
  assert.equal(bytes.readUInt32BE(20),844);
  if (old) {
    const result = await snapshot(page);
    for (const key of ['attempts','bests','completed','rights']) assert.deepEqual(result[key], old[key]);
  }
  await hold(600);
  const duration = Date.now() - normal.start - start;
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(out + '/pilot.webm');

  const compact = await profile({ width: 320, height: 568 }, 'reduce', record);
  const small = compact.page;
  await small.goto(base);
  await ready(small);
  const hiStart = Date.now() - compact.start;
  await modeList(small);
  await select(small, 'pilot-v1-terraces-hi');
  const terraces = await levelFor(small, 'pilot-v1-terraces-hi');
  let step = await attemptFor(small, terraces.id);
  await tapPair(small, terraces, ...swapToSolve(step.board));
  await small.waitForSelector('#hue-app[data-moves="1"][data-busy=false]');
  assert.equal(await canvas(small).getAttribute('data-settle-turn'), null);
  await hold(400);
  await small.locator('#levels').tap();
  await select(small, 'pilot-v1-fold-hi');
  const hiLevel = await levelFor(small, 'pilot-v1-fold-hi');
  for (let i = 0; i < hiLevel.minimumSwaps; i++) {
    step = await attemptFor(small, hiLevel.id);
    await tapPair(small, hiLevel, ...swapToSolve(step.board));
    await small.waitForSelector(`#hue-app[data-moves="${i+1}"][data-busy=false]`);
    await hold(220);
  }
  await small.waitForSelector('#hue-app[data-layer=result][data-victory-phase=still]');
  await button(small, 'Обои').tap();
  await small.waitForFunction(() => document.querySelector('.work-card-preview')?.naturalWidth === 320);
  const hiDownload = small.waitForEvent('download');
  await button(small, 'Сохранить PNG').tap();
  await (await hiDownload).saveAs(out + '/pilot-hi-wallpaper.png');
  const hiBytes = await readFile(out + '/pilot-hi-wallpaper.png');
  assert.equal(hiBytes.readUInt32BE(16), 320);
  assert.equal(hiBytes.readUInt32BE(20), 568);
  assert.notDeepEqual(hiLevel.geometry.corners, loLevel.geometry.corners);
  await hold(500);
  const hiDuration = Date.now() - compact.start - hiStart;
  const hiVideo = small.video();
  await compact.context.close();
  if (hiVideo) await hiVideo.saveAs(out + '/compact.webm');
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), uploadedLegacyRead: !!old, boardAndStartRestored: true,
    freshSeedAfterRestart: true, pinnedAndIncompatibleRejected: true, rotationFrameObserved: true, reducedMotion: true,
    inheritedRightsUnchanged: !!old, downloaded: ['390×844 Lo', '320×568 Hi'],
    corners: { lo: loLevel.geometry.corners, hi: hiLevel.geometry.corners }, start, duration, hiStart, hiDuration };
  await writeFile(out + '/browser.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  await browser?.close();
  server.kill();
}
