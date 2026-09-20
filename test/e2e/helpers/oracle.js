/**
 * test/e2e/helpers/oracle.js
 *
 * Authoritative Mathematical Reference Oracles and Synthetic Test Data Generators.
 * Provides reference implementations for:
 * 1. Discrete 3x3 Sobel edge detection & distance-weighted contour alignment.
 * 2. Dynamic modal RGB histogram background clustering & ink extraction.
 * 3. Element bounding box IoU & centroid drift vector calculation.
 * 4. Hard anti-deception guardrail evaluation.
 * 5. Synthetic pixel-precise test pattern image generation via sharp.
 */

const sharp = require('sharp');
const { PNG } = require('pngjs');

class UnimplementedError extends Error {
  constructor(component, milestone, reason) {
    super(`Unimplemented component: "${component}" (Milestone: ${milestone || 'Pending'})${reason ? ' - ' + reason : ''}`);
    this.name = 'UnimplementedError';
    this.component = component;
    this.milestone = milestone;
    this.reason = reason;
  }
}

class SkipTestError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipTestError';
    this.reason = reason;
  }
}

/**
 * Extracts edge pixels using 3x3 Sobel gradient kernels on a grayscale buffer.
 *
 * @param {Buffer} imgBuffer - PNG image buffer
 * @param {number} [threshold=30] - Gradient magnitude threshold
 * @returns {Promise<{ edges: Uint8Array, width: number, height: number, count: number }>}
 */
async function extractSobelEdges(imgBuffer, threshold = 30) {
  const { data, info } = await sharp(imgBuffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const edges = new Uint8Array(w * h);
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    const rPrev = (y - 1) * w;
    const rCurr = y * w;
    const rNext = (y + 1) * w;

    for (let x = 1; x < w - 1; x++) {
      const gx =
        (-data[rPrev + x - 1] + data[rPrev + x + 1]) +
        2 * (-data[rCurr + x - 1] + data[rCurr + x + 1]) +
        (-data[rNext + x - 1] + data[rNext + x + 1]);

      const gy =
        (-data[rPrev + x - 1] - 2 * data[rPrev + x] - data[rPrev + x + 1]) +
        (data[rNext + x - 1] + 2 * data[rNext + x] + data[rNext + x + 1]);

      const mag = Math.abs(gx) + Math.abs(gy);
      if (mag > threshold) {
        edges[rCurr + x] = 1;
        count++;
      }
    }
  }

  return { edges, width: w, height: h, count };
}

/**
 * Computes distance-weighted contour alignment score between reference and rendered edge sets.
 * Scoring kernel:
 *   d <= 1px -> 1.0
 *   d == 2px -> 0.5
 *   d >= 3px -> 0.0
 *
 * @param {{ edges: Uint8Array, width: number, height: number, count: number }} refEdges
 * @param {{ edges: Uint8Array, width: number, height: number, count: number }} rendEdges
 * @param {number} [searchRadius=5]
 * @returns {number} Alignment percentage (0.0 to 100.0)
 */
function computeSobelContourAlignment(refEdges, rendEdges, searchRadius = 5) {
  const { width, height, count } = refEdges;
  if (count === 0) {
    return rendEdges.count === 0 ? 100.0 : 0.0;
  }

  let totalScore = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (refEdges.edges[y * width + x] === 1) {
        let minDist = Infinity;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;

          for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;

            if (rendEdges.edges[ny * width + nx] === 1) {
              const d = Math.max(Math.abs(dx), Math.abs(dy));
              if (d < minDist) minDist = d;
              if (minDist === 0) break;
            }
          }
          if (minDist === 0) break;
        }

        let weight = 0.0;
        if (minDist <= 1) {
          weight = 1.0;
        } else if (minDist === 2) {
          weight = 0.5;
        } else {
          weight = 0.0;
        }
        totalScore += weight;
      }
    }
  }

  return parseFloat(((totalScore / count) * 100).toFixed(2));
}

/**
 * Clusters the dominant background canvas color via 3D RGB color histogram.
 *
 * @param {Buffer} imgBuffer
 * @param {number} [binSize=16]
 * @returns {Promise<{ dominantBg: { r: number, g: number, b: number }, coverageFraction: number }>}
 */
async function clusterDominantBackground(imgBuffer, binSize = 16) {
  const { data, info } = await sharp(imgBuffer).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const bins = new Map();

  for (let i = 0; i < w * h; i++) {
    const idx = i * ch;
    const r = Math.floor(data[idx] / binSize) * binSize;
    const g = Math.floor(data[idx + 1] / binSize) * binSize;
    const b = Math.floor(data[idx + 2] / binSize) * binSize;
    const key = `${r},${g},${b}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  let maxCount = 0;
  let dominantKey = '255,255,255';
  for (const [key, count] of bins.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantKey = key;
    }
  }

  const [dr, dg, db] = dominantKey.split(',').map(Number);
  return {
    dominantBg: { r: dr + Math.floor(binSize / 2), g: dg + Math.floor(binSize / 2), b: db + Math.floor(binSize / 2) },
    coverageFraction: maxCount / (w * h)
  };
}

/**
 * Classifies foreground ink pixels using dynamic color distance from dominant background color.
 *
 * @param {Buffer} imgBuffer
 * @param {{ r: number, g: number, b: number }} dominantBg
 * @param {number} [threshold=25]
 * @returns {Promise<{ inkMask: Uint8Array, inkCount: number, width: number, height: number }>}
 */
async function classifyInkPixels(imgBuffer, dominantBg, threshold = 25) {
  const { data, info } = await sharp(imgBuffer).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const mask = new Uint8Array(w * h);
  let inkCount = 0;

  for (let i = 0; i < w * h; i++) {
    const idx = i * ch;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = ch >= 4 ? data[idx + 3] : 255;

    if (a < 50) continue; // Transparent

    const dR = r - dominantBg.r;
    const dG = g - dominantBg.g;
    const dB = b - dominantBg.b;
    const colorDist = Math.sqrt(dR * dR + dG * dG + dB * dB);

    if (colorDist > threshold) {
      mask[i] = 1;
      inkCount++;
    }
  }

  return { inkMask: mask, inkCount, width: w, height: h };
}

/**
 * Computes Dynamic Ink IoU without static luminance bias.
 *
 * @param {Buffer} refBuffer
 * @param {Buffer} rendBuffer
 * @returns {Promise<{ inkIou: number, refInk: number, rendInk: number, intersection: number, union: number }>}
 */
async function computeDynamicInkIoU(refBuffer, rendBuffer) {
  const refBg = await clusterDominantBackground(refBuffer);
  const rendBg = await clusterDominantBackground(rendBuffer);

  const refInk = await classifyInkPixels(refBuffer, refBg.dominantBg);
  const rendInk = await classifyInkPixels(rendBuffer, rendBg.dominantBg);

  const totalPixels = refInk.width * refInk.height;
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < totalPixels; i++) {
    const isA = refInk.inkMask[i] === 1;
    const isB = rendInk.inkMask[i] === 1;

    if (isA && isB) intersection++;
    if (isA || isB) union++;
  }

  const inkIou = union > 0 && refInk.inkCount > 0 && rendInk.inkCount > 0
    ? parseFloat(((intersection / union) * 100).toFixed(2))
    : 0.0;

  return {
    inkIou,
    refInk: refInk.inkCount,
    rendInk: rendInk.inkCount,
    intersection,
    union
  };
}

/**
 * Computes Intersection over Union (IoU) for two axis-aligned bounding boxes.
 * Bounding box format: { x: number, y: number, width: number, height: number }
 *
 * @param {{ x: number, y: number, width: number, height: number }} boxA
 * @param {{ x: number, y: number, width: number, height: number }} boxB
 * @returns {number} IoU percentage (0.0 to 100.0)
 */
function computeBoundingBoxIoU(boxA, boxB) {
  const xA1 = boxA.x;
  const yA1 = boxA.y;
  const xA2 = boxA.x + boxA.width;
  const yA2 = boxA.y + boxA.height;

  const xB1 = boxB.x;
  const yB1 = boxB.y;
  const xB2 = boxB.x + boxB.width;
  const yB2 = boxB.y + boxB.height;

  const xInter1 = Math.max(xA1, xB1);
  const yInter1 = Math.max(yA1, yB1);
  const xInter2 = Math.min(xA2, xB2);
  const yInter2 = Math.min(yA2, yB2);

  const interWidth = Math.max(0, xInter2 - xInter1);
  const interHeight = Math.max(0, yInter2 - yInter1);
  const intersectionArea = interWidth * interHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 0.0;
  return parseFloat(((intersectionArea / unionArea) * 100).toFixed(2));
}

/**
 * Computes centroid drift vector (dx, dy) and dimension deltas between two boxes.
 *
 * @param {{ x: number, y: number, width: number, height: number }} boxA
 * @param {{ x: number, y: number, width: number, height: number }} boxB
 * @returns {{ dx: number, dy: number, dWidth: number, dHeight: number, spatialShift: number }}
 */
function computeCentroidDrift(boxA, boxB) {
  const cAx = boxA.x + boxA.width / 2;
  const cAy = boxA.y + boxA.height / 2;
  const cBx = boxB.x + boxB.width / 2;
  const cBy = boxB.y + boxB.height / 2;

  const dx = parseFloat((cBx - cAx).toFixed(2));
  const dy = parseFloat((cBy - cAy).toFixed(2));
  const dWidth = parseFloat((boxB.width - boxA.width).toFixed(2));
  const dHeight = parseFloat((boxB.height - boxA.height).toFixed(2));
  const spatialShift = parseFloat(Math.hypot(dx, dy).toFixed(2));

  return { dx, dy, dWidth, dHeight, spatialShift };
}

/**
 * Evaluates Hard Anti-Deception Guardrails.
 * If spatial drift > 3.0px OR contour score < 90.0% OR element IoU < 90.0%,
 * the verification must fail.
 *
 * @param {{
 *   edgeContourScore: number,
 *   maxSpatialShiftPx: number,
 *   elementIouScore?: number,
 *   pixelSimilarityPercentage?: number
 * }} metrics
 * @returns {{ passed: boolean, violations: string[] }}
 */
function evaluateAntiDeceptionGuardrails(metrics) {
  const violations = [];

  if (typeof metrics.maxSpatialShiftPx === 'number' && metrics.maxSpatialShiftPx > 3.0) {
    violations.push(`Spatial drift (${metrics.maxSpatialShiftPx.toFixed(1)}px) exceeds hard anti-deception ceiling of 3.0px`);
  }

  if (typeof metrics.edgeContourScore === 'number' && metrics.edgeContourScore < 90.0) {
    violations.push(`Edge contour alignment (${metrics.edgeContourScore.toFixed(1)}%) below required threshold of 90.0%`);
  }

  if (typeof metrics.elementIouScore === 'number' && metrics.elementIouScore < 90.0) {
    violations.push(`Element bounding box IoU (${metrics.elementIouScore.toFixed(1)}%) below required threshold of 90.0%`);
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * Generates synthetic test image pairs with customizable background, foreground, shape, and spatial offset.
 *
 * @param {{
 *   width?: number,
 *   height?: number,
 *   bgColor?: string,
 *   fgColor?: string,
 *   shiftX?: number,
 *   shiftY?: number,
 *   elements?: Array<{ type: string, x: number, y: number, w: number, h: number, rx?: number, text?: string }>
 * }} [options]
 * @returns {Promise<{ refBuffer: Buffer, rendBuffer: Buffer }>}
 */
async function generateSyntheticPair(options = {}) {
  const w = options.width || 200;
  const h = options.height || 120;
  const bg = options.bgColor || '#FFFFFF';
  const fg = options.fgColor || '#000000';
  const sx = options.shiftX !== undefined ? options.shiftX : 0;
  const sy = options.shiftY !== undefined ? options.shiftY : 0;

  const elements = options.elements || [
    { type: 'rect', x: 30, y: 30, w: 60, h: 40, rx: 0 },
    { type: 'text', x: 110, y: 55, text: 'DAYLIGHT', fontSize: 16 }
  ];

  function renderSvg(shiftX, shiftY) {
    let inner = '';
    for (const el of elements) {
      const ex = el.x + shiftX;
      const ey = el.y + shiftY;
      if (el.type === 'rect') {
        inner += `<rect x="${ex}" y="${ey}" width="${el.w}" height="${el.h}" rx="${el.rx || 0}" fill="${fg}"/>`;
      } else if (el.type === 'pill') {
        inner += `<rect x="${ex}" y="${ey}" width="${el.w}" height="${el.h}" rx="${(el.h / 2)}" fill="${fg}"/>`;
      } else if (el.type === 'text') {
        inner += `<text x="${ex}" y="${ey}" font-family="sans-serif" font-size="${el.fontSize || 14}" font-weight="bold" fill="${fg}">${el.text}</text>`;
      }
    }
    return `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${inner}</svg>`;
  }

  const refSvg = renderSvg(0, 0);
  const rendSvg = renderSvg(sx, sy);

  const refBuffer = await sharp(Buffer.from(refSvg)).png().toBuffer();
  const rendBuffer = await sharp(Buffer.from(rendSvg)).png().toBuffer();

  return { refBuffer, rendBuffer };
}

module.exports = {
  extractSobelEdges,
  computeSobelContourAlignment,
  clusterDominantBackground,
  classifyInkPixels,
  computeDynamicInkIoU,
  computeBoundingBoxIoU,
  computeCentroidDrift,
  evaluateAntiDeceptionGuardrails,
  generateSyntheticPair,
  UnimplementedError,
  SkipTestError
};
