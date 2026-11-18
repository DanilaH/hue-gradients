import definitions from '../../docs/spec/prototype/levels-0.1.json';
import { validateLevel, type LevelDefinition } from './puzzle';

export const levels: readonly LevelDefinition[] = definitions.levels;
for (const level of levels) {
  validateLevel(level);
  Object.freeze(level.solvedTileColors); Object.freeze(level.startTileAtPosition);
  Object.freeze(level.pinnedPositions); Object.freeze(level);
}
Object.freeze(levels);
export function getLevel(id: string): LevelDefinition {
  const level = levels.find(item => item.id === id);
  if (!level) throw new Error('Unknown content version');
  return level;
}
