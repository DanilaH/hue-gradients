export interface BoardGeometry { x: number; y: number; width: number; height: number; columns: number; rows: number; gap: number; radius: number }
export interface Cell { x: number; y: number; width: number; height: number; radius: number }
export function boardGeometry(width: number, height: number, columns: number, rows: number): BoardGeometry {
  return { x: 0, y: 4, width, height: Math.max(rows, height - 8), columns, rows, gap: 1, radius: 3 };
}
export function cellAt(board: BoardGeometry, position: number): Cell {
  const w = board.width / board.columns, h = board.height / board.rows;
  return { x: board.x + position % board.columns * w + board.gap / 2,
    y: board.y + Math.floor(position / board.columns) * h + board.gap / 2,
    width: w - board.gap, height: h - board.gap, radius: Math.min(board.radius, w / 4, h / 4) };
}
export function hitTest(board: BoardGeometry, x: number, y: number): number | null {
  const dx = x - board.x, dy = y - board.y;
  if (!(dx >= 0 && dx < board.width && dy >= 0 && dy < board.height)) return null;
  // Rounded paint leaves decorative seams. Logical cells are contiguous, with the seam owned by the right/lower cell.
  const col = Math.min(board.columns - 1, Math.floor(dx / (board.width / board.columns)));
  const row = Math.min(board.rows - 1, Math.floor(dy / (board.height / board.rows)));
  return row * board.columns + col;
}
