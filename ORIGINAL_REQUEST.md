# Original User Request

## Initial Request — 2026-09-18T23:48:49Z

Build a hybrid developer tool, verification suite, and multi-agent workflow that ingests Claude Design shareable links and exported HTML/CSS artifacts, extracts computed DOM tokens, vector assets, and interaction behaviors via a headless browser engine, and translates them into production-ready, pixel-perfect Jetpack Compose / Kotlin Android components and complete screens with verified visual and UX fidelity. Push the completed codebase to a private GitHub repository under the user's account.

Working directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
Integrity mode: development

## Requirements

### R1. Headless Claude Design Inspection & Extraction Engine
A standalone CLI tool and engine (Node.js/Playwright) that:
- Ingests public Claude shareable links (`https://claude.site/...`, `https://claude.ai/share/...`) or local HTML/CSS files.
- Executes client-side hydration, waits for network idle, and parses the resolved DOM hierarchy.
- Extracts computed layout properties (flexbox, grid, absolute coordinates, padding, margin), typography (font family, weight, line-height, letter-spacing), color tokens (hex, rgba), box-shadows, borders, and corner radii.
- Extracts inline and external SVG vector assets and converts them into standardized vector data.
- Captures reference high-resolution screenshots for both mobile and desktop viewports.
- Outputs an intermediate structured specification (`design_spec.json`) and asset bundle.

### R2. Jetpack Compose & UX Code Synthesizer
A synthesis engine that converts `design_spec.json` into idiomatic, production-ready Android Jetpack Compose code:
- **Design Tokens**: Generates `Theme.kt`, `Color.kt`, `Type.kt`, and `Elevation.kt` matching the design system.
- **Modular Architecture**: Generates standalone atomic composables (Buttons, Cards, Inputs, Badges, Navigation) with clean state hoisting and event lambdas (`onAction: () -> Unit`).
- **Screen Composables**: Builds the complete screen composable with functional interactive states (`rememberSaveable`, toggles, tabs, bottom sheets, form validation).
- **Vector Graphics**: Converts extracted SVGs into Android `ImageVector` or XML VectorDrawables.
- **UX & Motion Translation**: Maps web hover and focus states to native Android touch ripples and pressed elevations; maps CSS transitions and keyframes to Compose animations (`AnimatedVisibility`, `animate*AsState`, `Animatable`, `spring()`).
- **Interactive Previews**: Generates `@Preview` composables covering light and dark themes and interactive states.

### R3. Antigravity Custom Skill & Multi-Agent Workflow
An Antigravity skill and slash workflow definition (`/claude-to-compose`) that orchestrates the end-to-end pipeline using specialized agent roles:
- Extractor Agent: Ingests the design input and executes headless inspection.
- Compose Architect Agent: Synthesizes modular Compose code and themes.
- Motion & UX Specialist Agent: Implements state management, animations, and touch feedback.
- Visual QA Agent: Executes the verification pipeline and coordinates iterative refinements.

### R4. Dual Verification Suite (Programmatic & Agent-as-Judge)
An automated verification harness providing objective validation:
- **Programmatic Build & Lint**: Verifies that `./gradlew compileDebugKotlin` and `./gradlew test` compile with zero errors and conform to Android Compose best practices.
- **Programmatic Visual Diff**: Uses a perceptual diff tool (Pixelmatch/SSIM) to compare the headless web reference screenshot with the rendered Compose preview screenshot, generating a quantitative similarity score and a visual diff overlay image.
- **Agent-as-Judge Audit**: An auditor rubric evaluating typography scaling, color accuracy, spacing alignment, corner radii, elevation, vector fidelity, interactive state coverage, touch target compliance (>= 48dp), accessibility semantics, and animation specs.
- Generates a markdown verification report (`verification_report.md`) embedding reference, rendered, and diff images.

### R5. Private GitHub Repository Setup & Publishing
- Initializes a clean Git repository in `/Users/anjan/.gemini/antigravity/scratch/claude_to_compose` with a well-structured `.gitignore` (ignoring node_modules, build caches, and .gradle).
- Creates initial commits with complete codebase, documentation, CLI instructions, and an end-to-end example.
- Uses `gh repo create a12k-a2b/claude-to-compose --private --source=. --push` to push the repository to GitHub and outputs the repository URL.

## Acceptance Criteria

### Extractor Engine
- [ ] Successfully parses both a local HTML test file and a live web URL.
- [ ] Exports `design_spec.json` containing DOM hierarchy, computed CSS styles, and extracted SVGs.
- [ ] Captures high-res mobile and desktop viewport reference screenshots.

### Compose Synthesis
- [ ] Emits valid Kotlin code with Material 3 imports that compiles cleanly via Gradle.
- [ ] Generates separate token files (`Theme.kt`, `Color.kt`, `Type.kt`), modular atomic composables, and the main screen composable.
- [ ] Includes at least one animated transition using `AnimatedVisibility` or `animate*AsState` and native touch ripple feedback.
- [ ] Includes `@Preview` annotations for light and dark themes.

### Verification Suite
- [ ] Programmatic visual diff tool runs and outputs a numerical similarity score and a diff overlay image.
- [ ] Verification report (`verification_report.md`) is generated documenting test results, visual diffs, and the 10-point audit rubric.

### Repository & Deployment
- [ ] Git repository is initialized, committed, and pushed to `https://github.com/a12k-a2b/claude-to-compose` as a private repository.
- [ ] Includes a comprehensive `README.md` explaining CLI usage, agent workflow, and verification steps.

## 2026-09-19T03:56:12Z

Server restart completed. Please resume execution of the remaining teamwork milestones (M3 Antigravity Skill, M4 Verification diff suite, M5 GitHub push).

## 2026-09-20T02:12:26Z

Overhaul `claude-to-compose` into a truly accurate, self-correcting synthesis and verification system that eliminates deceptive metric reporting, detects real visual discrepancies (font metrics, kerning, line heights, spatial drift, and icon geometries), and iteratively tunes Jetpack Compose code in a closed loop until the red ghosting and double-vision diffs are completely eliminated across Claude Design artifacts.

Working directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
Integrity mode: development

## Requirements

### R1. Elimination of Deceptive Metrics & Objective Verification Suite
Re-engineer the visual verification engine (`verification/run_diff.js` and `verification/zonal_diff.js`):
- **Acknowledge and Penalize Whitespace/Background Dilution**: Stop reporting deceptive 90%+ similarity scores caused by empty space or solid tinted background canvas.
- **True Element-Level & Contour Metrics**:
  - **Glyph Edge & Contour Alignment**: Edge-detection diff (Sobel/Canny) comparing letterform and icon contours to detect and heavily penalize double-vision ghosting and spatial displacement.
  - **Dynamic Background Subtraction**: Compute foreground ink strictly by clustering the dominant background canvas color per region rather than a fixed luminance threshold.
  - **Zonal Bounding Box IoU**: Compute spatial overlap per UI element (headings, paragraphs, pills, toolbar icons).
- **Hard Anti-Deception Guardrail**: If an overlay image shows visible text double-vision or displaced icon contours, the verification score must fail and reflect the failure (score must not report passing).

### R2. Spatial Drift Detection & Vector Coordinate Resolver
- Calculate exact translation offset vectors $(\Delta x, \Delta y)$, bounding dimensions, and padding deltas for each visual component between reference web viewport and rendered Compose preview.
- Eliminate font-metric mismatch (kerning, baseline offsets, line-height leading) by dynamically resolving Compose `TextStyle` parameters (`letterSpacing`, `lineHeight`, `baselineShift`, `fontSize`).

### R3. Automated Closed-Loop Visual Auto-Tuner
Implement an automated closed-loop optimization cycle:
1. Render Compose preview headlessly via Robolectric Native Graphics.
2. Run contour edge diff and zonal drift analysis against the reference screenshot.
3. Automatically adjust Compose layout modifiers (`padding`, `offset`, `size`, `spacedBy`, and vector control points).
4. Re-render and iterate until contour ghosting reaches zero and structural alignment converges.

### R4. Multi-Artifact Real-World Validation
Validate the improved tool and closed-loop tuner against both target Claude Design artifacts:
- **`da63f0b2-6919-408a-b3eb-68685f019fe6`** (Floating 3-pill toolbar, active pen indicator, faint article reading canvas, highlighter & ink circle vector annotations).
- **`e34f4387-f506-4de5-bced-ef318d7f8bdf`** (Sol:OS warm sand background, serif title hierarchy, 6 categorized pill rows with orange and dark variants).

### R5. Remote Repository Parity
- Commit all code, test suites, and generated verification artifacts to `https://github.com/a12k-a2b/claude-to-compose`.
- Ensure `./gradlew test` and test suites pass with zero regressions.

## Acceptance Criteria

### Visual Parity (Zero Double-Vision)
- [ ] In the visual diff overlay for `da63`, headline ("The quiet economics of planting a city forest"), masthead ("The Meridian"), and body columns have zero visible double-vision red ghosting.
- [ ] In `da63`, all 3 top floating pills and their internal icons/buttons align directly over the reference toolbar.
- [ ] In `e34f`, "A sheet of glass", paragraphs, and all 6 pill rows align over reference letterforms and pills without vertical or horizontal displacement.
- [ ] The ink circle and highlighter in `da63` align directly over reference annotations.

### Metric Honesty & Convergence
- [ ] Edge contour alignment score $\ge 90.0\%$ (penalizing glyph shifts $\ge 2\text{px}$).
- [ ] Element bounding box IoU $\ge 90.0\%$ across all primary text blocks and pill rows.
- [ ] Verification suite actively fails if text or icons are offset by more than 3px, preventing self-certification of misaligned screens.

### Automated Tool Pipeline
- [ ] Closed-loop tuner can run autonomously and converge without manual developer intervention.
- [ ] Code compiles cleanly with `./gradlew compileDebugKotlin` and passes unit tests.
- [ ] All changes committed and pushed to GitHub `origin/main`.

## 2026-09-20T02:57:54Z

USER ADVERSARIAL REVIEW FEEDBACK:
Please incorporate the critical findings from the adversarial review into the current roadmap (documented in ADVERSARIAL_REVIEW.md):

1. P0 Verification Integrity: Enforce hard gates (Ink IoU >= 55%, SSIM >= 0.72). Never invent scores or treat skipped diffs as green. Touch-target must be invisible hit-slop, not visual min-size that blows up button bounds.
2. P0 Fidelity Mode (Default for Daylight): Synthesize absolute Box / Text / Canvas using exact scene IR coordinates (Modifier.offset). Do NOT force Material 3 component defaults (fat pill buttons, selected chip bloat) onto Daylight LivePaper hairlines.
3. P0 Canvas 2D / SVG Paths: Preserve stroke style, cap, width, and empty dash array (= solid hairlines, not leftover dashPathEffect).
4. P0 Claude Code URL support: Update extractor/claude_urls.js to recognize https://claude.ai/code/artifact/<uuid>.
5. P1 Scene Graph IR: Retain extracted {x, y, w, h} bounding boxes in fidelity mode instead of discarding them.
6. P1 Font Bundling: Embed ABC Arizona Flare and Anthropic fonts directly into res/font/ and generate FontFamily in Type.kt, matching exact line heights and letter spacing.
7. P2 Closed-Loop Tuner: Iterate Compose layout modifiers and control points against headless Skia-on-Robolectric renders until red ghosting is eliminated.

Please acknowledge and incorporate these priorities into Milestones 2-5 execution.
