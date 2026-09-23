/**
 * src/agent/worktree.js
 *
 * Automated Git Worktree Scaffolding, Context Provisioning, and Rollback Subsystem.
 * Requirement R2: Automated Worktree & Agent Context Scaffolder (Milestone 2).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  resolveExplicit,
  rejectDangerousRoot,
  isInside,
  canonicalPlannedPath,
  gitMetadata,
  gitEnvironment,
  gitCommonDirectory,
  SAFE_GIT_OPTIONS,
  atomicWriteNoFollow,
  readWorkspace,
  MARKER,
  InputError,
  BlockedError
} = require('./safety');

const {
  generateImplementationPacket,
  adaptContractToMigrationPlan
} = require('./packet');

const {
  HARNESS_EXCLUDE_PATTERNS,
  scaffoldAllHarnesses
} = require('./harnesses');

/**
 * Returns list of registered worktree paths for a given git repository.
 * @param {string} gitRoot
 * @returns {string[]}
 */
function getRegisteredWorktrees(gitRoot) {
  try {
    const raw = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', gitRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
    const paths = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.slice('worktree '.length).trim();
        try {
          paths.push(fs.realpathSync(wtPath));
        } catch (_) {
          paths.push(path.resolve(wtPath));
        }
      }
    }
    return paths;
  } catch (_) {
    return [];
  }
}

/**
 * Validates a git branch ref name.
 * @param {string} branch
 */
function assertValidBranchName(branch) {
  if (!branch || typeof branch !== 'string' || !branch.trim()) {
    throw new InputError('branch name is required');
  }
  const cleanBranch = branch.trim();
  if (
    cleanBranch.includes('\0') ||
    cleanBranch.includes('..') ||
    cleanBranch.startsWith('-') ||
    /[\s~^:?*\[\\@]/.test(cleanBranch) ||
    cleanBranch.startsWith('/') ||
    cleanBranch.endsWith('/') ||
    cleanBranch.endsWith('.lock')
  ) {
    throw new InputError(`invalid git branch name: "${branch}"`);
  }
  try {
    execFileSync('git', ['check-ref-format', '--branch', cleanBranch], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    throw new InputError(`invalid git branch name: "${branch}"`);
  }
}

/**
 * Checks whether a branch already exists in the repository.
 * @param {string} repoRoot
 * @param {string} branch
 * @returns {boolean}
 */
function branchExists(repoRoot, branch) {
  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', repoRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Pre-flight validation of input options.
 * @param {object} options
 * @returns {{ androidRoot: string, outputRoot: string, branch: string, workspaceRoot: string }}
 */
function validateWorktreeOptions(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new InputError('options object is required');
  }

  const androidRoot = resolveExplicit(options.android, 'android repository');
  rejectDangerousRoot(androidRoot, 'android repository');

  const outputRoot = resolveExplicit(options.output || options.candidate, 'output candidate path');
  rejectDangerousRoot(outputRoot, 'output candidate path');

  assertValidBranchName(options.branch);
  const branch = options.branch.trim();

  const rawWorkspace = options.workspace || options.android || process.cwd();
  const workspaceRoot = resolveExplicit(rawWorkspace, 'workspace');
  rejectDangerousRoot(workspaceRoot, 'workspace');

  if (isInside(androidRoot, outputRoot)) {
    throw new InputError('output candidate directory must not be inside the Android repository');
  }

  const canonAndroid = canonicalPlannedPath(androidRoot);
  const canonOutput = canonicalPlannedPath(outputRoot);

  if (canonAndroid === canonOutput || path.resolve(androidRoot) === path.resolve(outputRoot)) {
    throw new InputError('output candidate directory must differ from the Android repository');
  }

  if (isInside(outputRoot, androidRoot)) {
    throw new InputError('Android repository must not be inside the output candidate directory');
  }

  if (options.workspace) {
    const canonWorkspace = canonicalPlannedPath(workspaceRoot);
    if (canonOutput === canonWorkspace || path.resolve(outputRoot) === path.resolve(workspaceRoot)) {
      throw new InputError('output candidate directory must differ from workspace');
    }
    if (isInside(workspaceRoot, outputRoot)) {
      throw new InputError('output candidate directory must not be inside workspace');
    }
    if (isInside(outputRoot, workspaceRoot)) {
      throw new InputError('candidate worktree must not collide with workspace');
    }
  }

  return { androidRoot, outputRoot, branch, workspaceRoot };
}

/**
 * Executes cleanup rollback upon failure.
 * @param {object} state
 */
function executeRollback({ androidRoot, outputRoot, branch, worktreeAdded, branchCreated }) {
  if (worktreeAdded) {
    try {
      execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'worktree', 'remove', '--force', outputRoot], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {
      try {
        execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'worktree', 'prune'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment()
        });
      } catch (_) {}
    }
  }

  if (branchCreated && branch) {
    try {
      execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'branch', '-D', branch], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
  }

  if (fs.existsSync(outputRoot)) {
    try {
      fs.chmodSync(outputRoot, 0o777);
    } catch (_) {}
    try {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    } catch (_) {}
  }

  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'worktree', 'prune'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {}
}

/**
 * Synthesizes a standard baseline retrofit contract if none is found on disk.
 * @param {string} [screenId='note_editor']
 * @returns {object}
 */
function createBaselineRetrofitContract(screenId = 'note_editor') {
  return {
    schemaVersion: '1.0.0',
    id: `contract_${screenId}`,
    screenId,
    implementationBoundary: {
      allowedPaths: [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ],
      prohibitedChanges: [
        'DO NOT replace Room SQLite queries with mock lists or in-memory stubs.',
        'DO NOT alter ViewModel debounce timing (500ms) or state flow emissions.',
        'DO NOT remove, rename, or drop Modifier.testTag attributes.',
        'DO NOT introduce EPD clear hooks or waveform broadcasts (ACTION_REFRESH_SCREEN).',
        'DO NOT tamper with verification thresholds or golden reference images to mask failures.'
      ],
      verificationCommands: [
        './gradlew compileDebugKotlin --no-daemon',
        './gradlew testDebugUnitTest --no-daemon',
        `node bin/ctc.js verify --screen ${screenId} --profile daylight-dc1`
      ]
    }
  };
}

/**
 * Loads a design or retrofit contract from explicit path, workspace discovery, or fallback.
 * @param {string|null} workspaceRoot
 * @param {string|null} explicitContractPath
 * @param {string} screenId
 * @returns {object}
 */
function loadRetrofitContract(workspaceRoot, explicitContractPath, screenId = 'note_editor') {
  if (explicitContractPath) {
    const resolved = resolveExplicit(explicitContractPath, '--contract');
    if (!fs.existsSync(resolved)) {
      throw new InputError(`contract file does not exist: ${explicitContractPath}`);
    }
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new InputError(`--contract must be a regular non-symlink file: ${explicitContractPath}`);
    }
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }

  if (workspaceRoot) {
    const discoveryCandidates = [
      path.join(workspaceRoot, 'retrofit-contract.json'),
      path.join(workspaceRoot, 'contract', 'retrofit-contract.json'),
      path.join(workspaceRoot, 'design-contract.json'),
      path.join(workspaceRoot, '.ctc', 'designs', screenId, 'contract', 'design-contract.json')
    ];

    for (const candidate of discoveryCandidates) {
      if (fs.existsSync(candidate)) {
        const stat = fs.lstatSync(candidate);
        if (stat.isFile() && !stat.isSymbolicLink()) {
          try {
            return JSON.parse(fs.readFileSync(candidate, 'utf8'));
          } catch (_) {}
        }
      }
    }
  }

  return createBaselineRetrofitContract(screenId);
}

/**
 * Creates a validated, isolated descendant Git worktree for coding agents.
 *
 * @param {object} options
 * @param {string} options.android - Path to baseline Android Git repository.
 * @param {string} [options.workspace] - Path to initialized CTC workspace.
 * @param {string} options.output - Destination filesystem path for candidate worktree.
 * @param {string} options.branch - Git branch name to create and checkout.
 * @param {string} [options.contract] - Optional explicit path to contract JSON file.
 * @param {string} [options.screenId='note_editor'] - Optional target screen identifier.
 * @param {object} [options.migrationPlan] - Optional migration plan override.
 * @param {object} [options.designContract] - Optional design contract object override.
 * @param {object} [options.correspondenceMap] - Optional correspondence map override.
 * @param {string} [options.format='both'] - Agent packet format ('both', 'markdown', 'json').
 * @param {boolean} [options.generatePacket=true] - Whether to generate dual agent packets.
 * @returns {object} Structured summary result conforming to WorktreeResult schema.
 */
function createAgentWorktree(options = {}) {
  const { androidRoot, outputRoot, branch, workspaceRoot } = validateWorktreeOptions(options);

  // 1. Android Directory Existence & Baseline Inspection
  let androidStat;
  try {
    androidStat = fs.lstatSync(androidRoot);
  } catch (_) {
    throw new InputError(`android repository path does not exist: ${androidRoot}`);
  }
  if (!androidStat.isDirectory() || androidStat.isSymbolicLink()) {
    throw new InputError('android repository path must be a directory');
  }

  const baselineMeta = gitMetadata(androidRoot);
  if (baselineMeta.dirty === true) {
    throw new InputError('Android repository has uncommitted changes; a clean baseline is required');
  }

  // 2. Collision Detection
  if (branchExists(androidRoot, branch)) {
    throw new InputError(`git branch "${branch}" already exists in repository`);
  }

  if (fs.existsSync(outputRoot)) {
    const outStat = fs.lstatSync(outputRoot);
    if (outStat.isSymbolicLink()) {
      throw new InputError(`output candidate path is an existing symbolic link: ${outputRoot}`);
    }
    if (!outStat.isDirectory()) {
      throw new InputError(`output candidate path already exists as a regular file: ${outputRoot}`);
    }
    const entries = fs.readdirSync(outputRoot);
    if (entries.length > 0) {
      throw new InputError(`output candidate directory already exists and is not empty: ${outputRoot}`);
    }
  }

  const registeredWorktrees = getRegisteredWorktrees(androidRoot);
  const canonOutput = canonicalPlannedPath(outputRoot);
  if (registeredWorktrees.includes(canonOutput) || registeredWorktrees.includes(outputRoot)) {
    throw new InputError(`output candidate path is already a registered git worktree: ${outputRoot}`);
  }

  // 3. Optional Workspace Marker Verification
  if (options.workspace) {
    readWorkspace(workspaceRoot);
  }

  // 4. Worktree Creation with Rollback Tracking
  const rollbackState = {
    androidRoot,
    outputRoot,
    branch,
    worktreeAdded: false,
    branchCreated: false
  };

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(outputRoot);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Execute git worktree add -b <branch> <output> HEAD
    execFileSync('git', [
      ...SAFE_GIT_OPTIONS,
      '-C', androidRoot,
      'worktree', 'add',
      '-b', branch,
      outputRoot,
      'HEAD'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });

    rollbackState.worktreeAdded = true;
    rollbackState.branchCreated = true;

    // Exclude metadata in .git/info/exclude
    try {
      const gitCommonDir = gitCommonDirectory(outputRoot);
      const infoDir = path.join(gitCommonDir, 'info');
      if (!fs.existsSync(infoDir)) {
        fs.mkdirSync(infoDir, { recursive: true });
      }
      const excludeFile = path.join(infoDir, 'exclude');
      const existingExclude = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
      const metadataFiles = [
        '.ctc-workspace.json',
        'agent-packet.json',
        'AGENT_PACKET.md',
        'agent-packet.md',
        ...HARNESS_EXCLUDE_PATTERNS
      ];
      const toAppend = [];
      for (const mf of metadataFiles) {
        if (!existingExclude.includes(mf)) {
          toAppend.push(mf);
        }
      }
      if (toAppend.length > 0) {
        const suffix = existingExclude.endsWith('\n') || existingExclude === '' ? '' : '\n';
        fs.writeFileSync(excludeFile, existingExclude + suffix + toAppend.join('\n') + '\n', 'utf8');
      }
    } catch (_) {}

    // Initialize candidate workspace marker (.ctc-workspace.json)
    const markerData = {
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: androidRoot,
      baselineRoot: androidRoot,
      baselineCommit: baselineMeta.commit,
      candidateBranch: branch,
      candidateRoot: outputRoot,
      createdAt: new Date().toISOString(),
      role: 'candidate-worktree',
      mode: 'candidate-worktree',
      packetPath: 'agent-packet.json',
      markdownPacketPath: 'AGENT_PACKET.md'
    };

    const markerPath = path.join(outputRoot, MARKER);
    atomicWriteNoFollow(markerPath, JSON.stringify(markerData, null, 2) + '\n');

    // Self-verification
    readWorkspace(outputRoot);

    // 5. Context & Agent Implementation Packet Generation Hook
    let packetPath = null;
    let packetMarkdownPath = null;
    let allowedPaths = ['app/src/main/java/com/claude/noteapp/ui/editor'];
    let verificationCommands = [
      './gradlew compileDebugKotlin --no-daemon',
      './gradlew testDebugUnitTest --no-daemon',
      `node bin/ctc.js verify --screen ${options.screenId || 'note_editor'} --profile daylight-dc1`
    ];

    const generatePacket = options.generatePacket !== false;
    const screenId = options.screenId || 'note_editor';

    if (generatePacket) {
      const contract = options.designContract
        || loadRetrofitContract(options.workspace ? workspaceRoot : null, options.contract, screenId);
      const plan = options.migrationPlan || adaptContractToMigrationPlan(contract, screenId);

      if (contract?.implementationBoundary?.allowedPaths) {
        allowedPaths = contract.implementationBoundary.allowedPaths.map(p =>
          String(p).replace(/\\/g, '/').replace(/\/\*\*.*$/, '').replace(/\/\*.*$/, '')
        );
      } else if (plan?.boundaries?.allowedModificationPaths) {
        allowedPaths = plan.boundaries.allowedModificationPaths.map(p =>
          String(p).replace(/\\/g, '/').replace(/\/\*\*.*$/, '').replace(/\/\*.*$/, '')
        );
      }

      if (contract?.implementationBoundary?.verificationCommands) {
        verificationCommands = contract.implementationBoundary.verificationCommands;
      } else if (plan?.verificationCommands) {
        verificationCommands = plan.verificationCommands;
      }

      const packetResult = generateImplementationPacket({
        screenId,
        migrationPlan: plan,
        designContract: contract,
        correspondenceMap: options.correspondenceMap || null,
        existingAppModel: options.existingAppModel || null,
        format: options.format || 'both'
      });

      if (packetResult.json) {
        packetPath = path.join(outputRoot, 'agent-packet.json');
        atomicWriteNoFollow(packetPath, JSON.stringify(packetResult.json, null, 2) + '\n');
      }
      if (packetResult.markdown) {
        packetMarkdownPath = path.join(outputRoot, 'AGENT_PACKET.md');
        atomicWriteNoFollow(packetMarkdownPath, packetResult.markdown);
      }
    }

    // 6. Automated Coding Agent Harness Scaffolding (Requirement R3)
    let harness = null;
    if (options.harnesses !== false) {
      const contractForHarness = options.designContract
        || loadRetrofitContract(options.workspace ? workspaceRoot : null, options.contract, screenId);
      harness = scaffoldAllHarnesses(outputRoot, {
        env: options.harnessEnv || 'candidate',
        screenId,
        allowedPaths,
        forbiddenPaths: contractForHarness?.implementationBoundary?.forbiddenPaths || null,
        verificationCommands,
        contract: contractForHarness,
        updateGitExclude: true
      });
    }

    return {
      command: 'agent worktree',
      status: 'PASS',
      candidatePath: outputRoot,
      worktree: outputRoot,
      branch,
      baselineRoot: androidRoot,
      androidBaseline: androidRoot,
      baselineCommit: baselineMeta.commit,
      markerPath,
      packet: {
        json: packetPath,
        markdown: packetMarkdownPath
      },
      packetPath,
      packetMarkdownPath,
      allowedPaths,
      verificationCommands,
      createdAt: markerData.createdAt,
      harness
    };
  } catch (error) {
    executeRollback(rollbackState);
    throw error;
  }
}

/**
 * Safely removes an agent candidate worktree and cleans up branch/filesystem state.
 *
 * @param {object} options
 * @param {string} options.android - Path to baseline Android Git repository.
 * @param {string} options.output - Path to candidate worktree to remove.
 * @param {string} [options.branch] - Optional branch name to delete after removal.
 * @param {boolean} [options.deleteBranch=false] - Whether to delete the branch (git branch -D).
 * @param {boolean} [options.force=true] - Whether to force worktree removal.
 * @returns {{ success: boolean, removedPath: string, branchDeleted: boolean }}
 */
function removeAgentWorktree(options = {}) {
  if (!options || typeof options !== 'object') {
    throw new InputError('options object is required');
  }

  const androidRoot = resolveExplicit(options.android, 'android repository');
  const outputRoot = resolveExplicit(options.output || options.candidate, 'output candidate path');
  const branch = options.branch ? String(options.branch).trim() : null;
  const deleteBranch = options.deleteBranch === true;
  const force = options.force !== false;

  let branchDeleted = false;

  try {
    const args = ['-C', androidRoot, 'worktree', 'remove'];
    if (force) args.push('--force');
    args.push(outputRoot);

    execFileSync('git', [...SAFE_GIT_OPTIONS, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    try {
      execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'worktree', 'prune'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
  }

  if (fs.existsSync(outputRoot)) {
    try {
      fs.chmodSync(outputRoot, 0o777);
    } catch (_) {}
    try {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    } catch (_) {}
  }

  if (deleteBranch && branch) {
    try {
      execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'branch', '-D', branch], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
      branchDeleted = true;
    } catch (_) {}
  }

  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', androidRoot, 'worktree', 'prune'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {}

  return {
    success: true,
    removedPath: outputRoot,
    branchDeleted
  };
}

module.exports = {
  createAgentWorktree,
  removeAgentWorktree,
  validateWorktreeOptions,
  getRegisteredWorktrees,
  branchExists,
  loadRetrofitContract,
  createBaselineRetrofitContract,
  executeRollback
};
