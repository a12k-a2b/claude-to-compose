'use strict';

/**
 * src/contract/behavior_contract.js
 *
 * Layer 3 (Behavior Contract) interface for ctc v2 design contract.
 */

const {
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES,
  assertNoEpdHooks,
  FORBIDDEN_EPD_PATTERNS
} = require('./behavior_contract_builder');

module.exports = {
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES,
  assertNoEpdHooks,
  FORBIDDEN_EPD_PATTERNS
};
