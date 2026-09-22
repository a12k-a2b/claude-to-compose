#!/usr/bin/env node
'use strict';

/**
 * tests/adversarial/run_m3_challenger2_stress.js
 *
 * Empirical Adversarial Challenge Suite: Milestone 3 Scoped Agent Implementation Packet Generator,
 * Boundary Enforcement Oracle, Markdown Formatter, and Ajv Schema Validation.
 *
 * Executed by: Challenger 2 (Milestone 3 - Agent Packet Oracle)
 */

const assert = require('node:assert');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  generateImplementationPacket,
  sanitizePath,
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING
} = require('../../src/agent/packet');

const { formatAgentPacketMarkdown } = require('../../src/agent/markdown_formatter');
const packetSchema = require('../../src/agent/schemas/agent_packet.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validatePacket = ajv.compile(packetSchema);

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, group, passed, details = {}) {
  results.push({ id, name, group, passed, details });
  if (passed) {
    passCount++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m [${id}] ${name}`);
    if (details.error) {
      console.log(`     \x1b[33mReason\x1b[0m: ${details.error}`);
    }
    if (details.finding) {
      console.log(`     \x1b[35mFinding\x1b[0m: ${details.finding}`);
    }
  }
}

console.log('\n======================================================================');
console.log('CHALLENGER 2 EMPIRICAL ADVERSARIAL SUITE: AGENT PACKET ORACLE');
console.log('======================================================================\n');

// =====================================================================
// GROUP 1: Component Configurations (Leaf, Container, Multi-Viewport)
// =====================================================================
console.log('\x1b[1mGroup 1: Component Configurations (Leaf, Container, Multi-Viewport)\x1b[0m');

// Test 1.1: Standard note_editor screen packet generation
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: {
      screenId: 'note_editor',
      boundaries: {
        allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**'],
        forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**']
      }
    }
  });

  const validJson = validatePacket(packet.json);
  assert.ok(validJson, 'Standard JSON packet must pass Ajv validation');
  assert.strictEqual(packet.json.screenId, 'note_editor');
  assert.ok(packet.markdown.includes('NoteEditorScreen'));
  recordTest('T1.1', 'Standard note_editor screen generates valid dual-format packet', 'Group 1', true);
} catch (err) {
  recordTest('T1.1', 'Standard note_editor screen generates valid dual-format packet', 'Group 1', false, { error: err.message });
}

// Test 1.2: Leaf Composable configuration (e.g. AppButton)
try {
  const leafPlan = {
    screenId: 'app_button',
    boundaries: {
      allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/components/AppButton.kt'],
      forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**']
    }
  };

  const leafMap = {
    screenId: 'app_button',
    mappings: [
      {
        designNodeId: 'node_btn_save',
        existingSymbol: 'com.claude.noteapp.ui.components.AppButton',
        category: 'RETROFIT_STYLE',
        confidence: 0.95
      }
    ]
  };

  const packet = generateImplementationPacket({
    screenId: 'app_button',
    migrationPlan: leafPlan,
    correspondenceMap: leafMap
  });

  // Check if packet adapted to leaf component or hardcoded NoteEditorScreen
  const isTargetCustomized = packet.json.targetScope.targetFiles.some(f => f.path.includes('AppButton')) ||
                             packet.json.targetScope.targetComposables.some(c => c.composableName === 'AppButton');

  const markdownMentionsLeaf = packet.markdown.includes('AppButton.kt');
  const markdownRetainsNoteEditor = packet.markdown.includes('fun NoteEditorScreen');

  if (!isTargetCustomized || markdownRetainsNoteEditor) {
    recordTest('T1.2', 'Leaf composable packet generation adapts target composables dynamically', 'Group 1', false, {
      finding: 'Target symbols and composables in buildJsonPacket and AGENT_PACKET.md are hardcoded to NoteEditorScreen regardless of component scope.',
      isTargetCustomized,
      markdownRetainsNoteEditor
    });
  } else {
    recordTest('T1.2', 'Leaf composable packet generation adapts target composables dynamically', 'Group 1', true);
  }
} catch (err) {
  recordTest('T1.2', 'Leaf composable packet generation adapts target composables dynamically', 'Group 1', false, { error: err.message });
}

// Test 1.3: Container component configuration (e.g. NoteListScreen)
try {
  const containerPlan = {
    screenId: 'note_list',
    boundaries: {
      allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/list/**'],
      forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**']
    }
  };

  const packet = generateImplementationPacket({
    screenId: 'note_list',
    migrationPlan: containerPlan
  });

  const validJson = validatePacket(packet.json);
  assert.ok(validJson, 'Container packet JSON must validate');
  assert.strictEqual(packet.json.screenId, 'note_list');

  // Verify verification command in markdown
  const verifyCmdInMd = packet.markdown.includes('--screen note_list');
  const verifyCmdHardcoded = packet.markdown.includes('--screen note_editor');

  if (verifyCmdHardcoded && !verifyCmdInMd) {
    recordTest('T1.3', 'Container packet generation specifies screen-specific verification command in markdown', 'Group 1', false, {
      finding: 'AGENT_PACKET.md line 154 hardcodes "node bin/ctc.js verify --screen note_editor" instead of interpolating screenId "note_list".'
    });
  } else {
    recordTest('T1.3', 'Container packet generation specifies screen-specific verification command in markdown', 'Group 1', true);
  }
} catch (err) {
  recordTest('T1.3', 'Container packet generation specifies screen-specific verification command in markdown', 'Group 1', false, { error: err.message });
}

// Test 1.4: Multi-viewport layout constraints (DC1 portrait 1184x1584 vs landscape 1584x1184)
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: { allowedModificationPaths: [] } }
  });

  const layouts = packet.json.layoutConstraints.elementLayouts;
  assert.ok(Array.isArray(layouts) && layouts.length >= 4, 'Must have at least 4 element layouts');

  let allHaveBothViewports = true;
  for (const el of layouts) {
    if (!el.portraitBounds || !el.landscapeBounds) allHaveBothViewports = false;
    if (typeof el.portraitBounds.xDp !== 'number' || typeof el.landscapeBounds.xDp !== 'number') allHaveBothViewports = false;
    if (typeof el.portraitBounds.widthDp !== 'number' || typeof el.landscapeBounds.widthDp !== 'number') allHaveBothViewports = false;
  }

  assert.ok(allHaveBothViewports, 'All elements must define portrait and landscape bounds in dp');
  assert.strictEqual(packet.json.layoutConstraints.viewports.portrait.widthPx, 1184);
  assert.strictEqual(packet.json.layoutConstraints.viewports.portrait.heightPx, 1584);
  assert.strictEqual(packet.json.layoutConstraints.viewports.landscape.widthPx, 1584);
  assert.strictEqual(packet.json.layoutConstraints.viewports.landscape.heightPx, 1184);

  recordTest('T1.4', 'Multi-viewport constraints declare exact DC1 portrait and landscape bounds', 'Group 1', true);
} catch (err) {
  recordTest('T1.4', 'Multi-viewport constraints declare exact DC1 portrait and landscape bounds', 'Group 1', false, { error: err.message });
}

// Test 1.5: Parameter propagation test (correspondenceMap, designContract, existingAppModel)
try {
  const dummyMap = { screenId: 'custom_screen', mappings: [{ id: 'map-1' }] };
  const dummyContract = { screenId: 'custom_screen', layers: { layer1: {} } };
  const dummyAppModel = { screenId: 'custom_screen', composables: [] };

  const packet = generateImplementationPacket({
    screenId: 'custom_screen',
    migrationPlan: { screenId: 'custom_screen', boundaries: {} },
    correspondenceMap: dummyMap,
    designContract: dummyContract,
    existingAppModel: dummyAppModel
  });

  // Check if packet.json contains any trace of correspondenceMap, designContract, or existingAppModel
  const jsonStr = JSON.stringify(packet.json);
  const usesMap = jsonStr.includes('map-1');
  const usesContract = jsonStr.includes('layer1');

  if (!usesMap && !usesContract) {
    recordTest('T1.5', 'Packet generator incorporates input correspondenceMap and designContract into output', 'Group 1', false, {
      finding: 'Parameters correspondenceMap, designContract, and existingAppModel are accepted by generateImplementationPacket but completely unused in buildJsonPacket.'
    });
  } else {
    recordTest('T1.5', 'Packet generator incorporates input correspondenceMap and designContract into output', 'Group 1', true);
  }
} catch (err) {
  recordTest('T1.5', 'Packet generator incorporates input correspondenceMap and designContract into output', 'Group 1', false, { error: err.message });
}

// =====================================================================
// GROUP 2: Boundary Enforcement & Forbidden Path Protection
// =====================================================================
console.log('\n\x1b[1mGroup 2: Boundary Enforcement & Forbidden Path Protection\x1b[0m');

// Test 2.1: Path traversal attempt in allowedModificationPaths
try {
  let traversalPrevented = false;
  try {
    generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        boundaries: {
          allowedModificationPaths: ['../../etc/passwd', 'app/src/../../../secret.key']
        }
      }
    });
  } catch (err) {
    if (/traversal|invalid path|illegal/i.test(err.message)) {
      traversalPrevented = true;
    }
  }

  if (!traversalPrevented) {
    recordTest('T2.1', 'Prevents path traversal attacks in allowedModificationPaths', 'Group 2', false, {
      finding: 'generateImplementationPacket fails to call sanitizePath on allowedModificationPaths, allowing "../../etc/passwd" to be emitted directly in the packet targetScope and markdown.'
    });
  } else {
    recordTest('T2.1', 'Prevents path traversal attacks in allowedModificationPaths', 'Group 2', true);
  }
} catch (err) {
  recordTest('T2.1', 'Prevents path traversal attacks in allowedModificationPaths', 'Group 2', false, { error: err.message });
}

// Test 2.2: Null byte injection in allowedModificationPaths
try {
  let nullBytePrevented = false;
  try {
    generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        boundaries: {
          allowedModificationPaths: ['app/ui/valid\0malicious.kt']
        }
      }
    });
  } catch (err) {
    if (/null byte|invalid path/i.test(err.message)) {
      nullBytePrevented = true;
    }
  }

  if (!nullBytePrevented) {
    recordTest('T2.2', 'Prevents null byte injection in allowedModificationPaths', 'Group 2', false, {
      finding: 'generateImplementationPacket does not validate null bytes in allowedModificationPaths.'
    });
  } else {
    recordTest('T2.2', 'Prevents null byte injection in allowedModificationPaths', 'Group 2', true);
  }
} catch (err) {
  recordTest('T2.2', 'Prevents null byte injection in allowedModificationPaths', 'Group 2', false, { error: err.message });
}

// Test 2.3: Forbidden path injection: data/** in allowedModificationPaths
try {
  let dataViolationPrevented = false;
  try {
    generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        boundaries: {
          allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/data/NoteDao.kt'],
          forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**']
        }
      }
    });
  } catch (err) {
    if (/conflict|forbidden|overlap/i.test(err.message)) {
      dataViolationPrevented = true;
    }
  }

  if (!dataViolationPrevented) {
    recordTest('T2.3', 'Prevents attempt to put data/** in allowedModificationPaths', 'Group 2', false, {
      finding: 'generateImplementationPacket does not execute boundary conflict detection; allowedModificationPaths can contain forbidden database DAOs/entities.'
    });
  } else {
    recordTest('T2.3', 'Prevents attempt to put data/** in allowedModificationPaths', 'Group 2', true);
  }
} catch (err) {
  recordTest('T2.3', 'Prevents attempt to put data/** in allowedModificationPaths', 'Group 2', false, { error: err.message });
}

// Test 2.4: Forbidden path injection: ViewModel in allowedModificationPaths
try {
  let viewModelViolationPrevented = false;
  try {
    generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        boundaries: {
          allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/presentation/editor/NoteEditorViewModel.kt'],
          forbiddenPaths: ['app/src/main/java/com/claude/noteapp/presentation/**ViewModel*.kt']
        }
      }
    });
  } catch (err) {
    if (/conflict|forbidden|overlap/i.test(err.message)) {
      viewModelViolationPrevented = true;
    }
  }

  if (!viewModelViolationPrevented) {
    recordTest('T2.4', 'Prevents attempt to put presentation/**ViewModel*.kt in allowedModificationPaths', 'Group 2', false, {
      finding: 'generateImplementationPacket allows ViewModel files to be marked as ALLOWED while simultaneously listing them as FORBIDDEN.'
    });
  } else {
    recordTest('T2.4', 'Prevents attempt to put presentation/**ViewModel*.kt in allowedModificationPaths', 'Group 2', true);
  }
} catch (err) {
  recordTest('T2.4', 'Prevents attempt to put presentation/**ViewModel*.kt in allowedModificationPaths', 'Group 2', false, { error: err.message });
}

// Test 2.5: Forbidden path injection: navigation/** in allowedModificationPaths
try {
  let navViolationPrevented = false;
  try {
    generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        boundaries: {
          allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/navigation/NoteNavGraph.kt'],
          forbiddenPaths: ['app/src/main/java/com/claude/noteapp/navigation/**']
        }
      }
    });
  } catch (err) {
    if (/conflict|forbidden|overlap/i.test(err.message)) {
      navViolationPrevented = true;
    }
  }

  if (!navViolationPrevented) {
    recordTest('T2.5', 'Prevents attempt to put navigation/** in allowedModificationPaths', 'Group 2', false, {
      finding: 'generateImplementationPacket allows navigation graph modification without boundary conflict validation.'
    });
  } else {
    recordTest('T2.5', 'Prevents attempt to put navigation/** in allowedModificationPaths', 'Group 2', true);
  }
} catch (err) {
  recordTest('T2.5', 'Prevents attempt to put navigation/** in allowedModificationPaths', 'Group 2', false, { error: err.message });
}

// Test 2.6: Direct sanitizePath function verification
try {
  assert.throws(() => sanitizePath('../../etc/passwd'), /traversal|invalid path/i);
  assert.throws(() => sanitizePath('app/src/../../../secrets.kt'), /traversal|invalid path/i);
  assert.throws(() => sanitizePath('/etc/shadow'), /invalid path/i);
  assert.throws(() => sanitizePath(''), /invalid path/i);
  assert.throws(() => sanitizePath('valid\0bad'), /invalid path/i);

  const clean = sanitizePath('app\\src\\main\\java\\com\\claude\\ui\\**');
  assert.strictEqual(clean, 'app/src/main/java/com/claude/ui/**');

  recordTest('T2.6', 'Standalone sanitizePath correctly rejects traversal, null bytes, and normalizes paths', 'Group 2', true);
} catch (err) {
  recordTest('T2.6', 'Standalone sanitizePath correctly rejects traversal, null bytes, and normalizes paths', 'Group 2', false, { error: err.message });
}

// =====================================================================
// GROUP 3: Markdown Formatting & Agent Instruction Density
// =====================================================================
console.log('\n\x1b[1mGroup 3: Markdown Formatting & Agent Instruction Density\x1b[0m');

// Test 3.1: Strict line count limit (< 300 lines) for default packet
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'markdown'
  });

  const lineCount = packet.markdown.split('\n').length;
  assert.ok(lineCount < 300, `Line count must be < 300 lines; got ${lineCount}`);
  assert.ok(lineCount > 100, `Line count must contain substantial instructions; got ${lineCount}`);

  recordTest('T3.1', `AGENT_PACKET.md is context-bounded (${lineCount} lines < 300 lines)`, 'Group 3', true, { lineCount });
} catch (err) {
  recordTest('T3.1', 'AGENT_PACKET.md is context-bounded (< 300 lines)', 'Group 3', false, { error: err.message });
}

// Test 3.2: Line count scalability with expanded boundary list
try {
  const largeAllowed = Array.from({ length: 40 }, (_, i) => `app/src/main/java/com/claude/noteapp/ui/component_${i}.kt`);
  const largeForbidden = Array.from({ length: 20 }, (_, i) => `app/src/main/java/com/claude/noteapp/data/internal_${i}/**`);

  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: {
      boundaries: {
        allowedModificationPaths: largeAllowed,
        forbiddenPaths: largeForbidden
      }
    },
    format: 'markdown'
  });

  const lineCount = packet.markdown.split('\n').length;
  const isUnderLimit = lineCount < 300;

  if (!isUnderLimit) {
    recordTest('T3.2', 'AGENT_PACKET.md remains under 300 lines with large boundary sets', 'Group 3', false, {
      finding: `Expanded boundary set caused markdown to reach ${lineCount} lines (>= 300), risking agent context truncation.`,
      lineCount
    });
  } else {
    recordTest('T3.2', `AGENT_PACKET.md remains under 300 lines with large boundary sets (${lineCount} lines)`, 'Group 3', true, { lineCount });
  }
} catch (err) {
  recordTest('T3.2', 'AGENT_PACKET.md remains under 300 lines with large boundary sets', 'Group 3', false, { error: err.message });
}

// Test 3.3: Exact Sol:OS 8-bit neutral grayscale token table fidelity
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'markdown'
  });

  const expectedTokens = [
    { token: '--os-0', hex: '#FFFFFF', compose: 'Color(0xFFFFFFFF)' },
    { token: '--os-50', hex: '#F7F7F7', compose: 'Color(0xFFF7F7F7)' },
    { token: '--os-100', hex: '#DCD5C9', compose: 'Color(0xFFDCD5C9)' },
    { token: '--os-150', hex: '#F5F5F5', compose: 'Color(0xFFF5F5F5)' },
    { token: '--os-200', hex: '#CCCCCC', compose: 'Color(0xFFCCCCCC)' },
    { token: '--os-300', hex: '#858585', compose: 'Color(0xFF858585)' },
    { token: '--os-400', hex: '#535353', compose: 'Color(0xFF535353)' },
    { token: '--os-800', hex: '#343434', compose: 'Color(0xFF343434)' },
    { token: '--os-900', hex: '#1A1A1A', compose: 'Color(0xFF1A1A1A)' },
    { token: '--os-1000', hex: '#000000', compose: 'Color(0xFF000000)' }
  ];

  let allTokensFound = true;
  for (const t of expectedTokens) {
    if (!packet.markdown.includes(t.token) || !packet.markdown.includes(t.hex) || !packet.markdown.includes(t.compose)) {
      allTokensFound = false;
      break;
    }
  }

  assert.ok(allTokensFound, 'All 10 Sol:OS tokens with exact hex and compose colors must be present in Markdown');
  recordTest('T3.3', 'AGENT_PACKET.md embeds complete 10-token Sol:OS neutral grayscale table', 'Group 3', true);
} catch (err) {
  recordTest('T3.3', 'AGENT_PACKET.md embeds complete 10-token Sol:OS neutral grayscale table', 'Group 3', false, { error: err.message });
}

// Test 3.4: Daylight DC1 LivePaper hardware rules enforcement in Markdown
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'markdown'
  });

  const md = packet.markdown;
  assert.ok(md.includes('LivePaper'), 'Must specify LivePaper display');
  assert.ok(md.includes('Transflective LCD'), 'Must specify Transflective LCD architecture');
  assert.ok(md.includes('ACTION_REFRESH_SCREEN'), 'Must explicitly forbid ACTION_REFRESH_SCREEN');
  assert.ok(md.includes('NO EPD') || md.includes('NO E-ink') || md.includes('zero EPD'), 'Must declare NO EPD waveforms');
  assert.ok(md.includes('+8px'), 'Must declare +8px hardware inset');
  assert.ok(md.includes('48dp'), 'Must declare >= 48dp touch target');

  recordTest('T3.4', 'AGENT_PACKET.md documents all Daylight DC1 LivePaper hardware specifications', 'Group 3', true);
} catch (err) {
  recordTest('T3.4', 'AGENT_PACKET.md documents all Daylight DC1 LivePaper hardware specifications', 'Group 3', false, { error: err.message });
}

// Test 3.5: Preservation invariants checklist presence
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'markdown'
  });

  const md = packet.markdown;
  assert.ok(md.includes('StateFlow'), 'Must check StateFlow');
  assert.ok(md.includes('500ms'), 'Must check 500ms debounce');
  assert.ok(md.includes('Room DAO') || md.includes('NoteDao'), 'Must check Room DAO queries');
  assert.ok(md.includes('SCREEN_NOTE_EDITOR'), 'Must check SCREEN_NOTE_EDITOR test tag');
  assert.ok(md.includes('EDITOR_TITLE_INPUT'), 'Must check EDITOR_TITLE_INPUT test tag');
  assert.ok(md.includes('EDITOR_STATUS_INDICATOR'), 'Must check EDITOR_STATUS_INDICATOR test tag');

  recordTest('T3.5', 'AGENT_PACKET.md contains actionable preservation invariants checklist', 'Group 3', true);
} catch (err) {
  recordTest('T3.5', 'AGENT_PACKET.md contains actionable preservation invariants checklist', 'Group 3', false, { error: err.message });
}

// Test 3.6: Verification commands and anti-tampering directive
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'markdown'
  });

  const md = packet.markdown;
  assert.ok(md.includes('./gradlew compileDebugKotlin'), 'Must include compileDebugKotlin');
  assert.ok(md.includes('./gradlew testDebugUnitTest'), 'Must include testDebugUnitTest');
  assert.ok(md.includes('node bin/ctc.js verify'), 'Must include ctc verify');
  assert.ok(md.includes('node bin/ctc.js defects'), 'Must include ctc defects');
  assert.ok(md.includes('3.0') && md.includes('drift'), 'Must include <= 3.0px spatial drift');
  assert.ok(md.includes('Anti-Tampering Directive'), 'Must include Anti-Tampering Directive');

  recordTest('T3.6', 'AGENT_PACKET.md embeds deterministic verification commands and anti-tampering directive', 'Group 3', true);
} catch (err) {
  recordTest('T3.6', 'AGENT_PACKET.md embeds deterministic verification commands and anti-tampering directive', 'Group 3', false, { error: err.message });
}

// =====================================================================
// GROUP 4: Ajv Schema Validation & Negative Constraints
// =====================================================================
console.log('\n\x1b[1mGroup 4: Ajv Schema Validation & Negative Constraints\x1b[0m');

// Test 4.1: Draft 2020-12 schema validation on standard packet
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const isValid = validatePacket(packet.json);
  if (!isValid) {
    recordTest('T4.1', 'Generated agent-packet.json conforms to Draft 2020-12 schema', 'Group 4', false, {
      errors: validatePacket.errors
    });
  } else {
    recordTest('T4.1', 'Generated agent-packet.json conforms to Draft 2020-12 schema', 'Group 4', true);
  }
} catch (err) {
  recordTest('T4.1', 'Generated agent-packet.json conforms to Draft 2020-12 schema', 'Group 4', false, { error: err.message });
}

// Test 4.2: Negative control: Schema rejects invalid schemaVersion
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  corrupted.schemaVersion = '1.0.0';

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject schemaVersion != "2.0.0"');
  recordTest('T4.2', 'Ajv schema rejects non-2.0.0 schemaVersion (negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.2', 'Ajv schema rejects non-2.0.0 schemaVersion (negative control)', 'Group 4', false, { error: err.message });
}

// Test 4.3: Negative control: Schema rejects invalid packetId format
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  corrupted.packetId = 'INVALID_UPPERCASE_ID';

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject uppercase packetId');
  recordTest('T4.3', 'Ajv schema rejects malformed packetId format (negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.3', 'Ajv schema rejects malformed packetId format (negative control)', 'Group 4', false, { error: err.message });
}

// Test 4.4: Negative control: Schema rejects non-DC1 viewport dimensions
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  corrupted.layoutConstraints.viewports.portrait.widthPx = 1080; // Standard phone, not DC1 1184px

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject non-DC1 1080px viewport width');
  recordTest('T4.4', 'Ajv schema enforces exact DC1 1184x1584 portrait viewport constraint (negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.4', 'Ajv schema enforces exact DC1 1184x1584 portrait viewport constraint (negative control)', 'Group 4', false, { error: err.message });
}

// Test 4.5: Negative control: Schema rejects touch target < 48dp
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  corrupted.layoutConstraints.minTouchTarget.widthDp = 32; // Below 48dp

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject touch target < 48dp');
  recordTest('T4.5', 'Ajv schema enforces minimum 48dp touch target requirement (negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.5', 'Ajv schema enforces minimum 48dp touch target requirement (negative control)', 'Group 4', false, { error: err.message });
}

// Test 4.6: Negative control: Schema rejects altered failure budgets
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  corrupted.verification.failureBudgets.maxSpatialDriftPx = 5.0; // Tampered from 3.0 to 5.0

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject tampered spatial drift budget');
  recordTest('T4.6', 'Ajv schema enforces immutable 3.0px spatial drift budget (anti-tampering negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.6', 'Ajv schema enforces immutable 3.0px spatial drift budget (anti-tampering negative control)', 'Group 4', false, { error: err.message });
}

// Test 4.7: Negative control: Schema rejects missing preservation invariants
try {
  const packet = generateImplementationPacket({
    screenId: 'note_editor',
    migrationPlan: { boundaries: {} },
    format: 'json'
  });

  const corrupted = JSON.parse(JSON.stringify(packet.json));
  delete corrupted.preservationInvariants;

  const isValid = validatePacket(corrupted);
  assert.strictEqual(isValid, false, 'Schema must reject packet missing preservationInvariants');
  recordTest('T4.7', 'Ajv schema rejects packet missing preservationInvariants (negative control)', 'Group 4', true);
} catch (err) {
  recordTest('T4.7', 'Ajv schema rejects packet missing preservationInvariants (negative control)', 'Group 4', false, { error: err.message });
}

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n======================================================================');
console.log(`STRESS TEST SUMMARY: ${passCount} Passed, ${failCount} Failed (Total: ${passCount + failCount})`);
console.log('======================================================================\n');

if (failCount > 0) {
  console.log('\x1b[31mFAILURES / FINDINGS REQUIRING ATTENTION:\x1b[0m');
  for (const r of results.filter(r => !r.passed)) {
    console.log(`- [${r.id}] ${r.name}`);
    if (r.details.finding) console.log(`  Finding: ${r.details.finding}`);
    if (r.details.error) console.log(`  Error: ${r.details.error}`);
  }
}

process.exit(failCount > 0 ? 1 : 0);
