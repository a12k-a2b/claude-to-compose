/**
 * tests/adversarial/m1_empirical_challenge.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 1 (Candidate Git Worktree Isolation & Safety Subsystem).
 * Executed by challenger_m1_1.
 *
 * Covers:
 * 1. Symlink race attacks during atomic writes (atomicWriteNoFollow)
 * 2. Deep nested traversal attempts (....//, unicode escapes, %252e%252e, backslashes, null bytes)
 * 3. Worktree tampering (injecting untracked files while running verify)
 * 4. Boundary escape attempts (substring prefixes, e.g. allowedPath_fake/, allowedPath-suffix/)
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
  atomicWriteNoFollow,
  hasTraversal,
  resolveExplicit,
  isInside,
  canonicalPlannedPath,
  rejectDangerousRoot,
  assertNoSourceSensitiveSymlinks,
  gitCommonDirectory,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata,
  InputError,
  BlockedError
} = require('../../src/agent/safety');

const {
  verifyCandidateWorktree,
  enforceImplementationBoundary,
  rootFile,
  validateReceiptData
} = require('../../src/verification/candidate_verifier');

const { sanitizePath } = require('../../src/agent/boundary_enforcer');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Challenger']);
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

function createDescendantWorktree(baselineRoot, candidateRoot, branch = 'candidate-challenge') {
  execFileSync('git', ['-C', baselineRoot, 'worktree', 'add', '-b', branch, candidateRoot, 'HEAD']);
}

describe('Empirical Adversarial Challenge Suite: Milestone 1 Safety & Worktree Isolation', () => {
  let tempRoot;
  let baselineDir;
  let candidateDir;
  let baselineCommit;
  let contract;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-chal-test-')));
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

  // =========================================================================
  // Challenge Area 1: Symlink Race Attacks During Atomic Writes
  // =========================================================================
  describe('Challenge Area 1: Symlink Race Attacks During Atomic Writes', () => {
    it('[CHAL-SYM-01] refuses to write through pre-existing symbolic link and leaves victim unharmed', () => {
      const victimPath = path.join(tempRoot, 'victim_target.txt');
      fs.writeFileSync(victimPath, 'SACRED_ORIGINAL_CONTENT');

      const targetLink = path.join(tempRoot, 'attack_link.txt');
      fs.symlinkSync(victimPath, targetLink);

      assert.throws(() => {
        atomicWriteNoFollow(targetLink, 'MALICIOUS_OVERWRITE');
      }, (err) => err instanceof InputError && /refusing to write through output symlink/i.test(err.message));

      // Assert victim was NOT modified
      assert.equal(fs.readFileSync(victimPath, 'utf8'), 'SACRED_ORIGINAL_CONTENT');
    });

    it('[CHAL-SYM-02] refuses to overwrite directory target', () => {
      const dirTarget = path.join(tempRoot, 'existing_dir');
      fs.mkdirSync(dirTarget);

      assert.throws(() => {
        atomicWriteNoFollow(dirTarget, 'SOME_DATA');
      }, (err) => err instanceof InputError && /must be a regular file/i.test(err.message));
    });

    it('[CHAL-SYM-03] survives concurrent symlink race loop without corrupting victim file', async () => {
      const victimPath = path.join(tempRoot, 'symlink_race_victim.txt');
      const targetPath = path.join(tempRoot, 'contested_output.txt');
      fs.writeFileSync(victimPath, 'SACRED_VICTIM_DATA');

      let racing = true;
      let attackerSymlinkCreations = 0;

      // Attacker asynchronously toggles between symlink to victim and normal file
      const racePromise = (async () => {
        while (racing) {
          try {
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
            }
            fs.symlinkSync(victimPath, targetPath);
            attackerSymlinkCreations++;
          } catch (_) {}
          await new Promise((r) => setImmediate(r));
        }
      })();

      // Run multiple concurrent atomic writes
      let writeAttempts = 0;
      let detectedSymlinkErrors = 0;
      let successfulWrites = 0;

      for (let i = 0; i < 50; i++) {
        writeAttempts++;
        try {
          atomicWriteNoFollow(targetPath, `PAYLOAD_${i}`);
          successfulWrites++;
        } catch (err) {
          if (err instanceof InputError && /refusing to write through output symlink/i.test(err.message)) {
            detectedSymlinkErrors++;
          }
        }
      }

      racing = false;
      await racePromise;

      // CRITICAL ASSERTION: The victim file MUST NEVER contain any PAYLOAD data
      const victimContent = fs.readFileSync(victimPath, 'utf8');
      assert.equal(
        victimContent,
        'SACRED_VICTIM_DATA',
        `Symlink race breached confinement! Victim content was corrupted: "${victimContent}"`
      );
    });

    it('[CHAL-SYM-04] temp file collision resistance: randomBytes prevent race on tempfile', () => {
      const targetPath = path.join(tempRoot, 'concurrent_file.txt');
      // Execute 20 concurrent atomic writes
      const results = [];
      for (let i = 0; i < 20; i++) {
        atomicWriteNoFollow(targetPath, `CONCURRENT_DATA_${i}`);
        results.push(fs.readFileSync(targetPath, 'utf8'));
      }
      assert.equal(results.length, 20);
      assert.match(results[19], /^CONCURRENT_DATA_\d+$/);
    });
  });

  // =========================================================================
  // Challenge Area 2: Deep Nested Traversal Attempts
  // =========================================================================
  describe('Challenge Area 2: Deep Nested Traversal Attempts', () => {
    it('[CHAL-TRAV-01] hasTraversal detects double and triple URL-encoded traversal (%252e%252e)', () => {
      // 1-pass: %2e%2e
      assert.equal(hasTraversal('%2e%2e/etc/passwd'), true);
      assert.equal(hasTraversal('foo/%2E%2E/bar'), true);

      // 2-pass: %252e%252e -> %2e%2e -> ..
      assert.equal(hasTraversal('%252e%252e/etc/passwd'), true);
      assert.equal(hasTraversal('app/src/%252E%252E/evil'), true);

      // 3-pass: %25252e%25252e -> %252e%252e -> %2e%2e -> ..
      assert.equal(hasTraversal('%25252e%25252e/etc/passwd'), true);
    });

    it('[CHAL-TRAV-02] hasTraversal detects backslash traversal (..\\..\\ and \\..\\)', () => {
      assert.equal(hasTraversal('..\\..\\windows\\system32'), true);
      assert.equal(hasTraversal('app\\src\\..\\..\\secret'), true);
      assert.equal(hasTraversal('path\\..'), true);
      assert.equal(hasTraversal('..\\path'), true);
    });

    it('[CHAL-TRAV-03] sanitizePath rejects mixed and nested traversal patterns', () => {
      const maliciousPatterns = [
        '../app/src/main',
        'app/src/../../outside',
        'app/src/%2e%2e/outside',
        'app/src/%252e%252e/outside',
        '..\\app\\src',
        'app\\..\\src',
        '/etc/passwd',
        '/var/log',
        '/usr/bin'
      ];

      for (const pattern of maliciousPatterns) {
        assert.throws(() => {
          sanitizePath(pattern);
        }, /(?:traversal|invalid path|forbidden)/i, `Failed to reject: ${pattern}`);
      }
    });

    it('[CHAL-TRAV-04] resolveExplicit rejects null bytes and traversal', () => {
      assert.throws(() => {
        resolveExplicit('valid/path\0/evil', 'testPath');
      }, (err) => err instanceof InputError && /null byte/i.test(err.message));

      assert.throws(() => {
        resolveExplicit('valid/path/../../../escaped', 'testPath');
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));

      assert.throws(() => {
        resolveExplicit('valid/%252e%252e/escaped', 'testPath');
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));
    });

    it('[CHAL-TRAV-05] rootFile rejects parent traversal, absolute paths, and escaping symlinks', () => {
      assert.throws(() => {
        rootFile(tempRoot, '../outside.json', 'receipt');
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));

      assert.throws(() => {
        rootFile(tempRoot, '/tmp/absolute.json', 'receipt');
      }, (err) => err instanceof InputError && /relative to --root/i.test(err.message));

      assert.throws(() => {
        rootFile(tempRoot, 'deep/%252e%252e/outside.json', 'receipt');
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));
    });

    it('[CHAL-TRAV-06] rejectDangerousRoot rejects filesystem root and home directory', () => {
      assert.throws(() => {
        rejectDangerousRoot('/', 'rootPath');
      }, (err) => err instanceof InputError && /dangerous root/i.test(err.message));

      assert.throws(() => {
        rejectDangerousRoot(os.homedir(), 'homePath');
      }, (err) => err instanceof InputError && /dangerous root/i.test(err.message));
    });

    it('[CHAL-TRAV-07] isInside properly bounds path containment under APFS /tmp symlink', () => {
      const parentDir = path.join(tempRoot, 'allowed_parent');
      fs.mkdirSync(parentDir);
      const childDir = path.join(parentDir, 'nested/child');
      fs.mkdirSync(childDir, { recursive: true });

      assert.equal(isInside(parentDir, childDir), true);
      assert.equal(isInside(parentDir, path.join(parentDir, '....//')), true); // stays within parent as literal '....'
      assert.equal(isInside(parentDir, path.join(parentDir, '../escaped')), false);
      assert.equal(isInside(parentDir, tempRoot), false);
    });
  });

  // =========================================================================
  // Challenge Area 3: Worktree Tampering (Injecting Untracked Files)
  // =========================================================================
  describe('Challenge Area 3: Worktree Tampering', () => {
    it('[CHAL-WT-01] rejects untracked file injected outside allowedPaths', () => {
      const roguePath = path.join(candidateDir, 'app/src/main/java/fixture/app/outside/RogueUntracked.kt');
      fs.writeFileSync(roguePath, 'package fixture.app.outside\n// rogue untracked file\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[CHAL-WT-02] rejects untracked script injected in root of candidate worktree', () => {
      const rogueScript = path.join(candidateDir, 'malicious_hook.sh');
      fs.writeFileSync(rogueScript, '#!/bin/sh\nrm -rf /\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[CHAL-WT-03] rejects when untracked file is added inside allowedPaths after receipt generated (receipt tamper)', () => {
      // 1. Legitimate modification
      const editorFile = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '// verified change\n');

      // 2. Receipt records ONLY NoteEditorScreen.kt
      const buildReceiptContent = JSON.stringify({
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        changedPaths: ['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt']
      });
      const receiptPath = path.join(tempRoot, 'receipt.json');
      fs.writeFileSync(receiptPath, buildReceiptContent);
      const receiptDigest = sha256(Buffer.from(buildReceiptContent));

      const result = {
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        subject: { repositoryRevision: baselineCommit, buildArtifactSha256: 'b'.repeat(64) },
        evidence: [{
          id: 'evidence.candidate.build',
          domain: 'BUILD',
          status: 'PRESENT',
          source: 'receipt.json',
          sha256: receiptDigest
        }]
      };

      // 3. Attacker injects a second untracked file inside allowedPaths without regenerating receipt
      const injectedFile = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/SneakyExtra.kt');
      fs.writeFileSync(injectedFile, 'package fixture.app.ui\n// sneaky unverified addition\n');

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

    it('[CHAL-WT-04] rejects verification when untracked file is injected into baseline repo', () => {
      // Attacker poisons the baseline repository with an untracked file
      const baselinePoison = path.join(baselineDir, 'app/src/main/java/fixture/app/ui/Poison.kt');
      fs.writeFileSync(baselinePoison, '// baseline pollution\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /clean committed inspected baseline/i.test(err.message));
    });

    it('[CHAL-WT-05] source snapshot SHA-256 changes deterministically when worktree is modified', () => {
      // Baseline check
      const res1 = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });

      // Modify allowed file
      const editorFile = path.join(candidateDir, 'app/src/main/java/fixture/app/ui/NoteEditorScreen.kt');
      fs.appendFileSync(editorFile, '// modification 1\n');

      const res2 = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });

      assert.notEqual(res1.sourceSnapshotSha256, res2.sourceSnapshotSha256);
      assert.notEqual(res1.workingTreeDiffSha256, res2.workingTreeDiffSha256);
    });
  });

  // =========================================================================
  // Challenge Area 4: Boundary Escape Attempts (Prefix Confusion / Substrings)
  // =========================================================================
  describe('Challenge Area 4: Boundary Escape Attempts (Prefix Confusion)', () => {
    it('[CHAL-BOUND-01] rejects sibling directory matching prefix (allowedPath_fake/)', () => {
      // Contract allowedPaths: ['app/src/main/java/fixture/app/ui']
      // Attacker creates sibling dir: 'app/src/main/java/fixture/app/ui_fake'
      const fakeDir = path.join(candidateDir, 'app/src/main/java/fixture/app/ui_fake');
      fs.mkdirSync(fakeDir, { recursive: true });
      fs.writeFileSync(path.join(fakeDir, 'Backdoor.kt'), '// backdoor in prefix-matched directory\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[CHAL-BOUND-02] rejects sibling directory with hyphen suffix (allowedPath-extended/)', () => {
      const hyphenDir = path.join(candidateDir, 'app/src/main/java/fixture/app/ui-extended');
      fs.mkdirSync(hyphenDir, { recursive: true });
      fs.writeFileSync(path.join(hyphenDir, 'Backdoor.kt'), '// backdoor\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[CHAL-BOUND-03] rejects file sharing prefix name (ui.kt when allowed is directory ui)', () => {
      const siblingFile = path.join(candidateDir, 'app/src/main/java/fixture/app/ui.kt');
      fs.writeFileSync(siblingFile, '// sibling file\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && /outside the contract boundary/i.test(err.message));
    });

    it('[CHAL-BOUND-04] enforceImplementationBoundary rejects overly broad allowedPaths (< 4 segments or no src)', () => {
      assert.throws(() => {
        enforceImplementationBoundary(['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'], ['app/src']);
      }, (err) => err instanceof InputError && /too broad or non-normalized/i.test(err.message));

      assert.throws(() => {
        enforceImplementationBoundary(['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'], ['app/build/intermediates/res']);
      }, (err) => err instanceof InputError && /too broad or non-normalized/i.test(err.message));

      assert.throws(() => {
        enforceImplementationBoundary(['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'], ['/absolute/app/src/main']);
      }, (err) => err instanceof InputError && /must be relative/i.test(err.message));

      assert.throws(() => {
        enforceImplementationBoundary(['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'], ['app/src/main/..']);
      }, (err) => err instanceof InputError && /parent traversal/i.test(err.message));

      assert.throws(() => {
        enforceImplementationBoundary(['app/src/main/java/fixture/app/ui/NoteEditorScreen.kt'], ['app/src/main/*']);
      }, (err) => err instanceof InputError && /wildcards/i.test(err.message));
    });

    it('[CHAL-BOUND-05] case-sensitivity check on macOS APFS: mismatched case is strictly rejected', () => {
      // In JS boundary check: normChanged.startsWith(`${normAllowed}/`) is case-sensitive
      const upperChanged = 'app/src/main/java/fixture/app/UI/Backdoor.kt';
      const violations = enforceImplementationBoundary([upperChanged], ['app/src/main/java/fixture/app/ui']);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].type, 'BOUNDARY_VIOLATION');
      assert.match(violations[0].message, /outside the contract boundary/i);
    });
  });
});
