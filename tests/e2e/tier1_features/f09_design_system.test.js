'use strict';

/**
 * tests/e2e/tier1_features/f09_design_system.test.js
 * Feature 9: Layer 4 Design System Contract IR (`design-system.json`)
 */

module.exports = {
  name: 'Feature 09: Layer 4 Design System Contract IR (design-system.json)',
  tests: [
    {
      id: 'F09-T1',
      name: 'Design system contract formalizes Sol:OS 8-bit neutral tokens (--os-0 to --os-1000)',
      fn(t) {
        const tokens = t.oracle.SOL_OS_TOKENS;
        t.assert(tokens['--os-0']);
        t.assert(tokens['--os-1000']);
        t.assertEqual(tokens['--os-0'].hex, '#FFFFFF');
        t.assertEqual(tokens['--os-900'].hex, '#1A1A1A');
        t.assertEqual(tokens['--os-1000'].hex, '#000000');
      },
    },
    {
      id: 'F09-T2',
      name: 'Design system contract includes calibrated brand grays (Yellow, Amber, Orange)',
      fn(t) {
        const brands = t.oracle.SOL_OS_BRAND_GRAYS;
        t.assertEqual(brands.Yellow.hex, '#CECECE');
        t.assertEqual(brands.Amber.hex, '#9D9D9E');
        t.assertEqual(brands.Orange.hex, '#6C6C6D');
      }
    },
    {
      id: 'F09-T3',
      name: 'Design system contract binds typography to Daylight font families',
      fn(t) {
        t.checkComponent('Typography Font Binding', 'M2', () => {
          t.checkFileExists('src/contract/schemas/design_system.json', 'M2');
          const schema = require('../../../src/contract/schemas/design_system.json');
          t.assert(schema.properties.tokens.properties.typography);
        });
      }
    },
    {
      id: 'F09-T4',
      name: 'Design system contract asserts strict zero EPD waveforms on transflective LCD panel',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.zeroEpdWaveforms, true);
        t.assertEqual(spec.panel.includes('Transflective / Reflective LCD'), true);
        t.assertEqual(spec.panel.includes('EPD'), false);
      }
    },
    {
      id: 'F09-T5',
      name: 'Design system contract enforces WCAG AA (4.5:1) and AAA (7.0:1) contrast thresholds',
      fn(t) {
        const os0 = t.oracle.SOL_OS_TOKENS['--os-0'].hex;
        const os900 = t.oracle.SOL_OS_TOKENS['--os-900'].hex;
        const os400 = t.oracle.SOL_OS_TOKENS['--os-400'].hex;

        const ratioPrimary = t.oracle.contrastRatio(os900, os0);
        const ratioSecondary = t.oracle.contrastRatio(os400, os0);

        t.assert(ratioPrimary >= 7.0, `Primary text contrast ${ratioPrimary.toFixed(2)} must be >= 7.0 (AAA)`);
        t.assert(ratioSecondary >= 4.5, `Secondary text contrast ${ratioSecondary.toFixed(2)} must be >= 4.5 (AA)`);
      }
    }
  ]
};
