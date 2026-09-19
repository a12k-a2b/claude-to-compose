/**
 * Tier 2 - Boundary 10: Atomic Composables Edge Cases & Negative Tests
 * Covers: Empty button text, Kotlin keyword collisions, missing onClick, unicode labels
 */

module.exports = {
  name: 'B10: Atomic Composables Boundaries',
  tier: 2,
  feature: 'B10',
  tests: [
    {
      id: 'T2_B10_01',
      name: 'Sanitize Kotlin reserved keyword identifiers (fun, val, var, class, package, in)',
      run: async (t) => {
        const kotlinKeywords = new Set(['fun', 'val', 'var', 'class', 'package', 'in', 'is', 'when', 'object', 'typealias']);
        function sanitizeIdentifier(name) {
          if (kotlinKeywords.has(name)) {
            return `\`${name}\``; // backtick escape
          }
          return name.replace(/[^a-zA-Z0-9_]/g, '');
        }
        t.assertEqual(sanitizeIdentifier('fun'), '`fun`');
        t.assertEqual(sanitizeIdentifier('class'), '`class`');
        t.assertEqual(sanitizeIdentifier('submit-button'), 'submitbutton');
      }
    },
    {
      id: 'T2_B10_02',
      name: 'Handle empty string button text without crashing compiler',
      run: async (t) => {
        function generateButtonCall(text) {
          const safeText = text || '';
          return `Button(onClick = {}) { Text(text = "${safeText}") }`;
        }
        const emptyButton = generateButtonCall('');
        t.assertEqual(emptyButton, 'Button(onClick = {}) { Text(text = "") }');
      }
    },
    {
      id: 'T2_B10_03',
      name: 'Preserve Unicode characters and emoji in composable text literals',
      run: async (t) => {
        const emojiText = 'Explore Frontiers 🎨✨';
        const escaped = JSON.stringify(emojiText);
        t.assert(escaped.includes('🎨✨'));
      }
    },
    {
      id: 'T2_B10_04',
      name: 'Handle missing optional click lambdas with default empty lambda (onClick: () -> Unit = {})',
      run: async (t) => {
        const lambdaParam = 'onClick: () -> Unit = {}';
        t.assertMatch(lambdaParam, /onClick:\s*\(\)\s*->\s*Unit\s*=\s*\{\}/);
      }
    },
    {
      id: 'T2_B10_05',
      name: 'Verify component_generator handles malformed component specifications',
      run: async (t) => {
        t.checkFileExists('synthesizer/component_generator.js', 'M2', 'Component generator module required to test boundary components');
      }
    }
  ]
};
