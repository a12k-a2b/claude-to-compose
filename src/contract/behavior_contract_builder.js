'use strict';

/**
 * src/contract/behavior_contract_builder.js
 *
 * Layer 3 Behavior Contract IR Builder & State Machine Verifier for ctc v2.
 * Conforms to Draft 2020-12 BehaviorContractSpecification schema.
 */

const { assertNoEpdHooks, FORBIDDEN_EPD_PATTERNS } = require('./design_system_builder');

const SUPPORTED_EVENT_TYPES = [
  'TAP',
  'LONG_PRESS',
  'SWIPE',
  'FLING',
  'TEXT_CHANGE',
  'KEY_EVENT',
  'FOCUS',
  'WACOM_STYLUS',
  'STYLUS_STROKE',
  'BACK_PRESS'
];

/**
 * Normalizes settling time in ms for DC1 LivePaper standard (150ms).
 * @param {number} settleMs
 * @returns {number}
 */
function normalizeSettleMs(settleMs) {
  if (settleMs === undefined || settleMs === null) {
    return 150;
  }
  if (typeof settleMs !== 'number' || Number.isNaN(settleMs)) {
    return 150;
  }
  if (settleMs < 0 || settleMs > 5000) {
    return 150;
  }
  return Math.round(settleMs);
}

/**
 * Validates a trigger event object.
 * @param {Object} trigger
 * @returns {boolean}
 */
function validateTrigger(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    throw new Error('trigger must be a valid object');
  }
  if (!trigger.targetSourceId || typeof trigger.targetSourceId !== 'string' || trigger.targetSourceId.trim() === '') {
    throw new Error('Validation failed: targetSourceId required for trigger event');
  }
  if (trigger.eventType && !SUPPORTED_EVENT_TYPES.includes(trigger.eventType)) {
    throw new Error(`Invalid eventType: "${trigger.eventType}". Supported: ${SUPPORTED_EVENT_TYPES.join(', ')}`);
  }
  return true;
}

/**
 * Validates a state graph, ensuring that all transitions reference defined states.
 * @param {Object} graph
 * @returns {boolean}
 */
function validateStateGraph(graph) {
  if (!graph || typeof graph !== 'object') {
    throw new Error('Graph definition must be an object');
  }
  const namedStates = graph.namedStates || [];
  const transitions = graph.transitions || [];

  const validStateIds = new Set(namedStates.map(s => (typeof s === 'string' ? s : s.stateId)));

  for (const t of transitions) {
    if (!validStateIds.has(t.fromState)) {
      throw new Error(`Invalid transition: fromState "${t.fromState}" not found in namedStates`);
    }
    if (!validStateIds.has(t.toState)) {
      throw new Error(`Invalid transition: toState "${t.toState}" not found in namedStates`);
    }
    if (t.triggerEvent) {
      validateTrigger(t.triggerEvent);
    }
  }

  return true;
}

/**
 * Detects circular infinite transition loops without guard conditions.
 * @param {Object} graph
 * @returns {Object} { hasUnguardedCycle: boolean, cycles: Array }
 */
function detectCircularLoops(graph) {
  const transitions = (graph && graph.transitions) || [];
  const adj = new Map();

  for (const t of transitions) {
    if (!t.guardCondition) {
      if (!adj.has(t.fromState)) adj.set(t.fromState, []);
      adj.get(t.fromState).push(t.toState);
    }
  }

  const visited = new Set();
  const recStack = new Set();
  const cycles = [];

  function dfs(node, path) {
    visited.add(node);
    recStack.add(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
        cycles.push([...path, neighbor]);
      }
    }

    recStack.delete(node);
  }

  for (const state of adj.keys()) {
    if (!visited.has(state)) {
      dfs(state, [state]);
    }
  }

  return {
    hasUnguardedCycle: cycles.length > 0,
    cycles
  };
}

/**
 * Creates an immutable Layer 3 Behavior Contract.
 * @param {Object} spec
 * @returns {Object} BehaviorContract
 */
function createBehaviorContract(spec = {}) {
  let epdViolation = null;
  const str = typeof spec === 'string' ? spec : JSON.stringify(spec);
  for (const pattern of FORBIDDEN_EPD_PATTERNS) {
    if (str.includes(pattern)) {
      epdViolation = pattern;
      break;
    }
  }

  if (epdViolation && spec.strict === true) {
    assertNoEpdHooks(spec);
  }
  const screenId = spec.screenId || 'unnamed_screen';

  // Extract explicit namedStates, or gather from transitions if not explicitly specified
  let namedStates = spec.namedStates;
  if (!namedStates) {
    const stateSet = new Set(['DEFAULT', 'EMPTY', 'POPULATED', 'LOADING', 'ERROR', 'EDITING']);
    if (spec.transitions) {
      for (const t of spec.transitions) {
        if (t.fromState) stateSet.add(t.fromState);
        if (t.toState) stateSet.add(t.toState);
      }
    }
    namedStates = Array.from(stateSet).map(s => ({
      stateId: s,
      description: `State ${s}`,
      isSystemState: ['DEFAULT', 'LOADING', 'EMPTY', 'ERROR', 'OFFLINE', 'EDITING', 'POPULATED', 'SAVED', 'DISMISSED'].includes(s) ? s : undefined,
      variableAssignments: {}
    }));
  } else {
    namedStates = namedStates.map(s => {
      if (typeof s === 'string') {
        return {
          stateId: s,
          description: `State ${s}`,
          variableAssignments: {}
        };
      }
      const sId = s.stateId || s.stateName || s.name || s.id;
      return {
        stateId: sId,
        description: s.description || `State ${sId}`,
        isSystemState: s.isSystemState,
        variableAssignments: s.variableAssignments || {},
        entryActions: s.entryActions,
        exitActions: s.exitActions
      };
    });
  }

  const stateVariables = (spec.stateVariables || []).map(v => ({
    name: v.name || v.variableName || v.id,
    type: v.type || 'String',
    defaultValue: v.defaultValue !== undefined ? v.defaultValue : (v.initialValue !== undefined ? v.initialValue : (v.type === 'Boolean' ? false : v.type === 'Int' ? 0 : v.type === 'List' ? [] : '')),
    options: v.options || undefined,
    isHoisted: v.isHoisted !== undefined ? v.isHoisted : true,
    preservationRequired: v.preservationRequired !== undefined ? v.preservationRequired : false,
    sourceMapping: v.sourceMapping || undefined,
    description: v.description || undefined
  }));

  const transitions = (spec.transitions || []).map((t, idx) => ({
    id: t.id || `trans_${String(idx + 1).padStart(3, '0')}`,
    fromState: t.fromState,
    toState: t.toState,
    triggerEvent: {
      eventType: t.triggerEvent.eventType || 'TAP',
      targetSourceId: t.triggerEvent.targetSourceId,
      key: t.triggerEvent.key || undefined,
      parameters: t.triggerEvent.parameters || undefined
    },
    guardCondition: t.guardCondition || undefined,
    appAction: t.appAction ? {
      actionName: t.appAction.actionName,
      targetLayer: t.appAction.targetLayer || 'ROOM_PERSISTENCE',
      payloadMapping: t.appAction.payloadMapping || {},
      debounceMs: t.appAction.debounceMs !== undefined ? t.appAction.debounceMs : 300,
      invariantId: t.appAction.invariantId || undefined
    } : undefined,
    navigationEffect: t.navigationEffect ? {
      type: t.navigationEffect.type,
      targetRoute: t.navigationEffect.targetRoute || undefined,
      popTarget: t.navigationEffect.popTarget || undefined,
      preserveBackStack: t.navigationEffect.preserveBackStack !== undefined ? t.navigationEffect.preserveBackStack : true
    } : undefined,
    animationTrack: t.animationTrack ? {
      durationMs: t.animationTrack.durationMs !== undefined ? t.animationTrack.durationMs : 150,
      easing: t.animationTrack.easing || 'FastOutSlowIn',
      springParameters: t.animationTrack.springParameters || undefined,
      interruptionSemantics: t.animationTrack.interruptionSemantics || 'CANCEL_AND_START',
      reducedMotionFallback: t.animationTrack.reducedMotionFallback || 'INSTANT_CUT',
      propertiesAnimated: t.animationTrack.propertiesAnimated || ['alpha', 'translationY']
    } : undefined
  }));

  if (spec.namedStates && spec.transitions) {
    validateStateGraph({ namedStates, transitions });
  }

  const checkpoints = (spec.checkpoints || [
    { id: 't0_initial', timestampMs: 0, state: {}, action: 'init', actionDescription: 'Initial settled screen state' },
    { id: 't1_interaction', timestampMs: 50, state: {}, action: 'tap', actionDescription: 'Interaction initiated with touch dwell' },
    { id: 't2_settled', timestampMs: 150, state: {}, action: 'settle', actionDescription: 'Settled fluid LivePaper state (150ms zero EPD wait)' }
  ]).map(cp => ({
    id: cp.id,
    timestampMs: normalizeSettleMs(cp.timestampMs),
    state: cp.state || {},
    action: cp.action || 'none',
    actionDescription: cp.actionDescription || cp.description || '',
    expectedElementStates: cp.expectedElementStates || undefined
  }));

  const settleMs = normalizeSettleMs(spec.targetDisplay?.settleStandardMs ?? spec.settleStandardMs);

  const contract = {
    version: '2.0.0',
    screenId,
    description: spec.description || `Behavior Contract for ${screenId}`,
    targetDisplay: {
      technology: 'Transflective LivePaper LCD (60Hz - 120Hz)',
      settleStandardMs: settleMs,
      zeroEpdWaveforms: !epdViolation,
      allowScreenClearFlashes: false,
      allowActionRefreshBroadcast: false
    },
    stateVariables,
    namedStates,
    transitions,
    focusAndKeyboard: spec.focusAndKeyboard || {
      initialFocusSourceId: undefined,
      focusTraversalOrder: [],
      imeAction: 'Done',
      physicalKeyboardShortcuts: [
        { key: 'Escape', actionName: 'dismissOrPopBack' }
      ]
    },
    checkpoints
  };

  if (epdViolation) {
    contract.epdViolation = epdViolation;
    contract.zeroEpdWaveformsConfirmed = false;
  }

  return contract;
}

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
