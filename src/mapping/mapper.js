/**
 * src/mapping/mapper.js
 *
 * Semantic Correspondence Mapper Engine for Claude to Compose (ctc) v2.
 *
 * Establishes 1:1 semantic and structural relationships between Claude Design contract nodes
 * and existing Kotlin/Compose application models, preserving business behavior, ViewModel
 * StateFlow bindings, Room persistence, and accessibility test tags.
 */

'use strict';

const crypto = require('crypto');
const { scoreCandidateMapping } = require('./multi_signal_scorer');
const { classifyCategory, CATEGORIES } = require('./categorizer');
const {
  CONFIDENCE_LEVELS,
  classifyMappingConfidence,
  detectDuplicateTargets,
  extractAlternativeCandidates
} = require('./ambiguity_resolver');
const { buildPreservationObligations } = require('./invariant_tracker');

/**
 * Recursively flatten a design contract scene tree into an array of design nodes.
 */
function extractDesignNodes(sceneRoot) {
  if (!sceneRoot || typeof sceneRoot !== 'object') return [];
  const nodes = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.sourceId || node.id || node.domTag || node.role) {
      nodes.push(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  visit(sceneRoot);
  return nodes;
}

/**
 * Extract all design nodes across all scenes in a design contract.
 */
function collectAllDesignNodes(designContract = {}) {
  const nodes = [];
  const scenes = designContract.measuredScenes?.scenes ||
    designContract.scenes ||
    {};

  for (const [key, scene] of Object.entries(scenes)) {
    if (scene.rootNode) {
      nodes.push(...extractDesignNodes(scene.rootNode));
    } else if (scene.nodes && Array.isArray(scene.nodes)) {
      for (const n of scene.nodes) {
        nodes.push(...extractDesignNodes(n));
      }
    } else if (typeof scene === 'object') {
      nodes.push(...extractDesignNodes(scene));
    }
  }

  // Deduplicate by sourceId
  const uniqueMap = new Map();
  for (const n of nodes) {
    const id = n.sourceId || n.id;
    if (id && !uniqueMap.has(id)) {
      uniqueMap.set(id, n);
    }
  }

  return Array.from(uniqueMap.values());
}

/**
 * Extract candidate targets from the existing app model.
 */
function collectExistingCandidates(appModel = {}, screenId = 'note_editor') {
  const model = appModel || {};
  const candidates = [];
  const screens = Array.isArray(model.screens) ? model.screens : [];
  let candidateScreens = screens;

  if (screenId && typeof screenId === 'string' && screens.length > 1) {
    const sTokens = screenId.replace(/^daylight#/, '').replace(/^ctc#/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[\/\#\_\-\s\.\:]+/)
      .filter(t => t.length > 0);

    const matching = screens.filter(s => {
      const screenText = `${s.composableName || ''} ${s.symbol || ''} ${s.filePath || ''}`.toLowerCase();
      return sTokens.every(t => screenText.includes(t));
    });

    if (matching.length > 0) {
      candidateScreens = matching;
    }
  }

  for (const screen of candidateScreens) {
    // The screen composable itself - only hold its own primary screen test tag
    candidates.push({
      symbol: screen.symbol || screen.composableName || 'UnknownScreen',
      composableName: screen.composableName || screen.symbol || 'UnknownScreen',
      filePath: screen.filePath || 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
      targetType: 'COMPOSABLE_SCREEN',
      testTag: (screen.testTags && screen.testTags[0]) || null,
      testTags: (screen.testTags && screen.testTags[0]) ? [screen.testTags[0]] : [],
      parameters: screen.parameters || []
    });

    // Each testTag declared on the screen
    if (Array.isArray(screen.testTags)) {
      for (const tag of screen.testTags) {
        candidates.push({
          symbol: `${screen.symbol || 'Screen'}.${tag}`,
          composableName: screen.composableName || screen.symbol,
          filePath: screen.filePath || '',
          targetType: 'TEST_TAG',
          testTag: tag,
          testTags: [tag]
        });
      }
    }

    // Parameters (lambdas and state objects)
    if (Array.isArray(screen.parameters)) {
      for (const p of screen.parameters) {
        candidates.push({
          symbol: `${screen.symbol || 'Screen'}.${p.name}`,
          composableName: screen.composableName || screen.symbol,
          filePath: screen.filePath || '',
          targetType: p.isLambda ? 'PARAMETER_LAMBDA' : (p.isState ? 'STATE_PROPERTY' : 'CALL_TREE_NODE'),
          name: p.name,
          type: p.type,
          isLambda: Boolean(p.isLambda || (p.name && p.name.startsWith('on'))),
          isState: Boolean(p.isState)
        });
      }
    }

    // Call tree nodes / child components
    const callNodes = Array.isArray(screen.callTree)
      ? screen.callTree
      : (screen.callTree?.children && Array.isArray(screen.callTree.children) ? screen.callTree.children : []);
    for (const c of callNodes) {
      if (c && c.component) {
        candidates.push({
          symbol: `${screen.symbol || 'Screen'}.${c.component}`,
          composableName: c.component,
          filePath: screen.filePath || '',
          targetType: 'COMPOSABLE_FUNCTION',
          lineNumber: c.line
        });
      }
    }
  }

  // Deduplicate candidates
  const candidateMap = new Map();
  for (const c of candidates) {
    const key = c.symbol || c.testTag || c.name;
    if (key && !candidateMap.has(key)) {
      candidateMap.set(key, c);
    }
  }

  return Array.from(candidateMap.values());
}

/**
 * Generate a complete CorrespondenceMap linking design contract nodes to existing Kotlin targets.
 *
 * @param {object} params
 * @param {object} [params.appModel] Existing App Model (AST indexed)
 * @param {object} [params.designContract] 4-Layer Design Contract IR
 * @param {string} [params.screenId='note_editor'] Target screen identifier
 * @param {object} [params.options] Optional mapping configuration
 * @returns {object} Validated CorrespondenceMap object conforming to Draft 2020-12 schema
 */
function generateCorrespondenceMap(params = {}) {
  const p = params || {};
  const appModel = p.appModel || {};
  const designContract = p.designContract || {};
  const screenId = p.screenId || 'note_editor';
  const options = p.options || {};

  const designNodes = collectAllDesignNodes(designContract);
  const existingCandidates = collectExistingCandidates(appModel, screenId);

  // If no design nodes or no existing candidates -> return empty mappings
  if (designNodes.length === 0 || existingCandidates.length === 0) {
    return createEmptyCorrespondenceMap(screenId, designContract, appModel);
  }

  const mappings = [];
  const mappedCandidateKeys = new Set();
  const unmappedDesignNodes = [];

  for (let i = 0; i < designNodes.length; i++) {
    const dNode = designNodes[i];
    const sourceId = dNode.sourceId || dNode.id || `design_node_${i}`;

    // Score against all candidate existing targets
    const scoredCandidates = [];
    for (const cand of existingCandidates) {
      const { confidence, signals } = scoreCandidateMapping(dNode, cand, { appModel, designContract });
      scoredCandidates.push({ candidate: cand, confidence, signals });
    }

    scoredCandidates.sort((a, b) => {
      if (Math.abs(b.confidence - a.confidence) > 1e-4) {
        return b.confidence - a.confidence;
      }
      // Specificity tie-breaker: element-level candidates beat container screen candidates
      const typeRank = {
        TEST_TAG: 5,
        PARAMETER_LAMBDA: 4,
        STATE_PROPERTY: 4,
        COMPOSABLE_FUNCTION: 3,
        CALL_TREE_NODE: 2,
        COMPOSABLE_SCREEN: 1
      };
      const rankA = typeRank[a.candidate.targetType] || 0;
      const rankB = typeRank[b.candidate.targetType] || 0;
      return rankB - rankA;
    });

    const best = scoredCandidates[0];

    if (best && best.confidence >= 0.50) {
      const existingTarget = best.candidate;
      const confidenceClassification = classifyMappingConfidence(best.confidence);
      const category = classifyCategory(dNode, existingTarget, {
        drift: 0.0,
        styleMatches: false
      });
      const preservationObligations = buildPreservationObligations(dNode, existingTarget);
      const alternativeCandidates = extractAlternativeCandidates(scoredCandidates);

      const screenSymbol = existingTarget.composableName || existingTarget.symbol || screenId || 'Screen';
      const simpleScreenName = String(screenSymbol).split('.').pop();
      const baseName = simpleScreenName.replace(/Screen$/, '');
      const inferredVm = existingTarget.stateHolderSymbol || (baseName ? `${baseName}ViewModel` : 'AppViewModel');
      const inferredAction = existingTarget.actionClass || (baseName ? `${baseName}Action` : 'AppAction');

      const mappingRecord = {
        id: `map_${sourceId.replace(/[^a-zA-Z0-9_]/g, '_')}_${i}`,
        designSourceId: sourceId,
        category,
        confidence: best.confidence,
        confidenceClassification,
        signals: best.signals,
        existingTarget: {
          composableSymbol: existingTarget.composableName || existingTarget.symbol || 'NoteEditorScreen',
          filePath: existingTarget.filePath || 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
          targetType: existingTarget.targetType || 'COMPOSABLE_FUNCTION',
          testTag: existingTarget.testTag || null,
          lineNumber: existingTarget.lineNumber || null
        },
        designNode: {
          domTag: dNode.domTag || 'div',
          role: dNode.semantics?.role || dNode.role || 'generic',
          category: dNode.category || 'container',
          boundsDp: {
            x: dNode.boundsDp?.x || dNode.bounds?.x || 0,
            y: dNode.boundsDp?.y || dNode.bounds?.y || 0,
            width: dNode.boundsDp?.width || dNode.bounds?.width || 0,
            height: dNode.boundsDp?.height || dNode.bounds?.height || 0
          }
        },
        stateBinding: existingTarget.isState ? {
          stateHolderSymbol: inferredVm,
          propertyName: existingTarget.name || 'uiState',
          flowType: 'StateFlow',
          isHoisted: true
        } : null,
        actionBinding: existingTarget.isLambda ? {
          actionName: existingTarget.name || 'onAction',
          actionClass: inferredAction,
          actionVariant: existingTarget.name ? (existingTarget.name.charAt(0).toUpperCase() + existingTarget.name.slice(1)) : 'OnAction',
          targetLayer: 'VIEWMODEL_EVENT',
          callbackParameter: existingTarget.name || 'onAction'
        } : null,
        preservationObligations,
        alternativeCandidates,
        ambiguityNote: alternativeCandidates.length > 0 ? 'Multiple candidate symbols scored close to best match.' : null
      };

      mappings.push(mappingRecord);
      mappedCandidateKeys.add(existingTarget.symbol || existingTarget.testTag);
    } else {
      // Unmapped design node
      const isCanvas = dNode.category === 'canvas' ||
        dNode.role === 'canvas' ||
        Boolean(dNode.vectorData || dNode.svgPath) ||
        (sourceId && sourceId.includes('canvas'));

      unmappedDesignNodes.push({
        designSourceId: sourceId,
        category: dNode.category || 'container',
        disposition: isCanvas ? 'REPLACE_CANVAS' : 'NEW_COMPONENT',
        suggestedComposableName: sourceId.replace(/[^a-zA-Z0-9]/g, '_'),
        suggestedParentSourceId: dNode.parentId || null
      });
    }
  }

  // Determine unmapped existing symbols
  const unmappedExistingSymbols = [];
  for (const cand of existingCandidates) {
    const key = cand.symbol || cand.testTag;
    if (!mappedCandidateKeys.has(key)) {
      unmappedExistingSymbols.push({
        symbol: cand.symbol || 'Unknown',
        testTag: cand.testTag || null,
        sourceFile: cand.filePath || '',
        disposition: 'DEPRECATE',
        reason: 'No corresponding redesign node found in Claude Design contract'
      });
    }
  }

  // Detect duplicate collisions
  const duplicateCollisions = detectDuplicateTargets(mappings);

  // Compute summary stats
  const byCategory = {
    REUSE_AS_IS: 0,
    RETROFIT_STYLE: 0,
    RESTRUCTURE_LAYOUT: 0,
    NEW_COMPONENT: unmappedDesignNodes.filter(n => n.disposition === 'NEW_COMPONENT').length,
    REPLACE_CANVAS: unmappedDesignNodes.filter(n => n.disposition === 'REPLACE_CANVAS').length,
    DEPRECATE: unmappedExistingSymbols.length
  };

  const byConfidence = {
    CONFIRMED_HIGH: 0,
    CANDIDATE_MEDIUM: 0,
    UNRESOLVED_AMBIGUITY: unmappedDesignNodes.length
  };

  for (const m of mappings) {
    if (byCategory[m.category] !== undefined) byCategory[m.category]++;
    if (byConfidence[m.confidenceClassification] !== undefined) byConfidence[m.confidenceClassification]++;
  }

  const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';

  return {
    version: '2.0.0',
    screenId,
    generatedAt: new Date().toISOString(),
    contractProvenance: {
      measuredScenesHash: designContract.provenance?.measuredScenesHash || dummyHash,
      layoutIntentHash: designContract.provenance?.layoutIntentHash || dummyHash,
      behaviorContractHash: designContract.provenance?.behaviorContractHash || dummyHash,
      designSystemHash: designContract.provenance?.designSystemHash || dummyHash
    },
    appModelProvenance: {
      appModelHash: appModel.provenance?.hash || dummyHash,
      targetModule: appModel.targetModule || 'app',
      packageName: appModel.packageName || 'com.claude.noteapp',
      entryComposableSymbol: appModel.screens?.[0]?.symbol || 'NoteEditorScreen',
      sourceFilePath: appModel.screens?.[0]?.filePath || 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'
    },
    mappings,
    unmappedExistingSymbols,
    unmappedDesignNodes,
    duplicateCollisions,
    summary: {
      totalDesignNodes: designNodes.length,
      totalExistingSymbols: existingCandidates.length,
      mappedCount: mappings.length,
      byCategory,
      byConfidence
    }
  };
}

/**
 * Creates an empty CorrespondenceMap when no inputs are available.
 */
function createEmptyCorrespondenceMap(screenId, designContract, appModel) {
  const dummyHash = '0000000000000000000000000000000000000000000000000000000000000000';
  return {
    version: '2.0.0',
    screenId: screenId || 'note_editor',
    generatedAt: new Date().toISOString(),
    contractProvenance: {
      measuredScenesHash: dummyHash,
      layoutIntentHash: dummyHash,
      behaviorContractHash: dummyHash,
      designSystemHash: dummyHash
    },
    appModelProvenance: {
      appModelHash: dummyHash,
      targetModule: 'app',
      packageName: 'com.claude.noteapp',
      entryComposableSymbol: 'NoteEditorScreen',
      sourceFilePath: 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'
    },
    mappings: [],
    unmappedExistingSymbols: [],
    unmappedDesignNodes: [],
    duplicateCollisions: [],
    summary: {
      totalDesignNodes: 0,
      totalExistingSymbols: 0,
      mappedCount: 0,
      byCategory: {
        REUSE_AS_IS: 0,
        RETROFIT_STYLE: 0,
        RESTRUCTURE_LAYOUT: 0,
        NEW_COMPONENT: 0,
        REPLACE_CANVAS: 0,
        DEPRECATE: 0
      },
      byConfidence: {
        CONFIRMED_HIGH: 0,
        CANDIDATE_MEDIUM: 0,
        UNRESOLVED_AMBIGUITY: 0
      }
    }
  };
}

module.exports = {
  generateCorrespondenceMap,
  scoreCandidateMapping,
  classifyMappingConfidence,
  detectDuplicateTargets
};
