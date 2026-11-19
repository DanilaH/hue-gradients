# Internal preview signing

Production appId remains com.danilah.huegradients; production signer is still unconfigured and no production key has been generated.

The transient environment did not retain the internal test key used for 0.1/0.2 (package com.danilah.huegradients.releasecheck). Do not claim that a newly signed APK can update that installation or ask the owner to uninstall it and lose its data.

0.3 uses an isolated testPackageSuffix .preview3 and a retained consumer-owned TEST key. It installs alongside 0.2 and starts its own guest workspace. Browser fixture migrations prove the legacy data transformation; an actual Android update/migration is NOT RUN. The label is Poluson/Полусон · preview. Source identity/versionCode remain separately governed.

The new TEST key is stored privately under the exact filename HUE-test-preview-signing.keystore. Future sessions should resolve/materialize that existing file and pass its path as ANDROID_PREVIEW_KEYSTORE. The preview signing config uses the standard Android debug alias/credentials already declared in app/build.gradle. Never silently regenerate this key, change .preview3 again, or commit its bytes to Git. Reuse this test identity and increase versionCode for subsequent test updates.

Do not confuse this convenience test key with a future RuStore production keystore or register it as a production identity proof. Production key creation/publication remains a separate owner-authorized release step. The public fingerprint and exact package for this APK are in evidence/m3-campaign-2026-11-19.json.
