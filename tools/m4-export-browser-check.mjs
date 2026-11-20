// Actual wallpaper downloads plus an imported author-revision checkpoint.
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
 const phoneScreen={width:390,height:844},phoneViewport={width:390,height:790},scale=3;
 const phonePixels=[phoneScreen.width*scale,phoneScreen.height*scale];
 const context=await browser.newContext({viewport:phoneViewport,screen:phoneScreen,deviceScaleFactor:scale,acceptDownloads:true});
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

 const state=()=>page.evaluate(async()=>{const{openIndexedDb}=await import('/src/local-store/indexed-db.ts');const s=await openIndexedDb(),r=await s.load('guest-local-v1');s.close();return{state:JSON.parse(r.snapshotJson),revision:r.localRevision};});
 const levels=JSON.parse(await readFile('docs/spec/candidates/levels-0.1.json','utf8')).campaign;
 const witnesses=JSON.parse(await readFile('docs/spec/candidates/validation-0.1.json','utf8')).rows;
 const imageHash=picture=>picture.evaluate(async img=>{
  const bytes=await (await fetch(img.src)).arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 const direct=button('Сохранить PNG'),picture=page.locator('.work-card-preview');
 const ready=async (size=phonePixels)=>{
  await page.waitForFunction(([width,height])=>{
   const img=document.querySelector('.work-card-preview');
   return img?.naturalWidth===width && img.naturalHeight===height;
  },size);
 };
 const downloads=[];
 async function downloadWallpaper(field,file,filename,size=phonePixels){
  const before=await state();
  await ready(size);
  const hash=await imageHash(picture);
  const pending=page.waitForEvent('download');
  await direct.click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),filename);
  await download.saveAs(`.test-output/m4b/png/${file}`);
  assert.equal(createHash('sha256').update(await readFile(`.test-output/m4b/png/${file}`)).digest('hex'),hash);
  assert.deepEqual(await state(),before);
  downloads.push({file,field,size});
  return hash;
 }
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
 await page.locator('#levels').click();await page.getByRole('button',{name:'Альбом',exact:true}).click();assert.equal(await direct.count(),0);assert.equal(await page.evaluate(()=>window.__shareCalls.length),0);
 passed.push('empty profile cannot export unfinished targets; no automatic share call');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await solve(levels[0]);
 await page.getByRole('button',{name:'В альбом',exact:true}).click();
 await ready();
 const proof=await state(),url0=await picture.getAttribute('src');
 assert.equal(await page.locator('.work-card').getAttribute('data-level-id'),'gradient-001');
 assert.deepEqual(await page.evaluate(()=>[screen.width,screen.height,devicePixelRatio]),[390,844,3]);
 assert.equal(await page.evaluate(()=>innerHeight),790);

 await page.evaluate(()=>window.showSaveFilePicker=async()=>{
  window.__pickerActivation=navigator.userActivation.isActive;
  if(window.__saveMode==='cancel')throw new DOMException('cancel','AbortError');
  if(window.__saveMode==='denied')throw new DOMException('denied','NotAllowedError');
  return {createWritable:async()=>({
   write:async file=>{if(window.__saveMode==='quota')throw new DOMException('full','QuotaExceededError');window.__savedBytes=file.size;},
   close:async()=>{},
   abort:async()=>{window.__aborted=true;},
  })};
 });
 for(const [mode,feedback] of [['cancel','отменено'],['denied','Не удалось'],['quota','Не удалось'],['success','сохранено']]){
  await page.evaluate(mode=>{window.__saveMode=mode;document.querySelector('.work-card-status').textContent='';},mode);
  await direct.click();
  await page.waitForFunction(response=>document.querySelector('.work-card-status')?.textContent.includes(response),feedback);
  assert.equal(await picture.getAttribute('src'),url0);
 }
 assert(await page.evaluate(()=>window.__pickerActivation&&window.__aborted&&window.__savedBytes>0));
 await page.evaluate(()=>window.showSaveFilePicker=undefined);
 const expectedHash=await downloadWallpaper(levels[0],'first-work.png','Poluson-001.png');
 await page.getByLabel('Действия с работой').click();
 const share=button('Поделиться PNG');
 for(const [mode,feedback] of [['cancel','отменено'],['denied','Не удалось'],['success','передано']]){
  await page.evaluate(mode=>{window.__shareMode=mode;document.querySelector('.work-card-status').textContent='';},mode);
  await share.click();
  await page.waitForFunction(response=>document.querySelector('.work-card-status')?.textContent.includes(response),feedback);
  const shared=await page.evaluate(()=>window.__shareCalls.at(-1));
  assert.equal(shared.hash,expectedHash);assert.equal(shared.name,'Poluson-001.png');assert.equal(shared.active,true);
  assert.equal(await picture.getAttribute('src'),url0);
 }
 await page.keyboard.press('Escape');
 assert.deepEqual(await state(),proof);
 passed.push('victory downloads one screen-sized wallpaper and save/share retries reuse the exact preview under real click activation');

 const display=await context.newCDPSession(page);
 const emulateDisplay=(viewport,screen)=>display.send('Emulation.setDeviceMetricsOverride',{
  ...viewport,deviceScaleFactor:scale,mobile:false,screenWidth:screen.width,screenHeight:screen.height,
 });
 await emulateDisplay({width:320,height:568},phoneScreen);
 await page.evaluate(()=>document.documentElement.style.fontSize='150%');
 await ready();
 const buttonBounds=await direct.boundingBox();
 assert(buttonBounds.height>=48&&buttonBounds.y+buttonBounds.height<=568);
 assert.equal(await picture.getAttribute('src'),url0);

 // Move to a wider display that exceeds the previous 3000px native limit.
 await emulateDisplay({width:568,height:320},{width:1040,height:480});
 await ready([3120,1440]);
 const landscapePreview=await picture.boundingBox(),landscapeSave=await direct.boundingBox();
 assert(landscapePreview.y+landscapePreview.height<=landscapeSave.y+1);
 await downloadWallpaper(levels[0],'wide-display.png','Poluson-001.png',[3120,1440]);
 await emulateDisplay(phoneViewport,phoneScreen);
 await page.evaluate(()=>document.documentElement.style.fontSize='');
 await ready();
 await button('‹ Назад').click();await page.locator('#hue-app[data-layer=result]').waitFor();
 passed.push('the display determines PNG size independently of viewport and a display change refreshes the open card');

 for(const level of levels.slice(1,8)){
  await button('Дальше').click();
  await page.waitForFunction(id=>document.querySelector('#hue-app')?.dataset.level===id,level.id);
  await solve(level);
  if(!['gradient-002','gradient-003','gradient-005','gradient-008'].includes(level.id))continue;
  await button('В альбом').click();
  assert.equal(await page.locator('.work-card').getAttribute('data-level-id'),level.id);
  const file=`Poluson-${level.id.slice(-3)}.png`;
  await downloadWallpaper(level,file,file);
  await button('‹ Назад').click();
 }
 passed.push('played through levels 2–8 and downloaded horizontal, vertical and two-dimensional wallpapers');
 // Populate a labelled imported checkpoint using the actual pure reducers, not invented bests.
 await page.evaluate(async()=>{
  const{openIndexedDb}=await import('/src/local-store/indexed-db.ts'),{prepareCommit,hashText}=await import('/src/local-store/command.ts');
  const{levels}=await import('/src/domain/levels.ts'),{newWorkspace,applyAction,fingerprintPayload}=await import('/src/domain/workspace.ts');
  const{makeField,editorFingerprintPayload}=await import('/src/domain/editor.ts'),{applyCreative,authorView}=await import('/src/domain/creative.ts');
  const rows=(await import('/docs/spec/candidates/validation-0.1.json')).default.rows,fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))])));let s=newWorkspace('fixture');
  for(const l of levels.slice(0,15)){s=applyAction(s,{kind:'open',levelId:l.id,attemptId:`fixture-${l.ordinal}`},fp);for(const[from,to]of rows.find(r=>r.id===l.id).legalOptimalWitness)s=applyAction(s,{kind:'swap',attemptId:s.attempts[l.id].attemptId,from,to},fp);}
  const first=makeField(6,1);let c=applyCreative(s.creative,{kind:'editor-create',draftId:'export-draft',workId:'export-work',nodeId:'export-node-a',field:first,name:'Своя <b>работа</b>',seed:0},await hashText(editorFingerprintPayload(first)));
  const solve=c=>{const view=authorView(c),board=[...view.attempt.board];for(let i=0;i<board.length;i++)if(board[i]!==i){const j=board.indexOf(i);c=applyCreative(c,{kind:'author-swap',attemptId:view.attempt.attemptId,from:i,to:j});[board[i],board[j]]=[board[j],board[i]];}return c;};
  c=solve(applyCreative(c,{kind:'author-start',workId:'export-work',nodeId:'export-node-a',attemptId:'own-a'}));
  const second=makeField(5,4);c=applyCreative(c,{kind:'editor-apply',workId:'export-work',nodeId:'export-node-b',baseNodeId:'export-node-a',editId:'fixture-edit',field:second,seed:0},await hashText(editorFingerprintPayload(second)));
  c=solve(applyCreative(c,{kind:'author-start',workId:'export-work',nodeId:'export-node-b',attemptId:'own-b'}));c=applyCreative(c,{kind:'author-exit'});s={...s,creative:c};
  const store=await openIndexedDb(),old=await store.load('guest-local-v1');await store.commit(await prepareCommit({operationId:crypto.randomUUID(),vaultId:'guest-local-v1',expectedRevision:old.localRevision,nextSnapshotJson:JSON.stringify(s),facts:[]}));store.close();
 });
 await page.reload();await page.waitForSelector('html[data-state=ready]');await page.keyboard.press('Escape');
 await page.locator('#levels').click();await button('Альбом').click();
 assert.equal(await button('Коллаж').count(),0);
 assert.equal(await button('Полная страница главы 1').count(),0);
 await button('Мои работы').click();
 await page.locator('[data-draft-id=export-draft]').click();
 assert.equal(await page.locator('.work-card').getAttribute('data-work-key'),'own:export-work:export-node-b');
 const ownNode=(await state()).state.creative.works['export-work'].nodes['export-node-b'];
 await downloadWallpaper(ownNode.field,'own-card.png','Poluson-own.png');
 await page.getByLabel('Действия с работой').click();
 assert.equal(await button('Другие макеты').count(),0);
 await page.keyboard.press('Escape');
 await button('‹ Назад').click();
 assert.equal(await button('Мои работы').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.draftId),'export-draft');
 passed.push('verified own work downloads its exact displayed revision and legacy rights expose no alternate export routes');

 await writeFile('.test-output/m4b/png/works.json',JSON.stringify(downloads,null,2));
 assert.deepEqual(errors,[]);
 await writeFile('.test-output/m4b/browser.json',JSON.stringify({
  passed,pageErrors:errors,
  actual:'Chromium PNG render/download and preview byte equality at 1170×2532 and 3120×1440',
  fixtures:'Emulated display sizes, mocked system picker/share responses and imported author checkpoint',
  nativeRuntime:'NOT RUN',
 },null,2));
 console.log(`PASS: ${passed.length} wallpaper browser scenarios; ${downloads.length} PNG files for independent pixel checks.`);
 await context.close();
}finally{await browser?.close();server.kill();}
