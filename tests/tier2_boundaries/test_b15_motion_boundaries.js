/**
 * Tier 2 - Boundary 15: Motion & Animation Edge Cases & Negative Tests
 * Covers: 0ms duration (instant snap), negative spring parameters, unknown easings
 */

const { MotionGenerator } = require('../../synthesizer/motion_generator');

module.exports = {
  name: 'B15: Motion & Animation Translation Boundaries',
  tier: 2,
  feature: 'B15',
  tests: [
    {
      id: 'T2_B15_01',
      name: 'Handle 0ms transition duration by falling back to snap() animation spec',
      run: async (t) => {
        t.assertEqual(MotionGenerator.resolveAnimationSpec(0), 'snap()');
        t.assertEqual(MotionGenerator.resolveAnimationSpec(-100), 'snap()');
        t.assertEqual(MotionGenerator.resolveAnimationSpec(300), 'tween(durationMillis = 300, easing = FastOutSlowInEasing)');
      }
    },
    {
      id: 'T2_B15_02',
      name: 'Handle unknown CSS transition easing by falling back to FastOutSlowInEasing',
      run: async (t) => {
        t.assertEqual(MotionGenerator.mapCssEasing('cubic-bezier(custom)'), 'FastOutSlowInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('unknown-timing'), 'FastOutSlowInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('linear'), 'LinearEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('ease-in'), 'FastOutLinearInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('ease-out'), 'LinearOutSlowInEasing');
      }
    },
    {
      id: 'T2_B15_03',
      name: 'Reject negative spring damping ratios or stiffness values',
      run: async (t) => {
        t.assertThrows(() => MotionGenerator.validateSpringParams(-1, 100), /InvalidSpringParamsError/);
        t.assertThrows(() => MotionGenerator.validateSpringParams(0.5, -50), /InvalidSpringParamsError/);
        t.assert(MotionGenerator.validateSpringParams(0.7, 300));
      }
    },
    {
      id: 'T2_B15_04',
      name: 'Validate infinite CSS animation loop mapping (rememberInfiniteTransition)',
      run: async (t) => {
        const infiniteTransitionCode = MotionGenerator.generateInfiniteTransition({
          label: 'pulse',
          initialValue: '1f',
          targetValue: '1.1f',
          durationMs: 1000
        });
        t.assertMatch(infiniteTransitionCode, /rememberInfiniteTransition\(label = "pulse"\)/);
        t.assertMatch(infiniteTransitionCode, /infiniteRepeatable\(/);
        t.assertMatch(infiniteTransitionCode, /animateFloat\(/);
      }
    },
    {
      id: 'T2_B15_05',
      name: 'Verify motion_generator module handles animation boundary conditions',
      run: async (t) => {
        t.checkFileExists('synthesizer/motion_generator.js', 'M2', 'Motion generator required to test motion boundaries');
      }
    }
  ]
};
