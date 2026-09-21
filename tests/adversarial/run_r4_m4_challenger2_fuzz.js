/**
 * tests/adversarial/run_r4_m4_challenger2_fuzz.js
 *
 * Standalone Adversarial Fuzzing & Boundary Stress Suite for Milestone 4:
 * Sub-Glyph Semantic Path Completeness Linter & Verification Gate.
 *
 * Authored by r4_m4_challenger_2.
 *
 * Verification Areas:
 * 1. Sub-Path Counting & Tokenization Engine Fuzzing:
 *    - Malformed SVG strings (unclosed quotes, unclosed tags, NaN coordinates, trailing garbage)
 *    - Unusual path command sequences (consecutive Z, M without Z, lowercase relative commands z, chained Béziers)
 *    - Deeply nested groups with mixed transforms and clip paths / defs
 *    - Zero-area strokes and single-pixel micro-vectors
 *    - Massive SVGs with 50+ closed sub-paths (64-subpath 8x8 matrix)
 * 2. Centroid and Bounding Box Numerical Fuzzing:
 *    - Boundary checks around thresholds (0.5px bbox dimension, 1.0px centroid shift, 90% IoU)
 *    - Inverted coordinate systems, negative coordinates, viewport scaling
 *    - Universal crash-resilience & deterministic veto guarantee
 * 3. Multi-Format Roundtrip & Pipeline Integration:
 *    - VectorDrawable XML & Compose DSL roundtrip reconversion
 *    - Multi-icon file isolation
 *    - CLI exit codes (0, 1, 2) and Stage 0 short-circuit pre-flight veto
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  VectorLinter,
  VectorLintVetoError,
  EXIT_CODES,
  countSvgClosedSubpaths,
  countComposeClosedSubpaths,
  countXmlClosedSubpaths,
  computeBoundingBox,
  computeBoxIoU,
  computeInkCentroid,
  compareVector,
  lint,
  vectorDrawableToSvg,
  composeCodeToSvg,
  splitSubpaths
} = require('../../verification/vector_linter');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

function assertKotlinBracesBalanced(code) {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    assert.ok(depth >= 0, `Negative brace depth at character ${i} in generated Kotlin code`);
  }
  assert.equal(depth, 0, `Unclosed braces (${depth}) in generated Kotlin code`);
}

// =========================================================================
// Suite 1: Malformed & Pathological SVG Input Stress
// =========================================================================
describe('Suite 1: Malformed & Pathological SVG Input Stress', () => {

  test('Test 1.1: Malformed XML with unclosed tags, unclosed quotes, and missing root tags', () => {
    const malformedInputs = [
      '<svg viewBox="0 0 100 100><path d="M 0 0 L 10 10 Z',
      '<svg><path d="M 0 0 L 10 10 Z"><g><path d="M 5 5 Z"',
      '<svg width="100" height="100"><path d="M 0 0 L 10 10 Z" unclosedAttr="value',
      '<<<<>>>>><><path d="M 0 0 Z" />',
      '<path d="M 0 0 L 10 0 L 10 10 Z" />', // missing <svg> root wrapper
      '<?xml version="1.0"?><!DOCTYPE svg><svg><path d="M 0 0 Z"/></svg>'
    ];

    for (const input of malformedInputs) {
      assert.doesNotThrow(() => {
        const counts = VectorLinter.countSvgClosedSubpaths(input);
        assert.ok(typeof counts.totalClosedSubpaths === 'number', 'totalClosedSubpaths must be a number');
        assert.ok(typeof counts.totalOpenSubpaths === 'number', 'totalOpenSubpaths must be a number');
      }, `Must not throw on malformed XML: ${input}`);
    }
  });

  test('Test 1.2: Path data containing NaN, Infinity, -Infinity, and mixed non-numeric tokens', () => {
    const nanPaths = [
      'M NaN NaN L Infinity 10 Z',
      'M 0 0 C NaN 10, 20 Infinity, 30 40 Z',
      'M -Infinity -Infinity L 10 10 Z',
      'M 0 0 Q NaN NaN, 20 20 Z',
      'M 0 0 A NaN 10 0 0 1 20 20 Z'
    ];

    for (const d of nanPaths) {
      assert.doesNotThrow(() => {
        const tokens = VectorGenerator.tokenizePath(d);
        assert.ok(Array.isArray(tokens));
        const count = VectorLinter.countClosedSubpathsFromD(d);
        assert.ok(count >= 1, `Must detect Z command despite NaN coordinates: ${d}`);
        const bbox = VectorLinter.computeBoundingBoxAnalytical(d);
        assert.ok(typeof bbox.isCollapsed === 'boolean');
      });
    }
  });

  test('Test 1.3: Scientific notation coordinates (1e-4, -2.5e+2, 3.14e-1) across M, L, C, Q, A commands', () => {
    const sciPath = 'M 1e-4 2e-4 L -1.5e+2 3.5e+1 C 1e-2 2e-2, 3e-2 4e-2, 5e-2 6e-2 Q 7e-2 8e-2, 9e-2 1e-1 A 1e+1 1e+1 0 0 1 2e+1 2e+1 Z';
    const tokens = VectorGenerator.tokenizePath(sciPath);
    assert.ok(tokens.length >= 5);

    // Verify first move args are properly parsed as floating numbers
    assert.equal(tokens[0].command, 'M');
    assert.equal(tokens[0].args[0], 0.0001);
    assert.equal(tokens[0].args[1], 0.0002);

    const closed = VectorLinter.countClosedSubpathsFromD(sciPath);
    assert.equal(closed, 1, 'Scientific notation path with Z must evaluate to 1 closed sub-path');

    const bbox = VectorLinter.computeBoundingBoxAnalytical(sciPath);
    assert.ok(Number.isFinite(bbox.minX));
    assert.ok(Number.isFinite(bbox.maxX));
    assert.ok(bbox.width > 0);
  });

  test('Test 1.4: Extreme path noise: HTML comments, Unicode gibberish, script injection, trailing garbage', () => {
    const noisySvg = `
      <svg width="24" height="24">
        <!-- Injected comment with fake commands M 0 0 L 10 10 Z -->
        <script>alert("xss")</script>
        <path d="M 0 0 L 10 0 L 10 10 L 0 10 Z trailing gibberish !@#$%^&*() \u0000\u001F" />
      </svg>
    `;

    const counts = VectorLinter.countSvgClosedSubpaths(noisySvg);
    assert.equal(counts.totalClosedSubpaths, 1, 'Commented fake Z must be ignored, real path Z counted');

    const dNoise = 'M 0 0 L 10 10 garbage commands Z';
    const dCount = VectorLinter.countClosedSubpathsFromD(dNoise);
    assert.ok(typeof dCount === 'number');
  });

  test('Test 1.5: Truncated path commands ending abruptly mid-argument', () => {
    const truncatedPaths = [
      'M 10 20 C 30 40', // cubic with 2 of 6 args
      'M 0 0 A 10 20 0 1', // arc with 4 of 7 args
      'M 5', // move with 1 of 2 args
      'M 0 0 Q 10 20 30', // quad with 3 of 4 args
      'M 0 0 S 10 20', // smooth cubic with 2 of 4 args
      'M 0 0 H', // horizontal without args
      'M 0 0 V'  // vertical without args
    ];

    for (const d of truncatedPaths) {
      assert.doesNotThrow(() => {
        const tokens = VectorGenerator.tokenizePath(d);
        assert.ok(Array.isArray(tokens));
        const subpaths = VectorLinter.splitSubpaths(d);
        assert.ok(Array.isArray(subpaths));
        const bbox = VectorLinter.computeBoundingBoxAnalytical(d);
        assert.ok(typeof bbox === 'object');
      }, `Truncated command must not cause infinite loop or exception: ${d}`);
    }
  });

  test('Test 1.6: Universal Fuzz Matrix: null, undefined, numeric, boolean, array, object inputs across all methods', () => {
    const fuzzedInputs = [null, undefined, '', '   \n\t  ', 0, 42, NaN, true, false, [], {}, { paths: [] }, [{}], Buffer.from('')];

    for (const input of fuzzedInputs) {
      assert.doesNotThrow(() => {
        VectorLinter.countClosedSubpathsFromD(input);
        VectorLinter.splitSubpaths(input);
        VectorLinter.countSvgClosedSubpaths(input);
        VectorLinter.countComposeClosedSubpaths(input);
        VectorLinter.countXmlClosedSubpaths(input);
        VectorLinter.computeBoundingBoxAnalytical(input);
        VectorLinter.computeBoxIoU(input, input);
        VectorLinter.vectorDrawableToSvg(input);
        VectorLinter.composeCodeToSvg(input);
      }, `Static method crashed on input: ${JSON.stringify(input)}`);
    }
  });
});

// =========================================================================
// Suite 2: Path Command Sequence Permutations & Topology Invariants
// =========================================================================
describe('Suite 2: Path Command Sequence Permutations & Topology Invariants', () => {

  test('Test 2.1: Multiple consecutive Z commands (M 0 0 L 10 10 Z Z Z) and lone Z', () => {
    const dTripleZ = 'M 0 0 L 10 0 L 10 10 L 0 10 Z Z Z';
    const tokens = VectorGenerator.tokenizePath(dTripleZ);
    const zSegments = tokens.filter(t => t.command && t.command.toUpperCase() === 'Z');
    assert.equal(zSegments.length, 3, 'Tokenizes all 3 Z commands');

    const countD = VectorLinter.countClosedSubpathsFromD(dTripleZ);
    assert.equal(countD, 3, 'countClosedSubpathsFromD counts all 3 Z commands');

    const svgTripleZ = `<svg width="24" height="24"><path d="${dTripleZ}" /></svg>`;
    const svgCounts = VectorLinter.countSvgClosedSubpaths(svgTripleZ);
    // splitSubpaths considers the single segment closed
    assert.equal(svgCounts.totalClosedSubpaths, 1);

    const dLoneZ = 'Z';
    assert.equal(VectorLinter.countClosedSubpathsFromD(dLoneZ), 1);
  });

  test('Test 2.2: Open sub-paths (M without Z) and multiple consecutive M moves', () => {
    // 2 open sub-paths
    const dOpen = 'M 0 0 L 10 10 M 20 20 L 30 30';
    const countOpen = VectorLinter.countClosedSubpathsFromD(dOpen);
    assert.equal(countOpen, 0, 'Open sub-paths without Z must have 0 closed sub-paths');

    const svgOpen = `<svg width="50" height="50"><path d="${dOpen}" /></svg>`;
    const openRes = VectorLinter.countSvgClosedSubpaths(svgOpen);
    assert.equal(openRes.totalClosedSubpaths, 0);
    assert.equal(openRes.totalOpenSubpaths, 2);

    // Consecutive M moves followed by closure
    const dMultiM = 'M 0 0 M 10 10 M 20 20 L 30 30 Z';
    const countMultiM = VectorLinter.countClosedSubpathsFromD(dMultiM);
    assert.equal(countMultiM, 1);
  });

  test('Test 2.3: Lowercase relative commands (z, m, l, h, v, c, s, q, t, a) equivalence', () => {
    const dLower = 'm 10 10 l 10 0 h 5 v 5 c 2 2 4 4 6 6 z';
    const countLower = VectorLinter.countClosedSubpathsFromD(dLower);
    assert.equal(countLower, 1, 'Lowercase z must be recognized as closed sub-path');

    const svgLower = `<svg width="50" height="50"><path d="${dLower}" /></svg>`;
    const svgRes = VectorLinter.countSvgClosedSubpaths(svgLower);
    assert.equal(svgRes.totalClosedSubpaths, 1);

    const xmlLower = `<vector><path android:pathData="${dLower}" /></vector>`;
    const xmlRes = VectorLinter.countXmlClosedSubpaths(xmlLower);
    assert.equal(xmlRes.totalClosedSubpaths, 1);
  });

  test('Test 2.4: Long chained cubic Béziers (25+ consecutive C curves) extrema derivative calculation', () => {
    let dChained = 'M 0 0 ';
    for (let i = 0; i < 25; i++) {
      const x = i * 10;
      dChained += `C ${x + 2} 15, ${x + 5} -15, ${x + 10} 0 `;
    }
    dChained += 'Z';

    const closed = VectorLinter.countClosedSubpathsFromD(dChained);
    assert.equal(closed, 1);

    const bbox = VectorLinter.computeBoundingBoxAnalytical(dChained);
    assert.equal(bbox.isCollapsed, false);
    assert.equal(bbox.minX, 0);
    assert.equal(bbox.maxX, 250);
    // Local extrema for the curve C (x+2, 15), (x+5, -15), (x+10, 0) gives |y| ~= 4.33
    assert.ok(bbox.maxY > 4.0 && bbox.maxY < 5.0, `maxY (${bbox.maxY}) must match derivative root`);
    assert.ok(bbox.minY < -4.0 && bbox.minY > -5.0, `minY (${bbox.minY}) must match derivative root`);
  });

  test('Test 2.5: Chained quadratic Béziers (Q and T) analytical extrema bounding boxes', () => {
    const dQuad = 'M 0 0 Q 10 30, 20 0 T 40 0 T 60 0 Z';
    const closed = VectorLinter.countClosedSubpathsFromD(dQuad);
    assert.equal(closed, 1);

    const bbox = VectorLinter.computeBoundingBoxAnalytical(dQuad);
    assert.equal(bbox.isCollapsed, false);
    assert.equal(bbox.minX, 0);
    assert.ok(bbox.maxX >= 20);
    assert.ok(bbox.maxY >= 15);
  });

  test('Test 2.6: Zero-area stroked line vs zero-area filled point path', () => {
    // Zero-area point path (degenerate closed)
    const dPoint = 'M 5 5 L 5 5 Z';
    const bboxPoint = VectorLinter.computeBoundingBoxAnalytical(dPoint, 0);
    assert.equal(bboxPoint.width, 0);
    assert.equal(bboxPoint.height, 0);
    assert.equal(bboxPoint.isCollapsed, true);

    // Zero-width stroked vertical line with strokeWidth = 2.0
    const dLine = 'M 10 10 L 10 30';
    const bboxLine = VectorLinter.computeBoundingBoxAnalytical(dLine, 2.0);
    assert.equal(bboxLine.width, 2.0, 'Stroke width must expand zero-width bounding box');
    assert.equal(bboxLine.height, 22.0);
    assert.equal(bboxLine.isCollapsed, false);
  });
});

// =========================================================================
// Suite 3: Deeply Nested Groups, Transforms & Pruning Rules
// =========================================================================
describe('Suite 3: Deeply Nested Groups, Transforms & Pruning Rules', () => {

  test('Test 3.1: 15-level deeply nested <g> hierarchy with alternating transforms', () => {
    let svg = '<svg width="200" height="200">';
    const levels = 15;
    const transforms = [
      'translate(2, 2)',
      'scale(1.05, 1.05)',
      'rotate(5, 50, 50)',
      'skewX(2)',
      'skewY(1)',
      'matrix(1, 0, 0, 1, 1, 1)'
    ];

    for (let i = 0; i < levels; i++) {
      const t = transforms[i % transforms.length];
      svg += `<g transform="${t}">`;
    }
    svg += '<path d="M 10 10 L 30 10 L 30 30 L 10 30 Z" fill="#1a1a1a" />';
    for (let i = 0; i < levels; i++) {
      svg += '</g>';
    }
    svg += '</svg>';

    const counts = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(counts.totalClosedSubpaths, 1, 'Deep nesting must not alter the closed sub-path invariant');
    assert.equal(counts.elementCount, 1);
  });

  test('Test 3.2: Non-rendered container filtering: <defs>, <clipPath>, and <mask />', () => {
    const svgWithDefs = `
      <svg width="100" height="100">
        <defs>
          <clipPath id="clip1">
            <path d="M 0 0 L 10 10 Z" />
            <circle cx="5" cy="5" r="5" />
            <rect width="20" height="20" />
          </clipPath>
          <mask id="mask1">
            <ellipse cx="10" cy="10" rx="5" ry="5" />
            <polygon points="0,0 10,0 5,10" />
          </mask>
        </defs>
        <!-- Visible content: 2 paths -->
        <path d="M 10 10 L 20 10 L 20 20 L 10 20 Z" />
        <circle cx="50" cy="50" r="10" />
      </svg>
    `;

    const counts = VectorLinter.countSvgClosedSubpaths(svgWithDefs);
    // Defs contains 1 path + 1 circle + 1 rect + 1 ellipse + 1 polygon = 5 shapes.
    // Visible contains 1 path + 1 circle = 2 shapes.
    assert.equal(counts.totalClosedSubpaths, 2, 'Must strictly exclude all shapes inside <defs>, <clipPath>, and <mask />');
  });

  test('Test 3.3: Negative coordinate space and inverted viewport transforms', () => {
    // Pure negative coordinate path
    const dNegative = 'M -50 -50 L -20 -50 L -20 -20 L -50 -20 Z';
    const bboxNeg = VectorLinter.computeBoundingBoxAnalytical(dNegative);
    assert.equal(bboxNeg.minX, -50);
    assert.equal(bboxNeg.maxX, -20);
    assert.equal(bboxNeg.width, 30);
    assert.equal(bboxNeg.height, 30);
    assert.equal(bboxNeg.isCollapsed, false);

    const iouSelf = VectorLinter.computeBoxIoU(bboxNeg, bboxNeg);
    assert.equal(iouSelf, 100.0);

    // Inverted coordinate scale: scale(1, -1)
    const svgInverted = `
      <svg width="100" height="100">
        <g transform="scale(1, -1)">
          <path d="M 10 10 L 30 10 L 30 30 L 10 30 Z" />
        </g>
      </svg>
    `;
    const invCounts = VectorLinter.countSvgClosedSubpaths(svgInverted);
    assert.equal(invCounts.totalClosedSubpaths, 1);
  });

  test('Test 3.4: Mixed primitive shapes (<rect>, <circle>, <ellipse>, <polygon>) in nested groups', () => {
    const svgMixed = `
      <svg width="100" height="100">
        <g transform="translate(10, 10)">
          <rect x="0" y="0" width="15" height="15" />
          <g transform="scale(0.8)">
            <circle cx="20" cy="20" r="5" />
            <ellipse cx="40" cy="40" rx="6" ry="3" />
            <polygon points="50,50 60,50 55,60" />
          </g>
        </g>
      </svg>
    `;
    const res = VectorLinter.countSvgClosedSubpaths(svgMixed);
    assert.equal(res.totalClosedSubpaths, 4, '4 primitive shapes inside groups must normalize to 4 closed sub-paths');
  });

  test('Test 3.5: Degenerate matrix transform (scale 0) collapses bounding box and vetoes', async () => {
    const sourceSvg = '<svg width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="#000" /></svg>';
    // Synthesized vector with degenerate 0-scale transform
    const collapsedSvg = '<svg width="24" height="24"><g transform="scale(0.001, 0.001)"><rect x="2" y="2" width="20" height="20" fill="#000" /></g></svg>';

    const comparison = await VectorLinter.compareVector(sourceSvg, collapsedSvg, { width: 24, height: 24 });
    assert.equal(comparison.passed, false);
    assert.equal(comparison.hasVeto, true);
    assert.ok(comparison.violations.some(v => v.rule === 'COLLAPSED_BOUNDING_BOX' || v.rule === 'BBOX_IOU_VIOLATION'));
  });
});

// =========================================================================
// Suite 4: Scale Boundaries: Micro-Vectors to 64-Subpath Glyphs
// =========================================================================
describe('Suite 4: Scale Boundaries: Micro-Vectors to 64-Subpath Glyphs', () => {

  test('Test 4.1: Single-pixel micro-vector (0.2px x 0.2px) collapses bounding box and triggers veto', async () => {
    const validSource = '<svg width="24" height="24"><rect x="4" y="4" width="16" height="16" fill="#000" /></svg>';
    const microVector = '<svg width="24" height="24"><rect x="10" y="10" width="0.2" height="0.2" fill="#000" /></svg>';

    const res = await VectorLinter.compareVector(validSource, microVector, { width: 24, height: 24 });
    assert.equal(res.passed, false);
    assert.equal(res.hasVeto, true);
    assert.ok(res.violations.some(v => v.rule === 'BBOX_IOU_VIOLATION' || v.rule === 'COLLAPSED_BOUNDING_BOX'));
  });

  test('Test 4.2: Massive SVG with 64 closed sub-paths (8x8 matrix) verified across SVG, Compose, and XML', async () => {
    let d = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = c * 10;
        const y = r * 10;
        d += `M ${x} ${y} L ${x + 6} ${y} L ${x + 6} ${y + 6} L ${x} ${y + 6} Z `;
      }
    }
    const massiveSvg = `<svg width="100" height="100" viewBox="0 0 100 100"><path d="${d.trim()}" fill="#1a1a1a" /></svg>`;

    // 1. Check SVG counts
    const svgCounts = VectorLinter.countSvgClosedSubpaths(massiveSvg);
    assert.equal(svgCounts.totalClosedSubpaths, 64, 'SVG must contain exactly 64 closed sub-paths');

    // 2. Synthesize to Compose Kotlin ImageVector DSL
    const parsed = SvgParser.parseSvgString(massiveSvg);
    parsed.name = 'Grid64Icon';
    const composeCode = VectorGenerator.generateImageVectorFile([parsed]);
    assertKotlinBracesBalanced(composeCode);

    const composeCounts = VectorLinter.countComposeClosedSubpaths(composeCode, 'Grid64Icon');
    assert.equal(composeCounts.totalClosedSubpaths, 64, 'Compose code must contain exactly 64 close() invocations');

    // 3. Synthesize to Android VectorDrawable XML
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);
    const xmlCounts = VectorLinter.countXmlClosedSubpaths(xml);
    assert.equal(xmlCounts.totalClosedSubpaths, 64, 'XML drawable must contain exactly 64 Z commands in pathData');

    // 4. Compare SVG vs Compose via VectorLinter
    const comparison = await VectorLinter.compareVector(massiveSvg, composeCode, {
      iconName: 'Grid64Icon',
      width: 100,
      height: 100
    });
    assert.equal(comparison.passed, true, '64/64 sub-paths must pass verification');
    assert.equal(comparison.checks.subpaths.deltaN, 0);
  });

  test('Test 4.3: Dropping 1 of 64 sub-paths in massive glyph deterministically triggers SUBPATH_COUNT_MISMATCH', async () => {
    // Generate 64 sub-paths
    let dSource = '';
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * 10;
      const y = Math.floor(i / 8) * 10;
      dSource += `M ${x} ${y} L ${x + 6} ${y} L ${x + 6} ${y + 6} L ${x} ${y + 6} Z `;
    }
    const sourceSvg = `<svg width="100" height="100"><path d="${dSource.trim()}" fill="#1a1a1a" /></svg>`;

    // Synthesized with 1 sub-path dropped (63 sub-paths)
    let dDropped = '';
    for (let i = 0; i < 63; i++) {
      const x = (i % 8) * 10;
      const y = Math.floor(i / 8) * 10;
      dDropped += `M ${x} ${y} L ${x + 6} ${y} L ${x + 6} ${y + 6} L ${x} ${y + 6} Z `;
    }
    const droppedSvg = `<svg width="100" height="100"><path d="${dDropped.trim()}" fill="#1a1a1a" /></svg>`;

    const res = await VectorLinter.compareVector(sourceSvg, droppedSvg, { width: 100, height: 100 });
    assert.equal(res.passed, false);
    assert.equal(res.hasVeto, true);
    assert.equal(res.checks.subpaths.deltaN, 1);
    assert.ok(res.violations.some(v => v.rule === 'SUBPATH_COUNT_MISMATCH'));
  });

  test('Test 4.4: Extreme viewport dimensions (viewBox="0 0 10000 10000" vs 1x1)', async () => {
    const hugeSvg = '<svg width="10000" height="10000" viewBox="0 0 10000 10000"><rect x="2000" y="2000" width="4000" height="4000" fill="#000" /></svg>';
    const counts = VectorLinter.countSvgClosedSubpaths(hugeSvg);
    assert.equal(counts.totalClosedSubpaths, 1);

    const comp = await VectorLinter.compareVector(hugeSvg, hugeSvg, { width: 100, height: 100 });
    assert.equal(comp.passed, true);
    assert.equal(comp.checks.centroid.deltaC, 0.0);
  });

  test('Test 4.5: High throughput fuzzing: 50 consecutive comparisons execute without memory leak or crash', async () => {
    const svgA = '<svg width="24" height="24"><circle cx="12" cy="12" r="8" fill="#1a1a1a" /></svg>';
    const start = Date.now();

    for (let i = 0; i < 50; i++) {
      const res = await VectorLinter.compareVector(svgA, svgA, { width: 24, height: 24 });
      assert.equal(res.passed, true);
    }

    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `50 iterations took ${elapsed}ms (must be < 2000ms)`);
  });
});

// =========================================================================
// Suite 5: Exact Numerical Boundary Stress (0.5px Bbox, 1.0px Centroid, 90% IoU)
// =========================================================================
describe('Suite 5: Exact Numerical Boundary Stress (0.5px Bbox, 1.0px Centroid, 90% IoU)', () => {

  test('Test 5.1: Bounding Box Dimension Boundary Ladder around 0.5px', () => {
    // Dimension = 0.51px -> non-collapsed
    const box051 = VectorLinter.computeBoundingBoxAnalytical('M 0 0 L 0.51 0 L 0.51 10 L 0 10 Z');
    assert.equal(box051.isCollapsed, false, '0.51px width must NOT be collapsed');
    assert.equal(box051.width, 0.51);

    // Dimension = 0.50px -> collapsed
    const box050 = VectorLinter.computeBoundingBoxAnalytical('M 0 0 L 0.50 0 L 0.50 10 L 0 10 Z');
    assert.equal(box050.isCollapsed, true, '0.50px width MUST be collapsed');
    assert.equal(box050.width, 0.50);

    // Dimension = 0.49px -> collapsed
    const box049 = VectorLinter.computeBoundingBoxAnalytical('M 0 0 L 0.49 0 L 0.49 10 L 0 10 Z');
    assert.equal(box049.isCollapsed, true, '0.49px width MUST be collapsed');
    assert.equal(box049.width, 0.49);

    // Zero width
    const boxZero = VectorLinter.computeBoundingBoxAnalytical('M 0 0 L 0 0 L 0 10 L 0 10 Z');
    assert.equal(boxZero.isCollapsed, true);
  });

  test('Test 5.2: Bounding Box IoU Boundary Ladder around 90.0%', () => {
    // 10x10 square at origin
    const boxA = [0, 0, 10, 10];

    // Shift dx = 0.50px:
    // Inter = 9.5 * 10 = 95. Union = 100 + 100 - 95 = 105.
    // IoU = 95 / 105 = 90.48% (>= 90% -> PASS)
    const boxPass = [0.50, 0, 10, 10];
    const iouPass = VectorLinter.computeBoxIoU(boxA, boxPass);
    assert.equal(iouPass, 90.48);
    assert.ok(iouPass >= 90.0);

    // Shift dx = 10/19 ~= 0.5263px:
    // Inter = (10 - 10/19) * 10 = 1800/19 ~= 94.7368
    // Union = 200 - 1800/19 = 2000/19 ~= 105.2631
    // IoU = 1800 / 2000 = 90.00% (>= 90% -> PASS)
    const dx90 = 10 / 19;
    const boxExact = [dx90, 0, 10, 10];
    const iouExact = VectorLinter.computeBoxIoU(boxA, boxExact);
    assert.equal(iouExact, 90.0);
    assert.ok(iouExact >= 90.0);

    // Shift dx = 0.55px:
    // Inter = 9.45 * 10 = 94.5. Union = 105.5.
    // IoU = 94.5 / 105.5 = 89.57% (< 90% -> VETO)
    const boxFail = [0.55, 0, 10, 10];
    const iouFail = VectorLinter.computeBoxIoU(boxA, boxFail);
    assert.equal(iouFail, 89.57);
    assert.ok(iouFail < 90.0);

    // Disjoint boxes: IoU = 0.0%
    const boxDisjoint = [100, 100, 10, 10];
    assert.equal(VectorLinter.computeBoxIoU(boxA, boxDisjoint), 0.0);
  });

  test('Test 5.3: Centroid Spatial Drift Boundary Ladder around 1.0px', async () => {
    // 50x50 rect on 100x100 canvas (IoU stays > 90% for small shifts)
    const svgBase = '<svg width="100" height="100"><rect x="10" y="10" width="50" height="50" fill="#000" /></svg>';

    // Shift dx = 0.80px (Delta C = 0.80px <= 1.0px -> PASS)
    const svgDrift08 = '<svg width="100" height="100"><rect x="10.8" y="10" width="50" height="50" fill="#000" /></svg>';
    const resPass = await VectorLinter.compareVector(svgBase, svgDrift08, { width: 100, height: 100 });
    assert.equal(resPass.passed, true);
    assert.ok(resPass.checks.centroid.deltaC <= 1.0);
    assert.equal(resPass.checks.centroid.passed, true);

    // Shift dx = 1.20px (Delta C = 1.20px > 1.0px -> VETO)
    const svgDrift12 = '<svg width="100" height="100"><rect x="11.2" y="10" width="50" height="50" fill="#000" /></svg>';
    const resFail = await VectorLinter.compareVector(svgBase, svgDrift12, { width: 100, height: 100 });
    assert.equal(resFail.passed, false);
    assert.equal(resFail.hasVeto, true);
    assert.ok(resFail.checks.centroid.deltaC > 1.0);
    assert.equal(resFail.checks.centroid.passed, false);
    assert.ok(resFail.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED'));
  });

  test('Test 5.4: Asymmetrical diagonal drift stress (dx = 0.75px, dy = 0.75px => Delta C = 1.0607px > 1.0px)', async () => {
    const svgBase = '<svg width="100" height="100"><rect x="10" y="10" width="50" height="50" fill="#000" /></svg>';
    // Diagonal shift: dx = 0.75, dy = 0.75 -> Delta C = sqrt(0.75^2 + 0.75^2) = 1.06066px
    const svgDiag = '<svg width="100" height="100"><rect x="10.75" y="10.75" width="50" height="50" fill="#000" /></svg>';

    const resDiag = await VectorLinter.compareVector(svgBase, svgDiag, { width: 100, height: 100 });
    assert.equal(resDiag.passed, false);
    assert.equal(resDiag.hasVeto, true);
    assert.ok(resDiag.checks.centroid.deltaC > 1.0);
    assert.ok(resDiag.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED'));
  });

  test('Test 5.5: Empirical da63 Document Plus Icon: intact vs badge-dropped physics verification', async () => {
    // Load real da63 vector_2 from design_spec.json
    const specPath = path.resolve(__dirname, '../../output/test_da63/design_spec.json');
    let fullSvg;
    if (fs.existsSync(specPath)) {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const vec2 = spec.vectors.find(v => v.id === 'vector_2');
      fullSvg = vec2.rawSvg;
    } else {
      fullSvg = '<svg width="26" height="26" viewBox="0 0 20 20" fill="none"><path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="currentColor" fill-rule="evenodd" transform="matrix(1 0 0 1 11.250 10)"></path><path d="M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z" fill="currentColor" fill-rule="evenodd" transform="matrix(1 0 0 1 11.875 1.875)"></path><path d="M 9.375 0 L 10.057 -0.731 C 9.872 -0.904 9.628 -1 9.375 -1 L 9.375 0 Z M 0.549 0.513 L -0.133 -0.218 L -0.133 -0.218 L 0.549 0.513 Z M 0.549 16.987 L 1.231 16.256 L 1.231 16.256 L 0.549 16.987 Z M 15 5.25 L 16 5.25 C 16 4.973 15.885 4.708 15.682 4.519 L 15 5.25 Z M 9.375 -1 L 1.875 -1 L 1.875 1 L 9.375 1 L 9.375 -1 Z M 1.875 -1 C 1.134 -1 0.41 -0.726 -0.133 -0.218 L 1.231 1.244 C 1.391 1.095 1.622 1 1.875 1 L 1.875 -1 Z M -0.133 -0.218 C -0.679 0.291 -1 0.998 -1 1.75 L 1 1.75 C 1 1.574 1.074 1.39 1.231 1.244 L -0.133 -0.218 Z M -1 1.75 L -1 15.75 L 1 15.75 L 1 1.75 L -1 1.75 Z M -1 15.75 C -1 16.502 -0.679 17.209 -0.133 17.718 L 1.231 16.256 C 1.074 16.11 1 15.926 1 15.75 L -1 15.75 Z M -0.133 17.718 C 0.41 18.226 1.134 18.5 1.875 18.5 L 1.875 16.5 C 1.622 16.5 1.391 16.405 1.231 16.256 L -0.133 17.718 Z M 15.682 4.519 L 10.057 -0.731 L 8.693 0.731 L 14.318 5.981 L 15.682 4.519 Z M 16 6.875 L 16 5.25 L 14 5.25 L 14 6.875 L 16 6.875 Z M 1.875 18.5 L 7.5 18.5 L 7.5 16.5 L 1.875 16.5 L 1.875 18.5 Z" fill="currentColor" fill-rule="evenodd" transform="matrix(1 0 0 1 3.125 1.875)"></path></svg>';
    }

    // Omit plus badge
    const droppedSvg = fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 11\.250 10\)[^>]*><\/path>/, '');

    // 1. Intact comparison against itself
    const resIntact = await VectorLinter.compareVector(fullSvg, fullSvg, { iconName: 'DocumentPlusIcon', width: 26, height: 26 });
    assert.equal(resIntact.passed, true);
    assert.equal(resIntact.checks.subpaths.deltaN, 0);
    assert.equal(resIntact.checks.centroid.deltaC, 0.0);

    // 2. Comparison against dropped badge
    const resDropped = await VectorLinter.compareVector(fullSvg, droppedSvg, { iconName: 'DocumentPlusIcon', width: 26, height: 26 });
    assert.equal(resDropped.passed, false);
    assert.equal(resDropped.hasVeto, true);
    assert.equal(resDropped.checks.subpaths.deltaN, 3, 'Missing 3 sub-paths of plus sign');
    assert.ok(resDropped.checks.centroid.deltaC > 1.0, `Centroid drift (${resDropped.checks.centroid.deltaC}px) must exceed 1.0px`);
    assert.ok(Math.abs(resDropped.checks.centroid.deltaC - 2.5104) < 0.01, `Centroid drift must match physics formula (~2.51px), got ${resDropped.checks.centroid.deltaC}px`);
    assert.ok(resDropped.violations.some(v => v.rule === 'SUBPATH_COUNT_MISMATCH'));
    assert.ok(resDropped.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED'));
  });

  test('Test 5.6: Partial badge degradation: shrinking badge to 10% triggers IoU and centroid vetoes', async () => {
    const fullIcon = `
      <svg width="50" height="50">
        <rect x="5" y="5" width="40" height="40" fill="#1a1a1a" />
        <circle cx="40" cy="40" r="8" fill="#1a1a1a" />
      </svg>
    `;
    // Shrunk badge circle (r=0.8 instead of 8)
    const shrunkBadge = `
      <svg width="50" height="50">
        <rect x="5" y="5" width="40" height="40" fill="#1a1a1a" />
        <circle cx="40" cy="40" r="0.8" fill="#1a1a1a" />
      </svg>
    `;

    const res = await VectorLinter.compareVector(fullIcon, shrunkBadge, { width: 50, height: 50 });
    assert.equal(res.passed, false);
    assert.equal(res.hasVeto, true);
  });
});

// =========================================================================
// Suite 6: Full Reconversion & Multi-Format Roundtrip Verification
// =========================================================================
describe('Suite 6: Full Reconversion & Multi-Format Roundtrip Verification', () => {

  test('Test 6.1: VectorDrawable XML with <group> and android:fillType="evenOdd" roundtrips to SVG', () => {
    const xml = `
      <vector xmlns:android="http://schemas.android.com/apk/res/android"
          android:width="24dp"
          android:height="24dp"
          android:viewportWidth="24"
          android:viewportHeight="24">
        <group android:translateX="2" android:translateY="3" android:scaleX="1.2" android:scaleY="1.2">
          <path
              android:pathData="M 0 0 L 10 0 L 10 10 L 0 10 Z M 2 2 L 8 2 L 8 8 L 2 8 Z"
              android:fillColor="#FF1A1A1A"
              android:fillType="evenOdd" />
        </group>
      </vector>
    `;

    const svg = VectorLinter.vectorDrawableToSvg(xml);
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('transform="translate(2, 3) scale(1.2, 1.2)"'));
    assert.ok(svg.includes('fill-rule="evenodd"'));
    assert.ok(svg.toLowerCase().includes('fill="#1a1a1a"'));

    const counts = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(counts.totalClosedSubpaths, 2, 'Two closed sub-paths must be preserved in roundtrip');
  });

  test('Test 6.2: Compose Kotlin DSL with nested groups, stroke caps, and evenOdd roundtrips to SVG', () => {
    const kotlinCode = `
      val ClaudeIcons.TestCompound: ImageVector
        get() {
          return ImageVector.Builder(
            name = "TestCompound",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
          ).apply {
            group(
              translationX = 5f,
              translationY = 5f,
              scaleX = 1f,
              scaleY = 1f,
              rotation = 0f
            ) {
              path(
                fill = SolidColor(Color(0xFF1A1A1A)),
                pathFillType = PathFillType.EvenOdd,
                stroke = SolidColor(Color(0xFF000000)),
                strokeLineWidth = 1.5f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
              ) {
                moveTo(0f, 0f)
                lineTo(10f, 0f)
                lineTo(10f, 10f)
                lineTo(0f, 10f)
                close()
              }
            }
          }.build()
        }
    `;

    const svg = VectorLinter.composeCodeToSvg(kotlinCode);
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('<g transform="translate(5, 5)">'));
    assert.ok(svg.includes('fill-rule="evenodd"'));
    assert.ok(svg.includes('stroke="#000000"'));
    assert.ok(svg.includes('stroke-width="1.5"'));
    assert.ok(svg.includes('stroke-linecap="round"'));
    assert.ok(svg.includes('stroke-linejoin="round"'));

    const counts = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(counts.totalClosedSubpaths, 1);
  });

  test('Test 6.3: Multi-icon Compose file isolates targeted icon definition', () => {
    const multiIconKotlin = `
      package com.claude.compose.icons

      import androidx.compose.ui.graphics.vector.ImageVector

      val ClaudeIcons.SearchIcon: ImageVector
        get() {
          return ImageVector.Builder("SearchIcon", 24.dp, 24.dp, 24f, 24f).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
              moveTo(0f, 0f)
              lineTo(10f, 10f)
              close()
            }
          }.build()
        }

      val ClaudeIcons.DocumentPlusIcon: ImageVector
        get() {
          return ImageVector.Builder("DocumentPlusIcon", 24.dp, 24.dp, 24f, 24f).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
              moveTo(0f, 0f)
              lineTo(10f, 0f)
              close()
              moveTo(20f, 20f)
              lineTo(30f, 30f)
              close()
              moveTo(40f, 40f)
              lineTo(50f, 50f)
              close()
            }
          }.build()
        }

      val ClaudeIcons.SettingsIcon: ImageVector
        get() {
          return ImageVector.Builder("SettingsIcon", 24.dp, 24.dp, 24f, 24f).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
              moveTo(0f, 0f)
              lineTo(5f, 5f)
              close()
            }
          }.build()
        }
    `;

    // Isolate DocumentPlusIcon (should have 3 close calls, not 1 from SearchIcon or 1 from SettingsIcon)
    const docCounts = VectorLinter.countComposeClosedSubpaths(multiIconKotlin, 'DocumentPlusIcon');
    assert.equal(docCounts.totalClosedSubpaths, 3, 'Must isolate DocumentPlusIcon with exactly 3 close() calls');

    // Isolate SearchIcon
    const searchCounts = VectorLinter.countComposeClosedSubpaths(multiIconKotlin, 'SearchIcon');
    assert.equal(searchCounts.totalClosedSubpaths, 1, 'Must isolate SearchIcon with exactly 1 close() call');
  });

  test('Test 6.4: Standalone CLI exit code contract (0 on pass, 1 on veto, 2 on invalid args)', () => {
    const cliPath = path.resolve(__dirname, '../../verification/vector_linter.js');

    // Missing arguments -> exit code 2
    const resNoArgs = spawnSync(process.execPath, [cliPath]);
    assert.equal(resNoArgs.status, EXIT_CODES.INVALID_ARGUMENTS);

    // Non-existent spec -> exit code 2
    const resBadFile = spawnSync(process.execPath, [cliPath, '/tmp/non_existent_spec_12345.json']);
    assert.equal(resBadFile.status, EXIT_CODES.INVALID_ARGUMENTS);

    // Help flag -> exit code 0
    const resHelp = spawnSync(process.execPath, [cliPath, '--help']);
    assert.equal(resHelp.status, EXIT_CODES.SUCCESS);
  });

  test('Test 6.5: Pipeline Stage 0 Pre-Flight Hook throwOnVeto guarantees short-circuit before Gradle', async () => {
    const sourceSvg = '<svg width="24" height="24"><path d="M 0 0 L 10 0 L 10 10 L 0 10 Z M 20 20 L 30 20 L 30 30 L 20 30 Z" /></svg>';
    // Synthesized missing 1 subpath
    const defectiveSynth = '<svg width="24" height="24"><path d="M 0 0 L 10 0 L 10 10 L 0 10 Z" /></svg>';

    const linter = new VectorLinter({ throwOnVeto: true });

    await assert.rejects(
      async () => {
        await linter.executeLint([sourceSvg], [defectiveSynth]);
      },
      (err) => {
        assert.ok(err instanceof VectorLintVetoError);
        assert.equal(err.name, 'VectorLintVetoError');
        assert.ok(err.violations.length >= 1);
        assert.equal(err.report.exitCode, EXIT_CODES.VETO_FAILURE);
        return true;
      },
      'VectorLintVetoError must be thrown to guarantee Gradle stage short-circuit'
    );
  });
});
