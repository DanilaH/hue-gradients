# ХУЕ / «Полусон»
Цветовая головоломка для Android/RuStore и Яндекс Игр. «Полусон» — рабочее название.
Реализация по [ТЗ 1.0](docs/spec/PRODUCT_SPEC_1_0.md) и [роудмапе M0–M8](docs/spec/ROADMAP_1_0.md). [Статус](docs/STATUS.md), [handoff](docs/SESSION_HANDOFF.md).

Сейчас подготовлены два технических host-scaffold и чистое ядро первых15 задач. Экран с тестовым счётчиком проверяет host; это ещё не игровая сборка. Полный релиз включает кампанию, мету, daily/архив, редактор, экспорт и облако.

## Подготовка
Node24, JDK21, Android SDK36/build-tools36.0.0. Runtime/guidance закреплены отдельно в [kit-pins.json](kit-pins.json). Kit приватный; нужен авторизованный доступ к закреплённому SHA.

```sh
npm install
npm run check
npm run yandex:check
npm run android:sync:release
cd native/android
./gradlew --no-daemon assembleDebug assembleReleaseCheck
```

Локально разрешён проверенный npm pack точного kit checkout, установленный через `npm install --no-save --package-lock=false <tgz>`; committed pin не меняется. CI использует KIT_READ_TOKEN с доступом только к чтению mini-games-kit; token не сохраняется в git/npm config.

Android preview: `npm run dev`; Yandex local mock: `npm run dev:yandex`. Native output:dist/; Yandex upload-root:dist-yandex/. releaseCheck имеет тестовую подпись; production требует настроенной сохранённой подписи и публичного certificate pin.

Все71 строки production-приёмки пока NOT RUN. Компиляция не заменяет телефон, hosted SDK, облако, реальную авторизацию/рекламу и художественную приёмку.
