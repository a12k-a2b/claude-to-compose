/**
 * src/agent/markdown_formatter.js
 *
 * Markdown Formatter for Scoped Agent Implementation Packet (AGENT_PACKET.md).
 *
 * Produces instruction-dense, context-bounded markdown (< 300 lines) designed
 * for LLM coding agents.
 */

'use strict';

/**
 * Formats an Agent Implementation Packet into context-bounded Markdown (< 300 lines).
 *
 * @param {object} packetData Structured packet data
 * @returns {string} Formatted AGENT_PACKET.md string
 */
function formatAgentPacketMarkdown(packetData = {}) {
  if (!packetData || typeof packetData !== 'object') return '';
  const screenId = packetData.screenId || 'note_editor';
  const targetScope = packetData.targetScope || {};
  const allowedPaths = targetScope.allowedModificationPaths || ['app/src/main/java/com/claude/noteapp/ui/editor/**'];
  const forbiddenPaths = targetScope.forbiddenPaths || ['app/src/main/java/com/claude/noteapp/data/**', 'app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt'];
  const forbiddenBehaviors = targetScope.forbiddenBehaviors || [
    'DO NOT replace Room SQLite queries with mock lists or in-memory stubs.',
    'DO NOT alter ViewModel debounce timing (500ms) or state flow emissions.',
    'DO NOT remove, rename, or drop Modifier.testTag attributes.',
    'DO NOT introduce EPD clear hooks or waveform broadcasts (ACTION_REFRESH_SCREEN).',
    'DO NOT tamper with verification thresholds or golden reference images to mask failures.'
  ];

  const allowedList = allowedPaths.map(p => `- \`${p}\``).join('\n');
  const forbiddenList = forbiddenPaths.map(p => `- \`${p}\``).join('\n');
  const behaviorsList = forbiddenBehaviors.map((b, i) => `${i + 1}. ${b}`).join('\n');

  const targetComposable = targetScope.targetComposables?.[0] || {};
  const targetFile = targetScope.targetFiles?.[0]?.path || targetComposable.filePath || `app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt`;
  const compName = targetComposable.composableName || 'NoteEditorScreen';
  const compSig = targetComposable.signature || `@Composable\nfun ${compName}()`;
  const compPkg = targetComposable.symbol && targetComposable.symbol.includes('.')
    ? targetComposable.symbol.split('.').slice(0, -1).join('.')
    : 'com.claude.noteapp.ui.editor';

  return `# Agent Implementation Packet: \`${screenId}\` Retrofit

**Target Hardware**: Daylight Computer (DC1) — Sharp NT36523N Transflective LCD (LivePaper)
**Display Profile**: 8-bit Grayscale (256 discrete levels), 60Hz–120Hz Fluid Framerate, Amber Frontlight
**Strict Hardware Rule**: NO EPD/E-ink waveforms, NO electrophoretic screen flashes (\`ACTION_REFRESH_SCREEN\`), zero artificial modal dismissal delays.
**Integrity Mode**: Strict Fail-Closed Verification

---

## 1. Operational Scope & Modification Boundaries

### ✅ ALLOWED Modification Paths (Touch ONLY these paths)
${allowedList}

### ❌ FORBIDDEN Paths (DO NOT TOUCH — Instant Failure)
${forbiddenList}

### ⛔ FORBIDDEN Behaviors
${behaviorsList}

---

## 2. Target Composable Signature

You must retrofit the UI Composable in \`${targetFile}\` while preserving its exact public signature:

\`\`\`kotlin
package ${compPkg}

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

${compSig}
\`\`\`

**Implementation Rules**:
- The composable must remain a **pure, stateless presentation composable**.
- Hoisted state flows down via parameters; user edits dispatch up via actions/lambdas.
- Navigation events must invoke dedicated navigation callbacks.
- Do NOT inject or instantiate ViewModel or persistent state holders inside this composable.

---

## 3. Daylight Sol:OS Design Tokens & Material 3 Mapping

The DC1 LivePaper screen is an **8-bit reflective LCD** (not E-ink). Use the pre-calibrated Sol:OS neutral grayscale scale:

| Sol:OS Token | Hex Value | Compose Color | Sol:OS Role | Material 3 Property |
|---|---|---|---|---|
| \`--os-0\` | \`#FFFFFF\` | \`Color(0xFFFFFFFF)\` | Base paper ground / canvas | \`background\`, \`surface\` |
| \`--os-50\` | \`#F7F7F7\` | \`Color(0xFFF7F7F7)\` | Surface panels / cards | \`surfaceVariant\` |
| \`--os-100\` | \`#DCD5C9\` | \`Color(0xFFDCD5C9)\` | Hairline borders (1dp) | \`outline\`, \`outlineVariant\` |
| \`--os-150\` | \`#F5F5F5\` | \`Color(0xFFF5F5F5)\` | Recessed canvas / input fields | \`surfaceContainerLowest\` |
| \`--os-200\` | \`#CCCCCC\` | \`Color(0xFFCCCCCC)\` | Disabled controls / inactive chips | \`onSurfaceDisabled\` |
| \`--os-300\` | \`#858585\` | \`Color(0xFF858585)\` | Tertiary text / placeholder ink | \`onSurfaceVariant\` |
| \`--os-400\` | \`#535353\` | \`Color(0xFF535353)\` | Secondary body ink / icons | \`secondary\` |
| \`--os-800\` | \`#343434\` | \`Color(0xFF343434)\` | Dark fields / pressed state ink | \`primaryContainer\` |
| \`--os-900\` | \`#1A1A1A\` | \`Color(0xFF1A1A1A)\` | Primary text ink / headlines | \`onBackground\`, \`onSurface\` |
| \`--os-1000\`| \`#000000\` | \`Color(0xFF000000)\` | Max black ink / focus rings | \`primary\` |

### Typography Specifications
- **Headlines / Title**: \`ABC Arizona Flare\` (Serif/Flare), \`FontWeight.Bold\`, 28sp / 34sp leading, ink \`--os-900\` (\`#1A1A1A\`). Contrast on white: **15.5:1** (AAA Pass).
- **Body / Content**: \`ABC Arizona Sans\` (Sans-Serif), \`FontWeight.Normal\`, 16sp / 24sp leading, ink \`--os-400\` (\`#535353\`). Contrast on white: **7.0:1** (AAA Pass).
- **Status / Chips**: \`ABC Arizona Sans\`, \`FontWeight.Medium\`, 12sp / 16sp leading, ink \`--os-300\` (\`#858585\`).

---

## 4. Preservation Invariants Checklist

Before finalizing changes, verify every invariant below:

- [ ] **ViewModel StateFlow**: StateFlow uiState emits state changes without interruption.
- [ ] **Debounced Autosave**: Title and content changes dispatch actions which debounce for exactly **500ms** before Room DB persistence.
- [ ] **Room DAO Queries**: NoteDao queries remain untouched; IDs and timestamps are preserved.
- [ ] **TestTags Intact**: Every tag below is attached to its designated element via \`Modifier.testTag(NoteAppTestTags.<TAG>)\`:
  - \`SCREEN_NOTE_EDITOR\` (\`"screen_note_editor"\`) on root Scaffold/Box
  - \`EDITOR_BACK_BUTTON\` (\`"editor_back_button"\`) on top navigation back button
  - \`EDITOR_PIN_BUTTON\` (\`"editor_pin_button"\`) on top bar pin icon button
  - \`EDITOR_SAVE_BUTTON\` (\`"editor_save_button"\`) on manual save icon/button
  - \`EDITOR_DELETE_BUTTON\` (\`"editor_delete_button"\`) on delete icon button
  - \`EDITOR_TITLE_INPUT\` (\`"editor_title_input"\`) on title text input field
  - \`EDITOR_CONTENT_INPUT\` (\`"editor_content_input"\`) on body content text input field
  - \`EDITOR_TAGS_ROW\` (\`"editor_tags_row"\`) on tag chips container
  - \`EDITOR_ADD_TAG_BUTTON\` (\`"editor_add_tag_button"\`) on add tag button
  - \`EDITOR_ADD_TAG_INPUT\` (\`"editor_add_tag_input"\`) on tag input dialog/field
  - \`EDITOR_STATUS_INDICATOR\` (\`"editor_status_indicator"\`) on autosave status indicator text

---

## 5. DC1 Layout Constraints & Breakpoint Bounding Boxes

- **Active Logical Viewport**:
  - Portrait: \`1184 x 1584 px\` (\`592 x 792 dp\` at 2.0x density)
  - Landscape: \`1584 x 1184 px\` (\`792 x 592 dp\` at 2.0x density)
- **Physical Panel Inset**: Hardware coordinate offset is \`+8px\` left, \`+8px\` top (\`PhysicalLeft = 8\`, \`PhysicalTop = 8\`).
- **Touch Target Requirement**: Every interactive button, chip, or clickable zone must have hit-slop of at least **48dp x 48dp** (\`96 x 96 px\`), even if visual hairline icons are smaller.

---

## 6. Verification Commands & Quality Gate Failure Budgets

Run these deterministic verification commands in sequence to verify your implementation:

\`\`\`bash
# 1. Compile Kotlin sources
./gradlew compileDebugKotlin --no-daemon

# 2. Run unit and behavior preservation tests
./gradlew testDebugUnitTest --no-daemon

# 3. Execute ctc progressive verification pipeline
node bin/ctc.js verify --screen ${screenId} --profile daylight-dc1

# 4. Check for causal defects
node bin/ctc.js defects --screen ${screenId} --format json
\`\`\`

### Quality Gate Failure Budgets
- **Spatial Drift**: $\\le 3.0\\text{px}$ maximum spatial drift Euclidean distance ($\\sqrt{\\Delta x^2 + \\Delta y^2}$)
- **Baseline Vertical Alignment**: $|\\Delta y_{\\text{baseline}}| \\le 2.0\\text{px}$
- **Foreground Ink IoU**: $\\ge 85.0\\%$
- **Contrast Ratios**: $\\ge 7.0:1$ for normal text, $\\ge 4.5:1$ for large text (WCAG AAA)
- **Negative Margin Shift Gate**: Shifts $\\ge 10\\text{px}$ trigger hard fail (\`GEOMETRY_DRIFT\`)

### ⚠️ Anti-Tampering Directive
**DO NOT modify verification thresholds, tolerance margins, test assertion values, or golden reference files to make test failures disappear. Any alteration of verification thresholds is a catastrophic integrity failure. All failures must be fixed in Compose code.**
`;
}

module.exports = {
  formatAgentPacketMarkdown
};
