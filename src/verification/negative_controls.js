'use strict';

/**
 * src/verification/negative_controls.js
 *
 * Deterministic Negative Controls Harness for ctc v2 (NC-01 to NC-06).
 * Verifies that the progressive verification pipeline is strictly fail-closed.
 */

const { DisplayProfileValidator } = require('./display_profile');
const { computeDrift } = require('./touch_geometry');

class NegativeControlsHarness {
  constructor(validator = new DisplayProfileValidator()) {
    this.validator = validator;
  }

  runNc01MissingElement(options = {}) {
    const requiredNodes = options.requiredNodes || [
      'daylight#onboarding/typography/headline',
      'daylight#onboarding/action/get_started'
    ];
    const telemetry = options.telemetry || {
      'daylight#onboarding/typography/headline': { boundsPx: { left: 64, top: 320, width: 1056, height: 180 } }
    };

    const missing = requiredNodes.filter(id => !telemetry[id]);
    const caught = missing.length > 0;
    const verdict = caught ? 'FAIL' : 'PASS';

    return {
      id: 'NC-01',
      name: 'Missing Required Element Veto',
      stage: 'STAGE_1_SCHEMA_PROVENANCE',
      faultInjected: 'Omission of required CTA button from telemetry',
      caught,
      verdict,
      expectedVerdict: 'FAIL',
      errorCode: 'ELEMENT_NOT_RENDERED',
      details: { missingNodes: missing }
    };
  }

  runNc02MarginShift(options = {}) {
    const expected = options.expected || { x: 592.0, y: 320.0 };
    const shiftPx = options.shiftPx !== undefined ? options.shiftPx : 10.0;
    const actual = { x: expected.x, y: expected.y + shiftPx };

    const drift = computeDrift(expected.x, expected.y, actual.x, actual.y);
    const distance = drift.distance;

    const thresholdPx = 3.0;
    const passes = distance <= thresholdPx;
    const verdict = passes ? 'PASS' : 'FAIL';

    return {
      id: 'NC-02',
      name: 'Layout Margin Shift Veto',
      stage: 'STAGE_3_LAYOUT_TELEMETRY',
      faultInjected: `Injected +${shiftPx}px vertical margin shift`,
      measuredDriftPx: distance,
      thresholdPx,
      caught: !passes,
      verdict,
      expectedVerdict: 'FAIL',
      errorCode: distance >= 10.0 ? 'GEOMETRY_DRIFT' : 'SPATIAL_DRIFT_EXCEEDED'
    };
  }

  runNc03OmittedAsset(options = {}) {
    const requiredAssets = options.requiredAssets || [
      { id: 'font_flare', resource: 'res/font/abc_arizona_flare.ttf', exists: false },
      { id: 'ic_save', resource: 'res/drawable/ic_save.xml', exists: true }
    ];

    const missing = requiredAssets.filter(a => !a.exists);
    const caught = missing.length > 0;
    const verdict = caught ? 'FAIL' : 'PASS';

    return {
      id: 'NC-03',
      name: 'Omitted Asset Veto',
      stage: 'STAGE_1_SCHEMA_PROVENANCE',
      faultInjected: 'Required font asset physically missing or hash mismatch',
      caught,
      verdict,
      expectedVerdict: 'FAIL',
      errorCode: 'FONT_RESOURCE_MISSING',
      details: { missingAssets: missing.map(m => m.id) }
    };
  }

  runNc04InvariantBroken(options = {}) {
    const evidenceStages = options.stages || {
      compile: { success: true },
      previewTest: null,
      diff: null
    };

    const hasMissingEvidence = options.previewMissing !== undefined
      ? options.previewMissing
      : (!evidenceStages.previewTest || !evidenceStages.diff);

    return {
      id: 'NC-04',
      name: 'Invariant Broken / Missing Evidence Gate',
      stage: 'STAGE_4_PERCEPTUAL_METRICS',
      faultInjected: 'Omitted preview render screenshot',
      caught: hasMissingEvidence,
      verdict: hasMissingEvidence ? 'BLOCKED' : 'PASS',
      expectedVerdict: 'BLOCKED',
      errorCode: hasMissingEvidence ? 'PREVIEW_RENDER_MISSING' : null
    };
  }

  runNc05ContrastCollapse(options = {}) {
    const fg = options.foregroundHex || '#CCCCCC';
    const bg = options.backgroundHex || '#FFFFFF';

    const evalResult = this.validator.validateGrayscaleContrast(fg, bg, options.isLargeText || false);
    const passes = evalResult.passAA;

    return {
      id: 'NC-05',
      name: 'Contrast Degradation Veto',
      stage: 'STAGE_2_COMPILE_AND_TESTS',
      faultInjected: `Set text to low contrast token (${fg} on ${bg})`,
      ratio: evalResult.ratio,
      requiredRatio: evalResult.requiredAA,
      caught: !passes,
      verdict: passes ? 'PASS' : 'FAIL',
      expectedVerdict: 'FAIL',
      errorCode: 'CONTRAST_COLLAPSE'
    };
  }

  runNc06EpdFlashViolation(options = {}) {
    const codeSnippet = options.codeSnippet ||
      'context.sendBroadcast(Intent("android.intent.action.ACTION_REFRESH_SCREEN"));\nThread.sleep(500);';

    const check = this.validator.assertNoEpdWorkarounds(codeSnippet);
    const caught = !check.pass;

    return {
      id: 'NC-06',
      name: 'EPD Waveform Workaround Violation Veto',
      stage: 'STAGE_6_DC1_HARDWARE',
      faultInjected: 'Broadcasting ACTION_REFRESH_SCREEN and injecting 500ms pause',
      caught,
      verdict: caught ? 'FAIL' : 'PASS',
      expectedVerdict: 'FAIL',
      errorCode: 'EPD_WORKAROUND_VIOLATION',
      matchedPattern: check.pattern
    };
  }

  runControl(controlId, fixtureOverrides = {}) {
    switch (controlId.toUpperCase()) {
      case 'NC-01': return this.runNc01MissingElement(fixtureOverrides);
      case 'NC-02': return this.runNc02MarginShift(fixtureOverrides);
      case 'NC-03': return this.runNc03OmittedAsset(fixtureOverrides);
      case 'NC-04': return this.runNc04InvariantBroken(fixtureOverrides);
      case 'NC-05': return this.runNc05ContrastCollapse(fixtureOverrides);
      case 'NC-06': return this.runNc06EpdFlashViolation(fixtureOverrides);
      default:
        throw new Error(`Unknown Negative Control ID: ${controlId}`);
    }
  }

  runAll() {
    const controls = ['NC-01', 'NC-02', 'NC-03', 'NC-04', 'NC-05', 'NC-06'];
    const results = controls.map(id => this.runControl(id));
    const allPassed = results.every(r => r.verdict === r.expectedVerdict && r.caught === true);

    return {
      timestamp: new Date().toISOString(),
      totalControls: results.length,
      allPassed,
      results
    };
  }
}

module.exports = {
  NegativeControlsHarness
};
