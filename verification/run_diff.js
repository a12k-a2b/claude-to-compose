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
async function normalizeImageToCanvas(imageBuffer, targetWidth, targetHeight) {
  return sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
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
 * Calculates Ink IoU and Ink Dice metrics strictly for non-white ink pixels (luminance < 245).
 * Prevents white background pixels from inflating visual fidelity scores.
 *
 * @param {PNG} normRefPng
 * @param {PNG} normRenderedPng
 * @param {number} width
 * @param {number} height
 * @returns {{
 *   inkIou: number,
 *   inkDice: number,
 *   inkRefPixels: number,
 *   inkRenderedPixels: number,
 *   inkIntersectionPixels: number,
 *   inkUnionPixels: number
 * }}
 */
function computeInkMetrics(normRefPng, normRenderedPng, width, height) {
  let refInk = 0;
  let renderedInk = 0;
  let intersection = 0;
  let union = 0;

  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const rA = normRefPng.data[idx];
    const gA = normRefPng.data[idx + 1];
    const bA = normRefPng.data[idx + 2];
    const aA = normRefPng.data[idx + 3];

    const rB = normRenderedPng.data[idx];
    const gB = normRenderedPng.data[idx + 1];
    const bB = normRenderedPng.data[idx + 2];
    const aB = normRenderedPng.data[idx + 3];

    const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
    const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

    const isInkA = aA > 50 && lumA < 245;
    const isInkB = aB > 50 && lumB < 245;

    if (isInkA) refInk++;
    if (isInkB) renderedInk++;
    if (isInkA && isInkB) intersection++;
    if (isInkA || isInkB) union++;
  }

  const inkIou = union > 0 ? parseFloat(((intersection / union) * 100).toFixed(2)) : 100.0;
  const inkDice =
    refInk + renderedInk > 0
      ? parseFloat(((2 * intersection / (refInk + renderedInk)) * 100).toFixed(2))
      : 100.0;

  return {
    inkIou,
    inkDice,
    inkRefPixels: refInk,
    inkRenderedPixels: renderedInk,
    inkIntersectionPixels: intersection,
    inkUnionPixels: union
  };
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

  // Compute Ink IoU & Ink Dice strictly on non-white ink pixels (luminance < 245)
  const inkMetrics = computeInkMetrics(normRefPng, normRenderedPng, width, height);

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
  const compositePath = path.join(outputDir, 'composite.png');
  const diffCompositePath = path.join(outputDir, 'diff_composite.png');

  // Write diff overlay PNG
  const diffOverlayBuffer = PNG.sync.write(diffPng);
  fs.writeFileSync(diffOverlayPath, diffOverlayBuffer);

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
    diffOverlayPath,
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

  return compareImages(ref, rendered, output, { threshold });
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
    .option('--threshold <number>', 'Pixelmatch diff threshold [0.01 - 0.5]', parseFloat, 0.1)
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
        console.log(`  Ink IoU (Non-White Ink):    ${metrics.inkIou}%`);
        console.log(`  Ink Dice Coefficient:       ${metrics.inkDice}%`);
        console.log(`  Diff Overlay Artifact:      ${metrics.diffOverlayPath}`);
        console.log(`  3-Way Composite Artifact:   ${metrics.compositePath}\n`);
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
  validatePngHeader,
  clampDiffThreshold,
  calculateUnifiedCanvas,
  normalizeScreenshotDimensions,
  generateCompositeImage,
  CorruptImageError,
  InvalidImageError
};
