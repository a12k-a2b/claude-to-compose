/**
 * tests/unit/worktree.test.js
 *
 * Unit test suite for Automated Git Worktree Scaffolding, Context Provisioning,
 * and Rollback Subsystem (Requirement R2 / Feature F07, F08, F09).
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

const { verifyCandidateWorktree } = require('../../src/verification/candidate_verifier');

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test User']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeCleanRepoWithCommit(dir) {
  initCleanGitRepo(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Baseline Project\n');
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), '// NoteEditorScreen\n');
  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

describe('Worktree Subsystem: tests/unit/worktree.test.js', () => {
  let tempRoot;
  let androidDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-wt-unit-')));
    androidDir = path.join(tempRoot, 'android-app');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-wt');

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
  // Suite 1: Path & Argument Validation
  // =========================================================================
  describe('Suite 1: Path & Argument Validation', () => {
    it('[T01] throws InputError when android is omitted or empty string', () => {
      assert.throws(
        () => createAgentWorktree({ android: '', output: candidateDir, branch: 'candidate-b' }),
        err => err instanceof InputError && /android repository/i.test(err.message)
      );
      assert.throws(
        () => createAgentWorktree({ output: candidateDir, branch: 'candidate-b' }),
        err => err instanceof InputError && /android repository/i.test(err.message)
      );
    });

    it('[T02] throws InputError when output is omitted or empty string', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: '', branch: 'candidate-b' }),
        err => err instanceof InputError && /output candidate path/i.test(err.message)
      );
      assert.throws(
        () => createAgentWorktree({ android: androidDir, branch: 'candidate-b' }),
        err => err instanceof InputError && /output candidate path/i.test(err.message)
      );
    });

    it('[T03] throws InputError when branch is omitted or empty string', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: '' }),
        err => err instanceof InputError && /branch name/i.test(err.message)
      );
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir }),
        err => err instanceof InputError && /branch name/i.test(err.message)
      );
    });

    it('[T04] throws InputError on parent traversal in android (../baseline)', () => {
      assert.throws(
        () => createAgentWorktree({ android: `${androidDir}/../escaped`, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /traversal/i.test(err.message)
      );
    });

    it('[T05] throws InputError on parent traversal in output (candidate/../../escaped)', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: `${candidateDir}/../../escaped`, branch: 'b' }),
        err => err instanceof InputError && /traversal/i.test(err.message)
      );
    });

    it('[T06] throws InputError on URL-encoded traversal in paths (%2e%2e/target)', () => {
      assert.throws(
        () => createAgentWorktree({ android: `${androidDir}/%2e%2e/escaped`, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /traversal/i.test(err.message)
      );
    });

    it('[T07] throws InputError on null byte injection in paths', () => {
      assert.throws(
        () => createAgentWorktree({ android: `${androidDir}\0target`, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /null byte/i.test(err.message)
      );
    });

    it('[T08] throws InputError when output targets filesystem root (/) or home directory ($HOME)', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: '/', branch: 'b' }),
        err => err instanceof InputError && /root|dangerous/i.test(err.message)
      );
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: os.homedir(), branch: 'b' }),
        err => err instanceof InputError && /home|dangerous/i.test(err.message)
      );
    });

    it('[T09] throws InputError when android path does not exist on disk', () => {
      const nonExistent = path.join(tempRoot, 'does-not-exist');
      assert.throws(
        () => createAgentWorktree({ android: nonExistent, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /does not exist/i.test(err.message)
      );
    });

    it('[T10] throws InputError on invalid branch names', () => {
      const invalidBranches = ['feature/..', 'bad branch', 'feature~1', 'branch^', 'feat:name', 'feat*test', '-starts-with-dash', 'trailing/'];
      for (const b of invalidBranches) {
        assert.throws(
          () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: b }),
          err => err instanceof InputError && /invalid git branch name/i.test(err.message),
          `Expected invalid branch rejection for "${b}"`
        );
      }
    });
  });

  // =========================================================================
  // Suite 2: Directional Containment & Boundary Enforcements
  // =========================================================================
  describe('Suite 2: Directional Containment & Boundary Enforcements', () => {
    it('[T11] throws InputError when output is directly inside android repository', () => {
      const insideOutput = path.join(androidDir, 'candidate');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: insideOutput, branch: 'b' }),
        err => err instanceof InputError && /inside the Android repository/i.test(err.message)
      );
    });

    it('[T12] throws InputError when output is deeply nested inside android repository', () => {
      const deepOutput = path.join(androidDir, 'worktrees', 'nested', 'v1');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: deepOutput, branch: 'b' }),
        err => err instanceof InputError && /inside the Android repository/i.test(err.message)
      );
    });

    it('[T13] throws InputError when output equals android repository', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: androidDir, branch: 'b' }),
        err => err instanceof InputError && /differ from the Android repository/i.test(err.message)
      );
    });

    it('[T14] throws InputError when android is inside output (reverse containment)', () => {
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: tempRoot, branch: 'b' }),
        err => err instanceof InputError && /Android repository must not be inside/i.test(err.message)
      );
    });

    it('[T15] throws InputError when output is inside android via symlink path traversal', () => {
      const linkInside = path.join(tempRoot, 'link-to-inside');
      const realInside = path.join(androidDir, 'subdir');
      fs.mkdirSync(realInside, { recursive: true });
      fs.symlinkSync(realInside, linkInside);
      const target = path.join(linkInside, 'candidate');

      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: target, branch: 'b' }),
        err => err instanceof InputError && /inside the Android repository/i.test(err.message)
      );
    });
  });

  // =========================================================================
  // Suite 3: Baseline Repository Integrity & Cleanliness
  // =========================================================================
  describe('Suite 3: Baseline Repository Integrity & Cleanliness', () => {
    it('[T16] throws InputError when baseline repository has unstaged file modifications', () => {
      fs.appendFileSync(path.join(androidDir, 'README.md'), 'dirty change\n');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /uncommitted changes|clean baseline/i.test(err.message)
      );
    });

    it('[T17] throws InputError when baseline repository has staged uncommitted modifications', () => {
      fs.appendFileSync(path.join(androidDir, 'README.md'), 'staged change\n');
      execFileSync('git', ['-C', androidDir, 'add', 'README.md']);
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /uncommitted changes|clean baseline/i.test(err.message)
      );
    });

    it('[T18] throws InputError when baseline repository has untracked source files', () => {
      fs.writeFileSync(path.join(androidDir, 'Untracked.kt'), '// new file\n');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /uncommitted changes|clean baseline/i.test(err.message)
      );
    });

    it('[T19] throws BlockedError when baseline repository has no committed revisions (unborn HEAD)', () => {
      const unbornDir = path.join(tempRoot, 'unborn-repo');
      initCleanGitRepo(unbornDir);
      assert.throws(
        () => createAgentWorktree({ android: unbornDir, output: candidateDir, branch: 'b' }),
        err => err instanceof BlockedError && /committed HEAD/i.test(err.message)
      );
    });

    it('[T20] succeeds cleanly when baseline repository is 100% clean and committed', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-b'
      });
      assert.equal(res.status, 'PASS');
      assert.equal(res.branch, 'candidate-b');
      assert.ok(fs.existsSync(candidateDir));
    });
  });

  // =========================================================================
  // Suite 4: Pre-Flight Collision Detection
  // =========================================================================
  describe('Suite 4: Pre-Flight Collision Detection', () => {
    it('[T21] throws InputError when requested branch already exists in baseline repository', () => {
      execFileSync('git', ['-C', androidDir, 'branch', 'existing-branch']);
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'existing-branch' }),
        err => err instanceof InputError && /already exists in repository/i.test(err.message)
      );
    });

    it('[T22] throws InputError when output candidate path is an existing non-empty directory', () => {
      fs.mkdirSync(candidateDir, { recursive: true });
      fs.writeFileSync(path.join(candidateDir, 'existing.txt'), 'collision');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /already exists and is not empty/i.test(err.message)
      );
    });

    it('[T23] throws InputError when output candidate path already exists as a regular file', () => {
      fs.writeFileSync(candidateDir, 'regular file collision');
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /already exists as a regular file/i.test(err.message)
      );
    });

    it('[T24] throws InputError when output candidate path is an existing symbolic link', () => {
      const linkTarget = path.join(tempRoot, 'some-target');
      fs.mkdirSync(linkTarget, { recursive: true });
      fs.symlinkSync(linkTarget, candidateDir);
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: candidateDir, branch: 'b' }),
        err => err instanceof InputError && /existing symbolic link/i.test(err.message)
      );
    });

    it('[T25] throws InputError when output candidate path is already a registered Git worktree', () => {
      const wt1 = path.join(tempRoot, 'registered-wt');
      execFileSync('git', ['-C', androidDir, 'worktree', 'add', '-b', 'wt1-branch', wt1, 'HEAD']);
      assert.throws(
        () => createAgentWorktree({ android: androidDir, output: wt1, branch: 'b2' }),
        err => err instanceof InputError && (/already a registered git worktree/i.test(err.message) || /not empty/i.test(err.message))
      );
    });
  });

  // =========================================================================
  // Suite 5: Worktree Scaffolding & Marker Initialization
  // =========================================================================
  describe('Suite 5: Worktree Scaffolding & Marker Initialization', () => {
    it('[T26] successfully creates descendant Git worktree at output path', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-scaffold'
      });
      assert.equal(res.status, 'PASS');
      assert.equal(fs.realpathSync(res.candidatePath), fs.realpathSync(candidateDir));
    });

    it('[T27] confirms candidate worktree is on the requested branch', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'feature-editor'
      });
      const currentBranch = execFileSync('git', ['-C', candidateDir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8'
      }).trim();
      assert.equal(currentBranch, 'feature-editor');
    });

    it('[T28] confirms candidate HEAD matches baseline repository HEAD commit SHA', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-head-check'
      });
      const candidateHead = execFileSync('git', ['-C', candidateDir, 'rev-parse', 'HEAD'], {
        encoding: 'utf8'
      }).trim();
      assert.equal(candidateHead, baselineCommit);
      assert.equal(res.baselineCommit, baselineCommit);
    });

    it('[T29] confirms gitCommonDirectory(output) === gitCommonDirectory(android)', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-common-dir'
      });
      assert.equal(gitCommonDirectory(candidateDir), gitCommonDirectory(androidDir));
    });

    it('[T30] confirms .ctc-workspace.json is created with valid schema', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-marker-schema'
      });
      const markerPath = path.join(candidateDir, '.ctc-workspace.json');
      assert.ok(fs.existsSync(markerPath));
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.equal(marker.kind, 'ctc-workspace');
      assert.equal(marker.version, 1);
      assert.equal(typeof marker.androidRoot, 'string');
      assert.equal(marker.androidRoot, androidDir);
    });

    it('[T31] confirms readWorkspace(output) parses the marker without error', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-read-ws'
      });
      const marker = readWorkspace(candidateDir);
      assert.equal(marker.kind, 'ctc-workspace');
      assert.equal(marker.version, 1);
      assert.equal(marker.androidRoot, androidDir);
    });

    it('[T32] confirms .ctc-workspace.json has secure 0o600 permissions', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-perms'
      });
      const markerPath = path.join(candidateDir, '.ctc-workspace.json');
      const stat = fs.statSync(markerPath);
      const mode = stat.mode & 0o777;
      assert.equal(mode, 0o600);
    });

    it('[T33] confirms candidate worktree working tree has zero initial changes relative to baseline commit', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-zero-changes'
      });
      const changed = gitChangedPaths(candidateDir, baselineCommit);
      assert.equal(changed.length, 0, `Expected 0 changed paths but got: ${changed.join(', ')}`);
    });
  });

  // =========================================================================
  // Suite 6: Atomic Rollback & Failure Cleanup
  // =========================================================================
  describe('Suite 6: Atomic Rollback & Failure Cleanup', () => {
    it('[T34] triggers rollback when marker write fails (e.g. read-only candidate dir)', () => {
      // Create output dir and make it read-only to provoke error after worktree add
      const failingOutput = path.join(tempRoot, 'failing-candidate');
      fs.mkdirSync(failingOutput, { recursive: true });

      // We simulate failure by throwing inside custom packetOptions or hooking write
      assert.throws(() => {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          output: failingOutput,
          branch: 'branch-fail-rollback',
          migrationPlan: {
            get boundaries() {
              throw new Error('Simulated failure during context generation');
            }
          }
        });
      }, /Simulated failure/);
    });

    it('[T35] verifies git worktree registration is cleanly removed after rollback', () => {
      const failingOutput = path.join(tempRoot, 'failing-candidate-wt');
      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          output: failingOutput,
          branch: 'branch-wt-pruned',
          migrationPlan: {
            get boundaries() {
              throw new Error('provoked failure');
            }
          }
        });
      } catch (_) {}

      const worktrees = getRegisteredWorktrees(androidDir);
      assert.ok(!worktrees.includes(failingOutput));
    });

    it('[T36] verifies created branch is cleanly deleted from repository after rollback', () => {
      const failingOutput = path.join(tempRoot, 'failing-branch-clean');
      const targetBranch = 'branch-deleted-on-fail';
      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          output: failingOutput,
          branch: targetBranch,
          migrationPlan: {
            get boundaries() {
              throw new Error('provoked failure');
            }
          }
        });
      } catch (_) {}

      assert.equal(branchExists(androidDir, targetBranch), false);
    });

    it('[T37] verifies candidate output directory is completely removed from disk after rollback', () => {
      const failingOutput = path.join(tempRoot, 'failing-dir-clean');
      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          output: failingOutput,
          branch: 'branch-dir-clean',
          migrationPlan: {
            get boundaries() {
              throw new Error('provoked failure');
            }
          }
        });
      } catch (_) {}

      assert.equal(fs.existsSync(failingOutput), false);
    });

    it('[T38] verifies baseline repository remains 100% clean with zero leftover git artifacts', () => {
      const failingOutput = path.join(tempRoot, 'failing-baseline-clean');
      try {
        createAgentWorktree({
          android: androidDir,
          workspace: workspaceDir,
          output: failingOutput,
          branch: 'branch-baseline-clean',
          migrationPlan: {
            get boundaries() {
              throw new Error('provoked failure');
            }
          }
        });
      } catch (_) {}

      const status = execFileSync('git', ['-C', androidDir, 'status', '--porcelain'], {
        encoding: 'utf8'
      }).trim();
      assert.equal(status, '', 'Baseline repo must remain completely clean');
    });
  });

  // =========================================================================
  // Suite 7: Downstream Integration & Verification Compatibility
  // =========================================================================
  describe('Suite 7: Downstream Integration & Verification Compatibility', () => {
    it('[T39] output worktree passes verifyCandidateWorktree({ candidate, baselineRoot })', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-verify-pass'
      });

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: androidDir,
        baselineCommit
      });

      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[T40] generates agent-packet.json and AGENT_PACKET.md when contract or migrationPlan is provided', () => {
      const contract = {
        schemaVersion: '1.0.0',
        id: 'contract_note_editor',
        screenId: 'note_editor',
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'],
          prohibitedChanges: ['Do not alter Room SQLite queries'],
          verificationCommands: [
            './gradlew compileDebugKotlin --no-daemon',
            './gradlew testDebugUnitTest --no-daemon'
          ]
        }
      };

      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-with-packet',
        designContract: contract
      });

      assert.ok(fs.existsSync(res.packet.json));
      assert.ok(fs.existsSync(res.packet.markdown));
      assert.equal(res.packetPath, res.packet.json);
      assert.equal(res.packetMarkdownPath, res.packet.markdown);

      const json = JSON.parse(fs.readFileSync(res.packet.json, 'utf8'));
      assert.ok(json.targetScope.allowedModificationPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor'));

      const md = fs.readFileSync(res.packet.markdown, 'utf8');
      assert.ok(md.includes('app/src/main/java/com/claude/noteapp/ui/editor'));
      assert.ok(md.includes('Anti-Tampering Directive'));
    });

    it('[T41] returns structured summary object matching WorktreeResult schema', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-summary-schema'
      });

      assert.equal(res.command, 'agent worktree');
      assert.equal(res.status, 'PASS');
      assert.equal(typeof res.candidatePath, 'string');
      assert.equal(typeof res.worktree, 'string');
      assert.equal(res.branch, 'candidate-summary-schema');
      assert.equal(res.baselineRoot, androidDir);
      assert.equal(res.androidBaseline, androidDir);
      assert.equal(res.baselineCommit, baselineCommit);
      assert.equal(typeof res.markerPath, 'string');
      assert.ok(res.packet && typeof res.packet.json === 'string');
      assert.ok(Array.isArray(res.allowedPaths));
      assert.ok(Array.isArray(res.verificationCommands));
      assert.ok(typeof res.createdAt === 'string');
    });
  });

  // =========================================================================
  // Suite 8: Teardown Lifecycle Helper (removeAgentWorktree)
  // =========================================================================
  describe('Suite 8: Teardown Lifecycle Helper (removeAgentWorktree)', () => {
    it('[T42] successfully unregisters and removes worktree and deletes candidate directory', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'candidate-to-remove'
      });
      assert.ok(fs.existsSync(candidateDir));

      const res = removeAgentWorktree({
        android: androidDir,
        output: candidateDir
      });

      assert.equal(res.success, true);
      assert.equal(fs.existsSync(candidateDir), false);
      const registered = getRegisteredWorktrees(androidDir);
      assert.ok(!registered.includes(candidateDir));
    });

    it('[T43] deletes git branch when deleteBranch: true is passed', () => {
      const branchToRemove = 'branch-to-be-deleted';
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: branchToRemove
      });
      assert.equal(branchExists(androidDir, branchToRemove), true);

      removeAgentWorktree({
        android: androidDir,
        output: candidateDir,
        branch: branchToRemove,
        deleteBranch: true
      });

      assert.equal(branchExists(androidDir, branchToRemove), false);
    });

    it('[T44] handles already-removed or missing worktree directory gracefully', () => {
      const res = removeAgentWorktree({
        android: androidDir,
        output: path.join(tempRoot, 'already-missing-wt')
      });
      assert.equal(res.success, true);
    });
  });
});
