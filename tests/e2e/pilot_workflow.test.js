/**
 * tests/e2e/pilot_workflow.test.js
 *
 * End-to-End Integration Test Suite for Coding-Agent Pilot Workflow
 * Simulates complete external coding agent lifecycle on fixtures/note-app:
 * 1. Initial State: Baseline repository initialized from fixtures/note-app with clean git status.
 * 2. Scaffolding: Invoke `ctc agent worktree` with contract and options; verify worktree, branch, agent packet, and harness files created.
 * 3. Boundary Confinement: Simulate agent edits within allowedPaths (updating NoteEditorScreen composable).
 * 4. Boundary Violation Rejection: Simulate agent attempting to touch an unapproved file outside allowedPaths, verify rejection with code 1.
 * 5. Intentional Deviation Verification: Declare an intentional deviation, verify failure without approval, then pass with valid --approval file.
 * 6. Git Isolation Verification: Verify baseline repository remains completely untouched and clean.
 * 7. Worktree Removal and Cleanup: Verify git worktree removal and branch deletion.
 *
 * Requirement R5 / Feature F17.
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
 * Initializes a clean Git baseline repository by copying sources from fixtures/note-app,
 * excluding transient build/caches to keep test execution fast and deterministic.
 */
function initCleanBaselineFromFixture(baselineDir) {
  const fixtureSrc = path.resolve(__dirname, '../../fixtures/note-app');
  assert.ok(fs.existsSync(fixtureSrc), `Fixture note-app directory must exist at ${fixtureSrc}`);

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
  execFileSync('git', ['-C', baselineDir, 'config', 'user.email', 'pilot-agent@example.com']);
  execFileSync('git', ['-C', baselineDir, 'config', 'user.name', 'Pilot Agent']);
  execFileSync('git', ['-C', baselineDir, 'config', 'commit.gpgsign', 'false']);

  // Standard Android gitignore for transient files
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

describe('E2E Pilot Workflow: Coding Agent Retrofit on fixtures/note-app (Feature F17)', () => {
  let tempRoot;
  let baselineDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;
  let baselineBranch;
  let contractPath;
  let contract;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-pilot-wf-')));
    baselineDir = path.join(tempRoot, 'note-app');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-worktree');

    // 1. Initialize clean baseline repository from fixtures/note-app
    const initInfo = initCleanBaselineFromFixture(baselineDir);
    baselineCommit = initInfo.commit;
    baselineBranch = initInfo.branch;

    // 2. Initialize CTC workspace
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeJson(path.join(workspaceDir, '.ctc-workspace.json'), {
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: baselineDir
    });

    // 3. Define authoritative retrofit contract for note_editor screen
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
          'DO NOT alter NoteEditorViewModel StateFlow emissions or debounce timing',
          'DO NOT remove or alter test tags',
          'DO NOT introduce EPD screen flash hooks on LivePaper panel'
        ],
        verificationCommands: [
          './gradlew compileDebugKotlin --no-daemon',
          './gradlew testDebugUnitTest --no-daemon',
          'node bin/ctc.js verify note_editor --candidate .'
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
  // SCENARIO 1: Initial Baseline State Verification
  // =========================================================================
  it('[PILOT-01] initializes baseline repository from fixtures/note-app with clean git status and valid Compose sources', () => {
    // Verify git status is completely clean
    const status = execFileSync('git', ['-C', baselineDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    assert.equal(status, '', 'Baseline working tree must be clean');

    const meta = gitMetadata(baselineDir);
    assert.equal(meta.dirty, false, 'Baseline gitMetadata dirty flag must be false');
    assert.equal(meta.commit, baselineCommit, 'Baseline commit must match initial commit');
    assert.match(meta.commit, /^[a-f0-9]{40}$/, 'Commit must be full 40-character SHA');

    // Verify key note-app Compose files exist in baseline
    const editorScreen = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    const editorViewModel = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/presentation/editor/NoteEditorViewModel.kt');
    const noteRepo = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
    const buildGradle = path.join(baselineDir, 'app/build.gradle.kts');
    const manifest = path.join(baselineDir, 'app/src/main/AndroidManifest.xml');

    assert.ok(fs.existsSync(editorScreen), 'NoteEditorScreen.kt must exist');
    assert.ok(fs.existsSync(editorViewModel), 'NoteEditorViewModel.kt must exist');
    assert.ok(fs.existsSync(noteRepo), 'NoteRepository.kt must exist');
    assert.ok(fs.existsSync(buildGradle), 'app/build.gradle.kts must exist');
    assert.ok(fs.existsSync(manifest), 'AndroidManifest.xml must exist');

    const editorContent = fs.readFileSync(editorScreen, 'utf8');
    assert.ok(editorContent.includes('NoteEditorScreen'), 'NoteEditorScreen.kt content must be intact');
  });

  // =========================================================================
  // SCENARIO 2: Automated Scaffolding & Agent Context Provisioning
  // =========================================================================
  it('[PILOT-02] scaffolds descendant candidate worktree, git branch, dual implementation packets, and agent harnesses', () => {
    const candidateBranch = 'feature/pilot-note-editor';

    const res = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', candidateBranch,
      '--output', candidateDir,
      '--contract', contractPath,
      '--screen', 'note_editor',
      '--json'
    ]);

    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);

    // 1. Worktree and branch verification
    assert.ok(fs.existsSync(candidateDir), 'Candidate worktree directory must exist');
    const currentBranch = execFileSync('git', ['-C', candidateDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
    assert.equal(currentBranch, candidateBranch, 'Candidate worktree must be checked out on candidate branch');

    const commonDirCandidate = gitCommonDirectory(candidateDir);
    const commonDirBaseline = gitCommonDirectory(baselineDir);
    assert.equal(commonDirCandidate, commonDirBaseline, 'Candidate must share git common directory with baseline');

    // 2. Candidate workspace marker
    const marker = readWorkspace(candidateDir);
    assert.equal(marker.kind, 'ctc-workspace');
    assert.equal(marker.version, 1);
    assert.equal(marker.androidRoot, baselineDir);
    assert.equal(marker.baselineCommit, baselineCommit);
    assert.equal(marker.candidateBranch, candidateBranch);

    // 3. Dual agent packets
    const packetJsonPath = path.join(candidateDir, 'agent-packet.json');
    const packetMdPath = path.join(candidateDir, 'AGENT_PACKET.md');
    assert.ok(fs.existsSync(packetJsonPath), 'agent-packet.json must be generated');
    assert.ok(fs.existsSync(packetMdPath), 'AGENT_PACKET.md must be generated');

    const packetJson = JSON.parse(fs.readFileSync(packetJsonPath, 'utf8'));
    assert.ok(Array.isArray(packetJson.targetScope.allowedModificationPaths));
    assert.ok(packetJson.targetScope.allowedModificationPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor'));

    const mdContent = fs.readFileSync(packetMdPath, 'utf8');
    assert.ok(mdContent.split('\n').length < 300, 'AGENT_PACKET.md must be concise (< 300 lines)');
    assert.ok(mdContent.includes('ALLOWED Modification Paths'));
    assert.ok(mdContent.includes('FORBIDDEN Paths'));
    assert.ok(mdContent.includes('Anti-Tampering Directive'));

    // 4. Coding agent harnesses
    const cursorRules = path.join(candidateDir, '.cursorrules');
    const claudeMd = path.join(candidateDir, 'CLAUDE.md');
    assert.ok(fs.existsSync(cursorRules), '.cursorrules must be scaffolded');
    assert.ok(fs.existsSync(claudeMd), 'CLAUDE.md must be scaffolded');

    // 5. Anti-tampering git exclusion verification
    // Metadata and harness files must be ignored so candidate git status starts clean
    const candidateGitStatus = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    assert.equal(candidateGitStatus, '', 'Candidate worktree git status must start clean with harness files excluded');
  });

  // =========================================================================
  // SCENARIO 3: Boundary Confinement (Allowed Edits Within Scope)
  // =========================================================================
  it('[PILOT-03] permits modifications strictly confined within contract allowedPaths and passes candidate verification', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/confined-edit',
      '--output', candidateDir,
      '--contract', contractPath,
      '--json'
    ]);

    // Simulate coding agent modifying NoteEditorScreen composable
    const targetFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    const originalCode = fs.readFileSync(targetFile, 'utf8');

    // Inject Sol:OS LivePaper styling comment / composable modification
    const modifiedCode = originalCode + '\n// Sol:OS LivePaper 8-bit grayscale retrofit applied by pilot agent\n';
    fs.writeFileSync(targetFile, modifiedCode, 'utf8');

    // Verify candidate worktree
    const verifyResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      throwOnError: false
    });

    assert.equal(verifyResult.status, 'PASS');
    assert.equal(verifyResult.code, 0);
    assert.equal(verifyResult.valid, true);
    assert.deepEqual(verifyResult.changedPaths, [
      'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'
    ]);
    assert.equal(verifyResult.violations.length, 0);

    // Commit changes and verify committed state also passes
    execFileSync('git', ['-C', candidateDir, 'add', '.']);
    execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'feat(editor): apply Sol:OS styling']);

    const verifyCommitted = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      throwOnError: false
    });
    assert.equal(verifyCommitted.status, 'PASS');
    assert.equal(verifyCommitted.code, 0);
  });

  // =========================================================================
  // SCENARIO 4: Boundary Violation Rejection (Unauthorized Edits)
  // =========================================================================
  it('[PILOT-04] detects and rejects agent modifications outside allowedPaths with exit code 1', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/boundary-violation',
      '--output', candidateDir,
      '--contract', contractPath,
      '--json'
    ]);

    // 1. Valid modification to NoteEditorScreen
    const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    fs.appendFileSync(editorFile, '\n// Permitted UI modification\n');

    // 2. Prohibited out-of-boundary modification to NoteRepository in data/
    const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
    fs.appendFileSync(repoFile, '\n// Rogue modification to persistence layer\n');

    // verifyCandidateWorktree with throwOnError: false returns FAIL
    const failResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      throwOnError: false
    });

    assert.equal(failResult.status, 'FAIL');
    assert.equal(failResult.code, 1);
    assert.equal(failResult.valid, false);
    assert.ok(failResult.violations.length >= 1);

    const boundaryViolation = failResult.violations.find(v =>
      v.type === 'BOUNDARY_VIOLATION' && v.path.includes('NoteRepository.kt')
    );
    assert.ok(boundaryViolation, 'Must record BOUNDARY_VIOLATION for NoteRepository.kt');
    assert.ok(boundaryViolation.message.includes('outside the contract boundary'));

    // verifyCandidateWorktree with throwOnError: true throws InputError
    assert.throws(
      () => verifyCandidateWorktree({ candidate: candidateDir, baselineRoot: baselineDir, contract }),
      (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message)
    );

    // Revert rogue modification and verify recovery
    execFileSync('git', ['-C', candidateDir, 'checkout', '--', 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt']);
    const recoveredResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      throwOnError: false
    });
    assert.equal(recoveredResult.status, 'PASS');
    assert.equal(recoveredResult.code, 0);
  });

  // =========================================================================
  // SCENARIO 5: Intentional Deviation Lifecycle (Unapproved -> Approved)
  // =========================================================================
  it('[PILOT-05] enforces fail-closed gate on visual/behavioral deviations: unapproved fails, valid Draft 2020-12 OwnerApproval passes', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/intentional-deviation',
      '--output', candidateDir,
      '--contract', contractPath,
      '--json'
    ]);

    // 1. Declare intentional visual deviation on DC1 toolbar without approval
    const deviations = [
      {
        type: 'VISUAL_DEVIATION',
        subjectRef: 'element.editor_toolbar',
        statement: 'Approve 4px vertical inset for DC1 LivePaper toolbar thumb ergonomics.'
      }
    ];

    // Verification must fail with code 1
    const unapprovedRes = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      deviations,
      throwOnError: false
    });

    assert.equal(unapprovedRes.status, 'FAIL');
    assert.equal(unapprovedRes.code, 1);
    assert.ok(unapprovedRes.deviations && unapprovedRes.deviations.length >= 1);
    assert.ok(unapprovedRes.deviations.some(d => d.subjectRef === 'element.editor_toolbar'));

    // 2. Author valid Draft 2020-12 OwnerApproval document
    const approvalFilePath = path.join(workspaceDir, 'approved-toolbar-deviation.json');
    writeJson(approvalFilePath, {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.dc1_toolbar_inset',
      scopes: [
        {
          subjectRef: 'element.editor_toolbar',
          statement: 'Approve 4px vertical inset for DC1 LivePaper toolbar thumb ergonomics.'
        }
      ]
    });

    // 3. Link approval to deviation
    deviations[0].ownerApprovalRef = 'approval.dc1_toolbar_inset';

    // Verification must now pass with code 0
    const approvedRes = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      approval: approvalFilePath,
      deviations,
      throwOnError: false
    });

    assert.equal(approvedRes.status, 'PASS');
    assert.equal(approvedRes.code, 0);
    assert.equal(approvedRes.valid, true);
    assert.ok(approvedRes.approvedDeviations && approvedRes.approvedDeviations.length === 1);
    assert.equal(approvedRes.approvedDeviations[0].approvalRef, 'approval.dc1_toolbar_inset');

    // 4. Negative test: statement discrepancy (missing period) must cause rejection
    deviations[0].statement = 'Approve 4px vertical inset for DC1 LivePaper toolbar thumb ergonomics'; // omitted period
    assert.throws(
      () => verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalFilePath,
        deviations
      }),
      (err) => err instanceof InputError && /(unused owner approval input|does not cover exact subject\/statement)/i.test(err.message)
    );

    // Also test with throwOnError: false
    const mismatchRes = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      approval: approvalFilePath,
      deviations,
      throwOnError: false
    });
    assert.equal(mismatchRes.status, 'FAIL');
    assert.equal(mismatchRes.code, 1);
  });

  // =========================================================================
  // SCENARIO 6: Baseline Git Isolation & Immutability
  // =========================================================================
  it('[PILOT-06] guarantees baseline repository remains completely untouched, clean, and at original commit', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/isolation-check',
      '--output', candidateDir,
      '--contract', contractPath,
      '--json'
    ]);

    // Perform extensive modifications and commits in candidate worktree
    const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    fs.appendFileSync(editorFile, '\n// Candidate modification 1\n');
    execFileSync('git', ['-C', candidateDir, 'add', '.']);
    execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'candidate commit 1']);

    fs.appendFileSync(editorFile, '\n// Candidate modification 2\n');
    execFileSync('git', ['-C', candidateDir, 'add', '.']);
    execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'candidate commit 2']);

    // Assert baseline repository state is strictly pristine
    const baselineStatus = execFileSync('git', ['-C', baselineDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    assert.equal(baselineStatus, '', 'Baseline working tree must have 0 untracked or modified files');

    const currentBaselineCommit = execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.equal(currentBaselineCommit, baselineCommit, 'Baseline commit must remain identical to initial commit');

    const baselineBranchCurrent = execFileSync('git', ['-C', baselineDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
    assert.equal(baselineBranchCurrent, baselineBranch, 'Baseline branch must not switch to candidate branch');

    // Baseline NoteEditorScreen must not contain candidate modifications
    const baselineEditorFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    const baselineContent = fs.readFileSync(baselineEditorFile, 'utf8');
    assert.ok(!baselineContent.includes('Candidate modification 1'), 'Baseline file must be completely untouched');
    assert.ok(!baselineContent.includes('Candidate modification 2'), 'Baseline file must be completely untouched');
  });

  // =========================================================================
  // SCENARIO 7: Worktree Removal & Teardown
  // =========================================================================
  it('[PILOT-07] executes safe candidate worktree removal, branch deletion, and metadata pruning', () => {
    const candidateBranch = 'feature/cleanup-cycle';

    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', candidateBranch,
      '--output', candidateDir,
      '--contract', contractPath,
      '--json'
    ]);

    assert.ok(fs.existsSync(candidateDir));
    assert.ok(branchExists(baselineDir, candidateBranch));
    assert.ok(getRegisteredWorktrees(baselineDir).includes(candidateDir));

    // Execute worktree removal
    const removalResult = removeAgentWorktree({
      android: baselineDir,
      output: candidateDir,
      branch: candidateBranch,
      deleteBranch: true,
      force: true
    });

    assert.equal(removalResult.success, true);
    assert.equal(removalResult.branchDeleted, true);
    assert.equal(removalResult.removedPath, candidateDir);

    // Verify candidate directory removed from disk
    assert.equal(fs.existsSync(candidateDir), false, 'Candidate worktree directory must be removed from disk');

    // Verify worktree unregistered from Git
    const registered = getRegisteredWorktrees(baselineDir);
    assert.equal(registered.includes(candidateDir), false, 'Worktree must be unregistered from git worktree list');

    // Verify branch deleted
    assert.equal(branchExists(baselineDir, candidateBranch), false, 'Candidate branch must be deleted');

    // Baseline remains clean
    const baselineStatus = execFileSync('git', ['-C', baselineDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    assert.equal(baselineStatus, '');
  });

  // =========================================================================
  // SCENARIO 8: Complete End-to-End Pilot Workflow Roundtrip
  // =========================================================================
  it('[PILOT-08] executes complete end-to-end coding agent pilot workflow from clean baseline to verified retrofit and cleanup', () => {
    const candidateBranch = 'feature/e2e-pilot-roundtrip';

    // Step 1: Baseline inspection confirms clean ready state
    const meta = gitMetadata(baselineDir);
    assert.equal(meta.dirty, false);

    // Step 2: Scaffolding via ctc agent worktree
    const scaffoldRes = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', candidateBranch,
      '--output', candidateDir,
      '--contract', contractPath,
      '--screen', 'note_editor',
      '--json'
    ]);
    assert.equal(scaffoldRes.status, 'PASS');
    assert.equal(scaffoldRes.exitCode, 0);

    // Step 3: Initial candidate verification is clean PASS
    const initialVerify = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract
    });
    assert.equal(initialVerify.status, 'PASS');
    assert.equal(initialVerify.violations.length, 0);

    // Step 4: Agent reads AGENT_PACKET.md and applies valid Composable edit
    const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    fs.appendFileSync(editorFile, '\n// E2E Retrofit: Sol:OS high-contrast LivePaper typography\n');

    const editVerify = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract
    });
    assert.equal(editVerify.status, 'PASS');
    assert.equal(editVerify.changedPaths.length, 1);

    // Step 5: Agent introduces intentional deviation with valid Draft 2020-12 OwnerApproval
    const approvalFile = path.join(workspaceDir, 'e2e-owner-approval.json');
    writeJson(approvalFile, {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.e2e_pilot_deviation',
      scopes: [
        {
          subjectRef: 'element.editor_note_card',
          statement: 'Approve 2px elevation reduction on LivePaper transflective panel.'
        }
      ]
    });

    const candidateDeviations = [
      {
        type: 'VISUAL_DEVIATION',
        subjectRef: 'element.editor_note_card',
        statement: 'Approve 2px elevation reduction on LivePaper transflective panel.',
        ownerApprovalRef: 'approval.e2e_pilot_deviation'
      }
    ];

    const approvedVerify = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      approval: approvalFile,
      deviations: candidateDeviations,
      throwOnError: false
    });
    assert.equal(approvedVerify.status, 'PASS');
    assert.equal(approvedVerify.code, 0);
    assert.equal(approvedVerify.approvedDeviations.length, 1);

    // Step 6: Commit retrofit on candidate branch
    execFileSync('git', ['-C', candidateDir, 'add', '.']);
    execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'feat(editor): verified retrofit complete']);

    // Step 7: Verify baseline remains completely pristine
    const baselineStatus = execFileSync('git', ['-C', baselineDir, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
    assert.equal(baselineStatus, '');
    const baselineCommitAfter = execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert.equal(baselineCommitAfter, baselineCommit);

    // Step 8: Teardown candidate worktree and clean branch
    const teardown = removeAgentWorktree({
      android: baselineDir,
      output: candidateDir,
      branch: candidateBranch,
      deleteBranch: true,
      force: true
    });
    assert.equal(teardown.success, true);
    assert.equal(teardown.branchDeleted, true);
    assert.equal(fs.existsSync(candidateDir), false);
  });
});
