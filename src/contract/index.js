'use strict';

/**
 * src/contract/index.js
 *
 * Public API for the 4-Layer Intermediate Representation (IR) & Design Contract Compiler.
 */

const {
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256
} = require('./measured_scene');

const {
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence
} = require('./layout_intent');

const {
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES
} = require('./behavior_contract');

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
} = require('./design_system');

const {
  buildDesignContract,
  synthesizeLayers,
  validateContractAgainstSchemas,
  validateScreenId,
  checkDuplicateSourceIds,
  writeContractToDisk,
  computeSha256
} = require('./compiler');

const {
  validateOwnerApproval,
  validateOwnerApprovalOrThrow,
  validateMeasuredScene,
  validateLayoutIntent,
  validateBehaviorContract,
  validateDesignSystem,
  validateContractReceipt,
  validateSchema,
  formatSchemaIssues,
  formatSchemaErrorsText,
  createContractAjv,
  schemas
} = require('./schemas');

const {
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  evaluateDeviations,
  DEVIATION_DOMAINS,
  DEVIATION_STATUSES,
  OWNER_APPROVAL_SCHEMA
} = require('./owner_approval');

module.exports = {
  // Layer 1: Measured Scene
  createMeasuredNode,
  createMeasuredBundle,
  allocateSourceId,
  isValidSha256,

  // Layer 2: Inferred Layout Intent
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence,

  // Layer 3: Behavior Contract
  createBehaviorContract,
  validateStateGraph,
  validateTrigger,
  detectCircularLoops,
  normalizeSettleMs,
  SUPPORTED_EVENT_TYPES,

  // Layer 4: Design System Contract
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
  createDesignSystemContract,

  // Compiler Orchestration
  buildDesignContract,
  synthesizeLayers,
  validateContractAgainstSchemas,
  validateScreenId,
  checkDuplicateSourceIds,
  writeContractToDisk,
  computeSha256,

  // Schemas & Validators (Draft 2020-12)
  validateOwnerApproval,
  validateOwnerApprovalOrThrow,
  validateMeasuredScene,
  validateLayoutIntent,
  validateBehaviorContract,
  validateDesignSystem,
  validateContractReceipt,
  validateSchema,
  formatSchemaIssues,
  formatSchemaErrorsText,
  createContractAjv,
  schemas,

  // Owner Approval & Deviation Engine
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  evaluateDeviations,
  DEVIATION_DOMAINS,
  DEVIATION_STATUSES,
  OWNER_APPROVAL_SCHEMA
};

