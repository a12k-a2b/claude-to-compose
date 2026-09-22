/**
 * tests/unit/planner.test.js
 *
 * Unit test suite for Deterministic Migration Planner (src/mapping/planner.js)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const Ajv = require('ajv/dist/2020');

const {
  generateMigrationPlan,
  validateBoundaries,
  validateTaskGraph,
  computeTaskRiskScore,
  createRollbackAnchor,
  validateScreenId,
  validateForbiddenBehaviors,
  patternsOverlap,
  PHASES,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_FORBIDDEN_BEHAVIORS
} = require('../../src/mapping/planner');

const planSchema = require('../../src/mapping/schemas/migration-plan.schema.json');

describe('Migration Planner Core & Phased Execution Tests', () => {
  it('generates 5 sequential execution phases with mandatory rollback anchors', () => {
    const plan = generateMigrationPlan({
      screenId: 'note_editor',
      correspondenceMap: { mappings: [] }
    });

    assert.ok(plan && Array.isArray(plan.phases));
    assert.strictEqual(plan.phases.length, 5);

    const expectedPhaseIds = [
      'PHASE_0_BASELINE',
      'PHASE_1_FOUNDATION',
      'PHASE_2_SHELL_NAV',
      'PHASE_3_SCREEN_RETROFIT',
      'PHASE_4_VERIFICATION_POLISH'
    ];

    for (let i = 0; i < 5; i++) {
      assert.strictEqual(plan.phases[i].index, i);
      assert.strictEqual(plan.phases[i].id, expectedPhaseIds[i]);
      assert.ok(plan.phases[i].rollbackAnchor, `Phase ${i} must contain rollback anchor`);
      assert.ok(plan.phases[i].rollbackAnchor.gitCheckpoint.startsWith('ctc-anchor-'));
    }
  });

  it('rejects plan generation when screenId is empty or missing', () => {
    assert.throws(() => generateMigrationPlan({ screenId: '' }), /screenId required/i);
    assert.throws(() => generateMigrationPlan({}), /screenId required/i);
  });

  it('declares strict allowed and forbidden modification paths', () => {
    const plan = generateMigrationPlan({
      screenId: 'note_editor'
    });

    assert.ok(plan.boundaries.allowedModificationPaths.some(p => p.includes('ui/editor')));
    assert.ok(plan.boundaries.forbiddenPaths.some(p => p.includes('data')));
    assert.ok(plan.boundaries.forbiddenBehaviors.some(b => b.includes('EPD')));
  });
});

describe('Boundary Conflict & Glob Overlap Detection', () => {
  it('detects and forbids overlapping allowed and forbidden path patterns', () => {
    assert.throws(() => {
      validateBoundaries({
        allowed: ['app/src/main/java/**'],
        forbidden: ['app/src/main/java/data/**']
      });
    }, /overlap|conflict/i);
  });

  it('allows cleanly disjoint boundaries', () => {
    assert.doesNotThrow(() => {
      validateBoundaries({
        allowed: ['app/src/main/java/com/example/notes/ui/editor/**'],
        forbidden: ['app/src/main/java/com/example/notes/data/**']
      });
    });
  });

  it('evaluates pattern overlap correctly across wildcard depths', () => {
    assert.strictEqual(patternsOverlap('app/**', 'app/data/**'), true);
    assert.strictEqual(patternsOverlap('app/ui/**', 'app/data/**'), false);
    assert.strictEqual(patternsOverlap('app/ui/NoteEditor.kt', 'app/ui/NoteEditor.kt'), true);
  });

  it('validates forbidden behaviors rejecting null or non-string entries', () => {
    assert.throws(() => {
      validateForbiddenBehaviors(['valid rule', null]);
    }, /invalid/i);

    assert.throws(() => {
      validateForbiddenBehaviors(['valid rule', '']);
    }, /invalid/i);

    assert.doesNotThrow(() => {
      validateForbiddenBehaviors(['rule 1', 'rule 2']);
    });
  });
});

describe('Dependency Graph & Cycle Detection Tests', () => {
  it('computes topological order and parallel batches for acyclic tasks', () => {
    const tasks = [
      { id: 'foundation', dependencies: [] },
      { id: 'scaffold', dependencies: ['foundation'] },
      { id: 'topbar', dependencies: ['scaffold'] },
      { id: 'content', dependencies: ['scaffold'] },
      { id: 'verify', dependencies: ['topbar', 'content'] }
    ];

    const result = validateTaskGraph(tasks);
    assert.strictEqual(result.hasCycles, false);
    assert.ok(result.topologicalOrder.indexOf('foundation') < result.topologicalOrder.indexOf('scaffold'));
    assert.ok(result.topologicalOrder.indexOf('scaffold') < result.topologicalOrder.indexOf('topbar'));
    assert.ok(result.topologicalOrder.indexOf('scaffold') < result.topologicalOrder.indexOf('content'));
    assert.ok(result.topologicalOrder.indexOf('topbar') < result.topologicalOrder.indexOf('verify'));
    assert.ok(result.topologicalOrder.indexOf('content') < result.topologicalOrder.indexOf('verify'));
  });

  it('detects circular dependencies and throws descriptive error', () => {
    const cyclicTasks = [
      { id: 'A', dependencies: ['B'] },
      { id: 'B', dependencies: ['C'] },
      { id: 'C', dependencies: ['A'] }
    ];

    assert.throws(() => {
      validateTaskGraph(cyclicTasks);
    }, /circular|cycle/i);
  });
});

describe('Risk Assessment & Rollback Anchors', () => {
  it('assigns higher risk scores to data and navigation touches', () => {
    const dataTask = {
      name: 'Modify Room Schema',
      filePath: 'app/src/main/java/com/example/notes/data/NoteDao.kt',
      preservationInvariants: ['INV-PERSIST-001'],
      dependents: ['NoteRepository', 'NoteViewModel']
    };
    const riskData = computeTaskRiskScore(dataTask);
    assert.ok(riskData.score >= 7.0, `Data task should be high risk: got ${riskData.score}`);

    const tokenTask = {
      name: 'Update Color Tokens',
      filePath: 'app/src/main/java/com/example/notes/ui/theme/Color.kt'
    };
    const riskToken = computeTaskRiskScore(tokenTask);
    assert.ok(riskToken.score < 5.0, `Token task should be low/medium risk: got ${riskToken.score}`);
  });

  it('creates valid rollback anchors with git checkpoint and verification gate', () => {
    const anchor = createRollbackAnchor(
      { id: 'PHASE_3_SCREEN_RETROFIT', name: 'Screen Retrofit', gate: 'UNIT_GATE' },
      ['NoteEditorScreen.kt']
    );

    assert.ok(anchor.anchorId.startsWith('anchor-'));
    assert.strictEqual(anchor.phaseId, 'PHASE_3_SCREEN_RETROFIT');
    assert.ok(anchor.rollbackCommand.includes('git checkout'));
    assert.strictEqual(anchor.snapshotFiles.length, 1);
  });
});

describe('Migration Plan Schema Conformance', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  require('ajv-formats')(ajv);
  const validate = ajv.compile(planSchema);

  it('validates generated MigrationPlan against Draft 2020-12 Schema', () => {
    const plan = generateMigrationPlan({
      screenId: 'note_editor',
      correspondenceMap: { mappings: [] }
    });

    const isValid = validate(plan);
    if (!isValid) {
      console.error('AJV validation errors for MigrationPlan:', validate.errors);
    }
    assert.ok(isValid, 'MigrationPlan must conform 100% to Draft 2020-12 Schema');
  });
});
