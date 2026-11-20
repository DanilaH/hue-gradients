import { applyAction, decodeWorkspace, newWorkspace, upgradeWorkspace, type Action, type Workspace } from '../domain/workspace';
import { hashText, prepareCommit } from '../local-store/command';
import { applyCreative, validateCreativeHashes, type CreativeAction } from '../domain/creative';
import { editorFingerprintPayload } from '../domain/editor';
import { activeDaily } from '../domain/daily';
import { activeChallenge } from '../domain/challenges';
import type { Assistance } from '../domain/puzzle';
import { StoreError, type PreparedCommit, type TransactionalLocalStore } from '../local-store/contracts';

export const GUEST_VAULT = 'guest-local-v1';
/** One writer per view; cross-view concurrency is enforced by the physical DB transaction. */
export class Session {
  state!: Workspace;
  revision = 0;
  pending: PreparedCommit | null = null;
  private readonly hashes = new Map<string, Promise<string>>();
  private readonly digest = (payload: string): Promise<string> => {
    let result = this.hashes.get(payload);
    if (!result) { result = hashText(payload); this.hashes.set(payload, result); }
    return result;
  };
  constructor(readonly store: TransactionalLocalStore, readonly fingerprints: ReadonlyMap<string, string>) {}
  async load(): Promise<void> {
    const saved = await this.store.load(GUEST_VAULT);
    if (saved) {
      if (saved.schemaVersion !== 1 || saved.vaultId !== GUEST_VAULT || !Number.isSafeInteger(saved.localRevision) || saved.localRevision < 1) throw new StoreError('CORRUPT', 'Invalid workspace envelope');
      this.state = decodeWorkspace(saved.snapshotJson, this.fingerprints); this.revision = saved.localRevision;
      if (this.state.creative) await validateCreativeHashes(this.state.creative, this.digest);
      const upgraded = upgradeWorkspace(this.state, this.fingerprints);
      if (upgraded !== this.state) {
        try { await this.write(upgraded, this.state.policyVersion === 'm1-local-1' ? 'migrate-campaign-meta' : 'migrate-creative-local', saved.snapshotJson); }
        catch (error) {
          // A concurrent tab may already have committed exactly this migration.
          if (!(error instanceof StoreError && error.code === 'CONFLICT' && this.state.policyVersion === 'campaign-meta-1' && this.state.creative)) throw error;
        }
      }
    } else {
      if (this.revision > 0) throw new StoreError('CORRUPT', 'Previously saved workspace disappeared');
      await this.write(newWorkspace(crypto.randomUUID()), 'initialize');
    }
  }
  private async write(next: Workspace, kind: string, backupSnapshot?: string, creativeAction?: CreativeAction, assistance?: Assistance): Promise<void> {
    if (this.pending) throw new Error('Resolve pending operation first');
    const operationId = crypto.randomUUID();
    const attempt = next.attempts[next.activeLevelId];
    const challenge = kind.startsWith('challenge-') ? activeChallenge(kind === 'challenge-leave'
      ? this.state?.challengeProgress : next.challengeProgress) : null;
    const firstChallengeWin = challenge?.status === 'won' &&
      next.challengeProgress?.best[challenge.level.id] !== undefined &&
      this.state?.challengeProgress?.best[challenge.level.id] === undefined;
    const timed = kind.startsWith('timed-') ? next.timedProgress : undefined;
    const timedFinished = !!timed && timed.finished > (this.state?.timedProgress?.finished ?? 0);
    const daily = kind.startsWith('daily-') ? activeDaily(kind === 'daily-leave' ? this.state?.dailyProgress : next.dailyProgress) : null;
    const firstDailyWin = daily?.attempt.completed && !this.state?.dailyProgress?.solved.includes(daily.date);
    const lastVictory = next.victories?.at(-1);
    const victory = lastVictory?.attemptId === this.state?.victories?.at(-1)?.attemptId ? undefined : lastVictory;
    const fact = { id: operationId, destination: { kind: 'guest' as const, vaultId: GUEST_VAULT },
      payloadJson: JSON.stringify({ schemaVersion: 1, kind, contentVersion: next.contentVersion, policyVersion: next.policyVersion,
        levelId: next.activeLevelId, fingerprint: this.fingerprints.get(next.activeLevelId), attempt,
        best: next.bests[next.activeLevelId], onboarding: next.onboarding, assistance, victory,
        ...(challenge ? { challengeId: challenge.level.id, challengeAttempt: challenge.attempt, challengeStatus: challenge.status, ...(firstChallengeWin ? { firstChallengeWin: true } : {}) } : {}),
        ...(timed ? { timed, ...(timedFinished ? { timedFinished: true } : {}) } : {}),
        ...(daily ? { dailyDate: daily.date, dailyCatalog: daily.version, dailyAttempt: daily.attempt,
          ...(firstDailyWin ? { firstDailyWin: true } : {}) } : {}),
        creativeAction, authorTest: creativeAction?.kind.startsWith('author-') ? next.creative?.activeTest : undefined,
        newCopies: Object.values(next.albumCopies).filter(copy => !this.state?.albumCopies[copy.draftId]),
        newCompletions: next.completed.filter(id => !this.state?.completed.includes(id)),
        newRights: next.rights.filter(id => !this.state?.rights.includes(id)) }) };
    const facts = [fact];
    if (backupSnapshot !== undefined) facts.push({ id: `backup:${operationId}`, destination: { kind: 'guest', vaultId: GUEST_VAULT },
      payloadJson: JSON.stringify({ schemaVersion: 1, kind: 'local-migration-backup', snapshotJson: backupSnapshot }) });
    this.pending = await prepareCommit({ operationId, vaultId: GUEST_VAULT, expectedRevision: this.revision, nextSnapshotJson: JSON.stringify(next), facts });
    await this.resolvePending();
  }
  async resolvePending(): Promise<void> {
    const command = this.pending;
    if (!command) return;
    try {
      const known = await this.store.readOperation(command.vaultId, command.operationId);
      if (known && known.payloadHash !== command.payloadHash) throw new StoreError('OPERATION_MISMATCH', 'Receipt mismatch');
      if (!known) await this.store.commit(command);
    } catch (error) {
      if (error instanceof StoreError && error.code === 'CONFLICT') {
        this.pending = null; await this.load(); throw error; // Re-render authority; never rebase an old snapshot.
      }
      // A bridge can fail AFTER commit. A successful ledger read establishes authority.
      let known;
      try { known = await this.store.readOperation(command.vaultId, command.operationId); }
      catch { throw new StoreError('UNAVAILABLE', 'Cannot establish transaction result'); }
      if (!known) throw error; // Keep the SAME prepared command for explicit recovery/retry.
      if (known.payloadHash !== command.payloadHash) throw new StoreError('OPERATION_MISMATCH', 'Receipt mismatch');
    }
    // Leave pending intact until both ledger and authoritative snapshot can be read.
    const saved = await this.store.load(command.vaultId);
    if (!saved || saved.localRevision < command.expectedRevision + 1) throw new StoreError('CORRUPT', 'Committed snapshot unavailable');
    const decoded = decodeWorkspace(saved.snapshotJson, this.fingerprints);
    if (decoded.creative) await validateCreativeHashes(decoded.creative, this.digest);
    this.state = decoded; this.revision = saved.localRevision; this.pending = null;
  }
  async act(action: Action | CreativeAction): Promise<boolean> {
    const creativeAction = action.kind.startsWith('editor-') || action.kind.startsWith('author-') ? action as CreativeAction : undefined;
    let next: Workspace;
    if (creativeAction) {
      if (!this.state.creative) throw new Error('Editor migration required');
      const fingerprint = 'field' in creativeAction ? await this.digest(editorFingerprintPayload(creativeAction.field)) : undefined;
      const creative = applyCreative(this.state.creative, creativeAction, fingerprint);
      next = creative === this.state.creative ? this.state : { ...this.state, creative };
    } else next = applyAction(this.state, action as Action, this.fingerprints);
    if (next === this.state) return false;
    await this.write(next, action.kind, undefined, creativeAction, action.kind === 'help' || action.kind === 'author-help' ? action.assistance : undefined); return true;
  }
}
