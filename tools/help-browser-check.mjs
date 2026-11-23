// Actual browser routes plus labelled local-store and Android-host fixtures.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
let pw;
try { pw = await import('playwright'); }
catch { pw = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/package.json')('playwright'); }

const output = '.test-output/help';
const levels = JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json', 'utf8')).levels;
const base = 'http://127.0.0.1:4186', passed = [], errors = [];
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4186', '--strictPort'], { stdio: 'ignore' });
const frames = { clean: 0, assisted: 0 };
let browser;

const button = (page, name) => page.getByRole('button', { name, exact: true });
const app = page => page.locator('#hue-app');
const state = page => page.evaluate(async () => {
  const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
  const store = await openIndexedDb();
  const { snapshotJson, localRevision } = await store.load('guest-local-v1');
  store.close();
  return { ...JSON.parse(snapshotJson), localRevision };
});
const attempt = data => data.attempts[data.activeLevelId];
const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
const layer = (page, name) => page.waitForSelector(`#hue-app[data-layer=${name}]`);
const menu = async page => {
  await page.locator('#settings').click();
  await button(page, 'Помощь').click();
  await layer(page, 'help-menu');
};
async function tapCell(page, position, level = levels[0]) {
  const box = await page.locator('#board-region canvas').boundingBox();
  assert(box);
  await page.mouse.click(box.x + (position % level.width + .5) * box.width / level.width,
    box.y + 4 + (Math.floor(position / level.width) + .5) * (box.height - 8) / level.height);
}
async function solveFirst(page) {
  await tapCell(page, 1); await tapCell(page, 2);
  await layer(page, 'result');
}
async function cardDetails(page) {
  await button(page, 'В альбом').click();
  const records = page.locator('.work-card-records');
  await page.getByLabel('Действия с работой').click();
  assert(await records.isVisible());
  return records;
}
async function replay(page) {
  if (!(await page.locator('.work-card-options[open]').count())) await page.getByLabel('Действия с работой').click();
  await button(page, 'Повторить работу').click();
  await button(page, 'Начать заново').click();
  await layer(page, 'none');
}
async function newProfile(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('html[data-state=ready]');
  return { context, page };
}
async function record(page, film, tenths) {
  if (!process.env.HUE_HELP_CAPTURE) return;
  const folder = `${output}/${film}`;
  await mkdir(folder, { recursive: true });
  for (let frame = 0; frame < tenths; frame++) {
    const name = String(frames[film]++).padStart(4, '0');
    await page.screenshot({ path: `${folder}/${name}.png`, scale: 'css' });
    await page.waitForTimeout(53);
  }
}

try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (n === 99) throw Error('Vite not ready');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await pw.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const clean = await newProfile();
  const { page } = clean;
  const first = await state(page);
  const board = await page.locator('#board-region').boundingBox();
  await record(page, 'clean', 7);
  await menu(page);
  assert.deepEqual(await state(page), first);
  assert.deepEqual(await page.locator('#board-region').boundingBox(), board);
  assert.match(await page.locator('#dialog-copy').innerText(), /«С помощью»/);
  await record(page, 'clean', 14);
  await button(page, 'Отмена').click();
  await layer(page, 'settings');
  assert.deepEqual(await state(page), first);
  await button(page, 'Продолжить').click();
  await record(page, 'clean', 7);
  await tapCell(page, 1);
  await record(page, 'clean', 4);
  await tapCell(page, 2);
  await layer(page, 'result');
  assert.equal(await page.locator('#dialog-copy').textContent(), '1 ход');
  assert(await button(page, 'Дальше').isEnabled());
  await record(page, 'clean', 11);
  const details = await cardDetails(page);
  assert.match(await details.innerText(), /Минимум — 1.*Рекорд без помощи — 1/s);
  assert(await details.getByText('Идеально без помощи', { exact: true }).isVisible());
  await record(page, 'clean', 17);
  assert.equal(attempt(await state(page)).assistsUsed, 0);
  await page.reload();
  await layer(page, 'result');
  assert(await (await cardDetails(page)).getByText('Идеально без помощи', { exact: true }).isVisible());
  passed.push('cancel keeps the exact workspace and bounds; a one-move clean win and its mastery survive reload');

  await replay(page);
  await menu(page);
  await button(page, 'Показать готовое поле').click();
  await layer(page, 'help');
  const preview = await state(page);
  assert.deepEqual(attempt(preview).board, attempt(first).board);
  assert.equal(attempt(preview).moves, 0);
  assert.equal(attempt(preview).assistsUsed, 1);
  await button(page, 'К игре').click();
  assert.deepEqual(await state(page), preview);
  await solveFirst(page);
  assert.equal(await page.locator('#dialog-copy').textContent(), '1 ход · С помощью');
  await page.reload();
  await layer(page, 'result');
  assert.equal(await page.locator('#dialog-copy').textContent(), '1 ход · С помощью');
  const mixed = await cardDetails(page);
  assert.match(await mixed.innerText(), /Рекорд без помощи — 1.*Рекорд с помощью — 1/s);
  assert(await mixed.getByText('Идеально без помощи', { exact: true }).isVisible());
  passed.push('one full preview costs one assist, keeps the board and does not replace clean best or perfection');
  await clean.context.close();

  const assisted = await newProfile();
  const soft = assisted.page;
  const softBefore = await state(soft);
  await menu(soft);
  await record(soft, 'assisted', 10);
  await button(soft, 'Показать одну плитку').click();
  const spot = soft.locator('.tile-mark[data-kind=pulse]');
  await spot.waitFor();
  const highlighted = Number(await spot.getAttribute('data-position'));
  assert([1,2].includes(highlighted));
  const pulse = await state(soft);
  assert.deepEqual(attempt(pulse).board, attempt(softBefore).board);
  assert.equal(attempt(pulse).moves, 0);
  assert.equal(attempt(pulse).assistsUsed, 1);
  await record(soft, 'assisted', 9);
  await menu(soft);
  await record(soft, 'assisted', 7);
  await button(soft, 'Сделать один обмен · +3 хода').click();
  await layer(soft, 'result');
  assert.equal(await soft.locator('#dialog-copy').textContent(), '3 хода · С помощью');
  const auto = await state(soft);
  assert.deepEqual(attempt(auto).board, [0,1,2,3]);
  assert.equal(attempt(auto).moves, 3);
  assert.equal(attempt(auto).assistsUsed, 2);
  assert.equal(auto.completed.length, 1);
  assert.equal(auto.bests['gradient-001'].clean, null);
  assert.equal(auto.bests['gradient-001'].assisted, 3);
  await record(soft, 'assisted', 12);
  const helpedCard = await cardDetails(soft);
  assert.match(await helpedCard.innerText(), /Минимум — 1.*Рекорд с помощью — 3/s);
  assert.equal(await helpedCard.getByText('Идеально без помощи').count(), 0);
  await record(soft, 'assisted', 17);
  await soft.keyboard.press('Escape');
  await button(soft, '‹ Назад').click();
  await button(soft, 'Дальше').click();
  await idle(soft);
  await menu(soft);
  await button(soft, 'Сделать один обмен · +3 хода').click();
  await layer(soft, 'none');
  const unfinished = await state(soft);
  assert.deepEqual(attempt(unfinished).board, [0,1,3,2,4]);
  assert.equal(attempt(unfinished).moves, 3);
  assert.equal(attempt(unfinished).assistsUsed, 1);
  assert.deepEqual(unfinished.completed, ['gradient-001']);
  passed.push('soft help reveals one misplaced source cell; auto help wins 001 and leaves 002 playable at exactly three moves');
  await assisted.context.close();

  const compact = await newProfile({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  const small = compact.page;
  const beforeBack = await state(small);
  await menu(small);
  assert(await small.locator('#dialog-actions button').evaluateAll(buttons => buttons.every(button => {
    const rect = button.getBoundingClientRect();
    return rect.height >= 48 && rect.top >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
      && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })));
  await small.keyboard.press('Escape');
  await layer(small, 'settings');
  assert.deepEqual(await state(small), beforeBack);
  await button(small, 'Продолжить').click();
  await tapCell(small, 0); await idle(small);
  assert.match(await small.locator('#guidance').innerText(), /закреплены/);
  await tapCell(small, 0); await idle(small);
  assert(await small.locator('.tile-mark[data-kind=pin]').isVisible());
  assert.equal(await small.locator('.tile-mark[data-kind=pin]').evaluate(e => getComputedStyle(e, '::after').animationName), 'none');
  await tapCell(small, 0); await layer(small, 'pin-guide');
  await button(small, 'К игре').click();
  assert.equal(attempt(await state(small)).moves, 0);
  await menu(small); await button(small, 'Показать одну плитку').click();
  const staticSpot = small.locator('.tile-mark[data-kind=pulse]');
  await staticSpot.waitFor();
  assert.equal(await staticSpot.evaluate(e => getComputedStyle(e, '::after').animationName), 'none');
  await solveFirst(small);
  assert.equal(await small.locator('#dialog-copy').textContent(), '1 ход · С помощью');
  await cardDetails(small);
  assert.match(await small.locator('.work-card-records').innerText(), /Рекорд с помощью — 1/);
  passed.push('320×568 at the authored text size, Back, static outlines, repeat pin feedback and dismissible tutorial');

  const fault = await newProfile();
  const damaged = fault.page;
  const baseState = await state(damaged);
  await damaged.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__rejectHelp = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'workspaces' && window.__rejectHelp) throw new DOMException('Quota fixture', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await menu(damaged);
  await button(damaged, 'Сделать один обмен · +3 хода').click();
  await layer(damaged, 'recovery');
  assert.deepEqual(await state(damaged), baseState);
  assert.equal(await damaged.locator('.tile-mark:visible').count(), 0);
  await damaged.evaluate(() => { window.__rejectHelp = false; });
  await button(damaged, 'Повторить проверку').click();
  await layer(damaged, 'result');
  const reloaded = await state(damaged);
  assert.equal(reloaded.localRevision, baseState.localRevision + 1);
  assert.equal(attempt(reloaded).moves, 3);
  assert.equal(attempt(reloaded).assistsUsed, 1);
  await damaged.reload();
  await layer(damaged, 'result');
  assert.deepEqual(await state(damaged), reloaded);
  const receiptInputs = await damaged.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const facts = await db.listFacts('guest-local-v1');
    db.close();
    return facts.flatMap(fact => {
      const input = JSON.parse(fact.payloadJson).input;
      return input?.kind === 'help-accepted' ? [{ stable: input.eventId === fact.id, ...input }] : [];
    });
  });
  assert.equal(receiptInputs.length, 1);
  assert.equal(receiptInputs[0].stable, true);
  assert.equal(receiptInputs[0].chargedMoves, 3);
  passed.push('failed auto-help write is invisible; receipt retry commits one assisted win and one accepted-input fact');
  await fault.context.close();

  const background = await newProfile();
  const hidden = background.page;
  const beforeHide = await state(hidden);
  await hidden.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let hiding = false, triggered = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hiding });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hiding ? 'hidden' : 'visible' });
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'workspaces' && !triggered) {
        triggered = true;
        hiding = true;
        document.dispatchEvent(new Event('visibilitychange'));
        queueMicrotask(() => { hiding = false; document.dispatchEvent(new Event('visibilitychange')); });
      }
      return put.apply(this, args);
    };
  });
  await menu(hidden);
  await button(hidden, 'Сделать один обмен · +3 хода').click();
  await layer(hidden, 'result');
  const backgroundWin = await state(hidden);
  assert.equal(backgroundWin.localRevision, beforeHide.localRevision + 1);
  assert.equal(attempt(backgroundWin).moves, 3);
  assert.equal(attempt(backgroundWin).assistsUsed, 1);
  assert.notEqual(await hidden.locator('#board-region canvas').getAttribute('data-settling'), 'true');
  passed.push('background during the accepted operation preserves one win and suppresses stale swap presentation');
  await background.context.close();

  const wallpaper = await compact.context.newPage();
  wallpaper.on('pageerror', e => errors.push(e.message));
  await wallpaper.goto(base + '/package.json');
  await wallpaper.evaluate(async workspace => {
    const { WorkCardView } = await import('/src/game/workCardView.ts');
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    window.__wallpaperResult = 'wallpaper-unavailable';
    window.__exportFiles = [];
    const card = new WorkCardView(root, workspace, {
      key: 'campaign:gradient-001', title: 'PNG', levelId: 'gradient-001',
      filename: 'Poluson-001.png', minimum: 1, perfect: false, best: { clean: null, assisted: 1 },
    }, {
      screenSize: async () => ({ width: 320, height: 568 }),
      canShare: () => false,
      save: async file => { window.__exportFiles.push(file); return 'saved'; },
      share: async () => 'shared',
      setWallpaper: async file => { window.__exportFiles.push(file); return window.__wallpaperResult; },
    }, { back() {} });
    card.update(false);
  }, await state(small));
  await wallpaper.getByLabel('Действия с работой').click();
  await button(wallpaper, 'Установить обои').click();
  assert.match(await wallpaper.getByRole('status').innerText(), /недоступна/);
  await wallpaper.evaluate(() => { window.__wallpaperResult = 'cancelled'; });
  await button(wallpaper, 'Установить обои').click();
  assert.match(await wallpaper.getByRole('status').innerText(), /отменено/);
  await button(wallpaper, 'Сохранить PNG').click();
  assert(await wallpaper.evaluate(() => window.__exportFiles.length === 3 &&
    window.__exportFiles.every(file => file === window.__exportFiles[0])));
  passed.push('wallpaper host refusal/cancel fixtures keep the same preview and identical PNG for Save');
  await compact.context.close();
  assert.deepEqual(errors, []);
  await writeFile(`${output}/browser.json`, JSON.stringify({ passed, frames, pageErrors: errors,
    limits: 'Chromium production routes. IndexedDB error and background timing are injected. Wallpaper host statuses are fixtures; no actual Android handler or device touch was exercised.' }, null, 2));
  console.log(`PASS: ${passed.length} assistance browser scenarios`);
} finally {
  await browser?.close();
  server.kill();
}
