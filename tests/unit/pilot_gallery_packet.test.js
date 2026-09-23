'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG: PngImage } = require('pngjs');
const test = require('node:test');
const { sourceContracts } = require('../../tools/pilot/source-contracts');
const { buildPacket, emitPacket, parseArgs, renderMarkdown } = require('../../tools/pilot/build-gallery-packet');

const DESIGN_URLS = {
  'da63f0b2-6919-408a-b3eb-68685f019fe6': 'https://claude.ai/code/artifact/da63f0b2-6919-408a-b3eb-68685f019fe6',
  'e34f4387-f506-4de5-bced-ef318d7f8bdf': 'https://claude.ai/code/artifact/e34f4387-f506-4de5-bced-ef318d7f8bdf'
};
const PNG = PngImage.sync.write(new PngImage({ width: 20, height: 20 }));
const PNG_HASH = crypto.createHash('sha256').update(PNG).digest('hex');

function appModel(root, includeSeam = true) {
  const names = includeSeam ? ['PadChrome', 'PadService', 'GlassPadView'] : ['PadChrome', 'PadService'];
  return {
    schemaVersion: '1.0.0', kind: 'ExistingAppModel', id: 'fixture.note-overlay', claimScope: 'LEXICAL_EVIDENCE_WITH_UNCERTAINTY',
    provenance: {
      repository: { root: path.join(root, 'app-repository'), remoteUrl: null },
      revision: { vcs: 'git', commit: 'a'.repeat(40), dirty: false },
      evidence: names.map((name, index) => ({ id: `evidence.${name}`, path: `app/src/${name}.java`, sha256: String(index).padStart(64, '0') }))
    },
    uiSymbols: names.map((name, index) => ({ qualifiedName: `fixture.${name}`, location: { path: `app/src/${name}.java`, line: index + 1 }, evidenceRefs: [`evidence.${name}`] }))
  };
}

function makeManifest(root, designId, orientation) {
  const directory = path.join(root, `${designId}-${orientation.toLowerCase()}`);
  fs.mkdirSync(directory, { recursive: true });
  const contract = sourceContracts[designId];
  const sections = Object.entries(contract.sections).map(([id, figureCount]) => ({
    id, heading: `Heading ${id}`, figureCount, controls: [`control-${id}`]
  }));
  const refs = [];
  if (designId.startsWith('da63')) refs.push({ id: 'root', heading: 'Floating toolbar', sectionId: 'root', figureIndex: null });
  else for (const section of sections) {
    refs.push({ id: section.id, heading: section.heading, sectionId: section.id, figureIndex: null });
    for (let i = 1; i <= section.figureCount; i += 1) refs.push({ id: `${section.id}/figure-${i}`, heading: `Figure ${i}`, sectionId: section.id, figureIndex: i });
  }
  const captures = refs.map((ref, index) => {
    const file = `${String(index + 1).padStart(3, '0')}.png`;
    fs.writeFileSync(path.join(directory, file), PNG);
    return {
      ...ref,
      path: file,
      captureMode: designId.startsWith('da63') ? 'IFRAME_ELEMENT' : 'LIVE_DOM_ELEMENT',
      geometry: { cssRect: { x: 0, y: 0, width: 10, height: 10 }, scrollOffset: { x: 0, y: 0 }, elementScrollSize: { width: 10, height: 10 } },
      pixelSize: { width: 20, height: 20 }, sha256: PNG_HASH
    };
  });
  const viewport = orientation === 'LANDSCAPE' ? { width: 1200, height: 900, deviceScaleFactor: 2 } : { width: 900, height: 1200, deviceScaleFactor: 2 };
  fs.writeFileSync(path.join(directory, 'capture-manifest.json'), JSON.stringify({
    kind: 'ClaudeDesignSectionCapture', source: DESIGN_URLS[designId], capturedAt: 'ignored', viewport,
    artifactViewport: { width: viewport.width, height: viewport.height - 40 },
    sourceTextSha256: contract.sourceTextSha256, discoveredSectionCount: sections.length,
    sections, captures
  }));
  return directory;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-gallery-packet-'));
  const manifests = [
    makeManifest(root, 'da63f0b2-6919-408a-b3eb-68685f019fe6', 'LANDSCAPE'),
    makeManifest(root, 'da63f0b2-6919-408a-b3eb-68685f019fe6', 'PORTRAIT'),
    makeManifest(root, 'e34f4387-f506-4de5-bced-ef318d7f8bdf', 'LANDSCAPE'),
    makeManifest(root, 'e34f4387-f506-4de5-bced-ef318d7f8bdf', 'PORTRAIT')
  ];
  const modelPath = path.join(root, 'app-model.json');
  fs.writeFileSync(modelPath, JSON.stringify(appModel(root)));
  return { root, manifests, modelPath, output: path.join(root, 'packet') };
}

function makeSpec(root, designId) {
  const directory = path.join(root, `spec-${designId}`);
  fs.mkdirSync(path.join(directory, 'assets/vectors'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'assets/fonts'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'assets/vectors/pen.svg'), '<svg/>');
  fs.writeFileSync(path.join(directory, 'assets/fonts/font.woff2'), 'synthetic font bytes');
  fs.writeFileSync(path.join(directory, 'assets/fonts/font_manifest.json'), JSON.stringify([{ path: 'assets/fonts/font.woff2' }]));
  const specPath = path.join(directory, 'design_spec.json');
  const spec = {
    version: '1.0.0', metadata: { source: DESIGN_URLS[designId], generator: 'synthetic-test-extractor', timestamp: 'fixture' },
    theme: { colors: { primary: '#111111', background: '#ffffff', surface: '#eee' }, typography: { fontFamily: 'Example' } },
    vectors: [{ id: 'v1', assetPath: 'assets/vectors/pen.svg' }, { id: 'v2', assetPath: 'assets/vectors/pen.svg' }],
    viewportScenes: { desktop: { hierarchy: { id: 'root', style: { backgroundColor: '#ffffff' }, children: [
      { id: 'text', text: { content: 'Example', fontFamily: 'Example', fontSize: 14, color: '#111111' }, style: { color: '#111111' }, children: [] }
    ] } } }
  };
  fs.writeFileSync(specPath, JSON.stringify(spec));
  return { specPath, spec };
}

test('requires four distinct manifests and explicit app model/output', () => {
  assert.throws(() => parseArgs(['--manifest', '/tmp/a', '--app-model', '/tmp/m', '--output', '/tmp/o']), /Usage/);
});

test('builds deterministic exact scene inventory with references, controls and blocked gates', () => {
  const f = fixture();
  try {
    const options = { manifests: f.manifests, appModel: f.modelPath };
    const first = buildPacket(options);
    const second = buildPacket(options);
    assert.deepEqual(first, second);
    assert.deepEqual(first, buildPacket({ ...options, manifests: [...f.manifests].reverse() }));
    assert.equal(first.designs.length, 2);
    assert.equal(first.designs.find(item => item.designId.includes('e34f')).sceneCount, 68);
    assert.equal(first.scenes.find(scene => scene.sceneId === '1a/figure-1').references.length, 2);
    assert.equal(first.scenes.find(scene => scene.sceneId === '1a/figure-1').controls[0], 'control-1a');
    assert.match(first.scenes[0].references[0].screenshot.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(first.app.seamCandidates.map(seam => seam.confidence), Array(3).fill('HIGH_UNCERTAINTY'));
    assert.ok(Object.values(first.gates).filter(value => value === 'BLOCKED').length >= 5);
    assert.match(renderMarkdown(first), /hand-coded gallery does not prove translator success/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('adds bounded computed style, vector, and font evidence without claiming source revision parity', () => {
  const f = fixture();
  try {
    const specs = Object.keys(DESIGN_URLS).map(id => makeSpec(f.root, id).specPath);
    const options = { manifests: f.manifests, appModel: f.modelPath, designSpecs: specs };
    const packet = buildPacket(options);
    assert.deepEqual(packet, buildPacket({ ...options, designSpecs: [...specs].reverse() }));
    assert.equal(packet.designStyleEvidence.length, 2);
    const style = packet.designStyleEvidence[0];
    assert.equal(style.provenance.captureRevisionMatch, 'UNVERIFIED');
    assert.match(style.provenance.specSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(style.computedStyle.fontFamilies, [{ value: 'Example', count: 1 }]);
    assert.equal(style.vectors.entries, 2);
    assert.equal(style.vectors.uniqueAssets, 1);
    assert.equal(style.vectors.availableAssets, 1);
    assert.equal(style.fonts.availableAssets, 1);
    assert.match(renderMarkdown(packet), /Capture revision: UNVERIFIED/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('fails closed on duplicate, wrong-source, unsafe or missing style evidence', () => {
  const f = fixture();
  try {
    const [first, second] = Object.keys(DESIGN_URLS).map(id => makeSpec(f.root, id));
    const options = { manifests: f.manifests, appModel: f.modelPath, designSpecs: [first.specPath, second.specPath] };
    assert.throws(() => parseArgs(['--manifest', ...f.manifests.flatMap(m => [m, '--manifest']).slice(0, -1), '--app-model', f.modelPath, '--output', f.output, '--design-spec', first.specPath]), /two distinct/);
    assert.throws(() => buildPacket({ ...options, designSpecs: [first.specPath, first.specPath] }), /distinct/);
    fs.writeFileSync(second.specPath, JSON.stringify({ ...second.spec, metadata: { source: DESIGN_URLS[Object.keys(DESIGN_URLS)[0]] } }));
    assert.throws(() => buildPacket(options), /cover each captured design exactly once/);
    fs.writeFileSync(second.specPath, JSON.stringify({ ...second.spec, metadata: { source: 'https://example.com/bad' } }));
    assert.throws(() => buildPacket(options), /wrong source/);
    fs.writeFileSync(second.specPath, JSON.stringify({ ...second.spec, vectors: [{ assetPath: '../../secret.svg' }] }));
    assert.throws(() => buildPacket(options), /Unsafe vectors asset path/);
    fs.writeFileSync(second.specPath, JSON.stringify(second.spec));
    fs.unlinkSync(path.join(path.dirname(first.specPath), 'assets/vectors/pen.svg'));
    const packet = buildPacket(options);
    assert.equal(packet.designStyleEvidence.find(style => style.designId === Object.keys(DESIGN_URLS)[0]).vectors.availableAssets, 0);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects a portrait and landscape inventory mismatch even with valid capture manifests', () => {
  const f = fixture();
  try {
    const target = path.join(f.manifests[3], 'capture-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
    manifest.sections[0].controls = ['changed-control'];
    fs.writeFileSync(target, JSON.stringify(manifest));
    assert.throws(() => buildPacket({ manifests: f.manifests, appModel: f.modelPath }), /inventory mismatch/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rejects missing/bad manifest evidence and incomplete app seam', () => {
  const f = fixture();
  try {
    assert.throws(() => buildPacket({ manifests: f.manifests.slice(1), appModel: f.modelPath }), /requires exactly one portrait and one landscape/);
    const bad = path.join(f.root, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'capture-manifest.json'), '{');
    assert.throws(() => buildPacket({ manifests: [bad, ...f.manifests.slice(1)], appModel: f.modelPath }));
    assert.throws(() => buildPacket({ manifests: [path.join(f.root, 'missing'), ...f.manifests.slice(1)], appModel: f.modelPath }));
    fs.writeFileSync(f.modelPath, JSON.stringify(appModel(f.root, false)));
    assert.throws(() => buildPacket({ manifests: f.manifests, appModel: f.modelPath }), /GlassPadView/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('emits only into a fresh output directory and rejects collisions without overwriting', () => {
  const f = fixture();
  try {
    const packet = buildPacket({ manifests: f.manifests, appModel: f.modelPath });
    emitPacket(packet, f.output, [...f.manifests, f.modelPath], appModel(f.root).provenance.repository.root);
    const json = fs.readFileSync(path.join(f.output, 'gallery-packet.json'), 'utf8');
    assert.equal(JSON.parse(json).kind, 'NativeGalleryImplementationPacket');
    assert.equal(fs.readFileSync(path.join(f.output, 'gallery-packet.md'), 'utf8'), renderMarkdown(packet));
    assert.throws(() => emitPacket(packet, f.output), /already exists/);
    assert.equal(fs.readFileSync(path.join(f.output, 'gallery-packet.json'), 'utf8'), json);
    assert.throws(() => emitPacket(packet, path.join(f.root, 'app-repository', 'nested'), [], appModel(f.root).provenance.repository.root), /outside/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
