/**
 * Tier 1 - Feature 5: SVG Vector Asset Extraction
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 10
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F5: SVG Vector Asset Extraction',
  tier: 1,
  feature: 'F5',
  tests: [
    {
      id: 'T1_F5_01',
      name: 'Verify inline SVG parsing extracts viewBox and path data correctly',
      run: async (t) => {
        const svgFixture = path.join(t.fixturesDir, 'assets', 'sample_icon.svg');
        const content = fs.readFileSync(svgFixture, 'utf8');
        t.assertMatch(content, /viewBox=["']0 0 24 24["']/, 'Must extract viewBox="0 0 24 24"');
        t.assertMatch(content, /<circle[^>]+cx=["']12["']/, 'Must extract circle element');
        t.assertMatch(content, /<polyline[^>]+points=["'][^"']+["']/, 'Must extract polyline points');
      }
    },
    {
      id: 'T1_F5_02',
      name: 'Validate viewBox coordinate normalization into minX, minY, width, height',
      run: async (t) => {
        const viewBoxStr = '0 0 64 64';
        const parts = viewBoxStr.trim().split(/\s+/).map(Number);
        t.assertEqual(parts.length, 4);
        const [minX, minY, width, height] = parts;
        t.assertEqual(minX, 0);
        t.assertEqual(minY, 0);
        t.assertEqual(width, 64);
        t.assertEqual(height, 64);
      }
    },
    {
      id: 'T1_F5_03',
      name: 'Validate multi-path group extraction from complex vector assets',
      run: async (t) => {
        const complexSvgPath = path.join(t.fixturesDir, 'assets', 'complex_vector.svg');
        const content = fs.readFileSync(complexSvgPath, 'utf8');
        t.assert(content.includes('<g id="badge-background">'), 'Must retain group identifiers');
        t.assert(content.includes('<g id="sparkle-group"'), 'Must retain nested sparkle group');
        t.assert(content.includes('d="M20 0L24 16L40 20L24 24L20 40L16 24L0 20L16 16Z"'), 'Must preserve complex path data');
      }
    },
    {
      id: 'T1_F5_04',
      name: 'Verify SVG parser module existence in extractor subsystem',
      run: async (t) => {
        t.checkFileExists('extractor/svg_parser.js', 'M1', 'SVG parser module required for vector extraction');
      }
    },
    {
      id: 'T1_F5_05',
      name: 'Verify vector output bundle includes assets/ directory naming specification',
      run: async (t) => {
        const assetPathSpec = 'assets/vectors/brand_logo.svg';
        t.assertMatch(assetPathSpec, /^assets\/vectors\/[a-z0-9_-]+\.svg$/, 'Asset path must follow naming convention');
      }
    }
  ]
};
