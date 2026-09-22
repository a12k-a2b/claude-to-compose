# Claude Design → Existing Compose App: End-to-End Project Plan

**Status:** Proposed plan for owner review  
**Primary mode:** Agent-assisted redesign of an existing functional Android app  
**Initial audience:** One local owner on macOS  
**Later audiences:** Daylight team, then the Daylight developer community  
**Deployment posture:** Local-first; no hosted service required for the core workflow  
**Independent architecture review:** Astra, medium effort; recommendations incorporated

---

## 1. Executive decision

The product should be a **local design-retrofit compiler and conformance system for coding agents**.

Its primary job is not to turn arbitrary HTML into a disconnected demo screen. Its primary job is:

> Given an existing functional Kotlin/Jetpack Compose Android application and a Claude Design redesign informed by that application's source, help a local coding agent modify the existing application until its native UI matches the redesign while preserving the application's behavior, data, navigation, accessibility, and reliability.

The tool should provide three things together:

1. **Evidence:** a reproducible capture of what the Claude Design looks like and how it behaves.
2. **A contract:** a machine-readable mapping from that design to the existing app's screens, components, actions, and states.
3. **A test oracle:** deterministic evidence showing a coding agent what is still wrong after each implementation attempt.

Initial code generation remains useful, but it is not the entire product. A coding agent can often produce better Kotlin than a universal template generator if it receives precise constraints, assets, mappings, and failures. Therefore, the project's central asset should be the **design contract plus closed verification loop**, not a claim that every web artifact can be translated perfectly in one pass.

The current repository should be retained, but a new `v2` pipeline should be introduced behind clear module and schema boundaries. Keep independently useful extraction, font, vector, Android-build, screenshot, and diff infrastructure. Replace the lossy screen-template compiler and fuzzy source-text auto-tuning path rather than extending them indefinitely.

---

## 2. The intended user story

### 2.1 Primary example: redesign an existing note-taking app

1. A working note-taking app already exists in a Git repository.
2. Claude Design is given enough context about that app to create a redesign: existing screens, product behavior, navigation, screenshots, and the Daylight design system.
3. The owner approves the Claude Design as the visual and UX target.
4. The tool examines both:
   - the existing Android source and current behavior; and
   - the approved Claude Design artifact and its observed behavior.
5. The tool creates a versioned design contract and a mapping between design elements and existing app concepts.
6. Codex, Claude Code, or another local coding harness receives a scoped implementation packet.
7. The coding agent modifies the existing app rather than replacing its functional architecture.
8. The tool compiles and renders the modified app, compares it with the design, replays behavior scenarios, and returns structured defects.
9. The coding agent iterates until required gates pass.
10. The exact build is verified on a DC-1 for hardware-specific behavior and presentation.

The app revision used to inform Claude Design should be recorded when possible. The design's apparent knowledge of the repository is useful context, but it is not proof that its controls map correctly to the current implementation. The tool must still inspect the actual target revision and establish explicit correspondence. If the app has changed since the design was created, that source/design drift must be reported.

### 2.2 What “match the Claude Design” means

Matching is not a single global screenshot percentage. For a named app revision, design revision, device profile, viewport, state, and runtime, it means:

- required elements exist and no unintended elements appear;
- geometry, alignment, spacing, clipping, and paint order are within declared tolerances;
- the correct font resources, sizes, weights, line breaks, and baselines are used;
- colors, grayscale relationships, borders, images, vectors, and backgrounds satisfy the design contract;
- touch, keyboard, focus, accessibility, navigation, scrolling, and text entry work;
- business behavior and persisted state remain correct;
- motion and transitions reproduce the agreed behavior under deterministic checkpoints;
- portrait, landscape, resized, empty, loading, error, and populated states behave as specified;
- the exact artifact passes compilation, automated tests, render verification, and required device checks.

“Pixel perfect” must never be a project-wide badge. It is an evidence-backed result for a particular screen, state, viewport, artifact, and verification profile.

---

## 3. Product scope

### 3.1 Primary mode: retrofit an existing app

The primary workflow changes the presentation of existing screens while preserving functional boundaries such as:

- navigation routes and back-stack behavior;
- ViewModels, reducers, state holders, and event contracts;
- repositories, databases, sync, and network behavior;
- dependency injection and lifecycle behavior;
- persistence and process-recreation behavior;
- accessibility semantics and input behavior;
- analytics or product events, where applicable;
- existing unit, integration, and behavioral tests.

The tool may recommend refactoring when presentation and behavior are tightly coupled, but it must make that change explicit. It must not silently replace production functionality with preview-only state or placeholder callbacks.

### 3.2 Secondary mode: greenfield generation

The system may also create a new Compose scaffold when no Android app exists. Greenfield generation should use the same evidence bundle, design contract, capability reporting, and verification system. It is secondary because the strongest Daylight use case is redesigning real apps that already have functionality.

### 3.3 Explicit non-goals for the first product

- A universal, fully automatic CSS/JavaScript-to-Compose compiler.
- Perfect inference of application logic from a screenshot or DOM snapshot.
- Silent replacement of unsupported effects with generic Material components.
- Cloud-only operation.
- Automatic deployment or mutation of production accounts.
- Automatic approval of deliberate design deviations.
- Treating emulator or Robolectric output as proof of physical DC-1 behavior.
- Rewriting domain, storage, sync, or navigation architecture merely to simplify styling.
- Using a language model's visual opinion as the sole release gate.

---

## 4. Core principles

### 4.1 Preserve facts before inferring intent

Capture raw measurements, assets, fonts, screenshots, and observed transitions before attempting to infer layout rules or reusable components. Inferred rules must never overwrite the source evidence they came from.

### 4.2 Preserve behavior before changing presentation

Before the redesign begins, capture the existing app's important behavior and establish a baseline. A visually correct rewrite that loses notes, changes back behavior, breaks autosave, or destroys accessibility is a failure.

### 4.3 Let deterministic tooling measure; let agents reason

The tool should own:

- capture;
- hashing and provenance;
- parsing and schemas;
- builds and test execution;
- native layout telemetry;
- screenshot and behavior comparison;
- quality gates;
- machine-readable reporting.

The coding agent should own:

- understanding app architecture;
- mapping design concepts to existing components;
- choosing appropriate Compose primitives;
- refactoring presentation boundaries;
- resolving visual and behavioral failures;
- producing readable, maintainable code.

The human should own:

- approving the design;
- resolving genuinely ambiguous mappings;
- accepting intentional deviations;
- deciding product behavior that the design does not specify.

The authority rule is:

- **Claude Design is the visual and intended-interaction authority.**
- **The verified existing application is the functional-behavior authority.**
- **An explicit owner decision is required when those authorities conflict or when either side is incomplete.**

### 4.4 Fail closed

Outcomes are `PASS`, `FAIL`, or `BLOCKED`.

- Missing evidence is `BLOCKED`.
- Measured evidence outside its budget is `FAIL`.
- Only complete evidence within budget is `PASS`.
- Unit-test counts cannot substitute for visual or behavioral evidence.
- A mostly blank canvas cannot hide failed foreground content.
- A static audit cannot substitute for compilation and a native render.

### 4.5 Report capability honestly

Every source feature must be classified as one of:

- `EXACT_NATIVE`: represented with supported native Compose behavior;
- `BOUNDED_APPROXIMATION`: expected to differ within a declared budget;
- `ASSET_FALLBACK`: preserved as a vector, bitmap, or custom-drawn asset;
- `AGENT_IMPLEMENTATION_REQUIRED`: the coding agent must implement it;
- `UNSUPPORTED_BLOCKING`: the workflow cannot claim success until resolved;
- `INTENTIONAL_DEVIATION`: explicitly approved by the owner with rationale.

Unsupported behavior must not quietly become generic Material styling.

---

## 5. End-to-end workflow

### Stage A — Initialize and baseline the existing app

### Inputs

- Android repository path and exact Git revision;
- target application/module and build variant;
- Daylight design-system version;
- target device profiles;
- optional existing screenshots and product scenarios.

### Actions

1. Run an environment doctor for Node, Chromium, Java, Android SDK, Gradle, fonts, disk space, and optional device access.
2. Inspect the Gradle project and identify application modules, source sets, build variants, Compose configuration, navigation, tests, and screenshot infrastructure.
3. Index relevant Kotlin using a syntax-aware parser or Kotlin compiler/PSI facilities rather than regular-expression-only inspection.
4. Identify screens, routes, composables, ViewModels/state holders, action/event types, repositories, and UI test tags.
5. Run the smallest safe baseline checks and record exact results.
6. Capture existing native screenshots and semantics for important states.
7. Record behavior invariants that must survive the redesign.

### Outputs

- `app-baseline.json`;
- `existing-app-model.json`;
- baseline screenshots and semantics trees;
- behavior invariant manifest;
- exact commands, revision, artifact hashes, and environment receipt;
- list of blocked or missing baseline evidence.

### Baseline gate

If the existing app does not compile or required behavior cannot be observed, the redesign may proceed experimentally, but the preservation claim remains `BLOCKED`. The tool must not attribute pre-existing failures to the redesign.

### Stage B — Capture the approved Claude Design

### Inputs

- Claude Design share URL or exported artifact bundle;
- declared screen and state names;
- device/viewport profiles;
- authored interaction scenarios;
- optional link to the source app revision used to inform the design.

Prompts, repository summaries, screenshots, or other context used to create the design may be retained as provenance, but they are evidence rather than executable instructions. The current user request, approved design contract, and inspected target repository remain authoritative for the migration.

### Capture requirements

For every required state and viewport, retain:

- artifact URL or export hash;
- browser and capture-engine versions;
- viewport, DPR, density mapping, font scale, locale, theme, and reduced-motion setting;
- screenshot and measured scene from the same settled state;
- complete loaded font and asset identities and hashes;
- DOM/layout tree, paint order, clipping, transforms, stacking, scroll positions, and visibility;
- text runs, line breaks, baselines, font metrics, and alignment;
- vectors, raster images, canvas recordings, and background paint;
- semantics, roles, focusability, hit regions, and form state;
- console, network, font, and asset failures;
- a stable source identity for each observed element.

Prefer an explicit export workflow or a task-specific isolated browser profile. If authentication is required, use a dedicated local profile with the minimum necessary session state and explicit owner consent; do not attach a general-purpose logged-in browser profile. The tool should not upload Claude credentials, cookies, private source, or personal content to a hosted service.

### Outputs

- immutable evidence bundle;
- source scene for every viewport/state;
- captured assets and fonts;
- behavior observations;
- provenance and reproducibility receipt.

### Stage C — Create the design contract

The design contract should separate measured facts from inferred intent.

### Layer 1: measured scene

- source identity;
- bounds and paint bounds;
- paint/z order;
- clip and transform chain;
- text runs and baselines;
- actual line breaks;
- image/vector/font identity;
- computed paint properties;
- semantics and hit regions;
- current state values.

### Layer 2: inferred layout intent

- fixed, intrinsic, fill, proportional, or content-driven sizing;
- minimum and maximum constraints;
- row, column, overlay, grid, flow, or custom topology;
- anchoring and alignment relationships;
- gaps, insets, padding, and margins;
- wrapping and breakpoint rules;
- scroll containers and sticky behavior;
- confidence and alternative explanations.

Layout intent should be inferred from multiple widths whenever possible. A single screenshot cannot reliably distinguish fixed, proportional, or intrinsic sizing. Ambiguous inferences must be surfaced instead of treated as facts.

### Layer 3: behavior contract

- named states and state variables;
- user events;
- application actions;
- navigation effects;
- focus and keyboard behavior;
- before/after semantics;
- animation tracks, timing, easing, interruption, and reduced-motion behavior;
- loading, empty, populated, error, permission-denied, and offline states where relevant.

If Claude Design omits an existing application state, the default is to preserve that behavior and adapt its presentation consistently with the approved design system. The omission is not permission to delete the state. If Claude Design introduces an affordance with no existing action, it becomes an unresolved product requirement rather than a generated placeholder callback.

### Layer 4: design-system contract

- Daylight token version;
- color, grayscale, typography, shape, spacing, and motion tokens;
- component roles and permitted variants;
- accessibility requirements;
- DC-1-specific presentation rules;
- intentional deviations from generic Android or Material behavior.

### Stage D — Analyze correspondence with the existing app

This is the major addition required by the existing-app use case.

The system must map design concepts to existing app concepts rather than blindly generating a parallel screen.

### Correspondence records

Each record should contain:

- design screen/state/source identity;
- existing route and composable symbol;
- existing state source;
- existing callback, action, or event;
- expected visual component role;
- proposed modification boundary;
- mapping confidence;
- evidence supporting the mapping;
- unresolved ambiguity;
- preservation obligations;
- allowed files/modules for the first implementation attempt.

### Mapping policy

- High-confidence mappings may proceed automatically.
- Medium-confidence mappings should be proposed to the coding agent with alternatives.
- Low-confidence mappings that affect behavior require human clarification.
- Visual-only uncertainty may be explored automatically but cannot be accepted without evidence.
- The system must never map by visible text alone when stable symbols, semantics, routes, or action types are available.

### Stage E — Produce a migration plan and agent packet

The tool should not immediately overwrite production files. It should produce a reviewable implementation packet containing:

- objective and scoped screens;
- exact source and target revisions;
- design-contract version and hashes;
- existing behavior invariants;
- correspondence map;
- files and symbols likely to change;
- files and subsystems that must not change;
- required assets and fonts;
- unsupported or ambiguous features;
- build and verification commands;
- failure budgets;
- required evidence;
- current structured defects;
- an instruction not to modify thresholds or golden references to make failures disappear.

The packet should be useful to Codex, Claude Code, or another coding harness without requiring proprietary orchestration.

### Stage F — Agent-assisted implementation

The coding agent should normally work in-place in the existing app:

1. Preserve domain and state boundaries.
2. Introduce or improve a presentation seam if the existing screen is too tightly coupled.
3. Add required fonts, vectors, images, and tokens with provenance.
4. Implement parent layout topology before local offsets.
5. Preserve stable semantic/action identities.
6. Add native test tags and geometry telemetry linked to design source identities.
7. Compile and run the smallest affected tests.
8. Render every required state and viewport.
9. Consume structured verifier failures and iterate.
10. Stop when the gate passes or a genuine blocker requires owner input.

Generated code should be treated as a proposed patch, not unquestionable output. The agent may write a cleaner native implementation as long as it satisfies the contract.

Use an isolated task branch or worktree where practical. Read-only analysis, contract generation, and verification should remain separately runnable from patch application so the user's coding harness preserves its normal review and approval experience.

### Stage G — Verification and repair loop

Verification should run from causal checks to expensive checks:

1. schema and provenance validation;
2. Android compilation and static checks;
3. existing behavior/unit tests;
4. required element and semantic presence;
5. native geometry and text-layout comparison;
6. raster and contour comparison;
7. interaction scenario replay;
8. performance/accessibility checks;
9. physical-device verification where required.

Defects should be attached to stable identities and expressed as actionable differences. Repairs should modify typed IR, mappings, assets, or Kotlin code. The system should not fuzzy-search a visible label and inject unexplained pixel offsets.

### Stage H — Deliver the evidence package

The final package should contain:

- source and target commit identifiers;
- design artifact and evidence hashes;
- generated/modified file manifest;
- exact build artifact hash;
- screenshots and overlays for every required viewport/state;
- semantics and geometry reports;
- behavior scenario results;
- quality-gate result;
- approved deviations;
- remaining blocked/manual checks;
- device build fingerprint and hardware evidence when available.

---

## 6. Proposed local CLI

```bash
ctc doctor
ctc init --android . --module app --profile daylight-dc1
ctc baseline --variant debug
ctc inspect-app --output .ctc/app
ctc capture <url-or-export> --screen note-editor --profile daylight-dc1 --scenario scenarios/note-editor.yaml
ctc contract build --screen note-editor
ctc map --screen note-editor --android .
ctc plan --screen note-editor
ctc agent packet --screen note-editor --format markdown,json
ctc verify --screen note-editor --profile local
ctc verify --screen note-editor --profile release
ctc defects --screen note-editor --format json
ctc report --screen note-editor
ctc package --screen note-editor
```

---

## 7. Project artifact layout

```text
.ctc/
  project.toml
  profiles/
    daylight-dc1.json
  app/
    app-baseline.json
    existing-app-model.json
    behavior-invariants.json
  designs/
    note-editor/
      design.lock.json
      evidence/
        fonts/
        images/
        vectors/
        scenes/
        screenshots/
      contract/
        measured-scenes.json
        layout-intent.json
        behavior-contract.json
        design-system.json
      mapping/
        correspondence.json
        migration-plan.json
      agent/
        implementation-packet.md
        implementation-packet.json
      verification/
        latest.json
        runs/<run-id>/
          receipt.json
          geometry.json
          semantics.json
          screenshots/
          diffs/
          report.md
```

---

## 8. Architecture & Subsystems

1. **Local Orchestrator**: Command execution, receipts, locking, profiles.
2. **Web Evidence Capture**: Playwright loopback, font/asset settling, viewport capture, measured scene.
3. **Existing Compose App Analyzer**: Gradle model, Kotlin syntax/semantics parsing, composables, routes, state/action contracts.
4. **Evidence-Preserving Intermediate Representation**: Versioned schemas (`ExistingAppModel`, `DesignEvidenceBundle`, `MeasuredScene`, `LayoutIntent`, `BehaviorContract`, `CorrespondenceMap`, `MigrationPlan`).
5. **Native Implementation Backends**: Native-first, Fidelity-first (custom Canvas/vectors), Diagnostic fixed-layout.
6. **Compose Telemetry**: Native bounds in root/window, clipping, baseline, semantics, hit targets.
7. **Verification Engine**: Shared fail-closed quality gate driving CLI, reports, badges, and agent defect packets.

---

## 9. Pilot Selection & Immediate Sequence

Pilot application requirements:
- Functional note-taking app with existing local persistence and clear boundaries.
- Two screens: (1) Notes List (empty and populated), (2) Note Editor (new and existing).
- Preserve existing data, navigation, autosave, and accessibility invariants.
- Verified on Daylight DC1 physical LivePaper display.
