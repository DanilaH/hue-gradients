import Phaser from 'phaser';
import type { Attempt, LevelDefinition } from '../domain/puzzle';
import { boardGeometry, cellAt, hitTest, type BoardGeometry, type Cell } from './geometry';

export const GAME_PRESENTABLE = 'hue:presentable';
interface Hooks { swap(from: number, to: number): void; pin(position: number): void; paint(): void; interaction?(value: { x: number; y: number; color: string } | null): void }
interface Gesture { id: number; from: number | null; x: number; y: number; latestX: number; latestY: number; drag: boolean; layout: string }

export class PuzzleScene extends Phaser.Scene {
  private art!: Phaser.GameObjects.Graphics;
  private level: LevelDefinition;
  private attempt: Attempt;
  private preview = false;
  private concealed = false;
  private enabled = true;
  private selected: number | null = null;
  private focused: number | null = null;
  private gesture: Gesture | null = null;
  private geometry!: BoardGeometry;
  private ratio = 1;
  private released: { from: number; to: number; dx: number; dy: number } | null = null;
  private settle: { from: number; to: number; dx: number; dy: number; started: number } | null = null;
  constructor(level: LevelDefinition, attempt: Attempt, private readonly hooks: Hooks) { super('puzzle'); this.level = level; this.attempt = attempt; }
  create(): void {
    this.art = this.add.graphics();
    const canvas = this.game.canvas;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'group');
    canvas.setAttribute('aria-label', 'Цветовое поле. Стрелки — клетка, Enter — выбрать и обменять, Escape — отмена.');
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel); canvas.addEventListener('keydown', this.key);
    this.scale.on('resize', this.resized, this);
    this.events.once('shutdown', () => {
      this.cancel(); this.scale.off('resize', this.resized, this);
      canvas.removeEventListener('pointerdown', this.down); canvas.removeEventListener('pointermove', this.move);
      canvas.removeEventListener('pointerup', this.up); canvas.removeEventListener('pointercancel', this.cancel);
      canvas.removeEventListener('lostpointercapture', this.cancel); canvas.removeEventListener('keydown', this.key);
    });
    this.draw();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.game.events.emit(GAME_PRESENTABLE));
  }
  setView(level: LevelDefinition, attempt: Attempt, preview: boolean, enabled: boolean, concealed = false): void {
    if (this.level !== level) this.focused = null;
    if (this.level !== level || this.attempt !== attempt || preview !== this.preview || concealed !== this.concealed || !enabled) this.cancel();
    this.level = level; this.attempt = attempt; this.preview = preview; this.concealed = concealed;
    this.enabled = enabled && !attempt.completed && !preview && !concealed;
    if (this.art) this.draw();
  }
  presentSwap(previous: Attempt, next: Attempt, from: number, to: number, motion: boolean, cost = 1): void {
    const release = this.released; this.released = null;
    if (!motion || previous.attemptId !== next.attemptId || next.moves !== previous.moves + cost ||
        previous.board[from] !== next.board[to] || previous.board[to] !== next.board[from]) return;
    this.settle = { from, to, dx: release?.from === from && release.to === to ? release.dx : 0,
      dy: release?.from === from && release.to === to ? release.dy : 0, started: performance.now() };
    this.game.canvas.dataset.settling = 'true'; this.draw();
  }
  isAnimating(): boolean { return this.settle !== null; }
  update(): void {
    if (!this.settle) return;
    if (performance.now() - this.settle.started >= 150) this.finishSettle();
    this.draw();
  }
  private finishSettle(): void { this.settle = null; if (this.game?.canvas) this.game.canvas.dataset.settling = 'false'; }
  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private layoutKey(): string {
    const r = this.game.canvas.getBoundingClientRect(), parent = this.game.canvas.parentElement!.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height, parent.width, parent.height, window.innerWidth, window.innerHeight].join(':');
  }
  private down = (event: PointerEvent): void => {
    if (!this.enabled || this.gesture || event.button !== 0) return;
    this.finishSettle();
    const { x, y } = this.point(event);
    this.gesture = { id: event.pointerId, from: hitTest(this.geometry, x, y), x, y, latestX: x, latestY: y, drag: false, layout: this.layoutKey() };
    this.respond(this.gesture.from, x, y);
    this.game.canvas.setPointerCapture(event.pointerId); this.draw(); event.preventDefault();
  };
  private move = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (g.layout !== this.layoutKey()) { this.cancel(); return; }
    const { x, y } = this.point(event); g.latestX = x; g.latestY = y;
    if (Math.hypot(x - g.x, y - g.y) >= 8 && g.from !== null && !this.level.pinnedPositions.includes(g.from)) g.drag = true;
    if (g.drag) this.respond(g.from, x, y);
    this.draw();
  };
  private up = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (g.layout !== this.layoutKey()) { this.cancel(); return; }
    this.move(event); // Final coordinates, independent of pointermove/render delivery.
    const { x, y } = this.point(event), target = hitTest(this.geometry, x, y);
    this.gesture = null;
    if (this.game.canvas.hasPointerCapture(event.pointerId)) this.game.canvas.releasePointerCapture(event.pointerId);
    if (!this.enabled) { this.cancel(); return; }
    if (g.drag) {
      this.selected = null;
      if (g.from !== null && target !== null && target !== g.from && !this.level.pinnedPositions.includes(target)) {
        this.released = { from: g.from, to: target, dx: x - g.x, dy: y - g.y }; this.hooks.swap(g.from, target);
      }
    } else if (g.from === target) this.tap(target);
    else this.selected = null;
    this.hooks.interaction?.(null);
    this.draw();
  };
  private tap(position: number | null): void {
    if (position === null || this.level.pinnedPositions.includes(position)) {
      this.selected = null; if (position !== null) this.hooks.pin(position); return;
    }
    if (this.selected === null) this.selected = position;
    else {
      const from = this.selected; this.selected = null;
      if (from !== position) { this.released = { from, to: position, dx: 0, dy: 0 }; this.hooks.swap(from, position); }
    }
  }
  cancel = (event?: PointerEvent): void => {
    // Releasing capture after a completed tap must not erase its tap–tap selection.
    if (event && (!this.gesture || event.pointerId !== this.gesture.id)) return;
    this.finishSettle(); this.hooks.interaction?.(null);
    const id = this.gesture?.id; this.gesture = null; this.selected = null;
    if (id !== undefined && this.game?.canvas?.hasPointerCapture(id)) this.game.canvas.releasePointerCapture(id);
    if (this.art) this.draw();
  };
  private key = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    this.finishSettle();
    let position = this.focused ?? 0;
    if (event.key === 'Escape') this.cancel();
    else if (event.key === 'ArrowRight') position = Math.min(this.attempt.board.length - 1, position + 1);
    else if (event.key === 'ArrowLeft') position = Math.max(0, position - 1);
    else if (event.key === 'ArrowDown') position = Math.min(this.attempt.board.length - 1, position + this.level.width);
    else if (event.key === 'ArrowUp') position = Math.max(0, position - this.level.width);
    else if (event.key === 'Enter' || event.key === ' ') this.tap(position);
    else return;
    event.preventDefault(); this.focused = position; this.draw();
  };
  private resized(): void { this.cancel(); this.draw(); }
  private respond(position: number | null, x: number, y: number): void {
    if (position === null || this.level.pinnedPositions.includes(position)) { this.hooks.interaction?.(null); return; }
    this.hooks.interaction?.({ x, y, color: this.level.solvedTileColors[this.attempt.board[position]!]! });
  }
  private brackets(cell: Cell): void {
    const inset = 4, length = Math.min(13, cell.width * .18, cell.height * .18);
    const art = this.art;
    for (const [width, color] of [[4, 0x151020], [2, 0xfff3df]] as const) {
      art.lineStyle(width, color).beginPath();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = cell.x + (sx === 1 ? inset : cell.width - inset);
        const y = cell.y + (sy === 1 ? inset : cell.height - inset);
        art.moveTo(x, y + sy * length).lineTo(x, y).lineTo(x + sx * length, y);
      }
      art.strokePath();
    }
  }
  private trailingLight(cell: Cell, dx: number, dy: number, alpha: number): void {
    const { x, y, width, height } = cell;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const left = dx >= 0 ? x + 1 : x + width - 1, top = dy >= 0 ? y + 1 : y + height - 1;
    const art = this.art;
    for (const [weight, color, strength] of [[4, 0xf4b8ff, .28], [1.4, 0xfff4df, .97]] as const) {
      art.lineStyle(weight, color, alpha * strength);
      if (horizontal) art.lineBetween(left, y + 4, left, y + height - 4);
      else art.lineBetween(x + 4, top, x + width - 4, top);
    }
  }
  private draw(): void {
    const rect = this.game.canvas.getBoundingClientRect();
    this.ratio = this.scale.width / Math.max(1, rect.width);
    this.geometry = boardGeometry(rect.width, rect.height, this.level.width, this.level.height);
    this.art.clear().setScale(this.ratio);
    const tile = (position: number, dx = 0, dy = 0, lifted = false): void => {
      const cell = cellAt(this.geometry, position), tileId = this.preview ? position : this.attempt.board[position]!;
      if (lifted) this.art.fillStyle(0x100e1c, .65).fillRoundedRect(cell.x + dx + 3, cell.y + dy + 5, cell.width, cell.height, cell.radius);
      const pinned = this.level.pinnedPositions.includes(position);
      const color = this.concealed && !pinned ? 0x2f263d : Number.parseInt(this.level.solvedTileColors[tileId]!.slice(1), 16);
      this.art.fillStyle(color);
      this.art.fillRoundedRect(cell.x + dx, cell.y + dy, cell.width, cell.height, cell.radius);
      if (pinned) {
        const cx = cell.x + cell.width / 2, cy = cell.y + cell.height / 2;
        this.art.fillStyle(0x101019).fillCircle(cx, cy, 5).fillStyle(0xffffff).fillCircle(cx, cy, 2.5);
      }
      if (position === this.focused && !lifted) {
        this.art.lineStyle(4, 0x101019).strokeRoundedRect(cell.x + dx + 3, cell.y + dy + 3, cell.width - 6, cell.height - 6, cell.radius);
        this.art.lineStyle(2, 0xffffff).strokeRoundedRect(cell.x + dx + 3, cell.y + dy + 3, cell.width - 6, cell.height - 6, cell.radius);
      }
      if (!lifted && (position === this.selected || (this.gesture?.from === position && !this.gesture.drag))) {
        this.brackets({ ...cell, x: cell.x + dx, y: cell.y + dy });
      }
    };
    const settle = this.settle, g = this.gesture;
    const lifted = g?.drag ? g.from : null;
    for (let i = 0; i < this.attempt.board.length; i++) {
      if (i === lifted) {
        const cell = cellAt(this.geometry, i);
        this.art.fillStyle(0x282031, .83).fillRoundedRect(cell.x, cell.y, cell.width, cell.height, cell.radius);
        this.art.lineStyle(1, 0xd9c5e2, .42).strokeRoundedRect(cell.x + 2, cell.y + 2, cell.width - 4, cell.height - 4, cell.radius);
      } else if (!settle || (i !== settle.from && i !== settle.to)) tile(i);
    }
    if (settle) {
      const from = cellAt(this.geometry, settle.from), to = cellAt(this.geometry, settle.to);
      const remaining = (1 - Math.min(1, (performance.now() - settle.started) / 150)) ** 3;
      tile(settle.from, (to.x - from.x) * remaining, (to.y - from.y) * remaining);
      const dx = (from.x - to.x + settle.dx) * remaining, dy = (from.y - to.y + settle.dy) * remaining;
      tile(settle.to, dx, dy);
      if (settle.dx || settle.dy) this.trailingLight({ ...to, x: to.x + dx, y: to.y + dy }, settle.dx, settle.dy, remaining);
    }
    if (g && lifted !== null) {
      const target = hitTest(this.geometry, g.latestX, g.latestY);
      if (target !== null && target !== lifted && !this.level.pinnedPositions.includes(target)) this.brackets(cellAt(this.geometry, target));
      const cell = cellAt(this.geometry, lifted), dx = g.latestX - g.x, dy = g.latestY - g.y;
      tile(lifted, dx, dy, true);
      this.trailingLight({ ...cell, x: cell.x + dx, y: cell.y + dy }, dx, dy, 1);
    }
    this.hooks.paint();
  }
}
