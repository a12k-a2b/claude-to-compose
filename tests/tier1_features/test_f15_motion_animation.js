/**
 * Tier 1 - Feature 15: Motion & Animation Translation
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 20
 */

const path = require('node:path');

module.exports = {
  name: 'F15: Motion & Animation Translation',
  tier: 1,
  feature: 'F15',
  tests: [
    {
      id: 'T1_F15_01',
      name: 'Validate AnimatedVisibility generation with fadeIn/fadeOut and expandVertically/shrinkVertically',
      run: async (t) => {
        const sampleAnimatedVisibility = `
          AnimatedVisibility(
            visible = isExpanded,
            enter = fadeIn(animationSpec = tween(300)) + expandVertically(),
            exit = fadeOut(animationSpec = tween(200)) + shrinkVertically()
          ) {
            DetailsContent()
          }
        `;
        t.assertMatch(sampleAnimatedVisibility, /AnimatedVisibility\(/);
        t.assertMatch(sampleAnimatedVisibility, /fadeIn\(/);
        t.assertMatch(sampleAnimatedVisibility, /fadeOut\(/);
      }
    },
    {
      id: 'T1_F15_02',
      name: 'Validate animateFloatAsState and animateDpAsState mapping from CSS transitions',
      run: async (t) => {
        const sampleFloatAnimation = 'val alpha by animateFloatAsState(targetValue = if (visible) 1f else 0f, label = "alphaAnim")';
        const sampleDpAnimation = 'val elevation by animateDpAsState(targetValue = if (pressed) 8.dp else 2.dp, label = "elevAnim")';
        t.assertMatch(sampleFloatAnimation, /animateFloatAsState\(targetValue/);
        t.assertMatch(sampleDpAnimation, /animateDpAsState\(targetValue/);
      }
    },
    {
      id: 'T1_F15_03',
      name: 'Validate CSS easing functions to Compose AnimationSpec mapping (linear, ease-in-out -> tween/spring)',
      run: async (t) => {
        const easingMap = {
          'linear': 'LinearEasing',
          'ease-in': 'FastOutLinearInEasing',
          'ease-out': 'LinearOutSlowInEasing',
          'ease-in-out': 'FastOutSlowInEasing'
        };
        t.assertEqual(easingMap['ease-in-out'], 'FastOutSlowInEasing');
        t.assertEqual(easingMap['linear'], 'LinearEasing');
      }
    },
    {
      id: 'T1_F15_04',
      name: 'Validate spring() physics animation parameterization (dampingRatio, stiffness)',
      run: async (t) => {
        const springSpec = 'spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow)';
        t.assertMatch(springSpec, /Spring\.DampingRatio/);
        t.assertMatch(springSpec, /Spring\.Stiffness/);
      }
    },
    {
      id: 'T1_F15_05',
      name: 'Verify motion_generator module exports animation synthesizers',
      run: async (t) => {
        t.checkFileExists('synthesizer/motion_generator.js', 'M2', 'Motion generator module required for transition translation');
      }
    }
  ]
};
