import definitions from '../../docs/spec/prototype/levels-0.1.json';
import candidates from '../../docs/spec/candidates/levels-0.1.json';
import { CAMPAIGN_CONTENT_VERSION, validateLevel, type LevelDefinition } from './puzzle';

// Preserve the exact original first15 objects/bytes; append authored candidates without regeneration.
export const levels: readonly LevelDefinition[] = [...definitions.levels,
  ...candidates.campaign.slice(15).map(level => ({ ...level, contentVersion: CAMPAIGN_CONTENT_VERSION }))];
export const chapters = candidates.chapters;
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
