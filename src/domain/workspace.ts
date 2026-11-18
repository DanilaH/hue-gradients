import { createAttempt, proposeHelp, proposeSwap, RULES_VERSION, validateAttempt, type Attempt, type LevelDefinition } from './puzzle';
import { getLevel, levels } from './levels';

export interface Best { fingerprint: string; rulesVersion: typeof RULES_VERSION; clean: number | null; assisted: number | null }
export interface Preferences { sound: boolean; haptics: boolean; motion: boolean }
export const DEFAULT_PREFERENCES: Readonly<Preferences> = { sound: true, haptics: true, motion: true };
export interface Workspace {
  schemaVersion: 1;
  contentVersion: 'gradient-prototype-0.1';
  policyVersion: 'm1-local-1';
  activeLevelId: string;
  attempts: Record<string, Attempt>;
  completed: string[];
  bests: Record<string, Best>;
  rights: string[];
  onboarding: { version: 1; firstSwapDone: boolean; pinExplained: boolean };
  quarantine: { levelId: string; rawAttempt: string }[];
  preferences: Preferences;
}
export type Action = { kind: 'swap'; from: number; to: number; attemptId: string } |
  { kind: 'help'; attemptId: string } | { kind: 'pin' } |
  { kind: 'preferences'; key: keyof Preferences; value: boolean } |
  { kind: 'open'; levelId: string; attemptId: string } | { kind: 'restart'; levelId: string; attemptId: string };

export function newWorkspace(attemptId: string): Workspace {
  const level = levels[0]!;
  return { schemaVersion: 1, contentVersion: 'gradient-prototype-0.1', policyVersion: 'm1-local-1', activeLevelId: level.id,
    attempts: { [level.id]: createAttempt(level, attemptId) }, completed: [], bests: {}, rights: [],
    onboarding: { version: 1, firstSwapDone: false, pinExplained: false }, quarantine: [], preferences: { ...DEFAULT_PREFERENCES } };
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(o[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function fingerprintPayload(level: LevelDefinition): string {
  return canonicalJson({ width: level.width, height: level.height, solvedTileColors: level.solvedTileColors.map(c => c.toUpperCase()),
    pinnedPositions: [...level.pinnedPositions].sort((a, b) => a - b), startTileAtPosition: level.startTileAtPosition });
}

/** Only the corrupt attempt is quarantined. Unknown profile/schema never becomes an empty profile. */
export function decodeWorkspace(json: string, fingerprints: ReadonlyMap<string, string>): Workspace {
  const state = JSON.parse(json) as Workspace;
  if (!state || state.schemaVersion !== 1 || state.contentVersion !== 'gradient-prototype-0.1' || state.policyVersion !== 'm1-local-1' ||
      !state.attempts || typeof state.attempts !== 'object' || Array.isArray(state.attempts) ||
      !state.bests || typeof state.bests !== 'object' || Array.isArray(state.bests) ||
      !state.onboarding || state.onboarding.version !== 1 || typeof state.onboarding.firstSwapDone !== 'boolean' || typeof state.onboarding.pinExplained !== 'boolean' ||
      !Array.isArray(state.completed) || !Array.isArray(state.rights) || !Array.isArray(state.quarantine)) throw new Error('Unsupported or damaged profile');
  getLevel(state.activeLevelId);
  // Additive schema-1 extension: old snapshots remain valid; existing fields are never reset.
  if (!Object.hasOwn(state, 'preferences')) state.preferences = { ...DEFAULT_PREFERENCES };
  if (!state.preferences || Object.keys(DEFAULT_PREFERENCES).some(key => typeof state.preferences[key as keyof Preferences] !== 'boolean')) throw new Error('Invalid saved preferences');
  for (const list of [state.completed, state.rights]) {
    if (new Set(list).size !== list.length || list.some(id => typeof id !== 'string')) throw new Error('Invalid saved progress');
  }
  for (const id of state.completed) getLevel(id);
  if (state.rights.some(id => !state.completed.some(level => id === `clean-export:${level}`)) ||
      state.completed.some(id => !state.rights.includes(`clean-export:${id}`))) throw new Error('Invalid earned rights');
  for (const [id, best] of Object.entries(state.bests)) {
    getLevel(id);
    const valid = (n: unknown) => n === null || (Number.isSafeInteger(n) && (n as number) >= getLevel(id).minimumSwaps);
    if (!best || best.fingerprint !== fingerprints.get(id) || best.rulesVersion !== RULES_VERSION || !valid(best.clean) || !valid(best.assisted) ||
        (best.clean === null && best.assisted === null) || !state.completed.includes(id)) throw new Error('Invalid saved best');
  }
  if (state.completed.some(id => !state.bests[id])) throw new Error('Missing completion best');
  for (const row of state.quarantine) {
    if (!row || typeof row.rawAttempt !== 'string') throw new Error('Invalid recovery archive');
    getLevel(row.levelId);
  }
  for (const [id, attempt] of Object.entries(state.attempts)) {
    const level = getLevel(id);
    try {
      validateAttempt(level, attempt);
      if (attempt.completed && !state.completed.includes(id)) throw new Error('Completion facts missing');
    } catch {
      state.quarantine.push({ levelId: id, rawAttempt: JSON.stringify(attempt) });
      delete state.attempts[id];
    }
  }
  return state;
}

export function applyAction(state: Workspace, action: Action, fingerprints: ReadonlyMap<string, string>): Workspace {
  if (action.kind === 'preferences') {
    if (!Object.hasOwn(DEFAULT_PREFERENCES, action.key) || typeof action.value !== 'boolean' || state.preferences[action.key] === action.value) return state;
    return { ...state, preferences: { ...state.preferences, [action.key]: action.value } };
  }
  const level = getLevel(state.activeLevelId), attempt = state.attempts[level.id];
  if (action.kind === 'open' || action.kind === 'restart') {
    const target = getLevel(action.levelId);
    if (action.kind === 'open' && target.ordinal > 1 && !state.completed.includes(levels[target.ordinal - 2]!.id)) return state;
    const next = action.kind === 'restart' || !state.attempts[target.id] ? createAttempt(target, action.attemptId) : state.attempts[target.id]!;
    if (state.activeLevelId === target.id && next === attempt) return state;
    return { ...state, activeLevelId: target.id, attempts: { ...state.attempts, [target.id]: next } };
  }
  if (action.kind === 'pin') return state.onboarding.pinExplained ? state : { ...state, onboarding: { ...state.onboarding, pinExplained: true } };
  if (!attempt || attempt.attemptId !== action.attemptId) return state;
  const next = action.kind === 'swap' ? proposeSwap(level, attempt, action.from, action.to) : proposeHelp(attempt);
  if (next === attempt) return state;
  const result: Workspace = { ...state, attempts: { ...state.attempts, [level.id]: next },
    onboarding: { ...state.onboarding, firstSwapDone: state.onboarding.firstSwapDone || action.kind === 'swap' } };
  if (next.completed) {
    const previous = state.bests[level.id] ?? { fingerprint: fingerprints.get(level.id)!, rulesVersion: RULES_VERSION, clean: null, assisted: null };
    const category = next.assisted ? 'assisted' : 'clean';
    result.bests = { ...state.bests, [level.id]: { ...previous, [category]: Math.min(previous[category] ?? Infinity, next.moves) } };
    if (!state.completed.includes(level.id)) result.completed = [...state.completed, level.id];
    const right = `clean-export:${level.id}`;
    if (!state.rights.includes(right)) result.rights = [...state.rights, right];
  }
  return result;
}
