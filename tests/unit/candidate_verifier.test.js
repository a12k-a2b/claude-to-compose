/**
 * tests/unit/candidate_verifier.test.js
 *
 * Unit tests for Candidate Git Worktree Provenance, Ancestry, and Boundary Verification.
 * Requirement R1 (Milestone 1).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  verifyCandidateWorktree,
  verifyWorktreeDescendant,
  enforceImplementationBoundary,
  assertNoSourceSensitiveSymlinks,
  gitCommonDirectory,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');


function createTestGitWorkspace() {
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-cand-test-')));
  const baselineRoot = path.join(tempDir, 'baseline');
  fs.mkdirSync(baselineRoot, { recursive: true });

  execFileSync('git', ['-C', baselineRoot, 'init', '-q']);
  execFileSync('git', ['-C', baselineRoot, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', baselineRoot, 'config', 'user.name', 'Test']);

  const editorDir = path.join(baselineRoot, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const dataDir = path.join(baselineRoot, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditor.kt'), 'package com.claude.noteapp.ui.editor\n');
  fs.writeFileSync(path.join(dataDir, 'NoteDao.kt'), 'package com.claude.noteapp.data\n');
  fs.writeFileSync(path.join(baselineRoot, 'build.gradle.kts'), '// build\n');
  fs.writeFileSync(path.join(baselineRoot, 'settings.gradle.kts'), '// settings\n');
  fs.writeFileSync(path.join(baselineRoot, 'app/src/main/AndroidManifest.xml'), '<manifest/>\n');

  execFileSync('git', ['-C', baselineRoot, 'add', '.']);
  execFileSync('git', ['-C', baselineRoot, 'commit', '-qm', 'initial baseline']);
  const baselineCommit = execFileSync('git', ['-C', baselineRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  const candidateRoot = path.join(tempDir, 'candidate');
  execFileSync('git', ['-C', baselineRoot, 'worktree', 'add', '-b', 'candidate-branch', candidateRoot, 'HEAD']);

  const contract = {
    schemaVersion: '1.0.0',
    implementationBoundary: {
      allowedPaths: [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ],
      prohibitedChanges: ['Do not change data persistence'],
      verificationCommands: ['./gradlew test']
    }
  };

  return {
    tempDir,
    baselineRoot,
    candidateRoot,
    baselineCommit,
    contract,
    cleanup() {
      try {
        execFileSync('git', ['-C', baselineRoot, 'worktree', 'remove', '--force', candidateRoot]);
      } catch (_) {}
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  };
}

describe('Candidate Verifier Unit Tests: tests/unit/candidate_verifier.test.js', () => {
  let ws;

  beforeEach(() => {
    ws = createTestGitWorkspace();
  });

  afterEach(() => {
    if (ws) ws.cleanup();
  });

  it('[T01] rejects missing or empty candidate path', () => {
    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: '',
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof BlockedError && err.message.includes('--candidate is required'));

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: null,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof BlockedError && err.message.includes('--candidate is required'));
  });

  it('[T02] rejects candidate path containing parent traversal', () => {
    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: '../foo/bar',
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('parent traversal'));

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: 'candidate/../../escape',
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
  });

  it('[T03] rejects candidate that is a symbolic link directory', () => {
    const symCandidate = path.join(ws.tempDir, 'candidate-symlink');
    fs.symlinkSync(ws.candidateRoot, symCandidate);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: symCandidate,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('non-symlink directory'));
  });

  it('[T04] rejects candidate that is identical to baseline root', () => {
    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.baselineRoot,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('must differ from the immutable baseline'));
  });

  it('[T05] rejects dirty inspected baseline repository', () => {
    fs.appendFileSync(path.join(ws.baselineRoot, 'build.gradle.kts'), '// dirty change\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('clean committed inspected baseline'));
  });

  it('[T06] rejects forged candidate from unrelated git repo', () => {
    const forgedRepo = path.join(ws.tempDir, 'forged-repo');
    fs.mkdirSync(forgedRepo, { recursive: true });
    execFileSync('git', ['-C', forgedRepo, 'init', '-q']);
    execFileSync('git', ['-C', forgedRepo, 'config', 'user.email', 'forged@test.com']);
    execFileSync('git', ['-C', forgedRepo, 'config', 'user.name', 'Forged']);
    fs.writeFileSync(path.join(forgedRepo, 'forged.txt'), 'fake');
    execFileSync('git', ['-C', forgedRepo, 'add', '.']);
    execFileSync('git', ['-C', forgedRepo, 'commit', '-qm', 'forged commit']);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: forgedRepo,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('must be a worktree of the inspected baseline'));
  });

  it('[T07] rejects non-descendant orphan branch candidate', () => {
    execFileSync('git', ['-C', ws.candidateRoot, 'checkout', '--orphan', 'divergent-branch']);
    fs.writeFileSync(path.join(ws.candidateRoot, 'orphan.txt'), 'orphan content');
    execFileSync('git', ['-C', ws.candidateRoot, 'add', '.']);
    execFileSync('git', ['-C', ws.candidateRoot, 'commit', '-qm', 'orphan root commit']);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        baselineCommit: ws.baselineCommit
      });
    }, (err) => err instanceof InputError && err.message.includes('does not descend from the inspected baseline commit'));
  });

  it('[T08] rejects non-existent baseline commit in candidate', () => {
    const fakeSha = '0123456789abcdef0123456789abcdef01234567';
    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        baselineCommit: fakeSha
      });
    }, (err) => err instanceof InputError && err.message.includes('does not contain the inspected baseline commit'));
  });

  it('[T09] rejects tracked source-sensitive symlink in src/', () => {
    const symPath = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/Symlink.kt');
    fs.symlinkSync('/etc/passwd', symPath);
    execFileSync('git', ['-C', ws.candidateRoot, 'add', '.']);
    execFileSync('git', ['-C', ws.candidateRoot, 'commit', '-qm', 'add source symlink']);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('source-sensitive symlink'));
  });

  it('[T10] rejects untracked source-sensitive directory symlink', () => {
    const externalDir = path.join(ws.tempDir, 'external');
    fs.mkdirSync(externalDir, { recursive: true });
    const symDir = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/linkedDir');
    fs.symlinkSync(externalDir, symDir);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('source-sensitive symlink'));
  });

  it('[T11] rejects symlink targeting build.gradle or settings.gradle', () => {
    const symBuild = path.join(ws.candidateRoot, 'linked_build.gradle.kts');
    fs.symlinkSync(path.join(ws.candidateRoot, 'build.gradle.kts'), symBuild);

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('source-sensitive symlink'));
  });

  it('[T12] allows benign non-source symlinks outside source trees', () => {
    const docsDir = path.join(ws.candidateRoot, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'CONTRIBUTING.md'), '# Contributing');
    fs.symlinkSync(path.join(docsDir, 'CONTRIBUTING.md'), path.join(ws.candidateRoot, 'README.md'));

    assert.doesNotThrow(() => assertNoSourceSensitiveSymlinks(ws.candidateRoot, 'candidate worktree'));

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot
    });
    assert.equal(res.valid, true);
    assert.equal(res.status, 'PASS');
  });


  it('[T13] correctly derives tracked changed paths', () => {
    const file = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(file, '// modified in candidate\n');
    execFileSync('git', ['-C', ws.candidateRoot, 'add', '.']);
    execFileSync('git', ['-C', ws.candidateRoot, 'commit', '-qm', 'candidate modification']);

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.valid, true);
    assert.deepEqual(res.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt']);
  });

  it('[T14] correctly derives untracked changed paths', () => {
    const newFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NewComponent.kt');
    fs.writeFileSync(newFile, 'package com.claude.noteapp.ui.editor\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.valid, true);
    assert.deepEqual(res.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NewComponent.kt']);
  });

  it('[T15] detects and hashes ignored source additions', () => {
    const gitInfoExclude = path.join(ws.baselineRoot, '.git/info/exclude');
    fs.appendFileSync(gitInfoExclude, 'HiddenSource.kt\n');

    const ignoredFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/HiddenSource.kt');
    fs.writeFileSync(ignoredFile, 'package com.claude.noteapp.ui.editor\n// hidden\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.valid, true);
    assert.ok(res.changedPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor/HiddenSource.kt'));
  });

  it('[T16] ignores build and .gradle caches before src/', () => {
    const buildGenerated = path.join(ws.candidateRoot, 'app/build/generated/dummy.txt');
    fs.mkdirSync(path.dirname(buildGenerated), { recursive: true });
    fs.writeFileSync(buildGenerated, 'cache');

    const gitInfoExclude = path.join(ws.baselineRoot, '.git/info/exclude');
    fs.appendFileSync(gitInfoExclude, 'build/\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.valid, true);
    assert.ok(!res.changedPaths.includes('app/build/generated/dummy.txt'));
  });

  it('[T17] passes verification when all edits are within allowedPaths', () => {
    const file = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(file, '// within boundary\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.valid, true);
    assert.equal(res.status, 'PASS');
    assert.equal(res.violations.length, 0);
  });

  it('[T18] rejects edits outside allowedPaths boundary', () => {
    const dataFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/data/NoteDao.kt');
    fs.appendFileSync(dataFile, '// unauthorized modification\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
  });

  it('[T19] rejects newly created out-of-boundary files (Backdoor.kt)', () => {
    const backdoor = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/data/Backdoor.kt');
    fs.writeFileSync(backdoor, '// rogue file\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
  });

  it('[T20] rejects edits to AndroidManifest.xml outside boundary', () => {
    const manifest = path.join(ws.candidateRoot, 'app/src/main/AndroidManifest.xml');
    fs.appendFileSync(manifest, '<!-- hijacked -->\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: ws.contract
      });
    }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
  });

  it('[T21] computes deterministic sourceSnapshotSha256', () => {
    const file = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(file, '// snapshot hash test\n');

    const res1 = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    const res2 = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res1.sourceSnapshotSha256.length, 64);
    assert.equal(res1.sourceSnapshotSha256, res2.sourceSnapshotSha256);
  });

  it('[T22] computes workingTreeDiffSha256 for dirty candidate worktrees', () => {
    const file = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(file, '// uncommitted dirty change\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      contract: ws.contract
    });

    assert.equal(res.revision.dirty, true);
    assert.equal(typeof res.workingTreeDiffSha256, 'string');
    assert.equal(res.workingTreeDiffSha256.length, 64);
  });

  it('[T23] rejects broad or non-normalized contract allowedPaths', () => {
    const badContract1 = {
      schemaVersion: '1.0.0',
      implementationBoundary: {
        allowedPaths: ['app'] // too broad, lacks src and >=4 segments
      }
    };

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: badContract1
      });
    }, (err) => err instanceof InputError && err.message.includes('too broad or non-normalized'));

    const badContract2 = {
      schemaVersion: '1.0.0',
      implementationBoundary: {
        allowedPaths: ['app/src/main/../../escape']
      }
    };

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: badContract2
      });
    }, (err) => err instanceof InputError && err.message.includes('parent traversal'));

    const badContract3 = {
      schemaVersion: '1.0.0',
      implementationBoundary: {
        allowedPaths: ['app/src/main/java/**/*.kt']
      }
    };

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        contract: badContract3
      });
    }, (err) => err instanceof InputError && err.message.includes('glob wildcards'));
  });

  it('[T24] auto-discovers contract and enforces boundaries when candidate is a CTC worktree and contract option is omitted', () => {
    // Exclude .ctc-workspace.json in git exclude (as ctc agent worktree does)
    fs.appendFileSync(path.join(ws.baselineRoot, '.git/info/exclude'), '.ctc-workspace.json\n');

    // Write CTC workspace marker in candidate
    const marker = {
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: ws.baselineRoot,
      baselineRoot: ws.baselineRoot,
      candidateRoot: ws.candidateRoot,
      screenId: 'note_editor'
    };
    fs.writeFileSync(path.join(ws.candidateRoot, '.ctc-workspace.json'), JSON.stringify(marker, null, 2));

    // Modifying file within allowedPaths (ui/editor) passes with contract auto-discovered
    const editorFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(editorFile, '// auto-discovery valid modification\n');

    const passRes = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot,
      // contract and contractPath deliberately omitted
      screenId: 'note_editor'
    });
    assert.equal(passRes.valid, true);
    assert.equal(passRes.status, 'PASS');

    // Modifying file outside allowedPaths (data/NoteDao.kt) fails closed even though contract was omitted
    const dataFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/data/NoteDao.kt');
    fs.appendFileSync(dataFile, '// out of boundary\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot,
        // contract and contractPath deliberately omitted
        screenId: 'note_editor'
      });
    }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
  });

  it('[T25] auto-discovers contract from disk (retrofit-contract.json) when contract option is omitted', () => {
    fs.appendFileSync(path.join(ws.baselineRoot, '.git/info/exclude'), 'retrofit-contract.json\n');
    const diskContract = {
      schemaVersion: '1.0.0',
      id: 'contract_disk_screen',
      implementationBoundary: {
        allowedPaths: ['app/src/main/java/com/claude/noteapp/ui/editor'],
        prohibitedChanges: ['Do not edit persistence']
      }
    };
    fs.writeFileSync(path.join(ws.candidateRoot, 'retrofit-contract.json'), JSON.stringify(diskContract, null, 2));

    const editorFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditor.kt');
    fs.appendFileSync(editorFile, '// valid edit\n');

    const res = verifyCandidateWorktree({
      candidate: ws.candidateRoot,
      baselineRoot: ws.baselineRoot
    });
    assert.equal(res.valid, true);
    assert.equal(res.status, 'PASS');

    // Tampering outside boundary fails closed
    const outsideFile = path.join(ws.candidateRoot, 'app/src/main/java/com/claude/noteapp/data/NoteDao.kt');
    fs.appendFileSync(outsideFile, '// outside edit\n');

    assert.throws(() => {
      verifyCandidateWorktree({
        candidate: ws.candidateRoot,
        baselineRoot: ws.baselineRoot
      });
    }, (err) => err instanceof InputError && err.message.includes('outside the contract boundary'));
  });
});
