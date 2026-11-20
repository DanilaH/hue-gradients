import { exportResultMessage, type ExportFiles } from '../app/exportFiles';
import { wallpaperField, type ExportField, type WallpaperSize } from '../domain/export';
import type { Workspace } from '../domain/workspace';
import { renderWallpaper } from './exportRenderer';

interface Actions {
  back(): void;
  replay?(): void;
  copy?(): void;
  edit?(): void;
  collection?(): void;
}

export interface WorkCard {
  key: string;
  title: string;
  levelId?: string;
  filename: string;
  detail?: string;
  best?: { clean: number | null; assisted: number | null };
}

export class WorkCardView {
  private readonly panel = document.createElement('section');
  private readonly image = document.createElement('img');
  private readonly note = document.createElement('p');
  private readonly saveButton = document.createElement('button');
  private readonly shareButton: HTMLButtonElement;
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
    add(nav, '‹ Назад', actions.back);
    this.options.className = 'work-card-options';
    this.summary.textContent = '⋯';
    this.summary.setAttribute('aria-label', 'Действия с работой');
    const choices = document.createElement('div');
    choices.className = 'work-card-menu';
    const best = work.best;
    const records = [work.detail, best?.clean == null ? '' : `Без помощи — ${best.clean}`, best?.assisted == null ? '' : `С помощью — ${best.assisted}`].filter(Boolean);
    if (records.length) {
      const stats = document.createElement('p'); stats.textContent = records.join(' · '); choices.append(stats);
    }
    this.shareButton = add(choices, 'Поделиться PNG', () => void this.send('share'));
    if (actions.replay) add(choices, 'Повторить работу', actions.replay);
    if (actions.copy) add(choices, 'Сохранить копию', actions.copy);
    if (actions.edit) add(choices, 'Редактировать', actions.edit);
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
    this.panel.append(nav, art, footer, this.note);
    parent.append(this.panel);
    window.addEventListener('resize', this.refresh);
    void this.prepare();
  }

  update(blocked: boolean): void {
    this.blocked = blocked;
    this.saveButton.disabled = blocked || this.preparing || this.sending;
    this.panel.querySelectorAll<HTMLButtonElement>('button.quiet').forEach(button => { button.disabled = blocked || this.sending; });
    this.shareButton.hidden = !this.file || !this.files.canShare(this.file);
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

  private async send(action: 'save' | 'share'): Promise<void> {
    if (!this.file || this.blocked || this.sending || (action === 'share' && this.shareButton.hidden)) return;
    this.sending = true; this.update(this.blocked);
    try {
      const result = await this.files[action](this.file);
      if (!this.disposed) this.note.textContent = exportResultMessage(result);
    } catch {
      if (!this.disposed) this.note.textContent = action === 'save'
        ? 'Не удалось сохранить PNG. Попробуйте ещё раз.'
        : 'Не удалось отправить PNG. Попробуйте ещё раз.';
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
