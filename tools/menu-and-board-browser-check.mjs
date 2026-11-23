import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json` : import.meta.url);
const { chromium } = require('playwright');
const out = '.test-output/pr16';
const base = process.env.HUE_TEST_URL ?? 'http://127.0.0.1:4196';
const { rows } = JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json', 'utf8'));
const server = process.env.HUE_TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4196', '--strictPort'], { stdio: 'inherit' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ready = page => page.waitForSelector('html[data-state=ready]');
const menu = page => page.locator('#game-dialog[data-picker=true]');
const number = page => page.locator('.level-selection strong').innerText();
const press = (page, label) => page.getByRole('button', { name: label, exact: true }).tap();
const tight = page => page.waitForFunction(() => !document.querySelector('.level-track')?.getAnimations().some(a => a.playState === 'running'));

async function prepared(page, completed = 5) {
  await page.goto(base);
  await ready(page);
  await page.evaluate(async witnesses => {
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
      for (const { id, legalOptimalWitness } of witnesses) {
        await session.act({ kind: 'open', levelId: id, attemptId: crypto.randomUUID() });
        for (const [from,to] of legalOptimalWitness) {
          await session.act({ kind: 'swap', from, to, attemptId: session.state.attempts[id].attemptId });
        }
        if (!session.state.completed.includes(id)) throw Error(`Fixture failed to complete ${id}`);
      }
    } finally { store.close(); }
  }, rows.slice(0, completed));
  await page.reload();
  await ready(page);
  if (await page.locator('#game-dialog[data-layer=result]').isVisible()) await page.keyboard.press('Escape');
  await page.locator('#levels').tap();
  await menu(page).waitFor();
}

async function marker(page, position) {
  await page.evaluate(position => {
    let dot = document.getElementById('record-touch');
    if (!dot) {
      dot = document.createElement('div'); dot.id = 'record-touch';
      Object.assign(dot.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
        width: '23px', height: '23px', margin: '-11.5px', border: '2px solid white',
        background: '#21142936', boxShadow: '0 0 0 1px #271930', borderRadius: '100%' });
    }
    if (!position) { dot.remove(); return; }
    ([...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body).append(dot);
    dot.style.left = position.x + 'px'; dot.style.top = position.y + 'px';
  }, position);
}
async function tap(page, locator, paced = false) {
  if (!paced) { await locator.tap(); return; }
  const box = await locator.boundingBox();
  await marker(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sleep(180);
  await locator.tap();
  await sleep(140);
  await marker(page, null);
}

async function swipe(page, client, dx, { pace = 0, cancel = false } = {}) {
  const box = await page.locator('.level-stage').boundingBox();
  const x = box.x + (dx < 0 ? box.width - 12 : 12), y = box.y + box.height * .56;
  await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x,y}]});
  for (let i = 1; i <= 12; i++) {
    const p = { x: x + dx * i / 12, y };
    if (pace) await marker(page, p);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    if (pace) await sleep(pace);
  }
  const before = await page.locator('.level-track').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
  await client.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  if (pace) await marker(page, null);
  return before;
}

const idleBoard = page => page.waitForSelector('#hue-app[data-layer=none][data-busy=false]:not([data-board-entry])');
const lift = page => page.locator('#board-region canvas');
const moves = async page => Number(await page.locator('#hue-app').getAttribute('data-moves'));
const settledBoard = page => page.waitForFunction(() => {
  const canvas = document.querySelector('#board-region canvas');
  return canvas?.dataset.lift === 'none' && canvas.dataset.settling !== 'true';
});
async function snapshot(page) {
  return page.evaluate(async () => {
    const { openIndexedDb } = await import('/src/local-store/indexed-db.ts');
    const store = await openIndexedDb();
    try { return JSON.parse((await store.load('guest-local-v1')).snapshotJson); }
    finally { store.close(); }
  });
}
async function open006(page) {
  await page.locator('[data-level-id="gradient-006"]').tap();
  await lift(page).waitFor();
  assert.equal(await number(page), '006');
}
async function moveTile(page, client, from, to, pace, release = 'touchEnd') {
  const box = await lift(page).boundingBox();
  const center = index => ({ x: box.x + (index % 4 + .5) * box.width / 4,
    y: box.y + 4 + (Math.floor(index / 4) + .5) * (box.height - 8) / 4 });
  const p = center(from), q = center(to);
  const dispatch = (type, points) => client.send('Input.dispatchTouchEvent',{ type, touchPoints: points });
  if (pace) await marker(page,p);
  await dispatch('touchStart',[p]);
  for (let i=1;i<=12;i++) {
    const point = {x:p.x+(q.x-p.x)*i/12, y:p.y+(q.y-p.y)*i/12};
    await dispatch('touchMove',[point]);
    if (pace) { await marker(page,point); await sleep(pace); }
  }
  await page.waitForFunction(() => document.querySelector('#board-region canvas')?.dataset.lift === 'held');
  await dispatch(release,[]);
  if (pace) await marker(page,null);
}

async function boardEpisode(browser, record) {
  const viewport = { width:390,height:844 };
  const context = await browser.newContext({ viewport, hasTouch:true, isMobile:true,
    ...(record ? { recordVideo:{dir:out,size:viewport} } : {}) });
  await context.addInitScript(capture => {
    window.pr16 = { audio: [], samples: [], haptics: [], fault: null };
    const gains = new WeakMap();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination,...args) {
      if (this instanceof AudioBufferSourceNode && destination instanceof GainNode) gains.set(this,destination);
      return connect.call(this,destination,...args);
    };
    const startNode = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const at = Date.now();
        window.pr16.audio.push({ at, duration: this.buffer.duration,
          lift: document.querySelector('#board-region canvas')?.dataset.lift,
          settling: document.querySelector('#board-region canvas')?.dataset.settling });
        if (capture) window.pr16.samples.push({ at, sampleRate:this.buffer.sampleRate,
          gain:gains.get(this)?.gain.value ?? 1, data:[...this.buffer.getChannelData(0)] });
      }
      return startNode.apply(this,args);
    };
    Object.defineProperty(navigator,'vibrate',{ writable:true, configurable:true,
      value: pattern => { window.pr16.haptics.push({pattern}); return true; } });
  },record);
  await context.route(/\/src\/local-store\/indexed-db\.ts(\?.*)?$/, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('async commit(command) {', `async commit(command) {
      const fault = window.pr16.fault;
      if (command.facts.some(fact => JSON.parse(fact.payloadJson).kind === 'swap') && fault) {
        await new Promise(resolve => setTimeout(resolve, 250));
        if (fault === 'conflict') throw new StoreError('CONFLICT', 'Browser test concurrent write');
      }`);
    await route.fulfill({response,body});
  });
  const started = Date.now();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepared(page);
  await open006(page);
  const start = Date.now();
  const client = await context.newCDPSession(page);
  const definition = await page.evaluate(async () => {
    const { getLevel } = await import('/src/domain/levels.ts');
    return getLevel('gradient-006');
  });
  const [first, second, third] = rows.find(row => row.id === definition.id).legalOptimalWitness;
  const movement = pace => record ? pace : 0;
  await sleep(movement(510));
  const independentAudio = page.evaluate(() => ({ sound:window.pr16.audio.length, haptic:window.pr16.haptics.length }));
  assert.deepEqual(await independentAudio,{sound:0,haptic:0});
  const playBox = await page.locator('[data-level-action]').boundingBox();
  if (record) await marker(page,{x:playBox.x+playBox.width/2,y:playBox.y+playBox.height/2});
  await page.touchscreen.tap(playBox.x+playBox.width/2,playBox.y+playBox.height/2);
  await page.touchscreen.tap(playBox.x+playBox.width/2,playBox.y+playBox.height/2);
  await page.waitForSelector('#hue-app[data-board-entry=true]');
  await marker(page,null);
  await idleBoard(page);
  assert.equal(await moves(page),0);
  assert.deepEqual((await snapshot(page)).attempts[definition.id].board,definition.startTileAtPosition);

  await sleep(movement(640));
  await moveTile(page,client,...first,movement(56));
  await idleBoard(page);
  await settledBoard(page);
  assert.equal(await moves(page),1);
  const persisted = (await snapshot(page)).attempts[definition.id];
  await sleep(movement(640));
  await moveTile(page,client,second[0],definition.pinnedPositions[0],movement(64));
  await settledBoard(page);
  assert.equal(await moves(page),1);
  assert.equal(await page.evaluate(() => window.pr16.audio.length),1);
  await sleep(movement(605));
  await moveTile(page,client,...second,movement(58));
  await idleBoard(page);
  await settledBoard(page);
  assert.equal(await moves(page),2);
  await sleep(movement(630));
  await moveTile(page,client,...third,movement(58));
  await idleBoard(page);
  await settledBoard(page);
  assert.equal(await moves(page),3);
  await sleep(movement(1150));

  await page.waitForFunction(() => window.pr16.audio.length === 3);
  const sound = await page.evaluate(() => ({
    cues:window.pr16.audio, haptics:window.pr16.haptics,
  }));
  assert(sound.cues.every(cue => Math.abs(cue.duration-.136)<.01 && cue.settling === 'false'));
  assert.equal(sound.haptics.length,3);
  const end = Date.now();
  const video = page.video();
  if (video) {
    const emitted = await page.evaluate(() => window.pr16.samples);
    const sampleRate = emitted[0].sampleRate;
    const length = Math.ceil((end-start) * sampleRate / 1000);
    const wav = Buffer.alloc(44 + length * 2);
    wav.write('RIFF',0); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(sampleRate,24); wav.writeUInt32LE(sampleRate * 2,28);
    wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36);
    wav.writeUInt32LE(length * 2,40);
    for (const cue of emitted) {
      assert.equal(cue.sampleRate,sampleRate);
      const offset = Math.round((cue.at-start) * sampleRate / 1000);
      for (const [i, sample] of cue.data.entries()) {
        if (offset + i >= 0 && offset + i < length) wav.writeInt16LE(Math.round(32767 * cue.gain * sample),44+2*(offset+i));
      }
    }
    await writeFile(`${out}/board-audio.wav`,wav);
    await context.close();
    await video.saveAs(`${out}/board-raw.webm`);
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',((start-started)/1000).toFixed(3),
      '-i',`${out}/board-raw.webm`,'-i',`${out}/board-audio.wav`,'-t',((end-start)/1000).toFixed(3),
      '-map','0:v','-map','1:a','-c:a','aac','-c:v','libx264','-pix_fmt','yuv420p',
      '-movflags','+faststart',`${out}/poluson-pr16-006-with-sound.mp4`]);
    await writeFile(`${out}/board-recording.json`, JSON.stringify({ sound, start, end, chromium:browser.version(),
      viewport, swaps:[first,second,third], miss:[second[0],definition.pinnedPositions[0]], source:'Emitted Web Audio buffers at measured contact timestamps' },null,2)+'\n');
    assert.deepEqual(errors,[]);
    return;
  }

  // Exercise true cancel and resume from the sole saved move on a second context.
  const resumeContext = await browser.newContext({viewport,hasTouch:true,isMobile:true});
  const resume = await resumeContext.newPage();
  await prepared(resume);
  await open006(resume);
  await resume.locator('[data-level-action]').tap();
  await idleBoard(resume);
  const resumeClient = await resumeContext.newCDPSession(resume);
  await moveTile(resume,resumeClient,...first,0);
  await idleBoard(resume); await settledBoard(resume);
  assert.deepEqual((await snapshot(resume)).attempts[definition.id].board,persisted.board);
  await moveTile(resume,resumeClient,...second,0,'touchCancel');
  await settledBoard(resume);
  assert.equal(await moves(resume),1);
  await resume.locator('#levels').tap();
  assert.equal(await resume.locator('[data-level-action]').textContent(),'Продолжить');
  await resume.reload();
  await ready(resume);
  assert.equal(await moves(resume),1);
  await resume.locator('#levels').tap();
  await resume.locator('[data-level-action]').tap();
  await idleBoard(resume);
  assert.deepEqual((await snapshot(resume)).attempts[definition.id].board,persisted.board);
  await resumeContext.close();

  // Artificial backend latency and rejection are separate from the normal take.
  await page.evaluate(() => window.pr16.fault = 'delay');
  await moveTile(page,client,...first,0);
  await page.waitForFunction(() => document.querySelector('#board-region canvas')?.dataset.lift === 'pending');
  await sleep(115);
  assert.equal(await lift(page).getAttribute('data-lift'),'pending');
  assert.equal(await moves(page),3);
  assert.equal(await page.evaluate(() => window.pr16.audio.length),3);
  await idleBoard(page);
  await settledBoard(page);
  assert.equal(await moves(page),4);
  const fourMoves = (await snapshot(page)).attempts[definition.id];
  await page.evaluate(() => window.pr16.fault = 'conflict');
  await moveTile(page,client,...second,0);
  await page.waitForFunction(() => document.querySelector('#board-region canvas')?.dataset.lift === 'pending');
  await idleBoard(page); await settledBoard(page);
  assert.deepEqual((await snapshot(page)).attempts[definition.id],fourMoves);
  assert.equal(await page.evaluate(() => window.pr16.audio.length),4);
  assert.deepEqual(errors,[]);
  await context.close();
  await writeFile(`${out}/board.json`,JSON.stringify({
    chromium:browser.version(),viewport,swaps:[first,second,third],miss:[second[0],definition.pinnedPositions[0]],
    sound, resumeMoves:persisted.moves, interruption:'touchCancel restored 1 move',
    simulated:{delayMs:250,pendingVisible:true,conflictMoves:4,conflictCues:0},
  },null,2)+'\n');
}

async function modeRoutes(browser, record) {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({ viewport, hasTouch:true, isMobile:true,
    ...(record ? {recordVideo:{dir:out,size:viewport}} : {}) });
  try {
    const start = Date.now();
    const page = await context.newPage();
    await prepared(page);
    await open006(page);
    const take = Date.now();
    const button = name => page.getByRole('button',{ name,exact:true });
    const touch = name => tap(page,button(name),record);
    const wait = ms => sleep(record ? ms : 0);
    await wait(400);
    await touch('Режимы');
    await wait(480);
    await touch('Личные задания');
    await page.locator('[data-personal-play]').first().waitFor();
    await wait(700);
    await touch('‹ Назад');
    assert(await button('Личные задания').evaluate(el => el === document.activeElement));
    await touch('Редактор');
    await wait(500);
    await touch('Создать');
    await page.getByRole('textbox',{name:'Название работы'}).waitFor();
    const saved = (await snapshot(page));
    const work = Object.values(saved.creative.works)[0];
    await wait(850);
    await touch('Испытать');
    await page.waitForSelector('#hue-app[data-mode=author][data-layer=none]');
    await wait(850);
    await touch('‹ Редактор');
    await page.getByRole('textbox',{name:'Название работы'}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'Название работы'}).inputValue(),work.name);
    assert.equal((await snapshot(page)).creative.works[work.workId].headNodeId,work.headNodeId);
    await wait(850);
    await touch('Назад');
    const draft = page.locator(`[data-editor-draft="${work.draftId}"]`);
    assert(await draft.evaluate(el => el === document.activeElement));
    await wait(500);
    await touch('‹ Назад');
    assert(await button('Редактор').evaluate(el => el === document.activeElement));
    await touch('‹ Назад');
    assert.equal(await number(page),'006');
    assert.deepEqual((await snapshot(page)).completed,saved.completed);
    await wait(1050);
    const end = Date.now();
    const video = page.video();
    await context.close();
    if (video) {
      await video.saveAs(`${out}/routes-raw.webm`);
      execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',((take-start)/1000).toFixed(3),
        '-i',`${out}/routes-raw.webm`,'-t',((end-take)/1000).toFixed(3),'-an','-c:v','libx264','-pix_fmt','yuv420p',
        '-movflags','+faststart',`${out}/poluson-pr16-editor-return.mp4`]);
    }
    await writeFile(`${out}/routes.json`,JSON.stringify({ viewport,chromium:browser.version(),
      personalFocus:true, sameDraft:true,sameRevision:true,modeFocus:true,campaign:'006'},null,2)+'\n');
  } finally { await context.close(); }
}

async function checkFirstWin(browser) {
  const cases = [
    { reducedMotion:'no-preference', sound:true,haptics:true },
    { reducedMotion:'no-preference', sound:false,haptics:true },
    { reducedMotion:'reduce', sound:true,haptics:false },
  ];
  const checked = [];
  for (const setup of cases) {
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:setup.reducedMotion});
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.firstWin = { sounds:[], haptics:[], phases:[] };
        const root = () => document.querySelector('#hue-app');
        const start = AudioBufferSourceNode.prototype.start;
        AudioBufferSourceNode.prototype.start = function(...args) {
          if (this.buffer) window.firstWin.sounds.push({duration:this.buffer.duration,phase:root()?.dataset.victoryPhase});
          start.apply(this,args);
        };
        navigator.vibrate = pattern => { window.firstWin.haptics.push(pattern); return true; };
        let last;
        new MutationObserver(() => {
          const phase = root()?.dataset.victoryPhase;
          if (phase && phase !== last) { window.firstWin.phases.push(phase); last = phase; }
        }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-victory-phase']});
      });
      await page.goto(base);
      await ready(page);
      await page.locator('#levels').tap();
      await press(page,'Настройки');
      if (!setup.sound) await page.getByRole('checkbox',{name:'Звуки'}).uncheck();
      if (!setup.haptics) await page.getByRole('checkbox',{name:'Вибрация'}).uncheck();
      await page.waitForSelector('#hue-app[data-busy=false]');
      await page.keyboard.press('Escape');
      await page.locator('#menu-preferences[open]').waitFor({state:'detached'});
      await page.locator('[data-level-action]').tap();
      await idleBoard(page);
      const box = await lift(page).boundingBox();
      for (const x of [1.5,2.5]) await page.touchscreen.tap(box.x+x*box.width/4,box.y+box.height/2);
      const next = page.getByRole('button',{name:'Дальше',exact:true});
      await next.waitFor();
      const observed = await page.evaluate(() => window.firstWin);
      assert.equal(observed.sounds.length,Number(setup.sound));
      assert.equal(observed.haptics.length,Number(setup.haptics));
      if (setup.sound) assert(Math.abs(observed.sounds[0].duration-.24)<.003);
      if (setup.reducedMotion === 'reduce') assert(!observed.phases.includes('approach'));
      else {
        assert(observed.phases.includes('approach'));
        assert(observed.phases.includes('landed'));
      }
      assert.equal(await moves(page),1);
      await next.tap();
      await page.waitForSelector('#hue-app[data-level="gradient-002"][data-layer=none]');
      checked.push({ ...setup, ...observed,next:'002' });
    } finally { await context.close(); }
  }
  await writeFile(`${out}/first-win.json`,JSON.stringify(checked,null,2)+'\n');
}

async function checkLevelScale(browser, record) {
  const output = '.test-output/pr18-layout';
  const game = JSON.parse(await readFile('package.json','utf8'));
  await mkdir(output,{recursive:true});
  const views = [{ width:390, height:844 }, { width:320, height:568 }];
  const initial = views[0];
  const context = await browser.newContext({ viewport:{width:initial.width,height:initial.height}, hasTouch:true, isMobile:true });
  const cleanContext = await browser.newContext({ viewport:{width:initial.width,height:initial.height}, hasTouch:true, isMobile:true });
  const completed = [];
  const selector = '.level-rail [aria-current=true]';
  const select006 = page => page.locator('.level-rail [data-level-id="gradient-006"]');
  const centered = page => page.waitForFunction(() => {
    const active = document.querySelector('.level-rail [aria-current=true]');
    const rail = active?.parentElement;
    if (!rail || !active) return false;
    const a = active.getBoundingClientRect(), r = rail.getBoundingClientRect();
    return Math.abs((a.left + a.right) / 2 - (r.left + r.right) / 2) < 2;
  });
  const inView = (rect, view) => rect.x >= -1 && rect.y >= -1 &&
    rect.x+rect.width <= view.width+1 && rect.y+rect.height <= view.height+1;

  try {
    const clean = await cleanContext.newPage(), progress = await context.newPage();
    await clean.goto(base);
    await ready(clean);
    await clean.locator('#levels').tap();
    assert.equal(await number(clean),'001');
    assert.equal(await clean.locator('.level-preview circle').count(),2);
    await prepared(progress);
    await select006(progress).tap();
    assert.equal(await number(progress),'006');

    for (const view of views) {
      const { width,height } = view;
      for (const [page,id] of [[clean,'001'],[progress,'006']]) {
        await page.setViewportSize(view);
        if (id === '006') await centered(page);
        const measure = await page.evaluate(() => {
          const art = document.querySelector('.level-preview svg');
          const bounds = node => node.getBoundingClientRect().toJSON();
          const css = node => parseFloat(getComputedStyle(node).fontSize);
          const matrix = art.getScreenCTM(), view = art.viewBox.baseVal;
          const title = document.querySelector('.level-selection');
          const active = document.querySelector('.level-rail [aria-current=true]');
          const other = document.querySelector('.level-rail button:not([aria-current])');
          const main = document.querySelector('[data-level-action]');
          const links = [...document.querySelectorAll('.level-picker-links button')];
          const count = document.querySelector('.level-chapter-count');
          return { root:css(document.documentElement), count:css(count),
            art: { width:matrix.a*view.width, height:matrix.d*view.height, x:matrix.e, y:matrix.f },
            gap:title.getBoundingClientRect().top-matrix.f-matrix.d*view.height,
            selected:css(active), other:css(other), key:bounds(active), rail:bounds(active.parentElement),
            title:css(title.querySelector('span')), caption:css(links[1]), main:css(main),
            boxes:[bounds(title),bounds(main),bounds(count),...links.map(bounds)],
            overflow:document.querySelector('#game-dialog').scrollWidth > innerWidth };
        });
        assert.equal(measure.root,16);
        assert.equal(measure.selected,26);
        assert.equal(measure.other,20);
        assert.equal(measure.key.width,56);
        assert.equal(measure.key.height,56);
        assert(measure.key.left >= measure.rail.left - 1 && measure.key.right <= measure.rail.right + 1);
        assert.equal(measure.title,18);
        assert.equal(measure.caption,15);
        assert.equal(measure.count,15);
        assert.equal(measure.main,16);
        assert(inView(measure.art,view) && measure.boxes.every(rect => inView(rect,view)) && !measure.overflow, JSON.stringify({ id, view, measure }));
        assert(Math.abs(measure.art.width / measure.art.height - (id === '001' ? 4 : 1)) < .01);
        if (id === '001') assert(measure.gap >= 24 && measure.gap <= 48, JSON.stringify({id,view,measure}));
        const filename = `level-${id}-${width}x${height}.png`;
        await page.screenshot({ path:`${output}/${filename}` });
        completed.push({id,width,height,filename,...measure});
      }

      await progress.locator('[data-open-chapters]').tap();
      await progress.locator('[data-chapter="2"]').tap();
      const note = progress.locator('.chapter-note');
      assert.equal(await note.innerText(),'Соберите 10 работ главы 1');
      const row = await progress.locator('[data-chapter="1"]').boundingBox();
      const sign = await progress.locator('[data-chapter="1"] .chapter-symbol').boundingBox();
      const finale = await progress.locator('[data-finale="1"]').boundingBox();
      assert(row.height >= 84 && sign.width === 54 && finale.width >= 48);
      const lockHint = await note.boundingBox();
      assert(inView(lockHint,view));
      await progress.screenshot({ path:`${output}/chapters-${width}x${height}.png` });
      await progress.keyboard.press('Escape');
      assert.equal(await number(progress),'006');
      assert(await menu(progress).isVisible());
      assert(await progress.locator('[data-open-chapters]').evaluate(node => node === document.activeElement));
    }

    for (const [key,id] of [['Home','001'],['End','015']]) {
      await progress.locator(selector).press(key);
      assert.equal(await number(progress),id);
      const selected = await progress.locator(selector).boundingBox();
      const rail = await progress.locator('.level-rail').boundingBox();
      assert(selected.x >= rail.x - 1 && selected.x+selected.width <= rail.x+rail.width+1);
    }
    await select006(progress).tap();
    await centered(progress);
    await progress.setViewportSize({width:568,height:320});
    await centered(progress);
    const landscape = await progress.locator('[data-level-action]').boundingBox();
    assert(inView(landscape,{width:568,height:320}));

    await prepared(clean,15);
    const chapterButton = clean.locator('[data-open-chapters]');
    assert.equal(await chapterButton.locator('.level-chapter-count').textContent(),'15/15');
    const caption = await chapterButton.boundingBox();
    const label = await chapterButton.locator('.level-chapter-count').boundingBox();
    assert(inView(caption,views[1]) && inView(label,views[1]));
    await chapterButton.tap();
    assert(await clean.locator('[data-chapter-menu=true]').isVisible());

  } finally { await context.close(); await cleanContext.close(); }

  if (record) {
    const viewport = { width:390,height:844 };
    const takeContext = await browser.newContext({viewport,hasTouch:true,isMobile:true,recordVideo:{dir:output,size:viewport}});
    const start = Date.now();
    const page = await takeContext.newPage();
    await prepared(page);
    const take = Date.now();
    await sleep(440);
    const client = await takeContext.newCDPSession(page);
    const expectSelection = id => page.waitForFunction(id => document.querySelector('.level-selection strong')?.textContent === id,id);
    await tap(page,select006(page),true);
    await expectSelection('006');
    await sleep(500);
    await swipe(page,client,-179,{pace:50});
    await expectSelection('007');
    await sleep(480);
    await swipe(page,client,179,{pace:50});
    await expectSelection('006');
    await sleep(500);
    await tap(page,page.locator('[data-open-chapters]'),true);
    await tap(page,page.locator('[data-chapter="2"]'),true);
    await sleep(860);
    await tap(page,page.getByRole('button',{name:'‹ Назад',exact:true}),true);
    await expectSelection('006');
    assert(await page.locator('[data-open-chapters]').evaluate(node => node === document.activeElement));
    await sleep(950);
    const end = Date.now(), video = page.video();
    await takeContext.close();
    await video.saveAs(`${output}/route-raw.webm`);
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',((take-start)/1000).toFixed(3),
      '-i',`${output}/route-raw.webm`,'-t',((end-take)/1000).toFixed(3),'-an','-c:v','libx264','-pix_fmt','yuv420p',
      '-movflags','+faststart',`${output}/Poluson-${game.version}-levels-route.mp4`]);
  }
  await writeFile(`${output}/measurements.json`,JSON.stringify({
    version:game.version, browser:browser.version(), views:completed, edges:['001','015'], focusBack:'006', record,
  },null,2)+'\n');
}

await mkdir(out, { recursive: true });
let browser;
try {
  for (let i = 0; i <= 80; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i === 80) throw Error('Preview server unavailable');
    await sleep(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const record = process.env.RECORD_EPISODE === '1';
  if (process.argv.includes('--board')) await boardEpisode(browser,record);
  else if (process.argv.includes('--routes')) await modeRoutes(browser,record);
  else if (process.argv.includes('--first-win')) await checkFirstWin(browser);
  else if (process.argv.includes('--scale')) await checkLevelScale(browser,record);
  else {
    const viewport = { width: 390, height: 844 };
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true,
      ...(record ? { recordVideo: { dir: out, size: viewport } } : {}) });
    const started = Date.now();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepared(page);
    const take = Date.now();
    const client = await context.newCDPSession(page);
    const wait = ms => sleep(record ? ms : 0);
    assert.equal(await number(page), '005');
    await wait(1700);
    assert(Math.abs(await swipe(page, client, -37, { pace: record ? 74 : 0 }) + 37) < 2);
    await tight(page);
    assert.equal(await number(page), '005');
    await wait(2000);
    assert(Math.abs(await swipe(page, client, -216, { pace: record ? 73 : 0 }) + 216) < 2);
    await page.waitForFunction(() => document.querySelector('.level-selection strong')?.textContent === '006');
    await page.screenshot({ path: `${out}/pr16-menu-390x844.png` });
    await wait(1750);
    const settings = page.locator('[data-menu-settings]');
    await tap(page, settings, record);
    await page.locator('#menu-preferences[open]').waitFor();
    await wait(1450);
    await tap(page, page.getByRole('button',{name:'Закрыть настройки'}), record);
    await page.locator('#menu-preferences[open]').waitFor({ state: 'detached' });
    assert.equal(await number(page), '006');
    assert(await settings.evaluate(node => node === document.activeElement));
    await wait(1350);
    await tap(page, page.locator('[data-open-chapters]'), record);
    await page.locator('[data-chapter-menu=true]').waitFor();
    await wait(700);
    await tap(page, page.locator('[data-chapter="2"]'), record);
    const requirement = 'Соберите 10 работ главы 1';
    assert((await page.locator('.chapter-note').innerText()).includes(requirement));
    await wait(1950);
    await tap(page, page.getByRole('button', {name:'‹ Назад',exact:true}), record);
    assert.equal(await number(page), '006');
    if (record) await sleep(Math.max(100, 20300 - (Date.now() - take)));
    const video = page.video();
    if (video) {
      await context.close();
      await video.saveAs(`${out}/menu-raw.webm`);
      execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-ss',((take-started)/1000).toFixed(3),
        '-i',`${out}/menu-raw.webm`,'-t','20','-vf','tpad=stop_mode=clone:stop_duration=0.2','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/poluson-pr16-menu-20s.mp4`]);
    } else {
      await tap(page,settings);
      await page.keyboard.press('Escape');
      await page.locator('#menu-preferences[open]').waitFor({state:'detached'});
      assert.equal(await number(page),'006');
      await swipe(page,client,-175,{cancel:true});
      await tight(page);
      assert.equal(await number(page),'006');
      await page.locator('[aria-current=true][data-level-id]').press('ArrowLeft');
      assert.equal(await number(page),'005');
      await page.locator('[aria-current=true][data-level-id]').press('ArrowRight');
      assert.equal(await number(page),'006');
      await context.close();
    }
    const narrow = await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    const small = await narrow.newPage();
    await prepared(small);
    await small.locator('[data-level-id="gradient-006"]').tap();
    const action = await small.locator('[data-level-action]').boundingBox();
    const settingsButton = await small.locator('[data-menu-settings]').boundingBox();
    assert(action.y + action.height <= 568 && settingsButton.x + settingsButton.width <= 320);
    await small.screenshot({path:`${out}/pr16-menu-320x568-150.png`});
    await press(small,'Настройки');
    await small.keyboard.press('Escape');
    await small.locator('#menu-preferences[open]').waitFor({state:'detached'});
    assert.equal(await number(small),'006');
    assert.deepEqual(errors, []);
    await writeFile(`${out}/menu.json`,JSON.stringify({
      chromium: browser.version(), viewport, narrow: {width:320,height:568,textScale:1,reducedMotion:true},
      partial:'005', swipe:'006', settingsBack:'006', requirement, chaptersBack:'006', record,
    },null,2)+'\n');
  }
} finally { await browser?.close(); server?.kill(); }
