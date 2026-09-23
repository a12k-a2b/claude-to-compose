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

## 2026-09-21T16:40:19Z

Build four concrete architectural capabilities into the claude-to-compose pipeline to autonomously extract, transform, synthesize, and verify compound SVG glyphs and multi-path action icons without human intervention or loss of detail.

Working directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
Integrity mode: development

## Requirements

### R1. SVG Transform Decomposition & Matrix Baking Engine
Extract and parse all SVG transformation attributes (matrix, translate, scale, rotate, skewX, skewY) across nested <g> group hierarchies and individual path elements. Provide mathematical affine matrix concatenation and optional coordinate baking directly into path coordinates (x', y') = M · (x, y) to guarantee coordinate fidelity across all Android platforms.

### R2. Hierarchical Compose group() & Fill-Rule DSL Synthesizer
Synthesize idiomatic Jetpack Compose ImageVector.Builder definitions preserving nested group(translationX, translationY, scaleX, scaleY, rotation, pivotX, pivotY) hierarchies, and emit PathFillType.EvenOdd for complex shapes with holes, intersections, or action badges. Generate matching Android VectorDrawable XML drawables.

### R3. Deterministic Semantic Vector Binding & Catalog Generator
Eliminate generic placeholder icon fallbacks by establishing a deterministic mapping from DOM SVG/icon elements to extracted vector assets. Synthesize an extensible ClaudeIcons object containing semantic icon definitions (e.g. DocumentPlusIcon, ChevronDownIcon) with currentColor tinting bound to contextual text color tokens.

### R4. Sub-Glyph Semantic Path Completeness Linter & Verification Gate
Implement an automated pre-flight vector verification gate that compares closed sub-path counts, bounding boxes, and ink centroids between the source SVG and synthesized Compose vector. Automatically flag and veto any compilation where an action badge, corner fold, or sub-path is dropped or collapsed.

## Acceptance Criteria

### Vector Extraction & Coordinate Baking
- [ ] Successfully parses chained 2D affine transformations and nested <g> groups without dropping matrices.
- [ ] Bakes matrix transforms into path coordinates when targeted for flat ImageVector output.
- [ ] Normalizes primitive SVG elements (<rect>, <circle>, <polygon>, <line>) into valid path data.

### Compose Synthesis & Android XML Drawables
- [ ] Generates valid Jetpack Compose ImageVector code utilizing group() and PathFillType.EvenOdd that compiles cleanly via Gradle.
- [ ] Emits valid Android VectorDrawable XML drawables with <group> tags and android:fillType="evenOdd".

### Semantic Icon Binding
- [ ] Maps DOM icon elements to specific ClaudeIcons vector symbols rather than generic placeholders.
- [ ] Correctly binds currentColor to contextual CSS color tokens.

### Sub-Path Completeness Linter
- [ ] Programmatic linter verifies that all closed sub-paths in source SVGs exist in synthesized vectors.
- [ ] Successfully detects and flags intentionally pruned sub-paths (e.g. missing + badge) with a failing exit code.

### Test Suite & Repository Regression Protection
- [ ] All new capabilities covered by unit and integration tests passing 100% green.
- [ ] Existing 48/48 e2e tests, 284 core tests, and Gradle unit tests continue to pass with zero regressions.

## 2026-09-22T15:19:56Z

Build a local design-retrofit compiler and closed-loop verification system (`ctc` / Claude to Compose) for coding agents that takes an existing functional Kotlin/Jetpack Compose Android application and an approved Claude Design redesign, maps the design concepts to existing app architecture while preserving business behavior, navigation, data persistence, and accessibility, and executes an automated fail-closed verification loop on native Compose layouts and Daylight Computer (DC1) LivePaper hardware.

Working directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
Git branch: branch-2
Integrity mode: development
Reference document: docs/PROJECT_PLAN_EXISTING_APP_RETROFIT.md

## Requirements

### R1. Existing Android App Analyzer & Baseline Harness
- Build an analyzer (`ctc baseline`, `ctc inspect-app`) using syntax-aware Kotlin/Compose parsing to inspect Gradle modules, source sets, build variants, and Compose composable hierarchies.
- Index composable screens, navigation routes, ViewModels/state holders, action/event classes, repositories, and UI test tags.
- Capture a pre-existing app baseline into `app-baseline.json` and `existing-app-model.json`, recording behavior invariants that must survive the redesign (e.g. data persistence, back navigation, autosave).
- Distinguish pre-existing application failures from retrofit regressions so that missing or broken baselines are marked `BLOCKED`.

### R2. Evidence-Preserving Design Contract & Intermediate Representation
- Enhance web evidence extraction (`ctc capture`, `ctc contract build`) to produce an immutable, multi-layered design contract conforming to versioned schemas:
  - **Layer 1 (Measured Scene)**: Exact bounds, paint order, text baselines, actual line breaks, asset hashes, and stable source identities (`sourceId`).
  - **Layer 2 (Inferred Layout Intent)**: Constraint sizing (fixed, intrinsic, fill, proportional), row/column/box/grid topology, gaps, padding, and responsive breakpoints across DC1 portrait ($1184 \times 1584$) and landscape ($1584 \times 1184$).
  - **Layer 3 (Behavior Contract)**: State-transition graphs ($t_0 \rightarrow t_1 \rightarrow t_2$), user gestures, focus/keyboard behavior, and loading/empty/error states.
  - **Layer 4 (Design System)**: Sol:OS 8-bit grayscale neutral tokens (`--os-0` to `--os-1000`), typography tokens, and transflective LivePaper contrast rules.

### R3. App Correspondence Engine & Agent Implementation Packet Generator
- Build a correspondence mapping engine (`ctc map`, `ctc plan`) that establishes 1:1 relationships between Claude Design nodes and existing app concepts:
  - Mapped target: route, composable symbol, ViewModel state property, action/event lambda, and visual component role.
  - Confidence scoring and explicit preservation obligations (e.g., "idempotent save", "preserve back-stack").
- Generate scoped, reviewable implementation packets for local coding agents (`ctc agent packet` in Markdown and JSON):
  - Declares objective, scoped files/symbols to modify, forbidden files/subsystems, required assets/fonts, and exact verification commands.
  - Prevents agents from replacing functional domain architecture with preview-only stubs.

### R4. Multi-Layered Verification Engine & Causal Defect Oracle
- Build a progressive verification engine (`ctc verify`, `ctc defects`):
  1. Schema & provenance validation.
  2. Android compilation & existing behavior tests.
  3. Native Compose layout telemetry (bounds, baselines, clipping, semantics extracted via test tags).
  4. Perceptual metrics (spatial drift $\le 3.0\text{px}$, Sobel contour alignment, MSSIM, Ink Dice).
  5. Deterministic behavioral scenario replay with checkpoint deltas.
  6. Daylight DC1 LivePaper hardware qualification runner.
- Emit structured, causal defect reports attributing failures directly to stable element IDs with actionable root causes (e.g., missing font resource, parent horizontal inset mismatch).
- Enforce the fail-closed quality gate: missing evidence = `BLOCKED`, measured defect = `FAIL`.

### R5. Complete Local CLI & Versioned DC-1 Profile
- Implement the unified local CLI (`bin/ctc.js`):
  - `doctor`, `init`, `baseline`, `inspect-app`, `capture`, `contract`, `map`, `plan`, `agent`, `verify`, `defects`, `report`, `package`.
  - Machine-readable JSON output for every command, distinguishing pass, fail, blocked, and infrastructure errors.
- Formalize the Daylight Computer DC1 profile:
  - Custom transflective LCD (60Hz–120Hz fluid pipeline, standard Android SurfaceFlinger).
  - Strict zero EPD waveform clears / particle refreshes.
  - WCAG AAA 8-bit grayscale contrast verification.

## Acceptance Criteria

### Existing App Analysis & Baseline
- [ ] `ctc baseline` and `ctc inspect-app` successfully parse a target Android Compose project and output `app-baseline.json` and `existing-app-model.json`.
- [ ] Correctly identifies screens, routes, state holders, and behavior invariants.

### Correspondence & Implementation Packet
- [ ] `ctc map` generates a valid `CorrespondenceMap` linking design elements to existing composables and state without relying solely on raw text matching.
- [ ] `ctc agent packet` produces Markdown and JSON implementation packets containing scoped modification boundaries and preservation rules.

### Verification Engine & Defect Oracle
- [ ] `ctc verify` executes the progressive verification pipeline and outputs unified results across CLI, JSON, and Markdown.
- [ ] Structured defects identify exact element IDs, expected vs actual geometry/text metrics, and probable causes.
- [ ] Negative controls verify that missing elements, margin shifts ($\ge 10\text{px}$), omitted assets, or missing evidence cause deterministic `FAIL` or `BLOCKED`.

### DC-1 LivePaper Execution
- [ ] Physical DC1 qualification validates live app deployment, capacitive touch interaction, and zero EPD waveform flashes on tablet hardware.
- [ ] All 284 existing regression tests continue to pass without regressions.


## 2026-09-23T06:14:14Z

Integrate the external coding-agent integration layer (for Cursor, Claude Code, Antigravity, and Codex) and candidate Git worktree verification from the \`codex/design-retrofit-v1\` branch into \`branch-2\` of \`claude_to_compose\`, formalizing end-to-end agent-assisted design retrofits with automated worktree scaffolding, fail-closed safety, and rigorous adversarial audit.

Working directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
Git branch: branch-2
Integrity mode: development
Reference document: docs/PROJECT_PLAN_EXISTING_APP_RETROFIT.md

## Requirements

### R1. Candidate Git Worktree Isolation & Safety Subsystem
- Implement the safety and path-confinement subsystem (\`src/agent/safety.js\`):
  - Enforce atomic writes with \`O_NOFOLLOW\` to prevent symlink traversal attacks.
  - Ban parent traversals (\`..\`), dangerous roots (\`/\`, \`$HOME\`), and source-sensitive symlinks.
- Enhance \`ctc verify\` with \`--candidate <worktree-path>\`:
  - Verify that \`--candidate\` is a real descendant Git worktree branched off the clean baseline repository.
  - Disallow source-sensitive symlinks, verify git change tracking and hashes, and reject any edits outside \`implementationBoundary.allowedPaths\`.
  - Validate workspace-relative evidence receipts and reject fabricated summaries or missing candidate APK/build hashes.

### R2. Automated Worktree & Agent Context Scaffolder (\`ctc agent worktree\`)
- Add the \`ctc agent worktree\` CLI command to automate developer onboarding:
  - Takes \`--android <path>\`, \`--workspace <path>\`, \`--branch <branch-name>\`, and \`--output <candidate-path>\`.
  - Automatically executes \`git worktree add\`, generates the scoped agent packet, and configures the target candidate directory for coding agents with a single command.

### R3. First-Class Coding Agent Harnesses (Cursor, Claude Code, Antigravity, Codex)
- Build first-class integrations and tool harnesses for all 4 major coding environments:
  - **Cursor**: Generate project rules (\`.cursor/rules/\` and \`.cursorrules\`) instructing Cursor on reading agent packets, respecting boundaries, running \`ctc verify\`, and resolving structured defects.
  - **Claude Code**: Generate \`CLAUDE.md\` and Claude Code skills (\`.claude/skills/ctc/\`) for running CLI commands and parsing JSON defect outputs.
  - **Codex / OpenAI**: Produce structured agent system prompts and execution contracts in \`docs/CODING_AGENTS.md\`.
  - **Antigravity**: Formalize the native skill in \`skills/claude-to-compose/SKILL.md\` connecting AGY agents directly to the local \`ctc\` CLI.

### R4. Owner Approval & Intentional Deviation Contract
- Integrate the Draft 2020-12 \`owner_approval.schema.json\` schema and manifest into \`src/contract/schemas/\`.
- Support explicit human approvals for intentional deviations from standard Android behavior or design contracts (e.g. custom layout choices, accepted font substitutions).
- Ensure that unapproved visual/behavioral deviations strictly result in \`FAIL\`, while missing required approvals result in \`BLOCKED\`.

### R5. Unified Agent Quickstart & End-to-End Pilot Workflow
- Deliver a comprehensive, reproducible quickstart (\`docs/QUICKSTART_CODING_AGENTS.md\`) demonstrating how an engineer in Cursor, Claude Code, Antigravity, or Codex executes a complete retrofit cycle from Claude Design link to native Compose on DC1 hardware.
- Provide end-to-end integration tests verifying the full flow with an external agent workflow simulation on \`fixtures/note-app\`.

### R6. Adversarial Audit & Regression Protection
- Run adversarial stress suites testing candidate worktree forgery, path escapes, out-of-scope edits, and symlink attacks.
- Ensure all 1,172 existing passing tests continue to pass 100% green without regressions.
- Conduct a formal forensic integrity audit confirming zero stubs or test bypasses.

## Acceptance Criteria

### Worktree Safety & Verification
- [ ] \`ctc verify --candidate <worktree>\` successfully verifies a valid descendant worktree and rejects non-worktree or dirty baseline checkouts.
- [ ] Rejects any edit outside \`allowedPaths\` and any source-sensitive symlink.
- [ ] Atomic file write protects against symlink race attacks.

### Agent Tooling & Scaffolding
- [ ] Generates valid configuration and instruction sets for Cursor (\`.cursorrules\`), Claude Code (\`CLAUDE.md\`), Codex, and Antigravity.
- [ ] \`ctc agent worktree\` automatically spins up a clean candidate worktree pinned to the baseline commit.

### Owner Approval & Deviations
- [ ] Validates \`owner-approval.json\` against Draft 2020-12 schema; unapproved deviations cause deterministic \`FAIL\` or \`BLOCKED\`.

### Regression & Integrity
- [ ] All 1,172 current test scenarios across unit, E2E v2, and legacy regression suites pass 100% green.
- [ ] Adversarial stress tests verify detection of forged receipts and worktree tampering.
