# M2 presentation slice — 18 November 2026

Status: EXECUTABLE OWNER-REVIEW CANDIDATE, not accepted ART-01…09. Build 0.2.0, Android versionCode 2. Owner reference remains docs/spec/reference/owner-art-reference.png (SHA256 872fd9800184a2e4cc52716cd258cbcb194841782745415ae6dd710aedc586ec). Its static concept establishes light/colour/texture, not measured motion.

## Confirmed gaps and implemented changes

| Before (M1) | Current slice | Evidence / limit |
| --- | --- | --- |
| Static corner-colour wallpaper | Full-viewport spatial colour clouds, grain and dark edges | Spatial permutation test; owner still judges resemblance/light/texture |
| Instant canonical swap only | 150ms cubic settling after durable commit; next gesture finishes it immediately | Real UI scenarios; no phone timing claim |
| Plain result card | Field dissolves for 650ms into ambient, one own faceted prism and immediate result actions | Actual UI video on gradient-005; CTA never waits for tween |
| No sound or haptic settings | Original procedural swap/win sound through kit OneShotPlayer; native system haptics; separate persisted toggles | Real browser audio/haptic instrumentation; native haptic runtime NOT RUN |
| No motion controls | Persisted background/motion preference; system reduced-motion override; no idle RAF in paused/hidden states | Real browser frame-count checks |

## Visual and behaviour tokens

- Colour authority: level.solvedTileColors[tileId] on opaque Phaser tiles. No ambient blend, grain, blur, score or correctness effect touches their fill. Pin is a black/white marker; selection remains a separate contrast outline. Spatial sampling only uses visible colours/positions.
- Background: 3×3 Gaussian samples, variance .07, saturation 2.3 only in ambient, radius .62 of its short backing side. Consumer artistic tuning, not kit defaults. Fixed grain seed; no flashing noise. Small slow drifts (.13/.11rad/s), colour response 420ms via kit exponentialResponse, pointer trail decay 300ms.
- Budget: one Canvas2D ambient, maximum 240×320 backing pixels, at most 24 draws/s while active. Phaser sleeps at rest and runs only for direct input/150ms settling. This is a configured budget; phone GPU/battery/p95 not measured.
- Swap/win authority: snapshot/receipt transaction first, presentation afterwards. Same/pin/outside/cancel/failed writes are silent. Explicit unknown-receipt recovery and restored results do not replay success cues. All swaps get the same response without evaluating correctness.
- Swap sound: own 95ms decaying 330/660Hz tone. Win: own 550ms C4/E4/G4 phrase. No third-party audio file/license. Kit OneShotPlayer owns bounded voices and dropped/expired cues; no cue queue resumes after background. Native performHapticFeedback respects OS settings without a vibration permission.
- Root cream #fff2de, dark foundation #151020, foreground/dialog separation #21192d. Primary controls 48px; hit geometry stays independent from decoration. Modal top layer never intercepts after close.
- System reduced motion disables drift, settling, dissolve and prism floating. Preference changes are additive schema-1 data, committed atomically; old saves preserve all attempts/results/assistance.

## Typography and acceptance still pending

Current system-ui is PROVISIONAL. No bitmap/pseudo-pixel font was adopted. The required comparison of at most two bundled, licensed Cyrillic typefaces, final font decision and 150% font check are NOT RUN. Do not label the current platform-dependent face an approved typography system. No mass styling of campaign/meta/editor was undertaken.

Owner acceptance on an actual build and a physical phone is pending. Browser screenshots/video are an honest desktop-emulation review aid, not phone evidence. M1 native SQLite/process death/storage pressure remains pending because no Android device/emulator is attached. Hosted Yandex, identity/cloud/live ads remain separate external gates.

Actual review episode: solve the first four through UI, then record gradient-005: drag → accepted swaps → committed win → exact field → result. No injected board/completion or generated frames. tools/record-m2-preview.mjs reproduces it. Internal video is 390×844; deliverable is an MP4 plus the test-signed APK.

KIT IMPACT: REUSE — OneShotPlayer and exponentialResponse added to existing lifecycle/DPR/teardown reuse. Palette, durations, audio synthesis, prism and guest preferences remain consumer policy. No common kit or other games changed.
