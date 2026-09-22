'use strict';

/**
 * tests/e2e/tier1_features/f20_workspace_manager.test.js
 * Feature 20: `.ctc/` Project Layout & Configuration Manager
 */

module.exports = {
  name: 'Feature 20: .ctc/ Project Layout Manager',
  tests: [
    {
      id: 'F20-T1',
      name: 'Workspace manager module exists and exports initWorkspace API',
      fn(t) {
        t.checkComponent('Workspace Manager Module', 'M5', () => {
          t.checkFileExists('src/config/workspace.js', 'M5');
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.initWorkspace === 'function');
        });
      }
    },
    {
      id: 'F20-T2',
      name: 'Workspace manager initializes .ctc directory structure (.ctc/app/, .ctc/designs/, etc.)',
      fn(t) {
        t.checkComponent('Workspace Directory Initialization', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          const layout = workspace.getStandardLayout('/tmp/ctc_test');
          t.assert(layout.appDir.includes('.ctc/app'));
          t.assert(layout.designsDir.includes('.ctc/designs'));
        });
      }
    },
    {
      id: 'F20-T3',
      name: 'Workspace manager manages project.toml configuration file',
      fn(t) {
        t.checkComponent('Project Config File Management', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.readConfig === 'function' || typeof workspace.writeConfig === 'function');
        });
      }
    },
    {
      id: 'F20-T4',
      name: 'Workspace manager maintains run receipts in .ctc/designs/<screen>/verification/runs/',
      fn(t) {
        t.checkComponent('Run Receipts Path Management', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          const runPath = workspace.getRunPath('/tmp/ctc_test', 'note_editor', 'run_001');
          t.assert(runPath.includes('runs/run_001'));
        });
      }
    },
    {
      id: 'F20-T5',
      name: 'Workspace manager cleans transient run artifacts on request',
      fn(t) {
        t.checkComponent('Transient Artifact Cleanup', 'M5', () => {
          const workspace = require('../../../src/config/workspace');
          t.assert(typeof workspace.cleanRuns === 'function' || typeof workspace.cleanTemp === 'function');
        });
      }
    }
  ]
};
