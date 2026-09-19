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
