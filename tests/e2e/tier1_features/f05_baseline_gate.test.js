'use strict';

/**
 * tests/e2e/tier1_features/f05_baseline_gate.test.js
 * Feature 5: Fail-Closed Baseline Gate
 */

module.exports = {
  name: 'Feature 05: Fail-Closed Baseline Gate',
  tests: [
    {
      id: 'F05-T1',
      name: 'Baseline gate module exists and exports evaluateBaselineGate API',
      fn(t) {
        t.checkComponent('Baseline Gate Module', 'M1', () => {
          t.checkFileExists('src/baseline/gate.js', 'M1');
          const gate = require('../../../src/baseline/gate');
          t.assert(typeof gate.evaluateBaselineGate === 'function');
        });
      }
    },
    {
      id: 'F05-T2',
      name: 'Clean baseline with passing compilation and unit tests reports PASS',
      fn(t) {
        t.checkComponent('Clean Baseline Evaluation', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: true },
            testBaseline: { totalTests: 48, passed: 48, failed: 0 },
            previewBaseline: { capturedScreens: [{ screenshotHash: 'sha256:abc' }] }
          });
          t.assertEqual(outcome.status, 'PASS');
          t.assertEqual(outcome.blockers.length, 0);
        });
      }
    },
    {
      id: 'F05-T3',
      name: 'Broken compilation in baseline reports BLOCKED status',
      fn(t) {
        t.checkComponent('Broken Compile Baseline Evaluation', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: false, errorCount: 3 },
            testBaseline: { totalTests: 0, passed: 0, failed: 0 }
          });
          t.assertEqual(outcome.status, 'BLOCKED');
          t.assert(outcome.blockers.some(b => b.includes('compilation')));
        });
      }
    },
    {
      id: 'F05-T4',
      name: 'Failing pre-existing unit tests report BLOCKED status',
      fn(t) {
        t.checkComponent('Failing Tests Baseline Evaluation', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate({
            compilationBaseline: { compileDebugKotlinSuccess: true },
            testBaseline: { totalTests: 48, passed: 45, failed: 3 }
          });
          t.assertEqual(outcome.status, 'BLOCKED');
          t.assert(outcome.blockers.some(b => b.includes('test')));
        });
      }
    },
    {
      id: 'F05-T5',
      name: 'Missing or unreadable baseline evidence reports BLOCKED without crashing',
      fn(t) {
        t.checkComponent('Missing Evidence Baseline Evaluation', 'M1', () => {
          const gate = require('../../../src/baseline/gate');
          const outcome = gate.evaluateBaselineGate(null);
          t.assertEqual(outcome.status, 'BLOCKED');
          t.assert(outcome.blockers.length > 0);
        });
      }
    }
  ]
};
