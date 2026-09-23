/**
 * src/agent/harnesses.js
 *
 * Programmatic Coding Agent Harness Generator & Scaffolder Engine.
 * Requirement R3: First-Class Coding Agent Harnesses (Cursor, Claude Code, Codex, Antigravity).
 * Features: F10, F11, F12, F13.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  resolveExplicit,
  rejectDangerousRoot,
  atomicWriteNoFollow,
  gitCommonDirectory,
  InputError
} = require('./safety');

const HARNESS_EXCLUDE_PATTERNS = Object.freeze([
  '.cursorrules',
  '.cursor',
  '.cursor/**',
  'CLAUDE.md',
  '.claude',
  '.claude/**'
]);

const DEFAULT_FORBIDDEN_PATHS = Object.freeze([
  'app/src/main/java/com/claude/noteapp/data/**',
  'app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt',
  'app/src/main/java/com/claude/noteapp/presentation/**Action*.kt',
  'app/src/main/java/com/claude/noteapp/navigation/**',
  'app/src/test/**',
  'tests/**'
]);

const DEFAULT_VERIFICATION_COMMANDS = Object.freeze([
  './gradlew compileDebugKotlin --no-daemon',
  './gradlew testDebugUnitTest --no-daemon',
  'node bin/ctc.js verify --candidate . --json'
]);

/**
 * Normalizes options from explicit flags, design contract, or migration plan.
 *
 * @param {object} [options={}]
 * @returns {object} Normalized harness options.
 */
function extractHarnessOptions(options = {}) {
  const screenId = options.screenId || 'note_editor';
  const contract = options.contract || null;
  const migrationPlan = options.migrationPlan || null;

  let allowedPaths = options.allowedPaths || null;
  if (!allowedPaths && contract?.implementationBoundary?.allowedPaths) {
    allowedPaths = contract.implementationBoundary.allowedPaths;
  } else if (!allowedPaths && migrationPlan?.boundaries?.allowedModificationPaths) {
    allowedPaths = migrationPlan.boundaries.allowedModificationPaths;
  }
  if (!allowedPaths || !allowedPaths.length) {
    allowedPaths = ['app/src/main/java/com/claude/noteapp/ui/editor'];
  }
  allowedPaths = allowedPaths.map(p =>
    String(p).replace(/\\/g, '/').replace(/\/\*\*.*$/, '').replace(/\/\*.*$/, '')
  );

  let forbiddenPaths = options.forbiddenPaths || null;
  if (!forbiddenPaths && contract?.implementationBoundary?.forbiddenPaths) {
    forbiddenPaths = contract.implementationBoundary.forbiddenPaths;
  } else if (!forbiddenPaths && migrationPlan?.boundaries?.forbiddenPaths) {
    forbiddenPaths = migrationPlan.boundaries.forbiddenPaths;
  }
  if (!forbiddenPaths || !forbiddenPaths.length) {
    forbiddenPaths = [...DEFAULT_FORBIDDEN_PATHS];
  }
  forbiddenPaths = forbiddenPaths.map(p => String(p).replace(/\\/g, '/'));

  let verificationCommands = options.verificationCommands || null;
  if (!verificationCommands && contract?.implementationBoundary?.verificationCommands) {
    verificationCommands = contract.implementationBoundary.verificationCommands;
  } else if (!verificationCommands && migrationPlan?.verificationCommands) {
    verificationCommands = migrationPlan.verificationCommands;
  }
  if (!verificationCommands || !verificationCommands.length) {
    verificationCommands = [...DEFAULT_VERIFICATION_COMMANDS];
  }

  return {
    screenId,
    allowedPaths,
    forbiddenPaths,
    verificationCommands,
    candidateRoot: options.candidateRoot || '.',
    androidRoot: options.androidRoot || null
  };
}

/**
 * Generates Cursor configuration rules (.cursorrules and .cursor/rules/ctc-retrofit.mdc).
 *
 * @param {object} [options={}]
 * @returns {{ '.cursorrules': string, '.cursor/rules/ctc-retrofit.mdc': string }}
 */
function generateCursorRules(options = {}) {
  const opts = extractHarnessOptions(options);

  const allowedList = opts.allowedPaths.map(p => `- \`${p}\` (and subdirectories)`).join('\n');
  const forbiddenList = opts.forbiddenPaths.map(p => `- \`${p}\``).join('\n');
  const verifyCommands = opts.verificationCommands.map(c => `   ${c}`).join('\n');

  const mdcContent = `---
description: "Enforce Daylight Sol:OS Android Jetpack Compose retrofit rules, modification boundaries, invariant preservation, and DC1 LivePaper constraints."
globs: "**/*.kt,**/AGENT_PACKET.md,**/agent-packet.json"
alwaysApply: true
---

# Daylight Sol:OS Jetpack Compose Retrofit Directives

## 1. Mission & Operating Context
You are retrofitting an existing, functional Android Jetpack Compose application to match an approved Claude Design redesign for the **Daylight Computer (DC1)**.
Your objective is to achieve visual and UX pixel-perfection strictly within the designated presentation composables while completely preserving the underlying domain architecture, state management patterns, SQLite data persistence, and accessibility contracts.

---

## 2. Mandatory Initial Step: Read the Agent Packet
Before editing or creating any file, you MUST inspect:
1. \`AGENT_PACKET.md\` at the repository root.
2. \`agent-packet.json\` at the repository root.

Extract and adhere to:
- \`targetScope.allowedModificationPaths\`: Files you are authorized to edit.
- \`targetScope.forbiddenPaths\`: Files you are strictly forbidden from modifying.
- \`preservationInvariants\`: Domain persistence, debounced autosave, and test tags.
- \`designTokens\`: Daylight Sol:OS 8-bit grayscale neutral scale.
- \`layoutConstraints\`: Portrait and landscape bounding boxes and hit-slop requirements.

---

## 3. Strict Boundary Enforcement

### ✅ Allowed Modification Boundary
Edit ONLY files residing within the paths explicitly declared in \`implementationBoundary.allowedPaths\`:
${allowedList}
- Every changed path is audited against this boundary by \`candidate_verifier.js\`.
- Modifying or creating even a single file outside this boundary causes immediate verification rejection (\`FAIL\`).

### ❌ Strictly Forbidden Subsystems (DO NOT TOUCH)
You are strictly PROHIBITED from modifying:
${forbiddenList}
- Never modify verification thresholds, tolerance budgets, test assertion values, or baseline golden images to force a pass.

---

## 4. Preservation of Functional Invariants

1. **Room SQLite Persistence**:
   - All persistence must flow through existing DAO/Repository queries.
   - NEVER introduce in-memory mock lists, fake collections, or placeholder stubs.
2. **500ms Debounced Autosave**:
   - Title and content edits must dispatch appropriate action events.
   - The ViewModel coroutine debounces changes for exactly 500ms before triggering persistence. Do NOT bypass or shorten this delay.
3. **Navigation & Hardware Back**:
   - The top bar back button and Android system back gesture (\`BackHandler\`) must invoke \`onNavigateBack: () -> Unit\`.
4. **Accessibility Semantics**:
   - All interactive icon buttons must have non-empty, localized \`contentDescription\` strings.
5. **UI Telemetry Test Tags**:
   - All \`NoteAppTestTags\` must remain attached via \`Modifier.testTag(NoteAppTestTags.<TAG>)\`.

---

## 5. Daylight DC1 LivePaper Hardware Rules

The Daylight Computer (DC1) has a custom **LivePaper** display.
You must NEVER treat, describe, or program for the DC1 as an Electronic Paper Display (EPD) or E-Ink panel.

1. **Display Architecture**:
   - Technology: Sharp NT36523N **Reflective / Transflective LCD** (LivePaper).
   - Refresh Rate: Native **60Hz to 120Hz** fluid framerate driven by standard Android SurfaceFlinger / HWUI GPU pipeline.
   - Color Depth: **8-bit Grayscale (256 discrete levels of gray)**, illuminated by a pure amber frontlight.
2. **ZERO EPD / E-Ink Workarounds**:
   - **NO Waveforms or Particle Refreshes**: There are no microcapsules or electrophoretic particles.
   - **NO Ghosting / Artifacting**: The panel has zero physical ghosting.
   - **NEVER use E-ink Screen Flash Hooks**: Never broadcast \`ACTION_REFRESH_SCREEN\`, never trigger waveform clear flashes, and never introduce artificial pauses/sleeps (\`delay(500)\`) on modal dismissal or view transitions.
3. **Official Sol:OS Grayscale Neutral Scale**:
   Always use the pre-calibrated Sol:OS tokens for guaranteed contrast:
   - \`--os-0\`: \`#FFFFFF\` (\`Color(0xFFFFFFFF)\`) — Base paper ground / canvas
   - \`--os-50\`: \`#F7F7F7\` (\`Color(0xFFF7F7F7)\`) — Surface panels / cards
   - \`--os-100\`: \`#DCD5C9\` (\`Color(0xFFDCD5C9)\`) — Hairline borders (1dp)
   - \`--os-150\`: \`#F5F5F5\` (\`Color(0xFFF5F5F5)\`) — Recessed canvas / input fields
   - \`--os-200\`: \`#CCCCCC\` (\`Color(0xFFCCCCCC)\`) — Disabled controls / inactive chips
   - \`--os-300\`: \`#858585\` (\`Color(0xFF858585)\`) — Low emphasis / tertiary text
   - \`--os-400\`: \`#535353\` (\`Color(0xFF535353)\`) — Secondary body text / icons
   - \`--os-800\`: \`#343434\` (\`Color(0xFF343434)\`) — Dark fields / pressed states
   - \`--os-900\`: \`#1A1A1A\` (\`Color(0xFF1A1A1A)\`) — Primary text ink / headlines
   - \`--os-1000\`: \`#000000\` (\`Color(0xFF000000)\`) — Max black ink / focus rings
   - Calibrated Brand Grays: Yellow \`#CECECE\`, Amber \`#9D9D9E\`, Orange \`#6C6C6D\`.
4. **Contrast Compliance**:
   - Normal text: >= 7.0:1 contrast ratio against background (WCAG AAA).
   - Large text (>= 18pt or >= 14pt bold): >= 4.5:1 contrast ratio.
5. **Touch Target Hit-Slop (Invisible 48dp)**:
   - Every interactive element must satisfy the **>= 48dp x 48dp** (96px x 96px) touch target requirement.
   - Use \`Modifier.minimumInteractiveComponentSize()\` to expand the invisible touch bounds without inflating the visual icon or hairline boundaries.

---

## 6. Verification & Defect Remediation Workflow

### Verification Commands:
\`\`\`bash
${verifyCommands}
\`\`\`

### Defect Diagnosis:
\`\`\`bash
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
\`\`\`

### Defect Remediation:
- **Spatial Drift (dy > 0)**: Reduce parent container top padding by \`floor(dy / density)\`.
- **Baseline Alignment**: Adjust \`TextStyle(lineHeight = ..., baselineShift = ...)\`.
- **Contrast Failure**: Replace low-contrast tokens with compliant Sol:OS tokens (\`--os-900\` or \`--os-400\`).
- **Touch Target**: Attach \`Modifier.minimumInteractiveComponentSize()\`.
- **EPD Workarounds**: Delete any \`ACTION_REFRESH_SCREEN\` broadcasts or modal dismissal delays.
`;

  const cursorrulesContent = `# Daylight Sol:OS Android Compose Retrofit Rules (.cursorrules)

## Role & Mission
You are retrofitting an existing Android Jetpack Compose application for the Daylight Computer (DC1) running Sol:OS. Your task is to apply approved Claude Design specifications to presentation composables without modifying domain architecture, ViewModels, Room databases, navigation graphs, or unit tests.

## Mandatory Step 1: Read the Agent Packet
Always inspect \`AGENT_PACKET.md\` and \`agent-packet.json\` at the root before taking any action. Respect all declared boundaries and invariants.

## Boundary Enforcement
- Touch ONLY files listed in \`implementationBoundary.allowedPaths\`:
${allowedList}
- NEVER edit files in forbidden paths:
${forbiddenList}
- NEVER modify verification thresholds, golden images, or tolerance budgets to mask defects.

## Functional Invariants
- Room SQLite persistence must remain intact through existing DAOs.
- Maintain 500ms debounced autosave on title/content changes.
- Connect top bar and back gestures to \`onNavigateBack\`.
- Retain all \`NoteAppTestTags\` via \`Modifier.testTag(NoteAppTestTags.<TAG>)\`.
- Ensure non-empty \`contentDescription\` on all interactive IconButtons.

## Daylight DC1 LivePaper Hardware Rules
- Display is a Sharp Transflective LCD (LivePaper), 60Hz-120Hz fluid refresh, 8-bit grayscale (256 shades).
- NEVER treat as EPD/E-Ink: NO \`ACTION_REFRESH_SCREEN\`, NO waveform flashes, NO artificial dismissal delays.
- Use pre-calibrated Sol:OS tokens: \`--os-0\` (#FFFFFF) to \`--os-1000\` (#000000).
- WCAG AAA contrast: >= 7.0:1 for normal text, >= 4.5:1 for large text.
- Invisible hit-slop >= 48dp x 48dp via \`Modifier.minimumInteractiveComponentSize()\`.

## Verification Commands
\`\`\`bash
${verifyCommands}
\`\`\`

## Defect Remediation
- Calculate inverse padding adjustments for spatial drift: reduce parent padding by floor(dy / density).
- Replace non-compliant contrast tokens with approved Sol:OS tokens.
- Add \`minimumInteractiveComponentSize()\` for undersized touch targets.
`;

  return {
    '.cursorrules': cursorrulesContent,
    '.cursor/rules/ctc-retrofit.mdc': mdcContent
  };
}

/**
 * Generates Claude Code harness files (CLAUDE.md and skills in .claude/skills/ctc/).
 *
 * @param {object} [options={}]
 * @returns {object} Dictionary of filenames and contents.
 */
function generateClaudeCodeHarness(options = {}) {
  const opts = extractHarnessOptions(options);

  const allowedList = opts.allowedPaths.map(p => `- \`${p}\``).join('\n');
  const forbiddenList = opts.forbiddenPaths.map(p => `- \`${p}\``).join('\n');
  const verifyCommands = opts.verificationCommands.map(c => `   ${c}`).join('\n');

  const claudeMdContent = `# Claude to Compose (ctc) v2: Developer & Agent Guide

## 1. Project Overview & Architecture
\`claude_to_compose\` (\`ctc\`) is a local design-retrofit compiler and fail-closed verification system for Android Jetpack Compose applications targeting the Daylight Computer (DC1) LivePaper display.

### Operating Context: Candidate Worktree
You are operating inside an isolated descendant Git worktree created for an Android Jetpack Compose retrofit targeting the Daylight Computer (DC1) for screen \`${opts.screenId}\`.

### Directory Structure & Subsystems
- \`src/agent/\`: Scoping, boundary enforcement, agent packets (\`packet.js\`), safety primitives (\`safety.js\`), worktree scaffolding (\`worktree.js\`), and harnesses (\`harnesses.js\`).
- \`src/cli/\`: Unified CLI dispatcher (\`dispatcher.js\`) and command handlers in \`src/cli/commands/\`.
- \`src/contract/\`: 4-layer immutable design contracts and Draft 2020-12 schemas.
- \`src/verification/\`: 6-stage progressive verification pipeline (\`pipeline.js\`) and candidate Git worktree verifier (\`candidate_verifier.js\`).
- \`src/defects/\`: Causal Defect Oracle attributing verification failures to stable element IDs (\`oracle.js\`, \`taxonomy.js\`, \`remediation.js\`).
- \`fixtures/note-app/\`: Realistic Jetpack Compose target application with Room DB, ViewModels, and unit tests.
- \`bin/ctc.js\`: Unified CLI executable entrypoint.

---

## 2. Standard CLI Exit Code Semantics

The \`ctc\` CLI strictly adheres to deterministic exit codes across all commands:

| Exit Code | Status Name | Semantic Definition | Action Required |
|:---:|:---|:---|:---|
| **\`0\`** | \`PASS\` | All stages, gates, or commands executed successfully with zero defects. | Proceed to next phase or publish. |
| **\`1\`** | \`FAIL\` | Measurable failure detected: visual drift > 3px, contrast failure, broken test, or boundary violation. | Inspect defects and apply code remediation. |
| **\`2\`** | \`BLOCKED\` | Prerequisite missing: missing baseline, missing evidence receipt, unapproved intentional deviation. | Generate missing evidence or obtain approval. |
| **\`3\`** | \`INPUT_INVALID\` / \`USAGE_ERROR\` | Malformed CLI arguments, unknown flags, directory traversal (\`..\`), or dirty baseline repository. | Correct command invocation arguments. |
| **\`4\`** | \`INFRASTRUCTURE_ERROR\` | System failure: process crash, ADB connection timeout, unhandled exception, or SIGINT. | Check environment and hardware connectivity. |

---

## 3. Worktree Safety & Isolation Invariants
1. **Never edit the baseline repository directly**: Always perform edits inside the candidate worktree.
2. **Atomic Writes**: All file modifications must use \`atomicWriteNoFollow\` (\`O_NOFOLLOW | O_EXCL\`) to prevent symlink traversal attacks.
3. **No Source Symlinks**: Symlinks inside \`src/\`, \`app/\`, or Gradle manifests are strictly prohibited.
4. **Boundary Verification**: Candidate modifications must exist entirely inside \`implementationBoundary.allowedPaths\`.
5. **Git Hygiene**: Harness files (\`.cursor/\`, \`.cursorrules\`, \`CLAUDE.md\`, \`.claude/\`) are excluded in \`.git/info/exclude\` and must never be committed.

### Active Scope Boundaries:
**Allowed Modification Paths**:
${allowedList}

**Forbidden Subsystems**:
${forbiddenList}

---

## 4. Daylight DC1 LivePaper Hardware Rules
- Sharp Transflective LCD (LivePaper), 60Hz-120Hz fluid framerate, 8-bit grayscale (256 levels).
- STRICT ZERO EPD: NO waveforms, NO particle clear flashes, NO \`ACTION_REFRESH_SCREEN\` broadcasts.
- NO artificial modal dismissal delays or sleep loops.
- Use pre-calibrated Sol:OS tokens: \`--os-0\` (#FFFFFF) to \`--os-1000\` (#000000).
- Ensure WCAG AAA contrast (>= 7.0:1 normal text, >= 4.5:1 large text).
- Use \`Modifier.minimumInteractiveComponentSize()\` for >= 48dp invisible hit-slop.

---

## 5. Candidate Verification & Defect Remediation Loop
Run these commands directly in terminal or via Claude Code skills:
\`\`\`bash
${verifyCommands}
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
\`\`\`

### Defect Remediation:
- **Spatial Drift**: If vertical drift dy > 0, reduce parent container top padding by \`floor(dy / density)\`.
- **Contrast**: Replace non-compliant tokens with approved Sol:OS tokens (\`--os-900\` or \`--os-400\`).
- **Touch Target**: Add \`Modifier.minimumInteractiveComponentSize()\`.
`;

  // Skill 1: ctc-verify
  const verifySkillJson = JSON.stringify({
    name: 'ctc-verify',
    description: 'Execute progressive verification on the candidate worktree and parse structured JSON output.',
    parameters: {
      type: 'object',
      properties: {
        candidate: {
          type: 'string',
          description: 'Path to candidate Git worktree (default: current working directory ".")'
        },
        screenId: {
          type: 'string',
          description: 'Target screen identifier to verify (default: "note_editor")'
        },
        stage: {
          type: 'string',
          description: 'Optional specific stage to execute (e.g. "STAGE_2_BUILD_COMPILE", "STAGE_3_LAYOUT_TELEMETRY", "STAGE_4_PERCEPTUAL_DIFF")'
        },
        untilStage: {
          type: 'string',
          description: 'Optional maximum stage to execute up to'
        },
        profile: {
          type: 'string',
          description: 'Hardware device profile (default: "daylight-dc1")'
        }
      },
      required: []
    }
  }, null, 2) + '\n';

  const verifySkillScript = `#!/usr/bin/env node
'use strict';

/**
 * Claude Code Skill Wrapper for \`ctc verify\`.
 * Executes progressive verification pipeline on candidate worktree,
 * parses structured JSON output, maps exit codes, and provides actionable summaries.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function findCtcBinary(searchStart) {
  let curr = path.resolve(searchStart);
  for (let i = 0; i < 5; i++) {
    const candidateBin = path.join(curr, 'bin', 'ctc.js');
    if (fs.existsSync(candidateBin)) return candidateBin;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return 'ctc';
}

function runVerify(options = {}) {
  const candidate = path.resolve(options.candidate || process.cwd());
  const screenId = options.screenId || 'note_editor';
  const profile = options.profile || 'daylight-dc1';
  const ctcBin = findCtcBinary(candidate);

  const args = [
    'verify', screenId,
    '--candidate', candidate,
    '--profile', profile,
    '--json'
  ];

  if (options.stage) args.push('--stage', options.stage);
  if (options.untilStage) args.push('--until-stage', options.untilStage);

  const runCmd = ctcBin.endsWith('.js') ? process.execPath : ctcBin;
  const execArgs = ctcBin.endsWith('.js') ? [ctcBin, ...args] : args;

  const result = spawnSync(runCmd, execArgs, {
    cwd: candidate,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' }
  });

  const exitCode = result.status !== null ? result.status : 4;
  let parsed = null;

  try {
    parsed = JSON.parse(result.stdout);
  } catch (_) {
    const jsonMatch = result.stdout && result.stdout.match(/\\{[\\s\\S]*\\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (__) {}
    }
  }

  const exitStatusMap = {
    0: 'PASS',
    1: 'FAIL',
    2: 'BLOCKED',
    3: 'INVALID_INPUT',
    4: 'INFRASTRUCTURE_ERROR'
  };

  const status = parsed?.status || exitStatusMap[exitCode] || 'FAIL';
  const defects = parsed?.defects || [];
  const stages = parsed?.data?.stages || [];

  return {
    success: exitCode === 0,
    exitCode,
    status,
    candidate,
    screenId,
    passedStagesCount: stages.filter(s => s.status === 'PASS').length,
    totalStagesCount: stages.length || 6,
    defectCount: defects.length,
    stages: stages.map(s => ({
      stage: s.stage,
      status: s.status,
      durationMs: s.durationMs,
      error: s.error || null
    })),
    defects: defects.slice(0, 5).map(d => ({
      defectId: d.defectId || 'DEF-UNK',
      category: d.category,
      severity: d.severity,
      message: d.message || d.diagnosis?.explanation || d.error,
      targetFile: d.target?.file || d.path || null
    })),
    rawError: result.stderr ? result.stderr.trim() : null
  };
}

if (require.main === module) {
  let rawInput = '';
  process.stdin.setEncoding('utf8');

  if (process.stdin.isTTY) {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--candidate' && args[i + 1]) opts.candidate = args[++i];
      else if (args[i] === '--screen' && args[i + 1]) opts.screenId = args[++i];
      else if (args[i] === '--stage' && args[i + 1]) opts.stage = args[++i];
    }
    const output = runVerify(opts);
    process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
    process.exit(output.exitCode);
  } else {
    process.stdin.on('data', chunk => { rawInput += chunk; });
    process.stdin.on('end', () => {
      let opts = {};
      try { opts = JSON.parse(rawInput); } catch (_) {}
      const output = runVerify(opts);
      process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
      process.exit(output.exitCode);
    });
  }
}

module.exports = { runVerify };
`;

  // Skill 2: ctc-defects
  const defectsSkillJson = JSON.stringify({
    name: 'ctc-defects',
    description: 'Analyze verification failures using the Causal Defect Oracle, attributing failures to stable element IDs, classifying root causes, and providing actionable code remediation diffs.',
    parameters: {
      type: 'object',
      properties: {
        report: {
          type: 'string',
          description: 'Path to verification report JSON (default: ".ctc/reports/verification-report.json")'
        },
        severity: {
          type: 'string',
          enum: ['ALL', 'CRITICAL', 'MAJOR', 'MINOR'],
          description: 'Filter defects by severity level (default: "ALL")'
        },
        category: {
          type: 'string',
          description: 'Filter defects by taxonomy category (e.g. "MARGIN_SHIFT", "CONTRAST_FAILURE", "TOUCH_TARGET_TOO_SMALL")'
        }
      },
      required: []
    }
  }, null, 2) + '\n';

  const defectsSkillScript = `#!/usr/bin/env node
'use strict';

/**
 * Claude Code Skill Wrapper for \`ctc defects\`.
 * Attributes failures to stable element IDs, parses root causes, and outputs unified diff patches.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function findCtcBinary(searchStart) {
  let curr = path.resolve(searchStart);
  for (let i = 0; i < 5; i++) {
    const candidateBin = path.join(curr, 'bin', 'ctc.js');
    if (fs.existsSync(candidateBin)) return candidateBin;
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return 'ctc';
}

function runDefects(options = {}) {
  const root = path.resolve(process.cwd());
  const reportPath = options.report || path.join(root, '.ctc', 'reports', 'verification-report.json');
  const ctcBin = findCtcBinary(root);

  const args = ['defects', '--json'];
  if (fs.existsSync(reportPath)) {
    args.push(reportPath);
  }

  const runCmd = ctcBin.endsWith('.js') ? process.execPath : ctcBin;
  const execArgs = ctcBin.endsWith('.js') ? [ctcBin, ...args] : args;

  const result = spawnSync(runCmd, execArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' }
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (_) {
    const match = result.stdout && result.stdout.match(/\\{[\\s\\S]*\\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch (__) {}
    }
  }

  const reportData = parsed?.data || parsed || {};
  let defectList = reportData.defects || [];

  if (options.severity && options.severity !== 'ALL') {
    defectList = defectList.filter(d => (d.severity || '').toUpperCase() === options.severity.toUpperCase());
  }
  if (options.category) {
    defectList = defectList.filter(d => (d.category || '').toUpperCase() === options.category.toUpperCase());
  }

  const remediations = defectList.map(d => ({
    defectId: d.defectId,
    category: d.category,
    severity: d.severity,
    sourceId: d.sourceId,
    targetFile: d.target?.file || d.remediation?.targetFile || null,
    composable: d.target?.composable || null,
    line: d.target?.line || d.remediation?.targetLineRange?.start || null,
    rootCause: d.diagnosis?.rootCause || 'UNKNOWN',
    explanation: d.diagnosis?.explanation || null,
    action: d.remediation?.action || null,
    suggestedReplacement: d.remediation?.suggestedReplacement || null,
    diff: d.remediation?.diff || null
  }));

  return {
    success: remediations.length === 0,
    gateOutcome: reportData.gateOutcome || (remediations.length === 0 ? 'PASS' : 'FAIL'),
    totalDefects: defectList.length,
    bySeverity: reportData.summary?.bySeverity || {},
    remediations
  };
}

if (require.main === module) {
  let rawInput = '';
  process.stdin.setEncoding('utf8');

  if (process.stdin.isTTY) {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--report' && args[i + 1]) opts.report = args[++i];
      else if (args[i] === '--severity' && args[i + 1]) opts.severity = args[++i];
      else if (args[i] === '--category' && args[i + 1]) opts.category = args[++i];
    }
    const output = runDefects(opts);
    process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
    process.exit(output.success ? 0 : 1);
  } else {
    process.stdin.on('data', chunk => { rawInput += chunk; });
    process.stdin.on('end', () => {
      let opts = {};
      try { opts = JSON.parse(rawInput); } catch (_) {}
      const output = runDefects(opts);
      process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
      process.exit(output.success ? 0 : 1);
    });
  }
}

module.exports = { runDefects };
`;

  // Skill 3: ctc-packet
  const packetSkillJson = JSON.stringify({
    name: 'ctc-packet',
    description: 'Inspect the Scoped Agent Implementation Packet for the candidate worktree, returning allowed modification paths, forbidden paths/behaviors, target composable signatures, Sol:OS grayscale tokens, and required test tags.',
    parameters: {
      type: 'object',
      properties: {
        candidate: {
          type: 'string',
          description: 'Path to candidate worktree (default: current working directory ".")'
        },
        section: {
          type: 'string',
          enum: ['all', 'boundaries', 'tokens', 'invariants', 'layout'],
          description: 'Specific packet section to inspect (default: "all")'
        }
      },
      required: []
    }
  }, null, 2) + '\n';

  const packetSkillScript = `#!/usr/bin/env node
'use strict';

/**
 * Claude Code Skill Wrapper for inspecting candidate implementation boundaries and tokens.
 */

const path = require('node:path');
const fs = require('node:fs');

function inspectPacket(options = {}) {
  const candidate = path.resolve(options.candidate || process.cwd());
  const packetJsonPath = path.join(candidate, 'agent-packet.json');

  if (!fs.existsSync(packetJsonPath)) {
    return {
      success: false,
      error: \`agent-packet.json not found in candidate root: \${candidate}. Run 'ctc agent worktree' or 'ctc agent packet' first.\`
    };
  }

  const raw = fs.readFileSync(packetJsonPath, 'utf8');
  let packet;
  try {
    packet = JSON.parse(raw);
  } catch (err) {
    return { success: false, error: \`Failed to parse agent-packet.json: \${err.message}\` };
  }

  const section = (options.section || 'all').toLowerCase();
  const result = {
    success: true,
    packetId: packet.packetId,
    screenId: packet.screenId,
    generatedAt: packet.generatedAt
  };

  if (section === 'all' || section === 'boundaries') {
    result.boundaries = {
      allowedModificationPaths: packet.targetScope?.allowedModificationPaths || [],
      forbiddenPaths: packet.targetScope?.forbiddenPaths || [],
      forbiddenBehaviors: packet.targetScope?.forbiddenBehaviors || [],
      targetFiles: packet.targetScope?.targetFiles || [],
      targetComposables: packet.targetScope?.targetComposables || []
    };
  }

  if (section === 'all' || section === 'tokens') {
    result.tokens = {
      solOsNeutralTokens: packet.designTokens?.solOsNeutralTokens || {},
      material3Mapping: packet.designTokens?.material3ColorSchemeMapping || {},
      typography: packet.designTokens?.typography || {},
      wcagRequirements: packet.designTokens?.wcagContrastRequirements || {}
    };
  }

  if (section === 'all' || section === 'invariants') {
    result.invariants = {
      summary: packet.preservationInvariants?.summary || '',
      invariants: packet.preservationInvariants?.invariants || [],
      requiredTestTags: packet.preservationInvariants?.requiredTestTags || []
    };
  }

  if (section === 'all' || section === 'layout') {
    result.layout = {
      viewports: packet.layoutConstraints?.viewports || {},
      minTouchTarget: packet.layoutConstraints?.minTouchTarget || {},
      elementLayouts: packet.layoutConstraints?.elementLayouts || []
    };
  }

  return result;
}

if (require.main === module) {
  let rawInput = '';
  process.stdin.setEncoding('utf8');

  if (process.stdin.isTTY) {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--candidate' && args[i + 1]) opts.candidate = args[++i];
      else if (args[i] === '--section' && args[i + 1]) opts.section = args[++i];
    }
    const output = inspectPacket(opts);
    process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
    process.exit(output.success ? 0 : 1);
  } else {
    process.stdin.on('data', chunk => { rawInput += chunk; });
    process.stdin.on('end', () => {
      let opts = {};
      try { opts = JSON.parse(rawInput); } catch (_) {}
      const output = inspectPacket(opts);
      process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
      process.exit(output.success ? 0 : 1);
    });
  }
}

module.exports = { inspectPacket };
`;

  return {
    'CLAUDE.md': claudeMdContent,
    '.claude/skills/ctc/ctc-verify.json': verifySkillJson,
    '.claude/skills/ctc/ctc-verify.js': verifySkillScript,
    '.claude/skills/ctc/ctc-verify/skill.json': verifySkillJson,
    '.claude/skills/ctc/ctc-verify/index.js': verifySkillScript,
    '.claude/skills/ctc/ctc-defects.json': defectsSkillJson,
    '.claude/skills/ctc/ctc-defects.js': defectsSkillScript,
    '.claude/skills/ctc/ctc-defects/skill.json': defectsSkillJson,
    '.claude/skills/ctc/ctc-defects/index.js': defectsSkillScript,
    '.claude/skills/ctc/ctc-packet.json': packetSkillJson,
    '.claude/skills/ctc/ctc-packet.js': packetSkillScript,
    '.claude/skills/ctc/ctc-packet/skill.json': packetSkillJson,
    '.claude/skills/ctc/ctc-packet/index.js': packetSkillScript,
    skills: {
      'ctc-verify': {
        path: '.claude/skills/ctc/ctc-verify',
        json: verifySkillJson,
        content: verifySkillScript,
        description: 'Run ctc verify on candidate worktree and parse structured JSON'
      },
      'ctc-defects': {
        path: '.claude/skills/ctc/ctc-defects',
        json: defectsSkillJson,
        content: defectsSkillScript,
        description: 'Run ctc defects on candidate worktree and output root causes'
      },
      'ctc-packet': {
        path: '.claude/skills/ctc/ctc-packet',
        json: packetSkillJson,
        content: packetSkillScript,
        description: 'Display allowed paths, mapped symbols, and token rules from agent-packet.json'
      }
    }
  };
}

/**
 * Generates Codex / OpenAI specification targeting docs/CODING_AGENTS.md.
 *
 * @param {object} [options={}]
 * @returns {string} Markdown specification content.
 */
function generateCodexSpec(options = {}) {
  const opts = extractHarnessOptions(options);

  return `# Coding Agent Integration Specification: OpenAI & Codex Models

This document defines the formal integration contract, system prompt, tool schemas, and execution protocol for autonomous coding agents utilizing OpenAI / Codex models (\`gpt-4o\`, \`o1\`, \`o3-mini\`, or specialized Codex fine-tunes) within the Claude to Compose (\`ctc\`) design-retrofit compiler system.

---

## 1. Architectural Model & Operating Environment

### 1.1 Candidate Worktree Confinement
Coding agents never execute against the pristine baseline Android repository. Before an agent is invoked, the \`ctc\` CLI provisions an isolated descendant Git worktree via:
\`\`\`bash
node bin/ctc.js agent worktree \\
  --android <baseline-repo> \\
  --workspace <workspace-dir> \\
  --branch retrofit/<screen-id> \\
  --output <candidate-worktree-dir>
\`\`\`
The coding agent is launched with its working directory set to \`<candidate-worktree-dir>\`.

### 1.2 Dual Implementation Packet Representation
At the candidate worktree root, \`ctc\` seeds:
1. \`agent-packet.json\`: Machine-readable contract conforming to JSON Schema Draft 2020-12. Contains exact AST symbol mappings, \`allowedModificationPaths\`, \`forbiddenPaths\`, \`forbiddenBehaviors\`, Sol:OS design tokens, layout bounds, and verification commands.
2. \`AGENT_PACKET.md\`: A context-bounded (< 300 lines) human- and LLM-optimized summary containing the objective, boundary rules, and target composable signatures.

---

## 2. The 8-Phase Execution Contract

Any OpenAI / Codex coding agent operating within \`ctc\` must execute in strict adherence to the following 8-phase contract:

\`\`\`
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
  6. Execute Verify Gate  Run \`node bin/ctc.js verify --candidate . --json\`
        │
        ├───[Status: PASS]───► 8. Emit Honest Completion Receipt (Exit 0)
        │
        ▼
  7. Diagnose & Remediate Run \`node bin/ctc.js defects --report <path>\`
        │                 Apply inverse offset/padding adjustments
        │                 Re-run Phase 6 (Max 3 iterations)
        ▼
  [Blocking Condition]    8. Emit Honest Blocker Report (Exit 2)
                          NEVER tamper with tests/tolerances to force green!
\`\`\`

### Phase 1: Ingest Packet
- Read \`agent-packet.json\` and \`AGENT_PACKET.md\` to extract allowed modification paths, forbidden paths, design tokens, and invariants.

### Phase 2: Verify AST Symbols
- Inspect target Kotlin composables to confirm parameter signatures (\`uiState\`, \`onAction\`, \`onNavigateBack\`).

### Phase 3: Enforce Boundaries (\`allowedPaths\`)
- Confine all code changes strictly within \`implementationBoundary.allowedPaths\`. Edits outside trigger immediate \`BOUNDARY_VIOLATION\` rejection.

### Phase 4: Domain Logic Preservation
- Preserve Room SQLite queries, 500ms debounced autosave, StateFlow state flows, and all \`NoteAppTestTags\`.

### Phase 5: Apply Compose Retrofit
- Implement styling with pre-calibrated Sol:OS tokens (\`--os-0\` to \`--os-1000\`).
- Ensure native 60Hz-120Hz fluid framerate with zero EPD waveforms or \`ACTION_REFRESH_SCREEN\` broadcasts.
- Ensure >= 48dp invisible hit-slop via \`Modifier.minimumInteractiveComponentSize()\`.

### Phase 6: Execute Verification Gate
- Run candidate verification: \`node bin/ctc.js verify --candidate . --json\`.

### Phase 7: Diagnose & Remediate Structured Defects
- If verification fails (Exit Code 1), run \`node bin/ctc.js defects --report .ctc/reports/verification-report.json --json\`.
- Apply inverse offset/padding adjustments: reduce parent padding by \`floor(dy / density)\`.

### Phase 8: Honest Reporting & Anti-Tampering
- Under NO circumstances mutate verification thresholds, test assertions, or golden reference images.
- If blocked, report \`BLOCKED\` honestly with exact diagnostic receipts.

---

## 3. Structured System Prompt for OpenAI / Codex Models

\`\`\`text
You are an autonomous Jetpack Compose Retrofit Coding Agent specialized in the Daylight Computer (DC1) LivePaper platform and the Claude to Compose (ctc) compiler architecture.

Your objective is to restyle and restructure existing Android Jetpack Compose UI composables to match approved Claude Design specifications while strictly preserving existing business behavior, database persistence, ViewModel state flows, navigation architecture, and accessibility telemetry.

OPERATIONAL INVARIANTS:
1. CANDIDATE WORKTREE CONFINEMENT:
   You are operating in an isolated candidate Git worktree. You must NEVER attempt to modify files outside the directory hierarchy of this worktree.

2. MANDATORY FIRST STEP:
   You must read \`agent-packet.json\` and \`AGENT_PACKET.md\` at your current root before reading or editing any application source code.

3. STRICT BOUNDARY ENFORCEMENT:
   You are ONLY permitted to edit files explicitly listed in \`targetScope.allowedModificationPaths\` (or contract \`implementationBoundary.allowedPaths\`).
   You are STRICTLY FORBIDDEN from editing or deleting files matching \`targetScope.forbiddenPaths\`, including:
   - Room databases, entities, converters, DAOs (e.g., \`data/**\`)
   - ViewModels, reducers, and Action sealed classes (e.g., \`presentation/**ViewModel*.kt\`, \`presentation/**Action*.kt\`)
   - Navigation hosts, graphs, and destinations (e.g., \`navigation/**\`)
   - Unit tests, Robolectric tests, and Gradle build configurations (\`build.gradle.kts\`, \`settings.gradle.kts\`)
   Any modification outside permitted boundaries will cause immediate candidate verification failure (Exit Code 3).

4. DOMAIN LOGIC PRESERVATION:
   - Do NOT replace Room database persistence with dummy lists, in-memory mocks, or fake repositories.
   - Do NOT alter ViewModel coroutine debounce durations (e.g., 500ms autosave).
   - Do NOT disconnect UI events: callers must remain bound to \`onAction(NoteEditorAction.*)\` lambdas.
   - Do NOT remove \`Modifier.testTag(NoteAppTestTags.*)\`: all existing test tags must remain bound to corresponding interactive nodes.

5. DAYLIGHT DC1 LIVEPAPER HARDWARE RULES:
   - Architecture: Custom transflective/reflective LCD (LivePaper). Refresh rate: 60Hz–120Hz (silky smooth, full fluid framerate).
   - NEVER treat the display as EPD or E-Ink: There are NO microcapsules, NO particle waveforms, and ZERO ghosting.
   - STRICTLY FORBIDDEN: Never broadcast \`ACTION_REFRESH_SCREEN\`, never trigger waveform clear flashes, and never introduce artificial pauses or delays on modal dismissal.
   - 8-bit Grayscale Neutral Tokens (from tokens/colors.css):
     * \`--os-0\`: #FFFFFF (Base paper canvas)
     * \`--os-50\`: #F7F7F7 (Surface panels / cards)
     * \`--os-100\`: #DCD5C9 (Hairline borders, 1dp)
     * \`--os-150\`: #F5F5F5 (Recessed canvas / input fields)
     * \`--os-200\`: #CCCCCC (Disabled controls / inactive chips)
     * \`--os-300\`: #858585 (Tertiary text / placeholder ink)
     * \`--os-400\`: #535353 (Secondary body ink / icons)
     * \`--os-800\`: #343434 (Dark fields / pressed state ink)
     * \`--os-900\`: #1A1A1A (Primary text ink / headlines)
     * \`--os-1000\`: #000000 (Max black ink / focus rings)
     * Brand Grays: Yellow -> #CECECE, Amber -> #9D9D9E, Orange -> #6C6C6D
   - Contrast Standards: WCAG 2.1 AAA compliance (>= 7.0:1 for normal text, >= 4.5:1 for large text).
   - Touch Targets: Minimum 48dp x 48dp using invisible hit-slop (\`Modifier.minimumInteractiveComponentSize()\`).
   - Coordinate Inset: Display hardware features an 8px hardware coordinate inset.

6. VERIFICATION & DEFECT REMEDIATION LOOP:
   - After implementing changes, execute the candidate verification pipeline:
     \`node bin/ctc.js verify --candidate . --json\`
   - If verification fails, inspect the JSON output or run:
     \`node bin/ctc.js defects --report .ctc/reports/verification-report.json --json\`
   - Apply inverse offset adjustments for layout drift:
     If telemetry reveals an element is displaced vertically by +N px, compute delta_dp = round(N / density) and decrease the parent padding or offset by delta_dp.
   - Re-run verification until all stages pass (Exit Code 0).

7. ANTI-TAMPERING & HONEST BLOCKING:
   - You MUST NOT mutate verification thresholds, tolerance budgets, test assertion files, or golden reference images to force a pass.
   - If an approved redesign cannot be achieved without violating domain boundaries or database invariants, you MUST halt and report status \`BLOCKED\` with an explicit description of the blocking invariant.
\`\`\`

---

## 4. OpenAI Tool Calling Schemas

\`\`\`json
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
\`\`\`

---

## 5. Honest Blocking & Escalation Protocol

If an agent encounters an unresolvable conflict:
- **Condition A**: Design requires persisting a new field not present in the entity, but entities are in \`forbiddenPaths\`.
- **Condition B**: Design requires dropping back navigation, violating invariant \`INV-BACK-NAVIGATION\`.
- **Protocol**:
  1. The agent must NEVER create in-memory static variables or mocks to fake persistence.
  2. The agent must NEVER delete tests or weaken assertions.
  3. The agent calls \`report_completion\` with status \`BLOCKED\` and detailed blocker descriptions.
`;
}

/**
 * Generates Antigravity native skill targeting skills/claude-to-compose/SKILL.md.
 *
 * @param {object} [options={}]
 * @returns {string} Markdown skill content.
 */
function generateAntigravitySkill(options = {}) {
  return `---
name: claude-to-compose
description: Autonomous design retrofit compiler and verification harness for existing Jetpack Compose applications targeting Daylight Computer (DC1) LivePaper.
---

# Claude to Compose (\`ctc\`): Antigravity Retrofit & Verification Skill

The \`claude-to-compose\` (\`ctc\`) skill enables Antigravity agents to inspect existing functional Android applications, ingest approved Claude Design redesigns, synthesize native Jetpack Compose UI with Sol:OS 8-bit grayscale tokens, and execute an automated, fail-closed verification loop on Daylight Computer (DC1) LivePaper hardware.

---

## 1. Core Architecture & Operating Modes

\`ctc\` operates under two modes, with **Retrofit Mode** as the primary:
1. **Retrofit Mode (Primary)**: Takes an existing, functional Android application and an approved Claude Design specification, generates correspondence mappings, scaffolds an isolated descendant Git worktree, and restyles presentation composables while strictly preserving domain architecture, Room databases, ViewModel state flows, back navigation, and test tags.
2. **Greenfield Mode (Secondary)**: Synthesizes standalone Compose screens and M3 theme bundles when no pre-existing Android codebase exists.

### Slash Command Workflow: \`/claude-to-compose\`
When invoked via the \`/claude-to-compose\` slash command, Antigravity agents execute the autonomous compiler pipeline across three high-level phases:
- **Extraction**: Inspects existing Android application AST, captures design artifacts, and builds formal 4-layer design contracts.
- **Synthesis**: Restyles and synthesizes Jetpack Compose UI with Sol:OS 8-bit grayscale tokens, strictly confined to candidate worktree boundaries.
- **Verification**: Executes the progressive 6-stage verification gate on Daylight Computer (DC1) LivePaper hardware and runs the causal defect oracle for iterative remediation.

---

## 2. The 8-Stage Retrofit Workflow

Antigravity agents execute retrofits through an 8-stage sequence powered by the local \`ctc\` CLI (\`bin/ctc.js\`):

\`\`\`
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
  Stage 6: Agent Worktree  node bin/ctc.js agent worktree --android <app> --branch <b\> --output <wt>
              │
              ▼
  Stage 7: Verify Gate     node bin/ctc.js verify <screen> --candidate <wt> --json
              │
              ├───[PASS]───► Certify & Merge Worktree
              │
              ▼
  Stage 8: Causal Defects  node bin/ctc.js defects --report <report.json> --json
                           (Apply inverse geometric offsets & re-verify)
\`\`\`

### Stage 1: Preflight (\`ctc doctor\`)
Validates local system prerequisites:
- Node.js >= 18.0.0
- Playwright browser binaries
- JDK 17 (Java Virtual Machine)
- Android SDK (\`ANDROID_HOME\`, \`adb\`)
- Connected Daylight Computer (DC1) tablet (\`rooted 3\` / \`rooted 4\`) with root access (\`su 0\`).
\`\`\`bash
node bin/ctc.js doctor --json
\`\`\`

### Stage 2: Workspace Init & Baseline (\`ctc init\`, \`ctc baseline\`)
Initializes the \`.ctc/\` workspace directory and records an immutable baseline snapshot of the unmodified Android project:
- Verifies Git working tree is clean.
- Executes \`./gradlew compileDebugKotlin\` and \`./gradlew testDebugUnitTest\`.
- Captures test results, commit hash, and build artifacts into \`app-baseline.json\`.
\`\`\`bash
node bin/ctc.js init
node bin/ctc.js baseline ./fixtures/note-app --json
\`\`\`

### Stage 3: Lexical App Inspection (\`ctc inspect-app\`)
Parses the target Android application AST:
- Discovers composable screens, navigation routes (\`NoteAppDestination\`), ViewModels (\`NoteEditorViewModel\`), actions (\`NoteEditorAction\`), Room DAOs (\`NoteDao\`), and UI test tags (\`NoteAppTestTags\`).
- Identifies behavior invariants: 500ms debounced autosave, Room persistence, and back navigation.
- Emits \`existing-app-model.json\`.
\`\`\`bash
node bin/ctc.js inspect-app ./fixtures/note-app --json
\`\`\`

### Stage 4: Design Contract Extraction (\`ctc capture\`, \`ctc contract build\`)
Extracts a 4-layer immutable design contract from the Claude Design artifact:
- **Layer 1 (Measured Scene)**: Absolute bounding boxes, paint order, baseline offsets, font resources.
- **Layer 2 (Inferred Layout Intent)**: Flex/Row/Column/Box topology, gaps, padding, and responsive breakpoints (1184 x 1584 portrait, 1584 x 1184 landscape).
- **Layer 3 (Behavior Contract)**: Gesture dynamics, focus transitions, loading/empty states.
- **Layer 4 (Design System)**: Sol:OS 8-bit neutral tokens (\`--os-0\` to \`--os-1000\`) and WCAG AAA contrast rules.
\`\`\`bash
node bin/ctc.js capture ./fixtures/claude_design_bundle --screen note_editor --json
node bin/ctc.js contract build note_editor --json
\`\`\`

### Stage 5: Correspondence Mapping & Migration Planning (\`ctc map\`, \`ctc plan\`)
Establishes 1:1 correspondences between Claude Design elements and existing Kotlin symbols:
- Maps design nodes to composable functions and UI state properties.
- Defines strict \`allowedModificationPaths\` (e.g. \`app/src/main/java/com/claude/noteapp/ui/editor/**\`).
- Designates \`forbiddenPaths\` (DAOs, Room database, ViewModels, navigation).
- Emits \`correspondence.json\` and \`migration-plan.json\`.
\`\`\`bash
node bin/ctc.js map .ctc/designs/note_editor/contract/design-contract.json ./fixtures/note-app --screen note_editor --json
node bin/ctc.js plan .ctc/designs/note_editor/mapping/correspondence.json --screen note_editor --json
\`\`\`

### Stage 6: Automated Worktree Scaffolding (\`ctc agent worktree\`)
Provisions an isolated Git worktree branched off the clean baseline commit and seeds coding agent contexts:
- Executes \`git worktree add -b <branch> <output> HEAD\`.
- Seeds \`.ctc-workspace.json\` marker.
- Generates \`agent-packet.json\` (Draft 2020-12) and \`AGENT_PACKET.md\` (< 300 lines) at candidate root.
- Scaffolds harness rules (\`.cursorrules\`, \`.cursor/rules/ctc-retrofit.mdc\`, \`CLAUDE.md\`, \`.claude/skills/ctc/\`).
\`\`\`bash
node bin/ctc.js agent worktree \\
  --android ./fixtures/note-app \\
  --workspace . \\
  --branch retrofit/note_editor \\
  --output ./worktrees/candidate_note_editor \\
  --screen note_editor \\
  --json
\`\`\`

### Stage 7: 6-Stage Progressive Verification (\`ctc verify\`)
Executes the fail-closed verification pipeline on the candidate worktree:
1. **Stage 1: Schema & Worktree Provenance**: Verifies descendant worktree ancestry, clean baseline, symlink audit, and strict \`allowedPaths\` confinement.
2. **Stage 2: Android Compilation & Contrast**: Executes \`./gradlew compileDebugKotlin\` and evaluates Sol:OS 8-bit grayscale contrast (WCAG AAA >= 7.0:1 for normal text).
3. **Stage 3: Layout Telemetry & Touch Geometry**: Asserts all 11 \`NoteAppTestTags\` exist and validates >= 48dp invisible hit-slop.
4. **Stage 4: Perceptual Metrics & Invariants**: Evaluates Sobel edge contour alignment (>= 85%), MSSIM (>= 0.72), Ink Dice (>= 0.85), spatial drift (<= 3.0px), and verifies Room autosave unit tests pass.
5. **Stage 5: Behavioral Scenario Replay**: Replays interaction states and portrait/landscape rotations.
6. **Stage 6: DC1 Hardware Qualification**: Deploys APK to connected DC1 tablet and verifies zero EPD waveform flashes.
\`\`\`bash
node bin/ctc.js verify note_editor --app-dir ./fixtures/note-app --candidate ./worktrees/candidate_note_editor --json
\`\`\`

### Stage 8: Causal Defect Diagnosis (\`ctc defects\`)
When verification fails (Exit Code 1), the Defect Oracle attributes discrepancies to root causes:
- Attributes errors to stable element IDs (e.g., \`daylight#note_editor/title_input\`).
- Diagnoses root causes (\`PARENT_INSET_ACCUMULATION\`, \`THEME_TOKEN_MISREFERENCE\`, \`TOUCH_TARGET_TOO_SMALL\`).
- Emits actionable AST directives and inverse offset/padding adjustments.
\`\`\`bash
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
\`\`\`

---

## 3. Daylight Computer (DC1) LivePaper Hardware Profile

### 3.1 Display Architecture (LivePaper)
- **Technology**: Custom **Reflective LCD / Transflective LCD** (Sharp NT36523N LivePaper).
- **Refresh Rate**: Native **60Hz to 120Hz** (silky smooth, full fluid framerate).
- **Color Depth**: **8-bit Grayscale (256 discrete levels of gray)**, monochrome.
- **Physical Characteristics**: Reflects ambient light (sunlight readable, zero blue light), illuminated by pure amber frontlight.
- **Display Pipeline**: Driven by standard Android \`SurfaceFlinger\`, \`Choreographer\`, \`VSYNC\`, Skia/HWUI rendering with GPU double/triple buffering.

### 3.2 ZERO EPD / E-Ink Workarounds — STRICT PROHIBITIONS
You must NEVER treat, describe, or program for the DC1 as an Electronic Paper Display (EPD) or E-Ink panel.
- **NO Waveforms or Particle Refreshes**: There are NO microcapsules or electrophoretic particles.
- **NO Ghosting / Artifacting**: The panel has zero physical ghosting.
- **NEVER use E-ink Screen Flash Hooks**: Never broadcast \`ACTION_REFRESH_SCREEN\`, never trigger waveform clear flashes, and never introduce artificial pauses or delays on modal dismissal.

### 3.3 Official Daylight Sol:OS Grayscale Scale
Always use the pre-calibrated Sol:OS neutral scale from \`tokens/colors.css\`:
- \`--os-0\`: \`#FFFFFF\` (Base paper / ground)
- \`--os-50\`: \`#F7F7F7\` (Surface panels / cards)
- \`--os-100\`: \`rgba(0,0,0,0.08)\` / \`#DCD5C9\` (Hairline borders, 1dp)
- \`--os-150\`: \`#F5F5F5\` (Recessed canvas / input fields)
- \`--os-200\`: \`#CCCCCC\` (Disabled controls / inactive chips)
- \`--os-300\`: \`#858585\` (Low emphasis / tertiary text)
- \`--os-400\`: \`#535353\` (Secondary text ink / icons)
- \`--os-800\`: \`#343434\` (Dark fields / pressed states)
- \`--os-900\`: \`#1A1A1A\` (Primary text ink / headlines)
- \`--os-1000\`: \`#000000\` (Max black ink / focus rings)
- **Calibrated Brand Grays**: Yellow -> \`#CECECE\`, Amber -> \`#9D9D9E\`, Orange -> \`#6C6C6D\`.

### 3.4 Kinematics & Touch Modeling
- **Hardware Coordinate Inset**: Active display incorporates a **+8px hardware coordinate inset**. Touch coordinates must account for this boundary.
- **Capacitive Touch Modeling**: Linux Multi-Touch Protocol B (\`/dev/input/event2\`). Uses Minimum Jerk velocity profiles, contact ellipse deformation, and Fitts's Law duration.
- **Stylus Digitizer**: Wacom I2C Digitizer (\`/dev/input/event4\`) supporting 4096 pressure levels and tilt ([-9000, 9000]).
- **Latency Standards**: Sub-frame (<16ms) response for physical keyboard events (\`<Esc>\`, \`<Enter>\`, \`<1>\`, \`<2>\`). Fluid 60fps/120fps animations.
- **Touch Target Compliance**: >= 48dp x 48dp touch targets implemented via invisible hit-slop (\`Modifier.minimumInteractiveComponentSize()\`), never inflating visual container bounds.

### 3.5 Connected Hardware & Device Concurrency
- **\`rooted 3\`**: Serial \`JMBR00380\` (Model: DC_1, Product: vext_jagar, Rooted via \`su 0\`)
- **\`rooted 4\`**: Serial \`JMBR00405\` (Model: DC_1, Product: vext_jagar, Rooted via \`su 0\`)
- **Concurrency Etiquette**: When multiple agents or threads are running, check status via \`daylight_fleet_status\`. If one tablet is leased or busy, target the other device. Never issue conflicting input streams or reboot a device in active use.

---

## 4. Antigravity Tool Patterns & MCP Integrations

### 4.1 Shell Command Execution Patterns (\`run_command\`)
Execute all \`ctc\` CLI commands with the \`--json\` flag to enable deterministic output parsing:
\`\`\`bash
node bin/ctc.js doctor --json
node bin/ctc.js baseline ./fixtures/note-app --json
node bin/ctc.js inspect-app ./fixtures/note-app --json
node bin/ctc.js verify note_editor --app-dir ./fixtures/note-app --candidate ./worktrees/candidate_note_editor --json
node bin/ctc.js defects --report .ctc/reports/verification-report.json --json
\`\`\`

### 4.2 Standard Exit Code Protocol
| Exit Code | Status | Meaning | Agent Action |
|---|---|---|---|
| \`0\` | \`PASS\` | All stages passed cleanly | Proceed to merge / certification |
| \`1\` | \`FAIL\` | Verification failure / regression | Invoke \`ctc defects\` and apply inverse remediation |
| \`2\` | \`BLOCKED\` | Missing baseline, unapproved deviation | Halt and report blocker; request human approval |
| \`3\` | \`INPUT_INVALID\` | Argument error, path traversal, boundary breach | Fix arguments or confine edits to \`allowedPaths\` |
| \`4\` | \`INFRASTRUCTURE_ERROR\` | Missing binary, device disconnect | Reconnect device or check toolchain |

### 4.3 Daylight QA MCP Tool Integrations
- \`daylight_fleet_status\`: Query connected DC1 tablets and check exclusive concurrency leases.
- \`daylight_touch_tap\`: Biomechanically modeled touch tap with +8px inset compensation.
- \`daylight_touch_swipe\`: Ergonomic thumb arc swipe following CMC joint pivot kinematics.
- \`daylight_micro_scroll\`: Human reading scroll dynamics with perpendicular Gaussian micro-tremor.
- \`daylight_wacom_stroke\`: High-precision stylus stroke (4096 pressure levels, tilt X/Y).
- \`daylight_capture_screen\`: Capture LivePaper frame and evaluate 8-bit contrast and Sol:OS tokens.
- \`daylight_query_ui\`: Inspect Android UI Automator accessibility tree for test tags and click centers.
- \`daylight_closed_loop_step\`: Atomic Action -> Settle (150ms) -> Screencap & Hierarchy -> Evaluate cycle.

---

## 5. Anti-Patterns & Prohibitions
1. **NO Greenfield Overwriting in Retrofit Mode**: Never overwrite existing app modules with disconnected demo scaffolds.
2. **NO Modifying Domain or Storage Architecture**: Never alter Room DAOs, database schemas, ViewModel state flows, or event contracts.
3. **NO EPD Flash Hooks or Waveform Delays**: Never use \`ACTION_REFRESH_SCREEN\` or artificial pauses.
4. **NO Raw Hex Colors**: Never embed arbitrary hex codes; use pre-calibrated Sol:OS neutral tokens (\`--os-0\` to \`--os-1000\`).
5. **NO Sub-48dp Touch Targets**: Never render interactive controls without >= 48dp hit-slop.
6. **NO Mutating Verification Tolerances**: Never tamper with golden references or failure budgets to force green.
`;
}

/**
 * Atomically scaffolds coding agent harness files to a target directory.
 *
 * @param {string} targetDir - Destination root directory.
 * @param {object} [options={}] - Configuration options.
 * @param {string} [options.env='all'] - 'cursor' | 'claude' | 'codex' | 'antigravity' | 'candidate' | 'all'
 * @param {boolean} [options.updateGitExclude=true] - Whether to register files in .git/info/exclude
 * @returns {object} Summary object with written files and status.
 */
function scaffoldAllHarnesses(targetDir, options = {}) {
  const resolvedTarget = resolveExplicit(targetDir, 'target directory');
  rejectDangerousRoot(resolvedTarget, 'target directory');

  const env = (options.env || 'all').toLowerCase();
  const opts = extractHarnessOptions(options);

  const filesToWrite = {};

  if (env === 'cursor' || env === 'candidate' || env === 'all') {
    const cursorFiles = generateCursorRules(opts);
    Object.assign(filesToWrite, cursorFiles);
  }

  if (env === 'claude' || env === 'candidate' || env === 'all') {
    const claudeFiles = generateClaudeCodeHarness(opts);
    for (const [relPath, content] of Object.entries(claudeFiles)) {
      if (relPath !== 'skills' && typeof content === 'string') {
        filesToWrite[relPath] = content;
      }
    }
  }

  if (env === 'codex' || env === 'all') {
    filesToWrite['docs/CODING_AGENTS.md'] = generateCodexSpec(opts);
  }

  if (env === 'antigravity' || env === 'all') {
    filesToWrite['skills/claude-to-compose/SKILL.md'] = generateAntigravitySkill(opts);
  }

  const filesWritten = [];

  for (const [relPath, content] of Object.entries(filesToWrite)) {
    const absPath = path.join(resolvedTarget, relPath);
    const parentDir = path.dirname(absPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    atomicWriteNoFollow(absPath, content);
    if (relPath.endsWith('.js') && relPath.includes('.claude/skills/')) {
      try {
        fs.chmodSync(absPath, 0o755);
      } catch (_) {}
    }
    filesWritten.push(relPath.replace(/\\/g, '/'));
  }

  let gitExcludeUpdated = false;
  if (options.updateGitExclude !== false) {
    try {
      const gitCommonDir = gitCommonDirectory(resolvedTarget);
      const infoDir = path.join(gitCommonDir, 'info');
      if (!fs.existsSync(infoDir)) {
        fs.mkdirSync(infoDir, { recursive: true });
      }
      const excludeFile = path.join(infoDir, 'exclude');
      const existing = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
      const toAdd = HARNESS_EXCLUDE_PATTERNS.filter(p => !existing.includes(p));
      if (toAdd.length > 0) {
        const suffix = existing.endsWith('\n') || existing === '' ? '' : '\n';
        fs.writeFileSync(excludeFile, existing + suffix + toAdd.join('\n') + '\n', 'utf8');
        gitExcludeUpdated = true;
      }
    } catch (_) {
      // If target is not inside a git repository, silently ignore
    }
  }

  return {
    success: true,
    targetDir: resolvedTarget,
    env,
    screenId: opts.screenId,
    filesWritten,
    gitExcludeUpdated
  };
}

module.exports = {
  HARNESS_EXCLUDE_PATTERNS,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_VERIFICATION_COMMANDS,
  extractHarnessOptions,
  generateCursorRules,
  generateClaudeCodeHarness,
  generateCodexSpec,
  generateAntigravitySkill,
  scaffoldAllHarnesses
};
