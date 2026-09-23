'use strict';

/**
 * src/cli/dispatcher.js
 *
 * Core CLI Dispatcher for Claude to Compose (ctc) v2.
 * Manages argument parsing, subcommand routing, JSON schema output formatting,
 * exit code assignment, signal interruption, and help generation.
 */

const fs = require('node:fs');
const path = require('node:path');

const EXIT_CODES = Object.freeze({
  PASS: 0,
  FAIL: 1,
  BLOCKED: 2,
  INFRASTRUCTURE_ERROR: 3,
  USAGE_ERROR: 3
});

const SUBCOMMANDS = Object.freeze([
  'doctor',
  'init',
  'baseline',
  'inspect-app',
  'capture',
  'contract build',
  'contract validate',
  'map',
  'plan',
  'agent packet',
  'verify',
  'defects',
  'profile export'
]);

/**
 * Global flags acceptable across all subcommands.
 */
const GLOBAL_FLAGS = Object.freeze([
  'json',
  'help', 'h',
  'version', 'v',
  'verbose',
  'quiet', 'q',
  'strict',
  'output', 'o', 'outputDir',
  'profile', 'p'
]);

/**
 * Declarative option schemas for all supported subcommands.
 */
const SUBCOMMAND_OPTIONS = Object.freeze({
  doctor: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'require-device', 'requireDevice',
    'app-dir', 'appDir', 'a', 'android', 'project'
  ])),
  init: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'module',
    'variant',
    'app-dir', 'appDir', 'a', 'android', 'project'
  ])),
  baseline: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'module',
    'variant',
    'app-dir', 'appDir', 'a', 'android', 'project'
  ])),
  'inspect-app': Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'module',
    'variant',
    'app-dir', 'appDir', 'a', 'android', 'project'
  ])),
  capture: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'input',
    'screen', 'screenId'
  ])),
  contract: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'screen', 'screenId',
    'evidence',
    'contract',
    'file',
    'workspace', 'w'
  ])),
  map: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'contract',
    'app-dir', 'appDir', 'a', 'android', 'project',
    'screen', 'screenId'
  ])),
  plan: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'map',
    'screen', 'screenId'
  ])),
  agent: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'screen', 'screenId',
    'format',
    'plan', 'plan-file',
    'map', 'map-file',
    'contract',
    'android', 'a', 'appDir', 'app-dir', 'project',
    'workspace', 'w',
    'branch', 'b',
    'candidate', 'c',
    'target', 't',
    'env', 'e', 'harness',
    's'
  ])),
  verify: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'screen', 'screenId',
    'app-dir', 'appDir', 'a', 'android', 'project',
    'candidate', 'c',
    'contract',
    'stage', 's',
    'until-stage', 'untilStage',
    'evidence', 'evidenceDir',
    'approval', 'A'
  ])),
  defects: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'report'
  ])),
  profile: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'force', 'f'
  ])),
  report: Object.freeze(new Set([
    ...GLOBAL_FLAGS,
    'screen', 'screenId'
  ])),
  package: Object.freeze(new Set([
    ...GLOBAL_FLAGS
  ]))
});

/**
 * Validates parsed flags against the subcommand's registered option schema.
 */
function validateOptions(command, flags = {}) {
  const allowed = SUBCOMMAND_OPTIONS[command];
  if (!allowed) {
    return null;
  }
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      const prefix = flag.length === 1 ? '-' : '--';
      return `Error: unrecognized option "${prefix}${flag}" for command "${command}"`;
    }
  }
  return null;
}

/**
 * Parse raw command line flags into a structured options object.
 * Safe against high argument counts (> 100 flags) without recursion.
 */
function parseArgs(args = []) {
  const options = {
    _: [],
    flags: {}
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--') {
      options._.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        options.flags[key] = val;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          options.flags[key] = next;
          i++;
        } else {
          options.flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        options.flags[key] = next;
        i++;
      } else {
        options.flags[key] = true;
      }
    } else {
      options._.push(arg);
    }
    i++;
  }

  // Canonicalize standard aliases
  if (options.flags['app-dir']) options.flags.appDir = options.flags['app-dir'];
  if (options.flags.a) {
    if (!options.flags.appDir) options.flags.appDir = options.flags.a;
    if (!options.flags.android) options.flags.android = options.flags.a;
  }
  if (options.flags.android && !options.flags.appDir) options.flags.appDir = options.flags.android;
  if (options.flags.appDir && !options.flags.android) options.flags.android = options.flags.appDir;
  if (options.flags.project) {
    if (!options.flags.appDir) options.flags.appDir = options.flags.project;
    if (!options.flags.android) options.flags.android = options.flags.project;
  }

  if (options.flags.w && !options.flags.workspace) options.flags.workspace = options.flags.w;
  if (options.flags.b && !options.flags.branch) options.flags.branch = options.flags.b;

  if (options.flags.c && !options.flags.candidate) options.flags.candidate = options.flags.c;

  if (options.flags.o && !options.flags.output) options.flags.output = options.flags.o;
  if (options.flags.p && !options.flags.profile) options.flags.profile = options.flags.p;
  if (options.flags.s && !options.flags.stage) options.flags.stage = options.flags.s;
  if (options.flags.t && !options.flags.target) options.flags.target = options.flags.t;
  if (options.flags.e && !options.flags.env) options.flags.env = options.flags.e;

  if (options.flags.screen && !options.flags.screenId) options.flags.screenId = options.flags.screen;
  if (options.flags.screenId && !options.flags.screen) options.flags.screen = options.flags.screenId;

  if (options.flags.A && !options.flags.approval) options.flags.approval = options.flags.A;

  return options;
}

/**
 * Parses a JSON argument string with error safety.
 */
function parseJsonArg(str) {
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch (err) {
    throw new Error(`Invalid JSON argument: ${err.message}`);
  }
}

/**
 * Standardizes output conforming to the project interface contract.
 */
function formatOutput(res = {}) {
  let status = res.status || (res.success ? 'PASS' : 'FAIL');
  if (status === 'READY_FOR_RETROFIT') {
    status = 'PASS';
  }
  let exitCode = typeof res.exitCode === 'number'
    ? res.exitCode
    : (EXIT_CODES[status] !== undefined ? EXIT_CODES[status] : (res.success ? 0 : 1));

  return {
    success: res.success !== false && status === 'PASS',
    status,
    command: res.command || 'ctc',
    timestamp: res.timestamp || new Date().toISOString(),
    data: res.data !== undefined ? res.data : {},
    defects: Array.isArray(res.defects) ? res.defects : [],
    exitCode,
    error: res.error || null
  };
}

/**
 * Generates global CLI usage help text.
 */
function getUsageHelp() {
  return [
    'Usage: ctc <command> [subcommand] [arguments] [options]',
    '',
    'Commands (13 subcommands):',
    '  ctc doctor                           Check environment, Android SDK, and DC1 prerequisites',
    '  ctc init [dir]                       Initialize .ctc workspace hierarchy and configuration',
    '  ctc baseline <app-dir>               Capture pre-retrofit compilation and test baseline',
    '  ctc inspect-app <app-dir>            Index screens, ViewModels, and behavior invariants',
    '  ctc capture <design-artifact-dir>    Capture evidence bundle from Claude Design artifact',
    '  ctc contract build <screen-id>       Compile 4-layer immutable design contract from evidence',
    '  ctc contract validate <contract-file> Validate contract JSON against Draft 2020-12 schemas',
    '  ctc map <contract-file> <app-dir>    Map design nodes to existing Kotlin composables/state',
    '  ctc plan <correspondence-file>       Generate phased migration plan with scoped boundaries',
    '  ctc agent packet <screen-id>         Generate scoped agent implementation packet (MD/JSON)',
    '  ctc verify <screen-id>               Execute fail-closed 6-stage progressive verification',
    '  ctc defects <verification-report>    Causal defect oracle attributing failures to element IDs',
    '  ctc profile export [name]            Export versioned hardware profile (daylight-dc1)',
    '',
    'Global Options:',
    '  --json                               Emit machine-readable JSON output',
    '  --output, -o <path>                  Target output directory or file path',
    '  --app-dir, -a <path>                 Path to Android app directory (default: current directory)',
    '  --profile, -p <name>                 Target hardware profile (default: daylight-dc1)',
    '  --stage, -s <name>                   Selective verification stage (for verify command)',
    '  --help, -h                           Show this usage message',
    '  --version, -v                        Show CLI version'
  ].join('\n');
}

/**
 * Wraps a result object as a hybrid Thenable so it supports both:
 * 1. Synchronous property access: `res.exitCode`, `res.output`, `res.status`
 * 2. Asynchronous promise resolution: `await cli.dispatch(...)`
 */
function createHybridResult(baseResult, asyncPromise = null) {
  const target = asyncPromise || Promise.resolve(baseResult);
  for (const [key, value] of Object.entries(baseResult)) {
    target[key] = value;
  }
  return target;
}

/**
 * Programmatic dispatch function.
 * Evaluates arguments and routes to subsystem handlers without unconditionally exiting the process.
 */
function dispatch(args = []) {
  if (!args || args.length === 0 || args.includes('--help') || args.includes('-h')) {
    const helpText = getUsageHelp();
    const formatted = formatOutput({
      success: true,
      status: 'PASS',
      command: 'help',
      exitCode: EXIT_CODES.PASS,
      data: { help: helpText }
    });
    return createHybridResult({
      ...formatted,
      output: helpText
    });
  }

  if (args.includes('--version') || args.includes('-v')) {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    let version = '2.0.0';
    try {
      version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    } catch (_) {}
    const formatted = formatOutput({
      success: true,
      status: 'PASS',
      command: 'version',
      exitCode: EXIT_CODES.PASS,
      data: { version }
    });
    return createHybridResult({
      ...formatted,
      output: `ctc v${version}`
    });
  }

  const parsed = parseArgs(args);
  let primary = parsed._[0];
  const isJson = Boolean(parsed.flags.json);

  // Normalize compound commands: e.g. "contract build" passed as single token
  if (primary && primary.includes(' ')) {
    const split = primary.split(/\s+/);
    primary = split[0];
    parsed._[0] = split[0];
    parsed._.splice(1, 0, split[1]);
  }

  // Check valid primary verbs
  const validPrimaryVerbs = [
    'doctor', 'init', 'baseline', 'inspect-app', 'capture',
    'contract', 'map', 'plan', 'agent', 'verify', 'defects',
    'profile', 'report', 'package'
  ];

  if (!validPrimaryVerbs.includes(primary)) {
    const errorMsg = `Error: unrecognized subcommand "${primary}". Run "ctc --help" for available commands.`;
    const formatted = formatOutput({
      success: false,
      status: 'FAIL',
      command: primary || 'unknown',
      exitCode: EXIT_CODES.FAIL,
      error: errorMsg
    });
    return createHybridResult({
      ...formatted,
      output: isJson ? JSON.stringify(formatted, null, 2) : errorMsg
    });
  }

  // Validate subcommand options generically across all subcommands
  const optionError = validateOptions(primary, parsed.flags);
  if (optionError) {
    const formatted = formatOutput({
      success: false,
      status: 'FAIL',
      command: primary,
      exitCode: EXIT_CODES.USAGE_ERROR,
      error: optionError
    });
    return createHybridResult({
      ...formatted,
      output: isJson ? JSON.stringify(formatted, null, 2) : optionError
    });
  }

  // Shift primary command from positional args for command handlers
  const cmdParsed = {
    _: parsed._.slice(1),
    flags: parsed.flags
  };

  try {
    let resultSyncOrPromise = null;

    switch (primary) {
      case 'doctor': {
        const cmd = require('./commands/doctor');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'init': {
        const cmd = require('./commands/init');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'baseline': {
        const cmd = require('./commands/baseline');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'inspect-app': {
        const cmd = require('./commands/inspect_app');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'capture': {
        const cmd = require('./commands/capture');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'contract': {
        const cmd = require('./commands/contract');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'map': {
        const cmd = require('./commands/map');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'plan': {
        const cmd = require('./commands/plan');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'agent': {
        const cmd = require('./commands/agent');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'verify': {
        const cmd = require('./commands/verify');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'defects': {
        const cmd = require('./commands/defects');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'profile': {
        const cmd = require('./commands/profile');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'report': {
        const cmd = require('./commands/report');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      case 'package': {
        const cmd = require('./commands/package');
        resultSyncOrPromise = cmd.execute(cmdParsed);
        break;
      }
      default: {
        throw new Error(`No handler registered for command: ${primary}`);
      }
    }

    // Check if handler returned a Promise
    if (resultSyncOrPromise && typeof resultSyncOrPromise.then === 'function') {
      const asyncPromise = resultSyncOrPromise.then((rawResult) => {
        const formatted = formatOutput(rawResult);
        let outputStr = '';
        if (isJson) {
          outputStr = JSON.stringify(formatted, null, 2);
        } else {
          outputStr = rawResult.humanOutput || (rawResult.error ? `Error: ${rawResult.error}` : `Command ${primary} completed: ${formatted.status}`);
        }
        return {
          ...formatted,
          output: outputStr
        };
      }).catch((err) => {
        const formatted = formatOutput({
          success: false,
          status: 'FAIL',
          command: primary,
          exitCode: EXIT_CODES.FAIL,
          error: err.message
        });
        return {
          ...formatted,
          output: isJson ? JSON.stringify(formatted, null, 2) : `Error: ${err.message}`
        };
      });

      // Synchronous initial fallback properties for hybrid thenable
      const fallbackFormatted = formatOutput({
        success: true,
        status: 'PASS',
        command: primary,
        exitCode: EXIT_CODES.PASS
      });
      return createHybridResult({
        ...fallbackFormatted,
        output: `Executing ${primary}...`
      }, asyncPromise);
    }

    // Synchronous execution result
    const formatted = formatOutput(resultSyncOrPromise);
    let outputStr = '';
    if (isJson) {
      outputStr = JSON.stringify(formatted, null, 2);
    } else {
      outputStr = resultSyncOrPromise.humanOutput || (resultSyncOrPromise.error ? `Error: ${resultSyncOrPromise.error}` : `Command ${primary} completed: ${formatted.status}`);
    }

    return createHybridResult({
      ...formatted,
      output: outputStr
    });
  } catch (err) {
    const exitCode = typeof err.exitCode === 'number' ? err.exitCode : EXIT_CODES.FAIL;
    const formatted = formatOutput({
      success: false,
      status: exitCode === 3 ? 'INPUT_INVALID' : (exitCode === 2 ? 'BLOCKED' : 'FAIL'),
      command: primary,
      exitCode,
      error: err.message
    });
    return createHybridResult({
      ...formatted,
      output: isJson ? JSON.stringify(formatted, null, 2) : `Error: ${err.message}`
    });
  }
}

/**
 * Clean signal handling for SIGINT and SIGTERM.
 */
function handleSignals() {
  const cleanup = () => {
    process.exit(EXIT_CODES.INFRASTRUCTURE_ERROR);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = {
  EXIT_CODES,
  SUBCOMMANDS,
  SUBCOMMAND_OPTIONS,
  dispatch,
  parseArgs,
  parseJsonArg,
  formatOutput,
  getUsageHelp,
  handleSignals,
  validateOptions
};
