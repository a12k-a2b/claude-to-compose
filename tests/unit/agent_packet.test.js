/**
 * tests/unit/agent_packet.test.js
 *
 * Unit test suite for Scoped Agent Implementation Packet Generator (src/agent/)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const Ajv = require('ajv/dist/2020');

const {
  generateImplementationPacket,
  sanitizePath,
  SOL_OS_NEUTRAL_TOKENS,
  SOL_OS_BRAND_GRAYS,
  MATERIAL3_COLOR_SCHEME_MAPPING
} = require('../../src/agent/packet');

const packetSchema = require('../../src/agent/schemas/agent_packet.schema.json');

describe('Agent Packet Generator Core Tests', () => {
  const minimalPlan = {
    screenId: 'note_editor',
    boundaries: {
      allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**'],
      forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**'],
      forbiddenBehaviors: ['EPD clear waveforms', 'Mock data']
    }
  };

  it('rejects packet generation with null or undefined migrationPlan', () => {
    assert.throws(() => generateImplementationPacket({ migrationPlan: null }), /migrationPlan required/i);
    assert.throws(() => generateImplementationPacket({}), /migrationPlan required/i);
  });

  it('rejects unsupported format option', () => {
    assert.throws(() => generateImplementationPacket({ format: 'xml' }), /unsupported format/i);
    assert.throws(() => generateImplementationPacket({ format: 'yaml' }), /unsupported format/i);
  });

  it('generates both markdown and json by default', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan
    });

    assert.ok(output.markdown, 'output.markdown must be defined');
    assert.ok(output.json, 'output.json must be defined');
    assert.strictEqual(typeof output.markdown, 'string');
    assert.strictEqual(typeof output.json, 'object');
    assert.strictEqual(output.json.screenId, 'note_editor');
  });

  it('generates markdown-only format when requested', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    assert.ok(output.markdown);
    assert.strictEqual(output.json, undefined);
  });

  it('generates json-only format when requested', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'json'
    });

    assert.ok(output.json);
    assert.strictEqual(output.markdown, undefined);
  });
});

describe('AGENT_PACKET.md Formatting & Constraint Verification', () => {
  const minimalPlan = {
    screenId: 'note_editor',
    boundaries: {
      allowedModificationPaths: ['ui/editor/**'],
      forbiddenPaths: ['data/**']
    }
  };

  it('contains mandatory FORBIDDEN keywords in uppercase', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    assert.ok(output.markdown.includes('FORBIDDEN'), 'Markdown must include FORBIDDEN in uppercase');
    assert.ok(output.markdown.includes('ALLOWED'), 'Markdown must include ALLOWED in uppercase');
  });

  it('embeds exact build and verification commands', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    assert.ok(
      output.markdown.includes('compileDebugKotlin') || output.markdown.includes('ctc verify'),
      'Must embed compileDebugKotlin or ctc verify'
    );
  });

  it('embeds strict anti-tampering instruction mentioning threshold or golden', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    assert.ok(
      output.markdown.includes('threshold') || output.markdown.includes('golden'),
      'Must contain anti-tampering instruction referencing thresholds or golden files'
    );
  });

  it('declares failure budgets including 3.0px spatial drift limit', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    assert.ok(
      output.markdown.includes('3.0') && output.markdown.includes('drift'),
      'Must declare <= 3.0px spatial drift'
    );
  });

  it('remains context-bounded under 300 lines', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: minimalPlan,
      format: 'markdown'
    });

    const lines = output.markdown.split('\n').length;
    assert.ok(lines < 300, `Markdown must be < 300 lines for LLM context limits: got ${lines}`);
  });
});

describe('Path Sanitization & Traversal Prevention', () => {
  it('rejects path traversal attacks with .. components', () => {
    assert.throws(() => sanitizePath('../../etc/passwd'), /traversal|invalid path/i);
    assert.throws(() => sanitizePath('app/src/../../../secret.key'), /traversal|invalid path/i);
  });

  it('rejects paths with null byte injection', () => {
    assert.throws(() => sanitizePath('valid/path\0attack'), /traversal|invalid path/i);
  });

  it('rejects empty or non-string paths', () => {
    assert.throws(() => sanitizePath(''), /invalid path/i);
    assert.throws(() => sanitizePath(null), /invalid path/i);
  });

  it('normalizes valid paths with forward slashes', () => {
    const clean = sanitizePath('app\\src\\main\\java\\com\\claude\\noteapp\\ui\\editor\\**');
    assert.strictEqual(clean, 'app/src/main/java/com/claude/noteapp/ui/editor/**');
  });
});

describe('Agent Packet JSON Schema Conformance', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  require('ajv-formats')(ajv);
  const validate = ajv.compile(packetSchema);

  it('validates generated agent-packet.json against Draft 2020-12 Schema', () => {
    const output = generateImplementationPacket({
      screenId: 'note_editor',
      migrationPlan: {
        screenId: 'note_editor',
        boundaries: {
          allowedModificationPaths: ['app/src/main/java/com/claude/noteapp/ui/editor/**'],
          forbiddenPaths: ['app/src/main/java/com/claude/noteapp/data/**']
        }
      },
      format: 'json'
    });

    const isValid = validate(output.json);
    if (!isValid) {
      console.error('AJV validation errors for AgentPacket:', validate.errors);
    }
    assert.ok(isValid, 'agent-packet.json must conform 100% to Draft 2020-12 Schema');
  });
});

describe('Sol:OS Tokens & Hardware Profile Verification', () => {
  it('defines the complete 10-token Sol:OS neutral grayscale scale', () => {
    const expectedTokens = [
      '--os-0', '--os-50', '--os-100', '--os-150', '--os-200',
      '--os-300', '--os-400', '--os-800', '--os-900', '--os-1000'
    ];
    for (const t of expectedTokens) {
      assert.ok(SOL_OS_NEUTRAL_TOKENS[t], `Token ${t} must exist`);
      assert.strictEqual(typeof SOL_OS_NEUTRAL_TOKENS[t].hex, 'string');
      assert.strictEqual(SOL_OS_NEUTRAL_TOKENS[t].rgb.length, 3);
      assert.strictEqual(typeof SOL_OS_NEUTRAL_TOKENS[t].luminance, 'number');
    }
  });

  it('maps primary text ink --os-900 to #1A1A1A with AAA contrast', () => {
    assert.strictEqual(SOL_OS_NEUTRAL_TOKENS['--os-900'].hex, '#1A1A1A');
    assert.strictEqual(MATERIAL3_COLOR_SCHEME_MAPPING.onBackground.token, '--os-900');
  });

  it('defines calibrated brand grays (yellow, amber, orange)', () => {
    assert.strictEqual(SOL_OS_BRAND_GRAYS.yellow.hex, '#CECECE');
    assert.strictEqual(SOL_OS_BRAND_GRAYS.amber.hex, '#9D9D9E');
    assert.strictEqual(SOL_OS_BRAND_GRAYS.orange.hex, '#6C6C6D');
  });
});
