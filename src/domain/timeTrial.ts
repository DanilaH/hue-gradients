import { challenges } from './challenges';
import { createAttempt, proposeSwap, validateAttempt, type Attempt, type LevelDefinition } from './puzzle';
import { timedField } from './timedFields';

export const TIME_TRIAL_MS = 10 * 60 * 1000;
const bank = challenges.slice(0, 6).map((entry, index) => Object.freeze({
  ...entry.level, id: `timed-v1-${index + 1}`, title: `Поле ${index + 1}`,
}));
const legacyField = (round: number) => bank[round % bank.length]!;
const attemptKey = (id: string, round: number) => `${id}:${round}`;

interface TimedRun {
  readonly id: string;
  readonly cleared: number;
  readonly remainingMs: number;
  readonly startedAt: number | null;
  readonly attempt: Attempt;
  readonly field?: LevelDefinition;
}
export interface TimedProgress {
  readonly active: boolean;
  readonly best: number;
  readonly finished: number;
  readonly run: TimedRun;
}
export type TimedAction =
  | { kind: 'timed-open'; id: string; now: number }
  | { kind: 'timed-pause'; now: number }
  | { kind: 'timed-resume'; now: number }
  | { kind: 'timed-leave'; now: number }
  | { kind: 'timed-expire'; now: number }
  | { kind: 'timed-swap'; from: number; to: number; attemptId: string; now: number };

const safeCounter = (n: number) => Number.isSafeInteger(n) && n >= 0;
const definition = (run: TimedRun) => run.field ?? legacyField(run.cleared);

export function timedRemaining(run: Pick<TimedRun, 'remainingMs' | 'startedAt'>, now: number): number {
  return Math.max(0, run.remainingMs - (run.startedAt === null ? 0 : Math.max(0, now - run.startedAt)));
}
export function activeTimed(progress?: TimedProgress) {
  return progress?.active ? { ...progress, level: definition(progress.run) } : null;
}
function settleClock(progress: TimedProgress, now: number, active: boolean): TimedProgress {
  const { run } = progress;
  const remainingMs = timedRemaining(run, now);
  const justFinished = remainingMs === 0 && run.remainingMs > 0;
  return { active, best: justFinished ? Math.max(progress.best, run.cleared) : progress.best,
    finished: progress.finished + Number(justFinished), run: { ...run, remainingMs, startedAt: null } };
}

export function applyTimed(progress: TimedProgress | undefined, action: TimedAction): TimedProgress | undefined {
  if (!safeCounter(action.now)) return progress;
  if (action.kind === 'timed-open') {
    if (progress?.active) return progress;
    if (progress && progress.run.remainingMs > 0) return { ...progress, active: true, run: { ...progress.run, startedAt: action.now } };
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(action.id) || progress?.run.id === action.id) return progress;
    const field = timedField(action.id, 0);
    return { active: true, best: progress?.best ?? 0, finished: progress?.finished ?? 0, run: {
      id: action.id, cleared: 0, remainingMs: TIME_TRIAL_MS, startedAt: action.now,
      field, attempt: createAttempt(field, attemptKey(action.id, 0)),
    } };
  }
  if (!progress?.active) return progress;
  const { run } = progress;
  if (action.kind === 'timed-leave') return settleClock(progress, action.now, false);
  if (run.remainingMs === 0) return progress;
  if (action.kind === 'timed-resume') {
    return run.startedAt !== null ? progress : { ...progress, run: { ...run, startedAt: action.now } };
  }
  if (run.startedAt === null) return progress;
  const remainingMs = timedRemaining(run, action.now);
  if (remainingMs === 0 || action.kind === 'timed-pause') return settleClock(progress, action.now, true);
  if (action.kind !== 'timed-swap' || action.attemptId !== run.attempt.attemptId) return progress;
  const attempt = proposeSwap(definition(run), run.attempt, action.from, action.to);
  if (attempt === run.attempt) return progress;
  const checkpoint = { ...run, remainingMs, startedAt: action.now };
  if (!attempt.completed) return { ...progress, run: { ...checkpoint, attempt } };
  const cleared = run.cleared + 1;
  const field = run.field ? timedField(run.id, cleared) : legacyField(cleared);
  return { ...progress, run: { ...checkpoint, cleared, ...(run.field ? { field } : {}),
    attempt: createAttempt(field, attemptKey(run.id, cleared)) } };
}

export function validateTimedProgress(progress: TimedProgress): void {
  const run = progress?.run;
  if (!run || typeof progress.active !== 'boolean' || !safeCounter(progress.best) || !safeCounter(progress.finished) ||
      typeof run.id !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(run.id) || !safeCounter(run.cleared) ||
      !safeCounter(run.remainingMs) || run.remainingMs > TIME_TRIAL_MS ||
      (run.startedAt !== null && (!progress.active || run.remainingMs === 0 || !safeCounter(run.startedAt))) ||
      (run.remainingMs === 0 && (progress.finished === 0 || progress.best < run.cleared)) ||
      !run.attempt || run.attempt.attemptId !== attemptKey(run.id, run.cleared) || run.attempt.completed || run.attempt.assisted) {
    throw new Error('Invalid timed trial');
  }
  if (run.field && JSON.stringify(run.field) !== JSON.stringify(timedField(run.id, run.cleared))) throw new Error('Invalid timed field');
  validateAttempt(definition(run), run.attempt);
}
