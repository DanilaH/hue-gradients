import { hasAuthorProof } from './creative';
import { getLevel } from './levels';
import { pilotLevel } from './geometryPilot';
import type { LevelDefinition } from './puzzle';
import type { Workspace } from './workspace';

export type ExportField = Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors' | 'geometry'>;
export interface WallpaperSize { width: number; height: number }

export function wallpaperField(state: Workspace, key: string): ExportField {
  const completed = state.completed.find(id => key === `campaign:${id}`);
  let field: ExportField | undefined = completed ? getLevel(completed) : undefined;
  const pilotId = key.startsWith('pilot:') ? key.slice('pilot:'.length) : '';
  if (pilotId && state.challengeProgress?.best[pilotId] !== undefined) field = pilotLevel(pilotId);
  if (field?.geometry) return field;
  if (!field) {
    for (const work of Object.values(state.creative?.works ?? {})) {
      const node = Object.values(work.nodes).find(node => key === `own:${work.workId}:${node.nodeId}`);
      if (node && hasAuthorProof(work, node.nodeId)) {
        field = node.field;
        break;
      }
    }
  }
  if (!field) throw new Error('Для обоев нужна собранная работа.');
  const { width, height, solvedTileColors } = field;
  if (!Number.isInteger(width) || width < 1 || width > 6 || !Number.isInteger(height) || height < 1 || height > 5
      || solvedTileColors.length !== width * height || solvedTileColors.some(colour => !/^#[0-9a-f]{6}$/i.test(colour))) {
    throw new Error('Не удалось прочитать цвета работы.');
  }
  return field;
}
