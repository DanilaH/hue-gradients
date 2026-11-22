import { expect, test } from 'vitest';
import { spatialPalette } from '../src/game/atmosphere';
import { levels } from '../src/domain/levels';

test('atmosphere responds to permutation while the colour histogram remains unchanged', () => {
  const level = levels[4]!, original = [...level.startTileAtPosition];
  const movable = original.map((_, i) => i).filter(i => !level.pinnedPositions.includes(i));
  const changed = [...original]; [changed[movable[0]!], changed[movable[1]!]] = [changed[movable[1]!]!, changed[movable[0]!]!];
  expect([...changed].sort((a,b) => a-b)).toEqual([...original].sort((a,b) => a-b));
  expect(spatialPalette(level, changed)).not.toEqual(spatialPalette(level, original));
  expect(original).toEqual(level.startTileAtPosition);
});
test('atmosphere consumes no hidden solution score, pins, minimum or progress', () => {
  const level = levels[4]!, visible = { width: level.width, height: level.height, solvedTileColors: level.solvedTileColors };
  const result = spatialPalette(visible, level.startTileAtPosition);
  const irrelevantChanges = { ...level, minimumSwaps: 999, pinnedPositions: [] };
  expect(result).toEqual(spatialPalette(irrelevantChanges, level.startTileAtPosition));
  expect(result).toHaveLength(9);
  expect(result.flat().every(v => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true);
});
