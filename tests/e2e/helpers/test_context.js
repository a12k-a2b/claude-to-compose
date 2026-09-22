'use strict';

/**
 * tests/e2e/helpers/test_context.js
 *
 * Isolated Test Context API for ctc v2 E2E test suite.
 * Supports progressive testability without crashing on pending milestones.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const oracle = require('./oracle');

class UnimplementedError extends Error {
  constructor(component, milestone, reason) {
    super(`Unimplemented component: "${component}" (Milestone: ${milestone || 'Pending'})${reason ? ' - ' + reason : ''}`);
    this.name = 'UnimplementedError';
    this.component = component;
    this.milestone = milestone;
    this.reason = reason;
  }
}

class SkipTestError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipTestError';
    this.reason = reason;
  }
}

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function createTestContext(testId, testName) {
  return {
    testId,
    testName,
    projectRoot: PROJECT_ROOT,
    oracle,

    assert(condition, message) {
      if (!condition) {
        throw new assert.AssertionError({
          message: message || `Assertion failed in ${testId}`,
          actual: condition,
          expected: true,
          operator: '=='
        });
      }
    },

    assertEqual(actual, expected, message) {
      assert.strictEqual(actual, expected, message);
    },

    assertDeepEqual(actual, expected, message) {
      assert.deepStrictEqual(actual, expected, message);
    },

    assertMatch(actualStr, regex, message) {
      assert.match(String(actualStr), regex, message);
    },

    assertThrows(fn, expected, message) {
      assert.throws(fn, expected, message);
    },

    async assertRejects(promiseFn, expected, message) {
      await assert.rejects(promiseFn, expected, message);
    },

    checkFileExists(relPath, milestone, detail) {
      const fullPath = path.resolve(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new UnimplementedError(relPath, milestone, detail || `File not found: ${relPath}`);
      }
      return fullPath;
    },

    checkComponent(componentName, milestone, checkFn) {
      try {
        const result = checkFn();
        if (result === false) {
          throw new UnimplementedError(componentName, milestone, 'Component check returned false');
        }
        return result;
      } catch (err) {
        if (err instanceof UnimplementedError) throw err;
        if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ENOENT') {
          throw new UnimplementedError(componentName, milestone, err.message);
        }
        throw err;
      }
    },

    unimplemented(component, milestone, reason) {
      throw new UnimplementedError(component, milestone, reason);
    },

    skip(reason) {
      throw new SkipTestError(reason);
    }
  };
}

module.exports = {
  createTestContext,
  UnimplementedError,
  SkipTestError,
  PROJECT_ROOT
};
