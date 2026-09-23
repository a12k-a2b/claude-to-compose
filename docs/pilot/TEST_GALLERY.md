# Try the standalone Note Overlay design proof

This is a separate synthetic-data Android test app. Installing or opening it
does **not** restyle the real Note Overlay app or touch real notes. The code is
on `codex/design-gallery-proof` in `claude-to-compose`; the production app
repository is deliberately unchanged.

From `android/`, run:

```sh
./gradlew :app:assembleDebug :app:testDebugUnitTest --offline --no-daemon
```

The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. The
local checkpoint built at `b9050c1` has SHA-256
`f1c7bef9ac20b605d1ccec07fbe289fd945d7a97cc1c0dfec3f1a195e1c2caef`;
a fresh build may have a different hash. You can install that APK on an Android
emulator or a device you choose using normal Android tooling. No device install
or DC-1 hardware check has been performed by this project gate.

The launcher has two tabs:

- **Floating overlay**: da63, with a synthetic article. Tap tools, document,
  opacity, history, and menu to inspect native state changes.
- **Exploration gallery**: all e34f source section/figure IDs are navigable.
  Only `6a`–`6d` currently render native docked-band variants. An explicit
  `BLOCKED` label means the item is inventoried but not implemented; do not
  mistake it for a replica.

For the exact source references and current mismatch evidence, see
`REFERENCE_CAPTURE_EVIDENCE.md`, `SCENE_MATRIX.md`, and `VISUAL_GATE.md`.
The source-to-agent handoff packet at
`/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/gallery-packet-v3/`
is local evidence and not bundled with the APK. Its native/UX gates are
`BLOCKED`; a working menu or passing unit tests do not establish visual parity.
