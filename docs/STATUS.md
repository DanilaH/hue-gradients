# Status — 20 November 2026

Signed Android preview **0.4.24/versionCode28** is based on `feat/m0-foundation`. That branch includes the full audit roadmap from PR #4 and package 01 from PR #5.

| Stage | Actual state |
| --- | --- |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 | LOCAL IMPLEMENTATION: shared input/play, SQLite/IndexedDB transaction seam, CAS/ledger/recovery; native runtime acceptance pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: brighter low-resolution atmosphere, light trails and committed waves for gameplay, result and picker |
| M3 | LOCAL IMPLEMENTATION: 60 campaign candidates, chapters, album, rights/mastery, separate copies and migration |
| M4a | LOCAL IMPLEMENTATION: full-screen live colour editor, immutable revisions, durable previews, recovery, and exact-revision author play |
| M4b | LOCAL IMPLEMENTATION: one full-screen wallpaper per verified work, browser download/share and Android display metrics bridge. Device acceptance pending |
| UI simplification | Editor ready for playtest. Three help actions, pin feedback and result details ready for playtest in 0.4.11 |
| Queue F2 | Local replay validation, dedup and atomic input facts. Network competition unconfigured. [Checks](evidence/queue-f2-2026-11-20.json) |
| Queue F1 | Local monetization policy and provider fixtures. Live SDK and commerce unconfigured. [Checks](evidence/queue-f1-2026-11-20.json) |
| Queue E3 | Local publication protocol and retry fixtures pass. Public entry waits for a service. [Checks](evidence/queue-e3-2026-11-20.json) |
| Queue E2 | Exact verified editor revision file, import and its original wallpaper tested in Chromium. [Checks](evidence/queue-e2-2026-11-20.json) |
| Queue E1 | Themed books, event cache fixture and cycle cancellation. Live dates and reset policy pending. [Checks](evidence/queue-e1-2026-11-20.json) |
| Queue D2 | Offline personal assignments, timer, future chapter preview and one completion mark per task. [Checks](evidence/queue-d2-2026-11-20.json) |
| Queue D1 | Daily client, UTC rollover and archive tested with a dated fixture. Published feed and trusted clock pending. [Checks](evidence/queue-d1-2026-11-20.json) |
| Queue C2 | 13×13 field, pinch, pan, visible edges and canceled drop verified in Chromium. [Checks](evidence/queue-c2-2026-11-20.json) |
| Queue C1 | Four original shape boards, deterministic generated starts and exact RGB verified. [Checks](evidence/queue-c1-2026-11-20.json) |
| Queue B3 | Ten-minute local series and score; save, pause and duplicate finish checked in Chromium. [Checks](evidence/queue-b3-2026-11-20.json) |
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
