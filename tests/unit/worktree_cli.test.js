/**
 * tests/unit/worktree_cli.test.js
 *
 * Unit test suite for `ctc agent worktree` CLI command dispatch, option validation,
 * error code routing, and structured JSON output (Requirement R2 / Features F07, F08, F09).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { dispatch } = require('../../src/cli/dispatcher');

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

describe('Worktree CLI Subsystem: tests/unit/worktree_cli.test.js', () => {
  let tempRoot;
  let androidDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-cli-wt-')));
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
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (_) {}
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Suite 1: Subcommand Routing & Help
  // =========================================================================
  describe('Suite 1: Subcommand Routing & Help', () => {
    it('[T01] ctc agent without action returns exit code 3 (Unknown agent action)', () => {
      const res = dispatch(['agent', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.success, false);
      assert.ok(/action required|unknown agent action/i.test(res.error || ''));
    });

    it('[T02] ctc agent invalidAction returns exit code 3 and mentions packet, worktree', () => {
      const res = dispatch(['agent', 'invalidAction', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.success, false);
      assert.ok(/allowed: packet, worktree/i.test(res.error || ''));
    });

    it('[T03] ctc agent worktree --help returns usage help text with exit code 0', () => {
      const res = dispatch(['agent', 'worktree', '--help']);
      assert.equal(res.exitCode, 0);
      assert.equal(res.success, true);
      assert.ok(res.output.includes('Usage: ctc'));

      const agentCmd = require('../../src/cli/commands/agent');
      const directHelp = agentCmd.execute({ _: ['worktree'], flags: { help: true } });
      assert.equal(directHelp.exitCode, 0);
      assert.ok(directHelp.humanOutput.includes('Usage: ctc agent worktree'));
    });

    it('[T04] rejects unknown option via validateOptions with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--nonexistentOption',
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.equal(res.success, false);
      assert.ok(/unrecognized option "--nonexistentOption"/i.test(res.error || ''));
    });
  });

  // =========================================================================
  // Suite 2: Mandatory Options Verification (Exit Code 3)
  // =========================================================================
  describe('Suite 2: Mandatory Options Verification (Exit Code 3)', () => {
    it('[T05] fails with exit code 3 when --android is missing', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/--android <path> is required/i.test(res.error || ''));
    });

    it('[T06] fails with exit code 3 when --workspace is missing', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/--workspace <path> is required/i.test(res.error || ''));
    });

    it('[T07] fails with exit code 3 when --branch is missing', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/--branch <name> is required/i.test(res.error || ''));
    });

    it('[T08] fails with exit code 3 when --output is missing', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/--output <path> is required/i.test(res.error || ''));
    });

    it('[T09] fails with exit code 3 when all flags are missing', () => {
      const res = dispatch(['agent', 'worktree', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.success, false);
    });
  });

  // =========================================================================
  // Suite 3: Path Traversal & Dangerous Root Rejection (Exit Code 3)
  // =========================================================================
  describe('Suite 3: Path Traversal & Dangerous Root Rejection (Exit Code 3)', () => {
    it('[T10] rejects --android ../escaped with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', `${androidDir}/../escaped`,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/traversal/i.test(res.error || ''));
    });

    it('[T11] rejects --workspace ../escaped with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', `${workspaceDir}/../escaped`,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/traversal/i.test(res.error || ''));
    });

    it('[T12] rejects --output ../escaped with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', `${candidateDir}/../../escaped`,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/traversal/i.test(res.error || ''));
    });

    it('[T13] rejects --android targeting / with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', '/',
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/root|dangerous/i.test(res.error || ''));
    });

    it('[T14] rejects --android targeting $HOME with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', os.homedir(),
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/home|dangerous/i.test(res.error || ''));
    });

    it('[T15] rejects --workspace targeting / with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', '/',
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/root|dangerous/i.test(res.error || ''));
    });

    it('[T16] rejects --workspace targeting $HOME with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', os.homedir(),
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/home|dangerous/i.test(res.error || ''));
    });

    it('[T17] rejects --output targeting / with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', '/',
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/root|dangerous/i.test(res.error || ''));
    });

    it('[T18] rejects --output targeting $HOME with exit code 3', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', os.homedir(),
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/home|dangerous/i.test(res.error || ''));
    });
  });

  // =========================================================================
  // Suite 4: Boundary Confinement & Collision Guardrails (Exit Code 3)
  // =========================================================================
  describe('Suite 4: Boundary Confinement & Collision Guardrails (Exit Code 3)', () => {
    it('[T19] rejects --output located inside the Android repository', () => {
      const insideOutput = path.join(androidDir, 'candidate');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', insideOutput,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/inside the Android repository/i.test(res.error || ''));
    });

    it('[T20] rejects --output identical to Android repository root', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', androidDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/differ from/i.test(res.error || ''));
    });

    it('[T21] rejects --output identical to workspace directory', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', workspaceDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/differ from workspace|collide with workspace/i.test(res.error || ''));
    });

    it('[T22] rejects --output targeting an existing regular file', () => {
      fs.writeFileSync(candidateDir, 'collision file');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/regular file/i.test(res.error || ''));
    });

    it('[T23] rejects --output targeting an existing non-empty directory', () => {
      fs.mkdirSync(candidateDir, { recursive: true });
      fs.writeFileSync(path.join(candidateDir, 'f.txt'), 'content');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/not empty/i.test(res.error || ''));
    });

    it('[T24] allows --output targeting an existing empty directory', () => {
      fs.mkdirSync(candidateDir, { recursive: true });
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-empty-dir',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });
  });

  // =========================================================================
  // Suite 5: Workspace Marker & Environment Prerequisites (Exit Code 3)
  // =========================================================================
  describe('Suite 5: Workspace Marker & Environment Prerequisites (Exit Code 3)', () => {
    it('[T25] rejects --workspace pointing to non-existent directory', () => {
      const nonExistentWs = path.join(tempRoot, 'non-existent-ws');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', nonExistentWs,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/not initialized/i.test(res.error || ''));
    });

    it('[T26] rejects --workspace missing .ctc-workspace.json marker', () => {
      const missingMarkerWs = path.join(tempRoot, 'empty-ws');
      fs.mkdirSync(missingMarkerWs, { recursive: true });
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', missingMarkerWs,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/not initialized/i.test(res.error || ''));
    });

    it('[T27] rejects --workspace when .ctc-workspace.json is a symbolic link', () => {
      const symlinkWs = path.join(tempRoot, 'symlink-ws');
      fs.mkdirSync(symlinkWs, { recursive: true });
      const realMarker = path.join(workspaceDir, '.ctc-workspace.json');
      fs.symlinkSync(realMarker, path.join(symlinkWs, '.ctc-workspace.json'));
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', symlinkWs,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/not initialized|symlink/i.test(res.error || ''));
    });

    it('[T28] rejects --workspace when marker has invalid JSON syntax', () => {
      const brokenWs = path.join(tempRoot, 'broken-ws');
      fs.mkdirSync(brokenWs, { recursive: true });
      fs.writeFileSync(path.join(brokenWs, '.ctc-workspace.json'), '{ broken json syntax ');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', brokenWs,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/not initialized|invalid/i.test(res.error || ''));
    });

    it('[T29] rejects --workspace when marker has version !== 1 or missing androidRoot', () => {
      const badWs = path.join(tempRoot, 'bad-version-ws');
      fs.mkdirSync(badWs, { recursive: true });
      fs.writeFileSync(path.join(badWs, '.ctc-workspace.json'), JSON.stringify({ kind: 'ctc-workspace', version: 2 }));
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', badWs,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/marker is invalid/i.test(res.error || ''));
    });
  });

  // =========================================================================
  // Suite 6: Git Baseline Integrity & Branch Validation (Exit Code 3)
  // =========================================================================
  describe('Suite 6: Git Baseline Integrity & Branch Validation (Exit Code 3)', () => {
    it('[T30] rejects --android pointing to non-Git directory', () => {
      const nonGitDir = path.join(tempRoot, 'non-git-dir');
      fs.mkdirSync(nonGitDir, { recursive: true });
      const res = dispatch([
        'agent', 'worktree',
        '--android', nonGitDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 2); // BlockedError: requires initialized git repo
      assert.ok(/git repository/i.test(res.error || ''));
    });

    it('[T31] rejects --android with uncommitted tracked changes (dirty === true)', () => {
      fs.appendFileSync(path.join(androidDir, 'README.md'), 'dirty tracked edit\n');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/uncommitted changes|clean baseline/i.test(res.error || ''));
    });

    it('[T32] rejects --android with untracked files in working tree (dirty === true)', () => {
      fs.writeFileSync(path.join(androidDir, 'Untracked.kt'), '// new file\n');
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/uncommitted changes|clean baseline/i.test(res.error || ''));
    });

    it('[T33] rejects --branch with invalid ref format', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'bad ref!~^',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/invalid git branch name/i.test(res.error || ''));
    });

    it('[T34] rejects --branch that already exists in Git baseline repository', () => {
      execFileSync('git', ['-C', androidDir, 'branch', 'already-exists-b']);
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'already-exists-b',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 3);
      assert.ok(/already exists in repository/i.test(res.error || ''));
    });
  });

  // =========================================================================
  // Suite 7: Flag Aliases and Canonicalization
  // =========================================================================
  describe('Suite 7: Flag Aliases and Canonicalization', () => {
    it('[T35] recognizes -a as alias for --android', () => {
      const res = dispatch([
        'agent', 'worktree',
        '-a', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'alias-a-branch',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });

    it('[T36] recognizes --app-dir as alias for --android', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--app-dir', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'alias-appdir-branch',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });

    it('[T37] recognizes -w as alias for --workspace', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '-w', workspaceDir,
        '--branch', 'alias-w-branch',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });

    it('[T38] recognizes -b as alias for --branch', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '-b', 'alias-b-branch',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });

    it('[T39] recognizes -o as alias for --output', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'alias-o-branch',
        '-o', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });

    it('[T40] recognizes mixed short and long flags seamlessly', () => {
      const res = dispatch([
        'agent', 'worktree',
        '-a', androidDir,
        '-w', workspaceDir,
        '-b', 'mixed-flags-branch',
        '-o', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
    });
  });

  // =========================================================================
  // Suite 8: Successful Scaffolding & Structured Output (Exit Code 0)
  // =========================================================================
  describe('Suite 8: Successful Scaffolding & Structured Output (Exit Code 0)', () => {
    it('[T41] creates candidate worktree successfully with status PASS and exitCode 0', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-scaffold-pass',
        '--output', candidateDir,
        '--json'
      ]);
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
      assert.equal(res.success, true);
      assert.ok(fs.existsSync(candidateDir));
    });

    it('[T42] returns machine-readable JSON matching required fields when --json is provided', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-json-schema',
        '--output', candidateDir,
        '--json'
      ]);

      assert.equal(res.exitCode, 0);
      const data = res.data;
      assert.ok(data, 'data must be defined');
      assert.equal(data.branch, 'feature-json-schema');
      assert.equal(data.worktree, candidateDir);
      assert.equal(data.candidatePath, candidateDir);
      assert.equal(data.androidBaseline, androidDir);
      assert.equal(data.baselineCommit, baselineCommit);
      assert.ok(data.packet, 'data.packet must exist');
      assert.equal(typeof data.packet.json, 'string');
      assert.equal(typeof data.packet.markdown, 'string');
      assert.equal(data.packetPath, data.packet.json);
      assert.ok(Array.isArray(data.allowedPaths));
      assert.ok(Array.isArray(data.verificationCommands));
    });

    it('[T43] respects optional --contract and --screen parameters, binding them into scaffolded packet', () => {
      const contractPath = path.join(workspaceDir, 'custom-contract.json');
      fs.writeFileSync(
        contractPath,
        JSON.stringify({
          schemaVersion: '1.0.0',
          id: 'custom_contract_1',
          screenId: 'custom_screen',
          implementationBoundary: {
            allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/custom'],
            prohibitedChanges: ['Do not touch data'],
            verificationCommands: ['./gradlew customTest']
          }
        }, null, 2)
      );

      const res = dispatch([
        'agent', 'worktree',
        '--android', androidDir,
        '--workspace', workspaceDir,
        '--branch', 'feature-custom-contract',
        '--output', candidateDir,
        '--contract', contractPath,
        '--screen', 'custom_screen',
        '--json'
      ]);

      assert.equal(res.exitCode, 0);
      assert.ok(res.data.allowedPaths.includes('app/src/main/java/com/claude/noteapp/ui/custom'));
      assert.ok(res.data.verificationCommands.includes('./gradlew customTest'));

      const packetJson = JSON.parse(fs.readFileSync(res.data.packetPath, 'utf8'));
      assert.equal(packetJson.screenId, 'custom_screen');
    });
  });
});
