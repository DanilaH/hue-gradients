// UI/download evidence + separately labelled campaign/right/author-checkpoint fixtures.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
let pw;try{pw=await import('playwright');}catch{pw=createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright');}
await mkdir('.test-output/m4b/png',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'ignore'});
const base='http://127.0.0.1:4179',passed=[],errors=[];let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 await context.addInitScript(()=>{
  window.__shareCalls=[];window.__shareMode='cancel';window.__saveMode='success';
  Object.defineProperty(window,'showSaveFilePicker',{configurable:true,writable:true,value:undefined});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
   const [file]=data.files;
   const call={name:file.name,size:file.size,active:navigator.userActivation.isActive};
   const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
   window.__shareCalls.push({...call,hash:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')});
   if(window.__shareMode==='cancel')throw new DOMException('Cancelled','AbortError');
   if(window.__shareMode==='denied')throw new DOMException('Denied','NotAllowedError');
  }});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForSelector('html[data-state=ready]');
 const ready=()=>page.waitForSelector('.export-panel[data-ready=true]');
 const state=()=>page.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return{state:JSON.parse(r.snapshotJson),revision:r.localRevision};});
 const levels=JSON.parse(await readFile('docs/spec/candidates/levels-0.1.json','utf8')).campaign;
 const witnesses=JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json','utf8')).rows;
 const imageHash=picture=>picture.evaluate(async img=>{
  const bytes=await (await fetch(img.src)).arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 async function solve(level){
  assert.equal((await state()).state.activeLevelId,level.id);
  const board=await page.locator('#board-region canvas').boundingBox();
  assert(board);
  for(const [from,to] of witnesses.find(row=>row.id===level.id).legalOptimalWitness){
   for(const pos of [from,to]){
    await page.mouse.click(board.x+(pos%level.width+.5)*board.width/level.width,
     board.y+4+(Math.floor(pos/level.width)+.5)*(board.height-8)/level.height);
   }
   await page.waitForFunction(()=>document.querySelector('#hue-app')?.dataset.busy==='false');
  }
  await page.locator('#hue-app[data-layer=result]').waitFor();
  assert((await state()).state.attempts[level.id].completed);
 }
 async function downloadClean(level,file){
  const before=await state();
  const picture=page.locator('.work-card-preview');
  await page.waitForFunction(()=>document.querySelector('.work-card-preview')?.naturalWidth===1080);
  assert.equal(await picture.evaluate(img=>img.naturalHeight),1920);
  assert.equal(await page.locator('.work-card').getAttribute('data-level-id'),level.id);
  const hash=await imageHash(picture);
  const pending=page.waitForEvent('download');await button('Сохранить PNG').click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),`Poluson-${level.id.slice(-3)}.png`);
  await download.saveAs(`.test-output/m4b/png/${file}`);
  assert.equal(createHash('sha256').update(await readFile(`.test-output/m4b/png/${file}`)).digest('hex'),hash);
  assert.deepEqual(await state(),before);
  return hash;
 }
 await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Коллаж',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.__shareCalls.length),0);
 passed.push('empty profile cannot export unfinished targets; no automatic share call');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await solve(levels[0]);
 await page.getByRole('button',{name:'В альбом',exact:true}).click();
 const direct=page.getByRole('button',{name:'Сохранить PNG',exact:true});
 const picture=page.locator('.work-card-preview');await page.waitForFunction(()=>!!document.querySelector('.work-card-preview')?.naturalWidth);
 const proof=await state(),url0=await picture.getAttribute('src');
 assert.equal(await page.locator('.work-card').getAttribute('data-level-id'),'gradient-001');
 await page.evaluate(()=>window.showSaveFilePicker=async()=>{
  window.__pickerActivation=navigator.userActivation.isActive;throw new DOMException('cancelled','AbortError');
 });
 await direct.click();await page.waitForFunction(()=>document.querySelector('.work-card-status')?.textContent.includes('отменено'));
 assert.equal(await picture.getAttribute('src'),url0);assert(await page.evaluate(()=>window.__pickerActivation));
 await page.evaluate(()=>window.showSaveFilePicker=undefined);
 const expectedHash=await downloadClean(levels[0],'first-work.png');
 await page.getByLabel('Действия с работой').click();await button('Поделиться PNG').click();
 await page.waitForFunction(()=>document.querySelector('.work-card-status')?.textContent.includes('отменено'));
 const shared=await page.evaluate(()=>window.__shareCalls.at(-1));
 assert.equal(shared.hash,expectedHash);assert.equal(shared.name,'Poluson-001.png');assert.equal(shared.active,true);
 assert.equal(await picture.getAttribute('src'),url0);
 await page.keyboard.press('Escape');
 assert.deepEqual(await state(),proof);
 await page.setViewportSize({width:320,height:568});await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 const buttonBounds=await direct.boundingBox();assert(buttonBounds.height>=48&&buttonBounds.y+buttonBounds.height<=568);
 await page.getByRole('button',{name:'‹ Назад',exact:true}).click();await page.locator('#hue-app[data-layer=result]').waitFor();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='');
 passed.push('first real victory uses the same PNG bytes in preview, download and share; cancellation permits retry and Back restores the result');
 const wallpapers=[{format:'clean',file:'first-work.png',works:[levels[0]]}];
 for(const level of levels.slice(1,8)){
  await button('Дальше').click();
  await page.waitForFunction(id=>document.querySelector('#hue-app')?.dataset.level===id,level.id);
  await solve(level);
  if(!['gradient-002','gradient-003','gradient-005','gradient-008'].includes(level.id))continue;
  await button('В альбом').click();
  const file=`Poluson-${level.id.slice(-3)}.png`;
  await downloadClean(level,file);
  wallpapers.push({format:'clean',file,works:[level]});
  await button('‹ Назад').click();
 }
 passed.push('played through levels 2–8 and downloaded exact horizontal, vertical and two-dimensional gradient previews from their cards');
 // Populate a labelled imported checkpoint using the actual pure reducers, not invented bests.
 await page.evaluate(async()=>{
  const{openIndexedDb}=await import('/src/local-store/indexed-db.ts'),{prepareCommit,hashText}=await import('/src/local-store/command.ts');
  const{levels}=await import('/src/domain/levels.ts'),{newWorkspace,applyAction,fingerprintPayload}=await import('/src/domain/workspace.ts');
  const{makeField,editorFingerprintPayload}=await import('/src/domain/editor.ts'),{applyCreative,authorView}=await import('/src/domain/creative.ts');
  const rows=(await import('/docs/spec/candidates/validation-0.1.json')).default.rows,fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))])));let s=newWorkspace('fixture');
  for(const l of levels.slice(0,30)){s=applyAction(s,{kind:'open',levelId:l.id,attemptId:`fixture-${l.ordinal}`},fp);for(const[from,to]of rows.find(r=>r.id===l.id).legalOptimalWitness)s=applyAction(s,{kind:'swap',attemptId:s.attempts[l.id].attemptId,from,to},fp);}
  const first=makeField(6,1);let c=applyCreative(s.creative,{kind:'editor-create',draftId:'export-draft',workId:'export-work',nodeId:'export-node-a',field:first,name:'Своя <b>работа</b>',seed:0},await hashText(editorFingerprintPayload(first)));
  const solve=c=>{const view=authorView(c),board=[...view.attempt.board];for(let i=0;i<board.length;i++)if(board[i]!==i){const j=board.indexOf(i);c=applyCreative(c,{kind:'author-swap',attemptId:view.attempt.attemptId,from:i,to:j});[board[i],board[j]]=[board[j],board[i]];}return c;};
  c=solve(applyCreative(c,{kind:'author-start',workId:'export-work',nodeId:'export-node-a',attemptId:'own-a'}));
  const second=makeField(5,4);c=applyCreative(c,{kind:'editor-apply',workId:'export-work',nodeId:'export-node-b',baseNodeId:'export-node-a',editId:'fixture-edit',field:second,seed:0},await hashText(editorFingerprintPayload(second)));
  c=solve(applyCreative(c,{kind:'author-start',workId:'export-work',nodeId:'export-node-b',attemptId:'own-b'}));c=applyCreative(c,{kind:'author-exit'});s={...s,creative:c};
  const store=await openIndexedDb(),old=await store.load('guest-local-v1');await store.commit(await prepareCommit({operationId:crypto.randomUUID(),vaultId:'guest-local-v1',expectedRevision:old.localRevision,nextSnapshotJson:JSON.stringify(s),facts:[]}));store.close();
 });
 await page.reload();await page.waitForSelector('html[data-state=ready]');await page.keyboard.press('Escape');
 await page.locator('#levels').click();await button('Альбом').click();await button('Мои работы').click();
 await page.locator('[data-draft-id=export-draft]').click();
 assert.equal(await page.locator('.work-card').getAttribute('data-work-key'),'own:export-work:export-node-b');
 await page.waitForFunction(()=>document.querySelector('.work-card-preview')?.naturalWidth===1080);
 const ownPicture=page.locator('.work-card-preview'),ownHash=await imageHash(ownPicture);
 const ownSave=page.waitForEvent('download');await button('Сохранить PNG').click();
 await (await ownSave).saveAs('.test-output/m4b/png/own-card.png');
 assert.equal(createHash('sha256').update(await readFile('.test-output/m4b/png/own-card.png')).digest('hex'),ownHash);
 const ownNode=(await state()).state.creative.works['export-work'].nodes['export-node-b'];
 wallpapers.push({format:'clean',file:'own-card.png',works:[ownNode.field]});
 await button('‹ Назад').click();assert.equal(await button('Мои работы').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.draftId),'export-draft');

 await button('Коллаж').click();
 for(const id of ['a','b'])await page.locator(`[data-album-focus="own:export-work:export-node-${id}"]`).click();
 assert.deepEqual(await page.locator('.album-print[aria-pressed=true]').evaluateAll(nodes=>nodes.map(n=>n.dataset.albumFocus)),['own:export-work:export-node-b']);
 await button('Собранное').click();await page.locator('[data-album-level=gradient-001]').click();
 await button('Мои работы').click();assert.equal(await page.locator('.album-print[aria-pressed=true]').getAttribute('data-album-focus'),'own:export-work:export-node-b');
 assert.match(await page.locator('.album-selection p').innerText(),/2 из 3/);
 await button('‹ Назад').click();await button('Собранное').click();
 passed.push('verified own gallery card downloads the displayed revision and mixed collage replaces earlier revisions in one slot');

 await page.locator('[data-album-level=gradient-001]').click();await page.getByLabel('Действия с работой').click();await button('Другие макеты').click();await ready();
 const before=await state(),previewHash=await page.locator('.export-preview').evaluate(async img=>{const b=await(await fetch(img.src)).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить изображение',exact:true}).click();const download=await downloadPromise;await download.saveAs('.test-output/m4b/png/ui-clean.png');
 assert.equal(createHash('sha256').update(await readFile('.test-output/m4b/png/ui-clean.png')).digest('hex'),previewHash);assert((await page.locator('.export-status').innerText()).includes('запрошена'));
 passed.push('actual Chromium download is byte-identical to the preview PNG; UI does not invent an OS receipt');
 const locked=await page.getByRole('option',{name:/В рамке/}).evaluate(o=>({disabled:o.disabled,label:o.textContent}));assert(locked.disabled,JSON.stringify({locked,rights:(await state()).state.rights.filter(r=>r.startsWith('export-'))}));
 await page.getByLabel('Макет',{exact:true}).selectOption('export-strip');await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('ещё 3'));
 await page.locator('[data-export-key="campaign:gradient-001"]').check();await page.locator('[data-export-key="own:export-work:export-node-a"]').check();await page.locator('[data-export-key="own:export-work:export-node-b"]').check();
 assert.equal(await page.locator('.export-work input:checked').count(),2);assert(!(await page.locator('[data-export-key="own:export-work:export-node-a"]').isChecked()));
 await page.locator('[data-export-key="campaign:gradient-002"]').check();await ready();passed.push('multi-work selection replaces another revision of the same logical work and requests missing works');
 await page.getByLabel('Макет',{exact:true}).selectOption('export-caption');await page.locator('[data-export-key="campaign:gradient-001"]').check();await ready();
 const caption=page.getByRole('textbox',{name:'Подпись',exact:true});await caption.fill('а\nб\nв');await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('Сократите'));
 assert.equal(await caption.inputValue(),'а\nб\nв');assert(await page.getByRole('button',{name:'Сохранить изображение',exact:true}).isDisabled());
 await caption.fill('W'.repeat(80));await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('Сократите'));assert.equal(await caption.inputValue(),'W'.repeat(80));
 await caption.fill('Мой градиент\nСобрано с удовольствием');await ready();passed.push('actual Canvas metrics reject excess lines and wide text without truncation or font shrink; caption remains editable');
 const url=await page.locator('.export-preview').getAttribute('src');await page.getByRole('button',{name:'Поделиться',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('отменено'));
 assert.equal(await page.locator('.export-preview').getAttribute('src'),url);assert.equal(await caption.inputValue(),'Мой градиент\nСобрано с удовольствием');
 await page.evaluate(()=>window.__shareMode='denied');await page.getByRole('button',{name:'Поделиться',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('Не удалось'));
 assert(await page.getByRole('button',{name:'Сохранить изображение',exact:true}).isEnabled());await page.evaluate(()=>window.__shareMode='success');await page.getByRole('button',{name:'Поделиться',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.export-status')?.textContent.includes('передано'));
 assert((await page.evaluate(()=>window.__shareCalls)).every(c=>c.active&&c.size>0));passed.push('share cancel/denial/success fixtures preserve preview and caption, retain click activation and never claim publication');
 // Save-picker responses are modelled; the previous download is actual browser evidence.
 await page.evaluate(()=>window.showSaveFilePicker=async()=>{if(window.__saveMode==='cancel')throw new DOMException('cancel','AbortError');if(window.__saveMode==='denied')throw new DOMException('denied','NotAllowedError');return{createWritable:async()=>({write:async file=>{if(window.__saveMode==='quota')throw new DOMException('full','QuotaExceededError');window.__savedBytes=file.size;},close:async()=>{},abort:async()=>{window.__aborted=true;}})};});
 for(const mode of['cancel','denied','quota','success']){await page.evaluate(mode=>window.__saveMode=mode,mode);await page.getByRole('button',{name:'Сохранить изображение',exact:true}).click();await page.waitForFunction(mode=>document.querySelector('.export-status')?.textContent.includes(mode==='cancel'?'отменено':mode==='success'?'сохранено':'Не удалось'),mode);assert.equal(await page.locator('.export-preview').getAttribute('src'),url);}
 assert(await page.evaluate(()=>window.__aborted&&window.__savedBytes>0));passed.push('picker cancellation, denied access, quota failure/abort and successful close retain the prepared file for retry');
 for(const viewport of[{width:320,height:568},{width:568,height:320},{width:844,height:390},{width:800,height:1280}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(60);const bounds=await page.locator('.export-controls button').evaluateAll(nodes=>nodes.map(b=>{const r=b.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.height>=48&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;}));assert(bounds.every(Boolean));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-output/m4b/export-ui.png'});
 await page.setViewportSize({width:568,height:320});await page.evaluate(()=>{const sizes=[...document.querySelectorAll('#hue-app *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const[e,size]of sizes)e.style.fontSize=`${size*1.5}px`;});
 assert((await page.locator('.export-controls button').evaluateAll(nodes=>nodes.map(b=>{const r=b.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;}))).every(Boolean));
 passed.push('initial save/share/back actions remain visible and hittable across target viewports and enlarged text');
 const after=await state();assert.equal(after.revision,before.revision);assert.deepEqual(after.state,before.state);passed.push('all exports and OS response fixtures leave progress, rights, author proofs and workspace revision unchanged');
 // Every renderer, including the three future daily-earned templates, uses an explicitly synthetic rights fixture.
 const pngs=await page.evaluate(async()=>{
  const{openIndexedDb}=await import('/src/local-store/indexed-db.ts'),{exportPlan,eligibleExportWorks,exportWorkCount}=await import('/src/domain/export.ts'),{renderExport}=await import('/src/game/exportRenderer.ts');
  const store=await openIndexedDb(),saved=await store.load('guest-local-v1');store.close();const state=JSON.parse(saved.snapshotJson);state.rights.push('export-frame','export-diptych','export-postcard');
  const catalog=eligibleExportWorks(state),chosen=[catalog.find(w=>w.key==='own:export-work:export-node-a'),catalog.find(w=>w.key==='own:export-work:export-node-b'),catalog[0],catalog[5]].map(w=>w.key);
  // Replace one duplicate logical work for multi-work plans.
  const distinct=[chosen[0],chosen[2],chosen[3],catalog[10].key],results=[];
  for(const format of['clean','export-caption','export-strip','export-grid','export-frame','export-diptych','export-postcard','chapter-page']){
   const keys=distinct.slice(0,exportWorkCount(format)),plan=exportPlan(state,{format,keys,caption:'Мой градиент',chapterIndex:0}),blob=await renderExport(plan);
   results.push({format,file:`${format}.png`,bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),works:plan.works.map(w=>w.field)});
  }
  const otherRevision=exportPlan(state,{format:'clean',keys:[chosen[1]],caption:''});
  const otherBytes=new Uint8Array(await (await renderExport(otherRevision)).arrayBuffer());
  results.push({format:'clean',file:'clean-other-revision.png',bytes:Array.from(otherBytes),works:otherRevision.works.map(w=>w.field)});
  return results;
 });
 for(const png of pngs)await writeFile(`.test-output/m4b/png/${png.file}`,Buffer.from(png.bytes));
 await writeFile('.test-output/m4b/png/works.json',JSON.stringify([...wallpapers,...pngs.map(({format,file,works})=>({format,file,works}))],null,2));
 passed.push('all eight renderers execute in real Canvas; future daily rights are fixture-only, never awarded or persisted');
 assert.deepEqual(errors,[]);await writeFile('.test-output/m4b/browser.json',JSON.stringify({passed,pageErrors:errors,actual:'Chromium PNG render/download, UI selection, text metrics, geometry/lifecycle',fixtures:'30 completed campaign + verified own revisions imported with reducers; share/save-picker responses modelled; daily rights renderer-only',nativeRuntime:'NOT RUN',publication:'NOT ATTEMPTED'},null,2));
 console.log(`PASS: ${passed.length} M4 export browser scenarios; ${wallpapers.length+pngs.length} PNG files for independent pixel checks.`);await context.close();
}finally{await browser?.close();server.kill();}
