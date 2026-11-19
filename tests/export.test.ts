import { expect,test } from 'vitest';
import { crc32,deflateSync,inflateSync } from 'node:zlib';
import { applyAction,fingerprintPayload,newWorkspace,type Workspace } from '../src/domain/workspace';
import { levels } from '../src/domain/levels';
import { hashText } from '../src/local-store/command';
import { applyCreative,initialCreative } from '../src/domain/creative';
import { editorFingerprintPayload,makeField } from '../src/domain/editor';
import { canExport,eligibleExportWorks,exportPlan,EXPORT_LAYOUTS,fitField,measuredLines,type ExportFormat } from '../src/domain/export';
import { srgbPng } from '../src/game/exportRenderer';
import witnesses from '../docs/spec/candidates/validation-0.1.json';
const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))]as const)));
function completed(count:number):Workspace {
  let state=newWorkspace('first');for(const l of levels.slice(0,count)){state=applyAction(state,{kind:'open',levelId:l.id,attemptId:`a-${l.ordinal}`},fp);for(const[from,to]of witnesses.rows.find(r=>r.id===l.id)!.legalOptimalWitness)state=applyAction(state,{kind:'swap',attemptId:state.attempts[l.id]!.attemptId,from:from!,to:to!},fp);}return state;
}
test('export catalog excludes unfinished official work and unverified drafts; clean needs a real victory',async()=>{
  const state=newWorkspace('first');expect(eligibleExportWorks(state)).toEqual([]);expect(canExport(state,'clean')).toBe(false);
  const field=makeField();state.creative=applyCreative(initialCreative({}),{kind:'editor-create',draftId:'d',workId:'w',nodeId:'n',field,seed:0,name:'Своя'},await hashText(editorFingerprintPayload(field)));
  expect(eligibleExportWorks(state)).toEqual([]);expect(()=>exportPlan(state,{format:'clean',keys:['campaign:gradient-001'],caption:''})).toThrow();
  const won=completed(1);expect(eligibleExportWorks(won).map(w=>w.key)).toEqual(['campaign:gradient-001']);expect(canExport(won,'export-caption')).toBe(false);
});
test('format thresholds and chapter page use committed ownership, with no export mutation or rewards',()=>{
  const four=completed(4),five=completed(5),fourteen=completed(14),fifteen=completed(15),thirty=completed(30);
  expect(canExport(four,'export-caption')).toBe(false);expect(canExport(five,'export-caption')).toBe(true);
  expect(canExport(fourteen,'export-strip')).toBe(false);expect(canExport(fifteen,'export-strip')).toBe(true);expect(canExport(thirty,'export-grid')).toBe(true);
  expect(canExport(fourteen,'chapter-page',0)).toBe(false);expect(canExport(fifteen,'chapter-page',0)).toBe(true);expect(canExport(fifteen,'chapter-page',8)).toBe(false);
  const before=JSON.stringify(fifteen);const page=exportPlan(fifteen,{format:'chapter-page',keys:[],caption:'ignored',chapterIndex:0});
  expect(page.works.map(w=>w.key)).toEqual(levels.slice(0,15).map(l=>`campaign:${l.id}`));expect(page.caption).toBe('Глава 1');expect(JSON.stringify(fifteen)).toBe(before);
});
test('exact seven template geometries and clean aspect use integer square tiles',()=>{
  const expected:Record<string,[number,number,number[]]>= {
    'export-caption':[1800,2000,[96,96,1608]],'export-strip':[2400,960,[96,144,672,864,144,672,1632,144,672]],
    'export-grid':[2000,2000,[96,96,856,1048,96,856,96,1048,856,1048,1048,856]],'export-frame':[2000,2000,[200,200,1600]],
    'export-diptych':[2400,1400,[96,172,1056,1248,172,1056]],'export-postcard':[1800,2200,[96,96,1608]],
    'chapter-page':[1800,3000,[208,752,1296,1840,2384].flatMap(y=>[108,652,1196].flatMap(x=>[x,y,496]))],
  };
  for(const[id,[width,height,regions]]of Object.entries(expected)){const l=EXPORT_LAYOUTS[id as Exclude<ExportFormat,'clean'>];expect([l.width,l.height]).toEqual([width,height]);expect(l.fields.flatMap(r=>[r.x,r.y,r.width])).toEqual(regions);expect(l.fields.every(r=>r.width===r.height)).toBe(true);}
  const state=completed(15);for(const l of levels.slice(0,15)){const p=exportPlan(state,{format:'clean',keys:[`campaign:${l.id}`],caption:'not rendered'}),s=Math.floor(1800/Math.max(l.width,l.height));expect([p.layout.width,p.layout.height]).toEqual([l.width*s,l.height*s]);}
  expect(fitField({width:6,height:1,solvedTileColors:Array(6).fill('#123456')},{x:96,y:96,width:1608,height:1608})).toEqual({x:96,y:766,width:1608,height:268,tileSize:268});
});
test('selection must be complete and different logical works, not two revisions of one work',async()=>{
  const state=completed(15),keys=eligibleExportWorks(state).slice(0,2).map(w=>w.key);
  expect(()=>exportPlan(state,{format:'export-strip',keys,caption:''})).toThrow('Выберите ещё 1');
  expect(()=>exportPlan(state,{format:'export-strip',keys:[keys[0]!,keys[0]!,keys[1]!],caption:''})).toThrow('разные работы');
  const field=makeField(),fingerprint=await hashText(editorFingerprintPayload(field));let c=applyCreative(initialCreative({}),{kind:'editor-create',draftId:'d',workId:'w',nodeId:'n',field,seed:0,name:'Своя'},fingerprint);
  c.works.w!.nodes.second={...c.works.w!.nodes.n!,nodeId:'second',parentNodeIds:['n']};c.works.w!.completions=[{nodeId:'n',fingerprint,rulesVersion:'gradient-rules-1',attemptId:'won',moves:11,assisted:true}];
  const own={...newWorkspace('a'),creative:c};expect(canExport(own,'clean')).toBe(true);expect(own.rights).toEqual(['chapter-open:chapter-01']);
  expect(eligibleExportWorks(own)).toHaveLength(2);const all={...state,creative:c};
  expect(()=>exportPlan(all,{format:'export-strip',keys:['own:w:n','own:w:second',keys[0]!],caption:''})).toThrow('разные работы');
});
test('text limits count Unicode code points, preserve text on error, and wrap by measured width',()=>{
  const state=completed(5),key='campaign:gradient-001';
  expect(exportPlan(state,{format:'export-caption',keys:[key],caption:'🌈'.repeat(80)}).caption).toHaveLength(160);
  expect(()=>exportPlan(state,{format:'export-caption',keys:[key],caption:'🌈'.repeat(81)})).toThrow('Сократите');
  expect(measuredLines('один два\nтри',8,3,s=>[...s].length)).toEqual(['один два','три']);
  expect(measuredLines('АБВГДЕ',3,2,s=>s.length)).toEqual(['АБВ','ГДЕ']);
  expect(()=>measuredLines('Ш'.repeat(80),1608,2,s=>s.length*52)).toThrow('Сократите');
  expect(()=>measuredLines('а\nб\nв',100,2,s=>s.length)).toThrow('Сократите');
});
test('bad RGB cannot become an export; fit does not stretch or clip any legal editor dimension',()=>{
  for(let width=1;width<=6;width++)for(let height=1;height<=5;height++){
    const fit=fitField({width,height,solvedTileColors:Array(width*height).fill('#010203')},{x:96,y:144,width:672,height:672});
    expect(fit.width/width).toBe(fit.height/height);expect(fit.x>=96&&fit.y>=144&&fit.x+fit.width<=768&&fit.y+fit.height<=816).toBe(true);
  }
  expect(()=>fitField({width:2,height:1,solvedTileColors:['#001122','red']},{x:0,y:0,width:100,height:100})).toThrow();
});
test('sRGB annotation preserves compressed pixels and emits independently verified PNG CRC/gamma',async()=>{
  const ch=(type:string,data:Buffer)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
  const compressed=deflateSync(Buffer.from([0,1,2,3,255]));
  const input=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ihdr),ch('iCCP',Buffer.from('not retained')),ch('IDAT',compressed),ch('IEND',Buffer.alloc(0))]);
  const output=Buffer.from(await(await srgbPng(new Blob([input]))).arrayBuffer()),types:string[]=[];
  for(let offset=8;offset<output.length;){const n=output.readUInt32BE(offset),type=output.toString('ascii',offset+4,offset+8),data=output.subarray(offset+8,offset+8+n);types.push(type);expect(crc32(output.subarray(offset+4,offset+8+n))).toBe(output.readUInt32BE(offset+8+n));if(type==='IDAT'){expect(data).toEqual(compressed);expect(inflateSync(data)).toEqual(Buffer.from([0,1,2,3,255]));}if(type==='sRGB')expect([...data]).toEqual([1]);if(type==='gAMA')expect(data.readUInt32BE()).toBe(45455);offset+=n+12;}
  expect(types).toEqual(['IHDR','sRGB','gAMA','IDAT','IEND']);await expect(srgbPng(new Blob(['bad']))).rejects.toThrow();
});
