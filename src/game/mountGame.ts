import Phaser from 'phaser';
import { getRenderPixelRatio } from '@danilah/mini-games-kit/core';
import { destroyRenderer } from '@danilah/mini-games-kit/phaser';
import type { GameplayActivityCoordinator } from '@danilah/mini-games-kit/platform';
import { levels, getLevel } from '../domain/levels';
import { fingerprintPayload, type Action } from '../domain/workspace';
import { hashText } from '../local-store/command';
import type { TransactionalLocalStore } from '../local-store/contracts';
import { Session } from '../app/session';
import { PuzzleScene, GAME_PRESENTABLE } from './PuzzleScene';
import { Atmosphere } from './atmosphere';
import { GameFeedback, type Haptic } from './feedback';
import { renderMeta, type MetaRoute } from './metaView';
import { chapterIndexFor, recommendedLevel, rewardTitle } from '../domain/progression';
import { authorView, findDraft, type CreativeAction } from '../domain/creative';
import { makeField } from '../domain/editor';
import { EditorView } from './editorView';
import { ExportView } from './exportView';
import { browserExportFiles, type ExportFiles } from '../app/exportFiles';
import './game.css';

type Layer = 'none' | 'help' | 'result' | 'meta' | 'restart' | 'recovery' | 'settings';
interface Activity extends Pick<GameplayActivityCoordinator, 'isBlocked' | 'onBlockedChange' | 'setGameplayDesired'> {}

export async function mountGame(parent: HTMLElement, store: TransactionalLocalStore, activity: Activity, options: { haptic?: Haptic; exportFiles?: ExportFiles } = {}): Promise<{ back(): boolean; destroy(): void }> {
  const fingerprints = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))] as const)));
  const session = new Session(store, fingerprints);
  await session.load();
  const exportFiles = options.exportFiles ?? browserExportFiles();
  const current = () => {
    const own = session.state.creative?.playing ? authorView(session.state.creative) : null;
    const level = own?.level ?? getLevel(session.state.activeLevelId);
    return { own, level, attempt: own?.attempt ?? session.state.attempts[level.id] };
  };
  parent.innerHTML = `<section id="hue-app" aria-label="Полусон">
    <header class="hud"><button id="levels" class="quiet">‹ Уровни</button><h1 id="title"></h1><button id="settings" class="quiet" aria-label="Настройки">⋯</button></header>
    <div id="board-region"></div>
    <footer><p id="guidance" aria-live="polite" hidden></p><button id="help" class="quiet">Подсказка</button></footer>
    <dialog id="game-dialog" aria-labelledby="dialog-title"><div id="victory-prism" aria-hidden="true" hidden><svg viewBox="0 0 200 200"><defs><linearGradient id="crystal-light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1bc"/><stop offset=".48" stop-color="#cab9ff"/><stop offset="1" stop-color="#7bdfeb"/></linearGradient></defs><path d="M100 12 180 100 100 188 20 100Z" fill="url(#crystal-light)" fill-opacity=".35" stroke="#fff6e4" stroke-width="1.6"/><path d="M100 12 100 100 20 100Z" fill="#fff0b9" fill-opacity=".47"/><path d="M100 12 180 100 100 100Z" fill="#c3efff" fill-opacity=".35"/><path d="M20 100 100 100 100 188Z" fill="#b692e6" fill-opacity=".56"/><path d="M100 100 180 100 100 188Z" fill="#90dbf3" fill-opacity=".25"/><path d="M100 12V188M20 100H180" fill="none" stroke="#fff5f1" stroke-width="1.2" stroke-opacity=".8"/></svg></div><h2 id="dialog-title"></h2><p id="dialog-copy"></p><p id="chapter-unlock" hidden></p><div id="dialog-actions"></div></dialog>
  </section>`;
  const root = parent.querySelector<HTMLElement>('#hue-app')!;
  const region = root.querySelector<HTMLElement>('#board-region')!;
  const dialog = root.querySelector<HTMLDialogElement>('#game-dialog')!;
  const actions = root.querySelector<HTMLElement>('#dialog-actions')!;
  const atmosphere = new Atmosphere(root), feedback = new GameFeedback(options.haptic);
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => session.state.preferences.motion && !systemMotion.matches && !activity.isBlocked();
  const byId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const listeners = new AbortController();
  let alive = true, busy = false, ready = false, paintPending = false, notice = '';
  let layer: Layer = current().attempt?.completed ? 'result' : 'none';
  if (!current().attempt) layer = 'recovery';
  let editorView: EditorView | null = null, editorDraftId: string | null = null;
  let exportView: ExportView | null = null, exportRouteKey: string | null = null;
  let lastFocus: HTMLElement | null = null;
  let metaRoute: MetaRoute = { kind: 'chapter', index: chapterIndexFor(session.state.activeLevelId) };
  let metaHistory: MetaRoute[] = [], metaReturn: Layer = 'none';
  let restartLevelId: string | null = null, restartReturn: Layer = 'none';
  const initialLevel = current().level;
  // A quarantined attempt is never silently written as a fresh start. This value is only a display placeholder.
  const initialAttempt = current().attempt ?? { schemaVersion: 1 as const, rulesVersion: 'gradient-rules-1' as const,
    contentVersion: 'gradient-prototype-0.1' as const, levelId: initialLevel.id, attemptId: 'quarantined-display', board: initialLevel.startTileAtPosition,
    moves: 0, assisted: false, assistsUsed: 0, completed: false };
  const scene = new PuzzleScene(initialLevel, initialAttempt, {
    paint, swap: (from, to) => {
      const { own, attempt } = current();
      if (attempt) void run({ kind: own ? 'author-swap' : 'swap', from, to, attemptId: attempt.attemptId });
    },
    pin: () => {
      if (current().own) { notice = 'Плитки с точкой закреплены'; render(); }
      else if (!session.state.onboarding.pinExplained) void run({ kind: 'pin' }, () => { notice = 'Плитки с точкой закреплены'; });
    },
    interaction: value => {
      const outer = root.getBoundingClientRect(), inner = region.getBoundingClientRect();
      atmosphere.interaction(value ? { x: (value.x + inner.x - outer.x) / outer.width, y: (value.y + inner.y - outer.y) / outer.height, color: value.color } : null);
    },
  });
  let resolveFrame!: () => void;
  const frame = new Promise<void>(resolve => { resolveFrame = resolve; });
  const size = () => { const rect = region.getBoundingClientRect(), dpr = getRenderPixelRatio(); return { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr }; };
  const startSize = size();
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: region, width: Math.round(startSize.width * startSize.dpr), height: Math.round(startSize.height * startSize.dpr),
    transparent: true, scene: [scene], scale: { mode: Phaser.Scale.NONE },
    callbacks: { preBoot: g => g.events.once(GAME_PRESENTABLE, resolveFrame), postBoot: g => { g.canvas.style.width = `${startSize.width}px`; g.canvas.style.height = `${startSize.height}px`; } } });

  function paint(): void {
    // The scene's create callback may run before the local game binding is assigned.
    if (!alive || !region.querySelector('canvas')) return;
    queueMicrotask(() => {
      if (!alive || !game.isBooted || paintPending || activity.isBlocked()) return;
      paintPending = true;
      game.events.once(Phaser.Core.Events.POST_RENDER, () => { paintPending = false; if (!scene.isAnimating()) game.loop.sleep(); });
      game.loop.wake();
    });
  }
  function resize(): void {
    if (!alive || !game.isBooted) return;
    const s = size(); game.canvas.style.width = `${s.width}px`; game.canvas.style.height = `${s.height}px`;
    atmosphere.resize();
    const w = Math.round(s.width * s.dpr), h = Math.round(s.height * s.dpr);
    if (game.scale.width !== w || game.scale.height !== h) { scene.cancel(); game.scale.resize(w, h); }
    paint();
  }
  function button(text: string, action: () => void, quiet = false): HTMLButtonElement {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.className = quiet ? 'quiet' : ''; node.disabled = busy || activity.isBlocked();
    node.onclick = action; actions.append(node);
    return node;
  }
  function showMeta(route: MetaRoute): void {
    scene.cancel();
    if (layer !== 'meta') { metaReturn = layer; metaHistory = []; }
    else {
      const samePicker = route.kind === metaRoute.kind && (route.kind === 'album' || route.kind === 'chapter');
      if (!samePicker && JSON.stringify(route) !== JSON.stringify(metaRoute)) metaHistory.push(metaRoute);
    }
    metaRoute = route; layer = 'meta'; render();
  }
  function startLevel(id: string): void {
    if (current().own) { void run({ kind: 'author-exit' }, () => queueMicrotask(() => startLevel(id))); return; }
    const after = () => { metaHistory = []; notice = ''; layer = session.state.attempts[id]?.completed ? 'result' : 'none'; };
    if (session.state.activeLevelId === id && session.state.attempts[id]) { after(); render(); }
    else void run({ kind: 'open', levelId: id, attemptId: crypto.randomUUID() }, after);
  }
  function askRestart(id: string): void { restartLevelId = id; restartReturn = layer; scene.cancel(); layer = 'restart'; render(); }
  function cancelRestart(): void { layer = restartReturn; render(); }
  function leaveAuthor(): void {
    const own = current().own; if (!own) return;
    void run({ kind: 'author-exit' }, () => { metaHistory = [{ kind: 'album', tab: 'own' }]; metaRoute = { kind: 'draft', draftId: own.work.draftId }; layer = 'meta'; });
  }
  function renderDialog(): void {
    const chapterUnlock = byId('chapter-unlock');
    chapterUnlock.hidden = true;
    delete actions.dataset.meta;
    dialog.dataset.layer = layer;
    if (editorView && !(layer === 'meta' && metaRoute.kind === 'draft')) { editorView.destroy(); editorView = null; editorDraftId = null; }
    const exportKey = layer === 'meta' && metaRoute.kind === 'export' ? JSON.stringify(metaRoute) : null;
    if (exportKey !== exportRouteKey) { exportView?.destroy(); exportView = null; exportRouteKey = exportKey; }
    dialog.dataset.export = String(!!exportKey);
    dialog.dataset.picker = String(layer === 'meta' && metaRoute.kind === 'chapter');
    const open = layer !== 'none' && layer !== 'help';
    if (!open) { if (dialog.open) { dialog.close(); lastFocus?.focus(); } return; }
    const draftId = layer === 'meta' && metaRoute.kind === 'draft' ? metaRoute.draftId : null;
    if (editorDraftId !== draftId) { editorView?.destroy(); editorView = null; editorDraftId = draftId; }
    dialog.dataset.editor = String(!!draftId);
    byId('dialog-copy').textContent = ''; if (!editorView && !exportView) actions.replaceChildren();
    dialog.dataset.layer = layer; byId('victory-prism').hidden = layer !== 'result';
    const { level, attempt, own } = current();
    if (layer === 'result') {
      byId('dialog-title').textContent = own ? 'Проверка пройдена' : 'Собрано';
      const count = attempt?.moves ?? 0, form = new Intl.PluralRules('ru').select(count);
      const word = form === 'one' ? 'ход' : form === 'few' ? 'хода' : 'ходов';
      byId('dialog-copy').textContent = `${count} ${word}`;
      if (own) {
        button('Вернуться в редактор', leaveAuthor);
      } else {
        const next = recommendedLevel(session.state, chapterIndexFor(level.id)) ?? recommendedLevel(session.state);
        const receipt = session.state.lastCompletion;
        const unlocked = receipt && receipt.attemptId === attempt?.attemptId
          ? receipt.newRights.find(id => id.startsWith('chapter-open:'))
          : undefined;
        if (unlocked) {
          chapterUnlock.textContent = rewardTitle(unlocked);
          chapterUnlock.hidden = false;
        }
        if (next) button('Дальше', () => startLevel(next));
        else byId('dialog-copy').textContent += '\nКампания собрана';
        button('В альбом', () => showMeta({ kind: 'album', tab: 'campaign' }), !!next);
      }
    } else if (layer === 'restart') {
      byId('dialog-title').textContent = 'Начать заново?';
      byId('dialog-copy').textContent = `«${own ? level.title : getLevel(restartLevelId ?? level.id).title}» начнётся с исходного поля.`;
      button('Начать заново', () => void run(own ? { kind: 'author-start', workId: own.work.workId, nodeId: own.node.nodeId, attemptId: crypto.randomUUID(), restart: true } : { kind: 'restart', levelId: restartLevelId ?? level.id, attemptId: crypto.randomUUID() }, () => { metaHistory = []; layer = 'none'; }));
      button('Отмена', cancelRestart, true);
    } else if (layer === 'settings') {
      byId('dialog-title').textContent = 'Настройки';
      const close = button('×', () => { layer = 'none'; render(); }, true);
      close.className = 'quiet settings-close';
      close.setAttribute('aria-label', 'Вернуться к игре');
      close.autofocus = true;
      button('Заново', () => askRestart(session.state.activeLevelId), true).id = 'restart';
      for (const [key, label] of [['sound', 'Звуки'], ['haptics', 'Вибрация'], ['motion', 'Движение фона']] as const) {
        const row = document.createElement('label'); row.className = 'setting';
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = session.state.preferences[key]; input.disabled = busy || activity.isBlocked();
        input.setAttribute('aria-label', label);
        input.onchange = () => void run({ kind: 'preferences', key, value: input.checked });
        const title = document.createElement('span'); title.textContent = label; row.append(title, input); actions.append(row);
      }
    } else if (layer === 'meta') {
      const work = draftId && session.state.creative ? findDraft(session.state.creative, draftId) : null;
      if (metaRoute.kind === 'export') {
        byId('dialog-title').textContent = 'Экспорт изображения';
        if (!exportView) exportView = new ExportView(actions, { state: session.state, disabled: busy || activity.isBlocked(), route: metaRoute, files: exportFiles,
          back: () => { if (metaHistory.length) metaRoute = metaHistory.pop()!; else layer = metaReturn; render(); } });
        exportView.update(session.state,busy || activity.isBlocked());
      } else if (work) {
        byId('dialog-title').textContent = work.name;
        if (!editorView) editorView = new EditorView(actions, { work, disabled: busy || activity.isBlocked(), pending: !!session.pending, commit: action => run(action), recover: recoverEditor,
          exportWork: (workId,nodeId) => showMeta({kind:'export',initialKey:`own:${workId}:${nodeId}`}),
          play: (workId, nodeId) => void run({ kind: 'author-start', workId, nodeId, attemptId: crypto.randomUUID() }, () => { metaHistory = []; layer = current().attempt?.completed ? 'result' : 'none'; }),
          back: () => { metaHistory = []; metaRoute = { kind: 'album', tab: 'own' }; layer = 'meta'; render(); } });
        editorView.update(work, busy || activity.isBlocked(), !!session.pending);
      } else {
      renderMeta({ route: metaRoute, state: session.state, disabled: busy || activity.isBlocked() || !!session.pending,
        title: byId('dialog-title'), copy: byId('dialog-copy'), actions, navigate: showMeta, back: () => { back(); },
        play: startLevel, replay: askRestart,
        createWork: () => {
          const draftId = crypto.randomUUID();
          void run({ kind: 'editor-create', draftId, workId: crypto.randomUUID(), nodeId: crypto.randomUUID(), name: 'Моя композиция', field: makeField(), seed: 0 }, () => {
            metaHistory = [{ kind: 'album', tab: 'own' }]; metaRoute = { kind: 'draft', draftId }; layer = 'meta';
          });
        },
        saveCopy: (levelId, name) => {
          const draftId = crypto.randomUUID();
          void run({ kind: 'copy', levelId, name, draftId, workId: crypto.randomUUID(), nodeId: crypto.randomUUID() }, () => {
            metaHistory = [{ kind: 'album', tab: 'own' }]; metaRoute = { kind: 'draft', draftId }; layer = 'meta';
          });
        } });
      }
    } else {
      byId('dialog-title').textContent = 'Сохранение требует проверки';
      if (!attempt && !session.pending) {
        byId('dialog-copy').textContent = 'Эта попытка повреждена. Её данные будут сохранены отдельно; пройденные уровни и рекорды останутся.';
        button('Начать эту попытку заново', () => void run({ kind: 'restart', levelId: level.id, attemptId: crypto.randomUUID() }, () => { layer = 'none'; }));
      } else {
        byId('dialog-copy').textContent = notice || 'Не удалось подтвердить запись.';
        button('Повторить проверку', () => void recover());
      }
    }
    if (!dialog.open) { lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
  }
  function render(): void {
    if (!alive) return;
    const { level, attempt, own } = current();
    if (!attempt && !session.pending) layer = 'recovery';
    root.dataset.level = level.id; root.dataset.moves = String(attempt?.moves ?? 0); root.dataset.busy = String(busy); root.dataset.layer = layer;
    root.dataset.mode = own ? 'author' : 'campaign';
    root.dataset.motion = String(motionAllowed());
    root.style.setProperty('--color-a', level.solvedTileColors[0]!); root.style.setProperty('--color-b', level.solvedTileColors.at(-1)!);
    byId('levels').textContent = own ? '‹ Редактор' : '‹ Уровни';
    byId('title').textContent = own ? level.title : `Уровень ${level.ordinal}`;
    const guidance = byId('guidance');
    guidance.textContent = layer === 'help' ? 'Готовое поле' : notice || (!own && !session.state.onboarding.firstSwapDone ? 'Поменяй две плитки местами' : '');
    guidance.hidden = !guidance.textContent;
    byId<HTMLButtonElement>('help').textContent = layer === 'help' ? 'К игре' : attempt?.completed ? 'Результат' : 'Подсказка';
    for (const node of root.querySelectorAll<HTMLButtonElement>('.hud button,footer button')) node.disabled = busy || activity.isBlocked() || !!session.pending;
    if (attempt) scene.setView(level, attempt, layer === 'help', ready && !busy && !activity.isBlocked() && layer === 'none' && !session.pending);
    else scene.setView(level, initialAttempt, false, false);
    atmosphere.setModel(level, layer === 'help' ? level.startTileAtPosition.map((_, i) => i) : (attempt?.board ?? initialAttempt.board));
    atmosphere.configure(ready && !activity.isBlocked() && ['none', 'help', 'result'].includes(layer), motionAllowed());
    feedback.configure(session.state.preferences, !ready || activity.isBlocked());
    activity.setGameplayDesired(ready && !busy && layer === 'none' && !attempt?.completed && !activity.isBlocked());
    renderDialog(); paint();
  }
  async function run(action: Action | CreativeAction, after?: () => void): Promise<boolean> {
    if (busy || session.pending || activity.isBlocked()) return false;
    const previous = current().attempt;
    let swapAccepted = false, succeeded = false;
    busy = true; render();
    try {
      const changed = await session.act(action);
      if (!alive) return false;
      succeeded = true;
      if (changed) {
        notice = '';
        after?.();
        if ((action.kind === 'swap' || action.kind === 'author-swap') && current().attempt?.completed) layer = 'result';
        swapAccepted = action.kind === 'swap' || action.kind === 'author-swap';
      }
    } catch {
      notice = session.pending ? 'Не удалось подтвердить сохранение.' : 'Поле изменилось в другом окне. Повтори действие.';
      if (session.pending && !editorView) layer = 'recovery';
    } finally {
      busy = false; render(); resize();
      const next = current().attempt;
      if (swapAccepted && (action.kind === 'swap' || action.kind === 'author-swap') && previous && next && previous.attemptId === next.attemptId && !activity.isBlocked()) {
        scene.presentSwap(previous, next, action.from, action.to, motionAllowed());
        feedback.accepted(next.completed ? 'win' : 'swap');
      }
    }
    return succeeded;
  }
  async function recover(): Promise<void> {
    if (busy) return;
    busy = true; render();
    try {
      if (session.pending) await session.resolvePending(); else await session.load();
      notice = ''; layer = current().attempt?.completed ? 'result' : 'none';
    } catch { notice = 'Не удалось проверить сохранение. Попробуй ещё раз.'; layer = 'recovery'; }
    finally { busy = false; render(); }
  }
  async function recoverEditor(): Promise<boolean> {
    if (busy || activity.isBlocked()) return false;
    busy = true; render(); let success = false;
    try { if (session.pending) await session.resolvePending(); else await session.load(); success = true; }
    catch { notice = 'Не удалось проверить сохранение. Попробуй ещё раз.'; }
    finally { busy = false; render(); }
    return success;
  }
  const back = (): boolean => {
    if (busy || layer === 'recovery') return true;
    scene.cancel();
    if (exportView && layer === 'meta') { exportView.leave(); return true; }
    if (editorView && layer === 'meta') { void editorView.leave(); return true; }
    if (layer === 'meta') {
      if (metaHistory.length) metaRoute = metaHistory.pop()!;
      else layer = metaReturn;
      render(); return true;
    }
    if (layer === 'restart') { cancelRestart(); return true; }
    if (layer !== 'none') { layer = 'none'; render(); return true; }
    if (current().own) { leaveAuthor(); return true; }
    return false;
  };
  byId('help').addEventListener('click', () => {
    if (layer === 'help') { layer = 'none'; render(); return; }
    const { attempt, own } = current();
    if (attempt?.completed) { layer = 'result'; render(); }
    else if (attempt) void run({ kind: own ? 'author-help' : 'help', attemptId: attempt.attemptId }, () => { if (!activity.isBlocked()) layer = 'help'; });
  }, { signal: listeners.signal });
  byId('levels').addEventListener('click', () => {
    if (current().own) leaveAuthor();
    else showMeta({ kind: 'chapter', index: chapterIndexFor(session.state.activeLevelId) });
  }, { signal: listeners.signal });
  byId('settings').addEventListener('click', () => { scene.cancel(); layer = 'settings'; render(); }, { signal: listeners.signal });
  systemMotion.addEventListener('change', () => { scene.cancel(); render(); }, { signal: listeners.signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!back()) { layer = 'none'; render(); } }, { signal: listeners.signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && layer === 'help' && !busy) { event.preventDefault(); layer = 'none'; render(); }
  }, { signal: listeners.signal });
  const observer = new ResizeObserver(resize); observer.observe(region);
  window.addEventListener('resize', resize, { signal: listeners.signal });
  window.addEventListener('focus', () => {
    if (busy || session.pending || !ready) return;
    busy = true;
    void session.load().then(() => { if (!current().attempt) layer = 'recovery'; }).catch(() => { layer = 'recovery'; })
      .finally(() => { busy = false; render(); });
  }, { signal: listeners.signal });
  const unblock = activity.onBlockedChange(blocked => {
    if (blocked) { scene.cancel(); if (layer === 'help') layer = 'none'; game.sound.mute = true; if (game.isBooted) game.loop.sleep(); }
    else { game.sound.mute = false; resize(); }
    render();
  });
  await frame; ready = true; render(); resize();
  return { back, destroy() { alive = false; editorView?.destroy(); exportView?.destroy(); exportFiles.destroy?.(); listeners.abort(); observer.disconnect(); unblock(); atmosphere.destroy(); feedback.destroy(); activity.setGameplayDesired(false); store.close(); destroyRenderer(game); } };
}
