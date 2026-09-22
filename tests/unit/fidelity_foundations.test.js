'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { SpecBuilder } = require('../../extractor/spec_builder');
const { generateScreenFile } = require('../../synthesizer/screen_generator');
const { evaluateVerificationEvidence } = require('../../verification/quality_gate');
const { generateReportMarkdown } = require('../../verification/report_generator');

function completeStages(metricOverrides = {}, zonalOverrides = {}) {
  return {
    compile: { success: true },
    previewTest: { success: true },
    vectorLinter: { success: true, passed: true },
    audit: { passed: true, totalScore: 92, hasVeto: false },
    diff: {
      success: true,
      metrics: {
        pixelSimilarityPercentage: 98.5,
        mssimScore: 0.97,
        inkIou: 91,
        edgeContourScore: 95,
        ...metricOverrides
      },
      zonal: {
        elementIouScore: 94,
        maxSpatialShiftPx: 1.5,
        elementsEvaluatedCount: 4,
        ...zonalOverrides
      }
    }
  };
}

function textHierarchy(width, sourceId = 'main#root') {
  return {
    id: 'node_1',
    sourceId,
    tag: 'main',
    type: 'CONTAINER',
    componentType: 'Container',
    bounds: { x: 0, y: 0, width, height: 100 },
    layout: {
      display: 'block',
      width,
      height: 100,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    },
    children: [{
      id: 'node_2',
      sourceId: `${sourceId}/h1:nth-child(1)`,
      tag: 'h1',
      type: 'TEXT',
      componentType: 'Text',
      bounds: { x: 10, y: 10, width: width - 20, height: 48 },
      layout: {
        display: 'block',
        width: width - 20,
        height: 48,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      style: { color: '#112233' },
      text: {
        content: 'Measured headline',
        fontFamily: 'Example Sans',
        fontSize: 37.5,
        fontWeight: 650,
        lineHeight: 44,
        letterSpacing: -0.25,
        color: '#112233',
        textAlign: 'center'
      }
    }]
  };
}

describe('fail-closed fidelity foundations', () => {
  it('passes only when build, native render, vector, audit, global, and localized evidence are complete', () => {
    const result = evaluateVerificationEvidence(completeStages());
    assert.equal(result.outcome, 'PASS');
    assert.equal(result.passed, true);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.blockers, []);
  });

  it('rejects the formerly published false-green metrics despite high whitespace similarity', () => {
    const stages = completeStages({
      pixelSimilarityPercentage: 95.6,
      mssimScore: 0.846,
      inkIou: 20.49,
      edgeContourScore: 82
    }, {
      elementIouScore: 62,
      maxSpatialShiftPx: 47.72
    });
    const gate = evaluateVerificationEvidence(stages);
    assert.equal(gate.outcome, 'FAIL');
    assert.ok(gate.failures.some((failure) => failure.includes('Ink IoU')));
    assert.ok(gate.failures.some((failure) => failure.includes('spatial shift')));

    const report = generateReportMarkdown({
      buildResults: {
        compileSuccess: true,
        previewSuccess: true,
        compileErrors: 0,
        unitTestsPassed: 1,
        unitTestsFailed: 0
      },
      diffMetrics: stages.diff.metrics,
      zonalDiff: stages.diff.zonal,
      auditResult: stages.audit,
      auditScore: 100,
      qualityGate: gate
    });
    assert.match(report, /Verdict: FAIL/);
    assert.doesNotMatch(report, /PROCEED_PUBLISH/);
  });

  it('marks skipped or missing evidence BLOCKED instead of inventing passing metrics', () => {
    const result = evaluateVerificationEvidence({
      compile: { success: true, skipped: true },
      previewTest: { success: true, skipped: true },
      vectorLinter: { success: true, skipped: true },
      audit: { passed: true },
      diff: { success: true, skipped: true }
    });
    assert.equal(result.outcome, 'BLOCKED');
    assert.ok(result.blockers.length >= 4);
  });

  it('preserves a separately measured hierarchy for every responsive viewport', () => {
    const mobile = textHierarchy(390, 'main#mobile');
    const desktop = textHierarchy(1184, 'main#desktop');
    const viewports = {
      mobile: { width: 390, height: 844, deviceScaleFactor: 3, screenshotPath: 'screenshots/mobile_reference.png' },
      desktop: { width: 1184, height: 1584, deviceScaleFactor: 1, screenshotPath: 'screenshots/desktop_reference.png' }
    };
    const builder = new SpecBuilder();
    const spec = builder.buildSpec({
      viewports,
      domHierarchy: mobile,
      viewportScenes: {
        mobile: { viewport: viewports.mobile, hierarchy: mobile, screenshotPath: viewports.mobile.screenshotPath },
        desktop: { viewport: viewports.desktop, hierarchy: desktop, screenshotPath: viewports.desktop.screenshotPath }
      }
    });
    assert.equal(builder.validate(spec).valid, true);
    assert.equal(spec.viewportScenes.mobile.hierarchy.bounds.width, 390);
    assert.equal(spec.viewportScenes.desktop.hierarchy.bounds.width, 1184);
    assert.equal(spec.hierarchy, mobile);
  });

  it('emits measured typography and a stable source identity into Compose', () => {
    const hierarchy = textHierarchy(390);
    const source = generateScreenFile({ hierarchy, vectors: [] }, 'com.example');
    assert.match(source, /Modifier\.testTag\("main#root\/h1:nth-child\(1\)"\)/);
    assert.match(source, /fontSize = 37\.50\.sp/);
    assert.match(source, /lineHeight = 44\.00\.sp/);
    assert.match(source, /fontWeight = FontWeight\(650\)/);
    assert.match(source, /color = Color\(0xFF112233\)/);
    assert.match(source, /textAlign = TextAlign\.Center/);
  });
});
