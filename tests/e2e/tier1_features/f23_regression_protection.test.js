'use strict';

/**
 * tests/e2e/tier1_features/f23_regression_protection.test.js
 * Feature 23: Regression Protection for Existing 284 Core Tests
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'Feature 23: Regression Protection for Existing Core Tests',
  tests: [
    {
      id: 'F23-T1',
      name: 'Existing core test runner tests/e2e_runner.js exists',
      fn(t) {
        const p = path.resolve(t.projectRoot, 'tests/e2e_runner.js');
        t.assert(fs.existsSync(p), 'tests/e2e_runner.js must exist');
      }
    },
    {
      id: 'F23-T2',
      name: 'Existing visual overhaul runner test/e2e/run_all.js exists',
      fn(t) {
        const p = path.resolve(t.projectRoot, 'test/e2e/run_all.js');
        t.assert(fs.existsSync(p), 'test/e2e/run_all.js must exist');
      }
    },
    {
      id: 'F23-T3',
      name: 'Existing benchmarks benchmark scenes (dc1_onboarding) remain intact',
      fn(t) {
        const p = path.resolve(t.projectRoot, 'benchmarks/dc1_onboarding/design_ir.json');
        t.assert(fs.existsSync(p), 'benchmarks/dc1_onboarding/design_ir.json must exist');
      }
    },
    {
      id: 'F23-T4',
      name: 'Existing Android test suite files remain in android/app/src/test/',
      fn(t) {
        const p = path.resolve(t.projectRoot, 'android/app/src/test/java/com/claude/compose/GeneratedScreenScreenshotTest.kt');
        t.assert(fs.existsSync(p), 'GeneratedScreenScreenshotTest.kt must exist');
      }
    },
    {
      id: 'F23-T5',
      name: 'Existing verification quality gate thresholds remain enforced',
      fn(t) {
        const qualityGate = require('../../../verification/quality_gate');
        t.assertEqual(qualityGate.DEFAULT_THRESHOLDS.maxSpatialShiftPx, 3.0);
        t.assertEqual(qualityGate.DEFAULT_THRESHOLDS.minMssim, 0.90);
      }
    }
  ]
};
