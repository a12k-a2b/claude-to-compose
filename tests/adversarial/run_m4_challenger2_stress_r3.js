#!/usr/bin/env node

/**
 * tests/adversarial/run_m4_challenger2_stress_r3.js
 *
 * Milestone 4 Challenger 2 R3 Empirical Stress & Verification Suite:
 * Causal Defect Oracle, Heterogeneous Batch Isolation, Raw Signal Waterfall Mapping,
 * Permutation Invariance Fuzzing, and Ajv Draft 2020-12 Schema Compliance.
 *
 * Authored by: Milestone 4 Challenger 2 R3 (critic, specialist)
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

// Set up spy on classifyRootCause before oracle is loaded
const rootCauseModule = require('../../src/defects/root_cause');
const originalClassify = rootCauseModule.classifyRootCause;
let capturedContexts = [];

rootCauseModule.classifyRootCause = function (ctx) {
  capturedContexts.push({
    sourceId: ctx.sourceId,
    category: ctx.category,
    siblingShifts: ctx.siblingShifts ? [...ctx.siblingShifts] : null,
    deltaPx: ctx.drift,
    settleMs: ctx.settleMs,
    touchWidthDp: ctx.touchWidthDp,
    touchHeightDp: ctx.touchHeightDp,
    callbackDetached: ctx.callbackDetached,
    persistenceMissing: ctx.persistenceMissing
  });
  return originalClassify.call(this, ctx);
};

// Clear cache to ensure oracle uses the spied classifyRootCause
delete require.cache[require.resolve('../../src/defects/oracle')];
delete require.cache[require.resolve('../../src/defects')];

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

// Ajv Draft 2020-12 validation setup
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
    capturedContexts = [];
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
    capturedContexts = [];
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
  console.log('  Milestone 4 Challenger 2 R3: Defect Oracle & Heterogeneous Stress Suite');
  console.log('==============================================================================\n');

  // ============================================================================
  // SUITE 1: Heterogeneous Pairwise Isolation (Spatial + Non-Spatial)
  // ============================================================================
  console.log('--- Suite 1: Heterogeneous Pairwise Isolation (Spatial + Non-Spatial) ---');

  runTest('1.1: Pairwise (1 Spatial Shift + 1 Contrast Failure) isolation', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 16 } },
      { sourceId: 'text_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-contrast' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'btn_shifted');
    const contrastCtx = capturedContexts.find(c => c.sourceId === 'text_contrast');

    assert.deepEqual(shiftCtx.siblingShifts, [16]);
    assert.deepEqual(contrastCtx.siblingShifts, [], 'Non-spatial contrast defect must receive empty siblingShifts');

    const shiftDef = report.defects.find(d => d.sourceId === 'btn_shifted');
    const contrastDef = report.defects.find(d => d.sourceId === 'text_contrast');

    assert.equal(shiftDef.category, DEFECT_CATEGORIES.MARGIN_SHIFT);
    assert.equal(shiftDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assert.equal(contrastDef.category, DEFECT_CATEGORIES.CONTRAST_FAILURE);
    assert.notEqual(contrastDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.ok(!contrastDef.remediation.action.includes('padding('), 'Contrast remediation must not propose padding');
    assertValidReport(report, 'Pairwise 1.1');
  });

  runTest('1.2: Pairwise (1 Spatial Shift + 1 EPD Settle Pause) isolation', () => {
    const batch = [
      { sourceId: 'card_shifted', deltaPx: { dx: 0, dy: 24 } },
      { sourceId: 'dialog_pause', settleMs: 650 }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-epd' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'card_shifted');
    const epdCtx = capturedContexts.find(c => c.sourceId === 'dialog_pause');

    assert.deepEqual(shiftCtx.siblingShifts, [24]);
    assert.deepEqual(epdCtx.siblingShifts, [], 'Non-spatial EPD defect must receive empty siblingShifts');

    const shiftDef = report.defects.find(d => d.sourceId === 'card_shifted');
    const epdDef = report.defects.find(d => d.sourceId === 'dialog_pause');

    assert.equal(shiftDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.equal(epdDef.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
    assert.equal(epdDef.severity, SEVERITY_LEVELS.CRITICAL);
    assert.equal(epdDef.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');
    assert.notEqual(epdDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Pairwise 1.2');
  });

  runTest('1.3: Pairwise (1 Spatial Shift + 1 Touch Target Deflation) isolation', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 14 } },
      { sourceId: 'action_icon', touchWidthDp: 32, touchHeightDp: 32 }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-touch' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'btn_shifted');
    const touchCtx = capturedContexts.find(c => c.sourceId === 'action_icon');

    assert.deepEqual(shiftCtx.siblingShifts, [14]);
    assert.deepEqual(touchCtx.siblingShifts, [], 'Touch target defect must receive empty siblingShifts');

    const touchDef = report.defects.find(d => d.sourceId === 'action_icon');
    assert.equal(touchDef.category, DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL);
    assert.equal(touchDef.severity, SEVERITY_LEVELS.MAJOR);
    assert.equal(touchDef.diagnosis.rootCause, 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
    assert.notEqual(touchDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Pairwise 1.3');
  });

  runTest('1.4: Pairwise (1 Spatial Shift + 1 Callback Detachment) isolation', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 15 } },
      { sourceId: 'save_button', callbackDetached: true }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-callback' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'btn_shifted');
    const cbCtx = capturedContexts.find(c => c.sourceId === 'save_button');

    assert.deepEqual(shiftCtx.siblingShifts, [15]);
    assert.deepEqual(cbCtx.siblingShifts, [], 'Callback detachment defect must receive empty siblingShifts');

    const cbDef = report.defects.find(d => d.sourceId === 'save_button');
    assert.equal(cbDef.category, DEFECT_CATEGORIES.INVARIANT_BROKEN);
    assert.equal(cbDef.severity, SEVERITY_LEVELS.CRITICAL);
    assert.equal(cbDef.diagnosis.rootCause, 'VIEWMODEL_CALLBACK_DETACHMENT');
    assert.notEqual(cbDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Pairwise 1.4');
  });

  runTest('1.5: Pairwise (1 Spatial Shift + 1 Missing Font Asset) isolation', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'custom_font', missingAsset: 'arizona_sans.ttf' }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-asset' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'btn_shifted');
    const assetCtx = capturedContexts.find(c => c.sourceId === 'custom_font');

    assert.deepEqual(shiftCtx.siblingShifts, [18]);
    assert.deepEqual(assetCtx.siblingShifts, [], 'Missing asset defect must receive empty siblingShifts');

    const assetDef = report.defects.find(d => d.sourceId === 'custom_font');
    assert.equal(assetDef.category, DEFECT_CATEGORIES.ASSET_MISSING);
    assert.equal(assetDef.diagnosis.rootCause, 'ASSET_RESOURCE_MISSING');
    assert.notEqual(assetDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Pairwise 1.5');
  });

  runTest('1.6: Pairwise (1 Spatial Shift + 1 Missing Element) isolation', () => {
    const batch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'missing_nav', errorCode: 'ELEMENT_NOT_RENDERED' }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-pw-missing' });
    assert.equal(report.defects.length, 2);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'btn_shifted');
    const missingCtx = capturedContexts.find(c => c.sourceId === 'missing_nav');

    assert.deepEqual(shiftCtx.siblingShifts, [18]);
    assert.deepEqual(missingCtx.siblingShifts, [], 'Missing element defect must receive empty siblingShifts');

    const missingDef = report.defects.find(d => d.sourceId === 'missing_nav');
    assert.equal(missingDef.category, DEFECT_CATEGORIES.MISSING_ELEMENT);
    assert.equal(missingDef.diagnosis.rootCause, 'ELEMENT_NOT_RENDERED');
    assert.notEqual(missingDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Pairwise 1.6');
  });

  // ============================================================================
  // SUITE 2: Multi-Item Heterogeneous Batches & Fuzzing
  // ============================================================================
  console.log('\n--- Suite 2: Multi-Item Heterogeneous Batches & Fuzzing ---');

  runTest('2.1: Multi-Spatial (2 correlated shifts 16px, 16px) + 3 Non-Spatial Defects', () => {
    const batch = [
      { sourceId: 'btn_a', deltaPx: { dx: 0, dy: 16 } },
      { sourceId: 'btn_b', deltaPx: { dx: 0, dy: 16 } },
      { sourceId: 'headline', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 },
      { sourceId: 'epd_pause', settleMs: 500 },
      { sourceId: 'bad_db', callbackDetached: true }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-multi-spatial' });
    assert.equal(report.defects.length, 5);

    const ctxA = capturedContexts.find(c => c.sourceId === 'btn_a');
    const ctxB = capturedContexts.find(c => c.sourceId === 'btn_b');
    const ctxContrast = capturedContexts.find(c => c.sourceId === 'headline');
    const ctxEpd = capturedContexts.find(c => c.sourceId === 'epd_pause');
    const ctxDb = capturedContexts.find(c => c.sourceId === 'bad_db');

    assert.deepEqual(ctxA.siblingShifts, [16, 16]);
    assert.deepEqual(ctxB.siblingShifts, [16, 16]);
    assert.deepEqual(ctxContrast.siblingShifts, []);
    assert.deepEqual(ctxEpd.siblingShifts, []);
    assert.deepEqual(ctxDb.siblingShifts, []);

    const spatialA = report.defects.find(d => d.sourceId === 'btn_a');
    const spatialB = report.defects.find(d => d.sourceId === 'btn_b');
    const contrast = report.defects.find(d => d.sourceId === 'headline');
    const epd = report.defects.find(d => d.sourceId === 'epd_pause');
    const db = report.defects.find(d => d.sourceId === 'bad_db');

    assert.equal(spatialA.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.equal(spatialB.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.equal(contrast.diagnosis.rootCause, 'THEME_TOKEN_MISREFERENCE');
    assert.equal(epd.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');
    assert.equal(db.diagnosis.rootCause, 'VIEWMODEL_CALLBACK_DETACHMENT');

    assertValidReport(report, 'Multi-Spatial 2.1');
  });

  runTest('2.2: Multi-Spatial (2 uncorrelated shifts 10px, 40px) + 3 Non-Spatial Defects', () => {
    const batch = [
      { sourceId: 'btn_a', deltaPx: { dx: 0, dy: 10 } },
      { sourceId: 'btn_b', deltaPx: { dx: 0, dy: 40 } },
      { sourceId: 'headline', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 },
      { sourceId: 'epd_pause', settleMs: 500 },
      { sourceId: 'bad_db', callbackDetached: true }
    ];

    const report = diagnoseDefects({ failures: batch, runId: 'run-test-uncorrelated' });
    assert.equal(report.defects.length, 5);

    const ctxContrast = capturedContexts.find(c => c.sourceId === 'headline');
    const ctxEpd = capturedContexts.find(c => c.sourceId === 'epd_pause');
    const ctxDb = capturedContexts.find(c => c.sourceId === 'bad_db');

    assert.deepEqual(ctxContrast.siblingShifts, []);
    assert.deepEqual(ctxEpd.siblingShifts, []);
    assert.deepEqual(ctxDb.siblingShifts, []);

    const contrast = report.defects.find(d => d.sourceId === 'headline');
    const epd = report.defects.find(d => d.sourceId === 'epd_pause');
    const db = report.defects.find(d => d.sourceId === 'bad_db');

    assert.notEqual(contrast.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.notEqual(epd.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.notEqual(db.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assertValidReport(report, 'Multi-Spatial 2.2');
  });

  runTest('2.3: 100 Random Shuffles of Full 7-Failure Heterogeneous Batch (Permutation Invariance & Strict Isolation)', () => {
    const baseBatch = [
      { sourceId: 'btn_shifted', deltaPx: { dx: 0, dy: 18 } },
      { sourceId: 'headline_contrast', category: 'CONTRAST_FAILURE', contrastRatio: 2.1 },
      { sourceId: 'small_icon', category: 'TOUCH_TARGET_TOO_SMALL', touchWidthDp: 24, touchHeightDp: 24 },
      { sourceId: 'missing_cta', errorCode: 'ELEMENT_NOT_RENDERED' },
      { sourceId: 'epd_flash', hasEpdHook: true, matchedPattern: 'ACTION_REFRESH_SCREEN' },
      { sourceId: 'missing_font', missingAsset: 'arizona.ttf' },
      { sourceId: 'broken_db', category: 'INVARIANT_BROKEN', callbackDetached: true }
    ];

    // Knuth shuffle helper with fixed seed for determinism
    function shuffle(array, seed) {
      const copy = [...array];
      let m = copy.length, t, i;
      let s = seed;
      while (m) {
        s = (s * 9301 + 49297) % 233280;
        i = Math.floor((s / 233280) * m--);
        t = copy[m];
        copy[m] = copy[i];
        copy[i] = t;
      }
      return copy;
    }

    for (let iteration = 0; iteration < 100; iteration++) {
      capturedContexts = [];
      const shuffledBatch = shuffle(baseBatch, iteration + 1000);
      const report = diagnoseDefects({ failures: shuffledBatch, runId: `fuzz-perm-${iteration}` });

      assert.equal(report.defects.length, 7);

      for (const ctx of capturedContexts) {
        if (ctx.sourceId === 'btn_shifted') {
          assert.equal(ctx.siblingShifts.length, 1);
        } else {
          assert.deepEqual(ctx.siblingShifts, [],
            `Permutation ${iteration}: Context ${ctx.sourceId} must receive empty siblingShifts!`);
        }
      }

      for (const defect of report.defects) {
        if (defect.sourceId === 'btn_shifted') {
          assert.equal(defect.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
        } else {
          // Strict non-spatial guarantee
          assert.notEqual(defect.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION',
            `Permutation ${iteration}: Non-spatial defect ${defect.sourceId} must never be PARENT_INSET_ACCUMULATION!`);
          assert.notEqual(defect.diagnosis.rootCause, 'CUMULATIVE_SPACER_DRIFT',
            `Permutation ${iteration}: Non-spatial defect ${defect.sourceId} must never be CUMULATIVE_SPACER_DRIFT!`);
          assert.notEqual(defect.diagnosis.rootCause, 'HARD_MARGIN_SHIFT_VETO',
            `Permutation ${iteration}: Non-spatial defect ${defect.sourceId} must never be HARD_MARGIN_SHIFT_VETO!`);
        }
      }
    }
  });

  // ============================================================================
  // SUITE 3: Raw Failure Signals Verification
  // ============================================================================
  console.log('\n--- Suite 3: Raw Failure Signals Verification ---');

  runTest('3.1: Raw settleMs >= 500 maps to EPD_FLASH_DETECTED and CRITICAL', () => {
    const testCases = [500, 501, 1000, 2500];
    for (const settleMs of testCases) {
      capturedContexts = [];
      const report = diagnoseDefects({
        failures: [{ sourceId: `epd_node_${settleMs}`, settleMs }]
      });
      assert.equal(report.defects.length, 1);
      const def = report.defects[0];
      assert.equal(def.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
      assert.equal(def.severity, SEVERITY_LEVELS.CRITICAL);
      assert.equal(def.diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');
      const ctx = capturedContexts[0];
      assert.deepEqual(ctx.siblingShifts, []);
      assertValidReport(report, `settleMs: ${settleMs}`);
    }
  });

  runTest('3.2: Raw settleMs = 150 (normal LivePaper settle) does NOT flag as EPD_FLASH_DETECTED', () => {
    const report = diagnoseDefects({
      failures: [{ sourceId: 'normal_settle_node', settleMs: 150, deltaPx: { dx: 0, dy: 12 } }]
    });
    assert.equal(report.defects.length, 1);
    const def = report.defects[0];
    assert.notEqual(def.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
    assert.equal(def.category, DEFECT_CATEGORIES.MARGIN_SHIFT);
  });

  runTest('3.3: Raw touchWidthDp / touchHeightDp < 48 maps to TOUCH_TARGET_TOO_SMALL and MAJOR', () => {
    const testCases = [
      { touchWidthDp: 24, touchHeightDp: 24 },
      { touchWidthDp: 47.9, touchHeightDp: 48 },
      { touchWidthDp: 48, touchHeightDp: 36 },
      { touchWidthDp: 16 }
    ];

    for (const tc of testCases) {
      capturedContexts = [];
      const report = diagnoseDefects({
        failures: [{ sourceId: 'small_touch_node', ...tc }]
      });
      assert.equal(report.defects.length, 1);
      const def = report.defects[0];
      assert.equal(def.category, DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL);
      assert.equal(def.severity, SEVERITY_LEVELS.MAJOR);
      assert.equal(def.diagnosis.rootCause, 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
      const ctx = capturedContexts[0];
      assert.deepEqual(ctx.siblingShifts, []);
      assertValidReport(report, `touch: ${JSON.stringify(tc)}`);
    }
  });

  runTest('3.4: Raw touchWidthPx / touchHeightPx < 96 maps to TOUCH_TARGET_TOO_SMALL', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [{ sourceId: 'small_px_touch', touchWidthPx: 80, touchHeightPx: 80 }]
    });
    assert.equal(report.defects.length, 1);
    const def = report.defects[0];
    assert.equal(def.category, DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL);
    assert.equal(def.diagnosis.rootCause, 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
    const ctx = capturedContexts[0];
    assert.deepEqual(ctx.siblingShifts, []);
    assertValidReport(report, 'touchWidthPx: 80');
  });

  runTest('3.5: Raw callbackDetached: true maps to INVARIANT_BROKEN, CRITICAL, and VIEWMODEL_CALLBACK_DETACHMENT', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [{ sourceId: 'button_callback', callbackDetached: true }]
    });
    assert.equal(report.defects.length, 1);
    const def = report.defects[0];
    assert.equal(def.category, DEFECT_CATEGORIES.INVARIANT_BROKEN);
    assert.equal(def.severity, SEVERITY_LEVELS.CRITICAL);
    assert.equal(def.diagnosis.rootCause, 'VIEWMODEL_CALLBACK_DETACHMENT');
    const ctx = capturedContexts[0];
    assert.deepEqual(ctx.siblingShifts, []);
    assertValidReport(report, 'callbackDetached: true');
  });

  runTest('3.6: Raw persistenceMissing: true maps to INVARIANT_BROKEN, CRITICAL, and VIEWMODEL_CALLBACK_DETACHMENT', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [{ sourceId: 'db_persistence', persistenceMissing: true }]
    });
    assert.equal(report.defects.length, 1);
    const def = report.defects[0];
    assert.equal(def.category, DEFECT_CATEGORIES.INVARIANT_BROKEN);
    assert.equal(def.severity, SEVERITY_LEVELS.CRITICAL);
    assert.equal(def.diagnosis.rootCause, 'VIEWMODEL_CALLBACK_DETACHMENT');
    const ctx = capturedContexts[0];
    assert.deepEqual(ctx.siblingShifts, []);
    assertValidReport(report, 'persistenceMissing: true');
  });

  // ============================================================================
  // SUITE 4: Zero / Negative / Adversarial Boundary Signals
  // ============================================================================
  console.log('\n--- Suite 4: Zero / Negative / Adversarial Boundary Signals ---');

  runTest('4.1: Explicit zero spatial drift { dx: 0, dy: 0, distance: 0 } is NOT treated as spatial drift', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [{ sourceId: 'zero_drift_node', deltaPx: { dx: 0, dy: 0, distance: 0 } }]
    });
    assert.equal(report.defects.length, 1);
    const def = report.defects[0];
    assert.notEqual(def.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    const ctx = capturedContexts[0];
    assert.deepEqual(ctx.siblingShifts, []);
    assertValidReport(report, 'Zero drift');
  });

  runTest('4.2: Contrast defect with spurious deltaPx { dx: 0, dy: 15 } is shielded by category filter', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [
        { sourceId: 'shift_node', deltaPx: { dx: 0, dy: 15 } },
        { sourceId: 'contrast_node', category: 'CONTRAST_FAILURE', contrastRatio: 2.5, deltaPx: { dx: 0, dy: 15 } }
      ]
    });
    assert.equal(report.defects.length, 2);
    const contrastCtx = capturedContexts.find(c => c.sourceId === 'contrast_node');
    assert.deepEqual(contrastCtx.siblingShifts, [], 'Shielded contrast defect must have empty siblingShifts');

    const contrastDef = report.defects.find(d => d.sourceId === 'contrast_node');
    assert.equal(contrastDef.category, DEFECT_CATEGORIES.CONTRAST_FAILURE);
    assert.notEqual(contrastDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Shielded contrast');
  });

  runTest('4.3: EPD defect with spurious deltaPx is shielded by category filter', () => {
    capturedContexts = [];
    const report = diagnoseDefects({
      failures: [
        { sourceId: 'shift_node', deltaPx: { dx: 0, dy: 20 } },
        { sourceId: 'epd_node', settleMs: 600, deltaPx: { dx: 0, dy: 20 } }
      ]
    });
    assert.equal(report.defects.length, 2);
    const epdCtx = capturedContexts.find(c => c.sourceId === 'epd_node');
    assert.deepEqual(epdCtx.siblingShifts, [], 'Shielded EPD defect must have empty siblingShifts');

    const epdDef = report.defects.find(d => d.sourceId === 'epd_node');
    assert.equal(epdDef.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
    assert.notEqual(epdDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assertValidReport(report, 'Shielded EPD');
  });

  // ============================================================================
  // SUITE 5: End-to-End Pipeline Multi-Stage Heterogeneous Aggregation
  // ============================================================================
  console.log('\n--- Suite 5: End-to-End Pipeline Multi-Stage Heterogeneous Aggregation ---');

  await runAsyncTest('5.1: Aggregated multi-stage pipeline result maintains complete heterogeneous isolation', async () => {
    const resShift = await runVerificationPipeline('s1', '/app', {
      stage: 'STAGE_3_LAYOUT_TELEMETRY',
      elements: [{ id: 'cta_btn', expectedX: 100, expectedY: 200, actualX: 100, actualY: 222 }]
    });

    const resContrast = await runVerificationPipeline('s2', '/app', {
      stage: 'STAGE_2_COMPILE_AND_TESTS',
      headlineColor: SOL_OS_TOKENS['--os-200'].hex
    });

    const resEpd = await runVerificationPipeline('s3', '/app', {
      stage: 'STAGE_6_DC1_HARDWARE',
      settleMs: 600
    });

    const combinedVR = {
      outcome: 'FAIL',
      stages: [...resShift.stages, ...resContrast.stages, ...resEpd.stages],
      defects: [...resShift.defects, ...resContrast.defects, ...resEpd.defects]
    };

    capturedContexts = [];
    const dr = diagnoseDefects(combinedVR);
    assert.equal(dr.defects.length, 3);

    const shiftCtx = capturedContexts.find(c => c.sourceId === 'cta_btn');
    const contrastCtx = capturedContexts.find(c => c.sourceId === 'daylight#note_editor/title');
    const epdCtx = capturedContexts.find(c => c.sourceId === 'epd_pause' || c.sourceId.includes('hardware') || c.sourceId.includes('epd'));

    assert.deepEqual(shiftCtx.siblingShifts, [22]);
    assert.deepEqual(contrastCtx.siblingShifts, []);
    assert.deepEqual(epdCtx.siblingShifts, []);

    const shiftDef = dr.defects.find(d => d.sourceId === 'cta_btn');
    const contrastDef = dr.defects.find(d => d.sourceId === 'daylight#note_editor/title');
    const epdDef = dr.defects.find(d => d.sourceId === 'epd_pause' || d.sourceId.includes('hardware') || d.sourceId.includes('epd'));

    assert.equal(shiftDef.category, DEFECT_CATEGORIES.MARGIN_SHIFT);
    assert.equal(shiftDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assert.equal(contrastDef.category, DEFECT_CATEGORIES.CONTRAST_FAILURE);
    assert.notEqual(contrastDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assert.equal(epdDef.category, DEFECT_CATEGORIES.EPD_FLASH_DETECTED);
    assert.notEqual(epdDef.diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');

    assertValidReport(dr, 'Pipeline Multi-Stage Aggregation 5.1');
  });

  console.log('\n==============================================================================');
  console.log(`  Execution Summary: ${passedTests} Passed, ${failedTests} Failed (Total ${passedTests + failedTests})`);
  console.log('==============================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
