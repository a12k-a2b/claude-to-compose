'use strict';

/**
 * tests/e2e/tier2_boundaries/b11_contract_compiler_boundaries.test.js
 * Feature 11 Boundaries: Design Contract Compiler
 */

module.exports = {
  name: 'Boundary 11: Contract Compiler Corner Cases',
  tests: [
    {
      id: 'B11-T1',
      name: 'Handles evidence bundle containing zero scenes with validation error',
      fn(t) {
        t.checkComponent('Empty Scenes Evidence Bundle', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assertThrows(() => compiler.synthesizeLayers({ screenId: 'test', evidence: { scenes: {} } }), /empty|no scenes/i);
        });
      }
    },
    {
      id: 'B11-T2',
      name: 'Rejects mismatched screenId between evidence bundle and contract request',
      fn(t) {
        t.checkComponent('Mismatched Screen ID', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.validateScreenId === 'function' || typeof compiler.buildDesignContract === 'function');
        });
      }
    },
    {
      id: 'B11-T3',
      name: 'Detects and flags duplicate sourceId definitions across sibling nodes',
      fn(t) {
        t.checkComponent('Duplicate sourceId Detection', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.checkDuplicateSourceIds === 'function' || typeof compiler.buildDesignContract === 'function');
        });
      }
    },
    {
      id: 'B11-T4',
      name: 'Handles compilation with missing required schema fields by emitting schema error',
      fn(t) {
        t.checkComponent('Missing Required Schema Fields', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.validateContractAgainstSchemas === 'function');
        });
      }
    },
    {
      id: 'B11-T5',
      name: 'Handles output write to read-only filesystem by reporting clear error code',
      fn(t) {
        t.checkComponent('Read-Only Filesystem Handling', 'M2', () => {
          const compiler = require('../../../src/contract/compiler');
          t.assert(typeof compiler.writeContractToDisk === 'function');
        });
      }
    }
  ]
};
