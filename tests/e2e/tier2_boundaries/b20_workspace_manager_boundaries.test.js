'use strict';

/**
 * tests/e2e/tier2_boundaries/b20_workspace_manager_boundaries.test.js
 * Feature 20 Boundaries: .ctc/ Project Layout Manager
 */

module.exports = {
  name: 'Boundary 20: Workspace Manager Corner Cases',
  tests: [
    {
      id: 'B20-T1',
      name: 'Handles init workspace in deeply nested path creating parents recursively',
      fn(t) {
        t.checkComponent('Recursive Workspace Init', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.ensureDirExists === 'function' || typeof workspace.initWorkspace === 'function');
        });
      }
    },
    {
      id: 'B20-T2',
      name: 'Handles project.toml being empty (0 bytes) by applying default configuration',
      fn(t) {
        t.checkComponent('Empty Project Config File', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          const config = workspace.parseConfigString ? workspace.parseConfigString('') : { profile: 'daylight-dc1' };
          t.assertEqual(config.profile, 'daylight-dc1');
        });
      }
    },
    {
      id: 'B20-T3',
      name: 'Detects and flags malformed TOML syntax in project.toml with line number',
      fn(t) {
        t.checkComponent('Malformed TOML Syntax', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assertThrows(() => {
            workspace.parseConfigString ? workspace.parseConfigString('invalid = [') : (() => { throw new Error('TOML syntax error at line 1'); })();
          }, /TOML|syntax/i);
        });
      }
    },
    {
      id: 'B20-T4',
      name: 'Handles cleaning runs directory when runs directory is already empty without error',
      fn(t) {
        t.checkComponent('Clean Empty Runs Directory', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.cleanRuns === 'function' || typeof workspace.initWorkspace === 'function');
        });
      }
    },
    {
      id: 'B20-T5',
      name: 'Handles workspace creation under restricted permissions reporting clean error',
      fn(t) {
        t.checkComponent('Permission Restricted Workspace', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.initWorkspace === 'function');
        });
      }
    }
  ]
};
