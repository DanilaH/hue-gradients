import { StoreError, type CommittedWorkspace, type OperationReceipt, type PreparedCommit, type StoredFact, type TransactionalLocalStore } from './contracts';
import { validateCommand } from './command';

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
const finished = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error ?? new StoreError('UNAVAILABLE', 'Transaction aborted'));
  tx.onerror = () => {}; // onabort is authoritative; do not report a request as a successful commit.
});

export async function openIndexedDb(name = 'hue-workspace-v1'): Promise<TransactionalLocalStore> {
  const opening = indexedDB.open(name, 2);
  opening.onupgradeneeded = event => {
    const db = opening.result;
    if (event.oldVersion === 0) {
      db.createObjectStore('workspaces', { keyPath: 'vaultId' });
      db.createObjectStore('operations', { keyPath: ['vaultId', 'operationId'] });
      const facts = db.createObjectStore('facts', { keyPath: ['vaultId', 'id'] });
      facts.createIndex('vault', 'vaultId');
    }
    db.createObjectStore('clocks', { keyPath: 'vaultId' });
  };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false;
    opening.onsuccess = () => { if (rejected) opening.result.close(); else resolve(opening.result); };
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => { rejected = true; reject(new StoreError('UNAVAILABLE', 'Database upgrade blocked by another tab')); };
  });
  db.onversionchange = () => db.close();
  function durable(tables: string[]): IDBTransaction {
    try { return db.transaction(tables, 'readwrite', { durability: 'strict' }); }
    catch { return db.transaction(tables, 'readwrite'); }
  }
  type Clock = { vaultId: string; revision: number; elapsedMs: number };

  async function read<T>(table: string, key: IDBValidKey): Promise<T | null> {
    const tx = db.transaction(table, 'readonly'), done = finished(tx);
    try { const result = await request<T | undefined>(tx.objectStore(table).get(key)); await done; return result ?? null; }
    catch (error) { await done.catch(() => {}); throw error; }
  }
  return {
    async load(vault) {
      const tx = db.transaction(['workspaces', 'clocks'], 'readonly'), done = finished(tx);
      try {
        const [workspace, clock] = await Promise.all([
          request<CommittedWorkspace | undefined>(tx.objectStore('workspaces').get(vault)),
          request<Clock | undefined>(tx.objectStore('clocks').get(vault)),
        ]);
        await done;
        if (!workspace) return null;
        return clock?.revision === workspace.localRevision ? { ...workspace, clockElapsedMs: clock.elapsedMs } : workspace;
      } catch (error) { await done.catch(() => {}); throw error; }
    },
    async checkpointClock(vaultId, revision, elapsedMs) {
      if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return false;
      const tx = durable(['workspaces', 'clocks']), done = finished(tx);
      try {
        const clocks = tx.objectStore('clocks');
        const [workspace, clock] = await Promise.all([
          request<CommittedWorkspace | undefined>(tx.objectStore('workspaces').get(vaultId)),
          request<Clock | undefined>(clocks.get(vaultId)),
        ]);
        if (workspace?.localRevision !== revision) { await done; return false; }
        if (clock?.revision !== revision || elapsedMs > clock.elapsedMs) clocks.put({ vaultId, revision, elapsedMs });
        await done; return true;
      } catch (error) { await done.catch(() => {}); throw error; }
    },
    readOperation: (vault, id) => read<OperationReceipt>('operations', [vault, id]),
    async listFacts(vault) {
      const tx = db.transaction('facts', 'readonly'), done = finished(tx);
      try { const facts = await request<StoredFact[]>(tx.objectStore('facts').index('vault').getAll(vault)); await done; return facts; }
      catch (error) { await done.catch(() => {}); throw error; }
    },
    async commit(command) {
      // All hashing/validation happens BEFORE opening the transaction. No network awaits inside it.
      await validateCommand(command);
      const tx = durable(['workspaces', 'operations', 'facts']);
      const done = finished(tx);
      try {
        const operations = tx.objectStore('operations');
        const existing = await request<OperationReceipt | undefined>(operations.get([command.vaultId, command.operationId]));
        if (existing) {
          if (existing.payloadHash !== command.payloadHash) throw new StoreError('OPERATION_MISMATCH', 'Operation ID already used');
          await done; return existing;
        }
        const workspace = await request<CommittedWorkspace | undefined>(tx.objectStore('workspaces').get(command.vaultId));
        if ((workspace?.localRevision ?? 0) !== command.expectedRevision) throw new StoreError('CONFLICT', 'Another writer changed this workspace');
        const receipt: OperationReceipt = { operationId: command.operationId, payloadHash: command.payloadHash, appliedRevision: command.expectedRevision + 1 };
        tx.objectStore('workspaces').put({ schemaVersion: 1, vaultId: command.vaultId, localRevision: receipt.appliedRevision, snapshotJson: command.nextSnapshotJson });
        for (const fact of command.facts) tx.objectStore('facts').add({ ...fact, vaultId: command.vaultId });
        operations.add({ ...receipt, vaultId: command.vaultId });
        await done; return receipt;
      } catch (error) {
        try { tx.abort(); } catch { /* Already aborted or completed. */ }
        await done.catch(() => {}); throw error;
      }
    },
    close: () => db.close(),
  };
}
