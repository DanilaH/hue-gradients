import { chapters, getLevel, levels } from '../domain/levels';
import { chapterCount, chapterIndexFor, chapterIsOpen, levelIsOpen, META_POLICY, recommendedLevel } from '../domain/progression';
import { canSwap, type LevelDefinition } from '../domain/puzzle';
import { makeField } from '../domain/editor';
import type { BookTarget, Workspace } from '../domain/workspace';
import type { AlbumRoute } from './albumView';
import { chapterChallenges, challengeAvailable, challenges, challengeStatus, geometryChallenges } from '../domain/challenges';
import { bookProgress, books } from '../domain/books';
import { gradientThumbnail } from './exportRenderer';
import { personalLevel, personalTaskName, TASK_KINDS, taskKey, taskStatus } from '../domain/personal';
import { renderProgress } from './progressView';
import { boardGeometry, cellAt, cellCenter } from './geometry';
import { personalArt } from './personalArt';

type PickerRoute = { kind: 'chapter'; levelId: string; chapterMenu?: number };
export type MetaRoute = PickerRoute | AlbumRoute | { kind: 'card' | 'copy'; levelId: string } |
  { kind: 'own-card'; workId: string; nodeId: string } | { kind: 'draft'; draftId: string; nodeId?: string } |
  { kind: 'modes' | 'editor-home' } | { kind: 'progress'; chapter?: number } | { kind: 'books'; eventDate?: string } | { kind: 'personal'; key?: string } | { kind: 'book'; bookId: string; slot?: number } | { kind: 'daily'; date?: string; month?: string } | { kind: 'challenges'; group?: 'chapter' | 'geometry'; selected?: string };
interface MetaView {
  route: MetaRoute; state: Workspace; disabled: boolean;
  title: HTMLElement; copy: HTMLElement; actions: HTMLElement;
  navigate(route: MetaRoute): void; back(): void;
  chosenLevel(index: number): string;
  settings(): void;
  createWork(): void;
  motion(): boolean;
  pickerLight(id: string | undefined, amount: number): void;
  play(id: string): void; saveCopy(id: string, name: string): void;
  repeat(id: string): void;
  playChallenge(id: string, restart: boolean, book?: BookTarget, entry?: 'progress'): void;
  playTimed(): void;
  playBook(target: BookTarget): void;
  bookInsertion?: BookTarget;
  dailyLoading: boolean;
  retryDaily?: () => void;
  playDaily(date: string, replay: boolean): void;
  playPersonal(key: string, restart: boolean): void;
}

const personalShortLabels = { past: 'Рекорд', present: 'На время', future: 'Поле' };

export function personalObjects(state: Workspace, key?: string) {
  const progress = state.personalProgress;
  const tasks = progress ? TASK_KINDS.flatMap(kind => {
    const id = taskKey(progress.day, kind);
    const task = progress.tasks[id];
    return task ? [{ id, task, level: personalLevel(task.levelId) }] : [];
  }) : [];
  return { tasks, selected: tasks.find(item => item.id === key) ?? tasks[0] };
}

export function calendarSelection(state: Workspace, date?: string, month?: string) {
  const catalog = state.dailyProgress;
  const dates = Object.keys(catalog?.slots ?? {}).filter(day => day <= catalog!.through).sort();
  const months = [...new Set(dates.map(day => day.slice(0,7)))];
  const fallback = dates.at(-1);
  const visibleMonth = month && months.includes(month) ? month : date && dates.includes(date) ? date.slice(0,7) : fallback?.slice(0,7);
  const selected = date && dates.includes(date) && date.startsWith(visibleMonth!) ? date : dates.filter(day => day.startsWith(visibleMonth!)).at(-1);
  return { selected, month: visibleMonth, months };
}

export function isMenuList(route: MetaRoute): boolean {
  return ['modes', 'editor-home', 'personal', 'daily', 'books', 'book', 'progress', 'challenges'].includes(route.kind);
}

function actionButton(parent: HTMLElement, text: string, invoke: () => void, disabled: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text; button.disabled = disabled;
  button.onclick = invoke; parent.append(button); return button;
}
function preview(level: Pick<LevelDefinition, 'width' | 'height' | 'solvedTileColors' | 'positions'>, large = false,
  board?: readonly number[], pins: readonly number[] = []): HTMLElement {
  const frame = document.createElement('div'); frame.className = large ? 'composition composition-large' : 'composition'; frame.setAttribute('aria-hidden', 'true');
  const ns = 'http://www.w3.org/2000/svg', cells = document.createElementNS(ns, 'svg');
  cells.setAttribute('class', 'composition-grid'); cells.setAttribute('viewBox', `0 0 ${level.width} ${level.height}`);
  cells.setAttribute('preserveAspectRatio', 'xMidYMid meet'); cells.setAttribute('shape-rendering', 'crispEdges');
  level.solvedTileColors.forEach((_, position) => {
    const color = level.solvedTileColors[board?.[position] ?? position]!;
    const shape = level.positions?.[position];
    const cell = document.createElementNS(ns, shape ? 'polygon' : 'rect');
    if (shape) cell.setAttribute('points', shape.vertices.map(([x, y]) => `${x * level.width},${y * level.height}`).join(' '));
    else {
      cell.setAttribute('x', String(position % level.width));
      cell.setAttribute('y', String(Math.floor(position / level.width)));
      cell.setAttribute('width', '1'); cell.setAttribute('height', '1');
    }
    cell.setAttribute('fill', color); cells.append(cell);
  });
  for (const position of pins) {
    const pin = document.createElementNS(ns, 'circle');
    const grid = boardGeometry(level.width, level.height, level.width, level.height, level.positions);
    const center = cellCenter(cellAt({ ...grid, y: 0, height: level.height, gap: 0 }, position));
    pin.setAttribute('cx', String(center.x));
    pin.setAttribute('cy', String(center.y));
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
  return { level, board: status === 'Начат' ? state.attempts[id]!.board : null };
}

const pickChapter = (state: Workspace, index: number) => `Глава ${index+1} · ${chapterCount(state,index)}/${chapters[index]!.levelIds.length}`;
const chapterRequirement = (index: number) => `Соберите ${META_POLICY.chapterAt} работ главы ${index}`;

function levelRequirement(state: Workspace, level: LevelDefinition): string {
  const index = chapterIndexFor(level.id);
  if (!chapterIsOpen(state,index)) return chapterRequirement(index);
  return `Соберите уровень ${level.ordinal <= 5 ? level.ordinal - 1 : 5}`;
}

function chapterStrips(v: MetaView, selected: number | undefined, choose: (index: number) => void): HTMLElement {
  const strips = document.createElement('div'); strips.className = 'chapter-strips';
  const hint = document.createElement('p'); hint.className = 'chapter-note'; hint.setAttribute('aria-live','polite');
  const showRequirement = (text: string) => {
    hint.textContent = text;
    hint.scrollIntoView({ block:'nearest' });
  };
  chapters.forEach((chapter, index) => {
    const open = chapterIsOpen(v.state,index);
    const caption = pickChapter(v.state,index);
    const strip = document.createElement('div'); strip.className = 'chapter-strip';
    strip.dataset.chapterStrip = String(index+1);
    const select = actionButton(strip, caption, () => open ? choose(index) : showRequirement(chapterRequirement(index)), v.disabled);
    select.dataset.chapter = String(index+1); select.dataset.locked = String(!open);
    select.setAttribute('aria-label',caption+(open ? '' : ', закрыта'));
    if (selected === index) select.setAttribute('aria-current','true');
    const fragments = document.createElement('span'); fragments.className = 'chapter-pieces'; fragments.setAttribute('aria-hidden','true');
    for (const levelId of chapter.levelIds) {
      const piece = document.createElement('span'), level = getLevel(levelId);
      const earned = v.state.completed.includes(levelId);
      if (earned) piece.style.background = `linear-gradient(152deg,${level.solvedTileColors[0]},${level.solvedTileColors.at(-1)})`;
      piece.dataset.earned = String(earned);
      fragments.append(piece);
    }
    const symbol = document.createElement('span');
    symbol.className = 'chapter-symbol';
    symbol.setAttribute('aria-hidden','true');
    symbol.style.setProperty('--chapter-coloured', `${100 * chapterCount(v.state,index) / chapter.levelIds.length}%`);
    symbol.style.setProperty('--chapter-palette', `linear-gradient(135deg,${getLevel(chapter.levelIds[0]!).solvedTileColors[0]},${getLevel(chapter.levelIds.at(-1)!).solvedTileColors.at(-1)})`);
    select.prepend(symbol);
    select.append(fragments);
    const finale = chapterChallenges[index*2]!;
    const finaleOpen = challengeAvailable(finale,v.state);
    const best = v.state.challengeProgress?.best[finale.level.id];
    const saved = v.state.challengeProgress?.attempts[finale.level.id];
    const mark = actionButton(strip, best === undefined ? '◇' : '◆', () => {
      if (!finaleOpen) { showRequirement(`Финал главы ${index+1} откроется после ${chapter.levelIds.length} работ`); return; }
      v.playChallenge(finale.level.id, !!saved && challengeStatus(finale,saved) !== 'playing',undefined, v.route.kind === 'progress' ? 'progress' : undefined);
    },v.disabled);
    mark.dataset.finale = String(index+1);
    mark.dataset.locked = String(!finaleOpen);
    mark.setAttribute('aria-label',`Финал главы ${index+1}${best !== undefined ? `, рекорд ${best} ход.` : finaleOpen ? ', открыт' : ', закрыт'}`);
    if (best !== undefined) {
      const badge = document.createElement('small'); badge.textContent = String(best); mark.append(badge);
    }
    strips.append(strip);
  });
  strips.append(hint);
  return strips;
}

function renderChallengeDemo(parent: HTMLElement, level: LevelDefinition, moveLimit: number, geometry: boolean): void {
  const movable = level.startTileAtPosition.flatMap((_,index) => level.pinnedPositions.includes(index) ? [] : [index]);
  const pair = movable.flatMap(from => movable.filter(to => from < to && canSwap(level,from,to)).map(to => [from,to] as const))[0];
  if (!pair) return;
  const different = geometry ? movable.find(index => !pair.includes(index) && !canSwap(level,pair[0],index)) : undefined;
  const positions = [...pair, ...(different === undefined ? [] : [different])];
  const values = positions.map(index => level.solvedTileColors[level.startTileAtPosition[index]!]!);
  const demo = document.createElement('section'); demo.className = 'challenge-demo';
  const title = document.createElement('h3'); title.textContent = geometry ? 'Проба форм' : 'Проба обмена';
  const tiles = document.createElement('div'); tiles.className = 'challenge-demo-tiles';
  const note = document.createElement('p'); note.setAttribute('role','status');
  let selected: number | undefined, remaining = moveLimit;
  const board = boardGeometry(100, 108, level.width, level.height, level.positions);
  const elements = positions.map((position, index) => {
    const tile = actionButton(tiles, String(index+1), () => {
      if (selected === undefined || selected === index) { selected = selected === index ? undefined : index; }
      else if (!canSwap(level,positions[selected]!,position)) {
        note.textContent = 'Можно обменять плитки одинаковой формы и ориентации'; selected = undefined;
      } else if (geometry || remaining > 0) {
        [values[selected],values[index]] = [values[index]!,values[selected]!];
        if (!geometry) remaining--;
        note.textContent = geometry ? 'Формы совпали' : `Ходов в пробе · ${remaining}`;
        selected = undefined;
      }
      paint();
    }, false);
    tile.dataset.shape = level.positions?.[position]?.shape ?? 'rect';
    tile.dataset.position = String(position);
    const cell = cellAt(board, position);
    const shape = document.createElement('span');
    const number = document.createElement('span');
    shape.className = 'challenge-demo-shape';
    number.className = 'challenge-demo-number';
    number.textContent = String(index + 1);
    if (cell.points) {
      shape.style.clipPath = `polygon(${cell.points.map(([x,y]) => `${100*x/cell.width}% ${100*y/cell.height}%`).join(',')})`;
      const center = cellCenter(cell);
      number.style.left = `${100*(center.x-cell.x)/cell.width}%`;
      number.style.top = `${100*(center.y-cell.y)/cell.height}%`;
    }
    shape.append(number);
    tile.replaceChildren(shape);
    return tile;
  });
  function paint(): void {
    elements.forEach((tile,index) => {
      tile.style.setProperty('--demo-tile',values[index]!);
      tile.setAttribute('aria-pressed',String(selected===index));
    });
  }
  note.textContent = geometry ? 'Коснись двух плиток' : `Ходов в пробе · ${remaining}`;
  paint();
  demo.append(title,tiles,note);
  parent.append(demo);
}

function renderPicker(v: MetaView, route: PickerRoute): void {
  const { state, actions } = v;
  const index = chapterIndexFor(route.levelId);
  const chapter = chapters[index]!;
  const button = (text: string, invoke: () => void, parent: HTMLElement) => actionButton(parent, text, invoke, v.disabled);
  const moveTo = (next: PickerRoute, focus: string) => {
    v.navigate(next);
    actions.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  };
  const nav = document.createElement('nav'); nav.className = 'level-picker-nav'; actions.append(nav);
  button('‹ Назад', v.back, nav).className = 'quiet';
  button('Настройки', v.settings, nav).dataset.menuSettings = '';
  if (route.chapterMenu !== undefined) {
    v.title.textContent = 'Главы';
    actions.append(chapterStrips(v, route.chapterMenu, chapterIndex => {
      const levelId = chapterIndex === index ? route.levelId : v.chosenLevel(chapterIndex);
      moveTo({ kind:'chapter',levelId }, '[data-open-chapters]');
    }));
    button('Прогресс', () => v.navigate({ kind: 'progress' }), actions).className = 'chapter-progress';
    return;
  }

  v.title.textContent = 'Уровни';
  const position = chapter.levelIds.indexOf(route.levelId);
  const selectedLevel = getLevel(route.levelId);
  const selectedState = pickerState(state, route.levelId);
  const rail = document.createElement('div'); rail.className = 'level-rail';
  rail.setAttribute('role', 'group'); rail.setAttribute('aria-label', 'Номера уровней');
  const select = (next: number) => {
    const levelId = chapter.levelIds[next];
    if (levelId && next !== position && !v.disabled) moveTo({ kind: 'chapter', levelId }, '[aria-current=true][data-level-id]');
  };
  const hero = document.createElement('div'); hero.className = 'level-hero'; actions.append(hero);
  hero.dataset.strip = String(selectedLevel.width >= 2 * selectedLevel.height);
  const selection = document.createElement('p');
  selection.className = 'level-selection';
  const number = document.createElement('strong');
  number.textContent = String(selectedLevel.ordinal).padStart(3, '0');
  const title = document.createElement('span');
  title.textContent = selectedLevel.title;
  selection.append(number, title);
  hero.append(selection);
  const stage = document.createElement('div'); stage.className = 'level-stage'; hero.append(stage);
  stage.style.setProperty('--work-aspect', `${selectedLevel.width} / ${selectedLevel.height}`);
  const track = document.createElement('div'); track.className = 'level-track'; stage.append(track);
  const label = selectedState === 'Собран' ? 'Повторить' : selectedState === 'Начат' ? 'Продолжить' : 'Играть';
  const activate = () => (selectedState === 'Собран' ? v.repeat : v.play)(route.levelId);
  let center: HTMLButtonElement | undefined;
  function boardAt(id: string, style: string, selected = false): void {
    const model = levelPreview(state, id);
    const level = getLevel(id);
    const slot = document.createElement(selected && model ? 'button' : 'div');
    slot.className = style;
    slot.dataset.pickerWork = id;
    slot.style.setProperty('--card-aspect', `${level.width} / ${level.height}`);
    if (slot instanceof HTMLButtonElement) {
      center = slot;
      slot.classList.add('quiet');
      slot.type = 'button';
      slot.disabled = v.disabled;
      slot.setAttribute('aria-label', `${label} уровень ${getLevel(id).ordinal}`);
      // Pointer taps are resolved on release by the stage. Keyboard and assistive clicks use the button.
      slot.onclick = event => { if (event.detail === 0) activate(); };
    } else slot.setAttribute('aria-hidden', 'true');
    track.append(slot);
    if (!model) { slot.classList.add('level-locked'); return; }
    const { board } = model;
    slot.append(preview(level, false, board ?? undefined, selected && board ? level.pinnedPositions : []));
  }
  const previous = chapter.levelIds[position - 1], next = chapter.levelIds[position + 1];
  if (previous) boardAt(previous, 'level-peek level-peek-prev');
  boardAt(route.levelId, 'level-preview', true);
  if (next) boardAt(next, 'level-peek level-peek-next');
  let drag: { id: number; x: number; y: number; base: number; moved: boolean; fromCenter: boolean } | undefined;
  let settling: Animation | undefined;
  const step = () => (track.querySelector('.level-preview')?.getBoundingClientRect().width ?? 0) + 12;
  const offset = () => new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
  const move = (x: number) => {
    track.style.transform = `translateX(${x}px)`;
    v.pickerLight(x < 0 ? next : previous, Math.min(1, Math.abs(x) / step()));
  };
  const settle = (direction: number) => {
    const end = direction * step();
    const finish = () => {
      settling?.cancel(); settling = undefined;
      if (!stage.isConnected) return;
      if (direction) select(position - direction);
      else move(0);
    };
    if (!v.motion() || Math.abs(end - offset()) < 1) { finish(); return; }
    settling = track.animate([
      { transform: `translateX(${offset()}px)` }, { transform: `translateX(${end}px)` },
    ], { duration: direction ? 305 : 245, easing: 'cubic-bezier(.18,.72,.25,1)', fill: 'forwards' });
    v.pickerLight(direction < 0 ? next : direction > 0 ? previous : undefined, direction ? 1 : 0);
    settling.onfinish = finish;
  };
  stage.onpointerdown = event => {
    if (v.disabled || drag || !event.isPrimary || event.button !== 0) return;
    const base = offset();
    settling?.cancel(); settling = undefined;
    move(base);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, base, moved: Math.abs(base) > 2,
      fromCenter: !!center?.contains(event.target as Node) };
    stage.setPointerCapture(event.pointerId);
  };
  const cancelDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    settle(0);
  };
  stage.onpointermove = event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 10) drag.moved = true;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    const total = drag.base + dx;
    const hasNeighbour = total < 0 ? !!next : !!previous;
    move(hasNeighbour ? Math.max(-step(), Math.min(step(), total)) : Math.sign(total) * 47 * (1 - Math.exp(-Math.abs(total) / 100)));
  };
  stage.onpointercancel = cancelDrag;
  stage.onlostpointercapture = event => { if (event.target === stage) cancelDrag(event); };
  stage.onpointerup = event => {
    const gesture = drag;
    if (gesture?.id !== event.pointerId) return;
    drag = undefined;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const x = offset(), threshold = Math.max(42, Math.min(66, step() * .19));
    if (Math.abs(x) >= threshold && (x < 0 ? next : previous)) settle(Math.sign(x));
    else {
      settle(0);
      if (gesture.fromCenter && !gesture.moved && Math.hypot(dx, dy) <= 10 &&
        center?.contains(document.elementFromPoint(event.clientX, event.clientY))) activate();
    }
  };
  const details = document.createElement('div'); details.className = 'level-actions'; hero.append(details);
  if (selectedState === 'Закрыт') {
    const requirement = document.createElement('p'); requirement.className = 'chapter-note';
    requirement.textContent = levelRequirement(state,selectedLevel); details.append(requirement);
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
  const links = document.createElement('div');
  links.className = 'level-picker-links';
  actions.append(links);
  const chapterLink = button(pickChapter(state,index), () => moveTo({ ...route, chapterMenu: index }, '[aria-current=true][data-chapter]'), links);
  chapterLink.className = 'quiet level-chapter-link';
  chapterLink.dataset.openChapters = '';
  chapterLink.setAttribute('aria-label', pickChapter(state,index));
  const chapterName = document.createElement('span');
  chapterName.textContent = `Глава ${index + 1}`;
  const count = document.createElement('span');
  count.className = 'level-chapter-count';
  count.textContent = `${chapterCount(state,index)}/${chapter.levelIds.length}`;
  chapterLink.replaceChildren(chapterName, count);
  const modes = button('Режимы', () => v.navigate({ kind: 'modes' }), links);
  modes.className = 'quiet level-chapter-link';
  modes.dataset.openModes = '';
  button('Альбом', () => v.navigate({ kind: 'album', tab: 'campaign' }), links).className = 'quiet level-chapter-link';
}

const russianDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const dailyLabel = (date: string): string => russianDate.format(new Date(`${date}T00:00:00Z`));
const shortDate = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' });

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

function renderModes(v: MetaView): void {
  const { state, actions } = v;
  const gallery = document.createElement('div');
  gallery.className = 'mode-gallery';
  actions.append(gallery);

  const calendar = document.createElement('span');
  calendar.className = 'mode-calendar';
  const day = calendarSelection(state).selected;
  const daily = day ? state.dailyProgress?.slots[day] : undefined;
  if (daily) {
    calendar.append(preview(daily.level));
    calendar.dataset.date = daily.date;
  }
  const dayCaption = daily
    ? `${daily.date === state.dailyProgress!.through ? '' : 'Архив · '}${shortDate.format(new Date(`${daily.date}T00:00:00Z`))}`
    : v.dailyLoading ? 'Загрузка календаря…' : 'Календарь и архив';

  const objects = document.createElement('span');
  objects.className = 'mode-objects';
  for (const kind of TASK_KINDS) objects.append(personalArt(kind));

  // The public Shapes set is available from the outset. Chapter secrets stay in their own route.
  const figure = geometryChallenges.find(item => item.level.id === 'geometry-v1-mixed')!;
  const shape = preview(figure.level);
  shape.classList.add('mode-shape');

  const work = Object.values(state.creative?.works ?? {}).at(-1);
  const field = work?.nodes[work.headNodeId]?.field ?? makeField();
  const canvas = document.createElement('span');
  canvas.className = 'mode-canvas';
  canvas.append(gradientThumbnail(field));
  for (const colour of field.cornerColorsTLTRBLBR) {
    const corner = document.createElement('span');
    corner.className = 'mode-corner';
    corner.style.backgroundColor = colour;
    canvas.append(corner);
  }

  const entries = [
    ['daily', 'Задача дня', dayCaption, calendar],
    ['personal', 'Личные задания', 'Рекорд · время · поле', objects],
    ['challenges', 'Испытания', 'Фигуры, лимит и заезд', shape],
    ['editor-home', 'Редактор', work?.name ?? 'Создать работу', canvas],
  ] as const;
  for (const [kind, title, caption, art] of entries) {
    const card = actionButton(gallery, '', () => v.navigate({ kind }), v.disabled);
    card.className = 'quiet mode-card';
    card.dataset.modeEntry = kind;
    card.setAttribute('aria-label', title);
    const artFrame = document.createElement('span');
    artFrame.className = 'mode-art';
    artFrame.setAttribute('aria-hidden', 'true');
    artFrame.append(art);
    const text = document.createElement('span');
    text.className = 'mode-caption';
    const name = document.createElement('strong');
    name.textContent = title;
    const detail = document.createElement('small');
    detail.textContent = caption;
    detail.id = `mode-caption-${kind}`;
    card.setAttribute('aria-describedby', detail.id);
    text.append(name, detail);
    card.append(artFrame, text);
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
  } else if (route.kind === 'modes') {
    v.title.textContent = 'Режимы';
    menuBack();
    renderModes(v);
  } else if (route.kind === 'editor-home') {
    v.title.textContent = 'Редактор';
    menuBack();
    button('Создать', v.createWork);
    for (const work of Object.values(state.creative?.works ?? {}).reverse()) {
      const node = work.nodes[work.headNodeId]!;
      const item = button('', () => v.navigate({ kind: 'draft', draftId: work.draftId }));
      item.dataset.editorDraft = work.draftId;
      menuRow(item, work.name, '', undefined, node.field.solvedTileColors);
    }
  } else if (route.kind === 'progress') {
    v.title.textContent = 'Прогресс';
    renderProgress(actions, state, v.disabled, v.back, chapterStrips(v, route.chapter, index => {
      v.navigate({ kind: 'chapter', levelId: v.chosenLevel(index) });
    }));
  } else if (route.kind === 'books') {
    v.title.textContent = 'Книги';
    menuBack();
    const covers = document.createElement('div');
    covers.className = 'book-shelf';
    actions.append(covers);
    for (const book of books) {
      const progress = bookProgress(book, state);
      const cover = button('', () => v.navigate({ kind: 'book', bookId: book.id }), covers);
      cover.dataset.bookCover = book.id;
      cover.append(gradientThumbnail(book.level));
      const name = document.createElement('strong');
      name.textContent = book.title;
      const count = document.createElement('span');
      count.textContent = `${progress.filled}/4`;
      cover.append(name, count);
    }
    const featured = Object.values(state.dailyProgress?.slots ?? {}).filter(slot => slot.feature).sort((a,b) => b.date.localeCompare(a.date));
    for (const slot of featured) {
      const won = state.dailyProgress?.solved.includes(slot.date);
      const attempt = state.dailyProgress?.attempts[slot.date];
      const card = button('', () => v.playDaily(slot.date, attempt?.completed === true), actions);
      card.className = 'quiet menu-row';
      card.dataset.event = slot.feature!.id;
      card.dataset.eventDate = slot.date;
      menuRow(card, slot.feature!.title, dailyLabel(slot.date),
        won ? 'Собрано' : attempt ? 'Начато' : undefined,
        [slot.level.solvedTileColors[0]!,slot.level.solvedTileColors[slot.level.width-1]!,slot.level.solvedTileColors.at(-1)!]);
    }
  } else if (route.kind === 'book') {
    const book = books.find(item => item.id === route.bookId);
    if (!book) { menuBack(); return; }
    v.title.textContent = book.title;
    menuBack();
    const progress = bookProgress(book, state);
    const incoming = v.bookInsertion?.bookId === book.id ? v.bookInsertion.slot : undefined;
    const panel = document.createElement('article');
    panel.className = 'book-cover';
    panel.dataset.book = book.id;
    const slots = document.createElement('div'); slots.className = 'book-slots';
    const selected = route.slot ?? progress.goals.findIndex(goal => !goal.completed);
    for (const [index, goal] of progress.goals.entries()) {
      const challenge = goal.need === 'challenge' ? challenges.find(item => item.level.id === goal.levelId) : undefined;
      const level = challenge?.level ?? getLevel(goal.levelId);
      const number = challenge ? 'I' : String(level.ordinal).padStart(3, '0');
      const open = challenge ? challengeAvailable(challenge, state) : levelIsOpen(state, level.id);
      const earned = goal.completed && incoming !== index;
      const attempt = challenge ? state.challengeProgress?.attempts[level.id] : state.attempts[level.id];
      const verb = goal.need === 'perfect' ? 'Идеально без помощи' : attempt && !attempt.completed ? 'Продолжить' : 'Собрать';
      const caption = challenge ? 'Первое испытание' : `${verb} ${number}`;
      const tile = earned ? document.createElement('div') : button('', () => v.playBook({ bookId: book.id, slot: index }), slots, !open || incoming === index);
      tile.className = 'book-slot';
      tile.dataset.slot = String(index);
      tile.dataset.earned = String(earned);
      tile.dataset.selected = String(selected === index);
      if (earned) {
        tile.setAttribute('role','img');
        tile.setAttribute('aria-label', `${number} · Выполнено`);
        tile.title = 'Выполнено';
        slots.append(tile);
      } else {
        if (open && !challenge) {
          const model = levelPreview(state,level.id);
          if (model) {
            const goalArt = preview(level, false, model.board ?? undefined);
            goalArt.classList.add('book-goal-preview');
            tile.append(goalArt);
          }
        }
        const text = document.createElement('strong'); text.textContent = number;
        const detail = document.createElement('small');
        detail.textContent = open ? caption : challenge ? `Соберите ${challenge.requiredWorks} работ` : levelRequirement(state,level);
        tile.append(text, detail);
      }
      if (goal.completed) {
        const print = gradientThumbnail(level);
        print.className = 'book-fragment';
        if (incoming === index) print.classList.add('book-fragment-arriving');
        tile.append(print);
      }
    }
    const status = document.createElement('p');
    status.className = 'book-count'; status.dataset.bookCount = '';
    status.setAttribute('aria-live', 'polite');
    status.textContent = `${progress.filled - Number(incoming !== undefined)}/4`;
    panel.append(slots, status);
    if (progress.unlocked && incoming === undefined) {
      const saved = state.challengeProgress?.attempts[book.id];
      const continuing = saved && !saved.completed && saved.moves < book.level.minimumSwaps + 3;
      const title = progress.claimed ? 'Повторить особую задачу' : continuing ? 'Продолжить особую задачу' : 'Особая задача';
      button(title, () => v.playChallenge(book.id, !!saved && !continuing), panel).dataset.bookChallenge = book.id;
    }
    actions.append(panel);
  } else if (route.kind === 'personal') {
    v.title.textContent = 'Личные задания';
    menuBack();
    const progress = state.personalProgress;
    if (!progress) return;
    label(dailyLabel(progress.day), 'menu-date');
    const { tasks, selected } = personalObjects(state, route.key);
    if (!selected) label('Сегодня нет доступных заданий.', 'menu-note');
    else {
      const stage = document.createElement('div');
      stage.className = 'personal-objects';
      stage.dataset.count = String(tasks.length);
      actions.append(stage);
      const selectedIndex = tasks.indexOf(selected);
      for (const [index,item] of tasks.entries()) {
        const { id, task } = item;
        const object = button('', () => v.navigate({ kind: 'personal', key: id }), stage);
        object.dataset.personal = task.kind;
        object.dataset.taskKey = id;
        object.style.gridColumn = String(index === selectedIndex ? 2 : index === (selectedIndex+1)%tasks.length ? 3 : 1);
        object.setAttribute('aria-pressed', String(selected.id === id));
        const icon = document.createElement('span');
        icon.className = 'personal-object';
        icon.setAttribute('aria-hidden', 'true');
        const figure = personalArt(task.kind);
        figure.addEventListener('click', event => {
          const bounds = figure.getBoundingClientRect();
          const x = Math.floor((event.clientX - bounds.left) * figure.width / bounds.width);
          const y = Math.floor((event.clientY - bounds.top) * figure.height / bounds.height);
          if (figure.getContext('2d')?.getImageData(x, y, 1, 1).data[3] === 0) event.stopPropagation();
        });
        icon.append(figure);
        const taskName = personalTaskName(task);
        const earned = progress.earned.includes(id);
        object.setAttribute('aria-label', earned ? `${taskName}, выполнено` : taskName);
        const caption = document.createElement('strong');
        const full = document.createElement('span');
        full.className = 'personal-caption-full';
        full.textContent = taskName;
        const short = document.createElement('span');
        short.className = 'personal-caption-short';
        short.textContent = personalShortLabels[task.kind];
        caption.append(full, short);
        object.append(icon, caption);
        if (earned) {
          const mark = document.createElement('small');
          mark.textContent = '✓ Выполнено';
          object.append(mark);
        }
        object.onkeydown = event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          const next = tasks[(index + (event.key === 'ArrowRight' ? 1 : tasks.length - 1)) % tasks.length]!;
          event.preventDefault();
          v.navigate({ kind: 'personal', key: next.id });
        };
      }
      const { task, level, id } = selected;
      const finished = taskStatus(task) !== 'playing';
      const detail = document.createElement('section');
      detail.className = 'personal-detail';
      const name = document.createElement('h3');
      name.textContent = level.title;
      detail.append(name);
      if (task.limit !== undefined || task.durationMs !== undefined) {
        const text = document.createElement('p');
        const moves = task.limit;
        const form = moves === undefined ? undefined : new Intl.PluralRules('ru').select(moves);
        text.textContent = moves !== undefined ? `${moves} ${form === 'one' ? 'ход' : form === 'few' ? 'хода' : 'ходов'}`
          : task.clock && !finished ? `Осталось · ${Math.ceil(task.clock.remainingMs / 1000)} с` : `${task.durationMs! / 1000} с`;
        detail.append(text);
      }
      const start = button(finished ? 'Повторить' : task.attempt ? 'Продолжить' : 'Играть', () => v.playPersonal(id, finished), detail);
      start.dataset.personalPlay = id;
      actions.append(detail);
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
    const { selected, month, months } = calendarSelection(state, route.date, route.month);
    if (!catalog || !selected || !month) {
      label(v.dailyLoading ? 'Проверяем календарь…' : v.retryDaily ? 'Календарь не загрузился.'
        : catalog ? 'В опубликованном архиве пока нет задач.' : 'Календарь пока недоступен.', 'menu-note').setAttribute('role', 'status');
      if (v.retryDaily) button('Повторить загрузку', v.retryDaily, actions, v.dailyLoading).className = 'quiet';
      return;
    }
    if (v.retryDaily) {
      label('Показан сохранённый календарь.', 'menu-note').setAttribute('role', 'status');
      button('Повторить загрузку', v.retryDaily, actions, v.dailyLoading).className = 'quiet';
    }
    const switchMonth = (target: string) => v.navigate({ kind: 'daily', month: target });
    const header = document.createElement('div'); header.className = 'calendar-heading';
    const monthIndex = months.indexOf(month);
    const previous = button('‹', () => switchMonth(months[monthIndex-1]!), header, monthIndex <= 0);
    previous.setAttribute('aria-label', 'Предыдущий месяц');
    const name = document.createElement('h3');
    name.textContent = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month+'-01T00:00:00Z'));
    header.append(name);
    const next = button('›', () => switchMonth(months[monthIndex+1]!), header, monthIndex === months.length-1);
    next.setAttribute('aria-label', 'Следующий месяц');
    const grid = document.createElement('div'); grid.className = 'calendar-grid';
    grid.setAttribute('aria-label', name.textContent);
    const first = new Date(month+'-01T00:00:00Z'), [year, number] = month.split('-').map(Number);
    for (const weekday of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) {
      const heading = document.createElement('span'); heading.className = 'calendar-weekday'; heading.textContent = weekday; grid.append(heading);
    }
    for (let offset = 0; offset < (first.getUTCDay()+6)%7; offset++) grid.append(document.createElement('span'));
    const count = new Date(Date.UTC(year!, number!, 0)).getUTCDate();
    for (let day = 1; day <= count; day++) {
      const date = month+'-'+String(day).padStart(2,'0');
      const slot = catalog.slots[date], available = !!slot && date <= catalog.through;
      const solved = catalog.solved.includes(date), attempt = catalog.attempts[date];
      const node = available ? button(String(day), () => v.navigate({ kind: 'daily', date, month }), grid) : document.createElement('span');
      node.className = 'calendar-day';
      if (available) {
        node.dataset.dailyDate = date;
        node.setAttribute('aria-pressed', String(date === selected));
        node.setAttribute('aria-label', dailyLabel(date)+(solved ? ', собрано' : attempt ? ', начато' : ''));
        if (solved) {
          const caption = document.createElement('span');
          caption.className = 'calendar-number'; caption.textContent = String(day);
          node.replaceChildren(gradientThumbnail(slot.level), caption);
        }
        if (attempt) {
          const mark = document.createElement('small'); mark.textContent = solved ? '✓' : '◐'; mark.setAttribute('aria-hidden','true'); node.append(mark);
        }
      } else {
        node.textContent = String(day); node.setAttribute('aria-disabled','true'); grid.append(node);
      }
    }
    actions.append(header, grid);
    const details = document.createElement('section'); details.className = 'calendar-selection';
    const date = document.createElement('strong'); date.textContent = dailyLabel(selected);
    const attempt = catalog.attempts[selected];
    const status = document.createElement('p');
    status.textContent = catalog.solved.includes(selected) ? attempt?.completed ? 'Собрано' : 'Собрано · повтор начат'
      : attempt ? 'Начато' : selected === catalog.through ? 'Задача дня' : 'Архив';
    details.append(date,status);
    button(attempt?.completed ? 'Повторить' : attempt ? 'Продолжить' : 'Играть',
      () => v.playDaily(selected, attempt?.completed === true), details).dataset.dailyPlay = selected;
    actions.append(details);
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
    const remainingSeconds = Math.ceil((timed?.run.remainingMs ?? 0) / 1000);
    const continuing = remainingSeconds > 0;
    const duration = continuing ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')} осталось` : '10 минут';
    menuRow(timedButton, continuing ? 'Продолжить заезд' : 'Заезд на время',
      timed?.finished ? `${duration} · Рекорд · ${timed.best}` : duration);
    actions.append(tabs, list);
    const definitions = route.group === 'chapter' ? chapterChallenges : route.group === 'geometry' ? geometryChallenges : challenges;
    if (route.group !== 'chapter') {
      const demonstration = route.group === 'geometry' ? definitions.find(item => item.level.id === 'geometry-v1-mixed')
        : definitions.find(item => challengeAvailable(item,state));
      if (demonstration) renderChallengeDemo(list, demonstration.level, demonstration.moveLimit, route.group === 'geometry');
    }
    for (const definition of definitions) {
      const { level, requiredWorks, moveLimit } = definition;
      const locked = !challengeAvailable(definition, state);
      const attempt = state.challengeProgress?.attempts[level.id];
      const best = state.challengeProgress?.best[level.id];
      const restart = !!attempt && challengeStatus(definition, attempt) !== 'playing';
      const card = button('', () => v.playChallenge(level.id, restart), list, locked);
      card.dataset.challengeId = level.id;
      if (route.selected === level.id) card.setAttribute('aria-current','true');
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
