'use strict';

/**
 * src/contract/layout_intent_builder.js
 *
 * Layer 2 Inferred Layout Intent IR Builder for ctc v2.
 * Synthesizes constraint sizing, structural topology, insets, and responsive
 * breakpoints by analyzing measured physical telemetry across multiple viewports.
 * Conforms to Draft 2020-12 LayoutIntentSpecification schema.
 */

const VALID_FLOW_TYPES = new Set([
  'ROW',
  'COLUMN',
  'BOX_OVERLAY',
  'GRID',
  'FLOW_ROW',
  'FLOW_COLUMN',
  'CANVAS_DRAW'
]);

const VALID_SIZING_MODES = new Set([
  'FIXED',
  'INTRINSIC_WRAP',
  'FILL_PARENT',
  'PROPORTIONAL_WEIGHT'
]);

function toFinite(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function toNonNegative(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * Clamps confidence score strictly within [0.0, 1.0].
 * @param {number} score
 * @returns {number}
 */
function clampConfidence(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0.5;
  return Math.max(0.0, Math.min(1.0, Number(score.toFixed(3))));
}

/**
 * Resolves a flowType string, falling back to 'COLUMN' if invalid or unknown.
 * @param {string} flowType
 * @returns {string}
 */
function resolveFlowType(flowType) {
  if (typeof flowType === 'string') {
    const normalized = flowType.toUpperCase().trim();
    if (VALID_FLOW_TYPES.has(normalized)) {
      return normalized;
    }
  }
  return 'COLUMN';
}

/**
 * Normalizes sizing constraints, resolving contradictions and clamping values.
 * e.g., if widthMode is FILL_PARENT or INTRINSIC_WRAP, fixedWidthDp is eliminated.
 *
 * @param {Object} sizing
 * @returns {Object}
 */
function normalizeSizing(sizing = {}) {
  const widthMode = VALID_SIZING_MODES.has(sizing.widthMode) ? sizing.widthMode : 'FIXED';
  const heightMode = VALID_SIZING_MODES.has(sizing.heightMode) ? sizing.heightMode : 'FIXED';

  const normalized = {
    widthMode,
    heightMode
  };

  if (widthMode === 'FIXED') {
    normalized.fixedWidthDp = toNonNegative(sizing.fixedWidthDp ?? sizing.widthDp, 0);
  } else if (widthMode === 'PROPORTIONAL_WEIGHT') {
    normalized.weight = Math.max(0.01, toFinite(sizing.weight, 1.0));
  }

  if (heightMode === 'FIXED') {
    normalized.fixedHeightDp = toNonNegative(sizing.fixedHeightDp ?? sizing.heightDp, 0);
  } else if (heightMode === 'PROPORTIONAL_WEIGHT') {
    normalized.weight = Math.max(0.01, toFinite(sizing.weight, 1.0));
  }

  if (sizing.minWidthDp !== undefined) normalized.minWidthDp = toNonNegative(sizing.minWidthDp, 0);
  if (sizing.maxWidthDp !== undefined) normalized.maxWidthDp = toNonNegative(sizing.maxWidthDp, 0);
  if (sizing.minHeightDp !== undefined) normalized.minHeightDp = toNonNegative(sizing.minHeightDp, 0);
  if (sizing.maxHeightDp !== undefined) normalized.maxHeightDp = toNonNegative(sizing.maxHeightDp, 0);
  if (sizing.aspectRatio !== undefined) {
    const ar = toFinite(sizing.aspectRatio, 0);
    if (ar > 0) normalized.aspectRatio = ar;
  }

  return normalized;
}

/**
 * Normalizes and clamps insets and gaps to ensure non-negative values.
 * @param {Object} insetsObj
 * @returns {Object}
 */
function normalizeInsets(insetsObj = {}) {
  const result = {};

  if (insetsObj.gapDp !== undefined) {
    result.gapDp = toNonNegative(insetsObj.gapDp, 0);
  }
  if (insetsObj.rowGapDp !== undefined) {
    result.rowGapDp = toNonNegative(insetsObj.rowGapDp, 0);
  }
  if (insetsObj.columnGapDp !== undefined) {
    result.columnGapDp = toNonNegative(insetsObj.columnGapDp, 0);
  }

  if (insetsObj.paddingDp) {
    result.paddingDp = {
      top: toNonNegative(insetsObj.paddingDp.top, 0),
      right: toNonNegative(insetsObj.paddingDp.right, 0),
      bottom: toNonNegative(insetsObj.paddingDp.bottom, 0),
      left: toNonNegative(insetsObj.paddingDp.left, 0)
    };
  }

  if (insetsObj.marginDp) {
    result.marginDp = {
      top: toNonNegative(insetsObj.marginDp.top, 0),
      right: toNonNegative(insetsObj.marginDp.right, 0),
      bottom: toNonNegative(insetsObj.marginDp.bottom, 0),
      left: toNonNegative(insetsObj.marginDp.left, 0)
    };
  }

  return result;
}

/**
 * Creates multi-viewport breakpoint rules for DC1 (Portrait: 1184x1584, Landscape: 1584x1184).
 * Handles unknown viewports gracefully.
 *
 * @param {Object} options
 * @returns {Object} Breakpoint rules dictionary
 */
function createBreakpointRules(options = {}) {
  const rules = {};

  if (options.portrait || options.daylightPortrait) {
    const p = options.portrait || options.daylightPortrait;
    rules.daylightPortrait = {
      visibility: p.visibility === 'GONE' ? 'GONE' : 'VISIBLE',
      flowOverride: p.flowOverride ? resolveFlowType(p.flowOverride) : undefined,
      widthModeOverride: p.widthModeOverride || undefined,
      heightModeOverride: p.heightModeOverride || undefined
    };
  }

  if (options.landscape || options.daylightLandscape) {
    const l = options.landscape || options.daylightLandscape;
    rules.daylightLandscape = {
      visibility: l.visibility === 'GONE' ? 'GONE' : 'VISIBLE',
      flowOverride: l.flowOverride ? resolveFlowType(l.flowOverride) : undefined,
      widthModeOverride: l.widthModeOverride || undefined,
      heightModeOverride: l.heightModeOverride || undefined
    };
  }

  for (const [key, val] of Object.entries(options)) {
    if (!['portrait', 'landscape', 'daylightPortrait', 'daylightLandscape'].includes(key) && val && typeof val === 'object') {
      rules[key] = {
        visibility: val.visibility === 'GONE' ? 'GONE' : 'VISIBLE',
        flowOverride: val.flowOverride ? resolveFlowType(val.flowOverride) : undefined,
        widthModeOverride: val.widthModeOverride || undefined,
        heightModeOverride: val.heightModeOverride || undefined
      };
    }
  }

  return rules;
}

/**
 * Infers layout intent for an individual node.
 * Evaluates multi-viewport width/height variations to classify sizing constraints,
 * child distribution for topology, and computes confidence scores.
 *
 * @param {Object} options
 * @returns {Object} NodeLayoutIntent
 */
function inferNodeIntent(options = {}, visited = new Set()) {
  const rawNode = (options && typeof options === 'object' && options._rawNode) ? options._rawNode : options;
  if (rawNode && typeof rawNode === 'object') {
    if (visited.has(rawNode)) {
      return {
        sourceId: (options.sourceId || rawNode.sourceId) ? `${options.sourceId || rawNode.sourceId}_cycle` : 'daylight#root/cyclic_node',
        category: 'container',
        sizing: { widthMode: 'INTRINSIC_WRAP', heightMode: 'INTRINSIC_WRAP' },
        topology: { flowType: 'COLUMN', alignment: 'Alignment.Start', distribution: 'START' },
        confidence: 0.5,
        alternativeExplanations: ['Cyclic child reference detected; cycle broken with safe wrap container.']
      };
    }
    visited.add(rawNode);
  }

  const sourceId = options.sourceId || 'daylight#root/node';
  const category = options.category || (options.childrenLayout ? 'container' : 'box');
  const alternativeExplanations = [];

  let confidence = 0.95;

  // 1. Sizing Inference
  let widthMode = 'FIXED';
  let heightMode = 'FIXED';
  let fixedWidthDp = options.fixedWidthDp;
  let fixedHeightDp = options.fixedHeightDp;
  let weight = undefined;

  const widths = options.measuredWidthAcrossViewports;
  const isSingleViewport = Boolean(options.singleViewportOnly || !widths || widths.length < 2);

  if (widths && widths.length >= 2) {
    const w1 = toFinite(widths[0], 0);
    const w2 = toFinite(widths[1], 0);
    const deltaW = Math.abs(w2 - w1);

    if (deltaW <= 2.0) {
      if (options.isText || options.category === 'text' || options.category === 'chip') {
        widthMode = 'INTRINSIC_WRAP';
        alternativeExplanations.push(`Measured width remained constant (${w1}px); inferred INTRINSIC_WRAP hugging content text.`);
      } else {
        widthMode = 'FIXED';
        fixedWidthDp = Number((w1 / 2.0).toFixed(2));
      }
      confidence = 0.98;
    } else if (deltaW >= 300) {
      widthMode = 'FILL_PARENT';
      confidence = 0.98;
    } else {
      widthMode = 'PROPORTIONAL_WEIGHT';
      weight = Number((deltaW / 400.0).toFixed(2));
      confidence = 0.92;
      alternativeExplanations.push(`Element expanded by ${deltaW}px; inferred PROPORTIONAL_WEIGHT with weight ${weight}.`);
    }
  } else {
    if (isSingleViewport) {
      confidence = 0.70;
      alternativeExplanations.push('Inferred from single viewport only; cannot definitively distinguish FIXED from FILL_PARENT without multi-width comparison.');
      if (options.measuredWidthDp && options.measuredWidthDp >= 560) {
        widthMode = 'FILL_PARENT';
        alternativeExplanations.push('Width >= 560dp closely matches screen width (592dp); inferred FILL_PARENT.');
      } else if (options.category === 'text' || options.isText) {
        widthMode = 'INTRINSIC_WRAP';
      } else {
        widthMode = 'FIXED';
      }
    }
  }

  if (options.widthMode) widthMode = options.widthMode;
  if (options.heightMode) heightMode = options.heightMode;

  const sizing = normalizeSizing({
    widthMode,
    heightMode,
    fixedWidthDp,
    fixedHeightDp,
    weight,
    minWidthDp: options.minWidthDp,
    maxWidthDp: options.maxWidthDp,
    minHeightDp: options.minHeightDp,
    maxHeightDp: options.maxHeightDp
  });

  // 2. Topology Inference
  let flowType = 'COLUMN';
  if (options.childrenLayout === 'horizontal' || options.flowType === 'ROW' || options.flexDirection === 'row') {
    flowType = 'ROW';
  } else if (options.childrenLayout === 'vertical' || options.flowType === 'COLUMN' || options.flexDirection === 'column') {
    flowType = 'COLUMN';
  } else if (options.flowType === 'BOX_OVERLAY' || options.hasOverlay) {
    flowType = 'BOX_OVERLAY';
  } else if (options.flowType === 'GRID' || options.isGrid) {
    flowType = 'GRID';
  } else if (options.flowType) {
    flowType = resolveFlowType(options.flowType);
  }

  const alignment = options.alignment || (flowType === 'ROW' ? 'Alignment.CenterVertically' : 'Alignment.Start');
  const distribution = options.distribution || 'START';

  const topology = {
    flowType,
    alignment,
    distribution
  };
  if (flowType === 'GRID' && options.gridColumns) {
    topology.gridColumns = options.gridColumns;
  }

  // 3. Gaps and Insets
  const gapsAndInsets = normalizeInsets(options.gapsAndInsets || {
    gapDp: options.gapDp || options.gap || 0,
    paddingDp: options.paddingDp,
    marginDp: options.marginDp
  });

  // 4. Wrapping & Scroll
  const wrapping = options.wrapping || (options.allowWrap ? {
    allowWrap: true,
    maxLines: options.maxLines || 1,
    overflowStrategy: options.overflowStrategy || 'CLIP'
  } : undefined);

  const scrollBehavior = options.scrollBehavior || (options.isScrollable ? {
    isScrollable: true,
    direction: options.scrollDirection || 'VERTICAL',
    stickyHeader: Boolean(options.stickyHeader)
  } : undefined);

  // 5. Breakpoints
  const breakpoints = options.breakpoints ? createBreakpointRules(options.breakpoints) : undefined;

  const intent = {
    sourceId,
    category,
    sizing,
    topology,
    confidence: clampConfidence(confidence),
    alternativeExplanations
  };

  if (Object.keys(gapsAndInsets).length > 0) intent.gapsAndInsets = gapsAndInsets;
  if (wrapping) intent.wrapping = wrapping;
  if (scrollBehavior) intent.scrollBehavior = scrollBehavior;
  if (breakpoints && Object.keys(breakpoints).length > 0) intent.breakpoints = breakpoints;

  if (Array.isArray(options.children) && options.children.length > 0) {
    intent.children = options.children.map(child => inferNodeIntent(child, visited));
  }

  return intent;
}

/**
 * Creates the root LayoutIntentSpecification conforming to Draft 2020-12 schema.
 * @param {Object} options
 * @returns {Object} LayoutIntentSpecification
 */
function createLayoutIntentBundle(options = {}) {
  const version = '2.0.0';
  const screenId = options.screenId || 'default_screen';
  const generatedAt = options.generatedAt || new Date().toISOString();
  const analyzedViewports = Array.isArray(options.analyzedViewports)
    ? options.analyzedViewports
    : ['daylight_portrait', 'daylight_landscape'];

  const rootIntent = options.rootIntent
    ? (options.rootIntent.sizing ? options.rootIntent : inferNodeIntent(options.rootIntent))
    : inferNodeIntent({ sourceId: `daylight#${screenId}/root`, category: 'container' });

  return {
    version,
    screenId,
    generatedAt,
    analyzedViewports,
    rootIntent
  };
}

module.exports = {
  inferNodeIntent,
  createLayoutIntentBundle,
  createBreakpointRules,
  normalizeSizing,
  normalizeInsets,
  resolveFlowType,
  clampConfidence
};
