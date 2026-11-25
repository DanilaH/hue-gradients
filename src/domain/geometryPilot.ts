import { GEOMETRY_VERSION, geometryColors, geometryStart, polygonCenter, type GeometryIdentity } from './geometryRecipe';
import { PILOT_CONTENT_VERSION, minimumSwaps, validateLevel, type LevelDefinition } from './puzzle';
import type { ShapeFamily, TilePosition, TileShape, Vertex } from './tileShapes';

type ShapeCell = 'rect' | 'tri' | 'other-tri' | 'step';
interface Template {
  readonly id: string;
  readonly title: string;
  readonly columns: number;
  readonly rows: number;
  readonly anchorTier: 'steady' | 'sparse';
  readonly pins: readonly number[];
  readonly pattern: readonly ShapeCell[] | 'hex';
}
interface PaletteVariant {
  readonly id: string;
  readonly title: string;
  readonly tier: GeometryIdentity['paletteTier'];
  readonly corners: GeometryIdentity['corners'];
}
const square: readonly Vertex[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const triangle: readonly Vertex[] = [[0, 0], [1, 0], [0, 1]];
const step: readonly Vertex[] = [[0, 0], [1, 0], [1, .2], [.75, .2], [.75, .4], [.5, .4], [.5, .6], [.25, .6], [.25, .8], [0, .8]];
const hexagon: readonly Vertex[] = [[.5, 0], [1, .25], [1, .75], [.5, 1], [0, .75], [0, .25]];
const triangleShape = ['triangle-nw', 'triangle-ne', 'triangle-se', 'triangle-sw'] as const;

export const geometryTemplates = [
  { id: 'fold', title: 'Складка', columns: 2, rows: 1, anchorTier: 'steady', pins: [0],
    pattern: ['tri', 'other-tri'] },
  { id: 'window', title: 'Окно', columns: 4, rows: 3, anchorTier: 'steady', pins: [0, 3, 8, 11],
    pattern: ['rect'] },
  { id: 'wings', title: 'Крылья', columns: 3, rows: 2, anchorTier: 'steady', pins: [0, 4, 7, 11],
    pattern: ['tri', 'other-tri'] },
  { id: 'pebbles', title: 'Камешки', columns: 4, rows: 3, anchorTier: 'steady', pins: [0, 3, 6, 8],
    pattern: 'hex' },
  { id: 'rift', title: 'Перелом', columns: 3, rows: 2, anchorTier: 'steady', pins: [0, 3, 8],
    pattern: ['rect', 'tri', 'other-tri'] },
  { id: 'terraces', title: 'Террасы', columns: 3, rows: 2, anchorTier: 'sparse', pins: [0, 9],
    pattern: ['step'] },
  { id: 'tide', title: 'Отлив', columns: 4, rows: 3, anchorTier: 'sparse', pins: [0, 7, 15],
    pattern: ['rect', 'step', 'tri', 'rect'] },
  { id: 'thread', title: 'Нити', columns: 5, rows: 3, anchorTier: 'sparse', pins: [0, 13, 20],
    pattern: ['other-tri', 'rect', 'tri', 'rect', 'step'] },
] as const satisfies readonly Template[];

const palettePairs: readonly (readonly [PaletteVariant, PaletteVariant])[] = [
  [{ id: 'peach-glass', title: 'Персиковое стекло', tier: 'Lo', corners: ['#F2BC89','#84537F','#DE715C','#4F9F9B'] },
    { id: 'rose-haze', title: 'Розовая мгла', tier: 'Hi', corners: ['#DC9F96','#BD8C9F','#D88991','#B77D94'] }],
  [{ id: 'apricot', title: 'Абрикосовый свет', tier: 'Lo', corners: ['#F4CA89','#E78D9D','#817DB7','#3E857B'] },
    { id: 'dusty-pink', title: 'Пыльная роза', tier: 'Hi', corners: ['#DAAA9F','#CB9CA8','#AD8997','#A78BAF'] }],
  [{ id: 'blue-air', title: 'Синий воздух', tier: 'Lo', corners: ['#BED9D7','#6473B8','#A179B2','#3E567F'] },
    { id: 'blue-ash', title: 'Синий пепел', tier: 'Hi', corners: ['#9FACC7','#758CB8','#918AA9','#6F789D'] }],
  [{ id: 'aqua-stone', title: 'Аквамарин', tier: 'Lo', corners: ['#ECBA9B','#579C9B','#BC76A0','#385C86'] },
    { id: 'wet-stone', title: 'Мокрый камень', tier: 'Hi', corners: ['#A8BABD','#8AADA6','#969DB5','#778FAE'] }],
  [{ id: 'plum-heat', title: 'Сливовый жар', tier: 'Lo', corners: ['#FFD69C','#AB537D','#C27258','#525284'] },
    { id: 'dusk', title: 'Сумерки', tier: 'Hi', corners: ['#D4A3A3','#B583A2','#BC8193','#9583A1'] }],
  [{ id: 'violet-salt', title: 'Лиловая соль', tier: 'Lo', corners: ['#F0D2AE','#9289DC','#DF8A9C','#4D7C9F'] },
    { id: 'twilight-salt', title: 'Сумеречная соль', tier: 'Hi', corners: ['#CBB8D4','#A89BCB','#B495B6','#889EBC'] }],
  [{ id: 'sea-sunset', title: 'Морской закат', tier: 'Lo', corners: ['#FFC494','#FC9FAD','#607CBB','#4C9D92'] },
    { id: 'salt-fog', title: 'Соляной туман', tier: 'Hi', corners: ['#CCB5B0','#BEA3B7','#8F9BBC','#8EA7A5'] }],
  [{ id: 'northern-flare', title: 'Северная вспышка', tier: 'Lo', corners: ['#EFBDCD','#8E9BE2','#D28168','#4C778B'] },
    { id: 'northern-mist', title: 'Северная дымка', tier: 'Hi', corners: ['#D3ACBD','#AB9BC4','#B694AA','#8899B0'] }],
];

function turn([x, y]: Vertex, quarters: number): Vertex {
  switch (quarters) {
    case 1: return [1 - y, x];
    case 2: return [1 - x, 1 - y];
    case 3: return [y, 1 - x];
    default: return [x, y];
  }
}

function buildPositions({ columns, rows, pattern }: Template): readonly TilePosition[] {
  const hexes = pattern === 'hex';
  const spanX = hexes ? columns + .5 : columns;
  const spanY = hexes ? 1 + (rows - 1) * .75 : rows;
  return Array.from({ length: columns * rows }, (_, cell) => {
    const row = Math.floor(cell / columns), column = cell % columns;
    const x = column + (hexes ? (row % 2) * .5 : 0), y = row * (hexes ? .75 : 1);
    const place = (shape: TileShape, family: ShapeFamily, polygon: readonly Vertex[], quarterTurns: number): TilePosition => {
      const vertices = polygon.map(vertex => {
        const [u, v] = turn(vertex, quarterTurns);
        return [(x + u) / spanX, (y + v) / spanY] as const;
      });
      return { shape, family, quarterTurns, vertices, center: polygonCenter(vertices) };
    };
    const kind = hexes ? 'hex' : pattern[cell % pattern.length]!;
    if (kind === 'hex') return [place('hex', 'hex', hexagon, 0)];
    if (kind === 'rect') return [place('rect', 'rect', square, 0)];
    if (kind === 'step') return [place('step', 'step', step, 0), place('step', 'step', step, 2)];
    const index = kind === 'tri' ? 0 : 1;
    return [place(triangleShape[index]!, 'triangle', triangle, index),
      place(triangleShape[index + 2]!, 'triangle', triangle, index + 2)];
  }).flat();
}

export const pilotLevels = geometryTemplates.flatMap((template, index) => {
  const positions = buildPositions(template);
  const pinnedPositions = template.pins;
  const start = geometryStart(positions, pinnedPositions, index + 109);
  return palettePairs[index]!.map((palette): LevelDefinition => {
    const geometry: GeometryIdentity = { version: GEOMETRY_VERSION, template: template.id + '@1', palette: palette.id + '@1',
      paletteTier: palette.tier, corners: palette.corners };
    const level: LevelDefinition = {
      id: `pilot-v1-${template.id}-${palette.tier.toLowerCase()}`, ordinal: index + 1,
      title: palette.title, width: template.columns, height: template.rows,
      contentVersion: PILOT_CONTENT_VERSION, geometry, positions,
      solvedTileColors: geometryColors(positions, geometry.corners), pinnedPositions, startTileAtPosition: start,
      minimumSwaps: minimumSwaps(start, pinnedPositions),
    };
    validateLevel(level);
    return level;
  });
});

export const pilotLevel = (id: string) => pilotLevels.find(level => level.id === id);
