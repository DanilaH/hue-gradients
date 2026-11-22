# Android host baseline

Pinned mini-games-kit: 469928d03f4bae5053e23db26e82187bedbc252e. Native identity com.danilah.huegradients, orientation
responsive; each was explicitly chosen during generation. The neutral vector
icon and sample counter are technical examples, not approved store identity/content.

The native content root owns system/cutout insets exactly once. SystemBars automatic
inset handling is disabled; do not add native CSS `env()` padding for the same bars.
The browser preview separately uses CSS safe areas. Test any banner/fullscreen SDK
integration against the **actual WebView/root bounds**, following the pinned placement
contract; the host has no implicit reserved advertising slot.

Native and document lifecycle blockers are independent. Native listener completion
after disposal must be removed; stale initial getState must not undo a newer pause.
Root Back minimizes; an actual game's navigation handles its own child surfaces first.
Phaser's authored first POST_RENDER precedes uncover/ready. The sample uses a capped
DPR and dirty paints, not a permanent idle animation loop.

GameStorage exposes atomic get/set/remove/list of string values, a process-wide disk
queue, readback verification and 4MiB/value limit. It owns no codec, archive format,
earned receipt, reminder projection or save merge. Do not turn failed reads into a
fresh install. Use kit ordered repositories/receipt contracts with app-owned codecs.
`list` is intentionally native-only; StorageAdapter keeps its portable three-method API.

android-project.json is the public version/package/orientation/certificate contract.
Never change a published appId/signing key as a workaround. For first production use,
create/retain your signing material privately, put the **public SHA256 certificate**
in that file and set Actions secrets ANDROID_RELEASE_KEYSTORE_BASE64,
ANDROID_RELEASE_STORE_PASSWORD, ANDROID_RELEASE_KEY_ALIAS, ANDROID_RELEASE_KEY_PASSWORD.
No private values enter source/logs; the tool refuses overwrites and restores0600.
No automatic production key generation or store upload exists. Store release is a
manual build workflow; an actual game still needs its policy, SDK, phone and store QA.

Release mode strips the startup debug import and rejects configured lab/debug markers.
WebView debugging=false, bridge logs only in debug builds; optimized builds require
release web stamp. Verify actual APK with apksigner/zipalign16K/aapt/dexdump, exact web
files, native bridge survival and actual signer. Configure application-specific SDK
IDs and schema checks when adding those services; an unused env value is not integration.

Use a USER emulator (`google_apis_playstore`, ro.debuggable=0) for inspection-disabled
acceptance. AOSP userdebug/eng forces WebView inspection even when the app asks false.
tools/smoke-android.py checks the real releaseCheck with Android UI/input, durable tap
save/cold restoration, root Back/foreground, responsive rotation and no debug socket.
It installs no JS/mock transport and never substitutes a production signer. Native
state/UI evidence does not establish physical feel, live ads, dashboard delivery or
publication. Preserve exact source/APK/certificate/environment/limits in each report.
