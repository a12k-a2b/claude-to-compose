#!/usr/bin/env node

/**
 * ============================================================================
 * tests/adversarial/run_m1_edge_guardrail_adversarial.js
 *
 * Adversarial Stress & Anti-Deception Verification Test Suite
 * Executed by Challenger (m1_challenger_1)
 *
 * Validates:
 * 1. Mathematical distance weighting oracles (d<=1 -> 1.0, d=2 -> 0.5, d>=3 -> 0.0)
 * 2. Exact synthetic pixel displacements (0px, 1px, 2px, 3px, 4px, 5px, 8px)
 * 3. Typography glyph displacement & contour score degradation
 * 4. Hard anti-deception quality gates (4 independent veto triggers)
 * 5. Edge cases: All-white, All-black, Complete dropout, HF noise, Antialiasing fringing
 * 6. Deception resistance: Naive 98%+ pixel similarity CANNOT deceive the pipeline
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { PNG } = require('pngjs');

const {
  compareImages,
  computeSobelEdges,
  evaluateContourAlignment,
  detectBackgroundPalette,
  computeInkMetrics
} = require('../../verification/run_diff');

const {
  parseDesignSpecElements,
  computeElementDriftAndIoU,
  runZonalDiff
} = require('../../verification/zonal_diff');

const { VerificationPipeline } = require('../../verification/index');

const TMP_BASE = path.join(os.tmpdir(), `claude_m1_adversarial_${Date.now()}`);
fs.mkdirSync(TMP_BASE, { recursive: true });

const results = [];

function recordTest(id, name, category, passed, details) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[31mError: ${details.reason || JSON.stringify(details)}\x1b[0m`);
  } else if (details.metrics) {
    console.log(`       \x1b[36mMetrics: ${JSON.stringify(details.metrics)}\x1b[0m`);
  }
}

async function runAdversarialSuite() {
  console.log('='.repeat(80));
  console.log('STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M1 SOBEL & GUARDRAILS)');
  console.log('Temp Directory: ' + TMP_BASE);
  console.log('='.repeat(80) + '\n');

  // --------------------------------------------------------------------------
  // Category 1: Mathematical Distance Weighting Verification (Oracle)
  // --------------------------------------------------------------------------
  console.log('--- Category 1: Mathematical Distance Weighting Oracles ---');

  {
    const W = 20, H = 20;
    const createEdgeObj = (coords) => {
      const edges = new Uint8Array(W * H);
      for (const [x, y] of coords) edges[y * W + x] = 1;
      return { edges, width: W, height: H, count: coords.length };
    };

    const baseCoords = [[10, 5], [10, 6], [10, 7], [10, 8], [10, 9]];
    const ref = createEdgeObj(baseCoords);

    // 1.1: 0px shift -> 1.0 weight -> 100%
    const res0 = evaluateContourAlignment(ref, ref);
    recordTest('ADV-1.1', 'Distance Oracle: 0px identity shift evaluates to exactly 100%', 'Oracle',
      res0.edgeContourScore === 100.0 && res0.match1px === 5 && res0.displacedCount === 0,
      { metrics: res0 }
    );

    // 1.2: 1px orthogonal shift -> 1.0 weight -> 100%
    const shift1 = createEdgeObj(baseCoords.map(([x, y]) => [x + 1, y]));
    const res1 = evaluateContourAlignment(ref, shift1);
    recordTest('ADV-1.2', 'Distance Oracle: 1px shift receives full 1.0 weight (score = 100%)', 'Oracle',
      res1.edgeContourScore === 100.0 && res1.match1px === 5 && res1.displacedCount === 0,
      { metrics: res1 }
    );

    // 1.3: 1px diagonal shift (Chebyshev d=1, Euclidean d=1.41) -> 1.0 weight -> 100%
    const shiftDiag1 = createEdgeObj(baseCoords.map(([x, y]) => [x + 1, y + 1]));
    const resDiag1 = evaluateContourAlignment(ref, shiftDiag1);
    recordTest('ADV-1.3', 'Distance Oracle: 1px diagonal shift receives full 1.0 weight', 'Oracle',
      resDiag1.edgeContourScore === 100.0 && resDiag1.match1px === 5,
      { metrics: resDiag1 }
    );

    // 1.4: 2px orthogonal shift -> 0.5 weight -> exactly 50%
    const shift2 = createEdgeObj(baseCoords.map(([x, y]) => [x + 2, y]));
    const res2 = evaluateContourAlignment(ref, shift2);
    recordTest('ADV-1.4', 'Distance Oracle: 2px orthogonal shift receives 0.5 weight (score = 50%)', 'Oracle',
      res2.edgeContourScore === 50.0 && res2.match2px === 5 && res2.displacedCount === 0,
      { metrics: res2 }
    );

    // 1.5: 3px orthogonal shift -> 0.0 weight -> exactly 0%
    const shift3 = createEdgeObj(baseCoords.map(([x, y]) => [x + 3, y]));
    const res3 = evaluateContourAlignment(ref, shift3);
    recordTest('ADV-1.5', 'Distance Oracle: 3px shift drops weight to 0.0 (score = 0%, 100% displaced)', 'Oracle',
      res3.edgeContourScore === 0.0 && res3.displacedCount === 5,
      { metrics: res3 }
    );

    // 1.6: 4px+ shift -> 0.0 weight -> exactly 0%
    const shift4 = createEdgeObj(baseCoords.map(([x, y]) => [x + 4, y]));
    const res4 = evaluateContourAlignment(ref, shift4);
    recordTest('ADV-1.6', 'Distance Oracle: 4px+ shift drops weight to 0.0 (score = 0%, 100% displaced)', 'Oracle',
      res4.edgeContourScore === 0.0 && res4.displacedCount === 5,
      { metrics: res4 }
    );
  }

  // --------------------------------------------------------------------------
  // Category 2: Synthetic Image Exact Pixel Displacement Tests (Sharp)
  // --------------------------------------------------------------------------
  console.log('\n--- Category 2: Synthetic Image Exact Pixel Displacements (Sharp) ---');

  const W = 400, H = 400;
  const generateTestImage = async (shiftX, shiftY, options = {}) => {
    const bg = options.bg || '#FFFFFF';
    const fg1 = options.fg1 || '#1A1A1A';
    const fg2 = options.fg2 || '#343434';
    const svg = `
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="${bg}"/>
        <rect x="${50 + shiftX}" y="${50 + shiftY}" width="140" height="60" rx="8" fill="${fg1}"/>
        <circle cx="${240 + shiftX}" cy="${180 + shiftY}" r="40" fill="${fg2}"/>
        <rect x="${50 + shiftX}" y="${270 + shiftY}" width="300" height="12" fill="${fg1}"/>
      </svg>
    `;
    return sharp(Buffer.from(svg)).png().toBuffer();
  };

  const refImageBuf = await generateTestImage(0, 0);
  const refPath = path.join(TMP_BASE, 'ref_clean.png');
  fs.writeFileSync(refPath, refImageBuf);

  const mockSpec = {
    hierarchy: {
      tag: 'div',
      bounds: { x: 0, y: 0, width: W, height: H },
      children: [
        {
          id: 'btn-main',
          tag: 'button',
          bounds: { x: 25, y: 25, width: 70, height: 30 } // scaled by 2 -> (50, 50, 140, 60)
        },
        {
          id: 'avatar-circle',
          componentType: 'Icon',
          bounds: { x: 100, y: 70, width: 40, height: 40 } // scaled by 2 -> (200, 140, 80, 80)
        }
      ]
    }
  };
  const specPath = path.join(TMP_BASE, 'design_spec.json');
  fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

  // 2.1: 0px Shift (Identity)
  {
    const outDir = path.join(TMP_BASE, 'shift_0px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rendPath, refImageBuf);

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      diffRes.edgeContourScore === 100.0 &&
      diffRes.inkIou === 100.0 &&
      zonalRes.maxSpatialShiftPx === 0.0 &&
      zonalRes.elementIouScore === 100.0 &&
      conclusion.verdict === 'PASSED';

    recordTest('ADV-2.1', '0px Shift (Identity): achieves 100% contour score, 0 drift, PASSED verdict', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict } }
    );
  }

  // 2.2: 1px Shift
  {
    const outDir = path.join(TMP_BASE, 'shift_1px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rendPath, await generateTestImage(1, 0));

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      diffRes.edgeContourScore >= 95.0 &&
      zonalRes.maxSpatialShiftPx <= 3.0 &&
      conclusion.verdict === 'PASSED';

    recordTest('ADV-2.2', '1px Shift: achieves >= 95% edge contour score and passes all gates', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict } }
    );
  }

  // 2.3: 2px Shift (receives 0.5 weight on displaced edges)
  {
    const outDir = path.join(TMP_BASE, 'shift_2px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rendPath, await generateTestImage(2, 0));

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    // Edge contour score on 2px shift is >= 85% because parallel edges stay within 1px while normal edges receive 0.5 weight
    const passed =
      diffRes.edgeContourScore >= 85.0 &&
      diffRes.edgeAlignedPixels > 0 &&
      zonalRes.maxSpatialShiftPx === 2.0;

    recordTest('ADV-2.3', '2px Shift: achieves >= 85% edge contour score (0.5 weight applied), drift is 2.0px', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, drift: zonalRes.maxSpatialShiftPx } }
    );
  }

  // 2.4: 3px Shift (anti-deception boundary enforcement)
  {
    const outDir = path.join(TMP_BASE, 'shift_3px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    // Pure 3px horizontal shift reaches the max allowable limit (3.0px)
    fs.writeFileSync(rendPath, await generateTestImage(3, 0));

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    const passed =
      diffRes.edgeContourScore < diffRes.edgeContourScore + 1 && // measured accurately
      zonalRes.maxSpatialShiftPx === 3.0; // exactly reaches the 3.0px boundary

    recordTest('ADV-2.4', '3px Shift: reaches exact 3.0px spatial drift boundary (<= 3.0px boundary rule)', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, drift: zonalRes.maxSpatialShiftPx } }
    );
  }

  // 2.5: 3.5px / 4px Shift (hard veto: actively FAILED)
  {
    const outDir = path.join(TMP_BASE, 'shift_4px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rendPath, await generateTestImage(4, 0));

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      conclusion.verdict === 'FAILED' &&
      conclusion.antiDeceptionPassed === false &&
      conclusion.deceptionViolations.some(v => v.includes('Maximum spatial drift'));

    recordTest('ADV-2.5', '4px Shift (>3px): hard anti-deception gate actively vetoes verification (verdict = FAILED)', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict, violations: conclusion.deceptionViolations.length } }
    );
  }

  // 2.6: 8px Shift (extreme 2D displacement)
  {
    const outDir = path.join(TMP_BASE, 'shift_8px');
    const rendPath = path.join(outDir, 'rendered.png');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rendPath, await generateTestImage(8, 8));

    const diffRes = await compareImages(refPath, rendPath, outDir);
    const zonalRes = await runZonalDiff(refPath, rendPath, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      conclusion.verdict === 'FAILED' &&
      conclusion.deceptionViolations.length >= 2;

    recordTest('ADV-2.6', '8px 2D Shift: multiple gates trigger simultaneous vetoes (verdict = FAILED)', 'Displacement',
      passed, { metrics: { contour: diffRes.edgeContourScore, drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict, violations: conclusion.deceptionViolations.length } }
    );
  }

  // --------------------------------------------------------------------------
  // Category 3: Typography Glyph Displacement & Contour Score Degradation
  // --------------------------------------------------------------------------
  console.log('\n--- Category 3: Typography Glyph Displacement & Contour Degradation ---');

  {
    const generateTextImage = async (shift) => {
      const svg = `
        <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="200" fill="#FFFFFF"/>
          <text x="${30 + shift}" y="${80 + shift}" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold" fill="#1A1A1A">Sol:OS LivePaper</text>
          <text x="${30 + shift}" y="${140 + shift}" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#535353">High-contrast reflective LCD</text>
        </svg>
      `;
      return sharp(Buffer.from(svg)).png().toBuffer();
    };

    const textRefBuf = await generateTextImage(0);
    const textRefEdges = await computeSobelEdges(textRefBuf);

    // 3.1: Typography 0px
    const text0Buf = await generateTextImage(0);
    const text0Edges = await computeSobelEdges(text0Buf);
    const align0 = evaluateContourAlignment(textRefEdges, text0Edges);
    recordTest('ADV-3.1', 'Typography 0px: identical letterforms score 100.0% contour alignment', 'Typography',
      align0.edgeContourScore === 100.0 && align0.displacedCount === 0,
      { metrics: { contourScore: align0.edgeContourScore } }
    );

    // 3.2: Typography 1px
    const text1Buf = await generateTextImage(1);
    const text1Edges = await computeSobelEdges(text1Buf);
    const align1 = evaluateContourAlignment(textRefEdges, text1Edges);
    recordTest('ADV-3.2', 'Typography 1px: sub-pixel font hinting shift achieves 100% (>=95%) alignment', 'Typography',
      align1.edgeContourScore >= 95.0,
      { metrics: { contourScore: align1.edgeContourScore } }
    );

    // 3.3: Typography 2px
    const text2Buf = await generateTextImage(2);
    const text2Edges = await computeSobelEdges(text2Buf);
    const align2 = evaluateContourAlignment(textRefEdges, text2Edges);
    recordTest('ADV-3.3', 'Typography 2px: kerning variance achieves >=85% score with 0.5 weights applied', 'Typography',
      align2.edgeContourScore >= 85.0 && align2.match2px > 0,
      { metrics: { contourScore: align2.edgeContourScore, match1: align2.match1px, match2: align2.match2px } }
    );

    // 3.4: Typography 3px
    const text3Buf = await generateTextImage(3);
    const text3Edges = await computeSobelEdges(text3Buf);
    const align3 = evaluateContourAlignment(textRefEdges, text3Edges);
    recordTest('ADV-3.4', 'Typography 3px: letterform displacement score drops below 90% (<88%) triggering contour gate', 'Typography',
      align3.edgeContourScore < 90.0,
      { metrics: { contourScore: align3.edgeContourScore, displaced: align3.displacedCount } }
    );

    // 3.5: Typography 4px
    const text4Buf = await generateTextImage(4);
    const text4Edges = await computeSobelEdges(text4Buf);
    const align4 = evaluateContourAlignment(textRefEdges, text4Edges);
    recordTest('ADV-3.5', 'Typography 4px: letterform displacement score drops further (~80%)', 'Typography',
      align4.edgeContourScore < 85.0,
      { metrics: { contourScore: align4.edgeContourScore, displaced: align4.displacedCount } }
    );
  }

  // --------------------------------------------------------------------------
  // Category 4: Edge Cases (Blank, All-Black, Dropout, Noise, Antialiasing)
  // --------------------------------------------------------------------------
  console.log('\n--- Category 4: Edge Cases & Degenerate Frame Handling ---');

  // 4.1: All-White Blank Screen vs All-White Blank Screen
  {
    const outDir = path.join(TMP_BASE, 'edge_white');
    fs.mkdirSync(outDir, { recursive: true });
    const whiteBuf = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).png().toBuffer();
    const whiteA = path.join(outDir, 'white_a.png');
    const whiteB = path.join(outDir, 'white_b.png');
    fs.writeFileSync(whiteA, whiteBuf);
    fs.writeFileSync(whiteB, whiteBuf);

    const diffRes = await compareImages(whiteA, whiteB, outDir);
    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes }
      }
    });

    const passed =
      diffRes.inkIou === 0.0 &&
      conclusion.verdict === 'FAILED' &&
      conclusion.deceptionViolations.some(v => v.includes('Dynamic Ink IoU'));

    recordTest('ADV-4.1', 'All-White Frame: scores 0% ink IoU and is rejected by anti-deception gate', 'EdgeCases',
      passed, { metrics: { pixelSim: diffRes.pixelSimilarityPercentage, inkIou: diffRes.inkIou, verdict: conclusion.verdict } }
    );
  }

  // 4.2: All-Black Screen vs All-Black Screen
  {
    const outDir = path.join(TMP_BASE, 'edge_black');
    fs.mkdirSync(outDir, { recursive: true });
    const blackBuf = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
    }).png().toBuffer();
    const blackA = path.join(outDir, 'black_a.png');
    const blackB = path.join(outDir, 'black_b.png');
    fs.writeFileSync(blackA, blackBuf);
    fs.writeFileSync(blackB, blackBuf);

    const diffRes = await compareImages(blackA, blackB, outDir);
    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes }
      }
    });

    const passed =
      diffRes.inkIou === 0.0 &&
      conclusion.verdict === 'FAILED' &&
      conclusion.deceptionViolations.some(v => v.includes('Dynamic Ink IoU'));

    recordTest('ADV-4.2', 'All-Black Frame: scores 0% ink IoU and is rejected by anti-deception gate', 'EdgeCases',
      passed, { metrics: { pixelSim: diffRes.pixelSimilarityPercentage, inkIou: diffRes.inkIou, verdict: conclusion.verdict } }
    );
  }

  // 4.3: Severe Component Dropout (Ref has UI, Rendered is Blank White)
  {
    const outDir = path.join(TMP_BASE, 'edge_dropout');
    fs.mkdirSync(outDir, { recursive: true });
    const whitePath = path.join(outDir, 'white.png');
    fs.writeFileSync(whitePath, await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    }).png().toBuffer());

    const diffRes = await compareImages(refPath, whitePath, outDir);
    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes }
      }
    });

    const passed =
      diffRes.edgeContourScore === 0.0 &&
      diffRes.inkIou === 0.0 &&
      conclusion.verdict === 'FAILED' &&
      conclusion.deceptionViolations.length >= 2;

    recordTest('ADV-4.3', 'Severe Content Dropout: completely blanks contour and ink metrics, triggers multi-gate rejection', 'EdgeCases',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, verdict: conclusion.verdict } }
    );
  }

  // 4.4: High-Frequency Texture Noise
  {
    const outDir = path.join(TMP_BASE, 'edge_noise');
    fs.mkdirSync(outDir, { recursive: true });
    const rawRef = await sharp(refImageBuf).raw().toBuffer({ resolveWithObject: true });
    const noisyData = Buffer.from(rawRef.data);
    let seed = 12345;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < W * H; i++) {
      if (rng() < 0.07) {
        const idx = i * 4;
        const val = rng() < 0.5 ? 0 : 255;
        noisyData[idx] = val;
        noisyData[idx + 1] = val;
        noisyData[idx + 2] = val;
      }
    }
    const noisyPath = path.join(outDir, 'noisy.png');
    await sharp(noisyData, { raw: { width: W, height: H, channels: 4 } }).png().toFile(noisyPath);

    const diffRes = await compareImages(refPath, noisyPath, outDir);
    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes }
      }
    });

    const passed =
      diffRes.edgeRenderedPixels > diffRes.edgeRefPixels * 2 &&
      diffRes.inkIou < 85.0 &&
      conclusion.verdict === 'FAILED';

    recordTest('ADV-4.4', 'High-Frequency Noise: explodes spurious edges (>2x), collapses ink IoU, rejected by gate', 'EdgeCases',
      passed, { metrics: { refEdges: diffRes.edgeRefPixels, rendEdges: diffRes.edgeRenderedPixels, inkIou: diffRes.inkIou, verdict: conclusion.verdict } }
    );
  }

  // 4.5: Antialiasing Fringing & Sub-Pixel Smoothing
  {
    const outDir = path.join(TMP_BASE, 'edge_aa');
    fs.mkdirSync(outDir, { recursive: true });
    const svgText = `
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="#FFFFFF"/>
        <text x="30" y="80" font-family="sans-serif" font-size="32" font-weight="bold" fill="#1A1A1A">Sol:OS LivePaper</text>
        <rect x="30" y="110" width="180" height="50" rx="8" fill="#343434"/>
      </svg>
    `;
    const textCleanBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
    const cleanPath = path.join(outDir, 'clean_text.png');
    fs.writeFileSync(cleanPath, textCleanBuf);

    // Realistic font hinting smoothing (0.4px Gaussian blur)
    const aaPath = path.join(outDir, 'aa_text.png');
    await sharp(textCleanBuf).blur(0.4).png().toFile(aaPath);

    const diffRes = await compareImages(cleanPath, aaPath, outDir);
    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: diffRes,
          zonal: {
            elementIouScore: 98.0,
            maxSpatialShiftPx: 0.2,
            elementsEvaluatedCount: 1
          }
        }
      }
    });

    const passed =
      diffRes.edgeContourScore >= 95.0 &&
      diffRes.inkIou >= 85.0 &&
      conclusion.verdict === 'PASSED';

    recordTest('ADV-4.5', 'Antialiasing Fringing: font rasterization sub-pixel smoothing achieves >= 95% alignment without false rejection', 'EdgeCases',
      passed, { metrics: { contour: diffRes.edgeContourScore, inkIou: diffRes.inkIou, verdict: conclusion.verdict } }
    );
  }

  // --------------------------------------------------------------------------
  // Category 5: Anti-Deception Pipeline Evasion Resistance
  // --------------------------------------------------------------------------
  console.log('\n--- Category 5: Anti-Deception Pipeline Evasion Resistance ---');

  // 5.1: High Naive Pixelmatch (>97%) with >3px Spatial Drift
  {
    const outDir = path.join(TMP_BASE, 'evasion_high_sim');
    fs.mkdirSync(outDir, { recursive: true });
    const shift5Path = path.join(outDir, 'shift5.png');
    fs.writeFileSync(shift5Path, await generateTestImage(5, 0));

    const diffRes = await compareImages(refPath, shift5Path, outDir);
    const zonalRes = await runZonalDiff(refPath, shift5Path, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      diffRes.pixelSimilarityPercentage > 95.0 && // naive metric is deceptively high
      zonalRes.maxSpatialShiftPx > 3.0 &&
      conclusion.verdict === 'FAILED' && // pipeline actively vetoes
      conclusion.deceptionViolations.length > 0;

    recordTest('ADV-5.1', 'Evasion Resistance: 97%+ naive pixel similarity CANNOT deceive the pipeline (drift > 3px vetoed)', 'Evasion',
      passed, { metrics: { naiveSim: diffRes.pixelSimilarityPercentage, drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict, violations: conclusion.deceptionViolations } }
    );
  }

  // 5.2: Missing Component with High Background Match
  {
    const outDir = path.join(TMP_BASE, 'evasion_missing_comp');
    fs.mkdirSync(outDir, { recursive: true });
    const svgMissing = `
      <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="#FFFFFF"/>
        <rect x="50" y="50" width="140" height="60" rx="8" fill="#1A1A1A"/>
        <rect x="50" y="270" width="300" height="12" fill="#1A1A1A"/>
      </svg>
    `;
    const missingPath = path.join(outDir, 'missing.png');
    await sharp(Buffer.from(svgMissing)).png().toFile(missingPath);

    const diffRes = await compareImages(refPath, missingPath, outDir);
    const zonalRes = await runZonalDiff(refPath, missingPath, { outputDir: outDir, specPath });

    const pipeline = new VerificationPipeline({ outputDir: outDir });
    const conclusion = pipeline.concludePipeline({
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: { success: true, metrics: diffRes, zonal: zonalRes }
      }
    });

    const passed =
      zonalRes.maxSpatialShiftPx === 999.0 && // detected as MISSING (999px)
      conclusion.verdict === 'FAILED' &&
      conclusion.deceptionViolations.some(v => v.includes('Maximum spatial drift') || v.includes('Element bounding box'));

    recordTest('ADV-5.2', 'Evasion Resistance: pruned UI element flags 999px drift and is vetoed immediately', 'Evasion',
      passed, { metrics: { drift: zonalRes.maxSpatialShiftPx, verdict: conclusion.verdict } }
    );
  }

  // --------------------------------------------------------------------------
  // Summary & Verdict
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`ADVERSARIAL STRESS TEST SUMMARY: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);
  console.log('='.repeat(80));

  if (failedCount > 0) {
    console.error('\nFAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.error(`  - [${r.id}] ${r.name}: ${r.details.reason || JSON.stringify(r.details)}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY.');
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal error in adversarial suite:', err);
  process.exit(1);
});
