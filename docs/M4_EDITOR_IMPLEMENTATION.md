# M4a — local editor, 19 November 2026

Build 0.4.0/versionCode4. This completes the local editor/revision/author-play slice (roadmap M4 items 1–3). PNG renderers, export composition and native/web download/share (items 4–5) remain M4b. The full M4 gate is not PASS.

## Behaviour

The editor is available from Home before any campaign completion. New works start at 4×4 with their own palette, corner pins, fixed seeded start and independent draft/work/node IDs. Completed campaign copies retain their provenance and immutable source revision. They never inherit an author proof.

Size, corner colours, pins and start are editable in distinct modes. Changes first affect a preview. Apply creates one immutable node; Cancel restores the previous node. Size changes reset pins to corners or line endpoints. A single row/column normalizes unused corner parameters. Other start searches for an actually different single-cycle permutation; with only two movable tiles, only one unsolved start exists and that action is unavailable. Replay uses the full saved permutation.

The pure validator matches all 33 independent Python boundary fixtures, including half-up sRGB interpolation, duplicate colours, ambiguous orientations and the chosen close-colour warning. A warning is a review trigger, not a certificate of visual accessibility. Invalid logical drafts remain editable and savable but cannot be launched. Malformed persisted fields stop loading rather than becoming empty data.

Names are plain text, trimmed, defaulted when empty, and limited to 80 Unicode code points. Rename changes metadata without creating a gameplay node or erasing verification. SHA-256 covers canonical dimensions, exact uppercase visible RGB, sorted pins and full start; metadata, seed and unused corner inputs are excluded. WebCrypto checks every saved node before Session exposes it; cached results are keyed by the complete canonical payload.

Author play reuses PuzzleScene, input geometry, rules and durable feedback. Its frozen node/attempt and separate assisted/clean results are stored in the creative workspace. Campaign attempts, completions, bests, rights and onboarding are untouched. Edits in another tab do not replace a running author snapshot. Suspended author input cannot mutate it after exit.

## Durability and conflict recovery

Workspace schema1 gains a separately versioned creative member. Old M3 snapshots without it are validated and converted before use, with an exact raw backup committed in the same snapshot/facts/receipt transaction. Existing campaign and seed-copy records remain exact. Backup facts are archival and must never become completion facts during M5 transfer.

Name/preview debounce is 400ms. The UI says changes are unsaved until a physical receipt is confirmed. Back and author launch flush pending input. A saved preview buffer is separate from the committed node and restores after interruption. Process death before confirmation can return the last confirmed state; the UI does not promise otherwise.

Every recovered form receives a fresh edit ID. Applying or discarding consumes only that form and its explicitly recovered buffer, preserving another tab's variant. CAS rejects stale whole-workspace writes. Retrying an explicit stale Apply stores a child of its original base as a recoverable branch and preserves the current head. History lets the user select a saved version or continue a preview; no automatic cell merge occurs.

A failed or unknown editor write keeps the actual form/input visible. Explicit retry resolves the same prepared operation, including response loss after commit. Invalid unconfirmed input on exit offers Stay/exit without those edits. Local success says saved on device and makes no cloud claim.

## Evidence and limits

- 142 unit tests, including 33 independently frozen editor inputs/results and all 60 campaign witnesses.
- 19 editor Chromium scenarios: actual author completion, reload, help, invalid draft, immutable revisions, rename, two live editor tabs/branch UI, quota failure/retry, M3 migration/rollback, portrait/short landscape/tablet and 150% computed text size.
- Retained 20 core + 9 presentation + 12 meta + 6 local Yandex SDK scenarios: 66 browser scenarios in total. SDK cases are local stubs, not a hosted deployment.
- Exact build/source/artifact checks are recorded in evidence/m4-editor-2026-11-19.json.

Physical Android touch/SQLite/process death/storage pressure and owner typography/art acceptance remain NOT RUN. Browser text enlargement is not native font acceptance. The production acceptance register remains 71 NOT RUN; this document does not promote a local test to release acceptance.

Guidance routes: UX_AND_ART_SYSTEM and STABLE_PROGRESS_UI at pinned469928d03f4bae5053e23db26e82187bedbc252e, plus the consumer editor specification. Existing cream/dark tokens and 48px primary controls are reused; no mass art or new font direction. The kit public API was inspected. RevisionSnapshotQueue does not own the consumer's multi-table snapshot+facts+receipt/CAS transaction, so durable editor mutations use the existing Session seam. KIT IMPACT: REUSE; no upstream API, dependency pin or other game repository changed.
