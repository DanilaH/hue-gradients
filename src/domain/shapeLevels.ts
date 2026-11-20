import { cycleStart } from './editor';
import { getLevel } from './levels';
import { CHALLENGE_CONTENT_VERSION, minimumSwaps, validateLevel, type LevelDefinition } from './puzzle';
import type { StartRecipe, TilePosition, TileShape, Vertex } from './tileShapes';

const hexagon: readonly Vertex[] = [[.5, 0], [1, .25], [1, .75], [.5, 1], [0, .75], [0, .25]];
const vertices: Record<TileShape, readonly Vertex[]> = {
  'triangle-nw': [[0, 0], [1, 0], [0, 1]],
  'triangle-se': [[1, 0], [1, 1], [0, 1]],
  rect: [[0, 0], [1, 0], [1, 1], [0, 1]],
  hex: hexagon,
};

function positions(level: LevelDefinition, layout: 'triangles' | 'hexagons' | 'mixed'): readonly TilePosition[] {
  return Object.freeze(level.solvedTileColors.map((_, index) => {
    const column = index % level.width, row = Math.floor(index / level.width);
    let shape: TileShape, sx: number, sy: number, spanX: number, spanY: number;
    if (layout === 'hexagons') {
      shape = 'hex';
      sx = column + (row % 2) * .5;
      sy = row * .75;
      spanX = level.width + .5;
      spanY = 1 + (level.height - 1) * .75;
    } else if (layout === 'triangles') {
      shape = column % 2 === 0 ? 'triangle-nw' : 'triangle-se';
      sx = Math.floor(column / 2);
      sy = row;
      spanX = level.width / 2;
      spanY = level.height;
    } else {
      const cells = ['rect', 'triangle-nw', 'triangle-se', 'hex', 'rect'] as const;
      shape = cells[column]!;
      sx = column >= 2 ? column - 1 : column;
      sy = row;
      spanX = 4;
      spanY = level.height;
    }
    return Object.freeze({ shape, vertices: Object.freeze(vertices[shape].map(([x, y]) =>
      Object.freeze([(sx + x) / spanX, (sy + y) / spanY] as const))) });
  }));
}

function shuffledGroup(group: readonly number[], seed: number): number[] {
  const order = [...group];
  let state = seed >>> 0;
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(state / 0x100000000 * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const fixed = order.flatMap((position, i) => position === group[i] ? [i] : []);
  if (fixed.length === 1) {
    const i = fixed[0]!, j = (i + 1) % order.length;
    [order[i], order[j]] = [order[j]!, order[i]!];
  } else {
    fixed.forEach((i, index) => { order[i] = group[fixed[(index + 1) % fixed.length]!]!; });
  }
  return order;
}

function generate(level: LevelDefinition, recipe: StartRecipe): number[] {
  const groups = new Map<TileShape, number[]>();
  const order = level.solvedTileColors.map((_, i) => i);
  for (const i of order) {
    if (level.pinnedPositions.includes(i)) continue;
    const shape = level.positions![i]!.shape;
    const group = groups.get(shape) ?? [];
    group.push(i);
    groups.set(shape, group);
  }
  let seed = recipe.seed;
  for (const group of groups.values()) {
    if (group.length >= 2) {
      const shuffled = recipe.mode === 'group-cycle'
        ? cycleStart(group.length, [], seed).map(position => group[position]!)
        : shuffledGroup(group, seed);
      group.forEach((position, i) => { order[position] = shuffled[i]!; });
    }
    seed++;
  }
  return order;
}

function shaped(source: LevelDefinition, id: string, title: string,
  layout?: 'triangles' | 'hexagons' | 'mixed', recipe?: StartRecipe): LevelDefinition {
  const shell: LevelDefinition = { ...source, id, title, contentVersion: CHALLENGE_CONTENT_VERSION,
    ...(layout ? { positions: positions(source, layout) } : {}), ...(recipe ? { startRecipe: Object.freeze(recipe) } : {}) };
  const order = recipe ? generate(shell, recipe) : source.startTileAtPosition.map((_, i, board) => board.indexOf(i));
  const level = Object.freeze({ ...shell, startTileAtPosition: Object.freeze(order), minimumSwaps: minimumSwaps(order, source.pinnedPositions) });
  validateLevel(level);
  return level;
}

export const geometryLevels: readonly LevelDefinition[] = Object.freeze([
  shaped(getLevel('gradient-043'), 'geometry-v1-rect', 'Прямоугольники'),
  shaped(getLevel('gradient-009'), 'geometry-v1-triangles', 'Треугольники', 'triangles',
    { version: 'shape-start-1', mode: 'group-cycle', seed: 273 }),
  shaped(getLevel('gradient-025'), 'geometry-v1-hexagons', 'Шестиугольники', 'hexagons',
    { version: 'shape-start-1', mode: 'repair-fixed', seed: 577 }),
  shaped(getLevel('gradient-015'), 'geometry-v1-mixed', 'Смешанное поле', 'mixed',
    { version: 'shape-start-1', mode: 'group-cycle', seed: 812 }),
]);
