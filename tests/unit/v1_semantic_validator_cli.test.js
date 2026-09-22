'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { stableJson } = require('../../retrofit/contract_builder');
const { gitChangedPaths, gitIgnoredSourceEvidence, gitMetadata } = require('../../retrofit/inspect_app');

const REPO = path.resolve(__dirname, '../..');
const CLI = path.join(REPO, 'bin/ctc.js');
const H = (value) => crypto.createHash('sha256').update(value).digest('hex');
const clone = (value) => structuredClone(value);

function write(root, relative, value, raw = false) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const bytes = raw ? Buffer.from(value) : Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(target, bytes);
  return { path: relative, sha256: H(bytes), bytes };
}

function cli(args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }

function prepareP3(options = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-v1-verify-'));
  const android = path.join(base, 'android');
  const root = path.join(base, 'workspace');
  fs.cpSync(path.join(REPO, 'tests/fixtures/retrofit_v1/android-app'), android, { recursive: true });
  fs.chmodSync(path.join(android, 'gradlew'), 0o755);
  const git = (args) => execFileSync('git', ['-C', android, ...args]);
  git(['init', '-q']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'user.name', 'Fixture']);
  git(['add', '.']); git(['commit', '-qm', 'fixture']);
  if (options.dirtyBaseline) fs.appendFileSync(path.join(android, 'app/src/main/java/fixture/app/MainActivity.kt'), '\n// dirty baseline\n');
  assert.equal(cli(['init', '--android', android, '--workspace', root, '--json']).status, 0);
  const appPath = path.join(root, 'app-model.json');
  assert.equal(cli(['inspect-app', '--android', android, '--output', appPath, '--json']).status, 0);
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  const designPath = path.join(root, 'design.json');
  fs.copyFileSync(path.join(REPO, 'tests/fixtures/retrofit_v1/design-spec.json'), designPath);
  const appHash = H(fs.readFileSync(appPath)); const designHash = H(fs.readFileSync(designPath));
  const designRef = `design.${designHash.slice(0, 16)}`;
  const screen = app.uiSymbols.find((x) => x.kind === 'COMPOSABLE' && x.location.path.includes('/app/')) || app.uiSymbols.find((x) => x.kind === 'COMPOSABLE');
  const title = app.uiSymbols.find((x) => x.qualifiedName === 'activity_main#title');
  const action = app.stateActionClues.actions[0]; assert(screen && title && action);
  const correspondence = {
    schemaVersion: '1.0.0', kind: 'CorrespondenceManifest', id: 'correspondence.verify', appModelSha256: appHash, designSpecSha256: designHash,
    elementMappings: [
      ['root', 'design.root', screen], ['title', 'design.title', title], ['save', 'design.save', screen]
    ].map(([name, identity, symbol]) => ({ id: `mapping.${name}`, designIdentity: identity, existingUiSymbolRef: symbol.id, mappingStatus: 'EVIDENCE_BACKED', evidenceRefs: [symbol.evidenceRefs[0], designRef] })),
    actionBindings: [{ id: 'binding.save', designIdentity: 'design.save', event: 'CLICK', bindingStatus: 'VERIFIED_EXISTING', existingActionRef: action.id, evidenceRefs: action.evidenceRefs }],
    capabilities: ['root', 'title', 'save'].map((name) => ({ id: `capability.${name}`, subjectRef: `design.${name}`, status: options.contractBlocked && name === 'root' ? 'UNSUPPORTED_BLOCKING' : 'AGENT_IMPLEMENTATION_REQUIRED', rationale: 'Explicit implementation remains unverified.', evidenceRefs: [designRef] })), uncertainties: []
  };
  const correspondenceFile = write(root, 'correspondence.json', correspondence);
  const requiredContext = {
    id: 'context.main', sceneId: 'scene.note', scenarioId: 'scenario.save', stateId: 'state.ready',
    viewport: { widthPx: 800, heightPx: 600, deviceScaleFactor: 1 }, deviceProfile: 'synthetic-device',
    configuration: { buildVariant: 'debug', locale: 'en-US', theme: 'light', fontScale: 1, orientation: 'LANDSCAPE', reducedMotion: false }
  };
  const behavior = {
    schemaVersion: '1.0.0', kind: 'BehaviorManifest', id: 'behavior.verify', appModelSha256: appHash, designSpecSha256: designHash, correspondenceSha256: correspondenceFile.sha256,
    scenes: ['scene.note'], scenarios: ['scenario.save'], states: ['state.ready'],
    preservationObligations: [{ id: 'preserve.save', category: 'PERSISTENCE', statement: 'Save behavior remains unchanged.', status: 'REQUIRED', sourceEvidenceRefs: action.evidenceRefs, verificationRequirement: 'Replay save against baseline and candidate.' }],
    acceptanceRequirements: [{ id: 'requirement.fixture', description: 'Build, preserve behavior, and meet the visual budget.', domains: ['BUILD', 'BEHAVIOR', 'RENDER'], requiredContexts: [requiredContext], numericBudgets: [{ id: 'budget.ink-iou', metric: options.metricName || 'ink_iou', operator: 'AT_LEAST', threshold: 0.85, unit: options.metricUnit || 'ratio' }], evidenceRefs: [designRef] }],
    implementationBoundary: { allowedPaths: ['app/src/main/java/fixture/app/ui'], prohibitedChanges: ['Do not change persistence.'], verificationCommands: ['./gradlew :app:testDebugUnitTest'] },
    goldenPolicy: { status: 'PRESERVE_EXISTING', statement: 'Preserve existing goldens.', obligationRef: 'preserve.save' }, ownerApprovals: []
  };
  write(root, 'behavior.json', behavior);
  const contractPath = path.join(root, 'contract.json');
  const built = cli(['contract', 'build', '--android', android, '--app-model', appPath, '--design-spec', designPath, '--correspondence', path.join(root, 'correspondence.json'), '--behavior-manifest', path.join(root, 'behavior.json'), '--workspace', root, '--output', contractPath, '--created-at', '2026-09-22T20:00:00.000Z', '--json']);
  assert.equal(built.status, options.contractBlocked ? 2 : 0, built.stderr);
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  return { root, android, app, contract, requirement: contract.acceptanceMatrix.requirements[0], requiredContext };
}

function makeWorkspace(options = {}) {
  const prepared = prepareP3(options);
  const { root, android, app, contract, requirement, requiredContext } = prepared;
  const contractBytes = fs.readFileSync(path.join(root, 'contract.json'));
  const contractFile = { path: 'contract.json', sha256: H(contractBytes) };
  const baseline = write(root, 'artifacts/baseline.apk', 'baseline-artifact', true);
  const candidate = options.prebuild ? null : write(root, 'artifacts/candidate.apk', 'candidate-artifact', true);
  const scope = { kind: 'fixture-replay', fixtureId: 'fixture.synthetic' };
  const evidence = [];
  const metric = options.metric ?? 0.9;
  for (const domain of ['BUILD', 'BEHAVIOR', 'RENDER']) {
    for (const phase of ['BASELINE', 'CANDIDATE']) {
      const unavailable = options.prebuild && phase === 'CANDIDATE';
      const id = `evidence.${phase.toLowerCase()}.${domain.toLowerCase()}`;
      const receipt = { verificationScope: scope, outcome: 'PASS' };
      if (domain === 'BUILD' && !unavailable) Object.assign(receipt, {
        repositoryRevision: app.provenance.revision.commit, sourceSnapshotSha256: H(`${phase}-source`),
        artifactSha256: phase === 'BASELINE' ? baseline.sha256 : candidate.sha256,
        changedPaths: phase === 'BASELINE' ? [] : ['app/src/main/java/fixture/app/ui/RetrofittedScreen.kt'],
        ...(phase === 'CANDIDATE' ? { workingTreeDiffSha256: H('candidate-diff') } : {})
      });
      if (domain === 'RENDER' && phase === 'CANDIDATE') receipt.metrics = [{ name: options.metricName || 'ink_iou', value: metric, unit: options.metricUnit || 'ratio' }];
      if (domain === 'RENDER' && phase === 'CANDIDATE' && options.extraMetrics) receipt.metrics.push(...options.extraMetrics);
      if (options.sourceReport && domain === 'RENDER' && phase === 'CANDIDATE') receipt.sourceReport = options.sourceReport;
      const source = `evidence/${phase.toLowerCase()}-${domain.toLowerCase()}.json`;
      const stored = unavailable ? null : write(root, source, receipt);
      const item = {
        id, kind: domain === 'RENDER' ? 'VISUAL_DIFF' : 'TEST_RESULT', phase, domain,
        pairId: `pair.${domain.toLowerCase()}`, required: true, status: unavailable ? 'NOT_RUN' : 'PRESENT', source,
        context: {
          ...clone(requiredContext), producerRuntime: { name: 'fixture-runner', version: '1.0.0', platform: 'synthetic' },
          sourceSnapshotSha256: H(`${phase}-source`)
        }
      };
      delete item.context.id;
      if (!unavailable) {
        item.sha256 = stored.sha256; item.capturedAt = '2026-09-22T20:01:00.000Z';
        item.context.subjectArtifactSha256 = phase === 'BASELINE' ? baseline.sha256 : candidate.sha256;
        if (receipt.metrics) item.metrics = clone(receipt.metrics);
      }
      evidence.push(item);
    }
  }
  const unsupported = Boolean(options.metricName && !['ink_iou', 'required_element_iou', 'similarity', 'mssim', 'ssim'].includes(options.metricName));
  const isFail = !options.prebuild && !unsupported && metric < 0.85;
  const outcome = isFail ? 'FAIL' : options.prebuild || unsupported ? 'BLOCKED' : 'PASS';
  const evidenceRefs = evidence.map((x) => x.id);
  const resultRequirementId = 'result.requirement.fixture';
  const result = {
    schemaVersion: '1.0.0', kind: 'VerificationResult', id: 'verification.synthetic', createdAt: '2026-09-22T20:02:00.000Z',
    producer: { name: 'fixture-runner', version: '1.0.0' },
    inputs: [
      { id: 'input.contract', kind: 'RETROFIT_CONTRACT', path: contractFile.path, sha256: contractFile.sha256 },
      { id: 'input.baseline', kind: 'BASELINE_ARTIFACT', path: baseline.path, sha256: baseline.sha256 },
      ...(candidate ? [{ id: 'input.candidate', kind: 'CANDIDATE_ARTIFACT', path: candidate.path, sha256: candidate.sha256 }] : [])
    ], claimScope: 'EVIDENCE_FOR_NAMED_SUBJECT_ONLY', verificationScope: scope,
    subject: {
      retrofitContractId: contract.id, retrofitContractSha256: contractFile.sha256,
      acceptanceMatrixSha256: contract.acceptanceMatrix.requirementsSha256,
      repositoryRevision: app.provenance.revision.commit, ...(candidate ? { buildArtifactSha256: candidate.sha256, workingTreeDiffSha256: H('candidate-diff') } : {}),
      deviceProfile: 'synthetic-device', buildVariant: 'debug'
    }, outcome,
    requirements: [{
      id: resultRequirementId, contractRequirementRef: requirement.id, category: 'VISUAL', description: requirement.description,
      status: outcome, contextResults: [{ contractContextRef: 'context.main', status: outcome,
        budgetResults: [{ contractBudgetRef: 'budget.ink-iou', status: outcome,
          ...(outcome === 'BLOCKED' ? {} : { observed: metric }), unit: options.metricUnit || 'ratio', evidenceRefs: ['evidence.candidate.render'] }], evidenceRefs }], evidenceRefs
    }], evidence,
    evidenceCompleteness: {
      complete: !options.prebuild, requiredCount: 6, presentRequiredCount: options.prebuild ? 3 : 6,
      missingRequiredEvidenceIds: options.prebuild ? evidence.filter((x) => x.status === 'NOT_RUN').map((x) => x.id) : [], invalidRequiredEvidenceIds: []
    },
    defects: isFail ? [{ id: 'defect.ink-iou', severity: 'P2', category: 'VISUAL', summary: 'Ink IoU is below the authored budget.', expected: 'At least 0.85 ratio.', actual: `${metric} ratio.`, requirementRef: resultRequirementId, evidenceRefs: ['evidence.candidate.render'], reproduction: ['Replay the pinned fixture comparison.'] }] : [],
    blockers: [
      ...(options.prebuild ? [{ id: 'blocker.prebuild', requirementRef: resultRequirementId, reason: 'Candidate artifact and receipts do not exist.', resolution: 'Build the candidate and capture all required evidence.', evidenceRefs: evidence.filter((x) => x.phase === 'CANDIDATE').map((x) => x.id) }] : []),
      ...(unsupported ? [{ id: 'blocker.metric', requirementRef: resultRequirementId, reason: 'The metric is unsupported.', resolution: 'Use a registered metric.' }] : []),
      ...(options.contractBlocked ? [{ id: 'blocker.contract', requirementRef: resultRequirementId, reason: 'The contract declares an unsupported capability.', resolution: 'Resolve or approve the blocking condition.', contractConditionRefs: ['capability.root'] }] : [])
    ],
    summary: { passedRequirementCount: outcome === 'PASS' ? 1 : 0, failedRequirementCount: outcome === 'FAIL' ? 1 : 0, blockedRequirementCount: outcome === 'BLOCKED' ? 1 : 0, defectCount: isFail ? 1 : 0, blockerCount: (options.prebuild ? 1 : 0) + (unsupported ? 1 : 0) + (options.contractBlocked ? 1 : 0) }
  };
  write(root, 'result.json', result);
  return { root, android, contract, result, app };
}

function run(root, extra = []) {
  return spawnSync(process.execPath, [CLI, 'verify', '--contract', path.join(root, 'contract.json'), '--result', path.join(root, 'result.json'), '--root', root, '--json', ...extra], { encoding: 'utf8' });
}

function makeProjectCandidate(options = {}) {
  const fixture = makeWorkspace(options);
  const candidate = path.join(path.dirname(fixture.root), 'candidate');
  execFileSync('git', ['-C', fixture.android, 'worktree', 'add', '-q', '-b', 'candidate-verification', candidate]);
  const changed = path.join(candidate, 'app/src/main/java/fixture/app/ui/RetrofittedScreen.kt');
  fs.mkdirSync(path.dirname(changed), { recursive: true });
  fs.writeFileSync(changed, 'package fixture.app.ui\ninternal class RetrofittedScreen\n');
  if (options.trackedSourceSymlink) {
    fs.symlinkSync('missing-target.kt', path.join(path.dirname(changed), 'TrackedLink.kt'));
    execFileSync('git', ['-C', candidate, 'add', '.']);
    execFileSync('git', ['-C', candidate, 'commit', '-qm', 'candidate with tracked source symlink']);
  }
  if (options.untrackedSourceDirectorySymlink) {
    fs.symlinkSync('missing-source-directory', path.join(path.dirname(changed), 'linked-sources'), 'dir');
  }
  const revision = gitMetadata(candidate);
  const changedPaths = gitChangedPaths(candidate, fixture.app.provenance.revision.commit);
  const snapshot = H(stableJson({ repositoryRevision: revision.commit, workingTreeDiffSha256: revision.workingTreeDiffSha256 || null,
    changedPaths, ignoredSourceEvidence: gitIgnoredSourceEvidence(candidate) }));
  const scope = { kind: 'project-candidate', projectId: 'project.synthetic' };
  fixture.result.verificationScope = scope;
  fixture.result.subject.repositoryRevision = revision.commit;
  fixture.result.subject.workingTreeDiffSha256 = revision.workingTreeDiffSha256;
  for (const evidence of fixture.result.evidence) {
    const receiptPath = path.join(fixture.root, evidence.source);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    receipt.verificationScope = scope;
    if (evidence.phase === 'CANDIDATE') evidence.context.sourceSnapshotSha256 = snapshot;
    if (evidence.id === 'evidence.candidate.build') Object.assign(receipt, {
      repositoryRevision: revision.commit, workingTreeDiffSha256: revision.workingTreeDiffSha256,
      sourceSnapshotSha256: snapshot, changedPaths
    });
    const stored = write(fixture.root, evidence.source, receipt);
    evidence.sha256 = stored.sha256;
  }
  write(fixture.root, 'result.json', fixture.result);
  return { ...fixture, candidate };
}

test('complete hash-pinned fixture PASSes and emits a deterministic scoped report', () => {
  const fixture = makeWorkspace();
  const first = run(fixture.root, ['--report', path.join(fixture.root, 'report.md')]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).outcome, 'PASS');
  const report = fs.readFileSync(path.join(fixture.root, 'report.md'), 'utf8');
  assert.match(report, /fixture-replay only/);
  assert.match(report, /not project or release acceptance/);
  const second = run(fixture.root, ['--report', path.join(fixture.root, 'report-2.md')]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'report-2.md'), 'utf8'), report);
});

test('truthful pre-build evidence is BLOCKED and measured budget failure is FAIL', () => {
  const blocked = makeWorkspace({ prebuild: true });
  assert.equal(run(blocked.root).status, 2);
  const failed = makeWorkspace({ metric: 0.8 });
  const response = run(failed.root);
  assert.equal(response.status, 1, response.stderr);
  assert.equal(JSON.parse(response.stdout).outcome, 'FAIL');
});

test('metric registry rejects wrong units and out-of-range values, and BLOCKs unsupported metrics', () => {
  const outOfRange = makeWorkspace({ metric: 2 });
  assert.equal(run(outOfRange.root).status, 3);
  const wrongUnit = makeWorkspace({ metricUnit: 'percent' });
  assert.equal(run(wrongUnit.root).status, 3);
  const unsupported = makeWorkspace({ metricName: 'invented_score' });
  const response = run(unsupported.root);
  assert.equal(response.status, 2, response.stderr);
  assert.equal(JSON.parse(response.stdout).outcome, 'BLOCKED');
});

test('measured FAIL retains exact blocking contract conditions in the deterministic report', () => {
  const fixture = makeWorkspace({ metric: 0.8, contractBlocked: true });
  const reportPath = path.join(fixture.root, 'mixed-report.md');
  const response = run(fixture.root, ['--report', reportPath]);
  assert.equal(response.status, 1, response.stderr);
  assert.match(fs.readFileSync(reportPath, 'utf8'), /Contract conditions: `capability\.root`/);
  fixture.result.blockers[0].contractConditionRefs = ['capability.title'];
  write(fixture.root, 'result.json', fixture.result);
  assert.equal(run(fixture.root).status, 3);
});

test('candidate worktree changes leave the immutable baseline valid, while baseline mutation invalidates it', () => {
  const fixture = makeWorkspace();
  const candidateWorktree = path.join(path.dirname(fixture.root), 'candidate-worktree');
  fs.mkdirSync(candidateWorktree);
  fs.writeFileSync(path.join(candidateWorktree, 'candidate-change.kt'), 'candidate-only change\n');
  assert.equal(run(fixture.root).status, 0);
  const captured = fixture.app.provenance.evidence.find((x) => x.kind === 'SOURCE_FILE');
  assert(captured);
  fs.appendFileSync(path.join(fixture.android, captured.path), '\n// baseline mutation\n');
  assert.equal(run(fixture.root).status, 3);
});

test('project candidate derives exact Git provenance and rejects an omitted out-of-scope edit', () => {
  const fixture = makeProjectCandidate();
  const exclude = execFileSync('git', ['-C', fixture.candidate, 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  fs.appendFileSync(exclude, '\napp/build/\n');
  const generated = path.join(fixture.candidate, 'app/build/intermediates/generated.xml');
  fs.mkdirSync(path.dirname(generated), { recursive: true }); fs.writeFileSync(generated, '<generated/>\n');
  assert.equal(run(fixture.root, ['--candidate', fixture.candidate]).status, 0);
  const outside = path.join(fixture.candidate, 'app/src/main/java/fixture/app/outside/Backdoor.kt');
  fs.mkdirSync(path.dirname(outside), { recursive: true });
  fs.writeFileSync(outside, 'package fixture.app.outside\ninternal class Backdoor\n');
  assert.equal(run(fixture.root, ['--candidate', fixture.candidate]).status, 3);

  const ignored = makeProjectCandidate();
  const ignoredExclude = execFileSync('git', ['-C', ignored.candidate, 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  fs.appendFileSync(ignoredExclude, '\nignored-backdoor.png\n');
  const ignoredOutside = path.join(ignored.candidate, 'app/src/main/assets/outside/ignored-backdoor.png');
  fs.mkdirSync(path.dirname(ignoredOutside), { recursive: true });
  fs.writeFileSync(ignoredOutside, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.equal(run(ignored.root, ['--candidate', ignored.candidate]).status, 3);

  const descendantBuild = makeProjectCandidate();
  const buildExclude = execFileSync('git', ['-C', descendantBuild.candidate, 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  fs.appendFileSync(buildExclude, '\nEvil.kt\n');
  const ignoredBuildCode = path.join(descendantBuild.candidate, 'app/src/main/java/fixture/app/outside/build/Evil.kt');
  fs.mkdirSync(path.dirname(ignoredBuildCode), { recursive: true });
  fs.writeFileSync(ignoredBuildCode, 'package fixture.app.outside.build\ninternal class Evil\n');
  assert.equal(run(descendantBuild.root, ['--candidate', descendantBuild.candidate]).status, 3);

  const descendantDotGradle = makeProjectCandidate();
  const dotGradleExclude = execFileSync('git', ['-C', descendantDotGradle.candidate, 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim();
  fs.appendFileSync(dotGradleExclude, '\nhidden-asset.png\n');
  const ignoredDotGradleAsset = path.join(descendantDotGradle.candidate, 'app/src/main/assets/outside/.gradle/hidden-asset.png');
  fs.mkdirSync(path.dirname(ignoredDotGradleAsset), { recursive: true });
  fs.writeFileSync(ignoredDotGradleAsset, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]));
  assert.equal(run(descendantDotGradle.root, ['--candidate', descendantDotGradle.candidate]).status, 3);
});

test('project candidate rejects a dirty inspected baseline that a worktree cannot materialize', () => {
  const fixture = makeProjectCandidate({ dirtyBaseline: true });
  assert.equal(run(fixture.root, ['--candidate', fixture.candidate]).status, 3);
});

test('project candidate rejects tracked source-file and untracked source-directory symlinks without following them', () => {
  const tracked = makeProjectCandidate({ trackedSourceSymlink: true });
  assert.equal(run(tracked.root, ['--candidate', tracked.candidate]).status, 3);
  const untracked = makeProjectCandidate({ untrackedSourceDirectorySymlink: true });
  assert.equal(run(untracked.root, ['--candidate', untracked.candidate]).status, 3);
});

test('project candidate rejects a different repository and a non-descendant worktree', () => {
  const wrong = makeProjectCandidate();
  const unrelated = path.join(path.dirname(wrong.root), 'unrelated');
  fs.mkdirSync(unrelated);
  execFileSync('git', ['-C', unrelated, 'init', '-q']);
  execFileSync('git', ['-C', unrelated, 'config', 'user.email', 'fixture@example.invalid']);
  execFileSync('git', ['-C', unrelated, 'config', 'user.name', 'Fixture']);
  fs.writeFileSync(path.join(unrelated, 'README'), 'unrelated\n');
  execFileSync('git', ['-C', unrelated, 'add', '.']); execFileSync('git', ['-C', unrelated, 'commit', '-qm', 'unrelated']);
  assert.equal(run(wrong.root, ['--candidate', unrelated]).status, 3);

  const divergent = makeProjectCandidate();
  execFileSync('git', ['-C', divergent.candidate, 'checkout', '-q', '--orphan', 'divergent']);
  execFileSync('git', ['-C', divergent.candidate, 'add', '.']);
  execFileSync('git', ['-C', divergent.candidate, 'commit', '-qm', 'divergent-root']);
  assert.equal(run(divergent.root, ['--candidate', divergent.candidate]).status, 3);
});

test('tampered hashes, contexts, pairs, summaries, artifacts and requirement sets are invalid', async (t) => {
  const mutations = {
    hash: (f) => { f.result.evidence[0].sha256 = '0'.repeat(64); },
    context: (f) => { f.result.evidence[0].context.sceneId = 'scene.other'; },
    pair: (f) => { f.result.evidence.find((x) => x.id === 'evidence.candidate.render').pairId = 'pair.wrong'; },
    summary: (f) => { f.result.summary.passedRequirementCount = 2; },
    artifact: (f) => { f.result.evidence.find((x) => x.id === 'evidence.candidate.build').context.subjectArtifactSha256 = '9'.repeat(64); },
    requirement: (f) => { f.result.requirements[0].contractRequirementRef = 'requirement.other'; },
    revision: (f) => { f.result.subject.repositoryRevision = '9'.repeat(40); },
    device: (f) => { f.result.subject.deviceProfile = 'spoofed-device'; },
    variant: (f) => { f.result.subject.buildVariant = 'release'; }
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, () => {
    const fixture = makeWorkspace(); mutate(fixture); write(fixture.root, 'result.json', fixture.result);
    assert.equal(run(fixture.root).status, 3);
  });
});

test('forged P3 namespaces, out-of-bound changed paths, and duplicate coverage cannot PASS', async (t) => {
  await t.test('forged contract', () => {
    const fixture = makeWorkspace();
    fixture.contract.elementMappings[0].existingUiSymbolRef = 'ui.forged';
    const updated = write(fixture.root, 'contract.json', fixture.contract);
    fixture.result.inputs.find((x) => x.kind === 'RETROFIT_CONTRACT').sha256 = updated.sha256;
    fixture.result.subject.retrofitContractSha256 = updated.sha256;
    write(fixture.root, 'result.json', fixture.result);
    assert.equal(run(fixture.root).status, 3);
  });
  await t.test('changed path escape', () => {
    const fixture = makeWorkspace();
    const evidence = fixture.result.evidence.find((x) => x.id === 'evidence.candidate.build');
    const receipt = JSON.parse(fs.readFileSync(path.join(fixture.root, evidence.source), 'utf8'));
    receipt.changedPaths = ['app/src/main/java/fixture/app/outside/Backdoor.kt'];
    const updated = write(fixture.root, evidence.source, receipt); evidence.sha256 = updated.sha256;
    write(fixture.root, 'result.json', fixture.result);
    assert.equal(run(fixture.root).status, 3);
  });
  await t.test('duplicate domain-phase coverage', () => {
    const fixture = makeWorkspace();
    const original = fixture.result.evidence.find((x) => x.id === 'evidence.candidate.render');
    const duplicate = clone(original); duplicate.id = 'evidence.candidate.render.duplicate'; duplicate.pairId = 'pair.render.duplicate';
    duplicate.source = 'evidence/candidate-render-duplicate.json';
    const stored = write(fixture.root, duplicate.source, JSON.parse(fs.readFileSync(path.join(fixture.root, original.source), 'utf8')));
    duplicate.sha256 = stored.sha256;
    fixture.result.evidence.push(duplicate);
    fixture.result.requirements[0].evidenceRefs.push(duplicate.id);
    fixture.result.requirements[0].contextResults[0].evidenceRefs.push(duplicate.id);
    fixture.result.evidenceCompleteness.requiredCount += 1; fixture.result.evidenceCompleteness.presentRequiredCount += 1;
    write(fixture.root, 'result.json', fixture.result);
    assert.equal(run(fixture.root).status, 3);
  });
});

test('scope relabeling, stale evidence and unsafe report writes are rejected without mutation', () => {
  const fixture = makeWorkspace();
  fixture.result.verificationScope = { kind: 'project-candidate', projectId: 'project.synthetic' };
  write(fixture.root, 'result.json', fixture.result);
  assert.equal(run(fixture.root).status, 3);

  const stale = makeWorkspace();
  fs.appendFileSync(path.join(stale.root, 'evidence/candidate-behavior.json'), 'x');
  assert.equal(run(stale.root).status, 3);

  const collision = makeWorkspace();
  const before = fs.readFileSync(path.join(collision.root, 'contract.json'));
  assert.equal(run(collision.root, ['--report', path.join(collision.root, 'contract.json')]).status, 3);
  assert.deepEqual(fs.readFileSync(path.join(collision.root, 'contract.json')), before);
});

test('historical Markdown metrics remain imported fixture evidence and fail the authored Ink IoU budget', async (t) => {
  const reports = [
    { source: path.join(REPO, 'verification/verification_report.md'), metric: 0.2049, extraMetrics: [{ name: 'similarity', value: 0.956, unit: 'ratio' }, { name: 'mssim', value: 0.846, unit: 'ratio' }] },
    { source: path.join(REPO, 'verification_report.md'), metric: 0.7263, extraMetrics: [{ name: 'similarity', value: 0.954, unit: 'ratio' }, { name: 'mssim', value: 0.942, unit: 'ratio' }] }
  ];
  for (const [index, historical] of reports.entries()) await t.test(String(index + 1), () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-v1-historical-'));
    const raw = fs.readFileSync(historical.source);
    const report = write(root, `historical/report-${index}.md`, raw, true);
    const fixture = makeWorkspace({ metric: historical.metric, sourceReport: report, extraMetrics: historical.extraMetrics });
    fs.mkdirSync(path.join(fixture.root, 'historical'), { recursive: true });
    fs.copyFileSync(path.join(root, report.path), path.join(fixture.root, report.path));
    const response = run(fixture.root);
    assert.equal(response.status, 1, response.stderr);
    assert.equal(JSON.parse(response.stdout).verificationScope.kind, 'fixture-replay');
  });
});
