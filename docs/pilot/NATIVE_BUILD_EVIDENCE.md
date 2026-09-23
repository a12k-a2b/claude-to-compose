# Standalone native gallery build evidence

This is a synthetic-data Android proof in `claude-to-compose`, **not** the
production Note Overlay. The Note Overlay checkout remains clean at revision
`8807a760aaf8de0bcc228ba3f87768d9c4cab6e4`; no design branch or app-code
change was made there.

At gallery code revision `c688907` on `codex/design-gallery-proof`, the offline
command below completed with exit 0 on 2026-09-23 (UTC):

```sh
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest --offline --no-daemon --max-workers=1
```

The 11 XML suites in `android/app/build/test-results/testDebugUnitTest/` total
**51 tests, 0 failures, 0 errors, 0 skips**. They cover the launcher and
synthetic gallery state, component navigation, bounded popup hit targets,
returning synthetic pulse, source-ID inventories, render capture, and visible
negative controls. The debug APK is
`android/app/build/outputs/apk/debug/app-debug.apk`, SHA-256
`91849cbccb8cee5590408106a801dd03969bfc09e8f5a8cac166fe17c01d1047`
(about 17 MB). This is a local debug artifact, not a signed release candidate.

The launcher switches between the da63 floating-overlay study and the e34f
exploration gallery. Da63 has synthetic article context and native tool,
opacity, document, history, and menu state. The e34f router contains all 35
source section IDs and 33 figure selectors; 31 sections route native synthetic
studies. The four editorial parent IDs `6`, `4`, `explore`, and `mild` visibly
say `BLOCKED`. All figure-bearing sections are routed, but routing proves
neither source-like layout nor source-equivalent behavior.

The exact-size, hash-pinned da63 landscape top-band comparison is **FAIL**:
`4.040023` MAE against a provisional `4.0` limit. Its deliberately wrong
toolbar scores `52.566824`. The report is
`android/app/build/da63-gallery-evidence/final-integrated-strict-report.json`.
That crop cuts off the pill bottoms, so passing it alone would not prove full
fidelity. E34f scaled comparisons are diagnostic only; strict same-size
reference/native parity is `BLOCKED`. Source motion, pen gestures and ink
physics, complete accessibility/input audits, emulator or physical DC-1 runs,
production persistence, and real-app integration are also `BLOCKED`.

The focused pilot-tool tests passed 18/18, covering capture inventory, packet
construction, strict comparison, and fail-closed repair packets. A Daylight QA
doctor run found local build tools but skipped the device probe because this
sandbox could not start the ADB listener. Neither result changes the native
visual or device gates. The earlier `b9050c1` APK/checkpoint had only 18
Android tests and a 5.651 da63 top-band MAE; it has been superseded by this
code/artifact pair.
