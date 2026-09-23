/**
 * src/verification/candidate_verifier.js
 *
 * Candidate Git Worktree Provenance, Isolation, and Implementation Boundary Verifier.
 * Requirement R1 (Milestone 1).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const {
  InputError,
  BlockedError,
  hasTraversal,
  isInside,
  canonicalPlannedPath,
  assertNoSourceSensitiveSymlinks,
  gitCommonDirectory,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata,
  SAFE_GIT_OPTIONS,
  gitEnvironment,
  INSPECTION_FILES
} = require('../agent/safety');

const {
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  evaluateDeviations
} = require('../contract/owner_approval');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Validates and retrieves a workspace-relative file, ensuring it is a non-symlink regular file
 * strictly confined inside root.
 * @param {string} root
 * @param {string} raw
 * @param {string} label
 * @returns {{path: string, relative: string, bytes: Buffer, sha256: string}}
 */
function rootFile(root, raw, label) {
  if (typeof raw !== 'string' || !raw || path.isAbsolute(raw)) {
    throw new InputError(`${label} must be relative to --root`);
  }
  if (hasTraversal(raw)) {
    throw new InputError(`${label} contains parent traversal`);
  }
  const lexical = path.resolve(root, raw);
  if (!isInside(root, lexical)) {
    throw new InputError(`${label} escapes --root`);
  }
  let cursor = root;
  const rel = path.relative(root, lexical);
  for (const segment of rel.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) {
        throw new InputError(`${label} path contains a symlink`);
      }
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  let stat;
  try {
    stat = fs.lstatSync(lexical);
  } catch (_) {
    throw new InputError(`${label} does not exist: ${raw}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new InputError(`${label} must be a regular non-symlink file`);
  }
  const canonical = fs.realpathSync(lexical);
  if (!isInside(root, canonical)) {
    throw new InputError(`${label} resolves outside --root`);
  }
  const bytes = fs.readFileSync(canonical);
  const digest = sha256(bytes);
  return { path: canonical, relative: rel.replace(/\\/g, '/'), bytes, sha256: digest };
}

/**
 * Validates receipt data, asserts exact SHA-256 hash match, and returns parsed JSON.
 * @param {string} root
 * @param {object} evidence
 * @param {Set<string>} protectedPaths
 * @returns {object|null}
 */
function validateReceiptData(root, evidence, protectedPaths = new Set()) {
  if (!evidence || evidence.status !== 'PRESENT') return null;
  const file = rootFile(root, evidence.source, `evidence ${evidence.id || ''} source`);
  if (file.sha256 !== evidence.sha256) {
    throw new InputError(`evidence ${evidence.id || ''} source hash mismatch`);
  }
  protectedPaths.add(file.path);
  let value = null;
  try {
    value = JSON.parse(file.bytes.toString('utf8'));
  } catch (_) {
    // binary evidence is permitted
  }
  if (evidence.domain === 'BUILD' || evidence.domain === 'BEHAVIOR') {
    if (!value || (value.outcome !== 'PASS' && value.outcome !== 'FAIL')) {
      throw new InputError(`${evidence.id} requires a structured PASS/FAIL receipt`);
    }
    if (!value.verificationScope) {
      throw new InputError(`${evidence.id} receipt must pin verificationScope`);
    }
  }
  if (evidence.metrics && evidence.metrics.length) {
    if (!value || !Array.isArray(value.metrics)) {
      throw new InputError(`${evidence.id} metrics require a structured metric receipt`);
    }
    for (const declaredMetric of evidence.metrics) {
      const match = value.metrics.find(m => m.name === declaredMetric.name && (m.unit || '') === (declaredMetric.unit || ''));
      if (!match || match.value !== declaredMetric.value) {
        throw new InputError(`${evidence.id} declared metrics do not match its receipt`);
      }
    }
  }
  return value;
}

/**
 * Recomputes and validates result summary counts against requirement states.
 * @param {object} result
 */
function validateSummaryCounts(result) {
  if (!result || !result.summary) return;
  if (Array.isArray(result.requirements)) {
    const passed = result.requirements.filter(r => r.status === 'PASS').length;
    const failed = result.requirements.filter(r => r.status === 'FAIL').length;
    const blocked = result.requirements.filter(r => r.status === 'BLOCKED').length;
    if (result.summary.passedRequirementCount !== undefined && result.summary.passedRequirementCount !== passed) {
      throw new InputError('summary counts do not match recomputed decision');
    }
    if (result.summary.failedRequirementCount !== undefined && result.summary.failedRequirementCount !== failed) {
      throw new InputError('summary counts do not match recomputed decision');
    }
    if (result.summary.blockedRequirementCount !== undefined && result.summary.blockedRequirementCount !== blocked) {
      throw new InputError('summary counts do not match recomputed decision');
    }
  }
}

/**
 * Enforces contract allowedPaths on candidate changed files.
 * @param {string[]} changedPaths
 * @param {string[]} allowedPaths
 * @param {string[]} prohibitedChanges
 * @returns {Array<{type: string, path: string, message: string}>}
 */
function enforceImplementationBoundary(changedPaths, allowedPaths, prohibitedChanges = []) {
  const violations = [];
  if (!Array.isArray(allowedPaths)) {
    throw new InputError('contract allowedPaths must be an array');
  }

  for (const allowed of allowedPaths) {
    if (typeof allowed !== 'string' || !allowed.trim()) {
      throw new InputError('allowed path must be a non-empty string');
    }
    const norm = allowed.trim().replace(/\\/g, '/');
    if (path.isAbsolute(norm) || norm.startsWith('/')) {
      throw new InputError(`allowed path must be relative: ${allowed}`);
    }
    if (hasTraversal(norm)) {
      throw new InputError(`allowed path contains parent traversal: ${allowed}`);
    }
    if (norm.includes('*') || norm.includes('?')) {
      throw new InputError(`allowed path must not contain glob wildcards: ${allowed}`);
    }
    const segments = norm.split('/').filter(Boolean);
    if (segments.length < 4 || !segments.includes('src')) {
      throw new InputError(`allowed path is too broad or non-normalized: ${allowed}`);
    }
  }

  for (const changed of changedPaths) {
    const normChanged = changed.replace(/\\/g, '/');
    const isAllowed = allowedPaths.some(allowed => {
      const normAllowed = allowed.replace(/\\/g, '/');
      return normChanged === normAllowed || normChanged.startsWith(`${normAllowed}/`);
    });
    if (!isAllowed) {
      violations.push({
        type: 'BOUNDARY_VIOLATION',
        path: normChanged,
        message: `changed path is outside the contract boundary: ${normChanged}`
      });
    }
  }

  return violations;
}

/**
 * Verifies that candidate worktree descends from baseline repository and commit.
 * @param {string} candidateRoot
 * @param {string} baselineRoot
 * @param {string} baselineCommit
 */
function verifyWorktreeDescendant(candidateRoot, baselineRoot, baselineCommit) {
  const baseGitDir = gitCommonDirectory(baselineRoot);
  const candGitDir = gitCommonDirectory(candidateRoot);
  if (candGitDir !== baseGitDir) {
    throw new InputError('--candidate must be a worktree of the inspected baseline repository');
  }

  if (!/^[a-f0-9]{40}$/.test(baselineCommit)) {
    throw new InputError('baseline commit must be a full Git revision');
  }

  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'cat-file', '-e', `${baselineCommit}^{commit}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    throw new InputError('candidate repository does not contain the inspected baseline commit');
  }

  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'merge-base', '--is-ancestor', baselineCommit, 'HEAD'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    throw new InputError('candidate HEAD does not descend from the inspected baseline commit');
  }
}

/**
 * Loads all owner approvals for candidate verification from options, contract inputs,
 * and workspace discovery paths.
 *
 * @param {string} root - Workspace or baseline root directory
 * @param {object} contract - Loaded contract JSON (if available)
 * @param {object} options - Verifier options (may contain options.approval)
 * @returns {Map<string, object>} Map of approvalId -> loaded approval record
 */
function resolveCandidateApprovals(root, contract, options = {}) {
  const approvalsMap = new Map();

  // 1. Explicit CLI / Option approvals (--approval / -A)
  const explicitApprovals = [];
  if (options.approval) {
    if (Array.isArray(options.approval)) explicitApprovals.push(...options.approval);
    else explicitApprovals.push(options.approval);
  }
  if (options.approvals && Array.isArray(options.approvals)) {
    explicitApprovals.push(...options.approvals);
  }

  for (const rawPath of explicitApprovals) {
    const loaded = loadOwnerApproval(rawPath, path.isAbsolute(rawPath) ? {} : { root });
    approvalsMap.set(loaded.value.id, loaded);
  }

  // 2. Approvals declared in contract.inputs
  if (contract && Array.isArray(contract.inputs)) {
    for (const input of contract.inputs) {
      if (input.kind !== 'OWNER_APPROVAL') continue;
      const file = rootFile(root, input.path, `contract input ${input.id}`);
      if (file.sha256 !== input.sha256) {
        throw new InputError(`contract input ${input.id} hash mismatch`);
      }
      let value;
      try {
        value = JSON.parse(file.bytes.toString('utf8'));
      } catch (err) {
        throw new InputError(`owner approval ${input.id} is not valid JSON: ${err.message}`);
      }
      // Schema validation via owner_approval loader
      const loaded = loadOwnerApproval(file.path, { root });
      if (loaded.value.id !== input.id) {
        throw new InputError(`owner approval ${input.id} identity mismatch: declared ${input.id}, found ${loaded.value.id}`);
      }
      approvalsMap.set(input.id, loaded);
    }
  }

  // 3. Workspace auto-discovery (.ctc/approvals/)
  const workspaceApprovalsDir = path.join(root, '.ctc', 'approvals');
  if (fs.existsSync(workspaceApprovalsDir) && fs.statSync(workspaceApprovalsDir).isDirectory()) {
    const discovered = loadOwnerApprovals(workspaceApprovalsDir, { root });
    for (const [id, app] of discovered.entries()) {
      if (!approvalsMap.has(id)) {
        approvalsMap.set(id, app);
      }
    }
  }

  return approvalsMap;
}

/**
 * Evaluates candidate deviations and owner approvals.
 *
 * @param {object} contract - Design retrofit contract
 * @param {Map<string, object>} approvalsMap - Loaded approvals map
 * @param {object} candidateInfo - Candidate worktree information
 * @param {object} options - Verifier options
 * @returns {{
 *   valid: boolean,
 *   status: 'PASS' | 'FAIL' | 'BLOCKED',
 *   code: number,
 *   approvedDeviations: Array<object>,
 *   deviations?: Array<object>,
 *   reason?: string,
 *   blockingReasons?: Array<string>
 * }}
 */
function evaluateCandidateApprovals(contract, approvalsMap, candidateInfo, options = {}) {
  const throwOnError = options.throwOnError !== false;
  const usedApprovals = new Set();
  const approvedDeviations = [];
  const unapprovedDeviations = [];
  const blockingReasons = [];

  // Check evidence cross wiring
  assertNoEvidenceCrossWiring(contract, approvalsMap);

  if (contract) {
    // 1. UI Surface Deviations
    for (const item of (contract.elementMappings || [])) {
      if (item.mappingStatus === 'OWNER_APPROVED_NEW_SURFACE' || item.ownerApprovalRef) {
        if (!item.ownerApprovalRef) {
          unapprovedDeviations.push({
            type: 'UI_SURFACE',
            id: item.id,
            subjectRef: item.id,
            statement: item.ownerApprovalStatement || '',
            message: `Surface ${item.id} is OWNER_APPROVED_NEW_SURFACE but lacks ownerApprovalRef`
          });
          continue;
        }
        const app = approvalsMap.get(item.ownerApprovalRef);
        const statement = item.ownerApprovalStatement || '';
        const match = app && (app.value || app.approval).scopes.some(
          s => s.subjectRef === item.id && s.statement === statement
        );
        if (!match) {
          unapprovedDeviations.push({
            type: 'UI_SURFACE',
            id: item.id,
            subjectRef: item.id,
            approvalRef: item.ownerApprovalRef,
            statement,
            message: `Owner approval ${item.ownerApprovalRef} does not cover exact subject/statement for ${item.id}`
          });
        } else {
          usedApprovals.add(item.ownerApprovalRef);
          approvedDeviations.push({
            type: 'UI_SURFACE',
            id: item.id,
            approvalRef: item.ownerApprovalRef,
            statement
          });
        }
      }
    }

    // 2. Altered Behavior Deviations
    for (const item of (contract.actionBindings || [])) {
      if (item.bindingStatus === 'OWNER_APPROVED_NEW_BEHAVIOR' || item.ownerApprovalRef) {
        const statement = item.newBehaviorStatement || item.ownerApprovalStatement || '';
        if (!item.ownerApprovalRef || !statement) {
          unapprovedDeviations.push({
            type: 'ALTERED_BEHAVIOR',
            id: item.id,
            subjectRef: item.id,
            statement,
            message: `Action ${item.id} is OWNER_APPROVED_NEW_BEHAVIOR but lacks ownerApprovalRef`
          });
          continue;
        }
        const app = approvalsMap.get(item.ownerApprovalRef);
        const match = app && (app.value || app.approval).scopes.some(
          s => s.subjectRef === item.id && s.statement === statement
        );
        if (!match) {
          unapprovedDeviations.push({
            type: 'ALTERED_BEHAVIOR',
            id: item.id,
            subjectRef: item.id,
            approvalRef: item.ownerApprovalRef,
            statement,
            message: `Owner approval ${item.ownerApprovalRef} does not cover exact subject/statement for ${item.id}`
          });
        } else {
          usedApprovals.add(item.ownerApprovalRef);
          approvedDeviations.push({
            type: 'ALTERED_BEHAVIOR',
            id: item.id,
            approvalRef: item.ownerApprovalRef,
            statement
          });
        }
      }
    }

    // 3. Changed Invariants
    for (const item of (contract.preservationObligations || [])) {
      if (item.status === 'OWNER_APPROVED_CHANGE' || item.ownerApprovalRef) {
        if (!item.ownerApprovalRef) {
          unapprovedDeviations.push({
            type: 'CHANGED_INVARIANT',
            id: item.id,
            subjectRef: item.id,
            statement: item.statement || '',
            message: `Obligation ${item.id} is OWNER_APPROVED_CHANGE but lacks ownerApprovalRef`
          });
          continue;
        }
        const app = approvalsMap.get(item.ownerApprovalRef);
        const statement = item.statement || '';
        const match = app && (app.value || app.approval).scopes.some(
          s => s.subjectRef === item.id && s.statement === statement
        );
        if (!match) {
          unapprovedDeviations.push({
            type: 'CHANGED_INVARIANT',
            id: item.id,
            subjectRef: item.id,
            approvalRef: item.ownerApprovalRef,
            statement,
            message: `Owner approval ${item.ownerApprovalRef} does not cover exact subject/statement for ${item.id}`
          });
        } else {
          usedApprovals.add(item.ownerApprovalRef);
          approvedDeviations.push({
            type: 'CHANGED_INVARIANT',
            id: item.id,
            approvalRef: item.ownerApprovalRef,
            statement
          });
        }
      }
    }

    // 4. Capabilities (Unsupported vs Approved)
    for (const item of (contract.capabilities || [])) {
      if (item.status === 'UNSUPPORTED_BLOCKING') {
        blockingReasons.push(`Capability ${item.id} is UNSUPPORTED_BLOCKING: ${item.rationale}`);
      } else if (item.status === 'INTENTIONAL_DEVIATION' || item.status === 'UNSUPPORTED_APPROVED' || item.ownerApprovalRef) {
        if (!item.ownerApprovalRef) {
          blockingReasons.push(`missing owner approval for capability ${item.id}`);
          continue;
        }
        const app = approvalsMap.get(item.ownerApprovalRef);
        const statement = item.rationale || '';
        const match = app && (app.value || app.approval).scopes.some(
          s => s.subjectRef === item.id && s.statement === statement
        );
        if (!match) {
          unapprovedDeviations.push({
            type: 'CAPABILITY',
            id: item.id,
            subjectRef: item.id,
            approvalRef: item.ownerApprovalRef,
            statement,
            message: `Owner approval ${item.ownerApprovalRef} does not cover exact rationale for capability ${item.id}`
          });
        } else {
          usedApprovals.add(item.ownerApprovalRef);
          approvedDeviations.push({
            type: 'CAPABILITY',
            id: item.id,
            approvalRef: item.ownerApprovalRef,
            statement
          });
        }
      }
    }
  }

  // 5. Explicit candidate visual/perceptual deviations passed in options
  if (Array.isArray(options.deviations)) {
    for (const dev of options.deviations) {
      const ref = dev.ownerApprovalRef || dev.approvalRef;
      if (!ref) {
        unapprovedDeviations.push({
          type: dev.type || 'VISUAL_DEVIATION',
          id: dev.id || dev.subjectRef,
          subjectRef: dev.subjectRef || dev.id,
          statement: dev.statement || '',
          message: `Unapproved deviation on ${dev.subjectRef || dev.id}: ${dev.statement || 'no statement'}`
        });
        continue;
      }
      const app = approvalsMap.get(ref);
      const statement = dev.statement || dev.ownerApprovalStatement || '';
      const match = app && (app.value || app.approval).scopes.some(
        s => s.subjectRef === (dev.subjectRef || dev.id) && s.statement === statement
      );
      if (!match) {
        unapprovedDeviations.push({
          type: dev.type || 'VISUAL_DEVIATION',
          id: dev.id || dev.subjectRef,
          subjectRef: dev.subjectRef || dev.id,
          approvalRef: ref,
          statement,
          message: `Owner approval ${ref} does not cover exact subject/statement for ${dev.subjectRef || dev.id}`
        });
      } else {
        usedApprovals.add(ref);
        approvedDeviations.push({
          type: dev.type || 'VISUAL_DEVIATION',
          id: dev.id || dev.subjectRef,
          approvalRef: ref,
          statement
        });
      }
    }
  }

  // 6. Assert all loaded approvals were cited
  for (const approvalId of approvalsMap.keys()) {
    if (!usedApprovals.has(approvalId)) {
      if (throwOnError) {
        throw new InputError(`unused owner approval input: ${approvalId}`);
      }
      return {
        valid: false,
        status: 'FAIL',
        code: 1,
        deviations: [{ message: `unused owner approval input: ${approvalId}`, approvalId }]
      };
    }
  }

  // 7. Decision Matrix
  if (blockingReasons.length > 0) {
    const reason = blockingReasons[0];
    if (throwOnError) {
      throw new BlockedError(reason);
    }
    return {
      valid: false,
      status: 'BLOCKED',
      code: 2,
      reason,
      blockingReasons
    };
  }

  if (unapprovedDeviations.length > 0) {
    if (throwOnError) {
      throw new InputError(unapprovedDeviations[0].message);
    }
    return {
      valid: false,
      status: 'FAIL',
      code: 1,
      deviations: unapprovedDeviations
    };
  }

  return {
    valid: true,
    status: 'PASS',
    code: 0,
    approvedDeviations
  };
}

/**
 * Master candidate Git worktree verifier.
 * @param {object} options
 * @returns {object}
 */
function verifyCandidateWorktree(options = {}) {
  const throwOnError = options.throwOnError !== false;

  try {
    const candidateRaw = options.candidate || options.candidatePath;
    if (!candidateRaw || !String(candidateRaw).trim()) {
      throw new BlockedError('--candidate is required for project-candidate verification');
    }

    if (hasTraversal(candidateRaw)) {
      throw new InputError('--candidate contains parent traversal');
    }

    const lexicalCandidate = path.resolve(String(candidateRaw));
    let candidateStat;
    try {
      candidateStat = fs.lstatSync(lexicalCandidate);
    } catch (_) {
      throw new InputError('--candidate must be an existing Git worktree');
    }

    if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) {
      throw new InputError('--candidate must be a non-symlink directory');
    }

    const candidateRoot = fs.realpathSync(lexicalCandidate);

    const baselineRaw = options.baselineRoot || options.root || process.cwd();
    const lexicalBaseline = path.resolve(String(baselineRaw));
    let baselineRoot;
    try {
      baselineRoot = fs.realpathSync(lexicalBaseline);
    } catch (_) {
      baselineRoot = lexicalBaseline;
    }

    if (candidateRoot === baselineRoot) {
      throw new InputError('--candidate must differ from the immutable baseline checkout');
    }

    // Baseline clean check
    const baselineRevision = gitMetadata(baselineRoot);
    if (baselineRevision.dirty === true) {
      throw new InputError('project-candidate verification requires a clean committed inspected baseline');
    }

    const baselineCommit = options.baselineCommit || baselineRevision.commit;

    // Verify common git directory and ancestry
    verifyWorktreeDescendant(candidateRoot, baselineRoot, baselineCommit);

    // Audit source symlinks in candidate worktree
    assertNoSourceSensitiveSymlinks(candidateRoot, 'candidate worktree');

    // Revision and changed paths derivation
    const revision = gitMetadata(candidateRoot);
    const gitVisiblePaths = gitChangedPaths(candidateRoot, baselineCommit);
    const baselineIgnored = gitIgnoredSourceEvidence(baselineRoot);
    const candidateIgnored = gitIgnoredSourceEvidence(candidateRoot);
    const baselineIgnoredByPath = new Map(baselineIgnored.map((item) => [item.path, item.sha256]));
    const candidateIgnoredByPath = new Map(candidateIgnored.map((item) => [item.path, item.sha256]));
    const changedIgnoredPaths = [...new Set([...baselineIgnoredByPath.keys(), ...candidateIgnoredByPath.keys()])]
      .filter((sourcePath) => baselineIgnoredByPath.get(sourcePath) !== candidateIgnoredByPath.get(sourcePath));
    const changedPaths = [...new Set([...gitVisiblePaths, ...changedIgnoredPaths])].sort();

    const sourceSnapshotSha256 = crypto.createHash('sha256').update(JSON.stringify({
      repositoryRevision: revision.commit,
      workingTreeDiffSha256: revision.workingTreeDiffSha256 || null,
      changedPaths,
      ignoredSourceEvidence: candidateIgnored
    })).digest('hex');

    // Contract boundary check
    let contract = options.contract;
    if (!contract && options.contractPath) {
      const resolvedContract = path.resolve(options.contractPath);
      contract = JSON.parse(fs.readFileSync(resolvedContract, 'utf8'));
    }

    if (!contract) {
      // Auto-discover contract when candidate is within a CTC workspace or when contract exists on disk
      let workspaceCandidate = options.workspaceRoot || options.root || null;
      let candidateHasMarker = false;

      try {
        const markerPath = path.join(candidateRoot, '.ctc-workspace.json');
        if (fs.existsSync(markerPath)) {
          candidateHasMarker = true;
          const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
          if (marker.workspaceRoot && fs.existsSync(marker.workspaceRoot)) {
            workspaceCandidate = marker.workspaceRoot;
          }
        }
      } catch (_) {}

      if (!workspaceCandidate) {
        const baselineMarker = path.join(baselineRoot, '.ctc-workspace.json');
        if (fs.existsSync(baselineMarker)) {
          try {
            const marker = JSON.parse(fs.readFileSync(baselineMarker, 'utf8'));
            if (marker.workspaceRoot && fs.existsSync(marker.workspaceRoot)) {
              workspaceCandidate = marker.workspaceRoot;
            }
          } catch (_) {}
        }
      }

      // Check discovery candidate paths for explicit design-contract or retrofit-contract
      const discoveryRoots = [workspaceCandidate, baselineRoot, candidateRoot].filter(Boolean);
      const screenId = options.screenId || 'note_editor';

      for (const root of discoveryRoots) {
        const candidates = [
          path.join(root, 'retrofit-contract.json'),
          path.join(root, 'contract', 'retrofit-contract.json'),
          path.join(root, 'design-contract.json'),
          path.join(root, 'contract', 'design-contract.json'),
          path.join(root, '.ctc', 'designs', screenId, 'contract', 'design-contract.json'),
          path.join(root, 'designs', screenId, 'contract', 'design-contract.json')
        ];
        for (const candidateFile of candidates) {
          if (fs.existsSync(candidateFile)) {
            try {
              const stat = fs.lstatSync(candidateFile);
              if (stat.isFile() && !stat.isSymbolicLink()) {
                contract = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
                break;
              }
            } catch (_) {}
          }
        }
        if (contract) break;
      }

      // If candidate is a CTC worktree (.ctc-workspace.json present) and no contract file was on disk,
      // fallback to standard baseline retrofit contract to ensure fail-closed boundary enforcement
      if (!contract && candidateHasMarker) {
        try {
          const { loadRetrofitContract } = require('../agent/worktree');
          contract = loadRetrofitContract(workspaceCandidate || baselineRoot, null, screenId);
        } catch (_) {}
      }
    }

    const violations = [];
    if (contract && contract.implementationBoundary) {
      const allowedPaths = contract.implementationBoundary.allowedPaths || [];
      const prohibited = contract.implementationBoundary.prohibitedChanges || [];
      const boundaryViolations = enforceImplementationBoundary(changedPaths, allowedPaths, prohibited);
      violations.push(...boundaryViolations);

      if (violations.length > 0 && throwOnError) {
        throw new InputError(violations[0].message);
      }
    }

    // Receipt validation
    let result = options.result;
    if (!result && options.resultPath) {
      result = JSON.parse(fs.readFileSync(options.resultPath, 'utf8'));
    }

    if (result) {
      const workspaceRoot = options.workspaceRoot || options.root || (options.resultPath ? path.dirname(options.resultPath) : process.cwd());
      const protectedPaths = new Set();
      if (Array.isArray(result.evidence)) {
        for (const ev of result.evidence) {
          const receipt = validateReceiptData(workspaceRoot, ev, protectedPaths);
          if (ev.domain === 'BUILD' && receipt && Array.isArray(receipt.changedPaths)) {
            if (JSON.stringify([...receipt.changedPaths].sort()) !== JSON.stringify(changedPaths)) {
              throw new InputError('evidence.candidate.build changedPaths do not exactly match --candidate');
            }
          }
        }
      }
      validateSummaryCounts(result);
      if (result.outcome === 'PASS' && result.subject && (!result.subject.buildArtifactSha256 || result.subject.buildArtifactSha256 === null)) {
        throw new InputError('candidate artifact is not linked to subject buildArtifactSha256');
      }
    }

    // Owner approval discovery and deviation evaluation (Milestone 4: Features F14 & F15)
    const approvalsMap = resolveCandidateApprovals(baselineRoot, contract, options);

    // Assert that protected approval files will not be modified or overwritten by candidate
    const protectedPaths = new Set(Array.from(approvalsMap.values()).map(a => a.path));
    for (const changed of changedPaths) {
      const absChangedCand = path.resolve(candidateRoot, changed);
      const absChangedBase = path.resolve(baselineRoot, changed);
      if (protectedPaths.has(absChangedCand) || protectedPaths.has(absChangedBase)) {
        throw new InputError(`candidate cannot modify protected approval file: ${changed}`);
      }
    }

    const approvalEvaluation = evaluateCandidateApprovals(contract, approvalsMap, {
      candidateRoot,
      baselineRoot,
      changedPaths
    }, options);

    if (approvalEvaluation.status === 'BLOCKED') {
      if (throwOnError) throw new BlockedError(approvalEvaluation.reason);
      return {
        valid: false,
        status: 'BLOCKED',
        code: 2,
        reason: approvalEvaluation.reason,
        blockingReasons: approvalEvaluation.blockingReasons || [approvalEvaluation.reason],
        candidateRoot,
        baselineRoot
      };
    }

    if (approvalEvaluation.status === 'FAIL') {
      const primaryMessage = approvalEvaluation.deviations?.[0]?.message || 'unapproved deviation detected';
      if (throwOnError) throw new InputError(primaryMessage);
      return {
        valid: false,
        status: 'FAIL',
        code: 1,
        deviations: approvalEvaluation.deviations || [],
        violations: [...violations, ...(approvalEvaluation.deviations || [])],
        candidateRoot,
        baselineRoot
      };
    }

    const hasViolations = violations.length > 0;
    return {
      valid: !hasViolations,
      status: hasViolations ? 'FAIL' : 'PASS',
      code: hasViolations ? 1 : 0,
      candidateRoot,
      baselineRoot,
      baselineCommit,
      revision,
      changedPaths,
      sourceSnapshotSha256,
      workingTreeDiffSha256: revision.workingTreeDiffSha256,
      violations,
      approvedDeviations: approvalEvaluation.approvedDeviations || []
    };
  } catch (error) {
    if (throwOnError) throw error;
    const isBlocked = (error instanceof BlockedError);
    const status = isBlocked ? 'BLOCKED' : 'FAIL';
    const code = isBlocked ? 2 : 1;
    return {
      valid: false,
      status,
      code,
      reason: error.message,
      error: error.message,
      deviations: [{ message: error.message }],
      violations: [{
        type: error.name || 'VALIDATION_ERROR',
        path: options.candidate,
        message: error.message
      }]
    };
  }
}

module.exports = {
  verifyCandidateWorktree,
  verifyWorktreeDescendant,
  enforceImplementationBoundary,
  validateReceiptData,
  validateSummaryCounts,
  rootFile,
  assertNoSourceSensitiveSymlinks,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata,
  gitCommonDirectory,
  resolveCandidateApprovals,
  evaluateCandidateApprovals,
  assertNoEvidenceCrossWiring,
  InputError,
  BlockedError
};
