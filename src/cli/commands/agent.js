'use strict';

/**
 * src/cli/commands/agent.js
 *
 * Handler for `ctc agent packet <screen-id>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { generateImplementationPacket } = require('../../agent/packet');
const { createAgentWorktree, loadRetrofitContract } = require('../../agent/worktree');
const { scaffoldAllHarnesses } = require('../../agent/harnesses');
const { InputError, resolveExplicit, rejectDangerousRoot } = require('../../agent/safety');

function execute(parsed) {
  const subAction = parsed._[0];

  if (subAction === 'packet') {
    return executePacket(parsed);
  }

  if (subAction === 'worktree') {
    return executeWorktree(parsed);
  }

  if (subAction === 'harness') {
    return executeHarness(parsed);
  }

  const errorMsg = subAction
    ? `Unknown agent action: "${subAction}". Allowed: packet, worktree, harness`
    : 'Agent action required (e.g. "ctc agent packet <screen-id>", "ctc agent worktree [options]", or "ctc agent harness [options]")';

  return {
    success: false,
    status: 'INPUT_INVALID',
    command: 'agent',
    timestamp: new Date().toISOString(),
    data: { errorType: 'InputError', message: errorMsg },
    defects: [],
    exitCode: 3,
    error: errorMsg,
    humanOutput: `Error: ${errorMsg}`
  };
}

function executePacket(parsed) {
  const screenId = parsed._[1] || parsed.flags.screen;
  if (!screenId) {
    throw new Error('Screen ID required for "agent packet" (e.g. ctc agent packet note_editor)');
  }

  // Load contract, correspondence map, and migration plan with flag overrides
  const designsDir = path.resolve('.ctc/designs', screenId);
  const contractFile = parsed.flags.contract
    ? path.resolve(process.cwd(), parsed.flags.contract)
    : path.join(designsDir, 'contract', 'design-contract.json');
  const mapFile = (parsed.flags.map || parsed.flags['map-file'])
    ? path.resolve(process.cwd(), parsed.flags.map || parsed.flags['map-file'])
    : path.join(designsDir, 'mapping', 'correspondence.json');
  const planFile = (parsed.flags.plan || parsed.flags['plan-file'])
    ? path.resolve(process.cwd(), parsed.flags.plan || parsed.flags['plan-file'])
    : path.join(designsDir, 'mapping', 'migration-plan.json');

  let designContract = null;
  let correspondenceMap = null;
  let migrationPlan = null;

  if (fs.existsSync(contractFile)) {
    try {
      designContract = JSON.parse(fs.readFileSync(contractFile, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse design contract at "${contractFile}": ${err.message}`);
    }
  }
  if (fs.existsSync(mapFile)) {
    try {
      correspondenceMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse correspondence map at "${mapFile}": ${err.message}`);
    }
  }
  if (fs.existsSync(planFile)) {
    try {
      migrationPlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    } catch (err) {
      throw new Error(`Failed to parse migration plan at "${planFile}": ${err.message}`);
    }
  }

  // Graceful handling when migrationPlan is missing
  if (!migrationPlan) {
    const errorMsg = `Migration plan not found for screen "${screenId}" (expected at ${planFile}). Run "ctc plan <correspondence-file>" or supply --plan <path> before generating an agent packet.`;
    return {
      success: false,
      status: 'BLOCKED',
      command: 'agent packet',
      timestamp: new Date().toISOString(),
      data: {
        screenId,
        contractFile,
        mapFile,
        planFile,
        instructions: 'Run "ctc plan" first to generate a migration plan, or specify --plan <path>'
      },
      defects: [],
      exitCode: 2,
      error: errorMsg,
      humanOutput: `Error: ${errorMsg}`
    };
  }

  const res = generateImplementationPacket({
    screenId,
    designContract,
    correspondenceMap,
    migrationPlan,
    format: parsed.flags.format || 'both',
    outputDir: parsed.flags.output
  });

  return {
    success: true,
    status: 'PASS',
    command: 'agent packet',
    timestamp: new Date().toISOString(),
    data: res,
    defects: [],
    exitCode: 0,
    humanOutput: `Agent implementation packet generated for "${screenId}"`
  };
}

function executeWorktree(parsed) {
  if (parsed.flags.help || parsed.flags.h || parsed._[1] === 'help') {
    const helpText = [
      'Usage: ctc agent worktree [options]',
      '',
      'Scaffold an isolated descendant Git worktree and agent context for coding agents.',
      '',
      'Options:',
      '  --android, -a <path>      Path to inspected clean Android baseline Git repository (required)',
      '  --workspace, -w <path>    Path to initialized CTC workspace (required)',
      '  --branch, -b <name>       Git branch name to create for candidate worktree (required)',
      '  --output, -o <path>       Target candidate worktree directory (required)',
      '  --contract <path>         Path to design contract or retrofit contract (optional)',
      '  --screen <id>             Screen identifier (optional, default: note_editor)',
      '  --json                    Emit structured JSON output',
      '  --help, -h                Show this help message'
    ].join('\n');
    return {
      success: true,
      status: 'PASS',
      command: 'agent worktree',
      timestamp: new Date().toISOString(),
      data: { help: helpText },
      defects: [],
      exitCode: 0,
      humanOutput: helpText
    };
  }

  try {
    const rawAndroid = parsed.flags.android || parsed.flags.appDir || parsed.flags['app-dir'] || parsed.flags.project || parsed.flags.a;
    const rawWorkspace = parsed.flags.workspace || parsed.flags.w;
    const rawBranch = parsed.flags.branch || parsed.flags.b;
    const rawOutput = parsed.flags.output || parsed.flags.o || parsed.flags.outputDir || parsed.flags.candidate || parsed.flags.c;
    const rawContract = parsed.flags.contract;
    const rawScreen = parsed.flags.screen || parsed.flags.screenId || parsed._[1];

    if (!rawAndroid) throw new InputError('--android <path> is required for "agent worktree"');
    if (!rawWorkspace) throw new InputError('--workspace <path> is required for "agent worktree"');
    if (!rawBranch) throw new InputError('--branch <name> is required for "agent worktree"');
    if (!rawOutput) throw new InputError('--output <path> is required for "agent worktree"');

    const result = createAgentWorktree({
      android: rawAndroid,
      workspace: rawWorkspace,
      branch: rawBranch,
      output: rawOutput,
      contract: rawContract,
      screenId: rawScreen,
      format: parsed.flags.format || 'both'
    });

    return {
      success: true,
      status: 'PASS',
      command: 'agent worktree',
      timestamp: new Date().toISOString(),
      data: result,
      defects: [],
      exitCode: 0,
      humanOutput: `Candidate worktree successfully scaffolded at ${result.worktree || result.candidatePath} on branch ${result.branch}`
    };
  } catch (err) {
    const exitCode = typeof err.exitCode === 'number' ? err.exitCode : 3;
    const status = exitCode === 3 ? 'INPUT_INVALID' : (exitCode === 2 ? 'BLOCKED' : 'FAIL');
    return {
      success: false,
      status,
      command: 'agent worktree',
      timestamp: new Date().toISOString(),
      data: { errorType: err.name || 'InputError', message: err.message },
      defects: [],
      exitCode,
      error: err.message,
      humanOutput: `Error: ${err.message}`
    };
  }
}

function executeHarness(parsed) {
  if (parsed.flags.help || parsed.flags.h || parsed._[1] === 'help') {
    const helpText = [
      'Usage: ctc agent harness [options]',
      '',
      'Scaffold coding agent harnesses (Cursor, Claude Code, Codex, Antigravity) into target directory.',
      '',
      'Options:',
      '  --target, -t <path>       Target directory (default: candidate worktree or current directory)',
      '  --env, -e <name>          Environment: cursor | claude | codex | antigravity | candidate | all (default: all)',
      '  --screen, -s <id>         Target screen identifier (default: note_editor)',
      '  --contract <path>         Path to design contract or retrofit contract (optional)',
      '  --workspace, -w <path>    Path to initialized CTC workspace (optional)',
      '  --android, -a <path>      Path to Android baseline repository (optional)',
      '  --json                    Emit structured JSON output',
      '  --help, -h                Show this help message'
    ].join('\n');
    return {
      success: true,
      status: 'PASS',
      command: 'agent harness',
      timestamp: new Date().toISOString(),
      data: { help: helpText },
      defects: [],
      exitCode: 0,
      humanOutput: helpText
    };
  }

  try {
    const rawTarget = parsed.flags.target || parsed.flags.t || parsed.flags.candidate || parsed.flags.c || parsed.flags.output || parsed.flags.o || parsed._[1] || '.';
    const env = parsed.flags.env || parsed.flags.e || parsed.flags.harness || 'all';
    const screenId = parsed.flags.screen || parsed.flags.s || parsed.flags.screenId || 'note_editor';
    const rawContract = parsed.flags.contract;
    const rawWorkspace = parsed.flags.workspace || parsed.flags.w;
    const rawAndroid = parsed.flags.android || parsed.flags.a;

    const resolvedTarget = resolveExplicit(rawTarget, 'target directory');
    rejectDangerousRoot(resolvedTarget, 'target directory');

    const contract = loadRetrofitContract(
      rawWorkspace ? resolveExplicit(rawWorkspace, 'workspace') : null,
      rawContract,
      screenId
    );

    const result = scaffoldAllHarnesses(resolvedTarget, {
      env,
      screenId,
      contract,
      androidRoot: rawAndroid ? resolveExplicit(rawAndroid, 'android repository') : null
    });

    return {
      success: true,
      status: 'PASS',
      command: 'agent harness',
      timestamp: new Date().toISOString(),
      data: result,
      defects: [],
      exitCode: 0,
      humanOutput: `Successfully scaffolded ${result.filesWritten.length} harness files in ${resolvedTarget} for env: ${env}`
    };
  } catch (err) {
    const exitCode = typeof err.exitCode === 'number' ? err.exitCode : 3;
    const status = exitCode === 3 ? 'INPUT_INVALID' : (exitCode === 2 ? 'BLOCKED' : 'FAIL');
    return {
      success: false,
      status,
      command: 'agent harness',
      timestamp: new Date().toISOString(),
      data: { errorType: err.name || 'InputError', message: err.message },
      defects: [],
      exitCode,
      error: err.message,
      humanOutput: `Error: ${err.message}`
    };
  }
}

module.exports = { execute };

