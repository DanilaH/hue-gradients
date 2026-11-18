# Project decisions — 18 November 2026
Guidance snapshot SHA: 469928d03f4bae5053e23db26e82187bedbc252e
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
