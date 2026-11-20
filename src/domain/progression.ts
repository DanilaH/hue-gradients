import { chapters, getLevel, levels } from './levels';
import type { Best, Workspace } from './workspace';

export const META_POLICY = { version: 'campaign-meta-1' as const, chapterAt: 10 };
const LEGACY_LAYOUT_RIGHTS = new Set(['export-caption', 'export-strip', 'export-grid', 'export-frame', 'export-diptych', 'export-postcard']);
const official = new Set(levels.map(l => l.id));
export const chapterIndexFor = (levelId: string): number => Math.floor((getLevel(levelId).ordinal - 1) / 15);
export function chapterCount(state: Pick<Workspace, 'completed'>, index: number): number {
  const ids = new Set(state.completed); return chapters[index]!.levelIds.filter(id => ids.has(id)).length;
}
export function chapterIsOpen(state: Pick<Workspace, 'rights'>, index: number): boolean {
  return index === 0 || state.rights.includes(`chapter-open:${chapters[index]!.id}`);
}
export function levelIsOpen(state: Pick<Workspace, 'completed' | 'rights'>, id: string): boolean {
  const level = getLevel(id), chapter = chapterIndexFor(id);
  if (!chapterIsOpen(state, chapter)) return false;
  if (level.ordinal === 1 || chapter > 0) return true;
  return level.ordinal <= 5 ? state.completed.includes(levels[level.ordinal - 2]!.id) : state.completed.includes(levels[4]!.id);
}
export function recommendedLevel(state: Pick<Workspace, 'completed' | 'rights'>, chapter?: number): string | null {
  return levels.find(l => (chapter === undefined || chapterIndexFor(l.id) === chapter) &&
    !state.completed.includes(l.id) && levelIsOpen(state, l.id))?.id ?? null;
}
export function isKnownRight(id: string): boolean {
  if (id === 'export-clean' || LEGACY_LAYOUT_RIGHTS.has(id)) return true;
  if (levels.some(l => id === `clean-export:${l.id}` || id === `campaign-card:${l.id}`)) return true;
  if (chapters.some(c => id === `chapter-open:${c.id}` || id === `chapter-complete:${c.id}`)) return true;
  return /^mastery:[0-9a-f]{64}:(no-assist|perfect-no-assist)$/.test(id);
}
/** Layout rights survive old saves, but only current rewards are earned. */
export function earnedRights(state: Pick<Workspace, 'completed' | 'bests' | 'rights'>, fingerprints: ReadonlyMap<string, string>,
  policy: { chapterAt: number } = META_POLICY): string[] {
  const rights = new Set(state.rights), completed = [...new Set(state.completed)].filter(id => official.has(id));
  rights.add(`chapter-open:${chapters[0]!.id}`);
  for (const id of completed) {
    rights.add(`clean-export:${id}`); rights.add(`campaign-card:${id}`);
    const best: Best | undefined = state.bests[id], fingerprint = fingerprints.get(id);
    if (best?.clean != null && fingerprint) {
      rights.add(`mastery:${fingerprint}:no-assist`);
      if (best.clean === getLevel(id).minimumSwaps) rights.add(`mastery:${fingerprint}:perfect-no-assist`);
    }
  }
  if (completed.length) rights.add('export-clean');
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i]!, count = c.levelIds.filter(id => completed.includes(id)).length;
    if (count === c.levelIds.length) rights.add(`chapter-complete:${c.id}`);
    if (i + 1 < chapters.length && rights.has(`chapter-open:${c.id}`) && count >= policy.chapterAt) rights.add(`chapter-open:${chapters[i + 1]!.id}`);
  }
  return [...rights];
}
export function rewardTitle(id: string): string {
  if (id === 'export-clean') return 'Чистый вид работы';
  if (id.startsWith('campaign-card:')) return 'Новая работа в альбоме';
  const index = chapters.findIndex(c => id === `chapter-open:${c.id}` || id === `chapter-complete:${c.id}`);
  if (index >= 0) return id.startsWith('chapter-open:') ? `Открыта глава ${index + 1}` : `Глава ${index + 1} собрана`;
  if (id.endsWith(':perfect-no-assist')) return 'Идеально без помощи';
  if (id.endsWith(':no-assist')) return 'Пройдено без помощи';
  return 'Работа сохранена';
}
export function visibleRewards(ids: readonly string[]): string[] {
  const priority = (id: string) => id.startsWith('chapter-open:') ? 0 : id.startsWith('chapter-complete:') ? 1 : id.startsWith('export-') ? 2 : id.startsWith('campaign-card:') ? 3 : 4;
  return ids.filter(id => !id.startsWith('clean-export:') && !LEGACY_LAYOUT_RIGHTS.has(id)).sort((a,b) => priority(a)-priority(b));
}
