'use strict';

/**
 * tests/e2e/tier1_features/f14_agent_packet.test.js
 * Feature 14: Agent Implementation Packet Generator (`ctc agent packet`)
 */

module.exports = {
  name: 'Feature 14: Agent Implementation Packet Generator (ctc agent packet)',
  tests: [
    {
      id: 'F14-T1',
      name: 'Agent packet module exists and exports generateImplementationPacket API',
      fn(t) {
        t.checkComponent('Agent Packet Generator Module', 'M3', () => {
          t.checkFileExists('src/agent/packet.js', 'M3');
          const packet = require('../../../src/agent/packet');
          t.assert(typeof packet.generateImplementationPacket === 'function');
        });
      }
    },
    {
      id: 'F14-T2',
      name: 'Agent packet emits Markdown format (implementation-packet.md) with scoped boundaries',
      fn(t) {
        t.checkComponent('Markdown Packet Generation', 'M3', () => {
          const packet = require('../../../src/agent/packet');
          const output = packet.generateImplementationPacket({
            screenId: 'note_editor',
            migrationPlan: { boundaries: { allowedModificationPaths: ['ui/editor/**'], forbiddenPaths: ['data/**'] } },
            format: 'markdown'
          });
          t.assert(output.markdown && typeof output.markdown === 'string');
          t.assert(output.markdown.includes('FORBIDDEN'));
        });
      }
    },
    {
      id: 'F14-T3',
      name: 'Agent packet emits machine-readable JSON format (implementation-packet.json)',
      fn(t) {
        t.checkComponent('JSON Packet Generation', 'M3', () => {
          const packet = require('../../../src/agent/packet');
          const output = packet.generateImplementationPacket({
            screenId: 'note_editor',
            migrationPlan: { boundaries: { allowedModificationPaths: ['ui/editor/**'], forbiddenPaths: ['data/**'] } },
            format: 'json'
          });
          t.assert(output.json && typeof output.json === 'object');
          t.assertEqual(output.json.screenId, 'note_editor');
        });
      }
    },
    {
      id: 'F14-T4',
      name: 'Agent packet embeds exact build and verification commands',
      fn(t) {
        t.checkComponent('Verification Commands in Packet', 'M3', () => {
          const packet = require('../../../src/agent/packet');
          const output = packet.generateImplementationPacket({
            screenId: 'note_editor',
            migrationPlan: { boundaries: { allowedModificationPaths: [] } }
          });
          const text = output.markdown || JSON.stringify(output.json);
          t.assert(text.includes('ctc verify') || text.includes('compileDebugKotlin'));
        });
      }
    },
    {
      id: 'F14-T5',
      name: 'Agent packet embeds strict instruction prohibiting threshold tampering',
      fn(t) {
        t.checkComponent('Anti-Tampering Instruction', 'M3', () => {
          const packet = require('../../../src/agent/packet');
          const output = packet.generateImplementationPacket({
            screenId: 'note_editor',
            migrationPlan: { boundaries: { allowedModificationPaths: [] } }
          });
          const text = output.markdown || JSON.stringify(output.json);
          t.assert(text.includes('threshold') || text.includes('golden'));
        });
      }
    }
  ]
};
