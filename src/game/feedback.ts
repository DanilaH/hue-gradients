import { OneShotPlayer } from '@danilah/mini-games-kit/audio';
import type { Preferences } from '../domain/workspace';

export type FeedbackCue = 'swap' | 'win';
export type Haptic = (cue: FeedbackCue) => void;
/** Original procedural sounds, cached per AudioContext; no downloads or pending audio queue. */
function makeBuffer(context: AudioContext, cue: FeedbackCue): AudioBuffer {
  const duration = cue === 'win' ? .55 : .095, count = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) {
    const t = i / context.sampleRate;
    if (cue === 'swap') {
      const envelope = Math.min(1, t / .006) * Math.exp(-t * 48) * Math.min(1, (duration - t) / .012);
      data[i] = .45 * envelope * (Math.sin(2 * Math.PI * 330 * t) + .2 * Math.sin(2 * Math.PI * 660 * t));
    } else {
      let sample = 0;
      for (const [note, start] of [[261.626, 0], [329.628, .045], [391.995, .09]]) {
        const local = t - start!;
        if (local >= 0) sample += Math.sin(2 * Math.PI * note! * local) * Math.min(1, local / .014) * Math.exp(-local * 7.5);
      }
      data[i] = .22 * sample * Math.min(1, (duration - t) / .06);
    }
  }
  return buffer;
}
export class GameFeedback {
  private readonly buffers = new WeakMap<AudioContext, Partial<Record<FeedbackCue, AudioBuffer>>>();
  private readonly player = new OneShotPlayer({ groups: { swap: { minIntervalMs: 0, replacementFadeMs: 12 }, win: { minIntervalMs: 250 } }, maxVoices: 4, resumeDeadlineMs: 90 });
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
    if (this.preferences.sound) this.player.play({ group: cue, channel: 'ui', gain: cue === 'win' ? .25 : .22,
      buffer: context => { const cached = this.buffers.get(context) ?? {}; cached[cue] ??= makeBuffer(context, cue); this.buffers.set(context, cached); return cached[cue]!; } });
    if (this.preferences.haptics) { try { this.haptic(cue); } catch { /* Feedback never decides whether a move committed. */ } }
  }
  destroy(): void { this.player.dispose(); }
}
