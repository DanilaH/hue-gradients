# Session handoff
Read AGENTS.md, PROJECT_DECISIONS.md, STATUS.md and relevant docs/spec/PRODUCT_SPEC_1_0.md / ROADMAP_1_0.md. Owner authorized implementation. Delivered platform foundation and head start on M1; not complete M0 or playable game.
Runtime/guidance469928d03f4bae5053e23db26e82187bedbc252e; spec812b926ebfc82c6b0e5f3c6506145de2331028a0. New Android bootstrap supersedes older spec's missing-bootstrap warning; its KV is still not transactional game storage.

Next M1 package:
1. Implement src/local-store/contracts.ts with native SQLite + web IndexedDB; one snapshot+facts/outbox+ledger transaction, CAS, retries/unknown response and corruption recovery.
2. Integrate src/domain/puzzle.ts into shared playable first-five route, all15 definitions. Canonical render/hit geometry; pointerup final coordinates; cancel/resize/background/second pointer no mutation.
3. Persist assist before help, separate clean/assisted bests, unique completion/rights, restart confirmation and onboarding. Network not on accepted move path.
4. Replace the two sample scenes/counter while preserving tested host contracts. Keep SDK entrypoints separate and share actual game module.
5. Execute true store/process-death/two-tab and phone checks. Then M2 implements one actual gameplay/win against owner reference; at most2 font candidates.

Do not regenerate first15. SHA256:55efdbd17d6e77c23753ea5f6b494de25e02c3c8a05459a92fbbcee8eb34ae51.15 independent witnesses already run through TS reducer. Production rows remain NOT RUN until complete actual scenarios.
Identity/hosted SDK/devices need M0_GATES settings. Production signer unconfigured; R8 artifact test-signed. Full daily/editor/cloud/meta scope remains. KIT IMPACT:REUSE.
