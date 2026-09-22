#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Milestone 5 Adversarial Stress & Verification Harness:
 * CLI Invocation, Exit Codes, Subcommand Stress & Envelope Compliance
 *
 * Executed by: Challenger 1 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * Target Artifact: tests/adversarial/run_m5_challenger1_stress.js
 *
 * SCOPE:
 * 1. Deep empirical stress testing of the CLI subsystem:
 *    - Process invocation (./bin/ctc.js <cmd>) and programmatic (cli.dispatch(args))
 *    - All 13 subcommands: doctor, init, baseline, inspect-app, capture,
 *      contract build, contract validate, map, plan, agent packet, verify,
 *      defects, profile export
 *    - Sync dispatch vs Async dispatch semantics
 *    - Malformed inputs, unknown flags, non-existent commands, invalid subcommands
 *    - --json envelope compliance ({ success, status, command, timestamp, data, defects, exitCode, error })
 *    - Exit code semantics: 0=PASS, 1=FAIL, 2=BLOCKED, 3=USAGE_ERROR / INFRASTRUCTURE_ERROR
 * 2. Causal Defect Probing & Isolation
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync, spawnSync } = require('node:child_process');

// Subsystems under test
const cli = require('../../src/cli/dispatcher');
const { EXIT_CODES, SUBCOMMANDS } = cli;

const BIN_PATH = path.resolve(__dirname, '../../bin/ctc.js');
const CWD = path.resolve(__dirname, '../..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function pass(name, durationMs = 0) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${name} (${durationMs.toFixed(1)}ms)`);
}

function fail(name, err, durationMs = 0) {
  totalTests++;
  failedTests++;
  console.error(`  ✗ FAIL: ${name} (${durationMs.toFixed(1)}ms)`);
  console.error(`    ${err.message}`);
}

function recordFinding(id, severity, summary, details) {
  findings.push({ id, severity, summary, details });
}

function runSync(name, fn) {
  const start = performance.now();
  try {
    fn();
    pass(name, performance.now() - start);
  } catch (err) {
    fail(name, err, performance.now() - start);
  }
}

async function runAsync(name, fn) {
  const start = performance.now();
  try {
    await fn();
    pass(name, performance.now() - start);
  } catch (err) {
    fail(name, err, performance.now() - start);
  }
}

/**
 * Helper to invoke ./bin/ctc.js via child process
 */
function invokeBin(args = [], options = {}) {
  const res = spawnSync(BIN_PATH, args, {
    cwd: CWD,
    encoding: 'utf8',
    timeout: 15000,
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

/**
 * Validates the standard --json envelope against interface specifications:
 * { success, status, command, timestamp, data, defects, exitCode, error }
 */
function assertEnvelopeCompliance(obj, contextName) {
  assert.ok(obj && typeof obj === 'object', `${contextName}: result must be a non-null object`);
  assert.equal(typeof obj.success, 'boolean', `${contextName}: 'success' must be a boolean`);
  assert.ok(typeof obj.status === 'string' && obj.status.length > 0, `${contextName}: 'status' must be a non-empty string`);
  assert.ok(['PASS', 'FAIL', 'BLOCKED', 'ERROR', 'READY_FOR_RETROFIT'].includes(obj.status), `${contextName}: 'status' "${obj.status}" must be recognized`);
  assert.equal(typeof obj.command, 'string', `${contextName}: 'command' must be a string`);
  assert.ok(typeof obj.timestamp === 'string' && !isNaN(Date.parse(obj.timestamp)), `${contextName}: 'timestamp' must be a valid ISO date string`);
  assert.ok(obj.data !== undefined, `${contextName}: 'data' property must be present`);
  assert.ok(Array.isArray(obj.defects), `${contextName}: 'defects' must be an array`);
  assert.equal(typeof obj.exitCode, 'number', `${contextName}: 'exitCode' must be a number`);
  assert.ok(obj.error === null || typeof obj.error === 'string', `${contextName}: 'error' must be string or null`);
}

async function main() {
  console.log('==============================================================================');
  console.log('  MILESTONE 5 ADVERSARIAL STRESS SUITE: CLI & SUBCOMMAND HARNESS');
  console.log('==============================================================================\n');

  const tmpBase = `/tmp/ctc_m5_challenger_${Date.now()}`;
  fs.mkdirSync(tmpBase, { recursive: true });

  // --------------------------------------------------------------------------
  // SUITE 1: Subcommand Enumeration & Catalog Invariants
  // --------------------------------------------------------------------------
  console.log('─── Suite 1: Subcommand Enumeration & Catalog Invariants ───');

  runSync('1.1: SUBCOMMANDS contains exactly 13 canonical subcommands', () => {
    assert.equal(SUBCOMMANDS.length, 13);
    const expected = [
      'doctor', 'init', 'baseline', 'inspect-app', 'capture',
      'contract build', 'contract validate', 'map', 'plan',
      'agent packet', 'verify', 'defects', 'profile export'
    ];
    for (const exp of expected) {
      assert.ok(SUBCOMMANDS.includes(exp), `SUBCOMMANDS must include "${exp}"`);
    }
  });

  runSync('1.2: EXIT_CODES defines semantic exit codes 0..3', () => {
    assert.equal(EXIT_CODES.PASS, 0);
    assert.equal(EXIT_CODES.FAIL, 1);
    assert.equal(EXIT_CODES.BLOCKED, 2);
    assert.equal(EXIT_CODES.INFRASTRUCTURE_ERROR, 3);
    assert.equal(EXIT_CODES.USAGE_ERROR, 3);
  });

  runSync('1.3: bin/ctc.js exists and has execute permissions', () => {
    assert.ok(fs.existsSync(BIN_PATH), 'bin/ctc.js must exist on disk');
    const stats = fs.statSync(BIN_PATH);
    const isExecutable = Boolean(stats.mode & 0o111);
    assert.ok(isExecutable, 'bin/ctc.js must have execute permission');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Process Invocation via bin/ctc.js across Subcommands
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 2: Direct Process Invocation via bin/ctc.js ───');

  runSync('2.1: Direct invocation without arguments prints usage help and exits with 0', () => {
    const res = invokeBin([]);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('Usage: ctc'));
    assert.ok(res.stdout.includes('13 subcommands'));
  });

  runSync('2.2: Direct invocation with --help prints usage help and exits with 0', () => {
    const res = invokeBin(['--help']);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('Usage: ctc'));
  });

  runSync('2.3: Direct invocation with -h prints usage help and exits with 0', () => {
    const res = invokeBin(['-h']);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('Usage: ctc'));
  });

  runSync('2.4: Direct invocation with --version prints semantic version and exits with 0', () => {
    const res = invokeBin(['--version']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /^ctc v\d+\.\d+\.\d+/);
  });

  runSync('2.5: Direct invocation: ctc doctor executes and passes', () => {
    const res = invokeBin(['doctor']);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('Daylight') || res.stdout.includes('doctor') || res.stdout.includes('PASS'));
  });

  runSync('2.6: Direct invocation: ctc doctor --json produces compliant envelope on stdout', () => {
    const res = invokeBin(['doctor', '--json']);
    assert.equal(res.status, 0);
    assert.ok(res.parsedJson, 'Output must parse as JSON');
    assertEnvelopeCompliance(res.parsedJson, 'ctc doctor --json');
    assert.equal(res.parsedJson.command, 'doctor');
    assert.equal(res.parsedJson.status, 'PASS');
    assert.equal(res.parsedJson.exitCode, 0);
  });

  runSync('2.7: Direct invocation: ctc init <dir> --json initializes workspace and returns 0', () => {
    const wsDir = path.join(tmpBase, 'proc_init');
    const res = invokeBin(['init', wsDir, '--json']);
    assert.equal(res.status, 0);
    assert.ok(res.parsedJson, 'Output must parse as JSON');
    assertEnvelopeCompliance(res.parsedJson, 'ctc init --json');
    assert.equal(res.parsedJson.command, 'init');
    assert.equal(res.parsedJson.status, 'PASS');
    assert.ok(fs.existsSync(path.join(wsDir, '.ctc', 'config.json')));
  });

  runSync('2.8: Direct invocation: ctc profile export daylight-dc1 --output <path> --json', () => {
    const outProfile = path.join(tmpBase, 'exported_dc1.json');
    const res = invokeBin(['profile', 'export', 'daylight-dc1', '--output', outProfile, '--json']);
    assert.equal(res.status, 0);
    assert.ok(res.parsedJson, 'Output must parse as JSON');
    assertEnvelopeCompliance(res.parsedJson, 'ctc profile export --json');
    assert.equal(res.parsedJson.command, 'profile export');
    assert.ok(fs.existsSync(outProfile));
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Programmatic Async Dispatch across all 13 Subcommands
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 3: Programmatic Async Dispatch across all 13 Subcommands ───');

  await runAsync('3.1: Subcommand [1/13] doctor: returns PASS (0)', async () => {
    const res = await cli.dispatch(['doctor', '--json']);
    assertEnvelopeCompliance(res, 'doctor');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.2: Subcommand [2/13] init: returns PASS (0)', async () => {
    const target = path.join(tmpBase, 'prog_init');
    const res = await cli.dispatch(['init', target, '--json']);
    assertEnvelopeCompliance(res, 'init');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.3: Subcommand [3/13] baseline: runs against fixtures/note-app', async () => {
    const res = await cli.dispatch(['baseline', 'fixtures/note-app', '--json']);
    assertEnvelopeCompliance(res, 'baseline');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.4: Subcommand [4/13] inspect-app: runs against fixtures/note-app', async () => {
    const res = await cli.dispatch(['inspect-app', 'fixtures/note-app', '--json']);
    assertEnvelopeCompliance(res, 'inspect-app');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.5: Subcommand [5/13] capture: probing argument invocation', async () => {
    const res = await cli.dispatch(['capture', 'fixtures/note-app', '--json']);
    assertEnvelopeCompliance(res, 'capture');
    if (res.error && res.error.includes('target.startsWith is not a function')) {
      recordFinding(
        'BUG-01-CAPTURE-SIGNATURE',
        'CRITICAL',
        'ctc capture crashes with TypeError: target.startsWith is not a function due to inverted argument call in src/cli/commands/capture.js:16',
        res.error
      );
    }
  });

  await runAsync('3.6: Subcommand [6/13] contract build: runs against note_editor', async () => {
    const res = await cli.dispatch(['contract', 'build', 'note_editor', '--json']);
    assertEnvelopeCompliance(res, 'contract build');
  });

  await runAsync('3.7: Subcommand [7/13] contract validate: validates schema conformance', async () => {
    // Generate valid sample contract file to validate
    const sampleContractPath = path.join(tmpBase, 'sample-contract.json');
    const sampleContract = {
      screenId: 'sample',
      measuredScenes: { scenes: {} },
      layoutIntent: { version: '2.0.0' },
      behaviorContract: { version: '2.0.0' },
      designSystem: { version: '2.0.0' }
    };
    fs.writeFileSync(sampleContractPath, JSON.stringify(sampleContract));
    const res = await cli.dispatch(['contract', 'validate', sampleContractPath, '--json']);
    assertEnvelopeCompliance(res, 'contract validate');
  });

  await runAsync('3.8: Subcommand [8/13] map: maps contract to app model', async () => {
    const sampleContractPath = path.join(tmpBase, 'sample-contract.json');
    const res = await cli.dispatch(['map', sampleContractPath, 'fixtures/note-app', '--json']);
    assertEnvelopeCompliance(res, 'map');
  });

  await runAsync('3.9: Subcommand [9/13] plan: generates migration plan from correspondence map', async () => {
    const sampleMapPath = path.join(tmpBase, 'sample-map.json');
    fs.writeFileSync(sampleMapPath, JSON.stringify({ version: '2.0.0', screenId: 'note_editor', mappings: [] }));
    const res = await cli.dispatch(['plan', sampleMapPath, '--json']);
    assertEnvelopeCompliance(res, 'plan');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.10: Subcommand [10/13] agent packet: generates scoped implementation packet', async () => {
    const res = await cli.dispatch(['agent', 'packet', 'note_editor', '--json']);
    assertEnvelopeCompliance(res, 'agent packet');
    if (res.error && res.error.includes('migrationPlan required')) {
      recordFinding(
        'BUG-02-AGENT-PACKET-MISSING-PLAN',
        'MAJOR',
        'ctc agent packet crashes when migration-plan.json is not on disk instead of reporting helpful prerequisite error',
        res.error
      );
    }
  });

  await runAsync('3.11: Subcommand [11/13] verify: runs stage 1 verification', async () => {
    const res = await cli.dispatch(['verify', 'note_editor', '--stage', '1', '--json']);
    assertEnvelopeCompliance(res, 'verify');
  });

  await runAsync('3.12: Subcommand [12/13] defects: runs causal defect oracle', async () => {
    const res = await cli.dispatch(['defects', '--json']);
    assertEnvelopeCompliance(res, 'defects');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  await runAsync('3.13: Subcommand [13/13] profile export: exports daylight-dc1 profile', async () => {
    const outProfile = path.join(tmpBase, 'profile_exported.json');
    const res = await cli.dispatch(['profile', 'export', 'daylight-dc1', '--output', outProfile, '--json']);
    assertEnvelopeCompliance(res, 'profile export');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Synchronous vs Asynchronous Dispatch Integrity
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 4: Synchronous vs Asynchronous Dispatch Integrity ───');

  runSync('4.1: Synchronous dispatch on synchronous command (doctor) returns genuine result immediately', () => {
    const res = cli.dispatch(['doctor', '--json']);
    assert.equal(typeof res.exitCode, 'number');
    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);
    assert.ok(res.output.includes('"command": "doctor"'));
  });

  runSync('4.2: Synchronous dispatch on asynchronous command (verify) exposes sync fallback caveat', () => {
    // Calling an async command synchronously
    const res = cli.dispatch(['verify', 'non_existent_screen']);
    // Check if synchronous property was pre-populated with PASS fallback
    if (res.exitCode === 0 && res.status === 'PASS') {
      recordFinding(
        'CAVEAT-01-SYNC-ASYNC-DISCREPANCY',
        'MAJOR',
        'Synchronous dispatch (cli.dispatch) on async commands (verify, baseline, capture, inspect-app) pre-populates exitCode=0 and status=PASS before async execution completes',
        `Sync inspect returned status: ${res.status}, exitCode: ${res.exitCode}`
      );
    }
  });

  await runAsync('4.3: Awaiting hybrid thenable resolves to final asynchronous outcome', async () => {
    const hybrid = cli.dispatch(['verify', 'non_existent_screen', '--json']);
    assert.equal(typeof hybrid.then, 'function', 'Hybrid result must be a thenable');
    const asyncResolved = await hybrid;
    assert.equal(asyncResolved.command, 'verify');
    assert.ok(asyncResolved.exitCode !== 0 || asyncResolved.status !== 'PASS', 'Async resolution must reflect real execution');
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Exit Code Semantics (0=PASS, 1=FAIL, 2=BLOCKED, 3=USAGE_ERROR)
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 5: Exit Code Semantics ───');

  runSync('5.1: Successful command yields exit code 0 (PASS)', () => {
    const res = cli.dispatch(['doctor']);
    assert.equal(res.exitCode, EXIT_CODES.PASS);
    assert.equal(res.exitCode, 0);
  });

  runSync('5.2: doctor with unknown option yields exit code 3 (USAGE_ERROR)', () => {
    const res = cli.dispatch(['doctor', '--unknown-flag-xyz']);
    assert.equal(res.exitCode, EXIT_CODES.USAGE_ERROR);
    assert.equal(res.exitCode, 3);
    assert.ok(res.error.includes('unrecognized option'));
  });

  await runAsync('5.3: verify on missing contract evidence evaluates outcome and exit code', async () => {
    const res = await cli.dispatch(['verify', 'missing_evidence_screen', '--json']);
    assert.equal(res.command, 'verify');
    if (res.data?.outcome === 'BLOCKED' && res.exitCode === 1) {
      recordFinding(
        'BUG-03-VERIFY-EXIT-CODE-BLOCKED',
        'CRITICAL',
        'ctc verify fails to emit exit code 2 (BLOCKED) when verification outcome is BLOCKED; emits exit code 1 because res.status is undefined in src/cli/commands/verify.js:25',
        `Outcome: ${res.data?.outcome}, ExitCode: ${res.exitCode}`
      );
    }
  });

  runSync('5.4: Unrecognized primary subcommand evaluates exit code', () => {
    const res = cli.dispatch(['invalid-cmd-12345']);
    assert.ok(res.error.includes('unrecognized subcommand'));
    // Note: F18-T5 requires exitCode 1, whereas specification discusses exit code 3 (USAGE_ERROR)
    if (res.exitCode === 1) {
      recordFinding(
        'INCONSISTENCY-01-UNRECOGNIZED-SUBCOMMAND-CODE',
        'MEDIUM',
        'Unrecognized subcommand returns exitCode 1 (satisfying F18-T5) rather than exitCode 3 (USAGE_ERROR)',
        `Actual: ${res.exitCode}, Expected per general CLI usage semantics: 3`
      );
    }
  });

  runSync('5.5: Non-doctor subcommand with unknown flag is evaluated', () => {
    const res = cli.dispatch(['init', path.join(tmpBase, 'flag_test'), '--unknown-flag']);
    if (res.exitCode === 0) {
      recordFinding(
        'GAP-01-UNCHECKED-FLAGS-NON-DOCTOR',
        'MEDIUM',
        'Unrecognized flags are silently ignored on all subcommands except doctor (src/cli/dispatcher.js:251-274)',
        'init succeeded with code 0 despite --unknown-flag'
      );
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Malformed Inputs, Missing Arguments & Flag Parsing Boundaries
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 6: Malformed Inputs & Flag Parsing Boundaries ───');

  runSync('6.1: parseJsonArg parses valid JSON correctly', () => {
    const obj = cli.parseJsonArg('{"a":1,"b":"hello"}');
    assert.deepEqual(obj, { a: 1, b: 'hello' });
  });

  runSync('6.2: parseJsonArg throws informative error on malformed JSON', () => {
    assert.throws(() => {
      cli.parseJsonArg('{malformed: json');
    }, /Invalid JSON argument/);
  });

  runSync('6.3: parseArgs handles > 100 flags without recursion or stack overflow', () => {
    const flags = Array.from({ length: 150 }, (_, i) => `--flag-${i}=val-${i}`);
    const parsed = cli.parseArgs(flags);
    assert.equal(Object.keys(parsed.flags).length, 150);
    assert.equal(parsed.flags['flag-0'], 'val-0');
    assert.equal(parsed.flags['flag-149'], 'val-149');
  });

  runSync('6.4: parseArgs canonicalizes standard aliases (app-dir, android, a -> appDir)', () => {
    const p1 = cli.parseArgs(['--app-dir', '/tmp/app']);
    assert.equal(p1.flags.appDir, '/tmp/app');

    const p2 = cli.parseArgs(['-a', '/tmp/app2']);
    assert.equal(p2.flags.appDir, '/tmp/app2');

    const p3 = cli.parseArgs(['--android', '/tmp/app3']);
    assert.equal(p3.flags.appDir, '/tmp/app3');
  });

  runSync('6.5: parseArgs supports end-of-options delimiter (--)', () => {
    const parsed = cli.parseArgs(['doctor', '--json', '--', '--not-a-flag', 'arg']);
    assert.equal(parsed.flags.json, true);
    assert.ok(parsed._.includes('--not-a-flag'));
    assert.ok(parsed._.includes('arg'));
  });

  runSync('6.6: Missing argument on contract build throws descriptive error', () => {
    const res = cli.dispatch(['contract', 'build']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.error.includes('Screen ID required'));
  });

  runSync('6.7: Missing argument on contract validate throws descriptive error', () => {
    const res = cli.dispatch(['contract', 'validate']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.error.includes('Contract file required'));
  });

  runSync('6.8: Missing argument on plan throws descriptive error', () => {
    const res = cli.dispatch(['plan']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.error.includes('Correspondence file required'));
  });

  runSync('6.9: Invalid subaction on profile (ctc profile bogus) throws descriptive error', () => {
    const res = cli.dispatch(['profile', 'bogus']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.error.includes('Unknown profile action'));
  });

  runSync('6.10: Invalid subaction on contract (ctc contract bogus) throws descriptive error', () => {
    const res = cli.dispatch(['contract', 'bogus']);
    assert.equal(res.exitCode, 1);
    assert.ok(res.error.includes('Unknown contract action'));
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Direct Process Stream Segregation & Downstream Piping
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 7: Direct Process Stream Segregation (stdout vs stderr) ───');

  runSync('7.1: Successful CLI command writes output to stdout and stderr is empty', () => {
    const res = invokeBin(['doctor', '--json']);
    assert.equal(res.status, 0);
    assert.ok(res.stdout.length > 0, 'stdout must receive output');
    assert.equal(res.stderr, '', 'stderr must be empty on exit 0');
  });

  runSync('7.2: Failing CLI command with --json inspects stdout and stderr streams', () => {
    const res = invokeBin(['doctor', '--unknown-flag', '--json']);
    assert.equal(res.status, 3);
    if (res.stdout === '' && res.stderr.length > 0) {
      recordFinding(
        'CAVEAT-02-STDERR-JSON-ON-FAILURE',
        'MEDIUM',
        'When exitCode !== 0, bin/ctc.js routes JSON output to stderr instead of stdout, which may break downstream parsers expecting stdout JSON piping (e.g. ctc verify --json | jq .)',
        `stdout length: ${res.stdout.length}, stderr length: ${res.stderr.length}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Summary & Diagnostic Report
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`  CHALLENGER 1 STRESS SUITE RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log(`  EMPIRICAL FINDINGS IDENTIFIED: ${findings.length}`);
  console.log('==============================================================================');

  findings.forEach((f, idx) => {
    console.log(`\n[Finding ${idx + 1}] [${f.severity}] ${f.id}:`);
    console.log(`  Summary: ${f.summary}`);
    console.log(`  Details: ${f.details}`);
  });

  // Clean temporary directory
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch (_) {}

  return { totalTests, passedTests, failedTests, findings };
}

main().then(summary => {
  if (summary.failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}).catch(err => {
  console.error('Fatal error in challenger stress suite:', err);
  process.exit(1);
});
