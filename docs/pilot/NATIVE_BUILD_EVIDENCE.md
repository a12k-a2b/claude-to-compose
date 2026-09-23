# Standalone native gallery build evidence

This is a synthetic-data Android proof app in `claude-to-compose`, **not** the
production Note Overlay. The Note Overlay clone remains at clean revision
`8807a760aaf8de0bcc228ba3f87768d9c4cab6e4` with no design branch or
app-code changes.

At `claude-to-compose` revision `b9050c1` on `codex/design-gallery-proof`, the
offline command `./gradlew :app:assembleDebug :app:testDebugUnitTest --offline
--no-daemon` completed successfully. The five unit-test XML suites contain
18 tests, zero failures, zero errors, zero skips: four da63 gallery tests,
four e34f gallery tests, and ten pre-existing tests. The debug APK is
`android/app/build/outputs/apk/debug/app-debug.apk`, SHA-256
`f1c7bef9ac20b605d1ccec07fbe289fd945d7a97cc1c0dfec3f1a195e1c2caef`.
This hash identifies a local debug artifact, not a signed release candidate.

The launcher switches between the da63 floating-overlay proof and the e34f
exploration gallery. Da63 has native tool selection, opacity, document, undo,
redo, and menu state. E34f has a 35-section/33-figure index; only the four
docked toolbar variants `6a`, `6b`, `6c`, and `6d` have native implementations
and basic working controls. Other sections explicitly display `BLOCKED` in
the app. A source ID in the menu is not an implemented scene.

The visual result is **FAIL**, not 100% fidelity. The strict landscape da63
toolbar comparison is `5.651` MAE against a provisional `4.0` pilot limit;
the deliberate wrong-toolbar control is `54.141` (see `VISUAL_GATE.md`). The
e34f team's scaled comparisons are diagnostic only and do not pass the strict
same-size gate. The gallery has no accepted animation timeline, stylus input,
accessibility target audit, physical DC-1 run, production persistence test, or
real-app integration evidence. Those outcomes remain `BLOCKED`.
