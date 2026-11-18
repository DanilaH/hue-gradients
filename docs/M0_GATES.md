# External gates — 18 November 2026
M0 as a whole is PARTIAL. Missing configuration is not proof of platform unavailability. No external account/proof exchange was attempted; no contracts/store publication were created.

| Gate | Concrete missing item | Next verification |
| --- | --- | --- |
| G01 Android identity | Registered Yandex ID client_id, API/domain and exact app-link redirect bound to package/certificate | Real code+PKCE/state/backend validation, wrong-client/replay rejection |
| G01 web identity | Yandex Games draft appId and signed Player secret capability | Real SDK proof exchange; no bare playerId fallback |
| G02 devices | Minimum and medium physical Android model, OS, WebView | Input/lifecycle/rotation, p95/startup |
| G02 hosted web | Actual Yandex draft debug upload | Loading/Gameplay APIs, pause/resume, offline/storage |
| G04 infrastructure | Owner-controlled Russian hosting/API domain/PostgreSQL, backup/privacy process | Staging and two-device cloud in M5 |
| G06 ads | App-specific native SDK/unit IDs; web sticky API control | M7 real callbacks/geometry/first-five protection |
| CI private kit | Actions KIT_READ_TOKEN with read-only kit access | Clean pinned checkout and packed-runtime CI |
| Production signing | Retained keystore/public SHA256 | Exact production signer acceptance in M8 |

Signed-player secrets, DB/session keys and any OAuth server credentials are server-only; never client .env/source/logs. Public client ID, draft appId, redirect and certificate pin are recorded only when actually configured. Core M1 can continue while gates remain open. If signed proof is unavailable, review the identity contract rather than weakening it or adding paid products automatically.
