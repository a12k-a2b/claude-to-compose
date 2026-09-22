#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Adversarial Stress Test Suite: Milestone 6 Challenger 2 (Tier 5 Hardening)
 *
 * Scope:
 * 1. Correspondence Mapping Ambiguity & Conflict Hardening
 * 2. Agent Packet Boundary Enforcer & Domain Shield
 * 3. Behavior Contract Navigation DAG & Backstack Stress
 * 4. Sol:OS 8-Bit Grayscale Contrast & Anti-EPD Watchdog
 * 5. DC1 Hardware Subsystem & MCP Bridge Hardening
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Subsystems under test
const {
  generateCorrespondenceMap,
  scoreCandidateMapping,
  classifyMappingConfidence,
  detectDuplicateTargets
} = require(path.join(PROJECT_ROOT, 'src/mapping/mapper'));
const {
  extractAlternativeCandidates,
  CONFIDENCE_LEVELS
} = require(path.join(PROJECT_ROOT, 'src/mapping/ambiguity_resolver'));
const { sanitizePath } = require(path.join(PROJECT_ROOT, 'src/agent/boundary_enforcer'));
const { generateImplementationPacket } = require(path.join(PROJECT_ROOT, 'src/agent/packet'));
const { validateBoundaries } = require(path.join(PROJECT_ROOT, 'src/mapping/planner'));
const {
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops
} = require(path.join(PROJECT_ROOT, 'src/contract/behavior_contract_builder'));
const { replayScenario } = require(path.join(PROJECT_ROOT, 'src/verification/stages/scenario_replay'));
const { DisplayProfileValidator, FORBIDDEN_EPD_PATTERNS } = require(path.join(PROJECT_ROOT, 'src/verification/display_profile'));
const { FleetManager, MIN_BATTERY_PERCENT } = require(path.join(PROJECT_ROOT, 'src/hardware/fleet_manager'));
const { McpBridge, MIN_PHYSIOLOGICAL_DWELL_MS, DC1_INSET_PX } = require(path.join(PROJECT_ROOT, 'src/hardware/mcp_bridge'));

const results = [];
const gaps = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[33mFinding/Gap: ${details.reason || 'Test assertion failed'}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
    if (details.expected !== undefined) console.log(`       Expected: ${JSON.stringify(details.expected)}`);
    if (details.actual !== undefined) console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
    gaps.push({ id, name, category, details });
  }
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M6 TIER 5 HARDENING)');
  console.log('='.repeat(80));

  // ==========================================================================
  // SECTION 1: Correspondence Mapping Ambiguity & Conflict Hardening
  // ==========================================================================
  console.log('\n--- Section 1: Correspondence Mapping Ambiguity & Conflict Hardening ---');

  // 1.1 Duplicate target collisions with tied confidence scores
  try {
    const tiedMappings = [
      {
        id: 'map_btn_1',
        designSourceId: 'daylight#note_editor/action/save_btn',
        confidence: 0.82,
        existingTarget: { testTag: 'save_button', composableSymbol: 'SaveButton' }
      },
      {
        id: 'map_btn_2',
        designSourceId: 'daylight#note_editor/action/submit_btn',
        confidence: 0.82,
        existingTarget: { testTag: 'save_button', composableSymbol: 'SaveButton' }
      }
    ];
    const collisions = detectDuplicateTargets(tiedMappings);
    const pass = collisions.length === 1 &&
      collisions[0].resolution === 'UNRESOLVED_COLLISION' &&
      collisions[0].conflictingDesignSourceIds.length === 2;

    recordTest('ADV-MAP-01', 'Duplicate target collision with tied confidence resolves to UNRESOLVED_COLLISION', 'Correspondence', pass, {
      actual: collisions
    });
  } catch (err) {
    recordTest('ADV-MAP-01', 'Duplicate target collision with tied confidence', 'Correspondence', false, { error: err.message });
  }

  // 1.2 Duplicate target collision with high delta resolves to PRIMARY_WINS
  try {
    const separatedMappings = [
      {
        id: 'map_btn_1',
        designSourceId: 'daylight#note_editor/action/save_btn',
        confidence: 0.95,
        existingTarget: { testTag: 'save_button', composableSymbol: 'SaveButton' }
      },
      {
        id: 'map_btn_2',
        designSourceId: 'daylight#note_editor/action/random_div',
        confidence: 0.55,
        existingTarget: { testTag: 'save_button', composableSymbol: 'SaveButton' }
      }
    ];
    const collisions = detectDuplicateTargets(separatedMappings);
    const pass = collisions.length === 1 &&
      collisions[0].resolution === 'PRIMARY_WINS' &&
      collisions[0].conflictingDesignSourceIds[0] === 'daylight#note_editor/action/save_btn';

    recordTest('ADV-MAP-02', 'Duplicate target collision with high confidence delta resolves to PRIMARY_WINS', 'Correspondence', pass, {
      actual: collisions
    });
  } catch (err) {
    recordTest('ADV-MAP-02', 'Duplicate target collision with high confidence delta', 'Correspondence', false, { error: err.message });
  }

  // 1.3 Alternative candidate extraction within tolerance
  try {
    const scoredCandidates = [
      { candidate: { symbol: 'PrimarySaveBtn', testTag: 'save_btn' }, confidence: 0.88 },
      { candidate: { symbol: 'SecondarySaveAction', testTag: 'save_action' }, confidence: 0.82 },
      { candidate: { symbol: 'UnrelatedList', testTag: 'notes_list' }, confidence: 0.40 }
    ];
    const alts = extractAlternativeCandidates(scoredCandidates, 0.15);
    const pass = alts.length === 1 &&
      alts[0].symbol === 'SecondarySaveAction' &&
      alts[0].confidence === 0.82;

    recordTest('ADV-MAP-03', 'Extracts alternative candidates within confidence tolerance window', 'Correspondence', pass, {
      actual: alts
    });
  } catch (err) {
    recordTest('ADV-MAP-03', 'Extracts alternative candidates within confidence tolerance', 'Correspondence', false, { error: err.message });
  }

  // 1.4 Ambiguous slot roles: unmapped generic div categorized as NEW_COMPONENT
  try {
    const appModel = {
      screens: [{
        symbol: 'NoteEditorScreen',
        composableName: 'NoteEditorScreen',
        filePath: 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
        testTags: ['save_btn', 'title_input']
      }]
    };
    const designContract = {
      measuredScenes: {
        scenes: {
          note_editor: {
            rootNode: {
              sourceId: 'daylight#note_editor/unknown_ad_banner',
              domTag: 'aside',
              role: 'banner',
              category: 'container',
              text: 'Sponsor Message'
            }
          }
        }
      }
    };
    const mapResult = generateCorrespondenceMap({ appModel, designContract, screenId: 'note_editor' });
    const unmapped = mapResult.unmappedDesignNodes;
    const pass = unmapped.some(u => u.designSourceId === 'daylight#note_editor/unknown_ad_banner' && u.disposition === 'NEW_COMPONENT');

    recordTest('ADV-MAP-04', 'Ambiguous unmapped slot role correctly categorized as NEW_COMPONENT', 'Correspondence', pass, {
      actual: unmapped
    });
  } catch (err) {
    recordTest('ADV-MAP-04', 'Ambiguous unmapped slot role', 'Correspondence', false, { error: err.message });
  }

  // 1.5 Orphaned SVG/Canvas design node categorized as REPLACE_CANVAS
  try {
    const appModel = { screens: [{ symbol: 'NoteEditorScreen', composableName: 'NoteEditorScreen', testTags: [] }] };
    const designContract = {
      measuredScenes: {
        scenes: {
          note_editor: {
            rootNode: {
              sourceId: 'daylight#note_editor/canvas/highlighter_layer',
              domTag: 'canvas',
              role: 'canvas',
              category: 'canvas',
              vectorData: 'M0,0 L100,100'
            }
          }
        }
      }
    };
    const mapResult = generateCorrespondenceMap({ appModel, designContract, screenId: 'note_editor' });
    const unmapped = mapResult.unmappedDesignNodes;
    const pass = unmapped.some(u => u.designSourceId === 'daylight#note_editor/canvas/highlighter_layer' && u.disposition === 'REPLACE_CANVAS');

    recordTest('ADV-MAP-05', 'Orphaned canvas/vector design node categorized as REPLACE_CANVAS', 'Correspondence', pass, {
      actual: unmapped
    });
  } catch (err) {
    recordTest('ADV-MAP-05', 'Orphaned canvas/vector design node', 'Correspondence', false, { error: err.message });
  }

  // 1.6 Corrupt design node properties (NaN, null, undefined) do NOT emit NaN
  try {
    const corruptNode = {
      sourceId: 'corrupt_node',
      boundsDp: { x: NaN, y: Infinity, width: null, height: undefined },
      text: null,
      semantics: null
    };
    const candidate = {
      symbol: 'SomeWidget',
      testTag: null,
      composableName: undefined
    };
    const { confidence, signals } = scoreCandidateMapping(corruptNode, candidate);
    const pass = typeof confidence === 'number' &&
      !Number.isNaN(confidence) &&
      !Number.isNaN(signals.tagScore) &&
      !Number.isNaN(signals.roleScore) &&
      !Number.isNaN(signals.behaviorScore) &&
      !Number.isNaN(signals.topologyScore) &&
      !Number.isNaN(signals.textScore);

    recordTest('ADV-MAP-06', 'Corrupt node properties (NaN, Infinity, null) score safely without NaN emission', 'Correspondence', pass, {
      actual: { confidence, signals }
    });
  } catch (err) {
    recordTest('ADV-MAP-06', 'Corrupt node properties score safely', 'Correspondence', false, { error: err.message });
  }

  // 1.7 Anti-deception guardrail: high text similarity cannot promote ungrounded node
  try {
    const ungroundedNode = {
      sourceId: 'totally_unrelated_id_123',
      domTag: 'p',
      category: 'unknown',
      text: 'Click here to save your note'
    };
    const targetCandidate = {
      symbol: 'SaveNoteFab',
      testTag: 'completely_different_tag',
      targetType: 'COMPOSABLE_FUNCTION',
      text: 'Click here to save your note'
    };
    const { confidence, signals } = scoreCandidateMapping(ungroundedNode, targetCandidate);
    // In multi_signal_scorer: text weight is 0.05, guardrail caps confidence < 0.50 if tagScore=0, behaviorScore=0, roleScore<0.5
    const pass = confidence < 0.50 && signals.textScore === 1.0;

    recordTest('ADV-MAP-07', 'Anti-deception guardrail prevents high text similarity from fabricating CONFIRMED match', 'Correspondence', pass, {
      actual: { confidence, signals }
    });
  } catch (err) {
    recordTest('ADV-MAP-07', 'Anti-deception guardrail', 'Correspondence', false, { error: err.message });
  }

  // ==========================================================================
  // SECTION 2: Agent Packet Boundary Enforcer & Domain Shield
  // ==========================================================================
  console.log('\n--- Section 2: Agent Packet Boundary Enforcer & Domain Shield ---');

  // 2.1 Standard relative path traversal rejection (../)
  try {
    let threw = false;
    try {
      sanitizePath('../../../etc/passwd');
    } catch (e) {
      threw = /traversal|invalid path/i.test(e.message);
    }
    recordTest('ADV-BND-01', 'Rejects standard relative path traversal components (../)', 'BoundaryEnforcer', threw, {
      expected: 'Throws Error with traversal or invalid path message'
    });
  } catch (err) {
    recordTest('ADV-BND-01', 'Rejects standard relative path traversal', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.2 Null byte injection rejection (\0)
  try {
    let threw = false;
    try {
      sanitizePath('app/src/main/NoteEditor.kt\0.png');
    } catch (e) {
      threw = /null byte|invalid path/i.test(e.message);
    }
    recordTest('ADV-BND-02', 'Rejects null byte injection in paths (\\0)', 'BoundaryEnforcer', threw, {
      expected: 'Throws Error with null byte or invalid path message'
    });
  } catch (err) {
    recordTest('ADV-BND-02', 'Rejects null byte injection in paths', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.3 URL-encoded path traversal injection rejection (%2e%2e) [GAP PROBE]
  try {
    let threw = false;
    try {
      sanitizePath('%2e%2e/data/NoteDao.kt');
    } catch (e) {
      threw = /traversal|invalid path/i.test(e.message);
    }
    recordTest('ADV-BND-03', 'Rejects URL-encoded path traversal injection (%2e%2e)', 'BoundaryEnforcer', threw, {
      reason: 'sanitizePath fails to decode URL entities before inspecting traversal tokens; %2e%2e passes unintercepted',
      expected: 'Throws Error with traversal or invalid path message',
      actual: threw ? 'Threw Error' : 'Allowed path "%2e%2e/data/NoteDao.kt"'
    });
  } catch (err) {
    recordTest('ADV-BND-03', 'Rejects URL-encoded path traversal injection', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.4 System directory absolute path rejection (/etc, /var, /usr)
  try {
    let threw = false;
    try {
      sanitizePath('/etc/shadow');
    } catch (e) {
      threw = /protected system directory|invalid path/i.test(e.message);
    }
    recordTest('ADV-BND-04', 'Rejects protected system root paths (/etc, /var, /usr)', 'BoundaryEnforcer', threw, {
      expected: 'Throws Error with protected system directory'
    });
  } catch (err) {
    recordTest('ADV-BND-04', 'Rejects protected system root paths', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.5 Arbitrary rooted absolute path rejection [GAP PROBE]
  try {
    let threw = false;
    try {
      sanitizePath('/Users/attacker/Library/Keychains/login.keychain');
    } catch (e) {
      threw = /invalid path|absolute|workspace/i.test(e.message);
    }
    recordTest('ADV-BND-05', 'Rejects arbitrary rooted absolute paths outside workspace', 'BoundaryEnforcer', threw, {
      reason: 'sanitizePath only checks /etc, /var, and /usr; arbitrary absolute paths such as /Users or /tmp pass through',
      expected: 'Throws Error rejecting arbitrary absolute system paths outside workspace',
      actual: threw ? 'Threw Error' : 'Allowed arbitrary absolute path'
    });
  } catch (err) {
    recordTest('ADV-BND-05', 'Rejects arbitrary rooted absolute paths', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.6 Disjoint boundary validation (overlapping allowed and forbidden patterns)
  try {
    let threw = false;
    try {
      validateBoundaries({
        allowed: ['app/src/main/java/com/claude/noteapp/data/**'],
        forbidden: ['app/src/main/java/com/claude/noteapp/data/local/NoteDao.kt']
      });
    } catch (e) {
      threw = /conflict|overlap/i.test(e.message);
    }
    recordTest('ADV-BND-06', 'Rejects conflicting allowed and forbidden boundary patterns', 'BoundaryEnforcer', threw, {
      expected: 'Throws Error matching /conflict|overlap/i'
    });
  } catch (err) {
    recordTest('ADV-BND-06', 'Rejects conflicting boundary patterns', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.7 Domain file tampering rejection when forbiddenPaths is omitted [GAP PROBE]
  try {
    const maliciousPlan = {
      screenId: 'note_editor',
      boundaries: {
        allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/data/local/NoteDao.kt']
      }
    };
    let blocked = false;
    try {
      const packet = generateImplementationPacket({ migrationPlan: maliciousPlan });
      // If packet was created, check whether NoteDao was permitted
      const allowed = packet.json?.targetScope?.allowedModificationPaths || [];
      if (allowed.some(p => p.includes('data') || p.includes('NoteDao') || p.includes('Dao'))) {
        blocked = false;
      }
    } catch (e) {
      blocked = /conflict|overlap|forbidden|boundary|data/i.test(e.message);
    }
    recordTest('ADV-BND-07', 'Rejects domain file tampering (Room DAO/Entity) when forbiddenPaths is omitted in options', 'BoundaryEnforcer', blocked, {
      reason: 'generateImplementationPacket skips validateBoundaries when boundaries.forbiddenPaths is omitted, allowing modification of Room DAO',
      expected: 'Throws Error or blocks modification of Room DB/DAO/Entity domain files',
      actual: blocked ? 'Blocked modification' : 'Synthesized packet targeting NoteDao.kt'
    });
  } catch (err) {
    recordTest('ADV-BND-07', 'Rejects domain file tampering', 'BoundaryEnforcer', false, { error: err.message });
  }

  // 2.8 Preview stub detection: checks that full state signature is generated
  try {
    const validPlan = {
      screenId: 'note_editor',
      boundaries: {
        allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']
      }
    };
    const packet = generateImplementationPacket({ migrationPlan: validPlan });
    const target = packet.json?.targetScope?.targetComposables?.[0] || {};
    const signature = target.signature || '';
    const hasUiState = signature.includes('uiState: NoteEditorUiState');
    const hasOnAction = signature.includes('onAction: (NoteEditorAction) -> Unit');
    const hasNoPreview = !signature.includes('@Preview');
    const pass = hasUiState && hasOnAction && hasNoPreview;

    recordTest('ADV-BND-08', 'Enforces production state-hoisted signature and prevents parameterless @Preview stubs', 'BoundaryEnforcer', pass, {
      actual: signature
    });
  } catch (err) {
    recordTest('ADV-BND-08', 'Enforces production state-hoisted signature', 'BoundaryEnforcer', false, { error: err.message });
  }

  // ==========================================================================
  // SECTION 3: Behavior Contract Navigation DAG & Backstack Stress
  // ==========================================================================
  console.log('\n--- Section 3: Behavior Contract Navigation DAG & Backstack Stress ---');

  // 3.1 Circular navigation loop without guards (A -> B -> C -> A)
  try {
    const circularGraph = {
      namedStates: ['A', 'B', 'C'],
      transitions: [
        { fromState: 'A', toState: 'B' },
        { fromState: 'B', toState: 'C' },
        { fromState: 'C', toState: 'A' }
      ]
    };
    const cycleReport = detectCircularLoops(circularGraph);
    const pass = cycleReport.hasUnguardedCycle === true &&
      cycleReport.cycles.length > 0 &&
      cycleReport.cycles[0].includes('A');

    recordTest('ADV-DAG-01', 'Detects circular navigation loops without guards (A -> B -> C -> A)', 'NavigationDAG', pass, {
      actual: cycleReport
    });
  } catch (err) {
    recordTest('ADV-DAG-01', 'Detects circular navigation loops', 'NavigationDAG', false, { error: err.message });
  }

  // 3.2 Self-referential loop without guards (A -> A)
  try {
    const selfLoopGraph = {
      namedStates: ['A'],
      transitions: [
        { fromState: 'A', toState: 'A' }
      ]
    };
    const cycleReport = detectCircularLoops(selfLoopGraph);
    const pass = cycleReport.hasUnguardedCycle === true &&
      cycleReport.cycles.length > 0 &&
      cycleReport.cycles[0][0] === 'A' &&
      cycleReport.cycles[0][1] === 'A';

    recordTest('ADV-DAG-02', 'Detects self-referential navigation loops without guards (A -> A)', 'NavigationDAG', pass, {
      actual: cycleReport
    });
  } catch (err) {
    recordTest('ADV-DAG-02', 'Detects self-referential navigation loops', 'NavigationDAG', false, { error: err.message });
  }

  // 3.3 Guarded cycles pass without false positive
  try {
    const guardedGraph = {
      namedStates: ['A', 'B'],
      transitions: [
        { fromState: 'A', toState: 'B', guardCondition: 'retryCount < 3' },
        { fromState: 'B', toState: 'A', guardCondition: 'retryCount >= 3' }
      ]
    };
    const cycleReport = detectCircularLoops(guardedGraph);
    const pass = cycleReport.hasUnguardedCycle === false && cycleReport.cycles.length === 0;

    recordTest('ADV-DAG-03', 'Permits guarded cyclic state transitions without false positive detection', 'NavigationDAG', pass, {
      actual: cycleReport
    });
  } catch (err) {
    recordTest('ADV-DAG-03', 'Permits guarded cyclic transitions', 'NavigationDAG', false, { error: err.message });
  }

  // 3.4 Empty backstack pop in scenario replay
  try {
    const replayResult = await replayScenario({
      backstack: [],
      action: { type: 'BACK_PRESS', latencyMs: 12.0 },
      expectedDestination: null,
      expectedNavigationEffect: 'POP_BACK'
    });
    const pass = replayResult.status === 'PASS' &&
      replayResult.currentRoute === null &&
      replayResult.backstackPopped === true;

    recordTest('ADV-DAG-04', 'Replaying BACK_PRESS against empty backstack exits app gracefully without crashing', 'NavigationDAG', pass, {
      actual: { status: replayResult.status, currentRoute: replayResult.currentRoute }
    });
  } catch (err) {
    recordTest('ADV-DAG-04', 'Replaying BACK_PRESS on empty backstack', 'NavigationDAG', false, { error: err.message });
  }

  // 3.5 Single route backstack popping exits app
  try {
    const replayResult = await replayScenario({
      backstack: ['notes_list'],
      action: { type: 'BACK_PRESS', latencyMs: 12.0 },
      expectedDestination: null,
      expectedNavigationEffect: 'POP_BACK'
    });
    const pass = replayResult.status === 'PASS' &&
      replayResult.currentRoute === null &&
      replayResult.backstackPopped === true;

    recordTest('ADV-DAG-05', 'Replaying BACK_PRESS on root route pops backstack to null (app exit)', 'NavigationDAG', pass, {
      actual: { status: replayResult.status, currentRoute: replayResult.currentRoute }
    });
  } catch (err) {
    recordTest('ADV-DAG-05', 'Replaying BACK_PRESS on root route', 'NavigationDAG', false, { error: err.message });
  }

  // 3.6 Hardware latency threshold enforcement (< 16ms LivePaper standard)
  try {
    const replayResult = await replayScenario({
      backstack: ['notes_list', 'note_editor/1'],
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 25.0 } // 25ms >= 16ms
    });
    const pass = replayResult.status === 'FAIL' &&
      replayResult.errorCode === 'LATENCY_THRESHOLD_EXCEEDED';

    recordTest('ADV-DAG-06', 'Enforces instant keyboard latency (< 16ms) and rejects sluggish hardware events (>= 16ms)', 'NavigationDAG', pass, {
      actual: { status: replayResult.status, errorCode: replayResult.errorCode }
    });
  } catch (err) {
    recordTest('ADV-DAG-06', 'Enforces instant keyboard latency', 'NavigationDAG', false, { error: err.message });
  }

  // 3.7 Trigger event validation: targetSourceId required
  try {
    let threw = false;
    try {
      validateTrigger({ eventType: 'TAP' }); // Missing targetSourceId
    } catch (e) {
      threw = /targetSourceId required/i.test(e.message);
    }
    recordTest('ADV-DAG-07', 'Rejects trigger event missing targetSourceId', 'NavigationDAG', threw, {
      expected: 'Throws Error matching /targetSourceId required/i'
    });
  } catch (err) {
    recordTest('ADV-DAG-07', 'Rejects trigger event missing targetSourceId', 'NavigationDAG', false, { error: err.message });
  }

  // 3.8 Unsupported event type rejection
  try {
    let threw = false;
    try {
      validateTrigger({ targetSourceId: 'btn', eventType: 'HOVER_GESTURE' });
    } catch (e) {
      threw = /Invalid eventType/i.test(e.message);
    }
    recordTest('ADV-DAG-08', 'Rejects unsupported interaction event types', 'NavigationDAG', threw, {
      expected: 'Throws Error matching /Invalid eventType/i'
    });
  } catch (err) {
    recordTest('ADV-DAG-08', 'Rejects unsupported event types', 'NavigationDAG', false, { error: err.message });
  }

  // ==========================================================================
  // SECTION 4: Sol:OS 8-Bit Grayscale Contrast & Anti-EPD Watchdog
  // ==========================================================================
  console.log('\n--- Section 4: Sol:OS 8-Bit Grayscale Contrast & Anti-EPD Watchdog ---');

  const validator = new DisplayProfileValidator();

  // 4.1 Sol:OS high contrast text: --os-900 on --os-0 passes WCAG AAA (>= 7.0:1)
  try {
    const res = validator.validateGrayscaleContrast('#1A1A1A', '#FFFFFF', false);
    const pass = res.passAAA && res.passAA && res.ratio >= 15.0;

    recordTest('ADV-GRAY-01', 'Sol:OS primary text (--os-900 on --os-0) passes WCAG AAA standard (>= 7.0:1)', 'GrayscaleAndEpd', pass, {
      actual: { ratio: res.ratio, verdict: res.verdict }
    });
  } catch (err) {
    recordTest('ADV-GRAY-01', 'Sol:OS primary text passes WCAG AAA', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.2 Sol:OS contrast degradation: --os-200 on --os-0 fails WCAG AA (ratio < 4.5:1)
  try {
    const res = validator.validateGrayscaleContrast('#CCCCCC', '#FFFFFF', false);
    const pass = !res.passAA && !res.passAAA && res.ratio < 2.0 && res.verdict === 'FAIL';

    recordTest('ADV-GRAY-02', 'Low contrast disabled text (--os-200 on --os-0) fails WCAG AA (ratio < 4.5:1)', 'GrayscaleAndEpd', pass, {
      actual: { ratio: res.ratio, verdict: res.verdict }
    });
  } catch (err) {
    recordTest('ADV-GRAY-02', 'Low contrast disabled text fails WCAG AA', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.3 Large text AA threshold differentiation (3.0:1 vs 4.5:1)
  try {
    // Secondary ink #535353 on #FFFFFF has ratio ~7.5:1
    // Let us test an intermediate gray: #767676 (approx 4.54:1) vs #858585 (--os-300, approx 3.66:1)
    const resNormal = validator.validateGrayscaleContrast('#858585', '#FFFFFF', false);
    const resLarge = validator.validateGrayscaleContrast('#858585', '#FFFFFF', true);
    // For #858585, ratio is ~3.66:1: fails normal AA (4.5), but passes large AA (3.0)
    const pass = !resNormal.passAA && resLarge.passAA;

    recordTest('ADV-GRAY-03', 'Distinguishes normal text (>= 4.5:1) from large text (>= 3.0:1) WCAG AA thresholds', 'GrayscaleAndEpd', pass, {
      actual: { ratio: resNormal.ratio, normalAA: resNormal.passAA, largeAA: resLarge.passAA }
    });
  } catch (err) {
    recordTest('ADV-GRAY-03', 'Distinguishes normal vs large text thresholds', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.4 Adjacent surface separation: --os-0 (#FFFFFF) and --os-50 (#F7F7F7) without hairline border FAILS
  try {
    const resNoBorder = validator.validateAdjacentSurfaces('#FFFFFF', '#F7F7F7', false);
    const pass = resNoBorder.valid === false &&
      resNoBorder.deltaL === 8 &&
      resNoBorder.error.includes('hairline border');

    recordTest('ADV-GRAY-04', 'Adjacent surfaces with Delta L < 15 without hairline border FAILS', 'GrayscaleAndEpd', pass, {
      actual: resNoBorder
    });
  } catch (err) {
    recordTest('ADV-GRAY-04', 'Adjacent surfaces without hairline border fails', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.5 Adjacent surface separation: --os-0 and --os-50 WITH hairline border PASSES
  try {
    const resWithBorder = validator.validateAdjacentSurfaces('#FFFFFF', '#F7F7F7', true);
    const pass = resWithBorder.valid === true && resWithBorder.hasHairlineBorder === true;

    recordTest('ADV-GRAY-05', 'Adjacent surfaces with Delta L < 15 WITH explicit hairline border PASSES', 'GrayscaleAndEpd', pass, {
      actual: resWithBorder
    });
  } catch (err) {
    recordTest('ADV-GRAY-05', 'Adjacent surfaces with hairline border passes', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.6 Anti-EPD watchdog: ACTION_REFRESH_SCREEN broadcast is vetoed
  try {
    const codeWithEpd = `
      fun onDismissModal() {
        context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"))
      }
    `;
    const check = validator.assertNoEpdWorkarounds(codeWithEpd);
    const pass = check.pass === false && check.error.includes('EPD workaround violation');

    recordTest('ADV-GRAY-06', 'Watchdog detects and rejects ACTION_REFRESH_SCREEN broadcast hook', 'GrayscaleAndEpd', pass, {
      actual: check
    });
  } catch (err) {
    recordTest('ADV-GRAY-06', 'Watchdog rejects ACTION_REFRESH_SCREEN', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.7 Anti-EPD watchdog: waveform mode / epd clear patterns are vetoed
  try {
    const codeWithWaveform = `
      val waveform = EpdController.REFRESH_WAVEFORM
      EpdController.setMode(waveform_mode)
    `;
    const check = validator.assertNoEpdWorkarounds(codeWithWaveform);
    const pass = check.pass === false && check.pattern.toLowerCase().includes('waveform');

    recordTest('ADV-GRAY-07', 'Watchdog detects and rejects REFRESH_WAVEFORM and waveform_mode patterns', 'GrayscaleAndEpd', pass, {
      actual: check
    });
  } catch (err) {
    recordTest('ADV-GRAY-07', 'Watchdog rejects REFRESH_WAVEFORM', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.8 Anti-EPD watchdog: artificial pauses >= 500ms are vetoed
  try {
    const codeWithPause = `
      fun clearScreen() {
        Thread.sleep(800)
      }
    `;
    const check = validator.assertNoEpdWorkarounds(codeWithPause);
    const pass = check.pass === false && check.error.includes('artificial sleep delay (800ms)');

    recordTest('ADV-GRAY-08', 'Watchdog detects and rejects artificial pause (Thread.sleep >= 500ms)', 'GrayscaleAndEpd', pass, {
      actual: check
    });
  } catch (err) {
    recordTest('ADV-GRAY-08', 'Watchdog rejects Thread.sleep >= 500ms', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // 4.9 Settle time validation: 150ms passes, <150ms fails, >=500ms fails
  try {
    const s150 = validator.validateSettleTime(150);
    const s50 = validator.validateSettleTime(50);
    const s600 = validator.validateSettleTime(600);
    const pass = s150.valid === true &&
      s50.valid === false &&
      s600.valid === false &&
      s600.error.includes('zero EPD waveform rule');

    recordTest('ADV-GRAY-09', 'Validates fluid LivePaper settle time (150ms standard, <150ms invalid, >=500ms EPD violation)', 'GrayscaleAndEpd', pass, {
      actual: { s150: s150.valid, s50: s50.valid, s600: s600.valid }
    });
  } catch (err) {
    recordTest('ADV-GRAY-09', 'Validates fluid LivePaper settle time', 'GrayscaleAndEpd', false, { error: err.message });
  }

  // ==========================================================================
  // SECTION 5: DC1 Hardware Subsystem & MCP Bridge Hardening
  // ==========================================================================
  console.log('\n--- Section 5: DC1 Hardware Subsystem & MCP Bridge Hardening ---');

  const fleetManager = new FleetManager({ leaseDir: path.join(os.tmpdir(), `ctc_challenger_leases_${Date.now()}`) });

  // 5.1 Emulator exclusion in FleetManager
  try {
    const emu1 = fleetManager.isDc1Device('emulator-5554');
    const emu2 = fleetManager.isDc1Device('emulator-5556');
    const foreign = fleetManager.isDc1Device('pixel_7_pro');
    const pass = emu1 === false && emu2 === false && foreign === false;

    recordTest('ADV-HW-01', 'FleetManager strictly excludes Android emulators and foreign devices', 'HardwareSubsystem', pass, {
      actual: { emu1, emu2, foreign }
    });
  } catch (err) {
    recordTest('ADV-HW-01', 'FleetManager excludes emulators', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.2 Real DC1 tablet recognition
  try {
    const t1 = fleetManager.isDc1Device('rooted 3');
    const t2 = fleetManager.isDc1Device('rooted 4');
    const t3 = fleetManager.isDc1Device('JMBR00380');
    const t4 = fleetManager.isDc1Device('JMBR00405');
    const pass = t1 === true && t2 === true && t3 === true && t4 === true;

    recordTest('ADV-HW-02', 'FleetManager validates authentic DC1 hardware aliases and serials', 'HardwareSubsystem', pass, {
      actual: { t1, t2, t3, t4 }
    });
  } catch (err) {
    recordTest('ADV-HW-02', 'FleetManager validates DC1 hardware', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.3 Device alias and serial resolution
  try {
    const s1 = fleetManager.resolveSerial('rooted 3');
    const s2 = fleetManager.resolveSerial('rooted 4');
    const a1 = fleetManager.resolveAlias('JMBR00380');
    const a2 = fleetManager.resolveAlias('JMBR00405');
    const pass = s1 === 'JMBR00380' && s2 === 'JMBR00405' && a1 === 'rooted 3' && a2 === 'rooted 4';

    recordTest('ADV-HW-03', 'FleetManager bidirectionally maps device aliases and serial numbers', 'HardwareSubsystem', pass, {
      actual: { s1, s2, a1, a2 }
    });
  } catch (err) {
    recordTest('ADV-HW-03', 'FleetManager maps aliases and serials', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.4 Low battery rejection (< 15%)
  try {
    // Mock fleet manager with low battery device
    class MockLowBatteryFleetManager extends FleetManager {
      discoverFleet() {
        return [{
          alias: 'rooted 3',
          serial: 'JMBR00380',
          model: 'DC_1',
          state: 'device',
          batteryLevel: 8, // 8% < 15%
          isBatterySafe: false,
          locked: false
        }];
      }
    }
    const lowBatFm = new MockLowBatteryFleetManager();
    let threw = false;
    try {
      lowBatFm.acquireDevice('rooted 3');
    } catch (e) {
      threw = /battery too low/i.test(e.message);
    }
    recordTest('ADV-HW-04', 'FleetManager aborts hardware qualification when tablet battery < 15%', 'HardwareSubsystem', threw, {
      expected: 'Throws Error matching /battery too low/i'
    });
  } catch (err) {
    recordTest('ADV-HW-04', 'FleetManager aborts on low battery', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.5 Concurrency lease collision prevention
  try {
    class MockConnectedFleetManager extends FleetManager {
      discoverFleet() {
        return [{
          alias: 'rooted 3',
          serial: 'JMBR00380',
          model: 'DC_1',
          state: 'device',
          batteryLevel: 85,
          isBatterySafe: true,
          locked: false
        }];
      }
    }
    const concFm = new MockConnectedFleetManager({ leaseDir: path.join(os.tmpdir(), `ctc_lease_${Date.now()}`) });
    concFm.acquireDevice('rooted 3', 'agent_worker_1');

    // Simulate second agent attempting to acquire the same device with different pid
    concFm.inMemoryLeases.set('JMBR00380', {
      serial: 'JMBR00380',
      owner: 'agent_worker_1',
      pid: 999999, // different pid
      timestamp: Date.now()
    });

    let threw = false;
    try {
      concFm.acquireDevice('rooted 3', 'agent_worker_2');
    } catch (e) {
      threw = /locked by active lease/i.test(e.message);
    }

    recordTest('ADV-HW-05', 'FleetManager enforces exclusive concurrency lease and prevents multi-thread collisions', 'HardwareSubsystem', threw, {
      expected: 'Throws Error matching /locked by active lease/i'
    });
  } catch (err) {
    recordTest('ADV-HW-05', 'FleetManager concurrency lease enforcement', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.6 McpBridge coordinate transform (+8px hardware inset)
  const mcpBridge = new McpBridge();
  try {
    const p1 = mcpBridge.mapLogicalToPhysical(0, 0);
    const p2 = mcpBridge.mapLogicalToPhysical(592, 792);
    const p3 = mcpBridge.mapLogicalToPhysical(1184, 1584);
    const pass = p1.physicalX === 8 && p1.physicalY === 8 &&
      p2.physicalX === 600 && p2.physicalY === 800 &&
      p3.physicalX === 1192 && p3.physicalY === 1592;

    recordTest('ADV-HW-06', 'McpBridge transforms logical coordinates to physical with +8px hardware inset', 'HardwareSubsystem', pass, {
      actual: { p1, p2, p3 }
    });
  } catch (err) {
    recordTest('ADV-HW-06', 'McpBridge coordinate transform', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.7 McpBridge coordinate boundary clamping
  try {
    const neg = mcpBridge.mapLogicalToPhysical(-50, -100);
    const over = mcpBridge.mapLogicalToPhysical(1500, 2000);
    const pass = neg.clampedLogicalX === 0 && neg.clampedLogicalY === 0 && neg.physicalX === 8 && neg.physicalY === 8 &&
      over.clampedLogicalX === 1184 && over.clampedLogicalY === 1584 && over.physicalX === 1192 && over.physicalY === 1592;

    recordTest('ADV-HW-07', 'McpBridge clamps out-of-bounds coordinates to active logical display boundary', 'HardwareSubsystem', pass, {
      actual: { neg, over }
    });
  } catch (err) {
    recordTest('ADV-HW-07', 'McpBridge coordinate boundary clamping', 'HardwareSubsystem', false, { error: err.message });
  }

  // 5.8 Modeled physiological dwell time clamping (>= 40.0ms)
  try {
    class MockTouchMcpBridge extends McpBridge {
      _runAdb(serial, cmd) {
        return '';
      }
    }
    const mockBridge = new MockTouchMcpBridge();
    const shortTap = await mockBridge.touchTap('JMBR00380', { x: 100, y: 100, dwellMs: 15.0 });
    const standardTap = await mockBridge.touchTap('JMBR00380', { x: 100, y: 100, dwellMs: 80.0 });
    const zeroTap = await mockBridge.touchTap('JMBR00380', { x: 100, y: 100, dwellMs: 0 });

    const pass = shortTap.dwellMs === 40.0 &&
      standardTap.dwellMs === 80.0 &&
      zeroTap.dwellMs === 40.0;

    recordTest('ADV-HW-08', 'Clamps capacitive touch dwell duration to physiological minimum (>= 40.0ms)', 'HardwareSubsystem', pass, {
      actual: { shortTapDwell: shortTap.dwellMs, standardTapDwell: standardTap.dwellMs, zeroTapDwell: zeroTap.dwellMs }
    });
  } catch (err) {
    recordTest('ADV-HW-08', 'Clamps touch dwell duration', 'HardwareSubsystem', false, { error: err.message });
  }

  // ==========================================================================
  // Execution Summary & Verdict
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('ADVERSARIAL SUITE SUMMARY');
  console.log('='.repeat(80));

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Adversarial Tests: ${total}`);
  console.log(`Passed:                  ${passed}`);
  console.log(`Failed / Gaps:           ${failed}`);

  if (failed > 0) {
    console.log('\n\x1b[31m[GATE VERDICT]: REQUEST_CHANGES\x1b[0m');
    console.log(`Empirically uncovered ${failed} gap(s) / vulnerability(ies):`);
    gaps.forEach((g, idx) => {
      console.log(`  ${idx + 1}. [${g.id}] ${g.name}`);
      console.log(`     Category: ${g.category}`);
      console.log(`     Finding:  ${g.details.reason || g.details.error}`);
    });
  } else {
    console.log('\n\x1b[32m[GATE VERDICT]: APPROVE\x1b[0m');
    console.log('All adversarial tests passed with zero gaps detected.');
  }

  return { total, passed, failed, gaps, verdict: failed > 0 ? 'REQUEST_CHANGES' : 'APPROVE' };
}

if (require.main === module) {
  runSuite().then(res => {
    // Exit with code matching whether unexpected errors happened
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Fatal suite failure:', err);
    process.exit(2);
  });
}

module.exports = { runSuite };
