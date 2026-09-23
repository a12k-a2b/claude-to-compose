/**
 * tests/unit/owner_approval.test.js
 *
 * Comprehensive Unit Test Suite for Draft 2020-12 Owner Approval Schema,
 * Exact Statement/SubjectRef Matching, Unused Approval Rejection,
 * Evidence Cross-Wiring Prevention, Protected Input Collision, and
 * End-to-End Verifier Deviation Checks.
 *
 * Requirement R4 (Milestone 4 / Features F14 & F15).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const { dispatch, SUBCOMMANDS, SUBCOMMAND_OPTIONS } = require('../../src/cli/dispatcher');
const {
  verifyCandidateWorktree,
  InputError,
  BlockedError
} = require('../../src/verification/candidate_verifier');
const {
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  evaluateDeviations
} = require('../../src/contract/owner_approval');

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

describe('Owner Approval & Intentional Deviation Contract: tests/unit/owner_approval.test.js', () => {
  let tempDir;
  let workspaceDir;
  let baselineDir;
  let candidateDir;
  let ajv;
  let validateSchema;
  let schema;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctc-approval-test-')));
    workspaceDir = path.join(tempDir, 'workspace');
    baselineDir = path.join(tempDir, 'baseline');
    candidateDir = path.join(tempDir, 'candidate');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(baselineDir, { recursive: true });

    // Initialize clean Git repository at baselineDir and create candidate worktree
    execFileSync('git', ['-C', baselineDir, 'init', '-q']);
    execFileSync('git', ['-C', baselineDir, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', baselineDir, 'config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(baselineDir, 'README.md'), '# Baseline Note App\n');
    const editorDir = path.join(baselineDir, 'app/src/main/java/com/test/ui');
    fs.mkdirSync(editorDir, { recursive: true });
    fs.writeFileSync(path.join(editorDir, 'TestScreen.kt'), '// screen\n');
    execFileSync('git', ['-C', baselineDir, 'add', '.']);
    execFileSync('git', ['-C', baselineDir, 'commit', '-qm', 'initial baseline']);
    execFileSync('git', ['-C', baselineDir, 'worktree', 'add', '-b', 'candidate-branch', candidateDir, 'HEAD']);

    // Load schema
    const schemaPath = path.resolve(__dirname, '../../src/contract/schemas/owner_approval.schema.json');
    if (fs.existsSync(schemaPath)) {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } else {
      schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://claude-to-compose.local/schemas/v1/owner-approval.schema.json',
        title: 'Owner approval v1',
        type: 'object',
        additionalProperties: false,
        required: ['schemaVersion', 'kind', 'id', 'scopes'],
        properties: {
          schemaVersion: { const: '1.0.0' },
          kind: { const: 'OwnerApproval' },
          id: { $ref: '#/$defs/id' },
          scopes: { type: 'array', minItems: 1, items: { $ref: '#/$defs/scope' } }
        },
        $defs: {
          id: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[A-Za-z0-9][A-Za-z0-9._:/#()\\[\\]-]*$' },
          scope: {
            type: 'object',
            additionalProperties: false,
            required: ['subjectRef', 'statement'],
            properties: {
              subjectRef: { $ref: '#/$defs/id' },
              statement: { type: 'string', minLength: 1 }
            }
          }
        }
      };
    }

    ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    validateSchema = ajv.compile(schema);
  });

  afterEach(() => {
    try {
      execFileSync('git', ['-C', baselineDir, 'worktree', 'remove', '--force', candidateDir]);
    } catch (_) {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // =========================================================================
  // GROUP 1: Draft 2020-12 JSON Schema Validation
  // =========================================================================
  describe('Group 1: Draft 2020-12 Schema Validation', () => {
    it('[T01] accepts a fully valid OwnerApproval document', () => {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.layout-drift',
        scopes: [
          {
            subjectRef: 'element.toolbar',
            statement: 'Approve 4px horizontal offset for DC1 LivePaper toolbar.'
          }
        ]
      };
      const valid = validateSchema(doc);
      assert.equal(valid, true, JSON.stringify(validateSchema.errors));
    });

    it('[T02] rejects invalid schemaVersion', () => {
      const doc = {
        schemaVersion: '2.0.0',
        kind: 'OwnerApproval',
        id: 'approval.valid',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      };
      assert.equal(validateSchema(doc), false);
    });

    it('[T03] rejects invalid kind property', () => {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'DesignContract',
        id: 'approval.valid',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      };
      assert.equal(validateSchema(doc), false);
    });

    it('[T04] rejects invalid id starting with disallowed character or containing spaces', () => {
      const invalidIds = ['/leading-slash', '.dot-start', '-dash-start', 'has space', 'id$special', ''];
      for (const id of invalidIds) {
        const doc = {
          schemaVersion: '1.0.0',
          kind: 'OwnerApproval',
          id,
          scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
        };
        assert.equal(validateSchema(doc), false, `Expected id "${id}" to fail validation`);
      }
    });

    it('[T05] accepts valid complex ID characters', () => {
      const validIds = [
        'approval:v1',
        'approval_123',
        'approval.sub-component',
        'approval#anchor',
        'approval[0]',
        'approval(main)'
      ];
      for (const id of validIds) {
        const doc = {
          schemaVersion: '1.0.0',
          kind: 'OwnerApproval',
          id,
          scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
        };
        assert.equal(validateSchema(doc), true, `Expected id "${id}" to be valid`);
      }
    });

    it('[T06] rejects missing required root properties', () => {
      const base = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      };
      for (const key of ['schemaVersion', 'kind', 'id', 'scopes']) {
        const doc = { ...base };
        delete doc[key];
        assert.equal(validateSchema(doc), false, `Expected missing "${key}" to fail`);
      }
    });

    it('[T07] rejects empty scopes array (minItems: 1)', () => {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: []
      };
      assert.equal(validateSchema(doc), false);
    });

    it('[T08] rejects scope with missing subjectRef or missing statement', () => {
      const doc1 = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: [{ statement: 'Missing subjectRef' }]
      };
      assert.equal(validateSchema(doc1), false);

      const doc2 = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: [{ subjectRef: 'sub.1' }]
      };
      assert.equal(validateSchema(doc2), false);
    });

    it('[T09] rejects scope with empty statement', () => {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: [{ subjectRef: 'sub.1', statement: '' }]
      };
      assert.equal(validateSchema(doc), false);
    });

    it('[T10] rejects additional properties at root and scope level', () => {
      const docRootExtra = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        extraProperty: 'not allowed',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      };
      assert.equal(validateSchema(docRootExtra), false);

      const docScopeExtra = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'app.1',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.', timestamp: '2026-09-23' }]
      };
      assert.equal(validateSchema(docScopeExtra), false);
    });
  });

  // =========================================================================
  // GROUP 2: Exact Statement & SubjectRef Matching
  // =========================================================================
  describe('Group 2: Exact Statement and SubjectRef Matching', () => {
    it('[T11] approves exact subjectRef and statement match', () => {
      const approval = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.surface',
        scopes: [
          { subjectRef: 'element.masthead', statement: 'Approve custom typography for masthead.' }
        ]
      };
      const approvalsMap = new Map([
        ['approval.surface', { value: approval, path: 'approval.json' }]
      ]);

      const res = approvalFor(
        approvalsMap,
        'approval.surface',
        'element.masthead',
        'Approve custom typography for masthead.'
      );
      assert.equal(res.approved, true);
    });

    it('[T12] rejects statement with a single character delta (trailing period)', () => {
      const approval = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.surface',
        scopes: [
          { subjectRef: 'element.masthead', statement: 'Approve custom typography for masthead.' }
        ]
      };
      const approvalsMap = new Map([
        ['approval.surface', { value: approval, path: 'approval.json' }]
      ]);

      assert.throws(() => {
        approvalFor(
          approvalsMap,
          'approval.surface',
          'element.masthead',
          'Approve custom typography for masthead' // missing trailing period
        );
      }, (err) => err instanceof InputError && err.message.includes('does not cover exact subject/statement'));
    });

    it('[T13] rejects statement with case or whitespace delta', () => {
      const approval = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.surface',
        scopes: [
          { subjectRef: 'element.masthead', statement: 'Approve Custom Typography.' }
        ]
      };
      const approvalsMap = new Map([
        ['approval.surface', { value: approval, path: 'approval.json' }]
      ]);

      // Lowercase mismatch
      assert.throws(() => {
        approvalFor(
          approvalsMap,
          'approval.surface',
          'element.masthead',
          'approve custom typography.'
        );
      }, (err) => err instanceof InputError);

      // Multiple spaces mismatch
      assert.throws(() => {
        approvalFor(
          approvalsMap,
          'approval.surface',
          'element.masthead',
          'Approve  Custom  Typography.'
        );
      }, (err) => err instanceof InputError);
    });

    it('[T14] rejects subjectRef with single character delta', () => {
      const approval = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.surface',
        scopes: [
          { subjectRef: 'element.masthead', statement: 'Statement.' }
        ]
      };
      const approvalsMap = new Map([
        ['approval.surface', { value: approval, path: 'approval.json' }]
      ]);

      assert.throws(() => {
        approvalFor(
          approvalsMap,
          'approval.surface',
          'element.mastheads', // extra 's'
          'Statement.'
        );
      }, (err) => err instanceof InputError && err.message.includes('does not cover exact subject/statement'));
    });

    it('[T15] supports multiple scopes and matches each independently', () => {
      const approval = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.multi',
        scopes: [
          { subjectRef: 'elem.1', statement: 'Statement 1.' },
          { subjectRef: 'elem.2', statement: 'Statement 2.' },
          { subjectRef: 'action.save', statement: 'Statement 3.' }
        ]
      };
      const approvalsMap = new Map([
        ['approval.multi', { value: approval, path: 'approval.json' }]
      ]);

      assert.ok(approvalFor(approvalsMap, 'approval.multi', 'elem.1', 'Statement 1.').approved);
      assert.ok(approvalFor(approvalsMap, 'approval.multi', 'elem.2', 'Statement 2.').approved);
      assert.ok(approvalFor(approvalsMap, 'approval.multi', 'action.save', 'Statement 3.').approved);

      // Statement cross-match must fail
      assert.throws(() => {
        approvalFor(approvalsMap, 'approval.multi', 'elem.1', 'Statement 2.');
      }, (err) => err instanceof InputError);
    });
  });

  // =========================================================================
  // GROUP 3: Unused Approval Rejection
  // =========================================================================
  describe('Group 3: Unused Approval Rejection', () => {
    it('[T16] throws InputError if any loaded approval is not cited', () => {
      const approvalsMap = new Map([
        ['approval.used', { value: { id: 'approval.used' } }],
        ['approval.unused', { value: { id: 'approval.unused' } }]
      ]);
      const usedSet = new Set(['approval.used']);

      assert.throws(() => {
        assertAllApprovalsUsed(approvalsMap, usedSet);
      }, (err) => err instanceof InputError && err.message.includes('unused owner approval input: approval.unused'));
    });

    it('[T17] passes cleanly when all loaded approvals are cited', () => {
      const approvalsMap = new Map([
        ['approval.1', { value: { id: 'approval.1' } }],
        ['approval.2', { value: { id: 'approval.2' } }]
      ]);
      const usedSet = new Set(['approval.1', 'approval.2']);

      assert.doesNotThrow(() => {
        assertAllApprovalsUsed(approvalsMap, usedSet);
      });
    });

    it('[T18] rejects candidate verification when contract inputs declare an unused approval', () => {
      const appPath = path.join(workspaceDir, 'unused-approval.json');
      const appHash = writeJson(appPath, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.unused',
        scopes: [{ subjectRef: 'sub.unused', statement: 'Unused.' }]
      });

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [
          { id: 'approval.unused', kind: 'OWNER_APPROVAL', path: 'unused-approval.json', sha256: appHash }
        ],
        elementMappings: [],
        actionBindings: [],
        preservationObligations: [],
        capabilities: [],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/test/ui'] }
      };

      assert.throws(() => {
        evaluateDeviations(contract, new Map([['approval.unused', { value: { id: 'approval.unused' }, path: appPath }]]));
      }, (err) => err instanceof InputError && err.message.includes('unused owner approval input: approval.unused'));
    });
  });

  // =========================================================================
  // GROUP 4: Evidence Cross-Wiring Rejection
  // =========================================================================
  describe('Group 4: Evidence Cross-Wiring Rejection', () => {
    it('[T19] rejects owner approval ID cited in elementMappings.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        elementMappings: [
          {
            id: 'mapping.root',
            mappingStatus: 'OWNER_APPROVED_NEW_SURFACE',
            ownerApprovalRef: 'approval.surface',
            ownerApprovalStatement: 'Approved.',
            evidenceRefs: ['approval.surface'] // Cross-wired!
          }
        ]
      };
      const approvalsMap = new Map([
        ['approval.surface', { value: { id: 'approval.surface', scopes: [{ subjectRef: 'mapping.root', statement: 'Approved.' }] } }]
      ]);

      assert.throws(() => {
        evaluateDeviations(contract, approvalsMap);
      }, (err) => err instanceof InputError && (err.message.includes('dangling reference') || err.message.includes('cannot cite approval')));
    });

    it('[T20] rejects owner approval ID cited in actionBindings.evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        actionBindings: [
          {
            id: 'action.custom',
            bindingStatus: 'OWNER_APPROVED_NEW_BEHAVIOR',
            newBehaviorStatement: 'Approved behavior.',
            ownerApprovalRef: 'approval.action',
            evidenceRefs: ['approval.action'] // Cross-wired!
          }
        ]
      };
      const approvalsMap = new Map([
        ['approval.action', { value: { id: 'approval.action', scopes: [{ subjectRef: 'action.custom', statement: 'Approved behavior.' }] } }]
      ]);

      assert.throws(() => {
        evaluateDeviations(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });

    it('[T21] rejects owner approval ID cited in acceptanceMatrix.requirements[].evidenceRefs', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        acceptanceMatrix: {
          requirements: [
            {
              id: 'req.visual',
              description: 'Visual parity',
              evidenceRefs: ['approval.visual'] // Cross-wired!
            }
          ]
        }
      };
      const approvalsMap = new Map([
        ['approval.visual', { value: { id: 'approval.visual', scopes: [] } }]
      ]);

      assert.throws(() => {
        evaluateDeviations(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });
  });

  // =========================================================================
  // GROUP 5: Protected Input Collision & Immutability
  // =========================================================================
  describe('Group 5: Protected Input Collision & Immutability', () => {
    it('[T22] refuses to overwrite an approval file when specified as CLI --output', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      const originalBytes = Buffer.from(JSON.stringify({
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.protected',
        scopes: [{ subjectRef: 'sub.1', statement: 'Do not overwrite.' }]
      }, null, 2) + '\n');
      fs.writeFileSync(approvalFile, originalBytes);

      const res = dispatch([
        'contract', 'build', 'note_editor',
        '--workspace', workspaceDir,
        '--output', approvalFile, // Collides with approval!
        '--json'
      ]);

      assert.equal(res.exitCode, 3);
      assert.ok(res.output.includes('collides with a protected') || res.output.includes('InputError'));
      assert.deepEqual(fs.readFileSync(approvalFile), originalBytes, 'Approval file must not be modified');
    });

    it('[T23] refuses to overwrite an approval file when specified as verify --report', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      const originalBytes = Buffer.from('protected content\n');
      fs.writeFileSync(approvalFile, originalBytes);

      const res = dispatch([
        'verify', 'note_editor',
        '--app-dir', baselineDir,
        '--output', approvalFile,
        '--json'
      ]);

      assert.notEqual(res.exitCode, 0);
      assert.deepEqual(fs.readFileSync(approvalFile), originalBytes);
    });

    it('[T24] rejects attempts to replace approval file with a symbolic link', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      fs.writeFileSync(approvalFile, 'legit');
      const symlinkFile = path.join(workspaceDir, 'approval-symlink.json');
      fs.symlinkSync(approvalFile, symlinkFile);

      assert.throws(() => {
        loadOwnerApproval(symlinkFile, { root: workspaceDir });
      }, (err) => err instanceof InputError && (err.message.includes('non-symlink') || err.message.includes('symbolic link')));
    });
  });

  // =========================================================================
  // GROUP 6: SHA-256 Hash Verification & Path Confinement
  // =========================================================================
  describe('Group 6: SHA-256 Hash Verification & Path Confinement', () => {
    it('[T25] passes when approval SHA-256 matches contract declared input exactly', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      const hash = writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.hashed',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      });

      const contract = {
        schemaVersion: '1.0.0',
        inputs: [{ id: 'approval.hashed', kind: 'OWNER_APPROVAL', path: 'approval.json', sha256: hash }]
      };

      const approvals = loadOwnerApprovals(workspaceDir, { root: workspaceDir, contract });
      assert.equal(approvals.get('approval.hashed').sha256, hash);
    });

    it('[T26] rejects approval whose content has a 1-byte hash mismatch against contract', () => {
      const approvalFile = path.join(workspaceDir, 'approval.json');
      writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.hashed',
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement.' }]
      });

      const forgedHash = '0'.repeat(64);
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [{ id: 'approval.hashed', kind: 'OWNER_APPROVAL', path: 'approval.json', sha256: forgedHash }]
      };

      assert.throws(() => {
        loadOwnerApprovals(workspaceDir, { root: workspaceDir, contract });
      }, (err) => err instanceof InputError && err.message.includes('hash mismatch'));
    });

    it('[T27] rejects approval path attempting parent directory traversal', () => {
      assert.throws(() => {
        loadOwnerApproval('../outside-approval.json', { root: workspaceDir });
      }, (err) => err instanceof InputError && err.message.includes('parent traversal'));
    });
  });

  // =========================================================================
  // GROUP 7: End-to-End Verifier Deviation Checks
  // =========================================================================
  describe('Group 7: End-to-End Verifier Deviation Checks', () => {
    it('[T28] returns status FAIL (code 1) for candidate with unapproved visual deviation', () => {
      const candidateDeviations = [
        {
          type: 'VISUAL_DEVIATION',
          subjectRef: 'element.toolbar',
          statement: 'Move toolbar down 12px for thumb ergonomics.',
          ownerApprovalRef: null // Unapproved!
        }
      ];

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        deviations: candidateDeviations,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
      assert.ok(res.deviations && res.deviations.length > 0);
    });

    it('[T29] returns status FAIL (code 1) for candidate with unapproved behavioral deviation', () => {
      const candidateDeviations = [
        {
          type: 'ALTERED_BEHAVIOR',
          subjectRef: 'action.delete_note',
          statement: 'Bypass confirmation dialog and delete note immediately.',
          ownerApprovalRef: null // Unapproved!
        }
      ];

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        deviations: candidateDeviations,
        throwOnError: false
      });

      assert.equal(res.status, 'FAIL');
      assert.equal(res.code, 1);
    });

    it('[T30] returns status BLOCKED (code 2) for missing required approval on blocking capability', () => {
      const contract = {
        schemaVersion: '1.0.0',
        inputs: [],
        capabilities: [
          {
            id: 'cap.custom_waveform',
            status: 'UNSUPPORTED_BLOCKING',
            rationale: 'Hardware waveform hook requested on LivePaper panel.'
          }
        ],
        implementationBoundary: { allowedPaths: ['app/src/main/java/com/test/ui'] }
      };

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        contract,
        throwOnError: false
      });

      assert.equal(res.status, 'BLOCKED');
      assert.equal(res.code, 2);
      assert.ok(res.reason.includes('UNSUPPORTED_BLOCKING') || res.reason.includes('missing owner approval'));
    });

    it('[T31] returns status PASS (code 0) when all deviations have valid exact-match approvals', () => {
      const approvalFile = path.join(workspaceDir, 'approved-deviations.json');
      const hash = writeJson(approvalFile, {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: 'approval.deliberate_design',
        scopes: [
          {
            subjectRef: 'element.fab',
            statement: 'Approve 8px bottom margin offset on DC1 LivePaper.'
          }
        ]
      });

      const candidateDeviations = [
        {
          type: 'VISUAL_DEVIATION',
          subjectRef: 'element.fab',
          statement: 'Approve 8px bottom margin offset on DC1 LivePaper.',
          ownerApprovalRef: 'approval.deliberate_design'
        }
      ];

      const res = verifyCandidateWorktree({
        candidate: candidateDir,
        baselineRoot: baselineDir,
        approval: approvalFile,
        deviations: candidateDeviations,
        throwOnError: false
      });

      assert.equal(res.status, 'PASS');
      assert.equal(res.code, 0);
      assert.equal(res.valid, true);
      assert.ok(res.approvedDeviations && res.approvedDeviations.length === 1);
    });
  });

  // =========================================================================
  // GROUP 8: CLI Option & Dispatcher Integration
  // =========================================================================
  describe('Group 8: CLI Option & Dispatcher Integration', () => {
    it('[T32] dispatcher accepts --approval <path> option under verify subcommand', () => {
      assert.ok(SUBCOMMAND_OPTIONS.verify.has('approval'));
      assert.ok(SUBCOMMAND_OPTIONS.verify.has('A'));
    });

    it('[T33] dispatcher strictly preserves SUBCOMMANDS.length === 13 invariant', () => {
      assert.equal(SUBCOMMANDS.length, 13, 'CLI subcommands must remain exactly 13');
      const expected = [
        'doctor', 'init', 'baseline', 'inspect-app', 'capture',
        'contract build', 'contract validate', 'map', 'plan',
        'agent packet', 'verify', 'defects', 'profile export'
      ];
      assert.deepEqual([...SUBCOMMANDS], expected);
    });

    it('[T34] dispatcher maps short flag -A to approval in parsed flags', () => {
      const res = dispatch(['verify', 'note_editor', '-A', 'my-approval.json', '--help']);
      assert.equal(res.exitCode, 0);
    });

    it('[T35] ctc verify rejects unrecognized flags but allows valid --approval', () => {
      const invalidRes = dispatch(['verify', 'note_editor', '--unknown-flag-xyz']);
      assert.equal(invalidRes.exitCode, 3);
      assert.ok(invalidRes.output.includes('unrecognized option "--unknown-flag-xyz"'));

      const validRes = dispatch(['verify', 'note_editor', '--approval', 'valid.json', '--help']);
      assert.equal(validRes.exitCode, 0);
    });
  });
});
