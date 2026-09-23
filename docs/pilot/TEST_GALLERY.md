# Try the standalone Note Overlay design proof

This is a separate synthetic-data Android test app. Installing or opening it
does **not** restyle the real Note Overlay app or touch real notes. The code is
on `codex/design-gallery-proof` in `claude-to-compose`; the production app
repository is deliberately unchanged.

From `android/`, run:

```sh
./gradlew :app:assembleDebug :app:testDebugUnitTest --offline --no-daemon
```

The `--offline` flag matches the verified local build; omit it on a fresh
machine that must download Gradle dependencies. Run from the gallery branch,
not the production Note Overlay repository.

The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Verify
the exact APK you build with `shasum -a 256` before comparing results; an older
checkpoint hash is not evidence for newer scenes. You can install that APK on
an Android emulator or a device you choose using normal Android tooling. No
device install or DC-1 hardware check has been performed by this project gate.

The launcher has two tabs:

- **Floating overlay**: da63, with a synthetic article. Tap tools, document,
  opacity, history, and menu to inspect native state changes.
- **Exploration gallery**: all e34f source section/figure IDs are navigable.
  Native studies cover 31 of 35 sections, including every figure-bearing
  section and the docked, frosted, floating, rotation, journey, gesture/ink,
  and mildliner families. The four editorial parent sections (`6`, `4`,
  `explore`, `mild`) carry an explicit `BLOCKED` label. A selectable native
  study is not a pixel-parity claim; compare it with its pinned web reference
  before judging fidelity.
  Scroll the scene-ID strip horizontally to reach later entries; figure buttons
  appear beneath it when a section has multiple captured variants.

For the exact source references and current mismatch evidence, see
`REFERENCE_CAPTURE_EVIDENCE.md`, `SCENE_MATRIX.md`, and `VISUAL_GATE.md`.
The source-to-agent handoff packet at
`/Users/anjan/Documents/SolOS/note-overlay-retrofit-pilot/gallery-packet-v4/`
is local evidence and not bundled with the APK. Its native/UX gates are
`BLOCKED`; a working menu or passing unit tests do not establish visual parity.
