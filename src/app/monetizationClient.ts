import type { Session } from './session';
import { adEligible, type AdOpportunity, type AdStage } from '../domain/monetization';

type Terminal = 'dismissed' | 'no-fill' | 'cancelled' | 'pre-show-error';
export interface AdObserver {
  opened(): void;
  reward(providerReceiptId: string): void;
  terminal(status: Terminal): void;
}
export interface MonetizationPort {
  ready(stage: AdStage | 'reward'): boolean;
  fullscreen(request: { id: string; stage: AdStage | 'reward' }, receive: AdObserver): void;
  banner(stage: AdStage | null): Promise<'visible' | 'hidden' | 'no-fill'>;
  purchase(product: string): Promise<{ receipt: string; product: string } | null>;
  restore(product: string): Promise<{ receipt: string; product: string } | null>;
  gift?(item: string): Promise<{ receipt: string; item: string } | null>;
  rate?(): Promise<{ completed: boolean }>;
}

type Policy = { stages: readonly AdStage[]; rewardId?: string; giftId?: string; removeAdsProduct?: string };

export class MonetizationClient {
  private lastRequest = 0;
  private fullscreen = false;
  private ratingGrace = 0;
  private waiting: undefined | { resolve: (outcome: Terminal | 'skipped' | 'unknown') => void; opened: boolean; unanswered: boolean };

  constructor(private readonly store: Pick<Session, 'state' | 'act'>, private readonly port: MonetizationPort,
    private readonly policy: Policy, private readonly arming: (reason: 'commercial-screen', visible: boolean) => void) {}

  async transition(plan: AdOpportunity): Promise<Terminal | 'skipped' | 'unknown'> {
    if (this.fullscreen || this.waiting || this.ratingGrace > plan.activeMs || !this.port.ready(plan.stage) ||
        !adEligible(plan, this.policy.stages, this.store.state.adLedger, this.lastRequest)) return 'skipped';
    this.fullscreen = true;
    try {
      try {
        if (!await this.store.act({ kind: 'monetization', command: { kind: 'request', id: plan.id, progress: plan.uniqueProgress } })) return 'skipped';
      } catch { return 'skipped'; }
      this.lastRequest = plan.activeMs;
      return await this.show(plan.id, plan.stage);
    } finally { this.fullscreen = false; }
  }

  async reward(intentId: string, activeMs: number): Promise<Terminal | 'skipped' | 'unknown'> {
    if (!this.policy.rewardId || this.fullscreen || this.waiting || !this.port.ready('reward')) return 'skipped';
    this.fullscreen = true;
    try { return await this.show(intentId, 'reward', activeMs); }
    finally { this.fullscreen = false; }
  }

  private show(id: string, stage: AdStage | 'reward', activeMs = 0) {
    return new Promise<Terminal | 'skipped' | 'unknown'>(resolve => {
      const request = { resolve, opened: false, unanswered: false };
      let earned = Promise.resolve();
      let rewardSeen = false;
      let finishing = false;
      this.waiting = request;
      this.arming('commercial-screen', true);
      const clock = setTimeout(() => {
        if (this.waiting === request && !request.opened && !finishing) {
          request.unanswered = true;
          resolve('unknown');
        }
      }, 10_000);
      const terminal = (status: Terminal) => {
        if (this.waiting !== request || finishing || request.opened && status !== 'dismissed') return;
        finishing = true;
        clearTimeout(clock);
        void earned.finally(() => {
          if (this.waiting !== request) return;
          this.waiting = undefined;
          this.arming('commercial-screen', false);
          if (!request.unanswered) resolve(status);
        });
      };
      try {
        this.port.fullscreen({ id, stage }, {
          opened: () => { if (this.waiting === request && !finishing) { request.opened = true; clearTimeout(clock); } },
          reward: receipt => {
            if (stage !== 'reward' || !request.opened || this.waiting !== request || finishing || rewardSeen) return;
            rewardSeen = true;
            earned = this.credit(`reward:${this.policy.rewardId}:${receipt}`, 'voluntary').then(() => {
              this.ratingGrace = Math.max(this.ratingGrace, activeMs + 180_000);
            }).catch(() => {});
          },
          terminal,
        });
      } catch { terminal('pre-show-error'); }
    });
  }

  async banner(context: { stage: AdStage; stable: boolean; geometryFits: boolean }): Promise<'visible' | 'hidden' | 'no-fill'> {
    const available = context.stable && context.geometryFits && !this.fullscreen && !this.waiting &&
      !this.store.state.adLedger?.removeAds && this.policy.stages.includes(context.stage);
    return this.port.banner(available ? context.stage : null);
  }
  async storePurchase(restore: boolean): Promise<boolean> {
    const product = this.policy.removeAdsProduct;
    if (!product || this.fullscreen || this.waiting) return false;
    this.fullscreen = true;
    this.arming('commercial-screen', true);
    try {
      const receipt = await (restore ? this.port.restore(product) : this.port.purchase(product));
      if (receipt?.product !== product) return false;
      await this.credit(`store:${product}:${receipt.receipt}`, 'remove-ads');
      return this.store.state.adLedger?.removeAds === true;
    } finally {
      this.fullscreen = false;
      this.arming('commercial-screen', false);
    }
  }

  async gift(): Promise<void> {
    const item = this.policy.giftId;
    if (!item || !this.port.gift || this.fullscreen || this.waiting) return;
    this.fullscreen = true;
    try {
      const receipt = await this.port.gift(item);
      if (receipt?.item === item) await this.credit(`gift:${item}:${receipt.receipt}`, 'gift');
    } finally { this.fullscreen = false; }
  }

  async rate(campaignCount: number, activeMs: number, explicit: boolean): Promise<void> {
    if (!explicit || !this.port.rate || this.fullscreen || this.waiting || ![25, 40, 55].includes(campaignCount) ||
        this.store.state.adLedger?.receipts[`rating:${campaignCount}`]) return;
    this.fullscreen = true;
    this.arming('commercial-screen', true);
    try {
      if ((await this.port.rate()).completed) {
        await this.credit(`rating:${campaignCount}`, 'rating');
        this.ratingGrace = activeMs + 180_000;
      }
    } finally {
      this.fullscreen = false;
      this.arming('commercial-screen', false);
    }
  }

  private async credit(id: string, reward: 'voluntary' | 'gift' | 'remove-ads' | 'rating'): Promise<void> {
    await this.store.act({ kind: 'monetization', command: { kind: 'receipt', id, reward } });
  }
}
