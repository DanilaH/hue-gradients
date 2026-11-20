import { expect, test } from 'vitest';
import { levels } from '../src/domain/levels';
import { applyAction, decodeWorkspace, fingerprintPayload, newWorkspace } from '../src/domain/workspace';
import { hashText } from '../src/local-store/command';
import { RULES_VERSION } from '../src/domain/puzzle';
import witnesses from '../docs/spec/prototype/validation-0.1.json';
import { boardGeometry, cellAt, hitTest } from '../src/game/geometry';

const fingerprints = new Map(await Promise.all(levels.map(async l => [l.id, await hashText(fingerprintPayload(l))] as const)));
function finish(state: ReturnType<typeof newWorkspace>) {
  const row = witnesses.rows.find(r => r.id === state.activeLevelId)!;
  for (const [from, to] of row.legal_optimal_witness) state = applyAction(state, { kind: 'swap', from: from!, to: to!, attemptId: state.attempts[state.activeLevelId]!.attemptId }, fingerprints);
  return state;
}
test('completion, independent clean/assisted bests and base rights survive replay', () => {
  const first = levels[0]!;
  let state = finish(newWorkspace('clean-one'));
  expect(state.completed).toEqual([first.id]); expect(state.rights).toContain(`clean-export:${first.id}`); expect(state.rights).toContain(`campaign-card:${first.id}`); expect(state.rights).toContain('export-clean');
  expect(state.onboarding.firstSwapDone).toBe(true);
  expect(state.bests[first.id]).toEqual({ fingerprint: fingerprints.get(first.id), rulesVersion: RULES_VERSION, clean: 1, assisted: null });
  state = applyAction(state, { kind: 'restart', levelId: first.id, attemptId: 'helped-two' }, fingerprints);
  state = applyAction(state, { kind: 'help', attemptId: 'helped-two' }, fingerprints);
  state = finish(state);
  expect(state.bests[first.id]?.clean).toBe(1); expect(state.bests[first.id]?.assisted).toBe(1);
  expect(state.completed).toHaveLength(1); expect(state.rights.filter(id => id.startsWith('campaign-card:'))).toHaveLength(1); expect(new Set(state.rights).size).toBe(state.rights.length);
  expect(decodeWorkspace(JSON.stringify(state), fingerprints)).toEqual(state);
});
test('stale attempt gestures and inaccessible campaign levels do not mutate state', () => {
  const state = newWorkspace('one');
  expect(applyAction(state, { kind: 'swap', from: 1, to: 2, attemptId: 'old' }, fingerprints)).toBe(state);
  expect(applyAction(state, { kind: 'open', levelId: levels[4]!.id, attemptId: 'locked' }, fingerprints)).toBe(state);
});
test('one corrupt attempt is retained separately without clearing earned progress', () => {
  let state = finish(newWorkspace('one'));
  state = applyAction(state, { kind: 'open', levelId: levels[1]!.id, attemptId: 'two' }, fingerprints);
  const raw = JSON.parse(JSON.stringify(state)); raw.attempts[levels[1]!.id].board = [0, 0];
  const recovered = decodeWorkspace(JSON.stringify(raw), fingerprints);
  expect(recovered.attempts[levels[1]!.id]).toBeUndefined(); expect(recovered.quarantine).toHaveLength(1);
  expect(recovered.completed).toEqual(state.completed); expect(recovered.bests).toEqual(state.bests); expect(recovered.rights).toEqual(state.rights);
  expect(() => decodeWorkspace(JSON.stringify({ ...state, schemaVersion: 99 }), fingerprints)).toThrow();
});
test('render bounds and rounded hit testing share cell geometry, including seams and edges', () => {
  const board = boardGeometry(320, 374, 6, 5);
  for (let i = 0; i < 30; i++) {
    const c = cellAt(board, i);
    expect(hitTest(board, c.x + c.width / 2, c.y + c.height / 2)).toBe(i);
    expect(hitTest(board, c.x, c.y)).toBeNull();
  }
  expect(hitTest(board, -1, 20)).toBeNull(); expect(hitTest(board, 320, 20)).toBeNull();
  expect(hitTest(board, 320 / 6, 40)).toBeNull();
});

test('preferences extend old saves without resetting attempts, progress or assistance', () => {
  const state = finish(newWorkspace('old'));
  const old = JSON.parse(JSON.stringify(state)); delete old.preferences;
  const loaded = decodeWorkspace(JSON.stringify(old), fingerprints);
  expect(loaded.preferences).toEqual({ motion: true, sound: true, haptics: true, statistics: true });
  expect(loaded.attempts).toEqual(state.attempts); expect(loaded.completed).toEqual(state.completed);
  const changed = applyAction(loaded, { kind: 'preferences', key: 'sound', value: false }, fingerprints);
  expect(changed.attempts).toBe(loaded.attempts); expect(changed.bests).toBe(loaded.bests);
  expect(decodeWorkspace(JSON.stringify(changed), fingerprints).preferences.sound).toBe(false);
  expect(applyAction(changed, { kind: 'preferences', key: 'sound', value: false }, fingerprints)).toBe(changed);
  expect(() => decodeWorkspace(JSON.stringify({ ...state, preferences: { ...state.preferences, sound: 'yes' } }), fingerprints)).toThrow();
});
