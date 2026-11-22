import { expect, test } from 'vitest';
import { activeTimed, applyTimed, timedRemaining, validateTimedProgress, type TimedProgress } from '../src/domain/timeTrial';
import { timedField } from '../src/domain/timedFields';
import { validateLevel } from '../src/domain/puzzle';

function solve(input: TimedProgress, now: number): TimedProgress {
  let progress = input;
  for (const to of input.run.attempt.board.keys()) {
    const { attempt } = progress.run;
    const from = attempt.board.indexOf(to);
    if (from === to) continue;
    progress = applyTimed(progress, { kind: 'timed-swap', from, to, attemptId: attempt.attemptId, now })!;
    if (progress.run.cleared !== input.run.cleared) return progress;
  }
  throw new Error('Test board did not clear');
}

test('new 7×7 rounds change palettes and anchors; a pause preserves the exact committed board', () => {
  let state = applyTimed(undefined, { kind: 'timed-open', id: 'first', now: 1_000 })!;
  const first = state.run.field!;
  for (let round = 0; round < 7; round++) state = solve(state, 2_000);
  expect(state.run).toMatchObject({ cleared: 7, attempt: { attemptId: 'first:7', moves: 0, levelId: 'timed-v2-8' } });
  expect(state.run.field?.solvedTileColors).not.toEqual(first.solvedTileColors);
  expect(state.run.field?.pinnedPositions.length).toBeLessThan(first.pinnedPositions.length);
  const paused = applyTimed(state, { kind: 'timed-pause', now: 11_000 })!;
  const stored = JSON.parse(JSON.stringify(paused));
  validateTimedProgress(stored);
  expect(timedRemaining(stored.run, 911_000)).toBe(590_000);
  const resumed = applyTimed(stored, { kind: 'timed-resume', now: 911_000 })!;
  expect(activeTimed(resumed)?.level).toEqual(state.run.field);
  expect(timedRemaining(resumed.run, 912_000)).toBe(589_000);
});

test('the per-run shuffled palette deck has no first-deck repeats and remains valid after wrapping', () => {
  for (const id of ['first', 'second', 'third']) {
    const fields = Array.from({ length: 30 }, (_, round) => timedField(id, round));
    fields.forEach(validateLevel);
    expect(fields.every(field => field.width === 7 && field.height === 7)).toBe(true);
    expect(new Set(fields.slice(0, 12).map(field => field.solvedTileColors.join())).size).toBe(12);
    expect(fields[11]?.solvedTileColors).not.toEqual(fields[12]?.solvedTileColors);
  }
  expect(timedField('second', 0)).not.toEqual(timedField('first', 0));
});

test('expiration takes priority over a late swap and the next run does not duplicate the finish', () => {
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
  expect(replay.run.attempt.board).not.toEqual(start.run.attempt.board);
});

test('the result can start a new run directly and retain its source tab', () => {
  const start = applyTimed(undefined, { kind: 'timed-open', id: 'first', now: 1_000, entry: 'geometry' })!;
  const end = applyTimed(start, { kind: 'timed-expire', now: 601_000 })!;
  expect(end).toMatchObject({ active: true, finished: 1, entry: 'geometry' });
  const replay = applyTimed(end, { kind: 'timed-open', id: 'second', now: 602_000, entry: end.entry! })!;
  expect(replay).toMatchObject({ active: true, finished: 1, entry: 'geometry', run: { id: 'second', remainingMs: 600_000 } });
});
