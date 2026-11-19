import { canExport, eligibleExportWorks, exportWorkCount, selectExportWork, type ExportField, type ExportWork } from '../domain/export';
import { chapters, getLevel } from '../domain/levels';
import { chapterCount, EXPORT_FORMATS } from '../domain/progression';
import type { Workspace } from '../domain/workspace';
import { gradientThumbnail } from './exportRenderer';
import type { MetaRoute } from './metaView';

type AlbumTab = 'campaign' | 'own';
type CollageFormat = typeof EXPORT_FORMATS[number]['id'];
export interface AlbumSelection { format: CollageFormat; keys: readonly string[] }
export interface AlbumRoute { kind: 'album'; tab: AlbumTab; selection?: AlbumSelection }
export interface AlbumPosition { scroll: number; focus?: string; reveal?: boolean }

interface Props {
  route: AlbumRoute;
  state: Workspace;
  disabled: boolean;
  position: AlbumPosition | undefined;
  navigate(route: MetaRoute): void;
  back(): void;
  createWork(): void;
  play(): void;
}

const collageFormats = EXPORT_FORMATS.filter(format => exportWorkCount(format.id) > 1);
export const albumPositionKey = (route: AlbumRoute) => `${route.selection ? 'select' : 'browse'}:${route.tab}`;

export function renderAlbum(parent: HTMLElement, props: Props): void {
  const { route, state, navigate, disabled, position } = props;
  const { selection, tab } = route;
  const catalog = eligibleExportWorks(state);
  const available = collageFormats.filter(format => canExport(state, format.id));
  const limit = selection ? exportWorkCount(selection.format) : 0;
  const currentFormat = collageFormats.find(format => format.id === selection?.format);
  const unlocked = !!selection && canExport(state, selection.format);
  const panel = document.createElement('section');
  panel.className = 'album';
  panel.dataset.meta = 'album';
  panel.dataset.selecting = String(!!selection);
  const button = (parent: HTMLElement, label: string, action: () => void, locked = false) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.disabled = disabled || locked;
    node.onclick = action;
    parent.append(node);
    return node;
  };

  const nav = document.createElement('nav');
  nav.className = 'album-nav';
  button(nav, '‹ Назад', props.back).className = 'quiet';
  if (!selection && catalog.length) {
    const collage = button(nav, 'Коллаж', () => navigate({
      ...route, selection: { format: (available[0] ?? collageFormats[0])!.id, keys: [] },
    }));
    collage.className = 'quiet';
    collage.dataset.albumFocus = 'collage';
  }
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
  const print = (parent: HTMLElement, field: ExportField, title: string, id: string, action: () => void, work?: ExportWork) => {
    const keys = selection?.keys ?? [];
    const picked = work ? keys.indexOf(work.key) : -1;
    const replaces = !!work && keys.some(key => catalog.find(entry => entry.key === key)?.workId === work.workId);
    const node = button(parent, '', action, !!selection && (!unlocked || keys.length >= limit && !replaces));
    node.dataset.albumFocus = id;
    node.className = 'album-print';
    if (selection) node.setAttribute('aria-pressed', String(picked >= 0));
    node.append(gradientThumbnail(field));
    const name = document.createElement('span');
    name.textContent = title;
    node.append(name);
    if (picked >= 0) {
      const order = document.createElement('span');
      order.className = 'album-order';
      order.textContent = String(picked + 1);
      order.setAttribute('aria-hidden', 'true');
      node.append(order);
    }
    return node;
  };
  const select = (work: ExportWork) => {
    if (selection) navigate({ ...route, selection: { ...selection, keys: selectExportWork(selection.keys, work, catalog, limit) } });
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
        const work = catalog.find(entry => entry.key === `campaign:${id}`)!;
        print(prints, level, level.title, id, () => {
          if (selection) select(work);
          else navigate({ kind: 'card', levelId: id });
        }, work).dataset.albumLevel = id;
      }
      if (!selection && chapterCount(state, index) === chapter.levelIds.length) {
        const page = button(scroll, `Полная страница главы ${index + 1}`, () => navigate({ kind: 'export', chapterIndex: index }));
        page.className = 'quiet album-chapter-page';
        page.dataset.albumFocus = `page-${index}`;
      }
    });
    if (!completed.size) {
      empty('Здесь появятся собранные градиенты.');
      if (!selection) button(footer, 'К игре', props.play);
    }
  } else if (selection) {
    const own = catalog.filter(work => work.key.startsWith('own:'));
    if (own.length) {
      const prints = grid();
      for (const work of own) {
        const revision = own.filter(entry => entry.workId === work.workId).length > 1 ? ` · ${work.source.split(' · ')[1]}` : '';
        print(prints, work.field, work.title + revision, work.key, () => select(work), work);
      }
    } else empty('Пройдите свою работу, чтобы добавить её в коллаж.');
  } else {
    const works = Object.values(state.creative?.works ?? {});
    if (works.length) {
      const prints = grid();
      for (const work of works) {
        const key = `own:${work.workId}:${work.headNodeId}`;
        const verified = catalog.find(entry => entry.key === key);
        const node = print(prints, work.nodes[work.headNodeId]!.field, work.name, work.draftId, () => {
          navigate(verified ? { kind: 'own-card', workId: work.workId, nodeId: work.headNodeId } : { kind: 'draft', draftId: work.draftId });
        });
        node.dataset.draftId = work.draftId;
      }
    } else empty('Ваши композиции и копии будут здесь.');
    button(footer, 'Создать', props.createWork).dataset.albumFocus = 'create';
  }

  if (selection) {
    const settings = document.createElement('div');
    settings.className = 'album-selection';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = unlocked ? `${selection.keys.length} из ${limit}` : `Лента откроется после ${currentFormat?.threshold} собранных работ.`;
    if (available.length > 1) {
      const format = document.createElement('select');
      format.setAttribute('aria-label', 'Макет коллажа');
      format.dataset.albumFocus = 'format';
      for (const entry of available) format.add(new Option(entry.title, entry.id));
      format.value = selection.format;
      format.disabled = disabled;
      format.onchange = () => {
        const next = available.find(entry => entry.id === format.value);
        if (next) navigate({ ...route, selection: { format: next.id, keys: selection.keys.slice(0, exportWorkCount(next.id)) } });
      };
      settings.append(format);
    } else if (unlocked && currentFormat) {
      const name = document.createElement('span');
      name.textContent = currentFormat.title;
      settings.append(name);
    }
    settings.append(status);
    footer.append(settings);
    if (unlocked) {
      button(footer, 'Посмотреть коллаж', () => navigate({ kind: 'export', preset: selection }), selection.keys.length !== limit);
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
