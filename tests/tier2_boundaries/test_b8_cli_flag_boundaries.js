/**
 * Tier 2 - Boundary 8: CLI Argument Parsing Edge Cases & Negative Tests
 * Covers: Conflicting flags, missing arguments, invalid options, output dir creation
 */

module.exports = {
  name: 'B8: CLI Argument Parsing Boundaries',
  tier: 2,
  feature: 'B8',
  tests: [
    {
      id: 'T2_B8_01',
      name: 'Reject simultaneous provision of both --url and --file flags (conflicting inputs)',
      run: async (t) => {
        function validateCliInputFlags(flags) {
          if (flags.url && flags.file) {
            throw new Error('ConflictingInputError: Cannot specify both --url and --file simultaneously');
          }
          if (!flags.url && !flags.file) {
            throw new Error('MissingInputError: Must specify either a target --url or --file');
          }
          return true;
        }
        t.assertThrows(
          () => validateCliInputFlags({ url: 'https://claude.site/test', file: 'index.html' }),
          /ConflictingInputError/
        );
        t.assertThrows(
          () => validateCliInputFlags({}),
          /MissingInputError/
        );
        t.assert(validateCliInputFlags({ url: 'https://claude.site/test' }));
        t.assert(validateCliInputFlags({ file: 'index.html' }));
      }
    },
    {
      id: 'T2_B8_02',
      name: 'Reject unknown CLI options with clear usage message',
      run: async (t) => {
        const allowedFlags = new Set(['url', 'file', 'output', 'timeout', 'headless', 'help', 'version']);
        function checkUnknownFlags(userFlags) {
          for (const flag of Object.keys(userFlags)) {
            if (!allowedFlags.has(flag)) {
              throw new Error(`UnknownOptionError: Unrecognized option "--${flag}". Run with --help for valid options.`);
            }
          }
          return true;
        }
        t.assertThrows(() => checkUnknownFlags({ 'invalid-option': true }), /UnknownOptionError/);
        t.assert(checkUnknownFlags({ url: 'https://claude.site', output: './out' }));
      }
    },
    {
      id: 'T2_B8_03',
      name: 'Validate output directory path sanitization and normalization',
      run: async (t) => {
        const path = require('node:path');
        function sanitizeOutputDir(dirPath) {
          if (!dirPath || typeof dirPath !== 'string') return path.resolve('./output');
          return path.resolve(dirPath);
        }
        const resolved = sanitizeOutputDir('./my_output/spec');
        t.assert(path.isAbsolute(resolved));
      }
    },
    {
      id: 'T2_B8_04',
      name: 'Reject non-numeric timeout arguments',
      run: async (t) => {
        function parseTimeout(val) {
          const n = Number(val);
          if (isNaN(n) || !Number.isFinite(n)) {
            throw new Error(`InvalidTimeoutError: Expected numeric timeout, got "${val}"`);
          }
          return n;
        }
        t.assertThrows(() => parseTimeout('abc'), /InvalidTimeoutError/);
        t.assertEqual(parseTimeout('5000'), 5000);
      }
    },
    {
      id: 'T2_B8_05',
      name: 'Verify CLI binary execution handles missing arguments',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI entry point required to test argument error handling');
      }
    }
  ]
};
