export type TileShape = 'rect' | 'triangle-nw' | 'triangle-se' | 'hex';
export type Vertex = readonly [x: number, y: number];
export interface TilePosition {
  readonly shape: TileShape;
  readonly vertices: readonly Vertex[];
}
export interface StartRecipe {
  readonly version: 'shape-start-1';
  readonly mode: 'repair-fixed' | 'group-cycle';
  readonly seed: number;
}
export const RECTANGLE: TileShape = 'rect';

export function validPosition(position: TilePosition): boolean {
  const sizes = { rect: 4, 'triangle-nw': 3, 'triangle-se': 3, hex: 6 };
  if (!position || !Object.prototype.hasOwnProperty.call(sizes, position.shape) ||
      position.vertices.length !== sizes[position.shape]) return false;
  let twiceArea = 0;
  for (let index = 0; index < position.vertices.length; index++) {
    const [x, y] = position.vertices[index]!;
    const [nextX, nextY] = position.vertices[(index + 1) % position.vertices.length]!;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return false;
    twiceArea += x * nextY - y * nextX;
  }
  return Math.abs(twiceArea) > 0.00001;
}
