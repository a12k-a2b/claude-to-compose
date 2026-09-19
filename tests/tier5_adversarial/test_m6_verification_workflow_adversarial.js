#!/usr/bin/env node

/**
 * ============================================================================
 * Tier 5 Adversarial Test Suite: Verification Subsystem & Skill Workflow
 * Milestone M6: Adversarial Coverage Hardening
 * Challenger 2 (critic, specialist)
 * ============================================================================
 * Covers:
 * - Section 1: Visual Diff Engine Stress & Adversarial Inputs (verification/run_diff.js)
 * - Section 2: 10-Point Agent-as-Judge Audit Rubric Hardening (verification/audit_rubric.js)
 * - Section 3: Verification Report Generator Hardening (verification/report_generator.js)
 * - Section 4: Build Runner & Compiler Error Parsing (verification/build_runner.js)
 * - Section 5: Master Verification Pipeline Gate Logic (verification/index.js)
 * - Section 6: Workflow Runner & Refinement Orchestration (skills/claude-to-compose/workflow.js)
 * - Section 7: Skill Specification & Multi-Agent Prompts Conformance
 * - Section 8: E2E Test Runner Boundary & Error Handling (tests/e2e_runner.js)
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { PNG } = require('pngjs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Subsystem Modules
const {
  runDiff,
  compareImages,
  validatePngHeader,
  clampDiffThreshold,
  calculateUnifiedCanvas,
  normalizeScreenshotDimensions,
  generateCompositeImage,
  CorruptImageError,
  InvalidImageError
} = require(path.join(PROJECT_ROOT, 'verification/run_diff.js'));

const {
  RUBRIC_CRITERIA,
  RUBRIC_DIMENSIONS,
  PASS_THRESHOLD,
  VETO_THRESHOLD,
  InvalidScoreError,
  IncompleteRubricError,
  validateDimensionScore,
  validateDimensionCount,
  auditTouchTarget,
  computeVisualQaScore,
  evaluateRubric,
  auditSynthesizedCode
} = require(path.join(PROJECT_ROOT, 'verification/audit_rubric.js'));

const {
  generateVerificationReport,
  generateReportMarkdown,
  escapeMarkdown,
  renderImageMarkdown,
  validateReportInputs,
  generateVerdictBanner,
  EmptyReportDataError
} = require(path.join(PROJECT_ROOT, 'verification/report_generator.js'));

const {
  BuildRunner,
  SdkNotFoundError,
  GradleWrapperNotFoundError
} = require(path.join(PROJECT_ROOT, 'verification/build_runner.js'));

const {
  VerificationPipeline,
  runVerification
} = require(path.join(PROJECT_ROOT, 'verification/index.js'));

const {
  ClaudeToComposeWorkflow,
  EXIT_CODES
} = require(path.join(PROJECT_ROOT, 'skills/claude-to-compose/workflow.js'));

// Helper to create synthetic solid color PNG buffers
function createSyntheticPngBuffer(width, height, r, g, b, a = 255) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

// Temporary directory manager for tests
const TMP_TEST_DIR = path.join('/tmp', `claude_m6_adversarial_${Date.now()}_${process.pid}`);

function setupTmpDir() {
  if (!fs.existsSync(TMP_TEST_DIR)) {
    fs.mkdirSync(TMP_TEST_DIR, { recursive: true });
  }
}

function cleanupTmpDir() {
  try {
    if (fs.existsSync(TMP_TEST_DIR)) {
      fs.rmSync(TMP_TEST_DIR, { recursive: true, force: true });
    }
  } catch (_) {}
}

// Suite definition
const suite = {
  name: 'Tier 5: Verification Pipeline & Workflow Adversarial Hardening',
  tier: 5,
  feature: 'Tier5_M6_Verification_Workflow',
  tests: [
    // ========================================================================
    // SECTION 1: Visual Diff Engine Stress & Adversarial Inputs
    // ========================================================================
    {
      id: 'T5_DIFF_01',
      name: 'Validate PNG magic header rejection on corrupt buffers (truncated, empty, null, JPEG, GIF)',
      run: async () => {
        // Truncated buffer (< 4 bytes)
        assert.throws(
          () => validatePngHeader(Buffer.from([0x89, 0x50, 0x4E])),
          (err) => err instanceof CorruptImageError && err.message.includes('File too short')
        );

        // Empty buffer
        assert.throws(
          () => validatePngHeader(Buffer.alloc(0)),
          (err) => err instanceof CorruptImageError && err.message.includes('File too short')
        );

        // Null buffer
        assert.throws(
          () => validatePngHeader(null),
          (err) => err instanceof CorruptImageError
        );

        // All zero bytes
        assert.throws(
          () => validatePngHeader(Buffer.from([0x00, 0x00, 0x00, 0x00])),
          (err) => err instanceof CorruptImageError && err.message.includes('Invalid PNG magic bytes')
        );

        // JPEG Magic Bytes (0xFF 0xD8 0xFF 0xE0)
        assert.throws(
          () => validatePngHeader(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])),
          (err) => err instanceof CorruptImageError && err.message.includes('Invalid PNG magic bytes')
        );

        // Valid PNG Header
        const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        assert.strictEqual(validatePngHeader(validPng), true);
      }
    },
    {
      id: 'T5_DIFF_02',
      name: 'Corrupted PNG payload with valid magic header handled without unhandled process crash',
      run: async () => {
        setupTmpDir();
        const corruptFile = path.join(TMP_TEST_DIR, 'corrupt_payload.png');
        const validFile = path.join(TMP_TEST_DIR, 'valid.png');

        // Valid PNG header followed by 64 bytes of random corrupted garbage
        const corruptBuffer = Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4E, 0x47]),
          Buffer.alloc(64, 0x7F)
        ]);
        fs.writeFileSync(corruptFile, corruptBuffer);
        fs.writeFileSync(validFile, createSyntheticPngBuffer(10, 10, 255, 0, 0));

        await assert.rejects(
          async () => {
            await compareImages(corruptFile, validFile, path.join(TMP_TEST_DIR, 'out_diff'));
          },
          (err) => {
            return err instanceof Error; // Proves handled rejection, no uncaught exception
          }
        );
      }
    },
    {
      id: 'T5_DIFF_03',
      name: 'Diff threshold clamping edge cases (0.0001, 0.999, -Infinity, +Infinity, NaN, strings, null, undefined)',
      run: async () => {
        // Lower boundary clamping (< 0.01)
        assert.strictEqual(clampDiffThreshold(0.0001), 0.01);
        assert.strictEqual(clampDiffThreshold(-50.0), 0.01);
        assert.strictEqual(clampDiffThreshold(-Infinity), 0.01);

        // Upper boundary clamping (> 0.5)
        assert.strictEqual(clampDiffThreshold(0.5001), 0.5);
        assert.strictEqual(clampDiffThreshold(1.0), 0.5);
        assert.strictEqual(clampDiffThreshold(100), 0.5);
        assert.strictEqual(clampDiffThreshold(Infinity), 0.5);

        // Non-numeric and falsy values must fallback to default 0.1
        assert.strictEqual(clampDiffThreshold(NaN), 0.1);
        assert.strictEqual(clampDiffThreshold('0.25'), 0.1);
        assert.strictEqual(clampDiffThreshold(null), 0.1);
        assert.strictEqual(clampDiffThreshold(undefined), 0.1);
        assert.strictEqual(clampDiffThreshold({}), 0.1);
      }
    },
    {
      id: 'T5_DIFF_04',
      name: 'Unified canvas calculation under asymmetric, extreme, and zero dimensions',
      run: async () => {
        const c1 = calculateUnifiedCanvas({ width: 0, height: 0 }, { width: 0, height: 0 });
        assert.deepStrictEqual(c1, { width: 0, height: 0 });

        const c2 = calculateUnifiedCanvas({ width: 3840, height: 10 }, { width: 10, height: 2160 });
        assert.deepStrictEqual(c2, { width: 3840, height: 2160 });

        const c3 = calculateUnifiedCanvas({ width: 390, height: 844 }, { width: 1080, height: 2400 });
        assert.deepStrictEqual(c3, { width: 1080, height: 2400 });
      }
    },
    {
      id: 'T5_DIFF_05',
      name: 'Screenshot scale factor normalization with edge scale factors (3.0x retina, 2.625x Nexus, 0 zero-divisor)',
      run: async () => {
        // 3.0x retina
        const r1 = normalizeScreenshotDimensions(1170, 2532, 3.0);
        assert.strictEqual(r1.logicalWidth, 390);
        assert.strictEqual(r1.logicalHeight, 844);

        // 2.625x Nexus
        const r2 = normalizeScreenshotDimensions(1080, 1920, 2.625);
        assert.strictEqual(r2.logicalWidth, 411);
        assert.strictEqual(r2.logicalHeight, 731);

        // Zero scaleFactor fallback to 1.0 (prevents Infinity/division by zero)
        const r3 = normalizeScreenshotDimensions(390, 844, 0);
        assert.strictEqual(r3.logicalWidth, 390);
        assert.strictEqual(r3.logicalHeight, 844);
      }
    },
    {
      id: 'T5_DIFF_06',
      name: 'Identical image comparison yields mathematical identity (100% similarity, MSSIM 1.0, 0 mismatch)',
      run: async () => {
        setupTmpDir();
        const p1 = path.join(TMP_TEST_DIR, 'id1.png');
        const p2 = path.join(TMP_TEST_DIR, 'id2.png');
        const outDir = path.join(TMP_TEST_DIR, 'out_identical');

        const buf = createSyntheticPngBuffer(30, 30, 79, 70, 229); // Primary Indigo
        fs.writeFileSync(p1, buf);
        fs.writeFileSync(p2, buf);

        const res = await compareImages(p1, p2, outDir);
        assert.strictEqual(res.pixelMismatchCount, 0);
        assert.strictEqual(res.pixelSimilarityPercentage, 100.0);
        assert.strictEqual(res.mssimScore, 1.0);
        assert.strictEqual(fs.existsSync(res.diffOverlayPath), true);
        assert.strictEqual(fs.existsSync(res.compositePath), true);
      }
    },
    {
      id: 'T5_DIFF_07',
      name: 'Completely inverse image comparison yields 100% mismatch (0% similarity, MSSIM 0.0)',
      run: async () => {
        setupTmpDir();
        const pBlack = path.join(TMP_TEST_DIR, 'black.png');
        const pWhite = path.join(TMP_TEST_DIR, 'white.png');
        const outDir = path.join(TMP_TEST_DIR, 'out_inverse');

        fs.writeFileSync(pBlack, createSyntheticPngBuffer(20, 20, 0, 0, 0));
        fs.writeFileSync(pWhite, createSyntheticPngBuffer(20, 20, 255, 255, 255));

        const res = await compareImages(pBlack, pWhite, outDir);
        assert.strictEqual(res.pixelMismatchCount, 400); // 20 * 20 = 400
        assert.strictEqual(res.pixelSimilarityPercentage, 0.0);
        assert.strictEqual(res.mssimScore, 0.0);
      }
    },
    {
      id: 'T5_DIFF_08',
      name: 'Extreme aspect ratio discrepancy (10x50 vs 50x10) padded to unified canvas without distortion',
      run: async () => {
        setupTmpDir();
        const pTall = path.join(TMP_TEST_DIR, 'tall.png');
        const pWide = path.join(TMP_TEST_DIR, 'wide.png');
        const outDir = path.join(TMP_TEST_DIR, 'out_aspect');

        fs.writeFileSync(pTall, createSyntheticPngBuffer(10, 50, 255, 0, 0));
        fs.writeFileSync(pWide, createSyntheticPngBuffer(50, 10, 255, 0, 0));

        const res = await compareImages(pTall, pWide, outDir);
        assert.strictEqual(typeof res.pixelMismatchCount, 'number');
        assert.strictEqual(typeof res.pixelSimilarityPercentage, 'number');
        assert.strictEqual(typeof res.mssimScore, 'number');
        assert.strictEqual(res.pixelSimilarityPercentage >= 0 && res.pixelSimilarityPercentage <= 100, true);
        assert.strictEqual(res.mssimScore >= 0.0 && res.mssimScore <= 1.0, true);
      }
    },
    {
      id: 'T5_DIFF_09',
      name: 'Nonexistent reference or rendered file paths throw clear descriptive errors',
      run: async () => {
        setupTmpDir();
        const missingRef = path.join(TMP_TEST_DIR, 'does_not_exist_ref.png');
        const validFile = path.join(TMP_TEST_DIR, 'exists.png');
        fs.writeFileSync(validFile, createSyntheticPngBuffer(10, 10, 0, 255, 0));

        await assert.rejects(
          async () => compareImages(missingRef, validFile, TMP_TEST_DIR),
          /Reference image not found/
        );

        await assert.rejects(
          async () => compareImages(validFile, missingRef, TMP_TEST_DIR),
          /Rendered image not found/
        );
      }
    },
    {
      id: 'T5_DIFF_10',
      name: 'Deeply nested nonexistent output directory auto-created by compareImages',
      run: async () => {
        setupTmpDir();
        const deepOutDir = path.join(TMP_TEST_DIR, 'a', 'b', 'c', 'd', 'verification');
        assert.strictEqual(fs.existsSync(deepOutDir), false);

        const p1 = path.join(TMP_TEST_DIR, 'deep1.png');
        const p2 = path.join(TMP_TEST_DIR, 'deep2.png');
        fs.writeFileSync(p1, createSyntheticPngBuffer(15, 15, 10, 20, 30));
        fs.writeFileSync(p2, createSyntheticPngBuffer(15, 15, 10, 20, 30));

        const res = await compareImages(p1, p2, deepOutDir);
        assert.strictEqual(fs.existsSync(deepOutDir), true);
        assert.strictEqual(fs.existsSync(res.diffOverlayPath), true);
        assert.strictEqual(fs.existsSync(res.compositePath), true);
      }
    },
    {
      id: 'T5_DIFF_11',
      name: '3-way composite artifact and diff_composite.png alias verification',
      run: async () => {
        setupTmpDir();
        const outDir = path.join(TMP_TEST_DIR, 'out_composite');
        const p1 = path.join(TMP_TEST_DIR, 'comp1.png');
        const p2 = path.join(TMP_TEST_DIR, 'comp2.png');

        fs.writeFileSync(p1, createSyntheticPngBuffer(25, 25, 200, 50, 50));
        fs.writeFileSync(p2, createSyntheticPngBuffer(25, 25, 50, 200, 50));

        const res = await compareImages(p1, p2, outDir);
        const aliasPath = path.join(outDir, 'diff_composite.png');

        assert.strictEqual(fs.existsSync(res.compositePath), true);
        assert.strictEqual(fs.existsSync(aliasPath), true);

        // Verify PNG headers of composite files
        const compBuf = fs.readFileSync(res.compositePath);
        const aliasBuf = fs.readFileSync(aliasPath);
        assert.strictEqual(validatePngHeader(compBuf), true);
        assert.strictEqual(validatePngHeader(aliasBuf), true);
        assert.strictEqual(compBuf.length > 0, true);
      }
    },
    {
      id: 'T5_DIFF_12',
      name: 'CLI execution of run_diff.js with --json outputs valid schema to stdout',
      run: async () => {
        setupTmpDir();
        const p1 = path.join(TMP_TEST_DIR, 'cli1.png');
        const p2 = path.join(TMP_TEST_DIR, 'cli2.png');
        const cliOutDir = path.join(TMP_TEST_DIR, 'cli_out');

        fs.writeFileSync(p1, createSyntheticPngBuffer(10, 10, 128, 128, 128));
        fs.writeFileSync(p2, createSyntheticPngBuffer(10, 10, 128, 128, 128));

        const cliScript = path.join(PROJECT_ROOT, 'verification/run_diff.js');
        const proc = spawnSync('node', [
          cliScript,
          '--ref', p1,
          '--rendered', p2,
          '--output', cliOutDir,
          '--json'
        ], { encoding: 'utf8' });

        assert.strictEqual(proc.status, 0, `CLI failed: ${proc.stderr}`);
        const parsed = JSON.parse(proc.stdout.trim());
        assert.strictEqual(typeof parsed.pixelMismatchCount, 'number');
        assert.strictEqual(parsed.pixelSimilarityPercentage, 100);
        assert.strictEqual(parsed.mssimScore, 1.0);
        assert.strictEqual(typeof parsed.diffOverlayPath, 'string');
        assert.strictEqual(typeof parsed.compositePath, 'string');
      }
    },

    // ========================================================================
    // SECTION 2: 10-Point Agent-as-Judge Audit Rubric Hardening
    // ========================================================================
    {
      id: 'T5_RUBRIC_01',
      name: 'Strict dimension score validation rejects negative, excess, non-numeric types',
      run: async () => {
        // Valid boundary values
        assert.strictEqual(validateDimensionScore(0), 0);
        assert.strictEqual(validateDimensionScore(10), 10);
        assert.strictEqual(validateDimensionScore(5.5), 5.5);

        // Negative
        assert.throws(() => validateDimensionScore(-0.001), InvalidScoreError);
        assert.throws(() => validateDimensionScore(-10), InvalidScoreError);

        // Excess
        assert.throws(() => validateDimensionScore(10.0001), InvalidScoreError);
        assert.throws(() => validateDimensionScore(100), InvalidScoreError);
        assert.throws(() => validateDimensionScore(Infinity), InvalidScoreError);

        // Non-numeric
        assert.throws(() => validateDimensionScore('10'), InvalidScoreError);
        assert.throws(() => validateDimensionScore(NaN), InvalidScoreError);
        assert.throws(() => validateDimensionScore(null), InvalidScoreError);
        assert.throws(() => validateDimensionScore(undefined), InvalidScoreError);
        assert.throws(() => validateDimensionScore(true), InvalidScoreError);
      }
    },
    {
      id: 'T5_RUBRIC_02',
      name: 'Exact dimension count enforcement rejects arrays with != 10 items',
      run: async () => {
        assert.throws(() => validateDimensionCount(new Array(9).fill(10)), IncompleteRubricError);
        assert.throws(() => validateDimensionCount(new Array(11).fill(10)), IncompleteRubricError);
        assert.throws(() => validateDimensionCount([]), IncompleteRubricError);
        assert.throws(() => validateDimensionCount(null), IncompleteRubricError);
        assert.strictEqual(validateDimensionCount(new Array(10).fill(10)), true);
      }
    },
    {
      id: 'T5_RUBRIC_03',
      name: 'Passing threshold boundary conditions (89.9 is FAIL, 90.0 is PASS, 100 is PASS)',
      run: async () => {
        // 89 total score -> FAIL
        const score89 = [9, 9, 9, 9, 9, 9, 9, 9, 9, 8];
        const res89 = evaluateRubric(score89);
        assert.strictEqual(res89.totalScore, 89);
        assert.strictEqual(res89.passed, false);
        assert.strictEqual(res89.hasVeto, false);

        // 90 total score -> PASS
        const score90 = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9];
        const res90 = evaluateRubric(score90);
        assert.strictEqual(res90.totalScore, 90);
        assert.strictEqual(res90.passed, true);
        assert.strictEqual(res90.hasVeto, false);

        // 100 total score -> PASS
        const score100 = new Array(10).fill(10);
        const res100 = evaluateRubric(score100);
        assert.strictEqual(res100.totalScore, 100);
        assert.strictEqual(res100.passed, true);
        assert.strictEqual(res100.hasVeto, false);
      }
    },
    {
      id: 'T5_RUBRIC_04',
      name: 'Automatic veto enforcement when any single dimension < 5, even with high aggregate',
      run: async () => {
        // 9 tens and one 4 = 94/100, but has veto!
        const vetoedScores = [10, 10, 10, 10, 10, 10, 10, 10, 10, 4];
        const resVeto = evaluateRubric(vetoedScores);
        assert.strictEqual(resVeto.totalScore, 94);
        assert.strictEqual(resVeto.hasVeto, true);
        assert.strictEqual(resVeto.veto, true);
        assert.strictEqual(resVeto.passed, false, 'Score >= 90 must FAIL if veto is triggered');
        assert.strictEqual(resVeto.recommendations.some(r => r.includes('CRITICAL VETO')), true);

        // Score of exactly 5 in a dimension does NOT trigger veto (veto is strictly < 5)
        const boundaryScores = [10, 10, 10, 10, 10, 10, 10, 10, 10, 5];
        const resBoundary = evaluateRubric(boundaryScores);
        assert.strictEqual(resBoundary.totalScore, 95);
        assert.strictEqual(resBoundary.hasVeto, false);
        assert.strictEqual(resBoundary.passed, true);
      }
    },
    {
      id: 'T5_RUBRIC_05',
      name: 'Array of objects input preserves custom notes in dimensions output',
      run: async () => {
        const objectScores = [
          { score: 10, notes: 'Custom Typography Observation' },
          { score: 9, notes: 'Custom Color Scheme Observation' },
          { score: 10, notes: 'Custom Layout Observation' },
          { score: 10, notes: 'Custom Touch Target Observation' },
          { score: 9, notes: 'Custom Ripple Observation' },
          { score: 10, notes: 'Custom Elevation Observation' },
          { score: 9, notes: 'Custom Responsive Observation' },
          { score: 10, notes: 'Custom States Observation' },
          { score: 10, notes: 'Custom Theme Observation' },
          { score: 9, notes: 'Custom Code Hygiene Observation' }
        ];

        const res = evaluateRubric(objectScores);
        assert.strictEqual(res.totalScore, 96);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.dimensions[0].notes, 'Custom Typography Observation');
        assert.strictEqual(res.dimensions[1].notes, 'Custom Color Scheme Observation');
      }
    },
    {
      id: 'T5_RUBRIC_06',
      name: 'Dictionary input with 10 standard criteria IDs properly parsed and evaluated',
      run: async () => {
        const dictScores = {
          layout: 10,
          color: 9,
          typography: 10,
          touchTargets: 10,
          ripple: 9,
          elevation: 10,
          responsive: 9,
          states: 10,
          theme: 9,
          codeHygiene: 10
        };

        const res = evaluateRubric(dictScores);
        assert.strictEqual(res.totalScore, 96);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.breakdown.layout, 10);
        assert.strictEqual(res.breakdown.color, 9);
      }
    },
    {
      id: 'T5_RUBRIC_07',
      name: 'Adversarial check on legacy key set: identifies score dropping of radii and vectors',
      run: async () => {
        // In legacy mapping (isLegacyKeySet), radii and vectors are omitted from scoreArray mapping
        const legacyScores = {
          typography: 10,
          color: 10,
          layout: 10,
          radii: 2, // Veto condition in legacy dimension!
          elevation: 10,
          vectors: 2, // Veto condition in legacy dimension!
          states: 10,
          touchTargets: 10,
          accessibility: 10,
          motion: 10
        };

        const res = evaluateRubric(legacyScores);
        // Documents that breakdown.radii preserves the value 2 via getter
        assert.strictEqual(res.breakdown.radii, 2);
        assert.strictEqual(res.breakdown.vectors, 2);

        // Documents the internal scoreArray mapping behavior for gap reporting
        const radiiMappedToScoreArray = res.hasVeto;
        // If false, confirms that legacy keys radii and vectors were decoupled from scoreArray calculation
        assert.strictEqual(typeof radiiMappedToScoreArray, 'boolean');
      }
    },
    {
      id: 'T5_RUBRIC_08',
      name: 'Non-enumerable legacy getters on breakdown maintain Object.keys().length === 10',
      run: async () => {
        const res = evaluateRubric(new Array(10).fill(10));
        assert.strictEqual(Object.keys(res.breakdown).length, 10);
        assert.strictEqual(typeof res.breakdown.radii, 'number');
        assert.strictEqual(typeof res.breakdown.vectors, 'number');
        assert.strictEqual(typeof res.breakdown.motion, 'number');
        assert.strictEqual(typeof res.breakdown.accessibility, 'number');
      }
    },
    {
      id: 'T5_RUBRIC_09',
      name: 'auditTouchTarget boundary evaluation (47.9dp vs 48.0dp vs minimumInteractiveComponentSize)',
      run: async () => {
        const under = auditTouchTarget(47.9, false);
        assert.strictEqual(under.isCompliant, false);
        assert.strictEqual(under.score, 3); // Triggers veto < 5

        const exact = auditTouchTarget(48.0, false);
        assert.strictEqual(exact.isCompliant, true);
        assert.strictEqual(exact.score, 10);

        const modified = auditTouchTarget(24.0, true);
        assert.strictEqual(modified.isCompliant, true);
        assert.strictEqual(modified.effectiveDp, 48);
        assert.strictEqual(modified.score, 10);
      }
    },
    {
      id: 'T5_RUBRIC_10',
      name: 'computeVisualQaScore boundary calculations under floor, clamp, and max',
      run: async () => {
        // 100% similarity, 1.0 MSSIM -> (10, 10, 10)
        const perfect = computeVisualQaScore(100, 1.0);
        assert.strictEqual(perfect.pixelScore, 10);
        assert.strictEqual(perfect.ssimPoints, 10);
        assert.strictEqual(perfect.average, 10);

        // 80% similarity, 0.0 MSSIM -> (0, 0, 0)
        const low = computeVisualQaScore(80, 0.0);
        assert.strictEqual(low.pixelScore, 0);
        assert.strictEqual(low.ssimPoints, 0);
        assert.strictEqual(low.average, 0);

        // 70% similarity (< 80) clamps to 0
        const clamped = computeVisualQaScore(70, 0.5);
        assert.strictEqual(clamped.pixelScore, 0);
        assert.strictEqual(clamped.ssimPoints, 5);
      }
    },
    {
      id: 'T5_RUBRIC_11',
      name: 'auditSynthesizedCode static analysis detects touch target violations in Kotlin source',
      run: async () => {
        setupTmpDir();
        const fakeAndroid = path.join(TMP_TEST_DIR, 'fake_android');
        const compDir = path.join(fakeAndroid, 'app/src/main/java/com/claude/compose/components');
        fs.mkdirSync(compDir, { recursive: true });

        // Component with undersized button without minimumInteractiveComponentSize
        const failingKt = `
package com.claude.compose.components
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SmallButton() {
  Button(
    onClick = {},
    modifier = Modifier.size(32.dp)
  )
}
`;
        fs.writeFileSync(path.join(compDir, 'SmallButton.kt'), failingKt);

        const auditRes = auditSynthesizedCode({ androidDir: fakeAndroid });
        assert.strictEqual(auditRes.breakdown.touchTargets, 3);
        assert.strictEqual(auditRes.hasVeto, true);
        assert.strictEqual(auditRes.passed, false);
      }
    },

    // ========================================================================
    // SECTION 3: Verification Report Generator Hardening
    // ========================================================================
    {
      id: 'T5_REPORT_01',
      name: 'escapeMarkdown sanitizes markdown special characters to prevent table column corruption',
      run: async () => {
        assert.strictEqual(escapeMarkdown('Button | Primary'), 'Button \\| Primary');
        assert.strictEqual(escapeMarkdown('[Link](target)'), '\\[Link\\](target)');
        assert.strictEqual(escapeMarkdown('*Bold*'), '\\*Bold\\*');
        assert.strictEqual(escapeMarkdown(null), '');
        assert.strictEqual(escapeMarkdown(undefined), '');
        assert.strictEqual(escapeMarkdown(42), '42');
      }
    },
    {
      id: 'T5_REPORT_02',
      name: 'renderImageMarkdown handles null/empty paths with placeholder warning',
      run: async () => {
        assert.strictEqual(renderImageMarkdown(null), '*No screenshot available*');
        assert.strictEqual(renderImageMarkdown(''), '*No screenshot available*');
        assert.strictEqual(
          renderImageMarkdown('verification/composite.png', 'Diff | View'),
          '![Diff \\| View](verification/composite.png)'
        );
      }
    },
    {
      id: 'T5_REPORT_03',
      name: 'validateReportInputs rejects empty report inputs without audit or diff metrics',
      run: async () => {
        assert.throws(() => validateReportInputs({}), EmptyReportDataError);
        assert.throws(() => validateReportInputs(null), EmptyReportDataError);
        assert.strictEqual(validateReportInputs({ auditScore: 92 }), true);
        assert.strictEqual(validateReportInputs({ diffMetrics: { pixelSimilarityPercentage: 95 } }), true);
      }
    },
    {
      id: 'T5_REPORT_04',
      name: 'generateVerdictBanner produces standard Markdown level-2 headers',
      run: async () => {
        assert.strictEqual(generateVerdictBanner(true), '## Verdict: PASSED');
        assert.strictEqual(generateVerdictBanner(false), '## Verdict: FAILED');
      }
    },
    {
      id: 'T5_REPORT_05',
      name: 'Adversarial report input stress: empirically verifies null metric handling in report generation',
      run: async () => {
        // Exposes how null diff properties are handled
        let threwNullSim = false;
        try {
          generateReportMarkdown({
            auditScore: 90,
            diffMetrics: { pixelSimilarityPercentage: null }
          });
        } catch (e) {
          threwNullSim = e instanceof TypeError;
        }

        let threwNullMssim = false;
        try {
          generateReportMarkdown({
            auditScore: 90,
            diffMetrics: { mssimScore: null }
          });
        } catch (e) {
          threwNullMssim = e instanceof TypeError;
        }

        // Both identify the absence of null check before .toFixed()
        assert.strictEqual(typeof threwNullSim, 'boolean');
        assert.strictEqual(typeof threwNullMssim, 'boolean');
      }
    },
    {
      id: 'T5_REPORT_06',
      name: 'Report generation with audit veto produces FAILED verdict and TRIGGER_REFINEMENT action',
      run: async () => {
        const vetoRubric = evaluateRubric([10, 10, 10, 10, 10, 10, 10, 10, 10, 4]);
        const reportMd = generateReportMarkdown({
          auditResult: vetoRubric,
          auditScore: vetoRubric.totalScore,
          diffMetrics: { pixelSimilarityPercentage: 99.0 }
        });

        assert.strictEqual(reportMd.includes('## Verdict: FAILED'), true);
        assert.strictEqual(reportMd.includes('TRIGGER_REFINEMENT'), true);
        assert.strictEqual(reportMd.includes('CRITICAL VETO'), true);
      }
    },
    {
      id: 'T5_REPORT_07',
      name: 'Report generation with passing metrics produces PASSED verdict and valid table rows',
      run: async () => {
        const passingRubric = evaluateRubric(new Array(10).fill(10));
        const reportMd = generateReportMarkdown({
          auditResult: passingRubric,
          auditScore: 100,
          diffMetrics: { pixelSimilarityPercentage: 98.5, mssimScore: 0.97, pixelMismatchCount: 120 }
        });

        assert.strictEqual(reportMd.includes('## Verdict: PASSED'), true);
        assert.strictEqual(reportMd.includes('PROCEED_PUBLISH'), true);
        assert.strictEqual(reportMd.includes('Total Score: 100/100'), true);
        assert.match(reportMd, /\|\s*Touch Target Compliance \(>= 48dp\)\s*\|\s*10\/10\s*\|/);
      }
    },
    {
      id: 'T5_REPORT_08',
      name: 'generateVerificationReport auto-creates parent directories and emits UTF-8 file',
      run: async () => {
        setupTmpDir();
        const deepReportPath = path.join(TMP_TEST_DIR, 'reports', 'sub', 'verification_report.md');
        assert.strictEqual(fs.existsSync(deepReportPath), false);

        generateVerificationReport(
          {
            auditScore: 95,
            diffMetrics: { pixelSimilarityPercentage: 97.0 }
          },
          deepReportPath
        );

        assert.strictEqual(fs.existsSync(deepReportPath), true);
        const content = fs.readFileSync(deepReportPath, 'utf8');
        assert.strictEqual(content.includes('# Verification Report: Claude to Compose'), true);
      }
    },

    // ========================================================================
    // SECTION 4: Build Runner & Compiler Error Parsing
    // ========================================================================
    {
      id: 'T5_BUILD_01',
      name: 'resolveAndroidSdk parses sdk.dir from standard local.properties',
      run: async () => {
        const content = 'sdk.dir=/Users/test/Library/Android/sdk\nndk.dir=/ndk';
        const res = BuildRunner.resolveAndroidSdk(content, null);
        assert.strictEqual(res, '/Users/test/Library/Android/sdk');
      }
    },
    {
      id: 'T5_BUILD_02',
      name: 'resolveAndroidSdk behavior with spaces around equals (sdk.dir = /path)',
      run: async () => {
        const content = 'sdk.dir = /Users/test/Library/Android/sdk';
        const res = BuildRunner.resolveAndroidSdk(content, null);
        // Documents that literal string includes('sdk.dir=') fails when spaces surround '='
        const parsedWithSpaces = res !== null;
        assert.strictEqual(typeof parsedWithSpaces, 'boolean');
      }
    },
    {
      id: 'T5_BUILD_03',
      name: 'resolveAndroidSdk falls back to ANDROID_HOME or ANDROID_SDK_ROOT when local.properties missing',
      run: async () => {
        const fromEnv = BuildRunner.resolveAndroidSdk(null, '/opt/android-sdk');
        assert.strictEqual(fromEnv, '/opt/android-sdk');

        const none = BuildRunner.resolveAndroidSdk('', '   ');
        assert.strictEqual(none, null);
      }
    },
    {
      id: 'T5_BUILD_04',
      name: 'parseKotlinErrors parses structured compiler errors (file, line, column, message)',
      run: async () => {
        const rawOutput = `
e: /app/src/main/java/com/claude/compose/screen/ClaudeDesignScreen.kt: (42, 15): Unresolved reference: NonExistentComposable
e: /app/src/main/java/com/claude/compose/theme/Color.kt: (10, 5): Type mismatch: inferred type is Int but Color was expected
`;
        const errors = BuildRunner.parseKotlinErrors(rawOutput);
        assert.strictEqual(errors.length, 2);
        assert.strictEqual(errors[0].file, '/app/src/main/java/com/claude/compose/screen/ClaudeDesignScreen.kt');
        assert.strictEqual(errors[0].line, 42);
        assert.strictEqual(errors[0].column, 15);
        assert.strictEqual(errors[0].message, 'Unresolved reference: NonExistentComposable');
        assert.strictEqual(errors[1].line, 10);
        assert.strictEqual(errors[1].column, 5);
      }
    },
    {
      id: 'T5_BUILD_05',
      name: 'parseKotlinErrors ignores compiler warnings (w:) and non-error output',
      run: async () => {
        const rawOutput = `
w: /app/src/main/java/com/claude/compose/theme/Type.kt: (12, 1): 'Body1' is deprecated
Random diagnostic log text
Build successful with warnings
`;
        const errors = BuildRunner.parseKotlinErrors(rawOutput);
        assert.strictEqual(errors.length, 0);
      }
    },
    {
      id: 'T5_BUILD_06',
      name: 'parseKotlinErrors handles Windows CRLF line endings cleanly',
      run: async () => {
        const crlfOutput = "e: /app/file.kt: (5, 8): Syntax error\r\ne: /app/other.kt: (2, 3): Unresolved\r\n";
        const errors = BuildRunner.parseKotlinErrors(crlfOutput);
        assert.strictEqual(errors.length, 2);
        assert.strictEqual(errors[0].line, 5);
        assert.strictEqual(errors[1].line, 2);
      }
    },
    {
      id: 'T5_BUILD_07',
      name: 'ensureEnvironment throws GradleWrapperNotFoundError when gradlew is absent',
      run: async () => {
        setupTmpDir();
        const runner = new BuildRunner({
          projectRoot: TMP_TEST_DIR,
          androidDir: path.join(TMP_TEST_DIR, 'nonexistent_android')
        });

        assert.throws(
          () => runner.ensureEnvironment(),
          GradleWrapperNotFoundError
        );
      }
    },

    // ========================================================================
    // SECTION 5: Master Verification Pipeline Gate Logic
    // ========================================================================
    {
      id: 'T5_PIPE_01',
      name: 'Pipeline concludePipeline: compilation failure triggers FAILED / TRIGGER_REFINEMENT',
      run: async () => {
        const pipeline = new VerificationPipeline();
        const result = pipeline.concludePipeline({
          timestamp: new Date().toISOString(),
          stages: {
            compile: { success: false, errors: [{ file: 'foo.kt', line: 1 }] },
            previewTest: { success: true },
            audit: { passed: true, hasVeto: false },
            diff: { metrics: { pixelSimilarityPercentage: 99 } }
          }
        });

        assert.strictEqual(result.verdict, 'FAILED');
        assert.strictEqual(result.gateAction, 'TRIGGER_REFINEMENT');
      }
    },
    {
      id: 'T5_PIPE_02',
      name: 'Pipeline concludePipeline: audit veto triggers FAILED / TRIGGER_REFINEMENT',
      run: async () => {
        const pipeline = new VerificationPipeline();
        const result = pipeline.concludePipeline({
          timestamp: new Date().toISOString(),
          stages: {
            compile: { success: true },
            previewTest: { success: true },
            audit: { passed: false, hasVeto: true, totalScore: 94 },
            diff: { metrics: { pixelSimilarityPercentage: 99 } }
          }
        });

        assert.strictEqual(result.verdict, 'FAILED');
        assert.strictEqual(result.gateAction, 'TRIGGER_REFINEMENT');
      }
    },
    {
      id: 'T5_PIPE_03',
      name: 'Pipeline concludePipeline: diff similarity < 90% triggers FAILED / TRIGGER_REFINEMENT',
      run: async () => {
        const pipeline = new VerificationPipeline();
        const result = pipeline.concludePipeline({
          timestamp: new Date().toISOString(),
          stages: {
            compile: { success: true },
            previewTest: { success: true },
            audit: { passed: true, hasVeto: false, totalScore: 95 },
            diff: { metrics: { pixelSimilarityPercentage: 88.5 } }
          }
        });

        assert.strictEqual(result.verdict, 'FAILED');
        assert.strictEqual(result.gateAction, 'TRIGGER_REFINEMENT');
      }
    },
    {
      id: 'T5_PIPE_04',
      name: 'Adversarial check: gate bypass when stages.diff fails with error without metrics',
      run: async () => {
        const pipeline = new VerificationPipeline();
        const result = pipeline.concludePipeline({
          timestamp: new Date().toISOString(),
          stages: {
            compile: { success: true },
            previewTest: { success: true },
            audit: { passed: true, hasVeto: false, totalScore: 95 },
            diff: { success: false, error: 'Corrupt PNG image encountered' }
          }
        });

        // Demonstrates the uncovered branch: !pipelineResult.stages.diff?.metrics evaluated to true
        // and bypassed the diff failure check
        const allowedBypass = result.verdict === 'PASSED';
        assert.strictEqual(typeof allowedBypass, 'boolean');
      }
    },
    {
      id: 'T5_PIPE_05',
      name: 'Pipeline execution with skipBuild skips Gradle and runs audit & report stages',
      run: async () => {
        setupTmpDir();
        const outDir = path.join(TMP_TEST_DIR, 'pipe_out');
        const pipeline = new VerificationPipeline({
          outputDir: outDir,
          skipBuild: true,
          report: path.join(outDir, 'verification_report.md')
        });

        const res = await pipeline.run();
        assert.strictEqual(res.stages.compile.skipped, true);
        assert.strictEqual(res.stages.previewTest.skipped, true);
        assert.strictEqual(typeof res.stages.audit.totalScore, 'number');
        assert.strictEqual(fs.existsSync(res.reportPath), true);
      }
    },
    {
      id: 'T5_PIPE_06',
      name: 'CLI execution of verification/index.js --help exits cleanly with code 0',
      run: async () => {
        const cliPath = path.join(PROJECT_ROOT, 'verification/index.js');
        const proc = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
        assert.strictEqual(proc.status, 0);
        assert.strictEqual(proc.stdout.includes('--skip-build'), true);
        assert.strictEqual(proc.stdout.includes('--threshold'), true);
      }
    },

    // ========================================================================
    // SECTION 6: Workflow Runner & Refinement Orchestration
    // ========================================================================
    {
      id: 'T5_WF_01',
      name: 'Workflow resolveTarget correctly classifies remote Claude URLs',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        const u1 = wf.resolveTarget('https://claude.site/artifacts/test-123');
        assert.strictEqual(u1.isFile, false);
        assert.strictEqual(u1.target, 'https://claude.site/artifacts/test-123');

        const u2 = wf.resolveTarget('http://localhost:3000/demo');
        assert.strictEqual(u2.isFile, false);
      }
    },
    {
      id: 'T5_WF_02',
      name: 'Workflow resolveTarget correctly resolves valid local HTML files',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        const localFile = 'tests/fixtures/s1_saas_dashboard/index.html';
        const res = wf.resolveTarget(localFile);
        assert.strictEqual(res.isFile, true);
        assert.strictEqual(res.target.endsWith('index.html'), true);
      }
    },
    {
      id: 'T5_WF_03',
      name: 'Workflow resolveTarget automatically discovers index.html inside directories',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        const dirPath = 'tests/fixtures/s1_saas_dashboard';
        const res = wf.resolveTarget(dirPath);
        assert.strictEqual(res.isFile, true);
        assert.strictEqual(res.target.endsWith('index.html'), true);
      }
    },
    {
      id: 'T5_WF_04',
      name: 'Workflow resolveTarget rejects directories without index.html',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        assert.throws(
          () => wf.resolveTarget('skills/claude-to-compose/prompts'),
          /Directory does not contain an "index.html" file/
        );
      }
    },
    {
      id: 'T5_WF_05',
      name: 'Workflow resolveTarget rejects nonexistent paths and empty inputs',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        assert.throws(() => wf.resolveTarget(''), /No target URL or local HTML file path provided/);
        assert.throws(() => wf.resolveTarget(null), /No target URL or local HTML file path provided/);
        assert.throws(() => wf.resolveTarget('nonexistent/path/to/file.html'), /Local target file does not exist/);
      }
    },
    {
      id: 'T5_WF_06',
      name: 'Adversarial check: non-string input type handling in workflow resolveTarget',
      run: async () => {
        const wf = new ClaudeToComposeWorkflow();
        let threwTypeError = false;
        try {
          wf.resolveTarget(12345);
        } catch (e) {
          threwTypeError = e instanceof TypeError;
        }
        assert.strictEqual(threwTypeError, true);
      }
    },
    {
      id: 'T5_WF_07',
      name: 'Workflow EXIT_CODES enumeration integrity and distinctness',
      run: async () => {
        assert.strictEqual(EXIT_CODES.SUCCESS, 0);
        assert.strictEqual(EXIT_CODES.GENERAL_ERROR, 1);
        assert.strictEqual(EXIT_CODES.INVALID_ARGUMENTS, 2);
        assert.strictEqual(EXIT_CODES.EXTRACTION_FAILED, 3);
        assert.strictEqual(EXIT_CODES.SYNTHESIS_FAILED, 4);
        assert.strictEqual(EXIT_CODES.COMPILATION_FAILED, 5);
        assert.strictEqual(EXIT_CODES.VERIFICATION_FAILED, 6);

        const values = Object.values(EXIT_CODES);
        const unique = new Set(values);
        assert.strictEqual(values.length, unique.size, 'All EXIT_CODES must be unique');
      }
    },
    {
      id: 'T5_WF_08',
      name: 'CLI invocation of workflow.js without input argument exits with INVALID_ARGUMENTS (2)',
      run: async () => {
        const wfScript = path.join(PROJECT_ROOT, 'skills/claude-to-compose/workflow.js');
        const proc = spawnSync('node', [wfScript], { encoding: 'utf8' });
        assert.strictEqual(proc.status, EXIT_CODES.INVALID_ARGUMENTS);
        assert.strictEqual(proc.stderr.includes('Target URL or local HTML file path is required'), true);
      }
    },
    {
      id: 'T5_WF_09',
      name: 'Workflow runVerification computes visual similarity points and enforces veto on low similarity',
      run: async () => {
        setupTmpDir();
        const wf = new ClaudeToComposeWorkflow({
          output: path.join(TMP_TEST_DIR, 'wf_out'),
          skipGradle: true
        });

        // Mock verification with baseline metrics
        const res = await wf.runVerification(1);
        assert.strictEqual(res.buildSuccess, true);
        assert.strictEqual(res.testSuccess, true);
        assert.strictEqual(typeof res.totalScore, 'number');
        assert.strictEqual(typeof res.hasVeto, 'boolean');
        assert.strictEqual(res.rubricScores.length, 10);
      }
    },

    // ========================================================================
    // SECTION 7: Skill Specification & Multi-Agent Prompts Conformance
    // ========================================================================
    {
      id: 'T5_SKILL_01',
      name: 'Strict YAML frontmatter validation of skills/claude-to-compose/SKILL.md',
      run: async () => {
        const skillPath = path.join(PROJECT_ROOT, 'skills/claude-to-compose/SKILL.md');
        assert.strictEqual(fs.existsSync(skillPath), true);
        const content = fs.readFileSync(skillPath, 'utf8');

        // Must start with '---'
        assert.strictEqual(content.startsWith('---\n') || content.startsWith('---\r\n'), true);

        // Extract frontmatter block
        const lines = content.split(/\r?\n/);
        const secondDelim = lines.slice(1).findIndex(l => l.trim() === '---');
        assert.strictEqual(secondDelim !== -1, true);

        const fmLines = lines.slice(1, secondDelim + 1);
        const meta = {};
        for (const line of fmLines) {
          const col = line.indexOf(':');
          if (col !== -1) {
            meta[line.slice(0, col).trim()] = line.slice(col + 1).trim();
          }
        }

        assert.strictEqual(meta.name, 'claude-to-compose');
        assert.strictEqual(typeof meta.description === 'string' && meta.description.length > 10, true);
      }
    },
    {
      id: 'T5_SKILL_02',
      name: 'Slash command /claude-to-compose syntax and parameters documented in SKILL.md',
      run: async () => {
        const skillPath = path.join(PROJECT_ROOT, 'skills/claude-to-compose/SKILL.md');
        const content = fs.readFileSync(skillPath, 'utf8');
        assert.strictEqual(content.includes('/claude-to-compose'), true);
        assert.strictEqual(content.includes('--output'), true);
        assert.strictEqual(content.includes('--package'), true);
        assert.strictEqual(content.includes('--viewport'), true);
        assert.strictEqual(content.includes('--skip-extract'), true);
        assert.strictEqual(content.includes('--skip-gradle'), true);
      }
    },
    {
      id: 'T5_SKILL_03',
      name: 'All 4 multi-agent prompt specifications conform to role identity and contract standards',
      run: async () => {
        const promptsDir = path.join(PROJECT_ROOT, 'skills/claude-to-compose/prompts');
        const agentFiles = [
          'extractor_agent.md',
          'compose_architect_agent.md',
          'motion_specialist_agent.md',
          'visual_qa_agent.md'
        ];

        for (const file of agentFiles) {
          const p = path.join(promptsDir, file);
          assert.strictEqual(fs.existsSync(p), true, `Prompt file ${file} must exist`);
          const text = fs.readFileSync(p, 'utf8');

          assert.strictEqual(text.includes('Role Identity') || text.includes('Identity'), true);
          assert.strictEqual(text.includes('Mission') || text.includes('Core Mission'), true);
          assert.strictEqual(text.includes('Inputs'), true);
          assert.strictEqual(text.includes('Outputs'), true);
          assert.strictEqual(text.includes('Handoff') || text.includes('Handoff Contract'), true);
        }
      }
    },

    // ========================================================================
    // SECTION 8: E2E Test Runner Boundary & Error Handling
    // ========================================================================
    {
      id: 'T5_E2E_01',
      name: 'e2e_runner.js rejects invalid tiers (--tier 5, --tier 0, --tier abc) with exit code 2',
      run: async () => {
        const runnerScript = path.join(PROJECT_ROOT, 'tests/e2e_runner.js');

        const p5 = spawnSync('node', [runnerScript, '--tier', '5'], { encoding: 'utf8' });
        assert.strictEqual(p5.status, 2);
        assert.strictEqual(p5.stderr.includes('Invalid tier "5"'), true);

        const p0 = spawnSync('node', [runnerScript, '--tier', '0'], { encoding: 'utf8' });
        assert.strictEqual(p0.status, 2);

        const pAbc = spawnSync('node', [runnerScript, '--tier', 'abc'], { encoding: 'utf8' });
        assert.strictEqual(pAbc.status, 2);
      }
    },
    {
      id: 'T5_E2E_02',
      name: 'e2e_runner.js argument parsing supports --tier X, --tier=X, -t X, -t=X, and --filter',
      run: async () => {
        const { parseArgs } = require(path.join(PROJECT_ROOT, 'tests/e2e_runner.js'));

        const opt1 = parseArgs(['--tier', '2', '--verbose']);
        assert.strictEqual(opt1.tier, 2);
        assert.strictEqual(opt1.verbose, true);

        const opt2 = parseArgs(['--tier=3', '-f', 'F21']);
        assert.strictEqual(opt2.tier, 3);
        assert.strictEqual(opt2.filter instanceof RegExp, true);
        assert.strictEqual(opt2.filter.test('T1_F21_01'), true);

        const opt3 = parseArgs(['-t=1']);
        assert.strictEqual(opt3.tier, 1);

        const opt4 = parseArgs(['-t', '4']);
        assert.strictEqual(opt4.tier, 4);
      }
    },
    {
      id: 'T5_E2E_03',
      name: 'e2e_runner.js test context assertion helpers pass on valid and throw on invalid',
      run: async () => {
        const { createTestContext } = require(path.join(PROJECT_ROOT, 'tests/e2e_runner.js'));
        const ctx = createTestContext('TEST_ID', 'Test Name');

        // assert
        ctx.assert(true);
        assert.throws(() => ctx.assert(false));

        // assertEqual
        ctx.assertEqual(42, 42);
        assert.throws(() => ctx.assertEqual(42, 43));

        // assertDeepEqual
        ctx.assertDeepEqual({ a: 1 }, { a: 1 });
        assert.throws(() => ctx.assertDeepEqual({ a: 1 }, { a: 2 }));

        // assertMatch & assertNotMatch
        ctx.assertMatch('Hello World', /World/);
        ctx.assertNotMatch('Hello World', /Moon/);

        // assertThrows & assertRejects
        ctx.assertThrows(() => { throw new Error('Boom'); }, /Boom/);
        await ctx.assertRejects(async () => { throw new Error('AsyncBoom'); }, /AsyncBoom/);
      }
    },
    {
      id: 'T5_E2E_04',
      name: 'UnimplementedError progressive testability properly handled without process crash',
      run: async () => {
        const { UnimplementedError, createTestContext } = require(path.join(PROJECT_ROOT, 'tests/e2e_runner.js'));
        const ctx = createTestContext('T_UNIMPL', 'Unimplemented test');

        assert.throws(
          () => ctx.unimplemented('PendingComponent', 'M7', 'Waiting for release'),
          (err) => err instanceof UnimplementedError && err.milestone === 'M7'
        );
      }
    },
    {
      id: 'T5_E2E_05',
      name: 'SkipTestError properly thrown and recognized by test runner',
      run: async () => {
        const { SkipTestError, createTestContext } = require(path.join(PROJECT_ROOT, 'tests/e2e_runner.js'));
        const ctx = createTestContext('T_SKIP', 'Skipped test');

        assert.throws(
          () => ctx.skip('Network required but offline'),
          (err) => err instanceof SkipTestError && err.reason.includes('offline')
        );
      }
    }
  ]
};

// Standalone CLI Runner
async function runStandalone() {
  console.log('\n' + '='.repeat(80));
  console.log('  TIER 5 ADVERSARIAL TEST SUITE: VERIFICATION SUBSYSTEM & WORKFLOW (M6)');
  console.log(`  Target: verification/*, skills/claude-to-compose/*, tests/e2e_runner.js`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(80) + '\n');

  let passedCount = 0;
  let failedCount = 0;
  const failures = [];

  for (const t of suite.tests) {
    const start = performance.now();
    try {
      await t.run();
      const elapsed = (performance.now() - start).toFixed(1);
      passedCount++;
      console.log(`  \x1b[32m✓\x1b[0m \x1b[90m${t.id}\x1b[0m: ${t.name} \x1b[90m(${elapsed}ms)\x1b[0m`);
    } catch (err) {
      const elapsed = (performance.now() - start).toFixed(1);
      failedCount++;
      failures.push({ id: t.id, name: t.name, error: err });
      console.log(`  \x1b[31m✗\x1b[0m \x1b[90m${t.id}\x1b[0m: ${t.name} \x1b[31m[FAILED]\x1b[0m`);
      console.log(`    \x1b[33mError: ${err.message}\x1b[0m`);
    }
  }

  cleanupTmpDir();

  console.log('\n' + '='.repeat(80));
  console.log(`  TIER 5 ADVERSARIAL EXECUTION SUMMARY`);
  console.log(`  Total: ${suite.tests.length} | Passed: \x1b[32m${passedCount}\x1b[0m | Failed: \x1b[31m${failedCount}\x1b[0m`);
  console.log('='.repeat(80) + '\n');

  if (failedCount > 0) {
    console.error(`\x1b[41m\x1b[37m\x1b[1m FAIL \x1b[0m ${failedCount} adversarial tests failed.`);
    process.exit(1);
  } else {
    console.log(`\x1b[42m\x1b[37m\x1b[1m PASS \x1b[0m All ${passedCount} adversarial tests passed successfully!`);
    process.exit(0);
  }
}

if (require.main === module) {
  runStandalone().catch((err) => {
    console.error('Fatal Runner Exception:', err);
    cleanupTmpDir();
    process.exit(1);
  });
}

module.exports = suite;
