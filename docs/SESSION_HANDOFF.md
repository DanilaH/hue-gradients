# Resume — 19 November 2026

Read AGENTS.md, PROJECT_DECISIONS.md, STATUS.md, M4_EDITOR_IMPLEMENTATION.md and M4_EXPORT_IMPLEMENTATION.md. Owner authorized roadmap continuation. Bound file reads/output; no blobs/base64 or whole-archive re-reads. Commit checkpoints and preserve newer remote work. Branch feat/m0-foundation, draft PR #1; main still contains the original README.

## Current slice

0.4.2/versionCode6 implements the first approved UI simplification package: gameplay opens on the saved board, the compact HUD shows level/navigation/hint, and the first-swap cue is transient. The same hint persists assistance before revealing the solved field. The result shows the move count and chapter unlock if earned, with direct Next and Album actions. The board fades under the prize without delaying Next. The settings sheet contains restart and three toggles. Cancel and Back restore the source of a restart confirmation.

The picker opens on the active level's chapter in one tap. Switching chapters updates the same screen. A locked chapter shows its requirement and has no playable cells. A finished cell opens its album card, while a saved replay resumes from the picker. The picker Back returns to the same board. At the bare board Android system Back hands off to the host minimize behavior. Campaign rules, local data formats and export unlock thresholds stay compatible with 0.4.1. Album, editor and export workflow refinements are the second UI package.

Export derives verified work from official completion or author proof. Multiple revisions share one logical work ID and cannot fill multiple composition slots. First real author victory enables basic clean locally without adding official rights. Campaign formats use committed rights; daily formats stay closed until M6. The eight renderer geometries and chapter-page order follow the original spec, with exact square integer sRGB tiles. Actual Canvas text metrics reject overflow without truncation/shrink; existing provisional system font52px/line64px awaits M2 approval. Prepared PNG File is shared by preview and delivery; no export action writes workspace/progress/rights.

Web browserExportFiles invokes cached-file share/picker directly from the click. Fallback download is only requested, never falsely called saved. Errors/cancel keep preview/caption. Android nativeExport.ts is imported only by src/main.ts; web/Yandex bundle stays separate. HueExportPlugin uses document picker and package-specific non-exported FileProvider limited to cache/hue-exports. It drops base64 after private file preparation so large PNGs do not enter saved activity Bundles; UI launches/main thread, document IO/background writer. Keep its private ActivityCallback method/name through R8. verify-apk.py checks bridge/callback, installed authority, compiled narrow resource paths and no broad storage permissions. Chooser-open is not delivery/publication proof. Real native action runtime remains NOT RUN.

Workspace schema1 gains an optional-for-old-saves creative member with its own schemaVersion1. Session validates old snapshots then atomically commits conversion plus an exact raw backup before exposing M3 copies as editable roots. PolicyVersion stays campaign-meta-1; missing creative triggers migrate-creative-local. Unknown schemas/corruption stop loading, never become empty defaults. Local-migration-backup facts are archival, never completion facts during M5 transfer.

Creative works own draft/work IDs, immutable nodes (field/parent/SHA-256/rules/seed), head, preview buffers and author receipts. M3 albumCopies remain immutable provenance seed records; do not overwrite them when editing/renaming. Decoder requires every original copied node to remain exact.

Fingerprint covers dimensions, exact uppercase visible sRGB, sorted pins and full start; excludes metadata/seed/unused corners. Session checks each SHA with WebCrypto before exposure; digest caching keys are complete canonical payloads. Validator matches all33 independent Python fixtures in tests/fixtures/editor-boundaries.json. Logical errors are savable but not playable; close-colour warning is no certificate of visual quality. Other start skips same-permutation seed collisions; two movable tiles have one unsolved start.

400ms name/preview debounce says unsaved until receipt. Back/launch flush. EditorView survives busy/focus/error re-renders. Unknown writes keep the form and explicit retry with the same operation ID. Interrupted previews restore separately from nodes. Recovered forms use fresh edit IDs; apply/cancel consumes only that form and its explicitly recovered buffer. Two actual browser tabs cover this. CAS rejects stale whole-workspace writes; explicit stale Apply creates a branch of its original base and keeps the newer head. History selects revisions or resumes buffers, without automatic cell merging.

Author activeTest persists work/node/frozen Attempt; creative.playing controls current mode. Author actions are separate from campaign. Proof binds exact fingerprint/rules/node/attempt; clean/assisted bests are derived separately. Rename preserves proof; gameplay edits retain old proof in history without transferring it to different gameplay. Campaign attempts/completions/bests/rights/onboarding never change from author play. Input after author exit is rejected.

## Next work

1. **Next: level and chapter picker.** Follow [the UI refinement plan](UI_REFINEMENT_PLAN.md), starting with one large board preview and one action for the selected level. Then simplify collection and PNG, editor, and field/result details in that order. Verify saved attempts, older drafts and exports using normal entry points. Cloud/account synchronization (M5) remains on hold. A real shared daily requires its published catalog and trusted time.
2. Keep M2 tokens and read M2_ART_BIBLE before visual changes. Two licensed Cyrillic fonts, native150% text and owner review remain pending. Editor browser computed-font enlargement is smoke evidence only. No mass styling or new A/B/C contest.
3. Native SQLite/haptic/process-death/storage-pressure/touch remains NOT RUN; no runtime/ADB was available. Hosted Yandex, identity/cloud/ads are external gates. Production register71 NOT RUN; full release unfinished.

## Campaign contracts retained

First15 SHA25655efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51 and legacy attempt contentVersion remain unchanged. New45 are authored candidates; colour decisions027/037/053/060 unresolved. Firstfive sequential then free choice; later chapter at10, full page at15. Recommendations are not locks. All60 has no fake next chapter. Album never reveals unfinished targets. Copies inherit neither proof nor campaign credit.

## Tests/builds

149 unit. The 0.4.2 browser suite has 21 core, 9 presentation, 11 meta, 19 editor, 9 export and 6 local SDK scenarios. The core suite checks the picker, settings and result at 320×568, reads the exact saved state after Back, and covers enlarged text. npm run check, yandex:check, spec:check and strict doctor pass. test:editor includes actual author UI and two live tabs. test:export includes actual Chromium download and eight Canvas PNGs decoded independently by tools/check-export-pixels.py (Pillow pinned in tools/requirements-test.txt). Its30 campaign/two author checkpoints, daily rights and share/save-picker responses are explicitly fixtures. All60 witnesses remain replay evidence, not human/phone acceptance. Evidence/m4-export-2026-11-19.json has exact source/APK hashes and limits.

Native: android:sync:release; Gradle debug/R8 releaseCheck; verify-apk.py on the exact artifact. Browser suites start Vite themselves; do not sync native concurrently because it may reload their pages. CHROMIUM_PATH accepts headless shell. Normalize generated capacitor.settings.gradle to ../../node_modules if symlink resolves into another scratch project; never commit that external path.

Runtime/guidance469928d03f4bae5053e23db26e82187bedbc252e, kit archive SHA256ba9088a0b937b3e86084666c36361ba47627ce833f4594aaf94e10eac62f1cc9. No silent update. Kit API inspected: consumer Session owns multi-table facts/receipt/CAS, not RevisionSnapshotQueue. KIT IMPACT: REUSE; no upstream/other-game edits. Actions host needs KIT_READ_TOKEN despite connected access; local builds use the verified cached pin.

## Preview signing/artifact

Read SIGNING_PREVIEW.md. Keep .preview3 and reuse the privately saved TEST key HUE-test-preview-signing.keystore via ANDROID_PREVIEW_KEYSTORE. Never regenerate/commit it or use it as production. Old0.2 .releasecheck signer was lost; never ask owner to uninstall that app and lose data. 0.4.1 certificate matches0.3/0.4.0; actual Android update is untested. Production base appId/certificate policy unchanged, signer null.

Delivered Poluson-0.4.2-preview.apk, SHA-256 7fca67e899040bc49dc9151a277e41eeffa75bca34a71ccc01997cc52111f5e4. Package com.danilah.huegradients.preview3, versionCode6. See evidence/compact-play-2026-11-19.json for the exact build and limits. Increment versionCode next time.
