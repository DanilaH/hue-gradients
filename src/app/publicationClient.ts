import type { Session } from './session';
import { makePuzzleFile, parsePuzzleFile } from '../domain/puzzleTransfer';
import type { PublicationEffect } from '../domain/publication';

/** A configured service supplies dates, idempotent receipts and moderated feed. */
export interface PublicationPort {
  verifiedUtcDay(): Promise<string>;
  submit(operationId: string, puzzle: File): Promise<{ operationId: string; id: string; day: string; serverVersion: number }>;
  change(request: PublicationEffect): Promise<{ operationId: string; id: string }>;
  moderation(id: string): Promise<{ id: string; status: 'review' | 'public' | 'rejected'; serverVersion: number }>;
  feed(): Promise<readonly CommunityItem[]>;
}
export interface CommunityItem {
  id: string;
  author: string;
  puzzle: File;
  status: 'public';
}

export class PublicationClient {
  private sending = false;
  constructor(private readonly store: Pick<Session, 'state' | 'act'>, private readonly port: PublicationPort) {}

  private async exclusive(action: () => Promise<void>): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try { await action(); } finally { this.sending = false; }
  }
  async submit(workId: string, nodeId: string): Promise<void> {
    return this.exclusive(async () => {
      let row = Object.values(this.store.state.publication?.submissions ?? {}).find(r => r.workId === workId && r.nodeId === nodeId);
      if (!row) {
        const day = await this.port.verifiedUtcDay(), operationId = crypto.randomUUID();
        if (!await this.store.act({ kind: 'publication', command: { kind: 'queue', workId, nodeId, day, operationId } })) return;
        row = this.store.state.publication?.submissions[operationId];
      }
      if (row?.status !== 'pending') return;
      const node = this.store.state.creative?.works[workId]?.nodes[nodeId];
      if (!node || node.fingerprint !== row.fingerprint) throw new Error('Missing publication revision');
      const receipt = await this.port.submit(row.operationId, makePuzzleFile(row.name, node));
      if (receipt.operationId !== row.operationId) throw new Error('Publication receipt mismatch');
      await this.store.act({ kind: 'publication', command: { kind: 'accept', ...receipt } });
    });
  }
  async change(id: string, effect: 'withdraw' | 'report', reason?: string): Promise<void> {
    return this.exclusive(async () => {
      let row = Object.values(this.store.state.publication?.effects ?? {}).find(r => r.publicationId === id && r.kind === effect);
      if (!row) {
        const operationId = crypto.randomUUID();
        if (!await this.store.act({ kind: 'publication', command: { kind: 'effect', operationId, id, effect,
          ...(reason ? { reason } : {}) } })) return;
        row = this.store.state.publication?.effects[operationId];
      }
      if (!row || row.confirmed) return;
      const receipt = await this.port.change(row);
      if (receipt.operationId !== row.operationId || receipt.id !== row.publicationId) throw new Error('Publication effect receipt mismatch');
      await this.store.act({ kind: 'publication', command: { kind: 'confirm-effect', ...receipt } });
    });
  }
  async update(id: string): Promise<void> {
    return this.exclusive(async () => {
      const status = await this.port.moderation(id);
      if (status.id !== id) throw new Error('Publication moderation mismatch');
      await this.store.act({ kind: 'publication', command: { kind: 'moderation', ...status } });
    });
  }
  async feed(): Promise<readonly CommunityItem[]> {
    const rows = await this.port.feed();
    const ids = new Set<string>(Object.values(this.store.state.publication?.submissions ?? {})
      .flatMap(row => row.status === 'withdrawn' && row.publicationId ? [row.publicationId] : []));
    const items: CommunityItem[] = [];
    for (const row of rows) {
      if (!row || row.status !== 'public' || typeof row.id !== 'string' || ids.has(row.id) ||
          typeof row.author !== 'string' || !(row.puzzle instanceof File)) continue;
      try { await parsePuzzleFile(row.puzzle); } catch { continue; }
      ids.add(row.id);
      items.push({ ...row, author: [...row.author].slice(0, 80).join('') });
    }
    return items;
  }
}
