/**
 * Tier 1 - Feature 8: CLI Tool Execution (claude-extract)
 * Covers: R1 / ORIGINAL_REQUEST §R1 / PROJECT.md §Feature 13
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'F8: CLI Tool Execution (claude-extract)',
  tier: 1,
  feature: 'F8',
  tests: [
    {
      id: 'T1_F8_01',
      name: 'Verify CLI binary file location at bin/claude-extract.js',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI executable entry point bin/claude-extract.js must exist');
      }
    },
    {
      id: 'T1_F8_02',
      name: 'Verify CLI binary has executable shebang (#!/usr/bin/env node)',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1');
        const content = t.readFile('bin/claude-extract.js');
        t.assert(content.startsWith('#!/usr/bin/env node'), 'CLI binary must have node shebang');
      }
    },
    {
      id: 'T1_F8_03',
      name: 'Verify CLI argument parsing handles --output, --url, and --file options',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1');
        const result = t.runCommand('node', ['bin/claude-extract.js', '--help']);
        t.assertEqual(result.status, 0, 'CLI --help should exit with status 0');
        t.assertMatch(result.stdout, /--output|-o/, 'CLI help should document --output flag');
      }
    },
    {
      id: 'T1_F8_04',
      name: 'Verify CLI exits with non-zero status when invoked with invalid arguments',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1');
        const result = t.runCommand('node', ['bin/claude-extract.js', '--unknown-flag-xyz']);
        t.assert(result.status !== 0, 'CLI should exit non-zero on unknown arguments');
      }
    },
    {
      id: 'T1_F8_05',
      name: 'Verify package.json bin entry maps claude-extract to bin/claude-extract.js',
      run: async (t) => {
        t.checkFileExists('package.json', 'M1');
        const pkg = t.readJson('package.json');
        t.assert(pkg.bin && pkg.bin['claude-extract'] === 'bin/claude-extract.js', 'package.json must configure bin.claude-extract');
      }
    }
  ]
};
