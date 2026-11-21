import { Capacitor } from '@capacitor/core';
import { StartupTimeline } from '@danilah/mini-games-kit/startup';
import { createPlatform } from './app/platform';
import { openIndexedDb } from './local-store/indexed-db';
import { mountGame } from './game/mountGame';

const startup = new StartupTimeline<'hostReady' | 'storageReady' | 'firstFrame' | 'ready'>();
const cover = document.querySelector<HTMLElement>('#startup')!;
let app: Awaited<ReturnType<typeof mountGame>> | undefined;
let removeDebug = () => {};
if (typeof globalThis.ResizeObserver !== 'function' || typeof globalThis.crypto?.randomUUID !== 'function' ||
    !globalThis.crypto.subtle || typeof globalThis.HTMLDialogElement?.prototype.showModal !== 'function') {
  cover.textContent = 'Нужен более новый Android System WebView или браузер. Обнови его и открой игру снова.';
  document.documentElement.dataset.state = 'incompatible';
} else {
  await start();
}

async function start(): Promise<void> {
  // The pinned audio helper uses this ES2022 method even on supported Chromium 92.
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: (value: object, property: PropertyKey) => Object.prototype.hasOwnProperty.call(value, property),
      configurable: true,
      writable: true,
    });
  }
  const platform = createPlatform(() => app?.back() ?? false);
  try {
    startup.mark('hostReady');
    const store = Capacitor.isNativePlatform()
      ? (await import('./local-store/native')).openNativeStore()
      : await openIndexedDb();
    startup.mark('storageReady');
    const feedback = Capacitor.isNativePlatform() ? { haptic: (await import('./app/nativeFeedback')).nativeHaptic, exportFiles: (await import('./app/nativeExport')).nativeExportFiles } : {};
    app = await mountGame(document.querySelector<HTMLElement>('#game-root')!, store, platform.activity, feedback);
    startup.mark('firstFrame');
    cover.hidden = true;
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    startup.mark('ready'); document.documentElement.dataset.state = 'ready';
    if (import.meta.env.DEV) {
      const { installDebug } = await import('./app/debug');
      removeDebug = installDebug(() => startup.snapshot({ toReady: ['start', 'ready'], toFrame: ['start', 'firstFrame'] }));
    }
    const destroy = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      window.removeEventListener('pagehide', destroy); removeDebug(); app?.destroy(); platform.destroy();
    };
    window.addEventListener('pagehide', destroy);
  } catch {
    platform.destroy(); cover.replaceChildren();
    const message = document.createElement('p'); message.textContent = 'Не удалось открыть сохранение. Данные сохранены; попробуй ещё раз.';
    const retry = document.createElement('button'); retry.textContent = 'Повторить'; retry.onclick = () => location.reload();
    cover.append(message, retry); cover.hidden = false;
  }
}
