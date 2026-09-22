'use strict';

/**
 * src/cli/commands/agent.js
 *
 * Handler for `ctc agent packet <screen-id>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { generateImplementationPacket } = require('../../agent/packet');

function execute(parsed) {
  const subAction = parsed._[0];
  if (subAction !== 'packet') {
    throw new Error(`Unknown agent action: "${subAction}". Allowed: packet`);
  }

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

module.exports = { execute };
