/**
 * tests/unit/subsystems.test.js
 *
 * Unit tests for the 4 newly integrated subsystems:
 * 1. HTML5 Canvas 2D Stream Interception & Decompiler
 * 2. Automatic WebFont Asset Download & Ingestion
 * 3. Stroke Cap & Junction Semantics Parser
 * 4. Localized Multi-Zone Perceptual Diffing & Auto-Tuner
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { getCanvasInterceptionScript } = require('../../extractor/canvas_interceptor');
const { transpileCanvasToCompose, mapStrokeCap, mapStrokeJoin, mapColorToCompose } = require('../../synthesizer/canvas_transpiler');
const { sanitizeAndroidFontName, FontExtractor } = require('../../extractor/font_extractor');
const { VectorGenerator } = require('../../synthesizer/vector_generator');
const { ScreenGenerator } = require('../../synthesizer/screen_generator');
const { computeInkCentroid, computeZonalInkMetrics, DEFAULT_DC1_ZONES, parseDesignSpecElements, computeElementDriftAndIoU } = require('../../verification/zonal_diff');
const { computeInkMetrics, detectBackgroundPalette, computeSobelEdges, evaluateContourAlignment, generateEdgeDiffOverlay } = require('../../verification/run_diff');
const { AutoTuner } = require('../../verification/auto_tuner');
const { VerificationPipeline } = require('../../verification/index');

describe('Subsystem 1: HTML5 Canvas 2D Interceptor & Transpiler', () => {
  it('generates non-empty browser interception script targeting 2d context', () => {
    const script = getCanvasInterceptionScript();
    assert.ok(typeof script === 'string' && script.length > 100);
    assert.ok(script.includes('__claudeCanvasStreams'));
    assert.ok(script.includes('HTMLCanvasElement.prototype.getContext'));
    assert.ok(script.includes('bezierCurveTo'));
  });

  it('transpiles canvas operations stream into valid Jetpack Compose code', () => {
    const mockStream = {
      id: 'canvas_topography',
      width: 800,
      height: 600,
      operations: [
        { op: 'beginPath' },
        { op: 'moveTo', args: [50, 100] },
        { op: 'bezierCurveTo', args: [100, 120, 200, 80, 250, 150] },
        {
          op: 'stroke',
          style: {
            strokeStyle: '#1A1A1A',
            lineWidth: 2,
            lineCap: 'round',
            lineJoin: 'round'
          }
        }
      ]
    };

    const kotlin = transpileCanvasToCompose(mockStream, { functionName: 'TopographyMap' });
    assert.ok(kotlin.includes('@Composable\nfun TopographyMap'));
    assert.ok(kotlin.includes('path1.moveTo(50f, 100f)'));
    assert.ok(kotlin.includes('path1.cubicTo(100f, 120f, 200f, 80f, 250f, 150f)'));
    assert.ok(kotlin.includes('StrokeCap.Round'));
    assert.ok(kotlin.includes('StrokeJoin.Round'));
    assert.ok(kotlin.includes('Os900'));
  });

  it('maps SolOS neutral scale tokens accurately in canvas color mapper', () => {
    assert.equal(mapColorToCompose('#ffffff'), 'Os0');
    assert.equal(mapColorToCompose('#f7f7f7'), 'Os50');
    assert.equal(mapColorToCompose('#1a1a1a'), 'Os900');
    assert.equal(mapColorToCompose('#000000'), 'Os1000');
  });
});

describe('Subsystem 2: WebFont Extractor & Packager', () => {
  it('sanitizes font filenames to strictly comply with Android resource naming ^[a-z0-9_]+$', () => {
    assert.equal(sanitizeAndroidFontName('ABC Arizona Flare.woff2'), 'abc_arizona_flare');
    assert.equal(sanitizeAndroidFontName('ABC-ROM-Mono_Bold.ttf'), 'abc_rom_mono_bold');
    assert.equal(sanitizeAndroidFontName('Inter-VariableFont_slnt,wght.ttf'), 'inter_variablefont_slnt_wght');
    assert.equal(sanitizeAndroidFontName('123Font!Test'), '_123font_test'.replace(/^_+/, ''));
  });

  it('initializes FontExtractor with valid defaults and assets directories', () => {
    const extractor = new FontExtractor({ outputDir: './test_output' });
    assert.ok(extractor.fontsDir.includes('assets/fonts') || extractor.fontsDir.includes('assets\\fonts'));
    assert.equal(extractor.downloadedFonts.size, 0);
  });
});

describe('Subsystem 3: Stroke Cap & Junction Semantics Parser', () => {
  it('maps CSS/SVG stroke-linecap to Compose StrokeCap and Android XML strings', () => {
    assert.equal(VectorGenerator.mapComposeStrokeCap('round'), 'StrokeCap.Round');
    assert.equal(VectorGenerator.mapComposeStrokeCap('square'), 'StrokeCap.Square');
    assert.equal(VectorGenerator.mapComposeStrokeCap('butt'), 'StrokeCap.Butt');
    assert.equal(VectorGenerator.mapXmlStrokeCap('round'), 'round');
    assert.equal(VectorGenerator.mapXmlStrokeCap('square'), 'square');
    assert.equal(VectorGenerator.mapXmlStrokeCap('butt'), 'butt');
  });

  it('maps CSS/SVG stroke-linejoin to Compose StrokeJoin and Android XML strings', () => {
    assert.equal(VectorGenerator.mapComposeStrokeJoin('round'), 'StrokeJoin.Round');
    assert.equal(VectorGenerator.mapComposeStrokeJoin('bevel'), 'StrokeJoin.Bevel');
    assert.equal(VectorGenerator.mapComposeStrokeJoin('miter'), 'StrokeJoin.Miter');
    assert.equal(VectorGenerator.mapXmlStrokeJoin('round'), 'round');
    assert.equal(VectorGenerator.mapXmlStrokeJoin('bevel'), 'bevel');
    assert.equal(VectorGenerator.mapXmlStrokeJoin('miter'), 'miter');
  });

  it('emits Compose group() and PathFillType.EvenOdd for transformed SVG paths', () => {
    const vectors = [
      {
        name: 'notebook_icon',
        width: 20,
        height: 20,
        paths: [
          {
            d: 'M 3.375 0 L 3.375 8.75',
            fill: '#1A1A1A',
            fillRule: 'evenodd',
            transform: 'matrix(1 0 0 1 11.250 10)'
          }
        ]
      }
    ];

    const kotlin = VectorGenerator.generateImageVectorFile(vectors, { packageName: 'com.test.icons' });
    assert.ok(kotlin.includes('import androidx.compose.ui.graphics.PathFillType'));
    assert.ok(kotlin.includes('import androidx.compose.ui.graphics.vector.group'));
    assert.ok(kotlin.includes('group('));
    assert.ok(kotlin.includes('translationX = 11.25f'));
    assert.ok(kotlin.includes('translationY = 10f'));
    assert.ok(kotlin.includes('pathFillType = PathFillType.EvenOdd'));
  });

  it('emits Android VectorDrawable <group> and android:fillType="evenOdd" for transformed SVG paths', () => {
    const vector = {
      name: 'notebook_icon',
      width: 20,
      height: 20,
      paths: [
        {
          d: 'M 3.375 0 L 3.375 8.75',
          fill: '#1A1A1A',
          fillRule: 'evenodd',
          transform: 'matrix(1 0 0 1 11.250 10)'
        }
      ]
    };

    const xml = VectorGenerator.generateVectorDrawableXml(vector);
    assert.ok(xml.includes('<group'));
    assert.ok(xml.includes('android:translateX="11.25"'));
    assert.ok(xml.includes('android:translateY="10"'));
    assert.ok(xml.includes('android:fillType="evenOdd"'));
  });

  it('dynamically binds extracted vector icons in ScreenGenerator instead of static fallback', () => {
    const spec = {
      hierarchy: {
        id: 'root',
        type: 'SCREEN',
        componentType: 'Screen',
        children: [
          {
            id: 'btn_search',
            componentType: 'IconButton',
            children: [
              { id: 'icon_search', componentType: 'Icon', vectorId: 'vector_1' }
            ]
          },
          {
            id: 'icon_notebook',
            componentType: 'Icon',
            vectorId: 'vector_2'
          }
        ]
      },
      vectors: [
        { id: 'vector_1', name: 'search_action' },
        { id: 'vector_2', name: 'notebook_badge' }
      ]
    };

    const screenCode = ScreenGenerator.generateScreenFile(spec, 'com.test.screen');
    assert.ok(screenCode.includes('ClaudeIcons.SearchActionIcon'));
    assert.ok(screenCode.includes('ClaudeIcons.NotebookBadgeIcon'));
    assert.ok(!screenCode.includes('ClaudeIcons.Icon1Icon'));
  });
});

describe('Subsystem 4: Localized Multi-Zone Perceptual Diffing & Auto-Tuner', () => {
  it('defines 4 functional zones covering the complete Daylight DC1 1184x1584 display', () => {
    assert.equal(DEFAULT_DC1_ZONES.length, 4);
    assert.equal(DEFAULT_DC1_ZONES[0].yStart, 0);
    assert.equal(DEFAULT_DC1_ZONES[3].yEnd, 1584);
  });

  it('computes ink centroid coordinates for non-white pixels', () => {
    // 10x10 dummy PNG buffer with single black pixel at (4, 4)
    const mockPng = {
      width: 10,
      height: 10,
      data: Buffer.alloc(10 * 10 * 4, 255) // all white
    };
    // Put ink at (4, 4)
    const idx = (10 * 4 + 4) * 4;
    mockPng.data[idx] = 0;
    mockPng.data[idx + 1] = 0;
    mockPng.data[idx + 2] = 0;
    mockPng.data[idx + 3] = 255;

    const result = computeInkCentroid(mockPng, 10, 10);
    assert.equal(result.inkPixelCount, 1);
    assert.equal(result.centroidX, 4);
    assert.equal(result.centroidY, 4);
  });

  it('generates layout tuning directives from systematic centroid drift', () => {
    const mockZonalReport = {
      zones: [
        {
          id: 'zone_typography',
          name: 'Headline Typography',
          similarity: 82.5,
          ssimScore: 0.42,
          centroidDrift: {
            deltaX: 2.0,
            deltaY: 24.0,
            deltaXDp: 1.0,
            deltaYDp: 12.0
          }
        }
      ]
    };

    const tuner = new AutoTuner(mockZonalReport);
    const directives = tuner.generateTuningDirectives();
    assert.equal(directives.length, 1);
    assert.ok(directives[0].recommendedCorrections[0].action.includes('Reduce top padding'));
  });

  it('computes Ink IoU and Ink Dice strictly for non-white ink pixels', () => {
    // 10x10 mock images:
    // Image A has black pixels at (0, 0), (1, 1), (2, 2) [3 ink pixels]
    // Image B has black pixels at (1, 1), (2, 2), (3, 3) [3 ink pixels]
    // Intersection: (1, 1), (2, 2) -> 2 pixels
    // Union: (0, 0), (1, 1), (2, 2), (3, 3) -> 4 pixels
    // IoU: 2 / 4 = 50.0%
    // Dice: 2 * 2 / (3 + 3) = 4 / 6 = 66.67%
    const mockPngA = {
      width: 10,
      height: 10,
      data: Buffer.alloc(10 * 10 * 4, 255)
    };
    const mockPngB = {
      width: 10,
      height: 10,
      data: Buffer.alloc(10 * 10 * 4, 255)
    };

    const setInk = (png, x, y) => {
      const idx = (10 * y + x) * 4;
      png.data[idx] = 0;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 255;
    };

    setInk(mockPngA, 0, 0);
    setInk(mockPngA, 1, 1);
    setInk(mockPngA, 2, 2);

    setInk(mockPngB, 1, 1);
    setInk(mockPngB, 2, 2);
    setInk(mockPngB, 3, 3);

    const metricsGlobal = computeInkMetrics(mockPngA, mockPngB, 10, 10);
    assert.equal(metricsGlobal.inkRefPixels, 3);
    assert.equal(metricsGlobal.inkRenderedPixels, 3);
    assert.equal(metricsGlobal.inkIntersectionPixels, 2);
    assert.equal(metricsGlobal.inkUnionPixels, 4);
    assert.equal(metricsGlobal.inkIou, 50.0);
    assert.equal(metricsGlobal.inkDice, 66.67);

    const metricsZonal = computeZonalInkMetrics(mockPngA, mockPngB, 10, 10);
    assert.equal(metricsZonal.refInkCount, 3);
    assert.equal(metricsZonal.renderedInkCount, 3);
    assert.equal(metricsZonal.inkIntersection, 2);
    assert.equal(metricsZonal.inkUnion, 4);
    assert.equal(metricsZonal.inkIou, 50.0);
    assert.equal(metricsZonal.inkDice, 66.67);
  });

  it('guarantees blank white screens score 0.00% Ink IoU and heavily penalize feature pruning', () => {
    const blankPngA = { width: 10, height: 10, data: Buffer.alloc(10 * 10 * 4, 255) };
    const blankPngB = { width: 10, height: 10, data: Buffer.alloc(10 * 10 * 4, 255) };
    const inkPng = { width: 10, height: 10, data: Buffer.alloc(10 * 10 * 4, 255) };
    // Put ink in inkPng
    inkPng.data[0] = 0; inkPng.data[1] = 0; inkPng.data[2] = 0; inkPng.data[3] = 255;

    // 1. Both blank white screens
    const bothBlank = computeInkMetrics(blankPngA, blankPngB, 10, 10);
    assert.equal(bothBlank.inkIou, 0.0);
    assert.equal(bothBlank.inkDice, 0.0);

    // 2. Rendered screen is blank white (feature pruning)
    const prunedRendered = computeInkMetrics(inkPng, blankPngB, 10, 10);
    assert.equal(prunedRendered.inkIou, 0.0);
    assert.equal(prunedRendered.inkDice, 0.0);

    // 3. Zonal metrics on blank screens
    const zonalBlank = computeZonalInkMetrics(blankPngA, blankPngB, 10, 10);
    assert.equal(zonalBlank.inkIou, 0.0);
    assert.equal(zonalBlank.inkDice, 0.0);

    const zonalPruned = computeZonalInkMetrics(inkPng, blankPngB, 10, 10);
    assert.equal(zonalPruned.inkIou, 0.0);
    assert.equal(zonalPruned.inkDice, 0.0);
  });
});

describe('Subsystem 5: Dynamic Background Palette & Sobel Edge Contour Alignment Engine', () => {
  it('detects dominant background colors on white and warm sand canvas', () => {
    // 1. Uniform white canvas
    const whiteBuffer = Buffer.alloc(20 * 20 * 4, 255);
    const whitePalette = detectBackgroundPalette(whiteBuffer, 20, 20);
    assert.ok(whitePalette.length >= 1);
    assert.equal(whitePalette[0].r, 255);
    assert.equal(whitePalette[0].g, 255);
    assert.equal(whitePalette[0].b, 255);

    // 2. Warm sand canvas (#E7E4DE -> 231, 228, 222) with sparse black ink (2.5%)
    const sandBuffer = Buffer.alloc(20 * 20 * 4);
    for (let i = 0; i < 400; i++) {
      if (i < 390) {
        // 97.5% warm sand
        sandBuffer[i * 4 + 0] = 231;
        sandBuffer[i * 4 + 1] = 228;
        sandBuffer[i * 4 + 2] = 222;
        sandBuffer[i * 4 + 3] = 255;
      } else {
        // 2.5% black text ink (< minPct 5%)
        sandBuffer[i * 4 + 0] = 0;
        sandBuffer[i * 4 + 1] = 0;
        sandBuffer[i * 4 + 2] = 0;
        sandBuffer[i * 4 + 3] = 255;
      }
    }
    const sandPalette = detectBackgroundPalette(sandBuffer, 20, 20);
    assert.ok(sandPalette.length >= 1);
    // Dominant background should be warm sand
    assert.ok(Math.abs(sandPalette[0].r - 231) <= 4);
    assert.ok(Math.abs(sandPalette[0].g - 228) <= 4);
    assert.ok(Math.abs(sandPalette[0].b - 222) <= 4);
    // Dark ink (< 50) must not be in background palette
    for (const bg of sandPalette) {
      assert.ok(bg.r > 150 && bg.g > 150 && bg.b > 150);
    }
  });

  it('extracts sharp edge coordinates using computeSobelEdges', async () => {
    // Create 10x10 grayscale buffer: left half black (0), right half white (255)
    const gray = Buffer.alloc(10 * 10, 0);
    for (let y = 0; y < 10; y++) {
      for (let x = 5; x < 10; x++) {
        gray[y * 10 + x] = 255;
      }
    }
    const edges = await computeSobelEdges(gray, { raw: true, width: 10, height: 10, threshold: 30.0 });
    assert.ok(edges.count > 0);
    assert.equal(edges.edges.length, 100);
    // Edge points should be at the boundary between x=4 and x=5
    let hasBoundaryEdge = false;
    for (let y = 1; y < 9; y++) {
      if (edges.edges[y * 10 + 4] === 1 || edges.edges[y * 10 + 5] === 1) {
        hasBoundaryEdge = true;
      }
    }
    assert.ok(hasBoundaryEdge);
  });

  it('evaluates distance-weighted contour alignment (d<=1px -> 1.0, d=2px -> 0.5, d>=3px -> 0.0)', () => {
    const w = 20, h = 20;
    const createEdgeObj = (coords) => {
      const edges = new Uint8Array(w * h);
      for (const [x, y] of coords) {
        edges[y * w + x] = 1;
      }
      return { edges, width: w, height: h, count: coords.length };
    };

    const refCoords = [[10, 10], [10, 11], [10, 12], [10, 13]];
    const ref = createEdgeObj(refCoords);

    // 1. Exact match (0px shift) -> 100% alignment
    const exactMatch = evaluateContourAlignment(ref, ref);
    assert.equal(exactMatch.edgeContourScore, 100.0);
    assert.equal(exactMatch.displacedCount, 0);

    // 2. 1px shift (d = 1.0) -> weight 1.0 -> 100% alignment
    const shifted1px = createEdgeObj(refCoords.map(([x, y]) => [x + 1, y]));
    const result1px = evaluateContourAlignment(ref, shifted1px);
    assert.equal(result1px.edgeContourScore, 100.0);
    assert.equal(result1px.match1px, 4);

    // 3. 2px shift (d = 2.0) -> weight 0.5 -> 50% alignment
    const shifted2px = createEdgeObj(refCoords.map(([x, y]) => [x + 2, y]));
    const result2px = evaluateContourAlignment(ref, shifted2px);
    assert.equal(result2px.edgeContourScore, 50.0);
    assert.equal(result2px.match2px, 4);

    // 4. >= 3px shift (e.g. 5px) -> weight 0.0 -> 0% alignment
    const shifted5px = createEdgeObj(refCoords.map(([x, y]) => [x + 5, y]));
    const result5px = evaluateContourAlignment(ref, shifted5px);
    assert.equal(result5px.edgeContourScore, 0.0);
    assert.equal(result5px.displacedCount, 4);
  });

  it('generates 4-color edge diff overlay image buffer', async () => {
    const w = 10, h = 10;
    const refEdges = new Uint8Array(w * h);
    refEdges[5 * w + 5] = 1;
    const rendEdges = new Uint8Array(w * h);
    rendEdges[5 * w + 5] = 1;

    const ref = { edges: refEdges, width: w, height: h, count: 1 };
    const rend = { edges: rendEdges, width: w, height: h, count: 1 };

    const tmpPath = path.join(os.tmpdir(), `edge_diff_test_${Date.now()}.png`);
    const resultPath = await generateEdgeDiffOverlay(ref, rend, tmpPath);
    assert.ok(fs.existsSync(resultPath));
    try { fs.unlinkSync(resultPath); } catch (_) {}
  });
});

describe('Subsystem 6: Dynamic Element Bounding Box IoU & Centroid Drift Analysis', () => {
  it('parses semantic design_spec elements and scales coordinates by factor S', () => {
    const mockSpec = {
      hierarchy: {
        tag: 'div',
        bounds: { x: 0, y: 0, width: 500, height: 500 },
        children: [
          {
            id: 'heading-1',
            tag: 'h1',
            text: { content: 'Settings', fontSize: 24 },
            bounds: { x: 10, y: 20, width: 100, height: 30 }
          },
          {
            id: 'btn-back',
            tag: 'button',
            text: { content: 'Back' },
            bounds: { x: 0, y: 0, width: 40, height: 40 }
          },
          {
            id: 'offscreen-card',
            tag: 'button',
            bounds: { x: 2000, y: 3000, width: 100, height: 100 }
          }
        ]
      }
    };

    const elements = parseDesignSpecElements(mockSpec, { scale: 2.0, width: 1000, height: 1000 });
    assert.equal(elements.length, 2); // offscreen card is filtered out

    const heading = elements.find(e => e.id === 'heading-1');
    assert.ok(heading);
    assert.equal(heading.bounds.x, 20);
    assert.equal(heading.bounds.y, 40);
    assert.equal(heading.bounds.width, 200);
    assert.equal(heading.bounds.height, 60);
  });

  it('computes localized ink centroid drift vectors and element bounding box IoU', () => {
    const W = 100, H = 100;
    const refPng = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };
    const rendPng = { width: W, height: H, data: Buffer.alloc(W * H * 4, 255) };

    // Reference ink: 10x10 square at (20, 20) -> centroid (24.5, 24.5)
    for (let y = 20; y < 30; y++) {
      for (let x = 20; x < 30; x++) {
        const idx = (y * W + x) * 4;
        refPng.data[idx + 0] = 0; refPng.data[idx + 1] = 0; refPng.data[idx + 2] = 0;
      }
    }

    // Rendered ink: 10x10 square shifted by dx=+2, dy=+1 -> (22, 21) -> centroid (26.5, 25.5)
    for (let y = 21; y < 31; y++) {
      for (let x = 22; x < 32; x++) {
        const idx = (y * W + x) * 4;
        rendPng.data[idx + 0] = 0; rendPng.data[idx + 1] = 0; rendPng.data[idx + 2] = 0;
      }
    }

    const elements = [
      {
        id: 'icon-test',
        name: 'test icon',
        category: 'icon',
        priority: 'primary',
        bounds: { x: 15, y: 15, width: 30, height: 30 },
        boundsDp: { x: 7.5, y: 7.5, width: 15, height: 15 }
      }
    ];

    const result = computeElementDriftAndIoU(refPng, rendPng, elements, W, H, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
    });

    assert.ok(result);
    assert.equal(result.evaluatedCount, 1);
    assert.equal(result.driftVectors.length, 1);
    const vec = result.driftVectors[0];
    assert.equal(vec.status, 'LOW_IOU');
    assert.equal(vec.dx, 2.0);
    assert.equal(vec.dy, 1.0);
    assert.ok(Math.abs(vec.shiftMagnitude - Math.hypot(2.0, 1.0)) < 0.01);
    assert.ok(vec.iou > 50.0);

    // Unshifted test: exact alignment -> status ALIGNED, iou = 100%
    const unshiftedRes = computeElementDriftAndIoU(refPng, refPng, elements, W, H, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
    });
    assert.equal(unshiftedRes.driftVectors[0].status, 'ALIGNED');
    assert.equal(unshiftedRes.driftVectors[0].iou, 100.0);
    assert.equal(unshiftedRes.driftVectors[0].shiftMagnitude, 0.0);
  });
});

describe('Subsystem 7: Hard Anti-Deception Guardrails & Pipeline Quality Gates', () => {
  it('concludePipeline rejects runs with contour alignment score below 90%', () => {
    const pipeline = new VerificationPipeline({
      projectRoot: '/tmp',
      minContourScore: 90.0,
      minElementIou: 90.0,
      maxSpatialShiftPx: 3.0,
      minInkIou: 85.0
    });

    const mockPipelineResult = {
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: {
            pixelSimilarityPercentage: 96.5,
            mssimScore: 0.95,
            inkIou: 88.0,
            edgeContourScore: 78.4
          },
          zonal: {
            elementIouScore: 92.0,
            maxSpatialShiftPx: 2.0,
            elementsEvaluatedCount: 3
          }
        }
      }
    };

    const summary = pipeline.concludePipeline(mockPipelineResult);
    assert.equal(summary.verdict, 'FAILED');
    assert.equal(summary.gateAction, 'TRIGGER_REFINEMENT');
    assert.ok(summary.deceptionViolations.some(v => v.includes('Edge contour alignment score')));
  });

  it('concludePipeline rejects runs with spatial drift exceeding 3px', () => {
    const pipeline = new VerificationPipeline({
      projectRoot: '/tmp',
      maxSpatialShiftPx: 3.0
    });

    const mockPipelineResult = {
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: {
            pixelSimilarityPercentage: 95.0,
            mssimScore: 0.95,
            inkIou: 90.0,
            edgeContourScore: 94.0
          },
          zonal: {
            elementIouScore: 91.0,
            maxSpatialShiftPx: 7.2,
            elementsEvaluatedCount: 3,
            worstDriftElement: { name: 'title-text', elementId: 'title-1' }
          }
        }
      }
    };

    const summary = pipeline.concludePipeline(mockPipelineResult);
    assert.equal(summary.verdict, 'FAILED');
    assert.equal(summary.gateAction, 'TRIGGER_REFINEMENT');
    assert.ok(summary.deceptionViolations.some(v => v.includes('Maximum spatial drift')));
  });

  it('concludePipeline rejects runs with Ink IoU below 85%', () => {
    const pipeline = new VerificationPipeline({
      projectRoot: '/tmp',
      minInkIou: 85.0
    });

    const mockPipelineResult = {
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: {
            pixelSimilarityPercentage: 96.0,
            mssimScore: 0.95,
            inkIou: 40.0,
            edgeContourScore: 92.0
          },
          zonal: {
            elementIouScore: 92.0,
            maxSpatialShiftPx: 1.5,
            elementsEvaluatedCount: 3
          }
        }
      }
    };

    const summary = pipeline.concludePipeline(mockPipelineResult);
    assert.equal(summary.verdict, 'FAILED');
    assert.equal(summary.gateAction, 'TRIGGER_REFINEMENT');
    assert.ok(summary.deceptionViolations.some(v => v.includes('Dynamic Ink IoU')));
  });

  it('concludePipeline passes runs when all anti-deception gates are satisfied', () => {
    const pipeline = new VerificationPipeline({
      projectRoot: '/tmp',
      minContourScore: 90.0,
      minElementIou: 90.0,
      maxSpatialShiftPx: 3.0,
      minInkIou: 85.0
    });

    const mockPipelineResult = {
      stages: {
        vectorLinter: { success: true, passed: true },
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: {
            pixelSimilarityPercentage: 98.5,
            mssimScore: 0.97,
            inkIou: 91.0,
            edgeContourScore: 94.5
          },
          zonal: {
            elementIouScore: 95.2,
            maxSpatialShiftPx: 1.8,
            elementsEvaluatedCount: 3
          }
        }
      }
    };

    const summary = pipeline.concludePipeline(mockPipelineResult);
    assert.equal(summary.verdict, 'PASSED');
    assert.equal(summary.gateAction, 'PROCEED_PUBLISH');
    assert.equal(summary.deceptionViolations.length, 0);
  });
});


