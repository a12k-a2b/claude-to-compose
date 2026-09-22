#!/usr/bin/env node

/**
 * ============================================================================
 * Milestone 4 Challenger 1 R3: Deep Empirical NC & Progressive Stoppage Oracle
 *
 * Authored by: Milestone 4 Challenger 1 R3 (critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 *
 * RIGOROUS EMPIRICAL VERIFICATION TARGETS:
 * 1. Verify NC-01 through NC-06 execute through actual verification stages.
 * 2. Verify each negative control halts downstream stages immediately (fail-closed).
 * 3. Verify compound multi-fault injections respect stage ordering stoppage.
 * 4. Verify telemetry preservation and zero fabrication of unmeasured stage metrics.
 * 5. Verify DefectOracle causal attribution and Ajv Draft 2020-12 schema conformance.
 * ============================================================================
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  runVerificationPipeline,
  evaluateStages,
  validateStageName,
  STAGES
} = require('../../src/verification/pipeline');
const { NegativeControlsHarness } = require('../../src/verification/negative_controls');
const { DisplayProfileValidator, SOL_OS_TOKENS } = require('../../src/verification/display_profile');
const { diagnoseDefects } = require('../../src/defects/oracle');
const { DEFECT_CATEGORIES } = require('../../src/defects/taxonomy');

// Ajv Schema Setup
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const verifSchema = ajv.compile(JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../src/verification/schemas/verification_report.json'), 'utf8'
)));
const defectSchema = ajv.compile(JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../src/defects/schemas/defect_report.json'), 'utf8'
)));

function validateReports(verifReport, defectReport, label) {
  const vPass = verifSchema(verifReport);
  if (!vPass) {
    console.error(`VerifSchema Error [${label}]:`, verifSchema.errors);
  }
  assert.equal(vPass, true, `Verification report schema validation failed for ${label}`);

  const dPass = defectSchema(defectReport);
  if (!dPass) {
    console.error(`DefectSchema Error [${label}]:`, defectSchema.errors);
  }
  assert.equal(dPass, true, `Defect report schema validation failed for ${label}`);
}

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function run() {
  console.log('==============================================================================');
  console.log('  MILESTONE 4 CHALLENGER 1 R3: NC & PROGRESSIVE STOPPAGE ORACLE');
  console.log('==============================================================================\n');

  console.log('─── Part 1: Negative Controls NC-01..NC-06 Stage Stoppage ───');

  // NC-01: Stage 1 stops stages 2..6
  await check('NC-01 stops downstream stages at Stage 1', async () => {
    const res = await runVerificationPipeline('screen_nc01', '/dummy/app', {
      requiredNodes: ['node_head', 'node_cta'],
      telemetry: {
        node_head: { boundsPx: { left: 0, top: 0, width: 100, height: 50 } }
      }
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages.length, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'ELEMENT_NOT_RENDERED');

    // Metrics for unexecuted stages must be null (no fabrication)
    assert.equal(res.summary.maxSpatialShiftPx, null);
    assert.equal(res.summary.minContrastRatio, null);
    assert.equal(res.summary.inkIouPercentage, null);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'node_cta');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'ELEMENT_NOT_RENDERED');

    validateReports(res, dr, 'NC-01');
  });

  // NC-02: Stage 3 stops stages 4..6
  await check('NC-02 (Margin Shift >= 10px) stops downstream stages at Stage 3', async () => {
    const res = await runVerificationPipeline('screen_nc02', '/dummy/app', {
      elementComparisons: [
        { sourceId: 'editor_title', expectedX: 100, expectedY: 200, actualX: 100, actualY: 210.0 }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages.length, 3);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].status, 'PASS');
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[1].status, 'PASS');
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stages[2].status, 'FAIL');
    assert.equal(res.stages[2].errorCode, 'GEOMETRY_DRIFT');

    // Stage 4 metrics must be null
    assert.equal(res.summary.inkIouPercentage, null);
    assert.equal(res.summary.sobelContourPercentage, null);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'editor_title');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'HARD_MARGIN_SHIFT_VETO');

    validateReports(res, dr, 'NC-02');
  });

  // NC-03: Stage 1 stops stages 2..6
  await check('NC-03 (Missing Font Asset) stops downstream stages at Stage 1', async () => {
    const res = await runVerificationPipeline('screen_nc03', '/dummy/app', {
      requiredFonts: [
        { family: 'AbcArizonaFlare', file: 'res/font/abc_arizona_flare.ttf', exists: false }
      ]
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages.length, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'FONT_RESOURCE_MISSING');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'ASSET_RESOURCE_MISSING');

    validateReports(res, dr, 'NC-03');
  });

  // NC-04: Stage 4 stops stages 5..6
  await check('NC-04 (Missing Preview Evidence) stops downstream stages at Stage 4 with BLOCKED', async () => {
    const res = await runVerificationPipeline('screen_nc04', '/dummy/app', {
      previewMissing: true
    });

    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 4);
    assert.equal(res.stages.length, 4);
    assert.equal(res.stages[0].status, 'PASS');
    assert.equal(res.stages[1].status, 'PASS');
    assert.equal(res.stages[2].status, 'PASS');
    assert.equal(res.stages[3].stage, 'STAGE_4_PERCEPTUAL_METRICS');
    assert.equal(res.stages[3].status, 'BLOCKED');
    assert.equal(res.stages[3].errorCode, 'PREVIEW_RENDER_MISSING');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'PREVIEW_RENDER_MISSING');

    validateReports(res, dr, 'NC-04');
  });

  // NC-05: Stage 2 stops stages 3..6
  await check('NC-05 (Contrast Collapse) stops downstream stages at Stage 2', async () => {
    const res = await runVerificationPipeline('screen_nc05', '/dummy/app', {
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
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 2);
    assert.equal(res.stages.length, 2);
    assert.equal(res.stages[0].status, 'PASS');
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[1].status, 'FAIL');
    assert.equal(res.stages[1].errorCode, 'CONTRAST_COLLAPSE');

    // Stage 3 and 4 metrics must be null
    assert.equal(res.summary.maxSpatialShiftPx, null);
    assert.equal(res.summary.inkIouPercentage, null);

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].sourceId, 'caption_label');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'CONTRAST_DEFICIT');

    validateReports(res, dr, 'NC-05');
  });

  // NC-06: Stage 6 fails cleanly
  await check('NC-06 (EPD Waveform Workaround) fails at Stage 6', async () => {
    const res = await runVerificationPipeline('screen_nc06', '/dummy/app', {
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.passed, false);
    assert.equal(res.stagesExecutedCount, 6);
    assert.equal(res.stages.length, 6);
    assert.equal(res.stages[5].stage, 'STAGE_6_DC1_HARDWARE');
    assert.equal(res.stages[5].status, 'FAIL');
    assert.equal(res.stages[5].errorCode, 'EPD_WORKAROUND_VIOLATION');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects[0].severity, 'CRITICAL');
    assert.equal(dr.defects[0].diagnosis.rootCause, 'FORBIDDEN_EPD_WORKAROUND');

    validateReports(res, dr, 'NC-06');
  });

  console.log('\n─── Part 2: Compound Multi-Fault Progressive Stoppage ───');

  // Compound 1: NC-01 + NC-05 + NC-06 -> Must halt at Stage 1
  await check('Compound 1: NC-01 + NC-05 + NC-06 halts strictly at Stage 1', async () => {
    const res = await runVerificationPipeline('screen_multi_1', '/dummy/app', {
      requiredNodes: ['req_node'],
      telemetry: {}, // missing req_node -> Stage 1 fail
      contrastPairs: [
        {
          sourceId: 'caption',
          foregroundHex: SOL_OS_TOKENS['--os-200'].hex,
          backgroundHex: SOL_OS_TOKENS['--os-0'].hex
        }
      ],
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[0].errorCode, 'ELEMENT_NOT_RENDERED');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects.length, 1);
    assert.equal(dr.defects[0].sourceId, 'req_node');
  });

  // Compound 2: NC-05 + NC-02 + NC-06 -> Must halt at Stage 2
  await check('Compound 2: NC-05 + NC-02 + NC-06 halts strictly at Stage 2', async () => {
    const res = await runVerificationPipeline('screen_multi_2', '/dummy/app', {
      contrastPairs: [
        {
          sourceId: 'caption',
          foregroundHex: SOL_OS_TOKENS['--os-200'].hex,
          backgroundHex: SOL_OS_TOKENS['--os-0'].hex
        }
      ],
      elementComparisons: [
        { sourceId: 'title', expectedX: 0, expectedY: 0, actualX: 0, actualY: 15.0 }
      ],
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 2);
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[1].errorCode, 'CONTRAST_COLLAPSE');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects.length, 1);
    assert.equal(dr.defects[0].sourceId, 'caption');
    // Ensure spatial drift was NOT evaluated and did NOT contaminate root cause
    assert.notEqual(dr.defects[0].diagnosis.rootCause, 'PARENT_INSET_ACCUMULATION');
    assert.ok(
      dr.defects[0].diagnosis.rootCause === 'CONTRAST_DEFICIT' ||
      dr.defects[0].diagnosis.rootCause === 'THEME_TOKEN_MISREFERENCE',
      `Expected contrast root cause, got: ${dr.defects[0].diagnosis.rootCause}`
    );
  });

  // Compound 3: NC-02 + NC-04 + NC-06 -> Must halt at Stage 3
  await check('Compound 3: NC-02 + NC-04 + NC-06 halts strictly at Stage 3', async () => {
    const res = await runVerificationPipeline('screen_multi_3', '/dummy/app', {
      elementComparisons: [
        { sourceId: 'title', expectedX: 0, expectedY: 0, actualX: 0, actualY: 12.0 }
      ],
      previewMissing: true,
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
    assert.equal(res.stages[2].errorCode, 'GEOMETRY_DRIFT');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'FAIL');
    assert.equal(dr.defects.length, 1);
    assert.equal(dr.defects[0].sourceId, 'title');
  });

  // Compound 4: NC-04 + NC-06 -> Must halt at Stage 4 with BLOCKED
  await check('Compound 4: NC-04 + NC-06 halts strictly at Stage 4 with BLOCKED', async () => {
    const res = await runVerificationPipeline('screen_multi_4', '/dummy/app', {
      previewMissing: true,
      sourceCode: 'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));'
    });

    assert.equal(res.outcome, 'BLOCKED');
    assert.equal(res.stagesExecutedCount, 4);
    assert.equal(res.stages[3].stage, 'STAGE_4_PERCEPTUAL_METRICS');
    assert.equal(res.stages[3].errorCode, 'PREVIEW_RENDER_MISSING');

    const dr = diagnoseDefects(res);
    assert.equal(dr.gateOutcome, 'BLOCKED');
  });

  console.log('\n─── Part 3: Selective Stage Boundaries & Early Exit ───');

  // Selective single stage
  await check('--stage 2 executes ONLY Stage 2', async () => {
    const res = await runVerificationPipeline('screen_sel_2', '/dummy/app', {
      stage: '2'
    });
    assert.equal(res.outcome, 'PASS');
    assert.equal(res.stagesExecutedCount, 1);
    assert.equal(res.stages[0].stage, 'STAGE_2_COMPILE_AND_TESTS');
  });

  // --until-stage 3
  await check('--until-stage 3 executes stages 1, 2, 3 and stops', async () => {
    const res = await runVerificationPipeline('screen_until_3', '/dummy/app', {
      untilStage: '3'
    });
    assert.equal(res.outcome, 'PASS');
    assert.equal(res.stagesExecutedCount, 3);
    assert.equal(res.stages[0].stage, 'STAGE_1_SCHEMA_PROVENANCE');
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
    assert.equal(res.stages[2].stage, 'STAGE_3_LAYOUT_TELEMETRY');
  });

  // --until-stage 4 with failure at stage 2 stops at stage 2
  await check('--until-stage 4 with stage 2 failure stops at stage 2', async () => {
    const res = await runVerificationPipeline('screen_until_fail', '/dummy/app', {
      untilStage: '4',
      compileSuccess: false
    });
    assert.equal(res.outcome, 'FAIL');
    assert.equal(res.stagesExecutedCount, 2);
    assert.equal(res.stages[1].stage, 'STAGE_2_COMPILE_AND_TESTS');
  });

  console.log('\n─── Part 4: NegativeControlsHarness Determinism ───');

  await check('NegativeControlsHarness.runAll() executes all 6 controls deterministically', async () => {
    const harness = new NegativeControlsHarness();
    const all = harness.runAll();
    assert.equal(all.totalControls, 6);
    assert.equal(all.allPassed, true);
    assert.equal(all.results.length, 6);

    for (const r of all.results) {
      assert.equal(r.caught, true, `${r.id} must be caught`);
      assert.equal(r.verdict, r.expectedVerdict, `${r.id} verdict mismatch`);
    }
  });

  console.log('\n==============================================================================');
  console.log(`  ORACLE SUMMARY: ${passed} Passed, ${failed} Failed (Total ${passed + failed})`);
  console.log('==============================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal Oracle Error:', err);
  process.exit(1);
});
