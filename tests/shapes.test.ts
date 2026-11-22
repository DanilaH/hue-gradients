import { expect, test } from 'vitest';
import { canSwap, createAttempt, proposeSwap, validateAttempt } from '../src/domain/puzzle';
import { geometryLevels } from '../src/domain/shapeLevels';
import { boardGeometry, cellAt, cellCenter, hitTest } from '../src/game/geometry';

test.each(geometryLevels)('$title shares exactly the same clicks, geometry and compatible swaps', level => {
  const layout = boardGeometry(407, 573, level.width, level.height, level.positions);
  for (const position of level.startTileAtPosition.keys()) {
    const { x, y } = cellCenter(cellAt(layout, position));
    expect(hitTest(layout, x, y)).toBe(position);
  }
  const origin = createAttempt(level, 'first');
  let attempt = origin;
  for (const to of origin.board.keys()) {
    const from = attempt.board.indexOf(to);
    if (from === to) continue;
    expect(canSwap(level, from, to)).toBe(true);
    attempt = proposeSwap(level, attempt, from, to);
  }
  expect(attempt).toMatchObject({ completed: true, moves: level.minimumSwaps });
  expect(createAttempt(level, 'replay').board).toEqual(origin.board);
  for (const pin of level.pinnedPositions) expect(origin.board[pin]).toBe(pin);
  if (level.startRecipe) {
    expect(origin.generatedStart).toEqual({ ...level.startRecipe, board: origin.board });
    validateAttempt(level, JSON.parse(JSON.stringify(origin)));
    expect(() => validateAttempt(level, { ...origin, generatedStart: { ...origin.generatedStart!, seed: 0 } }))
      .toThrow('Invalid generated start');
  }
});

test('one cycle per compatible group; repaired shuffles never leave movable fixed points', () => {
  for (const level of geometryLevels.filter(level => level.startRecipe)) {
    const shapes = new Set(level.positions!.map(position => position.shape));
    for (const shape of shapes) {
      const group = level.positions!.flatMap((position, i) => position.shape === shape && !level.pinnedPositions.includes(i) ? [i] : []);
      if (group.length < 2) continue;
      for (const i of group) expect(level.startTileAtPosition[i]).not.toBe(i);
      if (level.startRecipe!.mode !== 'group-cycle') continue;
      const seen = new Set<number>();
      let i = group[0]!;
      while (!seen.has(i)) { seen.add(i); i = level.startTileAtPosition[i]!; }
      expect(seen.size).toBe(group.length);
    }
  }
  const mixed = geometryLevels[3]!;
  const movable = mixed.startTileAtPosition.findIndex((id, i) => id !== i);
  const incompatible = mixed.positions!.findIndex((position, i) =>
    position.shape !== mixed.positions![movable]!.shape && !mixed.pinnedPositions.includes(i));
  const original = createAttempt(mixed, 'mixed');
  expect(proposeSwap(mixed, original, movable, incompatible)).toBe(original);
});
