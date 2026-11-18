// Records actual UI input; no board injection, generated frames or synthetic game results.
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
let p; try {p=await import('playwright');} catch {p=createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/package.json`)('playwright');}
await mkdir('.test-output/m2/video',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4176','--strictPort'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4176')).ok)break;}catch{} if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await p.chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:'.test-output/m2/video',size:{width:390,height:844}}});
 const start=Date.now(),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const levels=JSON.parse(await readFile('docs/spec/prototype/levels-0.1.json','utf8')).levels;
 const witnesses=JSON.parse(await readFile('docs/spec/prototype/validation-0.1.json','utf8')).rows;
 await page.goto('http://127.0.0.1:4176');await page.waitForSelector('html[data-state=ready]');
 const idle=()=>page.waitForFunction(()=>document.querySelector('#hue-app').dataset.busy==='false');
 const point=async(level,index)=>{const r=await page.locator('#board-region canvas').boundingBox();return{x:r.x+(index%level.width+.5)*r.width/level.width,y:r.y+4+(Math.floor(index/level.width)+.5)*(r.height-8)/level.height};};
 const tap=async(level,index)=>{const a=await point(level,index);await page.mouse.click(a.x,a.y);};
 for(const level of levels.slice(0,4)){
  for(const [from,to]of witnesses.find(r=>r.id===level.id).legal_optimal_witness){await tap(level,from);await tap(level,to);await idle();}
  await page.getByRole('button',{name:'Дальше',exact:true}).click();await idle();
 }
 const trimStart=(Date.now()-start)/1000,level=levels[4],pairs=witnesses.find(r=>r.id===level.id).legal_optimal_witness;
 await page.waitForTimeout(900);await page.screenshot({path:'.test-output/m2/review-gameplay.png'});
 const [from,to]=pairs[0],a=await point(level,from),b=await point(level,to);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(250);
 for(let step=1;step<=12;step++){await page.mouse.move(a.x+(b.x-a.x)*step/12,a.y+(b.y-a.y)*step/12);await page.waitForTimeout(45);}
 await page.mouse.up();await idle();await page.waitForTimeout(650);
 for(const [source,target]of pairs.slice(1)){await tap(level,source);await page.waitForTimeout(350);await tap(level,target);await idle();await page.waitForTimeout(500);}
 await page.waitForSelector('#hue-app[data-layer=result]');await page.waitForTimeout(1200);await page.screenshot({path:'.test-output/m2/review-win.png'});
 await page.waitForTimeout(1300);await page.getByRole('button',{name:'Посмотреть поле'}).click();await page.waitForTimeout(900);
 await page.getByRole('button',{name:'Результат',exact:true}).click();await page.waitForTimeout(1600);
 const duration=(Date.now()-start)/1000-trimStart,video=page.video();await context.close();const input=await video.path();
 execFileSync('ffmpeg',['-y','-ss',String(trimStart),'-i',input,'-t',String(duration),'-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart','.test-output/m2/Poluson-M2-gameplay-win.mp4'],{stdio:'ignore'});
 await writeFile('.test-output/m2/video.json',JSON.stringify({source:'Actual Chromium UI at 390x844; desktop emulation, not phone',level:level.id,preparation:'First four solved through UI before clip',durationSeconds:duration,pageErrors:errors},null,2));
 if(errors.length)throw Error(errors.join('; '));console.log('Recorded actual gameplay → committed win → exact field → result.');
}finally{await browser?.close();server.kill();}
