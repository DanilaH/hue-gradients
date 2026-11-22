import { expect, test } from 'vitest';
import verification from '../docs/spec/candidates/validation-0.1.json';
import { activeChallenge, challenges } from '../src/domain/challenges';
import { levels } from '../src/domain/levels';
import { type LevelDefinition } from '../src/domain/puzzle';
import { applyAction, decodeWorkspace, newWorkspace, type Workspace } from '../src/domain/workspace';

const fingerprints = new Map(levels.map((level, index) => [level.id, index.toString(16).padStart(64, '0')]));
const apply = (state: Workspace, action: Parameters<typeof applyAction>[1]) => applyAction(state, action, fingerprints);
function solveCampaign(state: Workspace, level: LevelDefinition): Workspace {
  const attemptId = `regular-${level.ordinal}`;
  if (!state.attempts[level.id]) state = apply(state, { kind: 'open', levelId: level.id, attemptId });
  for (const pair of verification.rows.find(row => row.id === level.id)!.legalOptimalWitness) {
    state = apply(state, { kind: 'swap', from: pair[0]!, to: pair[1]!, attemptId });
  }
  expect(state.completed).toContain(level.id);
  return state;
}
function cycles(level: LevelDefinition): number[] {
  const unseen = new Set(level.startTileAtPosition.keys());
  const lengths: number[] = [];
  while (unseen.size) {
    let current = unseen.values().next().value!;
    let length = 0;
    while (unseen.delete(current)) { length++; current = level.startTileAtPosition[current]!; }
    if (length > 1) lengths.push(length);
  }
  return lengths;
}

test('ten gates are attainable through the actual 60-level campaign', () => {
  let state = newWorkspace('regular-1');
  const profiles: string[] = [];
  for (const level of levels) {
    const item = challenges.find(item => item.requiredWorks === level.ordinal);
    const before = state;
    if (item) expect(apply(before, { kind: 'challenge-open', id: item.level.id, attemptId: 'too-early' })).toBe(before);
    state = solveCampaign(state, level);
    if (item) {
      const profile = apply(state, { kind: 'challenge-open', id: item.level.id, attemptId: `profile-${level.ordinal}` });
      expect(activeChallenge(profile.challengeProgress)?.level.id).toBe(item.level.id);
      expect(profile.attempts).toBe(state.attempts);
      expect(profile.completed).toBe(state.completed);
      profiles.push(item.level.id);
    }
  }
  expect(profiles).toEqual(challenges.map(item => item.level.id));
});

test('comparable starts have one five-cycle or two three-cycles and both require four swaps', () => {
  const [one, many] = challenges;
  expect(cycles(one!.level)).toEqual([5]);
  expect(cycles(many!.level)).toEqual([3, 3]);
  for (const item of [one!, many!]) {
    expect(item.level).toMatchObject({ width: 4, height: 4, minimumSwaps: 4,
      pinnedPositions: one!.level.pinnedPositions, solvedTileColors: one!.level.solvedTileColors });
    expect(item.moveLimit).toBe(6);
  }
  expect(one!.level.startTileAtPosition).not.toEqual(many!.level.startTileAtPosition);
});

test('last allowed accepted exchange can win or lose and neither changes history or campaign rights', () => {
  const campaign = levels.slice(0, 5).reduce(solveCampaign, newWorkspace('regular-1'));
  const def = challenges[0]!;
  const id = def.level.id;
  let state = apply(campaign, { kind: 'challenge-open', id, attemptId: 'win' });
  const swap = (from: number, to: number) => {
    state = apply(state, { kind: 'challenge-swap', from, to, attemptId: activeChallenge(state.challengeProgress)!.attempt.attemptId });
  };
  swap(1, 2); swap(1, 2);
  for (const position of [1, 2, 5, 6]) {
    const board = activeChallenge(state.challengeProgress)!.attempt.board;
    swap(position, board.indexOf(position));
  }
  expect(activeChallenge(state.challengeProgress)).toMatchObject({ status: 'won', attempt: { moves: 6 } });
  expect(state.challengeProgress!.best[id]).toBe(6);
  expect(decodeWorkspace(JSON.stringify(state), fingerprints)).toEqual(state);
  state = apply(state, { kind: 'challenge-restart', id, attemptId: 'loss' });
  expect(activeChallenge(state.challengeProgress)?.attempt.board).toEqual(def.level.startTileAtPosition);
  for (let i = 0; i < def.moveLimit; i++) swap(1, 2);
  const lost = state;
  swap(1, 2);
  expect(state).toBe(lost);
  expect(activeChallenge(state.challengeProgress)).toMatchObject({ status: 'lost', attempt: { moves: 6 } });
  expect(state.challengeProgress!.best[id]).toBe(6);
  expect(state.attempts).toEqual(campaign.attempts);
  expect(state.victories).toEqual(campaign.victories);
  expect(state.rights).toEqual(campaign.rights);
});
