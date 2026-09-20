#!/usr/bin/env node

/**
 * test/e2e/run_all.js
 *
 * Master E2E Test Suite Runner for claude-to-compose visual verification overhaul.
 * Coordinates Tiers 1 through 4:
 *   - Tier 1: Feature Coverage (Sobel, Background Clustering, Zonal IoU, Typography, Tuner)
 *   - Tier 2: Boundary & Corner Cases (Shift Ladder, Anti-Deception Hard Veto, Aspect Ratios)
 *   - Tier 3: Cross-Feature Combinations (Tinted BG + Drift, Font Fallbacks, Nested Cards)
 *   - Tier 4: Real-World Application Scenarios (da63 and e34f artifacts)
 *
 * Usage:
 *   node test/e2e/run_all.js [options]
 *   Options:
 *     --tier, -t <1-4>       Execute only specified tier
 *     --filter, -f <pattern> Regex pattern to filter test names or IDs
 *     --verbose, -v          Verbose output with diagnostic details
 *     --bail, -b             Stop execution on first failure
 *     --json                 Emit summary as JSON
 *     --help, -h             Display help
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert');
const oracle = require('./helpers/oracle');

// ANSI Color formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const c = {
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  green: (s) => `${colors.green}${s}${colors.reset}`,
  red: (s) => `${colors.red}${s}${colors.reset}`,
  yellow: (s) => `${colors.yellow}${s}${colors.reset}`,
  cyan: (s) => `${colors.cyan}${s}${colors.reset}`,
  blue: (s) => `${colors.blue}${s}${colors.reset}`,
  magenta: (s) => `${colors.magenta}${s}${colors.reset}`,
  gray: (s) => `${colors.gray}${s}${colors.reset}`,
  passBadge: () => `${colors.bgGreen}${colors.white}${colors.bold} PASS ${colors.reset}`,
  failBadge: () => `${colors.bgRed}${colors.white}${colors.bold} FAIL ${colors.reset}`,
  unimplBadge: () => `${colors.bgYellow}${colors.white}${colors.bold} UNIMPL ${colors.reset}`,
  skipBadge: () => `${colors.gray}${colors.bold} SKIP ${colors.reset}`
};

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    tier: null,
    filter: null,
    verbose: false,
    bail: false,
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--bail' || arg === '-b') {
      options.bail = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--tier' || arg === '-t') {
      options.tier = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--tier=')) {
      options.tier = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith('-t=')) {
      options.tier = parseInt(arg.slice(3), 10);
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = new RegExp(argv[++i], 'i');
    } else if (arg.startsWith('--filter=')) {
      options.filter = new RegExp(arg.slice(9), 'i');
    }
  }

  return options;
}

function createTestContext(testId, testName) {
  return {
    testId,
    testName,
    projectRoot: PROJECT_ROOT,
    oracle,

    assert(condition, message) {
      if (!condition) {
        throw new assert.AssertionError({
          message: message || `Assertion failed in ${testId}`,
          actual: condition,
          expected: true,
          operator: '=='
        });
      }
    },

    assertEqual(actual, expected, message) {
      assert.strictEqual(actual, expected, message);
    },

    assertDeepEqual(actual, expected, message) {
      assert.deepStrictEqual(actual, expected, message);
    },

    assertMatch(string, regex, message) {
      assert.match(String(string), regex, message);
    },

    assertNotMatch(string, regex, message) {
      assert.doesNotMatch(String(string), regex, message);
    },

    assertThrows(fn, expected, message) {
      assert.throws(fn, expected, message);
    },

    async assertRejects(fn, expected, message) {
      await assert.rejects(fn, expected, message);
    },

    checkFileExists(relPath, requiredMilestone, detail) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new oracle.UnimplementedError(relPath, requiredMilestone, detail || `File not found on disk: ${relPath}`);
      }
      return fullPath;
    },

    unimplemented(component, milestone, reason) {
      throw new oracle.UnimplementedError(component, milestone, reason);
    },

    skip(reason) {
      throw new oracle.SkipTestError(reason);
    },

    readFile(relPath) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File does not exist: ${fullPath}`);
      }
      return fs.readFileSync(fullPath, 'utf8');
    },

    readJson(relPath) {
      return JSON.parse(this.readFile(relPath));
    },

    runCommand(cmd, args = [], options = {}) {
      const result = spawnSync(cmd, args, {
        cwd: options.cwd || PROJECT_ROOT,
        timeout: options.timeout || 15000,
        encoding: 'utf8',
        env: { ...process.env, ...options.env }
      });
      return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error
      };
    }
  };
}

async function runSuite(suite, options) {
  const suiteResults = {
    name: suite.name,
    tier: suite.tier,
    feature: suite.feature || `Tier ${suite.tier}`,
    tests: [],
    passed: 0,
    failed: 0,
    unimplemented: 0,
    skipped: 0,
    durationMs: 0
  };

  const suiteStart = performance.now();

  for (const testObj of suite.tests) {
    if (options.filter) {
      const matchesId = options.filter.test(testObj.id);
      const matchesName = options.filter.test(testObj.name);
      if (!matchesId && !matchesName) {
        continue;
      }
    }

    const ctx = createTestContext(testObj.id, testObj.name);
    const testStart = performance.now();
    let status = 'PASS';
    let error = null;

    try {
      await testObj.run(ctx);
    } catch (err) {
      if (err instanceof oracle.UnimplementedError) {
        status = 'UNIMPLEMENTED';
        error = err;
      } else if (err instanceof oracle.SkipTestError) {
        status = 'SKIPPED';
        error = err;
      } else {
        status = 'FAIL';
        error = err;
      }
    }

    const testDuration = performance.now() - testStart;

    const testResult = {
      id: testObj.id,
      name: testObj.name,
      status,
      durationMs: parseFloat(testDuration.toFixed(2)),
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            component: error.component,
            milestone: error.milestone
          }
        : null
    };

    suiteResults.tests.push(testResult);

    if (status === 'PASS') suiteResults.passed++;
    else if (status === 'FAIL') suiteResults.failed++;
    else if (status === 'UNIMPLEMENTED') suiteResults.unimplemented++;
    else if (status === 'SKIPPED') suiteResults.skipped++;

    if (!options.json) {
      let badge = c.passBadge();
      if (status === 'FAIL') badge = c.failBadge();
      else if (status === 'UNIMPLEMENTED') badge = c.unimplBadge();
      else if (status === 'SKIPPED') badge = c.skipBadge();

      console.log(`  ${badge} ${c.bold(testObj.id)}: ${testObj.name} ${c.gray(`(${testDuration.toFixed(1)}ms)`)}`);
      if (status === 'FAIL' || (options.verbose && error)) {
        console.log(c.red(`     └─ Error: ${error.message}`));
        if (options.verbose && error.stack) {
          console.log(c.gray(`        ${error.stack.split('\n').slice(1, 4).join('\n        ')}`));
        }
      }
    }

    if (status === 'FAIL' && options.bail) {
      break;
    }
  }

  suiteResults.durationMs = parseFloat((performance.now() - suiteStart).toFixed(2));
  return suiteResults;
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
claude-to-compose: Opaque-Box E2E Test Suite Runner
Usage: node test/e2e/run_all.js [options]

Options:
  -t, --tier <1-4>        Run tests from specific tier
  -f, --filter <pattern>  Filter tests by ID or description pattern
  -v, --verbose           Show detailed error traces and diagnostics
  -b, --bail              Stop execution on first failure
  --json                  Output structured summary in JSON
  -h, --help              Show this help message
`);
    process.exit(0);
  }

  const tierFiles = [
    { tier: 1, path: './tier1_features.test.js' },
    { tier: 2, path: './tier2_boundaries.test.js' },
    { tier: 3, path: './tier3_combinations.test.js' },
    { tier: 4, path: './tier4_real_world.test.js' }
  ];

  const selectedTiers = options.tier
    ? tierFiles.filter((tf) => tf.tier === options.tier)
    : tierFiles;

  if (selectedTiers.length === 0) {
    console.error(c.red(`Invalid tier "${options.tier}". Allowed tiers: 1, 2, 3, 4.`));
    process.exit(1);
  }

  if (!options.json) {
    console.log('\n' + c.bold('========================================================================'));
    console.log(c.bold('   CLAUDE-TO-COMPOSE: OPAQUE-BOX E2E VERIFICATION TEST SUITE'));
    console.log(c.bold('========================================================================'));
    if (options.tier) console.log(c.cyan(`▶ Target Tier: ${options.tier}`));
    if (options.filter) console.log(c.cyan(`▶ Filter: ${options.filter}`));
    console.log('');
  }

  const totalResults = {
    timestamp: new Date().toISOString(),
    suites: [],
    totalTests: 0,
    passed: 0,
    failed: 0,
    unimplemented: 0,
    skipped: 0,
    durationMs: 0
  };

  const suiteStart = performance.now();

  for (const tf of selectedTiers) {
    const fullPath = path.resolve(__dirname, tf.path);
    if (!fs.existsSync(fullPath)) {
      if (!options.json) {
        console.log(c.yellow(`! Tier ${tf.tier} test file not found: ${tf.path}`));
      }
      continue;
    }

    const suite = require(fullPath);
    if (!options.json) {
      console.log(c.bold(`\n▶ [Tier ${tf.tier}] ${suite.name || path.basename(tf.path)}`));
    }

    const suiteRes = await runSuite(suite, options);
    totalResults.suites.push(suiteRes);

    totalResults.totalTests += suiteRes.tests.length;
    totalResults.passed += suiteRes.passed;
    totalResults.failed += suiteRes.failed;
    totalResults.unimplemented += suiteRes.unimplemented;
    totalResults.skipped += suiteRes.skipped;

    if (suiteRes.failed > 0 && options.bail) {
      break;
    }
  }

  totalResults.durationMs = parseFloat((performance.now() - suiteStart).toFixed(2));

  if (options.json) {
    console.log(JSON.stringify(totalResults, null, 2));
  } else {
    console.log('\n' + c.bold('========================================================================'));
    console.log(c.bold('   TEST EXECUTION SUMMARY'));
    console.log(c.bold('========================================================================'));
    console.log(`  Total Tests Executed:     ${c.bold(totalResults.totalTests)}`);
    console.log(`  Passed:                   ${c.green(totalResults.passed)}`);
    console.log(`  Failed:                   ${totalResults.failed > 0 ? c.red(totalResults.failed) : '0'}`);
    console.log(`  Unimplemented:            ${totalResults.unimplemented > 0 ? c.yellow(totalResults.unimplemented) : '0'}`);
    console.log(`  Skipped:                  ${totalResults.skipped > 0 ? c.gray(totalResults.skipped) : '0'}`);
    console.log(`  Total Duration:           ${(totalResults.durationMs / 1000).toFixed(2)}s`);
    console.log(c.bold('========================================================================\n'));
  }

  if (totalResults.failed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = {
  main,
  parseArgs,
  createTestContext,
  runSuite
};
