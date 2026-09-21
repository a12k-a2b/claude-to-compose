/**
 * tests/unit/vector_completeness_linter.test.js
 *
 * Comprehensive unit test suite for Milestone M4 / R4:
 * Sub-Glyph Semantic Path Completeness Linter & Verification Gate.
 *
 * Covers 41 unit tests across 7 suites:
 * - Suite 1: Sub-Path Invariant Counting & Extraction (6 tests)
 * - Suite 2: Real-World Multi-Path Compound Icon (da63) (6 tests)
 * - Suite 3: Synthetic Dropped Action Badge Detection & Veto (6 tests)
 * - Suite 4: Collapsed Bounding Box & Degenerate Shapes (6 tests)
 * - Suite 5: Continuous Ink Centroid Spatial Shift Oracle (Delta C) (6 tests)
 * - Suite 6: False Positive Avoidance & Edge Cases (6 tests)
 * - Suite 7: Pipeline Integration, CLI & Process Exit Codes (5 tests)
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

// =========================================================================
// Suite 1: Sub-Path Invariant Counting & Extraction (6 tests)
// =========================================================================
describe('Suite 1: Sub-Path Invariant Counting & Extraction', () => {

  test('Test 1.1: Single closed path (M 0 0 L 10 0 L 10 10 L 0 10 Z) yields exactly 1 closed sub-path', () => {
    const d = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
    const count = VectorLinter.countClosedSubpathsFromD(d);
    assert.equal(count, 1, 'Single Z must produce 1 closed sub-path');

    const svg = `<svg width="24" height="24"><path d="${d}" /></svg>`;
    const res = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(res.totalClosedSubpaths, 1);
    assert.equal(res.totalOpenSubpaths, 0);
  });

  test('Test 1.2: Multi-subpath string with 3 distinct Z segments yields 3 closed sub-paths', () => {
    const d = 'M 0 0 L 10 10 Z M 20 20 L 30 30 Z M 40 40 L 50 50 Z';
    const count = VectorLinter.countClosedSubpathsFromD(d);
    assert.equal(count, 3, 'Three Z tokens must produce 3 closed sub-paths');

    const subpaths = VectorLinter.splitSubpaths(d);
    assert.equal(subpaths.length, 3);
    assert.ok(subpaths.every(sp => sp.isClosed));
  });

  test('Test 1.3: Primitive shape normalization: <rect>, <circle>, <ellipse>, <polygon> yield 1 closed sub-path each', () => {
    const svg = `
      <svg width="100" height="100">
        <rect x="0" y="0" width="20" height="20" />
        <circle cx="50" cy="50" r="10" />
        <ellipse cx="80" cy="50" rx="10" ry="5" />
        <polygon points="10,10 20,20 10,20" />
      </svg>
    `;
    const res = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(res.totalClosedSubpaths, 4, '4 closed primitives must produce 4 closed sub-paths');
    assert.equal(res.totalOpenSubpaths, 0);
  });

  test('Test 1.4: Open stroked elements: <line> and <polyline> yield 0 closed sub-paths and 1 open sub-path each', () => {
    const svg = `
      <svg width="100" height="100">
        <line x1="0" y1="0" x2="20" y2="20" />
        <polyline points="0,0 10,10 20,0" />
      </svg>
    `;
    const res = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(res.totalClosedSubpaths, 0, 'Open strokes must have 0 closed sub-paths');
    assert.equal(res.totalOpenSubpaths, 2, '2 open primitives must produce 2 open sub-paths');
  });

  test('Test 1.5: Mixed SVG container: 1 rect + 1 path with 2 Z + 1 line yields totalClosed = 3, totalOpen = 1', () => {
    const svg = `
      <svg width="64" height="64">
        <rect width="10" height="10" />
        <path d="M 0 0 L 10 10 Z M 20 20 L 30 30 Z" />
        <line x1="0" y1="0" x2="10" y2="10" />
      </svg>
    `;
    const res = VectorLinter.countSvgClosedSubpaths(svg);
    assert.equal(res.totalClosedSubpaths, 3);
    assert.equal(res.totalOpenSubpaths, 1);
    assert.equal(res.totalSubpaths, 4);
  });

  test('Test 1.6: Compose Kotlin DSL parsing counts exact close() invocations in path(...) blocks', () => {
    const kotlinCode = `
      public val ClaudeIcons.SampleIcon: ImageVector
          get() {
              return ImageVector.Builder(name = "SampleIcon", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f).apply {
                  path(fill = SolidColor(Color(0xFF000000))) {
                      moveTo(0f, 0f)
                      lineTo(10f, 10f)
                      close()
                      moveTo(20f, 20f)
                      lineTo(30f, 30f)
                      close()
                  }
                  path(fill = SolidColor(Color(0xFF000000))) {
                      moveTo(40f, 40f)
                      lineTo(50f, 50f)
                      close()
                  }
              }.build()
          }
    `;
    const res = VectorLinter.countComposeClosedSubpaths(kotlinCode, 'SampleIcon');
    assert.equal(res.totalClosedSubpaths, 3);
    assert.equal(res.pathBlockCount, 2);
    assert.deepEqual(res.closeCallsPerPath, [2, 1]);
  });
});

// =========================================================================
// Suite 2: Real-World Multi-Path Compound Icon (da63) (6 tests)
// =========================================================================
describe('Suite 2: Real-World Multi-Path Compound Icon (da63)', () => {
  const specPath = path.resolve(__dirname, '../../output/test_da63/design_spec.json');
  let da63Vector2 = null;

  test('Test 2.1: Ingests da63 compound document icon (vector_2) verifying 3 distinct paths and 19 closed subpaths', () => {
    assert.ok(fs.existsSync(specPath), 'da63 design_spec.json must exist');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    da63Vector2 = spec.vectors.find(v => v.id === 'vector_2');
    assert.ok(da63Vector2, 'vector_2 must be present in da63 spec');
    assert.equal(da63Vector2.paths.length, 3, 'vector_2 has 3 paths: plus badge, fold, and body');

    const counts = VectorLinter.countSvgClosedSubpaths(da63Vector2.rawSvg);
    assert.equal(counts.totalClosedSubpaths, 19, 'da63 vector_2 has 19 total closed subpaths');
  });

  test('Test 2.2: Generates Compose ImageVector code for da63 vector_2 and verifies 100% pass with 0 violations', async () => {
    const parsed = SvgParser.parseSvgString(da63Vector2.rawSvg);
    const kotlinCode = VectorGenerator.generateImageVectorFile([parsed]);
    const composeCounts = VectorLinter.countComposeClosedSubpaths(kotlinCode, 'Icon1Icon');
    assert.equal(composeCounts.totalClosedSubpaths, 19, 'Generated Compose code has 19 close() calls');

    const result = await VectorLinter.compareVector(da63Vector2.rawSvg, kotlinCode, { iconName: 'DocumentPlusIcon' });
    assert.equal(result.passed, true, 'da63 vector_2 must pass vector completeness comparison');
    assert.equal(result.violations.length, 0, 'Must have zero violations on valid synthesized Compose code');
    assert.equal(result.checks.subpaths.passed, true);
    assert.equal(result.checks.subpaths.deltaN, 0);
  });

  test('Test 2.3: Generates Android VectorDrawable XML for da63 vector_2 and verifies 100% pass', async () => {
    const parsed = SvgParser.parseSvgString(da63Vector2.rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);
    const xmlCounts = VectorLinter.countXmlClosedSubpaths(xml);
    assert.equal(xmlCounts.totalClosedSubpaths, 19, 'Generated XML has 19 Z/z commands in pathData');

    const result = await VectorLinter.compareVector(da63Vector2.rawSvg, xml, { iconName: 'DocumentPlusIcon' });
    assert.equal(result.passed, true, 'da63 vector_2 must pass XML comparison');
    assert.equal(result.violations.length, 0);
  });

  test('Test 2.4: Centroid oracle on intact da63 produces exact Delta C = 0.0000px <= 1.0px', async () => {
    const parsed = SvgParser.parseSvgString(da63Vector2.rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);
    const reconvertedSvg = VectorLinter.vectorDrawableToSvg(xml);

    const c1 = await VectorLinter.computeInkCentroid(da63Vector2.rawSvg, 26, 26);
    const c2 = await VectorLinter.computeInkCentroid(reconvertedSvg, 26, 26);
    const deltaC = Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy);

    assert.ok(deltaC <= 0.001, `Delta C must be virtually zero on identical vectors, got ${deltaC}px`);
  });

  test('Test 2.5: Bounding box IoU on intact da63 is 100.0% >= 90%', async () => {
    const parsed = SvgParser.parseSvgString(da63Vector2.rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);
    const reconvertedSvg = VectorLinter.vectorDrawableToSvg(xml);

    const b1 = await VectorLinter.computeBoundingBox(da63Vector2.rawSvg, { width: 26, height: 26 });
    const b2 = await VectorLinter.computeBoundingBox(reconvertedSvg, { width: 26, height: 26 });
    const iou = VectorLinter.computeBoxIoU(b1, b2);

    assert.equal(iou, 100.0, 'IoU on intact vector must be 100%');
  });

  test('Test 2.6: Simplified 7-subpath compound icon (3 badge + 3 fold + 1 body) passes 100% across SVG and Kotlin', async () => {
    const pathPlus = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 11.250 10)"/>`;
    const pathFold = `<path d="M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z" fill="#000" transform="matrix(1 0 0 1 11.875 1.875)"/>`;
    const pathBody = `<path d="M 9.375 0 L 10.057 -0.731 L 9.375 -1 L 1.875 -1 L 9.375 -1 L 1.875 18.5 Z" fill="#000" transform="matrix(1 0 0 1 3.125 1.875)"/>`;

    const fullSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathFold}${pathBody}</svg>`;
    const counts = VectorLinter.countSvgClosedSubpaths(fullSvg);
    assert.equal(counts.totalClosedSubpaths, 7, 'Must have exactly 7 closed subpaths');

    const parsed = SvgParser.parseSvgString(fullSvg);
    const kotlin = VectorGenerator.generateImageVectorFile([parsed]);
    const res = await VectorLinter.compareVector(fullSvg, kotlin, { iconName: 'CompoundDocument' });
    assert.equal(res.passed, true);
    assert.equal(res.checks.subpaths.deltaN, 0);
  });
});

// =========================================================================
// Suite 3: Synthetic Dropped Action Badge Detection & Veto (6 tests)
// =========================================================================
describe('Suite 3: Synthetic Dropped Action Badge Detection & Veto', () => {
  const pathPlus = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 11.250 10)"/>`;
  const pathFold = `<path d="M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z" fill="#000" transform="matrix(1 0 0 1 11.875 1.875)"/>`;
  const pathBody = `<path d="M 9.375 0 L 10.057 -0.731 L 9.375 -1 L 1.875 -1 L 9.375 -1 L 1.875 18.5 Z" fill="#000" transform="matrix(1 0 0 1 3.125 1.875)"/>`;

  const fullSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathFold}${pathBody}</svg>`;
  const droppedBadgeSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathFold}${pathBody}</svg>`;
  const droppedFoldSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathBody}</svg>`;
  const droppedBodySvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathFold}</svg>`;

  test('Test 3.1: Omission of plus sign action badge (+) triggers failing status, hasVeto, and SUBPATH_COUNT_MISMATCH', async () => {
    const res = await VectorLinter.compareVector(fullSvg, droppedBadgeSvg, { iconName: 'DocumentPlusIcon' });
    assert.equal(res.passed, false, 'Must fail when action badge is omitted');
    assert.equal(res.hasVeto, true, 'Must trigger veto');
    assert.equal(res.checks.subpaths.deltaN, 3, 'Delta N must be 3 (3 subpaths dropped with plus badge)');

    const subpathViolation = res.violations.find(v => v.rule === 'SUBPATH_COUNT_MISMATCH');
    assert.ok(subpathViolation, 'Must record SUBPATH_COUNT_MISMATCH violation');
    assert.ok(subpathViolation.message.includes('dropped sub-path'));
  });

  test('Test 3.2: Omission of corner fold flap (3 closed subpaths omitted) triggers veto', async () => {
    const res = await VectorLinter.compareVector(fullSvg, droppedFoldSvg, { iconName: 'DocumentPlusIcon' });
    assert.equal(res.passed, false);
    assert.equal(res.hasVeto, true);
    assert.equal(res.checks.subpaths.deltaN, 3);
  });

  test('Test 3.3: Omission of document body sheet triggers veto', async () => {
    const res = await VectorLinter.compareVector(fullSvg, droppedBodySvg, { iconName: 'DocumentPlusIcon' });
    assert.equal(res.passed, false);
    assert.equal(res.hasVeto, true);
    assert.equal(res.checks.subpaths.deltaN, 1);
  });

  test('Test 3.4: Dropped cutout hole in compound donut shape drops subpath count from 2 to 1 and triggers veto', async () => {
    const donutSvg = `<svg width="24" height="24"><path d="M 0 0 h 20 v 20 h -20 Z M 5 5 h 10 v 10 h -10 Z" fill="#000" /></svg>`;
    const solidSvg = `<svg width="24" height="24"><path d="M 0 0 h 20 v 20 h -20 Z" fill="#000" /></svg>`;

    const res = await VectorLinter.compareVector(donutSvg, solidSvg, { iconName: 'DonutIcon' });
    assert.equal(res.passed, false);
    assert.equal(res.checks.subpaths.deltaN, 1);
  });

  test('Test 3.5: Dropped badge simultaneously triggers subpath count mismatch AND centroid shift veto (Delta C >= 2.5px > 1.0px)', async () => {
    const res = await VectorLinter.compareVector(fullSvg, droppedBadgeSvg, { iconName: 'DocumentPlusIcon' });
    assert.equal(res.checks.subpaths.passed, false, 'Subpath check must fail');
    assert.equal(res.checks.centroid.passed, false, 'Centroid check must fail');
    assert.ok(res.checks.centroid.deltaC > 1.0, `Delta C must exceed 1.0px, was ${res.checks.centroid.deltaC}px`);
  });

  test('Test 3.6: When throwOnVeto: true is configured, VectorLintVetoError is thrown', async () => {
    const linter = new VectorLinter({ throwOnVeto: true });
    await assert.rejects(
      async () => {
        await linter.executeLint([fullSvg], [droppedBadgeSvg]);
      },
      (err) => {
        assert.equal(err.name, 'VectorLintVetoError');
        assert.ok(err.violations.length > 0);
        return true;
      }
    );
  });
});

// =========================================================================
// Suite 4: Collapsed Bounding Box & Degenerate Shapes (6 tests)
// =========================================================================
describe('Suite 4: Collapsed Bounding Box & Degenerate Shapes', () => {

  test('Test 4.1: Path with zero width (W <= 0.5px) with fill triggers COLLAPSED_BOUNDING_BOX veto', () => {
    const d = 'M 12 0 L 12 24'; // Zero width vertical line without stroke
    const bbox = VectorLinter.computeBoundingBoxAnalytical(d, 0);
    assert.equal(bbox.width, 0);
    assert.equal(bbox.isCollapsed, true, 'Zero width path must be flagged as collapsed');
  });

  test('Test 4.2: Path with zero height (H <= 0.5px) with fill triggers COLLAPSED_BOUNDING_BOX veto', () => {
    const d = 'M 0 12 L 24 12'; // Zero height horizontal line without stroke
    const bbox = VectorLinter.computeBoundingBoxAnalytical(d, 0);
    assert.equal(bbox.height, 0);
    assert.equal(bbox.isCollapsed, true, 'Zero height path must be flagged as collapsed');
  });

  test('Test 4.3: Degenerate scale transform collapses bounding box and triggers veto', async () => {
    const validSvg = `<svg width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="black" /></svg>`;
    const collapsedSvg = `<svg width="24" height="24"><g transform="scale(0, 1)"><rect x="2" y="2" width="20" height="20" fill="black" /></g></svg>`;

    const res = await VectorLinter.compareVector(validSvg, collapsedSvg, { iconName: 'ScaleZero' });
    assert.equal(res.passed, false);
    assert.ok(res.violations.some(v => v.rule === 'COLLAPSED_BOUNDING_BOX' || v.rule === 'BBOX_IOU_VIOLATION'));
  });

  test('Test 4.4: Bounding box IoU degradation below 90% triggers BBOX_IOU_VIOLATION veto', async () => {
    const boxA = [0, 0, 20, 20];
    const boxB = [10, 10, 20, 20]; // 50% shift yields ~23% IoU
    const iou = VectorLinter.computeBoxIoU(boxA, boxB);
    assert.ok(iou < 90.0, `IoU should be < 90%, was ${iou}%`);

    const svgA = `<svg width="40" height="40"><rect x="0" y="0" width="20" height="20" fill="black" /></svg>`;
    const svgB = `<svg width="40" height="40"><rect x="10" y="10" width="20" height="20" fill="black" /></svg>`;
    const res = await VectorLinter.compareVector(svgA, svgB, { iconName: 'DisplacedBox' });
    assert.equal(res.passed, false);
    assert.ok(res.violations.some(v => v.rule === 'BBOX_IOU_VIOLATION'));
  });

  test('Test 4.5: Stroked line (W=0px geom, strokeWidth=2) is NOT falsely flagged as collapsed', () => {
    const d = 'M 12 0 L 12 24';
    const bbox = VectorLinter.computeBoundingBoxAnalytical(d, 2.0); // 2px stroke width
    assert.equal(bbox.width, 2.0);
    assert.equal(bbox.isCollapsed, false, 'Stroked line with width 2.0 must not be collapsed');
  });

  test('Test 4.6: Multi-element icon where one sub-element collapses while others remain valid triggers veto', async () => {
    const validSvg = `
      <svg width="24" height="24">
        <rect x="2" y="2" width="10" height="10" fill="black" />
        <rect x="14" y="14" width="8" height="8" fill="black" />
      </svg>
    `;
    const corruptedSvg = `
      <svg width="24" height="24">
        <rect x="2" y="2" width="10" height="10" fill="black" />
        <rect x="14" y="14" width="0" height="8" fill="black" />
      </svg>
    `;
    const res = await VectorLinter.compareVector(validSvg, corruptedSvg, { iconName: 'MultiElement' });
    assert.equal(res.passed, false);
  });
});

// =========================================================================
// Suite 5: Continuous Ink Centroid Spatial Shift Oracle (Delta C) (6 tests)
// =========================================================================
describe('Suite 5: Continuous Ink Centroid Spatial Shift Oracle (Delta C)', () => {

  test('Test 5.1: Identical source and synthesized vectors yield Delta C = 0.0px <= 1.0px', async () => {
    const svg = `<svg width="24" height="24"><circle cx="12" cy="12" r="8" fill="black" /></svg>`;
    const c1 = await VectorLinter.computeInkCentroid(svg, 24, 24);
    const c2 = await VectorLinter.computeInkCentroid(svg, 24, 24);
    const deltaC = Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy);

    assert.equal(deltaC, 0.0);
    const res = await VectorLinter.compareVector(svg, svg, { iconName: 'Circle' });
    assert.equal(res.passed, true);
    assert.equal(res.checks.centroid.deltaC, 0.0);
  });

  test('Test 5.2: Micro-drift of 0.4px (Delta C <= 1.0px) passes within allowable tolerance noise floor', async () => {
    const svgA = `<svg width="40" height="40"><circle cx="20" cy="20" r="10" fill="black" /></svg>`;
    const svgB = `<svg width="40" height="40"><circle cx="20.4" cy="20" r="10" fill="black" /></svg>`;

    const res = await VectorLinter.compareVector(svgA, svgB, { iconName: 'MicroDrift', maxCentroidDrift: 1.0 });
    assert.equal(res.checks.centroid.passed, true, 'Shift of 0.4px must pass <= 1.0px threshold');
    assert.ok(res.checks.centroid.deltaC <= 0.6);
  });

  test('Test 5.3: Displaced icon with translation shift of 2.5px triggers CENTROID_DRIFT_EXCEEDED veto', async () => {
    const svgA = `<svg width="40" height="40"><circle cx="20" cy="20" r="10" fill="black" /></svg>`;
    const svgB = `<svg width="40" height="40"><circle cx="22.5" cy="20" r="10" fill="black" /></svg>`;

    const res = await VectorLinter.compareVector(svgA, svgB, { iconName: 'Drift2_5', maxCentroidDrift: 1.0 });
    assert.equal(res.passed, false);
    assert.equal(res.checks.centroid.passed, false);
    assert.ok(res.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED'));
  });

  test('Test 5.4: Empirical da63 plus badge omission measures Delta C = 2.5104px > 1.0px matching physics', async () => {
    const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../output/test_da63/design_spec.json'), 'utf8'));
    const vec2 = spec.vectors.find(v => v.id === 'vector_2');
    const fullSvg = vec2.rawSvg;
    // Omit plus badge
    const droppedSvg = fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 11\.250 10\)[^>]*><\/path>/, '');

    const c1 = await VectorLinter.computeInkCentroid(fullSvg, 26, 26);
    const c2 = await VectorLinter.computeInkCentroid(droppedSvg, 26, 26);
    const deltaC = Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy);

    assert.ok(Math.abs(deltaC - 2.5104) < 0.001, `Delta C must be 2.5104px, was ${deltaC}px`);
    assert.ok(deltaC > 1.0, 'Must exceed 1.0px threshold');
  });

  test('Test 5.5: Empty synthesized vector (source mass > 0, synth mass = 0) triggers EMPTY_SYNTHESIZED_VECTOR veto', async () => {
    const sourceSvg = `<svg width="24" height="24"><rect width="10" height="10" fill="black" /></svg>`;
    const emptySvg = `<svg width="24" height="24"></svg>`;

    const res = await VectorLinter.compareVector(sourceSvg, emptySvg, { iconName: 'EmptyTest' });
    assert.equal(res.passed, false);
    assert.ok(res.violations.some(v => v.rule === 'EMPTY_SYNTHESIZED_VECTOR'));
  });

  test('Test 5.6: Per-vector centroid coordinates and Delta C are populated in report', async () => {
    const svg = `<svg width="24" height="24"><rect x="0" y="0" width="10" height="10" fill="black" /></svg>`;
    const res = await VectorLinter.compareVector(svg, svg, { iconName: 'ReportTest' });
    assert.ok(Number.isFinite(res.checks.centroid.source.cx));
    assert.ok(Number.isFinite(res.checks.centroid.source.cy));
    assert.ok(Number.isFinite(res.checks.centroid.synth.cx));
    assert.ok(Number.isFinite(res.checks.centroid.synth.cy));
    assert.equal(res.checks.centroid.deltaC, 0);
  });
});

// =========================================================================
// Suite 6: False Positive Avoidance & Edge Cases (6 tests)
// =========================================================================
describe('Suite 6: False Positive Avoidance & Edge Cases', () => {

  test('Test 6.1: Open stroked chevron (polyline / path without Z) has N_closed = 0 on both sides and passes', async () => {
    const chevronSvg = `<svg width="24" height="24" fill="none"><polyline points="6 9 12 15 18 9" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
    const parsed = SvgParser.parseSvgString(chevronSvg);
    const kotlin = VectorGenerator.generateImageVectorFile([parsed]);

    const res = await VectorLinter.compareVector(chevronSvg, kotlin, { iconName: 'ChevronDownIcon' });
    assert.equal(res.checks.subpaths.sourceClosed, 0);
    assert.equal(res.checks.subpaths.synthClosed, 0);
    assert.equal(res.checks.subpaths.deltaN, 0);
    assert.equal(res.passed, true, 'Open stroked chevron must pass without false positive veto');
  });

  test('Test 6.2: Primitive <circle> normalized to arc path verified as 1 closed sub-path on both sides and passes', async () => {
    const circleSvg = `<svg width="24" height="24"><circle cx="12" cy="12" r="5" fill="#1a1a1a" /></svg>`;
    const parsed = SvgParser.parseSvgString(circleSvg);
    const kotlin = VectorGenerator.generateImageVectorFile([parsed]);

    const res = await VectorLinter.compareVector(circleSvg, kotlin, { iconName: 'CircleIcon' });
    assert.equal(res.checks.subpaths.sourceClosed, 1);
    assert.equal(res.checks.subpaths.synthClosed, 1);
    assert.equal(res.passed, true);
  });

  test('Test 6.3: Case insensitivity: lowercase z vs uppercase Z in SVG/XML are counted equivalently', () => {
    const lowerD = 'M 0 0 L 10 10 z M 20 20 L 30 30 z';
    const upperD = 'M 0 0 L 10 10 Z M 20 20 L 30 30 Z';
    assert.equal(VectorLinter.countClosedSubpathsFromD(lowerD), 2);
    assert.equal(VectorLinter.countClosedSubpathsFromD(upperD), 2);
  });

  test('Test 6.4: Whitespace, tabs, and comments in Kotlin Compose code do not distort close() count', () => {
    const messyKotlin = `
      path(fill = SolidColor(Color(0xFF000000))) {
          // This comment contains word close()
          /* Another comment with close() */
          moveTo(0f, 0f)
          lineTo(10f, 10f)
          close   ()
      }
    `;
    const counts = VectorLinter.countComposeClosedSubpaths(messyKotlin, 'Messy');
    assert.equal(counts.totalClosedSubpaths, 1, 'Comments with close() must be ignored');
  });

  test('Test 6.5: Non-rendered elements in <defs>, <clipPath>, and <mask /> are excluded from sub-path count', () => {
    const svgWithDefs = `
      <svg width="24" height="24">
        <defs>
          <path id="def_path" d="M 0 0 L 10 10 Z" />
          <rect id="def_rect" width="10" height="10" />
        </defs>
        <path d="M 5 5 L 15 15 Z" />
      </svg>
    `;
    const res = VectorLinter.countSvgClosedSubpaths(svgWithDefs);
    assert.equal(res.totalClosedSubpaths, 1, 'Only rendered paths outside defs must be counted');
  });

  test('Test 6.6: Empty vector list evaluates cleanly without unhandled crashes', async () => {
    const report = await VectorLinter.lint([], []);
    assert.equal(report.passed, true);
    assert.equal(report.totalVectorsEvaluated, 0);
    assert.equal(report.violations.length, 0);
    assert.equal(report.exitCode, EXIT_CODES.SUCCESS);
  });
});

// =========================================================================
// Suite 7: Pipeline Integration, CLI & Process Exit Codes (5 tests)
// =========================================================================
describe('Suite 7: Pipeline Integration, CLI & Process Exit Codes', () => {
  const scriptPath = path.resolve(__dirname, '../../verification/vector_linter.js');
  const specPath = path.resolve(__dirname, '../../output/test_da63/design_spec.json');

  test('Test 7.1: CLI execution with missing arguments exits with code 2 (INVALID_ARGUMENTS)', () => {
    const res = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.ok(res.stderr.includes('Path to design_spec.json is required'));
  });

  test('Test 7.2: CLI execution with non-existent spec file exits with code 2 (INVALID_ARGUMENTS)', () => {
    const res = spawnSync(process.execPath, [scriptPath, 'missing_file.json', './output'], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.ok(res.stderr.includes('Spec file not found'));
  });

  test('Test 7.3: CLI --json flag emits valid JSON string matching diagnostic report schema', () => {
    const res = spawnSync(process.execPath, [scriptPath, specPath, './output/test_da63', '--json'], { encoding: 'utf8' });
    assert.ok(res.stdout.trim().startsWith('{'), 'Output must start with JSON {');
    const parsed = JSON.parse(res.stdout);
    assert.ok('passed' in parsed);
    assert.ok('hasVeto' in parsed);
    assert.ok('totalVectorsEvaluated' in parsed);
    assert.ok('violations' in parsed);
    assert.ok(Array.isArray(parsed.violations));
  });

  test('Test 7.4: Programmatic VectorLinter.lint in-memory returns structured report', async () => {
    const svg1 = `<svg width="24" height="24"><circle cx="12" cy="12" r="10" fill="black" /></svg>`;
    const report = await VectorLinter.lint([svg1], [svg1]);
    assert.equal(report.passed, true);
    assert.equal(report.exitCode, 0);
    assert.equal(report.passedVectorsCount, 1);
    assert.equal(report.failedVectorsCount, 0);
  });

  test('Test 7.5: CLI execution on a synthesized spec with an induced defect exits with code 1 (VETO_FAILURE)', () => {
    // Create a temporary defective spec file
    const tmpDir = path.resolve(__dirname, '../../output/tmp_linter_test');
    fs.mkdirSync(tmpDir, { recursive: true });

    const defectiveSpec = {
      vectors: [
        {
          id: 'vector_defect',
          name: 'DefectIcon',
          rawSvg: '<svg width="24" height="24"><rect width="10" height="10" /><circle cx="12" cy="12" r="5" /></svg>',
          paths: [
            { d: 'M 0 0 h 10 v 10 h -10 Z' } // Missing circle subpath!
          ]
        }
      ]
    };
    const tmpSpecPath = path.join(tmpDir, 'defective_spec.json');
    fs.writeFileSync(tmpSpecPath, JSON.stringify(defectiveSpec, null, 2), 'utf8');

    try {
      const res = spawnSync(process.execPath, [scriptPath, tmpSpecPath, tmpDir], { encoding: 'utf8' });
      assert.equal(res.status, 1, 'Defective vector must exit with code 1 (VETO_FAILURE)');
    } finally {
      // Clean up temp test files
      if (fs.existsSync(tmpSpecPath)) fs.unlinkSync(tmpSpecPath);
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    }
  });
});
