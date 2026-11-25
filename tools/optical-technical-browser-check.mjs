import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const tag = process.env.OPTICAL_VARIANT ?? 'current';
const build = process.env.OPTICAL_WEB_ROOT && resolve(process.env.OPTICAL_WEB_ROOT);
const baseline = tag === 'baseline';
const out = `.test-output/optical/results/${tag}`;
const base = 'http://127.0.0.1:4198';
const game = build ? base + '/game/index.html' : base;
const record = process.env.RECORD_EPISODE === '1';
const { rows } = JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json', 'utf8'));
await mkdir(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4198', '--strictPort'], { stdio: 'ignore' });
const errors = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const ready = page => page.waitForSelector('html[data-state=ready]');
const picker = page => page.locator('#game-dialog[data-picker=true][open]');
const board = page => page.locator('#board-region canvas');
const current = page => page.locator('.level-selection strong').innerText();
const select = (page, ordinal) => page.locator(`[data-level-id="gradient-${String(ordinal).padStart(3,'0')}"]`).tap();
const waitLevel = (page, ordinal) => page.getByText(String(ordinal).padStart(3,'0'), { exact:true }).and(page.locator('.level-selection strong')).waitFor();
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* Vite startup. */ }
    if (i === 99) throw Error('Fixture server did not start');
    await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

  async function profile(viewport, reducedMotion, capture = false) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion, deviceScaleFactor: 1,
      ...(capture ? { recordVideo: { dir: out, size: viewport } } : {}) });
    if (build) await context.route(base + '/game/**', async route => {
      const file = resolve(build, new URL(route.request().url()).pathname.slice('/game/'.length));
      assert(file.startsWith(build + '/'));
      await route.fulfill({ path: file });
    });
    const start = Date.now();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(game);
    await ready(page);
    return { page, context, start };
  }
  async function openPicker(page, completed) {
    if (completed) {
      await page.evaluate(async fixtures => {
        const { Session } = await import('/src/app/session.ts');
        const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
        const { hashText } = await import('/src/local-store/command.ts');
        const { fingerprintPayload } = await import('/src/domain/workspace.ts');
        const { levels } = await import('/src/domain/levels.ts');
        const store = await openIndexedDb();
        try {
          const session = new Session(store, new Map(await Promise.all(levels.map(async level =>
            [level.id, await hashText(fingerprintPayload(level))]))));
          await session.load();
          for (const { id, legalOptimalWitness } of fixtures) {
            await session.act({ kind: 'open', levelId: id, attemptId: crypto.randomUUID() });
            for (const [from, to] of legalOptimalWitness) {
              await session.act({ kind: 'swap', from, to, attemptId: session.state.attempts[id].attemptId });
            }
            if (!session.state.completed.includes(id)) throw Error('Unsolved fixture: ' + id);
          }
        } finally { store.close(); }
      }, rows.slice(0, completed));
      await page.reload();
      await ready(page);
      if (await page.locator('#game-dialog[data-layer=result]').isVisible()) await page.keyboard.press('Escape');
    }
    await page.locator('#levels').tap();
    await picker(page).waitFor();
  }
  const rects = page => page.evaluate(() => Object.fromEntries([
    '.level-picker-nav', '.level-selection strong', '.level-selection span', '.level-stage', '.level-actions', '.level-rail', '.level-picker-links',
  ].map(selector => [selector, ['x','y','width','height'].map(key => document.querySelector(selector).getBoundingClientRect()[key])])));
  async function gesture(page, client, a, b, { steps = 16, cancel = false } = {}) {
    await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[a] });
    for (let step=1; step<=steps; step++) {
      const t=step/steps;
      await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t }] });
    }
    await client.send('Input.dispatchTouchEvent', { type:cancel?'touchCancel':'touchEnd', touchPoints:[] });
  }
  async function swipe(page, client, selector, dx, options) {
    const box = await page.locator(selector).boundingBox();
    const x = box.x + box.width * (dx < 0 ? .82 : .18), y = box.y + box.height * .5;
    await gesture(page, client, {x,y}, {x:x+dx,y}, options);
  }
  async function waitTrack(page) {
    await page.waitForFunction(() => !document.querySelector('.level-track')?.getAnimations().some(a => a.playState === 'running'));
  }
  async function sample(page, client, action) {
    await client.send('Performance.enable');
    await page.evaluate(() => {
      const count = { previewBox: 0, canvasBox: 0, regionBox: 0, trackStyle: 0 };
      const samples = [];
      const originalRect = Element.prototype.getBoundingClientRect;
      const originalStyle = window.getComputedStyle;
      Element.prototype.getBoundingClientRect = function (...args) {
        if (this.classList.contains('level-preview')) count.previewBox++;
        else if (this.id === 'board-region') count.regionBox++;
        else if (this instanceof HTMLCanvasElement && this.parentElement?.id === 'board-region') count.canvasBox++;
        return originalRect.apply(this,args);
      };
      window.getComputedStyle = function (node,...args) {
        if (node.classList.contains('level-track')) count.trackStyle++;
        return originalStyle.call(window,node,...args);
      };
      let tick = requestAnimationFrame(function raf(now) { samples.push(now); tick = requestAnimationFrame(raf); });
      window.opticalSample = () => {
        cancelAnimationFrame(tick);
        Element.prototype.getBoundingClientRect = originalRect;
        window.getComputedStyle = originalStyle;
        const gaps = samples.slice(1).map((now,i)=>now-samples[i]).sort((a,b)=>a-b);
        return { ...count, frameSamples:gaps.length, p95RafMs:gaps[Math.floor(gaps.length*.95)] ?? null, longRaf:gaps.filter(x=>x>=34).length };
      };
    });
    const before = Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(({name,value})=>[name,value]));
    await action();
    const after = Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(({name,value})=>[name,value]));
    return { ...await page.evaluate(()=>window.opticalSample()),
      layouts:after.LayoutCount-before.LayoutCount, styleRecalculations:after.RecalcStyleCount-before.RecalcStyleCount,
      scriptMs:Math.round((after.ScriptDuration-before.ScriptDuration)*10000)/10 };
  }

  const layout = [];
  for (const viewport of [{ width:320,height:568 }, { width:390,height:844 }, { width:844,height:390 }]) {
    const { page, context } = await profile(viewport, 'reduce');
    await openPicker(page,5);
    const states = {};
    for (const i of [1,2,3,6,9,15]) {
      await select(page,i);
      assert.equal(await current(page),String(i).padStart(3,'0'));
      states[i] = await rects(page);
      if ((i===1 || i===6) && viewport.height>450) await page.screenshot({ path:`${out}/picker-${viewport.width}-${i}.png` });
      if (!baseline && i !== 1) {
        for (const [key, values] of Object.entries(states[i])) {
          for (const [index, value] of values.entries()) {
            if (key === '.level-selection strong' && index >= 2) continue;
            assert(Math.abs(states[1][key][index]-value) <= 1, `Shift at ${viewport.width}×${viewport.height} on ${i}: ${key} dim ${index}`);
          }
        }
      }
    }
    const client = await context.newCDPSession(page);
    await select(page,5);
    await swipe(page,client,'.level-selection',-110);
    if (!baseline) {
      await waitLevel(page,6);
      await swipe(page,client,'.level-actions',118,{cancel:true});
      assert.equal(await current(page),'006');
      await swipe(page,client,'.level-actions',112);
      await waitLevel(page,5);
      await swipe(page,client,'.level-actions',-112);
      await waitLevel(page,6);
      await page.locator('[data-level-action]').tap();
      await page.waitForSelector('#hue-app[data-level="gradient-006"][data-layer=none]');
    }
    layout.push({ viewport, states, selectedAfterHeaderSwipe:await (baseline ? current(page) : Promise.resolve('006')) });
    await context.close();
  }
  const locked = [];
  for (const viewport of [{width:320,height:568},{width:390,height:844}]) {
    const { page,context } = await profile(viewport,'reduce');
    await openPicker(page,0);
    const unlocked = await rects(page);
    await select(page,2);
    const lock = page.locator('.level-preview.level-locked');
    assert.equal(await lock.count(),1);
    assert.equal(await page.locator('[data-level-action]').count(),0);
    const grayscale = await lock.evaluate(node=>getComputedStyle(node).filter);
    if (!baseline) {
      assert.match(grayscale,/grayscale\(1\)/);
      assert(await lock.locator('svg polygon,svg rect').count() > 0);
      assert.deepEqual(await rects(page),unlocked);
      await lock.tap();
      assert.equal(await current(page),'002');
    }
    await page.screenshot({path:`${out}/locked-${viewport.width}.png`});
    locked.push({viewport,grayscale});
    await context.close();
  }

  const { page,context,start:started } = await profile({width:390,height:844},'no-preference',record);
  await openPicker(page,5);
  const pickerSamples=[];
  const client = await context.newCDPSession(page);
  for (let run=0; run<3; run++) {
    await select(page,5);
    pickerSamples.push(await sample(page,client,async()=>{
      await swipe(page,client,'.level-stage',-135,{steps:24});
      await waitLevel(page,6);
      await waitTrack(page);
    }));
  }
  const marks = Date.now()-started;
  if (record) await sleep(550);
  if (!baseline) {
    await swipe(page,client,'.level-selection',105);
    await waitLevel(page,5);
    if (record) await sleep(480);
    await swipe(page,client,'.level-actions',-105);
    await waitLevel(page,6);
    if (record) await sleep(480);
  }
  await button(page,'Режимы').tap();
  await button(page,'Испытания').tap();
  await button(page,'Проба').tap();
  // Capture the same authored field and shuffled order in both signed APKs.
  const comparisonAttempt = '7e7f5de5-da70-4635-8c70-000000000006';
  await page.evaluate(id => {
    const next = crypto.randomUUID;
    crypto.randomUUID = () => {
      crypto.randomUUID = next;
      return id;
    };
  }, comparisonAttempt);
  await page.locator('[data-challenge-id="pilot-v1-wings-lo"]').tap();
  await page.waitForSelector('#hue-app[data-level="pilot-v1-wings-lo"][data-layer=none][data-busy=false]');
  await sleep(190);
  const startOrder = await page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    try { return JSON.parse((await store.load('guest-local-v1')).snapshotJson).challengeProgress.attempts['pilot-v1-wings-lo']; }
    finally { store.close(); }
  });
  assert.equal(startOrder.attemptId, comparisonAttempt);
  const fill = await board(page).evaluate(canvas=>{
    const {width,height}=canvas;
    const data=canvas.getContext('2d').getImageData(0,0,width,height).data;
    let uncovered=0,total=0;
    for(let y=8;y<height-8;y++) for(let x=5;x<width-5;x++) {
      if (data[(y*width+x)*4+3]<245) uncovered++;
      total++;
    }
    return { width,height,uncovered,total };
  });
  if (!baseline) assert(fill.uncovered/fill.total < .001,`Open seams remain: ${JSON.stringify(fill)}`);
  await page.screenshot({path:`${out}/blue-air.png`});
  const level = await page.evaluate(async()=>{
    const { pilotLevel } = await import('/src/domain/geometryPilot.ts');
    return pilotLevel('pilot-v1-wings-lo');
  });
  const aIndex = level.positions.findIndex((_,i)=>!level.pinnedPositions.includes(i));
  const bIndex = level.positions.findIndex((_,i)=>i!==aIndex&&!level.pinnedPositions.includes(i));
  const getSite = async index=>{
    const r=await board(page).boundingBox(),[u,v]=level.positions[index].center;
    return {x:r.x+u*r.width,y:r.y+4+v*(r.height-8)};
  };
  const boardSamples=[];
  for (let repeat=0;repeat<3;repeat++) {
    const a=await getSite(aIndex),b=await getSite(bIndex);
    boardSamples.push(await sample(page,client,async()=>{
      await gesture(page,client,a,b,{steps:24,cancel:repeat<2});
      if (repeat===2) await page.waitForSelector('#hue-app[data-moves="1"][data-busy=false]');
      await sleep(200);
    }));
  }
  if(record) await sleep(500);
  const duration=Date.now()-started-marks;
  const movie=page.video();
  await context.close();
  if(movie) {
    const raw=`${out}/episode.webm`;
    await movie.saveAs(raw);
    execFileSync('ffmpeg',['-v','error','-y','-ss',String(marks/1000),'-i',raw,'-t',String(duration/1000),
      '-c:v','libx264','-pix_fmt','yuv420p','-movflags','faststart',`${out}/episode.mp4`]);
  }
  assert.deepEqual(errors, []);
  const result = { tag, browser:browser.version(), builtAssets:!!build, layout, locked, fill, comparisonAttempt, shuffled: startOrder.board, pickerSamples, boardSamples };
  await writeFile(`${out}/results.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ tag, browser:result.browser, fill, pickerSamples, boardSamples }));
} finally {
  await browser?.close();
  server.kill();
}
