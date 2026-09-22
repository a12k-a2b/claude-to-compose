'use strict';

/**
 * src/verification/index.js
 *
 * Public entrypoint for ctc v2 Progressive 6-Stage Verification Pipeline.
 */

const {
  STAGES,
  STAGE_ALIASES,
  validateStageName,
  evaluateStages,
  verifyDc1Hardware,
  runVerificationPipeline
} = require('./pipeline');

const { verifySemanticStructure } = require('./semantic_structure');
const { evaluateContrast } = require('./contrast_evaluator');
const { verifyTouchGeometry, computeDrift } = require('./touch_geometry');
const { evaluateInvariants } = require('./invariants_evaluator');
const { verifyMultiViewport } = require('./multi_viewport');
const {
  DisplayProfileValidator,
  SOL_OS_TOKENS,
  BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS
} = require('./display_profile');
const { NegativeControlsHarness } = require('./negative_controls');

module.exports = {
  STAGES,
  STAGE_ALIASES,
  validateStageName,
  evaluateStages,
  verifyDc1Hardware,
  runVerificationPipeline,
  verifySemanticStructure,
  evaluateContrast,
  verifyTouchGeometry,
  computeDrift,
  evaluateInvariants,
  verifyMultiViewport,
  DisplayProfileValidator,
  SOL_OS_TOKENS,
  BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS,
  NegativeControlsHarness
};
