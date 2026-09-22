#!/usr/bin/env node
'use strict';

/**
 * tests/adversarial/run_m2_challenger1_r2_stress.js
 *
 * Empirical Adversarial Challenge Suite: Milestone 2 Round 2
 * NC Oracle & Contract Stress Testing.
 *
 * Focus Areas:
 * 1. NC-05 contrast failure oracle (unreadable body text, failing contrast, AA/AAA thresholds, bg inheritance)
 * 2. NC-06 EPD hooks veto (particle_refresh, Thread.sleep, ACTION_REFRESH_SCREEN across transitions, DOM, options)
 * 3. Negative physical dimensions and non-finite coordinates rejection (schema minimum: 0, builder sanitization, JSON round-trip)
 * 4. Circular child references cycle detection (createMeasuredNode, inferNodeIntent, checkDuplicateSourceIds)
 * 5. Multi-scene duplicate sourceId detection across viewports
 *
 * Executed by: Challenger 1 (Milestone 2 Round 2 - NC Oracle & Contract Stress)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const {
  buildDesignContract,
  synthesizeLayers,
  validateContractAgainstSchemas,
  checkDuplicateSourceIds
} = require('../../src/contract/compiler');

const {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId
} = require('../../src/contract/measured_scene_builder');

const {
  inferNodeIntent,
  createLayoutIntentBundle
} = require('../../src/contract/layout_intent_builder');

const {
  createBehaviorContract
} = require('../../src/contract/behavior_contract_builder');

const {
  createDesignSystemContract,
  verifyContrast,
  contrastRatio,
  assertNoEpdHooks,
  FORBIDDEN_EPD_PATTERNS,
  SOL_OS_NEUTRAL_TOKENS
} = require('../../src/contract/design_system_builder');

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, group, passed, details = {}) {
  results.push({ id, name, group, passed, details });
  if (passed) {
    passCount++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m [${id}] ${name}`);
    if (details.error) {
      console.log(`     Error: ${details.error}`);
    }
  }
}

// Setup Ajv with measured_scene schema
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const measuredSceneSchema = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../src/contract/schemas/measured_scene.json'), 'utf8')
);
const validateMeasuredScene = ajv.compile(measuredSceneSchema);

async function runAllTests() {
  console.log('\n======================================================================');
  console.log('  CHALLENGER 1 (M2 R2) EMPIRICAL STRESS & NC ORACLE HARNESS');
  console.log('======================================================================\n');

  // ==========================================================================
  // GROUP 1: NC-05 Contrast Failure Active Oracle
  // ==========================================================================
  console.log('\n--- Group 1: NC-05 Contrast Failure Active Oracle ---');

  // Test 1.1: Body text with --os-200 (#CCCCCC) on white (#FFFFFF) fails buildDesignContract
  try {
    const testDir = path.resolve('.ctc/test_stress_nc05_1');
    const evidence = {
      screenId: 'screen_nc05_faint',
      capturedAt: new Date().toISOString(),
      domNodes: [
        {
          id: 'heading_node',
          tag: 'h1',
          sourceId: 'daylight#screen_nc05_faint/heading',
          bounds: { x: 20, y: 40, width: 300, height: 32 },
          textRuns: [{ content: 'Proper Heading', colorHex: '#1A1A1A', fontSizePx: 24 }]
        },
        {
          id: 'unreadable_body',
          tag: 'p',
          sourceId: 'daylight#screen_nc05_faint/body_faint',
          bounds: { x: 20, y: 80, width: 400, height: 20 },
          textRuns: [{ content: 'Virtually invisible text', colorHex: '#CCCCCC', fontSizePx: 14, fontWeight: 400 }]
        }
      ]
    };

    const res = buildDesignContract('screen_nc05_faint', evidence, { outputDir: testDir, strict: false });
    const correctFailure =
      res.success === false &&
      res.receipt.status === 'FAIL' &&
      res.receipt.compliance.wcagContrastPassed === false &&
      res.receipt.errors.some(e => e.includes('Contrast failure on daylight#screen_nc05_faint/body_faint'));

    recordTest(
      'M2-C1-1.1',
      'Unreadable body text (--os-200 on white) causes deterministic receipt status FAIL and wcagContrastPassed: false',
      'NC-05 Contrast',
      correctFailure,
      { status: res.receipt.status, wcagContrastPassed: res.receipt.compliance.wcagContrastPassed, errors: res.receipt.errors }
    );
  } catch (err) {
    recordTest('M2-C1-1.1', 'Unreadable body text causes deterministic status FAIL', 'NC-05 Contrast', false, { error: err.message });
  }

  // Test 1.2: Contrast failure in strict mode throws CONTRAST_VIOLATION with exitCode 4
  try {
    const evidence = {
      screenId: 'screen_nc05_strict',
      domNodes: [
        {
          id: 'unreadable_body_strict',
          tag: 'p',
          sourceId: 'daylight#screen_nc05_strict/body_faint',
          bounds: { x: 20, y: 80, width: 400, height: 20 },
          textRuns: [{ content: 'Failing contrast body', colorHex: '#CCCCCC', fontSizePx: 14 }]
        }
      ]
    };

    let caughtError = null;
    try {
      buildDesignContract('screen_nc05_strict', evidence, { strict: true });
    } catch (err) {
      caughtError = err;
    }

    const passed = caughtError !== null && caughtError.code === 'CONTRAST_VIOLATION' && caughtError.exitCode === 4;
    recordTest(
      'M2-C1-1.2',
      'Contrast failure in strict mode throws CONTRAST_VIOLATION error with exitCode 4',
      'NC-05 Contrast',
      passed,
      { code: caughtError?.code, exitCode: caughtError?.exitCode, message: caughtError?.message }
    );
  } catch (err) {
    recordTest('M2-C1-1.2', 'Contrast failure strict mode throws CONTRAST_VIOLATION', 'NC-05 Contrast', false, { error: err.message });
  }

  // Test 1.3: Low-emphasis text --os-300 (#858585) ratio 3.69:1 fails 7.0:1 AAA body text threshold
  try {
    const evidence = {
      screenId: 'screen_nc05_os300',
      domNodes: [
        {
          id: 'tertiary_body',
          tag: 'span',
          sourceId: 'daylight#screen_nc05_os300/label',
          bounds: { x: 10, y: 10, width: 200, height: 20 },
          textRuns: [{ content: 'Tertiary label', colorHex: '--os-300', fontSizePx: 14, fontWeight: 400 }]
        }
      ]
    };
    const res = buildDesignContract('screen_nc05_os300', evidence, { strict: false });
    const passed = res.receipt.status === 'FAIL' && res.receipt.compliance.wcagContrastPassed === false;
    recordTest(
      'M2-C1-1.3',
      'Token --os-300 (ratio 3.69:1) on white fails required 7.0:1 AAA threshold for body text',
      'NC-05 Contrast',
      passed,
      { ratio: 3.69, required: 7.0, status: res.receipt.status }
    );
  } catch (err) {
    recordTest('M2-C1-1.3', '--os-300 fails 7.0:1 AAA', 'NC-05 Contrast', false, { error: err.message });
  }

  // Test 1.4: Large text (>= 24px) requires only 4.5:1 (AA) and passes with ratio >= 4.5
  try {
    // #737373 on white has contrast ratio 4.87:1. Large text (24px) should PASS; body text (14px) should FAIL.
    const largeEvidence = {
      screenId: 'screen_nc05_large_text',
      domNodes: [
        {
          id: 'large_heading',
          tag: 'h1',
          sourceId: 'daylight#screen_nc05_large_text/heading',
          bounds: { x: 10, y: 10, width: 300, height: 40 },
          textRuns: [{ content: 'Large Banner Text', colorHex: '#737373', fontSizePx: 26, fontWeight: 400 }]
        }
      ]
    };
    const resLarge = buildDesignContract('screen_nc05_large_text', largeEvidence, { strict: false });
    const largePassed = resLarge.receipt.status === 'PASS' && resLarge.receipt.compliance.wcagContrastPassed === true;

    const smallEvidence = {
      screenId: 'screen_nc05_small_text',
      domNodes: [
        {
          id: 'small_body',
          tag: 'p',
          sourceId: 'daylight#screen_nc05_small_text/body',
          bounds: { x: 10, y: 10, width: 300, height: 20 },
          textRuns: [{ content: 'Same color small text', colorHex: '#737373', fontSizePx: 14, fontWeight: 400 }]
        }
      ]
    };
    const resSmall = buildDesignContract('screen_nc05_small_text', smallEvidence, { strict: false });
    const smallFailed = resSmall.receipt.status === 'FAIL' && resSmall.receipt.compliance.wcagContrastPassed === false;

    recordTest(
      'M2-C1-1.4',
      'Large text (>=24px) passes at 4.87:1 (AA >=4.5:1) while regular text fails at 4.87:1 (AAA <7.0:1)',
      'NC-05 Contrast',
      largePassed && smallFailed,
      { largePassed, smallFailed }
    );
  } catch (err) {
    recordTest('M2-C1-1.4', 'Large text AA vs AAA differentiation', 'NC-05 Contrast', false, { error: err.message });
  }

  // Test 1.5: Container background inheritance (dark card background with light text)
  try {
    const evidence = {
      screenId: 'screen_nc05_dark_card',
      scenes: {
        daylight_portrait: {
          viewport: { widthPx: 1184, heightPx: 1584, density: 2.0, widthDp: 592, heightDp: 792, orientation: 'portrait' },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: 'screenshots/daylight_portrait.png',
          loadedFonts: [],
          loadedAssets: [],
          rootNode: {
            id: 'root',
            sourceId: 'daylight#screen_nc05_dark_card/root',
            domTag: 'div',
            domClasses: [],
            bounds: { x: 0, y: 0, width: 1184, height: 1584 },
            boundsDp: { x: 0, y: 0, width: 592, height: 792 },
            paintBounds: { left: 0, top: 0, right: 1184, bottom: 1584 },
            paintBoundsDp: { left: 0, top: 0, right: 592, bottom: 792 },
            paintOrder: 0,
            zIndex: 0,
            computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
            semantics: { role: 'container', isInteractive: false },
            hitRegions: { visualBoundsDp: { x: 0, y: 0, width: 592, height: 792 }, interactiveBoundsDp: { x: 0, y: 0, width: 592, height: 792 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
            children: [
              {
                id: 'dark_card',
                sourceId: 'daylight#screen_nc05_dark_card/dark_card',
                domTag: 'div',
                domClasses: [],
                bounds: { x: 40, y: 40, width: 400, height: 200 },
                boundsDp: { x: 20, y: 20, width: 200, height: 100 },
                paintBounds: { left: 40, top: 40, right: 440, bottom: 240 },
                paintBoundsDp: { left: 20, top: 20, right: 220, bottom: 120 },
                paintOrder: 1,
                zIndex: 0,
                computedPaint: { backgroundColor: '#1A1A1A', opacity: 1.0 }, // Dark surface --os-900
                semantics: { role: 'container', isInteractive: false },
                hitRegions: { visualBoundsDp: { x: 20, y: 20, width: 200, height: 100 }, interactiveBoundsDp: { x: 20, y: 20, width: 200, height: 100 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
                children: [
                  {
                    id: 'white_text_on_dark',
                    sourceId: 'daylight#screen_nc05_dark_card/white_text',
                    domTag: 'p',
                    domClasses: [],
                    bounds: { x: 50, y: 50, width: 300, height: 30 },
                    boundsDp: { x: 25, y: 25, width: 150, height: 15 },
                    paintBounds: { left: 50, top: 50, right: 350, bottom: 80 },
                    paintBoundsDp: { left: 25, top: 25, right: 175, bottom: 40 },
                    paintOrder: 2,
                    zIndex: 0,
                    computedPaint: { backgroundColor: '#00000000', opacity: 1.0 },
                    semantics: { role: 'text', isInteractive: false },
                    textRuns: [{ content: 'White text on dark surface', colorHex: '#FFFFFF', fontSizePx: 14, fontWeight: 400 }],
                    hitRegions: { visualBoundsDp: { x: 25, y: 25, width: 150, height: 15 }, interactiveBoundsDp: { x: 25, y: 25, width: 150, height: 15 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
                    children: []
                  }
                ]
              }
            ]
          }
        }
      }
    };

    const res = buildDesignContract('screen_nc05_dark_card', evidence, { strict: true });
    const passed = res.success === true && res.receipt.status === 'PASS' && res.receipt.compliance.wcagContrastPassed === true;
    recordTest(
      'M2-C1-1.5',
      'Text correctly inherits parent container background (#1A1A1A) so white text evaluates to 15.9:1 and passes',
      'NC-05 Contrast',
      passed,
      { status: res.receipt.status, wcagContrastPassed: res.receipt.compliance.wcagContrastPassed }
    );
  } catch (err) {
    recordTest('M2-C1-1.5', 'Parent background inheritance', 'NC-05 Contrast', false, { error: err.message });
  }

  // Test 1.6: Multi-scene contrast check (fails contract if landscape has contrast violation even if portrait passes)
  try {
    const validSceneRoot = {
      id: 'root',
      sourceId: 'daylight#screen_nc05_multiscene/root_p',
      domTag: 'div',
      domClasses: [],
      bounds: { x: 0, y: 0, width: 1184, height: 1584 },
      boundsDp: { x: 0, y: 0, width: 592, height: 792 },
      paintBounds: { left: 0, top: 0, right: 1184, bottom: 1584 },
      paintBoundsDp: { left: 0, top: 0, right: 592, bottom: 792 },
      paintOrder: 0,
      zIndex: 0,
      computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
      semantics: { role: 'container', isInteractive: false },
      hitRegions: { visualBoundsDp: { x: 0, y: 0, width: 592, height: 792 }, interactiveBoundsDp: { x: 0, y: 0, width: 592, height: 792 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
      children: [
        {
          id: 'good_text',
          sourceId: 'daylight#screen_nc05_multiscene/text_p',
          domTag: 'p',
          domClasses: [],
          bounds: { x: 10, y: 10, width: 200, height: 20 },
          boundsDp: { x: 5, y: 5, width: 100, height: 10 },
          paintBounds: { left: 10, top: 10, right: 210, bottom: 30 },
          paintBoundsDp: { left: 5, top: 5, right: 105, bottom: 15 },
          paintOrder: 1,
          zIndex: 0,
          computedPaint: { backgroundColor: '#00000000', opacity: 1.0 },
          semantics: { role: 'text', isInteractive: false },
          textRuns: [{ content: 'High contrast text', colorHex: '#1A1A1A', fontSizePx: 14 }],
          hitRegions: { visualBoundsDp: { x: 5, y: 5, width: 100, height: 10 }, interactiveBoundsDp: { x: 5, y: 5, width: 100, height: 10 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
          children: []
        }
      ]
    };

    const badSceneRoot = {
      id: 'root_l',
      sourceId: 'daylight#screen_nc05_multiscene/root_l',
      domTag: 'div',
      domClasses: [],
      bounds: { x: 0, y: 0, width: 1584, height: 1184 },
      boundsDp: { x: 0, y: 0, width: 792, height: 592 },
      paintBounds: { left: 0, top: 0, right: 1584, bottom: 1184 },
      paintBoundsDp: { left: 0, top: 0, right: 792, bottom: 592 },
      paintOrder: 0,
      zIndex: 0,
      computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
      semantics: { role: 'container', isInteractive: false },
      hitRegions: { visualBoundsDp: { x: 0, y: 0, width: 792, height: 592 }, interactiveBoundsDp: { x: 0, y: 0, width: 792, height: 592 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
      children: [
        {
          id: 'bad_text',
          sourceId: 'daylight#screen_nc05_multiscene/text_l',
          domTag: 'p',
          domClasses: [],
          bounds: { x: 10, y: 10, width: 200, height: 20 },
          boundsDp: { x: 5, y: 5, width: 100, height: 10 },
          paintBounds: { left: 10, top: 10, right: 210, bottom: 30 },
          paintBoundsDp: { left: 5, top: 5, right: 105, bottom: 15 },
          paintOrder: 1,
          zIndex: 0,
          computedPaint: { backgroundColor: '#00000000', opacity: 1.0 },
          semantics: { role: 'text', isInteractive: false },
          textRuns: [{ content: 'Unreadable in landscape only', colorHex: '#CCCCCC', fontSizePx: 14 }],
          hitRegions: { visualBoundsDp: { x: 5, y: 5, width: 100, height: 10 }, interactiveBoundsDp: { x: 5, y: 5, width: 100, height: 10 }, meetsMinTouchTarget: false, slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 } },
          children: []
        }
      ]
    };

    const evidence = {
      screenId: 'screen_nc05_multiscene',
      scenes: {
        daylight_portrait: {
          viewport: { widthPx: 1184, heightPx: 1584, density: 2.0, widthDp: 592, heightDp: 792, orientation: 'portrait' },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: 'screenshots/daylight_portrait.png',
          loadedFonts: [],
          loadedAssets: [],
          rootNode: validSceneRoot
        },
        daylight_landscape: {
          viewport: { widthPx: 1584, heightPx: 1184, density: 2.0, widthDp: 792, heightDp: 592, orientation: 'landscape' },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: 'screenshots/daylight_landscape.png',
          loadedFonts: [],
          loadedAssets: [],
          rootNode: badSceneRoot
        }
      }
    };

    const res = buildDesignContract('screen_nc05_multiscene', evidence, { strict: false });
    const passed = res.receipt.status === 'FAIL' && res.receipt.compliance.wcagContrastPassed === false;
    recordTest(
      'M2-C1-1.6',
      'Multi-scene contract evaluation inspects both portrait and landscape scenes, failing if any scene violates contrast',
      'NC-05 Contrast',
      passed,
      { status: res.receipt.status, wcagContrastPassed: res.receipt.compliance.wcagContrastPassed }
    );
  } catch (err) {
    recordTest('M2-C1-1.6', 'Multi-scene contrast inspection', 'NC-05 Contrast', false, { error: err.message });
  }

  // ==========================================================================
  // GROUP 2: NC-06 EPD Hooks Interception & Veto
  // ==========================================================================
  console.log('\n--- Group 2: NC-06 EPD Hooks Interception & Veto ---');

  // Test 2.1: assertNoEpdHooks pattern coverage
  const requiredPatterns = [
    'particle_refresh',
    'PARTICLE_REFRESH',
    'Thread.sleep',
    'ACTION_REFRESH_SCREEN',
    'android.intent.action.ACTION_REFRESH_SCREEN',
    'com.eink.REFRESH_WAVEFORM',
    'REFRESH_WAVEFORM',
    'epd_clear',
    'waveform_mode',
    'modal_dismiss_pause',
    'artificial_pause'
  ];

  let patternFailures = [];
  for (const pat of requiredPatterns) {
    let threw = false;
    try {
      assertNoEpdHooks(`test_code_calling_${pat}_here()`);
    } catch (e) {
      if (e.code === 'EPD_WORKAROUND_VIOLATION') threw = true;
    }
    if (!threw) patternFailures.push(pat);
  }

  recordTest(
    'M2-C1-2.1',
    'assertNoEpdHooks vetoes all required EPD patterns including particle_refresh, Thread.sleep, and ACTION_REFRESH_SCREEN',
    'NC-06 EPD Hooks',
    patternFailures.length === 0,
    { uninterceptedPatterns: patternFailures }
  );

  // Test 2.2: Interception of particle_refresh in transitions/actions
  try {
    const evidence = {
      screenId: 'screen_nc06_trans_particle',
      stateVariables: [{ name: 'screenState', type: 'String', initialValue: 'VIEWING' }],
      namedStates: [{ stateName: 'VIEWING' }, { stateName: 'REFRESHED' }],
      transitions: [
        {
          fromState: 'VIEWING',
          toState: 'REFRESHED',
          triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#root/refresh_button' },
          appAction: {
            actionName: 'doRefresh',
            script: 'daylight_hardware.particle_refresh()'
          }
        }
      ]
    };

    let intercepted = false;
    let details = {};
    try {
      const res = buildDesignContract('screen_nc06_trans_particle', evidence, { strict: false });
      if (res.receipt && (res.receipt.status === 'FAIL' || res.receipt.compliance.zeroEpdWaveformsConfirmed === false)) {
        intercepted = true;
        details = { type: 'receipt_status_fail', status: res.receipt.status, zeroEpd: res.receipt.compliance.zeroEpdWaveformsConfirmed };
      }
    } catch (err) {
      if (err.code === 'EPD_WORKAROUND_VIOLATION' || err.message.includes('EPD workaround violation')) {
        intercepted = true;
        details = { type: 'thrown_exception_veto', code: err.code, message: err.message };
      }
    }

    recordTest(
      'M2-C1-2.2',
      'Transition action with particle_refresh() is intercepted and vetoed from successful compilation',
      'NC-06 EPD Hooks',
      intercepted,
      details
    );
  } catch (err) {
    recordTest('M2-C1-2.2', 'particle_refresh in transition', 'NC-06 EPD Hooks', false, { error: err.message });
  }

  // Test 2.3: Interception of Thread.sleep in transition script
  try {
    const evidence = {
      screenId: 'screen_nc06_trans_sleep',
      stateVariables: [{ name: 'modalOpen', type: 'Boolean', initialValue: 'true' }],
      namedStates: [{ stateName: 'OPEN' }, { stateName: 'CLOSED' }],
      transitions: [
        {
          fromState: 'OPEN',
          toState: 'CLOSED',
          triggerEvent: { eventType: 'KEY_EVENT', keyCode: 111, targetSourceId: 'daylight#root/modal' },
          appAction: {
            actionName: 'dismissModal',
            script: 'Thread.sleep(500); // Wait for waveform flash'
          }
        }
      ]
    };

    let intercepted = false;
    let details = {};
    try {
      const res = buildDesignContract('screen_nc06_trans_sleep', evidence, { strict: false });
      if (res.receipt && (res.receipt.status === 'FAIL' || res.receipt.compliance.zeroEpdWaveformsConfirmed === false)) {
        intercepted = true;
        details = { type: 'receipt_status_fail', status: res.receipt.status };
      }
    } catch (err) {
      if (err.code === 'EPD_WORKAROUND_VIOLATION' || err.message.includes('Thread.sleep')) {
        intercepted = true;
        details = { type: 'thrown_exception_veto', code: err.code, message: err.message };
      }
    }

    recordTest(
      'M2-C1-2.3',
      'Transition script containing Thread.sleep() is intercepted and vetoed',
      'NC-06 EPD Hooks',
      intercepted,
      details
    );
  } catch (err) {
    recordTest('M2-C1-2.3', 'Thread.sleep in transition script', 'NC-06 EPD Hooks', false, { error: err.message });
  }

  // Test 2.4: Interception of ACTION_REFRESH_SCREEN in transition actionName
  try {
    const evidence = {
      screenId: 'screen_nc06_action_name',
      stateVariables: [{ name: 'state', type: 'String', initialValue: 'IDLE' }],
      namedStates: [{ stateName: 'IDLE' }, { stateName: 'DONE' }],
      transitions: [
        {
          fromState: 'IDLE',
          toState: 'DONE',
          triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#root/btn' },
          appAction: {
            actionName: 'ACTION_REFRESH_SCREEN',
            script: 'context.sendBroadcast(intent)'
          }
        }
      ]
    };

    let intercepted = false;
    let details = {};
    try {
      const res = buildDesignContract('screen_nc06_action_name', evidence, { strict: false });
      if (res.receipt && (res.receipt.status === 'FAIL' || res.receipt.compliance.zeroEpdWaveformsConfirmed === false)) {
        intercepted = true;
        details = { type: 'receipt_status_fail', status: res.receipt.status };
      }
    } catch (err) {
      if (err.code === 'EPD_WORKAROUND_VIOLATION' || err.message.includes('ACTION_REFRESH_SCREEN')) {
        intercepted = true;
        details = { type: 'thrown_exception_veto', code: err.code, message: err.message };
      }
    }

    recordTest(
      'M2-C1-2.4',
      'Action name containing ACTION_REFRESH_SCREEN is intercepted and vetoed',
      'NC-06 EPD Hooks',
      intercepted,
      details
    );
  } catch (err) {
    recordTest('M2-C1-2.4', 'ACTION_REFRESH_SCREEN in actionName', 'NC-06 EPD Hooks', false, { error: err.message });
  }

  // Test 2.5: EPD hook in strict mode throws EPD_WORKAROUND_VIOLATION with exitCode 4
  try {
    const evidence = {
      screenId: 'screen_nc06_strict',
      stateVariables: [{ name: 'state', type: 'String', initialValue: 'IDLE' }],
      transitions: [
        {
          fromState: 'IDLE',
          toState: 'BUSY',
          triggerEvent: { eventType: 'TAP', targetSourceId: 'daylight#root/btn' },
          appAction: { actionName: 'clear', script: 'particle_refresh()' }
        }
      ]
    };

    let caughtError = null;
    try {
      buildDesignContract('screen_nc06_strict', evidence, { strict: true });
    } catch (err) {
      caughtError = err;
    }

    const passed = caughtError !== null && caughtError.code === 'EPD_WORKAROUND_VIOLATION' && caughtError.exitCode === 4;
    recordTest(
      'M2-C1-2.5',
      'EPD hook violation in strict mode throws EPD_WORKAROUND_VIOLATION with exitCode 4',
      'NC-06 EPD Hooks',
      passed,
      { code: caughtError?.code, exitCode: caughtError?.exitCode }
    );
  } catch (err) {
    recordTest('M2-C1-2.5', 'EPD hook strict mode throws', 'NC-06 EPD Hooks', false, { error: err.message });
  }

  // Test 2.6: Deep scan catches forbidden pattern (modal_dismiss_pause) embedded in DOM node attributes
  try {
    const evidence = {
      screenId: 'screen_nc06_dom_hook',
      domNodes: [
        {
          id: 'bad_button',
          tag: 'button',
          sourceId: 'daylight#screen_nc06_dom_hook/btn',
          bounds: { x: 0, y: 0, width: 100, height: 48 },
          onClick: 'trigger_modal_dismiss_pause()'
        }
      ]
    };

    const res = buildDesignContract('screen_nc06_dom_hook', evidence, { strict: false });
    const passed = res.receipt.status === 'FAIL' && res.receipt.compliance.zeroEpdWaveformsConfirmed === false;
    recordTest(
      'M2-C1-2.6',
      'Deep scan catches forbidden pattern (modal_dismiss_pause) embedded in DOM node attributes and emits receipt FAIL',
      'NC-06 EPD Hooks',
      passed,
      { status: res.receipt.status, errors: res.receipt.errors }
    );
  } catch (err) {
    recordTest('M2-C1-2.6', 'EPD hook in DOM node', 'NC-06 EPD Hooks', false, { error: err.message });
  }

  // ==========================================================================
  // GROUP 3: Negative Physical Dimensions & Non-Finite Coordinates Rejection
  // ==========================================================================
  console.log('\n--- Group 3: Negative Dimensions & Non-Finite Sanitization ---');

  // Test 3.1: Schema rejection of negative width/height (measured_scene.json Draft 2020-12 minimum: 0)
  try {
    const rawInvalidNode = {
      id: 'bad_dim_node',
      sourceId: 'daylight#root/bad_dim',
      domTag: 'div',
      domClasses: [],
      bounds: { x: 10, y: 20, width: -100, height: 50 }, // Negative width
      boundsDp: { x: 5, y: 10, width: -50, height: 25 },
      paintBounds: { left: 10, top: 20, right: -90, bottom: 70 },
      paintBoundsDp: { left: 5, top: 10, right: -45, bottom: 35 },
      paintOrder: 0,
      zIndex: 0,
      clipChain: [],
      transformChain: [],
      textRuns: [],
      baselines: { firstBaselinePx: 0, lastBaselinePx: 0, alphabeticBaselineY: 0 },
      lineBreaks: [],
      computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
      semantics: { role: 'container', isInteractive: false },
      hitRegions: {
        visualBoundsDp: { x: 5, y: 10, width: 0, height: 25 },
        interactiveBoundsDp: { x: 5, y: 10, width: 0, height: 25 },
        meetsMinTouchTarget: false,
        slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      children: []
    };

    const bundle = {
      version: '2.0.0',
      screenId: 'test_screen',
      capturedAt: new Date().toISOString(),
      scenes: {
        daylight_portrait: {
          viewport: { widthPx: 1184, heightPx: 1584, density: 2.0, widthDp: 592, heightDp: 792, orientation: 'portrait' },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: 'screenshots/daylight_portrait.png',
          loadedFonts: [],
          loadedAssets: [],
          rootNode: rawInvalidNode
        }
      }
    };

    const valid = validateMeasuredScene(bundle);
    const errors = validateMeasuredScene.errors || [];
    const rejectedBySchema = !valid && errors.some(e => e.keyword === 'minimum' && (e.instancePath.includes('width') || e.instancePath.includes('height')));

    recordTest(
      'M2-C1-3.1',
      'JSON Schema Draft 2020-12 strictly rejects negative width/height with minimum: 0 violation',
      'Dimensions & Coordinates',
      rejectedBySchema,
      { valid, errorKeywords: errors.map(e => `${e.instancePath} ${e.keyword}`) }
    );
  } catch (err) {
    recordTest('M2-C1-3.1', 'Schema rejection of negative dimensions', 'Dimensions & Coordinates', false, { error: err.message });
  }

  // Test 3.2: Negative (x, y) coordinates with positive dimensions are accepted (offscreen bounds)
  try {
    const offscreenNode = {
      id: 'offscreen_node',
      sourceId: 'daylight#root/offscreen',
      domTag: 'div',
      domClasses: [],
      bounds: { x: -100, y: -200, width: 300, height: 150 }, // Negative x, y allowed
      boundsDp: { x: -50, y: -100, width: 150, height: 75 },
      paintBounds: { left: -100, top: -200, right: 200, bottom: -50 },
      paintBoundsDp: { left: -50, top: -100, right: 100, bottom: -25 },
      paintOrder: 0,
      zIndex: 0,
      clipChain: [],
      transformChain: [],
      textRuns: [],
      baselines: { firstBaselinePx: 0, lastBaselinePx: 0, alphabeticBaselineY: 0 },
      lineBreaks: [],
      computedPaint: { backgroundColor: '#FFFFFF', opacity: 1.0 },
      semantics: { role: 'container', isInteractive: false },
      hitRegions: {
        visualBoundsDp: { x: -50, y: -100, width: 150, height: 75 },
        interactiveBoundsDp: { x: -50, y: -100, width: 150, height: 75 },
        meetsMinTouchTarget: false,
        slopInsetsDp: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      children: []
    };

    const bundle = {
      version: '2.0.0',
      screenId: 'test_screen',
      capturedAt: new Date().toISOString(),
      scenes: {
        daylight_portrait: {
          viewport: { widthPx: 1184, heightPx: 1584, density: 2.0, widthDp: 592, heightDp: 792, orientation: 'portrait' },
          screenshotHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          screenshotPath: 'screenshots/daylight_portrait.png',
          loadedFonts: [],
          loadedAssets: [],
          rootNode: offscreenNode
        }
      }
    };

    const valid = validateMeasuredScene(bundle);
    recordTest(
      'M2-C1-3.2',
      'Negative offscreen positions (x < 0, y < 0) are permitted by schema as long as width and height >= 0',
      'Dimensions & Coordinates',
      valid === true,
      { valid, errors: validateMeasuredScene.errors }
    );
  } catch (err) {
    recordTest('M2-C1-3.2', 'Negative coordinates allowed', 'Dimensions & Coordinates', false, { error: err.message });
  }

  // Test 3.3: createMeasuredNode sanitization of negative dimensions via toNonNegative
  try {
    const node = createMeasuredNode({
      bounds: { x: -50, y: -25, width: -400, height: -200 }
    });

    const passed =
      node.bounds.x === -50 &&
      node.bounds.y === -25 &&
      node.bounds.width === 0 &&
      node.bounds.height === 0 &&
      node.boundsDp.width === 0 &&
      node.boundsDp.height === 0;

    recordTest(
      'M2-C1-3.3',
      'createMeasuredNode clamps negative width and height to 0 while preserving negative (x, y) coordinates',
      'Dimensions & Coordinates',
      passed,
      { bounds: node.bounds, boundsDp: node.boundsDp }
    );
  } catch (err) {
    recordTest('M2-C1-3.3', 'createMeasuredNode bounds sanitization', 'Dimensions & Coordinates', false, { error: err.message });
  }

  // Test 3.4: Non-finite numbers (Infinity, -Infinity, NaN) in createMeasuredNode & inferNodeIntent
  try {
    const node = createMeasuredNode({
      bounds: { x: Infinity, y: -Infinity, width: Infinity, height: NaN }
    });

    const nodeSanitized =
      Number.isFinite(node.bounds.x) &&
      Number.isFinite(node.bounds.y) &&
      Number.isFinite(node.bounds.width) &&
      Number.isFinite(node.bounds.height);

    const intent = inferNodeIntent({
      sourceId: 'daylight#root/intent_inf',
      fixedHeightDp: Infinity,
      fixedWidthDp: -Infinity,
      minWidthDp: NaN,
      measuredWidthAcrossViewports: [Infinity, NaN]
    });

    const intentSanitized =
      Number.isFinite(intent.sizing.fixedHeightDp) &&
      Number.isFinite(intent.sizing.fixedWidthDp) &&
      Number.isFinite(intent.sizing.minWidthDp) &&
      Number.isFinite(intent.confidence);

    recordTest(
      'M2-C1-3.4',
      'createMeasuredNode and inferNodeIntent sanitize Infinity, -Infinity, and NaN to safe finite numbers',
      'Dimensions & Coordinates',
      nodeSanitized && intentSanitized,
      { nodeBounds: node.bounds, intentSizing: intent.sizing, confidence: intent.confidence }
    );
  } catch (err) {
    recordTest('M2-C1-3.4', 'Non-finite numbers sanitization', 'Dimensions & Coordinates', false, { error: err.message });
  }

  // Test 3.5: JSON round-trip serialization and schema validation
  try {
    const intent = inferNodeIntent({
      sourceId: 'daylight#root/json_inf',
      fixedHeightDp: Infinity,
      fixedWidthDp: 300,
      widthMode: 'FIXED',
      heightMode: 'FIXED'
    });

    const intentBundle = createLayoutIntentBundle({
      screenId: 'test_roundtrip',
      rootIntent: intent
    });

    // Simulate serialization to disk and reload
    const serialized = JSON.stringify(intentBundle);
    const parsed = JSON.parse(serialized);

    // Verify parsed does not contain null where numbers are expected
    const noNullNumbers = parsed.rootIntent.sizing.fixedHeightDp !== null && typeof parsed.rootIntent.sizing.fixedHeightDp === 'number';

    const measured = createMeasuredBundle({ screenId: 'test_roundtrip' });
    const behavior = createBehaviorContract({ screenId: 'test_roundtrip' });
    const design = createDesignSystemContract();

    const val = validateContractAgainstSchemas({
      layoutIntent: parsed,
      measuredScenes: measured,
      behaviorContract: behavior,
      designSystem: design
    });

    recordTest(
      'M2-C1-3.5',
      'JSON round-trip preserves valid finite numbers without converting Infinity to null or violating schema',
      'Dimensions & Coordinates',
      noNullNumbers && val.valid === true,
      { fixedHeightDp: parsed.rootIntent.sizing.fixedHeightDp, schemaValid: val.valid, schemaErrors: val.errors }
    );
  } catch (err) {
    recordTest('M2-C1-3.5', 'JSON round-trip validation', 'Dimensions & Coordinates', false, { error: err.message });
  }

  // ==========================================================================
  // GROUP 4: Circular Child References Cycle Detection
  // ==========================================================================
  console.log('\n--- Group 4: Circular Child References Cycle Detection ---');

  // Test 4.1: Empirical check: Circular reference in createMeasuredNode
  try {
    const parent = {
      id: 'parent_cycle',
      sourceId: 'daylight#root/parent',
      domTag: 'div',
      bounds: { x: 0, y: 0, width: 200, height: 200 }
    };
    const child = {
      id: 'child_cycle',
      sourceId: 'daylight#root/child',
      domTag: 'div',
      bounds: { x: 10, y: 10, width: 100, height: 100 },
      children: [parent] // Cycle: child points back to parent
    };
    parent.children = [child];

    let threwStackOverflow = false;
    let stackErrorMessage = '';
    try {
      createMeasuredNode(parent);
    } catch (err) {
      if (err instanceof RangeError || err.message.includes('Maximum call stack size exceeded')) {
        threwStackOverflow = true;
        stackErrorMessage = err.message;
      } else {
        throw err;
      }
    }

    recordTest(
      'M2-C1-4.1',
      'createMeasuredNode breaks mutual circular child references without RangeError stack overflow',
      'Cycle Guard',
      !threwStackOverflow,
      { threwStackOverflow, error: stackErrorMessage }
    );
  } catch (err) {
    recordTest('M2-C1-4.1', 'createMeasuredNode circular reference', 'Cycle Guard', false, { error: err.message });
  }

  // Test 4.2: Empirical check: Direct self-referencing child loop in createMeasuredNode
  try {
    const selfRef = {
      id: 'self_ref_node',
      sourceId: 'daylight#root/self_ref',
      bounds: { x: 0, y: 0, width: 50, height: 50 }
    };
    selfRef.children = [selfRef]; // Direct self-reference

    let threwStackOverflow = false;
    let stackErrorMessage = '';
    try {
      createMeasuredNode(selfRef);
    } catch (err) {
      if (err instanceof RangeError || err.message.includes('Maximum call stack size exceeded')) {
        threwStackOverflow = true;
        stackErrorMessage = err.message;
      } else {
        throw err;
      }
    }

    recordTest(
      'M2-C1-4.2',
      'createMeasuredNode breaks direct self-referencing child loops gracefully',
      'Cycle Guard',
      !threwStackOverflow,
      { threwStackOverflow, error: stackErrorMessage }
    );
  } catch (err) {
    recordTest('M2-C1-4.2', 'Self-referencing node in createMeasuredNode', 'Cycle Guard', false, { error: err.message });
  }

  // Test 4.3: Circular reference in inferNodeIntent
  try {
    const parentIntent = {
      sourceId: 'daylight#root/intent_p',
      category: 'container'
    };
    const childIntent = {
      sourceId: 'daylight#root/intent_c',
      category: 'container',
      children: [parentIntent]
    };
    parentIntent.children = [childIntent];

    let threw = false;
    let resIntent = null;
    try {
      resIntent = inferNodeIntent(parentIntent);
    } catch (err) {
      threw = true;
    }

    const passed = !threw && resIntent !== null && resIntent.children.length === 1;
    recordTest(
      'M2-C1-4.3',
      'inferNodeIntent breaks cyclic child hierarchies safely without stack overflow',
      'Cycle Guard',
      passed,
      { threw, childCount: resIntent?.children?.length }
    );
  } catch (err) {
    recordTest('M2-C1-4.3', 'inferNodeIntent circular reference', 'Cycle Guard', false, { error: err.message });
  }

  // Test 4.4: Circular reference in checkDuplicateSourceIds
  try {
    const nodeA = { sourceId: 'daylight#root/node_a' };
    const nodeB = { sourceId: 'daylight#root/node_b', children: [nodeA] };
    nodeA.children = [nodeB];

    let threw = false;
    let duplicateCheckPassed = false;
    try {
      duplicateCheckPassed = checkDuplicateSourceIds(nodeA);
    } catch (err) {
      threw = true;
    }

    recordTest(
      'M2-C1-4.4',
      'checkDuplicateSourceIds protects against cyclic node graphs using visited set',
      'Cycle Guard',
      !threw && duplicateCheckPassed === true,
      { threw, duplicateCheckPassed }
    );
  } catch (err) {
    recordTest('M2-C1-4.4', 'checkDuplicateSourceIds circular protection', 'Cycle Guard', false, { error: err.message });
  }

  // Test 4.5: Empirical check: Circular DOM nodes in buildDesignContract
  try {
    const nodeA = { id: 'na', bounds: { x: 0, y: 0, width: 100, height: 100 } };
    const nodeB = { id: 'nb', bounds: { x: 0, y: 0, width: 80, height: 80 } };
    nodeA.children = [nodeB];
    nodeB.children = [nodeA];

    let threwStackOverflow = false;
    let stackErrorMessage = '';
    try {
      buildDesignContract('circ_screen', { screenId: 'circ_screen', domNodes: [nodeA] });
    } catch (err) {
      if (err instanceof RangeError || err.message.includes('Maximum call stack size exceeded')) {
        threwStackOverflow = true;
        stackErrorMessage = err.message;
      }
    }

    recordTest(
      'M2-C1-4.5',
      'buildDesignContract handles cyclic DOM node hierarchies without RangeError stack overflow crash',
      'Cycle Guard',
      !threwStackOverflow,
      { threwStackOverflow, error: stackErrorMessage }
    );
  } catch (err) {
    recordTest('M2-C1-4.5', 'buildDesignContract circular domNodes', 'Cycle Guard', false, { error: err.message });
  }

  // ==========================================================================
  // GROUP 5: Multi-Scene Duplicate SourceId Detection
  // ==========================================================================
  console.log('\n--- Group 5: Multi-Scene Duplicate SourceId Detection ---');

  // Test 5.1: Duplicate sourceId in single scene is rejected
  try {
    const root = {
      sourceId: 'daylight#root/container',
      children: [
        { sourceId: 'daylight#root/dup_id', domTag: 'p' },
        { sourceId: 'daylight#root/dup_id', domTag: 'p' }
      ]
    };

    let caughtErr = null;
    try {
      checkDuplicateSourceIds(root);
    } catch (e) {
      caughtErr = e;
    }

    const passed = caughtErr !== null && caughtErr.message.includes('Duplicate sourceId detected: daylight#root/dup_id');
    recordTest(
      'M2-C1-5.1',
      'checkDuplicateSourceIds detects and rejects duplicate sourceId in a single scene tree',
      'Multi-Scene SourceId',
      passed,
      { message: caughtErr?.message }
    );
  } catch (err) {
    recordTest('M2-C1-5.1', 'Duplicate sourceId in single scene', 'Multi-Scene SourceId', false, { error: err.message });
  }

  // Test 5.2: Duplicate sourceId across multi-viewport bundle (portrait + landscape)
  try {
    const bundleWithMultiSceneDupes = {
      scenes: {
        daylight_portrait: {
          rootNode: {
            sourceId: 'daylight#root/portrait_root',
            children: [{ sourceId: 'daylight#root/shared_action_button' }]
          }
        },
        daylight_landscape: {
          rootNode: {
            sourceId: 'daylight#root/landscape_root',
            children: [
              { sourceId: 'daylight#root/inner_box', children: [{ sourceId: 'daylight#root/inner_box' }] }
            ]
          }
        }
      }
    };

    let caughtErr = null;
    try {
      checkDuplicateSourceIds(bundleWithMultiSceneDupes);
    } catch (e) {
      caughtErr = e;
    }

    const passed = caughtErr !== null && caughtErr.message.includes('Duplicate sourceId detected: daylight#root/inner_box');
    recordTest(
      'M2-C1-5.2',
      'checkDuplicateSourceIds traverses all scenes in measuredScenes bundle and detects nested duplicates in landscape',
      'Multi-Scene SourceId',
      passed,
      { message: caughtErr?.message }
    );
  } catch (err) {
    recordTest('M2-C1-5.2', 'Duplicate sourceId across scenes', 'Multi-Scene SourceId', false, { error: err.message });
  }

  // Test 5.3: Unique sourceIds pass without error
  try {
    const uniqueBundle = {
      scenes: {
        daylight_portrait: {
          rootNode: {
            sourceId: 'daylight#root/p_root',
            children: [{ sourceId: 'daylight#root/p_btn1' }, { sourceId: 'daylight#root/p_btn2' }]
          }
        },
        daylight_landscape: {
          rootNode: {
            sourceId: 'daylight#root/l_root',
            children: [{ sourceId: 'daylight#root/l_btn1' }, { sourceId: 'daylight#root/l_btn2' }]
          }
        }
      }
    };

    const passed = checkDuplicateSourceIds(uniqueBundle) === true;
    recordTest(
      'M2-C1-5.3',
      'checkDuplicateSourceIds returns true for fully unique multi-scene tree',
      'Multi-Scene SourceId',
      passed
    );
  } catch (err) {
    recordTest('M2-C1-5.3', 'Unique sourceIds pass', 'Multi-Scene SourceId', false, { error: err.message });
  }

  // ==========================================================================
  // Summary & Exit
  // ==========================================================================
  console.log('\n======================================================================');
  console.log(`  RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================================\n');

  if (failCount > 0) {
    console.error(`\x1b[31m[VERDICT: REQUEST_CHANGES] ${failCount} tests failed.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m[VERDICT: APPROVE] All ${passCount} empirical tests passed 100% green.\x1b[0m`);
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
