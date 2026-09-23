#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { contractForUrl } = require('./source-contracts');

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes) {
  if (bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Invalid PNG signature or truncated chunks');
  }
  let offset = 8;
  let dimensions = null;
  let idat = false;
  let ended = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new Error('Truncated PNG chunk');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length) throw new Error('Invalid PNG chunk boundary');
    const actualCrc = crc32(bytes, offset + 4, offset + 8 + length);
    if (actualCrc !== bytes.readUInt32BE(offset + 8 + length)) throw new Error('PNG chunk CRC mismatch');
    if (type === 'IHDR') {
      if (dimensions || offset !== 8 || length !== 13) throw new Error('Invalid PNG IHDR');
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (!width || !height || width * height > 50_000_000) throw new Error('Invalid PNG dimensions');
      dimensions = { width, height };
    } else if (type === 'IDAT') idat = length > 0 || idat;
    else if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length) throw new Error('Invalid PNG IEND');
      ended = true;
    }
    offset = end;
  }
  if (!dimensions || !idat || !ended) throw new Error('PNG missing IHDR, IDAT, or IEND');
  return dimensions;
}

function verifyCaptureManifest(directory) {
  const root = path.resolve(directory);
  const manifestPath = path.join(root, 'capture-manifest.json');
  if (!fs.lstatSync(manifestPath).isFile()) throw new Error('Capture manifest is not a regular file');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.kind !== 'ClaudeDesignSectionCapture' || !Array.isArray(manifest.captures) || !manifest.captures.length) {
    throw new Error('Invalid capture manifest');
  }
  const contract = contractForUrl(manifest.source).contract;
  if (manifest.sourceTextSha256 !== contract.sourceTextSha256) {
    throw new Error('Capture source-text identity does not match the frozen reference');
  }
  if (!Array.isArray(manifest.sections) || manifest.discoveredSectionCount !== Object.keys(contract.sections).length) {
    throw new Error('Capture section inventory is missing or incomplete');
  }
  const observedSections = Object.fromEntries(manifest.sections.map(section => [section.id, section.figureCount]));
  if (JSON.stringify(observedSections) !== JSON.stringify(contract.sections)) {
    throw new Error('Capture section/figure IDs do not match the frozen reference');
  }
  if (!Number.isSafeInteger(manifest.viewport?.width) || !Number.isSafeInteger(manifest.viewport?.height)
      || !Number.isSafeInteger(manifest.viewport?.deviceScaleFactor)) {
    throw new Error('Missing capture viewport identity');
  }
  if (!Number.isSafeInteger(manifest.artifactViewport?.width) || !Number.isSafeInteger(manifest.artifactViewport?.height)) {
    throw new Error('Missing artifact content viewport identity');
  }
  const ids = new Set();
  for (const capture of manifest.captures) {
    if (!capture.id || ids.has(capture.id)) throw new Error(`Missing or duplicate scene ID: ${capture.id}`);
    ids.add(capture.id);
    if (typeof capture.path !== 'string' || path.basename(capture.path) !== capture.path || !capture.path.endsWith('.png')) {
      throw new Error(`Unsafe capture path for ${capture.id}`);
    }
    const file = path.join(root, capture.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Capture is not a regular file: ${capture.id}`);
    const bytes = fs.readFileSync(file);
    let pixelWidth;
    let pixelHeight;
    try { ({ width: pixelWidth, height: pixelHeight } = pngDimensions(bytes)); }
    catch (error) { throw new Error(`Invalid PNG for ${capture.id}: ${error.message}`); }
    if (!['IFRAME_ELEMENT', 'LIVE_DOM_ELEMENT'].includes(capture.captureMode)
        || capture.pixelSize?.width !== pixelWidth || capture.pixelSize?.height !== pixelHeight
        || !Number.isFinite(capture.geometry?.cssRect?.width) || !Number.isFinite(capture.geometry?.cssRect?.height)
        || !Number.isFinite(capture.geometry?.scrollOffset?.x) || !Number.isFinite(capture.geometry?.scrollOffset?.y)) {
      throw new Error(`Missing or inconsistent capture geometry: ${capture.id}`);
    }
    const scale = manifest.viewport.deviceScaleFactor;
    if (Math.abs(pixelWidth - capture.geometry.cssRect.width * scale) > 5
        || Math.abs(pixelHeight - capture.geometry.cssRect.height * scale) > 5) {
      throw new Error(`Capture pixel/CSS dimensions disagree: ${capture.id}`);
    }
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== capture.sha256) throw new Error(`Capture hash mismatch: ${capture.id}`);
  }
  const sectionIds = manifest.captures.filter(capture => !capture.id.includes('/')).map(capture => capture.id);
  if (sectionIds.length !== manifest.discoveredSectionCount
      && !(manifest.discoveredSectionCount === 0 && sectionIds.length === 1 && sectionIds[0] === 'root')) {
    throw new Error(`Incomplete section coverage: ${sectionIds.length}/${manifest.discoveredSectionCount}`);
  }
  for (const section of manifest.sections) {
    if (!ids.has(section.id)) throw new Error(`Missing section screenshot: ${section.id}`);
    for (let i = 1; i <= section.figureCount; i += 1) {
      if (!ids.has(`${section.id}/figure-${i}`)) throw new Error(`Missing figure screenshot: ${section.id}/figure-${i}`);
    }
  }
  if (manifest.discoveredSectionCount === 0 && !ids.has('root')) throw new Error('Missing root screenshot');
  if (ids.size !== 1 + Object.values(contract.sections).reduce((sum, count) => sum + count, 0)
      && manifest.discoveredSectionCount === 0) throw new Error('Unexpected root capture count');
  if (manifest.discoveredSectionCount > 0
      && ids.size !== manifest.discoveredSectionCount + Object.values(contract.sections).reduce((sum, count) => sum + count, 0)) {
    throw new Error('Missing or extra captured scenes');
  }
  return {
    source: manifest.source,
    viewport: manifest.viewport,
    sections: sectionIds.length,
    figures: manifest.captures.length - sectionIds.length,
    sourceTextSha256: manifest.sourceTextSha256
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: verify-scene-captures <capture-directory>');
    process.stdout.write(`${JSON.stringify(verifyCaptureManifest(process.argv[2]))}\n`);
  } catch (error) {
    console.error(`capture verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyCaptureManifest, pngDimensions };
