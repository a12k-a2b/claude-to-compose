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
 * Computes ink center-of-mass (centroid) for non-white pixels (luminance < 250).
 */
function computeInkCentroid(png, width, height) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];

      // Detect ink (non-white, opaque)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (a > 50 && lum < 245) {
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
 * Computes Ink IoU and Ink Dice strictly for non-white ink pixels (luminance < 245).
 */
function computeZonalInkMetrics(refPng, renderedPng, width, height) {
  let refInk = 0;
  let renderedInk = 0;
  let intersection = 0;
  let union = 0;

  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const rA = refPng.data[idx];
    const gA = refPng.data[idx + 1];
    const bA = refPng.data[idx + 2];
    const aA = refPng.data[idx + 3];

    const rB = renderedPng.data[idx];
    const gB = renderedPng.data[idx + 1];
    const bB = renderedPng.data[idx + 2];
    const aB = renderedPng.data[idx + 3];

    const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
    const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

    const isInkA = aA > 50 && lumA < 245;
    const isInkB = aB > 50 && lumB < 245;

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
    refInkCount: refInk,
    renderedInkCount: renderedInk,
    inkIntersection: intersection,
    inkUnion: union
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
  const outputDir = options.outputDir || 'verification';
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
    const zoneInkMetrics = computeZonalInkMetrics(refZonePng, renderedZonePng, width, zoneHeight);

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

  // Draw zone divider guides on diff image
  const annotatedDiffPng = new PNG({ width, height });
  fullDiffPng.data.copy(annotatedDiffPng.data);

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

  const zonalDiffPath = path.join(outputDir, 'zonal_diff_overlay.png');
  fs.writeFileSync(zonalDiffPath, PNG.sync.write(annotatedDiffPng));

  const globalInkMetrics = computeZonalInkMetrics(normRefPng, normRenderedPng, width, height);

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
    zonalDiffOverlay: zonalDiffPath
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
    .option('--threshold <number>', 'Pixelmatch threshold [0.01-0.5]', parseFloat, 0.1)
    .option('--min-similarity <number>', 'Minimum global similarity percentage required to pass', parseFloat)
    .option('--min-ink-iou <number>', 'Minimum global ink IoU percentage required to pass', parseFloat)
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
        console.log(`Global Ink IoU: ${res.globalInkIou}% | Global Ink Dice: ${res.globalInkDice}%\n`);
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
  computeZonalInkMetrics
};
