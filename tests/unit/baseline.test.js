/**
 * tests/unit/baseline.test.js
 * Unit test suite for Baseline Harness & Quality Gate (src/baseline/)
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Ajv = require('ajv/dist/2020');

const {
  runEnvironmentCheck,
  checkNode,
  checkJava,
  checkGradle,
  checkAndroidSdk
} = require('../../src/baseline/environment');
const { inspectGradleProject } = require('../../src/baseline/gradle_inspector');
const {
  parseJUnitXml,
  executeBaselineCompilation,
  executeBaselineTestSuite
} = require('../../src/baseline/compiler_runner');
const { computeSha256, captureBaselinePreviews } = require('../../src/baseline/preview_capture');
const { evaluateBaselineQualityGate } = require('../../src/baseline/quality_gate');
const { buildBehaviorInvariantsManifest } = require('../../src/baseline/invariants_manifest');
const { runInspectApp } = require('../../src/baseline/inspect_app_runner');
const { runBaseline } = require('../../src/baseline/index');

const baselineSchema = require('../../src/baseline/schemas/app-baseline.schema.json');
const invariantsSchema = require('../../src/baseline/schemas/behavior-invariants.schema.json');
const appModelSchema = require('../../src/baseline/schemas/existing-app-model.schema.json');

describe('Baseline Environment Checks', () => {
  it('validates Node runtime >= 18.0.0', () => {
    const node = checkNode();
    assert.strictEqual(node.status, 'PASS');
    assert.ok(node.major >= 18);
    assert.strictEqual(node.error, null);
  });

  it('validates Java JDK >= 17', () => {
    const java = checkJava();
    assert.strictEqual(java.status, 'PASS');
    assert.ok(java.majorVersion >= 17, `Expected JDK >= 17, found ${java.majorVersion}`);
  });

  it('validates Gradle wrapper in note-app fixture', () => {
    const gradle = checkGradle('./fixtures/note-app');
    assert.strictEqual(gradle.status, 'PASS');
    assert.strictEqual(gradle.wrapperPresent, true);
    assert.strictEqual(gradle.wrapperExecutable, true);
    assert.strictEqual(gradle.declaredVersion, '8.11.1');
  });

  it('validates Android SDK and installed platforms in note-app fixture', () => {
    const sdk = checkAndroidSdk('./fixtures/note-app');
    assert.strictEqual(sdk.status, 'PASS');
    assert.ok(sdk.sdkPath, 'SDK path must be defined');
    assert.ok(sdk.installedPlatforms.length > 0, 'Must have at least one platform installed');
  });

  it('runs unified environment check returning PASS on healthy setup', () => {
    const env = runEnvironmentCheck('./fixtures/note-app');
    assert.strictEqual(env.status, 'PASS');
    assert.strictEqual(env.failures.length, 0);
  });
});

describe('Gradle Inspector', () => {
  it('inspects note-app topology, SDKs, and Compose configurations', () => {
    const meta = inspectGradleProject('./fixtures/note-app', 'app');
    assert.strictEqual(meta.targetModule, 'app');
    assert.strictEqual(meta.namespace, 'com.claude.noteapp');
    assert.strictEqual(meta.compileSdk, 35);
    assert.strictEqual(meta.minSdk, 26);
    assert.strictEqual(meta.targetSdk, 35);
    assert.strictEqual(meta.composeConfig.enabled, true);
    assert.strictEqual(meta.composeConfig.compilerPlugin, 'org.jetbrains.kotlin.plugin.compose');
    assert.strictEqual(meta.dependencies.composeBom, '2024.10.01');
    assert.strictEqual(meta.dependencies.room, true);
    assert.strictEqual(meta.dependencies.navigationCompose, true);
    assert.strictEqual(meta.dependencies.robolectric, true);
    assert.ok(meta.sourceSets.mainKotlin.length > 0);
  });
});

describe('Compiler Runner & JUnit XML Parsing', () => {
  it('parses JUnit XML test reports with passing, failing, and error tests', () => {
    const sampleXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <testsuite name="com.example.SampleTest" tests="3" skipped="0" failures="1" errors="1" timestamp="2026-09-22T12:00:00" hostname="localhost" time="0.123">
        <testcase name="testPass" classname="com.example.SampleTest" time="0.050"/>
        <testcase name="testFail" classname="com.example.SampleTest" time="0.030">
          <failure message="expected 1 but was 2" type="java.lang.AssertionError">java.lang.AssertionError: expected 1 but was 2</failure>
        </testcase>
        <testcase name="testError" classname="com.example.SampleTest" time="0.043">
          <error message="NullPointerException" type="java.lang.NullPointerException">java.lang.NullPointerException</error>
        </testcase>
      </testsuite>
    `;

    const parsed = parseJUnitXml(sampleXml);
    assert.strictEqual(parsed.total, 3);
    assert.strictEqual(parsed.failures, 1);
    assert.strictEqual(parsed.errors, 1);
    assert.strictEqual(parsed.skipped, 0);
    assert.strictEqual(parsed.tests.length, 3);

    const passTest = parsed.tests.find(t => t.testName === 'testPass');
    assert.strictEqual(passTest.status, 'PASSED');

    const failTest = parsed.tests.find(t => t.testName === 'testFail');
    assert.strictEqual(failTest.status, 'FAILED');
    assert.ok(failTest.message.includes('expected 1 but was 2'));
  });

  it('reads real JUnit XML reports generated by note-app test suite', () => {
    const testResults = executeBaselineTestSuite('./fixtures/note-app', 'app', 'debug');
    assert.strictEqual(testResults.stage, 'test');
    assert.strictEqual(testResults.success, true);
    assert.ok(testResults.totalCount >= 8, `Expected >= 8 tests across the 3 suites, found ${testResults.totalCount}`);
    assert.strictEqual(testResults.failedCount, 0);
  });
});

describe('Preview & Semantics Capture', () => {
  it('computes deterministic SHA-256 hashes of binary buffers', () => {
    const hash1 = computeSha256(Buffer.from('LivePaper Grayscale Screen'));
    const hash2 = computeSha256(Buffer.from('LivePaper Grayscale Screen'));
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('gracefully handles projects without existing preview outputs', async () => {
    const result = await captureBaselinePreviews('./fixtures/note-app', 'app');
    assert.strictEqual(result.captured, false);
    assert.deepStrictEqual(result.previews, []);
  });
});

describe('Fail-Closed Baseline Quality Gate', () => {
  it('verdicts READY_FOR_RETROFIT when environment, compilation, and test suites pass', () => {
    const envPass = { status: 'PASS', failures: [] };
    const compilePass = { success: true, exitCode: 0, errorLog: null };
    const testsPass = { success: true, totalCount: 10, passedCount: 10, failedCount: 0, failures: [] };

    const gate = evaluateBaselineQualityGate(envPass, compilePass, testsPass);
    assert.strictEqual(gate.verdict, 'READY_FOR_RETROFIT');
    assert.strictEqual(gate.canProceedWithRetrofit, true);
    assert.strictEqual(gate.blockersCount, 0);
  });

  it('verdicts BLOCKED when existing application fails compilation', () => {
    const envPass = { status: 'PASS', failures: [] };
    const compileFail = {
      success: false,
      exitCode: 1,
      errorLog: 'e: /app/src/main/java/Broken.kt: (10, 5): Unresolved reference: foo'
    };
    const testsSkipped = { success: false, totalCount: 0, passedCount: 0, failedCount: 0, failures: [] };

    const gate = evaluateBaselineQualityGate(envPass, compileFail, testsSkipped);
    assert.strictEqual(gate.verdict, 'BLOCKED');
    assert.strictEqual(gate.canProceedWithRetrofit, false);
    assert.ok(gate.blockers.some(b => b.stage === 'compilation'));
    assert.ok(gate.blockers.some(b => b.verbatimError.includes('Unresolved reference: foo')));
  });

  it('verdicts BLOCKED when pre-existing unit tests fail', () => {
    const envPass = { status: 'PASS', failures: [] };
    const compilePass = { success: true, exitCode: 0, errorLog: null };
    const testsFail = {
      success: false,
      totalCount: 5,
      passedCount: 4,
      failedCount: 1,
      failures: [{ suite: 'NoteDaoTest', testName: 'insertAndRetrieveNote', message: 'expected 1 but was 0' }]
    };

    const gate = evaluateBaselineQualityGate(envPass, compilePass, testsFail);
    assert.strictEqual(gate.verdict, 'BLOCKED');
    assert.strictEqual(gate.canProceedWithRetrofit, false);
    assert.ok(gate.blockers.some(b => b.stage === 'unit_tests'));
    assert.ok(gate.blockers.some(b => b.verbatimError.includes('NoteDaoTest#insertAndRetrieveNote')));
  });

  it('verdicts BLOCKED when environment prerequisites are missing', () => {
    const envFail = {
      status: 'BLOCKED',
      failures: ['JDK 17+ required for AGP 8+, found Java major version 11']
    };
    const compilePass = { success: true, exitCode: 0 };
    const testsPass = { success: true, failedCount: 0 };

    const gate = evaluateBaselineQualityGate(envFail, compilePass, testsPass);
    assert.strictEqual(gate.verdict, 'BLOCKED');
    assert.strictEqual(gate.canProceedWithRetrofit, false);
    assert.ok(gate.blockers.some(b => b.stage === 'environment'));
  });
});

describe('Behavior Invariants Manifest & Schemas', () => {
  it('generates standardized behavior invariants manifest containing INVAR-01 to INVAR-05', () => {
    const manifest = buildBehaviorInvariantsManifest(
      { applicationId: 'com.claude.noteapp' },
      { targetModule: 'app' }
    );

    assert.strictEqual(manifest.schemaVersion, '2.0.0');
    assert.strictEqual(manifest.applicationId, 'com.claude.noteapp');
    assert.strictEqual(manifest.invariants.length, 5);

    const persistInv = manifest.invariants.find(i => i.id === 'INV-PERSIST-001');
    assert.ok(persistInv);
    assert.strictEqual(persistInv.category, 'DATA_PERSISTENCE');
    assert.strictEqual(persistInv.criticality, 'FATAL');

    const navInv = manifest.invariants.find(i => i.id === 'INV-NAV-001');
    assert.ok(navInv);
    assert.strictEqual(navInv.category, 'NAVIGATION_STACK');

    const saveInv = manifest.invariants.find(i => i.id === 'INV-SAVE-001');
    assert.ok(saveInv);
    assert.strictEqual(saveInv.category, 'ASYNC_DEBOUNCE');
  });

  it('validates behavior invariants manifest against JSON schema', () => {
    const manifest = buildBehaviorInvariantsManifest(
      { applicationId: 'com.claude.noteapp' },
      { targetModule: 'app' }
    );
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(invariantsSchema);
    const valid = validate(manifest);
    assert.strictEqual(valid, true, 'Manifest must be schema-valid');
  });
});

describe('End-to-End Baseline & Inspect-App Workflows', () => {
  it('executes runInspectApp and writes schema-valid existing-app-model.json', async () => {
    const outDir = path.resolve('./.ctc/test_app_inspect');
    const res = await runInspectApp({
      project: './fixtures/note-app',
      module: 'app',
      output: outDir
    });

    assert.strictEqual(res.status, 'PASS');
    assert.ok(fs.existsSync(res.data.modelPath));
    assert.ok(fs.existsSync(res.data.invariantsPath));

    const model = JSON.parse(fs.readFileSync(res.data.modelPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(appModelSchema);
    const valid = validate(model);
    assert.strictEqual(valid, true, 'Inspected app model must conform to schema');
  });

  it('executes runBaseline and writes schema-valid app-baseline.json with READY_FOR_RETROFIT', async () => {
    const outDir = path.resolve('./.ctc/test_app_baseline');
    const res = await runBaseline({
      project: './fixtures/note-app',
      module: 'app',
      variant: 'debug',
      output: outDir
    });

    assert.strictEqual(res.status, 'READY_FOR_RETROFIT');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.exitCode, 0);

    const baselineData = JSON.parse(fs.readFileSync(res.data.baselineFile, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(baselineSchema);
    const valid = validate(baselineData);
    assert.strictEqual(valid, true, 'app-baseline.json must conform to schema');
  });
});
