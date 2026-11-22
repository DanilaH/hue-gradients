# Проверка игровых меню из PR №13

[Независимая приёмка 0.4.41](../audits/menu-0.4.41/README.md) уточняет статусы ниже на дополнительных маршрутах итоговой сборки.

[Исходное задание и основания сверки](https://github.com/DanilaH/hue-gradients/pull/13) · [очередь](../porting/DELIVERY_QUEUE.md#игровые-меню--pr-13) · [реестр переноса](../porting/ADOPTION_LEDGER.json).

| sourceFeatureId | Состояние | Связь с оригиналом | Проверено |
|---|---|---|---|
| poluson-book-sockets | MATCH | mt-m01, mt-m04 | [0.4.36. Гнездо 006, вложение и запуск при 4/4](pr13-book-006.json). |
| poluson-book-goal-return | MATCH | h1-local-resume | [Книга при возврате с результата, паузы и после перезапуска](pr13-book-006.json). |
| poluson-personal-objects | MATCH | h2-daily-past, h2-daily-present, h2-daily-future, h2-daily-history | [0.4.37. Выбор предмета, точный лимит, остаток и возврат](pr13-personal.json). |
| poluson-daily-month | MATCH | — | [0.4.38. Два месяца, миниатюра архивной работы и кэш после 503](pr13-calendar.json). Общий endpoint в ожидании. |
| poluson-dated-event-return | PARTIAL | mt-m05 | [Два источника, один слот; возврат с сохранённым фокусом](pr13-calendar.json). |
| poluson-chapter-strips | MATCH | h1-unlock, h2-boss | [0.4.39. 10/15, 15/15 и возврат к финалу главы](pr13-chapters.json). |
| poluson-level-object | MATCH | h1-local-resume, cp-fixed-start | [Свайп 005 → 006 и отдельный запуск выбранной попытки](pr13-chapters.json). |
| poluson-challenge-demo | PARTIAL | cp-challenge, cp-timed, h2-shape-swap | [Разрешённая и отвергнутая пары в пробе форм не изменили сохранение](pr13-chapters.json). |
| poluson-timed-entry | MATCH | cp-timed | [0.4.41. Очередной заезд стартует из результата. Возврат сохраняет вкладку](pr13-service.json). |
| poluson-progress-finale-entry | MATCH | h2-boss | [Победа возвращает к той же полосе «Прогресса»](pr13-chapters.json). |
| poluson-print-expand | MATCH | mt-m02 | [Отпечаток разворачивается в большую работу и сворачивается в ту же ячейку](pr13-album.json). |
| poluson-album-print-return | MATCH | mt-m01 | [0.4.40. Сохранение 019 с возвратом к позиции и фокусу](pr13-album.json). |
| poluson-single-wallpaper | MATCH | cp-wallpaper, cp-share | [Размер и все пиксели PNG проверены отдельно](pr13-album.json). |
| poluson-editor-canvas | MATCH | cp-editor, cp-author-proof | [Цвет и опора, авторская проверка, экспорт и повторный импорт](pr13-album.json). |
| poluson-help-samples | MATCH | cp-pulse-hint, cp-preview, h2-auto-hint | [0.4.41. Показ, отмена и применение за три хода](pr13-service.json). |
| poluson-angular-ui | PARTIAL | — | [Пауза оставляет видимой доску. Выбор, рестарт и отмена](pr13-service.json). |
| poluson-preference-sample | PARTIAL | h1-music, h1-audio | [Изолированные звук и API-вызов вибрации](pr13-service.json). Проверить ощущение на телефоне. |
| poluson-loss-retry | PARTIAL | cp-challenge, cp-timed | [Новая серия из результата и повтор неподтверждённой записи](pr13-service.json). |
| poluson-tile-dither | MATCH | — | [Контрольный дубль 006 на V1.4](pr13-book-006.json). |
| poluson-win-landing | MATCH | — | [Последняя посадка синхронна с ударом](pr13-book-006.json). |
| poluson-color-burst-recoil | MATCH | — | [006 и прежняя проверка 13×13](v14-dreamy-psx-2026-11-22.json). |
| poluson-paint-spray | MATCH | — | [006, цветовая волна до проявления команд](pr13-book-006.json). |
| poluson-result-reveal | PARTIAL | — | [006, готовность после проявления и блокировка раннего ввода](pr13-book-006.json). |
| poluson-phone-feel | UNKNOWN | — | Проверить APK на Android, попадание пальцем на близких оттенках, вибрацию и системный Back. |

KIT IMPACT — REUSE. Пины и границы хостов сохранены. Код и записи проверены в Chromium. Боевой источник дат, системный выбор файлов и физический Android ждут отдельной проверки.
