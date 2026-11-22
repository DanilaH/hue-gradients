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
  async function profile(day, record = false) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, timezoneId: 'UTC', reducedMotion: 'reduce',
      ...(record ? { recordVideo: { dir: output, size: viewport } } : {}) });
    await context.addInitScript(day => {
      const CivilDate = Date;
      const initial = CivilDate.parse(day + 'T12:00:00Z');
      const now = () => Number(sessionStorage.getItem('personal-date')) || initial;
      window.Date = class extends CivilDate {
        constructor(...args) { super(...(args.length ? args : [now()])); }
        static now() { return now(); }
      };
      Object.defineProperty(performance, 'now', { value: () => Number(sessionStorage.getItem('personal-elapsed')) || 1_000 });
    }, day);
    const captureBase = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await ready(page);
    return { page, context, captureBase };
  }
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const card = (page, kind) => page.locator(`[data-personal=${kind}]`);
  const ready = page => page.waitForSelector('html[data-state=ready]');
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const tasks = async page => {
    await page.locator('#levels').tap();
    await button(page, 'Задания').tap();
    await card(page, 'present').waitFor();
  };
  const date = async (page, day) => {
    await page.evaluate(day => sessionStorage.setItem('personal-date', String(Date.parse(day + 'T12:00:00Z'))), day);
    await page.reload();
    await ready(page);
    await tasks(page);
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
  const seedCampaign = async (page, countPerChapter) => {
    await page.evaluate(async counts => {
      const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
      const { hashText, prepareCommit } = await import('/src/local-store/command.ts');
      const { levels, chapters } = await import('/src/domain/levels.ts');
      const { levelIsOpen } = await import('/src/domain/progression.ts');
      const { applyAction, fingerprintPayload } = await import('/src/domain/workspace.ts');
      const store = await openIndexedDb();
      const row = await store.load('guest-local-v1');
      let state = JSON.parse(row.snapshotJson);
      const fp = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))])));
      for (const [chapter, count] of counts.entries()) {
        for (const levelId of chapters[chapter].levelIds.slice(0, count)) {
          state = applyAction(state, { kind: 'open', levelId, attemptId: 'tested-campaign:' + levelId }, fp);
          const { attemptId, board: start } = state.attempts[levelId];
          const board = [...start];
          for (const [to, tile] of board.entries()) {
            if (tile === to) continue;
            const from = board.indexOf(to);
            state = applyAction(state, { kind: 'swap', from, to, attemptId }, fp);
            [board[from], board[to]] = [board[to], board[from]];
          }
        }
      }
      const unfinished = levels.find(level => !state.completed.includes(level.id) && levelIsOpen(state, level.id));
      if (unfinished) state = applyAction(state, { kind: 'open', levelId: unfinished.id, attemptId: 'test-open-campaign' }, fp);
      await store.commit(await prepareCommit({ operationId: crypto.randomUUID(), vaultId: row.vaultId,
        expectedRevision: row.localRevision, nextSnapshotJson: JSON.stringify(state), facts: [] }));
      store.close();
    }, countPerChapter);
    await page.reload();
    await ready(page);
  };
  const solve = async (page, level) => {
    const progress = (await state(page)).snapshot.personalProgress;
    const board = [...progress.tasks[progress.active].attempt.board];
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const [to, tile] of board.entries()) {
      if (tile === to) continue;
      const from = board.indexOf(to);
      for (const i of [from, to]) {
        await page.touchscreen.tap(box.x + (i % level.width + .5) * box.width / level.width,
          box.y + 4 + (Math.floor(i / level.width) + .5) * (box.height - 8) / level.height);
      }
      await idle(page);
      [board[from], board[to]] = [board[to], board[from]];
    }
    await page.waitForSelector('#hue-app[data-layer=result]');
    assert.equal(await page.locator('#dialog-title').textContent(), 'Задание выполнено');
  };
  const levelFor = (page, id) => page.evaluate(async id => (await import('/src/domain/personal.ts')).personalLevel(id), id);

  const starter = await profile('2026-11-21');
  const starterDays = [];
  for (const day of ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
    await date(starter.page, day);
    const { personalProgress } = (await state(starter.page)).snapshot;
    assert.equal(personalProgress.day, day);
    assert.equal(await card(starter.page, 'past').count(), 0);
    starterDays.push({ day, present: personalProgress.tasks[day + ':present'].levelId,
      future: personalProgress.tasks[day + ':future'].levelId, durationMs: personalProgress.tasks[day + ':present'].durationMs });
  }
  for (const kind of ['present', 'future']) assert.equal(new Set(starterDays.map(day => day[kind])).size, 4);
  await starter.context.close();

  const originalDay = '2026-11-25', futureDay = '2026-12-01';
  const { page, context, captureBase } = await profile(originalDay, recording);
  await seedCampaign(page, [10, 10, 10]);
  const campaign = (await state(page)).snapshot;
  assert.equal(campaign.completed.length, 30);
  assert.equal(campaign.rights.filter(right => right.startsWith('chapter-open:')).length, 4);
  const perfectCount = await page.evaluate(async completed => {
    const { getLevel } = await import('/src/domain/levels.ts');
    return completed.filter(([id, best]) => getLevel(id).minimumSwaps === best.clean).length;
  }, Object.entries(campaign.bests));
  assert.equal(perfectCount, 30);
  const clipStartMillis = Date.now() - captureBase;
  const hold = ms => recording ? page.waitForTimeout(ms) : Promise.resolve();
  await tasks(page);
  assert.equal(await page.locator('[data-personal]').count(), 3);
  assert.match(await card(page, 'past').innerText(), /Повторить рекорд/);
  await hold(720);
  const key = originalDay + ':past';
  const assignment = (await state(page)).snapshot.personalProgress.tasks[key];
  const future = (await state(page)).snapshot.personalProgress.tasks[originalDay + ':future'];
  assert(!campaign.completed.includes(future.levelId));
  const field = await levelFor(page, assignment.levelId);
  assert.equal(assignment.limit, field.minimumSwaps);
  const finishRecord = async () => {
    await card(page, 'past').tap();
    await page.locator('[data-personal-play]').tap();
    await idle(page);
    await solve(page, field);
    await hold(420);
    await button(page, 'К заданиям').tap();
    await card(page, 'past').waitFor();
  };
  await finishRecord();
  const setCivilDay = date => page.evaluate(day => sessionStorage.setItem('personal-date', String(Date.parse(day + 'T12:00:00Z'))), date);
  await setCivilDay(futureDay);
  await page.getByText(/1 декабря/).waitFor();
  const afterAdvance = (await state(page)).snapshot.personalProgress;
  assert.equal(afterAdvance.day, futureDay);
  await hold(820);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await setCivilDay(originalDay);
  await page.waitForTimeout(1100);
  assert.equal((await state(page)).snapshot.personalProgress.day, futureDay);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('25 ноября 2026 г.', { exact: true }).waitFor();
  const restored = await state(page);
  assert.equal(restored.snapshot.personalProgress.day, originalDay);
  assert.deepEqual(restored.snapshot.personalProgress.tasks, afterAdvance.tasks);
  assert.deepEqual(restored.awards, [key]);
  await page.getByText('Выполненные задания · 1').click();
  await hold(980);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await finishRecord();
  const repeated = await state(page);
  assert.deepEqual(repeated.awards, [key]);
  assert.deepEqual(repeated.snapshot.completed, campaign.completed);
  assert.deepEqual(repeated.snapshot.rights, campaign.rights);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/personal.webm`);

  const finale = await profile(originalDay);
  await seedCampaign(finale.page, [15]);
  await tasks(finale.page);
  const present = (await state(finale.page)).snapshot.personalProgress.tasks[originalDay + ':present'];
  assert.equal(present.levelId, 'finale-v1-1');
  const finaleLevel = await levelFor(finale.page, present.levelId);
  const ordinaryMs = await finale.page.evaluate(async () => {
    const { personalDuration, personalLevel } = await import('/src/domain/personal.ts');
    return ['gradient-001', 'gradient-015'].map(id => personalDuration(personalLevel(id)));
  });
  assert(ordinaryMs[0] < ordinaryMs[1] && ordinaryMs[1] < present.durationMs);
  await card(finale.page, 'present').tap();
    await finale.page.locator('[data-personal-play]').tap();
  await idle(finale.page);
  const presentLabel = await finale.page.locator('#guidance').innerText();
  await finale.page.evaluate(() => sessionStorage.setItem('personal-date', String(Date.parse('2026-12-30T12:00:00Z'))));
  await finale.page.waitForTimeout(250);
  assert.equal(await finale.page.locator('#guidance').innerText(), presentLabel);
  await solve(finale.page, finaleLevel);
  assert.deepEqual((await state(finale.page)).awards, [originalDay + ':present']);
  await finale.page.evaluate(day => sessionStorage.setItem('personal-date', String(Date.parse(day + 'T12:00:00Z'))), originalDay);
  await button(finale.page, 'К заданиям').tap();
  await card(finale.page, 'present').tap();
    await finale.page.locator('[data-personal-play]').tap();
  await idle(finale.page);
  await finale.page.evaluate(duration => sessionStorage.setItem('personal-elapsed', String(1000 + duration)), present.durationMs);
  await finale.page.waitForSelector('#hue-app[data-layer=result]');
  assert.equal(await finale.page.locator('#dialog-title').textContent(), 'Время вышло');
  assert.deepEqual((await state(finale.page)).awards, [originalDay + ':present']);
  await finale.context.close();
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), starterDays, perfectCampaignWins: perfectCount,
    personalGoal: 'repeat-record', targetMoves: assignment.limit, unplayedFuture: future.levelId,
    correctedDay: [futureDay, originalDay], updatedWhileOpen: true, refreshedOnForeground: true, retainedHistory: true, awardsAfterReplay: 1,
    durationMs: { easy: ordinaryMs[0], ordinaryFinalField: ordinaryMs[1], finale: present.durationMs },
    finaleId: present.levelId, finaleWonViaTouch: true, finaleExpiryVerified: true, civilClockDidNotChangeTimer: true,
    clipStartMillis, clipMillis, limits: 'Actual Chromium input. Campaign history made with domain actions and fixed civil/monotonic test clocks. Physical Android not run.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
