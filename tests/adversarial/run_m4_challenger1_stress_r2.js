#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 4 Challenger 1 R2: In-Depth Empirical Stress Suite
 * Progressive Verification Pipeline & Negative Controls Oracle
 *
 * Authored by: Milestone 4 Challenger 1 R2 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 *
 * CORE OBJECTIVES:
 * 1. Verify NC-01 through NC-06 execute through actual stage logic and return
 *    deterministic failures and halt downstream stages (fail-closed).
 * 2. Verify missing evidence returns status: BLOCKED without fabricating scores.
 * 3. Verify touch geometry and display profile edge cases (non-finite coordinates,
 *    sub-pixel thresholds, 48dp hit-slop, discrete 8-bit grayscale surfaces,
 *    +8px hardware inset).
 * 4. Verify Ajv Draft 2020-12 schema conformance for all generated reports.
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

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

// Ajv Draft 2020-12 Setup
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const verifSchemaPath = path.resolve(__dirname, '../../src/verification/schemas/verification_report.json');
const verifSchemaAltPath = path.resolve(__dirname, '../../src/verification/verification-report.schema.json');
const defectSchemaPath = path.resolve(__dirname, '../../src/defects/schemas/defect_report.json');
const defectSchemaAltPath = path.resolve(__dirname, '../../src/defects/defect-report.schema.json');

const validateVerifReport = ajv.compile(JSON.parse(fs.readFileSync(verifSchemaPath, 'utf8')));
const validateVerifReportAlt = ajv.compile(JSON.parse(fs.readFileSync(verifSchemaAltPath, 'utf8')));
const validateDefectReport = ajv.compile(JSON.parse(fs.readFileSync(defectSchemaPath, 'utf8')));
const validateDefectReportAlt = ajv.compile(JSON.parse(fs.readFileSync(defectSchemaAltPath, 'utf8')));

function assertValidReports(verifReport, defectReport, label = '') {
  if (verifReport) {
    const v1 = validateVerifReport(verifReport);
    if (!v1) console.error(`VerifSchema Error [${label}]:`, validateVerifReport.errors);
    assert.equal(v1, true, `Verification report must match schema [${label}]`);

    const v2 = validateVerifReportAlt(verifReport);
    if (!v2) console.error(`VerifSchemaAlt Error [${label}]:`, validateVerifReportAlt.errors);
    assert.equal(v2, true, `Verification report must match alt schema [${label}]`);
  }

  if (defectReport) {
    const d1 = validateDefectReport(defectReport);
    if (!d1) console.error(`DefectSchema Error [${label}]:`, validateDefectReport.errors);
    assert.equal(d1, true, `Defect report must match schema [${label}]`);

    const d2 = validateDefectReportAlt(defectReport);
    if (!d2) console.error(`DefectSchemaAlt Error [${label}]:`, validateDefectReportAlt.errors);
    assert.equal(d2, true, `Defect report must match alt schema [${label}]`);
  }
}

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
  console.log('  MILESTONE 4 CHALLENGER 1 R2: DEEP EMPIRICAL STRESS SUITE');
  console.log('==============================================================================\n');

  // ==========================================================================
  // SECTION 1: Negative Controls NC-01 through NC-06 via Actual Stage Execution
  // ==========================================================================
  console.log('─── Section 1: Negative Controls NC-01..NC-06 Through Actual Stages ───');

  // NC-01: Missing Element in Stage 1
  await asyncTest('NC-01.1: Missing element causes Stage 1 failure and stops downstream stages from running', async () => {
    const res = await runVerificationPipeline('screen_nc01_deep', '/dummy/app', {
      requiredNodes: ['node_a', 'node_b', 'node_c'],
      telemetry: {
        node_a: { boundsPx: { left: 0, top: 0, width: 50, height: 50 } },
        node_c: { boundsPx: { left: 50, top: 0, width: 50, height: 50 } }
      }
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'ELEMENT_NOT_RENDERED');
    assert.ok(res.stages[0].error.includes('node_b'));
    assert.deepEqual(res.stages[0].evidence.missingNodes, ['node_b']);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects.length, 1);
    assert.equal(dr.defects[0].sourceId, 'node_b');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'ELEMENT_NOT_RENDERED');
    assert.equal(dr.defects[0].severity, 'CRITICAL');

    assertValidReports(res, dr, 'NC-01.1');
  });

  // NC-02: Margin Shift >= 10px in Stage 3
  await asyncTest('NC-02.1: Margin shift of exactly 10.00px triggers GEOMETRY_DRIFT at Stage 3 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc02_exact', '/dummy/app', {
      elementComparisons: [
        { sourceId: 'editor_title', expectedX: 100, expectedY: 200, actualX: 100, actualY: 210.0 }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stages[2].errorCode, 'GEOMETRY_DRIFT');
    assert.equal(res.stages[2].evidence.maxSpatialShiftPx, 10.0);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'editor_title');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'HARD_MARGIN_SHIFT_VETO');

    assertValidReports(res, dr, 'NC-02.1');
  });

  await asyncTest('NC-02.2: Spatial drift at 3.01px triggers SPATIAL_DRIFT_EXCEEDED at Stage 3', async () => {
    const res = await runVerificationPipeline('screen_nc02_drift', '/dummy/app', {
      elementComparisons: [
        { sourceId: 'editor_title', expectedX: 100, expectedY: 200, actualX: 103.01, actualY: 200 }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages[2].errorCode, 'SPATIAL_DRIFT_EXCEEDED');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].severity, 'MAJOR');

    assertValidReports(res, dr, 'NC-02.2');
  });

  // NC-03: Missing Font Asset in Stage 1
  await asyncTest('NC-03.1: Missing font asset physically flags FONT_RESOURCE_MISSING in Stage 1 and halts pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc03_font', '/dummy/app', {
      requiredFonts: [
        { family: 'AbcArizonaFlare', file: 'res/font/abc_arizona_flare.ttf', exists: false }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'FONT_RESOURCE_MISSING');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'ASSET_RESOURCE_MISSING');

    assertValidReports(res, dr, 'NC-03.1');
  });

  // NC-04: Missing Preview Evidence -> BLOCKED in Stage 4
  await asyncTest('NC-04.1: Missing preview render screenshot causes BLOCKED in Stage 4 and stops pipeline', async () => {
    const res = await runVerificationPipeline('screen_nc04_prev', '/dummy/app', {
      previewMissing: true
    });

    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 4);
    assert.equal(res.stages[3].stage, 'STAGE_4_PERCEPTUAL_METRICS');
    assert.equal(res.stages[3].status, 'BLOCKED');
    assert.equal(res.stages[3].errorCode, 'PREVIEW_RENDER_MISSING');

    // Summary must not invent passing scores
    assert.equal(res.summary.inkIouPercentage, null);
    assert.equal(res.summary.sobelContourPercentage, null);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'PREVIEW_RENDER_MISSING');

    assertValidReports(res, dr, 'NC-04.1');
  });

  // NC-05: Contrast Collapse in Stage 2
  await asyncTest('NC-05.1: Low contrast text (--os-200 on --os-0) fails at Stage 2 with CONTRAST_COLLAPSE', async () => {
    const res = await runVerificationPipeline('screen_nc05_contrast', '/dummy/app', {
      contrastPairs: [
        {
          sourceId: 'caption_label',
          role: 'caption',
          foregroundHex: SOL_OS_TOKENS['--os-200'].hex,
          backgroundHex: SOL_OS_TOKENS['--os-0'].hex,
          isLargeText: false
        }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 2);
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[1].errorCode, 'CONTRAST_COLLAPSE');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'caption_label');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'CONTRAST_DEFICIT');

    assertValidReports(res, dr, 'NC-05.1');
  });

  // NC-06: Forbidden EPD Waveform Workarounds in Stage 6
  await asyncTest('NC-06.1: ACTION_REFRESH_SCREEN broadcast fails Stage 6 with EPD_WORKAROUND_VIOLATION', async () => {
    const res = await runVerificationPipeline('screen_nc06_epd', '/dummy/app', {
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 6);
    assert.equal(res.stages[5].stage, 'STAGE_6_DC1_HARDWARE');
    assert.equal(res.stages[5].errorCode, 'EPD_WORKAROUND_VIOLATION');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');

    assertValidReports(res, dr, 'NC-06.1');
  });

  await asyncTest('NC-06.2: All forbidden EPD patterns trigger failure in DisplayProfileValidator', async () => {
    const validator = new DisplayProfileValidator();
    for (const pattern of FORBIDDEN_EPD_PATTERNS) {
      const code = `// Testing pattern: ${pattern}\nval x = "${pattern}"`;
      const check = validator.assertNoEpdWorkarounds(code);
      assert.equal(check.pass, false, `Pattern "${pattern}" must be rejected`);
      assert.ok(check.error.includes(pattern));
    }
  });

  await asyncTest('NC-06.3: Thread.sleep(500) and greater triggers EPD workaround violation', async () => {
    const validator = new DisplayProfileValidator();
    const check500 = validator.assertNoEpdWorkarounds('Thread.sleep(500)');
    assert.equal(check500.pass, false);

    const check1000 = validator.assertNoEpdWorkarounds('Thread.sleep(1000)');
    assert.equal(check1000.pass, false);

    const check150 = validator.assertNoEpdWorkarounds('Thread.sleep(150)');
    assert.equal(check150.pass, true);
  });

  // ==========================================================================
  // SECTION 2: Missing Evidence Returns BLOCKED Without Fabricating Scores
  // ==========================================================================
  console.log('\n─── Section 2: Missing Evidence Fail-Closed & Non-Fabrication ───');

  await asyncTest('2.1: Calling runVerificationPipeline on blank screen without contract returns BLOCKED at Stage 1', async () => {
    const res = await runVerificationPipeline('screen_completely_blank', 'fixtures/note-app');
    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].status, 'BLOCKED');
    assert.equal(res.stages[0].errorCode, 'CONTRACT_EVIDENCE_MISSING');

    // Verify all summary metrics are null (no fabricated 92.4% / 94.8% / 15.65)
    assert.equal(res.summary.elementsEvaluatedCount, null);
    assert.equal(res.summary.maxSpatialShiftPx, null);
    assert.equal(res.summary.minContrastRatio, null);
    assert.equal(res.summary.inkIouPercentage, null);
    assert.equal(res.summary.sobelContourPercentage, null);
    assert.equal(res.summary.invariantsPassed, null);
    assert.equal(res.summary.invariantsFailed, 0);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');

    assertValidReports(res, dr, '2.1-blank');
  });

  await asyncTest('2.2: contractMissing: true flag forces deterministic BLOCKED status', async () => {
    const res = await runVerificationPipeline('notes_main', '.', { contractMissing: true });
    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.stages[0].errorCode, 'CONTRACT_EVIDENCE_MISSING');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');

    assertValidReports(res, dr, '2.2-contract-missing');
  });

  await asyncTest('2.3: previewMissing: true fails closed at Stage 4 with unmeasured metrics set to null', async () => {
    const res = await runVerificationPipeline('notes_main', '.', {
      contract: { measuredScenes: [{ elements: [{ id: 'e1' }] }] },
      telemetry: { e1: { boundsPx: { left: 0, top: 0, width: 10, height: 10 } } },
      previewMissing: true
    });

    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.stagesExecutedCount, 4);
    assert.equal(res.stages[3].stage, 'STAGE_4_PERCEPTUAL_METRICS');
    assert.equal(res.stages[3].errorCode, 'PREVIEW_RENDER_MISSING');
    assert.equal(res.summary.inkIouPercentage, null);
    assert.equal(res.summary.sobelContourPercentage, null);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');

    assertValidReports(res, dr, '2.3-preview-missing');
  });

  // ==========================================================================
  // SECTION 3: Touch Geometry & Coordinate Edge Cases
  // ==========================================================================
  console.log('\n─── Section 3: Touch Geometry & Coordinate Edge Cases ───');

  test('3.1: computeDrift returns NaN on non-number or NaN coordinates', () => {
    assert.ok(Number.isNaN(computeDrift('10', 20, 10, 20).distance));
    assert.ok(Number.isNaN(computeDrift(NaN, 20, 10, 20).distance));
    assert.ok(Number.isNaN(computeDrift(10, undefined, 10, 20).distance));
    assert.ok(Number.isNaN(computeDrift(null, 20, 10, 20).distance));
  });

  await asyncTest('3.2: verifyTouchGeometry rejects non-finite coordinates with LAYOUT_GEOMETRY_INVALID', async () => {
    const resInf = await verifyTouchGeometry('screen', null, {
      elementComparisons: [
        { sourceId: 'broken_node', expectedX: 100, expectedY: 200, actualX: Infinity, actualY: 200 }
      ]
    });
    assert.equal(resInf.status, 'FAIL');
    assert.equal(resInf.errorCode, 'LAYOUT_GEOMETRY_INVALID');

    const resNaN = await verifyTouchGeometry('screen', null, {
      elementComparisons: [
        { sourceId: 'nan_node', expectedX: 100, expectedY: 200, actualX: NaN, actualY: 200 }
      ]
    });
    assert.equal(resNaN.status, 'FAIL');
    assert.equal(resNaN.errorCode, 'LAYOUT_GEOMETRY_INVALID');
  });

  test('3.3: computeDrift sub-pixel precision and Pythagorean calculation', () => {
    // 3, 4, 5 triangle
    const d345 = computeDrift(0, 0, 3, 4);
    assert.equal(d345.dx, 3);
    assert.equal(d345.dy, 4);
    assert.equal(d345.distance, 5);

    // Negative coordinates
    const dNeg = computeDrift(-10, -20, -7, -16);
    assert.equal(dNeg.dx, 3);
    assert.equal(dNeg.dy, 4);
    assert.equal(dNeg.distance, 5);
  });

  await asyncTest('3.4: Baseline drift boundary: exactly 2.0px passes, 2.001px fails BASELINE_MISALIGNMENT', async () => {
    const passRes = await verifyTouchGeometry('s', null, {
      elementComparisons: [
        { sourceId: 'text_exact', expectedX: 0, expectedY: 0, actualX: 0, actualY: 0, expectedBaseline: 50, actualBaseline: 52.0 }
      ]
    });
    assert.equal(passRes.status, 'PASS');

    const failRes = await verifyTouchGeometry('s', null, {
      elementComparisons: [
        { sourceId: 'text_over', expectedX: 0, expectedY: 0, actualX: 0, actualY: 0, expectedBaseline: 50, actualBaseline: 52.001 }
      ]
    });
    assert.equal(failRes.status, 'FAIL');
    assert.equal(failRes.errorCode, 'BASELINE_MISALIGNMENT');
  });

  await asyncTest('3.5: Touch target hit-slop: 24dp visual button with 48dp hit-slop passes', async () => {
    const res = await verifyTouchGeometry('s', null, {
      elementComparisons: [
        {
          sourceId: 'btn_hitslop',
          isInteractive: true,
          expectedX: 0, expectedY: 0, actualX: 0, actualY: 0,
          actualWidth: 48, actualHeight: 48, // 24dp
          touchWidthPx: 96, touchHeightPx: 96 // 48dp hit-slop
        }
      ]
    });
    assert.equal(res.status, 'PASS');
  });

  await asyncTest('3.6: Touch target hit-slop: 24dp visual button with 47.9dp hit-slop fails TOUCH_TARGET_TOO_SMALL', async () => {
    const res = await verifyTouchGeometry('s', null, {
      elementComparisons: [
        {
          sourceId: 'btn_too_small',
          isInteractive: true,
          expectedX: 0, expectedY: 0, actualX: 0, actualY: 0,
          actualWidth: 48, actualHeight: 48,
          touchWidthPx: 95.8, touchHeightPx: 96
        }
      ]
    });
    assert.equal(res.status, 'FAIL');
    assert.equal(res.errorCode, 'TOUCH_TARGET_TOO_SMALL');
  });

  await asyncTest('3.7: Non-interactive small element (icon / badge) is exempted from 48dp min bounds', async () => {
    const res = await verifyTouchGeometry('s', null, {
      elementComparisons: [
        {
          sourceId: 'static_icon',
          isInteractive: false,
          expectedX: 0, expectedY: 0, actualX: 0, actualY: 0,
          actualWidth: 20, actualHeight: 20
        }
      ]
    });
    assert.equal(res.status, 'PASS');
  });

  // ==========================================================================
  // SECTION 4: Display Profile & Grayscale Contrast Edge Cases
  // ==========================================================================
  console.log('\n─── Section 4: Display Profile & Grayscale Contrast Edge Cases ───');

  test('4.1: DC1 hardware coordinate inset: +8px offset round trip', () => {
    const val = new DisplayProfileValidator();
    const phys = val.logicalToPhysical(100, 200);
    assert.equal(phys.x, 108);
    assert.equal(phys.y, 208);

    const log = val.physicalToLogical(phys.x, phys.y);
    assert.equal(log.x, 100);
    assert.equal(log.y, 200);
  });

  test('4.2: Settle time validation: 150ms passes, 149ms fails, 500ms fails as artificial pause', () => {
    const val = new DisplayProfileValidator();
    assert.equal(val.validateSettleTime(150).valid, true);
    assert.equal(val.validateSettleTime(200).valid, true);
    assert.equal(val.validateSettleTime(300).valid, true);

    const tooFast = val.validateSettleTime(149);
    assert.equal(tooFast.valid, false);
    assert.ok(tooFast.error.includes('below minimum 150ms'));

    const tooSlow = val.validateSettleTime(500);
    assert.equal(tooSlow.valid, false);
    assert.ok(tooSlow.error.includes('artificial pause'));

    const nonFinite = val.validateSettleTime(NaN);
    assert.equal(nonFinite.valid, false);
  });

  test('4.3: Discrete 8-bit grayscale level computation matches unlinearized sRGB luminance', () => {
    const val = new DisplayProfileValidator();
    assert.equal(val.computeGrayscaleLevel('#FFFFFF'), 255);
    assert.equal(val.computeGrayscaleLevel('#000000'), 0);
    assert.equal(val.computeGrayscaleLevel('#F7F7F7'), 247);
    assert.equal(val.computeGrayscaleLevel('#535353'), 83);
  });

  test('4.4: Adjacent surface separation: deltaL < 15 without hairline border fails, with hairline border passes', () => {
    const val = new DisplayProfileValidator();
    // #FFFFFF (255) vs #F7F7F7 (247) -> deltaL = 8 < 15
    const withoutBorder = val.validateAdjacentSurfaces('#FFFFFF', '#F7F7F7', false);
    assert.equal(withoutBorder.valid, false);
    assert.equal(withoutBorder.deltaL, 8);
    assert.ok(withoutBorder.error.includes('--os-100 hairline border'));

    const withBorder = val.validateAdjacentSurfaces('#FFFFFF', '#F7F7F7', true);
    assert.equal(withBorder.valid, true);
    assert.equal(withBorder.deltaL, 8);

    // #FFFFFF (255) vs #CCCCCC (204) -> deltaL = 51 >= 15
    const sufficientDelta = val.validateAdjacentSurfaces('#FFFFFF', '#CCCCCC', false);
    assert.equal(sufficientDelta.valid, true);
    assert.equal(sufficientDelta.deltaL, 51);
  });

  test('4.5: WCAG Grayscale contrast thresholds: 4.5:1 normal text, 3.0:1 large text', () => {
    const val = new DisplayProfileValidator();
    // Normal text
    const normPass = val.validateGrayscaleContrast('#535353', '#FFFFFF', false); // ~5.7:1
    assert.equal(normPass.passAA, true);

    const normFail = val.validateGrayscaleContrast('#CCCCCC', '#FFFFFF', false); // ~1.6:1
    assert.equal(normFail.passAA, false);
    assert.equal(normFail.verdict, 'FAIL');

    // Large text
    const largePass = val.validateGrayscaleContrast('#858585', '#FFFFFF', true); // ~3.5:1 >= 3.0
    assert.equal(largePass.passAA, true);

    const largeFail = val.validateGrayscaleContrast('#858585', '#FFFFFF', false); // ~3.5:1 < 4.5
    assert.equal(largeFail.passAA, false);
  });

  // ==========================================================================
  // SECTION 5: Schema Conformance & Defect Oracle Quality Gate Inversion
  // ==========================================================================
  console.log('\n─── Section 5: Schema Conformance & Gate Inversion Verification ───');

  await asyncTest('5.1: Pipeline FAIL strictly produces DefectReport gateOutcome FAIL with valid schemas', async () => {
    const failRes = await runVerificationPipeline('s_fail', '.', {
      elementComparisons: [
        { sourceId: 'submit_btn', expectedX: 50, expectedY: 100, actualX: 50, actualY: 115 }
      ]
    });
    assert.equal(failRes.outcome, 'FAIL');

    const dr = diagnoseDefects(failRes);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'submit_btn');
    assert.equal(dr.defects[0].severity, 'CRITICAL');

    assertValidReports(failRes, dr, '5.1-fail-gate');
  });

  await asyncTest('5.2: Pipeline BLOCKED strictly produces DefectReport gateOutcome BLOCKED with valid schemas', async () => {
    const blockRes = await runVerificationPipeline('s_block', '.', {
      contractMissing: true
    });
    assert.equal(blockRes.outcome, 'BLOCKED');

    const dr = diagnoseDefects(blockRes);
    assert.equal(dr.gateOutcome, 'BLOCKED');

    assertValidReports(blockRes, dr, '5.2-block-gate');
  });

  await asyncTest('5.3: Pipeline PASS strictly produces DefectReport gateOutcome PASS with valid schemas', async () => {
    const passRes = await runVerificationPipeline('s_pass', '.', {
      contract: { measuredScenes: [{ elements: [{ id: 'hero' }] }] },
      telemetry: { hero: { boundsPx: { left: 0, top: 0, width: 100, height: 100 } } },
      elementComparisons: [
        { sourceId: 'hero', expectedX: 10, expectedY: 20, actualX: 10, actualY: 20 }
      ],
      previewPath: '/dummy/preview.png',
      inkIou: 95.0,
      edgeContourScore: 96.0,
      mssim: 0.98
    });
    assert.equal(passRes.outcome, 'PASS');

    const dr = diagnoseDefects(passRes);
    assert.equal(dr.gateOutcome, 'PASS');
    assert.equal(dr.defects.length, 0);

    assertValidReports(passRes, dr, '5.3-pass-gate');
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n==============================================================================');
  console.log(`  CHALLENGER 1 R2 RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('==============================================================================');

  if (failedTests > 0) {
    console.error(`\nEncountered ${failedTests} failure(s) in Challenger 1 R2 suite.`);
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Unhandled fatal error in Challenger 1 R2 suite:', err);
  process.exit(1);
});
