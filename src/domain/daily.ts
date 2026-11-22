import { isCalendarDay } from '@danilah/mini-games-kit/core';
import { DAILY_CONTENT_VERSION, createAttempt, proposeSwap, validateAttempt, validateLevel,
  type Attempt, type LevelDefinition } from './puzzle';

interface DailyEntry {
  readonly date: string;
  readonly level: LevelDefinition;
  readonly feature?: { readonly id: string; readonly title: string };
}
interface DailySlot extends DailyEntry {
  readonly source: string;
  readonly version: string;
}
/** Supplied by a host with an independently verified clock and a published catalog. */
export interface DailyFeed {
  readonly source: string;
  readonly version: string;
  readonly verifiedNowMs: number;
  readonly days: readonly DailyEntry[];
}
export interface DailyProgress {
  readonly through: string;
  readonly slots: Readonly<Record<string, DailySlot>>;
  readonly active: string | null;
  readonly entry?: 'daily' | 'books';
  readonly attempts: Readonly<Record<string, Attempt>>;
  readonly solved: readonly string[];
}
export type DailyAction =
  | { kind: 'daily-cache'; feed: DailyFeed }
  | { kind: 'daily-open'; date: string; attemptId: string; replay: boolean; entry?: 'daily' | 'books' }
  | { kind: 'daily-swap'; from: number; to: number; attemptId: string }
  | { kind: 'daily-leave' };

const named = (value: unknown) => typeof value === 'string' && !!value.trim();
const validFeature = (entry: DailyEntry) => entry.feature === undefined || !!entry.feature && named(entry.feature.id) && named(entry.feature.title);

export function validateDailyFeed(feed: DailyFeed): string {
  if (!feed || !named(feed.source) || !named(feed.version) || !Number.isSafeInteger(feed.verifiedNowMs) ||
      feed.verifiedNowMs < 0 || !Array.isArray(feed.days)) throw new Error('Invalid daily catalog');
  const cutoff = new Date(feed.verifiedNowMs).toISOString().slice(0, 10);
  if (!isCalendarDay(cutoff)) throw new Error('Invalid trusted calendar date');
  const seen = new Set<string>();
  for (const day of feed.days) {
    if (!day || !isCalendarDay(day.date) || seen.has(day.date) || !day.level ||
        day.level.contentVersion !== DAILY_CONTENT_VERSION || !validFeature(day)) throw new Error('Invalid daily slot');
    validateLevel(day.level);
    seen.add(day.date);
  }
  return cutoff;
}

export function activeDaily(progress?: DailyProgress) {
  if (!progress?.active) return null;
  const slot = progress.slots[progress.active]!;
  return { ...slot, attempt: progress.attempts[slot.date]!, entry: progress.entry ?? (slot.feature ? 'books' : 'daily') };
}

export function applyDaily(progress: DailyProgress | undefined, action: DailyAction): DailyProgress | undefined {
  if (action.kind === 'daily-cache') {
    const { feed } = action;
    const cutoff = validateDailyFeed(feed);
    if (progress && cutoff < progress.through) return progress;
    const slots = { ...progress?.slots };
    let changed = !progress || cutoff !== progress.through;
    for (const day of feed.days) {
      if (day.date > cutoff || slots[day.date]) continue;
      slots[day.date] = { ...day, source: feed.source, version: feed.version };
      changed = true;
    }
    return changed ? { ...progress, through: cutoff, slots, active: progress?.active ?? null, attempts: progress?.attempts ?? {},
      solved: progress?.solved ?? [] } : progress;
  }
  if (!progress) return progress;
  if (action.kind === 'daily-leave') {
    if (!progress.active) return progress;
    const { entry, ...cached } = progress;
    return { ...cached, active: null };
  }
  if (action.kind === 'daily-open') {
    const slot = progress.slots[action.date];
    if (!slot || slot.date !== action.date || action.date > progress.through) return progress;
    const saved = progress.attempts[slot.date];
    const entry = action.entry ?? (slot.feature ? 'books' : 'daily');
    if (saved && !action.replay) return progress.active === slot.date && progress.entry === entry
      ? progress : { ...progress, active: slot.date, entry };
    if (!action.attemptId || Object.values(progress.attempts).some(a => a.attemptId === action.attemptId)) return progress;
    return { ...progress, active: slot.date, entry,
      attempts: { ...progress.attempts, [slot.date]: createAttempt(slot.level, action.attemptId) } };
  }
  const active = activeDaily(progress);
  if (!active || active.attempt.attemptId !== action.attemptId) return progress;
  const next = proposeSwap(active.level, active.attempt, action.from, action.to);
  if (next === active.attempt) return progress;
  return { ...progress, attempts: { ...progress.attempts, [active.date]: next },
    solved: next.completed && !progress.solved.includes(active.date) ? [...progress.solved, active.date] : progress.solved };
}

export function validateDailyProgress(progress: DailyProgress): void {
  if (!progress || !isCalendarDay(progress.through) || !progress.slots || !progress.attempts ||
      typeof progress.slots !== 'object' || typeof progress.attempts !== 'object' ||
      Array.isArray(progress.slots) || Array.isArray(progress.attempts) ||
      !Array.isArray(progress.solved) || new Set(progress.solved).size !== progress.solved.length ||
      (progress.entry !== undefined && (progress.active === null || (progress.entry !== 'daily' && progress.entry !== 'books'))) ||
      (progress.active !== null && (!progress.slots[progress.active] || !progress.attempts[progress.active]))) {
    throw new Error('Invalid daily save');
  }
  for (const [date, slot] of Object.entries(progress.slots)) {
    if (!slot || date !== slot.date || !isCalendarDay(date) || date > progress.through ||
        !named(slot.source) || !named(slot.version) || slot.level.contentVersion !== DAILY_CONTENT_VERSION || !validFeature(slot)) throw new Error('Invalid cached daily slot');
    validateLevel(slot.level);
  }
  const attemptIds = new Set<string>();
  for (const [date, attempt] of Object.entries(progress.attempts)) {
    const slot = progress.slots[date];
    if (!slot || !attempt || attempt.assisted || attemptIds.has(attempt.attemptId) ||
        (attempt.completed && !progress.solved.includes(date))) throw new Error('Invalid daily attempt');
    validateAttempt(slot.level, attempt);
    attemptIds.add(attempt.attemptId);
  }
  if (progress.solved.some(date => !isCalendarDay(date) || !progress.attempts[date])) throw new Error('Invalid daily history');
}
