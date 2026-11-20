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
import { Atmosphere, type ColourPointer } from './atmosphere';
import { boardGeometry, cellAt } from './geometry';
import { GameFeedback, type Haptic } from './feedback';
import { levelPreview, renderMeta, type MetaRoute } from './metaView';
import { chapterIndexFor, recommendedLevel, rewardTitle } from '../domain/progression';
import { authorBests, authorView, findDraft, hasAuthorProof, type CreativeAction } from '../domain/creative';
import { makeField, playableField } from '../domain/editor';
import { AUTO_HELP_COST, autoHelpSwap, pulsePosition, type Assistance } from '../domain/puzzle';
import { activeChallenge } from '../domain/challenges';
import { publishedBenchmark } from '../domain/playerProgress';
import { EditorView } from './editorView';
import { renderAlbum, type AlbumPosition, type AlbumRoute } from './albumView';
import { WorkCardView } from './workCardView';
import { colourPrism, flashPrismEdge, victoryPrism } from './victoryPrism';
import { browserExportFiles, type ExportFiles } from '../app/exportFiles';
import './game.css';

type Layer = 'none' | 'secret' | 'help' | 'help-menu' | 'pin-guide' | 'result' | 'meta' | 'restart' | 'recovery' | 'settings';
interface Activity extends Pick<GameplayActivityCoordinator, 'isBlocked' | 'onBlockedChange' | 'setGameplayDesired'> {}

export async function mountGame(parent: HTMLElement, store: TransactionalLocalStore, activity: Activity, options: { haptic?: Haptic; exportFiles?: ExportFiles } = {}): Promise<{ back(): boolean; destroy(): void }> {
  const fingerprints = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))] as const)));
  const session = new Session(store, fingerprints);
  await session.load();
  const exportFiles = options.exportFiles ?? browserExportFiles();
  const current = () => {
    const challenge = activeChallenge(session.state.challengeProgress);
    const own = !challenge && session.state.creative?.playing ? authorView(session.state.creative) : null;
    const level = challenge?.level ?? own?.level ?? getLevel(session.state.activeLevelId);
    return { own, challenge, level, attempt: challenge?.attempt ?? own?.attempt ?? session.state.attempts[level.id] };
  };
  const gameLayer = (): Layer => {
    const { attempt, challenge } = current();
    if (!attempt) return 'recovery';
    return attempt.completed || challenge?.status === 'lost' ? 'result' : 'none';
  };
  parent.innerHTML = `<section id="hue-app" aria-label="Полусон">
    <header class="hud"><button id="levels" class="quiet">‹ Уровни</button><h1 id="title"></h1><button id="settings" class="quiet" aria-label="Пауза">⋯</button></header>
    <div id="board-region"></div>
    <footer><p id="guidance" aria-live="polite" hidden></p><button id="help" class="quiet">Подсказка</button></footer>
    <dialog id="game-dialog" aria-labelledby="dialog-title">${victoryPrism}<h2 id="dialog-title"></h2><p id="dialog-copy"></p><p id="chapter-unlock" hidden></p><div id="dialog-actions"></div></dialog>
  </section>`;
  const root = parent.querySelector<HTMLElement>('#hue-app')!;
  const region = root.querySelector<HTMLElement>('#board-region')!;
  const marker = document.createElement('span');
  marker.className = 'tile-mark';
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  region.append(marker);
  const dialog = root.querySelector<HTMLDialogElement>('#game-dialog')!;
  const actions = root.querySelector<HTMLElement>('#dialog-actions')!;
  const atmosphere = new Atmosphere(root), feedback = new GameFeedback(options.haptic);
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => session.state.preferences.motion && !systemMotion.matches && !activity.isBlocked();
  const byId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const listeners = new AbortController();
  let alive = true, busy = false, ready = false, paintPending = false, notice = '';
  let markPosition: number | null = null, markTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingHelp: (() => void) | null = null;
  let foregroundEpoch = 0;
  let layer = gameLayer();
  let editorView: EditorView | null = null, editorDraftId: string | null = null;
  let workCard: WorkCardView | null = null, workCardId: string | null = null;
  let shownAlbum: AlbumRoute | null = null;
  const albumPositions = new Map<AlbumRoute['tab'], AlbumPosition>();
  const prism = byId('victory-prism');
  let prismGlint: Animation | null = null;
  let lastFocus: HTMLElement | null = null;
  let metaRoute: MetaRoute = { kind: 'chapter', levelId: session.state.activeLevelId };
  let metaHistory: MetaRoute[] = [], metaReturn: Layer = 'none';
  let restartLevelId: string | null = null, restartReturn: Layer = 'none';
  const initialLevel = current().level;
  // A quarantined attempt is never silently written as a fresh start. This value is only a display placeholder.
  const initialAttempt = current().attempt ?? { schemaVersion: 1 as const, rulesVersion: 'gradient-rules-1' as const,
    contentVersion: 'gradient-prototype-0.1' as const, levelId: initialLevel.id, attemptId: 'quarantined-display', board: initialLevel.startTileAtPosition,
    moves: 0, assisted: false, assistsUsed: 0, completed: false };
  function atmospherePoint(value: ColourPointer): ColourPointer {
    const outer = root.getBoundingClientRect(), inner = region.getBoundingClientRect();
    return { ...value, x: (value.x + inner.x - outer.x) / outer.width, y: (value.y + inner.y - outer.y) / outer.height };
  }
  const scene = new PuzzleScene(initialLevel, initialAttempt, {
    paint, swap: (from, to) => {
      const { own, attempt, challenge } = current();
      if (attempt) void run({ kind: challenge ? 'challenge-swap' : own ? 'author-swap' : 'swap', from, to, attemptId: attempt.attemptId });
    },
    pin: position => {
      showMark(position, 'pin');
      const { own, level, challenge } = current();
      if (challenge) return;
      const onboarding = session.state.onboarding;
      if (own) { notice = 'Плитки с точкой закреплены'; render(); }
      else if (!onboarding.pinExplained || level.ordinal <= 10 && (onboarding.earlyPinTaps ?? 1) < 3) {
        void run({ kind: 'pin' }, () => {
          if (!onboarding.pinExplained) notice = 'Плитки с точкой закреплены';
          if (session.state.onboarding.earlyPinTaps === 3 && !activity.isBlocked()) layer = 'pin-guide';
        });
      }
    },
    interaction: value => atmosphere.interaction(value ? atmospherePoint(value) : null),
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
    positionMark(s.width, s.height);
    paint();
  }
  function positionMark(width: number, height: number): void {
    if (markPosition === null) return;
    const { level } = current();
    const cell = cellAt(boardGeometry(width, height, level.width, level.height), markPosition);
    Object.assign(marker.style, {
      left: `${cell.x}px`, top: `${cell.y}px`, width: `${cell.width}px`, height: `${cell.height}px`,
    });
  }
  function clearMark(): void {
    clearTimeout(markTimer);
    marker.hidden = true;
    markPosition = null;
  }
  function showMark(position: number, kind: 'pulse' | 'pin'): void {
    clearMark();
    markPosition = position;
    const { width, height } = region.getBoundingClientRect();
    positionMark(width, height);
    marker.dataset.position = String(position);
    marker.dataset.kind = kind;
    marker.hidden = false;
    markTimer = setTimeout(clearMark, kind === 'pulse' ? 1400 : 650);
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
      const samePicker = route.kind === 'chapter' && metaRoute.kind === 'chapter'
        || route.kind === 'album' && metaRoute.kind === 'album'
        || route.kind === 'challenges' && metaRoute.kind === 'challenges';
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
  function repeatLevel(id: string): void {
    void run({ kind: 'restart', levelId: id, attemptId: crypto.randomUUID() }, () => {
      metaHistory = []; layer = 'none';
    });
  }
  function playChallenge(id: string, restart: boolean): void {
    const firstOpen = !session.state.challengeProgress?.attempts[id];
    void run({ kind: restart ? 'challenge-restart' : 'challenge-open', id, attemptId: crypto.randomUUID() }, () => {
      metaHistory = [];
      layer = firstOpen && current().challenge?.afterFinaleId ? 'secret' : gameLayer();
    });
  }
  function leaveChallenge(): void {
    const chapterTests = current().challenge?.chapterIndex !== undefined;
    void run({ kind: 'challenge-leave' }, () => {
      metaReturn = gameLayer();
      metaHistory = [{ kind: 'chapter', levelId: session.state.activeLevelId }];
      metaRoute = { kind: 'challenges', chapterTests };
      layer = 'meta';
    });
  }
  function askRestart(id: string): void { restartLevelId = id; restartReturn = layer; scene.cancel(); layer = 'restart'; render(); }
  function cancelRestart(): void { layer = restartReturn; render(); }
  function leaveAuthor(): void {
    const own = current().own; if (!own) return;
    void run({ kind: 'author-exit' }, () => {
      metaHistory = [{ kind: 'album', tab: 'own' }];
      metaRoute = { kind: 'draft', draftId: own.work.draftId, nodeId: own.node.nodeId };
      layer = 'meta';
    });
  }
  function selectedWork(): string | null {
    return layer === 'meta' && metaRoute.kind === 'card' && session.state.completed.includes(metaRoute.levelId) ? metaRoute.levelId : null;
  }
  function selectedAuthorWork() {
    if (layer !== 'meta' || metaRoute.kind !== 'own-card') return null;
    const work = session.state.creative?.works[metaRoute.workId];
    return work && hasAuthorProof(work, metaRoute.nodeId) ? { work, nodeId: metaRoute.nodeId } : null;
  }
  function popMeta(): void {
    const previous = metaHistory.pop();
    if (previous) metaRoute = previous;
    else layer = metaReturn;
    render();
  }
  function createWork(): void {
    const draftId = crypto.randomUUID();
    void run({ kind: 'editor-create', draftId, workId: crypto.randomUUID(), nodeId: crypto.randomUUID(), name: 'Моя композиция', field: makeField(), seed: 0 },
      () => showMeta({ kind: 'draft', draftId }));
  }
  function rememberAlbum(): void {
    if (!shownAlbum) return;
    const scroller = actions.querySelector('.album-scroll');
    if (!scroller) return;
    const key = shownAlbum.tab;
    const active = document.activeElement instanceof HTMLElement && actions.contains(document.activeElement)
      ? document.activeElement.dataset.albumFocus : undefined;
    const focus = active ?? albumPositions.get(key)?.focus;
    albumPositions.set(key, { scroll: scroller.scrollTop, ...(focus ? { focus } : {}) });
  }
  function renderDialog(): void {
    rememberAlbum();
    shownAlbum = layer === 'meta' && metaRoute.kind === 'album' ? metaRoute : null;
    dialog.dataset.album = String(!!shownAlbum);
    const chapterUnlock = byId('chapter-unlock');
    chapterUnlock.hidden = true;
    delete actions.dataset.meta;
    dialog.dataset.layer = layer;
    if (editorView && !(layer === 'meta' && metaRoute.kind === 'draft')) { editorView.destroy(); editorView = null; editorDraftId = null; }
    const cardId = selectedWork(), authorCard = selectedAuthorWork();
    const cardKey = cardId ? `campaign:${cardId}` : authorCard ? `own:${authorCard.work.workId}:${authorCard.nodeId}` : null;
    if (cardKey !== workCardId) { workCard?.destroy(); workCard = null; workCardId = cardKey; }
    dialog.dataset.workCard = String(cardKey !== null);
    dialog.dataset.picker = String(layer === 'meta' && metaRoute.kind === 'chapter');
    dialog.dataset.chapterMenu = String(layer === 'meta' && metaRoute.kind === 'chapter' && metaRoute.chapterMenu !== undefined);
    if (layer !== 'result' || !motionAllowed()) { prismGlint?.cancel(); prismGlint = null; }
    const open = layer !== 'none' && layer !== 'help' && layer !== 'secret';
    if (!open) { if (dialog.open) { dialog.close(); lastFocus?.focus(); } return; }
    const draftId = layer === 'meta' && metaRoute.kind === 'draft' ? metaRoute.draftId : null;
    if (editorDraftId !== draftId) { editorView?.destroy(); editorView = null; editorDraftId = draftId; }
    dialog.dataset.editor = String(!!draftId);
    byId('dialog-copy').textContent = ''; if (!editorView && !workCard) actions.replaceChildren();
    const { level, attempt, own, challenge } = current();
    dialog.dataset.challengeLost = String(challenge?.status === 'lost');
    prism.hidden = layer !== 'result' || challenge?.status === 'lost';
    if (layer === 'result' && challenge) {
      const won = challenge.status === 'won';
      if (won) colourPrism(prism, level);
      byId('dialog-title').textContent = won ? 'Испытание пройдено' : 'Ходы закончились';
      byId('dialog-copy').textContent = `Ходы · ${challenge.attempt.moves} из ${challenge.moveLimit}`;
      if (won) button('К испытаниям', leaveChallenge);
      else {
        button('Повторить', () => playChallenge(level.id, true));
        button('К испытаниям', leaveChallenge, true);
      }
    } else if (layer === 'result') {
      colourPrism(prism, level);
      byId('dialog-title').textContent = own ? 'Проверка пройдена' : 'Собрано';
      const count = attempt?.moves ?? 0, form = new Intl.PluralRules('ru').select(count);
      const word = form === 'one' ? 'ход' : form === 'few' ? 'хода' : 'ходов';
      byId('dialog-copy').textContent = session.state.preferences.statistics ? `${count} ${word}` : '';
      if (own) {
        button('В редактор', leaveAuthor);
      } else {
        const next = recommendedLevel(session.state, chapterIndexFor(level.id)) ?? recommendedLevel(session.state);
        const receipt = session.state.lastCompletion;
        const unlocked = receipt && receipt.attemptId === attempt?.attemptId
          ? receipt.newRights.find(id => id.startsWith('chapter-open:') || id.startsWith('chapter-complete:'))
          : undefined;
        if (unlocked) {
          chapterUnlock.textContent = rewardTitle(unlocked);
          chapterUnlock.hidden = false;
        }
        if (next) button('Дальше', () => startLevel(next));
        else byId('dialog-copy').textContent += '\nКампания собрана';
        button('В альбом', () => showMeta({ kind: 'card', levelId: level.id }), !!next);
      }
    } else if (layer === 'restart') {
      byId('dialog-title').textContent = 'Начать заново?';
      byId('dialog-copy').textContent = `«${own || challenge ? level.title : getLevel(restartLevelId ?? level.id).title}» начнётся с исходного поля.`;
      button('Начать заново', () => {
        if (challenge) { playChallenge(level.id, true); return; }
        void run(own ? { kind: 'author-start', workId: own.work.workId, nodeId: own.node.nodeId, attemptId: crypto.randomUUID(), restart: true } : { kind: 'restart', levelId: restartLevelId ?? level.id, attemptId: crypto.randomUUID() }, () => { metaHistory = []; layer = 'none'; });
      });
      button('Отмена', cancelRestart, true);
    } else if (layer === 'settings') {
      byId('dialog-title').textContent = 'Пауза';
      const close = button('×', () => { layer = 'none'; render(); }, true);
      close.className = 'quiet settings-close';
      close.setAttribute('aria-label', 'Вернуться к игре');
      close.autofocus = true;
      if (attempt && !attempt.completed && !challenge) button('Помощь', () => { layer = 'help-menu'; render(); }, true);
      button('Заново', () => askRestart(session.state.activeLevelId), true).id = 'restart';
      for (const [key, label] of [['sound', 'Звуки'], ['haptics', 'Вибрация'], ['motion', 'Движение фона'], ['statistics', 'Статистика уровня']] as const) {
        const row = document.createElement('label'); row.className = 'setting';
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = session.state.preferences[key]; input.disabled = busy || activity.isBlocked();
        input.setAttribute('aria-label', label);
        input.onchange = () => void run({ kind: 'preferences', key, value: input.checked });
        const title = document.createElement('span'); title.textContent = label; row.append(title, input); actions.append(row);
      }
    } else if (layer === 'help-menu') {
      byId('dialog-title').textContent = 'Помощь';
      byId('dialog-copy').textContent = 'Подсветка и просмотр не добавят ходов. Любая помощь отмечает результат «С помощью».';
      button('Показать одну плитку', () => {
        if (attempt) askHelp({ kind: 'pulse', scanFrom: Math.floor(Math.random() * attempt.board.length) });
      }, true);
      button('Показать готовое поле', () => askHelp({ kind: 'preview' }), true);
      button(`Сделать один обмен · +${AUTO_HELP_COST} хода`, () => askHelp({ kind: 'auto' }), true);
      button('Отмена', () => { layer = 'none'; render(); }, true);
    } else if (layer === 'pin-guide') {
      byId('dialog-title').textContent = 'Закреплённые плитки';
      byId('dialog-copy').textContent = 'Плитки с точкой стоят на своих местах. По их цветам можно собрать остальные.';
      button('К игре', () => { layer = 'none'; render(); });
    } else if (layer === 'meta') {
      const work = draftId && session.state.creative ? findDraft(session.state.creative, draftId) : null;
      if (cardKey) {
        const finished = cardId ? getLevel(cardId) : null;
        const title = finished?.title ?? authorCard!.work.name;
        const record = finished ? session.state.bests[finished.id]! : authorBests(authorCard!.work, authorCard!.nodeId);
        const minimum = finished?.minimumSwaps ?? playableField(authorCard!.work.nodes[authorCard!.nodeId]!.field, authorCard!.work.workId, title).minimumSwaps;
        const perfect = finished ? session.state.rights.includes(`mastery:${fingerprints.get(finished.id)}:perfect-no-assist`) : record.clean === minimum;
        const reference = finished ? publishedBenchmark(finished, fingerprints.get(finished.id)) : undefined;
        byId('dialog-title').textContent = title;
        if (!workCard) workCard = new WorkCardView(actions, session.state, {
          key: cardKey, title, best: record, minimum, perfect, ...(reference ? { reference } : {}),
          ...(finished ? {
            levelId: finished.id, filename: `Poluson-${String(finished.ordinal).padStart(3, '0')}.png`,
          } : {
            filename: 'Poluson-own.png',
            detail: `Версия ${Object.keys(authorCard!.work.nodes).indexOf(authorCard!.nodeId) + 1} · пройдена автором`,
          }),
        }, exportFiles, {
          back: popMeta,
          ...(finished ? {
            replay: () => askRestart(finished.id),
            copy: () => showMeta({ kind: 'copy', levelId: finished.id }),
            ...(metaHistory.length === 0 && metaReturn === 'result' ? {
              collection: () => {
                const route = { kind: 'album', tab: 'campaign' } as const;
                const key = route.tab;
                albumPositions.set(key, { scroll: albumPositions.get(key)?.scroll ?? 0, focus: finished.id, reveal: true });
                showMeta(route);
              },
            } : {}),
          } : { edit: () => {
            const draftId = authorCard!.work.draftId, previous = metaHistory.at(-1);
            if (previous?.kind === 'draft' && previous.draftId === draftId) popMeta();
            else showMeta({ kind: 'draft', draftId, nodeId: authorCard!.nodeId });
          } }),
        });
        workCard.update(busy || activity.isBlocked() || !!session.pending);
      } else if (shownAlbum) {
        byId('dialog-title').textContent = 'Альбом';
        renderAlbum(actions, { state: session.state, disabled: busy || activity.isBlocked() || !!session.pending, route: shownAlbum,
          position: albumPositions.get(shownAlbum.tab), navigate: showMeta, back: popMeta, createWork,
          play: () => startLevel(session.state.activeLevelId) });
      } else if (work) {
        byId('dialog-title').textContent = work.name;
        const nodeId = metaRoute.kind === 'draft' ? metaRoute.nodeId : undefined;
        if (!editorView) editorView = new EditorView(actions, { work, ...(nodeId ? { nodeId } : {}), disabled: busy || activity.isBlocked(), pending: !!session.pending, commit: action => run(action), recover: recoverEditor,
          exportWork: (workId,nodeId) => showMeta({kind:'own-card',workId,nodeId}),
          play: (workId, nodeId) => run({ kind: 'author-start', workId, nodeId, attemptId: crypto.randomUUID() }, () => { metaHistory = []; layer = current().attempt?.completed ? 'result' : 'none'; }),
          back: popMeta });
        editorView.update(work, busy || activity.isBlocked(), !!session.pending);
      } else {
      renderMeta({ route: metaRoute, state: session.state, disabled: busy || activity.isBlocked() || !!session.pending,
        title: byId('dialog-title'), copy: byId('dialog-copy'), actions, navigate: showMeta, back: () => { back(); },
        play: startLevel, repeat: repeatLevel, playChallenge,
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
    const { level, attempt, own, challenge } = current();
    if (!attempt && !session.pending) layer = 'recovery';
    if (layer === 'none' && challenge && challenge.status !== 'playing') layer = 'result';
    root.dataset.level = level.id; root.dataset.moves = String(attempt?.moves ?? 0); root.dataset.busy = String(busy); root.dataset.layer = layer;
    root.dataset.mode = challenge ? 'challenge' : own ? 'author' : 'campaign';
    root.dataset.motion = String(motionAllowed());
    root.style.setProperty('--color-a', level.solvedTileColors[0]!); root.style.setProperty('--color-b', level.solvedTileColors.at(-1)!);
    byId('levels').textContent = challenge ? '‹ Испытания' : own ? '‹ Редактор' : '‹ Уровни';
    byId('title').textContent = own || challenge ? level.title : `Уровень ${level.ordinal}`;
    const guidance = byId('guidance');
    guidance.textContent = layer === 'secret' ? '' : challenge ? `Ходов осталось · ${challenge.moveLimit - challenge.attempt.moves}` : layer === 'help' ? 'Готовое поле' : notice || (!own && !session.state.onboarding.firstSwapDone ? 'Поменяй две плитки местами' : '');
    guidance.hidden = !guidance.textContent;
    const footerAction = byId<HTMLButtonElement>('help');
    footerAction.hidden = layer !== 'help' && layer !== 'secret' && !attempt?.completed;
    footerAction.textContent = layer === 'secret' ? 'Открыть поле' : layer === 'help' ? 'К игре' : 'Результат';
    for (const node of root.querySelectorAll<HTMLButtonElement>('.hud button,footer button')) node.disabled = busy || activity.isBlocked() || !!session.pending;
    if (attempt) scene.setView(level, attempt, layer === 'help', ready && !busy && !activity.isBlocked() && layer === 'none' && !session.pending, layer === 'secret');
    else scene.setView(level, initialAttempt, false, false);
    const picker = layer === 'meta' && metaRoute.kind === 'chapter' ? metaRoute : null;
    const cardId = selectedWork(), authorCard = selectedAuthorWork();
    const gallery = layer === 'meta' && metaRoute.kind === 'album';
    atmosphere.placeInside(picker || cardId || authorCard || gallery ? dialog : root);
    if (picker) {
      const model = picker.chapterMenu === undefined ? levelPreview(session.state, picker.levelId) : null;
      atmosphere.setModel(model?.level ?? null, model?.board ?? null);
    } else if (cardId) {
      atmosphere.setModel(getLevel(cardId), null);
    } else if (authorCard) {
      atmosphere.setModel(authorCard.work.nodes[authorCard.nodeId]!.field, null);
    } else if (gallery) {
      atmosphere.setModel(null, null);
    } else {
      atmosphere.setModel(layer === 'secret' ? null : level, layer === 'help' || layer === 'secret' ? null : attempt?.board ?? initialAttempt.board);
    }
    atmosphere.configure(ready && !activity.isBlocked() && (picker !== null || cardId !== null || authorCard !== null || gallery || ['none', 'help', 'result'].includes(layer)), motionAllowed());
    feedback.configure(session.state.preferences, !ready || activity.isBlocked());
    activity.setGameplayDesired(ready && !busy && layer === 'none' && !attempt?.completed && !activity.isBlocked());
    renderDialog(); paint();
  }
  function askHelp(assistance: Assistance): void {
    if (layer !== 'help-menu' || busy || session.pending || activity.isBlocked()) return;
    const { own, level, attempt } = current();
    if (!attempt || attempt.completed) return;
    pendingHelp = () => {
      pendingHelp = null;
      const next = current().attempt;
      if (activity.isBlocked() || next?.attemptId !== attempt.attemptId || next.assistsUsed !== attempt.assistsUsed + 1 ||
          next.completed || next.moves !== attempt.moves) return;
      if (assistance.kind === 'preview') layer = 'help';
      else if (assistance.kind === 'pulse') {
        const position = pulsePosition(level, attempt, assistance.scanFrom);
        if (position !== null && next.board.every((tile, index) => tile === attempt.board[index])) showMark(position, 'pulse');
      }
    };
    void run({ kind: own ? 'author-help' : 'help', attemptId: attempt.attemptId, assistance }, () => {
      layer = 'none';
      pendingHelp?.();
    }).then(() => { if (!session.pending) pendingHelp = null; });
  }
  async function run(action: Action | CreativeAction, after?: () => void): Promise<boolean> {
    if (busy || session.pending || activity.isBlocked()) return false;
    const { attempt: previous, level: previousLevel } = current();
    const ordinarySwap = action.kind === 'swap' || action.kind === 'author-swap' || action.kind === 'challenge-swap';
    const autoSwap = (action.kind === 'help' || action.kind === 'author-help') && action.assistance?.kind === 'auto';
    const pair = ordinarySwap ? action : autoSwap && previous ? autoHelpSwap(previousLevel, previous) : null;
    const cost = autoSwap ? AUTO_HELP_COST : 1;
    const foreground = foregroundEpoch;
    let swapAccepted = false, succeeded = false;
    busy = true; render();
    try {
      const changed = await session.act(action);
      if (!alive) return false;
      succeeded = true;
      if (changed) {
        notice = '';
        if (pair) clearMark();
        after?.();
        if (pair && gameLayer() === 'result') layer = 'result';
        swapAccepted = pair !== null;
      }
    } catch {
      notice = session.pending ? 'Не удалось подтвердить сохранение.' : 'Поле изменилось в другом окне. Повтори действие.';
      if (session.pending && !editorView) layer = 'recovery';
    } finally {
      busy = false; render(); resize();
      const { level, attempt: next } = current();
      if (swapAccepted && pair && previous && next && previous.attemptId === next.attemptId && !activity.isBlocked() &&
          foreground === foregroundEpoch && next.moves === previous.moves + cost &&
          next.board[pair.from] === previous.board[pair.to] && next.board[pair.to] === previous.board[pair.from]) {
        scene.presentSwap(previous, next, pair.from, pair.to, motionAllowed(), cost);
        const { width, height } = region.getBoundingClientRect();
        const cell = cellAt(boardGeometry(width, height, level.width, level.height), pair.to);
        atmosphere.accepted(atmospherePoint({ x: cell.x + cell.width / 2, y: cell.y + cell.height / 2, color: level.solvedTileColors[next.board[pair.to]!]! }), next.completed);
        feedback.accepted(next.completed ? 'win' : 'swap');
        if (next.completed && motionAllowed()) prismGlint = flashPrismEdge(prism);
      }
    }
    return succeeded;
  }
  async function recover(): Promise<void> {
    if (busy) return;
    busy = true; render();
    try {
      if (session.pending) await session.resolvePending(); else await session.load();
      notice = ''; layer = gameLayer();
      pendingHelp?.();
    } catch { notice = 'Не удалось проверить сохранение. Попробуй ещё раз.'; layer = 'recovery'; }
    finally { busy = false; render(); }
  }
  async function recoverEditor(): Promise<boolean> {
    if (busy || activity.isBlocked()) return false;
    busy = true; render(); let success = false;
    try {
      if (session.pending) await session.resolvePending();
      else await session.load();
      if (current().own) { metaHistory = []; layer = current().attempt?.completed ? 'result' : 'none'; }
      success = true;
    }
    catch { notice = 'Не удалось проверить сохранение. Попробуй ещё раз.'; }
    finally { busy = false; render(); }
    return success;
  }
  const back = (): boolean => {
    if (busy || layer === 'recovery') return true;
    scene.cancel();
    if (editorView && layer === 'meta') { void editorView.back(); return true; }
    if (workCard?.handleBack()) return true;
    if (layer === 'meta') {
      if (metaRoute.kind === 'chapter' && metaRoute.chapterMenu !== undefined) {
        metaRoute = { kind: 'chapter', levelId: metaRoute.levelId };
        render(); actions.querySelector<HTMLElement>('[data-open-chapters]')?.focus({ preventScroll: true });
        return true;
      }
      popMeta(); return true;
    }
    if (layer === 'restart') { cancelRestart(); return true; }
    if (layer === 'help-menu') { layer = 'settings'; render(); return true; }
    if ((layer === 'result' || layer === 'none') && current().challenge) { leaveChallenge(); return true; }
    if (layer !== 'none') { layer = 'none'; render(); return true; }
    if (current().own) { leaveAuthor(); return true; }
    return false;
  };
  byId('help').addEventListener('click', () => {
    if (layer === 'help' || layer === 'secret') { layer = 'none'; render(); return; }
    if (current().attempt?.completed) { layer = 'result'; render(); }
  }, { signal: listeners.signal });
  byId('levels').addEventListener('click', () => {
    if (current().challenge) leaveChallenge();
    else if (current().own) leaveAuthor();
    else showMeta({ kind: 'chapter', levelId: session.state.activeLevelId });
  }, { signal: listeners.signal });
  byId('settings').addEventListener('click', () => { scene.cancel(); clearMark(); layer = 'settings'; render(); }, { signal: listeners.signal });
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
    if (blocked) {
      foregroundEpoch++;
      pendingHelp = null;
      clearMark();
      scene.cancel();
      if (layer === 'help') layer = 'none';
      game.sound.mute = true;
      if (game.isBooted) game.loop.sleep();
    }
    else { game.sound.mute = false; resize(); }
    render();
  });
  await frame; ready = true; render(); resize();
  return { back, destroy() { alive = false; clearMark(); editorView?.destroy(); workCard?.destroy(); prismGlint?.cancel(); exportFiles.destroy?.(); listeners.abort(); observer.disconnect(); unblock(); atmosphere.destroy(); feedback.destroy(); activity.setGameplayDesired(false); store.close(); destroyRenderer(game); } };
}
