import { cellAt, type BoardGeometry } from './geometry';

export interface Point { x: number; y: number }
export interface Camera extends Point { zoom: number }
export const REST_CAMERA: Readonly<Camera> = Object.freeze({ zoom: 1, x: 0, y: 0 });

export function clampCamera(board: BoardGeometry, requested: Camera): Camera {
  const zoom = Math.max(1, Math.min(3, requested.zoom));
  return { zoom, x: Math.min(0, Math.max(board.width * (1 - zoom), requested.x)),
    y: Math.min(0, Math.max(board.height * (1 - zoom), requested.y)) };
}

export function moveCamera(board: BoardGeometry, from: Camera, anchor: Point, at: Point, scale: number): Camera {
  const zoom = Math.max(1, Math.min(3, scale));
  const ratio = zoom / from.zoom;
  return clampCamera(board, { zoom, x: at.x - board.x - (anchor.x - board.x - from.x) * ratio,
    y: at.y - board.y - (anchor.y - board.y - from.y) * ratio });
}

export function viewBoard(board: BoardGeometry, camera: Camera): BoardGeometry {
  return { ...board, x: board.x + camera.x, y: board.y + camera.y,
    width: board.width * camera.zoom, height: board.height * camera.zoom };
}

export function revealCell(board: BoardGeometry, camera: Camera, position: number): Camera {
  const cell = cellAt(viewBoard(board, camera), position);
  const reveal = (start: number, length: number, frameStart: number, frameLength: number) => {
    if (length > frameLength) return frameStart + (frameLength - length) / 2 - start;
    return Math.max(0, frameStart - start) + Math.min(0, frameStart + frameLength - start - length);
  };
  return clampCamera(board, { zoom: camera.zoom, x: camera.x + reveal(cell.x, cell.width, board.x, board.width),
    y: camera.y + reveal(cell.y, cell.height, board.y, board.height) });
}

export function edgeVelocity(board: BoardGeometry, camera: Camera, at: Point): Point {
  if (camera.zoom === 1 || at.x < board.x || at.x >= board.x + board.width || at.y < board.y || at.y >= board.y + board.height) {
    return { x: 0, y: 0 };
  }
  const axis = (at: number, length: number, offset: number) => {
    const band = Math.min(32, length / 6);
    if (at < band && offset < 0) return (1 - at / band) * 380;
    if (at > length - band && offset > length * (1 - camera.zoom)) return -(1 - (length - at) / band) * 380;
    return 0;
  };
  return { x: axis(at.x - board.x, board.width, camera.x), y: axis(at.y - board.y, board.height, camera.y) };
}
