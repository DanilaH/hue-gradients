# Project decisions — 18 November 2026

**24 ноября · методика и доказательства.** Основные инструкции синхронизированы с принятым kit main. Для работы с оригинальным кодом отдельно принят исследовательский протокол из открытого kit PR №139 на точном коммите. Собственная реализация опирается на алгоритмы и архитектуру оригинала. Приватные исходные фрагменты остаются в исследовательском архиве. [Ревизии, матрица доказательств и приёмка](porting/RESEARCH_METHOD.md).

**23 ноября 2026 · решение владельца.** Все игровые экраны Android и Яндекс Игр используют только 100% авторской шкалы текста. Это правило действует для ART-03 и UX-02 поверх импортированного ТЗ 1.0 и заменяет прежние требования о кадрах при 150%. [Точные размеры и приёмка](design/menu-and-board-feel/README.md#type100).

**22 ноября · очередь аудита 0.4.34.** Сначала исправляем возврат времени в обоих таймерах. Daily проверяем с нового профиля и после офлайн-входа. Правила нового цикла согласуются отдельно. Кнопку запуска в книгах до этого не показываем. [Приёмка](evidence/pr12-audit-followup-2026-11-22.json).

**22 ноября · после просмотра 0.4.33.** Владелец принял финал V1.4 на уровне 006. Оформление применяется к остальным экранам с личных заданий. Вес удара и вибрация на телефоне остаются отдельной проверкой. [Протокол V2](evidence/v2-dreamy-psx-2026-11-22.json).

**22 ноября · после просмотра 0.4.32.** Владелец попросил смягчить стык на посадке. HUD и метки опор уходят в процессе прыжков. На последнем контакте швы закрываются, фактура плиток остаётся, а камера плавно набирает скорость внутрь. Отдельные цвета переходят в градиент уже в движении. [Протокол V1.4](evidence/v14-dreamy-psx-2026-11-22.json).

**22 ноября · после просмотра 0.4.31.** Камера берёт всё поле и ещё немного отъезжает в ходе прыжков. На последнем контакте она быстро приближает градиент с короткой отдачей. Волна начинается одновременно из центра поля, а призма, заголовок и команды появляются ближе к концу волны. [Контрольный эпизод](evidence/v13-dreamy-psx-2026-11-22.json).

**22 ноября · после просмотра 0.4.30.** В момент взрыва цвета нужна небольшая отдача камеры. После затухания краски дать посмотреть на готовый рисунок, затем плавно проявить меню и обе команды вместе. До открытия меню команды скрыты. Параметры первой пробы и эпизод 006 зафиксированы в [пакете V1.2](design/dreamy-psx/README.md). Эта правка идёт перед переносом оформления на остальные экраны.

**21 ноября · после просмотра 0.4.29.** Сначала V1.1. Камера останавливается перед прыжком, видны хлопки отдельных плиток. Зерно мельче. Поле вокруг паузы сохраняет яркость, у кнопок сплошная непрозрачная заливка. Для V2 нужен просмотр исправленной партии.

**21 ноября · художественное направление.** Владелец выбрал прямоугольную композицию меню, видимый дизеринг на плитках, полноэкранный итоговый градиент и победу с отъездом камеры, подъёмом плиток, последовательными локальными посадками, волной фактуры и брызгами от краёв. Серии V1/V2, источники и исключения для игровых режимов — в [ТЗ](design/dreamy-psx/README.md). Прежнее требование точного цвета отдельного пикселя заменяется проверкой базового sRGB, среднего цвета и различимости соседних плиток в игровом рендере. Чистые обои проверяются попиксельно. Приёмка эпизода и конкретной гарнитуры ещё предстоит.

**20 November, after the transfer audit.** Owner directs delivery of the complete audited feature program. [Packages and dependencies](porting/FULL_ROADMAP.md) and [ledger](porting/ADOPTION_LEDGER.json) govern new implementation briefs. Earlier baseline exclusions of modes, zoom, social and commercial systems are superseded for the corresponding new packages. Preserve the existing fixed-start campaign and core rules for its saved attempts. No energy or paid entry, one device-sized wallpaper per chosen work, cloud/account M5 on hold.
Guidance snapshot SHA: 5cac32b0851c80bdff1d61069b8524b9e42170e1
Runtime snapshot SHA: 469928d03f4bae5053e23db26e82187bedbc252e

## Source of truth
Owner authorized roadmap implementation. Product baseline: docs/spec/PRODUCT_SPEC_1_0.md from kit research commit812b926ebfc82c6b0e5f3c6506145de2331028a0 (PR47 open at adoption). Export preserved byte-for-byte;40 manifest hashes match. Full scope:60 campaign, chapters/album/mastery, daily/archive, editor/versioning, export/cloud, Android/RuStore and Yandex. No energy. First15 frozen. Research evidence is not consumer acceptance.

## Hosts and identity
Generated Android and Yandex templates from the exact runtime pin; installed, typechecked, tested and built unchanged before combination. One package.json; native root entry + web/ entry and independent dist-yandex upload root. Android payload is dist/ only. Web imports no native SDK.
Capacitor8.6.0/App8.1.2/Phaser4.2.1/TS7.0.2/Vite8.2.2; Gradle8.14.3/AGP8.13.0/JDK21/min24/target36. Pins, not evergreen rules.
Working appId com.danilah.huegradients, native responsive orientation, versionCode1/versionName0.1.0; selected for a new consumer and not registered with a store. .playtest/.releasecheck/production packages are isolated. Poluson is a working title. Production certificate=null; no production key created. Local releaseCheck used a test key.
Native root owns insets once; SystemBars auto-insets disabled; browser CSS handles its own safe areas. Native/document blockers additive. Ready follows first POST_RENDER. Actual hosted SDK/offline behavior remains pending; optional services must not gate the future local core.

## Game/storage boundary
src/domain is pure rules/proposed attempt state, without renderer, SDK or clock. src/local-store/contracts.ts defines the M1 transaction seam; concrete SQLite/IndexedDB adapters are NOT IMPLEMENTED. Host AtomicFile KV/counter is smoke data only. Snapshot, completion/best, rights, ledger and outbox commit together; operation ID exists before write. Unknown result is resolved by readOperation. Game content/schema/policy and planned single HTTPS API/PostgreSQL remain consumer-owned.

## UI and reference
Owner reference docs/spec/reference/owner-art-reference.png: fullscreen luminous clouds, grain/haze, spatial response, victory prism. Active RGB stays exact. Font pending M2; current system fonts/sample scenes are not approved art. No mass art created. Read routed UX_AND_ART_SYSTEM, UI_MOTION_RECIPES, STABLE_PROGRESS_UI, GAMEPLAY_ACTIVITY and Android BOOTSTRAP.

## Kit adoption
| Capability | Decision | Boundary / evidence |
| --- | --- | --- |
| Native host/lifecycle/insets/signing | REUSE | Generated source, debug/R8 builds and exact-APK inspection |
| Yandex runtime/startup/viewport/audit | REUSE | Build/upload audit; hosted SDK NOT RUN |
| Activity coordinator, DPR, teardown | REUSE | Real template imports and lifecycle tests |
| Atomic KV counter | HOST SMOKE ONLY | Not a transactional game store |
| SQLite/IndexedDB/ledger/outbox | LOCAL POLICY | Typed seam now, implementation in M1 |
| Identity/cloud/conflicts | LOCAL POLICY | Exact spec; production API/proof exchange pending |
| Ads/banner placement | REUSE LATER | Policy selected; native SDK/IDs pending M7 |
| Energy/IAP/rewarded economy | NOT APPLICABLE | Not in selected policy |

## Deliberate template changes
Yandex files moved under web/ with independent config/env/output/audit. Its sample readiness moved from create() to first POST_RENDER, matching native first-frame contract. Product spec overrides template prompts to invent art/economy. Other host sample behavior remains until M1 integration.
KIT IMPACT: REUSE. No common runtime APIs or other game repositories changed.

## M1 local slice — 18 November 2026

Shared entry is now src/game/mountGame.ts/PuzzleScene.ts; the old counter/sample-scene files are not game entrypoints. The 15 delivered definitions remain byte-identical. Rendering and hit tests share rounded CSS-space geometry. Pointerup checks current geometry directly, without waiting for a resize observer. Normal capture release preserves tap selection; canceled/foreign pointers cannot commit a stale gesture.

Native HueSQLitePlugin uses a process-wide writer and SQLite FULL synchronous transactions. Its corruption callback throws without Android's default database deletion. Browser IndexedDB uses strict durability when supported, a transaction-local revision CAS and an immutable operation ledger. Browser eviction is still possible and does not constitute a cloud backup. Snapshot progress, separate fingerprint/rules bests, earned rights, guest facts/outbox skeleton and operation receipt commit together. Help is committed before reveal; receipt ambiguity blocks mutation until resolved with the same operation. One corrupt attempt is archived within the next explicitly confirmed recovery write; whole-profile corruption never becomes empty defaults.

Yandex SDK is optional for local startup. The host reuses kit script loading/activity and attaches LoadingAPI/GameplayAPI/pause/resume after init, without awaiting SDK metadata storage or identity. Native code never imports that host. Current visuals are an M1 functional surface using system typography; dreamy/PSX art, expressive settling and the font decision remain subject to M2/acceptance.

Evidence: 30 unit, 20 Chromium/IndexedDB/input and 6 local SDK host scenarios; debug/R8 releaseCheck and exact-APK checks. Native SQLite runtime/process death, physical phone and actual hosted SDK remain NOT RUN. KIT IMPACT: REUSE, two local CANDIDATE seams in KIT_CANDIDATES.md; no common runtime was changed.

## M2 executable review candidate — 18 November 2026

Build 0.2.0/versionCode2. Exact visible RGB remain opaque; spatial ambient, 150ms interruptible commit-only settling, 650ms result dissolve, one own prism and procedural sound are described in M2_ART_BIBLE.md. Additive schema-1 preferences persist sound/haptics/motion without resetting older saves. Kit OneShotPlayer/exponentialResponse reused. Native system haptic is consumer-owned; no vibration permission or new runtime dependency. No correctness score enters feedback. Current system typography is provisional; two licensed font comparison, 150%/physical-phone QA and owner art approval remain pending. No mass art or other game/kit changes. KIT IMPACT: REUSE.

## M3 campaign/meta — 19 November 2026

0.3.0/versionCode3 appends authored campaign candidates to 60 without changing first15 data or their contentVersion/fingerprints. campaign-meta-1 opens tasks freely after fifth and later chapters at 10 unique predecessor completions; 15/15 yields a full page. Awards are stored once; assistance still counts for ordinary campaign completion. getTierProgress supplies finite display only, never award authority. Copies have new draft/work/node IDs and no inherited author completion or campaign credit.

Session commits legacy policy migration and an exact raw backup in one snapshot+facts+ledger transaction before exposing backfilled rights. Previously earned rights are unioned, not revoked by raised thresholds. Unknown/newer schema still stops mutation. M4 must distinguish local-migration-backup facts from completion facts. SVG previews preserve non-square aspect and stay inside cards. No unfinished target previews or fake seventh export/next chapter are shown.

All60 editorial statuses remain candidates, including individual unresolved colour warnings027/037/053/060. Browser automation is not human/phone acceptance. M4 creative editing/revisions/export and M2 font/owner acceptance remain open. Isolated .preview3 handles an unavailable old transient test signer; see SIGNING_PREVIEW.md. Production package/key settings are unchanged. KIT IMPACT: REUSE; no upstream repository changed.

## M4a local editor — 19 November 2026

0.4.0/versionCode4 adds editor fields, immutable node history, durable preview buffers and author play. Pure editor validation has exact parity with all33 independent Python fixtures. Gameplay SHA-256 excludes metadata/seed/unused corners; rename retains proof, changed gameplay does not inherit it. Author attempts bind a frozen node and never affect campaign progress/rights. Assisted and clean results remain separate.

Creative schema1 extends workspace schema1; old M3 snapshots are converted with their exact original backup in the same transaction. Copies retain immutable seed/provenance. Each restored form uses an independent edit ID, so two live tabs retain variants; stale Apply creates a recoverable branch without replacing the newer head. Unknown write keeps the form and resolves the same prepared operation on explicit retry. Existing Session/physical IndexedDB or SQLite transaction remains authority; RevisionSnapshotQueue does not replace the consumer's multi-table facts/receipt/CAS contract.

142 unit/66 browser scenarios pass, including actual author completion and two editor tabs. Debug/R8 releaseCheck and exact APK inspection pass with the same .preview3 certificate as0.3. Native runtime/update is NOT RUN. M4b PNG/export/share is next; full M4/production gate remains open. Existing UI tokens reused under pinned UX_AND_ART_SYSTEM/STABLE_PROGRESS_UI; no mass art, font approval, runtime-pin update or upstream changes. KIT IMPACT: REUSE. See M4_EDITOR_IMPLEMENTATION.md and evidence/m4-editor-2026-11-19.json.

## M4b PNG/export — 19 November 2026

0.4.1/versionCode5 implements clean, six layouts and chapter page from exact spec geometry, distinct logical works and measured plain text. Preview/download/share use the same prepared sRGB PNG; all tile pixels/seams are independently decoded. Basic clean derives from first real official/author victory, without adding campaign rewards from author play. Daily layouts are implemented but locked until real M6 facts; tests label synthetic rights and imported checkpoints.

Native export remains a narrow consumer bridge: ACTION_CREATE_DOCUMENT, private package-specific FileProvider for PNG cache only, no broad storage permission, background document IO and main-thread launches. Strip large base64 before Capacitor saves the activity call; explicitly keep private ActivityCallback name through R8. Browser fallback says download requested; native chooser only says opened. Cancel/error retains file/caption and never changes progress. Existing provisional font52px/line64 uses actual bounds, with no auto-shrink; owner font/art approval stays open.

149 unit/75 browser scenarios, all eight independent PNG checks, platform builds, debug/R8 releaseCheck and exact APK/provider/callback checks pass. Preview package/test certificate unchanged. Real native save/share/update/process-death/access/space acceptance NOT RUN; full production register remains71 NOT RUN. Next program stage is M5 contracts/sync. Public kit API and pinned UX/layout guidance used; no upstream/pin/other-game changes. KIT IMPACT: REUSE. See M4_EXPORT_IMPLEMENTATION.md and evidence/m4-export-2026-11-19.json.

## Owner scope override — 19 November 2026

Owner requested no cloud for now. M5/cloud saves/account synchronization is ON HOLD; backend/auth/hosting preparation is excluded from current work until explicitly resumed. Current milestone is the local game, polish and daily/archive client/cache preparation. Existing local progress, revisions, receipts and future migration seams remain intact. Original specification exports stay byte-exact; this current decision supersedes their sequencing for the offline milestone. A real shared M6 daily still needs a published catalog/trusted time and accepted dated content; local placeholders/device date are not official publication or reward evidence. No runtime/code/version/APK change in this scope update. KIT IMPACT: NONE.

## Continuous clean PNG — 19 November 2026

[Issue #3](https://github.com/DanilaH/hue-gradients/issues/3) supersedes the original tiled geometry for the clean template. The 0.4.6 playtest uses a full-bleed 1080×1920 sRGB PNG. Solved colours anchor the interpolation, including the outermost pixels. Rows interpolate horizontally, columns vertically, and two-dimensional grids interpolate bilinearly between adjacent anchors. Author export samples the specific verified revision selected by the player. The game field, the six composition formats and chapter-page geometry continue to follow their original specifications. The frozen specification snapshot stays byte-exact. The work card uses one prepared file for preview, one-tap save and sharing through the existing host bridge. KIT IMPACT: REUSE.

## Album of colour prints — 19 November 2026

The [PR #2 album package](https://github.com/DanilaH/hue-gradients/pull/2) uses two live tabs, «Собранное» and «Мои работы». The local collection groups earned campaign prints by chapter as the campaign grows. A chapter's 15/15 page opens the exact existing PNG with save available from the page itself. Colour prints use the clean renderer at thumbnail resolution. The victory card links to its own position in the album. Album routes keep separate scroll and focus for each tab and for collage selection.

Selecting a collage uses the same grid and checks committed layout rights. Selection can span both tabs. A different verified revision of the same work replaces its existing slot. Preview renders the selected artwork in tap order with the existing layout geometry. The strip unlocks at 15 campaign completions, the grid at 30. Verified own cards export their displayed revision and offer editing in the card menu. Drafts open in the editor. KIT IMPACT: REUSE. The pinned kit supplies focus and viewport guidance and the host lifecycle already in use.

## Continuous gradients in every export layout — 20 November 2026

0.4.8 uses the same sRGB gradient in the album thumbnails and every PNG print region. The strip, grid, diptych, single-work layouts and chapter page fill each designated print region with the selected work's gradient. Each print runs from its own edge anchors and the template gutters separate the works. The original canvas sizes, regions, paper, caption and frame rules still define the templates. This replaces the tiled content within export regions. KIT IMPACT: NONE. The renderer reuses the game's existing interpolation.

## One full-screen wallpaper — 20 November 2026

The owner scoped export to the selected work as a single wallpaper, sized in pixels to the device display. The 1080×1920 in issue #3 was a playtest suggestion. The former collage, decorated formats and chapter sheet were separate legacy requirements. This decision supersedes them for all player-facing export. Older save data and earned rights remain readable.

One prepared PNG covers the full image with the selected work’s solved sRGB gradient. Android uses maximum display window bounds, including the system-bar areas, and the real display size on API 24–29. Web uses browser-reported full screen dimensions multiplied by the device pixel ratio. If those metrics change while the card is open, it rebuilds the wallpaper before allowing another save. KIT IMPACT: NONE. The existing delivery bridge and interpolation supply the wallpaper.
