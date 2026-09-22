'use strict';

/**
 * src/profiles/index.js
 *
 * Public API for Daylight Hardware Profiles.
 */

const {
  loadProfile,
  getProfile,
  listProfiles,
  validateProfile,
  exportProfile,
  DEFAULT_PROFILE_ID,
  BUILTIN_PROFILES,
  FORBIDDEN_EPD_PATTERNS
} = require('./manager');

const { validateProfileAgainstRules } = require('./validator');

module.exports = {
  loadProfile,
  getProfile,
  listProfiles,
  validateProfile,
  validateProfileAgainstRules,
  exportProfile,
  DEFAULT_PROFILE_ID,
  BUILTIN_PROFILES,
  FORBIDDEN_EPD_PATTERNS
};
