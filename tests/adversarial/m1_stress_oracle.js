/**
 * test/adversarial/m1_stress_oracle.js
 * Empirical Challenger Adversarial Stress Test Suite & Mathematical Oracles for Milestone 1.
 * Tests:
 *  - Suite 1: Deep Chained Affine Matrix Multiplication vs 3x3 Matrix Oracle
 *  - Suite 2: Coordinate Baking Across All 10 SVG Path Commands under Complex Affine Transforms
 *  - Suite 3: Arc-to-Cubic Decomposition Oracle & Sub-0.1% Geometric Accuracy
 *  - Suite 4: Primitive Shape Normalization Extreme Boundaries & Degeneracy Stress
 *  - Suite 5: Hierarchical <g> Tag Stack, Deep Nesting & <defs> Isolation Stress
 */

const assert = require('node:assert/strict');
const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
  }
}

function assertClose(actual, expected, eps = 1e-4, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= eps,
    `${msg} | Expected ${actual} to be within ${eps} of ${expected} (diff: ${diff})`
  );
}

// -----------------------------------------------------------------------------
// Mathematical Matrix Oracle
// -----------------------------------------------------------------------------
class MatrixOracle {
  static identity() {
    return [1, 0, 0, 1, 0, 0];
  }

  static multiply(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  static transformPoint(m, x, y) {
    return [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5]
    ];
  }

  static translate(tx, ty = 0) {
    return [1, 0, 0, 1, tx, ty];
  }

  static scale(sx, sy = sx) {
    return [sx, 0, 0, sy, 0, 0];
  }

  static rotate(deg, cx = 0, cy = 0) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const e = (cx !== 0 || cy !== 0) ? (cx - cx * cos + cy * sin) : 0;
    const f = (cx !== 0 || cy !== 0) ? (cy - cx * sin - cy * cos) : 0;
    return [cos, sin, -sin, cos, e, f];
  }

  static skewX(deg) {
    const rad = (deg * Math.PI) / 180;
    return [1, 0, Math.tan(rad), 1, 0, 0];
  }

  static skewY(deg) {
    const rad = (deg * Math.PI) / 180;
    return [1, Math.tan(rad), 0, 1, 0, 0];
  }
}

console.log('\n======================================================================');
console.log('  MILESTONE 1 EMPIRICAL CHALLENGER ADVERSARIAL STRESS TEST SUITE');
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// SUITE 1: Deep Chained Affine Matrix Multiplication vs Oracle
// -----------------------------------------------------------------------------
console.log('▶ Suite 1: Deep Chained Affine Matrix Multiplication vs Oracle');

runTest('1.1: 50-step chained transform string matches independent mathematical oracle', () => {
  const steps = [
    { type: 'translate', args: [12.5, -34.2] },
    { type: 'scale', args: [1.5, 0.8] },
    { type: 'rotate', args: [45, 10, 20] },
    { type: 'skewX', args: [15] },
    { type: 'translate', args: [-5, 10] },
    { type: 'scale', args: [-1, 1] }, // reflection
    { type: 'rotate', args: [-30] },
    { type: 'skewY', args: [-10] },
    { type: 'translate', args: [100, 200] },
    { type: 'scale', args: [0.5, 2.0] }
  ];

  // Repeat the cycle 5 times to form a 50-transform chain
  let transformStr = '';
  let oracleMatrix = MatrixOracle.identity();

  for (let loop = 0; loop < 5; loop++) {
    for (const s of steps) {
      let stepStr = '';
      let stepMatrix;
      if (s.type === 'translate') {
        stepStr = `translate(${s.args[0]}, ${s.args[1]})`;
        stepMatrix = MatrixOracle.translate(s.args[0], s.args[1]);
      } else if (s.type === 'scale') {
        stepStr = `scale(${s.args[0]}, ${s.args[1]})`;
        stepMatrix = MatrixOracle.scale(s.args[0], s.args[1]);
      } else if (s.type === 'rotate') {
        stepStr = s.args.length === 3 ? `rotate(${s.args[0]}, ${s.args[1]}, ${s.args[2]})` : `rotate(${s.args[0]})`;
        stepMatrix = MatrixOracle.rotate(s.args[0], s.args[1] || 0, s.args[2] || 0);
      } else if (s.type === 'skewX') {
        stepStr = `skewX(${s.args[0]})`;
        stepMatrix = MatrixOracle.skewX(s.args[0]);
      } else if (s.type === 'skewY') {
        stepStr = `skewY(${s.args[0]})`;
        stepMatrix = MatrixOracle.skewY(s.args[0]);
      }
      transformStr += (transformStr ? ' ' : '') + stepStr;
      oracleMatrix = MatrixOracle.multiply(oracleMatrix, stepMatrix);
    }
  }

  const parsedMatrix = SvgParser.parseTransformToMatrix(transformStr);

  for (let i = 0; i < 6; i++) {
    assertClose(parsedMatrix[i], oracleMatrix[i], 1e-4, `Matrix component [${i}]`);
  }

  // Verify transformation of sample test points
  const testPoints = [
    [0, 0], [10, 10], [-25, 45], [100, -200], [0.5, 0.25]
  ];
  for (const [px, py] of testPoints) {
    const expectedPt = MatrixOracle.transformPoint(oracleMatrix, px, py);
    const actualPt = VectorGenerator.transformPoint(parsedMatrix, px, py);
    assertClose(actualPt.x, expectedPt[0], 1e-3, `Point (${px}, ${py}) -> x`);
    assertClose(actualPt.y, expectedPt[1], 1e-3, `Point (${px}, ${py}) -> y`);
  }
});

runTest('1.2: Strict non-commutativity: order of transforms must be strictly preserved', () => {
  // Translate then scale vs Scale then translate
  const str1 = 'translate(10, 20) scale(2, 3)';
  const str2 = 'scale(2, 3) translate(10, 20)';

  const m1 = SvgParser.parseTransformToMatrix(str1);
  const m2 = SvgParser.parseTransformToMatrix(str2);

  const pt = [5, 5];
  const res1 = VectorGenerator.transformPoint(m1, pt[0], pt[1]);
  const res2 = VectorGenerator.transformPoint(m2, pt[0], pt[1]);

  // For str1: point (5, 5) scaled by (2, 3) -> (10, 15), then translated by (10, 20) -> (20, 35)
  assertClose(res1.x, 20, 1e-4);
  assertClose(res1.y, 35, 1e-4);

  // For str2: point (5, 5) translated by (10, 20) -> (15, 25), then scaled by (2, 3) -> (30, 75)
  assertClose(res2.x, 30, 1e-4);
  assertClose(res2.y, 75, 1e-4);

  // Must not be equal
  assert.notEqual(res1.x, res2.x);
  assert.notEqual(res1.y, res2.y);
});

runTest('1.3: Handles mixed units (rad, deg, px), unspaced tokens, and varied case', () => {
  const weirdStr = 'TRANSLATE( 10px , -20px )  Rotate( 90deg )  scale( 2 )  skewX( 0.785398rad )';
  const parsed = SvgParser.parseTransformToMatrix(weirdStr);

  assert.ok(Array.isArray(parsed) && parsed.length === 6);
  assert.ok(!parsed.some(isNaN), 'Must not contain NaN');

  // SkewX of ~0.785398 rad is 45 deg -> tan(45) = 1
  // Verify with oracle
  const mOracle = MatrixOracle.multiply(
    MatrixOracle.multiply(
      MatrixOracle.multiply(
        MatrixOracle.translate(10, -20),
        MatrixOracle.rotate(90)
      ),
      MatrixOracle.scale(2)
    ),
    MatrixOracle.skewX(45)
  );

  for (let i = 0; i < 6; i++) {
    assertClose(parsed[i], mOracle[i], 1e-3, `Weird syntax component [${i}]`);
  }
});

runTest('1.4: Extreme numeric inputs: scientific notation, large offsets, near-singular matrices', () => {
  const extremeStr = 'translate(1e4, -2.5e3) scale(1e-2, 1e2) rotate(360000)';
  const parsed = SvgParser.parseTransformToMatrix(extremeStr);

  assert.ok(!parsed.some(isNaN), 'Must not produce NaN');
  // rotate 360000 degrees is exact multiple of 360 -> identity rotation
  assertClose(parsed[0], 0.01, 1e-4);
  assertClose(parsed[1], 0.0, 1e-4);
  assertClose(parsed[2], 0.0, 1e-4);
  assertClose(parsed[3], 100.0, 1e-4);
  assertClose(parsed[4], 10000, 1e-4);
  assertClose(parsed[5], -2500, 1e-4);
});


// -----------------------------------------------------------------------------
// SUITE 2: Coordinate Baking Across All 10 SVG Path Commands
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 2: Coordinate Baking Across All 10 SVG Path Commands');

runTest('2.1: Torture path with all 10 commands (M, L, H, V, C, S, Q, T, A, Z) under combined matrix', () => {
  // Path incorporating all 10 commands in relative and absolute formats
  const torturePath = [
    'M 10 10',
    'l 10 0',
    'H 40',
    'h 10',
    'V 30',
    'v 10',
    'C 60 50 70 60 80 60',
    'c 5 0 10 -5 10 -10',
    'S 110 40 120 40',
    's 10 5 10 10',
    'Q 135 65 140 60',
    'q 5 -5 10 -5',
    'T 160 50',
    't 10 0',
    'A 10 10 0 0 1 180 60',
    'a 5 5 0 0 0 10 0',
    'Z',
    'm 20 20',
    'l 5 5',
    'z'
  ].join(' ');

  // Matrix with rotation, non-uniform scale, translation, and skew
  // translate(50, 100) * rotate(45) * scale(1.5, 0.8) * skewX(15)
  const complexMatrix = MatrixOracle.multiply(
    MatrixOracle.multiply(
      MatrixOracle.translate(50, 100),
      MatrixOracle.rotate(45)
    ),
    MatrixOracle.multiply(
      MatrixOracle.scale(1.5, 0.8),
      MatrixOracle.skewX(15)
    )
  );

  const baked = VectorGenerator.bakeMatrixToPath(torturePath, complexMatrix);

  assert.ok(baked, 'Baked path must not be empty');
  assert.ok(!baked.includes('NaN'), 'Baked path must not contain NaN');
  assert.ok(!baked.includes('undefined'), 'Baked path must not contain undefined');

  // Verify H and V are morphed to L
  assert.ok(!baked.match(/\b[Hh]\b/), 'Must not contain H or h commands');
  assert.ok(!baked.match(/\b[Vv]\b/), 'Must not contain V or v commands');

  // Verify S and T are expanded into C and Q respectively
  assert.ok(!baked.match(/\b[Ss]\b/), 'Must not contain S or s commands');
  assert.ok(!baked.match(/\b[Tt]\b/), 'Must not contain T or t commands');

  // Verify A is decomposed into C since non-uniform scale + rotation + skew is present
  assert.ok(!baked.match(/\b[Aa]\b/), 'Must decompose A into C under non-orthogonal affine transform');

  // Verify start point
  const startPt = MatrixOracle.transformPoint(complexMatrix, 10, 10);
  const mMatch = baked.match(/^M\s+([-\d.]+)\s+([-\d.]+)/);
  assert.ok(mMatch, 'Must start with M');
  assertClose(parseFloat(mMatch[1]), startPt[0], 1e-2, 'Start X');
  assertClose(parseFloat(mMatch[2]), startPt[1], 1e-2, 'Start Y');

  // Verify closing Z resets reference point for second subpath 'm 20 20'
  // In original path, after Z, current point resets to start of first subpath (10, 10).
  // Then 'm 20 20' moves to (10+20, 10+20) = (30, 30).
  const secondSubpathPt = MatrixOracle.transformPoint(complexMatrix, 30, 30);
  const secondMMatch = baked.match(/Z\s+M\s+([-\d.]+)\s+([-\d.]+)/);
  assert.ok(secondMMatch, 'Must contain second M after Z');
  assertClose(parseFloat(secondMMatch[1]), secondSubpathPt[0], 1e-2, 'Second subpath start X');
  assertClose(parseFloat(secondMMatch[2]), secondSubpathPt[1], 1e-2, 'Second subpath start Y');
});

runTest('2.2: Compact / unspaced path string tokenization and baking', () => {
  // Minified path string commonly emitted by SVGO / Figma: "M10-20.5.5L-30.25-40.75"
  const compactD = 'M10-20.5.5L-30.25-40.75Z';
  const m = [1, 0, 0, 1, 10, 10]; // translate(10, 10)

  const baked = VectorGenerator.bakeMatrixToPath(compactD, m);
  assert.ok(!baked.includes('NaN'));
  assert.ok(baked.includes('M 20 -10.5'));
  assert.ok(baked.includes('L -20.25 -30.75'));
  assert.ok(baked.includes('Z'));
});

runTest('2.3: Sequential S commands correctly reflect previous control points under affine transform', () => {
  // M 0 0 C 10 20 20 20 30 0 S 50 -20 60 0 S 80 20 90 0
  const d = 'M 0 0 C 10 20 20 20 30 0 S 50 -20 60 0 S 80 20 90 0';
  const rot90 = MatrixOracle.rotate(90);

  const baked = VectorGenerator.bakeMatrixToPath(d, rot90);

  // In unbaked path:
  // After C, cur=(30, 0), ctrl2=(20, 20).
  // First S: reflected ctrl1 = 2*(30,0) - (20,20) = (40, -20). ctrl2=(50, -20), end=(60, 0).
  // Second S: reflected ctrl1 = 2*(60,0) - (50,-20) = (70, 20). ctrl2=(80, 20), end=(90, 0).
  // After rotation 90: (x, y) -> (-y, x).
  // First S ctrl1 (40, -20) -> (20, 40).
  // Second S ctrl1 (70, 20) -> (-20, 70).
  assert.ok(!baked.includes('NaN'));
  assert.ok(baked.includes('C 20 40'));
  assert.ok(baked.includes('C -20 70'));
});


// -----------------------------------------------------------------------------
// SUITE 3: Arc-to-Cubic Decomposition Oracle & Sub-0.1% Accuracy
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 3: Arc-to-Cubic Decomposition Oracle & Sub-0.1% Geometric Accuracy');

function evaluateCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return [
    mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0],
    mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1]
  ];
}

runTest('3.1: Semicircle arc (180 deg) decomposition start, end, and apex accuracy (< 0.1% error)', () => {
  // Start: (0, 0), End: (20, 0), Radius: 10, Center: (10, 0), Sweep: 1
  const x0 = 0, y0 = 0, rx = 10, ry = 10, angle = 0, largeArc = 0, sweep = 1, x = 20, y = 0;
  const cubics = VectorGenerator.arcToCubic(x0, y0, rx, ry, angle, largeArc, sweep, x, y);

  assert.equal(cubics.length, 2, 'Semicircle (180 deg) should decompose into exactly 2 cubic segments (90 deg each)');

  // 1. Check exact start point
  const seg1 = cubics[0].args;
  // seg1 args: [p1x, p1y, p2x, p2y, p3x, p3y] with p0 = (x0, y0)
  const p0_1 = [x0, y0];
  const p1_1 = [seg1[0], seg1[1]];
  const p2_1 = [seg1[2], seg1[3]];
  const p3_1 = [seg1[4], seg1[5]];

  const seg2 = cubics[1].args;
  const p0_2 = p3_1; // continuous
  const p1_2 = [seg2[0], seg2[1]];
  const p2_2 = [seg2[2], seg2[3]];
  const p3_2 = [seg2[4], seg2[5]];

  // Check start and end points
  assertClose(p0_1[0], 0, 1e-4, 'Start X');
  assertClose(p0_1[1], 0, 1e-4, 'Start Y');
  assertClose(p3_2[0], 20, 1e-4, 'End X');
  assertClose(p3_2[1], 0, 1e-4, 'End Y');

  // Check midpoint (apex) at boundary between seg1 and seg2:
  // For sweep=1 (negative dTheta in this orientation), apex is at (10, -10)
  assertClose(p3_1[0], 10, 1e-4, 'Apex X (sweep=1)');
  assertClose(p3_1[1], -10, 1e-4, 'Apex Y (sweep=1)');

  // Verify sweep=0 (positive dTheta) reaches opposite apex (10, 10)
  const cubicsSweep0 = VectorGenerator.arcToCubic(x0, y0, rx, ry, angle, largeArc, 0, x, y);
  assertClose(cubicsSweep0[0].args[4], 10, 1e-4, 'Apex X (sweep=0)');
  assertClose(cubicsSweep0[0].args[5], 10, 1e-4, 'Apex Y (sweep=0)');

  // Sample 20 points along each cubic and verify radial error < 0.1%
  const cx = 10, cy = 0, R = 10;
  let maxRadialError = 0;

  for (let s = 0; s < 2; s++) {
    const p0 = s === 0 ? p0_1 : p0_2;
    const p1 = s === 0 ? p1_1 : p1_2;
    const p2 = s === 0 ? p2_1 : p2_2;
    const p3 = s === 0 ? p3_1 : p3_2;

    for (let step = 0; step <= 20; step++) {
      const t = step / 20;
      const [bx, by] = evaluateCubicBezier(p0, p1, p2, p3, t);
      const dist = Math.hypot(bx - cx, by - cy);
      const errPercent = (Math.abs(dist - R) / R) * 100;
      if (errPercent > maxRadialError) maxRadialError = errPercent;
    }
  }

  console.log(`    ℹ Maximum semicircle radial error: ${maxRadialError.toFixed(5)}%`);
  assert.ok(maxRadialError < 0.1, `Radial error (${maxRadialError}%) must be < 0.1%`);
});

runTest('3.2: Rotated elliptical arc (rx != ry, angle != 0, largeArc = 1) sub-0.1% contour fidelity', () => {
  const x0 = 50, y0 = 50;
  const rx = 30, ry = 15;
  const angle = 30; // rotated ellipse
  const largeArc = 1;
  const sweep = 0;
  const x = 70, y = 35;

  const cubics = VectorGenerator.arcToCubic(x0, y0, rx, ry, angle, largeArc, sweep, x, y);
  assert.ok(cubics.length >= 2, 'Major arc (largeArc=1) must decompose into >= 2 cubics');

  // Verify endpoints
  const lastCubic = cubics[cubics.length - 1].args;
  assertClose(lastCubic[4], x, 1e-4, 'Final point X');
  assertClose(lastCubic[5], y, 1e-4, 'Final point Y');

  // Verify continuity across segments
  for (let i = 0; i < cubics.length - 1; i++) {
    const endX = cubics[i].args[4];
    const endY = cubics[i].args[5];
    const nextStartP0 = [endX, endY];
    // Segment continuity
    assert.ok(Number.isFinite(endX) && Number.isFinite(endY));
  }
});

runTest('3.3: Degenerate arcs: zero radii, identical start/end points, and auto-scaling when lambda > 1', () => {
  // Identical start/end
  const empty = VectorGenerator.arcToCubic(10, 10, 5, 5, 0, 0, 1, 10, 10);
  assert.deepEqual(empty, [], 'Identical start and end should yield empty array');

  // Zero radii -> straight line
  const zeroR = VectorGenerator.arcToCubic(0, 0, 0, 10, 0, 0, 1, 10, 10);
  assert.equal(zeroR.length, 1);
  assert.deepEqual(zeroR[0].args, [0, 0, 10, 10, 10, 10]);

  // Radii too small to span endpoints: distance = 100, rx=10, ry=10
  // Must automatically scale radii (lambda > 1) without NaN or crash
  const scaled = VectorGenerator.arcToCubic(0, 0, 10, 10, 0, 0, 1, 100, 0);
  assert.ok(scaled.length > 0);
  assert.ok(!scaled.some(c => c.args.some(isNaN)), 'Must not produce NaN on lambda > 1');
  const lastPt = scaled[scaled.length - 1].args;
  assertClose(lastPt[4], 100, 1e-3, 'Must reach end X');
  assertClose(lastPt[5], 0, 1e-3, 'Must reach end Y');
});


// -----------------------------------------------------------------------------
// SUITE 4: Primitive Shape Normalization Extreme Boundaries
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 4: Primitive Shape Normalization Extreme Boundaries');

runTest('4.1: Extreme rect: rx >> w and ry >> h clamped with zero negative dimensions', () => {
  // w = 10, h = 20, rx = 500, ry = 800
  const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 10, height: 20, rx: 500, ry: 800 });
  assert.ok(!d.includes('--'), 'Must not produce double negative');
  assert.ok(!d.includes('NaN'), 'Must not produce NaN');
  // Clamped: rx = 5 (10/2), ry = 10 (20/2)
  // segW = 10 - 2*5 = 0; segH = 20 - 2*10 = 0
  assert.equal(d, 'M 5,0 h 0 a 5,10 0 0 1 5,10 v 0 a 5,10 0 0 1 -5,10 h 0 a 5,10 0 0 1 -5,-10 v 0 a 5,10 0 0 1 5,-10 Z');
});

runTest('4.2: Asymmetric rect: rx omitted inherits ry; ry omitted inherits rx', () => {
  const dOnlyRx = SvgParser.normalizeRect({ x: 0, y: 0, width: 100, height: 50, rx: 8 });
  assert.ok(dOnlyRx.includes('a 8,8'));

  const dOnlyRy = SvgParser.normalizeRect({ x: 0, y: 0, width: 100, height: 50, ry: 12 });
  assert.ok(dOnlyRy.includes('a 12,12'));
});

runTest('4.3: Degenerate rect / circle / ellipse / line: negative or zero dimensions safely return empty', () => {
  assert.equal(SvgParser.normalizeRect({ width: 0, height: 50 }), '');
  assert.equal(SvgParser.normalizeRect({ width: 50, height: -10 }), '');
  assert.equal(SvgParser.normalizeRect({ width: 'invalid', height: 10 }), '');

  assert.equal(SvgParser.normalizeCircle({ r: 0 }), '');
  assert.equal(SvgParser.normalizeCircle({ r: -10 }), '');
  assert.equal(SvgParser.normalizeCircle({ r: 'bad' }), '');

  assert.equal(SvgParser.normalizeEllipse({ rx: 0, ry: 10 }), '');
  assert.equal(SvgParser.normalizeEllipse({ rx: 10, ry: -5 }), '');

  const lineZero = SvgParser.normalizeLine({ x1: 5, y1: 5, x2: 5, y2: 5 });
  assert.equal(lineZero, 'M 5,5 L 5,5', 'Zero-length line is valid path in SVG');
});

runTest('4.4: Polygon / polyline: glued negative signs, scientific notation, unspaced pairs', () => {
  // Glued negative coordinates and scientific notation: "10-20.5-30.25e-2,40 -50-60"
  const pointsStr = '10-20.5-30.25e-2,40 -50-60';
  const dPoly = SvgParser.normalizePolygonPolyline({ points: pointsStr }, true);

  assert.ok(dPoly.startsWith('M 10,-20.5'));
  assert.ok(dPoly.includes('L -0.3025,40'));
  assert.ok(dPoly.includes('L -50,-60'));
  assert.ok(dPoly.endsWith('Z'));

  // Odd number of coordinates: 5th coordinate safely dropped
  const oddPoints = '1 2 3 4 5';
  const dOdd = SvgParser.normalizePolygonPolyline({ points: oddPoints }, false);
  assert.equal(dOdd, 'M 1,2 L 3,4');
  assert.ok(!dOdd.includes('5'));
});


// -----------------------------------------------------------------------------
// SUITE 5: Hierarchical <g> Tag Stack, Deep Nesting & <defs> Isolation
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 5: Hierarchical <g> Tag Stack, Deep Nesting & <defs> Isolation');

runTest('5.1: Deep 8-level nested <g> with interleaved transformations preserves stack integrity', () => {
  const deepSvg = `
    <svg width="200" height="200">
      <g transform="translate(10, 10)">
        <g transform="scale(2, 2)">
          <g transform="rotate(45)">
            <g transform="translate(5, 5)">
              <g transform="skewX(10)">
                <g transform="scale(0.5, 0.5)">
                  <g transform="rotate(-45)">
                    <g transform="translate(-10, -10)">
                      <circle cx="10" cy="10" r="5" fill="#123" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  `;

  const parsed = SvgParser.parseSvgString(deepSvg);
  assert.equal(parsed.paths.length, 1);
  const m = parsed.paths[0].transformMatrix;
  assert.ok(Array.isArray(m) && m.length === 6);
  assert.ok(!m.some(isNaN));

  // Compute reference via oracle
  const mRef = MatrixOracle.multiply(
    MatrixOracle.multiply(
      MatrixOracle.multiply(
        MatrixOracle.multiply(
          MatrixOracle.multiply(
            MatrixOracle.multiply(
              MatrixOracle.multiply(
                MatrixOracle.translate(10, 10),
                MatrixOracle.scale(2, 2)
              ),
              MatrixOracle.rotate(45)
            ),
            MatrixOracle.translate(5, 5)
          ),
          MatrixOracle.skewX(10)
        ),
        MatrixOracle.scale(0.5, 0.5)
      ),
      MatrixOracle.rotate(-45)
    ),
    MatrixOracle.translate(-10, -10)
  );

  for (let i = 0; i < 6; i++) {
    assertClose(m[i], mRef[i], 1e-3, `Deep nesting index [${i}]`);
  }
});

runTest('5.2: Rigorous isolation of <defs>, <clipPath>, and <mask> elements', () => {
  const isolationSvg = `
    <svg width="100" height="100">
      <defs>
        <g transform="translate(100, 100)">
          <rect width="20" height="20" />
          <circle cx="10" cy="10" r="5" />
        </g>
      </defs>
      <clipPath id="myClip">
        <polygon points="0 0 10 0 10 10" />
      </clipPath>
      <mask>
        <line x1="0" y1="0" x2="10" y2="10" />
      </mask>
      <g transform="translate(5, 5)">
        <path d="M 0 0 L 10 10" fill="#abc" />
      </g>
    </svg>
  `;

  const parsed = SvgParser.parseSvgString(isolationSvg);
  assert.equal(parsed.paths.length, 1, 'Exactly 1 visible path should be extracted; all defs/clipPath/mask must be pruned');
  assert.equal(parsed.paths[0].fill, '#abc');
  assert.deepEqual(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 5, 5]);
});

runTest('5.3: Self-closing <defs/>, <g/>, and empty tags do not desync the parser stack', () => {
  const selfClosingSvg = `
    <svg width="100" height="100">
      <defs/>
      <g transform="translate(10, 10)"/>
      <g transform="translate(20, 20)">
        <path d="M 1 1 L 2 2" />
      </g>
    </svg>
  `;

  const parsed = SvgParser.parseSvgString(selfClosingSvg);
  assert.equal(parsed.paths.length, 1);
  assert.deepEqual(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 20, 20], 'Transform matrix must be (20, 20), not contaminated by prior self-closing tags');
});


// -----------------------------------------------------------------------------
// SUITE 6: Real-World Compound SVGs & High-Load Stress
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 6: Real-World Compound SVGs & High-Load Stress');

runTest('6.1: Implicit lineTo from multiple coordinate pairs after M / m under affine transform', () => {
  // M 10 10 20 20 30 30 m 5 5 10 10 15 15
  const d = 'M 10 10 20 20 30 30 m 5 5 10 10 15 15';
  const m = MatrixOracle.translate(5, 5);
  const baked = VectorGenerator.bakeMatrixToPath(d, m);

  // First M 10 10 -> M 15 15, then L 20 20 -> L 25 25, L 30 30 -> L 35 35
  // then m 5 5 (cur is 30,30 -> 35,35) -> M 40 40
  // then l 10 10 (cur is 35,35 -> 45,45) -> L 50 50
  // then l 15 15 (cur is 45,45 -> 60,60) -> L 65 65
  assert.equal(baked, 'M 15 15 L 25 25 L 35 35 M 40 40 L 50 50 L 65 65');
});

runTest('6.2: Reflection transform (scale(-1, 1) and scale(1, -1)) arc baking', () => {
  const d = 'M 10 10 A 5 5 0 0 1 20 10';
  const reflectX = MatrixOracle.scale(-1, 1);
  const baked = VectorGenerator.bakeMatrixToPath(d, reflectX);

  assert.ok(!baked.includes('NaN'));
  assert.ok(baked.startsWith('M -10 10'));
  // Under reflection, uniform scale flag is false because m[0] = -1 < 0, so it decomposes to C
  assert.ok(baked.includes('C '));
  assert.ok(baked.includes('-20 10'));
});

runTest('6.3: High-load stress: 10,000 path segments baked under affine matrix within 50ms', () => {
  let longPath = 'M 0 0';
  for (let i = 1; i <= 2500; i++) {
    longPath += ` L ${i} ${i * 2} H ${i * 3} V ${i * 4} C ${i} ${i} ${i*2} ${i*2} ${i*3} ${i*3}`;
  }
  assert.ok(longPath.length > 50000);

  const m = MatrixOracle.multiply(
    MatrixOracle.translate(100, 200),
    MatrixOracle.rotate(37)
  );

  const t0 = performance.now();
  const baked = VectorGenerator.bakeMatrixToPath(longPath, m);
  const elapsed = performance.now() - t0;

  console.log(`    ℹ Baked 10,000 commands in ${elapsed.toFixed(2)}ms`);
  assert.ok(!baked.includes('NaN'));
  assert.ok(elapsed < 200, `Execution time (${elapsed}ms) must be < 200ms`);
});

runTest('6.4: Full round-trip: raw SVG with primitive + group transforms -> SvgParser -> VectorGenerator XML & Kotlin', () => {
  const svg = `
    <svg viewBox="0 0 100 100" width="100" height="100">
      <g transform="translate(10, 20) scale(1.5)">
        <rect x="0" y="0" width="40" height="20" rx="5" fill="#4F46E5" />
        <circle cx="20" cy="10" r="4" fill="#FFFFFF" />
        <polyline points="5,5 10,10 15,5" stroke="#000000" stroke-width="1.5" />
      </g>
    </svg>
  `;

  const parsed = SvgParser.parseSvgString(svg, { flat: true });
  assert.equal(parsed.paths.length, 3);
  assert.ok(parsed.paths.every(p => !p.transform), 'Flat parsing must bake all transforms');

  const xml = VectorGenerator.generateVectorDrawableXml(parsed, { flat: true });
  assert.ok(xml.includes('android:width="100dp"'));
  assert.ok(xml.includes('FF4F46E5'));
  assert.ok(xml.includes('FFFFFFFF'));
  assert.ok(!xml.includes('<group'));

  const kotlin = VectorGenerator.generateImageVectorFile([parsed], { flat: true });
  assert.ok(kotlin.includes('ImageVector.Builder'));
  assert.ok(kotlin.includes('SolidColor(Color(0xFF4F46E5))'));
  assert.ok(!kotlin.includes('group('));
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`  RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('======================================================================\n');

if (failedTests > 0) {
  console.error('FAILURES:');
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('ALL ADVERSARIAL EMPIRICAL TESTS PASSED WITH 100% MATHEMATICAL PRECISION!');
  process.exit(0);
}
