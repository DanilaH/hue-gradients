import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
let playwright;
try { playwright = await import('playwright'); }
catch { playwright = createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright'); }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.yandex.config.ts', '--mode', 'yandex', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
const base = 'http://127.0.0.1:4174';
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 99) throw new Error('Yandex Vite server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__sdk = { ready: 0, starts: 0, stops: 0, listeners: {} };
    window.YaGames = { init: () => new Promise(resolve => {
      window.__resolveSdk = () => resolve({ environment: { i18n: { lang: 'ru' } },
        features: { LoadingAPI: { ready() { window.__sdk.ready++; } }, GameplayAPI: { start() { window.__sdk.starts++; }, stop() { window.__sdk.stops++; } } },
        on(name, callback) { window.__sdk.listeners[name] = callback; }, off(name) { delete window.__sdk.listeners[name]; },
        getStorage() { throw new Error('SDK metadata storage must not gate local play'); },
      });
    }) };
  });
  await page.goto(base); await page.waitForSelector('html[data-state=ready]', { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__sdk.ready), 0);
  await page.evaluate(() => window.__resolveSdk());
  await page.waitForFunction(() => window.__sdk.ready === 1 && window.__sdk.starts === 1);
  await page.locator('#help').click(); await page.waitForSelector('#hue-app[data-layer=help]');
  await page.evaluate(() => window.__sdk.listeners.game_api_pause());
  assert.equal(await page.locator('#hue-app').getAttribute('data-layer'), 'none');
  assert.equal(await page.locator('#help').isDisabled(), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__sdk.listeners.game_api_resume();
  });
  assert.equal(await page.locator('#help').isDisabled(), true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.locator('#help').isEnabled(), true);
  assert.equal(await page.evaluate(() => window.__sdk.ready), 1); assert.deepEqual(errors, []);
  await page.close();
  const offline = await browser.newPage(); await offline.route('**/sdk.js', route => route.abort());
  await offline.goto(base); await offline.waitForSelector('html[data-state=ready]', { timeout: 15000 });
  await offline.close();
  const passed = ['local first frame before SDK init', 'LoadingAPI once after usable frame', 'GameplayAPI bridge', 'pause closes help', 'additive SDK/background blockers', 'offline SDK does not block play'];
  await writeFile('.test-output/m1/yandex-browser.json', JSON.stringify({ passed, pageErrors: errors, kind: 'Local SDK stub and failed SDK request; hosted platform NOT RUN' }, null, 2));
  console.log(`PASS: ${passed.length} Yandex host scenarios with local SDK stub.`);
} finally { await browser?.close(); server.kill(); }
