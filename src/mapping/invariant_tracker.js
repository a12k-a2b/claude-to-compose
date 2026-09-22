/**
 * src/mapping/invariant_tracker.js
 *
 * Invariant Preservation & Dual-Tagging Architecture for Claude to Compose (ctc) v2.
 *
 * Generates mandatory preservation obligations for each mapped element:
 * 1. Dual-tagging protocol: preserves existing Modifier.testTag values while binding ctc.sourceId semantics.
 * 2. Accessibility semantics: preserves contentDescription and enforces >=48dp touch targets on DC1.
 * 3. Architecture boundaries: locks Room database persistence, ViewModel StateFlows, and 300ms/500ms debounce.
 */

'use strict';

/**
 * Builds the list of preservation obligations for a mapped node.
 *
 * @param {object} designNode Design contract node (Layer 1/2/3)
 * @param {object|null} existingTarget Existing app AST target
 * @param {object} [context] Optional contextual data
 * @returns {Array<string>} Array of obligation strings
 */
function buildPreservationObligations(designNode = {}, existingTarget = null, context = {}) {
  const dNode = designNode || {};
  const ctx = context || {};
  const obligations = [];

  if (!existingTarget) {
    // New components must adhere to DC1 baseline invariants
    obligations.push('ENFORCE_DAYLIGHT_SOL_OS_TOKENS');
    obligations.push('ZERO_EPD_WAVEFORMS_PROHIBITION');
    if (dNode.sourceId) {
      obligations.push(`ATTACH_CTC_SEMANTICS:${dNode.sourceId}`);
    }
    const bounds = dNode.boundsDp || {};
    if (dNode.semantics?.isInteractive || (bounds.width && bounds.width < 48) || (bounds.height && bounds.height < 48)) {
      obligations.push('PRESERVE_MIN_TOUCH_TARGET_48DP');
    }
    return obligations;
  }

  // 1. TestTag Preservation & Dual-Tagging Protocol
  const testTag = existingTarget.testTag ||
    (Array.isArray(existingTarget.testTags) && existingTarget.testTags[0]) ||
    null;

  if (testTag) {
    obligations.push(`PRESERVE_TEST_TAG:${testTag}`);
    if (dNode.sourceId) {
      obligations.push(`DUAL_TAG_SEMANTICS:testTag("${testTag}")+sourceId("${dNode.sourceId}")`);
    }
  }

  // 2. Accessibility & Content Description
  const existingDesc = existingTarget.contentDescription;
  const designDesc = dNode.semantics?.contentDescription;
  const effectiveDesc = existingDesc || designDesc;
  if (effectiveDesc) {
    obligations.push(`PRESERVE_ACCESSIBILITY_DESCRIPTION:${effectiveDesc}`);
  }

  // Touch Target Compliance for DC1 Hardware (>= 48dp)
  const isInteractive = dNode.semantics?.isInteractive ||
    existingTarget.isLambda ||
    existingTarget.targetType === 'PARAMETER_LAMBDA' ||
    (dNode.sourceId && /(btn|button|chip|action|input)/i.test(dNode.sourceId));

  if (isInteractive) {
    obligations.push('PRESERVE_MIN_TOUCH_TARGET_48DP');
  }

  // 3. ViewModel & StateFlow Bindings
  if (existingTarget.stateBinding || existingTarget.isState || existingTarget.targetType === 'STATE_PROPERTY') {
    const prop = existingTarget.propertyName || existingTarget.name || 'uiState';
    obligations.push(`PRESERVE_STATE_FLOW_BINDING:${prop}`);
  }

  // 4. Action & Event Dispatch Lambdas
  if (existingTarget.actionBinding || existingTarget.isLambda || existingTarget.targetType === 'PARAMETER_LAMBDA') {
    const action = existingTarget.actionName || existingTarget.name || 'onAction';
    obligations.push(`PRESERVE_ACTION_BINDING:${action}`);
  }

  // 5. Room Persistence & Autosave Debounce
  const targetSymbol = (existingTarget.composableSymbol || existingTarget.symbol || '').toLowerCase();
  if (targetSymbol.includes('editor') || targetSymbol.includes('note')) {
    obligations.push('PRESERVE_ROOM_AUTOSAVE_DEBOUNCE');
    obligations.push('LOCK_FORBIDDEN_PATH:data/**');
  }

  // 6. Universal Daylight Hardware Constraints
  obligations.push('ZERO_EPD_WAVEFORMS_PROHIBITION');
  obligations.push('ENFORCE_DAYLIGHT_SOL_OS_TOKENS');

  return Array.from(new Set(obligations));
}

module.exports = {
  buildPreservationObligations
};
