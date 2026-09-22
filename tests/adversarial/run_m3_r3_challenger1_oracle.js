#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 3 Round 3 Empirical Challenger 1 Stress & Oracle Suite
 *
 * Exhaustively stress-tests:
 * 1. Deep null, undefined, malformed, and type-mismatch handling in invariant_tracker,
 *    multi_signal_scorer, ambiguity_resolver, and planner.
 * 2. Glob overlap boundary conditions (disjoint extensions, prefix traps, wildcard combos).
 * 3. Topological sort and cycle detection under extreme topologies (self-loops, disconnected
 *    graphs, dense DAGs, large components).
 * 4. Correspondence mapping integrity against live Note App fixture and mock contracts.
 * 5. Draft 2020-12 Schema conformance of generated artifacts.
 *
 * Executed by: Challenger 1 R3 (Correspondence & Planner Oracle)
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Subsystems under test
const tracker = require('../../src/mapping/invariant_tracker');
const planner = require('../../src/mapping/planner');
const ambiguityResolver = require('../../src/mapping/ambiguity_resolver');
const scorer = require('../../src/mapping/multi_signal_scorer');
const mapper = require('../../src/mapping/mapper');
const { parseAndroidProject } = require('../../src/analyzer/index');

// Schemas
const correspondenceSchema = require('../../src/mapping/schemas/correspondence_map.json');
const planSchema = require('../../src/mapping/schemas/migration-plan.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateCorrespondenceSchema = ajv.compile(correspondenceSchema);
const validatePlanSchema = ajv.compile(planSchema);

let passCount = 0;
let failCount = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passCount++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${name}`);
  } catch (err) {
    failCount++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

async function run() {
  console.log('='.repeat(80));
  console.log('M3 ROUND 3 CHALLENGER 1 ADVERSARIAL ORACLE SUITE');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  console.log('\n--- Section 1: Invariant Tracker Robustness & Null Safety ---');
  // --------------------------------------------------------------------------

  test('Tracker: handles all combinations of null/undefined/empty parameters', () => {
    const r1 = tracker.buildPreservationObligations(null, null);
    assert.ok(Array.isArray(r1) && r1.includes('ENFORCE_DAYLIGHT_SOL_OS_TOKENS'));

    const r2 = tracker.buildPreservationObligations(undefined, undefined, undefined);
    assert.ok(Array.isArray(r2) && r2.includes('ZERO_EPD_WAVEFORMS_PROHIBITION'));

    const r3 = tracker.buildPreservationObligations({}, {});
    assert.ok(Array.isArray(r3) && r3.includes('ENFORCE_DAYLIGHT_SOL_OS_TOKENS'));

    const r4 = tracker.buildPreservationObligations(null, { testTag: 'note_title' });
    assert.ok(r4.includes('PRESERVE_TEST_TAG:note_title'));

    const r5 = tracker.buildPreservationObligations({ sourceId: 'editor_title' }, null);
    assert.ok(r5.includes('ATTACH_CTC_SEMANTICS:editor_title'));
  });

  test('Tracker: handles deeply nested malformed objects without exception', () => {
    const malformedDesign = {
      sourceId: 'btn_action',
      boundsDp: null,
      semantics: { isInteractive: null, contentDescription: undefined }
    };
    const malformedTarget = {
      testTag: null,
      testTags: [null, undefined],
      contentDescription: null,
      isLambda: true,
      targetType: 'PARAMETER_LAMBDA',
      composableSymbol: null,
      symbol: undefined
    };
    const res = tracker.buildPreservationObligations(malformedDesign, malformedTarget);
    assert.ok(Array.isArray(res));
    assert.ok(res.includes('PRESERVE_MIN_TOUCH_TARGET_48DP'));
    assert.ok(res.includes('PRESERVE_ACTION_BINDING:onAction'));
  });

  test('Tracker: correctly detects Room persistence autosave debounce for note/editor targets', () => {
    const res = tracker.buildPreservationObligations(
      { sourceId: 'note_content_field' },
      { symbol: 'NoteEditorScreen', testTag: 'editor_body' }
    );
    assert.ok(res.includes('PRESERVE_ROOM_AUTOSAVE_DEBOUNCE'));
    assert.ok(res.includes('LOCK_FORBIDDEN_PATH:data/**'));
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Multi-Signal Scorer & Tokenizer Stress ---');
  // --------------------------------------------------------------------------

  test('Scorer: computeTokenOverlap handles null, undefined, empty, and non-array arguments', () => {
    assert.equal(scorer.computeTokenOverlap(null, null), 0.0);
    assert.equal(scorer.computeTokenOverlap(undefined, undefined), 0.0);
    assert.equal(scorer.computeTokenOverlap([], []), 0.0);
    assert.equal(scorer.computeTokenOverlap(['a'], null), 0.0);
    assert.equal(scorer.computeTokenOverlap(null, ['b']), 0.0);
    assert.equal(scorer.computeTokenOverlap('str', {}), 0.0);
  });

  test('Scorer: computeTokenOverlap Jaccard accuracy', () => {
    assert.equal(scorer.computeTokenOverlap(['a', 'b'], ['b', 'c']), 1 / 3);
    assert.equal(scorer.computeTokenOverlap(['a', 'b'], ['a', 'b']), 1.0);
    assert.equal(scorer.computeTokenOverlap(['a'], ['b']), 0.0);
  });

  test('Scorer: all scoring functions survive null arguments', () => {
    assert.equal(typeof scorer.computeTagScore(null, null), 'number');
    assert.equal(typeof scorer.computeRoleScore(null, null), 'number');
    assert.equal(typeof scorer.computeBehaviorScore(null, null), 'number');
    assert.equal(typeof scorer.computeTopologyScore(null, null), 'number');
    assert.equal(typeof scorer.computeTextScore(null, null), 'number');
    const scored = scorer.scoreCandidateMapping(null, null);
    assert.equal(typeof scored.confidence, 'number');
    assert.ok(scored.confidence < 0.50);
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Ambiguity Resolver & Alternative Candidates ---');
  // --------------------------------------------------------------------------

  test('Ambiguity: extractAlternativeCandidates handles null, corrupt, and single items', () => {
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates(null), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates(undefined), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates([]), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates([null, null]), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates([{ candidate: null, confidence: 0.9 }]), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates([{ candidate: { symbol: 'A' }, confidence: NaN }]), []);
    assert.deepEqual(ambiguityResolver.extractAlternativeCandidates([{ candidate: { symbol: 'A' }, confidence: 0.9 }]), []);
  });

  test('Ambiguity: extractAlternativeCandidates selects candidates within tolerance correctly', () => {
    const list = [
      { candidate: { symbol: 'Winner' }, confidence: 0.92 },
      { candidate: { symbol: 'RunnerUp' }, confidence: 0.88 }, // diff 0.04 <= 0.10
      { candidate: { symbol: 'ThirdPlace' }, confidence: 0.70 } // diff 0.22 > 0.10
    ];
    const alts = ambiguityResolver.extractAlternativeCandidates(list, 0.10);
    assert.equal(alts.length, 1);
    assert.equal(alts[0].symbol, 'RunnerUp');
  });

  test('Ambiguity: detectDuplicateTargets handles score ties and clear margins', () => {
    // Score tie (< 0.20 diff) -> UNRESOLVED_COLLISION
    const ties = [
      { id: 'm1', designSourceId: 'src_1', confidence: 0.85, existingTarget: { testTag: 'tag_x' } },
      { id: 'm2', designSourceId: 'src_2', confidence: 0.80, existingTarget: { testTag: 'tag_x' } }
    ];
    const c1 = ambiguityResolver.detectDuplicateTargets(ties);
    assert.equal(c1.length, 1);
    assert.equal(c1[0].resolution, 'UNRESOLVED_COLLISION');

    // Decisive margin (>= 0.20 diff) -> PRIMARY_WINS
    const decisive = [
      { id: 'm1', designSourceId: 'src_1', confidence: 0.90, existingTarget: { testTag: 'tag_x' } },
      { id: 'm2', designSourceId: 'src_2', confidence: 0.60, existingTarget: { testTag: 'tag_x' } }
    ];
    const c2 = ambiguityResolver.detectDuplicateTargets(decisive);
    assert.equal(c2.length, 1);
    assert.equal(c2[0].resolution, 'PRIMARY_WINS');
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Boundary Glob Overlap & Planner Integrity ---');
  // --------------------------------------------------------------------------

  test('Planner: patternsOverlap discriminates file extensions correctly', () => {
    // Worker R3 fixed: disjoint extensions must NOT collide
    assert.equal(planner.patternsOverlap('app/**/ui/**/*.kt', 'app/**/ui/**/*.xml'), false);
    assert.equal(planner.patternsOverlap('app/**/ui/**/*.kt', 'app/**/ui/**/*.kt'), true);
    assert.equal(planner.patternsOverlap('src/main/res/values/*.xml', 'src/main/java/*.kt'), false);
  });

  test('Planner: patternsOverlap handles exact file matches vs directory globs', () => {
    assert.equal(planner.patternsOverlap('app/ui/HomeScreen.kt', 'app/ui/HomeScreen.kt'), true);
    assert.equal(planner.patternsOverlap('app/ui/HomeScreen.kt', 'app/ui/DetailScreen.kt'), false);
    assert.equal(planner.patternsOverlap('app/ui/**', 'app/ui/HomeScreen.kt'), true);
    assert.equal(planner.patternsOverlap('app/ui/HomeScreen.kt', 'app/ui/**'), true);
  });

  test('Planner: computeTaskRiskScore null and default safety', () => {
    const sNull = planner.computeTaskRiskScore(null);
    assert.equal(typeof sNull.score, 'number');
    assert.equal(sNull.level, 'LOW');

    const sUndefined = planner.computeTaskRiskScore(undefined);
    assert.equal(typeof sUndefined.score, 'number');

    const sCritical = planner.computeTaskRiskScore({
      filePath: 'app/src/main/java/data/NoteDao.kt',
      dependents: ['t1', 't2', 't3', 't4', 't5'],
      preservationInvariants: ['PRESERVE_PERSISTENCE_DB'],
      confidence: 0.4
    });
    assert.ok(sCritical.score >= 8.5);
    assert.equal(sCritical.level, 'CRITICAL');
  });

  test('Planner: validateBoundaries throws on conflict and passes on clean sets', () => {
    assert.throws(
      () => planner.validateBoundaries({
        allowed: ['app/ui/**'],
        forbidden: ['app/ui/components/**']
      }),
      /overlap|conflict/i
    );

    const clean = planner.validateBoundaries({
      allowed: ['app/ui/**'],
      forbidden: ['app/data/**', 'app/domain/**']
    });
    assert.equal(clean.valid, true);
  });

  test('Planner: topological sort and cycle detector under adversarial graph shapes', () => {
    // 1. Clean linear chain
    const chain = [
      { id: 'C', dependencies: ['B'] },
      { id: 'B', dependencies: ['A'] },
      { id: 'A', dependencies: [] }
    ];
    const resChain = planner.validateTaskGraph(chain);
    assert.equal(resChain.hasCycles, false);
    assert.deepEqual(resChain.topologicalOrder, ['A', 'B', 'C']);

    // 2. Self loop
    assert.throws(() => planner.validateTaskGraph([{ id: 'Loop', dependencies: ['Loop'] }]), /circular|cycle/i);

    // 3. Indirect cycle
    const indirectCycle = [
      { id: 'X', dependencies: ['Y'] },
      { id: 'Y', dependencies: ['Z'] },
      { id: 'Z', dependencies: ['X'] }
    ];
    assert.throws(() => planner.validateTaskGraph(indirectCycle), /circular|cycle/i);
  });

  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Pilot Note-App Fixture Correspondence & Plan ---');
  // --------------------------------------------------------------------------

  const fixtureDir = path.resolve(__dirname, '../../fixtures/note-app');
  let appModel = null;

  await test('Fixture: live AST parsing yields valid Note App model', async () => {
    appModel = await parseAndroidProject(fixtureDir, 'app');
    assert.ok(appModel);
    assert.ok(appModel.screens.length >= 2);
  });

  await test('CorrespondenceMap: generates valid map conforming to Draft 2020-12 Schema', async () => {
    const mockDesignContract = {
      schemaVersion: '2.0.0',
      screenId: 'note_editor',
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
              children: [
                {
                  sourceId: 'daylight#note_editor/title_input',
                  domTag: 'input',
                  role: 'textbox',
                  semantics: { role: 'input', isInteractive: true },
                  boundsDp: { x: 24, y: 80, width: 1136, height: 56 },
                  text: 'Note Title'
                },
                {
                  sourceId: 'daylight#note_editor/content_input',
                  domTag: 'textarea',
                  role: 'textbox',
                  semantics: { role: 'input', isInteractive: true },
                  boundsDp: { x: 24, y: 200, width: 1136, height: 800 },
                  text: 'Note body text goes here'
                },
                {
                  sourceId: 'daylight#note_editor/novel_counter_badge',
                  domTag: 'div',
                  role: 'generic',
                  boundsDp: { x: 24, y: 1020, width: 100, height: 32 },
                  text: '42 words'
                }
              ]
            }
          }
        }
      }
    };

    const corrMap = await mapper.generateCorrespondenceMap({
      appModel,
      designContract: mockDesignContract,
      screenId: 'note_editor'
    });
    assert.ok(corrMap);
    assert.equal(corrMap.version, '2.0.0');
    assert.ok(corrMap.mappings.length >= 2);

    // Schema validation
    const valid = validateCorrespondenceSchema(corrMap);
    if (!valid) {
      console.error('Schema validation errors:', validateCorrespondenceSchema.errors);
    }
    assert.ok(valid, 'CorrespondenceMap must conform to schema');
  });

  await test('MigrationPlan: generates 5-phase plan conforming to Draft 2020-12 Schema', async () => {
    const mockDesignContract = {
      schemaVersion: '2.0.0',
      screenId: 'note_editor',
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
              children: [
                {
                  sourceId: 'daylight#note_editor/title_input',
                  domTag: 'input',
                  role: 'textbox',
                  boundsDp: { x: 24, y: 80, width: 1136, height: 56 }
                },
                {
                  sourceId: 'daylight#note_editor/content_input',
                  domTag: 'textarea',
                  role: 'textbox',
                  boundsDp: { x: 24, y: 200, width: 1136, height: 800 }
                }
              ]
            }
          }
        }
      }
    };
    const corrMap = await mapper.generateCorrespondenceMap({
      appModel,
      designContract: mockDesignContract,
      screenId: 'note_editor'
    });
    const plan = await planner.generateMigrationPlan(corrMap, appModel, { screenId: 'note_editor' });

    assert.ok(plan);
    assert.equal(plan.schemaVersion, '2.0.0');
    assert.equal(plan.phases.length, 5);

    // Verify all phases have git rollback anchors
    for (const phase of plan.phases) {
      assert.ok(phase.rollbackAnchor);
      assert.ok(phase.rollbackAnchor.gitCheckpoint);
    }

    // Schema validation
    const valid = validatePlanSchema(plan);
    if (!valid) {
      console.error('Plan schema validation errors:', validatePlanSchema.errors);
    }
    assert.ok(valid, 'MigrationPlan must conform to schema');
  });

  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: Total Tests: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(80));

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Unhandled fatal error in test runner:', err);
  process.exit(1);
});
