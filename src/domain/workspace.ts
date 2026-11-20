import { CAMPAIGN_CONTENT_VERSION, CONTENT_VERSION, createAttempt, proposeAssistance, proposeSwap, RULES_VERSION, validateAttempt, validateLevel, type Assistance, type Attempt, type ContentVersion, type LevelDefinition } from './puzzle';
import { getLevel, levels } from './levels';
import { earnedRights, isKnownRight, levelIsOpen, META_POLICY } from './progression';
import { initialCreative, validateCreative, type CreativeState } from './creative';
import { applyChallenge, validateChallengeProgress, type ChallengeAction, type ChallengeProgress } from './challenges';
import { applyDaily, validateDailyProgress, type DailyAction, type DailyProgress } from './daily';
import { applyTimed, validateTimedProgress, type TimedAction, type TimedProgress } from './timeTrial';
import { campaignVictories, campaignVictory, publishedBenchmark, validateCampaignVictories, type CampaignVictory, type PublishedBenchmark } from './playerProgress';

export interface Best { fingerprint: string; rulesVersion: typeof RULES_VERSION; clean: number | null; assisted: number | null }
export interface Preferences { sound: boolean; haptics: boolean; motion: boolean; statistics: boolean }
export const DEFAULT_PREFERENCES: Readonly<Preferences> = { sound: true, haptics: true, motion: true, statistics: true };
export interface AlbumCopy {
  schemaVersion: 1; draftId: string; workId: string; nodeId: string; parentNodeIds: readonly string[];
  name: string; fingerprint: string; rulesVersion: typeof RULES_VERSION;
  provenance: { kind: 'campaign'; levelId: string; fingerprint: string };
  snapshot: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors' | 'pinnedPositions' | 'startTileAtPosition' | 'minimumSwaps'>;
  authorCompletions: readonly string[];
}
export interface Workspace {
  schemaVersion: 1;
  contentVersion: ContentVersion;
  policyVersion: 'm1-local-1' | typeof META_POLICY.version;
  activeLevelId: string; attempts: Record<string, Attempt>; completed: string[]; bests: Record<string, Best>; rights: string[];
  onboarding: { version: 1; firstSwapDone: boolean; pinExplained: boolean; earlyPinTaps?: number };
  quarantine: { levelId: string; rawAttempt: string }[];
  preferences: Preferences;
  /** Absent in snapshots saved before campaign history. */
  victories?: readonly CampaignVictory[];
  challengeProgress?: ChallengeProgress;
  timedProgress?: TimedProgress;
  dailyProgress?: DailyProgress;
  albumCopies: Record<string, AlbumCopy>;
  /** Absent only in pre-editor saves; Session backs up and migrates before use. */
  creative?: CreativeState;
  lastCompletion: { attemptId: string; levelId: string; newRights: string[] } | null;
}
export type Action = ChallengeAction | DailyAction | TimedAction | { kind: 'swap'; from: number; to: number; attemptId: string } |
  { kind: 'help'; attemptId: string; assistance?: Assistance } | { kind: 'pin' } |
  { kind: 'preferences'; key: keyof Preferences; value: boolean } |
  { kind: 'copy'; levelId: string; draftId: string; workId: string; nodeId: string; name: string } |
  { kind: 'open'; levelId: string; attemptId: string } | { kind: 'restart'; levelId: string; attemptId: string };

export function newWorkspace(attemptId: string): Workspace {
  const level = levels[0]!;
  return { schemaVersion: 1, contentVersion: CAMPAIGN_CONTENT_VERSION, policyVersion: META_POLICY.version, activeLevelId: level.id,
    attempts: { [level.id]: createAttempt(level, attemptId) }, completed: [], bests: {}, rights: ['chapter-open:chapter-01'],
    onboarding: { version: 1, firstSwapDone: false, pinExplained: false }, quarantine: [], preferences: { ...DEFAULT_PREFERENCES }, victories: [], albumCopies: {}, creative: initialCreative({}), lastCompletion: null };
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
/** Does not mutate/persist during decode. Session commits this upgrade and its backup before exposing awards. */
export function upgradeWorkspace(state: Workspace, fingerprints: ReadonlyMap<string, string>): Workspace {
  if (state.policyVersion === META_POLICY.version && state.creative) return state;
  const upgraded: Workspace = state.policyVersion === META_POLICY.version ? state : { ...state, contentVersion: CAMPAIGN_CONTENT_VERSION, policyVersion: META_POLICY.version,
    rights: earnedRights(state, fingerprints), albumCopies: {}, lastCompletion: null };
  return { ...upgraded, creative: initialCreative(upgraded.albumCopies) };
}
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(id);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Only a corrupt attempt is quarantined. Unsupported profile/schema never becomes empty progress. */
export function decodeWorkspace(json: string, fingerprints: ReadonlyMap<string, string>): Workspace {
  const state = JSON.parse(json) as Workspace;
  if (!state || state.schemaVersion !== 1 || ![CONTENT_VERSION, CAMPAIGN_CONTENT_VERSION].includes(state.contentVersion) ||
      !['m1-local-1', META_POLICY.version].includes(state.policyVersion) || !record(state.attempts) || !record(state.bests) ||
      !state.onboarding || state.onboarding.version !== 1 || typeof state.onboarding.firstSwapDone !== 'boolean' || typeof state.onboarding.pinExplained !== 'boolean' ||
      !Array.isArray(state.completed) || !Array.isArray(state.rights) || !Array.isArray(state.quarantine)) throw new Error('Unsupported or damaged profile');
  const legacy = state.policyVersion === 'm1-local-1';
  if (state.onboarding.earlyPinTaps !== undefined &&
      ![1, 2, 3].includes(state.onboarding.earlyPinTaps)) throw new Error('Invalid pin tutorial progress');
  getLevel(state.activeLevelId);
  if (!Object.hasOwn(state, 'preferences')) state.preferences = { ...DEFAULT_PREFERENCES };
  if (!record(state.preferences)) throw new Error('Invalid saved preferences');
  if (!Object.hasOwn(state.preferences, 'statistics')) state.preferences.statistics = DEFAULT_PREFERENCES.statistics;
  if (Object.keys(DEFAULT_PREFERENCES).some(key => typeof state.preferences[key as keyof Preferences] !== 'boolean')) throw new Error('Invalid saved preferences');
  for (const list of [state.completed, state.rights]) if (new Set(list).size !== list.length || list.some(id => typeof id !== 'string')) throw new Error('Invalid saved progress');
  for (const id of state.completed) getLevel(id);
  if (state.rights.some(id => !isKnownRight(id)) || state.completed.some(id => !state.rights.includes(`clean-export:${id}`))) throw new Error('Invalid earned rights');
  if (legacy && state.rights.some(id => !state.completed.some(level => id === `clean-export:${level}`))) throw new Error('Invalid legacy rights');
  for (const [id, best] of Object.entries(state.bests)) {
    getLevel(id);
    const valid = (n: unknown) => n === null || (Number.isSafeInteger(n) && (n as number) >= getLevel(id).minimumSwaps);
    if (!best || best.fingerprint !== fingerprints.get(id) || best.rulesVersion !== RULES_VERSION || !valid(best.clean) || !valid(best.assisted) ||
        (best.clean === null && best.assisted === null) || !state.completed.includes(id)) throw new Error('Invalid saved best');
  }
  if (state.completed.some(id => !state.bests[id])) throw new Error('Missing completion best');
  if (!legacy && earnedRights(state, fingerprints).some(id => !state.rights.includes(id))) throw new Error('Missing committed reward');
  for (const row of state.quarantine) { if (!row || typeof row.rawAttempt !== 'string') throw new Error('Invalid recovery archive'); getLevel(row.levelId); }
  for (const [id, attempt] of Object.entries(state.attempts)) {
    const level = getLevel(id);
    try { validateAttempt(level, attempt); if (attempt.completed && !state.completed.includes(id)) throw new Error('Completion facts missing'); }
    catch { state.quarantine.push({ levelId: id, rawAttempt: JSON.stringify(attempt) }); delete state.attempts[id]; }
  }
  if (!Object.hasOwn(state, 'victories')) state.victories = campaignVictories(state);
  validateCampaignVictories(state, fingerprints);
  if (state.dailyProgress !== undefined) validateDailyProgress(state.dailyProgress);
  if (state.timedProgress !== undefined) validateTimedProgress(state.timedProgress);
  if (state.challengeProgress !== undefined) validateChallengeProgress(state.challengeProgress, state.completed);
  if (legacy) { state.albumCopies = {}; state.lastCompletion = null; }
  else {
    if (!record(state.albumCopies)) throw new Error('Invalid saved copies');
    const identities = new Set<string>();
    for (const [id, copy] of Object.entries(state.albumCopies)) {
      if (!copy || copy.schemaVersion !== 1 || copy.draftId !== id || ![copy.draftId, copy.workId, copy.nodeId].every(safeId) ||
          typeof copy.name !== 'string' || !copy.name.trim() || [...copy.name].length > 80 || copy.rulesVersion !== RULES_VERSION ||
          !Array.isArray(copy.parentNodeIds) || copy.parentNodeIds.length || !Array.isArray(copy.authorCompletions) || copy.authorCompletions.length ||
          copy.provenance?.kind !== 'campaign' || !state.completed.includes(copy.provenance.levelId) ||
          copy.fingerprint !== fingerprints.get(copy.provenance.levelId) || copy.provenance.fingerprint !== copy.fingerprint) throw new Error('Invalid copied work');
      for (const key of [copy.draftId, copy.workId, copy.nodeId]) { if (identities.has(key)) throw new Error('Duplicate copy identity'); identities.add(key); }
      const source = getLevel(copy.provenance.levelId);
      validateLevel({ ...copy.snapshot, id: copy.workId, ordinal: 0, title: copy.name });
      if (fingerprintPayload({ ...copy.snapshot, id: copy.workId, ordinal: 0, title: copy.name }) !== fingerprintPayload(source)) throw new Error('Copied snapshot changed');
    }
    const receipt = state.lastCompletion;
    if (receipt !== null && (!receipt || !safeId(receipt.attemptId) || !state.completed.includes(receipt.levelId) ||
        !Array.isArray(receipt.newRights) || new Set(receipt.newRights).size !== receipt.newRights.length ||
        receipt.newRights.some(id => !state.rights.includes(id)))) throw new Error('Invalid reward receipt');
  }
  if (Object.hasOwn(state, 'creative')) {
    validateCreative(state.creative!);
    for (const copy of Object.values(state.albumCopies)) {
      const work = state.creative!.works[copy.workId], node = work?.nodes[copy.nodeId];
      if (!work || work.draftId !== copy.draftId || work.provenance.kind !== 'campaign' || work.provenance.levelId !== copy.provenance.levelId || !node || node.fingerprint !== copy.fingerprint ||
          fingerprintPayload({ ...node.field, id: work.workId, ordinal: 0, title: work.name, minimumSwaps: copy.snapshot.minimumSwaps }) !== fingerprintPayload({ ...copy.snapshot, id: work.workId, ordinal: 0, title: copy.name })) throw new Error('Missing original copied revision');
    }
  }
  const modes = [state.timedProgress?.active, state.challengeProgress?.active, state.creative?.playing, state.dailyProgress?.active];
  if (modes.filter(Boolean).length > 1) throw new Error('Conflicting active game modes');
  return state;
}

export function applyAction(state: Workspace, action: Action, fingerprints: ReadonlyMap<string, string>,
  benchmarks?: readonly PublishedBenchmark[]): Workspace {
  if (action.kind === 'daily-cache' || action.kind === 'daily-open' || action.kind === 'daily-swap' || action.kind === 'daily-leave') {
    if (action.kind === 'daily-open' && (state.challengeProgress?.active || state.timedProgress?.active || state.creative?.playing)) return state;
    const dailyProgress = applyDaily(state.dailyProgress, action);
    return !dailyProgress || dailyProgress === state.dailyProgress ? state : { ...state, dailyProgress };
  }
  if (action.kind === 'timed-open' || action.kind === 'timed-pause' || action.kind === 'timed-resume' ||
      action.kind === 'timed-leave' || action.kind === 'timed-expire' || action.kind === 'timed-swap') {
    if (state.challengeProgress?.active || state.creative?.playing || state.dailyProgress?.active) return state;
    const timedProgress = applyTimed(state.timedProgress, action);
    return !timedProgress || timedProgress === state.timedProgress ? state : { ...state, timedProgress };
  }
  if (action.kind === 'challenge-open' || action.kind === 'challenge-restart' ||
      action.kind === 'challenge-swap' || action.kind === 'challenge-leave') {
    if (state.timedProgress?.active || state.dailyProgress?.active) return state;
    const challengeProgress = applyChallenge(state.challengeProgress, state.completed, action);
    return !challengeProgress || challengeProgress === state.challengeProgress ? state : { ...state, challengeProgress };
  }
  if (action.kind === 'preferences') {
    if (!Object.hasOwn(DEFAULT_PREFERENCES, action.key) || typeof action.value !== 'boolean' || state.preferences[action.key] === action.value) return state;
    return { ...state, preferences: { ...state.preferences, [action.key]: action.value } };
  }
  if (action.kind === 'copy') {
    if (!state.completed.includes(action.levelId) || state.albumCopies[action.draftId]) return state;
    if (![action.draftId, action.workId, action.nodeId].every(safeId) || new Set([action.draftId, action.workId, action.nodeId]).size !== 3) throw new Error('Invalid copy identity');
    const existingIds = Object.values(state.albumCopies).flatMap(c => [c.draftId, c.workId, c.nodeId]);
    existingIds.push(...Object.values(state.creative?.works ?? {}).flatMap(w => [w.draftId, w.workId, ...Object.keys(w.nodes), ...Object.keys(w.buffers)]));
    if ([action.draftId, action.workId, action.nodeId].some(id => existingIds.includes(id))) throw new Error('Copy identity collision');
    const source = getLevel(action.levelId), name = action.name.trim() || 'Моя композиция';
    if ([...name].length > 80) throw new Error('Copy name too long');
    const copy: AlbumCopy = { schemaVersion: 1, draftId: action.draftId, workId: action.workId, nodeId: action.nodeId, parentNodeIds: [],
      name, fingerprint: fingerprints.get(source.id)!, rulesVersion: RULES_VERSION, provenance: { kind: 'campaign', levelId: source.id, fingerprint: fingerprints.get(source.id)! },
      snapshot: { width: source.width, height: source.height, solvedTileColors: [...source.solvedTileColors], pinnedPositions: [...source.pinnedPositions], startTileAtPosition: [...source.startTileAtPosition], minimumSwaps: source.minimumSwaps }, authorCompletions: [] };
    const creative = state.creative ?? initialCreative(state.albumCopies), copiedWork = initialCreative({ [copy.draftId]: copy }).works;
    const nextCreative = { ...creative, works: { ...creative.works, ...copiedWork } }; validateCreative(nextCreative);
    return { ...state, albumCopies: { ...state.albumCopies, [copy.draftId]: copy }, creative: nextCreative };
  }
  const level = getLevel(state.activeLevelId), attempt = state.attempts[level.id];
  if (action.kind === 'open' || action.kind === 'restart') {
    const target = getLevel(action.levelId);
    if (!levelIsOpen(state, target.id)) return state;
    const create = action.kind === 'restart' || !state.attempts[target.id];
    if (create && (Object.values(state.attempts).some(candidate => candidate.attemptId === action.attemptId)
        || campaignVictories(state).some(victory => victory.attemptId === action.attemptId))) return state;
    const next = create ? createAttempt(target, action.attemptId) : state.attempts[target.id]!;
    if (state.activeLevelId === target.id && next === attempt) return state;
    return { ...state, activeLevelId: target.id, attempts: { ...state.attempts, [target.id]: next }, victories: campaignVictories(state) };
  }
  if (action.kind === 'pin') {
    const taps = state.onboarding.earlyPinTaps ?? Number(state.onboarding.pinExplained);
    if (level.ordinal > 10 || taps >= 3) {
      return state.onboarding.pinExplained ? state : { ...state, onboarding: { ...state.onboarding, pinExplained: true } };
    }
    return { ...state, onboarding: { ...state.onboarding, pinExplained: true, earlyPinTaps: taps + 1 } };
  }
  if (!attempt || attempt.attemptId !== action.attemptId) return state;
  const next = action.kind === 'swap' ? proposeSwap(level, attempt, action.from, action.to) : proposeAssistance(level, attempt, action.assistance);
  if (next === attempt) return state;
  const result: Workspace = { ...state, attempts: { ...state.attempts, [level.id]: next }, onboarding: { ...state.onboarding, firstSwapDone: state.onboarding.firstSwapDone || next.moves !== attempt.moves } };
  if (next.completed) {
    const previous = state.bests[level.id] ?? { fingerprint: fingerprints.get(level.id)!, rulesVersion: RULES_VERSION, clean: null, assisted: null };
    const category = next.assisted ? 'assisted' : 'clean';
    result.bests = { ...state.bests, [level.id]: { ...previous, [category]: Math.min(previous[category] ?? Infinity, next.moves) } };
    if (!state.completed.includes(level.id)) result.completed = [...state.completed, level.id];
    const history = campaignVictories(state);
    const reference = state.preferences.statistics ? publishedBenchmark(level, previous.fingerprint, benchmarks) : undefined;
    if (!history.some(victory => victory.attemptId === next.attemptId)) {
      result.victories = [...history, campaignVictory(next, previous.fingerprint, reference)];
    }
    result.rights = earnedRights(result, fingerprints);
    result.lastCompletion = { attemptId: next.attemptId, levelId: level.id, newRights: result.rights.filter(id => !state.rights.includes(id)) };
  }
  return result;
}
