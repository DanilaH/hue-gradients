# ХУЕ — матрица приёмки 1.0

**71 обязательное требование [PRODUCT_SPEC](PRODUCT_SPEC_1_0.md).** Эта таблица — план будущей приёмки, не протокол уже пройденного релиза. Исходный статус всех строк: **NOT RUN в production consumer**. Исторические модели и ограниченная браузерная проба учитываются как входные свидетельства, но не подменяют указанный ниже тест.

Для каждой строки после исполнения записать: status PASS/FAIL/BLOCKED, commit и build, content/rules/schema/policy versions по применимости, platform/device/OS, входные данные, expected/actual, ссылку на тест/видео/log с удалёнными секретами. N/A возможен только для неприменимого платформенного механизма с объяснением; обязательная функция от этого не исчезает. BLOCKED не равен PASS.

## Игровое ядро

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| CORE-01 | M1 | Загрузить все первые 15 и replay одного старта дважды; подать неверный ID/hash | Одни определения/старты и точная победа по ID; несовместимое поле отклонено без потери профиля |
| CORE-02 | M1 | Swap двух верных movable; выбранная→она же; pin; outside | Любые два movable меняются и +1; все no-op/cancel +0, опоры неизменны |
| CORE-03 | M1 | Tap A→B, A→A, A→pin, A→пусто | Обмен только A→B; остальные снимают выбор, первое объяснение pin однократно |
| CORE-04 | M1/M7 | Быстрый move→up с другой конечной точкой; два пальца; потеря capture; край; resize/background | Последняя точка up определяет drop; отмена/старый pointer не меняют модель; запись трёх эпизодов touch |
| CORE-05 | M1 | Медленный/failing commit и новый жест до конца settle | Press сразу, pending виден; модель подтверждается один раз; декоративный tween не теряет следующий ввод |
| CORE-06 | M1 | Ошибка записи перед help; двойной tap; Back/background; resume | При ошибке решение не раскрыто; assist записан один раз за открытие; поле/ходы восстановлены, assist не сброшен |
| CORE-07 | M1 | Последний ход; kill до/после commit; повтор callback; restart app | Либо прежняя партия, либо одна сохранённая победа с правами; нет половины состояния/двойной награды |
| CORE-08 | M1 | Независимые cycles/BFS fixtures; assisted быстрее clean; изменение rules/fingerprint | Минимум совпадает с независимым oracle; best разделены, несопоставимые результаты не смешаны |
| CORE-09 | M1/M7 | Back/modal/restart cancel; force-stop; сохранённая победа | Последний подтверждённый ход возвращается; отмена restart ничего не меняет; ephemeral UI не воскресает |
| CORE-10 | M1 | Первый запуск→swap→kill→возврат→replay; открыть правила вручную | Освоенные шаги не повторяются автоматически; флаг соответствует подтверждённому действию |

## Контент и мета

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| CONTENT-01 | M3 | Сверить первые15 с pinned bank; обновить definition при старом save | Hash исходников сохранён; новая revision не подменяет старую попытку по ordinal |
| CONTENT-02 | M3 | №1→5; выбор №15; глава9→10→15; все четыре; 30 повторов | Только нужные задачи открываются; 6–15 свободны после5; повтор/daily/own не заменяют unique completions |
| CONTENT-03 | M3/M7 | Человеческое прохождение начала и соседних practice/combine/recovery | Протокол сложности/повторов по задачам; спорные recovery исправлены или явно приняты, не PASS по минимуму |
| CONTENT-04 | M3/M7 | Каждая из60: старт/решение, witness, реальный дисплей и человек | Accepted/revise/reject с fingerprint/evidence; все четыре warnings разобраны отдельно |
| CONTENT-05 | M6/M8 | Принять30daily, выпустить пачку7, уменьшить запас ниже14 | Есть календарный/редакционный процесс и ответственный; low stock замечает команда; новых слотов не выдумывают |
| META-01 | M3 | Первая/повторная победа, смена revision, пустой альбом | Одна logical карточка; best обновлён; незавершённое решение не раскрыто |
| META-02 | M3/M4 | Новый профиль; первая победа; открытые и закрытые форматы | Пустой редактор сразу, clean/copy после победы; помощь/доступность не заперты |
| META-03 | M3/M6 | За вечер решить семь архивных slot; пропустить неделю | Счёт +7 unique задач, не дней; нет сброса/штрафа; пороги3/7/14 работают |
| META-04 | M3/M5 | Одновременно chapter+layout; sync earned; поднять порог; все6форматов | Права атомарны и не отняты; одна неблокирующая церемония; нет fake следующего unlock |

## Daily

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| DAILY-01 | M6 | Два клиента/зоны; смена UTC-даты; локальные часы в будущее | Один опубликованный slot/start; локальная подпись времени меняется, future slot не открывается |
| DAILY-02 | M6 | Guest/no auth; offline с кешем и без; endpoint down | Кеш играется, новый fetch честно недоступен; кампания/редактор стартуют независимо |
| DAILY-03 | M6 | Начать до00:00UTC, закончить после; открыть новый и старый | Завершение старого slot, отдельная новая задача; архив не требует «сначала вчера» |
| DAILY-04 | M6 | Обрыв загрузки/hash mismatch/withdrawal при активной партии | Пригодный кеш сохранён; нет тихой замены поля; прежние earned остаются |
| DAILY-05 | M6 | Manifest раньше blob; исчерпан календарь; повтор публикации | Publisher не активирует неполный каталог; игрок получает no-publication+архив, не фальшивую новинку |

## Редактор и экспорт

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| EDITOR-01 | M4 | Пустой draft, копия solved, 1×1/1×3/6×5 | Отдельный ID/provenance, исходник не меняется; невозможные поля не playable |
| EDITOR-02 | M4 | Corner fixtures, один ряд/столбец, half-up rounding | Exact parity с независимой реконструкцией; нормализованные неиспользуемые углы |
| EDITOR-03 | M4 | Slider→cancel/apply; resize→cancel/apply; pin mode | Одна revision на apply, cancel без мутации; resize сохраняет старую ветку, pin tool не меняет плитки |
| EDITOR-04 | M4 | Новый старт/replay; новый seed с тем же стартом; HTML/длинное имя | Фиксированный replay, correct fingerprint; plain text/80 code points, никакого исполнения разметки |
| EDITOR-05 | M4 | Все33 boundary fixtures, solid colour, duplicate movable, symmetry и close pair | Hard errors блокируют игру, invalid draft сохраняется; warning не выдаётся за сертификат зрения |
| EDITOR-06 | M4 | Сохранить revision→играть→изменить draft→победить старый snapshot | Авторская отметка только пройденной revision; snapshot не меняется под активной игрой |
| EDITOR-07 | M4/M5 | Rename; colour edit; replay; копия campaign; revisions в montage | Rename сохраняет отметку, содержательная правка снимает; одна работа/нет official фарма/нет дублей montage |
| EDITOR-08 | M4/M5 | Back до debounce; storage-error; kill до/после save; concurrent edits | Нет ложного «Сохранено»; recoverable last committed revision/обе ветки, понятный выбор ухода |
| EXPORT-01 | M4 | Экспорт 1×N/N×1/6×5, пиксельная проверка внутренних областей | Точный RGB, квадратная целочисленная клетка, нет pins/UI/фильтров/обрезки |
| EXPORT-02 | M4 | Все6форматов и страница15/15 | Canvas/regions совпадают с таблицей screen spec; права/составные работы корректны |
| EXPORT-03 | M4/M7 | Длинный RU-текст, нехватка работ, ОС-error, отмена share | Текст не обрезан молча, preview/права остаются; отмена не считается опубликованным экспортом |

## Художественная подача, движение и UX

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| ART-01 | M2 | Side-by-side референс и реальный gameplay/win одной задачи | Владелец принимает характер облаков/свечения/дымки/краёв; не только факт наличия градиента |
| ART-02 | M2/M7 | Gameplay, result, альбом, меню на узком экране | Поле доминирует; призма декоративна; навигация читается без каталога тяжёлых панелей |
| ART-03 | M2 | До2шрифтов, RU HUD/«Собрано»/длинные подписи/150% | Зафиксированы реальная гарнитура и лицензия, роли/цифры; нет возвращённого без согласования псевдопикселя |
| ART-04 | M2 | Effects on/off; inspect RGB плиток/pin/selection/drag | Цветовые поверхности идентичны данным; эффекты и знак выбора отдельны, hitbox неизменен |
| ART-05 | M2 | Два разных расположения одной палитры и swap между дальними областями | Фон пространственно реагирует, хотя histogram тот же; записан полный эпизод |
| ART-06 | M2 | Код-инспекция ambient inputs; законные улучшение/ухудшение/нейтральный ход | Нет входа hidden correctness/distance; одинаковая сила отклика; решение открывается только win/help |
| ART-07 | M2 | Win→немедленный Next/Album; посмотреть поле; kill/resume | Переход не ждёт tween; решение доступно; церемония не начисляет reward и не повторяется циклом |
| ART-08 | M2/M7 | OS reduced motion/локально off; menu/background/ad/resume; low quality | Статичная атмосфера и смысл сохранены, нет burst; принятые действия не зависят от качества |
| ART-09 | M2/M7 | Swap/win/cancel/no-op, mute, supported/unsupported haptic | По одному сигналу только фактическим событиям, нет хвоста новых событий после mute/resume |
| UX-01 | M1/M7 | Реальные размеры board/controls и banner/safe insets | Единый safe rect, cellW/H≥48, controls≥48×48, один учёт inset |
| UX-02 | M2/M7 | 320×568/360×800/412×915, landscape/desktop,150%, banner on/off | Все действия доступны до автоскролла теста; reflow/geometry-unavailable вместо наложений |
| UX-03 | M1/M7 | 9→10→100→1000, modal open/close, keyboard, invisible overlay | Кнопки не прыгают; фокус возвращается; закрывающий tap не проходит; labels не раскрывают ответ |
| UX-04 | M3–M7 | Local commit без сети, uncertain result, failed thumbnail | Правдивые local/sync/recovery статусы; валидная партия доступна |
| UX-05 | M2/M7 | Фокус/имена/контраст на всех palette states, крупный текст | Читаемые controls/статусы, pin/выбор различимы; ограничение colour-accessibility сформулировано честно |

## Архитектура и cloud

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| TECH-01 | M0/M1 | Domain suite без renderer/SDK; недоступные optional services | Правила работают независимо; нет сети на пути локального accepted action |
| TECH-02 | M0 | Clean checkout build, guidance doctor, runtime API smoke | Пины и инструкции точны; platform bootstrap не выдуман; повторяемые debug artifacts |
| TECH-03 | M1/M5 | Две IndexedDB вкладки/SQLite writer; crash между частью записи | CAS/transaction сохраняют целостное состояние и ledger/outbox; stale snapshot не побеждает |
| TECH-04 | M1/M5 | Lost commit response, duplicate op, corrupted snapshot, unknown schema | ReadOperation/recovery без двойного права; повреждена только нужная сущность; backup/migration атомарны |
| CLOUD-01 | M5 | Contract fixtures для всех сущностей/старой schema | Exact keys/versions; default не стирает новое поле; immutable nodes/ref поддерживаются |
| CLOUD-02 | M0/M5 | Неверный proof/app/подпись, auth expiry, два namespace и same name | Сервер отвергает подделку; verified профиль восстановим, email/name не склеивают аккаунты |
| CLOUD-03 | M0 | Реальный signed Player exchange данного draft | Capability/секрет подтверждены; blocker записан при отсутствии, fallback на голый UID запрещён |
| CLOUD-04 | M5 | Lost POST response/duplicate payload ID/reset race/cursor чужого профиля | Атомарный batch/receipt, dedup, epoch lock, отказ чужим сущностям, отсутствие пропусков sync pages |
| CLOUD-05 | M5 | Две offline ветки попытки/работы, clock skew, assisted vs clean | Обе recoverable, явное resolution; нет merge клеток или обнуления assist/best |
| CLOUD-06 | M5 | Guest transfer interruption/reset между chunk; A→guest→B; поздний callback | Safe retry/receipt, источник не стёрт преждевременно, A не переносится B, outbox не меняет адресата |
| CLOUD-07 | M5/M7 | Reset lost response, stale device, offline delete, revoke и backup restore | Один новый epoch; старые факты не воскресают; local/серверные обещания соответствуют receipt/retention |
| CLOUD-08 | M5 | Quota overflow, oversize batch, device prefs и log audit | Нет silent discard; лимит объяснён, личные настройки локальны, нет токенов/raw save в логах |

## Реклама, качество и измерение

| ID | Этап | Проверяемый эпизод | Ожидаемый результат / доказательство |
| --- | --- | --- | --- |
| ADS-01 | M7 | Полная no-fill/offline сессия с help/editor/export/earned | Функции и уже заработанное доступны без обязательного видео/платежа |
| ADS-02 | M7 | Первые5; compatible scene transitions; dialog/editor/help; resize callback | Защищённое скрыто, разрешённый слот стабилен, нет мигания/накрытия CTA, stale view не возвращается |
| ADS-03 | M7 | Границы180s/3unique, repeat, chapter/layout unlock и double Next | Eligibility exact, milestones защищены, повтор/редактор не opportunities |
| ADS-04 | M7 | No-fill/error/unready/unknown pre-show/open ad/background | Request cooldown только при request; один resume после достоверного close, независимые blockers |
| ADS-05 | M0/M7 | Настоящие native и hosted SDK, release config audit | Раздельные adapters/test/live, API sticky control, нет mock globals/чужого SDK в web |
| NFR-01 | M2/M7 | Реальные touch/drag/win на двух зафиксированных устройствах | p95 frame/input и запись профиля качества по бюджету, не средний desktop FPS |
| NFR-02 | M7 | Cold/warm start,15min session, большой альбом, resume | Бюджеты и нагрузка измерены; first playable не ждёт всех previews/сети; отклонения явно разобраны |
| NFR-03 | M5/M7 | Обязательная fault-suite, IDOR/oversize/URL/лог audit | Нет потери committed data/дубликатов и межпрофильного доступа; секреты/личный контент исключены |
| NFR-04 | M3/M5/M7 | Commit/retry/offline/analytics down | Stable eventId, события после commit, telemetry не блокирует игру; raw data не передаётся |
| NFR-05 | M8 | Проверить события и определения отчётов на известных сессиях | Unique tasks не равны return days; cohort/version понятны; нет вывода о fun/revenue из CI |

## Условия закрытия

Ведущий разработчик фиксирует техническое исполнение; visual/content приёмка включает фактический просмотр человеком/владельцем. P0 — потеря подтверждённых данных, чужой доступ, блокировка основной игры/действия, нарушение обязательного scope — не переносится за релиз. Художественное одобрение одной картинки не закрывает touch, читабельность и длительную игру.

Поддерживать этот файл либо его машинную таблицу с полями evidence/status; не заменять доказательства словами «должно работать». В этом пакете приложен `acceptance-register.csv` с исходным NOT RUN для каждой строки. CI текущего документального PR подтверждает только проверки репозитория.
