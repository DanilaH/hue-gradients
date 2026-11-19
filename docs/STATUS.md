# Status — 19 November 2026

Current internal build: **0.4.4/versionCode8**, branch feat/m0-foundation, draft PR #1. Implementation checkpoints are on GitHub.

| Stage | Actual state |
| --- | --- |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 | LOCAL IMPLEMENTATION: shared input/play, SQLite/IndexedDB transaction seam, CAS/ledger/recovery; native runtime acceptance pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: brighter low-resolution atmosphere, light trails and committed waves for gameplay, result and picker |
| M3 | LOCAL IMPLEMENTATION: 60 campaign candidates, chapters, album, rights/mastery, page, separate copies and migration |
| M4a | LOCAL IMPLEMENTATION: editor, immutable revisions, durable previews, recovery/branches, validator/fingerprint and author play |
| M4b | LOCAL IMPLEMENTATION: clean/six PNG layouts/chapter page, distinct works, measured text, browser download/share and native bridge; real Android action acceptance pending |
| UI simplification | FULL-SCREEN LEVEL AND CHAPTER PICKER VERIFIED IN CHROMIUM. Next: album and PNG |
| M5 | ON HOLD by owner19 Nov: cloud/account/synchronization deferred from the current local milestone |
| M6 | NEXT CLIENT WORK: local daily/archive state/cache; live shared calendar/catalog/trusted time remain unconfigured |
| M7–M8 | NOT STARTED |

0.4.4 checks exercise exact rendered tile colours, stored and system motion settings, active and paused picker animation, locked palettes and direct swipe. [0.4.4 evidence](evidence/dream-atmosphere-2026-11-19.json)

Verified for 0.4.3: 149 unit tests, 21 core, 12 meta, 9 presentation, 19 editor and 9 export browser scenarios. Actual UI includes the first 15 campaign completions and an assisted author completion without campaign credit. Two live editor tabs preserve variants. Chromium download matches the preview bytes. Independent Pillow checks all eight renderers for tile colors, seams, dimensions and sRGB. Browser save-picker, share and daily-right scenarios use labelled fixtures. The six local SDK scenarios were last run for 0.4.2.

TypeScript, standard/release web, Yandex audit, strict pinned guidance doctor, spec 40/40, Gradle debug/R8 releaseCheck and exact APK inspection pass. Export bridge/callback survive R8. Compiled FileProvider exposes only the private PNG cache. The .preview3 package and test certificate match 0.4.2. Android install/update, native Back and native save/share runtime are NOT RUN. [0.4.3 evidence](evidence/level-picker-2026-11-19.json)

Native SQLite/process death/storage pressure/touch/haptics, hosted Yandex, identity/cloud/live ads and owner art remain unverified. Production signer and store publication remain unconfigured. Actions host installation still needs its separate KIT_READ_TOKEN; connected access does not supply an Actions secret.

All60 remain editorial candidates; colour decisions027/037/053/060 and two-font Cyrillic comparison are open. Daily-earned layouts stay locked until actual M6 facts. M4 local implementation is present; production/native acceptance register71 NOT RUN. KIT IMPACT: REUSE.

The picker opens on the current saved board. Swipe or the number rail changes only the selection. Chromium checks cover 320×568 at 150% CSS text, 844×390 landscape, locked previews, keyboard navigation, and the same saved attempt after Back and Continue.
