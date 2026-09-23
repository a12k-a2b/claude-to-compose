/**
 * tests/adversarial/m3_empirical_challenge.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 3:
 * First-Class Coding Agent Harnesses, CLI Subaction Dispatch, Path Safety,
 * Malformed Contracts, Non-TTY Script Execution, and Fail-Closed Boundary Testing.
 *
 * Authored by challenger_retrofit_m3_1.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const {
  scaffoldAllHarnesses,
  extractHarnessOptions,
  generateCursorRules,
  generateClaudeCodeHarness,
  generateCodexSpec,
  generateAntigravitySkill,
  HARNESS_EXCLUDE_PATTERNS
} = require('../../src/agent/harnesses');

const { dispatch } = require('../../src/cli/dispatcher');
const agentCmd = require('../../src/cli/commands/agent');
const { gitCommonDirectory, InputError } = require('../../src/agent/safety');

describe('Milestone 3 Empirical Adversarial Challenge Suite', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm3-challenger-')));
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Challenge 1: Path Confinement & Dangerous Targets in scaffoldAllHarnesses
  // =========================================================================
  describe('Challenge 1: Path Confinement & Dangerous Targets in scaffoldAllHarnesses', () => {
    it('[CH1-T01] rejects root directory / with InputError', () => {
      assert.throws(() => {
        scaffoldAllHarnesses('/');
      }, (err) => {
        return err instanceof InputError && err.message.includes('dangerous root');
      });
    });

    it('[CH1-T02] rejects home directory $HOME with InputError', () => {
      assert.throws(() => {
        scaffoldAllHarnesses(os.homedir());
      }, (err) => {
        return err instanceof InputError && err.message.includes('dangerous root');
      });
    });

    it('[CH1-T03] rejects relative parent traversal ../.. with InputError', () => {
      assert.throws(() => {
        scaffoldAllHarnesses('../..');
      }, (err) => {
        return err instanceof InputError && err.message.includes('parent traversal');
      });
    });

    it('[CH1-T04] rejects raw embedded parent traversal string with InputError', () => {
      const nested = `${tempRoot}/sub/../../escaped`;
      assert.throws(() => {
        scaffoldAllHarnesses(nested);
      }, (err) => {
        return err instanceof InputError && err.message.includes('parent traversal');
      });
    });

    it('[CH1-T05] rejects null, undefined, empty string, or whitespace targets', () => {
      assert.throws(() => scaffoldAllHarnesses(null), /target directory is required/);
      assert.throws(() => scaffoldAllHarnesses(undefined), /target directory is required/);
      assert.throws(() => scaffoldAllHarnesses(''), /target directory is required/);
      assert.throws(() => scaffoldAllHarnesses('   '), /target directory is required/);
    });

    it('[CH1-T06] rejects null-byte injection in target path', () => {
      assert.throws(() => {
        scaffoldAllHarnesses(path.join(tempRoot, 'foo\0bar'));
      }, /invalid null byte/);
    });
  });

  // =========================================================================
  // Challenge 2: Option Normalization & Malformed Contracts (extractHarnessOptions)
  // =========================================================================
  describe('Challenge 2: Option Normalization & Malformed Contracts', () => {
    it('[CH2-T01a] uses safe defaults when options are undefined or empty object', () => {
      const optUndef = extractHarnessOptions(undefined);
      const optEmpty = extractHarnessOptions({});

      for (const opt of [optUndef, optEmpty]) {
        assert.equal(opt.screenId, 'note_editor');
        assert.ok(Array.isArray(opt.allowedPaths));
        assert.ok(opt.allowedPaths.length > 0);
        assert.ok(Array.isArray(opt.forbiddenPaths));
        assert.ok(opt.forbiddenPaths.length > 0);
        assert.ok(Array.isArray(opt.verificationCommands));
        assert.ok(opt.verificationCommands.length > 0);
      }
    });

    it('[CH2-T01b] demonstrates null options vulnerability: throws TypeError on null (finding)', () => {
      // In JS, default param (options = {}) only kicks in on undefined, NOT null.
      // Passing null crashes with TypeError: Cannot read properties of null
      assert.throws(() => {
        extractHarnessOptions(null);
      }, (err) => {
        return err instanceof TypeError && err.message.includes('Cannot read properties of null');
      });
    });

    it('[CH2-T02] normalizes glob suffixes from allowedPaths', () => {
      const opt = extractHarnessOptions({
        allowedPaths: [
          'app/src/main/java/com/claude/noteapp/ui/editor/**',
          'app/src/main/java/com/claude/noteapp/ui/components/*',
          'app\\src\\main\\java\\windows\\path'
        ]
      });

      assert.deepEqual(opt.allowedPaths, [
        'app/src/main/java/com/claude/noteapp/ui/editor',
        'app/src/main/java/com/claude/noteapp/ui/components',
        'app/src/main/java/windows/path'
      ]);
    });

    it('[CH2-T03] falls back to safe defaults when contract has empty allowedPaths or forbiddenPaths', () => {
      const opt = extractHarnessOptions({
        contract: {
          implementationBoundary: {
            allowedPaths: [],
            forbiddenPaths: [],
            verificationCommands: []
          }
        }
      });

      assert.ok(opt.allowedPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor'));
      assert.ok(opt.forbiddenPaths.some(p => p.includes('data')));
      assert.ok(opt.verificationCommands.some(c => c.includes('compileDebugKotlin')));
    });

    it('[CH2-T04] reveals type fragility when non-array allowedPaths string is provided (finding)', () => {
      // If a non-array string is provided in contract, extractHarnessOptions throws TypeError because strings have .length but lack .map
      assert.throws(() => {
        extractHarnessOptions({
          contract: {
            implementationBoundary: {
              allowedPaths: 'app/src/main/java/com/claude/noteapp/ui/editor'
            }
          }
        });
      }, (err) => {
        return err instanceof TypeError && err.message.includes('allowedPaths.map is not a function');
      });
    });
  });

  // =========================================================================
  // Challenge 3: CLI Subaction Dispatch & Flag Safety (ctc agent harness)
  // =========================================================================
  describe('Challenge 3: CLI Subaction Dispatch & Flag Safety', () => {
    it('[CH3-T01] ctc agent harness --target / returns exitCode 3 and INPUT_INVALID in JSON', () => {
      const res = dispatch(['agent', 'harness', '--target', '/', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(/dangerous root/i.test(res.error));
    });

    it('[CH3-T02] ctc agent harness -t $HOME returns exitCode 3 and INPUT_INVALID in JSON', () => {
      const res = dispatch(['agent', 'harness', '-t', os.homedir(), '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(/dangerous root/i.test(res.error));
    });

    it('[CH3-T03] ctc agent harness --target ../.. returns exitCode 3 and INPUT_INVALID in JSON', () => {
      const res = dispatch(['agent', 'harness', '--target', '../..', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(/traversal/i.test(res.error));
    });

    it('[CH3-T04] ctc agent invalidAction returns exitCode 3 with allowed actions list', () => {
      const res = dispatch(['agent', 'bogusAction', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(res.error.includes('Allowed: packet, worktree, harness'));
    });

    it('[CH3-T05] ctc agent with no action returns exitCode 3 and guidance', () => {
      const res = dispatch(['agent', '--json']);
      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(res.error.includes('Agent action required'));
    });

    it('[CH3-T06] direct command execution returns specific harness help text, while global dispatcher intercepts --help (finding)', () => {
      // 1. Direct handler returns detailed harness usage
      const direct = agentCmd.execute({ _: ['harness'], flags: { help: true } });
      assert.equal(direct.exitCode, 0);
      assert.ok(direct.humanOutput.includes('Usage: ctc agent harness [options]'));
      assert.ok(direct.humanOutput.includes('--env, -e <name>'));

      // 2. Dispatcher intercepts --help globally, returning top-level CLI help
      const routed = dispatch(['agent', 'harness', '--help']);
      assert.equal(routed.exitCode, 0);
      assert.ok(routed.output.includes('Usage: ctc <command>'));
    });

    it('[CH3-T07] reveals unvalidated --env behavior (finding)', () => {
      const target = path.join(tempRoot, 'invalid-env-test');
      const res = dispatch(['agent', 'harness', '--target', target, '--env', 'invalid', '--json']);

      // Document observed behavior: currently exits 0 with 0 files written rather than failing with INPUT_INVALID
      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
      assert.equal(res.data.filesWritten.length, 0);
    });

    it('[CH3-T08] confirms --json produces clean, parseable JSON on command execution', () => {
      const binPath = path.resolve('bin/ctc.js');
      const target = path.join(tempRoot, 'cli-json-test');
      const out = execFileSync(process.execPath, [binPath, 'agent', 'harness', '--target', target, '--env', 'cursor', '--json'], {
        encoding: 'utf8'
      });

      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(out);
      }, 'Expected stdout to be strictly valid JSON');
      assert.equal(parsed.exitCode, 0);
      assert.equal(parsed.status, 'PASS');
      assert.equal(parsed.command, 'agent harness');
      assert.ok(parsed.data.filesWritten.length > 0);
    });
  });

  // =========================================================================
  // Challenge 4: Executable Claude Code Skills (.claude/skills/ctc/)
  // =========================================================================
  describe('Challenge 4: Executable Claude Code Skills', () => {
    it('[CH4-T01] confirms skill scripts exist with 0o755 executable permissions', () => {
      const scripts = [
        '.claude/skills/ctc/ctc-verify.js',
        '.claude/skills/ctc/ctc-defects.js',
        '.claude/skills/ctc/ctc-packet.js'
      ];

      for (const rel of scripts) {
        const abs = path.resolve(rel);
        assert.ok(fs.existsSync(abs), `Script must exist: ${rel}`);
        const stat = fs.statSync(abs);
        assert.ok((stat.mode & 0o111) !== 0, `Script must be executable: ${rel}`);
      }
    });

    it('[CH4-T02] ctc-defects.js executes standalone and produces valid JSON report', () => {
      const scriptPath = path.resolve('.claude/skills/ctc/ctc-defects.js');
      const result = spawnSync(process.execPath, [scriptPath], {
        encoding: 'utf8',
        input: ''
      });

      assert.equal(result.status, 0);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout);
      });
      assert.equal(parsed.success, true);
      assert.equal(parsed.gateOutcome, 'PASS');
      assert.equal(parsed.totalDefects, 0);
    });

    it('[CH4-T03] ctc-packet.js handles missing packet gracefully with exitCode 1 and JSON error', () => {
      const scriptPath = path.resolve('.claude/skills/ctc/ctc-packet.js');
      const emptyDir = path.join(tempRoot, 'empty-candidate');
      fs.mkdirSync(emptyDir, { recursive: true });

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: emptyDir,
        encoding: 'utf8',
        input: ''
      });

      assert.equal(result.status, 1);
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout);
      });
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('agent-packet.json not found'));
    });

    it('[CH4-T04] reveals non-TTY CLI argument discarding bug in ctc-packet.js (finding)', () => {
      const scriptPath = path.resolve('.claude/skills/ctc/ctc-packet.js');
      const customCand = path.join(tempRoot, 'custom-cand');
      fs.mkdirSync(customCand, { recursive: true });
      fs.writeFileSync(path.join(customCand, 'agent-packet.json'), JSON.stringify({
        packetId: 'custom-pkt',
        screenId: 'note_editor',
        targetScope: { allowedModificationPaths: [] }
      }));

      // When executed with input: '' (non-TTY, process.stdin.isTTY === false),
      // the script evaluates the else branch and ignores process.argv (--candidate customCand),
      // falling back to process.cwd() instead!
      const result = spawnSync(process.execPath, [scriptPath, '--candidate', customCand], {
        cwd: tempRoot, // root without packet
        encoding: 'utf8',
        input: ''
      });

      // It fails because it looked in tempRoot (process.cwd()) instead of customCand!
      assert.equal(result.status, 1);
      const parsed = JSON.parse(result.stdout);
      assert.ok(parsed.error.includes(tempRoot), 'Demonstrated: CLI argument --candidate was discarded in non-TTY mode');
    });

    it('[CH4-T05] ctc-packet.js parses valid packet when candidate is process.cwd()', () => {
      const scriptPath = path.resolve('.claude/skills/ctc/ctc-packet.js');
      const candDir = path.join(tempRoot, 'valid-cand');
      fs.mkdirSync(candDir, { recursive: true });
      fs.writeFileSync(path.join(candDir, 'agent-packet.json'), JSON.stringify({
        packetId: 'valid-pkt',
        screenId: 'note_editor',
        targetScope: {
          allowedModificationPaths: ['ui/editor'],
          forbiddenPaths: ['data/**']
        },
        designTokens: { solOsNeutralTokens: { '--os-0': '#FFFFFF' } }
      }));

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: candDir,
        encoding: 'utf8',
        input: ''
      });

      assert.equal(result.status, 0);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.success, true);
      assert.equal(parsed.packetId, 'valid-pkt');
      assert.ok(parsed.boundaries);
      assert.ok(parsed.tokens);
    });
  });

  // =========================================================================
  // Challenge 5: Invariant Preservation & File Hygiene
  // =========================================================================
  describe('Challenge 5: Invariant Preservation & File Hygiene', () => {
    it('[CH5-T01] verifies dispatcher SUBCOMMANDS length invariant remains exactly 13', () => {
      const { SUBCOMMANDS } = require('../../src/cli/dispatcher');
      assert.equal(SUBCOMMANDS.length, 13, 'SUBCOMMANDS count must strictly be 13');
    });

    it('[CH5-T02] verifies HARNESS_EXCLUDE_PATTERNS contains all required exclusions', () => {
      const required = ['.cursorrules', '.cursor', '.cursor/**', 'CLAUDE.md', '.claude', '.claude/**'];
      for (const pat of required) {
        assert.ok(HARNESS_EXCLUDE_PATTERNS.includes(pat), `Pattern missing: ${pat}`);
      }
    });

    it('[CH5-T03] verifies generated Antigravity skill contains required Daylight DC1 tokens and rules', () => {
      const skill = generateAntigravitySkill();
      assert.ok(skill.includes('LivePaper'));
      assert.ok(skill.includes('Reflective LCD / Transflective LCD'));
      assert.ok(skill.includes('60Hz to 120Hz'));
      assert.ok(skill.includes('ZERO EPD'));
      assert.ok(skill.includes('--os-0'));
      assert.ok(skill.includes('--os-1000'));
      assert.ok(skill.includes('daylight_fleet_status'));
      assert.ok(skill.includes('daylight_closed_loop_step'));
    });
  });
});
