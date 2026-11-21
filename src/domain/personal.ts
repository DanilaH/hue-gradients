import { isCalendarDay } from '@danilah/mini-games-kit/core';
import { chapters, getLevel, levels } from './levels';
import { chapterIsOpen, levelIsOpen } from './progression';
import { createAttempt, proposeSwap, validateAttempt, type Attempt } from './puzzle';
import { timedRemaining } from './timeTrial';
import type { Workspace } from './workspace';

export const TASK_KINDS = ['past', 'present', 'future'] as const;
export type TaskKind = typeof TASK_KINDS[number];
export const taskNames: Record<TaskKind, string> = { past: 'Улучшить рекорд', present: 'Успеть по времени', future: 'Будущая глава' };
interface Task {
  readonly kind: TaskKind;
  readonly date: string;
  readonly levelId: string;
  readonly limit?: number;
  readonly durationMs?: number;
  readonly attempt?: Attempt;
  readonly clock?: { readonly remainingMs: number; readonly startedAt: number | null };
}
export interface PersonalProgress {
  readonly policy: 'personal-v1';
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

function issue(state: Workspace, day: string): PersonalProgress | undefined {
  const previous = state.personalProgress;
  if (!isCalendarDay(day) || previous && previous.day > day) return previous;
  const tasks = { ...previous?.tasks };
  const used = new Set(TASK_KINDS.flatMap(kind => tasks[taskKey(day, kind)]?.levelId ?? []));
  const recent = Object.values(tasks).sort((a, b) => b.date.localeCompare(a.date));
  const pick = (kind: TaskKind, candidates: readonly string[]): string | undefined => {
    const available = candidates.filter(id => !used.has(id));
    const last = recent.find(task => task.kind === kind && task.date < day)?.levelId;
    return available.find(id => id !== last) ?? available[0];
  };
  const options: Record<TaskKind, readonly string[]> = {
    past: [...state.completed].reverse().filter(id => (best(state, id) ?? 0) > getLevel(id).minimumSwaps),
    present: levels.filter(level => levelIsOpen(state, level.id))
      .sort((a, b) => Number(state.completed.includes(a.id)) - Number(state.completed.includes(b.id))).map(level => level.id),
    future: chapters.flatMap((chapter, i) => chapterIsOpen(state, i) ? [] : chapter.levelIds).slice(0, 15),
  };
  let changed = previous?.day !== day;
  for (const kind of TASK_KINDS) {
    const key = taskKey(day, kind);
    if (tasks[key]) continue;
    const levelId = pick(kind, options[kind]);
    if (!levelId) continue;
    const base = { kind, date: day, levelId };
    tasks[key] = kind === 'past' ? { ...base, limit: best(state, levelId)! - 1 }
      : kind === 'present' ? { ...base, durationMs: Math.max(45_000, getLevel(levelId).minimumSwaps * 9_000) }
      : base;
    used.add(levelId);
    changed = true;
  }
  return changed ? { policy: 'personal-v1', tasks, day, active: previous?.active ?? null, earned: previous?.earned ?? [] } : previous;
}
export function taskStatus(task: Task): 'playing' | 'won' | 'lost' {
  if (task.attempt?.completed) return 'won';
  return task.clock?.remainingMs === 0 || task.limit !== undefined && (task.attempt?.moves ?? 0) >= task.limit ? 'lost' : 'playing';
}
export function activePersonal(progress?: PersonalProgress) {
  if (!progress?.active) return null;
  const task = progress.tasks[progress.active]!;
  return { ...task, key: progress.active, level: getLevel(task.levelId), attempt: task.attempt!,
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
    const attempt = fresh ? createAttempt(getLevel(task.levelId), action.attemptId) : task.attempt!;
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
  const attempt = proposeSwap(getLevel(task.levelId), task.attempt, action.from, action.to);
  if (attempt === task.attempt) return progress;
  return patch({ ...task, attempt, ...(remaining !== undefined ? { clock: { remainingMs: remaining, startedAt: attempt.completed ? null : action.now } } : {}) },
    key, attempt.completed && !progress.earned.includes(key) ? [...progress.earned, key] : progress.earned);
}
export function validatePersonal(progress: PersonalProgress): void {
  if (!progress || progress.policy !== 'personal-v1' || !isCalendarDay(progress.day) || !progress.tasks || typeof progress.tasks !== 'object' ||
      Array.isArray(progress.tasks) || !Array.isArray(progress.earned) || new Set(progress.earned).size !== progress.earned.length ||
      (progress.active !== null && !progress.tasks[progress.active]?.attempt)) throw new Error('Invalid personal assignments');
  for (const [key, task] of Object.entries(progress.tasks)) {
    if (!task || !TASK_KINDS.includes(task.kind) || !isCalendarDay(task.date) || task.date > progress.day ||
        taskKey(task.date, task.kind) !== key) throw new Error('Invalid personal assignment');
    const level = getLevel(task.levelId);
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
