import { cycleStart, interpolateGradient } from './editor';
import { CHALLENGE_CONTENT_VERSION, minimumSwaps, type LevelDefinition } from './puzzle';

const SIZE = 7;
const paletteBank = [
  ['#FFD5A2', '#F6877A', '#C29AE4', '#634FA3'],
  ['#C7F5ED', '#74ABD9', '#80D2A8', '#355279'],
  ['#FFF5AE', '#82CA83', '#F99482', '#446C65'],
  ['#FFCDE1', '#B89DF5', '#E58097', '#4B629F'],
  ['#FFEBB8', '#FFAA62', '#A4A0EF', '#6854A5'],
  ['#BFE6FB', '#568BF7', '#A8EE92', '#2D6E79'],
  ['#F7DDA1', '#EF9CB2', '#7BBB9C', '#5569A4'],
  ['#CAA8EA', '#FDF0C2', '#6659A1', '#EDA68C'],
  ['#DDF7A4', '#64C8AB', '#F2B274', '#2F6A81'],
  ['#FDE1EF', '#EF93A0', '#B0CAEE', '#824A91'],
  ['#94CEFC', '#CCEEAA', '#6B69C8', '#75A778'],
  ['#FFDD9D', '#ED8865', '#D39DE0', '#5D5986'],
] as const;
const positions = Array.from({ length: SIZE ** 2 }, (_, index) => index);
const border = positions.filter(index => index < SIZE || index >= SIZE * (SIZE - 1) ||
  index % SIZE === 0 || index % SIZE === SIZE - 1);
const anchorStages: readonly (readonly number[])[] = [
  border,
  border.filter(index => index % 2 === 0),
  [0, 3, 6, 21, 24, 27, 42, 45, 48],
  [0, 6, 24, 42, 48],
];

function shuffle<T>(values: readonly T[], seed: number): T[] {
  const order = [...values];
  for (let index = order.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = Math.floor(seed / 0x100000000 * (index + 1));
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return order;
}

/** The run ID is random at creation and then immutable. An old run keeps its v1 bank. */
export function timedField(runId: string, cleared: number): LevelDefinition {
  const seed = [...runId].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
  const roundSeed = seed ^ Math.imul(cleared + 1, 0x9e3779b9);
  const deck = shuffle(paletteBank, seed);
  const palette = deck[(cleared + Math.floor(cleared / deck.length)) % deck.length]!;
  const pins = anchorStages[Math.min(anchorStages.length - 1, Math.floor(cleared / 2))]!;
  const movers = shuffle(positions.filter(index => !pins.includes(index)), roundSeed).slice(0, 8 + cleared * 2);
  const startTileAtPosition = cycleStart(positions.length, positions.filter(index => !movers.includes(index)), roundSeed ^ 0x42b18f3d);
  return {
    id: `timed-v2-${cleared + 1}`, ordinal: cleared + 1, title: `Поле ${cleared + 1}`,
    contentVersion: CHALLENGE_CONTENT_VERSION, width: SIZE, height: SIZE,
    solvedTileColors: interpolateGradient(SIZE, SIZE, palette), pinnedPositions: [...pins],
    startTileAtPosition, minimumSwaps: minimumSwaps(startTileAtPosition, pins),
  };
}
