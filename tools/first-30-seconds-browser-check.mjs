import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/pr21';
const base = 'http://127.0.0.1:4201';
const record = process.env.RECORD_EPISODE === '1';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4201', '--strictPort'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const intro = 'Поменяй местами две полосы без точек';
const field = page => page.locator('#board-region canvas');
const action = (page, name) => page.getByRole('button', { name, exact: true });
const ready = page => page.waitForSelector('html[data-state=ready]');
const playable = (page, id) => page.waitForSelector(
  `#hue-app[data-level=gradient-${id}][data-layer=none][data-busy=false]:not([data-board-entry])`);
const store = page => page.evaluate(async () => {
  const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
  const db = await openIndexedDb();
  try {
    const row = await db.load('guest-local-v1');
    return { state: JSON.parse(row.snapshotJson), revision: row.localRevision, facts: await db.listFacts('guest-local-v1') };
  } finally { db.close(); }
});
const observed = page => page.evaluate(() => window.firstEpisode);
const cueOn = (page, returning) => page.waitForFunction(returning => {
  const entries = window.firstEpisode.cues.at(-1)?.samples;
  return entries && Number(document.querySelector('#board-region canvas')?.dataset.firstSwapOffset) > .2 &&
    (returning ? Math.max(...entries) > 2.9 && entries.at(-1) < 2.7 : entries.at(-1) < 2.5);
}, returning);
const cueOff = page => page.locator('#board-region canvas:not([data-first-swap-offset])').waitFor();
const waitForIntro = page => page.waitForFunction(text => document.querySelector('#guidance')?.textContent === text, intro);
let browser;
let nextTouch;
const results = [];

async function profile(run, { viewport = { width: 390, height: 844 }, film = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion,
    ...(film ? { recordVideo: { dir: out, size: viewport } } : {}) });
  try {
    await context.addInitScript(() => {
      const report = window.firstEpisode = { cues: [], phases: [], victoryFrames: [], audio: [], haptics: [] };
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer) report.audio.push({ duration: this.buffer.duration,
          phase: document.querySelector('#hue-app')?.dataset.victoryPhase });
        return original.apply(this, args);
      };
      Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: pattern => {
        report.haptics.push({ pattern, phase: document.querySelector('#hue-app')?.dataset.victoryPhase }); return true;
      } });
      let cue, lastOffset, lastPhase, lastFrame;
      const observe = () => {
        const canvas = document.querySelector('#board-region canvas'), root = document.querySelector('#hue-app');
        const offset = canvas?.dataset.firstSwapOffset;
        if (offset !== undefined) {
          if (!cue) { cue = { at: performance.now(), samples: [] }; report.cues.push(cue); }
          if (lastOffset !== offset) cue.samples.push(Number(offset));
        } else cue = undefined;
        lastOffset = offset;
        const phase = root?.dataset.victoryPhase;
        if (phase && phase !== lastPhase) report.phases.push(phase);
        lastPhase = phase;
        const frame = canvas?.dataset.victoryFrame;
        if (frame && frame !== lastFrame) report.victoryFrames.push(JSON.parse(frame));
        lastFrame = frame;
      };
      new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-first-swap-offset', 'data-victory-phase', 'data-victory-frame'] });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = Date.now();
    await page.goto(base);
    try { await ready(page); }
    catch (error) { throw new Error(`Startup failed: ${(await page.locator('body').innerText()).slice(0, 500)} ${errors.join('; ')}`, { cause: error }); }
    await playable(page, '001'); await waitForIntro(page);
    const touch = await context.newCDPSession(page);
    const mark = film ? async point => page.evaluate(point => {
      let dot = document.getElementById('episode-touch');
      if (!point) { dot?.remove(); return; }
      if (!dot) {
        dot = document.createElement('div'); dot.id = 'episode-touch';
        dot.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;' +
          'border:2px solid #fff5e9;border-radius:50%;background:#21172d4a;transform:translate(-50%,-50%)';
      }
      (document.querySelector('dialog[open]') ?? document.body).append(dot);
      dot.style.left = `${point.x}px`; dot.style.top = `${point.y}px`;
    }, point) : async () => {};
    const center = async (index, tiles) => {
      const box = await field(page).boundingBox();
      return { x: box.x + (index + .5) * box.width / tiles, y: box.y + box.height / 2 };
    };
    const tap = async (index, tiles = 4) => {
      const point = await center(index, tiles);
      await mark(point); await page.touchscreen.tap(point.x, point.y);
      if (film) await sleep(125);
      await mark(null);
    };
    const drag = async (from, to, cancel = false) => {
      const a = await center(from, 4), b = await center(to, 4);
      const send = (type, ...touchPoints) => touch.send('Input.dispatchTouchEvent', { type, touchPoints });
      await mark(a); await send('touchStart', a);
      if (from === to) await send('touchMove', { x: a.x + 20, y: a.y });
      for (let i = 1; i <= 8; i++) {
        const p = { x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 };
        await send('touchMove', p); await mark(p);
        if (film) await sleep(31);
      }
      await send(cancel ? 'touchCancel' : 'touchEnd'); await mark(null);
    };
    const take = Date.now();
    const result = await run({ page, tap, drag, film });
    assert.deepEqual(errors, []);
    if (film) {
      const end = Date.now(), video = page.video();
      await context.close();
      await video.saveAs(`${out}/${result.name}.webm`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', ((take-start)/1000).toFixed(3),
        '-i', `${out}/${result.name}.webm`, '-t', ((end-take)/1000).toFixed(3), '-an', '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/Poluson-0.4.48-${result.name}.mp4`]);
    }
    results.push(result);
    console.log('PASS', result.name);
  } finally { await context.close(); }
}

async function finish({ page, tap, film }, name, { moving = true, earlyInput = false } = {}) {
  await page.locator('#hue-app[data-layer=result]').waitFor();
  if (earlyInput) {
    assert(nextTouch);
    await page.locator('#hue-app[data-victory-phase=approach]').waitFor();
    await page.touchscreen.tap(nextTouch.x, nextTouch.y);
    await page.keyboard.down('Enter');
  }
  await page.locator('#hue-app[data-victory-phase=still]').waitFor();
  if (earlyInput) {
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.equal(await page.locator('#hue-app').getAttribute('data-level'), 'gradient-001');
  }
  const pristine = await store(page);
  const { audio, haptics, phases, cues, victoryFrames } = await observed(page);
  assert.deepEqual(pristine.state.attempts['gradient-001'].board, [0,1,2,3]);
  assert.equal(pristine.state.attempts['gradient-001'].moves, 1);
  assert.equal(pristine.state.attempts['gradient-001'].assistsUsed, 0);
  assert.equal(pristine.state.victories.filter(win => win.levelId === 'gradient-001').length, 1);
  assert(pristine.state.onboarding.firstSwapDone);
  assert.equal(audio.length, 1);
  assert(Math.abs(audio[0].duration - .24) < .003);
  assert.deepEqual(haptics.map(cue => cue.pattern), [22]);
  if (moving) {
    assert(phases.includes('approach') && phases.includes('landed') && phases.includes('reveal'));
    assert(victoryFrames.some(frame => frame.airborne.length > 0 && frame.airborne.length < 4));
    assert.equal(audio[0].phase, 'landed');
    assert.equal(haptics[0].phase, 'landed');
  } else assert(!phases.includes('approach') && !phases.includes('landed'));
  assert(await action(page, 'В альбом').isVisible());
  const next = action(page, 'Дальше');
  const nextBounds = await next.boundingBox();
  nextTouch ??= { x: nextBounds.x + nextBounds.width / 2, y: nextBounds.y + nextBounds.height / 2 };
  if (film) await sleep(660);
  await next.tap();
  await playable(page, '002');
  assert.deepEqual((await store(page)).state.attempts['gradient-002'].board, [0,3,1,2,4]);
  assert.equal((await store(page)).state.attempts['gradient-002'].moves, 0);
  assert.equal(await page.locator('#guidance').textContent(), '');
  if (film) await sleep(420);
  await tap(1, 5); await tap(2, 5); await playable(page, '002');
  await page.locator('#board-region canvas[data-settling=false]').waitFor();
  const saved = await store(page);
  assert.deepEqual(saved.state.attempts['gradient-002'].board, [0,1,3,2,4]);
  assert.equal(saved.state.attempts['gradient-002'].moves, 1);
  if (film) await sleep(550);
  await page.reload(); await ready(page); await playable(page, '002');
  assert.deepEqual(await store(page), saved);
  if (film) await sleep(390);
  return { name, cues: cues.length, phases, audio, haptics, moves: [1,1], first002: saved.state.attempts['gradient-002'].board,
    reloadMatches: true, moving, earlyInput };
}

try {
  await mkdir(out, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 99) throw new Error('Vite unavailable');
    await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  await profile(async step => {
    if (step.film) await sleep(380);
    await step.tap(1); await step.tap(2);
    const result = await finish(step, '001-immediate');
    assert.equal(result.cues, 0);
    return result;
  }, { film: record });
  await profile(async step => {
    const prior = await store(step.page);
    await cueOn(step.page, false);
    await cueOff(step.page);
    assert.deepEqual(await store(step.page), prior);
    assert.deepEqual((await observed(step.page)).audio, []);
    assert.deepEqual((await observed(step.page)).haptics, []);
    if (step.film) await sleep(260);
    await step.drag(1, 2);
    const result = await finish(step, '001-after-wait');
    assert.equal(result.cues, 1);
    return result;
  }, { film: record });

  if (!record) {
    for (const width of [390, 320]) {
      await profile(async ({ page }) => {
        const baseline = await store(page), before = await field(page).evaluate(canvas => canvas.toDataURL());
        const bounds = await field(page).boundingBox();
        const box = await page.locator('#guidance').boundingBox();
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= (width === 390 ? 844 : 568));
        await sleep(12_000);
        const { cues, audio, haptics } = await observed(page);
        assert.equal(cues.length, 1);
        assert(Math.max(...cues[0].samples) > 2.9 && Math.max(...cues[0].samples) <= 3);
        assert.equal(await field(page).evaluate(canvas => canvas.toDataURL()), before);
        assert.deepEqual(await field(page).boundingBox(), bounds);
        assert.deepEqual(await store(page), baseline);
        assert.deepEqual(audio, []); assert.deepEqual(haptics, []);
        return { name: `idle-${width}`, cues, untouched: true };
      }, { viewport: { width, height: width === 390 ? 844 : 568 } });
    }
    for (const returning of [false, true]) {
      await profile(async step => {
        await cueOn(step.page, returning);
        if (returning) await step.drag(1, 2);
        else { await step.tap(1); await step.tap(2); }
        return finish(step, returning ? 'interrupt-return-drag' : 'interrupt-outward-taps', { earlyInput: !returning });
      });
    }
    await profile(async ({ page, tap, drag }) => {
      const board = await field(page).boundingBox();
      for (const [to,cancel] of [[0,false],[-1,false],[1,false],[2,true]]) {
        await drag(1,to,cancel);
        await playable(page,'001');
      }
      const unchanged = await store(page);
      assert.equal(unchanged.state.attempts['gradient-001'].moves,0);
      assert.equal(unchanged.state.attempts['gradient-001'].assistsUsed,0);
      await tap(0);
      await page.waitForFunction(() => document.querySelector('#guidance')?.textContent === 'Плитки с точкой закреплены');
      assert.deepEqual(await field(page).boundingBox(),board);
      await waitForIntro(page);
      await tap(0); await playable(page,'001'); await tap(0);
      await page.locator('#hue-app[data-layer=pin-guide]').waitFor();
      await action(page,'К игре').tap(); await playable(page,'001'); await waitForIntro(page);
      await sleep(4300);
      assert.equal((await observed(page)).cues.length,0);
      assert.equal((await store(page)).state.attempts['gradient-001'].moves,0);
      return { name:'pin-and-cancel', stableBounds:true, moves:0, assists:0 };
    }, { viewport: { width: 320, height: 568 } });
    for (const background of [false,true]) {
      await profile(async ({ page }) => {
        if (background) {
          await cueOn(page,false);
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
          // A blocked renderer may leave the old frame on its hidden canvas until foreground.
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        } else {
          await page.locator('#settings').tap();
          await action(page,'Продолжить').tap();
        }
        await playable(page,'001'); await cueOff(page);
        await sleep(4300);
        assert.equal((await observed(page)).cues.length, Number(background));
        return { name:background ? 'background-during-cue' : 'pause-before-cue', canceled:true };
      });
    }
    await profile(async step => {
      await sleep(4450);
      assert.equal((await observed(step.page)).cues.length,0);
      await step.drag(1,2);
      return finish(step,'system-reduced-motion',{moving:false});
    }, { reducedMotion:'reduce' });
    await profile(async step => {
      const { page, tap } = step;
      await page.locator('#settings').tap();
      await action(page,'Настройки').tap();
      await page.getByRole('checkbox',{name:'Анимации',exact:true}).uncheck();
      await page.waitForSelector('#hue-app[data-busy=false][data-motion=false]');
      await page.reload(); await ready(page); await playable(page,'001'); await waitForIntro(page);
      await sleep(4450);
      assert.equal((await observed(page)).cues.length,0);
      await tap(1); await tap(2);
      return finish(step,'game-motion-off',{moving:false});
    });
  }
  await writeFile(`${out}/acceptance${record ? '-recorded' : ''}.json`, JSON.stringify({
    browser: browser.version(), version:'0.4.48', results,
  }, null, 2)+'\n');
} finally { await browser?.close(); server.kill(); }
