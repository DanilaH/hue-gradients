/** M1 contract: KV bootstrap storage cannot implement this by separate writes. */
export interface CommittedWorkspace {
  readonly schemaVersion: 1;
  readonly vaultId: string;
  readonly localRevision: number;
  readonly snapshotJson: string;
}

export interface PreparedCommit {
  readonly operationId: string;
  readonly payloadHash: string;
  readonly vaultId: string;
  readonly expectedRevision: number;
  readonly nextSnapshotJson: string;
  readonly facts: readonly {
    readonly id: string;
    readonly destination: { readonly kind: 'guest'; readonly vaultId: string } |
      { readonly kind: 'account'; readonly profileId: string; readonly epoch: number };
    readonly payloadJson: string;
  }[];
}

export interface OperationReceipt {
  readonly operationId: string;
  readonly payloadHash: string;
  readonly appliedRevision: number;
}

export type StoredFact = PreparedCommit['facts'][number];

export class StoreError extends Error {
  constructor(public readonly code: 'CONFLICT' | 'OPERATION_MISMATCH' | 'CORRUPT' | 'UNAVAILABLE', message: string) {
    super(message);
  }
}

export interface TransactionalLocalStore {
  load(vaultId: string): Promise<CommittedWorkspace | null>;
  /** Snapshot + facts/outbox + operation receipt in ONE native/IndexedDB transaction. */
  commit(command: PreparedCommit): Promise<OperationReceipt>;
  readOperation(vaultId: string, operationId: string): Promise<OperationReceipt | null>;
  listFacts(vaultId: string): Promise<readonly StoredFact[]>;
  close(): void;
}
