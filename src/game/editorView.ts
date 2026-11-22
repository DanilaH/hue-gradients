import { anotherStart, defaultPins, FIELD_MESSAGES, inspectField, makeField, normalizedCorners, validName, type EditorField } from '../domain/editor';
import { hasAuthorProof, type CreativeAction, type CreativeWork } from '../domain/creative';
import { paintGradientThumbnail } from './exportRenderer';

interface EditorProps {
  work: CreativeWork;
  nodeId?: string;
  disabled: boolean;
  pending: boolean;
  recover(): Promise<boolean>;
  commit(action: CreativeAction): Promise<boolean>;
  play(workId: string, nodeId: string): Promise<boolean>;
  exportWork(workId: string, nodeId: string): void;
  back(): void;
}

const corners = [
  ['top-left', 'Слева вверху'],
  ['top-right', 'Справа вверху'],
  ['bottom-left', 'Слева внизу'],
  ['bottom-right', 'Справа внизу'],
] as const;

const presets = [
  ['#FF957F', 'Коралловый'], ['#FFE2A6', 'Песочный'], ['#FFF0D9', 'Молочный'], ['#DF8CBA', 'Розовый'],
  ['#AD9FEB', 'Сиреневый'], ['#6C58A6', 'Фиолетовый'], ['#879DDB', 'Голубой'], ['#44669E', 'Синий'],
  ['#ACE0D1', 'Мятный'], ['#66B8AA', 'Бирюзовый'], ['#9BB673', 'Оливковый'], ['#423451', 'Сливовый'],
] as const;

type EditorMode = 'main' | 'menu' | 'color' | 'size' | 'pins' | 'start' | 'history';
const tools = [
  ['size', 'Размер'],
  ['pins', 'Закрепления'],
  ['start', 'Стартовая раскладка'],
  ['history', 'История'],
] as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** The form owns previews. Session remains the authority for revisions and author proof. */
export class EditorView {
  private work: CreativeWork;
  private disabled: boolean;
  private field: EditorField;
  private seed: number;
  private baseNodeId: string;
  private editId = crypto.randomUUID();
  private recoveredEditId: string | undefined;
  private dirty = false;
  private nameDirty = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<boolean> = Promise.resolve(true);
  private sequence = 0;
  private savedSequence = 0;
  private pending: boolean;
  private failedAction: CreativeAction | null = null;
  private working = false;
  private exitPrompt = false;
  private mode: EditorMode = 'main';
  private corner = 0;
  private message = '';
  private focusAfterAction: string | undefined;

  private readonly panel = element('section', 'editor-panel');
  private readonly header = element('header', 'editor-nav');
  private readonly backButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly name = element('input', 'editor-name');
  private readonly content = element('div', 'editor-content');
  private readonly status = element('p', 'editor-status');
  private readonly controls = element('div', 'editor-controls');
  private readonly canvas = element('canvas', 'editor-gradient');

  constructor(parent: HTMLElement, private readonly props: EditorProps) {
    this.work = props.work;
    this.disabled = props.disabled;
    this.pending = props.pending;
    const buffer = props.nodeId ? undefined : Object.values(this.work.buffers).at(-1);
    const node = this.work.nodes[props.nodeId ?? this.work.headNodeId]!;
    this.baseNodeId = buffer?.baseNodeId ?? node.nodeId;
    this.field = buffer?.field ?? node.field;
    this.seed = buffer?.seed ?? node.seed;
    this.recoveredEditId = buffer?.editId;
    this.dirty = !!buffer;
    if (buffer) this.message = 'Восстановлен сохранённый предпросмотр';

    this.backButton = this.button('‹', () => void this.back(), this.header);
    this.backButton.className = 'quiet editor-nav-button';
    this.backButton.setAttribute('aria-label', 'Назад');
    this.name.type = 'text';
    this.name.value = this.work.name;
    this.name.setAttribute('aria-label', 'Название работы');
    this.name.oninput = () => { this.nameDirty = true; this.schedule(); };
    this.name.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); this.name.blur(); void this.flush(); }
    };
    this.header.append(this.name);
    this.menuButton = this.button('⋯', () => this.show(this.mode === 'menu' ? 'main' : 'menu'), this.header);
    this.menuButton.className = 'quiet editor-nav-button';
    this.menuButton.setAttribute('aria-label', 'Инструменты');
    this.canvas.width = 192;
    this.canvas.height = 192;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Градиент работы');
    this.status.id = 'editor-state';
    this.status.setAttribute('role', 'status');
    this.panel.append(this.header, this.content, this.status, this.controls);
    parent.append(this.panel);
    this.draw();
  }

  update(work: CreativeWork, disabled: boolean, pending = false): void {
    this.work = work;
    this.disabled = disabled;
    this.pending = pending;
    if (!this.nameDirty && document.activeElement !== this.name) this.name.value = work.name;
    this.drawControls();
  }

  destroy(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.panel.remove();
  }

  private button(text: string, action: () => void, parent: HTMLElement, disabled = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.ineligible = String(disabled);
    button.onclick = action;
    parent.append(button);
    return button;
  }

  private drawControls(): void {
    const check = inspectField(this.field);
    let status = this.message;
    const controlState = [this.pending, this.exitPrompt, this.mode, this.dirty, check.errors.length > 0].join(':');
    if (this.controls.dataset.state !== controlState) {
      this.controls.dataset.state = controlState;
      this.controls.replaceChildren();
      if (this.pending) {
        this.button('Повторить сохранение', () => void this.perform(() => this.retry()), this.controls);
      } else if (this.exitPrompt) {
        this.button('Остаться', () => { this.exitPrompt = false; this.drawControls(); }, this.controls);
        this.button('Выйти без этих изменений', this.props.back, this.controls);
      } else if (this.mode === 'main') {
        const play = this.button('Испытать', () => void this.perform(() => this.play()), this.controls, !!check.errors.length);
        play.dataset.authorPlay = '';
        if (check.errors.length) play.setAttribute('aria-describedby',this.status.id);
      } else if (['color', 'size', 'pins', 'start'].includes(this.mode)) {
        this.button('Отмена', () => void this.perform(() => this.cancel()), this.controls).className = 'quiet';
        this.button(this.mode === 'color' ? 'Готово' : 'Применить', () => void this.perform(() => this.finishTool()), this.controls).dataset.editorApply = '';
      }
    }

    if (this.pending) status = 'Не удалось подтвердить запись. Повторите сохранение.';
    else if (!status && this.mode === 'main') {
      const issue = check.errors[0] ?? check.warnings[0];
      if (issue) status = FIELD_MESSAGES[issue] ?? issue;
      else if (!this.dirty && hasAuthorProof(this.work, this.baseNodeId)) status = 'Пройдена автором';
    }
    if (this.status.textContent !== status) this.status.textContent = status;
    this.status.dataset.invalid = String(this.mode === 'main' && !!check.errors.length);
    this.menuButton.hidden = this.mode !== 'main' && this.mode !== 'menu';
    this.menuButton.setAttribute('aria-expanded', String(this.mode === 'menu'));
    this.menuButton.disabled = this.disabled || this.pending || this.working;
    this.backButton.disabled = this.menuButton.disabled;
    this.name.disabled = this.menuButton.disabled;
    this.name.readOnly = this.mode !== 'main';
    this.content.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('button,input,select')
      .forEach(control => { control.disabled = this.menuButton.disabled || control.dataset.ineligible === 'true'; });
    this.controls.querySelectorAll('button').forEach(button => {
      button.disabled = this.disabled || this.working || button.dataset.ineligible === 'true';
    });
  }

  private draw(): void {
    this.panel.dataset.mode = this.mode;
    this.content.replaceChildren();
    if (this.mode === 'main' || this.mode === 'color') this.drawComposition();
    if (this.mode === 'color') this.drawColor();
    if (this.mode === 'menu') this.drawMenu();
    if (this.mode === 'history') this.drawHistory();
    if (this.mode === 'size' || this.mode === 'pins' || this.mode === 'start') this.drawTool(this.mode);
    this.drawControls();
  }

  private show(mode: EditorMode, focus?: string): void {
    this.mode = mode;
    this.draw();
    if (focus && this.working) this.focusAfterAction = focus;
    else if (focus) this.panel.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    else if (mode !== 'main') (this.content.querySelector<HTMLElement>('button,select') ?? this.backButton).focus({ preventScroll: true });
  }

  private drawComposition(): void {
    const frame = element('div', 'editor-art-frame');
    const art = element('div', 'editor-art');
    const { width, height } = this.field;
    const ratio = Math.max(0.55, Math.min(2, width / height));
    art.style.setProperty('--art-ratio', String(ratio));
    art.append(this.canvas);
    frame.append(art);
    this.content.append(frame);
    corners.forEach(([side, label], index) => {
      if ((width === 1 && (index === 1 || index === 3)) || (height === 1 && index >= 2)) return;
      const marker = this.button('', () => { this.corner = index; this.show('color', '.editor-swatch[aria-pressed=true], .editor-swatch'); }, art);
      marker.className = 'editor-corner';
      marker.dataset.corner = side;
      marker.setAttribute('aria-label', label);
      marker.setAttribute('aria-pressed', String(this.mode === 'color' && this.corner === index));
      marker.dataset.ineligible = String(this.mode === 'color');
    });
    this.refreshComposition();
  }

  private refreshComposition(): void {
    paintGradientThumbnail(this.canvas, this.field);
    this.content.querySelectorAll<HTMLButtonElement>('.editor-corner').forEach(marker => {
      const index = corners.findIndex(([side]) => marker.dataset.corner === side);
      marker.style.setProperty('--swatch', this.field.cornerColorsTLTRBLBR[index]!);
    });
  }

  private drawColor(): void {
    const palette = element('div', 'editor-color');
    const title = element('h3', 'editor-tool-title');
    title.textContent = corners[this.corner]![1];
    const swatches = element('div', 'editor-swatches');
    const custom = element('label', 'editor-custom-color');
    custom.textContent = 'Свой цвет';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.field.cornerColorsTLTRBLBR[this.corner]!;
    input.setAttribute('aria-label', 'Свой цвет');
    for (const [color, label] of presets) {
      const swatch = this.button('', () => {
        input.value = color;
        this.changeColor(color);
      }, swatches);
      swatch.className = 'editor-swatch';
      swatch.style.setProperty('--swatch', color);
      swatch.dataset.color = color;
      swatch.setAttribute('aria-label', label);
      swatch.setAttribute('aria-pressed', String(color === input.value.toUpperCase()));
    }
    const updateColor = () => this.changeColor(input.value);
    input.oninput = updateColor;
    input.onchange = updateColor;
    custom.append(input);
    palette.append(title, swatches, custom);
    this.content.append(palette);
  }

  private changeColor(color: string): void {
    const value = color.toUpperCase();
    if (this.field.cornerColorsTLTRBLBR[this.corner] === value) return;
    const colors = [...this.field.cornerColorsTLTRBLBR];
    colors[this.corner] = value;
    const { width, height, pinnedPositions } = this.field;
    this.field = {
      ...this.field,
      cornerColorsTLTRBLBR: normalizedCorners(width, height, colors),
      solvedTileColors: makeField(width, height, colors, pinnedPositions, this.seed).solvedTileColors,
    };
    this.changed();
    this.refreshComposition();
    this.content.querySelectorAll<HTMLButtonElement>('.editor-swatch').forEach(swatch => {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === value));
    });
    this.drawControls();
  }

  private drawMenu(): void {
    const list = element('div', 'editor-tool-list');
    for (const [mode, label] of tools) {
      this.button(label, () => this.show(mode), list).className = 'quiet';
    }
    if (this.dirty) this.button('Отменить правки', () => void this.perform(() => this.cancel()), list).className = 'quiet';
    if (!this.dirty && hasAuthorProof(this.work, this.baseNodeId)) {
      this.button('Сохранить обои', () => void this.perform(async () => {
        if (await this.flush()) this.props.exportWork(this.work.workId, this.baseNodeId);
      }), list);
    }
    this.content.append(list);
  }

  private drawTool(mode: 'size' | 'pins' | 'start'): void {
    const title = element('h3', 'editor-tool-title');
    title.textContent = tools.find(([key]) => key === mode)![1];
    const grid = element('div', 'editor-grid');
    grid.style.setProperty('--columns', String(this.field.width));
    grid.style.setProperty('--grid-width', `${Math.min(360, Math.max(96, this.field.width / this.field.height * 160))}px`);
    this.field.solvedTileColors.forEach((_, index) => {
      const pinned = this.field.pinnedPositions.includes(index);
      const tile = mode === 'start' ? this.field.startTileAtPosition[index]! : index;
      const cell = mode === 'pins'
        ? this.button('', () => {
          const pins = pinned ? this.field.pinnedPositions.filter(position => position !== index) : [...this.field.pinnedPositions, index];
          this.change(makeField(this.field.width, this.field.height, this.field.cornerColorsTLTRBLBR, pins, this.seed));
          this.content.querySelectorAll<HTMLElement>('.editor-cell')[index]?.focus({ preventScroll: true });
        }, grid)
        : grid.appendChild(document.createElement('div'));
      cell.className = 'editor-cell';
      cell.style.setProperty('--tile', this.field.solvedTileColors[tile]!);
      if (mode === 'pins') {
        cell.setAttribute('aria-label', `Плитка ${index + 1}${pinned ? ', закреплена' : ''}`);
        cell.setAttribute('aria-pressed',String(pinned));
      }
      if (pinned) {
        const marker = element('span', 'editor-pin');
        marker.setAttribute('aria-hidden', 'true');
        cell.append(marker);
      }
    });
    this.content.append(title, grid);
    if (mode === 'size') {
      const sizes = element('div', 'editor-sizes');
      for (const [key, label, max] of [['width', 'Столбцы', 6], ['height', 'Строки', 5]] as const) {
        const row = document.createElement('label');
        row.textContent = label;
        const select = document.createElement('select');
        select.setAttribute('aria-label', label);
        for (let n = 1; n <= max; n++) select.add(new Option(String(n), String(n)));
        select.value = String(this.field[key]);
        select.onchange = () => {
          const width = key === 'width' ? Number(select.value) : this.field.width;
          const height = key === 'height' ? Number(select.value) : this.field.height;
          this.change(makeField(width, height, this.field.cornerColorsTLTRBLBR, defaultPins(width, height), this.seed));
          this.content.querySelector<HTMLElement>(`select[aria-label="${label}"]`)?.focus({ preventScroll: true });
        };
        row.append(select);
        sizes.append(row);
      }
      this.content.append(sizes);
    } else if (mode === 'start') {
      this.button('Другое начало', () => {
        const next = anotherStart(this.field, this.seed);
        if (!next) return;
        this.seed = next.seed;
        this.change({ ...this.field, startTileAtPosition: next.start });
      }, this.content, this.field.width * this.field.height - this.field.pinnedPositions.length < 3).className = 'quiet';
    }
  }

  private drawHistory(): void {
    const title = element('h3', 'editor-tool-title');
    title.textContent = 'История';
    const list = element('div', 'editor-revisions');
    const parents = new Set(Object.values(this.work.nodes).flatMap(node => node.parentNodeIds));
    Object.values(this.work.nodes).forEach((node, index) => {
      const display = `Версия ${index + 1}`;
      const button = this.button('', () => void this.perform(async () => {
        if (!await this.flush() || !await this.enqueue({ kind: 'editor-select', workId: this.work.workId, nodeId: node.nodeId })) return;
        this.adopt(node.nodeId);
        this.show('main', '[data-author-play]');
      }), list);
      button.className = 'quiet editor-revision';
      button.setAttribute('aria-label', `Открыть версию ${index + 1}`);
      if (node.nodeId === this.baseNodeId) button.setAttribute('aria-current', 'true');
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 48;
      thumbnail.height = 48;
      thumbnail.setAttribute('aria-hidden', 'true');
      paintGradientThumbnail(thumbnail, node.field);
      const label = element('span', 'editor-revision-title');
      label.textContent = display;
      const detail = element('span', 'editor-revision-detail');
      const status = [
        node.nodeId === this.work.headNodeId ? 'текущая' : !parents.has(node.nodeId) ? 'ветка' : '',
        hasAuthorProof(this.work, node.nodeId) ? 'пройдена автором' : '',
      ].filter(Boolean);
      detail.textContent = [`${node.field.width}×${node.field.height}`, ...status].join(' · ');
      label.append(detail);
      button.append(thumbnail, label);
    });
    Object.values(this.work.buffers).forEach((buffer, index) => {
      this.button(`Продолжить предпросмотр ${index + 1}`, () => void this.perform(async () => {
        if (!await this.flush()) return;
        this.adopt(buffer.baseNodeId);
        this.field = buffer.field;
        this.seed = buffer.seed;
        this.recoveredEditId = buffer.editId;
        this.dirty = true;
        this.message = 'Восстановлен сохранённый предпросмотр';
        this.show('main', '[data-author-play]');
      }), list).className = 'quiet';
    });
    this.content.append(title, list);
  }

  private change(field: EditorField): void {
    this.field = field;
    this.changed();
    this.draw();
  }

  private changed(): void {
    this.dirty = true;
    this.sequence++;
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.message = 'Изменения ещё не сохранены';
    this.status.textContent = this.message;
    this.timer = setTimeout(() => { if (!this.working) void this.flush(); }, 400);
  }

  private enqueue(action: CreativeAction): Promise<boolean> {
    const task = this.queue.then(async () => {
      if (this.disposed) return false;
      let success = false;
      try { success = await this.props.commit(action); } catch { /* keep the form intact */ }
      this.failedAction = success ? null : action;
      return success;
    });
    this.queue = task;
    return task;
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.working || this.disabled || this.disposed) return;
    this.working = true;
    this.drawControls();
    try { await action(); }
    finally {
      this.working = false;
      if (!this.disposed) {
        this.drawControls();
        if (this.focusAfterAction) this.panel.querySelector<HTMLElement>(this.focusAfterAction)?.focus({ preventScroll: true });
      }
      this.focusAfterAction = undefined;
    }
  }

  private async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.nameDirty) {
      let name: string;
      try { name = validName(this.name.value); }
      catch (error) { this.message = (error as Error).message; this.drawControls(); return false; }
      const original = this.name.value;
      if (!await this.enqueue({ kind: 'editor-rename', workId: this.work.workId, name })) {
        this.message = 'Название не сохранено. Повторите действие.';
        this.drawControls();
        return false;
      }
      if (this.name.value === original) { this.nameDirty = false; this.name.value = name; }
    }
    const sequence = this.sequence;
    if (this.dirty && sequence > this.savedSequence) {
      const buffer = { editId: this.editId, baseNodeId: this.baseNodeId, field: this.field, seed: this.seed };
      if (!await this.enqueue({ kind: 'editor-buffer', workId: this.work.workId, buffer })) {
        this.message = 'Предпросмотр не сохранён. Повторите действие.';
        this.drawControls();
        return false;
      }
      this.savedSequence = sequence;
    }
    this.message = this.dirty ? 'Предпросмотр сохранён на устройстве' : '';
    this.drawControls();
    return true;
  }

  private adopt(nodeId: string): void {
    const node = this.work.nodes[nodeId]!;
    this.baseNodeId = nodeId;
    this.field = node.field;
    this.seed = node.seed;
    this.editId = crypto.randomUUID();
    this.recoveredEditId = undefined;
    this.dirty = false;
    this.sequence = 0;
    this.savedSequence = 0;
    this.message = '';
  }

  private async apply(): Promise<boolean> {
    if (!await this.flush()) return false;
    if (!this.dirty) return true;
    const nodeId = crypto.randomUUID();
    if (!await this.enqueue({
      kind: 'editor-apply', workId: this.work.workId, nodeId, baseNodeId: this.baseNodeId, editId: this.editId,
      ...(this.recoveredEditId ? { recoveredEditId: this.recoveredEditId } : {}), field: this.field, seed: this.seed,
    })) {
      this.message = 'Версия не сохранена. Повторите действие.';
      this.drawControls();
      return false;
    }
    this.adoptApplied(nodeId);
    return true;
  }

  private adoptApplied(nodeId: string): void {
    const saved = this.work.nodes[nodeId];
    this.adopt(saved?.nodeId ?? this.baseNodeId);
    if (saved && this.work.headNodeId !== nodeId) this.message = 'Сохранена отдельная ветка';
  }

  private async finishTool(): Promise<void> {
    if (await this.apply()) this.mainFromTool();
  }

  private mainFromTool(): void {
    const focus = this.mode === 'color' ? `[data-corner="${corners[this.corner]![0]}"]` : '.editor-nav-button[aria-expanded]';
    this.show('main', focus);
  }

  private async cancel(): Promise<void> {
    clearTimeout(this.timer);
    await this.queue;
    if (this.nameDirty && !await this.flush()) return;
    if ((this.work.buffers[this.editId] || (this.recoveredEditId && this.work.buffers[this.recoveredEditId]))
      && !await this.enqueue({
        kind: 'editor-discard', workId: this.work.workId, editId: this.editId,
        ...(this.recoveredEditId ? { recoveredEditId: this.recoveredEditId } : {}),
      })) {
      this.message = 'Отмена не сохранена. Повторите действие.';
      this.drawControls();
      return;
    }
    this.adopt(this.baseNodeId);
    this.mainFromTool();
  }

  private async play(): Promise<void> {
    if (!await this.apply()) return;
    this.drawControls();
    await this.props.play(this.work.workId, this.baseNodeId);
  }

  async back(): Promise<void> {
    if (this.pending || this.working) return;
    if (this.mode !== 'main') {
      this.mainFromTool();
      return;
    }
    await this.perform(async () => {
      if (await this.flush()) this.props.back();
      else if (!this.pending) { this.exitPrompt = true; this.drawControls(); }
    });
  }

  private async retry(): Promise<void> {
    const action = this.failedAction;
    if (!await this.props.recover()) return;
    if (this.disposed) return;
    this.failedAction = null;
    if (action?.kind === 'editor-apply') {
      this.adoptApplied(action.nodeId);
      this.mainFromTool();
    } else if (action?.kind === 'editor-discard') {
      this.adopt(this.baseNodeId);
      this.mainFromTool();
    } else if (action?.kind === 'editor-select') {
      this.adopt(action.nodeId);
      this.show('main', '[data-author-play]');
    } else {
      if (action?.kind === 'editor-buffer') this.savedSequence = this.sequence;
      if (action?.kind === 'editor-rename') this.nameDirty = false;
      this.message = this.dirty ? 'Предпросмотр сохранён на устройстве' : '';
      this.drawControls();
    }
  }
}
