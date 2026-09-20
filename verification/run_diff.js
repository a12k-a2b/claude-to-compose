#!/usr/bin/env node

/**
 * verification/run_diff.js
 *
 * Perceptual Pixelmatch & SSIM Visual Diff Engine & CLI.
 * Compares reference Claude Design screenshots against rendered Compose previews.
 * Features PNG validation, canvas unification, diff heatmap, and 3-way composite generation.
 */

const fs = require('node:fs');
const path = require('node:path');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');
const { PNG } = require('pngjs');
const ssimFn = require('ssim.js').ssim || require('ssim.js').default || require('ssim.js');
const sharp = require('sharp');
const { Command } = require('commander');

/**
 * Custom Error for corrupted or invalid PNG images.
 */
class CorruptImageError extends Error {
  constructor(message) {
    super(`CorruptImageError: ${message}`);
    this.name = 'CorruptImageError';
  }
}

class InvalidImageError extends CorruptImageError {
  constructor(message) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/**
 * Validates PNG header magic bytes (0x89 0x50 0x4E 0x47).
 * Throws CorruptImageError on failure.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function validatePngHeader(buffer) {
  const expected = [0x89, 0x50, 0x4E, 0x47];
  if (!buffer || buffer.length < 4) {
    throw new CorruptImageError('File too short');
  }
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== expected[i]) {
      throw new CorruptImageError('Invalid PNG magic bytes');
    }
  }
  return true;
}

/**
 * Clamps diff threshold to [0.01, 0.5] range.
 *
 * @param {number} threshold
 * @returns {number}
 */
function clampDiffThreshold(threshold) {
  const MIN = 0.01;
  const MAX = 0.5;
  const val = (typeof threshold === 'number' && !Number.isNaN(threshold)) ? threshold : 0.1;
  return Math.min(Math.max(val, MIN), MAX);
}

/**
 * Calculates unified canvas dimensions covering both images.
 *
 * @param {{width: number, height: number}} ref
 * @param {{width: number, height: number}} rendered
 * @returns {{width: number, height: number}}
 */
function calculateUnifiedCanvas(ref, rendered) {
  return {
    width: Math.max(ref.width, rendered.width),
    height: Math.max(ref.height, rendered.height)
  };
}

/**
 * Normalizes screenshot dimensions given a scale factor (e.g. 3.0x retina).
 *
 * @param {number} refWidth
 * @param {number} refHeight
 * @param {number} scaleFactor
 * @returns {{logicalWidth: number, logicalHeight: number}}
 */
function normalizeScreenshotDimensions(refWidth, refHeight, scaleFactor) {
  const factor = scaleFactor || 1.0;
  return {
    logicalWidth: Math.round(refWidth / factor),
    logicalHeight: Math.round(refHeight / factor)
  };
}

/**
 * Normalizes an image to specified width/height padded on a white background.
 *
 * @param {Buffer} imageBuffer
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {Promise<Buffer>}
 */
async function normalizeImageToCanvas(imageBuffer, targetWidth, targetHeight, bg = { r: 255, g: 255, b: 255, alpha: 1 }) {
  const meta = await sharp(imageBuffer).metadata();
  if (meta.width === targetWidth && meta.height === targetHeight) {
    return imageBuffer;
  }
  return sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: bg
    })
    .png()
    .toBuffer();
}

/**
 * Generates 3-way horizontal composite image:
 * [ Reference Web Viewport | Synthesized Compose Preview | Pixel Mismatch Heatmap ]
 *
 * @param {Buffer} refBuffer
 * @param {Buffer} renderedBuffer
 * @param {Buffer} diffBuffer
 * @param {number} width
 * @param {number} height
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
async function generateCompositeImage(refBuffer, renderedBuffer, diffBuffer, width, height, outputPath) {
  const headerHeight = 60;
  const totalWidth = width * 3;
  const totalHeight = height + headerHeight;

  const headerSvg = `
    <svg width="${totalWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${totalWidth}" height="${headerHeight}" fill="#0F172A"/>
      <text x="${width * 0.5}" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#F8FAFC" text-anchor="middle">Reference Web Viewport</text>
      <line x1="${width}" y1="0" x2="${width}" y2="${headerHeight}" stroke="#334155" stroke-width="2"/>
      <text x="${width * 1.5}" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#F8FAFC" text-anchor="middle">Synthesized Compose Preview</text>
      <line x1="${width * 2}" y1="0" x2="${width * 2}" y2="${headerHeight}" stroke="#334155" stroke-width="2"/>
      <text x="${width * 2.5}" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="bold" fill="#FB7185" text-anchor="middle">Pixel Mismatch Heatmap</text>
    </svg>
  `;

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      { input: Buffer.from(headerSvg), top: 0, left: 0 },
      { input: refBuffer, top: headerHeight, left: 0 },
      { input: renderedBuffer, top: headerHeight, left: width },
      { input: diffBuffer, top: headerHeight, left: width * 2 }
    ])
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Detects dominant background color palette using 3D color histogram and centroid refinement.
 * Captures all background surfaces with area fraction >= minPct (default 5%).
 *
 * @param {PNG|{data: Buffer, width: number, height: number}} png
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @returns {Array<{ r: number, g: number, b: number, count: number, pct: number }>}
 */
function detectBackgroundPalette(png, width, height, options = {}) {
  const minPct = options.minPct !== undefined ? options.minPct : 5.0;
  // Sample every pixel for small images (e.g. 10x10 unit tests), or step dynamically for large images
  const sampleStep = (width <= 32 || height <= 32)
    ? 1
    : (options.sampleStep || Math.max(1, Math.floor(Math.min(width, height) / 100)));
  const binWidth = options.binWidth || 8;
  const bins = new Map();
  let sampledCount = 0;
  const data = Buffer.isBuffer(png) ? png : (png && png.data ? png.data : png);

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 50) continue; // Skip transparent

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const rBin = Math.floor(r / binWidth) * binWidth;
      const gBin = Math.floor(g / binWidth) * binWidth;
      const bBin = Math.floor(b / binWidth) * binWidth;
      const key = `${rBin},${gBin},${bBin}`;

      let entry = bins.get(key);
      if (!entry) {
        entry = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
        bins.set(key, entry);
      }
      entry.count++;
      entry.sumR += r;
      entry.sumG += g;
      entry.sumB += b;
      sampledCount++;
    }
  }

  if (sampledCount === 0) {
    return [{ r: 255, g: 255, b: 255, count: 0, pct: 100 }];
  }

  // Refine centroids and sort by frequency
  const sorted = Array.from(bins.entries())
    .map(([_, entry]) => ({
      r: Math.round(entry.sumR / entry.count),
      g: Math.round(entry.sumG / entry.count),
      b: Math.round(entry.sumB / entry.count),
      count: entry.count,
      pct: (entry.count / sampledCount) * 100
    }))
    .sort((a, b) => b.count - a.count);

  const palette = sorted.filter(c => c.pct >= minPct);
  if (palette.length === 0 && sorted.length > 0) {
    palette.push(sorted[0]);
  }
  return palette;
}

/**
 * Calculates Ink IoU and Ink Dice metrics strictly for foreground ink pixels,
 * subtracting dynamic multi-modal background colors.
 *
 * @param {PNG} normRefPng
 * @param {PNG} normRenderedPng
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @returns {{
 *   inkIou: number,
 *   inkDice: number,
 *   inkRefPixels: number,
 *   inkRenderedPixels: number,
 *   inkIntersectionPixels: number,
 *   inkUnionPixels: number,
 *   bgPaletteRef: Array<{r: number, g: number, b: number}>,
 *   bgPaletteRendered: Array<{r: number, g: number, b: number}>
 * }}
 */
function computeInkMetrics(normRefPng, normRenderedPng, width, height, options = {}) {
  const tauBg = options.tauBg !== undefined ? options.tauBg : 20.0;
  const tauBgSq = tauBg * tauBg;

  const bgPaletteA = detectBackgroundPalette(normRefPng, width, height, options);
  const bgPaletteB = detectBackgroundPalette(normRenderedPng, width, height, options);

  let refInk = 0;
  let renderedInk = 0;
  let intersection = 0;
  let union = 0;

  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const aA = normRefPng.data[idx + 3];
    const aB = normRenderedPng.data[idx + 3];

    let isInkA = aA > 50;
    if (isInkA) {
      const rA = normRefPng.data[idx];
      const gA = normRefPng.data[idx + 1];
      const bA = normRefPng.data[idx + 2];
      const alphaFactorA = aA / 255.0;

      for (let b = 0; b < bgPaletteA.length; b++) {
        const bg = bgPaletteA[b];
        const dR = rA - bg.r;
        const dG = gA - bg.g;
        const dB = bA - bg.b;
        const distSq = (dR * dR + dG * dG + dB * dB) * (alphaFactorA * alphaFactorA);
        if (distSq <= tauBgSq) {
          isInkA = false;
          break;
        }
      }
    }

    let isInkB = aB > 50;
    if (isInkB) {
      const rB = normRenderedPng.data[idx];
      const gB = normRenderedPng.data[idx + 1];
      const bB = normRenderedPng.data[idx + 2];
      const alphaFactorB = aB / 255.0;

      for (let b = 0; b < bgPaletteB.length; b++) {
        const bg = bgPaletteB[b];
        const dR = rB - bg.r;
        const dG = gB - bg.g;
        const dB = bB - bg.b;
        const distSq = (dR * dR + dG * dG + dB * dB) * (alphaFactorB * alphaFactorB);
        if (distSq <= tauBgSq) {
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
    inkRefPixels: refInk,
    inkRenderedPixels: renderedInk,
    inkIntersectionPixels: intersection,
    inkUnionPixels: union,
    bgPaletteRef: bgPaletteA,
    bgPaletteRendered: bgPaletteB
  };
}

/**
 * Computes native 3x3 Sobel edge gradients from an image buffer or PNG object.
 * Uses Sharp 1-channel raw grayscale conversion for high cache locality.
 *
 * @param {Buffer|Object} imageSource - Raw PNG Buffer or PNG object with data/width/height.
 * @param {Object} [options]
 * @param {number} [options.threshold=30] - Gradient magnitude cutoff threshold.
 * @returns {Promise<{
 *   edges: Uint8Array,
 *   width: number,
 *   height: number,
 *   count: number
 * }>}
 */
async function computeSobelEdges(imageSource, options = {}) {
  const threshold = typeof options.threshold === 'number' ? options.threshold : 30;
  const tSq = threshold * threshold;

  let grayData;
  let width;
  let height;

  if (imageSource && imageSource.data && imageSource.width && imageSource.height) {
    width = imageSource.width;
    height = imageSource.height;
    grayData = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      grayData[i] = Math.round(
        0.299 * imageSource.data[idx] +
        0.587 * imageSource.data[idx + 1] +
        0.114 * imageSource.data[idx + 2]
      );
    }
  } else if (Buffer.isBuffer(imageSource) && options.width && options.height && options.raw) {
    width = options.width;
    height = options.height;
    grayData = imageSource;
  } else if (Buffer.isBuffer(imageSource)) {
    const res = await sharp(imageSource)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    grayData = res.data;
    width = res.info.width;
    height = res.info.height;
  } else {
    throw new Error('Invalid imageSource: expected Buffer or PNG object');
  }

  const edges = new Uint8Array(width * height);
  let count = 0;

  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y++) {
      const pR = (y - 1) * width;
      const cR = y * width;
      const nR = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const gx = (-grayData[pR + x - 1] + grayData[pR + x + 1])
                 + 2 * (-grayData[cR + x - 1] + grayData[cR + x + 1])
                 + (-grayData[nR + x - 1] + grayData[nR + x + 1]);

        const gy = (-grayData[pR + x - 1] - 2 * grayData[pR + x] - grayData[pR + x + 1])
                 + (grayData[nR + x - 1] + 2 * grayData[nR + x] + grayData[nR + x + 1]);

        if (gx * gx + gy * gy >= tSq) {
          edges[cR + x] = 1;
          count++;
        }
      }
    }
  }

  return { edges, width, height, count };
}

/**
 * Evaluates distance-weighted contour alignment between reference and rendered edge sets.
 * d <= 1px -> 1.0 (sub-dp font antialiasing/hinting)
 * d = 2px -> 0.5 (slight kerning/tracking variance)
 * d >= 3px -> 0.0 (spatial drift and double-vision ghosting)
 *
 * @param {Object} ref - { edges, width, height, count }
 * @param {Object} rendered - { edges, width, height, count }
 * @returns {{
 *   edgeContourScore: number,
 *   edgeContourPrecision: number,
 *   edgeContourF1: number,
 *   match1px: number,
 *   match2px: number,
 *   displacedCount: number
 * }}
 */
function evaluateContourAlignment(ref, rendered) {
  const { width: w, height: h, edges: refE, count: refCount } = ref;
  const rendE = rendered.edges;
  const rendCount = rendered.count;

  if (refCount === 0 && rendCount === 0) {
    return {
      edgeContourScore: 100.0,
      edgeContourPrecision: 100.0,
      edgeContourF1: 100.0,
      match1px: 0,
      match2px: 0,
      displacedCount: 0
    };
  }

  if (refCount === 0 || rendCount === 0) {
    return {
      edgeContourScore: 0.0,
      edgeContourPrecision: 0.0,
      edgeContourF1: 0.0,
      match1px: 0,
      match2px: 0,
      displacedCount: refCount || rendCount
    };
  }

  // 1. Forward match (Ref -> Rendered Recall)
  let sumW = 0;
  let match1px = 0;
  let match2px = 0;
  let displacedCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (refE[y * w + x] === 1) {
        // Check d <= 1px (3x3 window)
        let found1 = false;
        for (let dy = -1; dy <= 1 && !found1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1 && !found1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (rendE[ny * w + nx] === 1) found1 = true;
          }
        }

        if (found1) {
          sumW += 1.0;
          match1px++;
          continue;
        }

        // Check d = 2px (5x5 outer ring: max(|dx|, |dy|) == 2)
        let found2 = false;
        for (let dy = -2; dy <= 2 && !found2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -2; dx <= 2 && !found2; dx++) {
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (rendE[ny * w + nx] === 1) found2 = true;
          }
        }

        if (found2) {
          sumW += 0.5;
          match2px++;
        } else {
          displacedCount++;
        }
      }
    }
  }

  const edgeContourScore = refCount > 0 ? parseFloat(((sumW / refCount) * 100).toFixed(2)) : 0.0;

  // 2. Reverse match (Rendered -> Ref Precision)
  let sumWRev = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rendE[y * w + x] === 1) {
        let found1 = false;
        for (let dy = -1; dy <= 1 && !found1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1 && !found1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (refE[ny * w + nx] === 1) found1 = true;
          }
        }
        if (found1) { sumWRev += 1.0; continue; }

        let found2 = false;
        for (let dy = -2; dy <= 2 && !found2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -2; dx <= 2 && !found2; dx++) {
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            if (refE[ny * w + nx] === 1) found2 = true;
          }
        }
        if (found2) sumWRev += 0.5;
      }
    }
  }

  const edgeContourPrecision = rendCount > 0 ? parseFloat(((sumWRev / rendCount) * 100).toFixed(2)) : 0.0;
  const f1 = (edgeContourScore + edgeContourPrecision) > 0
    ? parseFloat(((2 * edgeContourScore * edgeContourPrecision) / (edgeContourScore + edgeContourPrecision)).toFixed(2))
    : 0.0;

  return {
    edgeContourScore,
    edgeContourPrecision,
    edgeContourF1: f1,
    match1px,
    match2px,
    displacedCount
  };
}

/**
 * Renders 4-channel RGBA Edge Diff Overlay distinguishing true alignments vs ghost edges.
 * Colors:
 * - Emerald Green (#22C55E): Aligned contours (d <= 1px)
 * - Amber Yellow (#EAB308): Minor shift (d = 2px)
 * - Vivid Cyan (#06B6D4): Missing reference contours (d >= 3px)
 * - Rose Red (#F43F5E): Ghost rendered contours (d >= 3px)
 * - Dark Slate 900 (#0F172A): Background ground
 *
 * @param {Object} ref - { edges, width, height }
 * @param {Object} rendered - { edges, width, height }
 * @param {string} outputPath
 * @param {Object} [options]
 * @returns {Promise<string>}
 */
async function generateEdgeDiffOverlay(ref, rendered, outputPath, options = {}) {
  const { width: w, height: h, edges: refE } = ref;
  const rendE = rendered.edges;
  const outBuf = Buffer.alloc(w * h * 4);

  // Pre-calculate per-pixel match flags for ref edges
  const isRefAligned = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (refE[y * w + x] === 1) {
        let m1 = false;
        for (let dy = -1; dy <= 1 && !m1; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1 && !m1; dx++) {
            const nx = x + dx; if (nx < 0 || nx >= w) continue;
            if (rendE[ny * w + nx] === 1) m1 = true;
          }
        }
        if (m1) { isRefAligned[y * w + x] = 1; continue; }

        let m2 = false;
        for (let dy = -2; dy <= 2 && !m2; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= h) continue;
          for (let dx = -2; dx <= 2 && !m2; dx++) {
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
            const nx = x + dx; if (nx < 0 || nx >= w) continue;
            if (rendE[ny * w + nx] === 1) m2 = true;
          }
        }
        if (m2) isRefAligned[y * w + x] = 2;
      }
    }
  }

  for (let i = 0; i < w * h; i++) {
    const oIdx = i * 4;
    const rState = isRefAligned[i];
    const isRef = refE[i] === 1;
    const isRend = rendE[i] === 1;

    if (rState === 1) {
      // Aligned <= 1px: Emerald Green #22C55E
      outBuf[oIdx] = 34; outBuf[oIdx + 1] = 197; outBuf[oIdx + 2] = 94; outBuf[oIdx + 3] = 255;
    } else if (rState === 2) {
      // Marginal = 2px: Amber #EAB308
      outBuf[oIdx] = 234; outBuf[oIdx + 1] = 179; outBuf[oIdx + 2] = 8; outBuf[oIdx + 3] = 255;
    } else if (isRef && !isRend) {
      // Reference edge missing / displaced: Vivid Cyan #06B6D4
      outBuf[oIdx] = 6; outBuf[oIdx + 1] = 182; outBuf[oIdx + 2] = 212; outBuf[oIdx + 3] = 255;
    } else if (isRend && !isRef) {
      // Rendered ghost edge: Rose Red #F43F5E
      outBuf[oIdx] = 244; outBuf[oIdx + 1] = 63; outBuf[oIdx + 2] = 94; outBuf[oIdx + 3] = 255;
    } else {
      // Ground: Slate 900 #0F172A
      outBuf[oIdx] = 15; outBuf[oIdx + 1] = 23; outBuf[oIdx + 2] = 42; outBuf[oIdx + 3] = 255;
    }
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await sharp(outBuf, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outputPath);

  // Maintain edge_diff.png and edge_diff_overlay.png equivalence
  const baseName = path.basename(outputPath);
  if (baseName === 'edge_diff_overlay.png') {
    const aliasPath = path.join(outputDir, 'edge_diff.png');
    try { fs.copyFileSync(outputPath, aliasPath); } catch (_) {}
  } else if (baseName === 'edge_diff.png') {
    const aliasPath = path.join(outputDir, 'edge_diff_overlay.png');
    try { fs.copyFileSync(outputPath, aliasPath); } catch (_) {}
  }

  return outputPath;
}

/**
 * Compares reference screenshot with rendered preview screenshot.
 *
 * @param {string} refPath
 * @param {string} renderedPath
 * @param {string} outputDir
 * @param {Object} [options]
 * @returns {Promise<{
 *   pixelMismatchCount: number,
 *   pixelSimilarityPercentage: number,
 *   mssimScore: number,
 *   inkIou: number,
 *   inkDice: number,
 *   inkRefPixels: number,
 *   inkRenderedPixels: number,
 *   inkIntersectionPixels: number,
 *   inkUnionPixels: number,
 *   diffOverlayPath: string,
 *   compositePath: string
 * }>}
 */
async function compareImages(refPath, renderedPath, outputDir = 'verification', options = {}) {
  if (!fs.existsSync(refPath)) {
    throw new Error(`Reference image not found at ${refPath}`);
  }
  if (!fs.existsSync(renderedPath)) {
    throw new Error(`Rendered image not found at ${renderedPath}`);
  }

  const refRaw = fs.readFileSync(refPath);
  const renderedRaw = fs.readFileSync(renderedPath);

  validatePngHeader(refRaw);
  validatePngHeader(renderedRaw);

  const refPng = PNG.sync.read(refRaw);
  const renderedPng = PNG.sync.read(renderedRaw);

  const canvas = calculateUnifiedCanvas(refPng, renderedPng);
  const width = canvas.width;
  const height = canvas.height;

  // Normalize both images to unified canvas dimensions
  const refNormBuf = await normalizeImageToCanvas(refRaw, width, height);
  const renderedNormBuf = await normalizeImageToCanvas(renderedRaw, width, height);

  const normRefPng = PNG.sync.read(refNormBuf);
  const normRenderedPng = PNG.sync.read(renderedNormBuf);

  const diffPng = new PNG({ width, height });
  const threshold = clampDiffThreshold(options.threshold !== undefined ? options.threshold : 0.1);

  // Run Pixelmatch
  const pixelMismatchCount = pixelmatch(
    normRefPng.data,
    normRenderedPng.data,
    diffPng.data,
    width,
    height,
    {
      threshold,
      includeAA: true,
      diffColor: [244, 63, 94], // Rose accent
      alpha: 0.2
    }
  );

  const totalPixels = width * height;
  const pixelSimilarityPercentage = parseFloat(
    (((totalPixels - pixelMismatchCount) / totalPixels) * 100).toFixed(2)
  );

  // Compute Ink IoU & Ink Dice strictly on foreground ink (subtracting dynamic background palette)
  const inkMetrics = computeInkMetrics(normRefPng, normRenderedPng, width, height, options);

  // Compute 3x3 Sobel edge gradients & distance-weighted contour alignment
  const edgeThreshold = typeof options.edgeThreshold === 'number' ? options.edgeThreshold : 30;
  const refEdges = await computeSobelEdges(refNormBuf, { threshold: edgeThreshold });
  const renderedEdges = await computeSobelEdges(renderedNormBuf, { threshold: edgeThreshold });
  const contourMetrics = evaluateContourAlignment(refEdges, renderedEdges);

  // Compute SSIM
  let mssimScore = 1.0;
  if (pixelMismatchCount === 0) {
    mssimScore = 1.0;
  } else if (pixelMismatchCount === totalPixels) {
    mssimScore = 0.0;
  } else {
    try {
      const windowSize = Math.max(1, Math.min(11, Math.floor(Math.min(width, height) / 2) * 2 + 1));
      const ssimResult = ssimFn(
        { data: normRefPng.data, width, height },
        { data: normRenderedPng.data, width, height },
        { windowSize }
      );
      if (typeof ssimResult.mssim === 'number' && !Number.isNaN(ssimResult.mssim)) {
        mssimScore = parseFloat(Math.max(0, Math.min(1, ssimResult.mssim)).toFixed(4));
      } else {
        mssimScore = parseFloat((pixelSimilarityPercentage / 100).toFixed(4));
      }
    } catch (_) {
      mssimScore = parseFloat((pixelSimilarityPercentage / 100).toFixed(4));
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const diffOverlayPath = path.join(outputDir, 'diff_overlay.png');
  const edgeDiffOverlayPath = path.join(outputDir, 'edge_diff_overlay.png');
  const compositePath = path.join(outputDir, 'composite.png');
  const diffCompositePath = path.join(outputDir, 'diff_composite.png');

  // Write diff overlay PNG
  const diffOverlayBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffOverlayPath, diffOverlayBuffer);

  // Write 4-color Edge Diff Overlay PNG
  await generateEdgeDiffOverlay(refEdges, renderedEdges, edgeDiffOverlayPath);

  // Generate 3-way composite
  await generateCompositeImage(
    refNormBuf,
    renderedNormBuf,
    diffOverlayBuffer,
    width,
    height,
    compositePath
  );

  // Write diff_composite.png alias for full compatibility
  try {
    fs.copyFileSync(compositePath, diffCompositePath);
  } catch (_) {}

  return {
    pixelMismatchCount,
    pixelSimilarityPercentage,
    mssimScore,
    inkIou: inkMetrics.inkIou,
    inkDice: inkMetrics.inkDice,
    inkRefPixels: inkMetrics.inkRefPixels,
    inkRenderedPixels: inkMetrics.inkRenderedPixels,
    inkIntersectionPixels: inkMetrics.inkIntersectionPixels,
    inkUnionPixels: inkMetrics.inkUnionPixels,
    edgeContourScore: contourMetrics.edgeContourScore,
    edgeContourPrecision: contourMetrics.edgeContourPrecision,
    edgeContourF1: contourMetrics.edgeContourF1,
    edgeRefPixels: refEdges.count,
    edgeRenderedPixels: renderedEdges.count,
    edgeAlignedPixels: contourMetrics.match1px + contourMetrics.match2px,
    diffOverlayPath,
    edgeDiffOverlayPath,
    compositePath
  };
}

/**
 * Unified runDiff entrypoint accepting options object or CLI args.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function runDiff(options = {}) {
  const ref = options.ref || options.refPath;
  const rendered = options.rendered || options.renderedPath;
  const output = options.output || options.outputDir || 'verification';
  const threshold = options.threshold !== undefined ? options.threshold : 0.1;
  const specPath = options.spec || options.specPath;

  const result = await compareImages(ref, rendered, output, {
    threshold,
    ...options
  });

  if (specPath && fs.existsSync(specPath)) {
    try {
      const { runZonalDiff } = require('./zonal_diff');
      const zonalResult = await runZonalDiff(ref, rendered, {
        outputDir: output,
        threshold,
        specPath
      });
      result.zonal = zonalResult;
      result.elementIouScore = zonalResult.elementIouScore;
      result.maxSpatialShiftPx = zonalResult.maxSpatialShiftPx;
      result.worstDriftElement = zonalResult.worstDriftElement;
      result.driftVectors = zonalResult.driftVectors;
    } catch (zErr) {
      console.warn(`[runDiff] Zonal diff warning: ${zErr.message}`);
    }
  }

  return result;
}

// CLI Execution Entry Point
if (require.main === module) {
  const program = new Command();

  program
    .name('run_diff')
    .description('Programmatic visual diff engine comparing reference screenshot vs Compose preview')
    .requiredOption('--ref <path>', 'Path to reference screenshot')
    .requiredOption('--rendered <path>', 'Path to rendered Compose preview screenshot')
    .option('--output <dir>', 'Directory to write diff outputs', 'verification')
    .option('--spec <path>', 'Path to design_spec.json for dynamic element drift analysis')
    .option('--threshold <number>', 'Pixelmatch diff threshold [0.01 - 0.5]', parseFloat, 0.1)
    .option('--edge-threshold <number>', 'Sobel gradient cutoff threshold [10 - 100]', parseFloat, 30)
    .option('--min-similarity <number>', 'Minimum pixel similarity percentage required to pass', parseFloat)
    .option('--min-ink-iou <number>', 'Minimum ink IoU percentage required to pass', parseFloat)
    .option('--min-edge-contour <number>', 'Minimum edge contour alignment percentage required to pass', parseFloat)
    .option('--min-element-iou <number>', 'Minimum element bounding box IoU required to pass', parseFloat)
    .option('--max-shift-px <number>', 'Maximum spatial shift in pixels allowed to pass', parseFloat)
    .option('--json', 'Output metrics as JSON to stdout', false)
    .parse(process.argv);

  const opts = program.opts();

  runDiff(opts)
    .then((metrics) => {
      if (opts.json) {
        console.log(JSON.stringify(metrics, null, 2));
      } else {
        console.log('\n=== Programmatic Visual Diff Analysis ===');
        console.log(`  Pixel Mismatch Count:       ${metrics.pixelMismatchCount}`);
        console.log(`  Pixel Similarity:           ${metrics.pixelSimilarityPercentage}%`);
        console.log(`  MSSIM Structural Score:     ${metrics.mssimScore}`);
        console.log(`  Ink IoU (Dynamic Palette):  ${metrics.inkIou}%`);
        console.log(`  Ink Dice Coefficient:       ${metrics.inkDice}%`);
        console.log(`  Sobel Contour Score:        ${metrics.edgeContourScore}% (Precision: ${metrics.edgeContourPrecision}%, F1: ${metrics.edgeContourF1}%)`);
        if (metrics.elementIouScore !== undefined) {
          console.log(`  Element BBox IoU:           ${metrics.elementIouScore}%`);
          console.log(`  Max Spatial Shift:          ${metrics.maxSpatialShiftPx}px`);
        }
        console.log(`  Diff Overlay Artifact:      ${metrics.diffOverlayPath}`);
        console.log(`  Edge Diff Overlay Artifact: ${metrics.edgeDiffOverlayPath}`);
        console.log(`  3-Way Composite Artifact:   ${metrics.compositePath}\n`);
      }

      // Check quality gates if specified
      if (opts.minSimilarity !== undefined && metrics.pixelSimilarityPercentage < opts.minSimilarity) {
        console.error(`Quality Gate Failed: Pixel similarity ${metrics.pixelSimilarityPercentage}% < required ${opts.minSimilarity}%`);
        process.exit(1);
      }
      if (opts.minInkIou !== undefined && metrics.inkIou < opts.minInkIou) {
        console.error(`Quality Gate Failed: Ink IoU ${metrics.inkIou}% < required ${opts.minInkIou}%`);
        process.exit(1);
      }
      if (opts.minEdgeContour !== undefined && metrics.edgeContourScore < opts.minEdgeContour) {
        console.error(`Quality Gate Failed: Edge contour alignment ${metrics.edgeContourScore}% < required ${opts.minEdgeContour}%`);
        process.exit(1);
      }
      if (opts.minElementIou !== undefined && metrics.elementIouScore !== undefined && metrics.elementIouScore < opts.minElementIou) {
        console.error(`Quality Gate Failed: Element IoU ${metrics.elementIouScore}% < required ${opts.minElementIou}%`);
        process.exit(1);
      }
      if (opts.maxShiftPx !== undefined && metrics.maxSpatialShiftPx !== undefined && metrics.maxSpatialShiftPx > opts.maxShiftPx) {
        console.error(`Quality Gate Failed: Max spatial shift ${metrics.maxSpatialShiftPx}px > allowed ${opts.maxShiftPx}px`);
        process.exit(1);
      }

      process.exit(0);
    })
    .catch((err) => {
      console.error(`Diff Execution Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runDiff,
  compareImages,
  computeInkMetrics,
  detectBackgroundPalette,
  computeSobelEdges,
  evaluateContourAlignment,
  generateEdgeDiffOverlay,
  validatePngHeader,
  clampDiffThreshold,
  calculateUnifiedCanvas,
  normalizeScreenshotDimensions,
  normalizeImageToCanvas,
  generateCompositeImage,
  CorruptImageError,
  InvalidImageError
};
