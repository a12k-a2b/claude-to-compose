/**
 * src/baseline/quality_gate.js
 * Fail-Closed Baseline Quality Gate.
 *
 * Invariant: If the existing app fails compilation or existing unit tests fail
 * BEFORE retrofit begins, mark baseline as BLOCKED.
 * Never allow pre-existing failures to be blamed on subsequent redesign steps.
 */

'use strict';

function evaluateBaselineQualityGate(environmentResult, compilationResult, testSuiteResult) {
  const blockers = [];

  // Fail-closed gate: if any evidence is null or missing, block immediately
  if (!environmentResult || !compilationResult || !testSuiteResult) {
    blockers.push({
      stage: 'missing_evidence',
      reason: 'Missing prerequisite baseline evidence',
      verbatimError: 'Baseline quality gate called with null, undefined, or missing evidence',
      remediation: 'Execute complete environment, compilation, and test suite checks before evaluating quality gate.'
    });
  }

  // 1. Environment Gate
  if (environmentResult && environmentResult.status !== 'PASS') {
    for (const fail of environmentResult.failures || []) {
      blockers.push({
        stage: 'environment',
        reason: 'Missing prerequisite tool or invalid environment',
        verbatimError: fail,
        remediation: 'Install or configure the missing developer tools before starting retrofit.'
      });
    }
  }

  // 2. Compilation Gate
  if (compilationResult && (!compilationResult.success || compilationResult.exitCode !== 0 || (compilationResult.errorCount && compilationResult.errorCount > 0))) {
    blockers.push({
      stage: 'compilation',
      reason: 'Existing application fails Kotlin compilation before retrofit begins',
      verbatimError: compilationResult.errorLog || (compilationResult.errorCount ? `${compilationResult.errorCount} compilation errors` : 'Exit code ' + compilationResult.exitCode),
      remediation: 'Fix pre-existing Kotlin compilation errors before attempting redesign.'
    });
  }

  // 3. Unit Tests Gate
  if (testSuiteResult && (!testSuiteResult.success || testSuiteResult.failedCount > 0)) {
    const failureSummary = (testSuiteResult.failures || []).map(f => `${f.suite}#${f.testName}: ${f.message}`).join('; ');
    blockers.push({
      stage: 'unit_tests',
      reason: `Pre-existing test suite has ${testSuiteResult.failedCount} failing unit test(s)`,
      verbatimError: failureSummary || testSuiteResult.errorLog || 'Exit code ' + testSuiteResult.exitCode,
      remediation: 'Fix pre-existing failing unit tests. Redesign cannot begin on a broken baseline.'
    });
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

module.exports = {
  evaluateBaselineQualityGate
};
