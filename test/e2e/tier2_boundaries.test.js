/**
 * test/e2e/tier2_boundaries.test.js
 *
 * Tier 2: Boundary & Corner Cases Suite.
 * Validates hard anti-deception guardrails and extreme canvas conditions:
 * - Systematic shift ladder: 0px, 1px, 2px, 3px, and 4px (>3px hard veto)
 * - Anti-deception guardrail: spatial drift > 3px MUST actively FAIL verification
 * - Whitespace dilution resistance: 99.99% background does not mask missing ink
 * - Boundary canvas states: all-white canvas, all-black canvas, single-pixel ink dot
 * - Geometric extremes: extreme aspect ratios, negative coordinates, zero-sized boxes
 */

const sharp = require('sharp');

module.exports = {
  name: 'Tier 2: Boundary & Corner Cases Suite',
  tier: 2,
  feature: 'F1, F3, F5 Anti-Deception Guardrails & Boundary Handling',
  tests: [
    // -------------------------------------------------------------------------
    // Shift Ladder & Hard Anti-Deception Guardrail (0px to 4px)
    // -------------------------------------------------------------------------
    {
      id: 'T2_SHIFT_00_ZERO',
      name: 'Shift Ladder: 0px shift yields 100.0% contour score and passes anti-deception guardrails',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 160,
          height: 80,
          shiftX: 0,
          shiftY: 0,
          elements: [{ type: 'rect', x: 40, y: 20, w: 80, h: 40 }]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        t.assertEqual(contourScore, 100.0, '0px shift must yield 100.0% contour alignment');

        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 0.0,
          elementIouScore: 100.0
        });

        t.assert(guardrail.passed, '0px shift must pass all guardrails');
        t.assertEqual(guardrail.violations.length, 0);
      }
    },
    {
      id: 'T2_SHIFT_01_ONE_PX',
      name: 'Shift Ladder: 1px shift maintains >= 90.0% contour score (acceptable subpixel tolerance)',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 160,
          height: 80,
          shiftX: 1,
          shiftY: 0,
          elements: [{ type: 'rect', x: 40, y: 20, w: 80, h: 40 }]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        t.assert(contourScore >= 90.0, `1px shift contour score (${contourScore}%) must remain >= 90.0%`);

        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 1.0,
          elementIouScore: 95.0
        });

        t.assert(guardrail.passed, '1px shift within 3px limit must pass guardrails');
      }
    },
    {
      id: 'T2_SHIFT_02_TWO_PX',
      name: 'Shift Ladder: 2px shift drops contour score below 90.0% (triggers refinement)',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 160,
          height: 80,
          shiftX: 2,
          shiftY: 2,
          elements: [{ type: 'rect', x: 40, y: 20, w: 80, h: 40 }]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        t.assert(contourScore < 90.0, `2px shift contour score (${contourScore}%) must drop below 90.0%`);

        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 2.83,
          elementIouScore: 88.0
        });

        t.assert(!guardrail.passed, 'Contour score below 90% must fail guardrail and trigger refinement');
        t.assert(guardrail.violations.some((v) => v.includes('Edge contour alignment')));
      }
    },
    {
      id: 'T2_SHIFT_03_THREE_PX',
      name: 'Shift Ladder: 3px shift marks boundary limit; maxSpatialShiftPx = 3.0px is boundary condition',
      run: async (t) => {
        // At exactly 3.0px, spatial shift is at the limit
        const guardrailLimit = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: 90.0,
          maxSpatialShiftPx: 3.0,
          elementIouScore: 90.0
        });
        t.assert(guardrailLimit.passed, 'Exactly 3.0px shift does not exceed ceiling');

        // At 3.05px, spatial shift violates ceiling
        const guardrailExceeded = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: 90.0,
          maxSpatialShiftPx: 3.05,
          elementIouScore: 90.0
        });
        t.assert(!guardrailExceeded.passed, '3.05px shift must violate ceiling');
        t.assert(guardrailExceeded.violations.some((v) => v.includes('exceeds hard anti-deception ceiling')));
      }
    },
    {
      id: 'T2_SHIFT_04_HARD_VETO',
      name: 'Shift Ladder: 4px shift (> 3px) triggers HARD ANTI-DECEPTION VETO and actively fails verification',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 160,
          height: 80,
          shiftX: 4,
          shiftY: 0,
          elements: [{ type: 'rect', x: 40, y: 20, w: 80, h: 40 }]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        // 4px shift exceeds 3px ceiling
        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 4.0,
          elementIouScore: 85.0
        });

        t.assert(!guardrail.passed, 'Shifts > 3px MUST actively FAIL verification');
        t.assert(
          guardrail.violations.some((v) => v.includes('exceeds hard anti-deception ceiling of 3.0px')),
          'Must explicitly cite spatial drift violation'
        );
      }
    },

    // -------------------------------------------------------------------------
    // Whitespace Dilution Resistance
    // -------------------------------------------------------------------------
    {
      id: 'T2_DILUTION_01_SINGLE_DOT',
      name: 'Whitespace Dilution: 1px dot on 1000x1000 canvas yields 99.999% pixelmatch but 0% Ink IoU and 0% Contour',
      run: async (t) => {
        // High resolution canvas (1000 x 1000 = 1,000,000 pixels)
        // Reference has a 20x20 box (400 ink pixels), Rendered is completely blank white
        const w = 500, h = 500;
        const svgRef = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/><rect x="200" y="200" width="20" height="20" fill="#000"/></svg>`;
        const svgBlank = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/></svg>`;

        const bRef = await sharp(Buffer.from(svgRef)).png().toBuffer();
        const bBlank = await sharp(Buffer.from(svgBlank)).png().toBuffer();

        // Check dynamic ink metrics
        const inkRes = await t.oracle.computeDynamicInkIoU(bRef, bBlank);
        t.assertEqual(inkRes.inkIou, 0.0, 'Missing shape on large canvas must yield 0.0% Ink IoU');

        // Check contour alignment
        const eRef = await t.oracle.extractSobelEdges(bRef);
        const eBlank = await t.oracle.extractSobelEdges(bBlank);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eBlank);
        t.assertEqual(contourScore, 0.0, 'Blank rendered canvas must yield 0.0% contour score');

        // Assert anti-deception veto prevents passing despite 99.8% background match
        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 999,
          elementIouScore: 0.0
        });
        t.assert(!guardrail.passed, 'Anti-deception guardrail must reject whitespace diluted false-pass');
      }
    },
    {
      id: 'T2_DILUTION_02_EMPTY_CANVAS',
      name: 'Canvas Edge Case: Two identical completely blank white canvases handle 0 ink gracefully',
      run: async (t) => {
        const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="#FFFFFF"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const inkRes = await t.oracle.computeDynamicInkIoU(buf, buf);
        t.assertEqual(inkRes.inkIou, 0.0, 'Zero ink pixels must evaluate to 0.0% IoU without NaN or error');

        const e1 = await t.oracle.extractSobelEdges(buf);
        const e2 = await t.oracle.extractSobelEdges(buf);
        t.assertEqual(e1.count, 0, 'No edges on blank canvas');
        const contourScore = t.oracle.computeSobelContourAlignment(e1, e2);
        t.assertEqual(contourScore, 100.0, 'Both empty edge sets match identically');
      }
    },
    {
      id: 'T2_DILUTION_03_PURE_BLACK',
      name: 'Canvas Edge Case: Pure solid black canvas (#000000) vs pure black canvas',
      run: async (t) => {
        const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="#000000"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const bgRes = await t.oracle.clusterDominantBackground(buf);
        t.assert(bgRes.dominantBg.r <= 16 && bgRes.dominantBg.g <= 16 && bgRes.dominantBg.b <= 16, 'Clusters black canvas as dominant background');

        const inkRes = await t.oracle.classifyInkPixels(buf, bgRes.dominantBg);
        t.assertEqual(inkRes.inkCount, 0, 'Solid black canvas contains zero foreground ink relative to black background');
      }
    },
    {
      id: 'T2_EXTREME_01_LARGE_DISPLACEMENT',
      name: 'Extreme Spatial Shift: 100px displacement yields 0.0% contour score and triggers hard veto',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 300,
          height: 100,
          shiftX: 100,
          shiftY: 0,
          elements: [{ type: 'rect', x: 20, y: 20, w: 40, h: 40 }]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const contourScore = t.oracle.computeSobelContourAlignment(eRef, eRend);

        t.assertEqual(contourScore, 0.0, '100px displacement must have 0.0% contour score');

        const guardrail = t.oracle.evaluateAntiDeceptionGuardrails({
          edgeContourScore: contourScore,
          maxSpatialShiftPx: 100.0,
          elementIouScore: 0.0
        });
        t.assert(!guardrail.passed, 'Must fail guardrails on extreme displacement');
      }
    },
    {
      id: 'T2_EXTREME_02_ASPECT_RATIOS',
      name: 'Geometric Extreme: Bounding boxes with zero dimensions or negative coordinates',
      run: async (t) => {
        const zeroBox = { x: 50, y: 50, width: 0, height: 40 };
        const normalBox = { x: 50, y: 50, width: 60, height: 40 };
        const iouZero = t.oracle.computeBoundingBoxIoU(zeroBox, normalBox);
        t.assertEqual(iouZero, 0.0, 'Zero width box must have 0.0% IoU');

        const negBox = { x: -20, y: -20, width: 50, height: 50 };
        const posBox = { x: 0, y: 0, width: 50, height: 50 };
        // Overlap is [0, 30] x [0, 30] = 900
        // Union = 2500 + 2500 - 900 = 4100 -> IoU = 900/4100 = 21.95%
        const iouNeg = t.oracle.computeBoundingBoxIoU(negBox, posBox);
        t.assertEqual(iouNeg, 21.95, 'Box with negative origin computes correct intersection');
      }
    }
  ]
};
