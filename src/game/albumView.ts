import type { ExportField } from '../domain/export';
import { chapters, getLevel } from '../domain/levels';
import { hasAuthorProof } from '../domain/creative';
import type { Workspace } from '../domain/workspace';
import { gradientThumbnail } from './exportRenderer';
import type { MetaRoute } from './metaView';

type AlbumTab = 'campaign' | 'own';
export interface AlbumRoute { kind: 'album'; tab: AlbumTab }
export interface AlbumPosition { scroll: number; focus?: string; reveal?: boolean }

interface Props {
  route: AlbumRoute;
  state: Workspace;
  disabled: boolean;
  position: AlbumPosition | undefined;
  navigate(route: MetaRoute): void;
  back(): void;
  createWork(): void;
  importPuzzle(file: File): void;
  importNote: string;
  play(): void;
}

export function renderAlbum(parent: HTMLElement, props: Props): void {
  const { route, state, navigate, disabled, position } = props;
  const { tab } = route;
  const panel = document.createElement('section');
  panel.className = 'album';
  panel.dataset.meta = 'album';
  const button = (parent: HTMLElement, label: string, action: () => void) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.disabled = disabled;
    node.onclick = action;
    parent.append(node);
    return node;
  };

  const nav = document.createElement('nav');
  nav.className = 'album-nav';
  button(nav, '‹ Назад', props.back).className = 'quiet';
  const tabs = document.createElement('div');
  tabs.className = 'album-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Разделы альбома');
  for (const [value, label] of [['campaign', 'Собранное'], ['own', 'Мои работы']] as const) {
    const entry = button(tabs, label, () => {
      if (tab === value) return;
      navigate({ ...route, tab: value });
      parent.querySelector<HTMLElement>(`[data-album-focus="tab-${value}"]`)?.focus({ preventScroll: true });
    });
    entry.setAttribute('aria-pressed', String(tab === value));
    entry.dataset.albumFocus = `tab-${value}`;
  }

  const scroll = document.createElement('div');
  scroll.className = 'album-scroll';
  const footer = document.createElement('div');
  footer.className = 'album-footer';
  const empty = (message: string) => {
    const note = document.createElement('p');
    note.className = 'album-empty';
    note.textContent = message;
    scroll.append(note);
  };
  const grid = () => {
    const node = document.createElement('div');
    node.className = 'album-grid';
    scroll.append(node);
    return node;
  };
  const print = (parent: HTMLElement, field: ExportField, title: string, id: string, action: () => void) => {
    const node = button(parent, '', () => {
      node.focus({ preventScroll: true });
      action();
    });
    node.dataset.albumFocus = id;
    if (position?.focus === id) node.dataset.albumSelected = '';
    node.className = 'album-print';
    node.append(gradientThumbnail(field));
    const name = document.createElement('span');
    name.textContent = title;
    node.append(name);
    return node;
  };

  if (tab === 'campaign') {
    const completed = new Set(state.completed);
    chapters.forEach((chapter, index) => {
      const collected = chapter.levelIds.filter(id => completed.has(id));
      if (!collected.length) return;
      if (state.completed.length > collected.length || collected.length === chapter.levelIds.length) {
        const heading = document.createElement('h3');
        heading.textContent = `Глава ${index + 1}`;
        scroll.append(heading);
      }
      const prints = grid();
      for (const id of collected) {
        const level = getLevel(id);
        print(prints, level, level.title, id, () => navigate({ kind: 'card', levelId: id })).dataset.albumLevel = id;
      }
    });
    button(footer, 'Книги', () => navigate({ kind: 'books' })).dataset.albumFocus = 'books';
    if (!completed.size) {
      empty('Здесь появятся собранные градиенты.');
      button(footer, 'К игре', props.play);
    }
  } else {
    const works = Object.values(state.creative?.works ?? {});
    if (works.length) {
      const prints = grid();
      for (const work of works) {
        const node = print(prints, work.nodes[work.headNodeId]!.field, work.name, work.draftId, () => {
          navigate(hasAuthorProof(work, work.headNodeId)
            ? { kind: 'own-card', workId: work.workId, nodeId: work.headNodeId }
            : { kind: 'draft', draftId: work.draftId });
        });
        node.dataset.draftId = work.draftId;
      }
    } else empty('Ваши композиции и копии будут здесь.');
    button(footer, 'Создать', props.createWork).dataset.albumFocus = 'create';
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
    file.dataset.importPuzzle = '';
    file.onchange = () => {
      const selected = file.files?.[0];
      file.value = '';
      if (selected) props.importPuzzle(selected);
    };
    button(footer, 'Импорт задачи', () => file.click()).className = 'quiet';
    footer.append(file);
    if (props.importNote) {
      const status = document.createElement('p');
      status.className = 'album-import-status'; status.setAttribute('role', 'status');
      status.textContent = props.importNote; scroll.append(status);
    }
  }

  panel.append(nav, tabs, scroll, footer);
  parent.append(panel);
  if (position) {
    scroll.scrollTop = position.scroll;
    if (position.focus) {
      const target = [...panel.querySelectorAll<HTMLElement>('[data-album-focus]')]
        .find(node => node.dataset.albumFocus === position.focus);
      if (position.reveal) target?.scrollIntoView({ block: 'nearest' });
      target?.focus({ preventScroll: true });
    }
  }
}
