'use strict';

/**
 * tests/e2e/tier1_features/f07_layout_intent.test.js
 * Feature 7: Layer 2 Inferred Layout Intent IR (`layout-intent.json`)
 */

module.exports = {
  name: 'Feature 07: Layer 2 Inferred Layout Intent IR (layout-intent.json)',
  tests: [
    {
      id: 'F07-T1',
      name: 'Layout intent schema definition exists and enforces Draft 2020-12',
      fn(t) {
        t.checkComponent('Layout Intent Schema', 'M2', () => {
          t.checkFileExists('src/contract/schemas/layout_intent.json', 'M2');
          const schema = require('../../../src/contract/schemas/layout_intent.json');
          t.assert(schema.$schema && schema.$schema.includes('2020-12'));
          t.assertEqual(schema.title, 'LayoutIntentSpecification');
        });
      }
    },
    {
      id: 'F07-T2',
      name: 'Layout intent classifies sizing modes (FIXED, INTRINSIC_WRAP, FILL_PARENT, PROPORTIONAL_WEIGHT)',
      fn(t) {
        t.checkComponent('Layout Sizing Classification', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.inferNodeIntent({
            sourceId: 'daylight#note_editor/card',
            measuredWidthAcrossViewports: [1120, 1520] // Expands with screen width
          });
          t.assertEqual(intent.sizing.widthMode, 'FILL_PARENT');
        });
      }
    },
    {
      id: 'F07-T3',
      name: 'Layout intent formalizes topology (ROW, COLUMN, BOX_OVERLAY, GRID) and alignment',
      fn(t) {
        t.checkComponent('Topology Modeling', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.inferNodeIntent({
            sourceId: 'daylight#note_editor/toolbar',
            childrenLayout: 'horizontal'
          });
          t.assertEqual(intent.topology.flowType, 'ROW');
        });
      }
    },
    {
      id: 'F07-T4',
      name: 'Layout intent models multi-viewport breakpoints (DC1 portrait 1184x1584 vs landscape 1584x1184)',
      fn(t) {
        t.checkComponent('Multi-Viewport Breakpoints', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.createBreakpointRules({
            portrait: { flowOverride: 'COLUMN', visibility: 'VISIBLE' },
            landscape: { flowOverride: 'ROW', visibility: 'VISIBLE' }
          });
          t.assert(intent.daylightPortrait);
          t.assert(intent.daylightLandscape);
          t.assertEqual(intent.daylightLandscape.flowOverride, 'ROW');
        });
      }
    },
    {
      id: 'F07-T5',
      name: 'Layout intent records inference confidence scores and alternative explanations',
      fn(t) {
        t.checkComponent('Confidence Scoring', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.inferNodeIntent({
            sourceId: 'daylight#note_editor/pill_action',
            singleViewportOnly: true
          });
          t.assert(typeof intent.confidence === 'number');
          t.assert(intent.confidence <= 1.0);
          t.assert(Array.isArray(intent.alternativeExplanations));
        });
      }
    }
  ]
};
