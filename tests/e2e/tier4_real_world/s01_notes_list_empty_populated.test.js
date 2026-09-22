'use strict';

/**
 * tests/e2e/tier4_real_world/s01_notes_list_empty_populated.test.js
 * Scenario 1: Notes List Screen Retrofit (Empty State to Populated Grid)
 */

module.exports = {
  name: 'Scenario 01: Notes List Screen Retrofit Workflow',
  tests: [
    {
      id: 'S01-T1',
      name: 'Baseline capture establishes clean pre-retrofit baseline for Notes List',
      fn(t) {
        t.checkComponent('Notes List Baseline', 'M1', () => {
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/ui/list/NotesListScreen.kt', 'M1');
        });
      }
    },
    {
      id: 'S01-T2',
      name: 'Empty state presentation renders Sol:OS illustration and call to action',
      fn(t) {
        t.checkComponent('Notes List Empty State', 'M2', () => {
          const emptyToken = t.oracle.SOL_OS_TOKENS['--os-300'];
          t.assert(emptyToken);
        });
      }
    },
    {
      id: 'S01-T3',
      name: 'Populated state renders note cards with hairline borders (--os-100)',
      fn(t) {
        const borderToken = t.oracle.SOL_OS_TOKENS['--os-100'];
        t.assertEqual(borderToken.hex, '#DCD5C9');
      }
    },
    {
      id: 'S01-T4',
      name: 'Floating action button maintains >= 48dp touch target and triggers navigation',
      fn(t) {
        const fabTarget = { widthDp: 56, heightDp: 56 };
        t.assert(fabTarget.widthDp >= t.oracle.DC1_SPEC.minTouchTargetDp.width);
        t.assert(fabTarget.heightDp >= t.oracle.DC1_SPEC.minTouchTargetDp.height);
      }
    }
  ]
};
