'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMA_DIR = path.resolve(__dirname, '../../schemas/v1');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const COMMIT = '1'.repeat(40);

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function acceptanceContext(id, scenarioId, stateId) {
  return {
    id,
    sceneId: 'scene.note-editor',
    scenarioId,
    stateId,
    viewport: { widthPx: 390, heightPx: 844, deviceScaleFactor: 3 },
    deviceProfile: 'synthetic-390x844',
    configuration: {
      buildVariant: 'debug',
      locale: 'en-US',
      theme: 'daylight',
      fontScale: 1,
      orientation: 'PORTRAIT',
      reducedMotion: true
    }
  };
}

function semanticContractCheck(contract, result) {
  const unique = (items) => new Set(items).size === items.length;
  const acceptance = contract.acceptanceMatrix;
  const evidenceById = new Map(result.evidence.map((item) => [item.id, item]));
  const requirementByRef = new Map(result.requirements.map((item) => [item.contractRequirementRef, item]));
  const expectedRequirements = acceptance.requirements.map((item) => item.id);
  const actualRequirements = result.requirements.map((item) => item.contractRequirementRef);

  if (result.subject.acceptanceMatrixSha256 !== acceptance.requirementsSha256) return false;
  if (!unique(result.evidence.map((item) => item.id))) return false;
  if (!unique(actualRequirements)) return false;
  if (expectedRequirements.length !== actualRequirements.length) return false;
  if (!expectedRequirements.every((id) => requirementByRef.has(id))) return false;

  for (const expected of acceptance.requirements) {
    const observed = requirementByRef.get(expected.id);
    const expectedContexts = expected.requiredContexts.map((item) => item.id);
    const observedContexts = observed.contextResults.map((item) => item.contractContextRef);
    if (!unique(observedContexts)) return false;
    if (expectedContexts.length !== observedContexts.length) return false;
    if (!expectedContexts.every((id) => observedContexts.includes(id))) return false;
    if (!observed.evidenceRefs.every((id) => evidenceById.has(id))) return false;
    if (observed.status === 'PASS' && observed.contextResults.some((item) => item.status !== 'PASS')) return false;
    if (observed.status === 'FAIL' && !observed.contextResults.some((item) => item.status === 'FAIL')) return false;
    if (observed.status === 'BLOCKED' && !observed.contextResults.some((item) => item.status === 'BLOCKED')) return false;
    const expectedBudgets = expected.numericBudgets.map((item) => item.id);
    for (const contextResult of observed.contextResults) {
      const observedBudgets = contextResult.budgetResults.map((item) => item.contractBudgetRef);
      if (!unique(observedBudgets)) return false;
      if (expectedBudgets.length !== observedBudgets.length) return false;
      if (!expectedBudgets.every((id) => observedBudgets.includes(id))) return false;
      if (result.outcome === 'PASS' && contextResult.budgetResults.some((item) => item.status !== 'PASS')) return false;
    }
    for (const expectedContext of expected.requiredContexts) {
      for (const domain of expected.domains) {
        const matchingEvidence = result.evidence.filter((item) => (
          item.domain === domain
          && item.context.sceneId === expectedContext.sceneId
          && item.context.scenarioId === expectedContext.scenarioId
          && item.context.stateId === expectedContext.stateId
        ));
        if (result.outcome === 'PASS') {
          if (!matchingEvidence.some((item) => item.phase === 'BASELINE' && item.status === 'PRESENT')) return false;
          if (!matchingEvidence.some((item) => item.phase === 'CANDIDATE' && item.status === 'PRESENT')) return false;
        }
      }
    }
  }

  const pairs = new Map();
  for (const item of result.evidence.filter((candidate) => candidate.status === 'PRESENT')) {
    const key = `${item.pairId}:${item.domain}`;
    const group = pairs.get(key) || [];
    group.push(item);
    pairs.set(key, group);
    if (item.phase === 'CANDIDATE' && item.context.subjectArtifactSha256 !== result.subject.buildArtifactSha256) return false;
  }
  for (const group of pairs.values()) {
    const baseline = group.find((item) => item.phase === 'BASELINE');
    const candidate = group.find((item) => item.phase === 'CANDIDATE');
    if (!baseline || !candidate) continue;
    const logicalContext = (item) => JSON.stringify({
      sceneId: item.context.sceneId,
      scenarioId: item.context.scenarioId,
      stateId: item.context.stateId,
      viewport: item.context.viewport,
      deviceProfile: item.context.deviceProfile,
      configuration: item.context.configuration,
      producerRuntime: item.context.producerRuntime
    });
    if (logicalContext(baseline) !== logicalContext(candidate)) return false;
  }

  if (contract.capabilities.some((item) => item.status === 'UNSUPPORTED_BLOCKING') && result.outcome === 'PASS') return false;
  if (contract.uncertainties.some((item) => item.impact === 'BLOCKING') && result.outcome === 'PASS') return false;
  const statusCounts = result.requirements.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { PASS: 0, FAIL: 0, BLOCKED: 0 });
  if (result.summary.passedRequirementCount !== statusCounts.PASS) return false;
  if (result.summary.failedRequirementCount !== statusCounts.FAIL) return false;
  if (result.summary.blockedRequirementCount !== statusCounts.BLOCKED) return false;
  if (result.summary.defectCount !== result.defects.length) return false;
  if (result.summary.blockerCount !== result.blockers.length) return false;
  return true;
}

function validators() {
  // Draft 2020-12 permits type constraints to be composed through $ref/allOf;
  // Ajv strict mode requires redundant local type declarations in those branches.
  const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true });
  addFormats(ajv);
  return {
    existingApp: ajv.compile(loadSchema('existing-app-model.schema.json')),
    retrofit: ajv.compile(loadSchema('retrofit-contract.schema.json')),
    verification: ajv.compile(loadSchema('verification-result.schema.json'))
  };
}

function existingAppFixture() {
  return {
    schemaVersion: '1.0.0',
    kind: 'ExistingAppModel',
    id: 'app-model.synthetic-note.1',
    createdAt: '2026-09-22T16:00:00.000Z',
    producer: { name: 'claude-to-compose', version: '1.0.0' },
    inputs: [{ id: 'repo.synthetic-note', kind: 'REPOSITORY', path: '/fixtures/synthetic-note', sha256: HASH_A }],
    claimScope: 'LEXICAL_EVIDENCE_WITH_UNCERTAINTY',
    provenance: {
      repository: { root: '/fixtures/synthetic-note', remoteUrl: null },
      revision: { vcs: 'git', commit: COMMIT, dirty: false },
      inspection: {
        startedAt: '2026-09-22T15:59:00.000Z',
        completedAt: '2026-09-22T16:00:00.000Z',
        commands: ['./gradlew projects', 'rg NoteScreen'],
        filesRead: ['settings.gradle.kts', 'app/src/main/java/example/NoteScreen.kt'],
        mutatedRepository: false
      },
      evidence: [{ id: 'evidence.note-screen-source', kind: 'SOURCE_FILE', path: 'evidence/NoteScreen.kt', sha256: HASH_B }]
    },
    modules: [{
      id: 'module.app',
      gradlePath: ':app',
      kind: 'APPLICATION',
      sourceSets: ['main', 'test'],
      buildVariants: ['debug'],
      evidenceRefs: ['evidence.note-screen-source']
    }],
    uiSymbols: [{
      id: 'ui.note-screen',
      moduleRef: 'module.app',
      qualifiedName: 'example.NoteScreen',
      kind: 'COMPOSABLE',
      location: { path: 'app/src/main/java/example/NoteScreen.kt', line: 20 },
      confidence: 0.96,
      evidenceRefs: ['evidence.note-screen-source']
    }],
    stateActionClues: {
      states: [{
        id: 'state.note-editor',
        symbol: 'NoteEditorState',
        location: { path: 'app/src/main/java/example/NoteScreen.kt', line: 9 },
        confidence: 0.91,
        evidenceRefs: ['evidence.note-screen-source']
      }],
      actions: [{
        id: 'action.save-note',
        symbol: 'SaveNote',
        location: { path: 'app/src/main/java/example/NoteScreen.kt', line: 14 },
        confidence: 0.93,
        evidenceRefs: ['evidence.note-screen-source']
      }]
    },
    buildCommandClues: [{
      id: 'build-command.app-debug',
      moduleRef: 'module.app',
      purpose: 'ASSEMBLE',
      command: './gradlew :app:assembleDebug',
      status: 'HEURISTIC_NOT_EXECUTED',
      confidence: 0.65,
      evidenceRefs: ['evidence.note-screen-source']
    }],
    tests: [{
      id: 'test.note-save',
      kind: 'UNIT',
      command: './gradlew :app:testDebugUnitTest',
      location: { path: 'app/src/test/java/example/NoteViewModelTest.kt', line: 1 },
      covers: ['action.save-note'],
      evidenceRefs: ['evidence.note-screen-source']
    }],
    uncertainties: [{
      id: 'uncertainty.runtime-dispatch',
      subjectRef: 'action.save-note',
      statement: 'Lexical inspection does not prove the runtime dispatch target.',
      impact: 'HIGH',
      resolution: 'Exercise the save characterization test and inspect persisted state.',
      evidenceRefs: ['evidence.note-screen-source']
    }]
  };
}

function retrofitFixture() {
  return {
    schemaVersion: '1.0.0',
    kind: 'RetrofitContract',
    id: 'retrofit.synthetic-note.1',
    createdAt: '2026-09-22T16:05:00.000Z',
    producer: { name: 'claude-to-compose', version: '1.0.0' },
    inputs: [
      { id: 'app-model.synthetic-note.1', kind: 'EXISTING_APP_MODEL', path: 'artifacts/existing-app-model.json', sha256: HASH_A },
      { id: 'design.synthetic-note.1', kind: 'DESIGN_EVIDENCE', path: 'artifacts/design-evidence.json', sha256: HASH_B }
    ],
    claimScope: 'DECLARED_MAPPING_NOT_VERIFIED_IMPLEMENTATION',
    sources: {
      existingAppModel: { artifactId: 'app-model.synthetic-note.1', schemaVersion: '1.0.0', path: 'artifacts/existing-app-model.json', sha256: HASH_A },
      designEvidence: { artifactId: 'design.synthetic-note.1', schemaVersion: '1.0.0', path: 'artifacts/design-evidence.json', sha256: HASH_B }
    },
    elementMappings: [{
      id: 'mapping.note-screen',
      designIdentity: 'design#note-screen',
      existingUiSymbolRef: 'ui.note-screen',
      mappingStatus: 'EVIDENCE_BACKED',
      evidenceRefs: ['evidence.note-screen-source', 'evidence.design-note-screen']
    }],
    actionBindings: [{
      id: 'binding.save-note',
      designIdentity: 'design#save-button',
      event: 'CLICK',
      bindingStatus: 'VERIFIED_EXISTING',
      existingActionRef: 'action.save-note',
      evidenceRefs: ['evidence.note-screen-source']
    }],
    preservationObligations: [{
      id: 'preserve.save-note',
      category: 'PERSISTENCE',
      statement: 'Saving retains the authoritative persistence path.',
      status: 'REQUIRED',
      sourceEvidenceRefs: ['evidence.note-screen-source'],
      verificationRequirement: 'Save, recreate the process, and observe the same synthetic note.'
    }],
    acceptanceMatrix: {
      canonicalization: 'JCS-RFC8785',
      requirementsSha256: HASH_B,
      requirements: [{
        id: 'requirement.fixture-replay',
        description: 'Build and replay launch and save scenarios against baseline and candidate.',
        domains: ['BUILD', 'BEHAVIOR', 'RENDER'],
        requiredContexts: [
          acceptanceContext('context.launch-empty', 'scenario.launch', 'state.empty'),
          acceptanceContext('context.save-populated', 'scenario.save', 'state.populated')
        ],
        numericBudgets: [{ id: 'budget.required-element-iou', metric: 'required_element_iou', operator: 'AT_LEAST', threshold: 0.9, unit: 'ratio' }],
        evidenceRefs: ['evidence.design-note-screen']
      }]
    },
    capabilities: [{
      id: 'capability.note-screen',
      subjectRef: 'design#note-screen',
      status: 'AGENT_IMPLEMENTATION_REQUIRED',
      rationale: 'The contract maps the surface but does not generate a verified implementation.',
      evidenceRefs: ['evidence.design-note-screen']
    }],
    uncertainties: [{
      id: 'uncertainty.save-runtime',
      subjectRef: 'action.save-note',
      statement: 'The action identity is lexical evidence, not resolved runtime behavior.',
      impact: 'HIGH',
      resolution: 'Run the save preservation scenario.',
      evidenceRefs: ['evidence.note-screen-source']
    }],
    implementationBoundary: {
      allowedPaths: ['app/src/main/java/example/ui'],
      prohibitedChanges: ['Do not change persistence interfaces.', 'Do not replace production state with preview fixtures.'],
      verificationCommands: ['./gradlew :app:testDebugUnitTest', './gradlew :app:assembleDebug']
    }
  };
}

function verificationEvidence(phase, domain, suffix, contractContext) {
  return {
    id: `evidence.${contractContext.id}.${phase.toLowerCase()}.${domain.toLowerCase()}`,
    kind: domain === 'RENDER' ? 'SCREENSHOT' : 'TEST_RESULT',
    phase,
    domain,
    pairId: `pair.${contractContext.id}.${domain.toLowerCase()}`,
    required: true,
    status: 'PRESENT',
    source: `evidence/${phase.toLowerCase()}-${domain.toLowerCase()}.json`,
    sha256: suffix.repeat(64),
    capturedAt: '2026-09-22T16:10:00.000Z',
    context: {
      sceneId: contractContext.sceneId,
      scenarioId: contractContext.scenarioId,
      stateId: contractContext.stateId,
      viewport: clone(contractContext.viewport),
      deviceProfile: contractContext.deviceProfile,
      configuration: clone(contractContext.configuration),
      producerRuntime: { name: 'fixture-runner', version: '1.0.0', platform: 'synthetic-linux' },
      sourceSnapshotSha256: phase === 'BASELINE' ? HASH_B : HASH_C,
      subjectArtifactSha256: phase === 'BASELINE' ? HASH_B : HASH_A
    }
  };
}

function verificationFixture() {
  const contexts = [
    acceptanceContext('context.launch-empty', 'scenario.launch', 'state.empty'),
    acceptanceContext('context.save-populated', 'scenario.save', 'state.populated')
  ];
  const evidence = contexts.flatMap((context, contextIndex) => [
    verificationEvidence('BASELINE', 'BUILD', String(contextIndex + 1), context),
    verificationEvidence('CANDIDATE', 'BUILD', String(contextIndex + 3), context),
    verificationEvidence('BASELINE', 'BEHAVIOR', String(contextIndex + 5), context),
    verificationEvidence('CANDIDATE', 'BEHAVIOR', String(contextIndex + 7), context),
    verificationEvidence('BASELINE', 'RENDER', String(contextIndex + 1), context),
    verificationEvidence('CANDIDATE', 'RENDER', String(contextIndex + 3), context)
  ]);
  return {
    schemaVersion: '1.0.0',
    kind: 'VerificationResult',
    id: 'verification.synthetic-note.1',
    createdAt: '2026-09-22T16:11:00.000Z',
    producer: { name: 'claude-to-compose', version: '1.0.0' },
    inputs: [{ id: 'retrofit.synthetic-note.1', kind: 'RETROFIT_CONTRACT', path: 'artifacts/retrofit-contract.json', sha256: HASH_C }],
    claimScope: 'EVIDENCE_FOR_NAMED_SUBJECT_ONLY',
    verificationScope: { kind: 'fixture-replay', fixtureId: 'fixture.synthetic-note' },
    subject: {
      retrofitContractId: 'retrofit.synthetic-note.1',
      retrofitContractSha256: HASH_C,
      acceptanceMatrixSha256: HASH_B,
      repositoryRevision: COMMIT,
      buildArtifactSha256: HASH_A,
      deviceProfile: 'synthetic-390x844',
      buildVariant: 'debug'
    },
    outcome: 'PASS',
    requirements: [{
      id: 'requirement.fixture-replay',
      contractRequirementRef: 'requirement.fixture-replay',
      category: 'BEHAVIOR',
      description: 'Replay the bounded synthetic build, behavior, and render fixture.',
      status: 'PASS',
      contextResults: contexts.map((context) => ({
        contractContextRef: context.id,
        status: 'PASS',
        budgetResults: [{
          contractBudgetRef: 'budget.required-element-iou',
          status: 'PASS',
          observed: 0.95,
          unit: 'ratio',
          evidenceRefs: evidence.filter((item) => item.pairId.includes(context.id) && item.domain === 'RENDER').map((item) => item.id)
        }],
        evidenceRefs: evidence.filter((item) => item.pairId.includes(context.id)).map((item) => item.id)
      })),
      evidenceRefs: evidence.map((item) => item.id)
    }],
    evidence,
    evidenceCompleteness: {
      complete: true,
      requiredCount: 12,
      presentRequiredCount: 12,
      missingRequiredEvidenceIds: [],
      invalidRequiredEvidenceIds: []
    },
    defects: [],
    blockers: [],
    summary: {
      passedRequirementCount: 1,
      failedRequirementCount: 0,
      blockedRequirementCount: 0,
      defectCount: 0,
      blockerCount: 0
    }
  };
}

describe('retrofit v1 artifact schemas', () => {
  const validate = validators();

  it('accepts minimal synthetic artifacts without promoting lexical evidence to semantic truth', () => {
    const app = existingAppFixture();
    const retrofit = retrofitFixture();
    const verification = verificationFixture();

    assert.equal(validate.existingApp(app), true, JSON.stringify(validate.existingApp.errors));
    assert.equal(validate.retrofit(retrofit), true, JSON.stringify(validate.retrofit.errors));
    assert.equal(validate.verification(verification), true, JSON.stringify(validate.verification.errors));
    assert.equal(semanticContractCheck(retrofit, verification), true);
    assert.equal(app.claimScope, 'LEXICAL_EVIDENCE_WITH_UNCERTAINTY');
    assert.equal(verification.verificationScope.kind, 'fixture-replay');
  });

  it('rejects an ExistingAppModel with missing provenance', () => {
    const fixture = existingAppFixture();
    delete fixture.provenance;
    assert.equal(validate.existingApp(fixture), false);
  });

  it('requires build-command clues to remain explicitly heuristic and unexecuted', () => {
    const { existingApp } = validators();
    const missing = existingAppFixture();
    delete missing.buildCommandClues;
    assert.equal(existingApp(missing), false);

    const promoted = existingAppFixture();
    promoted.buildCommandClues[0].status = 'EXECUTED';
    assert.equal(existingApp(promoted), false);
  });

  it('rejects an invented placeholder action mapping', () => {
    const fixture = retrofitFixture();
    fixture.actionBindings[0].existingActionRef = 'PLACEHOLDER.action';
    assert.equal(validate.retrofit(fixture), false);
  });

  it('rejects retrofit uncertainty without evidence and requirement results without evidence', () => {
    const retrofit = retrofitFixture();
    delete retrofit.uncertainties[0].evidenceRefs;
    assert.equal(validate.retrofit(retrofit), false);

    const verification = verificationFixture();
    verification.requirements[0].evidenceRefs = [];
    assert.equal(validate.verification(verification), false);
  });

  it('requires a hashed approval input for owner-approved behavior and rejects broad edit roots', () => {
    const approved = retrofitFixture();
    approved.actionBindings[0] = {
      id: 'binding.save-note',
      designIdentity: 'design#save-button',
      event: 'CLICK',
      bindingStatus: 'OWNER_APPROVED_NEW_BEHAVIOR',
      newBehaviorStatement: 'Save and return to the notes list.',
      ownerApprovalRef: 'approval.save-and-return',
      evidenceRefs: ['evidence.note-screen-source']
    };
    assert.equal(validate.retrofit(approved), false);
    approved.inputs.push({
      id: 'approval.save-and-return',
      kind: 'OWNER_APPROVAL',
      path: 'approvals/save-and-return.json',
      sha256: HASH_C
    });
    assert.equal(validate.retrofit(approved), true, JSON.stringify(validate.retrofit.errors));

    const broadBoundary = retrofitFixture();
    broadBoundary.implementationBoundary.allowedPaths = ['.'];
    assert.equal(validate.retrofit(broadBoundary), false);
  });

  it('rejects PRESENT evidence without its required content hash', () => {
    const fixture = verificationFixture();
    delete fixture.evidence[0].sha256;
    assert.equal(validate.verification(fixture), false);

    const missingCaptureTime = verificationFixture();
    delete missingCaptureTime.evidence[0].capturedAt;
    assert.equal(validate.verification(missingCaptureTime), false);
  });

  it('rejects PASS when matching baseline/candidate render coverage is absent', () => {
    const fixture = verificationFixture();
    fixture.evidence = fixture.evidence.filter((item) => !(item.phase === 'CANDIDATE' && item.domain === 'RENDER'));
    fixture.evidenceCompleteness.requiredCount = 8;
    fixture.evidenceCompleteness.presentRequiredCount = 8;
    assert.equal(validate.verification(fixture), false);
  });

  it('rejects PASS with declared missing required evidence or defects', () => {
    const fixture = verificationFixture();
    fixture.evidenceCompleteness.complete = false;
    fixture.evidenceCompleteness.missingRequiredEvidenceIds = ['evidence.candidate.render'];
    fixture.defects.push({
      id: 'defect.render',
      severity: 'P2',
      category: 'VISUAL',
      summary: 'Candidate render is missing.',
      expected: 'A captured candidate render.',
      actual: 'No render was captured.',
      requirementRef: 'requirement.fixture-replay',
      evidenceRefs: [fixture.evidence[0].id],
      reproduction: ['Run the candidate render step.']
    });
    fixture.summary.defectCount = 1;
    assert.equal(validate.verification(fixture), false);
  });

  it('requires a candidate artifact hash for PASS and accepts truthful pre-build BLOCKED without one', () => {
    const invalidPass = verificationFixture();
    delete invalidPass.subject.buildArtifactSha256;
    assert.equal(validate.verification(invalidPass), false);

    const blocked = verificationFixture();
    blocked.outcome = 'BLOCKED';
    delete blocked.subject.buildArtifactSha256;
    blocked.requirements[0].status = 'BLOCKED';
    blocked.requirements[0].contextResults.forEach((result) => {
      result.status = 'BLOCKED';
      result.evidenceRefs = result.evidenceRefs.filter((id) => id.includes('.baseline.'));
      result.budgetResults.forEach((budget) => {
        budget.status = 'BLOCKED';
        delete budget.observed;
        budget.evidenceRefs = budget.evidenceRefs.filter((id) => id.includes('.baseline.'));
      });
    });
    blocked.evidence = blocked.evidence.filter((item) => item.phase === 'BASELINE');
    blocked.requirements[0].evidenceRefs = blocked.evidence.map((item) => item.id);
    blocked.evidenceCompleteness = {
      complete: false,
      requiredCount: 12,
      presentRequiredCount: 6,
      missingRequiredEvidenceIds: [
        'candidate.build.context.launch-empty',
        'candidate.behavior.context.launch-empty',
        'candidate.render.context.launch-empty',
        'candidate.build.context.save-populated',
        'candidate.behavior.context.save-populated',
        'candidate.render.context.save-populated'
      ],
      invalidRequiredEvidenceIds: []
    };
    blocked.blockers = [{
      id: 'blocker.candidate-build',
      requirementRef: 'requirement.fixture-replay',
      reason: 'The candidate build has not been produced.',
      resolution: 'Build the candidate before attempting candidate behavior or render capture.'
    }];
    blocked.summary = {
      passedRequirementCount: 0,
      failedRequirementCount: 0,
      blockedRequirementCount: 1,
      defectCount: 0,
      blockerCount: 1
    };
    assert.equal(blocked.evidence.some((item) => item.phase === 'CANDIDATE'), false);
    assert.equal(blocked.inputs.some((item) => item.kind === 'CANDIDATE_ARTIFACT'), false);
    assert.equal(Object.hasOwn(blocked.subject, 'buildArtifactSha256'), false);
    assert.equal(validate.verification(blocked), true, JSON.stringify(validate.verification.errors));
    assert.equal(semanticContractCheck(retrofitFixture(), blocked), true);
  });

  it('accepts a structured FAIL outcome', () => {
    const failed = verificationFixture();
    failed.outcome = 'FAIL';
    failed.requirements[0].status = 'FAIL';
    failed.requirements[0].contextResults[1].status = 'FAIL';
    failed.defects = [{
      id: 'defect.behavior',
      severity: 'P1',
      category: 'BEHAVIOR',
      summary: 'The candidate does not preserve save behavior.',
      expected: 'The synthetic note persists after process recreation.',
      actual: 'The recreated process shows no note.',
      requirementRef: 'requirement.fixture-replay',
      evidenceRefs: [failed.evidence.find((item) => item.phase === 'CANDIDATE' && item.domain === 'BEHAVIOR').id],
      reproduction: ['Save the synthetic note.', 'Recreate the process.', 'Observe the empty state.']
    }];
    failed.summary = {
      passedRequirementCount: 0,
      failedRequirementCount: 1,
      blockedRequirementCount: 0,
      defectCount: 1,
      blockerCount: 0
    };
    assert.equal(validate.verification(failed), true, JSON.stringify(validate.verification.errors));
  });

  it('semantic completeness rejects disappearance of one required scenario', () => {
    const contract = retrofitFixture();
    const result = verificationFixture();
    result.requirements[0].contextResults.pop();
    assert.equal(validate.verification(result), true, JSON.stringify(validate.verification.errors));
    assert.equal(semanticContractCheck(contract, result), false);
  });

  it('semantic pairing rejects mismatched capture context and stale candidate artifacts', () => {
    const contract = retrofitFixture();
    const mismatched = verificationFixture();
    const candidate = mismatched.evidence.find((item) => item.phase === 'CANDIDATE' && item.domain === 'RENDER');
    candidate.context.configuration.locale = 'fr-FR';
    assert.equal(validate.verification(mismatched), true, JSON.stringify(validate.verification.errors));
    assert.equal(semanticContractCheck(contract, mismatched), false);

    const stale = verificationFixture();
    stale.evidence
      .filter((item) => item.phase === 'CANDIDATE')
      .forEach((item) => { item.context.subjectArtifactSha256 = HASH_C; });
    assert.equal(validate.verification(stale), true, JSON.stringify(validate.verification.errors));
    assert.equal(semanticContractCheck(contract, stale), false);
  });

  it('rejects unknown schema versions and non-finite metric values', () => {
    const wrongVersion = existingAppFixture();
    wrongVersion.schemaVersion = '2.0.0';
    assert.equal(validate.existingApp(wrongVersion), false);

    const nonFinite = verificationFixture();
    nonFinite.evidence[0].metrics = [{ name: 'duration', value: Number.NaN, unit: 'ms' }];
    assert.equal(validate.verification(nonFinite), false);
  });
});
