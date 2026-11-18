import { exponentialResponse } from '@danilah/mini-games-kit/feel';
import type { LevelDefinition } from '../domain/puzzle';

export type RGB = readonly [number, number, number];
export interface ColourPointer { x: number; y: number; color: string }
const rgb = (hex: string): RGB => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)) as unknown as RGB;
/** Uses only visible tile colours and positions. No solution score, distance or minimum enters this function. */
export function spatialPalette(level: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors'>, board: readonly number[]): RGB[] {
  const samples: RGB[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    let weight = 0; const sum = [0, 0, 0];
    for (let position = 0; position < board.length; position++) {
      const px = (position % level.width + .5) / level.width, py = (Math.floor(position / level.width) + .5) / level.height;
      const w = Math.exp(-((px - (x + .5) / 3) ** 2 + (py - (y + .5) / 3) ** 2) / .07);
      const color = rgb(level.solvedTileColors[board[position]!]!);
      for (let c = 0; c < 3; c++) sum[c] = sum[c]! + color[c]! * w;
      weight += w;
    }
    samples.push(sum.map(v => v / weight) as unknown as RGB);
  }
  return samples;
}

export class Atmosphere {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly grain: CanvasPattern | null;
  private target: RGB[] = [];
  private current: RGB[] = [];
  private level: LevelDefinition | null = null;
  private board: readonly number[] | null = null;
  private pointer: ColourPointer | null = null;
  private active = false;
  private motion = true;
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private pointerPower = 0;
  private pointerHeld = false;
  private framesDrawn = 0;
  constructor(private readonly root: HTMLElement) {
    this.canvas.className = 'atmosphere'; this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    const grain = document.createElement('canvas'); grain.width = grain.height = 64;
    const context = grain.getContext('2d')!, data = context.createImageData(64, 64);
    let seed = 1831;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = seed >>> 24; data.data[i + 3] = 255;
    }
    context.putImageData(data, 0, 0); this.grain = this.ctx.createPattern(grain, 'repeat');
    root.prepend(this.canvas); this.resize();
  }
  resize(): void {
    const r = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.min(240, Math.round(r.width / 2))), height = Math.max(1, Math.min(320, Math.round(r.height / 2)));
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width; this.canvas.height = height;
    this.draw();
  }
  setModel(level: LevelDefinition, board: readonly number[]): void {
    if (this.level === level && this.board === board) return;
    this.level = level; this.board = board; this.target = spatialPalette(level, board);
    if (!this.current.length || !this.motion) this.current = this.target.map(c => [...c] as unknown as RGB);
    if (!this.active || !this.motion) { this.current = this.target; this.draw(); }
  }
  configure(active: boolean, motion: boolean): void {
    this.motion = motion; this.active = active;
    if (!active || !motion) {
      cancelAnimationFrame(this.frame); this.frame = 0; this.last = 0; this.pointer = null; this.pointerPower = 0;
      this.current = this.target; this.draw();
    } else if (!this.frame) { this.last = 0; this.frame = requestAnimationFrame(this.tick); }
    this.canvas.dataset.motion = String(active && motion);
  }
  interaction(pointer: ColourPointer | null): void {
    if (!this.active || !this.motion) return;
    this.pointerHeld = pointer !== null;
    if (pointer) { this.pointer = pointer; this.pointerPower = 1; }
  }
  private tick = (now: number): void => {
    this.frame = 0;
    if (!this.active || !this.motion) return;
    if (!this.last || now - this.last >= 1000 / 24) {
      const delta = this.last ? Math.min(80, now - this.last) : 0; this.last = now; this.elapsed += delta;
      const alpha = exponentialResponse(delta, 420);
      this.current = this.target.map((color, i) => color.map((v, c) => this.current[i]![c]! + (v - this.current[i]![c]!) * alpha) as unknown as RGB);
      if (!this.pointerHeld) this.pointerPower *= Math.exp(-delta / 300);
      this.draw();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  private draw(): void {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#151020'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    const time = this.motion ? this.elapsed / 1000 : 0;
    this.current.forEach((c, i) => {
      const x = ((i % 3 + .45) / 3 + Math.sin(time * .13 + i) * .04) * w;
      const y = ((Math.floor(i / 3) + .5) / 3 + Math.cos(time * .11 + i * 1.7) * .035) * h;
      const radius = Math.min(w, h) * .62, gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const middle = (Math.max(...c) + Math.min(...c)) / 2;
      const colour = c.map(v => Math.min(255, Math.max(0, Math.round(middle + (v - middle) * 2.3 + 10)))).join(',');
      gradient.addColorStop(0, `rgba(${colour},.70)`); gradient.addColorStop(.4, `rgba(${colour},.32)`); gradient.addColorStop(1, `rgba(${colour},0)`);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    });
    if (this.pointer && this.pointerPower > .02) {
      const p = this.pointer, radius = Math.max(w, h) * .45;
      const gradient = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, radius);
      gradient.addColorStop(0, p.color + '85'); gradient.addColorStop(1, p.color + '00');
      ctx.globalAlpha = this.pointerPower * .6; ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .15, w / 2, h / 2, Math.max(w, h) * .66);
    edge.addColorStop(0, '#100c1c00'); edge.addColorStop(.65, '#100c1c20'); edge.addColorStop(1, '#100c1cb8');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    if (this.grain) { ctx.globalAlpha = .08; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = this.grain; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    this.canvas.dataset.frames = String(++this.framesDrawn);
  }
  destroy(): void { this.active = false; cancelAnimationFrame(this.frame); this.canvas.remove(); }
}
