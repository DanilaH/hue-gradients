import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { stagedFeed } from './staged-daily-browser-fixture.mjs';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/daily';
const base = 'http://127.0.0.1:4187';
const [beforeDirectory, afterDirectory, bankDirectory] = process.argv.slice(2);
assert.equal(Boolean(beforeDirectory), Boolean(afterDirectory), 'Supply both staged snapshots');
const staged = beforeDirectory ? {
  before: await stagedFeed(beforeDirectory, '23:59:59'),
  after: await stagedFeed(afterDirectory),
  bank: bankDirectory ? await stagedFeed(bankDirectory) : null,
} : null;
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4187', '--strictPort'], { stdio: 'ignore' });
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
  const first = staged?.before.through ?? '2026-11-20', second = staged?.after.through ?? '2026-11-21';
  const versions = { before: staged?.before.publication.catalogSha256 ?? 'v1', after: staged?.after.publication.catalogSha256 ?? 'v2' };
  const errors = [];
  async function profile(record, initialPhase) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
      ...(record ? { recordVideo: { dir: output, size: viewport } } : {}) });
    await context.route('**/daily-fixture.html', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
      '<!doctype html><html lang="ru" data-host="browser"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="game-root"></main>' }));
    if (staged) await context.route('**/__daily-fixture/**', route => {
      const [, , phase, ...pathParts] = new URL(route.request().url()).pathname.split('/');
      if (phase === 'offline') return route.abort();
      const path = pathParts.join('/');
      const files = (phase === 'bank' ? staged.bank : phase === 'before' ? staged.before : staged.after)?.files;
      assert(files, 'Unexpected catalog phase: ' + phase);
      assert(files[path], 'Unexpected catalog file: ' + path);
      const body = Buffer.from(files[path]);
      if (phase === 'corrupt' && path === staged.after.levelPaths[second]) body[0] ^= 1;
      return route.fulfill({ contentType: 'application/json', body });
    });
    const captureBase = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const boot = async () => {
      await page.evaluate(async (publications) => {
        const { mountGame } = await import('/src/game/mountGame.ts');
        const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
        const { getLevel } = await import('/src/domain/levels.ts');
        const { DAILY_CONTENT_VERSION } = await import('/src/domain/puzzle.ts');
        const { readPublishedDailyCatalog } = await import('/src/app/dailyCatalog.ts');
        const activity = { isBlocked: () => false, onBlockedChange: () => () => {}, setGameplayDesired: () => {} };
        await mountGame(document.querySelector('#game-root'), await openIndexedDb(), activity, {
          dailySource: async () => {
            const phase = sessionStorage.getItem('fixture-daily') ?? 'before';
            const before = phase === 'before';
            if (publications) {
              try {
                const publication = phase === 'bank' ? publications.bank : before ? publications.before : publications.after;
                return await readPublishedDailyCatalog(publication, async path => {
                  const response = await fetch(`/__daily-fixture/${phase}/${path}`);
                  if (!response.ok) throw new Error('Fixture file unavailable');
                  return response.arrayBuffer();
                });
              } finally {
                document.documentElement.dataset.fixtureRead = phase;
              }
            }
            if (phase === 'offline') throw new Error('Fixture disconnected');
            return {
              source: 'Dated test fixture', version: before ? 'v1' : 'v2', verifiedNowMs: before
                ? Date.UTC(2026, 10, 20, 23, 59, 59) : Date.UTC(2026, 10, 21),
              days: ['2026-11-20', '2026-11-21'].map((date, i) => ({ date, level: {
                ...getLevel(i === 0 && before ? 'gradient-001' : 'gradient-002'), id: `daily-${date}`,
                contentVersion: DAILY_CONTENT_VERSION,
              } })),
            };
          },
        });
      }, staged && { before: staged.before.publication, after: staged.after.publication, bank: staged.bank?.publication });
    };
    await page.goto(`${base}/daily-fixture.html`);
    if (initialPhase) await page.evaluate(phase => sessionStorage.setItem('fixture-daily', phase), initialPhase);
    await boot();
    return { context, page, boot, captureBase };
  }
  const one = await profile(recording), two = await profile(false);
  const opening = async (page) => {
    await page.locator('#levels').tap();
    await page.getByRole('button', { name: 'Режимы', exact: true }).tap();
    await page.getByRole('button', { name: 'Задача дня', exact: true }).tap();
    await page.locator(`[data-daily-date="${first}"]`).waitFor();
  };
  const slot = (page, date) => page.locator(`[data-daily-date="${date}"]`);
  const empty = await profile(false, 'offline');
  await empty.page.locator('#levels').tap();
  await empty.page.getByRole('button', { name: 'Режимы', exact: true }).tap();
  await empty.page.getByRole('button', { name: 'Задача дня', exact: true }).tap();
  await empty.page.getByRole('status').filter({ hasText: /Календарь (пока недоступен|не загрузился)/ }).waitFor();
  assert.equal(await empty.page.locator('[data-daily-date]').count(), 0);
  await empty.page.getByRole('button', { name: '‹ Назад', exact: true }).tap();
  await empty.page.getByRole('button', { name: '‹ Назад', exact: true }).tap();
  await empty.page.locator('.level-stage').waitFor();
  await empty.context.close();
  const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
  const state = page => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    const snapshot = JSON.parse((await store.load('guest-local-v1')).snapshotJson);
    const facts = (await store.listFacts('guest-local-v1')).map(fact => JSON.parse(fact.payloadJson));
    store.close();
    return { book: snapshot.dailyProgress, completed: snapshot.completed, rights: snapshot.rights,
      distinctWins: facts.filter(fact => fact.firstDailyWin === true).map(fact => fact.dailyDate) };
  });
  const solve = async page => {
    const { book } = await state(page);
    const { width, height, minimumSwaps } = book.slots[book.active].level;
    const order = [...book.attempts[book.active].board];
    const box = await page.locator('#board-region canvas').boundingBox();
    let moves = 0;
    for (const [position, tile] of order.entries()) {
      if (position === tile) continue;
      const otherPosition = order.indexOf(position);
      for (const target of [position, otherPosition]) {
        await page.touchscreen.tap(box.x + (target % width + .5) * box.width / width,
          box.y + (Math.floor(target / width) + .5) * box.height / height);
      }
      await idle(page);
      [order[position], order[otherPosition]] = [order[otherPosition], order[position]];
      moves++;
    }
    assert.equal(moves, minimumSwaps);
    await page.waitForSelector('#hue-app[data-layer=result]');
    assert.equal((await state(page)).book.attempts[book.active].moves, minimumSwaps);
  };
  await opening(one.page);
  assert.equal(await slot(one.page, second).count(), 0);
  const clipStartMillis = Date.now() - one.captureBase;
  await slot(one.page, first).tap();
  await one.page.locator('[data-daily-play]').tap();
  await idle(one.page);
  await opening(two.page);
  await slot(two.page, first).tap();
  await two.page.locator('[data-daily-play]').tap();
  await idle(two.page);
  const before = await state(one.page), other = await state(two.page);
  await two.context.close();
  assert.deepEqual(before.book.attempts[first].board, other.book.attempts[first].board);
  if (staged) {
    const level = staged.before.days.find(slot => slot.date === first).level;
    assert.deepEqual(before.book.slots[first].level, level);
    assert.deepEqual(before.book.attempts[first].board, level.startTileAtPosition);
  }
  assert.equal(before.book.slots[first].version, versions.before);
  await one.page.evaluate(phase => sessionStorage.setItem('fixture-daily', phase), staged ? 'corrupt' : 'after');
  await solve(one.page);
  const wonBeforeRefresh = await state(one.page);
  assert.equal(wonBeforeRefresh.book.active, first);
  if (recording) await one.page.waitForTimeout(500);
  await one.page.getByRole('button', { name: 'К календарю' }).tap();
  if (staged) {
    await one.page.waitForSelector('html[data-fixture-read=corrupt]');
    assert.equal(await slot(one.page, second).count(), 0);
    const failed = await state(one.page);
    assert.deepEqual(failed.book.slots, wonBeforeRefresh.book.slots);
    assert.deepEqual(failed.book.attempts, wonBeforeRefresh.book.attempts);
    assert.deepEqual(failed.distinctWins, [first]);
    await one.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'after'));
    await one.page.getByRole('button', { name: '‹ Назад', exact: true }).tap();
    await one.page.getByRole('button', { name: 'Задача дня', exact: true }).tap();
  }
  await slot(one.page, second).waitFor();
  assert.equal(await slot(one.page, first).locator('canvas').count(), 1);
  assert.equal(await slot(one.page, second).isEnabled(), true);
  const refreshed = await state(one.page);
  assert.equal(refreshed.book.slots[first].version, versions.before);
  assert.equal(refreshed.book.slots[second].version, versions.after);
  if (recording) await one.page.waitForTimeout(700);
  await one.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'offline'));
  await one.page.reload();
  await one.boot();
  await opening(one.page);
  assert(await slot(one.page, second).isVisible());
  await slot(one.page, first).tap();
  await one.page.locator('[data-daily-play]').tap();
  await idle(one.page);
  assert.deepEqual((await state(one.page)).book.attempts[first].board, before.book.attempts[first].board);
  await solve(one.page);
  const offline = await state(one.page);
  assert.deepEqual(offline.distinctWins, [first]);
  assert.deepEqual(offline.book.solved, [first]);
  assert.deepEqual(offline.completed, before.completed);
  assert.deepEqual(offline.rights, before.rights);
  await one.page.getByRole('button', { name: 'К календарю', exact: true }).tap();
  await idle(one.page);
  assert.equal(await slot(one.page, first).getAttribute('aria-pressed'), 'true');
  assert.equal(await slot(one.page, first).evaluate(node => node === document.activeElement), true);
  assert.deepEqual(errors, []);
  if (recording) await one.page.waitForTimeout(600);
  const clipMillis = Date.now() - one.captureBase - clipStartMillis;
  const video = one.page.video();
  await one.context.close();
  if (video) await video.saveAs(`${output}/daily.webm`);
  const bankPasses = [];
  if (staged?.bank) {
    const bank = await profile(false);
    await bank.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'bank'));
    await bank.page.locator('#levels').tap();
    await bank.page.getByRole('button', { name: 'Режимы', exact: true }).tap();
    await bank.page.getByRole('button', { name: 'Задача дня', exact: true }).tap();
    await slot(bank.page, staged.bank.through).waitFor();
    await bank.page.evaluate(() => sessionStorage.setItem('fixture-daily', 'offline'));
    for (const { date, level } of staged.bank.days) {
      await slot(bank.page, date).tap();
      await bank.page.locator('[data-daily-play]').tap();
      await idle(bank.page);
      const opened = (await state(bank.page)).book;
      assert.deepEqual(opened.slots[date].level, level);
      assert.deepEqual(opened.attempts[date].board, level.startTileAtPosition);
      await solve(bank.page);
      bankPasses.push({ id: level.id, width: level.width, height: level.height, moves: level.minimumSwaps });
      await bank.page.getByRole('button', { name: 'К календарю' }).tap();
    }
    assert.equal(bankPasses.length, 30);
    assert.deepEqual((await state(bank.page)).distinctWins.sort(), staged.bank.days.map(day => day.date).sort());
    await bank.context.close();
  }
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), authoredSnapshot: Boolean(staged), emptyArchiveBack: true,
    completedLevel: offline.book.slots[first].level.id, moves: offline.book.attempts[first].moves,
    sameDailyStartOnTwoProfiles: true, acrossUtcMidnight: [first, second],
    verifiedWireBytes: Boolean(staged), corruptUpdatePreservedArchive: Boolean(staged),
    bankPasses,
    reusedOldVersion: versions.before, newVersion: versions.after, offlineReplay: true, distinctWins: offline.distinctWins, clipStartMillis, clipMillis,
    limits: 'Injected dated feed and trusted clock. No public source, shared rewards or native runtime.' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
