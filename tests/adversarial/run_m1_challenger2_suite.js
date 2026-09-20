#!/usr/bin/env node

/**
 * ============================================================================
 * Adversarial Test Suite for M1 Verification Engine:
 * Background Palette Clustering, Low-Contrast Borders, and Element IoU / Drift
 *
 * Executed by: m1_challenger_2 (Milestone M1)
 * Targets:
 *   - verification/run_diff.js (detectBackgroundPalette, computeInkMetrics)
 *   - verification/zonal_diff.js (parseDesignSpecElements, computeElementDriftAndIoU)
 *   - verification/index.js (concludePipeline anti-deception gates)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PNG } = require('pngjs');

const {
  detectBackgroundPalette,
  computeInkMetrics,
  computeSobelEdges,
  evaluateContourAlignment
} = require('../../verification/run_diff');

const {
  parseDesignSpecElements,
  computeElementDriftAndIoU,
  computeInkCentroid
} = require('../../verification/zonal_diff');

const { VerificationPipeline } = require('../../verification/index');

const results = [];

function recordTest(id, name, category, passed, details) {
  results.push({ id, name, category, passed, details });
  const badge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${badge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[31mReason: ${details.reason}\x1b[0m`);
    if (details.expected !== undefined && details.actual !== undefined) {
      console.log(`       Expected: ${JSON.stringify(details.expected)}`);
      console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
    }
  } else if (details && details.note) {
    console.log(`       \x1b[36mNote: ${details.note}\x1b[0m`);
  }
}

/**
 * Creates an in-memory PNG canvas pre-filled with a base color.
 */
function createCanvas(width, height, r = 255, g = 255, b = 255, a = 255) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return png;
}

/**
 * Fills a solid rectangle on a PNG canvas.
 */
function fillRect(png, x0, y0, w, h, r, g, b, a = 255) {
  const xEnd = Math.min(png.width, x0 + w);
  const yEnd = Math.min(png.height, y0 + h);
  for (let y = Math.max(0, y0); y < yEnd; y++) {
    for (let x = Math.max(0, x0); x < xEnd; x++) {
      const idx = (y * png.width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

/**
 * Draws a 1-pixel hollow rectangle border on a PNG canvas.
 */
function strokeRect(png, x0, y0, w, h, r, g, b, a = 255) {
  const x1 = Math.min(png.width - 1, x0 + w - 1);
  const y1 = Math.min(png.height - 1, y0 + h - 1);

  // Top & bottom horizontal edges
  for (let x = Math.max(0, x0); x <= x1; x++) {
    if (y0 >= 0 && y0 < png.height) {
      const idx = (y0 * png.width + x) * 4;
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
    }
    if (y1 >= 0 && y1 < png.height) {
      const idx = (y1 * png.width + x) * 4;
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
    }
  }

  // Left & right vertical edges
  for (let y = Math.max(0, y0); y <= y1; y++) {
    if (x0 >= 0 && x0 < png.width) {
      const idx = (y * png.width + x0) * 4;
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
    }
    if (x1 >= 0 && x1 < png.width) {
      const idx = (y * png.width + x1) * 4;
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
    }
  }
}

async function runAdversarialSuite() {
  console.log('='.repeat(80));
  console.log('EMPIRICAL ADVERSARIAL CHALLENGE SUITE: VERIFICATION ENGINE');
  console.log('Targeting: Palette Clustering, Hairline Borders, Element IoU & Drift Vectors');
  console.log('='.repeat(80) + '\n');

  // ==========================================================================
  // SUITE 1: BACKGROUND PALETTE CLUSTERING & SUBTRACTION
  // ==========================================================================
  console.log('\x1b[1m--- SUITE 1: Background Palette Clustering & Subtraction ---\x1b[0m');

  // Test 1.1: Sol:OS Warm Sand (#E7E4DE) with Realistic Black Text Ink (< 5%)
  try {
    const W = 400, H = 400;
    // Base warm sand #E7E4DE: (231, 228, 222) -> covers 97.5%
    const refPng = createCanvas(W, H, 231, 228, 222, 255);
    // Draw 5 lines of black text #000000 (total 5 * 200 * 4 = 4000 px = 2.5% of canvas)
    for (let i = 0; i < 5; i++) {
      fillRect(refPng, 50, 40 + i * 40, 200, 4, 0, 0, 0, 255);
    }
    const palette = detectBackgroundPalette(refPng, W, H);

    const isSandDetected = palette.length >= 1 &&
      Math.abs(palette[0].r - 231) <= 2 &&
      Math.abs(palette[0].g - 228) <= 2 &&
      Math.abs(palette[0].b - 222) <= 2;

    const noBlackInPalette = palette.every(c => (c.r + c.g + c.b) > 200);

    const metrics = computeInkMetrics(refPng, refPng, W, H);

    const expectedTextPixels = 5 * (200 * 4); // 4,000 px
    const inkCountAccurate = Math.abs(metrics.inkRefPixels - expectedTextPixels) < 10;
    const inkIouExact = metrics.inkIou === 100.0;

    const passed = isSandDetected && noBlackInPalette && inkCountAccurate && inkIouExact;
    recordTest(
      'ADV-BG-01',
      'Sol:OS warm sand (#E7E4DE) clustering with black text ink (<5% density)',
      'background_clustering',
      passed,
      {
        palette: palette.map(p => ({ r: p.r, g: p.g, b: p.b, pct: p.pct.toFixed(1) })),
        inkPixels: metrics.inkRefPixels,
        expectedInk: expectedTextPixels,
        inkIou: metrics.inkIou,
        reason: !isSandDetected ? 'Sand color not detected in palette' :
                !noBlackInPalette ? 'Black text leaked into background palette' :
                !inkCountAccurate ? `Ink count mismatch: got ${metrics.inkRefPixels}, expected ${expectedTextPixels}` :
                'Ink IoU is not 100%'
      }
    );
  } catch (err) {
    recordTest('ADV-BG-01', 'Sol:OS warm sand (#E7E4DE) clustering', 'background_clustering', false, { reason: err.message });
  }

  // Test 1.2: Low-Contrast Hairline Borders (--os-100 #DCD5C9) on Sol:OS Sand
  try {
    const W = 300, H = 300;
    // Sand ground #E7E4DE: (231, 228, 222)
    const refPng = createCanvas(W, H, 231, 228, 222, 255);
    // Draw 1px hairline border card: (50, 50, 100, 80) in --os-100 #DCD5C9: (220, 213, 201)
    strokeRect(refPng, 50, 50, 100, 80, 220, 213, 201, 255);

    const palette = detectBackgroundPalette(refPng, W, H);
    const metrics = computeInkMetrics(refPng, refPng, W, H);

    // Hairline perimeter = 2 * 100 + 2 * (80 - 2) = 356 pixels
    const expectedPerimeter = 2 * 100 + 2 * (80 - 2);

    // Verify hairlines are NOT in background palette
    const hairlineNotInPalette = !palette.some(p => Math.abs(p.r - 220) <= 5 && Math.abs(p.g - 213) <= 5 && Math.abs(p.b - 201) <= 5);

    // Verify hairlines are classified as ink pixels
    const hairlinesRecognizedAsInk = metrics.inkRefPixels === expectedPerimeter;
    const passed = hairlineNotInPalette && hairlinesRecognizedAsInk && metrics.inkIou === 100.0;

    recordTest(
      'ADV-BG-02',
      'Low-contrast hairline border (--os-100 #DCD5C9) on warm sand is recognized as ink and NOT eaten by background clustering',
      'hairline_borders',
      passed,
      {
        hairlineInkPixels: metrics.inkRefPixels,
        expectedPixels: expectedPerimeter,
        inkIou: metrics.inkIou,
        paletteCount: palette.length,
        note: `Euclidean distance is sqrt((231-220)^2 + (228-213)^2 + (222-201)^2) = 28.05 > tauBg 20.0`,
        reason: !hairlineNotInPalette ? 'Hairline border mistakenly clustered into background' :
                !hairlinesRecognizedAsInk ? `Hairline pixel count mismatch: got ${metrics.inkRefPixels}, expected ${expectedPerimeter}` :
                'Ink IoU mismatch'
      }
    );
  } catch (err) {
    recordTest('ADV-BG-02', 'Low-contrast hairline border', 'hairline_borders', false, { reason: err.message });
  }

  // Test 1.3: Composited Semi-Transparent Hairline rgba(0,0,0,0.08) on Sand
  try {
    const W = 300, H = 300;
    const refPng = createCanvas(W, H, 231, 228, 222, 255);
    // Composited 8% black on sand (231, 228, 222) -> (212, 210, 204)
    strokeRect(refPng, 60, 60, 80, 60, 212, 210, 204, 255);

    const metrics = computeInkMetrics(refPng, refPng, W, H);
    const expectedPerimeter = 2 * 80 + 2 * (60 - 2); // 276 px

    const passed = metrics.inkRefPixels === expectedPerimeter && metrics.inkIou === 100.0;
    recordTest(
      'ADV-BG-03',
      'Composited semi-transparent hairline (8% black on sand) is preserved as ink',
      'hairline_borders',
      passed,
      {
        inkPixels: metrics.inkRefPixels,
        expectedPixels: expectedPerimeter,
        note: 'Distance = sqrt(19^2 + 18^2 + 18^2) = 31.76 > tauBg 20.0',
        reason: `Got ${metrics.inkRefPixels} ink pixels, expected ${expectedPerimeter}`
      }
    );
  } catch (err) {
    recordTest('ADV-BG-03', 'Composited semi-transparent hairline', 'hairline_borders', false, { reason: err.message });
  }

  // Test 1.4: Multi-Tonal Canvas with 3 Distinct Card Colors
  try {
    const W = 600, H = 600;
    // Ground: Sol:OS warm sand #E7E4DE (231, 228, 222) -> covers ~60%
    const refPng = createCanvas(W, H, 231, 228, 222, 255);

    // Card 1: Pure white #FFFFFF (255, 255, 255) -> 200x150 = 30,000 px (~8.3%)
    fillRect(refPng, 50, 50, 200, 150, 255, 255, 255, 255);

    // Card 2: Surface Gray --os-50 #F7F7F7 (247, 247, 247) -> 200x150 = 30,000 px (~8.3%)
    fillRect(refPng, 300, 50, 200, 150, 247, 247, 247, 255);

    // Card 3: Neutral Panel --os-150 #ECEAE5 (236, 234, 229) -> 200x150 = 30,000 px (~8.3%)
    fillRect(refPng, 150, 250, 200, 150, 236, 234, 229, 255);

    // Add black text inside each card and on ground (each 40x10 px = 400 px, total 1600 px)
    fillRect(refPng, 70, 70, 40, 10, 26, 26, 26, 255);   // on Card 1
    fillRect(refPng, 320, 70, 40, 10, 26, 26, 26, 255);  // on Card 2
    fillRect(refPng, 170, 270, 40, 10, 26, 26, 26, 255); // on Card 3
    fillRect(refPng, 50, 450, 40, 10, 26, 26, 26, 255);  // on Sand ground

    const palette = detectBackgroundPalette(refPng, W, H);

    // Verify all 4 background tones are captured in palette
    const hasSand = palette.some(p => Math.abs(p.r - 231) <= 4 && Math.abs(p.g - 228) <= 4 && Math.abs(p.b - 222) <= 4);
    const hasWhite = palette.some(p => p.r >= 253 && p.g >= 253 && p.b >= 253);
    const hasOs50 = palette.some(p => Math.abs(p.r - 247) <= 4 && Math.abs(p.g - 247) <= 4 && Math.abs(p.b - 247) <= 4);
    const hasOs150 = palette.some(p => Math.abs(p.r - 236) <= 4 && Math.abs(p.g - 234) <= 4 && Math.abs(p.b - 229) <= 4);

    const metrics = computeInkMetrics(refPng, refPng, W, H);
    const expectedInk = 4 * 400; // 1600 px

    const allTonesDetected = hasSand && hasWhite && hasOs50 && hasOs150;
    const inkIsolated = Math.abs(metrics.inkRefPixels - expectedInk) <= 4;
    const passed = allTonesDetected && inkIsolated && metrics.inkIou === 100.0;

    recordTest(
      'ADV-BG-04',
      'Multi-tonal canvas (Sand ground + 3 card surfaces) clustering & ink isolation',
      'multi_tonal',
      passed,
      {
        paletteClustersFound: palette.length,
        hasSand, hasWhite, hasOs50, hasOs150,
        inkPixels: metrics.inkRefPixels,
        expectedInk,
        reason: !allTonesDetected ? 'Not all 4 background tones were detected in the palette' :
                !inkIsolated ? `Background leaked into ink: got ${metrics.inkRefPixels}, expected ${expectedInk}` :
                'Ink IoU mismatch'
      }
    );
  } catch (err) {
    recordTest('ADV-BG-04', 'Multi-tonal canvas clustering', 'multi_tonal', false, { reason: err.message });
  }

  // Test 1.5: Inverted Dark Mode (#1A1A1A ground with #FFFFFF text)
  try {
    const W = 400, H = 400;
    // Dark mode ground --os-900 #1A1A1A: (26, 26, 26) -> ~85%
    const refPng = createCanvas(W, H, 26, 26, 26, 255);
    // Dark mode elevated card --os-800 #343434: (52, 52, 52) -> 150x150 = 22,500 px (~14%)
    fillRect(refPng, 50, 50, 150, 150, 52, 52, 52, 255);
    // White text --os-0 #FFFFFF on elevated card: 80x15 = 1200 px
    fillRect(refPng, 70, 70, 80, 15, 255, 255, 255, 255);
    // Light gray text --os-200 #CCCCCC on dark ground: 80x15 = 1200 px
    fillRect(refPng, 70, 250, 80, 15, 204, 204, 204, 255);

    const palette = detectBackgroundPalette(refPng, W, H);
    const hasDarkGround = palette.some(p => Math.abs(p.r - 26) <= 4 && Math.abs(p.g - 26) <= 4 && Math.abs(p.b - 26) <= 4);
    const hasDarkCard = palette.some(p => Math.abs(p.r - 52) <= 4 && Math.abs(p.g - 52) <= 4 && Math.abs(p.b - 52) <= 4);
    const lightTextNotInPalette = palette.every(p => p.r < 100);

    const metrics = computeInkMetrics(refPng, refPng, W, H);
    const expectedInk = 1200 + 1200; // 2400 px
    const inkIsolated = Math.abs(metrics.inkRefPixels - expectedInk) <= 10;

    const passed = hasDarkGround && hasDarkCard && lightTextNotInPalette && inkIsolated && metrics.inkIou === 100.0;

    recordTest(
      'ADV-BG-05',
      'Inverted dark mode (#1A1A1A ground + #343434 card with #FFFFFF text)',
      'dark_mode',
      passed,
      {
        palette: palette.map(p => ({ r: p.r, g: p.g, b: p.b, pct: p.pct.toFixed(1) })),
        hasDarkGround,
        hasDarkCard,
        inkPixels: metrics.inkRefPixels,
        expectedInk,
        inkIou: metrics.inkIou,
        reason: !hasDarkGround ? 'Dark ground #1A1A1A not found in palette' :
                !hasDarkCard ? 'Dark card #343434 not found in palette' :
                !lightTextNotInPalette ? 'Light text leaked into background palette' :
                !inkIsolated ? `Ink isolation failed: got ${metrics.inkRefPixels}, expected ${expectedInk}` :
                'Ink IoU mismatch'
      }
    );
  } catch (err) {
    recordTest('ADV-BG-05', 'Inverted dark mode', 'dark_mode', false, { reason: err.message });
  }

  // Test 1.6: Boundary Condition: Solid Monochrome Ink Exceeding minPct (5.0%)
  try {
    const W = 400, H = 400;
    const total = W * H;
    // 6.0% pure black block on sand
    const blackPixels = Math.round(total * 0.06);
    const testPng = createCanvas(W, H, 231, 228, 222, 255);
    for (let i = total - blackPixels; i < total; i++) {
      const idx = i * 4;
      testPng.data[idx] = 0; testPng.data[idx + 1] = 0; testPng.data[idx + 2] = 0;
    }

    const palette = detectBackgroundPalette(testPng, W, H);
    const blackCluster = palette.find(p => p.r === 0 && p.g === 0 && p.b === 0);
    const metrics = computeInkMetrics(testPng, testPng, W, H);

    // This test documents and verifies the boundary condition behavior:
    // When solid monochrome ink exceeds minPct (5.0%), it is identified as a background cluster
    const clusterIdentified = Boolean(blackCluster);
    const inkEliminated = metrics.inkRefPixels === 0 && metrics.inkIou === 0.0;

    recordTest(
      'ADV-BG-06',
      'Boundary Condition: Solid monochrome ink >= 5.0% area in single bin triggers palette clustering',
      'boundary_conditions',
      clusterIdentified && inkEliminated,
      {
        clusterIdentified,
        blackClusterPct: blackCluster ? blackCluster.pct.toFixed(2) : 'none',
        inkPixelsAfterSubtraction: metrics.inkRefPixels,
        note: 'Threshold boundary verified: Single solid color >= 5% is classified as surface by design'
      }
    );
  } catch (err) {
    recordTest('ADV-BG-06', 'Solid monochrome ink >= 5% boundary', 'boundary_conditions', false, { reason: err.message });
  }

  // ==========================================================================
  // SUITE 2: ELEMENT BOUNDING BOX PARSER & HIERARCHY STRESS TESTS
  // ==========================================================================
  console.log('\n\x1b[1m--- SUITE 2: Element Bounding Box Parser & Hierarchy Stress Tests ---\x1b[0m');

  // Test 2.1: Deeply Nested Component Hierarchy
  try {
    const mockSpec = {
      viewports: { desktop: { scale: 2.0 } },
      hierarchy: {
        tag: 'div',
        componentType: 'Surface',
        bounds: { x: 0, y: 0, width: 1440, height: 860 }, // Canvas container -> must be filtered
        children: [
          {
            tag: 'nav',
            componentType: 'TopAppBar',
            bounds: { x: 0, y: 0, width: 1440, height: 64 },
            children: [
              {
                tag: 'button',
                componentType: 'IconButton',
                id: 'nav-back-icon',
                bounds: { x: 16, y: 16, width: 32, height: 32 }
              },
              {
                tag: 'h1',
                componentType: 'Text',
                id: 'app-title',
                text: { content: 'Daylight Settings', fontSize: 24 },
                bounds: { x: 64, y: 18, width: 200, height: 28 }
              }
            ]
          },
          {
            tag: 'div',
            componentType: 'Card',
            id: 'settings-card',
            bounds: { x: 40, y: 100, width: 500, height: 80 }, // Pill/Card -> should be included
            children: [
              {
                tag: 'button',
                componentType: 'Button',
                id: 'btn-reset',
                text: { content: 'Reset Device' },
                bounds: { x: 380, y: 120, width: 120, height: 40 }
              }
            ]
          }
        ]
      }
    };

    const elements = parseDesignSpecElements(mockSpec, { scale: 2.0, width: 2880, height: 1720 });

    // Root Surface (1440x860 scaled to 2880x1720) must be filtered out
    const hasRoot = elements.some(e => e.bounds.width >= 2880 * 0.8 && e.bounds.height >= 1720 * 0.8);

    const hasNavIcon = elements.some(e => e.id === 'nav-back-icon');
    const hasTitle = elements.some(e => e.id === 'app-title' && e.category === 'heading');
    const hasCard = elements.some(e => e.id === 'settings-card');
    const hasButton = elements.some(e => e.id === 'btn-reset' && e.category === 'button');

    // Verify 2.0x coordinate scaling
    const titleElem = elements.find(e => e.id === 'app-title');
    const scalingExact = titleElem &&
      titleElem.bounds.x === 128 &&
      titleElem.bounds.y === 36 &&
      titleElem.bounds.width === 400 &&
      titleElem.bounds.height === 56;

    const passed = !hasRoot && hasNavIcon && hasTitle && hasCard && hasButton && scalingExact;

    recordTest(
      'ADV-ELEM-01',
      'Deeply nested hierarchy parsing with container filtering and 2x coordinate scaling',
      'element_hierarchy',
      passed,
      {
        elementsParsed: elements.length,
        hasRoot, hasNavIcon, hasTitle, hasCard, hasButton, scalingExact,
        reason: hasRoot ? 'Root canvas container was not filtered' :
                !hasNavIcon ? 'Child icon missing' :
                !hasTitle ? 'Heading element missing' :
                !hasCard ? 'Card container missing' :
                !hasButton ? 'Grandchild button missing' :
                'Coordinate scaling factor 2.0 mismatch'
      }
    );
  } catch (err) {
    recordTest('ADV-ELEM-01', 'Deeply nested hierarchy parsing', 'element_hierarchy', false, { reason: err.message });
  }

  // Test 2.2: Degenerate Elements (zero-width, zero-height, negative dimensions, null bounds)
  try {
    const mockSpec = {
      hierarchy: {
        tag: 'div',
        bounds: { x: 0, y: 0, width: 500, height: 500 },
        children: [
          { tag: 'button', id: 'zero-w', bounds: { x: 10, y: 10, width: 0, height: 20 } },
          { tag: 'button', id: 'zero-h', bounds: { x: 10, y: 10, width: 20, height: 0 } },
          { tag: 'button', id: 'neg-w', bounds: { x: 10, y: 10, width: -15, height: 20 } },
          { tag: 'button', id: 'neg-h', bounds: { x: 10, y: 10, width: 20, height: -15 } },
          { tag: 'button', id: 'null-bounds', bounds: null },
          { tag: 'button', id: 'valid-btn', bounds: { x: 10, y: 10, width: 30, height: 30 } }
        ]
      }
    };

    const elements = parseDesignSpecElements(mockSpec, { scale: 1.0, width: 500, height: 500 });
    const onlyValidIncluded = elements.length === 1 && elements[0].id === 'valid-btn';

    recordTest(
      'ADV-ELEM-02',
      'Degenerate elements (zero width/height, negative dimensions, null bounds) filtered gracefully',
      'element_bounds',
      onlyValidIncluded,
      {
        count: elements.length,
        ids: elements.map(e => e.id),
        reason: `Expected exactly 1 valid element, got ${elements.length}: ${JSON.stringify(elements.map(e => e.id))}`
      }
    );
  } catch (err) {
    recordTest('ADV-ELEM-02', 'Degenerate elements handling', 'element_bounds', false, { reason: err.message });
  }

  // Test 2.3: Elements Outside Viewport Bounds
  try {
    const mockSpec = {
      hierarchy: {
        tag: 'div',
        bounds: { x: 0, y: 0, width: 500, height: 500 },
        children: [
          // Far off-screen to the right/bottom
          { tag: 'button', id: 'offscreen-far', bounds: { x: 4000, y: 4000, width: 100, height: 100 } },
          // Completely offscreen to the top-left (negative x and y)
          { tag: 'button', id: 'offscreen-top-left', bounds: { x: -500, y: -500, width: 50, height: 50 } },
          // Partially overlapping right boundary: x=480, w=40 (spans 480..520 on 500w canvas)
          { tag: 'button', id: 'partial-right', bounds: { x: 480, y: 100, width: 40, height: 30 } },
          // Partially overlapping left boundary: x=-10, w=40 (spans -10..30 on 500w canvas)
          { tag: 'button', id: 'partial-left', bounds: { x: -10, y: 100, width: 40, height: 30 } },
          // Fully valid inside
          { tag: 'button', id: 'valid-inside', bounds: { x: 100, y: 100, width: 50, height: 30 } }
        ]
      }
    };

    const elements = parseDesignSpecElements(mockSpec, { scale: 1.0, width: 500, height: 500 });
    const hasFar = elements.some(e => e.id === 'offscreen-far');
    const hasInside = elements.some(e => e.id === 'valid-inside');
    const hasPartialRight = elements.some(e => e.id === 'partial-right');

    // Check how computeElementDriftAndIoU handles partially or out-of-bounds elements
    const testPng = createCanvas(500, 500, 255, 255, 255, 255);
    // Draw ink for partial-right (x=480..500)
    fillRect(testPng, 480, 100, 20, 30, 0, 0, 0, 255);
    // Draw ink for valid inside
    fillRect(testPng, 100, 100, 50, 30, 0, 0, 0, 255);

    let noBufferOverflowCrash = false;
    let driftRes = null;
    try {
      driftRes = computeElementDriftAndIoU(testPng, testPng, elements, 500, 500, {
        bgPaletteRef: [{ r: 255, g: 255, b: 255, count: 250000, pct: 100 }],
        bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: 250000, pct: 100 }]
      });
      noBufferOverflowCrash = true;
    } catch (e) {
      noBufferOverflowCrash = false;
    }

    const passed = !hasFar && hasInside && noBufferOverflowCrash;
    recordTest(
      'ADV-ELEM-03',
      'Elements outside viewport bounds clamped safely with zero buffer overflow or indexing crashes',
      'element_bounds',
      passed,
      {
        hasFar,
        hasInside,
        hasPartialRight,
        noBufferOverflowCrash,
        evaluatedElements: driftRes ? driftRes.evaluatedCount : 0,
        reason: hasFar ? 'Far offscreen element (4000, 4000) was not filtered' :
                !hasInside ? 'Valid inside element was incorrectly dropped' :
                'computeElementDriftAndIoU crashed on edge/out-of-bounds coordinates'
      }
    );
  } catch (err) {
    recordTest('ADV-ELEM-03', 'Elements outside viewport bounds', 'element_bounds', false, { reason: err.message });
  }

  // Test 2.4: Duplicate Element IDs
  try {
    const mockSpec = {
      hierarchy: {
        tag: 'div',
        bounds: { x: 0, y: 0, width: 400, height: 400 },
        children: [
          { tag: 'button', id: 'shared-id', bounds: { x: 20, y: 20, width: 40, height: 40 } },
          { tag: 'button', id: 'shared-id', bounds: { x: 100, y: 20, width: 40, height: 40 } },
          { tag: 'button', id: 'shared-id', bounds: { x: 180, y: 20, width: 40, height: 40 } }
        ]
      }
    };

    const elements = parseDesignSpecElements(mockSpec, { scale: 1.0, width: 400, height: 400 });
    const allPreserved = elements.length === 3;

    const testPng = createCanvas(400, 400, 255, 255, 255, 255);
    fillRect(testPng, 20, 20, 40, 40, 0, 0, 0, 255);
    fillRect(testPng, 100, 20, 40, 40, 0, 0, 0, 255);
    fillRect(testPng, 180, 20, 40, 40, 0, 0, 0, 255);

    const driftRes = computeElementDriftAndIoU(testPng, testPng, elements, 400, 400, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: 160000, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: 160000, pct: 100 }]
    });

    const evaluatedAll = driftRes.driftVectors.length === 3;
    const passed = allPreserved && evaluatedAll;

    recordTest(
      'ADV-ELEM-04',
      'Duplicate element IDs evaluated without collision or overwriting in drift vector list',
      'duplicate_ids',
      passed,
      {
        elementsParsed: elements.length,
        driftVectorsCount: driftRes.driftVectors.length,
        reason: !allPreserved ? `Expected 3 elements parsed, got ${elements.length}` :
                `Expected 3 drift vectors evaluated, got ${driftRes.driftVectors.length}`
      }
    );
  } catch (err) {
    recordTest('ADV-ELEM-04', 'Duplicate element IDs', 'duplicate_ids', false, { reason: err.message });
  }

  // Test 2.5: Missing Elements (Reference has ink, rendered has NO ink) & Anti-Deception Veto
  try {
    const W = 200, H = 200;
    const refPng = createCanvas(W, H, 255, 255, 255, 255);
    const rendPng = createCanvas(W, H, 255, 255, 255, 255);

    // Reference has ink button: 40x40 at (50, 50)
    fillRect(refPng, 50, 50, 40, 40, 0, 0, 0, 255);
    // Rendered has NO ink (completely missing)

    const elements = [
      {
        id: 'missing-btn',
        name: 'missing button',
        category: 'button',
        priority: 'primary',
        bounds: { x: 50, y: 50, width: 40, height: 40 }
      }
    ];

    const driftRes = computeElementDriftAndIoU(refPng, rendPng, elements, W, H, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
    });

    const vec = driftRes.driftVectors[0];
    const isMissing = vec && vec.status === 'MISSING';
    const zeroIou = vec && vec.iou === 0.0;
    const extremeShift = vec && vec.shiftMagnitude === 999.0;
    const maxShiftTriggered = driftRes.maxSpatialShiftPx === 999.0;

    // Verify anti-deception gate triggers failure in concludePipeline
    const pipeline = new VerificationPipeline();
    const mockPipelineResult = {
      stages: {
        compile: { success: true },
        previewTest: { success: true },
        audit: { passed: true },
        diff: {
          success: true,
          metrics: { pixelSimilarityPercentage: 98.0, inkIou: 88.0, edgeContourScore: 95.0 },
          zonal: {
            elementIouScore: driftRes.elementIouScore,
            maxSpatialShiftPx: driftRes.maxSpatialShiftPx,
            worstDriftElement: driftRes.worstDriftElement
          }
        }
      }
    };
    const finalReport = pipeline.concludePipeline(mockPipelineResult);
    const gateVetoed = finalReport.verdict === 'FAILED' && finalReport.gateAction === 'TRIGGER_REFINEMENT';

    const passed = isMissing && zeroIou && extremeShift && maxShiftTriggered && gateVetoed;

    recordTest(
      'ADV-ELEM-05',
      'Missing element flags MISSING status, 0% IoU, 999px shift, and triggers refinement veto',
      'missing_elements',
      passed,
      {
        status: vec?.status,
        iou: vec?.iou,
        shiftMag: vec?.shiftMagnitude,
        maxSpatialShift: driftRes.maxSpatialShiftPx,
        gateAction: finalReport.gateAction,
        reason: !isMissing ? `Status expected MISSING, got ${vec?.status}` :
                !zeroIou ? `IoU expected 0.0, got ${vec?.iou}` :
                !extremeShift ? `Shift magnitude expected 999.0, got ${vec?.shiftMagnitude}` :
                !gateVetoed ? 'Pipeline failed to trigger refinement veto' : 'Unknown error'
      }
    );
  } catch (err) {
    recordTest('ADV-ELEM-05', 'Missing elements', 'missing_elements', false, { reason: err.message });
  }

  // ==========================================================================
  // SUITE 3: MATHEMATICAL EXACTNESS OF DRIFT VECTORS & CENTROID TRACKING
  // ==========================================================================
  console.log('\n\x1b[1m--- SUITE 3: Mathematical Exactness of Drift Vectors & Tight BBox IoU ---\x1b[0m');

  // Test 3.1: Controlled Multi-Axis Drift Vector Precision
  try {
    const W = 300, H = 300;
    const scale = 2.0;

    // Test drift vectors: [dx, dy, expectedStatus, expectedPassed]
    // Note: status is ALIGNED only if shiftMag <= 3.0 AND iou >= 90.0.
    // If shiftMag <= 3.0 but iou < 90.0, status is LOW_IOU.
    // If shiftMag > 3.0, status is DRIFTED.
    const testCases = [
      { name: 'Zero drift (0, 0)', dx: 0, dy: 0, expectedStatus: 'ALIGNED', expectedPassed: true },
      { name: '1px horizontal shift (+1, 0) [iou=93.5% >= 90%]', dx: 1, dy: 0, expectedStatus: 'ALIGNED', expectedPassed: true },
      { name: '2px vertical shift (0, -2) [iou=87.5% < 90% -> LOW_IOU]', dx: 0, dy: -2, expectedStatus: 'LOW_IOU', expectedPassed: false },
      { name: 'Diagonal 2px shift (+2, +2) [mag=2.83px <= 3.0px, iou=77.2% < 90% -> LOW_IOU]', dx: 2, dy: 2, expectedStatus: 'LOW_IOU', expectedPassed: false },
      { name: '3-4-5 Triangle (+3, +4) [mag=5.0px > 3.0px -> DRIFTED]', dx: 3, dy: 4, expectedStatus: 'DRIFTED', expectedPassed: false },
      { name: 'Negative diagonal (-5, +12) [mag=13.0px -> DRIFTED]', dx: -5, dy: 12, expectedStatus: 'DRIFTED', expectedPassed: false }
    ];

    let allCasesPassed = true;
    const caseDetails = [];

    for (const tc of testCases) {
      const refPng = createCanvas(W, H, 255, 255, 255, 255);
      const rendPng = createCanvas(W, H, 255, 255, 255, 255);

      // Icon: 30x30 square at (100, 100)
      fillRect(refPng, 100, 100, 30, 30, 0, 0, 0, 255);
      // Shifted by tc.dx, tc.dy
      fillRect(rendPng, 100 + tc.dx, 100 + tc.dy, 30, 30, 0, 0, 0, 255);

      const elements = [
        {
          id: 'test-icon',
          name: 'test icon',
          category: 'icon',
          priority: 'primary',
          bounds: { x: 100, y: 100, width: 30, height: 30 }
        }
      ];

      const res = computeElementDriftAndIoU(refPng, rendPng, elements, W, H, {
        scale,
        bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
        bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
      });

      const vec = res.driftVectors[0];
      const expectedMag = parseFloat(Math.hypot(tc.dx, tc.dy).toFixed(2));
      const expectedDxDp = parseFloat((tc.dx / scale).toFixed(2));
      const expectedDyDp = parseFloat((tc.dy / scale).toFixed(2));

      const dxExact = Math.abs(vec.dx - tc.dx) < 0.05;
      const dyExact = Math.abs(vec.dy - tc.dy) < 0.05;
      const magExact = Math.abs(vec.shiftMagnitude - expectedMag) < 0.05;
      const dpExact = Math.abs(vec.dxDp - expectedDxDp) < 0.05 && Math.abs(vec.dyDp - expectedDyDp) < 0.05;
      const statusCorrect = vec.status === tc.expectedStatus;
      const passedCorrect = vec.passed === tc.expectedPassed;

      const casePass = dxExact && dyExact && magExact && dpExact && statusCorrect && passedCorrect;
      if (!casePass) allCasesPassed = false;

      caseDetails.push({
        case: tc.name,
        target: { dx: tc.dx, dy: tc.dy, mag: expectedMag, status: tc.expectedStatus },
        measured: { dx: vec.dx, dy: vec.dy, mag: vec.shiftMagnitude, status: vec.status, iou: vec.iou, passed: vec.passed },
        passed: casePass
      });
    }

    recordTest(
      'ADV-MATH-01',
      'Drift vector components (dx, dy), magnitude, and Compose dp conversions are mathematically exact',
      'drift_vector_precision',
      allCasesPassed,
      {
        testCases: caseDetails,
        reason: !allCasesPassed ? 'One or more drift vectors had mathematical discrepancies' : null
      }
    );
  } catch (err) {
    recordTest('ADV-MATH-01', 'Drift vector precision', 'drift_vector_precision', false, { reason: err.message });
  }

  // Test 3.2: Theoretical Tight Bounding Box IoU Accuracy
  try {
    const W = 200, H = 200;
    const refPng = createCanvas(W, H, 255, 255, 255, 255);
    const rendPng = createCanvas(W, H, 255, 255, 255, 255);

    // Reference box: 40x40 at (50, 50) -> area 1600
    fillRect(refPng, 50, 50, 40, 40, 0, 0, 0, 255);
    // Rendered box: shifted by +10px in X -> 40x40 at (60, 50) -> area 1600
    // Intersection: width 30, height 40 -> area 1200
    // Union: 1600 + 1600 - 1200 = 2000
    // Expected IoU = 1200 / 2000 = 60.00%
    fillRect(rendPng, 60, 50, 40, 40, 0, 0, 0, 255);

    const elements = [
      {
        id: 'box-element',
        name: 'box',
        category: 'button',
        priority: 'primary',
        bounds: { x: 50, y: 50, width: 40, height: 40 }
      }
    ];

    const res = computeElementDriftAndIoU(refPng, rendPng, elements, W, H, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
    });

    const vec = res.driftVectors[0];
    const expectedIoU = 60.00;
    const iouExact = Math.abs(vec.iou - expectedIoU) < 0.01;

    // Check tight bbox reporting
    const refBboxExact = vec.refTightBbox[0] === 50 && vec.refTightBbox[1] === 50 && vec.refTightBbox[2] === 40 && vec.refTightBbox[3] === 40;
    const rendBboxExact = vec.renderedTightBbox[0] === 60 && vec.renderedTightBbox[1] === 50 && vec.renderedTightBbox[2] === 40 && vec.renderedTightBbox[3] === 40;

    const passed = iouExact && refBboxExact && rendBboxExact;

    recordTest(
      'ADV-MATH-02',
      'Tight bounding box geometric IoU matches theoretical calculation exactly (60.00%)',
      'iou_accuracy',
      passed,
      {
        iou: vec.iou,
        expectedIoU,
        refTightBbox: vec.refTightBbox,
        renderedTightBbox: vec.renderedTightBbox,
        reason: !iouExact ? `IoU mismatch: got ${vec.iou}%, expected ${expectedIoU}%` :
                !refBboxExact ? 'Reference tight bounding box mismatch' :
                'Rendered tight bounding box mismatch'
      }
    );
  } catch (err) {
    recordTest('ADV-MATH-02', 'Tight bounding box IoU accuracy', 'iou_accuracy', false, { reason: err.message });
  }

  // Test 3.3: Search Window Clamping & Transition under Large Drift
  try {
    const W = 300, H = 300;
    const refPng = createCanvas(W, H, 255, 255, 255, 255);
    const rendPng = createCanvas(W, H, 255, 255, 255, 255);

    // Box: 30x30 at (100, 100). Adaptive delta = min(60, max(24, round(0.2*30))) = 24px.
    // Search window width = 30 + 2*24 = 78px (from x=76 to x=154).
    fillRect(refPng, 100, 100, 30, 30, 0, 0, 0, 255);

    // Shift rendered by +80px (x=180). Rendered ink falls completely outside search window!
    fillRect(rendPng, 180, 100, 30, 30, 0, 0, 0, 255);

    const elements = [
      {
        id: 'large-drift-box',
        name: 'large drift box',
        category: 'button',
        priority: 'primary',
        bounds: { x: 100, y: 100, width: 30, height: 30 }
      }
    ];

    const res = computeElementDriftAndIoU(refPng, rendPng, elements, W, H, {
      bgPaletteRef: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }],
      bgPaletteRendered: [{ r: 255, g: 255, b: 255, count: W * H, pct: 100 }]
    });

    const vec = res.driftVectors[0];
    // Since rendered ink is completely outside localized window, rendInk.count is 0 -> flagged as MISSING with shift 999.0
    const cleanlyHandled = vec && vec.status === 'MISSING' && vec.shiftMagnitude === 999.0;

    recordTest(
      'ADV-MATH-03',
      'Large spatial drift outside adaptive search window cleanly transitions to MISSING with 999px penalty',
      'search_window_clamping',
      cleanlyHandled,
      {
        status: vec?.status,
        shiftMag: vec?.shiftMagnitude,
        note: 'Window size was 78px; shift was 80px -> cleanly penalized without crash or false alignment',
        reason: `Expected status MISSING with shiftMag 999.0, got status=${vec?.status}, shiftMag=${vec?.shiftMagnitude}`
      }
    );
  } catch (err) {
    recordTest('ADV-MATH-03', 'Search window clamping', 'search_window_clamping', false, { reason: err.message });
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('ADVERSARIAL SUITE SUMMARY');
  console.log('='.repeat(80));

  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Adversarial Tests: ${total}`);
  console.log(`Passed: \x1b[32m${passedCount}\x1b[0m`);
  console.log(`Failed: \x1b[31m${failedCount}\x1b[0m`);

  if (failedCount > 0) {
    console.log('\nFailed Tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(` - [${r.id}] ${r.name}: ${r.details.reason}`);
    }
  }

  return { total, passedCount, failedCount, results };
}

if (require.main === module) {
  runAdversarialSuite()
    .then(summary => {
      process.exit(summary.failedCount > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal suite execution error:', err);
      process.exit(2);
    });
}

module.exports = { runAdversarialSuite };
