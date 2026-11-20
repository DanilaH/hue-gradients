// Real UI progression plus separately labelled imported-checkpoint/migration fixtures.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
let pw;try{pw=await import('playwright');}catch{pw=createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright');}
await mkdir('.test-output/m3',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4177','--strictPort'],{stdio:'ignore'});
const base='http://127.0.0.1:4177';let browser;const passed=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true}),page=await context.newPage(),errors=[];
 await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:undefined}));
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForSelector('html[data-state=ready]');
 const defs=JSON.parse(await readFile('docs/spec/candidates/levels-0.1.json','utf8')).campaign;
 const witnesses=JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json','utf8')).rows;
 const idle=()=>page.waitForFunction(()=>document.querySelector('#hue-app')?.dataset.busy==='false');
 const state=()=>page.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return{...JSON.parse(r.snapshotJson),revision:r.localRevision};});
 const solve=async ordinal=>{const level=defs[ordinal-1];assert.equal((await state()).activeLevelId,level.id);
  for(const[from,to]of witnesses.find(r=>r.id===level.id).legalOptimalWitness){for(const index of[from,to]){const r=await page.locator('#board-region canvas').boundingBox();await page.mouse.click(r.x+(index%level.width+.5)*r.width/level.width,r.y+4+(Math.floor(index/level.width)+.5)*(r.height-8)/level.height);}await idle();}
  await page.waitForSelector('#hue-app[data-layer=result]');assert((await state()).attempts[level.id].completed);
 };
 const picker=async()=>{for(let i=0;i<12&&(await page.locator('#hue-app').getAttribute('data-layer'))!=='none';i++)await page.keyboard.press('Escape');await page.locator('#levels').click();await page.locator('.level-stage').waitFor();};
 const chapterMenu=()=>page.locator('[data-open-chapters]').click();
 const selectChapter=n=>page.locator(`[data-chapter="${n}"]`).click();
 const selectLevel=n=>page.locator(`[data-level-id=gradient-${String(n).padStart(3,'0')}]`).click();
 const playSelected=async()=>{await page.locator('[data-level-action]').click();await idle();};
 const chapter=async n=>{await picker();await chapterMenu();await selectChapter(n);};
 const openWorkMenu=async p=>p.getByLabel('Действия с работой').click();
 const allWorks=async p=>{await p.getByRole('button',{name:'Все работы',exact:true}).click();};
 for(let n=1;n<=4;n++){await solve(n);await page.getByRole('button',{name:'Дальше',exact:true}).click();await idle();}
 await chapter(1);await selectLevel(15);assert.equal(await page.locator('[data-level-action]').count(),0);assert.equal(await page.locator('.level-preview .composition-grid').count(),0);
 await selectLevel(5);await playSelected();await solve(5);
 assert((await state()).rights.includes('export-caption'));passed.push('first five remain sequential; fifth grants caption rights');
 assert.equal(await page.locator('#dialog-actions button').count(),2);
 await page.getByRole('button',{name:'В альбом',exact:true}).click();
 assert.equal(await page.locator('.work-card').getAttribute('data-level-id'),'gradient-005');
 await page.getByRole('button',{name:'‹ Назад',exact:true}).click();await page.waitForSelector('#hue-app[data-layer=result]');
 await page.getByRole('button',{name:'В альбом',exact:true}).click();await allWorks(page);
 assert.equal(await page.locator('[data-album-level]').count(),5);assert.equal(await page.locator('[data-album-level=gradient-006]').count(),0);passed.push('result opens the exact completed card, Back returns to result and collection reveals only earned work');
 await page.locator('[data-album-level=gradient-001]').click();
 await openWorkMenu(page);
 await page.getByRole('button',{name:'Повторить работу',exact:true}).click();await page.keyboard.press('Escape');await page.locator('[data-meta=card]').waitFor();
 await openWorkMenu(page);
 await page.getByRole('button',{name:'Сохранить копию',exact:true}).click();
 await page.getByRole('textbox',{name:'Название копии'}).fill('Копия <b>моя</b>');
 const before=await state();await page.getByRole('button',{name:'Сохранить копию',exact:true}).click();await idle();
 const copied=await state();assert.deepEqual(copied.completed,before.completed);assert.deepEqual(copied.bests,before.bests);assert.deepEqual(copied.rights,before.rights);
 assert.equal(Object.values(copied.albumCopies)[0].authorCompletions.length,0);assert.equal(await page.locator('#dialog-title b').count(),0);passed.push('copy persists with new identity, plain-text name and no progress/mastery farming');
 await page.reload();await page.waitForSelector('html[data-state=ready]');assert.equal(Object.keys((await state()).albumCopies).length,1);
 await chapter(1);
 await selectLevel(1);const beforeReplay=await state();
 assert.equal(await page.locator('[data-level-action]').innerText(),'Повторить');
 assert.deepEqual(await page.locator('.level-preview rect').evaluateAll(rects=>rects.map(rect=>rect.getAttribute('fill'))),defs[0].solvedTileColors);
 await playSelected();
 const replayed=await state();assert.equal(replayed.activeLevelId,defs[0].id);assert(replayed.completed.includes(defs[0].id));
 assert.notEqual(replayed.attempts[defs[0].id].attemptId,beforeReplay.attempts[defs[0].id].attemptId);
 assert.equal(replayed.attempts[defs[0].id].moves,0);assert.deepEqual(replayed.bests,beforeReplay.bests);
 await picker();assert.equal(await page.locator('[data-level-action]').innerText(),'Продолжить');await playSelected();assert.deepEqual(await state(),replayed);
 passed.push('finished board previews its result and starts a fresh replay; zero-move replay resumes with the same receipt');
 await picker();await selectLevel(15);assert.equal(await page.locator('[data-level-action]').innerText(),'Играть');
 assert.deepEqual(await page.locator('.level-preview rect').evaluateAll(rects=>rects.map(rect=>rect.getAttribute('fill'))),defs[14].startTileAtPosition.map(id=>defs[14].solvedTileColors[id]));
 await playSelected();await solve(15);
 await page.getByRole('button',{name:'Дальше',exact:true}).click();await idle();assert.equal((await state()).activeLevelId,'gradient-006');passed.push('free choice after fifth and next-lowest recommendation');
 for(let n=6;n<=8;n++){await solve(n);await page.getByRole('button',{name:'Дальше',exact:true}).click();await idle();}
 assert.equal((await state()).completed.length,9);
 await picker();await chapterMenu();assert.equal(await page.locator('[data-chapter="2"]').getAttribute('data-locked'),'true');
 await selectChapter(1);await selectLevel(9);await playSelected();await solve(9);
 assert.equal((await state()).completed.length,10);assert((await page.locator('#chapter-unlock').innerText()).includes('глава 2'));passed.push('9→10 unique completions opens chapter two before page completion');
 await picker();await chapterMenu();await page.screenshot({path:'.test-output/m3/chapters.png'});
 await selectChapter(2);assert.equal(await page.locator('[data-level-id][data-status=Доступен]').count(),15);
 assert.match(await page.locator('[data-open-chapters]').innerText(),/Глава 2/);
 await page.screenshot({path:'.test-output/m3/chapter-two.png'});
 passed.push('all 15 levels of an opened later chapter are available');
 await chapter(1);await selectLevel(10);await playSelected();
 for(let n=10;n<=14;n++){await solve(n);if(n<14){await page.getByRole('button',{name:'Дальше',exact:true}).click();await idle();}}
 let current=await state();assert.equal(current.completed.length,15);assert(current.rights.includes('chapter-complete:chapter-01')&&current.rights.includes('export-strip'));
 assert.equal(await page.locator('#dialog-actions button').count(),2);
 await page.getByRole('button',{name:'В альбом',exact:true}).click();await allWorks(page);
 const albumScroll=page.locator('.album-scroll');
 const albumButton=name=>page.getByRole('button',{name,exact:true});
 assert.deepEqual(await page.locator('.album-tabs button').allTextContents(),['Собранное','Мои работы']);
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.evaluate(()=>document.documentElement.style.fontSize='150%');
  assert((await page.locator('.album-nav button,.album-tabs button').evaluateAll(nodes=>nodes.map(node=>{
   const box=node.getBoundingClientRect();
   return box.height>=48&&box.x>=0&&box.y>=0&&box.right<=innerWidth&&box.bottom<=innerHeight
    &&document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)===node;
  }))).every(Boolean));
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='');
 assert.equal(await page.locator('[data-album-level]').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth>node.clientWidth+1)),false);
 const restored=page.locator('[data-album-level=gradient-014]');
 await restored.scrollIntoViewIfNeeded();
 const position=await albumScroll.evaluate(el=>el.scrollTop);
 assert(position>0);
 await restored.click();await page.waitForFunction(()=>document.querySelector('.work-card-preview')?.naturalWidth===780);
 await albumButton('‹ Назад').click();
 assert.equal(await albumScroll.evaluate(el=>el.scrollTop),position);
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.albumLevel),'gradient-014');
 assert.equal(await albumButton('Собранное').getAttribute('aria-pressed'),'true');
 await albumButton('Мои работы').click();await page.locator('[data-draft-id]').click();
 await albumButton('Назад').click();assert.equal(await albumButton('Мои работы').getAttribute('aria-pressed'),'true');
 await albumButton('Собранное').click();assert.equal(await albumScroll.evaluate(el=>el.scrollTop),position);
 passed.push('full-screen album preserves each tab, scroll and focused print through card/editor Back');

 assert.equal(await albumButton('Коллаж').count(),0);
 assert.equal(await albumButton('Полная страница главы 1').count(),0);
 await restored.click();
 await page.waitForFunction(()=>document.querySelector('.work-card-preview')?.naturalHeight===1688);
 const pending=page.waitForEvent('download');await albumButton('Сохранить PNG').click();
 assert.equal((await pending).suggestedFilename(),'Poluson-014.png');
 await albumButton('‹ Назад').click();
 assert.equal(await albumScroll.evaluate(el=>el.scrollTop),position);
 assert.deepEqual(await state(),current);
 await page.screenshot({path:'.test-output/m3/album.png'});
 passed.push('a completed chapter opens individual full-screen wallpapers and preserves scroll, progress and prior rights');
 for(const viewport of[{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(80);const bounds=await page.locator('#game-dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 passed.push('album/page navigation fits narrow portrait and landscape');assert.deepEqual(errors,[]);await context.close();
 // Fixture cases below validate imported durable state, not 60 human/phone playthroughs.
 for(const fault of[false,true]){
  const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage();await p.goto(base);await p.waitForSelector('html[data-state=ready]');
  const before=await p.evaluate(async()=>{
   const{Session}=await import('/src/app/session.ts');const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const{hashText,prepareCommit}=await import('/src/local-store/command.ts');
   const{levels}=await import('/src/domain/levels.ts');const{applyAction,fingerprintPayload,newWorkspace}=await import('/src/domain/workspace.ts');const rows=(await import('/docs/spec/candidates/validation-0.1.json')).default.rows;
   const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))])));let state=newWorkspace('legacy');
   for(let n=1;n<=14;n++){const l=levels[n-1];state=applyAction(state,{kind:'open',levelId:l.id,attemptId:`legacy-${n}`},fp);if(n%2===0)state=applyAction(state,{kind:'help',attemptId:state.attempts[l.id].attemptId},fp);for(const[from,to]of rows.find(r=>r.id===l.id).legalOptimalWitness)state=applyAction(state,{kind:'swap',from,to,attemptId:state.attempts[l.id].attemptId},fp);}
   state=applyAction(state,{kind:'open',levelId:levels[14].id,attemptId:'unfinished-15'},fp);const[from,to]=rows.find(r=>r.id===levels[14].id).legalOptimalWitness[0];state=applyAction(state,{kind:'swap',from,to,attemptId:'unfinished-15'},fp);
   state.policyVersion='m1-local-1';state.contentVersion='gradient-prototype-0.1';state.rights=state.rights.filter(r=>r.startsWith('clean-export:'));delete state.albumCopies;delete state.lastCompletion;
   const raw=JSON.stringify(state),store=await openIndexedDb(),old=await store.load('guest-local-v1');await store.commit(await prepareCommit({operationId:crypto.randomUUID(),vaultId:'guest-local-v1',expectedRevision:old.localRevision,nextSnapshotJson:raw,facts:[]}));store.close();return{raw,attempts:state.attempts,bests:state.bests,revision:old.localRevision+1};
  });
  if(fault)await c.addInitScript(()=>{if(sessionStorage.getItem('permit-migration'))return;const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='operations')throw new DOMException('Full','QuotaExceededError');return add.apply(this,args);};});
  await p.reload();
  if(fault){await p.getByRole('button',{name:'Повторить',exact:true}).waitFor();assert.equal(await p.locator('#hue-app').count(),0);await p.evaluate(()=>sessionStorage.setItem('permit-migration','yes'));await p.getByRole('button',{name:'Повторить',exact:true}).click();}
  await p.waitForSelector('html[data-state=ready]');
  const migrated=await p.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1'),facts=await s.listFacts('guest-local-v1');s.close();return{state:JSON.parse(r.snapshotJson),revision:r.localRevision,backups:facts.map(f=>JSON.parse(f.payloadJson)).filter(f=>f.kind==='local-migration-backup')};});
  assert.deepEqual(migrated.state.attempts,before.attempts);assert.deepEqual(migrated.state.bests,before.bests);assert.equal(migrated.state.policyVersion,'campaign-meta-1');assert.equal(migrated.backups.length,1);assert.equal(migrated.backups[0].snapshotJson,before.raw);assert.equal(migrated.revision,before.revision+1);assert.equal(migrated.state.lastCompletion,null);
  await p.locator('#levels').click();
  assert.equal(await p.locator('.level-rail [aria-current=true]').getAttribute('data-level-id'),'gradient-015');
  assert.deepEqual(await p.locator('.level-preview rect').evaluateAll(rects=>rects.map(rect=>rect.getAttribute('fill'))),before.attempts['gradient-015'].board.map(id=>defs[14].solvedTileColors[id]));
  await p.getByRole('button',{name:'Продолжить',exact:true}).click();assert.equal(await p.locator('#hue-app').getAttribute('data-layer'),'none');
  await p.reload();await p.waitForSelector('html[data-state=ready]');const rev=await p.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return r.localRevision;});assert.equal(rev,migrated.revision);
  passed.push(fault?'failed migration rolls back backup/progress; retry preserves legacy state exactly':'legacy migration atomically preserves active board, assistance/bests and backup without ceremony');await c.close();
 }
 const all=await browser.newContext({viewport:{width:320,height:568}}),p=await all.newPage();await p.goto(base);await p.waitForSelector('html[data-state=ready]');
 await p.evaluate(async()=>{
  const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const{hashText,prepareCommit}=await import('/src/local-store/command.ts');const{levels}=await import('/src/domain/levels.ts');
  const{applyAction,fingerprintPayload,newWorkspace}=await import('/src/domain/workspace.ts');const rows=(await import('/docs/spec/candidates/validation-0.1.json')).default.rows;
  const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))])));let state=newWorkspace('all-first');
  for(const level of levels){state=applyAction(state,{kind:'open',levelId:level.id,attemptId:`all-${level.ordinal}`},fp);for(const[from,to]of rows.find(r=>r.id===level.id).legalOptimalWitness)state=applyAction(state,{kind:'swap',from,to,attemptId:state.attempts[level.id].attemptId},fp);}
  const store=await openIndexedDb(),old=await store.load('guest-local-v1');await store.commit(await prepareCommit({operationId:crypto.randomUUID(),vaultId:'guest-local-v1',expectedRevision:old.localRevision,nextSnapshotJson:JSON.stringify(state),facts:[]}));store.close();
 });
 await p.reload();await p.waitForSelector('#hue-app[data-layer=result]');assert.equal(await p.getByRole('button',{name:'Дальше',exact:true}).count(),0);
 assert((await p.locator('#dialog-copy').innerText()).includes('Кампания собрана'));await p.getByRole('button',{name:'В альбом',exact:true}).click();
 assert.equal(await p.locator('.work-card').getAttribute('data-level-id'),'gradient-060');await allWorks(p);assert.equal(await p.locator('[data-album-level]').count(),60);
 assert.equal(await p.getByRole('button',{name:'Коллаж',exact:true}).count(),0);
 passed.push('all-60 imported checkpoint shows 60 cards, finite six formats and no fake next chapter');await all.close();
 await writeFile('.test-output/m3/browser.json',JSON.stringify({passed,pageErrors:errors,actualUiCompleted:'Chapter 1: all 15; non-linear selection after tutorial',fixtureCases:'14-completion v0.2 snapshots, with/without transaction fault',limits:['Physical Android and hosted services NOT RUN','Human acceptance of candidate content NOT RUN']},null,2));
 console.log(`PASS: ${passed.length} M3 browser scenarios.`);
}finally{await browser?.close();server.kill();}
