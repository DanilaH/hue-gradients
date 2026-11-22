import { chapters, getLevel, levels } from '../domain/levels';
import { chapterCount, chapterIndexFor, chapterIsOpen, levelIsOpen, META_POLICY, recommendedLevel } from '../domain/progression';
import type { LevelDefinition } from '../domain/puzzle';
import type { Workspace } from '../domain/workspace';
import type { AlbumRoute } from './albumView';
import { chapterChallenges, challengeAvailable, challenges, challengeStatus, geometryChallenges } from '../domain/challenges';
import { bookProgress, books, goalLabel } from '../domain/books';
import { gradientThumbnail } from './exportRenderer';
import { personalLevel, personalTaskName, TASK_KINDS, taskKey, taskStatus } from '../domain/personal';
import { renderProgress } from './progressView';

type PickerRoute = { kind: 'chapter'; levelId: string; chapterMenu?: number };
export type MetaRoute = PickerRoute | AlbumRoute | { kind: 'card' | 'copy'; levelId: string } |
  { kind: 'own-card'; workId: string; nodeId: string } | { kind: 'draft'; draftId: string; nodeId?: string } | { kind: 'progress' | 'daily' | 'personal' | 'books' | 'cycle-review' } | { kind: 'challenges'; group?: 'chapter' | 'geometry' };
interface MetaView {
  route: MetaRoute; state: Workspace; disabled: boolean;
  title: HTMLElement; copy: HTMLElement; actions: HTMLElement;
  navigate(route: MetaRoute): void; back(): void;
  play(id: string): void; saveCopy(id: string, name: string): void;
  repeat(id: string): void;
  playChallenge(id: string, restart: boolean): void;
  playTimed(): void;
  dailyAvailable: boolean;
  dailyLoading: boolean;
  playDaily(date: string, replay: boolean): void;
  playPersonal(key: string, restart: boolean): void;
}

export function isMenuList(route: MetaRoute): boolean {
  return ['personal', 'daily', 'books', 'progress', 'challenges'].includes(route.kind);
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
  button('Прогресс', () => v.navigate({ kind: 'progress' }), nav).className = 'quiet';
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
  const label = selectedState === 'Собран' ? 'Повторить' : selectedState === 'Начат' ? 'Продолжить' : 'Играть';
  const activate = () => (selectedState === 'Собран' ? v.repeat : v.play)(route.levelId);
  let center: HTMLButtonElement | undefined;
  function boardAt(id: string, style: string, selected = false): void {
    const model = levelPreview(state, id);
    const slot = document.createElement(selected && model ? 'button' : 'div');
    slot.className = style;
    if (slot instanceof HTMLButtonElement) {
      center = slot;
      slot.classList.add('quiet');
      slot.type = 'button';
      slot.disabled = v.disabled;
      slot.setAttribute('aria-label', `${label} уровень ${getLevel(id).ordinal}`);
      // Pointer taps are resolved on release by the stage. Keyboard and assistive clicks use the button.
      slot.onclick = event => { if (event.detail === 0) activate(); };
    } else slot.setAttribute('aria-hidden', 'true');
    stage.append(slot);
    if (!model) { slot.classList.add('level-locked'); return; }
    const { level, board } = model;
    slot.append(preview(level, false, board ?? undefined, selected && board ? level.pinnedPositions : []));
  }
  const previous = chapter.levelIds[position - 1], next = chapter.levelIds[position + 1];
  if (previous) boardAt(previous, 'level-peek level-peek-prev');
  boardAt(route.levelId, 'level-preview', true);
  if (next) boardAt(next, 'level-peek level-peek-next');
  let drag: { id: number; x: number; y: number; moved: boolean; fromCenter: boolean } | undefined;
  stage.onpointerdown = event => {
    if (!v.disabled && !drag && event.isPrimary && event.button === 0) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
        fromCenter: !!center?.contains(event.target as Node) };
      stage.setPointerCapture(event.pointerId);
    }
  };
  const cancelDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    stage.style.removeProperty('--picker-drag');
  };
  stage.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 10) drag.moved = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      stage.style.setProperty('--picker-drag', `${Math.max(-96, Math.min(96, dx))}px`);
    }
  };
  stage.onpointercancel = cancelDrag;
  stage.onlostpointercapture = event => { if (event.target === stage) cancelDrag(event); };
  stage.onpointerup = event => {
    const gesture = drag;
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    cancelDrag(event);
    if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy)) select(position + (dx < 0 ? 1 : -1));
    else if (gesture.fromCenter && !gesture.moved && Math.hypot(dx, dy) <= 10 &&
      center?.contains(document.elementFromPoint(event.clientX, event.clientY))) activate();
  };
  const details = document.createElement('div'); details.className = 'level-actions'; actions.append(details);
  const selection = document.createElement('p');
  selection.className = 'level-selection';
  const number = document.createElement('strong');
  number.textContent = String(getLevel(route.levelId).ordinal).padStart(3, '0');
  const status = document.createElement('span');
  status.textContent = selectedState;
  selection.append(number, status);
  details.append(selection);
  if (selectedState === 'Закрыт') {
    const requirement = document.createElement('p'); requirement.className = 'chapter-note';
    const ordinal = getLevel(route.levelId).ordinal;
    requirement.textContent = `Соберите уровень ${ordinal <= 5 ? ordinal - 1 : 5}`; details.append(requirement);
  } else button(label, activate, details).dataset.levelAction = '';
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
  const links = document.createElement('div');
  links.className = 'level-picker-links';
  actions.append(links);
  const chapterLink = button(pickChapter(index), () => moveTo({ ...route, chapterMenu: index }, '[aria-current=true][data-chapter]'), links);
  chapterLink.className = 'quiet level-chapter-link';
  chapterLink.dataset.openChapters = '';
  const challengesLink = button('Испытания', () => v.navigate({ kind: 'challenges' }), links);
  challengesLink.className = 'quiet level-chapter-link';
  challengesLink.setAttribute('aria-label', 'Испытания');
  const personalLink = button('Задания', () => v.navigate({ kind: 'personal' }), links);
  personalLink.className = 'quiet level-chapter-link';
  personalLink.setAttribute('aria-label', 'Задания');
  if (v.dailyAvailable) {
    const dailyLink = button('Задача дня', () => v.navigate({ kind: 'daily' }), links);
    dailyLink.className = 'quiet level-chapter-link';
    dailyLink.setAttribute('aria-label', 'Задача дня');
  }
}

const russianDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const dailyLabel = (date: string): string => russianDate.format(new Date(`${date}T00:00:00Z`));

function menuRow(row: HTMLButtonElement, title: string, description: string, status?: string,
  colours?: readonly string[]): void {
  row.className = 'quiet menu-row';
  const copy = document.createElement('span');
  copy.className = 'menu-row-copy';
  const name = document.createElement('span');
  name.textContent = title;
  copy.append(name);
  if (description) {
    const detail = document.createElement('small');
    detail.textContent = description;
    copy.append(detail);
  }
  if (colours) {
    const swatch = document.createElement('span');
    swatch.className = 'menu-row-swatch';
    swatch.style.background = `linear-gradient(145deg,${colours.join(',')})`;
    swatch.setAttribute('aria-hidden', 'true');
    row.append(swatch);
  }
  row.append(copy);
  if (status) {
    const state = document.createElement('span');
    state.className = 'menu-row-status';
    state.textContent = status;
    row.append(state);
  } else if (!row.disabled) {
    const arrow = document.createElement('span');
    arrow.className = 'menu-row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    row.append(arrow);
  }
}

export function renderMeta(v: MetaView): void {
  const { state, route, actions } = v;
  actions.dataset.meta = route.kind;
  const label = (text: string, className = '') => { const node = document.createElement('p'); node.textContent = text; node.className = className; actions.append(node); return node; };
  const button = (text: string, handler: () => void, parent: HTMLElement = actions, disabled = false) =>
    actionButton(parent, text, handler, disabled || v.disabled);
  const back = () => button('Назад', v.back);
  const menuBack = () => button('‹ Назад', v.back).className = 'quiet menu-back';
  if (route.kind === 'chapter') {
    renderPicker(v, route);
  } else if (route.kind === 'progress') {
    v.title.textContent = 'Прогресс';
    renderProgress(actions, state, v.disabled, v.back);
  } else if (route.kind === 'books') {
    v.title.textContent = 'Книги';
    menuBack();
    for (const book of books) {
      const progress = bookProgress(book, state);
      const panel = document.createElement('article');
      panel.className = 'book';
      panel.dataset.book = book.id;
      panel.append(gradientThumbnail({ width: 2, height: 2,
        solvedTileColors: book.palette.map((color, index) => progress.goals[index]?.completed ? color : '#392749') }));
      const title = document.createElement('h3');
      title.textContent = `${book.title} · ${progress.filled}/${book.goals.length}`;
      panel.append(title);
      const checklist = document.createElement('ul');
      for (const goal of progress.goals) {
        const row = document.createElement('li');
        row.dataset.earned = String(goal.completed);
        row.textContent = goalLabel(goal);
        checklist.append(row);
      }
      panel.append(checklist);
      if (progress.unlocked) {
        button(progress.claimed ? 'Повторить особую задачу' : 'Особая задача',
          () => v.playChallenge(book.id, progress.claimed), panel).dataset.bookChallenge = book.id;
      }
      actions.append(panel);
    }
    const featured = Object.values(state.dailyProgress?.slots ?? {}).filter(slot => slot.feature).sort((a,b) => b.date.localeCompare(a.date));
    for (const slot of featured) {
      const won = state.dailyProgress?.solved.includes(slot.date);
      const card = button(`${slot.feature!.title} · ${dailyLabel(slot.date)}${won ? ' · Собрано' : ''}`,
        () => v.playDaily(slot.date, state.dailyProgress?.attempts[slot.date]?.completed === true), actions);
      card.className = 'quiet';
      card.dataset.event = slot.feature!.id;
    }
    if (state.completed.length === levels.length) button('Новый цикл', () => v.navigate({ kind: 'cycle-review' })).className = 'quiet';
  } else if (route.kind === 'cycle-review') {
    v.title.textContent = 'Новый цикл';
    label('Правила переноса прогресса в новый цикл ещё не утверждены. Коллекция и права сохраняются.');
    button('Отмена', v.back);
  } else if (route.kind === 'personal') {
    v.title.textContent = 'Личные задания';
    menuBack();
    const progress = state.personalProgress;
    if (!progress) return;
    label(dailyLabel(progress.day), 'menu-date');
    const list = document.createElement('div');
    list.className = 'menu-list';
    actions.append(list);
    for (const kind of TASK_KINDS) {
      const key = taskKey(progress.day, kind);
      const task = progress.tasks[key];
      if (!task) continue;
      const finished = taskStatus(task) !== 'playing';
      const card = button('', () => v.playPersonal(key, finished), list);
      const level = personalLevel(task.levelId);
      const earned = progress.earned.includes(key);
      card.dataset.personal = kind;
      card.dataset.earned = String(earned);
      menuRow(card, personalTaskName(task), [
        level.title,
        task.limit !== undefined ? `Лимит: ${task.limit}` : task.durationMs ? `${task.durationMs / 1000} с` : '',
      ].filter(Boolean).join(' · '),
      earned ? 'Выполнено' : task.attempt ? finished ? 'Повторить' : 'Продолжить' : undefined,
      [level.solvedTileColors[0]!, level.solvedTileColors[level.width - 1]!, level.solvedTileColors.at(-1)!]);
    }
    if (progress.earned.length) {
      const history = document.createElement('details');
      history.dataset.menuDisclosure = 'personal';
      const title = document.createElement('summary');
      title.textContent = `Выполненные задания · ${progress.earned.length}`;
      const historyRows = document.createElement('ul');
      historyRows.className = 'menu-history';
      for (const key of [...progress.earned].reverse()) {
        const task = progress.tasks[key]!;
        const row = document.createElement('li');
        row.textContent = `${dailyLabel(task.date)} · ${personalTaskName(task)}`;
        historyRows.append(row);
      }
      history.append(title, historyRows);
      actions.append(history);
    }
  } else if (route.kind === 'daily') {
    v.title.textContent = 'Задача дня';
    menuBack();
    const catalog = state.dailyProgress;
    const dates = Object.keys(catalog?.slots ?? {}).sort().reverse();
    if (!dates.length) {
      label(v.dailyLoading ? 'Проверяем календарь…' : 'Календарь пока недоступен.', 'menu-note').setAttribute('role', 'status');
      return;
    }
    const list = document.createElement('div');
    list.className = 'menu-list';
    actions.append(list);
    for (const date of dates) {
      const attempt = catalog!.attempts[date];
      const replay = attempt?.completed === true;
      const card = button('', () => v.playDaily(date, replay), list);
      card.dataset.dailyDate = date;
      menuRow(card, dailyLabel(date), date === catalog!.through ? 'Общая задача' : 'Архив',
        replay ? 'Собрано · Повторить' : attempt ? 'Продолжить' : undefined);
    }
  } else if (route.kind === 'challenges') {
    v.title.textContent = 'Испытания';
    menuBack();
    const tabs = document.createElement('div');
    tabs.className = 'challenge-tabs';
    for (const [group, name] of [[undefined, 'Лимит ходов'], ['chapter', 'Финалы глав'], ['geometry', 'Фигуры']] as const) {
      const tab = button(name, () => v.navigate({ kind: 'challenges', ...(group ? { group } : {}) }), tabs);
      tab.className = 'quiet';
      tab.setAttribute('aria-pressed', String(route.group === group));
    }
    const list = document.createElement('div');
    list.className = 'menu-list';
    const timed = state.timedProgress;
    const timedButton = button('', v.playTimed);
    menuRow(timedButton, timed && timed.run.remainingMs > 0 ? 'Продолжить заезд' : 'Заезд на время',
      timed?.finished ? `10 минут · Рекорд · ${timed.best}` : '10 минут');
    actions.append(tabs, list);
    for (const definition of route.group === 'chapter' ? chapterChallenges : route.group === 'geometry' ? geometryChallenges : challenges) {
      const { level, requiredWorks, moveLimit } = definition;
      const locked = !challengeAvailable(definition, state);
      const attempt = state.challengeProgress?.attempts[level.id];
      const best = state.challengeProgress?.best[level.id];
      const restart = !!attempt && challengeStatus(definition, attempt) !== 'playing';
      const card = button('', () => v.playChallenge(level.id, restart), list, locked);
      card.dataset.challengeId = level.id;
      menuRow(card, level.title, locked ? definition.afterFinaleId ? 'Пройди финал главы'
        : definition.chapterIndex !== undefined ? 'Собери все работы главы'
        : `Откроется за ${requiredWorks} работ` : [
        `Лимит · ${moveLimit}`,
        best === undefined ? '' : `Рекорд · ${best}`,
      ].filter(Boolean).join(' · '), locked ? 'Закрыто' : restart ? 'Повторить' : attempt ? 'Продолжить' : undefined);
    }
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
  }
}
