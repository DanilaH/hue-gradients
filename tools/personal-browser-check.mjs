import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/personal';
const base = 'http://127.0.0.1:4188';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4188', '--strictPort'], { stdio: 'ignore' });
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
  const errors = [];
  async function profile(record) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
      ...(record ? { recordVideo: { dir: output, size: viewport } } : {}) });
    const captureBase = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('html[data-state=ready]');
    return { page, context, captureBase };
  }
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const card = (page, kind) => page.locator(`[data-personal=${kind}]`);
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const tasks = async page => {
    await page.locator('#levels').tap();
    await button(page, 'Задания').tap();
    await card(page, 'present').waitFor();
  };
  const state = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const snapshot = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    const raw = await store.listFacts('guest-local-v1');
    store.close();
    return { snapshot, awards: raw.flatMap(fact => {
      const record = JSON.parse(fact.payloadJson);
      return record.personalAward ? [record.personalKey] : [];
    }) };
  });
  const newcomer = await profile(false);
  await tasks(newcomer.page);
  assert.equal(await card(newcomer.page, 'past').count(), 0);
  assert.equal(await newcomer.page.locator('[data-personal]').count(), 2);
  await newcomer.context.close();

  const { page, context, captureBase } = await profile(recording);
  await page.locator('#settings').tap();
  await button(page, 'Помощь').tap();
  await button(page, 'Сделать один обмен · +3 хода').tap();
  await page.waitForSelector('#hue-app[data-layer=result]');
  await button(page, 'Дальше').tap();
  await idle(page);
  const campaign = (await state(page)).snapshot;
  await tasks(page);
  assert.equal(await page.locator('[data-personal]').count(), 3);
  assert.match(await card(page, 'past').innerText(), /До 2 ходов/);
  const clipStartMillis = Date.now() - captureBase;
  if (recording) await page.waitForTimeout(450);
  async function improve() {
    await card(page, 'past').tap();
    await idle(page);
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const i of [1, 2]) await page.touchscreen.tap(box.x + (i + .5) * box.width / 4, box.y + box.height / 2);
    await page.waitForSelector('#hue-app[data-layer=result]');
    assert.equal(await page.locator('#dialog-title').textContent(), 'Задание выполнено');
    if (recording) await page.waitForTimeout(425);
    await button(page, 'К заданиям').tap();
    await card(page, 'past').waitFor();
  }
  await improve();
  assert.match(await card(page, 'past').innerText(), /Выполнено/);
  if (recording) await page.waitForTimeout(650);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await improve();
  assert.equal((await state(page)).awards.length, 1);
  await page.evaluate(() => { Date.now = () => Number(sessionStorage.getItem('personal-clock') ?? '1000000'); });
  await card(page, 'present').tap();
  await idle(page);
  assert.equal(await page.locator('#guidance').innerText(), '0:45');
  await page.evaluate(() => sessionStorage.setItem('personal-clock', '1045000'));
  await page.waitForSelector('#hue-app[data-layer=result]');
  assert.equal(await page.locator('#dialog-title').textContent(), 'Время вышло');
  await button(page, 'К заданиям').tap();
  await card(page, 'future').tap();
  await idle(page);
  const result = await state(page);
  const chosen = result.snapshot.personalProgress.tasks[result.snapshot.personalProgress.active];
  assert.equal(chosen.levelId, 'gradient-016');
  assert.equal(chosen.attempt.moves, 0);
  assert.deepEqual(result.snapshot.attempts, campaign.attempts);
  assert.deepEqual(result.snapshot.rights, campaign.rights);
  assert.equal(result.awards.length, 1);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/personal.webm`);
  const report = { browser: browser.version(), emptyProfileSlots: 2, experiencedProfileSlots: 3,
    earlierBest: 3, acceptedPersonalMoves: 1, awardsAfterReplay: 1, future: chosen.levelId,
    presentTimerFixture: '45 seconds, injected time', clipStartMillis, clipMillis };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
