import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/challenge';
const base = 'http://127.0.0.1:4179';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4179', '--strictPort'], { stdio: 'ignore' });
const { levels } = JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json', 'utf8'));
const { rows } = JSON.parse(await readFile('docs/spec/prototype/validation-0.1.json', 'utf8'));
await mkdir(out, { recursive: true });
const checks = [];
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
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const title = page.locator('#dialog-title');
  const ready = () => page.waitForSelector('html[data-state=ready]');
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const layer = name => page.waitForSelector(`#hue-app[data-layer=${name}]`);
  const state = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const saved = await store.load('guest-local-v1');
    store.close();
    return JSON.parse(saved.snapshotJson);
  });
  const active = data => data.challengeProgress.attempts[data.challengeProgress.active];
  const list = async () => { await page.locator('#levels').tap(); await button('Испытания').tap(); };
  const card = n => page.locator(`[data-challenge-id=challenge-v1-${n}]`);
  const board = page.locator('#board-region canvas');
  const tap = async (position, width, height) => {
    const box = await board.boundingBox();
    await page.touchscreen.tap(box.x + (position % width + .5) * box.width / width,
      box.y + 4 + (Math.floor(position / width) + .5) * (box.height - 8) / height);
  };
  const swap = async (from, to, width = 4, height = 4) => {
    await tap(from, width, height);
    await tap(to, width, height);
    await idle();
  };

  await page.goto(base);
  await ready();
  await list();
  assert.equal(await page.locator('[data-challenge-id]:enabled').count(), 0);
  await button('‹ Назад').tap();
  await button('‹ Назад').tap();
  for (const level of levels.slice(0, 5)) {
    for (const [from, to] of rows.find(row => row.id === level.id).legal_optimal_witness) {
      await swap(from, to, level.width, level.height);
    }
    await button('Дальше').tap();
    await idle();
  }
  const campaign = await state();
  assert.equal(campaign.completed.length, 5);
  const startMs = Date.now();
  await list();
  assert(await card(1).isEnabled());
  assert(await card(2).isDisabled());
  if (recording) await page.waitForTimeout(500);
  await card(1).tap();
  await idle();
  assert.equal(await page.locator('#guidance').innerText(), 'Ходов осталось · 6');
  const initial = active(await state());
  await tap(0, 4, 4);
  assert.deepEqual(active(await state()), initial);
  await swap(1, 2);
  await page.locator('#levels').tap();
  await idle();
  assert.match(await card(1).innerText(), /Продолжить/);
  await card(1).tap();
  await idle();
  assert.equal(active(await state()).attemptId, initial.attemptId);
  assert.equal(active(await state()).moves, 1);
  await swap(1, 2);
  for (const position of [1, 2, 5, 6]) {
    const current = active(await state());
    if (recording) await page.waitForTimeout(235);
    await swap(position, current.board.indexOf(position));
  }
  await layer('result');
  assert.equal(await title.textContent(), 'Испытание пройдено');
  assert.equal(await page.locator('#dialog-copy').innerText(), 'Ходы · 6 из 6');
  assert(active(await state()).completed);
  if (recording) await page.waitForTimeout(1100);
  await button('К испытаниям').tap();
  await idle();
  assert.match(await card(1).innerText(), /Рекорд · 6/);
  await card(1).tap();
  await idle();
  const replay = active(await state());
  assert.notEqual(replay.attemptId, initial.attemptId);
  assert.deepEqual(replay.board, initial.board);
  for (let i = 0; i < 6; i++) await swap(1, 2);
  await layer('result');
  assert.equal(await title.textContent(), 'Ходы закончились');
  assert.equal(await page.locator('#dialog-copy').innerText(), 'Ходы · 6 из 6');
  const lost = await state();
  assert(!active(lost).completed);
  assert.equal(lost.challengeProgress.best['challenge-v1-1'], 6);
  assert.deepEqual(lost.completed, campaign.completed);
  assert.deepEqual(lost.rights, campaign.rights);
  assert.deepEqual(lost.victories, campaign.victories);
  assert.deepEqual(lost.attempts, campaign.attempts);
  if (recording) await page.waitForTimeout(1000);
  const elapsed = Date.now() - startMs;
  await page.reload();
  await ready();
  await layer('result');
  assert.deepEqual(await state(), lost);
  await button('Повторить').tap();
  await idle();
  assert.deepEqual(active(await state()).board, initial.board);
  await page.locator('#settings').tap();
  assert.equal(await button('Помощь').count(), 0);
  await button('Продолжить').tap();
  assert.deepEqual(errors, []);
  checks.push('real first five campaign wins unlock one challenge', 'pin does not consume the limit',
    'leaving and resuming preserves board and attempt ID', 'sixth move wins in one replay and loses in another',
    'campaign board, history and rights remain identical', 'loss persists after reload and replay restores the fixed start');
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${out}/challenge.webm`);
  const report = { checks, browser: browser.version(), clipStartMillis: startMs - captureBase, clipMillis: elapsed, bankPair: [[5], [3, 3]],
    exactCamera: 'CDP touch inside Chromium', unitThresholdProfiles: 10 };
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
