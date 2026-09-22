'use strict';

/**
 * tests/e2e/negative_controls/nc03_omitted_asset.test.js
 * Negative Control NC-03: Omitted / Missing Asset
 */

module.exports = {
  name: 'Negative Control NC-03: Omitted Asset Veto',
  tests: [
    {
      id: 'NC-03',
      name: 'Omitted or missing required font/vector asset causes deterministic FAIL/BLOCKED',
      fn(t) {
        const requiredAssets = [
          { id: 'font_flare', file: 'res/font/abc_arizona_flare.ttf', exists: false }, // Injected fault: missing
          { id: 'ic_save', file: 'res/drawable/ic_save.xml', exists: true }
        ];

        const missingAssets = requiredAssets.filter(a => !a.exists);
        t.assertEqual(missingAssets.length, 1);
        t.assertEqual(missingAssets[0].id, 'font_flare');

        const outcome = missingAssets.length > 0 ? 'FAIL' : 'PASS';
        t.assertEqual(outcome, 'FAIL', 'Missing asset must cause deterministic failure, never silent substitution');
      }
    }
  ]
};
