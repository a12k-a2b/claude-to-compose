/**
 * tests/e2e/worktree_scaffolder.test.js
 *
 * End-to-end integration test suite for Automated Worktree & Agent Context Scaffolder
 * (`ctc agent worktree`) verifying complete lifecycle, contract adaptation, dual packet
 * generation, downstream candidate verification, and boundary security.
 *
 * Requirement R2 / Features F07, F08, F09.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { dispatch } = require('../../src/cli/dispatcher');
const { verifyCandidateWorktree } = require('../../src/verification/candidate_verifier');
const { readWorkspace, gitEnvironment } = require('../../src/agent/safety');

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test User']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeBaselineProject(dir) {
  initCleanGitRepo(dir);
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const dataDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), 'package com.claude.noteapp.ui.editor\n// NoteEditorScreen\n');
  fs.writeFileSync(path.join(dataDir, 'NoteRepository.kt'), 'package com.claude.noteapp.data\n// NoteRepository\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// build\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// settings\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

describe('E2E Integration: Agent Worktree Scaffolder (tests/e2e/worktree_scaffolder.test.js)', () => {
  let tempRoot;
  let baselineDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-e2e-wt-')));
    baselineDir = path.join(tempRoot, 'baseline-app');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-worktree');

    const info = makeBaselineProject(baselineDir);
    baselineCommit = info.commit;

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, '.ctc-workspace.json'), JSON.stringify({
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: baselineDir
    }, null, 2));

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
    fs.writeFileSync(path.join(workspaceDir, 'retrofit-contract.json'), JSON.stringify(contract, null, 2));
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

  it('[E2E-WT-01] executes ctc agent worktree and scaffolds clean candidate worktree with dual packets', () => {
    const res = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/candidate-note-editor',
      '--output', candidateDir,
      '--json'
    ]);

    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);

    // Verify candidate workspace marker
    const marker = readWorkspace(candidateDir);
    assert.equal(marker.kind, 'ctc-workspace');
    assert.equal(marker.version, 1);
    assert.equal(marker.androidRoot, baselineDir);

    // Verify dual packet artifacts
    const packetJsonPath = path.join(candidateDir, 'agent-packet.json');
    const packetMdPath = path.join(candidateDir, 'AGENT_PACKET.md');
    assert.ok(fs.existsSync(packetJsonPath));
    assert.ok(fs.existsSync(packetMdPath));

    const packetJson = JSON.parse(fs.readFileSync(packetJsonPath, 'utf8'));
    assert.ok(Array.isArray(packetJson.targetScope.allowedModificationPaths));
    assert.ok(packetJson.targetScope.allowedModificationPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor'));

    const markdown = fs.readFileSync(packetMdPath, 'utf8');
    assert.ok(markdown.includes('app/src/main/java/com/claude/noteapp/ui/editor'));
    assert.ok(markdown.includes('./gradlew compileDebugKotlin --no-daemon'));
    assert.ok(markdown.includes('Anti-Tampering Directive'));

    // Downstream verification on clean candidate worktree
    const verifyResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract: JSON.parse(fs.readFileSync(path.join(workspaceDir, 'retrofit-contract.json'), 'utf8'))
    });
    assert.equal(verifyResult.status, 'PASS');
    assert.equal(verifyResult.violations.length, 0);
  });

  it('[E2E-WT-02] supports explicit --contract path override with custom boundaries', () => {
    const customContractPath = path.join(tempRoot, 'custom-contract.json');
    const customContract = {
      schemaVersion: '1.0.0',
      id: 'contract_custom_screen',
      screenId: 'custom_screen',
      implementationBoundary: {
        allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'],
        prohibitedChanges: ['Strictly forbidden data modification'],
        verificationCommands: ['./gradlew customVerifyTask']
      }
    };
    fs.writeFileSync(customContractPath, JSON.stringify(customContract, null, 2));

    const res = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/custom-override',
      '--output', candidateDir,
      '--contract', customContractPath,
      '--json'
    ]);

    assert.equal(res.status, 'PASS');
    assert.equal(res.exitCode, 0);

    const packet = JSON.parse(fs.readFileSync(path.join(candidateDir, 'agent-packet.json'), 'utf8'));
    assert.ok(packet.targetScope.allowedModificationPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'));
    assert.ok(packet.verification.verificationCommands.includes('./gradlew customVerifyTask'));
  });

  it('[E2E-WT-03] validates candidate .ctc-workspace.json metadata and provenance', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/provenance-check',
      '--output', candidateDir,
      '--json'
    ]);

    const marker = readWorkspace(candidateDir);
    assert.equal(marker.kind, 'ctc-workspace');
    assert.equal(marker.version, 1);
    assert.equal(marker.androidRoot, baselineDir);
    assert.equal(marker.candidateBranch, 'feature/provenance-check');
    assert.equal(marker.baselineCommit, baselineCommit);
  });

  it('[E2E-WT-04] prominently declares allowedPaths, commands, and anti-tampering in AGENT_PACKET.md (< 300 lines)', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/markdown-audit',
      '--output', candidateDir,
      '--json'
    ]);

    const mdPath = path.join(candidateDir, 'AGENT_PACKET.md');
    const md = fs.readFileSync(mdPath, 'utf8');
    const lines = md.split('\n');

    assert.ok(lines.length < 300, `AGENT_PACKET.md must be < 300 lines, was ${lines.length}`);
    assert.ok(md.includes('ALLOWED Modification Paths'));
    assert.ok(md.includes('FORBIDDEN Paths'));
    assert.ok(md.includes('Anti-Tampering Directive'));
    assert.ok(md.includes('3.0') && md.includes('drift'));
  });

  it('[E2E-WT-05] passes downstream candidate verification on clean scaffolded worktree', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/clean-verify',
      '--output', candidateDir,
      '--json'
    ]);

    const result = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract: JSON.parse(fs.readFileSync(path.join(workspaceDir, 'retrofit-contract.json'), 'utf8'))
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.violations.length, 0);
  });

  it('[E2E-WT-06] verifies boundary enforcement: allowed edit passes, out-of-boundary edit fails', () => {
    dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/boundary-test',
      '--output', candidateDir,
      '--json'
    ]);

    const contract = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'retrofit-contract.json'), 'utf8'));

    // 1. Allowed edit to NoteEditorScreen.kt
    const editorFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
    fs.appendFileSync(editorFile, '// Valid retrofit modification\n');

    const passResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract
    });
    assert.equal(passResult.status, 'PASS');
    assert.equal(passResult.violations.length, 0);

    // 2. Out-of-boundary edit to NoteRepository.kt
    const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
    fs.appendFileSync(repoFile, '// Unauthorized data modification\n');

    // With throwOnError: false, returns status: FAIL with violation
    const failResult = verifyCandidateWorktree({
      candidate: candidateDir,
      baselineRoot: baselineDir,
      contract,
      throwOnError: false
    });
    assert.equal(failResult.status, 'FAIL');
    assert.ok(failResult.violations.length > 0);
    assert.ok(failResult.violations.some(v => v.type === 'BOUNDARY_VIOLATION' && v.path.includes('NoteRepository.kt')));

    // With default throwOnError: true, throws InputError
    assert.throws(
      () => verifyCandidateWorktree({ candidate: candidateDir, baselineRoot: baselineDir, contract }),
      err => err instanceof Error && /outside the contract boundary/i.test(err.message)
    );
  });

  it('[E2E-WT-07] rejects dirty baseline repository with exit code 3 without creating orphan worktree', () => {
    // Dirty baseline
    fs.appendFileSync(path.join(baselineDir, 'README.md'), 'dirty uncommitted line\n');

    const res = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/dirty-baseline',
      '--output', candidateDir,
      '--json'
    ]);

    assert.equal(res.exitCode, 3);
    assert.equal(res.status, 'INPUT_INVALID');
    assert.equal(fs.existsSync(candidateDir), false, 'Candidate directory must not exist');
  });

  it('[E2E-WT-08] rejects containment breaches and collisions', () => {
    // 1. Inside android
    const insideOutput = path.join(baselineDir, 'nested-candidate');
    const resInside = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/inside',
      '--output', insideOutput,
      '--json'
    ]);
    assert.equal(resInside.exitCode, 3);
    assert.ok(/inside the Android repository/i.test(resInside.error || ''));

    // 2. Traversal
    const resTraversal = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/escape',
      '--output', `${candidateDir}/../../escaped`,
      '--json'
    ]);
    assert.equal(resTraversal.exitCode, 3);
    assert.ok(/traversal/i.test(resTraversal.error || ''));

    // 3. Collision with non-empty directory
    fs.mkdirSync(candidateDir, { recursive: true });
    fs.writeFileSync(path.join(candidateDir, 'blocker.txt'), 'blocked');
    const resCollision = dispatch([
      'agent', 'worktree',
      '--android', baselineDir,
      '--workspace', workspaceDir,
      '--branch', 'feature/collision',
      '--output', candidateDir,
      '--json'
    ]);
    assert.equal(resCollision.exitCode, 3);
    assert.ok(/not empty/i.test(resCollision.error || ''));
  });
});
