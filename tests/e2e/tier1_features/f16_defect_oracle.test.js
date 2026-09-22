'use strict';

/**
 * tests/e2e/tier1_features/f16_defect_oracle.test.js
 * Feature 16: Causal Defect Oracle (`ctc defects`)
 */

module.exports = {
  name: 'Feature 16: Causal Defect Oracle (ctc defects)',
  tests: [
    {
      id: 'F16-T1',
      name: 'Defect oracle module exists and exports diagnoseDefects API',
      fn(t) {
        t.checkComponent('Defect Oracle Module', 'M4', () => {
          t.checkFileExists('src/defects/oracle.js', 'M4');
          const defectOracle = require('../../../src/defects/oracle');
          t.assert(typeof defectOracle.diagnoseDefects === 'function');
        });
      }
    },
    {
      id: 'F16-T2',
      name: 'Defect oracle attributes failures directly to stable sourceId',
      fn(t) {
        t.checkComponent('SourceId Attribution', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const report = defectOracle.diagnoseDefects({
            failures: [
              { sourceId: 'daylight#note_editor/title', deltaPx: { dx: 0, dy: 18 } }
            ]
          });
          t.assert(report && Array.isArray(report.defects));
          t.assertEqual(report.defects[0].sourceId, 'daylight#note_editor/title');
        });
      }
    },
    {
      id: 'F16-T3',
      name: 'Defect oracle maps defect to target Kotlin file, composable symbol, and line number',
      fn(t) {
        t.checkComponent('Kotlin Target Symbol Mapping', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const report = defectOracle.diagnoseDefects({
            failures: [{ sourceId: 'daylight#note_editor/title', deltaPx: { dx: 0, dy: 18 } }],
            correspondenceMap: { mappings: [{ designSourceId: 'daylight#note_editor/title', existingTarget: { composableSymbol: 'NoteEditorScreen', file: 'NoteEditorScreen.kt' } }] }
          });
          t.assertEqual(report.defects[0].target.composable, 'NoteEditorScreen');
        });
      }
    },
    {
      id: 'F16-T4',
      name: 'Defect oracle classifies causal root cause (PARENT_INSET_ACCUMULATION, etc.)',
      fn(t) {
        t.checkComponent('Causal Root-Cause Classification', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const diagnosis = defectOracle.classifyRootCause({
            siblingShifts: [18.0, 18.0, 18.0, 18.0]
          });
          t.assertEqual(diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
        });
      }
    },
    {
      id: 'F16-T5',
      name: 'Defect oracle emits actionable remediation instruction without fuzzy text patching',
      fn(t) {
        t.checkComponent('Actionable Remediation Guidance', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const diagnosis = defectOracle.classifyRootCause({
            siblingShifts: [18.0, 18.0]
          });
          t.assert(diagnosis.remediationAction && typeof diagnosis.remediationAction === 'string');
          t.assert(!diagnosis.remediationAction.includes('regex'));
        });
      }
    }
  ]
};
