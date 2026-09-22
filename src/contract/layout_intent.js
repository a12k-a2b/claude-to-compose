'use strict';

/**
 * src/contract/layout_intent.js
 *
 * Layer 2 (Inferred Layout Intent) interface for ctc v2 design contract.
 */

const {
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence
} = require('./layout_intent_builder');

module.exports = {
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence
};
