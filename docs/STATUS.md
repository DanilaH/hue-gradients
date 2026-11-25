# Status — 23 November 2026

**0.4.51 / 55, 25 November.** Fixed selector placement and hit area, added neutral locked previews, closed pilot geometry seams, and profiled pointer rendering. Approval pending for the Optical Dream art concepts. [Technical results](evidence/optical-dream-technical-0.4.51.md) · [Art concepts](design/optical-dream/README.md).

**0.4.49–0.4.50 / 53–54, 25 November.** The menu and personal task selection now agree. Future survives 60/60. The separate pilot contains 16 boards with orientation fit, Voronoi selection, center colors, fresh starts and full-screen PNG. Signed previews and browser episodes passed. [Menus and tasks](evidence/pr22-23-modes-personal-0.4.49.md) · [Geometry and phone acceptance](evidence/pr24-25-geometry-pilot-0.4.50.md).

**0.4.48 / 52, 24 November.** PR #21 adds the first-move line and one idle cue on 001. Both filmed paths reach and restore the first saved exchange on 002. The signed preview APK passed payload inspection. [Evidence and device acceptance](evidence/pr21-first-30-seconds-0.4.48.md).

**0.4.46 / 50, 23 November.** PR #18 fixes authored text sizing across both hosts. The paired Yandex build captures match at browser defaults 16 and 24 px. The chapter count is 15 px and the level rail remains 20/26 px. The signed preview APK and narrow-screen checks passed. [Evidence and device checks](evidence/pr18-font-scale-0.4.46.md).

**0.4.45 / 49, 23 November.** The PR #17 follow-up enlarges level numbers and chapter signs and groups the striped 001 preview with its title and action. The 001 and 006 browser matrix includes 320×568 at 150% text. [Measurements and captures](evidence/pr17-level-scale-0.4.45.md).

**0.4.44 / 48, 23 November.** PR #16 has a continuous picker, a settings panel that preserves its source, a preview-to-board transition and touch feedback that holds the tile through transaction confirmation. Chromium covers 006, archive return, book progression and author-trial return. The signed preview inspector passed. [Results and Android acceptance remaining](evidence/pr16-menu-board-0.4.44.md).

All 16 available A1–G1 checkpoints were rerun against `431f06d`. This includes 192 unit tests, the signed 0.4.25 payload in Chromium 92 and 153, 30 offline daily boards and 8 independently checked wallpaper PNGs. Live services and physical device acceptance are recorded separately. [Results](evidence/queue-regression-a1-g1-2026-11-21.json)

**0.4.35** addresses the audit in PR #12. Chromium restored the same time-trial and personal attempts across two restarts, including one before and one after a move. Both shipped web entrypoints passed a clean-profile Daily run with a staged source and a disconnected restart from local assets. A live endpoint and native SQLite/device acceptance remain open. Campaign loop initiation awaits the owner’s rules. [Audit follow-up](evidence/pr12-audit-followup-2026-11-22.json)

Web preview **0.4.34** applies V2 after the owner accepted the V1.4 landing. Personal Tasks, Daily, Books, Progress and Challenges use full-screen menus. The album restores its selected print and scroll, the level selector exposes the current number and status, and editor and dialog controls share the angular treatment. Chromium covered landscape, 150% text, touch and keyboard, and verified the full-screen wallpaper export. The latest signed preview is 0.4.31/versionCode35. [V2 evidence](evidence/v2-dreamy-psx-2026-11-22.json)

Web preview **0.4.33** carries the seated tile colours and their grain past the final contact so the camera has a continuous picture to move. Seams close and the centre-out wave starts on the impact. The tile colours blend into the smooth gradient during the push-in. Chromium replayed 006, 13×13 after 2.4× zoom, reduced motion and the result routes. The downloaded PNG matches 0.4.32 byte for byte. [V1.4 evidence](evidence/v14-dreamy-psx-2026-11-22.json)

Web preview **0.4.32** on `feat/m0-foundation` updates V1 after owner feedback. The camera pulls back during the hops and snaps into the full-screen gradient at the final landing, with a small recoil. The centre-out wave is already moving when the result menu starts its fade at 82% of the wave timeline. Checked at 1× on 006 and after a 2.4× touch zoom on 13×13 in Chromium. The latest signed APK is 0.4.31/versionCode35. [V1.3 evidence](evidence/v13-dreamy-psx-2026-11-22.json)

Signed Android preview **0.4.31/versionCode35** brings V1.2 to `feat/m0-foundation`. One brief colour recoil follows the final tile contact. The finished gradient holds before the title and actions fade in together. The 006 comparison uses the exact web assets of both signed previews. All 197 unit tests passed. V2 starts with Personal Tasks after owner review, and physical Android feel remains open. [V1.2 evidence](evidence/v12-dreamy-psx-2026-11-22.json)

| Stage | Actual state |
| --- | --- |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 | LOCAL IMPLEMENTATION: shared input/play, SQLite/IndexedDB transaction seam, CAS/ledger/recovery; native runtime acceptance pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: brighter low-resolution atmosphere, light trails and committed waves for gameplay, result and picker |
| M3 | LOCAL IMPLEMENTATION: 60 campaign candidates, chapters, album, rights/mastery, separate copies and migration |
| M4a | LOCAL IMPLEMENTATION: full-screen live colour editor, immutable revisions, durable previews, recovery, and exact-revision author play |
| M4b | LOCAL IMPLEMENTATION: one full-screen wallpaper per verified work, browser download/share and Android display metrics bridge. Device acceptance pending |
| UI simplification | Editor ready for playtest. Three help actions, pin feedback and result details ready for playtest in 0.4.11 |
| Queue G1 | Ambient music has a separate opt-in switch. Cancel, final swap, victory feedback and large text passed in Chromium. The Android 14 emulator accepted the signed 0.4.24 → 0.4.25 update. A system ANR prevented a gameplay verdict. Two physical profiles and visual acceptance remain. [Checks](evidence/queue-g1-runtime-2026-11-21.json) |
| Queue F2 | Local replay validation, dedup and atomic input facts. Network competition unconfigured. [Checks](evidence/queue-f2-2026-11-20.json) |
| Queue F1 | Local monetization policy and provider fixtures. Live SDK and commerce unconfigured. [Checks](evidence/queue-f1-2026-11-20.json) |
| Queue E3 | Local publication protocol and retry fixtures pass. Public entry waits for a service. [Checks](evidence/queue-e3-2026-11-20.json) |
| Queue E2 | Exact verified editor revision file, import and its original wallpaper tested in Chromium. [Checks](evidence/queue-e2-2026-11-20.json) |
| Queue E1 | Themed books and cycle cancellation. The authored event from the staged catalog opened from Books and kept one win after two offline completions. Live dates and reset rules pending. [Checks](evidence/queue-e1-staging-2026-11-21.json) |
| Queue D2 | Personal assignments rotate by date and progress. Perfect records can be repeated. Difficult unplayed fields and chapter finale limits passed in Chromium, including a Dec 1 to Nov 25 correction with one reward. [Checks](evidence/pr8-d2-2026-11-21.json) |
| Queue D1 | Offline publisher staging and the 30 authored candidates checked. Two Chromium profiles received the same authored board, crossed the UTC month boundary and replayed the old slot offline. The client verified catalog, month and level bytes, rejected a damaged update and solved all 30 authored boards offline in Chromium. Published feed, human review and trusted clock pending. [Checks](evidence/queue-d1-client-2026-11-21.json) |
| Queue C2 | Keyboard focus stays visible at 2.44× on all four edges of the 13×13 field. Keyboard swap, touch pinch, drag, edge pan and canceled outside drop passed in Chromium. [Checks](evidence/pr8-c2-2026-11-21.json) |
| Queue C1 | Four original shape boards, deterministic generated starts and exact RGB verified. [Checks](evidence/queue-c1-2026-11-20.json) |
| Queue B3 | The ten-minute series has shuffled 7×7 fields, pins that change with score and a monotonic clock. Seven rounds, a second run, pause and a migrated 0.4.25 save passed in Chromium. [Checks](evidence/pr8-b3-2026-11-21.json) |
| Queue B2 | Chapter finales and one-time secret reveal. First chapter and replay checked in Chromium. [Checks](evidence/queue-b2-2026-11-20.json) |
| Queue B1 | Ten local move-limit challenges, fixed replay and last-move win/loss verified. [Checks](evidence/queue-b1-2026-11-20.json) |
| Queue A3 | Personal best visible on the work card. Comparison awaits a measured published sample. [Checks](evidence/queue-a3-2026-11-20.json) |
| Queue A2 | Exact APK assets on Chromium 92 and 158. Tappable central picker and verified resumption. [Checks](evidence/queue-a2-2026-11-20.json) |
| Queue A1 | Chromium tap/drop at the seam and 568×320 field fit verified. Physical touch and insets pending. [Checks](evidence/queue-a1-2026-11-20.json) |
| Package 02 | Campaign progress, victory history, XP and statistics on 0.4.12. Published world sample pending |
| M5 | ON HOLD by owner19 Nov: cloud/account/synchronization deferred from the current local milestone |
| M6 | LOCAL CLIENT: dated catalog cache, active attempt and offline archive; live shared calendar/catalog/trusted time remain unconfigured |
| M7–M8 | NOT STARTED |

0.4.12 adds «Уровни → Прогресс», one XP for each first campaign completion, separate finale and full-chapter states, and replay history. Optional statistics preserve published comparison version, source and sample size on eligible wins. The application has no published comparison sample. [Progress and APK checks](evidence/player-progress-2026-11-20.json)

0.4.11 adds deliberate help from pause, atomic auto-swap at +3 moves and visible mastery on the work card. Retired layout rights remain valid in existing saves. Android build and APK inspection passed. Refusal and cancellation of the system wallpaper path were tested with host fixtures. [Package evidence and captures](evidence/help-mastery-2026-11-20.json)

0.4.10 opens the gradient directly from «Мои работы» → «Создать». Corner taps show colours that update the whole field. The menu contains size, pins, fixed start and history. Author play returns to its exact revision. A previously verified revision produces its own wallpaper. [Editor evidence and captures](evidence/editor-ui-2026-11-20.json)

0.4.9 saves one verified work as a full-screen wallpaper at the device display dimensions. [Wallpaper export checks](evidence/wallpaper-export-2026-11-20.json)

0.4.8 fills each collage slot with a continuous gradient from that work. The same look applies to the full chapter and the single-work layouts. [0.4.8 export verification](evidence/gradient-collage-2026-11-20.json)

0.4.7 opens a full-screen album of smooth colour prints. Back restores the tab, scroll and source focus. A verified author revision has its own work card. Select distinct works across the two tabs for a collage and save its exact preview. The full chapter has the same direct save path. [0.4.7 build and verification](evidence/album-2026-11-19.json)

0.4.6 implements the [issue #3](https://github.com/DanilaH/hue-gradients/issues/3) export. The work card prepares a continuous, edge-to-edge 1080×1920 sRGB gradient from the solved work. [0.4.6 build and verification](evidence/clean-gradient-2026-11-19.json)

0.4.5 groups the first stage from [PR #2](https://github.com/DanilaH/hue-gradients/pull/2) into a test-signed preview. [Build, video and saved PNG checks](evidence/feel-episode-2026-11-19.json)

0.4.4 checks exercise exact rendered tile colours, stored and system motion settings, active and paused picker animation, locked palettes and direct swipe. [0.4.4 evidence](evidence/dream-atmosphere-2026-11-19.json)

Verified for 0.4.3: 149 unit tests, 21 core, 12 meta, 9 presentation, 19 editor and 9 export browser scenarios. Actual UI includes the first 15 campaign completions and an assisted author completion without campaign credit. Two live editor tabs preserve variants. Chromium download matches the preview bytes. Independent Pillow checks all eight renderers for tile colors, seams, dimensions and sRGB. Browser save-picker, share and daily-right scenarios use labelled fixtures. The six local SDK scenarios were last run for 0.4.2.

TypeScript, standard/release web, Yandex audit, strict pinned guidance doctor, spec 40/40, Gradle debug/R8 releaseCheck and exact APK inspection pass. Export bridge/callback survive R8. Compiled FileProvider exposes only the private PNG cache. The .preview3 package and test certificate match 0.4.2. Android install/update, native Back and native save/share runtime are NOT RUN. [0.4.3 evidence](evidence/level-picker-2026-11-19.json)

Native SQLite/process death/storage pressure/touch/haptics, hosted Yandex, identity/cloud/live ads and owner art remain unverified. Production signer and store publication remain unconfigured. Actions host installation still needs its separate KIT_READ_TOKEN; connected access does not supply an Actions secret.

All60 remain editorial candidates; colour decisions027/037/053/060 and two-font Cyrillic comparison are open. M4 local implementation is present; production/native acceptance register71 NOT RUN. KIT IMPACT: REUSE.

The picker opens on the current saved board. Swipe or the number rail changes only the selection. Chromium checks cover 320×568 at 150% CSS text, 844×390 landscape, locked previews, keyboard navigation, and the same saved attempt after Back and Continue.
