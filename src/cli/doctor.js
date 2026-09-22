'use strict';

/**
 * src/cli/doctor.js
 *
 * Environment, Toolchain, and Hardware Dependency Verifier for ctc v2.
 * Executes comprehensive pre-flight verification across:
 * - Node.js runtime version (>= 18)
 * - Playwright installation & Chromium browser availability
 * - Android SDK & adb availability
 * - Connected Daylight DC1 tablet detection ('rooted 3' / 'rooted 4', LivePaper LCD, zero EPD)
 * - Java JDK (>= 17) & Gradle / Gradle wrapper availability
 * - Sufficient disk space (>= 5.0 GB safe threshold)
 * - Git repository status & working tree hygiene
 * - Daylight design system font assets & native image libraries
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Standard ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

const c = {
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  green: (s) => `${colors.green}${s}${colors.reset}`,
  yellow: (s) => `${colors.yellow}${s}${colors.reset}`,
  red: (s) => `${colors.red}${s}${colors.reset}`,
  cyan: (s) => `${colors.cyan}${s}${colors.reset}`,
  gray: (s) => `${colors.gray}${s}${colors.reset}`,
  passBadge: () => `${colors.green}✓ PASS${colors.reset}`,
  warnBadge: () => `${colors.yellow}⚠ WARN${colors.reset}`,
  failBadge: () => `${colors.red}✗ FAIL${colors.reset}`
};

// Safe command executor with error swallowing
function safeExec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: options.timeout || 5000,
      ...options
    }).trim();
  } catch (_) {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Individual Check Implementations
// ----------------------------------------------------------------------------

function checkNodeRuntime() {
  const version = process.version;
  const major = parseInt(process.versions.node.split('.')[0], 10);
  const pass = major >= 18;
  return {
    id: 'node_runtime',
    name: 'Node.js Runtime',
    category: 'Core Runtime',
    required: true,
    status: pass ? 'PASS' : 'FAIL',
    value: version,
    expected: '>= 18.0.0',
    details: { version, major, path: process.execPath },
    remediation: pass ? null : 'Upgrade Node.js to >= 18 (recommended: Node 20 LTS). Run "brew install node" or use nvm.'
  };
}

function checkPlaywrightAndChromium() {
  let pwVersion = 'Not installed';
  let chromiumPath = null;
  let execExists = false;

  try {
    const pw = require('playwright');
    pwVersion = require('playwright/package.json').version || 'Installed';
    chromiumPath = pw.chromium.executablePath();
    execExists = fs.existsSync(chromiumPath);
  } catch (_) {
    execExists = false;
  }

  const pass = execExists;
  return {
    id: 'playwright_chromium',
    name: 'Playwright & Chromium Browser',
    category: 'Web Extraction',
    required: true,
    status: pass ? 'PASS' : 'FAIL',
    value: pass ? `Installed (Chromium ${path.basename(path.dirname(chromiumPath))})` : 'Missing browser binary',
    expected: 'Playwright >= 1.40 + Chromium binary',
    details: { playwrightVersion: pwVersion, chromiumPath, executableExists: execExists },
    remediation: pass ? null : 'Run "npx playwright install chromium" in the project directory.'
  };
}

function checkAndroidSdk() {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library/Android/sdk') : null);

  let adbPath = safeExec('which adb');
  if (!adbPath && androidHome) {
    const candidate = path.join(androidHome, 'platform-tools/adb');
    if (fs.existsSync(candidate)) adbPath = candidate;
  }

  let adbVersion = null;
  if (adbPath) {
    const out = safeExec(`${adbPath} version`);
    if (out) {
      const m = out.match(/Android Debug Bridge version ([0-9.]+)/);
      adbVersion = m ? m[1] : 'Found';
    }
  }

  const pass = !!(adbPath && adbVersion);
  return {
    id: 'android_sdk',
    name: 'Android SDK & adb',
    category: 'Android Toolchain',
    required: true,
    status: pass ? 'PASS' : 'FAIL',
    value: pass ? `adb ${adbVersion}` : 'Not found',
    expected: 'Android SDK platform-tools in PATH or ANDROID_HOME',
    details: { androidHome, adbPath, adbVersion },
    remediation: pass ? null : 'Install Android Command Line Tools / SDK and add platform-tools to PATH.'
  };
}

function checkDaylightDc1(options = {}) {
  const isRequired = !!options.requireDevice;
  const devices = [];

  const adbOut = safeExec('adb devices -l');
  if (adbOut) {
    const lines = adbOut.split('\n').filter(l => l.trim() && !l.startsWith('List of'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const serial = parts[0];
      const state = parts[1];
      if (/^JMBR[0-9]{5}$/.test(serial)) {
        const alias = serial === 'JMBR00380' ? 'rooted 3' : (serial === 'JMBR00405' ? 'rooted 4' : serial);
        let battery = null;
        const bOut = safeExec(`adb -s ${serial} shell dumpsys battery`);
        if (bOut) {
          const bm = bOut.match(/level:\s*(\d+)/);
          if (bm) battery = parseInt(bm[1], 10);
        }
        devices.push({
          serial,
          alias,
          state,
          batteryLevel: battery,
          model: 'DC_1',
          product: 'vext_jagar',
          display: 'LivePaper Reflective LCD (60-120Hz, Zero EPD)'
        });
      }
    }
  }

  let status = 'PASS';
  let value = 'No DC1 tablet detected';
  let remediation = null;

  if (devices.length > 0) {
    const lowBatt = devices.find(d => d.batteryLevel !== null && d.batteryLevel < 15);
    if (lowBatt) {
      status = 'WARN';
      value = `${devices.length} tablet(s) connected; ${lowBatt.alias} low battery (${lowBatt.batteryLevel}%)`;
      remediation = `Connect charger to ${lowBatt.alias} (${lowBatt.serial}).`;
    } else {
      status = 'PASS';
      value = devices.map(d => `${d.alias} (${d.serial}) [${d.batteryLevel || 100}%]`).join(', ');
    }
  } else {
    status = isRequired ? 'FAIL' : 'WARN';
    remediation = 'Connect Daylight DC1 tablet via USB with USB debugging enabled. LivePaper display will run without EPD workarounds.';
  }

  return {
    id: 'daylight_dc1',
    name: 'Daylight DC1 Tablet Connectivity',
    category: 'Hardware',
    required: isRequired,
    status,
    value,
    expected: 'Daylight DC1 tablet (JMBR00380 / JMBR00405) via adb',
    details: { devices, totalFound: devices.length },
    remediation
  };
}

function checkJavaAndGradle(targetAndroidDir = '.') {
  // 1. Check Java
  const javaOut = safeExec('java -version 2>&1');
  let javaVer = null;
  let javaMajor = 0;
  if (javaOut) {
    const m = javaOut.match(/(?:openjdk|java) version "([0-9._]+)"/);
    if (m) {
      javaVer = m[1];
      javaMajor = parseInt(javaVer.split('.')[0], 10);
    }
  }
  const javaPass = javaMajor >= 17;

  // 2. Check Gradle wrapper or system gradle
  const candidates = [
    path.join(targetAndroidDir, 'gradlew'),
    path.join(targetAndroidDir, 'android/gradlew'),
    path.join(targetAndroidDir, 'fixtures/note-app/gradlew'),
    './gradlew'
  ];
  let wrapperPath = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      wrapperPath = candidate;
      break;
    }
  }

  let gradleVer = null;
  let gradlePass = false;
  if (wrapperPath) {
    const gOut = safeExec(`${wrapperPath} --version`);
    if (gOut) {
      const gm = gOut.match(/Gradle\s+([0-9.]+)/);
      if (gm) gradleVer = gm[1];
      gradlePass = true;
    }
  } else {
    const sysOut = safeExec('gradle -v');
    if (sysOut) {
      const gm = sysOut.match(/Gradle\s+([0-9.]+)/);
      if (gm) gradleVer = gm[1];
      gradlePass = true;
    }
  }

  const pass = javaPass && gradlePass;
  const status = pass ? 'PASS' : (!javaPass ? 'FAIL' : 'WARN');
  let remediation = null;
  if (!javaPass) {
    remediation = 'JDK >= 17 required for Android Gradle Plugin 8.x. Install OpenJDK 17 (e.g. Eclipse Temurin 17).';
  } else if (!gradlePass) {
    remediation = 'No Gradle wrapper (gradlew) detected. Run "gradle wrapper" or point --android to a valid Android root.';
  }

  return {
    id: 'java_gradle',
    name: 'Java JDK & Gradle',
    category: 'Android Toolchain',
    required: true,
    status,
    value: `Java ${javaVer || 'missing'} (${javaPass ? 'PASS' : 'FAIL'}), Gradle ${gradleVer || 'missing wrapper'}`,
    expected: 'Java JDK >= 17 and Gradle wrapper (gradlew)',
    details: {
      javaVersion: javaVer,
      javaMajor,
      javaPass,
      gradleWrapper: wrapperPath,
      gradleVersion: gradleVer,
      gradlePass
    },
    remediation
  };
}

function checkDiskSpace(targetPath = '.') {
  let freeGb = 0;
  let totalGb = 0;

  try {
    const stat = fs.statfsSync(targetPath);
    freeGb = parseFloat(((stat.bavail * stat.bsize) / (1024 ** 3)).toFixed(1));
    totalGb = parseFloat(((stat.blocks * stat.bsize) / (1024 ** 3)).toFixed(1));
  } catch (_) {
    // Fallback: df -k
    const df = safeExec(`df -k "${targetPath}"`);
    if (df) {
      const lines = df.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const availK = parseInt(parts[3], 10);
          freeGb = parseFloat((availK / (1024 * 1024)).toFixed(1));
        }
      }
    }
  }

  let status = 'PASS';
  let remediation = null;
  if (freeGb < 2.0) {
    status = 'FAIL';
    remediation = `Critically low disk space (${freeGb} GB free). Minimum 5.0 GB required for Android Gradle builds.`;
  } else if (freeGb < 5.0) {
    status = 'WARN';
    remediation = `Low disk space (${freeGb} GB free). Recommend freeing space to prevent Gradle daemon out-of-space errors.`;
  }

  return {
    id: 'disk_space',
    name: 'Available Disk Space',
    category: 'Core Runtime',
    required: true,
    status,
    value: `${freeGb} GB free (Total: ${totalGb} GB)`,
    expected: '>= 5.0 GB free',
    details: { freeGb, totalGb },
    remediation
  };
}

function checkGitRepository() {
  const isRepo = safeExec('git rev-parse --is-inside-work-tree') === 'true';
  let branch = null;
  let commitSha = null;
  let isClean = true;

  if (isRepo) {
    branch = safeExec('git branch --show-current') || 'HEAD detached';
    commitSha = safeExec('git rev-parse HEAD');
    const statusOut = safeExec('git status --porcelain');
    isClean = !statusOut || statusOut.trim().length === 0;
  }

  const pass = isRepo;
  return {
    id: 'git_repository',
    name: 'Git Repository Status',
    category: 'Core Runtime',
    required: true,
    status: pass ? 'PASS' : 'WARN',
    value: isRepo ? `Branch: ${branch} (${commitSha ? commitSha.slice(0, 8) : 'initial'}, ${isClean ? 'clean' : 'dirty'})` : 'Not a git repository',
    expected: 'Valid Git repository for baseline and change tracking',
    details: { isRepo, branch, commitSha, isClean },
    remediation: isRepo ? null : 'Run "git init" to enable baseline invariant snapshots and rollback.'
  };
}

function checkSolOsFonts(targetAndroidDir = '.') {
  const commonFontDirs = [
    path.join(targetAndroidDir, 'android/app/src/main/res/font'),
    path.join(targetAndroidDir, 'app/src/main/res/font'),
    path.join(targetAndroidDir, 'fixtures/note-app/app/src/main/res/font')
  ];

  let fontDirFound = null;
  let fontsFound = [];
  for (const dir of commonFontDirs) {
    if (fs.existsSync(dir)) {
      fontDirFound = dir;
      fontsFound = fs.readdirSync(dir).filter(f => f.endsWith('.ttf') || f.endsWith('.otf'));
      break;
    }
  }

  const hasArizona = fontsFound.some(f => /arizona/i.test(f));
  const status = hasArizona ? 'PASS' : 'WARN';
  return {
    id: 'sol_os_fonts',
    name: 'Daylight Sol:OS Font Assets',
    category: 'Design System',
    required: false,
    status,
    value: fontDirFound ? `${fontsFound.length} font(s) in ${path.relative('.', fontDirFound)}` : 'Font directory not found',
    expected: 'ABC Arizona Flare & Sans TTF assets in res/font/',
    details: { fontDir: fontDirFound, fonts: fontsFound },
    remediation: hasArizona ? null : 'Ensure ABC Arizona Flare & Sans font files are bundled into res/font/ for pixel-accurate typographic parity.'
  };
}

function checkNativeModules() {
  let sharpOk = false;
  try {
    require('sharp');
    sharpOk = true;
  } catch (_) {}

  return {
    id: 'native_modules',
    name: 'Native Image Processing (sharp)',
    category: 'Core Runtime',
    required: true,
    status: sharpOk ? 'PASS' : 'FAIL',
    value: sharpOk ? 'sharp loaded successfully' : 'Failed to load sharp',
    expected: 'sharp native module compiled for current OS/arch',
    details: { sharpOk, arch: process.arch, platform: process.platform },
    remediation: sharpOk ? null : 'Run "npm rebuild sharp" or "npm install sharp".'
  };
}

// ----------------------------------------------------------------------------
// Formatting & Aggregation
// ----------------------------------------------------------------------------

function formatTerminalReport(result) {
  const lines = [];
  lines.push('');
  lines.push(c.bold('=============================================================================='));
  lines.push(c.bold('  Claude to Compose (ctc) v2: Environment & Toolchain Doctor'));
  lines.push(c.bold('=============================================================================='));
  lines.push(c.gray(`  OS: ${os.platform()} ${os.arch()} (${os.release()}) | Node: ${process.version}`));
  lines.push('');

  const checksByCategory = {};
  for (const check of result.data.doctor.checks) {
    checksByCategory[check.category] = checksByCategory[check.category] || [];
    checksByCategory[check.category].push(check);
  }

  for (const [category, checks] of Object.entries(checksByCategory)) {
    lines.push(c.bold(`[ ${category} ]`));
    for (const ch of checks) {
      let badge = c.passBadge();
      if (ch.status === 'WARN') badge = c.warnBadge();
      if (ch.status === 'FAIL') badge = c.failBadge();

      lines.push(`  ${badge} ${c.bold(ch.name)}: ${ch.value}`);
      if (ch.status !== 'PASS' && ch.remediation) {
        lines.push(`         ${c.yellow('Remediation:')} ${ch.remediation}`);
      }
    }
    lines.push('');
  }

  const { total, passed, warnings, failed } = result.data.doctor.summary;
  lines.push(c.bold('------------------------------------------------------------------------------'));
  lines.push(`  Summary: ${c.green(`${passed} passed`)}, ${warnings > 0 ? c.yellow(`${warnings} warnings`) : '0 warnings'}, ${failed > 0 ? c.red(`${failed} failed`) : '0 failed'} (${total} total)`);
  lines.push(c.bold('------------------------------------------------------------------------------'));

  if (result.status === 'PASS') {
    lines.push(c.green(c.bold('  ✓ Environment is fully ready for ctc retrofit compilation and verification.')));
  } else {
    lines.push(c.red(c.bold('  ✗ One or more required environment checks failed. Review remediation steps.')));
  }
  lines.push(c.bold('==============================================================================\n'));

  return lines.join('\n');
}

function runDoctor(options = {}) {
  const targetAndroidDir = options.android || options.appDir || '.';
  const checks = [
    checkNodeRuntime(),
    checkPlaywrightAndChromium(),
    checkAndroidSdk(),
    checkDaylightDc1(options),
    checkJavaAndGradle(targetAndroidDir),
    checkDiskSpace(targetAndroidDir),
    checkGitRepository(),
    checkSolOsFonts(targetAndroidDir),
    checkNativeModules()
  ];

  let passed = 0;
  let warnings = 0;
  let failed = 0;

  for (const ch of checks) {
    if (ch.status === 'PASS') passed++;
    else if (ch.status === 'WARN') warnings++;
    else if (ch.status === 'FAIL') failed++;
  }

  let overallStatus = 'PASS';
  let exitCode = 0;

  if (failed > 0) {
    overallStatus = 'FAIL';
    exitCode = 1;
  } else if (options.strict && warnings > 0) {
    overallStatus = 'FAIL';
    exitCode = 1;
  }

  const result = {
    success: overallStatus === 'PASS',
    status: overallStatus,
    command: 'doctor',
    timestamp: new Date().toISOString(),
    data: {
      doctor: {
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        os: {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release()
        },
        summary: {
          total: checks.length,
          passed,
          warnings,
          failed
        },
        checks
      }
    },
    defects: [],
    exitCode,
    humanOutput: null
  };

  result.humanOutput = formatTerminalReport(result);
  return result;
}

module.exports = {
  runDoctor,
  formatTerminalReport,
  checks: {
    checkNodeRuntime,
    checkPlaywrightAndChromium,
    checkAndroidSdk,
    checkDaylightDc1,
    checkJavaAndGradle,
    checkDiskSpace,
    checkGitRepository,
    checkSolOsFonts,
    checkNativeModules
  }
};
