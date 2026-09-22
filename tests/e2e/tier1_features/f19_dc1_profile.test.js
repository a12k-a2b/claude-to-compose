'use strict';

/**
 * tests/e2e/tier1_features/f19_dc1_profile.test.js
 * Feature 19: Versioned Daylight DC1 Profile
 */

module.exports = {
  name: 'Feature 19: Versioned Daylight DC1 Profile',
  tests: [
    {
      id: 'F19-T1',
      name: 'DC1 profile file daylight-dc1.json exists in profiles directory',
      fn(t) {
        t.checkComponent('DC1 Profile Specification', 'M5', () => {
          t.checkFileExists('src/profiles/daylight-dc1.json', 'M5');
          const profile = require('../../../src/profiles/daylight-dc1.json');
          t.assertEqual(profile.display.technology, 'Transflective / Reflective LCD (LivePaper)');
        });
      }
    },
    {
      id: 'F19-T2',
      name: 'DC1 profile specifies active logical canvas of 1184x1584 pixels (592x792 dp)',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.logicalWidth, 1184);
        t.assertEqual(spec.logicalHeight, 1584);
        t.assertEqual(spec.logicalWidthDp, 592);
        t.assertEqual(spec.logicalHeightDp, 792);
        t.assertEqual(spec.density, 2.0);
      }
    },
    {
      id: 'F19-T3',
      name: 'DC1 profile specifies +8px physical hardware margin inset',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.hardwareInsetPx.left, 8);
        t.assertEqual(spec.hardwareInsetPx.top, 8);
        const physical = t.oracle.logicalToPhysical(0, 0);
        t.assertEqual(physical.x, 8);
        t.assertEqual(physical.y, 8);
      }
    },
    {
      id: 'F19-T4',
      name: 'DC1 profile specifies 60-120Hz fluid refresh rate with standard Android SurfaceFlinger',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.refreshRateHz.min, 60);
        t.assertEqual(spec.refreshRateHz.max, 120);
        t.assertEqual(spec.settleMsStandard, 150);
      }
    },
    {
      id: 'F19-T5',
      name: 'DC1 profile enforces zero EPD waveforms and no particle refresh hooks',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.zeroEpdWaveforms, true);
        t.assert(!spec.panel.includes('EPD'));
      }
    }
  ]
};
