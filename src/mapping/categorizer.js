/**
 * src/mapping/categorizer.js
 *
 * 6-Category Classification Engine for Claude to Compose (ctc) v2.
 *
 * Classifies design nodes and existing Kotlin components into one of 6 mutually exclusive categories:
 * - REUSE_AS_IS: Zero code change; existing layout and styles fully match redesign.
 * - RETROFIT_STYLE: Modify styling in-place (Sol:OS grayscale tokens, Arizona fonts, hairlines).
 * - RESTRUCTURE_LAYOUT: Restructure layout containers (Row/Column, wrap vs fill, responsive breakpoints).
 * - NEW_COMPONENT: Synthesize a new native Composable function not present in existing app.
 * - REPLACE_CANVAS: Replace complex vector graphics or custom paint with Compose Canvas/ImageVector.
 * - DEPRECATE: Existing component is obsolete in the redesign.
 */

'use strict';

const CATEGORIES = Object.freeze({
  REUSE_AS_IS: 'REUSE_AS_IS',
  RETROFIT_STYLE: 'RETROFIT_STYLE',
  RESTRUCTURE_LAYOUT: 'RESTRUCTURE_LAYOUT',
  NEW_COMPONENT: 'NEW_COMPONENT',
  REPLACE_CANVAS: 'REPLACE_CANVAS',
  DEPRECATE: 'DEPRECATE'
});

/**
 * Classify a mapping candidate into one of 6 categories.
 *
 * @param {object} designNode Design node (Layer 1/2)
 * @param {object|null} existingTarget Existing app target node
 * @param {object} [metrics] Optional comparison metrics
 * @returns {string} One of the 6 CATEGORIES enum values
 */
function classifyCategory(designNode, existingTarget, metrics = {}) {
  const m = metrics || {};

  // If neither is provided -> default to NEW_COMPONENT
  if (!designNode && !existingTarget) {
    return CATEGORIES.NEW_COMPONENT;
  }

  // If present in existing app only -> DEPRECATE
  if (!designNode && existingTarget) {
    return CATEGORIES.DEPRECATE;
  }

  const dNode = designNode || {};

  // If present in design only or confidence is below threshold -> NEW_COMPONENT
  if (designNode && !existingTarget) {
    // Check if it is a canvas/vector node
    const isCanvas = (dNode.category === 'canvas' ||
      dNode.role === 'canvas' ||
      Boolean(dNode.vectorData || dNode.svgPath));
    return isCanvas ? CATEGORIES.REPLACE_CANVAS : CATEGORIES.NEW_COMPONENT;
  }

  // Both exist: check for canvas replacement first
  const isCanvas = (
    dNode.category === 'canvas' ||
    dNode.role === 'canvas' ||
    Boolean(dNode.vectorData || dNode.svgPath)
  );
  if (isCanvas) {
    return CATEGORIES.REPLACE_CANVAS;
  }

  // Check for layout restructuring
  // Layout restructuring happens if:
  // - Sizing mode changes (e.g. wrap vs fill)
  // - Flow topology changes (e.g. Column to Row)
  // - Responsive layout breakpoint overrides
  const layoutChanged = m.layoutChanged ||
    (dNode.layoutIntent && dNode.layoutIntent.topology &&
      m.existingTopology && dNode.layoutIntent.topology.flowType !== m.existingTopology) ||
    m.sizingModeChanged ||
    m.responsiveOverride;

  if (layoutChanged) {
    return CATEGORIES.RESTRUCTURE_LAYOUT;
  }

  // Check for styling modifications
  // In our DayLight LivePaper retrofit, existing Material 3 components
  // need Sol:OS neutral grayscale tokens (--os-0 to --os-1000) and Arizona fonts.
  const styleMatches = m.styleMatches === true;
  if (styleMatches && m.drift <= 0.5) {
    return CATEGORIES.REUSE_AS_IS;
  }

  // Default for paired components in redesign is RETROFIT_STYLE
  return CATEGORIES.RETROFIT_STYLE;
}

module.exports = {
  CATEGORIES,
  classifyCategory
};
