'use strict';

/**
 * src/cli/commands/inspect_app.js
 *
 * Handler for `ctc inspect-app <app-dir>`.
 */

const path = require('node:path');
const { runInspectApp } = require('../../baseline/inspect_app_runner');

async function execute(parsed) {
  const appDir = parsed._[0] || parsed.flags.appDir || parsed.flags['app-dir'] || '.';
  const resolvedAppDir = path.resolve(process.cwd(), appDir);

  const res = await runInspectApp({
    project: resolvedAppDir,
    module: parsed.flags.module || 'app',
    output: parsed.flags.output
  });

  return {
    success: res.success,
    status: res.success ? 'PASS' : 'FAIL',
    command: 'inspect-app',
    timestamp: new Date().toISOString(),
    data: res.data || res,
    defects: [],
    exitCode: res.success ? 0 : 1,
    humanOutput: `Existing app model generated with ${res.data?.model?.screens?.length || 0} screen(s)`
  };
}

module.exports = { execute };
