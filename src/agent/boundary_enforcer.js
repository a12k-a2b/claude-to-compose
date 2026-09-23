/**
 * src/agent/boundary_enforcer.js
 *
 * Boundary Enforcement & Path Sanitization for Claude to Compose (ctc) v2.
 *
 * Defends against path traversal attacks and validates permitted modification scopes.
 */

'use strict';

const path = require('path');
const { hasTraversal } = require('./safety');

/**
 * Sanitizes a file or directory path.
 * Throws an Error matching /traversal|invalid path/i if directory traversal (..)
 * or illegal characters are detected.
 *
 * @param {string} filePath File or glob path to sanitize
 * @returns {string} Normalized clean path
 * @throws {Error} If path traversal or invalid path is detected
 */
function sanitizePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  const raw = filePath.trim();

  // Null byte injection check
  if (raw.includes('\0')) {
    throw new Error('Invalid path: null byte detected in path string');
  }

  // Path traversal check: reject '..' segment anywhere
  // Decode URI components to catch URL-encoded traversal (%2e%2e, %2E%2E, etc.)
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }

  const normalizedSlashes = raw.replace(/\\/g, '/');
  const decodedSlashes = decoded.replace(/\\/g, '/');
  const segments = normalizedSlashes.split('/');
  const decodedSegments = decodedSlashes.split('/');

  if (
    hasTraversal(raw) ||
    segments.includes('..') ||
    normalizedSlashes.includes('../') ||
    normalizedSlashes.includes('/..') ||
    decodedSegments.includes('..') ||
    decodedSlashes.includes('../') ||
    decodedSlashes.includes('/..') ||
    decodedSlashes === '..' ||
    /(?:^|\/|\\)(?:\.\.|%2e%2e)/i.test(raw)
  ) {
    throw new Error(`Path traversal detected: path "${raw}" contains illegal parent traversal components (..)`);
  }

  // Reject protected system directory paths explicitly
  if (normalizedSlashes.startsWith('/etc') || normalizedSlashes.startsWith('/var') || normalizedSlashes.startsWith('/usr')) {
    throw new Error(`Invalid path: attempt to access protected system directory "${raw}"`);
  }

  // Reject arbitrary rooted absolute paths (Unix absolute or Windows drive letters) outside workspace
  if (
    normalizedSlashes.startsWith('/') ||
    path.isAbsolute(raw) ||
    path.isAbsolute(normalizedSlashes) ||
    /^[a-zA-Z]:[\\\/]/.test(raw)
  ) {
    throw new Error(`Invalid path: absolute path "${raw}" is forbidden. Modification paths must be relative to project workspace.`);
  }

  return normalizedSlashes;
}

module.exports = {
  sanitizePath
};
