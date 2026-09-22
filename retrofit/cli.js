'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { gitVersion, inspectRepository } = require('./inspect_app');
const { buildContract } = require('./contract_builder');
const { buildAgentPacket, renderMarkdown } = require('./agent_packet');
const { verify: verifySemantic, safeReportPath } = require('../verification/v1_semantic_validator');
const {
  INFRASTRUCTURE, MARKER, InputError, atomicWriteNoFollow, canonicalPlannedPath, isInside, readWorkspace,
  rejectDangerousRoot, resolveExplicit
} = require('./safety');

function parse(argv) {
  let command = argv[0];
  let start = 1;
  if ((command === 'contract' || command === 'agent') && argv[1]) {
    command = `${command} ${argv[1]}`;
    start = 2;
  }
  const options = { json: false };
  const seen = new Set();
  const names = {
    android: 'android', workspace: 'workspace', output: 'output',
    'app-model': 'appModel', 'design-spec': 'designSpec', correspondence: 'correspondence',
    'behavior-manifest': 'behaviorManifest', 'created-at': 'createdAt', contract: 'contract',
    result: 'result', root: 'root', report: 'report', candidate: 'candidate'
  };
  for (let i = start; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') {
      if (seen.has('json')) throw new InputError('duplicate option: --json');
      seen.add('json');
      options.json = true;
    }
    else if (token.startsWith('--')) {
      const name = token.slice(2);
      if (!names[name]) throw new InputError(`unknown option: ${token}`);
      if (seen.has(name)) throw new InputError(`duplicate option: ${token}`);
      seen.add(name);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new InputError(`${token} requires a value`);
      options[names[name]] = value;
      i += 1;
    } else throw new InputError(`unexpected argument: ${token}`);
  }
  return { command, options };
}

function emit(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value)}\n`);
  else if (value.kind === 'ExistingAppModel') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${value.outcome}: ${value.message}\n`);
}

function emitArtifact(value, json, emission) {
  if (json) process.stdout.write(`${JSON.stringify(value)}\n`);
  else process.stdout.write(`EMITTED ${value.kind} ${value.id} to ${emission}\n`);
}

function outputFile(raw) {
  const resolved = resolveExplicit(raw, '--output');
  rejectDangerousRoot(resolved, '--output');
  return path.extname(resolved).toLowerCase() === '.json'
    ? resolved
    : path.join(resolved, 'existing-app-model.json');
}

function assertOutputSafe(androidRoot, file, workspaceRaw) {
  const canonicalAndroid = fs.realpathSync(androidRoot);
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new InputError(`refusing final output symlink: ${file}`);
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  const canonicalOutput = canonicalPlannedPath(file);
  const canonicalParent = canonicalPlannedPath(path.dirname(file));
  rejectDangerousRoot(path.dirname(canonicalOutput), '--output');
  if (canonicalOutput === canonicalAndroid || isInside(canonicalAndroid, canonicalOutput) || file === androidRoot || isInside(androidRoot, file)) {
    throw new InputError('inspect-app output must be outside the inspected Android repository');
  }
  if (!workspaceRaw) return;
  const workspace = resolveExplicit(workspaceRaw, '--workspace');
  const marker = readWorkspace(workspace);
  let markerAndroidRoot;
  try { markerAndroidRoot = fs.realpathSync(marker.androidRoot); } catch (_) { throw new InputError('workspace marker Android root does not exist'); }
  if (markerAndroidRoot !== canonicalAndroid) throw new InputError('workspace marker belongs to a different Android root');
  const canonicalWorkspace = fs.realpathSync(workspace);
  if (canonicalParent !== canonicalWorkspace && !isInside(canonicalWorkspace, canonicalParent)) {
    throw new InputError('output parent escapes the declared workspace');
  }
  rejectDangerousRoot(path.dirname(file), '--output');
}

function doctor() {
  const capabilities = {
    node: { available: true, version: process.version },
    gitExecutable: { available: false, version: null },
    schema: { available: fs.existsSync(path.resolve(__dirname, '../schemas/v1/existing-app-model.schema.json')) },
    gradleTasksExecuted: false
  };
  try {
    capabilities.gitExecutable.version = gitVersion();
    capabilities.gitExecutable.available = true;
  } catch (_) {
    // Availability is reported narrowly; doctor does not inspect a project.
  }
  const pass = capabilities.gitExecutable.available && capabilities.schema.available;
  return {
    command: 'doctor', outcome: pass ? 'PASS' : 'BLOCKED',
    message: pass
      ? 'Local Node, Git, and the ExistingAppModel schema are available; no Android project or Gradle task was evaluated.'
      : 'A local prerequisite for lexical inspection is unavailable; no Android project or Gradle task was evaluated.',
    claimScope: 'LOCAL_CLI_PREREQUISITES_ONLY', capabilities
  };
}

function init(options) {
  const androidRoot = resolveExplicit(options.android, '--android');
  const workspace = resolveExplicit(options.workspace || options.output, '--workspace');
  if (!fs.existsSync(androidRoot) || !fs.statSync(androidRoot).isDirectory()) throw new InputError('--android must be an existing directory');
  rejectDangerousRoot(androidRoot, '--android');
  rejectDangerousRoot(workspace, '--workspace');
  if (workspace === androidRoot) throw new InputError('workspace must not be the Android repository root');
  const canonicalAndroid = fs.realpathSync(androidRoot);
  const canonicalWorkspace = canonicalPlannedPath(workspace);
  if (canonicalWorkspace === canonicalAndroid || isInside(canonicalAndroid, canonicalWorkspace) || isInside(androidRoot, workspace)) {
    throw new InputError('workspace must be outside the Android repository');
  }
  fs.mkdirSync(workspace, { recursive: true });
  if (fs.realpathSync(workspace) !== canonicalPlannedPath(workspace)) throw new InputError('workspace canonicalization changed unexpectedly');
  const markerPath = path.join(workspace, MARKER);
  const marker = { kind: 'ctc-workspace', version: 1, androidRoot };
  let markerExists = false;
  try { fs.lstatSync(markerPath); markerExists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (markerExists) {
    const existing = readWorkspace(workspace);
    if (path.resolve(existing.androidRoot) !== androidRoot) throw new InputError('workspace is already initialized for a different Android root');
  } else {
    atomicWriteNoFollow(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  }
  return {
    command: 'init', outcome: 'PASS', message: 'Initialized the explicit ctc workspace without removing unrelated files.',
    workspace, marker: markerPath, androidRoot
  };
}

function inspect(options) {
  const androidRoot = resolveExplicit(options.android, '--android');
  if (!fs.existsSync(androidRoot) || !fs.statSync(androidRoot).isDirectory()) throw new InputError('--android must be an existing directory');
  rejectDangerousRoot(androidRoot, '--android');
  const file = outputFile(options.output);
  assertOutputSafe(androidRoot, file, options.workspace);
  const model = inspectRepository(androidRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertOutputSafe(androidRoot, file, options.workspace);
  atomicWriteNoFollow(file, `${JSON.stringify(model, null, 2)}\n`);
  return model;
}

function contractOutput(raw) {
  const resolved = resolveExplicit(raw, '--output');
  rejectDangerousRoot(resolved, '--output');
  return path.extname(resolved).toLowerCase() === '.json' ? resolved : path.join(resolved, 'retrofit-contract.json');
}

function assertNoOutputCollision(outputs, sources, workspace) {
  const protectedPaths = [...sources, path.join(workspace, MARKER)].map((item) => fs.realpathSync(item));
  for (const output of outputs) {
    const canonicalOutput = canonicalPlannedPath(output);
    if (protectedPaths.includes(canonicalOutput)) throw new InputError(`output collides with a protected input: ${output}`);
  }
}

function contractBuild(options) {
  const androidRoot = resolveExplicit(options.android, '--android');
  const file = contractOutput(options.output);
  assertOutputSafe(androidRoot, file, options.workspace);
  const built = buildContract(options);
  assertNoOutputCollision([file], built.sourcePaths, resolveExplicit(options.workspace, '--workspace'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertOutputSafe(androidRoot, file, options.workspace);
  atomicWriteNoFollow(file, `${JSON.stringify(built.contract, null, 2)}\n`);
  return { value: built.contract, exitCode: built.blocked ? 2 : 0, emission: file };
}

function packetPaths(raw) {
  const resolved = resolveExplicit(raw, '--output');
  rejectDangerousRoot(resolved, '--output');
  if (path.extname(resolved).toLowerCase() === '.json') {
    return { json: resolved, markdown: resolved.slice(0, -5) + '.md' };
  }
  return { json: path.join(resolved, 'agent-packet.json'), markdown: path.join(resolved, 'agent-packet.md') };
}

function agentPacket(options) {
  const workspace = resolveExplicit(options.workspace, '--workspace');
  const marker = readWorkspace(workspace);
  const androidRoot = fs.realpathSync(marker.androidRoot);
  const files = packetPaths(options.output);
  assertOutputSafe(androidRoot, files.json, workspace);
  assertOutputSafe(androidRoot, files.markdown, workspace);
  const built = buildAgentPacket(workspace, options.contract);
  assertNoOutputCollision([files.json, files.markdown], built.sourcePaths, workspace);
  fs.mkdirSync(path.dirname(files.json), { recursive: true });
  fs.mkdirSync(path.dirname(files.markdown), { recursive: true });
  assertOutputSafe(androidRoot, files.json, workspace);
  assertOutputSafe(androidRoot, files.markdown, workspace);
  atomicWriteNoFollow(files.json, `${JSON.stringify(built.packet, null, 2)}\n`);
  atomicWriteNoFollow(files.markdown, renderMarkdown(built.packet));
  const blocked = built.packet.capabilities.some((item) => item.status === 'UNSUPPORTED_BLOCKING')
    || built.packet.uncertainties.some((item) => item.impact === 'BLOCKING');
  return { value: built.packet, exitCode: blocked ? 2 : 0, emission: `${files.json} and ${files.markdown}` };
}

function verify(options) {
  const built = verifySemantic(options);
  let report = null;
  if (options.report) {
    report = safeReportPath(options.root, options.report, built.protectedPaths);
    fs.mkdirSync(path.dirname(report), { recursive: true });
    atomicWriteNoFollow(report, built.report);
  }
  return {
    value: {
      command: 'verify', outcome: built.decision.outcome, resultId: built.result.id,
      verificationScope: built.result.verificationScope, summary: built.decision.summary,
      report, message: `Semantic verification result is ${built.decision.outcome}; supplied result and evidence were not modified.`
    },
    exitCode: built.decision.outcome === 'PASS' ? 0 : built.decision.outcome === 'FAIL' ? 1 : 2
  };
}

function help() {
  return [
    'Usage:',
    '  ctc doctor [--json]',
    '  ctc init --android <repository-root> --workspace <workspace-root> [--json]',
    '  ctc inspect-app --android <repository-root> --output <outside-file-or-directory> [--workspace <initialized-workspace>] [--json]',
    '  ctc contract build --android <root> --app-model <json> --design-spec <json> --correspondence <json> --behavior-manifest <json> --output <path> --workspace <initialized-workspace> [--created-at <iso>] [--json]',
    '  ctc agent packet --contract <json> --output <path> --workspace <initialized-workspace> [--json]',
    '  ctc verify --contract <json> --result <json> --root <workspace> [--candidate <separate-git-worktree>] [--report <file>] [--json]'
  ].join('\n');
}

function run(argv = process.argv.slice(2)) {
  let json = argv.includes('--json');
  try {
    const parsed = parse(argv);
    json = parsed.options.json;
    let result;
    if (parsed.command === 'doctor') result = doctor();
    else if (parsed.command === 'init') result = init(parsed.options);
    else if (parsed.command === 'inspect-app') result = inspect(parsed.options);
    else if (parsed.command === 'contract build') {
      const built = contractBuild(parsed.options);
      emitArtifact(built.value, json, built.emission);
      if (built.exitCode === 2) process.stderr.write('ctc: artifact emitted with blocking capability or uncertainty\n');
      return built.exitCode;
    } else if (parsed.command === 'agent packet') {
      const built = agentPacket(parsed.options);
      emitArtifact(built.value, json, built.emission);
      if (built.exitCode === 2) process.stderr.write('ctc: packet emitted with blocking capability or uncertainty\n');
      return built.exitCode;
    } else if (parsed.command === 'verify') {
      const checked = verify(parsed.options);
      emit(checked.value, json);
      return checked.exitCode;
    } else if (parsed.command === '--help' || parsed.command === '-h' || !parsed.command) {
      process.stdout.write(`${help()}\n`);
      return 0;
    } else throw new InputError(`unknown command: ${parsed.command}`);
    emit(result, json);
    return result.outcome === 'BLOCKED' ? 2 : 0;
  } catch (error) {
    const exitCode = Number.isInteger(error.exitCode) ? error.exitCode : INFRASTRUCTURE;
    const outcome = exitCode === 2 ? 'BLOCKED' : exitCode === 3 ? 'INVALID_INPUT' : 'INFRASTRUCTURE_ERROR';
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`ctc: ${message}\n`);
    if (json) emit({ command: argv[0] || null, outcome, message }, true);
    return exitCode;
  }
}

module.exports = { run };
