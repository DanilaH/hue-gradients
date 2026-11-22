import { expect, test } from 'vitest';
import fixtures from './fixtures/editor-boundaries.json';
import { anotherStart, cycleStart, defaultPins, editorFingerprintPayload, fieldColors, inspectField, makeField, playableField, type EditorField } from '../src/domain/editor';
import { applyCreative, authorView, hasAuthorProof, initialCreative, validateCreative, validateCreativeHashes, type CreativeAction, type CreativeState } from '../src/domain/creative';
import { applyAction, decodeWorkspace, fingerprintPayload, newWorkspace, upgradeWorkspace } from '../src/domain/workspace';
import { levels } from '../src/domain/levels';
import { hashText } from '../src/local-store/command';

for(const row of fixtures.cases) test(`Python oracle parity: ${row.case}`,async()=>{
  if('input'in row) {
    const result=inspectField(row.input);
    expect(result.errors).toEqual(row.expected!.errors);expect(result.warnings).toEqual(row.expected!.warnings);
    if('minimumSwaps'in row.expected!) {
      const expected=row.expected as Record<string,unknown>;
      for(const key of ['minimumSwaps','minimumNominalOklab','closestMovablePair','orientationAmbiguities'])expect((result as unknown as Record<string,unknown>)[key]).toEqual(expected[key]);
      expect(await hashText(editorFingerprintPayload(row.input as EditorField))).toEqual(expected.fingerprint);
    }
  } else {
    const left=await hashText(editorFingerprintPayload(row.left!.input)),right=await hashText(editorFingerprintPayload(row.right!.input));
    expect(left).toBe(row.left!.sha256);expect(right).toBe(row.right!.sha256);expect(left===right).toBe(row.fingerprintEqual);
  }
});
async function act(state:CreativeState,action:CreativeAction):Promise<CreativeState> {return applyCreative(state,action,'field'in action?await hashText(editorFingerprintPayload(action.field)):undefined);}
async function draft(field=makeField()):Promise<CreativeState> {return act(initialCreative({}),{kind:'editor-create',draftId:'draft',workId:'work',nodeId:'root',field,name:'Моя композиция',seed:0});}
function solve(state:CreativeState):CreativeState {
  const view=authorView(state)!;let board=[...view.attempt.board];
  for(let i=0;i<board.length;i++)if(board[i]!==i) {
    const j=board.indexOf(i);state=applyCreative(state,{kind:'author-swap',attemptId:view.attempt.attemptId,from:i,to:j});
    [board[i],board[j]]=[board[j]!,board[i]!];
  }
  return state;
}
test('default draft has a legal fixed start; integer half-up interpolation and axis normalization',()=>{
  expect(inspectField(makeField()).errors).toEqual([]);
  expect(fieldColors(3,1,['#000000','#010101','#FFFFFF','#FFFFFF'])).toEqual(['#000000','#010101','#010101']);
  expect(makeField(1,5,['#000000','#FF0000','#FFFFFF','#00FF00']).cornerColorsTLTRBLBR).toEqual(['#000000','#000000','#FFFFFF','#FFFFFF']);
  for(const [w,h]of [[6,1],[1,5],[6,5]]) {
    const pins=defaultPins(w!,h!),p=cycleStart(w!*h!,pins,10);
    expect(pins.every(i=>p[i]===i)).toBe(true);expect(p.every((v,i)=>pins.includes(i)||v!==i)).toBe(true);
    expect(cycleStart(w!*h!,pins,10)).toEqual(p);
  }
});
test('invalid fields stay editable but cannot become author attempts',async()=>{
  const field=makeField(1,3),state=await draft(field);
  expect(state.works.work!.nodes.root!.field).toEqual(field);
  expect(()=>playableField(field,'own','Моя')).toThrow();
  expect(()=>applyCreative(state,{kind:'author-start',workId:'work',nodeId:'root',attemptId:'attempt'})).toThrow();
});
test('Other start must change the permutation; two movable tiles have exactly one legal start',()=>{
  for(let seed=0;seed<100;seed++) {const field=makeField(6,1,undefined,undefined,seed),next=anotherStart(field,seed)!;expect(next.start).not.toEqual(field.startTileAtPosition);expect(cycleStart(6,field.pinnedPositions,next.seed)).toEqual(next.start);}
  expect(anotherStart(makeField(4,1),0)).toBeNull();
});
test('author proof belongs to gameplay fingerprint, survives rename, and does not migrate to a different start',async()=>{
  let state=applyCreative(await draft(),{kind:'author-start',workId:'work',nodeId:'root',attemptId:'author-one'});
  state=solve(state);expect(hasAuthorProof(state.works.work!,'root')).toBe(true);
  state=applyCreative(state,{kind:'editor-rename',workId:'work',name:'  <b>Новая 🌈</b>  '});
  expect(state.works.work!.name).toBe('<b>Новая 🌈</b>');expect(hasAuthorProof(state.works.work!,'root')).toBe(true);
  const changed=makeField(4,4,undefined,undefined,22);
  state=await act(state,{kind:'editor-apply',workId:'work',nodeId:'other',baseNodeId:'root',editId:'edit',field:changed,seed:22});
  expect(hasAuthorProof(state.works.work!,'other')).toBe(false);expect(state.activeTest!.nodeId).toBe('root');
  expect(authorView(state)!.attempt.completed).toBe(true);validateCreative(state);await validateCreativeHashes(state,hashText);
});
test('stale edits form a recoverable branch, preserve head and retain both parent chains',async()=>{
  let state=await draft(),one=makeField(5,4),two=makeField(6,5);
  state=await act(state,{kind:'editor-apply',workId:'work',nodeId:'newer',baseNodeId:'root',editId:'edit-a',field:one,seed:0});
  state=await act(state,{kind:'editor-apply',workId:'work',nodeId:'branch',baseNodeId:'root',editId:'edit-b',field:two,seed:0});
  expect(state.works.work!.headNodeId).toBe('newer');expect(Object.keys(state.works.work!.nodes)).toHaveLength(3);
  expect(state.works.work!.nodes.branch!.parentNodeIds).toEqual(['root']);
  state=applyCreative(state,{kind:'editor-select',workId:'work',nodeId:'branch'});expect(state.works.work!.headNodeId).toBe('branch');validateCreative(state);
});
test('buffer apply/cancel and metadata-only apply retain immutable history',async()=>{
  let state=await draft();const root=state.works.work!.nodes.root!;
  state=applyCreative(state,{kind:'editor-buffer',workId:'work',buffer:{editId:'edit',baseNodeId:'root',field:makeField(6,5),seed:0}});
  const decoded=JSON.parse(JSON.stringify(state));validateCreative(decoded);expect(decoded.works.work.buffers.edit.field.width).toBe(6);
  state=applyCreative(state,{kind:'editor-discard',workId:'work',editId:'edit'});expect(state.works.work!.nodes.root).toBe(root);
  state=await act(state,{kind:'editor-apply',workId:'work',nodeId:'unused',baseNodeId:'root',editId:'edit',field:root.field,seed:888});
  expect(Object.keys(state.works.work!.nodes)).toEqual(['root']);
});
test('resumed previews use independent edit identities; applying one does not discard another tab buffer',async()=>{
  let state=await draft();
  for(const [id,width]of [['recovered',4],['tab-a',5],['tab-b',6]]as const)state=applyCreative(state,{kind:'editor-buffer',workId:'work',buffer:{editId:id,baseNodeId:'root',field:makeField(width,4),seed:0}});
  state=await act(state,{kind:'editor-apply',workId:'work',nodeId:'applied',baseNodeId:'root',editId:'tab-a',recoveredEditId:'recovered',field:makeField(5,4),seed:0});
  expect(Object.keys(state.works.work!.buffers)).toEqual(['tab-b']);expect(state.works.work!.buffers['tab-b']!.field.width).toBe(6);
});
test('stale author input after leaving never mutates a suspended attempt',async()=>{
  let state=applyCreative(await draft(),{kind:'author-start',workId:'work',nodeId:'root',attemptId:'author'});
  state=applyCreative(state,{kind:'author-exit'});
  expect(applyCreative(state,{kind:'author-help',attemptId:'author'})).toBe(state);
  expect(applyCreative(state,{kind:'author-swap',attemptId:'author',from:1,to:2})).toBe(state);
});
test('damaged hashes, cyclic histories, duplicate IDs and forged completed-attempt receipts are rejected',async()=>{
  const state=await draft(),bad=structuredClone(state);bad.works.work!.nodes.root!.fingerprint='0'.repeat(64);
  await expect(validateCreativeHashes(bad,hashText)).rejects.toThrow('fingerprint');
  const cycle=structuredClone(state);cycle.works.work!.nodes.root!.parentNodeIds=['root'];expect(()=>validateCreative(cycle)).toThrow();
  const duplicate=structuredClone(state);duplicate.works.work!.draftId='root';expect(()=>validateCreative(duplicate)).toThrow();
  const active=solve(applyCreative(state,{kind:'author-start',workId:'work',nodeId:'root',attemptId:'test'}));active.works.work!.completions=[];expect(()=>validateCreative(active)).toThrow('Missing author proof');
});
test('M3 copy migration preserves original seed, campaign progress and a distinct unverified author work',async()=>{
  const fingerprints=new Map(await Promise.all(levels.map(async l=>[l.id,await hashText(fingerprintPayload(l))]as const)));
  let state=newWorkspace('campaign');const level=levels[0]!,from=level.startTileAtPosition.findIndex((v,i)=>v!==i),to=level.startTileAtPosition[from]!;
  state=applyAction(state,{kind:'swap',attemptId:'campaign',from,to},fingerprints);
  state=applyAction(state,{kind:'copy',levelId:level.id,draftId:'copy-draft',workId:'copy-work',nodeId:'copy-root',name:'Копия'},fingerprints);
  delete state.creative;const decoded=decodeWorkspace(JSON.stringify(state),fingerprints),upgraded=upgradeWorkspace(decoded,fingerprints);
  expect(upgraded.completed).toEqual(state.completed);expect(upgraded.bests).toEqual(state.bests);expect(upgraded.rights).toEqual(state.rights);
  expect(upgraded.creative!.works['copy-work']!.completions).toEqual([]);
  const creative=solve(applyCreative(upgraded.creative!,{kind:'author-start',workId:'copy-work',nodeId:'copy-root',attemptId:'copy-author'}));
  const withAuthor={...upgraded,creative};expect(withAuthor.completed).toEqual(state.completed);expect(withAuthor.bests).toEqual(state.bests);expect(withAuthor.rights).toEqual(state.rights);
  expect(decodeWorkspace(JSON.stringify(withAuthor),fingerprints)).toEqual(withAuthor);
});
