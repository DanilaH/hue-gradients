# Полусон / hue-gradients

Цветовая головоломка для Android/RuStore и Яндекс Игр. «Полусон» — рабочее название.

Сейчас доступен внутренний игровой срез M1: 15 неизменяемых уровней, tap–tap/drag/клавиатура, помощь, повторы, результаты и локальное транзакционное сохранение. Android использует SQLite, браузер — IndexedDB. Полный первый релиз по ТЗ ещё не готов; M2 теперь имеет исполняемый срез с живым фоном, звуком и призмой победы, художественная приёмка ещё не проводилась.

Перед продолжением читать [AGENTS.md](AGENTS.md), [состояние](docs/STATUS.md) и [точку продолжения](docs/SESSION_HANDOFF.md). Исходное ТЗ сохранено в [docs/spec](docs/spec/START_HERE.md), план — [ROADMAP_1_0.md](docs/spec/ROADMAP_1_0.md).

## Разработка

Node 24+. Приватный mini-games-kit закреплён в package.json/kit-pins.json; доступ к нему нужен для установки. Не обновлять pin незаметно.

```sh
npm install
npm run dev
npm run dev:yandex
npm run check
npm run yandex:check
npm run spec:check
```

Браузерные сценарии требуют Playwright и Chromium:

```sh
npm run test:browser
node tools/yandex-browser-check.mjs
```

Оба скрипта запускают собственный Vite. `CHROMIUM_PATH` задаёт путь к Chromium; в Codex можно использовать headless shell. Тесты SDK локальные, не заменяют загрузку на Яндекс Игры.

Android: [BOOTSTRAP.md](BOOTSTRAP.md), `npm run android:sync:release`, затем Gradle debug/releaseCheck и проверка точного APK. releaseCheck подписывается тестовым ключом. Production signer и публикация не настроены.

## Проверки и ограничения

33 unit-теста, 20 браузерных сценариев с настоящим IndexedDB, 9 проверок presentation и 6 локальных SDK-сценариев, платформенные сборки и проверка R8/APK. Физический Android, native SQLite runtime, hosted SDK, cloud и live ads ещё не приняты. [Внешние условия](docs/M0_GATES.md).
