'use strict';

/**
 * tests/e2e/tier1_features/f11_contract_compiler.test.js
 * Feature 11: Design Contract Compiler (`ctc contract build`)
 */

module.exports = {
  name: 'Feature 11: Design Contract Compiler (ctc contract build)',
  tests: [
    {
      id: 'F11-T1',
      name: 'Contract compiler module exists and exports buildDesignContract API',
      fn(t) {
        t.checkComponent('Design Contract Compiler Module', 'M2', () => {
          t.checkFileExists('src/contract/compiler.js', 'M2');
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.buildDesignContract === 'function');
        });
      }
    },
    {
      id: 'F11-T2',
      name: 'Contract compiler synthesizes all 4 layers from evidence bundle',
      fn(t) {
        t.checkComponent('4-Layer Synthesis', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          const bundle = compiler.synthesizeLayers({
            screenId: 'note_editor',
            evidence: { domNodes: [], fonts: [], assets: [] }
          });
          t.assert(bundle.measuredScenes);
          t.assert(bundle.layoutIntent);
          t.assert(bundle.behaviorContract);
          t.assert(bundle.designSystem);
        });
      }
    },
    {
      id: 'F11-T3',
      name: 'Contract compiler preserves consistent stable sourceId across all layers',
      fn(t) {
        t.checkComponent('Stable sourceId Preservation', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          const bundle = compiler.synthesizeLayers({
            screenId: 'note_editor',
            evidence: { domNodes: [{ id: 'btn_1', path: 'note_editor/header/btn' }] }
          });
          t.assert(bundle.measuredScenes.scenes);
        });
      }
    },
    {
      id: 'F11-T4',
      name: 'Contract compiler validates generated JSON against Draft 2020-12 schemas',
      fn(t) {
        t.checkComponent('Schema Validation', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.validateContractAgainstSchemas === 'function');
        });
      }
    },
    {
      id: 'F11-T5',
      name: 'Contract compiler outputs artifacts to .ctc/designs/<screen>/contract/',
      fn(t) {
        t.checkComponent('Contract Emission Paths', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.writeContractToDisk === 'function');
        });
      }
    }
  ]
};
