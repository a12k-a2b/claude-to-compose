#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Test Suite for M1 Headless Extraction Engine
 * Executed by Challenger 1 (Milestone M1)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { SpecBuilder } = require('../../extractor/spec_builder');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const TMP_BASE = path.resolve('/tmp/claude_adversarial_' + Date.now());

fs.mkdirSync(TMP_BASE, { recursive: true });

const results = [];

function runCLI(args, options = {}) {
  const cliPath = path.resolve(PROJECT_ROOT, 'bin/claude-extract.js');
  const start = Date.now();
  const res = spawnSync('node', [cliPath, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    ...options
  });
  const durationMs = Date.now() - start;
  return {
    status: res.status,
    signal: res.signal,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs,
    timedOut: res.error && res.error.code === 'ETIMEDOUT'
  };
}

function recordTest(id, name, category, passed, details) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[33mReason: ${details.reason}\x1b[0m`);
    if (details.stderr) console.log(`       Stderr: ${details.stderr.trim().slice(0, 200)}`);
  }
}

async function runSuite() {
  console.log('='.repeat(75));
  console.log('STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M1 EXTRACTION ENGINE)');
  console.log('Workspace: ' + PROJECT_ROOT);
  console.log('Test Temp: ' + TMP_BASE);
  console.log('='.repeat(75) + '\n');

  const specValidator = new SpecBuilder();

  // --------------------------------------------------------------------------
  // Category 1: Malformed HTML, Unclosed Tags, XSS, Deep Nesting
  // --------------------------------------------------------------------------
  console.log('--- Category 1: Malformed HTML, Unclosed Tags, XSS & Deep Nesting ---');

  // 1.1 Malformed Tags
  {
    const outDir = path.join(TMP_BASE, 'out_malformed_tags');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'malformed_tags.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (val.valid) passed = true;
        else reason = `Schema invalid: ${val.errors.join('; ')}`;
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `CLI exited with non-zero code ${res.status}`;
    }
    recordTest('ADV-1.1', 'Malformed HTML & Unclosed Tags Resilience', 'Malformed HTML', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // 1.2 XSS Payload
  {
    const outDir = path.join(TMP_BASE, 'out_xss');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'xss_payload.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (val.valid) passed = true;
        else reason = `Schema invalid: ${val.errors.join('; ')}`;
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `CLI exited with non-zero code ${res.status}`;
    }
    recordTest('ADV-1.2', 'Script Execution & XSS Sanitization Resilience', 'XSS & Scripts', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // 1.3 Deeply Nested Hierarchy (>50 levels)
  {
    const outDir = path.join(TMP_BASE, 'out_nested_60');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'deeply_nested_60.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (val.valid) passed = true;
        else reason = `Schema invalid: ${val.errors.join('; ')}`;
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `Extraction failed with code ${res.status} (Playwright serialization / recursion failure)`;
    }
    recordTest('ADV-1.3', 'Deeply Nested DOM (>50 levels) Serialization', 'Deep Nesting', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // --------------------------------------------------------------------------
  // Category 2: Zero Dimensions, Invisible Elements & Complex CSS
  // --------------------------------------------------------------------------
  console.log('\n--- Category 2: Zero Dimensions, Invisible Elements & Complex CSS ---');

  // 2.1 Zero Dimensions & Invisible Pruning
  {
    const outDir = path.join(TMP_BASE, 'out_zero_inv');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'zero_invisible.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (!val.valid) {
          reason = `Schema invalid: ${val.errors.join('; ')}`;
        } else {
          // Check that display:none and visibility:hidden were pruned
          function collectText(node) {
            let t = [];
            if (node.text?.content) t.push(node.text.content);
            if (node.children) node.children.forEach(c => t.push(...collectText(c)));
            return t;
          }
          const texts = collectText(spec.hierarchy);
          const hasHidden = texts.some(t => t.includes('should not be extracted'));
          const hasVisible = texts.some(t => t.includes('Main Card Visible'));
          const hasAnimatable = texts.some(t => t.includes('animatable opacity'));
          if (!hasHidden && hasVisible && hasAnimatable) {
            passed = true;
          } else {
            reason = `Pruning check failed (hasHidden=${hasHidden}, hasVisible=${hasVisible}, hasAnimatable=${hasAnimatable})`;
          }
        }
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `CLI exited with code ${res.status}`;
    }
    recordTest('ADV-2.1', 'Zero Dimensions and Invisible Element Filtering', 'Visibility & Dimensions', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // 2.2 CSS Calc, Clamp, Min, Max
  {
    const outDir = path.join(TMP_BASE, 'out_calc');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'calc_clamp.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (val.valid) {
          const container = spec.hierarchy.children?.[0];
          if (container && typeof container.layout?.padding?.top === 'number' && typeof container.bounds?.width === 'number') {
            passed = true;
          } else {
            reason = 'Computed layout metrics failed to resolve to finite numbers';
          }
        } else reason = `Schema invalid: ${val.errors.join('; ')}`;
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `CLI exited with code ${res.status}`;
    }
    recordTest('ADV-2.2', 'Complex CSS calc(), clamp(), min(), max() Evaluation', 'Complex CSS', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // --------------------------------------------------------------------------
  // Category 3: Malformed SVGs & Vector Asset Edge Cases
  // --------------------------------------------------------------------------
  console.log('\n--- Category 3: Malformed SVGs & Vector Extraction ---');

  // 3.1 Malformed SVGs
  {
    const outDir = path.join(TMP_BASE, 'out_svgs');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'malformed_svgs.html'), '-o', outDir]);
    let passed = false;
    let reason = '';
    if (res.status === 0) {
      const specPath = path.join(outDir, 'design_spec.json');
      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
        const val = specValidator.validate(spec);
        if (val.valid) {
          if (spec.vectors && spec.vectors.length === 7) {
            passed = true;
          } else {
            reason = `Expected 7 extracted vectors, got ${spec.vectors?.length || 0}`;
          }
        } else reason = `Schema invalid: ${val.errors.join('; ')}`;
      } else reason = 'design_spec.json not generated';
    } else {
      reason = `CLI exited with code ${res.status}`;
    }
    recordTest('ADV-3.1', 'Malformed, Unclosed & Missing viewBox SVGs', 'SVGs', passed, { reason, stderr: res.stderr, status: res.status });
  }

  // --------------------------------------------------------------------------
  // Category 4: Filesystem & Path Boundary Robustness
  // --------------------------------------------------------------------------
  console.log('\n--- Category 4: Filesystem, I/O & Permissions Robustness ---');

  // 4.1 Non-existent Input File
  {
    const res = runCLI(['--file', path.join(TMP_BASE, 'ghost_file.html')]);
    const passed = res.status === 2 && res.stderr.includes('Specified file not found');
    recordTest('ADV-4.1', 'Non-existent File Path Handling', 'Filesystem I/O', passed, {
      reason: `Expected exit code 2 with "Specified file not found", got code ${res.status}`,
      stderr: res.stderr,
      status: res.status
    });
  }

  // 4.2 Directory without index.html
  {
    const emptySubdir = path.join(TMP_BASE, 'empty_dir');
    fs.mkdirSync(emptySubdir, { recursive: true });
    const res = runCLI(['--file', emptySubdir]);
    const passed = res.status === 2 && res.stderr.includes('Directory does not contain an "index.html" file');
    recordTest('ADV-4.2', 'Directory without index.html Ingestion', 'Filesystem I/O', passed, {
      reason: `Expected exit code 2 with "Directory does not contain...", got code ${res.status}`,
      stderr: res.stderr,
      status: res.status
    });
  }

  // 4.3 Conflicting CLI Arguments
  {
    const res = runCLI(['--url', 'https://claude.site/test', '--file', path.join(FIXTURES_DIR, 'calc_clamp.html')]);
    const passed = res.status === 2 && res.stderr.includes('Cannot specify both --url and --file');
    recordTest('ADV-4.3', 'Mutually Exclusive Input Flags Validation', 'CLI Validation', passed, {
      reason: `Expected exit code 2 with "Cannot specify both...", got code ${res.status}`,
      stderr: res.stderr,
      status: res.status
    });
  }

  // 4.4 Malformed URL
  {
    const res = runCLI(['--url', 'not_a_valid_url']);
    const passed = res.status === 2 && res.stderr.includes('Invalid URL specified');
    recordTest('ADV-4.4', 'Invalid URL Format Rejection', 'CLI Validation', passed, {
      reason: `Expected exit code 2 with "Invalid URL specified", got code ${res.status}`,
      stderr: res.stderr,
      status: res.status
    });
  }

  // 4.5 Unreadable Local File (chmod 000)
  {
    const unreadableFile = path.join(TMP_BASE, 'unreadable.html');
    fs.writeFileSync(unreadableFile, '<div id="root">Secret</div>', { mode: 0o000 });
    const res = runCLI(['--file', unreadableFile, '-o', path.join(TMP_BASE, 'out_unreadable')]);
    // The engine should NOT exit 0 with a fake spec of "Internal Server Error"
    const passed = res.status !== 0;
    const reason = res.status === 0
      ? 'Engine silently succeeded with code 0 and extracted HTTP 500 error page instead of failing with clear error code'
      : '';
    recordTest('ADV-4.5', 'Unreadable Input File Permission Enforcement', 'Permissions & Security', passed, {
      reason,
      stderr: res.stderr,
      status: res.status
    });
  }

  // 4.6 Invalid Output Directory (Points to an existing file -> EEXIST)
  {
    const conflictFile = path.join(TMP_BASE, 'output_file_conflict');
    fs.writeFileSync(conflictFile, 'blocker');
    const res = runCLI(['--file', path.join(FIXTURES_DIR, 'calc_clamp.html'), '-o', conflictFile]);
    // It should handle the error cleanly without unhandled raw node stack trace
    const hasUnhandledException = res.stderr.includes('node:fs:') || res.stderr.includes('Uncaught Error');
    const passed = res.status !== 0 && !hasUnhandledException;
    const reason = hasUnhandledException
      ? 'Unhandled node:fs exception dumped raw stack trace to stderr (unhandled EEXIST)'
      : `Exit code ${res.status}`;
    recordTest('ADV-4.6', 'Invalid Output Directory Handling (EEXIST/ENOTDIR)', 'Filesystem I/O', passed, {
      reason,
      stderr: res.stderr,
      status: res.status
    });
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(75));
  console.log('ADVERSARIAL SUITE EXECUTION SUMMARY');
  console.log('='.repeat(75));
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Scenarios: ${total}`);
  console.log(`Passed:          \x1b[32m${passedCount}\x1b[0m`);
  console.log(`Failed:          \x1b[31${failedCount > 0 ? ';1m' : 'm'}${failedCount}\x1b[0m`);
  console.log('='.repeat(75));

  // Clean up test temp dir
  try {
    // restore permissions before removing
    fs.chmodSync(path.join(TMP_BASE, 'unreadable.html'), 0o755);
  } catch (_) {}
  fs.rmSync(TMP_BASE, { recursive: true, force: true });

  return { total, passedCount, failedCount, results };
}

if (require.main === module) {
  runSuite().then(summary => {
    process.exit(summary.failedCount > 0 ? 1 : 0);
  });
}

module.exports = { runSuite };
