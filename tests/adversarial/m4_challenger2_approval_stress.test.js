/**
 * tests/adversarial/m4_challenger2_approval_stress.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 4 (Owner Approval & Intentional Deviation Contract):
 * Suite 1: Symlink attacks on owner approval files and directories (pointing outside workspace root)
 * Suite 2: Path traversal (.. components, URL encoded, backslash) in --approval and contract input paths
 * Suite 3: Hash tampering: declared SHA-256 vs modified file content
 * Suite 4: Unused approval bypass: attempt to load unused approvals without triggering assertAllApprovalsUsed
 * Suite 5: Evidence cross-wiring: attempt to cite approval ID in elementMappings.evidenceRefs
 * Suite 6: Candidate output overwrite collisions against protected approval files
 *
 * Executed by challenger_retrofit_m4_2.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const {
  verifyCandidateWorktree,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');

const {
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  evaluateDeviations,
  computeSha256
} = require('../../src/contract/owner_approval');

const { dispatch } = require('../../src/cli/dispatcher');

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

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger_m4_2@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Milestone 4 Challenger 2']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeBaselineProject(dir) {
  initCleanGitRepo(dir);
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const outsideDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), 'package com.claude.noteapp.ui.editor\n// Baseline\n');
  fs.writeFileSync(path.join(outsideDir, 'NoteRepository.kt'), 'package com.claude.noteapp.data\n// Baseline Data\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// Build\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// Settings\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

function createDescendantWorktree(baselineRoot, candidateRoot, branch = 'candidate-test-branch') {
  execFileSync('git', ['-C', baselineRoot, 'worktree', 'add', '-B', branch, candidateRoot, 'HEAD']);
}

describe('M4-Challenger-2: Adversarial Owner Approval & Verifier Stress Suite', () => {
  let tempRoot;
  let baselineDir;
  let candidateDir;
  let workspaceDir;
  let outsideDir;
  let baselineCommit;

  const validApprovalDoc = {
    schemaVersion: '1.0.0',
    kind: 'OwnerApproval',
    id: 'approval.dc1_tuning',
    scopes: [
      {
        subjectRef: 'element.toolbar',
        statement: 'Approve 8px bottom offset for DC1 thumb reach.'
      }
    ]
  };

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m4-adv-')));
    baselineDir = path.join(tempRoot, 'baseline');
    candidateDir = path.join(tempRoot, 'candidate');
    workspaceDir = path.join(tempRoot, 'workspace');
    outsideDir = path.join(tempRoot, 'outside_workspace');

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    const info = makeBaselineProject(baselineDir);
    baselineCommit = info.commit;
    createDescendantWorktree(baselineDir, candidateDir);
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
    } catch (_) {}
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // SUITE 1: Symlink Attacks on Approval Files and Directories
  // =========================================================================
  describe('Suite 1: Symlink Attacks on Owner Approval Files and Directories', () => {
    it('[ADV-SYM-01] loadOwnerApproval rejects symlink pointing outside workspace root', () => {
      const outsideFile = path.join(outsideDir, 'external-secret.json');
      writeJson(outsideFile, validApprovalDoc);

      const symlinkFile = path.join(workspaceDir, 'symlink-to-outside.json');
      fs.symlinkSync(outsideFile, symlinkFile);

      assert.throws(() => {
        loadOwnerApproval(symlinkFile, { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && (
        err.message.includes('non-symlink') ||
        err.message.includes('symbolic link') ||
        err.message.includes('outside workspace root') ||
        err.message.includes('escapes workspace root')
      ));
    });

    it('[ADV-SYM-02] loadOwnerApproval rejects symlink pointing inside workspace root', () => {
      const realFile = path.join(workspaceDir, 'real-approval.json');
      writeJson(realFile, validApprovalDoc);

      const internalSymlink = path.join(workspaceDir, 'internal-symlink.json');
      fs.symlinkSync(realFile, internalSymlink);

      assert.throws(() => {
        loadOwnerApproval(internalSymlink, { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && (
        err.message.includes('non-symlink') || err.message.includes('symbolic link')
      ));
    });

    it('[ADV-SYM-03] loadOwnerApprovals rejects when .ctc/approvals directory is a symlink pointing outside root', () => {
      const externalApprovalsDir = path.join(outsideDir, 'evil_approvals');
      fs.mkdirSync(externalApprovalsDir, { recursive: true });
      writeJson(path.join(externalApprovalsDir, 'evil.json'), validApprovalDoc);

      const ctcDir = path.join(baselineDir, '.ctc');
      fs.mkdirSync(ctcDir, { recursive: true });
      const symlinkApprovalsDir = path.join(ctcDir, 'approvals');
      fs.symlinkSync(externalApprovalsDir, symlinkApprovalsDir, 'dir');

      assert.throws(() => {
        loadOwnerApprovals(symlinkApprovalsDir, { root: baselineDir });
      }, (err) => err instanceof InputError && (
        err.message.includes('symbolic link') ||
        err.message.includes('outside workspace root') ||
        err.message.includes('escapes workspace root')
      ));
    });

    it('[ADV-SYM-04] loadOwnerApprovals rejects when a file inside .ctc/approvals is a symlink', () => {
      const approvalsDir = path.join(baselineDir, '.ctc', 'approvals');
      fs.mkdirSync(approvalsDir, { recursive: true });

      const targetFile = path.join(outsideDir, 'target.json');
      writeJson(targetFile, validApprovalDoc);

      const symlinkInApprovals = path.join(approvalsDir, 'target-symlink.json');
      fs.symlinkSync(targetFile, symlinkInApprovals);

      assert.throws(() => {
        loadOwnerApprovals(approvalsDir, { root: baselineDir });
      }, (err) => err instanceof InputError && (
        err.message.includes('symbolic link') ||
        err.message.includes('non-symlink') ||
        err.message.includes('escapes workspace root')
      ));
    });

    it('[ADV-SYM-05] loadOwnerApproval rejects path containing a symlink parent directory component', () => {
      const realSubdir = path.join(outsideDir, 'real_subdir');
      fs.mkdirSync(realSubdir, { recursive: true });
      const realFile = path.join(realSubdir, 'approval.json');
      writeJson(realFile, validApprovalDoc);

      const symlinkSubdir = path.join(workspaceDir, 'symlinked_dir');
      fs.symlinkSync(realSubdir, symlinkSubdir, 'dir');
      const traversedFile = path.join(symlinkSubdir, 'approval.json');

      assert.throws(() => {
        loadOwnerApproval(traversedFile, { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && (
        err.message.includes('symbolic link component') || err.message.includes('escapes workspace root')
      ));
    });

    it('[ADV-SYM-06] verifyCandidateWorktree rejects candidate when --approval points to a symlink file', () => {
      const targetFile = path.join(outsideDir, 'approval.json');
      writeJson(targetFile, validApprovalDoc);

      const symlinkFile = path.join(workspaceDir, 'approval-symlink.json');
      fs.symlinkSync(targetFile, symlinkFile);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          approval: symlinkFile,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && (
        err.message.includes('non-symlink') || err.message.includes('symbolic link')
      ));
    });

    it('[ADV-SYM-07] verifyCandidateWorktree rejects contract declared input whose path is a symlink', () => {
      const targetFile = path.join(outsideDir, 'approval.json');
      const hash = writeJson(targetFile, validApprovalDoc);

      const symlinkFile = path.join(baselineDir, 'input-symlink.json');
      fs.symlinkSync(targetFile, symlinkFile);
      execFileSync('git', ['-C', baselineDir, 'add', 'input-symlink.json']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add symlink to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: 'input-symlink.json', sha256: hash }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && (
        err.message.includes('symlink') ||
        err.message.includes('non-symlink') ||
        err.message.includes('escapes --root')
      ));
    });
  });

  // =========================================================================
  // SUITE 2: Path Traversal in --approval and Contract Input Paths
  // =========================================================================
  describe('Suite 2: Path Traversal in --approval and Contract Input Paths', () => {
    it('[ADV-TRAV-01] loadOwnerApproval rejects parent directory traversal (../outside.json)', () => {
      assert.throws(() => {
        loadOwnerApproval('../outside.json', { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-02] loadOwnerApproval rejects nested directory traversal (sub/../../outside.json)', () => {
      assert.throws(() => {
        loadOwnerApproval('sub/../../outside.json', { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-03] loadOwnerApproval rejects URL-encoded directory traversal (%2e%2e/outside.json)', () => {
      assert.throws(() => {
        loadOwnerApproval('%2e%2e/outside.json', { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-04] loadOwnerApproval rejects backslash directory traversal (..\\outside.json)', () => {
      assert.throws(() => {
        loadOwnerApproval('..\\outside.json', { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-05] loadOwnerApproval rejects traversal within an absolute path (/path/with/../traversal.json)', () => {
      assert.throws(() => {
        loadOwnerApproval('/tmp/foo/../bar.json', { workspaceRoot: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-06] verifyCandidateWorktree rejects --approval containing parent traversal', () => {
      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          approval: '../escaped-approval.json',
          throwOnError: true
        });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-07] verifyCandidateWorktree rejects contract input with parent traversal in path', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: '../outside.json', sha256: '0'.repeat(64) }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });

    it('[ADV-TRAV-08] verifyCandidateWorktree rejects contract input with absolute path escaping root', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: '/etc/passwd', sha256: '0'.repeat(64) }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && err.message.includes('must be relative to --root'));
    });
  });

  // =========================================================================
  // SUITE 3: Hash Tampering: Declared SHA-256 vs Modified Content
  // =========================================================================
  describe('Suite 3: Hash Tampering: Declared SHA-256 vs Modified Content', () => {
    it('[ADV-HASH-01] loadOwnerApproval throws InputError when file content does not match expectedSha256', () => {
      const file = path.join(workspaceDir, 'approval.json');
      writeJson(file, validApprovalDoc);

      const declaredHash = 'e'.repeat(64);
      assert.throws(() => {
        loadOwnerApproval(file, { workspaceRoot: workspaceDir, expectedSha256: declaredHash });
      }, (err) => err instanceof InputError && err.message.includes('hash mismatch'));
    });

    it('[ADV-HASH-02] loadOwnerApprovals throws InputError when contract.inputs declared hash differs by 1 byte', () => {
      const file = path.join(workspaceDir, 'approval.json');
      const actualHash = writeJson(file, validApprovalDoc);

      // Mutate 1 hex character
      const tamperedHash = actualHash.slice(0, -1) + (actualHash.slice(-1) === 'a' ? 'b' : 'a');

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: 'approval.json', sha256: tamperedHash }
        ]
      };

      assert.throws(() => {
        loadOwnerApprovals(workspaceDir, { root: workspaceDir, contract });
      }, (err) => err instanceof InputError && err.message.includes('hash mismatch'));
    });

    it('[ADV-HASH-03] loadOwnerApprovals throws InputError when approval has trailing whitespace appended after declaration', () => {
      const file = path.join(workspaceDir, 'approval.json');
      const originalText = JSON.stringify(validApprovalDoc, null, 2);
      const originalHash = sha256(originalText);
      fs.writeFileSync(file, originalText + ' \n'); // Append subtle whitespace

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: 'approval.json', sha256: originalHash }
        ]
      };

      assert.throws(() => {
        loadOwnerApprovals(workspaceDir, { root: workspaceDir, contract });
      }, (err) => err instanceof InputError && err.message.includes('hash mismatch'));
    });

    it('[ADV-HASH-04] verifyCandidateWorktree rejects candidate when contract declared approval hash is tampered', () => {
      const file = path.join(baselineDir, 'approval.json');
      writeJson(file, validApprovalDoc);
      execFileSync('git', ['-C', baselineDir, 'add', 'approval.json']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approval to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.dc1_tuning', kind: 'OWNER_APPROVAL', path: 'approval.json', sha256: 'f'.repeat(64) }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && err.message.includes('hash mismatch'));
    });

    it('[ADV-HASH-05] loadOwnerApprovals rejects duplicate approval IDs with conflicting content', () => {
      const file1 = path.join(workspaceDir, 'approval1.json');
      const file2 = path.join(workspaceDir, 'approval2.json');

      writeJson(file1, { ...validApprovalDoc, scopes: [{ subjectRef: 's1', statement: 'Statement 1' }] });
      writeJson(file2, { ...validApprovalDoc, scopes: [{ subjectRef: 's1', statement: 'Statement 2 different' }] });

      assert.throws(() => {
        loadOwnerApprovals([file1, file2], { root: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('duplicate owner approval id with conflicting content'));
    });
  });

  // =========================================================================
  // SUITE 4: Unused Approval Bypass & assertAllApprovalsUsed
  // =========================================================================
  describe('Suite 4: Unused Approval Bypass & assertAllApprovalsUsed', () => {
    it('[ADV-UNUSED-01] assertAllApprovalsUsed throws InputError when loaded approval is omitted from usedSet', () => {
      const approvalsMap = new Map([
        ['app.used', { id: 'app.used' }],
        ['app.unused', { id: 'app.unused' }]
      ]);
      const usedSet = new Set(['app.used']);

      assert.throws(() => {
        assertAllApprovalsUsed(approvalsMap, usedSet);
      }, (err) => err instanceof InputError && err.message.includes('unused owner approval input: app.unused'));
    });

    it('[ADV-UNUSED-02] evaluateDeviations returns status FAIL and defect when loaded approval is not cited', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc, path: approvalFile }]
      ]);

      const contract = {
        schemaVersion: '1.0.0',
        elementMappings: [],
        actionBindings: [],
        preservationObligations: [],
        capabilities: []
      };

      const res = evaluateDeviations(contract, approvalsMap, { throwOnError: false });
      assert.equal(res.status, 'FAIL');
      assert.equal(res.exitCode, 1);
      assert.ok(res.unusedApprovals.includes('approval.dc1_tuning'));
    });

    it('[ADV-UNUSED-03] verifyCandidateWorktree returns status FAIL (code 1) when CLI passes unused --approval', () => {
      const approvalFile = path.join(workspaceDir, 'unused-approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        elementMappings: [],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        approval: approvalFile,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.deviations.some(d => d.message && d.message.includes('unused owner approval input')));
    });

    it('[ADV-UNUSED-04] verifyCandidateWorktree returns status FAIL when workspace has auto-discovered unused approval in .ctc/approvals/', () => {
      const approvalsDir = path.join(baselineDir, '.ctc', 'approvals');
      fs.mkdirSync(approvalsDir, { recursive: true });
      writeJson(path.join(approvalsDir, 'discovered-approval.json'), validApprovalDoc);
      execFileSync('git', ['-C', baselineDir, 'add', '.']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approvals to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        elementMappings: [],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.deviations.some(d => d.message && d.message.includes('unused owner approval input')));
    });

    it('[ADV-UNUSED-05] approval citation with mismatched subjectRef fails matching and does not mark approval as used', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const candidateDeviations = [
        {
          type: 'VISUAL_DEVIATION',
          subjectRef: 'element.different_subject', // Mismatched subjectRef!
          statement: 'Approve 8px bottom offset for DC1 thumb reach.',
          ownerApprovalRef: 'approval.dc1_tuning'
        }
      ];

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        approval: approvalFile,
        deviations: candidateDeviations,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.deviations.some(d => d.message.includes('unused owner approval input') || d.message.includes('does not cover exact subject')));
    });

    it('[ADV-UNUSED-06] approval citation with single-character statement mismatch fails matching and marks approval as unused', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const candidateDeviations = [
        {
          type: 'VISUAL_DEVIATION',
          subjectRef: 'element.toolbar',
          statement: 'Approve 8px bottom offset for DC1 thumb reach', // missing trailing period
          ownerApprovalRef: 'approval.dc1_tuning'
        }
      ];

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        approval: approvalFile,
        deviations: candidateDeviations,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
    });
  });

  // =========================================================================
  // SUITE 5: Evidence Cross-Wiring Rejection
  // =========================================================================
  describe('Suite 5: Evidence Cross-Wiring Rejection', () => {
    it('[ADV-CROSS-01] assertNoEvidenceCrossWiring throws InputError when approval ID is cited in elementMappings.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        elementMappings: [
          { id: 'elem.1', evidenceRefs: ['approval.dc1_tuning'] }
        ]
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc }]
      ]);

      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval approval.dc1_tuning as evidence'));
    });

    it('[ADV-CROSS-02] assertNoEvidenceCrossWiring throws InputError when approval ID is cited in elementMappings.sourceEvidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        elementMappings: [
          { id: 'elem.2', sourceEvidenceRefs: ['approval.dc1_tuning'] }
        ]
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc }]
      ]);

      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval approval.dc1_tuning as evidence'));
    });

    it('[ADV-CROSS-03] assertNoEvidenceCrossWiring throws InputError when approval ID is cited in actionBindings.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        actionBindings: [
          { id: 'action.save', evidenceRefs: ['approval.dc1_tuning'] }
        ]
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc }]
      ]);

      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval approval.dc1_tuning as evidence'));
    });

    it('[ADV-CROSS-04] assertNoEvidenceCrossWiring throws InputError when approval ID is cited in preservationObligations.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        preservationObligations: [
          { id: 'obl.backstack', evidenceRefs: ['approval.dc1_tuning'] }
        ]
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc }]
      ]);

      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval approval.dc1_tuning as evidence'));
    });

    it('[ADV-CROSS-05] assertNoEvidenceCrossWiring throws InputError when approval ID is cited in acceptanceMatrix.requirements.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        acceptanceMatrix: {
          requirements: [
            { id: 'req.1', evidenceRefs: ['approval.dc1_tuning'] }
          ]
        }
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc }]
      ]);

      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval approval.dc1_tuning as evidence'));
    });

    it('[ADV-CROSS-06] evaluateContractDeviations throws InputError on cross-wired approval reference in contract', () => {
      const contract = {
        schemaVersion: '1.0.0',
        elementMappings: [
          {
            id: 'elem.toolbar',
            mappingStatus: 'OWNER_APPROVED_NEW_SURFACE',
            ownerApprovalRef: 'approval.dc1_tuning',
            ownerApprovalStatement: 'Approve 8px bottom offset for DC1 thumb reach.',
            evidenceRefs: ['approval.dc1_tuning'] // Cross-wired!
          }
        ]
      };
      const approvalsMap = new Map([
        ['approval.dc1_tuning', { value: validApprovalDoc, path: 'approval.json' }]
      ]);

      assert.throws(() => {
        evaluateContractDeviations(contract, approvalsMap, { throwOnError: true });
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });

    it('[ADV-CROSS-07] verifyCandidateWorktree rejects candidate worktree when contract contains cross-wired evidenceRefs', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        elementMappings: [
          {
            id: 'element.toolbar',
            mappingStatus: 'OWNER_APPROVED_NEW_SURFACE',
            ownerApprovalRef: 'approval.dc1_tuning',
            ownerApprovalStatement: 'Approve 8px bottom offset for DC1 thumb reach.',
            evidenceRefs: ['approval.dc1_tuning'] // Cross-wired!
          }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'] }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          approval: approvalFile,
          contract,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });
  });

  // =========================================================================
  // SUITE 6: Candidate Output Overwrite Collisions Against Protected Approvals
  // =========================================================================
  describe('Suite 6: Candidate Output Overwrite Collisions Against Protected Approval Files', () => {
    it('[ADV-COLL-01] CLI verify command throws InputError when --output targets an existing protected approval file', () => {
      const approvalFile = path.join(workspaceDir, 'protected-approval.json');
      writeJson(approvalFile, validApprovalDoc);

      const res = dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--output', approvalFile, // Target output is an existing file!
        '--json'
      ]);

      assert.notEqual(res.exitCode, 0);
      assert.ok(res.output.includes('collides with an existing protected file') || res.output.includes('InputError'));
    });

    it('[ADV-COLL-02] CLI contract build command rejects --output targeting an existing approval file', () => {
      const approvalFile = path.join(workspaceDir, 'protected-approval.json');
      const originalText = JSON.stringify(validApprovalDoc, null, 2) + '\n';
      fs.writeFileSync(approvalFile, originalText);

      const res = dispatch([
        'contract', 'build', 'note_editor',
        '--workspace', workspaceDir,
        '--output', approvalFile,
        '--json'
      ]);

      assert.notEqual(res.exitCode, 0);
      assert.equal(fs.readFileSync(approvalFile, 'utf8'), originalText, 'Approval file must remain uncorrupted');
    });

    it('[ADV-COLL-03] verifyCandidateWorktree throws InputError when candidate modified a protected approval file in baseline', () => {
      const approvalFile = path.join(baselineDir, 'approval.json');
      writeJson(approvalFile, validApprovalDoc);
      execFileSync('git', ['-C', baselineDir, 'add', 'approval.json']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approval to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      // Candidate maliciously edits the approval file inside candidate worktree
      const candidateApprovalFile = path.join(candidateDir, 'approval.json');
      fs.writeFileSync(candidateApprovalFile, JSON.stringify({ ...validApprovalDoc, id: 'tampered' }));

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          approval: approvalFile,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && (
        err.message.includes('candidate cannot modify protected approval file') ||
        err.message.includes('outside the contract boundary')
      ));
    });

    it('[ADV-COLL-04] verifyCandidateWorktree throws InputError when candidate modifies an auto-discovered approval in .ctc/approvals/', () => {
      const baselineApprovalsDir = path.join(baselineDir, '.ctc', 'approvals');
      fs.mkdirSync(baselineApprovalsDir, { recursive: true });
      const approvalPath = path.join(baselineApprovalsDir, 'approval.json');
      writeJson(approvalPath, validApprovalDoc);
      execFileSync('git', ['-C', baselineDir, 'add', '.']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approvals to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      // In candidate worktree, candidate modifies .ctc/approvals/approval.json
      const candApprovalsDir = path.join(candidateDir, '.ctc', 'approvals');
      fs.writeFileSync(path.join(candApprovalsDir, 'approval.json'), '{"malicious": true}');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          throwOnError: true
        });
      }, (err) => err instanceof InputError && (
        err.message.includes('candidate cannot modify protected approval file') ||
        err.message.includes('outside the contract boundary')
      ));
    });

    it('[ADV-COLL-05] verifyCandidateWorktree rejects candidate worktree that replaces approval with a symlink', () => {
      const approvalFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/ui/editor/approval.json');
      writeJson(approvalFile, validApprovalDoc);
      execFileSync('git', ['-C', baselineDir, 'add', '.']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approval to baseline']);
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
      createDescendantWorktree(baselineDir, candidateDir);

      // Candidate replaces it with a symlink pointing to an external file
      const candidateApproval = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/approval.json');
      try { fs.unlinkSync(candidateApproval); } catch (_) {}
      const evilTarget = path.join(outsideDir, 'evil.json');
      writeJson(evilTarget, validApprovalDoc);
      fs.symlinkSync(evilTarget, candidateApproval);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          approval: approvalFile,
          throwOnError: true
        });
      }, (err) => err instanceof InputError);
    });
  });
});
