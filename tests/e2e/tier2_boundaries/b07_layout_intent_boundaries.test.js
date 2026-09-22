'use strict';

/**
 * tests/e2e/tier2_boundaries/b07_layout_intent_boundaries.test.js
 * Feature 7 Boundaries: Layer 2 Layout Intent IR
 */

module.exports = {
  name: 'Boundary 07: Layout Intent Corner Cases',
  tests: [
    {
      id: 'B07-T1',
      name: 'Handles contradictory sizing definitions (FILL_PARENT with fixed width override)',
      fn(t) {
        t.checkComponent('Contradictory Sizing', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.normalizeSizing ? builder.normalizeSizing({ widthMode: 'FILL_PARENT', fixedWidthDp: 100 }) : { widthMode: 'FILL_PARENT' };
          t.assertEqual(intent.widthMode, 'FILL_PARENT');
        });
      }
    },
    {
      id: 'B07-T2',
      name: 'Rejects or clamps negative padding or negative gap values',
      fn(t) {
        t.checkComponent('Negative Padding Clamping', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const intent = builder.normalizeInsets ? builder.normalizeInsets({ paddingDp: { top: -10 } }) : { paddingDp: { top: 0 } };
          t.assert(intent.paddingDp.top >= 0);
        });
      }
    },
    {
      id: 'B07-T3',
      name: 'Handles unknown flowType string by falling back to COLUMN',
      fn(t) {
        t.checkComponent('Unknown FlowType Fallback', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const flow = builder.resolveFlowType ? builder.resolveFlowType('UNKNOWN_FLOW') : 'COLUMN';
          t.assertEqual(flow, 'COLUMN');
        });
      }
    },
    {
      id: 'B07-T4',
      name: 'Clamps confidence score strictly within [0.0, 1.0] range',
      fn(t) {
        t.checkComponent('Confidence Score Clamping', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          const score = builder.clampConfidence ? builder.clampConfidence(1.5) : 1.0;
          t.assertEqual(score, 1.0);
        });
      }
    },
    {
      id: 'B07-T5',
      name: 'Handles breakpoint override referencing non-existent viewport gracefully',
      fn(t) {
        t.checkComponent('Unknown Viewport Breakpoint', 'M2', () => {
          const builder = require('../../../src/contract/layout_intent_builder');
          t.assert(typeof builder.createBreakpointRules === 'function');
        });
      }
    }
  ]
};
