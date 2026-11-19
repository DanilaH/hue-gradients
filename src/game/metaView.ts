import { getTierProgress } from '@danilah/mini-games-kit/core';
import { chapters, getLevel, levels } from '../domain/levels';
import { chapterCount, chapterIndexFor, chapterIsOpen, EXPORT_FORMATS, levelIsOpen, recommendedLevel, rewardTitle } from '../domain/progression';
import type { LevelDefinition } from '../domain/puzzle';
import type { Workspace } from '../domain/workspace';
import { hasAuthorProof } from '../domain/creative';
import { canExport } from '../domain/export';
import type { ExportRoute } from './exportView';

export type MetaRoute = { kind: 'home' | 'levels' | 'rights' } | { kind: 'chapter' | 'page'; index: number } |
  { kind: 'album'; tab: 'campaign' | 'daily' | 'own' } | { kind: 'card' | 'copy'; levelId: string } |
  { kind: 'draft'; draftId: string } | { kind: 'rewards'; ids: readonly string[] } | ExportRoute;
interface MetaView {
  route: MetaRoute; state: Workspace; disabled: boolean;
  title: HTMLElement; copy: HTMLElement; actions: HTMLElement;
  navigate(route: MetaRoute): void; back(): void; resume(): void;
  play(id: string): void; replay(id: string): void; saveCopy(id: string, name: string): void;
  createWork(): void;
}
function preview(level: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors'>, large = false): HTMLElement {
  const frame = document.createElement('div'); frame.className = large ? 'composition composition-large' : 'composition'; frame.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg', cells = document.createElementNS(ns, 'svg');
  cells.setAttribute('class', 'composition-grid'); cells.setAttribute('viewBox', `0 0 ${level.width} ${level.height}`);
  cells.setAttribute('preserveAspectRatio', 'xMidYMid meet'); cells.setAttribute('shape-rendering', 'crispEdges');
  level.solvedTileColors.forEach((color, position) => {
    const cell = document.createElementNS(ns, 'rect'); cell.setAttribute('x', String(position % level.width));
    cell.setAttribute('y', String(Math.floor(position / level.width))); cell.setAttribute('width', '1'); cell.setAttribute('height', '1');
    cell.setAttribute('fill', color); cells.append(cell);
  });
  frame.append(cells); return frame;
}
export function renderMeta(v: MetaView): void {
  const { state, route, actions } = v;
  actions.dataset.meta = route.kind;
  const label = (text: string, className = '') => { const node = document.createElement('p'); node.textContent = text; node.className = className; actions.append(node); return node; };
  const button = (text: string, handler: () => void, parent: HTMLElement = actions, disabled = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.disabled = disabled || v.disabled; node.onclick = handler; parent.append(node); return node;
  };
  const back = () => button('Назад', v.back);
  const earnedLabel = (id: string): string => state.rights.includes(id) ? 'Открыт' : 'Пока закрыт';
  if (route.kind === 'home') {
    v.title.textContent = 'Полусон';
    v.copy.textContent = `Собрано ${state.completed.length} из ${levels.length}`;
    const active = state.attempts[state.activeLevelId];
    if (active && !active.completed) button(`${active.moves ? 'Продолжить' : 'Начать'}: ${getLevel(state.activeLevelId).title}`, () => v.play(state.activeLevelId));
    else { const next = recommendedLevel(state); if (next) button(`Продолжить: ${getLevel(next).title}`, () => v.play(next)); else label('Все 60 работ кампании собраны. Можно пересматривать работы и сохранять отдельные копии.'); }
    button('Кампания', () => v.navigate({ kind: 'levels' }));
    button('Альбом', () => v.navigate({ kind: 'album', tab: 'campaign' }));
    button('Создать композицию', v.createWork);
    button('Мои работы', () => v.navigate({ kind: 'album', tab: 'own' }));
    button('Экспорт', () => v.navigate({ kind: 'export' }), actions, !canExport(state,'clean'));
    button('Открытые возможности', () => v.navigate({ kind: 'rights' }));
    button('Вернуться к полю', v.resume);
  } else if (route.kind === 'levels') {
    v.title.textContent = 'Кампания'; v.copy.textContent = `${state.completed.length} / ${levels.length} работ`;
    chapters.forEach((chapter, index) => {
      const count = chapterCount(state, index), open = chapterIsOpen(state, index);
      const node = button(`Глава ${index + 1} · ${count}/15${count === 15 ? ' · собрано полностью' : ''}`, () => v.navigate({ kind: 'chapter', index }), actions, !open);
      node.dataset.chapter = String(index + 1);
      label(open ? count >= 10 && index < chapters.length - 1 ? 'Следующая глава открыта' : count === 15 ? 'Полная страница альбома' : 'Можно выбирать доступные задачи' : `Решите 10 задач главы ${index}`, 'meta-note');
    });
    back();
  } else if (route.kind === 'chapter') {
    const chapter = chapters[route.index]!, count = chapterCount(state, route.index);
    v.title.textContent = `Глава ${route.index + 1}`; v.copy.textContent = `${count} / 15 собраны`;
    if (!chapterIsOpen(state, route.index)) { label(`Решите 10 задач главы ${route.index}`); back(); return; }
    const tier = getTierProgress(count, [10, 15]);
    const nextGoal = tier.complete ? tier.nextTier : { target: tier.target, remaining: tier.target - count };
    label(count === 15 ? 'Страница собрана полностью' : nextGoal?.target === 10 && route.index < chapters.length - 1 ? `До следующей главы: ${nextGoal.remaining}` : `До полной страницы: ${15 - count}`, 'meta-goal');
    const next = recommendedLevel(state, route.index);
    if (next) button(`Дальше: ${getLevel(next).ordinal}. ${getLevel(next).title}`, () => v.play(next));
    const grid = document.createElement('div'); grid.className = 'level-grid'; actions.append(grid);
    chapter.levelIds.forEach(id => {
      const level = getLevel(id), done = state.completed.includes(id), started = !!state.attempts[id]?.moves;
      const node = button(`${level.ordinal}${done ? ' ✓' : started ? ' ·' : ''}`, () => v.play(id), grid, !levelIsOpen(state, id));
      node.dataset.levelId = id; node.setAttribute('aria-label', `${level.ordinal}. ${level.title}. ${done ? 'Собрано' : started ? 'Начато' : levelIsOpen(state, id) ? 'Доступно' : 'Закрыто'}`);
      // No target colours/ready image exists on an unfinished task button.
    });
    if (route.index === 0 && !state.completed.includes(levels[4]!.id)) label('Первые пять — по порядку. После пятой можно выбирать любую задачу главы.', 'meta-note');
    if (count === 15) button('Посмотреть полную страницу', () => v.navigate({ kind: 'page', index: route.index }));
    button('В альбом', () => v.navigate({ kind: 'album', tab: 'campaign' })); back();
  } else if (route.kind === 'album') {
    v.title.textContent = 'Альбом'; v.copy.textContent = route.tab === 'campaign' ? `${state.completed.length} собранных работ` : '';
    const tabs = document.createElement('div'); tabs.className = 'album-tabs'; actions.append(tabs);
    for (const [tab, name] of [['campaign', 'Кампания'], ['daily', 'Ежедневные'], ['own', 'Мои работы']] as const) {
      const node = button(name, () => v.navigate({ kind: 'album', tab }), tabs); node.setAttribute('aria-pressed', String(route.tab === tab));
    }
    const grid = document.createElement('div'); grid.className = 'album-grid'; actions.append(grid);
    if (route.tab === 'campaign') {
      for (const level of levels.filter(l => state.completed.includes(l.id))) {
        const node = button('', () => v.navigate({ kind: 'card', levelId: level.id }), grid); node.dataset.albumLevel = level.id;
        node.append(preview(level));
        const title = document.createElement('span'); title.textContent = `${level.ordinal}. ${level.title}`; node.append(title);
        const best = state.bests[level.id];
        if (best?.clean != null) { const badge = document.createElement('small'); badge.textContent = best.clean === level.minimumSwaps ? 'Идеально без помощи' : 'Без помощи'; node.append(badge); }
      }
      if (!state.completed.length) { label('Здесь появятся ваши собранные градиенты. Незавершённые работы не раскрывают готовое поле.'); button('Вернуться к первой работе', () => v.play(levels[0]!.id)); }
      chapters.forEach((c,index) => { if (chapterCount(state,index) === 15) button(`Полная страница главы ${index+1}`, () => v.navigate({ kind:'page',index })); });
    } else if (route.tab === 'own') {
      button('Создать композицию', v.createWork);
      for (const work of Object.values(state.creative?.works ?? {})) {
        const node = button('', () => v.navigate({ kind: 'draft', draftId: work.draftId }), grid); node.dataset.draftId = work.draftId;
        node.append(preview(work.nodes[work.headNodeId]!.field)); const title = document.createElement('span'); title.textContent = work.name; node.append(title);
        const status = document.createElement('small'); status.textContent = hasAuthorProof(work,work.headNodeId) ? 'Пройдено автором' : 'Черновик · не проверен'; node.append(status);
      }
      if (!Object.keys(state.creative?.works??{}).length) label('Создайте свою композицию или сохраните копию собранной работы.');
    } else label('Пока нет собранных ежедневных работ.');
    button('Открытые возможности', () => v.navigate({ kind: 'rights' })); back();
  } else if (route.kind === 'card' || route.kind === 'copy') {
    const level = getLevel(route.levelId);
    v.title.textContent = level.title;
    if (!state.completed.includes(level.id)) { label('Сначала соберите эту работу.'); back(); return; }
    actions.append(preview(level, true));
    if (route.kind === 'card') {
      const best = state.bests[level.id];
      v.copy.textContent = `Кампания · глава ${chapterIndexFor(level.id) + 1}\nБез помощи: ${best?.clean ?? 'нет результата'} · с помощью: ${best?.assisted ?? 'нет результата'}`;
      button('Повторить работу', () => v.replay(level.id));
      button('Сохранить копию', () => v.navigate({ kind: 'copy', levelId: level.id }));
      button('Экспорт', () => v.navigate({ kind: 'export', initialKey: `campaign:${level.id}` }));
    } else {
      v.copy.textContent = 'Копия сохранится отдельно. Оригинал и его рекорды останутся прежними.';
      const label = document.createElement('label'); label.textContent = 'Название копии';
      const input = document.createElement('input'); input.type = 'text'; input.value = `${level.title} — копия`; input.setAttribute('aria-label', 'Название копии'); input.disabled = v.disabled;
      const error = document.createElement('p'); error.className = 'meta-note'; error.setAttribute('role','status');
      label.append(input); actions.append(label, error);
      button('Сохранить копию', () => { if ([...input.value.trim()].length > 80) error.textContent = 'До 80 символов. Сократите название.'; else v.saveCopy(level.id, input.value); });
    }
    back();
  } else if (route.kind === 'draft') {
    const copy = state.albumCopies[route.draftId];
    v.title.textContent = copy?.name ?? 'Копия не найдена';
    if (copy) { v.copy.textContent = 'Сохранённая копия · черновик\nИсходная работа не изменилась. Авторское прохождение ещё не выполнено.'; actions.append(preview(copy.snapshot, true)); }
    button('Мои работы', () => v.navigate({ kind: 'album', tab: 'own' })); back();
  } else if (route.kind === 'page') {
    const chapter = chapters[route.index]!;
    v.title.textContent = `Страница главы ${route.index + 1}`;
    const grid = document.createElement('div'); grid.className = 'chapter-page'; actions.append(grid);
    chapter.levelIds.forEach(id => { if (state.completed.includes(id)) grid.append(preview(getLevel(id))); else { const empty = document.createElement('div'); empty.className = 'empty-composition'; empty.textContent = 'Ещё не собрано'; grid.append(empty); } });
    v.copy.textContent = `${chapterCount(state, route.index)} / 15`;
    if (chapterCount(state,route.index)===15) button('Сохранить страницу', () => v.navigate({kind:'export',chapterIndex:route.index}));
    back();
  } else if (route.kind === 'rewards') {
    v.title.textContent = 'Открытия этой работы';
    route.ids.forEach(id => label(rewardTitle(id))); back();
  } else if (route.kind === 'rights') {
    v.title.textContent = 'Открытые возможности';
    v.copy.textContent = 'Шесть макетов: три за кампанию и три за ежедневные работы.';
    label(state.rights.includes('export-clean') ? 'Чистый вид работы — открыт с первой победы' : 'Чистый вид работы — с первой победы');
    EXPORT_FORMATS.forEach(format => label(`${format.title} · ${earnedLabel(format.id)}\n${format.threshold} разных ${format.source === 'campaign' ? 'работ кампании' : 'ежедневных задач, включая архив'}`, 'format-info'));
    const tier = getTierProgress(state.completed.length, [5,15,30]);
    const target = tier.complete ? tier.nextTier : { target: tier.target, remaining: tier.target - state.completed.length };
    label(target ? `Следующий макет кампании: ещё ${target.remaining}` : state.completed.length === levels.length ? 'Все три макета кампании открыты. Работы остаются в альбоме; можно сохранять копии.' : 'Все три макета кампании открыты. Следующие цели — полные страницы и личное мастерство.', 'meta-goal'); back();
    if(canExport(state,'clean'))button('Открыть экспорт',()=>v.navigate({kind:'export'}));
  }
}
