import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, extname, sep } from 'node:path';

const [snapshot, androidAssets, yandexAssets] = process.argv.slice(2);
assert(snapshot && androidAssets && yandexAssets, 'Supply a staged snapshot and both compiled asset directories.');
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const output = '.test-output/daily-entrypoints';
await mkdir(output, { recursive: true });
const file = await readFile(resolve(snapshot, 'catalog.json'));
const catalog = JSON.parse(file);
const today = catalog.through;
const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const hash = createHash('sha256').update(file).digest('hex');
let outage = false, requests = 0;
const trace = [];
const server = createServer(async (req, res) => {
  requests++;
  trace.push(req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (outage) { res.writeHead(503).end(); return; }
  if (req.url === '/publication.json') {
    res.end(JSON.stringify({ source: 'Staged publication test', catalogSha256: hash,
      verifiedNowMs: Date.parse(today + 'T12:00:00Z') }));
    return;
  }
  const path = req.url?.match(new RegExp(`^/snapshots/${hash}/(catalog\\.json|months/[0-9-]+\\.json|levels/[a-f0-9]+\\.json)$`))?.[1];
  if (!path) { res.writeHead(404).end(); return; }
  try { res.end(await readFile(resolve(snapshot, path))); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(4216, '127.0.0.1', resolve));

const origin = 'http://127.0.0.1:4215';
const button = (page, text) => page.getByRole('button', { name: text, exact: true });
const row = (page, date) => page.locator(`[data-daily-date="${date}"]`);
const ready = page => page.waitForSelector('html[data-state=ready]');
const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
const selectCalendar = async page => {
  await page.locator('#levels').tap();
  await button(page, 'Задача дня').tap();
};
const state = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('hue-workspace-v1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction(['workspaces', 'facts'], 'readonly');
    const query = (table, key) => new Promise((resolve, reject) => {
      const request = key ? tx.objectStore(table).get(key) : tx.objectStore(table).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [save, facts] = await Promise.all([query('workspaces', 'guest-local-v1'), query('facts')]);
    const data = JSON.parse(save.snapshotJson);
    return { book: data.dailyProgress, wins: facts.map(item => JSON.parse(item.payloadJson))
      .filter(item => item.firstDailyWin).map(item => item.dailyDate) };
  } finally { db.close(); }
});
async function solve(page, date) {
  const { book } = await state(page);
  const { width, height } = book.slots[date].level;
  const board = [...book.attempts[date].board];
  const box = await page.locator('#board-region canvas').boundingBox();
  for (let to = 0; to < board.length; to++) {
    if (board[to] === to) continue;
    const from = board.indexOf(to);
    for (const index of [from, to]) {
      await page.touchscreen.tap(box.x + (index % width + .5) * box.width / width,
        box.y + 4 + (Math.floor(index / width) + .5) * (box.height - 8) / height);
    }
    [board[from], board[to]] = [board[to], board[from]];
    await idle(page);
  }
  await page.waitForSelector('#hue-app[data-layer=result]');
}
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
let assetRoot;
async function packaged(pathname) {
  const path = resolve(assetRoot, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(assetRoot + sep)) throw new Error('Invalid asset path');
  return { body: await readFile(path), contentType: mime[extname(path)] ?? 'application/octet-stream' };
}
const appServer = createServer(async (req, res) => {
  try {
    const file = await packaged(new URL(req.url, origin).pathname);
    res.writeHead(200, { 'Content-Type': file.contentType, 'Cache-Control': 'no-store' }).end(file.body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => appServer.listen(4215, '127.0.0.1', resolve));
const report = { dates: [today, yesterday], snapshot: hash, hosts: {},
  limits: 'Production app entrypoints and separately served staging publication. Offline restart uses local packaged shell bytes; browser network is disabled. No live publication or native binary.' };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const [host, directory] of Object.entries({ android: androidAssets, yandex: yandexAssets })) {
    assetRoot = resolve(directory);
    const context = await browser.newContext({ viewport: { width: 390, height: 740 }, hasTouch: true,
      isMobile: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', req => {
      if (req.url().startsWith('http://127.0.0.1:4216')) trace.push(req.failure().errorText);
    });
    await page.goto(origin);
    await ready(page);
    assert.equal((await state(page)).book, undefined);
    outage = true;
    await selectCalendar(page);
    await button(page, 'Повторить загрузку').waitFor();
    outage = false;
    await button(page, 'Повторить загрузку').tap();
    await row(page, today).waitFor({ timeout: 6000 }).catch(error => {
      throw new Error(`Staged publication did not arrive: ${JSON.stringify(trace)}`, { cause: error });
    });
    assert.equal(await row(page, today).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.calendar-selection').innerText(), /Задача дня/);
    await row(page, today).tap();
    await page.locator('[data-daily-play]').tap();
    await idle(page);
    await solve(page, today);
    await button(page, 'К календарю').tap();
    await row(page, yesterday).tap();
    await page.locator('[data-daily-play]').tap();
    await idle(page);
    assert.equal(await page.locator('#levels').innerText(), '‹ Календарь');
    await page.locator('#settings').tap();
    assert(await button(page, 'К календарю').isVisible());
    await button(page, 'Продолжить').tap();
    await solve(page, yesterday);
    await button(page, 'К календарю').tap();
    await row(page, yesterday).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.dailyDate), yesterday);
    await button(page, '‹ Назад').tap();
    await button(page, 'Альбом').tap();
    await button(page, 'Книги').tap();
    await page.locator('[data-event]').tap();
    await idle(page);
    assert.equal(await page.locator('#levels').innerText(), '‹ Книги');
    const before = (await state(page)).book.attempts[yesterday].attemptId;
    const count = requests;
    await context.route(`${origin}/**`, async route => {
      try { await route.fulfill(await packaged(new URL(route.request().url()).pathname)); }
      catch { await route.fulfill({ status: 404 }); }
    });
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#levels').innerText(), '‹ Книги');
    assert.equal((await state(page)).book.attempts[yesterday].attemptId, before);
    await solve(page, yesterday);
    await button(page, 'К книгам').tap();
    await page.locator('[data-event]').waitFor();
    await button(page, '‹ Назад').tap();
    await button(page, '‹ Назад').tap();
    await selectCalendar(page);
    await button(page, 'Повторить загрузку').waitFor();
    await row(page, yesterday).waitFor();
    await page.screenshot({ path: `${output}/${host}-offline.png` });
    const saved = await state(page);
    assert.equal(requests, count);
    assert.deepEqual(saved.wins.sort(), [yesterday, today]);
    assert.deepEqual(errors, []);
    report.hosts[host] = { cleanProfile: true, retry: true, bothDatesSolved: true, offlineReopen: true,
      activeAttemptRetained: true, calendarFocusRestored: true, eventBothOrigins: true, distinctWins: saved.wins };
    await context.close();
  }
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  appServer.close();
  server.close();
}
