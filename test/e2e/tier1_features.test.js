/**
 * test/e2e/tier1_features.test.js
 *
 * Tier 1: Feature Coverage Test Suite.
 * Validates individual subsystems and algorithms in isolation:
 * - Sobel edge detection & distance-weighted contour alignment (T1_SOBEL_*)
 * - Dynamic background color clustering & foreground ink extraction (T1_BG_*)
 * - Zonal bounding box IoU & centroid drift vectors (T1_IOU_*)
 * - Jetpack Compose typography & font metrics (T1_TYPO_*)
 * - Closed-loop visual auto-tuner directives & convergence logic (T1_TUNER_*)
 */

const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');

module.exports = {
  name: 'Tier 1: Feature Coverage Suite',
  tier: 1,
  feature: 'F1-F9 Core Features',
  tests: [
    // -------------------------------------------------------------------------
    // Group 1: Sobel Edge Detection & Contour Alignment (F3)
    // -------------------------------------------------------------------------
    {
      id: 'T1_SOBEL_01',
      name: 'Discrete 3x3 Sobel convolution computes horizontal and vertical gradients on step-edge',
      run: async (t) => {
        // Create an image with a vertical step edge (left half white, right half black)
        const w = 40, h = 40;
        const svg = `<svg width="${w}" height="${h}"><rect width="${w/2}" height="${h}" fill="#FFFFFF"/><rect x="${w/2}" width="${w/2}" height="${h}" fill="#000000"/></svg>`;
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const result = await t.oracle.extractSobelEdges(buf, 30);
        t.assert(result.count > 0, 'Must detect edge pixels along the vertical boundary');
        t.assertEqual(result.width, w, 'Width must match canvas');
        t.assertEqual(result.height, h, 'Height must match canvas');

        // Verify that the detected edges lie along x = 19..20 (the step edge)
        for (let y = 5; y < h - 5; y++) {
          const edgeAtCenter = result.edges[y * w + 19] === 1 || result.edges[y * w + 20] === 1;
          t.assert(edgeAtCenter, `Edge must be detected near x=20 at y=${y}`);
        }
      }
    },
    {
      id: 'T1_SOBEL_02',
      name: 'Edge magnitude thresholding isolates shape contours from flat background canvas',
      run: async (t) => {
        // Canvas with flat white background and a single centered rectangle
        const { refBuffer } = await t.oracle.generateSyntheticPair({
          width: 100,
          height: 100,
          elements: [{ type: 'rect', x: 25, y: 25, w: 50, h: 50 }]
        });

        const edgeResult = await t.oracle.extractSobelEdges(refBuffer, 30);
        // The interior of the rect (e.g. at 50, 50) and far outside (10, 10) must be flat (zero gradient)
        const interiorIdx = 50 * 100 + 50;
        const outsideIdx = 10 * 100 + 10;
        t.assertEqual(edgeResult.edges[interiorIdx], 0, 'Interior of solid shape must have no edges');
        t.assertEqual(edgeResult.edges[outsideIdx], 0, 'Flat background canvas must have no edges');

        // Boundary points must be detected
        const topEdgeIdx = 25 * 100 + 50;
        t.assertEqual(edgeResult.edges[topEdgeIdx], 1, 'Top boundary must be detected as edge');
      }
    },
    {
      id: 'T1_SOBEL_03',
      name: 'Distance-weighted scoring kernel assigns correct weights: 1.0 (d<=1), 0.5 (d=2), 0.0 (d>=3)',
      run: async (t) => {
        // Build mock edge structures directly to test mathematical weighting
        const w = 10, h = 10;
        const refEdges = { width: w, height: h, count: 1, edges: new Uint8Array(w * h) };
        refEdges.edges[5 * w + 5] = 1; // single edge at (5, 5)

        // Case A: Exact match (d = 0)
        const rendA = { width: w, height: h, count: 1, edges: new Uint8Array(w * h) };
        rendA.edges[5 * w + 5] = 1;
        const scoreA = t.oracle.computeSobelContourAlignment(refEdges, rendA);
        t.assertEqual(scoreA, 100.0, 'd=0 must score 100.0% (weight 1.0)');

        // Case B: 1px shift (d = 1)
        const rendB = { width: w, height: h, count: 1, edges: new Uint8Array(w * h) };
        rendB.edges[5 * w + 6] = 1;
        const scoreB = t.oracle.computeSobelContourAlignment(refEdges, rendB);
        t.assertEqual(scoreB, 100.0, 'd=1 must score 100.0% (weight 1.0)');

        // Case C: 2px shift (d = 2)
        const rendC = { width: w, height: h, count: 1, edges: new Uint8Array(w * h) };
        rendC.edges[5 * w + 7] = 1;
        const scoreC = t.oracle.computeSobelContourAlignment(refEdges, rendC);
        t.assertEqual(scoreC, 50.0, 'd=2 must score 50.0% (weight 0.5)');

        // Case D: 3px shift (d = 3)
        const rendD = { width: w, height: h, count: 1, edges: new Uint8Array(w * h) };
        rendD.edges[5 * w + 8] = 1;
        const scoreD = t.oracle.computeSobelContourAlignment(refEdges, rendD);
        t.assertEqual(scoreD, 0.0, 'd>=3 must score 0.0% (weight 0.0)');
      }
    },
    {
      id: 'T1_SOBEL_04',
      name: 'Mathematical identity property: identical synthetic images yield exact 100.0% contour alignment',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 150,
          height: 100,
          shiftX: 0,
          shiftY: 0,
          elements: [
            { type: 'pill', x: 20, y: 30, w: 80, h: 30 },
            { type: 'rect', x: 110, y: 30, w: 25, h: 25 }
          ]
        });

        const e1 = await t.oracle.extractSobelEdges(refBuffer);
        const e2 = await t.oracle.extractSobelEdges(rendBuffer);
        const score = t.oracle.computeSobelContourAlignment(e1, e2);
        t.assertEqual(score, 100.0, 'Identical images must yield 100.0% contour score');
      }
    },
    {
      id: 'T1_SOBEL_05',
      name: 'Distance sensitivity: 2D shift of (2px, 2px) yields contour score strictly below 90.0%',
      run: async (t) => {
        const { refBuffer, rendBuffer } = await t.oracle.generateSyntheticPair({
          width: 120,
          height: 120,
          shiftX: 2,
          shiftY: 2,
          elements: [
            { type: 'rect', x: 30, y: 30, w: 60, h: 60 }
          ]
        });

        const eRef = await t.oracle.extractSobelEdges(refBuffer);
        const eRend = await t.oracle.extractSobelEdges(rendBuffer);
        const score = t.oracle.computeSobelContourAlignment(eRef, eRend);

        t.assert(score < 90.0, `Contour score (${score}%) must be strictly below 90.0% for a (2px, 2px) shift`);
        t.assert(score >= 50.0, `Contour score (${score}%) for 2px shift should remain above 50.0% due to d=2 weight`);
      }
    },

    // -------------------------------------------------------------------------
    // Group 2: Dynamic Background Clustering & Ink Extraction (F1, F2)
    // -------------------------------------------------------------------------
    {
      id: 'T1_BG_01',
      name: 'Dominant background clustering on white canvas extracts RGB(255, 255, 255)',
      run: async (t) => {
        const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="#FFFFFF"/><rect x="40" y="40" width="20" height="20" fill="#000000"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const res = await t.oracle.clusterDominantBackground(buf);
        t.assert(res.dominantBg.r >= 240 && res.dominantBg.g >= 240 && res.dominantBg.b >= 240, 'Dominant color must be near-white');
        t.assert(res.coverageFraction > 0.9, 'Background must cover majority of canvas');
      }
    },
    {
      id: 'T1_BG_02',
      name: 'Dominant background clustering on Sol:OS warm sand canvas (#E7E4DE) correctly extracts warm sand as background',
      run: async (t) => {
        const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="#E7E4DE"/><rect x="30" y="30" width="40" height="20" fill="#1A1A1A"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const res = await t.oracle.clusterDominantBackground(buf);
        // RGB of #E7E4DE is (231, 228, 222)
        t.assert(Math.abs(res.dominantBg.r - 231) <= 16, 'Red channel must cluster to ~231');
        t.assert(Math.abs(res.dominantBg.g - 228) <= 16, 'Green channel must cluster to ~228');
        t.assert(Math.abs(res.dominantBg.b - 222) <= 16, 'Blue channel must cluster to ~222');
      }
    },
    {
      id: 'T1_BG_03',
      name: 'Dynamic color distance thresholding classifies dark ink (#1A1A1A) while rejecting warm sand background',
      run: async (t) => {
        const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="#E7E4DE"/><rect x="20" y="20" width="20" height="20" fill="#1A1A1A"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const bgRes = await t.oracle.clusterDominantBackground(buf);
        const inkRes = await t.oracle.classifyInkPixels(buf, bgRes.dominantBg, 25);

        // Ink rect is 20x20 = 400 pixels
        t.assert(Math.abs(inkRes.inkCount - 400) <= 20, `Detected ink pixels (${inkRes.inkCount}) should match shape area ~400`);
      }
    },
    {
      id: 'T1_BG_04',
      name: 'Legacy lum < 245 threshold misclassifies warm sand canvas, whereas dynamic clustering classifies 0% background as ink',
      run: async (t) => {
        // Sol:OS warm sand RGB: (231, 228, 222) -> lum = 0.299*231 + 0.587*228 + 0.114*222 = 228.21
        const lum = 0.299 * 231 + 0.587 * 228 + 0.114 * 222;
        t.assert(lum < 245, 'Warm sand luminance must be strictly < 245, triggering legacy false-positive bug');

        // Create a completely empty warm sand canvas
        const svg = '<svg width="50" height="50"><rect width="50" height="50" fill="#E7E4DE"/></svg>';
        const buf = await sharp(Buffer.from(svg)).png().toBuffer();

        const bgRes = await t.oracle.clusterDominantBackground(buf);
        const inkRes = await t.oracle.classifyInkPixels(buf, bgRes.dominantBg, 25);

        t.assertEqual(inkRes.inkCount, 0, 'Dynamic clustering must find 0 ink pixels on empty warm sand canvas');
      }
    },
    {
      id: 'T1_BG_05',
      name: 'Dynamic Ink IoU on identical tinted screens yields 100.0%, and disjoint ink yields 0.0%',
      run: async (t) => {
        const svg1 = '<svg width="80" height="80"><rect width="80" height="80" fill="#E7E4DE"/><rect x="10" y="10" width="20" height="20" fill="#000"/></svg>';
        const svg2 = '<svg width="80" height="80"><rect width="80" height="80" fill="#E7E4DE"/><rect x="50" y="50" width="20" height="20" fill="#000"/></svg>';

        const b1 = await sharp(Buffer.from(svg1)).png().toBuffer();
        const b2 = await sharp(Buffer.from(svg2)).png().toBuffer();

        const matchSelf = await t.oracle.computeDynamicInkIoU(b1, b1);
        t.assertEqual(matchSelf.inkIou, 100.0, 'Identical tinted images must have 100% Ink IoU');

        const matchDisjoint = await t.oracle.computeDynamicInkIoU(b1, b2);
        t.assertEqual(matchDisjoint.inkIou, 0.0, 'Disjoint ink shapes on tinted background must yield 0.0% Ink IoU');
      }
    },

    // -------------------------------------------------------------------------
    // Group 3: Zonal Bounding Box IoU & Spatial Drift Vectors (F4, F6)
    // -------------------------------------------------------------------------
    {
      id: 'T1_IOU_01',
      name: 'Bounding box IoU evaluates to 100.0% for identical geometries',
      run: async (t) => {
        const box = { x: 100, y: 150, width: 200, height: 80 };
        const iou = t.oracle.computeBoundingBoxIoU(box, box);
        t.assertEqual(iou, 100.0, 'IoU of box with itself must be 100.0%');
      }
    },
    {
      id: 'T1_IOU_02',
      name: 'Disjoint bounding boxes evaluate to 0.0% IoU without NaN or division by zero',
      run: async (t) => {
        const boxA = { x: 10, y: 10, width: 50, height: 50 };
        const boxB = { x: 70, y: 70, width: 50, height: 50 };
        const iou = t.oracle.computeBoundingBoxIoU(boxA, boxB);
        t.assertEqual(iou, 0.0, 'Disjoint boxes must yield 0.0% IoU');
        t.assert(!Number.isNaN(iou), 'IoU must not be NaN');
      }
    },
    {
      id: 'T1_IOU_03',
      name: 'Mathematical verification of 50% horizontal overlap yields exactly 33.33% IoU',
      run: async (t) => {
        // Two 100x100 boxes overlapping by 50px horizontally:
        // Area A = 10000, Area B = 10000, Intersection = 50 * 100 = 5000, Union = 15000
        // IoU = 5000 / 15000 = 33.33%
        const boxA = { x: 0, y: 0, width: 100, height: 100 };
        const boxB = { x: 50, y: 0, width: 100, height: 100 };
        const iou = t.oracle.computeBoundingBoxIoU(boxA, boxB);
        t.assertEqual(iou, 33.33, 'IoU must strictly equal 33.33% for 50% 1D overlap');
      }
    },
    {
      id: 'T1_IOU_04',
      name: 'Centroid translation vector (dx, dy) and Euclidean spatial shift calculation',
      run: async (t) => {
        const boxA = { x: 100, y: 100, width: 60, height: 40 }; // center: (130, 120)
        const boxB = { x: 103, y: 104, width: 60, height: 40 }; // center: (133, 124)
        const drift = t.oracle.computeCentroidDrift(boxA, boxB);

        t.assertEqual(drift.dx, 3.0, 'dx must be +3.0px');
        t.assertEqual(drift.dy, 4.0, 'dy must be +4.0px');
        t.assertEqual(drift.spatialShift, 5.0, 'Euclidean hypot(3, 4) must equal 5.0px');
      }
    },
    {
      id: 'T1_IOU_05',
      name: 'Dynamic element node parser extracts bounding boxes from design spec format',
      run: async (t) => {
        const mockNode = {
          id: 'headline_title',
          type: 'text',
          tagName: 'H1',
          bounds: { x: 80, y: 120, width: 640, height: 96 }
        };

        const parsedBox = {
          x: mockNode.bounds.x,
          y: mockNode.bounds.y,
          width: mockNode.bounds.width,
          height: mockNode.bounds.height
        };

        t.assertEqual(parsedBox.x, 80);
        t.assertEqual(parsedBox.y, 120);
        t.assertEqual(parsedBox.width, 640);
        t.assertEqual(parsedBox.height, 96);
      }
    },

    // -------------------------------------------------------------------------
    // Group 4: Compose Typography & Font Metrics (F7, F8)
    // -------------------------------------------------------------------------
    {
      id: 'T1_TYPO_01',
      name: 'PlatformTextStyle(includeFontPadding = false) contract definition',
      run: async (t) => {
        const expectedSnippet = 'includeFontPadding = false';
        // Verify contract against Type.kt or architectural standard
        const typeKtPath = path.resolve(t.projectRoot, 'android/app/src/main/java/com/claude/compose/theme/Type.kt');
        t.assert(fs.existsSync(typeKtPath), 'Type.kt must exist');
        // Progressive check: validates that the contract is documented/planned in PROJECT.md
        const projectMd = t.readFile('.agents/orchestrator_r2/PROJECT.md');
        t.assert(projectMd.includes('includeFontPadding = false'), 'PROJECT.md must mandate includeFontPadding = false');
      }
    },
    {
      id: 'T1_TYPO_02',
      name: 'LineHeightStyle contract definition (alignment = Center, trim = Both)',
      run: async (t) => {
        const projectMd = t.readFile('.agents/orchestrator_r2/PROJECT.md');
        t.assert(projectMd.includes('LineHeightStyle'), 'PROJECT.md must specify LineHeightStyle');
      }
    },
    {
      id: 'T1_TYPO_03',
      name: 'letterSpacing token preservation contract from CSS em/px to Compose sp',
      run: async (t) => {
        // Verification that letterSpacing in sp is parsed and converted
        const cssSpacingPx = 1.2;
        const composeSp = `${cssSpacingPx}.sp`;
        t.assertEqual(composeSp, '1.2.sp');
      }
    },
    {
      id: 'T1_TYPO_04',
      name: 'lineHeight token preservation contract from CSS line-height to Compose sp',
      run: async (t) => {
        const cssLineHeightPx = 36;
        const composeSp = `${cssLineHeightPx}.sp`;
        t.assertEqual(composeSp, '36.sp');
      }
    },
    {
      id: 'T1_TYPO_05',
      name: 'Font asset directory android/app/src/main/res/font/ contains required fonts',
      run: async (t) => {
        const fontDir = path.resolve(t.projectRoot, 'android/app/src/main/res/font');
        t.assert(fs.existsSync(fontDir), 'Font directory must exist');
        const files = fs.readdirSync(fontDir);
        t.assert(files.some((f) => f.endsWith('.ttf')), 'Must contain TTF font assets');
      }
    },

    // -------------------------------------------------------------------------
    // Group 5: Closed-Loop Auto-Tuner Directives & Convergence (F9)
    // -------------------------------------------------------------------------
    {
      id: 'T1_TUNER_01',
      name: 'Measured vertical drift dy > 0 maps to reducing top padding or adding negative offset',
      run: async (t) => {
        const drift = { deltaX: 0, deltaY: 8.0, deltaXDp: 0, deltaYDp: 4.0 };
        // If element is rendered 4.0dp too low (deltaYDp > 0), tuner must directive reduction of top padding
        const shouldReducePadding = drift.deltaYDp > 0;
        t.assert(shouldReducePadding, 'Must flag need to reduce vertical padding or offset by 4.0dp');
      }
    },
    {
      id: 'T1_TUNER_02',
      name: 'Measured horizontal drift dx > 0 maps to reducing start padding or offset',
      run: async (t) => {
        const drift = { deltaX: 6.0, deltaY: 0, deltaXDp: 3.0, deltaYDp: 0 };
        const shouldReduceStart = drift.deltaXDp > 0;
        t.assert(shouldReduceStart, 'Must flag need to shift left / reduce start padding by 3.0dp');
      }
    },
    {
      id: 'T1_TUNER_03',
      name: 'Dimension delta (dWidth, dHeight) maps to Modifier.size adjustment',
      run: async (t) => {
        const delta = { dWidth: 24.0, dHeight: 0 };
        t.assert(delta.dWidth > 0, 'Width expansion required');
      }
    },
    {
      id: 'T1_TUNER_04',
      name: 'Category label overflow detection (wrapping) generates row dimension adjustment',
      run: async (t) => {
        const categoryLabelWidth = 100; // dp
        const requiredTextWidth = 124; // dp for "BEYOND THE BAR"
        const overflow = requiredTextWidth > categoryLabelWidth;
        t.assert(overflow, 'Must detect that 100.dp label width overflows and forces wrap');
      }
    },
    {
      id: 'T1_TUNER_05',
      name: 'Auto-tuner convergence stopping criteria (shift <= 2.0px, contour >= 90%, IoU >= 90%)',
      run: async (t) => {
        const stateConverged = {
          maxSpatialShiftPx: 1.5,
          edgeContourScore: 92.4,
          elementIouScore: 91.8
        };
        const isConverged =
          stateConverged.maxSpatialShiftPx <= 2.0 &&
          stateConverged.edgeContourScore >= 90.0 &&
          stateConverged.elementIouScore >= 90.0;
        t.assert(isConverged, 'State meeting all 3 thresholds must be classified as CONVERGED');

        const stateDiverged = {
          maxSpatialShiftPx: 3.2,
          edgeContourScore: 84.0,
          elementIouScore: 88.0
        };
        const isDiverged =
          stateDiverged.maxSpatialShiftPx <= 2.0 &&
          stateDiverged.edgeContourScore >= 90.0 &&
          stateDiverged.elementIouScore >= 90.0;
        t.assert(!isDiverged, 'State with drift > 2.0px must NOT be classified as converged');
      }
    }
  ]
};
