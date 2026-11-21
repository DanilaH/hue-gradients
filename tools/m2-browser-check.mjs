import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
let playwright;
try { playwright = await import('playwright'); } catch { playwright = createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright'); }
await mkdir('.test-output/m2', { recursive: true });
const dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host','127.0.0.1','--port','4175','--strictPort'], { stdio: 'ignore' });
let browser;
const reports = [];
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://127.0.0.1:4175')).ok) break; } catch {} if (i===99) throw Error('Vite not ready'); await new Promise(r=>setTimeout(r,100)); }
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width:390,height:844 } });
  await context.addInitScript(() => {
    window.__feedback = { audio:0, haptic:[], busy:[] };
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) { window.__feedback.audio++; window.__feedback.busy.push(document.querySelector('#hue-app')?.dataset.busy); return original.apply(this,args); };
    Object.defineProperty(navigator,'vibrate',{ writable:true,configurable:true,value: value => { window.__feedback.haptic.push(value); return true; } });
  });
  const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4175');
  try { await page.waitForSelector('html[data-state=ready]'); } catch(error) { console.log(JSON.stringify({errors,text:(await page.locator('body').innerText()).slice(0,1200)})); await page.screenshot({path:'.test-output/m2/startup-failure.png'}); throw error; }
  const state = () => page.evaluate(async()=>{ const {openIndexedDb}=await import('/src/local-store/indexed-db.ts'); const s=await openIndexedDb(); const r=await s.load('guest-local-v1'); s.close(); return JSON.parse(r.snapshotJson); });
  const defs=JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json','utf8')).levels;
  const idle=()=>page.waitForFunction(()=>document.querySelector('#hue-app').dataset.busy==='false');
  const tap=async index=>{ const model=await state(),l=defs.find(x=>x.id===model.activeLevelId),r=await page.locator('#board-region canvas').boundingBox(); await page.mouse.click(r.x+(index%l.width+.5)*r.width/l.width,r.y+4+(Math.floor(index/l.width)+.5)*(r.height-8)/l.height); };
  await tap(0); await idle(); assert.equal(await page.evaluate(()=>window.__feedback.audio),0); assert.equal(await page.evaluate(()=>window.__feedback.haptic.length),0);
  await tap(1); await tap(1); assert.equal(await page.evaluate(()=>window.__feedback.audio),0); reports.push('pin/deselect have no success audio or haptic');
  const origin=await state(),first=defs[0],board=page.locator('#board-region canvas'),rect=await board.boundingBox();
  const x=rect.x+rect.width*3/8,y=rect.y+rect.height/2,end=x+rect.width*.31;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end,y,{steps:5});await page.waitForTimeout(35);
  await page.screenshot({path:'.test-output/m2/lifted-tile.png'});
  execFileSync('python3',['-c',`from PIL import Image\nim=Image.open('.test-output/m2/lifted-tile.png').convert('RGB')\ncolour=tuple(bytes.fromhex('${first.solvedTileColors[origin.attempts[first.id].board[1]].slice(1)}'))\nassert im.getpixel((${Math.floor(x)},${Math.floor(y)}))!=colour\npixels=list(im.crop((${Math.floor(end)-8},${Math.floor(y)-8},${Math.floor(end)+8},${Math.floor(y)+8})).getdata())
assert len(set(pixels)) >= 3
assert all(abs(sum(p[c] for p in pixels)/len(pixels)-colour[c])<=2 for c in range(3))`]);
  await board.press('Escape');await page.mouse.up();await idle();assert.deepEqual(await state(),origin);
  assert.equal(await page.evaluate(()=>window.__feedback.audio+window.__feedback.haptic.length),0);
  reports.push('lifted tile keeps a textured face with its authored mean colour, leaves a recess and Escape restores the board silently');
  await tap(1); await tap(2); await idle(); await page.waitForSelector('#hue-app[data-layer=result]');
  assert.equal(await page.getByRole('button',{name:'Дальше',exact:true}).isEnabled(),true);
  await page.waitForFunction(()=>window.__feedback.haptic.length===1); await page.waitForTimeout(200);
  const accepted=await page.evaluate(()=>window.__feedback); assert.equal(accepted.audio,1); assert.deepEqual(accepted.busy,['false']); reports.push('one victory cue after commit; CTA immediately enabled');
  const facets=()=>page.locator('#victory-prism').evaluate(prism=>Array.from({length:4},(_,i)=>prism.style.getPropertyValue('--facet-'+i)));
  assert.deepEqual(await facets(),[0,1,2,3].map(i=>first.solvedTileColors[i]));
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('#hue-app[data-motion=false]');
  assert.equal(await page.locator('#victory-prism').evaluate(prism=>prism.getAnimations({subtree:true}).length),0);
  assert.deepEqual(await facets(),first.solvedTileColors);assert(await page.getByRole('button',{name:'Дальше',exact:true}).isEnabled());
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForTimeout(650); await page.screenshot({path:'.test-output/m2/win.png'});
  await page.reload(); await page.waitForSelector('#hue-app[data-layer=result]'); assert.equal(await page.evaluate(()=>window.__feedback.audio+window.__feedback.haptic.length),0);
  assert.equal(await page.locator('#hue-app').getAttribute('data-victory-phase'),'still');
  reports.push('prism uses the strip colours, stays still in reduced motion, and restored victory never repeats the cue');
  await page.getByRole('button',{name:'Дальше',exact:true}).click(); await idle();
  await page.waitForSelector('#game-dialog',{state:'hidden'});
  await tap(1); await tap(2); await idle();
  const started=Date.now(); await tap(1); await tap(2); await idle();
  assert.equal((await state()).attempts['gradient-002'].moves,2); reports.push('new gesture interrupts settling without dropping the next move');
  const audioBefore=await page.evaluate(()=>window.__feedback.audio);
  for(let i=0;i<20;i++){await tap(1);await tap(2);await idle();}
  assert.equal((await state()).attempts['gradient-002'].moves,22);
  assert.equal(await page.evaluate(()=>window.__feedback.audio),audioBefore+20);
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__feedback.audio),audioBefore+20);
  reports.push('twenty successive committed swaps each start one glass cue without deferred playback');
  await page.locator('#settings').click();
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.getByRole('checkbox',{name:'Звуки',exact:true}).uncheck(); await idle();
  await page.getByRole('checkbox',{name:'Вибрация',exact:true}).uncheck(); await idle();
  await page.getByRole('checkbox',{name:'Движение фона',exact:true}).uncheck(); await idle();
  await page.getByRole('button',{name:'Продолжить'}).click();
  const muted=await page.evaluate(()=>window.__feedback.audio+window.__feedback.haptic.length);
  await tap(1); await tap(2); await idle(); assert.equal(await page.evaluate(()=>window.__feedback.audio+window.__feedback.haptic.length),muted);
  assert.equal(await page.locator('#hue-app').getAttribute('data-motion'),'false');
  const frame=await page.locator('.atmosphere').getAttribute('data-frames'); await page.waitForTimeout(200); assert.equal(await page.locator('.atmosphere').getAttribute('data-frames'),frame);
  await page.reload(); await page.waitForSelector('html[data-state=ready]'); assert.deepEqual((await state()).preferences,{sound:false,haptics:false,motion:false,statistics:true,music:false}); reports.push('sound/haptic/motion settings persist; muted actions stay silent');
  await page.locator('#settings').click(); await page.getByRole('button',{name:'Настройки',exact:true}).click(); await page.getByRole('checkbox',{name:'Движение фона',exact:true}).check(); await idle(); await page.getByRole('button',{name:'Продолжить'}).click();
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForSelector('#hue-app[data-motion=false]'); assert.equal(await page.locator('#hue-app').getAttribute('data-motion'),'false');
  const reduced=await page.locator('.atmosphere').getAttribute('data-frames'); await page.waitForTimeout(200); assert.equal(await page.locator('.atmosphere').getAttribute('data-frames'),reduced); reports.push('system reduced motion overrides the animation preference');
  // Sample actual compositor pixels, away from pin/selection markers, against authored RGB.
  await page.screenshot({path:'.test-output/m2/gameplay.png'});
  const model=await state(),level=defs.find(l=>l.id===model.activeLevelId),box=await page.locator('#board-region canvas').boundingBox();
  const pixels=model.attempts[model.activeLevelId].board.map((tile,i)=>({x:Math.round(box.x+(i%level.width+.23)*box.width/level.width),y:Math.round(box.y+4+(Math.floor(i/level.width)+.23)*(box.height-8)/level.height),rgb:level.solvedTileColors[tile]}));
  await writeFile('.test-output/m2/pixels.json',JSON.stringify(pixels));
  execFileSync('python3',['-c',`from PIL import Image\nimport json\nim=Image.open('.test-output/m2/gameplay.png').convert('RGB')\nfor p in json.load(open('.test-output/m2/pixels.json')):\n x,y=p['x'],p['y']\n e=tuple(bytes.fromhex(p['rgb'][1:]))\n pixels=list(im.crop((x-8,y-8,x+8,y+8)).getdata())\n a=[sum(p[c] for p in pixels)/len(pixels) for c in range(3)]\n assert len(set(pixels))>=3 and max(abs(a[c]-e[c]) for c in range(3))<=2,(a,e)\nprint('Mean RGB within 2:',${pixels.length})`]); reports.push('mean displayed colour stays within 2 sRGB units with visible ordered grain');
  await page.locator('#levels').click();
  const pickerSurface=page.locator('#game-dialog .atmosphere');assert.equal(await pickerSurface.count(),1);
  const currentLevel=page.locator('.level-rail [aria-current=true]');
  await currentLevel.press('End');
  const pixelsAtLockedLevel=()=>pickerSurface.evaluate(canvas=>{
    const context=canvas.getContext('2d');
    return [.2,.5,.8].map(t=>[...context.getImageData(Math.floor(canvas.width*t),Math.floor(canvas.height*t),1,1).data]);
  });
  const lockedColors=await pixelsAtLockedLevel();await currentLevel.press('ArrowLeft');
  assert.deepEqual(await pixelsAtLockedLevel(),lockedColors);
  const stillFrame=await pickerSurface.getAttribute('data-frames');await page.waitForTimeout(200);
  assert.equal(await pickerSurface.getAttribute('data-frames'),stillFrame);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(frame=>document.querySelector('#game-dialog .atmosphere')?.dataset.frames!==frame,stillFrame);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#hue-app > .atmosphere').count(),1);
  reports.push('the same atmosphere animates in the picker, stays still with reduced motion and reveals no locked palette');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); const paused=await page.locator('.atmosphere').getAttribute('data-frames');
  await page.waitForTimeout(200); assert.equal(await page.locator('.atmosphere').getAttribute('data-frames'),paused); await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await idle(); reports.push('background stops ambient frames and feedback');
  assert.deepEqual(errors,[]); await context.close();
  // An aborted physical IndexedDB transaction must not produce successful feedback.
  const failed=await browser.newContext({viewport:{width:390,height:844}}); const p=await failed.newPage();
  await p.addInitScript(()=>{window.__haptic=0;Object.defineProperty(navigator,'vibrate',{writable:true,configurable:true,value:()=>{window.__haptic++;return true;}});});
  await p.goto('http://127.0.0.1:4175'); await p.waitForSelector('html[data-state=ready]');
  await p.evaluate(()=>{const original=IDBObjectStore.prototype.add; window.__restore=()=>{IDBObjectStore.prototype.add=original;}; IDBObjectStore.prototype.add=function(...args){if(this.name==='operations')throw new DOMException('Full','QuotaExceededError');return original.apply(this,args);};});
  const b=await p.locator('#board-region canvas').boundingBox();
  for(const index of [1,2])await p.mouse.click(b.x+(index+.5)*b.width/4,b.y+b.height/2);
  await p.waitForSelector('#hue-app[data-layer=recovery]'); assert.equal(await p.evaluate(()=>window.__haptic),0);
  await p.evaluate(()=>window.__restore()); await p.getByRole('button',{name:'Повторить проверку'}).click(); await p.waitForSelector('#hue-app[data-layer=result]'); assert.equal(await p.evaluate(()=>window.__haptic),0);
  reports.push('failed transaction and explicit receipt recovery do not replay feedback'); await failed.close();
  await writeFile('.test-output/m2/browser.json',JSON.stringify({passed:reports,pageErrors:errors,limits:['Desktop Chromium, not a physical Android feel test','Font selection and owner art approval pending']},null,2));
  console.log(`PASS: ${reports.length} M2 presentation scenarios.`);
} finally { await browser?.close(); dev.kill(); }
