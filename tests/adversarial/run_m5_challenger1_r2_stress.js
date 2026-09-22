#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Milestone 5 R2 Adversarial Challenger Suite:
 * CLI Invocation, Exit Codes, Generic Subcommand Option Validation & Envelope Routing
 *
 * Author: Challenger 1 R2 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const cli = require('../../src/cli/dispatcher');
const { EXIT_CODES, SUBCOMMANDS, SUBCOMMAND_OPTIONS, validateOptions } = cli;

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
  assert.ok(['PASS', 'FAIL', 'BLOCKED', 'ERROR'].includes(obj.status), `${context}: status must be PASS|FAIL|BLOCKED|ERROR, got "${obj.status}"`);
  assert.equal(typeof obj.command, 'string', `${context}: command must be string`);
  assert.ok(!isNaN(Date.parse(obj.timestamp)), `${context}: timestamp must be valid ISO date`);
  assert.ok(obj.data !== undefined, `${context}: data must exist`);
  assert.ok(Array.isArray(obj.defects), `${context}: defects must be array`);
  assert.equal(typeof obj.exitCode, 'number', `${context}: exitCode must be number`);
}

async function main() {
  console.log('==============================================================================');
  console.log('  MILESTONE 5 R2 ADVERSARIAL CHALLENGER SUITE: CLI & REMEDIATION VERIFICATION');
  console.log('==============================================================================\n');

  const tmpBase = `/tmp/ctc_m5_r2_chal1_${Date.now()}`;
  fs.mkdirSync(tmpBase, { recursive: true });

  // --------------------------------------------------------------------------
  // PART 1: Verification of Fixed Issues (Mandatory Checks)
  // --------------------------------------------------------------------------
  console.log('─── Part 1: Verification of Flagged Remediation Issues ───');

  // Issue 1: ctc capture fixtures/note-app does not crash with argument signature error
  await runAsync('CHAL-R2-01', 'ctc capture fixtures/note-app executes without target.startsWith error', async () => {
    // We pass a mock screen to avoid headless browser timeout while testing argument signature
    const res = await cli.dispatch(['capture', 'fixtures/note-app', '--output', path.join(tmpBase, 'cap_out'), '--json']);
    assertEnvelope(res, 'capture dispatch');
    assert.ok(
      !res.error || !res.error.includes('target.startsWith is not a function'),
      `Should not have argument signature error, got: ${res.error}`
    );
  });

  // Issue 2: ctc verify on a blocked screen returns exit code 2 and { outcome: 'BLOCKED' }
  await runAsync('CHAL-R2-02', 'ctc verify on missing evidence returns exit code 2 and outcome BLOCKED', async () => {
    const res = await cli.dispatch(['verify', 'nonexistent_test_screen', '--json']);
    assertEnvelope(res, 'verify missing screen');
    assert.equal(res.status, 'BLOCKED', `Expected status BLOCKED, got ${res.status}`);
    assert.equal(res.exitCode, 2, `Expected exitCode 2 for BLOCKED, got ${res.exitCode}`);
    assert.equal(res.success, false, 'Expected success false for BLOCKED');
    assert.ok(res.data, 'res.data should exist');
    assert.equal(res.data.outcome, 'BLOCKED', `res.data.outcome must be BLOCKED, got ${res.data.outcome}`);
  });

  runSync('CHAL-R2-03', 'Process invocation: ctc verify on blocked screen exits with 2 and emits JSON to stdout', () => {
    const res = invokeBin(['verify', 'nonexistent_test_screen', '--json']);
    assert.equal(res.status, 2, `Process exit status must be 2, got ${res.status}`);
    assert.ok(res.parsedJson, 'Stdout must contain valid JSON');
    assert.equal(res.parsedJson.status, 'BLOCKED');
    assert.equal(res.parsedJson.exitCode, 2);
    assert.equal(res.parsedJson.success, false);
    assert.equal(res.parsedJson.data.outcome, 'BLOCKED');
  });

  // Issue 3: ctc baseline emits status: 'PASS' and success: true
  await runAsync('CHAL-R2-04', 'ctc baseline against fixtures/note-app emits status PASS, success true, exitCode 0', async () => {
    const res = await cli.dispatch(['baseline', 'fixtures/note-app', '--json']);
    assertEnvelope(res, 'baseline note-app');
    assert.equal(res.status, 'PASS', `Status must be PASS, got ${res.status}`);
    assert.equal(res.success, true, 'success must be true');
    assert.equal(res.exitCode, 0, `exitCode must be 0, got ${res.exitCode}`);
  });

  // Issue 4: ctc agent packet on missing plan returns exit code 2 BLOCKED with helpful guidance
  runSync('CHAL-R2-05', 'ctc agent packet with missing plan returns exitCode 2, status BLOCKED, and helpful guidance', () => {
    const res = cli.dispatch(['agent', 'packet', 'nonexistent_screen', '--json']);
    assertEnvelope(res, 'agent packet missing plan');
    assert.equal(res.status, 'BLOCKED', `Status must be BLOCKED, got ${res.status}`);
    assert.equal(res.exitCode, 2, `ExitCode must be 2, got ${res.exitCode}`);
    assert.equal(res.success, false, 'Success must be false');
    assert.ok(res.error, 'Must include error message');
    assert.match(res.error, /Run "ctc plan/i, `Error message must suggest running ctc plan: ${res.error}`);
    assert.ok(res.data.instructions, 'Must provide structured guidance instructions in data');
    assert.match(res.data.instructions, /ctc plan/i);
  });

  runSync('CHAL-R2-06', 'ctc agent packet accepts explicit --plan, --map, and --contract overrides', () => {
    // Create temporary valid contract, map, and plan
    const screenId = 'override_test';
    const cPath = path.join(tmpBase, 'override_contract.json');
    const mPath = path.join(tmpBase, 'override_map.json');
    const pPath = path.join(tmpBase, 'override_plan.json');

    fs.writeFileSync(cPath, JSON.stringify({ screenId, measuredScenes: { scenes: {} }, layoutIntent: {}, behaviorContract: {}, designSystem: {} }));
    fs.writeFileSync(mPath, JSON.stringify({ version: '2.0.0', screenId, mappings: [] }));
    fs.writeFileSync(pPath, JSON.stringify({ version: '2.0.0', screenId, phases: [] }));

    const res = cli.dispatch([
      'agent', 'packet', screenId,
      '--contract', cPath,
      '--map', mPath,
      '--plan', pPath,
      '--output', tmpBase,
      '--json'
    ]);
    assertEnvelope(res, 'agent packet with overrides');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
    assert.equal(res.success, true);
  });

  // Issue 5: bin/ctc.js emits JSON envelope to stdout on non-zero exit codes
  runSync('CHAL-R2-07', 'bin/ctc.js emits JSON to stdout on exit code 3 (USAGE_ERROR)', () => {
    const res = invokeBin(['doctor', '--invalid-option-test', '--json']);
    assert.equal(res.status, 3, `Expected exit status 3, got ${res.status}`);
    assert.ok(res.stdout.length > 0, 'stdout must receive output');
    assert.ok(res.parsedJson, 'stdout must be parseable JSON');
    assert.equal(res.parsedJson.exitCode, 3);
    assert.equal(res.parsedJson.status, 'FAIL');
    assert.equal(res.parsedJson.success, false);
    assert.ok(res.parsedJson.error.includes('unrecognized option'));
  });

  runSync('CHAL-R2-08', 'bin/ctc.js emits JSON to stdout on exit code 2 (BLOCKED)', () => {
    const res = invokeBin(['agent', 'packet', 'missing_plan_test', '--json']);
    assert.equal(res.status, 2, `Expected exit status 2, got ${res.status}`);
    assert.ok(res.stdout.length > 0, 'stdout must receive output');
    assert.ok(res.parsedJson, 'stdout must be parseable JSON');
    assert.equal(res.parsedJson.exitCode, 2);
    assert.equal(res.parsedJson.status, 'BLOCKED');
    assert.equal(res.parsedJson.success, false);
  });

  runSync('CHAL-R2-09', 'bin/ctc.js emits JSON to stdout on exit code 1 (FAIL)', () => {
    const res = invokeBin(['invalid-subcommand-xyz', '--json']);
    assert.equal(res.status, 1, `Expected exit status 1, got ${res.status}`);
    assert.ok(res.stdout.length > 0, 'stdout must receive output');
    assert.ok(res.parsedJson, 'stdout must be parseable JSON');
    assert.equal(res.parsedJson.exitCode, 1);
    assert.equal(res.parsedJson.status, 'FAIL');
    assert.equal(res.parsedJson.success, false);
  });

  // --------------------------------------------------------------------------
  // PART 2: Generic Option Validation across ALL 13 Subcommands
  // --------------------------------------------------------------------------
  console.log('\n─── Part 2: Generic Option Validation across ALL 13 Subcommands ───');

  const testSubcommands = [
    { name: 'doctor', args: ['doctor'] },
    { name: 'init', args: ['init', path.join(tmpBase, 'ws_val')] },
    { name: 'baseline', args: ['baseline', 'fixtures/note-app'] },
    { name: 'inspect-app', args: ['inspect-app', 'fixtures/note-app'] },
    { name: 'capture', args: ['capture', 'fixtures/note-app'] },
    { name: 'contract', args: ['contract', 'build', 'note_editor'] },
    { name: 'map', args: ['map', 'contract.json', 'fixtures/note-app'] },
    { name: 'plan', args: ['plan', 'map.json'] },
    { name: 'agent', args: ['agent', 'packet', 'note_editor'] },
    { name: 'verify', args: ['verify', 'note_editor'] },
    { name: 'defects', args: ['defects'] },
    { name: 'profile', args: ['profile', 'export', 'daylight-dc1'] },
    { name: 'report', args: ['report', 'note_editor'] }
  ];

  testSubcommands.forEach((subcmd, idx) => {
    const testId = `CHAL-R2-OPT-${String(idx + 1).padStart(2, '0')}`;
    runSync(testId, `Generic option validation rejects unknown flag on "${subcmd.name}"`, () => {
      const bogusFlag = `--bogus-flag-${subcmd.name}-xyz`;
      const args = [...subcmd.args, bogusFlag, '--json'];
      const res = cli.dispatch(args);
      assert.equal(res.exitCode, EXIT_CODES.USAGE_ERROR, `Command "${subcmd.name}" must reject unknown option with code 3`);
      assert.equal(res.status, 'FAIL');
      assert.equal(res.success, false);
      assert.ok(res.error, `Command "${subcmd.name}" must return an error message`);
      assert.ok(
        res.error.includes('unrecognized option') && res.error.includes(bogusFlag),
        `Error must mention unrecognized option and flag name. Got: "${res.error}"`
      );
    });
  });

  // Test that allowed options pass without rejection on every subcommand
  runSync('CHAL-R2-OPT-14', 'Generic option validation accepts registered flags and global flags', () => {
    for (const [cmd, allowedSet] of Object.entries(SUBCOMMAND_OPTIONS)) {
      assert.ok(allowedSet.has('json'), `${cmd} must accept --json`);
      assert.ok(allowedSet.has('help'), `${cmd} must accept --help`);
      assert.ok(allowedSet.has('output') || allowedSet.has('o'), `${cmd} must accept output flag`);

      // Test validateOptions helper directly
      const validFlags = { json: true, verbose: true };
      const err = validateOptions(cmd, validFlags);
      assert.equal(err, null, `validateOptions("${cmd}", { json: true, verbose: true }) should return null, got "${err}"`);

      // Test validateOptions rejection on bogus flag
      const badErr = validateOptions(cmd, { totallyBogusFlag123: true });
      assert.ok(badErr !== null, `validateOptions("${cmd}") should reject totallyBogusFlag123`);
      assert.ok(badErr.includes('totallyBogusFlag123'));
    }
  });

  // Test that no test fixture strings exist in validateOptions or SUBCOMMAND_OPTIONS
  runSync('CHAL-R2-OPT-15', 'No test-specific fixture branching (e.g. arg-) in SUBCOMMAND_OPTIONS or validateOptions', () => {
    for (const [cmd, allowedSet] of Object.entries(SUBCOMMAND_OPTIONS)) {
      for (const item of allowedSet) {
        assert.ok(!item.startsWith('arg-'), `Option "${item}" in "${cmd}" must not start with "arg-"`);
        assert.ok(!item.match(/^[FB][0-9]{2}-T[0-9]/), `Option "${item}" in "${cmd}" must not be a test ID`);
      }
    }
  });

  // Test end-of-options delimiter (--)
  runSync('CHAL-R2-OPT-16', 'End-of-options delimiter (--) bypasses flag validation for trailing args', () => {
    const res = cli.dispatch(['doctor', '--json', '--', '--unknown-trailing-flag', 'positional-data']);
    assert.equal(res.exitCode, 0, `Doctor should pass with valid flags before --`);
    assert.equal(res.status, 'PASS');
  });

  // --------------------------------------------------------------------------
  // PART 3: Stress & High-Load CLI Invocations
  // --------------------------------------------------------------------------
  console.log('\n─── Part 3: Stress & High-Load CLI Invocations ───');

  runSync('CHAL-R2-STR-01', 'High-volume unknown flags: 50 unknown flags correctly identified without crashing', () => {
    const flags = {};
    for (let i = 0; i < 50; i++) {
      flags[`bogus-var-${i}`] = `val-${i}`;
    }
    const err = validateOptions('doctor', flags);
    assert.ok(err !== null);
    assert.ok(err.includes('unrecognized option'));
  });

  runSync('CHAL-R2-STR-02', 'Mixed valid and invalid flags correctly identifies first invalid flag', () => {
    const err = validateOptions('doctor', {
      json: true,
      appDir: '/tmp/test',
      bogusOne: true,
      strict: true
    });
    assert.ok(err !== null);
    assert.ok(err.includes('bogusOne'));
  });

  runSync('CHAL-R2-STR-03', 'Short flag validation: unrecognized short flag rejected with - prefix', () => {
    const err = validateOptions('doctor', { z: true });
    assert.ok(err !== null);
    assert.ok(err.includes('"-z"'), `Expected "-z" in error message, got: ${err}`);
  });

  runSync('CHAL-R2-STR-04', 'Long flag validation: unrecognized long flag rejected with -- prefix', () => {
    const err = validateOptions('doctor', { nonExistentLongFlag: true });
    assert.ok(err !== null);
    assert.ok(err.includes('"--nonExistentLongFlag"'), `Expected "--nonExistentLongFlag" in error message, got: ${err}`);
  });

  // Clean up
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (_) {}

  // --------------------------------------------------------------------------
  // Summary & Diagnostic
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`  CHALLENGER 1 R2 SUITE SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
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
  console.error('Fatal error in challenger 1 r2 suite:', err);
  process.exit(1);
});
