'use strict';

/**
 * src/contract/owner_approval.js
 *
 * Owner Approval & Intentional Deviation Evaluation Engine for ctc v2.
 * Requirement R4 (Milestone 4: Features F14 & F15).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  InputError,
  BlockedError,
  hasTraversal,
  isInside
} = require('../agent/safety');

const {
  validateOwnerApproval
} = require('./schemas');

const DEVIATION_DOMAINS = Object.freeze({
  UI_SURFACES: 'UI_SURFACES',
  ALTERED_BEHAVIORS: 'ALTERED_BEHAVIORS',
  CHANGED_INVARIANTS: 'CHANGED_INVARIANTS',
  UNSUPPORTED_CAPABILITIES: 'UNSUPPORTED_CAPABILITIES'
});

const DEVIATION_STATUSES = Object.freeze({
  OWNER_APPROVED_NEW_SURFACE: 'OWNER_APPROVED_NEW_SURFACE',
  EVIDENCE_BACKED: 'EVIDENCE_BACKED',
  OWNER_APPROVED_NEW_BEHAVIOR: 'OWNER_APPROVED_NEW_BEHAVIOR',
  VERIFIED_EXISTING: 'VERIFIED_EXISTING',
  OWNER_APPROVED_CHANGE: 'OWNER_APPROVED_CHANGE',
  REQUIRED: 'REQUIRED',
  INTENTIONAL_DEVIATION: 'INTENTIONAL_DEVIATION',
  UNSUPPORTED_APPROVED: 'UNSUPPORTED_APPROVED',
  UNSUPPORTED_BLOCKING: 'UNSUPPORTED_BLOCKING'
});

// Embedded fallback Draft 2020-12 schema
const OWNER_APPROVAL_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://claude-to-compose.local/schemas/v1/owner-approval.schema.json',
  title: 'Owner approval v1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'kind', 'id', 'scopes'],
  properties: {
    schemaVersion: { const: '1.0.0' },
    kind: { const: 'OwnerApproval' },
    id: { $ref: '#/$defs/id' },
    scopes: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/scope' }
    }
  },
  $defs: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:/#()\\[\\]-]*$'
    },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: ['subjectRef', 'statement'],
      properties: {
        subjectRef: { $ref: '#/$defs/id' },
        statement: { type: 'string', minLength: 1 }
      }
    }
  }
});

function computeSha256(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function computeCharacterDiff(expected, actual) {
  let firstDiffIndex = -1;
  const minLen = Math.min(expected.length, actual.length);
  for (let i = 0; i < minLen; i++) {
    if (expected[i] !== actual[i]) {
      firstDiffIndex = i;
      break;
    }
  }
  if (firstDiffIndex === -1 && expected.length !== actual.length) {
    firstDiffIndex = minLen;
  }
  return {
    expectedLength: expected.length,
    actualLength: actual.length,
    firstDiffIndex,
    expectedChar: expected[firstDiffIndex] !== undefined ? expected[firstDiffIndex] : '<EOF>',
    actualChar: actual[firstDiffIndex] !== undefined ? actual[firstDiffIndex] : '<EOF>',
    contextSnippet: {
      expected: expected.substring(Math.max(0, firstDiffIndex - 10), Math.min(expected.length, firstDiffIndex + 10)),
      actual: actual.substring(Math.max(0, firstDiffIndex - 10), Math.min(actual.length, firstDiffIndex + 10))
    }
  };
}

/**
 * Loads and validates a single OwnerApproval document from disk.
 *
 * @param {string} filePath
 * @param {object} [options={}]
 * @returns {object} LoadedApproval
 */
function loadOwnerApproval(filePath, options = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new InputError('owner approval path must be a non-empty string');
  }
  if (filePath.includes('\0')) {
    throw new InputError('owner approval path contains invalid null byte');
  }
  if (hasTraversal(filePath)) {
    throw new InputError(`owner approval path must not contain parent traversal: ${filePath}`);
  }

  const workspaceRoot = options.workspaceRoot
    ? path.resolve(options.workspaceRoot)
    : (options.root ? path.resolve(options.root) : null);

  const lexical = path.resolve(workspaceRoot || '.', filePath);

  if (workspaceRoot && !isInside(workspaceRoot, lexical)) {
    throw new InputError(`owner approval path escapes workspace root: ${filePath}`);
  }

  // Audit path components for symlinks
  if (workspaceRoot) {
    const rel = path.relative(workspaceRoot, lexical);
    let cursor = workspaceRoot;
    for (const segment of rel.split(path.sep)) {
      cursor = path.join(cursor, segment);
      try {
        const s = fs.lstatSync(cursor);
        if (s.isSymbolicLink()) {
          throw new InputError(`owner approval path contains a symbolic link component: ${cursor}`);
        }
      } catch (err) {
        if (err instanceof InputError) throw err;
        if (err.code === 'ENOENT') break;
        throw err;
      }
    }
  }

  let stat;
  try {
    stat = fs.lstatSync(lexical);
  } catch (err) {
    throw new InputError(`owner approval file does not exist: ${filePath}`);
  }

  if (stat.isSymbolicLink()) {
    throw new InputError(`owner approval file must be a non-symlink regular file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new InputError(`owner approval path must be a regular file: ${filePath}`);
  }

  const canonical = fs.realpathSync(lexical);
  if (workspaceRoot && !isInside(workspaceRoot, canonical)) {
    throw new InputError(`owner approval resolves outside workspace root: ${filePath}`);
  }

  const rawBytes = fs.readFileSync(canonical);
  const sha256 = computeSha256(rawBytes);

  if (options.expectedSha256 && sha256 !== options.expectedSha256) {
    throw new InputError(`owner approval ${filePath} hash mismatch: declared ${options.expectedSha256} but computed ${sha256}`);
  }

  let approval;
  try {
    approval = JSON.parse(rawBytes.toString('utf8'));
  } catch (err) {
    throw new InputError(`owner approval ${filePath} is not valid JSON: ${err.message}`);
  }

  if (options.validateSchema !== false) {
    const valid = validateOwnerApproval(approval);
    if (!valid) {
      const errorText = validateOwnerApproval.errorText || 'failed schema validation';
      throw new InputError(`owner approval ${filePath} failed schema validation: ${errorText}`);
    }
  }

  if (options.expectedId && approval.id !== options.expectedId) {
    throw new InputError(`owner approval identity mismatch: declared ${options.expectedId} but found ${approval.id}`);
  }

  const relPosix = path.relative(workspaceRoot || process.cwd(), canonical).replace(/\\/g, '/');

  return {
    id: approval.id,
    path: canonical,
    relativePath: relPosix,
    sha256,
    rawBytes,
    approval,
    value: approval
  };
}

/**
 * Loads multiple owner approvals into a Map keyed by approval ID.
 *
 * @param {string|string[]|object[]} pathsOrDir
 * @param {object} [options={}]
 * @returns {Map<string, object>} Map keyed by approval ID
 */
function loadOwnerApprovals(pathsOrDir, options = {}) {
  const approvalsMap = new Map();
  if (!pathsOrDir) return approvalsMap;

  const targets = [];
  const workspaceRoot = options.workspaceRoot
    ? path.resolve(options.workspaceRoot)
    : (options.root ? path.resolve(options.root) : null);

  const opts = { ...options, workspaceRoot };

  if (typeof pathsOrDir === 'string') {
    const resolved = path.resolve(workspaceRoot || '.', pathsOrDir);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const files = fs.readdirSync(resolved).filter(f => f.endsWith('.json')).sort();
      for (const f of files) {
        targets.push(path.join(resolved, f));
      }
    } else {
      targets.push(pathsOrDir);
    }
  } else if (Array.isArray(pathsOrDir)) {
    for (const item of pathsOrDir) {
      if (!item) continue;
      if (typeof item === 'string') {
        targets.push(item);
      } else if (typeof item === 'object' && item.path) {
        if (item.kind && item.kind !== 'OWNER_APPROVAL') continue;
        targets.push(item);
      }
    }
  }

  for (const target of targets) {
    const isObject = typeof target === 'object';
    const filePath = isObject ? target.path : target;
    const expectedId = isObject ? target.id : undefined;
    const expectedSha256 = isObject ? target.sha256 : undefined;

    const loaded = loadOwnerApproval(filePath, {
      ...opts,
      expectedId,
      expectedSha256
    });

    if (approvalsMap.has(loaded.id)) {
      const existing = approvalsMap.get(loaded.id);
      if (existing.sha256 !== loaded.sha256) {
        throw new InputError(`duplicate owner approval id with conflicting content: ${loaded.id}`);
      }
    } else {
      approvalsMap.set(loaded.id, loaded);
    }
  }

  // Contract declared inputs verification
  const expectedInputs = options.expectedInputs || (options.contract && Array.isArray(options.contract.inputs) ? options.contract.inputs : null);
  if (Array.isArray(expectedInputs)) {
    for (const input of expectedInputs) {
      if (input.kind !== 'OWNER_APPROVAL') continue;
      if (!approvalsMap.has(input.id)) {
        throw new BlockedError(`declared owner approval input missing: ${input.id} (${input.path})`);
      }
      const loaded = approvalsMap.get(input.id);
      if (loaded.sha256 !== input.sha256) {
        throw new InputError(`declared owner approval input ${input.id} hash mismatch: declared ${input.sha256} but found ${loaded.sha256}`);
      }
    }
  }

  return approvalsMap;
}

/**
 * Resolves an approval reference against subjectRef and statement with exact matching.
 *
 * @param {Map<string, object>|object} approvalsMap
 * @param {string} approvalRef
 * @param {string} subjectRef
 * @param {string} statement
 * @param {object} [tracker=null]
 * @param {object} [options={}]
 * @returns {object}
 */
function approvalFor(approvalsMap, approvalRef, subjectRef, statement, tracker = null, options = {}) {
  const throwOnError = options.throwOnError !== false;

  if (!approvalRef || typeof approvalRef !== 'string') {
    if (throwOnError) throw new InputError(`approvalFor requires non-empty approvalRef, got: ${approvalRef}`);
    return { matched: false, approved: false, reason: 'INVALID_APPROVAL_REF' };
  }
  if (!subjectRef || typeof subjectRef !== 'string') {
    if (throwOnError) throw new InputError(`approvalFor requires non-empty subjectRef, got: ${subjectRef}`);
    return { matched: false, approved: false, reason: 'INVALID_SUBJECT_REF' };
  }
  if (!statement || typeof statement !== 'string') {
    if (throwOnError) throw new InputError(`approvalFor requires non-empty statement, got: ${statement}`);
    return { matched: false, approved: false, reason: 'INVALID_STATEMENT' };
  }

  const record = approvalsMap instanceof Map ? approvalsMap.get(approvalRef) : approvalsMap?.[approvalRef];
  if (!record) {
    if (throwOnError) {
      throw new InputError(`owner approval "${approvalRef}" not found in loaded approvals for subject "${subjectRef}"`);
    }
    return { matched: false, approved: false, reason: 'APPROVAL_NOT_FOUND', approvalRef, subjectRef };
  }

  const approvalData = record.value || record.approval || record;
  const scopes = Array.isArray(approvalData.scopes) ? approvalData.scopes : [];

  const subjectScopes = scopes.filter(s => s && s.subjectRef === subjectRef);
  if (subjectScopes.length === 0) {
    if (throwOnError) {
      throw new InputError(`owner approval "${approvalRef}" does not cover exact subject/statement for subject "${subjectRef}"`);
    }
    return {
      matched: false,
      approved: false,
      reason: 'SUBJECT_NOT_FOUND',
      approvalRef,
      subjectRef,
      availableSubjects: scopes.map(s => s?.subjectRef).filter(Boolean)
    };
  }

  const matchingScope = subjectScopes.find(s => s.statement === statement);
  if (!matchingScope) {
    const actualStatement = subjectScopes[0].statement;
    const diff = computeCharacterDiff(statement, actualStatement);
    if (throwOnError) {
      throw new InputError(
        `owner approval "${approvalRef}" does not cover exact subject/statement for "${subjectRef}".\n` +
        `Expected: "${statement}"\n` +
        `Found:    "${actualStatement}"`
      );
    }
    return {
      matched: false,
      approved: false,
      reason: 'STATEMENT_MISMATCH',
      approvalRef,
      subjectRef,
      expected: statement,
      actual: actualStatement,
      charDiff: diff
    };
  }

  if (tracker) {
    if (tracker.usedApprovals instanceof Set) tracker.usedApprovals.add(approvalRef);
    if (tracker.usedScopes instanceof Set) tracker.usedScopes.add(`${approvalRef}::${subjectRef}`);
    if (Array.isArray(tracker.citations)) {
      tracker.citations.push({
        approvalRef,
        subjectRef,
        statement,
        scope: matchingScope,
        approvalPath: record.path || null,
        sha256: record.sha256 || null
      });
    }
  }

  return {
    matched: true,
    approved: true,
    approvalRef,
    subjectRef,
    statement,
    approval: approvalData,
    scope: matchingScope,
    record
  };
}

/**
 * Asserts that all loaded approvals in approvalsMap were cited during verification.
 *
 * @param {Map<string, object>} approvalsMap
 * @param {Set<string>|Array<string>} usedApprovals
 * @param {object} [options={}]
 * @returns {{valid: boolean, unused: string[]}}
 */
function assertAllApprovalsUsed(approvalsMap, usedApprovals, options = {}) {
  const throwOnError = options.throwOnError !== false;
  if (!(approvalsMap instanceof Map)) {
    throw new InputError('approvalsMap must be an instance of Map');
  }
  const usedSet = usedApprovals instanceof Set ? usedApprovals : new Set(usedApprovals || []);

  const unused = [];
  for (const id of approvalsMap.keys()) {
    if (!usedSet.has(id)) {
      unused.push(id);
    }
  }

  if (unused.length > 0) {
    const msg = `unused owner approval input${unused.length > 1 ? 's' : ''}: ${unused.join(', ')}`;
    if (throwOnError) {
      throw new InputError(msg);
    }
    return { valid: false, unused, message: msg };
  }

  return { valid: true, unused: [] };
}

/**
 * Asserts that no owner approval is cross-wired into evidenceRefs.
 *
 * @param {object} contract
 * @param {Map<string, object>} approvalsMap
 */
function assertNoEvidenceCrossWiring(contract, approvalsMap) {
  if (!contract) return;
  const approvalIds = new Set(approvalsMap.keys());

  const checkRefs = (items = [], label) => {
    for (const item of items) {
      for (const ref of item.evidenceRefs || item.sourceEvidenceRefs || []) {
        if (approvalIds.has(ref)) {
          throw new InputError(`${item.id || label} has dangling reference: cannot cite approval ${ref} as evidence`);
        }
      }
    }
  };

  if (Array.isArray(contract.elementMappings)) checkRefs(contract.elementMappings, 'elementMappings');
  if (Array.isArray(contract.actionBindings)) checkRefs(contract.actionBindings, 'actionBindings');
  if (Array.isArray(contract.preservationObligations)) checkRefs(contract.preservationObligations, 'preservationObligations');
  if (contract.acceptanceMatrix && Array.isArray(contract.acceptanceMatrix.requirements)) {
    checkRefs(contract.acceptanceMatrix.requirements, 'requirements');
  }
}

/**
 * Master evaluation engine evaluating a RetrofitContract against loaded approvals.
 *
 * @param {object} contract
 * @param {Map<string, object>} approvalsMap
 * @param {object} [options={}]
 * @returns {object}
 */
function evaluateContractDeviations(contract, approvalsMap, options = {}) {
  const throwOnError = options.throwOnError !== false;
  const map = approvalsMap instanceof Map ? approvalsMap : new Map(Object.entries(approvalsMap || {}));

  // Assert no evidence cross wiring
  assertNoEvidenceCrossWiring(contract, map);

  const defects = [];
  const blockers = [];
  const approvedDeviations = [];
  const tracker = {
    usedApprovals: new Set(),
    usedScopes: new Set(),
    citations: []
  };

  if (!contract || typeof contract !== 'object') {
    if (throwOnError) {
      throw new InputError('contract is missing or invalid');
    }
    return {
      status: 'FAIL',
      exitCode: 1,
      defects: [{ domain: 'GENERAL', type: 'INVALID_CONTRACT', message: 'contract is missing or invalid' }],
      blockers: [],
      approvedDeviations: [],
      unusedApprovals: []
    };
  }

  // Domain 1: UI Surfaces (elementMappings)
  for (const mapping of contract.elementMappings || []) {
    if (mapping.mappingStatus === DEVIATION_STATUSES.OWNER_APPROVED_NEW_SURFACE || mapping.ownerApprovalRef) {
      if (!mapping.ownerApprovalRef || !mapping.ownerApprovalStatement) {
        defects.push({
          domain: DEVIATION_DOMAINS.UI_SURFACES,
          type: 'DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: mapping.id,
          message: `elementMapping ${mapping.id} declared OWNER_APPROVED_NEW_SURFACE but lacks approval ref or statement`
        });
        continue;
      }
      const match = approvalFor(map, mapping.ownerApprovalRef, mapping.id, mapping.ownerApprovalStatement, tracker, { throwOnError: false });
      if (match.matched) {
        approvedDeviations.push({
          domain: DEVIATION_DOMAINS.UI_SURFACES,
          subjectRef: mapping.id,
          approvalRef: mapping.ownerApprovalRef,
          statement: mapping.ownerApprovalStatement
        });
      } else {
        defects.push({
          domain: DEVIATION_DOMAINS.UI_SURFACES,
          type: match.reason === 'STATEMENT_MISMATCH' ? 'STATEMENT_MISMATCH' : 'DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: mapping.id,
          approvalRef: mapping.ownerApprovalRef,
          message: `elementMapping ${mapping.id} failed approval matching: ${match.reason}`,
          details: match
        });
      }
    }
  }

  // Domain 2: Altered Behaviors (actionBindings)
  for (const binding of contract.actionBindings || []) {
    if (binding.bindingStatus === DEVIATION_STATUSES.OWNER_APPROVED_NEW_BEHAVIOR || binding.ownerApprovalRef) {
      const statement = binding.newBehaviorStatement || binding.ownerApprovalStatement;
      if (!binding.ownerApprovalRef || !statement) {
        defects.push({
          domain: DEVIATION_DOMAINS.ALTERED_BEHAVIORS,
          type: 'DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: binding.id,
          message: `actionBinding ${binding.id} declared OWNER_APPROVED_NEW_BEHAVIOR but lacks approval ref or statement`
        });
        continue;
      }
      const match = approvalFor(map, binding.ownerApprovalRef, binding.id, statement, tracker, { throwOnError: false });
      if (match.matched) {
        approvedDeviations.push({
          domain: DEVIATION_DOMAINS.ALTERED_BEHAVIORS,
          subjectRef: binding.id,
          approvalRef: binding.ownerApprovalRef,
          statement
        });
      } else {
        defects.push({
          domain: DEVIATION_DOMAINS.ALTERED_BEHAVIORS,
          type: match.reason === 'STATEMENT_MISMATCH' ? 'STATEMENT_MISMATCH' : 'DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: binding.id,
          approvalRef: binding.ownerApprovalRef,
          message: `actionBinding ${binding.id} failed approval matching: ${match.reason}`,
          details: match
        });
      }
    }
  }

  // Domain 3: Changed Invariants (preservationObligations)
  for (const obligation of contract.preservationObligations || []) {
    if (obligation.status === DEVIATION_STATUSES.OWNER_APPROVED_CHANGE || obligation.ownerApprovalRef) {
      if (!obligation.ownerApprovalRef) {
        defects.push({
          domain: DEVIATION_DOMAINS.CHANGED_INVARIANTS,
          type: 'INVARIANT_BROKEN',
          severity: 'CRITICAL',
          subjectRef: obligation.id,
          message: `preservationObligation ${obligation.id} has status OWNER_APPROVED_CHANGE but lacks ownerApprovalRef`
        });
        continue;
      }
      const match = approvalFor(map, obligation.ownerApprovalRef, obligation.id, obligation.statement, tracker, { throwOnError: false });
      if (match.matched) {
        approvedDeviations.push({
          domain: DEVIATION_DOMAINS.CHANGED_INVARIANTS,
          subjectRef: obligation.id,
          approvalRef: obligation.ownerApprovalRef,
          statement: obligation.statement
        });
      } else {
        defects.push({
          domain: DEVIATION_DOMAINS.CHANGED_INVARIANTS,
          type: match.reason === 'STATEMENT_MISMATCH' ? 'STATEMENT_MISMATCH' : 'INVARIANT_BROKEN',
          severity: 'CRITICAL',
          subjectRef: obligation.id,
          approvalRef: obligation.ownerApprovalRef,
          message: `preservationObligation ${obligation.id} failed approval matching: ${match.reason}`,
          details: match
        });
      }
    }
  }

  // Domain 4: Unsupported Capabilities & Uncertainties
  for (const cap of contract.capabilities || []) {
    if (cap.status === DEVIATION_STATUSES.INTENTIONAL_DEVIATION || cap.status === DEVIATION_STATUSES.UNSUPPORTED_APPROVED) {
      if (!cap.ownerApprovalRef) {
        blockers.push({
          domain: DEVIATION_DOMAINS.UNSUPPORTED_CAPABILITIES,
          type: 'APPROVAL_REQUIRED_MISSING',
          subjectRef: cap.id,
          reason: `missing owner approval for capability ${cap.id}`
        });
        continue;
      }
      const match = approvalFor(map, cap.ownerApprovalRef, cap.id, cap.rationale, tracker, { throwOnError: false });
      if (match.matched) {
        approvedDeviations.push({
          domain: DEVIATION_DOMAINS.UNSUPPORTED_CAPABILITIES,
          subjectRef: cap.id,
          approvalRef: cap.ownerApprovalRef,
          statement: cap.rationale
        });
      } else {
        blockers.push({
          domain: DEVIATION_DOMAINS.UNSUPPORTED_CAPABILITIES,
          type: 'APPROVAL_REQUIRED_MISSING',
          subjectRef: cap.id,
          reason: `capability ${cap.id} approval matching failed: ${match.reason}`
        });
      }
    } else if (cap.status === DEVIATION_STATUSES.UNSUPPORTED_BLOCKING) {
      blockers.push({
        domain: DEVIATION_DOMAINS.UNSUPPORTED_CAPABILITIES,
        type: 'BLOCKING_CAPABILITY',
        subjectRef: cap.id,
        reason: `unsupported blocking capability: ${cap.id} (${cap.rationale})`
      });
    }
  }

  for (const unc of contract.uncertainties || []) {
    if (unc.impact === 'BLOCKING') {
      blockers.push({
        domain: DEVIATION_DOMAINS.UNSUPPORTED_CAPABILITIES,
        type: 'BLOCKING_UNCERTAINTY',
        subjectRef: unc.id,
        reason: `blocking uncertainty: ${unc.id} (${unc.statement})`
      });
    }
  }

  // Explicit candidate visual/perceptual deviations passed in options
  if (Array.isArray(options.deviations)) {
    for (const dev of options.deviations) {
      const ref = dev.ownerApprovalRef || dev.approvalRef;
      if (!ref) {
        defects.push({
          domain: dev.domain || 'VISUAL',
          type: 'VISUAL_DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: dev.subjectRef || dev.id,
          message: `Unapproved deviation on ${dev.subjectRef || dev.id}: ${dev.statement || 'no statement'}`
        });
        continue;
      }
      const statement = dev.statement || dev.ownerApprovalStatement || '';
      const match = approvalFor(map, ref, dev.subjectRef || dev.id, statement, tracker, { throwOnError: false });
      if (match.matched) {
        approvedDeviations.push({
          domain: dev.domain || 'VISUAL',
          subjectRef: dev.subjectRef || dev.id,
          approvalRef: ref,
          statement
        });
      } else {
        defects.push({
          domain: dev.domain || 'VISUAL',
          type: match.reason === 'STATEMENT_MISMATCH' ? 'STATEMENT_MISMATCH' : 'DEVIATION_UNAPPROVED',
          severity: 'CRITICAL',
          subjectRef: dev.subjectRef || dev.id,
          approvalRef: ref,
          message: `Owner approval ${ref} does not cover exact subject/statement for ${dev.subjectRef || dev.id}`
        });
      }
    }
  }

  // Check unused approvals
  const unusedResult = assertAllApprovalsUsed(map, tracker.usedApprovals, { throwOnError: false });
  const unusedApprovals = unusedResult.unused || [];
  if (unusedApprovals.length > 0) {
    defects.push({
      domain: 'GENERAL',
      type: 'UNUSED_APPROVAL_INPUT',
      severity: 'MAJOR',
      message: `unused owner approval input${unusedApprovals.length > 1 ? 's' : ''}: ${unusedApprovals.join(', ')}`,
      unused: unusedApprovals
    });
  }

  // Derive status
  let status = 'PASS';
  let exitCode = 0;

  if (blockers.length > 0) {
    status = 'BLOCKED';
    exitCode = 2;
  } else if (defects.length > 0) {
    status = 'FAIL';
    exitCode = 1;
  }

  if (throwOnError) {
    if (blockers.length > 0) {
      throw new BlockedError(blockers[0].reason);
    }
    if (defects.length > 0) {
      throw new InputError(defects[0].message);
    }
  }

  return {
    valid: status === 'PASS',
    status,
    exitCode,
    approvedDeviations,
    defects,
    blockers,
    unusedApprovals,
    citations: tracker.citations,
    summary: {
      totalApproved: approvedDeviations.length,
      totalDefects: defects.length,
      totalBlockers: blockers.length,
      totalUnusedApprovals: unusedApprovals.length
    }
  };
}

module.exports = {
  DEVIATION_DOMAINS,
  DEVIATION_STATUSES,
  OWNER_APPROVAL_SCHEMA,
  computeSha256,
  computeCharacterDiff,
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  evaluateDeviations: evaluateContractDeviations
};
