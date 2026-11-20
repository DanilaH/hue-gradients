import { chapters, getLevel, levels } from './levels';
import { chapterCount, chapterIsOpen } from './progression';
import { RULES_VERSION, type Attempt, type LevelDefinition } from './puzzle';
import type { Workspace } from './workspace';

export const MASTERY_THRESHOLDS = [2, 5, 10, 20, 50, 100, 150, 200, 250, 300] as const;

interface ScoreReference {
  readonly version: string;
  readonly source: string;
  readonly sampleSize: number;
  readonly mean: number;
}

export interface PublishedBenchmark extends ScoreReference {
  readonly levelId: string;
  readonly fingerprint: string;
  readonly rulesVersion: typeof RULES_VERSION;
}

export interface CampaignVictory {
  readonly attemptId: string;
  readonly levelId: string;
  readonly fingerprint: string;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly moves: number;
  readonly assisted: boolean;
  readonly reference?: ScoreReference;
}

/** Entries require a measured, published sample for this exact start and ruleset. */
export const PUBLISHED_BENCHMARKS: readonly PublishedBenchmark[] = [];

function validReference(reference: ScoreReference, level: LevelDefinition): boolean {
  return !!reference && typeof reference.version === 'string' && reference.version.trim().length > 0
    && typeof reference.source === 'string' && reference.source.trim().length > 0
    && Number.isSafeInteger(reference.sampleSize) && reference.sampleSize > 0
    && Number.isFinite(reference.mean) && reference.mean >= level.minimumSwaps;
}

export function publishedBenchmark(level: LevelDefinition, fingerprint: string | undefined,
  benchmarks: readonly PublishedBenchmark[] = PUBLISHED_BENCHMARKS): PublishedBenchmark | undefined {
  return benchmarks.find(row => row.levelId === level.id && row.fingerprint === fingerprint
    && row.rulesVersion === RULES_VERSION && validReference(row, level));
}

export function campaignVictory(attempt: Attempt, fingerprint: string, benchmark?: ScoreReference): CampaignVictory {
  const { attemptId, levelId, rulesVersion, moves, assisted } = attempt;
  const reference = !assisted && benchmark ? {
    version: benchmark.version, source: benchmark.source, sampleSize: benchmark.sampleSize, mean: benchmark.mean,
  } : undefined;
  return { attemptId, levelId, fingerprint, rulesVersion, moves, assisted, ...(reference ? { reference } : {}) };
}

/** Old snapshots can prove their still-saved finishes, but a best alone cannot prove a particular run. */
export function campaignVictories(state: Pick<Workspace, 'attempts' | 'bests' | 'victories'>): readonly CampaignVictory[] {
  if (state.victories) return state.victories;
  return Object.values(state.attempts).flatMap(attempt => {
    const best = state.bests[attempt.levelId];
    return attempt.completed && best ? [campaignVictory(attempt, best.fingerprint)] : [];
  });
}

export function validateCampaignVictories(state: Workspace, fingerprints: ReadonlyMap<string, string>): void {
  if (state.victories === undefined) return;
  if (!Array.isArray(state.victories)) throw new Error('Invalid campaign history');
  const attempts = new Set<string>(), completed = new Set(state.completed);
  for (const victory of state.victories) {
    if (!victory || typeof victory.attemptId !== 'string' || !victory.attemptId ||
        attempts.has(victory.attemptId) || !completed.has(victory.levelId)) throw new Error('Invalid campaign victory');
    const level = getLevel(victory.levelId);
    const record = state.bests[level.id]!;
    const best = (victory.assisted ? record.assisted : record.clean);
    if (victory.fingerprint !== fingerprints.get(level.id) || victory.rulesVersion !== RULES_VERSION ||
        typeof victory.assisted !== 'boolean' || !Number.isSafeInteger(victory.moves) ||
        victory.moves < level.minimumSwaps || best === null || victory.moves < best ||
        (victory.reference !== undefined && (victory.assisted || !validReference(victory.reference, level)))) {
      throw new Error('Invalid campaign victory');
    }
    attempts.add(victory.attemptId);
  }
}

export function campaignProgress(state: Workspace) {
  const victories = campaignVictories(state);
  let compared = 0, better = 0;
  for (const victory of victories) {
    if (!victory.reference) continue;
    compared++;
    if (victory.moves < victory.reference.mean) better++;
  }
  const sets = chapters.map((chapter, index) => {
    const complete = state.rights.includes(`chapter-complete:${chapter.id}`);
    return {
      title: `Глава ${index + 1}`, count: chapterCount(state, index), total: chapter.levelIds.length,
      open: chapterIsOpen(state, index), complete,
      lastOrdinary: state.completed.includes(chapter.levelIds.at(-1)!),
      finale: state.challengeProgress?.best[`finale-v1-${index + 1}`] !== undefined,
    };
  });
  const perfect = levels.filter(level => state.bests[level.id]?.clean === level.minimumSwaps).length;
  return {
    sets, complete: sets.every(set => set.complete), xp: state.completed.length, perfect, compared, better, victories,
  };
}
