import { chapters, getLevel, levels } from '../domain/levels';
import { chapterCount, chapterIndexFor, chapterIsOpen, levelIsOpen, META_POLICY } from '../domain/progression';
import type { LevelDefinition } from '../domain/puzzle';
import type { Workspace } from '../domain/workspace';
import { hasAuthorProof } from '../domain/creative';
import { canExport } from '../domain/export';
import type { ExportRoute } from './exportView';

export type MetaRoute = { kind: 'chapter' | 'page'; index: number } |
  { kind: 'album'; tab: 'campaign' | 'daily' | 'own' } | { kind: 'card' | 'copy'; levelId: string } |
  { kind: 'draft'; draftId: string } | ExportRoute;
interface MetaView {
  route: MetaRoute; state: Workspace; disabled: boolean;
  title: HTMLElement; copy: HTMLElement; actions: HTMLElement;
  navigate(route: MetaRoute): void; back(): void;
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
  if (route.kind === 'chapter') {
    const chapter = chapters[route.index]!;
    const count = chapterCount(state, route.index);
    v.title.textContent = 'Уровни';
    const nav = document.createElement('div');
    nav.className = 'level-picker-nav';
    actions.append(nav);
    button('‹ Назад', v.back, nav).className = 'quiet';
    button('Альбом', () => v.navigate({ kind: 'album', tab: 'campaign' }), nav).className = 'quiet';

    const picker = document.createElement('div');
    picker.className = 'chapter-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Главы');
    actions.append(picker);
    chapters.forEach((_, index) => {
      const open = chapterIsOpen(state, index);
      const node = button(String(index + 1), () => {
        if (index !== route.index) v.navigate({ kind: 'chapter', index });
        actions.querySelector<HTMLButtonElement>(`[data-chapter="${index + 1}"]`)?.focus({ preventScroll: true });
      }, picker);
      node.dataset.chapter = String(index + 1);
      node.dataset.locked = String(!open);
      node.setAttribute('aria-label', `Глава ${index + 1}${open ? '' : ', закрыта'}`);
      if (index === route.index) node.setAttribute('aria-current', 'true');
    });
    const note = chapterIsOpen(state, route.index)
      ? `Глава ${route.index + 1} · ${count}/15`
      : `Соберите ${META_POLICY.chapterAt} работ главы ${route.index}`;
    label(note, 'chapter-note').setAttribute('aria-live', 'polite');

    const grid = document.createElement('div');
    grid.className = 'level-grid';
    actions.append(grid);
    chapter.levelIds.forEach(id => {
      const level = getLevel(id);
      const done = state.completed.includes(id);
      const attempt = state.attempts[id];
      const inProgress = !!attempt && !attempt.completed;
      const started = inProgress && (!!attempt.moves || done);
      const open = levelIsOpen(state, id);
      const activate = () => done && !inProgress ? v.navigate({ kind: 'card', levelId: id }) : v.play(id);
      const node = button(`${level.ordinal}${started ? ' ·' : done ? ' ✓' : ''}`, activate, grid, !open);
      node.dataset.levelId = id;
      node.dataset.done = String(done);
      node.setAttribute('aria-label', `${level.ordinal}. ${level.title}. ${started ? 'Начато' : done ? 'Собрано' : open ? 'Доступно' : 'Закрыто'}`);
      if (id === state.activeLevelId) node.setAttribute('aria-current', 'true');
    });
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
    if (route.tab === 'campaign' && canExport(state, 'clean')) button('Экспорт', () => v.navigate({ kind: 'export' }));
    back();
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
  }
}
