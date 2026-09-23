/**
 * src/agent/safety.js
 *
 * Path Confinement, Atomic Writes, Traversal Prevention & Git Worktree Safety Subsystem.
 * F01 & F02: Candidate Git Worktree Isolation & Safety Subsystem (Milestone 1).
 */

'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MARKER = '.ctc-workspace.json';

const BLOCKED = 2;
const INPUT_INVALID = 3;
const INFRASTRUCTURE = 4;

const INSPECTION_FILES = Object.freeze(new Set([
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'AndroidManifest.xml',
  'gradle.properties'
]));

const SAFE_GIT_OPTIONS = Object.freeze([
  '-c', 'core.fsmonitor=false',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'diff.external=',
  '-c', 'core.pager=cat',
  '-c', 'pager.status=false',
  '-c', 'pager.diff=false',
  '-c', 'status.renames=false',
  '-c', 'diff.renames=false',
  '-c', 'status.showUntrackedFiles=all',
  '-c', 'core.quotepath=false'
]);

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
    this.exitCode = 3;
  }
}

class BlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedError';
    this.exitCode = 2;
  }
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(name)) delete environment[name];
  }
  for (const name of [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES'
  ]) delete environment[name];
  Object.assign(environment, {
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_EXTERNAL_DIFF: '',
    GIT_PAGER: 'cat'
  });
  return environment;
}

/**
 * Checks whether raw string contains directory traversal (..) or URL-encoded equivalents.
 * @param {string|any} raw
 * @returns {boolean}
 */
function hasTraversal(raw) {
  if (raw === null || raw === undefined) return false;
  const str = String(raw);
  if (str.split(/[\\/]+/).includes('..')) return true;

  let decoded = str;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }
  return decoded.split(/[\\/]+/).includes('..');
}

/**
 * Validates non-empty input without traversal, and resolves path.
 * @param {string} raw
 * @param {string} label
 * @returns {string} Absolute resolved path
 */
function resolveExplicit(raw, label) {
  if (!raw || !String(raw).trim()) throw new InputError(`${label} is required`);
  const str = String(raw).trim();
  if (str.includes('\0')) throw new InputError(`${label} contains invalid null byte`);
  if (hasTraversal(str)) throw new InputError(`${label} must not contain parent traversal`);
  return path.resolve(str);
}

/**
 * Resolves planned target paths where leaf files/directories may not yet exist.
 * Resolves the deepest existing parent directory to its canonical path via fs.realpathSync.
 * @param {string} target
 * @returns {string}
 */
function canonicalPlannedPath(target) {
  const tail = [];
  let cursor = path.resolve(String(target));
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  const canonical = fs.existsSync(cursor) ? fs.realpathSync(cursor) : cursor;
  return path.join(canonical, ...tail);
}

/**
 * Checks whether child is strictly inside parent.
 * Uses canonical path resolution to handle macOS /tmp -> /private/tmp symlinks
 * and strictly reject symlink escape attempts.
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function isInside(parent, child) {
  if (!parent || !child) return false;
  const p = path.resolve(String(parent));
  const c = path.resolve(String(child));

  try {
    const canonParent = canonicalPlannedPath(p);
    const canonChild = canonicalPlannedPath(c);
    const relCanon = path.relative(canonParent, canonChild);
    return relCanon !== '' && !relCanon.startsWith(`..${path.sep}`) && relCanon !== '..' && !path.isAbsolute(relCanon);
  } catch (_) {
    const relLexical = path.relative(p, c);
    return relLexical !== '' && !relLexical.startsWith(`..${path.sep}`) && relLexical !== '..' && !path.isAbsolute(relLexical);
  }
}

/**
 * Rejects root directory or user home directory targets.
 * @param {string} target
 * @param {string} label
 */
function rejectDangerousRoot(target, label) {
  if (!target) throw new InputError(`${label} is required`);
  const resolved = path.resolve(String(target));
  const parsed = path.parse(resolved);
  const homedir = os.homedir();

  if (resolved === parsed.root || resolved === homedir) {
    throw new InputError(`${label} is a dangerous root`);
  }

  try {
    if (fs.existsSync(resolved)) {
      const canonical = fs.realpathSync(resolved);
      const canonHome = fs.existsSync(homedir) ? fs.realpathSync(homedir) : homedir;
      const canonRoot = path.parse(canonical).root;
      if (canonical === canonRoot || canonical === canonHome) {
        throw new InputError(`${label} is a dangerous root`);
      }
    }
  } catch (_) {}
}

/**
 * Validates and reads workspace marker file (.ctc-workspace.json).
 * Throws InputError if missing, symlink, or invalid schema.
 * @param {string} workspaceRoot
 * @returns {object}
 */
function readWorkspace(workspaceRoot) {
  if (!workspaceRoot) throw new InputError('workspaceRoot is required');
  const markerPath = path.join(workspaceRoot, MARKER);
  let marker;
  try {
    if (fs.lstatSync(markerPath).isSymbolicLink()) {
      throw new Error('marker is a symlink');
    }
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (error) {
    throw new InputError(`workspace is not initialized: ${markerPath}`);
  }
  if (marker.kind !== 'ctc-workspace' || marker.version !== 1 || typeof marker.androidRoot !== 'string') {
    throw new InputError(`workspace marker is invalid: ${markerPath}`);
  }
  return marker;
}

function lstatIfPresent(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Writes file atomically using private temp file and O_NOFOLLOW.
 * Mode 0o600, fsyncSync before renameSync.
 * @param {string} target
 * @param {string|Buffer} data
 */
function atomicWriteNoFollow(target, data) {
  const existing = lstatIfPresent(target);
  if (existing && existing.isSymbolicLink()) {
    throw new InputError(`refusing to write through output symlink: ${target}`);
  }
  if (existing && !existing.isFile()) {
    throw new InputError(`output must be a regular file: ${target}`);
  }
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
  );
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0),
      0o600
    );
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch (_) {}
    }
    try {
      fs.unlinkSync(temporary);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function isSourceSensitivePath(relative) {
  const segments = String(relative).replace(/\\/g, '/').split('/');
  return segments.includes('src') || INSPECTION_FILES.has(segments[segments.length - 1]);
}

/**
 * Recursively asserts that repository or worktree contains no source-sensitive symbolic links.
 * Checks both symlink locations and symlink targets.
 * @param {string} root
 * @param {string} label
 */
function assertNoSourceSensitiveSymlinks(root, label = 'repository') {
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch (_) {
    canonicalRoot = path.resolve(root);
  }

  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(absolute);
      } catch (_) {
        continue;
      }
      const relative = path.relative(canonicalRoot, absolute).replace(/\\/g, '/');
      if (stat.isSymbolicLink()) {
        if (isSourceSensitivePath(relative)) {
          throw new InputError(`${label} contains a source-sensitive symlink: ${relative}`);
        }
        try {
          const target = fs.readlinkSync(absolute);
          const resolvedTarget = path.resolve(directory, target);
          const relTarget = path.relative(canonicalRoot, resolvedTarget).replace(/\\/g, '/');
          if (isSourceSensitivePath(target) || isSourceSensitivePath(relTarget)) {
            throw new InputError(`${label} contains a source-sensitive symlink: ${relative}`);
          }
        } catch (err) {
          if (err instanceof InputError) throw err;
        }
        continue;
      }
      if (stat.isDirectory()) {
        visit(absolute);
      }
    }
  }
  visit(canonicalRoot);
}

/**
 * Returns canonical Git common directory via git rev-parse --git-common-dir.
 * @param {string} root
 * @returns {string}
 */
function gitCommonDirectory(root) {
  let raw;
  try {
    raw = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    }).trim();
  } catch (_) {
    throw new InputError('path is not a Git worktree');
  }
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
  try {
    return fs.realpathSync(resolved);
  } catch (_) {
    throw new InputError('Git common directory cannot be resolved');
  }
}

/**
 * Derives changed paths (tracked diffs + untracked files) between candidate worktree and baselineCommit.
 * @param {string} candidateRoot
 * @param {string} baselineCommit
 * @returns {string[]}
 */
function gitChangedPaths(candidateRoot, baselineCommit) {
  if (!/^[a-f0-9]{40}$/.test(baselineCommit)) {
    throw new InputError('baseline commit must be a full Git revision');
  }
  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'cat-file', '-e', `${baselineCommit}^{commit}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    throw new InputError('candidate repository does not contain the inspected baseline commit');
  }
  try {
    execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'merge-base', '--is-ancestor', baselineCommit, 'HEAD'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnvironment()
    });
  } catch (_) {
    throw new InputError('candidate HEAD does not descend from the inspected baseline commit');
  }
  const tracked = execFileSync(
    'git',
    [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'diff', '--name-only', '-z', '--no-ext-diff', '--no-textconv', baselineCommit, '--'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment() }
  ).split('\0').filter(Boolean).map(p => p.replace(/\\/g, '/'));

  const untracked = execFileSync(
    'git',
    [...SAFE_GIT_OPTIONS, '-C', candidateRoot, 'ls-files', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment() }
  ).split('\0').filter(Boolean).map(p => p.replace(/\\/g, '/'));

  return [...new Set([...tracked, ...untracked])].sort();
}

/**
 * Scans ignored source files in worktree and computes SHA-256 for each.
 * @param {string} root
 * @returns {Array<{path: string, sha256: string}>}
 */
function gitIgnoredSourceEvidence(root) {
  const ignored = execFileSync(
    'git',
    [...SAFE_GIT_OPTIONS, '-C', root, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment() }
  ).split('\0').filter(Boolean).map(p => p.replace(/\\/g, '/'))
    .filter((relative) => {
      const segments = relative.split('/');
      const sourceIndex = segments.indexOf('src');
      const generatedIndex = segments.findIndex((segment) => segment === 'build' || segment === '.gradle');
      if (generatedIndex >= 0 && (sourceIndex < 0 || generatedIndex < sourceIndex)) return false;
      return sourceIndex >= 0 || INSPECTION_FILES.has(path.basename(relative));
    }).sort();

  return ignored.map((relative) => {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new InputError(`ignored source escapes candidate: ${relative}`);
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isFile()) {
      return {
        path: relative,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
      };
    }
    if (stat.isSymbolicLink()) {
      throw new InputError(`ignored source symlink is unsupported: ${relative}`);
    }
    throw new InputError(`unsupported ignored source file: ${relative}`);
  });
}

/**
 * Retrieves repository revision, dirty status, and workingTreeDiffSha256.
 * @param {string} root
 * @returns {{commit: string, dirty: boolean, workingTreeDiffSha256: string|null}}
 */
function gitMetadata(root) {
  try {
    const top = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
    }).trim();
    if (fs.realpathSync(top) !== fs.realpathSync(root)) {
      throw new InputError('the Android root must be the Git repository root');
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new BlockedError('requires an initialized Git repository at the Android root');
  }

  let commit;
  try {
    commit = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
    }).trim();
  } catch (_) {
    throw new BlockedError('requires a repository with a committed HEAD revision');
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new BlockedError('Git did not return a full commit revision');

  const status = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
  });
  const dirty = status.length > 0;
  let workingTreeDiffSha256 = null;
  if (dirty) {
    const trackedDiff = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--'], {
      stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
    });
    const untracked = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment()
    }).split('\0').filter(Boolean).sort();
    const untrackedEvidence = untracked.map((relative) => {
      const abs = path.resolve(root, relative);
      const stat = fs.lstatSync(abs);
      let content = Buffer.alloc(0);
      if (stat.isFile()) content = Buffer.concat([Buffer.from('file\0'), fs.readFileSync(abs)]);
      else if (stat.isSymbolicLink()) content = Buffer.concat([Buffer.from('symlink\0'), fs.readlinkSync(abs, { encoding: 'buffer' })]);
      return Buffer.concat([Buffer.from(`${relative.replace(/\\/g, '/')}\0`), content, Buffer.from('\0')]);
    });
    workingTreeDiffSha256 = crypto.createHash('sha256').update(Buffer.concat([trackedDiff, Buffer.from('\0'), ...untrackedEvidence])).digest('hex');
  }

  return { commit, dirty, workingTreeDiffSha256 };
}

module.exports = {
  BLOCKED,
  INPUT_INVALID,
  INFRASTRUCTURE,
  MARKER,
  INSPECTION_FILES,
  SAFE_GIT_OPTIONS,
  InputError,
  BlockedError,
  gitEnvironment,
  hasTraversal,
  resolveExplicit,
  canonicalPlannedPath,
  isInside,
  rejectDangerousRoot,
  readWorkspace,
  atomicWriteNoFollow,
  isSourceSensitivePath,
  assertNoSourceSensitiveSymlinks,
  gitCommonDirectory,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  gitMetadata
};
