/**
 * src/agent/packet_generator.js
 *
 * Scoped Agent Implementation Packet Generator export shim.
 */

'use strict';

const packet = require('./packet');

module.exports = {
  generateImplementationPacket: packet.generateImplementationPacket,
  sanitizePath: packet.sanitizePath,
  SOL_OS_NEUTRAL_TOKENS: packet.SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS: packet.SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING: packet.MATERIAL3_COLOR_SCHEME_MAPPING
};
