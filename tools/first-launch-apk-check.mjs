// Serve the signed APK's exact web resources over localhost. This exercises Chromium engines, not native storage or the WebView provider.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const [oldApk, newApk, minimumBrowser, modernBrowser] = process.argv.slice(2);
assert(modernBrowser, 'Usage: node tools/first-launch-apk-check.mjs old.apk new.apk chromium-92 chromium-modern');
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const work = await mkdtemp(join(tmpdir(), 'poluson-apk-web-'));
const output = '.test-output/first-launch';
await mkdir(output, { recursive: true });
const roots = ['old', 'new'].map(dir => join(work, dir, 'assets', 'public'));
for (const [index, apk] of [oldApk, newApk].entries()) {
  execFileSync('unzip', ['-q', resolve(apk), 'assets/public/*', '-d', join(work, index === 0 ? 'old' : 'new')]);
}
const config = JSON.parse(execFileSync('unzip', ['-p', newApk, 'assets/capacitor.config.json'], { encoding: 'utf8' }));
assert.equal(config.android.minWebViewVersion, 92);
assert.equal(config.server.errorPath, 'start-error.html');
let serving = 0;
const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const root = roots[serving];
  const path = resolve(root, '.' + (request.url === '/' ? '/index.html' : request.url));
  if (path.startsWith(root + sep)) {
    try {
      const contents = await readFile(path);
      response.writeHead(200, { 'Content-Type': type[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
      return;
    } catch { /* The exact asset does not exist in this APK. */ }
  }
  response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const checks = [];
const ready = page => page.waitForSelector('html[data-state=ready]');
const idle = page => page.waitForSelector('#hue-app[data-busy=false]');
const snapshot = page => page.evaluate(() => new Promise((resolve, reject) => {
  const opening = indexedDB.open('hue-workspace-v1', 1);
  opening.onerror = () => reject(opening.error);
  opening.onsuccess = () => {
    const db = opening.result;
    const tx = db.transaction('workspaces');
    const row = tx.objectStore('workspaces').get('guest-local-v1');
    tx.oncomplete = () => { db.close(); resolve(row.result); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  };
}));
async function swap(page, from, to) {
  const box = await page.locator('#board-region canvas').boundingBox();
  for (const position of [from, to]) {
    await page.touchscreen.tap(box.x + (position + .5) * box.width / 4, box.y + box.height / 2);
  }
  await idle(page);
}
const versions = [];
try {
  for (const [index, executablePath] of [minimumBrowser, modernBrowser].entries()) {
    const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    try {
      versions.push(browser.version());
      const viewport = { width: 390, height: 740 };
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      serving = 0;
      await page.goto(base);
      if (index === 0) {
        assert.match(browser.version(), /^92\./);
        assert.equal(await page.evaluate(() => typeof Object.hasOwn), 'undefined');
        await page.getByText('Не удалось открыть сохранение.', { exact: false }).waitFor();
        assert.equal(await page.locator('#hue-app').count(), 0);
        checks.push('92: reproduced 0.4.12 clean start failure with Object.hasOwn unavailable');
      } else await ready(page);
      serving = 1;
      await page.reload();
      await ready(page);
      assert.equal(await page.locator('#hue-app').getAttribute('data-level'), 'gradient-001');
      await page.locator('#levels').tap();
      await page.getByRole('button', { name: 'Продолжить уровень 1', exact: true }).tap();
      assert.equal(await page.locator('#hue-app').getAttribute('data-layer'), 'none');
      await swap(page, 1, 2);
      await page.waitForSelector('#hue-app[data-layer=result]');
      await page.getByRole('button', { name: 'Дальше', exact: true }).tap();
      await idle(page);
      await swap(page, 1, 2);
      const saved = await snapshot(page);
      assert.equal(JSON.parse(saved.snapshotJson).attempts['gradient-002'].moves, 1);
      await page.reload();
      await ready(page);
      assert.deepEqual(await snapshot(page), saved);
      assert.equal(await page.locator('#hue-app').getAttribute('data-level'), 'gradient-002');
      checks.push(`${browser.version()}: exact APK starts, touch preview resumes, retained board survives reload`);
      await page.goto(`${base}/${config.server.errorPath}`);
      await page.getByText('Для игры нужен Android System WebView', { exact: false }).waitFor();
      await page.goto(base);
      await ready(page);
      assert.deepEqual(await snapshot(page), saved);
      checks.push(`${browser.version()}: packaged compatibility page leaves save unchanged`);
      assert.deepEqual(errors, []);
      await context.close();

      if (index === 1) {
        const upgrade = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
        const legacy = await upgrade.newPage();
        serving = 0;
        await legacy.goto(base);
        await ready(legacy);
        await swap(legacy, 1, 2);
        await legacy.getByRole('button', { name: 'Дальше', exact: true }).tap();
        await idle(legacy);
        await swap(legacy, 1, 2);
        const prior = await snapshot(legacy);
        await upgrade.addInitScript(() => {
          if (sessionStorage.getItem('test-missing-resize')) window.ResizeObserver = undefined;
        });
        await legacy.evaluate(() => sessionStorage.setItem('test-missing-resize', 'true'));
        serving = 1;
        await legacy.reload();
        await legacy.waitForSelector('html[data-state=incompatible]');
        assert.match(await legacy.locator('#startup').innerText(), /более новый Android System WebView/);
        assert.deepEqual(await snapshot(legacy), prior);
        await legacy.evaluate(() => sessionStorage.removeItem('test-missing-resize'));
        await legacy.reload();
        await ready(legacy);
        assert.deepEqual(await snapshot(legacy), prior);
        checks.push('modern: real 0.4.12 save bytes preserved on update and capability failure');
        await upgrade.close();

        if (process.env.RECORD_EPISODE === '1') {
          const recording = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
            recordVideo: { dir: output, size: viewport } });
          const clip = await recording.newPage();
          await clip.goto(base);
          await ready(clip);
          await clip.locator('#levels').tap();
          await clip.waitForTimeout(950);
          const preview = clip.getByRole('button', { name: 'Продолжить уровень 1', exact: true });
          await preview.tap();
          await clip.waitForSelector('#hue-app[data-layer=none]');
          await clip.waitForTimeout(600);
          await swap(clip, 1, 2);
          await clip.waitForSelector('#hue-app[data-layer=result]');
          await clip.waitForTimeout(950);
          const video = clip.video();
          await recording.close();
          await video.saveAs(`${output}/picker.webm`);
        }
      }
    } finally { await browser.close(); }
  }
  const report = { versions, checks, packagedWebViewMinimum: 92, nativeRuntime: 'NOT RUN' };
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  server.close();
  await rm(work, { recursive: true, force: true });
}
