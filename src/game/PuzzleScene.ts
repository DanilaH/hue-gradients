import Phaser from 'phaser';
import type { Attempt, LevelDefinition } from '../domain/puzzle';
import { boardGeometry, cellAt, hitTest, type BoardGeometry } from './geometry';

export const GAME_PRESENTABLE = 'hue:presentable';
interface Hooks { swap(from: number, to: number): void; pin(): void; paint(): void }
interface Gesture { id: number; from: number | null; x: number; y: number; latestX: number; latestY: number; drag: boolean; layout: string }

export class PuzzleScene extends Phaser.Scene {
  private art!: Phaser.GameObjects.Graphics;
  private level: LevelDefinition;
  private attempt: Attempt;
  private preview = false;
  private enabled = true;
  private selected: number | null = null;
  private focused: number | null = null;
  private gesture: Gesture | null = null;
  private geometry!: BoardGeometry;
  private ratio = 1;
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
  setView(level: LevelDefinition, attempt: Attempt, preview: boolean, enabled: boolean): void {
    if (this.level !== level) this.focused = null;
    if (this.level !== level || this.attempt !== attempt || preview !== this.preview || !enabled) this.cancel();
    this.level = level; this.attempt = attempt; this.preview = preview; this.enabled = enabled && !attempt.completed && !preview;
    if (this.art) this.draw();
  }
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
    const { x, y } = this.point(event);
    this.gesture = { id: event.pointerId, from: hitTest(this.geometry, x, y), x, y, latestX: x, latestY: y, drag: false, layout: this.layoutKey() };
    this.game.canvas.setPointerCapture(event.pointerId); this.draw(); event.preventDefault();
  };
  private move = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (g.layout !== this.layoutKey()) { this.cancel(); return; }
    const { x, y } = this.point(event); g.latestX = x; g.latestY = y;
    if (Math.hypot(x - g.x, y - g.y) >= 8 && g.from !== null && !this.level.pinnedPositions.includes(g.from)) g.drag = true;
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
      if (g.from !== null && target !== null && target !== g.from && !this.level.pinnedPositions.includes(target)) this.hooks.swap(g.from, target);
    } else if (g.from === target) this.tap(target);
    else this.selected = null;
    this.draw();
  };
  private tap(position: number | null): void {
    if (position === null || this.level.pinnedPositions.includes(position)) {
      this.selected = null; if (position !== null) this.hooks.pin(); return;
    }
    if (this.selected === null) this.selected = position;
    else {
      const from = this.selected; this.selected = null;
      if (from !== position) this.hooks.swap(from, position);
    }
  }
  cancel = (event?: PointerEvent): void => {
    // Releasing capture after a completed tap must not erase its tap–tap selection.
    if (event && (!this.gesture || event.pointerId !== this.gesture.id)) return;
    const id = this.gesture?.id; this.gesture = null; this.selected = null;
    if (id !== undefined && this.game?.canvas?.hasPointerCapture(id)) this.game.canvas.releasePointerCapture(id);
    if (this.art) this.draw();
  };
  private key = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
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
  private draw(): void {
    const rect = this.game.canvas.getBoundingClientRect();
    this.ratio = this.scale.width / Math.max(1, rect.width);
    this.geometry = boardGeometry(rect.width, rect.height, this.level.width, this.level.height);
    this.art.clear().setScale(this.ratio);
    const tile = (position: number, dx = 0, dy = 0): void => {
      const cell = cellAt(this.geometry, position), tileId = this.preview ? position : this.attempt.board[position]!;
      this.art.fillStyle(Number.parseInt(this.level.solvedTileColors[tileId]!.slice(1), 16));
      this.art.fillRoundedRect(cell.x + dx, cell.y + dy, cell.width, cell.height, cell.radius);
      if (this.level.pinnedPositions.includes(position)) {
        const cx = cell.x + cell.width / 2, cy = cell.y + cell.height / 2;
        this.art.fillStyle(0x101019).fillCircle(cx, cy, 5).fillStyle(0xffffff).fillCircle(cx, cy, 2.5);
      }
      if (position === this.selected || position === this.focused || (this.gesture?.from === position && !this.gesture.drag)) {
        this.art.lineStyle(4, 0x101019).strokeRoundedRect(cell.x + dx + 3, cell.y + dy + 3, cell.width - 6, cell.height - 6, cell.radius);
        this.art.lineStyle(2, 0xffffff).strokeRoundedRect(cell.x + dx + 3, cell.y + dy + 3, cell.width - 6, cell.height - 6, cell.radius);
      }
    };
    for (let i = 0; i < this.attempt.board.length; i++) tile(i);
    const g = this.gesture;
    if (g?.drag && g.from !== null) tile(g.from, g.latestX - g.x, g.latestY - g.y);
    this.hooks.paint();
  }
}
