'use strict';

/**
 * tests/e2e/tier1_features/f01_pilot_app.test.js
 * Feature 1: Functional Pilot Android App Fixture
 */

module.exports = {
  name: 'Feature 01: Functional Pilot Android App Fixture',
  tests: [
    {
      id: 'F01-T1',
      name: 'Pilot app directory structure and build configuration exists',
      fn(t) {
        t.checkComponent('Functional Pilot Android App Fixture', 'M1', () => {
          return t.checkFileExists('fixtures/note-app/build.gradle.kts', 'M1', 'Pilot note-taking app fixture build file');
        });
      }
    },
    {
      id: 'F01-T2',
      name: 'Pilot app contains Room persistence entities and DAO interfaces',
      fn(t) {
        t.checkComponent('Pilot App Room Persistence', 'M1', () => {
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/data/NoteEntity.kt', 'M1');
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/data/NoteDao.kt', 'M1');
        });
      }
    },
    {
      id: 'F01-T3',
      name: 'Pilot app contains Notes List and Note Editor screens',
      fn(t) {
        t.checkComponent('Pilot App Screens', 'M1', () => {
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/ui/list/NotesListScreen.kt', 'M1');
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/ui/editor/NoteEditorScreen.kt', 'M1');
        });
      }
    },
    {
      id: 'F01-T4',
      name: 'Pilot app contains NoteEditorViewModel with StateFlow and actions',
      fn(t) {
        t.checkComponent('Pilot App ViewModel', 'M1', () => {
          t.checkFileExists('fixtures/note-app/app/src/main/java/com/example/notes/ui/editor/NoteEditorViewModel.kt', 'M1');
        });
      }
    },
    {
      id: 'F01-T5',
      name: 'Pilot app contains unit and behavioral regression test suites',
      fn(t) {
        t.checkComponent('Pilot App Test Suite', 'M1', () => {
          t.checkFileExists('fixtures/note-app/app/src/test/java/com/example/notes/NotePersistenceTest.kt', 'M1');
        });
      }
    }
  ]
};
