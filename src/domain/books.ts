import { makeField } from './editor';
import { getLevel } from './levels';
import { CHALLENGE_CONTENT_VERSION, minimumSwaps, validateLevel, type LevelDefinition } from './puzzle';
import type { Workspace } from './workspace';

interface Goal {
  levelId: string;
  need: 'win' | 'perfect' | 'challenge';
}
export interface Book {
  id: string;
  title: string;
  goals: readonly Goal[];
  level: LevelDefinition;
  palette: readonly string[];
}

function book(id: string, title: string, goals: readonly Goal[], paletteIds: readonly string[], seed: number): Book {
  const palette = paletteIds.map((levelId, index) => {
    const level = getLevel(levelId);
    return index % 2 === 0 ? level.solvedTileColors[0]! : level.solvedTileColors.at(-1)!;
  });
  const field = makeField(4, 4, palette, [0, 3, 12, 15], seed);
  const level: LevelDefinition = { id, ordinal: 0, title, contentVersion: CHALLENGE_CONTENT_VERSION,
    ...field, minimumSwaps: minimumSwaps(field.startTileAtPosition, field.pinnedPositions) };
  validateLevel(level);
  Object.freeze(level.startTileAtPosition);
  Object.freeze(level.solvedTileColors);
  Object.freeze(level.pinnedPositions);
  return Object.freeze({ id, title, goals, level: Object.freeze(level), palette: Object.freeze(palette) });
}

export const books: readonly Book[] = Object.freeze([
  book('book-v1-dawn', 'Тёплый свет', [
    { levelId: 'gradient-001', need: 'win' }, { levelId: 'gradient-004', need: 'win' },
    { levelId: 'gradient-003', need: 'perfect' }, { levelId: 'gradient-006', need: 'win' },
  ], ['gradient-001', 'gradient-004', 'gradient-003', 'gradient-006'], 327),
  book('book-v1-dusk', 'Синий час', [
    { levelId: 'gradient-002', need: 'win' }, { levelId: 'gradient-008', need: 'win' },
    { levelId: 'gradient-010', need: 'win' }, { levelId: 'challenge-v1-1', need: 'challenge' },
  ], ['gradient-002', 'gradient-008', 'gradient-010', 'gradient-009'], 478),
]);
export type BookProof = Pick<Workspace, 'completed' | 'challengeProgress' | 'bests'>;

export function goalLabel(goal: Goal): string {
  if (goal.need === 'challenge') return 'Пройти первое испытание';
  const prefix = goal.need === 'perfect' ? 'Идеально без помощи' : 'Собрать';
  return `${prefix} · ${getLevel(goal.levelId).title}`;
}

export function bookProgress(book: Book, state: BookProof) {
  const goals = book.goals.map(goal => ({ ...goal, completed: goal.need === 'challenge'
    ? state.challengeProgress?.best[goal.levelId] !== undefined
    : goal.need === 'perfect' ? state.bests[goal.levelId]?.clean === getLevel(goal.levelId).minimumSwaps
    : state.completed.includes(goal.levelId) }));
  return { goals, filled: goals.filter(goal => goal.completed).length, unlocked: goals.every(goal => goal.completed),
    claimed: state.challengeProgress?.best[book.id] !== undefined };
}
