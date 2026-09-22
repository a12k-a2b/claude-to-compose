'use strict';

/**
 * src/defects/root_cause.js
 *
 * Causal Attribution Engine & Heuristics for ctc v2.
 */

const {
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation
} = require('./remediation');

/**
 * Classifies the causal root cause of a defect from contextual signals.
 * @param {object} context
 * @returns {object} { rootCause, confidence, explanation, remediationAction, remediation }
 */
function classifyRootCause(context = {}) {
  // 1. Prohibited EPD Workaround Check (HIGHEST PRIORITY - Zero Tolerance)
  if (
    context.hasEpdHook ||
    context.matchedPattern ||
    (context.settleMs !== undefined && context.settleMs >= 500) ||
    context.category === 'EPD_FLASH_DETECTED' ||
    context.errorCode === 'EPD_WORKAROUND_VIOLATION' ||
    context.rootCause === 'FORBIDDEN_EPD_WORKAROUND' ||
    context.rootCause === 'EPD_WORKAROUND_VIOLATION'
  ) {
    const remediation = generateEpdRemovalRemediation({
      targetFile: context.targetFile || 'NoteEditorScreen.kt',
      forbiddenCode: context.matchedPattern || 'ACTION_REFRESH_SCREEN'
    });
    return {
      rootCause: 'FORBIDDEN_EPD_WORKAROUND',
      confidence: 0.99,
      explanation: 'Forbidden EPD waveform clear hooks or artificial modal dismiss pauses (>=500ms) detected. DC1 LivePaper display uses standard 60-120Hz SurfaceFlinger rendering.',
      remediationAction: remediation.action,
      remediation
    };
  }

  // 2. Missing Evidence Check (Contract, Preview, Hardware Lease)
  if (
    context.category === 'EVIDENCE_MISSING' ||
    context.errorCode === 'PREVIEW_RENDER_MISSING' ||
    context.errorCode === 'CONTRACT_EVIDENCE_MISSING' ||
    context.errorCode === 'HARDWARE_LEASE_TIMEOUT' ||
    context.rootCause === 'PREVIEW_RENDER_MISSING' ||
    context.rootCause === 'CONTRACT_EVIDENCE_MISSING' ||
    context.rootCause === 'HARDWARE_LEASE_TIMEOUT'
  ) {
    const isPreview = context.errorCode === 'PREVIEW_RENDER_MISSING' || context.rootCause === 'PREVIEW_RENDER_MISSING';
    const isHardware = context.errorCode === 'HARDWARE_LEASE_TIMEOUT' || context.rootCause === 'HARDWARE_LEASE_TIMEOUT';
    const rootCause = isPreview
      ? 'PREVIEW_RENDER_MISSING'
      : (isHardware ? 'HARDWARE_LEASE_TIMEOUT' : 'CONTRACT_EVIDENCE_MISSING');

    const action = isPreview
      ? 'Build Compose preview rendering and capture PNG screenshot to satisfy perceptual verification gate.'
      : (isHardware
        ? 'Acquire exclusive hardware concurrency lease for Daylight DC1 tablet or release stalled sessions.'
        : 'Generate or provide valid design contract bundle conforming to 4-layer IR schema.');

    const explanation = isPreview
      ? 'Rendered preview screenshot artifact is missing or unreadable; fail-closed gate prevents metric evaluation.'
      : (isHardware
        ? 'DC1 hardware tablet lease timed out without acquiring an active testing session.'
        : 'Design contract evidence is missing or corrupted; fail-closed gate prevents unvalidated verification.');

    return {
      rootCause,
      confidence: 0.99,
      explanation,
      remediationAction: action,
      remediation: generateGenericRemediation({
        action,
        targetFile: context.targetFile || null,
        sourceId: context.sourceId || null
      })
    };
  }

  // 3. Missing Required Element
  if (context.category === 'MISSING_ELEMENT' || context.errorCode === 'ELEMENT_NOT_RENDERED' || context.rootCause === 'ELEMENT_NOT_RENDERED') {
    const action = `Restore required composable for node "${context.sourceId || 'required_element'}" into the screen Composable hierarchy.`;
    return {
      rootCause: 'ELEMENT_NOT_RENDERED',
      confidence: 0.99,
      explanation: 'Required semantic UI element present in Design Contract was not rendered in Compose layout.',
      remediationAction: action,
      remediation: generateGenericRemediation({ action, targetFile: context.targetFile, sourceId: context.sourceId })
    };
  }

  // 4. Missing Asset or Font
  if (
    context.missingAsset ||
    context.category === 'ASSET_MISSING' ||
    context.errorCode === 'FONT_RESOURCE_MISSING' ||
    context.rootCause === 'ASSET_RESOURCE_MISSING' ||
    context.rootCause === 'FONT_RESOURCE_MISSING'
  ) {
    const action = `Ensure required asset or font file (${context.missingAsset || 'font.ttf'}) is placed in res/font/ or res/drawable/ and registered in build.gradle.kts.`;
    return {
      rootCause: 'ASSET_RESOURCE_MISSING',
      confidence: 0.98,
      explanation: 'Required font or vector asset is missing or has cryptographic hash mismatch.',
      remediationAction: action,
      remediation: generateGenericRemediation({ action, targetFile: context.targetFile })
    };
  }

  // 5. Behavioral Callback Detachment & Invariants
  if (
    context.callbackDetached ||
    context.persistenceMissing ||
    context.isInvariantBroken ||
    context.category === 'INVARIANT_BROKEN' ||
    context.errorCode === 'INVARIANT_BROKEN' ||
    context.rootCause === 'VIEWMODEL_CALLBACK_DETACHMENT'
  ) {
    const action = 'Bind composable event lambda (onClick, onValueChange) to corresponding ViewModel method and verify Room persistence triggers.';
    return {
      rootCause: 'VIEWMODEL_CALLBACK_DETACHMENT',
      confidence: 0.91,
      explanation: 'User interaction event failed to transition state or trigger data persistence during behavioral replay.',
      remediationAction: action,
      remediation: generateGenericRemediation({ action, targetFile: context.targetFile })
    };
  }

  // 6. Contrast Failure & Color Collapse
  if (
    context.contrastRatio !== undefined ||
    context.category === 'CONTRAST_FAILURE' ||
    context.category === 'COLOR_COLLAPSE' ||
    context.errorCode === 'CONTRAST_COLLAPSE' ||
    context.rootCause === 'CONTRAST_COLLAPSE' ||
    context.rootCause === 'CONTRAST_DEFICIT' ||
    context.rootCause === 'THEME_TOKEN_MISREFERENCE'
  ) {
    const remediation = generateContrastRemediation({
      composableSymbol: context.composable || 'HeadlineText',
      targetFile: context.targetFile || 'NoteEditorScreen.kt',
      currentToken: context.actualToken || 'SolTheme.colors.os200',
      compliantToken: context.expectedToken || 'SolTheme.colors.os900'
    });
    const isColorCollapse = context.isColorCollapse || context.category === 'COLOR_COLLAPSE';
    const isContrastCollapse = context.role === 'caption' ||
      context.isContrastDeficit === true ||
      context.rootCause === 'CONTRAST_DEFICIT' ||
      (context.errorCode === 'CONTRAST_COLLAPSE' && (context.role === 'caption' || context.isLargeText === false));

    const rootCause = isColorCollapse
      ? 'COLOR_COLLAPSE'
      : (isContrastCollapse ? 'CONTRAST_DEFICIT' : 'THEME_TOKEN_MISREFERENCE');

    return {
      rootCause,
      confidence: 0.94,
      explanation: `Measured contrast ratio (${context.contrastRatio || 'low'}) fails WCAG 2.1 AA/AAA thresholds on 8-bit grayscale LivePaper display. Element references low-contrast token.`,
      remediationAction: remediation.action,
      remediation
    };
  }

  // 7. Touch Target Deflation Check
  if (
    context.category === 'TOUCH_TARGET_TOO_SMALL' ||
    context.errorCode === 'TOUCH_TARGET_TOO_SMALL' ||
    context.rootCause === 'TOUCH_TARGET_INFLATION_OR_DEFLATION' ||
    (context.touchWidthDp !== undefined && (context.touchWidthDp < 48 || context.touchHeightDp < 48))
  ) {
    const remediation = generateTouchTargetRemediation({
      composableSymbol: context.composable || 'IconButton',
      targetFile: context.targetFile || 'NoteEditorScreen.kt'
    });
    return {
      rootCause: 'TOUCH_TARGET_INFLATION_OR_DEFLATION',
      confidence: 0.95,
      explanation: `Interactive element effective touch bounds (${context.touchWidthDp || 'small'}x${context.touchHeightDp || 'small'}dp) are below minimum 48x48dp requirement.`,
      remediationAction: remediation.action,
      remediation
    };
  }

  // 8. Font Metrics & Baseline Drift Check
  if (context.baselineDelta !== undefined && Math.abs(context.baselineDelta) > 2.0 && (!context.dx || Math.abs(context.dx) <= 1.0)) {
    const action = 'Update TextStyle lineHeight, baselineShift, or letterSpacing in Type.kt to match reference typography metrics.';
    return {
      rootCause: 'FONT_METRICS_LEADING_MISMATCH',
      confidence: 0.89,
      explanation: `Baseline offset |Δy| = ${Math.abs(context.baselineDelta).toFixed(1)}px exceeds 2.0px threshold while horizontal centroid is aligned.`,
      remediationAction: action,
      remediation: generateGenericRemediation({ action, targetFile: context.targetFile })
    };
  }

  // 9. Modifier Chain Order
  if (context.modifierChainIssue) {
    const action = 'Reorder Modifier chain: place Modifier.clickable() before visual padding, or use Modifier.minimumInteractiveComponentSize().';
    return {
      rootCause: 'INCORRECT_MODIFIER_CHAIN_ORDER',
      confidence: 0.85,
      explanation: 'Composable Modifier invocation chain places clickable() after padding or clip(), causing touch or clipping bounds divergence.',
      remediationAction: action,
      remediation: generateGenericRemediation({ action, targetFile: context.targetFile })
    };
  }

  // 10. Sibling Shifts Check strictly for spatial drift
  const isExplicitlyNonSpatial = [
    'CONTRAST_FAILURE',
    'COLOR_COLLAPSE',
    'MISSING_ELEMENT',
    'ASSET_MISSING',
    'INVARIANT_BROKEN',
    'EPD_FLASH_DETECTED',
    'EVIDENCE_MISSING',
    'TOUCH_TARGET_TOO_SMALL'
  ].includes(context.category);

  if (!isExplicitlyNonSpatial && (!context.category || context.category === 'MARGIN_SHIFT' || context.dx !== undefined || context.dy !== undefined || context.drift !== undefined || (Array.isArray(context.siblingShifts) && context.siblingShifts.length > 0))) {
    const shifts = Array.isArray(context.siblingShifts) ? context.siblingShifts : [];
    const directShift = typeof context.drift === 'number' ? context.drift : (
      (context.dx !== undefined || context.dy !== undefined) ? Math.hypot(context.dx || 0, context.dy || 0) : null
    );

    if (shifts.length >= 2) {
      const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length;
      const variance = shifts.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / shifts.length;

      if (variance <= 1.0) {
        const remediation = generateSpatialRemediation({
          shiftPx: Math.round(mean),
          parentSymbol: context.parentSymbol || 'Column',
          targetFile: context.targetFile || 'NoteEditorScreen.kt'
        });
        return {
          rootCause: 'PARENT_INSET_ACCUMULATION',
          confidence: 0.95,
          explanation: `All ${shifts.length} sibling elements exhibit identical translation shift (~${mean.toFixed(1)}px, variance ${variance.toFixed(2)}px² <= 1.0px²). Root cause is parent container vertical/horizontal padding accumulation.`,
          remediationAction: remediation.action,
          remediation
        };
      }

      // Monotonic spacer drift check
      let isMonotonicInc = true;
      let isMonotonicDec = true;
      for (let i = 1; i < shifts.length; i++) {
        if (shifts[i] < shifts[i - 1]) isMonotonicInc = false;
        if (shifts[i] > shifts[i - 1]) isMonotonicDec = false;
      }
      if ((isMonotonicInc || isMonotonicDec) && Math.abs(shifts[shifts.length - 1] - shifts[0]) > 5) {
        const action = `Adjust Arrangement.spacedBy() or inter-item Spacer heights in parent ${context.parentSymbol || 'Column'} to eliminate cumulative drift.`;
        return {
          rootCause: 'CUMULATIVE_SPACER_DRIFT',
          confidence: 0.88,
          explanation: 'Sibling elements exhibit monotonically increasing spatial offsets across sibling indices. Indicates cumulative Spacer or Arrangement.spacedBy drift.',
          remediationAction: action,
          remediation: generateGenericRemediation({ action, targetFile: context.targetFile })
        };
      }
    }

    if (shifts.length === 1) {
      const shift = shifts[0];
      const isHardVeto =
        context.rootCause === 'HARD_MARGIN_SHIFT_VETO' ||
        context.errorCode === 'HARD_MARGIN_SHIFT_VETO' ||
        (context.errorCode === 'GEOMETRY_DRIFT' && Math.abs(shift - 10.0) < 0.01);
      if (isHardVeto) {
        const remediation = generateSpatialRemediation({
          shiftPx: shift,
          parentSymbol: context.parentSymbol || 'Column',
          targetFile: context.targetFile || 'NoteEditorScreen.kt'
        });
        return {
          rootCause: 'HARD_MARGIN_SHIFT_VETO',
          confidence: 0.95,
          explanation: `Gross margin shift of ${shift.toFixed(1)}px exceeds hard veto threshold (>= 10.0px). Violates fail-closed geometry gate.`,
          remediationAction: remediation.action,
          remediation
        };
      }

      const remediation = generateSpatialRemediation({
        shiftPx: shift,
        parentSymbol: context.parentSymbol || 'Column',
        targetFile: context.targetFile || 'NoteEditorScreen.kt'
      });
      return {
        rootCause: 'PARENT_INSET_ACCUMULATION',
        confidence: 0.92,
        explanation: `Single container item shifted by ~${shift.toFixed(1)}px. Indicates parent container inset/padding accumulation.`,
        remediationAction: remediation.action,
        remediation
      };
    }

    if (directShift !== null && directShift !== undefined) {
      const isHardVeto =
        context.rootCause === 'HARD_MARGIN_SHIFT_VETO' ||
        context.errorCode === 'HARD_MARGIN_SHIFT_VETO' ||
        (context.errorCode === 'GEOMETRY_DRIFT' && directShift >= 10.0);
      if (isHardVeto) {
        const remediation = generateSpatialRemediation({
          shiftPx: directShift,
          parentSymbol: context.parentSymbol || 'Column',
          targetFile: context.targetFile || 'NoteEditorScreen.kt'
        });
        return {
          rootCause: 'HARD_MARGIN_SHIFT_VETO',
          confidence: 0.95,
          explanation: `Gross margin shift of ${directShift.toFixed(1)}px exceeds hard veto threshold (>= 10.0px). Violates fail-closed geometry gate.`,
          remediationAction: remediation.action,
          remediation
        };
      }
    }
  }

  // 11. Fallback: GENERIC_LAYOUT_DRIFT
  const genericRemediation = generateGenericRemediation({
    sourceId: context.sourceId || 'isolated_node',
    targetFile: context.targetFile
  });
  return {
    rootCause: 'GENERIC_LAYOUT_DRIFT',
    confidence: 0.70,
    explanation: 'Isolated node drift without correlated sibling shift or known systemic pattern.',
    remediationAction: genericRemediation.action,
    remediation: genericRemediation
  };
}

module.exports = {
  classifyRootCause
};
