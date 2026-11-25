import type { TilePosition, Vertex } from '../domain/tileShapes';

export interface BoardGeometry { x: number; y: number; width: number; height: number; columns: number; rows: number; gap: number; radius: number; positions?: readonly TilePosition[]; voronoi?: true }
export interface Cell { x: number; y: number; width: number; height: number; radius: number; points?: readonly Vertex[]; center?: Vertex }
export function boardGeometry(width: number, height: number, columns: number, rows: number, positions?: readonly TilePosition[], voronoi = false): BoardGeometry {
  return { x: 0, y: 4, width, height: Math.max(rows, height - 8), columns, rows, gap: 1, radius: 3, ...(positions ? { positions } : {}), ...(voronoi ? { voronoi: true } : {}) };
}
export function cellAt(board: BoardGeometry, position: number): Cell {
  const shaped = board.positions?.[position];
  if (shaped) {
    const xs = shaped.vertices.map(([x]) => x), ys = shaped.vertices.map(([, y]) => y);
    const left = Math.min(...xs), top = Math.min(...ys);
    const points = shaped.vertices.map(([x,y]) => [(x - left) * board.width, (y - top) * board.height] as const);
    return { x: board.x + left * board.width, y: board.y + top * board.height,
      width: (Math.max(...xs) - left) * board.width, height: (Math.max(...ys) - top) * board.height, radius: 0, points,
      ...(shaped.center ? { center: [board.x + shaped.center[0] * board.width, board.y + shaped.center[1] * board.height] } : {}),
    };
  }
  const w = board.width / board.columns, h = board.height / board.rows;
  return { x: board.x + position % board.columns * w + board.gap / 2,
    y: board.y + Math.floor(position / board.columns) * h + board.gap / 2,
    width: w - board.gap, height: h - board.gap, radius: Math.min(board.radius, w / 4, h / 4) };
}
function polygonContains(vertices: readonly Vertex[], x: number, y: number): boolean {
  let side = 0;
  for (let index = 0; index < vertices.length; index++) {
    const [x1, y1] = vertices[index]!, [x2, y2] = vertices[(index + 1) % vertices.length]!;
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (Math.abs(cross) <= 0.000000001) continue;
    const next = Math.sign(cross);
    if (side && side !== next) return false;
    side = next;
  }
  return true;
}
export function cellCenter(cell: Cell): { x: number; y: number } {
  if (cell.center) return { x: cell.center[0], y: cell.center[1] };
  if (!cell.points) return { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
  const count = cell.points.length;
  return { x: cell.x + cell.points.reduce((sum, point) => sum + point[0], 0) / count,
    y: cell.y + cell.points.reduce((sum, point) => sum + point[1], 0) / count };
}

/** Implicit Voronoi regions in authored board units, stable at any screen size. */
export function nearestTile(positions: readonly TilePosition[], columns: number, rows: number, u: number, v: number): number {
  let closest = 0, distance = Infinity;
  for (const [index, { center }] of positions.entries()) {
    if (!center) continue;
    const value = ((center[0] - u) * columns) ** 2 + ((center[1] - v) * rows) ** 2;
    if (value < distance) { distance = value; closest = index; }
  }
  return closest;
}

interface Point { x: number; y: number }
export function dropCandidate(touch: Point, center: Point, hit: (x: number, y: number) => number | null,
  accepts: (position: number) => boolean): number | null {
  for (const point of [{ x: (touch.x + center.x) / 2, y: (touch.y + center.y) / 2 }, touch, center]) {
    const position = hit(point.x, point.y);
    if (position !== null && accepts(position)) return position;
  }
  return null;
}

export function hitTest(board: BoardGeometry, x: number, y: number): number | null {
  const dx = x - board.x, dy = y - board.y;
  if (!(dx >= 0 && dx < board.width && dy >= 0 && dy < board.height)) return null;
  if (board.voronoi && board.positions) {
    return nearestTile(board.positions, board.columns, board.rows, dx / board.width, dy / board.height);
  }
  if (board.positions) {
    for (let position = board.positions.length - 1; position >= 0; position--) {
      if (polygonContains(board.positions[position]!.vertices, dx / board.width, dy / board.height)) return position;
    }
    return null;
  }
  // Rounded paint leaves decorative seams. Logical cells are contiguous, with the seam owned by the right/lower cell.
  const col = Math.min(board.columns - 1, Math.floor(dx / (board.width / board.columns)));
  const row = Math.min(board.rows - 1, Math.floor(dy / (board.height / board.rows)));
  return row * board.columns + col;
}
