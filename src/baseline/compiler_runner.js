/**
 * src/baseline/compiler_runner.js
 * Spawns Gradle child processes (compileDebugKotlin, testDebugUnitTest)
 * with timeout, output capture, and JUnit XML report parsing.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseJUnitXml(xmlContent) {
  const results = {
    total: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    tests: []
  };

  const testcaseRegex = /<testcase\s+([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/testcase>)/g;
  let match;

  while ((match = testcaseRegex.exec(xmlContent)) !== null) {
    const attrs = match[1];
    const inner = match[2] || '';

    const nameMatch = attrs.match(/name=["']([^"']+)["']/);
    const classMatch = attrs.match(/classname=["']([^"']+)["']/);
    const timeMatch = attrs.match(/time=["']([^"']*)["']/);

    const testName = nameMatch ? nameMatch[1] : 'unknown';
    const className = classMatch ? classMatch[1] : 'unknown';
    const duration = parseFloat(timeMatch ? timeMatch[1] : '0');

    results.total++;

    const isFailure = /<failure[\s\S]*?>([\s\S]*?)<\/failure>/.exec(inner);
    const isError = /<error[\s\S]*?>([\s\S]*?)<\/error>/.exec(inner);
    const isSkipped = /<skipped/.test(inner);

    if (isFailure) {
      results.failures++;
      results.tests.push({
        suite: className,
        testName,
        status: 'FAILED',
        duration,
        message: isFailure[1].trim()
      });
    } else if (isError) {
      results.errors++;
      results.tests.push({
        suite: className,
        testName,
        status: 'ERROR',
        duration,
        message: isError[1].trim()
      });
    } else if (isSkipped) {
      results.skipped++;
      results.tests.push({
        suite: className,
        testName,
        status: 'SKIPPED',
        duration
      });
    } else {
      results.tests.push({
        suite: className,
        testName,
        status: 'PASSED',
        duration
      });
    }
  }

  return results;
}

function runGradleCommand(projectPath, args, options = {}) {
  const gradlew = path.resolve(projectPath, 'gradlew');
  const startTime = Date.now();

  const proc = spawnSync(gradlew, args, {
    cwd: projectPath,
    encoding: 'utf8',
    timeout: options.timeout || 180000,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) }
  });

  const durationMs = Date.now() - startTime;
  const exitCode = proc.status !== null ? proc.status : (proc.error ? 1 : 0);

  return {
    command: `./gradlew ${args.join(' ')}`,
    exitCode,
    success: exitCode === 0,
    durationMs,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
    error: proc.error ? proc.error.message : null
  };
}

function executeBaselineCompilation(projectPath, moduleName = 'app', variant = 'debug') {
  const taskVariant = variant.charAt(0).toUpperCase() + variant.slice(1);
  const task = `:${moduleName}:compile${taskVariant}Kotlin`;

  const result = runGradleCommand(projectPath, [task]);
  return {
    stage: 'compile',
    task,
    command: result.command,
    exitCode: result.exitCode,
    success: result.success,
    durationMs: result.durationMs,
    errorLog: result.success ? null : (result.stderr || result.stdout)
  };
}

function executeBaselineTestSuite(projectPath, moduleName = 'app', variant = 'debug') {
  const taskVariant = variant.charAt(0).toUpperCase() + variant.slice(1);
  const task = `:${moduleName}:test${taskVariant}UnitTest`;

  const result = runGradleCommand(projectPath, [task]);

  // Read JUnit XML results
  const testResultsDir = path.resolve(projectPath, moduleName, `build/test-results/test${taskVariant}UnitTest`);
  let totalCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failures = [];

  if (fs.existsSync(testResultsDir)) {
    const xmlFiles = fs.readdirSync(testResultsDir).filter(f => f.endsWith('.xml'));
    for (const file of xmlFiles) {
      const xmlPath = path.join(testResultsDir, file);
      const parsed = parseJUnitXml(fs.readFileSync(xmlPath, 'utf8'));
      totalCount += parsed.total;
      failedCount += (parsed.failures + parsed.errors);
      skippedCount += parsed.skipped;
      for (const t of parsed.tests) {
        if (t.status === 'FAILED' || t.status === 'ERROR') {
          failures.push({
            suite: t.suite,
            testName: t.testName,
            message: t.message || 'Test failed'
          });
        }
      }
    }
    passedCount = totalCount - failedCount - skippedCount;
  }

  return {
    stage: 'test',
    task,
    command: result.command,
    exitCode: result.exitCode,
    success: result.success && failedCount === 0,
    durationMs: result.durationMs,
    totalCount,
    passedCount,
    failedCount,
    skippedCount,
    failures,
    errorLog: result.success ? null : (result.stderr || result.stdout)
  };
}

module.exports = {
  parseJUnitXml,
  runGradleCommand,
  executeBaselineCompilation,
  executeBaselineTestSuite
};
