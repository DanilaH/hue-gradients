const chords = [
  [110, 164.81, 220],
  [98, 146.83, 196],
  [87.31, 130.81, 174.61],
  [98, 146.83, 220],
] as const;

function makeLoop(context: AudioContext): AudioBuffer {
  const sampleRate = 22050, beat = 3, duration = chords.length * beat;
  const buffer = context.createBuffer(1, sampleRate * duration, sampleRate);
  const signal = buffer.getChannelData(0);
  for (let sample = 0; sample < signal.length; sample++) {
    const seconds = sample / sampleRate;
    const part = Math.floor(seconds / beat), local = seconds - part * beat;
    const envelope = Math.sin(Math.PI * local / beat) ** 2;
    const harmony = chords[part]!;
    let output = 0;
    harmony.forEach((frequency, index) => {
      const phase = 2 * Math.PI * frequency * local;
      output += Math.sin(phase + .14 * Math.sin(local * (index + 1))) * (.28 / (index + 1));
      output += Math.sin(phase * 2) * .022;
    });
    signal[sample] = output * envelope;
  }
  return buffer;
}

/** Original score. Its loop and lifecycle are independent of the short feedback voice. */
export class AmbientMusic {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private enabled = false;

  unlock(): void {
    if (this.context) {
      if (this.enabled) void this.context.resume().catch(() => {});
      return;
    }
    try {
      this.context = new AudioContext();
      if (this.enabled) this.play();
    } catch { /* A driver can reject audio without blocking the game. */ }
  }

  configure(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!this.context) return;
    try {
      if (enabled) this.play();
      else void this.context.suspend().catch(() => {});
    } catch { /* Audio remains optional if its driver becomes unavailable. */ }
  }

  private play(): void {
    const context = this.context;
    if (!context) return;
    if (!this.source) {
      const source = context.createBufferSource();
      source.buffer = makeLoop(context);
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = .105;
      source.connect(gain).connect(context.destination);
      source.start();
      this.source = source;
    }
    void context.resume().catch(() => {});
  }

  destroy(): void {
    this.source?.stop();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null; this.source = null;
  }
}
