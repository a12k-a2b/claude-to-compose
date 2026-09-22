'use strict';

/**
 * tests/e2e/tier1_features/f06_measured_scene.test.js
 * Feature 6: Layer 1 Measured Scene IR (`measured-scenes.json`)
 */

module.exports = {
  name: 'Feature 06: Layer 1 Measured Scene IR (measured-scenes.json)',
  tests: [
    {
      id: 'F06-T1',
      name: 'Measured scene schema definition exists and enforces Draft 2020-12',
      fn(t) {
        t.checkComponent('Measured Scene Schema', 'M2', () => {
          t.checkFileExists('src/contract/schemas/measured_scene.json', 'M2');
          const schema = require('../../../src/contract/schemas/measured_scene.json');
          t.assert(schema.$schema && schema.$schema.includes('2020-12'));
          t.assertEqual(schema.title, 'MeasuredSceneBundle');
        });
      }
    },
    {
      id: 'F06-T2',
      name: 'Measured scene preserves exact physical and paint bounds without truncation',
      fn(t) {
        t.checkComponent('Measured Scene Bounds Representation', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#note_editor/header',
            bounds: { x: 32.0, y: 64.0, width: 1120.0, height: 80.0 },
            paintBounds: { left: 32.0, top: 64.0, right: 1152.0, bottom: 144.0 }
          });
          t.assertEqual(node.bounds.x, 32.0);
          t.assertEqual(node.paintBounds.right, 1152.0);
        });
      }
    },
    {
      id: 'F06-T3',
      name: 'Measured scene records paint order and z-index hierarchy',
      fn(t) {
        t.checkComponent('Paint Order Recording', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#note_editor/fab',
            paintOrder: 15,
            zIndex: 10
          });
          t.assertEqual(node.paintOrder, 15);
          t.assertEqual(node.zIndex, 10);
        });
      }
    },
    {
      id: 'F06-T4',
      name: 'Measured scene records typography metrics, text runs, and baselines',
      fn(t) {
        t.checkComponent('Text Runs & Baselines', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const node = builder.createMeasuredNode({
            sourceId: 'daylight#note_editor/title',
            textRuns: [{ content: 'Untitled Note', fontFamily: 'ABC Arizona Flare', fontSizePx: 36.0 }],
            baselines: { firstBaselinePx: 48.0, lastBaselinePx: 48.0, alphabeticBaselineY: 48.0 }
          });
          t.assert(node.textRuns.length === 1);
          t.assertEqual(node.baselines.firstBaselinePx, 48.0);
        });
      }
    },
    {
      id: 'F06-T5',
      name: 'Measured scene records SHA-256 asset and font identities',
      fn(t) {
        t.checkComponent('Asset Hash Tracking', 'M2', () => {
          const builder = require('../../../src/contract/measured_scene_builder');
          const bundle = builder.createMeasuredBundle({
            screenId: 'note_editor',
            loadedFonts: [{ family: 'ABC Arizona Flare', hash: 'sha256:abc123' }],
            loadedAssets: [{ assetId: 'ic_back', hash: 'sha256:def456' }]
          });
          t.assertEqual(bundle.loadedFonts[0].hash, 'sha256:abc123');
          t.assertEqual(bundle.loadedAssets[0].hash, 'sha256:def456');
        });
      }
    }
  ]
};
