import { calendarDayIndex, isCalendarDay, pickWeighted } from '@danilah/mini-games-kit/core';
import { chapters, getLevel, levels } from './levels';
import { chapterIndexFor, chapterIsOpen, levelIsOpen } from './progression';
import { chapterChallenges, challengeAvailable } from './challenges';
import { createAttempt, proposeSwap, validateAttempt, type Attempt, type LevelDefinition } from './puzzle';
import { timedRemaining } from './timeTrial';
import type { Workspace } from './workspace';

export const TASK_KINDS = ['past', 'present', 'future'] as const;
export type TaskKind = typeof TASK_KINDS[number];
const taskNames: Record<TaskKind, string> = { past: 'Улучшить рекорд', present: 'Успеть по времени', future: 'Сложное поле' };
export function personalTaskName(task: Pick<Task, 'kind' | 'repeatRecord'>): string {
  return task.repeatRecord ? 'Повторить рекорд' : taskNames[task.kind];
}
interface Task {
  readonly kind: TaskKind;
  readonly date: string;
  readonly levelId: string;
  readonly limit?: number;
  readonly repeatRecord?: true;
  readonly durationMs?: number;
  readonly attempt?: Attempt;
  readonly clock?: { readonly remainingMs: number; readonly startedAt: number | null };
}
export interface PersonalProgress {
  readonly policy: 'personal-v1' | 'personal-v2';
  readonly day: string;
  readonly tasks: Readonly<Record<string, Task>>;
  readonly active: string | null;
  readonly earned: readonly string[];
}
export type PersonalAction =
  | { kind: 'personal-issue'; day: string }
  | { kind: 'personal-open'; key: string; attemptId: string; restart: boolean; now: number }
  | { kind: 'personal-leave'; now: number }
  | { kind: 'personal-pause'; now: number }
  | { kind: 'personal-resume'; now: number }
  | { kind: 'personal-expire'; now: number }
  | { kind: 'personal-swap'; from: number; to: number; attemptId: string; now: number };

export const taskKey = (day: string, kind: TaskKind) => `${day}:${kind}`;
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const best = (state: Workspace, id: string) => state.bests[id]?.clean ?? state.bests[id]?.assisted;

const finales = chapterChallenges.filter(challenge => !challenge.afterFinaleId);
export function personalLevel(id: string): LevelDefinition {
  return finales.find(challenge => challenge.level.id === id)?.level ?? getLevel(id);
}

function difficulty(level: LevelDefinition): number {
  return level.minimumSwaps + (level.solvedTileColors.length - level.pinnedPositions.length) / 6;
}

export function personalDuration(level: LevelDefinition): number {
  const movable = level.solvedTileColors.length - level.pinnedPositions.length;
  const secondsPerSwap = finales.some(item => item.level.id === level.id) ? 6 : 3;
  return Math.max(15, 10 + level.minimumSwaps * secondsPerSwap + Math.ceil(movable / 3)) * 1_000;
}

function issue(state: Workspace, day: string): PersonalProgress | undefined {
  const previous = state.personalProgress;
  if (!isCalendarDay(day)) return previous;
  const tasks = { ...previous?.tasks };
  const used = new Set(TASK_KINDS.flatMap(kind => tasks[taskKey(day, kind)]?.levelId ?? []));
  const recent = Object.values(tasks).filter(task => task.date < day).sort((a, b) => b.date.localeCompare(a.date));
  const pick = (kind: TaskKind, candidates: readonly string[]): string | undefined => {
    const available = candidates.filter(id => !used.has(id));
    if (!available.length) return undefined;
    const lastUse = new Map<string, string>();
    for (const task of recent) {
      if (task.kind === kind && !lastUse.has(task.levelId)) lastUse.set(task.levelId, task.date);
    }
    const earliestUse = available.reduce((earliest, id) => {
      const last = lastUse.get(id) ?? '';
      return last < earliest ? last : earliest;
    }, day);
    const pool = available.filter(id => (lastUse.get(id) ?? '') === earliestUse).slice(0, 4);
    const seed = Math.imul(calendarDayIndex(day) + TASK_KINDS.indexOf(kind) * 103, 0x9e3779b9) >>> 0;
    return pickWeighted(pool.map((value, index) => ({ value, weight: pool.length - index })), {
      next: () => seed / 0x100000000,
    });
  };
  const completed = new Set(state.completed);
  const currentChapter = chapterIndexFor(state.activeLevelId);
  const upcoming = chapters.find((_, index) => !chapterIsOpen(state, index));
  const future = (upcoming ? upcoming.levelIds.map(getLevel) : levels)
    .filter(level => !completed.has(level.id)).sort((a, b) => difficulty(b) - difficulty(a));
  const firstFinales = finales.filter(challenge => challengeAvailable(challenge, state) &&
    !recent.some(task => task.kind === 'present' && task.levelId === challenge.level.id));
  // A personal preview can use nearby campaign fields without unlocking their campaign entries.
  const present = levels.filter(level => levelIsOpen(state, level.id) || chapters[currentChapter]!.levelIds.slice(0, 6).includes(level.id))
    .sort((a, b) => Number(completed.has(a.id)) - Number(completed.has(b.id)));
  const options: Record<TaskKind, readonly string[]> = {
    past: [...state.completed].reverse().filter(id => best(state, id) != null),
    present: firstFinales.length ? firstFinales.map(challenge => challenge.level.id) : present.map(level => level.id),
    future: future.map(level => level.id),
  };
  let changed = previous?.day !== day;
  for (const kind of ['past', 'future', 'present'] as const) {
    const key = taskKey(day, kind);
    if (tasks[key]) continue;
    const levelId = pick(kind, options[kind]);
    if (!levelId) continue;
    const base = { kind, date: day, levelId };
    const level = personalLevel(levelId);
    if (kind === 'past') {
      const record = best(state, levelId)!;
      const repeat = record === level.minimumSwaps;
      tasks[key] = { ...base, limit: repeat ? record : record - 1, ...(repeat ? { repeatRecord: true } : {}) };
    } else tasks[key] = kind === 'present' ? { ...base, durationMs: personalDuration(level) } : base;
    used.add(levelId);
    changed = true;
  }
  return changed ? { policy: 'personal-v2', tasks, day, active: previous?.active ?? null, earned: previous?.earned ?? [] } : previous;
}
export function taskStatus(task: Task): 'playing' | 'won' | 'lost' {
  if (task.attempt?.completed) return 'won';
  return task.clock?.remainingMs === 0 || task.limit !== undefined && (task.attempt?.moves ?? 0) >= task.limit ? 'lost' : 'playing';
}
export function activePersonal(progress?: PersonalProgress) {
  if (!progress?.active) return null;
  const task = progress.tasks[progress.active]!;
  return { ...task, key: progress.active, level: personalLevel(task.levelId), attempt: task.attempt!,
    status: taskStatus(task) };
}

export function applyPersonal(state: Workspace, action: PersonalAction): PersonalProgress | undefined {
  if (action.kind === 'personal-issue') return issue(state, action.day);
  const progress = state.personalProgress;
  if (!progress || !count(action.now)) return progress;
  if (action.kind === 'personal-open') {
    const task = progress.tasks[action.key];
    if (!task || !action.attemptId) return progress;
    if (progress.active === action.key && !action.restart && task.attempt) return progress;
    const fresh = !task.attempt || action.restart || taskStatus(task) !== 'playing';
    const attempt = fresh ? createAttempt(personalLevel(task.levelId), action.attemptId) : task.attempt!;
    const clock = task.durationMs === undefined ? undefined
      : { remainingMs: fresh ? task.durationMs : task.clock!.remainingMs, startedAt: action.now };
    return { ...progress, active: action.key, tasks: { ...progress.tasks, [action.key]: {
      ...task, attempt, ...(clock ? { clock } : {}),
    } } };
  }
  const key = progress.active;
  if (!key) return progress;
  const task = progress.tasks[key]!;
  const clock = task.clock;
  const patch = (task: Task, active: string | null = key, earned = progress.earned) =>
    ({ ...progress, active, earned, tasks: { ...progress.tasks, [key]: task } });
  if (action.kind === 'personal-leave') {
    return patch(clock ? { ...task, clock: { remainingMs: timedRemaining(clock, action.now), startedAt: null } } : task, null);
  }
  if (taskStatus(task) !== 'playing') return progress;
  const remaining = clock ? timedRemaining(clock, action.now) : undefined;
  if (clock && remaining !== undefined) {
    if (remaining === 0 || action.kind === 'personal-pause' && clock.startedAt !== null) {
      return patch({ ...task, clock: { remainingMs: remaining, startedAt: null } });
    }
    if (action.kind === 'personal-resume' && clock.startedAt === null) return patch({ ...task, clock: { ...clock, startedAt: action.now } });
    if (clock.startedAt === null) return progress;
  }
  if (action.kind !== 'personal-swap' || action.attemptId !== task.attempt?.attemptId) return progress;
  const attempt = proposeSwap(personalLevel(task.levelId), task.attempt, action.from, action.to);
  if (attempt === task.attempt) return progress;
  return patch({ ...task, attempt, ...(remaining !== undefined ? { clock: { remainingMs: remaining, startedAt: attempt.completed ? null : action.now } } : {}) },
    key, attempt.completed && !progress.earned.includes(key) ? [...progress.earned, key] : progress.earned);
}
export function validatePersonal(progress: PersonalProgress): void {
  if (!progress || (progress.policy !== 'personal-v1' && progress.policy !== 'personal-v2') || !isCalendarDay(progress.day) || !progress.tasks || typeof progress.tasks !== 'object' ||
      Array.isArray(progress.tasks) || !Array.isArray(progress.earned) || new Set(progress.earned).size !== progress.earned.length ||
      (progress.active !== null && !progress.tasks[progress.active]?.attempt)) throw new Error('Invalid personal assignments');
  for (const [key, task] of Object.entries(progress.tasks)) {
    if (!task || !TASK_KINDS.includes(task.kind) || !isCalendarDay(task.date) ||
        taskKey(task.date, task.kind) !== key) throw new Error('Invalid personal assignment');
    const level = personalLevel(task.levelId);
    if (task.kind !== 'present' && finales.some(item => item.level.id === task.levelId) ||
        task.repeatRecord !== undefined && (task.repeatRecord !== true || task.kind !== 'past' || task.limit !== level.minimumSwaps)) {
      throw new Error('Invalid personal goal');
    }
    if (task.kind === 'past' ? !count(task.limit) || task.limit < level.minimumSwaps : task.limit !== undefined) {
      throw new Error('Invalid personal record target');
    }
    if (task.kind === 'present' ? !count(task.durationMs) || !task.durationMs || !!task.attempt !== !!task.clock
      : task.durationMs !== undefined || task.clock !== undefined) throw new Error('Invalid personal timer');
    if (task.clock && (!count(task.clock.remainingMs) || task.clock.remainingMs > task.durationMs! ||
        task.clock.startedAt !== null && (!count(task.clock.startedAt) || key !== progress.active || task.attempt?.completed))) {
      throw new Error('Invalid persisted personal clock');
    }
    if (task.attempt) {
      validateAttempt(level, task.attempt);
      if (task.attempt.assisted || task.limit !== undefined && task.attempt.moves > task.limit ||
          task.attempt.completed && !progress.earned.includes(key)) throw new Error('Invalid personal attempt');
    }
  }
  if (progress.earned.some(key => !progress.tasks[key]?.attempt)) throw new Error('Invalid local task reward');
}
