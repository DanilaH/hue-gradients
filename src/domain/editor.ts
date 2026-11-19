import { minimumSwaps, type LevelDefinition } from './puzzle';

export interface EditorField {
  width: number; height: number;
  cornerColorsTLTRBLBR: readonly string[];
  solvedTileColors: readonly string[];
  pinnedPositions: readonly number[];
  startTileAtPosition: readonly number[];
}
export interface FieldInspection {
  errors: string[]; warnings: string[]; minimumSwaps?: number;
  minimumNominalOklab?: number | null; closestMovablePair?: number[] | null;
  orientationAmbiguities?: string[];
}
const rgb = /^#[0-9a-f]{6}$/i;
const integer = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const validName = (value: string): string => {
  const name = value.trim() || 'Моя композиция';
  if ([...name].length > 80) throw new Error('До 80 символов. Сократите название.');
  return name;
};

export function normalizedCorners(width: number, height: number, input: readonly string[]): string[] {
  const c = input.map(v => v.toUpperCase());
  if (width === 1) { c[1] = c[0]!; c[3] = c[2]!; }
  if (height === 1) { c[2] = c[0]!; c[3] = c[1]!; }
  return c;
}
/** Integer-rational bilinear interpolation in encoded sRGB bytes; half-up rounding. */
export function fieldColors(width: number, height: number, corners: readonly string[]): string[] {
  if (!integer(width, 1, 6) || !integer(height, 1, 5) || corners.length !== 4 || corners.some(c => !rgb.test(c))) throw new Error('Invalid palette or dimensions');
  const channels = corners.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
  const dx = Math.max(1, width - 1), dy = Math.max(1, height - 1), denominator = dx * dy;
  return Array.from({ length: width * height }, (_, i) => {
    const x = i % width, y = Math.floor(i / width), weights = [(dx - x) * (dy - y), x * (dy - y), (dx - x) * y, x * y];
    return '#' + [0, 1, 2].map(channel => Math.floor((2 * weights.reduce((sum, weight, k) => sum + weight * channels[k]![channel]!, 0) + denominator) / (2 * denominator)).toString(16).padStart(2, '0')).join('').toUpperCase();
  });
}
export function defaultPins(width: number, height: number): number[] { return [...new Set([0, width - 1, width * (height - 1), width * height - 1])].sort((a, b) => a - b); }
/** A seeded single cycle: every movable tile moves, no random reroll on replay. */
export function cycleStart(size: number, pins: readonly number[], seed = 0): number[] {
  const moving = Array.from({ length: size }, (_, i) => i).filter(i => !pins.includes(i));
  let state = seed >>> 0;
  for (let i = moving.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1); [moving[i], moving[j]] = [moving[j]!, moving[i]!];
  }
  const start = Array.from({ length: size }, (_, i) => i);
  moving.forEach((position, i) => { start[position] = moving[(i + 1) % moving.length]!; });
  return start;
}
export function anotherStart(field: EditorField, seed: number): { seed: number; start: number[] } | null {
  if (field.width * field.height - field.pinnedPositions.length < 3) return null;
  for (let i = 1; i <= 256; i++) {
    const next = (seed + i) >>> 0, start = cycleStart(field.width * field.height, field.pinnedPositions, next);
    if (start.some((v, index) => v !== field.startTileAtPosition[index])) return { seed: next, start };
  }
  throw new Error('No different start found');
}
export function makeField(width = 4, height = 4, corners: readonly string[] = ['#F9BC92', '#B8ADDF', '#D67794', '#669EAA'], pins: readonly number[] = defaultPins(width, height), seed = 0): EditorField {
  const normalized = normalizedCorners(width, height, corners);
  return { width, height, cornerColorsTLTRBLBR: normalized, solvedTileColors: fieldColors(width, height, normalized), pinnedPositions: [...pins].sort((a, b) => a - b), startTileAtPosition: cycleStart(width * height, pins, seed) };
}
export function fieldFromLevel(l: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors' | 'pinnedPositions' | 'startTileAtPosition'>): EditorField {
  return { ...l, cornerColorsTLTRBLBR: [l.solvedTileColors[0]!, l.solvedTileColors[l.width - 1]!, l.solvedTileColors[l.width * (l.height - 1)]!, l.solvedTileColors.at(-1)!] };
}
/** Shared with campaign fingerprintPayload: metadata, seed and unused corners are excluded. */
export function editorFingerprintPayload(f: EditorField): string {
  return JSON.stringify({ height: f.height, pinnedPositions: [...f.pinnedPositions].sort((a,b) => a-b), solvedTileColors: f.solvedTileColors.map(c => c.toUpperCase()), startTileAtPosition: f.startTileAtPosition, width: f.width });
}
function oklab(hex: string): number[] {
  const [r,g,b] = [1,3,5].map(i => { const c = parseInt(hex.slice(i,i+2),16)/255; return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4; }) as [number,number,number];
  const l = Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b), m = Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b), s = Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
/** Mirrors the independent Python oracle; warnings never become a correctness hint. */
export function inspectField(value: unknown): FieldInspection {
  if (!object(value)) return { errors: ['FIELD_OBJECT'], warnings: [] };
  const { width: w, height: h, pinnedPositions: pins, solvedTileColors: colors, startTileAtPosition: p, cornerColorsTLTRBLBR: corners } = value;
  if (!integer(w,1,6) || !integer(h,1,5)) return { errors:['DIMENSIONS'], warnings:[] };
  const errors: string[] = [], warnings: string[] = [], n = w*h;
  if (!Array.isArray(pins) || pins.some(i => !integer(i,0,n-1))) errors.push('PIN_INDEX');
  else if (new Set(pins).size !== pins.length) errors.push('DUPLICATE_PIN');
  if (!Array.isArray(colors) || colors.length !== n || colors.some(c => typeof c !== 'string' || !rgb.test(c))) errors.push('COLORS');
  if (!Array.isArray(p) || p.length !== n || p.some(i => !integer(i,0,n-1)) || new Set(p).size !== n) errors.push('PERMUTATION');
  if (errors.length) return { errors, warnings };
  const anchors = pins as number[], permutation = p as number[], rgbColors = (colors as string[]).map(c => c.toUpperCase());
  const moving = Array.from({ length:n },(_,i)=>i).filter(i=>!anchors.includes(i));
  if (anchors.length < 2) errors.push('ANCHOR_COUNT');
  if (moving.length < 2) errors.push('MOVABLE_COUNT');
  if (anchors.some(i => permutation[i] !== i)) errors.push('PIN_MOVED');
  if (new Set(moving.map(i=>rgbColors[i])).size < moving.length) errors.push('DUPLICATE_MOVABLE_RGB');
  if (new Set(anchors.map(i=>rgbColors[i])).size < 2) errors.push('ANCHOR_COLORS');
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some(c => typeof c !== 'string' || !rgb.test(c))) errors.push('CORNERS');
  else if (fieldColors(w,h,corners).some((c,i)=>c!==rgbColors[i])) errors.push('COLOR_RECONSTRUCTION');
  const transforms: [string,(x:number,y:number)=>number[]][] = [ ['mirror-x',(x,y)=>[w-1-x,y]],['mirror-y',(x,y)=>[x,h-1-y]],['rotate-180',(x,y)=>[w-1-x,h-1-y]] ];
  if (w===h) transforms.push(['transpose',(x,y)=>[y,x]],['anti-transpose',(x,y)=>[w-1-y,h-1-x]],['rotate-90',(x,y)=>[w-1-y,x]],['rotate-270',(x,y)=>[y,h-1-x]]);
  const seen = new Set<string>(), ambiguities: string[] = [];
  for (const [name, transform] of transforms) {
    const map = Array.from({ length:n },(_,i)=>{ const [x,y]=transform(i%w,Math.floor(i/w)); return y!*w+x!; }), key=map.join(',');
    if (seen.has(key) || map.every((v,i)=>v===i)) continue;
    seen.add(key);
    if (anchors.every(i=>anchors.includes(map[i]!) && rgbColors[i]===rgbColors[map[i]!]) && moving.some(i=>rgbColors[i]!==rgbColors[map[i]!])) ambiguities.push(name);
  }
  if (ambiguities.length) errors.push('ORIENTATION_AMBIGUITY');
  // Pins may be misplaced: permutation cycles still have a defined mathematical minimum.
  const minimum = minimumSwaps(permutation, []);
  if (minimum===0) errors.push('ALREADY_SOLVED_START');
  let distance: number|null=null, pair: number[]|null=null;
  for(let a=0;a<moving.length;a++) for(let b=a+1;b<moving.length;b++) {
    const x=moving[a]!, y=moving[b]!, l=oklab(rgbColors[x]!), r=oklab(rgbColors[y]!);
    const d=Math.hypot(...l.map((v,i)=>v-r[i]!));
    if(distance===null || d<distance) { distance=d; pair=[x,y]; }
  }
  if(distance!==null && distance<.025) warnings.push('CLOSE_COLORS_REVIEW');
  return { errors,warnings,minimumSwaps:minimum,minimumNominalOklab:distance===null?null:Math.round(distance*1e9)/1e9,closestMovablePair:pair,orientationAmbiguities:ambiguities };
}
export function playableField(field: EditorField, id: string, title: string): LevelDefinition {
  const check=inspectField(field);
  if(check.errors.length) throw new Error(`Unplayable field: ${check.errors.join(',')}`);
  return { ...field,id,title,ordinal:0,minimumSwaps:check.minimumSwaps! };
}
export const FIELD_MESSAGES: Record<string,string> = {
  DIMENSIONS:'Выберите от 1 до 6 столбцов и от 1 до 5 строк.', PIN_INDEX:'Закрепление вне поля.', DUPLICATE_PIN:'Повторное закрепление.', COLORS:'Проверьте цвета поля.', PERMUTATION:'Начальная расстановка повреждена.',
  ANCHOR_COUNT:'Нужны хотя бы две закреплённые плитки.', MOVABLE_COUNT:'Оставьте хотя бы две подвижные плитки.', PIN_MOVED:'Закреплённая плитка сдвинута в начальном поле.',
  DUPLICATE_MOVABLE_RGB:'Подвижные плитки должны различаться по цвету.', ANCHOR_COLORS:'Закрепите хотя бы два разных цвета.', CORNERS:'Задайте четыре цвета углов.', COLOR_RECONSTRUCTION:'Цвета не соответствуют выбранной палитре.',
  ORIENTATION_AMBIGUITY:'Эти закрепления допускают несколько ориентаций. Добавьте другую опорную плитку.', ALREADY_SOLVED_START:'Начальное поле уже собрано.', CLOSE_COLORS_REVIEW:'Есть близкие цвета. Проверьте различимость на своём экране.'
};
