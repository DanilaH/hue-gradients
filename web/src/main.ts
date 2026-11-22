import { createStartupPreloadDomView, StartupPreloadController } from '@danilah/mini-games-kit/startup';
import { mountGame } from '../../src/game/mountGame';
import { configuredDailySource } from '../../src/app/dailyCatalog';
import { openIndexedDb } from '../../src/local-store/indexed-db';
import { createPlatformRuntime } from './app/platform';
import { installDebugPanel } from './app/debug';
import { afterPaintFrames, getStartupSnapshot, startupTimeline } from './app/startup';

const preload = new StartupPreloadController(createStartupPreloadDomView());
preload.begin();
const platform = createPlatformRuntime();
try {
  startupTimeline.mark('platformReady');
  const store = await openIndexedDb();
  const dailySource = configuredDailySource(import.meta.env.VITE_DAILY_PUBLICATION_URL);
  const app = await mountGame(document.querySelector<HTMLElement>('#game-root')!, store, platform.activity,
    dailySource ? { dailySource } : {});
  startupTimeline.mark('gamePresentable');
  await afterPaintFrames(2);
  startupTimeline.mark('ready'); platform.markReady(); preload.complete();
  document.documentElement.dataset.state = 'ready';
  const debug = installDebugPanel(() => getStartupSnapshot('webp'));
  const destroy = (event: PageTransitionEvent) => {
    if (event.persisted) return;
    window.removeEventListener('pagehide', destroy); debug.destroy(); app.destroy(); preload.destroy(); platform.destroy();
  };
  window.addEventListener('pagehide', destroy);
} catch {
  platform.destroy(); preload.fail('Не удалось открыть сохранение. Данные сохранены.');
  const retry = document.createElement('button'); retry.textContent = 'Повторить'; retry.onclick = () => location.reload();
  document.querySelector('#startup-preload .startup-card')?.append(retry);
}
