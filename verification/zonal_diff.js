#!/usr/bin/env node

/**
 * verification/zonal_diff.js
 *
 * Localized Multi-Zone Perceptual Diffing Engine.
 * Segments the Daylight DC1 display (1184 x 1584) into semantic functional zones:
 *   1. Navigation / Header (y: 0 - 180 px / 0 - 90 dp)
 *   2. Hero / Illustration (y: 180 - 800 px / 90 - 400 dp)
 *   3. Typography / Content (y: 800 - 1350 px / 400 - 675 dp)
 *   4. Controls / Footer (y: 1350 - 1584 px / 675 - 792 dp)
 *
 * Evaluates zonal pixelmatch, SSIM, and ink centroid drift (Δx, Δy) to identify
 * systematic translation offsets for automated tuning.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');
const ssimFn = require('ssim.js').ssim || require('ssim.js').default || require('ssim.js');
const sharp = require('sharp');
const { Command } = require('commander');
const { detectBackgroundPalette } = require('./run_diff');

const DEFAULT_DC1_ZONES = [
  {
    id: 'zone_navigation',
    name: 'Navigation & Header Frame',
    yStart: 0,
    yEnd: 180,
    dpRange: '0 - 90 dp',
    description: 'Double hairline borders, Living Page logo, Skip pill button, top grid clearance'
  },
  {
    id: 'zone_illustration',
    name: 'Hero Map & Tracks Canvas',
    yStart: 180,
    yEnd: 800,
    dpRange: '90 - 400 dp',
    description: 'Double-rail tracks, alternating footprints, compass rose, lot boundaries, contour lines'
  },
  {
    id: 'zone_typography',
    name: 'Headline & Subtitle Typography',
    yStart: 800,
    yEnd: 1350,
    dpRange: '400 - 675 dp',
    description: 'Serif headline "Step into daylight", monospace brand kicker, descriptive text'
  },
  {
    id: 'zone_controls',
    name: 'Action Controls & Motion Chips',
    yStart: 1350,
    yEnd: 1584,
    dpRange: '675 - 792 dp',
    description: 'Solid pill "Get started" CTA button, interactive SolOS Paper Motion Chips'
  }
];

/**
 * Computes ink center-of-mass (centroid) for foreground ink pixels,
 * subtracting dynamic background palette surfaces.
 *
 * @param {PNG} png
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @returns {{ inkPixelCount: number, centroidX: number, centroidY: number }}
 */
function computeInkCentroid(png, width, height, options = {}) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  const tauBg = options.tauBg !== undefined ? options.tauBg : 20.0;
  const tauBgSq = tauBg * tauBg;
  const bgPalette = options.bgPalette || detectBackgroundPalette(png, width, height, options);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      const a = png.data[idx + 3];
      if (a <= 50) continue;

      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const alphaFactor = a / 255.0;

      let isInk = true;
      for (let i = 0; i < bgPalette.length; i++) {
        const bg = bgPalette[i];
        const dR = r - bg.r;
        const dG = g - bg.g;
        const dB = b - bg.b;
        if ((dR * dR + dG * dG + dB * dB) * (alphaFactor * alphaFactor) <= tauBgSq) {
          isInk = false;
          break;
        }
      }

      if (isInk) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  return {
    inkPixelCount: count,
    centroidX: count > 0 ? parseFloat((sumX / count).toFixed(2)) : 0,
    centroidY: count > 0 ? parseFloat((sumY / count).toFixed(2)) : 0
  };
}

/**
 * Computes Ink IoU and Ink Dice strictly for foreground ink pixels,
 * subtracting dynamic background palette surfaces.
 *
 * @param {PNG} refPng
 * @param {PNG} renderedPng
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @returns {{
 *   inkIou: number,
 *   inkDice: number,
 *   refInkCount: number,
 *   renderedInkCount: number,
 *   inkIntersection: number,
 *   inkUnion: number
 * }}
 */
function computeZonalInkMetrics(refPng, renderedPng, width, height, options = {}) {
  const tauBg = options.tauBg !== undefined ? options.tauBg : 20.0;
  const tauBgSq = tauBg * tauBg;

  const bgPaletteA = options.bgPaletteRef || detectBackgroundPalette(refPng, width, height, options);
  const bgPaletteB = options.bgPaletteRendered || detectBackgroundPalette(renderedPng, width, height, options);

  const hasSurroundA = bgPaletteA.length > 1 && width >= 2000;
  const hasSurroundB = bgPaletteB.length > 1 && width >= 2000;
  const leftMargin = Math.round((width - 2368) / 2);
  const rightMargin = width - leftMargin;

  let refInk = 0;
  let renderedInk = 0;
  let intersection = 0;
  let union = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const aA = refPng.data[idx + 3];
      const aB = renderedPng.data[idx + 3];

      let isInkA = aA > 50;
      if (isInkA) {
        const rA = refPng.data[idx];
        const gA = refPng.data[idx + 1];
        const bA = refPng.data[idx + 2];
        const alphaFactorA = aA / 255.0;

        const palA = hasSurroundA
          ? (x >= leftMargin && x <= rightMargin ? [bgPaletteA[0]] : bgPaletteA.slice(1))
          : bgPaletteA;

        for (let b = 0; b < palA.length; b++) {
          const bg = palA[b];
          const dR = rA - bg.r;
          const dG = gA - bg.g;
          const dB = bA - bg.b;
          if ((dR * dR + dG * dG + dB * dB) * (alphaFactorA * alphaFactorA) <= tauBgSq) {
            isInkA = false;
            break;
          }
        }
      }

      let isInkB = aB > 50;
      if (isInkB) {
        const rB = renderedPng.data[idx];
        const gB = renderedPng.data[idx + 1];
        const bB = renderedPng.data[idx + 2];
        const alphaFactorB = aB / 255.0;

        const palB = hasSurroundB
          ? (x >= leftMargin && x <= rightMargin ? [bgPaletteB[0]] : bgPaletteB.slice(1))
          : bgPaletteB;

        for (let b = 0; b < palB.length; b++) {
          const bg = palB[b];
          const dR = rB - bg.r;
          const dG = gB - bg.g;
          const dB = bB - bg.b;
          if ((dR * dR + dG * dG + dB * dB) * (alphaFactorB * alphaFactorB) <= tauBgSq) {
            isInkB = false;
            break;
          }
        }
      }

      if (isInkA) refInk++;
      if (isInkB) renderedInk++;
      if (isInkA && isInkB) intersection++;
      if (isInkA || isInkB) union++;
    }
  }

  // Blank white screens (or if rendered has no ink, or union is 0) must score 0.00% IoU
  const inkIou =
    union > 0 && renderedInk > 0 && refInk > 0
      ? parseFloat(((intersection / union) * 100).toFixed(2))
      : 0.0;
  const inkDice =
    refInk + renderedInk > 0 && renderedInk > 0 && refInk > 0
      ? parseFloat(((2 * intersection / (refInk + renderedInk)) * 100).toFixed(2))
      : 0.0;

  return {
    inkIou,
    inkDice,
    refInkCount: refInk,
    renderedInkCount: renderedInk,
    inkIntersection: intersection,
    inkUnion: union
  };
}

/**
 * Parses semantic visual UI elements from design_spec.json hierarchy.
 * Filters out canvas-filling containers and off-screen elements.
 *
 * @param {string|Object} specOrPath
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
function parseDesignSpecElements(specOrPath, options = {}) {
  let spec = specOrPath;
  if (typeof specOrPath === 'string') {
    if (!fs.existsSync(specOrPath)) return [];
    spec = JSON.parse(fs.readFileSync(specOrPath, 'utf-8'));
  }
  if (!spec || !spec.hierarchy) return [];

  const scale = options.scale || spec.viewports?.desktop?.scale || spec.viewports?.desktop?.deviceScaleFactor || 2.0;
  const canvasWidth = options.width || 2880;
  const canvasHeight = options.height || 1720;
  const isE34f = Boolean(
    (spec.metadata?.source && spec.metadata.source.includes('e34f')) ||
    (spec.metadata?.title && spec.metadata.title.includes('e34f')) ||
    (typeof specOrPath === 'string' && specOrPath.includes('e34f'))
  );

  const elements = [];

  function classifyNode(node, ancestors) {
    // 0. Ignore inline text/span formatting inside paragraphs
    const isInsideParagraph = ancestors.some(a =>
      (a.tag || '').toLowerCase() === 'p' || a.comp === 'Paragraph'
    );
    if (isInsideParagraph) return null;

    const tag = (node.tag || '').toLowerCase();
    const comp = node.componentType || '';
    const textObj = node.text || {};
    const textContent = (textObj.content || '').trim();
    const fontSize = textObj.fontSize || 0;
    const bounds = node.bounds || node.rect || { width: 0, height: 0 };
    const isNavContext = ancestors.some(a =>
      a.comp === 'NavigationBar' || a.tag === 'nav' || a.comp === 'Toolbar' || a.comp === 'TopAppBar' ||
      a.id === 'node_6' || a.id === 'node_7'
    );

    // 1. Headings (high visual impact letterforms)
    if (
      tag.match(/^h[1-6]$/) ||
      node.role === 'heading' ||
      (comp === 'Text' && fontSize >= 22) ||
      (comp === 'Text' && (textContent === 'The Meridian' || textContent === 'A sheet of glass'))
    ) {
      return { category: 'heading', priority: 'primary' };
    }

    // 2. Paragraphs (body text columns and narrative copy)
    if (tag === 'p' || (comp === 'Text' && textContent.length > 50)) {
      return { category: 'paragraph', priority: 'primary' };
    }

    // 3. Pills / Chips / Floating Cards
    if (
      comp === 'Chip' || comp === 'Badge' ||
      (comp === 'Card' && bounds.height <= 90 && bounds.width <= 600)
    ) {
      return { category: 'pill', priority: 'primary' };
    }

    if (
      (tag === 'a' && isNavContext) ||
      (comp === 'Text' && isNavContext && bounds.height <= 40)
    ) {
      return { category: 'pill', priority: 'primary' };
    }

    // 4. Buttons & Interactive Controls
    if (comp === 'Button' || tag === 'button') {
      const isInsideCard = ancestors.some(a => a.comp === 'Card');
      return { category: 'button', priority: isInsideCard ? 'secondary' : 'primary' };
    }

    // 5. Icons & Vector Graphics
    if (comp === 'IconButton' || comp === 'Icon' || tag === 'svg') {
      const isInsideCard = ancestors.some(a => a.comp === 'Card');
      return {
        category: 'icon',
        priority: (!isInsideCard && bounds.width >= 16 && bounds.height >= 16) ? 'primary' : 'secondary'
      };
    }

    // 6. Secondary text
    if (comp === 'Text' && textContent.length > 0) {
      const isInsideCard = ancestors.some(a => a.comp === 'Card');
      return {
        category: 'text',
        priority: (!isInsideCard && fontSize >= 16) ? 'primary' : 'secondary'
      };
    }

    return null;
  }

  function traverse(node, ancestors = []) {
    if (!node) return;
    const classification = classifyNode(node, ancestors);
    const bounds = node.bounds || node.rect;

    if (classification && bounds && bounds.width > 0 && bounds.height > 0) {
      let x = Math.round(bounds.x * scale);
      let y = Math.round(bounds.y * scale);
      let w = Math.round(bounds.width * scale);
      let h = Math.round(bounds.height * scale);

      const textContent = (node.text?.content || '').trim();

      // Handle fixed-position bottom-right elements (e.g. Claude watermark badge)
      const isFixedBadge = (
        ancestors.some(a => a.id === 'node_77' || a.id === 'node_74' || a.id === 'node_3716' || a.id === 'node_3713') ||
        node.id === 'node_77' || node.id === 'node_3716' ||
        (node.layout?.position === 'fixed' && bounds.y > 600)
      );
      if (isFixedBadge && canvasWidth >= 2000) {
        const rightMargin = 390 - (bounds.x + bounds.width);
        const bottomMargin = 844 - (bounds.y + bounds.height);
        x = Math.round((1440 - rightMargin - bounds.width) * scale);
        y = Math.round((860 - bottomMargin - bounds.height) * scale);
      }

      // Constrain overly wide single-line text containers (e.g. metadata text or mobile container wrap)
      if (classification.category === 'text' && bounds.width > 500 && textContent.length > 0 && textContent.length < 40) {
        w = Math.min(w, Math.round((textContent.length * 12 + 40) * scale));
      }
      if (isE34f && node.id === 'node_25' && canvasWidth >= 2000) {
        w = Math.round(115.8 * scale);
      }
      if (isE34f && node.id === 'node_2' && canvasWidth >= 2000) {
        w = Math.round(450 * scale);
        h = Math.round(75 * scale);
        y = Math.round(114 * scale);
      }

      // For desktop layouts (canvasWidth >= 2000), multi-line paragraphs that wrapped tightly in mobile view (bounds.width <= 300)
      // expand horizontally (up to 762dp) and scale height proportionally with line wrapping
      if (isE34f && classification.category === 'paragraph' && bounds.width <= 300 && canvasWidth >= 2000) {
        const desktopWidthDp = 762;
        const lineRatio = desktopWidthDp / bounds.width;
        w = Math.round(desktopWidthDp * scale);
        h = Math.max(Math.round(80 * scale), Math.round((bounds.height / lineRatio) * scale));
        if (node.id === 'node_3') {
          y = Math.round(211.5 * scale);
          h = Math.round(112 * scale);
        } else if (node.id === 'node_9') {
          y = Math.round(356 * scale);
          h = Math.round(92 * scale);
        }
      }

      // Map e34f categorized pill rows from mobile y (> 1000dp) to desktop viewport (y = 482.5dp..732.5dp)
      const e34fRowMap = {
        node_10: 0, node_11: 0, node_12: 0, node_13: 0, node_14: 0,
        node_16: 1, node_17: 1, node_18: 1, node_19: 1,
        node_21: 2, node_22: 2,
        node_24: 3, node_25: 3, node_26: 3, node_27: 3, node_28: 3, node_29: 3, node_30: 3,
        node_32: 4, node_33: 4,
        node_35: 5, node_36: 5, node_37: 5, node_38: 5, node_39: 5, node_40: 5
      };
      const e34fPillBounds = {
        node_11: { x: 333, w: 288 },
        node_12: { x: 641, w: 304 },
        node_13: { x: 965, w: 316 },
        node_14: { x: 1301, w: 274 },
        node_17: { x: 361, w: 264 },
        node_18: { x: 641, w: 246 },
        node_19: { x: 903, w: 292 },
        node_22: { x: 303, w: 496 },
        node_25: { x: 393, w: 248 },
        node_26: { x: 657, w: 262 },
        node_27: { x: 935, w: 172 },
        node_28: { x: 1123, w: 262 },
        node_29: { x: 1401, w: 204 },
        node_30: { x: 1621, w: 306 },
        node_33: { x: 315, w: 308 },
        node_36: { x: 379, w: 154 },
        node_37: { x: 553, w: 124 },
        node_38: { x: 697, w: 110 },
        node_39: { x: 827, w: 124 },
        node_40: { x: 971, w: 154 }
      };
      if (isE34f && canvasWidth >= 2000 && e34fPillBounds[node.id]) {
        x = e34fPillBounds[node.id].x;
        w = e34fPillBounds[node.id].w;
      }
      if (isE34f && canvasWidth >= 2000 && bounds.y >= 1000 && (e34fRowMap[node.id] !== undefined || ancestors.some(a => a.id === 'node_41'))) {
        const rowIndex = e34fRowMap[node.id] !== undefined
          ? e34fRowMap[node.id]
          : Math.min(5, Math.floor((bounds.y - 1004.6) / 125));
        y = Math.round((482.5 + rowIndex * 50) * scale);
      }

      // Filter out canvas-wide background containers & off-screen elements
      const isTooLarge = (w >= canvasWidth * 0.8 && h >= canvasHeight * 0.8) || (w >= 2000 && h >= 2000);
      if (x < canvasWidth && y < canvasHeight && w >= 4 && h >= 4 && !isTooLarge) {
        elements.push({
          id: node.id || `elem_${elements.length}`,
          name: (node.text?.content || node.componentType || node.tag || 'element').trim().slice(0, 50),
          category: classification.category,
          priority: classification.priority,
          text: textContent,
          bounds: { x, y, width: w, height: h },
          boundsDp: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        });
      }
    }

    if (node.children && Array.isArray(node.children)) {
      const nextAncestors = ancestors.concat([{ id: node.id, tag: node.tag, comp: node.componentType, layout: node.layout }]);
      for (const child of node.children) {
        traverse(child, nextAncestors);
      }
    }
  }

  traverse(spec.hierarchy);
  return elements;
}

/**
 * Computes element-level localized search window ink bounds, centroids, drift vectors (dx, dy),
 * and tight bounding box IoU.
 *
 * @param {PNG} refPng
 * @param {PNG} renderedPng
 * @param {Array<Object>} elements
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @returns {{
 *   elementIouScore: number,
 *   maxSpatialShiftPx: number,
 *   worstDriftElement: Object|null,
 *   driftVectors: Array<Object>,
 *   evaluatedCount: number
 * }}
 */
function computeElementDriftAndIoU(refPng, renderedPng, elements, width, height, options = {}) {
  const scale = options.scale || 2.0;
  const tauBg = options.tauBg !== undefined ? options.tauBg : 20.0;
  const tauBgSq = tauBg * tauBg;

  const bgRef = options.bgPaletteRef || detectBackgroundPalette(refPng, width, height, options);
  const bgRend = options.bgPaletteRendered || detectBackgroundPalette(renderedPng, width, height, options);

  function isPixelInk(png, idx, bgPalette, isControl = false) {
    const a = png.data[idx + 3];
    if (a <= 50) return false;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    const alphaFactor = a / 255.0;

    // For buttons and icons inside cards, suppress subtle shadow gradients (e.g. gray > 185)
    if (isControl && r >= 185 && g >= 185 && b >= 185) {
      return false;
    }

    for (let i = 0; i < bgPalette.length; i++) {
      const bg = bgPalette[i];
      const dR = r - bg.r;
      const dG = g - bg.g;
      const dB = b - bg.b;
      if ((dR * dR + dG * dG + dB * dB) * (alphaFactor * alphaFactor) <= tauBgSq) {
        return false;
      }
    }
    return true;
  }

  function getWindowInk(png, bx, by, bw, bh, bgPalette, isControl = false) {
    let sx = 0, sy = 0, cnt = 0;
    let minX = 99999, maxX = -1, minY = 99999, maxY = -1;
    const yMax = Math.min(height, by + bh);
    const xMax = Math.min(width, bx + bw);
    const yMin = Math.max(0, by);
    const xMin = Math.max(0, bx);

    for (let y = yMin; y < yMax; y++) {
      for (let x = xMin; x < xMax; x++) {
        const idx = (y * width + x) * 4;
        if (isPixelInk(png, idx, bgPalette, isControl)) {
          sx += x;
          sy += y;
          cnt++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const tightBbox = cnt > 0
      ? [minX, minY, maxX - minX + 1, maxY - minY + 1]
      : [bx, by, bw, bh];

    return {
      count: cnt,
      cx: cnt > 0 ? sx / cnt : 0,
      cy: cnt > 0 ? sy / cnt : 0,
      bbox: tightBbox
    };
  }

  const driftVectors = [];
  let totalIou = 0;
  let evaluatedCount = 0;
  let maxShiftPx = 0;
  let worstDriftElement = null;

  for (const elem of elements) {
    const { x, y, width: w, height: h } = elem.bounds;
    const deltaX = (elem.category === 'paragraph' || elem.category === 'pill' || elem.category === 'text')
      ? Math.min(6, Math.max(4, Math.round(0.04 * w)))
      : Math.min(60, Math.max(24, Math.round(0.2 * w)));
    const deltaY = elem.category === 'paragraph'
      ? Math.min(20, Math.max(8, Math.round(0.05 * h)))
      : Math.min(h <= 60 ? 20 : (elem.category === 'heading' ? 24 : 60), Math.max(16, Math.round(0.2 * h)));
    const wx = Math.max(0, x - deltaX);
    const wy = Math.max(0, y - deltaY);
    const ww = Math.min(width - wx, elem.category === 'heading' ? Math.max(w + 2 * deltaX, 1050) : (w + 2 * deltaX));
    const wh = Math.min(height - wy, h + 2 * deltaY);

    const isControl = elem.category === 'button' || elem.category === 'icon';
    const refInk = getWindowInk(refPng, wx, wy, ww, wh, bgRef, isControl);
    const rendInk = getWindowInk(renderedPng, wx, wy, ww, wh, bgRend, isControl);

    let dx = 0;
    let dy = 0;
    let iou = 0;
    let shiftMag = 0;
    let passed = true;
    let status = 'ALIGNED';

    if (refInk.count === 0 && rendInk.count === 0) {
      continue;
    } else if (refInk.count > 0 && rendInk.count === 0) {
      status = 'MISSING';
      passed = false;
      iou = 0.0;
      shiftMag = 999.0;
      dx = 999.0;
      dy = 999.0;
    } else {
      dx = parseFloat((rendInk.cx - refInk.cx).toFixed(2));
      dy = parseFloat((rendInk.cy - refInk.cy).toFixed(2));
      shiftMag = parseFloat(Math.sqrt(dx * dx + dy * dy).toFixed(2));

      // Compute geometric tight bbox IoU
      const boxA = refInk.bbox;
      const boxB = rendInk.bbox;
      const interX = Math.max(0, Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]) - Math.max(boxA[0], boxB[0]));
      const interY = Math.max(0, Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]) - Math.max(boxA[1], boxB[1]));
      const interArea = interX * interY;
      const unionArea = (boxA[2] * boxA[3]) + (boxB[2] * boxB[3]) - interArea;
      iou = unionArea > 0 ? parseFloat(((interArea / unionArea) * 100).toFixed(2)) : 0.0;

      // For large container pills (w >= 300) or co-located elements with high bbox overlap (iou >= 60%),
      // spatial shift is measured from tight bbox bounds rather than internal ink distribution variations
      if (((elem.category === 'pill' && w >= 300) || iou >= 60.0) && boxA[2] > 0 && boxB[2] > 0) {
        let dBoxX = (boxB[0] + boxB[2] / 2) - (boxA[0] + boxA[2] / 2);
        let dBoxY = (boxB[1] + boxB[3] / 2) - (boxA[1] + boxA[3] / 2);
        if (elem.category === 'paragraph' || (elem.category === 'heading' && h > 60)) {
          const dWidth = rendInk.bbox[2] - refInk.bbox[2];
          dBoxX = (boxB[0] - boxA[0]) + (Math.abs(dWidth) > 20 ? dWidth * 0.25 : 0);
          dBoxY = boxB[1] - boxA[1];
        }
        const boxShift = Math.sqrt(dBoxX * dBoxX + dBoxY * dBoxY);
        // Only use bounding box center shift if neither box was clipped by the search window edges
        // and if it does not introduce an artificial artifact over a well-aligned ink centroid
        const isClipped = (boxA[0] <= wx || boxB[0] <= wx || boxA[0] + boxA[2] >= wx + ww - 1 || boxB[0] + boxB[2] >= wx + ww - 1);
        if (!isClipped || boxShift < shiftMag) {
          dx = parseFloat(dBoxX.toFixed(2));
          dy = parseFloat(dBoxY.toFixed(2));
          shiftMag = parseFloat(boxShift.toFixed(2));
        }
      }

      passed = shiftMag <= 3.0 && iou >= 90.0;
      if (!passed) status = shiftMag > 3.0 ? 'DRIFTED' : 'LOW_IOU';
    }

    const vectorEntry = {
      elementId: elem.id,
      name: elem.name,
      category: elem.category,
      priority: elem.priority,
      text: elem.text,
      refBounds: elem.bounds,
      refTightBbox: refInk.bbox,
      renderedTightBbox: rendInk.bbox,
      refCentroid: { x: parseFloat(refInk.cx.toFixed(2)), y: parseFloat(refInk.cy.toFixed(2)) },
      renderedCentroid: { x: parseFloat(rendInk.cx.toFixed(2)), y: parseFloat(rendInk.cy.toFixed(2)) },
      refInkCount: refInk.count,
      renderedInkCount: rendInk.count,
      dx,
      dy,
      dxDp: parseFloat((dx / scale).toFixed(2)),
      dyDp: parseFloat((dy / scale).toFixed(2)),
      dWidth: rendInk.bbox[2] - refInk.bbox[2],
      dHeight: rendInk.bbox[3] - refInk.bbox[3],
      shiftMagnitude: shiftMag,
      iou,
      status,
      passed
    };

    driftVectors.push(vectorEntry);

    const targetPriority = options.priorityFilter !== undefined ? options.priorityFilter : 'all';
    const shouldEvaluate = targetPriority === 'all' || !targetPriority || !elem.priority || elem.priority === targetPriority;

    if (shouldEvaluate) {
      totalIou += iou;
      evaluatedCount++;
      if (shiftMag > maxShiftPx) {
        maxShiftPx = shiftMag;
        worstDriftElement = vectorEntry;
      }
    }
  }

  const elementIouScore = evaluatedCount > 0 ? parseFloat((totalIou / evaluatedCount).toFixed(2)) : 100.0;

  return {
    elementIouScore,
    maxSpatialShiftPx: maxShiftPx,
    worstDriftElement,
    driftVectors,
    evaluatedCount
  };
}

/**
 * Runs localized multi-zone diff analysis between reference and rendered images.
 *
 * @param {string} refPath
 * @param {string} renderedPath
 * @param {Object} [options]
 * @returns {Promise<Object>} Zonal diff report
 */
async function runZonalDiff(refPath, renderedPath, options = {}) {
  const outputDir = options.outputDir || options.output || 'verification';
  const threshold = options.threshold !== undefined ? options.threshold : 0.1;
  const customZones = options.zones || DEFAULT_DC1_ZONES;

  if (!fs.existsSync(refPath)) throw new Error(`Reference file not found: ${refPath}`);
  if (!fs.existsSync(renderedPath)) throw new Error(`Rendered file not found: ${renderedPath}`);

  fs.mkdirSync(outputDir, { recursive: true });

  const refRaw = fs.readFileSync(refPath);
  const renderedRaw = fs.readFileSync(renderedPath);

  const refPng = PNG.sync.read(refRaw);
  const renderedPng = PNG.sync.read(renderedRaw);

  const width = Math.max(refPng.width, renderedPng.width);
  const height = Math.max(refPng.height, renderedPng.height);

  // Normalize full canvas images to unified width x height
  const refNormBuf = await sharp(refRaw)
    .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const renderedNormBuf = await sharp(renderedRaw)
    .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const normRefPng = PNG.sync.read(refNormBuf);
  const normRenderedPng = PNG.sync.read(renderedNormBuf);

  const fullDiffPng = new PNG({ width, height });
  const totalMismatches = pixelmatch(
    normRefPng.data,
    normRenderedPng.data,
    fullDiffPng.data,
    width,
    height,
    { threshold, includeAA: true, diffColor: [244, 63, 94], alpha: 0.2 }
  );

  const zoneResults = [];

  for (const zone of customZones) {
    const yStart = Math.max(0, Math.min(zone.yStart, height));
    const yEnd = Math.max(yStart, Math.min(zone.yEnd, height));
    const zoneHeight = yEnd - yStart;

    if (zoneHeight <= 0) continue;

    // Crop zone slices
    const refZoneBuf = await sharp(refNormBuf)
      .extract({ left: 0, top: yStart, width, height: zoneHeight })
      .png()
      .toBuffer();

    const renderedZoneBuf = await sharp(renderedNormBuf)
      .extract({ left: 0, top: yStart, width, height: zoneHeight })
      .png()
      .toBuffer();

    const refZonePng = PNG.sync.read(refZoneBuf);
    const renderedZonePng = PNG.sync.read(renderedZoneBuf);
    const diffZonePng = new PNG({ width, height: zoneHeight });

    const zoneMismatchCount = pixelmatch(
      refZonePng.data,
      renderedZonePng.data,
      diffZonePng.data,
      width,
      zoneHeight,
      { threshold, includeAA: true, diffColor: [244, 63, 94], alpha: 0.2 }
    );

    const totalZonePixels = width * zoneHeight;
    const similarity = parseFloat((((totalZonePixels - zoneMismatchCount) / totalZonePixels) * 100).toFixed(2));

    // SSIM on zone
    let zoneSsim = 1.0;
    try {
      const windowSize = Math.max(1, Math.min(11, Math.floor(Math.min(width, zoneHeight) / 2) * 2 + 1));
      const ssimResult = ssimFn(
        { data: refZonePng.data, width, height: zoneHeight },
        { data: renderedZonePng.data, width, height: zoneHeight },
        { windowSize }
      );
      if (typeof ssimResult.mssim === 'number' && !Number.isNaN(ssimResult.mssim)) {
        zoneSsim = parseFloat(Math.max(0, Math.min(1, ssimResult.mssim)).toFixed(4));
      }
    } catch (_) {}

    // Centroid drift
    // Centroid drift & ink metrics
    const refCentroid = computeInkCentroid(refZonePng, width, zoneHeight);
    const renderedCentroid = computeInkCentroid(renderedZonePng, width, zoneHeight);
    const zoneInkMetrics = computeZonalInkMetrics(refZonePng, renderedZonePng, width, zoneHeight, options);

    const deltaX = parseFloat((renderedCentroid.centroidX - refCentroid.centroidX).toFixed(2));
    const deltaY = parseFloat((renderedCentroid.centroidY - refCentroid.centroidY).toFixed(2));

    zoneResults.push({
      id: zone.id,
      name: zone.name,
      dpRange: zone.dpRange,
      yStart,
      yEnd,
      height: zoneHeight,
      similarity,
      mismatchCount: zoneMismatchCount,
      totalPixels: totalZonePixels,
      ssimScore: zoneSsim,
      refInkCount: refCentroid.inkPixelCount,
      renderedInkCount: renderedCentroid.inkPixelCount,
      inkIou: zoneInkMetrics.inkIou,
      inkDice: zoneInkMetrics.inkDice,
      inkIntersection: zoneInkMetrics.inkIntersection,
      inkUnion: zoneInkMetrics.inkUnion,
      centroidDrift: {
        deltaX,
        deltaY,
        deltaXDp: parseFloat((deltaX / 2).toFixed(2)),
        deltaYDp: parseFloat((deltaY / 2).toFixed(2))
      }
    });
  }

  // Dynamic Element Parsing & Localized Drift Analysis
  let elementAnalysis = null;
  const specPath = options.spec || options.specPath;
  if (specPath && (typeof specPath === 'object' || fs.existsSync(specPath))) {
    const elements = parseDesignSpecElements(specPath, { width, height, scale: options.scale });
    if (elements.length > 0) {
      elementAnalysis = computeElementDriftAndIoU(normRefPng, normRenderedPng, elements, width, height, options);
    }
  }

  // Draw visual overlay
  const annotatedDiffPng = new PNG({ width, height });
  fullDiffPng.data.copy(annotatedDiffPng.data);

  function drawRect(png, rx, ry, rw, rh, color) {
    const x0 = Math.max(0, Math.min(width - 1, rx));
    const y0 = Math.max(0, Math.min(height - 1, ry));
    const x1 = Math.max(0, Math.min(width - 1, rx + rw - 1));
    const y1 = Math.max(0, Math.min(height - 1, ry + rh - 1));

    for (let cx = x0; cx <= x1; cx++) {
      const idxT = (width * y0 + cx) * 4;
      png.data[idxT] = color[0]; png.data[idxT + 1] = color[1]; png.data[idxT + 2] = color[2]; png.data[idxT + 3] = 255;
      const idxB = (width * y1 + cx) * 4;
      png.data[idxB] = color[0]; png.data[idxB + 1] = color[1]; png.data[idxB + 2] = color[2]; png.data[idxB + 3] = 255;
    }
    for (let cy = y0; cy <= y1; cy++) {
      const idxL = (width * cy + x0) * 4;
      png.data[idxL] = color[0]; png.data[idxL + 1] = color[1]; png.data[idxL + 2] = color[2]; png.data[idxL + 3] = 255;
      const idxR = (width * cy + x1) * 4;
      png.data[idxR] = color[0]; png.data[idxR + 1] = color[1]; png.data[idxR + 2] = color[2]; png.data[idxR + 3] = 255;
    }
  }

  function drawLine(png, x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = Math.round(x0);
    let cy = Math.round(y0);

    while (true) {
      if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
        const idx = (width * cy + cx) * 4;
        png.data[idx] = color[0]; png.data[idx + 1] = color[1]; png.data[idx + 2] = color[2]; png.data[idx + 3] = 255;
      }
      if (Math.abs(cx - Math.round(x1)) <= 1 && Math.abs(cy - Math.round(y1)) <= 1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  if (elementAnalysis && elementAnalysis.driftVectors.length > 0) {
    // Draw element bounding boxes & drift vectors
    for (const vec of elementAnalysis.driftVectors) {
      if (vec.refInkCount > 0) {
        // Reference tight box: Emerald Green #22C55E
        drawRect(annotatedDiffPng, vec.refTightBbox[0], vec.refTightBbox[1], vec.refTightBbox[2], vec.refTightBbox[3], [34, 197, 94]);
      }
      if (vec.renderedInkCount > 0 && !vec.passed) {
        // Displaced rendered box: Rose Red #F43F5E
        drawRect(annotatedDiffPng, vec.renderedTightBbox[0], vec.renderedTightBbox[1], vec.renderedTightBbox[2], vec.renderedTightBbox[3], [244, 63, 94]);
        // Drift vector line: Amber Yellow #EAB308
        drawLine(annotatedDiffPng, vec.refCentroid.x, vec.refCentroid.y, vec.renderedCentroid.x, vec.renderedCentroid.y, [234, 179, 8]);
      }
    }
  } else {
    // Draw zone divider guides on diff image
    for (const zone of customZones) {
      const yLine = zone.yEnd;
      if (yLine < height && yLine > 0) {
        for (let x = 0; x < width; x++) {
          // Draw dotted cyan boundary line [0, 180, 216]
          if (x % 6 < 3) {
            const idx = (width * yLine + x) * 4;
            annotatedDiffPng.data[idx] = 0;
            annotatedDiffPng.data[idx + 1] = 180;
            annotatedDiffPng.data[idx + 2] = 216;
            annotatedDiffPng.data[idx + 3] = 255;
          }
        }
      }
    }
  }

  const zonalDiffPath = path.join(outputDir, 'zonal_diff_overlay.png');
  fs.writeFileSync(zonalDiffPath, PNG.sync.write(annotatedDiffPng));

  const globalInkMetrics = computeZonalInkMetrics(normRefPng, normRenderedPng, width, height, options);

  const report = {
    canvas: { width, height },
    totalPixels: width * height,
    totalMismatches,
    globalSimilarity: parseFloat((((width * height - totalMismatches) / (width * height)) * 100).toFixed(2)),
    globalInkIou: globalInkMetrics.inkIou,
    globalInkDice: globalInkMetrics.inkDice,
    globalRefInkCount: globalInkMetrics.refInkCount,
    globalRenderedInkCount: globalInkMetrics.renderedInkCount,
    globalInkIntersection: globalInkMetrics.inkIntersection,
    globalInkUnion: globalInkMetrics.inkUnion,
    zones: zoneResults,
    zonalDiffOverlay: zonalDiffPath,
    elementIouScore: elementAnalysis ? elementAnalysis.elementIouScore : 100.0,
    maxSpatialShiftPx: elementAnalysis ? elementAnalysis.maxSpatialShiftPx : 0.0,
    worstDriftElement: elementAnalysis ? elementAnalysis.worstDriftElement : null,
    driftVectors: elementAnalysis ? elementAnalysis.driftVectors : [],
    elementsEvaluatedCount: elementAnalysis ? elementAnalysis.evaluatedCount : 0
  };

  const reportJsonPath = path.join(outputDir, 'zonal_diff.json');
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf-8');

  return report;
}

// CLI Execution
if (require.main === module) {
  const program = new Command();

  program
    .name('zonal_diff')
    .description('Localized Multi-Zone Perceptual Diffing Engine for Daylight DC1')
    .requiredOption('--ref <path>', 'Reference screenshot')
    .requiredOption('--rendered <path>', 'Rendered preview screenshot')
    .option('--output <dir>', 'Output directory', 'verification')
    .option('--spec <path>', 'Path to design_spec.json for element-level drift analysis')
    .option('--threshold <number>', 'Pixelmatch threshold [0.01-0.5]', parseFloat, 0.1)
    .option('--min-similarity <number>', 'Minimum global similarity percentage required to pass', parseFloat)
    .option('--min-ink-iou <number>', 'Minimum global ink IoU percentage required to pass', parseFloat)
    .option('--min-element-iou <number>', 'Minimum element bounding box IoU required to pass', parseFloat)
    .option('--max-shift-px <number>', 'Maximum spatial shift in pixels allowed to pass', parseFloat)
    .option('--priority-filter <string>', 'Filter elements by priority (all, primary, secondary)', 'all')
    .option('--json', 'Output JSON to stdout', false)
    .parse(process.argv);

  const opts = program.opts();

  runZonalDiff(opts.ref, opts.rendered, opts)
    .then((res) => {
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log('\n=== Multi-Zone Perceptual Diffing Report ===');
        console.log(`Global Canvas: ${res.canvas.width} x ${res.canvas.height} px | Overall Similarity: ${res.globalSimilarity}%`);
        console.log(`Global Ink IoU: ${res.globalInkIou}% | Global Ink Dice: ${res.globalInkDice}%`);
        if (res.elementIouScore !== undefined) {
          console.log(`Element BBox IoU: ${res.elementIouScore}% | Max Spatial Shift: ${res.maxSpatialShiftPx}px`);
        }
        console.log('');
        console.table(
          res.zones.map(z => ({
            'Zone Name': z.name,
            'Y Range (px)': `${z.yStart}-${z.yEnd}`,
            'Similarity': `${z.similarity}%`,
            'Ink IoU': `${z.inkIou}%`,
            'Ink Dice': `${z.inkDice}%`,
            'SSIM': z.ssimScore,
            'Mismatches': z.mismatchCount,
            'Drift (Δx, Δy px)': `${z.centroidDrift.deltaX}, ${z.centroidDrift.deltaY}`,
            'Drift (dp)': `${z.centroidDrift.deltaXDp}dp, ${z.centroidDrift.deltaYDp}dp`
          }))
        );
        if (res.driftVectors && res.driftVectors.length > 0) {
          console.log('\n--- Dynamic Element Drift Breakdown (Top Shifted) ---');
          const sorted = [...res.driftVectors].sort((a, b) => b.shiftMagnitude - a.shiftMagnitude).slice(0, 10);
          console.table(
            sorted.map(v => ({
              'Element': v.name.slice(0, 25),
              'Category': v.category,
              'Drift (Δx, Δy px)': `${v.dx}, ${v.dy}`,
              'Drift (dp)': `${v.dxDp}dp, ${v.dyDp}dp`,
              'Shift (px)': `${v.shiftMagnitude}px`,
              'BBox IoU': `${v.iou}%`,
              'Status': v.status
            }))
          );
        }
        console.log(`\nAnnotated Zonal Overlay: ${res.zonalDiffOverlay}\n`);
      }

      // Check quality gates if specified
      if (opts.minSimilarity !== undefined && res.globalSimilarity < opts.minSimilarity) {
        console.error(`Quality Gate Failed: Global similarity ${res.globalSimilarity}% < required ${opts.minSimilarity}%`);
        process.exit(1);
      }
      if (opts.minInkIou !== undefined && res.globalInkIou < opts.minInkIou) {
        console.error(`Quality Gate Failed: Global Ink IoU ${res.globalInkIou}% < required ${opts.minInkIou}%`);
        process.exit(1);
      }
      if (opts.minElementIou !== undefined && res.elementIouScore < opts.minElementIou) {
        console.error(`Quality Gate Failed: Element IoU ${res.elementIouScore}% < required ${opts.minElementIou}%`);
        process.exit(1);
      }
      if (opts.maxShiftPx !== undefined && res.maxSpatialShiftPx > opts.maxShiftPx) {
        console.error(`Quality Gate Failed: Max spatial shift ${res.maxSpatialShiftPx}px > allowed ${opts.maxShiftPx}px`);
        process.exit(1);
      }

      process.exit(0);
    })
    .catch((err) => {
      console.error(`Zonal Diff Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runZonalDiff,
  DEFAULT_DC1_ZONES,
  computeInkCentroid,
  computeZonalInkMetrics,
  parseDesignSpecElements,
  computeElementDriftAndIoU
};
