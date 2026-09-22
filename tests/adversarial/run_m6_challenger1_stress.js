#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Milestone 6 Challenger 1 Adversarial Stress Test Suite:
 * CLI Dispatcher, Process Exit Codes, Workspace Config, AST Parser,
 * and Stage 5 Scenario Replay (Tier 5 Hardening)
 *
 * Target: tests/adversarial/run_m6_challenger1_stress.js
 * Author: Milestone 6 Challenger 1 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// Subsystems under test
const cli = require('../../src/cli/dispatcher');
const { EXIT_CODES, SUBCOMMANDS, SUBCOMMAND_OPTIONS } = cli;
const {
  DEFAULT_CONFIG,
  getStandardLayout,
  ensureDirExists,
  parseConfigString,
  serializeToml,
  initWorkspace,
  readConfig,
  writeConfig,
  cleanRuns,
  cleanTemp
} = require('../../src/config/workspace');
const KotlinLexer = require('../../src/analyzer/kotlin_lexer');
const KotlinParser = require('../../src/analyzer/kotlin_parser');
const { extractComposables } = require('../../src/analyzer/composable_extractor');
const astSymbols = require('../../src/analyzer/ast_symbols');
const { replayScenario } = require('../../src/verification/stages/scenario_replay');
const { DisplayProfileValidator, FORBIDDEN_EPD_PATTERNS } = require('../../src/verification/display_profile');

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
    stdout,
    stderr,
    json: parsedJson,
    error: res.error
  };
}

async function runAdversarialSuite() {
  console.log('\n==============================================================================');
  console.log('  MILESTONE 6 CHALLENGER 1 ADVERSARIAL STRESS SUITE (TIER 5 HARDENING)');
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: CLI Dispatcher, Exit Codes, High-Argument Stress & JSON Piping
  // --------------------------------------------------------------------------
  console.log('─── Suite 1: CLI Dispatcher, Exit Codes, High-Argument Stress & JSON Piping ───');

  // 1.1 All 13 subcommands with unexpected flags -> ExitCode 3 (USAGE_ERROR)
  const all13Subcommands = [
    ['doctor'],
    ['init'],
    ['baseline'],
    ['inspect-app'],
    ['capture'],
    ['contract', 'build'],
    ['contract', 'validate'],
    ['map'],
    ['plan'],
    ['agent', 'packet'],
    ['verify'],
    ['defects'],
    ['profile', 'export']
  ];

  for (const sub of all13Subcommands) {
    const cmdName = sub.join(' ');
    runSync(`1.1 Subcommand "${cmdName}" rejects unexpected flag with exit code 3 (USAGE_ERROR)`, () => {
      const args = [...sub, '--unexpected-adversarial-flag-test'];
      const res = cli.dispatch(args);
      assert.strictEqual(res.exitCode, EXIT_CODES.USAGE_ERROR, `Expected exitCode 3, got ${res.exitCode}`);
      assert.match(res.output, /unrecognized option/i);
    });

    runSync(`1.1 Subcommand "${cmdName}" with unexpected flag and --json pipes valid JSON to stdout`, () => {
      const args = [...sub, '--unexpected-adversarial-flag-test', '--json'];
      const proc = invokeBin(args);
      assert.strictEqual(proc.status, EXIT_CODES.USAGE_ERROR, `Expected status 3, got ${proc.status}`);
      assert.ok(proc.json, `Expected valid JSON in stdout for ${cmdName}, got: ${proc.stdout}`);
      assert.strictEqual(proc.json.exitCode, EXIT_CODES.USAGE_ERROR);
      assert.strictEqual(proc.json.status, 'FAIL');
      assert.match(proc.json.error, /unrecognized option/i);
    });
  }

  // 1.2 Subcommands with missing required arguments -> ExitCode 1 (FAIL)
  const missingArgSubcommands = [
    { cmd: ['contract', 'build'], errRegex: /screen id required/i },
    { cmd: ['contract', 'validate'], errRegex: /contract file required/i },
    { cmd: ['map'], errRegex: /contract file required/i },
    { cmd: ['plan'], errRegex: /correspondence file required/i },
    { cmd: ['agent', 'packet'], errRegex: /screen id required/i }
  ];

  for (const { cmd, errRegex } of missingArgSubcommands) {
    const cmdName = cmd.join(' ');
    runSync(`1.2 Subcommand "${cmdName}" with missing arguments fails cleanly with exit code 1`, () => {
      const res = cli.dispatch([...cmd]);
      assert.strictEqual(res.exitCode, EXIT_CODES.FAIL, `Expected exitCode 1, got ${res.exitCode}`);
      assert.match(res.error || res.output, errRegex);
    });

    runSync(`1.2 Subcommand "${cmdName}" with missing arguments and --json pipes valid JSON to stdout`, () => {
      const proc = invokeBin([...cmd, '--json']);
      assert.strictEqual(proc.status, EXIT_CODES.FAIL, `Expected status 1, got ${proc.status}`);
      assert.ok(proc.json, `Expected valid JSON on stdout for ${cmdName}`);
      assert.strictEqual(proc.json.exitCode, EXIT_CODES.FAIL);
      assert.strictEqual(proc.json.status, 'FAIL');
      assert.match(proc.json.error, errRegex);
    });
  }

  // 1.3 Exit Code Determinism across 0=PASS, 1=FAIL, 2=BLOCKED, 3=USAGE_ERROR
  runSync('1.3 Exit Code 0 (PASS): Valid execution of init and profile export', () => {
    const tmpDir = path.join(os.tmpdir(), `ctc_exit0_test_${Date.now()}`);
    const tmpProfileOut = path.join(tmpDir, 'exported-profile.json');
    try {
      const procInit = invokeBin(['init', tmpDir, '--json']);
      assert.strictEqual(procInit.status, EXIT_CODES.PASS);
      assert.ok(procInit.json);
      assert.strictEqual(procInit.json.status, 'PASS');
      assert.strictEqual(procInit.json.exitCode, 0);

      const procProfile = invokeBin(['profile', 'export', 'daylight-dc1', '--output', tmpProfileOut, '--json']);
      assert.strictEqual(procProfile.status, EXIT_CODES.PASS);
      assert.ok(procProfile.json);
      assert.strictEqual(procProfile.json.exitCode, 0);
    } finally {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  runSync('1.3 Exit Code 1 (FAIL): Subcommand syntax failure and non-existent command', () => {
    const procUnknown = invokeBin(['unrecognized-subcmd-xyz', '--json']);
    assert.strictEqual(procUnknown.status, EXIT_CODES.FAIL);
    assert.ok(procUnknown.json);
    assert.strictEqual(procUnknown.json.exitCode, 1);
    assert.match(procUnknown.json.error, /unrecognized subcommand/i);

    const procBaselineFail = invokeBin(['baseline', '/tmp/non_existent_app_dir_99999', '--json']);
    assert.strictEqual(procBaselineFail.status, EXIT_CODES.FAIL);
    assert.ok(procBaselineFail.json);
    assert.strictEqual(procBaselineFail.json.exitCode, 1);
  });

  runSync('1.3 Exit Code 2 (BLOCKED): Agent packet blocked when migration plan missing', () => {
    const procBlocked = invokeBin(['agent', 'packet', 'nonexistent_test_screen', '--json']);
    assert.strictEqual(procBlocked.status, EXIT_CODES.BLOCKED);
    assert.ok(procBlocked.json);
    assert.strictEqual(procBlocked.json.status, 'BLOCKED');
    assert.strictEqual(procBlocked.json.exitCode, 2);
    assert.match(procBlocked.json.error, /migration plan not found/i);
  });

  runSync('1.3 Exit Code 3 (USAGE_ERROR): Unrecognized option on valid subcommand', () => {
    const procUsageErr = invokeBin(['doctor', '--invalid-flag-999', '--json']);
    assert.strictEqual(procUsageErr.status, EXIT_CODES.USAGE_ERROR);
    assert.ok(procUsageErr.json);
    assert.strictEqual(procUsageErr.json.exitCode, 3);
    assert.match(procUsageErr.json.error, /unrecognized option/i);
  });

  // 1.4 High-Argument Boundary Conditions & Stack Overflow Resistance
  runSync('1.4 High-argument boundary: in-memory parseArgs handles 10,000 flags in < 50ms', () => {
    const args = [];
    for (let i = 0; i < 10000; i++) {
      args.push(`--flag-${i}=val-${i}`);
    }
    const start = performance.now();
    const parsed = cli.parseArgs(args);
    const duration = performance.now() - start;
    assert.strictEqual(Object.keys(parsed.flags).length, 10000);
    assert.ok(duration < 50, `parseArgs took ${duration}ms, expected < 50ms`);
  });

  runSync('1.4 High-argument boundary: positional separator "--" with 2,000 trailing arguments', () => {
    const args = ['doctor', '--'];
    for (let i = 0; i < 2000; i++) {
      args.push(`pos-${i}`);
    }
    const parsed = cli.parseArgs(args);
    assert.strictEqual(parsed._.length, 2001); // 'doctor' + 2000 positional
  });

  runSync('1.4 High-argument boundary: Prototype pollution resistance (__proto__, constructor)', () => {
    const args = ['--__proto__=polluted', '--constructor=fake', '--toString=bad', '--valueOf=bad'];
    const parsed = cli.parseArgs(args);
    assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');
    assert.strictEqual(typeof ({}).toString, 'function');
  });

  runSync('1.4 High-argument boundary: CLI binary handles 300 flags without process crash', () => {
    const args = ['doctor'];
    for (let i = 0; i < 300; i++) {
      args.push(`--opt-${i}=test`);
    }
    const proc = invokeBin(args);
    assert.strictEqual(proc.status, EXIT_CODES.USAGE_ERROR);
    assert.match(proc.stderr, /unrecognized option/i);
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Workspace Layout & Configuration Resilience
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 2: Workspace Layout & Configuration Resilience ───');

  // 2.1 Corrupted TOML Parsing
  runSync('2.1 Corrupted TOML: Missing equals sign throws syntax error with line number', () => {
    assert.throws(
      () => parseConfigString('version = "2.0.0"\ncorrupted line missing equals\nprofile = "daylight-dc1"'),
      (err) => err.message.includes('line 2') && err.message.includes('missing \'=\'')
    );
  });

  runSync('2.1 Corrupted TOML: Unclosed bracket throws syntax error with line number', () => {
    assert.throws(
      () => parseConfigString('# Header\n[unclosed_table_header\nversion = "2.0.0"'),
      (err) => err.message.includes('line 2') && err.message.includes('unclosed bracket')
    );
  });

  runSync('2.1 Corrupted TOML: Multi-line file reports exact error line', () => {
    const toml = [
      '# Line 1',
      'version = "2.0.0"',
      'profile = "daylight-dc1"',
      'module = "app"',
      'variant debug', // missing equals on line 5
      'androidDir = "."'
    ].join('\n');

    assert.throws(
      () => parseConfigString(toml),
      (err) => err.message.includes('line 5')
    );
  });

  runSync('2.1 TOML Parsing: Empty string, whitespace, and comments fall back to DEFAULT_CONFIG', () => {
    const r1 = parseConfigString('');
    assert.strictEqual(r1.profile, DEFAULT_CONFIG.profile);
    assert.strictEqual(r1.version, DEFAULT_CONFIG.version);

    const r2 = parseConfigString('   \n\t\r\n   ');
    assert.strictEqual(r2.profile, DEFAULT_CONFIG.profile);

    const r3 = parseConfigString('# Only comments\n# Another comment\n');
    assert.strictEqual(r3.profile, DEFAULT_CONFIG.profile);
  });

  runSync('2.1 TOML Parsing: Types parsed accurately (booleans, numbers, quoted strings)', () => {
    const toml = 'strict = true\ndebug = false\nport = 8080\nrate = 12.5\nname = "my_app"';
    const cfg = parseConfigString(toml);
    assert.strictEqual(cfg.strict, true);
    assert.strictEqual(cfg.debug, false);
    assert.strictEqual(cfg.port, 8080);
    assert.strictEqual(cfg.rate, 12.5);
    assert.strictEqual(cfg.name, 'my_app');
  });

  // 2.2 Uninitialized Directories & Missing Configs
  runSync('2.2 Uninitialized directory: readConfig returns default config without crashing', () => {
    const fakeDir = path.join(os.tmpdir(), `non_existent_workspace_${Date.now()}`);
    const cfg = readConfig(fakeDir);
    assert.strictEqual(cfg.profile, DEFAULT_CONFIG.profile);
    assert.strictEqual(cfg.module, DEFAULT_CONFIG.module);
  });

  runSync('2.2 Uninitialized directory: cleanRuns and cleanTemp return { cleanedCount: 0 }', () => {
    const fakeDir = path.join(os.tmpdir(), `non_existent_workspace_${Date.now()}`);
    const r1 = cleanRuns(fakeDir);
    assert.strictEqual(r1.cleanedCount, 0);
    const r2 = cleanTemp(fakeDir);
    assert.strictEqual(r2.cleanedCount, 0);
  });

  runSync('2.2 Canonical Layout: getStandardLayout emits all 10 required workspace paths', () => {
    const layout = getStandardLayout('/tmp/test_ws');
    const requiredKeys = [
      'root', 'configFile', 'projectToml', 'contractsDir', 'baselinesDir',
      'evidenceDir', 'packetsDir', 'reportsDir', 'appDir', 'designsDir', 'profilesDir'
    ];
    for (const key of requiredKeys) {
      assert.ok(layout[key], `Missing canonical layout key "${key}"`);
      assert.ok(path.isAbsolute(layout[key]), `Path for "${key}" must be absolute`);
    }
  });

  // 2.3 Safe Cleanup of Transient / Temp Runs
  runSync('2.3 Safe Cleanup: Deletes nested run artifacts and reports exact cleaned count', () => {
    const wsDir = path.join(os.tmpdir(), `ctc_clean_test_${Date.now()}`);
    try {
      const run1 = path.join(wsDir, '.ctc/designs/screen_a/verification/runs/run_001');
      const run2 = path.join(wsDir, '.ctc/designs/screen_a/verification/runs/run_002');
      const run3 = path.join(wsDir, '.ctc/designs/screen_b/verification/runs/run_001');
      fs.mkdirSync(run1, { recursive: true });
      fs.mkdirSync(run2, { recursive: true });
      fs.mkdirSync(run3, { recursive: true });
      fs.writeFileSync(path.join(run1, 'receipt.json'), '{"id": 1}');
      fs.writeFileSync(path.join(run2, 'receipt.json'), '{"id": 2}');
      fs.writeFileSync(path.join(run3, 'receipt.json'), '{"id": 3}');

      const res = cleanRuns(wsDir);
      assert.strictEqual(res.cleanedCount, 3);
      assert.strictEqual(fs.existsSync(run1), false);
      assert.strictEqual(fs.existsSync(run2), false);
      assert.strictEqual(fs.existsSync(run3), false);

      // Idempotency: second clean returns 0
      const res2 = cleanRuns(wsDir);
      assert.strictEqual(res2.cleanedCount, 0);
    } finally {
      if (fs.existsSync(wsDir)) fs.rmSync(wsDir, { recursive: true, force: true });
    }
  });

  // 2.4 Permission Edge Cases
  runSync('2.4 Permission Edge Case: Restricted target directory throws formatted error', () => {
    const roDir = path.join(os.tmpdir(), `ctc_ro_test_${Date.now()}`);
    fs.mkdirSync(roDir, { mode: 0o444 });
    try {
      assert.throws(
        () => initWorkspace(path.join(roDir, 'nested')),
        (err) => err.message.includes('Permission denied')
      );
    } finally {
      fs.chmodSync(roDir, 0o777);
      fs.rmSync(roDir, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Multi-Scene AST Indexer & Kotlin Parsing
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 3: Multi-Scene AST Indexer & Kotlin Parsing ───');

  // 3.1 Broken Kotlin Syntax Recovery
  runSync('3.1 Syntax Recovery: Recovers from malformed function declaration to parse healthy composable', () => {
    const code = `
      package com.claude.test

      @Composable
      fun CorruptedDecl(
          val a: %%% SYNTAX ERROR %%%
      ) {
          Text("Broken")
      }

      @Composable
      fun HealthyComposable() {
          Text("Healthy")
      }
    `;
    const lexer = new KotlinLexer(code, 'Test.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Test.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    const names = composables.map(c => c.composableName);
    assert.ok(names.includes('HealthyComposable'), 'HealthyComposable must be extracted despite prior syntax error');
  });

  runSync('3.1 Syntax Recovery: Unclosed block comment does not crash lexer and emits error diagnostic', () => {
    const code = '/* unclosed comment\npackage com.test\nfun Hello() {}';
    const lexer = new KotlinLexer(code, 'Test.kt');
    const { tokens, diagnostics } = lexer.tokenize();
    assert.ok(tokens.length > 0);
    assert.ok(diagnostics.some(d => d.severity === 'ERROR' && /unterminated.*comment/i.test(d.message)));
  });

  runSync('3.1 Syntax Recovery: Raw multiline string with unclosed quotes handles EOF cleanly', () => {
    const code = 'val text = """unclosed raw string at EOF';
    const lexer = new KotlinLexer(code, 'Test.kt');
    const { tokens, diagnostics } = lexer.tokenize();
    assert.ok(tokens.length > 0);
    assert.ok(diagnostics.some(d => d.severity === 'ERROR' && /unterminated.*string/i.test(d.message)));
  });

  // 3.2 Extension Composables
  runSync('3.2 Extension Composables: ColumnScope extension composable extracts receiver correctly', () => {
    const code = `
      package com.claude.ui

      @Composable
      fun ColumnScope.CustomToolbar(
          modifier: Modifier = Modifier,
          title: String
      ) {
          Text(title)
      }
    `;
    const lexer = new KotlinLexer(code, 'Toolbar.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Toolbar.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    assert.strictEqual(composables.length, 1);
    const c = composables[0];
    assert.strictEqual(c.composableName, 'CustomToolbar');
    assert.strictEqual(c.isExtension, true);
    assert.strictEqual(c.receiverType, 'ColumnScope');
    assert.strictEqual(c.symbol, 'com.claude.ui.CustomToolbar');
  });

  runSync('3.2 Extension Composables: BoxScope and Modifier extension functions classified', () => {
    const code = `
      package com.claude.ui

      @Composable
      fun BoxScope.FloatingAction(badge: String) {
          Text(badge)
      }

      fun Modifier.solOsBorder(): Modifier = this.then(Modifier)
    `;
    const lexer = new KotlinLexer(code, 'Extensions.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Extensions.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    assert.strictEqual(composables.length, 1);
    assert.strictEqual(composables[0].receiverType, 'BoxScope');
    assert.strictEqual(composables[0].isExtension, true);

    const nonComposable = ast.declarations.find(d => d.name === 'solOsBorder');
    assert.ok(nonComposable);
    assert.strictEqual(nonComposable.receiver, 'Modifier');
  });

  // 3.3 Trailing Lambdas & Slot Composables
  runSync('3.3 Trailing Lambdas: Parameter slot lambdas classified with isLambda = true', () => {
    const code = `
      package com.claude.ui

      @Composable
      fun CardWithSlot(
          title: String,
          onAction: (String) -> Unit = {},
          content: @Composable () -> Unit
      ) {
          Text(title)
      }
    `;
    const lexer = new KotlinLexer(code, 'Slots.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Slots.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    assert.strictEqual(composables.length, 1);
    const params = composables[0].parameters;
    const pTitle = params.find(p => p.name === 'title');
    const pAction = params.find(p => p.name === 'onAction');
    const pContent = params.find(p => p.name === 'content');

    assert.strictEqual(pTitle.isLambda, false);
    assert.strictEqual(pAction.isLambda, true);
    assert.strictEqual(pContent.isLambda, true);
  });

  runSync('3.3 Trailing Lambdas: CallTree captures components invoked with trailing lambdas', () => {
    const code = `
      package com.claude.ui

      @Composable
      fun ComplexScreen() {
          Card {
              Column {
                  Text("Heading")
                  Button(onClick = {}) {
                      Text("Submit")
                  }
              }
          }
      }
    `;
    const lexer = new KotlinLexer(code, 'Screen.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Screen.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    assert.strictEqual(composables.length, 1);
    const callNames = composables[0].callTree.children.map(c => c.component);
    assert.ok(callNames.includes('Card'));
    assert.ok(callNames.includes('Column'));
    assert.ok(callNames.includes('Text'));
    assert.ok(callNames.includes('Button'));
  });

  // 3.4 Nested & Identically Named Functions
  runSync('3.4 Nested Functions: Overloaded composables with identical names extracted distinctly', () => {
    const code = `
      package com.claude.ui

      @Composable
      fun NoteCard(noteId: String) {
          Text("ID: $noteId")
      }

      @Composable
      fun NoteCard(title: String, body: String) {
          Text("$title: $body")
      }
    `;
    const lexer = new KotlinLexer(code, 'Overload.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Overload.kt');
    const ast = parser.parseFile();

    const composables = extractComposables(ast);
    assert.strictEqual(composables.length, 2);
    assert.strictEqual(composables[0].composableName, 'NoteCard');
    assert.strictEqual(composables[0].parameters.length, 1);
    assert.strictEqual(composables[1].composableName, 'NoteCard');
    assert.strictEqual(composables[1].parameters.length, 2);
  });

  runSync('3.4 Nested Functions: Scoped inner class member does not collide with top-level function', () => {
    const code = `
      package com.claude.ui

      class ScreenContainer {
          fun render() {
              println("Container render")
          }
      }

      fun render() {
          println("Top-level render")
      }
    `;
    const lexer = new KotlinLexer(code, 'Scope.kt');
    const { tokens } = lexer.tokenize();
    const parser = new KotlinParser(tokens, 'Scope.kt');
    const ast = parser.parseFile();

    assert.strictEqual(ast.declarations.length, 2);
    const classDecl = ast.declarations.find(d => d.type === 'ClassDeclaration');
    const funDecl = ast.declarations.find(d => d.type === 'FunctionDeclaration');

    assert.strictEqual(classDecl.name, 'ScreenContainer');
    assert.strictEqual(classDecl.bodyDeclarations.length, 1);
    assert.strictEqual(classDecl.bodyDeclarations[0].name, 'render');
    assert.strictEqual(funDecl.name, 'render');
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Stage 5 Scenario Replay & DC1 LivePaper Conformance
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 4: Stage 5 Scenario Replay & DC1 LivePaper Conformance ───');

  // 4.1 Hardware Key Latency Assertions (< 16ms LivePaper standard)
  await runAsync('4.1 Hardware Latency: Latency = 10.0ms (< 16ms threshold) passes', async () => {
    const res = await replayScenario({
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 10.0 },
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.latencyMs, 10.0);
  });

  await runAsync('4.1 Hardware Latency: Latency = 15.9ms (< 16ms threshold) passes', async () => {
    const res = await replayScenario({
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 15.9 },
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
  });

  await runAsync('4.1 Hardware Latency: Latency = 16.0ms fails with LATENCY_THRESHOLD_EXCEEDED', async () => {
    const res = await replayScenario({
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 16.0 },
      settleMs: 150
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'LATENCY_THRESHOLD_EXCEEDED');
    assert.match(res.error, /exceeds LivePaper sub-frame threshold/i);
  });

  await runAsync('4.1 Hardware Latency: Latency = 32.0ms fails with LATENCY_THRESHOLD_EXCEEDED', async () => {
    const res = await replayScenario({
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', latencyMs: 32.0 },
      settleMs: 150
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'LATENCY_THRESHOLD_EXCEEDED');
  });

  // 4.2 Settle Time Assertions (150ms fluid standard, zero EPD waveforms)
  await runAsync('4.2 Settle Time: Settle = 150ms (fluid LivePaper standard) passes', async () => {
    const res = await replayScenario({
      action: { type: 'BACK_PRESS', latencyMs: 8.0 },
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.settleMs, 150);
  });

  await runAsync('4.2 Settle Time: Settle = 149ms fails (below 150ms minimum)', async () => {
    const res = await replayScenario({
      action: { type: 'BACK_PRESS', latencyMs: 8.0 },
      settleMs: 149
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'EPD_WORKAROUND_VIOLATION');
    assert.match(res.error, /below minimum 150ms/i);
  });

  await runAsync('4.2 Settle Time: Settle = 300ms passes within allowable animation window', async () => {
    const res = await replayScenario({
      action: { type: 'BACK_PRESS', latencyMs: 8.0 },
      settleMs: 300
    });
    assert.strictEqual(res.status, 'PASS');
  });

  await runAsync('4.2 Settle Time: Settle = 500ms fails with artificial pause detection', async () => {
    const res = await replayScenario({
      action: { type: 'BACK_PRESS', latencyMs: 8.0 },
      settleMs: 500
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'EPD_WORKAROUND_VIOLATION');
    assert.match(res.error, /violates zero EPD waveform rule/i);
  });

  await runAsync('4.2 Settle Time: Settle = 1200ms fails with artificial pause detection', async () => {
    const res = await replayScenario({
      action: { type: 'BACK_PRESS', latencyMs: 8.0 },
      settleMs: 1200
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'EPD_WORKAROUND_VIOLATION');
  });

  // 4.3 Back Navigation & Backstack State Preservation
  await runAsync('4.3 Back Navigation: KEYCODE_BACK pops backstack and preserves state', async () => {
    const res = await replayScenario({
      initialRoute: 'note_editor/42',
      backstack: ['notes_list', 'note_editor/42'],
      action: { type: 'KEY_EVENT', keyCode: 'KEYCODE_BACK', keyEventCode: 4, latencyMs: 11.5 },
      expectedDestination: 'notes_list',
      expectedNavigationEffect: 'POP_BACK',
      verifyStatePreserved: true,
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.currentRoute, 'notes_list');
    assert.strictEqual(res.backstackPopped, true);
    assert.strictEqual(res.statePreserved, true);
    assert.deepStrictEqual(res.backstack, ['notes_list']);
  });

  await runAsync('4.3 Back Navigation: BACK_PRESS action dispatches POP_BACK', async () => {
    const res = await replayScenario({
      initialRoute: 'note_editor/1',
      backstack: ['notes_list', 'note_editor/1'],
      action: { type: 'BACK_PRESS', latencyMs: 9.0 },
      expectedDestination: 'notes_list',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.currentRoute, 'notes_list');
  });

  await runAsync('4.3 Back Navigation: Single-entry backstack pop exits app cleanly', async () => {
    const res = await replayScenario({
      initialRoute: 'notes_list',
      backstack: ['notes_list'],
      action: { type: 'BACK_PRESS', latencyMs: 9.0 },
      expectedDestination: null,
      expectedNavigationEffect: 'POP_BACK',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.currentRoute, null);
    assert.strictEqual(res.backstackPopped, true);
  });

  await runAsync('4.3 Back Navigation: Destination mismatch triggers NAVIGATION_DESTINATION_MISMATCH', async () => {
    const res = await replayScenario({
      initialRoute: 'note_editor/1',
      backstack: ['notes_list', 'note_editor/1'],
      action: { type: 'BACK_PRESS', latencyMs: 9.0 },
      expectedDestination: 'unexpected_destination_route',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'NAVIGATION_DESTINATION_MISMATCH');
  });

  // 4.4 Anti-EPD Watchdog Checks
  await runAsync('4.4 Anti-EPD Watchdog: Prohibited ACTION_REFRESH_SCREEN broadcast triggers FAIL', async () => {
    const res = await replayScenario({
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"))',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'EPD_WORKAROUND_VIOLATION');
    assert.strictEqual(res.epdWaveformsDetected, true);
  });

  await runAsync('4.4 Anti-EPD Watchdog: Artificial Thread.sleep(800) triggers FAIL', async () => {
    const res = await replayScenario({
      sourceCode: 'Thread.sleep(800) // waiting for e-ink screen refresh',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'FAIL');
    assert.strictEqual(res.errorCode, 'EPD_WORKAROUND_VIOLATION');
  });

  await runAsync('4.4 Anti-EPD Watchdog: Clean Compose code with no waveforms passes', async () => {
    const res = await replayScenario({
      sourceCode: 'BackHandler(enabled = true) { onNavigateBack() }',
      settleMs: 150
    });
    assert.strictEqual(res.status, 'PASS');
    assert.strictEqual(res.epdWaveformsDetected, false);
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('  M6 Challenger 1 Adversarial Stress Test Summary');
  console.log('==============================================================================');
  console.log(`  Total Executed Tests: ${totalTests}`);
  console.log(`  Passed Tests:         ${passedTests}`);
  console.log(`  Failed Tests:         ${failedTests}`);
  console.log('==============================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Fatal crash in adversarial runner:', err);
  process.exit(1);
});
