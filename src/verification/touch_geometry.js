'use strict';

/**
 * src/verification/touch_geometry.js
 *
 * Stage 3: Touch Target Geometry & Capacitive Calibration (`STAGE_3_LAYOUT_TELEMETRY`).
 * Enforces spatial drift tolerances (<= 3.0px), baseline drift (<= 2.0px),
 * minimum 48dp invisible hit-slop bounds, and DC1 +8px hardware coordinate insets.
 */

const { DisplayProfileValidator } = require('./display_profile');

/**
 * Computes Euclidean spatial drift between expected and measured coordinates.
 * @param {number} x1 Expected x
 * @param {number} y1 Expected y
 * @param {number} x2 Measured x
 * @param {number} y2 Measured y
 * @returns {object} { dx, dy, distance }
 */
function computeDrift(x1, y1, x2, y2) {
  if (
    typeof x1 !== 'number' || typeof y1 !== 'number' ||
    typeof x2 !== 'number' || typeof y2 !== 'number' ||
    Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)
  ) {
    return { dx: NaN, dy: NaN, distance: NaN };
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  return { dx, dy, distance };
}

/**
 * Executes Stage 3: Touch Target Geometry & Layout Telemetry verification.
 * @param {string} screenId
 * @param {string} targetAppPath
 * @param {object} options
 * @returns {Promise<object>} StageExecutionResult
 */
async function verifyTouchGeometry(screenId, targetAppPath, options = {}) {
  const startTime = Date.now();
  const validator = options.validator || new DisplayProfileValidator();
  const maxDriftLimit = options.maxDriftPx !== undefined ? options.maxDriftPx : 3.0;
  const maxBaselineLimit = options.maxBaselinePx !== undefined ? options.maxBaselinePx : 2.0;

  // 1. Elements layout comparison
  const elementComparisons = options.elementComparisons || options.elements || [];
  let maxSpatialShiftPx = 0;
  let worstDriftElement = null;

  for (const el of elementComparisons) {
    const drift = computeDrift(el.expectedX, el.expectedY, el.actualX, el.actualY);

    if (!Number.isFinite(drift.distance)) {
      return {
        stage: 'STAGE_3_LAYOUT_TELEMETRY',
        alias: 'STAGE_3_TOUCH_GEOMETRY',
        status: 'FAIL',
        success: false,
        durationMs: Date.now() - startTime,
        error: `Invalid coordinate data for "${el.sourceId || el.id}" (drift is non-finite: ${drift.distance})`,
        errorCode: 'LAYOUT_GEOMETRY_INVALID',
        evidence: {
          worstDriftElement: el,
          deltaPx: drift
        }
      };
    }

    if (drift.distance > maxSpatialShiftPx) {
      maxSpatialShiftPx = drift.distance;
      worstDriftElement = { ...el, drift };
    }

    // NC-02 check: Margin shift >= 10px or drift > 3.0px
    if (drift.distance > maxDriftLimit) {
      const isGrossShift = drift.distance >= 10.0;
      return {
        stage: 'STAGE_3_LAYOUT_TELEMETRY',
        alias: 'STAGE_3_TOUCH_GEOMETRY',
        status: 'FAIL',
        success: false,
        durationMs: Date.now() - startTime,
        error: `Spatial drift of ${drift.distance.toFixed(1)}px for "${el.sourceId || el.id}" exceeds limit (${maxDriftLimit}px)`,
        errorCode: isGrossShift ? 'GEOMETRY_DRIFT' : 'SPATIAL_DRIFT_EXCEEDED',
        evidence: {
          maxSpatialShiftPx: drift.distance,
          worstDriftElement: el,
          deltaPx: drift
        }
      };
    }

    // Baseline drift check
    if (el.expectedBaseline !== undefined && el.actualBaseline !== undefined) {
      const baselineDelta = Math.abs(el.actualBaseline - el.expectedBaseline);
      if (baselineDelta > maxBaselineLimit) {
        return {
          stage: 'STAGE_3_LAYOUT_TELEMETRY',
          alias: 'STAGE_3_TOUCH_GEOMETRY',
          status: 'FAIL',
          success: false,
          durationMs: Date.now() - startTime,
          error: `Text baseline delta ${baselineDelta.toFixed(1)}px exceeds ${maxBaselineLimit}px limit for "${el.sourceId || el.id}"`,
          errorCode: 'BASELINE_MISALIGNMENT',
          evidence: { baselineDelta, element: el }
        };
      }
    }

    // Touch target size check
    if (el.isInteractive) {
      const touchRes = validator.validateTouchTarget(el.touchWidthPx || el.actualWidth || 96, el.touchHeightPx || el.actualHeight || 96);
      if (!touchRes.valid) {
        return {
          stage: 'STAGE_3_LAYOUT_TELEMETRY',
          alias: 'STAGE_3_TOUCH_GEOMETRY',
          status: 'FAIL',
          success: false,
          durationMs: Date.now() - startTime,
          error: touchRes.error,
          errorCode: 'TOUCH_TARGET_TOO_SMALL',
          evidence: { touchResult: touchRes, element: el }
        };
      }
    }
  }

  // 2. Hardware coordinate inset check
  const sampleCoord = options.sampleCoord || { x: 592, y: 792 };
  const physicalCoord = validator.logicalToPhysical(sampleCoord.x, sampleCoord.y);
  const backToLogical = validator.physicalToLogical(physicalCoord.x, physicalCoord.y);

  if (physicalCoord.x !== sampleCoord.x + 8 || physicalCoord.y !== sampleCoord.y + 8) {
    return {
      stage: 'STAGE_3_LAYOUT_TELEMETRY',
      alias: 'STAGE_3_TOUCH_GEOMETRY',
      status: 'FAIL',
      success: false,
      durationMs: Date.now() - startTime,
      error: `DC1 hardware coordinate inset failed (+8px offset not applied correctly)`,
      errorCode: 'HARDWARE_INSET_MISMATCH',
      evidence: { sampleCoord, physicalCoord }
    };
  }

  return {
    stage: 'STAGE_3_LAYOUT_TELEMETRY',
    alias: 'STAGE_3_TOUCH_GEOMETRY',
    status: 'PASS',
    success: true,
    durationMs: Date.now() - startTime,
    error: null,
    errorCode: null,
    evidence: {
      elementsEvaluatedCount: elementComparisons.length,
      maxSpatialShiftPx,
      hardwareInsetVerified: true
    }
  };
}

module.exports = {
  computeDrift,
  verifyTouchGeometry
};
