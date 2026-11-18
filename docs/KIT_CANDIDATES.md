# Kit impact — M1 local slice

Runtime/guidance: 469928d03f4bae5053e23db26e82187bedbc252e. Routes used: transactional saves and direct/accessible input. No upstream change or other consumer upgrade.

REUSE: GameplayActivityCoordinator, document visibility, native lifecycle bootstrap, getRenderPixelRatio and renderer teardown.

CANDIDATE, one consumer: narrow SQLite/IndexedDB snapshot+facts+ledger storage with revision CAS and readOperation recovery. Physical browser coverage: rollback, two tabs, duplicate IDs, unavailable receipts and retry identity. Native runtime remains NOT RUN. The kit's JsonStorageRepository/RevisionSnapshotQueue do not offer a physical multi-record transaction. DurablePendingTransactionSession deliberately stages durable work before a later commit; the game's accepted move is one atomic transaction without an intermediate presentation stage. Do not wrap it just to add a second write. A second game with the same invariant would justify extraction; keep puzzle best/rights/schema policy local.

CANDIDATE, one consumer: optional Yandex SDK attachment after a local first frame. The current bootstrap runtime awaits SDK init/getStorage; this consumer needs no SDK metadata for local IndexedDB. Six local stub/failure scenarios exercise delayed Loading/Gameplay callbacks and additive blockers. Hosted production behavior is not proven; no kit patch is proposed as already implemented.

Input stays local: installTouchActivation is for HTML button docks following captured gestures, not a rounded puzzle-grid gesture state machine. This slice's lostpointercapture and resize-release regressions are tested in tools/m1-browser-check.mjs. No general input engine was added.
