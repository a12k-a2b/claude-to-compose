/**
 * src/agent/index.js
 *
 * Unified Barrel Export for the Scoped Agent Implementation Packet Generator (Feature 14).
 */

'use strict';

const packet = require('./packet');
const boundary = require('./boundary_enforcer');
const markdown = require('./markdown_formatter');

module.exports = {
  generateImplementationPacket: packet.generateImplementationPacket,
  sanitizePath: boundary.sanitizePath,
  formatAgentPacketMarkdown: markdown.formatAgentPacketMarkdown,
  SOL_OS_NEUTRAL_TOKENS: packet.SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS: packet.SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING: packet.MATERIAL3_COLOR_SCHEME_MAPPING
};
