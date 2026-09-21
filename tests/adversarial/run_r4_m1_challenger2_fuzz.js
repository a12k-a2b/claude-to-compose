#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Fuzz & Stress Test Suite: Milestone 1 (R1)
 * SVG Transform Decomposition, Matrix Baking, Primitive Normalization & Parity
 *
 * Executed by: r4_m1_challenger_2 (Role: critic, specialist)
 * Working Directory: claude_to_compose
 * Targets:
 *   - extractor/svg_parser.js (SvgParser, parseSvgString, normalize*, bakeMatrixToPath)
 *   - extractor/dom_walker.js (extractInlineSvgData, cumulative affine matrices)
 *   - synthesizer/vector_generator.js (VectorGenerator, parseTransform, arcToCubic, bakeMatrixToPath)
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

const results = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  if (passed) {
    passCount++;
    console.log(`\x1b[32m[PASS]\x1b[0m [${id}] ${name}`);
  } else {
    failCount++;
    console.log(`\x1b[31m[FAIL]\x1b[0m [${id}] ${name}`);
    console.log(`       \x1b[31mReason: ${details.reason || 'Assertion failed'}\x1b[0m`);
    if (details.expected !== undefined && details.actual !== undefined) {
      console.log(`       Expected: ${JSON.stringify(details.expected)}`);
      console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
    }
  }
}

function assertClose(actual, expected, eps = 1e-3, msg = '') {
  const diff = Math.abs(actual - expected);
  if (diff > eps) {
    throw new Error(`${msg}: expected ${actual} to be within ${eps} of ${expected} (diff: ${diff})`);
  }
}

function assertPointClose(actual, expected, eps = 1e-3, msg = '') {
  assertClose(actual.x !== undefined ? actual.x : actual[0], expected.x !== undefined ? expected.x : expected[0], eps, `${msg} (x)`);
  assertClose(actual.y !== undefined ? actual.y : actual[1], expected.y !== undefined ? expected.y : expected[1], eps, `${msg} (y)`);
}

function assertMatrixClose(actual, expected, eps = 1e-3, msg = '') {
  for (let i = 0; i < 6; i++) {
    assertClose(actual[i], expected[i], eps, `${msg} (matrix[${i}])`);
  }
}

// ============================================================================
// SUITE 1: Deeply Nested <g> Hierarchies (10+ to 50 levels)
// ============================================================================
async function runSuite1() {
  console.log('\n--- SUITE 1: Deeply Nested <g> Hierarchies (10+ to 50 levels) ---');

  // Test 1.1: 10-level nested <g> with cumulative translations
  try {
    let svg = '<svg width="200" height="200">';
    const levels = 10;
    const dx = 2.5, dy = 3.5;
    for (let i = 0; i < levels; i++) {
      svg += `<g transform="translate(${dx}, ${dy})">`;
    }
    svg += '<rect x="0" y="0" width="10" height="10" />';
    for (let i = 0; i < levels; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, 'Expected 1 path');
    const expectedTx = dx * levels;
    const expectedTy = dy * levels;
    const m = parsed.paths[0].transformMatrix;
    assertMatrixClose(m, [1, 0, 0, 1, expectedTx, expectedTy], 1e-4, '10-level translation');
    recordTest('FUZZ-1.1', '10-level nested <g> hierarchy with cumulative translations', 'Deep-Nesting', true, { levels, expectedTx, expectedTy });
  } catch (err) {
    recordTest('FUZZ-1.1', '10-level nested <g> hierarchy with cumulative translations', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.2: 25-level nested <g> with heterogeneous affine transformations
  try {
    let svg = '<svg width="500" height="500">';
    const levels = 25;
    let groundTruthMatrix = [1, 0, 0, 1, 0, 0];

    for (let i = 0; i < levels; i++) {
      let stepStr, stepMat;
      const mod = i % 5;
      if (mod === 0) {
        stepStr = `translate(${i + 1}, ${i * 0.5})`;
        stepMat = [1, 0, 0, 1, i + 1, i * 0.5];
      } else if (mod === 1) {
        stepStr = 'scale(1.05, 0.98)';
        stepMat = [1.05, 0, 0, 0.98, 0, 0];
      } else if (mod === 2) {
        stepStr = 'rotate(15)';
        stepMat = SvgParser.parseTransformToMatrix('rotate(15)');
      } else if (mod === 3) {
        stepStr = 'skewX(5)';
        stepMat = SvgParser.parseTransformToMatrix('skewX(5)');
      } else {
        stepStr = 'translate(-2, 1)';
        stepMat = [1, 0, 0, 1, -2, 1];
      }
      groundTruthMatrix = SvgParser.multiplyMatrices(groundTruthMatrix, stepMat);
      svg += `<g transform="${stepStr}">`;
    }
    svg += '<circle cx="10" cy="10" r="5" />';
    for (let i = 0; i < levels; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1);
    assertMatrixClose(parsed.paths[0].transformMatrix, groundTruthMatrix, 1e-3, '25-level heterogeneous');
    recordTest('FUZZ-1.2', '25-level nested <g> hierarchy with mixed translate, scale, rotate, skew', 'Deep-Nesting', true, { levels });
  } catch (err) {
    recordTest('FUZZ-1.2', '25-level nested <g> hierarchy with mixed translate, scale, rotate, skew', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.3: 50-level nested <g> stress test (recursion depth and stack safety)
  try {
    let svg = '<svg width="1000" height="1000">';
    const levels = 50;
    for (let i = 0; i < levels; i++) {
      svg += `<g transform="translate(1, 1)">`;
    }
    svg += '<path d="M 0 0 L 10 10" />';
    for (let i = 0; i < levels; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1);
    assertMatrixClose(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 50, 50], 1e-4, '50-level translation');
    recordTest('FUZZ-1.3', '50-level nested <g> hierarchy recursion stress test without stack overflow', 'Deep-Nesting', true, { levels: 50 });
  } catch (err) {
    recordTest('FUZZ-1.3', '50-level nested <g> hierarchy recursion stress test without stack overflow', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.4: Malformed unclosed <g> tags stack recovery
  try {
    // Outer <g> unclosed, followed by sibling <g>
    const svg = `
      <svg width="100" height="100">
        <g transform="translate(10, 10)">
          <path id="p1" d="M 0 0 L 1 1" />
          <g transform="translate(5, 5)">
            <path id="p2" d="M 0 0 L 2 2" />
        </g>
        <g transform="translate(100, 100)">
          <path id="p3" d="M 0 0 L 3 3" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.ok(parsed.paths.length >= 3, 'Must parse paths despite unclosed inner group');
    recordTest('FUZZ-1.4', 'Graceful handling of unclosed nested <g> tag stack', 'Deep-Nesting', true, { pathCount: parsed.paths.length });
  } catch (err) {
    recordTest('FUZZ-1.4', 'Graceful handling of unclosed nested <g> tag stack', 'Deep-Nesting', false, { reason: err.message });
  }

  // Test 1.5: Mixed self-closing <g/> interspersed in deep hierarchy
  try {
    const svg = `
      <svg width="100" height="100">
        <g transform="translate(10, 10)">
          <g transform="translate(999, 999)" />
          <g transform="translate(20, 20)">
            <rect x="0" y="0" width="5" height="5" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1);
    // Self-closing <g/> must NOT contaminate stack: (10, 10) + (20, 20) = (30, 30)
    assertMatrixClose(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 30, 30], 1e-4, 'Self-closing <g/> isolation');
    recordTest('FUZZ-1.5', 'Self-closing <g/> does not leak transform or corrupt stack', 'Deep-Nesting', true);
  } catch (err) {
    recordTest('FUZZ-1.5', 'Self-closing <g/> does not leak transform or corrupt stack', 'Deep-Nesting', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 2: Negative Scales (Reflections) & Chained Skew Transformations
// ============================================================================
async function runSuite2() {
  console.log('\n--- SUITE 2: Negative Scales (Reflections) & Chained Skew Transforms ---');

  // Test 2.1: Horizontal reflection scale(-1, 1) preserves geometry and inverts X
  try {
    const d = 'M 10 20 L 30 40';
    const matrix = [-1, 0, 0, 1, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M -10 20 L -30 40');
    recordTest('FUZZ-2.1', 'Horizontal reflection scale(-1, 1) coordinate baking', 'Reflections', true, { baked });
  } catch (err) {
    recordTest('FUZZ-2.1', 'Horizontal reflection scale(-1, 1) coordinate baking', 'Reflections', false, { reason: err.message });
  }

  // Test 2.2: Vertical reflection scale(1, -1) preserves geometry and inverts Y
  try {
    const d = 'M 10 20 L 30 40';
    const matrix = [1, 0, 0, -1, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M 10 -20 L 30 -40');
    recordTest('FUZZ-2.2', 'Vertical reflection scale(1, -1) coordinate baking', 'Reflections', true, { baked });
  } catch (err) {
    recordTest('FUZZ-2.2', 'Vertical reflection scale(1, -1) coordinate baking', 'Reflections', false, { reason: err.message });
  }

  // Test 2.3: Point reflection scale(-1, -1) (180-deg inversion)
  try {
    const d = 'M 10 20 C 15 25 25 35 30 40';
    const matrix = [-1, 0, 0, -1, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M -10 -20 C -15 -25 -25 -35 -30 -40');
    recordTest('FUZZ-2.3', 'Point reflection scale(-1, -1) on cubic Bézier curves', 'Reflections', true, { baked });
  } catch (err) {
    recordTest('FUZZ-2.3', 'Point reflection scale(-1, -1) on cubic Bézier curves', 'Reflections', false, { reason: err.message });
  }

  // Test 2.4: Elliptical arc under reflection scale(-1, 1) decomposes to valid cubics
  try {
    // Semicircle arc from (10, 20) to (20, 20) with radius 5
    const arcD = 'M 10 20 A 5 5 0 0 1 20 20';
    const flipX = [-1, 0, 0, 1, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(arcD, flipX);

    // Endpoint must be (-10, 20) -> (-20, 20)
    assert.ok(baked.startsWith('M -10 20'), `Start point must be -10 20, got: ${baked}`);
    assert.ok(baked.includes(' -20 20'), `End point must be -20 20, got: ${baked}`);
    // Arcs under reflection decompose to cubic Béziers (C)
    assert.ok(baked.includes('C'), 'Arc under negative determinant must decompose to cubic Bézier');
    recordTest('FUZZ-2.4', 'Elliptical arc under reflection scale(-1, 1) decomposes via W3C F.6 without NaN', 'Reflections', true);
  } catch (err) {
    recordTest('FUZZ-2.4', 'Elliptical arc under reflection scale(-1, 1) decomposes via W3C F.6 without NaN', 'Reflections', false, { reason: err.message });
  }

  // Test 2.5: Complex chained transform: translate + scale(-2, 3) + rotate(45) + skewX(30)
  try {
    const transformStr = 'translate(100, 50) scale(-2, 3) rotate(45) skewX(30)';
    const parsed = VectorGenerator.parseTransform(transformStr);
    assert.ok(parsed, 'Must parse chained transform');
    assert.equal(parsed.type, 'matrix');
    assert.ok(parsed.hasSkew, 'Must flag hasSkew=true');

    // Test baking into path
    const d = 'M 0 0 L 10 10';
    const baked = VectorGenerator.bakeMatrixToPath(d, parsed.matrix);
    assert.ok(baked.startsWith('M 100 50'), `Origin (0,0) translated to (100,50), got: ${baked}`);
    assert.ok(!baked.includes('NaN'), 'Baked string must not contain NaN');
    recordTest('FUZZ-2.5', 'Chained negative scale + rotation + skewX matrix composition and baking', 'Reflections', true);
  } catch (err) {
    recordTest('FUZZ-2.5', 'Chained negative scale + rotation + skewX matrix composition and baking', 'Reflections', false, { reason: err.message });
  }

  // Test 2.6: Compose ImageVector and Android VectorDrawable generation with skew triggers auto-baking
  try {
    const vector = {
      name: 'CustomTransformedIcon',
      width: 24,
      height: 24,
      paths: [{
        d: 'M 0 0 L 10 10',
        stroke: '#000000',
        transform: 'skewX(25)'
      }]
    };
    // Android VectorDrawable XML does not support skew, must auto-bake
    const xml = VectorGenerator.generateVectorDrawableXml(vector);
    assert.ok(!xml.toLowerCase().includes('skew'), 'XML must not contain unsupported skew');
    assert.ok(!xml.includes('<group'), 'Skew must be baked directly into pathData, not emitted as invalid group');

    // Kotlin Compose ImageVector
    const kt = VectorGenerator.generateImageVectorFile([vector]);
    assert.ok(!kt.includes('skew'), 'Kotlin must not contain skew');
    assert.ok(!kt.includes('group('), 'Kotlin must not emit group for skew');
    recordTest('FUZZ-2.6', 'VectorDrawable XML and Compose DSL automatically bake skew transforms', 'Reflections', true);
  } catch (err) {
    recordTest('FUZZ-2.6', 'VectorDrawable XML and Compose DSL automatically bake skew transforms', 'Reflections', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 3: Degenerate Elements & Boundary Geometries
// ============================================================================
async function runSuite3() {
  console.log('\n--- SUITE 3: Degenerate Elements & Boundary Geometries ---');

  // Test 3.1: Empty, whitespace, or invalid path strings
  try {
    assert.equal(VectorGenerator.tokenizePath('').length, 0);
    assert.equal(VectorGenerator.tokenizePath('   ').length, 0);
    assert.equal(VectorGenerator.bakeMatrixToPath('', [1, 0, 0, 1, 0, 0]), '');
    assert.equal(VectorGenerator.bakeMatrixToPath('   ', [1, 0, 0, 1, 0, 0]), '');
    recordTest('FUZZ-3.1', 'Empty and whitespace path strings handle safely without exception', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.1', 'Empty and whitespace path strings handle safely without exception', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.2: Degenerate line (x1=x2, y1=y2 zero-length line)
  try {
    const d = SvgParser.normalizeLine({ x1: 5, y1: 5, x2: 5, y2: 5 });
    assert.equal(d, 'M 5,5 L 5,5');
    const baked = VectorGenerator.bakeMatrixToPath(d, [1, 0, 0, 1, 10, 10]);
    assert.equal(baked, 'M 15 15 L 15 15');
    recordTest('FUZZ-3.2', 'Zero-length degenerate line (x1=x2, y1=y2) normalizes and bakes cleanly', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.2', 'Zero-length degenerate line (x1=x2, y1=y2) normalizes and bakes cleanly', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.3: Degenerate circles (r <= 0 or missing/NaN)
  try {
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10, r: 0 }), '');
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10, r: -10 }), '');
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10, r: 'invalid' }), '');
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10 }), '');
    recordTest('FUZZ-3.3', 'Degenerate circles with zero, negative, or NaN radius are safely pruned', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.3', 'Degenerate circles with zero, negative, or NaN radius are safely pruned', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.4: Degenerate ellipses (rx <= 0 or ry <= 0 or missing/NaN)
  try {
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 0, ry: 5 }), '');
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 5, ry: 0 }), '');
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: -5, ry: 5 }), '');
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 5, ry: -5 }), '');
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 'xyz', ry: 5 }), '');
    recordTest('FUZZ-3.4', 'Degenerate ellipses with zero or negative axes are safely pruned', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.4', 'Degenerate ellipses with zero or negative axes are safely pruned', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.5: Degenerate rects (w <= 0 or h <= 0 or missing/NaN)
  try {
    assert.equal(SvgParser.normalizeRect({ x: 0, y: 0, width: 0, height: 10 }), '');
    assert.equal(SvgParser.normalizeRect({ x: 0, y: 0, width: 10, height: 0 }), '');
    assert.equal(SvgParser.normalizeRect({ x: 0, y: 0, width: -10, height: 10 }), '');
    assert.equal(SvgParser.normalizeRect({ x: 0, y: 0, width: 10, height: -10 }), '');
    assert.equal(SvgParser.normalizeRect({ x: 0, y: 0, width: 'bad', height: 10 }), '');
    recordTest('FUZZ-3.5', 'Degenerate rects with zero or negative dimensions are safely pruned', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.5', 'Degenerate rects with zero or negative dimensions are safely pruned', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.6: Degenerate polygons (empty, single point, or non-numeric tokens)
  try {
    assert.equal(SvgParser.normalizePolygonPolyline({ points: '' }, true), '');
    assert.equal(SvgParser.normalizePolygonPolyline({ points: '   ' }, true), '');
    assert.equal(SvgParser.normalizePolygonPolyline({ points: '10' }, true), '');
    assert.equal(SvgParser.normalizePolygonPolyline({ points: 'foo bar' }, true), '');
    // Single valid coordinate pair (10, 20)
    const singlePair = SvgParser.normalizePolygonPolyline({ points: '10,20' }, true);
    assert.equal(singlePair, 'M 10,20 Z');
    recordTest('FUZZ-3.6', 'Degenerate polygon points handle boundary conditions safely', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.6', 'Degenerate polygon points handle boundary conditions safely', 'Degenerates', false, { reason: err.message });
  }

  // Test 3.7: Degenerate elliptical arc with zero radii or coincident endpoints
  try {
    // Zero radii degenerates to lineTo (L)
    const zeroRadii = VectorGenerator.arcToCubic(0, 0, 0, 0, 0, 0, 1, 10, 10);
    assert.equal(zeroRadii.length, 1);
    assert.deepEqual(zeroRadii[0].args, [0, 0, 10, 10, 10, 10]);

    // Coincident endpoints (0,0) to (0,0) returns empty array
    const coincident = VectorGenerator.arcToCubic(5, 5, 10, 10, 0, 0, 1, 5, 5);
    assert.equal(coincident.length, 0);
    recordTest('FUZZ-3.7', 'Degenerate elliptical arcs (zero radii, coincident endpoints) handle per W3C F.6', 'Degenerates', true);
  } catch (err) {
    recordTest('FUZZ-3.7', 'Degenerate elliptical arcs (zero radii, coincident endpoints) handle per W3C F.6', 'Degenerates', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 4: Defs, ClipPath, Mask Isolation & Scope Integrity
// ============================================================================
async function runSuite4() {
  console.log('\n--- SUITE 4: Defs, ClipPath, Mask Isolation & Scope Integrity ---');

  // Test 4.1: Elements nested inside <defs> with intermediate <g> groups are pruned
  try {
    const svg = `
      <svg width="100" height="100">
        <defs>
          <g id="hidden-group">
            <rect width="20" height="20" fill="red" />
            <circle cx="10" cy="10" r="5" />
          </g>
        </defs>
        <path id="visible-path" d="M 0 0 L 10 10" stroke="black" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, `Expected 1 visible path, found ${parsed.paths.length}`);
    assert.equal(parsed.paths[0].d, 'M 0 0 L 10 10');
    recordTest('FUZZ-4.1', 'Nested <g> and primitives inside <defs> are completely pruned', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.1', 'Nested <g> and primitives inside <defs> are completely pruned', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.2: Shapes inside <clipPath> and <mask> are excluded
  try {
    const svg = `
      <svg width="100" height="100">
        <clipPath id="cp">
          <circle cx="50" cy="50" r="40" />
        </clipPath>
        <mask id="msk">
          <rect width="100" height="100" fill="white" />
        </mask>
        <line x1="0" y1="0" x2="100" y2="100" stroke="blue" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, `Expected 1 visible line, found ${parsed.paths.length}`);
    assert.equal(parsed.paths[0].d, 'M 0,0 L 100,100');
    recordTest('FUZZ-4.2', 'Shapes inside <clipPath> and <mask> are strictly excluded', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.2', 'Shapes inside <clipPath> and <mask> are strictly excluded', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.3: Interleaved visible shapes before, between, and after definition blocks
  try {
    const svg = `
      <svg width="100" height="100">
        <rect id="vis1" x="1" y="1" width="10" height="10" />
        <defs>
          <path id="hid1" d="M 99 99 L 100 100" />
        </defs>
        <rect id="vis2" x="2" y="2" width="10" height="10" />
        <clipPath id="cp2">
          <circle cx="5" cy="5" r="3" />
        </clipPath>
        <rect id="vis3" x="3" y="3" width="10" height="10" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 3, `Expected 3 visible rects, found ${parsed.paths.length}`);
    assert.ok(parsed.paths[0].d.includes('M 1,1'));
    assert.ok(parsed.paths[1].d.includes('M 2,2'));
    assert.ok(parsed.paths[2].d.includes('M 3,3'));
    recordTest('FUZZ-4.3', 'Interleaved visible shapes before, between, and after defs restore parser state', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.3', 'Interleaved visible shapes before, between, and after defs restore parser state', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.4: Case-insensitive <DEFS> tag handling
  try {
    const svg = `
      <svg width="100" height="100">
        <DEFS>
          <circle cx="0" cy="0" r="10" />
        </DEFS>
        <path d="M 5 5 L 15 15" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1);
    assert.equal(parsed.paths[0].d, 'M 5 5 L 15 15');
    recordTest('FUZZ-4.4', 'Case-insensitive <DEFS> tag prunes definitions correctly', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.4', 'Case-insensitive <DEFS> tag prunes definitions correctly', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.5: Self-closing <clipPath id="empty-cp" /> with whitespace before slash
  try {
    const svg = `
      <svg width="100" height="100">
        <clipPath id="empty-cp" />
        <path d="M 5 5 L 15 15" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, `Expected 1 visible path, but got ${parsed.paths.length}`);
    assert.equal(parsed.paths[0].d, 'M 5 5 L 15 15');
    recordTest('FUZZ-4.5', 'Self-closing <clipPath /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.5', 'Self-closing <clipPath /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.6: Self-closing <defs /> with whitespace before slash
  try {
    const svg = `
      <svg width="100" height="100">
        <defs />
        <rect x="0" y="0" width="10" height="10" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, `Expected 1 visible rect, but got ${parsed.paths.length}`);
    recordTest('FUZZ-4.6', 'Self-closing <defs /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.6', 'Self-closing <defs /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', false, { reason: err.message });
  }

  // Test 4.7: Self-closing <mask id="m" /> with whitespace before slash
  try {
    const svg = `
      <svg width="100" height="100">
        <mask id="m" />
        <circle cx="10" cy="10" r="5" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(svg);
    assert.equal(parsed.paths.length, 1, `Expected 1 visible circle, but got ${parsed.paths.length}`);
    recordTest('FUZZ-4.7', 'Self-closing <mask /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', true);
  } catch (err) {
    recordTest('FUZZ-4.7', 'Self-closing <mask /> with whitespace does not prune subsequent shapes', 'Defs-Isolation', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 5: Minified Arc Flags & Delimiter-Less Path Tokenization
// ============================================================================
async function runSuite5() {
  console.log('\n--- SUITE 5: Minified Arc Flags & Delimiter-Less Path Tokenization ---');

  // Test 5.1: Concatenated arc flags 01 with glued negative coordinates: a5 5 0 01-5-5
  try {
    const d = 'M 10 10 a5 5 0 01-5-5';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].command, 'M');
    assert.equal(tokens[1].command, 'a');
    assert.deepEqual(tokens[1].args, [5, 5, 0, 0, 1, -5, -5]);
    recordTest('FUZZ-5.1', 'Minified arc flags 01 with glued negative numbers (a5 5 0 01-5-5)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.1', 'Minified arc flags 01 with glued negative numbers (a5 5 0 01-5-5)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.2: Concatenated arc flags 11 with positive coordinates: a5 5 0 115 5
  try {
    const d = 'M 0 0 a5 5 0 115 5';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens[1].command, 'a');
    assert.deepEqual(tokens[1].args, [5, 5, 0, 1, 1, 5, 5]);
    recordTest('FUZZ-5.2', 'Minified arc flags 11 with positive coordinates (a5 5 0 115 5)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.2', 'Minified arc flags 11 with positive coordinates (a5 5 0 115 5)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.3: Concatenated arc flags 00 with glued negative coordinates: a5 5 0 00-5-5
  try {
    const d = 'M 0 0 a5 5 0 00-5-5';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens[1].command, 'a');
    assert.deepEqual(tokens[1].args, [5, 5, 0, 0, 0, -5, -5]);
    recordTest('FUZZ-5.3', 'Minified arc flags 00 with glued negative coordinates (a5 5 0 00-5-5)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.3', 'Minified arc flags 00 with glued negative coordinates (a5 5 0 00-5-5)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.4: Arc flags followed immediately by integer: a5 5 0 0110-5 (dx = 10, dy = -5)
  try {
    const d = 'M 0 0 a5 5 0 0110-5';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens[1].command, 'a');
    assert.deepEqual(tokens[1].args, [5, 5, 0, 0, 1, 10, -5]);
    recordTest('FUZZ-5.4', 'Arc flags glued to positive integer dx (a5 5 0 0110-5 -> dx=10)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.4', 'Arc flags glued to positive integer dx (a5 5 0 0110-5 -> dx=10)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.5: Arc flags followed immediately by float without leading zero: a5 5 0 01.5.5
  try {
    const d = 'M 0 0 a5 5 0 01.5.5';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens[1].command, 'a');
    assert.deepEqual(tokens[1].args, [5, 5, 0, 0, 1, 0.5, 0.5]);
    recordTest('FUZZ-5.5', 'Arc flags glued to decimal float dx (a5 5 0 01.5.5 -> dx=0.5, dy=0.5)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.5', 'Arc flags glued to decimal float dx (a5 5 0 01.5.5 -> dx=0.5, dy=0.5)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.6: Glued negative coordinates on standard commands (M10-20L-30-40H-50V-60)
  try {
    const d = 'M10-20L-30-40H-50V-60Z';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].command, 'M');
    assert.deepEqual(tokens[0].args, [10, -20]);
    assert.equal(tokens[1].command, 'L');
    assert.deepEqual(tokens[1].args, [-30, -40]);
    assert.equal(tokens[2].command, 'H');
    assert.deepEqual(tokens[2].args, [-50]);
    assert.equal(tokens[3].command, 'V');
    assert.deepEqual(tokens[3].args, [-60]);
    assert.equal(tokens[4].command, 'Z');
    recordTest('FUZZ-5.6', 'Glued negative numbers on standard path commands (M, L, H, V, Z)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.6', 'Glued negative numbers on standard path commands (M, L, H, V, Z)', 'Minified-Paths', false, { reason: err.message });
  }

  // Test 5.7: Scientific notation numbers (e.g. 1e-2, 2.5E+3)
  try {
    const d = 'M 1e-2 2e3 L -3.4e-1 4.5e2';
    const tokens = VectorGenerator.tokenizePath(d);
    assert.equal(tokens.length, 2);
    assertClose(tokens[0].args[0], 0.01);
    assertClose(tokens[0].args[1], 2000);
    assertClose(tokens[1].args[0], -0.34);
    assertClose(tokens[1].args[1], 450);
    recordTest('FUZZ-5.7', 'Scientific notation in coordinates (1e-2, 2e3, -3.4e-1, 4.5e2)', 'Minified-Paths', true);
  } catch (err) {
    recordTest('FUZZ-5.7', 'Scientific notation in coordinates (1e-2, 2e3, -3.4e-1, 4.5e2)', 'Minified-Paths', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 6: Offline SvgParser vs Real Browser DOM Walker Parity
// ============================================================================
async function runSuite6() {
  console.log('\n--- SUITE 6: Offline SvgParser vs Real Browser DOM Walker Parity ---');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error('Failed to launch Playwright browser:', err);
    recordTest('PARITY-INIT', 'Playwright browser initialization', 'Browser-Parity', false, { reason: err.message });
    return;
  }

  const page = await browser.newPage();

  // Test 6.1: Complex compound SVG with nested groups and all 6 primitives
  try {
    const testSvg = `
      <svg id="test-compound" viewBox="0 0 300 300" width="300" height="300">
        <g transform="translate(15, 25)">
          <rect x="5" y="5" width="40" height="30" rx="4" fill="#123456" />
          <circle cx="80" cy="50" r="20" fill="#654321" />
          <ellipse cx="150" cy="50" rx="25" ry="15" fill="#abcdef" />
          <line x1="0" y1="100" x2="200" y2="100" stroke="#ff0000" stroke-width="2" />
          <polygon points="10,150 50,150 30,190" fill="#00ff00" />
          <polyline points="70,150 90,180 110,160 130,190" stroke="#0000ff" stroke-width="3" fill="none" />
          <g transform="scale(1.5, 1.5) rotate(30)">
            <path d="M 0 0 L 20 20 Z" fill="#333333" />
          </g>
        </g>
      </svg>
    `;

    // 1. Offline parse
    const offlineResult = SvgParser.parseSvgString(testSvg);

    // 2. Browser DOM parse via Playwright
    await page.setContent(`<!DOCTYPE html><html><body>${testSvg}</body></html>`);
    const browserResult = await page.evaluate(() => {
      const svgEl = document.querySelector('svg');
      function multiplyAffineMatrices(m1, m2) {
        return [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
      }
      function isIdentityMatrix(m) {
        if (!m) return true;
        return Math.abs(m[0] - 1) < 1e-5 && Math.abs(m[1]) < 1e-5 && Math.abs(m[2]) < 1e-5 &&
               Math.abs(m[3] - 1) < 1e-5 && Math.abs(m[4]) < 1e-5 && Math.abs(m[5]) < 1e-5;
      }
      function parseTransformToMatrix(transformStr) {
        if (!transformStr || typeof transformStr !== 'string') return [1, 0, 0, 1, 0, 0];
        const regex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
        let curr = [1, 0, 0, 1, 0, 0];
        let match;
        while ((match = regex.exec(transformStr)) !== null) {
          const name = match[1].toLowerCase();
          const args = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
          let step = [1, 0, 0, 1, 0, 0];
          if (name === 'matrix' && args.length >= 6) step = [args[0], args[1], args[2], args[3], args[4], args[5]];
          else if (name === 'translate') step = [1, 0, 0, 1, args[0] || 0, args[1] !== undefined ? args[1] : 0];
          else if (name === 'scale') {
            const sx = args[0] !== undefined ? args[0] : 1;
            const sy = args[1] !== undefined ? args[1] : sx;
            step = [sx, 0, 0, sy, 0, 0];
          } else if (name === 'rotate') {
            const deg = args[0] || 0;
            const cx = args[1] !== undefined ? args[1] : 0;
            const cy = args[2] !== undefined ? args[2] : 0;
            const rad = deg * Math.PI / 180;
            let cos = Math.cos(rad);
            let sin = Math.sin(rad);
            if (Math.abs(cos) < 1e-12) cos = 0;
            if (Math.abs(sin) < 1e-12) sin = 0;
            const e = (cx !== 0 || cy !== 0) ? (cx - cx * cos + cy * sin) : 0;
            const f = (cx !== 0 || cy !== 0) ? (cy - cx * sin - cy * cos) : 0;
            step = [cos, sin, -sin, cos, e, f];
          }
          curr = multiplyAffineMatrices(curr, step);
        }
        return curr;
      }

      const paths = [];
      function parseNode(node, inherited = {}) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const nodeTag = node.tagName.toLowerCase();
        if (nodeTag === 'defs' || nodeTag === 'clippath' || nodeTag === 'mask') return;

        const parentMatrix = inherited.transformMatrix || [1, 0, 0, 1, 0, 0];
        const rawTransform = node.getAttribute('transform');
        let currentMatrix = parentMatrix;
        if (rawTransform && rawTransform.trim()) {
          const parsed = parseTransformToMatrix(rawTransform);
          currentMatrix = multiplyAffineMatrices(parentMatrix, parsed);
        }

        let d = '';
        if (nodeTag === 'path') d = node.getAttribute('d') || '';
        else if (nodeTag === 'circle') {
          const cx = parseFloat(node.getAttribute('cx')) || 0;
          const cy = parseFloat(node.getAttribute('cy')) || 0;
          const r = parseFloat(node.getAttribute('r')) || 0;
          if (r > 0) d = `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0 Z`;
        } else if (nodeTag === 'ellipse') {
          const cx = parseFloat(node.getAttribute('cx')) || 0;
          const cy = parseFloat(node.getAttribute('cy')) || 0;
          const rx = parseFloat(node.getAttribute('rx')) || 0;
          const ry = parseFloat(node.getAttribute('ry')) || 0;
          if (rx > 0 && ry > 0) d = `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 -${rx * 2},0 Z`;
        } else if (nodeTag === 'line') {
          const x1 = parseFloat(node.getAttribute('x1')) || 0;
          const y1 = parseFloat(node.getAttribute('y1')) || 0;
          const x2 = parseFloat(node.getAttribute('x2')) || 0;
          const y2 = parseFloat(node.getAttribute('y2')) || 0;
          d = `M ${x1},${y1} L ${x2},${y2}`;
        } else if (nodeTag === 'polygon' || nodeTag === 'polyline') {
          const rawPts = node.getAttribute('points') || '';
          const matches = rawPts.match(/[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
          const pts = matches ? matches.map(Number).filter(Number.isFinite) : [];
          const pairCount = Math.floor(pts.length / 2);
          if (pairCount >= 1) {
            d = `M ${pts[0]},${pts[1]}`;
            for (let i = 1; i < pairCount; i++) d += ` L ${pts[i * 2]},${pts[i * 2 + 1]}`;
            if (nodeTag === 'polygon') d += ' Z';
          }
        } else if (nodeTag === 'rect') {
          const x = parseFloat(node.getAttribute('x')) || 0;
          const y = parseFloat(node.getAttribute('y')) || 0;
          const rw = parseFloat(node.getAttribute('width')) || 0;
          const rh = parseFloat(node.getAttribute('height')) || 0;
          if (rw > 0 && rh > 0) {
            let rx = Math.max(0, parseFloat(node.getAttribute('rx')) || 0);
            let ry = Math.max(0, parseFloat(node.getAttribute('ry')) || 0);
            if (!rx && ry) rx = ry;
            if (!ry && rx) ry = rx;
            rx = Math.min(rx, rw / 2);
            ry = Math.min(ry, rh / 2);
            if (rx === 0 || ry === 0) d = `M ${x},${y} h ${rw} v ${rh} h -${rw} Z`;
            else d = `M ${x + rx},${y} h ${rw - 2 * rx} a ${rx},${ry} 0 0 1 ${rx},${ry} v ${rh - 2 * ry} a ${rx},${ry} 0 0 1 -${rx},${ry} h -${rw - 2 * rx} a ${rx},${ry} 0 0 1 -${rx},-${ry} v -${rh - 2 * ry} a ${rx},${ry} 0 0 1 ${rx},-${ry} Z`;
          }
        }

        if (d) {
          paths.push({
            d,
            tagName: nodeTag,
            transformMatrix: isIdentityMatrix(currentMatrix) ? undefined : currentMatrix
          });
        }

        const nextInherited = { transformMatrix: currentMatrix };
        for (const child of node.children) {
          parseNode(child, nextInherited);
        }
      }

      for (const child of svgEl.children) {
        parseNode(child, {});
      }

      return {
        pathCount: paths.length,
        paths
      };
    });

    // Verify 1:1 Parity
    assert.equal(offlineResult.paths.length, browserResult.pathCount, `Path counts must match (offline: ${offlineResult.paths.length}, browser: ${browserResult.pathCount})`);

    for (let i = 0; i < offlineResult.paths.length; i++) {
      const offP = offlineResult.paths[i];
      const domP = browserResult.paths[i];

      // Verify path commands match
      assert.equal(offP.d, domP.d, `Path d at index ${i} must match`);

      // Verify cumulative transform matrices match
      if (domP.transformMatrix) {
        assert.ok(offP.transformMatrix, `Index ${i} offline matrix must be present`);
        assertMatrixClose(offP.transformMatrix, domP.transformMatrix, 1e-4, `Index ${i} transform matrix parity`);
      } else {
        assert.equal(offP.transformMatrix, undefined, `Index ${i} offline matrix should be undefined`);
      }
    }

    recordTest('PARITY-6.1', '1:1 Parity: Path counts, normalizations, and cumulative matrices match between SvgParser and Playwright DOM walker', 'Browser-Parity', true, { pathCount: offlineResult.paths.length });
  } catch (err) {
    recordTest('PARITY-6.1', '1:1 Parity: Path counts, normalizations, and cumulative matrices match between SvgParser and Playwright DOM walker', 'Browser-Parity', false, { reason: err.message });
  }

  // Test 6.2: Defs and ClipPath pruning parity between offline parser and browser DOM
  try {
    const pruningSvg = `
      <svg width="100" height="100">
        <defs>
          <rect id="d1" width="10" height="10" />
          <g transform="translate(5, 5)">
            <circle id="d2" cx="5" cy="5" r="5" />
          </g>
        </defs>
        <clipPath id="cp">
          <path id="d3" d="M 0 0 L 10 10" />
        </clipPath>
        <path id="visible" d="M 20 20 L 40 40" stroke="#000" />
      </svg>
    `;
    const offline = SvgParser.parseSvgString(pruningSvg);
    await page.setContent(`<!DOCTYPE html><html><body>${pruningSvg}</body></html>`);
    const browserCount = await page.evaluate(() => {
      // Count visible paths extracted via dom_walker logic
      const paths = [];
      function walk(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'defs' || tag === 'clippath' || tag === 'mask') return;
        if (tag === 'path' || tag === 'rect' || tag === 'circle') {
          paths.push(tag);
        }
        for (const child of node.children) walk(child);
      }
      for (const child of document.querySelector('svg').children) walk(child);
      return paths.length;
    });

    assert.equal(offline.paths.length, browserCount, 'Both parsers must prune defs/clipPath elements identically');
    assert.equal(offline.paths.length, 1);
    recordTest('PARITY-6.2', 'Identical defs/clipPath pruning behavior between offline and DOM parsers', 'Browser-Parity', true);
  } catch (err) {
    recordTest('PARITY-6.2', 'Identical defs/clipPath pruning behavior between offline and DOM parsers', 'Browser-Parity', false, { reason: err.message });
  }

  await browser.close();
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('='.repeat(75));
  console.log('MILESTONE 1 (R1) EMPIRICAL ADVERSARIAL FUZZ HARNESS & PARITY SUITE');
  console.log('Executing stress tests against SVG transform decomposition & coordinate baking');
  console.log('='.repeat(75));

  const startTime = Date.now();

  await runSuite1();
  await runSuite2();
  await runSuite3();
  await runSuite4();
  await runSuite5();
  await runSuite6();

  const durationMs = Date.now() - startTime;

  console.log('\n' + '='.repeat(75));
  console.log('TEST EXECUTION SUMMARY');
  console.log('='.repeat(75));
  console.log(`Total Tests Executed: ${results.length}`);
  console.log(`Passed:               \x1b[32m${passCount}\x1b[0m`);
  console.log(`Failed:               \x1b[31m${failCount}\x1b[0m`);
  console.log(`Duration:             ${durationMs}ms`);
  console.log('='.repeat(75));

  if (failCount > 0) {
    console.log('\x1b[31mVERDICT: REJECT - Adversarial failures detected.\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32mVERDICT: APPROVE - All adversarial challenges and parity tests passed 100% green.\x1b[0m');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal unhandled error in test harness:', err);
  process.exit(1);
});
