import { exportResultMessage, type ExportFiles } from '../app/exportFiles';
import { exportPlan, type ExportPlan } from '../domain/export';
import type { LevelDefinition } from '../domain/puzzle';
import type { Workspace } from '../domain/workspace';
import { renderExport } from './exportRenderer';

interface Actions {
  back(): void;
  replay(): void;
  copy(): void;
  layouts(): void;
  collection: (() => void) | undefined;
}

export class WorkCardView {
  private readonly panel = document.createElement('section');
  private readonly image = document.createElement('img');
  private readonly note = document.createElement('p');
  private readonly saveButton = document.createElement('button');
  private readonly options = document.createElement('details');
  private readonly summary = document.createElement('summary');
  private readonly plan: ExportPlan;
  private file: File | null = null;
  private url: string | null = null;
  private disposed = false;
  private blocked = true;
  private preparing = false;
  private saving = false;

  constructor(parent: HTMLElement, state: Workspace, private readonly level: LevelDefinition, private readonly files: ExportFiles, actions: Actions) {
    this.plan = exportPlan(state, { format: 'clean', keys: [`campaign:${level.id}`], caption: '' });
    this.panel.className = 'work-card';
    this.panel.dataset.levelId = level.id;
    this.panel.dataset.meta = 'card';
    this.image.className = 'work-card-preview';
    this.image.alt = `Собранный градиент «${level.title}»`;
    this.note.className = 'work-card-status';
    this.note.setAttribute('role', 'status');
    const nav = document.createElement('nav');
    nav.className = 'work-card-nav';
    const add = (parent: HTMLElement, text: string, handler: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'quiet'; button.textContent = text;
      button.onclick = handler; parent.append(button);
    };
    add(nav, '‹ Назад', actions.back);
    this.options.className = 'work-card-options';
    this.summary.textContent = '⋯';
    this.summary.setAttribute('aria-label', 'Действия с работой');
    const choices = document.createElement('div');
    choices.className = 'work-card-menu';
    const best = state.bests[level.id];
    const records = [best?.clean == null ? '' : `Без помощи — ${best.clean}`, best?.assisted == null ? '' : `С помощью — ${best.assisted}`].filter(Boolean);
    if (records.length) {
      const stats = document.createElement('p'); stats.textContent = records.join(' · '); choices.append(stats);
    }
    add(choices, 'Повторить работу', actions.replay);
    add(choices, 'Сохранить копию', actions.copy);
    add(choices, 'Другие макеты', actions.layouts);
    if (actions.collection) add(choices, 'Все работы', actions.collection);
    this.options.append(this.summary, choices);
    nav.append(this.options);
    this.saveButton.type = 'button';
    this.saveButton.textContent = 'Сохранить PNG';
    this.saveButton.onclick = () => { if (this.file) void this.save(); else void this.prepare(); };
    this.panel.append(nav, this.image, this.saveButton, this.note);
    parent.append(this.panel);
    void this.prepare();
  }

  update(blocked: boolean): void {
    this.blocked = blocked;
    this.saveButton.disabled = blocked || this.preparing || this.saving;
    this.options.querySelectorAll('button').forEach(button => { button.disabled = blocked || this.saving; });
  }

  handleBack(): boolean {
    if (this.saving) return true;
    if (!this.options.open) return false;
    this.options.open = false; this.summary.focus(); return true;
  }

  private async prepare(): Promise<void> {
    this.preparing = true; this.note.textContent = 'Готовим PNG…';
    this.update(this.blocked);
    try {
      const blob = await renderExport(this.plan);
      if (this.disposed) return;
      this.file = new File([blob], `Poluson-${String(this.level.ordinal).padStart(3, '0')}.png`, { type: 'image/png' });
      this.url = URL.createObjectURL(this.file);
      this.image.src = this.url;
      this.note.textContent = '';
      this.saveButton.textContent = 'Сохранить PNG';
    } catch {
      if (!this.disposed) {
        this.note.textContent = 'Не удалось подготовить PNG.';
        this.saveButton.textContent = 'Повторить подготовку';
      }
    } finally {
      this.preparing = false;
      if (!this.disposed) this.update(this.blocked);
    }
  }

  private async save(): Promise<void> {
    if (!this.file || this.blocked || this.saving) return;
    this.saving = true; this.update(this.blocked);
    try {
      const result = await this.files.save(this.file);
      if (!this.disposed) this.note.textContent = exportResultMessage(result);
    } catch {
      if (!this.disposed) this.note.textContent = 'Не удалось сохранить PNG. Попробуйте ещё раз.';
    } finally {
      this.saving = false;
      if (!this.disposed) this.update(this.blocked);
    }
  }

  destroy(): void {
    this.disposed = true;
    if (this.url) URL.revokeObjectURL(this.url);
    this.panel.remove();
  }
}
