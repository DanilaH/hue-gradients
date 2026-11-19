# Resume — 19 November 2026

Read AGENTS.md, PROJECT_DECISIONS.md and STATUS.md. Owner authorized roadmap implementation. Keep reads bounded; do not paste blobs/base64/traces or re-read the whole archive. Commit checkpoints. Preserve newer remote work before editing.

## Current state

M3 local implementation, version0.3.0/versionCode3. Shared game: src/game/mountGame.ts/PuzzleScene.ts; functional meta routes in metaView.ts. Pure rules/workspace/progression live in src/domain. Snapshot/facts/receipt transaction remains native SQLite or browser IndexedDB. Runtime/guidance pin469928d03f4bae5053e23db26e82187bedbc252e; no silent upgrade.

60 campaign definitions now execute. First15 exact source SHA25655efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51 and legacy contentVersion remain unchanged. New45 are authored candidates, not regenerated or editorially accepted. Their four colour warnings and per-fingerprint review rows are docs/content/CAMPAIGN_REVIEW_2026-11-19.json.

Progress: firstfive sequential, then free choice. Next existing chapter opens at10/15; full page at15/15. A helper recommendation is not a lock. Unique cards/rights/mastery and separate clean/assisted bests commit once. New rights appear in an optional compact list, not Claim windows. All60 means no fake chapter5 or next task. Album never reveals unfinished targets.

Old m1-local-1 snapshots are decoded/validated, upgraded to campaign-meta-1 and backed up in the same DB transaction before new rights are displayed. The exact original snapshot is archived as a guest fact kind local-migration-backup; M5 transfer must not mistake it for a completion. A failed migration leaves original data and no reward UI. Current-schema corruption/unknown future schemas never become empty defaults.

Album copies are durably separate draft/work/node roots with provenance and an immutable snapshot; authorCompletions is empty. UI only promises Save copy/read draft. The original source/best/progress is untouched. M4 must add actual creative editing and version history with explicit migration; do not pass these seed copies off as a finished editor.

M2 atmosphere/settling/audio/haptic remain the existing executable candidate: M2_ART_BIBLE.md. The font comparison/150% and owner/physical-phone acceptance are still open; do not call them PASS.

## Next package

1. M4 from ROADMAP_1_0.md and CONTENT_EDITOR_SPEC_0_1.md: real editor, immutable revisions, author testing, all six PNG renderers and share/error/cancel states. Preserve the M3 rights and draft provenance; no campaign credit from own work.
2. Finish the two-font Cyrillic comparison and enlarged-text check, then obtain feedback on the actual M2 episode before mass art. No new A/B/C setting contest.
3. Native SQLite/haptic/process-death/storage-pressure and physical touch acceptance remain NOT RUN. An Android runtime/ADB was not available in this workspace; no native runtime scenario was executed. Hosted Yandex, production identity/cloud/ads also remain external gates. Full release is not done.

## Validation

99 unit tests including all60 supplied witnesses; 20 core browser; 9 presentation; 6 local Yandex SDK scenarios; 12 M3 browser scenarios. M3 UI really solved all15 of chapter1 out of order after tutorial. All60 imported state and legacy fault fixtures are labelled fixtures, not human/phone playthroughs. TypeScript/web/Yandex audits, strict pinned guidance doctor and exact spec hashes are recorded in evidence/m3-campaign-2026-11-19.json. Run npm run check, yandex:check, spec:check; test:browser/test:presentation and tools/m3-browser-check.mjs as relevant. Browser scripts start Vite themselves and accept CHROMIUM_PATH.

Native changes: android:sync:release, Gradle debug/R8 releaseCheck, verify-apk.py on the exact artifact. Do not commit another scratch checkout into capacitor.settings.gradle when Capacitor resolves a node_modules symlink. The cached kit tgz hash matched kit-pins.json exactly; dependencies were reused at that pin.

## Test signer continuity

Read SIGNING_PREVIEW.md before building. Old0.2 test signer was lost with transient storage; do not claim in-place update compatibility. 0.3 test package is com.danilah.huegradients.preview3, alongside the old .releasecheck installation. Retrieve the privately saved file named HUE-test-preview-signing.keystore and pass its path as ANDROID_PREVIEW_KEYSTORE for future builds. Reuse this key and .preview3; increment versionCode. Never commit key bytes, regenerate it silently or use it as production signing. Production appId/certificate policy remains unchanged.

KIT IMPACT: REUSE (getTierProgress plus prior OneShotPlayer/lifecycle/DPR/teardown). A signer-retention guidance candidate is recorded without upstream changes. No other game/kit repository changed.
