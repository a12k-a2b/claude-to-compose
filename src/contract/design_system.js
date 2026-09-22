'use strict';

/**
 * src/contract/design_system.js
 *
 * Layer 4 (Design System Contract) interface for ctc v2 design contract.
 */

const {
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS,
  srgbToLinear,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  verifyContrast,
  detectColorCollision,
  assertNoEpdHooks,
  createDesignSystemContract
} = require('./design_system_builder');

module.exports = {
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  FORBIDDEN_EPD_PATTERNS,
  srgbToLinear,
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  verifyContrast,
  detectColorCollision,
  assertNoEpdHooks,
  createDesignSystemContract
};
