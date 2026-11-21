import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stagedFeed } from './staged-daily-browser-fixture.mjs';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/books', base = 'http://127.0.0.1:4189';
const { levels } = JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json', 'utf8'));
const { rows } = JSON.parse(await readFile('docs/spec/prototype/validation-0.1.json', 'utf8'));
const [stagedDirectory] = process.argv.slice(2);
const staged = stagedDirectory ? await stagedFeed(stagedDirectory, 'event-v1') : null;
const featured = staged?.days.find(slot => slot.feature);
assert(!staged || featured, 'The staged catalog must contain a visible event');
const eventDate = featured?.date ?? '2026-11-20';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4189', '--strictPort'], { stdio: 'ignore' });
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
    ...(recording ? { recordVideo: { dir: output, size: viewport } } : {}) });
  const captureBase = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const ready = () => page.waitForSelector('html[data-state=ready]');
  const books = async () => { await page.locator('#levels').tap(); await button('Альбом').tap(); await button('Книги').tap(); };
  const back = async () => { for (let i = 0; i < 3; i++) await button('‹ Назад').tap(); };
  const dawn = page.locator('[data-book=book-v1-dawn]'), special = dawn.locator('[data-book-challenge]');
  const state = () => page.evaluate(async (eventDate) => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const row = await store.load('guest-local-v1');
    const facts = (await store.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    store.close();
    return { row, snapshot: JSON.parse(row.snapshotJson),
      claimCount: facts.filter(f => f.challengeId === 'book-v1-dawn' && f.firstChallengeWin).length,
      eventCount: facts.filter(f => f.dailyDate === eventDate && f.firstDailyWin).length };
  }, eventDate);
  const swap = async (level, from, to) => {
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const i of [from, to]) {
      await page.touchscreen.tap(box.x + (i % level.width + .5) * box.width / level.width,
        box.y + 4 + (Math.floor(i / level.width) + .5) * (box.height - 8) / level.height);
    }
    await idle();
  };
  const solve = async level => {
    const board = [...level.startTileAtPosition];
    for (const i of board.keys()) {
      const from = board.indexOf(i);
      if (from === i) continue;
      await swap(level, from, i);
      [board[from], board[i]] = [board[i], board[from]];
    }
    await page.waitForSelector('#hue-app[data-layer=result]');
  };
  await page.goto(base);
  await ready();
  for (const level of levels.slice(0, 6)) {
    if (level.ordinal === 6) {
      await books();
      assert.match(await dawn.innerText(), /3\/4/);
      assert.equal(await special.count(), 0);
      await back();
    }
    for (const [from, to] of rows.find(row => row.id === level.id).legal_optimal_witness) await swap(level, from, to);
    await button('Дальше').tap();
    await idle();
  }
  await books();
  assert.match(await dawn.innerText(), /4\/4/);
  assert.equal(await dawn.locator('li[data-earned=true]').count(), 4);
  const clipStartMillis = Date.now() - captureBase;
  if (recording) await page.waitForTimeout(550);
  const chapter = await page.evaluate(async () => (await import('/src/domain/books.ts')).books[0].level);
  async function claim() {
    await special.tap();
    await idle();
    await solve(chapter);
    if (recording) await page.waitForTimeout(600);
    await button('К книгам').tap();
    await dawn.waitFor();
  }
  await claim();
  assert.match(await special.innerText(), /Повторить/);
  if (recording) await page.waitForTimeout(550);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  await claim();
  assert.equal((await state()).claimCount, 1);

  // Cache the verified staging snapshot or the legacy fixture before disconnecting.
  await page.evaluate(async (staged) => {
    const { Session } = await import('/src/app/session.ts');
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const { hashText } = await import('/src/local-store/command.ts');
    const { fingerprintPayload } = await import('/src/domain/workspace.ts');
    const { levels } = await import('/src/domain/levels.ts');
    const { DAILY_CONTENT_VERSION } = await import('/src/domain/puzzle.ts');
    const store = await openIndexedDb();
    const session = new Session(store, new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))]))));
    await session.load();
    await session.act({ kind: 'daily-cache', feed: staged ?? { source: 'Verified event fixture', version: 'event-v1',
      verifiedNowMs: Date.UTC(2026, 10, 20, 12), days: [{ date: '2026-11-20', feature: { id: 'warm-day', title: 'Мягкий свет' },
        level: { ...levels[0], id: 'daily-event-fixture', contentVersion: DAILY_CONTENT_VERSION } }] } });
    store.close();
  }, staged);
  await page.reload();
  await ready();
  await books();
  const event = page.locator('[data-event]').filter({ hasText: featured?.feature.title ?? 'Мягкий свет' });
  if (featured) assert.equal(await event.getAttribute('data-event'), featured.feature.id);
  await context.route('**/*', route => route.request().resourceType() === 'fetch' ? route.abort() : route.fallback());
  await event.tap();
  await idle();
  await solve(featured?.level ?? levels[0]);
  await button('К книгам').tap();
  await event.waitFor();
  assert.match(await event.innerText(), /Собрано/);
  await event.tap();
  await idle();
  await solve(featured?.level ?? levels[0]);
  await button('К книгам').tap();
  await event.waitFor();
  const eventState = await state();
  assert.equal(eventState.eventCount, 1);
  if (featured) assert.deepEqual(eventState.snapshot.dailyProgress.slots[eventDate].feature, featured.feature);
  await context.unroute('**/*');

  // Populate a full legacy checkpoint through campaign rules and retain a legacy earned right.
  await page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const { Session } = await import('/src/app/session.ts');
    const { makeField } = await import('/src/domain/editor.ts');
    const { hashText, prepareCommit } = await import('/src/local-store/command.ts');
    const { applyAction, fingerprintPayload } = await import('/src/domain/workspace.ts');
    const { levels } = await import('/src/domain/levels.ts');
    const { default: fixture } = await import('/docs/spec/candidates/validation-0.1.json');
    const store = await openIndexedDb();
    const fp = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))])));
    const session = new Session(store, fp);
    await session.load();
    await session.act({ kind: 'editor-create', draftId: 'keep-draft', workId: 'keep-work', nodeId: 'keep-revision',
      name: 'Сохранённая работа', field: makeField(), seed: 0 });
    const old = await store.load('guest-local-v1');
    let state = JSON.parse(old.snapshotJson);
    for (const level of levels) {
      if (state.completed.includes(level.id)) continue;
      state = applyAction(state, { kind: 'open', levelId: level.id, attemptId: `all-${level.ordinal}` }, fp);
      for (const [from, to] of fixture.rows.find(row => row.id === level.id).legalOptimalWitness) {
        state = applyAction(state, { kind: 'swap', from, to, attemptId: state.attempts[level.id].attemptId }, fp);
      }
    }
    state.rights.push('export-strip');
    await store.commit(await prepareCommit({ operationId: crypto.randomUUID(), vaultId: old.vaultId, expectedRevision: old.localRevision,
      nextSnapshotJson: JSON.stringify(state), facts: [] }));
    store.close();
  });
  await page.reload();
  await ready();
  await button('В альбом').tap();
  await button('Все работы').tap();
  await button('Книги').tap();
  const complete = await state();
  assert.equal(complete.snapshot.completed.length, 60);
  assert.equal(complete.snapshot.creative.works['keep-work'].headNodeId, 'keep-revision');
  assert(complete.snapshot.rights.includes('export-strip'));
  await button('Новый цикл').tap();
  await button('Отмена').tap();
  assert.deepEqual((await state()).row, complete.row);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${output}/books.webm`);
  const report = { browser: browser.version(), lastGoalChangedFrom: '3/4', lastGoalChangedTo: '4/4',
    firstBookClaimsAfterReplay: 1, curatedOccasionOffline: true, stagedAuthoredEvent: Boolean(featured),
    eventDate, eventMoves: eventState.snapshot.dailyProgress.attempts[eventDate].moves, eventWins: eventState.eventCount,
    cycleCancellationPreservedSnapshot: true, clipStartMillis, clipMillis,
    limits: 'Actual book and event play with a test UTC date. Live dates and cycle reset are not enabled.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
