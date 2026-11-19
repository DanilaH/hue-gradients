# Resume — 19 November 2026

Read AGENTS.md, PROJECT_DECISIONS.md, STATUS.md and M4_EDITOR_IMPLEMENTATION.md. Owner authorized roadmap continuation. Bound file reads/output; no blobs/base64 or whole-archive re-reads. Commit checkpoints and preserve newer remote work. Current branch feat/m0-foundation, draft PR #1; main still contains the original README.

## Current slice

0.4.0/versionCode4 implements M4a (roadmap items1–3). Full M4 gate remains open. Pure domain/editor.ts and creative.ts; stable live form game/editorView.ts; author play reuses mountGame.ts/PuzzleScene.ts. Existing campaign/meta/presentation remains.

Workspace schema1 gains an optional-for-old-saves creative member with its own schemaVersion1. Session validates old snapshots then atomically commits conversion plus an exact raw backup before exposing M3 copies as editable roots. PolicyVersion stays campaign-meta-1; missing creative triggers migrate-creative-local. Unknown schemas/corruption stop loading, never become empty defaults. Local-migration-backup facts are archival, never completion facts during M5 transfer.

Creative works own draft/work IDs, immutable nodes (field/parent/SHA-256/rules/seed), head, preview buffers and author receipts. M3 albumCopies remain immutable provenance seed records; do not overwrite them when editing/renaming. Decoder requires every original copied node to remain exact.

Fingerprint covers dimensions, exact uppercase visible sRGB, sorted pins and full start; excludes metadata/seed/unused corners. Session checks each SHA with WebCrypto before exposure; digest caching keys are complete canonical payloads. Validator matches all33 independent Python fixtures in tests/fixtures/editor-boundaries.json. Logical errors are savable but not playable; close-colour warning is no certificate of visual quality. Other start skips same-permutation seed collisions; two movable tiles have one unsolved start.

400ms name/preview debounce says unsaved until receipt. Back/launch flush. EditorView survives busy/focus/error re-renders. Unknown writes keep the form and explicit retry with the same operation ID. Interrupted previews restore separately from nodes. Recovered forms use fresh edit IDs; apply/cancel consumes only that form and its explicitly recovered buffer. Two actual browser tabs cover this. CAS rejects stale whole-workspace writes; explicit stale Apply creates a branch of its original base and keeps the newer head. History selects revisions or resumes buffers, without automatic cell merging.

Author activeTest persists work/node/frozen Attempt; creative.playing controls current mode. Author actions are separate from campaign. Proof binds exact fingerprint/rules/node/attempt; clean/assisted bests are derived separately. Rename preserves proof; gameplay edits retain old proof in history without transferring it to different gameplay. Campaign attempts/completions/bests/rights/onboarding never change from author play. Input after author exit is rejected.

## Next work

1. **M4b**: ROADMAP_1_0.md, CONTENT_EDITOR_SPEC_0_1.md, SCREEN_STATE_SPEC_0_1.md. Clean +six earned PNG formats +system15-work chapter page; integer square tiles, exact sRGB, distinct logical works, actual font metrics, overflow error preserving text. Explicit native/web save/share with cancel/OS-denial/space/insufficient-work recovery. No renderer exists yet; do not call M4 complete.
2. Keep M2 tokens and read M2_ART_BIBLE before visual changes. Two licensed Cyrillic fonts, native150% text and owner review remain pending. Editor browser computed-font enlargement is smoke evidence only. No mass styling or new A/B/C contest.
3. Native SQLite/haptic/process-death/storage-pressure/touch remains NOT RUN; no runtime/ADB was available. Hosted Yandex, identity/cloud/ads are external gates. Production register71 NOT RUN; full release unfinished.

## Campaign contracts retained

First15 SHA25655efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51 and legacy attempt contentVersion remain unchanged. New45 are authored candidates; colour decisions027/037/053/060 unresolved. Firstfive sequential then free choice; later chapter at10, full page at15. Recommendations are not locks. All60 has no fake next chapter. Album never reveals unfinished targets. Copies inherit neither proof nor campaign credit.

## Tests/builds

142 unit;20 core +9 presentation +12 meta +19 editor +6 local SDK browser =66. npm run check, yandex:check, spec:check and strict pinned guidance doctor pass. test:editor includes actual UI author completion, two live tabs, physical IndexedDB and labelled fault/migration fixtures. All60 witnesses are replay evidence, not human/phone acceptance. Evidence/m4-editor-2026-11-19.json has exact source/APK hashes and limits.

Native: android:sync:release; Gradle debug/R8 releaseCheck; verify-apk.py on the exact artifact. Browser suites start Vite themselves; do not sync native concurrently because it may reload their pages. CHROMIUM_PATH accepts headless shell. Normalize generated capacitor.settings.gradle to ../../node_modules if symlink resolves into another scratch project; never commit that external path.

Runtime/guidance469928d03f4bae5053e23db26e82187bedbc252e, kit archive SHA256ba9088a0b937b3e86084666c36361ba47627ce833f4594aaf94e10eac62f1cc9. No silent update. Kit API inspected: consumer Session owns multi-table facts/receipt/CAS, not RevisionSnapshotQueue. KIT IMPACT: REUSE; no upstream/other-game edits. Actions host needs KIT_READ_TOKEN despite connected access; local builds use the verified cached pin.

## Preview signing/artifact

Read SIGNING_PREVIEW.md. Keep .preview3 and reuse the privately saved TEST key HUE-test-preview-signing.keystore via ANDROID_PREVIEW_KEYSTORE. Never regenerate/commit it or use it as production. Old0.2 .releasecheck signer was lost; never ask owner to uninstall that app and lose data. 0.4 certificate matches0.3; actual Android update is untested. Production base appId/certificate policy unchanged, signer null.

Delivered Poluson-M4a-0.4.0-preview.apk SHA2562d9a4d7d3867e5053077e17d27d99ded70ec829b5c189fa07491fcbc35754870. Package com.danilah.huegradients.preview3/versionCode4/certificate3293c7f8ab780b6204d8eb714177ff119dee76214b7278eb3eb5c7afcdf6ba85. APK saved separately for owner; code/docs backed by Git. Increment versionCode next time.
