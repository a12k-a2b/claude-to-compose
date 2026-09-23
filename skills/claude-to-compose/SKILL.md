---
name: claude-to-compose
description: Autonomous design retrofit compiler and verification harness for existing Jetpack Compose applications targeting Daylight Computer (DC1) LivePaper.
---

# Claude to Compose (`ctc`): Antigravity Retrofit & Verification Skill

The `claude-to-compose` (`ctc`) skill enables Antigravity agents to inspect existing functional Android applications, ingest approved Claude Design redesigns, synthesize native Jetpack Compose UI with Sol:OS 8-bit grayscale tokens, and execute an automated, fail-closed verification loop on Daylight Computer (DC1) LivePaper hardware.

---

## 1. Core Architecture & Operating Modes

`ctc` operates under two modes, with **Retrofit Mode** as the primary:
1. **Retrofit Mode (Primary)**: Takes an existing, functional Android application and an approved Claude Design specification, generates correspondence mappings, scaffolds an isolated descendant Git worktree, and restyles presentation composables while strictly preserving domain architecture, Room databases, ViewModel state flows, back navigation, and test tags.
2. **Greenfield Mode (Secondary)**: Synthesizes standalone Compose screens and M3 theme bundles when no pre-existing Android codebase exists.

### Slash Command Workflow: `/claude-to-compose`
When invoked via the `/claude-to-compose` slash command, Antigravity agents execute the autonomous compiler pipeline across three high-level phases:
- **Extraction**: Inspects existing Android application AST, captures design artifacts, and builds formal 4-layer design contracts.
- **Synthesis**: Restyles and synthesizes Jetpack Compose UI with Sol:OS 8-bit grayscale tokens, strictly confined to candidate worktree boundaries.
- **Verification**: Executes the progressive 6-stage verification gate on Daylight Computer (DC1) LivePaper hardware and runs the causal defect oracle for iterative remediation.

---

## 2. The 8-Stage Retrofit Workflow

Antigravity agents execute retrofits through an 8-stage sequence powered by the local `ctc` CLI (`bin/ctc.js`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        8-STAGE RETROFIT WORKFLOW                       │
└────────────────────────────────────────────────────────────────────────┘
  Stage 1: Preflight       node bin/ctc.js doctor --json
              │
              ▼
  Stage 2: Baseline        node bin/ctc.js init && node bin/ctc.js baseline <app-dir> --json
              │
              ▼
  Stage 3: Inspect App     node bin/ctc.js inspect-app <app-dir> --json
              │
              ▼
  Stage 4: Capture Design  node bin/ctc.js capture <design-dir> && ctc contract build <screen>
              │
              ▼
  Stage 5: Map & Plan      node bin/ctc.js map <contract> <app-dir> && ctc plan <map>
              │
              ▼
  Stage 6: Agent Worktree  node bin/ctc.js agent worktree --android <app> --branch <b> --output <wt>
              │
              ▼
  Stage 7: Verify Gate     node bin/ctc.js verify <screen> --candidate <wt> --json
              │
              ├───[PASS]───► Certify & Merge Worktree
              │
              ▼
  Stage 8: Causal Defects  node bin/ctc.js defects --report <report.json> --json
                           (Apply inverse geometric offsets & re-verify)
```

### Stage 1: Preflight (`ctc doctor`)
Validates local system prerequisites:
- Node.js >= 18.0.0
- Playwright browser binaries
- JDK 17 (Java Virtual Machine)
- Android SDK (`ANDROID_HOME`, `adb`)
- Connected Daylight Computer (DC1) tablet (`rooted 3` / `rooted 4`) with root access (`su 0`).
```bash
node bin/ctc.js doctor --json
```

### Stage 2: Workspace Init & Baseline (`ctc init`, `ctc baseline`)
Initializes the `.ctc/` workspace directory and records an immutable baseline snapshot of the unmodified Android project:
- Verifies Git working tree is clean.
- Executes `./gradlew compileDebugKotlin` and `./gradlew testDebugUnitTest`.
- Captures test results, commit hash, and build artifacts into `app-baseline.json`.
```bash
node bin/ctc.js init
node bin/ctc.js baseline ./fixtures/note-app --json
```

### Stage 3: Lexical App Inspection (`ctc inspect-app`)
Parses the target Android application AST:
- Discovers composable screens, navigation routes (`NoteAppDestination`), ViewModels (`NoteEditorViewModel`), actions (`NoteEditorAction`), Room DAOs (`NoteDao`), and UI test tags (`NoteAppTestTags`).
- Identifies behavior invariants: 500ms debounced autosave, Room persistence, and back navigation.
- Emits `existing-app-model.json`.
```bash
node bin/ctc.js inspect-app ./fixtures/note-app --json
```

### Stage 4: Design Contract Extraction (`ctc capture`, `ctc contract build`)
Extracts a 4-layer immutable design contract from the Claude Design artifact:
- **Layer 1 (Measured Scene)**: Absolute bounding boxes, paint order, baseline offsets, font resources.
- **Layer 2 (Inferred Layout Intent)**: Flex/Row/Column/Box topology, gaps, padding, and responsive breakpoints (1184 x 1584 portrait, 1584 x 1184 landscape).
- **Layer 3 (Behavior Contract)**: Gesture dynamics, focus transitions, loading/empty states.
- **Layer 4 (Design System)**: Sol:OS 8-bit neutral tokens (`--os-0` to `--os-1000`) and WCAG AAA contrast rules.
```bash
node bin/ctc.js capture ./fixtures/claude_design_bundle --screen note_editor --json
node bin/ctc.js contract build note_editor --json
```

### Stage 5: Correspondence Mapping & Migration Planning (`ctc map`, `ctc plan`)
Establishes 1:1 correspondences between Claude Design elements and existing Kotlin symbols:
- Maps design nodes to composable functions and UI state properties.
- Defines strict `allowedModificationPaths` (e.g. `app/src/main/java/com/claude/noteapp/ui/editor/**`).
- Designates `forbiddenPaths` (DAOs, Room database, ViewModels, navigation).
- Emits `correspondence.json` and `migration-plan.json`.
```bash
node bin/ctc.js map .ctc/designs/note_editor/contract/design-contract.json ./fixtures/note-app --screen note_editor --json
node bin/ctc.js plan .ctc/designs/note_editor/mapping/correspondence.json --screen note_editor --json
```

### Stage 6: Automated Worktree Scaffolding (`ctc agent worktree`)
Provisions an isolated Git worktree branched off the clean baseline commit and seeds coding agent contexts:
- Executes `git worktree add -b <branch> <output> HEAD`.
- Seeds `.ctc-workspace.json` marker.
- Generates `agent-packet.json` (Draft 2020-12) and `AGENT_PACKET.md` (< 300 lines) at candidate root.
- Scaffolds harness rules (`.cursorrules`, `.cursor/rules/ctc-retrofit.mdc`, `CLAUDE.md`, `.claude/skills/ctc/`).
```bash
node bin/ctc.js agent worktree \
  --android ./fixtures/note-app \
  --workspace . \
  --branch retrofit/note_editor \
  --output ./worktrees/candidate_note_editor \
  --screen note_editor \
  --json
```

### Stage 7: 6-Stage Progressive Verification (`ctc verify`)
Executes the fail-closed verification pipeline on the candidate worktree:
1. **Stage 1: Schema & Worktree Provenance**: Verifies descendant worktree ancestry, clean baseline, symlink audit, and strict `allowedPaths` confinement.
2. **Stage 2: Android Compilation & Contrast**: Executes `./gradlew compileDebugKotlin` and evaluates Sol:OS 8-bit grayscale contrast (WCAG AAA >= 7.0:1 for normal text).
3. **Stage 3: Layout Telemetry & Touch Geometry**: Asserts all 11 `NoteAppTestTags` exist and validates >= 48dp invisible hit-slop.
4. **Stage 4: Perceptual Metrics & Invariants**: Evaluates Sobel edge contour alignment (>= 85%), MSSIM (>= 0.72), Ink Dice (>= 0.85), spatial drift (<= 3.0px), and verifies Room autosave unit tests pass.
5. **Stage 5: Behavioral Scenario Replay**: Replays interaction states and portrait/landscape rotations.
6. **Stage 6: DC1 Hardware Qualification**: Deploys APK to connected DC1 tablet and verifies zero EPD waveform flashes.
```bash
node bin/ctc.js verify note_editor --app-dir ./fixtures/note-app --candidate ./worktrees/candidate_note_editor --json
```

### Stage 8: Causal Defect Diagnosis (`ctc defects`)
When verification fails (Exit Code 1), the Defect Oracle attributes discrepancies to root causes:
- Attributes errors to stable element IDs (e.g., `daylight#note_editor/title_input`).
- Diagnoses root causes (`PARENT_INSET_ACCUMULATION`, `THEME_TOKEN_MISREFERENCE`, `TOUCH_TARGET_TOO_SMALL`).
- Emits actionable AST directives and inverse offset/padding adjustments.
```bash
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
```

---

## 3. Daylight Computer (DC1) LivePaper Hardware Profile

### 3.1 Display Architecture (LivePaper)
- **Technology**: Custom **Reflective LCD / Transflective LCD** (LivePaper).
- **Refresh Rate**: Native **60Hz to 120Hz** (silky smooth, full fluid framerate).
- **Color Depth**: **8-bit Grayscale (256 discrete levels of gray)**, monochrome.
- **Physical Characteristics**: Reflects ambient light (sunlight readable, zero blue light), illuminated by pure amber frontlight.
- **Display Pipeline**: Driven by standard Android `SurfaceFlinger`, `Choreographer`, `VSYNC`, Skia/HWUI rendering with GPU double/triple buffering.

### 3.2 ZERO EPD / E-Ink Workarounds — STRICT PROHIBITIONS
You must NEVER treat, describe, or program for the DC1 as an Electronic Paper Display (EPD) or E-Ink panel.
- **NO Waveforms or Particle Refreshes**: There are NO microcapsules or electrophoretic particles.
- **NO Ghosting / Artifacting**: The panel has zero physical ghosting.
- **NEVER use E-ink Screen Flash Hooks**: Never broadcast `ACTION_REFRESH_SCREEN`, never trigger waveform clear flashes, and never introduce artificial pauses or delays on modal dismissal.

### 3.3 Official Daylight Sol:OS Grayscale Scale
Always use the pre-calibrated Sol:OS neutral scale from `tokens/colors.css`:
- `--os-0`: `#FFFFFF` (Base paper / ground)
- `--os-50`: `#F7F7F7` (Surface panels / cards)
- `--os-100`: `rgba(0,0,0,0.08)` / `#DCD5C9` (Hairline borders, 1dp)
- `--os-150`: `#F5F5F5` (Recessed canvas / input fields)
- `--os-200`: `#CCCCCC` (Disabled controls / inactive chips)
- `--os-300`: `#858585` (Low emphasis / tertiary text)
- `--os-400`: `#535353` (Secondary text ink / icons)
- `--os-800`: `#343434` (Dark fields / pressed states)
- `--os-900`: `#1A1A1A` (Primary text ink / headlines)
- `--os-1000`: `#000000` (Max black ink / focus rings)
- **Calibrated Brand Grays**: Yellow -> `#CECECE`, Amber -> `#9D9D9E`, Orange -> `#6C6C6D`.

### 3.4 Kinematics & Touch Modeling
- **Hardware Coordinate Inset**: Active display incorporates a **+8px hardware coordinate inset**. Touch coordinates must account for this boundary.
- **Capacitive Touch Modeling**: Linux Multi-Touch Protocol B (`/dev/input/event2`). Uses Minimum Jerk velocity profiles, contact ellipse deformation, and Fitts's Law duration.
- **Stylus Digitizer**: Wacom I2C Digitizer (`/dev/input/event4`) supporting 4096 pressure levels and tilt ([-9000, 9000]).
- **Latency Standards**: Sub-frame (<16ms) response for physical keyboard events (`<Esc>`, `<Enter>`, `<1>`, `<2>`). Fluid 60fps/120fps animations.
- **Touch Target Compliance**: >= 48dp x 48dp touch targets implemented via invisible hit-slop (`Modifier.minimumInteractiveComponentSize()`), never inflating visual container bounds.

### 3.5 Connected Hardware & Device Concurrency
- **`rooted 3`**: Serial `JMBR00380` (Model: DC_1, Product: vext_jagar, Rooted via `su 0`)
- **`rooted 4`**: Serial `JMBR00405` (Model: DC_1, Product: vext_jagar, Rooted via `su 0`)
- **Concurrency Etiquette**: When multiple agents or threads are running, check status via `daylight_fleet_status`. If one tablet is leased or busy, target the other device. Never issue conflicting input streams or reboot a device in active use.

---

## 4. Antigravity Tool Patterns & MCP Integrations

### 4.1 Shell Command Execution Patterns (`run_command`)
Execute all `ctc` CLI commands with the `--json` flag to enable deterministic output parsing:
```bash
node bin/ctc.js doctor --json
node bin/ctc.js baseline ./fixtures/note-app --json
node bin/ctc.js inspect-app ./fixtures/note-app --json
node bin/ctc.js verify note_editor --app-dir ./fixtures/note-app --candidate ./worktrees/candidate_note_editor --json
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
```

### 4.2 Standard Exit Code Protocol
| Exit Code | Status | Meaning | Agent Action |
|---|---|---|---|
| `0` | `PASS` | All stages passed cleanly | Proceed to merge / certification |
| `1` | `FAIL` | Verification failure / regression | Invoke `ctc defects` and apply inverse remediation |
| `2` | `BLOCKED` | Missing baseline, unapproved deviation | Halt and report blocker; request human approval |
| `3` | `INPUT_INVALID` | Argument error, path traversal, boundary breach | Fix arguments or confine edits to `allowedPaths` |
| `4` | `INFRASTRUCTURE_ERROR` | Missing binary, device disconnect | Reconnect device or check toolchain |

### 4.3 Daylight QA MCP Tool Integrations
- `daylight_fleet_status`: Query connected DC1 tablets and check exclusive concurrency leases.
- `daylight_touch_tap`: Biomechanically modeled touch tap with +8px inset compensation.
- `daylight_touch_swipe`: Ergonomic thumb arc swipe following CMC joint pivot kinematics.
- `daylight_micro_scroll`: Human reading scroll dynamics with perpendicular Gaussian micro-tremor.
- `daylight_wacom_stroke`: High-precision stylus stroke (4096 pressure levels, tilt X/Y).
- `daylight_capture_screen`: Capture LivePaper frame and evaluate 8-bit contrast and Sol:OS tokens.
- `daylight_query_ui`: Inspect Android UI Automator accessibility tree for test tags and click centers.
- `daylight_closed_loop_step`: Atomic Action -> Settle (150ms) -> Screencap & Hierarchy -> Evaluate cycle.

---

## 5. Anti-Patterns & Prohibitions
1. **NO Greenfield Overwriting in Retrofit Mode**: Never overwrite existing app modules with disconnected demo scaffolds.
2. **NO Modifying Domain or Storage Architecture**: Never alter Room DAOs, database schemas, ViewModel state flows, or event contracts.
3. **NO EPD Flash Hooks or Waveform Delays**: Never use `ACTION_REFRESH_SCREEN` or artificial pauses.
4. **NO Raw Hex Colors**: Never embed arbitrary hex codes; use pre-calibrated Sol:OS neutral tokens (`--os-0` to `--os-1000`).
5. **NO Sub-48dp Touch Targets**: Never render interactive controls without >= 48dp hit-slop.
6. **NO Mutating Verification Tolerances**: Never tamper with golden references or failure budgets to force green.
