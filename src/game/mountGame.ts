import Phaser from 'phaser';
import { localCalendarDay, getRenderPixelRatio } from '@danilah/mini-games-kit/core';
import { destroyRenderer } from '@danilah/mini-games-kit/phaser';
import type { GameplayActivityCoordinator } from '@danilah/mini-games-kit/platform';
import { chapters, levels, getLevel } from '../domain/levels';
import { fingerprintPayload, type Action, type BookTarget } from '../domain/workspace';
import { hashText } from '../local-store/command';
import type { TransactionalLocalStore } from '../local-store/contracts';
import { gameMode, type InputIntent } from '../app/gameTelemetry';
import { GUEST_VAULT, Session } from '../app/session';
import { PuzzleScene, GAME_PRESENTABLE } from './PuzzleScene';
import { Atmosphere, type ColourPointer } from './atmosphere';
import { cellCenter } from './geometry';
import { AmbientMusic } from './music';
import { GameFeedback, type Haptic } from './feedback';
import { calendarSelection, dailyLabel, isMenuList, levelPreview, personalObjects, renderMeta, type MetaRoute } from './metaView';
import { chapterIndexFor, recommendedLevel, rewardTitle } from '../domain/progression';
import { authorBests, authorView, findDraft, hasAuthorProof, type CreativeAction } from '../domain/creative';
import { makePuzzleFile, parsePuzzleFile } from '../domain/puzzleTransfer';
import { makeField, playableField } from '../domain/editor';
import { AUTO_HELP_COST, autoHelpSwap, pulsePosition, type Assistance } from '../domain/puzzle';
import { activePersonal, personalTaskName } from '../domain/personal';
import { activeDaily, validateDailyFeed, type DailyFeed } from '../domain/daily';
import { activeTimed, timedRemaining } from '../domain/timeTrial';
import { books, bookProgress } from '../domain/books';
import { activeChallenge, challenges } from '../domain/challenges';
import { publishedBenchmark } from '../domain/playerProgress';
import { EditorView } from './editorView';
import { renderAlbum, type AlbumPosition, type AlbumRoute } from './albumView';
import { WorkCardView } from './workCardView';
import { colourPrism, victoryPrism } from './victoryPrism';
import { VictoryArtwork } from './victoryArtwork';
import { amount, ease, LANDING_MS, LIFT_START_MS, RESULT_REVEAL_AT_MS, RESULT_REVEAL_MS, victoryChromeOpacity } from './victoryMotion';
import { browserExportFiles, type ExportFiles } from '../app/exportFiles';
import './game.css';

const clockNow = () => Math.floor(performance.timeOrigin + performance.now());

type Layer = 'none' | 'secret' | 'help' | 'help-menu' | 'pin-guide' | 'result' | 'meta' | 'restart' | 'recovery' | 'settings' | 'preferences';
interface Activity extends Pick<GameplayActivityCoordinator, 'isBlocked' | 'onBlockedChange' | 'setGameplayDesired'> {}

export async function mountGame(parent: HTMLElement, store: TransactionalLocalStore, activity: Activity, options: { haptic?: Haptic; exportFiles?: ExportFiles; dailySource?: () => Promise<DailyFeed>; onIntent?: (intent: InputIntent) => void } = {}): Promise<{ back(): boolean; destroy(): void }> {
  const fingerprints = new Map(await Promise.all(levels.map(async level => [level.id, await hashText(fingerprintPayload(level))] as const)));
  const session = new Session(store, fingerprints);
  await session.load();
  const savedTimed = activeTimed(session.state.timedProgress)?.run;
  const savedPersonal = activePersonal(session.state.personalProgress)?.clock;
  const savedClock = savedTimed ?? savedPersonal;
  if (savedClock?.startedAt != null) {
    const elapsed = Math.min(savedClock.remainingMs, Math.max(0, session.clockElapsedMs));
    await session.act({ kind: savedTimed ? 'timed-pause' : 'personal-pause', now: savedClock.startedAt + elapsed });
  }
  const exportFiles = options.exportFiles ?? browserExportFiles();
  const current = () => {
    const personal = activePersonal(session.state.personalProgress);
    const daily = activeDaily(session.state.dailyProgress);
    const timed = activeTimed(session.state.timedProgress);
    const challenge = activeChallenge(session.state.challengeProgress);
    const own = !personal && !daily && !timed && !challenge && session.state.creative?.playing ? authorView(session.state.creative) : null;
    const level = personal?.level ?? daily?.level ?? timed?.level ?? challenge?.level ?? own?.level ?? getLevel(session.state.activeLevelId);
    return { own, challenge, timed, daily, personal, level, attempt: personal?.attempt ?? daily?.attempt ?? timed?.run.attempt ?? challenge?.attempt ?? own?.attempt ?? session.state.attempts[level.id] };
  };
  const gameLayer = (): Layer => {
    const { attempt, challenge, timed, personal } = current();
    if (!attempt) return 'recovery';
    return attempt.completed || challenge?.status === 'lost' || personal?.status === 'lost' || timed?.run.remainingMs === 0 ? 'result' : 'none';
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
  const atmosphere = new Atmosphere(root), feedback = new GameFeedback(options.haptic), music = new AmbientMusic();
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => session.state.preferences.motion && !systemMotion.matches && !activity.isBlocked();
  const byId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const listeners = new AbortController();
  let alive = true, busy = false, ready = false, paintPending = false, notice = '';
  let markPosition: number | null = null, markTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingHelp: (() => void) | null = null;
  let foregroundEpoch = 0;
  let queuedClock = false;
  let dailyLoading = false;
  let dailyUnavailable = false;
  let newlyFilled: BookTarget | undefined;
  let bookInsertion: BookTarget | undefined;
  let insertionTimer: ReturnType<typeof setTimeout> | undefined;
  let dailyFocus: string | undefined;
  let importing = false, importNote = '';
  let pendingImport: Awaited<ReturnType<typeof parsePuzzleFile>> | null = null;
  let pauseRequestedAt: number | null = null;
  let checkpointingRevision: number | null = null;
  const timeCaption = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  let layer = gameLayer();
  let editorView: EditorView | null = null, editorDraftId: string | null = null;
  let workCard: WorkCardView | null = null, workCardId: string | null = null;
  let shownAlbum: AlbumRoute | null = null;
  const albumPositions = new Map<AlbumRoute['tab'], AlbumPosition>();
  let printAnimation: Animation | undefined;
  function movePrint(source: HTMLCanvasElement, from: DOMRect, to: DOMRect): void {
    if (!motionAllowed() || !from.width || !from.height || !to.width || !to.height) return;
    printAnimation?.cancel();
    const image = document.createElement('img');
    image.alt = '';
    image.className = 'album-flight';
    image.src = source.toDataURL();
    const frame = (box: DOMRect) => ({
      left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    });
    dialog.append(image);
    const animation = image.animate([frame(from), frame(to)], { duration: 300, easing: 'cubic-bezier(.22,.66,.29,1)' });
    printAnimation = animation;
    animation.finished.catch(() => {}).finally(() => { image.remove(); if (printAnimation === animation) printAnimation = undefined; });
  }
  const prism = byId('victory-prism');
  const artwork = new VictoryArtwork(root);
  let victoryPhase: 'approach' | 'landed' | 'reveal' | 'still' = 'still';
  const heldActivation = new Set<string>();
  const blockedActivation = new Set<string>();
  const earlyPointers = new Set<number>();
  const victoryWaiting = () => layer === 'result' && victoryPhase !== 'still';
  let pauseFocus = 0;
  let pauseOrigin: 'none' | 'secret' | 'help' = 'none';
  const isPause = (value: string | undefined) => value === 'settings' || value === 'preferences';
  function setVictoryPhase(phase: typeof victoryPhase): void {
    victoryPhase = phase;
    root.dataset.victoryPhase = phase;
    dialog.dataset.victoryPhase = phase;
  }
  function stopVictory(): void {
    if (victoryPhase === 'still') return;
    setVictoryPhase('still');
    scene.finishVictory();
    artwork.clearMotion();
    root.style.removeProperty('--victory-chrome');
    dialog.style.removeProperty('--victory-opacity');
    syncVictoryActions(true);
  }
  function syncVictoryActions(focus = false): void {
    const waiting = victoryWaiting();
    actions.toggleAttribute('inert', waiting);
    if (waiting) actions.setAttribute('aria-hidden', 'true');
    else actions.removeAttribute('aria-hidden');
    if (layer !== 'result') return;
    for (const node of actions.querySelectorAll<HTMLButtonElement>('button')) {
      node.disabled = waiting || busy || activity.isBlocked();
    }
    if (focus && dialog.open) {
      if (waiting || busy || activity.isBlocked()) dialog.focus({ preventScroll: true });
      else actions.querySelector('button')?.focus({ preventScroll: true });
    }
  }
  let lastFocus: HTMLElement | null = null;
  let metaRoute: MetaRoute = { kind: 'chapter', levelId: session.state.activeLevelId };
  const chosenLevels = new Map<number, string>();
  const chosenLevel = (index: number) => chosenLevels.get(index)
    ?? (chapterIndexFor(session.state.activeLevelId) === index ? session.state.activeLevelId : recommendedLevel(session.state, index))
    ?? chapters[index]!.levelIds[0]!;
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
      const { own, attempt, challenge, timed, daily, personal } = current();
      if (!attempt) return;
      try { options.onIntent?.({ kind: 'swap-intent', mode: gameMode(session.state) }); }
      catch { /* Analytics cannot block a puzzle gesture. */ }
      if (personal) void run({ kind: 'personal-swap', from, to, attemptId: attempt.attemptId, now: clockNow() });
      else if (timed) void run({ kind: 'timed-swap', from, to, attemptId: attempt.attemptId, now: clockNow() });
      else void run({ kind: daily ? 'daily-swap' : challenge ? 'challenge-swap' : own ? 'author-swap' : 'swap', from, to, attemptId: attempt.attemptId });
    },
    pin: position => {
      showMark(position, 'pin');
      const { own, level, challenge, timed, daily, personal } = current();
      if (challenge || timed || daily || personal) return;
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
  const game = new Phaser.Game({ type: Phaser.CANVAS, parent: region, width: Math.round(startSize.width * startSize.dpr), height: Math.round(startSize.height * startSize.dpr),
    transparent: true, scene: [scene], scale: { mode: Phaser.Scale.NONE },
    callbacks: { preBoot: g => g.events.once(GAME_PRESENTABLE, resolveFrame), postBoot: g => { g.canvas.style.width = `${startSize.width}px`; g.canvas.style.height = `${startSize.height}px`; } } });

  function paint(): void {
    // The scene's create callback may run before the local game binding is assigned.
    if (!alive || !region.querySelector('canvas')) return;
    if (markPosition !== null) positionMark();
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
    positionMark();
    paint();
  }
  function positionMark(): void {
    if (markPosition === null) return;
    const cell = scene.boardCell(markPosition);
    const clipPath = cell.points ? `polygon(${cell.points.map(([x, y]) => `${x}px ${y}px`).join(',')})` : '';
    Object.assign(marker.style, {
      clipPath, left: `${cell.x}px`, top: `${cell.y}px`, width: `${cell.width}px`, height: `${cell.height}px`,
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
    positionMark();
    marker.dataset.position = String(position);
    marker.dataset.kind = kind;
    marker.hidden = false;
    markTimer = setTimeout(clearMark, kind === 'pulse' ? 1400 : 650);
  }
  function button(text: string, action: () => void, quiet = false): HTMLButtonElement {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.className = quiet ? 'quiet' : ''; node.disabled = busy || activity.isBlocked();
    node.onclick = () => { if (!victoryWaiting()) action(); }; actions.append(node);
    return node;
  }
  function showMeta(route: MetaRoute, origin?: HTMLCanvasElement): void {
    const from = origin?.getBoundingClientRect();
    scene.cancel();
    if (layer === 'meta' && metaRoute.kind === 'book') finishInsertion();
    if (layer !== 'meta') { metaReturn = layer; metaHistory = []; }
    else {
      const samePicker = route.kind === 'chapter' && metaRoute.kind === 'chapter'
        || route.kind === 'daily' && metaRoute.kind === 'daily'
        || route.kind === 'personal' && metaRoute.kind === 'personal'
        || route.kind === 'album' && metaRoute.kind === 'album'
        || route.kind === 'challenges' && metaRoute.kind === 'challenges';
      if (!samePicker && JSON.stringify(route) !== JSON.stringify(metaRoute)) metaHistory.push(metaRoute);
    }
    if (route.kind === 'chapter') chosenLevels.set(chapterIndexFor(route.levelId),route.levelId);
    metaRoute = route; layer = 'meta'; render();
    if (origin && from) {
      const view = actions.querySelector('.work-card-art');
      if (view) movePrint(origin,from,view.getBoundingClientRect());
    }
    if (route.kind === 'daily') {
      if (!route.date && !route.month) void refreshDaily();
      else if (route.date) actions.querySelector<HTMLElement>(`[data-daily-date="${route.date}"]`)?.focus({ preventScroll: true });
    } else if (route.kind === 'books') void refreshDaily();
    if (route.kind === 'personal') {
      if (!route.key || session.state.personalProgress?.day !== localCalendarDay()) void issuePersonal();
      if (route.key) actions.querySelector<HTMLElement>(`[data-task-key="${route.key}"]`)?.focus({ preventScroll: true });
    }
  }
  function startLevel(id: string, book?: BookTarget, restart = false): void {
    if (current().own) { void run({ kind: 'author-exit' }, () => queueMicrotask(() => startLevel(id, book, restart))); return; }
    const after = () => { metaHistory = []; notice = ''; layer = gameLayer(); };
    const sameSource = book ? currentBook()?.bookId === book.bookId && currentBook()?.slot === book.slot : !session.state.bookOrigin;
    if (!restart && sameSource && session.state.activeLevelId === id && session.state.attempts[id]) { after(); render(); }
    else void run({ kind: restart ? 'restart' : 'open', levelId: id, attemptId: crypto.randomUUID(), ...(book ? { book } : {}) }, after);
  }
  function repeatLevel(id: string): void { startLevel(id, undefined, true); }
  function playChallenge(id: string, restart: boolean, book?: BookTarget, entry?: 'progress'): void {
    const firstOpen = !session.state.challengeProgress?.attempts[id];
    if (!restart && current().challenge?.level.id === id && book?.bookId === currentBook()?.bookId &&
        book?.slot === currentBook()?.slot && session.state.challengeProgress?.entry === entry) {
      layer = gameLayer(); render(); return;
    }
    void run({ kind: restart ? 'challenge-restart' : 'challenge-open', id, attemptId: crypto.randomUUID(), ...(book ? { book } : {}), ...(entry ? { entry } : {}) }, () => {
      metaHistory = [];
      layer = firstOpen && current().challenge?.afterFinaleId ? 'secret' : gameLayer();
    });
  }
  function playBook(target: BookTarget): void {
    const book = books.find(item => item.id === target.bookId);
    const goal = book && bookProgress(book, session.state).goals[target.slot];
    if (!goal || goal.completed) return;
    const id = goal.levelId;
    if (goal.need === 'challenge') {
      const attempt = session.state.challengeProgress?.attempts[id];
      const definition = challenges.find(item => item.level.id === id);
      playChallenge(id, !!attempt && !!definition && attempt.moves >= definition.moveLimit, target);
    } else startLevel(id, target, session.state.attempts[id]?.completed === true);
  }
  function currentBook() {
    const { attempt, level, personal, daily, timed, own } = current();
    if (personal || daily || timed || own) return undefined;
    const origin = session.state.bookOrigin;
    const book = origin && books.find(item => item.id === origin.bookId);
    return origin && origin.attemptId === attempt?.attemptId && book?.goals[origin.slot]?.levelId === level.id ? origin : undefined;
  }
  function finishInsertion(sound = false): void {
    clearTimeout(insertionTimer);
    if (!bookInsertion) return;
    bookInsertion = undefined;
    if (sound && !activity.isBlocked() && !document.hidden) feedback.sound('book');
    render();
  }
  function showBook(bookId: string, slot?: number): void {
    metaReturn = gameLayer();
    metaHistory = [{ kind: 'chapter', levelId: session.state.activeLevelId }, { kind: 'album', tab: 'campaign' }, { kind: 'books' }];
    metaRoute = { kind: 'book', bookId, ...(slot !== undefined ? { slot } : {}) };
    layer = 'meta';
    if (newlyFilled?.bookId === bookId && newlyFilled.slot === slot) {
      if (motionAllowed()) {
        bookInsertion = newlyFilled;
        insertionTimer = setTimeout(() => finishInsertion(true), 620);
      } else feedback.sound('book');
    }
    newlyFilled = undefined;
  }
  function leaveBook(): void {
    const origin = currentBook();
    if (!origin) return;
    if (current().challenge) { leaveChallenge(); return; }
    showBook(origin.bookId, origin.slot);
    render();
  }
  function challengeLobby(group?: 'chapter' | 'geometry'): void {
    metaReturn = gameLayer();
    metaHistory = [{ kind: 'chapter', levelId: session.state.activeLevelId }];
    metaRoute = { kind: 'challenges', ...(group ? { group } : {}) };
    layer = 'meta';
  }
  function leaveChallenge(): void {
    const challenge = current().challenge;
    const origin = currentBook();
    const progress = session.state.challengeProgress?.entry === 'progress' ? challenge?.chapterIndex : undefined;
    const group = challenge?.chapterIndex !== undefined ? 'chapter' : challenge?.level.id.startsWith('geometry-v1-') ? 'geometry' : undefined;
    void run({ kind: 'challenge-leave' }, () => {
      if (origin) showBook(origin.bookId, origin.slot);
      else if (challenge?.book) showBook(challenge.book.id);
      else if (progress !== undefined) {
        metaReturn = gameLayer();
        metaHistory = [{ kind: 'chapter', levelId: session.state.activeLevelId }];
        metaRoute = { kind: 'progress', chapter: progress };
        layer = 'meta';
      } else challengeLobby(group);
    });
  }
  async function refreshDaily(): Promise<void> {
    if (!options.dailySource || dailyLoading || activity.isBlocked()) return;
    dailyLoading = true;
    render();
    try {
      const feed = await options.dailySource();
      const cutoff = validateDailyFeed(feed);
      dailyUnavailable = (session.state.dailyProgress?.through ?? '') > cutoff;
      if (alive && !dailyUnavailable) dailyUnavailable = !(await run({ kind: 'daily-cache', feed }));
    } catch { dailyUnavailable = true; /* The trusted archive remains available. */ }
    finally { dailyLoading = false; if (alive && layer === 'meta' && (metaRoute.kind === 'daily' || metaRoute.kind === 'books')) render(); }
  }
  function playDaily(date: string, replay: boolean): void {
    const entry = metaRoute.kind === 'books' ? 'books' : 'daily';
    void run({ kind: 'daily-open', date, replay, entry, attemptId: crypto.randomUUID() }, () => {
      metaHistory = [];
      layer = gameLayer();
    });
  }
  function leaveDaily(): void {
    const daily = current().daily;
    if (!daily) return;
    void run({ kind: 'daily-leave' }, () => {
      metaReturn = gameLayer();
      metaHistory = daily.entry === 'books' ? [{ kind: 'album', tab: 'campaign' }] : [{ kind: 'chapter', levelId: session.state.activeLevelId }];
      metaRoute = daily.entry === 'books' ? { kind: 'books', eventDate: daily.date } : { kind: 'daily', date: daily.date };
      layer = 'meta';
      queueMicrotask(() => void refreshDaily());
    });
  }
  function issuePersonal(): Promise<boolean> {
    return run({ kind: 'personal-issue', day: localCalendarDay() });
  }
  function playPersonal(key: string, restart: boolean): void {
    if (layer === 'meta' && metaRoute.kind === 'personal' && session.state.personalProgress?.day !== localCalendarDay()) {
      void issuePersonal();
      return;
    }
    void run({ kind: 'personal-open', key, restart, attemptId: crypto.randomUUID(), now: clockNow() }, () => {
      metaHistory = [];
      layer = gameLayer();
    });
  }
  function leavePersonal(): void {
    const key = current().personal?.key;
    void run({ kind: 'personal-leave', now: clockNow() }, () => {
      metaReturn = gameLayer();
      metaHistory = [{ kind: 'chapter', levelId: session.state.activeLevelId }];
      metaRoute = { kind: 'personal', ...(key ? { key } : {}) };
      layer = 'meta';
      queueMicrotask(() => void issuePersonal());
    });
  }
  function playTimed(): void {
    const entry = layer === 'meta' && metaRoute.kind === 'challenges' ? metaRoute.group : current().timed?.entry;
    void run({ kind: 'timed-open', id: crypto.randomUUID(), now: clockNow(), ...(entry ? { entry } : {}) }, () => {
      metaHistory = [];
      layer = gameLayer();
    });
  }
  function leaveTimed(): void {
    const entry = current().timed?.entry;
    void run({ kind: 'timed-leave', now: clockNow() }, () => challengeLobby(entry));
  }
  function activeClock() {
    return activeTimed(session.state.timedProgress)?.run ?? activePersonal(session.state.personalProgress)?.clock;
  }
  function checkpointClock(elapsed: number, final = false): void {
    const revision = session.revision;
    if (!final && checkpointingRevision === revision) return;
    checkpointingRevision = revision;
    void store.checkpointClock(GUEST_VAULT, revision, elapsed).then(saved => {
      if (saved && session.revision === revision) session.clockElapsedMs = Math.max(session.clockElapsedMs, elapsed);
    }).catch(() => { /* Retry on the next clock tick; the previously committed observation remains valid. */ })
      .finally(() => { if (checkpointingRevision === revision) checkpointingRevision = null; });
  }
  function updateTimedClock(): void {
    if (!alive) return;
    const timed = session.state.timedProgress?.active ? session.state.timedProgress : undefined;
    const personal = activePersonal(session.state.personalProgress);
    const timer = timed?.run ?? (personal?.status === 'playing' ? personal.clock : undefined);
    if (!timer || timer.remainingMs === 0) { pauseRequestedAt = null; return; }
    const mode = timed ? 'timed' : 'personal';
    const now = clockNow();
    const wantRunning = layer === 'none' && !activity.isBlocked() && !session.pending;
    if (timer.startedAt === null) pauseRequestedAt = null;
    else if (!wantRunning) pauseRequestedAt ??= now;
    const remaining = timedRemaining(timer, pauseRequestedAt ?? now);
    const persisted = timer.startedAt === null ? remaining : Math.max(0, timer.remainingMs - session.clockElapsedMs);
    if (ready && wantRunning && timer.startedAt !== null && !busy &&
        Math.ceil(remaining / 1000) < Math.ceil(persisted / 1000)) {
      checkpointClock(timer.remainingMs - remaining);
    }
    if (layer === 'none') {
      const guidance = byId('guidance');
      const time = timeCaption(Math.ceil(persisted / 1000));
      const label = timed ? `${time} · Собрано ${timed.run.cleared}` : time;
      if (guidance.textContent !== label) guidance.textContent = label;
    }
    if (!ready || busy || queuedClock || session.pending) return;
    const next = pauseRequestedAt !== null && timer.startedAt !== null ? 'pause'
      : wantRunning && timer.startedAt === null ? 'resume'
      : wantRunning && remaining === 0 ? 'expire' : null;
    if (!next) return;
    const at = next === 'pause' ? pauseRequestedAt ?? now : now;
    queuedClock = true;
    queueMicrotask(() => {
      queuedClock = false;
      if (alive) void run({ kind: `${mode}-${next}`, now: at });
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
    finishInsertion();
    const previous = metaHistory.pop();
    const from = previous?.kind === 'album' ? actions.querySelector('.work-card-art')?.getBoundingClientRect() : undefined;
    if (previous) metaRoute = previous;
    else layer = metaReturn;
    render();
    if (from) {
      const cover = actions.querySelector<HTMLCanvasElement>('[data-album-selected] canvas');
      if (cover) movePrint(cover,from,cover.getBoundingClientRect());
    }
  }
  function createWork(): void {
    const draftId = crypto.randomUUID();
    void run({ kind: 'editor-create', draftId, workId: crypto.randomUUID(), nodeId: crypto.randomUUID(), name: 'Моя композиция', field: makeField(), seed: 0 },
      () => showMeta({ kind: 'draft', draftId }));
  }
  async function importPuzzle(file: File): Promise<void> {
    if (importing || pendingImport || session.pending) return;
    importing = true;
    importNote = '';
    try { pendingImport = await parsePuzzleFile(file); }
    catch { importNote = 'Файл повреждён или создан в несовместимой версии Полусна.'; }
    finally { importing = false; if (alive) render(); }
  }
  function finishImport(): void {
    if (!pendingImport || busy || activity.isBlocked() || session.pending) return;
    const source = pendingImport;
    pendingImport = null;
    if (layer !== 'meta' || metaRoute.kind !== 'album' || metaRoute.tab !== 'own') return;
    const draftId = crypto.randomUUID();
    queueMicrotask(() => {
      void run({ kind: 'editor-create', draftId, workId: crypto.randomUUID(), nodeId: crypto.randomUUID(),
        name: source.name, field: source.field, seed: source.seed }, () => showMeta({ kind: 'draft', draftId }));
    });
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
    const switchLayer = dialog.dataset.layer !== layer;
    const menu = layer === 'meta' && isMenuList(metaRoute) ? metaRoute.kind : undefined;
    const switchMenu = dialog.dataset.menu !== menu;
    if (switchMenu) dailyFocus = menu === 'daily' && metaRoute.kind === 'daily' ? metaRoute.date : undefined;
    const menuScroll = !switchMenu && menu ? dialog.scrollTop : 0;
    const openDisclosures = !switchMenu && menu
      ? [...actions.querySelectorAll<HTMLDetailsElement>('details[open][data-menu-disclosure]')].map(node => node.dataset.menuDisclosure)
      : [];
    if (menu) dialog.dataset.menu = menu;
    else delete dialog.dataset.menu;
    const dialogTitle = byId('dialog-title');
    if (menu) dialogTitle.tabIndex = -1;
    else if (switchMenu) dialogTitle.removeAttribute('tabindex');
    if (switchLayer) pauseFocus = 0;
    shownAlbum = layer === 'meta' && metaRoute.kind === 'album' ? metaRoute : null;
    dialog.dataset.album = String(!!shownAlbum);
    const chapterUnlock = byId('chapter-unlock');
    chapterUnlock.hidden = true;
    delete actions.dataset.meta;
    dialog.dataset.layer = layer;
    if (layer === 'meta' && metaRoute.kind === 'book') dialog.dataset.cover = metaRoute.bookId;
    else delete dialog.dataset.cover;
    if (editorView && !(layer === 'meta' && metaRoute.kind === 'draft')) { editorView.destroy(); editorView = null; editorDraftId = null; }
    const cardId = selectedWork(), authorCard = selectedAuthorWork();
    const cardKey = cardId ? `campaign:${cardId}` : authorCard ? `own:${authorCard.work.workId}:${authorCard.nodeId}` : null;
    if (cardKey !== workCardId) { workCard?.destroy(); workCard = null; workCardId = cardKey; }
    dialog.dataset.workCard = String(cardKey !== null);
    dialog.dataset.picker = String(layer === 'meta' && metaRoute.kind === 'chapter');
    dialog.dataset.chapterMenu = String(layer === 'meta' && metaRoute.kind === 'chapter' && metaRoute.chapterMenu !== undefined);
    const open = layer !== 'none' && layer !== 'help' && layer !== 'secret';
    if (layer !== 'result') earlyPointers.clear();
    if (!open) { if (dialog.open) { dialog.close(); lastFocus?.focus(); } return; }
    const draftId = layer === 'meta' && metaRoute.kind === 'draft' ? metaRoute.draftId : null;
    if (editorDraftId !== draftId) { editorView?.destroy(); editorView = null; editorDraftId = draftId; }
    dialog.dataset.editor = String(!!draftId);
    byId('dialog-copy').textContent = ''; if (!editorView && !workCard) actions.replaceChildren();
    const { level, attempt, own, challenge, timed, daily, personal } = current();
    dialog.dataset.challengeLost = String(challenge?.status === 'lost' || !!timed || personal?.status === 'lost');
    prism.hidden = root.dataset.victory !== 'true';
    if (layer === 'result' && personal) {
      const won = personal.status === 'won';
      if (won) colourPrism(prism, level);
      byId('dialog-title').textContent = won ? 'Задание выполнено' : personal.clock ? 'Время вышло' : personal.repeatRecord ? 'Рекорд не повторён' : 'Рекорд не улучшен';
      byId('dialog-copy').textContent = personalTaskName(personal);
      if (!won && personal.date === localCalendarDay()) button('Повторить', () => playPersonal(personal.key, true));
      button('К заданиям', leavePersonal, !won && personal.date === localCalendarDay());
    } else if (layer === 'result' && daily) {
      colourPrism(prism, level);
      byId('dialog-title').textContent = 'Задача собрана';
      byId('dialog-copy').textContent = dailyLabel(daily.date);
      button(daily.entry === 'books' ? 'К книгам' : 'К календарю', leaveDaily);
    } else if (layer === 'result' && timed) {
      byId('dialog-title').textContent = 'Время вышло';
      byId('dialog-copy').textContent = `Собрано · ${timed.run.cleared} · Рекорд · ${timed.best}`;
      button('Новый заезд', playTimed);
      button('К испытаниям', leaveTimed, true);
    } else if (layer === 'result' && challenge) {
      const won = challenge.status === 'won';
      if (won) colourPrism(prism, level);
      byId('dialog-title').textContent = won ? 'Испытание пройдено' : 'Ходы закончились';
      byId('dialog-copy').textContent = `Ходы · ${challenge.attempt.moves} из ${challenge.moveLimit}`;
      const challengeBack = challenge.book || currentBook() ? 'К книге' : session.state.challengeProgress?.entry === 'progress' ? 'К прогрессу' : 'К испытаниям';
      if (won) button(challengeBack, leaveChallenge);
      else {
        button('Повторить', () => playChallenge(level.id, true, currentBook(), session.state.challengeProgress?.entry));
        button(challengeBack, leaveChallenge, true);
      }
    } else if (layer === 'result') {
      colourPrism(prism, level);
      byId('dialog-title').textContent = own ? 'Проверка пройдена' : 'Собрано';
      const count = attempt?.moves ?? 0, form = new Intl.PluralRules('ru').select(count);
      const word = form === 'one' ? 'ход' : form === 'few' ? 'хода' : 'ходов';
      const assist = attempt?.assisted ? ' · С помощью' : '';
      byId('dialog-copy').textContent = session.state.preferences.statistics ? `${count} ${word}${assist}` : '';
      if (own) {
        button('В редактор', leaveAuthor);
      } else if (currentBook()) {
        const returnButton = button('К книге', leaveBook);
        returnButton.classList.add('result-next');
        returnButton.setAttribute('aria-label', 'К книге');
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
        if (next) {
          const onward = button('Дальше', () => startLevel(next));
          onward.classList.add('result-next');
          onward.setAttribute('aria-label', 'Дальше');
        }
        else byId('dialog-copy').textContent += '\nКампания собрана';
        button('В альбом', () => showMeta({ kind: 'card', levelId: level.id }), !!next);
      }
    } else if (layer === 'restart') {
      byId('dialog-title').textContent = 'Начать заново?';
      byId('dialog-copy').textContent = `«${own || challenge || timed || daily || personal ? level.title : getLevel(restartLevelId ?? level.id).title}» начнётся с исходного поля.`;
      button('Начать заново', () => {
        if (challenge) { playChallenge(level.id, true, currentBook(), session.state.challengeProgress?.entry); return; }
        if (personal) { playPersonal(personal.key, true); return; }
        if (daily) { playDaily(daily.date, true); return; }
        const book = restartReturn === 'settings' ? currentBook() : undefined;
        void run(own ? { kind: 'author-start', workId: own.work.workId, nodeId: own.node.nodeId, attemptId: crypto.randomUUID(), restart: true }
          : { kind: 'restart', levelId: restartLevelId ?? level.id, attemptId: crypto.randomUUID(), ...(book ? { book } : {}) },
          () => { metaHistory = []; layer = 'none'; });
      });
      button('Отмена', cancelRestart, true);
    } else if (layer === 'settings') {
      byId('dialog-title').textContent = 'Пауза';
      button('Продолжить', resumeBoard, true);
      if (attempt && !attempt.completed && !challenge && !timed && !daily && !personal) {
        button('Помощь', () => { layer = 'help-menu'; render(); }, true);
      }
      if (!timed) button('Начать заново', () => askRestart(session.state.activeLevelId), true).id = 'restart';
      button('Настройки', () => { layer = 'preferences'; render(); }, true);
      button(personal ? 'К заданиям' : currentBook() || challenge?.book ? 'К книге' : daily?.entry === 'books' ? 'К книгам' : daily ? 'К календарю'
        : challenge && session.state.challengeProgress?.entry === 'progress' ? 'К прогрессу' : timed || challenge ? 'К испытаниям' : own ? 'В редактор' : 'К уровням',
        leaveBoard, true);
    } else if (layer === 'preferences') {
      byId('dialog-title').textContent = 'Настройки';
      for (const [key, label] of [['sound', 'Звуки'], ['music', 'Музыка'], ['haptics', 'Вибрация'], ['motion', 'Анимации'], ['statistics', 'Статистика уровня']] as const) {
        const row = document.createElement('label'); row.className = 'setting';
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = session.state.preferences[key]; input.disabled = busy || activity.isBlocked();
        input.setAttribute('aria-label', label);
        input.onchange = () => {
          if (key === 'music' && input.checked) music.unlock();
          void run({ kind: 'preferences', key, value: input.checked });
        };
        const title = document.createElement('span'); title.textContent = label;
        const status = document.createElement('small');
        status.textContent = input.checked ? 'Вкл.' : 'Выкл.';
        status.setAttribute('aria-hidden','true');
        row.append(title, status, input); actions.append(row);
      }
      button('Продолжить', resumeBoard, true);
    } else if (layer === 'help-menu') {
      byId('dialog-title').textContent = 'Помощь';
      byId('dialog-copy').textContent = 'Любая помощь даёт отметку «С помощью».';
      const helpAction = (title: string, kind: 'pulse' | 'preview' | 'auto', detail: string, invoke: () => void) => {
        const action = button(title, invoke, true);
        action.classList.add('help-option');
        action.setAttribute('aria-label', kind === 'auto' ? `${title} · ${detail}` : title);
        const example = document.createElement('span');
        example.className = 'help-example'; example.dataset.sample = kind; example.setAttribute('aria-hidden','true');
        for (let index = 0; index < 4; index++) example.append(document.createElement('i'));
        const caption = document.createElement('span'); caption.textContent = title;
        const cost = document.createElement('small'); cost.textContent = detail;
        action.replaceChildren(example, caption, cost);
        const id = `help-cost-${kind}`;
        cost.id = id;
        action.setAttribute('aria-describedby',id);
      };
      helpAction('Показать одну плитку', 'pulse', '0 ходов', () => {
        if (attempt) askHelp({ kind: 'pulse', scanFrom: Math.floor(Math.random() * attempt.board.length) });
      });
      helpAction('Показать готовое поле', 'preview', '0 ходов', () => askHelp({ kind: 'preview' }));
      helpAction('Сделать один обмен', 'auto', `+${AUTO_HELP_COST} хода`, () => askHelp({ kind: 'auto' }));
      button('Отмена', () => { back(); }, true);
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
          } : { sharePuzzle: () => {
            const file = makePuzzleFile(title, authorCard!.work.nodes[authorCard!.nodeId]!);
            if (exportFiles.sharePuzzle) return exportFiles.sharePuzzle(file);
            return exportFiles.canShare(file) ? exportFiles.share(file) : exportFiles.save(file);
          }, edit: () => {
            const draftId = authorCard!.work.draftId, previous = metaHistory.at(-1);
            if (previous?.kind === 'draft' && previous.draftId === draftId) popMeta();
            else showMeta({ kind: 'draft', draftId, nodeId: authorCard!.nodeId });
          } }),
        });
        workCard.update(busy || activity.isBlocked() || !!session.pending);
      } else if (shownAlbum) {
        byId('dialog-title').textContent = 'Альбом';
        renderAlbum(actions, { state: session.state, disabled: busy || activity.isBlocked() || !!session.pending, route: shownAlbum,
          position: albumPositions.get(shownAlbum.tab), navigate: showMeta, back: popMeta, createWork, importPuzzle, importNote,
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
        chosenLevel, play: startLevel, repeat: repeatLevel, playChallenge, playTimed, playDaily, playPersonal, playBook,
        ...(bookInsertion ? { bookInsertion } : {}),
        dailyLoading,
        ...(dailyUnavailable && options.dailySource ? { retryDaily: () => void refreshDaily() } : {}),
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
    syncVictoryActions();
    if (!dialog.open) { lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
    if (menu) {
      for (const node of actions.querySelectorAll<HTMLDetailsElement>('details[data-menu-disclosure]')) {
        node.open = openDisclosures.includes(node.dataset.menuDisclosure);
      }
      dialog.scrollTop = menuScroll;
      const eventDate = metaRoute.kind === 'books' ? metaRoute.eventDate : undefined;
      const selected = eventDate ? actions.querySelector<HTMLButtonElement>(`[data-event-date="${eventDate}"]`)
        : dailyFocus && actions.querySelector<HTMLButtonElement>(`[data-daily-date="${dailyFocus}"]`);
      if (selected && !selected.disabled) {
        selected.focus({ preventScroll: true });
        if (switchMenu) selected.scrollIntoView({ block: 'nearest' });
      } else if (switchMenu) {
        const progressChapter = metaRoute.kind === 'progress' ? metaRoute.chapter : undefined;
        const strip = progressChapter !== undefined ? actions.querySelector<HTMLElement>(`[data-finale="${progressChapter+1}"]`) : undefined;
        if (strip) { strip.focus({ preventScroll: true }); strip.scrollIntoView({ block: 'nearest' }); }
        else dialogTitle.focus({ preventScroll: true });
      }
    }
    if (isPause(layer) && !busy && !activity.isBlocked()) {
      (actions.querySelectorAll<HTMLElement>('button, input')[pauseFocus] ?? actions.querySelector<HTMLElement>('button, input'))?.focus({ preventScroll: true });
    } else if (layer === 'result' && (switchLayer || document.activeElement === dialog)) syncVictoryActions(true);
  }
  function render(): void {
    if (!alive) return;
    const { level, attempt, own, challenge, timed, daily, personal } = current();
    if (!attempt && !session.pending) layer = 'recovery';
    if (layer === 'none' && (challenge && challenge.status !== 'playing' || timed?.run.remainingMs === 0 || personal && personal.status !== 'playing')) layer = 'result';
    const victory = layer === 'result' && attempt?.completed && !timed && challenge?.status !== 'lost' && personal?.status !== 'lost';
    if (!victory || busy || !motionAllowed()) stopVictory();
    root.dataset.victory = dialog.dataset.victory = String(!!victory);
    artwork.show(victory ? level : null);
    setVictoryPhase(victoryPhase);
    root.dataset.level = level.id; root.dataset.moves = String(attempt?.moves ?? 0); root.dataset.busy = String(busy); root.dataset.layer = layer;
    root.dataset.mode = personal ? 'personal' : daily ? 'daily' : timed ? 'timed' : challenge ? 'challenge' : own ? 'author' : 'campaign';
    root.dataset.motion = String(motionAllowed());
    const pausedBoard = isPause(layer) || layer === 'restart' && isPause(restartReturn);
    const hiddenField = layer === 'secret' || pausedBoard && pauseOrigin === 'secret';
    const preview = layer === 'help' || pausedBoard && pauseOrigin === 'help';
    root.style.setProperty('--color-a', hiddenField ? '#392449' : level.solvedTileColors[0]!);
    root.style.setProperty('--color-b', hiddenField ? '#164657' : level.solvedTileColors.at(-1)!);
    byId('levels').textContent = personal ? '‹ Задания' : currentBook() || challenge?.book ? '‹ Книга' : daily?.entry === 'books' ? '‹ Книги'
      : daily ? '‹ Календарь' : timed || challenge ? '‹ Испытания' : own ? '‹ Редактор' : '‹ Уровни';
    byId('title').textContent = personal ? personalTaskName(personal) : daily ? dailyLabel(daily.date) : own || challenge || timed ? level.title : `Уровень ${level.ordinal}`;
    const guidance = byId('guidance');
    guidance.textContent = layer === 'secret' ? '' : personal?.limit !== undefined ? `Ходов осталось · ${personal.limit - personal.attempt.moves}` : challenge ? `Ходов осталось · ${challenge.moveLimit - challenge.attempt.moves}` : layer === 'help' ? 'Готовое поле' : notice || (!own && !session.state.onboarding.firstSwapDone ? 'Поменяй две плитки местами' : '');
    guidance.setAttribute('aria-live', timed || personal?.clock ? 'off' : 'polite');
    guidance.hidden = !timed && !personal?.clock && !guidance.textContent;
    const footerAction = byId<HTMLButtonElement>('help');
    footerAction.hidden = layer !== 'help' && layer !== 'secret' && !attempt?.completed;
    footerAction.textContent = layer === 'secret' ? 'Открыть поле' : layer === 'help' ? 'К игре' : 'Результат';
    for (const node of root.querySelectorAll<HTMLButtonElement>('.hud button,footer button')) node.disabled = busy || activity.isBlocked() || !!session.pending;
    if (attempt) scene.setView(level, attempt, preview, ready && !busy && !activity.isBlocked() && layer === 'none' && !session.pending, hiddenField);
    else scene.setView(level, initialAttempt, false, false);
    const picker = layer === 'meta' && metaRoute.kind === 'chapter' ? metaRoute : null;
    const cardId = selectedWork(), authorCard = selectedAuthorWork();
    const menuBackdrop = layer === 'meta' && (metaRoute.kind === 'album' || isMenuList(metaRoute));
    atmosphere.placeInside(picker || cardId || authorCard || menuBackdrop ? dialog : root);
    const coverId = layer === 'meta' && metaRoute.kind === 'book' ? metaRoute.bookId : undefined;
    const cover = books.find(book => book.id === coverId);
    if (cover) {
      atmosphere.setModel(cover.level, null);
    } else if (picker) {
      const model = picker.chapterMenu === undefined ? levelPreview(session.state, picker.levelId) : null;
      atmosphere.setModel(model?.level ?? null, model?.board ?? null);
    } else if (cardId) {
      atmosphere.setModel(getLevel(cardId), null);
    } else if (authorCard) {
      atmosphere.setModel(authorCard.work.nodes[authorCard.nodeId]!.field, null);
    } else if (layer === 'meta' && metaRoute.kind === 'personal') {
      atmosphere.setModel(personalObjects(session.state, metaRoute.key).selected?.level ?? null, null);
    } else if (layer === 'meta' && metaRoute.kind === 'daily') {
      const { selected } = calendarSelection(session.state, metaRoute.date, metaRoute.month);
      atmosphere.setModel(selected ? session.state.dailyProgress?.slots[selected]?.level ?? null : null, null);
    } else if (menuBackdrop) {
      atmosphere.setModel(null, null);
    } else {
      atmosphere.setModel(hiddenField ? null : level, preview || hiddenField ? null : attempt?.board ?? initialAttempt.board, !hiddenField);
    }
    atmosphere.configure(ready && !activity.isBlocked() && (picker !== null || cardId !== null || authorCard !== null || menuBackdrop || ['none', 'help', 'settings', 'preferences'].includes(layer) || layer === 'result' && victoryPhase === 'approach'), motionAllowed());
    feedback.configure(session.state.preferences, !ready || activity.isBlocked());
    music.configure(ready && !activity.isBlocked() && session.state.preferences.music);
    activity.setGameplayDesired(ready && !busy && layer === 'none' && !attempt?.completed && !activity.isBlocked());
    renderDialog(); paint(); updateTimedClock(); finishImport();
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
    if (busy || session.pending || activity.isBlocked() && action.kind !== 'timed-pause' && action.kind !== 'personal-pause') return false;
    const { attempt: previous, level: previousLevel, timed: timedBefore } = current();
    const origin = currentBook();
    const book = origin && books.find(item => item.id === origin.bookId);
    const unfilled = origin && book && !bookProgress(book, session.state).goals[origin.slot]?.completed;
    const ordinarySwap = action.kind === 'swap' || action.kind === 'author-swap' || action.kind === 'challenge-swap' || action.kind === 'timed-swap' || action.kind === 'daily-swap' || action.kind === 'personal-swap';
    const autoSwap = (action.kind === 'help' || action.kind === 'author-help') && action.assistance?.kind === 'auto';
    const pair = ordinarySwap ? action : autoSwap && previous ? autoHelpSwap(previousLevel, previous) : null;
    const cost = autoSwap ? AUTO_HELP_COST : 1;
    const foreground = foregroundEpoch;
    let swapAccepted = false, succeeded = false, saved = false;
    busy = true; render();
    try {
      const changed = await session.act(action);
      if (!alive) return false;
      succeeded = true;
      if (changed) {
        saved = true;
        notice = '';
        if (pair) clearMark();
        if (origin && book && unfilled && bookProgress(book, session.state).goals[origin.slot]?.completed) newlyFilled = origin;
        after?.();
        if ((pair || action.kind === 'timed-expire' || action.kind === 'timed-pause' || action.kind === 'personal-expire' || action.kind === 'personal-pause') && gameLayer() === 'result') layer = 'result';
        swapAccepted = pair !== null;
      }
    } catch {
      notice = session.pending ? 'Не удалось подтвердить сохранение.' : 'Поле изменилось в другом окне. Повтори действие.';
      if (session.pending && !editorView) layer = 'recovery';
    } finally {
      busy = false;
      const { level, attempt: next, timed, personal, challenge } = current();
      const eligible = swapAccepted && !activity.isBlocked() && foreground === foregroundEpoch;
      const acceptedPair = eligible && pair && previous && next && previous.attemptId === next.attemptId &&
        next.moves === previous.moves + cost && next.board[pair.from] === previous.board[pair.to] &&
        next.board[pair.to] === previous.board[pair.from] ? pair : null;
      const won = !!(acceptedPair && next?.completed && !timed && challenge?.status !== 'lost' && personal?.status !== 'lost');
      if (won && motionAllowed()) {
        for (const key of heldActivation) blockedActivation.add(key);
        setVictoryPhase('approach');
      }
      render(); resize();
      if (saved && action.kind === 'preferences' && action.value && foreground === foregroundEpoch
          && (action.key === 'sound' || action.key === 'haptics')) feedback.sample(action.key);
      if (eligible && timedBefore && timed?.run.cleared === timedBefore.run.cleared + 1) feedback.accepted('win');
      if (acceptedPair && previous && next) {
        scene.presentSwap(previous, next, acceptedPair.from, acceptedPair.to, motionAllowed(), cost);
        if (won && victoryPhase === 'approach') {
          scene.presentVictory(acceptedPair.to, (elapsed, board) => {
            if (elapsed < LANDING_MS) {
              if (elapsed >= LIFT_START_MS) root.style.setProperty('--victory-chrome', String(victoryChromeOpacity(elapsed)));
              return;
            }
            const age = elapsed - LANDING_MS;
            if (victoryPhase === 'approach') {
              const outer = root.getBoundingClientRect(), inner = region.getBoundingClientRect();
              artwork.start(level, { ...board, x: board.x + inner.x - outer.x, y: board.y + inner.y - outer.y });
              setVictoryPhase('landed');
              atmosphere.configure(false, motionAllowed());
              feedback.accepted('win');
            }
            const reveal = (age - RESULT_REVEAL_AT_MS) / RESULT_REVEAL_MS;
            if (reveal >= 1) { stopVictory(); return; }
            artwork.frame(age);
            if (reveal < 0) return;
            if (victoryPhase === 'landed') setVictoryPhase('reveal');
            dialog.style.setProperty('--victory-opacity', String(ease(amount(reveal))));
          });
        } else if (won) feedback.accepted('win');
        else {
          const cell = scene.boardCell(acceptedPair.to);
          atmosphere.accepted(atmospherePoint({ ...cellCenter(cell), color: level.solvedTileColors[next.board[acceptedPair.to]!]! }));
          feedback.accepted('swap');
        }
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
    if (victoryWaiting()) { stopVictory(); return true; }
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
    if (layer === 'help-menu' || layer === 'preferences') { layer = 'settings'; render(); return true; }
    if (layer === 'settings') { resumeBoard(); return true; }
    if ((layer === 'result' || layer === 'none') && current().personal) { leavePersonal(); return true; }
    if ((layer === 'result' || layer === 'none') && current().daily) { leaveDaily(); return true; }
    if ((layer === 'result' || layer === 'none') && current().timed) { leaveTimed(); return true; }
    if ((layer === 'result' || layer === 'none') && currentBook()) { leaveBook(); return true; }
    if ((layer === 'result' || layer === 'none') && current().challenge) { leaveChallenge(); return true; }
    if (layer !== 'none') { layer = 'none'; render(); return true; }
    if (current().own) { leaveAuthor(); return true; }
    return false;
  };
  const unlockMusic = () => { if (session.state.preferences.music && !activity.isBlocked()) music.unlock(); };
  root.addEventListener('pointerdown', unlockMusic, { signal: listeners.signal, capture: true });
  root.addEventListener('keydown', unlockMusic, { signal: listeners.signal, capture: true });
  byId('help').addEventListener('click', () => {
    if (layer === 'help' || layer === 'secret') { layer = 'none'; render(); return; }
    if (current().attempt?.completed) { layer = 'result'; render(); }
  }, { signal: listeners.signal });
  function leaveBoard(): void {
    if (current().personal) leavePersonal();
    else if (current().daily) leaveDaily();
    else if (current().timed) leaveTimed();
    else if (currentBook()) leaveBook();
    else if (current().challenge) leaveChallenge();
    else if (current().own) leaveAuthor();
    else showMeta({ kind: 'chapter', levelId: session.state.activeLevelId });
  }
  byId('levels').addEventListener('click', leaveBoard, { signal: listeners.signal });
  actions.addEventListener('focusin', event => {
    if (isPause(layer)) pauseFocus = [...actions.querySelectorAll('button, input')].indexOf(event.target as HTMLElement);
    if (layer === 'meta' && metaRoute.kind === 'daily') dailyFocus = (event.target as HTMLElement).dataset.dailyDate;
  }, { signal: listeners.signal });
  actions.addEventListener('keydown', event => {
    if (!isPause(layer) || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const entries = [...actions.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (!entries.length) return;
    const index = entries.indexOf(document.activeElement as HTMLElement);
    entries[(index + (event.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length]?.focus();
    event.preventDefault();
  }, { signal: listeners.signal });
  function resumeBoard(): void { layer = pauseOrigin; pauseOrigin = 'none'; render(); }
  byId('settings').addEventListener('click', () => {
    scene.cancel(); clearMark();
    pauseOrigin = layer === 'secret' || layer === 'help' ? layer : 'none';
    layer = 'settings'; render();
  }, { signal: listeners.signal });
  systemMotion.addEventListener('change', () => { scene.cancel(); if (!motionAllowed()) { finishInsertion(); printAnimation?.cancel(); } render(); }, { signal: listeners.signal });
  dialog.tabIndex = -1;
  const ignoreInput = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  dialog.addEventListener('pointerdown', event => {
    if (victoryWaiting()) earlyPointers.add(event.pointerId);
    else earlyPointers.delete(event.pointerId);
  }, { signal: listeners.signal, capture: true });
  dialog.addEventListener('click', event => {
    if (victoryWaiting() || event instanceof PointerEvent && earlyPointers.has(event.pointerId)) ignoreInput(event);
  }, { signal: listeners.signal, capture: true });
  const activationKey = (event: KeyboardEvent) => ['Enter', ' '].includes(event.key);
  window.addEventListener('keydown', event => {
    if (activationKey(event)) {
      const key = event.code || event.key;
      heldActivation.add(key);
      if (layer === 'result' && (victoryWaiting() || event.repeat || blockedActivation.has(key))) {
        blockedActivation.add(key);
        ignoreInput(event);
      }
    } else if (victoryWaiting() && event.key === 'Tab') ignoreInput(event);
  }, { signal: listeners.signal, capture: true });
  window.addEventListener('keyup', event => {
    if (!activationKey(event)) return;
    const key = event.code || event.key;
    heldActivation.delete(key);
    if (blockedActivation.delete(key) && layer === 'result') ignoreInput(event);
  }, { signal: listeners.signal, capture: true });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!back()) { layer = 'none'; render(); } }, { signal: listeners.signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && layer === 'help' && !busy) { event.preventDefault(); layer = 'none'; render(); }
  }, { signal: listeners.signal });
  const observer = new ResizeObserver(resize); observer.observe(region);
  window.addEventListener('resize', resize, { signal: listeners.signal });
  window.addEventListener('pagehide', () => {
    const timer = activeClock();
    if (timer?.startedAt != null && timer.remainingMs > 0) {
      checkpointClock(timer.remainingMs - timedRemaining(timer, pauseRequestedAt ?? clockNow()), true);
    }
  }, { signal: listeners.signal });
  window.addEventListener('focus', () => {
    if (busy || session.pending || !ready) return;
    busy = true;
    void session.load().then(() => { if (!current().attempt) layer = 'recovery'; }).catch(() => { layer = 'recovery'; })
      .finally(() => { busy = false; render(); });
  }, { signal: listeners.signal });
  const unblock = activity.onBlockedChange(blocked => {
    if (blocked) {
      finishInsertion();
      printAnimation?.cancel();
      foregroundEpoch++;
      heldActivation.clear();
      blockedActivation.clear();
      earlyPointers.clear();
      pendingHelp = null;
      clearMark();
      scene.cancel();
      if (layer === 'help') layer = 'none';
      if (pauseOrigin === 'help') pauseOrigin = 'none';
      game.sound.mute = true;
      if (game.isBooted) game.loop.sleep();
    }
    else { game.sound.mute = false; resize(); }
    render();
  });
  const clockTicker = setInterval(updateTimedClock, 200);
  const personalTicker = setInterval(() => {
    if (ready && !busy && !activity.isBlocked() && !session.pending && layer === 'meta' && metaRoute.kind === 'personal' &&
        session.state.personalProgress?.day !== localCalendarDay()) void issuePersonal();
  }, 1000);
  await frame; ready = true; render(); resize();
  return { back, destroy() { alive = false; printAnimation?.cancel(); clearTimeout(insertionTimer); clearInterval(clockTicker); clearInterval(personalTicker); clearMark(); editorView?.destroy(); workCard?.destroy(); stopVictory(); exportFiles.destroy?.(); listeners.abort(); observer.disconnect(); unblock(); atmosphere.destroy(); feedback.destroy(); music.destroy(); activity.setGameplayDesired(false); store.close(); destroyRenderer(game); } };
}
