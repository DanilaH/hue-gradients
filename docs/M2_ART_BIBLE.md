# M2 presentation slice — 18 November 2026

**21 Nov · latest owner direction.** Follow the [angular menus, visible tile dither and landing sequence brief](design/dreamy-psx/README.md) for the next presentation pass. Its sampled-area colour check supersedes the historical single-centre-pixel rule for displayed tiles. Export and underlying tile data retain exact colour contracts. The original body below documents the earlier baseline.

Status: EXECUTABLE OWNER-REVIEW CANDIDATE for ART-01…09. Latest playable feel preview is 0.4.31/V1.2. The 006 capture aligns the last gesture and compares the rhythm with 0.4.30. See the [V1.2 receipt](evidence/v12-dreamy-psx-2026-11-22.json). An original 12-second ambient loop is opt-in, controlled separately from effects and suspended in the background. [Queue G1](evidence/queue-g1-2026-11-20.json). Owner reference is docs/spec/reference/owner-art-reference.png (SHA256 872fd9800184a2e4cc52716cd258cbcb194841782745415ae6dd710aedc586ec). Its static concept establishes light, colour and texture.

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
- Background: the visible permutation feeds 3×3 Gaussian samples, variance .07. Nine tinted pools and three moving reflections provide the purple, peach and cyan light. The background uses a fixed 4×4 ordered texture, pixel scaling and a small CSS blur. The same canvas serves gameplay, result and picker. Chapters and locked levels use a neutral lighting palette.
- Motion: kit exponentialResponse blends the palette over a 260ms response constant. A glow tracks the pointer during drag. A confirmed swap adds an expanding diffuse wave at the destination, with a longer decay on the win. The picker moves under the finger during a swipe. The motion preference and system reduced motion stop ambient animation.
- Budget: one Canvas2D ambient, maximum 160×240 backing pixels, at most 24 draws/s while active. Phaser sleeps at rest and runs for direct input and the 150ms tile settling. Physical GPU, battery and frame-time acceptance are pending.
- Swap/win authority: snapshot/receipt transaction first, presentation afterwards. Same/pin/outside/cancel/failed writes are silent. Explicit unknown-receipt recovery and restored results do not replay success cues. All swaps get the same response without evaluating correctness.
- Swap sound: a procedural dry contact excites three closely related variants of glass resonance. The short cue lasts 136ms. The final contact has one 560ms buffer with an upper interval beginning 98ms into the cue. A one-shot prism glint starts at the upper tone. Kit OneShotPlayer replaces the previous glass cue with a short fade and bounds active voices. Native performHapticFeedback respects OS settings.
- Drag draws an empty matte recess at the origin. The lifted tile gets a shadow and a thin light edge, and its centre keeps the source RGB. The prism samples the four exact solved corner colours or four positions across a strip. Reduced motion leaves a static prism and active result controls.
- Root cream #fff2de, dark foundation #151020, foreground/dialog separation #21192d. Primary controls 48px; hit geometry stays independent from decoration. Modal top layer never intercepts after close.
- System reduced motion disables drift, settling, dissolve and prism floating. Preference changes are additive schema-1 data, committed atomically; old saves preserve all attempts/results/assistance.

## Typography and acceptance still pending

Current system-ui is PROVISIONAL. No bitmap/pseudo-pixel font was adopted. The required comparison of at most two bundled, licensed Cyrillic typefaces, final font decision and on-device fixed 100% typography check are NOT RUN. Do not label the current platform-dependent face an approved typography system. No mass styling of campaign/meta/editor was undertaken.

Owner acceptance on an actual build and a physical phone is pending. Browser screenshots/video are an honest desktop-emulation review aid, not phone evidence. M1 native SQLite/process death/storage pressure remains pending because no Android device/emulator is attached. Hosted Yandex, identity/cloud/live ads remain separate external gates.

The 0.4.5 review compares the same warm level 8 moves in 0.4.4 and 0.4.5, then shows cold level 2. Both new episodes include a cancelled drag, final exchange, the work card and the downloaded PNG. Audio is recorded directly from the same game Web Audio graph. [Build and capture evidence](evidence/feel-episode-2026-11-19.json).

KIT IMPACT: REUSE — OneShotPlayer and exponentialResponse added to existing lifecycle/DPR/teardown reuse. Palette, durations, audio synthesis, prism and guest preferences remain consumer policy. No common kit or other games changed.
