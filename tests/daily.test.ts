import { expect, test } from 'vitest';
import { activeDaily, applyDaily, validateDailyProgress, type DailyFeed } from '../src/domain/daily';
import { getLevel } from '../src/domain/levels';
import { DAILY_CONTENT_VERSION, type LevelDefinition } from '../src/domain/puzzle';

const first = '2026-11-20', second = '2026-11-21';
const level = (date: string): LevelDefinition => ({ ...getLevel('gradient-001'), id: `day-${date}`, contentVersion: DAILY_CONTENT_VERSION });
const feed = (now: number, version: string): DailyFeed => ({ source: 'Fixture', version,
  verifiedNowMs: now, days: [{ date: first, level: level(first) }, { date: second, level: level(second) }] });

test('trusted UTC date admits one common start and never rewrites a cached day', () => {
  const at = Date.UTC(2026, 10, 20, 23, 59, 59);
  const before = applyDaily(undefined, { kind: 'daily-cache', feed: feed(at, 'v1') })!;
  expect(Object.keys(before.slots)).toEqual([first]);
  expect(applyDaily(before, { kind: 'daily-open', date: second, replay: false, attemptId: 'future' })).toBe(before);
  const playing = applyDaily(before, { kind: 'daily-open', date: first, replay: false, attemptId: 'first' })!;
  const next = applyDaily(playing, { kind: 'daily-cache', feed: feed(at + 1000, 'v2') })!;
  expect(activeDaily(next)?.attempt.attemptId).toBe('first');
  expect(next.slots[first]?.version).toBe('v1');
  expect(next.slots[second]?.version).toBe('v2');
  expect(applyDaily(next, { kind: 'daily-cache', feed: feed(at, 'old-trusted-clock') })).toBe(next);
  validateDailyProgress(JSON.parse(JSON.stringify(next)));
  expect(() => applyDaily(before, { kind: 'daily-cache', feed: { ...feed(at, 'v2'), days: [{ date: '2026-11-31', level: level(first) }] } }))
    .toThrow('Invalid daily slot');
});

test('replaying an offline archived date records one completed date', () => {
  const initial = applyDaily(undefined, { kind: 'daily-cache', feed: feed(Date.UTC(2026, 10, 21), 'v1') })!;
  let state = initial;
  for (const id of ['first', 'repeat']) {
    state = applyDaily(state, { kind: 'daily-open', date: first, replay: true, attemptId: id })!;
    state = applyDaily(state, { kind: 'daily-swap', from: 1, to: 2, attemptId: id })!;
  }
  const last = state;
  expect(state.solved).toEqual([first]);
  expect(applyDaily(state, { kind: 'daily-swap', from: 1, to: 2, attemptId: 'repeat' })).toBe(last);
  expect(state.slots[first]?.level.startTileAtPosition).toEqual(initial.slots[first]?.level.startTileAtPosition);
});
