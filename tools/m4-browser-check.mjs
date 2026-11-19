// Real editor UI and IndexedDB. Fault wrappers model bridge/quota responses, not native SQLite.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
let pw;try{pw=await import('playwright');}catch{pw=createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright');}
await mkdir('.test-output/m4',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'ignore'});
const base='http://127.0.0.1:4178',passed=[],errors=[];let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForSelector('html[data-state=ready]');
 const idle=()=>page.waitForFunction(()=>document.querySelector('#hue-app')?.dataset.busy==='false');
 const state=()=>page.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const store=await openIndexedDb(),r=await store.load('guest-local-v1');store.close();return JSON.parse(r.snapshotJson);});
 const work=async()=>Object.values((await state()).creative.works)[0];
 const saved=()=>page.waitForFunction(()=>document.querySelector('.editor-status')?.textContent.includes('сохранён на устройстве'));
 await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();await page.getByRole('button',{name:'Мои работы',exact:true}).click();await page.getByRole('button',{name:'Создать композицию',exact:true}).click();await idle();
 assert.equal((await work()).nodes[(await work()).headNodeId].field.width,4);assert.deepEqual((await state()).completed,[]);passed.push('new 4×4 editor available before any campaign completion');
 await page.getByRole('textbox',{name:'Название работы'}).fill('<b>Моя 🌈</b>');
 await page.waitForFunction(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return Object.values(JSON.parse(r.snapshotJson).creative.works)[0].name==='<b>Моя 🌈</b>';});
 assert.equal(await page.locator('#dialog-title b').count(),0);passed.push('debounced plain-text Unicode rename commits without gameplay revision');
 const original=await work();await page.getByLabel('Столбцы',{exact:true}).selectOption('5');await saved();
 assert.equal(Object.keys((await work()).nodes).length,1);assert.equal(Object.values((await work()).buffers)[0].field.width,5);
 await page.getByRole('button',{name:'Отмена',exact:true}).click();await idle();assert.deepEqual((await work()).nodes,original.nodes);passed.push('resize preview is durable separately; Cancel leaves previous revision exact');
 await page.getByLabel('Столбцы',{exact:true}).selectOption('6');await page.getByLabel('Строки',{exact:true}).selectOption('1');
 await page.getByRole('button',{name:'Применить',exact:true}).click();await idle();
 let current=await work(),line=current.nodes[current.headNodeId].field;
 assert.equal(Object.keys(current.nodes).length,2);assert.deepEqual(line.pinnedPositions,[0,5]);assert.equal(line.cornerColorsTLTRBLBR[0],line.cornerColorsTLTRBLBR[2]);
 passed.push('Apply makes one immutable revision; one-row palette and anchors normalize');
 await page.getByRole('button',{name:'Закрепления',exact:true}).click();await page.getByRole('button',{name:'Плитка 1, закреплена',exact:true}).click();
 await page.getByRole('button',{name:'Применить',exact:true}).click();await idle();assert(await page.getByRole('button',{name:'Пройти',exact:true}).isDisabled());
 assert((await page.locator('.editor-validation').innerText()).includes('две закреплённые'));passed.push('invalid draft saves for editing but author Play is unavailable');
 await page.getByRole('button',{name:'История',exact:true}).click();await page.getByRole('button',{name:'Открыть версию 2',exact:true}).click();await idle();
 assert.equal((await work()).headNodeId,Object.keys((await work()).nodes)[1]);
 const before=await state();await page.getByRole('button',{name:'Пройти',exact:true}).click();await page.waitForSelector('#hue-app[data-mode=author][data-layer=none]');
 await page.locator('#help').click();await page.waitForSelector('#hue-app[data-layer=help]');await page.reload();await page.waitForSelector('html[data-state=ready]');
 assert.equal((await state()).creative.activeTest.attempt.assisted,true);assert.equal(await page.locator('#hue-app').getAttribute('data-mode'),'author');
 passed.push('author attempt and assistance survive reload on the exact saved snapshot');
 let test=(await state()).creative.activeTest,board=[...test.attempt.board];
 for(let i=0;i<board.length;i++)if(board[i]!==i){const j=board.indexOf(i);for(const index of[i,j]){const rect=await page.locator('#board-region canvas').boundingBox();await page.mouse.click(rect.x+(index%6+.5)*rect.width/6,rect.y+4+.5*(rect.height-8));}await idle();[board[i],board[j]]=[board[j],board[i]];}
 await page.waitForSelector('#hue-app[data-layer=result]');let after=await state();assert.deepEqual(after.completed,before.completed);assert.deepEqual(after.bests,before.bests);assert.deepEqual(after.rights,before.rights);
 current=await work();assert.equal(current.completions.length,1);assert.equal(current.completions[0].assisted,true);passed.push('real tap–tap author completion stores exact proof with zero campaign awards');
 await page.getByRole('button',{name:'Вернуться в редактор',exact:true}).click();await idle();
 assert((await page.locator('.editor-validation').innerText()).includes('пройдена автором'));
 const nodeId=(await work()).headNodeId;await page.getByRole('textbox',{name:'Название работы'}).fill('После проверки');await page.waitForFunction(()=>document.querySelector('#dialog-title')?.textContent==='После проверки');
 assert.equal((await work()).headNodeId,nodeId);assert((await page.locator('.editor-validation').innerText()).includes('пройдена автором'));passed.push('rename keeps proof; history is not rewritten');
 await page.getByRole('button',{name:'Старт',exact:true}).click();await page.getByRole('button',{name:'Другое начало',exact:true}).click();await page.getByRole('button',{name:'Применить',exact:true}).click();await idle();
 current=await work();assert.notEqual(current.headNodeId,nodeId);assert.equal(current.completions.length,1);assert(!(await page.locator('.editor-validation').innerText()).includes('пройдена автором'));passed.push('different fixed start invalidates current verification while preserving old proof');
 await page.getByRole('button',{name:'Цвета',exact:true}).click();await page.getByLabel('Столбцы',{exact:true}).selectOption('5');await saved();
 await page.reload();await page.waitForSelector('html[data-state=ready]');await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();await page.getByRole('button',{name:'Мои работы',exact:true}).click();await page.locator('[data-draft-id]').click();
 assert((await page.locator('.editor-status').innerText()).includes('Восстановлен'));assert.equal(await page.getByLabel('Столбцы',{exact:true}).inputValue(),'5');await page.getByRole('button',{name:'Отмена',exact:true}).click();await idle();
 passed.push('interrupted preview restores from physical IndexedDB without changing the committed version');
 const beforeBranches=Object.keys((await work()).nodes).length;
 await page.getByLabel('Столбцы',{exact:true}).selectOption('5');await saved();
 const tab=await context.newPage();tab.on('pageerror',e=>errors.push(e.message));await tab.goto(base);await tab.waitForSelector('html[data-state=ready]');await tab.locator('#levels').click();await tab.getByRole('button',{name:'Альбом',exact:true}).click();await tab.getByRole('button',{name:'Мои работы',exact:true}).click();await tab.locator('[data-draft-id]').click();
 await tab.getByLabel('Столбцы',{exact:true}).selectOption('4');await tab.waitForFunction(()=>document.querySelector('.editor-status')?.textContent.includes('сохранён на устройстве'));
 const buffers=Object.values((await work()).buffers);assert.equal(buffers.length,2);assert.deepEqual(buffers.map(b=>b.field.width).sort(),[4,5]);
 await tab.getByRole('button',{name:'Применить',exact:true}).click();await tab.waitForFunction(()=>document.querySelector('#hue-app')?.dataset.busy==='false');
 const winningHead=(await work()).headNodeId;
 await page.getByRole('button',{name:'Применить',exact:true}).click();await idle();
 if(Object.keys((await work()).nodes).length===beforeBranches+1){await page.getByRole('button',{name:'Применить',exact:true}).click();await idle();}
 current=await work();assert.equal(Object.keys(current.nodes).length,beforeBranches+2);assert.equal(current.headNodeId,winningHead);
 assert((await page.locator('.editor-status').innerText()).includes('ветка'));await page.getByRole('button',{name:'История',exact:true}).click();assert((await page.locator('.editor-content').innerText()).includes('· ветка'));
 const winningIndex=Object.keys(current.nodes).indexOf(winningHead)+1;await page.getByRole('button',{name:`Открыть версию ${winningIndex}`,exact:true}).click();await idle();await page.getByRole('button',{name:'Цвета',exact:true}).click();await tab.close();
 passed.push('two actual editor tabs retain independent recovered previews and expose a stale applied branch in history');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.__editorFail=true;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='workspaces'&&window.__editorFail)throw new DOMException('Quota fixture','QuotaExceededError');return put.call(this,value,...rest);};});
 await page.getByRole('textbox',{name:'Название работы'}).fill('После ошибки записи');await page.getByRole('button',{name:'Повторить сохранение',exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Название работы'}).inputValue(),'После ошибки записи');assert.notEqual((await work()).name,'После ошибки записи');
 assert.equal(await page.locator('#hue-app').getAttribute('data-layer'),'meta');assert(!(await page.locator('.editor-status').innerText()).startsWith('Сохранено'));
 await page.evaluate(()=>window.__editorFail=false);await page.getByRole('button',{name:'Повторить сохранение',exact:true}).click();await idle();assert.equal((await work()).name,'После ошибки записи');
 passed.push('quota failure keeps the actual form and input visible; explicit retry confirms the pending operation');
 await page.getByRole('textbox',{name:'Название работы'}).fill('🌈'.repeat(81));await page.keyboard.press('Escape');await page.getByRole('button',{name:'Выйти без этих изменений',exact:true}).waitFor();
 await page.getByRole('button',{name:'Остаться',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Название работы'}).inputValue(),'🌈'.repeat(81));
 await page.getByRole('textbox',{name:'Название работы'}).fill('После ошибки записи');await page.getByRole('button',{name:'Назад',exact:true}).click();await page.locator('[data-draft-id]').click();
 passed.push('invalid unsaved Unicode name offers Stay or explicit exit without edits; normal Back flushes');
 for(const viewport of[{width:320,height:568},{width:568,height:320},{width:844,height:390},{width:800,height:1280}]) {
  await page.setViewportSize(viewport);await page.waitForTimeout(80);
  const checks=await page.locator('.editor-controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:hit===b||b.contains(hit),height:r.height};}));
  assert(checks.every(c=>c.inside&&c.hit&&c.height>=48));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-output/m4/editor.png'});
 await page.setViewportSize({width:568,height:320});
 await page.evaluate(()=>{const sizes=[...document.querySelectorAll('#hue-app *')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const[e,size]of sizes)e.style.fontSize=`${size*1.5}px`;});
 await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const enlarged=await page.locator('.editor-controls button').evaluateAll(nodes=>nodes.map(b=>{const r=b.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;}));assert(enlarged.every(Boolean));
 await page.screenshot({path:'.test-output/m4/editor-large-text.png'});passed.push('initial editor actions remain visible and hittable in narrow/short/tablet viewports and at 150% computed text size');
 await context.close();
 // Separate sessions exercise native-like response loss and real IndexedDB CAS, not UI clicks.
 const c=await browser.newContext(),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForSelector('html[data-state=ready]');
 const physical=await p.evaluate(async()=>{
  const{Session}=await import('/src/app/session.ts'),{openIndexedDb}=await import('/src/local-store/indexed-db.ts'),{hashText}=await import('/src/local-store/command.ts');
  const{levels}=await import('/src/domain/levels.ts'),{fingerprintPayload}=await import('/src/domain/workspace.ts'),{makeField}=await import('/src/domain/editor.ts');
  const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))]))),real=await openIndexedDb();let fault='none',lastCommand;
  const wrapped={...real,commit:async command=>{lastCommand=command;if(fault==='before')throw Error('Quota response fixture');const result=await real.commit(command);if(fault==='after')throw Error('Response lost');return result;}};
  const a=new Session(wrapped,fp);await a.load();fault='after';await a.act({kind:'editor-create',draftId:'durable-draft',workId:'durable-work',nodeId:'durable-root',name:'Новая',field:makeField(),seed:0});
  const lostId=lastCommand.operationId,known=await real.readOperation('guest-local-v1',lostId);if(!known||a.pending)throw Error('Lost response not resolved');
  const b=new Session(real,fp);await b.load();fault='none';await a.act({kind:'editor-apply',workId:'durable-work',nodeId:'winner',baseNodeId:'durable-root',editId:'a-edit',field:makeField(5,4),seed:0});
  let conflict=false;const stale={kind:'editor-apply',workId:'durable-work',nodeId:'branch',baseNodeId:'durable-root',editId:'b-edit',field:makeField(6,5),seed:0};
  try{await b.act(stale);}catch{conflict=true;}if(!conflict)throw Error('CAS failed');await b.act(stale);
  const w=b.state.creative.works['durable-work'];if(w.headNodeId!=='winner'||!w.nodes.branch)throw Error('Stale branch lost');
  await a.load();fault='before';let failed=false;const prev=await real.load('guest-local-v1');
  try{await a.act({kind:'editor-rename',workId:'durable-work',name:'После сбоя'});}catch{failed=true;}
  const pendingId=a.pending?.operationId,still=await real.load('guest-local-v1');if(!failed||prev.snapshotJson!==still.snapshotJson||await real.readOperation('guest-local-v1',pendingId))throw Error('Failed write was visible');
  fault='none';await a.resolvePending();if(a.state.creative.works['durable-work'].name!=='После сбоя'||!(await real.readOperation('guest-local-v1',pendingId)))throw Error('Exact retry failed');
  const facts=(await real.listFacts('guest-local-v1')).map(f=>JSON.parse(f.payloadJson));if(facts.filter(f=>f.kind==='editor-create').length!==1)throw Error('Duplicate create fact');real.close();
  return{responseLossResolved:true,staleBranchPreserved:true,failedWriteInvisible:true,sameOperationRetry:true};
 });
 passed.push('physical IndexedDB snapshot/fact/receipt resolves lost editor response exactly once','two sessions preserve stale edit as a branch after CAS conflict','failed editor write remains invisible; retry uses the original operation ID');
 await c.close();
 for(const fail of[false,true]) {
  const c=await browser.newContext(),p=await c.newPage();await p.goto(base);await p.waitForSelector('html[data-state=ready]');
  await p.evaluate(async fail=>{
   const{Session}=await import('/src/app/session.ts'),{openIndexedDb}=await import('/src/local-store/indexed-db.ts'),{hashText,prepareCommit}=await import('/src/local-store/command.ts');
   const{levels}=await import('/src/domain/levels.ts'),{applyAction,newWorkspace,fingerprintPayload}=await import('/src/domain/workspace.ts');
   const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))])));let legacy=newWorkspace('legacy');const l=levels[0],from=l.startTileAtPosition.findIndex((v,i)=>v!==i);
   legacy=applyAction(legacy,{kind:'swap',attemptId:'legacy',from,to:l.startTileAtPosition[from]},fp);
   legacy=applyAction(legacy,{kind:'copy',levelId:l.id,draftId:'old-copy',workId:'old-work',nodeId:'old-node',name:'До редактора'},fp);delete legacy.creative;
   const raw=JSON.stringify(legacy),real=await openIndexedDb(),old=await real.load('guest-local-v1');await real.commit(await prepareCommit({operationId:crypto.randomUUID(),vaultId:'guest-local-v1',expectedRevision:old.localRevision,nextSnapshotJson:raw,facts:[]}));
   let fault=fail;const wrapped={...real,commit:async command=>{if(fault)throw Error('Migration failure fixture');return real.commit(command);}};const session=new Session(wrapped,fp);let rejected=false;try{await session.load();}catch{rejected=true;}
   if(fail) {if(!rejected||(await real.load('guest-local-v1')).snapshotJson!==raw)throw Error('Failed migration altered original');const facts=await real.listFacts('guest-local-v1');if(facts.some(f=>JSON.parse(f.payloadJson).kind==='local-migration-backup'))throw Error('Partial backup');fault=false;await session.resolvePending();}
   const backups=(await real.listFacts('guest-local-v1')).map(f=>JSON.parse(f.payloadJson)).filter(f=>f.kind==='local-migration-backup');
   if(backups.length!==1||backups[0].snapshotJson!==raw)throw Error('Exact migration backup missing');
   const w=session.state.creative.works['old-work'];if(w.completions.length||w.nodes['old-node'].fingerprint!==fp.get(l.id))throw Error('Copy proof inherited');
   for(const key of['attempts','completed','bests','rights','albumCopies'])if(JSON.stringify(session.state[key])!==JSON.stringify(legacy[key]))throw Error(`Migration changed ${key}`);
   const revision=session.revision;await session.load();if(session.revision!==revision)throw Error('Migration repeated');real.close();
  },fail);
  passed.push(fail?'failed M3 editor migration leaves exact source; retry commits one backup and converted draft':'M3 copies migrate atomically to unverified editor roots without changing campaign data');await c.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile('.test-output/m4/browser.json',JSON.stringify({passed,physical,pageErrors:errors,limits:['Native SQLite/runtime, physical Android touch NOT RUN','PNG/share M4b NOT IMPLEMENTED','150% check is browser smoke, not native font acceptance']},null,2));
 console.log(`PASS: ${passed.length} M4 editor browser scenarios.`);
} finally {await browser?.close();server.kill();}
