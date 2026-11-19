# Полусон / hue-gradients

Цветовая головоломка для Android/RuStore и Яндекс Игр. «Полусон» — рабочее название.

Внутренняя сборка 0.4.1: 60 кандидатных уровней с неизменными первыми 15, главы, альбом, редактор с историей версий и авторским прохождением, PNG-экспорт с выбором работ и сохранением/отправкой. Android использует SQLite, браузер — IndexedDB. Полный первый релиз по ТЗ ещё не готов. Живой фон, звук и призма победы доступны для просмотра; художественная и телефонная приёмка остаются открытыми.

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
npm run test:export
node tools/yandex-browser-check.mjs
```

Скрипты запускают собственный Vite. `CHROMIUM_PATH` задаёт путь к Chromium; в Codex можно использовать headless shell. Для независимой проверки PNG нужен Python с зависимостями из tools/requirements-test.txt. Тесты SDK локальные, не заменяют загрузку на Яндекс Игры.

Android: [BOOTSTRAP.md](BOOTSTRAP.md), `npm run android:sync:release`, затем Gradle debug/releaseCheck и проверка точного APK. releaseCheck подписывается тестовым ключом. Production signer и публикация не настроены.

## Проверки и ограничения

149 unit-тестов, 75 браузерных сценариев, независимая проверка каждого пикселя плиток в восьми PNG, платформенные сборки и проверка R8/APK. Среди проверок редактора — все 33 независимых fixture из ТЗ, два настоящих окна, сбой записи и восстановление формы. Физический Android, native SQLite/save/share runtime, hosted SDK, cloud и live ads ещё не приняты. [Внешние условия](docs/M0_GATES.md).

M3: главы за 10/15, полные страницы за 15/15, альбом и рекорды. M4: редактор, версии, авторская проверка без наград кампании; чистый PNG, шесть макетов и страница главы. Три daily-макета остаются закрытыми до настоящих ежедневных задач M6. [Редактор](docs/M4_EDITOR_IMPLEMENTATION.md) · [экспорт и ограничения](docs/M4_EXPORT_IMPLEMENTATION.md). Облачные сохранения и синхронизация отложены по решению владельца. Дальше — локальная часть ежедневных задач/архива и доводка игры; опубликованный общий календарь пока не настроен.
