'use strict';

/**
 * src/cli/commands/baseline.js
 *
 * Handler for `ctc baseline <app-dir>`.
 */

const path = require('node:path');
const { runBaseline } = require('../../baseline');

async function execute(parsed) {
  const appDir = parsed._[0] || parsed.flags.appDir || parsed.flags['app-dir'] || '.';
  const resolvedAppDir = path.resolve(process.cwd(), appDir);

  const res = await runBaseline({
    project: resolvedAppDir,
    variant: parsed.flags.variant || 'debug',
    module: parsed.flags.module || 'app',
    output: parsed.flags.output
  });

  const rawStatus = res.status || (res.success ? 'PASS' : 'BLOCKED');
  const isPass = rawStatus === 'READY_FOR_RETROFIT' || rawStatus === 'PASS' || res.success === true;
  const isBlocked = rawStatus === 'BLOCKED' || res.data?.qualityGate?.status === 'BLOCKED' || res.qualityGate?.status === 'BLOCKED';
  const status = isPass ? 'PASS' : (isBlocked ? 'BLOCKED' : 'FAIL');

  let exitCode = 0;
  if (status === 'BLOCKED') {
    exitCode = 2;
  } else if (status === 'FAIL') {
    exitCode = 1;
  } else {
    exitCode = 0;
  }

  return {
    success: isPass,
    status,
    command: 'baseline',
    timestamp: new Date().toISOString(),
    data: res.data || res,
    defects: [],
    exitCode,
    humanOutput: `Baseline capture ${status}: ${isPass ? 'app-baseline.json written' : 'quality gate ' + status.toLowerCase()}`
  };
}

module.exports = { execute };
