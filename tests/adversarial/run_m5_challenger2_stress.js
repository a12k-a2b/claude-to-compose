#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * Adversarial Stress Test Suite: Workspace, Profile, and Doctor Subsystems
 * Milestone 5 Challenger 2 (Hardware Profile, Workspace Config & Doctor Stress)
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Subsystems under test
const { validateProfileAgainstRules, FORBIDDEN_EPD_PATTERNS } = require(path.join(PROJECT_ROOT, 'src/profiles/validator'));
const profileManager = require(path.join(PROJECT_ROOT, 'src/profiles/manager'));
const workspace = require(path.join(PROJECT_ROOT, 'src/config/workspace'));
const doctor = require(path.join(PROJECT_ROOT, 'src/cli/doctor'));
const dispatcher = require(path.join(PROJECT_ROOT, 'src/cli/dispatcher'));

const results = [];

function recordTest(id, name, category, passed, details = {}) {
  results.push({ id, name, category, passed, details });
  const statusBadge = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${statusBadge} [${id}] ${name}`);
  if (!passed) {
    console.log(`       \x1b[33mReason: ${details.reason || 'Test assertion failed'}\x1b[0m`);
    if (details.error) console.log(`       Error: ${details.error}`);
    if (details.expected !== undefined) console.log(`       Expected: ${JSON.stringify(details.expected)}`);
    if (details.actual !== undefined) console.log(`       Actual:   ${JSON.stringify(details.actual)}`);
  }
}

async function runSuite() {
  console.log('='.repeat(80));
  console.log('CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS TEST SUITE (M5 WORKSPACE, PROFILE, DOCTOR)');
  console.log('='.repeat(80));

  // ==========================================================================
  // SECTION 1: Profile Validator Stress & Hardware Invariants
  // ==========================================================================
  console.log('\n--- Section 1: Profile Validator Stress & Hardware Invariants ---');

  const dc1Canonical = profileManager.loadProfile('daylight-dc1');

  // 1.1 Non-object inputs
  try {
    const r1 = validateProfileAgainstRules(null);
    const r2 = validateProfileAgainstRules(undefined);
    const r3 = validateProfileAgainstRules("string");
    const r4 = validateProfileAgainstRules(12345);
    const pass = !r1.valid && !r2.valid && !r3.valid && !r4.valid;
    recordTest('ADV-PROF-01', 'Rejects non-object profiles (null, undefined, string, number)', 'ProfileValidator', pass, {
      actual: { r1: r1.valid, r2: r2.valid, r3: r3.valid, r4: r4.valid }
    });
  } catch (err) {
    recordTest('ADV-PROF-01', 'Rejects non-object profiles (null, undefined, string, number)', 'ProfileValidator', false, { error: err.message });
  }

  // 1.2 Missing display or touch block
  try {
    const noDisplay = { ...dc1Canonical, display: undefined };
    const rDisplay = validateProfileAgainstRules(noDisplay);
    const noTouch = { ...dc1Canonical, touch: undefined };
    const rTouch = validateProfileAgainstRules(noTouch);
    const pass = !rDisplay.valid && !rTouch.valid &&
                 rDisplay.issues.some(i => /display/i.test(i)) &&
                 rTouch.issues.some(i => /touch/i.test(i));
    recordTest('ADV-PROF-02', 'Rejects profiles missing display or touch blocks with descriptive error', 'ProfileValidator', pass, {
      actual: { rDisplayValid: rDisplay.valid, rTouchValid: rTouch.valid }
    });
  } catch (err) {
    recordTest('ADV-PROF-02', 'Rejects profiles missing display or touch blocks', 'ProfileValidator', false, { error: err.message });
  }

  // 1.3 Invalid display technology (e.g. E-Ink Carta 1200, OLED)
  try {
    const einkProfile = JSON.parse(JSON.stringify(dc1Canonical));
    einkProfile.display.technology = 'Electronic Paper Display (EPD) / E-Ink Carta 1200';
    const rEink = validateProfileAgainstRules(einkProfile);
    const pass = !rEink.valid && rEink.issues.some(i => /technology/i.test(i));
    recordTest('ADV-PROF-03', 'Rejects non-LivePaper display technologies (e.g. E-Ink Carta)', 'ProfileValidator', pass, {
      actual: { valid: rEink.valid, issues: rEink.issues }
    });
  } catch (err) {
    recordTest('ADV-PROF-03', 'Rejects non-LivePaper display technologies', 'ProfileValidator', false, { error: err.message });
  }

  // 1.4 Invalid logical dimensions (negative, swapped, zero, desktop)
  try {
    const malformedDims = [
      { width: -1184, height: 1584, desc: 'negative width' },
      { width: 1184, height: -1584, desc: 'negative height' },
      { width: 1584, height: 1184, desc: 'swapped landscape dimension in logicalWidth/Height' },
      { width: 0, height: 0, desc: 'zero dimensions' },
      { width: 1920, height: 1080, desc: 'desktop 1080p dimensions' }
    ];

    let allRejected = true;
    const failures = [];
    for (const d of malformedDims) {
      const p = JSON.parse(JSON.stringify(dc1Canonical));
      p.display.logicalWidth = d.width;
      p.display.logicalHeight = d.height;
      const res = validateProfileAgainstRules(p);
      if (res.valid) {
        allRejected = false;
        failures.push(d.desc);
      }
    }
    recordTest('ADV-PROF-04', 'Rejects invalid logical dimensions (negative, swapped, zero, desktop)', 'ProfileValidator', allRejected, {
      failures,
      reason: failures.length > 0 ? `Accepted invalid dimensions: ${failures.join(', ')}` : null
    });
  } catch (err) {
    recordTest('ADV-PROF-04', 'Rejects invalid logical dimensions', 'ProfileValidator', false, { error: err.message });
  }

  // 1.5 Physical dimensions: negative dimensions or missing physical width/height
  try {
    const negPhysical = JSON.parse(JSON.stringify(dc1Canonical));
    negPhysical.display.physicalWidth = -1200;
    negPhysical.display.physicalHeight = -1600;
    const resNeg = validateProfileAgainstRules(negPhysical);

    const missingPhysical = JSON.parse(JSON.stringify(dc1Canonical));
    delete missingPhysical.display.physicalWidth;
    delete missingPhysical.display.physicalHeight;
    const resMissing = validateProfileAgainstRules(missingPhysical);

    const pass = !resNeg.valid && !resMissing.valid;
    recordTest('ADV-PROF-05', 'Rejects negative or missing physical dimensions in display specification', 'ProfileValidator', pass, {
      actual: { negPhysicalValid: resNeg.valid, missingPhysicalValid: resMissing.valid },
      reason: resNeg.valid || resMissing.valid ? 'Validator does not inspect physicalWidth/physicalHeight' : null
    });
  } catch (err) {
    recordTest('ADV-PROF-05', 'Rejects negative or missing physical dimensions', 'ProfileValidator', false, { error: err.message });
  }

  // 1.6 Color depth validation: 1-bit or 24-bit depth, non-8-bit gray levels
  try {
    const bit1 = JSON.parse(JSON.stringify(dc1Canonical));
    bit1.display.colorDepthBits = 1;
    bit1.display.colorLevels = 2;
    const res1 = validateProfileAgainstRules(bit1);

    const bit24 = JSON.parse(JSON.stringify(dc1Canonical));
    bit24.display.colorDepthBits = 24;
    bit24.display.colorLevels = 16777216;
    const res24 = validateProfileAgainstRules(bit24);

    const pass = !res1.valid && !res24.valid;
    recordTest('ADV-PROF-06', 'Rejects 1-bit monochrome or 24-bit RGB depth (must be strictly 8-bit grayscale)', 'ProfileValidator', pass, {
      actual: { bit1Valid: res1.valid, bit24Valid: res24.valid },
      reason: res1.valid || res24.valid ? 'Validator does not enforce colorDepthBits === 8' : null
    });
  } catch (err) {
    recordTest('ADV-PROF-06', 'Rejects 1-bit or 24-bit color depth', 'ProfileValidator', false, { error: err.message });
  }

  // 1.7 Prohibited EPD waveforms: waveformType: "GC16", epdClearWaveform: true, allowScreenFlashHooks: true
  try {
    const epdWaveform = JSON.parse(JSON.stringify(dc1Canonical));
    epdWaveform.display.waveformType = 'GC16';
    epdWaveform.display.epdClearWaveform = true;
    epdWaveform.display.allowScreenFlashHooks = true;
    const resWaveform = validateProfileAgainstRules(epdWaveform);

    const pass = !resWaveform.valid;
    recordTest('ADV-PROF-07', 'Rejects prohibited EPD waveform properties (waveformType: "GC16", epdClearWaveform: true)', 'ProfileValidator', pass, {
      actual: { valid: resWaveform.valid, issues: resWaveform.issues },
      reason: resWaveform.valid ? 'Validator allowed waveformType: "GC16" and epdClearWaveform: true' : null
    });
  } catch (err) {
    recordTest('ADV-PROF-07', 'Rejects prohibited EPD waveforms', 'ProfileValidator', false, { error: err.message });
  }

  // 1.8 Prohibited EPD Intent & Action Hooks (ACTION_REFRESH_SCREEN, particle_refresh, modal_dismiss_pause)
  try {
    const hookInjected = JSON.parse(JSON.stringify(dc1Canonical));
    hookInjected.display.refreshAction = 'android.intent.action.ACTION_REFRESH_SCREEN';
    hookInjected.display.particle_refresh = true;
    hookInjected.display.modal_dismiss_pause = 500;
    const resHook = validateProfileAgainstRules(hookInjected);

    const pass = !resHook.valid;
    recordTest('ADV-PROF-08', 'Rejects profiles containing forbidden EPD pattern strings from FORBIDDEN_EPD_PATTERNS', 'ProfileValidator', pass, {
      actual: { valid: resHook.valid, issues: resHook.issues },
      reason: resHook.valid ? 'Validator did not cross-reference FORBIDDEN_EPD_PATTERNS against profile keys/values' : null
    });
  } catch (err) {
    recordTest('ADV-PROF-08', 'Rejects forbidden EPD pattern strings', 'ProfileValidator', false, { error: err.message });
  }

  // 1.9 Hardware inset validation: non-8px inset or asymmetric inset
  try {
    const badInset = JSON.parse(JSON.stringify(dc1Canonical));
    badInset.display.hardwareInsetPx = { left: 0, top: 16 };
    const resInset = validateProfileAgainstRules(badInset);
    const pass = !resInset.valid && resInset.issues.some(i => /hardware inset/i.test(i));
    recordTest('ADV-PROF-09', 'Rejects asymmetric or non-8px hardware coordinate insets', 'ProfileValidator', pass, {
      actual: { valid: resInset.valid, issues: resInset.issues }
    });
  } catch (err) {
    recordTest('ADV-PROF-09', 'Rejects non-8px hardware coordinate insets', 'ProfileValidator', false, { error: err.message });
  }

  // 1.10 Settle time standard: settleMsStandard < 150ms
  try {
    const fastSettle = JSON.parse(JSON.stringify(dc1Canonical));
    fastSettle.display.settleMsStandard = 50;
    const resSettle = validateProfileAgainstRules(fastSettle);
    const pass = !resSettle.valid && resSettle.issues.some(i => /settle time/i.test(i));
    recordTest('ADV-PROF-10', 'Rejects settling duration under minimum fluid LivePaper threshold (< 150ms)', 'ProfileValidator', pass, {
      actual: { valid: resSettle.valid, issues: resSettle.issues }
    });
  } catch (err) {
    recordTest('ADV-PROF-10', 'Rejects settling duration under 150ms', 'ProfileValidator', false, { error: err.message });
  }

  // 1.11 Touch target validation: width < 48dp or height < 48dp
  try {
    const smallTouch = JSON.parse(JSON.stringify(dc1Canonical));
    smallTouch.touch.minTouchTargetDp = { width: 32, height: 32 };
    const resTouch = validateProfileAgainstRules(smallTouch);
    const pass = !resTouch.valid && resTouch.issues.some(i => /touch target/i.test(i));
    recordTest('ADV-PROF-11', 'Rejects minimum touch target smaller than 48x48dp standard', 'ProfileValidator', pass, {
      actual: { valid: resTouch.valid, issues: resTouch.issues }
    });
  } catch (err) {
    recordTest('ADV-PROF-11', 'Rejects touch target smaller than 48x48dp', 'ProfileValidator', false, { error: err.message });
  }

  // 1.12 Missing serialPattern in hardware or invalid orientations
  try {
    const badHardware = JSON.parse(JSON.stringify(dc1Canonical));
    delete badHardware.hardware.serialPattern;
    const resHw = validateProfileAgainstRules(badHardware);

    const badOri = JSON.parse(JSON.stringify(dc1Canonical));
    badOri.viewports = { allowedOrientations: ['portrait', 'diagonal_invalid'] };
    const resOri = validateProfileAgainstRules(badOri);

    const pass = !resHw.valid && !resOri.valid;
    recordTest('ADV-PROF-12', 'Rejects missing serialPattern and invalid viewport orientations', 'ProfileValidator', pass, {
      actual: { hwValid: resHw.valid, oriValid: resOri.valid }
    });
  } catch (err) {
    recordTest('ADV-PROF-12', 'Rejects missing serialPattern or invalid orientation', 'ProfileValidator', false, { error: err.message });
  }


  // ==========================================================================
  // SECTION 2: Profile Manager Stress & Export Integrity
  // ==========================================================================
  console.log('\n--- Section 2: Profile Manager Stress & Export Integrity ---');

  // 2.1 loadProfile loads intact canonical DC1 profile
  try {
    const p = profileManager.loadProfile('daylight-dc1');
    const pass = p.id === 'daylight-dc1' &&
                 p.display.technology === 'Transflective / Reflective LCD (LivePaper)' &&
                 p.display.logicalWidth === 1184 &&
                 p.display.logicalHeight === 1584;
    recordTest('ADV-MGR-01', 'loadProfile loads intact canonical DC1 profile with verified parameters', 'ProfileManager', pass, {
      actual: { id: p.id, tech: p.display.technology, dims: `${p.display.logicalWidth}x${p.display.logicalHeight}` }
    });
  } catch (err) {
    recordTest('ADV-MGR-01', 'loadProfile loads canonical DC1 profile', 'ProfileManager', false, { error: err.message });
  }

  // 2.2 loadProfile throws on nonexistent profile
  try {
    let threw = false;
    try {
      profileManager.loadProfile('non-existent-device-profile-999');
    } catch (e) {
      threw = /Profile not found/i.test(e.message);
    }
    recordTest('ADV-MGR-02', 'loadProfile throws descriptive Error on nonexistent profile ID', 'ProfileManager', threw);
  } catch (err) {
    recordTest('ADV-MGR-02', 'loadProfile throws on nonexistent profile', 'ProfileManager', false, { error: err.message });
  }

  // 2.3 loadProfile throws TypeError on invalid argument types
  try {
    let typeThrows = 0;
    const invalidTypes = [123, true, {}, [], ''];
    for (const val of invalidTypes) {
      try {
        profileManager.loadProfile(val);
      } catch (e) {
        if (e instanceof TypeError) typeThrows++;
      }
    }
    const pass = typeThrows === invalidTypes.length;
    recordTest('ADV-MGR-03', 'loadProfile enforces string type, throwing TypeError on invalid arguments', 'ProfileManager', pass, {
      expected: invalidTypes.length,
      actual: typeThrows
    });
  } catch (err) {
    recordTest('ADV-MGR-03', 'loadProfile enforces string type', 'ProfileManager', false, { error: err.message });
  }

  // 2.4 listProfiles returns array with metadata
  try {
    const list = profileManager.listProfiles();
    const pass = Array.isArray(list) && list.length > 0 &&
                 list.some(p => p.id === 'daylight-dc1' && p.dimensions === '1184x1584' && p.builtIn === true);
    recordTest('ADV-MGR-04', 'listProfiles returns array of profile summaries with dimensions and refresh rates', 'ProfileManager', pass, {
      actual: list
    });
  } catch (err) {
    recordTest('ADV-MGR-04', 'listProfiles returns array of profiles', 'ProfileManager', false, { error: err.message });
  }

  // 2.5 exportProfile produces identical JSON output to canonical profile
  const tmpExportFile = path.join(os.tmpdir(), `ctc_export_test_${Date.now()}.json`);
  try {
    const exportReceipt = profileManager.exportProfile('daylight-dc1', tmpExportFile);
    const writtenContent = fs.readFileSync(tmpExportFile, 'utf8');
    const parsed = JSON.parse(writtenContent);
    const pass = exportReceipt.success === true &&
                 exportReceipt.profileId === 'daylight-dc1' &&
                 JSON.stringify(parsed) === JSON.stringify(dc1Canonical);
    recordTest('ADV-MGR-05', 'exportProfile produces identical JSON output matching loaded profile exactly', 'ProfileManager', pass, {
      receipt: exportReceipt,
      identical: JSON.stringify(parsed) === JSON.stringify(dc1Canonical)
    });
  } catch (err) {
    recordTest('ADV-MGR-05', 'exportProfile roundtrip verification', 'ProfileManager', false, { error: err.message });
  }

  // 2.6 exportProfile fails if destination file exists without --force
  try {
    let threw = false;
    try {
      profileManager.exportProfile('daylight-dc1', tmpExportFile, { force: false });
    } catch (e) {
      threw = /already exists/i.test(e.message);
    }
    recordTest('ADV-MGR-06', 'exportProfile refuses to overwrite existing file without --force flag', 'ProfileManager', threw);
  } catch (err) {
    recordTest('ADV-MGR-06', 'exportProfile overwrite protection', 'ProfileManager', false, { error: err.message });
  }

  // 2.7 exportProfile succeeds with --force flag
  try {
    const resForce = profileManager.exportProfile('daylight-dc1', tmpExportFile, { force: true });
    recordTest('ADV-MGR-07', 'exportProfile successfully overwrites existing file when force: true is specified', 'ProfileManager', resForce.success === true);
  } catch (err) {
    recordTest('ADV-MGR-07', 'exportProfile force overwrite', 'ProfileManager', false, { error: err.message });
  } finally {
    if (fs.existsSync(tmpExportFile)) fs.unlinkSync(tmpExportFile);
  }

  // 2.8 exportProfile handles directory path as destination cleanly
  try {
    let caught = false;
    try {
      profileManager.exportProfile('daylight-dc1', os.tmpdir(), { force: true });
    } catch (e) {
      caught = e.code === 'EISDIR' || /illegal operation|directory/i.test(e.message);
    }
    recordTest('ADV-MGR-08', 'exportProfile handles directory path as target throwing EISDIR or descriptive error', 'ProfileManager', caught);
  } catch (err) {
    recordTest('ADV-MGR-08', 'exportProfile directory target error handling', 'ProfileManager', false, { error: err.message });
  }


  // ==========================================================================
  // SECTION 3: Workspace Manager Stress & TOML Edge Cases
  // ==========================================================================
  console.log('\n--- Section 3: Workspace Manager Stress & TOML Edge Cases ---');

  // 3.1 parseConfigString with empty string or whitespace returns default config
  try {
    const emptyConf = workspace.parseConfigString('');
    const wsConf = workspace.parseConfigString('   \n\t  \n  ');
    const nullConf = workspace.parseConfigString(null);
    const pass = emptyConf.profile === 'daylight-dc1' &&
                 wsConf.profile === 'daylight-dc1' &&
                 nullConf.profile === 'daylight-dc1' &&
                 emptyConf.module === 'app';
    recordTest('ADV-WS-01', 'parseConfigString returns default configuration on empty or whitespace strings', 'WorkspaceManager', pass, {
      actual: { empty: emptyConf.profile, ws: wsConf.profile, nullC: nullConf.profile }
    });
  } catch (err) {
    recordTest('ADV-WS-01', 'parseConfigString empty string fallback', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.2 parseConfigString correctly parses typed values (string, boolean, number)
  try {
    const tomlInput = [
      'version = "3.1.0"',
      'profile = "daylight-dc1"',
      'enabled = true',
      'disabled = false',
      'timeout = 4500'
    ].join('\n');
    const parsed = workspace.parseConfigString(tomlInput);
    const pass = parsed.version === '3.1.0' &&
                 parsed.profile === 'daylight-dc1' &&
                 parsed.enabled === true &&
                 parsed.disabled === false &&
                 parsed.timeout === 4500;
    recordTest('ADV-WS-02', 'parseConfigString converts strings, booleans, and numbers to native types', 'WorkspaceManager', pass, {
      actual: parsed
    });
  } catch (err) {
    recordTest('ADV-WS-02', 'parseConfigString type parsing', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.3 Malformed TOML: unclosed brackets or missing equals sign throws line-numbered syntax error
  try {
    let unclosedThrew = false;
    try {
      workspace.parseConfigString('line1 = "ok"\nline2 = [\nline3 = "ok"');
    } catch (e) {
      unclosedThrew = /line 2.*unclosed bracket/i.test(e.message);
    }

    let missingEqThrew = false;
    try {
      workspace.parseConfigString('valid = true\nthis line is broken without equals\nother = 1');
    } catch (e) {
      missingEqThrew = /line 2.*missing '='/i.test(e.message);
    }

    recordTest('ADV-WS-03', 'parseConfigString throws precise syntax error with line number on malformed TOML', 'WorkspaceManager', unclosedThrew && missingEqThrew, {
      actual: { unclosedThrew, missingEqThrew }
    });
  } catch (err) {
    recordTest('ADV-WS-03', 'parseConfigString malformed syntax error', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.4 Comments and nested sections in TOML
  try {
    const commentedToml = [
      '# Top-level comment',
      '[general]',
      'version = "2.0.0"',
      '# Intermediate comment',
      '[nested.section]',
      'profile = "daylight-dc1"'
    ].join('\n');
    const parsed = workspace.parseConfigString(commentedToml);
    const pass = parsed.version === '2.0.0' && parsed.profile === 'daylight-dc1';
    recordTest('ADV-WS-04', 'parseConfigString skips comments and table headers gracefully', 'WorkspaceManager', pass, {
      actual: parsed
    });
  } catch (err) {
    recordTest('ADV-WS-04', 'parseConfigString comments and sections', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.5 Multiline strings and inline comments behavior
  try {
    let multilineHandled = false;
    try {
      workspace.parseConfigString('desc = """\nmultiline content\n"""');
      multilineHandled = true;
    } catch (e) {
      // Documenting behavior: simple line-by-line TOML parser throws on continuation line without '='
      multilineHandled = /missing '='/i.test(e.message);
    }

    const inlineCommentParsed = workspace.parseConfigString('key = "value" # this is a comment');
    // In current line-by-line parser, inline comment is part of the string or preserved
    const pass = multilineHandled && inlineCommentParsed.key !== undefined;
    recordTest('ADV-WS-05', 'parseConfigString handles multiline strings and inline comments predictably', 'WorkspaceManager', pass, {
      multilineHandled,
      inlineCommentKey: inlineCommentParsed.key
    });
  } catch (err) {
    recordTest('ADV-WS-05', 'parseConfigString multiline and inline comments', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.6 initWorkspace creates complete .ctc directory tree on deeply nested path
  const deepWsRoot = path.join(os.tmpdir(), `ctc_deep_ws_${Date.now()}`, 'level1', 'level2', 'workspace');
  try {
    const initRes = workspace.initWorkspace(deepWsRoot, { module: 'my-app', variant: 'release' });
    const layout = workspace.getStandardLayout(deepWsRoot);

    const expectedDirs = [
      layout.root,
      layout.contractsDir,
      layout.baselinesDir,
      layout.evidenceDir,
      layout.packetsDir,
      layout.reportsDir,
      layout.appDir,
      layout.designsDir,
      layout.profilesDir
    ];
    const allDirsExist = expectedDirs.every(d => fs.existsSync(d) && fs.statSync(d).isDirectory());

    const expectedFiles = [
      layout.configFile,
      layout.projectToml,
      path.join(layout.profilesDir, 'daylight-dc1.json')
    ];
    const allFilesExist = expectedFiles.every(f => fs.existsSync(f) && fs.statSync(f).isFile());

    const pass = initRes.success === true && allDirsExist && allFilesExist &&
                 initRes.config.module === 'my-app' && initRes.config.variant === 'release';
    recordTest('ADV-WS-06', 'initWorkspace recursively creates complete 9-directory tree, configs, and DC1 profile', 'WorkspaceManager', pass, {
      allDirsExist,
      allFilesExist,
      config: initRes.config
    });
  } catch (err) {
    recordTest('ADV-WS-06', 'initWorkspace deep directory hierarchy', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.7 initWorkspace idempotency on existing directories
  try {
    const secondInit = workspace.initWorkspace(deepWsRoot, { module: 'updated-app' });
    const configAfter = workspace.readConfig(deepWsRoot);
    const pass = secondInit.success === true && configAfter.module === 'updated-app';
    recordTest('ADV-WS-07', 'initWorkspace runs idempotently on existing directory updating configuration safely', 'WorkspaceManager', pass, {
      moduleAfter: configAfter.module
    });
  } catch (err) {
    recordTest('ADV-WS-07', 'initWorkspace idempotency', 'WorkspaceManager', false, { error: err.message });
  }

  // 3.8 initWorkspace under restricted permissions throws descriptive error
  const restrictedDir = path.join(os.tmpdir(), `ctc_ro_${Date.now()}`);
  try {
    fs.mkdirSync(restrictedDir);
    fs.chmodSync(restrictedDir, 0o444); // Read-only

    let threwPermission = false;
    try {
      workspace.initWorkspace(restrictedDir);
    } catch (e) {
      threwPermission = /permission denied/i.test(e.message);
    }
    recordTest('ADV-WS-08', 'initWorkspace under restricted directory permissions throws descriptive Permission Denied', 'WorkspaceManager', threwPermission);
  } catch (err) {
    recordTest('ADV-WS-08', 'initWorkspace permissions error handling', 'WorkspaceManager', false, { error: err.message });
  } finally {
    try {
      fs.chmodSync(restrictedDir, 0o777);
      fs.rmSync(restrictedDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // 3.9 cleanRuns and cleanTemp on empty or populated designs directories
  try {
    const layout = workspace.getStandardLayout(deepWsRoot);
    const emptyClean = workspace.cleanRuns(deepWsRoot);
    const emptyTemp = workspace.cleanTemp(deepWsRoot);

    // Populate mock runs with edge-case filenames (invalid timestamp, spaces, symbols)
    const runsDir = path.join(layout.designsDir, 'note_editor', 'verification', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    fs.mkdirSync(path.join(runsDir, 'run_invalid_timestamp_99999'));
    fs.mkdirSync(path.join(runsDir, 'run with spaces'));
    fs.mkdirSync(path.join(runsDir, 'run_special_#@!'));
    fs.writeFileSync(path.join(runsDir, 'run_invalid_timestamp_99999', 'receipt.json'), '{}');

    const populatedClean = workspace.cleanRuns(deepWsRoot);
    const remainingRuns = fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [];

    const pass = emptyClean.cleanedCount === 0 &&
                 emptyTemp.cleanedCount === 0 &&
                 populatedClean.cleanedCount === 3 &&
                 remainingRuns.length === 0;
    recordTest('ADV-WS-09', 'cleanRuns/cleanTemp safely handles empty directories and sweeps malformed run folders', 'WorkspaceManager', pass, {
      emptyClean,
      emptyTemp,
      populatedClean,
      remainingRuns
    });
  } catch (err) {
    recordTest('ADV-WS-09', 'cleanRuns edge cases', 'WorkspaceManager', false, { error: err.message });
  } finally {
    try {
      const topTmp = path.join(os.tmpdir(), path.relative(os.tmpdir(), deepWsRoot).split(path.sep)[0]);
      fs.rmSync(topTmp, { recursive: true, force: true });
    } catch (_) {}
  }


  // ==========================================================================
  // SECTION 4: Doctor Stress & Partial Failure Modes
  // ==========================================================================
  console.log('\n--- Section 4: Doctor Stress & Partial Failure Modes ---');

  // 4.1 doctor.runDoctor schema structure and field completeness
  try {
    const docResult = doctor.runDoctor();
    const pass = docResult.success !== undefined &&
                 (docResult.status === 'PASS' || docResult.status === 'FAIL') &&
                 docResult.command === 'doctor' &&
                 docResult.data && docResult.data.doctor &&
                 docResult.data.doctor.os &&
                 docResult.data.doctor.summary &&
                 Array.isArray(docResult.data.doctor.checks) &&
                 docResult.data.doctor.checks.length === 9 &&
                 typeof docResult.exitCode === 'number' &&
                 typeof docResult.humanOutput === 'string';
    recordTest('ADV-DOC-01', 'runDoctor returns valid structured envelope with summary, 9 checks, and human report', 'Doctor', pass, {
      status: docResult.status,
      totalChecks: docResult.data ? docResult.data.doctor.checks.length : 0,
      exitCode: docResult.exitCode
    });
  } catch (err) {
    recordTest('ADV-DOC-01', 'runDoctor schema structure', 'Doctor', false, { error: err.message });
  }

  // 4.2 Individual check contracts: all 9 checks implement required properties
  try {
    const docResult = doctor.runDoctor();
    let allChecksCompliant = true;
    const missingProps = [];
    const requiredCheckProps = ['id', 'name', 'category', 'required', 'status', 'value', 'expected', 'details'];

    for (const check of docResult.data.doctor.checks) {
      for (const prop of requiredCheckProps) {
        if (check[prop] === undefined) {
          allChecksCompliant = false;
          missingProps.push(`${check.id}.${prop}`);
        }
      }
      if (!['PASS', 'WARN', 'FAIL'].includes(check.status)) {
        allChecksCompliant = false;
        missingProps.push(`${check.id}.status=${check.status}`);
      }
    }
    recordTest('ADV-DOC-02', 'All 9 doctor checks strictly adhere to standardized schema contracts', 'Doctor', allChecksCompliant, {
      missingProps
    });
  } catch (err) {
    recordTest('ADV-DOC-02', 'doctor check schema contracts', 'Doctor', false, { error: err.message });
  }

  // 4.3 Simulated partial failure mode: invalid android path
  try {
    const failedDoc = doctor.runDoctor({ android: '/nonexistent/mock/android/path' });
    const pass = failedDoc.success === false &&
                 failedDoc.status === 'FAIL' &&
                 failedDoc.exitCode === 1 &&
                 failedDoc.data.doctor.summary.failed > 0 &&
                 failedDoc.data.doctor.checks.some(c => c.status === 'FAIL' && c.remediation !== null);
    recordTest('ADV-DOC-03', 'Simulated invalid android directory produces graceful FAIL status and actionable remediation', 'Doctor', pass, {
      status: failedDoc.status,
      exitCode: failedDoc.exitCode,
      summary: failedDoc.data.doctor.summary
    });
  } catch (err) {
    recordTest('ADV-DOC-03', 'Simulated invalid android path', 'Doctor', false, { error: err.message });
  }

  // 4.4 Simulated strict mode: strict: true elevates warnings to overall FAIL
  const tmpGradMock = path.join(os.tmpdir(), `ctc_mock_grad_${Date.now()}`);
  try {
    fs.mkdirSync(tmpGradMock);
    fs.writeFileSync(path.join(tmpGradMock, 'gradlew'), '#!/bin/sh\nexit 0');
    fs.chmodSync(path.join(tmpGradMock, 'gradlew'), 0o755);

    const nonStrictRes = doctor.runDoctor({ android: tmpGradMock, strict: false });
    const strictRes = doctor.runDoctor({ android: tmpGradMock, strict: true });

    const pass = nonStrictRes.status === 'PASS' && nonStrictRes.exitCode === 0 &&
                 strictRes.status === 'FAIL' && strictRes.exitCode === 1;
    recordTest('ADV-DOC-04', 'Doctor strict mode elevates non-fatal warnings (missing fonts) to exit code 1 FAIL', 'Doctor', pass, {
      nonStrictStatus: nonStrictRes.status,
      nonStrictExitCode: nonStrictRes.exitCode,
      strictStatus: strictRes.status,
      strictExitCode: strictRes.exitCode
    });
  } catch (err) {
    recordTest('ADV-DOC-04', 'Doctor strict mode warning elevation', 'Doctor', false, { error: err.message });
  } finally {
    if (fs.existsSync(tmpGradMock)) fs.rmSync(tmpGradMock, { recursive: true, force: true });
  }

  // 4.5 Doctor CLI execution via dispatcher with --json flag
  try {
    const cliResult = await dispatcher.dispatch(['doctor', '--json']);
    const parsed = JSON.parse(cliResult.output);
    const pass = parsed.command === 'doctor' &&
                 parsed.data && parsed.data.doctor &&
                 parsed.data.doctor.summary.total === 9 &&
                 cliResult.exitCode === parsed.exitCode;
    recordTest('ADV-DOC-05', 'ctc doctor --json outputs valid parseable JSON envelope matching dispatcher schema', 'Doctor', pass, {
      command: parsed.command,
      exitCode: parsed.exitCode
    });
  } catch (err) {
    recordTest('ADV-DOC-05', 'ctc doctor --json CLI execution', 'Doctor', false, { error: err.message });
  }


  // ==========================================================================
  // Summary & Diagnostic Metrics
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('ADVERSARIAL STRESS TEST SUITE EXECUTION SUMMARY');
  console.log('='.repeat(80));

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Scenarios: ${total}`);
  console.log(`Passed:          \x1b[32m${passed}\x1b[0m`);
  console.log(`Failed:          ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : '\x1b[32m0\x1b[0m'}`);
  console.log(`Success Rate:    ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\nFailed Tests Summary:');
    for (const f of results.filter(r => !r.passed)) {
      console.log(`  - [${f.id}] (${f.category}): ${f.name}`);
      if (f.details.reason) console.log(`      Reason: ${f.details.reason}`);
    }
  }

  return { total, passed, failed, results };
}

if (require.main === module) {
  runSuite().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal error running stress suite:', err);
    process.exit(2);
  });
}

module.exports = { runSuite };
