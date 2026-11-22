export type AdStage = 'campaign' | 'challenge' | 'daily';
export interface AdOpportunity {
  readonly id: string;
  readonly stage: AdStage;
  readonly activeMs: number;
  readonly uniqueProgress: number;
  readonly newResult: boolean;
  readonly committed: boolean;
  readonly explicit: boolean;
  readonly clear: boolean;
  readonly protectedResult: boolean;
}
export interface AdLedger {
  readonly requests: Readonly<Record<string, number>>;
  readonly lastProgress: number;
  readonly receipts: Readonly<Record<string, 'voluntary' | 'gift' | 'remove-ads' | 'rating'>>;
  readonly removeAds: boolean;
}
export type AdCommand =
  | { kind: 'request'; id: string; progress: number }
  | { kind: 'receipt'; id: string; reward: 'voluntary' | 'gift' | 'remove-ads' | 'rating' };

const blank: AdLedger = { requests: {}, lastProgress: 0, receipts: {}, removeAds: false };
const name = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,180}$/.test(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function applyAdLedger(previous: AdLedger | undefined, command: AdCommand): AdLedger | undefined {
  const state = previous ?? blank;
  if (!name(command.id)) return previous;
  if (command.kind === 'request') {
    if (state.removeAds || Object.prototype.hasOwnProperty.call(state.requests, command.id) ||
        !count(command.progress) || command.progress < state.lastProgress + 3) return previous;
    return { ...state, lastProgress: command.progress, requests: { ...state.requests, [command.id]: command.progress } };
  }
  if (Object.prototype.hasOwnProperty.call(state.receipts, command.id) || !['voluntary', 'gift', 'remove-ads', 'rating'].includes(command.reward)) return previous;
  return { ...state, removeAds: state.removeAds || command.reward === 'remove-ads',
    receipts: { ...state.receipts, [command.id]: command.reward } };
}

export function validateAdLedger(state: AdLedger): void {
  if (!state || typeof state.removeAds !== 'boolean' || !count(state.lastProgress) || !state.requests || !state.receipts ||
      typeof state.requests !== 'object' || typeof state.receipts !== 'object' ||
      Array.isArray(state.requests) || Array.isArray(state.receipts) ||
      Object.entries(state.requests).some(([id, n]) => !name(id) || !count(n) || n > state.lastProgress) ||
      Object.entries(state.receipts).some(([id, reward]) => !name(id) || !['voluntary', 'gift', 'remove-ads', 'rating'].includes(reward)) ||
      state.removeAds !== Object.values(state.receipts).includes('remove-ads')) throw new Error('Invalid monetization ledger');
}

export function adEligible(plan: AdOpportunity, policy: readonly AdStage[], ledger?: AdLedger, lastActiveMs = 0): boolean {
  return policy.includes(plan.stage) && name(plan.id) && plan.explicit && plan.committed && plan.newResult && plan.clear &&
    !plan.protectedResult && !ledger?.removeAds && count(plan.uniqueProgress) && plan.uniqueProgress > 5 &&
    plan.uniqueProgress >= (ledger?.lastProgress ?? 0) + 3 &&
    !Object.prototype.hasOwnProperty.call(ledger?.requests ?? {}, plan.id) &&
    Number.isFinite(plan.activeMs) && plan.activeMs - lastActiveMs >= 180_000;
}
