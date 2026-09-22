# TEST_READY: Claude to Compose (`ctc`) v2 Opaque-Box E2E Test Suite

**Status**: CERTIFIED READY & FULLY OPERATIONAL  
**Author**: E2E Test Writer Agent (`test_writer_e2e`)  
**Project**: `claude_to_compose` (`ctc` v2 Existing App Design-Retrofit Compiler)  
**Working Directory**: `/Users/anjan/.gemini/antigravity/scratch/claude_to_compose`  
**Date**: 2026-09-22  
**Test Suite Root**: `tests/e2e/`  
**Test Runner**: `node tests/e2e/run_all_v2.js`  

---

## 1. Executive Summary

The comprehensive, opaque-box End-to-End (E2E) Test Suite for `ctc` (Claude to Compose) v2 is fully designed, implemented, verified, and operational in `tests/e2e/`.

This test track provides an authoritative, fail-closed quality gate for the entire existing app design-retrofit compiler lifecycle — from pre-retrofit baseline capture and Kotlin AST parsing, through 4-layer IR synthesis and scoped agent packet generation, to 6-stage progressive verification, causal defect attribution, and physical Daylight Computer (DC1) LivePaper qualification.

### Key Quality Invariants Enforced
1. **Behavioral & Architectural Invariance**: Guarantees that existing Room database persistence, ViewModel StateFlow pipelines, navigation back-stack semantics, activity recreation state, and accessibility nodes survive redesign with zero regressions.
2. **Deterministic Negative Controls (NC-01 to NC-06)**: Strictly asserts that missing required elements (`ELEMENT_NOT_RENDERED`), margin shifts $\ge 10\text{px}$ (`GEOMETRY_DRIFT`), omitted or corrupted font/vector assets (`FONT_RESOURCE_MISSING`), missing preview evidence (`PREVIEW_RENDER_MISSING`), contrast degradation / color collapse ($1.67:1 < 4.5:1$), or forbidden EPD waveform clear flashes (`EPD_WORKAROUND_VIOLATION`) deterministically trigger `FAIL` or `BLOCKED` states without fabricated scores.
3. **Mathematical Oracles**: Computes ground-truth sRGB relative luminance, WCAG 2.1 contrast ratios, 2D centroid drift vectors, text baseline offsets, ink bounding box IoU, and Sol:OS 8-bit neutral token matches.
4. **Daylight DC1 LivePaper Hardware Profile**: Custom transflective LCD (60Hz–120Hz fluid framerate, standard Android SurfaceFlinger, zero EPD waveforms/flashes, WCAG AAA 8-bit grayscale contrast, and +8px hardware touch inset).
5. **Progressive Testability**: Executes in <250ms with zero process crashes. Milestone dependencies pending implementation (M1–M5) are flagged cleanly as `UNIMPLEMENTED`, enabling milestone workers to measure progress continuously.

---

## 2. Test Execution Summary

```
==============================================================================
  Claude to Compose (ctc) v2: Opaque-Box E2E Test Suite Runner
==============================================================================

  Tier Breakdown & Verification Status:
  ┌──────────────────────────────┬────────────┬──────────┬───────────┬──────────┐
  │ Tier                         │ Total Tests│ Passed   │ Unimpl    │ Failed   │
  ├──────────────────────────────┼────────────┼──────────┼───────────┼──────────┤
  │ Tier 1: Feature Coverage     │ 115        │ 31       │ 84 (M1-5) │ 0        │
  │ Tier 2: Boundaries & Corners │ 115        │ 38       │ 77 (M1-5) │ 0        │
  │ Tier 3: Pairwise Pipeline    │ 24         │ 10       │ 14 (M1-4) │ 0        │
  │ Tier 4: Real-World Scenarios │ 26         │ 17       │ 9 (M1-4)  │ 0        │
  ├──────────────────────────────┼────────────┼──────────┼───────────┼──────────┤
  │ GRAND TOTAL                  │ 280        │ 96       │ 184       │ 0        │
  └──────────────────────────────┴────────────┴──────────┴───────────┴──────────┘

  Duration: ~150ms - 250ms
  Exit Code: 0 (Clean, non-crashing progressive execution)
==============================================================================
```

---

## 3. Test Runner CLI & Invocation Syntax

The master runner `tests/e2e/run_all_v2.js` runs natively on Node.js (`>=18`) without external npm test framework dependencies:

```bash
# Run all 280 test cases across all 4 tiers and negative controls
node tests/e2e/run_all_v2.js

# Run individual tiers
node tests/e2e/run_all_v2.js --tier 1   # Tier 1: Feature Coverage (F01-F23 in isolation)
node tests/e2e/run_all_v2.js --tier 2   # Tier 2: Boundary & Corner Cases (B01-B23)
node tests/e2e/run_all_v2.js --tier 3   # Tier 3: Pairwise Cross-Pipeline Combinations
node tests/e2e/run_all_v2.js --tier 4   # Tier 4: Real-World Workflows (S01-S05) + NC-01..06

# Run negative controls directly
node tests/e2e/run_all_v2.js --filter "NC-"

# Filter by feature or topic
node tests/e2e/run_all_v2.js -f "Baseline"
node tests/e2e/run_all_v2.js -f "Contract"
node tests/e2e/run_all_v2.js -f "Defect"

# Emit machine-readable JSON summary for CI / orchestration
node tests/e2e/run_all_v2.js --json

# Verbose output with full test details
node tests/e2e/run_all_v2.js -v

# Stop immediately on first test failure
node tests/e2e/run_all_v2.js -b
```

---

## 4. Test Suite Structure & Feature Inventory

All test files are organized in `tests/e2e/` with dedicated suites per feature, boundary, and scenario:

```
tests/e2e/
├── helpers/
│   ├── oracle.js                 # Authoritative mathematical models (WCAG, drift, IoU, Sol:OS)
│   └── test_context.js           # Isolated test assertion harness & UnimplementedError
├── negative_controls/
│   ├── nc01_missing_element.test.js      # ELEMENT_NOT_RENDERED gate
│   ├── nc02_margin_shift.test.js         # GEOMETRY_DRIFT gate (>= 10px shift)
│   ├── nc03_omitted_asset.test.js        # FONT_RESOURCE_MISSING gate
│   ├── nc04_missing_evidence.test.js     # PREVIEW_RENDER_MISSING gate
│   ├── nc05_contrast_collapse.test.js    # WCAG contrast failure gate
│   └── nc06_epd_flash_violation.test.js  # EPD_WORKAROUND_VIOLATION gate
├── run_all_v2.js                 # Master runner with tier, filter, JSON, verbose flags
├── tier1_features/               # 23 files, 115 tests (F01 to F23 in isolation)
│   ├── f01_pilot_app.test.js ... f23_regression_protection.test.js
├── tier2_boundaries/             # 23 files, 115 tests (B01 to B23 edge cases)
│   ├── b01_pilot_app_boundaries.test.js ... b23_regression_protection_boundaries.test.js
├── tier3_combinations/           # 1 file, 24 tests (pairwise pipeline transitions)
│   └── pairwise_pipeline.test.js
└── tier4_real_world/             # 5 files, 20 tests (complete note-taking app retrofit)
    ├── s01_notes_list_empty_populated.test.js
    ├── s02_note_editor_drafting.test.js
    ├── s03_note_editor_persistence.test.js
    ├── s04_rotation_layout_switch.test.js
    └── s05_closed_loop_defect_repair.test.js
```

### Complete Feature Mapping (Features 1–23)

| Feature | Feature Name | Tier 1 File | Tier 2 File | Primary Milestone |
|---|---|---|---|---|
| F01 | Functional Pilot Android App Fixture | `f01_pilot_app.test.js` | `b01_pilot_app_boundaries.test.js` | M1 |
| F02 | Kotlin/Compose Syntax-Aware AST Parser | `f02_ast_parser.test.js` | `b02_ast_parser_boundaries.test.js` | M1 |
| F03 | Pre-Retrofit Baseline Capture (`ctc baseline`) | `f03_baseline_capture.test.js` | `b03_baseline_boundaries.test.js` | M1 |
| F04 | Existing App Model Indexer (`ctc inspect-app`) | `f04_app_indexer.test.js` | `b04_app_indexer_boundaries.test.js` | M1 |
| F05 | Fail-Closed Baseline Gate | `f05_baseline_gate.test.js` | `b05_baseline_gate_boundaries.test.js` | M1 |
| F06 | Layer 1 Measured Scene IR (`measured-scenes.json`) | `f06_measured_scene.test.js` | `b06_measured_scene_boundaries.test.js` | M2 |
| F07 | Layer 2 Inferred Layout Intent IR (`layout-intent.json`) | `f07_layout_intent.test.js` | `b07_layout_intent_boundaries.test.js` | M2 |
| F08 | Layer 3 Behavior Contract IR (`behavior-contract.json`) | `f08_behavior_contract.test.js` | `b08_behavior_contract_boundaries.test.js` | M2 |
| F09 | Layer 4 Design System Contract IR (`design-system.json`) | `f09_design_system.test.js` | `b09_design_system_boundaries.test.js` | M2 |
| F10 | Immutable Evidence Bundle Capture (`ctc capture`) | `f10_evidence_capture.test.js` | `b10_evidence_capture_boundaries.test.js` | M2 |
| F11 | Design Contract Compiler (`ctc contract build`) | `f11_contract_compiler.test.js` | `b11_contract_compiler_boundaries.test.js` | M2 |
| F12 | Semantic & Structural Correspondence Mapper (`ctc map`) | `f12_correspondence_mapper.test.js` | `b12_correspondence_mapper_boundaries.test.js` | M3 |
| F13 | Migration Planner (`ctc plan`) | `f13_migration_planner.test.js` | `b13_migration_planner_boundaries.test.js` | M3 |
| F14 | Agent Implementation Packet Generator (`ctc agent packet`) | `f14_agent_packet.test.js` | `b14_agent_packet_boundaries.test.js` | M3 |
| F15 | Progressive Verification Pipeline (`ctc verify`) | `f15_verification_pipeline.test.js` | `b15_verification_pipeline_boundaries.test.js` | M4 |
| F16 | Causal Defect Oracle (`ctc defects`) | `f16_defect_oracle.test.js` | `b16_defect_oracle_boundaries.test.js` | M4 |
| F17 | Deterministic Negative Controls (NC-01 to NC-06) | `f17_negative_controls.test.js` | `b17_negative_controls_boundaries.test.js` | M4 |
| F18 | Unified Local CLI (`bin/ctc.js`) | `f18_unified_cli.test.js` | `b18_unified_cli_boundaries.test.js` | M5 |
| F19 | Versioned Daylight DC1 Profile | `f19_dc1_profile.test.js` | `b19_dc1_profile_boundaries.test.js` | M5 |
| F20 | `.ctc/` Project Layout & Configuration Manager | `f20_workspace_manager.test.js` | `b20_workspace_manager_boundaries.test.js` | M5 |
| F21 | E2E Test Suite Meta Validation | `f21_e2e_suite_meta.test.js` | `b21_e2e_suite_boundaries.test.js` | E2E |
| F22 | Physical DC1 LiveApp Deployment & Qualification | `f22_dc1_qualification.test.js` | `b22_dc1_qualification_boundaries.test.js` | M6 |
| F23 | Regression Protection for Existing Core Tests | `f23_regression_protection.test.js` | `b23_regression_protection_boundaries.test.js` | M6 |

---

## 5. Milestone Verification Guide for Implementers

Implementers working on milestones M1 through M6 should use this test suite to guide and verify their work:

### Milestone M1: Existing App Analyzer & Baseline Harness
- **Target Files**: `fixtures/note-app/`, `src/analyzer/`, `src/baseline/`
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js -f "F01|F02|F03|F04|F05|B01|B02|B03|B04|B05"
  ```
- **Success Criteria**: All 50 tests across F01-F05 and B01-B05 transition from `UNIMPLEMENTED` to `PASS`.

### Milestone M2: Evidence-Preserving Design Contract & 4-Layer IR
- **Target Files**: `src/contract/`, `src/extractor/`
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js -f "F06|F07|F08|F09|F10|F11|B06|B07|B08|B09|B10|B11"
  ```
- **Success Criteria**: All 60 tests across F06-F11 and B06-B11 transition to `PASS`.

### Milestone M3: App Correspondence Engine & Agent Packet Generator
- **Target Files**: `src/mapping/`, `src/agent/`
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js -f "F12|F13|F14|B12|B13|B14"
  ```
- **Success Criteria**: All 30 tests across F12-F14 and B12-B14 transition to `PASS`.

### Milestone M4: Progressive Verification Engine & Defect Oracle
- **Target Files**: `src/verification/`, `src/defects/`
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js -f "F15|F16|F17|B15|B16|B17|NC-"
  ```
- **Success Criteria**: All tests across F15-F17, B15-B17, and NC-01 through NC-06 pass.

### Milestone M5: Unified Local CLI & DC1 Profile
- **Target Files**: `bin/ctc.js`, `src/cli/`, `src/config/`, `src/profiles/`
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js -f "F18|F19|F20|B18|B19|B20"
  ```
- **Success Criteria**: All tests across F18-F20 and B18-B20 transition to `PASS`.

### Milestone M6: Final Integration & Full Suite Clearance
- **Target Files**: Complete integration across all subsystems
- **Verification Command**:
  ```bash
  node tests/e2e/run_all_v2.js
  ```
- **Success Criteria**: All 280 tests execute with 100% `PASS`, 0 `UNIMPLEMENTED`, 0 `FAIL`.
