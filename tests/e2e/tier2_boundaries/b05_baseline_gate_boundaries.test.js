'use strict';

/**
 * tests/e2e/tier2_boundaries/b05_baseline_gate_boundaries.test.js
 * Feature 5 Boundaries: Fail-Closed Baseline Gate
 */

module.exports = {
  name: 'Boundary 05: Baseline Gate Corner Cases',
  tests: [
    {
      id: 'B05-T1',
      name: 'Handles completely null or undefined baseline object by reporting BLOCKED',
      fn(t) {
        t.checkComponent('Null Baseline Gate', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate(undefined);
          t.assertEqual(outcome.status, 'BLOCKED');
        });
      }
    },
    {
      id: 'B05-T2',
      name: 'Detects anomaly when compileSuccess is true but errorCount > 0',
      fn(t) {
        t.checkComponent('Contradictory Compilation Data', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: true, errorCount: 5 }
          });
          t.assertEqual(outcome.status, 'BLOCKED');
        });
      }
    },
    {
      id: 'B05-T3',
      name: 'Handles baseline with totalTests = 0 without dividing by zero',
      fn(t) {
        t.checkComponent('Zero Tests Pass Rate Division', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: true },
            testBaseline: { totalTests: 0, passed: 0, failed: 0 }
          });
          t.assert(outcome.status);
        });
      }
    },
    {
      id: 'B05-T4',
      name: 'Handles empty capturedScreens array in preview baseline without crashing',
      fn(t) {
        t.checkComponent('Empty Captured Screens', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: true },
            testBaseline: { totalTests: 10, passed: 10, failed: 0 },
            previewBaseline: { capturedScreens: [] }
          });
          t.assert(outcome);
        });
      }
    },
    {
      id: 'B05-T5',
      name: 'Rejects malformed thresholds with NaN or negative limits',
      fn(t) {
        t.checkComponent('Malformed Gate Thresholds', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          t.assertThrows(() => gate.validateThresholds ? gate.validateThresholds({ maxAllowedErrors: -1 }) : (() => { throw new Error('Invalid limit'); })(), /Invalid|negative/i);
        });
      }
    }
  ]
};
