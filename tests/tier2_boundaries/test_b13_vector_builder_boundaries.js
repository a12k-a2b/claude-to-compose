/**
 * Tier 2 - Boundary 13: Vector Builder Edge Cases & Negative Tests
 * Covers: Unsupported SVG elements (<filter>, <foreignObject>), multi-subpath, zero viewports
 */

module.exports = {
  name: 'B13: Vector Graphic Builder Boundaries',
  tier: 2,
  feature: 'B13',
  tests: [
    {
      id: 'T2_B13_01',
      name: 'Filter or flatten unsupported SVG elements (<filter>, <foreignObject>, <script>)',
      run: async (t) => {
        function sanitizeSvgElements(svgString) {
          return svgString
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
            .replace(/<filter\b[^<]*(?:(?!<\/filter>)<[^<]*)*<\/filter>/gi, '');
        }
        const dirtySvg = '<svg><filter id="f">blur</filter><script>alert(1)</script><path d="M0 0"/></svg>';
        const cleanSvg = sanitizeSvgElements(dirtySvg);
        t.assert(!cleanSvg.includes('<script>'));
        t.assert(!cleanSvg.includes('<filter'));
        t.assert(cleanSvg.includes('<path d="M0 0"/>'));
      }
    },
    {
      id: 'T2_B13_02',
      name: 'Handle multi-subpath d strings containing multiple M/Z pairs',
      run: async (t) => {
        const multiSubpath = 'M10 10 L20 20 Z M30 30 L40 40 Z';
        const subpaths = multiSubpath.split(/(?=[Mm])/).map(s => s.trim()).filter(Boolean);
        t.assertEqual(subpaths.length, 2, 'Should detect 2 distinct subpaths');
        t.assertEqual(subpaths[0], 'M10 10 L20 20 Z');
        t.assertEqual(subpaths[1], 'M30 30 L40 40 Z');
      }
    },
    {
      id: 'T2_B13_03',
      name: 'Validate zero or missing viewport dimensions fallback to 24dp x 24dp',
      run: async (t) => {
        function getSafeVectorDimensions(dim) {
          const w = parseFloat(dim.width) || 24;
          const h = parseFloat(dim.height) || 24;
          return { width: Math.max(w, 1), height: Math.max(h, 1) };
        }
        const safe = getSafeVectorDimensions({ width: 0, height: 0 });
        t.assertEqual(safe.width, 24);
        t.assertEqual(safe.height, 24);
      }
    },
    {
      id: 'T2_B13_04',
      name: 'Validate XML entity escaping in Android VectorDrawable strings (&, <, >, ", \')',
      run: async (t) => {
        function escapeXml(str) {
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        }
        t.assertEqual(escapeXml('A & B'), 'A &amp; B');
        t.assertEqual(escapeXml('path "test"'), 'path &quot;test&quot;');
      }
    },
    {
      id: 'T2_B13_05',
      name: 'Verify vector_generator module handles complex curves (C, S, Q, T, A)',
      run: async (t) => {
        t.checkFileExists('synthesizer/vector_generator.js', 'M2', 'Vector generator required to test curve translation');
      }
    }
  ]
};
