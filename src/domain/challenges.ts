import { chapters, getLevel } from './levels';
import { geometryLevels } from './shapeLevels';
import { CHALLENGE_CONTENT_VERSION, createAttempt, minimumSwaps, proposeSwap, validateAttempt, validateLevel,
  type Attempt, type LevelDefinition } from './puzzle';

interface ChallengeDefinition {
  readonly level: LevelDefinition;
  readonly requiredWorks: number;
  readonly moveLimit: number;
  readonly chapterIndex?: number;
  readonly afterFinaleId?: string;
}

// Original starts for Poluson. The first pair shares dimensions, pins, palette, minimum and limit.
const authored = [
  { palette: 9, requiredWorks: 5, cycles: [[1, 2, 5, 6, 9]], spare: 2 },
  { palette: 9, requiredWorks: 10, cycles: [[1, 2, 5], [6, 9, 10]], spare: 2 },
  { palette: 11, requiredWorks: 15, cycles: [[1, 16, 8, 23], [3, 21, 6, 19]], spare: 2 },
  { palette: 15, requiredWorks: 20, cycles: [[1, 13, 5, 22, 11, 16], [2, 8, 19]], spare: 2 },
  { palette: 25, requiredWorks: 25, cycles: [[6, 13, 17, 8], [7, 16, 11, 18, 12]], spare: 2 },
  { palette: 30, requiredWorks: 30, cycles: [[1, 21, 6, 3, 15, 11], [2, 17, 7, 22, 20], [4, 10, 16]], spare: 2 },
  { palette: 43, requiredWorks: 35, cycles: [[5, 10], [6, 9]], spare: 1 },
  { palette: 52, requiredWorks: 40, cycles: [[2, 8, 17, 10, 22, 5, 14, 19], [1, 11, 15, 7, 21, 18]], spare: 2 },
  { palette: 52, requiredWorks: 50, cycles: [[2, 5, 14, 1, 13, 21, 8, 11, 15], [3, 6, 9, 10, 17, 23], [7, 22, 16, 19]], spare: 2 },
  { palette: 60, requiredWorks: 60, cycles: [[1, 15, 19, 3, 8, 26, 6, 27, 12, 22], [2, 17, 28, 10, 21, 13, 16, 4], [7, 25, 11, 23, 9, 14, 20, 18]], spare: 2 },
] as const;

export const challenges: readonly ChallengeDefinition[] = Object.freeze(authored.map(({ palette, requiredWorks, cycles, spare }, index) => {
  const source = getLevel(`gradient-${String(palette).padStart(3, '0')}`);
  const order = source.solvedTileColors.map((_, position) => position);
  const involved = cycles.flatMap(cycle => [...cycle]);
  if (new Set(involved).size !== involved.length || involved.some(p => source.pinnedPositions.includes(p) || p < 0 || p >= order.length)) {
    throw new Error('Invalid challenge cycle');
  }
  for (const cycle of cycles) cycle.forEach((position, i) => { order[position] = cycle[(i + 1) % cycle.length]!; });
  const level = Object.freeze({
    ...source, id: `challenge-v1-${index + 1}`, ordinal: index + 1, title: `Испытание ${index + 1}`,
    contentVersion: CHALLENGE_CONTENT_VERSION, startTileAtPosition: Object.freeze(order),
    minimumSwaps: minimumSwaps(order, source.pinnedPositions),
  });
  validateLevel(level);
  return Object.freeze({ level, requiredWorks, moveLimit: level.minimumSwaps + spare });
}));

export const chapterChallenges: readonly ChallengeDefinition[] = Object.freeze(chapters.flatMap((chapter, index) => {
  const number = index + 1;
  const finaleId = `finale-v1-${number}`;
  const make = (id: string, title: string, sourceId: string, afterFinaleId?: string): ChallengeDefinition => {
    const source = getLevel(sourceId);
    const order = source.startTileAtPosition.map((_, position, board) => board.indexOf(position));
    const level = Object.freeze({ ...source, id, title, ordinal: number,
      contentVersion: CHALLENGE_CONTENT_VERSION, startTileAtPosition: Object.freeze(order) });
    validateLevel(level);
    return Object.freeze({ level, chapterIndex: index, requiredWorks: chapter.levelIds.length,
      moveLimit: level.minimumSwaps + 3, ...(afterFinaleId ? { afterFinaleId } : {}) });
  };
  return [make(finaleId, `Финал главы ${number}`, chapter.levelIds.at(-1)!),
    make(`secret-v1-${number}`, `Секретное поле ${number}`, chapter.levelIds[10]!, finaleId)];
}));

export interface ChallengeProgress {
  readonly active: string | null;
  readonly attempts: Readonly<Record<string, Attempt>>;
  readonly best: Readonly<Record<string, number>>;
}

export type ChallengeAction =
  | { kind: 'challenge-open'; id: string; attemptId: string }
  | { kind: 'challenge-restart'; id: string; attemptId: string }
  | { kind: 'challenge-swap'; from: number; to: number; attemptId: string }
  | { kind: 'challenge-leave' };

export const geometryChallenges: readonly ChallengeDefinition[] = Object.freeze(geometryLevels.map(level =>
  Object.freeze({ level, requiredWorks: 0, moveLimit: level.minimumSwaps + 3 })));
const allChallenges = [...challenges, ...chapterChallenges, ...geometryChallenges];
const entry = (id: string | null): ChallengeDefinition | undefined => allChallenges.find(item => item.level.id === id);

export function challengeAvailable(definition: ChallengeDefinition, completed: readonly string[], progress?: ChallengeProgress): boolean {
  if (definition.afterFinaleId) return progress?.best[definition.afterFinaleId] !== undefined;
  if (definition.chapterIndex !== undefined) return chapters[definition.chapterIndex]!.levelIds.every(id => completed.includes(id));
  return completed.length >= definition.requiredWorks;
}

export function challengeStatus(definition: ChallengeDefinition, attempt: Attempt): 'playing' | 'won' | 'lost' {
  if (attempt.completed) return 'won';
  return attempt.moves < definition.moveLimit ? 'playing' : 'lost';
}

export function activeChallenge(progress: ChallengeProgress | undefined) {
  const item = progress && entry(progress.active);
  if (!item) return null;
  const attempt = progress!.attempts[item.level.id]!;
  return { ...item, attempt, status: challengeStatus(item, attempt) };
}

const empty: ChallengeProgress = { active: null, attempts: {}, best: {} };

export function applyChallenge(progress: ChallengeProgress | undefined, completed: readonly string[], action: ChallengeAction): ChallengeProgress | undefined {
  const state = progress ?? empty;
  if (action.kind === 'challenge-leave') return state.active === null ? progress : { ...state, active: null };
  if (action.kind === 'challenge-swap') {
    const active = activeChallenge(state);
    if (!active || active.status !== 'playing' || active.attempt.attemptId !== action.attemptId) return progress;
    const { level, attempt } = active;
    const next = proposeSwap(level, attempt, action.from, action.to);
    if (next === attempt) return progress;
    const best = next.completed && (state.best[level.id] === undefined || next.moves < state.best[level.id]!)
      ? { ...state.best, [level.id]: next.moves } : state.best;
    return { ...state, attempts: { ...state.attempts, [level.id]: next }, best };
  }
  const definition = entry(action.id);
  if (!definition || !challengeAvailable(definition, completed, progress)) return progress;
  const saved = state.attempts[action.id];
  if (action.kind === 'challenge-open' && saved) {
    return state.active === action.id ? progress : { ...state, active: action.id };
  }
  if (!action.attemptId || Object.values(state.attempts).some(attempt => attempt.attemptId === action.attemptId)) return progress;
  const attempt = createAttempt(definition.level, action.attemptId);
  return { ...state, active: action.id, attempts: { ...state.attempts, [action.id]: attempt } };
}

export function validateChallengeProgress(progress: ChallengeProgress, completed: readonly string[]): void {
  if (!progress || !progress.attempts || typeof progress.attempts !== 'object' || Array.isArray(progress.attempts) ||
      !progress.best || typeof progress.best !== 'object' || Array.isArray(progress.best) ||
      (progress.active !== null && (!entry(progress.active) || !progress.attempts[progress.active]))) {
    throw new Error('Invalid challenge workspace');
  }
  const attempts = new Set<string>();
  for (const [id, attempt] of Object.entries(progress.attempts)) {
    const definition = entry(id);
    if (!definition || !challengeAvailable(definition, completed, progress) || !attempt || attempt.assisted ||
        attempt.moves > definition.moveLimit || attempts.has(attempt.attemptId)) throw new Error('Invalid challenge attempt');
    validateAttempt(definition.level, attempt);
    if (attempt.completed && !(progress.best[id] !== undefined && progress.best[id]! <= attempt.moves)) {
      throw new Error('Challenge best missing from completed attempt');
    }
    attempts.add(attempt.attemptId);
  }
  for (const [id, moves] of Object.entries(progress.best)) {
    const definition = entry(id);
    if (!definition || !progress.attempts[id] || !Number.isSafeInteger(moves) || moves < definition.level.minimumSwaps ||
        moves > definition.moveLimit) throw new Error('Invalid challenge best');
  }
}
