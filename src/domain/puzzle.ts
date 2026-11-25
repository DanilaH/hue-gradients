import { RECTANGLE, validOrientedPosition, validPosition, type StartRecipe, type TilePosition } from './tileShapes';
import { GEOMETRY_START_VERSION, geometryColors, geometrySeed, geometryStart, geometryWorkPayload,
  validGeometryIdentity, type GeometryIdentity } from './geometryRecipe';

/** Game-owned rules. This module has no renderer, SDK, clock or storage imports. */
export const RULES_VERSION = 'gradient-rules-1';
export const CONTENT_VERSION = 'gradient-prototype-0.1';
export const CAMPAIGN_CONTENT_VERSION = 'gradient-campaign-candidates-0.1';
export const CHALLENGE_CONTENT_VERSION = 'gradient-challenges-1';
export const PILOT_CONTENT_VERSION = 'gradient-pilot-1';
export const DAILY_CONTENT_VERSION = 'gradient-daily-1';
export type ContentVersion = typeof CONTENT_VERSION | typeof CAMPAIGN_CONTENT_VERSION | typeof CHALLENGE_CONTENT_VERSION | typeof DAILY_CONTENT_VERSION | typeof PILOT_CONTENT_VERSION;

export interface LevelDefinition {
  readonly contentVersion?: ContentVersion;
  readonly id: string;
  readonly ordinal: number;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly solvedTileColors: readonly string[];
  readonly pinnedPositions: readonly number[];
  readonly startTileAtPosition: readonly number[];
  readonly minimumSwaps: number;
  readonly positions?: readonly TilePosition[];
  readonly startRecipe?: StartRecipe;
  readonly geometry?: GeometryIdentity;
}

export interface Attempt {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly contentVersion: ContentVersion;
  readonly levelId: string;
  readonly attemptId: string;
  readonly board: readonly number[];
  readonly moves: number;
  readonly assisted: boolean;
  readonly assistsUsed: number;
  readonly completed: boolean;
  readonly generatedStart?: (StartRecipe | {
    readonly version: typeof GEOMETRY_START_VERSION;
    readonly mode: 'group-cycle';
    readonly seed: number;
    readonly work: string;
  }) & { readonly board: readonly number[] };
}

export const AUTO_HELP_COST = 3;
export type Assistance = { kind: 'preview' } | { kind: 'pulse'; scanFrom: number } | { kind: 'auto' };

const integer = (value: number, min: number, max: number): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

export function validatePermutation(board: readonly number[], pins: readonly number[]): void {
  if (!board.length || board.some(id => !integer(id, 0, board.length - 1)) || new Set(board).size !== board.length) {
    throw new Error('Invalid tile permutation');
  }
  if (new Set(pins).size !== pins.length || pins.some(position => !integer(position, 0, board.length - 1) || board[position] !== position)) {
    throw new Error('Invalid or moved pin');
  }
}

/** Arbitrary swaps: movable tiles minus permutation cycles, including singletons. */
export function minimumSwaps(board: readonly number[], pins: readonly number[]): number {
  validatePermutation(board, pins);
  const pinned = new Set(pins), visited = new Set<number>();
  let cycles = 0;
  for (let position = 0; position < board.length; position += 1) {
    if (pinned.has(position) || visited.has(position)) continue;
    cycles += 1;
    let cursor = position;
    while (!visited.has(cursor)) {
      visited.add(cursor);
      cursor = board[cursor]!;
    }
  }
  return board.length - pins.length - cycles;
}

function compatibleShape(level: LevelDefinition, index: number) {
  const position = level.positions?.[index];
  return level.geometry ? position?.family : position?.shape ?? RECTANGLE;
}

function respectsShapes(level: LevelDefinition, order: readonly number[]): boolean {
  return !level.positions || order.every((tile, position) => compatibleShape(level, tile) === compatibleShape(level, position));
}

export function canSwap(level: LevelDefinition, from: number, to: number): boolean {
  const size = level.geometry ? level.solvedTileColors.length : level.width * level.height;
  return from !== to && integer(from, 0, size - 1) && integer(to, 0, size - 1) &&
    !level.pinnedPositions.includes(from) && !level.pinnedPositions.includes(to) &&
    compatibleShape(level, from) === compatibleShape(level, to);
}

export function validateLevel(level: LevelDefinition): void {
  if (!integer(level.width, 1, 13) || !integer(level.height, 1, 13)) throw new Error('Invalid board dimensions');
  const size = level.geometry ? level.solvedTileColors.length : level.width * level.height;
  if (!integer(size, 2, 169) || level.startTileAtPosition.length !== size || level.solvedTileColors.length !== size) throw new Error('Invalid board size');
  if ((level.contentVersion === PILOT_CONTENT_VERSION) !== !!level.geometry) throw new Error('Invalid geometry version');
  if (level.solvedTileColors.some(color => !/^#[0-9A-Fa-f]{6}$/.test(color))) throw new Error('Invalid RGB');
  validatePermutation(level.startTileAtPosition, level.pinnedPositions);
  if (level.positions && (level.positions.length !== size || !level.positions.every(validPosition) ||
      !respectsShapes(level, level.startTileAtPosition))) throw new Error('Invalid tile positions');
  if (level.geometry) {
    const positions = level.positions;
    if (level.startRecipe || !validGeometryIdentity(level.geometry) || !positions?.every(validOrientedPosition) ||
        new Set(positions.map(position => position.center!.join(','))).size !== size ||
        geometryColors(positions, level.geometry.corners).some((colour, index) => colour !== level.solvedTileColors[index])) {
      throw new Error('Invalid versioned geometry');
    }
  }
  const movableColors = level.solvedTileColors.filter((_, position) => !level.pinnedPositions.includes(position));
  if (movableColors.length < 2 || new Set(movableColors.map(color => color.toUpperCase())).size !== movableColors.length) {
    throw new Error('Invalid movable colors');
  }
  if (minimumSwaps(level.startTileAtPosition, level.pinnedPositions) !== level.minimumSwaps || level.minimumSwaps < 1) {
    throw new Error('Invalid start minimum');
  }
}

export function createAttempt(level: LevelDefinition, attemptId: string): Attempt {
  validateLevel(level);
  if (!attemptId) throw new Error('Missing attempt ID');
  const generated = level.geometry ? {
    version: GEOMETRY_START_VERSION, mode: 'group-cycle' as const,
    seed: geometrySeed(attemptId), work: geometryWorkPayload(level.geometry, level.width, level.height, level.positions!, level.pinnedPositions),
  } as const : level.startRecipe;
  const board = level.geometry
    ? geometryStart(level.positions!, level.pinnedPositions, generated!.seed) : [...level.startTileAtPosition];
  return {
    schemaVersion: 1, rulesVersion: RULES_VERSION, contentVersion: level.contentVersion ?? CONTENT_VERSION,
    levelId: level.id, attemptId, board,
    moves: 0, assisted: false, assistsUsed: 0, completed: false,
    ...(generated ? { generatedStart: { ...generated, board: [...board] } } : {}),
  };
}

export function validateAttempt(level: LevelDefinition, attempt: Attempt): void {
  if (attempt.schemaVersion !== 1 || attempt.rulesVersion !== RULES_VERSION || attempt.contentVersion !== (level.contentVersion ?? CONTENT_VERSION) ||
      attempt.levelId !== level.id || typeof attempt.attemptId !== 'string' || !attempt.attemptId ||
      attempt.board.length !== level.solvedTileColors.length ||
      !integer(attempt.moves, 0, Number.MAX_SAFE_INTEGER) || !integer(attempt.assistsUsed, 0, Number.MAX_SAFE_INTEGER) ||
      typeof attempt.assisted !== 'boolean' || typeof attempt.completed !== 'boolean' ||
      attempt.assisted !== (attempt.assistsUsed > 0) ||
      attempt.completed !== attempt.board.every((id, position) => id === position) ||
      (attempt.completed && attempt.moves < level.minimumSwaps)) {
    throw new Error('Invalid saved attempt');
  }
  validatePermutation(attempt.board, level.pinnedPositions);
  if (!respectsShapes(level, attempt.board)) throw new Error('Incompatible tiles in saved field');
  const generated = attempt.generatedStart, recipe = level.startRecipe;
  if (level.geometry) {
    const seed = geometrySeed(attempt.attemptId);
    if (generated?.version !== GEOMETRY_START_VERSION || generated.seed !== seed ||
        generated.work !== geometryWorkPayload(level.geometry, level.width, level.height, level.positions!, level.pinnedPositions) || generated.mode !== 'group-cycle' || !Array.isArray(generated.board) ||
        generated.board.length !== attempt.board.length ||
        geometryStart(level.positions!, level.pinnedPositions, seed).some((tile, position) =>
          tile !== generated.board[position] || attempt.moves === 0 && tile !== attempt.board[position])) {
      throw new Error('Invalid saved geometry start');
    }
    return;
  }
  if (recipe ? !generated || recipe.version !== generated.version || recipe.seed !== generated.seed ||
      recipe.mode !== generated.mode || !Array.isArray(generated.board) ||
      generated.board.length !== level.startTileAtPosition.length ||
      generated.board.some((tile, position) => tile !== level.startTileAtPosition[position]) : !!generated) {
    throw new Error('Invalid generated start');
  }
}

/** Returns a proposed next value. Only the local transaction may accept it. */
export function proposeSwap(level: LevelDefinition, attempt: Attempt, from: number, to: number): Attempt {
  validateAttempt(level, attempt);
  if (attempt.completed || !canSwap(level, from, to)) return attempt;
  if (attempt.moves === Number.MAX_SAFE_INTEGER) throw new Error('Move counter overflow');
  const board = [...attempt.board];
  [board[from], board[to]] = [board[to]!, board[from]!];
  return { ...attempt, board, moves: attempt.moves + 1, completed: board.every((id, position) => id === position) };
}

/** Call once for a new help opening, and persist before revealing its solution. */
export function proposeHelp(attempt: Attempt): Attempt {
  if (attempt.completed) return attempt;
  if (!integer(attempt.assistsUsed, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error('Assist counter overflow');
  return { ...attempt, assisted: true, assistsUsed: attempt.assistsUsed + 1 };
}

export function pulsePosition(level: LevelDefinition, attempt: Attempt, scanFrom: number): number | null {
  if (!integer(scanFrom, 0, attempt.board.length - 1)) throw new Error('Invalid hint start');
  for (let offset = 0; offset < attempt.board.length; offset++) {
    const index = (scanFrom + offset) % attempt.board.length;
    if (attempt.board[index] !== index && !level.pinnedPositions.includes(index)) return index;
  }
  return null;
}

export function autoHelpSwap(level: LevelDefinition, attempt: Attempt): { from: number; to: number } | null {
  let to = -1, greatestDistance = -1;
  for (let index = 0; index < attempt.board.length; index++) {
    if (attempt.board[index] === index || level.pinnedPositions.includes(index)) continue;
    const distance = (2 * (index % level.width) - level.width + 1) ** 2
      + (2 * Math.floor(index / level.width) - level.height + 1) ** 2;
    if (distance > greatestDistance) { greatestDistance = distance; to = index; }
  }
  return to === -1 ? null : { from: to, to: attempt.board.indexOf(to) };
}

export function proposeAssistance(level: LevelDefinition, attempt: Attempt, request: Assistance = { kind: 'preview' }): Attempt {
  validateAttempt(level, attempt);
  if (attempt.completed) return attempt;
  if (request.kind === 'pulse' && pulsePosition(level, attempt, request.scanFrom) === null) return attempt;
  if (request.kind !== 'auto') return proposeHelp(attempt);
  const pair = autoHelpSwap(level, attempt);
  if (!pair) return attempt;
  if (attempt.moves > Number.MAX_SAFE_INTEGER - AUTO_HELP_COST) throw new Error('Move counter overflow');
  const swapped = proposeSwap(level, attempt, pair.from, pair.to);
  return { ...proposeHelp(attempt), board: swapped.board, completed: swapped.completed, moves: attempt.moves + AUTO_HELP_COST };
}
