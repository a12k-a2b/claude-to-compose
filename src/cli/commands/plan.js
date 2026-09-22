'use strict';

/**
 * src/cli/commands/plan.js
 *
 * Handler for `ctc plan <correspondence-file>`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { generateMigrationPlan } = require('../../mapping/planner');

function execute(parsed) {
  const mapFile = parsed._[0] || parsed.flags.map;
  if (!mapFile) {
    throw new Error('Correspondence file required for "plan" (e.g. ctc plan correspondence.json)');
  }

  const resolvedMap = path.resolve(process.cwd(), mapFile);
  if (!fs.existsSync(resolvedMap)) {
    throw new Error(`Correspondence map file does not exist: "${resolvedMap}"`);
  }

  const correspondenceMap = JSON.parse(fs.readFileSync(resolvedMap, 'utf8'));

  const plan = generateMigrationPlan({
    correspondenceMap,
    screenId: parsed.flags.screen || correspondenceMap.screenId || 'screen'
  });

  return {
    success: true,
    status: 'PASS',
    command: 'plan',
    timestamp: new Date().toISOString(),
    data: plan,
    defects: [],
    exitCode: 0,
    humanOutput: `Migration plan generated with ${plan.phases?.length || 0} phase(s)`
  };
}

module.exports = { execute };
