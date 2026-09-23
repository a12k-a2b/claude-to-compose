'use strict';

/**
 * tests/unit/owner_approval_schema.test.js
 *
 * Unit test suite for Owner Approval Draft 2020-12 Schema and Validator Integration.
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  validateOwnerApproval,
  validateOwnerApprovalOrThrow,
  formatSchemaIssues,
  schemas
} = require('../../src/contract/schemas');

const {
  validateContractAgainstSchemas
} = require('../../src/contract');

describe('Owner Approval Schema (Draft 2020-12)', () => {
  it('loads valid owner_approval schema from registry', () => {
    const schema = schemas.ownerApproval;
    assert.ok(schema);
    assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(schema.title, 'Owner approval v1');
    assert.strictEqual(schema.properties.schemaVersion.const, '1.0.0');
    assert.strictEqual(schema.properties.kind.const, 'OwnerApproval');
  });

  it('validates a valid owner approval document', () => {
    const doc = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.surface-redesign',
      scopes: [
        {
          subjectRef: 'mapping.root-container',
          statement: 'Approve new 3-pill floating action bar layout.'
        },
        {
          subjectRef: 'binding.save-callback',
          statement: 'The save control may emit the explicitly approved synthetic callback.'
        }
      ]
    };

    const valid = validateOwnerApproval(doc);
    assert.strictEqual(valid, true);
    assert.strictEqual(validateOwnerApproval.errors, null);
    assert.deepStrictEqual(validateOwnerApproval.issues, []);
  });

  it('supports detailed result mode', () => {
    const doc = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.ok',
      scopes: [{ subjectRef: 'sub.1', statement: 'Statement 1' }]
    };
    const result = validateOwnerApproval(doc, { detailed: true });
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.issues, []);
    assert.deepStrictEqual(result.errors, []);
  });

  it('rejects invalid schemaVersion and kind', () => {
    const doc = {
      schemaVersion: '2.0.0',
      kind: 'WrongKind',
      id: 'approval.test',
      scopes: [{ subjectRef: 'sub.1', statement: 'Statement' }]
    };

    const valid = validateOwnerApproval(doc);
    assert.strictEqual(valid, false);
    assert.ok(validateOwnerApproval.errors.length >= 2);
    const keywords = validateOwnerApproval.issues.map((i) => i.keyword);
    assert.ok(keywords.includes('const'));
  });

  it('rejects missing required fields', () => {
    const doc = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval'
      // missing id and scopes
    };

    const valid = validateOwnerApproval(doc);
    assert.strictEqual(valid, false);
    const missingProps = validateOwnerApproval.issues
      .filter((i) => i.keyword === 'required')
      .map((i) => i.params.missingProperty);
    assert.ok(missingProps.includes('id'));
    assert.ok(missingProps.includes('scopes'));
  });

  it('enforces id pattern and bounds', () => {
    const invalidIds = [
      '',
      ' ',
      '.leading-dot',
      '/leading-slash',
      ':leading-colon',
      'id with spaces',
      'id@with@symbols',
      'a'.repeat(201) // exceeds maxLength: 200
    ];

    for (const badId of invalidIds) {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: badId,
        scopes: [{ subjectRef: 'sub.1', statement: 'Statement' }]
      };
      assert.strictEqual(validateOwnerApproval(doc), false, `Should reject id: "${badId}"`);
    }

    const validIds = [
      'approval.explicit',
      'approval_1',
      'approval-v1',
      'approval:custom',
      'approval/nested',
      'approval#section',
      'mapping[0](callback)'
    ];

    for (const goodId of validIds) {
      const doc = {
        schemaVersion: '1.0.0',
        kind: 'OwnerApproval',
        id: goodId,
        scopes: [{ subjectRef: goodId, statement: 'Valid statement' }]
      };
      assert.strictEqual(validateOwnerApproval(doc), true, `Should accept id: "${goodId}"`);
    }
  });

  it('rejects empty scopes array (minItems: 1)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.empty',
      scopes: []
    };

    const valid = validateOwnerApproval(doc);
    assert.strictEqual(valid, false);
    assert.ok(validateOwnerApproval.issues.some((i) => i.keyword === 'minItems'));
  });

  it('rejects scope with empty statement (minLength: 1)', () => {
    const doc = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.empty-stmt',
      scopes: [{ subjectRef: 'sub.1', statement: '' }]
    };

    const valid = validateOwnerApproval(doc);
    assert.strictEqual(valid, false);
    assert.ok(validateOwnerApproval.issues.some((i) => i.keyword === 'minLength' && i.path === '/scopes/0/statement'));
  });

  it('rejects additional properties at top level and scope level', () => {
    const extraTop = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.extra-top',
      scopes: [{ subjectRef: 'sub.1', statement: 'Statement' }],
      unauthorizedProp: 'malicious'
    };
    assert.strictEqual(validateOwnerApproval(extraTop), false);
    assert.ok(validateOwnerApproval.issues.some((i) => i.keyword === 'additionalProperties' && i.params.additionalProperty === 'unauthorizedProp'));

    const extraScope = {
      schemaVersion: '1.0.0',
      kind: 'OwnerApproval',
      id: 'approval.extra-scope',
      scopes: [{ subjectRef: 'sub.1', statement: 'Statement', extraScopeData: true }]
    };
    assert.strictEqual(validateOwnerApproval(extraScope), false);
    assert.ok(validateOwnerApproval.issues.some((i) => i.keyword === 'additionalProperties' && i.params.additionalProperty === 'extraScopeData'));
  });

  it('validateOwnerApprovalOrThrow throws descriptive SCHEMA_VALIDATION_ERROR', () => {
    const invalidDoc = {
      schemaVersion: '2.0.0',
      kind: 'Bad'
    };
    assert.throws(
      () => validateOwnerApprovalOrThrow(invalidDoc, 'custom approval'),
      (err) => {
        assert.strictEqual(err.code, 'SCHEMA_VALIDATION_ERROR');
        assert.ok(err.message.includes('custom approval failed schema validation'));
        assert.ok(Array.isArray(err.validationErrors));
        return true;
      }
    );
  });

  it('validates owner approvals embedded in contract bundles', () => {
    const validContract = {
      screenId: 'test_screen',
      measuredScenes: { scenes: {} },
      layoutIntent: { screenId: 'test_screen' },
      behaviorContract: { screenId: 'test_screen' },
      designSystem: {},
      ownerApprovals: [
        {
          schemaVersion: '1.0.0',
          kind: 'OwnerApproval',
          id: 'approval.test',
          scopes: [{ subjectRef: 'item.1', statement: 'Approved' }]
        }
      ]
    };
    const validation = validateContractAgainstSchemas(validContract);
    assert.strictEqual(validation.layers.ownerApprovals.valid, true);

    const invalidContract = {
      ...validContract,
      ownerApprovals: [
        {
          schemaVersion: '1.0.0',
          kind: 'OwnerApproval',
          id: 'invalid id with spaces',
          scopes: []
        }
      ]
    };
    const invalidRes = validateContractAgainstSchemas(invalidContract);
    assert.strictEqual(invalidRes.layers.ownerApprovals.valid, false);
    assert.strictEqual(invalidRes.valid, false);
  });
});
