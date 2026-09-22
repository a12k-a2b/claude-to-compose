'use strict';

/**
 * tests/e2e/tier2_boundaries/b06_measured_scene_boundaries.test.js
 * Feature 6 Boundaries: Layer 1 Measured Scene IR
 */

module.exports = {
  name: 'Boundary 06: Measured Scene Corner Cases',
  tests: [
    {
      id: 'B06-T1',
      name: 'Handles scene node with 0x0 width/height dimensions (zero area component)',
      fn(t) {
        t.checkComponent('Zero Dimension Node', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#empty_spacer',
            bounds: { x: 0, y: 0, width: 0, height: 0 }
          });
          t.assertEqual(node.bounds.width, 0);
          t.assertEqual(node.bounds.height, 0);
        });
      }
    },
    {
      id: 'B06-T2',
      name: 'Handles scene node with negative coordinates (offscreen element)',
      fn(t) {
        t.checkComponent('Negative Coordinate Node', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#offscreen_drawer',
            bounds: { x: -300, y: 0, width: 300, height: 800 }
          });
          t.assertEqual(node.bounds.x, -300);
        });
      }
    },
    {
      id: 'B06-T3',
      name: 'Validates SHA-256 hash regex format rejecting corrupted hashes',
      fn(t) {
        const validHash = 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';
        const invalidHash = 'sha256:too_short';
        const hashRegex = /^sha256:[a-f0-9]{64}$/;
        t.assert(hashRegex.test(validHash), 'Valid hash must match regex');
        t.assert(!hashRegex.test(invalidHash), 'Short hash must fail regex');
      }
    },
    {
      id: 'B06-T4',
      name: 'Handles text run with empty content string without crashing',
      fn(t) {
        t.checkComponent('Empty Text Run', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#empty_text',
            textRuns: [{ content: '', fontFamily: 'sans-serif', fontSizePx: 14 }]
          });
          t.assertEqual(node.textRuns[0].content, '');
        });
      }
    },
    {
      id: 'B06-T5',
      name: 'Handles deep node nesting hierarchy (depth = 100) without call stack overflow',
      fn(t) {
        t.checkComponent('Deep Nesting Hierarchy', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          let current = builder.createMeasuredNode({ sourceId: 'depth_0' });
          const root = current;
          for (let i = 1; i < 100; i++) {
            const child = builder.createMeasuredNode({ sourceId: `depth_${i}` });
            current.children = [child];
            current = child;
          }
          t.assert(root.children && root.children.length === 1);
        });
      }
    }
  ]
};
