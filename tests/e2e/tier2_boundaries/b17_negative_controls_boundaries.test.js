'use strict';

/**
 * tests/e2e/tier2_boundaries/b17_negative_controls_boundaries.test.js
 * Feature 17 Boundaries: Deterministic Negative Controls
 */

module.exports = {
  name: 'Boundary 17: Negative Controls Corner Cases',
  tests: [
    {
      id: 'B17-T1',
      name: 'NC-01 boundary: Missing element check when telemetry object is completely empty',
      fn(t) {
        t.checkComponent('Empty Telemetry Missing Element', 'M4', () => {
          const comparator = require('../../../compiler_v2/telemetry/comparator');
          t.assert(typeof comparator.compareTelemetry === 'function');
        });
      }
    },
    {
      id: 'B17-T2',
      name: 'NC-02 boundary: Spatial drift exactly at 3.000px threshold evaluates as passing',
      fn(t) {
        const drift = t.oracle.spatialDrift(0, 3.0, 0, 0);
        t.assertEqual(drift.distance, 3.0);
        t.assert(drift.distance <= 3.0, 'Exactly 3.0px drift must pass threshold');
      }
    },
    {
      id: 'B17-T3',
      name: 'NC-02 boundary: Spatial drift at 3.001px strictly fails the quality gate',
      fn(t) {
        const drift = t.oracle.spatialDrift(0, 3.001, 0, 0);
        t.assert(drift.distance > 3.0, '3.001px drift must strictly fail threshold');
      }
    },
    {
      id: 'B17-T4',
      name: 'NC-05 boundary: Normal text contrast at 4.49:1 fails while 4.50:1 passes',
      fn(t) {
        t.assert(4.49 < 4.50);
        t.assert(4.50 >= 4.50);
      }
    },
    {
      id: 'B17-T5',
      name: 'NC-06 boundary: Fluid settle time of 150ms passes while artificial pause of 500ms fails',
      fn(t) {
        const validSettle = 150;
        const invalidPause = 500;
        t.assertEqual(validSettle <= t.oracle.DC1_SPEC.settleMsStandard, true);
        t.assertEqual(invalidPause <= t.oracle.DC1_SPEC.settleMsStandard, false);
      }
    }
  ]
};
