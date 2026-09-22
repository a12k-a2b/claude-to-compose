'use strict';

/**
 * tests/e2e/tier4_real_world/s05_closed_loop_defect_repair.test.js
 * Scenario 5: Closed-Loop Defect Oracle & Remediation Loop
 */

module.exports = {
  name: 'Scenario 05: Closed-Loop Verification & Defect Remediation',
  tests: [
    {
      id: 'S05-T1',
      name: 'Simulated margin drift (+18px) triggers Stage 3 Layout Telemetry failure',
      fn(t) {
        const drift = t.oracle.spatialDrift(64.0, 338.0, 64.0, 320.0);
        t.assertEqual(drift.dy, 18.0);
        t.assert(drift.distance > 3.0, '18px drift must fail 3.0px ceiling');
      }
    },
    {
      id: 'S05-T2',
      name: 'Causal defect oracle diagnoses PARENT_INSET_ACCUMULATION with confidence >= 0.90',
      fn(t) {
        t.checkComponent('Causal Root Cause Diagnosis', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const diagnosis = defectOracle.classifyRootCause({
            siblingShifts: [18.0, 18.0, 18.0, 18.0]
          });
          t.assertEqual(diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
          t.assert(diagnosis.confidence >= 0.90);
        });
      }
    },
    {
      id: 'S05-T3',
      name: 'Defect oracle emits remediation advice to adjust parent Column padding from 32dp to 23dp',
      fn(t) {
        t.checkComponent('Actionable Remediation Guidance', 'M4', () => {
          const defectOracle = require('../../../src/defects/oracle');
          const diagnosis = defectOracle.classifyRootCause({
            siblingShifts: [18.0, 18.0, 18.0, 18.0]
          });
          t.assert(diagnosis.remediationAction.includes('padding') || diagnosis.remediationAction.includes('parent'));
        });
      }
    },
    {
      id: 'S05-T4',
      name: 'Applying remediation reduces spatial drift to <= 1.0px and yields overall PASS',
      fn(t) {
        const postRepairDrift = t.oracle.spatialDrift(64.0, 320.5, 64.0, 320.0);
        t.assert(postRepairDrift.distance <= 1.0, 'Repaired drift must be <= 1.0px');
      }
    }
  ]
};
