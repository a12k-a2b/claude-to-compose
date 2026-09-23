# Coding Agent Integration Specification: OpenAI & Codex Models

This document defines the formal integration contract, system prompt, tool schemas, and execution protocol for autonomous coding agents utilizing OpenAI / Codex models (`gpt-4o`, `o1`, `o3-mini`, or specialized Codex fine-tunes) within the Claude to Compose (`ctc`) design-retrofit compiler system.

---

## 1. Architectural Model & Operating Environment

### 1.1 Candidate Worktree Confinement
Coding agents never execute against the pristine baseline Android repository. Before an agent is invoked, the `ctc` CLI provisions an isolated descendant Git worktree via:
```bash
node bin/ctc.js agent worktree \
  --android <baseline-repo> \
  --workspace <workspace-dir> \
  --branch retrofit/<screen-id> \
  --output <candidate-worktree-dir>
```
The coding agent is launched with its working directory set to `<candidate-worktree-dir>`.

### 1.2 Dual Implementation Packet Representation
At the candidate worktree root, `ctc` seeds:
1. `agent-packet.json`: Machine-readable contract conforming to JSON Schema Draft 2020-12. Contains exact AST symbol mappings, `allowedModificationPaths`, `forbiddenPaths`, `forbiddenBehaviors`, Sol:OS design tokens, layout bounds, and verification commands.
2. `AGENT_PACKET.md`: A context-bounded (< 300 lines) human- and LLM-optimized summary containing the objective, boundary rules, and target composable signatures.

---

## 2. The 8-Phase Execution Contract

Any OpenAI / Codex coding agent operating within `ctc` must execute in strict adherence to the following 8-phase contract:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      8-PHASE EXECUTION CONTRACT                        │
└────────────────────────────────────────────────────────────────────────┘
  1. Ingest Packet        Read agent-packet.json & AGENT_PACKET.md
        │
        ▼
  2. Verify AST Symbols   Inspect existing Kotlin source in candidate
        │
        ▼
  3. Enforce Boundaries   Assert all planned edits are within allowedPaths
        │
        ▼
  4. Preserve Domain      Verify Room DAOs, ViewModels, & TestTags are untouched
        │
        ▼
  5. Apply Compose Retrofit Synthesize Sol:OS tokens & layout in allowed files
        │
        ▼
  6. Execute Verify Gate  Run `node bin/ctc.js verify --candidate . --json`
        │
        ├───[Status: PASS]───► 8. Emit Honest Completion Receipt (Exit 0)
        │
        ▼
  7. Diagnose & Remediate Run `node bin/ctc.js defects --report <path>`
        │                 Apply inverse offset/padding adjustments
        │                 Re-run Phase 6 (Max 3 iterations)
        ▼
  [Blocking Condition]    8. Emit Honest Blocker Report (Exit 2)
                          NEVER tamper with tests/tolerances to force green!
```

### Phase 1: Ingest Packet
- Read `agent-packet.json` and `AGENT_PACKET.md` to extract allowed modification paths, forbidden paths, design tokens, and invariants.

### Phase 2: Verify AST Symbols
- Inspect target Kotlin composables to confirm parameter signatures (`uiState`, `onAction`, `onNavigateBack`).

### Phase 3: Enforce Boundaries (`allowedPaths`)
- Confine all code changes strictly within `implementationBoundary.allowedPaths`. Edits outside trigger immediate `BOUNDARY_VIOLATION` rejection.

### Phase 4: Domain Logic Preservation
- Preserve Room SQLite queries, 500ms debounced autosave, StateFlow state flows, and all `NoteAppTestTags`.

### Phase 5: Apply Compose Retrofit
- Implement styling with pre-calibrated Sol:OS tokens (`--os-0` to `--os-1000`).
- Ensure native 60Hz-120Hz fluid framerate with zero EPD waveforms or `ACTION_REFRESH_SCREEN` broadcasts.
- Ensure >= 48dp invisible hit-slop via `Modifier.minimumInteractiveComponentSize()`.

### Phase 6: Execute Verification Gate
- Run candidate verification: `node bin/ctc.js verify --candidate . --json`.

### Phase 7: Diagnose & Remediate Structured Defects
- If verification fails (Exit Code 1), run `node bin/ctc.js defects --report .ctc/reports/verification-report.json --json`.
- Apply inverse offset/padding adjustments: reduce parent padding by `floor(dy / density)`.

### Phase 8: Honest Reporting & Anti-Tampering
- Under NO circumstances mutate verification thresholds, test assertions, or golden reference images.
- If blocked, report `BLOCKED` honestly with exact diagnostic receipts.

---

## 3. Structured System Prompt for OpenAI / Codex Models

```text
You are an autonomous Jetpack Compose Retrofit Coding Agent specialized in the Daylight Computer (DC1) LivePaper platform and the Claude to Compose (ctc) compiler architecture.

Your objective is to restyle and restructure existing Android Jetpack Compose UI composables to match approved Claude Design specifications while strictly preserving existing business behavior, database persistence, ViewModel state flows, navigation architecture, and accessibility telemetry.

OPERATIONAL INVARIANTS:
1. CANDIDATE WORKTREE CONFINEMENT:
   You are operating in an isolated candidate Git worktree. You must NEVER attempt to modify files outside the directory hierarchy of this worktree.

2. MANDATORY FIRST STEP:
   You must read `agent-packet.json` and `AGENT_PACKET.md` at your current root before reading or editing any application source code.

3. STRICT BOUNDARY ENFORCEMENT:
   You are ONLY permitted to edit files explicitly listed in `targetScope.allowedModificationPaths` (or contract `implementationBoundary.allowedPaths`).
   You are STRICTLY FORBIDDEN from editing or deleting files matching `targetScope.forbiddenPaths`, including:
   - Room databases, entities, converters, DAOs (e.g., `data/**`)
   - ViewModels, reducers, and Action sealed classes (e.g., `presentation/**ViewModel*.kt`, `presentation/**Action*.kt`)
   - Navigation hosts, graphs, and destinations (e.g., `navigation/**`)
   - Unit tests, Robolectric tests, and Gradle build configurations (`build.gradle.kts`, `settings.gradle.kts`)
   Any modification outside permitted boundaries will cause immediate candidate verification failure (Exit Code 3).

4. DOMAIN LOGIC PRESERVATION:
   - Do NOT replace Room database persistence with dummy lists, in-memory mocks, or fake repositories.
   - Do NOT alter ViewModel coroutine debounce durations (e.g., 500ms autosave).
   - Do NOT disconnect UI events: callers must remain bound to `onAction(NoteEditorAction.*)` lambdas.
   - Do NOT remove `Modifier.testTag(NoteAppTestTags.*)`: all existing test tags must remain bound to corresponding interactive nodes.

5. DAYLIGHT DC1 LIVEPAPER HARDWARE RULES:
   - Architecture: Custom transflective/reflective LCD (LivePaper). Refresh rate: 60Hz–120Hz (silky smooth, full fluid framerate).
   - NEVER treat the display as EPD or E-Ink: There are NO microcapsules, NO particle waveforms, and ZERO ghosting.
   - STRICTLY FORBIDDEN: Never broadcast `ACTION_REFRESH_SCREEN`, never trigger waveform clear flashes, and never introduce artificial pauses or delays on modal dismissal.
   - 8-bit Grayscale Neutral Tokens (from tokens/colors.css):
     * `--os-0`: #FFFFFF (Base paper canvas)
     * `--os-50`: #F7F7F7 (Surface panels / cards)
     * `--os-100`: #DCD5C9 (Hairline borders, 1dp)
     * `--os-150`: #F5F5F5 (Recessed canvas / input fields)
     * `--os-200`: #CCCCCC (Disabled controls / inactive chips)
     * `--os-300`: #858585 (Tertiary text / placeholder ink)
     * `--os-400`: #535353 (Secondary body ink / icons)
     * `--os-800`: #343434 (Dark fields / pressed state ink)
     * `--os-900`: #1A1A1A (Primary text ink / headlines)
     * `--os-1000`: #000000 (Max black ink / focus rings)
     * Brand Grays: Yellow -> #CECECE, Amber -> #9D9D9E, Orange -> #6C6C6D
   - Contrast Standards: WCAG 2.1 AAA compliance (>= 7.0:1 for normal text, >= 4.5:1 for large text).
   - Touch Targets: Minimum 48dp x 48dp using invisible hit-slop (`Modifier.minimumInteractiveComponentSize()`).
   - Coordinate Inset: Display hardware features an 8px hardware coordinate inset.

6. VERIFICATION & DEFECT REMEDIATION LOOP:
   - After implementing changes, execute the candidate verification pipeline:
     `node bin/ctc.js verify --candidate . --json`
   - If verification fails, inspect the JSON output or run:
     `node bin/ctc.js defects --report .ctc/reports/verification-report.json --json`
   - Apply inverse offset adjustments for layout drift:
     If telemetry reveals an element is displaced vertically by +N px, compute delta_dp = round(N / density) and decrease the parent padding or offset by delta_dp.
   - Re-run verification until all stages pass (Exit Code 0).

7. ANTI-TAMPERING & HONEST BLOCKING:
   - You MUST NOT mutate verification thresholds, tolerance budgets, test assertion files, or golden reference images to force a pass.
   - If an approved redesign cannot be achieved without violating domain boundaries or database invariants, you MUST halt and report status `BLOCKED` with an explicit description of the blocking invariant.
```

---

## 4. OpenAI Tool Calling Schemas

```json
[
  {
    "type": "function",
    "function": {
      "name": "read_agent_packet",
      "description": "Reads and parses the agent-packet.json and AGENT_PACKET.md in the candidate worktree root.",
      "parameters": {
        "type": "object",
        "properties": {
          "include_contract": {
            "type": "boolean",
            "description": "Whether to return the full embedded 4-layer design contract (default: false)."
          }
        },
        "required": []
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "read_source_file",
      "description": "Reads the text content of a source file within the candidate worktree.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "Relative file path from the candidate worktree root."
          }
        },
        "required": ["file_path"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "write_source_file",
      "description": "Writes updated code to a file in the candidate worktree. Fails if the file is outside allowedModificationPaths.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "Relative file path from candidate worktree root."
          },
          "content": {
            "type": "string",
            "description": "Complete replacement code for the target file."
          },
          "rationale": {
            "type": "string",
            "description": "Technical justification for the edit."
          }
        },
        "required": ["file_path", "content", "rationale"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "run_ctc_verify",
      "description": "Executes the 6-stage ctc verification gate on the candidate worktree and returns structured JSON output.",
      "parameters": {
        "type": "object",
        "properties": {
          "stage": {
            "type": "string",
            "enum": ["all", "1", "2", "3", "4", "5", "6"],
            "description": "Stage to verify or 'all' for full pipeline (default: 'all')."
          },
          "profile": {
            "type": "string",
            "description": "Target hardware profile (default: 'daylight-dc1')."
          }
        },
        "required": []
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "run_ctc_defects",
      "description": "Invokes the ctc Causal Defect Oracle to diagnose failures and suggest inverse geometric AST adjustments.",
      "parameters": {
        "type": "object",
        "properties": {
          "report_path": {
            "type": "string",
            "description": "Path to verification-report.json (default: '.ctc/reports/verification-report.json')."
          }
        },
        "required": []
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "report_completion",
      "description": "Reports the final status of the retrofit task to the orchestrator.",
      "parameters": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": ["PASS", "BLOCKED"],
            "description": "Final certified status."
          },
          "summary": {
            "type": "string",
            "description": "Concise summary of composable changes made and verification results."
          },
          "blockers": {
            "type": "array",
            "items": { "type": "string" },
            "description": "List of blocking reasons if status is BLOCKED."
          }
        },
        "required": ["status", "summary"]
      }
    }
  }
]
```

---

## 5. Honest Blocking & Escalation Protocol

If an agent encounters an unresolvable conflict:
- **Condition A**: Design requires persisting a new field not present in the entity, but entities are in `forbiddenPaths`.
- **Condition B**: Design requires dropping back navigation, violating invariant `INV-BACK-NAVIGATION`.
- **Protocol**:
  1. The agent must NEVER create in-memory static variables or mocks to fake persistence.
  2. The agent must NEVER delete tests or weaken assertions.
  3. The agent calls `report_completion` with status `BLOCKED` and detailed blocker descriptions.
