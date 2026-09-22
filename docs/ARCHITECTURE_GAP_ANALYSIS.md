# Architecture Gap Analysis and Compiler Roadmap

## Outcome

The current repository is a useful extraction and rendering research prototype, but it is not yet a faithful Claude Design-to-Compose compiler. The largest source of visual drift is not a missing pixel-tuning heuristic: measured browser evidence is discarded and replaced with generic Material 3 component templates.

The correct direction is a bounded, evidence-preserving compiler with a closed native verification loop. “Pixel perfect” and “UX faithful” must remain measured outcomes for a named viewport, state, artifact hash, and runtime—not project-wide labels.

## What the supplied comparison proves

The onboarding comparison visibly contains large geometry, typography, wrapping, and artwork differences even though the historical report says `PASSED`. The committed report records only 20.49% foreground Ink IoU for one artifact while still saying `PROCEED_PUBLISH`. High whole-canvas pixel similarity is dominated by empty background and cannot override local content failure.

This is now treated as a negative control: a run with similar evidence must fail.

## Root causes in the current pipeline

1. **Layout evidence is discarded.** `dom_walker.js` captures bounds, padding, margins, positioning, font metrics, and styling. `screen_generator.js` often replaces those values with `fillMaxWidth`, equal weights, fixed 16dp card padding, three typography presets, and a default `Column`.
2. **Responsive evidence was incoherent.** Mobile and desktop screenshots were captured, but only the primary DOM hierarchy was extracted. A single mobile tree cannot explain a desktop reference.
3. **Visible content can have no lowering path.** Images are classified but their source/resource contract and native emission are incomplete. Generic containers also lose substantial paint and positioning information.
4. **Behavior is inferred from static appearance.** The current interaction model mainly records clickability and CSS transition declarations. It does not capture state transitions, hidden React branches, event effects, interruption behavior, scroll-linked elevation, focus, keyboard, drag, loading, or error states.
5. **The optimizer edits symptoms.** Fuzzy Kotlin text anchors and local offsets cannot reliably repair a wrong parent topology, missing resource, font substitution, or responsive rule. Duplicate labels also make text anchoring ambiguous.
6. **Verification historically failed open.** Static audit dimensions were awarded full marks without corresponding evidence, skipped diffs received fabricated good metrics in reports, and report thresholds were weaker than pipeline thresholds.

## Target architecture

### 1. Evidence bundle

Every source capture should be immutable and reproducible:

- source URL or exported bundle hash;
- browser/runtime versions;
- viewport size, density, font scale, theme, locale, and reduced-motion setting;
- loaded font and asset hashes;
- screenshot and measured scene captured from the same settled state;
- explicit scenario/state identifier;
- timestamps and console/network failures.

### 2. Three-layer intermediate representation

Keep facts separate from inference:

- **Measured scene:** paint order, clipping, transforms, actual boxes, text runs, baselines, line breaks, colors, shadows, vector/image/font identities.
- **Layout intent:** fixed/intrinsic/fill sizing, min/max constraints, flow/grid/overlay topology, gaps, insets, scroll behavior, and rules inferred across multiple widths.
- **Behavior contract:** roles, hit regions, focus order, state variables, events, transitions, animation tracks, cancellation, and interruption rules.

Every source node needs a stable identity that survives source scene → IR → generated Compose → native layout telemetry. Unsupported properties must produce diagnostics; they must not silently fall back to generic Material styling.

### 3. Bounded native backend

Implement and declare a supported subset rather than pretending to translate arbitrary CSS:

1. exact text metrics and packaged fonts;
2. Box/Row/Column and explicit custom layouts;
3. background, border, radius, clip, opacity, transform, and paint order;
4. SVG, bitmap, and canvas assets;
5. fixed/absolute positioning for the single-viewport diagnostic backend;
6. inferred responsive constraints after at least portrait, landscape, and an intermediate width are observed.

Native semantics and 48dp hit regions should be added without altering visual bounds. The visible component and its invisible hit target are separate concerns.

### 4. Typed closed loop

Generated nodes should expose stable test tags and native geometry/text-layout telemetry. Compare browser and Compose boxes directly before raster scoring. Repair in this order:

1. parent topology and constraints;
2. asset/font identity and text metrics;
3. element geometry;
4. paint and decoration;
5. rasterization tolerance.

Tune typed IR values and regenerate. Do not mutate Kotlin by fuzzy label search. Keep the best complete candidate, rerender it, and verify held-out sizes before accepting it.

### 5. Behavior capture and replay

Motion and UX fidelity need a separate scenario compiler, not additional static screenshot heuristics.

For each authored scenario, drive the browser under a controlled clock and capture:

- before/after scene graphs;
- click, input, focus, keyboard, drag, and scroll events;
- state additions/removals, including formerly hidden or conditionally mounted branches;
- property trajectories at fixed timestamps;
- duration, delay, easing/cubic Bézier, repeat mode, fill mode, and transform origin;
- interruption, cancellation, reversal, process recreation, and reduced-motion behavior.

Represent this as a state-transition graph with animation tracks. Lower it to hoisted Compose state plus `Transition`, `AnimatedVisibility`, `Animatable`, or infinite transitions as appropriate. Replay the same scenarios with Compose’s controlled test clock and compare state, semantics, geometry, and sampled frames.

`interactionSource + animateFloatAsState + graphicsLayer` is appropriate for simple press feedback, but it is not a general UX architecture. Coordinated multi-property transitions, interruption, gesture progress, and navigation require explicit transition/state models.

## Daylight DC-1 requirements

- Treat DC-1 portrait and landscape as first-class capture and verification targets, using the exact device density, font scale, inset policy, and build fingerprint.
- Evaluate grayscale in a calibrated display space. Do not map colors to neutral tokens by RGB luminance alone; account for contrast after grayscale conversion and amber-frontlight conditions.
- Detect token collisions where distinct source colors quantize to indistinguishable grays. Preserve semantic separation with luminance, outline, texture, or spacing changes and report the deviation.
- Gate text/background, icon/background, disabled-state, and focus-state contrast on hardware screenshots where possible.
- Do not add EPD/E-Ink waveform flashes, screen-refresh broadcasts, particle refresh pauses, or artificial dismissal delays. DC-1 is a conventional high-refresh transflective LCD.

## Prioritized delivery plan

### Phase 0 — Trustworthy gates

- Fail closed on missing build, render, diff, or localized element evidence.
- Use one shared gate result for CLI exit, reports, badges, and release decisions.
- Add negative controls for blank output, omitted image/vector, wrong font, shifted parent, stale screenshot, and duplicated labels.

### Phase 1 — One faithful static vertical slice

- Freeze one real Claude Design artifact and all assets/fonts.
- Compile it from scratch through the generic path—no hand-authored sample screen.
- Preserve per-viewport scenes and stable source identities.
- Implement exact text, image, vector, container paint, clipping, and supported layout lowering.
- Pass DC-1 portrait, landscape, and held-out width gates.

### Phase 2 — Constraint inference

- Match stable identities across viewport scenes.
- Infer fixed, intrinsic, proportional, anchored, wrapped, and breakpoint behavior with confidence scores.
- Require author input when multiple responsive explanations remain plausible.

### Phase 3 — State and interaction compiler

- Add authored Playwright scenarios and hidden/conditional state discovery.
- Emit the behavior graph and native state/events.
- Replay semantics and deterministic animation frames under a controlled clock.

### Phase 4 — Hardware qualification

- Run exact signed artifacts on named DC-1 hardware.
- Verify launch, rotation, resize, suspend/wake, input, accessibility, crash/ANR, performance, battery, and thermal budgets.
- Keep emulator/Robolectric evidence distinct from hardware evidence.

## Three highest-impact innovations

1. **Multi-viewport constraint inference over an evidence-preserving scene IR.** This attacks the main geometry loss instead of tuning individual pixels.
2. **Browser-to-Compose state-transition capture and deterministic replay.** This turns motion and UX into compilable, testable contracts.
3. **Stable identity plus native geometry telemetry in a typed regeneration loop.** This makes diffs causal and lets the system repair the IR rather than patch generated source text.
