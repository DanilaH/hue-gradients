import Phaser from 'phaser';
import { canSwap, type Attempt, type LevelDefinition } from '../domain/puzzle';
import { boardGeometry, cellAt, cellCenter, hitTest, type BoardGeometry, type Cell } from './geometry';
import { TileDither } from './tileDither';
import { amount, ease, LANDING_MS, tileJump, VICTORY_END_MS } from './victoryMotion';
import { clampCamera, edgeVelocity, moveCamera, REST_CAMERA, revealCell, viewBoard, type Camera, type Point } from './boardCamera';

export const GAME_PRESENTABLE = 'hue:presentable';
interface Hooks { swap(from: number, to: number): void; pin(position: number): void; paint(): void; interaction?(value: { x: number; y: number; color: string } | null): void }
interface Gesture { id: number; from: number | null; x: number; y: number; latestX: number; latestY: number; drag: boolean; layout: string; camera: Camera }
interface Navigation { anchor: Point; distance: number; camera: Camera }

export class PuzzleScene extends Phaser.Scene {
  private drawable = false;
  private dither: TileDither | null = null;
  private level: LevelDefinition;
  private attempt: Attempt;
  private preview = false;
  private concealed = false;
  private enabled = true;
  private selected: number | null = null;
  private focused: number | null = null;
  private gesture: Gesture | null = null;
  private geometry!: BoardGeometry;
  private natural!: BoardGeometry;
  private camera: Camera = REST_CAMERA;
  private readonly touches = new Map<number, Point>();
  private navigation: Navigation | null = null;
  private victory: { started: number; from: Camera; at: number; frame(elapsed: number, board: BoardGeometry, origin: Point): void } | null = null;
  private released: { from: number; to: number; dx: number; dy: number } | null = null;
  private settle: { from: number; to: number; dx: number; dy: number; started: number } | null = null;
  constructor(level: LevelDefinition, attempt: Attempt, private readonly hooks: Hooks) { super('puzzle'); this.level = level; this.attempt = attempt; }
  create(): void {
    // A single Canvas renderer keeps clip paths and repeating tile ink in the same paint pass.
    const artwork = Object.assign(new Phaser.GameObjects.GameObject(this, 'Board artwork'), {
      renderCanvas: (renderer: Phaser.Renderer.Canvas.CanvasRenderer) => this.paintBoard(renderer.currentContext),
    });
    this.add.existing(artwork);
    this.drawable = true;
    const canvas = this.game.canvas;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'group');
    this.labelBoard();
    canvas.addEventListener('pointerdown', this.down); canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up); canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel); canvas.addEventListener('keydown', this.key);
    this.scale.on('resize', this.resized, this);
    this.events.once('shutdown', () => {
      this.drawable = false; this.victory = null; this.cancel(); this.scale.off('resize', this.resized, this);
      canvas.removeEventListener('pointerdown', this.down); canvas.removeEventListener('pointermove', this.move);
      canvas.removeEventListener('pointerup', this.up); canvas.removeEventListener('pointercancel', this.cancel);
      canvas.removeEventListener('lostpointercapture', this.cancel); canvas.removeEventListener('keydown', this.key);
    });
    this.draw();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.game.events.emit(GAME_PRESENTABLE));
  }
  setView(level: LevelDefinition, attempt: Attempt, preview: boolean, enabled: boolean, concealed = false): void {
    const switched = this.level !== level;
    if (switched) { this.focused = null; this.camera = REST_CAMERA; }
    if (this.level !== level || this.attempt !== attempt || preview !== this.preview || concealed !== this.concealed || !enabled && !this.victory) this.cancel();
    this.level = level; this.attempt = attempt; this.preview = preview; this.concealed = concealed;
    this.enabled = enabled && !attempt.completed && !preview && !concealed;
    if (this.drawable) { if (switched) this.labelBoard(); this.draw(); }
  }
  presentSwap(previous: Attempt, next: Attempt, from: number, to: number, motion: boolean, cost = 1): void {
    const release = this.released; this.released = null;
    if (!motion || previous.attemptId !== next.attemptId || next.moves !== previous.moves + cost ||
        previous.board[from] !== next.board[to] || previous.board[to] !== next.board[from]) return;
    this.settle = { from, to, dx: release?.from === from && release.to === to ? release.dx : 0,
      dy: release?.from === from && release.to === to ? release.dy : 0, started: performance.now() };
    this.game.canvas.dataset.settling = 'true'; this.draw();
  }
  presentVictory(at: number, frame: NonNullable<PuzzleScene['victory']>['frame']): void {
    this.victory = { started: this.settle?.started ?? performance.now(), from: this.camera, at, frame };
    this.draw();
  }
  finishVictory(): void {
    if (!this.victory) return;
    this.victory = null;
    this.finishSettle();
    this.camera = REST_CAMERA;
    if (this.drawable) this.draw();
  }
  private large(): boolean { return this.level.width > 6 || this.level.height > 5; }
  private labelBoard(): void {
    const basic = 'Цветовое поле. Стрелки — клетка, Enter — выбрать и обменять, Escape — отмена.';
    this.game.canvas.setAttribute('aria-label', this.large()
      ? basic + ' Масштаб и перемещение двумя пальцами. На клавиатуре плюс и минус.'
      : basic);
  }
  boardCell(position: number): Cell { return cellAt(this.geometry, position); }
  private edge(): Point {
    const gesture = this.gesture;
    return gesture?.drag && this.camera.zoom > 1
      ? edgeVelocity(this.natural, this.camera, { x: gesture.latestX, y: gesture.latestY }) : { x: 0, y: 0 };
  }
  isAnimating(): boolean {
    const edge = this.edge();
    return this.victory !== null || this.settle !== null || edge.x !== 0 || edge.y !== 0;
  }
  update(_time: number, delta: number): void {
    const edge = this.edge();
    if (!this.victory && !this.settle && !edge.x && !edge.y) return;
    if (this.victory) {
      const beat = this.victory, elapsed = performance.now() - beat.started;
      this.draw();
      beat.frame(elapsed, this.geometry, cellCenter(cellAt(this.geometry, beat.at)));
      if (elapsed >= VICTORY_END_MS) this.finishVictory();
      return;
    }
    if (this.settle && performance.now() - this.settle.started >= 150) this.finishSettle();
    if (edge.x || edge.y) {
      const seconds = Math.min(delta, 40) / 1000;
      this.camera = clampCamera(this.natural, { zoom: this.camera.zoom,
        x: this.camera.x + edge.x * seconds, y: this.camera.y + edge.y * seconds });
    }
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
  private positionAt(x: number, y: number): number | null {
    const view = this.natural;
    if (x < view.x || x >= view.x + view.width || y < view.y || y >= view.y + view.height) return null;
    return hitTest(this.geometry, x, y);
  }
  private navPoints(): { anchor: Point; distance: number } {
    const [a, b] = this.touches.values();
    if (!b) return { anchor: a!, distance: 1 };
    return { anchor: { x: (a!.x + b.x) / 2, y: (a!.y + b.y) / 2 },
      distance: Math.max(1, Math.hypot(a!.x - b.x, a!.y - b.y)) };
  }
  private startNavigation(): void {
    this.finishSettle();
    this.gesture = null; this.selected = null; this.hooks.interaction?.(null);
    this.navigation = { ...this.navPoints(), camera: this.camera };
  }
  private gestureOffset(gesture: Gesture): Point {
    return { x: gesture.latestX - gesture.x + gesture.camera.x - this.camera.x,
      y: gesture.latestY - gesture.y + gesture.camera.y - this.camera.y };
  }
  private down = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    const { x, y } = this.point(event);
    const canvas = this.game.canvas;
    if (this.large() && event.pointerType === 'touch') {
      if (this.touches.size >= 2) return;
      this.touches.set(event.pointerId, { x, y });
      if (this.touches.size === 2) {
        this.startNavigation();
        canvas.setPointerCapture(event.pointerId);
        this.draw(); event.preventDefault();
        return;
      }
    }
    if (this.gesture) return;
    this.finishSettle();
    this.gesture = { id: event.pointerId, from: this.positionAt(x, y), x, y, latestX: x, latestY: y, drag: false,
      layout: this.layoutKey(), camera: this.camera };
    this.respond(this.gesture.from, x, y);
    this.game.canvas.setPointerCapture(event.pointerId); this.draw(); event.preventDefault();
  };
  private move = (event: PointerEvent): void => {
    if (this.touches.has(event.pointerId)) this.touches.set(event.pointerId, this.point(event));
    if (this.navigation && this.touches.has(event.pointerId)) {
      const next = this.navPoints();
      const initial = this.navigation;
      this.camera = moveCamera(this.natural, initial.camera, initial.anchor, next.anchor,
        initial.camera.zoom * next.distance / initial.distance);
      this.draw();
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (g.layout !== this.layoutKey()) { this.cancel(); return; }
    const { x, y } = this.point(event); g.latestX = x; g.latestY = y;
    if (Math.hypot(x - g.x, y - g.y) >= 8 && g.from !== null && !this.level.pinnedPositions.includes(g.from)) g.drag = true;
    if (g.drag) this.respond(g.from, x, y);
    this.draw();
  };
  private up = (event: PointerEvent): void => {
    if (this.touches.delete(event.pointerId) && this.navigation) {
      this.navigation = this.touches.size ? { ...this.navPoints(), camera: this.camera } : null;
      if (this.game.canvas.hasPointerCapture(event.pointerId)) this.game.canvas.releasePointerCapture(event.pointerId);
      this.draw();
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (g.layout !== this.layoutKey()) { this.cancel(); return; }
    this.move(event); // Final coordinates, independent of pointermove/render delivery.
    const { x, y } = this.point(event), target = this.positionAt(x, y);
    this.gesture = null;
    if (this.game.canvas.hasPointerCapture(event.pointerId)) this.game.canvas.releasePointerCapture(event.pointerId);
    if (!this.enabled) { this.cancel(); return; }
    if (g.drag) {
      this.selected = null;
      if (g.from !== null && target !== null && canSwap(this.level, g.from, target)) {
        const offset = this.gestureOffset(g);
        this.released = { from: g.from, to: target, dx: offset.x, dy: offset.y };
        this.hooks.swap(g.from, target);
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
      if (canSwap(this.level, from, position)) { this.released = { from, to: position, dx: 0, dy: 0 }; this.hooks.swap(from, position); }
    }
  }
  cancel = (event?: PointerEvent): void => {
    // Releasing capture after a completed tap must not erase its tap–tap selection.
    if (event && event.pointerId !== this.gesture?.id && !this.touches.has(event.pointerId)) return;
    this.finishSettle(); this.hooks.interaction?.(null);
    const ids = new Set(this.touches.keys());
    if (this.gesture) ids.add(this.gesture.id);
    this.touches.clear(); this.navigation = null; this.gesture = null; this.selected = null;
    for (const id of ids) {
      if (this.game?.canvas?.hasPointerCapture(id)) this.game.canvas.releasePointerCapture(id);
    }
    if (this.drawable) this.draw();
  };
  private key = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    this.finishSettle();
    let position = this.focused ?? 0;
    if (this.large() && ['+', '=', '-'].includes(event.key)) {
      this.cancel();
      const anchor = { x: this.natural.x + this.natural.width / 2, y: this.natural.y + this.natural.height / 2 };
      this.camera = moveCamera(this.natural, this.camera, anchor, anchor, this.camera.zoom * (event.key === '-' ? .8 : 1.25));
    }
    else if (event.key === 'Escape') this.cancel();
    else if (event.key === 'ArrowRight') position = Math.min(this.attempt.board.length - 1, position + 1);
    else if (event.key === 'ArrowLeft') position = Math.max(0, position - 1);
    else if (event.key === 'ArrowDown') position = Math.min(this.attempt.board.length - 1, position + this.level.width);
    else if (event.key === 'ArrowUp') position = Math.max(0, position - this.level.width);
    else if (event.key === 'Enter' || event.key === ' ') {
      // Pointer pan can move the last keyboard focus off-screen. Reveal it before using it.
      if (this.camera.zoom > 1) this.camera = revealCell(this.natural, this.camera, position);
      this.tap(position);
    }
    else return;
    event.preventDefault(); this.focused = position; this.draw(event.key !== 'Escape');
  };
  private resized(): void { this.cancel(); this.draw(); }
  private respond(position: number | null, x: number, y: number): void {
    if (position === null || this.level.pinnedPositions.includes(position)) { this.hooks.interaction?.(null); return; }
    this.hooks.interaction?.({ x, y, color: this.level.solvedTileColors[this.attempt.board[position]!]! });
  }
  private cellPath(ctx: CanvasRenderingContext2D, cell: Cell, inset = 0): void {
    ctx.beginPath();
    if (cell.points) {
      const cx = cell.width / 2, cy = cell.height / 2;
      const scale = inset ? .86 : .99;
      cell.points.forEach(([x, y], i) => {
        const px = cell.x + cx + (x - cx) * scale, py = cell.y + cy + (y - cy) * scale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
    } else {
      ctx.rect(cell.x + inset, cell.y + inset, Math.max(0, cell.width - 2 * inset), Math.max(0, cell.height - 2 * inset));
    }
  }
  private brackets(ctx: CanvasRenderingContext2D, cell: Cell): void {
    if (cell.points) this.cellPath(ctx, cell, 3);
    else {
      const inset = Math.min(4, cell.width / 5, cell.height / 5), length = Math.min(13, cell.width * .22, cell.height * .22);
      ctx.beginPath();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = cell.x + (sx === 1 ? inset : cell.width - inset);
        const y = cell.y + (sy === 1 ? inset : cell.height - inset);
        ctx.moveTo(x, y + sy * length); ctx.lineTo(x, y); ctx.lineTo(x + sx * length, y);
      }
    }
    ctx.lineWidth = 4; ctx.strokeStyle = '#151020'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff3df'; ctx.stroke();
  }
  private draw(followFocus = false): void {
    const rect = this.game.canvas.getBoundingClientRect();
    this.natural = boardGeometry(rect.width, rect.height, this.level.width, this.level.height, this.level.positions);
    this.camera = clampCamera(this.natural, this.camera);
    if (followFocus && this.camera.zoom > 1 && this.focused !== null) {
      this.camera = revealCell(this.natural, this.camera, this.focused);
    }
    if (this.victory) {
      const zoom = ease(amount((performance.now() - this.victory.started - 95) / 265));
      const fit = .94, from = this.victory.from;
      this.camera = { zoom: from.zoom + (fit - from.zoom) * zoom,
        x: from.x * (1 - zoom) + this.natural.width * (1 - fit) / 2 * zoom,
        y: from.y * (1 - zoom) + this.natural.height * (1 - fit) / 2 * zoom };
    }
    this.geometry = viewBoard(this.natural, this.camera);
    if (import.meta.env.DEV) this.game.canvas.dataset.camera = JSON.stringify(this.camera);
    this.hooks.paint();
  }
  private paintBoard(ctx: CanvasRenderingContext2D): void {
    const rect = this.game.canvas.getBoundingClientRect(), beat = this.victory;
    const elapsed = beat ? performance.now() - beat.started : 0;
    if (beat && elapsed >= LANDING_MS) return;
    ctx.save();
    ctx.setTransform(ctx.canvas.width / Math.max(1, rect.width), 0, 0, ctx.canvas.height / Math.max(1, rect.height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    const ink = this.dither ??= new TileDither(ctx);
    const origin = beat ? cellCenter(cellAt(this.geometry, beat.at)) : null;
    const diagonal = Math.max(1, Math.hypot(this.geometry.width, this.geometry.height));
    const pins = this.level.pinnedPositions;
    const paintShape = (cell: Cell, colour: string) => {
      this.cellPath(ctx, cell);
      ctx.fillStyle = colour;
      ctx.fill();
    };
    const tile = (position: number, dx = 0, dy = 0, held = false): void => {
      const cell = cellAt(this.geometry, position), tileId = this.preview ? position : this.attempt.board[position]!;
      const center = cellCenter(cell);
      const jump = origin ? tileJump(elapsed, center, origin, diagonal) : 0;
      const lift = jump * Math.min(18, Math.max(7, cell.height * .24));
      const scale = 1 + jump * .03;
      if (held || jump > 0) {
        paintShape({ ...cell, x: cell.x + dx + 3, y: cell.y + dy + 5 + lift * .22 }, 'rgba(16,14,28,.62)');
      }
      const pinned = pins.includes(position);
      const colour = this.concealed && !pinned ? '#2f263d' : this.level.solvedTileColors[tileId]!;
      ctx.save();
      ctx.translate(cell.x + dx - cell.width * (scale - 1) / 2, cell.y + dy - lift - cell.height * (scale - 1) / 2);
      ctx.scale(scale, scale);
      const face = { ...cell, x: 0, y: 0 };
      this.cellPath(ctx, face);
      ctx.fillStyle = ink.colour(colour);
      ctx.fill();
      if (held) {
        ctx.save();
        ctx.clip();
        const side = Math.abs(dx) >= Math.abs(dy);
        ctx.fillStyle = ink.colour(colour, true);
        ctx.fillRect(side && dx < 0 ? cell.width - 5 : 0, !side && dy < 0 ? cell.height - 5 : 0,
          side ? 5 : cell.width, side ? cell.height : 5);
        ctx.restore();
      }
      if (pinned) {
        const x = center.x - cell.x, y = center.y - cell.y, radius = Math.min(5, cell.width / 8, cell.height / 8);
        for (const [r, colour] of [[radius, '#101019'], [radius / 2, '#fff3df']] as const) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = colour; ctx.fill();
        }
      }
      if (!beat && !held && (position === this.focused || position === this.selected ||
          (this.gesture?.from === position && !this.gesture.drag))) this.brackets(ctx, face);
      ctx.restore();
    };
    const settle = elapsed >= 150 && beat ? null : this.settle, g = this.gesture;
    const lifted = g?.drag ? g.from : null;
    for (let i = 0; i < this.attempt.board.length; i++) {
      if (i === lifted) {
        const cell = cellAt(this.geometry, i);
        paintShape(cell, 'rgba(40,32,49,.83)');
        this.cellPath(ctx, cell, 2);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(217,197,226,.42)'; ctx.stroke();
      } else if (!settle || (i !== settle.from && i !== settle.to)) tile(i);
    }
    if (settle) {
      const from = cellAt(this.geometry, settle.from), to = cellAt(this.geometry, settle.to);
      const remaining = (1 - amount((performance.now() - settle.started) / 150)) ** 3;
      tile(settle.from, (to.x - from.x) * remaining, (to.y - from.y) * remaining);
      tile(settle.to, (from.x - to.x + settle.dx) * remaining, (from.y - to.y + settle.dy) * remaining);
    }
    if (g && lifted !== null) {
      const target = this.positionAt(g.latestX, g.latestY);
      if (target !== null && canSwap(this.level, lifted, target)) this.brackets(ctx, cellAt(this.geometry, target));
      const offset = this.gestureOffset(g);
      tile(lifted, offset.x, offset.y, true);
    }
    ctx.restore();
  }
}
