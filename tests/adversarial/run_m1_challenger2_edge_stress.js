/**
 * tests/adversarial/run_m1_challenger2_edge_stress.js
 *
 * Empirical Challenge Harness: Milestone 1 (Candidate Git Worktree Isolation & Safety)
 *
 * Systematic stress-testing of:
 * 1. Detached HEADs at baselineCommit, ahead of baselineCommit, and behind baselineCommit
 * 2. Detached HEAD on baseline repository
 * 3. Candidate containing git submodules / gitlinks (inside, outside, and as candidate)
 * 4. Receipt hash corruptions (truncated, non-hex, uppercase, null/undefined, missing subject)
 * 5. Ignored source tampering (modifications, deletions, additions within and outside boundary)
 * 6. Worktree edge cases (untracked directory entries, clean/dirty detection)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

const {
  verifyCandidateWorktree,
  verifyWorktreeDescendant,
  enforceImplementationBoundary,
  validateReceiptData,
  validateSummaryCounts,
  rootFile,
  assertNoSourceSensitiveSymlinks,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata,
  gitCommonDirectory,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');
const { hasTraversal, isInside, atomicWriteNoFollow, rejectDangerousRoot } = require('../../src/agent/safety');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Empirical Challenger']);
}

function setupBaseline(dir) {
  initCleanGitRepo(dir);
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const dataDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditor.kt'), 'package com.claude.noteapp.ui.editor\n// v1\n');
  fs.writeFileSync(path.join(dataDir, 'NoteDao.kt'), 'package com.claude.noteapp.data\n// dao\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// build\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// settings\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline commit']);
  const baselineCommit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { baselineCommit };
}

async function runAllChallenges() {
  console.log('================================================================');
  console.log('  STARTING EMPIRICAL CHALLENGE SUITE: MILESTONE 1');
  console.log('================================================================\n');

  const results = [];
  let passedCount = 0;
  let failedCount = 0;

  function runChallenge(id, description, fn) {
    process.stdout.write(`[${id}] ${description} ... `);
    const start = Date.now();
    try {
      fn();
      const elapsed = Date.now() - start;
      console.log(`PASS (${elapsed}ms)`);
      results.push({ id, description, status: 'PASS', elapsed });
      passedCount++;
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`FAIL (${elapsed}ms)`);
      console.error(`       Error: ${err.message}`);
      results.push({ id, description, status: 'FAIL', elapsed, error: err.message, stack: err.stack });
      failedCount++;
    }
  }

  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m1-challenge-')));
  const baselineDir = path.join(tempRoot, 'baseline');
  const { baselineCommit } = setupBaseline(baselineDir);

  const contract = {
    schemaVersion: '1.0.0',
    implementationBoundary: {
      allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'],
      prohibitedChanges: ['Do not touch data persistence'],
      verificationCommands: ['./gradlew test']
    }
  };

  try {
    // -------------------------------------------------------------
    // GROUP 1: DETACHED HEAD CHALLENGES
    // -------------------------------------------------------------
    console.log('\n--- Group 1: Detached HEAD Scenarios ---');

    runChallenge('CHAL-DH-01', 'Candidate worktree with detached HEAD exactly at baselineCommit passes when clean', () => {
      const candidateDir = path.join(tempRoot, 'cand-dh-01');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '--detach', candidateDir, baselineCommit]);

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
      assert.equal(res.revision.commit, baselineCommit);
      assert.equal(res.revision.dirty, false);
      assert.deepEqual(res.changedPaths, []);
    });

    runChallenge('CHAL-DH-02', 'Candidate worktree with detached HEAD at baselineCommit with valid in-boundary edits', () => {
      const candidateDir = path.join(tempRoot, 'cand-dh-02');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '--detach', candidateDir, baselineCommit]);
      const file = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
      fs.appendFileSync(file, '// detached edit\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
      assert.equal(res.revision.dirty, true);
      assert.deepEqual(res.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt']);
    });

    runChallenge('CHAL-DH-03', 'Candidate worktree with detached HEAD ahead of baselineCommit (committed descendant)', () => {
      const candidateDir = path.join(tempRoot, 'cand-dh-03');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', candidateDir, baselineCommit]);
      const file = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
      fs.appendFileSync(file, '// committed descendant\n');
      execFileSync('git', ['-C', candidateDir, 'add', '.']);
      execFileSync('git', ['-C', candidateDir, 'commit', '-qm', 'candidate commit 1']);
      execFileSync('git', ['-C', candidateDir, 'checkout', '--detach', 'HEAD']);

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
      assert.notEqual(res.revision.commit, baselineCommit);
      assert.deepEqual(res.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt']);
    });

    runChallenge('CHAL-DH-04', 'Candidate worktree detached at an ancestor/non-descendant commit fails', () => {
      const advRepo = path.join(tempRoot, 'adv-dh-04-repo');
      const { baselineCommit: c1 } = setupBaseline(advRepo);

      // Create a second commit in baseline so baselineCommit is HEAD
      const baselineFile = path.join(advRepo, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
      fs.appendFileSync(baselineFile, '// commit 2\n');
      execFileSync('git', ['-C', advRepo, 'add', '.']);
      execFileSync('git', ['-C', advRepo, 'commit', '-qm', 'baseline commit 2']);
      const c2 = execFileSync('git', ['-C', advRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

      const candidateDir = path.join(tempRoot, 'cand-dh-04');
      execFileSync('git', ['-C', advRepo, 'worktree', 'add', candidateDir, c1]); // older commit c1!

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: advRepo,
          baselineCommit: c2,
          contract
        });
      }, (err) => err instanceof InputError && err.message.includes('does not descend from'));
    });

    runChallenge('CHAL-DH-05', 'Baseline repository in detached HEAD state succeeds if clean', () => {
      const detachedBaseline = path.join(tempRoot, 'detached-baseline');
      const { baselineCommit: dbCommit } = setupBaseline(detachedBaseline);
      execFileSync('git', ['-C', detachedBaseline, 'checkout', '--detach', 'HEAD']);

      const candidateDir = path.join(tempRoot, 'cand-dh-05');
      execFileSync('git', ['-C', detachedBaseline, 'worktree', 'add', '-b', 'feat-dh5', candidateDir, dbCommit]);

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: detachedBaseline,
        contract
      });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
    });

    // -------------------------------------------------------------
    // GROUP 2: SUBMODULES AND GITLINKS
    // -------------------------------------------------------------
    console.log('\n--- Group 2: Submodules & Gitlinks ---');

    runChallenge('CHAL-SUB-01', 'Candidate containing untracked nested git repo inside allowedPaths does not crash', () => {
      const candidateDir = path.join(tempRoot, 'cand-sub-01');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '-b', 'sub-01', candidateDir, baselineCommit]);

      const nestedRepo = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/nested');
      initCleanGitRepo(nestedRepo);
      fs.writeFileSync(path.join(nestedRepo, 'Nested.kt'), 'package com.claude.noteapp.ui.editor.nested\n');
      execFileSync('git', ['-C', nestedRepo, 'add', '.']);
      execFileSync('git', ['-C', nestedRepo, 'commit', '-qm', 'nested initial']);

      // Untracked git submodule folder in candidate
      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'PASS');
      assert.ok(res.changedPaths.some(p => p.includes('nested')));
    });

    runChallenge('CHAL-SUB-02', 'Candidate containing nested git repo outside allowedPaths is rejected', () => {
      const candidateDir = path.join(tempRoot, 'cand-sub-02');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '-b', 'sub-02', candidateDir, baselineCommit]);

      const nestedRepo = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/rogue-module');
      initCleanGitRepo(nestedRepo);
      fs.writeFileSync(path.join(nestedRepo, 'Rogue.kt'), 'package rogue\n');
      execFileSync('git', ['-C', nestedRepo, 'add', '.']);
      execFileSync('git', ['-C', nestedRepo, 'commit', '-qm', 'rogue initial']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
    });

    runChallenge('CHAL-SUB-03', 'Submodule directory passed directly as --candidate is rejected as not a worktree', () => {
      const externalRepo = path.join(tempRoot, 'external-sub');
      initCleanGitRepo(externalRepo);
      fs.writeFileSync(path.join(externalRepo, 'Ext.kt'), '// ext\n');
      execFileSync('git', ['-C', externalRepo, 'add', '.']);
      execFileSync('git', ['-C', externalRepo, 'commit', '-qm', 'ext commit']);

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: externalRepo,
          baselineRoot: baselineDir,
          contract
        });
      }, (err) => err instanceof InputError && err.message.includes('must be a worktree of the inspected baseline'));
    });

    // -------------------------------------------------------------
    // GROUP 3: RECEIPT HASH CORRUPTIONS & INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- Group 3: Receipt Hash Corruptions ---');

    runChallenge('CHAL-RCP-01', 'Rejects truncated SHA-256 (32 characters instead of 64)', () => {
      const receiptDir = path.join(tempRoot, 'receipt-test-1');
      fs.mkdirSync(receiptDir, { recursive: true });
      const receiptContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(receiptDir, 'test-receipt.json'), receiptContent);

      const truncatedSha = sha256(Buffer.from(receiptContent)).substring(0, 32);
      const evidence = {
        id: 'evidence.truncated',
        domain: 'BUILD',
        status: 'PRESENT',
        source: 'test-receipt.json',
        sha256: truncatedSha
      };

      assert.throws(() => {
        validateReceiptData(receiptDir, evidence);
      }, (err) => err instanceof InputError && err.message.includes('source hash mismatch'));
    });

    runChallenge('CHAL-RCP-02', 'Rejects uppercase hexadecimal SHA-256', () => {
      const receiptDir = path.join(tempRoot, 'receipt-test-2');
      fs.mkdirSync(receiptDir, { recursive: true });
      const receiptContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(receiptDir, 'test-receipt.json'), receiptContent);

      const upperSha = sha256(Buffer.from(receiptContent)).toUpperCase();
      const evidence = {
        id: 'evidence.upper',
        domain: 'BUILD',
        status: 'PRESENT',
        source: 'test-receipt.json',
        sha256: upperSha
      };

      assert.throws(() => {
        validateReceiptData(receiptDir, evidence);
      }, (err) => err instanceof InputError && err.message.includes('source hash mismatch'));
    });

    runChallenge('CHAL-RCP-03', 'Rejects non-hex characters in SHA-256', () => {
      const receiptDir = path.join(tempRoot, 'receipt-test-3');
      fs.mkdirSync(receiptDir, { recursive: true });
      const receiptContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(receiptDir, 'test-receipt.json'), receiptContent);

      const nonHexSha = 'z'.repeat(64);
      const evidence = {
        id: 'evidence.nonhex',
        domain: 'BUILD',
        status: 'PRESENT',
        source: 'test-receipt.json',
        sha256: nonHexSha
      };

      assert.throws(() => {
        validateReceiptData(receiptDir, evidence);
      }, (err) => err instanceof InputError && err.message.includes('source hash mismatch'));
    });

    runChallenge('CHAL-RCP-04', 'Rejects null or undefined or number as evidence sha256', () => {
      const receiptDir = path.join(tempRoot, 'receipt-test-4');
      fs.mkdirSync(receiptDir, { recursive: true });
      const receiptContent = JSON.stringify({ outcome: 'PASS', verificationScope: { kind: 'test' } });
      fs.writeFileSync(path.join(receiptDir, 'test-receipt.json'), receiptContent);

      for (const badHash of [null, undefined, 123456, false]) {
        const evidence = {
          id: 'evidence.bad',
          domain: 'BUILD',
          status: 'PRESENT',
          source: 'test-receipt.json',
          sha256: badHash
        };
        assert.throws(() => {
          validateReceiptData(receiptDir, evidence);
        }, (err) => err instanceof InputError && err.message.includes('source hash mismatch'));
      }
    });

    runChallenge('CHAL-RCP-05', 'Rejects PASS result when subject.buildArtifactSha256 is missing or empty', () => {
      const candidateDir = path.join(tempRoot, 'cand-rcp-05');
      execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '-b', 'rcp-05', candidateDir, baselineCommit]);

      const result = {
        outcome: 'PASS',
        verificationScope: { kind: 'project-candidate' },
        subject: {
          repositoryRevision: baselineCommit
          // buildArtifactSha256 omitted!
        }
      };

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract,
          result
        });
      }, (err) => err instanceof InputError && err.message.includes('candidate artifact is not linked to subject buildArtifactSha256'));
    });

    runChallenge('CHAL-RCP-06', 'Rejects BUILD receipt with malformed/non-JSON content', () => {
      const receiptDir = path.join(tempRoot, 'receipt-test-6');
      fs.mkdirSync(receiptDir, { recursive: true });
      const badContent = 'NOT VALID JSON { outcome: PASS';
      fs.writeFileSync(path.join(receiptDir, 'build-receipt.txt'), badContent);
      const hash = sha256(Buffer.from(badContent));

      const evidence = {
        id: 'evidence.candidate.build',
        domain: 'BUILD',
        status: 'PRESENT',
        source: 'build-receipt.txt',
        sha256: hash
      };

      assert.throws(() => {
        validateReceiptData(receiptDir, evidence);
      }, (err) => err instanceof InputError && err.message.includes('requires a structured PASS/FAIL receipt'));
    });

    // -------------------------------------------------------------
    // GROUP 4: IGNORED SOURCE TAMPERING & SENSITIVE PATHS
    // -------------------------------------------------------------
    console.log('\n--- Group 4: Ignored Source Tampering ---');

    runChallenge('CHAL-IGN-01', 'Modifying existing ignored source file in candidate is detected', () => {
      const bDir = path.join(tempRoot, 'b-ign-01');
      const { baselineCommit: bComm } = setupBaseline(bDir);
      const ignoredRel = 'app/src/main/java/com/claude/noteapp/ui/editor/IgnoredConfig.kt';
      const baselineIgnoredFile = path.join(bDir, ignoredRel);
      fs.writeFileSync(baselineIgnoredFile, '// baseline ignored v1\n');
      fs.appendFileSync(path.join(bDir, '.git/info/exclude'), 'IgnoredConfig.kt\n');

      const candidateDir = path.join(tempRoot, 'cand-ign-01');
      execFileSync('git', ['-C', bDir, 'worktree', 'add', '-b', 'ign-01', candidateDir, bComm]);

      // Modify the ignored file in candidate
      const candIgnoredFile = path.join(candidateDir, ignoredRel);
      fs.writeFileSync(candIgnoredFile, '// candidate modified ignored v2\n');

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: bDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.ok(res.changedPaths.includes(ignoredRel));
    });

    runChallenge('CHAL-IGN-02', 'Modifying ignored source file outside boundary is rejected', () => {
      const bDir = path.join(tempRoot, 'b-ign-02');
      const { baselineCommit: bComm } = setupBaseline(bDir);
      const ignoredRel = 'app/src/main/java/com/claude/noteapp/data/IgnoredData.kt';
      const baselineIgnoredFile = path.join(bDir, ignoredRel);
      fs.writeFileSync(baselineIgnoredFile, '// baseline data ignored\n');
      fs.appendFileSync(path.join(bDir, '.git/info/exclude'), 'IgnoredData.kt\n');

      const candidateDir = path.join(tempRoot, 'cand-ign-02');
      execFileSync('git', ['-C', bDir, 'worktree', 'add', '-b', 'ign-02', candidateDir, bComm]);

      // Modify the ignored file outside boundary in candidate
      const candIgnoredFile = path.join(candidateDir, ignoredRel);
      fs.writeFileSync(candIgnoredFile, '// candidate hacked data\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: bDir,
          contract
        });
      }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
    });

    runChallenge('CHAL-IGN-03', 'Deleting an ignored source file in candidate is detected as a change', () => {
      const bDir = path.join(tempRoot, 'b-ign-03');
      const { baselineCommit: bComm } = setupBaseline(bDir);
      const ignoredRel = 'app/src/main/java/com/claude/noteapp/ui/editor/DeletedIgnored.kt';
      const baselineIgnoredFile = path.join(bDir, ignoredRel);
      fs.writeFileSync(baselineIgnoredFile, '// to be deleted\n');
      fs.appendFileSync(path.join(bDir, '.git/info/exclude'), 'DeletedIgnored.kt\n');

      const candidateDir = path.join(tempRoot, 'cand-ign-03');
      execFileSync('git', ['-C', bDir, 'worktree', 'add', '-b', 'ign-03', candidateDir, bComm]);

      // Delete in candidate
      const candIgnoredFile = path.join(candidateDir, ignoredRel);
      if (fs.existsSync(candIgnoredFile)) fs.unlinkSync(candIgnoredFile);

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: bDir,
        contract
      });
      assert.equal(res.valid, true);
      assert.ok(res.changedPaths.includes(ignoredRel));
    });

    runChallenge('CHAL-IGN-04', 'Ignored inspection file (AndroidManifest.xml) modification is detected and rejected outside boundary', () => {
      const bDir = path.join(tempRoot, 'b-ign-04');
      const { baselineCommit: bComm } = setupBaseline(bDir);
      fs.appendFileSync(path.join(bDir, '.git/info/exclude'), 'AndroidManifest.xml\n');

      const candidateDir = path.join(tempRoot, 'cand-ign-04');
      execFileSync('git', ['-C', bDir, 'worktree', 'add', '-b', 'ign-04', candidateDir, bComm]);

      // Modify AndroidManifest.xml in candidate
      fs.appendFileSync(path.join(candidateDir, 'app/src/main/AndroidManifest.xml'), '<!-- mod -->\n');

      assert.throws(() => {
        verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: bDir,
          contract
        });
      }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
    });

    // -------------------------------------------------------------
    // GROUP 5: PATH CONFINEMENT & ATOMIC WRITES
    // -------------------------------------------------------------
    console.log('\n--- Group 5: Path Confinement & Atomic Safety ---');

    runChallenge('CHAL-SAF-01', 'atomicWriteNoFollow refuses to write through intermediate directory symlink', () => {
      const realDir = path.join(tempRoot, 'safe-real-dir');
      fs.mkdirSync(realDir, { recursive: true });
      const targetFile = path.join(realDir, 'safe.txt');

      atomicWriteNoFollow(targetFile, 'content');
      assert.equal(fs.readFileSync(targetFile, 'utf8'), 'content');

      // Attempt write where target itself is a symlink
      const symTarget = path.join(realDir, 'sym-target.txt');
      fs.symlinkSync(targetFile, symTarget);

      assert.throws(() => {
        atomicWriteNoFollow(symTarget, 'malicious');
      }, (err) => err instanceof InputError && err.message.includes('refusing to write through output symlink'));
    });

    runChallenge('CHAL-SAF-02', 'hasTraversal detects double URL-encoded traversals and backslashes', () => {
      assert.equal(hasTraversal('..%2f..%2fetc%2fpasswd'), true);
      assert.equal(hasTraversal('%252e%252e%252f'), true);
      assert.equal(hasTraversal('foo\\..\\bar'), true);
      assert.equal(hasTraversal('foo/..\\bar'), true);
      assert.equal(hasTraversal('valid/path/file.kt'), false);
    });

    runChallenge('CHAL-SAF-03', 'isInside correctly distinguishes canonical parent vs escaped child on macOS', () => {
      const parent = path.join(tempRoot, 'parent-box');
      const outside = path.join(tempRoot, 'outside-box');
      fs.mkdirSync(parent, { recursive: true });
      fs.mkdirSync(outside, { recursive: true });

      const symlinkOut = path.join(parent, 'leak');
      fs.symlinkSync(outside, symlinkOut);

      // Path pointing through symlink to outside
      const escapedChild = path.join(symlinkOut, 'secret.txt');
      assert.equal(isInside(parent, escapedChild), false);

      // Path inside parent
      const validChild = path.join(parent, 'valid.txt');
      assert.equal(isInside(parent, validChild), true);
    });

    runChallenge('CHAL-SAF-04', 'rejectDangerousRoot rejects / and homedir and accepts normal paths', () => {
      assert.throws(() => rejectDangerousRoot('/', 'root'), (err) => err instanceof InputError);
      assert.throws(() => rejectDangerousRoot(os.homedir(), 'home'), (err) => err instanceof InputError);
      assert.doesNotThrow(() => rejectDangerousRoot(tempRoot, 'temp'));
    });

  } finally {
    // Cleanup temporary workspace
    try {
      // Remove any worktrees attached to baseline
      const wtList = execFileSync('git', ['-C', baselineDir, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
      for (const line of wtList.split('\n')) {
        if (line.startsWith('worktree ') && !line.includes(baselineDir)) {
          const wtPath = line.replace('worktree ', '').trim();
          try {
            execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', wtPath]);
          } catch (_) {}
        }
      }
    } catch (_) {}
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n================================================================');
  console.log(`  EMPIRICAL CHALLENGE SUITE SUMMARY:`);
  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passedCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exitCode = 1;
  }
  return { results, passedCount, failedCount };
}

runAllChallenges().catch((err) => {
  console.error('Unhandled fatal error in challenge harness:', err);
  process.exit(1);
});
