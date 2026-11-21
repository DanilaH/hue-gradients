import { expect, test } from 'vitest';
import { clampCamera, edgeVelocity, moveCamera, REST_CAMERA, revealCell, viewBoard } from '../src/game/boardCamera';
import { boardGeometry, cellAt, hitTest } from '../src/game/geometry';

test('zoom keeps the gesture anchor on the same tile and panning respects bounds', () => {
  const board = boardGeometry(390, 628, 13, 13);
  const anchor = { x: 195, y: 314 };
  const moved = { x: 235, y: 280 };
  const camera = moveCamera(board, REST_CAMERA, anchor, moved, 2);
  expect(hitTest(viewBoard(board, camera), moved.x, moved.y)).toBe(hitTest(board, anchor.x, anchor.y));
  expect(clampCamera(board, { zoom: 7, x: -900, y: 10 })).toEqual({ zoom: 3, x: -780, y: 0 });
  expect(edgeVelocity(board, camera, { x: 382, y: 314 }).x).toBeLessThan(0);
  expect(edgeVelocity(board, camera, { x: 391, y: 314 })).toEqual({ x: 0, y: 0 });
  expect(edgeVelocity(board, REST_CAMERA, { x: 382, y: 314 })).toEqual({ x: 0, y: 0 });
});

test('revealing keyboard focus keeps the entire tile in view at each corner', () => {
  const board = boardGeometry(390, 628, 13, 13);
  let camera = clampCamera(board, { zoom: 2.44, x: -280, y: -450 });
  for (const position of [0, 12, 168, 156, 0]) {
    camera = revealCell(board, camera, position);
    const cell = cellAt(viewBoard(board, camera), position);
    expect(cell.x).toBeGreaterThanOrEqual(board.x - 0.01);
    expect(cell.y).toBeGreaterThanOrEqual(board.y - 0.01);
    expect(cell.x + cell.width).toBeLessThanOrEqual(board.x + board.width + 0.01);
    expect(cell.y + cell.height).toBeLessThanOrEqual(board.y + board.height + 0.01);
  }
  expect(revealCell(board, camera, 1)).toEqual(camera);
});
