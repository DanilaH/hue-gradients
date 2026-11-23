import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/shapes';
const base = 'http://127.0.0.1:4184';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4184', '--strictPort'], { stdio: 'ignore' });
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
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
    ...(recording ? { recordVideo: { dir: out, size: viewport } } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const getAttempt = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const snapshot = JSON.parse((await db.load('guest-local-v1')).snapshotJson);
    db.close();
    return snapshot.challengeProgress.attempts[snapshot.challengeProgress.active];
  });
  await page.goto(base);
  await page.waitForSelector('html[data-state=ready]');
  await page.locator('#levels').tap();
  await button('Режимы').tap(); await button('Испытания').tap();
  await button('Фигуры').tap();
  const levels = await page.evaluate(async () => (await import('/src/domain/shapeLevels.ts')).geometryLevels);
  const results = [];
  for (const level of levels) {
    await page.locator(`[data-challenge-id=${level.id}]`).tap();
    await idle();
    await page.waitForSelector('#hue-app[data-layer=none]');
    const initial = await getAttempt();
    const points = await page.locator('#board-region canvas').evaluate(async (canvas, level) => {
      const { boardGeometry, cellAt, cellCenter } = await import('/src/game/geometry.ts');
      const { x, y, width, height } = canvas.getBoundingClientRect();
      const geometry = boardGeometry(width, height, level.width, level.height, level.positions);
      return level.startTileAtPosition.map((_, position) => {
        const center = cellCenter(cellAt(geometry, position));
        return { x: center.x + x, y: center.y + y };
      });
    }, level);
    const tap = async position => page.touchscreen.tap(points[position].x, points[position].y);
    const swap = async (a, b) => { await tap(a); await tap(b); await idle(); };
    const to = initial.board.findIndex((tile, i) => tile !== i), from = initial.board.indexOf(to);
    await tap(level.pinnedPositions[0]);
    assert.deepEqual(await getAttempt(), initial);
    const incompatible = level.positions?.findIndex((position, i) => position.shape !== level.positions[from].shape &&
      !level.pinnedPositions.includes(i)) ?? -1;
    if (incompatible >= 0) {
      await swap(from, incompatible);
      assert.deepEqual(await getAttempt(), initial);
    }
    await swap(from, to);
    const changed = await getAttempt();
    const expected = [...initial.board];
    [expected[from], expected[to]] = [expected[to], expected[from]];
    assert.deepEqual(changed.board, expected);
    assert.equal(changed.moves, 1);
    await page.waitForTimeout(recording ? 390 : 150);
    const screenshot = `${out}/${level.id}.png`;
    await page.screenshot({ path: screenshot, scale: 'css' });
    const { x, y } = points[to];
    const rgb = execFileSync('python3', ['-c',
      'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); x,y=map(int,sys.argv[2:]); print("#%02x%02x%02x"%tuple(round(s/64) for s in map(sum,zip(*im.crop((x-4,y-4,x+4,y+4)).getdata()))))',
      screenshot, String(Math.round(x)), String(Math.round(y))], { encoding: 'utf8' }).trim();
    const expectedRgb = level.solvedTileColors[expected[to]];
    assert([1, 3, 5].every(channel => Math.abs(parseInt(rgb.slice(channel, channel + 2), 16) -
      parseInt(expectedRgb.slice(channel, channel + 2), 16)) <= 2), JSON.stringify({ rgb, expectedRgb }));
    await page.locator('#settings').tap();
    await page.locator('#restart').tap();
    await button('Начать заново').tap();
    await idle();
    const replay = await getAttempt();
    assert.deepEqual(replay.board, initial.board);
    assert.deepEqual(replay.generatedStart, initial.generatedStart);
    assert.notEqual(replay.attemptId, initial.attemptId);
    await page.locator('#levels').tap();
    await idle();
    results.push({ id: level.id, moveCount: changed.moves, incompatibleFieldPair: incompatible >= 0,
      rejectedPin: true, renderedRgb: rgb, fixedReplay: true, generated: initial.generatedStart?.mode ?? 'authored' });
  }
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${out}/geometry.webm`);
  const report = { browser: browser.version(), results, method: 'Chromium touch and Pillow 8×8 tile interiors' };
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
