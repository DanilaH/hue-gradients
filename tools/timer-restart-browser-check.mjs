import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/timer-restart';
const base = 'http://127.0.0.1:4196';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4196', '--strictPort'], { stdio: 'ignore' });

const errors = [];
const report = { scenarios: {}, limits: 'Real Chromium monotonic time, touch and IndexedDB. Fixed civil date for the personal task. No physical Android run.' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const label = page => page.locator('#guidance').innerText();
const seconds = text => {
  const [, mins, secs] = /^(\d+):(\d\d)/.exec(text);
  return Number(mins) * 60 + Number(secs);
};
const timer = (page, mode) => page.evaluate(async mode => {
  const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
  const db = await openIndexedDb();
  const row = await db.load('guest-local-v1');
  const snapshot = JSON.parse(row.snapshotJson);
  const { active, tasks } = snapshot.personalProgress ?? {};
  const task = tasks?.[active];
  const run = snapshot.timedProgress?.run;
  const clock = mode === 'timed' ? run : task?.clock;
  const attempt = mode === 'timed' ? run?.attempt : task?.attempt;
  const facts = await db.listFacts('guest-local-v1');
  db.close();
  return { ...clock, attempt, key: mode === 'timed' ? run?.id : active, observed: row.clockElapsedMs ?? 0,
    awards: facts.filter(fact => {
      const value = JSON.parse(fact.payloadJson);
      return value.timedFinished || value.personalAward;
    }).length };
}, mode);

const ready = (page, mode) => page.waitForSelector(
  `#hue-app[data-mode=${mode}][data-layer=none][data-busy=false]`);
async function running(page, mode) {
  await ready(page, mode);
  await page.waitForFunction(async mode => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const data = JSON.parse((await db.load('guest-local-v1')).snapshotJson);
    db.close();
    const tasks = data.personalProgress;
    const clock = mode === 'timed' ? data.timedProgress.run : tasks.tasks[tasks.active].clock;
    return clock.startedAt !== null;
  }, mode, { polling: 75 });
}
async function swapOnce(page, mode, attempt) {
  const level = await page.evaluate(async mode => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const data = JSON.parse((await db.load('guest-local-v1')).snapshotJson);
    db.close();
    if (mode === 'timed') return data.timedProgress.run.field;
    const { personalLevel } = await import('/src/domain/personal.ts');
    return personalLevel(data.personalProgress.tasks[data.personalProgress.active].levelId);
  }, mode);
  const to = attempt.board.findIndex((tile, index) => tile !== index);
  const box = await page.locator('#board-region canvas').boundingBox();
  for (const index of [attempt.board.indexOf(to), to]) {
    await page.touchscreen.tap(box.x + (index % level.width + .5) * box.width / level.width,
      box.y + 4 + (Math.floor(index / level.width) + .5) * (box.height - 8) / level.height);
  }
  await ready(page, mode);
  assert.equal((await timer(page, mode)).attempt.moves, 1);
}
let context;
try {
  for (let retry = 0; retry < 100; retry++) {
    if (await fetch(base).then(response => response.ok).catch(() => false)) break;
    if (retry === 99) throw new Error('Vite unavailable');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const mode of ['timed', 'personal']) {
    const directory = await mkdtemp(`${output}/${mode}-`);
    const openProfile = async () => {
      context = await chromium.launchPersistentContext(directory, {
        executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
        args: ['--no-sandbox'], viewport: { width: 390, height: 740 }, isMobile: true,
        hasTouch: true, reducedMotion: 'reduce', timezoneId: 'UTC',
      });
      await context.addInitScript(() => {
        const CivilDate = Date, day = CivilDate.parse('2026-11-22T12:00:00Z');
        window.Date = class extends CivilDate {
          constructor(...args) { super(...(args.length ? args : [day])); }
          static now() { return day; }
        };
      });
      const page = context.pages()[0] ?? await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForSelector('html[data-state=ready]');
      return page;
    };
    let page = await openProfile();
    await page.locator('#levels').tap();
    await button(page, mode === 'timed' ? 'Испытания' : 'Задания').tap();
    await (mode === 'timed' ? page.getByRole('button', { name: /^Заезд на время/ }) : page.locator('[data-personal=present]')).tap();
    await running(page, mode);
    const started = await timer(page, mode);
    const initial = await label(page);
    const restarts = [];
    for (const index of [1, 2]) {
      if (index === 2) await swapOnce(page, mode, started.attempt);
      const target = seconds(await label(page)) - 3;
      await page.waitForFunction(target => {
        const [, mins, secs] = /^(\d+):(\d\d)/.exec(document.querySelector('#guidance').textContent);
        return Number(mins) * 60 + Number(secs) <= target;
      }, target);
      const before = await label(page), saved = await timer(page, mode);
      assert(saved.observed >= 2000, JSON.stringify(saved));
      await page.screenshot({ path: `${output}/${mode}-${index}-before.png` });
      if (index === 1) await page.reload();
      else { await context.close(); page = await openProfile(); }
      await running(page, mode);
      const after = await label(page), restored = await timer(page, mode);
      assert.equal(restored.key, started.key);
      assert.deepEqual(restored.attempt, saved.attempt);
      assert.equal(restored.awards, started.awards);
      assert(seconds(after) <= seconds(before) && seconds(before) - seconds(after) <= 1, JSON.stringify({ before, after }));
      await page.screenshot({ path: `${output}/${mode}-${index}-after.png` });
      restarts.push({ before, after, remainingMs: restored.remainingMs, moves: restored.attempt.moves });
    }
    await page.locator('#settings').tap();
    await page.waitForTimeout(350);
    const paused = await timer(page, mode);
    assert.equal(paused.startedAt, null);
    await page.waitForTimeout(1100);
    assert.equal((await timer(page, mode)).remainingMs, paused.remainingMs);
    await button(page, 'Продолжить').tap();
    await running(page, mode);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(350);
    const hidden = await timer(page, mode);
    assert.equal(hidden.startedAt, null);
    await page.waitForTimeout(1100);
    assert.equal((await timer(page, mode)).remainingMs, hidden.remainingMs);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await running(page, mode);
    assert.equal((await timer(page, mode)).remainingMs, hidden.remainingMs);
    report.scenarios[mode] = { initial, restarts, pausedMs: paused.remainingMs, backgroundMs: hidden.remainingMs, sameAttempt: true };
    await context.close();
    context = undefined;
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await context?.close();
  server.kill();
}
