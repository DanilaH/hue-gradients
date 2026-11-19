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
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shareCalls.push({name:data.files[0].name,size:data.files[0].size,active:navigator.userActivation.isActive});if(window.__shareMode==='cancel')throw new DOMException('Cancelled','AbortError');if(window.__shareMode==='denied')throw new DOMException('Denied','NotAllowedError');}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForSelector('html[data-state=ready]');
 const ready=()=>page.waitForSelector('.export-panel[data-ready=true]');
 const state=()=>page.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return{state:JSON.parse(r.snapshotJson),revision:r.localRevision};});
 await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Экспорт',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.__shareCalls.length),0);
 passed.push('empty profile cannot export unfinished targets; no automatic share call');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 const field=await page.locator('#board-region canvas').boundingBox();
 for(const i of[1,2])await page.mouse.click(field.x+(i+.5)*field.width/4,field.y+field.height/2);
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
 const directDownload=page.waitForEvent('download');await direct.click();const earned=await directDownload;
 assert.equal(earned.suggestedFilename(),'Poluson-001.png');await earned.saveAs('.test-output/m4b/png/first-work.png');
 const expectedHash=await picture.evaluate(async img=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await (await fetch(img.src)).arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join(''));
 assert.equal(createHash('sha256').update(await readFile('.test-output/m4b/png/first-work.png')).digest('hex'),expectedHash);
 assert.deepEqual(await state(),proof);
 await page.setViewportSize({width:320,height:568});await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 const buttonBounds=await direct.boundingBox();assert(buttonBounds.height>=48&&buttonBounds.y+buttonBounds.height<=568);
 await page.getByRole('button',{name:'‹ Назад',exact:true}).click();await page.locator('#hue-app[data-layer=result]').waitFor();
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='');
 passed.push('first real victory opens its exact file, one tap saves, picker cancellation permits retry and Back restores the result');
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
 await page.reload();await page.waitForSelector('html[data-state=ready]');await page.keyboard.press('Escape');await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();await page.getByRole('button',{name:'Экспорт',exact:true}).click();await ready();
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
   results.push({format,bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),works:plan.works.map(w=>w.field)});
  }return results;
 });
 for(const png of pngs)await writeFile(`.test-output/m4b/png/${png.format}.png`,Buffer.from(png.bytes));
 await writeFile('.test-output/m4b/png/works.json',JSON.stringify(pngs.map(({format,works})=>({format,works})),null,2));
 passed.push('all eight renderers execute in real Canvas; future daily rights are fixture-only, never awarded or persisted');
 assert.deepEqual(errors,[]);await writeFile('.test-output/m4b/browser.json',JSON.stringify({passed,pageErrors:errors,actual:'Chromium PNG render/download, UI selection, text metrics, geometry/lifecycle',fixtures:'30 completed campaign + verified own revisions imported with reducers; share/save-picker responses modelled; daily rights renderer-only',nativeRuntime:'NOT RUN',publication:'NOT ATTEMPTED'},null,2));
 console.log(`PASS: ${passed.length} M4 export browser scenarios; eight PNG files generated for independent pixel checks.`);await context.close();
}finally{await browser?.close();server.kill();}
