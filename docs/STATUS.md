# Status — 19 November 2026

Current internal build: **0.4.0/versionCode4**, branch feat/m0-foundation, draft PR #1. Implementation checkpoints are on GitHub.

| Stage | Actual state |
| --- | --- |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 | LOCAL IMPLEMENTATION: shared input/play, SQLite/IndexedDB transaction seam, CAS/ledger/recovery; native runtime acceptance pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: reactive atmosphere, committed feedback, settings, prism; owner typography/art/phone acceptance pending |
| M3 | LOCAL IMPLEMENTATION: 60 campaign candidates, chapters, album, rights/mastery, page, separate copies and migration |
| M4a | LOCAL IMPLEMENTATION: editor, immutable revisions, durable previews, recovery/branches, validator/fingerprint and author play |
| M4b | NEXT: clean/six PNG formats/chapter page renderers, work selection, text measurement, native/web download/share and failure/cancel states |
| M5–M8 | NOT STARTED |

Verified: 142 unit tests (all33 independent editor fixtures and all60 campaign witnesses); 19 editor +20 core +9 presentation +12 meta +6 local SDK browser scenarios =66 total. Actual UI includes first15 campaign completion and an assisted author completion without campaign credit. Two live editor tabs retain separate resumed previews and expose stale applied work as a branch. Fault/migration cases exercise physical IndexedDB, not native SQLite.

TypeScript, standard/release web, Yandex upload audit, strict pinned guidance doctor, spec40/40 exact hashes, Gradle debug/R8 releaseCheck and exact APK inspection pass. Details: M4_EDITOR_IMPLEMENTATION.md and evidence/m4-editor-2026-11-19.json. Test package remains com.danilah.huegradients.preview3, certificate matches0.3, versionCode4. Android update/install/runtime acceptance is NOT RUN.

Native SQLite/process death/storage pressure/touch/haptics, hosted Yandex, identity/cloud/live ads and owner art remain unverified. Production signer and store publication remain unconfigured. Actions host installation still needs its separate KIT_READ_TOKEN; connected access does not supply an Actions secret.

All60 remain editorial candidates; colour decisions027/037/053/060 and two-font Cyrillic comparison are open. Production register71 NOT RUN. M4/export is not declared complete. KIT IMPACT: REUSE.
