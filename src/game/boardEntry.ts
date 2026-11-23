import type { Attempt, LevelDefinition } from '../domain/puzzle';
import { boardGeometry, cellAt, type Cell } from './geometry';
import { TileDither } from './tileDither';

export interface EntrySource {
  bounds: DOMRect;
  viewport: readonly [number, number];
  board: readonly number[] | null;
}

export function readEntrySource(art: SVGSVGElement | null, board: readonly number[] | null): EntrySource | null {
  const matrix = art?.getScreenCTM(), view = art?.viewBox.baseVal;
  if (!matrix || !view || !view.width || !view.height) return null;
  const { x, y } = new DOMPoint(view.x, view.y).matrixTransform(matrix);
  return { bounds: new DOMRect(x, y, matrix.a * view.width, matrix.d * view.height),
    viewport: [window.innerWidth, window.innerHeight], board };
}

const interpolate = (from: number, to: number, fraction: number) => from + (to - from) * fraction;
const progress = (elapsed: number) => Math.max(0, Math.min(1, elapsed));
const ease = (t: number) => t * t * (3 - 2 * t);

export class BoardEntry {
  private readonly canvas = document.createElement('canvas');
  private frame = 0;
  private viewport: EntrySource['viewport'] | null = null;
  constructor(private readonly root: HTMLElement) {
    this.canvas.className = 'board-entry';
    this.canvas.setAttribute('aria-hidden', 'true');
  }
  get active(): boolean { return this.canvas.isConnected; }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.remove();
    delete this.root.dataset.boardEntry;
    this.viewport = null;
  }
  viewportChanged(): boolean {
    return !!this.viewport && (this.viewport[0] !== window.innerWidth || this.viewport[1] !== window.innerHeight);
  }

  play(source: EntrySource, board: DOMRect, level: LevelDefinition, attempt: Attempt, finish: () => void): void {
    if (source.viewport[0] !== window.innerWidth || source.viewport[1] !== window.innerHeight) return;
    this.stop();
    this.viewport = source.viewport;
    const root = this.root.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(root.width * dpr);
    this.canvas.height = Math.round(root.height * dpr);
    const context = this.canvas.getContext('2d')!;
    context.scale(dpr, dpr);
    const dither = new TileDither(context);
    const startingBoard = { ...boardGeometry(source.bounds.width, source.bounds.height, level.width, level.height, level.positions),
      x: source.bounds.x - root.x, y: source.bounds.y - root.y, height: source.bounds.height, gap: 0 };
    const targetBoard = { ...boardGeometry(board.width, board.height, level.width, level.height, level.positions),
      x: board.x - root.x, y: board.y - root.y + 4 };
    const scale = Math.min(targetBoard.width / startingBoard.width, targetBoard.height / startingBoard.height);
    const fitted = { ...startingBoard, width: startingBoard.width * scale, height: startingBoard.height * scale,
      x: targetBoard.x + (targetBoard.width - startingBoard.width * scale) / 2,
      y: targetBoard.y + (targetBoard.height - startingBoard.height * scale) / 2 };
    const incoming = source.board ?? level.solvedTileColors.map((_, index) => index);
    const shuffle = incoming.some((tile, position) => tile !== attempt.board[position]);
    const close = 290, duration = shuffle ? 635 : 360;
    const targets = new Map(attempt.board.map((tile, position) => [tile, cellAt(targetBoard, position)]));
    const flights = incoming.map((tile, position) => ({
      color: level.solvedTileColors[tile]!, origin: cellAt(startingBoard, position),
      seat: cellAt(fitted, position), destination: targets.get(tile)!,
      anchor: level.pinnedPositions.includes(position),
    }));

    const face = (cell: Cell, width: number, height: number) => {
      context.beginPath();
      if (!cell.points) context.rect(0, 0, width, height);
      else {
        cell.points.forEach(([px, py], index) => {
          const x = px * width / cell.width, y = py * height / cell.height;
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.closePath();
      }
    };
    const started = performance.now();
    const draw = (now: number) => {
      const elapsed = now - started;
      const zoom = ease(progress(elapsed / close));
      const spread = ease(progress((elapsed - close) / (duration - close)));
      context.clearRect(0, 0, root.width, root.height);
      for (const tile of flights) {
        const { origin, seat, destination, anchor } = tile;
        const x = interpolate(origin.x, seat.x, zoom) + (destination.x - seat.x) * spread;
        const y = interpolate(origin.y, seat.y, zoom) + (destination.y - seat.y) * spread;
        const width = interpolate(interpolate(origin.width, seat.width, zoom), destination.width, spread);
        const height = interpolate(interpolate(origin.height, seat.height, zoom), destination.height, spread);
        context.save();
        context.translate(x, y);
        face(spread > .995 ? destination : origin, width, height);
        context.fillStyle = dither.colour(tile.color);
        context.fill();
        if (anchor) {
          const dot = Math.min(5, width / 8, height / 8) * zoom;
          for (const [radius, color] of [[dot, '#101019'], [dot / 2, '#fff3df']] as const) {
            context.beginPath(); context.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
            context.fillStyle = color; context.fill();
          }
        }
        context.restore();
      }
      if (elapsed >= duration) { this.stop(); finish(); }
      else this.frame = requestAnimationFrame(draw);
    };
    this.root.append(this.canvas);
    this.root.dataset.boardEntry = 'true';
    draw(started);
  }
}
