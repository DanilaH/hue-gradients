import type { Workspace } from '../domain/workspace';
import { activeTimed } from '../domain/timeTrial';
import { activeChallenge } from '../domain/challenges';
import { activeDaily } from '../domain/daily';
import { activePersonal } from '../domain/personal';
import { authorView } from '../domain/creative';

type Mode = 'campaign' | 'author' | 'challenge' | 'daily' | 'timed' | 'personal';
export interface InputIntent {
  readonly kind: 'swap-intent';
  readonly mode: Mode;
}
export interface CommittedInput {
  readonly kind: 'swap-accepted' | 'help-accepted';
  readonly mode: Mode;
  readonly chargedMoves: number;
}

export function gameMode(state: Workspace): Mode {
  return state.personalProgress?.active ? 'personal' : state.dailyProgress?.active ? 'daily' : state.timedProgress?.active
    ? 'timed' : state.challengeProgress?.active ? 'challenge' : state.creative?.playing ? 'author' : 'campaign';
}
function attempt(state: Workspace, mode: Mode) {
  switch (mode) {
    case 'author': return state.creative ? authorView(state.creative)?.attempt : undefined;
    case 'challenge': return activeChallenge(state.challengeProgress)?.attempt;
    case 'daily': return activeDaily(state.dailyProgress)?.attempt;
    case 'personal': return activePersonal(state.personalProgress)?.attempt;
    case 'timed': return activeTimed(state.timedProgress)?.run.attempt;
    case 'campaign': return state.attempts[state.activeLevelId];
  }
}

/** Invoked after an action produced a new committed candidate. No account names, palettes or boards are emitted. */
export function acceptedInput(kind: string, previous: Workspace | undefined, next: Workspace): CommittedInput | undefined {
  const swap = kind === 'swap' || kind.endsWith('-swap');
  const help = kind === 'help' || kind === 'author-help';
  if (!previous || !swap && !help) return undefined;
  const mode = gameMode(previous), before = attempt(previous, mode), after = attempt(next, mode);
  if (!before || !after) return undefined;
  if (mode === 'timed' && swap && next.timedProgress?.run.cleared === (previous.timedProgress?.run.cleared ?? 0) + 1) {
    return { kind: 'swap-accepted', mode, chargedMoves: 1 };
  }
  if (before.attemptId !== after.attemptId) return undefined;
  if (swap && after.moves === before.moves + 1) return { kind: 'swap-accepted', mode, chargedMoves: 1 };
  if (help && after.assistsUsed === before.assistsUsed + 1) return { kind: 'help-accepted', mode, chargedMoves: after.moves - before.moves };
  return undefined;
}
