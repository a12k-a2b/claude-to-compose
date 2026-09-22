'use strict';

/**
 * src/profiles/manager.js
 *
 * Hardware Profile Manager.
 * Manages profile loading, lookup, validation, listing, and filesystem export.
 */

const fs = require('fs');
const path = require('path');
const { validateProfileAgainstRules, FORBIDDEN_EPD_PATTERNS } = require('./validator');

const DEFAULT_PROFILE_ID = 'daylight-dc1';
const PROFILES_DIR = __dirname;
const DC1_PROFILE_PATH = path.join(PROFILES_DIR, 'daylight-dc1.json');

const BUILTIN_PROFILES = Object.freeze({
  'daylight-dc1': DC1_PROFILE_PATH
});

/**
 * Loads a profile by ID (e.g. 'daylight-dc1') or by file path.
 * Validates integrity and returns the parsed profile object.
 * @param {string} profileNameOrPath
 * @returns {object} Parsed and validated profile
 */
function loadProfile(profileNameOrPath = DEFAULT_PROFILE_ID) {
  if (!profileNameOrPath || typeof profileNameOrPath !== 'string') {
    throw new TypeError(`Expected profile string, got ${typeof profileNameOrPath}`);
  }

  let resolvedPath;
  if (BUILTIN_PROFILES[profileNameOrPath]) {
    resolvedPath = BUILTIN_PROFILES[profileNameOrPath];
  } else if (path.isAbsolute(profileNameOrPath)) {
    resolvedPath = profileNameOrPath;
  } else {
    // Check if it exists in profiles dir or cwd
    const inProfilesDir = path.join(PROFILES_DIR, profileNameOrPath.endsWith('.json') ? profileNameOrPath : `${profileNameOrPath}.json`);
    const inCwd = path.resolve(process.cwd(), profileNameOrPath);
    if (fs.existsSync(inProfilesDir)) {
      resolvedPath = inProfilesDir;
    } else if (fs.existsSync(inCwd)) {
      resolvedPath = inCwd;
    } else {
      throw new Error(`Profile not found: "${profileNameOrPath}". Available built-in profiles: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
    }
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Profile file does not exist: "${resolvedPath}"`);
  }

  let rawContent;
  try {
    rawContent = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read profile file "${resolvedPath}": ${err.message}`);
  }

  let profile;
  try {
    profile = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`Malformed JSON in profile "${resolvedPath}": ${err.message}`);
  }

  const validation = validateProfile(profile);
  if (!validation.valid) {
    throw new Error(`Invalid profile "${profileNameOrPath}":\n  - ${validation.issues.join('\n  - ')}`);
  }

  return profile;
}

/**
 * Fast synchronous lookup of built-in profile.
 */
function getProfile(profileName = DEFAULT_PROFILE_ID) {
  return loadProfile(profileName);
}

/**
 * Lists available profiles with summary metadata.
 */
function listProfiles() {
  return Object.keys(BUILTIN_PROFILES).map((id) => {
    const p = loadProfile(id);
    return {
      id: p.id,
      name: p.name,
      technology: p.display ? p.display.technology : 'Unknown',
      dimensions: p.display ? `${p.display.logicalWidth}x${p.display.logicalHeight}` : 'Unknown',
      refreshRate: p.display && p.display.refreshRateHz ? `${p.display.refreshRateHz.min}-${p.display.refreshRateHz.max}Hz` : 'Unknown',
      builtIn: true
    };
  });
}

/**
 * Validates a profile object against DC1 hardware invariants.
 */
function validateProfile(profile) {
  return validateProfileAgainstRules(profile);
}

/**
 * Exports a profile to a specified destination path.
 * @param {string} profileName Built-in profile ID or file path
 * @param {string|null} outputPath Destination file path
 * @param {object} options Options { force: boolean, indent: number }
 * @returns {object} Export summary receipt
 */
function exportProfile(profileName = DEFAULT_PROFILE_ID, outputPath = null, options = {}) {
  const profile = loadProfile(profileName);
  const targetPath = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : path.resolve(process.cwd(), `${profile.id}.json`);

  if (fs.existsSync(targetPath) && !options.force) {
    throw new Error(`Target file already exists: "${targetPath}". Use --force to overwrite.`);
  }

  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const indent = options.indent !== undefined ? options.indent : 2;
  const jsonString = JSON.stringify(profile, null, indent) + '\n';
  fs.writeFileSync(targetPath, jsonString, 'utf8');

  return {
    success: true,
    profileId: profile.id,
    version: profile.schemaVersion || '2.0.0',
    outputPath: targetPath,
    sizeBytes: Buffer.byteLength(jsonString, 'utf8'),
    exportedAt: new Date().toISOString()
  };
}

module.exports = {
  loadProfile,
  getProfile,
  listProfiles,
  validateProfile,
  exportProfile,
  DEFAULT_PROFILE_ID,
  BUILTIN_PROFILES,
  FORBIDDEN_EPD_PATTERNS
};
