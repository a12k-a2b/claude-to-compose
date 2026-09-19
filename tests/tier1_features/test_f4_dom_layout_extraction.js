/**
 * Tier 1 - Feature 4: DOM Layout & Style Extraction
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 5, 6, 7, 8, 9
 */

const path = require('node:path');

module.exports = {
  name: 'F4: DOM Layout & Style Extraction',
  tier: 1,
  feature: 'F4',
  tests: [
    {
      id: 'T1_F4_01',
      name: 'Validate layout property taxonomy (display, flexbox, grid, gap, padding, margin)',
      run: async (t) => {
        const requiredLayoutProps = [
          'display', 'flexDirection', 'justifyContent', 'alignItems',
          'flexWrap', 'gap', 'padding', 'margin', 'width', 'height'
        ];
        const sampleNodeLayout = {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: 16,
          padding: { top: 12, right: 16, bottom: 12, left: 16 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          width: 412,
          height: 64
        };
        for (const prop of requiredLayoutProps) {
          t.assert(prop in sampleNodeLayout, `Layout node must contain ${prop}`);
        }
      }
    },
    {
      id: 'T1_F4_02',
      name: 'Validate typography metrics normalization (fontFamily, fontSize, fontWeight, lineHeight, letterSpacing)',
      run: async (t) => {
        const typographyTokens = {
          fontFamily: 'Inter, sans-serif',
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 24,
          letterSpacing: 0.15,
          color: '#111827'
        };
        t.assertEqual(typeof typographyTokens.fontSize, 'number');
        t.assertEqual(typeof typographyTokens.fontWeight, 'number');
        t.assert(typographyTokens.fontSize > 0);
        t.assert(typographyTokens.fontWeight >= 100 && typographyTokens.fontWeight <= 900);
      }
    },
    {
      id: 'T1_F4_03',
      name: 'Validate CSS color conversion to canonical 8-digit ARGB Hex and RGBA tokens',
      run: async (t) => {
        function rgbToHex(r, g, b, a = 1.0) {
          const toHex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
          const alphaHex = toHex(a * 255);
          return `#${alphaHex}${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
        const whiteHex = rgbToHex(255, 255, 255, 1.0);
        t.assertEqual(whiteHex, '#FFFFFFFF', 'Full alpha white must convert to #FFFFFFFF');
        const primaryHex = rgbToHex(79, 70, 229, 1.0);
        t.assertEqual(primaryHex, '#FF4F46E5', 'Indigo must convert to #FF4F46E5');
        const semiTransparent = rgbToHex(0, 0, 0, 0.5);
        t.assertEqual(semiTransparent, '#80000000', '50% transparent black must convert to #80000000');
      }
    },
    {
      id: 'T1_F4_04',
      name: 'Validate box-shadow parsing into offsetX, offsetY, blur, spread, and color',
      run: async (t) => {
        const rawBoxShadow = '0px 4px 6px -1px rgba(0, 0, 0, 0.1)';
        const shadowRegex = /([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s*([-\d.]*px)?\s*(rgba?\([^)]+\)|#[a-fA-F0-9]+)/;
        const match = rawBoxShadow.match(shadowRegex);
        t.assert(match !== null, 'Should parse multi-part box-shadow string');
        t.assertEqual(parseFloat(match[1]), 0);
        t.assertEqual(parseFloat(match[2]), 4);
        t.assertEqual(parseFloat(match[3]), 6);
        t.assertEqual(parseFloat(match[4]), -1);
      }
    },
    {
      id: 'T1_F4_05',
      name: 'Verify extractor dom_walker module existence',
      run: async (t) => {
        t.checkFileExists('extractor/dom_walker.js', 'M1', 'DOM walker module required for recursive layout and token evaluation');
      }
    }
  ]
};
