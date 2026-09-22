/**
 * src/analyzer/gradle_parser.js
 * Inspects Gradle build scripts (settings.gradle[.kts], build.gradle[.kts]) to extract
 * build system metadata, target SDKs, Compose configurations, and dependency versions.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function parseGradleProject(projectPath, targetModuleName = 'app') {
  const resolvedRoot = path.resolve(projectPath);

  // 1. Discover modules from settings.gradle[.kts]
  const modules = [];
  const settingsFiles = ['settings.gradle.kts', 'settings.gradle'];
  for (const file of settingsFiles) {
    const fullPath = path.join(resolvedRoot, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const includeRegex = /include\s*\(?\s*['"](?::)?([^'"]+)['"]\s*\)?/g;
      let match;
      while ((match = includeRegex.exec(content)) !== null) {
        modules.push(match[1].replace(/^:/, ''));
      }
      break;
    }
  }
  if (modules.length === 0) {
    modules.push(targetModuleName);
  }

  // 2. Locate target module directory and build script
  const moduleDir = path.join(resolvedRoot, targetModuleName);
  let buildFile = null;
  const buildFiles = [
    path.join(moduleDir, 'build.gradle.kts'),
    path.join(moduleDir, 'build.gradle'),
    path.join(resolvedRoot, 'build.gradle.kts'),
    path.join(resolvedRoot, 'build.gradle')
  ];

  for (const f of buildFiles) {
    if (fs.existsSync(f)) {
      buildFile = f;
      break;
    }
  }

  let compileSdk = 34;
  let minSdk = 26;
  let targetSdk = 34;
  let namespace = 'unknown';
  let applicationId = 'unknown';
  let composeBomVersion = null;
  let roomVersion = null;
  let navigationVersion = null;
  let kotlinVersion = '2.0.21';

  if (buildFile && fs.existsSync(buildFile)) {
    const content = fs.readFileSync(buildFile, 'utf8');

    const compileSdkMatch = content.match(/compileSdk\s*=\s*(\d+)/);
    if (compileSdkMatch) compileSdk = parseInt(compileSdkMatch[1], 10);

    const minSdkMatch = content.match(/minSdk\s*=\s*(\d+)/);
    if (minSdkMatch) minSdk = parseInt(minSdkMatch[1], 10);

    const targetSdkMatch = content.match(/targetSdk\s*=\s*(\d+)/);
    if (targetSdkMatch) targetSdk = parseInt(targetSdkMatch[1], 10);

    const namespaceMatch = content.match(/namespace\s*=\s*["']([^"']+)["']/);
    if (namespaceMatch) namespace = namespaceMatch[1];

    const appIdMatch = content.match(/applicationId\s*=\s*["']([^"']+)["']/);
    if (appIdMatch) applicationId = appIdMatch[1];
    else if (namespaceMatch) applicationId = namespaceMatch[1];

    const bomMatch = content.match(/androidx\.compose:compose-bom:([0-9.]+)/);
    if (bomMatch) composeBomVersion = bomMatch[1];

    const roomMatch = content.match(/androidx\.room:room-[^:]*:([0-9.]+)/);
    if (roomMatch) roomVersion = roomMatch[1];

    const navMatch = content.match(/androidx\.navigation:navigation-compose:([0-9.]+)/);
    if (navMatch) navigationVersion = navMatch[1];

    const kotlinMatch = content.match(/id\(["']org\.jetbrains\.kotlin\.[^"']*["']\)\s*version\s*["']([^"']+)["']/);
    if (kotlinMatch) kotlinVersion = kotlinMatch[1];
  }

  // Also check root build.gradle.kts for kotlin plugin version if needed
  const rootBuildKts = path.join(resolvedRoot, 'build.gradle.kts');
  if (fs.existsSync(rootBuildKts)) {
    const content = fs.readFileSync(rootBuildKts, 'utf8');
    const rootKotlin = content.match(/id\(["']org\.jetbrains\.kotlin\.[^"']*["']\)\s*version\s*["']([^"']+)["']/);
    if (rootKotlin) kotlinVersion = rootKotlin[1];
  }

  // Extract gradleVersion from wrapper if present
  let gradleVersion = null;
  const wrapperProps = path.join(resolvedRoot, 'gradle/wrapper/gradle-wrapper.properties');
  if (fs.existsSync(wrapperProps)) {
    const props = fs.readFileSync(wrapperProps, 'utf8');
    const match = props.match(/gradle-([0-9.]+)-/);
    if (match) gradleVersion = match[1];
  }

  // Extract agpVersion from root/module build files or toml
  let agpVersion = null;
  for (const f of [rootBuildKts, buildFile].filter(Boolean)) {
    if (fs.existsSync(f)) {
      const c = fs.readFileSync(f, 'utf8');
      const agpMatch = c.match(/id\(["']com\.android\.(?:application|library)["']\)\s*version\s*["']([^"']+)["']/);
      if (agpMatch) {
        agpVersion = agpMatch[1];
        break;
      }
    }
  }

  return {
    type: 'gradle',
    projectRoot: resolvedRoot,
    targetModule: targetModuleName,
    modules,
    packageName: namespace,
    namespace,
    applicationId,
    compileSdk,
    minSdk,
    targetSdk,
    gradleVersion,
    agpVersion,
    kotlinVersion,
    composeBomVersion,
    roomVersion,
    navigationVersion
  };
}

module.exports = {
  parseGradleProject
};
