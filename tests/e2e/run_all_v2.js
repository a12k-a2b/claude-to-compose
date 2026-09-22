#!/usr/bin/env node
'use strict';

/**
 * tests/e2e/run_all_v2.js
 *
 * Master Opaque-Box E2E Test Suite Runner for ctc v2.
 * Executes all 4 tiers and negative controls across the retrofit compiler lifecycle.
 *
 * Usage:
 *   node tests/e2e/run_all_v2.js [options]
 *
 * Options:
 *   --tier, -t <1-4>       Execute only specified tier (1, 2, 3, or 4)
 *   --filter, -f <pattern> Filter test names or IDs by regex
 *   --verbose, -v          Verbose diagnostic output per test
 *   --bail, -b             Exit immediately on first test failure
 *   --json                 Emit summary as JSON
 *   --help, -h             Display this help message
 */

const fs = require('node:fs');
const path = require('node:path');
const { createTestContext, UnimplementedError, SkipTestError, PROJECT_ROOT } = require('./helpers/test_context');

// ANSI Color formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
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

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    tier: null,
    filter: null,
    verbose: false,
    bail: false,
    json: false,
    help: false
  };

  function validateTier(val) {
    const parsed = parseInt(val, 10);
    if (![1, 2, 3, 4].includes(parsed) || String(parsed) !== String(val).trim()) {
      throw new Error(`Invalid tier "${val}". Valid tiers are 1, 2, 3, 4.`);
    }
    return parsed;
  }

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
      options.tier = validateTier(argv[++i]);
    } else if (arg.startsWith('--tier=')) {
      options.tier = validateTier(arg.slice(7));
    } else if (arg.startsWith('-t=')) {
      options.tier = validateTier(arg.slice(3));
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = new RegExp(argv[++i], 'i');
    } else if (arg.startsWith('--filter=')) {
      options.filter = new RegExp(arg.slice(9), 'i');
    }
  }

  return options;
}

function loadSuitesFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.test.js')).sort();
  return files.map(file => {
    const fullPath = path.join(dirPath, file);
    try {
      const suiteModule = require(fullPath);
      return {
        file,
        fullPath,
        ...suiteModule
      };
    } catch (err) {
      console.error(`Failed to load suite ${file}:`, err);
      return null;
    }
  }).filter(Boolean);
}

async function runTest(testDef, options) {
  const startTime = performance.now();
  const context = createTestContext(testDef.id, testDef.name);

  try {
    const result = testDef.fn(context);
    if (result && typeof result.then === 'function') {
      await result;
    }
    const durationMs = performance.now() - startTime;
    return {
      id: testDef.id,
      name: testDef.name,
      status: 'PASS',
      durationMs
    };
  } catch (err) {
    const durationMs = performance.now() - startTime;
    if (err instanceof UnimplementedError) {
      return {
        id: testDef.id,
        name: testDef.name,
        status: 'UNIMPLEMENTED',
        component: err.component,
        milestone: err.milestone,
        reason: err.reason,
        durationMs
      };
    } else if (err instanceof SkipTestError) {
      return {
        id: testDef.id,
        name: testDef.name,
        status: 'SKIPPED',
        reason: err.reason,
        durationMs
      };
    } else {
      return {
        id: testDef.id,
        name: testDef.name,
        status: 'FAIL',
        error: err.message || String(err),
        stack: err.stack,
        durationMs
      };
    }
  }
}

async function runSuite(options = {}) {
  const suitesByTier = {
    1: loadSuitesFromDir(path.resolve(__dirname, 'tier1_features')),
    2: loadSuitesFromDir(path.resolve(__dirname, 'tier2_boundaries')),
    3: loadSuitesFromDir(path.resolve(__dirname, 'tier3_combinations')),
    4: [
      ...loadSuitesFromDir(path.resolve(__dirname, 'tier4_real_world')),
      ...loadSuitesFromDir(path.resolve(__dirname, 'negative_controls'))
    ]
  };

  const tiersToRun = options.tier ? [options.tier] : [1, 2, 3, 4];
  const summary = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    unimplemented: 0,
    skipped: 0,
    tierBreakdown: {},
    failures: [],
    unimplementedComponents: new Set(),
    durationMs: 0
  };

  const suiteStartTime = performance.now();

  if (!options.json) {
    console.log(c.bold(`\n==============================================================================`));
    console.log(c.bold(`  Claude to Compose (ctc) v2: Opaque-Box E2E Test Suite Runner`));
    console.log(c.bold(`==============================================================================`));
    if (options.tier) console.log(c.cyan(`  Active Tier: ${options.tier}`));
    if (options.filter) console.log(c.cyan(`  Filter Pattern: ${options.filter}`));
    console.log('');
  }

  for (const tier of tiersToRun) {
    const suites = suitesByTier[tier] || [];
    summary.tierBreakdown[tier] = { total: 0, passed: 0, failed: 0, unimplemented: 0, skipped: 0 };

    if (!options.json) {
      console.log(c.bold(`--- Tier ${tier} Execution ---`));
    }

    for (const suite of suites) {
      const testsToRun = (suite.tests || []).filter(t => {
        if (!options.filter) return true;
        return options.filter.test(t.id) || options.filter.test(t.name) || options.filter.test(suite.name);
      });

      if (testsToRun.length === 0) continue;

      if (!options.json && options.verbose) {
        console.log(`\n  ${c.blue(suite.name)} (${suite.file})`);
      }

      for (const testDef of testsToRun) {
        summary.totalTests++;
        summary.tierBreakdown[tier].total++;

        const result = await runTest(testDef, options);

        if (result.status === 'PASS') {
          summary.passed++;
          summary.tierBreakdown[tier].passed++;
          if (!options.json) {
            console.log(`    ${c.passBadge()} [${result.id}] ${result.name} ${c.gray(`(${result.durationMs.toFixed(1)}ms)`)}`);
          }
        } else if (result.status === 'UNIMPLEMENTED') {
          summary.unimplemented++;
          summary.tierBreakdown[tier].unimplemented++;
          summary.unimplementedComponents.add(`[${result.milestone || 'Pending'}] ${result.component}`);
          if (!options.json) {
            console.log(`    ${c.unimplBadge()} [${result.id}] ${result.name} ${c.yellow(`[Pending: ${result.milestone || 'M?'}]`)}`);
          }
        } else if (result.status === 'SKIPPED') {
          summary.skipped++;
          summary.tierBreakdown[tier].skipped++;
          if (!options.json) {
            console.log(`    ${c.skipBadge()} [${result.id}] ${result.name}`);
          }
        } else {
          summary.failed++;
          summary.tierBreakdown[tier].failed++;
          summary.failures.push(result);
          if (!options.json) {
            console.log(`    ${c.failBadge()} [${result.id}] ${result.name}`);
            console.log(c.red(`      Error: ${result.error}`));
          }
          if (options.bail) {
            break;
          }
        }
      }

      if (options.bail && summary.failed > 0) break;
    }

    if (options.bail && summary.failed > 0) break;
  }

  summary.durationMs = performance.now() - suiteStartTime;
  summary.unimplementedList = Array.from(summary.unimplementedComponents);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(c.bold(`\n==============================================================================`));
    console.log(c.bold(`  Execution Summary`));
    console.log(c.bold(`==============================================================================`));
    console.log(`  Total Tests:       ${summary.totalTests}`);
    console.log(`  Passed:            ${c.green(summary.passed)}`);
    console.log(`  Unimplemented:     ${c.yellow(summary.unimplemented)} (Progressively tracking milestones)`);
    console.log(`  Skipped:           ${c.gray(summary.skipped)}`);
    console.log(`  Failed:            ${summary.failed > 0 ? c.red(summary.failed) : c.green(0)}`);
    console.log(`  Duration:          ${summary.durationMs.toFixed(2)}ms`);

    console.log(c.bold(`\n  Tier Breakdown:`));
    for (const [t, data] of Object.entries(summary.tierBreakdown)) {
      console.log(`    Tier ${t}: ${data.total} tests (${c.green(data.passed)} passed, ${c.yellow(data.unimplemented)} unimpl, ${data.failed > 0 ? c.red(data.failed) : 0} failed)`);
    }

    if (summary.failures.length > 0) {
      console.log(c.bold(c.red(`\n  Failures (${summary.failures.length}):`)));
      summary.failures.forEach(f => {
        console.log(`    - [${f.id}] ${f.name}`);
        console.log(c.red(`      ${f.error}`));
      });
    }

    if (summary.unimplementedList.length > 0 && options.verbose) {
      console.log(c.bold(c.yellow(`\n  Components Pending Milestone Implementation (${summary.unimplementedList.length}):`)));
      summary.unimplementedList.slice(0, 10).forEach(u => console.log(`    - ${u}`));
      if (summary.unimplementedList.length > 10) {
        console.log(`    ... and ${summary.unimplementedList.length - 10} more`);
      }
    }

    console.log(c.bold(`==============================================================================\n`));
  }

  return summary;
}

// Direct CLI entrypoint
if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(`
Usage: node tests/e2e/run_all_v2.js [options]

Options:
  --tier, -t <1-4>       Execute only specified tier
  --filter, -f <pattern> Filter test names or IDs by regex
  --verbose, -v          Verbose output
  --bail, -b             Stop execution on first failure
  --json                 Emit summary as JSON
  --help, -h             Display help
      `);
      process.exit(0);
    }

    runSuite(options).then(summary => {
      // Exit with 1 only on actual unexpected failures; UNIMPLEMENTED is tracked progressively
      process.exit(summary.failed > 0 ? 1 : 0);
    }).catch(err => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}

module.exports = {
  parseArgs,
  runTest,
  runSuite
};
