import { canonicalJson, fingerprintPayload } from './workspace';
import { createAttempt, proposeAssistance, proposeSwap, RULES_VERSION, type Assistance, type LevelDefinition } from './puzzle';
import { hashText } from '../local-store/command';

export type ReplayMove = { kind: 'swap'; from: number; to: number } | { kind: 'help'; assistance: Assistance };
export interface ReplayProof {
  readonly eventId: string;
  readonly attemptId: string;
  readonly definition: string;
  readonly rules: typeof RULES_VERSION;
  readonly helpRules: 'free-help-1' | 'no-help-1';
  readonly startedFrom: string;
  readonly assisted: boolean;
  readonly moves: number;
  readonly elapsedMs: number;
  readonly replay: readonly ReplayMove[];
}
export interface ValidatedReplay extends ReplayProof {
  readonly comparisonKey: string;
}

const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,180}$/.test(value);

export async function replayDefinition(level: LevelDefinition): Promise<{ definition: string; startedFrom: string }> {
  return {
    definition: await hashText(level.positions ? canonicalJson({ base: fingerprintPayload(level), positions: level.positions }) : fingerprintPayload(level)),
    startedFrom: await hashText(canonicalJson({ board: level.startTileAtPosition, version: level.contentVersion ?? 'gradient-prototype-0.1',
      generator: level.startRecipe ?? null })),
  };
}

export async function verifyReplay(level: LevelDefinition, proof: ReplayProof): Promise<ValidatedReplay> {
  const { definition, startedFrom } = await replayDefinition(level);
  if (!proof || !id(proof.eventId) || !id(proof.attemptId) || proof.definition !== definition || proof.startedFrom !== startedFrom ||
      proof.rules !== RULES_VERSION || !['free-help-1', 'no-help-1'].includes(proof.helpRules) ||
      typeof proof.assisted !== 'boolean' || !Number.isSafeInteger(proof.moves) || proof.moves < level.minimumSwaps ||
      !Number.isSafeInteger(proof.elapsedMs) || proof.elapsedMs < 0 || !Array.isArray(proof.replay)) {
    throw new Error('Incompatible replay');
  }
  let attempt = createAttempt(level, proof.attemptId);
  for (const step of proof.replay) {
    const next = step.kind === 'swap' ? proposeSwap(level, attempt, step.from, step.to)
      : step.kind === 'help' && proof.helpRules === 'free-help-1' && ['preview','pulse','auto'].includes(step.assistance?.kind)
        ? proposeAssistance(level, attempt, step.assistance) : attempt;
    if (next === attempt) throw new Error('Replay step was not accepted');
    attempt = next;
  }
  if (!attempt.completed || attempt.moves !== proof.moves || attempt.assisted !== proof.assisted) throw new Error('Replay result mismatch');
  return { ...proof, definition, startedFrom,
    comparisonKey: [definition, startedFrom, proof.rules, proof.helpRules, String(proof.assisted)].join(':') };
}

export function addReplay(rows: readonly ValidatedReplay[], replay: ValidatedReplay): readonly ValidatedReplay[] {
  const prior = rows.find(row => row.eventId === replay.eventId || row.attemptId === replay.attemptId);
  if (!prior) return [...rows, replay];
  if (canonicalJson(prior) !== canonicalJson(replay)) throw new Error('Result identity already used');
  return rows;
}

export function rankReplays(rows: readonly ValidatedReplay[], comparisonKey: string): readonly ValidatedReplay[] {
  return rows.filter(row => row.comparisonKey === comparisonKey).sort((a, b) =>
    a.moves - b.moves || a.elapsedMs - b.elapsedMs || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
}
