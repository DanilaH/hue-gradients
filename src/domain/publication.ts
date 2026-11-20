import { isCalendarDay } from '@danilah/mini-games-kit/core';
import { hasAuthorProof, type CreativeState } from './creative';
import { validName } from './editor';

export const PUBLICATION_LIMIT = 15;
export type PublicationStatus = 'pending' | 'review' | 'public' | 'rejected' | 'withdrawn';
export interface Submission {
  readonly operationId: string;
  readonly workId: string;
  readonly nodeId: string;
  readonly name: string;
  readonly fingerprint: string;
  readonly requestedDay: string;
  readonly acceptedDay?: string;
  readonly publicationId?: string;
  readonly serverVersion?: number;
  readonly status: PublicationStatus;
}
export interface PublicationEffect {
  readonly operationId: string;
  readonly publicationId: string;
  readonly kind: 'withdraw' | 'report';
  readonly reason?: string;
  readonly confirmed: boolean;
}
export interface PublicationState {
  readonly submissions: Readonly<Record<string, Submission>>;
  readonly effects: Readonly<Record<string, PublicationEffect>>;
}
export type PublicationCommand =
  | { kind: 'queue'; operationId: string; workId: string; nodeId: string; day: string }
  | { kind: 'accept'; operationId: string; id: string; day: string; serverVersion: number }
  | { kind: 'moderation'; id: string; status: 'review' | 'public' | 'rejected'; serverVersion: number }
  | { kind: 'effect'; operationId: string; id: string; effect: 'withdraw' | 'report'; reason?: string }
  | { kind: 'confirm-effect'; operationId: string; id: string };

const empty: PublicationState = { submissions: {}, effects: {} };
const idOK = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(value);
const serverOK = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const textOK = (reason: unknown) => typeof reason === 'string' && !!reason.trim() && [...reason].length <= 160;

export function usedPublications(state: PublicationState | undefined, day: string): number {
  return Object.values(state?.submissions ?? {}).filter(record => record.acceptedDay === day).length;
}
export function applyPublication(previous: PublicationState | undefined, creative: CreativeState | undefined,
  command: PublicationCommand): PublicationState | undefined {
  const state = previous ?? empty;
  if (command.kind === 'queue') {
    const work = creative?.works[command.workId];
    const node = work?.nodes[command.nodeId];
    if (!work || !node || !hasAuthorProof(work, node.nodeId) || !idOK(command.operationId) ||
        state.submissions[command.operationId] || state.effects[command.operationId] || !isCalendarDay(command.day)) return previous;
    if (Object.values(state.submissions).some(row => row.workId === work.workId && row.nodeId === node.nodeId)) return previous;
    const pending = Object.values(state.submissions).filter(r => r.status === 'pending' && r.requestedDay === command.day).length;
    if (usedPublications(state, command.day) + pending >= PUBLICATION_LIMIT) return previous;
    const row: Submission = { operationId: command.operationId, workId: work.workId, nodeId: node.nodeId, name: work.name,
      fingerprint: node.fingerprint, requestedDay: command.day, status: 'pending' };
    return { ...state, submissions: { ...state.submissions, [row.operationId]: row } };
  }
  if (command.kind === 'accept') {
    const row = state.submissions[command.operationId];
    if (row?.status !== 'pending' || !idOK(command.id) || !isCalendarDay(command.day) || !serverOK(command.serverVersion) ||
        Object.values(state.submissions).some(r => r.publicationId === command.id)) return previous;
    return { ...state, submissions: { ...state.submissions, [row.operationId]: {
      ...row, status: 'review', publicationId: command.id, acceptedDay: command.day, serverVersion: command.serverVersion,
    } } };
  }
  const parent = Object.values(state.submissions).find(r => r.publicationId === command.id);
  if (command.kind === 'moderation') {
    if (!parent || parent.status === 'withdrawn' || !['review','public','rejected'].includes(command.status) || !serverOK(command.serverVersion) || command.serverVersion <= parent.serverVersion!) return previous;
    return { ...state, submissions: { ...state.submissions,
      [parent.operationId]: { ...parent, status: command.status, serverVersion: command.serverVersion } } };
  }
  if (command.kind === 'effect') {
    if (!idOK(command.operationId) || !idOK(command.id) || state.effects[command.operationId] || state.submissions[command.operationId]) return previous;
    if (command.effect === 'withdraw' ? !parent || parent.status === 'withdrawn' : !textOK(command.reason)) return previous;
    if (Object.values(state.effects).some(r => r.kind === command.effect && r.publicationId === command.id)) return previous;
    const request: PublicationEffect = { operationId: command.operationId, publicationId: command.id, kind: command.effect,
      confirmed: false, ...(command.effect === 'report' ? { reason: command.reason!.trim() } : {}) };
    return { ...state, effects: { ...state.effects, [command.operationId]: request } };
  }
  const effect = state.effects[command.operationId];
  if (!effect || effect.confirmed || command.id !== effect.publicationId) return previous;
  return { ...state, effects: { ...state.effects, [effect.operationId]: { ...effect, confirmed: true } },
    submissions: parent && effect.kind === 'withdraw' ? { ...state.submissions,
      [parent.operationId]: { ...parent, status: 'withdrawn' } } : state.submissions };
}

export function validatePublication(state: PublicationState, creative?: CreativeState): void {
  if (!state || !state.submissions || !state.effects || Array.isArray(state.submissions) || Array.isArray(state.effects) ||
      typeof state.submissions !== 'object' || typeof state.effects !== 'object') throw new Error('Invalid publication store');
  const ids = new Set<string>();
  for (const [key, row] of Object.entries(state.submissions)) {
    const work = creative?.works[row?.workId], revision = work?.nodes[row?.nodeId];
    if (!row || key !== row.operationId || !idOK(key) || !revision || !hasAuthorProof(work!, revision.nodeId) ||
        revision.fingerprint !== row.fingerprint || typeof row.name !== 'string' || validName(row.name) !== row.name ||
        !isCalendarDay(row.requestedDay) || !['pending','review','public','rejected','withdrawn'].includes(row.status)) {
      throw new Error('Invalid submission');
    }
    if (row.status === 'pending' ? row.publicationId !== undefined || row.acceptedDay !== undefined || row.serverVersion !== undefined
      : !idOK(row.publicationId) || ids.has(row.publicationId) || !isCalendarDay(row.acceptedDay) || !serverOK(row.serverVersion)) {
      throw new Error('Invalid submission receipt');
    }
    if (row.publicationId) ids.add(row.publicationId);
  }
  for (const [key, row] of Object.entries(state.effects)) {
    if (!row || key !== row.operationId || !idOK(key) || !idOK(row.publicationId) || state.submissions[key] ||
        typeof row.confirmed !== 'boolean' || (row.kind === 'report' ? !textOK(row.reason)
          : row.kind !== 'withdraw' || !ids.has(row.publicationId))) throw new Error('Invalid publication effect');
  }
}
