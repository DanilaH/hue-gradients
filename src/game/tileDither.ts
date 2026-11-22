const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const period = 4;

export function orderedGrain(context: CanvasRenderingContext2D, pixel: (rank: number) => readonly number[]): CanvasPattern {
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = period;
  const ink = stamp.getContext('2d')!;
  const data = ink.createImageData(period, period);
  const shades = bayer.map(pixel);
  for (let y = 0; y < period; y++) for (let x = 0; x < period; x++) {
    data.data.set(shades[y * period + x]!, (y * period + x) * 4);
  }
  ink.putImageData(data, 0, 0);
  return context.createPattern(stamp, 'repeat')!;
}

export class TileDither {
  private readonly colours = new Map<string, CanvasPattern>();
  constructor(private readonly context: CanvasRenderingContext2D) {}

  colour(hex: string, lit = false): CanvasPattern {
    const key = lit ? hex + ':light' : hex;
    const cached = this.colours.get(key);
    if (cached) return cached;
    // Each complete period averages to the original sRGB, even near channel endpoints.
    const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
    const ink = orderedGrain(this.context, rank => [
      ...channels.map(base => {
        const delta = Math.min(lit ? 21 : 11, base, 255 - base);
        const step = rank < 4 ? -delta : rank < 8 ? -Math.floor(delta / 3)
          : rank < 12 ? Math.floor(delta / 3) : delta;
        return base + step;
      }), 255,
    ]);
    if (this.colours.size >= 384) this.colours.clear();
    this.colours.set(key, ink);
    return ink;
  }
}
