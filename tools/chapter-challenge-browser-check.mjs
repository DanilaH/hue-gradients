import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/chapter-challenge';
const base = 'http://127.0.0.1:4180';
const { levels } = JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json', 'utf8'));
const { rows } = JSON.parse(await readFile('docs/spec/prototype/validation-0.1.json', 'utf8'));
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4180', '--strictPort'], { stdio: 'ignore' });
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
    ...(recording ? { recordVideo: { dir: output, size: viewport } } : {}) });
  const captureBase = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const ready = () => page.waitForSelector('html[data-state=ready]');
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const layer = name => page.waitForSelector(`#hue-app[data-layer=${name}]`);
  const card = id => page.locator(`[data-challenge-id=${id}]`);
  const chapterList = async () => {
    await page.locator('#levels').tap();
    await button('Испытания').tap();
    await button('Финалы глав').tap();
  };
  const levelsBack = async () => { await button('‹ Назад').tap(); await button('‹ Назад').tap(); };
  const canvas = () => page.locator('#board-region canvas').boundingBox();
  function point(box, level, position) {
    return { x: box.x + (position % level.width + .5) * box.width / level.width,
      y: box.y + 4 + (Math.floor(position / level.width) + .5) * (box.height - 8) / level.height };
  }
  const swap = async (level, from, to) => {
    const box = await canvas();
    for (const position of [from, to]) {
      const p = point(box, level, position);
      await page.touchscreen.tap(p.x, p.y);
    }
    await idle();
  };
  const state = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const row = await store.load('guest-local-v1');
    const facts = (await store.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    store.close();
    return { save: JSON.parse(row.snapshotJson), finaleWins: facts.filter(fact =>
      fact.challengeId === 'finale-v1-1' && fact.firstChallengeWin === true).length };
  });
  await page.goto(base);
  await ready();
  for (const level of levels.slice(0, 15)) {
    if (level.ordinal === 15) {
      await chapterList();
      assert(await card('finale-v1-1').isDisabled());
      assert(await card('secret-v1-1').isDisabled());
      await levelsBack();
    }
    for (const [from, to] of rows.find(row => row.id === level.id).legal_optimal_witness) {
      await swap(level, from, to);
    }
    await button('Дальше').tap();
    await idle();
  }
  const before = (await state(page)).save;
  assert.equal(before.completed.length, 15);
  const { finale, secret } = await page.evaluate(async () => {
    const { chapterChallenges } = await import('/src/domain/challenges.ts');
    return { finale: chapterChallenges[0].level, secret: chapterChallenges[1].level };
  });
  async function solve(level) {
    const order = [...level.startTileAtPosition];
    for (let to = 0; to < order.length; to++) {
      const from = order.indexOf(to);
      if (to === from) continue;
      await swap(level, from, to);
      [order[from], order[to]] = [order[to], order[from]];
    }
    await layer('result');
    assert.equal(await page.locator('#dialog-title').textContent(), 'Испытание пройдено');
  }
  await chapterList();
  assert(await card('finale-v1-1').isEnabled());
  assert(await card('secret-v1-1').isDisabled());
  const clipStartMillis = Date.now() - captureBase;
  if (recording) await page.waitForTimeout(300);
  await card('finale-v1-1').tap();
  await idle();
  await solve(finale);
  if (recording) await page.waitForTimeout(700);
  await button('К испытаниям').tap();
  await idle();
  assert.equal((await state(page)).finaleWins, 1);
  assert(await card('secret-v1-1').isEnabled());
  await card('secret-v1-1').tap();
  await idle();
  await layer('secret');
  assert(await button('Открыть поле').isVisible());
  const concealed = (await state(page)).save.challengeProgress.attempts[secret.id];
  const box = await canvas();
  const pin = secret.pinnedPositions[0], movable = secret.startTileAtPosition.findIndex((tile, i) => tile !== i);
  const pinPoint = point(box, secret, pin);
  const movePoint = point(box, secret, movable);
  const coords = [[Math.round(pinPoint.x - 8), Math.round(pinPoint.y)], [Math.round(movePoint.x), Math.round(movePoint.y)]];
  const colorAt = (path) => JSON.parse(execFileSync('python3', ['-c',
    'from PIL import Image; import sys,json; im=Image.open(sys.argv[1]).convert("RGB"); print(json.dumps(["#%02x%02x%02x"%im.getpixel(tuple(p)) for p in json.loads(sys.argv[2])]))',
    path, JSON.stringify(coords)], { encoding: 'utf8' }));
  const hiddenPng = `${output}/concealed.png`;
  await page.waitForTimeout(recording ? 850 : 160);
  await page.screenshot({ path: hiddenPng, scale: 'css' });
  const hiddenPixels = colorAt(hiddenPng);
  assert.deepEqual(hiddenPixels, [secret.solvedTileColors[pin].toLowerCase(), '#2f263d']);
  await page.reload();
  await ready();
  await layer('none');
  const after = (await state(page)).save.challengeProgress.attempts[secret.id];
  assert.deepEqual(after, concealed);
  const openPng = `${output}/revealed.png`;
  await page.waitForTimeout(recording ? 900 : 160);
  await page.screenshot({ path: openPng, scale: 'css' });
  const resumedPixels = colorAt(openPng);
  assert.deepEqual(resumedPixels, [hiddenPixels[0], secret.solvedTileColors[concealed.board[movable]].toLowerCase()]);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await page.locator('#levels').tap();
  await idle();
  await card('finale-v1-1').tap();
  await idle();
  await solve(finale);
  assert.equal((await state(page)).finaleWins, 1);
  await button('К испытаниям').tap();
  await idle();
  await levelsBack();
  await page.locator('#levels').tap();
  await button('Прогресс').tap();
  assert.match(await page.getByLabel('Главы').innerText(), /Глава 1 · 15\/15 · Собрана · Финал пройден/);
  const { save } = await state(page);
  assert.deepEqual(save.completed, before.completed);
  assert.deepEqual(save.rights, before.rights);
  assert.deepEqual(save.attempts, before.attempts);
  assert.deepEqual(errors, []);

  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/chapter.webm`);
  const report = { browser: browser.version(), chapter: 1, campaignClearsViaUI: 15,
    firstFinaleGrantAfterRepeat: 1, lockedAt14: true, hiddenPixels, resumedPixels, savedAttemptSame: true,
    clipStartMillis, clipMillis, limits: 'Actual touch in Chromium, independent PNG pixel decoding; physical device not run.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
