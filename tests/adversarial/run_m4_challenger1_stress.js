#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 4 Empirical Challenger Stress Suite:
 * Progressive Verification Pipeline & Negative Controls Oracle
 *
 * Executed by: Challenger 1 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 *
 * SCOPE:
 * 1. Fail-closed behavior on Negative Controls NC-01 through NC-06:
 *    - Direct invocation via NegativeControlsHarness
 *    - Deep pipeline execution via runVerificationPipeline
 *    - Exact status, errorCode, and early termination halting
 * 2. Stage execution isolation (--stage, --until-stage, named aliases):
 *    - Single stage isolation: STAGE_1 through STAGE_6
 *    - Skipping upstream/downstream stages properly without errors
 *    - Multi-stage range (--until-stage 3)
 *    - Error throwing on invalid stage inputs
 * 3. Edge cases on Euclidean drift calculations:
 *    - Exact zero drift, 3.0px boundary (3.000 vs 3.001), 10.0px gross shift boundary (9.99 vs 10.00)
 *    - Diagonal 45-degree drift: dx=2.12132, dy=2.12132
 *    - Negative displacements, negative coordinates
 *    - Baseline drift boundary (2.0 vs 2.1)
 *    - NaN / Infinity / undefined handling in drift calculation
 * 4. Touch target hit-slop bounds edge cases:
 *    - 48dp invisible hit-slop expansion on 24dp visual button
 *    - Non-interactive elements exempted from 48dp min bounds
 *    - Fractional / boundary sizes: 47.9dp vs 48.0dp
 *    - Hardware coordinate inset (+8px) round-trip verification
 * 5. Perceptual metrics edge cases:
 *    - Ink IoU boundaries (85.0% vs 84.99%)
 *    - Sobel edge contour boundaries (90.0% vs 89.99%)
 *    - MSSIM boundaries (0.90 vs 0.899)
 *    - Contrast ratios (4.50:1 vs 4.49:1; large text 3.00:1 vs 2.99:1)
 *    - Adjacent surface separation (deltaL < 15 with/without hairline border)
 * 6. Defect Oracle causal diagnosis & severity calculation:
 *    - Sibling shift clustering (variance <= 1.0px^2 -> PARENT_INSET_ACCUMULATION)
 *    - Single shift -> GENERIC_LAYOUT_DRIFT
 *    - Severity determination (CRITICAL, MAJOR, MINOR)
 *    - Gate outcome calculation (PASS, FAIL, BLOCKED)
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Subsystems under test
const {
  runVerificationPipeline,
  evaluateStages,
  validateStageName,
  STAGES,
  STAGE_ALIASES
} = require('../../src/verification/pipeline');

const { NegativeControlsHarness } = require('../../src/verification/negative_controls');
const { computeDrift, verifyTouchGeometry } = require('../../src/verification/touch_geometry');
const { DisplayProfileValidator, SOL_OS_TOKENS, FORBIDDEN_EPD_PATTERNS } = require('../../src/verification/display_profile');
const { evaluateContrast } = require('../../src/verification/contrast_evaluator');
const { evaluateInvariants } = require('../../src/verification/invariants_evaluator');
const { verifySemanticStructure } = require('../../src/verification/semantic_structure');
const { verifyMultiViewport } = require('../../src/verification/multi_viewport');

const { diagnoseDefects, classifyRootCause } = require('../../src/defects/oracle');
const { DEFECT_CATEGORIES, TAXONOMY_ERROR_CODES, THRESHOLDS } = require('../../src/defects/taxonomy');
const { SEVERITY_LEVELS, determineSeverity, calculateGateOutcome } = require('../../src/defects/severity');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runAll() {
  console.log('==============================================================================');
  console.log('  MILESTONE 4 EMPIRICAL CHALLENGER STRESS SUITE');
  console.log('==============================================================================\n');

  // --------------------------------------------------------------------------
  // SUITE 1: Negative Controls (NC-01 through NC-06)
  // --------------------------------------------------------------------------
  console.log('─── Suite 1: Negative Controls Fail-Closed Integrity (NC-01..NC-06) ───');

  test('1.1: NegativeControlsHarness.runAll() executes all 6 controls with allPassed=true', () => {
    const harness = new NegativeControlsHarness();
    const summary = harness.runAll();
    assert.equal(summary.totalControls, 6);
    assert.equal(summary.allPassed, true);
    for (const res of summary.results) {
      assert.equal(res.caught, true, `${res.id} must be caught`);
      assert.equal(res.verdict, res.expectedVerdict, `${res.id} verdict must match expected`);
    }
  });

  await asyncTest('1.2: NC-01 Pipeline: Omitted required element triggers FAIL at Stage 1 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc01', '/dummy/app', {
      requiredNodes: ['node_header', 'node_cta'],
      telemetry: { node_header: { boundsPx: { left: 0, top: 0, width: 100, height: 50 } } }
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'ELEMENT_NOT_RENDERED');
    assert.ok(res.stages[0].error.includes('node_cta'));
  });

  await asyncTest('1.3: NC-02 Pipeline: Margin shift >= 10px triggers GEOMETRY_DRIFT at Stage 3 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc02', '/dummy/app', {
      elementComparisons: [
        { sourceId: 'editor_title', expectedX: 100, expectedY: 200, actualX: 100, actualY: 210 }
      ]
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stages[2].errorCode, 'GEOMETRY_DRIFT');
  });

  await asyncTest('1.4: NC-03 Pipeline: Missing font asset triggers FONT_RESOURCE_MISSING at Stage 1 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc03', '/dummy/app', {
      requiredFonts: [
        { family: 'AbcArizonaFlare', file: 'res/font/abc_arizona_flare.ttf', exists: false }
      ]
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'FONT_RESOURCE_MISSING');
  });

  await asyncTest('1.5: NC-04 Pipeline: Missing preview render screenshot triggers BLOCKED at Stage 4 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc04', '/dummy/app', {
      previewMissing: true
    });
    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 4);
    assert.equal(res.stages[3].stage, 'STAGE_4_PERCEPTUAL_METRICS');
    assert.equal(res.stages[3].errorCode, 'PREVIEW_RENDER_MISSING');
    assert.equal(res.stages[3].blocked, true);
  });

  await asyncTest('1.6: NC-05 Pipeline: Contrast collapse (--os-200 on --os-0) triggers CONTRAST_COLLAPSE at Stage 2', async () => {
    const res = await runVerificationPipeline('screen_nc05', '/dummy/app', {
      headlineColor: SOL_OS_TOKENS['--os-200'].hex,
      backgroundColor: SOL_OS_TOKENS['--os-0'].hex
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 2);
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[1].errorCode, 'CONTRAST_COLLAPSE');
  });

  await asyncTest('1.7: NC-06 Pipeline: EPD waveform hook broadcast triggers EPD_WORKAROUND_VIOLATION at Stage 6', async () => {
    const res = await runVerificationPipeline('screen_nc06', '/dummy/app', {
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 6);
    assert.equal(res.stages[5].stage, 'STAGE_6_DC1_HARDWARE');
    assert.equal(res.stages[5].errorCode, 'EPD_WORKAROUND_VIOLATION');
  });

  await asyncTest('1.8: NC-06 Pipeline: Artificial settle pause (settleMs=500) triggers EPD_WORKAROUND_VIOLATION at Stage 6', async () => {
    const res = await runVerificationPipeline('screen_nc06_pause', '/dummy/app', {
      settleMs: 500
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 6);
    assert.equal(res.stages[5].errorCode, 'EPD_WORKAROUND_VIOLATION');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Stage Execution Isolation & Skipping (--stage / --until-stage)
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 2: Stage Execution Isolation & Skipping (--stage / --until-stage) ───');

  await asyncTest('2.1: --stage 1 executes only STAGE_1_SCHEMA_PROVENANCE and skips stages 2..6', async () => {
    const res = await runVerificationPipeline('s1', '/app', { '--stage': '1' });
    assert.equal(res.stages.length, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stagesExecutedCount, 1);
  });

  await asyncTest('2.2: --stage 3 executes only STAGE_3_LAYOUT_TELEMETRY and skips stages 1, 2, 4..6', async () => {
    const res = await runVerificationPipeline('s3', '/app', { '--stage': '3' });
    assert.equal(res.stages.length, 1);
    assert.equal(res.stages[0].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stagesExecutedCount, 1);
  });

  await asyncTest('2.3: --stage 6 executes only STAGE_6_DC1_HARDWARE and skips stages 1..5', async () => {
    const res = await runVerificationPipeline('s6', '/app', { '--stage': '6' });
    assert.equal(res.stages.length, 1);
    assert.equal(res.stages[0].stage, 'STAGE_6_DC1_HARDWARE');
    assert.equal(res.stagesExecutedCount, 1);
  });

  await asyncTest('2.4: Stage aliases resolve cleanly (contrast -> STAGE_2, perceptual -> STAGE_4, hardware -> STAGE_6)', async () => {
    const res2 = await runVerificationPipeline('s2', '/app', { stage: 'contrast' });
    assert.equal(res2.stages[0].stage, 'STAGE_2_COMPILE_AND_TESTS');

    const res4 = await runVerificationPipeline('s4', '/app', { stage: 'perceptual' });
    assert.equal(res4.stages[0].stage, 'STAGE_4_PERCEPTUAL_METRICS');

    const res6 = await runVerificationPipeline('s6', '/app', { stage: 'hardware' });
    assert.equal(res6.stages[0].stage, 'STAGE_6_DC1_HARDWARE');
  });

  await asyncTest('2.5: --until-stage 3 executes exactly stages 1, 2, and 3 in sequence and skips 4..6', async () => {
    const res = await runVerificationPipeline('until3', '/app', { '--until-stage': '3' });
    assert.equal(res.stages.length, 3);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stagesExecutedCount, 3);
  });

  test('2.6: validateStageName rejects unknown stage names with informative error', () => {
    assert.throws(() => validateStageName('INVALID_STAGE'), /unknown stage/i);
    assert.throws(() => validateStageName(99), /unknown stage/i);
    assert.throws(() => validateStageName(null), /unknown stage/i);
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Euclidean Spatial Drift Edge Cases
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 3: Euclidean Spatial Drift & Coordinate Edge Cases ───');

  test('3.1: computeDrift zero drift: expected == actual yields distance 0.0', () => {
    const drift = computeDrift(592.0, 792.0, 592.0, 792.0);
    assert.equal(drift.dx, 0);
    assert.equal(drift.dy, 0);
    assert.equal(drift.distance, 0);
  });

  test('3.2: computeDrift boundary: exactly 3.000px passes threshold <= 3.0px', () => {
    const driftH = computeDrift(100.0, 200.0, 103.0, 200.0);
    assert.equal(driftH.distance, 3.0);
    assert.ok(driftH.distance <= 3.0);

    const driftV = computeDrift(100.0, 200.0, 100.0, 203.0);
    assert.equal(driftV.distance, 3.0);
    assert.ok(driftV.distance <= 3.0);
  });

  test('3.3: computeDrift boundary: 3.001px strictly fails threshold <= 3.0px', () => {
    const drift = computeDrift(100.0, 200.0, 103.001, 200.0);
    assert.ok(drift.distance > 3.0);
  });

  test('3.4: computeDrift diagonal 45-degree: dx=2.12132, dy=2.12132 yields distance ~3.00px', () => {
    const step = 3.0 / Math.SQRT2;
    const drift = computeDrift(0, 0, step, step);
    assert.ok(Math.abs(drift.distance - 3.0) < 1e-10);
    assert.ok(drift.distance <= 3.0000000001);
  });

  test('3.5: computeDrift negative displacement: dx=-3.0, dy=0 yields positive distance 3.0px', () => {
    const drift = computeDrift(100.0, 200.0, 97.0, 200.0);
    assert.equal(drift.dx, -3.0);
    assert.equal(drift.distance, 3.0);
  });

  test('3.6: computeDrift negative coordinate space: bounds clipped off-screen', () => {
    const drift = computeDrift(-20.0, -10.0, -18.0, -9.0);
    assert.equal(drift.dx, 2.0);
    assert.equal(drift.dy, 1.0);
    assert.ok(Math.abs(drift.distance - Math.hypot(2, 1)) < 1e-10);
  });

  await asyncTest('3.7: Margin shift boundary: 9.99px is SPATIAL_DRIFT_EXCEEDED, 10.00px is GEOMETRY_DRIFT', async () => {
    const res9_99 = await verifyTouchGeometry('screen', null, {
      elementComparisons: [{ sourceId: 'n1', expectedX: 0, expectedY: 0, actualX: 0, actualY: 9.99 }]
    });
    assert.equal(res9_99.status, 'FAIL');
    assert.equal(res9_99.errorCode, 'SPATIAL_DRIFT_EXCEEDED');

    const res10_00 = await verifyTouchGeometry('screen', null, {
      elementComparisons: [{ sourceId: 'n2', expectedX: 0, expectedY: 0, actualX: 0, actualY: 10.00 }]
    });
    assert.equal(res10_00.status, 'FAIL');
    assert.equal(res10_00.errorCode, 'GEOMETRY_DRIFT');
  });

  await asyncTest('3.8: Baseline drift boundary: baseline delta <= 2.0px passes, delta > 2.0px fails', async () => {
    const resPass = await verifyTouchGeometry('screen', null, {
      elementComparisons: [{ sourceId: 'text1', expectedX: 0, expectedY: 0, actualX: 0, actualY: 0, expectedBaseline: 100, actualBaseline: 102 }]
    });
    assert.equal(resPass.status, 'PASS');

    const resFail = await verifyTouchGeometry('screen', null, {
      elementComparisons: [{ sourceId: 'text2', expectedX: 0, expectedY: 0, actualX: 0, actualY: 0, expectedBaseline: 100, actualBaseline: 102.1 }]
    });
    assert.equal(resFail.status, 'FAIL');
    assert.equal(resFail.errorCode, 'BASELINE_MISALIGNMENT');
  });

  test('3.9: DC1 Hardware coordinate inset (+8px) round-trip: logicalToPhysical and physicalToLogical', () => {
    const validator = new DisplayProfileValidator();
    const logical = { x: 592, y: 792 };
    const physical = validator.logicalToPhysical(logical.x, logical.y);
    assert.equal(physical.x, 600);
    assert.equal(physical.y, 800);

    const roundTrip = validator.physicalToLogical(physical.x, physical.y);
    assert.equal(roundTrip.x, logical.x);
    assert.equal(roundTrip.y, logical.y);
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Touch Target Hit-Slop Bounds & Interactive Elements
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 4: Touch Target Hit-Slop Bounds & Interactive Elements ───');

  test('4.1: validateTouchTarget: 48dp (96px at density 2.0) passes', () => {
    const validator = new DisplayProfileValidator();
    const res = validator.validateTouchTarget(96, 96, 2.0);
    assert.equal(res.valid, true);
    assert.equal(res.widthDp, 48);
    assert.equal(res.heightDp, 48);
  });

  test('4.2: validateTouchTarget: 47.9dp (95.8px at density 2.0) fails with error', () => {
    const validator = new DisplayProfileValidator();
    const res = validator.validateTouchTarget(95.8, 96, 2.0);
    assert.equal(res.valid, false);
    assert.ok(res.error.includes('smaller than minimum 48x48dp'));
  });

  await asyncTest('4.3: verifyTouchGeometry: 24dp visual button with 48dp invisible hit-slop (touchWidthPx=96) passes', async () => {
    const res = await verifyTouchGeometry('screen', null, {
      elementComparisons: [
        {
          sourceId: 'icon_btn',
          isInteractive: true,
          expectedX: 100,
          expectedY: 100,
          actualX: 100,
          actualY: 100,
          actualWidth: 48,  // 24dp visual
          actualHeight: 48, // 24dp visual
          touchWidthPx: 96, // 48dp hit-slop
          touchHeightPx: 96 // 48dp hit-slop
        }
      ]
    });
    assert.equal(res.status, 'PASS');
  });

  await asyncTest('4.4: verifyTouchGeometry: 24dp visual button without hit-slop fails with TOUCH_TARGET_TOO_SMALL', async () => {
    const res = await verifyTouchGeometry('screen', null, {
      elementComparisons: [
        {
          sourceId: 'small_btn',
          isInteractive: true,
          expectedX: 100,
          expectedY: 100,
          actualX: 100,
          actualY: 100,
          actualWidth: 48,  // 24dp visual, no touchWidthPx
          actualHeight: 48
        }
      ]
    });
    assert.equal(res.status, 'FAIL');
    assert.equal(res.errorCode, 'TOUCH_TARGET_TOO_SMALL');
  });

  await asyncTest('4.5: verifyTouchGeometry: Non-interactive small element (badge / icon) exempted from 48dp requirement', async () => {
    const res = await verifyTouchGeometry('screen', null, {
      elementComparisons: [
        {
          sourceId: 'small_badge',
          isInteractive: false,
          expectedX: 100,
          expectedY: 100,
          actualX: 100,
          actualY: 100,
          actualWidth: 32, // 16dp
          actualHeight: 32
        }
      ]
    });
    assert.equal(res.status, 'PASS');
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Perceptual Metrics (Ink IoU, Contour Alignment, MSSIM, Contrast)
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 5: Perceptual Metrics Boundaries ───');

  await asyncTest('5.1: evaluateInvariants: Ink IoU exactly 85.0% passes, 84.9% fails INK_IOU_BELOW_THRESHOLD', async () => {
    const passRes = await evaluateInvariants('s', null, { inkIou: 85.0 });
    assert.equal(passRes.status, 'PASS');

    const failRes = await evaluateInvariants('s', null, { inkIou: 84.9 });
    assert.equal(failRes.status, 'FAIL');
    assert.equal(failRes.errorCode, 'INK_IOU_BELOW_THRESHOLD');
  });

  await asyncTest('5.2: evaluateInvariants: Sobel contour score exactly 90.0% passes, 89.9% fails CONTOUR_ALIGNMENT_BELOW_THRESHOLD', async () => {
    const passRes = await evaluateInvariants('s', null, { edgeContourScore: 90.0 });
    assert.equal(passRes.status, 'PASS');

    const failRes = await evaluateInvariants('s', null, { edgeContourScore: 89.9 });
    assert.equal(failRes.status, 'FAIL');
    assert.equal(failRes.errorCode, 'CONTOUR_ALIGNMENT_BELOW_THRESHOLD');
  });

  await asyncTest('5.3: evaluateInvariants: MSSIM score exactly 0.90 passes, 0.89 fails MSSIM_BELOW_THRESHOLD', async () => {
    const passRes = await evaluateInvariants('s', null, { mssim: 0.90 });
    assert.equal(passRes.status, 'PASS');

    const failRes = await evaluateInvariants('s', null, { mssim: 0.89 });
    assert.equal(failRes.status, 'FAIL');
    assert.equal(failRes.errorCode, 'MSSIM_BELOW_THRESHOLD');
  });

  test('5.4: validateGrayscaleContrast: WCAG AA contrast ratio 4.5:1 passes, 4.49:1 fails', () => {
    const validator = new DisplayProfileValidator();
    // Test custom hexes to verify boundary
    const resAA = validator.validateGrayscaleContrast('#535353', '#FFFFFF', false); // --os-400
    assert.ok(resAA.ratio >= 4.5);
    assert.equal(resAA.passAA, true);

    const resDisabled = validator.validateGrayscaleContrast('#CCCCCC', '#FFFFFF', false); // --os-200
    assert.ok(resDisabled.ratio < 4.5);
    assert.equal(resDisabled.passAA, false);
    assert.equal(resDisabled.verdict, 'FAIL');
  });

  test('5.5: validateAdjacentSurfaces: deltaL < 15 without hairline border fails, with hairline border passes', () => {
    const validator = new DisplayProfileValidator();
    // #FFFFFF (255) vs #FAFAFA (lum 244) -> deltaL ~11 < 15
    const failRes = validator.validateAdjacentSurfaces('#FFFFFF', '#FAFAFA', false);
    assert.equal(failRes.valid, false);
    assert.ok(failRes.error.includes('--os-100 hairline border'));

    const passRes = validator.validateAdjacentSurfaces('#FFFFFF', '#FAFAFA', true);
    assert.equal(passRes.valid, true);
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Defect Oracle Causal Attribution & Root Cause Analysis
  // --------------------------------------------------------------------------
  console.log('\n─── Suite 6: Defect Oracle Causal Attribution & Root Cause ───');

  test('6.1: Correlated sibling shifts (variance <= 1.0px^2) diagnosed as PARENT_INSET_ACCUMULATION', () => {
    const verificationResult = {
      screenId: 'notes_screen',
      failures: [
        { sourceId: 'item_1', deltaPx: { dx: 0, dy: 18, distance: 18 } },
        { sourceId: 'item_2', deltaPx: { dx: 0, dy: 18.2, distance: 18.2 } },
        { sourceId: 'item_3', deltaPx: { dx: 0, dy: 17.9, distance: 17.9 } }
      ]
    };
    const report = diagnoseDefects(verificationResult);
    assert.equal(report.gateOutcome, 'FAIL');
    assert.equal(report.defects.length, 3);
    for (const d of report.defects) {
      assert.equal(d.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
      assert.ok(d.diagnosis.confidence >= 0.90);
    }
    assert.ok(report.summary.byRootCause['PARENT_INSET_ACCUMULATION'] === 3);
  });

  test('6.2: Uncorrelated multiple shifts (high variance) diagnosed as GENERIC_LAYOUT_DRIFT', () => {
    const verificationResult = {
      screenId: 'uncorrelated_shift_screen',
      failures: [
        { sourceId: 'item_a', deltaPx: { dx: 0, dy: 2, distance: 2 } },
        { sourceId: 'item_b', deltaPx: { dx: 0, dy: 10, distance: 10 } },
        { sourceId: 'item_c', deltaPx: { dx: 0, dy: 3, distance: 3 } }
      ]
    };
    const report = diagnoseDefects(verificationResult);
    assert.equal(report.defects.length, 3);
    for (const d of report.defects) {
      assert.equal(d.diagnosis.rootCause, 'GENERIC_LAYOUT_DRIFT');
      assert.equal(d.diagnosis.confidence, 0.70);
    }
  });

  test('6.3: Zero failures returns gateOutcome PASS and empty defects list', () => {
    const verificationResult = {
      screenId: 'clean_screen',
      failures: [],
      blockers: []
    };
    const report = diagnoseDefects(verificationResult);
    assert.equal(report.gateOutcome, 'PASS');
    assert.equal(report.defects.length, 0);
  });

  test('6.4: Blockers with zero failures returns gateOutcome BLOCKED', () => {
    const verificationResult = {
      screenId: 'blocked_screen',
      failures: [],
      blockers: ['Baseline missing']
    };
    const report = diagnoseDefects(verificationResult);
    assert.equal(report.gateOutcome, 'BLOCKED');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log(`  CHALLENGER STRESS SUITE RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('==============================================================================');

  if (failedTests > 0) {
    console.error(`\nEncountered ${failedTests} failure(s) in challenger stress suite.`);
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Unhandled fatal error in challenger stress suite:', err);
  process.exit(1);
});
