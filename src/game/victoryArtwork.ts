import type { LevelDefinition } from '../domain/puzzle';
import type { Point } from './boardCamera';
import { paintGradientThumbnail } from './exportRenderer';
import type { BoardGeometry } from './geometry';
import { orderedGrain } from './tileDither';
import { amount, colourRecoil, WAVE_MS } from './victoryMotion';

interface Spray extends Point {
  vx: number;
  vy: number;
  color: string;
  starts: number;
  size: number;
}

const SPRAY_LIFETIME_MS = 380;

export class VictoryArtwork {
  private readonly colour = document.createElement('div');
  private readonly art = document.createElement('canvas');
  private readonly effects = document.createElement('canvas');
  private readonly ctx = this.effects.getContext('2d')!;
  private readonly grain = orderedGrain(this.ctx, rank => rank >= 11 ? [255, 240, 223, 225] : [40, 18, 52, 95]);
  private shown: LevelDefinition | null = null;
  private spray: Spray[] = [];
  private waveEnd = 0;

  constructor(private readonly host: HTMLElement) {
    this.art.className = 'victory-art';
    this.effects.className = 'victory-effects';
    this.colour.className = 'victory-colour';
    this.colour.setAttribute('aria-hidden', 'true');
    this.colour.append(this.art, this.effects);
    host.append(this.colour);
  }
  show(level: LevelDefinition | null): void {
    if (this.shown === level) return;
    this.shown = level;
    this.clearMotion();
    if (!level) return;
    const side = 288;
    this.art.width = Math.max(side, level.width);
    this.art.height = Math.max(side * 2, level.height);
    paintGradientThumbnail(this.art, level);
  }
  start(level: LevelDefinition, board: BoardGeometry, origin: Point): number {
    const { width, height } = this.host.getBoundingClientRect();
    this.effects.width = Math.max(1, Math.round(width));
    this.effects.height = Math.max(1, Math.round(height));
    this.waveEnd = Math.hypot(
      Math.max(origin.x, width - origin.x),
      Math.max(origin.y, height - origin.y),
    );
    const from: Spray[] = [];
    for (const [nx, ny] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) for (const t of [.22, .51, .79]) {
      const u = nx ? (nx + 1) / 2 : t, v = ny ? (ny + 1) / 2 : t;
      const x = board.x + board.width * u, y = board.y + board.height * v;
      const colour = level.solvedTileColors[Math.round(v * (level.height - 1)) * level.width + Math.round(u * (level.width - 1))]!;
      const starts = WAVE_MS * Math.hypot(x - origin.x, y - origin.y) / Math.max(1, this.waveEnd);
      for (let i = 0; i < 3; i++) {
        const speed = 54 + ((from.length * 37) % 90);
        const spread = (i - 1) * 54 + (t - .5) * 48;
        from.push({ x, y, starts: starts + i * 12, color: colour,
          vx: nx * speed + ny * spread, vy: ny * speed + nx * spread, size: i === 1 ? 5 : 3 });
      }
    }
    this.spray = from;
    return Math.max(WAVE_MS, ...from.map(particle => particle.starts + SPRAY_LIFETIME_MS));
  }
  frame(age: number, origin: Point): void {
    const { ctx } = this;
    const w = this.effects.width, h = this.effects.height;
    ctx.clearRect(0, 0, w, h);
    const recoil = colourRecoil(age);
    this.colour.style.transform = recoil ? `translateY(${recoil}px)` : '';
    if (age < WAVE_MS) {
      const travel = amount(age / WAVE_MS);
      ctx.globalAlpha = .58 * (1 - travel ** 3);
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, Math.max(1, travel * this.waveEnd), 0, 2 * Math.PI);
      ctx.lineWidth = 7 + 10 * travel;
      ctx.strokeStyle = this.grain;
      ctx.stroke();
    }
    for (const p of this.spray) {
      const life = age - p.starts;
      if (life < 0 || life >= SPRAY_LIFETIME_MS) continue;
      const time = life / 1000;
      const x = Math.round((p.x + p.vx * time) / 2) * 2;
      const y = Math.round((p.y + p.vy * time + 95 * time ** 2) / 2) * 2;
      ctx.globalAlpha = Math.min(1, (1 - life / SPRAY_LIFETIME_MS) * 1.8);
      ctx.fillStyle = '#2e153b';
      ctx.fillRect(x + 1, y + 1, p.size, p.size);
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  clearMotion(): void {
    this.spray = [];
    this.colour.style.transform = '';
    this.ctx.clearRect(0, 0, this.effects.width, this.effects.height);
  }
}
