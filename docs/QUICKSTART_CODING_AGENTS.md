# Quickstart Guide: Coding Agents & Android Design Retrofits

This guide walks engineers and autonomous coding agents through executing end-to-end design retrofits on existing Android Jetpack Compose applications using the Claude to Compose (`ctc`) local compiler system, targeting the **Daylight Computer (DC1)** LivePaper display.

Whether you are working interactively in **Cursor**, running the **Claude Code** CLI, driving headless workflows with **OpenAI / Codex** models, or orchestrating multi-agent pipelines with **Google Antigravity**, this document provides reproducible instructions, failure prevention guardrails, and concrete examples using `fixtures/note-app`.

---

## Table of Contents
1. [Core Philosophy & Operating Principles](#1-core-philosophy--operating-principles)
2. [Prerequisites & System Doctor Check](#2-prerequisites--system-doctor-check)
3. [The 8-Phase Retrofit Lifecycle](#3-the-8-phase-retrofit-lifecycle)
   - [Phase 1: Setup & Doctor Preflight](#phase-1-setup--doctor-preflight)
   - [Phase 2: Baseline Capture & App Inspection](#phase-2-baseline-capture--app-inspection)
   - [Phase 3: Automated Worktree Scaffolding (`ctc agent worktree`)](#phase-3-automated-worktree-scaffolding)
   - [Phase 4: Harness Binding (`ctc agent harness`)](#phase-4-harness-binding)
   - [Phase 5: Boundary-Confined Implementation](#phase-5-boundary-confined-implementation)
   - [Phase 6: Candidate Verification & Causal Remediation](#phase-6-candidate-verification--causal-remediation)
   - [Phase 7: Intentional Deviations & Owner Approvals](#phase-7-intentional-deviations--owner-approvals)
   - [Phase 8: Final Merge & DC1 Qualification](#phase-8-final-merge--dc1-qualification)
4. [Environment-Specific Agent Walk-Throughs](#4-environment-specific-agent-walk-throughs)
   - [Cursor IDE](#cursor-ide)
   - [Claude Code CLI](#claude-code-cli)
   - [OpenAI / Codex Models](#openai--codex-models)
   - [Google Antigravity](#google-antigravity)
5. [Concrete Walk-Through: `fixtures/note-app`](#5-concrete-walk-through-fixturesnote-app)
6. [Troubleshooting Guide for Common Failure Modes](#6-troubleshooting-guide-for-common-failure-modes)
7. [Command Reference & Exit Code Matrix](#7-command-reference--exit-code-matrix)

---

## 1. Core Philosophy & Operating Principles

The `ctc` design-retrofit system transforms existing, functional Android codebases without breaking what already works. Unlike greenfield code generation, retrofitting operates under strict contracts:

1. **Candidate Worktree Confinement**: Coding agents NEVER touch the pristine baseline repository. Work occurs inside an isolated Git worktree branched off the clean baseline commit.
2. **Fail-Closed Verification**: Any unmapped component, boundary breach, missing test tag, or unapproved behavioral change deterministically halts execution with non-zero exit codes.
3. **Domain Logic Invariance**: Room SQLite persistence, ViewModel state flows, coroutine debounce timings (e.g. 500ms autosave), back-stack navigation, and UI test tags must remain 100% intact.
4. **Daylight DC1 LivePaper Hardware Rules**:
   - **Display Architecture**: Custom transflective/reflective LCD (LivePaper) with 60Hz–120Hz native fluid refresh rate and 8-bit grayscale (256 discrete gray levels).
   - **STRICT ZERO EPD WORKAROUNDS**: The DC1 has NO electrophoretic particles, NO microcapsules, and ZERO ghosting. NEVER broadcast `ACTION_REFRESH_SCREEN`, never trigger waveform clear flashes, and never introduce artificial delays on modal dismissal.
   - **Pre-Calibrated Sol:OS Tokens**: Always use official Sol:OS neutral tokens (`--os-0` to `--os-1000`) from `tokens/colors.css`.
   - **Touch Targets**: Minimum 48dp x 48dp touch targets implemented via invisible hit-slop (`Modifier.minimumInteractiveComponentSize()`), never inflating visual container bounds.

---

## 2. Prerequisites & System Doctor Check

Before starting, verify your environment satisfies the toolchain requirements:

- **Node.js**: >= 18.0.0
- **JDK**: Java 17 (Java Virtual Machine for Android Gradle builds)
- **Android SDK**: `ANDROID_HOME` or `ANDROID_SDK_ROOT` set, with `cmdline-tools` and `platform-tools` (`adb`) in `PATH`
- **Git**: >= 2.30.0 with worktree support
- **Daylight DC1 Hardware** (Optional for local simulation, required for Stage 6 qualification): Connected DC1 tablet (`rooted 3` / `rooted 4`) with root access via `su 0`

Verify system readiness with `ctc doctor`:
```bash
node bin/ctc.js doctor --json
```

A passing response returns:
```json
{
  "command": "doctor",
  "status": "PASS",
  "exitCode": 0,
  "checks": {
    "node": ">=18.0.0 (PASS)",
    "git": "git available (PASS)",
    "jdk": "JDK 17 detected (PASS)",
    "androidSdk": "ANDROID_HOME configured (PASS)"
  }
}
```

---

## 3. The 8-Phase Retrofit Lifecycle

The following sequence takes an Android app from baseline inspection to certified hardware deployment.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        8-PHASE RETROFIT LIFECYCLE                      │
└────────────────────────────────────────────────────────────────────────┘
  Phase 1: Setup & Doctor          node bin/ctc.js doctor --json
              │
              ▼
  Phase 2: Baseline & Inspect      node bin/ctc.js baseline ./fixtures/note-app --json
              │                    node bin/ctc.js inspect-app ./fixtures/note-app --json
              │                    node bin/ctc.js capture <bundle> && ctc contract build
              │                    node bin/ctc.js map <contract> && ctc plan <map>
              ▼
  Phase 3: Worktree Scaffolding    node bin/ctc.js agent worktree --android <app> --branch <b> --output <wt>
              │
              ▼
  Phase 4: Harness Binding         node bin/ctc.js agent harness --target <wt> --env all
              │
              ▼
  Phase 5: Boundary-Confined Edits Agent edits ONLY allowedPaths (NoteEditorScreen.kt)
              │                    Preserves Room DAOs, ViewModels, autosave & testTags
              ▼
  Phase 6: Candidate Verification  node bin/ctc.js verify note_editor --candidate <wt> --json
              │
              ├───[FAIL (Exit 1)]──► node bin/ctc.js defects --report <path> (Remediate AST)
              │
              ▼
  Phase 7: Intentional Deviations  (Optional) Add owner-approval.json with Draft 2020-12 schema
              │                    node bin/ctc.js verify ... --approval <approval.json>
              ▼
  Phase 8: Merge & Qualification   git merge --ff-only candidate-branch
                                   node bin/ctc.js verify --stage 6 --profile daylight-dc1
```

### Phase 1: Setup & Doctor Preflight
Ensure the workspace is clean and toolchain binaries are available:
```bash
node bin/ctc.js init
node bin/ctc.js doctor --json
```

### Phase 2: Baseline Capture & App Inspection
Record an immutable baseline snapshot of the unmodified Android project:
```bash
# 1. Capture clean baseline state
node bin/ctc.js baseline ./fixtures/note-app --json

# 2. Inspect AST structure, composables, routes, ViewModels, and invariants
node bin/ctc.js inspect-app ./fixtures/note-app --json

# 3. Capture design evidence and build design contract
node bin/ctc.js capture ./fixtures/claude_design_bundle --screen note_editor --json
node bin/ctc.js contract build note_editor --json

# 4. Generate correspondence map and migration plan
node bin/ctc.js map .ctc/designs/note_editor/contract/design-contract.json ./fixtures/note-app --screen note_editor --json
node bin/ctc.js plan .ctc/designs/note_editor/mapping/correspondence.json --screen note_editor --json
```
This produces `app-baseline.json`, `existing-app-model.json`, `design-contract.json`, and `migration-plan.json`.

### Phase 3: Automated Worktree Scaffolding
Create the isolated descendant Git worktree pinned to the baseline commit:
```bash
node bin/ctc.js agent worktree \
  --android ./fixtures/note-app \
  --workspace . \
  --branch retrofit/note_editor \
  --output ./worktrees/candidate_note_editor \
  --screen note_editor \
  --json
```

**What `ctc agent worktree` does automatically**:
1. Checks that the baseline Git repository is 100% clean (`git status --porcelain` is empty).
2. Spawns `git worktree add -b retrofit/note_editor ./worktrees/candidate_note_editor HEAD`.
3. Adds `.ctc-workspace.json`, `agent-packet.json`, `AGENT_PACKET.md`, and harness paths to `.git/info/exclude` in the common Git directory so candidate commits remain untainted.
4. Initializes the candidate marker `.ctc-workspace.json`.
5. Emits the dual implementation packets:
   - `agent-packet.json` (Machine-readable Draft 2020-12 schema).
   - `AGENT_PACKET.md` (Context-bounded human/LLM markdown summary).
6. Auto-scaffolds default harnesses.

### Phase 4: Harness Binding
If you switch IDEs or want to bind harnesses explicitly, execute:
```bash
node bin/ctc.js agent harness \
  --target ./worktrees/candidate_note_editor \
  --env all \
  --screen note_editor \
  --json
```
Supported `--env` values:
- `cursor`: Generates `.cursorrules` and `.cursor/rules/ctc-retrofit.mdc`.
- `claude`: Generates `CLAUDE.md` and `.claude/skills/ctc/` (`verify.js`, `defects.js`, `packet.js`).
- `codex`: Generates `docs/CODING_AGENTS.md` and `candidate_codex_instructions.md`.
- `antigravity`: Generates `skills/claude-to-compose/SKILL.md`.
- `all`: Scaffolds all of the above.

### Phase 5: Boundary-Confined Implementation
Open the candidate worktree (`./worktrees/candidate_note_editor`).
1. Read `AGENT_PACKET.md` first.
2. Confirm the allowed modification boundary:
   - ✅ **Allowed**: `app/src/main/java/com/claude/noteapp/ui/editor/**`
   - ❌ **Forbidden**: `app/src/main/java/com/claude/noteapp/data/**` (Room entities, DAOs)
   - ❌ **Forbidden**: `app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt`
   - ❌ **Forbidden**: `app/src/main/java/com/claude/noteapp/navigation/**`
   - ❌ **Forbidden**: `app/src/test/**`, `tests/**`, `build.gradle.kts`
3. Restyle the Composable using Sol:OS tokens while maintaining parameter signatures and all test tags.

### Phase 6: Candidate Verification & Causal Remediation
Verify the candidate worktree:
```bash
node bin/ctc.js verify note_editor \
  --app-dir ./fixtures/note-app \
  --candidate ./worktrees/candidate_note_editor \
  --json
```

**The 6 Progressive Verification Stages**:
- **Stage 1 (Schema & Provenance)**: Checks that `--candidate` is a real Git worktree descended from the baseline commit, audits for forbidden symlinks, and enforces `allowedPaths` boundaries.
- **Stage 2 (Compilation & Grayscale Contrast)**: Runs `./gradlew compileDebugKotlin` and validates Sol:OS 8-bit grayscale contrast (WCAG AAA >= 7.0:1 for normal text).
- **Stage 3 (Layout Telemetry & Touch Geometry)**: Verifies all 11 `NoteAppTestTags` are present and touch targets have >= 48dp invisible hit-slop.
- **Stage 4 (Perceptual Metrics & Invariants)**: Evaluates edge contour alignment (Sobel >= 85%), MSSIM (>= 0.72), Ink Dice (>= 0.85), spatial drift (<= 3.0px), and runs unit tests (`./gradlew testDebugUnitTest`) to ensure Room autosave logic survived.
- **Stage 5 (Behavioral Scenario Replay)**: Validates state restoration across orientation and navigation transitions.
- **Stage 6 (DC1 Hardware Qualification)**: Deploys the candidate APK to connected DC1 hardware, confirms zero EPD waveform clears, and validates capacitive touch input.

**If verification fails (Exit Code 1)**, diagnose root causes:
```bash
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
```
The Causal Defect Oracle pinpoints the exact element ID, expected vs. actual metrics, and remediation actions (e.g. adjust parent top padding by `floor(dy / density)`).

### Phase 7: Intentional Deviations & Owner Approvals
When a design requires an intentional departure from baseline behavior or standard Android styling (e.g. single-line title constraint, accepted font substitution):
1. Create `owner-approval.json` conforming to Draft 2020-12 schema:
```json
{
  "schemaVersion": "1.0.0",
  "kind": "OwnerApproval",
  "id": "approval_note_editor_title_layout",
  "scopes": [
    {
      "subjectRef": "daylight#note_editor/header_title",
      "statement": "Owner approves single-line title constraint and font size adjustment on DC1 LivePaper."
    }
  ]
}
```
2. Pass the approval manifest to the verifier:
```bash
node bin/ctc.js verify note_editor \
  --app-dir ./fixtures/note-app \
  --candidate ./worktrees/candidate_note_editor \
  --approval ./owner-approval.json \
  --json
```

### Phase 8: Final Merge & DC1 Qualification
Once verification returns `PASS` (Exit Code 0):
1. Commit the changes inside the worktree:
   ```bash
   git -C ./worktrees/candidate_note_editor commit -am "feat(retrofit): apply Sol:OS design to NoteEditorScreen"
   ```
2. Merge the candidate branch into the baseline repository:
   ```bash
   git -C ./fixtures/note-app merge --ff-only retrofit/note_editor
   ```
3. Prune the candidate worktree:
   ```bash
   git -C ./fixtures/note-app worktree remove ./worktrees/candidate_note_editor
   ```
4. Perform final DC1 qualification:
   ```bash
   node bin/ctc.js verify note_editor --app-dir ./fixtures/note-app --stage 6 --profile daylight-dc1 --json
   ```

---

## 4. Environment-Specific Agent Walk-Throughs

### Cursor IDE
1. **Launch**: Open `./worktrees/candidate_note_editor` in Cursor.
2. **Context**: Cursor detects `.cursorrules` and `.cursor/rules/ctc-retrofit.mdc` automatically.
3. **Agent Prompting**:
   ```text
   Read AGENT_PACKET.md. Restyle NoteEditorScreen.kt to match the approved Sol:OS tokens.
   Do NOT touch NoteEditorViewModel.kt or data classes.
   Keep all NoteAppTestTags intact.
   Run `node bin/ctc.js verify --candidate . --json` and fix any defects.
   ```
4. **Execution**: Cursor uses Composer/Agent mode to inspect the packet, edit `NoteEditorScreen.kt`, and execute verification commands in its integrated terminal.

### Claude Code CLI
1. **Launch**: Run `claude` from the candidate worktree directory:
   ```bash
   cd ./worktrees/candidate_note_editor
   claude
   ```
2. **Context**: Claude Code automatically loads `CLAUDE.md`.
3. **Skill Execution**: Claude Code can run the bundled skills in `.claude/skills/ctc/`:
   ```bash
   node .claude/skills/ctc/packet.js
   node .claude/skills/ctc/verify.js
   node .claude/skills/ctc/defects.js
   ```
4. **Remediation Loop**: Claude reads defect outputs and updates Kotlin composables within `allowedPaths` until exit code `0` is achieved.

### OpenAI / Codex Models
1. **Prompt Configuration**: Initialize the model using the structured system prompt in `docs/CODING_AGENTS.md`.
2. **Tools**: Expose the 6 function tools:
   - `read_agent_packet`
   - `read_source_file`
   - `write_source_file`
   - `run_ctc_verify`
   - `run_ctc_defects`
   - `report_completion`
3. **Honest Blocking**: If an unapproved deviation or missing dependency is encountered, the model calls `report_completion` with status `BLOCKED` and detailed blocker descriptions instead of fabricating data mocks or altering tests.

### Google Antigravity
1. **Workflow Command**: Invoke `/claude-to-compose` in chat or activate `skills/claude-to-compose/SKILL.md`.
2. **Execution**: The Antigravity orchestrator dispatches `ctc` CLI subcommands using `--json` flags.
3. **Hardware Qualification**: For Stage 6 qualification, Antigravity integrates with the `daylight-qa_daylight-qa` MCP server (`daylight_fleet_status`, `daylight_touch_tap`, `daylight_capture_screen`, `daylight_closed_loop_step`) to perform closed-loop verification on physical DC1 hardware.

---

## 5. Concrete Walk-Through: `fixtures/note-app`

### Target Composable: `NoteEditorScreen.kt`
Path: `app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt`

#### Before Retrofit (Stock Material 3):
```kotlin
@Composable
fun NoteEditorScreen(
    uiState: NoteEditorUiState,
    onAction: (NoteEditorAction) -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    // ...
    Scaffold(
        modifier = modifier.testTag(NoteAppTestTags.SCREEN_NOTE_EDITOR),
        containerColor = MaterialTheme.colorScheme.background, // Generic purple/teal tint
        topBar = {
            TopAppBar(
                title = { Text(if (uiState.isSaving) "Saving..." else "Saved") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) { // Lacks explicit 48dp hit-slop
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding -> /* ... */ }
}
```

#### After Retrofit (Daylight Sol:OS LivePaper Compliant):
```kotlin
// Sol:OS Neutral Grayscale Tokens
private val SolOs0 = Color(0xFFFFFFFF)    // Base paper canvas
private val SolOs50 = Color(0xFFF7F7F7)   // Top bar / card surface
private val SolOs100 = Color(0xFFDCD5C9)  // Hairline border
private val SolOs400 = Color(0xFF535353)  // Secondary text / icon ink
private val SolOs900 = Color(0xFF1A1A1A)  // Primary headline ink

@Composable
fun NoteEditorScreen(
    uiState: NoteEditorUiState,
    onAction: (NoteEditorAction) -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler(enabled = true, onBack = onNavigateBack)

    Scaffold(
        modifier = modifier
            .testTag(NoteAppTestTags.SCREEN_NOTE_EDITOR)
            .fillMaxSize(),
        containerColor = SolOs0,
        topBar = {
            Surface(
                color = SolOs50,
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        // 1dp bottom hairline border
                        drawLine(
                            color = SolOs100,
                            start = Offset(0f, size.height),
                            end = Offset(size.width, size.height),
                            strokeWidth = 1.dp.toPx()
                        )
                    }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier
                            .testTag(NoteAppTestTags.EDITOR_BACK_BUTTON)
                            .minimumInteractiveComponentSize() // >= 48dp invisible hit-slop
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = SolOs900
                        )
                    }
                    Text(
                        text = if (uiState.isSaving) "Saving..." else "Saved",
                        color = SolOs400,
                        modifier = Modifier.testTag(NoteAppTestTags.EDITOR_STATUS_INDICATOR)
                    )
                }
            }
        }
    ) { padding ->
        // Content with title input, content input, tags row...
    }
}
```

---

## 6. Troubleshooting Guide for Common Failure Modes

| Failure Mode | Exit Code | Diagnostic Message | Root Cause | Remediation Step |
|---|:---:|---|---|---|
| **Boundary Violation** | `1` or `3` | `Candidate modified files outside allowedPaths: [app/.../NoteEditorViewModel.kt]` | Agent edited files outside `targetScope.allowedModificationPaths`. | Run `git -C <wt> checkout -- <file>` to revert out-of-boundary changes. Restrict all edits strictly to `app/src/main/java/com/claude/noteapp/ui/editor/`. |
| **Dirty Baseline Repository** | `3` | `Android repository has uncommitted changes; a clean baseline is required` | Baseline repository has uncommitted changes or untracked files before worktree creation. | Run `git status` in the baseline repo. Commit (`git commit -am ...`) or stash (`git stash`) all changes before creating or verifying worktrees. |
| **Missing Intentional Deviation Approval** | `2` | `Deviation at daylight#note_editor/header_title requires owner approval` | Design introduced an unmapped component, custom header, or modified invariant without an approval token. | Author `owner-approval.json` targeting the subjectRef and pass `--approval owner-approval.json` to `ctc verify`. |
| **Evidence Hash Mismatch / Forgery** | `3` or `1` | `evidence <id> source hash mismatch` or `fabricated summary` | Evidence receipt JSON files in `.ctc/reports/` were edited manually or have mismatched SHA-256 hashes. | Do not manually modify `.ctc/reports/` or verification receipts. Re-run verification stages cleanly so `ctc` computes authentic signed hashes. |
| **EPD Prohibited Broadcast** | `1` | `EPD waveform broadcast detected: ACTION_REFRESH_SCREEN` | Code broadcast an E-Ink waveform clear or added artificial sleep pauses on modal dismissal. | Remove all `ACTION_REFRESH_SCREEN` broadcasts and delays. Daylight DC1 LivePaper uses standard Android 60-120Hz HWUI pipeline. |
| **Touch Target Too Small** | `1` | `Touch target for editor_back_button is 32x32dp (minimum: 48x48dp)` | Interactive IconButton or chip has interactive bounds below 48dp. | Apply `Modifier.minimumInteractiveComponentSize()`. Do not inflate visible container bounds. |
| **Spatial Drift** | `1` | `Element daylight#note_editor/title_input vertical drift +12.0px exceeds 3.0px threshold` | Accumulated container padding shifted composables relative to the design contract. | Compute `delta_dp = floor(dy / density)`. Decrease parent padding or offset by `delta_dp`. |
| **Missing Test Tag** | `1` | `Required test tag NoteAppTestTags.EDITOR_STATUS_INDICATOR missing from hierarchy` | Composable restyling accidentally dropped a `Modifier.testTag()`. | Re-attach `.testTag(NoteAppTestTags.<TAG>)` to the corresponding Compose node. |

---

## 7. Command Reference & Exit Code Matrix

### CLI Commands
| Command | Primary Flags | Purpose |
|---|---|---|
| `ctc doctor` | `--json` | Validates Node, Git, JDK, Android SDK, and connected DC1 devices. |
| `ctc init` | `--workspace <path>` | Initializes the `.ctc` workspace directory. |
| `ctc baseline <app-dir>` | `--json` | Runs `./gradlew compileDebugKotlin` and tests; captures baseline hash. |
| `ctc inspect-app <app-dir>` | `--json` | Parses AST to discover composables, routes, ViewModels, and test tags. |
| `ctc capture <bundle>` | `--screen <id>`, `--json` | Ingests Claude Design bundle and captures reference viewport renders. |
| `ctc contract build <screen>` | `--json` | Builds the 4-layer immutable design contract (`design-contract.json`). |
| `ctc map <contract> <app>` | `--screen <id>`, `--json` | Creates correspondence mapping (`correspondence.json`). |
| `ctc plan <map>` | `--screen <id>`, `--json` | Produces migration plan with boundary definitions (`migration-plan.json`). |
| `ctc agent worktree` | `--android <path>`, `--branch <name>`, `--output <path>` | Scaffolds descendant Git worktree, seeds packets, and binds harnesses. |
| `ctc agent harness` | `--target <dir>`, `--env <cursor\|claude\|codex\|antigravity\|all>` | Generates or refreshes coding agent harness files in the worktree. |
| `ctc verify <screen>` | `--candidate <path>`, `--approval <path>`, `--json` | Runs the 6-stage progressive verification pipeline against the candidate. |
| `ctc defects` | `--report <path>`, `--json` | Causal Defect Oracle diagnosing failures and calculating inverse offsets. |

### Exit Code Semantics
| Exit Code | Status Name | Description | Next Action |
|:---:|:---|:---|:---|
| **`0`** | `PASS` | Gate or stage passed cleanly with zero defects. | Proceed to next phase or publish. |
| **`1`** | `FAIL` | Measurable failure (drift > 3px, broken test, contrast defect, boundary breach). | Run `ctc defects` and remediate code. |
| **`2`** | `BLOCKED` | Missing prerequisite (missing baseline, unapproved deviation, missing evidence). | Generate missing prerequisite or provide `owner-approval.json`. |
| **`3`** | `INPUT_INVALID` | Invalid CLI arguments, directory traversal (`..`), or dirty baseline repository. | Fix command arguments or clean baseline. |
| **`4`** | `INFRASTRUCTURE_ERROR` | Toolchain crash, ADB timeout, or device disconnection. | Verify host toolchain and hardware connection. |

### Official Sol:OS 8-Bit Grayscale Palette
| Token | Hex Value | Semantic Usage | Minimum Contrast vs Canvas |
|---|:---:|---|:---:|
| `--os-0` | `#FFFFFF` | Base paper / ground canvas | 1.0 : 1 |
| `--os-50` | `#F7F7F7` | Surface panels / cards / toolbars | 1.05 : 1 |
| `--os-100` | `#DCD5C9` | Hairline dividers / borders (1dp) | 1.25 : 1 |
| `--os-150` | `#F5F5F5` | Recessed canvas / input field fills | 1.07 : 1 |
| `--os-200` | `#CCCCCC` | Disabled controls / inactive chips | 1.6 : 1 |
| `--os-300` | `#858585` | Tertiary text / placeholder ink | 3.2 : 1 |
| `--os-400` | `#535353` | Secondary text ink / icons | 7.1 : 1 (WCAG AAA) |
| `--os-800` | `#343434` | Pressed state / active chip ink | 11.2 : 1 (WCAG AAA) |
| `--os-900` | `#1A1A1A` | Primary text ink / headlines | 16.5 : 1 (WCAG AAA) |
| `--os-1000` | `#000000` | Max black ink / focus rings | 21.0 : 1 (WCAG AAA) |
