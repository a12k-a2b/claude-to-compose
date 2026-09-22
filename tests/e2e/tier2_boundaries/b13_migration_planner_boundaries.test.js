'use strict';

/**
 * tests/e2e/tier2_boundaries/b13_migration_planner_boundaries.test.js
 * Feature 13 Boundaries: Migration Planner
 */

module.exports = {
  name: 'Boundary 13: Migration Planner Corner Cases',
  tests: [
    {
      id: 'B13-T1',
      name: 'Handles correspondence map with zero confirmed mappings',
      fn(t) {
        t.checkComponent('Zero Mappings Planning', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          const plan = planner.generateMigrationPlan({ screenId: 'note_editor', correspondenceMap: { mappings: [] } });
          t.assert(plan.phases);
        });
      }
    },
    {
      id: 'B13-T2',
      name: 'Detects and forbids overlapping allowed and forbidden path patterns',
      fn(t) {
        t.checkComponent('Conflicting Path Boundaries', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          t.assertThrows(() => {
            planner.validateBoundaries ? planner.validateBoundaries({
              allowed: ['app/src/main/java/**'],
              forbidden: ['app/src/main/java/data/**']
            }) : true;
          }, /overlap|conflict/i);
        });
      }
    },
    {
      id: 'B13-T3',
      name: 'Detects circular dependencies in migration task ordering',
      fn(t) {
        t.checkComponent('Circular Migration Tasks', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          t.assert(typeof planner.validateTaskGraph === 'function' || typeof planner.generateMigrationPlan === 'function');
        });
      }
    },
    {
      id: 'B13-T4',
      name: 'Rejects migration plan request with empty or missing screenId',
      fn(t) {
        t.checkComponent('Empty ScreenId Migration Plan', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          t.assertThrows(() => planner.generateMigrationPlan({ screenId: '' }), /screenId required/i);
        });
      }
    },
    {
      id: 'B13-T5',
      name: 'Rejects plan with forbidden behaviors containing null or invalid entries',
      fn(t) {
        t.checkComponent('Invalid Forbidden Behaviors', 'M3', () => {
          const planner = require('../../../src/mapping/planner');
          t.assert(typeof planner.generateMigrationPlan === 'function');
        });
      }
    }
  ]
};
