/**
 * src/baseline/gradle_inspector.js
 * Static & dynamic Gradle project inspector extracting module topology,
 * namespace, SDK versions, Compose configuration, and key dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function inspectGradleProject(projectPath = '.', targetModule = 'app') {
  const resolvedRoot = path.resolve(projectPath);

  // 1. Parse settings.gradle(.kts)
  let settingsFile = path.join(resolvedRoot, 'settings.gradle.kts');
  if (!fs.existsSync(settingsFile)) {
    settingsFile = path.join(resolvedRoot, 'settings.gradle');
  }

  const modules = [];
  if (fs.existsSync(settingsFile)) {
    const settingsContent = fs.readFileSync(settingsFile, 'utf8');
    const includeRegex = /include\s*\(?\s*['"](?::)?([^'"]+)['"]\s*\)?/g;
    let match;
    while ((match = includeRegex.exec(settingsContent)) !== null) {
      modules.push(match[1].replace(/^:/, ''));
    }
  }
  if (modules.length === 0) modules.push(targetModule);

  // 2. Locate module build.gradle(.kts)
  const moduleDir = path.join(resolvedRoot, targetModule);
  let buildFile = path.join(moduleDir, 'build.gradle.kts');
  if (!fs.existsSync(buildFile)) {
    buildFile = path.join(moduleDir, 'build.gradle');
  }

  if (!fs.existsSync(buildFile)) {
    // Try root build.gradle.kts if single module
    if (fs.existsSync(path.join(resolvedRoot, 'build.gradle.kts'))) {
      buildFile = path.join(resolvedRoot, 'build.gradle.kts');
    } else {
      throw new Error(`Target module build file not found: ${buildFile}`);
    }
  }

  const buildContent = fs.readFileSync(buildFile, 'utf8');

  // Extract namespace & applicationId
  const namespaceMatch = buildContent.match(/namespace\s*=\s*["']([^"']+)["']/);
  const appIdMatch = buildContent.match(/applicationId\s*=\s*["']([^"']+)["']/);

  // Extract SDK versions
  const compileSdkMatch = buildContent.match(/compileSdk\s*=\s*(\d+)/);
  const minSdkMatch = buildContent.match(/minSdk\s*=\s*(\d+)/);
  const targetSdkMatch = buildContent.match(/targetSdk\s*=\s*(\d+)/);

  // Extract Compose Configuration
  const composeEnabled = /compose\s*=\s*true/.test(buildContent);
  const composePlugin = /id\(["']org\.jetbrains\.kotlin\.plugin\.compose["']\)/.test(buildContent)
    ? 'org.jetbrains.kotlin.plugin.compose'
    : (buildContent.includes('composeOptions') ? 'legacy-composeOptions' : 'none');

  const bomMatch = buildContent.match(/androidx\.compose:compose-bom:([0-9.]+)/);
  const kotlinExtMatch = buildContent.match(/kotlinCompilerExtensionVersion\s*=\s*["']([^"']+)["']/);

  // Extract key dependencies
  const dependencies = {
    composeBom: bomMatch ? bomMatch[1] : null,
    composeMaterial3: /androidx\.compose\.material3:material3/.test(buildContent),
    room: /androidx\.room:room-/.test(buildContent),
    navigationCompose: /androidx\.navigation:navigation-compose/.test(buildContent),
    lifecycleViewModel: /androidx\.lifecycle:lifecycle-viewmodel-compose/.test(buildContent),
    robolectric: /org\.robolectric:robolectric/.test(buildContent),
    composeTestJunit4: /androidx\.compose\.ui:ui-test-junit4/.test(buildContent)
  };

  // Inspect source sets
  const sourceSets = {
    mainKotlin: [],
    mainRes: [],
    testKotlin: []
  };

  const mainSrc = path.join(moduleDir, 'src/main');
  if (fs.existsSync(path.join(mainSrc, 'java'))) sourceSets.mainKotlin.push(path.join(mainSrc, 'java'));
  if (fs.existsSync(path.join(mainSrc, 'kotlin'))) sourceSets.mainKotlin.push(path.join(mainSrc, 'kotlin'));
  if (fs.existsSync(path.join(mainSrc, 'res'))) sourceSets.mainRes.push(path.join(mainSrc, 'res'));

  const testSrc = path.join(moduleDir, 'src/test');
  if (fs.existsSync(path.join(testSrc, 'java'))) sourceSets.testKotlin.push(path.join(testSrc, 'java'));
  if (fs.existsSync(path.join(testSrc, 'kotlin'))) sourceSets.testKotlin.push(path.join(testSrc, 'kotlin'));

  return {
    projectPath: resolvedRoot,
    targetModule,
    modules,
    namespace: namespaceMatch ? namespaceMatch[1] : (appIdMatch ? appIdMatch[1] : 'unknown'),
    applicationId: appIdMatch ? appIdMatch[1] : (namespaceMatch ? namespaceMatch[1] : 'unknown'),
    compileSdk: compileSdkMatch ? parseInt(compileSdkMatch[1], 10) : 34,
    minSdk: minSdkMatch ? parseInt(minSdkMatch[1], 10) : 26,
    targetSdk: targetSdkMatch ? parseInt(targetSdkMatch[1], 10) : 34,
    buildVariants: ['debug', 'release'],
    composeConfig: {
      enabled: composeEnabled,
      compilerPlugin: composePlugin,
      bomVersion: bomMatch ? bomMatch[1] : null,
      kotlinCompilerExtensionVersion: kotlinExtMatch ? kotlinExtMatch[1] : null
    },
    dependencies,
    sourceSets
  };
}

module.exports = {
  inspectGradleProject
};
