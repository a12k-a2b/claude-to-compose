'use strict';

/**
 * src/defects/index.js
 *
 * Public barrel export for ctc v2 Causal Defect Oracle subsystem.
 */

const { diagnoseDefects, classifyRootCause, resolveTarget } = require('./oracle');
const { DEFECT_CATEGORIES, TAXONOMY_ERROR_CODES, THRESHOLDS } = require('./taxonomy');
const { SEVERITY_LEVELS, determineSeverity, calculateGateOutcome } = require('./severity');
const {
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation
} = require('./remediation');

module.exports = {
  diagnoseDefects,
  classifyRootCause,
  resolveTarget,
  DEFECT_CATEGORIES,
  TAXONOMY_ERROR_CODES,
  THRESHOLDS,
  SEVERITY_LEVELS,
  determineSeverity,
  calculateGateOutcome,
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation
};
