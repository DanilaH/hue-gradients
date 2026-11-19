import { OneShotPlayer } from '@danilah/mini-games-kit/audio';
import type { Preferences } from '../domain/workspace';

export type FeedbackCue = 'swap' | 'win';
export type Haptic = (cue: FeedbackCue) => void;
const glass = [694, 727, 753] as const;
export const WIN_GLINT_DELAY_MS = 98;

/** A dry contact excites inharmonic glass modes. A win continues the same contact into an interval. */
function makeBuffer(context: AudioContext, cue: FeedbackCue, variant: number): AudioBuffer {
  const duration = cue === 'win' ? .56 : .136;
  const count = Math.ceil(context.sampleRate * duration), pitch = glass[variant]!;
  const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
  let seed = 97 + variant, previousNoise = 0;
  const tone = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);
  for (let i = 0; i < count; i++) {
    const t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    let sample = .20 * (noise - previousNoise) * Math.exp(-t * 445) + .15 * tone(184, t) * Math.exp(-t * 108);
    previousNoise = noise;
    sample += .38 * tone(pitch, t) * Math.exp(-t * 34) +
      .20 * tone(pitch * 2.67, t) * Math.exp(-t * 60) + .10 * tone(pitch * 4.14, t) * Math.exp(-t * 102);
    if (cue === 'win') {
      for (const [delay, ratio, gain] of [[.047, 1.25, .15], [WIN_GLINT_DELAY_MS / 1000, 1.5, .20]] as const) {
        const local = t - delay;
        if (local > 0) sample += gain * tone(pitch * ratio, local) * Math.min(1, local / .014) * Math.exp(-local * 7.3);
      }
    }
    data[i] = sample * Math.min(1, t / .0018, (duration - t) / .014);
  }
  return buffer;
}
export class GameFeedback {
  private readonly buffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
  private readonly player = new OneShotPlayer({ groups: { glass: { minIntervalMs: 0, replacementFadeMs: 9 } }, maxVoices: 4, resumeDeadlineMs: 90 });
  private variant = 0;
  private preferences: Preferences = { sound: false, haptics: false, motion: false };
  private blocked = true;
  constructor(private readonly haptic: Haptic = cue => { try { navigator.vibrate?.(cue === 'win' ? [12, 30, 18] : 8); } catch {} }) {}
  configure(preferences: Preferences, blocked: boolean): void {
    this.preferences = preferences; this.blocked = blocked;
    const eligible = !blocked && preferences.sound;
    this.player.setEligibility({ gameplay: eligible, ui: eligible });
    if (!eligible) this.player.cancel();
  }
  accepted(cue: FeedbackCue): void {
    if (this.blocked) return;
    const variant = this.variant;
    this.variant = (variant + 1) % glass.length;
    if (this.preferences.sound) this.player.play({ group: 'glass', channel: 'ui', gain: .32,
      buffer: context => {
        const cache = this.buffers.get(context) ?? new Map<string, AudioBuffer>();
        const key = `${cue}:${variant}`, buffer = cache.get(key) ?? makeBuffer(context, cue, variant);
        cache.set(key, buffer); this.buffers.set(context, cache);
        return buffer;
      } });
    if (this.preferences.haptics) { try { this.haptic(cue); } catch { /* Feedback never decides whether a move committed. */ } }
  }
  destroy(): void { this.player.dispose(); }
}
