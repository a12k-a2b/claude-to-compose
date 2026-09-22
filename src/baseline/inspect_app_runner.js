/**
 * src/baseline/inspect_app_runner.js
 * Implements `ctc inspect-app` workflow.
 * Bridges src/analyzer/ to parse AST and write .ctc/app/existing-app-model.json
 * and .ctc/app/behavior-invariants.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { inspectGradleProject } = require('./gradle_inspector');
const { buildBehaviorInvariantsManifest } = require('./invariants_manifest');

async function runInspectApp(options = {}) {
  const projectPath = path.resolve(options.project || options.projectDir || options.android || '.');
  const targetModule = options.module || 'app';
  const outputDir = path.resolve(options.output || path.join(projectPath, '.ctc/app'));

  // 1. Inspect gradle project metadata
  const gradleMeta = inspectGradleProject(projectPath, targetModule);

  // 2. Delegate to src/analyzer/ to parse AST
  let existingAppModel = null;
  const analyzerModulePath = path.resolve(__dirname, '../analyzer/index.js');

  if (fs.existsSync(analyzerModulePath)) {
    const { parseAndroidProject } = require(analyzerModulePath);
    existingAppModel = await parseAndroidProject(projectPath, targetModule);
  } else {
    existingAppModel = {
      version: '2.0.0',
      generatedAt: new Date().toISOString(),
      projectRoot: projectPath,
      targetModule,
      packageName: gradleMeta.namespace,
      buildSystem: {
        type: 'gradle',
        compileSdk: gradleMeta.compileSdk,
        targetSdk: gradleMeta.targetSdk,
        minSdk: gradleMeta.minSdk
      },
      screens: [],
      routes: [],
      stateHolders: [],
      actionClasses: [],
      persistence: { entities: [], daos: [], databases: [], repositories: [] },
      invariants: [],
      diagnostics: []
    };
  }

  // 3. Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 4. Write existing-app-model.json
  const modelFile = path.join(outputDir, 'existing-app-model.json');
  fs.writeFileSync(modelFile, JSON.stringify(existingAppModel, null, 2), 'utf8');

  // 5. Generate and write behavior-invariants.json
  const invariants = buildBehaviorInvariantsManifest(existingAppModel, { targetModule, applicationId: gradleMeta.applicationId });
  const invariantsFile = path.join(outputDir, 'behavior-invariants.json');
  fs.writeFileSync(invariantsFile, JSON.stringify(invariants, null, 2), 'utf8');

  return {
    success: true,
    status: 'PASS',
    command: 'inspect-app',
    data: {
      modelPath: modelFile,
      invariantsPath: invariantsFile,
      moduleName: targetModule,
      namespace: existingAppModel.packageName || gradleMeta.namespace,
      screensCount: existingAppModel.screens.length,
      invariantsCount: invariants.invariants.length,
      existingAppModel
    },
    exitCode: 0
  };
}

module.exports = {
  runInspectApp
};
