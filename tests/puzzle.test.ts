import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import baseline from '../docs/spec/prototype/levels-0.1.json';
import validation from '../docs/spec/prototype/validation-0.1.json';
import { createAttempt, minimumSwaps, proposeHelp, proposeSwap, validateAttempt, validateLevel } from '../src/domain/puzzle';

describe('frozen first 15', () => {
  test('uses the exact delivered bytes', () => {
    const bytes = readFileSync(new URL('../docs/spec/prototype/levels-0.1.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('55efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51');
    expect(baseline.levels).toHaveLength(15);
  });

  for (const level of baseline.levels) {
    test(`${level.id}: independent optimal witness through the real reducer`, () => {
      validateLevel(level);
      let attempt = createAttempt(level, `attempt-${level.id}`);
      const row = validation.rows.find(item => item.id === level.id)!;
      for (const pair of row.legal_optimal_witness) {
        const previous = attempt;
        attempt = proposeSwap(level, attempt, pair[0]!, pair[1]!);
        expect(attempt).not.toBe(previous);
        expect(previous.board).not.toBe(attempt.board);
        validateAttempt(level, attempt);
      }
      expect(attempt.completed).toBe(true);
      expect(attempt.moves).toBe(level.minimumSwaps);
      expect(attempt.assisted).toBe(false);
      expect(minimumSwaps(attempt.board, level.pinnedPositions)).toBe(0);
    });
  }
});

test('allows swapping correct movable tiles; pins, same tile and outside are no-ops', () => {
  const level = baseline.levels[1]!;
  const attempt = createAttempt(level, 'test');
  for (const [from, to] of [[0, 1], [1, 1], [-1, 2], [1, 99], [NaN, 1]]) {
    expect(proposeSwap(level, attempt, from!, to!)).toBe(attempt);
  }
  const solution = { ...attempt, board: attempt.board.map((_, i) => i), completed: true };
  expect(proposeSwap(level, solution, 1, 2)).toBe(solution);
  const partlyCorrect = proposeSwap(level, attempt, 1, 2);
  const correctPosition = partlyCorrect.board.findIndex((id, i) => id === i && !level.pinnedPositions.includes(i));
  const other = partlyCorrect.board.findIndex((_, i) => i !== correctPosition && !level.pinnedPositions.includes(i));
  expect(proposeSwap(level, partlyCorrect, correctPosition, other).moves).toBe(partlyCorrect.moves + 1);
});

test('help changes only assistance; replay starts a fresh clean attempt', () => {
  const level = baseline.levels[3]!;
  const original = createAttempt(level, 'one');
  const helped = proposeHelp(original);
  expect(helped.board).toEqual(original.board);
  expect(helped.moves).toBe(0);
  expect(helped.assisted).toBe(true);
  expect(helped.assistsUsed).toBe(1);
  validateAttempt(level, helped);
  expect(createAttempt(level, 'two').assisted).toBe(false);
  expect(original.assisted).toBe(false);
});

test('rejects corrupt/foreign/unsupported saves instead of resetting them', () => {
  const level = baseline.levels[0]!, attempt = createAttempt(level, 'one');
  for (const broken of [
    { ...attempt, board: [0, 1, 1, 3] },
    { ...attempt, board: [1, 0, 2, 3] },
    { ...attempt, moves: -1 },
    { ...attempt, levelId: 'other' },
    { ...attempt, assisted: true },
    { ...attempt, completed: true },
  ]) expect(() => validateAttempt(level, broken)).toThrow();
  expect(() => minimumSwaps([0, 2, 2], [])).toThrow();
});
