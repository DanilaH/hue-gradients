import { OneShotPlayer } from '@danilah/mini-games-kit/audio';
import type { Preferences } from '../domain/workspace';

export type FeedbackCue = 'swap' | 'win';
type SoundCue = FeedbackCue | 'book' | 'setting';
export type Haptic = (cue: FeedbackCue) => void;
const glass = [694, 727, 753] as const;
/** A bright dry contact for swaps and a lower impact for a joined field. */
function makeBuffer(context: AudioContext, cue: SoundCue, variant: number): AudioBuffer {
  const duration = cue === 'win' ? .24 : cue === 'swap' ? .136 : .072;
  const count = Math.ceil(context.sampleRate * duration), pitch = glass[variant]!;
  const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
  let seed = 97 + variant, previousNoise = 0;
  const tone = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);
  for (let i = 0; i < count; i++) {
    const t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    const contact = (noise - previousNoise) * Math.exp(-t * 445);
    previousNoise = noise;
    const sample = cue === 'win'
      ? .14 * contact + .56 * Math.sin(2 * Math.PI * (69 * t + .34 * (1 - Math.exp(-t * 32)))) * Math.exp(-t * 19)
        + .25 * tone(142, t) * Math.exp(-t * 29) + .15 * tone(294, t) * Math.exp(-t * 62)
      : cue === 'book' || cue === 'setting'
        ? .46 * contact + .34 * tone(cue === 'book' ? 360 : 510, t) * Math.exp(-t * 112)
        : .20 * contact + .15 * tone(184, t) * Math.exp(-t * 108) + .38 * tone(pitch, t) * Math.exp(-t * 34)
        + .20 * tone(pitch * 2.67, t) * Math.exp(-t * 60) + .10 * tone(pitch * 4.14, t) * Math.exp(-t * 102);
    data[i] = sample * Math.min(1, t / .0018, (duration - t) / .014);
  }
  return buffer;
}
type FeedbackPreferences = Pick<Preferences, 'sound' | 'haptics'>;

export class GameFeedback {
  private readonly buffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
  private readonly player = new OneShotPlayer({ groups: { glass: { minIntervalMs: 0, replacementFadeMs: 9 } }, maxVoices: 4, resumeDeadlineMs: 90 });
  private variant = 0;
  private preferences: FeedbackPreferences = { sound: false, haptics: false };
  private blocked = true;
  constructor(private readonly haptic: Haptic = cue => { try { navigator.vibrate?.(cue === 'win' ? 22 : 8); } catch {} }) {}
  configure(preferences: FeedbackPreferences, blocked: boolean): void {
    this.preferences = preferences; this.blocked = blocked;
    const eligible = !blocked && preferences.sound;
    this.player.setEligibility({ gameplay: eligible, ui: eligible });
    if (!eligible) this.player.cancel();
  }
  accepted(cue: FeedbackCue): void {
    if (this.blocked) return;
    this.sound(cue);
    if (this.preferences.haptics) { try { this.haptic(cue); } catch { /* Feedback never decides whether a move committed. */ } }
  }
  sound(cue: SoundCue): void {
    if (this.blocked || !this.preferences.sound) return;
    const variant = this.variant;
    if (cue === 'swap' || cue === 'win') this.variant = (variant + 1) % glass.length;
    this.player.play({ group: 'glass', channel: 'ui', gain: .32,
      buffer: context => {
        const cache = this.buffers.get(context) ?? new Map<string, AudioBuffer>();
        const key = `${cue}:${variant}`, buffer = cache.get(key) ?? makeBuffer(context, cue, variant);
        cache.set(key, buffer); this.buffers.set(context, cache);
        return buffer;
      } });
  }
  destroy(): void { this.player.dispose(); }
}
