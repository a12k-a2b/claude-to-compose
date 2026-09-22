/**
 * src/mapping/ambiguity_resolver.js
 *
 * Ambiguity Resolution & Collision Detection Engine for Claude to Compose (ctc) v2.
 *
 * Handles:
 * 1. Confidence classification: CONFIRMED_HIGH, CANDIDATE_MEDIUM, UNRESOLVED_AMBIGUITY.
 * 2. Duplicate target detection: flags when multiple design nodes claim the same existing Kotlin target.
 * 3. Tied confidence resolution: surfaces alternative candidates and reasons.
 */

'use strict';

const CONFIDENCE_LEVELS = Object.freeze({
  CONFIRMED_HIGH: 'CONFIRMED_HIGH',
  CANDIDATE_MEDIUM: 'CANDIDATE_MEDIUM',
  UNRESOLVED_AMBIGUITY: 'UNRESOLVED_AMBIGUITY'
});

/**
 * Classify a scalar confidence score into one of three standard tiers.
 *
 * @param {number} confidence Value between 0.0 and 1.0
 * @returns {string} CONFIRMED_HIGH (>= 0.85), CANDIDATE_MEDIUM (>= 0.50), or UNRESOLVED_AMBIGUITY (< 0.50)
 */
function classifyMappingConfidence(confidence) {
  const num = typeof confidence === 'number' ? confidence : 0;
  if (num >= 0.85) {
    return CONFIDENCE_LEVELS.CONFIRMED_HIGH;
  }
  if (num >= 0.50) {
    return CONFIDENCE_LEVELS.CANDIDATE_MEDIUM;
  }
  return CONFIDENCE_LEVELS.UNRESOLVED_AMBIGUITY;
}

/**
 * Detect duplicate target assignments in a list of mappings.
 *
 * @param {Array<object>} mappings Array of MappingRecord objects
 * @returns {Array<object>} Array of duplicate collision records
 */
function detectDuplicateTargets(mappings = []) {
  if (!Array.isArray(mappings)) return [];

  const targetMap = new Map();

  for (const m of mappings) {
    if (!m || !m.existingTarget) continue;
    const targetKey = m.existingTarget.testTag ||
      m.existingTarget.composableSymbol ||
      m.existingTarget.targetIdentifier ||
      (m.existingTarget.filePath ? `${m.existingTarget.filePath}#${m.existingTarget.composableSymbol}` : null);

    if (!targetKey) continue;

    if (!targetMap.has(targetKey)) {
      targetMap.set(targetKey, []);
    }
    targetMap.get(targetKey).push(m);
  }

  const collisions = [];

  for (const [targetKey, records] of targetMap) {
    if (records.length > 1) {
      const designIds = records.map(r => r.designSourceId || r.id);
      // Determine resolution:
      // If one candidate has significantly higher confidence, PRIMARY_WINS;
      // otherwise UNRESOLVED_COLLISION.
      const sorted = [...records].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      const diff = (sorted[0].confidence || 0) - (sorted[1].confidence || 0);
      const resolution = diff >= 0.20 ? 'PRIMARY_WINS' : 'UNRESOLVED_COLLISION';

      collisions.push({
        existingTargetIdentifier: targetKey,
        conflictingDesignSourceIds: designIds,
        resolution
      });
    }
  }

  return collisions;
}

/**
 * Identify alternative candidates when candidates have close or tied confidence scores.
 *
 * @param {Array<object>} scoredCandidates Array of { candidate, confidence, signals }
 * @param {number} [tolerance=0.15] Score difference threshold to consider as alternative
 * @returns {Array<object>} [{ symbol, confidence, reason }]
 */
function extractAlternativeCandidates(scoredCandidates = [], tolerance = 0.15) {
  if (!Array.isArray(scoredCandidates) || scoredCandidates.length <= 1) return [];

  const validCandidates = scoredCandidates.filter(
    item => item && item.candidate && typeof item.confidence === 'number'
  );
  if (validCandidates.length <= 1) return [];

  const sorted = [...validCandidates].sort((a, b) => b.confidence - a.confidence);
  const bestScore = sorted[0].confidence;
  const alternatives = [];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (bestScore - item.confidence <= tolerance) {
      const cand = item.candidate || {};
      alternatives.push({
        symbol: cand.symbol || cand.name || cand.testTag || 'unknown',
        confidence: item.confidence,
        reason: `Close confidence delta (${Math.round((bestScore - item.confidence) * 100) / 100}) to primary candidate`
      });
    }
  }

  return alternatives;
}

module.exports = {
  CONFIDENCE_LEVELS,
  classifyMappingConfidence,
  detectDuplicateTargets,
  extractAlternativeCandidates
};
