'use strict';

/**
 * tests/e2e/tier2_boundaries/b03_baseline_boundaries.test.js
 * Feature 3 Boundaries: Pre-Retrofit Baseline Capture
 */

module.exports = {
  name: 'Boundary 03: Baseline Capture Corner Cases',
  tests: [
    {
      id: 'B03-T1',
      name: 'Handles non-existent Android project path with structured error',
      fn(t) {
        t.checkComponent('Non-Existent Path Baseline', 'M1', () => {
          const baseline = require('../../../src/baseline/capture');
          t.assertThrows(() => baseline.captureBaseline('/non/existent/path'), /ENOENT|not found/i);
        });
      }
    },
    {
      id: 'B03-T2',
      name: 'Captures non-zero Gradle process exit code without unhandled crash',
      fn(t) {
        t.checkComponent('Failing Gradle Baseline', 'M1', () => {
          const baseline = require('../../../src/baseline/capture');
          const mock = baseline.formatBaselineData({ compileSuccess: false, exitCode: 1 });
          t.assertEqual(mock.compilationBaseline.compileDebugKotlinSuccess, false);
        });
      }
    },
    {
      id: 'B03-T3',
      name: 'Handles project with zero tests discovered gracefully',
      fn(t) {
        t.checkComponent('Zero Tests Baseline', 'M1', () => {
          const baseline = require('../../../src/baseline/capture');
          const mock = baseline.formatBaselineData({ totalTests: 0, passed: 0, failed: 0 });
          t.assertEqual(mock.testBaseline.totalTests, 0);
        });
      }
    },
    {
      id: 'B03-T4',
      name: 'Detects corrupted or unparseable existing baseline JSON file',
      fn(t) {
        t.checkComponent('Corrupted Baseline JSON', 'M1', () => {
          const baseline = require('../../../src/baseline/capture');
          t.assertThrows(() => baseline.parseBaselineJson('{ corrupted: json'), /Unexpected|JSON/i);
        });
      }
    },
    {
      id: 'B03-T5',
      name: 'Handles extreme execution duration values without formatting corruption',
      fn(t) {
        t.checkComponent('Extreme Duration Baseline', 'M1', () => {
          const baseline = require('../../../src/baseline/capture');
          const mock = baseline.formatBaselineData({ compileDurationMs: 999999999 });
          t.assertEqual(mock.compilationBaseline.durationMs, 999999999);
        });
      }
    }
  ]
};
