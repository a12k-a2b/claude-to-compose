'use strict';

/**
 * tests/e2e/negative_controls/nc05_contrast_collapse.test.js
 * Negative Control NC-05: Contrast Degradation / Color Collapse
 */

module.exports = {
  name: 'Negative Control NC-05: Contrast Degradation Veto',
  tests: [
    {
      id: 'NC-05',
      name: 'Changing headline color from --os-900 to --os-200 on white ground causes deterministic FAIL',
      fn(t) {
        const whiteGround = t.oracle.SOL_OS_TOKENS['--os-0'].hex; // #FFFFFF
        const degradedInk = t.oracle.SOL_OS_TOKENS['--os-200'].hex; // #CCCCCC

        const actualContrast = t.oracle.contrastRatio(degradedInk, whiteGround);
        const requiredAA = 4.5;
        const requiredAAA = 7.0;

        t.assert(actualContrast < requiredAA, `Contrast ${actualContrast.toFixed(2)} must fail AA 4.5:1`);
        t.assert(actualContrast < requiredAAA, `Contrast ${actualContrast.toFixed(2)} must fail AAA 7.0:1`);

        const passesGate = actualContrast >= requiredAA;
        t.assertEqual(passesGate, false);

        const outcome = passesGate ? 'PASS' : 'FAIL';
        t.assertEqual(outcome, 'FAIL', 'Contrast collapse on LivePaper display must strictly fail');
      }
    }
  ]
};
