'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const MARKER = '.ctc-workspace.json';

function hasTraversal(raw) {
  return String(raw).split(/[\\/]+/).includes('..');
}

function resolveExplicit(raw, label) {
  if (!raw || !String(raw).trim()) throw new InputError(`${label} is required`);
  if (hasTraversal(raw)) throw new InputError(`${label} must not contain parent traversal`);
  return path.resolve(String(raw));
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function canonicalPlannedPath(target) {
  const tail = [];
  let cursor = target;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    tail.unshift(path.basename(cursor));
    cursor = parent;
  }
  const canonical = fs.existsSync(cursor) ? fs.realpathSync(cursor) : cursor;
  return path.join(canonical, ...tail);
}

function rejectDangerousRoot(target, label) {
  const parsed = path.parse(target);
  if (target === parsed.root || target === os.homedir()) {
    throw new InputError(`${label} is a dangerous root`);
  }
}

function readWorkspace(workspaceRoot) {
  const markerPath = path.join(workspaceRoot, MARKER);
  let marker;
  try {
    if (fs.lstatSync(markerPath).isSymbolicLink()) throw new Error('marker is a symlink');
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

function atomicWriteNoFollow(target, data) {
  const existing = lstatIfPresent(target);
  if (existing && existing.isSymbolicLink()) throw new InputError(`refusing to write through output symlink: ${target}`);
  if (existing && !existing.isFile()) throw new InputError(`output must be a regular file: ${target}`);
  const directory = path.dirname(target);
  const temporary = path.join(directory, `.${path.basename(target)}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
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
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

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

module.exports = {
  BLOCKED: 2,
  INPUT_INVALID: 3,
  INFRASTRUCTURE: 4,
  MARKER,
  BlockedError,
  InputError,
  atomicWriteNoFollow,
  canonicalPlannedPath,
  isInside,
  readWorkspace,
  rejectDangerousRoot,
  resolveExplicit
};
