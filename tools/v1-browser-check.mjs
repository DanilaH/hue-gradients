import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/v12';
const port = 4198, url = `http://127.0.0.1:${port}`;
const record = process.env.RECORD_EPISODE === '1';
const viewport = { width: 390, height: 740 };
await mkdir(out, { recursive: true });
const baselineFolder = process.env.V12_BASELINE_DIR;
const baselinePort = 4199;
const baselineUrl = `http://127.0.0.1:${baselinePort}`;
const serve = (port, cwd) => spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', String(port), '--strictPort'], { cwd, stdio: 'ignore' });
async function waitServer(address) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(address)).ok) return; } catch { /* dev server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not respond at ${address}`);
}
let browser, dev, baseline;
const report = { episodes: {}, quick: {}, limits: 'Chromium CDP touch, keyboard and browser audio/haptic calls. Prepared checkpoints use legal domain swaps. Android phone not run.' };
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  report.browser = browser.version();
  const app = page => page.locator('#hue-app');
  const board = page => page.locator('#board-region canvas');
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const ready = page => page.waitForSelector('html[data-state=ready]');
  const wait = (page, phase) => page.waitForSelector(`#hue-app[data-layer=result][data-victory-phase=${phase}]`);
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const read = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const result = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    store.close();
    return result;
  });
  const camera = async page => JSON.parse(await board(page).getAttribute('data-camera'));
  async function launch({ filming = false, reducedMotion = 'no-preference', deviceScaleFactor = 1 } = {}) {
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: true, isMobile: true, reducedMotion,
      ...(filming && record ? { recordVideo: { dir: out, size: viewport } } : {}) });
    await context.addInitScript(capture => {
      const root = () => document.querySelector('#hue-app');
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
      window.v1 = { sounds: [], pulses: [], frames: [], timeline: [] };
      const epoch = () => performance.timeOrigin + performance.now();
      window.addEventListener('pointerup', event => {
        if (event.target.matches('#board-region canvas')) window.v12LastGesture = epoch();
      }, true);
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (!this.loop) {
          window.v1.sounds.push({ duration: this.buffer?.duration, phase: root()?.dataset.victoryPhase });
          if (capture && this.buffer?.duration >= .23) window.v11Audio = {
            time: epoch(), rate: this.buffer.sampleRate, samples: Array.from(this.buffer.getChannelData(0)),
          };
        }
        return start.apply(this, args);
      };
      navigator.vibrate = value => { window.v1.pulses.push({ value, phase: root()?.dataset.victoryPhase }); return true; };
      const frame = time => {
        const app = root();
        if (app?.dataset.layer === 'result' && window.v12LastGesture && window.v1.timeline.length < 280) {
          const dialog = document.querySelector('#game-dialog');
          const action = dialog.querySelector('button');
          const heading = dialog.querySelector('h2');
          const plane = app.querySelector('.victory-colour');
          const art = app.querySelector('.victory-art');
          const opacity = Number(getComputedStyle(dialog).opacity);
          const actionVisible = action && getComputedStyle(action).visibility === 'visible' && opacity > 0;
          const recoil = plane?.style.transform
            ? new DOMMatrix(getComputedStyle(plane).transform).m42 : 0;
          const covers = !recoil || art.getBoundingClientRect().top <= app.getBoundingClientRect().top &&
            art.getBoundingClientRect().bottom >= app.getBoundingClientRect().bottom;
          window.v1.timeline.push({ ms: epoch() - window.v12LastGesture, phase: app.dataset.victoryPhase,
            recoil, covers, opacity, enabled: !!action && !action.disabled,
            hiddenFromA11y: action?.parentElement.getAttribute('aria-hidden') === 'true',
            headingOpacity: Number(getComputedStyle(heading).opacity), actionVisible: !!actionVisible });
        }
        if (app?.dataset.victoryPhase === 'approach') {
          const canvas = document.querySelector('#board-region canvas');
          if (canvas?.dataset.camera) window.v1.frames.push({ time, camera: JSON.parse(canvas.dataset.camera) });
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, filming && record);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    const touch = (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map((point, id) => ({ ...point, id })) });
    return { context, page, touch, cdp };
  }
  const position = async (page, width, height, i) => {
    const box = await board(page).boundingBox(), view = await camera(page);
    return { x: box.x + view.x + (i % width + .5) * box.width * view.zoom / width,
      y: box.y + 4 + view.y + (Math.floor(i / width) + .5) * (box.height - 8) * view.zoom / height };
  };
  async function finish(page, level) {
    const start = await position(page, level.width, level.height, level.from);
    const end = await position(page, level.width, level.height, level.to);
    await page.touchscreen.tap(start.x, start.y);
    await page.touchscreen.tap(end.x, end.y);
  }
  const first = { width: 4, height: 1, from: 1, to: 2 };
  const observations = page => page.evaluate(() => window.v1);
  async function seed(page, grid) {
    const level = await page.evaluate(async grid => {
      const { Session } = await import('/src/app/session.ts'), { levels } = await import('/src/domain/levels.ts');
      const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
      const { hashText } = await import('/src/local-store/command.ts');
      const { fingerprintPayload } = await import('/src/domain/workspace.ts');
      const { activeChallenge } = await import('/src/domain/challenges.ts');
      const store = await openIndexedDb();
      const fingerprints = new Map(await Promise.all(levels.map(async item => [item.id, await hashText(fingerprintPayload(item))])));
      const session = new Session(store, fingerprints);
      await session.load();
      const id = () => crypto.randomUUID();
      let level, get, kind;
      if (grid !== 'campaign') {
        await session.act({ kind: 'challenge-open', id: `geometry-v1-${grid}`, attemptId: id() });
        const active = () => activeChallenge(session.state.challengeProgress);
        level = active().level;
        get = () => active().attempt;
        kind = 'challenge-swap';
      } else {
        for (const definition of levels.slice(0, 5)) {
          await session.act({ kind: 'open', levelId: definition.id, attemptId: id() });
          let attempt = session.state.attempts[definition.id];
          for (let to = 0; to < attempt.board.length; to++) if (attempt.board[to] !== to) {
            await session.act({ kind: 'swap', from: attempt.board.indexOf(to), to, attemptId: attempt.attemptId });
            attempt = session.state.attempts[definition.id];
          }
        }
        level = levels[5];
        await session.act({ kind: 'open', levelId: level.id, attemptId: id() });
        get = () => session.state.attempts[level.id];
        kind = 'swap';
      }
      const order = [...get().board.keys()];
      const plan = [...get().board], pairs = [];
      for (const to of order) {
        if (grid === 'wide' && [85, 86].includes(to)) continue;
        if (plan[to] === to) continue;
        const from = plan.indexOf(to);
        [plan[from], plan[to]] = [plan[to], plan[from]];
        pairs.push({ from, to });
      }
      if (grid === 'wide') pairs.push({ from: 86, to: 85 });
      const last = pairs.pop();
      for (const pair of pairs) await session.act({ kind, ...pair, attemptId: get().attemptId });
      store.close();
      return { id: level.id, width: level.width, height: level.height, colours: level.solvedTileColors,
        startMoves: get().moves, ...last };
    }, grid);
    // Let the mounted game re-read the durable checkpoint through its normal foreground hook.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector(`#hue-app[data-level="${level.id}"][data-busy=false]`);
    return level;
  }
  async function screenshotGrain(page, level, samplePosition, relative = { x: 0, y: 0 }) {
    const rect = await board(page).boundingBox();
    const p = await position(page, level.width, level.height, samplePosition);
    return board(page).evaluate((canvas, { x, y }) => {
      const dpr = canvas.width / canvas.getBoundingClientRect().width;
      const size = Math.round(dpr * 8);
      const bytes = canvas.getContext('2d').getImageData(Math.round(dpr * x), Math.round(dpr * y), size, size).data;
      const colors = new Set(), mean = [0, 0, 0], pattern = [];
      for (let i = 0; i < bytes.length; i += 4) {
        const pixel = Array.from(bytes.subarray(i, i + 3));
        colors.add(pixel.join(','));
        pattern.push(pixel.join(','));
        pixel.forEach((value, channel) => mean[channel] += value / (size ** 2));
      }
      return { dpr, shades: colors.size, mean, pattern };
    }, { x: p.x - rect.x + relative.x - 4, y: p.y - rect.y + relative.y - 4 });
  }
  const rgb = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  const meanInRange = (sample, expected) => assert(sample.shades >= 3 && sample.mean.every((v, i) => Math.abs(v - rgb(expected)[i]) <= 2),
    JSON.stringify({ mean: sample.mean, expected, shades: sample.shades }));
  async function video(session, name, epoch, clipStart) {
    const handle = session.page.video(), clipEnd = Date.now() - epoch;
    await session.context.close();
    if (handle) await handle.saveAs(`${out}/${name}.webm`);
    return { clipStart, clipEnd };
  }
  async function opaqueCommands(page) {
    const rows = await page.locator('#dialog-actions > *').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).backgroundColor));
    assert(rows.length > 0 && rows.every(colour => colour.startsWith('rgb(')), JSON.stringify(rows));
  }
  async function captureScreen(session, name) {
    const frames = [];
    const { cdp } = session;
    cdp.on('Page.screencastFrame', event => {
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
      if (event.metadata.timestamp) frames.push({ time: event.metadata.timestamp * 1000, data: event.data });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: viewport.width, maxHeight: viewport.height });
    return async () => {
      await cdp.send('Page.stopScreencast');
      const zero = await session.page.evaluate(() => window.v12LastGesture);
      assert(frames.length >= 12);
      const dir = `${out}/${name}`;
      await mkdir(dir, { recursive: true });
      const timeline = [];
      for (const [index, { time, data }] of frames.entries()) {
        const relative = time - zero;
        if (relative < -320 || relative > 3950) continue;
        const file = `frame-${index}.jpg`;
        timeline.push({ file, ms: relative });
        await writeFile(`${dir}/${file}`, Buffer.from(data, 'base64'));
      }
      assert(timeline.some(f => f.ms < 0) && timeline.some(f => f.ms >= 1800));
      await writeFile(`${dir}/frames.json`, JSON.stringify(timeline));
    };
  }
  async function finalDrag(session, level) {
    const start = await position(session.page, level.width, level.height, level.from);
    const end = await position(session.page, level.width, level.height, level.to);
    await session.touch('touchStart', start);
    for (let i = 1; i <= 5; i++) {
      await session.touch('touchMove', { x: start.x + (end.x - start.x) * i / 5, y: start.y + (end.y - start.y) * i / 5 });
      if (record) await session.page.waitForTimeout(45);
    }
    await session.touch('touchEnd');
  }
  if (baselineFolder && record) {
    baseline = serve(baselinePort, baselineFolder);
    await waitServer(baselineUrl);
    const prior = await launch();
    await prior.page.goto(baselineUrl, { waitUntil: 'commit' }); await ready(prior.page);
    const before = await seed(prior.page, 'campaign');
    const stop = await captureScreen(prior, 'compare-before');
    await prior.page.waitForTimeout(150);
    await finalDrag(prior, before);
    await wait(prior.page, 'still');
    await prior.page.waitForTimeout(1300);
    const seen = await observations(prior.page);
    report.baseline = { from: before.from, to: before.to, firstButtonsMs: seen.timeline.find(frame => frame.actionVisible)?.ms };
    await stop();
    await prior.context.close();
    baseline.kill();
    baseline = undefined;
  }
  dev = serve(port);
  await waitServer(url);

  async function trackTiles(page, width) {
    await page.evaluate(async width => {
      const { LIFT_START_MS, RISE_MS, RETURN_MS, tileJump } = await import('/src/game/victoryMotion.ts');
      const canvas = document.querySelector('#board-region canvas');
      window.v11Pair = { shots: [] };
      const capture = () => {
        if (!canvas.dataset.victoryFrame) {
          requestAnimationFrame(capture);
          return;
        }
        const { elapsed, at, airborne, delays } = JSON.parse(canvas.dataset.victoryFrame);
        const neighbor = at % width + 1 === width ? at - 1 : at + 1;
        const [a, b] = [at, neighbor].map(i => tileJump(elapsed, delays[i]));
        const next = window.v11Pair.shots.length;
        const startOfFall = LIFT_START_MS + delays[neighbor] + RISE_MS + 18;
        const falling = elapsed > startOfFall && elapsed < startOfFall + RETURN_MS;
        const hit = next === 0 ? a > .29 && !airborne.includes(neighbor)
          : next === 1 ? !airborne.includes(at) && b > .18 && falling
          : !airborne.includes(at) && !airborne.includes(neighbor);
        if (hit) window.v11Pair.shots.push({ at, neighbor, elapsed, camera: canvas.dataset.camera, a, b,
          image: canvas.toDataURL('image/png') });
        if (window.v11Pair.shots.length < 3 && document.querySelector('#hue-app').dataset.victoryPhase !== 'landed') {
          requestAnimationFrame(capture);
        }
      };
      requestAnimationFrame(capture);
    }, width);
  }
  const ordinary = await launch({ filming: true });
  const { page: p, touch } = ordinary, ordinaryEpoch = Date.now();
  await p.goto(url, { waitUntil: 'commit' }); await ready(p);
  const level = await seed(p, 'campaign');
  const clipStart = Date.now() - ordinaryEpoch;
  const start = await position(p, level.width, level.height, level.from);
  const before = await read(p);
  const expectedColour = level.colours[before.attempts[level.id].board[level.from]];
  const grain = await screenshotGrain(p, level, level.from);
  meanInRange(grain, expectedColour);
  const shifted = { x: start.x + 20, y: start.y - 18 };
  if (record) await p.waitForTimeout(350);
  await touch('touchStart', start);
  await touch('touchMove', shifted);
  await p.waitForTimeout(record ? 350 : 55);
  const held = await screenshotGrain(p, level, level.from, { x: 20, y: -18 });
  // Touch coordinates are quantized by CDP before the CSS-to-backing-pixel conversion.
  const sameGrain = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => held.pattern.every((pixel, i) =>
    pixel === grain.pattern[((Math.floor(i / 8) + dy + 8) % 8) * 8 + (i % 8 + dx + 8) % 8])));
  assert(sameGrain);
  await touch('touchCancel');
  await idle(p);
  assert.deepEqual(await read(p), before);
  const rest = await screenshotGrain(p, level, level.from);
  assert.deepEqual(rest.pattern, grain.pattern);
  await p.locator('#settings').tap();
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Продолжить');
  assert(await board(p).isVisible());
  assert.equal(await p.locator('#game-dialog').evaluate(node => node.getBoundingClientRect().width), viewport.width);
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.textContent), 'Помощь');
  await p.screenshot({ path: `${out}/pause.png` });
  if (record) await p.waitForTimeout(550);
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'settings');
  assert.deepEqual(await read(p), before);
  if (record) await p.waitForTimeout(200);
  const winClipStart = Date.now() - ordinaryEpoch;
  const closeComparison = record ? await captureScreen(ordinary, 'compare-after') : null;
  await trackTiles(p, level.width);
  await finalDrag(ordinary, level);
  await wait(p, 'approach');
  assert.equal(await button(p, 'Дальше').count(), 0);
  assert.equal((await observations(p)).pulses.length, 0);
  await wait(p, 'landed');
  assert.equal(await board(p).isVisible(), false);
  await wait(p, 'still');
  const normalAudio = await observations(p);
  const landing = normalAudio.timeline.find(f => f.phase === 'landed');
  const hold = normalAudio.timeline.find(f => f.phase === 'hold');
  const appears = normalAudio.timeline.find(f => f.phase === 'reveal' && f.actionVisible);
  const readyFrame = normalAudio.timeline.find(f => f.phase === 'still' && f.enabled);
  const peak = normalAudio.timeline.reduce((a, b) => a.recoil >= b.recoil ? a : b);
  assert(landing && hold && appears && readyFrame);
  assert(peak.recoil >= 1.7 && peak.recoil <= 2 && peak.ms - landing.ms <= 65);
  assert(normalAudio.timeline.every(f => f.covers));
  assert(appears.ms - hold.ms >= 210 && appears.ms - hold.ms <= 300);
  assert(readyFrame.ms - appears.ms >= 350 && readyFrame.ms - appears.ms <= 430);
  assert(normalAudio.timeline.filter(f => ['approach','landed','hold'].includes(f.phase))
    .every(f => !f.actionVisible && !f.enabled && f.hiddenFromA11y));
  assert(normalAudio.timeline.filter(f => f.phase === 'reveal').every(f => !f.enabled && f.hiddenFromA11y));
  report.timing = Object.fromEntries(Object.entries({ landing, peak, hold, appears, ready: readyFrame }).map(([name, f]) =>
    [name, { ms: Math.round(f.ms), recoil: f.recoil, opacity: f.opacity }]));
  const snapshots = await p.evaluate(() => window.v11Pair.shots);
  assert.equal(snapshots.length, 3, JSON.stringify(snapshots.map(({ image, ...rest }) => rest)));
  assert.equal(new Set(snapshots.map(({ camera }) => camera)).size, 1);
  const pair = [];
  for (const [index, { image, ...metadata }] of snapshots.entries()) {
    pair.push(metadata);
    await writeFile(`${out}/tile-phase-${index}.png`, Buffer.from(image.split(',')[1], 'base64'));
  }
  if (record) {
    const played = await p.evaluate(() => window.v11Audio);
    const pcm = Buffer.alloc(44 + 2 * played.samples.length);
    pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(played.rate, 24); pcm.writeUInt32LE(played.rate * 2, 28);
    pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36);
    pcm.writeUInt32LE(pcm.length - 44, 40);
    played.samples.forEach((v, i) => pcm.writeInt16LE(Math.round(v * 32_767 * .32), 44 + 2 * i));
    await writeFile(`${out}/ordinary-impact.wav`, pcm);
    report.audioStartMillis = played.time - await p.evaluate(() => window.v12LastGesture);
  }
  await opaqueCommands(p);
  assert.deepEqual(normalAudio.pulses, [{ value: 22, phase: 'landed' }]);
  assert.equal(normalAudio.sounds.length, 1);
  assert(Math.abs(normalAudio.sounds[0].duration - .24) < .003);
  assert.equal(normalAudio.sounds[0].phase, 'landed');
  const won = await read(p);
  assert.equal(won.attempts[level.id].moves, level.startMoves + 1);
  assert.equal(won.victories.filter(v => v.attemptId === won.attempts[level.id].attemptId).length, 1);
  if (record) await p.waitForTimeout(550);
  await closeComparison?.();
  await p.screenshot({ path: `${out}/victory.png` });
  const ordinaryClipEnd = Date.now() - ordinaryEpoch;
  await button(p, 'В альбом').tap();
  const download = p.waitForEvent('download');
  await button(p, 'Сохранить PNG').tap();
  await (await download).saveAs(`${out}/ordinary-wallpaper.png`);
  await p.goto(new URL('?result=reopened', url).href, { waitUntil: 'commit' }); await wait(p, 'still');
  assert.deepEqual((await observations(p)).pulses, []);
  const ordinaryVideo = await video(ordinary, 'ordinary', ordinaryEpoch, clipStart);
  report.episodes.ordinary = { id: level.id, moves: level.startMoves + 1, stableAndMovesWithTile: true, shades: grain.shades,
    mean: grain.mean, source: expectedColour, quietReplay: true, pauseKeyboardAndTouch: true, resultWallpaper: true,
    sounds: normalAudio.sounds, vibration: normalAudio.pulses, pair, ...ordinaryVideo, winClipStart, clipEnd: ordinaryClipEnd };

  const giant = await launch({ filming: true });
  const wide = giant.page, wideEpoch = Date.now();
  await wide.goto(url, { waitUntil: 'commit' }); await ready(wide);
  const large = await seed(wide, 'wide');
  const wideStart = Date.now() - wideEpoch;
  await wide.screenshot({ path: `${out}/field-full.png`, scale: 'device' });
  const wideState = (await read(wide)).challengeProgress.attempts[large.id];
  const naturalLight = await screenshotGrain(wide, large, 154), naturalDark = await screenshotGrain(wide, large, 1);
  meanInRange(naturalLight, large.colours[wideState.board[154]]);
  meanInRange(naturalDark, large.colours[wideState.board[1]]);
  assert(naturalLight.mean[1] > naturalDark.mean[1]);
  if (record) await wide.waitForTimeout(300);
  const field = await board(wide).boundingBox();
  const mid = { x: field.x + field.width / 2, y: field.y + field.height / 2 };
  const points = distance => [{ x: mid.x - distance, y: mid.y }, { x: mid.x + distance, y: mid.y }];
  await giant.touch('touchStart', points(40)[0]);
  await giant.touch('touchStart', ...points(40));
  for (let i = 1; i <= 7; i++) {
    await giant.touch('touchMove', ...points(40 + i * 8));
    if (record) await wide.waitForTimeout(40);
  }
  await giant.touch('touchEnd');
  const zoom = (await camera(wide)).zoom;
  assert(Math.abs(zoom - 2.4) < .03);
  const zoomGrain = await screenshotGrain(wide, large, 85);
  meanInRange(zoomGrain, large.colours[wideState.board[85]]);
  if (record) await wide.waitForTimeout(300);
  await finish(wide, large);
  await wait(wide, 'approach');
  await wide.waitForFunction(() => {
    const view = JSON.parse(document.querySelector('#board-region canvas').dataset.camera);
    return view.zoom <= .951 && view.x > 0 && view.y > 0;
  });
  await wait(wide, 'landed');
  assert.equal(await board(wide).isVisible(), false);
  const sprayColors = await wide.locator('.victory-effects').evaluate(async (canvas, colors) => {
    const wanted = new Set(colors.map(color => Number.parseInt(color.slice(1), 16))), found = new Set();
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 65));
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3] === 255) {
        const color = (pixels[p] << 16) | (pixels[p + 1] << 8) | pixels[p + 2];
        if (wanted.has(color)) found.add(color);
      }
    }
    return found.size;
  }, large.colours);
  assert(sprayColors >= 3, `Particles sampled in ${sprayColors} palette colours`);
  await wait(wide, 'still');
  const bigAudio = await observations(wide);
  assert.deepEqual(bigAudio.pulses, [{ value: 22, phase: 'landed' }]);
  const bigTimes = bigAudio.frames.filter(f => f.camera.zoom <= .951);
  assert(bigTimes.length >= 10 && new Set(bigTimes.slice(-14).map(f => JSON.stringify(f.camera))).size === 1);
  const active = (await read(wide)).challengeProgress;
  assert.equal(active.best[large.id], large.startMoves + 1);
  assert.equal(active.attempts[large.id].completed, true);
  if (record) await wide.waitForTimeout(450);
  const wideClipEnd = Date.now() - wideEpoch;
  await button(wide, 'К испытаниям').tap();
  await idle(wide);
  assert.equal(await app(wide).getAttribute('data-layer'), 'meta');
  const giantVideo = await video(giant, 'wide', wideEpoch, wideStart);
  const deltas = bigAudio.frames.slice(1).map((f, i) => f.time - bigAudio.frames[i].time);
  report.episodes.wide = { id: large.id, zoom, reframe: Math.min(...bigAudio.frames.map(f => f.camera.zoom)),
    moves: large.startMoves + 1, sampledFrames: bigAudio.frames.length,
    medianFrameMs: deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)],
    naturalLight: naturalLight.mean, naturalDark: naturalDark.mean, zoomShades: zoomGrain.shades, sprayColors,
    sounds: bigAudio.sounds, vibration: bigAudio.pulses, ...giantVideo, clipEnd: wideClipEnd };

  const shape = await launch();
  await shape.page.goto(url, { waitUntil: 'commit' }); await ready(shape.page);
  const triangle = await seed(shape.page, 'triangles');
  const taps = await shape.page.evaluate(async ({ from, to }) => {
    const { activeChallenge } = await import('/src/domain/challenges.ts');
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const { boardGeometry, cellAt, cellCenter } = await import('/src/game/geometry.ts');
    const store = await openIndexedDb();
    const profile = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    store.close();
    const { level } = activeChallenge(profile.challengeProgress);
    const bounds = document.querySelector('#board-region canvas').getBoundingClientRect();
    const geometry = boardGeometry(bounds.width, bounds.height, level.width, level.height, level.positions);
    return [from, to].map(index => {
      const cell = cellCenter(cellAt(geometry, index));
      return { x: bounds.x + cell.x, y: bounds.y + cell.y };
    });
  }, triangle);
  for (const { x, y } of taps) await shape.page.touchscreen.tap(x, y);
  await wait(shape.page, 'approach'); await wait(shape.page, 'still');
  const shapeState = (await read(shape.page)).challengeProgress;
  assert.equal(shapeState.best[triangle.id], triangle.startMoves + 1);
  assert.deepEqual((await observations(shape.page)).pulses, [{ value: 22, phase: 'landed' }]);
  report.episodes.triangles = { id: triangle.id, moves: shapeState.best[triangle.id] };
  await shape.context.close();

  for (const scenario of ['back-before-hit', 'back-after-hit', 'early-input', 'stale-input', 'strip', 'reduced', 'background', 'assisted']) {
    const run = await launch({ reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference',
      deviceScaleFactor: scenario === 'reduced' ? 2 : 1 });
    const page = run.page;
    await page.goto(url, { waitUntil: 'commit' }); await ready(page);
    let deviceGrain;
    if (scenario === 'reduced') {
      const { colour } = await page.evaluate(async () => {
        const { levels } = await import('/src/domain/levels.ts');
        const level = levels[0];
        return { colour: level.solvedTileColors[level.startTileAtPosition[1]] };
      });
      deviceGrain = await screenshotGrain(page, first, 1);
      meanInRange(deviceGrain, colour);
      assert(Math.abs(deviceGrain.dpr - 2) < .01);
    }
    if (scenario === 'assisted') {
      await page.locator('#settings').tap();
      await button(page, 'Помощь').tap();
      await button(page, 'Сделать один обмен · +3 хода').tap();
    } else await finish(page, first);
    const phase = scenario === 'reduced' ? 'still' : scenario === 'back-after-hit' ? 'landed' : 'approach';
    await wait(page, phase);
    if (scenario.startsWith('back-')) {
      await page.keyboard.press('Escape');
      await wait(page, 'still');
      assert(await button(page, 'Дальше').isEnabled());
      await page.keyboard.press('Escape');
      await page.waitForSelector('#hue-app[data-layer=none]');
    } else if (scenario === 'early-input' || scenario === 'stale-input') {
      await page.keyboard.press('Tab');
      const target = await page.locator('#dialog-actions button').first().evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.touchscreen.tap(target.x, target.y);
      await page.keyboard.press('Enter');
      if (scenario === 'stale-input') {
        await page.keyboard.down('Enter');
        await run.touch('touchStart', target);
      }
      await wait(page, 'hold');
      await page.keyboard.press('Tab');
      assert.equal(await button(page, 'Дальше').count(), 0);
      await wait(page, 'reveal');
      assert.equal(await button(page, 'Дальше').count(), 0);
      await wait(page, 'still');
      if (scenario === 'stale-input') {
        await page.keyboard.down('Enter');
        await page.keyboard.up('Enter');
        await run.touch('touchEnd');
        await page.waitForTimeout(70);
      }
      assert.equal(await app(page).getAttribute('data-level'), 'gradient-001');
      if (scenario === 'early-input') {
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Дальше');
        await page.keyboard.press('Enter');
      } else await button(page, 'Дальше').tap();
      await page.waitForSelector('#hue-app[data-level=gradient-002][data-layer=none]');
    } else if (scenario === 'background') {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await wait(page, 'still');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await idle(page);
    }
    if (scenario === 'assisted' || scenario === 'strip') await wait(page, 'still');
    await page.waitForTimeout(760);
    const seen = await observations(page), profile = await read(page);
    const firstAttempt = profile.attempts['gradient-001'];
    assert(firstAttempt.completed);
    assert.equal(firstAttempt.moves, scenario === 'assisted' ? 3 : 1);
    assert.equal(firstAttempt.assisted, scenario === 'assisted');
    assert.equal(profile.victories.filter(v => v.attemptId === firstAttempt.attemptId).length, 1);
    const intended = scenario === 'back-before-hit' || scenario === 'background' ? 0 : 1;
    assert.equal(seen.sounds.length, intended, scenario);
    assert.equal(seen.pulses.length, intended, scenario);
    if (scenario === 'reduced') {
      assert.equal(seen.frames.length, 0);
      assert.equal(await page.locator('.victory-effects').isVisible(), false);
      assert.equal(seen.pulses[0].phase, 'still');
    }
    report.quick[scenario] = { moves: firstAttempt.moves, assisted: firstAttempt.assisted, sounds: seen.sounds.length, pulses: seen.pulses.length,
      ...(deviceGrain ? { dpr: deviceGrain.dpr, shades: deviceGrain.shades, mean: deviceGrain.mean } : {}) };
    await run.context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/${record ? 'capture' : 'browser'}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  dev?.kill();
  baseline?.kill();
}
