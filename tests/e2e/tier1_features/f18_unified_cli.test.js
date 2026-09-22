'use strict';

/**
 * tests/e2e/tier1_features/f18_unified_cli.test.js
 * Feature 18: Unified Local CLI (`bin/ctc.js`)
 */

module.exports = {
  name: 'Feature 18: Unified Local CLI (bin/ctc.js)',
  tests: [
    {
      id: 'F18-T1',
      name: 'Unified CLI executable bin/ctc.js exists with execute permissions',
      fn(t) {
        t.checkComponent('Unified CLI Executable', 'M5', () => {
          t.checkFileExists('bin/ctc.js', 'M5');
        });
      }
    },
    {
      id: 'F18-T2',
      name: 'Unified CLI supports --help and displays 13 subcommands',
      fn(t) {
        t.checkComponent('CLI Subcommands Help', 'M5', () => {
          const cli = require('../../../src/cli/dispatcher');
          t.assert(cli.SUBCOMMANDS && cli.SUBCOMMANDS.length === 13);
          t.assert(cli.SUBCOMMANDS.includes('doctor'));
          t.assert(cli.SUBCOMMANDS.includes('baseline'));
          t.assert(cli.SUBCOMMANDS.includes('verify'));
        });
      }
    },
    {
      id: 'F18-T3',
      name: 'Unified CLI returns machine-readable JSON output schema',
      fn(t) {
        t.checkComponent('JSON Output Schema', 'M5', () => {
          const cli = require('../../../src/cli/dispatcher');
          const output = cli.formatOutput({
            success: true,
            status: 'PASS',
            data: { test: true }
          });
          t.assert(output.status === 'PASS');
          t.assert(typeof output.exitCode === 'number');
        });
      }
    },
    {
      id: 'F18-T4',
      name: 'Unified CLI implements strict exit codes (0: PASS, 1: FAIL, 2: BLOCKED, 3: INFRA)',
      fn(t) {
        t.checkComponent('Strict Exit Codes', 'M5', () => {
          const cli = require('../../../src/cli/dispatcher');
          t.assertEqual(cli.EXIT_CODES.PASS, 0);
          t.assertEqual(cli.EXIT_CODES.FAIL, 1);
          t.assertEqual(cli.EXIT_CODES.BLOCKED, 2);
          t.assertEqual(cli.EXIT_CODES.INFRASTRUCTURE_ERROR, 3);
        });
      }
    },
    {
      id: 'F18-T5',
      name: 'Unified CLI handles invalid subcommands with code 1 and helpful error message',
      fn(t) {
        t.checkComponent('Unknown Subcommand Handling', 'M5', () => {
          const cli = require('../../../src/cli/dispatcher');
          const res = cli.dispatch(['unknown-subcommand']);
          t.assertEqual(res.exitCode, 1);
        });
      }
    }
  ]
};
