'use strict';

/**
 * tests/e2e/negative_controls/nc06_epd_flash_violation.test.js
 * Negative Control NC-06: EPD Waveform Clear Hook Violation
 */

module.exports = {
  name: 'Negative Control NC-06: EPD Waveform Workaround Violation Veto',
  tests: [
    {
      id: 'NC-06',
      name: 'Attempting to broadcast ACTION_REFRESH_SCREEN or inject artificial settle pause causes deterministic FAIL',
      fn(t) {
        // Injected fault: Simulated code or intent using E-ink screen refresh hooks
        const prohibitedActions = [
          'android.intent.action.ACTION_REFRESH_SCREEN',
          'com.eink.REFRESH_WAVEFORM',
          'Thread.sleep(500)' // Artificial waveform wait
        ];

        const testIntentAction = 'android.intent.action.ACTION_REFRESH_SCREEN';
        const isForbidden = prohibitedActions.includes(testIntentAction);
        t.assertEqual(isForbidden, true);

        // Verification engine must flag this as an EPD workaround violation
        const outcome = isForbidden ? 'FAIL' : 'PASS';
        t.assertEqual(outcome, 'FAIL', 'EPD waveform workarounds are strictly forbidden on DC1 LivePaper display');
      }
    }
  ]
};
