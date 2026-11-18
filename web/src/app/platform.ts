import { GameplayActivityCoordinator, installDocumentVisibilityBlocker } from '@danilah/mini-games-kit/platform';
import { loadYandexGamesGlobal, type YandexPlatformSdk } from '@danilah/mini-games-kit/yandex';

/** Local play is available before SDK, identity, safeStorage or ads resolve. */
export function createPlatformRuntime() {
  let sdk: YandexPlatformSdk | undefined, disposed = false, ready = false, readySent = false, gameplay = false;
  const safe = (action: () => void) => { try { action(); } catch { /* Optional SDK cannot reject a local action. */ } };
  const activity = new GameplayActivityCoordinator(
    () => { gameplay = true; safe(() => sdk?.features.GameplayAPI?.start()); },
    () => { gameplay = false; safe(() => sdk?.features.GameplayAPI?.stop()); },
  );
  const visibility = installDocumentVisibilityBlocker(activity);
  const pause = () => activity.setBlocked('yandex-pause', true);
  const resume = () => activity.setBlocked('yandex-pause', false);
  const sendReady = () => {
    if (!ready || !sdk || readySent || disposed) return;
    safe(() => { sdk!.features.LoadingAPI?.ready(); readySent = true; });
  };
  if (import.meta.env.VITE_PLATFORM === 'yandex') {
    void loadYandexGamesGlobal().then(global => global.init()).then(value => {
      if (disposed) return;
      sdk = value; sdk.on('game_api_pause', pause); sdk.on('game_api_resume', resume);
      sendReady();
      if (gameplay) safe(() => sdk!.features.GameplayAPI?.start());
    }).catch(() => { /* Offline/local core keeps running. */ });
  }
  return { activity, markReady() { ready = true; sendReady(); }, destroy() {
    disposed = true; activity.setGameplayDesired(false); visibility();
    if (sdk) { sdk.off('game_api_pause', pause); sdk.off('game_api_resume', resume); }
  } };
}
