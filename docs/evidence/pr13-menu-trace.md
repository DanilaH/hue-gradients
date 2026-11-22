# Проверка игровых меню из PR №13

[Аудит 0.4.41](https://github.com/DanilaH/hue-gradients/blob/6191b1a78e88731f547b087bbfbede227339b013/docs/audits/menu-0.4.41/README.md) воспроизвёл пять расхождений. Ниже обновлённая браузерная приёмка 0.4.42.

[Исходное задание и основания сверки](https://github.com/DanilaH/hue-gradients/pull/13) · [очередь](../porting/DELIVERY_QUEUE.md#игровые-меню--pr-13) · [реестр переноса](../porting/ADOPTION_LEDGER.json).

| sourceFeatureId | Состояние | Связь с оригиналом | Проверено |
|---|---|---|---|
| poluson-book-sockets | MATCH | mt-m01, mt-m04 | [0.4.36. Гнездо 006, вложение и запуск при 4/4](pr13-book-006.json). |
| poluson-book-goal-return | MATCH | h1-local-resume | [Книга при возврате с результата, паузы и после перезапуска](pr13-book-006.json). |
| poluson-personal-objects | MATCH | h2-daily-past, h2-daily-present, h2-daily-future, h2-daily-history | [«Личные задания» при 390×740 показаны на свежем профиле и после 001. Выбранный предмет крупнее, подписи видны до выбора. Художественная итерация ожидает просмотра.](pr14-menu-0.4.42.json) [0.4.43. Тапы по фону, предмету и подписи. Три предмета при 320×568 и тексте 150%.](pr14-personal-follow-up-0.4.43.json) |
| poluson-daily-month | MATCH | — | [0.4.38. Два месяца, миниатюра архивной работы и кэш после 503](pr13-calendar.json). Общий endpoint в ожидании. |
| poluson-dated-event-return | MATCH | mt-m05 | [Дата 21 ноября удерживает источник после офлайн-перезапуска и рестарта. Из паузы и победы восстанавливается фокус карточки в книгах или выбранного дня в календаре.](pr14-menu-0.4.42.json) |
| poluson-chapter-strips | MATCH | h1-unlock, h2-boss | [0.4.39. 10/15, 15/15 и возврат к финалу главы](pr13-chapters.json). |
| poluson-level-object | MATCH | h1-local-resume, cp-fixed-start | [Свайп 005 → 006 и отдельный запуск выбранной попытки](pr13-chapters.json). |
| poluson-challenge-demo | MATCH | cp-challenge, cp-timed, h2-shape-swap | [Два одинаково ориентированных треугольника меняются местами. У противоположной ориентации другой контур и обмен отклоняется. Сохранение при обеих пробах совпало.](pr14-menu-0.4.42.json) |
| poluson-timed-entry | MATCH | cp-timed | [0.4.41. Очередной заезд стартует из результата. Возврат сохраняет вкладку](pr13-service.json). |
| poluson-progress-finale-entry | MATCH | h2-boss | [Победа возвращает к той же полосе «Прогресса»](pr13-chapters.json). |
| poluson-print-expand | MATCH | mt-m02 | [Отпечаток разворачивается в большую работу и сворачивается в ту же ячейку](pr13-album.json). |
| poluson-album-print-return | MATCH | mt-m01 | [0.4.40. Сохранение 019 с возвратом к позиции и фокусу](pr13-album.json). |
| poluson-single-wallpaper | MATCH | cp-wallpaper, cp-share | [Размер и все пиксели PNG проверены отдельно](pr13-album.json). |
| poluson-editor-canvas | MATCH | cp-editor, cp-author-proof | [Цвет и опора, авторская проверка, экспорт и повторный импорт](pr13-album.json). |
| poluson-help-samples | MATCH | cp-pulse-hint, cp-preview, h2-auto-hint | [0.4.41. Показ, отмена и применение за три хода](pr13-service.json). |
| poluson-angular-ui | MATCH | — | [Непрозрачность фона и элемента 1 у гнезда и подписей предметов. Проверены фокус, нажатие и отключённое состояние.](pr14-menu-0.4.42.json) |
| poluson-preference-sample | PARTIAL | h1-music, h1-audio | [Изолированные звук и API-вызов вибрации](pr13-service.json). Проверить ощущение на телефоне. |
| poluson-loss-retry | MATCH | cp-challenge, cp-timed | [Повтор в пределах даты сохраняет цель и создаёт свежую попытку. Вчерашний экран возвращает к актуальным заданиям и сохраняет историю.](pr14-menu-0.4.42.json) |
| poluson-tile-dither | MATCH | — | [Контрольный дубль 006 на V1.4](pr13-book-006.json). |
| poluson-win-landing | MATCH | — | [Последняя посадка синхронна с ударом](pr13-book-006.json). |
| poluson-color-burst-recoil | MATCH | — | [006 и прежняя проверка 13×13](v14-dreamy-psx-2026-11-22.json). |
| poluson-paint-spray | MATCH | — | [006, цветовая волна до проявления команд](pr13-book-006.json). |
| poluson-result-reveal | MATCH | — | [001 и 006 записаны в 1×. В кадрах победы кнопка HUD скрыта. Команды диалога доступны после раскрытия. Звук посадки один.](pr14-menu-0.4.42.json) |
| poluson-phone-feel | UNKNOWN | — | Проверить APK на Android, попадание пальцем на близких оттенках, вибрацию и системный Back. |

KIT IMPACT — REUSE. Пины и границы хостов сохранены. Код и записи проверены в Chromium. Боевой источник дат, системный выбор файлов и физический Android ждут отдельной проверки.
