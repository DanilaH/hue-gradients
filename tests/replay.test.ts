import { expect, test } from 'vitest';
import { acceptedInput } from '../src/app/gameTelemetry';
import { getLevel } from '../src/domain/levels';
import { addReplay, rankReplays, replayDefinition, verifyReplay, type ReplayProof } from '../src/domain/replay';
import { RULES_VERSION } from '../src/domain/puzzle';
import { applyAction, newWorkspace } from '../src/domain/workspace';

const level = getLevel('gradient-001');
const fingerprint = 'e'.repeat(64);
const fingerprints = new Map([[level.id, fingerprint]]);
const manual: ReplayProof['replay'] = [{ kind: 'swap', from: 1, to: 2 }];

async function proof(overrides: Partial<ReplayProof> = {}): Promise<ReplayProof> {
  return { ...await replayDefinition(level), eventId: 'receipt-a', attemptId: 'attempt-a', rules: RULES_VERSION,
    helpRules: 'free-help-1', moves: 1, assisted: false, elapsedMs: 2100, replay: manual, ...overrides };
}

test('exact replay establishes cost, result and comparison group; ranking is stable and duplicates do not add rows', async () => {
  const slow = await verifyReplay(level, await proof());
  const fast = await verifyReplay(level, await proof({ eventId: 'fast', attemptId: 'f', elapsedMs: 1250 }));
  const helped = await verifyReplay(level, await proof({ eventId: 'helped', attemptId: 'h', moves: 3, assisted: true,
    replay: [{ kind: 'help', assistance: { kind: 'auto' } }] }));
  const noHelp = await verifyReplay(level, await proof({ eventId: 'no-help', attemptId: 'n', helpRules: 'no-help-1' }));
  expect(rankReplays([slow, helped, noHelp, fast], slow.comparisonKey)).toEqual([fast, slow]);
  const list = addReplay([], slow);
  expect(addReplay(list, slow)).toBe(list);
  expect(() => addReplay(list, { ...slow, eventId: 'reused' })).toThrow('already used');
  await expect(verifyReplay(level, await proof({ moves: 3 }))).rejects.toThrow('result mismatch');
  await expect(verifyReplay(level, await proof({ startedFrom: 'changed' }))).rejects.toThrow('Incompatible replay');
  await expect(verifyReplay(level, await proof({ replay: [{ kind: 'swap', from: 0, to: 1 }, ...manual] }))).rejects.toThrow('not accepted');
});

test('intent itself and invalid exchanges do not appear as accepted moves', () => {
  const before = newWorkspace('guest');
  const pinned = applyAction(before, { kind: 'swap', from: 0, to: 1, attemptId: 'guest' }, fingerprints);
  expect(acceptedInput('swap', before, pinned)).toBeUndefined();
  const preview = applyAction(before, { kind: 'help', attemptId: 'guest', assistance: { kind: 'preview' } }, fingerprints);
  expect(acceptedInput('help', before, preview)).toEqual({ kind: 'help-accepted', mode: 'campaign', chargedMoves: 0 });
  const after = applyAction(before, { kind: 'swap', from: 1, to: 2, attemptId: 'guest' }, fingerprints);
  expect(acceptedInput('swap', before, after)).toEqual({ kind: 'swap-accepted', mode: 'campaign', chargedMoves: 1 });
  expect(acceptedInput('swap-intent', before, after)).toBeUndefined();
});
