/**
 * tests/adversarial/candidate_worktree_adversarial.test.js
 *
 * Adversarial Negative Tests: Candidate Git Worktree Isolation & Evidence Receipts.
 * Requirement R1 & R6 (Milestone 1).
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
  rootFile,
  validateReceiptData,
  validateSummaryCounts,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');
const { dispatch } = require('../../src/cli/dispatcher');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test User']);
}

function makeBaselineNoteApp(dir) {
  initCleanGitRepo(dir);
  const editorDir = path.join(dir, 'app/src/main/java/fixture/app/ui');
  const dataDir = path.join(dir, 'app/src/main/java/fixture/app/outside');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), 'package fixture.app.ui\n// editor\n');
  fs.writeFileSync(path.join(dataDir, 'NoteRepository.kt'), 'package fixture.app.outside\n// data\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// build\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// settings\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline note-app']);
  const baselineCommit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { baselineCommit };
}

function createDescendantWorktree(baselineRoot, candidateRoot, branch = 'candidate-test') {
  execFileSync('git', ['-C', baselineRoot, 'worktree', 'add', '-b', branch, candidateRoot, 'HEAD']);
}

describe('Adversarial Negative Tests: Candidate Git Worktree & Evidence Receipts', () => {
  let tempRoot;
  let baselineDir;
  let candidateDir;
  let baselineCommit;
  let contract;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-adv-test-')));
    baselineDir = path.join(tempRoot, 'baseline');
    candidateDir = path.join(tempRoot, 'candidate');

    const info = makeBaselineNoteApp(baselineDir);
    baselineCommit = info.baselineCommit;
    createDescendantWorktree(baselineDir, candidateDir);

    contract = {
      schemaVersion: '1.0.0',
      implementationBoundary: {
        allowedPaths: [
          'app/src/main/java/fixture/app/ui'
        ],
        prohibitedChanges: ['Do not change data persistence'],
        verificationCommands: ['./gradlew test']
      }
    };
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
    } catch (_) {}
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('Suite 1: Worktree Forgery & Ancestry Attacks', () => {
    it('[ADV-WT-01] rejects an unrelated git repository passed as candidate worktree', () => {
      const unrelatedDir = path.join(tempRoot, 'unrelated-repo');
      initCleanGitRepo(unrelatedDir);
      fs.writeFileSync(path.join(unrelatedDir, 'unrelated.txt'), 'unrelated');
      execFileSync('git', ['-C', unrelatedDir, 'add', '.']);
      execFileSync('git', ['-C', unrelatedDir, 'commit', '-qm', 'unrelated commit']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: unrelatedDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /must be a worktree of/i.test(err.message));
    });

    it('[ADV-WT-02] rejects a divergent orphan branch in the worktree', () => {
      execFileSync('git', ['-C', candidateDir, 'checkout', '--orphan', 'divergent-orphan']);
      fs.writeFileSync(path.join(candidateDir, 'divergent.txt'), 'divergent content');
      execFileSync('git', ['-C', candidateDir, 'add', '.']);
      execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'divergent commit']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          baselineCommit,
          contract
        });
      }, (err) => err instanceof InputError && /does not descend from the inspected baseline commit/i.test(err.message));
    });

    it('[ADV-WT-03] rejects candidate pointing to baseline directory itself', () => {
      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: baselineDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /must differ from the immutable baseline/i.test(err.message));
    });

    it('[ADV-WT-04] rejects non-worktree normal directory', () => {
      const plainDir = path.join(tempRoot, 'plain-dir');
      fs.mkdirSync(plainDir, { recursive: true });

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: plainDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /not a Git worktree/i.test(err.message));
    });
  });

  describe('Suite 2: Dirty Baseline Checkouts', () => {
    it('[ADV-DB-01] rejects candidate verification when baseline has unstaged changes', () => {
      fs.appendFileSync(path.join(baselineDir, 'app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'), '// dirty unstaged\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /clean committed inspected baseline/i.test(err.message));
    });

    it('[ADV-DB-02] rejects candidate verification when baseline has staged but uncommitted changes', () => {
      fs.writeFileSync(path.join(baselineDir, 'staged.txt'), 'staged');
      execFileSync('git', ['-C', baselineDir, 'add', 'staged.txt']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /clean committed inspected baseline/i.test(err.message));
    });

    it('[ADV-DB-03] rejects candidate verification when baseline has untracked source files', () => {
      fs.writeFileSync(path.join(baselineDir, 'app/src/main/java/fixture/app/outside/Untracked.kt'), '// untracked\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /clean committed inspected baseline/i.test(err.message));
    });
  });

  describe('Suite 3: Symlink Traversal & Confinement Attacks', () => {
    it('[ADV-SYM-01] rejects candidate containing tracked symlink in src/', () => {
      const symlinkPath = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/TrackedLink.kt');
      fs.symlinkSync('/etc/passwd', symlinkPath);
      execFileSync('git', ['-C', candidateDir, 'add', '.']);
      execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'add tracked symlink']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message));
    });

    it('[ADV-SYM-02] rejects candidate containing untracked directory symlink in src/', () => {
      const outsideDir = path.join(tempRoot, 'outside-secret');
      fs.mkdirSync(outsideDir, { recursive: true });
      const symlinkDir = path.join(candidateDir, 'app/src/main/java/linkedDir');
      fs.symlinkSync(outsideDir, symlinkDir);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message));
    });

    it('[ADV-SYM-03] rejects candidate containing symlink to build configuration file', () => {
      const fakeGradle = path.join(tempRoot, 'fake.gradle');
      fs.writeFileSync(fakeGradle, '// fake');
      fs.unlinkSync(path.join(candidateDir, 'build.gradle.kts'));
      fs.symlinkSync(fakeGradle, path.join(candidateDir, 'build.gradle.kts'));

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message));
    });


    it('[ADV-SYM-04] rejects candidate path that is itself a symlink', () => {
      const symCandidate = path.join(tempRoot, 'symlinked-cand');
      fs.symlinkSync(candidateDir, symCandidate);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: symCandidate,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /non-symlink directory/i.test(err.message));
    });

    it('[ADV-SYM-05] rejects symlink in evidence receipt path', () => {
      const outsideReceipt = path.join(tempRoot, 'outside-receipt.json');
      fs.writeFileSync(outsideReceipt, JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } }));
      const symReceipt = path.join(tempRoot, 'sym-receipt.json');
      fs.symlinkSync(outsideReceipt, symReceipt);

      assert.throws(() => {
        rootFile(tempRoot, 'sym-receipt.json', 'evidence receipt');
      }, (err) => err instanceof InputError && /symlink/i.test(err.message));
    });
  });

  describe('Suite 4: Out-of-Boundary File Modifications', () => {
    it('[ADV-OB-01] rejects modification to Backdoor.kt outside allowedPaths', () => {
      const backdoor = path.join(candidateDir, 'app/src/main/java/fixture/app/outside/Backdoor.kt');
      fs.writeFileSync(backdoor, 'package fixture.app.outside\n// rogue backdoor\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[ADV-OB-02] rejects modifications to AndroidManifest.xml', () => {
      const manifest = path.join(candidateDir, 'app/src/main/AndroidManifest.xml');
      fs.appendFileSync(manifest, '<!-- backdoor perm -->\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[ADV-OB-03] rejects modifications to build.gradle.kts outside boundary', () => {
      const gradle = path.join(candidateDir, 'build.gradle.kts');
      fs.appendFileSync(gradle, '// added untrusted dependency\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[ADV-OB-04] rejects build receipt that omits actual changed files', () => {
      const editorFile = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '// actual change\n');

      const buildReceiptContent = JSON.stringify({
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        changedPaths: ['app/src/main/java/fixture/app/ui/DifferentScreen.kt']
      });
      const receiptPath = path.join(tempRoot, 'build-receipt.json');
      fs.writeFileSync(receiptPath, buildReceiptContent);
      const receiptDigest = sha256(Buffer.from(buildReceiptContent));

      const result = {
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        subject: { repositoryRevision: baselineCommit, buildArtifactSha256: 'a'.repeat(64) },
        evidence: [{
          id: 'evidence.candidate.build',
          domain: 'BUILD',
          status: 'PRESENT',
          source: 'build-receipt.json',
          sha256: receiptDigest
        }]
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          result,
          workspaceRoot: tempRoot
        });
      }, (err) => err instanceof InputError && /changedPaths do not exactly match/i.test(err.message));
    });

  });

  describe('Suite 5: Ignored Source Additions', () => {
    it('[ADV-IGN-01] detects and rejects hidden.kt added via .git/info/exclude outside boundary', () => {
      const excludeFile = path.join(baselineDir, '.git/info/exclude');
      fs.appendFileSync(excludeFile, 'hidden.kt\n');

      const hiddenPath = path.join(candidateDir, 'app/src/main/java/fixture/app/outside/hidden.kt');
      fs.writeFileSync(hiddenPath, '// hidden source\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[ADV-IGN-02] rejects ignored source outside boundary via .gitignore', () => {
      fs.writeFileSync(path.join(candidateDir, '.gitignore'), '*.secret\n');
      const secret = path.join(candidateDir, 'app/src/main/java/fixture/app/outside/Secret.secret');
      fs.writeFileSync(secret, '// secret\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[ADV-IGN-04] rejects ignored symlink in source directories', () => {
      fs.writeFileSync(path.join(candidateDir, '.gitignore'), 'ignored-link.kt\n');
      const symlink = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/ignored-link.kt');
      fs.symlinkSync('/etc/passwd', symlink);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /source-sensitive symlink/i.test(err.message));
    });
  });

  describe('Suite 6: Missing or Tampered Evidence Receipts & SHA Mismatches', () => {
    it('[ADV-RCP-01] rejects evidence with SHA-256 mismatch against disk bytes', () => {
      const receiptContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(tempRoot, 'render.json'), receiptContent);

      const tamperedEvidence = {
        id: 'evidence.render',
        domain: 'RENDER',
        status: 'PRESENT',
        source: 'render.json',
        sha256: '0'.repeat(64) // Forged hash
      };

      assert.throws(() => {
        validateReceiptData(tempRoot, tamperedEvidence);
      }, (err) => err instanceof InputError && /source hash mismatch/i.test(err.message));
    });

    it('[ADV-RCP-02] rejects post-verification file modification (stale evidence)', () => {
      const originalContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(tempRoot, 'render.json'), originalContent);
      const originalHash = sha256(Buffer.from(originalContent));

      // Modify receipt on disk after hash was recorded
      fs.writeFileSync(path.join(tempRoot, 'render.json'), JSON.stringify({ outcome: 'FAIL' }));

      const evidence = {
        id: 'evidence.render',
        domain: 'RENDER',
        status: 'PRESENT',
        source: 'render.json',
        sha256: originalHash
      };

      assert.throws(() => {
        validateReceiptData(tempRoot, evidence);
      }, (err) => err instanceof InputError && /source hash mismatch/i.test(err.message));
    });

    it('[ADV-RCP-03] rejects fabricated summary counts', () => {
      const result = {
        summary: {
          passedRequirementCount: 99,
          failedRequirementCount: 0,
          blockedRequirementCount: 0
        },
        requirements: [
          { id: 'REQ-1', status: 'PASS' }
        ]
      };

      assert.throws(() => {
        validateSummaryCounts(result);
      }, (err) => err instanceof InputError && /summary counts do not match recomputed decision/i.test(err.message));
    });

    it('[ADV-RCP-04] rejects manipulated metric values in result manifest', () => {
      const receiptJson = JSON.stringify({
        outcome: 'FAIL',
        verificationScope: { kind: 'test' },
        metrics: [{ name: 'ink_iou', unit: 'ratio', value: 0.70 }]
      });
      fs.writeFileSync(path.join(tempRoot, 'metrics.json'), receiptJson);
      const receiptHash = sha256(Buffer.from(receiptJson));

      const evidence = {
        id: 'evidence.diff',
        domain: 'DIFF',
        status: 'PRESENT',
        source: 'metrics.json',
        sha256: receiptHash,
        metrics: [{ name: 'ink_iou', unit: 'ratio', value: 0.95 }] // Manipulated value
      };

      assert.throws(() => {
        validateReceiptData(tempRoot, evidence);
      }, (err) => err instanceof InputError && /declared metrics do not match its receipt/i.test(err.message));
    });

    it('[ADV-RCP-05] rejects PASS result missing candidate buildArtifactSha256', () => {
      const result = {
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        subject: {
          repositoryRevision: baselineCommit,
          buildArtifactSha256: null // Missing APK build hash
        }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          result,
          contract: null
        });
      }, (err) => err instanceof InputError && /candidate artifact is not linked to subject buildArtifactSha256/i.test(err.message));
    });

    it('[ADV-RCP-06] rejects parent traversal in receipt path', () => {
      assert.throws(() => {
        rootFile(tempRoot, '../outside_receipt.json', 'evidence receipt');
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));

      assert.throws(() => {
        rootFile(tempRoot, '/tmp/absolute.json', 'evidence receipt');
      }, (err) => err instanceof InputError && /must be relative to --root/i.test(err.message));
    });
  });

  describe('Suite 7: CLI Dispatcher Integration Tests', () => {
    it('CLI verify rejects invalid or non-existent candidate with exitCode 3', async () => {
      const res = await dispatch([
        'verify',
        'note_editor',
        '--app-dir', baselineDir,
        '--candidate', path.join(tempRoot, 'non-existent-worktree'),
        '--json'
      ]);

      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'FAIL');
      assert.ok(res.error.includes('must be an existing Git worktree'));
    });

    it('CLI verify rejects dirty baseline with exitCode 3', async () => {
      fs.appendFileSync(path.join(baselineDir, 'build.gradle.kts'), '// dirty\n');

      const res = await dispatch([
        'verify',
        'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--json'
      ]);

      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'FAIL');
      assert.ok(res.error.includes('clean committed inspected baseline'));
    });
  });
});
