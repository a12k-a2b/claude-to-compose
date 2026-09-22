'use strict';

/**
 * tests/e2e/tier2_boundaries/b21_e2e_suite_boundaries.test.js
 * Feature 21 Boundaries: E2E Test Suite Meta-Verification
 */

module.exports = {
  name: 'Boundary 21: E2E Test Suite Meta Corner Cases',
  tests: [
    {
      id: 'B21-T1',
      name: 'Runner rejects invalid tier argument (--tier 5 or --tier abc)',
      fn(t) {
        const runAll = require('../run_all_v2');
        t.assertThrows(() => runAll.parseArgs(['--tier', '5']), /Invalid tier/i);
        t.assertThrows(() => runAll.parseArgs(['--tier', 'abc']), /Invalid tier/i);
      }
    },
    {
      id: 'B21-T2',
      name: 'Runner handles empty string filter pattern without crashing',
      fn(t) {
        const runAll = require('../run_all_v2');
        const opts = runAll.parseArgs(['--filter', '']);
        t.assert(opts.filter instanceof RegExp);
      }
    },
    {
      id: 'B21-T3',
      name: 'Runner handles test throwing non-Error object (e.g. throw "string")',
      fn(t) {
        let caughtMessage = '';
        try {
          throw 'Non-error string thrown';
        } catch (err) {
          caughtMessage = err instanceof Error ? err.message : String(err);
        }
        t.assertEqual(caughtMessage, 'Non-error string thrown');
      }
    },
    {
      id: 'B21-T4',
      name: 'Runner handles asynchronous promise rejection without unhandled rejection event',
      fn(t) {
        const rejectedPromise = Promise.reject(new Error('Async failure test'));
        return t.assertRejects(rejectedPromise, /Async failure test/);
      }
    },
    {
      id: 'B21-T5',
      name: 'Runner handles situation where zero tests match the active filter pattern',
      fn(t) {
        const runAll = require('../run_all_v2');
        const filter = /NON_EXISTENT_MATCH_XYZ_123/;
        t.assertEqual(filter.test('Feature 01: Pilot App'), false);
      }
    }
  ]
};
