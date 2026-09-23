/**
 * src/agent/index.js
 *
 * Unified Barrel Export for the Scoped Agent Implementation Packet Generator (Feature 14).
 */

'use strict';

const packet = require('./packet');
const boundary = require('./boundary_enforcer');
const markdown = require('./markdown_formatter');
const safety = require('./safety');
const worktree = require('./worktree');
const harnesses = require('./harnesses');

module.exports = {
  generateImplementationPacket: packet.generateImplementationPacket,
  adaptContractToMigrationPlan: packet.adaptContractToMigrationPlan,
  sanitizePath: boundary.sanitizePath,
  formatAgentPacketMarkdown: markdown.formatAgentPacketMarkdown,
  SOL_OS_NEUTRAL_TOKENS: packet.SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS: packet.SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING: packet.MATERIAL3_COLOR_SCHEME_MAPPING,

  // Safety Subsystem Exports (Feature 01 & 02)
  atomicWriteNoFollow: safety.atomicWriteNoFollow,
  hasTraversal: safety.hasTraversal,
  resolveExplicit: safety.resolveExplicit,
  isInside: safety.isInside,
  canonicalPlannedPath: safety.canonicalPlannedPath,
  rejectDangerousRoot: safety.rejectDangerousRoot,
  readWorkspace: safety.readWorkspace,
  assertNoSourceSensitiveSymlinks: safety.assertNoSourceSensitiveSymlinks,
  gitCommonDirectory: safety.gitCommonDirectory,
  gitChangedPaths: safety.gitChangedPaths,
  gitIgnoredSourceEvidence: safety.gitIgnoredSourceEvidence,
  gitMetadata: safety.gitMetadata,
  InputError: safety.InputError,
  BlockedError: safety.BlockedError,
  BLOCKED: safety.BLOCKED,
  INPUT_INVALID: safety.INPUT_INVALID,
  INFRASTRUCTURE: safety.INFRASTRUCTURE,
  MARKER: safety.MARKER,
  INSPECTION_FILES: safety.INSPECTION_FILES,

  // Worktree Subsystem Exports (Feature 07, 08, 09)
  createAgentWorktree: worktree.createAgentWorktree,
  removeAgentWorktree: worktree.removeAgentWorktree,
  validateWorktreeOptions: worktree.validateWorktreeOptions,
  getRegisteredWorktrees: worktree.getRegisteredWorktrees,
  branchExists: worktree.branchExists,

  // Coding Agent Harness Exports (Feature 10, 11, 12, 13)
  HARNESS_EXCLUDE_PATTERNS: harnesses.HARNESS_EXCLUDE_PATTERNS,
  DEFAULT_FORBIDDEN_PATHS: harnesses.DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_VERIFICATION_COMMANDS: harnesses.DEFAULT_VERIFICATION_COMMANDS,
  extractHarnessOptions: harnesses.extractHarnessOptions,
  generateCursorRules: harnesses.generateCursorRules,
  generateClaudeCodeHarness: harnesses.generateClaudeCodeHarness,
  generateCodexSpec: harnesses.generateCodexSpec,
  generateAntigravitySkill: harnesses.generateAntigravitySkill,
  scaffoldAllHarnesses: harnesses.scaffoldAllHarnesses
};

