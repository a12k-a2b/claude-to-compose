/**
 * tests/unit/safety.test.js
 *
 * Comprehensive Unit Test Suite for Path Confinement & Safety Subsystem (Feature F01 & F02).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  hasTraversal,
  resolveExplicit,
  canonicalPlannedPath,
  isInside,
  rejectDangerousRoot,
  readWorkspace,
  atomicWriteNoFollow,
  assertNoSourceSensitiveSymlinks,
  gitCommonDirectory,
  gitChangedPaths,
  gitMetadata,
  InputError,
  BlockedError,
  BLOCKED,
  INPUT_INVALID,
  INFRASTRUCTURE,
  MARKER
} = require('../../src/agent/safety');

describe('Safety Subsystem: tests/unit/safety.test.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-safety-test-')));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Suite 1: hasTraversal Traversal Detection', () => {
    it('returns false for standard relative paths', () => {
      assert.equal(hasTraversal('app/src/main'), false);
      assert.equal(hasTraversal('file.kt'), false);
      assert.equal(hasTraversal('sub/dir/nested/item.json'), false);
    });

    it('returns false for dotfiles', () => {
      assert.equal(hasTraversal('.ctc-workspace.json'), false);
      assert.equal(hasTraversal('.gitignore'), false);
      assert.equal(hasTraversal('dir/.env'), false);
    });

    it('returns true for parent traversal at root', () => {
      assert.equal(hasTraversal('..'), true);
      assert.equal(hasTraversal('../'), true);
      assert.equal(hasTraversal('..\\foo'), true);
      assert.equal(hasTraversal('../foo/bar'), true);
    });

    it('returns true for embedded parent traversal', () => {
      assert.equal(hasTraversal('foo/../bar'), true);
      assert.equal(hasTraversal('foo\\..\\bar'), true);
      assert.equal(hasTraversal('a/b/../../c'), true);
    });

    it('returns true for trailing parent traversal', () => {
      assert.equal(hasTraversal('foo/bar/..'), true);
      assert.equal(hasTraversal('foo\\bar\\..'), true);
    });

    it('returns true for URL-encoded traversal', () => {
      assert.equal(hasTraversal('%2e%2e/secret'), true);
      assert.equal(hasTraversal('foo/%2E%2E/bar'), true);
      assert.equal(hasTraversal('foo/%252e%252e/bar'), true);
    });

    it('returns false for null, undefined, and empty string', () => {
      assert.equal(hasTraversal(null), false);
      assert.equal(hasTraversal(undefined), false);
      assert.equal(hasTraversal(''), false);
    });
  });

  describe('Suite 2: resolveExplicit Validation & Resolution', () => {
    it('resolves relative path to clean absolute path', () => {
      const res = resolveExplicit('test/path', 'test label');
      assert.equal(res, path.resolve('test/path'));
      assert.equal(path.isAbsolute(res), true);
    });

    it('preserves valid absolute path', () => {
      const abs = path.join(tempDir, 'file.txt');
      assert.equal(resolveExplicit(abs, 'test label'), abs);
    });

    it('throws InputError on empty string or null', () => {
      assert.throws(() => resolveExplicit('', 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('field is required');
      });
      assert.throws(() => resolveExplicit(null, 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3;
      });
    });

    it('throws InputError on whitespace-only input', () => {
      assert.throws(() => resolveExplicit('   ', 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('field is required');
      });
    });

    it('throws InputError on paths with parent traversal', () => {
      assert.throws(() => resolveExplicit('foo/../bar', 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('must not contain parent traversal');
      });
      assert.throws(() => resolveExplicit('%2e%2e/secret', 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('must not contain parent traversal');
      });
    });

    it('throws InputError on null byte injection', () => {
      assert.throws(() => resolveExplicit('foo\0bar', 'field'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('null byte');
      });
    });
  });

  describe('Suite 3: rejectDangerousRoot Root Confinement', () => {
    it('throws InputError when targeting filesystem root', () => {
      assert.throws(() => rejectDangerousRoot('/', 'rootPath'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('dangerous root');
      });
    });

    it('throws InputError when targeting user home directory', () => {
      assert.throws(() => rejectDangerousRoot(os.homedir(), 'homePath'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('dangerous root');
      });
    });

    it('passes cleanly for a valid project subdirectory', () => {
      assert.doesNotThrow(() => rejectDangerousRoot(tempDir, 'projectDir'));
    });

    it('throws InputError when argument is empty or missing', () => {
      assert.throws(() => rejectDangerousRoot('', 'path'), (err) => {
        return err instanceof InputError && err.exitCode === 3;
      });
      assert.throws(() => rejectDangerousRoot(null, 'path'), (err) => {
        return err instanceof InputError && err.exitCode === 3;
      });
    });
  });

  describe('Suite 4: canonicalPlannedPath Canonicalization', () => {
    it('returns canonical realpath for existing file and directory', () => {
      const file = path.join(tempDir, 'exists.txt');
      fs.writeFileSync(file, 'hello');
      const canonical = canonicalPlannedPath(file);
      assert.equal(canonical, fs.realpathSync(file));
    });

    it('resolves existing parent and preserves planned non-existent leaf filename', () => {
      const nonExistent = path.join(tempDir, 'planned.json');
      const canonical = canonicalPlannedPath(nonExistent);
      assert.equal(canonical, path.join(fs.realpathSync(tempDir), 'planned.json'));
    });

    it('resolves deeply nested non-existent path', () => {
      const deepPlanned = path.join(tempDir, 'deep/sub/file.txt');
      const canonical = canonicalPlannedPath(deepPlanned);
      assert.equal(canonical, path.join(fs.realpathSync(tempDir), 'deep', 'sub', 'file.txt'));
    });

    it('resolves symlinks in existing path components to real destination', () => {
      const targetDir = path.join(tempDir, 'real-target');
      fs.mkdirSync(targetDir);
      const symlinkDir = path.join(tempDir, 'symlink-dir');
      fs.symlinkSync(targetDir, symlinkDir);

      const planned = path.join(symlinkDir, 'leaf.json');
      const canonical = canonicalPlannedPath(planned);
      assert.equal(canonical, path.join(fs.realpathSync(targetDir), 'leaf.json'));
    });
  });

  describe('Suite 5: isInside Strict Containment & macOS Compatibility', () => {
    it('returns true for directly nested child', () => {
      const child = path.join(tempDir, 'child.txt');
      assert.equal(isInside(tempDir, child), true);
    });

    it('returns true for deeply nested child', () => {
      const child = path.join(tempDir, 'a', 'b', 'c.json');
      assert.equal(isInside(tempDir, child), true);
    });

    it('returns false when parent and child are identical', () => {
      assert.equal(isInside(tempDir, tempDir), false);
    });

    it('returns false when child attempts parent escape', () => {
      const child = path.join(tempDir, '..', 'sibling');
      assert.equal(isInside(tempDir, child), false);
    });

    it('returns false when child is unrelated path', () => {
      assert.equal(isInside(tempDir, '/etc/passwd'), false);
    });

    it('macOS /tmp and /private/tmp disparity compatibility', () => {
      // In macOS, /tmp is symlink to /private/tmp
      if (fs.existsSync('/tmp') && fs.existsSync('/private/tmp')) {
        const testSub = path.join('/tmp', `ctc-test-${Date.now()}`);
        fs.mkdirSync(testSub, { recursive: true });
        try {
          const canonSub = fs.realpathSync(testSub);
          const childInCanon = path.join(canonSub, 'file.txt');
          const childInTmp = path.join(testSub, 'file.txt');

          assert.equal(isInside(testSub, childInCanon), true);
          assert.equal(isInside(canonSub, childInTmp), true);
        } finally {
          fs.rmSync(testSub, { recursive: true, force: true });
        }
      }
    });

    it('symlink escape rejection: returns false when child traverses symlink pointing outside parent', () => {
      const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-outside-')));
      try {
        const symlinkInParent = path.join(tempDir, 'outside-link');
        fs.symlinkSync(outsideDir, symlinkInParent);

        const escapedChild = path.join(symlinkInParent, 'file.txt');
        assert.equal(isInside(tempDir, escapedChild), false);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('returns false for missing or null arguments', () => {
      assert.equal(isInside(null, tempDir), false);
      assert.equal(isInside(tempDir, null), false);
      assert.equal(isInside('', ''), false);
    });
  });

  describe('Suite 6: readWorkspace Marker Verification', () => {
    it('successfully parses valid .ctc-workspace.json', () => {
      const markerData = {
        kind: 'ctc-workspace',
        version: 1,
        androidRoot: '/path/to/android'
      };
      fs.writeFileSync(path.join(tempDir, MARKER), JSON.stringify(markerData));
      const parsed = readWorkspace(tempDir);
      assert.equal(parsed.kind, 'ctc-workspace');
      assert.equal(parsed.version, 1);
      assert.equal(parsed.androidRoot, '/path/to/android');
    });

    it('throws InputError if marker file does not exist', () => {
      assert.throws(() => readWorkspace(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('workspace is not initialized');
      });
    });

    it('throws InputError if marker file is a symbolic link', () => {
      const realMarker = path.join(tempDir, 'real-marker.json');
      fs.writeFileSync(realMarker, JSON.stringify({ kind: 'ctc-workspace', version: 1, androidRoot: '.' }));
      fs.symlinkSync(realMarker, path.join(tempDir, MARKER));

      assert.throws(() => readWorkspace(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('workspace is not initialized');
      });
    });

    it('throws InputError if marker contains invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, MARKER), '{ invalid json');
      assert.throws(() => readWorkspace(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3;
      });
    });

    it('throws InputError if marker JSON is missing kind, version, or androidRoot', () => {
      fs.writeFileSync(path.join(tempDir, MARKER), JSON.stringify({ kind: 'other', version: 1, androidRoot: '.' }));
      assert.throws(() => readWorkspace(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('workspace marker is invalid');
      });

      fs.writeFileSync(path.join(tempDir, MARKER), JSON.stringify({ kind: 'ctc-workspace', version: 2, androidRoot: '.' }));
      assert.throws(() => readWorkspace(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('workspace marker is invalid');
      });
    });
  });

  describe('Suite 7: atomicWriteNoFollow Atomic Confinement', () => {
    it('successfully writes file atomically with correct contents', () => {
      const target = path.join(tempDir, 'output.txt');
      atomicWriteNoFollow(target, 'hello atomic world');
      assert.equal(fs.readFileSync(target, 'utf8'), 'hello atomic world');
    });

    it('verifies written file mode is 0o600', () => {
      const target = path.join(tempDir, 'permissions.txt');
      atomicWriteNoFollow(target, 'sensitive data');
      const stat = fs.statSync(target);
      // Check user read/write permissions
      assert.equal((stat.mode & 0o777), 0o600);
    });

    it('cleans up temporary .tmp-* file upon completion', () => {
      const target = path.join(tempDir, 'cleanup.txt');
      atomicWriteNoFollow(target, 'clean');
      const remainingFiles = fs.readdirSync(tempDir);
      const tmpFiles = remainingFiles.filter(f => f.startsWith('.cleanup.txt.tmp-'));
      assert.equal(tmpFiles.length, 0);
    });

    it('refuses to write through existing symbolic link', () => {
      const realTarget = path.join(tempDir, 'real.txt');
      fs.writeFileSync(realTarget, 'original');
      const symlinkFile = path.join(tempDir, 'sym.txt');
      fs.symlinkSync(realTarget, symlinkFile);

      assert.throws(() => atomicWriteNoFollow(symlinkFile, 'injected'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('refusing to write through output symlink');
      });
      assert.equal(fs.readFileSync(realTarget, 'utf8'), 'original');
    });

    it('refuses to overwrite directory', () => {
      const dirTarget = path.join(tempDir, 'sub-dir');
      fs.mkdirSync(dirTarget);

      assert.throws(() => atomicWriteNoFollow(dirTarget, 'data'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('output must be a regular file');
      });
    });

    it('handles concurrent atomic writes without filename collision', () => {
      const target = path.join(tempDir, 'concurrent.txt');
      for (let i = 0; i < 10; i++) {
        atomicWriteNoFollow(target, `content ${i}`);
      }
      assert.match(fs.readFileSync(target, 'utf8'), /^content \d+$/);
    });
  });

  describe('Suite 8: InputError & BlockedError Error Subclasses', () => {
    it('InputError has name === "InputError" and exitCode === 3', () => {
      const err = new InputError('bad input');
      assert.equal(err.name, 'InputError');
      assert.equal(err.exitCode, 3);
      assert.equal(err instanceof Error, true);
    });

    it('BlockedError has name === "BlockedError" and exitCode === 2', () => {
      const err = new BlockedError('blocked resource');
      assert.equal(err.name, 'BlockedError');
      assert.equal(err.exitCode, 2);
      assert.equal(err instanceof Error, true);
    });

    it('Constants BLOCKED, INPUT_INVALID, INFRASTRUCTURE match standard exit codes', () => {
      assert.equal(BLOCKED, 2);
      assert.equal(INPUT_INVALID, 3);
      assert.equal(INFRASTRUCTURE, 4);
    });
  });

  describe('Suite 9: assertNoSourceSensitiveSymlinks Symlink Linter', () => {
    it('passes on clean repository tree without symlinks', () => {
      const srcDir = path.join(tempDir, 'app/src/main/java');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'App.kt'), '// code');
      assert.doesNotThrow(() => assertNoSourceSensitiveSymlinks(tempDir));
    });

    it('passes on benign non-source symlinks outside source trees', () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'guide.md'), '# Guide');
      fs.symlinkSync(path.join(docsDir, 'guide.md'), path.join(tempDir, 'README.md'));

      assert.doesNotThrow(() => assertNoSourceSensitiveSymlinks(tempDir));
    });

    it('throws InputError when symlink exists in src/', () => {
      const srcDir = path.join(tempDir, 'app/src/main/java');
      fs.mkdirSync(srcDir, { recursive: true });
      const outside = path.join(tempDir, 'outside.txt');
      fs.writeFileSync(outside, 'outside');
      fs.symlinkSync(outside, path.join(srcDir, 'Linked.kt'));

      assert.throws(() => assertNoSourceSensitiveSymlinks(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('source-sensitive symlink');
      });
    });

    it('throws InputError when symlink targets a source directory (app/src)', () => {
      const srcDir = path.join(tempDir, 'app/src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.symlinkSync(srcDir, path.join(tempDir, 'sym_src'));

      assert.throws(() => assertNoSourceSensitiveSymlinks(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('source-sensitive symlink');
      });
    });

    it('throws InputError when symlink targets build.gradle or AndroidManifest.xml', () => {
      const buildGradle = path.join(tempDir, 'app/build.gradle.kts');
      fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
      fs.writeFileSync(buildGradle, '// gradle');
      fs.symlinkSync(buildGradle, path.join(tempDir, 'linked_gradle.kts'));

      assert.throws(() => assertNoSourceSensitiveSymlinks(tempDir), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('source-sensitive symlink');
      });
    });

    it('ignores .git directory symlinks', () => {
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      const target = path.join(tempDir, 'some-file');
      fs.writeFileSync(target, 'data');
      fs.symlinkSync(target, path.join(gitDir, 'git-symlink'));

      assert.doesNotThrow(() => assertNoSourceSensitiveSymlinks(tempDir));
    });
  });

  describe('Suite 10: gitCommonDirectory & gitChangedPaths Worktree Verifiers', () => {
    let repoDir;

    beforeEach(() => {
      repoDir = path.join(tempDir, 'test-repo');
      fs.mkdirSync(repoDir, { recursive: true });
      execFileSync('git', ['init', '-q'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, 'init.txt'), 'initial');
      execFileSync('git', ['add', '.'], { cwd: repoDir });
      execFileSync('git', ['commit', '-qm', 'initial commit'], { cwd: repoDir });
    });

    it('gitCommonDirectory returns canonical git common dir for repository', () => {
      const common = gitCommonDirectory(repoDir);
      assert.equal(typeof common, 'string');
      assert.equal(common, fs.realpathSync(path.join(repoDir, '.git')));
    });

    it('gitCommonDirectory throws InputError for non-git directory', () => {
      const nonGit = path.join(tempDir, 'non-git');
      fs.mkdirSync(nonGit, { recursive: true });
      assert.throws(() => gitCommonDirectory(nonGit), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('not a Git worktree');
      });
    });

    it('gitChangedPaths identifies modified and untracked files relative to baseline', () => {
      const baselineCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
      fs.writeFileSync(path.join(repoDir, 'init.txt'), 'modified');
      fs.writeFileSync(path.join(repoDir, 'new.txt'), 'untracked');

      const changed = gitChangedPaths(repoDir, baselineCommit);
      assert.deepEqual(changed, ['init.txt', 'new.txt']);
    });

    it('gitChangedPaths throws InputError on invalid or non-existent baseline commit hash', () => {
      assert.throws(() => gitChangedPaths(repoDir, 'invalid-hash'), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('full Git revision');
      });

      const fakeCommit = '0123456789abcdef0123456789abcdef01234567';
      assert.throws(() => gitChangedPaths(repoDir, fakeCommit), (err) => {
        return err instanceof InputError && err.exitCode === 3 && err.message.includes('does not contain the inspected baseline commit');
      });
    });
  });
});
