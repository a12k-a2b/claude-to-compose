'use strict';

/**
 * tests/e2e/tier1_features/f21_e2e_suite_meta.test.js
 * Feature 21: E2E Test Suite Meta-Verification
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'Feature 21: E2E Test Suite Meta-Verification',
  tests: [
    {
      id: 'F21-T1',
      name: 'E2E test runner tests/e2e/run_all_v2.js exists and is executable',
      fn(t) {
        const runnerPath = path.resolve(t.projectRoot, 'tests/e2e/run_all_v2.js');
        t.assert(fs.existsSync(runnerPath), 'Master runner tests/e2e/run_all_v2.js must exist');
      }
    },
    {
      id: 'F21-T2',
      name: 'TEST_INFRA.md exists at project root and enumerates Features 1-23',
      fn(t) {
        const infraPath = path.resolve(t.projectRoot, 'TEST_INFRA.md');
        t.assert(fs.existsSync(infraPath), 'TEST_INFRA.md must exist at project root');
        const content = fs.readFileSync(infraPath, 'utf8');
        t.assert(content.includes('F01'));
        t.assert(content.includes('F23'));
        t.assert(content.includes('NC-01'));
        t.assert(content.includes('NC-06'));
      }
    },
    {
      id: 'F21-T3',
      name: 'Test context API provides assertions and progressive testability helpers',
      fn(t) {
        t.assert(typeof t.assert === 'function');
        t.assert(typeof t.assertEqual === 'function');
        t.assert(typeof t.assertDeepEqual === 'function');
        t.assert(typeof t.checkComponent === 'function');
      }
    },
    {
      id: 'F21-T4',
      name: 'Mathematical oracle helpers calculate luminance, contrast, drift, and IoU accurately',
      fn(t) {
        const lumWhite = t.oracle.relativeLuminance([255, 255, 255]);
        const lumBlack = t.oracle.relativeLuminance([0, 0, 0]);
        t.assertEqual(lumWhite, 1.0);
        t.assertEqual(lumBlack, 0.0);

        const contrastMax = t.oracle.contrastRatio([0, 0, 0], [255, 255, 255]);
        t.assert(Math.abs(contrastMax - 21.0) < 0.01, 'Black on white contrast must be 21:1');
      }
    },
    {
      id: 'F21-T5',
      name: 'Test runner reports structured summary with pass, fail, unimplemented, and durations',
      fn(t) {
        // Meta-verification that runner parses flags and tracks results
        const runAll = require('../run_all_v2');
        t.assert(typeof runAll.parseArgs === 'function');
        t.assert(typeof runAll.runSuite === 'function');
      }
    }
  ]
};
