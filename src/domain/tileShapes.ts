export type TileShape = 'rect' | 'triangle-nw' | 'triangle-ne' | 'triangle-se' | 'triangle-sw' | 'hex' | 'step';
export type ShapeFamily = 'rect' | 'triangle' | 'hex' | 'step';
export type Vertex = readonly [x: number, y: number];
export interface TilePosition {
  readonly shape: TileShape;
  readonly vertices: readonly Vertex[];
  readonly family?: ShapeFamily;
  readonly quarterTurns?: number;
  readonly center?: Vertex;
}
export interface StartRecipe {
  readonly version: 'shape-start-1';
  readonly mode: 'repair-fixed' | 'group-cycle';
  readonly seed: number;
}
export function validOrientedPosition(position: TilePosition): boolean {
  if (!validPosition(position) || !position.center || position.center.length !== 2
      || !position.center.every(coordinate => coordinate >= 0 && coordinate <= 1)) return false;
  const orientation = ['triangle-nw', 'triangle-ne', 'triangle-se', 'triangle-sw'].indexOf(position.shape);
  if (orientation !== -1) return position.family === 'triangle' && position.quarterTurns === orientation;
  return position.family === position.shape
    && (position.quarterTurns === 0 || position.shape === 'step' && position.quarterTurns === 2);
}

export const RECTANGLE: TileShape = 'rect';

export function validPosition(position: TilePosition): boolean {
  const sizes = { rect: 4, 'triangle-nw': 3, 'triangle-ne': 3, 'triangle-se': 3, 'triangle-sw': 3, hex: 6, step: 10 };
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
