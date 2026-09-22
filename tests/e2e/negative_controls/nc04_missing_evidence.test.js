'use strict';

/**
 * tests/e2e/negative_controls/nc04_missing_evidence.test.js
 * Negative Control NC-04: Missing Evidence Gate
 */

module.exports = {
  name: 'Negative Control NC-04: Missing Evidence Gate',
  tests: [
    {
      id: 'NC-04',
      name: 'Omitted preview render screenshot causes deterministic BLOCKED status without fabricated score',
      fn(t) {
        const qualityGate = require('../../../verification/quality_gate');
        const incompleteStages = {
          compile: { success: true },
          previewTest: null, // Fault: missing preview evidence
          diff: null
        };

        const evalResult = qualityGate.evaluateVerificationEvidence(incompleteStages);
        t.assertEqual(evalResult.passed, false);
        t.assertEqual(evalResult.outcome, 'BLOCKED');
        t.assert(evalResult.blockers.length > 0);
      }
    }
  ]
};
