/**
 * src/baseline/environment.js
 * Verifies developer environment prerequisites: Node.js >= 18, JDK >= 17,
 * Gradle wrapper, and Android SDK with installed platform targets.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkCommand(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  } catch (err) {
    return null;
  }
}

function checkNode() {
  const version = process.version;
  const major = parseInt(version.replace('v', '').split('.')[0], 10);
  const pass = major >= 18;
  return {
    version,
    major,
    path: process.execPath,
    status: pass ? 'PASS' : 'FAIL',
    error: pass ? null : `Node.js >= 18.0.0 required, found ${version}`
  };
}

function checkJava() {
  const javaVerOutput = checkCommand('java -version 2>&1');
  if (!javaVerOutput) {
    return {
      status: 'FAIL',
      error: 'Java runtime (java) not found on PATH. JDK 17+ is required.'
    };
  }

  const match = javaVerOutput.match(/(?:version\s+"(\d+)(?:\.(\d+))?)/i);
  let major = 0;
  if (match) {
    major = parseInt(match[1], 10);
    if (major === 1 && match[2]) major = parseInt(match[2], 10);
  }

  const javaHome = process.env.JAVA_HOME || null;
  const pass = major >= 17;

  return {
    versionOutput: javaVerOutput.split('\n')[0],
    majorVersion: major,
    javaHome,
    status: pass ? 'PASS' : 'FAIL',
    error: pass ? null : `JDK 17+ required for AGP 8+, found Java major version ${major}`
  };
}

function checkGradle(projectPath) {
  const gradlewPath = path.resolve(projectPath, 'gradlew');
  const wrapperExists = fs.existsSync(gradlewPath);
  let isExecutable = false;

  if (wrapperExists) {
    try {
      fs.accessSync(gradlewPath, fs.constants.X_OK);
      isExecutable = true;
    } catch {
      isExecutable = false;
    }
  }

  const propsPath = path.resolve(projectPath, 'gradle/wrapper/gradle-wrapper.properties');
  let distributionUrl = null;
  let declaredVersion = null;
  if (fs.existsSync(propsPath)) {
    const content = fs.readFileSync(propsPath, 'utf8');
    const match = content.match(/distributionUrl=.*gradle-([0-9.]+)-(?:bin|all)\.zip/);
    if (match) {
      distributionUrl = match[0];
      declaredVersion = match[1];
    }
  }

  const pass = wrapperExists && (declaredVersion ? parseFloat(declaredVersion) >= 8.0 : true);

  return {
    wrapperPresent: wrapperExists,
    wrapperExecutable: isExecutable,
    wrapperPath: gradlewPath,
    declaredVersion,
    distributionUrl,
    status: pass ? 'PASS' : 'FAIL',
    error: !wrapperExists ? 'gradlew wrapper script missing in project root' : null
  };
}

function checkAndroidSdk(projectPath) {
  let sdkDir = null;
  const localPropsPath = path.resolve(projectPath, 'local.properties');
  if (fs.existsSync(localPropsPath)) {
    const lines = fs.readFileSync(localPropsPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('sdk.dir=')) {
        sdkDir = line.substring('sdk.dir='.length).trim();
        break;
      }
    }
  }

  if (!sdkDir) {
    sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || null;
  }

  if (!sdkDir) {
    const macFallback = path.join(process.env.HOME || '', 'Library/Android/sdk');
    if (fs.existsSync(macFallback)) {
      sdkDir = macFallback;
    }
  }

  if (!sdkDir || !fs.existsSync(sdkDir)) {
    return {
      status: 'FAIL',
      sdkPath: sdkDir,
      error: 'Android SDK directory could not be located via local.properties, ANDROID_HOME, or default paths.'
    };
  }

  const platformsDir = path.join(sdkDir, 'platforms');
  const installedPlatforms = fs.existsSync(platformsDir) ? fs.readdirSync(platformsDir) : [];
  const buildToolsDir = path.join(sdkDir, 'build-tools');
  const installedBuildTools = fs.existsSync(buildToolsDir) ? fs.readdirSync(buildToolsDir) : [];

  return {
    status: installedPlatforms.length > 0 ? 'PASS' : 'FAIL',
    sdkPath: sdkDir,
    installedPlatforms,
    installedBuildTools,
    error: installedPlatforms.length === 0 ? 'No Android SDK platforms found installed in sdk/platforms' : null
  };
}

function runEnvironmentCheck(projectPath = '.') {
  const node = checkNode();
  const java = checkJava();
  const gradle = checkGradle(projectPath);
  const androidSdk = checkAndroidSdk(projectPath);

  const failures = [];
  if (node.status !== 'PASS') failures.push(node.error);
  if (java.status !== 'PASS') failures.push(java.error);
  if (gradle.status !== 'PASS') failures.push(gradle.error);
  if (androidSdk.status !== 'PASS') failures.push(androidSdk.error);

  const status = failures.length === 0 ? 'PASS' : 'BLOCKED';

  return {
    status,
    timestamp: new Date().toISOString(),
    node,
    java,
    gradle,
    androidSdk,
    failures
  };
}

module.exports = {
  checkNode,
  checkJava,
  checkGradle,
  checkAndroidSdk,
  runEnvironmentCheck
};
