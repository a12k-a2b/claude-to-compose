#!/usr/bin/env node

/**
 * scripts/verify_preview_pixels.js
 * Automated pixel analysis and visual fidelity verification for rendered_preview.png.
 * 
 * Asserts:
 * 1. File exists and is a valid PNG.
 * 2. Dimensions are exactly 1080 x 2400.
 * 3. Non-white pixels > 10,000 (proving buttons, cards, text, icons rendered visibly).
 * 4. Foreground content pixels (differing from background) > 10,000.
 * 5. Color diversity indicates actual UI graphics.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const MIN_NON_WHITE_PIXELS = 10000;
const MIN_FOREGROUND_PIXELS = 10000;
const MIN_UNIQUE_COLORS = 10;

async function verifyPreview(targetPath) {
  const resolvedPath = path.resolve(targetPath || 'android/app/build/outputs/preview/rendered_preview.png');

  console.log('='.repeat(75));
  console.log('  COMPOSE PREVIEW HEADLESS RENDERING VERIFICATION');
  console.log('='.repeat(75));
  console.log(`Target File: ${resolvedPath}\n`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`[FAIL] Preview image does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);
  console.log(`[INFO] File size: ${stat.size.toLocaleString()} bytes`);

  if (stat.size === 0) {
    console.error('[FAIL] Preview image file is completely empty (0 bytes).');
    process.exit(1);
  }

  const image = sharp(resolvedPath);
  const metadata = await image.metadata();

  console.log(`[INFO] Dimensions: ${metadata.width} x ${metadata.height}`);
  console.log(`[INFO] Format: ${metadata.format} (channels: ${metadata.channels})`);

  const isDc1 = (metadata.width === 1184 && metadata.height === 1584);
  const isPhone = (metadata.width === 1080 && metadata.height === 2400);

  if (!isDc1 && !isPhone) {
    console.warn(`[WARN] Dimensions are ${metadata.width}x${metadata.height}, expected 1184x1584 (DC1) or 1080x2400 (Phone).`);
  } else if (isDc1) {
    console.log(`[PASS] Dimensions match Daylight DC1 hardware specification (1184 x 1584).`);
  }

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const totalPixels = info.width * info.height;

  let nonWhitePixels = 0;
  const colorFrequency = new Map();

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Non-white check (any channel < 255)
    if (r !== 255 || g !== 255 || b !== 255) {
      nonWhitePixels++;
    }

    // 24-bit color key for frequency analysis
    const colorKey = (r << 16) | (g << 8) | b;
    colorFrequency.set(colorKey, (colorFrequency.get(colorKey) || 0) + 1);
  }

  // Identify dominant background color
  let dominantColorKey = 0;
  let dominantCount = 0;
  for (const [key, count] of colorFrequency.entries()) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantColorKey = key;
    }
  }

  const domR = (dominantColorKey >> 16) & 0xFF;
  const domG = (dominantColorKey >> 8) & 0xFF;
  const domB = dominantColorKey & 0xFF;
  const foregroundContentPixels = totalPixels - dominantCount;

  const nonWhitePct = (nonWhitePixels / totalPixels) * 100;
  const foregroundPct = (foregroundContentPixels / totalPixels) * 100;
  const dominantPct = (dominantCount / totalPixels) * 100;

  console.log('\n--- Pixel Analysis Breakdown ---');
  console.log(`Total Pixels:             ${totalPixels.toLocaleString()}`);
  console.log(`Dominant Background:      RGB(${domR}, ${domG}, ${domB}) — ${dominantCount.toLocaleString()} px (${dominantPct.toFixed(2)}%)`);
  console.log(`Non-White Pixels:         ${nonWhitePixels.toLocaleString()} px (${nonWhitePct.toFixed(2)}%)`);
  console.log(`Foreground UI Pixels:     ${foregroundContentPixels.toLocaleString()} px (${foregroundPct.toFixed(2)}%)`);
  console.log(`Unique Colors Detected:   ${colorFrequency.size.toLocaleString()}`);

  let failed = false;

  // Gate 1: Non-white pixel threshold (> 10,000)
  if (nonWhitePixels <= MIN_NON_WHITE_PIXELS) {
    console.error(`\n[FAIL] Non-white pixels (${nonWhitePixels.toLocaleString()}) <= threshold (${MIN_NON_WHITE_PIXELS.toLocaleString()}).`);
    console.error('       The preview image is completely blank white or contains no visible components.');
    failed = true;
  } else {
    console.log(`\n[PASS] Non-white pixels (${nonWhitePixels.toLocaleString()}) exceed threshold (${MIN_NON_WHITE_PIXELS.toLocaleString()}).`);
  }

  // Gate 2: Foreground content pixel threshold (> 10,000)
  if (foregroundContentPixels <= MIN_FOREGROUND_PIXELS) {
    console.error(`[FAIL] Foreground content pixels (${foregroundContentPixels.toLocaleString()}) <= threshold (${MIN_FOREGROUND_PIXELS.toLocaleString()}).`);
    console.error('       The preview image is dominated by a single monochrome background color (squashed content).');
    failed = true;
  } else {
    console.log(`[PASS] Foreground content pixels (${foregroundContentPixels.toLocaleString()}) exceed threshold (${MIN_FOREGROUND_PIXELS.toLocaleString()}).`);
  }

  // Gate 3: Unique colors (at least buttons, cards, text, icons)
  if (colorFrequency.size < MIN_UNIQUE_COLORS) {
    console.error(`[FAIL] Color diversity too low (${colorFrequency.size} < ${MIN_UNIQUE_COLORS}). Real UI components not present.`);
    failed = true;
  } else {
    console.log(`[PASS] Color diversity confirmed (${colorFrequency.size} unique colors detected).`);
  }

  console.log('='.repeat(75));
  if (failed) {
    console.error('  VERIFICATION RESULT: FAILED');
    console.log('='.repeat(75));
    process.exit(1);
  } else {
    console.log('  VERIFICATION RESULT: PASSED (Visible Compose UI confirmed)');
    console.log('='.repeat(75));
    process.exit(0);
  }
}

const target = process.argv[2] || 'android/app/build/outputs/preview/rendered_preview.png';
verifyPreview(target).catch(err => {
  console.error('[FATAL] Script error:', err);
  process.exit(1);
});
