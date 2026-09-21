/**
 * tests/unit/svg_transform_baking.test.js
 * Comprehensive unit test suite for Milestone M1 / R1:
 * SVG Transform Decomposition, Hierarchical Matrix Baking, and Primitive Shape Normalization.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

// Helper to assert numbers within epsilon
function assertClose(actual, expected, eps = 1e-4, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${msg} Expected ${actual} to be within ${eps} of ${expected}`
  );
}

// Helper to assert point within epsilon
function assertPointClose(actual, expected, eps = 1e-4, msg = '') {
  assertClose(actual.x, expected.x, eps, `${msg} (x)`);
  assertClose(actual.y, expected.y, eps, `${msg} (y)`);
}

describe('Suite 1: Affine Matrix Math & Transform Parsing', () => {
  test('Test 1.1: Parses identity matrix and matrix(a, b, c, d, e, f)', () => {
    const idMat = SvgParser.parseTransformToMatrix('matrix(1, 0, 0, 1, 0, 0)');
    assert.deepEqual(idMat, [1, 0, 0, 1, 0, 0]);
    assert.equal(SvgParser.isIdentityMatrix(idMat), true);

    const customStr = 'matrix(2, 0.5, -0.5, 3, 10.5, -20.25)';
    const customMat = SvgParser.parseTransformToMatrix(customStr);
    assert.deepEqual(customMat, [2, 0.5, -0.5, 3, 10.5, -20.25]);
    assert.equal(SvgParser.isIdentityMatrix(customMat), false);

    const parsedDecomp = VectorGenerator.parseTransform(customStr);
    assert.equal(parsedDecomp.type, 'matrix');
    assert.equal(parsedDecomp.translationX, 10.5);
    assert.equal(parsedDecomp.translationY, -20.25);
    assert.equal(parsedDecomp.a, 2);
    assert.equal(parsedDecomp.b, 0.5);
    assert.equal(parsedDecomp.c, -0.5);
    assert.equal(parsedDecomp.d, 3);
    assert.equal(parsedDecomp.scaleX, 2.062);
    assert.deepEqual(parsedDecomp.matrix, [2, 0.5, -0.5, 3, 10.5, -20.25]);

    const pureScaleMat = VectorGenerator.parseTransform('matrix(2 0 0 3 10.5 -20.25)');
    assert.equal(pureScaleMat.scaleX, 2);
    assert.equal(pureScaleMat.scaleY, 3);
  });

  test('Test 1.2: Parses translate(tx) and translate(tx, ty) with positive, negative, and float offsets', () => {
    const single = SvgParser.parseTransformToMatrix('translate(15)');
    assert.deepEqual(single, [1, 0, 0, 1, 15, 0]);

    const dual = SvgParser.parseTransformToMatrix('translate(14.5, -22.75)');
    assert.deepEqual(dual, [1, 0, 0, 1, 14.5, -22.75]);

    const pt = VectorGenerator.transformPoint({ x: 10, y: 10 }, dual);
    assertClose(pt.x, 24.5);
    assertClose(pt.y, -12.75);
  });

  test('Test 1.3: Parses scale(sx) uniform and scale(sx, sy) non-uniform, including reflections', () => {
    const uniform = SvgParser.parseTransformToMatrix('scale(2)');
    assert.deepEqual(uniform, [2, 0, 0, 2, 0, 0]);

    const nonUniform = SvgParser.parseTransformToMatrix('scale(3, -4)');
    assert.deepEqual(nonUniform, [3, 0, 0, -4, 0, 0]);

    const pt = VectorGenerator.transformPoint({ x: 5, y: 5 }, nonUniform);
    assertClose(pt.x, 15);
    assertClose(pt.y, -20);
  });

  test('Test 1.4: Parses rotate(deg) around origin and rotate(deg, cx, cy) with explicit pivot', () => {
    const rotOrigin = SvgParser.parseTransformToMatrix('rotate(90)');
    assertClose(rotOrigin[0], 0);
    assertClose(rotOrigin[1], 1);
    assertClose(rotOrigin[2], -1);
    assertClose(rotOrigin[3], 0);
    assertClose(rotOrigin[4], 0);
    assertClose(rotOrigin[5], 0);

    const pt1 = VectorGenerator.transformPoint({ x: 10, y: 0 }, rotOrigin);
    assertPointClose(pt1, { x: 0, y: 10 });

    // Rotate 90 deg around pivot (10, 10)
    // Point (10, 20) rotated 90 deg clockwise around (10, 10) -> (0, 10)
    const rotPivot = SvgParser.parseTransformToMatrix('rotate(90, 10, 10)');
    const pt2 = VectorGenerator.transformPoint({ x: 10, y: 20 }, rotPivot);
    assertPointClose(pt2, { x: 0, y: 10 });
  });

  test('Test 1.5: Parses skewX(angle) and skewY(angle) with correct trigonometric tangents', () => {
    const skewX = SvgParser.parseTransformToMatrix('skewX(45)');
    assertClose(skewX[0], 1);
    assertClose(skewX[1], 0);
    assertClose(skewX[2], 1); // tan(45) = 1
    assertClose(skewX[3], 1);

    const ptX = VectorGenerator.transformPoint({ x: 10, y: 10 }, skewX);
    assertPointClose(ptX, { x: 20, y: 10 });

    const skewY = SvgParser.parseTransformToMatrix('skewY(45)');
    assertClose(skewY[0], 1);
    assertClose(skewY[1], 1); // tan(45) = 1
    assertClose(skewY[2], 0);
    assertClose(skewY[3], 1);

    const ptY = VectorGenerator.transformPoint({ x: 10, y: 10 }, skewY);
    assertPointClose(ptY, { x: 10, y: 20 });

    const parsed = VectorGenerator.parseTransform('skewX(30)');
    assert.equal(parsed.hasSkew, true);
  });

  test('Test 1.6: Decomposes chained transforms (translate + scale + rotate) via 2D matrix multiplication', () => {
    // Chain: translate(10, 20) scale(2, 2)
    // Point (5, 5) -> scale first (10, 10), then translate (20, 30)
    const chained = SvgParser.parseTransformToMatrix('translate(10, 20) scale(2, 2)');
    const pt = VectorGenerator.transformPoint({ x: 5, y: 5 }, chained);
    assertPointClose(pt, { x: 20, y: 30 });

    // Multi-chain: translate(5, 5) rotate(90) translate(-5, -5) -> effectively rotate(90, 5, 5)
    const chainRot = SvgParser.parseTransformToMatrix('translate(5, 5) rotate(90) translate(-5, -5)');
    const directRot = SvgParser.parseTransformToMatrix('rotate(90, 5, 5)');
    for (let i = 0; i < 6; i++) {
      assertClose(chainRot[i], directRot[i], 1e-4, `Index ${i}`);
    }
  });

  test('Test 1.7: Handles whitespace, commas, and malformed transform strings gracefully', () => {
    const messy = SvgParser.parseTransformToMatrix('  translate(  10 ,  20  )   scale( 2 )  ');
    const pt = VectorGenerator.transformPoint({ x: 1, y: 1 }, messy);
    assertPointClose(pt, { x: 12, y: 22 });

    const empty = SvgParser.parseTransformToMatrix('');
    assert.deepEqual(empty, [1, 0, 0, 1, 0, 0]);

    const malformed = SvgParser.parseTransformToMatrix('invalidFunc(123) matrix(bad)');
    assert.deepEqual(malformed, [1, 0, 0, 1, 0, 0]);
  });
});

describe('Suite 2: Hierarchical <g> Transform Concatenation', () => {
  test('Test 2.1: Multiplies translation down two-level nested <g> groups (cumulative offset)', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g transform="translate(10, 20)">
          <g transform="translate(5, 15)">
            <rect x="0" y="0" width="10" height="10" fill="#000" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    assert.deepEqual(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 15, 35]);
    assert.equal(parsed.paths[0].transform, 'matrix(1 0 0 1 15 35)');
  });

  test('Test 2.2: Multiplies heterogeneous transforms across three-level nested <g> groups (translate -> scale -> rotate)', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g transform="translate(10, 20)">
          <g transform="scale(2, 2)">
            <g transform="rotate(90)">
              <line x1="0" y1="0" x2="10" y2="0" stroke="#000" />
            </g>
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    const m = parsed.paths[0].transformMatrix;
    // T(10, 20) * S(2, 2) * R(90)
    // Point (10, 0): R(90) -> (0, 10); S(2, 2) -> (0, 20); T(10, 20) -> (10, 40)
    const pt = VectorGenerator.transformPoint({ x: 10, y: 0 }, m);
    assertPointClose(pt, { x: 10, y: 40 });
  });

  test('Test 2.3: Combines parent <g> transform with element-level transform on child path', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g transform="translate(10, 20)">
          <path d="M 0 0 L 5 5" transform="scale(3, 3)" stroke="#000" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    assert.deepEqual(parsed.paths[0].transformMatrix, [3, 0, 0, 3, 10, 20]);
  });

  test('Test 2.4: Guarantees sibling <g> branches do not leak or cross-contaminate transforms', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g transform="translate(50, 50)">
          <path id="p1" d="M 0 0 L 1 1" />
        </g>
        <g transform="translate(-20, -10)">
          <path id="p2" d="M 0 0 L 2 2" />
        </g>
        <path id="p3" d="M 0 0 L 3 3" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 3);
    assert.deepEqual(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 50, 50]);
    assert.deepEqual(parsed.paths[1].transformMatrix, [1, 0, 0, 1, -20, -10]);
    assert.equal(parsed.paths[2].transformMatrix, undefined);
    assert.equal(parsed.paths[2].transform, undefined);
  });

  test('Test 2.5: Inherits fill-rule and stroke properties alongside cumulative transforms', () => {
    const rawSvg = `
      <svg width="100" height="100">
        <g fill-rule="evenodd" stroke="#ff0000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="bevel" transform="translate(5, 5)">
          <path d="M 0 0 L 10 10" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    const p = parsed.paths[0];
    assert.equal(p.fillRule, 'evenodd');
    assert.equal(p.stroke, '#ff0000');
    assert.equal(p.strokeWidth, 2.5);
    assert.equal(p.strokeLinecap, 'round');
    assert.equal(p.strokeLinejoin, 'bevel');
    assert.deepEqual(p.transformMatrix, [1, 0, 0, 1, 5, 5]);
  });
});

describe('Suite 3: Primitive SVG Shape Normalization', () => {
  test('Test 3.1: Normalizes <rect> without rx/ry to valid closed path (M x,y h w v h h -w Z)', () => {
    const d = SvgParser.normalizeRect({ x: 5, y: 10, width: 40, height: 30 });
    assert.equal(d, 'M 5,10 h 40 v 30 h -40 Z');
  });

  test('Test 3.2: Normalizes <rect> with symmetric rx to rounded path starting at M (x+rx),y', () => {
    const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 100, height: 50, rx: 10 });
    assert.equal(d, 'M 10,0 h 80 a 10,10 0 0 1 10,10 v 30 a 10,10 0 0 1 -10,10 h -80 a 10,10 0 0 1 -10,-10 v -30 a 10,10 0 0 1 10,-10 Z');
  });

  test('Test 3.3: Normalizes <rect> with asymmetric rx and ry to rounded path', () => {
    const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 100, height: 50, rx: 10, ry: 20 });
    assert.equal(d, 'M 10,0 h 80 a 10,20 0 0 1 10,20 v 10 a 10,20 0 0 1 -10,20 h -80 a 10,20 0 0 1 -10,-20 v -10 a 10,20 0 0 1 10,-20 Z');
  });

  test('Test 3.4: Enforces half-dimension clamping when rx > w/2 or ry > h/2 (zero negative segments)', () => {
    // w = 20, h = 40, rx = 25 (> 10), ry = 50 (> 20)
    // Clamped: rx = 10, ry = 20. Horizontal segment: w - 2*rx = 0.
    const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 20, height: 40, rx: 25, ry: 50 });
    assert.equal(d, 'M 10,0 h 0 a 10,20 0 0 1 10,20 v 0 a 10,20 0 0 1 -10,20 h 0 a 10,20 0 0 1 -10,-20 v 0 a 10,20 0 0 1 10,-20 Z');
    assert.ok(!d.includes('--'), 'Must not produce double negative');
    assert.ok(!d.includes('h -'), 'Horizontal segment must be >= 0');
  });

  test('Test 3.5: Normalizes <rect> pill button (rx = w/2) without coordinate inversion', () => {
    // Width 40, Height 20, rx = 10, ry = 10 -> pill on vertical axis: h - 2*ry = 0
    const d = SvgParser.normalizeRect({ x: 10, y: 20, width: 40, height: 20, rx: 10, ry: 10 });
    assert.equal(d, 'M 20,20 h 20 a 10,10 0 0 1 10,10 v 0 a 10,10 0 0 1 -10,10 h -20 a 10,10 0 0 1 -10,-10 v 0 a 10,10 0 0 1 10,-10 Z');
  });

  test('Test 3.6: Rejects or prunes <rect> with zero or negative width/height', () => {
    assert.equal(SvgParser.normalizeRect({ width: 0, height: 10 }), '');
    assert.equal(SvgParser.normalizeRect({ width: -5, height: 10 }), '');
    assert.equal(SvgParser.normalizeRect({ width: 10, height: 0 }), '');
    assert.equal(SvgParser.normalizeRect({ width: 10, height: -2 }), '');
  });

  test('Test 3.7: Normalizes <circle> (cx, cy, r) to standard 2-arc path starting at M (cx-r),cy', () => {
    const d = SvgParser.normalizeCircle({ cx: 24, cy: 24, r: 10 });
    assert.equal(d, 'M 14,24 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 Z');
  });

  test('Test 3.8: Rejects or prunes <circle> with zero or negative radius', () => {
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10, r: 0 }), '');
    assert.equal(SvgParser.normalizeCircle({ cx: 10, cy: 10, r: -5 }), '');
  });

  test('Test 3.9: Normalizes <ellipse> (cx, cy, rx, ry) to standard 2-arc path starting at M (cx-rx),cy', () => {
    const d = SvgParser.normalizeEllipse({ cx: 50, cy: 30, rx: 20, ry: 15 });
    assert.equal(d, 'M 30,30 a 20,15 0 1,0 40,0 a 20,15 0 1,0 -40,0 Z');
  });

  test('Test 3.10: Rejects or prunes <ellipse> with zero or negative rx/ry', () => {
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 0, ry: 10 }), '');
    assert.equal(SvgParser.normalizeEllipse({ cx: 10, cy: 10, rx: 10, ry: -5 }), '');
  });

  test('Test 3.11: Normalizes <line> (x1, y1, x2, y2) to M x1,y1 L x2,y2 with stroke attributes', () => {
    const d = SvgParser.normalizeLine({ x1: 5, y1: 10, x2: 25, y2: 30 });
    assert.equal(d, 'M 5,10 L 25,30');
  });

  test('Test 3.12: Normalizes <polygon> to closed path M ... L ... Z', () => {
    const d = SvgParser.normalizePolygonPolyline({ points: '0,0 10,0 10,10 0,10' }, true);
    assert.equal(d, 'M 0,0 L 10,0 L 10,10 L 0,10 Z');
  });

  test('Test 3.13: Normalizes <polyline> to open path M ... L ... (no Z)', () => {
    const d = SvgParser.normalizePolygonPolyline({ points: '0,0 10,0 10,10' }, false);
    assert.equal(d, 'M 0,0 L 10,0 L 10,10');
  });

  test('Test 3.14: Preserves local transforms attached directly to primitive elements', () => {
    const rawSvg = '<svg width="50" height="50"><circle cx="10" cy="10" r="5" transform="translate(100, 200)"/></svg>';
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    assert.deepEqual(parsed.paths[0].transformMatrix, [1, 0, 0, 1, 100, 200]);
    assert.equal(parsed.paths[0].transform, 'translate(100, 200)');
  });
});

describe('Suite 4: Coordinate Baking Engine (bakeMatrixToPath)', () => {
  test('Test 4.1: Bakes pure translation matrix directly into absolute path coordinates (x+e, y+f)', () => {
    const d = 'M 10 10 L 20 30 Z';
    const matrix = [1, 0, 0, 1, 5, -5];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M 15 5 L 25 25 Z');
  });

  test('Test 4.2: Bakes pure scale matrix directly into coordinates (sx*x, sy*y)', () => {
    const d = 'M 10 20 L 30 40';
    const matrix = [2, 0, 0, 3, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M 20 60 L 60 120');
  });

  test('Test 4.3: Bakes rotation matrix into linear segments, converting H and V into 2D lineTo (L)', () => {
    const d = 'M 10 10 H 20 V 30';
    // 90 deg clockwise around origin: [0, 1, -1, 0, 0, 0]
    // (10, 10) -> (-10, 10)
    // H 20 is (20, 10) -> (-10, 20)
    // V 30 is (20, 30) -> (-30, 20)
    const rot90 = [0, 1, -1, 0, 0, 0];
    const baked = VectorGenerator.bakeMatrixToPath(d, rot90);
    assert.ok(!baked.includes('H') && !baked.includes('V'), 'H and V must be morphed to L under rotation');
    assert.ok(baked.startsWith('M -10 10 L -10 20 L -30 20'), `Got: ${baked}`);
  });

  test('Test 4.4: Bakes affine matrix into cubic Bézier curves (C/c, S/s) transforming all control points', () => {
    const d = 'M 0 0 C 10 10 20 20 30 30 S 40 40 50 50';
    const matrix = [2, 0, 0, 2, 10, 10]; // scale 2 + translate (10, 10)
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    // (0, 0) -> (10, 10)
    // (10, 10) -> (30, 30)
    // (20, 20) -> (50, 50)
    // (30, 30) -> (70, 70)
    // S 40 40 50 50 expanded or preserved: (40, 40) -> (90, 90), (50, 50) -> (110, 110)
    assert.ok(baked.includes('M 10 10'));
    assert.ok(baked.includes('C 30 30 50 50 70 70'));
    assert.ok(baked.includes('90 90 110 110'));
  });

  test('Test 4.5: Bakes affine matrix into quadratic Bézier curves (Q/q, T/t)', () => {
    const d = 'M 0 0 Q 10 20 20 20 T 40 40';
    const matrix = [1, 0, 0, 1, 5, 5];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.ok(baked.startsWith('M 5 5 Q 15 25 25 25'));
    assert.ok(baked.includes('45 45'));
  });

  test('Test 4.6: Bakes transform into closed compound paths with multiple subpaths (M ... Z M ... Z)', () => {
    const d = 'M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 20 L 30 30 Z';
    const matrix = [1, 0, 0, 1, 5, 5];
    const baked = VectorGenerator.bakeMatrixToPath(d, matrix);
    assert.equal(baked, 'M 5 5 L 15 5 L 15 15 Z M 25 25 L 35 25 L 35 35 Z');
  });

  test('Test 4.7: Bakes transform on normalized primitive shapes (rect, circle, polygon) into flat coordinates', () => {
    const rectD = SvgParser.normalizeRect({ x: 0, y: 0, width: 10, height: 10 });
    const matrix = [1, 0, 0, 1, 20, 30];
    const baked = VectorGenerator.bakeMatrixToPath(rectD, matrix);
    // M 0,0 h 10 v 10 h -10 Z translated by (20, 30) -> M 20 30 h 10 v 10 h -10 Z
    assert.ok(baked.startsWith('M 20 30'));
    assert.ok(baked.endsWith('Z'));
  });
});

describe('Suite 5: Parser Parity (DOM Walker vs Offline SvgParser & Vector Generator)', () => {
  test('Test 5.1: Verifies identical path counts and path commands for complex multi-primitive SVG', () => {
    const complexSvg = `
      <svg viewBox="0 0 100 100" width="100" height="100">
        <rect x="5" y="5" width="20" height="20" fill="#ff0000" />
        <circle cx="50" cy="50" r="15" fill="#00ff00" />
        <ellipse cx="80" cy="50" rx="10" ry="15" fill="#0000ff" />
        <line x1="0" y1="0" x2="100" y2="100" stroke="#000" />
        <polygon points="10,80 30,80 20,95" fill="#ffff00" />
        <path d="M 60 80 L 80 80" stroke="#333" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(complexSvg);
    assert.equal(parsed.paths.length, 6);
    assert.equal(parsed.width, 100);
    assert.equal(parsed.height, 100);
    assert.equal(parsed.viewBox, '0 0 100 100');

    // Confirm each primitive normalized to valid d
    assert.match(parsed.paths[0].d, /^M\s+5,5/);   // rect
    assert.match(parsed.paths[1].d, /^M\s+35,50/);  // circle cx-r = 35
    assert.match(parsed.paths[2].d, /^M\s+70,50/);  // ellipse cx-rx = 70
    assert.equal(parsed.paths[3].d, 'M 0,0 L 100,100'); // line
    assert.equal(parsed.paths[4].d, 'M 10,80 L 30,80 L 20,95 Z'); // polygon
    assert.equal(parsed.paths[5].d, 'M 60 80 L 80 80'); // path
  });

  test('Test 5.2: Verifies identical cumulative transform matrices on deeply nested primitive elements', () => {
    const nestedSvg = `
      <svg width="200" height="200">
        <g transform="translate(10, 10)">
          <circle cx="5" cy="5" r="5" transform="scale(2)" />
          <g transform="translate(20, 30)">
            <rect x="0" y="0" width="10" height="10" transform="rotate(45)" />
          </g>
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(nestedSvg);
    assert.equal(parsed.paths.length, 2);

    // Path 1 (circle): T(10, 10) * S(2, 2) = [2, 0, 0, 2, 10, 10]
    assert.deepEqual(parsed.paths[0].transformMatrix, [2, 0, 0, 2, 10, 10]);

    // Path 2 (rect): T(10, 10) * T(20, 30) * R(45) = T(30, 40) * R(45)
    const expected = SvgParser.multiplyMatrices(
      [1, 0, 0, 1, 30, 40],
      SvgParser.parseTransformToMatrix('rotate(45)')
    );
    for (let i = 0; i < 6; i++) {
      assertClose(parsed.paths[1].transformMatrix[i], expected[i], 1e-4);
    }
  });

  test('Test 5.3: Verifies identical color, stroke-width, and fill-rule cascading across parsers', () => {
    const cascadingSvg = `
      <svg width="100" height="100">
        <g fill="#123456" stroke="#654321" stroke-width="3" fill-rule="evenodd">
          <rect width="10" height="10" />
          <path d="M 0 0 L 1 1" fill="#abcdef" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(cascadingSvg);
    assert.equal(parsed.paths.length, 2);

    // rect inherits all group styles
    assert.equal(parsed.paths[0].fill, '#123456');
    assert.equal(parsed.paths[0].stroke, '#654321');
    assert.equal(parsed.paths[0].strokeWidth, 3);
    assert.equal(parsed.paths[0].fillRule, 'evenodd');

    // path overrides fill, inherits stroke, stroke-width, fill-rule
    assert.equal(parsed.paths[1].fill, '#abcdef');
    assert.equal(parsed.paths[1].stroke, '#654321');
    assert.equal(parsed.paths[1].strokeWidth, 3);
    assert.equal(parsed.paths[1].fillRule, 'evenodd');
  });

  test('Test 5.4: Verifies identical vector output for Claude Design compound action badge fixture', () => {
    const badgeSvg = `
      <svg width="64" height="64" viewBox="0 0 64 64">
        <g transform="translate(8, 8)">
          <rect width="48" height="48" rx="8" fill="#4F46E5" />
          <path d="M 12 24 L 24 36 L 36 12" stroke="#FFFFFF" stroke-width="2" fill="none" />
        </g>
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(badgeSvg);
    assert.equal(parsed.paths.length, 2);

    // Baked vector test
    const baked = SvgParser.bakeVectorTransforms(parsed);
    assert.equal(baked.paths.length, 2);
    assert.equal(baked.paths[0].transform, undefined);
    assert.equal(baked.paths[1].transform, undefined);

    // VectorDrawable flat export
    const xml = VectorGenerator.generateVectorDrawableXml(parsed, { flat: true });
    assert.ok(xml.includes('4F46E5'), 'Must contain fill color #4F46E5 / #FF4F46E5');
    assert.ok(xml.includes('FFFFFF'), 'Must contain stroke color #FFFFFF / #FFFFFFFF');
    assert.ok(!xml.includes('<group'), 'Flat export must not contain <group>');
  });
});

describe('Suite 6: Adversarial Boundaries & Edge Cases', () => {
  test('Test 6.1: Polygon points with glued negative numbers ("10,20 -30-40 50,-60")', () => {
    const d = SvgParser.normalizePolygonPolyline({ points: '10,20 -30-40 50,-60' }, true);
    assert.equal(d, 'M 10,20 L -30,-40 L 50,-60 Z');
  });

  test('Test 6.2: Odd-length polygon points string safely drops trailing coordinate without "undefined"', () => {
    const d = SvgParser.normalizePolygonPolyline({ points: '0 0 10 10 20' }, true);
    assert.equal(d, 'M 0,0 L 10,10 Z');
    assert.ok(!d.includes('undefined') && !d.includes('NaN'));
  });

  test('Test 6.3: Rect with negative rx/ry (-10) clamps to 0 without emitting double-negative ("--")', () => {
    const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 20, height: 20, rx: -10, ry: -5 });
    assert.equal(d, 'M 0,0 h 20 v 20 h -20 Z');
    assert.ok(!d.includes('--'));
  });

  test('Test 6.4: Rect with non-numeric rx/ry falls back safely to sharp corners without "NaN"', () => {
    const d = SvgParser.normalizeRect({ x: 0, y: 0, width: 20, height: 20, rx: 'abc', ry: 'xyz' });
    assert.equal(d, 'M 0,0 h 20 v 20 h -20 Z');
    assert.ok(!d.includes('NaN'));
  });

  test('Test 6.5: Primitive shapes inside <defs> or <clipPath> are excluded from rendered paths', () => {
    const rawSvg = `
      <svg width="50" height="50">
        <defs>
          <rect id="clip" x="0" y="0" width="50" height="50" />
          <circle id="circ" cx="10" cy="10" r="5" />
        </defs>
        <clipPath id="cp">
          <rect x="5" y="5" width="20" height="20" />
        </clipPath>
        <circle cx="25" cy="25" r="10" fill="#ff0000" />
      </svg>
    `;
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.paths.length, 1);
    assert.equal(parsed.paths[0].fill, '#ff0000');
  });

  test('Test 6.6: SVG with missing or non-numeric width/height computes safe viewBox without "NaN"', () => {
    const rawSvg = '<svg viewBox="0 0 120 80"><path d="M 0 0 L 10 10" /></svg>';
    const parsed = SvgParser.parseSvgString(rawSvg);
    assert.equal(parsed.viewBox, '0 0 120 80');
    assert.equal(parsed.width, 120);
    assert.equal(parsed.height, 80);
    assert.ok(!isNaN(parsed.width) && !isNaN(parsed.height));
  });

  test('Test 6.7: Self-closing <defs /> and <clipPath id="cp" /> with whitespace do not prune subsequent shapes', () => {
    const svgDefs = `
      <svg width="100" height="100">
        <defs />
        <rect x="0" y="0" width="20" height="20" fill="#00ff00" />
      </svg>
    `;
    const parsedDefs = SvgParser.parseSvgString(svgDefs);
    assert.equal(parsedDefs.paths.length, 1);
    assert.equal(parsedDefs.paths[0].fill, '#00ff00');

    const svgClip = `
      <svg width="100" height="100">
        <clipPath id="empty-cp" />
        <path d="M 5 5 L 15 15" stroke="#123456" />
      </svg>
    `;
    const parsedClip = SvgParser.parseSvgString(svgClip);
    assert.equal(parsedClip.paths.length, 1);
    assert.equal(parsedClip.paths[0].d, 'M 5 5 L 15 15');
  });

  test('Test 6.8: Self-closing <mask id="m" /> with whitespace does not prune subsequent shapes', () => {
    const svgMask = `
      <svg width="100" height="100">
        <mask id="empty-mask" />
        <circle cx="10" cy="10" r="5" fill="#333333" />
      </svg>
    `;
    const parsedMask = SvgParser.parseSvgString(svgMask);
    assert.equal(parsedMask.paths.length, 1);
    assert.equal(parsedMask.paths[0].fill, '#333333');
  });

  test('Test 6.9: Self-closing <g transform="..." /> with whitespace does not leak transform or corrupt stack', () => {
    const svgGroup = `
      <svg width="100" height="100">
        <g transform="translate(10, 10)">
          <g transform="translate(500, 500)" />
          <g transform="translate(20, 20)">
            <rect x="0" y="0" width="10" height="10" />
          </g>
        </g>
      </svg>
    `;
    const parsedGroup = SvgParser.parseSvgString(svgGroup);
    assert.equal(parsedGroup.paths.length, 1);
    // Cumulative transform: (10, 10) + (20, 20) = (30, 30), unaffected by self-closing <g/>
    assert.deepEqual(parsedGroup.paths[0].transformMatrix, [1, 0, 0, 1, 30, 30]);
  });
});
