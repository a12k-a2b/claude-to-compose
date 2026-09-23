#!/usr/bin/env node
'use strict';

// Assemble source evidence and app seam clues for a coding agent. This command
// deliberately does not claim that any native implementation is faithful.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyCaptureManifest } = require('./verify-scene-captures');
const { atomicWriteNoFollow, canonicalPlannedPath, isInside, rejectDangerousRoot, resolveExplicit } = require('../../retrofit/safety');

const EXPECTED_DESIGNS = new Set([
  'da63f0b2-6919-408a-b3eb-68685f019fe6',
  'e34f4387-f506-4de5-bced-ef318d7f8bdf'
]);
const SEAM_NAMES = ['PadChrome', 'PadService', 'GlassPadView'];
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function parseArgs(argv) {
  const options = { manifests: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--manifest') options.manifests.push(path.resolve(value));
    else if (flag === '--app-model') options.appModel = path.resolve(value);
    else if (flag === '--output') options.output = path.resolve(value);
    else throw new Error(`Unknown option ${flag}`);
    i += 1;
  }
  if (options.manifests.length !== 4 || !options.appModel || !options.output) {
    throw new Error('Usage: build-gallery-packet --manifest <dir> --manifest <dir> --manifest <dir> --manifest <dir> --app-model <ExistingAppModel.json> --output <new-directory>');
  }
  if (new Set(options.manifests).size !== 4) throw new Error('Exactly four distinct capture manifest directories are required');
  rejectDangerousRoot(options.output, '--output');
  return options;
}

function readJson(file, label) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (_) { throw new Error(`${label} is missing: ${file}`); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file: ${file}`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
}

function seamCandidates(appModel) {
  if (!appModel || appModel.kind !== 'ExistingAppModel' || !Array.isArray(appModel.uiSymbols)
      || !appModel.provenance?.revision || !Array.isArray(appModel.provenance?.evidence)) {
    throw new Error('App model must be an ExistingAppModel with uiSymbols and provenance evidence');
  }
  return SEAM_NAMES.map(name => {
    const found = appModel.uiSymbols.filter(symbol => symbol.qualifiedName?.split('.').pop() === name);
    if (!found.length) throw new Error(`App model does not identify required UI/host symbol ${name}`);
    return {
      name,
      confidence: 'HIGH_UNCERTAINTY',
      status: 'CANDIDATE_REQUIRES_SOURCE_REVIEW',
      evidenceRefs: [...new Set(found.flatMap(symbol => symbol.evidenceRefs || []))].sort(),
      observedLocations: [...new Set(found.map(symbol => symbol.location?.path).filter(Boolean))].sort(),
      reason: 'Lexical ExistingAppModel evidence only; it does not establish runtime ownership, call direction, or safe retrofit boundaries.'
    };
  });
}

function readManifest(directory) {
  const summary = verifyCaptureManifest(directory);
  const manifestPath = path.join(directory, 'capture-manifest.json');
  const manifest = readJson(manifestPath, 'Capture manifest');
  const match = new URL(summary.source).pathname.match(/\/code\/artifact\/([0-9a-f-]{36})$/);
  const designId = match?.[1];
  if (!EXPECTED_DESIGNS.has(designId)) throw new Error(`Unsupported design source in ${manifestPath}`);
  const { width, height } = manifest.viewport;
  const orientation = width > height ? 'LANDSCAPE' : width < height ? 'PORTRAIT' : 'SQUARE';
  if (orientation === 'SQUARE') throw new Error(`Capture viewport must be portrait or landscape: ${manifestPath}`);
  const captures = manifest.captures.map(capture => ({
    id: capture.id,
    sectionId: capture.sectionId || capture.id.split('/')[0],
    figureIndex: capture.figureIndex ?? (capture.id.includes('/figure-') ? Number(capture.id.split('/figure-')[1]) : null),
    heading: capture.heading || '',
    path: capture.path,
    sha256: capture.sha256,
    captureMode: capture.captureMode,
    geometry: capture.geometry,
    pixelSize: capture.pixelSize
  }));
  return { designId, orientation, manifest, captures, manifestDirectory: path.resolve(directory), manifestSha256: crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex') };
}

function buildPacket(options) {
  const manifests = options.manifests.map(readManifest).sort((a, b) => compareText(a.designId, b.designId) || compareText(a.orientation, b.orientation));
  const grouped = new Map();
  for (const item of manifests) {
    const group = grouped.get(item.designId) || [];
    group.push(item);
    grouped.set(item.designId, group);
  }
  if (grouped.size !== 2 || [...grouped.keys()].some(id => !EXPECTED_DESIGNS.has(id))) {
    throw new Error('The four manifests must include both supplied designs');
  }
  for (const [id, items] of grouped) {
    const orientations = items.map(item => item.orientation).sort();
    if (items.length !== 2 || orientations.join(',') !== 'LANDSCAPE,PORTRAIT') {
      throw new Error(`Design ${id} requires exactly one portrait and one landscape manifest`);
    }
  }
  const appModel = readJson(options.appModel, 'ExistingAppModel');
  const seams = seamCandidates(appModel);
  const sceneMap = new Map();
  for (const item of manifests) {
    const sections = new Map((item.manifest.sections || []).map(section => [section.id, section]));
    for (const capture of item.captures) {
      const scene = sceneMap.get(`${item.designId}:${capture.id}`) || {
        designId: item.designId,
        sceneId: capture.id,
        sectionId: capture.sectionId,
        variant: capture.figureIndex == null ? 'SECTION' : `FIGURE_${capture.figureIndex}`,
        heading: capture.heading,
        controls: sections.get(capture.sectionId)?.controls || [],
        references: []
      };
      scene.references.push({
        orientation: item.orientation,
        sourceTextSha256: item.manifest.sourceTextSha256,
        sourceUrl: item.manifest.source,
        manifestSha256: item.manifestSha256,
        viewport: item.manifest.viewport,
        artifactViewport: item.manifest.artifactViewport,
        manifestDirectory: item.manifestDirectory,
        screenshot: { ...capture, filePath: path.resolve(item.manifestDirectory, capture.path) }
      });
      scene.references.sort((a, b) => compareText(a.orientation, b.orientation));
      sceneMap.set(`${item.designId}:${capture.id}`, scene);
    }
  }
  const scenes = [...sceneMap.values()].sort((a, b) => compareText(a.designId, b.designId) || compareText(a.sceneId, b.sceneId));
  const sourceHashes = [...new Set(manifests.map(item => item.manifest.sourceTextSha256))].sort();
  return {
    schemaVersion: '1.0.0',
    kind: 'NativeGalleryImplementationPacket',
    claimScope: 'REFERENCE_INVENTORY_AND_LEXICAL_APP_CLUES_ONLY',
    app: {
      modelId: appModel.id || null,
      repositoryRevision: appModel.provenance.revision.commit || null,
      modelClaimScope: appModel.claimScope || null,
      seamCandidates: seams
    },
    designs: [...grouped.entries()].sort(([a], [b]) => compareText(a, b)).map(([designId, items]) => ({
      designId,
      sourceUrl: items[0].manifest.source,
      sourceTextSha256: items[0].manifest.sourceTextSha256,
      sceneCount: scenes.filter(scene => scene.designId === designId).length,
      orientations: ['LANDSCAPE', 'PORTRAIT']
    })),
    sourceTextHashes: sourceHashes,
    scenes,
    gates: {
      sourceInventory: 'PASS',
      nativeVisualFidelity: 'BLOCKED',
      nativeInteractionCoverage: 'BLOCKED',
      motionAndTiming: 'BLOCKED',
      accessibilityAndInput: 'BLOCKED',
      productionIntegration: 'BLOCKED'
    },
    limitations: [
      'This packet does not prove a native screen matches either reference.',
      'A hand-authored gallery is not evidence that the translator generated the implementation.',
      'Captured controls are source DOM labels only; behavior and motion need separate executable evidence.',
      'Do not copy synthetic article or sample content into Note Overlay.'
    ]
  };
}

function renderMarkdown(packet) {
  const lines = [
    '# Native gallery implementation packet', '',
    '> Evidence packet only. Native fidelity, interactions, motion, accessibility, and production integration remain BLOCKED.', '',
    `App model: ${packet.app.modelId || '(unlabelled)'} at revision ${packet.app.repositoryRevision || '(unknown)'}.`, '',
    '## References', ''
  ];
  for (const design of packet.designs) lines.push(`- ${design.designId}: ${design.sceneCount} exact scene IDs; portrait and landscape; source text SHA-256 ${design.sourceTextSha256}.`);
  lines.push('', '## App seam candidates', '');
  for (const seam of packet.app.seamCandidates) lines.push(`- ${seam.name} — ${seam.status} (${seam.confidence}); locations: ${seam.observedLocations.join(', ') || '(none)'}. ${seam.reason}`);
  lines.push('', '## Scene inventory', '', '| Design | Scene ID | Variant | Heading | Source controls |', '| --- | --- | --- | --- | --- |');
  const tableCell = value => String(value).replace(/\s+/g, ' ').replaceAll('|', '\\|');
  for (const scene of packet.scenes) lines.push(`| ${scene.designId} | ${scene.sceneId} | ${scene.variant} | ${tableCell(scene.heading)} | ${tableCell(scene.controls.join(', '))} |`);
  lines.push('', 'Each scene has portrait and landscape reference records in the JSON packet, including source hashes, viewport identity, screenshot hash, capture geometry, and screenshot path.', '', '## Gate state', '');
  for (const [name, state] of Object.entries(packet.gates)) lines.push(`- ${name}: **${state}**`);
  lines.push('', 'The current standalone hand-coded gallery does not prove translator success. Native visual comparison, working state transitions, timestamped motion evidence, accessibility/input checks, and a protected production retrofit review are still required.', '');
  return lines.join('\n');
}

function emitPacket(packet, output, protectedPaths = [], appRoot = null) {
  const root = resolveExplicit(output, '--output');
  rejectDangerousRoot(root, '--output');
  if (fs.existsSync(root)) throw new Error(`Output already exists; choose a fresh directory: ${root}`);
  const canonicalOutput = canonicalPlannedPath(root);
  for (const protectedPath of protectedPaths) {
    const canonicalInput = canonicalPlannedPath(path.resolve(protectedPath));
    if (canonicalInput === canonicalOutput || isInside(canonicalInput, canonicalOutput) || isInside(canonicalOutput, canonicalInput)) {
      throw new Error(`Output overlaps a protected input: ${protectedPath}`);
    }
  }
  if (appRoot) {
    const canonicalApp = canonicalPlannedPath(appRoot);
    if (canonicalOutput === canonicalApp || isInside(canonicalApp, canonicalOutput)) throw new Error('Output must be outside the inspected app repository');
  }
  fs.mkdirSync(root, { recursive: false });
  atomicWriteNoFollow(path.join(root, 'gallery-packet.json'), `${JSON.stringify(packet, null, 2)}\n`);
  atomicWriteNoFollow(path.join(root, 'gallery-packet.md'), renderMarkdown(packet));
  return root;
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const packet = buildPacket(options);
  const appModel = readJson(options.appModel, 'ExistingAppModel');
  emitPacket(packet, options.output, [...options.manifests, options.appModel], appModel.provenance.repository.root);
  process.stdout.write(`Emitted ${packet.scenes.length} source scenes; native fidelity and UX gates remain BLOCKED.\n`);
}

if (require.main === module) {
  try { run(); } catch (error) { console.error(`gallery packet failed: ${error.message}`); process.exitCode = 3; }
}

module.exports = { buildPacket, emitPacket, parseArgs, renderMarkdown, run };
