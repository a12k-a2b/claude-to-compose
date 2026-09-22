'use strict';

/**
 * tests/e2e/tier1_features/f13_migration_planner.test.js
 * Feature 13: Migration Planner (`ctc plan`)
 */

module.exports = {
  name: 'Feature 13: Migration Planner (ctc plan)',
  tests: [
    {
      id: 'F13-T1',
      name: 'Migration planner module exists and exports generateMigrationPlan API',
      fn(t) {
        t.checkComponent('Migration Planner Module', 'M3', () => {
          t.checkFileExists('src/mapping/planner.js', 'M3');
          const planner = require('../../../src/mapping/planner');
          t.assert(typeof planner.generateMigrationPlan === 'function');
        });
      }
    },
    {
      id: 'F13-T2',
      name: 'Migration planner defines 5 sequential execution phases',
      fn(t) {
        t.checkComponent('Phased Migration Sequence', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          const plan = planner.generateMigrationPlan({
            screenId: 'note_editor',
            correspondenceMap: { mappings: [] }
          });
          t.assert(plan && Array.isArray(plan.phases));
          t.assertEqual(plan.phases.length, 5);
        });
      }
    },
    {
      id: 'F13-T3',
      name: 'Migration planner declares strict allowedModificationPaths boundaries',
      fn(t) {
        t.checkComponent('Allowed Modification Paths Boundary', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          const plan = planner.generateMigrationPlan({
            screenId: 'note_editor',
            correspondenceMap: { mappings: [] }
          });
          t.assert(plan.boundaries && Array.isArray(plan.boundaries.allowedModificationPaths));
          t.assert(plan.boundaries.allowedModificationPaths.some(p => p.includes('ui/editor')));
        });
      }
    },
    {
      id: 'F13-T4',
      name: 'Migration planner declares strict forbiddenPaths protecting domain/data architecture',
      fn(t) {
        t.checkComponent('Forbidden Paths Protection', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          const plan = planner.generateMigrationPlan({
            screenId: 'note_editor',
            correspondenceMap: { mappings: [] }
          });
          t.assert(plan.boundaries && Array.isArray(plan.boundaries.forbiddenPaths));
          t.assert(plan.boundaries.forbiddenPaths.some(p => p.includes('data')));
        });
      }
    },
    {
      id: 'F13-T5',
      name: 'Migration planner declares forbiddenBehaviors prohibiting mock data and EPD hooks',
      fn(t) {
        t.checkComponent('Forbidden Behaviors Declaration', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          const plan = planner.generateMigrationPlan({
            screenId: 'note_editor',
            correspondenceMap: { mappings: [] }
          });
          t.assert(plan.boundaries && Array.isArray(plan.boundaries.forbiddenBehaviors));
          t.assert(plan.boundaries.forbiddenBehaviors.some(b => b.includes('EPD')));
        });
      }
    }
  ]
};
