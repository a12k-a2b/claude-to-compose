# Adversarial Review: claude-to-compose & Roadmap to True Visual Parity

Reviewed against the public repo, the Daylight DC1 reference (1184×1584), and apples-to-apples composites.

---

## What is Actually Broken & Core Action Items

### P0 — Verification Lies (Hard Anti-Deception Gates)
- **Problem**: In previous reports, a 28% ink overlap was certified as 100/100 pass because 90%+ of the page was white background agreeing with itself. Missing diffs were treated as green gates, and touch-target checks blew up buttons into fat pills.
- **Requirements**:
  - **Hard Gates**: Minimum Ink IoU $\ge 55\%$ and SSIM $\ge 0.72$.
  - **No Skipped Diffs & No Invented Scores**: If diff is skipped or failed, total score is 0.
  - **Touch-Target Compliance**: Must be implemented as invisible hit slop (`TouchTarget`), NEVER visual `minimumInteractiveComponentSize()` which enlarges widget dimensions.

### P0 — Material 3 is the Wrong Compilation Target for Daylight / Paper UI
- **Problem**: Synthesizer mapped everything to Material 3 defaults (`Button`, `FilterChip`, 48dp min targets, elevation, ripple). Daylight Sol:OS artifacts are paper, hairlines, exact type, and custom canvas.
  - Mapping "Get started" to `Button` creates a fat pill.
  - Mapping chips to selected-fill defaults eats the row.
  - Mapping headline onto `FontFamily.Serif` + aggressive negative tracking causes heavy and tight text.
- **Requirements**:
  - **Two Emit Modes**:
    - **Fidelity Mode** (default for Daylight): Absolute `Box` / `Text` / `Canvas` from computed scene IR with exact `Modifier.offset`. No M3 component bloat on the visual tree.
    - **Idiomatic Mode** (opt-in): M3 atoms for productized Android apps after visual match is proven.

### P0 — The Living Page Canvas Path IR
- **Problem**: Canvas 2D paths were either omitted or dashed via leftover `PathEffect.dashPathEffect` from `canvas_transpiler.js`. The Claude artifact roads are solid hairlines with tick marks.
- **Requirements**:
  - Treat Canvas 2D and SVG paths as first-class IR.
  - Stroke style, dash array, cap, and width must survive intact. An empty dash array means solid hairline stroke.

### P0 — Claude Code Artifact URLs as First-Class Input
- **Problem**: Extractor only accepted `claude.site/artifacts/...` and `claude.ai/share/...`, failing on `https://claude.ai/code/artifact/<uuid>`.
- **Requirements**:
  - Update `extractor/claude_urls.js` to recognize `/code/artifact`, `/artifacts`, and `/public/artifacts`.

### P1 — Scene IR: Do Not Discard Coordinates
- **Problem**: `dom_walker.js` records flex, grid, coordinates, type, color, but `screen_generator.js` threw them away to guess flow `Column`/`Row` with CSS gap.
- **Requirements**:
  - `extractor/scene_graph.js` records every visible primitive as `{x, y, w, h, text, styles}`.
  - `fidelity/emit_compose.js` places them with exact `Modifier.offset(x.dp, y.dp)`.
  - Canvas streams attach as Canvas children at the recorded bounds.

### P1 — Font Bundling & Exact Measurement
- **Problem**: Fonts exist in `assets/fonts/` or `res/font/`, but screens fell back to generic `FontFamily.Serif`.
- **Requirements**:
  - Embed the extracted family (`ABC Arizona Flare`, `Anthropic Serif`), generate `FontFamily` in `Type.kt`, and match letter spacing and line height before wrapping.

### P1 — State Mismatch Must Not Masquerade as Visual Bug
- **Problem**: Interaction state (e.g. which chip has `aria-pressed="true"` or `.selected`) was lost, causing web hollow vs Compose filled discrepancies.
- **Requirements**:
  - Capture interaction state from DOM attributes and preserve active/selected states in fidelity mode.

### P2 — Automated Closed-Loop Auto-Tuner
- **Requirements**:
  - Translational correction $(\Delta x, \Delta y)$ is applied once exact geometry exists.
  - Iteratively run headless Skia-on-Robolectric capture and tune until double-vision red diff reaches zero.
