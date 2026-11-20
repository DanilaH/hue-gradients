import { expect,test } from 'vitest';
import { crc32,deflateSync,inflateSync } from 'node:zlib';
import { applyAction,fingerprintPayload,newWorkspace,type Workspace } from '../src/domain/workspace';
import { levels } from '../src/domain/levels';
import { hashText } from '../src/local-store/command';
import { applyCreative,initialCreative } from '../src/domain/creative';
import { editorFingerprintPayload,makeField } from '../src/domain/editor';
import { wallpaperField } from '../src/domain/export';
import { renderWallpaper, srgbPng } from '../src/game/exportRenderer';
import witnesses from '../docs/spec/candidates/validation-0.1.json';
const fp=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))]as const)));
function completed(count:number):Workspace {
  let state=newWorkspace('first');for(const l of levels.slice(0,count)){state=applyAction(state,{kind:'open',levelId:l.id,attemptId:`a-${l.ordinal}`},fp);for(const[from,to]of witnesses.rows.find(r=>r.id===l.id)!.legalOptimalWitness)state=applyAction(state,{kind:'swap',attemptId:state.attempts[l.id]!.attemptId,from:from!,to:to!},fp);}return state;
}
test('a finished campaign work supplies its exact palette and legacy rights do not expose unfinished work', () => {
  const state = completed(1);
  expect(wallpaperField(state, 'campaign:gradient-001')).toBe(levels[0]);
  state.rights.push('export-strip', 'clean-export:gradient-002');
  expect(() => wallpaperField(state, 'campaign:gradient-002')).toThrow('нужна собранная работа');
  expect(() => wallpaperField(state, 'chapter-page')).toThrow('нужна собранная работа');
});

test('a verified own revision supplies its palette independently of other revisions', async () => {
  const first = makeField(6, 1), second = makeField(5, 4);
  const fingerprint = await hashText(editorFingerprintPayload(first));
  const c = applyCreative(initialCreative({}), {
    kind: 'editor-create', draftId: 'd', workId: 'w', nodeId: 'n', field: first, seed: 0, name: 'Своя',
  }, fingerprint);
  const state = { ...newWorkspace('a'), creative: c };
  expect(() => wallpaperField(state, 'own:w:n')).toThrow('нужна собранная работа');
  c.works.w!.nodes.second = {
    ...c.works.w!.nodes.n!, nodeId: 'second', parentNodeIds: ['n'],
    field: second, fingerprint: await hashText(editorFingerprintPayload(second)),
  };
  c.works.w!.completions = [{ nodeId: 'n', fingerprint, rulesVersion: 'gradient-rules-1', attemptId: 'won', moves: 11, assisted: true }];
  expect(wallpaperField(state, 'own:w:n')).toBe(first);
  expect(() => wallpaperField(state, 'own:w:second')).toThrow('нужна собранная работа');
  c.works.w!.nodes.n!.field = { ...first, solvedTileColors: first.solvedTileColors.map((colour, i) => i === 0 ? 'red' : colour) };
  expect(() => wallpaperField(state, 'own:w:n')).toThrow('Не удалось прочитать цвета работы');
  expect(state.rights).toEqual(['chapter-open:chapter-01']);
});

test('invalid display dimensions are rejected before allocating a canvas', async () => {
  const field = makeField(6, 1);
  for (const size of [{ width: 0, height: 2400 }, { width: 4, height: 2400 }, { width: 5000, height: 4000 }, { width: 1080.5, height: 2400 }]) {
    await expect(renderWallpaper(field, size)).rejects.toThrow('Размер экрана недоступен');
  }
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
