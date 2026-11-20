import { expect, test } from 'vitest';
import { getLevel } from '../src/domain/levels';
import { campaignProgress, MASTERY_THRESHOLDS, type PublishedBenchmark } from '../src/domain/playerProgress';
import { RULES_VERSION } from '../src/domain/puzzle';
import { applyAction, decodeWorkspace, newWorkspace, type Workspace } from '../src/domain/workspace';

const first = getLevel('gradient-001');
const fingerprint = 'a'.repeat(64);
const fingerprints = new Map([[first.id, fingerprint]]);
const benchmark = (version: string, mean: number): PublishedBenchmark => ({
  levelId: first.id, fingerprint, rulesVersion: RULES_VERSION, source: 'Measured sample fixture', sampleSize: 21, version, mean,
});
const finish = (workspace: Workspace, reference?: PublishedBenchmark) => applyAction(workspace, {
  kind: 'swap', attemptId: workspace.attempts[first.id]!.attemptId, from: 1, to: 2,
}, fingerprints, reference ? [reference] : []);
const restart = (workspace: Workspace, attemptId: string) =>
  applyAction(workspace, { kind: 'restart', levelId: first.id, attemptId }, fingerprints);

test('equal scores do not beat the average; new references do not regrade saved wins', () => {
  const firstWin = finish(newWorkspace('equal'), benchmark('v1', 1));
  expect(campaignProgress(firstWin)).toMatchObject({ xp: 1, compared: 1, better: 0, perfect: 1 });
  const repeat = finish(restart(firstWin, 'better'), benchmark('v2', 2));
  expect(campaignProgress(repeat)).toMatchObject({ xp: 1, compared: 2, better: 1 });
  expect(repeat.victories?.map(victory => victory.reference?.version)).toEqual(['v1', 'v2']);
  expect(finish(repeat, benchmark('v2', 2))).toBe(repeat);
  expect(restart(repeat, 'equal')).toBe(repeat);
  expect(decodeWorkspace(JSON.stringify(repeat), fingerprints)).toEqual(repeat);
  expect(MASTERY_THRESHOLDS).toEqual([2, 5, 10, 20, 50, 100, 150, 200, 250, 300]);
});

test('assisted, hidden and incompatible scores retain their history without qualifying', () => {
  let state = applyAction(newWorkspace('helped'), { kind: 'help', attemptId: 'helped' }, fingerprints);
  state = finish(state, benchmark('v1', 2));
  state = restart(state, 'hidden');
  state = applyAction(state, { kind: 'preferences', key: 'statistics', value: false }, fingerprints);
  state = finish(state, benchmark('v1', 2));
  state = restart(state, 'foreign');
  state = applyAction(state, { kind: 'preferences', key: 'statistics', value: true }, fingerprints);
  state = finish(state, { ...benchmark('v1', 2), fingerprint: 'b'.repeat(64) });
  expect(campaignProgress(state)).toMatchObject({ xp: 1, compared: 0, better: 0, perfect: 1 });
  expect(state.victories?.map(victory => victory.assisted)).toEqual([true, false, false]);
  expect(state.bests[first.id]).toMatchObject({ clean: 1, assisted: 1 });
});

test('legacy saved wins are carried forward; replays retain both attempts and the old best', () => {
  const { victories: _, ...legacy } = finish(newWorkspace('old'));
  const stored = JSON.stringify({ ...legacy, preferences: { sound: true, haptics: false, motion: true } });
  const loaded = decodeWorkspace(stored, fingerprints);
  expect(loaded.preferences).toMatchObject({ statistics: true, haptics: false });
  expect(loaded.victories?.map(victory => victory.attemptId)).toEqual(['old']);
  const replay = finish(restart(loaded, 'new'));
  expect(replay.victories?.map(victory => victory.attemptId)).toEqual(['old', 'new']);
  expect(replay.rights).toEqual(loaded.rights);
  expect(replay.bests).toEqual(loaded.bests);
  expect(campaignProgress(replay)).toMatchObject({ xp: 1, compared: 0 });
  expect(() => decodeWorkspace(JSON.stringify({ ...replay, victories: [...replay.victories!, replay.victories![0]] }), fingerprints)).toThrow('Invalid campaign victory');
});
