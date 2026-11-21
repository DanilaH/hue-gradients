import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/queue-feel', base = 'http://127.0.0.1:4193';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4193', '--strictPort'], { stdio: 'ignore' });
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
  await context.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    window.queueSound = { loops: [], glasses: [], vibrations: [] };
    AudioBufferSourceNode.prototype.start = function (...args) {
      const channel = this.loop ? window.queueSound.loops : window.queueSound.glasses;
      channel.push({ context: this.context, duration: this.buffer?.duration });
      return start.apply(this, args);
    };
    navigator.vibrate = pattern => { window.queueSound.vibrations.push(pattern); return true; };
  });
  const captureBase = Date.now();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('html[data-state=ready]');
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const button = name => page.getByRole('button', { name, exact: true });
  const check = name => page.getByRole('checkbox', { name, exact: true });
  const capture = () => page.evaluate(() => ({
    loops: window.queueSound.loops.map(x => ({ duration: x.duration, state: x.context.state })),
    glasses: window.queueSound.glasses.map(x => x.duration), vibrations: window.queueSound.vibrations.length,
  }));
  const clipStartMillis = Date.now() - captureBase;
  await page.locator('#settings').tap();
  assert.equal(await check('Музыка').isChecked(), false);
  await check('Музыка').check();
  await idle();
  await page.waitForFunction(() => window.queueSound.loops[0]?.context.state === 'running');
  await check('Звуки').uncheck();
  await idle();
  assert.equal((await capture()).loops[0].state, 'running');
  assert.deepEqual((await capture()).glasses, []);
  if (recording) await page.waitForTimeout(650);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.queueSound.loops[0]?.context.state === 'suspended');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => window.queueSound.loops[0]?.context.state === 'running');
  await idle();
  await check('Звуки').check();
  await idle();
  await check('Музыка').uncheck();
  await idle();
  await page.waitForFunction(() => window.queueSound.loops[0]?.context.state === 'suspended');
  await button('Вернуться к игре').tap();

  const box = await page.locator('#board-region canvas').boundingBox();
  const left = { x: box.x + box.width * 3 / 8, y: box.y + box.height / 2 };
  const right = { x: box.x + box.width * 5 / 8, y: left.y };
  const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] });
  await touch('touchStart', left);
  await touch('touchMove', { x: left.x + 24, y: left.y - 18 });
  if (recording) await page.waitForTimeout(450);
  await touch('touchMove', { x: 210, y: 19 });
  await touch('touchEnd');
  await idle();
  assert.equal(await page.locator('#hue-app').getAttribute('data-moves'), '0');
  assert.deepEqual((await capture()).glasses, []);
  assert.equal((await capture()).vibrations, 0);
  if (recording) await page.waitForTimeout(450);
  await touch('touchStart', left);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', { x: left.x + i / 8 * (right.x - left.x), y: right.y });
    if (recording) await page.waitForTimeout(45);
  }
  await touch('touchEnd');
  await page.waitForSelector('#hue-app[data-layer=result]');
  await page.waitForFunction(() => window.queueSound.glasses.length === 1);
  assert.equal(await page.locator('#hue-app').getAttribute('data-moves'), '1');
  const audio = await capture();
  assert.equal(audio.loops.length, 1);
  assert.equal(audio.loops[0].duration, 12);
  assert.equal(audio.loops[0].state, 'suspended');
  assert(Math.abs(audio.glasses[0] - .56) < .005);
  assert.equal(audio.vibrations, 1);
  if (recording) await page.waitForTimeout(1000);
  const font = await page.locator('#title').evaluate(node => getComputedStyle(node).fontFamily);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await page.reload();
  await page.waitForSelector('html[data-state=ready]');
  assert.deepEqual((await capture()).glasses, []);
  assert.deepEqual((await capture()).loops, []);
  await button('Дальше').tap();
  await idle();
  const larger = await page.addStyleTag({ content: 'html,body { font-size: 24px !important; }' });
  const settingsFit = [];
  for (const size of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(size);
    await page.locator('#settings').tap();
    const fit = await page.locator('#game-dialog').evaluate(dialog => {
      const missed = [...dialog.querySelectorAll('input,button')].flatMap(control => {
        const rect = control.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight &&
          (target === control || control.parentElement.contains(target)) ? [] : [control.getAttribute('aria-label') ?? control.textContent];
      });
      return { scroll: dialog.scrollHeight, visible: dialog.clientHeight, missed, width: innerWidth, height: innerHeight };
    });
    assert(fit.scroll <= fit.visible + 1 && !fit.missed.length, JSON.stringify({ size, fit }));
    settingsFit.push(size);
    await button('Вернуться к игре').tap();
  }
  await larger.evaluate(el => el.remove());
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${out}/feel.webm`);
  const report = { browser: browser.version(), cancelledMoves: 0, acceptedMoves: 1, independentAudio: true,
    backgroundPause: true, audio, font, settingsFit, clipStartMillis, clipMillis,
    limits: 'Chromium touch and Web Audio instrumentation; GIF is silent. Phone sound, haptics and font judgment remain pending.' };
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
