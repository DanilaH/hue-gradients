# Status — 19 November 2026

Current internal build: **0.4.1/versionCode5**, branch feat/m0-foundation, draft PR #1. Implementation checkpoints are on GitHub.

| Stage | Actual state |
| --- | --- |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 | LOCAL IMPLEMENTATION: shared input/play, SQLite/IndexedDB transaction seam, CAS/ledger/recovery; native runtime acceptance pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: reactive atmosphere, committed feedback, settings, prism; owner typography/art/phone acceptance pending |
| M3 | LOCAL IMPLEMENTATION: 60 campaign candidates, chapters, album, rights/mastery, page, separate copies and migration |
| M4a | LOCAL IMPLEMENTATION: editor, immutable revisions, durable previews, recovery/branches, validator/fingerprint and author play |
| M4b | LOCAL IMPLEMENTATION: clean/six PNG layouts/chapter page, distinct works, measured text, browser download/share and native bridge; real Android action acceptance pending |
| M5 | ON HOLD by owner19 Nov: cloud/account/synchronization deferred from the current local milestone |
| M6 | NEXT CLIENT WORK: local daily/archive state/cache; live shared calendar/catalog/trusted time remain unconfigured |
| M7–M8 | NOT STARTED |

Verified:149 unit tests (all33 independent editor fixtures and all60 campaign witnesses);19 editor +9 export +20 core +9 presentation +12 meta +6 local SDK browser scenarios =75 total. Actual UI includes first15 campaign completion and an assisted author completion without campaign credit. Two live editor tabs preserve variants. Real Chromium download matches preview bytes; independent Pillow checks every tile pixel/seam/region, PNG dimensions, CRC and sRGB in all eight renderers. Save-picker/share/daily-right responses in the export suite are labelled fixtures, not real platform acceptance.

TypeScript, standard/release web, Yandex audit, strict pinned guidance doctor, spec40/40, Gradle debug/R8 releaseCheck and exact APK inspection pass. Export bridge/callback survive R8; compiled FileProvider exposes only the private PNG cache and no broad storage permission. M4_EXPORT_IMPLEMENTATION.md and evidence/m4-export-2026-11-19.json record limits. Package/certificate retain .preview3 identity from0.3/0.4; versionCode5. Real Android update/save/share/cancel/access/storage-pressure runtime is NOT RUN.

Native SQLite/process death/storage pressure/touch/haptics, hosted Yandex, identity/cloud/live ads and owner art remain unverified. Production signer and store publication remain unconfigured. Actions host installation still needs its separate KIT_READ_TOKEN; connected access does not supply an Actions secret.

All60 remain editorial candidates; colour decisions027/037/053/060 and two-font Cyrillic comparison are open. Daily-earned layouts stay locked until actual M6 facts. M4 local implementation is present; production/native acceptance register71 NOT RUN. KIT IMPACT: REUSE.
