import { StoreError, type PreparedCommit } from './contracts';

export type CommitInput = Omit<PreparedCommit, 'payloadHash'>;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);

/** Also passed verbatim to SQLite: both adapters hash the actual command bytes. */
export function commandJson(command: CommitInput): string {
  return JSON.stringify({
    operationId: command.operationId, vaultId: command.vaultId,
    expectedRevision: command.expectedRevision, nextSnapshotJson: command.nextSnapshotJson,
    facts: command.facts.map(fact => ({ id: fact.id, destination: fact.destination, payloadJson: fact.payloadJson })),
  });
}

export async function hashBytes(value: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hashText(value: string): Promise<string> {
  return hashBytes(new TextEncoder().encode(value));
}

export async function prepareCommit(input: CommitInput): Promise<PreparedCommit> {
  const command = { ...input, payloadHash: await hashText(commandJson(input)) };
  await validateCommand(command);
  return command;
}

export async function validateCommand(command: PreparedCommit): Promise<void> {
  if (!identifier(command.vaultId) || !identifier(command.operationId) ||
      !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
      command.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof command.nextSnapshotJson !== 'string' || command.nextSnapshotJson.length > 2_000_000 ||
      !Array.isArray(command.facts) || command.facts.length > 100) throw new StoreError('CORRUPT', 'Invalid commit');
  JSON.parse(command.nextSnapshotJson);
  if (new Set(command.facts.map(f => f.id)).size !== command.facts.length) throw new StoreError('CORRUPT', 'Duplicate fact');
  for (const fact of command.facts) {
    if (!identifier(fact.id) || typeof fact.payloadJson !== 'string' || fact.payloadJson.length > 100_000) throw new StoreError('CORRUPT', 'Invalid fact');
    JSON.parse(fact.payloadJson);
    const d = fact.destination;
    if (!d || (d.kind === 'guest' ? d.vaultId !== command.vaultId :
      d.kind !== 'account' || !identifier(d.profileId) || !Number.isSafeInteger(d.epoch) || d.epoch < 0)) throw new StoreError('CORRUPT', 'Invalid destination');
  }
  if (await hashText(commandJson(command)) !== command.payloadHash) throw new StoreError('OPERATION_MISMATCH', 'Command hash mismatch');
}
