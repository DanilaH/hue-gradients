import type { Point } from './boardCamera';

export const LANDING_MS = 665;
export const WAVE_MS = 660;
export const VICTORY_END_MS = LANDING_MS + WAVE_MS + 390;
export const amount = (value: number) => Math.min(1, Math.max(0, value));
export const ease = (t: number) => t * t * (3 - 2 * t);

export function tileJump(elapsed: number, point: Point, origin: Point, diagonal: number): number {
  const delay = 48 * amount(Math.hypot(point.x - origin.x, point.y - origin.y) / diagonal);
  if (elapsed < 552) return ease(amount((elapsed - 322 - delay) / 164));
  return 1 - amount((elapsed - 552) / (LANDING_MS - 552)) ** 3;
}
