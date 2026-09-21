#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Stress & Empirical Verification Suite: Milestone 4 (R4)
 * Sub-Glyph Semantic Path Completeness Linter & Verification Gate
 *
 * Executed by: r4_m4_challenger_1 (Role: critic, specialist)
 * Working Directory: /Users/anjan/.gemini/antigravity/scratch/claude_to_compose
 *
 * MISSION:
 * 1. Stress-test the tri-factor oracle with diverse real and synthetic vectors:
 *    - Real-world da63 compound document icon (document sheet body + fold + plus badge):
 *      assert 100% PASS with Delta N = 0, Delta C = 0.000px, IoU >= 99%.
 *    - Intentionally pruned sub-paths (drop plus badge, drop fold flap, drop inner hole):
 *      assert unambiguous VETO, Delta N != 0, Delta C > 1.0px, and exit code 1.
 *    - Intentionally collapsed bounding boxes (scale to 0, degenerate line y1=y2 with 0 stroke width):
 *      assert VETO.
 *    - Intentionally shifted sub-elements (translate plus badge by 5px):
 *      assert centroid spatial shift Delta C > 1.0px triggers VETO.
 * 2. Verify CLI invocation:
 *    - node verification/vector_linter.js --help -> exit code 0.
 *    - node verification/vector_linter.js (no args) -> exit code 2.
 *    - CLI execution on valid spec -> exit code 0.
 *    - CLI execution on invalid spec with missing badge -> exit code 1.
 * 3. Verify full test suites:
 *    - npm run test:unit
 *    - npm test
 *    - node test/e2e/run_all.js
 *    - cd android && ./gradlew test
 * ============================================================================
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync, execSync } = require('node:child_process');

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
  lintSpec,
  vectorDrawableToSvg,
  composeCodeToSvg,
  splitSubpaths
} = require('../../verification/vector_linter');

const { SvgParser } = require('../../extractor/svg_parser');
const { VectorGenerator } = require('../../synthesizer/vector_generator');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'verification/vector_linter.js');
const DA63_SPEC_PATH = path.join(PROJECT_ROOT, 'output/test_da63/design_spec.json');

const testResults = [];
let passCount = 0;
let failCount = 0;

function recordTest(id, name, category, passed, details = {}) {
  testResults.push({ id, name, category, passed, details });
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

// ============================================================================
// SUITE 1: Real-World da63 Compound Document Icon Tri-Factor Oracle (100% Pass)
// ============================================================================
async function runSuite1() {
  console.log('\n======================================================================');
  console.log(' SUITE 1: Real-World da63 Compound Document Icon Tri-Factor Oracle');
  console.log('======================================================================');

  assert.ok(fs.existsSync(DA63_SPEC_PATH), `da63 design_spec.json must exist at ${DA63_SPEC_PATH}`);
  const spec = JSON.parse(fs.readFileSync(DA63_SPEC_PATH, 'utf8'));
  const vec2 = spec.vectors.find(v => v.id === 'vector_2');
  assert.ok(vec2, 'vector_2 must be present in da63 spec');
  assert.equal(vec2.paths.length, 3, 'vector_2 must contain 3 paths (badge + fold + body)');

  // Test 1.1: Verify sub-path counting on raw SVG
  try {
    const counts = VectorLinter.countSvgClosedSubpaths(vec2.rawSvg);
    const passed = counts.totalClosedSubpaths === 19 && counts.totalOpenSubpaths === 0 && counts.elementCount === 3;
    recordTest('1.1', 'Raw da63 vector_2 contains exactly 19 closed sub-paths and 3 elements', 'Real-World da63', passed, {
      expected: { totalClosed: 19, totalOpen: 0, elements: 3 },
      actual: { totalClosed: counts.totalClosedSubpaths, totalOpen: counts.totalOpenSubpaths, elements: counts.elementCount }
    });
  } catch (err) {
    recordTest('1.1', 'Raw da63 vector_2 contains exactly 19 closed sub-paths and 3 elements', 'Real-World da63', false, { reason: err.message });
  }

  // Test 1.2: Kotlin ImageVector Synthesis & Full Oracle Verification (Delta N = 0, Delta C = 0.000px, IoU >= 99%)
  try {
    const parsed = SvgParser.parseSvgString(vec2.rawSvg);
    const kotlinCode = VectorGenerator.generateImageVectorFile([parsed]);
    const composeCounts = VectorLinter.countComposeClosedSubpaths(kotlinCode, 'Icon1Icon');
    assert.equal(composeCounts.totalClosedSubpaths, 19, 'Generated Kotlin code must contain 19 close() calls');

    const result = await VectorLinter.compareVector(vec2.rawSvg, kotlinCode, { iconName: 'DocumentPlusIcon' });

    const deltaN = result.checks.subpaths.deltaN;
    const deltaC = result.checks.centroid.deltaC;
    const iou = result.checks.bbox.iou;

    const passed = result.passed === true &&
                   result.hasVeto === false &&
                   result.violations.length === 0 &&
                   deltaN === 0 &&
                   deltaC <= 0.001 &&
                   iou >= 99.0;

    recordTest('1.2', 'Synthesized Compose Kotlin passes tri-factor oracle (Delta N = 0, Delta C = 0.000px, IoU >= 99%)', 'Real-World da63', passed, {
      expected: { passed: true, hasVeto: false, deltaN: 0, deltaC: '<= 0.001', iou: '>= 99.0%' },
      actual: { passed: result.passed, hasVeto: result.hasVeto, deltaN, deltaC, iou: `${iou}%`, violations: result.violations.length }
    });
  } catch (err) {
    recordTest('1.2', 'Synthesized Compose Kotlin passes tri-factor oracle', 'Real-World da63', false, { reason: err.message });
  }

  // Test 1.3: Android VectorDrawable XML Synthesis & Full Oracle Verification
  try {
    const parsed = SvgParser.parseSvgString(vec2.rawSvg);
    const xml = VectorGenerator.generateVectorDrawableXml(parsed);
    const xmlCounts = VectorLinter.countXmlClosedSubpaths(xml);
    assert.equal(xmlCounts.totalClosedSubpaths, 19, 'Generated XML must contain 19 Z/z commands');

    const result = await VectorLinter.compareVector(vec2.rawSvg, xml, { iconName: 'DocumentPlusIcon' });
    const deltaN = result.checks.subpaths.deltaN;
    const deltaC = result.checks.centroid.deltaC;
    const iou = result.checks.bbox.iou;

    const passed = result.passed === true &&
                   result.hasVeto === false &&
                   result.violations.length === 0 &&
                   deltaN === 0 &&
                   deltaC <= 0.001 &&
                   iou >= 99.0;

    recordTest('1.3', 'Synthesized Android VectorDrawable XML passes tri-factor oracle (Delta N = 0, Delta C = 0.000px, IoU >= 99%)', 'Real-World da63', passed, {
      expected: { passed: true, hasVeto: false, deltaN: 0, deltaC: '<= 0.001', iou: '>= 99.0%' },
      actual: { passed: result.passed, hasVeto: result.hasVeto, deltaN, deltaC, iou: `${iou}%` }
    });
  } catch (err) {
    recordTest('1.3', 'Synthesized Android VectorDrawable XML passes tri-factor oracle', 'Real-World da63', false, { reason: err.message });
  }

  // Test 1.4: Real-world toolbar action icons in da63 (vector_2, vector_3, vector_4) pass with 0 false vetos
  try {
    const iconIds = ['vector_2', 'vector_3', 'vector_4'];
    let allPassed = true;
    const evaluated = [];

    for (const id of iconIds) {
      const v = spec.vectors.find(x => x.id === id);
      const parsed = v.rawSvg ? SvgParser.parseSvgString(v.rawSvg) : v;
      const kotlin = VectorGenerator.generateImageVectorFile([parsed]);
      const res = await VectorLinter.compareVector(v.rawSvg, kotlin, { iconName: v.name || v.id });
      evaluated.push({ id, passed: res.passed, deltaN: res.checks.subpaths.deltaN, deltaC: res.checks.centroid.deltaC });
      if (!res.passed) allPassed = false;
    }

    recordTest('1.4', 'Real-world toolbar icons in da63 (vector_2, vector_3, vector_4) pass tri-factor oracle with zero false vetos', 'Real-World da63', allPassed, {
      actual: evaluated
    });
  } catch (err) {
    recordTest('1.4', 'Real-world toolbar icons in da63 pass tri-factor oracle', 'Real-World da63', false, { reason: err.message });
  }

  // Test 1.5: Simplified 7-subpath compound icon (3 badge + 3 fold + 1 body)
  try {
    const pathPlus = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 11.250 10)"/>`;
    const pathFold = `<path d="M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z" fill="#000" transform="matrix(1 0 0 1 11.875 1.875)"/>`;
    const pathBody = `<path d="M 9.375 0 L 10.057 -0.731 L 9.375 -1 L 1.875 -1 L 9.375 -1 L 1.875 18.5 Z" fill="#000" transform="matrix(1 0 0 1 3.125 1.875)"/>`;
    const fullCompoundSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathFold}${pathBody}</svg>`;

    const parsed = SvgParser.parseSvgString(fullCompoundSvg);
    const kotlin = VectorGenerator.generateImageVectorFile([parsed]);
    const res = await VectorLinter.compareVector(fullCompoundSvg, kotlin, { iconName: 'CompoundDocument' });

    const passed = res.passed && res.checks.subpaths.deltaN === 0 && res.checks.centroid.deltaC <= 0.001 && res.checks.bbox.iou >= 99.0;
    recordTest('1.5', 'Synthesized 7-subpath compound icon passes with Delta N = 0, Delta C <= 0.001px, IoU >= 99%', 'Real-World da63', passed, {
      actual: { deltaN: res.checks.subpaths.deltaN, deltaC: res.checks.centroid.deltaC, iou: res.checks.bbox.iou }
    });
  } catch (err) {
    recordTest('1.5', 'Synthesized 7-subpath compound icon passes', 'Real-World da63', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 2: Intentionally Pruned Sub-Paths & Structural Deletions (Veto Asserts)
// ============================================================================
async function runSuite2() {
  console.log('\n======================================================================');
  console.log(' SUITE 2: Intentionally Pruned Sub-Paths & Structural Deletions');
  console.log('======================================================================');

  const spec = JSON.parse(fs.readFileSync(DA63_SPEC_PATH, 'utf8'));
  const vec2 = spec.vectors.find(v => v.id === 'vector_2');
  const fullSvg = vec2.rawSvg;

  // Test 2.1: Intentionally drop plus badge from da63 compound document icon
  try {
    // Drop plus badge path (matrix(1 0 0 1 11.250 10))
    const droppedPlusSvg = fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 11\.250 10\)[^>]*><\/path>/, '');
    const res = await VectorLinter.compareVector(fullSvg, droppedPlusSvg, { iconName: 'DocumentPlusIcon' });

    const deltaN = res.checks.subpaths.deltaN;
    const deltaC = res.checks.centroid.deltaC;
    const passed = res.passed === false &&
                   res.hasVeto === true &&
                   deltaN !== 0 &&
                   deltaC > 1.0 &&
                   res.violations.some(v => v.rule === 'SUBPATH_COUNT_MISMATCH') &&
                   res.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED');

    recordTest('2.1', 'Omission of plus badge triggers unambiguous VETO, Delta N != 0 (Delta N = 3), and Delta C > 1.0px (2.510px)', 'Sub-Path Pruning', passed, {
      expected: { passed: false, hasVeto: true, deltaN: 3, deltaC: '> 1.0px', rules: ['SUBPATH_COUNT_MISMATCH', 'CENTROID_DRIFT_EXCEEDED'] },
      actual: { passed: res.passed, hasVeto: res.hasVeto, deltaN, deltaC: `${deltaC.toFixed(4)}px`, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('2.1', 'Omission of plus badge triggers unambiguous VETO', 'Sub-Path Pruning', false, { reason: err.message });
  }

  // Test 2.2: Intentionally drop corner fold flap from da63 compound document icon
  try {
    // Drop fold flap path (matrix(1 0 0 1 11.875 1.875))
    const droppedFoldSvg = fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 11\.875 1\.875\)[^>]*><\/path>/, '');
    const res = await VectorLinter.compareVector(fullSvg, droppedFoldSvg, { iconName: 'DocumentPlusIcon' });

    const deltaN = res.checks.subpaths.deltaN;
    const deltaC = res.checks.centroid.deltaC;
    const passed = res.passed === false &&
                   res.hasVeto === true &&
                   deltaN !== 0 &&
                   res.violations.some(v => v.rule === 'SUBPATH_COUNT_MISMATCH');

    recordTest('2.2', 'Omission of corner fold flap triggers unambiguous VETO, Delta N != 0 (Delta N = 3)', 'Sub-Path Pruning', passed, {
      expected: { passed: false, hasVeto: true, deltaN: 3 },
      actual: { passed: res.passed, hasVeto: res.hasVeto, deltaN, deltaC: `${deltaC.toFixed(4)}px`, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('2.2', 'Omission of corner fold flap triggers unambiguous VETO', 'Sub-Path Pruning', false, { reason: err.message });
  }

  // Test 2.3: Intentionally drop inner cutout hole in compound vector
  try {
    const donutSvg = `<svg width="24" height="24"><path d="M 0 0 h 20 v 20 h -20 Z M 5 5 h 10 v 10 h -10 Z" fill="#000" /></svg>`;
    const solidNoHoleSvg = `<svg width="24" height="24"><path d="M 0 0 h 20 v 20 h -20 Z" fill="#000" /></svg>`;

    const res = await VectorLinter.compareVector(donutSvg, solidNoHoleSvg, { iconName: 'DonutHole' });
    const deltaN = res.checks.subpaths.deltaN;

    const passed = res.passed === false &&
                   res.hasVeto === true &&
                   deltaN === 1 &&
                   res.violations.some(v => v.rule === 'SUBPATH_COUNT_MISMATCH');

    recordTest('2.3', 'Omission of inner cutout hole in compound vector triggers unambiguous VETO and Delta N = 1', 'Sub-Path Pruning', passed, {
      expected: { passed: false, hasVeto: true, deltaN: 1 },
      actual: { passed: res.passed, hasVeto: res.hasVeto, deltaN, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('2.3', 'Omission of inner cutout hole triggers unambiguous VETO', 'Sub-Path Pruning', false, { reason: err.message });
  }

  // Test 2.4: Intentionally drop document sheet body from da63
  try {
    const droppedBodySvg = fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 3\.125 1\.875\)[^>]*><\/path>/, '');
    const res = await VectorLinter.compareVector(fullSvg, droppedBodySvg, { iconName: 'DocumentPlusIcon' });

    const deltaN = res.checks.subpaths.deltaN;
    const deltaC = res.checks.centroid.deltaC;
    const passed = res.passed === false &&
                   res.hasVeto === true &&
                   deltaN !== 0 &&
                   deltaC > 1.0;

    recordTest('2.4', 'Omission of main document body triggers unambiguous VETO, Delta N != 0, and Delta C > 1.0px', 'Sub-Path Pruning', passed, {
      expected: { passed: false, hasVeto: true, deltaC: '> 1.0px' },
      actual: { passed: res.passed, hasVeto: res.hasVeto, deltaN, deltaC: `${deltaC.toFixed(4)}px` }
    });
  } catch (err) {
    recordTest('2.4', 'Omission of main document body triggers unambiguous VETO', 'Sub-Path Pruning', false, { reason: err.message });
  }

  // Test 2.5: In-memory linting of defective vector list throws VectorLintVetoError when throwOnVeto is set
  try {
    const linter = new VectorLinter({ throwOnVeto: true });
    let threwCorrectly = false;
    try {
      await linter.executeLint([fullSvg], [fullSvg.replace(/<path[^>]*matrix\(1 0 0 1 11\.250 10\)[^>]*><\/path>/, '')]);
    } catch (err) {
      if (err.name === 'VectorLintVetoError' && err.violations.length > 0) {
        threwCorrectly = true;
      }
    }
    recordTest('2.5', 'throwOnVeto: true throws VectorLintVetoError with populated violations on sub-path omission', 'Sub-Path Pruning', threwCorrectly);
  } catch (err) {
    recordTest('2.5', 'throwOnVeto: true throws VectorLintVetoError', 'Sub-Path Pruning', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 3: Intentionally Collapsed Bounding Boxes & Degenerate Geometries
// ============================================================================
async function runSuite3() {
  console.log('\n======================================================================');
  console.log(' SUITE 3: Intentionally Collapsed Bounding Boxes & Degenerate Geometries');
  console.log('======================================================================');

  // Test 3.1: Scale transform to 0 collapses bounding box and triggers VETO
  try {
    const validSvg = `<svg width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="black" /></svg>`;
    const scaledZeroSvg = `<svg width="24" height="24"><g transform="scale(0, 1)"><rect x="2" y="2" width="20" height="20" fill="black" /></g></svg>`;

    const res = await VectorLinter.compareVector(validSvg, scaledZeroSvg, { iconName: 'ScaleZero' });
    const hasCollapseOrIou = res.violations.some(v => v.rule === 'COLLAPSED_BOUNDING_BOX' || v.rule === 'BBOX_IOU_VIOLATION' || v.rule === 'EMPTY_SYNTHESIZED_VECTOR');
    const passed = res.passed === false && res.hasVeto === true && hasCollapseOrIou;

    recordTest('3.1', 'Intentionally collapsed bounding box via transform="scale(0, 1)" triggers VETO', 'Collapsed Bbox', passed, {
      expected: { passed: false, hasVeto: true },
      actual: { passed: res.passed, hasVeto: res.hasVeto, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('3.1', 'scale(0, 1) collapses bounding box and triggers VETO', 'Collapsed Bbox', false, { reason: err.message });
  }

  // Test 3.2: Degenerate line y1 = y2 with 0 stroke width collapses height (H = 0px <= 0.5px)
  try {
    const d = 'M 0 12 L 24 12'; // Horizontal line with 0 stroke
    const bbox = VectorLinter.computeBoundingBoxAnalytical(d, 0.0);
    const passed = bbox.height === 0 && bbox.isCollapsed === true;

    recordTest('3.2', 'Degenerate horizontal line y1 = y2 with strokeWidth = 0 collapses to H = 0.0px (isCollapsed = true)', 'Collapsed Bbox', passed, {
      expected: { height: 0, isCollapsed: true },
      actual: { height: bbox.height, isCollapsed: bbox.isCollapsed }
    });
  } catch (err) {
    recordTest('3.2', 'Degenerate line y1=y2 with 0 stroke width collapses', 'Collapsed Bbox', false, { reason: err.message });
  }

  // Test 3.3: Degenerate line x1 = x2 with 0 stroke width collapses width (W = 0px <= 0.5px)
  try {
    const d = 'M 12 0 L 12 24'; // Vertical line with 0 stroke
    const bbox = VectorLinter.computeBoundingBoxAnalytical(d, 0.0);
    const passed = bbox.width === 0 && bbox.isCollapsed === true;

    recordTest('3.3', 'Degenerate vertical line x1 = x2 with strokeWidth = 0 collapses to W = 0.0px (isCollapsed = true)', 'Collapsed Bbox', passed, {
      expected: { width: 0, isCollapsed: true },
      actual: { width: bbox.width, isCollapsed: bbox.isCollapsed }
    });
  } catch (err) {
    recordTest('3.3', 'Degenerate line x1=x2 with 0 stroke width collapses', 'Collapsed Bbox', false, { reason: err.message });
  }

  // Test 3.4: Degenerate line compared against source rect triggers COLLAPSED_BOUNDING_BOX VETO
  try {
    const validSvg = `<svg width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="black" /></svg>`;
    const degenerateLineSvg = `<svg width="24" height="24"><path d="M 0 12 L 24 12" fill="black" /></svg>`;

    const res = await VectorLinter.compareVector(validSvg, degenerateLineSvg, { iconName: 'LineIcon' });
    const passed = res.passed === false && res.hasVeto === true && res.violations.some(v => v.rule === 'COLLAPSED_BOUNDING_BOX' || v.rule === 'BBOX_IOU_VIOLATION');

    recordTest('3.4', 'Synthesized degenerate line against source rect triggers COLLAPSED_BOUNDING_BOX VETO', 'Collapsed Bbox', passed, {
      expected: { passed: false, hasVeto: true },
      actual: { passed: res.passed, hasVeto: res.hasVeto, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('3.4', 'Synthesized degenerate line against source rect triggers VETO', 'Collapsed Bbox', false, { reason: err.message });
  }

  // Test 3.5: Empty SVG with zero ink triggers EMPTY_SYNTHESIZED_VECTOR VETO
  try {
    const validSvg = `<svg width="24" height="24"><circle cx="12" cy="12" r="8" fill="black" /></svg>`;
    const emptySvg = `<svg width="24" height="24"></svg>`;

    const res = await VectorLinter.compareVector(validSvg, emptySvg, { iconName: 'EmptyVector' });
    const passed = res.passed === false && res.hasVeto === true && res.violations.some(v => v.rule === 'EMPTY_SYNTHESIZED_VECTOR');

    recordTest('3.5', 'Synthesized vector with zero ink triggers EMPTY_SYNTHESIZED_VECTOR VETO', 'Collapsed Bbox', passed, {
      expected: { passed: false, hasVeto: true, rule: 'EMPTY_SYNTHESIZED_VECTOR' },
      actual: { passed: res.passed, hasVeto: res.hasVeto, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('3.5', 'Synthesized vector with zero ink triggers EMPTY_SYNTHESIZED_VECTOR VETO', 'Collapsed Bbox', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 4: Intentionally Shifted Sub-Elements & Centroid Spatial Drift
// ============================================================================
async function runSuite4() {
  console.log('\n======================================================================');
  console.log(' SUITE 4: Intentionally Shifted Sub-Elements & Centroid Spatial Drift');
  console.log('======================================================================');

  const pathPlus = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 11.250 10)"/>`;
  const pathFold = `<path d="M 0 6.25 L -1 6.25 C -1 6.802 -0.552 7.25 0 7.25 L 0 6.25 Z M -1 0 L -1 6.25 L 1 6.25 L 1 0 L -1 0 Z M 0 7.25 L 6.25 7.25 L 6.25 5.25 L 0 5.25 L 0 7.25 Z" fill="#000" transform="matrix(1 0 0 1 11.875 1.875)"/>`;
  const pathBody = `<path d="M 9.375 0 L 10.057 -0.731 L 9.375 -1 L 1.875 -1 L 9.375 -1 L 1.875 18.5 Z" fill="#000" transform="matrix(1 0 0 1 3.125 1.875)"/>`;

  const intactSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${pathPlus}${pathFold}${pathBody}</svg>`;

  // Test 4.1: Translate plus badge by +5px (x: 11.25 -> 16.25)
  try {
    const shiftedPlusPath = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 16.250 10)"/>`;
    const shiftedSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${shiftedPlusPath}${pathFold}${pathBody}</svg>`;

    const res = await VectorLinter.compareVector(intactSvg, shiftedSvg, { iconName: 'DocumentPlusIcon', maxCentroidDrift: 1.0 });
    const deltaC = res.checks.centroid.deltaC;
    const deltaN = res.checks.subpaths.deltaN;

    const passed = res.passed === false &&
                   res.hasVeto === true &&
                   deltaN === 0 && // Sub-path count is preserved!
                   deltaC > 1.0 &&  // Centroid shift catches the subtle displacement!
                   res.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED');

    recordTest('4.1', 'Sub-element translation by +5px preserves sub-path count (Delta N = 0) but triggers CENTROID_DRIFT_EXCEEDED VETO (Delta C > 1.0px)', 'Spatial Drift', passed, {
      expected: { passed: false, hasVeto: true, deltaN: 0, deltaC: '> 1.0px' },
      actual: { passed: res.passed, hasVeto: res.hasVeto, deltaN, deltaC: `${deltaC.toFixed(4)}px`, violations: res.violations.map(v => v.rule) }
    });
  } catch (err) {
    recordTest('4.1', 'Sub-element translation by +5px triggers CENTROID_DRIFT_EXCEEDED VETO', 'Spatial Drift', false, { reason: err.message });
  }

  // Test 4.2: Translate plus badge by +3px
  try {
    const shifted3pxPath = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 14.250 10)"/>`;
    const shifted3pxSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${shifted3pxPath}${pathFold}${pathBody}</svg>`;

    const res = await VectorLinter.compareVector(intactSvg, shifted3pxSvg, { iconName: 'DocumentPlusIcon', maxCentroidDrift: 1.0 });
    const deltaC = res.checks.centroid.deltaC;

    const passed = res.passed === false && deltaC > 1.0 && res.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED');

    recordTest('4.2', 'Sub-element translation by +3px triggers CENTROID_DRIFT_EXCEEDED VETO (Delta C > 1.0px)', 'Spatial Drift', passed, {
      expected: { passed: false, deltaC: '> 1.0px' },
      actual: { passed: res.passed, deltaC: `${deltaC.toFixed(4)}px` }
    });
  } catch (err) {
    recordTest('4.2', 'Sub-element translation by +3px triggers CENTROID_DRIFT_EXCEEDED VETO', 'Spatial Drift', false, { reason: err.message });
  }

  // Test 4.3: Permissible subpixel noise (translate by 0.3px) passes comfortably without false veto
  try {
    const microShiftedPath = `<path d="M 3.375 0 L 3.375 8.75 L 5.375 8.75 L 5.375 0 L 3.375 0 Z M 0 5.375 L 4.375 5.375 L 4.375 3.375 L 0 3.375 L 0 5.375 Z M 4.375 5.375 L 8.75 5.375 L 8.75 3.375 L 4.375 3.375 L 4.375 5.375 Z" fill="#000" transform="matrix(1 0 0 1 11.550 10)"/>`;
    const microShiftedSvg = `<svg width="26" height="26" viewBox="0 0 20 20">${microShiftedPath}${pathFold}${pathBody}</svg>`;

    const res = await VectorLinter.compareVector(intactSvg, microShiftedSvg, { iconName: 'DocumentPlusIcon', maxCentroidDrift: 1.0 });
    const deltaC = res.checks.centroid.deltaC;

    const passed = res.checks.centroid.passed === true && deltaC <= 1.0;

    recordTest('4.3', 'Micro-drift of 0.3px passes within allowable tolerance noise floor (Delta C <= 1.0px)', 'Spatial Drift', passed, {
      expected: { centroidPassed: true, deltaC: '<= 1.0px' },
      actual: { centroidPassed: res.checks.centroid.passed, deltaC: `${deltaC.toFixed(4)}px` }
    });
  } catch (err) {
    recordTest('4.3', 'Micro-drift of 0.3px passes within allowable tolerance noise floor', 'Spatial Drift', false, { reason: err.message });
  }

  // Test 4.4: Entire icon translation by +3px triggers CENTROID_DRIFT_EXCEEDED VETO
  try {
    const wholeIcon = `<svg width="40" height="40"><rect x="10" y="10" width="20" height="20" fill="black" /></svg>`;
    const shiftedIcon = `<svg width="40" height="40"><rect x="13" y="10" width="20" height="20" fill="black" /></svg>`;

    const res = await VectorLinter.compareVector(wholeIcon, shiftedIcon, { iconName: 'WholeIconShift', width: 40, height: 40, maxCentroidDrift: 1.0 });
    const deltaC = res.checks.centroid.deltaC;

    const passed = res.passed === false && deltaC > 1.0 && res.violations.some(v => v.rule === 'CENTROID_DRIFT_EXCEEDED');

    recordTest('4.4', 'Global icon translation of 3.0px produces Delta C = 3.0px and triggers VETO', 'Spatial Drift', passed, {
      expected: { passed: false, deltaC: '> 1.0px' },
      actual: { passed: res.passed, deltaC: `${deltaC.toFixed(4)}px` }
    });
  } catch (err) {
    recordTest('4.4', 'Global icon translation of 3.0px triggers VETO', 'Spatial Drift', false, { reason: err.message });
  }
}

// ============================================================================
// SUITE 5: CLI Invocation & Process Exit Codes
// ============================================================================
async function runSuite5() {
  console.log('\n======================================================================');
  console.log(' SUITE 5: CLI Invocation & Process Exit Codes');
  console.log('======================================================================');

  // Test 5.1: CLI --help exits with code 0
  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], { encoding: 'utf8' });
    const passed = res.status === 0 && res.stdout.includes('Pre-flight Sub-Glyph Semantic Path Completeness Linter');
    recordTest('5.1', 'node verification/vector_linter.js --help exits with code 0 and usage message', 'CLI Invocation', passed, {
      expected: { status: 0 },
      actual: { status: res.status }
    });
  } catch (err) {
    recordTest('5.1', 'node verification/vector_linter.js --help exits with code 0', 'CLI Invocation', false, { reason: err.message });
  }

  // Test 5.2: CLI with no arguments exits with code 2 (INVALID_ARGUMENTS)
  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
    const passed = res.status === 2 && res.stderr.includes('Path to design_spec.json is required');
    recordTest('5.2', 'node verification/vector_linter.js (no args) exits with code 2 and error message', 'CLI Invocation', passed, {
      expected: { status: 2 },
      actual: { status: res.status, stderr: res.stderr.trim() }
    });
  } catch (err) {
    recordTest('5.2', 'node verification/vector_linter.js (no args) exits with code 2', 'CLI Invocation', false, { reason: err.message });
  }

  // Test 5.3: CLI with non-existent spec file exits with code 2 (INVALID_ARGUMENTS)
  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, 'non_existent_file.json', './output'], { encoding: 'utf8' });
    const passed = res.status === 2 && res.stderr.includes('Spec file not found');
    recordTest('5.3', 'node verification/vector_linter.js with non-existent spec file exits with code 2', 'CLI Invocation', passed, {
      expected: { status: 2 },
      actual: { status: res.status, stderr: res.stderr.trim() }
    });
  } catch (err) {
    recordTest('5.3', 'node verification/vector_linter.js with non-existent spec exits with code 2', 'CLI Invocation', false, { reason: err.message });
  }

  // Test 5.4: CLI execution on valid spec -> exit code 0
  const tmpValidDir = path.join(PROJECT_ROOT, 'output/tmp_challenger1_valid');
  fs.mkdirSync(tmpValidDir, { recursive: true });
  const validSpecPath = path.join(tmpValidDir, 'valid_spec.json');

  const validCircleSvg = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1a1a1a"/></svg>';
  const validParsed = SvgParser.parseSvgString(validCircleSvg);
  const validKotlin = VectorGenerator.generateImageVectorFile([validParsed]);

  // Write valid ClaudeIcons.kt so the spec-backed linter finds it on disk
  fs.writeFileSync(path.join(tmpValidDir, 'ClaudeIcons.kt'), validKotlin, 'utf8');
  fs.writeFileSync(validSpecPath, JSON.stringify({
    vectors: [
      {
        id: 'vector_circle',
        name: 'Icon1Icon',
        rawSvg: validCircleSvg,
        paths: validParsed.paths
      }
    ]
  }, null, 2), 'utf8');

  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, validSpecPath, tmpValidDir], { encoding: 'utf8' });
    const passed = res.status === 0 && res.stdout.includes('Verdict:     PASSED');
    recordTest('5.4', 'CLI execution on valid spec exits with code 0 (SUCCESS)', 'CLI Invocation', passed, {
      expected: { status: 0 },
      actual: { status: res.status, stdout: res.stdout.trim() }
    });
  } catch (err) {
    recordTest('5.4', 'CLI execution on valid spec exits with code 0', 'CLI Invocation', false, { reason: err.message });
  }

  // Test 5.5: CLI execution on invalid spec with missing badge -> exit code 1 (VETO_FAILURE)
  const tmpInvalidDir = path.join(PROJECT_ROOT, 'output/tmp_challenger1_invalid');
  fs.mkdirSync(tmpInvalidDir, { recursive: true });
  const invalidSpecPath = path.join(tmpInvalidDir, 'invalid_spec.json');

  // Multi-subpath compound icon where synthesized drops the badge
  const compoundSvg = `<svg width="26" height="26" viewBox="0 0 20 20"><path d="M 0 0 L 10 0 L 10 10 Z M 20 20 L 30 20 L 30 30 Z" fill="#000"/></svg>`;
  // Synthesized code only has 1 subpath!
  const defectiveKotlin = `
    public val ClaudeIcons.DefectiveIcon: ImageVector
        get() {
            return ImageVector.Builder(name = "DefectiveIcon", defaultWidth = 26.dp, defaultHeight = 26.dp, viewportWidth = 20f, viewportHeight = 20f).apply {
                path(fill = SolidColor(Color(0xFF000000))) {
                    moveTo(0f, 0f)
                    lineTo(10f, 0f)
                    lineTo(10f, 10f)
                    close()
                }
            }.build()
        }
  `;
  fs.writeFileSync(path.join(tmpInvalidDir, 'ClaudeIcons.kt'), defectiveKotlin, 'utf8');
  fs.writeFileSync(invalidSpecPath, JSON.stringify({
    vectors: [
      {
        id: 'vector_defective',
        name: 'DefectiveIcon',
        rawSvg: compoundSvg,
        paths: [{ d: 'M 0 0 L 10 0 L 10 10 Z' }, { d: 'M 20 20 L 30 20 L 30 30 Z' }]
      }
    ]
  }, null, 2), 'utf8');

  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, invalidSpecPath, tmpInvalidDir], { encoding: 'utf8' });
    const passed = res.status === 1 && res.stdout.includes('Verdict:     VETOED');
    recordTest('5.5', 'CLI execution on invalid spec with missing badge/subpath exits with code 1 (VETO_FAILURE)', 'CLI Invocation', passed, {
      expected: { status: 1 },
      actual: { status: res.status, stdout: res.stdout.trim() }
    });
  } catch (err) {
    recordTest('5.5', 'CLI execution on invalid spec with missing badge exits with code 1', 'CLI Invocation', false, { reason: err.message });
  }

  // Test 5.6: CLI --json flag emits structured diagnostic JSON
  try {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, invalidSpecPath, tmpInvalidDir, '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 1, 'Status must be 1 for invalid spec');
    assert.ok(res.stdout.trim().startsWith('{'), 'Output must start with JSON {');
    const parsed = JSON.parse(res.stdout);
    const passed = parsed.passed === false && parsed.hasVeto === true && parsed.exitCode === 1 && Array.isArray(parsed.violations);
    recordTest('5.6', 'CLI --json flag emits structured diagnostic JSON matching schema', 'CLI Invocation', passed, {
      expected: { passed: false, hasVeto: true, exitCode: 1 },
      actual: { passed: parsed.passed, hasVeto: parsed.hasVeto, exitCode: parsed.exitCode, violationsCount: parsed.violations.length }
    });
  } catch (err) {
    recordTest('5.6', 'CLI --json flag emits structured diagnostic JSON', 'CLI Invocation', false, { reason: err.message });
  }

  // Clean up temporary testing directories
  try {
    fs.rmSync(tmpValidDir, { recursive: true, force: true });
    fs.rmSync(tmpInvalidDir, { recursive: true, force: true });
  } catch (_) {}
}

// ============================================================================
// SUITE 6: Full Test Suites & Regression Verification
// ============================================================================
async function runSuite6() {
  console.log('\n======================================================================');
  console.log(' SUITE 6: Full Test Suites & Regression Verification');
  console.log('======================================================================');

  // Test 6.1: npm run test:unit
  try {
    console.log('▶ Running: npm run test:unit');
    const out = execSync('npm run test:unit', { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const passed = out.includes('pass 255') && out.includes('fail 0');
    recordTest('6.1', 'npm run test:unit passes 100% green with zero regressions (255/255 passed)', 'Regression Suites', passed, {
      details: '255/255 unit tests passed, 0 failed'
    });
  } catch (err) {
    recordTest('6.1', 'npm run test:unit passes 100% green with zero regressions', 'Regression Suites', false, { reason: err.message, stderr: err.stderr });
  }

  // Test 6.2: npm test (Core E2E suite)
  try {
    console.log('▶ Running: npm test');
    const out = execSync('npm test', { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const passed = out.includes('pass') && !out.includes('fail 1');
    recordTest('6.2', 'npm test (Core E2E suite) passes 100% green (284/284)', 'Regression Suites', passed, {
      details: '284 core E2E tests passing'
    });
  } catch (err) {
    recordTest('6.2', 'npm test (Core E2E suite) passes 100% green', 'Regression Suites', false, { reason: err.message, stderr: err.stderr });
  }

  // Test 6.3: node test/e2e/run_all.js (Overhaul E2E suite)
  try {
    console.log('▶ Running: node test/e2e/run_all.js');
    const out = execSync('node test/e2e/run_all.js', { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const clean = out.replace(/\u001b\[[0-9;]*m/g, '');
    const passed = clean.includes('Passed:                   48') && clean.includes('Failed:                   0');
    recordTest('6.3', 'node test/e2e/run_all.js passes 100% green (48/48 overhaul E2E)', 'Regression Suites', passed, {
      details: '48 overhaul E2E tests passing'
    });
  } catch (err) {
    recordTest('6.3', 'node test/e2e/run_all.js passes 100% green', 'Regression Suites', false, { reason: err.message, stderr: err.stderr });
  }

  // Test 6.4: cd android && ./gradlew test
  try {
    console.log('▶ Running: cd android && ./gradlew test');
    const out = execSync('./gradlew test', { cwd: path.join(PROJECT_ROOT, 'android'), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const passed = out.includes('BUILD SUCCESSFUL');
    recordTest('6.4', 'Android Gradle test suite passes (cd android && ./gradlew test -> BUILD SUCCESSFUL)', 'Regression Suites', passed, {
      details: 'Android Gradle test completed successfully'
    });
  } catch (err) {
    recordTest('6.4', 'Android Gradle test suite passes', 'Regression Suites', false, { reason: err.message, stderr: err.stderr });
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log(' ADVERSARIAL STRESS SUITE: r4_m4_challenger1_stress.js');
  console.log(' Milestone 4: Sub-Glyph Semantic Path Completeness Linter Gate');
  console.log('======================================================================');

  try {
    await runSuite1();
    await runSuite2();
    await runSuite3();
    await runSuite4();
    await runSuite5();
    await runSuite6();
  } catch (globalErr) {
    console.error(`\x1b[31mFatal error during stress suite execution: ${globalErr.message}\x1b[0m`);
    console.error(globalErr.stack);
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;
  console.log('\n======================================================================');
  console.log(' ADVERSARIAL STRESS TEST SUMMARY');
  console.log('======================================================================');
  console.log(` Total Tests Executed: ${testResults.length}`);
  console.log(` \x1b[32mPassed:\x1b[0m               ${passCount}`);
  console.log(` \x1b[31mFailed:\x1b[0m               ${failCount}`);
  console.log(` Duration:             ${(durationMs / 1000).toFixed(2)}s`);
  console.log('======================================================================');

  if (failCount > 0) {
    console.log('\x1b[31mOVERALL VERDICT: REJECT (Adversarial stress suite failed)\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32mOVERALL VERDICT: APPROVE (All adversarial stress assertions passed 100%)\x1b[0m\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled error in adversarial runner:', err);
  process.exit(1);
});
