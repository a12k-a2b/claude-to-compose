const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { parseArgs } = require('../../tools/pilot/capture-claude-sections');
const { verifyCaptureManifest } = require('../../tools/pilot/verify-scene-captures');
const { sourceContracts } = require('../../tools/pilot/source-contracts');

const validUrl = 'https://claude.ai/code/artifact/e34f4387-f506-4de5-bced-ef318d7f8bdf';

test('scene capture accepts the supplied design and explicit viewport/section', () => {
  const args = parseArgs([
    '--url', validUrl, '--output', '/tmp/scene-capture-test',
    '--width', '1200', '--height', '900', '--scale', '2', '--section', '6a'
  ]);
  assert.equal(args.width, 1200);
  assert.equal(args.height, 900);
  assert.deepEqual(args.sections, ['6a']);
});

test('scene capture refuses a different destination or artifact', () => {
  assert.throws(() => parseArgs(['--url', 'https://example.com/code/artifact/e34f4387-f506-4de5-bced-ef318d7f8bdf', '--output', '/tmp/x']));
  assert.throws(() => parseArgs(['--url', 'https://claude.ai/code/artifact/00000000-0000-0000-0000-000000000000', '--output', '/tmp/x']));
});

test('scene capture refuses invalid viewport and section input', () => {
  assert.throws(() => parseArgs(['--url', validUrl, '--output', '/tmp/x', '--width', '0']));
  assert.throws(() => parseArgs(['--url', validUrl, '--output', '/tmp/x', '--section', '../escape']));
  assert.throws(() => parseArgs(['--url', validUrl, '--output', '/tmp/x', '--unknown', 'value']));
});

test('frozen exploration inventory has 35 sections and 33 figure captures', () => {
  const sections = sourceContracts['e34f4387-f506-4de5-bced-ef318d7f8bdf'].sections;
  assert.equal(Object.keys(sections).length, 35);
  assert.equal(Object.values(sections).reduce((sum, count) => sum + count, 0), 33);
});

test('capture verification detects a tampered screenshot, not just a populated manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-scenes-'));
  try {
    const original = PNG.sync.write(new PNG({ width: 1, height: 1 }));
    const filename = '01-root.png';
    fs.writeFileSync(path.join(root, filename), original);
    fs.writeFileSync(path.join(root, 'capture-manifest.json'), JSON.stringify({
      kind: 'ClaudeDesignSectionCapture',
      source: 'https://claude.ai/code/artifact/da63f0b2-6919-408a-b3eb-68685f019fe6',
      sourceTextSha256: 'cc3731bf6f0378e66011f209f0caeda86e541aaea3abbb3617ae075514ab6b93',
      viewport: { width: 1200, height: 900, deviceScaleFactor: 2 },
      artifactViewport: { width: 1200, height: 860 },
      discoveredSectionCount: 0,
      sections: [],
      captures: [{
        id: 'root', path: filename, captureMode: 'IFRAME_ELEMENT',
        geometry: { cssRect: { x: 0, y: 40, width: 0.5, height: 0.5 }, scrollOffset: { x: 0, y: 0 } },
        pixelSize: { width: 1, height: 1 },
        sha256: crypto.createHash('sha256').update(original).digest('hex')
      }]
    }));
    assert.equal(verifyCaptureManifest(root).sections, 1);
    const manifestPath = path.join(root, 'capture-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.sourceTextSha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => verifyCaptureManifest(root), /source-text identity/);
    manifest.sourceTextSha256 = sourceContracts['da63f0b2-6919-408a-b3eb-68685f019fe6'].sourceTextSha256;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const altered = new PNG({ width: 1, height: 1 });
    altered.data[0] = 255;
    fs.writeFileSync(path.join(root, filename), PNG.sync.write(altered));
    assert.throws(() => verifyCaptureManifest(root), /hash mismatch/);
    fs.writeFileSync(path.join(root, filename), Buffer.concat([original, Buffer.from('tampered')]));
    assert.throws(() => verifyCaptureManifest(root), /Invalid PNG/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
