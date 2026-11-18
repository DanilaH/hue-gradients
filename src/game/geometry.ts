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
export function contains(cell: Cell, x: number, y: number): boolean {
  if (x < cell.x || y < cell.y || x >= cell.x + cell.width || y >= cell.y + cell.height) return false;
  const cx = Math.max(cell.x + cell.radius, Math.min(x, cell.x + cell.width - cell.radius));
  const cy = Math.max(cell.y + cell.radius, Math.min(y, cell.y + cell.height - cell.radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= cell.radius ** 2;
}
export function hitTest(board: BoardGeometry, x: number, y: number): number | null {
  const col = Math.floor((x - board.x) / (board.width / board.columns));
  const row = Math.floor((y - board.y) / (board.height / board.rows));
  if (col < 0 || col >= board.columns || row < 0 || row >= board.rows) return null;
  const position = row * board.columns + col;
  return contains(cellAt(board, position), x, y) ? position : null;
}
