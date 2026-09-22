# TEST_INFRA: Claude to Compose (`ctc`) v2 Opaque-Box E2E Test Infrastructure

**Document Version**: 3.0.0  
**Status**: ACTIVE & RATIFIED  
**Author**: E2E Test Writer Agent (`test_writer_e2e`)  
**Project**: `claude_to_compose` (`ctc` v2 Existing App Design-Retrofit Compiler)  
**Working Directory**: `/Users/anjan/.gemini/antigravity/scratch/claude_to_compose`  
**Date**: 2026-09-22  

---

## 1. Executive Summary & Architecture

The `ctc` (Claude to Compose) v2 pipeline transforms Claude Design web artifacts into production-ready modifications of existing functional Android Jetpack Compose applications. Unlike greenfield generation, the existing app retrofit workflow operates under strict behavioral and architectural preservation constraints:
1. **Behavioral Invariance**: Existing Room database persistence, ViewModel StateFlow bindings, back-stack navigation, process recreation, and accessibility semantics must be preserved 100%.
2. **Immutable 4-Layer IR**: Separates raw physical DOM measurements (Layer 1) from multi-viewport layout intent (Layer 2), dynamic behavior state machines (Layer 3), and Sol:OS design tokens (Layer 4).
3. **App Correspondence & Scoped Agent Packets**: Maps design nodes to existing Kotlin symbols without relying on raw text matching, enforcing strict allowed/forbidden file modification boundaries.
4. **Progressive 6-Stage Verification**: Fail-closed verification running from fast causal checks to expensive perceptual and hardware checks (Schema -> Compile/Tests -> Layout Telemetry -> Perceptual Metrics -> Scenario Replay -> Physical DC1 Qualification).
5. **Daylight DC1 LivePaper Hardware Profile**: Custom transflective LCD (60Hz–120Hz fluid framerate, standard Android SurfaceFlinger, zero EPD waveforms/flashes, WCAG AAA 8-bit grayscale contrast).

The test infrastructure defined in this document establishes an **opaque-box, multi-tier E2E testing hierarchy** rooted in `tests/e2e/` that evaluates the complete retrofit lifecycle from pre-retrofit baseline capture to live DC1 tablet verification.

---

## 2. Test Runner Architecture (`tests/e2e/run_all_v2.js`)

The master runner is implemented in `tests/e2e/run_all_v2.js`. It runs with zero external test framework dependencies using standard Node.js runtime (`>=18`), providing millisecond execution, full test isolation, and structured terminal/JSON outputs.

### CLI Invocation Syntax

```bash
# Run complete test suite across all 4 tiers and negative controls
node tests/e2e/run_all_v2.js

# Run specific tier
node tests/e2e/run_all_v2.js --tier 1   # Tier 1: Feature Coverage (F1-F23 in isolation)
node tests/e2e/run_all_v2.js --tier 2   # Tier 2: Boundary & Corner Cases (B1-B23)
node tests/e2e/run_all_v2.js --tier 3   # Tier 3: Cross-Feature Interactions
node tests/e2e/run_all_v2.js --tier 4   # Tier 4: Real-World Retrofit Scenarios (S1-S5)

# Run negative controls directly
node tests/e2e/run_all_v2.js --filter "NC-"

# Filtering by pattern
node tests/e2e/run_all_v2.js -f "Baseline"
node tests/e2e/run_all_v2.js -f "Contract"

# Verbose output with full diagnostic details
node tests/e2e/run_all_v2.js -v

# Emit structured JSON summary
node tests/e2e/run_all_v2.js --json

# Stop on first failure
node tests/e2e/run_all_v2.js -b
```

### Progressive Testability Architecture

During milestone implementation, components are delivered incrementally (M1 Analyzer & Baseline, M2 Contract IR, M3 Correspondence & Packet, M4 Verification & Defects, M5 Local CLI & DC1 Profile, M6 Integration). The test harness supports **progressive testability**:
- If an implementation module or CLI subcommand exists, the test exercises real execution and asserts exact contracts.
- If an implementation component is pending an upcoming milestone, the test detects the pending status via `checkComponent(name, milestone, detail)` or `UnimplementedError` and reports `UNIMPLEMENTED` without crashing the test process.
- Mathematical oracles, schema specifications, token color systems, and negative control assertions are verified directly in the harness.
- This guarantees that the test suite runs cleanly at any point in the project lifecycle, accurately tracking milestone progression from planned to 100% PASS.

### Test Context API (`t`)

Every test receives an isolated test context `t`:
- `t.assert(condition, message)`: Boolean assertion.
- `t.assertEqual(actual, expected, message)`: Strict value equality (`===`).
- `t.assertDeepEqual(actual, expected, message)`: Deep object and array equality.
- `t.assertMatch(str, regex, message)`: Regular expression pattern assertion.
- `t.assertThrows(fn, expected, message)`: Synchronous exception assertion.
- `t.assertRejects(promiseFn, expected, message)`: Asynchronous exception assertion.
- `t.checkFileExists(relPath, milestone, detail)`: Flags `UNIMPLEMENTED` if file is absent without crashing.
- `t.checkComponent(name, milestone, checkFn)`: Validates component if present or reports pending milestone.
- `t.skip(reason)`: Skips test with documented reason.
- `t.oracle`: Access to authoritative mathematical and contract oracles.

---

## 3. Feature Inventory & Tier Mapping (Features 1–23)

All 23 features from `PROJECT.md § Feature Inventory` are covered across the 4 test tiers:

| # | Feature | Description | Milestone | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Interactions) | Tier 4 (Real-World) |
|---|---------|-------------|-----------|:---:|:---:|:---:|:---:|
| **F01** | Functional Pilot Android App Fixture | Multi-screen Note-Taking app with Room DB, ViewModels, navigation, and tests | M1 | `f01_pilot_app` (5 tests) | `b01_pilot_app` (5 tests) | App fixture baseline | S01-S03 note app |
| **F02** | Kotlin/Compose Syntax-Aware AST Parser | Index composables, routes, ViewModels, StateFlow, events, repositories, test tags | M1 | `f02_ast_parser` (5 tests) | `b02_ast_parser` (5 tests) | Parser -> Indexer | S01 structure index |
| **F03** | Pre-Retrofit Baseline Capture (`ctc baseline`) | Capture compilation status, unit/behavior tests, preview hashes into `app-baseline.json` | M1 | `f03_baseline_capture` (5 tests) | `b03_baseline` (5 tests) | Baseline -> Gate | S01 clean baseline |
| **F04** | Existing App Model Indexer (`ctc inspect-app`) | Extract structural model into `existing-app-model.json` and behavior manifest | M1 | `f04_app_indexer` (5 tests) | `b04_app_indexer` (5 tests) | Model -> Correspondence | S01 model index |
| **F05** | Fail-Closed Baseline Gate | Distinguish pre-existing app failures from retrofit regressions (`BLOCKED` on broken baseline) | M1 | `f05_baseline_gate` (5 tests) | `b05_baseline_gate` (5 tests) | Baseline -> Gate | NC-04 missing evidence |
| **F06** | Layer 1 Measured Scene IR (`measured-scenes.json`) | Physical bounds, paint bounds, z-order, clip chain, text runs, baselines, asset hashes | M2 | `f06_measured_scene` (5 tests) | `b06_measured_scene` (5 tests) | Scene -> Layout Intent | S02 scene extraction |
| **F07** | Layer 2 Inferred Layout Intent IR (`layout-intent.json`) | Sizing constraints, topology, gaps, padding, margins, DC1 portrait & landscape | M2 | `f07_layout_intent` (5 tests) | `b07_layout_intent` (5 tests) | Intent -> Mapping | S04 landscape switch |
| **F08** | Layer 3 Behavior Contract IR (`behavior-contract.json`) | State transitions ($t_0 \to t_1 \to t_2$), gestures, navigation, animations, loading/empty states | M2 | `f08_behavior_contract` (5 tests) | `b08_behavior_contract` (5 tests) | Behavior -> Scenario | S03 autosave behavior |
| **F09** | Layer 4 Design System Contract IR (`design-system.json`) | Sol:OS 8-bit neutral tokens (`--os-0` to `--os-1000`), typography metrics, LivePaper rules | M2 | `f09_design_system` (5 tests) | `b09_design_system` (5 tests) | Tokens -> Telemetry | S02 Sol:OS styling |
| **F10** | Immutable Evidence Bundle Capture (`ctc capture`) | Playwright extraction of settled DOM, fonts, SVG vectors, screenshots, and provenance | M2 | `f10_evidence_capture` (5 tests) | `b10_evidence_capture` (5 tests) | Capture -> Contract | S02 capture pipeline |
| **F11** | Design Contract Compiler (`ctc contract build`) | Synthesizes 4-layer IR from evidence bundle and outputs validated JSON schemas | M2 | `f11_contract_compiler` (5 tests) | `b11_contract_compiler` (5 tests) | Contract -> Map | S02 contract synthesis |
| **F12** | Semantic Correspondence Mapper (`ctc map`) | 1:1 mapping between design nodes and Kotlin composables/state/actions with confidence | M3 | `f12_correspondence_mapper` (5 tests) | `b12_correspondence_mapper` (5 tests) | Map -> Plan | S02 correspondence |
| **F13** | Migration Planner (`ctc plan`) | Phased migration sequence with strict allowed and forbidden modification boundaries | M3 | `f13_migration_planner` (5 tests) | `b13_migration_planner` (5 tests) | Plan -> Packet | S02 migration plan |
| **F14** | Agent Implementation Packet Generator (`ctc agent packet`) | Emits Markdown and JSON packets with failure budgets, boundaries, and preservation rules | M3 | `f14_agent_packet` (5 tests) | `b14_agent_packet` (5 tests) | Packet -> Verification | S02 agent prompt |
| **F15** | Progressive Verification Pipeline (`ctc verify`) | 6-stage verification: Schema, Compile/Tests, Layout Telemetry, Perceptual, Scenario, Hardware | M4 | `f15_verification_pipeline` (5 tests) | `b15_verification_pipeline` (5 tests) | Verify -> Defects | S05 verification loop |
| **F16** | Causal Defect Oracle (`ctc defects`) | Attribute failures directly to stable element IDs with root causes and actionable remediation | M4 | `f16_defect_oracle` (5 tests) | `b16_defect_oracle` (5 tests) | Defects -> Remediation | S05 defect diagnosis |
| **F17** | Deterministic Negative Controls (NC-01 to NC-06) | Deterministic FAIL/BLOCKED on missing elements, margin shifts, omitted assets, EPD flashes | M4 | `f17_negative_controls` (5 tests) | `b17_negative_controls` (5 tests) | Controls -> Oracle | NC-01..06 suite |
| **F18** | Unified Local CLI (`bin/ctc.js`) | 13 subcommands (`doctor`, `init`, `baseline`, `inspect-app`, `capture`, `contract`, `map`, etc.) | M5 | `f18_unified_cli` (5 tests) | `b18_unified_cli` (5 tests) | CLI -> All Subsystems | S01-S05 CLI runs |
| **F19** | Versioned Daylight DC1 Profile | 60Hz-120Hz fluid pipeline, zero EPD waveforms, WCAG AAA 8-bit grayscale contrast | M5 | `f19_dc1_profile` (5 tests) | `b19_dc1_profile` (5 tests) | Profile -> Verification | S04 DC1 profile |
| **F20** | `.ctc/` Project Layout Manager | Manage `.ctc/` directory hierarchy, active profiles, evidence bundles, contracts, receipts | M5 | `f20_workspace_manager` (5 tests) | `b20_workspace_manager` (5 tests) | Layout -> Artifacts | S01 workspace init |
| **F21** | E2E Test Suite Meta-Verification | Master runner execution, CLI flags, JSON output, tier isolation, ANSI formatting | E2E | `f21_e2e_suite_meta` (5 tests) | `b21_e2e_suite_boundaries` (5 tests) | Runner -> All Tiers | All runner sweeps |
| **F22** | Physical DC1 LiveApp Deployment & Touch | Automated installation, capacitive touch navigation, zero EPD waveforms on tablet hardware | M6 | `f22_dc1_qualification` (5 tests) | `b22_dc1_qualification` (5 tests) | Hardware -> Verify | Live hardware run |
| **F23** | Regression Protection for Existing 284 Tests | Preserves 284 core E2E tests, 48 overhaul tests, 260 unit tests, and 14 Gradle unit tests | M6 | `f23_regression_protection` (5 tests) | `b23_regression_protection` (5 tests) | Legacy -> Modern | Regression tests |

---

## 4. Deterministic Negative Controls (NC-01 through NC-06)

The negative controls suite verifies that the verification engine is strictly fail-closed and cannot be deceived by empty canvas or silent skipping:

| Control ID | Fault Injected | Target Component | Expected Verdict | Expected Error Code | Verification Mechanism |
|---|---|---|:---:|---|---|
| **NC-01** | Missing Required Element | Delete CTA button (`daylight#note_editor/action/save_btn`) from native layout / telemetry | `FAIL` | `ELEMENT_NOT_RENDERED` | Stage 3 Layout Telemetry bidirectional check detects missing node |
| **NC-02** | Layout Margin Shift ($\ge 10\text{px}$) | Shift headline composable top by $+10\text{px}$ ($+5\text{dp}$) | `FAIL` | `GEOMETRY_DRIFT` | Centroid drift ($10.0\text{px} > 3.0\text{px}$) triggers hard spatial drift veto |
| **NC-03** | Omitted / Missing Font Asset | Delete required `AbcArizonaFlare.ttf` font asset | `FAIL` / `BLOCKED` | `ASSET_HASH_MISMATCH` / `FONT_RESOURCE_MISSING` | Stage 1 cryptographic hash check or Stage 2 font bundling check fails |
| **NC-04** | Missing Preview Evidence | Omit rendered preview PNG from build output directory | `BLOCKED` | `PREVIEW_RENDER_MISSING` | Stage 4 blocks execution immediately without fabricating visual scores |
| **NC-05** | Contrast Degradation / Color Collapse | Map headline text to `--os-200` (#CCCCCC) on white ground (#FFFFFF) | `FAIL` | `CONTRAST_COLLAPSE` | Contrast ratio ($1.67:1 < 4.5:1$) violates WCAG AA/AAA standards |
| **NC-06** | EPD Waveform Clear Hook Injection | Broadcast `ACTION_REFRESH_SCREEN` or inject artificial delay on modal dismiss | `FAIL` | `EPD_WORKAROUND_VIOLATION` | Strict prohibition of EPD particle refreshes on transflective LCD panel |

---

## 5. Authoritative Output Derivation & Mathematical Oracles

Every test in this suite derives its expected values from authoritative mathematical and specification sources:

### 1. 8-Bit Linear Luminance & Contrast Ratio (WCAG 2.1)
$$L = 0.2126 R_{\text{lin}} + 0.7152 G_{\text{lin}} + 0.0722 B_{\text{lin}}$$
where
$$C_{\text{lin}} = \begin{cases} \frac{C}{255 \times 12.92} & \text{if } \frac{C}{255} \le 0.04045 \\ \left(\frac{\frac{C}{255} + 0.055}{1.055}\right)^{2.4} & \text{otherwise} \end{cases}$$
$$\text{Contrast Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05} \quad (L_1 > L_2)$$
- Normal text threshold: $\ge 4.5:1$ (AA), $\ge 7.0:1$ (AAA)
- Large text threshold: $\ge 3.0:1$ (AA), $\ge 4.5:1$ (AAA)

### 2. Euclidean Spatial Drift
$$\text{Drift} = \sqrt{(\Delta x)^2 + (\Delta y)^2} \le 3.0\text{px}$$
Baseline alignment: $|\Delta y_{\text{baseline}}| \le 2.0\text{px}$.

### 3. Foreground Ink Metrics (Post-Background Subtraction)
$$\text{Ink IoU} = \frac{|\text{Ink}_{\text{ref}} \cap \text{Ink}_{\text{rendered}}|}{|\text{Ink}_{\text{ref}} \cup \text{Ink}_{\text{rendered}}|} \ge 85.0\%$$
$$\text{Ink Dice} = \frac{2 |\text{Ink}_{\text{ref}} \cap \text{Ink}_{\text{rendered}}|}{|\text{Ink}_{\text{ref}}| + |\text{Ink}_{\text{rendered}}|} \ge 85.0\%$$

### 4. Sol:OS 8-Bit Grayscale Calibration Scale
- `--os-0`: `#FFFFFF` (255)
- `--os-50`: `#F7F7F7` (247)
- `--os-100`: `#E2E0D8` (226) / `#DCD5C9` (215)
- `--os-150`: `#F5F5F5` (245)
- `--os-200`: `#CECECE` (206)
- `--os-300`: `#858585` (133)
- `--os-400`: `#535353` (83)
- `--os-800`: `#343434` (52)
- `--os-900`: `#1A1A1A` (26)
- `--os-1000`: `#000000` (0)

### 5. Daylight DC1 Hardware Geometry
- Panel: Sharp NT36523N Transflective LCD (60Hz–120Hz fluid refresh)
- Physical Resolution: $1200 \times 1600$ pixels ($270\text{dpi}$)
- Active Logical Viewport: $1184 \times 1584$ pixels ($592 \times 792\text{dp}$ at $2.0\text{x}$ density)
- Physical Inset: $+8\text{px}$ hardware coordinate offset (`PhysicalLeft = 8`, `PhysicalTop = 8`)
- Minimum Touch Target: $\ge 48\text{dp} \times 48\text{dp}$ ($\ge 96\text{px} \times 96\text{px}$)

---

## 6. Real-World Retrofit Scenarios (Tier 4)

Tier 4 tests the complete end-to-end retrofit lifecycle against the functional note-taking app fixture:
1. **Scenario 1 (S01: Notes List Screen)**: Empty state to populated note card list, preserving Room database observers and floating action button navigation.
2. **Scenario 2 (S02: Note Editor Drafting)**: Title and body drafting in Sol:OS typography (`ABC Arizona Flare` headline, `ABC Arizona Sans` body), hairline borders, and top bar back navigation.
3. **Scenario 3 (S03: Persistence & Invariant Preservation)**: Debounced autosave (300ms) committing to Room database, state restoration across configuration changes, and hardware back-stack popping.
4. **Scenario 4 (S04: Responsive Breakpoint & Rotation)**: Tablet rotation from portrait ($1184 \times 1584$) to landscape ($1584 \times 1184$), verifying two-pane / side-rail layout override while preserving active draft text.
5. **Scenario 5 (S05: Closed-Loop Defect Oracle & Repair)**: Simulating intentional parent padding drift, receiving structured causal defect tickets with exact element IDs, applying repair, and converging to 100% PASS.

---

## 7. Delivery & Verification Certification

To execute and verify the complete test suite:
```bash
node tests/e2e/run_all_v2.js
```
The suite certifies test readiness for the `ctc` v2 architecture and provides continuous validation for coding agents throughout all implementation milestones.
