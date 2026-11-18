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
import './game.css';

type Layer = 'none' | 'help' | 'result' | 'levels' | 'restart' | 'rules' | 'recovery';
interface Activity extends Pick<GameplayActivityCoordinator, 'isBlocked' | 'onBlockedChange' | 'setGameplayDesired'> {}

export async function mountGame(parent: HTMLElement, store: TransactionalLocalStore, activity: Activity): Promise<{ back(): boolean; destroy(): void }> {
  const fingerprints = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))] as const)));
  const session = new Session(store, fingerprints);
  await session.load();
  parent.innerHTML = `<section id="hue-app" aria-label="Полусон">
    <header class="hud"><button id="levels" class="quiet" aria-label="Открыть уровни">Уровни</button><div class="level-label"><span id="ordinal"></span><h1 id="title"></h1></div><span id="moves" aria-label="Ходы"></span></header>
    <div id="board-region"></div>
    <footer><p id="guidance" aria-live="polite"></p><div class="toolbar"><button id="help">Помощь</button><button id="restart" class="quiet">Заново</button><button id="rules" class="quiet" aria-label="Правила">?</button></div><p id="save-status" role="status"></p></footer>
    <dialog id="game-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><p id="dialog-copy"></p><div id="dialog-actions"></div></dialog>
  </section>`;
  const root = parent.querySelector<HTMLElement>('#hue-app')!;
  const region = root.querySelector<HTMLElement>('#board-region')!;
  const dialog = root.querySelector<HTMLDialogElement>('#game-dialog')!;
  const actions = root.querySelector<HTMLElement>('#dialog-actions')!;
  const byId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const listeners = new AbortController();
  let alive = true, busy = false, ready = false, paintPending = false, status = 'Сохранено на устройстве';
  let layer: Layer = session.state.attempts[session.state.activeLevelId]?.completed ? 'result' : 'none';
  if (!session.state.attempts[session.state.activeLevelId]) layer = 'recovery';
  let lastFocus: HTMLElement | null = null, menuExit = false;
  const initialLevel = getLevel(session.state.activeLevelId);
  // A quarantined attempt is never silently written as a fresh start. This value is only a display placeholder.
  const initialAttempt = session.state.attempts[initialLevel.id] ?? { schemaVersion: 1 as const, rulesVersion: 'gradient-rules-1' as const,
    contentVersion: 'gradient-prototype-0.1' as const, levelId: initialLevel.id, attemptId: 'quarantined-display', board: initialLevel.startTileAtPosition,
    moves: 0, assisted: false, assistsUsed: 0, completed: false };
  const scene = new PuzzleScene(initialLevel, initialAttempt, {
    paint, swap: (from, to) => {
      const attempt = session.state.attempts[session.state.activeLevelId];
      if (attempt) void run({ kind: 'swap', from, to, attemptId: attempt.attemptId });
    },
    pin: () => {
      if (!session.state.onboarding.pinExplained) void run({ kind: 'pin' }, () => { status = 'Плитки с точкой закреплены. Меняй местами остальные.'; });
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
      game.events.once(Phaser.Core.Events.POST_RENDER, () => { paintPending = false; game.loop.sleep(); });
      game.loop.wake();
    });
  }
  function resize(): void {
    if (!alive || !game.isBooted) return;
    const s = size(); game.canvas.style.width = `${s.width}px`; game.canvas.style.height = `${s.height}px`;
    const w = Math.round(s.width * s.dpr), h = Math.round(s.height * s.dpr);
    if (game.scale.width !== w || game.scale.height !== h) { scene.cancel(); game.scale.resize(w, h); }
    paint();
  }
  function button(text: string, action: () => void, quiet = false): void {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.className = quiet ? 'quiet' : ''; node.disabled = busy || activity.isBlocked();
    node.onclick = action; actions.append(node);
  }
  function renderDialog(): void {
    const open = layer !== 'none' && layer !== 'help';
    if (!open) { if (dialog.open) { dialog.close(); lastFocus?.focus(); } return; }
    byId('dialog-copy').textContent = ''; actions.replaceChildren();
    const level = getLevel(session.state.activeLevelId), attempt = session.state.attempts[level.id];
    if (layer === 'result') {
      byId('dialog-title').textContent = 'Градиент собран';
      const best = session.state.bests[level.id];
      byId('dialog-copy').textContent = `${attempt?.moves ?? 0} ходов · минимум ${level.minimumSwaps}${attempt?.assisted ? ' · с помощью' : ' · без помощи'}. ${best?.clean !== null && best?.clean !== undefined ? `Лучший без помощи: ${best.clean}.` : ''}`;
      const next = levels[level.ordinal];
      if (next) button('Дальше', () => void run({ kind: 'open', levelId: next.id, attemptId: crypto.randomUUID() }, () => { layer = 'none'; }));
      else byId('dialog-copy').textContent += ' Первые 15 готовы. Продолжение кампании — на следующем этапе разработки.';
      button('Посмотреть поле', () => { layer = 'none'; render(); }, true);
      button('Повторить', () => { layer = 'restart'; render(); }, true);
      button('Уровни', () => { layer = 'levels'; render(); }, true);
    } else if (layer === 'restart') {
      byId('dialog-title').textContent = 'Начать заново?';
      byId('dialog-copy').textContent = 'Текущая попытка начнётся с исходного поля. Рекорды и пройденные уровни сохранятся.';
      button('Начать заново', () => void run({ kind: 'restart', levelId: level.id, attemptId: crypto.randomUUID() }, () => { layer = 'none'; }));
      button('Продолжить попытку', () => { layer = attempt?.completed ? 'result' : 'none'; render(); }, true);
    } else if (layer === 'rules') {
      byId('dialog-title').textContent = 'Собери плавный градиент';
      byId('dialog-copy').textContent = 'Нажми на две плитки или перетащи одну на другую. Плитки с точкой закреплены. Помощь покажет готовое поле и отметит попытку «с помощью». Ограничения ходов и таймера нет.';
      button('Понятно', () => { layer = 'none'; render(); });
    } else if (layer === 'levels') {
      byId('dialog-title').textContent = 'Первые 15';
      for (const item of levels) {
        const unlocked = item.ordinal === 1 || session.state.completed.includes(levels[item.ordinal - 2]!.id);
        const node = document.createElement('button'); node.type = 'button';
        node.textContent = `${item.ordinal}. ${item.title}${session.state.completed.includes(item.id) ? ' ✓' : ''}`;
        node.disabled = !unlocked || busy || activity.isBlocked();
        node.onclick = () => void run({ kind: 'open', levelId: item.id, attemptId: crypto.randomUUID() }, () => { layer = session.state.attempts[item.id]?.completed ? 'result' : 'none'; });
        actions.append(node);
      }
      button('Вернуться', () => { layer = attempt?.completed ? 'result' : 'none'; render(); }, true);
    } else {
      byId('dialog-title').textContent = 'Сохранение требует проверки';
      if (!attempt && !session.pending) {
        byId('dialog-copy').textContent = 'Эта попытка повреждена. Её данные будут сохранены отдельно; пройденные уровни и рекорды останутся.';
        button('Начать эту попытку заново', () => void run({ kind: 'restart', levelId: level.id, attemptId: crypto.randomUUID() }, () => { layer = 'none'; }));
      } else {
        byId('dialog-copy').textContent = 'Не удалось подтвердить запись. Последнее подтверждённое состояние сохранено. Повторная проверка использует ту же операцию.';
        button('Повторить проверку', () => void recover());
      }
    }
    if (!dialog.open) { lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
  }
  function render(): void {
    if (!alive) return;
    const level = getLevel(session.state.activeLevelId), attempt = session.state.attempts[level.id];
    if (!attempt && !session.pending) layer = 'recovery';
    root.dataset.level = level.id; root.dataset.moves = String(attempt?.moves ?? 0); root.dataset.busy = String(busy); root.dataset.layer = layer;
    root.style.setProperty('--color-a', level.solvedTileColors[0]!); root.style.setProperty('--color-b', level.solvedTileColors.at(-1)!);
    byId('ordinal').textContent = `Полусон · ${level.ordinal} / 15`; byId('title').textContent = level.title;
    byId('moves').textContent = `${attempt?.moves ?? 0} ход.`;
    byId('guidance').textContent = layer === 'help' ? 'Готовое поле. Закрой помощь, чтобы продолжить.' : !session.state.onboarding.firstSwapDone ? 'Поменяй две плитки местами' : 'Собери плавный переход цвета';
    byId('save-status').textContent = busy ? 'Сохраняем…' : status;
    byId<HTMLButtonElement>('help').textContent = layer === 'help' ? 'Закрыть помощь' : attempt?.completed ? 'Результат' : 'Помощь';
    for (const node of root.querySelectorAll<HTMLButtonElement>('.hud button,.toolbar button')) node.disabled = busy || activity.isBlocked() || !!session.pending;
    if (attempt) scene.setView(level, attempt, layer === 'help', ready && !busy && !activity.isBlocked() && layer === 'none' && !session.pending);
    else scene.setView(level, initialAttempt, false, false);
    activity.setGameplayDesired(ready && !busy && layer === 'none' && !attempt?.completed && !activity.isBlocked());
    renderDialog(); paint();
  }
  async function run(action: Action, after?: () => void): Promise<void> {
    if (busy || session.pending || activity.isBlocked()) return;
    busy = true; render();
    try {
      const changed = await session.act(action);
      if (!alive) return;
      status = changed ? 'Сохранено на устройстве' : status;
      if (changed) {
        after?.();
        if (action.kind === 'swap' && session.state.attempts[session.state.activeLevelId]?.completed) layer = 'result';
      }
    } catch {
      status = session.pending ? 'Проверяем результат сохранения' : 'Поле изменилось в другом окне. Повтори действие.';
      if (session.pending) layer = 'recovery';
    } finally { busy = false; render(); resize(); }
  }
  async function recover(): Promise<void> {
    if (busy) return;
    busy = true; render();
    try {
      if (session.pending) await session.resolvePending(); else await session.load();
      status = 'Сохранено на устройстве'; layer = session.state.attempts[session.state.activeLevelId]?.completed ? 'result' : 'none';
    } catch { status = 'Проверка пока недоступна. Можно попробовать ещё раз.'; layer = 'recovery'; }
    finally { busy = false; render(); }
  }
  const back = (): boolean => {
    if (busy || layer === 'recovery') return true;
    scene.cancel();
    if (layer === 'levels' && menuExit) return false;
    if (layer !== 'none') { layer = 'none'; render(); return true; }
    layer = 'levels'; menuExit = true; render(); return true;
  };
  byId('help').addEventListener('click', () => {
    if (layer === 'help') { layer = 'none'; render(); return; }
    const attempt = session.state.attempts[session.state.activeLevelId];
    if (attempt?.completed) { layer = 'result'; render(); }
    else if (attempt) void run({ kind: 'help', attemptId: attempt.attemptId }, () => { if (!activity.isBlocked()) layer = 'help'; });
  }, { signal: listeners.signal });
  byId('restart').addEventListener('click', () => { scene.cancel(); layer = 'restart'; render(); }, { signal: listeners.signal });
  byId('rules').addEventListener('click', () => { scene.cancel(); layer = 'rules'; render(); }, { signal: listeners.signal });
  byId('levels').addEventListener('click', () => { scene.cancel(); menuExit = false; layer = 'levels'; render(); }, { signal: listeners.signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!back()) { layer = 'none'; render(); } }, { signal: listeners.signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && layer === 'help' && !busy) { event.preventDefault(); layer = 'none'; render(); }
  }, { signal: listeners.signal });
  const observer = new ResizeObserver(resize); observer.observe(region);
  window.addEventListener('resize', resize, { signal: listeners.signal });
  window.addEventListener('focus', () => {
    if (busy || session.pending || !ready) return;
    busy = true;
    void session.load().then(() => { if (!session.state.attempts[session.state.activeLevelId]) layer = 'recovery'; }).catch(() => { layer = 'recovery'; })
      .finally(() => { busy = false; render(); });
  }, { signal: listeners.signal });
  const unblock = activity.onBlockedChange(blocked => {
    if (blocked) { scene.cancel(); if (layer === 'help') layer = 'none'; game.sound.mute = true; if (game.isBooted) game.loop.sleep(); }
    else { game.sound.mute = false; resize(); }
    render();
  });
  await frame; ready = true; render(); resize();
  return { back, destroy() { alive = false; listeners.abort(); observer.disconnect(); unblock(); activity.setGameplayDesired(false); store.close(); destroyRenderer(game); } };
}
