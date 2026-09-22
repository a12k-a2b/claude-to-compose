/**
 * src/mapping/multi_signal_scorer.js
 *
 * Multi-Signal Confidence Scoring Engine for Claude to Compose (ctc) v2.
 *
 * Combines 5 distinct signals:
 * 1. Test Tag & Source ID Token Match (weight: 0.40)
 * 2. Semantic Role & Widget Compatibility (weight: 0.25)
 * 3. Behavior & Action Binding Affinity (weight: 0.20)
 * 4. Structural Topology & Hierarchy Affinity (weight: 0.10)
 * 5. Visible Text & Content Description Similarity (weight: 0.05)
 *
 * Enforces the strict Anti-Deception Policy:
 * Text similarity alone CANNOT promote an ungrounded candidate to CONFIRMED or CANDIDATE status
 * when stable symbols, test tags, or action bindings exist.
 */

'use strict';

const WEIGHTS = Object.freeze({
  tag: 0.40,
  role: 0.25,
  behavior: 0.20,
  topology: 0.10,
  text: 0.05
});

const SYNONYMS = Object.freeze({
  btn: 'button',
  fab: 'action_button',
  input: 'textfield',
  txt: 'text',
  lbl: 'label',
  nav: 'navigation',
  back: 'back',
  pin: 'pin',
  save: 'save',
  del: 'delete',
  remove: 'delete',
  add: 'add',
  tag: 'tag',
  edit: 'editor',
  indicator: 'status'
});

/**
 * Tokenize an identifier string into normalized tokens.
 * Handles snake_case, camelCase, kebab-case, and path separators.
 */
function tokenizeIdentifier(str) {
  if (!str || typeof str !== 'string') return [];
  // Strip daylight prefix if present
  let clean = str.replace(/^daylight#/, '').replace(/^ctc#/, '');
  // Split on delimiters
  const rawTokens = clean
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\/\#\_\-\s\.\:]+/)
    .filter(t => t.length > 0);

  // Apply synonym expansion
  return rawTokens.map(t => SYNONYMS[t] || t);
}

/**
 * Compute Jaccard token overlap between two token arrays.
 */
function computeTokenOverlap(tokensA, tokensB) {
  if (!Array.isArray(tokensA) || !Array.isArray(tokensB) || !tokensA.length || !tokensB.length) return 0.0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Compute Tag Score between design sourceId and candidate existing target (testTags, symbol).
 */
function computeTagScore(designNode, candidate) {
  const dNode = designNode || {};
  const cand = candidate || {};
  const sourceId = dNode.sourceId || dNode.id || '';
  const candidateTags = [];

  if (typeof cand === 'string') {
    candidateTags.push(cand);
  } else if (cand) {
    if (cand.testTag) candidateTags.push(cand.testTag);
    if (Array.isArray(cand.testTags)) candidateTags.push(...cand.testTags);
    if (cand.symbol) candidateTags.push(cand.symbol);
    if (cand.composableName) candidateTags.push(cand.composableName);
    if (cand.name) candidateTags.push(cand.name);
  }

  if (!sourceId || candidateTags.length === 0) return 0.0;

  // If candidate is a COMPOSABLE_SCREEN and design node is a leaf element,
  // discount screen-level candidate matching against leaf widgets.
  const candType = (cand.targetType || '').toLowerCase();
  const isScreenCandidate = candType === 'composable_screen';
  const cleanId = sourceId.replace(/^daylight#/, '').replace(/^ctc#/, '');
  const isLeafNode = ['badge', 'chip', 'input', 'textbox', 'button', 'canvas', 'text', 'icon'].includes(
    (dNode.category || dNode.role || dNode.semantics?.role || '').toLowerCase()
  ) || Boolean(dNode.vectorData || dNode.svgPath);

  if (isScreenCandidate && isLeafNode) {
    return 0.1;
  }

  const sourceTokens = tokenizeIdentifier(sourceId);
  if (!sourceTokens.length) return 0.0;

  let bestScore = 0.0;
  for (const tag of candidateTags) {
    if (!tag) continue;
    // Exact match
    if (sourceId === tag || sourceId.toLowerCase() === tag.toLowerCase()) {
      return 1.0;
    }
    const candTokens = tokenizeIdentifier(tag);
    const overlap = computeTokenOverlap(sourceTokens, candTokens);

    // Calculate bidirectional coverage
    let candInSource = 0;
    for (const ct of candTokens) {
      if (sourceTokens.includes(ct)) candInSource++;
    }
    const candCoverage = candTokens.length > 0 ? candInSource / candTokens.length : 0.0;

    let sourceInCand = 0;
    for (const st of sourceTokens) {
      if (candTokens.includes(st)) sourceInCand++;
    }
    const sourceCoverage = sourceTokens.length > 0 ? sourceInCand / sourceTokens.length : 0.0;

    // If candidate tokens are fully covered in source hierarchy, score highly (e.g. 0.85+)
    let score = Math.max(overlap, candCoverage * 0.85 + sourceCoverage * 0.15);
    if (score > bestScore) bestScore = score;
  }

  return Math.min(1.0, Math.max(0.0, bestScore));
}

/**
 * Compute Semantic Role & Widget Compatibility.
 */
function computeRoleScore(designNode, candidate) {
  const dNode = designNode || {};
  const cand = candidate || {};
  let designRole = '';
  if (dNode.domTag === 'header' || (dNode.sourceId && /(toolbar|appbar|topbar)/i.test(dNode.sourceId))) {
    designRole = 'appbar';
  } else {
    designRole = (dNode.semantics?.role || dNode.role || dNode.category || dNode.domTag || '').toLowerCase();
  }
  const candName = (cand.testTag || cand.name || cand.composableName || (typeof cand === 'string' ? cand : '')).toLowerCase();
  const candType = (cand.targetType || cand.componentType || '').toLowerCase();

  if (!designRole && !candName) return 0.5;

  const roleCategories = {
    button: ['button', 'iconbutton', 'floatingactionbutton', 'fab', 'clickable'],
    text: ['text', 'heading', 'title', 'subtitle', 'body', 'label'],
    input: ['textfield', 'outlinedtextfield', 'basictextfield', 'input', 'editor'],
    chip: ['chip', 'inputchip', 'filterchip', 'assistchip', 'suggestionchip', 'badge'],
    appbar: ['topappbar', 'appbar', 'toolbar', 'actionbar', 'header'],
    container: ['column', 'row', 'box', 'scaffold', 'surface', 'card', 'header', 'toolbar', 'appbar'],
    icon: ['icon', 'imagevector', 'vector', 'painter']
  };

  let targetCat = null;
  for (const [cat, aliases] of Object.entries(roleCategories)) {
    if (aliases.some(a => designRole.includes(a))) {
      targetCat = cat;
      break;
    }
  }

  if (targetCat) {
    const matchingAliases = roleCategories[targetCat];
    if (matchingAliases.some(a => candName.includes(a) || candType.includes(a))) {
      return 1.0;
    }
  }

  // Check if candidate parameter is lambda (action) and design is button/clickable
  if ((designRole.includes('button') || dNode.semantics?.isInteractive) &&
      (cand.isLambda || cand.targetType === 'PARAMETER_LAMBDA' || candName.startsWith('on'))) {
    return 0.9;
  }

  // If candidate is a composable screen containing children
  if (candType === 'composable_screen') {
    const isContainer = ['container', 'root', 'scaffold', 'screen', 'header', 'row', 'column', 'toolbar', 'appbar'].includes(designRole);
    return isContainer ? 0.7 : 0.1;
  }

  return 0.2;
}

/**
 * Compute Behavior & Action Binding Affinity.
 */
function computeBehaviorScore(designNode, candidate, context = {}) {
  const dNode = designNode || {};
  const cand = candidate || {};
  const isDesignInteractive = Boolean(
    dNode.semantics?.isInteractive ||
    dNode.semantics?.clickable ||
    (dNode.transitions && dNode.transitions.length > 0) ||
    (dNode.sourceId && /(btn|button|input|action|tap|click)/i.test(dNode.sourceId))
  );

  const candName = (cand.name || cand.symbol || cand.methodName || cand.testTag || (typeof cand === 'string' ? cand : '')).toLowerCase();
  const isCandInteractive = Boolean(
    cand.isLambda ||
    cand.targetType === 'PARAMETER_LAMBDA' ||
    candName.startsWith('on') ||
    candName.includes('action') ||
    candName.includes('click') ||
    (cand.testTag && /(btn|button|input|action|tap|click|back|pin|save|delete)/i.test(cand.testTag)) ||
    (cand.targetType === 'TEST_TAG' && /(btn|button|input|action|tap|click|back|pin|save|delete)/i.test(candName))
  );

  if (isDesignInteractive && isCandInteractive) {
    // Check specific action alignment
    const sourceId = (dNode.sourceId || '').toLowerCase();
    const tag = (cand.testTag || '').toLowerCase();
    if ((sourceId.includes('back') && (candName.includes('back') || tag.includes('back'))) ||
        (sourceId.includes('save') && (candName.includes('save') || tag.includes('save'))) ||
        (sourceId.includes('pin') && (candName.includes('pin') || tag.includes('pin'))) ||
        (sourceId.includes('title') && (candName.includes('title') || tag.includes('title'))) ||
        (sourceId.includes('content') && (candName.includes('content') || tag.includes('content'))) ||
        (sourceId.includes('tag') && (candName.includes('tag') || tag.includes('tag'))) ||
        (sourceId.includes('delete') && (candName.includes('delete') || tag.includes('delete')))) {
      return 1.0;
    }
    return 0.75;
  }

  if (!isDesignInteractive && !isCandInteractive) {
    return 0.2; // Lack of interactivity is lack of evidence, not positive affinity
  }

  // Asymmetry: interactive design element with non-interactive target
  return 0.0;
}

/**
 * Compute Structural Topology & Hierarchy Affinity.
 */
function computeTopologyScore(designNode, candidate) {
  const dNode = designNode || {};
  const cand = candidate || {};
  const sourceId = (dNode.sourceId || '').toLowerCase();
  const candName = (cand.testTag || cand.name || cand.composableName || cand.symbol || (typeof cand === 'string' ? cand : '')).toLowerCase();
  const candType = (cand.targetType || '').toLowerCase();

  // Root / Scaffold
  if ((sourceId.includes('root') || sourceId.includes('screen')) &&
      (candName.includes('screen') || candName.includes('scaffold') || candType === 'composable_screen')) {
    return 1.0;
  }

  // Top AppBar / Toolbar
  if (sourceId.includes('toolbar') || sourceId.includes('appbar') || sourceId.includes('topbar')) {
    const elementName = (cand.testTag || cand.name || cand.composableName || cand.symbol || '').toLowerCase();
    const simpleName = elementName.includes('.') ? elementName.split('.').pop() : elementName;
    if (simpleName.includes('topbar') || simpleName.includes('appbar') || simpleName.includes('toolbar') || simpleName.includes('back') || candType === 'composable_screen') {
      return 1.0;
    }
    return 0.3;
  }

  // Relative vertical position
  const bounds = dNode.boundsDp || dNode.bounds || {};
  if (typeof bounds.y === 'number') {
    if (bounds.y < 80 && (candName.includes('top') || candName.includes('bar') || candName.includes('back'))) {
      return 0.9;
    }
    if (bounds.y >= 80 && (candName.includes('input') || candName.includes('content') || candName.includes('editor'))) {
      return 0.9;
    }
  }

  return 0.6;
}

/**
 * Compute Visible Text & Content Description Similarity.
 */
function computeTextScore(designNode, candidate) {
  const dNode = designNode || {};
  const cand = candidate || {};
  const designTexts = [];
  if (dNode.semantics?.contentDescription) designTexts.push(dNode.semantics.contentDescription);
  if (dNode.text) designTexts.push(dNode.text);
  if (Array.isArray(dNode.textRuns)) {
    for (const r of dNode.textRuns) {
      if (r && r.content) designTexts.push(r.content);
    }
  }

  const candTexts = [];
  if (cand.contentDescription) candTexts.push(cand.contentDescription);
  if (cand.text) candTexts.push(cand.text);
  if (cand.name) candTexts.push(cand.name);

  if (designTexts.length === 0 || candTexts.length === 0) {
    return 0.5; // neutral when no text available
  }

  let maxSim = 0.0;
  for (const dt of designTexts) {
    const dTokens = tokenizeIdentifier(dt);
    for (const ct of candTexts) {
      const cTokens = tokenizeIdentifier(ct);
      const overlap = computeTokenOverlap(dTokens, cTokens);
      if (overlap > maxSim) maxSim = overlap;
    }
  }

  return maxSim;
}

/**
 * Pure scoring function evaluating candidate mapping between a design node and an existing target.
 *
 * @param {object} designNode Layer 1/2 design node
 * @param {object|string} candidate Target Kotlin symbol / AST node
 * @param {object} [context] Optional contextual hints (appModel, designContract)
 * @returns {{ confidence: number, signals: { tagScore: number, roleScore: number, behaviorScore: number, topologyScore: number, textScore: number } }}
 */
function scoreCandidateMapping(designNode = {}, candidate = {}, context = {}) {
  const dNode = designNode || {};
  const cand = candidate || {};
  const ctx = context || {};
  const candObj = typeof cand === 'string' ? { symbol: cand } : cand;

  const tagScore = computeTagScore(dNode, candObj);
  const roleScore = computeRoleScore(dNode, candObj);
  const behaviorScore = computeBehaviorScore(dNode, candObj, ctx);
  const topologyScore = computeTopologyScore(dNode, candObj);
  const textScore = computeTextScore(dNode, candObj);

  let rawConfidence =
    tagScore * WEIGHTS.tag +
    roleScore * WEIGHTS.role +
    behaviorScore * WEIGHTS.behavior +
    topologyScore * WEIGHTS.topology +
    textScore * WEIGHTS.text;

  // Anti-Deception Guardrail:
  // If tagScore is 0 and behaviorScore is 0 and roleScore is low (< 0.5),
  // textScore alone MUST NOT elevate the confidence to >= 0.50.
  if (tagScore === 0 && behaviorScore === 0 && roleScore < 0.5) {
    rawConfidence = Math.min(rawConfidence, 0.45);
  }

  const confidence = Math.round(Math.min(1.0, Math.max(0.0, rawConfidence)) * 1000) / 1000;

  return {
    confidence,
    signals: {
      tagScore: Math.round(tagScore * 1000) / 1000,
      roleScore: Math.round(roleScore * 1000) / 1000,
      behaviorScore: Math.round(behaviorScore * 1000) / 1000,
      topologyScore: Math.round(topologyScore * 1000) / 1000,
      textScore: Math.round(textScore * 1000) / 1000
    }
  };
}

module.exports = {
  WEIGHTS,
  SYNONYMS,
  tokenizeIdentifier,
  computeTokenOverlap,
  computeTagScore,
  computeRoleScore,
  computeBehaviorScore,
  computeTopologyScore,
  computeTextScore,
  scoreCandidateMapping
};
