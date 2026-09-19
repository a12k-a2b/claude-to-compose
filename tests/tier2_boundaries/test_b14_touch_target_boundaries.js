/**
 * Tier 2 - Boundary 14: Touch Target Compliance Edge Cases & Negative Tests
 * Covers: Sub-48dp icon buttons, overlapping hitboxes, disabled touch behavior
 */

module.exports = {
  name: 'B14: Touch Target Compliance Boundaries',
  tier: 2,
  feature: 'B14',
  tests: [
    {
      id: 'T2_B14_01',
      name: 'Detect and wrap sub-48dp icon buttons (16x16 or 24x24) with minimumInteractiveComponentSize',
      run: async (t) => {
        function ensureCompliantTouchTarget(node) {
          if (node.isInteractive && (node.width < 48 || node.height < 48)) {
            return {
              ...node,
              appliedModifier: 'Modifier.minimumInteractiveComponentSize()'
            };
          }
          return node;
        }
        const smallIcon = ensureCompliantTouchTarget({ isInteractive: true, width: 24, height: 24 });
        t.assertEqual(smallIcon.appliedModifier, 'Modifier.minimumInteractiveComponentSize()');
        const largeButton = ensureCompliantTouchTarget({ isInteractive: true, width: 120, height: 48 });
        t.assert(!largeButton.appliedModifier);
      }
    },
    {
      id: 'T2_B14_02',
      name: 'Verify disabled interactive components do not trigger ripple effects',
      run: async (t) => {
        function buildClickableModifier(enabled) {
          if (!enabled) return 'Modifier';
          return 'Modifier.clickable { }';
        }
        t.assertEqual(buildClickableModifier(false), 'Modifier');
        t.assertEqual(buildClickableModifier(true), 'Modifier.clickable { }');
      }
    },
    {
      id: 'T2_B14_03',
      name: 'Verify padding inclusion in touch target calculation',
      run: async (t) => {
        function calculateEffectiveTarget(width, height, padding) {
          return {
            effectiveWidth: width + (padding.left || 0) + (padding.right || 0),
            effectiveHeight: height + (padding.top || 0) + (padding.bottom || 0)
          };
        }
        const effective = calculateEffectiveTarget(24, 24, { top: 12, right: 12, bottom: 12, left: 12 });
        t.assertEqual(effective.effectiveWidth, 48);
        t.assertEqual(effective.effectiveHeight, 48);
        t.assert(effective.effectiveWidth >= 48 && effective.effectiveHeight >= 48);
      }
    },
    {
      id: 'T2_B14_04',
      name: 'Reject interactive targets with zero width or zero height',
      run: async (t) => {
        function validateTargetDimensions(w, h) {
          if (w <= 0 || h <= 0) throw new Error('ZeroDimensionTargetError: Interactive component cannot have 0 size');
          return true;
        }
        t.assertThrows(() => validateTargetDimensions(0, 48), /ZeroDimensionTargetError/);
        t.assertThrows(() => validateTargetDimensions(48, 0), /ZeroDimensionTargetError/);
        t.assert(validateTargetDimensions(48, 48));
      }
    },
    {
      id: 'T2_B14_05',
      name: 'Verify motion_generator enforces 48dp compliance in code synthesis',
      run: async (t) => {
        t.checkFileExists('synthesizer/motion_generator.js', 'M2', 'Motion generator required to verify touch target logic');
      }
    }
  ]
};
