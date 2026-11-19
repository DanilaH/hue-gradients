# Полусон / hue-gradients

Цветовая головоломка для Android/RuStore и Яндекс Игр. «Полусон» — рабочее название.

Внутренняя сборка 0.4.0: 60 кандидатных уровней с неизменными первыми 15, главы, альбом, рекорды и редактор своих композиций с историей версий и авторским прохождением. Android использует SQLite, браузер — IndexedDB. Полный первый релиз по ТЗ ещё не готов. Живой фон, звук и призма победы доступны для просмотра; художественная и телефонная приёмка остаются открытыми.

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
npm run test:editor
node tools/yandex-browser-check.mjs
```

Скрипты запускают собственный Vite. `CHROMIUM_PATH` задаёт путь к Chromium; в Codex можно использовать headless shell. Тесты SDK локальные, не заменяют загрузку на Яндекс Игры.

Android: [BOOTSTRAP.md](BOOTSTRAP.md), `npm run android:sync:release`, затем Gradle debug/releaseCheck и проверка точного APK. releaseCheck подписывается тестовым ключом. Production signer и публикация не настроены.

## Проверки и ограничения

142 unit-теста, 66 браузерных сценариев, платформенные сборки и проверка R8/APK. Среди проверок редактора — все 33 независимых fixture из ТЗ, два настоящих окна, сбой записи и восстановление формы. Физический Android, native SQLite runtime, hosted SDK, cloud и live ads ещё не приняты. [Внешние условия](docs/M0_GATES.md).

M3: главы за 10/15, полные страницы за 15/15, альбом и отдельные рекорды. M4a: размер, палитра, закрепления, фиксированный старт, сохранённые предпросмотры, неизменяемые версии и авторская проверка без наград кампании. Следующая часть M4 — PNG-экспорт и системное сохранение/отправка; renderer пока не готов. [Подробности редактора](docs/M4_EDITOR_IMPLEMENTATION.md).
