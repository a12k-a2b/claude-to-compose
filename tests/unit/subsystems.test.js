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

const { getCanvasInterceptionScript } = require('../../extractor/canvas_interceptor');
const { transpileCanvasToCompose, mapStrokeCap, mapStrokeJoin, mapColorToCompose } = require('../../synthesizer/canvas_transpiler');
const { sanitizeAndroidFontName, FontExtractor } = require('../../extractor/font_extractor');
const { VectorGenerator } = require('../../synthesizer/vector_generator');
const { computeInkCentroid, DEFAULT_DC1_ZONES } = require('../../verification/zonal_diff');
const { AutoTuner } = require('../../verification/auto_tuner');

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
});
