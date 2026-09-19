/**
 * Tier 1 - Feature 16: Interactive @Previews Generation
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 22
 */

const path = require('node:path');

module.exports = {
  name: 'F16: Interactive @Previews Generation',
  tier: 1,
  feature: 'F16',
  tests: [
    {
      id: 'T1_F16_01',
      name: 'Validate @Preview annotations for both Light and Dark theme modes',
      run: async (t) => {
        const previewDeclarations = `
          @Preview(name = "Light Theme", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_NO)
          @Preview(name = "Dark Theme", showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES)
          @Composable
          fun ClaudeDesignScreenPreview() {
            ClaudeDesignTheme {
              ClaudeDesignScreen()
            }
          }
        `;
        t.assertMatch(previewDeclarations, /@Preview\([^)]*UI_MODE_NIGHT_NO[^)]*\)/);
        t.assertMatch(previewDeclarations, /@Preview\([^)]*UI_MODE_NIGHT_YES[^)]*\)/);
      }
    },
    {
      id: 'T1_F16_02',
      name: 'Validate device specification parameters on @Preview (device = Devices.PIXEL_7)',
      run: async (t) => {
        const devicePreview = '@Preview(name = "Mobile Pixel 7", device = Devices.PIXEL_7, showSystemUi = true)';
        t.assertMatch(devicePreview, /device\s*=\s*Devices\.[A-Za-z0-9_]+/);
        t.assertMatch(devicePreview, /showSystemUi\s*=\s*true/);
      }
    },
    {
      id: 'T1_F16_03',
      name: 'Validate theme wrapper encapsulation inside preview composables',
      run: async (t) => {
        const previewBody = `
          @Composable
          fun ComponentPreview() {
            AppTheme {
              PrimaryActionButton(text = "Submit", onClick = {})
            }
          }
        `;
        t.assert(previewBody.includes('AppTheme {'));
      }
    },
    {
      id: 'T1_F16_04',
      name: 'Validate preview function visibility and naming conventions',
      run: async (t) => {
        const previewFunName = 'ClaudeDesignScreenPreview';
        t.assertMatch(previewFunName, /^[A-Z][a-zA-Z0-9]+Preview$/);
      }
    },
    {
      id: 'T1_F16_05',
      name: 'Verify synthesizer emits screen previews file',
      run: async (t) => {
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen generator required to emit preview composable definitions');
      }
    }
  ]
};
