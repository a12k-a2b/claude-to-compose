'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { InputError, canonicalPlannedPath, isInside, resolveExplicit } = require('./safety');
const { gitMetadata } = require('./inspect_app');

const ROOT = path.resolve(__dirname, '..');
const SCHEMAS = path.join(ROOT, 'schemas/v1');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), 'utf8'));
}

function validator(name) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true });
  addFormats(ajv);
  return { ajv, validate: ajv.compile(schema(name)) };
}

function validateOrThrow(name, value, label) {
  const { ajv, validate } = validator(name);
  if (!validate(value)) throw new InputError(`${label} failed schema validation: ${ajv.errorsText(validate.errors)}`);
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InputError('non-finite numbers cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  throw new InputError('unsupported value in canonical JSON');
}

function ensureUnique(items, getter, label) {
  const seen = new Set();
  for (const item of items) {
    const value = getter(item);
    if (seen.has(value)) throw new InputError(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function workspaceFile(workspace, raw, label) {
  const resolved = resolveExplicit(raw, label);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch (_) { throw new InputError(`${label} does not exist: ${resolved}`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new InputError(`${label} must be a regular, non-symlink file`);
  const canonicalWorkspace = fs.realpathSync(workspace);
  const canonical = fs.realpathSync(resolved);
  if (!isInside(canonicalWorkspace, canonical)) throw new InputError(`${label} must be inside the declared workspace`);
  const bytes = fs.readFileSync(canonical);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch (error) { throw new InputError(`${label} is not valid JSON: ${error.message}`); }
  return { path: canonical, relative: path.relative(canonicalWorkspace, canonical).split(path.sep).join('/'), bytes, sha256: sha256(bytes), value };
}

function collectDesign(design) {
  const identities = new Set();
  const interactive = new Set();
  const visit = (node, treeSeen) => {
    if (!node || typeof node !== 'object') throw new InputError('design hierarchy contains a non-object node');
    const identity = typeof node.sourceId === 'string' && node.sourceId ? node.sourceId : node.id;
    if (typeof identity !== 'string' || !identity) throw new InputError('every design node requires a stable sourceId or id');
    if (treeSeen.has(identity)) throw new InputError(`duplicate design identity in one hierarchy: ${identity}`);
    treeSeen.add(identity);
    identities.add(identity);
    if (node.interactions?.isClickable === true || node.interaction?.clickable === true || node.interaction?.actionName) interactive.add(identity);
    for (const child of node.children || []) visit(child, treeSeen);
  };
  visit(design.hierarchy, new Set());
  for (const scene of Object.values(design.viewportScenes || {})) visit(scene.hierarchy, new Set());
  return { identities, interactive };
}

function sorted(items) {
  return structuredClone(items).sort((a, b) => a.id.localeCompare(b.id));
}

function requireRefs(items, valid, fields) {
  for (const item of items) {
    for (const field of fields) {
      const refs = Array.isArray(item[field]) ? item[field] : item[field] ? [item[field]] : [];
      for (const ref of refs) if (!valid.has(ref)) throw new InputError(`${item.id}.${field} has dangling reference: ${ref}`);
    }
  }
}

function approvalFor(ref, approvals, subject, statement) {
  const approval = approvals.get(ref);
  if (!approval) throw new InputError(`missing owner approval ${ref} for ${subject}`);
  if (!approval.scopes.some((scope) => scope.subjectRef === subject && scope.statement === statement)) {
    throw new InputError(`owner approval ${ref} does not cover exact subject/statement for ${subject}`);
  }
}

function validateBoundary(androidRoot, appModel, boundary) {
  const root = fs.realpathSync(androidRoot);
  const moduleDirectories = appModel.modules.map((module) => module.gradlePath.slice(1).replaceAll(':', '/'));
  for (const allowed of boundary.allowedPaths) {
    const segments = allowed.split('/');
    if (allowed.endsWith('/') || allowed.includes('*') || allowed.includes('?') || segments.includes('.') || segments.includes('..') || path.posix.normalize(allowed) !== allowed) {
      throw new InputError(`allowed path is not normalized or contains a glob: ${allowed}`);
    }
    const supportedModule = moduleDirectories.find((directory) => allowed.startsWith(`${directory}/src/`));
    if (!supportedModule || allowed.split('/').length < supportedModule.split('/').length + 4) {
      throw new InputError(`allowed path is too broad or outside an observed module source set: ${allowed}`);
    }
    const target = canonicalPlannedPath(path.join(androidRoot, allowed));
    if (!isInside(root, target)) throw new InputError(`allowed path escapes the Android root: ${allowed}`);
  }
}

function validateCapturedEvidence(androidRoot, appModel) {
  const root = fs.realpathSync(androidRoot);
  const evidenceById = new Map();
  const evidencePaths = new Set();
  for (const evidence of appModel.provenance.evidence) {
    if (evidenceById.has(evidence.id)) throw new InputError(`duplicate app evidence id: ${evidence.id}`);
    evidenceById.set(evidence.id, evidence);
    if (evidence.kind !== 'SOURCE_FILE') continue;
    if (evidencePaths.has(evidence.path)) throw new InputError(`duplicate source evidence path: ${evidence.path}`);
    evidencePaths.add(evidence.path);
    const lexical = path.resolve(androidRoot, evidence.path);
    if (!isInside(path.resolve(androidRoot), lexical)) throw new InputError(`source evidence escapes Android root: ${evidence.path}`);
    let stat;
    try { stat = fs.lstatSync(lexical); } catch (_) { throw new InputError(`captured source evidence is missing: ${evidence.path}`); }
    if (stat.isSymbolicLink() || !stat.isFile()) throw new InputError(`captured source evidence must be a regular non-symlink file: ${evidence.path}`);
    const canonical = fs.realpathSync(lexical);
    if (!isInside(root, canonical)) throw new InputError(`captured source evidence escapes Android root: ${evidence.path}`);
    if (sha256(fs.readFileSync(canonical)) !== evidence.sha256) throw new InputError(`captured source evidence hash mismatch: ${evidence.path}`);
  }
  const located = [
    ...appModel.uiSymbols.map((item) => [item, 'UI symbol']),
    ...appModel.stateActionClues.states.map((item) => [item, 'state clue']),
    ...appModel.stateActionClues.actions.map((item) => [item, 'action clue']),
    ...appModel.tests.map((item) => [item, 'test clue'])
  ];
  for (const [item, label] of located) {
    const resolved = item.evidenceRefs.map((ref) => evidenceById.get(ref));
    if (resolved.some((entry) => !entry)) throw new InputError(`${label} ${item.id} has dangling evidence reference`);
    if (!resolved.some((entry) => entry.kind === 'SOURCE_FILE' && entry.path === item.location.path)) {
      throw new InputError(`${label} ${item.id} is not tied to source evidence at ${item.location.path}`);
    }
  }
  for (const item of [...appModel.modules, ...appModel.buildCommandClues, ...appModel.uncertainties]) {
    for (const ref of item.evidenceRefs) if (!evidenceById.has(ref)) throw new InputError(`${item.id} has dangling evidence reference: ${ref}`);
  }
}

function buildContract(options) {
  const workspace = resolveExplicit(options.workspace, '--workspace');
  const androidRoot = resolveExplicit(options.android, '--android');
  if (!fs.statSync(androidRoot).isDirectory()) throw new InputError('--android must be a directory');
  const app = workspaceFile(workspace, options.appModel, '--app-model');
  const design = workspaceFile(workspace, options.designSpec, '--design-spec');
  const correspondence = workspaceFile(workspace, options.correspondence, '--correspondence');
  const behavior = workspaceFile(workspace, options.behaviorManifest, '--behavior-manifest');

  validateOrThrow('existing-app-model.schema.json', app.value, 'app model');
  validateOrThrow('../../extractor/schema.json', design.value, 'design spec');
  validateOrThrow('correspondence-manifest.schema.json', correspondence.value, 'correspondence manifest');
  validateOrThrow('behavior-manifest.schema.json', behavior.value, 'behavior manifest');
  let modelRoot;
  try { modelRoot = fs.realpathSync(app.value.provenance.repository.root); } catch (_) { throw new InputError('app model repository root no longer exists'); }
  if (modelRoot !== fs.realpathSync(androidRoot)) throw new InputError('app model repository root does not match --android');
  const currentRevision = gitMetadata(androidRoot);
  const recordedRevision = app.value.provenance.revision;
  if (currentRevision.commit !== recordedRevision.commit || currentRevision.dirty !== recordedRevision.dirty
    || (currentRevision.workingTreeDiffSha256 || null) !== (recordedRevision.workingTreeDiffSha256 || null)) {
    throw new InputError('Android repository no longer matches the app model revision and dirty-tree digest');
  }
  validateCapturedEvidence(androidRoot, app.value);

  if (correspondence.value.appModelSha256 !== app.sha256 || behavior.value.appModelSha256 !== app.sha256) throw new InputError('app model hash pin mismatch');
  if (correspondence.value.designSpecSha256 !== design.sha256 || behavior.value.designSpecSha256 !== design.sha256) throw new InputError('design spec hash pin mismatch');
  if (behavior.value.correspondenceSha256 !== correspondence.sha256) throw new InputError('correspondence hash pin mismatch');

  const designModel = collectDesign(design.value);
  const mappings = sorted(correspondence.value.elementMappings);
  const mappingDesignIds = ensureUnique(mappings, (item) => item.designIdentity, 'mapped design identity');
  ensureUnique(mappings, (item) => item.id, 'mapping id');
  for (const identity of designModel.identities) if (!mappingDesignIds.has(identity)) throw new InputError(`unmapped design element: ${identity}`);
  for (const identity of mappingDesignIds) if (!designModel.identities.has(identity)) throw new InputError(`mapping references unknown design element: ${identity}`);

  const capabilities = sorted(correspondence.value.capabilities);
  ensureUnique(capabilities, (item) => item.id, 'capability id');
  const capabilitySubjects = ensureUnique(capabilities, (item) => item.subjectRef, 'capability subject');
  for (const identity of designModel.identities) if (!capabilitySubjects.has(identity)) throw new InputError(`missing explicit capability for design element: ${identity}`);
  for (const identity of capabilitySubjects) if (!designModel.identities.has(identity)) throw new InputError(`capability references unknown design element: ${identity}`);

  const actions = sorted(correspondence.value.actionBindings);
  ensureUnique(actions, (item) => item.id, 'action binding id');
  ensureUnique(actions, (item) => `${item.designIdentity}:${item.event}`, 'action binding target/event');
  for (const identity of designModel.interactive) {
    if (!actions.some((item) => item.designIdentity === identity)) throw new InputError(`interactive design element lacks explicit action binding: ${identity}`);
  }
  for (const action of actions) if (!designModel.identities.has(action.designIdentity)) throw new InputError(`action binding references unknown design element: ${action.designIdentity}`);

  const obligations = sorted(behavior.value.preservationObligations);
  const requirements = sorted(behavior.value.acceptanceRequirements).map((requirement) => ({
    ...requirement,
    domains: [...requirement.domains].sort(),
    requiredContexts: sorted(requirement.requiredContexts).map((context) => ({ ...context })),
    numericBudgets: sorted(requirement.numericBudgets)
  }));
  const uncertainties = sorted([
    ...correspondence.value.uncertainties,
    ...app.value.uncertainties.filter((item) => ['HIGH', 'BLOCKING'].includes(item.impact))
  ]);
  for (const group of [obligations, requirements, uncertainties]) ensureUnique(group, (item) => item.id, 'authored id');
  for (const requirement of requirements) {
    ensureUnique(requirement.requiredContexts, (item) => item.id, 'acceptance context id');
    ensureUnique(requirement.numericBudgets, (item) => item.id, 'numeric budget id');
  }
  ensureUnique(requirements.flatMap((item) => item.requiredContexts), (item) => item.id, 'acceptance context id');
  ensureUnique(requirements.flatMap((item) => item.numericBudgets), (item) => item.id, 'numeric budget id');
  const sceneIds = new Set(behavior.value.scenes);
  const scenarioIds = new Set(behavior.value.scenarios);
  const stateIds = new Set(behavior.value.states);
  for (const context of requirements.flatMap((item) => item.requiredContexts)) {
    if (!sceneIds.has(context.sceneId)) throw new InputError(`acceptance context has dangling scene: ${context.sceneId}`);
    if (!scenarioIds.has(context.scenarioId)) throw new InputError(`acceptance context has dangling scenario: ${context.scenarioId}`);
    if (!stateIds.has(context.stateId)) throw new InputError(`acceptance context has dangling state: ${context.stateId}`);
  }

  const approvals = new Map();
  const approvalInputs = [];
  const approvalSourcePaths = [];
  for (const approval of behavior.value.ownerApprovals) {
    if (approvals.has(approval.id)) throw new InputError(`duplicate owner approval: ${approval.id}`);
    const approvalFile = workspaceFile(workspace, path.join(workspace, approval.path), `owner approval ${approval.id}`);
    if (approvalFile.sha256 !== approval.sha256) throw new InputError(`owner approval hash mismatch: ${approval.id}`);
    validateOrThrow('owner-approval.schema.json', approvalFile.value, `owner approval ${approval.id}`);
    if (approvalFile.value.id !== approval.id) throw new InputError(`owner approval identity mismatch: ${approval.id}`);
    ensureUnique(approvalFile.value.scopes, (scope) => `${scope.subjectRef}\0${scope.statement}`, `owner approval scope in ${approval.id}`);
    approvals.set(approval.id, approvalFile.value);
    approvalInputs.push({ id: approval.id, kind: 'OWNER_APPROVAL', path: approvalFile.relative, sha256: approval.sha256 });
    approvalSourcePaths.push(approvalFile.path);
  }
  for (const mapping of mappings.filter((item) => item.ownerApprovalRef)) approvalFor(mapping.ownerApprovalRef, approvals, mapping.id, mapping.ownerApprovalStatement);
  for (const action of actions.filter((item) => item.ownerApprovalRef)) {
    if (action.ownerApprovalStatement !== action.newBehaviorStatement) throw new InputError(`action approval statement must equal new behavior statement: ${action.id}`);
    approvalFor(action.ownerApprovalRef, approvals, action.id, action.ownerApprovalStatement);
  }
  for (const obligation of obligations.filter((item) => item.ownerApprovalRef)) approvalFor(obligation.ownerApprovalRef, approvals, obligation.id, obligation.statement);
  for (const capability of capabilities.filter((item) => item.ownerApprovalRef)) {
    if (capability.ownerApprovalStatement !== capability.rationale) throw new InputError(`capability approval statement must equal rationale: ${capability.id}`);
    approvalFor(capability.ownerApprovalRef, approvals, capability.id, capability.ownerApprovalStatement);
  }

  const golden = behavior.value.goldenPolicy;
  const goldenObligation = obligations.find((item) => item.id === golden.obligationRef);
  if (!goldenObligation) throw new InputError(`golden policy references unknown obligation: ${golden.obligationRef}`);
  if (golden.status === 'OWNER_APPROVED_CHANGE') {
    if (goldenObligation.status !== 'OWNER_APPROVED_CHANGE' || goldenObligation.ownerApprovalRef !== golden.ownerApprovalRef) {
      throw new InputError('golden change must match an owner-approved preservation obligation');
    }
    approvalFor(golden.ownerApprovalRef, approvals, golden.obligationRef, golden.statement);
  }
  const usedApprovalIds = new Set([
    ...mappings.map((item) => item.ownerApprovalRef), ...actions.map((item) => item.ownerApprovalRef),
    ...obligations.map((item) => item.ownerApprovalRef), ...capabilities.map((item) => item.ownerApprovalRef),
    golden.ownerApprovalRef
  ].filter(Boolean));
  for (const approvalId of approvals.keys()) if (!usedApprovalIds.has(approvalId)) throw new InputError(`unused owner approval input: ${approvalId}`);

  const designId = `design.${design.sha256.slice(0, 16)}`;
  const inputIds = new Set([app.value.id, designId, correspondence.value.id, behavior.value.id, ...approvals.keys()]);
  if (inputIds.size !== 4 + approvals.size) throw new InputError('duplicate input or approval identity');
  const appEvidence = new Set(app.value.provenance.evidence.map((item) => item.id));
  ensureUnique(app.value.provenance.evidence, (item) => item.id, 'app evidence id');
  ensureUnique(app.value.modules, (item) => item.id, 'app module id');
  ensureUnique(app.value.uiSymbols, (item) => item.id, 'app UI symbol id');
  ensureUnique(app.value.stateActionClues.states, (item) => item.id, 'app state id');
  ensureUnique(app.value.stateActionClues.actions, (item) => item.id, 'app action id');
  ensureUnique(app.value.buildCommandClues, (item) => item.id, 'app build command id');
  ensureUnique(app.value.tests, (item) => item.id, 'app test id');
  const uiIds = new Set(app.value.uiSymbols.map((item) => item.id));
  const actionIds = new Set(app.value.stateActionClues.actions.map((item) => item.id));
  for (const mapping of mappings) if (!uiIds.has(mapping.existingUiSymbolRef)) throw new InputError(`dangling existing UI symbol: ${mapping.existingUiSymbolRef}`);
  for (const action of actions.filter((item) => item.existingActionRef)) if (!actionIds.has(action.existingActionRef)) throw new InputError(`dangling existing action: ${action.existingActionRef}`);
  const validEvidence = new Set([...appEvidence, designId]);
  requireRefs(mappings, validEvidence, ['evidenceRefs']);
  requireRefs(actions, validEvidence, ['evidenceRefs']);
  requireRefs(obligations, validEvidence, ['sourceEvidenceRefs']);
  requireRefs(requirements, validEvidence, ['evidenceRefs']);
  requireRefs(capabilities, validEvidence, ['evidenceRefs']);
  requireRefs(uncertainties, validEvidence, ['evidenceRefs']);
  const uiById = new Map(app.value.uiSymbols.map((item) => [item.id, item]));
  const actionById = new Map(app.value.stateActionClues.actions.map((item) => [item.id, item]));
  for (const mapping of mappings) {
    const symbolEvidence = new Set(uiById.get(mapping.existingUiSymbolRef).evidenceRefs);
    if (!mapping.evidenceRefs.some((ref) => symbolEvidence.has(ref))) {
      throw new InputError(`mapping ${mapping.id} does not cite evidence for UI symbol ${mapping.existingUiSymbolRef}`);
    }
  }
  for (const action of actions.filter((item) => item.bindingStatus === 'VERIFIED_EXISTING')) {
    const sourceEvidence = new Set(actionById.get(action.existingActionRef).evidenceRefs);
    if (!action.evidenceRefs.some((ref) => sourceEvidence.has(ref))) {
      throw new InputError(`action binding ${action.id} does not cite evidence for action ${action.existingActionRef}`);
    }
  }

  const validSubjects = new Set([
    ...designModel.identities, ...uiIds, ...actionIds,
    ...app.value.modules.map((item) => item.id), ...app.value.stateActionClues.states.map((item) => item.id),
    ...app.value.buildCommandClues.map((item) => item.id), ...app.value.tests.map((item) => item.id),
    ...mappings.map((item) => item.id), ...actions.map((item) => item.id),
    ...obligations.map((item) => item.id), ...capabilities.map((item) => item.id)
  ]);
  for (const uncertainty of uncertainties) if (!validSubjects.has(uncertainty.subjectRef)) throw new InputError(`uncertainty has dangling subject: ${uncertainty.subjectRef}`);
  ensureUnique([
    ...mappings, ...actions, ...obligations, ...requirements,
    ...requirements.flatMap((item) => item.requiredContexts),
    ...requirements.flatMap((item) => item.numericBudgets),
    ...capabilities, ...uncertainties
  ], (item) => item.id, 'contract object id');
  validateBoundary(androidRoot, app.value, behavior.value.implementationBoundary);

  const createdAt = options.createdAt || app.value.createdAt;
  if (!Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) throw new InputError('--created-at must be an ISO-8601 UTC timestamp');
  const requirementsSha256 = sha256(stableJson(requirements));
  const identityDigest = sha256(stableJson({ app: app.sha256, design: design.sha256, correspondence: correspondence.sha256, behavior: behavior.sha256 }));
  const inputs = [
    { id: app.value.id, kind: 'EXISTING_APP_MODEL', path: app.relative, sha256: app.sha256 },
    { id: designId, kind: 'DESIGN_EVIDENCE', path: design.relative, sha256: design.sha256 },
    { id: correspondence.value.id, kind: 'OTHER', path: correspondence.relative, sha256: correspondence.sha256 },
    { id: behavior.value.id, kind: 'OTHER', path: behavior.relative, sha256: behavior.sha256 },
    ...approvalInputs.sort((a, b) => a.id.localeCompare(b.id))
  ];
  const contract = {
    schemaVersion: '1.0.0', kind: 'RetrofitContract', id: `retrofit.${identityDigest.slice(0, 24)}`, createdAt,
    producer: { name: 'ctc', version: '1.0.0' }, inputs,
    claimScope: 'DECLARED_MAPPING_NOT_VERIFIED_IMPLEMENTATION',
    sources: {
      existingAppModel: { artifactId: app.value.id, schemaVersion: app.value.schemaVersion, path: app.relative, sha256: app.sha256 },
      designEvidence: { artifactId: designId, schemaVersion: design.value.version, path: design.relative, sha256: design.sha256 }
    },
    elementMappings: mappings,
    actionBindings: actions.map(({ ownerApprovalStatement, ...item }) => item),
    preservationObligations: obligations,
    acceptanceMatrix: { canonicalization: 'JCS-RFC8785', requirementsSha256, requirements },
    capabilities: capabilities.map(({ ownerApprovalStatement, ...item }) => item), uncertainties,
    implementationBoundary: structuredClone(behavior.value.implementationBoundary)
  };
  validateOrThrow('retrofit-contract.schema.json', contract, 'generated retrofit contract');
  const blocked = capabilities.some((item) => item.status === 'UNSUPPORTED_BLOCKING')
    || uncertainties.some((item) => item.impact === 'BLOCKING');
  return {
    contract, blocked, goldenPolicy: structuredClone(golden), behaviorManifestSha256: behavior.sha256,
    sourcePaths: [app.path, design.path, correspondence.path, behavior.path, ...approvalSourcePaths]
  };
}

module.exports = { buildContract, sha256, stableJson, validateOrThrow, workspaceFile };
