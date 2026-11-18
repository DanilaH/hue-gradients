# Session handoff

Owner authorized roadmap implementation and asked for reliable continuation without giant dumps or blob/base64 output. Keep reads bounded, publish checkpoints and update this file. Do not re-read the whole research archive or rebuild the foundation from memory.

## Resume

1. Read AGENTS.md, PROJECT_DECISIONS.md and STATUS.md. Check current GitHub HEAD and worktree; preserve newer work.
2. Runtime/guidance pin: 469928d03f4bae5053e23db26e82187bedbc252e. Spec source: 812b926ebfc82c6b0e5f3c6506145de2331028a0. No silent upgrades.
3. Shared game: src/game/mountGame.ts + PuzzleScene.ts. Native entry src/main.ts chooses HueSQLite on-device and IndexedDB in desktop development; web/src/main.ts imports only the IndexedDB/shared game path.
4. Rules/data: src/domain/puzzle.ts, levels.ts, workspace.ts. First15 SHA256 remains 55efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51. Do not regenerate it.
5. Storage/session: src/local-store/{contracts,command,indexed-db,native}.ts; native HueSQLitePlugin.java; src/app/session.ts. One transaction includes snapshot, best/rights, immutable facts and receipt. CAS conflicts reload authority and discard the stale action. Unknown results retain the same prepared operation and resolve through the ledger; never write an empty fallback.

## What exists

All 15 definitions are playable sequentially. First five have been completed through the real browser UI. Tap–tap, direct drag, final pointerup, keyboard, pins, cancellation on geometry/background/capture changes, help persisted before preview, restart confirmation, result restoration, separate bests and unique base rights are wired to the real store. One corrupt attempt is quarantined without clearing progress. Full profile/schema corruption stops mutation instead of resetting it.

A normal lostpointercapture following pointerup must NOT clear a completed tap selection. A second pointer's cancel must NOT cancel the active pointer. Geometry is checked at the release event as well as resize callbacks; keep the browser regression scenarios.

Yandex local play does not await SDK init, metadata storage, login or ads. Optional Loading/Gameplay/pause callbacks attach later. Both entrypoints mark ready only after an authored POST_RENDER. Activity blockers remain additive.

## Next bounded package

- Execute native SQLite bridge transactions on an Android runtime: before/after-commit force-stop, lost response/retry, full storage, corrupt DB preservation and restart. Native DB corruption handler deliberately does not delete the file. This is still NOT RUN.
- Phone checks: first-five touch, rotation/background, keyboard where available, pin/selection visibility, timing and startup. Do not label browser layout checks physical Android acceptance.
- Finish any M1 CORE/TECH acceptance gaps (including settling/audio/feel where required) against the actual requirement rows. Current visual surface is functional; M2 still needs the owner's one gameplay→win art episode before broad styling and font choice.
- Then continue ROADMAP M2, not a new A/B/C art contest. Full campaign/meta/editor/export/cloud/daily/ads scope remains; nothing was cut.

## Checks

`npm run check`, `npm run yandex:check`, `npm run spec:check`; strict pinned guidance doctor; `python3 tests/signing_safety.py`.
`npm run test:browser` starts its own Vite server; needs Playwright + Chromium. `node tools/yandex-browser-check.mjs` runs six local SDK host scenarios. CHROMIUM_PATH may select the environment's headless shell. Tests write bounded summaries under .test-output/m1; do not paste complete traces into chat.
Native changes: android:sync:release, Gradle assembleDebug/assembleReleaseCheck, tools/verify-apk.py on the exact APK. No test-signing artifact is a production-signed release. Capacitor sync may resolve a local node_modules symlink; never commit another scratch directory into capacitor.settings.gradle.

KIT IMPACT: REUSE; narrow local transactional/optional-host candidates recorded in KIT_CANDIDATES.md. External setup remains M0_GATES.md. No other repositories changed.
