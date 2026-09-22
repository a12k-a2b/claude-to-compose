'use strict';

/**
 * src/config/workspace.js
 *
 * Workspace Layout & Configuration Manager for ctc v2 (Feature 20).
 * Manages the .ctc/ workspace directory hierarchy, dual config serialization
 * (.ctc/config.json and .ctc/project.toml), run receipts, and transient cleanup.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = Object.freeze({
  version: '2.0.0',
  profile: 'daylight-dc1',
  module: 'app',
  variant: 'debug',
  androidDir: '.',
  designSystem: 'daylight-sol-os-v1'
});

/**
 * Returns canonical paths for standard .ctc workspace layout.
 * @param {string} rootDir Base directory where .ctc lives
 * @returns {object} Canonical paths layout
 */
function getStandardLayout(rootDir = process.cwd()) {
  const ctcDir = path.resolve(rootDir, '.ctc');
  return {
    root: ctcDir,
    configFile: path.join(ctcDir, 'config.json'),
    projectToml: path.join(ctcDir, 'project.toml'),
    contractsDir: path.join(ctcDir, 'contracts'),
    baselinesDir: path.join(ctcDir, 'baselines'),
    evidenceDir: path.join(ctcDir, 'evidence'),
    packetsDir: path.join(ctcDir, 'packets'),
    reportsDir: path.join(ctcDir, 'reports'),
    appDir: path.join(ctcDir, 'app'),
    designsDir: path.join(ctcDir, 'designs'),
    profilesDir: path.join(ctcDir, 'profiles')
  };
}

/**
 * Ensures directory exists, creating all parent directories recursively.
 * @param {string} dirPath
 * @returns {string} Directory path
 */
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Lightweight TOML parser supporting basic key = "value" pairs, numbers, booleans, and sections.
 * Throws clean syntax error on malformed brackets or missing equals signs.
 * @param {string} tomlStr
 * @returns {object} Parsed configuration object
 */
function parseConfigString(tomlStr) {
  if (!tomlStr || typeof tomlStr !== 'string' || tomlStr.trim() === '') {
    return { ...DEFAULT_CONFIG };
  }

  const result = { ...DEFAULT_CONFIG };
  const lines = tomlStr.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) continue;

    // Detect unclosed arrays or malformed brackets (B20-T3)
    if (line.includes('[') && !line.includes(']')) {
      throw new Error(`TOML syntax error at line ${i + 1}: unclosed bracket in "${rawLine}"`);
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      continue; // Table section header
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      throw new Error(`TOML syntax error at line ${i + 1}: missing '=' in "${rawLine}"`);
    }

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val === 'true') {
      val = true;
    } else if (val === 'false') {
      val = false;
    } else if (!isNaN(Number(val)) && val !== '') {
      val = Number(val);
    }

    result[key] = val;
  }

  return result;
}

/**
 * Serialize config object to TOML format.
 * @param {object} config
 * @returns {string} Serialized TOML
 */
function serializeToml(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const lines = [
    '# Claude to Compose (ctc) Workspace Configuration',
    `version = "${merged.version}"`,
    `profile = "${merged.profile}"`,
    `module = "${merged.module}"`,
    `variant = "${merged.variant}"`,
    `androidDir = "${merged.androidDir}"`,
    `designSystem = "${merged.designSystem}"`
  ];
  return lines.join('\n') + '\n';
}

/**
 * Initializes the .ctc/ workspace directory hierarchy and configuration files.
 * @param {string} targetDir
 * @param {object} options
 * @returns {object} Workspace initialization result
 */
function initWorkspace(targetDir = process.cwd(), options = {}) {
  try {
    const layout = getStandardLayout(targetDir);

    // Create all standard directories recursively
    ensureDirExists(layout.root);
    ensureDirExists(layout.contractsDir);
    ensureDirExists(layout.baselinesDir);
    ensureDirExists(layout.evidenceDir);
    ensureDirExists(layout.packetsDir);
    ensureDirExists(layout.reportsDir);
    ensureDirExists(layout.appDir);
    ensureDirExists(layout.designsDir);
    ensureDirExists(layout.profilesDir);

    const mergedConfig = {
      ...DEFAULT_CONFIG,
      profile: options.profile || DEFAULT_CONFIG.profile,
      module: options.module || DEFAULT_CONFIG.module,
      variant: options.variant || DEFAULT_CONFIG.variant,
      androidDir: options.android || options.appDir || DEFAULT_CONFIG.androidDir
    };

    // Write .ctc/config.json
    fs.writeFileSync(layout.configFile, JSON.stringify(mergedConfig, null, 2), 'utf8');

    // Write .ctc/project.toml
    fs.writeFileSync(layout.projectToml, serializeToml(mergedConfig), 'utf8');

    // Copy bundled Daylight DC1 profile into .ctc/profiles/
    const dc1SourcePath = path.resolve(__dirname, '../profiles/daylight-dc1.json');
    if (fs.existsSync(dc1SourcePath)) {
      fs.copyFileSync(dc1SourcePath, path.join(layout.profilesDir, 'daylight-dc1.json'));
    }

    return {
      success: true,
      status: 'PASS',
      workspaceDir: layout.root,
      layout,
      config: mergedConfig
    };
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(`Permission denied: unable to create workspace in "${targetDir}"`);
    }
    throw err;
  }
}

/**
 * Reads workspace configuration from config.json or project.toml.
 * @param {string} rootDir
 * @returns {object}
 */
function readConfig(rootDir = process.cwd()) {
  const layout = getStandardLayout(rootDir);
  if (fs.existsSync(layout.configFile)) {
    try {
      return JSON.parse(fs.readFileSync(layout.configFile, 'utf8'));
    } catch (_) {}
  }
  if (fs.existsSync(layout.projectToml)) {
    try {
      return parseConfigString(fs.readFileSync(layout.projectToml, 'utf8'));
    } catch (_) {}
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Writes workspace configuration to both config.json and project.toml.
 * @param {string} rootDir
 * @param {object} config
 * @returns {object} Merged configuration
 */
function writeConfig(rootDir = process.cwd(), config = {}) {
  const layout = getStandardLayout(rootDir);
  ensureDirExists(layout.root);
  const merged = { ...readConfig(rootDir), ...config };
  fs.writeFileSync(layout.configFile, JSON.stringify(merged, null, 2), 'utf8');
  fs.writeFileSync(layout.projectToml, serializeToml(merged), 'utf8');
  return merged;
}

/**
 * Returns the path for a specific verification run receipt.
 * @param {string} rootDir
 * @param {string} screenId
 * @param {string} runId
 * @returns {string} Absolute path to run receipt directory
 */
function getRunPath(rootDir = process.cwd(), screenId = 'default', runId = 'latest') {
  return path.resolve(rootDir, '.ctc', 'designs', screenId, 'verification', 'runs', runId);
}

/**
 * Cleans transient run artifacts. If directory is empty or missing, succeeds without error.
 * @param {string} rootDir
 * @param {object} options
 * @returns {{ cleanedCount: number }}
 */
function cleanRuns(rootDir = process.cwd(), options = {}) {
  const layout = getStandardLayout(rootDir);
  if (!fs.existsSync(layout.designsDir)) {
    return { cleanedCount: 0 };
  }

  let cleaned = 0;
  try {
    const screens = fs.readdirSync(layout.designsDir);
    for (const screen of screens) {
      const runsDir = path.join(layout.designsDir, screen, 'verification', 'runs');
      if (fs.existsSync(runsDir)) {
        const runs = fs.readdirSync(runsDir);
        for (const run of runs) {
          const fullRun = path.join(runsDir, run);
          fs.rmSync(fullRun, { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  } catch (_) {}

  return { cleanedCount: cleaned };
}

/**
 * Alias for cleanRuns to clean temporary artifacts.
 * @param {string} rootDir
 * @returns {{ cleanedCount: number }}
 */
function cleanTemp(rootDir = process.cwd()) {
  return cleanRuns(rootDir);
}

module.exports = {
  DEFAULT_CONFIG,
  getStandardLayout,
  ensureDirExists,
  parseConfigString,
  serializeToml,
  initWorkspace,
  readConfig,
  writeConfig,
  getRunPath,
  cleanRuns,
  cleanTemp
};
