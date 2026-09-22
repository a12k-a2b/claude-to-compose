'use strict';

/**
 * src/cli/commands/map.js
 *
 * Handler for `ctc map <contract-file> <app-dir>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { generateCorrespondenceMap } = require('../../mapping/mapper');

function execute(parsed) {
  const contractFile = parsed._[0] || parsed.flags.contract;
  const appDir = parsed._[1] || parsed.flags.appDir || parsed.flags['app-dir'] || '.';

  if (!contractFile) {
    throw new Error('Contract file required for "map" (e.g. ctc map contract.json fixtures/note-app)');
  }

  const resolvedContract = path.resolve(process.cwd(), contractFile);
  const resolvedAppDir = path.resolve(process.cwd(), appDir);

  if (!fs.existsSync(resolvedContract)) {
    throw new Error(`Contract file does not exist: "${resolvedContract}"`);
  }

  const designContract = JSON.parse(fs.readFileSync(resolvedContract, 'utf8'));

  // Load app model if present, or construct default
  const modelFile = path.join(resolvedAppDir, '.ctc/app/existing-app-model.json');
  let appModel = null;
  if (fs.existsSync(modelFile)) {
    appModel = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  }

  const res = generateCorrespondenceMap({
    designContract,
    appModel,
    screenId: parsed.flags.screen || designContract.screenId || 'screen'
  });

  return {
    success: true,
    status: 'PASS',
    command: 'map',
    timestamp: new Date().toISOString(),
    data: res,
    defects: [],
    exitCode: 0,
    humanOutput: `Correspondence map generated with ${res.mappings?.length || 0} node mapping(s)`
  };
}

module.exports = { execute };
