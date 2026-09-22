/**
 * src/baseline/preview_capture.js
 * Captures, hashes (SHA-256), and catalogs pre-existing Robolectric/Compose
 * preview bitmaps and native telemetry trees.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function captureBaselinePreviews(projectPath, moduleName = 'app') {
  const previewDirs = [
    path.resolve(projectPath, moduleName, 'build/outputs/preview'),
    path.resolve(projectPath, 'build/outputs/preview')
  ];

  let activeDir = null;
  for (const dir of previewDirs) {
    if (fs.existsSync(dir)) {
      activeDir = dir;
      break;
    }
  }

  if (!activeDir) {
    return {
      captured: false,
      previews: [],
      semantics: { captured: false, nodesCount: 0 },
      note: 'No preview output directory discovered in build/outputs/preview'
    };
  }

  const imageFiles = fs.readdirSync(activeDir).filter(f => f.endsWith('.png'));
  const previews = [];

  for (const file of imageFiles) {
    const filePath = path.join(activeDir, file);
    const buffer = fs.readFileSync(filePath);
    const sha256 = computeSha256(buffer);
    const image = sharp(buffer);
    const meta = await image.metadata();

    previews.push({
      name: file,
      path: filePath,
      sha256,
      width: meta.width,
      height: meta.height,
      channels: meta.channels
    });
  }

  // Check for native_telemetry.json or semantics dump
  const telemetryPath = path.join(activeDir, 'native_telemetry.json');
  let semantics = { captured: false, nodesCount: 0 };
  if (fs.existsSync(telemetryPath)) {
    const telemetryContent = fs.readFileSync(telemetryPath, 'utf8');
    const parsed = JSON.parse(telemetryContent);
    const nodesCount = Object.keys(parsed).length;
    const treeHash = computeSha256(Buffer.from(JSON.stringify(parsed, Object.keys(parsed).sort())));
    semantics = {
      captured: true,
      treeHash,
      nodesCount,
      filePath: telemetryPath
    };
  }

  return {
    captured: previews.length > 0,
    previews,
    semantics
  };
}

module.exports = {
  computeSha256,
  captureBaselinePreviews
};
