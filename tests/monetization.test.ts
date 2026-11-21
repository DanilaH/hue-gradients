import { expect, test, vi } from 'vitest';
import { MonetizationClient, type AdObserver, type MonetizationPort } from '../src/app/monetizationClient';
import { type AdOpportunity } from '../src/domain/monetization';
import { applyAction, decodeWorkspace, newWorkspace, type Action } from '../src/domain/workspace';

function fixture(configured = true) {
  let fail = false, receiver: AdObserver | undefined, restore = false;
  const actions: string[] = [], blockers = new Set<string>();
  const store = { state: newWorkspace('free'), async act(action: Action): Promise<boolean> {
    if (fail) throw new Error('write failure');
    const prior = this.state;
    this.state = applyAction(prior, action, new Map());
    return prior !== this.state;
  } };
  const port: MonetizationPort = {
    ready: () => configured,
    fullscreen: ({ stage }, observer) => { actions.push(stage); receiver = observer; },
    banner: async stage => { actions.push(`banner:${stage}`); return stage ? 'visible' : 'hidden'; },
    purchase: async () => { actions.push('store-cancel'); return null; },
    restore: async product => { actions.push('restore'); return restore ? { receipt: 'store-proof', product } : null; },
    gift: async item => { actions.push('gift'); return { receipt: 'gift-proof', item }; },
    rate: async () => ({ completed: true }),
  };
  const client = new MonetizationClient(store, port, { stages: ['campaign','challenge'],
    ...(configured ? { rewardId: 'fixture-reward', removeAdsProduct: 'fixture-no-ads' } : {}) },
    (reason, on) => { if (on) blockers.add(reason); else blockers.delete(reason); });
  return { client, store, actions, blockers, callbacks: () => receiver!,
    fail: () => { fail = true; }, owning: () => { restore = true; } };
}
const plan: AdOpportunity = { id: 'transition-6', stage: 'campaign', activeMs: 180_000,
  uniqueProgress: 6, committed: true, explicit: true, newResult: true, clear: true, protectedResult: false };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

test('eligible campaign and challenge transitions consume request budget even on no-fill; background is additive', async () => {
  const f = fixture();
  expect(await f.client.transition({ ...plan, uniqueProgress: 5 })).toBe('skipped');
  expect(await f.client.transition({ ...plan, protectedResult: true })).toBe('skipped');
  expect(await f.client.transition({ ...plan, explicit: false })).toBe('skipped');
  expect(await f.client.transition({ ...plan, clear: false })).toBe('skipped');
  expect(await f.client.banner({ stage: 'campaign', stable: true, geometryFits: false })).toBe('hidden');
  expect(await f.client.banner({ stage: 'challenge', stable: true, geometryFits: true })).toBe('visible');
  const first = f.client.transition(plan);
  await tick();
  f.callbacks().terminal('no-fill');
  expect(await first).toBe('no-fill');
  expect(f.store.state.adLedger?.requests[plan.id]).toBe(6);
  expect(await f.client.transition({ ...plan, id: 'too-soon', uniqueProgress: 9 })).toBe('skipped');
  const second = f.client.transition({ ...plan, id: 'challenge-9', stage: 'challenge', uniqueProgress: 9, activeMs: 360_000 });
  await tick();
  f.callbacks().opened();
  f.blockers.add('background');
  f.callbacks().terminal('pre-show-error');
  expect(f.blockers).toEqual(new Set(['commercial-screen', 'background']));
  f.callbacks().terminal('dismissed'); f.callbacks().terminal('dismissed');
  expect(await second).toBe('dismissed');
  expect(f.blockers).toEqual(new Set(['background']));
  expect(f.actions).toEqual(['banner:null','banner:challenge','campaign','challenge']);
});

test('cancel does not grant a reward, duplicate callbacks are harmless, and restore persists the paid right', async () => {
  const f = fixture();
  const cancelled = f.client.reward('first', 0);
  f.callbacks().terminal('cancelled');
  expect(await cancelled).toBe('cancelled');
  expect(f.store.state.adLedger).toBeUndefined();
  const shown = f.client.reward('second', 5);
  f.callbacks().opened(); f.callbacks().reward('verified'); f.callbacks().reward('verified');
  f.callbacks().terminal('dismissed');
  await shown;
  expect(Object.values(f.store.state.adLedger!.receipts)).toEqual(['voluntary']);
  expect(await f.client.storePurchase(false)).toBe(false);
  f.owning();
  expect(await f.client.storePurchase(true)).toBe(true);
  expect(await f.client.storePurchase(true)).toBe(true);
  expect(await f.client.banner({ stage: 'campaign', stable: true, geometryFits: true })).toBe('hidden');
  expect(await f.client.transition(plan)).toBe('skipped');
  expect(decodeWorkspace(JSON.stringify(f.store.state), new Map()).adLedger?.removeAds).toBe(true);
  await f.client.gift();
  expect(f.actions).not.toContain('gift');
});

test('unknown fullscreen stays blocked, while missing provider or writes leave the game available', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const unresolved = f.client.transition(plan);
    await tick();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await unresolved).toBe('unknown');
    expect(f.blockers.has('commercial-screen')).toBe(true);
    f.callbacks().terminal('no-fill');
    await tick();
    expect(f.blockers.has('commercial-screen')).toBe(false);
    const absent = fixture(false);
    expect(await absent.client.transition(plan)).toBe('skipped');
    expect(await absent.client.reward('unconfigured', 0)).toBe('skipped');
    const failed = fixture();
    failed.fail();
    expect(await failed.client.transition(plan)).toBe('skipped');
    expect(failed.actions).toEqual([]);
  } finally { vi.useRealTimers(); }
});
