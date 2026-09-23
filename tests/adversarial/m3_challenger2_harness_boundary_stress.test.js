/**
 * tests/adversarial/m3_challenger2_harness_boundary_stress.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 3:
 * 1. Candidate Worktree Git Cleanliness & Verification Handshake with harnesses enabled
 * 2. Harness Modification Immunity & Exclude Isolation (.cursorrules, CLAUDE.md, .claude/, .cursor/)
 * 3. Boundary Enforcement: Allowed vs Forbidden Edits with harnesses present
 * 4. Adversarial Smuggling & Evasion Attacks (code in excluded folders, inspection files, git add -f, symlinks)
 *
 * Executed by challenger_retrofit_m3_2.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  createAgentWorktree,
  removeAgentWorktree
} = require('../../src/agent/worktree');

const {
  HARNESS_EXCLUDE_PATTERNS,
  scaffoldAllHarnesses
} = require('../../src/agent/harnesses');

const {
  InputError,
  BlockedError,
  readWorkspace,
  gitCommonDirectory,
  gitChangedPaths,
  gitIgnoredSourceEvidence,
  SAFE_GIT_OPTIONS,
  gitEnvironment
} = require('../../src/agent/safety');

const {
  verifyCandidateWorktree,
  enforceImplementationBoundary
} = require('../../src/verification/candidate_verifier');

const { dispatch } = require('../../src/cli/dispatcher');

function initCleanGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'challenger_m3_2@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Milestone 3 Challenger 2']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
}

function makeBaselineProject(dir) {
  initCleanGitRepo(dir);
  const editorDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/ui/editor');
  const dataDir = path.join(dir, 'app/src/main/java/com/claude/noteapp/data');
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(editorDir, 'NoteEditorScreen.kt'), 'package com.claude.noteapp.ui.editor\n// Baseline NoteEditorScreen\nfun NoteEditorScreen() {}\n');
  fs.writeFileSync(path.join(dataDir, 'NoteRepository.kt'), 'package com.claude.noteapp.data\n// Baseline NoteRepository\nclass NoteRepository {}\n');
  fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '// Baseline Root Build Gradle\n');
  fs.writeFileSync(path.join(dir, 'settings.gradle.kts'), '// Baseline Settings Gradle\n');
  fs.writeFileSync(path.join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"/>\n');

  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'initial baseline commit']);
  const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { commit };
}

describe('M3-Challenger-2: Candidate Worktree Git Cleanliness & Boundary Enforcement', () => {
  let tempRoot;
  let baselineDir;
  let candidateDir;
  let workspaceDir;
  let baselineCommit;

  const standardContract = {
    schemaVersion: '1.0.0',
    id: 'contract_note_editor',
    screenId: 'note_editor',
    implementationBoundary: {
      allowedPaths: [
        'app/src/main/java/com/claude/noteapp/ui/editor'
      ],
      prohibitedChanges: [
        'DO NOT replace Room SQLite queries with mock lists or stubs.',
        'DO NOT modify build configurations or manifest.'
      ],
      verificationCommands: [
        './gradlew compileDebugKotlin --no-daemon',
        './gradlew testDebugUnitTest --no-daemon'
      ]
    }
  };

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m3-chal2-')));
    baselineDir = path.join(tempRoot, 'baseline-app');
    candidateDir = path.join(tempRoot, 'candidate-wt');
    workspaceDir = path.join(tempRoot, 'workspace');

    const info = makeBaselineProject(baselineDir);
    baselineCommit = info.commit;

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, '.ctc-workspace.json'), JSON.stringify({
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: baselineDir
    }, null, 2));

    fs.writeFileSync(path.join(workspaceDir, 'retrofit-contract.json'), JSON.stringify(standardContract, null, 2));
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Suite 1: Candidate Worktree Git Cleanliness Handshake
  // =========================================================================
  describe('Suite 1: Candidate Worktree Git Cleanliness Handshake', () => {
    it('[M3-CHAL2-01] scaffolded candidate worktree has 100% clean git status --porcelain', () => {
      const res = createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/cleanliness-check',
        output: candidateDir,
        designContract: standardContract
      });

      assert.equal(res.status, 'PASS');

      // Check git status --porcelain in candidate directory
      const porcelain = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });

      assert.equal(porcelain.trim(), '', `Expected 100% clean git status, got: "${porcelain}"`);

      // Check git status --porcelain with untracked-files=all
      const porcelainAll = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain=v1', '-uall'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });

      assert.equal(porcelainAll.trim(), '', `Expected clean git status -uall, got: "${porcelainAll}"`);
    });

    it('[M3-CHAL2-02] all expected harness files are scaffolded with correct permissions and structure', () => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/harness-files-check',
        output: candidateDir,
        designContract: standardContract
      });

      // Cursor harness files
      const cursorrules = path.join(candidateDir, '.cursorrules');
      const cursorMdc = path.join(candidateDir, '.cursor', 'rules', 'ctc-retrofit.mdc');
      assert.ok(fs.existsSync(cursorrules), '.cursorrules must exist');
      assert.ok(fs.existsSync(cursorMdc), '.cursor/rules/ctc-retrofit.mdc must exist');

      const mdcText = fs.readFileSync(cursorMdc, 'utf8');
      assert.ok(mdcText.includes('alwaysApply: true'), 'Cursor MDC must specify alwaysApply: true');
      assert.ok(mdcText.includes('--os-0'), 'Cursor MDC must mention Sol:OS neutral tokens');

      // Claude Code harness files
      const claudeMd = path.join(candidateDir, 'CLAUDE.md');
      assert.ok(fs.existsSync(claudeMd), 'CLAUDE.md must exist');
      const claudeText = fs.readFileSync(claudeMd, 'utf8');
      assert.ok(claudeText.includes('compileDebugKotlin'), 'CLAUDE.md must document verification commands from contract');
      assert.ok(claudeText.includes('Daylight DC1'), 'CLAUDE.md must specify Daylight DC1 profile');

      // Claude Code tool wrappers and schemas
      const tools = ['ctc-verify', 'ctc-defects', 'ctc-packet'];
      for (const tool of tools) {
        const flatJs = path.join(candidateDir, '.claude', 'skills', 'ctc', `${tool}.js`);
        const flatJson = path.join(candidateDir, '.claude', 'skills', 'ctc', `${tool}.json`);
        const nestedJs = path.join(candidateDir, '.claude', 'skills', 'ctc', tool, 'index.js');
        const nestedJson = path.join(candidateDir, '.claude', 'skills', 'ctc', tool, 'skill.json');

        assert.ok(fs.existsSync(flatJs), `${flatJs} must exist`);
        assert.ok(fs.existsSync(flatJson), `${flatJson} must exist`);
        assert.ok(fs.existsSync(nestedJs), `${nestedJs} must exist`);
        assert.ok(fs.existsSync(nestedJson), `${nestedJson} must exist`);

        // Verify executable permission on JS files (0o755)
        const stat = fs.statSync(flatJs);
        const isExecutable = (stat.mode & 0o111) !== 0;
        assert.ok(isExecutable, `${flatJs} must have executable permissions`);
      }

      // Metadata and packet files
      assert.ok(fs.existsSync(path.join(candidateDir, '.ctc-workspace.json')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'agent-packet.json')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'AGENT_PACKET.md')));
    });

    it('[M3-CHAL2-03] downstream verifyCandidateWorktree passes without false boundary violations', () => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/downstream-check',
        output: candidateDir,
        designContract: standardContract
      });

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });

      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.valid, true);
      assert.equal(verifyRes.violations.length, 0);
      assert.deepEqual(verifyRes.changedPaths, []);
    });

    it('[M3-CHAL2-04] CLI dispatch agent worktree scaffolds clean worktree verified by CLI verify', async () => {
      const cliWtRes = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'feat/cli-flow',
        '--output', candidateDir,
        '--json'
      ]);

      assert.equal(cliWtRes.status, 'PASS');
      assert.equal(cliWtRes.exitCode, 0);

      const contractPath = path.join(workspaceDir, 'retrofit-contract.json');
      const verifyRes = await dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // candidate verification must pass with zero violations
      assert.ok(verifyRes.data.candidateInfo, 'candidateInfo must be populated');
      assert.equal(verifyRes.data.candidateInfo.status, 'PASS');
      assert.equal(verifyRes.data.candidateInfo.violations.length, 0);
    });
  });

  // =========================================================================
  // Suite 2: Harness Modification Immunity & Exclude Isolation
  // =========================================================================
  describe('Suite 2: Harness Modification Immunity & Exclude Isolation', () => {
    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/harness-mutation',
        output: candidateDir,
        designContract: standardContract
      });
    });

    it('[M3-CHAL2-05] mutating .cursorrules does not show in git status and passes boundary check', () => {
      const file = path.join(candidateDir, '.cursorrules');
      fs.appendFileSync(file, '\n# Adversarial rule modification\n');

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-06] mutating .cursor/rules/ctc-retrofit.mdc does not show in git status and passes boundary check', () => {
      const file = path.join(candidateDir, '.cursor', 'rules', 'ctc-retrofit.mdc');
      fs.appendFileSync(file, '\n# Extra agent prompt directive\n');

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-07] mutating CLAUDE.md does not show in git status and passes boundary check', () => {
      const file = path.join(candidateDir, 'CLAUDE.md');
      fs.appendFileSync(file, '\n# Extra Claude instruction\n');

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-08] mutating .claude/skills/ctc/ctc-verify.js does not show in git status and passes boundary check', () => {
      const file = path.join(candidateDir, '.claude', 'skills', 'ctc', 'ctc-verify.js');
      fs.appendFileSync(file, '\n// Extra debugging logic\n');

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-09] adding new files in .cursor/ and .claude/ is covered by exclude wildcards', () => {
      fs.writeFileSync(path.join(candidateDir, '.cursor', 'rules', 'custom-rule.mdc'), '# Custom rule\n');
      fs.writeFileSync(path.join(candidateDir, '.claude', 'skills', 'ctc', 'custom-tool.js'), '// Custom tool\n');

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-10] deleting a harness file does not pollute git tracking', () => {
      fs.rmSync(path.join(candidateDir, '.cursorrules'));
      fs.rmSync(path.join(candidateDir, 'CLAUDE.md'));

      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });

    it('[M3-CHAL2-11] git add . stages only allowed files and does not stage mutated harness files', () => {
      // 1. Mutate harness files
      fs.appendFileSync(path.join(candidateDir, '.cursorrules'), '# mutated\n');
      fs.appendFileSync(path.join(candidateDir, 'CLAUDE.md'), '# mutated\n');

      // 2. Modify allowed Compose file
      const allowedFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(allowedFile, '// Retrofitted Compose UI Component\n');

      // 3. Run git add .
      execFileSync('git', ['-C', candidateDir, 'add', '.']);

      // 4. Verify staged files
      const staged = execFileSync('git', ['-C', candidateDir, 'diff', '--name-only', '--cached'], {
        encoding: 'utf8'
      }).trim().split('\n').filter(Boolean);

      assert.deepEqual(staged, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']);

      // 5. Downstream verify
      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });
      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
    });
  });

  // =========================================================================
  // Suite 3: Boundary Enforcement: Allowed vs Forbidden Edits
  // =========================================================================
  describe('Suite 3: Boundary Enforcement: Allowed vs Forbidden Edits', () => {
    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/boundary-stress',
        output: candidateDir,
        designContract: standardContract
      });
    });

    it('[M3-CHAL2-12] editing an allowed file passes boundary check with status: PASS', () => {
      const allowed = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.writeFileSync(allowed, 'package com.claude.noteapp.ui.editor\n\n// Retrofitted Compose screen\nfun NoteEditorScreen() {}\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });

      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
      assert.deepEqual(verifyRes.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']);
    });

    it('[M3-CHAL2-13] adding a new file inside allowed path passes boundary check', () => {
      const newFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/EditorToolbar.kt');
      fs.writeFileSync(newFile, 'package com.claude.noteapp.ui.editor\n\nfun EditorToolbar() {}\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract
      });

      assert.equal(verifyRes.status, 'PASS');
      assert.equal(verifyRes.violations.length, 0);
      assert.ok(verifyRes.changedPaths.includes('app/src/main/java/com/claude/noteapp/ui/editor/EditorToolbar.kt'));
    });

    it('[M3-CHAL2-14] editing a tracked data repository outside boundary fails with BOUNDARY_VIOLATION', () => {
      const dataFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.writeFileSync(dataFile, 'package com.claude.noteapp.data\n// Tampered Repository\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt'));
    });

    it('[M3-CHAL2-15] editing root build.gradle.kts fails with BOUNDARY_VIOLATION', () => {
      const buildFile = path.join(candidateDir, 'build.gradle.kts');
      fs.appendFileSync(buildFile, '// Injected build dependency\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === 'build.gradle.kts'));
    });

    it('[M3-CHAL2-16] editing AndroidManifest.xml fails with BOUNDARY_VIOLATION', () => {
      const manifestFile = path.join(candidateDir, 'app/src/main/AndroidManifest.xml');
      fs.appendFileSync(manifestFile, '<!-- injected comment -->\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === 'app/src/main/AndroidManifest.xml'));
    });

    it('[M3-CHAL2-17] adding an untracked rogue file in candidate root fails with BOUNDARY_VIOLATION', () => {
      const rogueFile = path.join(candidateDir, 'rogue_exploit.sh');
      fs.writeFileSync(rogueFile, '#!/bin/bash\necho hacked\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === 'rogue_exploit.sh'));
    });

    it('[M3-CHAL2-18] simultaneous allowed and forbidden edits isolates and flags only forbidden files', () => {
      // Allowed edit
      const allowed = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.writeFileSync(allowed, '// Valid modification\n');

      // Forbidden edit
      const forbidden = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.writeFileSync(forbidden, '// Invalid modification\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      // Must flag forbidden file
      assert.ok(verifyRes.violations.some(v => v.path === 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt'));
      // Must NOT flag allowed file
      assert.ok(!verifyRes.violations.some(v => v.path === 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt'));
    });
  });

  // =========================================================================
  // Suite 4: Adversarial Smuggling, Tampering, and Evasion Attacks
  // =========================================================================
  describe('Suite 4: Adversarial Smuggling, Tampering, and Evasion Attacks', () => {
    beforeEach(() => {
      createAgentWorktree({
        android: baselineDir,
        workspace: workspaceDir,
        branch: 'feat/adversarial-evasion',
        output: candidateDir,
        designContract: standardContract
      });
    });

    it('[M3-CHAL2-19] Attack: smuggling code into excluded directory under src/ is caught by gitIgnoredSourceEvidence', () => {
      // Adversary creates .claude/src/Malicious.kt thinking .claude is excluded from git
      const smuggleDir = path.join(candidateDir, '.claude', 'src');
      fs.mkdirSync(smuggleDir, { recursive: true });
      fs.writeFileSync(path.join(smuggleDir, 'Malicious.kt'), '// Malicious smuggled Kotlin code\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === '.claude/src/Malicious.kt'));
    });

    it('[M3-CHAL2-20] Attack: smuggling inspection file into excluded directory is caught by INSPECTION_FILES check', () => {
      // Adversary creates .claude/build.gradle
      fs.writeFileSync(path.join(candidateDir, '.claude', 'build.gradle'), '// Smuggled build script\n');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === '.claude/build.gradle'));
    });

    it('[M3-CHAL2-21] Attack: git add -f on harness file causes candidate verifier to fail boundary check', () => {
      // Force add .cursorrules to git index
      execFileSync('git', ['-C', candidateDir, 'add', '-f', '.cursorrules']);

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === '.cursorrules'));
    });

    it('[M3-CHAL2-22] Attack: wiping .git/info/exclude triggers fail-closed boundary rejection', () => {
      const gitCommonDir = gitCommonDirectory(candidateDir);
      const excludeFile = path.join(gitCommonDir, 'info', 'exclude');
      fs.writeFileSync(excludeFile, '', 'utf8');

      // Without exclude rules, git status will see untracked harness files
      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.ok(status.includes('.cursorrules'), 'Wiped exclude causes harness to appear in git status');

      const verifyRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: standardContract,
        throwOnError: false
      });

      assert.equal(verifyRes.status, 'FAIL');
      assert.ok(verifyRes.violations.some(v => v.path === '.cursorrules'));
    });

    it('[M3-CHAL2-23] Self-Healing: scaffoldAllHarnesses repairs .git/info/exclude idempotently', () => {
      const gitCommonDir = gitCommonDirectory(candidateDir);
      const excludeFile = path.join(gitCommonDir, 'info', 'exclude');
      // Remove harness patterns while keeping worktree metadata patterns
      const initialExclude = '.ctc-workspace.json\nagent-packet.json\nAGENT_PACKET.md\n# Custom user exclude\n*.log\n';
      fs.writeFileSync(excludeFile, initialExclude, 'utf8');

      // Call scaffoldAllHarnesses with updateGitExclude: true
      const scaffoldRes = scaffoldAllHarnesses(candidateDir, {
        env: 'candidate',
        updateGitExclude: true
      });

      assert.equal(scaffoldRes.gitExcludeUpdated, true);

      const excludeContent = fs.readFileSync(excludeFile, 'utf8');
      assert.ok(excludeContent.includes('*.log'), 'Preserves custom exclude');
      for (const pattern of HARNESS_EXCLUDE_PATTERNS) {
        assert.ok(excludeContent.includes(pattern), `Contains ${pattern}`);
      }

      // Re-running does not duplicate patterns
      const scaffoldRes2 = scaffoldAllHarnesses(candidateDir, {
        env: 'candidate',
        updateGitExclude: true
      });
      assert.equal(scaffoldRes2.gitExcludeUpdated, false);

      // Verify worktree is clean again
      const status = execFileSync('git', ['-C', candidateDir, 'status', '--porcelain'], { encoding: 'utf8' });
      assert.equal(status.trim(), '');
    });

    it('[M3-CHAL2-24] Attack: source-sensitive symlink injection is detected and fails verification', () => {
      // Create symlink pointing to app/src
      const linkPath = path.join(candidateDir, 'app', 'src', 'main', 'java', 'symlink_escape');
      try {
        fs.symlinkSync(path.join(tempRoot, 'non_existent'), linkPath);
      } catch (_) {}

      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          contract: standardContract,
          throwOnError: true
        }),
        (err) => err instanceof InputError && err.message.includes('symlink')
      );
    });

    it('[M3-CHAL2-25] Full Verification Handshake: CLI verify on mutated harness passes Stage 1 candidate check', async () => {
      // Mutate harness files
      fs.appendFileSync(path.join(candidateDir, '.cursorrules'), '\n# extra rule\n');
      fs.appendFileSync(path.join(candidateDir, 'CLAUDE.md'), '\n# extra instruction\n');
      fs.appendFileSync(path.join(candidateDir, '.cursor/rules/ctc-retrofit.mdc'), '\n# extra mdc\n');
      fs.appendFileSync(path.join(candidateDir, '.claude/skills/ctc/ctc-verify.js'), '\n// extra js\n');

      // Make allowed modification
      const allowedFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.writeFileSync(allowedFile, 'package com.claude.noteapp.ui.editor\n\n// Verified Compose UI\nfun NoteEditorScreen() {}\n');

      const contractPath = path.join(workspaceDir, 'retrofit-contract.json');
      const verifyRes = await dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Assert candidate verification passed cleanly
      assert.ok(verifyRes.data.candidateInfo);
      assert.equal(verifyRes.data.candidateInfo.status, 'PASS');
      assert.equal(verifyRes.data.candidateInfo.violations.length, 0);
      assert.deepEqual(verifyRes.data.candidateInfo.changedPaths, ['app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt']);
    });
  });
});
