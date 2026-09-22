#!/usr/bin/env node

/**
 * tests/adversarial/run_m4_challenger2_stress_r2.js
 *
 * Comprehensive Empirical Adversarial Stress Suite for Milestone 4 (R2):
 * Causal Defect Oracle, Root-Cause Attribution, Remediation Generator,
 * and Ajv Draft 2020-12 Schema Compliance.
 *
 * Authored by: Milestone 4 Challenger 2 R2 (critic, specialist)
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Subsystems Under Test
const {
  diagnoseDefects,
  classifyRootCause,
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation,
  DEFECT_CATEGORIES,
  SEVERITY_LEVELS,
  GATE_OUTCOMES,
  determineSeverity,
  calculateGateOutcome,
  TAXONOMY_ERROR_CODES
} = require('../../src/defects');

const { runVerificationPipeline } = require('../../src/verification');
const { SOL_OS_TOKENS } = require('../../src/verification/display_profile');

// Setup Ajv Draft 2020-12 validators
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const schemaPath1 = path.resolve(__dirname, '../../src/defects/schemas/defect_report.json');
const schemaPath2 = path.resolve(__dirname, '../../src/defects/defect-report.schema.json');

const schemaJson1 = JSON.parse(fs.readFileSync(schemaPath1, 'utf8'));
const schemaJson2 = JSON.parse(fs.readFileSync(schemaPath2, 'utf8'));

const validateSchema1 = ajv.compile(schemaJson1);
const validateSchema2 = ajv.compile(schemaJson2);

function assertValidReport(report, contextMsg = '') {
  const valid1 = validateSchema1(report);
  if (!valid1) {
    console.error(`Schema 1 Errors [${contextMsg}]:`, validateSchema1.errors);
  }
  assert.equal(valid1, true, `Report must validate under src/defects/schemas/defect_report.json [${contextMsg}]`);

  const valid2 = validateSchema2(report);
  if (!valid2) {
    console.error(`Schema 2 Errors [${contextMsg}]:`, validateSchema2.errors);
  }
  assert.equal(valid2, true, `Report must validate under src/defects/defect-report.schema.json [${contextMsg}]`);
}

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
    testResults.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
    testResults.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: err.message });
  }
}

(async () => {
  console.log('==============================================================================');
  console.log('  Milestone 4 Challenger 2 R2: Defect Oracle & Attribution Stress Suite');
  console.log('==============================================================================\n');

  // ============================================================================
  // SUITE 1: Heterogeneous Batch Attribution & Cross-Contamination Prevention
  // ============================================================================
  console.log('--- Suite 1: Heterogeneous Batch Attribution & Cross-Contamination ---');

  runTest('1.1: Explicitly tagged 3-failure batch (Shift + EPD Hook + Contrast Failure)', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'screen_epd', hasEpdHook: true, matchedPattern: 'ACTION_REFRESH_SCREEN' },
      { sourceId: 'headline_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-1-1' });

    assert.equal(report.defects.length, 3);
    const shiftDefect = report.defects.find(d => d.sourceId === 'btn_shifted');
    const epdDefect = report.defects.find(d => d.sourceId === 'screen_epd');
    const contrastDefect = report.defects.find(d => d.sourceId === 'headline_contrast');

    assert.equal(shiftDefect.category, DEFECT_CATEGORIES.MARGIN_SHIFT);
    assert.equal(shiftDefect.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assert.equal(epdDefect.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
    assert.equal(epdDefect.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');
    assert.equal(epdDefect.severity, SEVERITY_LEVELS.CRITICAL);

    assert.equal(contrastDefect.category, DEFECT_CATEGORIES.CONTRAST_FAILURE);
    assert.equal(contrastDefect.diagnosis.rootCause, 'THEME_TOKEN_MISREFERENCE');

    assertValidReport(report, 'Suite 1.1');
  });

  runTest('1.2: Explicitly tagged 7-failure full spectrum batch', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'headline_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 },
      { sourceId: 'small_icon', category: 'TOUCH_TARGET_TOO_SMALL', touchWidthDp: 24, touchHeightDp: 24 },
      { sourceId: 'missing_cta', errorCode: 'ELEMENT_NOT_RENDERED' },
      { sourceId: 'epd_flash', hasEpdHook: true, matchedPattern: 'ACTION_REFRESH_SCREEN' },
      { sourceId: 'missing_font', missingAsset: 'arizona.ttf' },
      { sourceId: 'broken_db', category: 'INVARIANT_BROKEN', callbackDetached: true }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-1-2' });
    assert.equal(report.defects.length, 7);

    const diagnoses = Object.fromEntries(report.defects.map(d => [d.sourceId, d.diagnosis.rootCause]));
    assert.equal(diagnoses['btn_shifted'], 'PARENT_INSET_ACCUMULATION');
    assert.equal(diagnoses['headline_contrast'], 'THEME_TOKEN_MISREFERENCE');
    assert.equal(diagnoses['small_icon'], 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
    assert.equal(diagnoses['missing_cta'], 'ELEMENT_NOT_RENDERED');
    assert.equal(diagnoses['epd_flash'], 'FORBIDDEN_EPD_WORKAROUND');
    assert.equal(diagnoses['missing_font'], 'ASSET_RESOURCE_MISSING');
    assert.equal(diagnoses['broken_db'], 'VIEWMODEL_CALLBACK_DETACHMENT');

    for (const d of report.defects) {
      if (d.sourceId !== 'btn_shifted') {
        assert.notEqual(d.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
      }
    }
    assertValidReport(report, 'Suite 1.2');
  });

  runTest('1.3: Permutation invariance across input orders', () => {
    const baseBatch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'headline_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 },
      { sourceId: 'small_icon', category: 'TOUCH_TARGET_TOO_SMALL', touchWidthDp: 24, touchHeightDp: 24 },
      { sourceId: 'missing_cta', errorCode: 'ELEMENT_NOT_RENDERED' },
      { sourceId: 'epd_flash', hasEpdHook: true, matchedPattern: 'ACTION_REFRESH_SCREEN' }
    ];

    const reportA = diagnoseDefects({ failures: [...baseBatch].reverse(), runId: 'perm-a' });
    const reportB = diagnoseDefects({ failures: [baseBatch[1], baseBatch[0], baseBatch[3], baseBatch[4], baseBatch[2]], runId: 'perm-b' });

    const diagA = Object.fromEntries(reportA.defects.map(d => [d.sourceId, d.diagnosis.rootCause]));
    const diagB = Object.fromEntries(reportB.defects.map(d => [d.sourceId, d.diagnosis.rootCause]));

    assert.deepEqual(diagA, diagB);
  });

  runTest('1.4: Raw failure with settleMs >= 500 categorized as EPD_FLASH_DETECTED and CRITICAL', () => {
    const report = diagnoseDefects({
      failures: [
        { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
        { sourceId: 'epd_pause', settleMs: 600 }
      ]
    });

    const epdDefect = report.defects.find(d => d.sourceId === 'epd_pause');
    assert.ok(epdDefect, 'epd_pause defect must exist');
    assert.equal(epdDefect.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');
    assert.equal(epdDefect.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED,
      `Category must be EPD_FLASH_DETECTED, got "${epdDefect.category}"`);
    assert.equal(epdDefect.severity, SEVERITY_LEVELS.CRITICAL,
      `Severity must be CRITICAL, got "${epdDefect.severity}"`);
  });

  runTest('1.5: Raw failure with touchWidthDp < 48 categorized as TOUCH_TARGET_TOO_SMALL and MAJOR', () => {
    const report = diagnoseDefects({
      failures: [
        { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
        { sourceId: 'touch_icon', touchWidthDp: 24, touchHeightDp: 24 }
      ]
    });

    const touchDefect = report.defects.find(d => d.sourceId === 'touch_icon');
    assert.ok(touchDefect, 'touch_icon defect must exist');
    assert.equal(touchDefect.category, DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL,
      `Category must be TOUCH_TARGET_TOO_SMALL, got "${touchDefect.category}"`);
    assert.equal(touchDefect.severity, SEVERITY_LEVELS.MAJOR,
      `Severity must be MAJOR, got "${touchDefect.severity}"`);
    assert.equal(touchDefect.diagnosis.rootCause, 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
  });

  runTest('1.6: Raw failure with callbackDetached: true categorized as INVARIANT_BROKEN and CRITICAL', () => {
    const report = diagnoseDefects({
      failures: [
        { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
        { sourceId: 'broken_db', callbackDetached: true }
      ]
    });

    const dbDefect = report.defects.find(d => d.sourceId === 'broken_db');
    assert.ok(dbDefect, 'broken_db defect must exist');
    assert.equal(dbDefect.category, DEFECT_CATEGORIES.INVARIANT_BROKEN,
      `Category must be INVARIANT_BROKEN, got "${dbDefect.category}"`);
    assert.equal(dbDefect.severity, SEVERITY_LEVELS.CRITICAL,
      `Severity must be CRITICAL, got "${dbDefect.severity}"`);
    assert.equal(dbDefect.diagnosis.rootCause, 'VIEWMODEL_CALLBACK_DETACHMENT');
  });

  // ============================================================================
  // SUITE 2: Pipeline Integration & Subsystem Boundary Verification
  // ============================================================================
  console.log('\n--- Suite 2: Pipeline Integration & Subsystem Boundary Verification ---');

  await runAsyncTest('2.1: Pipeline contrast failure consumed by diagnoseDefects without corruption', async () => {
    const resContrast = await runVerificationPipeline('screen_test', 'fixtures/note-app', {
      stage: 'STAGE_2_COMPILE_AND_TESTS',
      headlineColor: SOL_OS_TOKENS['--os-200'].hex
    });

    assert.equal(resContrast.outcome, 'FAIL');
    const dr = diagnoseDefects(resContrast);

    assert.equal(dr.defects.length, 1);
    const defect = dr.defects[0];
    assert.equal(defect.category, DEFECT_CATEGORIES.CONTRAST_FAILURE,
      `Category must be CONTRAST_FAILURE, got "${defect.category}"`);
    assert.equal(defect.severity, SEVERITY_LEVELS.MAJOR,
      `Severity must be MAJOR, got "${defect.severity}"`);
    assert.notEqual(defect.diagnosis.rootCause, 'GENERIC_LAYOUT_DRIFT',
      'Contrast defect must not be misdiagnosed as GENERIC_LAYOUT_DRIFT');
    assert.ok(defect.diagnosis.rootCause === 'THEME_TOKEN_MISREFERENCE' || defect.diagnosis.rootCause === 'COLOR_COLLAPSE',
      `Root cause must be contrast-related, got "${defect.diagnosis.rootCause}"`);
  });

  await runAsyncTest('2.2: Pipeline EPD settle pause consumed by diagnoseDefects without corruption', async () => {
    const resEpd = await runVerificationPipeline('screen_test', 'fixtures/note-app', {
      stage: 'STAGE_6_DC1_HARDWARE',
      settleMs: 500
    });

    assert.equal(resEpd.outcome, 'FAIL');
    const dr = diagnoseDefects(resEpd);

    assert.equal(dr.defects.length, 1);
    const defect = dr.defects[0];
    assert.equal(defect.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED,
      `Category must be EPD_FLASH_DETECTED, got "${defect.category}"`);
    assert.equal(defect.severity, SEVERITY_LEVELS.CRITICAL,
      `Severity must be CRITICAL, got "${defect.severity}"`);
    assert.equal(defect.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND',
      `Root cause must be FORBIDDEN_EPD_WORKAROUND, got "${defect.diagnosis.rootCause}"`);
  });

  await runAsyncTest('2.3: Heterogeneous pipeline output (Shift + Contrast Failure) does NOT cross-contaminate', async () => {
    const resShift = await runVerificationPipeline('s1', '/app', {
      stage: 'STAGE_3_LAYOUT_TELEMETRY',
      elements: [{ id: 'cta_btn', expectedX: 100, expectedY: 200, actualX: 100, actualY: 220 }]
    });

    const resContrast = await runVerificationPipeline('s2', '/app', {
      stage: 'STAGE_2_COMPILE_AND_TESTS',
      headlineColor: SOL_OS_TOKENS['--os-200'].hex
    });

    const combinedVR = {
      outcome: 'FAIL',
      stages: [...resShift.stages, ...resContrast.stages],
      defects: [...resShift.defects, ...resContrast.defects]
    };

    const dr = diagnoseDefects(combinedVR);
    assert.equal(dr.defects.length, 2);

    const shiftDef = dr.defects.find(d => d.sourceId === 'cta_btn');
    const contrastDef = dr.defects.find(d => d.sourceId === 'daylight#note_editor/title');

    assert.equal(shiftDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.notEqual(contrastDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION',
      `Contrast defect must NOT be misdiagnosed as PARENT_INSET_ACCUMULATION! Got "${contrastDef.diagnosis.rootCause}"`);
    assert.ok(!contrastDef.remediation.action.includes('Adjust parent Column vertical padding'),
      `Contrast defect must NOT receive parent Column padding remediation! Got "${contrastDef.remediation.action}"`);
  });

  // ============================================================================
  // SUITE 3: Remediation Padding Clamping & Diff Integrity
  // ============================================================================
  console.log('\n--- Suite 3: Remediation Padding Clamping & Diff Integrity ---');

  runTest('3.1: Clamping to 0dp when shift exceeds initial padding (30px shift on 8dp padding)', () => {
    const remediation = generateSpatialRemediation({
      currentPaddingDp: 8,
      shiftPx: 30, // 30px / 2.0 = 15dp -> 8 - 15 = -7dp -> clamped to 0dp
      density: 2.0,
      startLine: 98
    });

    assert.ok(remediation.suggestedReplacement.includes('padding(top = 0.dp,'),
      `Must clamp top padding to 0.dp: got "${remediation.suggestedReplacement}"`);
    assert.ok(!remediation.suggestedReplacement.includes('-'),
      `Must never contain negative padding values: got "${remediation.suggestedReplacement}"`);
    assert.equal(remediation.targetLineRange.start, 98);
    assert.equal(remediation.targetLineRange.end, 98);
  });

  runTest('3.2: Boundary clamping with 0 initial padding', () => {
    const remediation = generateSpatialRemediation({
      currentPaddingDp: 0,
      shiftPx: 20,
      density: 2.0
    });
    assert.ok(remediation.suggestedReplacement.includes('padding(top = 0.dp,'));
  });

  runTest('3.3: Boundary exact match (shift equals initial padding)', () => {
    const remediation = generateSpatialRemediation({
      currentPaddingDp: 16,
      shiftPx: 32,
      density: 2.0
    });
    assert.ok(remediation.suggestedReplacement.includes('padding(top = 0.dp,'));
  });

  runTest('3.4: Extreme shift values (e.g. 1000px shift)', () => {
    const remediation = generateSpatialRemediation({
      currentPaddingDp: 32,
      shiftPx: 1000,
      density: 2.0
    });
    assert.ok(remediation.suggestedReplacement.includes('padding(top = 0.dp,'));
    assert.ok(!remediation.suggestedReplacement.includes('-'));
  });

  runTest('3.5: Valid positive reduction (32dp - 9dp = 23dp)', () => {
    const remediation = generateSpatialRemediation({
      currentPaddingDp: 32,
      shiftPx: 18,
      density: 2.0
    });
    assert.ok(remediation.suggestedReplacement.includes('padding(top = 23.dp,'));
    assert.ok(remediation.action.includes('from 32dp to 23dp to eliminate +18px (+9dp)'));
  });

  // ============================================================================
  // SUITE 4: Ajv Draft 2020-12 Schema Validation Across All Defect Categories
  // ============================================================================
  console.log('\n--- Suite 4: Ajv Draft 2020-12 Schema Validation Across All Defect Categories ---');

  const allRootCausesAndCategories = [
    { name: 'PARENT_INSET_ACCUMULATION', failure: { sourceId: 'node_shift', deltaPx: { dx: 0, dy: 20 } } },
    { name: 'FORBIDDEN_EPD_WORKAROUND', failure: { sourceId: 'node_epd', hasEpdHook: true, matchedPattern: 'ACTION_REFRESH_SCREEN' } },
    { name: 'THEME_TOKEN_MISREFERENCE', failure: { sourceId: 'node_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.5 } },
    { name: 'COLOR_COLLAPSE', failure: { sourceId: 'node_collapse', category: 'COLOR_COLLAPSE', isColorCollapse: true } },
    { name: 'TOUCH_TARGET_INFLATION_OR_DEFLATION', failure: { sourceId: 'node_touch', category: 'TOUCH_TARGET_TOO_SMALL', touchWidthDp: 32, touchHeightDp: 32 } },
    { name: 'ELEMENT_NOT_RENDERED', failure: { sourceId: 'node_missing', errorCode: 'ELEMENT_NOT_RENDERED' } },
    { name: 'ASSET_RESOURCE_MISSING', failure: { sourceId: 'node_asset', missingAsset: 'custom_font.ttf' } },
    { name: 'VIEWMODEL_CALLBACK_DETACHMENT', failure: { sourceId: 'node_invariant', category: 'INVARIANT_BROKEN', callbackDetached: true } },
    { name: 'FONT_METRICS_LEADING_MISMATCH', failure: { sourceId: 'node_font_lead', baselineDelta: 4.5, dx: 0 } },
    { name: 'INCORRECT_MODIFIER_CHAIN_ORDER', failure: { sourceId: 'node_mod_chain', modifierChainIssue: true } },
    { name: 'GENERIC_LAYOUT_DRIFT', failure: { sourceId: 'node_orphan' } }
  ];

  for (const rc of allRootCausesAndCategories) {
    runTest(`4.1: Ajv Draft 2020-12 validation for ${rc.name}`, () => {
      const report = diagnoseDefects({ failures: [rc.failure], runId: `run-${rc.name.toLowerCase()}` });
      assert.equal(report.defects.length, 1);
      assertValidReport(report, rc.name);
    });
  }

  runTest('4.2: Ajv Draft 2020-12 validation when verificationRunId is null / omitted', () => {
    const report1 = diagnoseDefects({ failures: [{ sourceId: 'btn', deltaPx: { dx: 5, dy: 5 } }] });
    assert.equal(report1.provenance.verificationRunId, null);
    assertValidReport(report1, 'Omitted runId -> null');

    const report2 = diagnoseDefects({ failures: [{ sourceId: 'btn', deltaPx: { dx: 5, dy: 5 } }], runId: null });
    assert.equal(report2.provenance.verificationRunId, null);
    assertValidReport(report2, 'Explicit null runId');
  });

  runTest('4.3: Ajv Draft 2020-12 validation for zero-defect report (passing outcome)', () => {
    const report = diagnoseDefects({ failures: [], outcome: 'PASS', runId: 'clean-run' });
    assert.equal(report.gateOutcome, 'PASS');
    assert.equal(report.defects.length, 0);
    assertValidReport(report, 'Zero defect pass');
  });

  runTest('4.4: Ajv Draft 2020-12 validation for blocked report with blockers array', () => {
    const report = diagnoseDefects({ failures: [], outcome: 'BLOCKED', blockers: ['PREVIEW_RENDER_MISSING'], runId: 'blocked-run' });
    assert.equal(report.gateOutcome, 'BLOCKED');
    assert.equal(report.blockers.length, 1);
    assertValidReport(report, 'Blocked report');
  });

  // ============================================================================
  // SUITE 5: Gate Outcome Truth Table & Pipeline Fail-Closed Guard
  // ============================================================================
  console.log('\n--- Suite 5: Gate Outcome Truth Table & Pipeline Fail-Closed Guard ---');

  runTest('5.1: Pipeline FAIL strictly produces gateOutcome: FAIL regardless of severity', () => {
    const report = diagnoseDefects({
      outcome: 'FAIL',
      failures: [{ sourceId: 'minor_shift', deltaPx: { dx: 0, dy: 3.5 } }]
    });
    assert.equal(report.gateOutcome, 'FAIL');
  });

  runTest('5.2: Pipeline BLOCKED strictly produces gateOutcome: BLOCKED', () => {
    const report = diagnoseDefects({
      outcome: 'BLOCKED',
      blockers: ['CONTRACT_EVIDENCE_MISSING'],
      failures: []
    });
    assert.equal(report.gateOutcome, 'BLOCKED');
  });

  runTest('5.3: Direct calculateGateOutcome truth table verification', () => {
    assert.equal(calculateGateOutcome([{ severity: 'CRITICAL' }]), 'FAIL');
    assert.equal(calculateGateOutcome([{ severity: 'MAJOR' }]), 'FAIL');
    assert.equal(calculateGateOutcome([{ severity: 'MINOR' }], [], 'PASS'), 'PASS');
    assert.equal(calculateGateOutcome([{ severity: 'MINOR' }], [], 'FAIL'), 'FAIL');
    assert.equal(calculateGateOutcome([], ['MISSING_FILE']), 'BLOCKED');
    assert.equal(calculateGateOutcome([], [], 'BLOCKED'), 'BLOCKED');
  });

  console.log('\n==============================================================================');
  console.log(`  Execution Summary: ${passedTests} Passed, ${failedTests} Failed (Total ${passedTests + failedTests})`);
  console.log('==============================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
