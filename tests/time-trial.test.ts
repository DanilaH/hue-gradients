import { expect, test } from 'vitest';
import { applyTimed, timedRemaining, validateTimedProgress } from '../src/domain/timeTrial';

test('clearing a field changes the attempt in the same transition and the pause survives persistence', () => {
  let state = applyTimed(undefined, { kind: 'timed-open', id: 'first', now: 1_000 })!;
  for (const to of [1, 2, 5, 6]) {
    const { attempt } = state.run;
    state = applyTimed(state, { kind: 'timed-swap', from: attempt.board.indexOf(to), to,
      attemptId: attempt.attemptId, now: 2_000 })!;
  }
  expect(state.run).toMatchObject({ cleared: 1, attempt: { attemptId: 'first:1', moves: 0, levelId: 'timed-v1-2' } });
  const paused = applyTimed(state, { kind: 'timed-pause', now: 11_000 })!;
  const stored = JSON.parse(JSON.stringify(paused));
  validateTimedProgress(stored);
  expect(timedRemaining(stored.run, 911_000)).toBe(590_000);
  const resumed = applyTimed(stored, { kind: 'timed-resume', now: 911_000 })!;
  expect(timedRemaining(resumed.run, 912_000)).toBe(589_000);
});

test('an expired clock wins authority over a late swap and a finish is counted once', () => {
  const start = applyTimed(undefined, { kind: 'timed-open', id: 'first', now: 1_000 })!;
  const end = applyTimed(start, { kind: 'timed-swap', from: 1, to: 2, attemptId: 'first:0', now: 601_000 })!;
  expect(end.run.attempt).toBe(start.run.attempt);
  expect(end.finished).toBe(1);
  expect(end.run.remainingMs).toBe(0);
  expect(applyTimed(end, { kind: 'timed-expire', now: 701_000 })).toBe(end);
  const left = applyTimed(end, { kind: 'timed-leave', now: 701_000 })!;
  const replay = applyTimed(left, { kind: 'timed-open', id: 'second', now: 801_000 })!;
  expect(replay.finished).toBe(1);
  expect(replay.run).toMatchObject({ id: 'second', cleared: 0, remainingMs: 600_000 });
  expect(replay.run.attempt.board).toEqual(start.run.attempt.board);
});
