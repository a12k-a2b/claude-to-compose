# Developer Handoff Guide: Daylight DC1 Onboarding Screen

## Overview

This screen was synthesized by the **Claude-to-Compose v2 Design Compiler** from the approved Claude Design artifact. It targets the physical **Daylight Computer (DC1)** 10.5-inch transflective LivePaper display (`1184 × 1584` px, `592 × 792` dp @ 2x density).

---

## 1. Composable Entry Point

The screen entrypoint is located at:
`android/app/src/main/java/com/claude/compose/screen/GeneratedDc1Screen.kt`

```kotlin
@Composable
fun GeneratedDc1Screen(
    onSkipClick: () -> Unit = {},
    onGetStartedClick: () -> Unit = {},
    onChipSelected: (String) -> Unit = {},
    modifier: Modifier = Modifier
)
```

---

## 2. Invariant Rules for Coding Agents (Codex / Claude Code)

To prevent visual drift and maintain the >= 85% Ink IoU / >= 90% Contour alignment gate:

1. **Do NOT Alter Container Insets or Spacing**:
   - The headline, subtitle, and CTA button positions are derived from the design contract.
   - Do not wrap the root `Box` in arbitrary `Scaffold` padding or generic `Column` arrangements that alter vertical offsets.
2. **Do NOT Replace Font Resources**:
   - The headline requires `AbcArizonaFlare` (`opsz = 48f`).
   - The brand kicker requires `AbcRomMono`.
   - The body text requires `AbcArizonaSans`.
3. **Preserve Touch Target Compliances**:
   - The "Skip" button and "Get started" button already enforce `minimumInteractiveComponentSize()` (>= 48dp). Maintain this wrapper during click wiring.
4. **State Hoisting**:
   - Route `onSkipClick` to your app's navigation controller (e.g., skip onboarding to home/reader route).
   - Route `onGetStartedClick` to the permission or notebook creation intent.
   - Connect `onChipSelected` to your paper motion preference datastore.

---

## 3. Visual Regression Verification Commands

Before committing any functional additions, run the regression gate:

```bash
# 1. Compile & run headless preview render
cd android && ./gradlew testDebugUnitTest --tests com.claude.compose.GeneratedScreenScreenshotTest

# 2. Run fail-closed perceptual diff and contour verification
node verification/run_diff.js
```

All quality gates must report:
- **Verdict**: `PASSED` (`PROCEED_PUBLISH`)
- **Foreground Ink IoU**: >= 85.0%
- **Sobel Contour Alignment**: >= 90.0%
- **Maximum Spatial Shift**: <= 3.0px
