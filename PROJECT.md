# Project: Claude to Compose (`ctc`) v2 Existing App Design-Retrofit Compiler

## Architecture
A local design-retrofit compiler and closed-loop verification system for coding agents that maps approved Claude Design redesigns to existing functional Android Jetpack Compose applications while preserving business behavior, navigation, data persistence, and accessibility, executing an automated fail-closed verification loop on native Compose layouts and Daylight Computer (DC1) LivePaper hardware.

### Subsystem Boundaries
1. **Core CLI & Workspace Manager (`bin/ctc.js`, `src/cli/`, `src/config/`)**:
   Unified entrypoint for all 13 subcommands, managing the `.ctc/` project layout, hardware profiles, and execution receipts.
2. **Existing App Analyzer & Baseline Harness (`src/analyzer/`, `src/baseline/`)**:
   Syntax-aware Kotlin/Compose AST parser indexing screens, routes, ViewModels/state holders, action/event lambdas, repositories, and UI test tags; establishes pre-retrofit baseline health (`app-baseline.json`, `existing-app-model.json`, `behavior-invariants.json`).
3. **Evidence-Preserving Design Contract Engine (`src/contract/`, `src/extractor/`)**:
   Immutable 4-layer intermediate representation (IR):
   - Layer 1: Measured Scene (`measured-scenes.json`)
   - Layer 2: Inferred Layout Intent (`layout-intent.json`)
   - Layer 3: Behavior Contract (`behavior-contract.json`)
   - Layer 4: Design-System Contract (`design-system.json`)
4. **App Correspondence Engine & Agent Packet Generator (`src/mapping/`, `src/agent/`)**:
   1:1 semantic and structural correspondence mapper (`CorrespondenceMap`), migration planner (`MigrationPlan`), and scoped agent implementation packet generator (`implementation-packet.md`, `implementation-packet.json`).
5. **Progressive Verification Engine & Causal Defect Oracle (`src/verification/`, `src/defects/`)**:
   6-stage progressive fail-closed verification pipeline (Schema -> Build/Behavior Tests -> Native Layout Telemetry -> Perceptual Metrics -> Scenario Replay -> Physical DC1 Qualification), causal defect attribution to stable `sourceId`s, and deterministic negative controls (NC-01 to NC-06).
6. **Daylight DC1 LivePaper Hardware Profile & Qualification Runner (`src/profiles/`, `src/hardware/`)**:
   Transflective LCD 60-120Hz display profile, Sol:OS 8-bit neutral tokens (`--os-0` to `--os-1000`), zero EPD waveforms/flashes enforcement, and live DC1 tablet interaction runner via MCP daylight-qa.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Functional Pilot Android App Fixture | Multi-screen Kotlin/Compose Note-Taking app with Room DB, ViewModels, navigation, and behavior tests | M1 | PROJECT_PLAN §9 |
| 2 | Kotlin/Compose Syntax-Aware AST Parser | Index composables, routes, ViewModels, StateFlow, events, repositories, test tags | M1 | ORIGINAL_REQUEST R1 |
| 3 | Pre-Retrofit Baseline Capture (`ctc baseline`) | Capture compilation status, unit/behavior test results, preview hashes into `app-baseline.json` | M1 | ORIGINAL_REQUEST R1 |
| 4 | Existing App Model Indexer (`ctc inspect-app`) | Extract structural model into `existing-app-model.json` and behavior invariants manifest | M1 | ORIGINAL_REQUEST R1 |
| 5 | Fail-Closed Baseline Gate | Distinguish pre-existing app failures from retrofit regressions (`BLOCKED` on broken baseline) | M1 | ORIGINAL_REQUEST R1 |
| 6 | Layer 1 Measured Scene IR (`measured-scenes.json`) | Physical bounds, paint bounds, z-order, clip/transform chain, text runs, baselines, line breaks, asset/font identities | M2 | ORIGINAL_REQUEST R2 |
| 7 | Layer 2 Inferred Layout Intent IR (`layout-intent.json`) | Constraint sizing, topology, padding, margins, DC1 portrait (1184x1584) & landscape (1584x1184) breakpoints | M2 | ORIGINAL_REQUEST R2 |
| 8 | Layer 3 Behavior Contract IR (`behavior-contract.json`) | State transitions ($t_0 \to t_1 \to t_2$), gestures, key events, navigation, animations, loading/empty/error states | M2 | ORIGINAL_REQUEST R2 |
| 9 | Layer 4 Design System Contract IR (`design-system.json`) | Sol:OS 8-bit neutral tokens (`--os-0` to `--os-1000`), typography metrics, LivePaper contrast rules | M2 | ORIGINAL_REQUEST R2 |
| 10 | Immutable Evidence Bundle Capture (`ctc capture`) | Playwright extraction of settled DOM, fonts, SVG vectors, screenshots, and provenance | M2 | ORIGINAL_REQUEST R2 |
| 11 | Design Contract Compiler (`ctc contract build`) | Synthesizes 4-layer IR from evidence bundle and outputs validated JSON schemas | M2 | ORIGINAL_REQUEST R2 |
| 12 | Semantic & Structural Correspondence Mapper (`ctc map`) | 1:1 mapping between design nodes and Kotlin composables/state/actions with confidence scoring | M3 | ORIGINAL_REQUEST R3 |
| 13 | Migration Planner (`ctc plan`) | Generates phased migration sequence with scoped allowed and forbidden modification boundaries | M3 | ORIGINAL_REQUEST R3 |
| 14 | Agent Implementation Packet Generator (`ctc agent packet`) | Emits Markdown and JSON implementation packets with failure budgets and preservation rules | M3 | ORIGINAL_REQUEST R3 |
| 15 | Progressive Verification Pipeline (`ctc verify`) | 6-stage progressive verification (Schema, Compile, Telemetry, Perceptual, Scenario, Hardware) | M4 | ORIGINAL_REQUEST R4 |
| 16 | Causal Defect Oracle (`ctc defects`) | Attribute failures directly to stable element IDs with root-cause diagnosis and fail-closed quality gate | M4 | ORIGINAL_REQUEST R4 |
| 17 | Deterministic Negative Controls (NC-01 to NC-06) | Verify deterministic FAIL/BLOCKED on missing elements, margin shifts >= 10px, omitted assets, missing evidence | M4 | ORIGINAL_REQUEST R4 |
| 18 | Unified Local CLI (`bin/ctc.js`) | 13 subcommands (`doctor`, `init`, `baseline`, `inspect-app`, `capture`, `contract`, `map`, `plan`, `agent`, `verify`, `defects`, `report`, `package`) | M5 | ORIGINAL_REQUEST R5 |
| 19 | Versioned Daylight DC1 Profile | 60Hz-120Hz fluid pipeline, zero EPD waveforms, WCAG AAA 8-bit grayscale contrast verification | M5 | ORIGINAL_REQUEST R5 |
| 20 | `.ctc/` Project Layout & Configuration Manager | Manage project configuration, active profiles, evidence bundles, contracts, runs | M5 | ORIGINAL_REQUEST R5 |
| 21 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box test suite covering all features, boundaries, combinations, and workflows | E2E-Track | Dual Track Architecture |
| 22 | Physical DC1 LiveApp Deployment & Touch Qualification | Automated installation, capacitive touch navigation, zero EPD waveforms on live tablet hardware | M6 | ORIGINAL_REQUEST Acceptance |
| 23 | Regression Protection for Existing 284 Core Tests | Ensure existing 284 core tests and 48 verification tests continue to pass 100% green | M6 | ORIGINAL_REQUEST Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Opaque-box test harness, runner, and test cases covering Tiers 1-4 & negative controls; outputs `TEST_READY.md` | none | DONE |
| M1 | Existing App Analyzer & Baseline Harness | Functional note-taking app fixture, syntax-aware Kotlin/Compose parser, `ctc baseline`, `ctc inspect-app` | none | DONE |
| M2 | Design Contract & Multi-Layer IR | Capture engine, 4-layer immutable contract (measured, intent, behavior, design system), `ctc contract build` | none | DONE |
| M3 | Correspondence Engine & Agent Packet | Semantic mapping (`ctc map`), migration planning (`ctc plan`), scoped agent packet generator (`ctc agent packet`) | M1, M2 | DONE |
| M4 | Verification Engine & Defect Oracle | 6-stage verification (`ctc verify`), causal defect oracle (`ctc defects`), negative controls harness (NC-01..06) | M2, M3 | DONE |
| M5 | Unified Local CLI & DC1 Profile | Complete `bin/ctc.js` with 13 commands, `.ctc/` layout manager, versioned DC1 profile & doctor | M1, M2, M3, M4 | DONE |
| M6 | Final Integration, 100% E2E Pass & DC1 Qualification | Phase 1 (Pass 100% E2E Tiers 1-4), Phase 2 (Tier 5 Adversarial Hardening), live DC1 qualification, zero regression across 284 tests | E2E, M5 | DONE |

---

## Interface Contracts

### Module Boundaries
- `src/analyzer/` ↔ `src/baseline/`:
  - `parseAndroidProject(projectPath, moduleName)` -> `ExistingAppModel`
  - `captureBaseline(projectPath, variant)` -> `AppBaseline`
- `src/contract/` ↔ `src/mapping/`:
  - `buildDesignContract(screenId, evidenceDir)` -> `{ measuredScenes, layoutIntent, behaviorContract, designSystem }`
- `src/mapping/` ↔ `src/agent/`:
  - `generateCorrespondenceMap(appModel, designContract)` -> `CorrespondenceMap`
  - `generateImplementationPacket(correspondenceMap, migrationPlan, designContract)` -> `{ packetMarkdown, packetJson }`
- `src/verification/` ↔ `src/defects/`:
  - `runVerificationPipeline(screenId, targetAppPath, profile)` -> `VerificationResult`
  - `diagnoseDefects(verificationResult)` -> `DefectReport`
- `bin/ctc.js` ↔ All Subsystems:
  - Dispatches CLI flags to subsystem handlers, emitting standard JSON schema:
    `{ success: boolean, status: "PASS" | "FAIL" | "BLOCKED" | "ERROR", data: any, defects: Defect[], exitCode: number }`

### Code Layout
```text
bin/
  ctc.js                         # Unified executable CLI entrypoint
src/
  cli/                           # Subcommand implementations (doctor, init, baseline, etc.)
  analyzer/                      # Kotlin/Compose syntax-aware AST parsing & symbol indexing
  baseline/                      # Baseline capture & invariant recording
  contract/                      # 4-layer IR schemas & contract synthesis
  mapping/                       # Correspondence engine & migration planner
  agent/                         # Agent implementation packet generator (MD & JSON)
  verification/                  # Progressive 6-stage verification engine
  defects/                       # Causal defect oracle & root-cause attribution
  profiles/                      # Hardware profile specifications (daylight-dc1.json, etc.)
  hardware/                      # DC1 tablet runner & MCP daylight-qa integration
fixtures/
  note-app/                      # Functional Android Compose note-taking pilot app
tests/
  e2e/                           # E2E test suite (Tiers 1-4, negative controls)
  unit/                          # Unit tests for each subsystem
.ctc/                            # Standard local workspace layout
```
