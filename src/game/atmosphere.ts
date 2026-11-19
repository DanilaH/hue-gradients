import { exponentialResponse } from '@danilah/mini-games-kit/feel';
import type { LevelDefinition } from '../domain/puzzle';

export type RGB = readonly [number, number, number];
export interface ColourPointer { x: number; y: number; color: string }
const rgb = (hex: string): RGB => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)) as unknown as RGB;

// Coloured lighting gels for the nine spatial samples. They also light the chapter menu.
const gels = ['#DC5CEA', '#8160EB', '#38DABC', '#F69D6E', '#BD5EDC', '#4AC7ED', '#BD7CFA', '#ED729F', '#546AE1'].map(rgb);
const dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Uses only visible tile colours and positions. No solution score, distance or minimum enters this function. */
export function spatialPalette(level: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors'>, board: readonly number[] | null): RGB[] {
  const samples: RGB[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    let weight = 0; const sum = [0, 0, 0];
    for (let position = 0; position < level.solvedTileColors.length; position++) {
      const px = (position % level.width + .5) / level.width, py = (Math.floor(position / level.width) + .5) / level.height;
      const w = Math.exp(-((px - (x + .5) / 3) ** 2 + (py - (y + .5) / 3) ** 2) / .07);
      const color = rgb(level.solvedTileColors[board?.[position] ?? position]!);
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
  private readonly texture: CanvasPattern | null;
  private target: RGB[] = gels;
  private current: RGB[] = gels;
  private level: LevelDefinition | null = null;
  private board: readonly number[] | null = null;
  private pointer: ColourPointer | null = null;
  private ripple: (ColourPointer & { started: number; win: boolean }) | null = null;
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
    const pattern = document.createElement('canvas'); pattern.width = pattern.height = 4;
    const context = pattern.getContext('2d')!, data = context.createImageData(4, 4);
    for (let i = 0; i < data.data.length; i += 4) {
      const value = dither[i / 4]! * 17;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value; data.data[i + 3] = 255;
    }
    context.putImageData(data, 0, 0); this.texture = this.ctx.createPattern(pattern, 'repeat');
    root.prepend(this.canvas); this.resize();
  }
  resize(): void {
    const r = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.min(160, Math.round(r.width / 3))), height = Math.max(1, Math.min(240, Math.round(r.height / 3)));
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width; this.canvas.height = height;
    this.draw();
  }
  placeInside(host: HTMLElement): void {
    if (this.canvas.parentElement === host) return;
    host.prepend(this.canvas);
    this.pointer = null; this.pointerPower = 0; this.pointerHeld = false; this.ripple = null;
  }
  setModel(level: LevelDefinition | null, board: readonly number[] | null): void {
    if (this.level === level && this.board === board) return;
    this.level = level; this.board = board; this.target = level ? spatialPalette(level, board) : gels;
    if (!this.active || !this.motion) { this.current = this.target; this.draw(); }
  }
  configure(active: boolean, motion: boolean): void {
    this.motion = motion; this.active = active;
    if (!active || !motion) {
      cancelAnimationFrame(this.frame); this.frame = 0; this.last = 0;
      this.pointer = null; this.pointerPower = 0; this.pointerHeld = false; this.ripple = null;
      this.current = this.target; this.draw();
    } else if (!this.frame) { this.last = 0; this.frame = requestAnimationFrame(this.tick); }
    this.canvas.dataset.motion = String(active && motion);
  }
  interaction(pointer: ColourPointer | null): void {
    if (!this.active || !this.motion) return;
    this.pointerHeld = pointer !== null;
    if (pointer) { this.pointer = pointer; this.pointerPower = 1; }
  }
  accepted(pointer: ColourPointer, win: boolean): void {
    if (this.active && this.motion) this.ripple = { ...pointer, win, started: this.elapsed };
  }
  private tick = (now: number): void => {
    this.frame = 0;
    if (!this.active || !this.motion) return;
    if (!this.last || now - this.last >= 1000 / 24) {
      const delta = this.last ? Math.min(80, now - this.last) : 0; this.last = now; this.elapsed += delta;
      const alpha = exponentialResponse(delta, 260);
      this.current = this.target.map((color, i) => color.map((v, c) => this.current[i]![c]! + (v - this.current[i]![c]!) * alpha) as unknown as RGB);
      if (!this.pointerHeld) this.pointerPower *= Math.exp(-delta / 235);
      this.draw();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  private draw(): void {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#241639'; ctx.fillRect(0, 0, w, h);
    const time = this.motion ? this.elapsed / 1000 : 0;
    const ripple = this.ripple;
    const age = ripple ? (this.elapsed - ripple.started) / 1000 : 0;
    const energy = ripple ? Math.exp(-age / (ripple.win ? .68 : .29)) : 0;
    this.current.forEach((c, i) => {
      const x = ((i % 3 + .46) / 3 + Math.sin(time * .56 + i * 1.17) * .093) * w;
      const y = ((Math.floor(i / 3) + .48) / 3 + Math.cos(time * .39 + i * 1.7) * .079) * h;
      const radius = Math.min(w, h) * (.63 + energy * .17 + Math.sin(time * .47 + i) * .085);
      const gradient = ctx.createRadialGradient(x, y, radius * .07, x, y, radius);
      const middle = (Math.max(...c) + Math.min(...c)) / 2;
      const colour = c.map((v, channel) => Math.min(255, Math.max(0,
        Math.round((middle + (v - middle) * 1.95) * .57 + gels[i]![channel]! * .43 + 12)))).join(',');
      gradient.addColorStop(0, `rgba(${colour},.94)`); gradient.addColorStop(.37, `rgba(${colour},.68)`); gradient.addColorStop(1, `rgba(${colour},0)`);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = 'screen';
    // These three broad reflections give the fog luminosity without whitening every palette sample.
    for (const [x, y, phase, color] of [[.10, .32, .4, '#ffad8a'], [.89, .24, 2.9, '#6bf3e6'], [.27, .78, 4.5, '#da80ff']] as const) {
      const cx = (x + Math.sin(time * .46 + phase) * .11) * w;
      const cy = (y + Math.cos(time * .38 + phase) * .08) * h;
      const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * .52);
      light.addColorStop(0, color + '70'); light.addColorStop(1, color + '00');
      ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    }
    if (this.pointer && this.pointerPower > .02) {
      const p = this.pointer, radius = Math.max(w, h) * .52;
      const gradient = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, radius);
      gradient.addColorStop(0, p.color + '85'); gradient.addColorStop(1, p.color + '00');
      ctx.globalAlpha = this.pointerPower * .84; ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    if (ripple && energy > .02) {
      const x = ripple.x * w, y = ripple.y * h;
      const radius = Math.max(w, h) * (.21 + Math.min(age, 1.6) * (ripple.win ? .68 : .88));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, ripple.color + '70'); gradient.addColorStop(.47, '#f2b5e6a0'); gradient.addColorStop(1, '#8ccfef00');
      ctx.globalAlpha = energy * .86; ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .19, w / 2, h / 2, Math.max(w, h) * .59);
    edge.addColorStop(0, '#150d2900'); edge.addColorStop(.62, '#150d291b'); edge.addColorStop(1, '#150d296e');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    if (this.texture) { ctx.globalAlpha = .085; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = this.texture; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    this.canvas.dataset.frames = String(++this.framesDrawn);
  }
  destroy(): void { this.active = false; cancelAnimationFrame(this.frame); this.canvas.remove(); }
}
