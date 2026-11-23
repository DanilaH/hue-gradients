import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const assets = resolve(process.argv[2] ?? 'dist-yandex');
const output = '.test-output/pr18-browser';
const viewport = { width: 320, height: 568 };
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': mime['.html'] }).end(`<!doctype html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <span id="font-probe" style="position:fixed;left:-900px">Browser default</span>
      <iframe title="Полусон" src="/index.html" style="position:fixed;inset:0;border:0;width:100%;height:100%"></iframe>`);
    return;
  }
  try {
    const file = resolve(assets, '.' + path);
    if (!file.startsWith(assets + sep)) throw new Error('Outside the test build');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The same shipped asset tree is exercised as an embedded game with a local SDK.
  await context.route('**/sdk.js', route => route.fulfill({ contentType: 'application/javascript', body:`
    window.YaGames = { init: async () => ({
      environment: {i18n:{lang:'ru'}}, features: { LoadingAPI:{ready(){}}, GameplayAPI:{start(){},stop(){}} },
      on(){}, off(){}
    }) };
  `}));
  const client = await context.newCDPSession(page);
  const open = async size => {
    await client.send('Page.setFontSizes', { fontSizes: { standard: size } });
    await page.goto(origin);
    const outside = await page.locator('#font-probe').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    assert.equal(outside, size, 'The unstyled host text must actually use the requested browser preference');
    const game = page.frameLocator('iframe');
    await game.locator('html[data-state=ready]').waitFor();
    await game.locator('#levels').click();
    await game.locator('.level-selection').waitFor();
    return game;
  };
  const measure = game => game.locator('#game-dialog').evaluate(dialog => {
    const selectors = ['.level-preview svg', '.level-selection strong', '.level-selection span', '[data-level-action]',
      '.level-rail [aria-current=true]', '.level-rail button:not([aria-current])',
      '.level-chapter-link span:first-child', '.level-chapter-count', '.level-picker-nav button',
      '.level-picker-links button'];
    const box = ({ x, y, width, height }) => ({ x, y, width, height });
    return {
      size: [innerWidth, innerHeight],
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      zoom: window.visualViewport?.scale,
      elements: selectors.flatMap(selector =>
        [...dialog.querySelectorAll(selector)].map(node => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return { selector, text: node.textContent, font: parseFloat(getComputedStyle(node).fontSize),
            bounds: box(node.getBoundingClientRect()), lines: [...range.getClientRects()].map(box) };
        })),
    };
  });
  const capture = async (game, size) => {
    const layout = await measure(game);
    assert.equal(layout.root, 16);
    assert.equal(layout.zoom, 1);
    assert.deepEqual(layout.size, [viewport.width, viewport.height]);
    assert.equal(layout.elements.find(entry => entry.selector === '.level-chapter-count').font, 15);
    assert.equal(layout.elements.find(entry => entry.selector === '.level-rail [aria-current=true]').font, 26);
    await page.locator('iframe').screenshot({ animations: 'disabled', path: `${output}/yandex-browser-font-${size}.png` });
    return layout;
  };
  const standard = await capture(await open(16), 16);
  const enlarged = await capture(await open(24), 24);
  assert.deepEqual(enlarged, standard, 'Fonts, line boxes and controls in the embedded game must match');
  assert.deepEqual(errors, []);
  const result = { browser: browser.version(), viewport, outsideFontPx: [16, 24],
    gameFontPx: standard.root, identicalLayout: true, comparedElements: standard.elements.length,
    game: standard, host: 'Local iframe serving the Yandex upload build with an SDK stub' };
  await writeFile(`${output}/yandex.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(`PASS: ${standard.elements.length} matching game elements under browser defaults 16px and 24px.`);
} finally {
  await browser?.close();
  server.close();
}
