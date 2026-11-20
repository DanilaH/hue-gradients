import { type CreativeNode } from './creative';
import { editorFingerprintPayload, inspectField, validName, type EditorField } from './editor';
import { RULES_VERSION } from './puzzle';
import { hashText } from '../local-store/command';

export const PUZZLE_FILE_LIMIT = 64 * 1024;

interface Transfer {
  format: 'poluson-puzzle';
  version: 1;
  name: string;
  rulesVersion: typeof RULES_VERSION;
  fingerprint: string;
  field: EditorField;
  seed: number;
}
export function makePuzzleFile(name: string, node: CreativeNode): File {
  const item: Transfer = { format: 'poluson-puzzle', version: 1, name, rulesVersion: node.rulesVersion,
    field: node.field, fingerprint: node.fingerprint, seed: node.seed };
  return new File([JSON.stringify(item)], 'Poluson.poluson.json', { type: 'application/json' });
}
export async function parsePuzzleFile(file: File): Promise<Transfer> {
  if (!file.size || file.size > PUZZLE_FILE_LIMIT) throw new Error('Puzzle file size');
  const value = JSON.parse(await file.text()) as Partial<Transfer> | null;
  if (!value || value.format !== 'poluson-puzzle' || value.version !== 1 || value.rulesVersion !== RULES_VERSION ||
      typeof value.name !== 'string' || typeof value.seed !== 'number' || !Number.isInteger(value.seed) ||
      value.seed < 0 || value.seed > 0xffffffff || typeof value.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.fingerprint) ||
      !value.field || inspectField(value.field).errors.length) throw new Error('Invalid puzzle file');
  const { width, height, pinnedPositions, solvedTileColors, startTileAtPosition, cornerColorsTLTRBLBR } = value.field;
  const field = { width, height, pinnedPositions, solvedTileColors, startTileAtPosition, cornerColorsTLTRBLBR };
  if (await hashText(editorFingerprintPayload(field)) !== value.fingerprint) throw new Error('Puzzle fingerprint mismatch');
  return { format: value.format, version: value.version, rulesVersion: value.rulesVersion, name: validName(value.name),
    field, fingerprint: value.fingerprint, seed: value.seed };
}
