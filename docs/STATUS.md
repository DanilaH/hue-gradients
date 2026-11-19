# Status — 19 November 2026

| Stage | Actual state |
| --- | --- |
| Recovery | Foundation published to `feat/m0-foundation`; source no longer exists only in an old chat workspace |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 rules | IMPLEMENTED: immutable first15, pure reducer, cycle minimum and saved-state validation |
| M1 playable/local save | INTERNAL SLICE IMPLEMENTED: shared game, tap–tap/drag/keyboard, first-five route, help/restart/results, SQLite/IndexedDB, atomic ledger/facts/progress and CAS |
| M1 acceptance | PARTIAL: browser scenarios executed; native SQLite runtime, physical touch/process-death/storage-pressure and complete CORE/TECH acceptance still pending |
| M2 | EXECUTABLE REVIEW CANDIDATE: reactive spatial atmosphere, committed settling/audio/haptic, settings and full-screen prism result; typography/owner/phone acceptance pending |
| M3 | LOCAL IMPLEMENTATION: campaign 60, chapters, album, mastery/rights, full page, copy drafts and legacy migration; editorial/native acceptance pending |
| M4–M8 | NOT STARTED |

Verified locally: 33 unit tests; 20 real Chromium/IndexedDB/input scenarios including the first five through UI; 9 presentation scenarios (commit-only feedback, exact RGB, settings, reduced motion and lifecycle); 6 Yandex host scenarios with a local SDK stub/failed SDK request; TypeScript; Android standard/release web; Yandex build/upload audit; strict pinned guidance doctor; spec 40/40 exact hashes; debug/R8 releaseCheck Gradle builds; exact-APK inspection including both storage bridges; 4 signing safety tests. See docs/evidence/m1-local-slice-2026-11-18.json for exact artifact identity and limits.

The browser tests prove physical IndexedDB transactions, including two actual tabs; they do not prove SQLite on Android. Compiling Java/R8 and inspecting DEX do not prove native runtime. Yandex SDK stubs do not prove a hosted draft. Production acceptance remains all 71 NOT RUN in docs/spec/acceptance-register.csv. No real account, cloud, ads, production signer or store publication was configured.

M2 build: 0.2.0 / versionCode 2. Review contract: [M2_ART_BIBLE.md](M2_ART_BIBLE.md); exact evidence: docs/evidence/m2-presentation-2026-11-18.json. Native runtime and owner approval remain NOT RUN.

M3 0.3.0/versionCode3: 99 unit tests (all 60 witnesses), 12 M3 browser scenarios, retained 20 core + 9 presentation + 6 SDK stub scenarios. Actual UI covered all 15 first-chapter works; all60/fault migrations additionally use explicitly labelled imported checkpoint fixtures. See M3_IMPLEMENTATION.md and evidence/m3-campaign-2026-11-19.json. All60 remain editorial candidates; four target-phone colour decisions are open. Test APK uses isolated .preview3; see SIGNING_PREVIEW.md. Production identity is unchanged.
