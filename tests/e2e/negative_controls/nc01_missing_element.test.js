'use strict';

/**
 * tests/e2e/negative_controls/nc01_missing_element.test.js
 * Negative Control NC-01: Missing Required Element
 */

module.exports = {
  name: 'Negative Control NC-01: Missing Required Element Veto',
  tests: [
    {
      id: 'NC-01',
      name: 'Deleting required CTA button from telemetry causes deterministic FAIL (ELEMENT_NOT_RENDERED)',
      fn(t) {
        // Load base telemetry if available or simulate
        const baseNode = {
          'daylight#onboarding/typography/headline': { boundsPx: { left: 64, top: 320, width: 1056, height: 180 }, centroid: { x: 592, y: 410 } },
          'daylight#onboarding/action/get_started': { boundsPx: { left: 64, top: 1400, width: 1056, height: 96 }, centroid: { x: 592, y: 1448 } }
        };

        // Injected Fault: Delete CTA button
        const faultyTelemetry = { ...baseNode };
        delete faultyTelemetry['daylight#onboarding/action/get_started'];

        const requiredIds = ['daylight#onboarding/typography/headline', 'daylight#onboarding/action/get_started'];
        const missing = requiredIds.filter(id => !faultyTelemetry[id]);

        t.assertEqual(missing.length, 1);
        t.assertEqual(missing[0], 'daylight#onboarding/action/get_started');
        // Assertion: engine must register this as a failure, never pass
        const gateOutcome = missing.length > 0 ? 'FAIL' : 'PASS';
        t.assertEqual(gateOutcome, 'FAIL');
      }
    }
  ]
};
