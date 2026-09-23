/**
 * tests/adversarial/m2_empirical_challenge.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 2:
 * Automated Worktree Scaffolding, Context Provisioning, Lifecycle, Collisions,
 * Branch Names, Mid-Sequence Rollback Integrity, and Downstream Verification.
 *
 * Executed by challenger_m2_1.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  createAgentWorktree,
  removeAgentWorktree,
  validateWorktreeOptions,
  getRegisteredWorktrees,
  branchExists
} = require('../../src/agent/worktree');

const {
  InputError,
  BlockedError,
  readWorkspace,
  gitCommonDirectory,
  gitChangedPaths,
  SAFE_GIT_OPTIONS,
  gitEnvironment
} = require('../../src/agent/safety');

const {
  verifyCandidateWorktree,
  enforceImplementationBoundary
} = require('../../src/verification/candidate_verifier');
const { dispatch } = require('../../src/cli/dispatcher');

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Milestone2 Challenger']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeCleanRepoWithCommit(dir) {
  initCleanGitRepo(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Baseline Project\n');
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const dataDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), '// NoteEditorScreen content\n');
  fs.writeFileSync(path.join(dataDir, 'NoteDao.kt'), '// NoteDao content\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// build\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// settings\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

describe('Empirical Adversarial Challenge Suite: Milestone 2 Worktree Scaffolder', () => {
  let tempRoot;
  let androidDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m2-chal-')));
    androidDir = path.join(tempRoot, 'android-repo');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-output');

    const info = makeCleanRepoWithCommit(androidDir);
    baselineCommit = info.commit;

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, '.ctc-workspace.json'),
      JSON.stringify({
        kind: 'ctc-workspace',
        version: 1,
        androidRoot: androidDir
      }, null, 2)
    );
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', androidDir, 'worktree', 'remove', '--force', candidateDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Challenge Area 1: Branch Name Validation & Injection Stress
  // =========================================================================
  describe('Challenge Area 1: Branch Name Validation & Injection Stress', () => {
    const invalidBranches = [
      ['heads/invalid..branch', 'contains double dot ..'],
      ['branch with spaces', 'contains interior whitespace'],
      ['-b', 'starts with hyphen (flag injection)'],
      ['--orphan', 'starts with double hyphen (flag injection)'],
      ['--force', 'starts with double hyphen (flag injection)'],
      ['-d', 'starts with hyphen'],
      ['branch\0nullbyte', 'contains null byte'],
      ['branch\nnewline', 'contains newline'],
      ['branch\ttab', 'contains tab'],
      ['branch~1', 'contains tilde ~'],
      ['branch^2', 'contains caret ^'],
      ['branch:colon', 'contains colon :'],
      ['branch?question', 'contains question mark ?'],
      ['branch*star', 'contains asterisk *'],
      ['branch[bracket', 'contains bracket ['],
      ['branch\\backslash', 'contains backslash \\'],
      ['branch@at', 'contains at-sign @'],
      ['branch@{1}', 'contains reflog syntax @{'],
      ['/leading-slash', 'starts with slash /'],
      ['trailing-slash/', 'ends with slash /'],
      ['branch.lock', 'ends with .lock'],
      ['foo//bar', 'consecutive slashes'],
      ['HEAD', 'prohibited branch name HEAD'],
      ['@{-1}', 'git ref shortcut syntax'],
      ['', 'empty string'],
      ['   ', 'spaces only']
    ];

    for (const [branchName, reason] of invalidBranches) {
      it(`[CHAL-BR-01] rejects invalid branch "${branchName}" (${reason}) without creating worktree`, () => {
        assert.throws(() => {
          createAgentWorktree({
            android: androidDir,
            workspace: workspaceDir,
            branch: branchName,
            output: candidateDir
          });
        }, (err) => err instanceof InputError && /invalid git branch name|branch name is required/i.test(err.message));

        // Verify no worktree or branch created
        const registered = getRegisteredWorktrees(androidDir);
        assert.equal(registered.includes(candidateDir), false);
        assert.equal(fs.existsSync(candidateDir), false);
      });
    }

    it('[CHAL-BR-02] accepts and trims surrounding whitespace on branch name', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: '  valid-trimmed-branch  ',
        output: candidateDir
      });

      assert.equal(res.status, 'PASS');
      assert.equal(res.branch, 'valid-trimmed-branch');
      assert.equal(branchExists(androidDir, 'valid-trimmed-branch'), true);
    });

    it('[CHAL-BR-03] rejects branch name collision when branch already exists in baseline', () => {
      execFileSync('git', ['-C', androidDir, 'branch', 'existing-feature-branch']);
      assert.equal(branchExists(androidDir, 'existing-feature-branch'), true);

      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'existing-feature-branch',
          output: candidateDir
        });
      }, (err) => err instanceof InputError && /already exists in repository/i.test(err.message));

      assert.equal(fs.existsSync(candidateDir), false);
    });

    it('[CHAL-BR-04] CLI rejects invalid branch names with exitCode 3', () => {
      const result = dispatch(['agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'heads/invalid..branch',
        '--output', candidateDir
      ]);

      assert.equal(result.success, false);
      assert.equal(result.exitCode, 3);
      assert.match(result.error, /invalid git branch name/i);
      assert.equal(fs.existsSync(candidateDir), false);
    });
  });

  // =========================================================================
  // Challenge Area 2: Symlinked Parent Directory & Symlink Traversal
  // =========================================================================
  describe('Challenge Area 2: Symlink Parent Paths & Confinement', () => {
    it('[CHAL-SYM-01] allows output directory inside a symlinked parent pointing to legitimate external storage', () => {
      const realParent = path.join(tempRoot, 'real-parent-dir');
      fs.mkdirSync(realParent, { recursive: true });
      const symlinkParent = path.join(tempRoot, 'symlinked-parent');
      fs.symlinkSync(realParent, symlinkParent);

      const targetOutput = path.join(symlinkParent, 'candidate-inside-symlink');

      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'valid-sym-parent-branch',
        output: targetOutput
      });

      assert.equal(res.status, 'PASS');
      assert.equal(fs.existsSync(targetOutput), true);

      // Verify downstream verification passes on this worktree
      const downstreamResult = verifyCandidateWorktree({
        candidate: targetOutput,
        baselineRoot: androidDir,
        throwOnError: true
      });

      assert.equal(downstreamResult.valid, true);
      assert.equal(downstreamResult.status, 'PASS');
      assert.equal(downstreamResult.violations.length, 0);
    });

    it('[CHAL-SYM-02] rejects output directory inside a symlink parent that points INTO the Android repository', () => {
      const androidSubdir = path.join(androidDir, 'subfolder');
      fs.mkdirSync(androidSubdir, { recursive: true });

      const symlinkIntoAndroid = path.join(tempRoot, 'symlink-into-android');
      fs.symlinkSync(androidSubdir, symlinkIntoAndroid);

      const maliciousOutput = path.join(symlinkIntoAndroid, 'candidate-escaped');

      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'sym-into-android-branch',
          output: maliciousOutput
        });
      }, (err) => err instanceof InputError && /must not be inside the Android repository/i.test(err.message));

      assert.equal(fs.existsSync(maliciousOutput), false);
    });

    it('[CHAL-SYM-03] rejects output directory directly targeting an existing symlink', () => {
      const dummyTarget = path.join(tempRoot, 'dummy-target');
      fs.mkdirSync(dummyTarget, { recursive: true });
      const symlinkOutput = path.join(tempRoot, 'symlink-output');
      fs.symlinkSync(dummyTarget, symlinkOutput);

      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'direct-symlink-branch',
          output: symlinkOutput
        });
      }, (err) => err instanceof InputError && /existing symbolic link/i.test(err.message));
    });

    it('[CHAL-SYM-04] reveals defect: broken symlink bypasses pre-flight check because fs.existsSync follows symlinks', () => {
      const nonExistentTarget = path.join(tempRoot, 'non-existent-target');
      const brokenSymlink = path.join(tempRoot, 'broken-symlink');
      fs.symlinkSync(nonExistentTarget, brokenSymlink);

      // Pre-flight fs.existsSync(brokenSymlink) returns false!
      // Thus createAgentWorktree invokes git worktree add, which fails with exit 128 (child_process Error, not InputError).
      // Furthermore, git created the branch before failing, and rollback failed to clean it up!
      let caughtError = null;
      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'broken-sym-defect-branch',
          output: brokenSymlink
        });
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== null);
      // DEFECT CONFIRMATION: The error is a raw child_process execution error, not an InputError
      assert.ok(!(caughtError instanceof InputError), 'Expected raw exec error due to pre-flight bypass');
      assert.match(caughtError.message, /already exists/i);

      // DEFECT CONFIRMATION: The branch was created by git and left behind because rollbackState.branchCreated was false
      assert.equal(branchExists(androidDir, 'broken-sym-defect-branch'), true,
        'CRITICAL DEFECT: orphan branch was left behind in baseline repository after failed git worktree add');
    });
  });

  // =========================================================================
  // Challenge Area 3: Mid-Sequence Failures & Atomic Rollback Integrity
  // =========================================================================
  describe('Challenge Area 3: Mid-Sequence Failures & Atomic Rollback Integrity', () => {
    it('[CHAL-RB-01] rolls back cleanly when contract loading fails mid-sequence (malformed contract JSON)', () => {
      const badContractPath = path.join(tempRoot, 'corrupted-contract.json');
      fs.writeFileSync(badContractPath, '{{{ INVALID JSON FILE CONTENT }}}', 'utf8');

      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'rollback-bad-contract-branch',
          output: candidateDir,
          contract: badContractPath
        });
      });

      // 1. Git worktree registration must be pruned/removed
      const registered = getRegisteredWorktrees(androidDir);
      assert.equal(registered.includes(candidateDir), false, 'Worktree must not remain in git worktree list');

      // 2. Created branch must be deleted
      assert.equal(branchExists(androidDir, 'rollback-bad-contract-branch'), false, 'Branch must be deleted');

      // 3. Output directory must be removed from disk
      assert.equal(fs.existsSync(candidateDir), false, 'Output directory must be cleaned from disk');

      // 4. Baseline repository must remain clean
      const meta = gitChangedPaths(androidDir, baselineCommit);
      assert.equal(meta.length, 0, 'Baseline repository must have 0 changed paths');
    });

    it('[CHAL-RB-02] rolls back cleanly when packet generation throws an exception after worktree add', () => {
      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'rollback-packet-throw-branch',
          output: candidateDir,
          migrationPlan: {
            get boundaries() {
              throw new Error('Injected catastrophic disk failure during packet generation');
            }
          }
        });
      }, /Injected catastrophic disk failure/);

      // Verify full atomic rollback:
      assert.equal(getRegisteredWorktrees(androidDir).includes(candidateDir), false,
        'Worktree must be unregistered');
      assert.equal(branchExists(androidDir, 'rollback-packet-throw-branch'), false,
        'Branch must be deleted');
      assert.equal(fs.existsSync(candidateDir), false,
        'Output directory must be removed');
      assert.equal(gitChangedPaths(androidDir, baselineCommit).length, 0,
        'Baseline repository must remain clean');
    });

    it('[CHAL-RB-03] CLI ctc agent worktree handles mid-sequence error, returns exitCode 3, leaves no orphan worktree', () => {
      const badContractPath = path.join(tempRoot, 'bad-contract.json');
      fs.writeFileSync(badContractPath, 'NOT_JSON');

      const result = dispatch(['agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'cli-rollback-branch',
        '--output', candidateDir,
        '--contract', badContractPath
      ]);

      assert.equal(result.success, false);
      assert.equal(result.exitCode, 3);
      assert.equal(fs.existsSync(candidateDir), false);
      assert.equal(branchExists(androidDir, 'cli-rollback-branch'), false);
      assert.equal(getRegisteredWorktrees(androidDir).includes(candidateDir), false);
    });

    it('[CHAL-RB-04] reveals defect: failure during git worktree add leaves orphan branch uncollected', () => {
      // Create empty candidate directory and make it read-only (0o555)
      fs.mkdirSync(candidateDir, { recursive: true });
      fs.chmodSync(candidateDir, 0o555);

      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'rollback-readonly-orphan-branch',
          output: candidateDir
        });
        assert.fail('Should have thrown an error');
      } catch (err) {
        // Expected to throw
      } finally {
        try { fs.chmodSync(candidateDir, 0o777); } catch (_) {}
      }

      // DEFECT CONFIRMATION: The worktree directory was not added, but git created the branch refs/heads/rollback-readonly-orphan-branch
      // Because rollbackState.branchCreated is only set AFTER git worktree add returns, executeRollback skipped branch deletion!
      const orphanBranchExists = branchExists(androidDir, 'rollback-readonly-orphan-branch');
      assert.equal(orphanBranchExists, true,
        'CRITICAL DEFECT: orphan branch created by git worktree add was not cleaned up by rollback');
    });
  });

  // =========================================================================
  // Challenge Area 4: Downstream ctc verify --candidate Compatibility
  // =========================================================================
  describe('Challenge Area 4: Downstream ctc verify --candidate Compatibility', () => {
    it('[CHAL-VER-01] freshly scaffolded candidate worktree passes downstream verifyCandidateWorktree', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'downstream-verify-clean-branch',
        output: candidateDir
      });

      assert.equal(res.status, 'PASS');

      // Run downstream verification directly
      const verResult = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: androidDir,
        throwOnError: true
      });

      assert.equal(verResult.valid, true);
      assert.equal(verResult.status, 'PASS');
      assert.equal(verResult.violations.length, 0);
      assert.equal(verResult.changedPaths.length, 0);
    });

    it('[CHAL-VER-02] metadata files (.ctc-workspace.json, agent-packet.json, AGENT_PACKET.md) are ignored by git', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'metadata-ignore-branch',
        output: candidateDir
      });

      // Verify files exist physically
      assert.equal(fs.existsSync(path.join(candidateDir, '.ctc-workspace.json')), true);
      assert.equal(fs.existsSync(path.join(candidateDir, 'agent-packet.json')), true);
      assert.equal(fs.existsSync(path.join(candidateDir, 'AGENT_PACKET.md')), true);

      // Verify git status --porcelain in candidate is clean
      const gitStatus = execFileSync('git', [
        ...SAFE_GIT_OPTIONS,
        '-C', candidateDir,
        'status', '--porcelain'
      ], {
        encoding: 'utf8',
        env: gitEnvironment()
      }).trim();

      assert.equal(gitStatus, '', 'Scaffolded metadata files must be excluded from git status');
    });

    it('[CHAL-VER-03] modification inside allowedPaths passes downstream verification', () => {
      const contract = {
        schemaVersion: '1.0.0',
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
        }
      };

      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'allowed-edit-branch',
        output: candidateDir,
        designContract: contract
      });

      // Modify allowed file: app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt
      const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.writeFileSync(editorFile, '// Updated by coding agent conforming to allowedPaths\n');

      const verResult = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: androidDir,
        contract,
        throwOnError: true
      });

      assert.equal(verResult.valid, true);
      assert.equal(verResult.status, 'PASS');
      assert.equal(verResult.violations.length, 0);
      assert.deepEqual(verResult.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']);
    });

    it('[CHAL-VER-04] modification outside allowedPaths fails downstream verification with boundary violation', () => {
      const contract = {
        schemaVersion: '1.0.0',
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
        }
      };

      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'forbidden-edit-branch',
        output: candidateDir,
        designContract: contract
      });

      // Modify forbidden file: app/src/main/java/com/claude/noteapp/data/NoteDao.kt
      const daoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteDao.kt');
      fs.writeFileSync(daoFile, '// Malicious change outside allowed boundaries\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: androidDir,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });
  });

  // =========================================================================
  // Challenge Area 5: Collision & Concurrency Stress
  // =========================================================================
  describe('Challenge Area 5: Collision & Concurrency Stress', () => {
    it('[CHAL-COL-01] prevents concurrent/duplicate worktree creation targeting the same output directory', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'branch-first',
        output: candidateDir
      });

      const secondCandidateDir = candidateDir;
      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'branch-second',
          output: secondCandidateDir
        });
      }, (err) => err instanceof InputError && /already exists and is not empty|already a registered git worktree/i.test(err.message));
    });

    it('[CHAL-COL-02] rejects dirty baseline repository before creating worktree', () => {
      // Introduce an uncommitted change in the baseline repository
      fs.writeFileSync(path.join(androidDir, 'uncommitted.txt'), 'dirty untracked file\n');

      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          branch: 'dirty-baseline-branch',
          output: candidateDir
        });
      }, (err) => err instanceof InputError && /clean baseline is required/i.test(err.message));

      assert.equal(fs.existsSync(candidateDir), false);
      assert.equal(branchExists(androidDir, 'dirty-baseline-branch'), false);
    });

    it('[CHAL-COL-03] teardown via removeAgentWorktree with deleteBranch: true cleans up completely', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        branch: 'teardown-branch',
        output: candidateDir
      });

      assert.equal(fs.existsSync(candidateDir), true);
      assert.equal(branchExists(androidDir, 'teardown-branch'), true);

      const removal = removeAgentWorktree({
        android: androidDir,
        output: candidateDir,
        branch: 'teardown-branch',
        deleteBranch: true
      });

      assert.equal(removal.success, true);
      assert.equal(removal.branchDeleted, true);
      assert.equal(fs.existsSync(candidateDir), false);
      assert.equal(branchExists(androidDir, 'teardown-branch'), false);
      assert.equal(getRegisteredWorktrees(androidDir).includes(candidateDir), false);
    });
  });
});
