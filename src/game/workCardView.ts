import { exportResultMessage, type ExportFiles, type ExportResult } from '../app/exportFiles';
import { wallpaperField, type ExportField, type WallpaperSize } from '../domain/export';
import type { PublishedBenchmark } from '../domain/playerProgress';
import type { Workspace } from '../domain/workspace';
import { renderWallpaper } from './exportRenderer';

interface Actions {
  back(): void;
  replay?(): void;
  copy?(): void;
  edit?(): void;
  collection?(): void;
  sharePuzzle?(): Promise<ExportResult>;
}

export interface WorkCard {
  key: string;
  title: string;
  levelId?: string;
  filename: string;
  detail?: string;
  best: { clean: number | null; assisted: number | null };
  minimum: number;
  perfect: boolean;
  reference?: PublishedBenchmark;
}

export class WorkCardView {
  private readonly panel = document.createElement('section');
  private readonly image = document.createElement('img');
  private readonly note = document.createElement('p');
  private readonly saveButton = document.createElement('button');
  private readonly shareButton: HTMLButtonElement;
  private readonly wallpaperButton: HTMLButtonElement | undefined;
  private readonly options = document.createElement('details');
  private readonly summary = document.createElement('summary');
  private readonly field: ExportField;
  private file: File | null = null;
  private url: string | null = null;
  private size: WallpaperSize | null = null;
  private disposed = false;
  private blocked = true;
  private preparing = false;
  private sending = false;
  private refreshPending = false;
  private readonly refresh = () => {
    if (this.preparing || this.sending) this.refreshPending = true;
    else void this.prepare();
  };

  constructor(parent: HTMLElement, state: Workspace, private readonly work: WorkCard, private readonly files: ExportFiles, actions: Actions) {
    this.field = wallpaperField(state, work.key);
    this.panel.className = 'work-card';
    if (work.levelId) this.panel.dataset.levelId = work.levelId;
    this.panel.dataset.workKey = work.key;
    this.panel.dataset.meta = 'card';
    this.image.className = 'work-card-preview';
    this.image.alt = `Собранный градиент «${work.title}»`;
    this.note.className = 'work-card-status';
    this.note.setAttribute('role', 'status');
    const nav = document.createElement('nav');
    nav.className = 'work-card-nav';
    const add = (parent: HTMLElement, text: string, handler: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'quiet'; button.textContent = text;
      button.onclick = handler; parent.append(button);
      return button;
    };
    add(nav, '‹ Назад', () => { if (!this.handleBack()) actions.back(); });
    this.options.className = 'work-card-options';
    this.summary.textContent = '⋯';
    this.summary.setAttribute('aria-label', 'Действия с работой');
    const choices = document.createElement('div');
    choices.className = 'work-card-menu';
    if (work.detail) {
      const detail = document.createElement('p');
      detail.textContent = work.detail;
      choices.append(detail);
    }
    const records = document.createElement('div');
    records.className = 'work-card-records';
    if (state.preferences.statistics) {
      const { clean, assisted } = work.best;
      const values = [`Минимум — ${work.minimum}`];
      if (clean !== null) values.push(`Рекорд без помощи — ${clean}`);
      if (assisted !== null) values.push(`Рекорд с помощью — ${assisted}`);
      const line = document.createElement('p');
      line.textContent = values.join(' · ');
      records.append(line);
    }
    if (state.preferences.statistics && work.reference) {
      const row = document.createElement('p');
      const { mean, sampleSize, source, version } = work.reference;
      row.textContent = `Среднее игроков — ${mean} · ${sampleSize} результатов · ${source} · ${version}`;
      choices.append(row);
    }
    if (work.perfect) {
      const mastery = document.createElement('p');
      mastery.className = 'work-card-mastery';
      mastery.textContent = 'Идеально без помощи';
      records.append(mastery);
    }
    if (files.setWallpaper) this.wallpaperButton = add(choices, 'Установить обои', () => void this.send('setWallpaper'));
    this.shareButton = add(choices, 'Поделиться PNG', () => void this.send('share'));
    if (actions.replay) add(choices, 'Повторить работу', actions.replay);
    if (actions.copy) add(choices, 'Сохранить копию', actions.copy);
    if (actions.edit) add(choices, 'Редактировать', actions.edit);
    if (actions.sharePuzzle) add(choices, 'Поделиться задачей', () => void this.sendPuzzle(actions.sharePuzzle!));
    if (records.childElementCount) choices.prepend(records);
    this.options.append(this.summary, choices);
    nav.append(this.options);
    this.saveButton.type = 'button';
    this.saveButton.textContent = 'Сохранить PNG';
    this.saveButton.onclick = () => { if (this.file) void this.send('save'); else void this.prepare(); };
    const footer = document.createElement('div');
    footer.className = 'work-card-actions';
    footer.append(this.saveButton);
    if (actions.collection) add(footer, 'Все работы', actions.collection);
    const art = document.createElement('div');
    art.className = 'work-card-art';
    art.append(this.image);
    this.panel.append(nav, art);
    this.panel.append(footer, this.note);
    parent.append(this.panel);
    window.addEventListener('resize', this.refresh);
    void this.prepare();
  }

  update(blocked: boolean): void {
    this.blocked = blocked;
    this.saveButton.disabled = blocked || this.preparing || this.sending;
    this.panel.querySelectorAll<HTMLButtonElement>('button.quiet').forEach(button => { button.disabled = blocked || this.sending; });
    this.shareButton.hidden = !this.file || !this.files.canShare(this.file);
    if (this.wallpaperButton) this.wallpaperButton.disabled = blocked || this.sending || this.preparing || !this.file;
  }

  handleBack(): boolean {
    if (this.sending) return true;
    if (!this.options.open) return false;
    this.options.open = false; this.summary.focus(); return true;
  }

  private async prepare(): Promise<void> {
    this.preparing = true;
    this.update(this.blocked);
    try {
      const size = await this.files.screenSize();
      if (this.disposed || (this.file && this.size?.width === size.width && this.size.height === size.height)) return;
      this.note.textContent = 'Готовим PNG…';
      const blob = await renderWallpaper(this.field, size);
      if (this.disposed) return;
      this.clearFile();
      this.size = size;
      this.file = new File([blob], this.work.filename, { type: 'image/png' });
      this.url = URL.createObjectURL(this.file);
      this.image.src = this.url;
      this.note.textContent = '';
      this.saveButton.textContent = 'Сохранить PNG';
    } catch {
      if (!this.disposed) {
        this.clearFile();
        this.note.textContent = 'Не удалось подготовить PNG.';
        this.saveButton.textContent = 'Повторить подготовку';
      }
    } finally {
      this.preparing = false;
      this.finish();
    }
  }

  private async sendPuzzle(deliver: () => Promise<ExportResult>): Promise<void> {
    if (this.blocked || this.sending) return;
    this.sending = true;
    this.update(this.blocked);
    try {
      const result = await deliver();
      if (!this.disposed) this.note.textContent = result === 'cancelled' ? 'Отправка задачи отменена.'
        : result === 'opened' ? 'Открыто окно отправки задачи.'
        : result === 'download-requested' ? 'Файл задачи появится в загрузках.' : 'Файл задачи готов.';
    } catch {
      if (!this.disposed) this.note.textContent = 'Не удалось передать файл задачи.';
    } finally {
      this.sending = false;
      this.finish();
    }
  }

  private async send(action: 'save' | 'share' | 'setWallpaper'): Promise<void> {
    if (!this.file || this.blocked || this.sending || (action === 'share' && this.shareButton.hidden)) return;
    const deliver = this.files[action];
    if (!deliver) return;
    this.sending = true; this.update(this.blocked);
    try {
      const result = await deliver(this.file);
      if (!this.disposed) this.note.textContent = exportResultMessage(result);
    } catch {
      const failure = {
        save: 'Не удалось сохранить PNG. Попробуйте ещё раз.',
        share: 'Не удалось отправить PNG. Попробуйте ещё раз.',
        setWallpaper: 'Не удалось открыть установку обоев. Можно сохранить PNG.',
      };
      if (!this.disposed) this.note.textContent = failure[action];
    } finally {
      this.sending = false;
      this.finish();
    }
  }

  private finish(): void {
    if (this.disposed) return;
    if (this.refreshPending) {
      this.refreshPending = false;
      this.refresh();
    } else this.update(this.blocked);
  }

  private clearFile(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.image.removeAttribute('src');
    this.file = this.url = this.size = null;
  }

  destroy(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.refresh);
    this.clearFile();
    this.panel.remove();
  }
}
