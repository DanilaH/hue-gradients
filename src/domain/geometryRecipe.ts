import type { TilePosition, Vertex } from './tileShapes';

export const GEOMETRY_VERSION = 'center-voronoi-1';
export const GEOMETRY_START_VERSION = 'geometry-cycle-1';

export interface GeometryIdentity {
  readonly version: typeof GEOMETRY_VERSION;
  readonly template: string;
  readonly palette: string;
  readonly paletteTier: 'Lo' | 'Hi';
  readonly corners: readonly [string, string, string, string];
}

const rgb = /^#[0-9a-f]{6}$/i;

export function validGeometryIdentity(identity: GeometryIdentity): boolean {
  return identity.version === GEOMETRY_VERSION && /^[a-z0-9-]+@1$/.test(identity.template)
    && /^[a-z0-9-]+@1$/.test(identity.palette) && (identity.paletteTier === 'Lo' || identity.paletteTier === 'Hi')
    && Array.isArray(identity.corners) && identity.corners.length === 4 && identity.corners.every(colour => rgb.test(colour));
}

export function geometryKey(identity: GeometryIdentity): string {
  return `${identity.version}/${identity.template}/${identity.palette}`;
}

/** Exact, unseeded identity. Tuples keep persistence independent of object key order. */
export function geometryWorkPayload(geometry: GeometryIdentity, width: number, height: number,
  positions: readonly TilePosition[], pins: readonly number[]): string {
  return JSON.stringify([
    geometryKey(geometry), geometry.paletteTier, geometry.corners.map(colour => colour.toUpperCase()),
    width, height, [...pins].sort((a, b) => a - b),
    positions.map(({ shape, family, quarterTurns, center, vertices }) => [shape, family, quarterTurns, center, vertices]),
  ]);
}

/** Stable 32-bit seed derived from the separately persisted, random attempt ID. */
export function geometrySeed(id: string): number {
  let hash = 0x811c9dc5;
  for (const character of id) hash = Math.imul(hash ^ character.codePointAt(0)!, 0x01000193);
  return hash >>> 0;
}

/** One Fisher–Yates ordering and one cycle per movable shape family. */
export function geometryStart(positions: readonly TilePosition[], pins: readonly number[], seed: number): number[] {
  const board = positions.map((_, i) => i);
  const groups = new Map<string, number[]>();
  const locked = new Set(pins);
  for (const [i, position] of positions.entries()) {
    if (locked.has(i)) continue;
    const family = position.family ?? position.shape;
    const group = groups.get(family) ?? [];
    group.push(i);
    groups.set(family, group);
  }
  let state = seed;
  for (const group of groups.values()) {
    for (let i = group.length - 1; i > 0; i--) {
      // Mulberry32. A different attempt ID chooses a new stream, while a
      // two-member group necessarily produces its same single legal cycle.
      state = (state + 0x6d2b79f5) >>> 0;
      let bits = Math.imul(state ^ (state >>> 15), state | 1);
      bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
      const j = Math.floor(((bits ^ (bits >>> 14)) >>> 0) / 0x100000000 * (i + 1));
      [group[i], group[j]] = [group[j]!, group[i]!];
    }
    group.forEach((position, i) => { board[position] = group[(i + 1) % group.length]!; });
  }
  return board;
}

export function polygonCenter(points: readonly Vertex[]): Vertex {
  let twiceArea = 0, momentX = 0, momentY = 0;
  for (const [index, [x, y]] of points.entries()) {
    const [nextX, nextY] = points[(index + 1) % points.length]!;
    const cross = x * nextY - nextX * y;
    twiceArea += cross;
    momentX += (x + nextX) * cross;
    momentY += (y + nextY) * cross;
  }
  return [momentX / (3 * twiceArea), momentY / (3 * twiceArea)];
}

export function colourAt(corners: readonly string[], u: number, v: number): string {
  const weights = [(1-u)*(1-v), u*(1-v), (1-u)*v, u*v];
  return '#' + [1, 3, 5].map(offset => Math.round(corners.reduce((value, colour, i) =>
    value + Number.parseInt(colour.slice(offset, offset + 2), 16) * weights[i]!, 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function geometryColors(positions: readonly TilePosition[], corners: readonly string[]): string[] {
  const xs = positions.map(position => position.center![0]), ys = positions.map(position => position.center![1]);
  const left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top;
  // y on our canvas grows down. The source uses its inverse with the same corner order.
  return xs.map((x, i) => colourAt(corners, width ? (x - left) / width : 0, height ? (ys[i]! - top) / height : 0));
}

export function quarterTurnBetween(from: TilePosition | undefined, to: TilePosition | undefined): number {
  if (from?.quarterTurns === undefined || to?.quarterTurns === undefined) return 0;
  const difference = to.quarterTurns - from.quarterTurns;
  // Rectangles have twofold symmetry, and authored hexes share orientation.
  if (from.family === 'rect' && difference % 2 === 0 || from.family === 'hex') return 0;
  return difference > 2 ? difference - 4 : difference < -2 ? difference + 4 : difference;
}
