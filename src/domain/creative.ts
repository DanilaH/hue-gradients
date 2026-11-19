import { createAttempt, proposeHelp, proposeSwap, RULES_VERSION, validateAttempt, type Attempt } from './puzzle';
import { editorFingerprintPayload, fieldFromLevel, inspectField, playableField, validName, type EditorField } from './editor';
import type { AlbumCopy } from './workspace';

export interface CreativeNode { nodeId: string; parentNodeIds: readonly string[]; field: EditorField; fingerprint: string; rulesVersion: typeof RULES_VERSION; seed: number }
export interface EditorBuffer { editId: string; baseNodeId: string; field: EditorField; seed: number }
export interface AuthorCompletion { nodeId: string; fingerprint: string; rulesVersion: typeof RULES_VERSION; attemptId: string; moves: number; assisted: boolean }
export interface CreativeWork {
  draftId: string; workId: string; name: string; headNodeId: string;
  provenance: AlbumCopy['provenance'] | { kind: 'original' };
  nodes: Record<string, CreativeNode>; buffers: Record<string, EditorBuffer>; completions: AuthorCompletion[];
}
export interface CreativeState { schemaVersion: 1; works: Record<string, CreativeWork>; playing: boolean; activeTest: { workId: string; nodeId: string; attempt: Attempt } | null }
export type CreativeAction =
  { kind:'editor-create'; draftId:string; workId:string; nodeId:string; name:string; field:EditorField; seed:number } |
  { kind:'editor-rename'; workId:string; name:string } |
  { kind:'editor-buffer'; workId:string; buffer:EditorBuffer } |
  { kind:'editor-discard'; workId:string; editId:string; recoveredEditId?:string } |
  { kind:'editor-apply'; workId:string; nodeId:string; baseNodeId:string; editId:string; recoveredEditId?:string; field:EditorField; seed:number } |
  { kind:'editor-select'; workId:string; nodeId:string } |
  { kind:'author-start'; workId:string; nodeId:string; attemptId:string; restart?:boolean } |
  { kind:'author-swap'; attemptId:string; from:number; to:number } |
  { kind:'author-help'; attemptId:string } | { kind:'author-exit' };
const safeId = (id:unknown): id is string => typeof id==='string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
const object = (v:unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const seedOK = (v:unknown): v is number => Number.isSafeInteger(v) && (v as number)>=0 && (v as number)<=0xffffffff;
const hashOK = (v:unknown): v is string => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
function assertField(field: EditorField): void {
  // Logical errors are valid draft states. Malformed data is never a valid draft.
  const malformed = ['FIELD_OBJECT','DIMENSIONS','PIN_INDEX','DUPLICATE_PIN','COLORS','PERMUTATION','CORNERS','COLOR_RECONSTRUCTION','PIN_MOVED'];
  if(inspectField(field).errors.some(e=>malformed.includes(e))) throw new Error('Damaged editor field');
}
export function initialCreative(copies: Record<string,AlbumCopy>): CreativeState {
  const works: Record<string,CreativeWork> = {};
  for(const copy of Object.values(copies)) works[copy.workId] = { draftId:copy.draftId,workId:copy.workId,name:copy.name,headNodeId:copy.nodeId,provenance:copy.provenance,
    nodes:{[copy.nodeId]:{nodeId:copy.nodeId,parentNodeIds:[],field:fieldFromLevel(copy.snapshot),fingerprint:copy.fingerprint,rulesVersion:RULES_VERSION,seed:0}},buffers:{},completions:[] };
  return { schemaVersion:1,works,playing:false,activeTest:null };
}
export function findDraft(state: CreativeState, draftId:string): CreativeWork | undefined { return Object.values(state.works).find(w=>w.draftId===draftId); }
export function hasAuthorProof(work: CreativeWork, nodeId:string): boolean {
  const node=work.nodes[nodeId];
  return !!node && work.completions.some(c=>c.fingerprint===node.fingerprint && c.rulesVersion===node.rulesVersion);
}
export function authorBests(work:CreativeWork,nodeId:string):{clean:number|null;assisted:number|null} {
  const node=work.nodes[nodeId]!,rows=work.completions.filter(c=>c.fingerprint===node.fingerprint&&c.rulesVersion===node.rulesVersion);
  const best=(assisted:boolean)=>{const moves=rows.filter(c=>c.assisted===assisted).map(c=>c.moves);return moves.length?Math.min(...moves):null;};
  return {clean:best(false),assisted:best(true)};
}
export function authorView(state:CreativeState): { work:CreativeWork; node:CreativeNode; level:ReturnType<typeof playableField>; attempt:Attempt } | null {
  const test=state.activeTest;if(!test)return null;
  const work=state.works[test.workId]!,node=work.nodes[test.nodeId]!;
  return { work,node,level:playableField(node.field,`${work.workId}:${node.nodeId}`,work.name),attempt:test.attempt };
}
export function validateCreative(state:CreativeState): void {
  if(!state || state.schemaVersion!==1 || !object(state.works) || typeof state.playing!=='boolean' || (state.playing && !state.activeTest) || !(state.activeTest===null || object(state.activeTest))) throw new Error('Unsupported creative workspace');
  const ids=new Set<string>();
  const claim=(id:unknown)=>{if(!safeId(id)||ids.has(id))throw new Error('Invalid creative identity');ids.add(id);};
  for(const [id,work]of Object.entries(state.works)) {
    if(!work || work.workId!==id || typeof work.name!=='string' || validName(work.name)!==work.name || !object(work.nodes) || !object(work.buffers) || !Array.isArray(work.completions) || !work.nodes[work.headNodeId]) throw new Error('Invalid saved work');
    claim(work.workId);claim(work.draftId);
    if(work.provenance?.kind!=='original' && !(work.provenance?.kind==='campaign' && safeId(work.provenance.levelId) && hashOK(work.provenance.fingerprint))) throw new Error('Invalid work provenance');
    for(const [key,node]of Object.entries(work.nodes)) {
      if(!node || key!==node.nodeId || !hashOK(node.fingerprint) || node.rulesVersion!==RULES_VERSION || !seedOK(node.seed) || !Array.isArray(node.parentNodeIds) || node.parentNodeIds.length>1 || node.parentNodeIds.some(p=>!work.nodes[p] || p===key)) throw new Error('Invalid saved revision');
      claim(node.nodeId);assertField(node.field);
    }
    const visited=new Set<string>(),pending=new Set<string>();
    const visit=(id:string):void=>{if(pending.has(id))throw new Error('Cyclic editor history');if(visited.has(id))return;pending.add(id);work.nodes[id]!.parentNodeIds.forEach(visit);pending.delete(id);visited.add(id);};
    Object.keys(work.nodes).forEach(visit);
    for(const [key,buffer]of Object.entries(work.buffers)) {
      if(!buffer || buffer.editId!==key || !work.nodes[buffer.baseNodeId] || !seedOK(buffer.seed)) throw new Error('Invalid saved edit buffer');
      claim(buffer.editId);assertField(buffer.field);
    }
    const attempts=new Set<string>();
    for(const completion of work.completions) {
      const node=work.nodes[completion?.nodeId];
      if(!node || completion.fingerprint!==node.fingerprint || completion.rulesVersion!==RULES_VERSION || !safeId(completion.attemptId) || attempts.has(completion.attemptId) || typeof completion.assisted!=='boolean' || !Number.isSafeInteger(completion.moves) || completion.moves<playableField(node.field,id,work.name).minimumSwaps) throw new Error('Invalid author proof');
      attempts.add(completion.attemptId);
    }
  }
  if(state.activeTest) {
    if(!state.works[state.activeTest.workId]?.nodes[state.activeTest.nodeId]) throw new Error('Missing author snapshot');
    const view=authorView(state)!;validateAttempt(view.level,view.attempt);
    if(view.attempt.completed && !view.work.completions.some(c=>c.attemptId===view.attempt.attemptId && c.nodeId===view.node.nodeId)) throw new Error('Missing author proof');
  }
}
/** Session supplies SHA-256 from WebCrypto, then checks every saved node before exposing it. */
export async function validateCreativeHashes(state:CreativeState, digest:(s:string)=>Promise<string>):Promise<void> {
  for(const work of Object.values(state.works))for(const node of Object.values(work.nodes))if(await digest(editorFingerprintPayload(node.field))!==node.fingerprint)throw new Error('Creative fingerprint mismatch');
}
export function applyCreative(state:CreativeState,action:CreativeAction,fingerprint?:string):CreativeState {
  if(action.kind==='author-exit') return state.playing ? {...state,playing:false} : state;
  if(action.kind==='author-swap' || action.kind==='author-help') {
    if(!state.playing)return state;
    const view=authorView(state);if(!view || view.attempt.attemptId!==action.attemptId)return state;
    const next=action.kind==='author-swap'?proposeSwap(view.level,view.attempt,action.from,action.to):proposeHelp(view.attempt);
    if(next===view.attempt)return state;
    const completion:AuthorCompletion={nodeId:view.node.nodeId,fingerprint:view.node.fingerprint,rulesVersion:RULES_VERSION,attemptId:next.attemptId,moves:next.moves,assisted:next.assisted};
    return {...state,activeTest:{...state.activeTest!,attempt:next},works:next.completed?{...state.works,[view.work.workId]:{...view.work,completions:[...view.work.completions,completion]}}:state.works};
  }
  if(action.kind==='editor-create') {
    if(![action.draftId,action.workId,action.nodeId].every(safeId) || !hashOK(fingerprint) || !seedOK(action.seed))throw new Error('Invalid new work');
    assertField(action.field);
    const work:CreativeWork={draftId:action.draftId,workId:action.workId,name:validName(action.name),headNodeId:action.nodeId,provenance:{kind:'original'},nodes:{[action.nodeId]:{nodeId:action.nodeId,parentNodeIds:[],field:action.field,fingerprint,rulesVersion:RULES_VERSION,seed:action.seed}},buffers:{},completions:[]};
    if(state.works[work.workId])throw new Error('Work identity collision');
    const next={...state,works:{...state.works,[work.workId]:work}};validateCreative(next);return next;
  }
  const work=state.works[action.workId];if(!work)throw new Error('Missing work');
  let next:CreativeWork=work;
  if(action.kind==='editor-rename') { const name=validName(action.name);if(name===work.name)return state;next={...work,name}; }
  else if(action.kind==='editor-buffer') {
    const b=action.buffer;assertField(b.field);
    if(!safeId(b.editId)||!work.nodes[b.baseNodeId]||!seedOK(b.seed))throw new Error('Invalid edit buffer');
    next={...work,buffers:{...work.buffers,[b.editId]:b}};
  } else if(action.kind==='editor-discard') {
    if(!work.buffers[action.editId]&&(!action.recoveredEditId||!work.buffers[action.recoveredEditId]))return state;
    const buffers={...work.buffers};delete buffers[action.editId];if(action.recoveredEditId)delete buffers[action.recoveredEditId];next={...work,buffers};
  } else if(action.kind==='editor-apply') {
    assertField(action.field);
    if(!safeId(action.nodeId)||!work.nodes[action.baseNodeId]||work.nodes[action.nodeId]||!hashOK(fingerprint)||!seedOK(action.seed))throw new Error('Invalid editor revision');
    const buffers={...work.buffers};delete buffers[action.editId];if(action.recoveredEditId)delete buffers[action.recoveredEditId];
    // A stale edit becomes a recoverable branch; it never replaces a newer head.
    const changed=fingerprint!==work.nodes[action.baseNodeId]!.fingerprint;
    const node:CreativeNode={nodeId:action.nodeId,parentNodeIds:[action.baseNodeId],field:action.field,fingerprint,rulesVersion:RULES_VERSION,seed:action.seed};
    next={...work,buffers,nodes:changed?{...work.nodes,[node.nodeId]:node}:work.nodes,headNodeId:changed && work.headNodeId===action.baseNodeId?node.nodeId:work.headNodeId};
  } else if(action.kind==='editor-select') {
    if(!work.nodes[action.nodeId])throw new Error('Missing history revision');
    if(work.headNodeId===action.nodeId)return state;
    next={...work,headNodeId:action.nodeId};
  } else if(action.kind==='author-start') {
    const node=work.nodes[action.nodeId];if(!node)throw new Error('Missing author revision');
    if(!action.restart && state.activeTest?.workId===work.workId && state.activeTest.nodeId===node.nodeId)return state.playing ? state : {...state,playing:true};
    if(!safeId(action.attemptId)||Object.values(state.works).some(w=>w.completions.some(c=>c.attemptId===action.attemptId)))throw new Error('Invalid author attempt identity');
    return {...state,playing:true,activeTest:{workId:work.workId,nodeId:node.nodeId,attempt:createAttempt(playableField(node.field,`${work.workId}:${node.nodeId}`,work.name),action.attemptId)}};
  }
  const result={...state,works:{...state.works,[work.workId]:next}};validateCreative(result);return result;
}
