'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { PNG } = require('pngjs');
const { compare } = require('../../tools/pilot/compare-native-reference');
const { sourceContracts } = require('../../tools/pilot/source-contracts');
const { buildRepairPacket, emitPacket, parseArgs, renderMarkdown } = require('../../tools/pilot/build-visual-repair-packet');

const ID = 'da63f0b2-6919-408a-b3eb-68685f019fe6';
const URL = `https://claude.ai/code/artifact/${ID}`;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function png(rgb) {
  const image = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = rgb[0]; image.data[i + 1] = rgb[1]; image.data[i + 2] = rgb[2]; image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}

async function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-repair-')));
  const captures = path.join(root, 'captures');
  fs.mkdirSync(captures);
  const source = path.join(captures, 'root.png');
  const native = path.join(root, 'native.png');
  const negative = path.join(root, 'negative.png');
  const sourceBytes = png([255, 255, 255]);
  fs.writeFileSync(source, sourceBytes);
  fs.writeFileSync(native, png([245, 245, 245]));
  fs.writeFileSync(negative, png([255, 0, 255]));
  const geometry = { cssRect: { x: 0, y: 0, width: 4, height: 4 }, scrollOffset: { x: 0, y: 0 }, elementScrollSize: { width: 4, height: 4 } };
  const viewport = { width: 4, height: 3, deviceScaleFactor: 2 };
  const capture = { id: 'root', sectionId: 'root', figureIndex: null, heading: 'Synthetic toolbar', path: 'root.png',
    sha256: hash(sourceBytes), captureMode: 'IFRAME_ELEMENT', geometry, pixelSize: { width: 8, height: 8 } };
  const manifestPath = path.join(captures, 'capture-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ kind: 'ClaudeDesignSectionCapture', source: URL,
    sourceTextSha256: sourceContracts[ID].sourceTextSha256, viewport, artifactViewport: { width: 4, height: 4 },
    discoveredSectionCount: 0, sections: [], captures: [capture] }));
  const registration = { referenceSha256: hash(sourceBytes), width: 8, height: 8,
    regions: [{ id: 'toolbar', x: 0, y: 0, width: 8, height: 8, maxMae: 4 }], status: 'SYNTHETIC_TEST_LIMIT' };
  const gallery = { kind: 'NativeGalleryImplementationPacket', gates: { sourceInventory: 'PASS' },
    designs: [{ designId: ID, sourceUrl: URL, sourceTextSha256: sourceContracts[ID].sourceTextSha256 }],
    designStyleEvidence: [], scenes: [{ designId: ID, sceneId: 'root', references: [{ orientation: 'LANDSCAPE',
      sourceUrl: URL, sourceTextSha256: sourceContracts[ID].sourceTextSha256,
      manifestDirectory: captures, manifestSha256: hash(fs.readFileSync(manifestPath)), viewport,
      artifactViewport: { width: 4, height: 4 }, screenshot: { ...capture, filePath: source } }] }] };
  const galleryPath = path.join(root, 'gallery.json');
  fs.writeFileSync(galleryPath, JSON.stringify(gallery));
  const report = await compare({ reference: source, candidate: native, negatives: { toolbar: negative }, regions: registration.regions });
  const comparisonPath = path.join(root, 'comparison.json');
  fs.writeFileSync(comparisonPath, JSON.stringify(report));
  const options = { gallerypacket: galleryPath, comparison: comparisonPath, designid: ID, sceneid: 'root',
    orientation: 'LANDSCAPE', negatives: { toolbar: negative }, output: path.join(root, 'repair') };
  const registrations = { [`${ID}:root:LANDSCAPE`]: registration };
  return { root, captures, source, native, negative, galleryPath, comparisonPath, gallery, report, registration, registrations, options };
}

test('makes a deterministic FAIL repair task after verifying hashes, source capture, metrics and control', async () => {
  const f = await fixture();
  try {
    const packet = await buildRepairPacket(f.options, f.registrations);
    assert.deepEqual(packet, await buildRepairPacket(f.options, f.registrations));
    assert.equal(packet.outcome, 'FAIL');
    assert.equal(packet.source.screenshot.sha256, hash(fs.readFileSync(f.source)));
    assert.equal(packet.failingRegions[0].negativeControlOutcome, 'PASS');
    assert.equal(packet.failingRegions[0].candidateMae, 10);
    assert.match(renderMarkdown(packet), /No auto-generation, visual parity, behavior, or production readiness is claimed/);
    emitPacket(packet, f.options.output, [f.galleryPath, f.comparisonPath, f.captures, f.native, f.negative]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.options.output, 'repair-packet.json'))), packet);
    assert.throws(() => emitPacket(packet, f.options.output, []), /already exists/);
    assert.throws(() => emitPacket(packet, path.join(f.captures, 'nested'), [f.captures]), /overlaps/);
    const symlink = path.join(f.root, 'linked');
    fs.symlinkSync(f.root, symlink);
    assert.throws(() => emitPacket(packet, path.join(symlink, 'output'), []), /symlinked parent/);
    const dangling = path.join(f.root, 'dangling');
    fs.symlinkSync(path.join(f.root, 'missing'), dangling);
    assert.throws(() => emitPacket(packet, dangling, []), /symlink/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects PASS, unregistered orientation, wrong reference, thresholds, and forged report numbers', async () => {
  const f = await fixture();
  try {
    const write = report => fs.writeFileSync(f.comparisonPath, JSON.stringify(report));
    write({ ...f.report, outcome: 'PASS' });
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /FAIL or BLOCKED/);
    write(f.report);
    await assert.rejects(buildRepairPacket({ ...f.options, orientation: 'PORTRAIT' }, f.registrations), /orientation|registered/);
    write({ ...f.report, reference: { ...f.report.reference, sha256: 'a'.repeat(64) } });
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /registered scene screenshot/);
    write({ ...f.report, regions: [{ ...f.report.regions[0], maxMae: 11 }] });
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /thresholds differ/);
    write({ ...f.report, regions: [{ ...f.report.regions[0], candidateMae: 0 }] });
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /could not be reproduced/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects changed source/native bytes, wrong negative, and damaged manifest', async () => {
  const f = await fixture();
  try {
    fs.writeFileSync(f.native, png([244, 244, 244]));
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /Native screenshot byte hash mismatch/);
    fs.writeFileSync(f.native, png([245, 245, 245]));
    fs.writeFileSync(f.negative, png([255, 255, 255]));
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /could not be reproduced/);
    fs.writeFileSync(f.negative, png([255, 0, 255]));
    fs.writeFileSync(path.join(f.captures, 'capture-manifest.json'), '{}');
    await assert.rejects(buildRepairPacket(f.options, f.registrations), /Capture manifest byte hash mismatch/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('CLI requires exact identity and rejects duplicate options', () => {
  const common = ['--gallery-packet', '/tmp/gallery.json', '--comparison', '/tmp/comparison.json', '--design-id', ID,
    '--scene-id', 'root', '--orientation', 'LANDSCAPE', '--negative', 'toolbar:/tmp/wrong.png', '--output', '/tmp/repair'];
  assert.equal(parseArgs(common).sceneid, 'root');
  assert.throws(() => parseArgs([...common, '--scene-id', 'root']), /duplicate/);
  assert.throws(() => parseArgs(common.filter((_, index) => index < common.length - 2)), /Required/);
  assert.throws(() => parseArgs([...common, '--negative', 'toolbar:/tmp/other.png']), /unique/);
});
