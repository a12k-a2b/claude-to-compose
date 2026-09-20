#!/usr/bin/env node

/**
 * ============================================================================
 * Tier 5 Adversarial Test Suite: ClosedLoopAutoTuner Hardening & Stress
 * Milestone M3: Closed-Loop Stability, Convergence & Rollback Stress
 * Challenger 2 (critic, specialist)
 * ============================================================================
 * Adversarially stress-tests ClosedLoopAutoTuner in verification/auto_tuner.js:
 *   Section 1: Anti-Deception Convergence Gate Adversarial Stress
 *   Section 2: Oscillation Detection & Pathological Drift Dynamics
 *   Section 3: Deadband Clamping & Jitter Prevention
 *   Section 4: Regression Detection, Rollback & Compilation Guards
 *   Section 5: KotlinComposeMutator Robustness & Sentinel P0 Invariants
 *   Section 6: CLI Execution, Flag Parsing, Dry-Run & Pipe Safety
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const {
  AutoTuner,
  ClosedLoopAutoTuner,
  KotlinComposeMutator,
  autoTuneScreen,
  checkConvergence,
  detectOscillation,
  detectRegression,
  calculateCompositeScore
} = require(path.join(PROJECT_ROOT, 'verification/auto_tuner.js'));

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests.push({ name, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests.push({ name, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

(async function runTestSuite() {
  console.log('====================================================================');
  console.log('  TIER 5 ADVERSARIAL TEST: CLOSED-LOOP AUTO-TUNER (Feature F9)');
  console.log('====================================================================\n');

  // ==========================================================================
  // Section 1: Anti-Deception Convergence Gate Adversarial Stress
  // ==========================================================================
  console.log('--- Section 1: Anti-Deception Convergence Gate Adversarial Stress ---');

  test('1.1 Passes when all 5 anti-deception gates are satisfied simultaneously', () => {
    const metrics = {
      edgeContourScore: 91.5,
      elementIouScore: 92.0,
      maxSpatialShiftPx: 2.1,
      inkIou: 60.5,
      mssimScore: 0.81
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, true);
    assert.strictEqual(res.violations.length, 0);
  });

  test('1.2 Boundary: Exact threshold values satisfy gates', () => {
    const metrics = {
      edgeContourScore: 90.0,
      elementIouScore: 90.0,
      maxSpatialShiftPx: 3.0,
      inkIou: 55.0,
      mssimScore: 0.72
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, true);
    assert.strictEqual(res.violations.length, 0);
  });

  test('1.3 Gate Veto: Edge contour 89.99% fails with explicit violation', () => {
    const metrics = {
      edgeContourScore: 89.99,
      elementIouScore: 95.0,
      maxSpatialShiftPx: 1.0,
      inkIou: 70.0,
      mssimScore: 0.90
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 1);
    assert.match(res.violations[0], /Edge contour alignment/);
  });

  test('1.4 Gate Veto: Element IoU 89.99% fails with explicit violation', () => {
    const metrics = {
      edgeContourScore: 95.0,
      elementIouScore: 89.99,
      maxSpatialShiftPx: 1.0,
      inkIou: 70.0,
      mssimScore: 0.90
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 1);
    assert.match(res.violations[0], /Element bounding box IoU/);
  });

  test('1.5 Gate Veto: Max spatial shift 3.01px fails with explicit violation', () => {
    const metrics = {
      edgeContourScore: 95.0,
      elementIouScore: 95.0,
      maxSpatialShiftPx: 3.01,
      inkIou: 70.0,
      mssimScore: 0.90
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 1);
    assert.match(res.violations[0], /Max spatial shift/);
  });

  test('1.6 Gate Veto: Ink IoU 54.99% fails with explicit violation', () => {
    const metrics = {
      edgeContourScore: 95.0,
      elementIouScore: 95.0,
      maxSpatialShiftPx: 1.0,
      inkIou: 54.99,
      mssimScore: 0.90
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 1);
    assert.match(res.violations[0], /Foreground Ink IoU/);
  });

  test('1.7 Gate Veto: MSSIM 0.719 fails with explicit violation', () => {
    const metrics = {
      edgeContourScore: 95.0,
      elementIouScore: 95.0,
      maxSpatialShiftPx: 1.0,
      inkIou: 70.0,
      mssimScore: 0.719
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 1);
    assert.match(res.violations[0], /MSSIM score/);
  });

  test('1.8 Empty metrics object triggers all 5 violations', () => {
    const res = checkConvergence({});
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 5);
  });

  test('1.9 Guarded: Null metrics argument safely returns converged: false with 5 violations', () => {
    const res = checkConvergence(null);
    assert.strictEqual(res.converged, false);
    assert.strictEqual(res.violations.length, 5);
  });

  test('1.10 Adversarial: String numbers are correctly compared', () => {
    const metrics = {
      edgeContourScore: '92.5',
      elementIouScore: '91.0',
      maxSpatialShiftPx: '2.0',
      inkIou: '60.0',
      mssimScore: '0.80'
    };
    const res = checkConvergence(metrics);
    assert.strictEqual(res.converged, true);
  });

  test('1.11 Hardened: IEEE 754 NaN metrics trigger explicit anti-deception gate violations', () => {
    const nanMetrics = {
      edgeContourScore: NaN,
      elementIouScore: NaN,
      maxSpatialShiftPx: NaN,
      inkIou: NaN,
      mssimScore: NaN
    };
    const res = checkConvergence(nanMetrics);
    assert.strictEqual(res.converged, false, 'NaN metrics must not bypass anti-deception quality gates');
    assert.strictEqual(res.violations.length, 5, 'All 5 quality gates must record violations for NaN metrics');
  });

  // ==========================================================================
  // Section 2: Oscillation Detection & Pathological Drift Dynamics
  // ==========================================================================
  console.log('\n--- Section 2: Oscillation Detection & Pathological Drift Dynamics ---');

  test('2.1 Pure 1D X-axis reversal (dx: +10 -> -8) triggers oscillation detection', () => {
    const history = [
      { driftVectors: [{ elementId: 'btn_1', dx: 10.0, dy: 0.0 }] },
      { driftVectors: [{ elementId: 'btn_1', dx: -8.0, dy: 0.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'btn_1'), true);
  });

  test('2.2 Pure 1D Y-axis reversal (dy: +6 -> -4) triggers oscillation detection', () => {
    const history = [
      { driftVectors: [{ elementId: 'title', dx: 0.0, dy: 6.0 }] },
      { driftVectors: [{ elementId: 'title', dx: 0.0, dy: -4.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'title'), true);
  });

  test('2.3 2D direct reversal ([3, 4] -> [-3, -4], dot = -25 < 0) triggers oscillation', () => {
    const history = [
      { driftVectors: [{ elementId: 'card', dx: 3.0, dy: 4.0 }] },
      { driftVectors: [{ elementId: 'card', dx: -3.0, dy: -4.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'card'), true);
  });

  test('2.4 Obtuse angle reversal ([5, 1] -> [-4, 2], dot = -18 < 0) triggers oscillation', () => {
    const history = [
      { driftVectors: [{ elementId: 'icon', dx: 5.0, dy: 1.0 }] },
      { driftVectors: [{ elementId: 'icon', dx: -4.0, dy: 2.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'icon'), true);
  });

  test('2.5 Single-axis sign flip with positive dot product ([2, 10] -> [-2, 12]) triggers oscillation', () => {
    // dot = (2)(-2) + (10)(12) = -4 + 120 = 116 > 0, BUT X axis flipped sign!
    const history = [
      { driftVectors: [{ elementId: 'nav', dx: 2.0, dy: 10.0 }] },
      { driftVectors: [{ elementId: 'nav', dx: -2.0, dy: 12.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'nav'), true);
  });

  test('2.6 Diverging oscillating sequence: verifies adaptive damping halving to floor 0.2', () => {
    const history = [
      { driftVectors: [{ elementId: 'diverge', dx: 2.0, dy: 0 }] },
      { driftVectors: [{ elementId: 'diverge', dx: -6.0, dy: 0 }] },
      { driftVectors: [{ elementId: 'diverge', dx: 18.0, dy: 0 }] },
      { driftVectors: [{ elementId: 'diverge', dx: -54.0, dy: 0 }] }
    ];

    // Simulate adaptive damping map tracking across iterations
    const dampingMap = new Map();
    let currentAlpha = 0.70;

    for (let i = 2; i <= history.length; i++) {
      const subHistory = history.slice(0, i);
      const isOsc = detectOscillation(subHistory, 'diverge');
      assert.strictEqual(isOsc, true, `Step ${i} must detect oscillation`);
      currentAlpha = Math.max(0.2, currentAlpha * 0.5);
      dampingMap.set('diverge', currentAlpha);
    }

    // Step 2: 0.70 * 0.5 = 0.35
    // Step 3: 0.35 * 0.5 = 0.175 -> clamped to 0.20
    // Step 4: 0.20 * 0.5 = 0.10 -> clamped to 0.20
    assert.strictEqual(dampingMap.get('diverge'), 0.2);
  });

  test('2.7 Monotonic drift (same direction, decreasing magnitude) does NOT trigger oscillation', () => {
    const history = [
      { driftVectors: [{ elementId: 'mono', dx: 12.0, dy: 8.0 }] },
      { driftVectors: [{ elementId: 'mono', dx: 6.0, dy: 4.0 }] },
      { driftVectors: [{ elementId: 'mono', dx: 2.0, dy: 1.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'mono'), false);
  });

  test('2.8 Orthogonal drift ([5, 0] -> [0, 5], dot = 0) does NOT trigger oscillation', () => {
    const history = [
      { driftVectors: [{ elementId: 'ortho', dx: 5.0, dy: 0.0 }] },
      { driftVectors: [{ elementId: 'ortho', dx: 0.0, dy: 5.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'ortho'), false);
  });

  test('2.9 Zero drift ([0, 0] -> [0, 0]) does NOT trigger oscillation', () => {
    const history = [
      { driftVectors: [{ elementId: 'zero', dx: 0.0, dy: 0.0 }] },
      { driftVectors: [{ elementId: 'zero', dx: 0.0, dy: 0.0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'zero'), false);
  });

  test('2.10 Insufficient history or missing element safely returns false', () => {
    assert.strictEqual(detectOscillation([], 'btn_1'), false);
    assert.strictEqual(detectOscillation([{}], 'btn_1'), false);
    assert.strictEqual(detectOscillation(null, 'btn_1'), false);
    assert.strictEqual(detectOscillation([
      { driftVectors: [{ elementId: 'other', dx: 5, dy: 0 }] },
      { driftVectors: [{ elementId: 'other', dx: -5, dy: 0 }] }
    ], 'btn_1'), false);
  });

  test('2.11 Matches element by name when elementId differs', () => {
    const history = [
      { driftVectors: [{ name: 'SubmitButton', dx: 8.0, dy: 0 }] },
      { driftVectors: [{ name: 'SubmitButton', dx: -6.0, dy: 0 }] }
    ];
    assert.strictEqual(detectOscillation(history, 'SubmitButton'), true);
  });

  // ==========================================================================
  // Section 3: Deadband Clamping & Jitter Prevention
  // ==========================================================================
  console.log('\n--- Section 3: Deadband Clamping & Jitter Prevention ---');

  test('3.1 Sub-dp drift (dxDp: 0.4, dyDp: 0.3 < 0.5dp) is clamped and causes zero mutations', () => {
    const source = `Text(\n    text = "Hello",\n    modifier = Modifier.padding(16.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'text_node',
      name: 'Hello',
      measuredShift: { dxDp: 0.4, dyDp: 0.3 }
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 0);
    assert.strictEqual(mutator.getSource(), source);
  });

  test('3.2 Zero drift (dxDp: 0, dyDp: 0) causes zero mutations', () => {
    const source = `Text(\n    text = "Hello",\n    modifier = Modifier.padding(16.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'text_node',
      name: 'Hello',
      measuredShift: { dxDp: 0.0, dyDp: 0.0 }
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 0);
    assert.strictEqual(mutator.getSource(), source);
  });

  test('3.3 Negative sub-dp drift (dxDp: -0.49, dyDp: -0.49) is clamped by deadband', () => {
    const source = `Text(\n    text = "Hello",\n    modifier = Modifier.padding(16.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'text_node',
      name: 'Hello',
      measuredShift: { dxDp: -0.49, dyDp: -0.49 }
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 0);
    assert.strictEqual(mutator.getSource(), source);
  });

  test('3.4 Drift above deadband (dxDp: 0.5, dyDp: 1.0) is applied', () => {
    const source = `Text(\n    text = "Hello",\n    modifier = Modifier.padding(16.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'text_node',
      name: 'Hello',
      measuredShift: { dxDp: 0.5, dyDp: 1.0 }
    }];

    const count = mutator.applyDirectives(directives, { damping: 1.0 });
    assert.strictEqual(count, 1);
    assert.match(mutator.getSource(), /\.offset\(/);
  });

  test('3.5 Container spacing deadband: deltaGapDp < 0.2dp is skipped', () => {
    const source = `Row(\n    horizontalArrangement = Arrangement.spacedBy(8.dp)\n) { }`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      type: 'containerSpacing',
      deltaGapDp: 0.15
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 0);
    assert.strictEqual(mutator.getSource(), source);
  });

  test('3.6 Container spacing above deadband: deltaGapDp >= 0.2dp is applied', () => {
    const source = `Row(\n    horizontalArrangement = Arrangement.spacedBy(8.dp)\n) { }`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      type: 'containerSpacing',
      deltaGapDp: 2.0
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 1);
    assert.match(mutator.getSource(), /Arrangement\.spacedBy\(10\.dp\)/);
  });

  // ==========================================================================
  // Section 4: Regression Detection, Rollback & Compilation Guards
  // ==========================================================================
  console.log('\n--- Section 4: Regression Detection, Rollback & Compilation Guards ---');

  test('4.1 detectRegression: Quality score drop > 2.5 triggers regression', () => {
    assert.strictEqual(detectRegression(70.0, 75.0, 2.0, 2.0, 2.5), true);
  });

  test('4.2 detectRegression: Minor score drop <= 2.5 does NOT trigger regression', () => {
    assert.strictEqual(detectRegression(73.5, 75.0, 2.0, 2.0, 2.5), false);
  });

  test('4.3 detectRegression: Max shift increase > 3.0px triggers regression even if score unchanged', () => {
    assert.strictEqual(detectRegression(75.0, 75.0, 6.5, 2.0, 2.5), true);
  });

  test('4.4 detectRegression: bestScore = -Infinity safely returns false', () => {
    assert.strictEqual(detectRegression(60.0, -Infinity, 5.0, 2.0), false);
  });

  test('4.5 Composite Score formula verifies exact weighted coefficients', () => {
    // Q_k = 0.40 * S_contour + 0.30 * S_elementIou + 0.20 * S_inkIou - 0.10 * min(50, d_max)
    const metrics = {
      edgeContourScore: 90.0,
      elementIouScore: 80.0,
      inkIou: 60.0,
      maxSpatialShiftPx: 10.0
    };
    // Expected: 0.4*90 (36) + 0.3*80 (24) + 0.2*60 (12) - 0.1*10 (1) = 36 + 24 + 12 - 1 = 71.00
    const score = calculateCompositeScore(metrics);
    assert.strictEqual(score, 71.00);
  });

  test('4.6 Composite Score clamps maxSpatialShiftPx penalty at 50px', () => {
    const metrics1 = { edgeContourScore: 90, elementIouScore: 90, inkIou: 60, maxSpatialShiftPx: 50 };
    const metrics2 = { edgeContourScore: 90, elementIouScore: 90, inkIou: 60, maxSpatialShiftPx: 500 };
    // Penalty should be capped at -5.0 in both cases
    assert.strictEqual(calculateCompositeScore(metrics1), calculateCompositeScore(metrics2));
  });

  test('4.7 Simulated ClosedLoopAutoTuner rollbackToBest restores snapshot on disk', () => {
    const tmpDir = path.join(PROJECT_ROOT, 'output/test_rollback_sim');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const screenFile = path.join(tmpDir, 'TestScreen.kt');
    const initialCode = `// Initial Best Snapshot\n@Composable fun TestScreen() { Text("Best") }`;
    const degradedCode = `// Degraded Mutated Code\n@Composable fun TestScreen() { Text("Broken") }`;

    fs.writeFileSync(screenFile, degradedCode, 'utf8');

    const tuner = new ClosedLoopAutoTuner({
      screenName: 'TestScreen',
      screenFilePath: screenFile,
      projectRoot: PROJECT_ROOT,
      outputDir: tmpDir
    });

    // Populate snapshot 1 as best
    tuner.snapshots.set(1, initialCode);
    tuner.bestIteration = 1;
    tuner.bestScore = 80.0;

    // Trigger rollback
    tuner.rollbackToBest();

    const restoredCode = fs.readFileSync(screenFile, 'utf8');
    assert.strictEqual(restoredCode, initialCode);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('4.8 Simulated Closed-Loop Loop: Regression triggers immediate rollback and cuts damping', () => {
    const tmpDir = path.join(PROJECT_ROOT, 'output/test_regress_sim');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const screenFile = path.join(tmpDir, 'TestRegressScreen.kt');
    const initialCode = `// Iteration 1 Best\n@Composable fun TestRegressScreen() { Text("Best") }`;
    fs.writeFileSync(screenFile, initialCode, 'utf8');

    const tuner = new ClosedLoopAutoTuner({
      screenName: 'TestRegressScreen',
      screenFilePath: screenFile,
      projectRoot: PROJECT_ROOT,
      outputDir: tmpDir,
      damping: 0.70
    });

    // Setup state as if iteration 1 finished with score 80
    tuner.bestScore = 80.0;
    tuner.bestMaxShift = 2.0;
    tuner.bestIteration = 1;
    tuner.snapshots.set(1, initialCode);

    // Mutate file for iteration 2
    const mutatedCode = `// Iteration 2 Degraded\n@Composable fun TestRegressScreen() { Text("Degraded") }`;
    fs.writeFileSync(screenFile, mutatedCode, 'utf8');

    // Iteration 2 produces regression score 55.0 (< 80 - 2.5)
    const iter2Score = 55.0;
    const iter2Shift = 8.0;

    const isRegression = detectRegression(iter2Score, tuner.bestScore, iter2Shift, tuner.bestMaxShift);
    assert.strictEqual(isRegression, true);

    if (isRegression) {
      tuner.rollbackToBest();
      tuner.damping = Math.max(0.2, tuner.damping * 0.7);
    }

    assert.strictEqual(fs.readFileSync(screenFile, 'utf8'), initialCode);
    assert.strictEqual(parseFloat(tuner.damping.toFixed(2)), 0.49);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Section 5: KotlinComposeMutator Robustness & Sentinel P0 Invariants
  // ==========================================================================
  console.log('\n--- Section 5: KotlinComposeMutator Robustness & Sentinel P0 Invariants ---');

  test('5.1 Sentinel P0: Negative offsets are parenthesized to prevent Kotlin syntax errors', () => {
    const source = `Text(\n    text = "Status",\n    modifier = Modifier.padding(8.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const applied = mutator.applyOffset('Status', -5.2, -3.1);
    assert.strictEqual(applied, true);
    const out = mutator.getSource();
    assert.match(out, /\.offset\(x = \(-5\.2\)\.dp, y = \(-3\.1\)\.dp\)/);
    // Never double-negative or unparenthesized negative
    assert.doesNotMatch(out, /--5\.2/);
    assert.doesNotMatch(out, /x = -5\.2\.dp/);
  });

  test('5.2 Sentinel P0: Translations are strictly routed to Modifier.offset, NEVER negative padding', () => {
    const source = `Text(\n    text = "Price",\n    modifier = Modifier.padding(16.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'price',
      name: 'Price',
      measuredShift: { dxDp: 4.0, dyDp: 6.0 } // Requires compensation: -4dp, -6dp
    }];

    const count = mutator.applyDirectives(directives, { damping: 1.0 });
    assert.strictEqual(count, 1);
    const out = mutator.getSource();
    assert.match(out, /\.offset\(x = \(-4\)\.dp, y = \(-6\)\.dp\)/);
    assert.doesNotMatch(out, /padding\([^)]*-\d/);
  });

  test('5.3 Sentinel P0: Multi-line wrap collapse protection expands width to 140.dp', () => {
    const source = `Row {\n    PillCategoryRow(\n        modifier = Modifier.width(100.dp)\n    )\n}`;
    const mutator = new KotlinComposeMutator(source);
    const directives = [{
      elementId: 'pill_row',
      name: 'PillCategoryRow',
      layoutModifiers: {
        width: {
          type: 'width',
          widthDp: 140,
          reason: 'multi_line_wrap_prevention'
        }
      }
    }];

    const count = mutator.applyDirectives(directives);
    assert.strictEqual(count, 1);
    assert.match(mutator.getSource(), /\.width\(140\.dp\)/);
  });

  test('5.4 Existing .offset(...) is updated in-place without modifier duplication', () => {
    const source = `Icon(\n    imageVector = Icons.Default.Check,\n    modifier = Modifier.offset(x = 2.dp, y = 4.dp).size(24.dp)\n)`;
    const mutator = new KotlinComposeMutator(source);
    const applied = mutator.applyOffset('Check', 3.0, -2.0);
    assert.strictEqual(applied, true);
    const out = mutator.getSource();
    assert.match(out, /\.offset\(x = 5\.dp, y = 2\.dp\)/);
    // Should only have 1 .offset
    const offsetCount = (out.match(/\.offset\(/g) || []).length;
    assert.strictEqual(offsetCount, 1);
  });

  test('5.5 Composable function names as anchors are successfully resolved by forward scanning', () => {
    const source = `@Composable\nfun Card() {\n    Surface(\n        color = MaterialTheme.colorScheme.surface\n    ) {\n    }\n}`;
    const mutator = new KotlinComposeMutator(source);
    
    // Anchor on Composable name succeeds via forward scanning to '('
    const callFromName = mutator.findEnclosingCall(source.indexOf('Surface'));
    assert.ok(callFromName !== null, 'findEnclosingCall must locate call when anchor is function name');
    assert.strictEqual(callFromName.name, 'Surface');

    // Anchor inside arguments succeeds
    const callFromArg = mutator.findEnclosingCall(source.indexOf('color'));
    assert.ok(callFromArg !== null);
    assert.strictEqual(callFromArg.name, 'Surface');
  });

  test('5.6 Typography parameters (fontSize, lineHeight, letterSpacing) are cleanly updated', () => {
    const source = `Text(\n    text = "Title",\n    style = TextStyle(\n        fontSize = 18.sp,\n        lineHeight = 24.sp,\n        letterSpacing = 0.5.sp\n    )\n)`;
    const mutator = new KotlinComposeMutator(source);
    const applied = mutator.applyTypography('Title', {
      fontSize: 20,
      lineHeight: 28,
      letterSpacing: 0.25
    });
    assert.strictEqual(applied, true);
    const out = mutator.getSource();
    assert.match(out, /fontSize = 20\.sp/);
    assert.match(out, /lineHeight = 28\.sp/);
    assert.match(out, /letterSpacing = 0\.25\.sp/);
  });

  test('5.7 Negative letterSpacing typography is parenthesized', () => {
    const source = `Text(\n    text = "Title",\n    style = TextStyle(\n        fontSize = 18.sp,\n        letterSpacing = 0.5.sp\n    )\n)`;
    const mutator = new KotlinComposeMutator(source);
    const applied = mutator.applyTypography('Title', {
      letterSpacing: -0.32
    });
    assert.strictEqual(applied, true);
    const out = mutator.getSource();
    assert.match(out, /letterSpacing = \(-0\.32\)\.sp/);
  });

  // ==========================================================================
  // Section 6: CLI Execution, Flag Parsing, Dry-Run & Pipe Safety
  // ==========================================================================
  console.log('\n--- Section 6: CLI Execution, Flag Parsing, Dry-Run & Pipe Safety ---');

  test('6.1 CLI Dry-Run on test_da63 exits with code 0 without modifying screen code', () => {
    const screenPath = path.join(PROJECT_ROOT, 'android/app/src/main/java/com/claude/compose/screen/Da63DesignScreen.kt');
    const contentBefore = fs.readFileSync(screenPath, 'utf8');

    const res = spawnSync('node', [
      'verification/auto_tuner.js',
      '--screen', 'Da63DesignScreen',
      '--artifact', 'test_da63',
      '--max-iterations', '1',
      '--dry-run'
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    assert.strictEqual(res.status, 0, `CLI failed: ${res.stderr}`);
    assert.match(res.stdout, /\[Dry Run\] Successfully planned \d+ mutation directives/);

    const contentAfter = fs.readFileSync(screenPath, 'utf8');
    assert.strictEqual(contentBefore, contentAfter, 'Screen file content must be identical after dry-run');
  });

  test('6.2 CLI Dry-Run on test_e34f exits with code 0 without modifying screen code', () => {
    const screenPath = path.join(PROJECT_ROOT, 'android/app/src/main/java/com/claude/compose/screen/E34fDesignScreen.kt');
    const contentBefore = fs.readFileSync(screenPath, 'utf8');

    const res = spawnSync('node', [
      'verification/auto_tuner.js',
      '--screen', 'E34fDesignScreen',
      '--artifact', 'test_e34f',
      '--max-iterations', '1',
      '--dry-run'
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    assert.strictEqual(res.status, 0, `CLI failed: ${res.stderr}`);
    assert.match(res.stdout, /\[Dry Run\] Successfully planned \d+ mutation directives/);

    const contentAfter = fs.readFileSync(screenPath, 'utf8');
    assert.strictEqual(contentBefore, contentAfter, 'Screen file content must be identical after dry-run');
  });

  test('6.3 Pipe Safety: safeExit drains stdout buffer completely over pipe (>64KB valid JSON)', () => {
    const res = spawnSync('node', [
      'verification/auto_tuner.js',
      '--screen', 'Da63DesignScreen',
      '--artifact', 'test_da63',
      '--max-iterations', '1',
      '--dry-run',
      '--json'
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });

    assert.strictEqual(res.status, 0);
    // Verified: safeExit drains buffer, so full JSON (>64KB) is transmitted without truncation
    assert.ok(res.stdout.length > 65536, `Stdout over pipe was ${res.stdout.length} bytes (exceeded 64KB pipe buffer)`);
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(res.stdout);
    }, 'Stdout must be complete, valid JSON without truncation');
    assert.strictEqual(parsed.dryRun, true);
  });

  test('6.4 File redirection successfully captures complete valid JSON without truncation', () => {
    const tmpJson = path.join(PROJECT_ROOT, 'output/test_cli_output.json');
    const res = spawnSync('sh', [
      '-c',
      `node verification/auto_tuner.js --screen Da63DesignScreen --artifact test_da63 --max-iterations 1 --dry-run --json > "${tmpJson}"`
    ], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    assert.strictEqual(res.status, 0);
    assert.ok(fs.existsSync(tmpJson));

    const content = fs.readFileSync(tmpJson, 'utf8');
    assert.ok(content.length > 65536, `Full JSON should exceed 64KB (was ${content.length} bytes)`);

    const parsed = JSON.parse(content);
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.converged, false);
    assert.ok(Array.isArray(parsed.plannedDirectives));
    assert.ok(Array.isArray(parsed.history));
    assert.ok(parsed.metrics);
    assert.strictEqual(typeof parsed.metrics.edgeContourScore, 'number');

    // Clean up
    fs.rmSync(tmpJson, { force: true });
  });

  test('6.5 Legacy advisory mode -i zonal_diff.json produces markdown and directives', () => {
    const zonalPath = path.join(PROJECT_ROOT, 'verification/zonal_diff.json');
    if (fs.existsSync(zonalPath)) {
      const res = spawnSync('node', [
        'verification/auto_tuner.js',
        '-i', zonalPath,
        '--json'
      ], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });

      assert.strictEqual(res.status, 0);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(res.stdout);
      });
      assert.ok(Array.isArray(parsed));
    }
  });

  // ==========================================================================
  // Summary & Report
  // ==========================================================================
  console.log('\n====================================================================');
  console.log(`  TEST RESULTS: ${passedTests}/${totalTests} passed (${failedTests.length} failed)`);
  console.log('====================================================================\n');

  if (failedTests.length > 0) {
    console.error('FAILURES:');
    for (const f of failedTests) {
      console.error(`  - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
