import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/large-board';
const base = 'http://127.0.0.1:4185';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4185', '--strictPort'], { stdio: 'ignore' });
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
    ...(recording ? { recordVideo: { dir: out, size: viewport } } : {}) });
  const captureBase = Date.now();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  await page.goto(base);
  await page.waitForSelector('html[data-state=ready]');
  await page.locator('#levels').tap();
  await button('Испытания').tap();
  await button('Фигуры').tap();
  await page.locator('[data-challenge-id=geometry-v1-wide]').tap();
  await idle();
  const clipStartMillis = Date.now() - captureBase;

  const canvas = page.locator('#board-region canvas');
  const bounds = await canvas.boundingBox();
  const camera = async () => JSON.parse(await canvas.getAttribute('data-camera'));
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const point = async index => {
    const view = await camera();
    return { x: bounds.x + view.x + (index % 13 + .5) * bounds.width * view.zoom / 13,
      y: bounds.y + 4 + view.y + (Math.floor(index / 13) + .5) * (bounds.height - 8) * view.zoom / 13 };
  };
  const attempt = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const snapshot = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    store.close();
    return snapshot.challengeProgress.attempts[snapshot.challengeProgress.active];
  });
  const touch = (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type,
    touchPoints: points.map((point, id) => ({ ...point, id })) });
  const tap = async index => {
    const { x, y } = await point(index);
    await page.touchscreen.tap(x, y);
  };
  const initial = await attempt();
  assert.equal(initial.board.length, 169);
  if (recording) await page.waitForTimeout(400);
  const movable = await point(83);
  const dragged = { x: movable.x - 13, y: center.y };
  await touch('touchStart', movable);
  await touch('touchMove', dragged);
  const second = { x: center.x + (center.x - dragged.x), y: center.y };
  await touch('touchStart', dragged, second);
  const left = { x: center.x - (center.x - dragged.x) * 2.2, y: center.y };
  const right = { x: center.x + (center.x - dragged.x) * 2.2, y: center.y };
  await touch('touchMove', left, right);
  await touch('touchEnd');
  await idle();
  assert((await camera()).zoom >= 2);
  assert.deepEqual(await attempt(), initial);

  const beforePan = await camera();
  const one = { x: center.x - 34, y: center.y };
  const two = { x: center.x + 34, y: center.y };
  await touch('touchStart', one);
  await touch('touchStart', one, two);
  await touch('touchMove', { x: one.x + 34, y: one.y + 45 }, { x: two.x + 34, y: two.y + 45 });
  await touch('touchEnd');
  const afterPan = await camera();
  assert(afterPan.x > beforePan.x + 25 && afterPan.y > beforePan.y + 35);
  await tap(84);
  assert.equal(await page.locator('.tile-mark').getAttribute('data-position'), '84');
  assert.deepEqual(await attempt(), initial);
  if (recording) await page.waitForTimeout(650);
  await tap(83); await tap(85); await idle();
  const swapped = await attempt();
  assert.equal(swapped.moves, 1);
  assert.equal(swapped.board[83], initial.board[85]);
  assert.equal(swapped.board[85], initial.board[83]);
  if (recording) await page.waitForTimeout(350);

  const cameraBeforeEdge = await camera();
  await touch('touchStart', await point(83));
  await touch('touchMove', { x: bounds.x + bounds.width - 7, y: center.y });
  await page.waitForTimeout(500);
  const afterEdge = await camera();
  assert(afterEdge.x < cameraBeforeEdge.x - 25, JSON.stringify({ afterEdge, cameraBeforeEdge }));
  await touch('touchMove', { x: bounds.x + bounds.width - 7, y: bounds.y - 15 });
  await touch('touchEnd');
  await idle();
  assert.deepEqual(await attempt(), swapped);
  if (recording) await page.waitForTimeout(450);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${out}/zoom.webm`);
  const report = { browser: browser.version(), cells: 169, secondFingerCanceled: true, zoom: afterPan.zoom,
    pan: { x: afterPan.x - beforePan.x, y: afterPan.y - beforePan.y }, hitPin: 84, swapped: [83, 85],
    edgePan: afterEdge.x - cameraBeforeEdge.x, outsideDropUnchanged: true, clipStartMillis, clipMillis };
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
