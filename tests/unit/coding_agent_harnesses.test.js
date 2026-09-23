/**
 * tests/unit/coding_agent_harnesses.test.js
 *
 * Comprehensive Unit & Integration Test Suite for Coding Agent Harnesses
 * (Requirement R3 / Features F10, F11, F12, F13).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  HARNESS_EXCLUDE_PATTERNS,
  DEFAULT_FORBIDDEN_PATHS,
  DEFAULT_VERIFICATION_COMMANDS,
  extractHarnessOptions,
  generateCursorRules,
  generateClaudeCodeHarness,
  generateCodexSpec,
  generateAntigravitySkill,
  scaffoldAllHarnesses
} = require('../../src/agent/harnesses');

const {
  createAgentWorktree,
  removeAgentWorktree
} = require('../../src/agent/worktree');

const {
  InputError,
  gitCommonDirectory,
  gitChangedPaths,
  gitMetadata,
  SAFE_GIT_OPTIONS,
  gitEnvironment
} = require('../../src/agent/safety');

const { dispatch } = require('../../src/cli/dispatcher');
const { verifyCandidateWorktree } = require('../../src/verification/candidate_verifier');

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test User']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeCleanRepoWithCommit(dir) {
  initCleanGitRepo(dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Baseline Project\n');
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), '// NoteEditorScreen\n');
  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

describe('Coding Agent Harnesses Subsystem: tests/unit/coding_agent_harnesses.test.js', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-harness-unit-')));
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Suite 1: Cursor Rules Generator (generateCursorRules)
  // =========================================================================
  describe('Suite 1: Cursor Rules Generator (generateCursorRules)', () => {
    it('[T01] returns both .cursorrules and .cursor/rules/ctc-retrofit.mdc as non-empty strings', () => {
      const rules = generateCursorRules();
      assert.ok(rules['.cursorrules'] && typeof rules['.cursorrules'] === 'string');
      assert.ok(rules['.cursor/rules/ctc-retrofit.mdc'] && typeof rules['.cursor/rules/ctc-retrofit.mdc'] === 'string');
    });

    it('[T02] validates YAML frontmatter in .cursor/rules/ctc-retrofit.mdc', () => {
      const rules = generateCursorRules();
      const mdc = rules['.cursor/rules/ctc-retrofit.mdc'];
      assert.ok(mdc.startsWith('---'));
      assert.ok(mdc.includes('alwaysApply: true'));
      assert.ok(mdc.includes('globs: "**/*.kt,**/AGENT_PACKET.md,**/agent-packet.json"'));
      assert.ok(mdc.includes('description:'));
    });

    it('[T03] injects custom allowedPaths and forbiddenPaths correctly into both rules', () => {
      const customAllowed = ['custom/ui/path'];
      const customForbidden = ['custom/forbidden/**'];
      const rules = generateCursorRules({
        allowedPaths: customAllowed,
        forbiddenPaths: customForbidden
      });

      assert.ok(rules['.cursorrules'].includes('custom/ui/path'));
      assert.ok(rules['.cursorrules'].includes('custom/forbidden/**'));
      assert.ok(rules['.cursor/rules/ctc-retrofit.mdc'].includes('custom/ui/path'));
      assert.ok(rules['.cursor/rules/ctc-retrofit.mdc'].includes('custom/forbidden/**'));
    });

    it('[T04] verifies Daylight DC1 LivePaper hardware profile directives', () => {
      const rules = generateCursorRules();
      const mdc = rules['.cursor/rules/ctc-retrofit.mdc'];
      assert.ok(mdc.includes('Sharp NT36523N'));
      assert.ok(mdc.includes('Reflective / Transflective LCD'));
      assert.ok(mdc.includes('60Hz to 120Hz'));
      assert.ok(mdc.includes('ZERO EPD / E-Ink Workarounds'));
      assert.ok(mdc.includes('ACTION_REFRESH_SCREEN'));
      assert.ok(mdc.includes('--os-0'));
      assert.ok(mdc.includes('--os-1000'));
      assert.ok(mdc.includes('Modifier.minimumInteractiveComponentSize()'));
      assert.ok(mdc.includes('>= 48dp x 48dp'));
    });

    it('[T05] verifies verification command and defect remediation directives are present', () => {
      const rules = generateCursorRules();
      const mdc = rules['.cursor/rules/ctc-retrofit.mdc'];
      assert.ok(mdc.includes('node bin/ctc.js verify --candidate . --json'));
      assert.ok(mdc.includes('node bin/ctc.js defects --report .ctc/reports/verification-report.json --json'));
      assert.ok(mdc.includes('floor(dy / density)'));
    });

    it('[T06] falls back to default boundaries and commands when options are omitted', () => {
      const rules = generateCursorRules({});
      assert.ok(rules['.cursorrules'].includes('app/src/main/java/com/claude/noteapp/ui/editor'));
      assert.ok(rules['.cursorrules'].includes('app/src/main/java/com/claude/noteapp/data/**'));
      assert.ok(rules['.cursorrules'].includes('./gradlew compileDebugKotlin'));
    });
  });

  // =========================================================================
  // Suite 2: Claude Code Harness Generator (generateClaudeCodeHarness)
  // =========================================================================
  describe('Suite 2: Claude Code Harness Generator (generateClaudeCodeHarness)', () => {
    it('[T07] returns CLAUDE.md and skills dictionary with ctc-verify, ctc-defects, and ctc-packet', () => {
      const harness = generateClaudeCodeHarness();
      assert.ok(harness['CLAUDE.md'] && typeof harness['CLAUDE.md'] === 'string');
      assert.ok(harness.skills);
      assert.ok(harness.skills['ctc-verify']);
      assert.ok(harness.skills['ctc-defects']);
      assert.ok(harness.skills['ctc-packet']);
    });

    it('[T08] verifies CLAUDE.md documents all 5 standard exit codes', () => {
      const harness = generateClaudeCodeHarness();
      const md = harness['CLAUDE.md'];
      assert.ok(md.includes('`0`'));
      assert.ok(md.includes('PASS'));
      assert.ok(md.includes('`1`'));
      assert.ok(md.includes('FAIL'));
      assert.ok(md.includes('`2`'));
      assert.ok(md.includes('BLOCKED'));
      assert.ok(md.includes('`3`'));
      assert.ok(md.includes('INPUT_INVALID'));
      assert.ok(md.includes('`4`'));
      assert.ok(md.includes('INFRASTRUCTURE_ERROR'));
    });

    it('[T09] verifies CLAUDE.md enforces candidate worktree safety invariants', () => {
      const harness = generateClaudeCodeHarness();
      const md = harness['CLAUDE.md'];
      assert.ok(md.includes('Never edit the baseline repository directly'));
      assert.ok(md.includes('atomicWriteNoFollow'));
      assert.ok(md.includes('No Source Symlinks'));
      assert.ok(md.includes('implementationBoundary.allowedPaths'));
    });

    it('[T10] verifies CLAUDE.md embeds Daylight DC1 LivePaper hardware rules and Sol:OS tokens', () => {
      const harness = generateClaudeCodeHarness();
      const md = harness['CLAUDE.md'];
      assert.ok(md.includes('Transflective LCD (LivePaper)'));
      assert.ok(md.includes('STRICT ZERO EPD'));
      assert.ok(md.includes('--os-0'));
      assert.ok(md.includes('--os-1000'));
      assert.ok(md.includes('Modifier.minimumInteractiveComponentSize()'));
    });

    it('[T11] validates skill tool schemas and executable wrapper scripts', () => {
      const harness = generateClaudeCodeHarness();
      for (const [skillName, skillData] of Object.entries(harness.skills)) {
        assert.ok(skillData.json, `Skill ${skillName} missing json`);
        assert.ok(skillData.content, `Skill ${skillName} missing content`);
        const schema = JSON.parse(skillData.json);
        assert.equal(schema.name, skillName);
        assert.equal(schema.parameters.type, 'object');
        assert.ok(skillData.content.startsWith('#!/usr/bin/env node'));
      }
    });
  });

  // =========================================================================
  // Suite 3: Codex Specification Generator (generateCodexSpec)
  // =========================================================================
  describe('Suite 3: Codex Specification Generator (generateCodexSpec)', () => {
    it('[T12] returns Markdown string targeting docs/CODING_AGENTS.md', () => {
      const spec = generateCodexSpec();
      assert.ok(typeof spec === 'string');
      assert.ok(spec.length > 500);
    });

    it('[T13] contains structured system prompt for OpenAI / Codex coding models', () => {
      const spec = generateCodexSpec();
      assert.ok(spec.includes('You are an autonomous Jetpack Compose Retrofit Coding Agent'));
      assert.ok(spec.includes('OPERATIONAL INVARIANTS'));
      assert.ok(spec.includes('CANDIDATE WORKTREE CONFINEMENT'));
      assert.ok(spec.includes('MANDATORY FIRST STEP'));
      assert.ok(spec.includes('STRICT BOUNDARY ENFORCEMENT'));
      assert.ok(spec.includes('DAYLIGHT DC1 LIVEPAPER HARDWARE RULES'));
    });

    it('[T14] enforces 8-point execution contract', () => {
      const spec = generateCodexSpec();
      assert.ok(spec.includes('8-PHASE EXECUTION CONTRACT'));
      assert.ok(spec.includes('Phase 1: Ingest Packet'));
      assert.ok(spec.includes('Phase 2: Verify AST Symbols'));
      assert.ok(spec.includes('Phase 3: Enforce Boundaries'));
      assert.ok(spec.includes('Phase 4: Domain Logic Preservation'));
      assert.ok(spec.includes('Phase 5: Apply Compose Retrofit'));
      assert.ok(spec.includes('Phase 6: Execute Verification Gate'));
      assert.ok(spec.includes('Phase 7: Diagnose & Remediate Structured Defects'));
      assert.ok(spec.includes('Phase 8: Honest Reporting & Anti-Tampering'));
    });

    it('[T15] includes concrete tool schemas, prompt examples, and JSON error response patterns', () => {
      const spec = generateCodexSpec();
      assert.ok(spec.includes('read_agent_packet'));
      assert.ok(spec.includes('read_source_file'));
      assert.ok(spec.includes('write_source_file'));
      assert.ok(spec.includes('run_ctc_verify'));
      assert.ok(spec.includes('run_ctc_defects'));
      assert.ok(spec.includes('report_completion'));
      assert.ok(spec.includes('Honest Blocking & Escalation Protocol'));
    });
  });

  // =========================================================================
  // Suite 4: Antigravity Skill Generator (generateAntigravitySkill)
  // =========================================================================
  describe('Suite 4: Antigravity Skill Generator (generateAntigravitySkill)', () => {
    it('[T16] returns Markdown string targeting skills/claude-to-compose/SKILL.md', () => {
      const skill = generateAntigravitySkill();
      assert.ok(typeof skill === 'string');
      assert.ok(skill.length > 500);
    });

    it('[T17] validates YAML frontmatter (name: claude-to-compose, description)', () => {
      const skill = generateAntigravitySkill();
      assert.ok(skill.startsWith('---'));
      assert.ok(skill.includes('name: claude-to-compose'));
      assert.ok(skill.includes('description:'));
    });

    it('[T18] formalizes the 8-stage retrofit workflow', () => {
      const skill = generateAntigravitySkill();
      assert.ok(skill.includes('8-STAGE RETROFIT WORKFLOW'));
      assert.ok(skill.includes('Stage 1: Preflight'));
      assert.ok(skill.includes('Stage 2: Baseline'));
      assert.ok(skill.includes('Stage 3: Inspect App'));
      assert.ok(skill.includes('Stage 4: Design Contract Extraction'));
      assert.ok(skill.includes('Stage 5: Correspondence Mapping & Migration Planning'));
      assert.ok(skill.includes('Stage 6: Automated Worktree Scaffolding'));
      assert.ok(skill.includes('Stage 7: 6-Stage Progressive Verification'));
      assert.ok(skill.includes('Stage 8: Causal Defect Diagnosis'));
    });

    it('[T19] exposes Daylight DC1 hardware specification, touch kinematics, and MCP tool patterns', () => {
      const skill = generateAntigravitySkill();
      assert.ok(skill.includes('Sharp NT36523N'));
      assert.ok(skill.includes('ZERO EPD / E-Ink Workarounds'));
      assert.ok(skill.includes('+8px hardware coordinate inset'));
      assert.ok(skill.includes('daylight_fleet_status'));
      assert.ok(skill.includes('daylight_touch_tap'));
      assert.ok(skill.includes('daylight_touch_swipe'));
      assert.ok(skill.includes('daylight_micro_scroll'));
      assert.ok(skill.includes('daylight_wacom_stroke'));
      assert.ok(skill.includes('daylight_capture_screen'));
      assert.ok(skill.includes('daylight_query_ui'));
      assert.ok(skill.includes('daylight_closed_loop_step'));
    });
  });

  // =========================================================================
  // Suite 5: Atomic Scaffolding & Path Confinement (scaffoldAllHarnesses)
  // =========================================================================
  describe('Suite 5: Atomic Scaffolding & Path Confinement (scaffoldAllHarnesses)', () => {
    it('[T20] atomically writes files using atomicWriteNoFollow and creates nested subdirectories', () => {
      const target = path.join(tempRoot, 'scaffold-test');
      const res = scaffoldAllHarnesses(target, { env: 'candidate', updateGitExclude: false });
      assert.ok(res.success);
      assert.ok(fs.existsSync(path.join(target, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(target, '.cursor/rules/ctc-retrofit.mdc')));
      assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
      assert.ok(fs.existsSync(path.join(target, '.claude/skills/ctc/ctc-verify.json')));
      assert.ok(fs.existsSync(path.join(target, '.claude/skills/ctc/ctc-verify.js')));
    });

    it('[T21] rejects path traversal (..) and dangerous root targets (/, $HOME) with InputError', () => {
      assert.throws(() => {
        scaffoldAllHarnesses('../escaped');
      }, /must not contain parent traversal/);

      assert.throws(() => {
        scaffoldAllHarnesses('/');
      }, /dangerous root/);

      assert.throws(() => {
        scaffoldAllHarnesses(os.homedir());
      }, /dangerous root/);
    });

    it('[T22] refuses to write through existing symbolic links', () => {
      const target = path.join(tempRoot, 'symlink-target');
      fs.mkdirSync(target, { recursive: true });
      const outside = path.join(tempRoot, 'outside-secret.txt');
      fs.writeFileSync(outside, 'original');
      fs.symlinkSync(outside, path.join(target, '.cursorrules'));

      assert.throws(() => {
        scaffoldAllHarnesses(target, { env: 'cursor', updateGitExclude: false });
      }, /refusing to write through output symlink/);

      assert.equal(fs.readFileSync(outside, 'utf8'), 'original');
    });

    it('[T23] respects env parameter filtering (cursor, claude, codex, antigravity, candidate, all)', () => {
      const dirCursor = path.join(tempRoot, 'env-cursor');
      scaffoldAllHarnesses(dirCursor, { env: 'cursor', updateGitExclude: false });
      assert.ok(fs.existsSync(path.join(dirCursor, '.cursorrules')));
      assert.ok(!fs.existsSync(path.join(dirCursor, 'CLAUDE.md')));

      const dirClaude = path.join(tempRoot, 'env-claude');
      scaffoldAllHarnesses(dirClaude, { env: 'claude', updateGitExclude: false });
      assert.ok(fs.existsSync(path.join(dirClaude, 'CLAUDE.md')));
      assert.ok(!fs.existsSync(path.join(dirClaude, '.cursorrules')));

      const dirCodex = path.join(tempRoot, 'env-codex');
      scaffoldAllHarnesses(dirCodex, { env: 'codex', updateGitExclude: false });
      assert.ok(fs.existsSync(path.join(dirCodex, 'docs/CODING_AGENTS.md')));

      const dirAgy = path.join(tempRoot, 'env-agy');
      scaffoldAllHarnesses(dirAgy, { env: 'antigravity', updateGitExclude: false });
      assert.ok(fs.existsSync(path.join(dirAgy, 'skills/claude-to-compose/SKILL.md')));
    });

    it('[T24] sets executable permissions (0o755) on generated skill scripts', () => {
      const target = path.join(tempRoot, 'perm-test');
      scaffoldAllHarnesses(target, { env: 'claude', updateGitExclude: false });
      const scriptPath = path.join(target, '.claude/skills/ctc/ctc-verify.js');
      const stat = fs.statSync(scriptPath);
      // Check execute bit (0o111)
      assert.ok((stat.mode & 0o111) !== 0, 'Expected executable permissions on skill script');
    });

    it('[T25] returns structured summary object with filesWritten and gitExcludeUpdated', () => {
      const target = path.join(tempRoot, 'summary-test');
      const res = scaffoldAllHarnesses(target, { env: 'candidate', updateGitExclude: false });
      assert.equal(res.success, true);
      assert.equal(res.targetDir, target);
      assert.equal(res.env, 'candidate');
      assert.ok(Array.isArray(res.filesWritten));
      assert.ok(res.filesWritten.includes('.cursorrules'));
      assert.ok(res.filesWritten.includes('CLAUDE.md'));
      assert.equal(res.gitExcludeUpdated, false);
    });
  });

  // =========================================================================
  // Suite 6: Worktree Scaffolder Integration & Clean Tree Verification
  // =========================================================================
  describe('Suite 6: Worktree Scaffolder Integration & Clean Tree Verification', () => {
    let androidDir;
    let workspaceDir;
    let candidateDir;
    let baselineCommit;

    beforeEach(() => {
      androidDir = path.join(tempRoot, 'android-app');
      workspaceDir = path.join(tempRoot, 'workspace');
      candidateDir = path.join(tempRoot, 'candidate-wt');

      const info = makeCleanRepoWithCommit(androidDir);
      baselineCommit = info.commit;

      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.ctc-workspace.json'),
        JSON.stringify({
          kind: 'ctc-workspace',
          version: 1,
          androidRoot: androidDir
        }, null, 2)
      );
    });

    afterEach(() => {
      try {
        execFileSync('git', ['-C', androidDir, 'worktree', 'remove', '--force', candidateDir], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment()
        });
      } catch (_) {}
    });

    it('[T26] createAgentWorktree scaffolds .cursorrules, .cursor/rules/ctc-retrofit.mdc, CLAUDE.md, and skills by default', () => {
      const res = createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'wt-harness-default'
      });

      assert.equal(res.status, 'PASS');
      assert.ok(fs.existsSync(path.join(candidateDir, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(candidateDir, '.cursor/rules/ctc-retrofit.mdc')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'CLAUDE.md')));
      assert.ok(fs.existsSync(path.join(candidateDir, '.claude/skills/ctc/ctc-verify.js')));
      assert.ok(res.harness && res.harness.success);
    });

    it('[T27] automatically updates <gitCommonDir>/info/exclude with HARNESS_EXCLUDE_PATTERNS', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'wt-harness-exclude'
      });

      const gitCommonDir = gitCommonDirectory(candidateDir);
      const excludeContent = fs.readFileSync(path.join(gitCommonDir, 'info', 'exclude'), 'utf8');
      for (const pattern of HARNESS_EXCLUDE_PATTERNS) {
        assert.ok(excludeContent.includes(pattern), `Expected exclude to contain ${pattern}`);
      }
    });

    it('[T28] confirms candidate worktree git status --porcelain is 100% clean immediately after scaffolding', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'wt-harness-clean-status'
      });

      const status = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateDir, 'status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      }).trim();

      assert.equal(status, '', `Expected git status --porcelain to be empty but got: "${status}"`);
    });

    it('[T29] confirms gitChangedPaths and gitMetadata.dirty are clean (empty array and false)', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'wt-harness-clean-meta'
      });

      const changed = gitChangedPaths(candidateDir, baselineCommit);
      assert.equal(changed.length, 0, `Expected 0 changed paths, got: ${changed.join(', ')}`);

      const meta = gitMetadata(candidateDir);
      assert.equal(meta.dirty, false, 'Expected candidate worktree gitMetadata.dirty to be false');
    });

    it('[T30] confirms newly scaffolded candidate passes verifyCandidateWorktree with zero boundary violations', () => {
      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'wt-harness-verify'
      });

      const verifyResult = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: androidDir,
        baselineCommit
      });

      assert.equal(verifyResult.valid, true);
      assert.equal(verifyResult.changedPaths.length, 0);
      assert.equal(verifyResult.violations.length, 0);
    });
  });

  // =========================================================================
  // Suite 7: CLI Subaction Integration (ctc agent harness)
  // =========================================================================
  describe('Suite 7: CLI Subaction Integration (ctc agent harness)', () => {
    it('[T31] ctc agent harness --target <dir> --env all executes with exitCode 0 and status PASS', () => {
      const target = path.join(tempRoot, 'cli-harness-all');
      const res = dispatch([
        'agent', 'harness',
        '--target', target,
        '--env', 'all',
        '--json'
      ]);

      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
      assert.ok(fs.existsSync(path.join(target, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
      assert.ok(fs.existsSync(path.join(target, 'docs/CODING_AGENTS.md')));
      assert.ok(fs.existsSync(path.join(target, 'skills/claude-to-compose/SKILL.md')));
    });

    it('[T32] ctc agent harness --target <dir> --env cursor only writes Cursor rules', () => {
      const target = path.join(tempRoot, 'cli-harness-cursor');
      const res = dispatch([
        'agent', 'harness',
        '--target', target,
        '--env', 'cursor',
        '--json'
      ]);

      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
      assert.ok(fs.existsSync(path.join(target, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(target, '.cursor/rules/ctc-retrofit.mdc')));
      assert.ok(!fs.existsSync(path.join(target, 'CLAUDE.md')));
    });

    it('[T33] ctc agent harness --help returns full usage documentation with exitCode 0', () => {
      const agentCmd = require('../../src/cli/commands/agent');
      const helpRes = agentCmd.execute({ _: ['harness'], flags: { help: true } });
      assert.equal(helpRes.exitCode, 0);
      assert.equal(helpRes.status, 'PASS');
      assert.ok(helpRes.humanOutput.includes('Usage: ctc agent harness [options]'));
      assert.ok(helpRes.humanOutput.includes('--env, -e <name>'));
      assert.ok(helpRes.humanOutput.includes('--target, -t <path>'));
    });

    it('[T34] ctc agent harness with invalid/traversal path returns exitCode 3 and INPUT_INVALID status', () => {
      const res = dispatch([
        'agent', 'harness',
        '--target', '../escaped',
        '--json'
      ]);

      assert.equal(res.exitCode, 3);
      assert.equal(res.status, 'INPUT_INVALID');
      assert.ok(/traversal/i.test(res.error || ''));
    });

    it('[T35] ctc agent harness inside candidate worktree updates git exclude and reports success', () => {
      const androidDir = path.join(tempRoot, 'android-cli-test');
      const workspaceDir = path.join(tempRoot, 'ws-cli-test');
      const candidateDir = path.join(tempRoot, 'cand-cli-test');

      makeCleanRepoWithCommit(androidDir);
      fs.mkdirSync(workspaceDir, { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, '.ctc-workspace.json'),
        JSON.stringify({ kind: 'ctc-workspace', version: 1, androidRoot: androidDir }, null, 2)
      );

      createAgentWorktree({
        android: androidDir,
        workspace: workspaceDir,
        output: candidateDir,
        branch: 'cand-cli-harness-branch',
        harnesses: false // skip initial harness to test CLI generation
      });

      const res = dispatch([
        'agent', 'harness',
        '--target', candidateDir,
        '--env', 'candidate',
        '--json'
      ]);

      assert.equal(res.exitCode, 0);
      assert.equal(res.status, 'PASS');
      assert.ok(fs.existsSync(path.join(candidateDir, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'CLAUDE.md')));

      // Confirm git status remains completely clean
      const status = execFileSync('git', [...SAFE_GIT_OPTIONS, '-C', candidateDir, 'status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      }).trim();
      assert.equal(status, '');
    });
  });
});
