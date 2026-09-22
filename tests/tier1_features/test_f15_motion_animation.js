/**
 * Tier 1 - Feature 15: Motion & Animation Translation
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 20
 */

const path = require('node:path');
const { MotionGenerator } = require('../../synthesizer/motion_generator');
const { generateScreenFile } = require('../../synthesizer/screen_generator');

module.exports = {
  name: 'F15: Motion & Animation Translation',
  tier: 1,
  feature: 'F15',
  tests: [
    {
      id: 'T1_F15_01',
      name: 'Validate AnimatedVisibility generation with fadeIn/fadeOut and expandVertically/shrinkVertically',
      run: async (t) => {
        const generatedSnippet = MotionGenerator.generateAnimatedVisibility({
          visibleCondition: 'isExpanded',
          durationMs: 300,
          content: 'DetailsContent()'
        });
        t.assertMatch(generatedSnippet, /AnimatedVisibility\(/);
        t.assertMatch(generatedSnippet, /fadeIn\(animationSpec = tween\(300\)\) \+ expandVertically\(\)/);
        t.assertMatch(generatedSnippet, /fadeOut\(animationSpec = tween\(225\)\) \+ shrinkVertically\(\)/);

        // Test screen generator conditional node translation
        const spec = {
          hierarchy: {
            id: 'root_node',
            componentType: 'Container',
            layout: { display: 'flex' },
            children: [
              {
                id: 'conditional_card',
                componentType: 'Card',
                isConditional: true,
                layout: { visibility: 'hidden', padding: {} },
                children: [{ id: 'text_node', componentType: 'Text', text: { content: 'Details' } }]
              }
            ]
          }
        };
        const screenCode = generateScreenFile(spec, 'com.claude.compose');
        t.assertMatch(screenCode, /AnimatedVisibility\(/);
        t.assertMatch(screenCode, /isConditional_cardVisible/);
      }
    },
    {
      id: 'T1_F15_02',
      name: 'Validate animateFloatAsState and animateDpAsState mapping from CSS transitions',
      run: async (t) => {
        const pressedElev = MotionGenerator.generatePressedElevation({
          defaultElevation: 2,
          pressedElevation: 8,
          label: 'elevAnim'
        });
        t.assertMatch(pressedElev, /animateDpAsState\(/);
        t.assertMatch(pressedElev, /targetValue = if \(isPressed\) 8\.dp else 2\.dp/);

        const pressedScale = MotionGenerator.generateInteractivePressScale({
          defaultScale: '1f',
          pressedScale: '0.97f',
          label: 'scaleAnim'
        });
        t.assertMatch(pressedScale, /animateFloatAsState\(/);
        t.assertMatch(pressedScale, /targetValue = if \(isPressed\) 0\.97f else 1f/);
      }
    },
    {
      id: 'T1_F15_03',
      name: 'Validate CSS easing functions to Compose AnimationSpec mapping (linear, ease-in-out -> tween/spring)',
      run: async (t) => {
        t.assertEqual(MotionGenerator.mapCssEasing('ease-in-out'), 'FastOutSlowInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('linear'), 'LinearEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('ease-in'), 'FastOutLinearInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('ease-out'), 'LinearOutSlowInEasing');
        t.assertEqual(MotionGenerator.mapCssEasing('unknown-cubic'), 'FastOutSlowInEasing');

        const tweenSpec = MotionGenerator.resolveAnimationSpec(300, 'ease-in-out');
        t.assertEqual(tweenSpec, 'tween(durationMillis = 300, easing = FastOutSlowInEasing)');
      }
    },
    {
      id: 'T1_F15_04',
      name: 'Validate spring() physics animation parameterization (dampingRatio, stiffness)',
      run: async (t) => {
        t.assert(MotionGenerator.validateSpringParams(0.7, 300));
        t.assertThrows(() => MotionGenerator.validateSpringParams(-1, 100), /InvalidSpringParamsError/);
        t.assertThrows(() => MotionGenerator.validateSpringParams(0.5, -50), /InvalidSpringParamsError/);

        const contentSizeSpec = MotionGenerator.generateContentSizeAnimation();
        t.assertMatch(contentSizeSpec, /Modifier\.animateContentSize\(animationSpec = spring\(stiffness = Spring\.StiffnessMediumLow\)\)/);
      }
    },
    {
      id: 'T1_F15_05',
      name: 'Verify motion_generator module exports animation synthesizers',
      run: async (t) => {
        t.checkFileExists('synthesizer/motion_generator.js', 'M2', 'Motion generator module required for transition translation');
        t.assertEqual(typeof MotionGenerator.generateAnimatedVisibility, 'function');
        t.assertEqual(typeof MotionGenerator.generatePressedElevation, 'function');
        t.assertEqual(typeof MotionGenerator.generateInfiniteTransition, 'function');
        t.assertEqual(typeof MotionGenerator.generateMotionTokensKotlinFile, 'function');
      }
    }
  ]
};
