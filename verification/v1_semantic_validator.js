'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { InputError, canonicalPlannedPath, isInside, readWorkspace } = require('../retrofit/safety');
const { stableJson } = require('../retrofit/contract_builder');
const { buildAgentPacket } = require('../retrofit/agent_packet');
const {
  assertNoSourceSensitiveSymlinks, gitChangedPaths, gitCommonDirectory, gitIgnoredSourceEvidence, gitMetadata
} = require('../retrofit/inspect_app');

const REPO = path.resolve(__dirname, '..');
const SCHEMAS = path.join(REPO, 'schemas/v1');
const CATEGORY_DOMAIN = { BUILD: 'BUILD', BEHAVIOR: 'BEHAVIOR', VISUAL: 'RENDER', SEMANTICS: 'SEMANTICS', PERFORMANCE: 'PERFORMANCE', PROVENANCE: 'PROVENANCE', OTHER: 'OTHER' };
const METRICS = {
  ink_iou: { unit: 'ratio', min: 0, max: 1 }, required_element_iou: { unit: 'ratio', min: 0, max: 1 },
  similarity: { unit: 'ratio', min: 0, max: 1 }, mssim: { unit: 'ratio', min: 0, max: 1 }, ssim: { unit: 'ratio', min: 0, max: 1 },
  ink_iou_percent: { unit: 'percent', min: 0, max: 100 }, similarity_percent: { unit: 'percent', min: 0, max: 100 },
  pixel_error: { unit: 'px', min: 0 }, spatial_error: { unit: 'px', min: 0 },
  duration: { unit: 'ms', min: 0 }, latency: { unit: 'ms', min: 0 }, startup_time: { unit: 'ms', min: 0 }, frame_time: { unit: 'ms', min: 0 }
};

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function same(a, b) { return stableJson(a) === stableJson(b); }
function assert(condition, message) { if (!condition) throw new InputError(message); }
function unique(values, label) {
  const set = new Set(values);
  assert(set.size === values.length, `duplicate ${label}`);
  return set;
}

function validateSchema(name, value, label) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), 'utf8')));
  if (!validate(value)) throw new InputError(`${label} failed schema validation: ${ajv.errorsText(validate.errors)}`);
}

function rootFile(root, raw, label) {
  assert(typeof raw === 'string' && raw && !path.isAbsolute(raw), `${label} must be relative to --root`);
  assert(!raw.split(/[\\/]+/).includes('..'), `${label} contains parent traversal`);
  const lexical = path.resolve(root, raw);
  assert(isInside(root, lexical), `${label} escapes --root`);
  let cursor = root;
  for (const segment of path.relative(root, lexical).split(path.sep)) {
    cursor = path.join(cursor, segment);
    try { assert(!fs.lstatSync(cursor).isSymbolicLink(), `${label} path contains a symlink`); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  let stat;
  try { stat = fs.lstatSync(lexical); } catch (_) { throw new InputError(`${label} does not exist: ${raw}`); }
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const canonical = fs.realpathSync(lexical);
  assert(isInside(root, canonical), `${label} resolves outside --root`);
  const bytes = fs.readFileSync(canonical);
  return { path: canonical, relative: path.relative(root, canonical).split(path.sep).join('/'), bytes, sha256: sha256(bytes) };
}

function jsonFile(root, raw, label) {
  const file = rootFile(root, raw, label);
  try { file.value = JSON.parse(file.bytes.toString('utf8')); }
  catch (error) { throw new InputError(`${label} is not valid JSON: ${error.message}`); }
  return file;
}

function explicitFile(root, raw, label) {
  assert(!String(raw).split(/[\\/]+/).includes('..'), `${label} contains parent traversal`);
  const absolute = path.resolve(raw);
  let stat;
  try { stat = fs.lstatSync(absolute); } catch (_) { throw new InputError(`${label} does not exist`); }
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const canonical = fs.realpathSync(absolute);
  assert(isInside(root, canonical), `${label} must be inside --root`);
  return jsonFile(root, path.relative(root, canonical), label);
}

function contextMatches(declared, actual) {
  return declared.sceneId === actual.sceneId && declared.scenarioId === actual.scenarioId
    && declared.stateId === actual.stateId && same(declared.viewport, actual.viewport)
    && declared.deviceProfile === actual.deviceProfile && same(declared.configuration, actual.configuration);
}

function receiptData(root, evidence, protectedPaths) {
  if (evidence.status !== 'PRESENT') return null;
  const file = rootFile(root, evidence.source, `evidence ${evidence.id} source`);
  assert(file.sha256 === evidence.sha256, `evidence ${evidence.id} source hash mismatch`);
  protectedPaths.add(file.path);
  let value = null;
  try { value = JSON.parse(file.bytes.toString('utf8')); } catch (_) { /* binary evidence is permitted */ }
  if (evidence.domain === 'BUILD' || evidence.domain === 'BEHAVIOR') {
    assert(value && (value.outcome === 'PASS' || value.outcome === 'FAIL'), `${evidence.id} requires a structured PASS/FAIL receipt`);
    assert(value.verificationScope, `${evidence.id} receipt must pin verificationScope`);
  }
  if (evidence.metrics && evidence.metrics.length) {
    assert(value && Array.isArray(value.metrics), `${evidence.id} metrics require a structured metric receipt`);
    assert(same(value.metrics, evidence.metrics), `${evidence.id} declared metrics do not match its receipt`);
    assert(value.verificationScope, `${evidence.id} metric receipt must pin verificationScope`);
    unique(value.metrics.map((metric) => `${metric.name}\0${metric.unit || ''}`), `metric identity in ${evidence.id}`);
  }
  if (value && (value.outcome === 'PASS' || value.outcome === 'FAIL')) assert(value.verificationScope, `${evidence.id} decision receipt must pin verificationScope`);
  if (value && value.verificationScope !== undefined) protectedPaths.scopeReceipts.push({ id: evidence.id, value: value.verificationScope });
  if (value && value.sourceReport) {
    assert(typeof value.sourceReport.path === 'string' && typeof value.sourceReport.sha256 === 'string', `${evidence.id} sourceReport is incomplete`);
    const report = rootFile(root, value.sourceReport.path, `${evidence.id} source report`);
    assert(report.sha256 === value.sourceReport.sha256, `${evidence.id} source report hash mismatch`);
    protectedPaths.add(report.path);
  }
  return value;
}

function validateContractSemantics(root, contract, contractFile, protectedPaths) {
  assert(contract.schemaVersion === '1.0.0', 'contract schemaVersion must be exactly 1.0.0');
  assert(contract.acceptanceMatrix.requirementsSha256 === sha256(stableJson(contract.acceptanceMatrix.requirements)), 'contract requirementsSha256 mismatch');
  unique(contract.inputs.map((x) => x.id), 'contract input id');
  unique(contract.acceptanceMatrix.requirements.map((x) => x.id), 'contract requirement id');
  const inputs = new Map();
  for (const input of contract.inputs) {
    const file = rootFile(root, input.path, `contract input ${input.id}`);
    assert(file.sha256 === input.sha256, `contract input ${input.id} hash mismatch`);
    try { file.value = JSON.parse(file.bytes.toString('utf8')); } catch (_) { file.value = null; }
    inputs.set(input.id, { input, file });
    protectedPaths.add(file.path);
  }
  for (const source of Object.values(contract.sources)) {
    const match = [...inputs.values()].find(({ input }) => input.path === source.path && input.sha256 === source.sha256 && input.id === source.artifactId);
    assert(match, `contract source ${source.artifactId} is not an exact hash-pinned input`);
  }
  const appSources = [...inputs.values()].filter(({ input }) => input.kind === 'EXISTING_APP_MODEL');
  const designSources = [...inputs.values()].filter(({ input }) => input.kind === 'DESIGN_EVIDENCE');
  assert(appSources.length === 1 && designSources.length === 1 && appSources[0].file.value && designSources[0].file.value,
    'contract must resolve exactly one JSON app model and design evidence input');
  const appModel = appSources[0].file.value;
  const design = designSources[0].file.value;
  const appEvidence = new Set((appModel.provenance?.evidence || []).map((x) => x.id));
  const uiById = new Map((appModel.uiSymbols || []).map((x) => [x.id, x]));
  const actionById = new Map((appModel.stateActionClues?.actions || []).map((x) => [x.id, x]));
  const designIds = new Set();
  const visitDesign = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.sourceId || node.id) designIds.add(node.sourceId || node.id);
    for (const child of node.children || []) visitDesign(child);
  };
  visitDesign(design.hierarchy);
  for (const scene of Object.values(design.viewportScenes || {})) visitDesign(scene.hierarchy);
  const designEvidenceId = contract.sources.designEvidence.artifactId;
  const validEvidence = new Set([...appEvidence, designEvidenceId]);
  const refs = (item, field) => { for (const ref of item[field] || []) assert(validEvidence.has(ref), `${item.id}.${field} has dangling evidence reference ${ref}`); };
  for (const item of contract.elementMappings) {
    assert(designIds.has(item.designIdentity), `${item.id} has dangling design identity ${item.designIdentity}`);
    const symbol = uiById.get(item.existingUiSymbolRef);
    assert(symbol, `${item.id} has dangling UI symbol ${item.existingUiSymbolRef}`); refs(item, 'evidenceRefs');
    assert(item.evidenceRefs.some((ref) => (symbol.evidenceRefs || []).includes(ref)), `${item.id} does not cite evidence for its UI symbol`);
  }
  for (const item of contract.actionBindings) {
    assert(designIds.has(item.designIdentity), `${item.id} has dangling design identity ${item.designIdentity}`); refs(item, 'evidenceRefs');
    if (item.bindingStatus === 'VERIFIED_EXISTING') {
      const action = actionById.get(item.existingActionRef);
      assert(action, `${item.id} has dangling action ${item.existingActionRef}`);
      assert(item.evidenceRefs.some((ref) => (action.evidenceRefs || []).includes(ref)), `${item.id} does not cite evidence for its action`);
    }
  }
  for (const item of contract.preservationObligations) refs(item, 'sourceEvidenceRefs');
  for (const item of contract.acceptanceMatrix.requirements) refs(item, 'evidenceRefs');
  for (const item of contract.capabilities) refs(item, 'evidenceRefs');
  for (const item of contract.uncertainties) refs(item, 'evidenceRefs');
  unique([
    ...contract.elementMappings, ...contract.actionBindings, ...contract.preservationObligations,
    ...contract.acceptanceMatrix.requirements, ...contract.acceptanceMatrix.requirements.flatMap((x) => x.requiredContexts),
    ...contract.acceptanceMatrix.requirements.flatMap((x) => x.numericBudgets), ...contract.capabilities, ...contract.uncertainties
  ].map((x) => x.id), 'contract object id');
  for (const requirement of contract.acceptanceMatrix.requirements) {
    unique(requirement.requiredContexts.map((x) => x.id), `context id in ${requirement.id}`);
    unique(requirement.numericBudgets.map((x) => x.id), `budget id in ${requirement.id}`);
  }
  for (const allowed of contract.implementationBoundary.allowedPaths) {
    const parts = allowed.split('/');
    assert(!allowed.endsWith('/') && !/[?*]/.test(allowed) && !parts.includes('.') && !parts.includes('..')
      && path.posix.normalize(allowed) === allowed && parts.length >= 4 && parts.includes('src'), `allowed path is broad or non-normalized: ${allowed}`);
  }
  const approvals = new Map();
  for (const { input, file } of inputs.values()) {
    if (input.kind !== 'OWNER_APPROVAL') continue;
    let value;
    try { value = JSON.parse(file.bytes.toString('utf8')); } catch (_) { throw new InputError(`owner approval ${input.id} is not JSON`); }
    validateSchema('owner-approval.schema.json', value, `owner approval ${input.id}`);
    assert(value.id === input.id, `owner approval ${input.id} identity mismatch`);
    approvals.set(input.id, value);
  }
  const usedApprovals = new Set();
  const approval = (ref, subject, statement) => {
    const value = approvals.get(ref);
    assert(value && value.scopes.some((scope) => scope.subjectRef === subject && scope.statement === statement), `owner approval ${ref} does not cover exact subject/statement for ${subject}`);
    usedApprovals.add(ref);
  };
  for (const item of contract.elementMappings.filter((x) => x.ownerApprovalRef)) approval(item.ownerApprovalRef, item.id, item.ownerApprovalStatement);
  for (const item of contract.actionBindings.filter((x) => x.ownerApprovalRef)) approval(item.ownerApprovalRef, item.id, item.newBehaviorStatement);
  for (const item of contract.preservationObligations.filter((x) => x.ownerApprovalRef)) approval(item.ownerApprovalRef, item.id, item.statement);
  for (const item of contract.capabilities.filter((x) => x.ownerApprovalRef)) approval(item.ownerApprovalRef, item.id, item.rationale);
  for (const id of approvals.keys()) assert(usedApprovals.has(id), `unused owner approval input: ${id}`);
  const blockingConditions = [
    ...contract.capabilities.filter((x) => x.status === 'UNSUPPORTED_BLOCKING').map((x) => x.id),
    ...contract.uncertainties.filter((x) => x.impact === 'BLOCKING').map((x) => x.id)
  ].sort();
  const blocked = blockingConditions.length > 0;
  protectedPaths.add(contractFile.path);
  return { inputs, blocked, blockingConditions, appModel };
}

function budgetStatus(budget, result, evidenceById, contextId) {
  const spec = METRICS[budget.metric];
  if (!spec) {
    assert(result.status === 'BLOCKED' && result.observed === undefined, `unsupported metric ${budget.metric} must be BLOCKED`);
    return 'BLOCKED';
  }
  assert(budget.unit === spec.unit, `budget ${budget.id} uses unsupported unit ${budget.unit} for ${budget.metric}`);
  assert(budget.threshold >= spec.min && (spec.max === undefined || budget.threshold <= spec.max), `budget ${budget.id} threshold is outside the supported metric range`);
  const candidates = result.evidenceRefs.map((id) => evidenceById.get(id)).filter(Boolean);
  const metrics = candidates.flatMap((evidence) => (evidence.status === 'PRESENT' && ['CANDIDATE', 'COMPARISON'].includes(evidence.phase)
    ? (evidence.metrics || []).filter((m) => m.name === budget.metric && (m.unit || '') === budget.unit)
    : []));
  if (!metrics.length) {
    assert(result.status === 'BLOCKED' && result.observed === undefined, `budget ${budget.id} has no supported metric and must be BLOCKED`);
    return 'BLOCKED';
  }
  const values = unique(metrics.map((m) => `${m.value}:${m.unit || ''}`), `observed metric for budget ${budget.id}`);
  assert(values.size === 1, `budget ${budget.id} has conflicting observed metrics`);
  const observed = metrics[0].value;
  assert(result.unit === budget.unit && result.observed === observed, `budget ${budget.id} observed value/unit does not match evidence`);
  assert(observed >= spec.min && (spec.max === undefined || observed <= spec.max), `budget ${budget.id} observed value is outside the supported metric range`);
  const pass = budget.operator === 'AT_LEAST' ? observed >= budget.threshold
    : budget.operator === 'AT_MOST' ? observed <= budget.threshold : observed === budget.threshold;
  const derived = pass ? 'PASS' : 'FAIL';
  assert(result.status === derived, `budget ${budget.id} status is inconsistent with evidence`);
  return derived;
}

function validateResult(root, contract, contractFile, result, protectedPaths, contractBlocked, blockingConditions, appModel, candidateInfo) {
  assert(result.schemaVersion === '1.0.0', 'result schemaVersion must be exactly 1.0.0');
  unique(result.inputs.map((x) => x.id), 'result input id');
  unique(result.evidence.map((x) => x.id), 'evidence id');
  unique(result.requirements.map((x) => x.id), 'result requirement id');
  unique(result.defects.map((x) => x.id), 'defect id');
  unique(result.blockers.map((x) => x.id), 'blocker id');
  unique([...result.inputs, ...result.requirements, ...result.evidence, ...result.defects, ...result.blockers].map((x) => x.id), 'result object id');
  const contractInputs = result.inputs.filter((x) => x.kind === 'RETROFIT_CONTRACT');
  assert(contractInputs.length === 1, 'result requires exactly one RETROFIT_CONTRACT input');
  const contractInput = contractInputs[0];
  const resultInputFiles = new Map();
  for (const input of result.inputs) {
    const file = rootFile(root, input.path, `result input ${input.id}`);
    assert(file.sha256 === input.sha256, `result input ${input.id} hash mismatch`);
    resultInputFiles.set(input.id, { input, file });
    protectedPaths.add(file.path);
  }
  assert(contractInput.sha256 === contractFile.sha256 && fs.realpathSync(path.join(root, contractInput.path)) === contractFile.path, 'result contract input does not identify supplied contract');
  assert(result.subject.retrofitContractId === contract.id && result.subject.retrofitContractSha256 === contractFile.sha256, 'result subject contract identity mismatch');
  assert(result.subject.acceptanceMatrixSha256 === contract.acceptanceMatrix.requirementsSha256, 'result acceptance hash mismatch');

  const baselineArtifacts = result.inputs.filter((x) => x.kind === 'BASELINE_ARTIFACT');
  const candidateArtifacts = result.inputs.filter((x) => x.kind === 'CANDIDATE_ARTIFACT');
  assert(baselineArtifacts.length <= 1 && candidateArtifacts.length <= 1, 'duplicate baseline/candidate artifact inputs');
  if (result.subject.buildArtifactSha256) {
    assert(candidateArtifacts.length === 1 && candidateArtifacts[0].sha256 === result.subject.buildArtifactSha256, 'candidate artifact is not linked to subject buildArtifactSha256');
  }

  const contractRequirements = new Map(contract.acceptanceMatrix.requirements.map((x) => [x.id, x]));
  assert(result.requirements.length === contractRequirements.size, 'result requirement set does not exactly cover the contract');
  assert(new Set(result.requirements.map((x) => x.contractRequirementRef)).size === result.requirements.length, 'duplicate contract requirement coverage');
  for (const ref of result.requirements.map((x) => x.contractRequirementRef)) assert(contractRequirements.has(ref), `unknown contract requirement ${ref}`);

  const evidenceById = new Map(result.evidence.map((x) => [x.id, x]));
  const evidenceContextAssignments = new Map();
  const referencedEvidence = new Set();
  const pairKeys = new Set();
  const receipts = new Map();
  for (const evidence of result.evidence) {
    const pairKey = `${evidence.pairId}\0${evidence.domain}\0${evidence.phase}`;
    assert(!pairKeys.has(pairKey), `duplicate ${evidence.phase} member for pair ${evidence.pairId}/${evidence.domain}`);
    pairKeys.add(pairKey);
    if (evidence.status === 'PRESENT' && evidence.phase === 'BASELINE') assert(baselineArtifacts.some((x) => x.sha256 === evidence.context.subjectArtifactSha256), `${evidence.id} baseline artifact identity mismatch`);
    if (evidence.status === 'PRESENT' && evidence.phase === 'CANDIDATE') assert(candidateArtifacts.some((x) => x.sha256 === evidence.context.subjectArtifactSha256), `${evidence.id} candidate artifact identity mismatch`);
    receipts.set(evidence.id, receiptData(root, evidence, protectedPaths));
    assert(evidence.context.deviceProfile === result.subject.deviceProfile && evidence.context.configuration.buildVariant === result.subject.buildVariant,
      `${evidence.id} device/build context does not match the result subject`);
  }
  for (const { id, value } of protectedPaths.scopeReceipts) assert(same(value, result.verificationScope), `${id} verification scope does not match result scope`);

  const pairGroups = new Map();
  for (const evidence of result.evidence) {
    const key = `${evidence.pairId}\0${evidence.domain}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(evidence);
  }
  for (const group of pairGroups.values()) {
    const base = group.find((x) => x.phase === 'BASELINE');
    const candidate = group.find((x) => x.phase === 'CANDIDATE');
    if (base && candidate) {
      assert(same(base.context.viewport, candidate.context.viewport) && base.context.deviceProfile === candidate.context.deviceProfile
        && same(base.context.configuration, candidate.context.configuration) && same(base.context.producerRuntime, candidate.context.producerRuntime)
        && base.context.sceneId === candidate.context.sceneId && base.context.scenarioId === candidate.context.scenarioId
        && base.context.stateId === candidate.context.stateId, `pair ${base.pairId}/${base.domain} baseline and candidate contexts differ`);
    }
    const comparison = group.find((x) => x.phase === 'COMPARISON');
    if (comparison) {
      assert(base && candidate, `comparison pair ${comparison.pairId}/${comparison.domain} lacks baseline or candidate`);
      assert(same(comparison.context.viewport, base.context.viewport) && comparison.context.deviceProfile === base.context.deviceProfile
        && same(comparison.context.configuration, base.context.configuration) && same(comparison.context.producerRuntime, base.context.producerRuntime)
        && comparison.context.sceneId === base.context.sceneId && comparison.context.scenarioId === base.context.scenarioId
        && comparison.context.stateId === base.context.stateId, `comparison pair ${comparison.pairId}/${comparison.domain} context mismatch`);
    }
  }

  const buildReceipts = result.evidence.filter((x) => x.domain === 'BUILD' && x.status === 'PRESENT');
  for (const build of buildReceipts) {
    const receipt = receipts.get(build.id);
    assert(receipt && /^[a-f0-9]{40}$/.test(receipt.repositoryRevision || '')
      && /^[a-f0-9]{64}$/.test(receipt.sourceSnapshotSha256 || '')
      && /^[a-f0-9]{64}$/.test(receipt.artifactSha256 || '') && Array.isArray(receipt.changedPaths),
    `${build.id} build receipt lacks revision/source/artifact/changedPaths provenance`);
    assert(receipt.sourceSnapshotSha256 === build.context.sourceSnapshotSha256
      && receipt.artifactSha256 === build.context.subjectArtifactSha256, `${build.id} build receipt provenance does not match evidence context`);
    if (build.phase === 'BASELINE') {
      assert(receipt.repositoryRevision === appModel.provenance.revision.commit, `${build.id} baseline revision does not match the inspected app model`);
      assert(receipt.changedPaths.length === 0, `${build.id} baseline receipt must not claim changed paths`);
    }
    if (build.phase === 'CANDIDATE') {
      assert(receipt.repositoryRevision === result.subject.repositoryRevision, `${build.id} candidate revision does not match result subject`);
      assert(receipt.artifactSha256 === result.subject.buildArtifactSha256, `${build.id} candidate artifact does not match result subject`);
      assert((receipt.workingTreeDiffSha256 || undefined) === result.subject.workingTreeDiffSha256, `${build.id} candidate dirty-tree digest does not match result subject`);
      for (const changed of receipt.changedPaths) {
        assert(typeof changed === 'string' && !path.posix.isAbsolute(changed) && path.posix.normalize(changed) === changed && !changed.split('/').includes('..'), `${build.id} has invalid changed path`);
        assert(contract.implementationBoundary.allowedPaths.some((allowed) => changed === allowed || changed.startsWith(`${allowed}/`)), `${build.id} changed path is outside the contract boundary: ${changed}`);
      }
      if (receipt.changedPaths.length && receipt.repositoryRevision === appModel.provenance.revision.commit) {
        assert(/^[a-f0-9]{64}$/.test(receipt.workingTreeDiffSha256 || ''), `${build.id} changed baseline revision requires a dirty-tree digest`);
      }
      if (candidateInfo) {
        assert(receipt.repositoryRevision === candidateInfo.revision.commit, `${build.id} revision does not match --candidate`);
        assert((receipt.workingTreeDiffSha256 || undefined) === candidateInfo.revision.workingTreeDiffSha256, `${build.id} dirty digest does not match --candidate`);
        assert(same([...receipt.changedPaths].sort(), candidateInfo.changedPaths), `${build.id} changedPaths do not exactly match --candidate`);
        assert(receipt.sourceSnapshotSha256 === candidateInfo.sourceSnapshotSha256, `${build.id} source snapshot does not match --candidate`);
      }
    }
  }
  for (const evidence of result.evidence.filter((x) => x.status === 'PRESENT' && ['BASELINE', 'CANDIDATE'].includes(x.phase))) {
    const build = buildReceipts.find((x) => x.phase === evidence.phase && contextMatches({
      sceneId: evidence.context.sceneId, scenarioId: evidence.context.scenarioId, stateId: evidence.context.stateId,
      viewport: evidence.context.viewport, deviceProfile: evidence.context.deviceProfile, configuration: evidence.context.configuration
    }, x.context));
    assert(build, `${evidence.id} lacks a matching ${evidence.phase} build provenance receipt`);
    assert(evidence.context.sourceSnapshotSha256 === build.context.sourceSnapshotSha256
      && evidence.context.subjectArtifactSha256 === build.context.subjectArtifactSha256, `${evidence.id} does not match its build provenance receipt`);
  }

  const derivedRequirements = [];
  for (const resultRequirement of result.requirements) {
    const requirement = contractRequirements.get(resultRequirement.contractRequirementRef);
    assert(resultRequirement.description === requirement.description, `${requirement.id} description mismatch`);
    assert(requirement.domains.includes(CATEGORY_DOMAIN[resultRequirement.category]), `${requirement.id} result category is outside its contract domains`);
    const contexts = new Map(requirement.requiredContexts.map((x) => [x.id, x]));
    assert(resultRequirement.contextResults.length === contexts.size, `${requirement.id} context set mismatch`);
    unique(resultRequirement.contextResults.map((x) => x.contractContextRef), `context result in ${requirement.id}`);
    const union = new Set();
    const contextStatuses = [];
    for (const contextResult of resultRequirement.contextResults) {
      const declared = contexts.get(contextResult.contractContextRef);
      assert(declared, `unknown context ${contextResult.contractContextRef} in ${requirement.id}`);
      unique(contextResult.evidenceRefs, `evidence ref in context ${declared.id}`);
      const contextEvidence = contextResult.evidenceRefs.map((id) => {
        const evidence = evidenceById.get(id);
        assert(evidence, `dangling evidence ref ${id}`);
        assert(requirement.domains.includes(evidence.domain), `${id} domain does not belong to ${requirement.id}`);
        assert(contextMatches(declared, evidence.context), `${id} context does not belong to ${declared.id}`);
        if (evidenceContextAssignments.has(id) && evidenceContextAssignments.get(id) !== declared.id) throw new InputError(`${id} is cross-wired to multiple contexts`);
        evidenceContextAssignments.set(id, declared.id);
        union.add(id); referencedEvidence.add(id);
        return evidence;
      });
      const budgetById = new Map(requirement.numericBudgets.map((x) => [x.id, x]));
      assert(contextResult.budgetResults.length === budgetById.size, `budget set mismatch for ${requirement.id}/${declared.id}`);
      unique(contextResult.budgetResults.map((x) => x.contractBudgetRef), `budget result in ${declared.id}`);
      const budgetStatuses = contextResult.budgetResults.map((br) => {
        const budget = budgetById.get(br.contractBudgetRef);
        assert(budget, `unknown budget ${br.contractBudgetRef}`);
        for (const ref of br.evidenceRefs) assert(evidenceContextAssignments.get(ref) === declared.id, `budget ${budget.id} cites evidence outside ${declared.id}`);
        return budgetStatus(budget, br, evidenceById, declared.id);
      });
      let failure = budgetStatuses.includes('FAIL');
      let blocked = budgetStatuses.includes('BLOCKED');
      const phaseSnapshots = new Map();
      for (const domain of requirement.domains) {
        const domainPairIds = new Set();
        for (const phase of ['BASELINE', 'CANDIDATE']) {
          const matches = contextEvidence.filter((x) => x.domain === domain && x.phase === phase && x.required);
          assert(matches.length <= 1, `${requirement.id}/${declared.id}/${domain}/${phase} has ambiguous duplicate coverage`);
          const found = matches[0];
          if (!found || found.status !== 'PRESENT') blocked = true;
          else {
            domainPairIds.add(found.pairId);
            if (!phaseSnapshots.has(phase)) phaseSnapshots.set(phase, found.context.sourceSnapshotSha256);
            else assert(phaseSnapshots.get(phase) === found.context.sourceSnapshotSha256, `${requirement.id}/${declared.id} ${phase} source snapshots differ`);
            if ((domain === 'BUILD' || domain === 'BEHAVIOR') && receipts.get(found.id)?.outcome === 'FAIL') failure = true;
          }
        }
        if (!blocked) assert(domainPairIds.size === 1, `${requirement.id}/${declared.id}/${domain} baseline and candidate pairId mismatch`);
        if (!['BUILD', 'BEHAVIOR'].includes(domain)) {
          const budgetBacked = contextResult.budgetResults.some((budgetResult) => budgetResult.evidenceRefs.some((ref) => evidenceById.get(ref)?.domain === domain));
          if (!budgetBacked) {
            const comparisons = contextEvidence.filter((x) => x.domain === domain && x.phase === 'COMPARISON' && x.required);
            assert(comparisons.length <= 1, `${requirement.id}/${declared.id}/${domain} has ambiguous comparison coverage`);
            const comparisonReceipt = comparisons[0] && receipts.get(comparisons[0].id);
            if (!comparisons[0] || comparisons[0].status !== 'PRESENT' || !['PASS', 'FAIL'].includes(comparisonReceipt?.outcome)) blocked = true;
            else if (comparisonReceipt.outcome === 'FAIL') failure = true;
          }
        }
      }
      const derived = failure ? 'FAIL' : blocked ? 'BLOCKED' : 'PASS';
      assert(contextResult.status === derived, `${requirement.id}/${declared.id} status should be ${derived}`);
      contextStatuses.push(derived);
    }
    assert(same([...union].sort(), [...resultRequirement.evidenceRefs].sort()), `${requirement.id} evidenceRefs must equal its context evidence union`);
    let derived = contextStatuses.includes('FAIL') ? 'FAIL' : contextStatuses.includes('BLOCKED') ? 'BLOCKED' : 'PASS';
    if (contractBlocked && derived === 'PASS' && derivedRequirements.length === 0) derived = 'BLOCKED';
    assert(resultRequirement.status === derived, `${requirement.id} status should be ${derived}`);
    derivedRequirements.push({ id: resultRequirement.id, status: derived });
  }
  assert(referencedEvidence.size === result.evidence.length, 'result contains evidence not assigned to a requirement context');

  const requiredEvidence = result.evidence.filter((x) => x.required);
  const declaredMissing = [...result.evidenceCompleteness.missingRequiredEvidenceIds].sort();
  const absentMissing = declaredMissing.filter((id) => !evidenceById.has(id));
  const missing = requiredEvidence.filter((x) => x.status === 'MISSING' || x.status === 'NOT_RUN').map((x) => x.id).concat(absentMissing).sort();
  const invalid = requiredEvidence.filter((x) => x.status === 'INVALID').map((x) => x.id).sort();
  assert(same(missing, declaredMissing), 'missing evidence completeness list mismatch');
  assert(same(invalid, [...result.evidenceCompleteness.invalidRequiredEvidenceIds].sort()), 'invalid evidence completeness list mismatch');
  assert(!declaredMissing.some((id) => result.evidenceCompleteness.invalidRequiredEvidenceIds.includes(id)), 'missing and invalid evidence lists overlap');
  assert(result.evidenceCompleteness.requiredCount === requiredEvidence.length + absentMissing.length, 'required evidence count mismatch');
  assert(result.evidenceCompleteness.presentRequiredCount === requiredEvidence.filter((x) => x.status === 'PRESENT').length, 'present required evidence count mismatch');
  const complete = missing.length === 0 && invalid.length === 0 && requiredEvidence.every((x) => x.status === 'PRESENT');
  assert(result.evidenceCompleteness.complete === complete, 'evidence completeness boolean mismatch');

  const failed = derivedRequirements.filter((x) => x.status === 'FAIL');
  const blocked = derivedRequirements.filter((x) => x.status === 'BLOCKED');
  const passed = derivedRequirements.filter((x) => x.status === 'PASS');
  const outcome = failed.length ? 'FAIL' : blocked.length || !complete || contractBlocked ? 'BLOCKED' : 'PASS';
  assert(result.outcome === outcome, `declared outcome ${result.outcome} should be ${outcome}`);
  const expectedSummary = { passedRequirementCount: passed.length, failedRequirementCount: failed.length, blockedRequirementCount: blocked.length,
    defectCount: result.defects.length, blockerCount: result.blockers.length };
  assert(same(result.summary, expectedSummary), 'summary counts do not match recomputed decision');
  const reqIds = new Set(result.requirements.map((x) => x.id));
  const reqStatus = new Map(derivedRequirements.map((x) => [x.id, x.status]));
  for (const item of [...result.defects, ...result.blockers]) {
    assert(reqIds.has(item.requirementRef), `${item.id} references an unknown result requirement`);
    for (const ref of item.evidenceRefs || []) assert(evidenceById.has(ref), `${item.id} has dangling evidence ref ${ref}`);
  }
  for (const item of result.defects) assert(reqStatus.get(item.requirementRef) === 'FAIL', `${item.id} is attached to a non-FAIL requirement`);
  for (const item of result.blockers) assert(reqStatus.get(item.requirementRef) === 'BLOCKED' || contractBlocked, `${item.id} is attached to a non-BLOCKED requirement`);
  const declaredContractConditions = [...new Set(result.blockers.flatMap((item) => item.contractConditionRefs || []))].sort();
  assert(same(declaredContractConditions, blockingConditions), 'blockers must cite the exact blocking contract capability/uncertainty set');
  if (contractBlocked) assert(result.blockers.length > 0, 'blocking contract condition must remain as a structured blocker');
  for (const item of failed) assert(result.defects.some((x) => x.requirementRef === item.id), `failed requirement ${item.id} lacks a defect`);
  for (const item of blocked) assert(result.blockers.some((x) => x.requirementRef === item.id), `blocked requirement ${item.id} lacks a blocker`);
  return { outcome, summary: expectedSummary };
}

function renderReport(result, decision) {
  const scope = result.verificationScope.kind === 'fixture-replay'
    ? `fixture-replay only (${result.verificationScope.fixtureId}); not project or release acceptance`
    : `project candidate (${result.verificationScope.projectId})`;
  const lines = ['# Semantic verification report', '', `Outcome: **${decision.outcome}**`, `Scope: ${scope}`,
    `Result: \`${result.id}\``, `Contract: \`${result.subject.retrofitContractId}\``, '', '## Requirements', ''];
  for (const req of result.requirements) lines.push(`- ${req.status} \`${req.contractRequirementRef}\`: ${req.description}`);
  if (result.defects.length) lines.push('', '## Defects', '', ...result.defects.map((x) => `- ${x.severity} \`${x.id}\`: ${x.summary}`));
  if (result.blockers.length) lines.push('', '## Blockers', '', ...result.blockers.map((x) => {
    const refs = x.contractConditionRefs?.length ? ` Contract conditions: ${x.contractConditionRefs.map((ref) => `\`${ref}\``).join(', ')}.` : '';
    return `- \`${x.id}\`: ${x.reason}${refs}`;
  }));
  return `${lines.join('\n')}\n`;
}

function verify({ root: rootRaw, contract: contractRaw, result: resultRaw, candidate: candidateRaw }) {
  assert(rootRaw, '--root is required'); assert(contractRaw, '--contract is required'); assert(resultRaw, '--result is required');
  let root;
  try { root = fs.realpathSync(path.resolve(rootRaw)); } catch (_) { throw new InputError('--root must be an existing directory'); }
  assert(fs.statSync(root).isDirectory(), '--root must be a directory');
  const contractFile = explicitFile(root, contractRaw, '--contract');
  const resultFile = explicitFile(root, resultRaw, '--result');
  validateSchema('retrofit-contract.schema.json', contractFile.value, 'contract');
  validateSchema('verification-result.schema.json', resultFile.value, 'result');
  if (resultFile.value.verificationScope.kind === 'project-candidate') {
    const marker = readWorkspace(root);
    assertNoSourceSensitiveSymlinks(marker.androidRoot, 'inspected baseline');
  }
  const protectedPaths = new Set([contractFile.path, resultFile.path]); protectedPaths.scopeReceipts = [];
  const rebuilt = buildAgentPacket(root, contractFile.path);
  protectedPaths.add(fs.realpathSync(path.join(root, '.ctc-workspace.json')));
  for (const sourcePath of rebuilt.sourcePaths) protectedPaths.add(sourcePath);
  const contractSemantic = validateContractSemantics(root, contractFile.value, contractFile, protectedPaths);
  let candidateInfo = null;
  if (resultFile.value.verificationScope.kind === 'project-candidate') {
    assert(candidateRaw, '--candidate is required for project-candidate verification');
    assert(contractSemantic.appModel.provenance.revision.dirty === false, 'project-candidate verification requires a clean committed inspected baseline');
    assert(!String(candidateRaw).split(/[\\/]+/).includes('..'), '--candidate contains parent traversal');
    const lexicalCandidate = path.resolve(candidateRaw);
    let candidateStat;
    try { candidateStat = fs.lstatSync(lexicalCandidate); } catch (_) { throw new InputError('--candidate must be an existing Git worktree'); }
    assert(candidateStat.isDirectory() && !candidateStat.isSymbolicLink(), '--candidate must be a non-symlink directory');
    const candidateRoot = fs.realpathSync(lexicalCandidate);
    const baselineRoot = fs.realpathSync(contractSemantic.appModel.provenance.repository.root);
    assert(candidateRoot !== baselineRoot, '--candidate must differ from the immutable baseline checkout');
    assertNoSourceSensitiveSymlinks(candidateRoot, 'candidate worktree');
    assert(gitCommonDirectory(candidateRoot) === gitCommonDirectory(baselineRoot), '--candidate must be a worktree of the inspected baseline repository');
    const revision = gitMetadata(candidateRoot);
    const gitVisiblePaths = gitChangedPaths(candidateRoot, contractSemantic.appModel.provenance.revision.commit);
    const baselineIgnored = gitIgnoredSourceEvidence(baselineRoot);
    const candidateIgnored = gitIgnoredSourceEvidence(candidateRoot);
    const baselineIgnoredByPath = new Map(baselineIgnored.map((item) => [item.path, item.sha256]));
    const candidateIgnoredByPath = new Map(candidateIgnored.map((item) => [item.path, item.sha256]));
    const changedIgnoredPaths = [...new Set([...baselineIgnoredByPath.keys(), ...candidateIgnoredByPath.keys()])]
      .filter((sourcePath) => baselineIgnoredByPath.get(sourcePath) !== candidateIgnoredByPath.get(sourcePath));
    const changedPaths = [...new Set([...gitVisiblePaths, ...changedIgnoredPaths])].sort();
    const sourceSnapshotSha256 = sha256(stableJson({
      repositoryRevision: revision.commit, workingTreeDiffSha256: revision.workingTreeDiffSha256 || null,
      changedPaths, ignoredSourceEvidence: candidateIgnored
    }));
    candidateInfo = { root: candidateRoot, revision, changedPaths, sourceSnapshotSha256 };
    assert(resultFile.value.subject.repositoryRevision === revision.commit, 'result subject revision does not match --candidate');
    assert((resultFile.value.subject.workingTreeDiffSha256 || undefined) === revision.workingTreeDiffSha256, 'result subject dirty digest does not match --candidate');
  }
  const decision = validateResult(root, contractFile.value, contractFile, resultFile.value, protectedPaths,
    contractSemantic.blocked, contractSemantic.blockingConditions, contractSemantic.appModel, candidateInfo);
  return { result: resultFile.value, decision, report: renderReport(resultFile.value, decision), protectedPaths: [...protectedPaths] };
}

function safeReportPath(rootRaw, reportRaw, protectedPaths) {
  const lexicalRoot = path.resolve(rootRaw);
  const root = fs.realpathSync(lexicalRoot);
  const lexical = path.resolve(reportRaw);
  assert(!String(reportRaw).split(/[\\/]+/).includes('..'), '--report must not contain parent traversal');
  assert(isInside(lexicalRoot, lexical), '--report must be inside --root');
  let cursor = lexicalRoot;
  for (const segment of path.relative(lexicalRoot, lexical).split(path.sep)) {
    cursor = path.join(cursor, segment);
    try { assert(!fs.lstatSync(cursor).isSymbolicLink(), '--report path contains a symlink'); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
  const target = canonicalPlannedPath(lexical);
  assert(isInside(root, target), '--report must be inside --root');
  let stat;
  try { stat = fs.lstatSync(lexical); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(!stat || (stat.isFile() && !stat.isSymbolicLink()), '--report must not be a symlink or non-file');
  assert(!protectedPaths.includes(target), '--report collides with a protected verification input');
  return target;
}

module.exports = { verify, renderReport, safeReportPath };
