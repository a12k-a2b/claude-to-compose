/**
 * tests/adversarial/m2_challenger2_packet_boundary_stress.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 2:
 * 1. Contract adapter wildcard stripping & boundary normalization (adaptContractToMigrationPlan)
 * 2. AGENT_PACKET.md line budget (< 300 lines) and packet synthesis
 * 3. .git/info/exclude candidate worktree cleanliness and lifecycle
 * 4. End-to-end contract scaffolding and downstream candidate verification compatibility
 *
 * Executed by challenger_m2_2.
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
  generateImplementationPacket,
  adaptContractToMigrationPlan
} = require('../../src/agent/packet');

const { formatAgentPacketMarkdown } = require('../../src/agent/markdown_formatter');

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
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger2@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Milestone2 Challenger 2']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeCleanRepoWithCommit(dir) {
  initCleanGitRepo(dir);
  fs.mkdirSync(path.join(dir, 'app', 'src', 'main', 'java', 'com', 'claude', 'noteapp', 'ui', 'editor'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Baseline Repository\n');
  fs.writeFileSync(
    path.join(dir, 'app', 'src', 'main', 'java', 'com', 'claude', 'noteapp', 'ui', 'editor', 'NoteEditorScreen.kt'),
    'package com.claude.noteapp.ui.editor\n\nfun NoteEditorScreen() {}\n'
  );
  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-m', 'Initial baseline commit']);
}

describe('Milestone 2 Challenger 2: Packet Synthesis & Boundary Compatibility Stress Suite', () => {
  let tempRoot;
  let baselineDir;
  let workspaceDir;
  let candidateDir;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m2-chal2-'));
    baselineDir = path.join(tempRoot, 'android-repo');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-wt');

    makeCleanRepoWithCommit(baselineDir);

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, '.ctc-workspace.json'),
      JSON.stringify({ kind: 'ctc-workspace', version: 1, androidRoot: baselineDir }, null, 2)
    );
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir], {
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
  // Suite 1: Contract Adapter Wildcard Stripping & Boundary Normalization
  // =========================================================================
  describe('Suite 1: Contract Adapter Wildcard Stripping (adaptContractToMigrationPlan)', () => {
    it('[CHAL2-WT-01] strips standard trailing /** from allowed paths', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);
    });

    it('[CHAL2-WT-02] strips standard trailing /* from allowed paths', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/*']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);
    });

    it('[CHAL2-WT-03] strips file-extension globs like /*.kt and /**/*.kt', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: [
            'app/src/main/java/com/claude/noteapp/ui/editor/*.kt',
            'app/src/main/java/com/claude/noteapp/ui/editor/**/*.kt'
          ]
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor',
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);
    });

    it('[CHAL2-WT-04] normalizes Windows backslashes to Unix slashes without wildcards', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app\\src\\main\\java\\com\\claude\\noteapp\\ui\\editor\\**']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);
    });

    it('[CHAL2-WT-05] preserves explicit single file paths without wildcards', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'
      ]);
    });

    it('[CHAL2-WT-06] preserves canonical directory paths without wildcards', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      assert.deepEqual(plan.boundaries.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);
    });

    it('[CHAL2-WT-07] handles empty or null contract boundary gracefully with fallback', () => {
      const plan1 = adaptContractToMigrationPlan({});
      assert.ok(plan1.boundaries.allowedModificationPaths.length > 0);
      assert.equal(plan1.boundaries.allowedModificationPaths[0], 'app/src/main/java/com/claude/noteapp/ui/editor');

      const plan2 = adaptContractToMigrationPlan(null);
      assert.equal(plan2, null);
    });

    it('[CHAL2-WT-08] downstream verifier accepts stripped /** allowed paths for files in target directory', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      const changedFiles = [
        'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
        'app/src/main/java/com/claude/noteapp/ui/editor/components/EditorToolbar.kt'
      ];
      const violations = enforceImplementationBoundary(changedFiles, plan.boundaries.allowedModificationPaths);
      assert.equal(violations.length, 0, 'No boundary violations should be reported for files inside stripped allowed path');
    });

    it('[CHAL2-WT-09] downstream verifier strictly rejects changes outside stripped allowed path', () => {
      const contract = {
        implementationBoundary: {
          allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**']
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      const changedFiles = [
        'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt',
        'app/src/main/java/com/claude/noteapp/data/Backdoor.kt'
      ];
      const violations = enforceImplementationBoundary(changedFiles, plan.boundaries.allowedModificationPaths);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].type, 'BOUNDARY_VIOLATION');
      assert.equal(violations[0].path, 'app/src/main/java/com/claude/noteapp/data/Backdoor.kt');
    });
  });

  // =========================================================================
  // Suite 2: AGENT_PACKET.md Line Budget & Synthesis (< 300 lines)
  // =========================================================================
  describe('Suite 2: AGENT_PACKET.md Line Budget & Synthesis', () => {
    it('[CHAL2-PKT-01] baseline AGENT_PACKET.md generation line count is strictly < 300 lines', () => {
      const plan = adaptContractToMigrationPlan({});
      const res = generateImplementationPacket({
        screenId: 'note_editor',
        migrationPlan: plan
      });

      assert.ok(res.markdown, 'Markdown packet should be generated');
      const lines = res.markdown.split('\n');
      assert.ok(lines.length < 300, `Expected < 300 lines, but got ${lines.length}`);
      assert.ok(lines.length >= 100, `Expected at least 100 lines for complete instructions, got ${lines.length}`);
    });

    it('[CHAL2-PKT-02] AGENT_PACKET.md with 20 allowed, 20 forbidden paths, 20 forbidden behaviors remains < 300 lines', () => {
      const manyAllowed = Array.from({ length: 20 }, (_, i) => `app/src/main/java/com/claude/noteapp/ui/editor/sub${i}`);
      const manyForbidden = Array.from({ length: 20 }, (_, i) => `app/src/main/java/com/claude/noteapp/data/protected${i}/**`);
      const manyBehaviors = Array.from({ length: 20 }, (_, i) => `Behavior restriction number ${i + 1}`);

      const contract = {
        implementationBoundary: {
          allowedPaths: manyAllowed,
          prohibitedChanges: manyForbidden,
          forbiddenBehaviors: manyBehaviors
        }
      };
      const plan = adaptContractToMigrationPlan(contract);
      const res = generateImplementationPacket({
        screenId: 'note_editor',
        migrationPlan: plan
      });

      const lines = res.markdown.split('\n');
      assert.ok(lines.length < 300, `Expected < 300 lines with 60 rules, but got ${lines.length}`);
    });

    it('[CHAL2-PKT-03] verifies mandatory sections, Sol:OS tokens, and anti-tampering directive', () => {
      const plan = adaptContractToMigrationPlan({});
      const res = generateImplementationPacket({
        screenId: 'note_editor',
        migrationPlan: plan
      });

      const md = res.markdown;
      assert.ok(md.includes('Target Hardware'), 'Must state DC1 target hardware');
      assert.ok(md.includes('LivePaper'), 'Must specify LivePaper panel');
      assert.ok(md.includes('--os-0') && md.includes('--os-1000'), 'Must include Sol:OS color tokens');
      assert.ok(md.includes('Anti-Tampering Directive'), 'Must include anti-tampering instruction');
      assert.ok(md.includes('Preservation Invariants Checklist'), 'Must include preservation invariants');
    });

    it('[CHAL2-PKT-04] agent-packet.json conforms to required schema properties and matches markdown', () => {
      const plan = adaptContractToMigrationPlan({});
      const res = generateImplementationPacket({
        screenId: 'note_editor',
        migrationPlan: plan,
        format: 'both'
      });

      assert.ok(res.json, 'JSON packet should be present');
      assert.equal(res.json.schemaVersion, '2.0.0');
      assert.ok(res.json.packetId.startsWith('packet_note_editor_'));
      assert.equal(res.json.screenId, 'note_editor');
      assert.ok(Array.isArray(res.json.targetScope.allowedModificationPaths));
      assert.ok(Array.isArray(res.json.targetScope.forbiddenPaths));
      assert.ok(Array.isArray(res.json.targetScope.forbiddenBehaviors));
      assert.ok(res.json.designTokens.solOsNeutralTokens['--os-0']);
      assert.ok(res.json.preservationInvariants.invariants.length > 0);
    });
  });

  // =========================================================================
  // Suite 3: .git/info/exclude Candidate Worktree Cleanliness & Lifecycle
  // =========================================================================
  describe('Suite 3: .git/info/exclude Candidate Cleanliness & Lifecycle', () => {
    it('[CHAL2-EXC-01] candidate worktree is 100% clean immediately upon creation', () => {
      const res = createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/cleanliness-audit',
        output: candidateDir
      });

      assert.equal(res.status, 'PASS');

      // Verify git status is completely empty
      const gitStatus = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
      assert.equal(gitStatus.trim(), '', 'git status in freshly scaffolded candidate worktree must be completely clean');

      // Verify git ls-files --others --exclude-standard is completely empty
      const untracked = execFileSync('git', ['-C', candidateDir, 'ls-files', '--others', '--exclude-standard'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
      assert.equal(untracked.trim(), '', 'No untracked files should appear in candidate worktree');

      // Verify gitChangedPaths returns empty array
      const changed = gitChangedPaths(candidateDir, res.baselineCommit);
      assert.deepEqual(changed, [], 'gitChangedPaths must be empty for fresh candidate worktree');
    });

    it('[CHAL2-EXC-02] .git/info/exclude insertion is idempotent across multiple worktrees', () => {
      const candidateDir2 = path.join(tempRoot, 'candidate-wt-2');

      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/wt-idempotent-1',
        output: candidateDir
      });

      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/wt-idempotent-2',
        output: candidateDir2
      });

      const gitCommonDir = gitCommonDirectory(baselineDir);
      const excludeFile = path.join(gitCommonDir, 'info', 'exclude');
      assert.ok(fs.existsSync(excludeFile), '.git/info/exclude must exist');

      const content = fs.readFileSync(excludeFile, 'utf8');
      const matches = content.match(/agent-packet\.json/g) || [];
      assert.equal(matches.length, 1, 'agent-packet.json must only be listed once in .git/info/exclude');

      // Cleanup candidateDir2
      removeAgentWorktree({ android: baselineDir, output: candidateDir2, branch: 'feat/wt-idempotent-2', deleteBranch: true });
    });

    it('[CHAL2-EXC-03] downstream verifyCandidateWorktree succeeds on clean scaffolded worktree', () => {
      const res = createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/downstream-check',
        output: candidateDir
      });

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: {
          implementationBoundary: {
            allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
          }
        }
      });

      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[CHAL2-EXC-04] allowed modifications in candidate are accepted; out-of-boundary modifications are rejected', () => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/boundary-check',
        output: candidateDir
      });

      // 1. Modify allowed file
      const editorFile = path.join(candidateDir, 'app', 'src', 'main', 'java', 'com', 'claude', 'noteapp', 'ui', 'editor', 'NoteEditorScreen.kt');
      fs.writeFileSync(editorFile, 'package com.claude.noteapp.ui.editor\n\n// Retrofitted NoteEditorScreen\nfun NoteEditorScreen() {}\n');

      const verifyPass = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: {
          implementationBoundary: {
            allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
          }
        }
      });
      assert.equal(verifyPass.status, 'PASS');

      // 2. Modify forbidden file outside boundary
      const readmeFile = path.join(candidateDir, 'README.md');
      fs.writeFileSync(readmeFile, '# Tampered README\n');

      const verifyFail = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        throwOnError: false,
        contract: {
          implementationBoundary: {
            allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
          }
        }
      });
      assert.equal(verifyFail.status, 'FAIL');
      assert.ok(verifyFail.violations.some(v => v.path === 'README.md'));
    });

    it('[CHAL2-EXC-05] untracked rogue file in candidate root is detected as boundary violation', () => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/rogue-file-check',
        output: candidateDir
      });

      // Inject untracked rogue file in candidate root
      fs.writeFileSync(path.join(candidateDir, 'rogue_exploit.sh'), 'echo hacked\n');

      const verifyFail = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        throwOnError: false,
        contract: {
          implementationBoundary: {
            allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor']
          }
        }
      });
      assert.equal(verifyFail.status, 'FAIL');
      assert.ok(verifyFail.violations.some(v => v.path === 'rogue_exploit.sh'));
    });

    it('[CHAL2-EXC-06] removeAgentWorktree completely prunes worktree, deletes branch, and removes dir', () => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/teardown-audit',
        output: candidateDir
      });

      assert.ok(fs.existsSync(candidateDir));
      assert.ok(branchExists(baselineDir, 'feat/teardown-audit'));

      const removeResult = removeAgentWorktree({
        android: baselineDir,
        output: candidateDir,
        branch: 'feat/teardown-audit',
        deleteBranch: true
      });

      assert.equal(removeResult.success, true);
      assert.equal(removeResult.branchDeleted, true);
      assert.equal(fs.existsSync(candidateDir), false, 'Candidate directory must be removed from disk');
      assert.equal(branchExists(baselineDir, 'feat/teardown-audit'), false, 'Branch must be deleted');

      const registered = getRegisteredWorktrees(baselineDir);
      assert.ok(!registered.includes(candidateDir), 'Worktree must be unregistered from git');
    });
  });

  // =========================================================================
  // Suite 4: End-to-End Contract Scaffolding & CLI Integration
  // =========================================================================
  describe('Suite 4: End-to-End Contract Scaffolding & CLI Integration', () => {
    it('[CHAL2-CLI-01] ctc agent worktree with --contract containing /** wildcards scaffolds cleanly', () => {
      const customContractPath = path.join(workspaceDir, 'wildcard-contract.json');
      fs.writeFileSync(
        customContractPath,
        JSON.stringify({
          schemaVersion: '1.0.0',
          screenId: 'note_editor',
          implementationBoundary: {
            allowedPaths: [
              'app/src/main/java/com/claude/noteapp/ui/editor/**'
            ],
            verificationCommands: [
              './gradlew compileDebugKotlin --no-daemon'
            ]
          }
        }, null, 2)
      );

      const res = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'feature/cli-wildcard-test',
        '--output', candidateDir,
        '--contract', customContractPath,
        '--json'
      ]);

      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);

      // Verify the generated agent-packet.json has stripped wildcards
      const packetJson = JSON.parse(fs.readFileSync(path.join(candidateDir, 'agent-packet.json'), 'utf8'));
      assert.deepEqual(packetJson.targetScope.allowedModificationPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ]);

      // Verify downstream verification passes on this worktree
      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: packetJson
      });
      assert.equal(verifyRes.status, 'PASS');
    });

    it('[CHAL2-CLI-02] mid-flight failure during contract reading cleans up branch and output worktree completely', () => {
      const invalidContractPath = path.join(workspaceDir, 'nonexistent-contract.json');

      const res = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'feature/rollback-test',
        '--output', candidateDir,
        '--contract', invalidContractPath,
        '--json'
      ]);

      assert.equal(res.status, 'INPUT_INVALID');
      assert.equal(res.exitCode, 3);

      // Verify rollback
      assert.equal(fs.existsSync(candidateDir), false, 'Candidate directory must not exist');
      assert.equal(branchExists(baselineDir, 'feature/rollback-test'), false, 'Branch must not exist');
      const registered = getRegisteredWorktrees(baselineDir);
      assert.ok(!registered.includes(candidateDir), 'Worktree must not be registered');
    });
  });
});
