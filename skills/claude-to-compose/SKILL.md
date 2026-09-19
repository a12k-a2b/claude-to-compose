---
name: claude-to-compose
description: Convert Claude Design web artifacts into production-ready Jetpack Compose Android applications with verified visual and UX fidelity
---

# Claude to Compose: Antigravity Custom Skill & Multi-Agent Workflow

The `claude-to-compose` skill automates the translation of web-based Claude Design shareable artifacts (`claude.site`, `claude.ai/share`) and local HTML/CSS bundles into production-grade, idiomatic Android Jetpack Compose Material 3 applications.

This skill orchestrates a 4-agent autonomous pipeline that performs headless DOM and asset extraction, architectural Kotlin synthesis, native UX touch and motion mapping, and dual-track programmatic and perceptual visual verification.

---

## Slash Command Workflow Trigger

The primary user entry point is the `/claude-to-compose` slash command.

### Syntax
```bash
/claude-to-compose <input-url-or-file> [options]
```

### Parameters & Arguments
- `<input>` (Required): Target URL (`https://claude.site/...`, `https://claude.ai/share/...`) or local HTML file path (`tests/fixtures/s1_saas_dashboard/index.html`).
- `-o, --output <dir>`: Spec and screenshot output directory (default: `./output`).
- `-a, --android-dir <dir>`: Android project root directory (default: `./android`).
- `-p, --package <pkg>`: Base Kotlin package name (default: `com.claude.compose`).
- `--viewport <types>`: Viewports to extract: `mobile`, `desktop`, or `both` (default: `both`).
- `--clean`: Clean output and generated directories before execution.
- `--skip-extract`: Skip extraction if a validated `design_spec.json` already exists.
- `--skip-gradle`: Skip Gradle compilation and preview rendering (for offline/dry-run environments).
- `--max-iterations <n>`: Maximum iterative refinement attempts if visual similarity < 90 (default: `3`).
- `--min-score <n>`: Minimum verification rubric pass threshold (default: `90`).
- `--debug`: Enable verbose diagnostic logging.

### Invocation Examples
```bash
# Ingest remote Claude shareable link
/claude-to-compose https://claude.site/artifacts/4a1b2c3d -o ./output/saas_spec

# Ingest local HTML artifact fixture
/claude-to-compose tests/fixtures/s1_saas_dashboard/index.html -o ./output/dashboard --package com.claude.compose

# Headless extraction CLI invocation (direct engine execution)
node bin/claude-extract.js tests/fixtures/s1_saas_dashboard/index.html -o ./output/dashboard --viewport both

# Autonomous end-to-end workflow runner
node skills/claude-to-compose/workflow.js tests/fixtures/s1_saas_dashboard/index.html
```

---

## Pipeline Execution Phases

The end-to-end translation pipeline transitions sequentially through three primary phases: **Extraction**, **Synthesis**, and **Verification**.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            PIPELINE ARCHITECTURE                             │
└──────────────────────────────────────────────────────────────────────────────┘
 [Input URL / HTML]
         │
         ▼
┌──────────────────┐
│ EXTRACTION PHASE │  Extractor Agent (Playwright Engine)
│                  │  • Hydration barrier & frame piercing
│                  │  • Computed layout, typography, colors, shadows, borders
│                  │  • SVG vector parsing & multi-viewport screenshots
└────────┬─────────┘
         │ Artifacts: design_spec.json + mobile/desktop screenshots + SVGs
         ▼
┌──────────────────┐
│ SYNTHESIS PHASE  │  Compose Architect & Motion Specialist Agents
│                  │  • M3 Design Tokens (Theme.kt, Color.kt, Type.kt, Elevation.kt, Shape.kt)
│                  │  • Atomic Composables (Buttons, Cards, Inputs, Badges, etc.)
│                  │  • Full Screen Assembly (ClaudeDesignScreen.kt)
│                  │  • Motion, touch ripple & touch target compliance (>= 48dp)
│                  │  • Interactive Light/Dark @Previews
└────────┬─────────┘
         │ Artifacts: Synthesized Kotlin Android source tree
         ▼
┌──────────────────┐
│VERIFICATION PHASE│  Visual QA Agent (Gradle + Pixelmatch/SSIM + Rubric)
│                  │  • ./gradlew compileDebugKotlin (0 errors)
│                  │  • ./gradlew testDebugUnitTest (Robolectric preview capture)
│                  │  • Pixelmatch & SSIM visual diff against mobile reference
│                  │  • 10-Point Agent-as-Judge Audit Rubric (score >= 90)
│                  │  • Output: verification_report.md
└────────┬─────────┘
         │
         ├───[Score < 90]───► Iterative Refinement Loop (max 3 cycles) ──► Re-synthesize
         │
         └───[Score >= 90]──► PROCEED_PUBLISH (Git commit & GitHub push)
```

---

### Phase 1: Extraction Phase

**Responsible Role**: Extractor Agent (`skills/claude-to-compose/prompts/extractor_agent.md`)  
**CLI Tool**: `bin/claude-extract.js` (`claude-extract`)  
**Core Engine**: `extractor/engine.js`

1. **Target Ingestion & Frame Piercing**:
   - Accepts public Claude URLs (`https://claude.site/...`, `https://claude.ai/share/...`) or local HTML/CSS files.
   - For remote URLs: detects sandboxed `claudeusercontent.com` iframes and pierces through the parent DOM to the target application root.
   - For local files: spins up an ephemeral HTTP server on `127.0.0.1` to prevent CORS and local asset loading restrictions.
2. **5-Phase Hydration Barrier Synchronization**:
   - Stage 1: `networkidle` (zero pending network connections for >= 500ms).
   - Stage 2: DOM Ready (document interactive state).
   - Stage 3: Tailwind CDN evaluation & dynamic CSS injection check.
   - Stage 4: Font loading barrier (`document.fonts.ready` promise resolution).
   - Stage 5: Settling delay (300ms post-render stabilization).
3. **Computed Token & Tree Extraction**:
   - Recursively traverses the resolved DOM hierarchy via `extractor/dom_walker.js`.
   - Layout: Flexbox (`flex-direction`, `justify-content`, `align-items`, `gap`), CSS Grid, absolute positions, padding, margin, box-sizing.
   - Typography: Font family, computed font weight (100-900), font size (px), line height, letter spacing, text alignment, text transform.
   - Colors: Background, foreground/text, border colors normalized to Hex (`#RRGGBB` / `#AARRGGBB`) and RGBA with chromatic significance scoring.
   - Elevations & Shadows: `box-shadow` x/y offsets, blur radius, spread radius, shadow color.
   - Borders & Shapes: Border widths, styles, colors, and 4-corner radii.
4. **SVG Vector Asset Extraction**:
   - Parses inline `<svg>` elements and linked `.svg` files via `extractor/svg_parser.js`.
   - Normalizes viewports, viewBoxes, paths, fill/stroke rules, and saves standardized SVGs to `output/assets/`.
5. **Multi-Viewport Screenshot Capture**:
   - Mobile Viewport: 390x844 CSS pixels at 3.0x device scale factor (1170x2532 physical resolution). Saved to `output/screenshots/mobile_reference.png`.
   - Desktop Viewport: 1440x900 CSS pixels at 2.0x device scale factor (2880x1800 physical resolution). Saved to `output/screenshots/desktop_reference.png`.
6. **Specification Output**:
   - Validates spec against JSON Schema Draft 2020-12 (`extractor/schema.json`).
   - Emits canonical `output/design_spec.json`.

---

### Phase 2: Synthesis Phase

**Responsible Roles**: Compose Architect Agent (`prompts/compose_architect_agent.md`) & Motion Specialist Agent (`prompts/motion_specialist_agent.md`)  
**CLI Tool**: `synthesizer/index.js` (`claude-synthesize`)  
**Target Project**: `android/app/src/main/java/com/claude/compose/`

1. **Design Tokens Generation (`theme/`)**:
   - `Theme.kt`: Complete Material 3 Theme wrapper supporting dynamic theme switching (`isSystemInDarkTheme()`) and providing `MaterialTheme(colorScheme, typography, shapes, content)`.
   - `Color.kt`: Light and Dark `ColorScheme`s mapped from extracted primary, secondary, surface, background, outline, and container colors.
   - `Type.kt`: Material 3 `Typography` scale (Display, Headline, Title, Body, Label) mapped from extracted font sizes, weights, and line heights.
   - `Elevation.kt` & `Shape.kt`: Elevation tokens (Level 0 through 5) and `RoundedCornerShape` tokens matching extracted corner radii.
2. **Vector Graphics Translation (`icons/` & `res/drawable/`)**:
   - Generates Compose `ImageVector` DSL objects in `icons/ClaudeIcons.kt`.
   - Generates Android XML `VectorDrawable` files in `res/drawable/ic_*.xml`.
3. **Atomic Components Synthesis (`components/`)**:
   - Generates standalone, modular composables:
     - `AppButton.kt`: Buttons with variants (Filled, Outlined, Text), loading states, and minimum touch target size.
     - `AppCard.kt`: Elevated and outlined cards matching extracted shadows and shapes.
     - `AppTextField.kt`: Text inputs with placeholder, error text, and focus borders.
     - `AppBadge.kt`, `AppChip.kt`, `AppCheckbox.kt`, `AppRadioButton.kt`.
     - `AppNavigation.kt`: Navigation headers, tabs, and bottom action bars.
   - Enforces clean state hoisting: callers pass value and event lambdas (`onValueChange: (String) -> Unit`, `onClick: () -> Unit`).
4. **Motion & UX Translation (`motion/`)**:
   - Maps web hover and focus states to native Android touch ripples (`MutableInteractionSource`, `collectIsPressedAsState()`).
   - Maps CSS transitions and keyframes to Compose animations (`AnimatedVisibility`, `animateColorAsState`, `animateFloatAsState`, `tween()`, `spring()`).
   - Generates `TouchTarget.kt`: Enforces >= 48dp touch targets via `Modifier.minimumInteractiveComponentSize()`.
   - Generates `MotionTokens.kt`: Standardized animation duration and easing curves.
5. **Full Screen Assembly & Previews (`screen/`)**:
   - Generates `ClaudeDesignScreen.kt` composing atomic components into scrollable layouts (`LazyColumn` or `Column(Modifier.verticalScroll())`).
   - Employs `rememberSaveable` for reactive state persistence (active tabs, toggle states, input forms).
   - Generates interactive `@Preview` annotations covering Light Theme, Dark Theme (`uiMode = UI_MODE_NIGHT_YES`), and device form factors.

---

### Phase 3: Verification Phase

**Responsible Role**: Visual QA Agent (`prompts/visual_qa_agent.md`)  
**Harness**: Gradle Build + Robolectric + Pixelmatch + SSIM + Agent-as-Judge  
**Report Output**: `verification_report.md`

1. **Programmatic Build & Lint Verification**:
   - Executes `./gradlew compileDebugKotlin` in `android/`.
   - Enforces 0 compilation errors and clean Material 3 imports.
2. **Headless Preview Capture**:
   - Executes `./gradlew testDebugUnitTest` running JUnit4 Robolectric test `PreviewScreenshotTest.kt`.
   - Captures the `@Preview` composable using Robolectric Native Graphics (RNG) and outputs `android/app/build/outputs/preview/rendered_preview.png`.
3. **Programmatic Visual Diff**:
   - Executes `node verification/run_diff.js --ref output/screenshots/mobile_reference.png --rendered android/app/build/outputs/preview/rendered_preview.png --output output/diff`.
   - Quantifies visual fidelity:
     - `pixelMismatchCount`: Total pixel count differing between reference and rendered preview.
     - `pixelSimilarityPercentage`: ((Total - Mismatch) / Total) * 100.
     - `mssimScore`: Mean Structural Similarity Index (0.0 - 1.0).
     - Generates diff overlay (`diff_overlay.png`) and 3-way side-by-side composite (`composite.png`).
4. **Agent-as-Judge 10-Point Audit Rubric**:
   Evaluates 10 distinct quality dimensions (each scored 0 - 10 points, total 100 points):
   1. Typography Hierarchy & Scaling
   2. Color System & Contrast Fidelity
   3. Layout Alignment & Spacing Grid
   4. Corner Radii & Shape Consistency
   5. Elevation & Shadow Accuracy
   6. Vector Asset & Icon Fidelity
   7. Interactive State Coverage (Hoisting & Lambdas)
   8. Touch Target Compliance (>= 48dp)
   9. Accessibility Semantics (Labels & Roles)
   10. Motion & Animation Specification Fidelity
   - **Pass Mathematics**: Total Score >= 90 / 100.
   - **Veto Rule**: If any single dimension scores < 5 / 10, the audit fails automatically (`veto: true`), triggering the refinement loop regardless of total score.
5. **Verification Report Generation**:
   - Compiles all quantitative metrics, test logs, embedded composite screenshots, and the rubric scoring table into `verification_report.md`.

---

## Multi-Agent Role Workflow & Handoff Sequence

The pipeline executes through an explicit 4-stage handoff sequence between specialized agent roles:

```
Stage 1: Extractor Agent
  │  (Executes headless Playwright inspection, captures DOM tokens & screenshots)
  │  Emits: design_spec.json + screenshots/mobile_reference.png + assets/*.svg
  ▼
Stage 2: Compose Architect Agent
  │  (Synthesizes M3 tokens, atomic composables, and ClaudeDesignScreen.kt)
  │  Emits: Kotlin M3 composables and preview annotations
  ▼
Stage 3: Motion & UX Specialist Agent
  │  (Implements rememberSaveable states, touch ripples, AnimatedVisibility)
  │  Emits: Enhanced interactive composables with >= 48dp touch targets
  ▼
Stage 4: Visual QA Agent
  │  (Runs Gradle build, Robolectric preview capture, Pixelmatch/SSIM diff, audit rubric)
  │  Emits: verification_report.md
  ▼
Decision:
  • Score < 90 or Veto < 5 ──► TRIGGER_REFINEMENT (route feedback to Architect / Motion)
  • Score >= 90            ──► PROCEED_PUBLISH (handoff to Sentinel / Orchestrator)
```

### Exact Handoff Transitions
1. `Extractor -> design_spec.json + screenshots -> Compose Architect`
2. `Compose Architect -> Kotlin M3 Composables -> Motion Specialist`
3. `Motion Specialist -> State & Animations -> Visual QA`
4. `Visual QA -> verification_report.md -> Sentinel / Orchestrator`

---

## Error Escalation and Recovery Protocols

When encountering unexpected faults during execution, agents must follow these standardized troubleshooting and recovery protocols.

### 1. Network Failures & Unreachable URLs
- **Symptoms**: `ERR_CONNECTION_REFUSED`, `ENOTFOUND`, HTTP 4xx/5xx responses during extraction.
- **Recovery Protocol**:
  1. Retry navigation up to 3 times using exponential backoff (1s, 2s, 4s).
  2. For local HTML file inputs, verify file readability and ensure the ephemeral HTTP server is listening on `127.0.0.1` before attempting browser navigation.
  3. If the host is unreachable after retries, the Extractor Agent exits with code `4` (`NAVIGATION_FAILED`).
  4. Escalate to Orchestrator: Report failed URL, HTTP status code, and suggest providing a downloaded local HTML/CSS bundle.

### 2. Hydration Timeout & Dynamic Framework Stalls
- **Symptoms**: `HydrationTimeoutError`: DOM not settled within 30,000ms; pending XHR/fetch requests.
- **Recovery Protocol**:
  1. Re-run extraction with extended timeout: `--timeout 60000`.
  2. Check if the root container (`#root`, `#app`, `[data-artifact-id]`) contains populated children despite pending background polling.
  3. If DOM children exist, proceed with extraction and log a hydration warning.
  4. If the DOM remains empty after 60s, exit with code `5` (`HYDRATION_TIMEOUT`).
  5. Escalate to Orchestrator: Provide snapshot of unresolved network requests and recommendations for manual HTML extraction.

### 3. Kotlin & Gradle Compilation Errors
- **Symptoms**: `./gradlew compileDebugKotlin` exits with non-zero status; unresolved symbol, syntax error, or deprecated M3 API.
- **Recovery Protocol**:
  1. Visual QA Agent intercepts the Gradle compiler output (`stderr`) and extracts the failing file path, line number, and error message.
  2. Creates a localized defect ticket and routes directly back to the Compose Architect Agent.
  3. Compose Architect Agent inspects the error:
     - Missing import -> add correct `androidx.compose.material3.*` import.
     - Type mismatch -> adjust `Dp`, `Color`, or lambda signature.
     - Resource ID collision -> normalize `R.drawable.*` naming.
  4. Synthesizer re-emits patched Kotlin file.
  5. Pipeline re-triggers `./gradlew compileDebugKotlin`.
  6. Maximum allowable compile recovery cycles: 3 attempts. If compilation fails 3 times, abort and escalate to human supervisor.

### 4. Visual Regression & Rubric Failure (Score < 90 or Dimension < 5)
- **Symptoms**: Visual similarity < 90%, MSSIM < 0.90, or 10-point audit rubric total < 90.
- **Recovery Protocol (Iterative Refinement Loop)**:
  1. Trigger status: `TRIGGER_REFINEMENT`.
  2. Visual QA Agent analyzes the `diff_overlay.png` and rubric breakdown to identify top defect categories:
     - Spacing/Layout: Component width/height or padding mismatch.
     - Typography: Text line-height or font-size mismatch.
     - Color/Contrast: Incorrect background/foreground hex mapping.
     - Elevation: Shadow blur or elevation level mismatch.
  3. Formulates structured refinement directives for Compose Architect and Motion Specialist:
     - Target file: e.g. `android/.../components/AppCard.kt`
     - Expected property: `shape = RoundedCornerShape(16.dp)`, `defaultElevation = 2.dp`
  4. Compose Architect updates component generators and re-synthesizes code.
  5. Visual QA re-runs `./gradlew testDebugUnitTest` and visual diff analysis.
  6. Pipeline evaluates new score. If score >= 90 and no dimension < 5, transition to `PROCEED_PUBLISH`.
  7. If score remains < 90 after 3 iterations, emit `verification_report.md` documenting remaining variances and escalate to Orchestrator for review.

---

## Anti-Patterns & Prohibitions

1. **NO Hardcoded Dimensions for Responsive Elements**: Do NOT use fixed pixel widths for full-width cards; use `Modifier.fillMaxWidth()` with padding.
2. **NO Unhoisted Interactive State**: Do NOT keep input text or toggle values solely inside leaf composables; always expose `(value, onValueChange)` lambdas.
3. **NO Sub-48dp Touch Targets**: Do NOT render clickable icons or small chips without `Modifier.minimumInteractiveComponentSize()`.
4. **NO Raw Hex Values in UI Code**: Do NOT embed `Color(0xFF...)` directly inside screens; reference `MaterialTheme.colorScheme.*`.
5. **NO Unvalidated Spec Passing**: Do NOT pass unvalidated JSON to the synthesizer; always validate against `extractor/schema.json`.
6. **NO Skipping Verification**: Do NOT proceed to publishing without a passing Gradle build and generated `verification_report.md`.
