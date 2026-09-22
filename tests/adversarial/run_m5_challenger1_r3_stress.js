#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Milestone 5 Round 3 Adversarial Stress & Verification Harness:
 * Complete CLI Invocation Matrix, Exit Code Strictness & Subcommand Stress
 *
 * Executed by: Milestone 5 Challenger 1 R3 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * Target Artifact: tests/adversarial/run_m5_challenger1_r3_stress.js
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const cli = require('../../src/cli/dispatcher');
const { EXIT_CODES, SUBCOMMANDS, SUBCOMMAND_OPTIONS, validateOptions } = cli;
const { validateProfileAgainstRules } = require('../../src/profiles/validator');
const dc1Profile = require('../../src/profiles/daylight-dc1.json');

const BIN_PATH = path.resolve(__dirname, '../../bin/ctc.js');
const CWD = path.resolve(__dirname, '../..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(testId, name, durationMs = 0) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS [${testId}] ${name} (${durationMs.toFixed(1)}ms)`);
}

function fail(testId, name, err, durationMs = 0) {
  totalTests++;
  failedTests++;
  failures.push({ testId, name, error: err.message, stack: err.stack });
  console.error(`  ✗ FAIL [${testId}] ${name} (${durationMs.toFixed(1)}ms)`);
  console.error(`    Error: ${err.message}`);
}

function runSync(testId, name, fn) {
  const start = performance.now();
  try {
    fn();
    pass(testId, name, performance.now() - start);
  } catch (err) {
    fail(testId, name, err, performance.now() - start);
  }
}

async function runAsync(testId, name, fn) {
  const start = performance.now();
  try {
    await fn();
    pass(testId, name, performance.now() - start);
  } catch (err) {
    fail(testId, name, err, performance.now() - start);
  }
}

function invokeBin(args = [], options = {}) {
  const res = spawnSync(BIN_PATH, args, {
    cwd: CWD,
    encoding: 'utf8',
    timeout: 30000,
    ...options
  });

  let parsedJson = null;
  const stdout = res.stdout ? res.stdout.trim() : '';
  const stderr = res.stderr ? res.stderr.trim() : '';

  try {
    if (stdout.startsWith('{') && stdout.endsWith('}')) {
      parsedJson = JSON.parse(stdout);
    } else if (stderr.startsWith('{') && stderr.endsWith('}')) {
      parsedJson = JSON.parse(stderr);
    }
  } catch (_) {}

  return {
    status: res.status,
    signal: res.signal,
    stdout,
    stderr,
    parsedJson,
    error: res.error
  };
}

function assertEnvelope(obj, context) {
  assert.ok(obj && typeof obj === 'object', `${context}: must be object`);
  assert.equal(typeof obj.success, 'boolean', `${context}: success must be boolean`);
  assert.ok(['PASS', 'FAIL', 'BLOCKED', 'ERROR'].includes(obj.status), `${context}: status must be valid, got "${obj.status}"`);
  assert.equal(typeof obj.command, 'string', `${context}: command must be string`);
  assert.ok(!isNaN(Date.parse(obj.timestamp)), `${context}: timestamp must be valid ISO date`);
  assert.ok(obj.data !== undefined, `${context}: data must exist`);
  assert.ok(Array.isArray(obj.defects), `${context}: defects must be array`);
  assert.equal(typeof obj.exitCode, 'number', `${context}: exitCode must be number`);
  assert.ok(obj.error === null || typeof obj.error === 'string', `${context}: error must be string or null`);
}

async function main() {
  console.log('==============================================================================');
  console.log('  MILESTONE 5 R3 ADVERSARIAL CHALLENGER SUITE: EMPIRICAL VERIFICATION');
  console.log('==============================================================================\n');

  const tmpBase = `/tmp/ctc_m5_r3_chal1_${Date.now()}`;
  fs.mkdirSync(tmpBase, { recursive: true });

  // --------------------------------------------------------------------------
  // PART 1: Subcommand Matrix & Exit Code Contract Verification
  // --------------------------------------------------------------------------
  console.log('─── Part 1: Subcommand Matrix & Exit Code Contract Verification ───');

  // Doctor: exit 0 on success, exit 3 on invalid flag
  await runAsync('M5-R3-01', 'ctc doctor returns PASS (0) and conforms to JSON envelope', async () => {
    const res = await cli.dispatch(['doctor', '--json']);
    assertEnvelope(res, 'doctor');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
    assert.equal(res.success, true);
  });

  runSync('M5-R3-02', 'ctc doctor with invalid flag returns USAGE_ERROR (3)', () => {
    const res = cli.dispatch(['doctor', '--non-existent-doctor-flag', '--json']);
    assertEnvelope(res, 'doctor invalid flag');
    assert.equal(res.status, 'FAIL');
    assert.equal(res.exitCode, 3);
    assert.equal(res.success, false);
    assert.ok(res.error.includes('unrecognized option'));
  });

  // Init: exit 0 on success, exit 3 on invalid flag
  await runAsync('M5-R3-03', 'ctc init <dir> returns PASS (0)', async () => {
    const wsDir = path.join(tmpBase, 'init_r3');
    const res = await cli.dispatch(['init', wsDir, '--json']);
    assertEnvelope(res, 'init');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
    assert.ok(fs.existsSync(path.join(wsDir, '.ctc', 'config.json')));
  });

  runSync('M5-R3-04', 'ctc init with invalid flag returns USAGE_ERROR (3)', () => {
    const res = cli.dispatch(['init', '--bogus-flag-init', '--json']);
    assertEnvelope(res, 'init invalid flag');
    assert.equal(res.exitCode, 3);
    assert.equal(res.status, 'FAIL');
  });

  // Baseline: exit 0 on success, exit 3 on invalid flag
  await runAsync('M5-R3-05', 'ctc baseline against fixtures/note-app returns PASS (0)', async () => {
    const res = await cli.dispatch(['baseline', 'fixtures/note-app', '--json']);
    assertEnvelope(res, 'baseline');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  runSync('M5-R3-06', 'ctc baseline with invalid flag returns USAGE_ERROR (3)', () => {
    const res = cli.dispatch(['baseline', 'fixtures/note-app', '--bad-baseline-flag', '--json']);
    assertEnvelope(res, 'baseline invalid flag');
    assert.equal(res.exitCode, 3);
  });

  // Inspect-app: exit 0 on success, exit 3 on invalid flag
  await runAsync('M5-R3-07', 'ctc inspect-app against fixtures/note-app returns PASS (0)', async () => {
    const res = await cli.dispatch(['inspect-app', 'fixtures/note-app', '--json']);
    assertEnvelope(res, 'inspect-app');
    assert.equal(res.exitCode, 0);
  });

  runSync('M5-R3-08', 'ctc inspect-app with invalid flag returns USAGE_ERROR (3)', () => {
    const res = cli.dispatch(['inspect-app', 'fixtures/note-app', '--invalid-inspect-flag', '--json']);
    assertEnvelope(res, 'inspect-app invalid flag');
    assert.equal(res.exitCode, 3);
  });

  // Contract build & validate: exit code verification
  runSync('M5-R3-09', 'ctc contract build with missing screen returns FAIL (1)', () => {
    const res = cli.dispatch(['contract', 'build', '--json']);
    assertEnvelope(res, 'contract build missing screen');
    assert.equal(res.exitCode, 1);
    assert.equal(res.status, 'FAIL');
    assert.ok(res.error.includes('Screen ID required'));
  });

  runSync('M5-R3-10', 'ctc contract validate with missing file returns FAIL (1)', () => {
    const res = cli.dispatch(['contract', 'validate', '--json']);
    assertEnvelope(res, 'contract validate missing file');
    assert.equal(res.exitCode, 1);
    assert.equal(res.status, 'FAIL');
    assert.ok(res.error.includes('Contract file required'));
  });

  // Map & Plan
  runSync('M5-R3-11', 'ctc map with missing args returns FAIL (1)', () => {
    const res = cli.dispatch(['map', '--json']);
    assertEnvelope(res, 'map missing args');
    assert.equal(res.exitCode, 1);
    assert.equal(res.status, 'FAIL');
  });

  runSync('M5-R3-12', 'ctc plan with missing args returns FAIL (1)', () => {
    const res = cli.dispatch(['plan', '--json']);
    assertEnvelope(res, 'plan missing args');
    assert.equal(res.exitCode, 1);
    assert.equal(res.status, 'FAIL');
  });

  // Agent packet: BLOCKED (2) on missing prerequisite plan
  runSync('M5-R3-13', 'ctc agent packet missing plan returns BLOCKED (2)', () => {
    const res = cli.dispatch(['agent', 'packet', 'nonexistent_test_screen', '--json']);
    assertEnvelope(res, 'agent packet missing plan');
    assert.equal(res.exitCode, 2);
    assert.equal(res.status, 'BLOCKED');
    assert.equal(res.success, false);
    assert.match(res.error, /ctc plan/i);
  });

  // Verify: BLOCKED (2) on missing evidence
  await runAsync('M5-R3-14', 'ctc verify missing screen returns BLOCKED (2)', async () => {
    const res = await cli.dispatch(['verify', 'nonexistent_screen_xyz', '--json']);
    assertEnvelope(res, 'verify missing screen');
    assert.equal(res.exitCode, 2);
    assert.equal(res.status, 'BLOCKED');
    assert.equal(res.success, false);
    assert.equal(res.data.outcome, 'BLOCKED');
  });

  // Defects & Profile Export
  await runAsync('M5-R3-15', 'ctc defects returns PASS (0)', async () => {
    const res = await cli.dispatch(['defects', '--json']);
    assertEnvelope(res, 'defects');
    assert.equal(res.exitCode, 0);
    assert.equal(res.status, 'PASS');
  });

  runSync('M5-R3-16', 'ctc profile export daylight-dc1 returns PASS (0)', () => {
    const outProfile = path.join(tmpBase, 'dc1_export.json');
    const res = cli.dispatch(['profile', 'export', 'daylight-dc1', '--output', outProfile, '--json']);
    assertEnvelope(res, 'profile export');
    assert.equal(res.exitCode, 0);
    assert.equal(res.status, 'PASS');
    assert.ok(fs.existsSync(outProfile));
  });

  runSync('M5-R3-17', 'ctc profile with unknown subaction returns FAIL (1)', () => {
    const res = cli.dispatch(['profile', 'bogus-action', '--json']);
    assertEnvelope(res, 'profile unknown subaction');
    assert.equal(res.exitCode, 1);
    assert.equal(res.status, 'FAIL');
    assert.ok(res.error.includes('Unknown profile action'));
  });

  // --------------------------------------------------------------------------
  // PART 2: Process Invocation & Pipeability (stdout / exit code integrity)
  // --------------------------------------------------------------------------
  console.log('\n─── Part 2: Process Invocation & Pipeability ───');

  runSync('M5-R3-18', 'bin/ctc.js outputs parseable JSON to stdout for verify BLOCKED (exit 2)', () => {
    const res = invokeBin(['verify', 'nonexistent_screen_xyz', '--json']);
    assert.equal(res.status, 2);
    assert.ok(res.stdout.length > 0, 'stdout must receive JSON output');
    assert.ok(res.parsedJson, 'stdout must be valid JSON');
    assert.equal(res.parsedJson.exitCode, 2);
    assert.equal(res.parsedJson.status, 'BLOCKED');
  });

  runSync('M5-R3-19', 'bin/ctc.js outputs parseable JSON to stdout for agent packet BLOCKED (exit 2)', () => {
    const res = invokeBin(['agent', 'packet', 'nonexistent_screen_xyz', '--json']);
    assert.equal(res.status, 2);
    assert.ok(res.stdout.length > 0, 'stdout must receive JSON output');
    assert.ok(res.parsedJson, 'stdout must be valid JSON');
    assert.equal(res.parsedJson.exitCode, 2);
    assert.equal(res.parsedJson.status, 'BLOCKED');
  });

  runSync('M5-R3-20', 'bin/ctc.js outputs parseable JSON to stdout for doctor USAGE_ERROR (exit 3)', () => {
    const res = invokeBin(['doctor', '--unknown-option-pipe-test', '--json']);
    assert.equal(res.status, 3);
    assert.ok(res.stdout.length > 0, 'stdout must receive JSON output');
    assert.ok(res.parsedJson, 'stdout must be valid JSON');
    assert.equal(res.parsedJson.exitCode, 3);
    assert.equal(res.parsedJson.status, 'FAIL');
  });

  runSync('M5-R3-21', 'bin/ctc.js outputs parseable JSON to stdout for contract build missing args (exit 1)', () => {
    const res = invokeBin(['contract', 'build', '--json']);
    assert.equal(res.status, 1);
    assert.ok(res.stdout.length > 0, 'stdout must receive JSON output');
    assert.ok(res.parsedJson, 'stdout must be valid JSON');
    assert.equal(res.parsedJson.exitCode, 1);
    assert.equal(res.parsedJson.status, 'FAIL');
  });

  runSync('M5-R3-22', 'bin/ctc.js --help exits with 0 and prints usage help', () => {
    const res = invokeBin(['--help']);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('Usage: ctc'));
    assert.ok(res.stdout.includes('13 subcommands'));
  });

  runSync('M5-R3-23', 'bin/ctc.js --version exits with 0 and prints version', () => {
    const res = invokeBin(['--version']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /^ctc v\d+\.\d+\.\d+/);
  });

  // --------------------------------------------------------------------------
  // PART 3: Profile Validator Hardening (Worker M5 R3 Remediation Checks)
  // --------------------------------------------------------------------------
  console.log('\n─── Part 3: Profile Validator Hardening (Worker M5 R3 Remediation Checks) ───');

  runSync('M5-R3-24', 'Validator deterministically rejects epdFlashOnModalDismissal: true in display', () => {
    const p = JSON.parse(JSON.stringify(dc1Profile));
    p.display.epdFlashOnModalDismissal = true;
    const res = validateProfileAgainstRules(p);
    assert.equal(res.valid, false);
    assert.ok(res.issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays'));
  });

  runSync('M5-R3-25', 'Validator deterministically rejects epdFlashOnModalDismissal: true in rules', () => {
    const p = JSON.parse(JSON.stringify(dc1Profile));
    p.rules = p.rules || {};
    p.rules.epdFlashOnModalDismissal = true;
    const res = validateProfileAgainstRules(p);
    assert.equal(res.valid, false);
    assert.ok(res.issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays'));
  });

  runSync('M5-R3-26', 'Validator deterministically rejects non-boolean or truthy epdFlashOnModalDismissal', () => {
    const p = JSON.parse(JSON.stringify(dc1Profile));
    p.display.epdFlashOnModalDismissal = 'always';
    const res = validateProfileAgainstRules(p);
    assert.equal(res.valid, false);
    assert.ok(res.issues.includes('epdFlashOnModalDismissal is forbidden on LivePaper displays'));
  });

  runSync('M5-R3-27', 'Validator rejects negative or zero widthMm', () => {
    const p1 = JSON.parse(JSON.stringify(dc1Profile));
    p1.display.widthMm = -50;
    const res1 = validateProfileAgainstRules(p1);
    assert.equal(res1.valid, false);
    assert.ok(res1.issues.includes('Invalid widthMm. Must be a positive number'));

    const p2 = JSON.parse(JSON.stringify(dc1Profile));
    p2.display.widthMm = 0;
    const res2 = validateProfileAgainstRules(p2);
    assert.equal(res2.valid, false);
    assert.ok(res2.issues.includes('Invalid widthMm. Must be a positive number'));
  });

  runSync('M5-R3-28', 'Validator rejects negative or zero heightMm', () => {
    const p1 = JSON.parse(JSON.stringify(dc1Profile));
    p1.display.heightMm = -80;
    const res1 = validateProfileAgainstRules(p1);
    assert.equal(res1.valid, false);
    assert.ok(res1.issues.includes('Invalid heightMm. Must be a positive number'));

    const p2 = JSON.parse(JSON.stringify(dc1Profile));
    p2.display.heightMm = 0;
    const res2 = validateProfileAgainstRules(p2);
    assert.equal(res2.valid, false);
    assert.ok(res2.issues.includes('Invalid heightMm. Must be a positive number'));
  });

  runSync('M5-R3-29', 'Validator rejects maxModalDismissPauseMs > 0', () => {
    const p1 = JSON.parse(JSON.stringify(dc1Profile));
    p1.display.maxModalDismissPauseMs = 150;
    const res1 = validateProfileAgainstRules(p1);
    assert.equal(res1.valid, false);
    assert.ok(res1.issues.includes('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)'));

    const p2 = JSON.parse(JSON.stringify(dc1Profile));
    p2.rules = p2.rules || {};
    p2.rules.maxModalDismissPauseMs = 200;
    const res2 = validateProfileAgainstRules(p2);
    assert.equal(res2.valid, false);
    assert.ok(res2.issues.includes('maxModalDismissPauseMs must be 0 (no artificial pauses on modal dismissal)'));
  });

  runSync('M5-R3-30', 'Canonical daylight-dc1.json validates cleanly with zero issues', () => {
    const res = validateProfileAgainstRules(dc1Profile);
    assert.equal(res.valid, true);
    assert.equal(res.issues.length, 0);
  });

  // --------------------------------------------------------------------------
  // PART 4: Codebase Hygiene & Zero Hardcoded Fixture Test Check
  // --------------------------------------------------------------------------
  console.log('\n─── Part 4: Codebase Hygiene & Zero Test Fixture Hardcoding ───');

  runSync('M5-R3-31', 'No test fixture string prefixes (arg-) in src/ and bin/', () => {
    const checkDir = (dir) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) {
          checkDir(full);
        } else if (f.name.endsWith('.js') || f.name.endsWith('.json')) {
          const content = fs.readFileSync(full, 'utf8');
          assert.ok(
            !content.includes('arg-'),
            `File ${full} must not contain test fixture string "arg-"`
          );
        }
      }
    };
    checkDir(path.resolve(CWD, 'src'));
    checkDir(path.resolve(CWD, 'bin'));
  });

  // Clean up
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (_) {}

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`  CHALLENGER 1 R3 SUITE SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('==============================================================================\n');

  if (failures.length > 0) {
    console.error('FAILURES ENCOUNTERED:');
    failures.forEach((f) => {
      console.error(`- [${f.testId}] ${f.name}`);
      console.error(`  ${f.error}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in challenger 1 r3 suite:', err);
  process.exit(1);
});
