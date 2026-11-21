import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/transfer', base = 'http://127.0.0.1:4191';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
  '--port', '4191', '--strictPort'], { stdio: 'ignore' });
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
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, acceptDownloads: true,
    ...(recording ? { recordVideo: { dir: out, size: viewport } } : {}) });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
    Object.defineProperty(navigator, 'canShare', { value: () => false });
  });
  const captureBase = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const idle = () => page.waitForSelector('#hue-app[data-busy=false]');
  const ready = () => page.waitForSelector('html[data-state=ready]');
  const album = async () => { await page.locator('#levels').tap(); await button('Альбом').tap(); await button('Мои работы').tap(); };
  const tool = async name => { await button('Инструменты').tap(); await button(name).tap(); };
  const state = () => page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const db = await openIndexedDb();
    const row = await db.load('guest-local-v1');
    db.close();
    return { row, state: JSON.parse(row.snapshotJson) };
  });
  const solve = async () => {
    await button('Испытать').tap();
    await idle();
    const box = await page.locator('#board-region canvas').boundingBox();
    for (const i of [1, 2]) await page.touchscreen.tap(box.x + (i + .5) * box.width / 4, box.y + box.height / 2);
    await page.waitForSelector('#hue-app[data-layer=result]');
    await button('В редактор').tap();
    await idle();
  };
  await page.goto(base);
  await ready();
  await album();
  await button('Создать').tap();
  await idle();
  await tool('Размер');
  await page.getByLabel('Строки', { exact: true }).selectOption('1');
  await button('Применить').tap();
  await idle();
  await solve();
  const original = Object.values((await state()).state.creative.works)[0];
  const checked = original.nodes[original.headNodeId];
  const clipStartMillis = Date.now() - captureBase;
  await tool('Сохранить обои');
  await page.getByLabel('Действия с работой').tap();
  const sent = page.waitForEvent('download');
  await button('Поделиться задачей').tap();
  const download = await sent;
  const task = `${out}/old.poluson.json`;
  assert.equal(download.suggestedFilename(), 'Poluson.poluson.json');
  await download.saveAs(task);
  const file = JSON.parse(await readFile(task, 'utf8'));
  assert.equal(file.fingerprint, checked.fingerprint);
  assert.deepEqual(file.field, checked.field);
  assert.equal(file.completions, undefined);
  if (recording) await page.waitForTimeout(500);
  await button('Редактировать').tap();
  await button('Слева вверху').tap();
  await button('Синий').tap();
  await button('Готово').tap();
  await idle();
  const edited = (await state()).state.creative.works[original.workId];
  assert.notEqual(edited.headNodeId, checked.nodeId);
  assert.notEqual(edited.nodes[edited.headNodeId].field.solvedTileColors[0], checked.field.solvedTileColors[0]);

  await page.reload();
  await ready();
  await album();
  const beforeImport = await state();
  const input = page.locator('[data-import-puzzle]');
  await input.setInputFiles({ name: 'Corrupt.poluson.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...file, fingerprint: '0'.repeat(64) })) });
  await page.getByText('Файл повреждён или создан в несовместимой версии Полусна.').waitFor();
  assert.deepEqual((await state()).row, beforeImport.row);
  await input.setInputFiles(task);
  await idle();
  await button('Испытать').waitFor();
  const copies = Object.values((await state()).state.creative.works);
  const imported = copies.find(work => work.workId !== original.workId);
  assert.deepEqual(imported.nodes[imported.headNodeId].field, checked.field);
  assert.equal(imported.nodes[imported.headNodeId].fingerprint, checked.fingerprint);
  assert.equal(imported.completions.length, 0);
  if (recording) await page.waitForTimeout(450);
  await solve();
  const after = (await state()).state;
  assert.equal(after.creative.works[imported.workId].completions.length, 1);
  assert.deepEqual(after.completed, beforeImport.state.completed);
  assert.deepEqual(after.bests, beforeImport.state.bests);
  assert.deepEqual(after.rights, beforeImport.state.rights);
  await tool('Сохранить обои');
  const image = page.waitForEvent('download');
  await button('Сохранить PNG').tap();
  const preview = `${out}/imported.png`;
  await (await image).saveAs(preview);
  const png = JSON.parse(execFileSync('python3', ['-c',
    'from PIL import Image; import sys,json; im=Image.open(sys.argv[1]).convert("RGB"); print(json.dumps([*im.size,"#%02x%02x%02x"%im.getpixel((0,0))]))',
    preview], { encoding: 'utf8' }));
  assert.deepEqual(png, [viewport.width, viewport.height, checked.field.solvedTileColors[0].toLowerCase()]);
  if (recording) await page.waitForTimeout(600);
  const clipMillis = Date.now() - captureBase - clipStartMillis;
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(`${out}/transfer.webm`);
  const report = { browser: browser.version(), exactOldRevision: true, editedSource: true,
    badImportPreservedSnapshot: true, importedProofOnlyAfterPlay: true, png,
    clipStartMillis, clipMillis, nativeChooser: 'NOT RUN' };
  await writeFile(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill();
}
