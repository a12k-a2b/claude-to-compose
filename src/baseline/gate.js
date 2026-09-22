/**
 * src/baseline/gate.js
 * Fail-Closed Baseline Quality Gate facade.
 */

'use strict';

const { evaluateBaselineQualityGate: coreEvaluateGate } = require('./quality_gate');

/**
 * Evaluates baseline quality gate.
 * Accepts either:
 * - A single AppBaseline object: { compilationBaseline, testBaseline, previewBaseline }
 * - Three evidence objects: (environmentResult, compilationResult, testSuiteResult)
 *
 * @param {object|null} baselineOrEnv Baseline object or environment result
 * @param {object|null} [compileResult] Compilation result
 * @param {object|null} [testResult] Test suite result
 * @returns {object} Gate outcome: { status: 'PASS'|'BLOCKED', verdict: string, canProceedWithRetrofit: boolean, blockers: Array }
 */
function evaluateBaselineGate(baselineOrEnv, compileResult, testResult) {
  // If called with 3 arguments (or compileResult is provided), delegate to core gate
  if (compileResult !== undefined || testResult !== undefined) {
    return coreEvaluateGate(baselineOrEnv, compileResult, testResult);
  }

  // Called with single baseline object or null/undefined
  if (!baselineOrEnv || typeof baselineOrEnv !== 'object') {
    return {
      status: 'BLOCKED',
      verdict: 'BLOCKED',
      canProceedWithRetrofit: false,
      blockersCount: 1,
      blockers: ['Missing or unreadable baseline evidence reports BLOCKED']
    };
  }

  const blockers = [];
  const comp = baselineOrEnv.compilationBaseline;
  const test = baselineOrEnv.testBaseline;

  if (!comp && !test) {
    blockers.push('Missing baseline compilation and test evidence');
  }

  if (comp) {
    if (comp.compileDebugKotlinSuccess === false || comp.errorCount > 0) {
      blockers.push(`Failed compilation baseline with ${comp.errorCount || 1} compilation error(s)`);
    }
  }

  if (test) {
    if (test.failed > 0) {
      blockers.push(`Failed unit test baseline with ${test.failed} failing test(s)`);
    }
  }

  const isBlocked = blockers.length > 0;

  return {
    status: isBlocked ? 'BLOCKED' : 'PASS',
    verdict: isBlocked ? 'BLOCKED' : 'READY_FOR_RETROFIT',
    canProceedWithRetrofit: !isBlocked,
    blockersCount: blockers.length,
    blockers
  };
}

const evaluateBaselineQualityGate = (env, compile, test) => {
  if (compile === undefined && test === undefined) {
    return evaluateBaselineGate(env);
  }
  return coreEvaluateGate(env, compile, test);
};

const evaluateGate = evaluateBaselineGate;

function validateThresholds(thresholds = {}) {
  for (const [key, val] of Object.entries(thresholds)) {
    if (typeof val === 'number' && (isNaN(val) || val < 0)) {
      throw new Error(`Invalid negative or NaN threshold limit for ${key}: ${val}`);
    }
  }
  return true;
}

module.exports = {
  evaluateBaselineGate,
  evaluateBaselineQualityGate,
  evaluateGate,
  validateThresholds
};
