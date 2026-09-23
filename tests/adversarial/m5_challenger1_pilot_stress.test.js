/**
 * tests/adversarial/m5_challenger1_pilot_stress.test.js
 *
 * Empirical Adversarial Stress Suite for Milestone 5:
 * Pilot Workflow & Candidate Verification Engine Under Hostile Edge Cases.
 *
 * Attack Vectors Tested:
 * 1. Dirty Git Baseline:
 *    - Unstaged modifications to tracked baseline files reject worktree creation.
 *    - Staged modifications reject worktree creation.
 *    - Untracked source files reject worktree creation.
 *    - Verification against a dirty baseline fails closed.
 * 2. Symlink Attacks During Pilot Workflow:
 *    - Symlink inside candidate source directory targeting external host files.
 *    - Symlink outside source targeting sensitive baseline source files.
 *    - Symlink targeting Android inspection files (AndroidManifest.xml, build.gradle.kts).
 *    - Broken/dangling symlink in candidate source tree.
 * 3. Concurrency & Boundary Bypass Attacks:
 *    - Approved visual deviation does NOT bypass unauthorized edit to NoteRepository.kt.
 *    - Approved visual deviation does NOT bypass unauthorized edit to root build.gradle.kts.
 *    - Approved visual deviation does NOT bypass deletion of baseline source files.
 *    - Candidate attempting to tamper with protected owner approval files fails closed.
 * 4. Corrupted / Tampered Agent Packet & Workspace Marker:
 *    - Candidate tampering agent-packet.json to expand allowedPaths does NOT bypass contract.
 *    - Tampered .ctc-workspace.json (corrupted commit or mismatched root) fails closed.
 *    - Corrupted non-JSON .ctc-workspace.json fails closed.
 *    - Corrupted agent-packet.json does not crash or compromise candidate verifier.
 * 5. Rapid Worktree Lifecycle Stress:
 *    - 5 rapid sequential create-modify-verify-teardown cycles on the same baseline.
 *    - Concurrent sibling worktrees on separate branches operate in strict isolation.
 *    - Branch name collision fails closed without corrupting existing worktrees.
 *    - Non-empty directory collision fails closed.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { dispatch } = require('../../src/cli/dispatcher');
const {
  createAgentWorktree,
  removeAgentWorktree,
  getRegisteredWorktrees,
  branchExists
} = require('../../src/agent/worktree');
const {
  verifyCandidateWorktree,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');
const {
  gitMetadata,
  gitEnvironment,
  gitCommonDirectory,
  readWorkspace,
  MARKER
} = require('../../src/agent/safety');

function sha256(content) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return sha256(text);
}

/**
 * Initializes a clean Git baseline repository from fixtures/note-app.
 */
function initCleanBaseline(baselineDir) {
  const fixtureSrc = path.resolve(__dirname, '../../fixtures/note-app');
  assert.ok(fs.existsSync(fixtureSrc), `Fixture note-app must exist at ${fixtureSrc}`);

  fs.mkdirSync(baselineDir, { recursive: true });
  fs.cpSync(fixtureSrc, baselineDir, {
    recursive: true,
    filter: (src) => {
      const norm = src.replace(/\\/g, '/');
      if (norm.endsWith('/app/build') || norm.includes('/app/build/')) return false;
      if (norm.endsWith('/.gradle') || norm.includes('/.gradle/')) return false;
      return true;
    }
  });

  execFileSync('git', ['-C', baselineDir, 'init', '-q']);
  execFileSync('git', ['-C', baselineDir, 'config', 'user.email', 'stress-challenger@example.com']);
  execFileSync('git', ['-C', baselineDir, 'config', 'user.name', 'Stress Challenger']);
  execFileSync('git', ['-C', baselineDir, 'config', 'commit.gpgsign', 'false']);

  const gitignorePath = path.join(baselineDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'build/\n.gradle/\nlocal.properties\n*.apk\n', 'utf8');
  }

  execFileSync('git', ['-C', baselineDir, 'add', '.']);
  execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'initial baseline from fixtures/note-app']);

  const commit = execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const branch = execFileSync('git', ['-C', baselineDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim() || 'main';

  return { commit, branch };
}

describe('M5 Adversarial Challenger: Pilot Workflow & Candidate Verifier Stress', () => {
  let tempRoot;
  let baselineDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;
  let contractPath;
  let contract;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m5-stress-')));
    baselineDir = path.join(tempRoot, 'baseline-app');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-worktree');

    const initInfo = initCleanBaseline(baselineDir);
    baselineCommit = initInfo.commit;

    fs.mkdirSync(workspaceDir, { recursive: true });
    writeJson(path.join(workspaceDir, '.ctc-workspace.json'), {
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: baselineDir
    });

    contract = {
      schemaVersion: '1.0.0',
      id: 'contract_note_editor',
      screenId: 'note_editor',
      implementationBoundary: {
        allowedPaths: [
          'app/src/main/java/com/claude/noteapp/ui/editor'
        ],
        prohibitedChanges: [
          'DO NOT alter Room SQLite database queries or schemas in data/',
          'DO NOT alter NoteEditorViewModel StateFlow emissions or debounce timing'
        ],
        verificationCommands: [
          './gradlew compileDebugKotlin --no-daemon',
          './gradlew testDebugUnitTest --no-daemon'
        ]
      }
    };
    contractPath = path.join(workspaceDir, 'retrofit-contract.json');
    writeJson(contractPath, contract);
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'prune'], {
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
  // VECTOR 1: Dirty Baseline Repository Attacks
  // =========================================================================
  describe('Vector 1: Dirty Baseline Repository Attacks', () => {
    it('[ADV-DIRTY-01] fails closed when baseline has unstaged tracked file modifications', () => {
      // Modify tracked NoteEditorScreen.kt in baseline without committing
      const editorFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '\n// Dirty uncommitted edit in baseline\n');

      assert.throws(
        () => createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: candidateDir,
          branch: 'branch-dirty-test',
          contract: contractPath
        }),
        (err) => err instanceof InputError && /clean baseline is required/i.test(err.message)
      );

      // Verify worktree was not created
      assert.equal(fs.existsSync(candidateDir), false);
      assert.equal(branchExists(baselineDir, 'branch-dirty-test'), false);
    });

    it('[ADV-DIRTY-02] fails closed when baseline has staged changes', () => {
      // Create staged file in baseline
      const newFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/StagedFile.kt');
      fs.writeFileSync(newFile, '// staged\n');
      execFileSync('git', ['-C', baselineDir, 'add', newFile]);

      assert.throws(
        () => createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: candidateDir,
          branch: 'branch-staged-test',
          contract: contractPath
        }),
        (err) => err instanceof InputError && /clean baseline is required/i.test(err.message)
      );

      assert.equal(fs.existsSync(candidateDir), false);
    });

    it('[ADV-DIRTY-03] fails closed via CLI dispatcher on dirty baseline and returns exitCode 3', () => {
      const editorFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '\n// Uncommitted change\n');

      const res = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'feature/cli-dirty',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      assert.equal(res.status, 'INPUT_INVALID');
      assert.equal(res.exitCode, 3);
      assert.match(res.error, /clean baseline is required/i);
      assert.equal(fs.existsSync(candidateDir), false);
    });

    it('[ADV-DIRTY-04] verifyCandidateWorktree fails closed when baseline is dirtied after worktree creation', () => {
      // 1. Create clean candidate worktree
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-verify-dirty',
        contract: contractPath
      });

      // 2. Candidate applies valid edit
      const candidateEditor = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(candidateEditor, '\n// Candidate valid edit\n');

      // 3. Baseline is dirtied concurrently
      const baselineEditor = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(baselineEditor, '\n// Rogue baseline edit\n');

      // 4. Verification must fail closed
      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        }),
        (err) => err instanceof InputError && /clean committed inspected baseline/i.test(err.message)
      );

      const noThrowRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });
      assert.equal(noThrowRes.status, 'FAIL');
      assert.equal(noThrowRes.code, 1);
      assert.match(noThrowRes.reason, /clean committed inspected baseline/i);
    });
  });

  // =========================================================================
  // VECTOR 2: Symlink Attacks During Pilot Workflow
  // =========================================================================
  describe('Vector 2: Symlink Attacks in Candidate Worktree', () => {
    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-symlink-test',
        contract: contractPath
      });
    });

    it('[ADV-SYM-01] rejects candidate worktree containing symlink inside src/ targeting external file', () => {
      const editorDir = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor');
      const targetOutside = path.join(tempRoot, 'secret_host_file.txt');
      fs.writeFileSync(targetOutside, 'SECRET_TOKEN_HOST\n');

      const symlinkPath = path.join(editorDir, 'InjectedLink.kt');
      fs.symlinkSync(targetOutside, symlinkPath);

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        }),
        (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message)
      );

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });
      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.match(res.reason, /source-sensitive symlink/i);
    });

    it('[ADV-SYM-02] rejects candidate containing symlink outside src/ targeting baseline source files', () => {
      const targetSource = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      const symlinkPath = path.join(candidateDir, 'symlink_to_repo.kt');
      fs.symlinkSync(targetSource, symlinkPath);

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        }),
        (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message)
      );
    });

    it('[ADV-SYM-03] rejects candidate containing symlink targeting AndroidManifest.xml', () => {
      const targetManifest = path.join(baselineDir, 'app/src/main/AndroidManifest.xml');
      const symlinkPath = path.join(candidateDir, 'ManifestAlias.xml');
      fs.symlinkSync(targetManifest, symlinkPath);

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        }),
        (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message)
      );
    });

    it('[ADV-SYM-04] rejects candidate containing broken/dangling symlink in src/', () => {
      const editorDir = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor');
      const danglingTarget = path.join(candidateDir, 'non_existent_target.kt');
      const symlinkPath = path.join(editorDir, 'DanglingLink.kt');
      fs.symlinkSync(danglingTarget, symlinkPath);

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        }),
        (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message)
      );
    });
  });

  // =========================================================================
  // VECTOR 3: Concurrency & Boundary Bypass Attacks
  // =========================================================================
  describe('Vector 3: Concurrency & Boundary Bypass Attacks', () => {
    let approvalFile;
    let validDeviation;

    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-bypass-test',
        contract: contractPath
      });

      // Prepare a legitimate, valid owner approval document
      approvalFile = path.join(workspaceDir, 'legitimate-approval.json');
      writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.legit_toolbar_inset',
        scopes: [
          {
            subjectRef: 'element.editor_toolbar',
            statement: 'Approved 4px inset for DC1 thumb ergonomics.'
          }
        ]
      });

      validDeviation = {
        type: 'VISUAL_DEVIATION',
        subjectRef: 'element.editor_toolbar',
        statement: 'Approved 4px inset for DC1 thumb ergonomics.',
        ownerApprovalRef: 'approval.legit_toolbar_inset'
      };
    });

    it('[ADV-BYPASS-01] approved visual deviation does NOT bypass unauthorized edit in NoteRepository.kt', () => {
      // Permitted edit in NoteEditorScreen.kt
      const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '\n// Permitted edit with approved visual deviation\n');

      // Sneaky out-of-boundary edit in NoteRepository.kt
      const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.appendFileSync(repoFile, '\n// Rogue persistence edit smuggled alongside approved deviation\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalFile,
        deviations: [validDeviation],
        throwOnError: false
      });

      // Must fail closed with status FAIL and code 1
      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.equal(res.valid, false);

      // Verify boundary violation is explicitly recorded
      const boundaryViolation = res.violations.find(v =>
        v.type === 'BOUNDARY_VIOLATION' && v.path.includes('NoteRepository.kt')
      );
      assert.ok(boundaryViolation, 'Must record BOUNDARY_VIOLATION for NoteRepository.kt');

      // Verify throwOnError: true throws InputError
      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          approval: approvalFile,
          deviations: [validDeviation]
        }),
        (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message)
      );
    });

    it('[ADV-BYPASS-02] approved visual deviation does NOT bypass unauthorized edit to root build.gradle.kts', () => {
      const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '\n// Permitted edit\n');

      const rootBuildGradle = path.join(candidateDir, 'build.gradle.kts');
      fs.appendFileSync(rootBuildGradle, '\n// Rogue root build alteration\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalFile,
        deviations: [validDeviation],
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.violations.some(v => v.path.includes('build.gradle.kts')));
    });

    it('[ADV-BYPASS-03] approved visual deviation does NOT bypass unauthorized file deletion', () => {
      // Delete NoteRepository.kt in candidate worktree
      const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.unlinkSync(repoFile);

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalFile,
        deviations: [validDeviation],
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.violations.some(v => v.path.includes('NoteRepository.kt')));
    });

    it('[ADV-BYPASS-04] rejects candidate attempting to modify protected owner approval file', () => {
      // If candidate attempts to add/overwrite approval file inside baseline or candidate
      const approvalInBaseline = path.join(baselineDir, '.ctc/approvals/hacked-approval.json');
      writeJson(approvalInBaseline, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.hacked',
        scopes: [{ subjectRef: 'element.editor_toolbar', statement: 'Approved 4px inset for DC1 thumb ergonomics.' }]
      });

      // Candidate tries to modify that file
      const hackedFileInCand = path.join(candidateDir, '.ctc/approvals/hacked-approval.json');
      fs.mkdirSync(path.dirname(hackedFileInCand), { recursive: true });
      fs.writeFileSync(hackedFileInCand, '// tampered content\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalInBaseline,
        deviations: [validDeviation],
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.violations.length >= 1);
    });
  });

  // =========================================================================
  // VECTOR 4: Corrupted or Tampered Agent Packet & Workspace Marker
  // =========================================================================
  describe('Vector 4: Corrupted or Tampered Agent Packet & Workspace Marker', () => {
    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'branch-packet-test',
        contract: contractPath
      });
    });

    it('[ADV-PKT-01] maliciously expanding allowedPaths in candidate agent-packet.json does NOT bypass authoritative contract', () => {
      const packetPath = path.join(candidateDir, 'agent-packet.json');
      assert.ok(fs.existsSync(packetPath));

      // Attacker reads agent-packet.json and adds data/ to allowedModificationPaths
      const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
      packet.targetScope.allowedModificationPaths.push('app/src/main/java/com/claude/noteapp/data');
      fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n', 'utf8');

      // Attacker now modifies NoteRepository.kt assuming they granted themselves permission
      const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.appendFileSync(repoFile, '\n// Attacker unauthorized modification\n');

      // Verifier must evaluate against authoritative contract, NOT local agent-packet.json
      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.violations.some(v => v.path.includes('NoteRepository.kt')));
    });

    it('[ADV-PKT-02] tampered .ctc-workspace.json with invalid baselineCommit fails closed', () => {
      const markerPath = path.join(candidateDir, MARKER);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      marker.baselineCommit = '0000000000000000000000000000000000000000';
      fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf8');

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          baselineCommit: marker.baselineCommit,
          contract
        }),
        (err) => err instanceof InputError && /does not contain the inspected baseline commit/i.test(err.message)
      );
    });

    it('[ADV-PKT-03] corrupted non-JSON .ctc-workspace.json fails closed', () => {
      const markerPath = path.join(candidateDir, MARKER);
      fs.writeFileSync(markerPath, '{ corrupted json: not valid ...', 'utf8');

      assert.throws(
        () => readWorkspace(candidateDir),
        (err) => err instanceof InputError && /workspace is not initialized/i.test(err.message)
      );
    });

    it('[ADV-PKT-04] corrupted agent-packet.json does not crash verifier and still enforces contract', () => {
      const packetPath = path.join(candidateDir, 'agent-packet.json');
      fs.writeFileSync(packetPath, 'CORRUPTED_RAW_BINARY_TRASH\x00\xFF', 'utf8');

      // Valid edit
      const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '\n// Valid edit despite corrupted packet\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });

      // Verification should succeed based on contract and git state
      assert.equal(res.status, 'PASS');
      assert.equal(res.code, 0);
    });
  });

  // =========================================================================
  // VECTOR 5: Rapid Worktree Lifecycle Stress
  // =========================================================================
  describe('Vector 5: Rapid Worktree Lifecycle Stress', () => {
    it('[ADV-CYCLE-01] performs 5 consecutive create-modify-verify-teardown cycles without leaks or errors', () => {
      for (let i = 1; i <= 5; i++) {
        const iterationBranch = `feature/stress-cycle-${i}`;
        const iterationCandidate = path.join(tempRoot, `candidate-stress-${i}`);

        // 1. Create worktree
        const created = createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: iterationCandidate,
          branch: iterationBranch,
          contract: contractPath
        });
        assert.equal(created.status, 'PASS');
        assert.ok(fs.existsSync(iterationCandidate));
        assert.ok(branchExists(baselineDir, iterationBranch));

        // 2. Apply valid edit
        const editorFile = path.join(iterationCandidate, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
        fs.appendFileSync(editorFile, `\n// Stress iteration ${i}\n`);

        // 3. Verify
        const verifyRes = verifyCandidateWorktree({
          candidate: iterationCandidate,
          baselineRoot: baselineDir,
          contract,
          throwOnError: false
        });
        assert.equal(verifyRes.status, 'PASS');
        assert.equal(verifyRes.code, 0);

        // 4. Teardown
        const teardown = removeAgentWorktree({
          android: baselineDir,
          output: iterationCandidate,
          branch: iterationBranch,
          deleteBranch: true,
          force: true
        });
        assert.equal(teardown.success, true);
        assert.equal(teardown.branchDeleted, true);
        assert.equal(fs.existsSync(iterationCandidate), false);
        assert.equal(branchExists(baselineDir, iterationBranch), false);

        // 5. Baseline remains pristine
        const meta = gitMetadata(baselineDir);
        assert.equal(meta.dirty, false, `Baseline must be clean after cycle ${i}`);
        assert.equal(meta.commit, baselineCommit);
      }
    });

    it('[ADV-CYCLE-02] supports multiple concurrent sibling worktrees with strict isolation', () => {
      const candidate1 = path.join(tempRoot, 'candidate-sibling-1');
      const candidate2 = path.join(tempRoot, 'candidate-sibling-2');
      const branch1 = 'feature/sibling-1';
      const branch2 = 'feature/sibling-2';

      try {
        // 1. Create both worktrees
        createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: candidate1,
          branch: branch1,
          contract: contractPath
        });

        createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: candidate2,
          branch: branch2,
          contract: contractPath
        });

        const registered = getRegisteredWorktrees(baselineDir);
        assert.ok(registered.includes(candidate1));
        assert.ok(registered.includes(candidate2));

        // 2. Modify candidate 1 only
        const editor1 = path.join(candidate1, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
        fs.appendFileSync(editor1, '\n// Modification in candidate 1\n');

        // 3. Verify candidate 2 is unaffected and clean
        const status2 = execFileSync('git', ['-C', candidate2, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
        assert.equal(status2, '', 'Candidate 2 must remain completely unaffected by edits in Candidate 1');

        // 4. Verify candidate 1 passes verification
        const v1 = verifyCandidateWorktree({
          candidate: candidate1,
          baselineRoot: baselineDir,
          contract,
          throwOnError: false
        });
        assert.equal(v1.status, 'PASS');
        assert.equal(v1.changedPaths.length, 1);

        // 5. Teardown candidate 1
        removeAgentWorktree({
          android: baselineDir,
          output: candidate1,
          branch: branch1,
          deleteBranch: true,
          force: true
        });

        // 6. Verify candidate 2 remains valid and registered
        assert.ok(fs.existsSync(candidate2));
        assert.ok(branchExists(baselineDir, branch2));
        const registeredAfter = getRegisteredWorktrees(baselineDir);
        assert.ok(!registeredAfter.includes(candidate1));
        assert.ok(registeredAfter.includes(candidate2));

      } finally {
        // Cleanup candidate 2
        try {
          removeAgentWorktree({
            android: baselineDir,
            output: candidate2,
            branch: branch2,
            deleteBranch: true,
            force: true
          });
        } catch (_) {}
      }
    });

    it('[ADV-CYCLE-03] duplicate branch name collision fails closed with InputError', () => {
      const branchName = 'feature/collision-branch';

      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: branchName,
        contract: contractPath
      });

      const secondCandidate = path.join(tempRoot, 'second-candidate');
      assert.throws(
        () => createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: secondCandidate,
          branch: branchName, // duplicate branch
          contract: contractPath
        }),
        (err) => err instanceof InputError && /already exists/i.test(err.message)
      );

      assert.equal(fs.existsSync(secondCandidate), false);
    });

    it('[ADV-CYCLE-04] non-empty output directory collision fails closed with InputError', () => {
      const occupiedDir = path.join(tempRoot, 'occupied-candidate');
      fs.mkdirSync(occupiedDir, { recursive: true });
      fs.writeFileSync(path.join(occupiedDir, 'existing_file.txt'), 'pre-existing\n');

      assert.throws(
        () => createAgentWorktree({
          android: baselineDir,
          workspace: workspaceDir,
          output: occupiedDir,
          branch: 'branch-occupied-test',
          contract: contractPath
        }),
        (err) => err instanceof InputError && /already exists and is not empty/i.test(err.message)
      );
    });
  });
});
