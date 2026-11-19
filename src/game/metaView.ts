import { chapters, getLevel, levels } from '../domain/levels';
import { chapterCount, chapterIndexFor, chapterIsOpen, levelIsOpen, META_POLICY, recommendedLevel } from '../domain/progression';
import type { LevelDefinition } from '../domain/puzzle';
import type { Workspace } from '../domain/workspace';
import { hasAuthorProof } from '../domain/creative';
import { canExport } from '../domain/export';
import type { ExportRoute } from './exportView';

type PickerRoute = { kind: 'chapter'; levelId: string; chapterMenu?: number };
export type MetaRoute = PickerRoute | { kind: 'page'; index: number } |
  { kind: 'album'; tab: 'campaign' | 'daily' | 'own' } | { kind: 'card' | 'copy'; levelId: string } |
  { kind: 'draft'; draftId: string } | ExportRoute;
interface MetaView {
  route: MetaRoute; state: Workspace; disabled: boolean;
  title: HTMLElement; copy: HTMLElement; actions: HTMLElement;
  navigate(route: MetaRoute): void; back(): void;
  play(id: string): void; saveCopy(id: string, name: string): void;
  repeat(id: string): void;
  createWork(): void;
}
function actionButton(parent: HTMLElement, text: string, invoke: () => void, disabled: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text; button.disabled = disabled;
  button.onclick = invoke; parent.append(button); return button;
}
function preview(level: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors'>, large = false,
  board?: readonly number[], pins: readonly number[] = []): HTMLElement {
  const frame = document.createElement('div'); frame.className = large ? 'composition composition-large' : 'composition'; frame.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg', cells = document.createElementNS(ns, 'svg');
  cells.setAttribute('class', 'composition-grid'); cells.setAttribute('viewBox', `0 0 ${level.width} ${level.height}`);
  cells.setAttribute('preserveAspectRatio', 'xMidYMid meet'); cells.setAttribute('shape-rendering', 'crispEdges');
  level.solvedTileColors.forEach((_, position) => {
    const color = level.solvedTileColors[board?.[position] ?? position]!;
    const cell = document.createElementNS(ns, 'rect'); cell.setAttribute('x', String(position % level.width));
    cell.setAttribute('y', String(Math.floor(position / level.width))); cell.setAttribute('width', '1'); cell.setAttribute('height', '1');
    cell.setAttribute('fill', color); cells.append(cell);
  });
  for (const position of pins) {
    const pin = document.createElementNS(ns, 'circle');
    pin.setAttribute('cx', String(position % level.width + .5));
    pin.setAttribute('cy', String(Math.floor(position / level.width) + .5));
    pin.setAttribute('r', '.045'); pin.setAttribute('fill', '#181322');
    pin.setAttribute('stroke', '#fff2de'); pin.setAttribute('stroke-width', '.019');
    cells.append(pin);
  }
  frame.append(cells); return frame;
}

function pickerState(state: Workspace, id: string) {
  if (!levelIsOpen(state, id)) return 'Закрыт';
  const attempt = state.attempts[id];
  if (attempt && !attempt.completed) return 'Начат';
  return state.completed.includes(id) ? 'Собран' : 'Доступен';
}

export function levelPreview(state: Workspace, id: string) {
  const status = pickerState(state, id);
  if (status === 'Закрыт') return null;
  const level = getLevel(id);
  return { level, board: status === 'Собран' ? null : state.attempts[id]?.board ?? level.startTileAtPosition };
}

function renderPicker(v: MetaView, route: PickerRoute): void {
  const { state, actions } = v;
  const index = chapterIndexFor(route.levelId);
  const chapter = chapters[index]!;
  const pickChapter = (chapterIndex: number) => `Глава ${chapterIndex + 1} · ${chapterCount(state, chapterIndex)}/${chapters[chapterIndex]!.levelIds.length}`;
  const chapterRequirement = (chapterIndex: number) => `Соберите ${META_POLICY.chapterAt} работ главы ${chapterIndex}`;
  const button = (text: string, invoke: () => void, parent: HTMLElement) => actionButton(parent, text, invoke, v.disabled);
  const moveTo = (next: PickerRoute, focus: string) => {
    v.navigate(next);
    actions.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  };
  const nav = document.createElement('nav'); nav.className = 'level-picker-nav'; actions.append(nav);
  button('‹ Назад', v.back, nav).className = 'quiet';
  if (route.chapterMenu !== undefined) {
    v.title.textContent = 'Главы';
    const list = document.createElement('div'); list.className = 'chapter-picker'; actions.append(list);
    chapters.forEach((_, chapterIndex) => {
      const open = chapterIsOpen(state, chapterIndex);
      const node = button(pickChapter(chapterIndex), () => {
        if (!open) {
          moveTo({ ...route, chapterMenu: chapterIndex }, `[data-chapter="${chapterIndex + 1}"]`);
          return;
        }
        const levelId = chapterIndex === index ? route.levelId : chapterIndexFor(state.activeLevelId) === chapterIndex
          ? state.activeLevelId : recommendedLevel(state, chapterIndex) ?? chapters[chapterIndex]!.levelIds[0]!;
        moveTo({ kind: 'chapter', levelId }, '[data-open-chapters]');
      }, list);
      node.dataset.chapter = String(chapterIndex + 1); node.dataset.locked = String(!open);
      if (!open) node.setAttribute('aria-label', `${pickChapter(chapterIndex)}, закрыта`);
      if (chapterIndex === route.chapterMenu) node.setAttribute('aria-current', 'true');
      const swatch = document.createElement('span'); swatch.className = 'chapter-swatch';
      swatch.setAttribute('aria-hidden', 'true'); node.prepend(swatch);
    });
    const hint = document.createElement('p'); hint.className = 'chapter-note'; hint.setAttribute('aria-live', 'polite');
    if (!chapterIsOpen(state, route.chapterMenu)) hint.textContent = chapterRequirement(route.chapterMenu);
    actions.append(hint);
    return;
  }

  v.title.textContent = 'Уровни';
  button('Альбом', () => v.navigate({ kind: 'album', tab: 'campaign' }), nav).className = 'quiet';
  const position = chapter.levelIds.indexOf(route.levelId);
  const selectedState = pickerState(state, route.levelId);
  const rail = document.createElement('div'); rail.className = 'level-rail';
  rail.setAttribute('role', 'group'); rail.setAttribute('aria-label', 'Номера уровней');
  const select = (next: number) => {
    const levelId = chapter.levelIds[next];
    if (levelId && next !== position && !v.disabled) moveTo({ kind: 'chapter', levelId }, '[aria-current=true][data-level-id]');
  };
  const stage = document.createElement('div'); stage.className = 'level-stage'; actions.append(stage);
  function boardAt(id: string, style: string): void {
    const slot = document.createElement('div'); slot.className = style; stage.append(slot);
    slot.setAttribute('aria-hidden', 'true');
    const model = levelPreview(state, id);
    if (!model) { slot.classList.add('level-locked'); return; }
    const { level, board } = model;
    slot.append(preview(level, false, board ?? undefined, board && style === 'level-preview' ? level.pinnedPositions : []));
  }
  const previous = chapter.levelIds[position - 1], next = chapter.levelIds[position + 1];
  if (previous) boardAt(previous, 'level-peek level-peek-prev');
  boardAt(route.levelId, 'level-preview');
  if (next) boardAt(next, 'level-peek level-peek-next');
  let drag: { id: number; x: number; y: number } | undefined;
  stage.onpointerdown = event => {
    if (!v.disabled && !drag && event.isPrimary && event.button === 0) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      stage.setPointerCapture(event.pointerId);
    }
  };
  const cancelDrag = () => { drag = undefined; stage.style.removeProperty('--picker-drag'); };
  stage.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > Math.abs(event.clientY - drag.y)) {
      stage.style.setProperty('--picker-drag', `${Math.max(-96, Math.min(96, dx))}px`);
    }
  };
  stage.onlostpointercapture = cancelDrag;
  stage.onpointerup = event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    cancelDrag();
    if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy)) select(position + (dx < 0 ? 1 : -1));
  };
  const details = document.createElement('div'); details.className = 'level-actions'; actions.append(details);
  if (selectedState === 'Закрыт') {
    const requirement = document.createElement('p'); requirement.className = 'chapter-note';
    const ordinal = getLevel(route.levelId).ordinal;
    requirement.textContent = `Соберите уровень ${ordinal <= 5 ? ordinal - 1 : 5}`; details.append(requirement);
  } else {
    const label = selectedState === 'Собран' ? 'Повторить' : selectedState === 'Начат' ? 'Продолжить' : 'Играть';
    button(label, () => (selectedState === 'Собран' ? v.repeat : v.play)(route.levelId), details).dataset.levelAction = '';
  }
  actions.append(rail);
  chapter.levelIds.forEach((id, number) => {
    const ordinal = getLevel(id).ordinal;
    const node = button(String(ordinal), () => select(number), rail);
    node.className = 'quiet'; node.dataset.levelId = id;
    const status = pickerState(state, id);
    node.dataset.status = status;
    node.setAttribute('aria-label', `Уровень ${ordinal}, ${status.toLowerCase()}`);
    node.tabIndex = number === position ? 0 : -1;
    if (number === position) node.setAttribute('aria-current', 'true');
  });
  rail.onkeydown = event => {
    const offsets: Record<string, number> = { ArrowLeft: position - 1, ArrowRight: position + 1, Home: 0, End: chapter.levelIds.length - 1 };
    const nextPosition = offsets[event.key];
    if (Number.isInteger(nextPosition)) { event.preventDefault(); select(nextPosition!); }
  };
  requestAnimationFrame(() => {
    if (!rail.isConnected) return;
    const active = rail.querySelector<HTMLElement>('[aria-current=true]')!;
    rail.scrollLeft += active.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - active.offsetWidth) / 2;
  });
  const chapterLink = button(pickChapter(index), () => moveTo({ ...route, chapterMenu: index }, '[aria-current=true][data-chapter]'), actions);
  chapterLink.className = 'quiet level-chapter-link'; chapterLink.dataset.openChapters = '';
}

export function renderMeta(v: MetaView): void {
  const { state, route, actions } = v;
  actions.dataset.meta = route.kind;
  const label = (text: string, className = '') => { const node = document.createElement('p'); node.textContent = text; node.className = className; actions.append(node); return node; };
  const button = (text: string, handler: () => void, parent: HTMLElement = actions, disabled = false) =>
    actionButton(parent, text, handler, disabled || v.disabled);
  const back = () => button('Назад', v.back);
  if (route.kind === 'chapter') {
    renderPicker(v, route);
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
    if (route.kind === 'card' || !state.completed.includes(level.id)) { label('Сначала соберите эту работу.'); back(); return; }
    actions.append(preview(level, true));
    v.copy.textContent = 'Копия сохранится отдельно. Оригинал и его рекорды останутся прежними.';
    const name = document.createElement('label'); name.textContent = 'Название копии';
    const input = document.createElement('input'); input.type = 'text'; input.value = `${level.title} — копия`; input.setAttribute('aria-label', 'Название копии'); input.disabled = v.disabled;
    const error = document.createElement('p'); error.className = 'meta-note'; error.setAttribute('role','status');
    name.append(input); actions.append(name, error);
    button('Сохранить копию', () => { if ([...input.value.trim()].length > 80) error.textContent = 'До 80 символов. Сократите название.'; else v.saveCopy(level.id, input.value); });
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
