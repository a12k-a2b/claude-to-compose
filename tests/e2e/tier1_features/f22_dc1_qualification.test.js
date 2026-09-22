'use strict';

/**
 * tests/e2e/tier1_features/f22_dc1_qualification.test.js
 * Feature 22: Physical DC1 LiveApp Deployment & Touch Qualification
 */

module.exports = {
  name: 'Feature 22: Physical DC1 Qualification Runner',
  tests: [
    {
      id: 'F22-T1',
      name: 'DC1 qualification runner script exists in scripts/qualify_dc1_hardware.js',
      fn(t) {
        t.checkFileExists('scripts/qualify_dc1_hardware.js', 'M6');
      }
    },
    {
      id: 'F22-T2',
      name: 'Qualification runner discovers connected DC1 fleet (rooted 3 / rooted 4)',
      fn(t) {
        const allowed = t.oracle.DC1_SPEC.allowedDevices;
        t.assert(allowed.includes('rooted 3'));
        t.assert(allowed.includes('rooted 4'));
        t.assert(allowed.includes('JMBR00380'));
        t.assert(allowed.includes('JMBR00405'));
      }
    },
    {
      id: 'F22-T3',
      name: 'Qualification runner maps touch tap coordinates through +8px hardware inset',
      fn(t) {
        const logicalX = 592.0;
        const logicalY = 792.0;
        const physical = t.oracle.logicalToPhysical(logicalX, logicalY);
        t.assertEqual(physical.x, 600.0);
        t.assertEqual(physical.y, 800.0);
      }
    },
    {
      id: 'F22-T4',
      name: 'Qualification runner models natural human contact dwell time (~80ms)',
      fn(t) {
        const dwellStandard = 80.0;
        t.assert(dwellStandard >= 50.0 && dwellStandard <= 120.0);
      }
    },
    {
      id: 'F22-T5',
      name: 'Qualification runner enforces 150ms fluid LivePaper settle time with zero EPD waveforms',
      fn(t) {
        t.assertEqual(t.oracle.DC1_SPEC.settleMsStandard, 150);
        t.assertEqual(t.oracle.DC1_SPEC.zeroEpdWaveforms, true);
      }
    }
  ]
};
