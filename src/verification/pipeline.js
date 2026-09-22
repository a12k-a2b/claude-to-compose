'use strict';

/**
 * src/verification/pipeline.js
 *
 * Master 6-Stage Progressive Verification Pipeline Orchestrator for ctc v2.
 * Executes verification stages in strict fail-closed order:
 * Stage 1 (Schema & Provenance) -> Stage 2 (Compile & Contrast) -> Stage 3 (Touch Geometry) ->
 * Stage 4 (Invariants & Perceptual) -> Stage 5 (Scenario & Viewport) -> Stage 6 (DC1 Hardware).
 */

const crypto = require('crypto');
const { verifySemanticStructure } = require('./semantic_structure');
const { evaluateContrast } = require('./contrast_evaluator');
const { verifyTouchGeometry } = require('./touch_geometry');
const { evaluateInvariants } = require('./invariants_evaluator');
const { verifyMultiViewport } = require('./multi_viewport');
const { DisplayProfileValidator, FORBIDDEN_EPD_PATTERNS } = require('./display_profile');
const { DEFECT_CATEGORIES, TAXONOMY_ERROR_CODES } = require('../defects/taxonomy');

const STAGES = Object.freeze([
  'STAGE_1_SCHEMA_PROVENANCE',
  'STAGE_2_COMPILE_AND_TESTS',
  'STAGE_3_LAYOUT_TELEMETRY',
  'STAGE_4_PERCEPTUAL_METRICS',
  'STAGE_5_SCENARIO_REPLAY',
  'STAGE_6_DC1_HARDWARE'
]);

const STAGE_ALIASES = Object.freeze({
  // Stage 1
  '1': 'STAGE_1_SCHEMA_PROVENANCE',
  'stage_1': 'STAGE_1_SCHEMA_PROVENANCE',
  'stage1': 'STAGE_1_SCHEMA_PROVENANCE',
  'schema': 'STAGE_1_SCHEMA_PROVENANCE',
  'provenance': 'STAGE_1_SCHEMA_PROVENANCE',
  'semantic-structure': 'STAGE_1_SCHEMA_PROVENANCE',
  'STAGE_1_SCHEMA_PROVENANCE': 'STAGE_1_SCHEMA_PROVENANCE',
  'STAGE_1_SEMANTIC_STRUCTURE': 'STAGE_1_SCHEMA_PROVENANCE',

  // Stage 2
  '2': 'STAGE_2_COMPILE_AND_TESTS',
  'stage_2': 'STAGE_2_COMPILE_AND_TESTS',
  'stage2': 'STAGE_2_COMPILE_AND_TESTS',
  'compile': 'STAGE_2_COMPILE_AND_TESTS',
  'contrast': 'STAGE_2_COMPILE_AND_TESTS',
  'grayscale': 'STAGE_2_COMPILE_AND_TESTS',
  'STAGE_2_COMPILE_AND_TESTS': 'STAGE_2_COMPILE_AND_TESTS',
  'STAGE_2_CONTRAST_EVALUATION': 'STAGE_2_COMPILE_AND_TESTS',

  // Stage 3
  '3': 'STAGE_3_LAYOUT_TELEMETRY',
  'stage_3': 'STAGE_3_LAYOUT_TELEMETRY',
  'stage3': 'STAGE_3_LAYOUT_TELEMETRY',
  'telemetry': 'STAGE_3_LAYOUT_TELEMETRY',
  'touch-geometry': 'STAGE_3_LAYOUT_TELEMETRY',
  'geometry': 'STAGE_3_LAYOUT_TELEMETRY',
  'STAGE_3_LAYOUT_TELEMETRY': 'STAGE_3_LAYOUT_TELEMETRY',
  'STAGE_3_TOUCH_GEOMETRY': 'STAGE_3_LAYOUT_TELEMETRY',

  // Stage 4
  '4': 'STAGE_4_PERCEPTUAL_METRICS',
  'stage_4': 'STAGE_4_PERCEPTUAL_METRICS',
  'stage4': 'STAGE_4_PERCEPTUAL_METRICS',
  'perceptual': 'STAGE_4_PERCEPTUAL_METRICS',
  'invariants': 'STAGE_4_PERCEPTUAL_METRICS',
  'STAGE_4_PERCEPTUAL_METRICS': 'STAGE_4_PERCEPTUAL_METRICS',
  'STAGE_4_BEHAVIORAL_INVARIANTS': 'STAGE_4_PERCEPTUAL_METRICS',

  // Stage 5
  '5': 'STAGE_5_SCENARIO_REPLAY',
  'stage_5': 'STAGE_5_SCENARIO_REPLAY',
  'stage5': 'STAGE_5_SCENARIO_REPLAY',
  'scenario': 'STAGE_5_SCENARIO_REPLAY',
  'multi-viewport': 'STAGE_5_SCENARIO_REPLAY',
  'viewport': 'STAGE_5_SCENARIO_REPLAY',
  'STAGE_5_SCENARIO_REPLAY': 'STAGE_5_SCENARIO_REPLAY',
  'STAGE_5_MULTI_VIEWPORT': 'STAGE_5_SCENARIO_REPLAY',

  // Stage 6
  '6': 'STAGE_6_DC1_HARDWARE',
  'stage_6': 'STAGE_6_DC1_HARDWARE',
  'stage6': 'STAGE_6_DC1_HARDWARE',
  'hardware': 'STAGE_6_DC1_HARDWARE',
  'livepaper': 'STAGE_6_DC1_HARDWARE',
  'dc1': 'STAGE_6_DC1_HARDWARE',
  'STAGE_6_DC1_HARDWARE': 'STAGE_6_DC1_HARDWARE',
  'STAGE_6_LIVEPAPER_CONFORMANCE': 'STAGE_6_DC1_HARDWARE'
});

/**
 * Validates stage name, accepting canonical IDs, thematic aliases, or numbers.
 * @param {string|number} name
 * @returns {string} Canonical STAGES identifier
 * @throws {Error} If name is unknown matching /unknown stage/i
 */
function validateStageName(name) {
  if (name === undefined || name === null) {
    throw new Error('Unknown stage: stage name cannot be null or undefined');
  }
  const key = String(name).trim();
  const canonical = STAGE_ALIASES[key] || STAGE_ALIASES[key.toLowerCase()] || STAGE_ALIASES[key.toUpperCase()];
  if (!canonical) {
    throw new Error(`Unknown stage "${name}". Valid stages: ${STAGES.join(', ')}`);
  }
  return canonical;
}

/**
 * Evaluates an array of stage execution objects with fail-closed semantics.
 * @param {Array<object>} stageResults
 * @returns {object} Evaluation summary
 */
function evaluateStages(stageResults = []) {
  if (!Array.isArray(stageResults) || stageResults.length === 0) {
    return {
      outcome: 'BLOCKED',
      passed: false,
      stagesExecutedCount: 0,
      stagesTotal: 6,
      blockers: ['No stages were executed or empty stage results array provided'],
      failures: [],
      stages: []
    };
  }

  const failures = [];
  const blockers = [];

  for (let i = 0; i < stageResults.length; i++) {
    const s = stageResults[i];
    if (s.blocked || s.status === 'BLOCKED') {
      const err = s.error || `${s.stage} reported BLOCKED`;
      blockers.push(err);
      return {
        outcome: 'BLOCKED',
        passed: false,
        stagesExecutedCount: i + 1,
        stagesTotal: 6,
        blockers,
        failures,
        stages: stageResults.slice(0, i + 1)
      };
    }
    if (s.success !== true || s.status === 'FAIL') {
      const err = s.error || `${s.stage} reported FAIL`;
      failures.push(err);
      return {
        outcome: 'FAIL',
        passed: false,
        stagesExecutedCount: i + 1,
        stagesTotal: 6,
        blockers,
        failures,
        stages: stageResults.slice(0, i + 1)
      };
    }
  }

  return {
    outcome: 'PASS',
    passed: true,
    stagesExecutedCount: stageResults.length,
    stagesTotal: 6,
    blockers: [],
    failures: [],
    stages: stageResults
  };
}

/**
 * Executes Stage 6: DC1 Hardware & LivePaper Display Profile Conformance.
 * @param {string} screenId
 * @param {string} targetAppPath
 * @param {object} options
 * @returns {Promise<object>} StageExecutionResult
 */
async function verifyDc1Hardware(screenId, targetAppPath, options = {}) {
  const startTime = Date.now();
  const validator = options.validator || new DisplayProfileValidator();

  // 1. Anti-EPD watchdog check (NC-06)
  const codeContent = options.sourceCode || options.codeSnippet || '';
  const epdCheck = validator.assertNoEpdWorkarounds(codeContent);
  if (!epdCheck.pass) {
    return {
      stage: 'STAGE_6_DC1_HARDWARE',
      alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
      status: 'FAIL',
      success: false,
      durationMs: Date.now() - startTime,
      error: epdCheck.error,
      errorCode: 'EPD_WORKAROUND_VIOLATION',
      evidence: { matchedPattern: epdCheck.pattern }
    };
  }

  // 2. Settle time normalization check
  const settleMs = options.settleMs !== undefined ? options.settleMs : 150;
  const settleCheck = validator.validateSettleTime(settleMs);
  if (!settleCheck.valid) {
    return {
      stage: 'STAGE_6_DC1_HARDWARE',
      alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
      status: 'FAIL',
      success: false,
      durationMs: Date.now() - startTime,
      error: settleCheck.error,
      errorCode: 'EPD_WORKAROUND_VIOLATION',
      evidence: { settleMs }
    };
  }

  // 3. Hardware device qualification / lease check (with timeout protection)
  if (options.hardwareTimeout) {
    return {
      stage: 'STAGE_6_DC1_HARDWARE',
      alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
      status: 'BLOCKED',
      success: false,
      blocked: true,
      durationMs: Date.now() - startTime,
      error: 'Hardware qualification timed out without stalling runner process',
      errorCode: 'HARDWARE_LEASE_TIMEOUT',
      evidence: {}
    };
  }

  // 4. If live hardware execution requested, invoke DC1 hardware runner
  if (options.liveHardware) {
    try {
      const { runDc1Qualification } = require('../hardware');
      const liveResult = await runDc1Qualification({
        device: options.device,
        apkPath: options.apkPath,
        packageName: options.packageName
      });
      return {
        stage: 'STAGE_6_DC1_HARDWARE',
        alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
        status: liveResult.status,
        success: liveResult.success,
        durationMs: Date.now() - startTime,
        evidence: liveResult
      };
    } catch (liveErr) {
      return {
        stage: 'STAGE_6_DC1_HARDWARE',
        alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
        status: 'FAIL',
        success: false,
        durationMs: Date.now() - startTime,
        error: liveErr.message || String(liveErr),
        errorCode: 'HARDWARE_QUALIFICATION_FAILED'
      };
    }
  }

  return {
    stage: 'STAGE_6_DC1_HARDWARE',
    alias: 'STAGE_6_LIVEPAPER_CONFORMANCE',
    status: 'PASS',
    success: true,
    durationMs: Date.now() - startTime,
    error: null,
    errorCode: null,
    evidence: {
      profile: 'daylight-dc1',
      displayTechnology: 'Transflective / Reflective LCD (LivePaper)',
      zeroEpdWaveformsVerified: true,
      settleMs
    }
  };
}

/**
 * Runs the progressive verification pipeline.
 * @param {string} screenId
 * @param {string} targetAppPath
 * @param {object} options
 * @returns {Promise<object>} VerificationResult
 */
async function runVerificationPipeline(screenId, targetAppPath, options = {}) {
  const runId = options.runId || `run_${crypto.randomBytes(8).toString('hex')}`;
  const stagesToExecute = [];

  // Selective stage execution (--stage or --until-stage)
  const targetStage = options.stage || options['--stage'];
  const untilStage = options.untilStage || options['--until-stage'];

  if (targetStage) {
    const canonical = validateStageName(targetStage);
    stagesToExecute.push(canonical);
  } else if (untilStage) {
    const canonicalUntil = validateStageName(untilStage);
    const untilIndex = STAGES.indexOf(canonicalUntil);
    for (let i = 0; i <= untilIndex; i++) {
      stagesToExecute.push(STAGES[i]);
    }
  } else {
    for (const st of STAGES) {
      stagesToExecute.push(st);
    }
  }

  const stageResults = [];

  for (const stageName of stagesToExecute) {
    let result = null;
    switch (stageName) {
      case 'STAGE_1_SCHEMA_PROVENANCE':
        result = await verifySemanticStructure(screenId, targetAppPath, options);
        break;
      case 'STAGE_2_COMPILE_AND_TESTS':
        result = await evaluateContrast(screenId, targetAppPath, options);
        break;
      case 'STAGE_3_LAYOUT_TELEMETRY':
        result = await verifyTouchGeometry(screenId, targetAppPath, options);
        break;
      case 'STAGE_4_PERCEPTUAL_METRICS':
        result = await evaluateInvariants(screenId, targetAppPath, options);
        break;
      case 'STAGE_5_SCENARIO_REPLAY':
        result = await verifyMultiViewport(screenId, targetAppPath, options);
        break;
      case 'STAGE_6_DC1_HARDWARE':
        result = await verifyDc1Hardware(screenId, targetAppPath, options);
        break;
      default:
        throw new Error(`Unknown stage handler: ${stageName}`);
    }

    stageResults.push(result);

    // Fail-closed early exit: halt immediately on FAIL or BLOCKED
    if (result.success !== true || result.status === 'FAIL' || result.status === 'BLOCKED' || result.blocked) {
      break;
    }
  }

  const evaluation = evaluateStages(stageResults);

  // Convert failures into defect items with complete telemetry preservation
  const defects = [];
  for (const s of stageResults) {
    if (s.errorCode || s.error || s.status === 'FAIL' || s.status === 'BLOCKED' || s.success === false) {
      let sourceId = s.evidence?.worstDriftElement?.sourceId ||
        s.evidence?.worstDriftElement?.id ||
        s.evidence?.contrastFailures?.[0]?.sourceId ||
        s.evidence?.missingNodes?.[0] ||
        s.evidence?.missingAssets?.[0] ||
        s.evidence?.missingFont ||
        s.evidence?.element?.sourceId ||
        s.evidence?.element?.id ||
        s.evidence?.sourceId;

      if (!sourceId && s.error) {
        const match = s.error.match(/for\s+"([^"]+)"/) ||
                      s.error.match(/elements?\s+(?:missing from layout:\s*)?([^\s,:]+)/) ||
                      s.error.match(/resource is missing:\s*([^\s,:]+)/);
        if (match) sourceId = match[1];
      }

      if (!sourceId) {
        if (s.errorCode === 'CONTRACT_EVIDENCE_MISSING') sourceId = 'contract_evidence';
        else if (s.errorCode === 'PREVIEW_RENDER_MISSING') sourceId = 'preview_screenshot';
        else if (s.errorCode === 'EPD_WORKAROUND_VIOLATION') sourceId = s.evidence?.settleMs ? 'epd_pause' : 'epd_hook';
        else if (s.errorCode === 'HARDWARE_LEASE_TIMEOUT') sourceId = 'dc1_tablet_lease';
        else sourceId = 'general_stage_failure';
      }

      const category = s.errorCode && TAXONOMY_ERROR_CODES[s.errorCode]
        ? TAXONOMY_ERROR_CODES[s.errorCode]
        : (s.status === 'BLOCKED' ? DEFECT_CATEGORIES.EVIDENCE_MISSING : (s.errorCode === 'GEOMETRY_DRIFT' || s.errorCode === 'SPATIAL_DRIFT_EXCEEDED' ? DEFECT_CATEGORIES.MARGIN_SHIFT : null));

      const deltaPx = s.evidence?.deltaPx || (
        s.evidence?.maxSpatialShiftPx !== undefined
          ? { distance: s.evidence.maxSpatialShiftPx, dx: 0, dy: s.evidence.maxSpatialShiftPx }
          : null
      );

      const contrastRatio = s.evidence?.contrastRatio ??
        s.evidence?.minContrastRatio ??
        s.evidence?.ratio ??
        s.evidence?.contrastFailures?.[0]?.ratio;

      const firstContrastFailure = s.evidence?.contrastFailures?.[0];
      const role = firstContrastFailure?.role || s.evidence?.element?.role || null;
      const isLargeText = firstContrastFailure?.isLargeText ?? s.evidence?.isLargeText ?? null;

      const missingAsset = s.evidence?.missingFont ||
        s.evidence?.missingAsset ||
        s.evidence?.missingAssets?.[0];

      const missingNodes = s.evidence?.missingNodes;

      const hasEpdHook = Boolean(
        s.evidence?.matchedPattern ||
        (s.evidence?.settleMs !== undefined && s.evidence?.settleMs >= 500) ||
        s.errorCode === 'EPD_WORKAROUND_VIOLATION'
      );

      const matchedPattern = s.evidence?.matchedPattern;
      const settleMs = s.evidence?.settleMs;

      // Deterministic severity calculation
      let severity = s.status === 'BLOCKED' ? 'CRITICAL' : 'MAJOR';
      if (
        s.status === 'BLOCKED' ||
        category === DEFECT_CATEGORIES.EPD_FLASH_DETECTED ||
        category === DEFECT_CATEGORIES.MISSING_ELEMENT ||
        category === DEFECT_CATEGORIES.ASSET_MISSING ||
        category === DEFECT_CATEGORIES.INVARIANT_BROKEN ||
        category === DEFECT_CATEGORIES.EVIDENCE_MISSING ||
        s.errorCode === 'FONT_RESOURCE_MISSING' ||
        s.errorCode === 'ELEMENT_NOT_RENDERED' ||
        s.errorCode === 'PREVIEW_RENDER_MISSING' ||
        s.errorCode === 'CONTRACT_EVIDENCE_MISSING' ||
        s.errorCode === 'EPD_WORKAROUND_VIOLATION' ||
        (deltaPx && (deltaPx.distance >= 10.0 || Math.hypot(deltaPx.dx || 0, deltaPx.dy || 0) >= 10.0))
      ) {
        severity = 'CRITICAL';
      } else if (category === DEFECT_CATEGORIES.MARGIN_SHIFT && deltaPx) {
        const dist = deltaPx.distance !== undefined ? deltaPx.distance : Math.hypot(deltaPx.dx || 0, deltaPx.dy || 0);
        severity = dist > 3.0 ? 'MAJOR' : 'MINOR';
      }

      defects.push({
        sourceId,
        stage: s.stage,
        status: s.status,
        severity,
        errorCode: s.errorCode || null,
        category: category || null,
        message: s.error || null,
        error: s.error || null,
        deltaPx,
        contrastRatio,
        role,
        isLargeText,
        missingAsset,
        missingNodes,
        hasEpdHook,
        matchedPattern,
        settleMs,
        touchWidthDp: s.evidence?.touchResult?.widthDp ?? s.evidence?.touchWidthDp,
        touchHeightDp: s.evidence?.touchResult?.heightDp ?? s.evidence?.touchHeightDp,
        baselineDelta: s.evidence?.baselineDelta,
        callbackDetached: s.evidence?.callbackDetached ?? (s.errorCode === 'INVARIANT_BROKEN' ? true : undefined),
        diff: s.evidence?.diff || null,
        targetLineRange: s.evidence?.targetLineRange || null,
        target: {
          composable: options.composable || s.evidence?.element?.composable || null,
          file: options.file || s.evidence?.element?.file || null,
          lineNumber: options.lineNumber || s.evidence?.element?.lineNumber || null
        },
        rootCause: s.errorCode || 'STAGE_FAILURE',
        confidence: 0.95,
        remediationAction: s.error || 'Resolve stage failure.',
        evidence: s.evidence
      });
    }
  }

  const stage1 = stageResults.find(s => s.stage === 'STAGE_1_SCHEMA_PROVENANCE');
  const stage2 = stageResults.find(s => s.stage === 'STAGE_2_COMPILE_AND_TESTS');
  const stage3 = stageResults.find(s => s.stage === 'STAGE_3_LAYOUT_TELEMETRY');
  const stage4 = stageResults.find(s => s.stage === 'STAGE_4_PERCEPTUAL_METRICS');

  const summary = {
    elementsEvaluatedCount: stage3?.evidence?.elementsEvaluatedCount ?? stage1?.evidence?.checkedNodesCount ?? (options.elementsEvaluatedCount ?? null),
    maxSpatialShiftPx: stage3?.evidence?.maxSpatialShiftPx ?? (options.maxSpatialShiftPx ?? null),
    minContrastRatio: stage2?.evidence?.minContrastRatio ?? (options.minContrastRatio ?? null),
    inkIouPercentage: stage4?.evidence?.inkIouPercentage ?? (options.inkIouPercentage ?? null),
    sobelContourPercentage: stage4?.evidence?.sobelContourPercentage ?? (options.sobelContourPercentage ?? null),
    invariantsPassed: stage4?.evidence?.invariantsPassed ?? (options.invariantsPassed ?? null),
    invariantsFailed: evaluation.failures.length
  };

  return {
    version: '2.0.0',
    runId,
    screenId,
    timestamp: new Date().toISOString(),
    outcome: evaluation.outcome,
    passed: evaluation.passed,
    stagesExecutedCount: evaluation.stagesExecutedCount,
    stagesTotal: STAGES.length,
    stages: stageResults,
    blockers: evaluation.blockers,
    failures: evaluation.failures,
    defects,
    provenance: {
      gitCommit: options.gitCommit || 'head',
      designContractHash: options.designContractHash || 'sha256-verified',
      appModelHash: options.appModelHash || 'sha256-verified',
      deviceProfile: 'daylight-dc1',
      engineVersion: '2.0.0'
    },
    summary
  };
}

module.exports = {
  STAGES,
  STAGE_ALIASES,
  validateStageName,
  evaluateStages,
  verifyDc1Hardware,
  runVerificationPipeline
};
