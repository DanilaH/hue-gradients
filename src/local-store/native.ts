import { registerPlugin } from '@capacitor/core';
import { commandJson, validateCommand } from './command';
import { StoreError, type CommittedWorkspace, type OperationReceipt, type StoredFact, type TransactionalLocalStore } from './contracts';

interface SQLiteBridge {
  load(input: { vaultId: string }): Promise<{ workspace: CommittedWorkspace | null }>;
  commit(input: { commandJson: string; payloadHash: string }): Promise<OperationReceipt>;
  readOperation(input: { vaultId: string; operationId: string }): Promise<{ receipt: OperationReceipt | null }>;
  listFacts(input: { vaultId: string }): Promise<{ facts: StoredFact[] }>;
}
const bridge = registerPlugin<SQLiteBridge>('HueSQLite');
async function call<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'CONFLICT' || code === 'OPERATION_MISMATCH' || code === 'CORRUPT') throw new StoreError(code, 'Local transaction rejected');
    throw new StoreError('UNAVAILABLE', 'Local transaction result unavailable');
  }
}
export function openNativeStore(): TransactionalLocalStore {
  return {
    load: async vaultId => (await call(() => bridge.load({ vaultId }))).workspace,
    commit: async command => { await validateCommand(command); return call(() => bridge.commit({ commandJson: commandJson(command), payloadHash: command.payloadHash })); },
    readOperation: async (vaultId, operationId) => (await call(() => bridge.readOperation({ vaultId, operationId }))).receipt,
    listFacts: async vaultId => (await call(() => bridge.listFacts({ vaultId }))).facts,
    close() { /* SQLiteHelper and process-wide writer are owned by the native host. */ },
  };
}
