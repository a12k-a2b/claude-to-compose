'use strict';

/**
 * src/defects/oracle.js
 *
 * Causal Defect Oracle Coordinator for ctc v2.
 * Attributes verification failures to stable element IDs, diagnoses root causes,
 * and generates structured DefectReport artifacts.
 */

const { DEFECT_CATEGORIES, TAXONOMY_ERROR_CODES, THRESHOLDS } = require('./taxonomy');
const { SEVERITY_LEVELS, determineSeverity, calculateGateOutcome } = require('./severity');
const { classifyRootCause } = require('./root_cause');
const {
  generateSpatialRemediation,
  generateContrastRemediation,
  generateTouchTargetRemediation,
  generateEpdRemovalRemediation,
  generateGenericRemediation
} = require('./remediation');

const ROOT_CAUSE_TO_CATEGORY = Object.freeze({
  FORBIDDEN_EPD_WORKAROUND: DEFECT_CATEGORIES.EPD_FLASH_DETECTED,
  ELEMENT_NOT_RENDERED: DEFECT_CATEGORIES.MISSING_ELEMENT,
  ASSET_RESOURCE_MISSING: DEFECT_CATEGORIES.ASSET_MISSING,
  VIEWMODEL_CALLBACK_DETACHMENT: DEFECT_CATEGORIES.INVARIANT_BROKEN,
  VIEWMODEL_EVENT_NOT_BOUND: DEFECT_CATEGORIES.INVARIANT_BROKEN,
  THEME_TOKEN_MISREFERENCE: DEFECT_CATEGORIES.CONTRAST_FAILURE,
  CONTRAST_DEFICIT: DEFECT_CATEGORIES.CONTRAST_FAILURE,
  COLOR_COLLAPSE: DEFECT_CATEGORIES.COLOR_COLLAPSE,
  TOUCH_TARGET_INFLATION_OR_DEFLATION: DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL,
  FONT_METRICS_LEADING_MISMATCH: DEFECT_CATEGORIES.MARGIN_SHIFT,
  INCORRECT_MODIFIER_CHAIN_ORDER: DEFECT_CATEGORIES.MARGIN_SHIFT,
  PARENT_INSET_ACCUMULATION: DEFECT_CATEGORIES.MARGIN_SHIFT,
  HARD_MARGIN_SHIFT_VETO: DEFECT_CATEGORIES.MARGIN_SHIFT,
  CUMULATIVE_SPACER_DRIFT: DEFECT_CATEGORIES.MARGIN_SHIFT,
  GENERIC_LAYOUT_DRIFT: DEFECT_CATEGORIES.MARGIN_SHIFT,
  CONTRACT_EVIDENCE_MISSING: DEFECT_CATEGORIES.EVIDENCE_MISSING,
  PREVIEW_RENDER_MISSING: DEFECT_CATEGORIES.EVIDENCE_MISSING
});

/**
 * Resolves target composable and file from correspondence map.
 * @param {string} sourceId
 * @param {object} correspondenceMap
 * @returns {object} { file, composable, line, astNodeType, testTag }
 */
function resolveTarget(sourceId, correspondenceMap = null) {
  if (correspondenceMap && Array.isArray(correspondenceMap.mappings)) {
    const mapping = correspondenceMap.mappings.find(
      m => m.designSourceId === sourceId || m.sourceId === sourceId
    );
    if (mapping && mapping.existingTarget) {
      return {
        file: mapping.existingTarget.file || mapping.existingTarget.targetFile || null,
        composable: mapping.existingTarget.composableSymbol || mapping.existingTarget.composable || null,
        line: mapping.existingTarget.lineNumber || mapping.existingTarget.line || null,
        astNodeType: mapping.existingTarget.astNodeType || null,
        testTag: mapping.existingTarget.testTag || null
      };
    }
  }

  return {
    file: null,
    composable: null,
    line: null,
    astNodeType: null,
    testTag: null
  };
}

/**
 * Diagnoses failures from a verification result or failure list into a DefectReport.
 * @param {object} verificationResult
 * @param {object} options
 * @returns {object} DefectReport
 */
function diagnoseDefects(verificationResult = {}, options = {}) {
  const blockers = Array.isArray(verificationResult.blockers)
    ? [...verificationResult.blockers]
    : [];

  const screenId = verificationResult.screenId || options.screenId || 'screen_unknown';
  const correspondenceMap = verificationResult.correspondenceMap || options.correspondenceMap || null;

  // 1. Consume structured defects or failed/blocked stages first
  let candidateFailures = [];
  if (Array.isArray(verificationResult.defects) && verificationResult.defects.length > 0) {
    candidateFailures = verificationResult.defects.map(d => {
      const copy = { ...d };
      if (Array.isArray(verificationResult.stages)) {
        const matchingStage = verificationResult.stages.find(
          s => s.stage === copy.stage || (copy.stage && s.alias === copy.stage)
        );
        if (matchingStage) {
          copy.errorCode = copy.errorCode || matchingStage.errorCode;
          copy.status = copy.status || matchingStage.status;
          copy.message = copy.message || copy.error || matchingStage.error;
          copy.error = copy.error || copy.message || matchingStage.error;
          copy.category = copy.category || (matchingStage.errorCode ? TAXONOMY_ERROR_CODES[matchingStage.errorCode] : null);
          copy.contrastRatio = copy.contrastRatio ?? matchingStage.evidence?.contrastRatio ?? matchingStage.evidence?.minContrastRatio ?? matchingStage.evidence?.ratio ?? matchingStage.evidence?.contrastFailures?.[0]?.ratio;
          copy.role = copy.role || matchingStage.evidence?.contrastFailures?.[0]?.role || copy.evidence?.contrastFailures?.[0]?.role || null;
          copy.isLargeText = copy.isLargeText ?? matchingStage.evidence?.contrastFailures?.[0]?.isLargeText ?? copy.evidence?.contrastFailures?.[0]?.isLargeText ?? null;
          copy.missingAsset = copy.missingAsset || matchingStage.evidence?.missingFont || matchingStage.evidence?.missingAsset || matchingStage.evidence?.missingAssets?.[0];
          copy.missingNodes = copy.missingNodes || matchingStage.evidence?.missingNodes;
          copy.hasEpdHook = copy.hasEpdHook !== undefined ? copy.hasEpdHook : Boolean(matchingStage.evidence?.matchedPattern || (matchingStage.evidence?.settleMs !== undefined && matchingStage.evidence?.settleMs >= 500) || matchingStage.errorCode === 'EPD_WORKAROUND_VIOLATION');
          copy.matchedPattern = copy.matchedPattern || matchingStage.evidence?.matchedPattern;
          copy.settleMs = copy.settleMs !== undefined ? copy.settleMs : matchingStage.evidence?.settleMs;
          copy.deltaPx = copy.deltaPx || matchingStage.evidence?.deltaPx || (matchingStage.evidence?.maxSpatialShiftPx !== undefined ? { distance: matchingStage.evidence.maxSpatialShiftPx, dx: 0, dy: matchingStage.evidence.maxSpatialShiftPx } : null);
        }
      }
      return copy;
    });
  } else if (Array.isArray(verificationResult.stages) && verificationResult.stages.some(s => s.status === 'FAIL' || s.status === 'BLOCKED' || s.success === false)) {
    for (const s of verificationResult.stages) {
      if (s.status === 'FAIL' || s.status === 'BLOCKED' || s.success === false) {
        candidateFailures.push({
          sourceId: s.evidence?.worstDriftElement?.sourceId || s.evidence?.worstDriftElement?.id || s.evidence?.contrastFailures?.[0]?.sourceId || s.evidence?.missingNodes?.[0] || s.evidence?.missingAssets?.[0] || s.evidence?.missingFont || s.evidence?.element?.sourceId || s.evidence?.element?.id || 'general_stage_failure',
          stage: s.stage,
          status: s.status,
          errorCode: s.errorCode,
          category: s.errorCode ? TAXONOMY_ERROR_CODES[s.errorCode] : (s.status === 'BLOCKED' ? DEFECT_CATEGORIES.EVIDENCE_MISSING : DEFECT_CATEGORIES.MARGIN_SHIFT),
          deltaPx: s.evidence?.deltaPx || (s.evidence?.maxSpatialShiftPx !== undefined ? { distance: s.evidence.maxSpatialShiftPx, dx: 0, dy: s.evidence.maxSpatialShiftPx } : null),
          contrastRatio: s.evidence?.contrastRatio ?? s.evidence?.minContrastRatio ?? s.evidence?.ratio ?? s.evidence?.contrastFailures?.[0]?.ratio,
          role: s.evidence?.contrastFailures?.[0]?.role || s.evidence?.element?.role || null,
          isLargeText: s.evidence?.contrastFailures?.[0]?.isLargeText ?? s.evidence?.isLargeText ?? null,
          missingAsset: s.evidence?.missingFont || s.evidence?.missingAsset || s.evidence?.missingAssets?.[0],
          missingNodes: s.evidence?.missingNodes,
          hasEpdHook: Boolean(s.evidence?.matchedPattern || (s.evidence?.settleMs !== undefined && s.evidence?.settleMs >= 500) || s.errorCode === 'EPD_WORKAROUND_VIOLATION'),
          matchedPattern: s.evidence?.matchedPattern,
          settleMs: s.evidence?.settleMs,
          message: s.error,
          error: s.error,
          evidence: s.evidence
        });
      }
    }
  } else if (Array.isArray(verificationResult.failures) && verificationResult.failures.length > 0) {
    candidateFailures = verificationResult.failures;
  }

  // Handle zero failures
  if (candidateFailures.length === 0) {
    const outcome = (verificationResult.outcome === 'BLOCKED' || blockers.length > 0) ? 'BLOCKED' : (verificationResult.outcome === 'FAIL' ? 'FAIL' : 'PASS');
    return {
      version: '2.0.0',
      screenId,
      generatedAt: new Date().toISOString(),
      gateOutcome: outcome,
      summary: {
        totalDefects: 0,
        bySeverity: { critical: 0, major: 0, minor: 0 },
        byCategory: {},
        byRootCause: {}
      },
      defects: [],
      blockers,
      provenance: {
        verificationRunId: verificationResult.runId || options.runId || null,
        deviceProfile: 'daylight-dc1'
      }
    };
  }

  // Pre-analyze numeric shifts strictly for elements with spatial displacement
  const numericShifts = [];
  for (const f of candidateFailures) {
    if (typeof f === 'object' && f !== null) {
      const shift = f.deltaPx?.distance ?? f.deltaPx?.dy ?? f.dy ?? f.drift ?? (
        f.deltaPx ? Math.hypot(f.deltaPx.dx || 0, f.deltaPx.dy || 0) : null
      );
      if (typeof shift === 'number' && Number.isFinite(shift) && shift > 0) {
        numericShifts.push(shift);
      }
    }
  }

  const siblingShiftMean = numericShifts.length > 0
    ? numericShifts.reduce((a, b) => a + b, 0) / numericShifts.length
    : 0;
  const siblingShiftVariance = numericShifts.length > 0
    ? numericShifts.reduce((sum, s) => sum + Math.pow(s - siblingShiftMean, 2), 0) / numericShifts.length
    : 0;
  const isCorrelatedSiblingShift = numericShifts.length >= 2 && siblingShiftVariance <= 1.0;

  const defects = [];
  const bySeverity = { critical: 0, major: 0, minor: 0 };
  const byCategory = {};
  const byRootCause = {};

  for (let i = 0; i < candidateFailures.length; i++) {
    const f = candidateFailures[i];
    const failureObj = typeof f === 'string' ? { message: f } : { ...f };

    let sourceId = failureObj.sourceId || failureObj.elementId || failureObj.id;
    if (!sourceId && Array.isArray(failureObj.missingNodes) && failureObj.missingNodes.length > 0) {
      sourceId = failureObj.missingNodes[0];
    }
    if (!sourceId && failureObj.missingAsset) {
      sourceId = failureObj.missingAsset;
    }

    const msg = failureObj.message || failureObj.error || failureObj.remediationAction;
    if (!sourceId && typeof msg === 'string') {
      const match = msg.match(/for\s+"([^"]+)"/) ||
        msg.match(/for\s+'([^']+)'/) ||
        msg.match(/node\s+"([^"]+)"/) ||
        msg.match(/element\s+"([^"]+)"/) ||
        msg.match(/elements?\s+(?:missing from layout:\s*)?([^\s,:]+)/) ||
        msg.match(/resource is missing:\s*([^\s,:]+)/);
      if (match) {
        sourceId = match[1];
      }
    }

    if (!sourceId) {
      sourceId = `unknown_node_${i}`;
    }
    failureObj.sourceId = sourceId;

    const errCode = failureObj.errorCode || failureObj.code || (TAXONOMY_ERROR_CODES[failureObj.rootCause] ? failureObj.rootCause : null);
    if (errCode) {
      failureObj.errorCode = errCode;
    }

    if (!failureObj.deltaPx && typeof msg === 'string') {
      const driftMatch = msg.match(/Spatial drift of (\d+(\.\d+)?)px/);
      if (driftMatch) {
        const d = parseFloat(driftMatch[1]);
        failureObj.deltaPx = { distance: d, dx: 0, dy: d };
      }
    }

    const target = resolveTarget(sourceId, correspondenceMap);

    // Determine category with error code precedence and raw signal waterfall
    let category = null;

    // 1. Explicit specific category (if not default MARGIN_SHIFT)
    if (failureObj.category && DEFECT_CATEGORIES[failureObj.category] && failureObj.category !== DEFECT_CATEGORIES.MARGIN_SHIFT) {
      category = DEFECT_CATEGORIES[failureObj.category];
    } else if (failureObj.category && TAXONOMY_ERROR_CODES[failureObj.category]) {
      category = TAXONOMY_ERROR_CODES[failureObj.category];
    }

    // 2. Specific taxonomy error code checks
    if (!category) {
      const code = failureObj.errorCode || failureObj.code || failureObj.rootCause;
      if (code && TAXONOMY_ERROR_CODES[code]) {
        category = TAXONOMY_ERROR_CODES[code];
      } else if (code && DEFECT_CATEGORIES[code]) {
        category = DEFECT_CATEGORIES[code];
      } else if (code && ROOT_CAUSE_TO_CATEGORY[code]) {
        category = ROOT_CAUSE_TO_CATEGORY[code];
      }
    }

    // 3. Raw Signal Mapping Waterfall
    if (!category || category === DEFECT_CATEGORIES.MARGIN_SHIFT) {
      // 3.1 EPD Flash / Artificial Modal Dismiss Pause (>=500ms) (Zero tolerance)
      if (
        (failureObj.settleMs !== undefined && failureObj.settleMs >= 500) ||
        failureObj.hasEpdHook ||
        failureObj.matchedPattern ||
        (typeof msg === 'string' && (msg.includes('EPD') || msg.includes('ACTION_REFRESH_SCREEN') || msg.includes('artificial pause')))
      ) {
        category = DEFECT_CATEGORIES.EPD_FLASH_DETECTED;
      }
      // 3.2 Touch Target Too Small (< 48dp or < 96px)
      else if (
        (failureObj.touchWidthDp !== undefined && failureObj.touchWidthDp < 48) ||
        (failureObj.touchHeightDp !== undefined && failureObj.touchHeightDp < 48) ||
        (failureObj.touchWidthPx !== undefined && failureObj.touchWidthPx < 96) ||
        (failureObj.touchHeightPx !== undefined && failureObj.touchHeightPx < 96) ||
        (typeof msg === 'string' && (msg.includes('TOUCH_TARGET') || msg.includes('48dp') || msg.includes('touch target')))
      ) {
        category = DEFECT_CATEGORIES.TOUCH_TARGET_TOO_SMALL;
      }
      // 3.3 Behavioral Invariant Broken / Callback Detachment / Persistence Missing
      else if (
        failureObj.callbackDetached === true ||
        failureObj.persistenceMissing === true ||
        failureObj.isInvariantBroken === true ||
        (typeof msg === 'string' && (msg.includes('invariant') || msg.includes('persistence') || msg.includes('callback') || msg.includes('autosave')))
      ) {
        category = DEFECT_CATEGORIES.INVARIANT_BROKEN;
      }
      // 3.4 Missing Element
      else if (
        (Array.isArray(failureObj.missingNodes) && failureObj.missingNodes.length > 0) ||
        failureObj.errorCode === 'ELEMENT_NOT_RENDERED' ||
        (typeof msg === 'string' && (msg.includes('missing element') || msg.includes('missing from layout') || msg.includes('ELEMENT_NOT_RENDERED')))
      ) {
        category = DEFECT_CATEGORIES.MISSING_ELEMENT;
      }
      // 3.5 Missing Asset / Font Resource
      else if (
        failureObj.missingAsset ||
        failureObj.missingFont ||
        failureObj.errorCode === 'FONT_RESOURCE_MISSING' ||
        (typeof msg === 'string' && (msg.includes('font') || msg.includes('asset')))
      ) {
        category = DEFECT_CATEGORIES.ASSET_MISSING;
      }
      // 3.6 Color Collapse
      else if (
        failureObj.isColorCollapse === true ||
        (typeof msg === 'string' && (msg.includes('hairline border') || msg.includes('COLOR_COLLAPSE')))
      ) {
        category = DEFECT_CATEGORIES.COLOR_COLLAPSE;
      }
      // 3.7 Contrast Failure
      else if (
        failureObj.contrastRatio !== undefined ||
        (typeof msg === 'string' && (msg.includes('contrast') || msg.includes('Contrast') || msg.includes('WCAG')))
      ) {
        category = DEFECT_CATEGORIES.CONTRAST_FAILURE;
      }
      // 3.8 Missing Evidence / Blocked Stage
      else if (
        failureObj.status === 'BLOCKED' ||
        failureObj.errorCode === 'PREVIEW_RENDER_MISSING' ||
        failureObj.errorCode === 'CONTRACT_EVIDENCE_MISSING' ||
        failureObj.previewMissing === true ||
        failureObj.contractMissing === true ||
        (typeof msg === 'string' && (msg.includes('evidence') || msg.includes('CONTRACT_EVIDENCE_MISSING') || msg.includes('PREVIEW_RENDER_MISSING')))
      ) {
        category = DEFECT_CATEGORIES.EVIDENCE_MISSING;
      }
      // 3.9 Spatial Drift / Margin Shift
      else if (
        failureObj.deltaPx ||
        failureObj.drift !== undefined ||
        failureObj.distance !== undefined ||
        failureObj.dy !== undefined ||
        failureObj.dx !== undefined ||
        failureObj.category === DEFECT_CATEGORIES.MARGIN_SHIFT
      ) {
        category = DEFECT_CATEGORIES.MARGIN_SHIFT;
      }
      else {
        category = DEFECT_CATEGORIES.MARGIN_SHIFT;
      }
    }

    // Determine severity
    const severity = determineSeverity(category, failureObj);

    // Only associate sibling shifts if element strictly has non-zero spatial drift (STRICT CROSS-CONTAMINATION GUARD)
    const hasSpatialDrift = (category === DEFECT_CATEGORIES.MARGIN_SHIFT) && Boolean(
      (failureObj.deltaPx && (
        (typeof failureObj.deltaPx.distance === 'number' && failureObj.deltaPx.distance > 0) ||
        Math.abs(failureObj.deltaPx.dx || 0) > 0 ||
        Math.abs(failureObj.deltaPx.dy || 0) > 0
      )) ||
      (typeof failureObj.drift === 'number' && failureObj.drift > 0) ||
      (typeof failureObj.distance === 'number' && failureObj.distance > 0) ||
      (typeof failureObj.dy === 'number' && failureObj.dy !== 0) ||
      (typeof failureObj.dx === 'number' && failureObj.dx !== 0)
    );

    const rootCauseContext = {
      sourceId,
      category,
      composable: target.composable,
      targetFile: target.file,
      dx: failureObj.deltaPx?.dx ?? failureObj.dx,
      dy: failureObj.deltaPx?.dy ?? failureObj.dy,
      drift: failureObj.deltaPx?.distance ?? failureObj.drift ?? failureObj.distance,
      contrastRatio: failureObj.contrastRatio,
      role: failureObj.role || failureObj.evidence?.contrastFailures?.[0]?.role || null,
      isLargeText: failureObj.isLargeText ?? failureObj.evidence?.contrastFailures?.[0]?.isLargeText ?? null,
      isContrastDeficit: Boolean(failureObj.isContrastDeficit || failureObj.role === 'caption' || failureObj.evidence?.contrastFailures?.[0]?.role === 'caption'),
      actualToken: failureObj.actualToken,
      expectedToken: failureObj.expectedToken,
      touchWidthDp: failureObj.touchWidthDp,
      touchHeightDp: failureObj.touchHeightDp,
      matchedPattern: failureObj.matchedPattern,
      hasEpdHook: Boolean(failureObj.hasEpdHook || (failureObj.settleMs !== undefined && failureObj.settleMs >= 500)),
      settleMs: failureObj.settleMs,
      missingAsset: failureObj.missingAsset || failureObj.missingFont,
      missingNodes: failureObj.missingNodes,
      callbackDetached: Boolean(failureObj.callbackDetached),
      persistenceMissing: Boolean(failureObj.persistenceMissing),
      isInvariantBroken: Boolean(failureObj.isInvariantBroken),
      isColorCollapse: Boolean(failureObj.isColorCollapse),
      errorCode: failureObj.errorCode || failureObj.code || (TAXONOMY_ERROR_CODES[failureObj.rootCause] ? failureObj.rootCause : null),
      rootCause: failureObj.rootCause,
      status: failureObj.status,
      baselineDelta: failureObj.baselineDelta,
      modifierChainIssue: Boolean(failureObj.modifierChainIssue),
      parentSymbol: failureObj.parentSymbol,
      remediationAction: failureObj.remediationAction,
      siblingShifts: hasSpatialDrift
        ? (isCorrelatedSiblingShift ? numericShifts : (failureObj.siblingShifts || (numericShifts.length > 0 ? numericShifts : [])))
        : []
    };

    const diagnosisResult = classifyRootCause(rootCauseContext);

    const deltaPxObj = failureObj.deltaPx
      ? {
          dx: failureObj.deltaPx.dx || 0,
          dy: failureObj.deltaPx.dy || 0,
          distance: failureObj.deltaPx.distance !== undefined
            ? failureObj.deltaPx.distance
            : Math.hypot(failureObj.deltaPx.dx || 0, failureObj.deltaPx.dy || 0)
        }
      : null;

    const defectRecord = {
      defectId: `DEF-${String(i + 1).padStart(3, '0')}`,
      category,
      severity,
      sourceId,
      target,
      diagnosis: {
        rootCause: diagnosisResult.rootCause,
        confidence: diagnosisResult.confidence,
        explanation: diagnosisResult.explanation,
        observedDelta: {
          dx: deltaPxObj?.dx,
          dy: deltaPxObj?.dy,
          drift: deltaPxObj?.distance,
          contrastRatio: failureObj.contrastRatio,
          touchWidthDp: failureObj.touchWidthDp,
          touchHeightDp: failureObj.touchHeightDp,
          settleMs: failureObj.settleMs
        },
        expected: failureObj.expected || null,
        actual: failureObj.actual || null
      },
      remediation: diagnosisResult.remediation || {
        action: diagnosisResult.remediationAction,
        patchType: 'MODIFIER_REPLACEMENT',
        targetFile: target.file,
        targetLineRange: null,
        suggestedReplacement: null,
        diff: null
      }
    };

    defects.push(defectRecord);

    if (severity === SEVERITY_LEVELS.CRITICAL) bySeverity.critical++;
    else if (severity === SEVERITY_LEVELS.MAJOR) bySeverity.major++;
    else bySeverity.minor++;

    byCategory[category] = (byCategory[category] || 0) + 1;
    byRootCause[diagnosisResult.rootCause] = (byRootCause[diagnosisResult.rootCause] || 0) + 1;
  }

  const gateOutcome = calculateGateOutcome(defects, blockers, verificationResult.outcome);

  return {
    version: '2.0.0',
    screenId,
    generatedAt: new Date().toISOString(),
    gateOutcome,
    summary: {
      totalDefects: defects.length,
      bySeverity,
      byCategory,
      byRootCause
    },
    defects,
    blockers,
    provenance: {
      verificationRunId: verificationResult.runId || options.runId || null,
      deviceProfile: 'daylight-dc1'
    }
  };
}

module.exports = {
  diagnoseDefects,
  classifyRootCause,
  resolveTarget
};
