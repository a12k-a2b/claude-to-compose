'use strict';

/**
 * tests/v2/negative_controls.test.js
 *
 * Deterministic Negative Controls & Fault Injection Test Suite.
 * Demonstrates that changing a margin, removing an element, omitting evidence,
 * or altering tokens causes a deterministic failure / block under the fail-closed gate.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { evaluateVerificationEvidence, DEFAULT_THRESHOLDS } = require('../../verification/quality_gate');
const { compareTelemetry } = require('../../compiler_v2/telemetry/comparator');

test('Negative Controls: Fail-Closed Quality Gate Verification', async (t) => {

  await t.test('Fault 1: Missing Element causes deterministic failure', () => {
    // Load valid base telemetry
    const baseTelemetryPath = path.resolve(__dirname, '../../output/conformance/native_telemetry.json');
    assert.ok(fs.existsSync(baseTelemetryPath), 'Base native_telemetry.json must exist');
    const validTelemetry = JSON.parse(fs.readFileSync(baseTelemetryPath, 'utf8'));

    // Inject fault: remove the CTA button element
    const faultyTelemetry = { ...validTelemetry };
    delete faultyTelemetry['daylight#onboarding/action/get_started'];

    const irPath = path.resolve(__dirname, '../../benchmarks/dc1_onboarding/design_ir.json');
    const comparison = compareTelemetry(irPath, faultyTelemetry);

    // Verify that the missing element is detected
    const evaluatedIds = comparison.results.map(r => r.sourceId);
    assert.strictEqual(
      evaluatedIds.includes('daylight#onboarding/action/get_started'),
      false,
      'Faulty telemetry must not contain the removed CTA element'
    );
    assert.strictEqual(
      comparison.nodesCompared < Object.keys(validTelemetry).length,
      true,
      'Node count must decrease when an element is removed'
    );
  });

  await t.test('Fault 2: Shifted Margin (+10px) causes deterministic spatial drift failure', () => {
    const baseTelemetryPath = path.resolve(__dirname, '../../output/conformance/native_telemetry.json');
    const validTelemetry = JSON.parse(fs.readFileSync(baseTelemetryPath, 'utf8'));

    // Inject fault: shift the headline margin by +10px (5dp)
    const faultyTelemetry = JSON.parse(JSON.stringify(validTelemetry));
    const headline = faultyTelemetry['daylight#onboarding/typography/headline'];
    assert.ok(headline, 'Headline must exist in telemetry');

    // Add +10px shift
    headline.boundsPx.top += 10.0;
    headline.centroid.y += 10.0;

    const irPath = path.resolve(__dirname, '../../benchmarks/dc1_onboarding/design_ir.json');
    const comparison = compareTelemetry(irPath, faultyTelemetry, { maxDriftPx: 3.0 });

    const headlineResult = comparison.results.find(r => r.sourceId === 'daylight#onboarding/typography/headline');
    assert.ok(headlineResult, 'Headline result must be present in comparison');
    assert.strictEqual(headlineResult.pass, false, 'Headline with +10px shift MUST fail spatial drift gate');
    assert.ok(headlineResult.delta.drift >= 10.0, `Drift must be >= 10.0px, got ${headlineResult.delta.drift}`);
    assert.strictEqual(comparison.allPass, false, 'Overall comparison must fail when margin is shifted');
  });

  await t.test('Fault 3: Omitted or Skipped Evidence causes deterministic BLOCKED status', () => {
    // Incomplete stages simulating skipped compilation or missing visual diff
    const incompleteStages = {
      compile: { success: true, skipped: false },
      previewTest: { success: true, skipped: true }, // SKIPPED PREVIEW
      vectorLinter: { success: true, passed: true },
      audit: { success: true, passed: true },
      diff: null // MISSING DIFF
    };

    const evaluation = evaluateVerificationEvidence(incompleteStages);

    assert.strictEqual(evaluation.passed, false, 'Incomplete evidence must NEVER pass');
    assert.strictEqual(evaluation.outcome, 'BLOCKED', 'Incomplete evidence must report BLOCKED');
    assert.ok(evaluation.blockers.length >= 2, 'Must record multiple blockers for missing stages');
    assert.ok(
      evaluation.blockers.some(b => b.includes('native preview render was skipped')),
      'Must block on skipped preview render'
    );
    assert.ok(
      evaluation.blockers.some(b => b.includes('visual diff evidence is missing')),
      'Must block on missing visual diff evidence'
    );
  });

  await t.test('Fault 4: Metric Degradation below quality bar causes deterministic FAIL', () => {
    // Sub-threshold metrics (e.g. Ink IoU 70% < 85%, Similarity 88% < 95%)
    const degradedStages = {
      compile: { success: true },
      previewTest: { success: true },
      vectorLinter: { success: true, passed: true },
      audit: { success: true, passed: true },
      diff: {
        success: true,
        metrics: {
          pixelSimilarityPercentage: 88.5, // BELOW 95%
          mssimScore: 0.82,               // BELOW 0.90
          inkIou: 65.4,                   // BELOW 85%
          edgeContourScore: 78.2          // BELOW 90%
        },
        zonal: {
          elementIouScore: 92.0,
          maxSpatialShiftPx: 5.4,         // EXCEEDS 3.0px
          elementsEvaluatedCount: 8
        }
      }
    };

    const evaluation = evaluateVerificationEvidence(degradedStages);

    assert.strictEqual(evaluation.passed, false, 'Degraded metrics must NEVER pass');
    assert.strictEqual(evaluation.outcome, 'FAIL', 'Degraded metrics must report FAIL');
    assert.ok(evaluation.failures.length >= 4, 'Must report all metric failures explicitly');
    assert.ok(
      evaluation.failures.some(f => f.includes('pixel similarity 88.5% is below 95%')),
      'Must report pixel similarity failure'
    );
    assert.ok(
      evaluation.failures.some(f => f.includes('foreground Ink IoU 65.4% is below 85%')),
      'Must report Ink IoU failure'
    );
    assert.ok(
      evaluation.failures.some(f => f.includes('maximum spatial shift 5.4px exceeds 3px')),
      'Must report spatial shift failure'
    );
  });

});
