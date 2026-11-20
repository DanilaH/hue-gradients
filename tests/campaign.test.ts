import { expect, test } from 'vitest';
import candidates from '../docs/spec/candidates/levels-0.1.json';
import witnesses from '../docs/spec/candidates/validation-0.1.json';
import prototype from '../docs/spec/prototype/levels-0.1.json';
import { chapters, getLevel, levels } from '../src/domain/levels';
import { createAttempt, proposeSwap, validateAttempt } from '../src/domain/puzzle';
import { applyAction, decodeWorkspace, fingerprintPayload, newWorkspace, upgradeWorkspace, type Workspace } from '../src/domain/workspace';
import { chapterCount, chapterIsOpen, earnedRights, levelIsOpen, recommendedLevel, visibleRewards } from '../src/domain/progression';
import { hashText } from '../src/local-store/command';
import { campaignProgress } from '../src/domain/playerProgress';

const fingerprints = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))] as const)));
function complete(state: Workspace, ordinal: number, assisted = false): Workspace {
  const level = levels[ordinal - 1]!;
  state = applyAction(state, { kind: 'open', levelId: level.id, attemptId: `attempt-${ordinal}` }, fingerprints);
  expect(state.activeLevelId).toBe(level.id);
  if (assisted) state = applyAction(state, { kind: 'help', attemptId: state.attempts[level.id]!.attemptId }, fingerprints);
  for (const [from,to] of witnesses.rows.find(r => r.id === level.id)!.legalOptimalWitness) {
    state = applyAction(state, { kind: 'swap', from: from!, to: to!, attemptId: state.attempts[level.id]!.attemptId }, fingerprints);
  }
  return state;
}
test('60 authored campaign levels retain exact first15 data; daily stays outside the campaign', () => {
  expect(levels).toHaveLength(60); expect(chapters).toHaveLength(4);
  expect(levels.slice(0,15)).toEqual(prototype.levels);
  for (let i=15;i<60;i++) expect(fingerprintPayload(levels[i]!)).toBe(fingerprintPayload(candidates.campaign[i]!));
  expect(() => getLevel('gradient-daily-001')).toThrow();
});
for (const level of levels) test(`${level.id}: supplied independent witness solves the actual reducer`, () => {
  let attempt = createAttempt(level, 'replay');
  for (const [from,to] of witnesses.rows.find(r => r.id === level.id)!.legalOptimalWitness) attempt = proposeSwap(level, attempt, from!, to!);
  validateAttempt(level, attempt); expect(attempt.completed).toBe(true); expect(attempt.moves).toBe(level.minimumSwaps);
});
test('first five stay sequential, then the remaining chapter is freely selectable', () => {
  let state = newWorkspace('first');
  expect(levelIsOpen(state, levels[1]!.id)).toBe(false);
  for (let n=1;n<=4;n++) state = complete(state,n);
  expect(levelIsOpen(state, levels[14]!.id)).toBe(false);
  state = complete(state,5,true);
  for (let n=6;n<=15;n++) expect(levelIsOpen(state,levels[n-1]!.id)).toBe(true);
  expect(levelIsOpen(state,levels[15]!.id)).toBe(false);
  const locked = applyAction(state,{kind:'restart',levelId:levels[15]!.id,attemptId:'bypass'},fingerprints);
  expect(locked).toBe(state);
  state = complete(state,15); expect(recommendedLevel(state,0)).toBe('gradient-006');
  expect(campaignProgress(state)).toMatchObject({ xp: 6, complete: false,
    sets: [expect.objectContaining({ open: true, finale: true, complete: false, count: 6 }),
      expect.objectContaining({ open: false }), expect.objectContaining({ open: false }), expect.objectContaining({ open: false })] });
});
test('9→10 and 14→15 are atomic milestones; replays do not farm progress; final chapter has no phantom successor', () => {
  let state = newWorkspace('first');
  for (let n=1;n<=60;n++) {
    state = complete(state,n,n%2===0);
    if(n===9) expect(chapterIsOpen(state,1)).toBe(false);
    if(n===10) {
      expect(chapterIsOpen(state,1)).toBe(true); expect(state.lastCompletion!.newRights).toContain('chapter-open:chapter-02');
      for(let ordinal=16;ordinal<=30;ordinal++) expect(levelIsOpen(state,levels[ordinal-1]!.id)).toBe(true);
    }
    if(n===14) expect(state.rights).not.toContain('chapter-complete:chapter-01');
    if(n===15) expect(state.rights).toContain('chapter-complete:chapter-01');
    if ([4, 5, 14, 15, 29, 30].includes(n)) expect(state.rights.filter(id => id.startsWith('export-'))).toEqual(['export-clean']);
  }
  expect(state.completed).toHaveLength(60); expect(recommendedLevel(state)).toBeNull();
  expect(campaignProgress(state)).toMatchObject({ xp: 60, complete: true });
  expect(state.rights).not.toContain('chapter-open:chapter-05');
  expect(state.rights.filter(r=>r.startsWith('campaign-card:'))).toHaveLength(60);
  const before = [...state.rights];
  state = applyAction(state,{kind:'restart',levelId:levels[59]!.id,attemptId:'repeat'},fingerprints);
  state = complete(state,60,true);
  expect(state.completed).toHaveLength(60); expect(state.rights).toEqual(before); expect(state.lastCompletion!.newRights).toEqual([]);
  expect(decodeWorkspace(JSON.stringify(state),fingerprints).rights).toEqual(before);
});
test('policy raises retain earned chapter/format rights and do not count daily/personal work as campaign', () => {
  let state = newWorkspace('first'); for(let n=1;n<=10;n++)state=complete(state,n);
  const layouts = ['export-caption','export-strip','export-grid','export-frame','export-diptych','export-postcard'];
  const old = decodeWorkspace(JSON.stringify({...state,rights:[...state.rights,...layouts]}),fingerprints);
  const next = earnedRights(old,fingerprints,{chapterAt:12});
  expect(next).toContain('chapter-open:chapter-02');
  expect(next).toEqual(old.rights);
  expect(visibleRewards(layouts)).toEqual([]);
  expect(complete(old,11).rights).toEqual(expect.arrayContaining(layouts));
  expect(earnedRights(state, fingerprints)).not.toEqual(expect.arrayContaining(layouts));
  const mixed = {...state,completed:[...state.completed,'own-work','gradient-daily-001',...state.completed]};
  expect(chapterCount(mixed,0)).toBe(10);
  expect(earnedRights(mixed,fingerprints)).not.toContain('export-strip');
});
test('legacy upgrade preserves active attempt, separate bests, rights and adds no reward ceremony', () => {
  let state=newWorkspace('old');for(let n=1;n<=10;n++)state=complete(state,n);
  const legacy=JSON.parse(JSON.stringify(state));legacy.policyVersion='m1-local-1';legacy.contentVersion='gradient-prototype-0.1';
  legacy.rights=legacy.rights.filter((r:string)=>r.startsWith('clean-export:'));delete legacy.albumCopies;delete legacy.lastCompletion;
  const decoded=decodeWorkspace(JSON.stringify(legacy),fingerprints),next=upgradeWorkspace(decoded,fingerprints);
  expect(next.attempts).toEqual(state.attempts);expect(next.bests).toEqual(state.bests);expect(next.completed).toEqual(state.completed);
  expect(next.rights).toContain('chapter-open:chapter-02');expect(next.lastCompletion).toBeNull();
});
test('album copy has new identities and provenance; no inherited author completion or campaign reward', () => {
  const state=complete(newWorkspace('first'),1),source=JSON.stringify(levels[0]);
  const next=applyAction(state,{kind:'copy',levelId:levels[0]!.id,draftId:'draft-one',workId:'work-one',nodeId:'node-one',name:'Моя копия'},fingerprints);
  expect(next.completed).toBe(state.completed);expect(next.bests).toBe(state.bests);expect(next.rights).toBe(state.rights);
  expect(next.albumCopies['draft-one']!.authorCompletions).toEqual([]);expect(next.albumCopies['draft-one']!.provenance.levelId).toBe(levels[0]!.id);
  expect(JSON.stringify(levels[0])).toBe(source);expect(decodeWorkspace(JSON.stringify(next),fingerprints).albumCopies).toEqual(next.albumCopies);
  expect(applyAction(state,{kind:'copy',levelId:levels[1]!.id,draftId:'d',workId:'w',nodeId:'n',name:'x'},fingerprints)).toBe(state);
});
