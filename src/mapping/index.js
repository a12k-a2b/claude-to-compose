/**
 * src/mapping/index.js
 *
 * Unified Barrel Export for the Semantic Correspondence Engine & Migration Planner (Milestone 3).
 */

'use strict';

const mapper = require('./mapper');
const planner = require('./planner');
const categorizer = require('./categorizer');
const scorer = require('./multi_signal_scorer');
const ambiguityResolver = require('./ambiguity_resolver');
const invariantTracker = require('./invariant_tracker');

module.exports = {
  // Mapper APIs
  generateCorrespondenceMap: mapper.generateCorrespondenceMap,
  scoreCandidateMapping: mapper.scoreCandidateMapping,
  classifyMappingConfidence: mapper.classifyMappingConfidence,
  detectDuplicateTargets: mapper.detectDuplicateTargets,

  // Planner APIs
  generateMigrationPlan: planner.generateMigrationPlan,
  validateBoundaries: planner.validateBoundaries,
  validateTaskGraph: planner.validateTaskGraph,
  computeTaskRiskScore: planner.computeTaskRiskScore,
  createRollbackAnchor: planner.createRollbackAnchor,
  deriveAllowedPaths: planner.deriveAllowedPaths,
  validateScreenId: planner.validateScreenId,
  validateForbiddenBehaviors: planner.validateForbiddenBehaviors,

  // Categorizer & Scorer
  CATEGORIES: categorizer.CATEGORIES,
  classifyCategory: categorizer.classifyCategory,
  scoreCandidate: scorer.scoreCandidateMapping,
  CONFIDENCE_LEVELS: ambiguityResolver.CONFIDENCE_LEVELS,
  buildPreservationObligations: invariantTracker.buildPreservationObligations
};
