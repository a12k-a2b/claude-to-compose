'use strict';

/**
 * Fail-closed release evidence evaluator.
 *
 * A missing measurement is BLOCKED, not PASS. A measured value outside the
 * declared quality bar is FAIL. Only complete, successful evidence can PASS.
 */

const DEFAULT_THRESHOLDS = Object.freeze({
  minSimilarity: 95.0,
  minMssim: 0.90,
  minInkIou: 85.0,
  minContourScore: 90.0,
  minElementIou: 90.0,
  maxSpatialShiftPx: 3.0
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function evaluateStage(stage, label, blockers, failures) {
  if (!stage) {
    blockers.push(`${label} evidence is missing`);
    return;
  }
  if (stage.skipped) {
    blockers.push(`${label} was skipped`);
    return;
  }
  if (stage.blocked) {
    blockers.push(stage.error ? `${label} is blocked: ${stage.error}` : `${label} is blocked`);
    return;
  }
  if (stage.success !== true) {
    failures.push(stage.error ? `${label} failed: ${stage.error}` : `${label} did not report success`);
  }
}

function requireMetric(metrics, key, label, blockers) {
  const value = metrics?.[key];
  if (!isFiniteNumber(value)) {
    blockers.push(`${label} is missing or invalid`);
    return null;
  }
  return value;
}

function evaluateVerificationEvidence(stages = {}, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const blockers = [];
  const failures = [];

  evaluateStage(stages.compile, 'Kotlin compilation', blockers, failures);
  evaluateStage(stages.previewTest, 'native preview render', blockers, failures);

  const vectorStage = stages.vectorLinter;
  if (!vectorStage || vectorStage.skipped) {
    blockers.push('vector completeness evidence is missing or skipped');
  } else if (vectorStage.passed !== true || vectorStage.success === false) {
    failures.push(vectorStage.error || 'vector completeness gate failed');
  }

  const audit = stages.audit;
  if (!audit) {
    blockers.push('static Compose audit evidence is missing');
  } else if (audit.blocked || audit.error) {
    blockers.push(`static Compose audit is blocked${audit.error ? `: ${audit.error}` : ''}`);
  } else if (audit.passed !== true || audit.hasVeto || audit.veto) {
    failures.push('static Compose audit failed');
  }

  const diffStage = stages.diff;
  if (!diffStage || diffStage.skipped) {
    blockers.push('visual diff evidence is missing or skipped');
  } else if (diffStage.blocked) {
    blockers.push(`visual diff is blocked${diffStage.error ? `: ${diffStage.error}` : ''}`);
  } else if (diffStage.success !== true) {
    failures.push(diffStage.error ? `visual diff failed: ${diffStage.error}` : 'visual diff failed');
  } else {
    const metrics = diffStage.metrics || {};
    const zonal = diffStage.zonal || metrics.zonal || {};

    const similarity = requireMetric(metrics, 'pixelSimilarityPercentage', 'pixel similarity', blockers);
    const mssim = requireMetric(metrics, 'mssimScore', 'MSSIM', blockers);
    const inkIou = requireMetric(metrics, 'inkIou', 'foreground Ink IoU', blockers);
    const contour = requireMetric(metrics, 'edgeContourScore', 'edge contour alignment', blockers);
    const elementIou = requireMetric(zonal, 'elementIouScore', 'element bounding-box IoU', blockers);
    const maxShift = requireMetric(zonal, 'maxSpatialShiftPx', 'maximum spatial shift', blockers);

    const evaluatedCount = zonal.elementsEvaluatedCount ?? zonal.evaluatedCount;
    if (!Number.isInteger(evaluatedCount) || evaluatedCount <= 0) {
      blockers.push('no semantic elements were evaluated for localized geometry fidelity');
    }

    if (similarity !== null && similarity < thresholds.minSimilarity) {
      failures.push(`pixel similarity ${similarity}% is below ${thresholds.minSimilarity}%`);
    }
    if (mssim !== null && mssim < thresholds.minMssim) {
      failures.push(`MSSIM ${mssim} is below ${thresholds.minMssim}`);
    }
    if (inkIou !== null && inkIou < thresholds.minInkIou) {
      failures.push(`foreground Ink IoU ${inkIou}% is below ${thresholds.minInkIou}%`);
    }
    if (contour !== null && contour < thresholds.minContourScore) {
      failures.push(`edge contour alignment ${contour}% is below ${thresholds.minContourScore}%`);
    }
    if (elementIou !== null && elementIou < thresholds.minElementIou) {
      failures.push(`element bounding-box IoU ${elementIou}% is below ${thresholds.minElementIou}%`);
    }
    if (maxShift !== null && maxShift > thresholds.maxSpatialShiftPx) {
      failures.push(`maximum spatial shift ${maxShift}px exceeds ${thresholds.maxSpatialShiftPx}px`);
    }
  }

  const outcome = failures.length > 0 ? 'FAIL' : (blockers.length > 0 ? 'BLOCKED' : 'PASS');
  return {
    outcome,
    passed: outcome === 'PASS',
    thresholds,
    failures,
    blockers
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  isFiniteNumber,
  evaluateVerificationEvidence
};
