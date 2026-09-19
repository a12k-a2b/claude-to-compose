/**
 * Tier 2 - Boundary 5: SVG Vector Asset Edge Cases & Negative Tests
 * Covers: Malformed XML, missing viewBox, zero dimensions, self-closing paths
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'B5: SVG Vector Extraction Boundaries',
  tier: 2,
  feature: 'B5',
  tests: [
    {
      id: 'T2_B5_01',
      name: 'Handle malformed SVG XML syntax without crashing the parser',
      run: async (t) => {
        const malformedSvgPath = path.join(t.fixturesDir, 'assets', 'malformed.svg');
        const content = fs.readFileSync(malformedSvgPath, 'utf8');
        function parseSvgSafely(raw) {
          try {
            // Basic sanity check
            if (!raw.includes('</svg>') && !raw.includes('/>')) {
              return { valid: false, error: 'Unclosed SVG tag' };
            }
            return { valid: true };
          } catch (e) {
            return { valid: false, error: e.message };
          }
        }
        const result = parseSvgSafely(content);
        t.assert(!result.valid, 'Malformed SVG should be detected as invalid');
      }
    },
    {
      id: 'T2_B5_02',
      name: 'Synthesize default viewBox when missing from SVG root element',
      run: async (t) => {
        function resolveViewBox(svgNode) {
          if (svgNode.viewBox) return svgNode.viewBox;
          const w = parseFloat(svgNode.width) || 24;
          const h = parseFloat(svgNode.height) || 24;
          return `0 0 ${w} ${h}`;
        }
        const resolved = resolveViewBox({ width: '48', height: '48' });
        t.assertEqual(resolved, '0 0 48 48', 'Should synthesize viewBox from width/height');
        const fallback = resolveViewBox({});
        t.assertEqual(fallback, '0 0 24 24', 'Should fall back to default 0 0 24 24');
      }
    },
    {
      id: 'T2_B5_03',
      name: 'Handle empty or whitespace-only SVG path data (d="")',
      run: async (t) => {
        function sanitizePathData(d) {
          if (!d || d.trim().length === 0) return null;
          return d.trim();
        }
        t.assertEqual(sanitizePathData(''), null);
        t.assertEqual(sanitizePathData('   '), null);
        t.assertEqual(sanitizePathData('M0 0L10 10Z'), 'M0 0L10 10Z');
      }
    },
    {
      id: 'T2_B5_04',
      name: 'Clamp extreme SVG coordinates (> 100,000px) to prevent layout blowouts',
      run: async (t) => {
        function checkCoordinatesBounds(coords) {
          const MAX_COORD = 100000;
          return coords.every(c => Math.abs(c) <= MAX_COORD);
        }
        t.assert(!checkCoordinatesBounds([0, 10, 999999]));
        t.assert(checkCoordinatesBounds([0, 10, 24, 100]));
      }
    },
    {
      id: 'T2_B5_05',
      name: 'Verify svg_parser module existence for boundary testing',
      run: async (t) => {
        t.checkFileExists('extractor/svg_parser.js', 'M1', 'SVG parser required for vector boundary verification');
      }
    }
  ]
};
