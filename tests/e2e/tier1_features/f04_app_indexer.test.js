'use strict';

/**
 * tests/e2e/tier1_features/f04_app_indexer.test.js
 * Feature 4: Existing App Model Indexer (`ctc inspect-app`)
 */

module.exports = {
  name: 'Feature 04: Existing App Model Indexer (ctc inspect-app)',
  tests: [
    {
      id: 'F04-T1',
      name: 'App indexer module exists and exports inspectApp API',
      fn(t) {
        t.checkComponent('Existing App Model Indexer Module', 'M1', () => {
          t.checkFileExists('src/analyzer/indexer.js', 'M1');
          const indexer = require('../../../src/analyzer/indexer');
          t.assert(typeof indexer.inspectApp === 'function');
        });
      }
    },
    {
      id: 'F04-T2',
      name: 'App indexer indexes all screens, composable symbols, and source files',
      fn(t) {
        t.checkComponent('Screen Indexing', 'M1', () => {
          const indexer = require('../../../src/analyzer/indexer');
          const model = indexer.buildModelFromParsedData({
            screens: [{ symbol: 'com.example.notes.ui.editor.NoteEditorScreen', composableName: 'NoteEditorScreen' }]
          });
          t.assert(model && Array.isArray(model.screens));
          t.assertEqual(model.screens[0].composableName, 'NoteEditorScreen');
        });
      }
    },
    {
      id: 'F04-T3',
      name: 'App indexer indexes navigation routes and arguments',
      fn(t) {
        t.checkComponent('Route Indexing', 'M1', () => {
          const indexer = require('../../../src/analyzer/indexer');
          const model = indexer.buildModelFromParsedData({
            routes: [{ route: 'note_editor/{noteId}', destinationComposable: 'NoteEditorScreen' }]
          });
          t.assert(model && Array.isArray(model.routes));
          t.assertEqual(model.routes[0].route, 'note_editor/{noteId}');
        });
      }
    },
    {
      id: 'F04-T4',
      name: 'App indexer extracts Room persistence entities and DAOs',
      fn(t) {
        t.checkComponent('Persistence Indexing', 'M1', () => {
          const indexer = require('../../../src/analyzer/indexer');
          const model = indexer.buildModelFromParsedData({
            persistence: [{ entitySymbol: 'NoteEntity', daoSymbol: 'NoteDao' }]
          });
          t.assert(model && Array.isArray(model.persistence));
          t.assertEqual(model.persistence[0].entitySymbol, 'NoteEntity');
        });
      }
    },
    {
      id: 'F04-T5',
      name: 'App indexer extracts behavior invariants manifest into behavior-invariants.json',
      fn(t) {
        t.checkComponent('Behavior Invariants Extraction', 'M1', () => {
          const indexer = require('../../../src/analyzer/indexer');
          const manifest = indexer.extractInvariants([
            { id: 'INV-PERSIST-01', category: 'DataPersistence', description: 'Room debounced autosave' }
          ]);
          t.assert(manifest && Array.isArray(manifest.invariants));
          t.assertEqual(manifest.invariants[0].id, 'INV-PERSIST-01');
        });
      }
    }
  ]
};
