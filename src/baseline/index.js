/**
 * src/baseline/index.js
 * Main entrypoint for Baseline Harness and Pre-Retrofit Application Health Capture.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { runEnvironmentCheck } = require('./environment');
const { inspectGradleProject } = require('./gradle_inspector');
const { executeBaselineCompilation, executeBaselineTestSuite } = require('./compiler_runner');
const { captureBaselinePreviews } = require('./preview_capture');
const { evaluateBaselineQualityGate } = require('./quality_gate');
const { buildBehaviorInvariantsManifest } = require('./invariants_manifest');
const { runInspectApp } = require('./inspect_app_runner');

/**
 * Main entrypoint for `ctc baseline` workflow.
 */
async function runBaseline(options = {}) {
  const projectPath = path.resolve(options.project || options.projectDir || options.android || '.');
  const targetModule = options.module || 'app';
  const variant = options.variant || 'debug';
  const outputDir = path.resolve(options.output || path.join(projectPath, '.ctc/app'));

  // Step 1: Environment Check
  const envResult = runEnvironmentCheck(projectPath);

  // Step 2: Inspect Gradle Project
  const gradleMeta = inspectGradleProject(projectPath, targetModule);

  // Step 3: Execute Baseline Compilation (compileDebugKotlin)
  const compileResult = executeBaselineCompilation(projectPath, targetModule, variant);

  // Step 4: Execute Baseline Unit Tests (testDebugUnitTest)
  const testResult = executeBaselineTestSuite(projectPath, targetModule, variant);

  // Step 5: Capture Previews & Semantics (if present)
  const previewResult = await captureBaselinePreviews(projectPath, targetModule);

  // Evaluate Fail-Closed Baseline Quality Gate
  const qualityGate = evaluateBaselineQualityGate(envResult, compileResult, testResult);

  // Construct app-baseline.json
  const appBaseline = {
    schemaVersion: '2.0.0',
    capturedAt: new Date().toISOString(),
    project: {
      projectPath,
      targetModule,
      variant
    },
    environment: envResult,
    gradle: gradleMeta,
    compilation: {
      command: compileResult.command,
      exitCode: compileResult.exitCode,
      durationMs: compileResult.durationMs,
      success: compileResult.success,
      errorLog: compileResult.errorLog
    },
    testSuite: {
      command: testResult.command,
      exitCode: testResult.exitCode,
      durationMs: testResult.durationMs,
      success: testResult.success,
      totalCount: testResult.totalCount,
      passedCount: testResult.passedCount,
      failedCount: testResult.failedCount,
      skippedCount: testResult.skippedCount,
      failures: testResult.failures
    },
    previews: previewResult,
    qualityGate
  };

  // Write outputs
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const baselineFile = path.join(outputDir, 'app-baseline.json');
  fs.writeFileSync(baselineFile, JSON.stringify(appBaseline, null, 2), 'utf8');

  // Also write behavior-invariants.json
  const invariants = buildBehaviorInvariantsManifest({ applicationId: gradleMeta.applicationId }, { targetModule });
  const invariantsFile = path.join(outputDir, 'behavior-invariants.json');
  fs.writeFileSync(invariantsFile, JSON.stringify(invariants, null, 2), 'utf8');

  return {
    success: qualityGate.canProceedWithRetrofit,
    status: qualityGate.verdict,
    exitCode: qualityGate.canProceedWithRetrofit ? 0 : 1,
    data: {
      baselineFile,
      invariantsFile,
      appBaseline,
      qualityGate
    }
  };
}

const captureBaseline = async (projectPath, variant = 'debug') => {
  return runBaseline({ project: projectPath, variant });
};

module.exports = {
  captureBaseline,
  captureAppBaseline: captureBaseline,
  runBaseline,
  runInspectApp,
  runEnvironmentCheck,
  inspectGradleProject,
  executeBaselineCompilation,
  executeBaselineTestSuite,
  captureBaselinePreviews,
  evaluateBaselineQualityGate,
  buildBehaviorInvariantsManifest
};
