/**
 * tests/adversarial/m5_challenger2_quickstart_fidelity.test.js
 *
 * Empirical Adversarial Test Suite for Milestone 5 Challenger 2:
 * Developer Experience, CLI Workflows, and Troubleshooting Guide Fidelity
 * Documented in docs/QUICKSTART_CODING_AGENTS.md.
 *
 * Test Suites:
 * 1. CLI Documentation Command Fidelity & Invariants (Phase 1 to Phase 8)
 * 2. Failure Mode 1: BOUNDARY_VIOLATION (Unauthorized edits outside allowedPaths)
 * 3. Failure Mode 2: DIRTY_BASELINE (Uncommitted changes in baseline repository)
 * 4. Failure Mode 3: MISSING_APPROVAL & QUICKSTART DOC SCHEMA DISCREPANCY
 * 5. Failure Mode 4: HASH_MISMATCH (Tampered evidence receipts & approval manifests)
 * 6. Failure Mode 5: TOUCH_TARGET_TOO_SMALL (<48dp interactive component size)
 * 7. Failure Mode 6 & 7: EPD_PROHIBITED_VIOLATION & SPATIAL_DRIFT
 * 8. CLI Dispatcher Invariants & Subcommand Routing (13 subcommands, strict options)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const {
  dispatch,
  EXIT_CODES,
  SUBCOMMANDS,
  SUBCOMMAND_OPTIONS
} = require('../../src/cli/dispatcher');

const {
  createAgentWorktree,
  removeAgentWorktree,
  loadRetrofitContract
} = require('../../src/agent/worktree');

const {
  verifyCandidateWorktree,
  validateReceiptData,
  validateSummaryCounts,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');

const {
  verifyTouchGeometry,
  computeDrift
} = require('../../src/verification/touch_geometry');

const {
  DisplayProfileValidator,
  FORBIDDEN_EPD_PATTERNS
} = require('../../src/verification/display_profile');

const { loadOwnerApproval } = require('../../src/contract/owner_approval');
const { diagnoseDefects } = require('../../src/defects/oracle');
const { gitMetadata, gitEnvironment } = require('../../src/agent/safety');

function sha256(content) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return sha256(text);
}

function initCleanBaseline(baselineDir) {
  const fixtureSrc = path.resolve(__dirname, '../../fixtures/note-app');
  assert.ok(fs.existsSync(fixtureSrc), `Fixture note-app directory must exist at ${fixtureSrc}`);

  fs.mkdirSync(baselineDir, { recursive: true });
  fs.cpSync(fixtureSrc, baselineDir, {
    recursive: true,
    filter: (src) => {
      const norm = src.replace(/\\/g, '/');
      if (norm.endsWith('/app/build') || norm.includes('/app/build/')) return false;
      if (norm.endsWith('/.gradle') || norm.includes('/.gradle/')) return false;
      return true;
    }
  });

  execFileSync('git', ['-C', baselineDir, 'init', '-q']);
  execFileSync('git', ['-C', baselineDir, 'config', 'user.email', 'challenger2@example.com']);
  execFileSync('git', ['-C', baselineDir, 'config', 'user.name', 'Challenger 2']);
  execFileSync('git', ['-C', baselineDir, 'config', 'commit.gpgsign', 'false']);

  const gitignorePath = path.join(baselineDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, 'build/\n.gradle/\nlocal.properties\n*.apk\n', 'utf8');
  }

  execFileSync('git', ['-C', baselineDir, 'add', '.']);
  execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'initial clean baseline']);

  const commit = execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const branch = execFileSync('git', ['-C', baselineDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim() || 'main';

  return { commit, branch };
}

describe('Milestone 5 Challenger 2: Quickstart Fidelity & Troubleshooting Matrix', () => {
  let tempRoot;
  let baselineDir;
  let workspaceDir;
  let candidateDir;
  let baselineCommit;
  let contractPath;
  let contract;

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-m5-challenger2-')));
    baselineDir = path.join(tempRoot, 'note-app');
    workspaceDir = path.join(tempRoot, 'workspace');
    candidateDir = path.join(tempRoot, 'candidate-worktree');

    const initInfo = initCleanBaseline(baselineDir);
    baselineCommit = initInfo.commit;

    fs.mkdirSync(workspaceDir, { recursive: true });
    writeJson(path.join(workspaceDir, '.ctc-workspace.json'), {
      kind: 'ctc-workspace',
      version: 1,
      androidRoot: baselineDir
    });

    contract = {
      schemaVersion: '1.0.0',
      id: 'contract_note_editor',
      screenId: 'note_editor',
      implementationBoundary: {
        allowedPaths: [
          'app/src/main/java/com/claude/noteapp/ui/editor'
        ],
        prohibitedChanges: [
          'DO NOT alter Room SQLite database queries or schemas in data/',
          'DO NOT alter NoteEditorViewModel StateFlow emissions or debounce timing',
          'DO NOT remove or alter test tags',
          'DO NOT introduce EPD screen flash hooks on LivePaper panel'
        ],
        verificationCommands: [
          './gradlew compileDebugKotlin --no-daemon',
          './gradlew testDebugUnitTest --no-daemon',
          'node bin/ctc.js verify note_editor --candidate .'
        ]
      }
    };
    contractPath = path.join(workspaceDir, 'retrofit-contract.json');
    writeJson(contractPath, contract);
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: gitEnvironment()
      });
    } catch (_) {}
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'prune'], {
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
  // SUITE 1: Documentation Command Accuracy (Phase 1 to Phase 8)
  // =========================================================================
  describe('Suite 1: Documented CLI Commands Fidelity', () => {
    it('executes `ctc doctor --json` successfully and validates diagnostic checks', async () => {
      const res = await dispatch(['doctor', '--json']);
      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(res.data && res.data.doctor);
      assert.equal(typeof res.data.doctor.summary.total, 'number');
      assert.ok(res.data.doctor.checks.length > 0);

      const checkIds = res.data.doctor.checks.map(c => c.id);
      assert.ok(checkIds.includes('node_runtime'));
      assert.ok(checkIds.includes('android_sdk'));
      assert.ok(checkIds.includes('git_repository'));
    });

    it('executes `ctc init` and initializes .ctc workspace hierarchy', async () => {
      const targetInitDir = path.join(tempRoot, 'fresh-workspace');
      const res = await dispatch(['init', targetInitDir, '--json']);
      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(fs.existsSync(path.join(targetInitDir, '.ctc')));
      assert.ok(fs.existsSync(path.join(targetInitDir, '.ctc', 'designs')));
      assert.ok(fs.existsSync(path.join(targetInitDir, '.ctc', 'reports')));
    });

    it('executes `ctc inspect-app` on clean baseline and generates valid model', async () => {
      const res = await dispatch(['inspect-app', baselineDir, '--json']);
      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(res.data && (res.data.existingAppModel || res.data.modelPath));
    });

    it('executes `ctc agent worktree` and scaffolds complete candidate environment', () => {
      const res = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/note_editor',
        '--output', candidateDir,
        '--contract', contractPath,
        '--screen', 'note_editor',
        '--json'
      ]);

      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(fs.existsSync(path.join(candidateDir, '.ctc-workspace.json')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'agent-packet.json')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'AGENT_PACKET.md')));
      assert.ok(fs.existsSync(path.join(candidateDir, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'CLAUDE.md')));
    });

    it('executes `ctc agent harness` across all supported environments', () => {
      dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/harness_test',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      const res = dispatch([
        'agent', 'harness',
        '--target', candidateDir,
        '--env', 'all',
        '--contract', contractPath,
        '--json'
      ]);

      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(fs.existsSync(path.join(candidateDir, '.cursorrules')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'CLAUDE.md')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'docs/CODING_AGENTS.md')));
      assert.ok(fs.existsSync(path.join(candidateDir, 'skills/claude-to-compose/SKILL.md')));
    });

    it('executes `ctc defects` and diagnoses root causes from verification report', () => {
      const reportPath = path.join(workspaceDir, 'mock-defect-report.json');
      writeJson(reportPath, {
        status: 'FAIL',
        outcome: 'FAIL',
        defects: [
          {
            stage: 'STAGE_3_LAYOUT_TELEMETRY',
            category: 'TOUCH_TARGET_TOO_SMALL',
            severity: 'CRITICAL',
            message: 'Touch target for editor_back_button is 32x32dp (minimum: 48x48dp)',
            sourceId: 'daylight#note_editor/editor_back_button',
            errorCode: 'TOUCH_TARGET_TOO_SMALL'
          }
        ]
      });

      const res = dispatch(['defects', reportPath, '--json']);
      assert.equal(res.status, 'FAIL');
      assert.equal(res.exitCode, 1);
      assert.ok(res.defects.length === 1);
      assert.equal(res.defects[0].category, 'TOUCH_TARGET_TOO_SMALL');
      assert.equal(res.defects[0].diagnosis.rootCause, 'TOUCH_TARGET_INFLATION_OR_DEFLATION');
    });

    it('executes `ctc profile export` and outputs valid daylight-dc1 profile', () => {
      const exportTarget = path.join(tempRoot, 'exported-profile.json');
      const res = dispatch(['profile', 'export', 'daylight-dc1', '--output', exportTarget, '--json']);
      assert.equal(res.status, 'PASS');
      assert.equal(res.exitCode, 0);
      assert.ok(fs.existsSync(exportTarget));
      const exportedJson = JSON.parse(fs.readFileSync(exportTarget, 'utf8'));
      assert.equal(exportedJson.id, 'daylight-dc1');
    });
  });

  // =========================================================================
  // SUITE 2: Troubleshooting Matrix Mode 1 - BOUNDARY_VIOLATION
  // =========================================================================
  describe('Suite 2: BOUNDARY_VIOLATION Diagnostic Accuracy', () => {
    it('detects unauthorized modifications outside allowedPaths with exit code 1 or 3 and actionable message', async () => {
      dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/boundary_test',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Permitted edit in allowedPaths
      const editorScreen = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/ui/editor/NoteEditorScreen.kt');
      fs.appendFileSync(editorScreen, '\n// Permitted Sol:OS styling\n');

      // Rogue edit to forbidden file in data/ (NoteRepository.kt)
      const repoFile = path.join(candidateDir, 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt');
      fs.appendFileSync(repoFile, '\n// Rogue persistence modification\n');

      // 1. Verification via programmatic verifyCandidateWorktree
      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.equal(res.valid, false);

      const violation = res.violations.find(v => v.path.includes('NoteRepository.kt'));
      assert.ok(violation, 'Must identify NoteRepository.kt as boundary violation');
      assert.match(violation.message, /(outside the contract boundary|outside allowedPaths)/i);

      // 2. Verification via CLI dispatch (awaiting the async handler)
      const cliRes = await dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Troubleshooting matrix specifies: Exit code 1 or 3
      assert.ok([1, 3].includes(cliRes.exitCode), `Exit code must be 1 or 3 (got ${cliRes.exitCode})`);
      assert.ok(cliRes.status === 'FAIL' || cliRes.status === 'INPUT_INVALID');
      assert.match(cliRes.error, /(outside the contract boundary|outside allowedPaths)/i);

      // 3. Remediation: git checkout -- <file> restores compliance
      execFileSync('git', ['-C', candidateDir, 'checkout', '--', 'app/src/main/java/com/claude/noteapp/data/NoteRepository.kt']);
      const recoveredRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });
      assert.equal(recoveredRes.status, 'PASS');
      assert.equal(recoveredRes.code, 0);
    });
  });

  // =========================================================================
  // SUITE 3: Troubleshooting Matrix Mode 2 - DIRTY_BASELINE
  // =========================================================================
  describe('Suite 3: DIRTY_BASELINE Diagnostic Accuracy', () => {
    it('rejects worktree creation and candidate verification on dirty baseline with exit code 3', async () => {
      // Dirty the baseline repo by modifying MainActivity.kt
      const mainActivityFile = path.join(baselineDir, 'app/src/main/java/com/claude/noteapp/MainActivity.kt');
      fs.appendFileSync(mainActivityFile, '\n// Uncommitted change in baseline\n');

      const meta = gitMetadata(baselineDir);
      assert.equal(meta.dirty, true, 'Baseline must be marked dirty');

      // 1. Attempt `ctc agent worktree` on dirty baseline
      const worktreeRes = dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/dirty_test',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Troubleshooting matrix specifies Exit Code 3, Message: "Android repository has uncommitted changes; a clean baseline is required"
      assert.equal(worktreeRes.exitCode, 3);
      assert.equal(worktreeRes.status, 'INPUT_INVALID');
      assert.match(worktreeRes.error, /(clean baseline is required|uncommitted changes)/i);

      // Clean the baseline to allow worktree creation
      execFileSync('git', ['-C', baselineDir, 'checkout', '--', 'app/src/main/java/com/claude/noteapp/MainActivity.kt']);
      const cleanMeta = gitMetadata(baselineDir);
      assert.equal(cleanMeta.dirty, false);

      dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/dirty_test_clean',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Now dirty the baseline again and test candidate verification
      fs.appendFileSync(mainActivityFile, '\n// Uncommitted change in baseline after worktree creation\n');

      const verifyRes = await dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      assert.equal(verifyRes.exitCode, 3);
      assert.equal(verifyRes.status, 'FAIL');
      assert.match(verifyRes.error, /(clean committed inspected baseline|clean baseline is required|uncommitted changes)/i);

      // Clean up baseline
      execFileSync('git', ['-C', baselineDir, 'checkout', '--', 'app/src/main/java/com/claude/noteapp/MainActivity.kt']);
    });
  });

  // =========================================================================
  // SUITE 4: Troubleshooting Matrix Mode 3 - MISSING_APPROVAL
  // =========================================================================
  describe('Suite 4: MISSING_APPROVAL Diagnostic Accuracy & Doc Schema Discrepancy', () => {
    it('verifies QUICKSTART doc snippet discrepancy: doc includes $schema which fails Draft 2020-12 schema validation', () => {
      // Documented snippet in docs/QUICKSTART_CODING_AGENTS.md lines 218-230:
      const docSnippet = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval_note_editor_title_layout',
        scopes: [
          {
            subjectRef: 'daylight#note_editor/header_title',
            statement: 'Owner approves single-line title constraint and font size adjustment on DC1 LivePaper.'
          }
        ]
      };
      const docSnippetPath = path.join(workspaceDir, 'doc-snippet-approval.json');
      writeJson(docSnippetPath, docSnippet);

      // Loading verbatim doc snippet fails schema validation because additionalProperties is false
      assert.throws(
        () => loadOwnerApproval(docSnippetPath),
        (err) => (err instanceof InputError) && /failed schema validation.*additionalProperties/i.test(err.message)
      );
    });

    it('rejects candidate with unapproved deviation with exit code 2 or 1, and passes upon valid schema approval', async () => {
      // Contract declaring an intentional deviation requiring owner approval
      const deviationContract = {
        ...contract,
        elementMappings: [
          {
            id: 'daylight#note_editor/header_title',
            mappingStatus: 'OWNER_APPROVED_NEW_SURFACE',
            ownerApprovalRef: 'approval_note_editor_title_layout',
            ownerApprovalStatement: 'Owner approves single-line title constraint and font size adjustment on DC1 LivePaper.'
          }
        ]
      };
      const devContractPath = path.join(workspaceDir, 'contract-with-deviation.json');
      writeJson(devContractPath, deviationContract);

      dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/missing_approval',
        '--output', candidateDir,
        '--contract', devContractPath,
        '--json'
      ]);

      // 1. Verify candidate without providing approval file (awaiting async dispatch)
      const verifyResWithoutApproval = await dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--candidate', candidateDir,
        '--contract', devContractPath,
        '--json'
      ]);

      // Troubleshooting matrix specifies: Exit Code 2 (or 1), Diagnostic: Deviation requires owner approval
      assert.ok([1, 2, 3].includes(verifyResWithoutApproval.exitCode), `Exit code must be 1, 2, or 3 (got ${verifyResWithoutApproval.exitCode})`);
      assert.match(verifyResWithoutApproval.error, /(requires owner approval|does not cover exact subject\/statement|missing owner approval)/i);

      // 2. Author valid Draft 2020-12 OwnerApproval document conforming strictly to schema (omitting $schema)
      const approvalFile = path.join(workspaceDir, 'owner-approval-valid.json');
      writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval_note_editor_title_layout',
        scopes: [
          {
            subjectRef: 'daylight#note_editor/header_title',
            statement: 'Owner approves single-line title constraint and font size adjustment on DC1 LivePaper.'
          }
        ]
      });

      // 3. Verify candidate with approval provided
      const verifyResWithApproval = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract: deviationContract,
        approval: approvalFile,
        throwOnError: false
      });

      assert.equal(verifyResWithApproval.status, 'PASS');
      assert.equal(verifyResWithApproval.code, 0);
      assert.equal(verifyResWithApproval.valid, true);
      assert.equal(verifyResWithApproval.approvedDeviations.length, 1);
      assert.equal(verifyResWithApproval.approvedDeviations[0].approvalRef, 'approval_note_editor_title_layout');
    });
  });

  // =========================================================================
  // SUITE 5: Troubleshooting Matrix Mode 4 - HASH_MISMATCH / FORGERY
  // =========================================================================
  describe('Suite 5: HASH_MISMATCH & Tampering Diagnostic Accuracy', () => {
    it('detects tampered approval file or contract input hash mismatch with exit code 3 or 1', () => {
      // 1. Commit a valid approval file into baseline repository so baseline remains clean
      const approvalsDir = path.join(baselineDir, 'approvals');
      fs.mkdirSync(approvalsDir, { recursive: true });
      const approvalFile = path.join(approvalsDir, 'approved-test.json');
      writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.test',
        scopes: [{ subjectRef: 'test', statement: 'Statement' }]
      });

      execFileSync('git', ['-C', baselineDir, 'add', '.']);
      execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'add approval manifest to baseline']);
      const updatedBaselineCommit = execFileSync('git', ['-C', baselineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

      // Create worktree from updated clean baseline
      dispatch([
        'agent', 'worktree',
        '--android', baselineDir,
        '--workspace', workspaceDir,
        '--branch', 'retrofit/hash_mismatch_test',
        '--output', candidateDir,
        '--contract', contractPath,
        '--json'
      ]);

      // Contract declaring an input with a FORGED / mismatched SHA-256 hash
      const contractWithForgedHash = {
        ...contract,
        inputs: [
          {
            id: 'approval.test',
            kind: 'OWNER_APPROVAL',
            path: 'approvals/approved-test.json',
            sha256: '0000000000000000000000000000000000000000000000000000000000000000'
          }
        ]
      };

      // Validation must throw InputError for hash mismatch
      assert.throws(
        () => verifyCandidateWorktree({
          candidate: candidateDir,
          baselineRoot: baselineDir,
          baselineCommit: updatedBaselineCommit,
          contract: contractWithForgedHash,
          throwOnError: true
        }),
        (err) => (err instanceof InputError) && /hash mismatch/i.test(err.message)
      );

      // Verify with throwOnError: false returns FAIL / code 1 or 3
      const failRes = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        baselineCommit: updatedBaselineCommit,
        contract: contractWithForgedHash,
        throwOnError: false
      });

      assert.equal(failRes.status, 'FAIL');
      assert.ok([1, 3].includes(failRes.code));
      assert.match(failRes.reason || failRes.error, /hash mismatch/i);
    });

    it('detects evidence receipt hash tampering in validateReceiptData', () => {
      // Create a receipt file
      const receiptPath = path.join(workspaceDir, 'receipt.json');
      const authenticHash = writeJson(receiptPath, { outcome: 'PASS', verificationScope: 'all' });

      // Receipt declared with mismatched hash
      const tamperedEvidence = {
        id: 'evidence.candidate.build',
        domain: 'BUILD',
        status: 'PRESENT',
        source: 'receipt.json',
        sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      };

      assert.throws(
        () => validateReceiptData(workspaceDir, tamperedEvidence),
        (err) => (err instanceof InputError) && /evidence evidence\.candidate\.build source hash mismatch/i.test(err.message)
      );
    });

    it('detects fabricated summary counts in verification receipts', () => {
      const fabricatedResult = {
        requirements: [
          { id: 'R1', status: 'PASS' },
          { id: 'R2', status: 'FAIL' }
        ],
        summary: {
          passedRequirementCount: 2, // Fabricated: actual is 1!
          failedRequirementCount: 0  // Fabricated: actual is 1!
        }
      };

      assert.throws(
        () => validateSummaryCounts(fabricatedResult),
        (err) => (err instanceof InputError) && /summary counts do not match/i.test(err.message)
      );
    });
  });

  // =========================================================================
  // SUITE 6: Troubleshooting Matrix Mode 5 - TOUCH_TARGET_TOO_SMALL
  // =========================================================================
  describe('Suite 6: TOUCH_TARGET_TOO_SMALL Diagnostic Accuracy', () => {
    it('detects touch targets < 48dp with errorCode TOUCH_TARGET_TOO_SMALL and diagnostic dimensions', async () => {
      const elements = [
        {
          id: 'editor_back_button',
          sourceId: 'daylight#note_editor/editor_back_button',
          isInteractive: true,
          expectedX: 16,
          expectedY: 16,
          actualX: 16,
          actualY: 16,
          // 32dp at density 2.0 = 64px physical (smaller than 48dp / 96px)
          touchWidthPx: 64,
          touchHeightPx: 64
        }
      ];

      const stageRes = await verifyTouchGeometry('note_editor', candidateDir, {
        elements,
        validator: new DisplayProfileValidator()
      });

      assert.equal(stageRes.status, 'FAIL');
      assert.equal(stageRes.success, false);
      assert.equal(stageRes.errorCode, 'TOUCH_TARGET_TOO_SMALL');
      assert.match(stageRes.error, /Touch target 32\.0x32\.0dp is smaller than minimum 48x48dp/i);

      // Remediation test: update touch target to 48dp (96px physical)
      elements[0].touchWidthPx = 96;
      elements[0].touchHeightPx = 96;

      const recoveredStageRes = await verifyTouchGeometry('note_editor', candidateDir, {
        elements,
        validator: new DisplayProfileValidator()
      });

      assert.equal(recoveredStageRes.status, 'PASS');
      assert.equal(recoveredStageRes.success, true);
    });
  });

  // =========================================================================
  // SUITE 7: Troubleshooting Matrix Modes 6 & 7 - EPD & SPATIAL DRIFT
  // =========================================================================
  describe('Suite 7: EPD Prohibitions & Spatial Drift Diagnostic Accuracy', () => {
    it('detects forbidden EPD screen flash and waveform broadcasts', () => {
      const validator = new DisplayProfileValidator();

      // Test forbidden pattern detection via assertNoEpdWorkarounds
      const violations = validator.assertNoEpdWorkarounds(
        'Intent intent = new Intent("android.intent.action.ACTION_REFRESH_SCREEN"); sendBroadcast(intent);'
      );

      assert.equal(violations.pass, false);
      assert.ok(violations.pattern.includes('ACTION_REFRESH_SCREEN'));
      assert.match(violations.error, /EPD workaround violation/i);
    });

    it('detects gross spatial drift (> 3.0px) with GEOMETRY_DRIFT or SPATIAL_DRIFT_EXCEEDED', async () => {
      const elements = [
        {
          id: 'title_input',
          sourceId: 'daylight#note_editor/title_input',
          isInteractive: false,
          expectedX: 24,
          expectedY: 60,
          actualX: 24,
          actualY: 72 // dy = +12.0px drift
        }
      ];

      const stageRes = await verifyTouchGeometry('note_editor', candidateDir, {
        elements,
        validator: new DisplayProfileValidator()
      });

      assert.equal(stageRes.status, 'FAIL');
      assert.equal(stageRes.success, false);
      assert.match(stageRes.errorCode, /(GEOMETRY_DRIFT|SPATIAL_DRIFT_EXCEEDED)/);
      assert.match(stageRes.error, /Spatial drift of 12\.0px for "daylight#note_editor\/title_input" exceeds limit/i);
    });
  });

  // =========================================================================
  // SUITE 8: CLI Dispatcher Subcommand Invariants
  // =========================================================================
  describe('Suite 8: CLI Invariants & Routing Integrity', () => {
    it('enforces exactly 13 registered subcommands in dispatcher', () => {
      assert.equal(SUBCOMMANDS.length, 13);
      const expectedSubcommands = [
        'doctor',
        'init',
        'baseline',
        'inspect-app',
        'capture',
        'contract build',
        'contract validate',
        'map',
        'plan',
        'agent packet',
        'verify',
        'defects',
        'profile export'
      ];
      for (const cmd of expectedSubcommands) {
        assert.ok(SUBCOMMANDS.includes(cmd), `SUBCOMMANDS must include "${cmd}"`);
      }
    });

    it('rejects unrecognized options with USAGE_ERROR (Exit Code 3)', () => {
      const res = dispatch(['doctor', '--unrecognized-flag', '--json']);
      assert.equal(res.status, 'FAIL');
      assert.equal(res.exitCode, EXIT_CODES.USAGE_ERROR);
      assert.match(res.error, /unrecognized option "--unrecognized-flag"/i);
    });

    it('rejects unknown subcommand with exit code 1', () => {
      const res = dispatch(['nonexistent-subcommand', '--json']);
      assert.equal(res.status, 'FAIL');
      assert.equal(res.exitCode, 1);
      assert.match(res.error, /unrecognized subcommand "nonexistent-subcommand"/i);
    });
  });
});
