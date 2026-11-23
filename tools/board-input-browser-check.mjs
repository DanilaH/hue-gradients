import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const base = process.env.HUE_TEST_URL ?? 'http://127.0.0.1:4173';
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const dev = process.env.HUE_TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* Vite is still starting. */ }
    if (i === 99) throw new Error('Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const out = '.test-output/board-input';
  await mkdir(out, { recursive: true });
  const checks = [], sizes = [];
  const definitions = JSON.parse(await readFile('docs/spec/candidates/levels-0.1.json', 'utf8')).campaign;
  const witnesses = JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json', 'utf8')).rows;
  const ready = page => page.waitForSelector('html[data-state=ready]');
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const moves = async page => Number(await page.locator('#hue-app').getAttribute('data-moves'));
  const result = async page => {
    await page.waitForSelector('#hue-app[data-layer=result]');
    assert.equal(await moves(page), 1);
  };
  const touch = async (session, type, x, y) => {
    await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  };
  async function drag(session, from, to, pace = 0) {
    await touch(session, 'touchStart', from.x, from.y);
    for (let step = 1; step <= 10; step++) {
      await touch(session, 'touchMove', from.x + (to.x - from.x) * step / 10, from.y + (to.y - from.y) * step / 10);
      if (pace) await new Promise(resolve => setTimeout(resolve, pace));
    }
    await touch(session, 'touchEnd');
  }
  function point(box, width, height, position) {
    return { x: box.x + (position % width + .5) * box.width / width,
      y: box.y + 4 + (Math.floor(position / width) + .5) * (box.height - 8) / height };
  }
  const board = page => page.locator('#board-region canvas');
  for (const kind of ['tap', 'drop']) {
    for (const x of [199, 200, 201]) {
      const record = kind === 'drop' && x === 200 && process.env.RECORD_EPISODE === '1';
      const viewport = { width: 400, height: 800 };
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
        ...(record ? { recordVideo: { dir: out, size: viewport } } : {}) });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await ready(page);
      const box = await board(page).boundingBox();
      assert.equal(box.x + box.width / 2, 200);
      const left = point(box, 4, 1, 1);
      const session = await context.newCDPSession(page);
      if (kind === 'tap') {
        await page.touchscreen.tap(left.x, left.y);
        await page.touchscreen.tap(x, 398);
      } else {
        if (record) await page.waitForTimeout(360);
        await drag(session, left, { x, y: 398 }, record ? 68 : 0);
      }
      if (x < 200) {
        await idle(page);
        assert.equal(await moves(page), 0);
        await drag(session, left, { x: box.x + 10, y: 398 });
        assert.equal(await moves(page), 0);
        await drag(session, left, { x: 200, y: 20 });
        assert.equal(await moves(page), 0);
        await page.touchscreen.tap(box.x + 10, 398);
        assert.equal(await page.locator('.tile-mark').getAttribute('data-kind'), 'pin');
        await idle(page);
        assert.equal(await moves(page), 0);
      } else await result(page);
      checks.push({ kind, x, y: 398, moves: await moves(page), pinAndOutside: x < 200 });
      assert.deepEqual(errors, []);
      if (record) await page.waitForTimeout(1550);
      const video = page.video();
      await context.close();
      if (video) await video.saveAs(`${out}/seam.webm`);
    }
  }

  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(base);
  await ready(page);
  for (const level of definitions.slice(0, 2)) {
    const box = await board(page).boundingBox();
    for (const pair of witnesses.find(row => row.id === level.id).legalOptimalWitness) {
      for (const position of pair) {
        const p = point(box, level.width, level.height, position);
        await page.touchscreen.tap(p.x, p.y);
      }
      await idle(page);
    }
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
    await idle(page);
  }
  assert.equal(await page.locator('#hue-app').getAttribute('data-level'), 'gradient-003');

  async function measure(width, height, inset) {
    const style = inset ? await page.addStyleTag({
      content: '#hue-app { padding: 24px !important; }',
    }) : null;
    await page.waitForTimeout(150);
    const box = await board(page).boundingBox();
    const measurement = { width, height, inset, cellWidth: box.width / width, cellHeight: (box.height - 8) / height };
    assert(measurement.cellWidth >= 48 && measurement.cellHeight >= 48, JSON.stringify(measurement));
    for (const selector of ['#levels', '#settings']) {
      const button = await page.locator(selector).boundingBox();
      assert(button.width >= 48 && button.height >= 48 && button.x >= 0 && button.y >= 0 &&
        button.x + button.width <= 568 && button.y + button.height <= 320, `${selector} ${JSON.stringify(button)}`);
    }
    for (const row of [0, height - 1]) {
      const p = point(box, width, height, row * width + (width - 1));
      assert(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches('#board-region canvas'), p));
      await page.touchscreen.tap(p.x, p.y);
      await idle(page);
      if (await page.locator('#hue-app[data-layer=pin-guide]').count()) {
        await page.getByRole('button', { name: 'К игре', exact: true }).click();
      }
    }
    sizes.push(measurement);
    if (inset) await page.screenshot({ path: `${out}/landscape-${width}x${height}.png` });
    await style?.evaluate(node => node.remove());
  }
  await measure(1, 5, false);
  await measure(1, 5, true);
  const late = definitions.find(level => level.width === 6 && level.height === 5);
  await page.evaluate(async id => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const { prepareCommit } = await import('/src/local-store/command.ts');
    const { getLevel } = await import('/src/domain/levels.ts');
    const { createAttempt } = await import('/src/domain/puzzle.ts');
    const store = await openIndexedDb();
    const old = await store.load('guest-local-v1');
    const state = JSON.parse(old.snapshotJson);
    state.activeLevelId = id;
    state.attempts[id] = createAttempt(getLevel(id), 'test-landscape-checkpoint');
    await store.commit(await prepareCommit({ operationId: crypto.randomUUID(), vaultId: 'guest-local-v1',
      expectedRevision: old.localRevision, nextSnapshotJson: JSON.stringify(state), facts: [] }));
    store.close();
  }, late.id);
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#hue-app').getAttribute('data-level'), late.id);
  await measure(6, 5, false);
  await measure(6, 5, true);
  await context.close();
  const evidence = { browser: browser.version(), touch: checks, landscape: sizes, lateCheckpoint: late.id,
    limits: 'CDP touch and simulated safe insets in Chromium. 6×5 opens from a seeded saved attempt.' };
  await writeFile(`${out}/browser.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close();
  dev?.kill();
}
