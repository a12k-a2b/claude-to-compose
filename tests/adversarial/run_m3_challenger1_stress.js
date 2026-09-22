#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 3 Empirical Challenger Stress Suite:
 * Semantic Correspondence Engine & Deterministic Migration Planner (src/mapping/)
 *
 * Executed by: Challenger 1 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 *
 * Scope:
 * 1. Ambiguity resolution: score ties, duplicate target collisions, alternative candidate extraction,
 *    confidence classification thresholds, and anti-deception constraints.
 * 2. Cyclic dependency detection: complex circular graphs (simple, 3-node, 4-node, figure-8, self-loop,
 *    large 100-node cycle, disconnected components with cycle), verifying 3-color DFS path reconstruction
 *    and informative error throwing matching /circular|cycle/i.
 * 3. Boundary conflict detection: overlapping allowed and forbidden glob patterns across wildcard depths,
 *    deterministic error throwing matching /overlap|conflict/i, and internal wildcard glob edge cases.
 * 4. Pilot note-app non-trivial correspondence mapping: live extraction of AST from fixtures/note-app,
 *    mapping multi-widget design contracts, 6-category classification (REUSE, RETROFIT, RESTRUCTURE,
 *    NEW, CANVAS, DEPRECATE), invariant tracking (dual-tagging, Room debounce, Sol:OS tokens), and
 *    schema validation against Draft 2020-12.
 * 5. Full migration plan generation with phased topological ordering and rollback anchors.
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Subsystems under test
const {
  generateCorrespondenceMap,
  scoreCandidateMapping,
  classifyMappingConfidence,
  detectDuplicateTargets
} = require('../../src/mapping/mapper');

const {
  tokenizeIdentifier,
  computeTokenOverlap,
  computeTagScore,
  computeRoleScore,
  computeBehaviorScore,
  computeTopologyScore,
  computeTextScore,
  WEIGHTS
} = require('../../src/mapping/multi_signal_scorer');

const { classifyCategory, CATEGORIES } = require('../../src/mapping/categorizer');
const { extractAlternativeCandidates, CONFIDENCE_LEVELS } = require('../../src/mapping/ambiguity_resolver');
const { buildPreservationObligations } = require('../../src/mapping/invariant_tracker');

const {
  generateMigrationPlan,
  validateBoundaries,
  validateTaskGraph,
  computeTaskRiskScore,
  createRollbackAnchor,
  validateScreenId,
  validateForbiddenBehaviors,
  patternsOverlap,
  deriveAllowedPaths,
  PHASES,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_FORBIDDEN_BEHAVIORS
} = require('../../src/mapping/planner');

const { parseAndroidProject } = require('../../src/analyzer/index');

// Schemas
const correspondenceSchema = require('../../src/mapping/schemas/correspondence_map.json');
const planSchema = require('../../src/mapping/schemas/migration-plan.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateCorrespondenceSchema = ajv.compile(correspondenceSchema);
const validatePlanSchema = ajv.compile(planSchema);

// Test Results Tracking
const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, section, passed, details = {}) {
  results.push({ id, name, section, passed, details });
  if (passed) {
    passCount++;
    console.log(`\x1b[32m[PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`\x1b[31m[FAIL]\x1b[0m [${id}] ${name}`);
    console.log(`       \x1b[31mReason: ${details.reason || 'Assertion failed'}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
    if (details.expected !== undefined) console.log(`       Expected: ${JSON.stringify(details.expected)}`);
    if (details.actual !== undefined) console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
  }
}

async function runEmpiricalStressSuite() {
  console.log('='.repeat(80));
  console.log('MILSTONE 3 EMPIRICAL CHALLENGER STRESS SUITE (Correspondence & Planner Oracle)');
  console.log('='.repeat(80));

  // =========================================================================
  // SECTION 1: Ambiguity Resolution, Score Ties & Duplicate Collisions
  // =========================================================================
  console.log('\n--- Section 1: Ambiguity Resolution, Score Ties & Duplicate Collisions ---');

  // Test 1.1: Confidence threshold boundaries
  try {
    assert.equal(classifyMappingConfidence(0.85), CONFIDENCE_LEVELS.CONFIRMED_HIGH);
    assert.equal(classifyMappingConfidence(0.8499999), CONFIDENCE_LEVELS.CANDIDATE_MEDIUM);
    assert.equal(classifyMappingConfidence(0.50), CONFIDENCE_LEVELS.CANDIDATE_MEDIUM);
    assert.equal(classifyMappingConfidence(0.4999999), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.equal(classifyMappingConfidence(0.0), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.equal(classifyMappingConfidence(-0.5), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.equal(classifyMappingConfidence(null), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.equal(classifyMappingConfidence(undefined), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    assert.equal(classifyMappingConfidence(NaN), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    recordTest('M3-S1-01', 'Confidence boundary classification and NaN/null safety', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-01', 'Confidence boundary classification and NaN/null safety', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.2: Exact score tie in duplicate target collision
  try {
    const mappings = [
      {
        id: 'm1',
        designSourceId: 'daylight#editor/action_save_1',
        confidence: 0.88,
        existingTarget: { testTag: 'editor_save_button' }
      },
      {
        id: 'm2',
        designSourceId: 'daylight#editor/action_save_2',
        confidence: 0.88,
        existingTarget: { testTag: 'editor_save_button' }
      }
    ];
    const collisions = detectDuplicateTargets(mappings);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].existingTargetIdentifier, 'editor_save_button');
    assert.deepEqual(collisions[0].conflictingDesignSourceIds.sort(), ['daylight#editor/action_save_1', 'daylight#editor/action_save_2'].sort());
    assert.equal(collisions[0].resolution, 'UNRESOLVED_COLLISION', 'Exact tie must be marked UNRESOLVED_COLLISION');
    recordTest('M3-S1-02', 'Exact score tie collision resolves to UNRESOLVED_COLLISION', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-02', 'Exact score tie collision resolves to UNRESOLVED_COLLISION', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.3: Close score tie (diff < 0.20) in duplicate target collision
  try {
    const mappings = [
      {
        id: 'm1',
        designSourceId: 'daylight#editor/action_back_icon',
        confidence: 0.82,
        existingTarget: { composableSymbol: 'BackButton' }
      },
      {
        id: 'm2',
        designSourceId: 'daylight#editor/action_back_text',
        confidence: 0.70,
        existingTarget: { composableSymbol: 'BackButton' }
      }
    ];
    const collisions = detectDuplicateTargets(mappings);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].resolution, 'UNRESOLVED_COLLISION', 'Delta 0.12 < 0.20 must be UNRESOLVED_COLLISION');
    recordTest('M3-S1-03', 'Close score collision (diff < 0.20) resolves to UNRESOLVED_COLLISION', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-03', 'Close score collision (diff < 0.20) resolves to UNRESOLVED_COLLISION', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.4: Decisive score delta (diff >= 0.20) in duplicate target collision
  try {
    const mappings = [
      {
        id: 'm1',
        designSourceId: 'daylight#editor/primary_save',
        confidence: 0.95,
        existingTarget: { testTag: 'save_action' }
      },
      {
        id: 'm2',
        designSourceId: 'daylight#editor/secondary_save_hint',
        confidence: 0.65,
        existingTarget: { testTag: 'save_action' }
      }
    ];
    const collisions = detectDuplicateTargets(mappings);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].resolution, 'PRIMARY_WINS', 'Delta 0.30 >= 0.20 must be PRIMARY_WINS');
    recordTest('M3-S1-04', 'Decisive score delta (diff >= 0.20) resolves to PRIMARY_WINS', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-04', 'Decisive score delta (diff >= 0.20) resolves to PRIMARY_WINS', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.5: Multi-way collision (4 design nodes targeting same symbol)
  try {
    const mappings = [
      { id: 'm1', designSourceId: 'node_1', confidence: 0.85, existingTarget: { testTag: 'shared_tag' } },
      { id: 'm2', designSourceId: 'node_2', confidence: 0.84, existingTarget: { testTag: 'shared_tag' } },
      { id: 'm3', designSourceId: 'node_3', confidence: 0.70, existingTarget: { testTag: 'shared_tag' } },
      { id: 'm4', designSourceId: 'node_4', confidence: 0.50, existingTarget: { testTag: 'shared_tag' } }
    ];
    const collisions = detectDuplicateTargets(mappings);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].conflictingDesignSourceIds.length, 4);
    assert.equal(collisions[0].resolution, 'UNRESOLVED_COLLISION', 'Diff between top 2 is 0.01 < 0.20');
    recordTest('M3-S1-05', 'Multi-way collision correctly clusters all 4 conflicting nodes', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-05', 'Multi-way collision correctly clusters all 4 conflicting nodes', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.6: Alternative candidate extraction under score ties
  try {
    const candidates = [
      { candidate: { symbol: 'TitleInput' }, confidence: 0.90 },
      { candidate: { symbol: 'HeaderInput' }, confidence: 0.90 }, // exact tie
      { candidate: { symbol: 'BodyInput' }, confidence: 0.85 },   // within 0.15 tolerance
      { candidate: { symbol: 'FooterNotes' }, confidence: 0.70 }, // outside 0.15 tolerance (diff 0.20)
      { candidate: { symbol: 'Settings' }, confidence: 0.20 }
    ];
    const alternatives = extractAlternativeCandidates(candidates, 0.15);
    assert.equal(alternatives.length, 2, 'Should include HeaderInput and BodyInput');
    assert.equal(alternatives[0].symbol, 'HeaderInput');
    assert.equal(alternatives[0].confidence, 0.90);
    assert.equal(alternatives[1].symbol, 'BodyInput');
    assert.equal(alternatives[1].confidence, 0.85);
    recordTest('M3-S1-06', 'Extract alternative candidates detects tied and near-tied candidates within tolerance', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-06', 'Extract alternative candidates detects tied and near-tied candidates within tolerance', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.7: Alternative candidates with single or empty candidate lists
  try {
    assert.deepEqual(extractAlternativeCandidates([]), []);
    assert.deepEqual(extractAlternativeCandidates([{ candidate: { symbol: 'Solo' }, confidence: 0.95 }]), []);
    recordTest('M3-S1-07', 'Alternative candidate extractor handles edge cases (0 or 1 candidate) gracefully', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-07', 'Alternative candidate extractor handles edge cases (0 or 1 candidate) gracefully', 'Ambiguity', false, { error: err.message });
  }

  // Test 1.8: Anti-deception rule: visual text match cannot override structural signals
  try {
    const scored = scoreCandidateMapping(
      { text: 'Delete Note Forever', sourceId: 'unknown_dom_node_99' },
      { text: 'Delete Note Forever', symbol: 'NoteAppTheme', testTag: 'theme_container' }
    );
    assert.ok(scored.confidence < 0.50, `Confidence was ${scored.confidence}, must be strictly < 0.50`);
    assert.equal(classifyMappingConfidence(scored.confidence), CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY);
    recordTest('M3-S1-08', 'Anti-deception gate caps text-only match below 0.50 threshold', 'Ambiguity', true);
  } catch (err) {
    recordTest('M3-S1-08', 'Anti-deception gate caps text-only match below 0.50 threshold', 'Ambiguity', false, { error: err.message });
  }

  // =========================================================================
  // SECTION 2: Cyclic Dependency Detection in Migration Planner
  // =========================================================================
  console.log('\n--- Section 2: Cyclic Dependency Detection & Topological Ordering ---');

  // Test 2.1: Simple 2-node cycle: A -> B -> A
  try {
    const tasks = [
      { id: 'TaskA', dependencies: ['TaskB'] },
      { id: 'TaskB', dependencies: ['TaskA'] }
    ];
    assert.throws(
      () => validateTaskGraph(tasks),
      /circular|cycle/i,
      'Must throw error matching /circular|cycle/i'
    );
    recordTest('M3-S2-01', 'Direct 2-node cycle (A <-> B) detected and rejected', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-01', 'Direct 2-node cycle (A <-> B) detected and rejected', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.2: 3-node cycle: A -> B -> C -> A with path verification
  try {
    const tasks = [
      { id: 'TaskA', dependencies: ['TaskB'] },
      { id: 'TaskB', dependencies: ['TaskC'] },
      { id: 'TaskC', dependencies: ['TaskA'] }
    ];
    let caught = false;
    try {
      validateTaskGraph(tasks);
    } catch (err) {
      caught = true;
      assert.match(err.message, /circular|cycle/i);
      // Verify cycle path contains the nodes
      assert.ok(
        (err.message.includes('TaskA') && err.message.includes('TaskB') && err.message.includes('TaskC')),
        `Cycle error should mention cycle tasks: ${err.message}`
      );
    }
    assert.ok(caught, 'validateTaskGraph must throw on 3-node cycle');
    recordTest('M3-S2-02', '3-node cycle (A -> B -> C -> A) identifies cycle path nodes in error', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-02', '3-node cycle (A -> B -> C -> A) identifies cycle path nodes in error', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.3: 4-node cycle embedded after linear prefix: Root -> Lead -> A -> B -> C -> D -> A
  try {
    const tasks = [
      { id: 'Root', dependencies: [] },
      { id: 'Lead', dependencies: ['Root'] },
      { id: 'A', dependencies: ['Lead', 'D'] },
      { id: 'B', dependencies: ['A'] },
      { id: 'C', dependencies: ['B'] },
      { id: 'D', dependencies: ['C'] }
    ];
    assert.throws(
      () => validateTaskGraph(tasks),
      /circular|cycle/i
    );
    recordTest('M3-S2-03', 'Embedded 4-node cycle after linear prefix detected', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-03', 'Embedded 4-node cycle after linear prefix detected', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.4: Self-loop: A -> A
  try {
    const tasks = [
      { id: 'TaskSelf', dependencies: ['TaskSelf'] }
    ];
    assert.throws(
      () => validateTaskGraph(tasks),
      /circular|cycle/i
    );
    recordTest('M3-S2-04', 'Self-loop (A -> A) detected and rejected', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-04', 'Self-loop (A -> A) detected and rejected', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.5: Complex figure-8 / touching cycles: A -> B -> C -> A and C -> D -> E -> C
  try {
    const tasks = [
      { id: 'A', dependencies: ['B'] },
      { id: 'B', dependencies: ['C'] },
      { id: 'C', dependencies: ['A', 'D'] },
      { id: 'D', dependencies: ['E'] },
      { id: 'E', dependencies: ['C'] }
    ];
    assert.throws(
      () => validateTaskGraph(tasks),
      /circular|cycle/i
    );
    recordTest('M3-S2-05', 'Figure-8 dual circular graph detected', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-05', 'Figure-8 dual circular graph detected', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.6: Disconnected forest where component 1 is a valid DAG but component 2 has a cycle
  try {
    const tasks = [
      // Component 1: Valid DAG
      { id: 'DAG_Root', dependencies: [] },
      { id: 'DAG_Child1', dependencies: ['DAG_Root'] },
      { id: 'DAG_Child2', dependencies: ['DAG_Root'] },
      { id: 'DAG_Sink', dependencies: ['DAG_Child1', 'DAG_Child2'] },
      // Component 2: Cycle
      { id: 'Cyc_X', dependencies: ['Cyc_Y'] },
      { id: 'Cyc_Y', dependencies: ['Cyc_Z'] },
      { id: 'Cyc_Z', dependencies: ['Cyc_X'] }
    ];
    assert.throws(
      () => validateTaskGraph(tasks),
      /circular|cycle/i
    );
    recordTest('M3-S2-06', 'Cycle in secondary disconnected graph component detected', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-06', 'Cycle in secondary disconnected graph component detected', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.7: Large 100-node circular ring
  try {
    const N = 100;
    const largeRingTasks = [];
    for (let i = 0; i < N; i++) {
      const nextId = `Task_${(i + 1) % N}`;
      largeRingTasks.push({
        id: `Task_${i}`,
        dependencies: [nextId]
      });
    }
    assert.throws(
      () => validateTaskGraph(largeRingTasks),
      /circular|cycle/i
    );
    recordTest('M3-S2-07', 'Large 100-node circular ring detected without stack overflow', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-07', 'Large 100-node circular ring detected without stack overflow', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.8: Diamond DAG (Acyclic): A -> B, A -> C, B -> D, C -> D
  try {
    // D has no dependencies. B and C depend on D. A depends on B and C.
    const diamondTasks = [
      { id: 'D', dependencies: [] },
      { id: 'B', dependencies: ['D'] },
      { id: 'C', dependencies: ['D'] },
      { id: 'A', dependencies: ['B', 'C'] }
    ];
    const res = validateTaskGraph(diamondTasks);
    assert.equal(res.hasCycles, false);
    assert.equal(res.isValid, true);
    assert.ok(res.topologicalOrder.indexOf('D') < res.topologicalOrder.indexOf('B'));
    assert.ok(res.topologicalOrder.indexOf('D') < res.topologicalOrder.indexOf('C'));
    assert.ok(res.topologicalOrder.indexOf('B') < res.topologicalOrder.indexOf('A'));
    assert.ok(res.topologicalOrder.indexOf('C') < res.topologicalOrder.indexOf('A'));
    // Parallel batches: Batch 0 = [D], Batch 1 = [B, C], Batch 2 = [A]
    assert.equal(res.parallelBatches.length, 3);
    assert.deepEqual(res.parallelBatches[0], ['D']);
    assert.deepEqual(res.parallelBatches[1].sort(), ['B', 'C'].sort());
    assert.deepEqual(res.parallelBatches[2], ['A']);
    recordTest('M3-S2-08', 'Diamond DAG topological sort and parallel batches validation', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-08', 'Diamond DAG topological sort and parallel batches validation', 'Cycle Detection', false, { error: err.message });
  }

  // Test 2.9: Tolerance of external dependencies not in tasks list
  try {
    const tasksWithExternal = [
      { id: 'LocalA', dependencies: ['ExternalSystemLibrary', 'LocalB'] },
      { id: 'LocalB', dependencies: [] }
    ];
    const res = validateTaskGraph(tasksWithExternal);
    assert.equal(res.hasCycles, false);
    assert.ok(res.topologicalOrder.indexOf('LocalB') < res.topologicalOrder.indexOf('LocalA'));
    recordTest('M3-S2-09', 'External dependency IDs safely ignored and skipped', 'Cycle Detection', true);
  } catch (err) {
    recordTest('M3-S2-09', 'External dependency IDs safely ignored and skipped', 'Cycle Detection', false, { error: err.message });
  }

  // =========================================================================
  // SECTION 3: Boundary Conflict Detection & Glob Overlap
  // =========================================================================
  console.log('\n--- Section 3: Boundary Conflict Detection & Glob Overlap ---');

  // Test 3.1: Identical paths conflict
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['app/src/main/java/com/example/notes/ui/editor/NoteEditorScreen.kt'],
        forbidden: ['app/src/main/java/com/example/notes/ui/editor/NoteEditorScreen.kt']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-01', 'Direct identical path in allowed and forbidden throws conflict error', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-01', 'Direct identical path in allowed and forbidden throws conflict error', 'Boundaries', false, { error: err.message });
  }

  // Test 3.2: Universal root glob conflict
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['**'],
        forbidden: ['app/src/main/java/com/example/notes/data/**']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-02', 'Root wildcard (**) in allowed throws conflict with forbidden paths', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-02', 'Root wildcard (**) in allowed throws conflict with forbidden paths', 'Boundaries', false, { error: err.message });
  }

  // Test 3.3: Allowed encompasses forbidden subpath
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['app/src/main/java/**'],
        forbidden: ['app/src/main/java/data/**']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-03', 'Allowed parent glob encompassing forbidden subpath throws conflict error', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-03', 'Allowed parent glob encompassing forbidden subpath throws conflict error', 'Boundaries', false, { error: err.message });
  }

  // Test 3.4: Forbidden glob encompasses allowed subpath
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['app/src/main/java/data/NoteDao.kt'],
        forbidden: ['app/src/main/java/data/**']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-04', 'Forbidden directory encompassing allowed file throws conflict error', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-04', 'Forbidden directory encompassing allowed file throws conflict error', 'Boundaries', false, { error: err.message });
  }

  // Test 3.5: Disjoint sibling directories pass cleanly
  try {
    const res = validateBoundaries({
      allowed: [
        'app/src/main/java/com/example/notes/ui/editor/**',
        'app/src/main/java/com/example/notes/ui/theme/**'
      ],
      forbidden: [
        'app/src/main/java/com/example/notes/data/**',
        'app/src/main/java/com/example/notes/dao/**',
        '**/build.gradle*'
      ]
    });
    assert.equal(res.valid, true);
    recordTest('M3-S3-05', 'Cleanly disjoint sibling boundaries pass validation without error', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-05', 'Cleanly disjoint sibling boundaries pass validation without error', 'Boundaries', false, { error: err.message });
  }

  // Test 3.6: False-positive prefix prevention (e.g. data_v2 should not conflict with data)
  try {
    assert.equal(patternsOverlap('app/src/data_v2/**', 'app/src/data/**'), false);
    recordTest('M3-S3-06', 'Prefix collision guard: data_v2 does not falsely match data/**', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-06', 'Prefix collision guard: data_v2 does not falsely match data/**', 'Boundaries', false, { error: err.message });
  }

  // Test 3.7: Backslash vs forward-slash normalization
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['app\\src\\main\\java\\ui\\**'],
        forbidden: ['app/src/main/java/ui/**']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-07', 'Windows-style backslashes normalized and detected as overlapping', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-07', 'Windows-style backslashes normalized and detected as overlapping', 'Boundaries', false, { error: err.message });
  }

  // Test 3.8: Forbidden behavior rule rejection on invalid inputs
  try {
    assert.throws(() => validateForbiddenBehaviors('not-an-array'), /array/i);
    assert.throws(() => validateForbiddenBehaviors(['valid rule', null]), /invalid/i);
    assert.throws(() => validateForbiddenBehaviors(['valid rule', 123]), /invalid/i);
    assert.throws(() => validateForbiddenBehaviors(['valid rule', '   ']), /invalid/i);
    recordTest('M3-S3-08', 'Forbidden behaviors array validation rejects null, numeric, or whitespace entries', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-08', 'Forbidden behaviors array validation rejects null, numeric, or whitespace entries', 'Boundaries', false, { error: err.message });
  }

  // Test 3.9: Empirical Challenger Finding: Internal wildcard glob pattern boundary overlap
  // DEFAULT_FORBIDDEN_PATHS declares 'app/src/main/java/**/data/**'.
  // If allowed is 'app/src/main/java/com/example/notes/data/**', does validateBoundaries detect the conflict?
  try {
    assert.throws(
      () => validateBoundaries({
        allowed: ['app/src/main/java/com/example/notes/data/**'],
        forbidden: ['app/src/main/java/**/data/**']
      }),
      /overlap|conflict/i
    );
    recordTest('M3-S3-09', 'Internal wildcard forbidden pattern (**/data/**) detects allowed subpath conflict', 'Boundaries', true);
  } catch (err) {
    recordTest('M3-S3-09', 'Internal wildcard forbidden pattern (**/data/**) detects allowed subpath conflict', 'Boundaries', false, {
      reason: 'VULNERABILITY: patternsOverlap uses naive prefix match without resolving internal ** wildcards',
      error: err.message
    });
  }

  // =========================================================================
  // SECTION 4: Pilot Note-App Fixture Non-Trivial Correspondence Mapping
  // =========================================================================
  console.log('\n--- Section 4: Pilot Note-App Fixture Correspondence Mapping ---');

  let appModel = null;
  try {
    // Live parse the real Android note-app pilot fixture
    appModel = await parseAndroidProject('./fixtures/note-app', 'app');
    assert.ok(appModel && appModel.screens && appModel.screens.length >= 4);
    recordTest('M3-S4-01', 'Live AST extraction of note-app fixture succeeds', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-01', 'Live AST extraction of note-app fixture succeeds', 'Pilot Mapping', false, { error: err.message });
  }

  // Construct a realistic Claude Design contract for the note_editor screen
  const pilotDesignContract = {
    version: '2.0.0',
    provenance: {
      measuredScenesHash: 'a'.repeat(64),
      layoutIntentHash: 'b'.repeat(64),
      behaviorContractHash: 'c'.repeat(64),
      designSystemHash: 'd'.repeat(64)
    },
    measuredScenes: {
      scenes: {
        portrait: {
          rootNode: {
            sourceId: 'daylight#note_editor/root',
            domTag: 'div',
            category: 'container',
            boundsDp: { x: 0, y: 0, width: 1184, height: 1584 },
            children: [
              {
                sourceId: 'daylight#note_editor/toolbar',
                domTag: 'header',
                category: 'row',
                boundsDp: { x: 0, y: 0, width: 1184, height: 64 },
                children: [
                  {
                    sourceId: 'daylight#note_editor/toolbar/back_btn',
                    domTag: 'button',
                    category: 'button',
                    role: 'button',
                    semantics: { role: 'Button', isInteractive: true },
                    boundsDp: { x: 8, y: 8, width: 48, height: 48 },
                    text: 'Back'
                  },
                  {
                    sourceId: 'daylight#note_editor/toolbar/pin_btn',
                    domTag: 'button',
                    category: 'button',
                    role: 'button',
                    semantics: { role: 'Button', isInteractive: true },
                    boundsDp: { x: 1060, y: 8, width: 48, height: 48 },
                    text: 'Pin'
                  }
                ]
              },
              {
                sourceId: 'daylight#note_editor/title_input',
                domTag: 'input',
                category: 'textbox',
                role: 'textbox',
                semantics: { role: 'input' },
                boundsDp: { x: 24, y: 80, width: 1136, height: 56 },
                text: 'Note Title'
              },
              {
                sourceId: 'daylight#note_editor/content_input',
                domTag: 'textarea',
                category: 'textbox',
                role: 'textbox',
                semantics: { role: 'input' },
                boundsDp: { x: 24, y: 200, width: 1136, height: 800 },
                text: 'Note body text goes here'
              },
              {
                sourceId: 'daylight#note_editor/word_count_chip',
                domTag: 'div',
                category: 'badge',
                role: 'generic',
                semantics: { role: 'Generic' },
                boundsDp: { x: 24, y: 1020, width: 100, height: 32 },
                text: '42 words'
              },
              {
                sourceId: 'daylight#note_editor/ink_canvas_layer',
                domTag: 'canvas',
                category: 'canvas',
                role: 'presentation',
                vectorData: '<svg><path d="M0 0 L100 100" /></svg>',
                boundsDp: { x: 0, y: 0, width: 1184, height: 1584 }
              }
            ]
          }
        }
      }
    }
  };

  let correspondenceMap = null;
  try {
    correspondenceMap = generateCorrespondenceMap({
      appModel,
      designContract: pilotDesignContract,
      screenId: 'note_editor'
    });

    assert.equal(correspondenceMap.version, '2.0.0');
    assert.equal(correspondenceMap.screenId, 'note_editor');
    assert.ok(correspondenceMap.mappings.length >= 2, `Expected >= 2 mappings, got ${correspondenceMap.mappings.length}`);
    recordTest('M3-S4-02', 'generateCorrespondenceMap executes against live note-app fixture', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-02', 'generateCorrespondenceMap executes against live note-app fixture', 'Pilot Mapping', false, { error: err.message });
  }

  // Test 4.3: Empirical Challenger Finding: Element-level testTag candidate resolution vs screen candidate swallowing
  try {
    const titleMapping = correspondenceMap.mappings.find(m => m.designSourceId === 'daylight#note_editor/title_input');
    assert.ok(titleMapping, 'Title input mapping must exist');
    assert.equal(
      titleMapping.existingTarget.testTag,
      'editor_title_input',
      `Title input must map to element-level testTag 'editor_title_input', but mapped to '${titleMapping.existingTarget.testTag}'`
    );
    recordTest('M3-S4-03', 'Element-level testTag candidate resolution (title_input -> editor_title_input)', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-03', 'Element-level testTag candidate resolution (title_input -> editor_title_input)', 'Pilot Mapping', false, {
      reason: 'DEFECT: Screen-level candidate absorbs all screen testTags and wins score ties due to insertion order, collapsing all child inputs to screen_note_editor',
      error: err.message
    });
  }

  // Test 4.4: Empirical Challenger Finding: New component isolation vs false-positive token overlap
  try {
    const newComp = correspondenceMap.unmappedDesignNodes.find(n => n.designSourceId === 'daylight#note_editor/word_count_chip');
    assert.ok(newComp, 'Word count chip must be in unmappedDesignNodes');
    assert.equal(newComp.disposition, 'NEW_COMPONENT');
    recordTest('M3-S4-04', 'New component isolation (word_count_chip -> NEW_COMPONENT)', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-04', 'New component isolation (word_count_chip -> NEW_COMPONENT)', 'Pilot Mapping', false, {
      reason: 'DEFECT: word_count_chip contains screen slug (note_editor), causing spurious tag/topology score (0.671 >= 0.50) that promotes it to RETROFIT_STYLE',
      error: err.message
    });
  }

  // Test 4.5: Canvas component classification
  try {
    const canvasComp = correspondenceMap.unmappedDesignNodes.find(n => n.designSourceId === 'daylight#note_editor/ink_canvas_layer');
    assert.ok(canvasComp, 'Ink canvas layer must be unmapped design node');
    assert.equal(canvasComp.disposition, 'REPLACE_CANVAS');
    recordTest('M3-S4-05', 'Canvas component classification (ink_canvas_layer -> REPLACE_CANVAS)', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-05', 'Canvas component classification (ink_canvas_layer -> REPLACE_CANVAS)', 'Pilot Mapping', false, { error: err.message });
  }

  // Test 4.6: Duplicate target collision detection operational check
  try {
    assert.ok(Array.isArray(correspondenceMap.duplicateCollisions));
    // Verify duplicate target detector correctly flagged the multiple design nodes claiming screen_note_editor
    const collision = correspondenceMap.duplicateCollisions.find(c => c.existingTargetIdentifier === 'screen_note_editor');
    assert.ok(collision, 'Duplicate collision detector must record collision on screen_note_editor');
    assert.equal(collision.resolution, 'UNRESOLVED_COLLISION');
    recordTest('M3-S4-06', 'Duplicate target collision detector operational and flags collisions', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-06', 'Duplicate target collision detector operational and flags collisions', 'Pilot Mapping', false, { error: err.message });
  }

  // Test 4.7: CorrespondenceMap JSON Schema (Draft 2020-12) validation
  try {
    const isValid = validateCorrespondenceSchema(correspondenceMap);
    if (!isValid) {
      console.error('AJV errors:', validateCorrespondenceSchema.errors);
    }
    assert.equal(isValid, true, 'CorrespondenceMap must conform to schema');
    recordTest('M3-S4-07', 'Pilot CorrespondenceMap strictly conforms to Draft 2020-12 Schema', 'Pilot Mapping', true);
  } catch (err) {
    recordTest('M3-S4-07', 'Pilot CorrespondenceMap strictly conforms to Draft 2020-12 Schema', 'Pilot Mapping', false, { error: err.message });
  }

  // =========================================================================
  // SECTION 5: End-to-End Migration Plan Generation & Schema Conformance
  // =========================================================================
  console.log('\n--- Section 5: Migration Plan Generation & Schema Conformance ---');

  let migrationPlan = null;
  try {
    migrationPlan = generateMigrationPlan({
      screenId: 'note_editor',
      correspondenceMap,
      appModel,
      designContract: pilotDesignContract
    });

    assert.equal(migrationPlan.screenId, 'note_editor');
    assert.equal(migrationPlan.phases.length, 5);
    recordTest('M3-S5-01', 'generateMigrationPlan synthesizes 5 phases from pilot correspondence map', 'Planner', true);
  } catch (err) {
    recordTest('M3-S5-01', 'generateMigrationPlan synthesizes 5 phases from pilot correspondence map', 'Planner', false, { error: err.message });
  }

  // Test 5.2: Rollback anchors on every phase
  try {
    for (let i = 0; i < 5; i++) {
      const phase = migrationPlan.phases[i];
      assert.ok(phase.rollbackAnchor, `Phase ${i} must have rollback anchor`);
      assert.ok(phase.rollbackAnchor.gitCheckpoint.startsWith('ctc-anchor-'));
      assert.ok(phase.rollbackAnchor.rollbackCommand.includes('git checkout'));
      assert.ok(phase.rollbackAnchor.verificationGate, `Phase ${i} must have verification gate`);
    }
    recordTest('M3-S5-02', 'All 5 phases contain immutable rollback anchors with git checkpoints', 'Planner', true);
  } catch (err) {
    recordTest('M3-S5-02', 'All 5 phases contain immutable rollback anchors with git checkpoints', 'Planner', false, { error: err.message });
  }

  // Test 5.3: Topological ordering of all generated tasks
  try {
    assert.ok(Array.isArray(migrationPlan.dependencyGraph.topologicalOrder));
    assert.ok(migrationPlan.dependencyGraph.topologicalOrder.length >= 10);
    assert.equal(migrationPlan.dependencyGraph.hasCycles, false);

    // Verify baseline task is first, verification task is last
    const order = migrationPlan.dependencyGraph.topologicalOrder;
    assert.equal(order[0], 'TASK-P0-001');
    assert.equal(order[order.length - 1], 'TASK-P4-003');
    recordTest('M3-S5-03', 'Topological task ordering verified across 5 execution phases', 'Planner', true);
  } catch (err) {
    recordTest('M3-S5-03', 'Topological task ordering verified across 5 execution phases', 'Planner', false, { error: err.message });
  }

  // Test 5.4: MigrationPlan JSON Schema (Draft 2020-12) validation
  try {
    const isValid = validatePlanSchema(migrationPlan);
    if (!isValid) {
      console.error('AJV errors:', validatePlanSchema.errors);
    }
    assert.equal(isValid, true, 'MigrationPlan must conform to Draft 2020-12 Schema');
    recordTest('M3-S5-04', 'Generated MigrationPlan strictly conforms to Draft 2020-12 Schema', 'Planner', true);
  } catch (err) {
    recordTest('M3-S5-04', 'Generated MigrationPlan strictly conforms to Draft 2020-12 Schema', 'Planner', false, { error: err.message });
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`STRESS SUITE SUMMARY: Total: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(80));

  return {
    total: results.length,
    passed: passCount,
    failed: failCount,
    results
  };
}

if (require.main === module) {
  runEmpiricalStressSuite().then(summary => {
    // Exit with count of failures
    process.exit(summary.failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Fatal stress suite execution error:', err);
    process.exit(1);
  });
}

module.exports = { runEmpiricalStressSuite };
