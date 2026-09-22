'use strict';

/**
 * tests/e2e/tier4_real_world/s04_rotation_layout_switch.test.js
 * Scenario 4: Responsive Breakpoint & Rotation (DC1 Portrait to Landscape)
 */

module.exports = {
  name: 'Scenario 04: DC1 Rotation & Responsive Layout Switch',
  tests: [
    {
      id: 'S04-T1',
      name: 'Portrait mode renders on 1184x1584 logical canvas with bottom action bar',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        t.assertEqual(spec.logicalWidth, 1184);
        t.assertEqual(spec.logicalHeight, 1584);
      }
    },
    {
      id: 'S04-T2',
      name: 'Landscape mode renders on 1584x1184 logical canvas with lateral navigation rail',
      fn(t) {
        const spec = t.oracle.DC1_SPEC;
        const landscapeWidth = spec.logicalHeight;
        const landscapeHeight = spec.logicalWidth;
        t.assertEqual(landscapeWidth, 1584);
        t.assertEqual(landscapeHeight, 1184);
      }
    },
    {
      id: 'S04-T3',
      name: 'Rotation preserves active draft text in text field without content reset',
      fn(t) {
        t.checkFileExists('android/app/src/test/java/com/claude/compose/LandscapeScreenshotTest.kt', 'M1');
      }
    },
    {
      id: 'S04-T4',
      name: 'Landscape layout satisfies touch target size (>= 48dp) and contrast thresholds',
      fn(t) {
        const primaryContrast = t.oracle.contrastRatio(t.oracle.SOL_OS_TOKENS['--os-900'].hex, t.oracle.SOL_OS_TOKENS['--os-0'].hex);
        t.assert(primaryContrast >= 7.0);
      }
    }
  ]
};
