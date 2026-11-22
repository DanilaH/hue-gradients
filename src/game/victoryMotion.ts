import type { Point } from './boardCamera';

export const FRAME_START_MS = 150;
export const FRAME_END_MS = 372;
export const LIFT_START_MS = 422;
export const RISE_MS = 122;
const CREST_MS = 18;
export const RETURN_MS = 58;
const CONTACT_MS = RISE_MS + CREST_MS + RETURN_MS;
const DELAY_STEP_MS = 66;
const DELAY_BANDS = 3;
export const LANDING_MS = LIFT_START_MS + DELAY_BANDS * DELAY_STEP_MS + CONTACT_MS;
export const WAVE_MS = 660;
export const RESULT_REVEAL_AT_MS = WAVE_MS * .82;
export const RESULT_REVEAL_MS = 400;
const PUSH_IN_MS = 172;
const RECOIL_RETURN_MS = 100;
const COLOUR_BLEND_START_MS = 36;
const COLOUR_BLEND_MS = 300;
export const CAMERA_SETTLE_MS = PUSH_IN_MS + RECOIL_RETURN_MS;
export const amount = (value: number) => Math.min(1, Math.max(0, value));
export const ease = (t: number) => t * t * (3 - 2 * t);

// A second, gentle pullback runs across the tile jumps.
export function airborneFraming(elapsed: number): number {
  return 1 - .09 * ease(amount((elapsed - LIFT_START_MS) / (LANDING_MS - LIFT_START_MS)));
}

export function landingCamera(age: number): { approach: number; overshoot: number } {
  return {
    approach: ease(amount(age / PUSH_IN_MS)),
    overshoot: .022 * (age <= PUSH_IN_MS
      ? ease(amount((age - 96) / (PUSH_IN_MS - 96)))
      : 1 - ease(amount((age - PUSH_IN_MS) / RECOIL_RETURN_MS))),
  };
}

export function landingTileOpacity(age: number): number {
  return 1 - ease(amount((age - COLOUR_BLEND_START_MS) / COLOUR_BLEND_MS));
}

export function victoryChromeOpacity(elapsed: number): number {
  return 1 - ease(amount((elapsed - LIFT_START_MS) / (LANDING_MS - LIFT_START_MS - 60)));
}

export function tileDelays(points: readonly Point[], origin: Point): number[] {
  const distances = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y));
  const farthest = Math.max(1, ...distances);
  return distances.map(distance => Math.ceil(distance / farthest * DELAY_BANDS) * DELAY_STEP_MS);
}

export function tileJump(elapsed: number, delay: number): number {
  const age = elapsed - LIFT_START_MS - delay;
  if (age < RISE_MS) return ease(amount(age / RISE_MS));
  return 1 - amount((age - RISE_MS - CREST_MS) / RETURN_MS) ** 3;
}
