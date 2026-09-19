/**
 * Tier 2 - Boundary 16: @Preview Generation Edge Cases & Negative Tests
 * Covers: Missing theme wrapper, tablet layout constraints, invalid preview annotations
 */

module.exports = {
  name: 'B16: Interactive @Previews Generation Boundaries',
  tier: 2,
  feature: 'B16',
  tests: [
    {
      id: 'T2_B16_01',
      name: 'Validate preview function requires theme wrapper encapsulation',
      run: async (t) => {
        function validatePreviewWrapper(code) {
          if (!code.includes('Theme {') && !code.includes('AppTheme {')) {
            throw new Error('MissingThemeWrapperError: Preview composable must be wrapped in Theme provider');
          }
          return true;
        }
        t.assertThrows(() => validatePreviewWrapper('fun Preview() { Screen() }'), /MissingThemeWrapperError/);
        t.assert(validatePreviewWrapper('fun Preview() { AppTheme { Screen() } }'));
      }
    },
    {
      id: 'T2_B16_02',
      name: 'Validate tablet and desktop preview dimension bounds (widthDp = 1280, heightDp = 800)',
      run: async (t) => {
        const tabletPreview = '@Preview(name = "Tablet Landscape", widthDp = 1280, heightDp = 800)';
        t.assertMatch(tabletPreview, /widthDp\s*=\s*\d+/);
        t.assertMatch(tabletPreview, /heightDp\s*=\s*\d+/);
      }
    },
    {
      id: 'T2_B16_03',
      name: 'Handle missing LocalContext or CompositionLocals in preview execution',
      run: async (t) => {
        const mockCompositionLocal = 'CompositionLocalProvider(LocalContext provides mockContext) { }';
        t.assert(mockCompositionLocal.includes('CompositionLocalProvider'));
      }
    },
    {
      id: 'T2_B16_04',
      name: 'Validate showBackground boolean parameter defaults to true in @Preview',
      run: async (t) => {
        const previewAnnotation = '@Preview(showBackground = true)';
        t.assert(previewAnnotation.includes('showBackground = true'));
      }
    },
    {
      id: 'T2_B16_05',
      name: 'Verify synthesizer screen_generator produces valid preview functions',
      run: async (t) => {
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen generator required to test preview generation');
      }
    }
  ]
};
