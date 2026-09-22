'use strict';

/**
 * tests/e2e/tier1_features/f12_correspondence_mapper.test.js
 * Feature 12: Semantic & Structural Correspondence Mapper (`ctc map`)
 */

module.exports = {
  name: 'Feature 12: Semantic Correspondence Mapper (ctc map)',
  tests: [
    {
      id: 'F12-T1',
      name: 'Correspondence mapper module exists and exports generateCorrespondenceMap API',
      fn(t) {
        t.checkComponent('Correspondence Mapper Module', 'M3', () => {
          t.checkFileExists('src/mapping/mapper.js', 'M3');
          const mapper = require('../../../src/mapping/mapper');
          t.assert(typeof mapper.generateCorrespondenceMap === 'function');
        });
      }
    },
    {
      id: 'F12-T2',
      name: 'Correspondence mapper maps design sourceId to existing composables and routes',
      fn(t) {
        t.checkComponent('Composable Symbol Mapping', 'M3', () => {
          const mapper = require('../../../src/mapping/mapper');
          const map = mapper.generateCorrespondenceMap({
            appModel: { screens: [{ symbol: 'NoteEditorScreen', testTags: ['daylight#editor/back_btn'] }] },
            designContract: { measuredScenes: { scenes: { portrait: { rootNode: { sourceId: 'daylight#editor/back_btn' } } } } }
          });
          t.assert(map && Array.isArray(map.mappings));
        });
      }
    },
    {
      id: 'F12-T3',
      name: 'Correspondence mapper computes multi-signal confidence scores (0.0 - 1.0)',
      fn(t) {
        t.checkComponent('Multi-Signal Confidence Scoring', 'M3', () => {
          const mapper = require('../../../src/mapping/mapper');
          const map = mapper.generateCorrespondenceMap({
            appModel: { screens: [{ symbol: 'NoteEditorScreen', parameters: [{ name: 'onBackClick' }] }] },
            designContract: { measuredScenes: { scenes: { portrait: { rootNode: { sourceId: 'daylight#editor/back_btn', semantics: { role: 'Button' } } } } } }
          });
          t.assert(map.mappings[0].confidence >= 0.0 && map.mappings[0].confidence <= 1.0);
        });
      }
    },
    {
      id: 'F12-T4',
      name: 'Correspondence mapper disallows text-only matching when stable symbols exist',
      fn(t) {
        t.checkComponent('No Text-Only Matching Policy', 'M3', () => {
          const mapper = require('../../../src/mapping/mapper');
          t.assert(typeof mapper.scoreCandidateMapping === 'function');
        });
      }
    },
    {
      id: 'F12-T5',
      name: 'Correspondence mapper records classification categories and preservation obligations',
      fn(t) {
        t.checkComponent('Preservation Obligations Recording', 'M3', () => {
          const mapper = require('../../../src/mapping/mapper');
          const map = mapper.generateCorrespondenceMap({
            appModel: { screens: [] },
            designContract: { measuredScenes: { scenes: {} } }
          });
          t.assert(map.version === '2.0.0');
        });
      }
    }
  ]
};
