/**
 * tests/adversarial/m4_empirical_challenge.test.js
 *
 * Empirical Adversarial Challenge Suite for Milestone 4:
 * Owner Approval & Intentional Deviation Contract.
 *
 * Authored by challenger_retrofit_m4_1 (critic, specialist).
 *
 * Focus Areas:
 * 1. Prototype pollution attacks (__proto__, constructor, prototype) at root and scope levels.
 * 2. Unicode whitespace bypasses (NBSP U+00A0, zero-width space U+200B, ZWJ/ZWNJ, em/en spaces, CRLF vs LF, NFC vs NFD).
 * 3. Partial matching attacks (substrings, prefixes, suffixes, regex metacharacters, wildcards, injections).
 * 4. Duplicate keys, conflicting IDs, and additional property injection at root and scope levels.
 * 5. Malformed scope topologies (empty arrays, missing subjectRef, missing statement, invalid ID patterns).
 * 6. Cross-wiring prevention and unused approval detection.
 * 7. Candidate verifier integration with adversarial tampering and collisions.
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
  validateOwnerApproval,
  validateOwnerApprovalOrThrow,
  formatSchemaIssues,
  formatSchemaErrorsText
} = require('../../src/contract/schemas');

const {
  loadOwnerApproval,
  loadOwnerApprovals,
  approvalFor,
  assertAllApprovalsUsed,
  assertNoEvidenceCrossWiring,
  evaluateContractDeviations,
  computeSha256,
  computeCharacterDiff,
  DEVIATION_DOMAINS,
  DEVIATION_STATUSES
} = require('../../src/contract/owner_approval');

const {
  InputError,
  BlockedError
} = require('../../src/agent/safety');

function createValidDoc(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    kind: 'OwnerApproval',
    id: 'approval_valid_test',
    scopes: [
      {
        subjectRef: 'element_title_bar',
        statement: 'Approve Daylight LivePaper 8-bit grayscale contrast curve'
      }
    ],
    ...overrides
  };
}

describe('Milestone 4 Empirical Adversarial Challenge Suite', () => {
  let tempDir;
  let workspaceDir;

  beforeEach(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-challenger-')));
    workspaceDir = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // Challenge 1: Prototype Pollution & Prototype Integrity Attacks
  // =========================================================================
  describe('Challenge 1: Prototype Pollution & Object Prototype Integrity', () => {
    it('[CH1-T01] rejects root-level __proto__ injection via JSON parsing', () => {
      const rawJson = '{"__proto__": {"polluted": "yes"}, "schemaVersion": "1.0.0", "kind": "OwnerApproval", "id": "proto_attack", "scopes": [{"subjectRef": "s1", "statement": "allow"}]}';
      const parsed = JSON.parse(rawJson);

      const isValid = validateOwnerApproval(parsed);
      assert.strictEqual(isValid, false, 'Expected validateOwnerApproval to reject root __proto__');
      assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');
      assert.strictEqual(Object.prototype.polluted, undefined, 'Object.prototype must not be polluted');

      assert.throws(() => {
        validateOwnerApprovalOrThrow(parsed);
      }, (err) => {
        return err.code === 'SCHEMA_VALIDATION_ERROR';
      });
    });

    it('[CH1-T02] rejects root-level constructor property injection', () => {
      const doc = createValidDoc({ constructor: { polluted: true } });
      const isValid = validateOwnerApproval(doc);
      assert.strictEqual(isValid, false, 'Expected validateOwnerApproval to reject root constructor');
      assert.strictEqual(({}).polluted, undefined, 'Object.prototype must not be polluted');
    });

    it('[CH1-T03] rejects root-level prototype property injection', () => {
      const doc = createValidDoc({ prototype: { evil: 1 } });
      const isValid = validateOwnerApproval(doc);
      assert.strictEqual(isValid, false, 'Expected validateOwnerApproval to reject root prototype');
    });

    it('[CH1-T04] rejects scope-level __proto__ injection via JSON parsing', () => {
      const rawJson = '{"schemaVersion": "1.0.0", "kind": "OwnerApproval", "id": "scope_proto_attack", "scopes": [{"__proto__": {"scopePolluted": true}, "subjectRef": "s1", "statement": "allow"}]}';
      const parsed = JSON.parse(rawJson);

      const isValid = validateOwnerApproval(parsed);
      assert.strictEqual(isValid, false, 'Expected validateOwnerApproval to reject scope __proto__');
      assert.strictEqual(({}).scopePolluted, undefined, 'Object.prototype must not be polluted');
    });

    it('[CH1-T05] rejects scope-level constructor injection', () => {
      const doc = createValidDoc({
        scopes: [
          {
            subjectRef: 's1',
            statement: 'allow',
            constructor: { evil: 2 }
          }
        ]
      });
      const isValid = validateOwnerApproval(doc);
      assert.strictEqual(isValid, false, 'Expected validateOwnerApproval to reject scope constructor');
      assert.strictEqual(({}).evil, undefined);
    });

    it('[CH1-T06] rejects approval document with ID starting with underscore like __proto__', () => {
      const doc = createValidDoc({ id: '__proto__' });
      const isValid = validateOwnerApproval(doc);
      assert.strictEqual(isValid, false, 'ID starting with underscore must be rejected by pattern');
    });

    it('[CH1-T07] approvalFor safely rejects queries on __proto__, constructor, toString on empty Map', () => {
      const emptyMap = new Map();
      const dangerousRefs = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'];

      for (const ref of dangerousRefs) {
        const result = approvalFor(emptyMap, ref, 's1', 'stmt', null, { throwOnError: false });
        assert.strictEqual(result.matched, false, `Expected matched=false for ${ref}`);
        assert.strictEqual(result.approved, false, `Expected approved=false for ${ref}`);
        assert.strictEqual(result.reason, 'APPROVAL_NOT_FOUND');

        assert.throws(() => {
          approvalFor(emptyMap, ref, 's1', 'stmt', null, { throwOnError: true });
        }, (err) => err instanceof InputError && err.message.includes('not found in loaded approvals'));
      }
    });

    it('[CH1-T08] approvalFor safely rejects queries when plain object is used as approvals lookup', () => {
      const plainObj = {};
      const result = approvalFor(plainObj, 'constructor', 's1', 'stmt', null, { throwOnError: false });
      assert.strictEqual(result.matched, false, 'Must not match Function: Object as approval');
      assert.strictEqual(result.approved, false);
    });

    it('[CH1-T09] approvalFor safely rejects subjectRef queries on constructor or __proto__ when scope does not have them', () => {
      const map = new Map();
      map.set('appr_1', {
        value: {
          id: 'appr_1',
          scopes: [{ subjectRef: 'legit_subject', statement: 'legit statement' }]
        }
      });

      const resCtor = approvalFor(map, 'appr_1', 'constructor', 'legit statement', null, { throwOnError: false });
      assert.strictEqual(resCtor.matched, false);
      assert.strictEqual(resCtor.reason, 'SUBJECT_NOT_FOUND');

      const resProto = approvalFor(map, 'appr_1', '__proto__', 'legit statement', null, { throwOnError: false });
      assert.strictEqual(resProto.matched, false);
      assert.strictEqual(resProto.reason, 'SUBJECT_NOT_FOUND');
    });
  });

  // =========================================================================
  // Challenge 2: Unicode Whitespace, NBSP, Zero-Width Space & Case Sensitivity
  // =========================================================================
  describe('Challenge 2: Unicode Whitespace, NBSP, Zero-Width Space & Case Sensitivity', () => {
    const CANONICAL_STATEMENT = 'Approve Daylight LivePaper 8-bit grayscale contrast curve';
    const SUBJECT = 'contrast_curve';
    let approvalsMap;

    beforeEach(() => {
      approvalsMap = new Map();
      approvalsMap.set('approval_contrast', {
        id: 'approval_contrast',
        value: {
          id: 'approval_contrast',
          scopes: [
            {
              subjectRef: SUBJECT,
              statement: CANONICAL_STATEMENT
            }
          ]
        }
      });
    });

    it('[CH2-T01] matches exact canonical statement byte-for-byte', () => {
      const result = approvalFor(approvalsMap, 'approval_contrast', SUBJECT, CANONICAL_STATEMENT);
      assert.strictEqual(result.matched, true);
      assert.strictEqual(result.approved, true);
    });

    it('[CH2-T02] rejects non-breaking space (U+00A0) in statement', () => {
      const adversarial = 'Approve\u00A0Daylight LivePaper 8-bit grayscale contrast curve';
      const result = approvalFor(approvalsMap, 'approval_contrast', SUBJECT, adversarial, null, { throwOnError: false });
      assert.strictEqual(result.matched, false);
      assert.strictEqual(result.approved, false);
      assert.strictEqual(result.reason, 'STATEMENT_MISMATCH');
      assert.strictEqual(result.charDiff.firstDiffIndex, 7, 'Diff index must identify U+00A0 offset');
    });

    it('[CH2-T03] rejects zero-width space (U+200B) in statement', () => {
      const adversarial = 'Approve\u200BDaylight LivePaper 8-bit grayscale contrast curve';
      const result = approvalFor(approvalsMap, 'approval_contrast', SUBJECT, adversarial, null, { throwOnError: false });
      assert.strictEqual(result.matched, false);
      assert.strictEqual(result.reason, 'STATEMENT_MISMATCH');
    });

    it('[CH2-T04] rejects zero-width joiner (U+200D) and non-joiner (U+200C)', () => {
      const zwj = 'Approve\u200DDaylight LivePaper 8-bit grayscale contrast curve';
      const zwnj = 'Approve\u200CDaylight LivePaper 8-bit grayscale contrast curve';

      const resZwj = approvalFor(approvalsMap, 'approval_contrast', SUBJECT, zwj, null, { throwOnError: false });
      assert.strictEqual(resZwj.matched, false);

      const resZwnj = approvalFor(approvalsMap, 'approval_contrast', SUBJECT, zwnj, null, { throwOnError: false });
      assert.strictEqual(resZwnj.matched, false);
    });

    it('[CH2-T05] rejects narrow no-break space (U+202F) and ideographic space (U+3000)', () => {
      const narrow = 'Approve\u202FDaylight LivePaper 8-bit grayscale contrast curve';
      const ideographic = 'Approve\u3000Daylight LivePaper 8-bit grayscale contrast curve';

      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, narrow, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, ideographic, null, { throwOnError: false }).matched, false);
    });

    it('[CH2-T06] rejects en-space (U+2002), em-space (U+2003), and thin-space (U+2009)', () => {
      const en = 'Approve\u2002Daylight LivePaper 8-bit grayscale contrast curve';
      const em = 'Approve\u2003Daylight LivePaper 8-bit grayscale contrast curve';
      const thin = 'Approve\u2009Daylight LivePaper 8-bit grayscale contrast curve';

      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, en, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, em, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, thin, null, { throwOnError: false }).matched, false);
    });

    it('[CH2-T07] rejects leading, trailing, and internal double whitespace (no trimming)', () => {
      const leading = ' ' + CANONICAL_STATEMENT;
      const trailing = CANONICAL_STATEMENT + ' ';
      const internalDouble = 'Approve  Daylight LivePaper 8-bit grayscale contrast curve';
      const tab = 'Approve\tDaylight LivePaper 8-bit grayscale contrast curve';

      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, leading, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, trailing, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, internalDouble, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, tab, null, { throwOnError: false }).matched, false);
    });

    it('[CH2-T08] enforces strict case sensitivity (rejects lowercase and uppercase variations)', () => {
      const lower = CANONICAL_STATEMENT.toLowerCase();
      const upper = CANONICAL_STATEMENT.toUpperCase();
      const mixed = 'Approve Daylight livePaper 8-bit grayscale contrast curve';

      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, lower, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, upper, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'approval_contrast', SUBJECT, mixed, null, { throwOnError: false }).matched, false);
    });

    it('[CH2-T09] rejects CRLF (\\r\\n) vs LF (\\n) mismatch', () => {
      approvalsMap.set('approval_multiline', {
        id: 'approval_multiline',
        value: {
          id: 'approval_multiline',
          scopes: [{ subjectRef: 'multi', statement: 'First line\nSecond line' }]
        }
      });

      const crlf = 'First line\r\nSecond line';
      const res = approvalFor(approvalsMap, 'approval_multiline', 'multi', crlf, null, { throwOnError: false });
      assert.strictEqual(res.matched, false);
      assert.strictEqual(res.reason, 'STATEMENT_MISMATCH');
    });

    it('[CH2-T10] rejects Unicode normalization discrepancies (NFC vs NFD)', () => {
      // "Café" in NFC (\u00E9) vs NFD (e + \u0301)
      const nfcStatement = 'Allow Caf\u00E9 theme';
      const nfdStatement = 'Allow Cafe\u0301 theme';

      approvalsMap.set('approval_nfc', {
        id: 'approval_nfc',
        value: {
          id: 'approval_nfc',
          scopes: [{ subjectRef: 'theme', statement: nfcStatement }]
        }
      });

      const resExact = approvalFor(approvalsMap, 'approval_nfc', 'theme', nfcStatement, null, { throwOnError: false });
      assert.strictEqual(resExact.matched, true);

      const resNfd = approvalFor(approvalsMap, 'approval_nfc', 'theme', nfdStatement, null, { throwOnError: false });
      assert.strictEqual(resNfd.matched, false, 'Must require exact byte-for-byte equality without auto-normalization');
    });
  });

  // =========================================================================
  // Challenge 3: Partial Matching, Substrings, Regex & Injection Attacks
  // =========================================================================
  describe('Challenge 3: Partial Matching, Substrings, Regex & Injection Attacks', () => {
    const STATEMENT = 'Preserve SQLite autocommit transaction semantics during note save';
    const SUBJECT = 'note_save_tx';
    let approvalsMap;

    beforeEach(() => {
      approvalsMap = new Map();
      approvalsMap.set('appr_sqlite', {
        id: 'appr_sqlite',
        value: {
          id: 'appr_sqlite',
          scopes: [{ subjectRef: SUBJECT, statement: STATEMENT }]
        }
      });
    });

    it('[CH3-T01] rejects substring queries', () => {
      const substrings = [
        'SQLite autocommit',
        'Preserve SQLite',
        'note save',
        'transaction semantics'
      ];
      for (const sub of substrings) {
        const res = approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, sub, null, { throwOnError: false });
        assert.strictEqual(res.matched, false, `Substring "${sub}" must not match`);
        assert.strictEqual(res.reason, 'STATEMENT_MISMATCH');
      }
    });

    it('[CH3-T02] rejects prefix and suffix queries', () => {
      const prefix = 'Preserve SQLite autocommit transaction semantics';
      const suffix = 'SQLite autocommit transaction semantics during note save';

      assert.strictEqual(approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, prefix, null, { throwOnError: false }).matched, false);
      assert.strictEqual(approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, suffix, null, { throwOnError: false }).matched, false);
    });

    it('[CH3-T03] rejects regex wildcard and pattern queries', () => {
      const regexes = [
        '.*',
        '^.*$',
        'Preserve SQLite .*',
        '^Preserve SQLite autocommit transaction semantics during note save$',
        '[P]reserve SQLite autocommit transaction semantics during note save',
        '(?:Preserve SQLite autocommit transaction semantics during note save)'
      ];

      for (const pat of regexes) {
        const res = approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, pat, null, { throwOnError: false });
        assert.strictEqual(res.matched, false, `Pattern "${pat}" must not be evaluated as regex`);
      }
    });

    it('[CH3-T04] does not treat regex metacharacters in approved statement as active patterns', () => {
      approvalsMap.set('appr_regex_text', {
        id: 'appr_regex_text',
        value: {
          id: 'appr_regex_text',
          scopes: [{ subjectRef: 'digits', statement: 'allow items [0-9]+' }]
        }
      });

      // Query that would match if interpreted as regex
      const regexCandidate = 'allow items 12345';
      const res1 = approvalFor(approvalsMap, 'appr_regex_text', 'digits', regexCandidate, null, { throwOnError: false });
      assert.strictEqual(res1.matched, false, 'Must not match regex expansion');

      // Exact literal match
      const literalMatch = 'allow items [0-9]+';
      const res2 = approvalFor(approvalsMap, 'appr_regex_text', 'digits', literalMatch, null, { throwOnError: false });
      assert.strictEqual(res2.matched, true, 'Literal string containing [0-9]+ must match');
    });

    it('[CH3-T05] rejects partial matching on subjectRef', () => {
      const partialSubjects = [
        'note_save',
        'save_tx',
        'note_save_tx_v2',
        '.*',
        'note.*'
      ];
      for (const sub of partialSubjects) {
        const res = approvalFor(approvalsMap, 'appr_sqlite', sub, STATEMENT, null, { throwOnError: false });
        assert.strictEqual(res.matched, false, `Partial subjectRef "${sub}" must not match`);
        assert.strictEqual(res.reason, 'SUBJECT_NOT_FOUND');
      }
    });

    it('[CH3-T06] rejects glob and shell syntax characters in query', () => {
      const globs = ['Preserve SQLite*', 'Preserve SQLite?', '${statement}', '$(whoami)'];
      for (const g of globs) {
        assert.strictEqual(approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, g, null, { throwOnError: false }).matched, false);
      }
    });

    it('[CH3-T07] rejects SQL injection payloads and null byte truncation', () => {
      const payloads = [
        "Preserve SQLite autocommit' OR '1'='1",
        "Preserve SQLite autocommit; DROP TABLE approvals; --",
        STATEMENT + '\0extra'
      ];
      for (const p of payloads) {
        assert.strictEqual(approvalFor(approvalsMap, 'appr_sqlite', SUBJECT, p, null, { throwOnError: false }).matched, false);
      }
    });
  });

  // =========================================================================
  // Challenge 4: Additional Properties, Duplicate Keys & Conflict Detection
  // =========================================================================
  describe('Challenge 4: Additional Properties, Duplicate Keys & Conflict Detection', () => {
    it('[CH4-T01] rejects root additional property "allowBypass"', () => {
      const doc = createValidDoc({ allowBypass: true });
      const res = validateOwnerApproval(doc, { detailed: true });
      assert.strictEqual(res.valid, false);
      assert.ok(
        res.errorText.includes('additional properties') ||
        res.issues.some(i => i.detail.includes("unexpected property 'allowBypass' not allowed"))
      );
    });

    it('[CH4-T02] rejects root additional properties "author", "signature", "approvedBy"', () => {
      const props = ['author', 'signature', 'approvedBy', 'timestamp', 'comments'];
      for (const p of props) {
        const doc = createValidDoc({ [p]: 'malicious_extra_field' });
        assert.strictEqual(validateOwnerApproval(doc), false, `Root property ${p} must be rejected`);
      }
    });

    it('[CH4-T03] rejects scope additional property "allowAll"', () => {
      const doc = createValidDoc({
        scopes: [{ subjectRef: 's1', statement: 'allow', allowAll: true }]
      });
      const res = validateOwnerApproval(doc, { detailed: true });
      assert.strictEqual(res.valid, false);
      assert.ok(
        res.errorText.includes('additional properties') ||
        res.issues.some(i => i.detail.includes("unexpected property 'allowAll' not allowed"))
      );
    });

    it('[CH4-T04] rejects scope additional properties "regex", "wildcard", "severity"', () => {
      const scopeExtras = ['regex', 'wildcard', 'severity', 'ignoreErrors', 'filter'];
      for (const extra of scopeExtras) {
        const doc = createValidDoc({
          scopes: [{ subjectRef: 's1', statement: 'allow', [extra]: true }]
        });
        assert.strictEqual(validateOwnerApproval(doc), false, `Scope property ${extra} must be rejected`);
      }
    });

    it('[CH4-T05] loadOwnerApprovals throws InputError when two files share same ID with conflicting content', () => {
      const file1 = path.join(workspaceDir, 'approval1.json');
      const file2 = path.join(workspaceDir, 'approval2.json');

      const doc1 = createValidDoc({ id: 'shared_id', scopes: [{ subjectRef: 's1', statement: 'statement A' }] });
      const doc2 = createValidDoc({ id: 'shared_id', scopes: [{ subjectRef: 's1', statement: 'statement B' }] });

      fs.writeFileSync(file1, JSON.stringify(doc1));
      fs.writeFileSync(file2, JSON.stringify(doc2));

      assert.throws(() => {
        loadOwnerApprovals([file1, file2], { workspaceRoot: workspaceDir });
      }, (err) => {
        return err instanceof InputError && err.message.includes('duplicate owner approval id with conflicting content');
      });
    });

    it('[CH4-T06] loadOwnerApprovals deduplicates files sharing same ID with identical content without error', () => {
      const file1 = path.join(workspaceDir, 'copy1.json');
      const file2 = path.join(workspaceDir, 'copy2.json');

      const doc = createValidDoc({ id: 'identical_id', scopes: [{ subjectRef: 's1', statement: 'statement A' }] });

      fs.writeFileSync(file1, JSON.stringify(doc));
      fs.writeFileSync(file2, JSON.stringify(doc));

      const map = loadOwnerApprovals([file1, file2], { workspaceRoot: workspaceDir });
      assert.strictEqual(map.size, 1);
      assert.ok(map.has('identical_id'));
    });
  });

  // =========================================================================
  // Challenge 5: Malformed Scopes, Missing References & Schema Constraints
  // =========================================================================
  describe('Challenge 5: Malformed Scopes, Missing References & Schema Constraints', () => {
    it('[CH5-T01] rejects empty scopes array (minItems: 1)', () => {
      const doc = createValidDoc({ scopes: [] });
      const res = validateOwnerApproval(doc, { detailed: true });
      assert.strictEqual(res.valid, false);
      assert.ok(
        res.errorText.includes('fewer than 1') ||
        res.issues.some(i => i.detail.includes('array must have at least 1 items'))
      );
    });

    it('[CH5-T02] rejects missing scopes property', () => {
      const doc = createValidDoc();
      delete doc.scopes;
      assert.strictEqual(validateOwnerApproval(doc), false);
    });

    it('[CH5-T03] rejects scopes property as non-array (null, boolean, object, string)', () => {
      assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: null })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: true })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: {} })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: 'scopes' })), false);
    });

    it('[CH5-T04] rejects scope item missing subjectRef', () => {
      const doc = createValidDoc({
        scopes: [{ statement: 'statement without subject' }]
      });
      const res = validateOwnerApproval(doc, { detailed: true });
      assert.strictEqual(res.valid, false);
      assert.ok(
        res.errorText.includes('subjectRef') ||
        res.issues.some(i => i.detail.includes("missing required property 'subjectRef'"))
      );
    });

    it('[CH5-T05] rejects scope item missing statement', () => {
      const doc = createValidDoc({
        scopes: [{ subjectRef: 'subject_without_statement' }]
      });
      const res = validateOwnerApproval(doc, { detailed: true });
      assert.strictEqual(res.valid, false);
      assert.ok(
        res.errorText.includes('statement') ||
        res.issues.some(i => i.detail.includes("missing required property 'statement'"))
      );
    });

    it('[CH5-T06] rejects scope item with empty string subjectRef', () => {
      const doc = createValidDoc({
        scopes: [{ subjectRef: '', statement: 'valid statement' }]
      });
      assert.strictEqual(validateOwnerApproval(doc), false);
    });

    it('[CH5-T07] rejects scope item with empty string statement', () => {
      const doc = createValidDoc({
        scopes: [{ subjectRef: 's1', statement: '' }]
      });
      assert.strictEqual(validateOwnerApproval(doc), false);
    });

    it('[CH5-T08] rejects non-string types for subjectRef and statement', () => {
      const invalidTypes = [123, true, null, {}, []];
      for (const val of invalidTypes) {
        assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: [{ subjectRef: val, statement: 'valid' }] })), false);
        assert.strictEqual(validateOwnerApproval(createValidDoc({ scopes: [{ subjectRef: 'valid', statement: val }] })), false);
      }
    });

    it('[CH5-T09] rejects invalid schemaVersion and kind', () => {
      assert.strictEqual(validateOwnerApproval(createValidDoc({ schemaVersion: '2.0.0' })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ schemaVersion: '1.0' })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ kind: 'Owner_Approval' })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ kind: 'ownerApproval' })), false);
      assert.strictEqual(validateOwnerApproval(createValidDoc({ kind: 'Approval' })), false);
    });

    it('[CH5-T10] rejects invalid root ID formats', () => {
      const invalidIds = [
        '',
        '   ',
        'has spaces in id',
        '-starts-with-hyphen',
        '_starts_with_underscore',
        '<xml_tag>',
        'id*with*wildcards',
        'id?with?question',
        'a'.repeat(201) // exceeds maxLength: 200
      ];
      for (const id of invalidIds) {
        assert.strictEqual(validateOwnerApproval(createValidDoc({ id })), false, `ID "${id}" should be rejected`);
      }
    });

    it('[CH5-T11] accepts complex valid IDs matching pattern ^[A-Za-z0-9][A-Za-z0-9._:/#()\\[\\]-]*$', () => {
      const validIds = [
        'approval-123',
        'Approval.V1:Daylight#contrast[0]',
        'appr_sol_os(dc1)',
        'A'.repeat(200)
      ];
      for (const id of validIds) {
        assert.strictEqual(validateOwnerApproval(createValidDoc({ id })), true, `ID "${id}" should be valid`);
      }
    });
  });

  // =========================================================================
  // Challenge 6: Evidence Cross-Wiring & Unused Approval Security
  // =========================================================================
  describe('Challenge 6: Evidence Cross-Wiring & Unused Approval Security', () => {
    let approvalsMap;

    beforeEach(() => {
      approvalsMap = new Map();
      approvalsMap.set('approval_stealth', {
        id: 'approval_stealth',
        value: createValidDoc({ id: 'approval_stealth' })
      });
    });

    it('[CH6-T01] rejects owner approval ID cited in elementMappings.evidenceRefs', () => {
      const contract = {
        elementMappings: [
          {
            id: 'elem_1',
            evidenceRefs: ['approval_stealth'] // Attack: trying to use approval as visual evidence!
          }
        ]
      };
      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => {
        return err instanceof InputError && err.message.includes('cannot cite approval approval_stealth as evidence');
      });
    });

    it('[CH6-T02] rejects owner approval ID cited in actionBindings.evidenceRefs', () => {
      const contract = {
        actionBindings: [
          {
            id: 'action_1',
            evidenceRefs: ['approval_stealth']
          }
        ]
      };
      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });

    it('[CH6-T03] rejects owner approval ID cited in acceptanceMatrix.requirements.evidenceRefs', () => {
      const contract = {
        acceptanceMatrix: {
          requirements: [
            {
              id: 'req_1',
              evidenceRefs: ['approval_stealth']
            }
          ]
        }
      };
      assert.throws(() => {
        assertNoEvidenceCrossWiring(contract, approvalsMap);
      }, (err) => err instanceof InputError && err.message.includes('cannot cite approval'));
    });

    it('[CH6-T04] assertAllApprovalsUsed throws InputError when loaded approval is never cited', () => {
      const map = new Map();
      map.set('appr_used', { id: 'appr_used' });
      map.set('appr_unused_sneak', { id: 'appr_unused_sneak' });

      const usedSet = new Set(['appr_used']);

      assert.throws(() => {
        assertAllApprovalsUsed(map, usedSet);
      }, (err) => {
        return err instanceof InputError && err.message.includes('unused owner approval input: appr_unused_sneak');
      });
    });

    it('[CH6-T05] evaluateContractDeviations returns FAIL status when an approval input is unused', () => {
      const map = new Map();
      map.set('appr_orphaned', {
        id: 'appr_orphaned',
        value: createValidDoc({ id: 'appr_orphaned' })
      });

      const contract = {
        elementMappings: [],
        actionBindings: [],
        preservationObligations: [],
        capabilities: []
      };

      const result = evaluateContractDeviations(contract, map, { throwOnError: false });
      assert.strictEqual(result.status, 'FAIL');
      assert.strictEqual(result.exitCode, 1);
      assert.ok(result.unusedApprovals.includes('appr_orphaned'));
      assert.ok(result.defects.some(d => d.type === 'UNUSED_APPROVAL_INPUT'));
    });
  });

  // =========================================================================
  // Challenge 7: File System, Path Confinement & SHA-256 Pinning
  // =========================================================================
  describe('Challenge 7: File System, Path Confinement & SHA-256 Pinning', () => {
    it('[CH7-T01] loadOwnerApproval rejects parent directory traversal paths (..)', () => {
      assert.throws(() => {
        loadOwnerApproval('../../secret/approval.json', { workspaceRoot: workspaceDir });
      }, (err) => {
        return err instanceof InputError && err.message.includes('parent traversal');
      });
    });

    it('[CH7-T02] loadOwnerApproval rejects null bytes in path', () => {
      assert.throws(() => {
        loadOwnerApproval('valid.json\0.png', { workspaceRoot: workspaceDir });
      }, (err) => {
        return err instanceof InputError && err.message.includes('null byte');
      });
    });

    it('[CH7-T03] loadOwnerApproval rejects symbolic link files', () => {
      const realFile = path.join(workspaceDir, 'real.json');
      const symlinkFile = path.join(workspaceDir, 'symlink.json');
      fs.writeFileSync(realFile, JSON.stringify(createValidDoc()));
      fs.symlinkSync(realFile, symlinkFile);

      assert.throws(() => {
        loadOwnerApproval(symlinkFile, { workspaceRoot: workspaceDir });
      }, (err) => {
        return err instanceof InputError && (
          err.message.includes('non-symlink regular file') ||
          err.message.includes('symbolic link component')
        );
      });
    });

    it('[CH7-T04] loadOwnerApproval rejects symbolic links in directory path components', () => {
      const realDir = path.join(workspaceDir, 'real_dir');
      fs.mkdirSync(realDir);
      const targetFile = path.join(realDir, 'approval.json');
      fs.writeFileSync(targetFile, JSON.stringify(createValidDoc()));

      const symlinkDir = path.join(workspaceDir, 'symlink_dir');
      fs.symlinkSync(realDir, symlinkDir);

      const throughSymlink = path.join(symlinkDir, 'approval.json');
      assert.throws(() => {
        loadOwnerApproval(throughSymlink, { workspaceRoot: workspaceDir });
      }, (err) => {
        return err instanceof InputError && err.message.includes('symbolic link component');
      });
    });

    it('[CH7-T05] loadOwnerApproval detects and rejects SHA-256 hash tampering', () => {
      const approvalFile = path.join(workspaceDir, 'tampered.json');
      const doc = createValidDoc();
      fs.writeFileSync(approvalFile, JSON.stringify(doc));

      const fakeSha = '0000000000000000000000000000000000000000000000000000000000000000';
      assert.throws(() => {
        loadOwnerApproval(approvalFile, {
          workspaceRoot: workspaceDir,
          expectedSha256: fakeSha
        });
      }, (err) => {
        return err instanceof InputError && err.message.includes('hash mismatch');
      });
    });

    it('[CH7-T06] loadOwnerApproval detects declared ID mismatch', () => {
      const approvalFile = path.join(workspaceDir, 'mismatch_id.json');
      const doc = createValidDoc({ id: 'actual_id' });
      fs.writeFileSync(approvalFile, JSON.stringify(doc));

      assert.throws(() => {
        loadOwnerApproval(approvalFile, {
          workspaceRoot: workspaceDir,
          expectedId: 'declared_different_id'
        });
      }, (err) => {
        return err instanceof InputError && err.message.includes('identity mismatch');
      });
    });
  });

  // =========================================================================
  // Challenge 8: Deviation Evaluation Adversarial Fail-Closed Matrix
  // =========================================================================
  describe('Challenge 8: Deviation Evaluation Adversarial Fail-Closed Matrix', () => {
    it('[CH8-T01] unapproved UI surface deviation yields status FAIL (code 1)', () => {
      const contract = {
        elementMappings: [
          {
            id: 'elem_card',
            mappingStatus: DEVIATION_STATUSES.OWNER_APPROVED_NEW_SURFACE,
            ownerApprovalRef: 'missing_approval_ref',
            ownerApprovalStatement: 'statement'
          }
        ]
      };
      const result = evaluateContractDeviations(contract, new Map(), { throwOnError: false });
      assert.strictEqual(result.status, 'FAIL');
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.defects[0].domain, DEVIATION_DOMAINS.UI_SURFACES);
    });

    it('[CH8-T02] UI surface with altered whitespace statement yields status FAIL with STATEMENT_MISMATCH', () => {
      const map = new Map();
      const validStatement = 'Approve Daylight LivePaper 8-bit grayscale contrast curve';
      map.set('appr_contrast', {
        id: 'appr_contrast',
        value: createValidDoc({
          id: 'appr_contrast',
          scopes: [{ subjectRef: 'elem_contrast', statement: validStatement }]
        })
      });

      const contract = {
        elementMappings: [
          {
            id: 'elem_contrast',
            mappingStatus: DEVIATION_STATUSES.OWNER_APPROVED_NEW_SURFACE,
            ownerApprovalRef: 'appr_contrast',
            ownerApprovalStatement: 'Approve\u00A0Daylight LivePaper 8-bit grayscale contrast curve' // NBSP injection!
          }
        ]
      };

      const result = evaluateContractDeviations(contract, map, { throwOnError: false });
      assert.strictEqual(result.status, 'FAIL');
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.defects[0].type, 'STATEMENT_MISMATCH');
    });

    it('[CH8-T03] unapproved altered behavior yields status FAIL', () => {
      const contract = {
        actionBindings: [
          {
            id: 'action_delete_all',
            bindingStatus: DEVIATION_STATUSES.OWNER_APPROVED_NEW_BEHAVIOR,
            ownerApprovalRef: 'non_existent_approval',
            newBehaviorStatement: 'Wipe all records without confirmation'
          }
        ]
      };
      const result = evaluateContractDeviations(contract, new Map(), { throwOnError: false });
      assert.strictEqual(result.status, 'FAIL');
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.defects[0].domain, DEVIATION_DOMAINS.ALTERED_BEHAVIORS);
    });

    it('[CH8-T04] unapproved changed invariant yields status FAIL', () => {
      const contract = {
        preservationObligations: [
          {
            id: 'inv_room_persistence',
            status: DEVIATION_STATUSES.OWNER_APPROVED_CHANGE,
            ownerApprovalRef: 'non_existent_approval',
            statement: 'Disable Room persistence'
          }
        ]
      };
      const result = evaluateContractDeviations(contract, new Map(), { throwOnError: false });
      assert.strictEqual(result.status, 'FAIL');
      assert.strictEqual(result.exitCode, 1);
      assert.strictEqual(result.defects[0].domain, DEVIATION_DOMAINS.CHANGED_INVARIANTS);
    });

    it('[CH8-T05] unsupported capability without approval yields status BLOCKED (code 2)', () => {
      const contract = {
        capabilities: [
          {
            id: 'cap_camera_ai',
            status: DEVIATION_STATUSES.INTENTIONAL_DEVIATION,
            rationale: 'Camera AI feature omitted on DC1'
          }
        ]
      };
      const result = evaluateContractDeviations(contract, new Map(), { throwOnError: false });
      assert.strictEqual(result.status, 'BLOCKED');
      assert.strictEqual(result.exitCode, 2);
      assert.strictEqual(result.blockers[0].type, 'APPROVAL_REQUIRED_MISSING');
    });

    it('[CH8-T06] unsupported blocking capability yields status BLOCKED (code 2)', () => {
      const contract = {
        capabilities: [
          {
            id: 'cap_bluetooth_sync',
            status: DEVIATION_STATUSES.UNSUPPORTED_BLOCKING,
            rationale: 'Hardware radio unavailable'
          }
        ]
      };
      const result = evaluateContractDeviations(contract, new Map(), { throwOnError: false });
      assert.strictEqual(result.status, 'BLOCKED');
      assert.strictEqual(result.exitCode, 2);
      assert.strictEqual(result.blockers[0].type, 'BLOCKING_CAPABILITY');
    });

    it('[CH8-T07] all deviations approved with exact matches yields status PASS (code 0)', () => {
      const map = new Map();
      const statement = 'Approve Daylight LivePaper 8-bit grayscale contrast curve';
      map.set('appr_contrast', {
        id: 'appr_contrast',
        value: createValidDoc({
          id: 'appr_contrast',
          scopes: [{ subjectRef: 'elem_contrast', statement }]
        })
      });

      const contract = {
        elementMappings: [
          {
            id: 'elem_contrast',
            mappingStatus: DEVIATION_STATUSES.OWNER_APPROVED_NEW_SURFACE,
            ownerApprovalRef: 'appr_contrast',
            ownerApprovalStatement: statement
          }
        ],
        actionBindings: [],
        preservationObligations: [],
        capabilities: []
      };

      const result = evaluateContractDeviations(contract, map, { throwOnError: false });
      assert.strictEqual(result.status, 'PASS');
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.approvedDeviations.length, 1);
      assert.strictEqual(result.defects.length, 0);
      assert.strictEqual(result.blockers.length, 0);
    });
  });
});
