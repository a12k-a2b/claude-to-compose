#!/usr/bin/env node

/**
 * ============================================================================
 * claude-to-compose: Opaque-Box E2E Test Runner
 * ============================================================================
 * Supports running all tiers or individual tiers:
 *   node tests/e2e_runner.js [--tier <1-4>] [--filter <regex>] [--verbose]
 *
 * Progressively testable: executes gracefully and flags unimplemented components
 * without crashing the runner process.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');
const assert = require('node:assert');

// ANSI Color formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
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

// Custom UnimplementedError class for progressive testability
class UnimplementedError extends Error {
  constructor(component, milestone, reason) {
    super(`Unimplemented component: "${component}" (Milestone: ${milestone || 'Pending'})${reason ? ' - ' + reason : ''}`);
    this.name = 'UnimplementedError';
    this.component = component;
    this.milestone = milestone;
    this.reason = reason;
  }
}

class SkipTestError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipTestError';
    this.reason = reason;
  }
}

// Project directories
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// Parse CLI arguments
function parseArgs(customArgs) {
  const args = customArgs || process.argv.slice(2);
  const options = {
    tier: null,
    filter: null,
    verbose: false,
    help: false
  };

  function validateTier(val) {
    const parsed = parseInt(val, 10);
    if (![1, 2, 3, 4].includes(parsed) || String(parsed) !== String(val).trim()) {
      console.error(`Error: Invalid tier "${val}". Valid tiers are 1, 2, 3, 4.`);
      process.exit(2);
    }
    return parsed;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--tier' || arg === '-t') {
      const val = args[++i];
      options.tier = validateTier(val);
    } else if (arg.startsWith('--tier=')) {
      const val = arg.slice(arg.indexOf('=') + 1);
      options.tier = validateTier(val);
    } else if (arg.startsWith('-t=')) {
      const val = arg.slice(arg.indexOf('=') + 1);
      options.tier = validateTier(val);
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = new RegExp(args[++i], 'i');
    } else if (arg.startsWith('--filter=')) {
      options.filter = new RegExp(arg.slice(arg.indexOf('=') + 1), 'i');
    }
  }

  return options;
}

const parseArguments = parseArgs;

// Test Context passed to each test function
function createTestContext(testId, testName) {
  return {
    testId,
    testName,
    projectRoot: PROJECT_ROOT,
    fixturesDir: FIXTURES_DIR,

    // Standard assertion helpers
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

    // Progressive testability helpers
    checkFileExists(relPath, requiredMilestone, detail) {
      const fullPath = path.resolve(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new UnimplementedError(relPath, requiredMilestone, detail || `File not found on disk: ${relPath}`);
      }
      return fullPath;
    },

    unimplemented(component, milestone, reason) {
      throw new UnimplementedError(component, milestone, reason);
    },

    skip(reason) {
      throw new SkipTestError(reason);
    },

    readFile(relPath) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File does not exist: ${fullPath}`);
      }
      return fs.readFileSync(fullPath, 'utf8');
    },

    readJson(relPath) {
      const content = this.readFile(relPath);
      return JSON.parse(content);
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

// Discover test files for a given tier
function discoverTestFiles(tier) {
  const tierDirs = {
    1: path.resolve(__dirname, 'tier1_features'),
    2: path.resolve(__dirname, 'tier2_boundaries'),
    3: path.resolve(__dirname, 'tier3_combinations'),
    4: path.resolve(__dirname, 'tier4_real_world')
  };

  const targetDir = tierDirs[tier];
  if (!targetDir || typeof targetDir !== 'string' || !fs.existsSync(targetDir)) {
    return [];
  }

  const files = fs.readdirSync(targetDir)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => path.join(targetDir, f));

  return files;
}

// Run a single test
async function runSingleTest(testObj, suite) {
  const ctx = createTestContext(testObj.id, testObj.name);
  const start = performance.now();

  try {
    await testObj.run(ctx);
    const duration = performance.now() - start;
    return {
      id: testObj.id,
      name: testObj.name,
      suiteName: suite.name,
      tier: suite.tier,
      feature: suite.feature,
      status: 'PASS',
      duration
    };
  } catch (err) {
    const duration = performance.now() - start;
    if (err instanceof UnimplementedError) {
      return {
        id: testObj.id,
        name: testObj.name,
        suiteName: suite.name,
        tier: suite.tier,
        feature: suite.feature,
        status: 'UNIMPLEMENTED',
        error: err,
        duration
      };
    } else if (err instanceof SkipTestError) {
      return {
        id: testObj.id,
        name: testObj.name,
        suiteName: suite.name,
        tier: suite.tier,
        feature: suite.feature,
        status: 'SKIP',
        reason: err.reason,
        duration
      };
    } else {
      return {
        id: testObj.id,
        name: testObj.name,
        suiteName: suite.name,
        tier: suite.tier,
        feature: suite.feature,
        status: 'FAIL',
        error: err,
        duration
      };
    }
  }
}

// Main Runner Function
async function main() {
  const options = parseArguments();

  if (options.help) {
    console.log(`
${c.bold('claude-to-compose Opaque-Box E2E Test Runner')}

Usage:
  node tests/e2e_runner.js [options]

Options:
  --tier, -t <1-4>      Run only tests for specified tier (1: Features, 2: Boundaries, 3: Combinations, 4: Real-World)
  --filter, -f <regex>  Filter tests by suite or test ID / name
  --verbose, -v         Display detailed logs and diagnostics
  --help, -h            Show this help screen
`);
    process.exit(0);
  }

  const selectedTiers = options.tier !== null ? [options.tier] : [1, 2, 3, 4];

  console.log(c.bold('\n' + '='.repeat(80)));
  console.log(c.bold('  CLAUDE-TO-COMPOSE: OPAQUE-BOX E2E TEST RUNNER'));
  console.log(c.gray(`  Timestamp: ${new Date().toISOString()}`));
  console.log(c.cyan(`  Active Tiers: ${selectedTiers.map(t => 'Tier ' + t).join(', ')}`));
  console.log(c.bold('='.repeat(80)) + '\n');

  const overallStart = performance.now();
  const tierResults = {
    1: { name: 'Tier 1: Features', total: 0, passed: 0, failed: 0, unimplemented: 0, skipped: 0, duration: 0, tests: [] },
    2: { name: 'Tier 2: Boundaries', total: 0, passed: 0, failed: 0, unimplemented: 0, skipped: 0, duration: 0, tests: [] },
    3: { name: 'Tier 3: Combinations', total: 0, passed: 0, failed: 0, unimplemented: 0, skipped: 0, duration: 0, tests: [] },
    4: { name: 'Tier 4: Real-World Scenarios', total: 0, passed: 0, failed: 0, unimplemented: 0, skipped: 0, duration: 0, tests: [] }
  };

  const allFailures = [];
  const allUnimplemented = [];

  for (const tier of selectedTiers) {
    const tierStart = performance.now();
    const testFiles = discoverTestFiles(tier);
    const tierMeta = tierResults[tier] || { name: `Tier ${tier}` };

    console.log(c.bold(`─── ${tierMeta.name} (${testFiles.length} suites) ───`));

    for (const file of testFiles) {
      let suite;
      try {
        suite = require(file);
      } catch (requireErr) {
        const suiteBase = path.basename(file);
        console.log(`  ${c.red('✗')} Failed to load suite file: ${suiteBase}: ${requireErr.message}`);
        const failure = {
          id: `LOAD_FAIL_${suiteBase}`,
          name: `Failed to load suite file: ${suiteBase}`,
          suiteName: suiteBase,
          tier,
          status: 'FAIL',
          error: requireErr,
          duration: 0
        };
        if (tierResults[tier]) {
          tierResults[tier].total++;
          tierResults[tier].failed++;
          tierResults[tier].tests.push(failure);
        }
        allFailures.push(failure);
        continue;
      }

      if (!suite || !Array.isArray(suite.tests)) {
        const suiteBase = path.basename(file);
        console.log(`  ${c.red('✗')} Invalid suite file structure (missing tests array): ${suiteBase}`);
        const failure = {
          id: `INVALID_SUITE_${suiteBase}`,
          name: `Invalid suite file structure (missing tests array): ${suiteBase}`,
          suiteName: suiteBase,
          tier,
          status: 'FAIL',
          error: new Error(`Suite file "${suiteBase}" does not export a tests array`),
          duration: 0
        };
        if (tierResults[tier]) {
          tierResults[tier].total++;
          tierResults[tier].failed++;
          tierResults[tier].tests.push(failure);
        }
        allFailures.push(failure);
        continue;
      }

      // Filter tests if requested
      const testsToRun = suite.tests.filter(t => {
        if (!options.filter) return true;
        return options.filter.test(suite.name) || options.filter.test(t.id) || options.filter.test(t.name);
      });

      if (testsToRun.length === 0) continue;

      console.log(`  ${c.cyan('▶')} ${c.bold(suite.name)} ${c.gray(`[${suite.feature || 'Tier ' + tier}]`)} (${testsToRun.length} tests)`);

      for (const testObj of testsToRun) {
        const result = await runSingleTest(testObj, suite);
        tierResults[tier].total++;
        tierResults[tier].tests.push(result);

        if (result.status === 'PASS') {
          tierResults[tier].passed++;
          console.log(`    ${c.green('✓')} ${c.gray(result.id)}: ${result.name} ${c.gray(`(${result.duration.toFixed(1)}ms)`)}`);
        } else if (result.status === 'UNIMPLEMENTED') {
          tierResults[tier].unimplemented++;
          allUnimplemented.push(result);
          console.log(`    ${c.yellow('○')} ${c.gray(result.id)}: ${result.name} ${c.yellow('[UNIMPLEMENTED: ' + result.error.milestone + ']')}`);
        } else if (result.status === 'SKIP') {
          tierResults[tier].skipped++;
          console.log(`    ${c.gray('–')} ${c.gray(result.id)}: ${result.name} ${c.gray('[SKIPPED: ' + result.reason + ']')}`);
        } else {
          tierResults[tier].failed++;
          allFailures.push(result);
          console.log(`    ${c.red('✗')} ${c.gray(result.id)}: ${result.name} ${c.red('[FAILED]')}`);
          if (options.verbose && result.error) {
            console.log(c.gray('      ' + (result.error.stack || result.error.message).split('\n').join('\n      ')));
          }
        }
      }
    }

    tierResults[tier].duration = performance.now() - tierStart;
    console.log();
  }

  const grandDuration = performance.now() - overallStart;

  // Print Unimplemented Details if any
  if (allUnimplemented.length > 0 && options.verbose) {
    console.log(c.bold('\n' + '─'.repeat(80)));
    console.log(c.yellow(c.bold('UNIMPLEMENTED COMPONENTS SUMMARY:')));
    console.log(c.bold('─'.repeat(80)));
    for (const item of allUnimplemented) {
      console.log(`  ${c.yellow('•')} ${c.bold(item.id)}: ${item.name}`);
      console.log(`    Component: ${c.cyan(item.error.component)} | Required Milestone: ${c.bold(item.error.milestone)}`);
      if (item.error.reason) console.log(`    Detail: ${c.gray(item.error.reason)}`);
    }
  }

  // Print Failure Details if any
  if (allFailures.length > 0) {
    console.log(c.bold('\n' + '─'.repeat(80)));
    console.log(c.red(c.bold('FAILURES & ASSERTION DEFECTS:')));
    console.log(c.bold('─'.repeat(80)));
    for (const failure of allFailures) {
      console.log(`\n  ${c.red('●')} ${c.bold(failure.id)}: ${failure.name} ${c.gray('(' + failure.suiteName + ')')}`);
      if (failure.error) {
        console.log(`    ${c.red(failure.error.name + ':')} ${failure.error.message}`);
        if (failure.error.stack) {
          const cleanStack = failure.error.stack.split('\n').slice(1, 4).map(l => '    ' + l.trim()).join('\n');
          console.log(c.gray(cleanStack));
        }
      }
    }
  }

  // Print Summary Table
  console.log(c.bold('\n' + '='.repeat(80)));
  console.log(c.bold('  E2E TEST RUNNER SUMMARY'));
  console.log(c.bold('='.repeat(80)));

  const pad = (str, len) => String(str).padEnd(len);
  const padNum = (num, len) => String(num).padStart(len);

  console.log(
    c.bold(pad('  Tier Name', 32)) +
    c.bold(padNum('Total', 8)) +
    c.bold(padNum('Pass', 8)) +
    c.bold(padNum('Unimpl', 8)) +
    c.bold(padNum('Fail', 8)) +
    c.bold(padNum('Skip', 8)) +
    c.bold(padNum('Time', 10))
  );
  console.log('  ' + '─'.repeat(78));

  let grandTotal = 0;
  let grandPassed = 0;
  let grandUnimplemented = 0;
  let grandFailed = 0;
  let grandSkipped = 0;

  for (const tier of selectedTiers) {
    const tr = tierResults[tier];
    if (!tr) continue;
    grandTotal += tr.total;
    grandPassed += tr.passed;
    grandUnimplemented += tr.unimplemented;
    grandFailed += tr.failed;
    grandSkipped += tr.skipped;

    console.log(
      '  ' + pad(tr.name, 30) +
      padNum(tr.total, 8) +
      c.green(padNum(tr.passed, 8)) +
      (tr.unimplemented > 0 ? c.yellow(padNum(tr.unimplemented, 8)) : padNum(tr.unimplemented, 8)) +
      (tr.failed > 0 ? c.red(padNum(tr.failed, 8)) : padNum(tr.failed, 8)) +
      padNum(tr.skipped, 8) +
      padNum((tr.duration / 1000).toFixed(2) + 's', 10)
    );
  }

  console.log('  ' + '─'.repeat(78));
  console.log(
    c.bold(pad('  GRAND TOTAL', 32)) +
    c.bold(padNum(grandTotal, 8)) +
    c.green(c.bold(padNum(grandPassed, 8))) +
    c.yellow(c.bold(padNum(grandUnimplemented, 8))) +
    (grandFailed > 0 ? c.red(c.bold(padNum(grandFailed, 8))) : padNum(grandFailed, 8)) +
    padNum(grandSkipped, 8) +
    c.bold(padNum((grandDuration / 1000).toFixed(2) + 's', 10))
  );
  console.log(c.bold('='.repeat(80)) + '\n');

  if (grandFailed > 0) {
    console.log(`  ${c.failBadge()} ${grandFailed} test(s) failed.`);
    process.exit(1);
  } else if (grandUnimplemented > 0) {
    console.log(`  ${c.unimplBadge()} ${grandPassed} passed, ${grandUnimplemented} flagged as unimplemented pending implementation milestones.`);
    process.exit(0);
  } else {
    console.log(`  ${c.passBadge()} All ${grandPassed} tests passed successfully!`);
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(c.red('Fatal Runner Exception:'), err);
    process.exit(1);
  });
}

module.exports = {
  createTestContext,
  UnimplementedError,
  SkipTestError,
  parseArgs,
  parseArguments,
  discoverTestFiles,
  main
};
