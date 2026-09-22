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

Example:

```json
{
  "designNode": "note-editor/save-action",
  "existingSymbol": "com.daylight.notes.ui.editor.NoteEditorScreen",
  "existingAction": "EditorAction.Save",
  "existingState": "EditorUiState.isSaving",
  "visualRole": "primary-action",
  "confidence": 0.97,
  "preserve": [
    "save remains idempotent",
    "back navigation waits for pending save",
    "disabled state is announced accessibly"
  ]
}
```

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

Defects should be attached to stable identities and expressed as actionable differences, for example:

```text
Screen: note_editor / populated / dc1_portrait
Element: editor/title
Outcome: FAIL

Expected:
  bounds:   x=96, y=184, w=992, h=84
  baseline: 247
  font:     Arizona Sans 42/48, weight 500
  lines:    1

Actual:
  bounds:   x=80, y=202, w=1024, h=104
  baseline: 276
  font:     fallback sans 40/52, weight 400
  lines:    2

Probable causes:
  required font resource was not loaded
  parent horizontal inset differs by 16 px
```

Repairs should modify typed IR, mappings, assets, or Kotlin code. The system should not fuzzy-search a visible label and inject unexplained pixel offsets.

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

The CLI should be the stable public interface. Agent skills, an MCP adapter, and a future GUI should call the same underlying library APIs.

```bash
# Environment and project setup
ctc doctor
ctc init --android . --module app --profile daylight-dc1

# Establish the existing behavior baseline
ctc baseline --variant debug
ctc inspect-app --output .ctc/app

# Capture approved design evidence
ctc capture <url-or-export> \
  --screen note-editor \
  --profile daylight-dc1 \
  --scenario scenarios/note-editor.yaml

# Build the contract and app correspondence
ctc contract build --screen note-editor
ctc map --screen note-editor --android .
ctc plan --screen note-editor

# Produce files for a coding agent
ctc agent packet --screen note-editor --format markdown,json

# Verify an implementation
ctc verify --screen note-editor --profile local
ctc verify --screen note-editor --profile release

# Inspect failures and package evidence
ctc defects --screen note-editor --format json
ctc report --screen note-editor
ctc package --screen note-editor
```

### CLI design requirements

- Every command supports a machine-readable JSON result.
- Exit codes distinguish pass, fail, blocked, invalid input, and infrastructure failure.
- Commands never invent default success evidence.
- Commands write immutable receipts containing exact versions and hashes.
- Destructive changes require explicit flags.
- Capture and verification can be run independently.
- A coding agent can request the next actionable defects without rereading an enormous report.
- A human can open a compact visual comparison without understanding the internal schema.

---

## 7. Project artifact layout

Recommended per-project structure:

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

Large immutable assets may eventually live in a content-addressed local cache while Git stores manifests and approved references. The project must make retention and licensing explicit.

---

## 8. Architecture

### 8.1 Local orchestrator

Responsible for command execution, receipts, locking, profiles, and coordinating deterministic subsystems. It should not contain design-specific heuristics.

### 8.2 Web evidence capture

Retain and harden the existing Playwright-based approach:

- local loopback server for exported artifacts;
- iframe discovery;
- font and asset settling;
- controlled viewport/state capture;
- deterministic animation clock where possible;
- console and network failure capture;
- one measured scene per screenshot;
- explicit failure on wrong frame or wrong dimensions.

### 8.3 Existing Compose app analyzer

New subsystem required by the clarified use case:

- consume Gradle model and source sets;
- parse Kotlin with stable syntax/semantic tools;
- identify composable call graphs and routes;
- identify state and action contracts;
- identify previews, fixtures, test tags, and UI tests;
- record resource and design-system usage;
- expose symbols and relationships to the mapping engine.

The analyzer should not claim whole-program correctness. It should produce evidence with confidence and allow agent-assisted interpretation.

### 8.4 Evidence-preserving intermediate representation

Use versioned schemas. Keep at least these models distinct:

- `ExistingAppModel`;
- `DesignEvidenceBundle`;
- `MeasuredScene`;
- `LayoutIntent`;
- `BehaviorContract`;
- `DesignSystemProfile`;
- `CorrespondenceMap`;
- `MigrationPlan`;
- `VerificationManifest`;
- `EvidenceReceipt`.

Each derived field must identify its inputs and derivation version. This allows a mapping to be regenerated when extraction improves without silently changing its source evidence.

### 8.5 Native implementation backends

Support mixed strategies:

### Native-first backend

Use idiomatic Compose layouts, text, controls, semantics, and state. Best for app structure, editing, navigation, accessibility, and maintainability.

### Fidelity-first backend

Use explicit custom layouts, Canvas, vectors, or precise assets when standard Material components cannot reproduce the visual contract.

### Diagnostic fixed-layout backend

Use measured fixed placement for one viewport to determine whether extraction and rendering can reproduce the source. This is useful diagnostically but is not a production responsive architecture.

A single screen may combine the native-first and fidelity-first strategies. Decorative paths may be custom-drawn while controls remain semantic native components.

### 8.6 Compose telemetry

Every mapped node should have a stable identity available to tests. The verification runtime should capture:

- bounds in root and window;
- visible bounds after clipping;
- baseline and text layout results;
- semantics and enabled/selected/focused state;
- scroll position;
- hit target bounds;
- transition state at deterministic timestamps.

This makes failures causal and reduces dependence on raster inference.

### 8.7 Verification engine

One shared quality-gate result must drive:

- CLI exit status;
- Markdown and JSON reports;
- badges;
- agent defect packets;
- release recommendations.

No report generator may independently loosen thresholds or fabricate default metrics.

---

## 9. Fidelity verification

### Required dimensions

- required element coverage;
- per-element bounding-box overlap;
- centroid and edge drift;
- foreground Ink IoU/Dice;
- edge-contour alignment;
- text baseline and line-break agreement;
- font identity and metrics;
- clipping and paint-order agreement;
- image/vector identity and dimensions;
- global perceptual similarity as a supporting metric;
- semantics and hit-target agreement;
- responsive behavior across required and held-out widths.

### Initial provisional budgets

Budgets must be calibrated using repeated renders, but the current conservative starting point is:

- whole-screen similarity: at least 95%;
- MSSIM: at least 0.90;
- foreground Ink IoU: at least 85%;
- contour alignment: at least 90%;
- required element IoU: at least 90%;
- maximum required-element spatial drift: at most 3 physical pixels at the comparison resolution;
- missing required elements: zero;
- unevaluated required elements: zero.

These metrics are conjunctive. A high whitespace-dominated similarity score cannot override failed foreground or element-local metrics.

The approved external design contract remains the visual authority. The repair loop must not re-record the modified app as a new golden and then call that agreement. Changing a reference, budget, or intentional deviation requires a separate, reviewable owner decision.

### Negative controls

The verification suite must prove it fails when:

- a required image or vector is omitted;
- the wrong font is substituted;
- a parent container is shifted;
- text wraps differently;
- two labels are swapped;
- the reference screenshot is stale;
- the output is blank or mostly blank;
- an element is hidden behind another;
- a required interaction does nothing;
- a coding agent changes thresholds or approved references without authorization.

---

## 10. Behavior and functionality preservation

Visual redesign must not replace existing behavior with preview fixtures.

### Baseline behavior categories

- launch and restoration;
- navigation and back behavior;
- create/read/update/delete flows;
- autosave and explicit save;
- error, retry, offline, and slow dependency behavior;
- keyboard, focus, selection, and text entry;
- process death and recreation;
- orientation and resizing;
- accessibility traversal and actions;
- persistence and authoritative stored state;
- destructive actions and recovery;
- sync or multi-device behavior when applicable.

### Preservation strategy

1. Identify the existing behavior contract before editing.
2. Add characterization tests when important behavior is undocumented.
3. Keep ViewModel/action interfaces stable where practical.
4. Map design interactions to existing app actions explicitly.
5. Verify visible result and persisted/domain result.
6. Treat an intentional product-behavior change as a separate approved requirement.

### Example note-taking invariants

- Existing notes remain readable after the redesign.
- Editing the title/body persists through the same authoritative path.
- Back navigation does not silently discard changes.
- Search/filter results remain correct.
- Deletion still requires the intended confirmation/undo behavior.
- Process recreation restores the expected draft or saved state.
- Empty, populated, error, and offline states remain distinguishable.

---

## 11. Motion and interaction plan

Motion should be implemented after static scene fidelity and behavior mapping work for at least one screen.

### Source capture

For authored scenarios, capture under a controlled clock:

- initial state;
- input event;
- state transition;
- property trajectories at fixed timestamps;
- duration, delay, easing, repeat, and transform origin;
- element mounting/unmounting;
- scroll-linked effects;
- interruption, cancellation, reversal, and rapid repeated input;
- reduced-motion alternative;
- final semantics and application state.

### Intermediate representation

Represent motion as a state-transition graph rather than generic animation helpers:

```text
State A --event/action--> State B
  tracks:
    element/property/start/end/timing/easing
  interruption:
    reverse | continue | snap | cancel
  completion effects:
    focus | navigation | state mutation
```

### Compose lowering

Choose `Transition`, `AnimatedVisibility`, `Animatable`, gesture-driven state, or custom drawing according to the contract. Do not translate all CSS easing to one Material easing curve.

### Verification

- replay the equivalent browser and Compose scenarios;
- sample deterministic frame checkpoints;
- compare geometry, paint, semantics, and state;
- verify interruption and rapid-input behavior;
- keep business effects separate from decorative motion;
- verify reduced-motion behavior.

---

## 12. Daylight and DC-1 profile

The Daylight layer should be a versioned profile, not scattered hard-coded conditions.

It should define:

- exact portrait and landscape dimensions and density mapping;
- system bars, insets, font scale, and input assumptions;
- Daylight design tokens and components;
- grayscale/contrast expectations under relevant lighting conditions;
- text and touch ergonomics;
- animation and performance budgets;
- accessibility requirements;
- hardware test scenarios;
- exact build and device fingerprint requirements for release evidence.

Do not invent EPD waveform or forced-refresh behavior unless the real platform exposes and requires it. Hardware checks should measure the actual DC-1 rather than applying assumptions from unrelated e-ink devices.

Required hardware validation should eventually include:

- portrait/landscape and resizing;
- cold/warm launch;
- touch, keyboard, stylus, and buttons where relevant;
- suspend/wake;
- frontlight/display conditions;
- network transitions;
- crash/ANR checks;
- scroll and animation latency;
- memory, battery, and thermal behavior;
- accessibility and physical reach.

Within the Daylight workspace, `./bin/daylight-qa` should remain the common release-evidence harness. This project should contribute declarative app/profile/scenario configuration and add missing test primitives where necessary rather than create a competing top-level release status. The design-retrofit verifier can produce detailed visual and behavioral evidence that `daylight-qa` consumes.

---

## 13. Agent integration

### Phase 1: plain CLI

Any coding agent can run the commands and read JSON/Markdown outputs. This is the most portable and debuggable interface.

### Phase 2: agent skill packages

Provide small, versioned skills for Codex and Claude Code that teach the same workflow:

1. read the implementation packet;
2. inspect mapped symbols and invariants;
3. edit only within authorized scope;
4. run the smallest checks;
5. run `ctc verify`;
6. address structured defects;
7. never modify thresholds or references to obtain a pass;
8. report blockers honestly.

### Phase 3: optional MCP adapter

Expose structured operations such as `capture`, `get_contract`, `get_defects`, and `verify`. MCP remains an adapter over the core CLI/library, not a separate implementation.

### Phase 4: optional local visual workbench

A local UI may display:

- source/native/diff views;
- linked element selection;
- state/viewport navigation;
- correspondence mappings;
- iteration history;
- intentional-deviation approvals.

The workbench should not be required for agent automation.

---

## 14. Hosting and Railway decision

### Initial decision: no hosted core service

The first personal and team versions should run locally. Users already have capable MacBooks and coding agents. Local execution provides:

- access to the existing repository;
- access to local or authenticated Claude Design artifacts;
- Chromium, Java, Gradle, and Android SDK;
- fast edit/verify loops;
- privacy for source code and design artifacts;
- optional access to a connected DC-1;
- fewer sources of rendering nondeterminism.

The extractor's ephemeral HTTP server should remain loopback-only and exist only while loading a local artifact into Chromium. It is not a service that needs Railway.

### Optional later control plane

Railway or another platform may become useful after the local workflow succeeds, for:

- team job/history dashboards;
- sharing immutable, access-controlled evidence packages;
- schema/profile/plugin registries;
- coordinating a shared hardware lab;
- opt-in anonymous compatibility data;
- update metadata.

Even then, the local CLI should remain fully functional. A hosted system should coordinate work, not become the only place conversion can occur.

A possible later topology is:

```text
Hosted API/dashboard
        |
        +-- metadata database
        +-- job queue
        +-- object storage for immutable evidence
        +-- optional containerized capture workers
        |
        +-- local/self-hosted DC-1 runners polling authorized jobs
```

Do not use a single attached application volume as the long-term artifact architecture. Immutable screenshots, assets, and reports fit content-addressed object storage better. Private source, cookies, credentials, and real user content require explicit security and retention policies before any upload feature exists.

---

## 15. Security and privacy

### Local execution

- Bind temporary artifact servers to loopback only.
- Treat captured HTML, JavaScript, SVG, fonts, and images as untrusted input.
- Sandbox Chromium and constrain filesystem/network access.
- Avoid exposing local directories outside the selected artifact root.
- Never store browser cookies or authentication data inside evidence bundles.
- Redact tokens, emails, note content, and private account identifiers from reports.
- Make external network requests visible and optionally block them after capture.

### Agent execution

- Scope editable files and commands.
- Keep source provenance and diff receipts.
- Prevent test fixtures, golden images, and thresholds from being changed in the same automatic repair loop unless explicitly authorized.
- Separate generated artifacts from production account actions.

### Community release

- Document the threat model for untrusted design exports.
- Add resource, timeout, and file-size limits.
- Verify third-party asset and font licensing.
- Sign releases and publish checksums.
- Default telemetry to off.
- Provide a clear deletion model for cached captures.

---

## 16. Test strategy

### Unit tests

- schema validation and migrations;
- layout-intent inference;
- font/vector/image processing;
- Kotlin/source mapping;
- capability classification;
- quality-gate logic;
- report consistency.

### Golden compiler tests

- small, licensed HTML/CSS/Compose fixtures;
- expected IR and expected native telemetry;
- no reliance on a global screenshot score alone.

### Retrofit integration fixtures

At least one real or purpose-built Compose application with:

- list/detail/editor navigation;
- ViewModel state;
- persistence;
- empty/loading/error/populated states;
- rotation/process-recreation behavior;
- representative accessibility behavior.

### End-to-end tests

- freeze a Claude Design artifact;
- analyze a pinned Android revision;
- create the mapping and agent packet;
- apply a known patch;
- compile and render;
- compare all required states;
- replay behavior;
- retain evidence.

### Adversarial tests

- duplicate labels;
- hidden/conditional elements;
- missing fonts;
- network failure;
- stale source artifact;
- responsive reorder;
- nested scrolling;
- clipping/transforms;
- unsupported canvas/WebGL;
- agent tries to weaken verification;
- baseline app is already broken.

### Hardware tests

Keep device results distinct from emulator/Robolectric results. Record exact device and artifact identity.

---

## 17. Delivery milestones and exit criteria

### Milestone 0 — Restore trust in evidence

### Deliverables

- one shared fail-closed quality gate;
- accurate reporting and exit codes;
- negative controls;
- removal of fabricated metrics and unconditional perfect scores.

### Exit criteria

- historical false-green evidence fails;
- missing build/render/diff evidence blocks;
- the same outcome appears in CLI, JSON, Markdown, and badges.

**Current status:** foundation work has begun in the repository, including the shared quality gate and false-green regression tests.

### Milestone 1 — Existing-app baseline and analyzer

### Deliverables

- project initialization;
- Gradle/module/source inspection;
- Compose screen/route/state/action index;
- baseline build/test/screenshots;
- behavior invariant manifest.

### Exit criteria

- the chosen pilot app can be analyzed reproducibly;
- one screen maps to its route, composable, state source, and actions;
- pre-existing failures are distinguished from retrofit regressions.

### Milestone 2 — One faithful static retrofit

Use one screen from a pinned note-taking app and one approved Claude Design artifact.

### Deliverables

- multi-viewport evidence bundle;
- exact fonts and assets;
- measured scene and layout intent;
- design-to-existing-app correspondence;
- agent implementation packet;
- native geometry telemetry;
- passing static fidelity evidence.

### Exit criteria

- no artifact-ID-specific code or screen-specific verifier exceptions;
- compilation and existing affected tests pass;
- all required elements are evaluated;
- portrait, landscape, and one held-out width satisfy the gate;
- omitted-asset and wrong-font negative controls fail.

### Milestone 3 — Functional note editor retrofit

### Required states

- new empty note;
- existing populated note;
- editing title and body;
- saving/saved/error;
- back/discard behavior;
- process recreation;
- keyboard and focus behavior.

### Exit criteria

- visual requirements pass for every required state;
- the existing persistence path is preserved;
- behavioral and authoritative-state checks pass;
- accessibility semantics and focus order pass.

### Milestone 4 — Deterministic interaction and motion

### Deliverables

- scenario format;
- controlled browser capture;
- behavior/state-transition graph;
- Compose replay with controlled clock;
- frame and semantics comparison.

### Exit criteria

- at least one navigation transition, one press/selection response, and one content transition pass normal, interrupted, and reduced-motion scenarios.

### Milestone 5 — DC-1 qualification

### Deliverables

- versioned DC-1 device profile;
- self-hosted hardware runner;
- exact artifact installation and evidence capture;
- performance, display, input, suspend/wake, and accessibility scenarios.

### Exit criteria

- named build passes required device scenarios;
- no crash/ANR regression;
- visual and interaction evidence is retained with device fingerprint;
- any emulator/device differences are documented and bounded.

### Milestone 6 — Team distribution

### Deliverables

- signed/versioned CLI package;
- one-command doctor/setup guidance;
- Codex and Claude Code skills;
- schema migration support;
- fixture project and troubleshooting documentation;
- optional CI integration.

### Exit criteria

- another team member can install, capture, map, implement, and verify without maintainer intervention;
- local results are reproducible across supported Macs;
- private data stays local by default.

### Milestone 7 — Community readiness

### Deliverables

- stable public schemas and compatibility policy;
- security hardening;
- contributor fixtures;
- plugin/profile interfaces;
- documented supported subset and known limitations;
- release signing and support policy.

### Exit criteria

- untrusted-input threat model is addressed;
- community users can diagnose blocked dependencies;
- unsupported inputs fail explicitly;
- project claims match retained evidence.

---

## 18. Pilot selection

Choose the first note-taking pilot carefully. Prefer an application that:

- is already primarily Compose;
- has a manageable module structure;
- has stable list and editor flows;
- stores data locally through a clear repository boundary;
- has at least some existing tests;
- can be built without private production credentials;
- has a license compatible with the pilot;
- can be frozen at one commit;
- contains enough real behavior to test preservation without introducing sync complexity immediately.

Start with two screens:

1. notes list: empty and populated;
2. note editor: new and existing.

Defer account sync, collaboration, complex rich text, and cloud conflict behavior until the local retrofit loop is credible.

---

## 19. Repository evolution

Do not delete the current repository or immediately split it into many services. Introduce logical boundaries first:

```text
core/
  schemas/
  contracts/
  receipts/
capture/
  web/
analyze/
  android/
mapping/
agent/
  packets/
backends/
  compose/
profiles/
  daylight/
  dc1/
verification/
  geometry/
  raster/
  behavior/
cli/
fixtures/
```

Existing modules can be adapted behind these boundaries. Only split packages when independent versioning or build performance justifies it.

### Code to retain where verified

- Playwright browser lifecycle and artifact loading;
- asset and font capture;
- SVG parsing and vector work;
- Android build/test execution;
- screenshot and localized diff algorithms;
- fail-closed gate foundation.

### Code paths to replace or retire

- generic layout-template synthesis that discards measured evidence;
- universal mapping of design roles to default Material appearances;
- placeholder state and callbacks presented as finished behavior;
- generic motion helper emission without a behavior graph;
- fuzzy Kotlin edits based on visible text;
- artifact-specific coordinates or IDs in supposedly generic verification;
- any report path that can pass without its required evidence.

---

## 20. Risks and mitigations

### Risk: Claude Design structure changes

**Mitigation:** retain screenshots, computed evidence, source exports, hashes, and capture adapters. Do not couple the core contract to one undocumented DOM shape.

### Risk: web layout and Compose cannot rasterize identically

**Mitigation:** package exact fonts/assets, compare geometry before raster, calibrate stable renderer variance, support fidelity-first custom drawing where justified, and report bounded approximations honestly.

### Risk: responsive intent is underdetermined

**Mitigation:** capture multiple widths, score inference confidence, verify held-out widths, and request owner input for materially different alternatives.

### Risk: existing app presentation and behavior are tightly coupled

**Mitigation:** characterize behavior first, introduce a narrow presentation seam, preserve state/action interfaces, and avoid a whole-app rewrite.

### Risk: coding agents optimize the metric instead of the product

**Mitigation:** lock references and thresholds, separate verifier code from the repair scope, use multiple conjunctive signals, include negative controls, and audit unexpected golden changes.

### Risk: screen-specific patches appear to generalize

**Mitigation:** forbid artifact-ID branches in generic code, use held-out fixtures, and require the same path to handle a second screen before expanding claims.

### Risk: community inputs execute hostile code

**Mitigation:** sandbox capture, minimize privileges, constrain filesystem/network access, enforce resource limits, and publish a threat model before community release.

### Risk: hardware evidence is unavailable

**Mitigation:** report hardware validation as `BLOCKED`, preserve emulator evidence separately, and use a controlled self-hosted runner when available.

---

## 21. Decision gates

### Gate 1 — After the first static screen

If exact extraction plus a carefully written native implementation cannot meet the static gate, stop adding features. Determine whether the gap comes from source capture, font/rendering differences, or the comparison model.

### Gate 2 — After the second screen

Require the same generic evidence/mapping/verification path to work without artifact-specific code. If it does not, narrow the supported subset before proceeding.

### Gate 3 — After the note editor

Verify that preserving behavior is tractable. If the implementation requires rewriting domain logic, improve the presentation-mapping boundary rather than teaching the compiler more UI heuristics.

### Gate 4 — After the first motion scenario

Decide whether deterministic browser capture provides sufficient behavior evidence. If not, require authored behavior contracts instead of claiming automatic inference.

### Gate 5 — Before team distribution

An uninvolved teammate must complete the workflow from installation to evidence package. Setup friction and nondeterminism found here are product defects.

### Gate 6 — Before community distribution

Complete untrusted-input security work, schema/versioning policy, signed releases, licensing review, and claim audit.

---

## 22. Immediate implementation sequence

1. Approve or revise this product definition.
2. Select and freeze the note-taking pilot repository and commit.
3. Select two pilot screens and enumerate their behavior states.
4. Produce the approved Claude Design at exact DC-1 portrait and landscape targets.
5. Finish fail-closed gate integration and negative controls.
6. Define the versioned `ExistingAppModel`, `DesignEvidenceBundle`, `CorrespondenceMap`, and `BehaviorContract` schemas.
7. Implement the baseline/app analyzer for the pilot.
8. Capture a coherent measured scene for every pilot state and viewport.
9. Produce the first correspondence map and agent implementation packet.
10. Have a coding agent implement the static notes-list redesign in-place.
11. Add native geometry/text telemetry and iterate to a real pass.
12. Repeat for the functional note editor.
13. Add deterministic motion and interaction scenarios.
14. Add physical DC-1 validation.
15. Package the local CLI and agent skills for a second team member.

Do not begin with Railway, a public dashboard, a universal component library, or broad community packaging. The critical proof is one existing functional app successfully redesigned through a reproducible agent loop without losing behavior.

---

## 23. Success metrics

### Technical success

- Complete required evidence is available for every accepted state and viewport.
- Existing behavior invariants remain green.
- Required fidelity budgets pass without per-artifact verifier exceptions.
- A coding agent can consume structured failures and reduce them iteratively.
- The same pipeline generalizes to at least two screens and then a second app.
- Physical-device evidence is clearly distinguished from local render evidence.

### Workflow success

- The owner can go from approved Claude Design to a correctly restyled screen without manually translating spacing and typography.
- Another team member can reproduce the workflow on a supported Mac.
- Agent packets are concise enough to guide implementation and precise enough to prevent functional drift.
- Failure messages identify what changed and where, rather than merely producing a red diff image.

### Trust success

- No missing evidence is reported as a pass.
- Published claims can be traced to immutable evidence.
- Intentional deviations are explicit and approved.
- Community users can tell the difference between supported, approximate, and blocked features.

---

## 24. Final recommendation

Keep the current repository and give its builder a bounded architectural reset. Build the product around **existing-app preservation, design contracts, agent implementation packets, and deterministic verification**. Treat one-pass Compose generation as an accelerator, not as the definition of success.

The first convincing demonstration should be:

> A pinned functional note-taking app is redesigned in-place to match an approved Claude Design on DC-1 portrait and landscape. Its existing notes, navigation, editing, save, back, restoration, and accessibility behavior still work. Codex or Claude Code performs the implementation using a generated contract and iterates from structured failures. The final exact artifact has retained visual, behavioral, and device evidence, and removing an asset or shifting a parent reliably makes the gate fail.

If that works, the product has a strong foundation for the Daylight team and eventually the community. If it does not, the evidence will identify whether capture, mapping, native rendering, or behavior preservation is the limiting problem—without hiding the result behind passing unit-test counts.
