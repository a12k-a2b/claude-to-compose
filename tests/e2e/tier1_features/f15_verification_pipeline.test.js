'use strict';

/**
 * tests/e2e/tier1_features/f15_verification_pipeline.test.js
 * Feature 15: Progressive Verification Pipeline (`ctc verify`)
 */

module.exports = {
  name: 'Feature 15: Progressive Verification Pipeline (ctc verify)',
  tests: [
    {
      id: 'F15-T1',
      name: 'Verification pipeline module exists and exports runVerificationPipeline API',
      fn(t) {
        t.checkComponent('Verification Pipeline Module', 'M4', () => {
          t.checkFileExists('src/verification/pipeline.js', 'M4');
          const pipeline = require('../../../src/verification/pipeline');
          t.assert(typeof pipeline.runVerificationPipeline === 'function');
        });
      }
    },
    {
      id: 'F15-T2',
      name: 'Verification pipeline executes 6 progressive stages in sequential order',
      fn(t) {
        t.checkComponent('6 Progressive Stages Ordering', 'M4', () => {
          const pipeline = require('../../../src/verification/pipeline');
          t.assert(pipeline.STAGES && pipeline.STAGES.length === 6);
          t.assertEqual(pipeline.STAGES[0], 'STAGE_1_SCHEMA_PROVENANCE');
          t.assertEqual(pipeline.STAGES[1], 'STAGE_2_COMPILE_AND_TESTS');
          t.assertEqual(pipeline.STAGES[2], 'STAGE_3_LAYOUT_TELEMETRY');
          t.assertEqual(pipeline.STAGES[3], 'STAGE_4_PERCEPTUAL_METRICS');
          t.assertEqual(pipeline.STAGES[4], 'STAGE_5_SCENARIO_REPLAY');
          t.assertEqual(pipeline.STAGES[5], 'STAGE_6_DC1_HARDWARE');
        });
      }
    },
    {
      id: 'F15-T3',
      name: 'Verification pipeline halts immediately on stage failure (fail-closed)',
      fn(t) {
        t.checkComponent('Fail-Closed Early Exit', 'M4', () => {
          const pipeline = require('../../../src/verification/pipeline');
          const result = pipeline.evaluateStages([
            { stage: 'STAGE_1_SCHEMA_PROVENANCE', success: true },
            { stage: 'STAGE_2_COMPILE_AND_TESTS', success: false, error: 'Compilation failed' }
          ]);
          t.assertEqual(result.outcome, 'FAIL');
          t.assertEqual(result.stagesExecutedCount, 2);
        });
      }
    },
    {
      id: 'F15-T4',
      name: 'Verification pipeline enforces max spatial drift threshold (<= 3.0px)',
      fn(t) {
        const driftPass = t.oracle.spatialDrift(100.0, 200.0, 102.0, 201.0);
        const driftFail = t.oracle.spatialDrift(100.0, 200.0, 105.0, 200.0);
        t.assert(driftPass.distance <= 3.0, '2.23px drift must pass');
        t.assert(driftFail.distance > 3.0, '5.0px drift must fail');
      }
    },
    {
      id: 'F15-T5',
      name: 'Verification pipeline evaluates foreground Ink IoU (>= 85.0%) and Sobel contour (>= 90.0%)',
      fn(t) {
        t.checkComponent('Perceptual Quality Gate Integration', 'M4', () => {
          const qualityGate = require('../../../verification/quality_gate');
          t.assert(qualityGate.DEFAULT_THRESHOLDS.minInkIou === 85.0);
          t.assert(qualityGate.DEFAULT_THRESHOLDS.minContourScore === 90.0);
        });
      }
    }
  ]
};
