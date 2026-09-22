'use strict';

/**
 * tests/e2e/negative_controls/nc02_margin_shift.test.js
 * Negative Control NC-02: Layout Margin Shift (>= 10px)
 */

module.exports = {
  name: 'Negative Control NC-02: Layout Margin Shift Veto',
  tests: [
    {
      id: 'NC-02',
      name: 'Injecting +10px (5dp) top margin shift causes deterministic FAIL (GEOMETRY_DRIFT)',
      fn(t) {
        const expected = { x: 592.0, y: 320.0 };
        const actualWithShift = { x: 592.0, y: 330.0 }; // +10px shift

        const drift = t.oracle.spatialDrift(actualWithShift.x, actualWithShift.y, expected.x, expected.y);
        t.assertEqual(drift.dy, 10.0);
        t.assertEqual(drift.distance, 10.0);

        const threshold = 3.0;
        const passesDrift = drift.distance <= threshold;
        t.assertEqual(passesDrift, false, '10px shift MUST fail spatial drift gate <= 3.0px');

        const outcome = passesDrift ? 'PASS' : 'FAIL';
        t.assertEqual(outcome, 'FAIL');
      }
    }
  ]
};
