'use strict';

/**
 * src/defects/severity.js
 *
 * 3-Tier Severity Matrix & Quality Gate Policy for ctc v2.
 */

const { DEFECT_CATEGORIES, THRESHOLDS } = require('./taxonomy');

const SEVERITY_LEVELS = Object.freeze({
  CRITICAL: 'CRITICAL',
  MAJOR: 'MAJOR',
  MINOR: 'MINOR'
});

/**
 * Determines the severity of a defect based on category and measured discrepancy.
 * @param {string} category
 * @param {object} details
 * @returns {string} CRITICAL | MAJOR | MINOR
 */
function determineSeverity(category, details = {}) {
  if (details.severity === SEVERITY_LEVELS.CRITICAL || details.status === 'BLOCKED') {
    return SEVERITY_LEVELS.CRITICAL;
  }
  if (
    (details.settleMs !== undefined && details.settleMs >= THRESHOLDS.PROHIBITED_SETTLE_PAUSE_MS) ||
    details.errorCode === 'EPD_WORKAROUND_VIOLATION' ||
    details.errorCode === 'ELEMENT_NOT_RENDERED' ||
    details.errorCode === 'FONT_RESOURCE_MISSING' ||
    details.errorCode === 'PREVIEW_RENDER_MISSING' ||
    details.errorCode === 'CONTRACT_EVIDENCE_MISSING'
  ) {
    return SEVERITY_LEVELS.CRITICAL;
  }

  switch (category) {
    case DEFECT_CATEGORIES.EVIDENCE_MISSING:
    case DEFECT_CATEGORIES.INVARIANT_BROKEN:
    case DEFECT_CATEGORIES.EPD_FLASH_DETECTED:
    case DEFECT_CATEGORIES.MISSING_ELEMENT:
    case DEFECT_CATEGORIES.ASSET_MISSING:
      return SEVERITY_LEVELS.CRITICAL;

    case DEFECT_CATEGORIES.MARGIN_SHIFT: {
      const drift = details.drift ?? details.distance ?? details.deltaPx?.distance ?? (
        details.deltaPx ? Math.hypot(details.deltaPx.dx || 0, details.deltaPx.dy || 0) : 0
      );
      if (drift >= THRESHOLDS.HARD_MARGIN_SHIFT_VETO_PX) {
        return SEVERITY_LEVELS.CRITICAL;
      }
      if (drift > THRESHOLDS.MAX_SPATIAL_DRIFT_PX) {
        return SEVERITY_LEVELS.MAJOR;
      }
      return SEVERITY_LEVELS.MINOR;
    }

    case DEFECT_CATEGORIES.CONTRAST_FAILURE:
    case DEFECT_CATEGORIES.COLOR_COLLAPSE:
    case DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL:
    case DEFECT_CATEGORIES.LAYOUT_OVERFLOW:
      return SEVERITY_LEVELS.MAJOR;

    default:
      return SEVERITY_LEVELS.MAJOR;
  }
}

/**
 * Computes overall quality gate outcome from defects and blockers.
 * @param {Array<object>} defects
 * @param {Array<string>} blockers
 * @returns {string} PASS | FAIL | BLOCKED
 */
function calculateGateOutcome(defects = [], blockers = [], verificationOutcome = null) {
  const blockersList = Array.isArray(blockers) ? blockers : [];

  if (verificationOutcome === 'BLOCKED' || blockersList.length > 0) {
    return 'BLOCKED';
  }

  // Handle direct counts object if passed: e.g. { critical: 1, major: 0, minor: 0 } or { CRITICAL: 1, ... }
  if (defects && typeof defects === 'object' && !Array.isArray(defects)) {
    const blockerCount = Number(defects.blocker ?? defects.BLOCKER ?? 0);
    const criticalCount = Number(defects.critical ?? defects.CRITICAL ?? 0);
    const majorCount = Number(defects.major ?? defects.MAJOR ?? 0);
    const minorCount = Number(defects.minor ?? defects.MINOR ?? 0);

    if (verificationOutcome === 'BLOCKED' || blockerCount > 0) return 'BLOCKED';
    if (criticalCount > 0 || majorCount > 0) return 'FAIL';
    if (verificationOutcome === 'FAIL') return 'FAIL';
    if (minorCount > 0 && verificationOutcome !== 'PASS') return 'FAIL';
    return 'PASS';
  }

  const defectsList = Array.isArray(defects) ? defects : [];

  const hasMissingEvidence = defectsList.some(d =>
    d.category === DEFECT_CATEGORIES.EVIDENCE_MISSING ||
    d.diagnosis?.rootCause === 'PREVIEW_RENDER_MISSING' ||
    d.diagnosis?.rootCause === 'CONTRACT_EVIDENCE_MISSING' ||
    d.diagnosis?.rootCause === 'HARDWARE_LEASE_TIMEOUT' ||
    d.errorCode === 'PREVIEW_RENDER_MISSING' ||
    d.errorCode === 'CONTRACT_EVIDENCE_MISSING' ||
    d.rootCause === 'CONTRACT_EVIDENCE_MISSING' ||
    d.rootCause === 'PREVIEW_RENDER_MISSING'
  );

  if (hasMissingEvidence) {
    return 'BLOCKED';
  }

  if (verificationOutcome === 'FAIL') {
    return 'FAIL';
  }

  const hasFailingDefect = defectsList.some(d =>
    d.severity === SEVERITY_LEVELS.CRITICAL ||
    d.severity === SEVERITY_LEVELS.MAJOR
  );

  if (hasFailingDefect) {
    return 'FAIL';
  }

  if (defectsList.length > 0 && verificationOutcome !== 'PASS') {
    return 'FAIL';
  }

  return 'PASS';
}

module.exports = {
  SEVERITY_LEVELS,
  determineSeverity,
  calculateGateOutcome
};
