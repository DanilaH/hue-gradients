# Status — 18 November 2026

| Stage | Actual state |
| --- | --- |
| Recovery | Foundation published to `feat/m0-foundation`; source no longer exists only in an old chat workspace |
| M0 | PARTIAL: reproducible platform builds; external gates in M0_GATES.md remain |
| M1 rules | IMPLEMENTED: immutable first15, pure reducer, cycle minimum and saved-state validation |
| M1 playable/local save | INTERNAL SLICE IMPLEMENTED: shared game, tap–tap/drag/keyboard, first-five route, help/restart/results, SQLite/IndexedDB, atomic ledger/facts/progress and CAS |
| M1 acceptance | PARTIAL: browser scenarios executed; native SQLite runtime, physical touch/process-death/storage-pressure and complete CORE/TECH acceptance still pending |
| M2–M8 | NOT STARTED: current presentation is the M1 functional surface, not approved art |

Verified locally: 30 unit tests; 20 real Chromium/IndexedDB/input scenarios including the first five through UI; 6 Yandex host scenarios with a local SDK stub/failed SDK request; TypeScript; Android standard/release web; Yandex build/upload audit; strict pinned guidance doctor; spec 40/40 exact hashes; debug/R8 releaseCheck Gradle builds; exact-APK inspection including both storage bridges; 4 signing safety tests. See docs/evidence/m1-local-slice-2026-11-18.json for exact artifact identity and limits.

The browser tests prove physical IndexedDB transactions, including two actual tabs; they do not prove SQLite on Android. Compiling Java/R8 and inspecting DEX do not prove native runtime. Yandex SDK stubs do not prove a hosted draft. Production acceptance remains all 71 NOT RUN in docs/spec/acceptance-register.csv. No real account, cloud, ads, production signer or store publication was configured.
